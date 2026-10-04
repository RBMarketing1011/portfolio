import 'server-only'
import { ObjectId, type Db } from 'mongodb'
import { assetsOf, tagRulesOf } from './collections'
import { commitMany, type AssetChange, type Mutation } from './commit'
import { MediaError } from './errors'
import { cleanLabel, normalizeText, slugify, stem } from './text'
import { MEDIA_LIMITS, type MediaTag, type MediaTagStat } from './types'
import { invalidateVocabulary } from './vocabulary'

/**
 * The tagging system: tag identity, the rules that keep a merged or deleted tag
 * from coming back, the pure functions that combine manual and automatic tags,
 * and the workspace-wide tag operations.
 *
 * Identity is the slug. Labels are cosmetic; two spellings that slugify the same
 * are the same tag. Every write to an asset's tags goes through `commitAsset` /
 * `commitMany` (commit.ts), never a bare `updateOne`.
 *
 * The pure functions are total: they accept anything, never throw, never mutate
 * what they are given and always return fresh, well-formed tags (no `undefined`
 * values: the driver would store them as null).
 */

export type TagRef = { slug: string; label: string }

/**
 * slug -> where it goes. A value is a redirect (a merge or rename left it); `null`
 * is a block (a deletion left it): the auto-tagger never applies it, though a
 * person still may.
 */
export type TagRules = Map<string, TagRef | null>

/** A redirect chain is followed at most this far. Rules are written flat, so one hop is the norm. */
const MAX_HOPS = 5
/** More rules than this are not read: a safety valve on what every search and upload loads. */
const RULES_CAP = 20_000
/** Assets rewritten per commitMany call by rename, merge and delete. */
const BATCH = 200
/** Far more rounds than the asset cap needs, so a loop that is not progressing still ends. */
const MAX_ROUNDS = 100
const MAX_STALLS = 3
const STATS_DEFAULT = 500
const STATS_MAX = 2000
const INVALID = 'That tag name is not valid.'

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isObjectId = (value: unknown): value is ObjectId => value instanceof ObjectId

/** Above 1 (Infinity included) is 1, below 0 is 0; anything that is not a number is 0. */
const clamp01 = (value: unknown): number =>
	typeof value === 'number' && !Number.isNaN(value) ? Math.min(1, Math.max(0, value)) : 0

/** `work-van` -> `Work van`: the label a tag gets when only its slug is known. */
function labelFromSlug(slug: string): string {
	const words = slug.replace(/-+/g, ' ').trim()
	const [first = '', ...rest] = Array.from(words)
	return cleanLabel(first.toUpperCase() + rest.join(''))
}

type Auto = 'vision' | 'filename'

/** An automatic tag from before `via` existed reads as vision: that is where such tags came from. */
const autoVia = (tag: MediaTag): Auto => (tag.via === 'filename' ? 'filename' : 'vision')

const confidenceOf = (tag: MediaTag): number =>
	typeof tag.confidence === 'number' ? tag.confidence : 0

function autoTag(slug: string, label: string, via: Auto, confidence?: number): MediaTag {
	const tag: MediaTag = { slug, label, source: 'auto', via }
	if (confidence !== undefined) tag.confidence = confidence
	return tag
}

/**
 * One stored tag, repaired into the documented shape, or null if it is not a tag
 * at all. An unknown `source` reads as manual: a tag we cannot account for must
 * never be one the auto-tagger is allowed to remove.
 */
function cleanTag(raw: unknown): MediaTag | null {
	if (!isRecord(raw)) return null
	const slug = typeof raw.slug === 'string' ? raw.slug : ''
	if (!slug) return null
	const label =
		typeof raw.label === 'string' && raw.label.trim() ? raw.label : labelFromSlug(slug)
	if (raw.source !== 'auto') return { slug, label, source: 'manual' }
	const via = raw.via === 'filename' ? 'filename' : raw.via === 'vision' ? 'vision' : undefined
	const tag: MediaTag = { slug, label, source: 'auto' }
	if (via) tag.via = via
	if (via !== 'filename' && typeof raw.confidence === 'number' && Number.isFinite(raw.confidence))
		tag.confidence = clamp01(raw.confidence)
	return tag
}

/** Every usable tag of a stored value, repaired, duplicates and all. */
function sanitizeTags(value: unknown): MediaTag[] {
	if (!Array.isArray(value)) return []
	const out: MediaTag[] = []
	for (const raw of value) {
		const tag = cleanTag(raw)
		if (tag) out.push(tag)
	}
	return out
}

