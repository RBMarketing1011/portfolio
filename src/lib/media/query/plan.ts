/**
 * AST -> an executable plan: a Mongo prefilter plus an exact in-memory evaluator
 * that also ranks. Pure (the caller supplies the folder index, the tag redirects
 * and, for the typo pass, the vocabulary).
 *
 * THE CENTRAL INVARIANT: for any query and any set of documents,
 *
 *     { docs d : d matches plan.prefilter in Mongo AND plan.evaluate(d) != null }
 *   = { docs d : plan.evaluate(d) != null }
 *
 * i.e. the prefilter may only ever be a SUPERSET. It exists to avoid loading the
 * whole library, never to decide an outcome. When `needsEvaluation` is false the
 * query has no text in it and the prefilter must itself be exact. Where a node's
 * prefilter cannot be made tight, make it looser, never wrong.
 *
 * DECISIONS THE SPEC LEAVES OPEN (each one is a reading, not a guess; see the proof):
 *  - A phrase clause scores like one term that matched exactly in its best field,
 *    plus the +6; its words are not scored one by one.
 *  - `or` scores the SUM of the alternatives that matched, so a document matching
 *    both sides of `kitchen OR bath` outranks one matching a side.
 *  - The "final bare word" for `prefixLast` is the term that starts last in the
 *    query. If it is negated, nothing becomes a prefix.
 *  - A term that matches a folder name is "known": it is never fuzzed, and it is not
 *    in `fuzzyEligible` (the vocabulary holds no folder names).
 *  - Only positive free-text words are fuzzed or listed in `fuzzyEligible`, and only
 *    words made of letters (a number or `iphone15` is an identifier, not a typo).
 *  - A stopword word that is an ordinary term (the parser keeps one only when the
 *    query would otherwise be empty) is index-only like any term, so it matches
 *    nothing: the index never holds stopwords. Quote it, or use `name:`.
 *  - With a vocabulary, `fuzzyEligible` holds the words that matched nothing AND have
 *    at least one candidate: "a fuzzy second pass can still help".
 *  - name:/caption:/text: values mean "every word is in that field", not a phrase, so
 *    `caption:"for sale"` is `caption:sale` (the stopword is ignored because another word
 *    remains); only a value made entirely of stopwords is matched as consecutive text.
 *  - A tag prefix (`tag:k*`) is as short as it was written and is not redirected: a prefix
 *    is not a tag's identity.
 *  - An automatic tag whose confidence is missing or corrupt reads as the stored minimum
 *    (0.6), so a bad row can never outrank a good one by lying about itself.
 *  - A phrase also needs each of its non-stopword words among the field's index tokens.
 *    That only matters for a word inside a run longer than the index keeps whole, which
 *    the prefilter could never find: the two sides must agree, so neither matches it.
 *  - A tree the parser could not have made (a hole, an unknown node, field or operator,
 *    nesting past twice the parser's limit) matches nothing. It never throws and it
 *    never matches everything.
 */
import { ObjectId } from 'mongodb'
import { folderKey } from '../folder-index'
import type { FolderIndex } from '../folder-index'
import { escapeRegex, indexTokenSets, normalizeText, stem, STOPWORDS } from '../text'
import { FIELD_LABELS, fieldTexts, fieldTokens } from '../terms'
import type { FieldKey } from '../terms'
import { MEDIA_LIMITS, MEDIA_TYPE_BY_FORMAT } from '../types'
import { fuzzyCandidates, inVocabulary } from './fuzzy'
import type {
	EvaluableDoc,
	FieldNode,
	MatchResult,
	ParsedQuery,
	PlanContext,
	QueryNode,
	SearchPlan,
} from './types'

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** How much a hit in each field is worth. */
const WEIGHTS: Record<FieldKey, number> = {
	tag: 10,
	'auto-tag': 7,
	name: 6,
	'filename-tag': 4,
	caption: 3,
	text: 3,
	notes: 3,
	color: 3,
	look: 3,
	keyword: 2,
}
const FOLDER_WEIGHT = 2
/** Vision tags are stored at 0.6 or better, so a missing confidence reads as that. */
const AUTO_BASE = 0.6
const AUTO_SPREAD = 0.4

const EXACT = 1
const STEM = 0.75
const PREFIX = 0.7
const FUZZY = 0.5

const PHRASE_BONUS = 6
const SAME_FIELD_BONUS = 2

/** A term never expands to more than this many alternatives in a filter. */
const MAX_ALTERNATIVES = 40
/** A word needs this many characters to be a prefix; a folder-name prefix needs one more. */
const PREFIX_MIN = 2
const FOLDER_PREFIX_MIN = 3
/** Typo candidates per word, and the shortest word that may be fuzzed. */
const FUZZY_LIMIT = 3
const FUZZY_MIN = 4
const MAX_HOPS = 5
/**
 * The parser stops at MEDIA_LIMITS.queryMaxDepth; this only guards a hand-built tree.
 * A NOT adds two BSON levels ($nor and its array), so twice the parser's limit keeps a
 * filter around 36 levels, well under Mongo's 50.
 */
const MAX_DEPTH = MEDIA_LIMITS.queryMaxDepth * 2

/**
 * Strongest first, so a tie between two fields goes to the more important one. The
 * index is the field's bit in a match mask, and `folder` is a pseudo-field.
 */
const SLOTS: readonly (FieldKey | 'folder')[] = [
	'tag',
	'auto-tag',
	'name',
	'filename-tag',
	'caption',
	'text',
	'notes',
	'color',
	'look',
	'keyword',
	'folder',
]
const FOLDER_SLOT = SLOTS.length - 1
const slotOf = (key: FieldKey | 'folder'): number => SLOTS.indexOf(key)
const SLOT_LABELS: readonly string[] = SLOTS.map((key) => (key === 'folder' ? 'folder' : FIELD_LABELS[key]))

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

type Filter = Record<string, unknown>
type Correction = { from: string; to: string }

const LETTERS = /^\p{L}+$/u
const HEX = /^[0-9a-f]{24}$/i

