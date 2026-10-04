import 'server-only'
import type { Db, ObjectId } from 'mongodb'
import { assetsOf } from './collections'

/**
 * Every index term in a workspace with the number of assets that carry it. It
 * feeds typo tolerance and tag/word suggestions. Building it unwinds every
 * asset's `terms`, so it is cached in memory per workspace for a couple of
 * minutes and dropped on any write that changes searchable text.
 *
 * The cache lives in one server instance. Another instance keeps its own copy
 * until it expires, which is the stated lag for suggestions and typo tolerance.
 */

const TTL_MS = 120_000
/** Keeps the most frequent terms when a library has more distinct ones than this. */
const MAX_TERMS = 50_000
/** A server that sees many accounts must not grow without bound. */
const MAX_CACHED = 200

type Cached = { expires: number; value: Map<string, number> }
type Pending = { generation: number; promise: Promise<Map<string, number>> }

const cache = new Map<string, Cached>()
const pending = new Map<string, Pending>()
/**
 * Bumped by every invalidation. An aggregation remembers the number it started
 * under and caches its result only if it is still current, so a build that began
 * before a write can never put pre-write data into the cache.
 */
const generations = new Map<string, number>()
const generationOf = (key: string) => generations.get(key) ?? 0
let tick = 0

async function build(db: Db, workspaceId: ObjectId): Promise<Map<string, number>> {
	const rows = await assetsOf(db)
		.aggregate<{ _id: unknown; count: number }>(
			[
				{ $match: { workspaceId } },
				// De-duplicate within one asset so a count means "assets carrying it".
				{
					$project: {
						terms: {
							$cond: [{ $isArray: '$terms' }, { $setUnion: ['$terms', []] }, []],
						},
					},
				},
				{ $unwind: '$terms' },
				{ $group: { _id: '$terms', count: { $sum: 1 } } },
				{ $sort: { count: -1, _id: 1 } },
				{ $limit: MAX_TERMS },
			],
			{ allowDiskUse: true },
		)
		.toArray()
	const vocabulary = new Map<string, number>()
	for (const row of rows)
		if (typeof row._id === 'string' && row._id) vocabulary.set(row._id, row.count)
	return vocabulary
}

function remember(key: string, value: Map<string, number>) {
	const now = Date.now()
	if (cache.size >= MAX_CACHED) {
		for (const [other, entry] of cache) if (entry.expires <= now) cache.delete(other)
		// Maps iterate in insertion order, so the first key is the oldest.
		while (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string)
	}
	cache.delete(key)
	cache.set(key, { expires: now + TTL_MS, value })
}

/**
 * Cached 120 s per workspace. The first call after a cold start pays for the
 * aggregation; callers that arrive while it runs share it. The returned map is
 * shared, so callers must not mutate it.
 */
export async function loadVocabulary(
	db: Db,
	workspaceId: ObjectId,
): Promise<Map<string, number>> {
	const key = String(workspaceId)
	const hit = cache.get(key)
	if (hit) {
		if (hit.expires > Date.now()) return hit.value
		cache.delete(key)
	}

	const generation = generationOf(key)
	const running = pending.get(key)
	// A build that started before the last invalidation may be missing a write the
	// caller already made, so it is not shared with anyone who asks afterwards.
	if (running && running.generation === generation) return running.promise

	const entry: Pending = {
		generation,
		promise: build(db, workspaceId).then(
			(value) => {
				if (generationOf(key) === generation) remember(key, value)
				if (pending.get(key) === entry) pending.delete(key)
				return value
			},
			(error) => {
				if (pending.get(key) === entry) pending.delete(key)
				throw error
			},
		),
	}
	pending.set(key, entry)
	return entry.promise
}

/**
 * Forget a workspace's cached vocabulary. EVERY writer that changes `terms`
 * (register, update, bulk, tag rename/merge/delete, tagging results, delete,
 * import) must call this, or typo tolerance and suggestions lag behind by up to
 * the cache lifetime.
 */
export function invalidateVocabulary(workspaceId: ObjectId | string): void {
	const key = String(workspaceId)
	generations.set(key, ++tick)
	cache.delete(key)
	pending.delete(key)
}