/** One tag per slug (a manual duplicate beats an automatic one, in the first one's place). */
function dedupeTags(tags: MediaTag[]): MediaTag[] {
	const out: MediaTag[] = []
	const at = new Map<string, number>()
	for (const tag of tags) {
		const seen = at.get(tag.slug)
		if (seen === undefined) {
			at.set(tag.slug, out.length)
			out.push(tag)
		} else if (out[seen].source === 'auto' && tag.source === 'manual') out[seen] = tag
	}
	return out
}

/** Fresh, well-formed tags, one per slug. */
const cleanTags = (value: unknown): MediaTag[] => dedupeTags(sanitizeTags(value))

const capRejected = (list: string[]): string[] =>
	list.length > MEDIA_LIMITS.rejectedTagsMax
		? list.slice(list.length - MEDIA_LIMITS.rejectedTagsMax)
		: list

/** The remembered slugs: strings only, each once, oldest first, capped. */
function cleanRejected(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	const seen = new Set<string>()
	const out: string[] = []
	for (const item of value)
		if (typeof item === 'string' && item && !seen.has(item)) {
			seen.add(item)
			out.push(item)
		}
	return capRejected(out)
}

/** Slugs from whatever a caller sent: typed slugs, or labels (a person may send "Kitchen Remodel"). */
function slugsOf(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	const seen = new Set<string>()
	const out: string[] = []
	for (const item of value) {
		// Cut first: a megabyte string must not cost a megabyte of normalising.
		const slug = typeof item === 'string' ? slugify(item.slice(0, 512)) : ''
		if (slug && !seen.has(slug)) {
			seen.add(slug)
			out.push(slug)
		}
	}
	return out
}

/** manual first, then vision, then file name. */
const rank = (tag: MediaTag): number =>
	tag.source !== 'auto' ? 0 : autoVia(tag) === 'filename' ? 2 : 1

/**
 * The one canonical order: manual (as they were), vision by confidence descending,
 * then file name. Ties keep their position, so ordering twice changes nothing.
 */
function orderTags(tags: MediaTag[]): MediaTag[] {
	return tags
		.map((tag, index) => ({ tag, index }))
		.sort(
			(a, b) =>
				rank(a.tag) - rank(b.tag) ||
				(rank(a.tag) === 1 ? confidenceOf(b.tag) - confidenceOf(a.tag) : 0) ||
				a.index - b.index,
		)
		.map((entry) => entry.tag)
}

/** Over the cap: drop automatic tags from the end of the order (file names, then the least confident). Manual tags are never dropped. */
function trimAuto(tags: MediaTag[]): MediaTag[] {
	let excess = tags.length - MEDIA_LIMITS.maxTagsPerAsset
	if (excess <= 0) return tags
	const out = tags.slice()
	for (let i = out.length - 1; i >= 0 && excess > 0; i--)
		if (out[i].source === 'auto') {
			out.splice(i, 1)
			excess--
		}
	return out
}

