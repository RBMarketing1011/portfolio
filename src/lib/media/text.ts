/**
 * Text normalisation shared by indexing, querying and tagging. Index time and
 * query time must run the same functions, or a word indexed one way is searched
 * for another and silently never matches. Pure and client safe.
 *
 * Everything here is UNICODE aware (`\p{L}\p{N}`), not ASCII-only: a library for
 * businesses everywhere holds names like "Фото", "日本" or "Café". Only `stem` is
 * English and only touches a-z; every other script passes through as plain words.
 *
 * Every function accepts anything and never throws: values read back from a
 * database or a request body are not guaranteed to be strings.
 */
import { MEDIA_LIMITS } from './types'

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Function words only: articles, prepositions, pronouns, auxiliaries, conjunctions.
 * Deliberately NOT here, because they carry meaning in image search: before, after,
 * new, top, over, under, up, down, out, off, front, back, side, inside, outside,
 * above, below, near, no, not. `can` and `may` are left out too: a paint can and the
 * month of May are things a person searches for.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
	// articles and determiners
	'a',
	'an',
	'the',
	'this',
	'that',
	'these',
	'those',
	'some',
	'any',
	'each',
	'every',
	'all',
	'both',
	// pronouns
	'i',
	'me',
	'my',
	'mine',
	'myself',
	'we',
	'us',
	'our',
	'ours',
	'ourselves',
	'you',
	'your',
	'yours',
	'yourself',
	'he',
	'him',
	'his',
	'himself',
	'she',
	'her',
	'hers',
	'herself',
	'it',
	'its',
	'itself',
	'they',
	'them',
	'their',
	'theirs',
	'themselves',
	'who',
	'whom',
	'whose',
	'which',
	'what',
	'there',
	// prepositions
	'of',
	'in',
	'on',
	'at',
	'by',
	'for',
	'with',
	'without',
	'to',
	'from',
	'into',
	'onto',
	'about',
	'as',
	'through',
	'during',
	'against',
	'among',
	'between',
	'within',
	'upon',
	'per',
	'via',
	'toward',
	'towards',
	// auxiliaries
	'is',
	'am',
	'are',
	'was',
	'were',
	'be',
	'been',
	'being',
	'do',
	'does',
	'did',
	'doing',
	'have',
	'has',
	'had',
	'having',
	'will',
	'would',
	'shall',
	'should',
	'could',
	'might',
	'must',
	// conjunctions
	'and',
	'or',
	'but',
	'nor',
	'so',
	'if',
	'than',
	'then',
	'because',
	'while',
	'although',
	'though',
	'unless',
	'until',
	'whereas',
	'whether',
])

/* -------------------------------------------------------------------------- */
/* Folding                                                                    */
/* -------------------------------------------------------------------------- */

// Letters that NFKD leaves whole. The capitals are title-cased ("Ae", not "AE") so
// camelCase detection still sees one capital, not two.
const FOLD: Record<string, string> = {
	ø: 'o',
	Ø: 'O',
	ß: 'ss',
	ẞ: 'Ss',
	æ: 'ae',
	Æ: 'Ae',
	œ: 'oe',
	Œ: 'Oe',
	đ: 'd',
	Đ: 'D',
	ł: 'l',
	Ł: 'L',
	þ: 'th',
	Þ: 'Th',
}
const FOLD_RE = /[øØßẞæÆœŒđĐłŁþÞ]/g

/** NFKD, marks stripped, the fold table applied, `&` read as "and". Case kept. */
function fold(input: string): string {
	return input
		.normalize('NFKD')
		.replace(/\p{M}+/gu, '')
		.replace(FOLD_RE, (letter) => FOLD[letter] ?? letter)
		.replace(/&/g, ' and ')
}

/**
 * The shared folding step: NFKD, combining marks stripped, lowercased, a small fold
 * table for letters that do not decompose (ø->o, ß->ss, æ->ae, œ->oe, đ->d, ł->l,
 * þ->th), `&` read as " and ", every run of anything that is not a Unicode letter
 * or number collapsed to one space, trimmed. `Café_Menu--2` -> `cafe menu 2`;
 * `日本 Фото` stays two words. Folder keys, slugs and index tokens all start here.
 */
export function normalizeText(input: string): string {
	return fold(str(input))
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
}

