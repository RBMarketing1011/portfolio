import 'server-only'
import type { Db, Document, ObjectId } from 'mongodb'
import { ObjectId as Oid } from 'mongodb'
import { assetsOf, foldersOf } from './collections'
import { swatchFor } from './colors'
import { toAssetDTO } from './dto'
import { buildFolderIndex, type FolderIndex } from './folder-index'
import {
	dropTerms,
	parseQuery,
	relaxableTerms,
} from './query/parse'
import { inVocabulary } from './query/fuzzy'
import { planQuery } from './query/plan'
import {
	toParsedQueryDTO,
	type EvaluableDoc,
	type MatchResult,
	type ParsedQuery,
	type PlanContext,
	type QueryNode,
	type SearchPlan,
} from './query/types'
import { loadTagRules, redirectsOf } from './tags'
import {
	MEDIA_LIMITS,
	type FacetCount,
	type MediaAssetDoc,
	type MediaFacets,
	type MediaSearchParams,
	type MediaSearchResponse,
	type MediaSort,
} from './types'
import { loadVocabulary } from './vocabulary'

/**
 * The orchestrator: parse -> plan -> fetch -> (evaluate, rank) -> facets -> DTOs.
 *
 * A query with no text is exact in Mongo and pages there. A query with text is
 * pre-filtered in Mongo, evaluated and ranked in memory, and only the page of
 * matches is read back in full. See the notes on `searchAssets`.
 */

export type SearchContext = { workspaceId: ObjectId; userId: string }

type Filter = Record<string, unknown>

/** Exactly the fields `EvaluableDoc` names, and nothing else (never `blur`, `colors`, `url`, hashes or `terms`). */
const EVAL_PROJECTION = {
	_id: 1,
	folderId: 1,
	name: 1,
	filename: 1,
	tags: 1,
	caption: 1,
	altText: 1,
	textInImage: 1,
	keywords: 1,
	notes: 1,
	colorNames: 1,
	orientation: 1,
	contentType: 1,
	kind: 1,
	brightness: 1,
	saturation: 1,
	hasAlpha: 1,
	animated: 1,
	width: 1,
	height: 1,
	bytes: 1,
	createdAt: 1,
	tagging: 1,
	nameKey: 1,
	pixels: 1,
} as const

const TAG_FACETS = 30
const FOLDER_FACETS = 20

/** Each key is paired with `_id` in the SAME direction so an index can be walked either way. */
const MONGO_SORT: Record<Exclude<MediaSort, 'relevance'>, Record<string, 1 | -1>> = {
	newest: { createdAt: -1, _id: -1 },
	oldest: { createdAt: 1, _id: 1 },
	name: { nameKey: 1, _id: 1 },
	'name-desc': { nameKey: -1, _id: -1 },
	largest: { bytes: -1, _id: -1 },
	smallest: { bytes: 1, _id: 1 },
	dimensions: { pixels: -1, _id: -1 },
}

/* -------------------------------------------------------------------------- */
/* Preparation                                                                */
/* -------------------------------------------------------------------------- */