/** The most frequent label, ties to the smaller one under plain `<` (never localeCompare). */
function mostCommon(counts: Map<string, number>): string | null {
	let best: string | null = null
	let bestCount = 0
	for (const [label, count] of counts)
		if (count > bestCount || (count === bestCount && best !== null && label < best)) {
			best = label
			bestCount = count
		}
	return best
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/** `{ slug, label }` from a typed label, or null if nothing valid is left. */
export function normalizeTag(label: string): TagRef | null {
	const clean = cleanLabel(label)
	if (!clean) return null
	const slug = slugify(clean)
	return slug ? { slug, label: clean } : null
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Every rule of the workspace, as a map. A corrupt document is skipped (never read as a
 * block) and at most RULES_CAP are read, so a runaway collection cannot slow every search.
 */
export async function loadTagRules(
	db: Db,
	workspaceId: ObjectId,
): Promise<TagRules> {
	const rules: TagRules = new Map()
	if (!isObjectId(workspaceId)) return rules
	const docs = await tagRulesOf(db)
		.find({ workspaceId }, { projection: { _id: 0, from: 1, to: 1 } })
		.sort({ from: 1 })
		.limit(RULES_CAP)
		.toArray()
	for (const doc of docs) {
		if (typeof doc.from !== 'string' || !doc.from) continue
		if (doc.to === null) rules.set(doc.from, null)
		else if (isRecord(doc.to) && typeof doc.to.slug === 'string' && doc.to.slug)
			rules.set(doc.from, {
				slug: doc.to.slug,
				label:
					typeof doc.to.label === 'string' && doc.to.label.trim()
						? doc.to.label
						: labelFromSlug(doc.to.slug),
			})
		// Anything else is a corrupt rule. It is ignored, never read as a block.
	}
	return rules
}

/**
 * Follows a slug through `rules`: at most 5 hops with a visited set, stopping at a
 * block (`null`), at a cycle, or when nothing redirects it. Returns the final slug
 * (or `{ blocked: true }`). It NEVER loops, whatever the rules contain, so even a
 * corrupt cycle cannot wedge uploads and tagging. Pure.
 *
 * `label` is the label of the last redirect followed. A block reports the slug it was
 * found on, so a person adding a blocked tag still lands on the redirect's target. A
 * cycle means the rules for that slug are corrupt: they are ignored and the slug comes
 * back as it was (so resolving never swaps two tags and `redirectsOf` skips it).
 */
export function resolveTag(
	slug: string,
	rules: TagRules,
): { slug: string; label?: string; blocked: boolean } {
	const start = typeof slug === 'string' ? slug : ''
	if (!start || !(rules instanceof Map)) return { slug: start, blocked: false }

	const seen = new Set<string>([start])
	let current = start
	let label: string | undefined
	for (let hop = 0; hop < MAX_HOPS; hop++) {
		const rule = rules.get(current)
		if (rule === undefined) break
		if (rule === null) return withLabel({ slug: current, blocked: true }, label)
		const next = isRecord(rule) && typeof rule.slug === 'string' ? rule.slug : ''
		if (!next) break
		if (seen.has(next)) return { slug: start, blocked: false }
		seen.add(next)
		current = next
		label = typeof rule.label === 'string' && rule.label ? rule.label : undefined
	}
	return withLabel({ slug: current, blocked: false }, label)
}

function withLabel(
	result: { slug: string; blocked: boolean },
	label: string | undefined,
): { slug: string; label?: string; blocked: boolean } {
	return label === undefined ? result : { slug: result.slug, label, blocked: result.blocked }
}

/** The redirect entries only, as slug -> final slug, for the search planner (`PlanContext.tagRedirects`). */
export function redirectsOf(rules: TagRules): Map<string, string> {
	const out = new Map<string, string>()
	if (!(rules instanceof Map)) return out
	for (const [from, rule] of rules) {
		if (rule === null || typeof from !== 'string') continue
		const end = resolveTag(from, rules)
		// A block at the end, a self-loop or a cycle is not a redirect worth rewriting a search for.
		if (!end.blocked && end.slug !== from) out.set(from, end.slug)
	}
	return out
}

/* -------------------------------------------------------------------------- */
/* Combining tags                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A person adds tags. Each label is normalised and resolved through redirect rules
 * (a block does not stop a person); a slug already present stays as it is (a manual tag
 * never downgrades to auto; an auto tag becomes manual); a new tag is
 * `{ source: 'manual' }`. Adding un-rejects the slug. Respects MEDIA_LIMITS.maxTagsPerAsset
 * (extra labels are dropped, not an error). Pure.
 *
 * The slug the person typed is un-rejected as well as the one it resolves to, so a
 * tag removed under its old name can be added back under it.
 */
export function applyManualTags(
	current: MediaTag[],
	rejected: string[],
	labels: string[],
	rules: TagRules,
): { tags: MediaTag[]; rejected: string[] } {
	const tags = cleanTags(current)
	let remembered = cleanRejected(rejected)
	const at = new Map(tags.map((tag, index) => [tag.slug, index]))

	for (const label of Array.isArray(labels) ? labels : []) {
		const typed = normalizeTag(label)
		if (!typed) continue
		// Only the redirect matters: a block is for the auto-tagger.
		const hit = resolveTag(typed.slug, rules)
		const slug = hit.slug
		const present = at.get(slug)
		if (present === undefined) {
			// Over the cap the label is dropped, and it stays rejected if it was.
			if (tags.length >= MEDIA_LIMITS.maxTagsPerAsset) continue
			at.set(slug, tags.length)
			tags.push({
				slug,
				label: hit.label ?? (slug === typed.slug ? typed.label : labelFromSlug(slug)),
				source: 'manual',
			})
		} else if (tags[present].source === 'auto') {
			tags[present] = { slug, label: tags[present].label, source: 'manual' }
		}
		remembered = remembered.filter((item) => item !== slug && item !== typed.slug)
	}
	return { tags: orderTags(tags), rejected: remembered }
}

/**
 * A person removes tags by slug. Every removal is remembered in `rejected`, so the
 * auto-tagger does not put it back (capped at MEDIA_LIMITS.rejectedTagsMax, oldest
 * dropped). Pure.
 *
 * A slug already remembered keeps its place instead of moving to the newest end, so
 * removing the same tags twice changes nothing (a bulk action that is re-run after a
 * conflict must not rewrite documents it already finished).
 */
export function removeTagsBySlug(
	current: MediaTag[],
	rejected: string[],
	slugs: string[],
): { tags: MediaTag[]; rejected: string[] } {
	const wanted = slugsOf(slugs)
	const drop = new Set(wanted)
	const tags = orderTags(cleanTags(current).filter((tag) => !drop.has(tag.slug)))
	const remembered = cleanRejected(rejected)
	const known = new Set(remembered)
	return {
		tags,
		rejected: capRejected([...remembered, ...wanted.filter((slug) => !known.has(slug))]),
	}
}

/**
 * An automatic run delivers tags. For `via: 'vision'`: incoming tags with a confidence
 * below MEDIA_LIMITS.autoTagMinConfidence are not stored as tags, and at most
 * MEDIA_LIMITS.autoTagsMax are kept (highest confidence first). For each incoming tag:
 * resolve through `resolveTag` FIRST, then drop it if the raw OR the resolved slug is
 * rejected or blocked, then dedupe against everything already present from another
 * source. Replaces every existing auto tag with the same `via`; keeps everything else.
 * Order: manual first, then vision by confidence descending, then filename. Trims to
 * MEDIA_LIMITS.maxTagsPerAsset dropping the lowest-confidence automatic tags first. Pure.
 *
 * The cap on vision tags is applied after the drops, so a rejected tag does not use up
 * one of the ten places. A vision tag without a usable confidence counts as 0 and is
 * therefore not stored.
 */
export function mergeAutoTags(
	current: MediaTag[],
	rejected: string[],
	incoming: { label: string; confidence?: number }[],
	via: 'vision' | 'filename',
	rules: TagRules,
): MediaTag[] {
	const mode: Auto = via === 'filename' ? 'filename' : 'vision'
	// This run replaces its own earlier output and nothing else. Its own tags go before
	// the duplicate check, so a slug stored twice (it should not be) loses only the copy
	// this run is replacing.
	const kept = dedupeTags(
		sanitizeTags(current).filter((tag) => !(tag.source === 'auto' && autoVia(tag) === mode)),
	)
	const taken = new Set(kept.map((tag) => tag.slug))
	const refused = new Set(cleanRejected(rejected))

	const fresh = new Map<string, MediaTag>()
	for (const item of Array.isArray(incoming) ? incoming : []) {
		if (!isRecord(item)) continue
		const typed = normalizeTag(item.label as string)
		if (!typed) continue
		const confidence = mode === 'vision' ? clamp01(item.confidence) : undefined
		if (confidence !== undefined && confidence < MEDIA_LIMITS.autoTagMinConfidence) continue

		const hit = resolveTag(typed.slug, rules)
		if (hit.blocked || refused.has(typed.slug) || refused.has(hit.slug) || taken.has(hit.slug))
			continue

		const label = hit.label ?? (hit.slug === typed.slug ? typed.label : labelFromSlug(hit.slug))
		const earlier = fresh.get(hit.slug)
		// Two labels that resolve to one tag: the more confident one stands.
		if (!earlier || (confidence ?? 0) > confidenceOf(earlier))
			fresh.set(hit.slug, autoTag(hit.slug, label, mode, confidence))
	}

	let added = [...fresh.values()]
	if (mode === 'vision')
		added = orderTags(added).slice(0, MEDIA_LIMITS.autoTagsMax)
	return trimAuto(orderTags([...kept, ...added]))
}

/** A label's identity with plurals and tenses folded away, so "work vans" and "Work van" meet. */
const stemKey = (slug: string): string => slug.split('-').map(stem).join('-')

/**
 * Pulls the model's labels onto tags that already exist, so the vocabulary converges
 * ("vans" -> the existing "Van"; "work vans" -> "Work van"). For each incoming label
 * compute key = slugify(label).split('-').map(stem).join('-'); if exactly one known tag
 * has the same key, use that tag's label; if several different known tags share it, leave
 * the label alone (never guess between two real tags). Pure.
 */
export function canonicalizeAuto(
	incoming: { label: string; confidence?: number }[],
	known: TagRef[],
): { label: string; confidence?: number }[] {
	// key -> (slug -> label): the number of distinct slugs under a key is what matters.
	const byKey = new Map<string, Map<string, string>>()
	for (const ref of Array.isArray(known) ? known : []) {
		if (!isRecord(ref)) continue
		const label = typeof ref.label === 'string' ? ref.label : ''
		const slug = typeof ref.slug === 'string' && ref.slug ? ref.slug : slugify(label)
		if (!slug) continue
		const key = stemKey(slug)
		const slugs = byKey.get(key) ?? new Map<string, string>()
		if (!slugs.has(slug)) slugs.set(slug, label.trim() ? label : labelFromSlug(slug))
		byKey.set(key, slugs)
	}

	const out: { label: string; confidence?: number }[] = []
	for (const item of Array.isArray(incoming) ? incoming : []) {
		if (!isRecord(item) || typeof item.label !== 'string') continue
		let label = item.label
		const slug = slugify(label)
		const matches = slug ? byKey.get(stemKey(slug)) : undefined
		if (matches && matches.size === 1) label = [...matches.values()][0]
		const entry: { label: string; confidence?: number } = { label }
		if (typeof item.confidence === 'number') entry.confidence = item.confidence
		out.push(entry)
	}
	return out
}

/** "Keep" - every automatic tag becomes manual. Pure. */
export function promoteAutoTags(current: MediaTag[]): MediaTag[] {
	return orderTags(
		cleanTags(current).map((tag): MediaTag =>
			tag.source === 'auto' ? { slug: tag.slug, label: tag.label, source: 'manual' } : tag,
		),
	)
}

/* -------------------------------------------------------------------------- */
/* Counting tags                                                              */
/* -------------------------------------------------------------------------- */

type StatRow = { _id?: { slug?: unknown; label?: unknown }; count?: number; manual?: number }

function collectStats(rows: StatRow[]): MediaTagStat[] {
	const bySlug = new Map<
		string,
		{ count: number; manual: number; labels: Map<string, number> }
	>()
	for (const row of rows) {
		const slug = row._id?.slug
		if (typeof slug !== 'string' || !slug) continue
		const entry = bySlug.get(slug) ?? { count: 0, manual: 0, labels: new Map() }
		const count = typeof row.count === 'number' ? row.count : 0
		entry.count += count
		entry.manual += typeof row.manual === 'number' ? row.manual : 0
		const label = row._id?.label
		if (typeof label === 'string' && label.trim())
			entry.labels.set(label, (entry.labels.get(label) ?? 0) + count)
		bySlug.set(slug, entry)
	}
	return [...bySlug].map(([slug, entry]) => ({
		slug,
		label: mostCommon(entry.labels) ?? labelFromSlug(slug),
		count: entry.count,
		manual: entry.manual,
		auto: entry.count - entry.manual,
	}))
}

/** Count descending, then label and slug under plain `<`. */
function byCount(a: MediaTagStat, b: MediaTagStat): number {
	return (
		b.count - a.count ||
		(a.label < b.label ? -1 : a.label > b.label ? 1 : 0) ||
		(a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)
	)
}

/** Edit distance, or `max + 1` as soon as it is certain to exceed `max`. */
function distance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
	for (let i = 1; i <= a.length; i++) {
		const row = [i]
		let lowest = i
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			const value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost)
			row.push(value)
			if (value < lowest) lowest = value
		}
		if (lowest > max) return max + 1
		previous = row
	}
	return previous[b.length]
}