const hasOwn = (target: object, key: string): boolean => Object.prototype.hasOwnProperty.call(target, key)
const lengthOf = (text: string): number => Array.from(text).length
const unique = <T>(list: readonly T[]): T[] => [...new Set(list)]
const round = (value: number): number => Math.round(value * 10_000) / 10_000
const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Words as the parser writes them: lowercase, folded, one space between. */
const wordsOf = (text: unknown): string[] => {
	const normal = normalizeText(asText(text))
	return normal ? normal.split(' ') : []
}

/* -------------------------------------------------------------------------- */
/* Filter combinators                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A clause that matches nothing. Mongo accepts `$in: []` and rejects an empty
 * `$or` / `$and` / `$nor`, so "nothing" is always spelled this way.
 */
const never = (): Filter => ({ _id: { $in: [] } })

/** The children of a filter that is nothing but `{ $and: [...] }` (or `$or`), else null. */
function soleList(filter: Filter, key: '$and' | '$or'): Filter[] | null {
	const keys = Object.keys(filter)
	return keys.length === 1 && keys[0] === key && Array.isArray(filter[key])
		? (filter[key] as Filter[])
		: null
}

/** AND. Null children are TRUE and vanish; nothing left is TRUE; nested $and is flattened. */
function andOf(parts: readonly (Filter | null)[]): Filter | null {
	const flat: Filter[] = []
	for (const part of parts) {
		if (!part) continue
		const inner = soleList(part, '$and')
		if (inner) flat.push(...inner)
		else flat.push(part)
	}
	if (flat.length === 0) return null
	return flat.length === 1 ? flat[0] : { $and: flat }
}

/**
 * OR. TRUE or anything is TRUE, so ONE null child makes the whole node null: dropping
 * it would turn `kitchen OR -blue` into `kitchen`. Nested $or is flattened.
 */
function orOf(parts: readonly (Filter | null)[]): Filter | null {
	if (parts.length === 0) return never()
	const flat: Filter[] = []
	for (const part of parts) {
		if (!part) return null
		const inner = soleList(part, '$or')
		if (inner) flat.push(...inner)
		else flat.push(part)
	}
	return flat.length === 1 ? flat[0] : { $or: flat }
}

/** NOT over a fully structured child, which is exact. `$nor` of an $or is just its children. */
function norOf(child: Filter | null): Filter {
	if (!child) return never()
	const inner = soleList(child, '$or')
	return { $nor: inner ?? [child] }
}

/** Hex strings to ObjectIds, in a stable order. Anything that is not an id cannot be a stored `folderId`. */
const hexIds = (ids: Iterable<string>): string[] => [...new Set(ids)].filter((id) => HEX.test(id)).sort()
const objectIds = (ids: readonly string[]): ObjectId[] => ids.map((id) => new ObjectId(id))

/* -------------------------------------------------------------------------- */
/* A document, read once                                                      */
/* -------------------------------------------------------------------------- */

/** One scored clause: its score, the field that won it, and every field it matched in (a bit mask). */
type Unit = { score: number; slot: number; mask: number }
type Hit = readonly Unit[]
/** A match that earns nothing, which is what every structured clause returns. */
const NONE: Hit = Object.freeze([])

/** One field of one document, as the matchers see it. An automatic tag is a view of its own. */
type View = {
	slot: number
	weight: number
	surface: ReadonlySet<string>
	stems: ReadonlySet<string>
	/** The raw strings, for phrases. Empty unless the plan needs them. */
	texts: readonly string[]
	/** `texts` as normalised words, built on first use. */
	words: string[][] | null
}

type Env = {
	doc: EvaluableDoc
	folderId: string | null
	views: View[] | null
}

type TokenSets = { surface: Set<string>; stems: Set<string> }