type Prepared = {
	ctx: SearchContext
	q: string
	folders: FolderIndex
	parsed: ParsedQuery
	base: PlanContext
	plan: SearchPlan
	/** Null when no folder scope applies. */
	scope: Filter | null
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
	const n = typeof value === 'number' ? Math.floor(value) : Number.NaN
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

const and = (...parts: (Filter | null)[]): Filter => {
	const used = parts.filter((part): part is Filter => part !== null)
	return used.length === 1 ? used[0] : { $and: used }
}

/** A positive, top-level (not negated, not inside an OR) `folder:` clause is itself the scope. */
function hasTopLevelFolderClause(ast: QueryNode | null): boolean {
	if (!ast) return false
	const isFolder = (node: QueryNode) => node.type === 'field' && node.field === 'folder'
	if (isFolder(ast)) return true
	return ast.type === 'and' && ast.nodes.some(isFolder)
}

/**
 * The scope the `folder` param asks for. An id that no longer exists matches
 * NOTHING (never everything), as does one that is not an id at all.
 */
function paramScope(
	folder: string | undefined,
	deep: boolean,
	folders: FolderIndex,
): Filter | null {
	if (folder === undefined || folder === '') return null
	if (folder === 'unfiled') return { folderId: null }
	if (!/^[a-f0-9]{24}$/i.test(folder) || !folders.has(folder)) return { _id: { $in: [] } }
	return deep
		? { folderId: { $in: folders.subtree(folder).map((id) => new Oid(id)) } }
		: { folderId: new Oid(folder) }
}

async function prepare(
	db: Db,
	ctx: SearchContext,
	input: { q?: unknown; folder?: unknown; deep?: unknown },
): Promise<Prepared> {
	const q = (typeof input.q === 'string' ? input.q : '').slice(0, MEDIA_LIMITS.queryMax)
	const now = new Date()

	// Independent loads run concurrently.
	const [folderDocs, rules] = await Promise.all([
		foldersOf(db)
			.find({ workspaceId: ctx.workspaceId }, { projection: { _id: 1, parentId: 1, name: 1 } })
			.toArray(),
		loadTagRules(db, ctx.workspaceId),
	])
	const folders = buildFolderIndex(folderDocs)
	const parsed = parseQuery(q, { now })

	const base: PlanContext = {
		workspaceId: ctx.workspaceId,
		userId: ctx.userId,
		now,
		folders,
		tagRedirects: redirectsOf(rules),
		vocabulary: null,
		prefixLast: true,
	}
	const plan = planQuery(parsed, base)

	let scope: Filter | null = null
	if (!hasTopLevelFolderClause(parsed.ast)) {
		const deep =
			typeof input.deep === 'boolean' ? input.deep : parsed.ast !== null
		scope = paramScope(
			typeof input.folder === 'string' ? input.folder : undefined,
			deep,
			folders,
		)
	}

	return { ctx, q, folders, parsed, base, plan, scope }
}

/* -------------------------------------------------------------------------- */
/* Text queries: evaluate in memory                                           */
/* -------------------------------------------------------------------------- */

type Match = { doc: EvaluableDoc; result: MatchResult }

async function runText(
	db: Db,
	prep: Prepared,
	plan: SearchPlan,
): Promise<{ matches: Match[]; truncated: boolean }> {
	const candidates = (await assetsOf(db)
		.find(and(plan.prefilter, prep.scope) as Filter, { projection: EVAL_PROJECTION })
		// Newest first, so past the cap what is left out is the oldest.
		.sort({ createdAt: -1, _id: -1 })
		.limit(MEDIA_LIMITS.candidateCap)
		.allowDiskUse(true)
		.toArray()) as unknown as EvaluableDoc[]

	const matches: Match[] = []
	for (const doc of candidates) {
		const result = plan.evaluate(doc)
		if (result) matches.push({ doc, result })
	}
	return { matches, truncated: candidates.length >= MEDIA_LIMITS.candidateCap }
}

const correctionKey = (c: { from: string; to: string }) => `${c.from}\u0000${c.to}`

type TextOutcome = {
	matches: Match[]
	truncated: boolean
	corrections: { from: string; to: string }[]
	dropped: string[]
}

/**
 * Pass 1 as planned. Then, each only if the one before found NOTHING:
 *  - pass 2 (typos): re-plan with the workspace vocabulary;
 *  - pass 3 (relaxation, `relax` only): drop the words that exist nowhere.
 */
async function textPasses(
	db: Db,
	prep: Prepared,
	opts: { relax: boolean },
): Promise<TextOutcome> {
	const first = await runText(db, prep, prep.plan)
	const outcome: TextOutcome = {
		...first,
		corrections: prep.plan.corrections,
		dropped: [],
	}
	if (first.matches.length > 0 || prep.plan.fuzzyEligible.length === 0) return outcome

	// PASS 2. The vocabulary is cached, so a zero-result query whose words all
	// exist costs at most one cached load and no second find.
	const vocabulary = await loadVocabulary(db, prep.ctx.workspaceId)
	const fuzzy = planQuery(prep.parsed, { ...prep.base, vocabulary })
	const seen = new Set(prep.plan.corrections.map(correctionKey))
	if (fuzzy.corrections.some((c) => !seen.has(correctionKey(c)))) {
		const second = await runText(db, prep, fuzzy)
		if (second.matches.length > 0)
			return { ...second, corrections: fuzzy.corrections, dropped: [] }
	}

	// PASS 3. Only a pure AND of 2+ free-text words may be relaxed.
	if (!opts.relax) return outcome
	const words = relaxableTerms(prep.parsed)
	if (!words) return outcome
	const missing = words.filter((word) => !inVocabulary(word, vocabulary, true))
	if (missing.length === 0 || missing.length === words.length) return outcome

	const relaxed = dropTerms(prep.parsed, missing)
	const plan = planQuery(relaxed, { ...prep.base, vocabulary: null })
	const third = await runText(db, prep, plan)
	if (third.matches.length === 0) return outcome
	return { ...third, corrections: plan.corrections, dropped: missing }
}

const compare = <T>(a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0)

/** score desc (or the chosen key), then newest, then `_id`. */
function sortMatches(matches: Match[], sort: MediaSort): Match[] {
	const time = (m: Match) => new Date(m.doc.createdAt).getTime()
	const id = (m: Match) => m.doc._id.toString()
	const key = (m: Match, which: Exclude<MediaSort, 'relevance'>): number | string => {
		switch (which) {
			case 'name':
			case 'name-desc':
				return m.doc.nameKey ?? ''
			case 'largest':
			case 'smallest':
				return m.doc.bytes ?? 0
			case 'dimensions':
				return m.doc.pixels ?? 0
			default:
				return time(m)
		}
	}
	const descending = (which: MediaSort) =>
		which === 'name-desc' || which === 'largest' || which === 'dimensions' || which === 'newest'

	return [...matches].sort((a, b) => {
		if (sort === 'relevance') {
			return (
				b.result.score - a.result.score ||
				time(b) - time(a) ||
				compare(id(b), id(a))
			)
		}
		const primary = compare(key(a, sort), key(b, sort))
		if (primary !== 0) return descending(sort) ? -primary : primary
		return time(b) - time(a) || compare(id(b), id(a))
	})
}

/* -------------------------------------------------------------------------- */
/* Facets                                                                     */
/* -------------------------------------------------------------------------- */

type TagRow = { slug: string; label: string; count: number }
type ColorRow = { name: string; count: number }
type FolderRow = { id: string; count: number }

/**
 * The ONE place facet rows become facets, whether they were grouped by Mongo or
 * counted in memory, so identical data gives identical output. Every tie-break is
 * count descending, then plain `<` on the value (never localeCompare).
 */
function finalizeFacets(
	tags: TagRow[],
	colors: ColorRow[],
	folderRows: FolderRow[],
	folders: FolderIndex,
): MediaFacets {
	const bySlug = new Map<string, { total: number; labels: Map<string, number> }>()
	for (const row of tags) {
		if (typeof row.slug !== 'string' || !row.slug) continue
		const entry = bySlug.get(row.slug) ?? { total: 0, labels: new Map() }
		entry.total += row.count
		entry.labels.set(row.label, (entry.labels.get(row.label) ?? 0) + row.count)
		bySlug.set(row.slug, entry)
	}
	const tagFacets: FacetCount[] = [...bySlug].map(([slug, entry]) => {
		let label = ''
		let best = -1
		for (const [candidate, count] of entry.labels)
			if (count > best || (count === best && candidate < label)) {
				label = candidate
				best = count
			}
		return { value: slug, label: label || slug, count: entry.total }
	})
	const byCount = (a: FacetCount, b: FacetCount) =>
		b.count - a.count || compare(a.value, b.value)

	const colorFacets = colors
		.filter((row) => typeof row.name === 'string' && row.name)
		.map((row) => ({
			value: row.name,
			label: row.name,
			count: row.count,
			hex: swatchFor(row.name) ?? '',
		}))
		.sort(byCount)

	const folderFacets: FacetCount[] = folderRows
		.filter((row) => folders.has(row.id))
		.map((row) => ({ value: row.id, label: folders.pathOf(row.id), count: row.count }))
		.sort(byCount)
		.slice(0, FOLDER_FACETS)

	return {
		tags: tagFacets.sort(byCount).slice(0, TAG_FACETS),
		colors: colorFacets,
		folders: folderFacets,
	}
}

/**
 * Facet counts over a set of documents, in memory. Same shape the Mongo path
 * returns, through the same `finalizeFacets` (see step 7).
 */
export function computeFacets(
	docs: Array<Pick<MediaAssetDoc, 'tags' | 'colorNames' | 'folderId'>>,
	folders: FolderIndex,
): MediaFacets {
	const tags = new Map<string, TagRow>()
	const colors = new Map<string, number>()
	const folderCounts = new Map<string, number>()

	for (const doc of docs) {
		const seen = new Set<string>()
		for (const tag of doc.tags ?? []) {
			// Counts are of DOCUMENTS, so a repeated slug on one asset counts once.
			const key = `${tag.slug}\u0000${tag.label}`
			if (seen.has(tag.slug)) continue
			seen.add(tag.slug)
			const row = tags.get(key) ?? { slug: tag.slug, label: tag.label, count: 0 }
			row.count++
			tags.set(key, row)
		}
		for (const name of new Set(doc.colorNames ?? []))
			colors.set(name, (colors.get(name) ?? 0) + 1)
		if (doc.folderId) {
			const id = doc.folderId.toString()
			folderCounts.set(id, (folderCounts.get(id) ?? 0) + 1)
		}
	}

	return finalizeFacets(
		[...tags.values()],
		[...colors].map(([name, count]) => ({ name, count })),
		[...folderCounts].map(([id, count]) => ({ id, count })),
		folders,
	)
}

/** One aggregation over the same filter the page was read with. */
async function mongoFacets(db: Db, filter: Filter, folders: FolderIndex): Promise<MediaFacets> {
	const [row] = await assetsOf(db)
		.aggregate<{
			tags: { _id: { slug: string; label: string }; count: number }[]
			colors: { _id: string; count: number }[]
			folders: { _id: ObjectId | null; count: number }[]
		}>(
			[
				{ $match: filter as Document },
				{
					$facet: {
						tags: [
							{ $project: { tags: { $setUnion: [{ $ifNull: ['$tags', []] }, []] } } },
							{ $unwind: '$tags' },
							{
								$group: {
									_id: { slug: '$tags.slug', label: '$tags.label' },
									count: { $sum: 1 },
								},
							},
						],
						colors: [
							{ $project: { colorNames: { $ifNull: ['$colorNames', []] } } },
							{ $unwind: '$colorNames' },
							{ $group: { _id: '$colorNames', count: { $sum: 1 } } },
						],
						folders: [
							{ $match: { folderId: { $ne: null } } },
							{ $group: { _id: '$folderId', count: { $sum: 1 } } },
						],
					},
				},
			],
			{ allowDiskUse: true },
		)
		.toArray()

	return finalizeFacets(
		(row?.tags ?? []).map((r) => ({ slug: r._id.slug, label: r._id.label, count: r.count })),
		(row?.colors ?? []).map((r) => ({ name: r._id, count: r.count })),
		(row?.folders ?? []).flatMap((r) => (r._id ? [{ id: r._id.toString(), count: r.count }] : [])),
		folders,
	)
}

/* -------------------------------------------------------------------------- */
/* Tagging backlog                                                            */
/* -------------------------------------------------------------------------- */

/** Waiting for AI tags: queued, or being worked on (live lease) or abandoned mid-run with attempts left. */
async function countPending(db: Db, workspaceId: ObjectId): Promise<number> {
	const now = new Date()
	return assetsOf(db).countDocuments({
		workspaceId,
		$or: [
			{ 'tagging.status': 'pending' },
			{
				'tagging.status': 'running',
				$or: [
					{ 'tagging.leaseUntil': { $gt: now } },
					{ 'tagging.attempts': { $not: { $gte: MEDIA_LIMITS.aiMaxAttempts } } },
				],
			},
		],
	} as Filter)
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Runs a search. See the module note for the shape; in short:
 *  - the folder scope is the query's own top-level `folder:` clause, else the
 *    `folder` param (its subtree when `deep`, which defaults to on for any query);
 *  - no text: Mongo filters, sorts, pages and counts;
 *  - text: Mongo pre-filters, memory evaluates and ranks, then only the page is
 *    read back in full. Zero results fall through to a typo pass and, for a pure AND
 *    of words, a relaxation pass that drops words found nowhere in the library;
 *  - facets (when asked) and the tagging backlog are computed over the matched set.
 *
 * `prefixLast` is true for text queries (search-as-you-type).
 */
export async function searchAssets(
	db: Db,
	ctx: SearchContext,
	params: MediaSearchParams,
): Promise<MediaSearchResponse> {
	const limit = clampInt(params.limit, 1, MEDIA_LIMITS.maxPageSize, MEDIA_LIMITS.pageSize)
	const offset = clampInt(params.offset, 0, Number.MAX_SAFE_INTEGER, 0)

	const prep = await prepare(db, ctx, params)
	const { plan, parsed, folders } = prep

	let sort: MediaSort = params.sort ?? parsed.sort ?? (plan.hasText ? 'relevance' : 'newest')
	if (sort === 'relevance' && !plan.hasText) sort = 'newest'

	const pendingPromise = countPending(db, ctx.workspaceId)
	const base = {
		query: toParsedQueryDTO(parsed),
		offset,
		limit,
		sort,
	}

	// 4. No text: Mongo does everything.
	if (!plan.needsEvaluation) {
		const filter = and(plan.prefilter, prep.scope)
		const wanted = sort === 'relevance' ? 'newest' : sort
		const [docs, total, facets, pending] = await Promise.all([
			assetsOf(db)
				.find(filter as Filter, { projection: { terms: 0 } })
				.sort(MONGO_SORT[wanted])
				.skip(offset)
				.limit(limit)
				.allowDiskUse(true)
				.toArray(),
			assetsOf(db).countDocuments(filter as Filter),
			params.facets ? mongoFacets(db, filter, folders) : Promise.resolve(null),
			pendingPromise,
		])
		return {
			...base,
			assets: docs.map((doc) => toAssetDTO(doc, folders)),
			total,
			hasMore: offset + docs.length < total,
			truncated: false,
			corrections: plan.corrections,
			dropped: [],
			facets,
			pending,
		}
	}

	// 5. Text.
	const outcome = await textPasses(db, prep, { relax: true })
	const ranked = sortMatches(outcome.matches, sort)
	const page = ranked.slice(offset, offset + limit)

	// Only the page is read back in full, so a broad query does not pull
	// thousands of whole documents.
	const byId = new Map<string, MediaAssetDoc>()
	if (page.length) {
		const full = await assetsOf(db)
			.find(
				{ workspaceId: ctx.workspaceId, _id: { $in: page.map((m) => m.doc._id) } },
				{ projection: { terms: 0 } },
			)
			.toArray()
		for (const doc of full) byId.set(doc._id.toString(), doc)
	}
	const assets = page.flatMap((m) => {
		const doc = byId.get(m.doc._id.toString())
		// Deleted between the two reads: simply not on the page.
		return doc ? [toAssetDTO(doc, folders, m.result)] : []
	})

	return {
		...base,
		assets,
		total: ranked.length,
		hasMore: offset + page.length < ranked.length,
		truncated: outcome.truncated,
		corrections: outcome.corrections,
		dropped: outcome.dropped,
		facets: params.facets ? computeFacets(outcome.matches.map((m) => m.doc), folders) : null,
		pending: await pendingPromise,
	}
}

/**
 * The ids a search matches, for "select all N results" bulk actions. It runs
 * exactly the plans `searchAssets` runs for pass 1 and pass 2 (typo tolerance, tag
 * redirects, the folder scope, the `deep` default and `prefixLast` all derive from
 * `q`, not from the caller), so `total` is the number the person saw. It never
 * relaxes (pass 3): the UI disables "select all" when `dropped` is non-empty.
 *
 * `cap` bounds how many ids come back. Past it `overflow` is true and `ids` holds
 * nothing, so the caller refuses the action rather than acting on part of the
 * matches. Always honours the workspace.
 */
export async function resolveSearchIds(
	db: Db,
	ctx: SearchContext,
	params: Pick<MediaSearchParams, 'q' | 'folder' | 'deep'>,
	cap?: number,
): Promise<{ ids: ObjectId[]; total: number; overflow: boolean }> {
	const limit = typeof cap === 'number' && cap >= 0 ? Math.floor(cap) : Number.POSITIVE_INFINITY
	const prep = await prepare(db, ctx, params)

	if (!prep.plan.needsEvaluation) {
		const filter = and(prep.plan.prefilter, prep.scope) as Filter
		const total = await assetsOf(db).countDocuments(filter)
		if (total > limit) return { ids: [], total, overflow: true }
		const docs = await assetsOf(db)
			.find(filter, { projection: { _id: 1 } })
			.sort(MONGO_SORT.newest)
			.allowDiskUse(true)
			.toArray()
		return { ids: docs.map((doc) => doc._id), total, overflow: false }
	}

	const outcome = await textPasses(db, prep, { relax: false })
	const total = outcome.matches.length
	// A truncated candidate set means `total` is a lower bound, so it cannot be trusted to be under the cap.
	if (total > limit || outcome.truncated) return { ids: [], total, overflow: true }
	const sort: MediaSort = prep.parsed.sort ?? 'relevance'
	return {
		ids: sortMatches(outcome.matches, sort).map((m) => m.doc._id),
		total,
		overflow: false,
	}
}