/** How many typos a query of this length may carry. Short words have no room for one. */
const typoLimit = (length: number): number => (length <= 2 ? 0 : length <= 4 ? 1 : 2)

/**
 * Prefix matches, then contains matches. Only when neither finds anything is the
 * query read as a typo, against the whole slug and each word of it: a typo tier that
 * always ran would put "man" beside "van".
 */
function filterStats(stats: MediaTagStat[], q: string): MediaTagStat[] {
	const needle = normalizeText(q)
	if (!needle) return stats.sort(byCount)

	const prefix: MediaTagStat[] = []
	const inside: MediaTagStat[] = []
	for (const stat of stats) {
		const haystacks = [normalizeText(stat.label), stat.slug.replace(/-/g, ' ')]
		if (haystacks.some((text) => text.startsWith(needle))) prefix.push(stat)
		else if (haystacks.some((text) => text.includes(needle))) inside.push(stat)
	}
	if (prefix.length > 0 || inside.length > 0)
		return [...prefix.sort(byCount), ...inside.sort(byCount)]

	const typed = slugify(q)
	const max = typoLimit(typed.length)
	if (!typed || max === 0) return []
	const close: { stat: MediaTagStat; distance: number }[] = []
	for (const stat of stats) {
		let best = distance(typed, stat.slug, max)
		for (const word of stat.slug.split('-')) best = Math.min(best, distance(typed, word, max))
		if (best <= max) close.push({ stat, distance: best })
	}
	return close
		.sort((a, b) => a.distance - b.distance || byCount(a.stat, b.stat))
		.map((entry) => entry.stat)
}

