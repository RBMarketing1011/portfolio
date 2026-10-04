import 'server-only'
import type { Db, ObjectId } from 'mongodb'
import type {
	MediaAssetDoc,
	MediaFacets,
	MediaSearchParams,
	MediaSearchResponse,
} from './types'
import type { FolderIndex } from './folder-index'

/**
 * The orchestrator: parse -> plan -> fetch -> (evaluate, rank) -> facets -> DTOs.
 *
 * STUB: signatures are the contract; bodies are being written.
 */

export type SearchContext = { workspaceId: ObjectId; userId: string }

/**
 * Runs a search. Behaviour, in order:
 *
 *  1. Load the workspace's folders (one query) and tag redirects (`loadTagRules`,
 *     redirect entries only), build the `PlanContext`, parse the query,
 *     `now = new Date()`. Independent loads run concurrently.
 *  2. Folder scope. A POSITIVE, top-level (not negated, not inside an OR) `folder:`
 *     clause in the query IS the scope and supersedes the `folder` param; otherwise
 *     the param applies: a folder id -> that folder (or its whole subtree when `deep`),
 *     `unfiled` -> `{ folderId: null }`, absent -> none; an id that no longer exists
 *     matches NOTHING (never everything). `deep` defaults to true when the query has any
 *     clause, false otherwise (irrelevant for `unfiled` and absent). The scope is ANDed
 *     with the plan's prefilter (it is exact, so it needs no evaluation).
 *  3. Sort: `params.sort`, else the query's `sort:`, else `relevance` when the query
 *     has text, else `newest`. `relevance` without text becomes `newest`.
 *  4. NO TEXT (`needsEvaluation` false): Mongo does everything. The sort is EXACTLY
 *     one of these, each key paired with `_id` in the SAME direction so an index can be
 *     walked forwards or backwards (mixing directions forces a blocking in-memory sort
 *     of the whole library; measured):
 *         newest {createdAt:-1,_id:-1}   oldest {createdAt:1,_id:1}
 *         name {nameKey:1,_id:1}         name-desc {nameKey:-1,_id:-1}
 *         largest {bytes:-1,_id:-1}      smallest {bytes:1,_id:1}
 *         dimensions {pixels:-1,_id:-1}
 *     The matching indexes are in scripts/ensure-indexes.mjs. `skip(offset)`,
 *     `limit(limit)`, `countDocuments(filter)` for `total`. `allowDiskUse: true`.
 *     DTO-building finds project `{ terms: 0 }`. `truncated` is false.
 *  5. TEXT: `find(prefilter AND scope)` with an INCLUSION projection of exactly the
 *     `EvaluableDoc` fields and nothing else (never `blur`, `colors`, `url`, hashes or
 *     `terms`), capped at MEDIA_LIMITS.candidateCap (`truncated` if hit); run
 *     `plan.evaluate` on each; drop nulls; sort by score desc (or by the chosen
 *     non-relevance key), then newest, then `_id`; `total` is the evaluated count.
 *     ONLY the page of matches is then re-fetched in full (`find({_id: {$in}})`,
 *     `{ terms: 0 }`) and re-ordered, so a broad query does not pull 5,000 whole documents.
 *     Further passes, each only if the one before found NOTHING:
 *       PASS 2 (typos) if `plan.fuzzyEligible` is non-empty: `loadVocabulary`, re-plan with
 *         it; if that re-plan reports no typo correction, DISCARD it and return pass 1 without
 *         another find (a zero-result query whose words all exist costs at most one cached
 *         vocabulary load); else run it and return its `corrections`.
 *       PASS 3 (relaxation) if `relaxableTerms(parsed)` is non-null (a pure AND of 2+ free-text
 *         words) and the vocabulary is loaded: drop every word whose word, stem and anchored
 *         prefix all have vocabulary count 0, via `dropTerms`, re-plan STRICTLY and run once.
 *         `dropped` lists the removed words as typed. If every word exists, or dropping would
 *         leave none, do nothing. A relaxed result still reports `dropped: []` when it
 *         dropped nothing. Never relax OR, NOT, phrase or field queries.
 *  6. Page the (sorted) matches by offset/limit; attach `match` info only for text queries;
 *     convert with `toAssetDTO`.
 *  7. `facets` only when `params.facets`: tags (top 30), colours, folders (top 20; label =
 *     path) over the matched set. For text queries computed in memory from the evaluated
 *     matches; for no-text queries by ONE Mongo aggregation over the same filter. Both feed
 *     ONE shared `finalizeFacets` (Mongo returns raw grouped rows), so their output is
 *     identical for identical data. Rules: a tag's label is the most frequent label among
 *     the matched documents, ties broken by the smaller label under plain `<` (never
 *     localeCompare); every tie-break is count descending, then `<` on the value (slug,
 *     colour name, folder id); counts are of DOCUMENTS; the colour hex comes from colors.ts.
 *  8. `pending` = count of the workspace's assets whose `tagging.status` is `pending`, or
 *     `running` with a live lease, independent of the query (the same set `runTagging` can claim).
 *  9. `limit` clamps to 1..MEDIA_LIMITS.maxPageSize; `offset` to >= 0; `q` is cut at
 *     MEDIA_LIMITS.queryMax.
 *
 * `prefixLast` is true for text queries (search-as-you-type).
 */
export async function searchAssets(
	db: Db,
	ctx: SearchContext,
	params: MediaSearchParams,
): Promise<MediaSearchResponse> {
	throw new Error('not implemented: searchAssets')
}

/**
 * The ids a search matches, for "select all N results" bulk actions. It runs
 * exactly the plans `searchAssets` runs for pass 1 and pass 2 (typo tolerance, tag
 * redirects, the folder scope, the `deep` default and `prefixLast` all derive from
 * `q`, not from the caller), so `total` is the number the person saw. It never
 * relaxes (pass 3): the UI disables "select all" when `dropped` is non-empty.
 * It fetches `cap + 1` ids, and when more than `cap` come back it reports
 * `overflow` instead of truncating: a bulk delete must never silently hit "some of"
 * the matches. Always honours the workspace.
 */
export async function resolveSearchIds(
	db: Db,
	ctx: SearchContext,
	params: Pick<MediaSearchParams, 'q' | 'folder' | 'deep'>,
	cap?: number,
): Promise<{ ids: ObjectId[]; total: number; overflow: boolean }> {
	throw new Error('not implemented: resolveSearchIds')
}

/**
 * Facet counts over a set of documents, in memory. Same shape the Mongo path
 * returns, through the same `finalizeFacets` (see step 7).
 */
export function computeFacets(
	docs: Array<
		Pick<MediaAssetDoc, 'tags' | 'colorNames' | 'folderId'>
	>,
	folders: FolderIndex,
): MediaFacets {
	throw new Error('not implemented: computeFacets')
}
