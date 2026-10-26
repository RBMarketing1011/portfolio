/**
 * The facts gate (section 10.6). Every number, year, price, rating, response time and
 * credential on an AI-built page has to trace back to something the owner said: the
 * brief, the business details, the saved profile, the verified facts and the page
 * names (the corpus). `scanClaims` returns the claims in a piece of copy that the
 * corpus does not back, so the writer can repair them or cut them.
 *
 * Pure: the writer, the chrome normalizer and the proofs share it.
 */

/**
 * The claims the gate looks for. Two word boundaries sit where they can match: the unit
 * words of `number-with-unit` carry their own (written after the group, as `(\+|%|…)\b`,
 * it could never match "2,000+" or "50%" before a space or at the end of a sentence), and
 * "#1" has only a trailing one (a `\b` before `#` never matches after a space), because
 * `+`, `%` and `#` are not word characters.
 */
export const CLAIM_PATTERNS: { kind: string; re: RegExp }[] = [
	{ kind: 'number-with-unit', re: /\b\d[\d,.]*\s*(?:\+|%|(?:percent|years?|yrs|customers?|clients?|homes?|roofs?|projects?|jobs?|reviews?|stars?|hours?|hrs|minutes?|mins|days?|miles?|locations?|technicians?|experts?)\b)/gi },
	{ kind: 'money', re: /(\$|€|£)\s?\d[\d,.]*|\b\d[\d,.]*\s?(dollars|usd)\b/gi },
	{ kind: 'rating', re: /\b\d(\.\d)?\s*(\/|out of)\s*5\b|\b\d(\.\d)?[- ]stars?\b|\bfive[- ]star\b/gi },
	{ kind: 'year', re: /\b(19|20)\d{2}\b/g },
	{ kind: 'availability', re: /\b24\s*\/\s*7\b|\bsame[- ]day\b|\bnext[- ]day\b|\bwithin \d+\s*(hours?|minutes?|days?)\b/gi },
	{ kind: 'credential', re: /\b(licen[cs]ed|insured|bonded|certified|accredited|award[- ]winning|guarantee[ds]?|warrant(y|ies)|number one|best in|top[- ]rated|family[- ]owned|locally owned)\b|#\s?1\b/gi },
	{ kind: 'phone', re: /\(?\+?\d[\d\s().-]{7,}\d/g },
]

// Built with RegExp() so the Unicode property escapes do not depend on the TS target.
const NOT_WORD = new RegExp('[^\\p{L}\\p{N}]+', 'gu')
const COMBINING = new RegExp('\\p{M}+', 'gu')
const HAS_WORD = new RegExp('[\\p{L}\\p{N}]', 'u')
// "7am" is "7 am", so its number is a word of its own on both sides of the comparison.
const DIGIT_LETTER = new RegExp('(\\d)(?=\\p{L})|(\\p{L})(?=\\d)', 'gu')

/**
 * Number words an owner writes where copy may use digits: "three days ahead" backs
 * "3 days". "one" is left out: it is too common a word to back a claim.
 */
const NUMBER_WORDS: Record<string, string> = {
	two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
	eleven: '11', twelve: '12', fifteen: '15', twenty: '20', thirty: '30', forty: '40', fifty: '50',
}
const NUMBER_WORD = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'g')

/**
 * Lowercase, accents and apostrophes dropped, thousands and decimal separators joined
 * ("2,000" and "2000" read the same), every other run of punctuation and whitespace one
 * space. Claims and the corpus go through the same function, so they compare like for like.
 */
export function normalizeForMatch(text: string): string {
	return String(text ?? '')
		.normalize('NFKD')
		.replace(COMBINING, '')
		.toLowerCase()
		.replace(/['’`]/g, '')
		.replace(/(\d)[,.  ](?=\d)/g, '$1')
		.replace(DIGIT_LETTER, '$1$2 ')
		.replace(NUMBER_WORD, (word) => NUMBER_WORDS[word])
		.replace(NOT_WORD, ' ')
		.trim()
}

/**
 * The word claims whose backing is a keyword rather than the exact words (section 10.9):
 * an owner who wrote "fully licensed and insured" backs "Licensed" and "Insured".
 */
const KEYWORD_BACKING: { claim: RegExp; corpus: RegExp }[] = [
	{ claim: /^licen[cs]ed$/, corpus: /licen[cs]/ },
	{ claim: /^insured$/, corpus: /insur/ },
	{ claim: /^(guarantee[ds]?|warranty|warranties)$/, corpus: /guarant|warrant/ },
	{ claim: /^award winning$/, corpus: /award/ },
	{ claim: /^family owned$/, corpus: /family/ },
	{ claim: /^locally owned$/, corpus: /local/ },
	{ claim: /^24 7$/, corpus: /\b24 7\b|around the clock/ },
	{ claim: /^same day$/, corpus: /same day/ },
]

const NUMBER = /\d+/g

/** "Number one" claims normalize to a bare "1", which almost any corpus contains, so they are read raw. */
const NUMBER_ONE = /^(#\s?1|number one)$/i

export type ClaimExemptions = {
	/** Item counts of the section the copy sits in: "3 steps" in a three-step process. */
	counts?: number[]
}

/** True for a language tag or name that is English ("en", "en-US", "English"), or no tag at all. */
export const isEnglish = (language: string | undefined) => !language || /^(en|english)(\b|[-_])/i.test(language.trim())

/**
 * The claims in `text` that the owner never stated. A claim passes when its normalized
 * text occurs in the normalized corpus, or, when it holds numbers, when every number in
 * it does (or equals one of the section's item counts). A site written in another language
 * than English also gets a language-neutral rule, because the word patterns are English:
 * every number in the copy must occur in the corpus.
 */
export function scanClaims(
	text: string,
	corpus: string,
	exemptions: ClaimExemptions = {},
	options: { language?: string } = {},
): string[] {
	const source = String(text ?? '')
	if (!HAS_WORD.test(source)) return []

	const haystack = ` ${normalizeForMatch(corpus)} `
	const tokens = new Set(haystack.split(' ').filter(Boolean))
	// Digits with the spaces between groups removed, for phone numbers written another way.
	const digitStream = haystack.replace(/(\d) (?=\d)/g, '$1')
	const exempt = new Set(
		(exemptions.counts ?? []).filter((count) => Number.isFinite(count)).map((count) => String(Math.trunc(count))),
	)
	const rawCorpus = String(corpus ?? '').toLowerCase()

	const numberBacked = (value: string) => exempt.has(value) || tokens.has(value)
	const phoneBacked = (match: string) => {
		const digits = match.replace(/\D/g, '')
		if (digits.length < 7) return true
		if (digitStream.includes(digits)) return true
		// A country code the owner left out: +1 512 555 0142 is the owner's (512) 555-0142.
		return digits.length === 11 && digits.startsWith('1') && digitStream.includes(digits.slice(1))
	}

	const backed = (kind: string, match: string) => {
		if (kind === 'phone') return phoneBacked(match)
		if (kind === 'credential' && NUMBER_ONE.test(match.trim())) return /#\s?1\b|number one|no\.\s?1\b/.test(rawCorpus)
		const normalized = normalizeForMatch(match)
		if (!normalized) return true
		if (haystack.includes(` ${normalized} `)) return true
		const keyword = KEYWORD_BACKING.find((rule) => rule.claim.test(normalized))
		if (keyword) return keyword.corpus.test(haystack)
		const numbers = normalized.match(NUMBER)
		return Boolean(numbers && numbers.length) && numbers!.every(numberBacked)
	}

	// Claims by position: "within 2 hours" and the "2 hours" inside it are one claim, the longer.
	type Span = { start: number; end: number; text: string }
	const found: Span[] = []
	const inside = (span: Span, outer: Span) => span.start >= outer.start && span.end <= outer.end
	const add = (span: Span) => {
		if (!span.text.trim() || found.some((other) => inside(span, other))) return
		for (let i = found.length - 1; i >= 0; i--) if (inside(found[i], span)) found.splice(i, 1)
		found.push(span)
	}
	const spanOf = (match: RegExpMatchArray): Span => {
		const start = match.index ?? 0
		return { start, end: start + match[0].length, text: match[0] }
	}

	// A phone-shaped run is judged as a phone; the numbers inside it are not claims again.
	const phone = CLAIM_PATTERNS.find((pattern) => pattern.kind === 'phone') as { re: RegExp }
	const phoneSpans = [...source.matchAll(phone.re)].map(spanOf)
	const inPhone = (span: Span) => phoneSpans.some((outer) => inside(span, outer))

	for (const { kind, re } of CLAIM_PATTERNS) {
		if (kind === 'phone') continue
		for (const match of source.matchAll(re)) {
			const span = spanOf(match)
			if (!inPhone(span) && !backed(kind, span.text)) add(span)
		}
	}
	for (const span of phoneSpans) if (!phoneBacked(span.text)) add(span)

	if (!isEnglish(options.language)) {
		for (const match of source.matchAll(/\d[\d,.  ]*\d|\d/g)) {
			const span = spanOf(match)
			if (inPhone(span) && phoneBacked(phoneSpans.find((outer) => inside(span, outer))!.text)) continue
			const value = normalizeForMatch(span.text)
			if (value && !value.split(' ').every(numberBacked)) add(span)
		}
	}

	const seen = new Set<string>()
	return found
		.sort((a, b) => a.start - b.start)
		// "$199." is the claim "$199": a separator the number pattern swallowed at the end is the sentence's.
		.map((span) => span.text.trim().replace(/[.,]+$/, ''))
		.filter((claim) => {
			const key = claim.toLowerCase()
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
}