/**
 * Every tag in use, with counts (of assets) split into manual and auto. A slug's label
 * is its most frequent label (ties: the smaller label under `<`). `q` filters by
 * label/slug (prefix first, then contains, then typo-tolerant using a plain edit distance of
 * 1-2 on the slug; a tiny local helper, do not import query/fuzzy.ts); with no `q` the order
 * is count descending then label. `limit` defaults to 500, max 2000. One aggregation:
 * `$unwind` + `$group`.
 *
 * Mongo groups by (slug, label) and the winner among labels is picked here, so the
 * tie-break is JavaScript's `<` and not the server's collation.
 */
export async function listTagStats(
	db: Db,
	workspaceId: ObjectId,
	opts?: { q?: string; limit?: number },
): Promise<MediaTagStat[]> {
	if (!isObjectId(workspaceId)) return []
	const asked = opts?.limit
	const limit =
		typeof asked === 'number' && !Number.isNaN(asked)
			? Math.min(STATS_MAX, Math.max(1, Math.floor(asked)))
			: STATS_DEFAULT

	const rows = await assetsOf(db)
		.aggregate<StatRow>(
			[
				{ $match: { workspaceId, 'tags.0': { $exists: true } } },
				{ $project: { _id: 0, 'tags.slug': 1, 'tags.label': 1, 'tags.source': 1 } },
				{ $unwind: '$tags' },
				{
					$group: {
						_id: { slug: '$tags.slug', label: '$tags.label' },
						count: { $sum: 1 },
						manual: { $sum: { $cond: [{ $eq: ['$tags.source', 'auto'] }, 0, 1] } },
					},
				},
			],
			{ allowDiskUse: true },
		)
		.toArray()

	const stats = collectStats(rows)
	const q = typeof opts?.q === 'string' ? opts.q : ''
	const listed = q.trim() ? filterStats(stats, q) : stats.sort(byCount)
	return listed.slice(0, limit)
}