// Boundaries inside one alphanumeric run. Lookaheads, so adjacent boundaries
// ("aBC1") are all found instead of the first match eating the next one's anchor.
const CASE_BOUNDARY = /(\p{Ll})(?=\p{Lu})/gu
const ACRONYM_BOUNDARY = /(\p{Lu})(?=\p{Lu}\p{Ll})/gu
const LETTER_DIGIT = /(\p{L})(?=\p{N})/gu
const DIGIT_LETTER = /(\p{N})(?=\p{L})/gu

/** Folded text, case kept, as separate alphanumeric runs. */
function runsOf(input: string): string[] {
	return fold(input)
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.split(' ')
		.filter(Boolean)
}

/** One run's words, lowercased: split on case change, acronym end and letter/digit. */
function wordsOfRun(run: string): string[] {
	return run
		.replace(CASE_BOUNDARY, '$1 ')
		.replace(ACRONYM_BOUNDARY, '$1 ')
		.replace(LETTER_DIGIT, '$1 ')
		.replace(DIGIT_LETTER, '$1 ')
		.toLowerCase()
		.split(' ')
		.filter(Boolean)
}

/**
 * Words, lowercased. Unlike `normalizeText` this first splits camelCase and
 * letter/digit boundaries, so a file name reads as words: `kitchenRemodel_final-2`
 * -> [kitchen, remodel, final, 2]; `IMG2034` -> [img, 2034]. Stopwords are kept.
 */
export function splitWords(input: string): string[] {
	return runsOf(str(input)).flatMap(wordsOfRun)
}

/**
 * A tag's identity: `normalizeText` with dashes for spaces, at most 60 chars, no
 * leading or trailing dash. `Kitchen Remodel!` -> `kitchen-remodel`. Non-Latin
 * letters are kept (`日本` -> `日本`). Returns an empty string only when no letter or
 * digit survives (`!!!`), which callers must treat as invalid.
 */
export function slugify(label: string): string {
	const dashed = normalizeText(label).replace(/ /g, '-')
	// By code point, so a letter outside the BMP is never cut in half.
	const cut = dashed.length > 60 ? Array.from(dashed).slice(0, 60).join('') : dashed
	return cut.replace(/^-+|-+$/g, '')
}

// Invisible characters that let two different strings look identical, or reorder
// the text around them: C0/C1 controls, zero-width space, word joiner, byte order
// mark and the bidirectional overrides. Joiners (ZWJ, ZWNJ) are kept: emoji
// sequences and several scripts need them.
const INVISIBLE = /[\p{Cc}​⁠﻿‪-‮⁦-⁩]/gu

/** Cut to `max` code points, never through a surrogate pair. */
function cutTo(text: string, max: number): string {
	if (!(max > 0)) return ''
	if (text.length <= max) return text
	let count = 0
	let end = 0
	for (const char of text) {
		if (count === max) break
		count += 1
		end += char.length
	}
	return text.slice(0, end)
}

/** Trim, collapse whitespace, strip control characters, cut to `max` characters. */
export function clampText(input: string, max: number): string {
	const cleaned = str(input)
		.replace(/\s+/g, ' ')
		.replace(INVISIBLE, '')
		.replace(/ {2,}/g, ' ')
		.trim()
	return cutTo(cleaned, typeof max === 'number' ? Math.floor(max) : 0).trimEnd()
}

/**
 * A label as a person typed it, made safe to store and show: control characters
 * removed, whitespace collapsed and trimmed, clamped to MEDIA_LIMITS.tagLabelMax.
 * Case is preserved.
 */
export function cleanLabel(label: string): string {
	return clampText(label, MEDIA_LIMITS.tagLabelMax)
}

/* -------------------------------------------------------------------------- */
/* Porter stemmer                                                             */
/* -------------------------------------------------------------------------- */

/** True where the letter at each position is a consonant (y after a consonant is a vowel). */
function consonants(word: string): boolean[] {
	const flags: boolean[] = []
	for (let i = 0; i < word.length; i++) {
		const letter = word[i]
		if (letter === 'a' || letter === 'e' || letter === 'i' || letter === 'o' || letter === 'u')
			flags.push(false)
		else if (letter === 'y') flags.push(i === 0 ? true : !flags[i - 1])
		else flags.push(true)
	}
	return flags
}

/** Porter's measure m: the number of VC sequences in [C](VC)^m[V]. */
function measure(word: string): number {
	const flags = consonants(word)
	let m = 0
	for (let i = 1; i < flags.length; i++) if (flags[i] && !flags[i - 1]) m++
	return m
}