const tokenSetsOf = (text: string): TokenSets => {
	const sets = indexTokenSets(text)
	return { surface: new Set(sets.surface), stems: new Set(sets.stems) }
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * Automatic tags one by one: each carries its own confidence, so the union of them
 * that `fieldTokens` gives cannot say how much a match is worth. The split into
 * manual, file-name and automatic is the one `fieldTexts` makes.
 */
function autoViews(doc: EvaluableDoc): View[] {
	const out: View[] = []
	const slot = slotOf('auto-tag')
	for (const tag of Array.isArray(doc.tags) ? doc.tags : []) {
		if (!tag || typeof tag !== 'object' || tag.source === 'manual' || tag.via === 'filename') continue
		const label = asText(tag.label)
		if (!label.trim()) continue
		const confidence =
			typeof tag.confidence === 'number' && Number.isFinite(tag.confidence)
				? clamp01(tag.confidence)
				: MEDIA_LIMITS.autoTagMinConfidence
		const sets = tokenSetsOf(label)
		out.push({
			slot,
			weight: WEIGHTS['auto-tag'] * (AUTO_BASE + AUTO_SPREAD * confidence),
			surface: sets.surface,
			stems: sets.stems,
			texts: [label],
			words: null,
		})
	}
	return out
}

const NO_TEXTS: readonly string[] = Object.freeze([])

function buildViews(doc: EvaluableDoc, withTexts: boolean): View[] {
	const tokens = fieldTokens(doc)
	const texts = withTexts ? fieldTexts(doc) : null
	const views: View[] = []
	for (let slot = 0; slot < FOLDER_SLOT; slot++) {
		const key = SLOTS[slot] as FieldKey
		if (key === 'auto-tag') {
			views.push(...autoViews(doc))
			continue
		}
		const set = tokens[key]
		const own = texts ? texts[key] : NO_TEXTS
		// A name that is only stopwords has no tokens but its text can still match a phrase.
		if (set.surface.size === 0 && set.stems.size === 0 && own.length === 0) continue
		views.push({ slot, weight: WEIGHTS[key], surface: set.surface, stems: set.stems, texts: own, words: null })
	}
	return views
}

/* -------------------------------------------------------------------------- */
/* Matching primitives                                                        */
/* -------------------------------------------------------------------------- */

/** A word as the evaluator tests it, with everything decided at compile time. */
type WordSpec = {
	word: string
	stemmed: string
	/** Any surface token starting with the word matches. Already length-checked. */
	prefix: boolean
	/** Vocabulary words standing in for a word that matched nothing. */
	fuzzy: readonly string[]
}

/**
 * How well a word matches one field's tokens: exact (the word itself was written),
 * stem-only (only its stem was), prefix, fuzzy, or 0. `surface` and `stems` are what
 * `fieldTokens` hands out, so `siding` and `side` are told apart.
 */
function kindOf(spec: WordSpec, surface: ReadonlySet<string>, stems: ReadonlySet<string>): number {
	if (surface.has(spec.word)) return EXACT
	if (stems.has(spec.stemmed)) return STEM
	if (spec.prefix) {
		for (const token of surface) if (token.startsWith(spec.word)) return PREFIX
	}
	for (const candidate of spec.fuzzy) if (surface.has(candidate) || stems.has(candidate)) return FUZZY
	return 0
}

/** True when `needle` appears as consecutive words inside `haystack`. */
function hasRun(haystack: readonly string[], needle: readonly string[]): boolean {
	if (needle.length === 0 || needle.length > haystack.length) return false
	for (let start = 0; start + needle.length <= haystack.length; start++) {
		let at = 0
		while (at < needle.length && haystack[start + at] === needle[at]) at++
		if (at === needle.length) return true
	}
	return false
}

/** The view's strings as normalised words, built once per document. */
const wordLists = (view: View): string[][] => (view.words ??= view.texts.map(wordsOf))

/* -------------------------------------------------------------------------- */
/* Folder names                                                               */
/* -------------------------------------------------------------------------- */

/** Folders are rebuilt per request, so the index object itself is the cache key. */
const folderTokenCache = new WeakMap<FolderIndex, Map<string, TokenSets>>()

function folderTokens(folders: FolderIndex): Map<string, TokenSets> {
	let cached = folderTokenCache.get(folders)
	if (!cached) {
		cached = new Map()
		for (const node of folders.nodes.values()) cached.set(node.id, tokenSetsOf(asText(node.name)))
		folderTokenCache.set(folders, cached)
	}
	return cached
}

/**
 * The folders a word matches by NAME, each with its best match kind, and with the
 * whole subtree of a matching folder included: a photo in `Acme/Hero` is "in Acme".
 */
function folderKinds(folders: FolderIndex, spec: WordSpec): Map<string, number> | null {
	if (!(folders?.nodes instanceof Map) || folders.nodes.size === 0) return null
	let out: Map<string, number> | null = null
	for (const [id, sets] of folderTokens(folders)) {
		const kind = kindOf(spec, sets.surface, sets.stems)
		if (!kind) continue
		out ??= new Map()
		for (const below of folders.subtree(id)) if ((out.get(below) ?? 0) < kind) out.set(below, kind)
	}
	return out
}

/**
 * The prefilter clause for those folders. Past the cap it is "any filed asset", which
 * is wider and therefore safe; this clause only ever sits inside a text query.
 */
function folderAlternative(kinds: Map<string, number> | null): Filter | null {
	if (!kinds || kinds.size === 0) return null
	if (kinds.size > MAX_ALTERNATIVES) return { folderId: { $ne: null } }
	const ids = hexIds(kinds.keys())
	return ids.length ? { folderId: { $in: objectIds(ids) } } : null
}

/* -------------------------------------------------------------------------- */
/* Compiling: text                                                            */
/* -------------------------------------------------------------------------- */

type Build = {
	ctx: PlanContext
	folders: FolderIndex
	vocabulary: ReadonlyMap<string, number> | null
	/** The term that starts last in the query, when it is positive: the one `prefixLast` acts on. */
	finalTerm: QueryNode | null
	corrections: Correction[]
	eligible: string[]
	/** A phrase or a name:/caption:/text: clause needs the raw strings, not just the tokens. */
	needsTexts: boolean
}

type Compiled = {
	/** The prefilter, or null for "no restriction" (TRUE). */
	filter: Filter | null
	/** No text anywhere inside, so `filter` is exact and the clause earns no score. */
	structured: boolean
	/** A match (the scored clauses inside it) or null. */
	run: (env: Env) => Hit | null
}

type TermNode = Extract<QueryNode, { type: 'term' }>

const viewsOf = (env: Env, build: Build): View[] => (env.views ??= buildViews(env.doc, build.needsTexts))

/** A clause that is only a column test: its filter is exact and it earns nothing. */
const structured = (filter: Filter, test: (doc: EvaluableDoc) => boolean): Compiled => ({
	filter,
	structured: true,
	run: (env) => (test(env.doc) ? NONE : null),
})

/** A text clause that can match nothing (an empty phrase, an empty value). */
const nothing = (): Compiled => ({ filter: never(), structured: false, run: () => null })

/** One word's prefilter: its stem and itself (and stand-ins), a prefix regex, folders by name. */
function wordFilter(spec: WordSpec, folder: Filter | null): Filter {
	const parts: Filter[] = [
		{ terms: { $in: unique([spec.stemmed, spec.word, ...spec.fuzzy]).slice(0, MAX_ALTERNATIVES) } },
	]
	// Anchored and case-sensitive so the index can serve it; the word is always escaped.
	if (spec.prefix) parts.push({ terms: { $regex: `^${escapeRegex(spec.word)}` } })
	if (folder) parts.push(folder)
	return orOf(parts) as Filter
}

function compileTerm(node: TermNode, build: Build, positive: boolean): Compiled {
	const parts = wordsOf(node.text)
	if (parts.length === 0) return nothing()
	// One word by construction; a hand-built node with several is a phrase.
	if (parts.length > 1) return compilePhrase(parts.join(' '), false, build)

	const word = parts[0]
	const size = lengthOf(word)
	const wanted = node.prefix === true || (build.ctx.prefixLast === true && build.finalTerm === node)
	const prefix = wanted && size >= PREFIX_MIN
	const plain: WordSpec = { word, stemmed: stem(word), prefix, fuzzy: [] }
	let folders = folderKinds(build.folders, { ...plain, prefix: prefix && size >= FOLDER_PREFIX_MIN })

	let spec = plain
	// A word the folder tree knows is not a typo, and the vocabulary has no folder names to check it against.
	if (positive && !folders && size >= FUZZY_MIN && !STOPWORDS.has(word) && LETTERS.test(word)) {
		if (!build.vocabulary) build.eligible.push(word)
		else if (!inVocabulary(word, build.vocabulary, prefix)) {
			const found = fuzzyCandidates(word, build.vocabulary, FUZZY_LIMIT)
			if (found.length > 0) {
				build.eligible.push(word)
				build.corrections.push({ from: word, to: found[0] })
				// The word matched nothing, so it no longer needs to be a prefix.
				spec = { ...plain, prefix: false, fuzzy: found }
				folders = folderKinds(build.folders, spec)
			}
		}
	}

	return {
		filter: wordFilter(spec, folderAlternative(folders)),
		structured: false,
		run: (env) => {
			let best = 0
			let slot = 0
			let mask = 0
			// Views run strongest field first, so on a tie the more important field wins.
			for (const view of viewsOf(env, build)) {
				const kind = kindOf(spec, view.surface, view.stems)
				if (!kind) continue
				mask |= 1 << view.slot
				const score = view.weight * kind
				if (score > best) {
					best = score
					slot = view.slot
				}
			}
			if (folders && env.folderId !== null) {
				const kind = folders.get(env.folderId)
				if (kind) {
					mask |= 1 << FOLDER_SLOT
					const score = FOLDER_WEIGHT * kind
					if (score > best) {
						best = score
						slot = FOLDER_SLOT
					}
				}
			}
			return best > 0 ? [{ score: best, slot, mask }] : null
		},
	}
}

/**
 * A phrase is checked against the raw strings of ONE field (stopwords included), but
 * only if every non-stopword word is also an index token of that field. That second
 * test is what keeps the prefilter a superset in the one case the index cannot see:
 * a word inside a run longer than the index keeps whole.
 */
function compilePhrase(text: string, implicit: boolean, build: Build): Compiled {
	const words = wordsOf(text)
	if (words.length === 0) return nothing()
	build.needsTexts = true
	const content = unique(words.filter((word) => !STOPWORDS.has(word)))
	// `kitchen-remodel` also accepts the run `kitchenremodel` (a camelCase or joined file name).
	const joined = implicit && words.length > 1 ? words.join('') : null

	// Stopwords are never indexed, so they cannot be required of `terms`; an all-stopword phrase has no restriction.
	const all = andOf(content.map((word) => ({ terms: { $in: [word] } })))
	const filter = joined ? orOf([all, { terms: { $in: [joined] } }]) : all

	const matches = (view: View): boolean => {
		if (joined !== null && view.surface.has(joined)) return true
		for (const word of content) if (!view.surface.has(word)) return false
		return wordLists(view).some((list) => hasRun(list, words))
	}

	return {
		filter,
		structured: false,
		run: (env) => {
			let best = 0
			let slot = 0
			let mask = 0
			for (const view of viewsOf(env, build)) {
				if (!matches(view)) continue
				mask |= 1 << view.slot
				if (view.weight > best) {
					best = view.weight
					slot = view.slot
				}
			}
			return best > 0 ? [{ score: best + PHRASE_BONUS, slot, mask }] : null
		},
	}
}

type ValueSpec = {
	/** The words that must be present (non-stopwords, and a starred last word). */
	content: WordSpec[]
	/** All words are stopwords: they are matched as consecutive words of the field's text. */
	run: string[] | null
}

/**
 * `name:` `caption:` `text:`. Every word must be in THAT field. A stopword is not in
 * the index, so with other words present it is ignored, and a value of nothing but
 * stopwords (`name:the`, `name:"the who"`) is matched against the field's text.
 */
function compileTextField(node: FieldNode, build: Build): Compiled {
	const key = node.field as FieldKey
	const slot = slotOf(key)
	build.needsTexts = true
	const values: ValueSpec[] = []
	for (const raw of Array.isArray(node.values) ? node.values : []) {
		const words = wordsOf(raw)
		if (words.length === 0) continue
		const last = words.length - 1
		const starred = node.prefix === true && lengthOf(words[last]) >= PREFIX_MIN
		const content: WordSpec[] = []
		words.forEach((word, index) => {
			const prefix = index === last && starred
			if (STOPWORDS.has(word) && !prefix) return
			content.push({ word, stemmed: stem(word), prefix, fuzzy: [] })
		})
		values.push({ content, run: content.length === 0 ? words : null })
	}
	if (values.length === 0) return nothing()

	const filter = orOf(
		values.map((value) => (value.run ? null : andOf(value.content.map((spec) => wordFilter(spec, null))))),
	)

	return {
		filter,
		structured: false,
		run: (env) => {
			const view = viewsOf(env, build).find((one) => one.slot === slot)
			if (!view) return null
			let best = 0
			for (const value of values) {
				let score = 0
				if (value.run) {
					if (wordLists(view).some((list) => hasRun(list, value.run as string[]))) score = view.weight
				} else {
					for (const spec of value.content) {
						const kind = kindOf(spec, view.surface, view.stems)
						if (!kind) {
							score = 0
							break
						}
						score += view.weight * kind
					}
				}
				if (score > best) best = score
			}
			return best > 0 ? [{ score: best, slot, mask: 1 << slot }] : null
		},
	}
}

/* -------------------------------------------------------------------------- */
/* Compiling: structured fields (exact in Mongo, and exact here)              */
/* -------------------------------------------------------------------------- */

const isAuto = (tag: unknown): boolean =>
	!!tag && typeof tag === 'object' && (tag as { source?: unknown }).source === 'auto'

const tagList = (doc: EvaluableDoc): readonly unknown[] => (Array.isArray(doc.tags) ? doc.tags : [])

const slugsOf = (doc: EvaluableDoc): string[] =>
	tagList(doc).map((tag) => (tag && typeof tag === 'object' ? asText((tag as { slug?: unknown }).slug) : ''))

/** `old -> new`, rewritten to the end of the chain: at most MAX_HOPS hops, never around a circle. */
function followRedirects(slug: string, rules: ReadonlyMap<string, string> | undefined | null): string {
	if (!rules || typeof rules.get !== 'function') return slug
	let current = slug
	const seen = new Set([slug])
	for (let hop = 0; hop < MAX_HOPS; hop++) {
		const next = rules.get(current)
		if (typeof next !== 'string' || next === '' || seen.has(next)) break
		seen.add(next)
		current = next
	}
	return current
}

function compileTag(node: FieldNode, build: Build): Compiled {
	const values = unique((Array.isArray(node.values) ? node.values : []).map(asText).filter(Boolean))
	if (values.length === 0) return structured(never(), () => false)

	if (node.prefix === true) {
		// A prefix is not a tag's identity, so it is not redirected.
		const filter = orOf(values.map((value) => ({ 'tags.slug': { $regex: `^${escapeRegex(value)}` } })))
		return structured(filter as Filter, (doc) =>
			slugsOf(doc).some((slug) => values.some((value) => slug.startsWith(value))),
		)
	}

	const resolved = unique(
		values.map((value) => {
			const target = followRedirects(value, build.ctx.tagRedirects)
			if (target !== value) build.corrections.push({ from: `tag:${value}`, to: `tag:${target}` })
			return target
		}),
	)
	const wanted = new Set(resolved)
	return structured({ 'tags.slug': { $in: resolved } }, (doc) => slugsOf(doc).some((slug) => wanted.has(slug)))
}

/**
 * `folder:` values. A path wins, then an exact folder name, then a name prefix of 3 or
 * more characters; whatever matches brings its whole subtree. `unfiled` is the root.
 * A value that resolves to nothing contributes nothing, and all of them failing is a
 * clause that matches nothing, never one that is skipped.
 */
function compileFolder(node: FieldNode, build: Build): Compiled {
	const folders = build.folders
	const ids = new Set<string>()
	let unfiled = false
	for (const raw of Array.isArray(node.values) ? node.values : []) {
		const value = asText(raw)
		if (!value) continue
		if (value === 'unfiled') {
			unfiled = true
			continue
		}
		// No folder tree to resolve against: the value names nothing.
		if (!folders || typeof folders.findByPath !== 'function') continue
		let roots: string[] = []
		const byPath = folders.findByPath(value)
		if (byPath) roots = [byPath]
		else {
			roots = folders.findByName(value, 'exact')
			if (roots.length === 0 && lengthOf(folderKey(value)) >= FOLDER_PREFIX_MIN) {
				roots = folders.findByName(value, 'prefix')
			}
		}
		for (const root of roots) for (const id of folders.subtree(root)) ids.add(id)
	}
	const list = hexIds(ids)
	const members = new Set(list)
	if (list.length === 0) {
		return unfiled
			? structured({ folderId: null }, (doc) => doc.folderId == null)
			: structured(never(), () => false)
	}
	const filter: Filter = unfiled
		? { folderId: { $in: [null, ...objectIds(list)] } }
		: { folderId: { $in: objectIds(list) } }
	return structured(filter, (doc) =>
		doc.folderId == null ? unfiled : members.has(String(doc.folderId)),
	)
}

function compileType(node: FieldNode): Compiled {
	const types = unique(
		(Array.isArray(node.values) ? node.values : [])
			.map(asText)
			.filter((value) => hasOwn(MEDIA_TYPE_BY_FORMAT, value))
			.map((value) => MEDIA_TYPE_BY_FORMAT[value as keyof typeof MEDIA_TYPE_BY_FORMAT]),
	)
	if (types.length === 0) return structured(never(), () => false)
	const wanted = new Set<string>(types)
	return structured({ contentType: { $in: types } }, (doc) => wanted.has(doc.contentType))
}

function compileColor(node: FieldNode): Compiled {
	const names = unique((Array.isArray(node.values) ? node.values : []).map(asText).filter(Boolean))
	if (names.length === 0) return structured(never(), () => false)
	const wanted = new Set(names)
	return structured({ colorNames: { $in: names } }, (doc) =>
		Array.isArray(doc.colorNames) && doc.colorNames.some((name) => wanted.has(name)),
	)
}

/** Single-valued columns: any of the listed values. */
function compileColumn(node: FieldNode, column: 'orientation' | 'kind'): Compiled {
	const values = unique((Array.isArray(node.values) ? node.values : []).map(asText).filter(Boolean))
	if (values.length === 0) return structured(never(), () => false)
	const wanted = new Set(values)
	// One value is plain equality; a comma list is any-of.
	const filter: Filter = values.length === 1 ? { [column]: values[0] } : { [column]: { $in: values } }
	return structured(filter, (doc) => {
		const value = doc[column]
		return typeof value === 'string' && wanted.has(value)
	})
}

type IsRule = { filter: () => Filter; test: (doc: EvaluableDoc) => boolean }

/** Each `is:` flag as the Mongo filter and the identical in-memory test (exact when a field is missing, too). */
const IS_RULES: Record<string, IsRule> = {
	untagged: {
		filter: () => ({ tags: { $size: 0 } }),
		test: (doc) => Array.isArray(doc.tags) && doc.tags.length === 0,
	},
	tagged: {
		filter: () => ({ 'tags.0': { $exists: true } }),
		test: (doc) => Array.isArray(doc.tags) && doc.tags.length > 0,
	},
	unreviewed: {
		filter: () => ({ 'tags.source': 'auto' }),
		test: (doc) => tagList(doc).some(isAuto),
	},
	reviewed: {
		filter: () => ({ 'tags.0': { $exists: true }, 'tags.source': { $ne: 'auto' } }),
		test: (doc) => Array.isArray(doc.tags) && doc.tags.length > 0 && !doc.tags.some(isAuto),
	},
	unfiled: { filter: () => ({ folderId: null }), test: (doc) => doc.folderId == null },
	filed: { filter: () => ({ folderId: { $ne: null } }), test: (doc) => doc.folderId != null },
	animated: { filter: () => ({ animated: true }), test: (doc) => doc.animated === true },
	transparent: { filter: () => ({ hasAlpha: true }), test: (doc) => doc.hasAlpha === true },
	dark: { filter: () => ({ brightness: 'dark' }), test: (doc) => doc.brightness === 'dark' },
	light: { filter: () => ({ brightness: 'light' }), test: (doc) => doc.brightness === 'light' },
	vivid: { filter: () => ({ saturation: 'vivid' }), test: (doc) => doc.saturation === 'vivid' },
	muted: { filter: () => ({ saturation: 'muted' }), test: (doc) => doc.saturation === 'muted' },
	monochrome: {
		filter: () => ({ saturation: 'monochrome' }),
		test: (doc) => doc.saturation === 'monochrome',
	},
	pending: {
		filter: () => ({ 'tagging.status': { $in: ['pending', 'running'] } }),
		test: (doc) => doc.tagging?.status === 'pending' || doc.tagging?.status === 'running',
	},
	failed: {
		filter: () => ({ 'tagging.status': 'failed' }),
		test: (doc) => doc.tagging?.status === 'failed',
	},
	captioned: {
		filter: () => ({ caption: { $type: 'string', $ne: '' } }),
		test: (doc) => typeof doc.caption === 'string' && doc.caption !== '',
	},
	uncaptioned: {
		filter: () => ({ caption: { $in: ['', null] } }),
		test: (doc) => doc.caption === '' || doc.caption == null,
	},
}

function compileIs(node: FieldNode): Compiled {
	const rules = unique((Array.isArray(node.values) ? node.values : []).map(asText))
		.filter((value) => hasOwn(IS_RULES, value))
		.map((value) => IS_RULES[value])
	if (rules.length === 0) return structured(never(), () => false)
	return structured(orOf(rules.map((rule) => rule.filter())) as Filter, (doc) =>
		rules.some((rule) => rule.test(doc)),
	)
}

const COMPARISONS: ReadonlySet<string> = new Set(['eq', 'gt', 'gte', 'lt', 'lte', 'range'])

/** `width` `height` `size` (bytes) and `added` (a date). Values are already resolved to numbers and epoch ms. */
function compileNumeric(node: FieldNode): Compiled {
	const cmp = node.cmp
	const date = node.field === 'added'
	const column = node.field === 'size' ? 'bytes' : date ? 'createdAt' : node.field
	if (!cmp || !COMPARISONS.has(cmp.op)) return structured(never(), () => false)
	const bounds = cmp.op === 'range' ? [cmp.from, cmp.to] : [cmp.value]
	const unusable = bounds.some(
		(value) =>
			typeof value !== 'number' ||
			!Number.isFinite(value) ||
			(date && Number.isNaN(new Date(value).getTime())),
	)
	if (unusable) return structured(never(), () => false)

	const make = (value: number): number | Date => (date ? new Date(value) : value)
	let filter: Filter
	let test: (value: number) => boolean
	switch (cmp.op) {
		case 'eq':
			filter = { [column]: make(cmp.value) }
			test = (value) => value === cmp.value
			break
		case 'gt':
			filter = { [column]: { $gt: make(cmp.value) } }
			test = (value) => value > cmp.value
			break
		case 'gte':
			filter = { [column]: { $gte: make(cmp.value) } }
			test = (value) => value >= cmp.value
			break
		case 'lt':
			filter = { [column]: { $lt: make(cmp.value) } }
			test = (value) => value < cmp.value
			break
		case 'lte':
			filter = { [column]: { $lte: make(cmp.value) } }
			test = (value) => value <= cmp.value
			break
		default:
			filter = { [column]: { $gte: make(cmp.from), $lte: make(cmp.to) } }
			test = (value) => value >= cmp.from && value <= cmp.to
	}
	// A missing or mistyped column reads as NaN, which compares false, as it does in Mongo.
	const read = (doc: EvaluableDoc): number => {
		const value = (doc as unknown as Record<string, unknown>)[column]
		if (date) return value instanceof Date ? value.getTime() : Number.NaN
		return typeof value === 'number' ? value : Number.NaN
	}
	return structured(filter, (doc) => test(read(doc)))
}

function compileField(node: FieldNode, build: Build): Compiled {
	switch (node.field) {
		case 'name':
		case 'caption':
		case 'text':
			return compileTextField(node, build)
		case 'tag':
			return compileTag(node, build)
		case 'folder':
			return compileFolder(node, build)
		case 'type':
			return compileType(node)
		case 'color':
			return compileColor(node)
		case 'orientation':
			return compileColumn(node, 'orientation')
		case 'kind':
			return compileColumn(node, 'kind')
		case 'is':
			return compileIs(node)
		case 'width':
		case 'height':
		case 'size':
		case 'added':
			return compileNumeric(node)
		default:
			// A hand-built tree with a field this planner does not know: match nothing, never everything.
			return structured(never(), () => false)
	}
}

/* -------------------------------------------------------------------------- */
/* Compiling: the tree                                                        */
/* -------------------------------------------------------------------------- */

function compile(node: QueryNode, build: Build, positive: boolean, depth: number): Compiled {
	if (depth > MAX_DEPTH) throw new RangeError('The query is nested too deeply.')
	// A hole in a hand-built tree matches nothing, never everything.
	if (!node || typeof node !== 'object') return nothing()
	switch (node.type) {
		case 'term':
			return compileTerm(node, build, positive)
		case 'phrase':
			return compilePhrase(node.text, node.implicit === true, build)
		case 'field':
			return compileField(node, build)
		case 'not': {
			// A word under a NOT is never "corrected": a typo there excludes nothing, which is harmless.
			const child = compile(node.node, build, false, depth + 1)
			return {
				// Only a child with no text has an exact filter to negate. For text, the prefilter
				// cannot say "does not contain", so it says nothing and the evaluator excludes.
				filter: child.structured ? norOf(child.filter) : null,
				structured: child.structured,
				run: (env) => (child.run(env) ? null : NONE),
			}
		}
		case 'and': {
			const kids = (Array.isArray(node.nodes) ? node.nodes : []).map((child) =>
				compile(child, build, positive, depth + 1),
			)
			// Cheap column tests first: most documents fail one and skip the text work.
			const ordered = [...kids.filter((kid) => kid.structured), ...kids.filter((kid) => !kid.structured)]
			return {
				filter: andOf(kids.map((kid) => kid.filter)),
				structured: kids.every((kid) => kid.structured),
				run: (env) => {
					let units: Hit = NONE
					for (const kid of ordered) {
						const hit = kid.run(env)
						if (!hit) return null
						if (hit.length > 0) units = units.length > 0 ? units.concat(hit) : hit
					}
					return units
				},
			}
		}
		case 'or': {
			const kids = (Array.isArray(node.nodes) ? node.nodes : []).map((child) =>
				compile(child, build, positive, depth + 1),
			)
			return {
				filter: orOf(kids.map((kid) => kid.filter)),
				structured: kids.every((kid) => kid.structured),
				run: (env) => {
					// Every side is run: a document matching both sides outranks one matching a side.
					let units: Hit | null = null
					for (const kid of kids) {
						const hit = kid.run(env)
						if (!hit) continue
						units = units === null ? hit : hit.length > 0 ? units.concat(hit) : units
					}
					return units
				},
			}
		}
		default:
			// A node type this planner does not know: match nothing, never everything.
			return nothing()
	}
}

/** The term that starts last in the query, if it is positive. Only that one may become a prefix. */
function findFinalTerm(ast: QueryNode | null): QueryNode | null {
	const found: { node: TermNode | null; positive: boolean } = { node: null, positive: false }
	const walk = (node: QueryNode, positive: boolean, depth: number): void => {
		if (depth > MAX_DEPTH) throw new RangeError('The query is nested too deeply.')
		if (!node || typeof node !== 'object') return
		if (node.type === 'term') {
			if (found.node === null || node.start > found.node.start) {
				found.node = node
				found.positive = positive
			}
		} else if (node.type === 'not') walk(node.node, false, depth + 1)
		else if (node.type === 'and' || node.type === 'or') {
			for (const child of Array.isArray(node.nodes) ? node.nodes : []) walk(child, positive, depth + 1)
		}
	}
	if (ast) walk(ast, true, 0)
	return found.positive ? found.node : null
}

/**
 * The score is the sum of the scored clauses, +2 when two or more of them all matched
 * inside one single field. `fields` are the fields the clauses WON with, strongest first.
 */
function summarise(units: Hit): MatchResult {
	if (units.length === 0) return { score: 0, fields: [] }
	let total = 0
	let shared = -1
	const won = new Array<number>(SLOTS.length).fill(0)
	for (const unit of units) {
		total += unit.score
		shared &= unit.mask
		won[unit.slot] += unit.score
	}
	if (units.length >= 2 && shared !== 0) total += SAME_FIELD_BONUS
	const order = won
		.map((value, slot) => ({ value, slot }))
		.filter((entry) => entry.value > 0)
		.sort((a, b) => b.value - a.value || a.slot - b.slot)
	return { score: round(total), fields: order.map((entry) => SLOT_LABELS[entry.slot]) }
}

/** A query nested beyond what a stack can walk: it matches nothing, which is the safe way to fail. */
function failedPlan(ctx: PlanContext): SearchPlan {
	return {
		prefilter: { workspaceId: ctx.workspaceId, ...never() },
		needsEvaluation: true,
		hasText: true,
		evaluate: () => null,
		corrections: [],
		fuzzyEligible: [],
	}
}

/**
 * COMPILING THE PREFILTER. Every node compiles to a Mongo filter OR to `null`, and
 * `null` means TRUE (no restriction). The rules that keep the invariant:
 *
 *   and      drop the null children; all null -> null; flatten $and in $and.
 *   or       if ANY child is null the whole node is null (TRUE or anything is TRUE);
 *            otherwise $or of the children, flattening $or in $or. NEVER drop an
 *            or-child: `kitchen OR -blue` must not become `$or:[kitchen]`.
 *   not      a child that is fully structured -> { $nor: [child] }; a child that
 *            involves any text -> null (the evaluator excludes; a prefilter cannot).
 *   term     never null: its alternatives are OR-ed together (see below).
 *
 * Because the parser caps nesting at MEDIA_LIMITS.queryMaxDepth and the planner
 * flattens, a filter is never deeper than Mongo's 50-level BSON limit.
 *
 * Leaf filters (each is AND-ed with `{ workspaceId }` at the root):
 *
 *   term       { terms: { $in: [stem, word, ...fuzzy] } } OR-ed with, when the word
 *              is a prefix (explicit `*`, or the final bare word with ctx.prefixLast),
 *              an anchored case-sensitive `{ terms: { $regex: '^' + escapeRegex(word) } }`,
 *              OR-ed with the folders whose name matches: `{ folderId: { $in: ids } }`.
 *              A word shorter than 2 characters is never a prefix. Folder-name
 *              PREFIX matching needs 3 characters (a one-letter prefix floods);
 *              folder-name exact matching is unchanged. At most 40 alternatives per term.
 *              Words are tokenised with `indexTokens` (so `iphone`, `iPhone` agree).
 *   phrase     AND of the term filters of its NON-STOPWORD words only. `indexTokens`
 *              never stores a stopword, so "before and after" must not require the
 *              term `and`. If no non-stopword word remains the phrase compiles to
 *              null (no restriction) and the evaluator alone decides. Order is
 *              checked in memory. An implicit (hyphenated) phrase also accepts the
 *              joined run as an alternative term (`kitchenremodel`).
 *   name:/caption:/text:   the same rule as phrase, per word: non-stopword words only.
 *   tag:       { 'tags.slug': { $in: [...] } } or an anchored $regex per prefix. Each
 *              slug first goes through ctx.tagRedirects (at most 5 hops, a visited set,
 *              stop on a cycle) and each rewrite is reported in `corrections` as
 *              { from: 'tag:old', to: 'tag:new' }.
 *   folder:    { folderId: { $in: [ObjectId...] } } resolved through ctx.folders
 *              (path, else exact name, else name prefix of 3+ characters; subtree
 *              included); `unfiled` / `none` -> { folderId: null }; unresolved ->
 *              an explicit never-matching filter { _id: { $in: [] } }.
 *   type:      { contentType: { $in: [...] } }  (canonical formats -> MEDIA_TYPE_BY_FORMAT)
 *   color:     { colorNames: { $in: [...] } }
 *   orientation / kind: equality
 *   is:        untagged -> { tags: { $size: 0 } }; tagged -> { 'tags.0': { $exists: true } };
 *              unreviewed -> { 'tags.source': 'auto' }; reviewed -> { 'tags.0': { $exists: true },
 *              'tags.source': { $ne: 'auto' } }; unfiled / filed -> folderId null / not null;
 *              animated -> animated true; transparent -> hasAlpha true; dark / light ->
 *              brightness; vivid / muted / monochrome -> saturation; pending ->
 *              tagging.status in [pending, running]; failed -> tagging.status failed;
 *              captioned / uncaptioned -> caption non-empty / empty
 *   width/height/size/added   range on width / height / bytes / createdAt
 *
 * EVALUATING. `evaluate` implements the same semantics exactly, from the document's
 * fields (`fieldTokens` / `fieldTexts` from terms.ts), NEVER from `doc.terms`:
 *
 *   term       a field matches by EXACT (the query word itself is in its `surface`),
 *              STEM-ONLY (only stem(word) is in its `stems`), PREFIX (any surface
 *              token startsWith the word; the same length rules as above), or FUZZY
 *              (a vocabulary candidate). A term matches a document if ANY field has
 *              it, or the document's folder (or an ancestor folder) has a name
 *              containing the word as a token.
 *   phrase     the normalised phrase appears as consecutive words inside ONE string of
 *              ONE field, matched against `fieldTexts` (which keeps stopwords). Never
 *              matched against fieldTokens.
 *   name:/caption:/text:   ALL words must be present in that field only; a stopword
 *              word is matched against `fieldTexts` (consecutive normalised words),
 *              or ignored when other words remain; `name:the` alone must still be able
 *              to match a document named "The Who".
 *   tag:       exact slug match (or anchored prefix), after redirects.
 *   everything else  the obvious structured comparison.
 *
 * SCORING (a sum over the top-level positive text clauses; structured clauses add
 * nothing). For each term take the BEST field it matches:
 *
 *   field weight  tag 10 | auto-tag 7 x (0.6 + 0.4 x confidence) | name 6 |
 *                 filename-tag 4 | caption 3 | text 3 | notes 3 | color 3 | look 3 |
 *                 keyword 2 | folder 2
 *   match kind    exact x1.0 | stem-only x0.75 | prefix x0.7 | fuzzy x0.5
 *
 * plus a phrase match +6, and +2 when every term of a multi-word query matches within
 * one single field. Ties are broken by the caller (newest first). `fields` lists the
 * distinct field labels (FIELD_LABELS, plus `folder`) that contributed, strongest first.
 *
 * FUZZY. Only when `ctx.vocabulary` is non-null. A term that matches nothing in the
 * vocabulary (exact, stem or prefix) is replaced by up to 3 `fuzzyCandidates`, and
 * each replacement is reported in `corrections` as `{ from: term, to: bestCandidate }`.
 * A term that does match the vocabulary is never "corrected". Quoted values, phrases
 * and field values are never fuzzed; words under 4 letters are never fuzzed.
 *
 * `fuzzyEligible` lists words of 4+ letters that matched nothing in `ctx.vocabulary`
 * (when it is null: every unquoted free-text word of 4+ letters outside phrases and
 * field values), so the caller knows whether loading the vocabulary could change anything.
 *
 * Compile once into closures; evaluating a document must not re-parse, re-tokenise
 * the query, or re-expand anything. Never emit an empty $or/$and/$in that Mongo would
 * reject.
 */
export function planQuery(parsed: ParsedQuery, ctx: PlanContext): SearchPlan {
	const ast = parsed && typeof parsed === 'object' ? (parsed.ast ?? null) : null
	const build: Build = {
		ctx,
		folders: ctx.folders,
		vocabulary: ctx.vocabulary ?? null,
		finalTerm: null,
		corrections: [],
		eligible: [],
		needsTexts: false,
	}

	let root: Compiled | null = null
	try {
		build.finalTerm = ctx.prefixLast === true ? findFinalTerm(ast) : null
		root = ast ? compile(ast, build, true, 0) : null
	} catch (error) {
		if (error instanceof RangeError) return failedPlan(ctx)
		throw error
	}

	const hasText = root ? !root.structured : false
	// The workspace leads every filter, and a text-free query's filter is exact.
	const prefilter: Filter = { workspaceId: ctx.workspaceId, ...(root?.filter ?? {}) }

	const seen = new Set<string>()
	const corrections = build.corrections.filter((one) => {
		const key = `${one.from}\u0000${one.to}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})

	const compiled = root
	const evaluate = (doc: EvaluableDoc): MatchResult | null => {
		if (!doc || typeof doc !== 'object') return null
		if (!compiled) return { score: 0, fields: [] }
		try {
			const hit = compiled.run({
				doc,
				folderId: doc.folderId == null ? null : String(doc.folderId),
				views: null,
			})
			return hit ? summarise(hit) : null
		} catch (error) {
			if (error instanceof RangeError) return null
			throw error
		}
	}

	return {
		prefilter,
		needsEvaluation: hasText,
		hasText,
		evaluate,
		corrections,
		fuzzyEligible: unique(build.eligible),
	}
}