/** Labels of the most used tags, for the model's "prefer these" hint. */
export async function topTagLabels(
	db: Db,
	workspaceId: ObjectId,
	limit: number,
): Promise<string[]> {
	const count = typeof limit === 'number' ? Math.floor(limit) : 0
	if (!(count >= 1)) return []
	const stats = await listTagStats(db, workspaceId, { limit: count })
	return stats.map((stat) => stat.label)
}

/* -------------------------------------------------------------------------- */
/* Writing rules                                                              */
/* -------------------------------------------------------------------------- */

function requireWorkspace(workspaceId: unknown): asserts workspaceId is ObjectId {
	if (!isObjectId(workspaceId)) throw new MediaError('Account not found.', 404)
}

/**
 * The only way a rule is written. `from -> to` (or `to: null` for a block):
 *  - `from === to.slug` is skipped entirely (a label-only rename writes no rule);
 *  - every existing rule whose `to.slug` equals `from` is repointed at `to`, so chains are
 *    FLATTENED at write time (a->b then b->c leaves a->c and b->c);
 *  - any rule whose `from` equals `to.slug` is deleted (the target is live again, so
 *    b->a after a->b leaves no cycle);
 *  - then ONE upsert on `{ workspaceId, from }` (never an insert: the unique index would
 *    throw E11000 on the second operation on a slug).
 * Idempotent. Exported for tests.
 *
 * Not atomic, and it does not need to be: every step is idempotent and a crash between
 * two of them is finished by running the same call again.
 */
export async function writeRule(
	db: Db,
	workspaceId: ObjectId,
	from: string,
	to: TagRef | null,
): Promise<void> {
	requireWorkspace(workspaceId)
	const source = typeof from === 'string' ? from.trim() : ''
	if (!source) throw new MediaError(INVALID, 400)

	let target: TagRef | null = null
	if (to !== null) {
		const slug = isRecord(to) && typeof to.slug === 'string' ? to.slug.trim() : ''
		if (!slug) throw new MediaError(INVALID, 400)
		if (slug === source) return
		const label = cleanLabel(typeof to.label === 'string' ? to.label : '')
		target = { slug, label: label || labelFromSlug(slug) }
	}

	const rules = tagRulesOf(db)
	// What pointed at `from` now points where `from` does (a block, for a block).
	await rules.updateMany({ workspaceId, 'to.slug': source }, { $set: { to: target } })
	// The target is a live tag again, so it is no longer an alias of anything.
	if (target) await rules.deleteMany({ workspaceId, from: target.slug })
	await rules.updateOne(
		{ workspaceId, from: source },
		{ $set: { to: target }, $setOnInsert: { createdAt: new Date() } },
		{ upsert: true },
	)
}