/** *v*: the stem contains a vowel. */
const hasVowel = (word: string) => consonants(word).includes(false)

/** *d: the stem ends in a double consonant. */
function endsDouble(word: string): boolean {
	const n = word.length
	if (n < 2 || word[n - 1] !== word[n - 2]) return false
	return consonants(word)[n - 1]
}

/** *o: the stem ends consonant-vowel-consonant, the last not w, x or y. */
function endsCvc(word: string): boolean {
	const n = word.length
	if (n < 3) return false
	const flags = consonants(word)
	return flags[n - 1] && !flags[n - 2] && flags[n - 3] && !'wxy'.includes(word[n - 1])
}

type Rule = readonly [suffix: string, replacement: string]

// Porter (1980), steps 2 to 4. Within a step the LONGEST suffix that matches is the
// only rule considered; if its condition fails the step leaves the word alone
// ("rational" matches ational, fails m>0 on "r", and is NOT retried as tional).
// Not the later "bli"/"logi" revisions: this is the original table.
const STEP2: Rule[] = [
	['ational', 'ate'],
	['tional', 'tion'],
	['enci', 'ence'],
	['anci', 'ance'],
	['izer', 'ize'],
	['abli', 'able'],
	['alli', 'al'],
	['entli', 'ent'],
	['eli', 'e'],
	['ousli', 'ous'],
	['ization', 'ize'],
	['ation', 'ate'],
	['ator', 'ate'],
	['alism', 'al'],
	['iveness', 'ive'],
	['fulness', 'ful'],
	['ousness', 'ous'],
	['aliti', 'al'],
	['iviti', 'ive'],
	['biliti', 'ble'],
]
const STEP3: Rule[] = [
	['icate', 'ic'],
	['ative', ''],
	['alize', 'al'],
	['iciti', 'ic'],
	['ical', 'ic'],
	['ful', ''],
	['ness', ''],
]
const STEP4: readonly string[] = [
	'al',
	'ance',
	'ence',
	'er',
	'ic',
	'able',
	'ible',
	'ant',
	'ement',
	'ment',
	'ent',
	'ion',
	'ou',
	'ism',
	'ate',
	'iti',
	'ous',
	'ive',
	'ize',
]

const byLength = (a: readonly [string, ...unknown[]], b: readonly [string, ...unknown[]]) =>
	b[0].length - a[0].length
const STEP2_SORTED = [...STEP2].sort(byLength)
const STEP3_SORTED = [...STEP3].sort(byLength)
const STEP4_SORTED = [...STEP4].sort((a, b) => b.length - a.length)

/** Longest-suffix rule application for steps 2 and 3 (condition m > 0). */
function applyRules(word: string, rules: Rule[]): string {
	for (const [suffix, replacement] of rules) {
		if (!word.endsWith(suffix)) continue
		const base = word.slice(0, word.length - suffix.length)
		return measure(base) > 0 ? base + replacement : word
	}
	return word
}

const A_Z = /^[a-z]+$/

/**
 * The Porter (1980) stemmer, on a lowercase a-z word. Anything that is not purely
 * a-z (digits, mixed, other scripts) or is two characters or fewer is returned
 * unchanged. `trucks` -> `truck`, `painting` -> `paint`, `remodeling` -> `remodel`.
 */
export function stem(word: string): string {
	if (typeof word !== 'string' || word.length <= 2 || !A_Z.test(word)) return word
	let w = word

	// Step 1a
	if (w.endsWith('sses')) w = w.slice(0, -2)
	else if (w.endsWith('ies')) w = w.slice(0, -2)
	else if (w.endsWith('ss')) {
		// unchanged
	} else if (w.endsWith('s')) w = w.slice(0, -1)

	// Step 1b
	let trimmed = false
	if (w.endsWith('eed')) {
		if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1)
	} else if (w.endsWith('ed') && hasVowel(w.slice(0, -2))) {
		w = w.slice(0, -2)
		trimmed = true
	} else if (w.endsWith('ing') && hasVowel(w.slice(0, -3))) {
		w = w.slice(0, -3)
		trimmed = true
	}
	if (trimmed) {
		if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e'
		else if (endsDouble(w) && !'lsz'.includes(w[w.length - 1])) w = w.slice(0, -1)
		else if (measure(w) === 1 && endsCvc(w)) w += 'e'
	}

	// Step 1c
	if (w.endsWith('y') && hasVowel(w.slice(0, -1))) w = `${w.slice(0, -1)}i`

	// Steps 2 and 3
	w = applyRules(w, STEP2_SORTED)
	w = applyRules(w, STEP3_SORTED)

	// Step 4 (m > 1)
	for (const suffix of STEP4_SORTED) {
		if (!w.endsWith(suffix)) continue
		const base = w.slice(0, w.length - suffix.length)
		const last = base[base.length - 1]
		const allowed = suffix === 'ion' ? last === 's' || last === 't' : true
		if (allowed && measure(base) > 1) w = base
		break
	}

	// Step 5a
	if (w.endsWith('e')) {
		const base = w.slice(0, -1)
		const m = measure(base)
		if (m > 1 || (m === 1 && !endsCvc(base))) w = base
	}
	// Step 5b
	if (w.endsWith('ll') && measure(w) > 1) w = w.slice(0, -1)

	return w
}