/* -------------------------------------------------------------------------- */
/* Rename, merge, delete                                                      */
/* -------------------------------------------------------------------------- */

/** A slug from a caller: slugified, so a label works too. Anything with no letter or number in it is invalid. */
function slugParam(value: unknown): string {
	const slug = typeof value === 'string' ? slugify(value.slice(0, 512)) : ''
	if (!slug) throw new MediaError(INVALID, 400)
	return slug
}

/** The label assets carry a tag under, or null when no asset carries it. */
async function labelOnAssets(
	db: Db,
	workspaceId: ObjectId,
	slug: string,
): Promise<string | null> {
	const rows = await assetsOf(db)
		.aggregate<{ _id: unknown; count: number }>([
			{ $match: { workspaceId, 'tags.slug': slug } },
			{ $project: { _id: 0, 'tags.slug': 1, 'tags.label': 1 } },
			{ $unwind: '$tags' },
			{ $match: { 'tags.slug': slug } },
			{ $group: { _id: '$tags.label', count: { $sum: 1 } } },
		])
		.toArray()
	if (rows.length === 0) return null
	const labels = new Map<string, number>()
	for (const row of rows)
		if (typeof row._id === 'string' && row._id.trim())
			labels.set(row._id, (labels.get(row._id) ?? 0) + row.count)
	return mostCommon(labels) ?? labelFromSlug(slug)
}

/**
 * Rewrites every asset `filter` selects, in batches, until none remain. The filter must
 * select exactly the assets the mutation still has work on, or a batch of finished ones
 * would be found again forever. Resumable: a crash leaves the rest to the next call.
 */
async function rewriteAll(
	db: Db,
	workspaceId: ObjectId,
	filter: Record<string, unknown>,
	mutation: Mutation,
): Promise<number> {
	let affected = 0
	let stalled = 0
	for (let round = 0; round < MAX_ROUNDS; round++) {
		const rows = await assetsOf(db)
			.find({ workspaceId, ...filter }, { projection: { _id: 1 } })
			.limit(BATCH)
			.toArray()
		if (rows.length === 0) return affected

		const { changed, conflicts } = await commitMany(
			db,
			workspaceId,
			rows.map((row) => row._id),
			mutation,
		)
		affected += changed
		if (changed > 0) {
			stalled = 0
			continue
		}
		// Nothing moved. Either these assets need nothing from this mutation (stop), or
		// they keep changing under us (a few more tries, then say so).
		if (conflicts === 0) return affected
		if (++stalled >= MAX_STALLS) break
	}
	throw new MediaError('Some images changed while saving. Try again.', 409)
}

/** The same tag in two forms (both on one asset): manual wins, then the more confident automatic one. */
function winner(existing: MediaTag, moved: MediaTag, label: string): MediaTag {
	let chosen = existing
	if (existing.source === 'auto' && moved.source === 'manual') chosen = moved
	else if (
		existing.source === 'auto' &&
		moved.source === 'auto' &&
		confidenceOf(moved) > confidenceOf(existing)
	)
		chosen = moved
	return { ...chosen, label }
}

/** `from` becomes `into` on an asset; one tag if it already had both. Null once there is no `from` left. */
function foldInto(from: string, into: TagRef): Mutation {
	return (doc): AssetChange | null => {
		const tags = cleanTags(doc.tags)
		const index = tags.findIndex((tag) => tag.slug === from)
		if (index === -1) return null
		const moved: MediaTag = { ...tags[index], slug: into.slug, label: into.label }
		const twin = tags.findIndex((tag) => tag.slug === into.slug)
		const next =
			twin === -1
				? tags.map((tag, i) => (i === index ? moved : tag))
				: tags
						.filter((_, i) => i !== index)
						.map((tag) => (tag.slug === into.slug ? winner(tag, moved, into.label) : tag))
		return {
			tags: orderTags(next),
			// The person put the tag here, so it is no longer one they turned down.
			rejectedTags: cleanRejected(doc.rejectedTags).filter((slug) => slug !== into.slug),
		}
	}
}

/** Same slug, new spelling. Null when the asset already shows it. */
function relabel(slug: string, label: string): Mutation {
	return (doc): AssetChange | null => {
		const tags = cleanTags(doc.tags)
		if (!tags.some((tag) => tag.slug === slug && tag.label !== label)) return null
		return { tags: tags.map((tag) => (tag.slug === slug ? { ...tag, label } : tag)) }
	}
}

/**
 * ORDER FOR rename / merge / delete (all idempotent, resumable after a crash, none relies
 * on a transaction): (1) `writeRule`; (2) rewrite the assets that carry `from`, in batches of
 * 200 found by `{ workspaceId, 'tags.slug': from }`, through `commitMany` (so `terms` is
 * rebuilt in the same write and `rev` bumped), repeating until none remain; (3) return the
 * total. A retry after a crash resumes; finding zero assets is not an error. Finish with
 * `invalidateVocabulary`.
 *
 * Renames a tag everywhere: changes its label and, because identity follows the label, its
 * slug. If the new slug already exists this is a merge into it (`merged: true`). Throws
 * MediaError 400 on an invalid label.
 *
 * Into an existing tag the assets take that tag's label, not the typed one, so a rename
 * cannot fork a tag into two spellings. A rename that keeps the slug (a change of case or
 * punctuation) writes no rule and only relabels.
 */
export async function renameTag(
	db: Db,
	workspaceId: ObjectId,
	slug: string,
	label: string,
): Promise<{ affected: number; slug: string; merged: boolean }> {
	requireWorkspace(workspaceId)
	const from = slugParam(slug)
	const target = normalizeTag(label)
	if (!target) throw new MediaError(INVALID, 400)

	try {
		if (target.slug === from) {
			const affected = await rewriteAll(
				db,
				workspaceId,
				{ tags: { $elemMatch: { slug: from, label: { $ne: target.label } } } },
				relabel(from, target.label),
			)
			return { affected, slug: from, merged: false }
		}

		const existing = await labelOnAssets(db, workspaceId, target.slug)
		const into: TagRef = { slug: target.slug, label: existing ?? target.label }
		await writeRule(db, workspaceId, from, into)
		const affected = await rewriteAll(
			db,
			workspaceId,
			{ 'tags.slug': from },
			foldInto(from, into),
		)
		return { affected, slug: into.slug, merged: existing !== null }
	} finally {
		invalidateVocabulary(workspaceId)
	}
}

/**
 * Folds `fromSlug` into `intoSlug` on every asset carrying it (keeping the target's label;
 * manual wins over auto when an asset has both). `fromSlug === intoSlug` is a no-op. The
 * target must exist on some asset or already have a label via a rule; else it is created
 * with the label derived from its slug. Same order and obligations as `renameTag`.
 */
export async function mergeTag(
	db: Db,
	workspaceId: ObjectId,
	fromSlug: string,
	intoSlug: string,
): Promise<{ affected: number }> {
	requireWorkspace(workspaceId)
	const from = slugParam(fromSlug)
	const into = slugParam(intoSlug)
	if (from === into) return { affected: 0 }

	try {
		let label = await labelOnAssets(db, workspaceId, into)
		if (label === null) {
			const rule = await tagRulesOf(db).findOne(
				{ workspaceId, 'to.slug': into },
				{ projection: { _id: 0, to: 1 } },
			)
			const named = rule?.to?.label
			label = typeof named === 'string' && named.trim() ? named : labelFromSlug(into)
		}
		const target: TagRef = { slug: into, label }
		await writeRule(db, workspaceId, from, target)
		const affected = await rewriteAll(
			db,
			workspaceId,
			{ 'tags.slug': from },
			foldInto(from, target),
		)
		return { affected }
	} finally {
		invalidateVocabulary(workspaceId)
	}
}

/**
 * Removes a tag from every asset and leaves a block rule so the auto-tagger does not
 * recreate it; records the slug in each affected asset's `rejectedTags` through the SAME
 * capped helper as `removeTagsBySlug` (never a bare update). Rebuilds `terms` on every
 * affected asset in the same write. Same order and obligations as `renameTag`.
 */
export async function deleteTag(
	db: Db,
	workspaceId: ObjectId,
	slug: string,
): Promise<{ affected: number }> {
	requireWorkspace(workspaceId)
	const from = slugParam(slug)

	try {
		await writeRule(db, workspaceId, from, null)
		const affected = await rewriteAll(
			db,
			workspaceId,
			{ 'tags.slug': from },
			(doc): AssetChange | null => {
				if (!cleanTags(doc.tags).some((tag) => tag.slug === from)) return null
				const result = removeTagsBySlug(doc.tags, doc.rejectedTags, [from])
				return { tags: result.tags, rejectedTags: result.rejected }
			},
		)
		return { affected }
	} finally {
		invalidateVocabulary(workspaceId)
	}
}