/* -------------------------------------------------------------------------- */
/* Index tokens                                                               */
/* -------------------------------------------------------------------------- */

export type IndexTokenSets = {
	/** Every token, first-seen order: what `indexTokens` returns. */
	tokens: string[]
	/** Words as written, plus the joined runs. No stopwords. */
	surface: string[]
	/** `stem(word)` for each written word (not for the joined runs). */
	stems: string[]
}

const RUN_MIN = 2
const RUN_MAX = 64
const codePoints = (text: string) => (text.length > 2 * RUN_MAX ? Infinity : Array.from(text).length)

/**
 * `indexTokens`, with the written words and the stems told apart. The scorer needs
 * that to separate an exact word match from a stem-only one (`siding` and `side`
 * share a stem but are not the same word). `surface` plus `stems` is exactly the
 * token set `indexTokens` returns.
 */
export function indexTokenSets(input: string): IndexTokenSets {
	const tokens = new Set<string>()
	const surface = new Set<string>()
	const stems = new Set<string>()
	const addSurface = (token: string) => {
		surface.add(token)
		tokens.add(token)
	}

	for (const run of runsOf(str(input))) {
		for (const word of wordsOfRun(run)) {
			if (STOPWORDS.has(word)) continue
			addSurface(word)
			const root = stem(word)
			stems.add(root)
			tokens.add(root)
		}

		const size = codePoints(run)
		if (size < RUN_MIN || size > RUN_MAX) continue
		// The whole run and its letters-only / digits-only pieces, so `iphone` finds
		// `iPhone15` and `leadsnearme` finds `LeadsNearMe`. A run that is itself a
		// stopword ("the") adds nothing: it is the word that was just skipped.
		const whole = run.toLowerCase()
		if (!STOPWORDS.has(whole)) addSurface(whole)
		for (const piece of run.match(/\p{L}+|\p{N}+/gu) ?? []) {
			const lower = piece.toLowerCase()
			if (!STOPWORDS.has(lower)) addSurface(lower)
		}
	}
	return { tokens: [...tokens], surface: [...surface], stems: [...stems] }
}

/**
 * The index form of a piece of text, deduplicated, in first-seen order, built
 * from `splitWords` (so camelCase and digit boundaries split):
 *
 *  - every non-stopword word, as itself AND as its stem;
 *  - for every alphanumeric run of 2 to 64 characters (a maximal stretch between
 *    non-letter/number characters), the WHOLE run lowercased, and each
 *    letters-only or digits-only sub-run joined across camelCase boundaries. So
 *    `iPhone15` also yields `iphone15` and `iphone`, `LeadsNearMe` also yields
 *    `leadsnearme`, and `4K` yields `4k`. A whole run is kept even when its parts
 *    are stopwords or single characters, so `h2o` and `tv` survive.
 *
 * Query words are tokenised with the same function, so `iphone`, `iPhone` and
 * `IPHONE` all resolve to the same token. `Kitchen remodeling` ->
 * [kitchen, remodeling, remodel].
 */
export function indexTokens(input: string): string[] {
	return indexTokenSets(input).tokens
}

/** Escapes a string for use inside a RegExp, and so inside Mongo's `$regex`. */
export function escapeRegex(input: string): string {
	// A raw NUL makes Mongo reject the whole pattern; its escape means the same thing.
	return str(input)
		.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		.replace(/\0/g, '\\x00')
}
