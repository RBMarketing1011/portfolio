import 'server-only'
import {
	MongoBulkWriteError,
	ObjectId,
	type AnyBulkWriteOperation,
	type Collection,
	type Db,
	type Filter,
	type WriteError,
} from 'mongodb'
import { assetsOf } from './collections'
import { MediaError } from './errors'
import { derivedFields } from './terms'
import { MEDIA_LIMITS, type MediaAssetDoc } from './types'
import { invalidateVocabulary } from './vocabulary'

/**
 * THE ONE WRITE PATH for anything that changes an asset's tags, rejected tags,
 * caption, alt text, name, notes, folder, text-in-image, keywords, kind or
 * tagging state. It exists because those writes are read-modify-write on whole
 * arrays and there are no transactions: a slow AI run (10-30 s) would otherwise
 * erase a tag a person added meanwhile, and two people editing one image would
 * overwrite each other. Every commit applies only to the revision it read.
 *
 * (Writes that touch nothing derived or user-edited, like moving an asset between
 * folders, may stay a plain `updateMany`.)
 */

/** What a mutation may change. Everything derived (`terms`, `nameKey`, `colorNames`, `updatedAt`, `rev`) is added by the commit. */
export type AssetChange = Partial<
	Pick<
		MediaAssetDoc,
		| 'name'
		| 'folderId'
		| 'tags'
		| 'rejectedTags'
		| 'caption'
		| 'altText'
		| 'captionEdited'
		| 'textInImage'
		| 'keywords'
		| 'kind'
		| 'notes'
		| 'tagging'
	>
>

/**
 * A pure function of the FRESH document. Return the fields to change, or null for
 * "nothing to do" (no write, no `rev` bump). It may be called more than once, on a
 * newer document each time, so it must not capture or depend on anything it read
 * earlier (that is the whole point).
 */
export type Mutation = (doc: MediaAssetDoc) => AssetChange | null

const DEFAULT_RETRIES = 5
/** Asking for more would only hammer one document. */
const MAX_RETRIES = 20
/** After the first write, commitMany re-runs the documents that did not land at most this many more times. */
const RERUN_PASSES = 3

/**
 * The only fields a mutation can set. Anything else it returns is dropped, so a
 * buggy mutation cannot move an asset to another workspace, rewrite `rev` or plant
 * its own `terms`: those belong to the commit.
 */
const CHANGE_KEYS = [
	'name',
	'folderId',
	'tags',
	'rejectedTags',
	'caption',
	'altText',
	'captionEdited',
	'textInImage',
	'keywords',
	'kind',
	'notes',
	'tagging',
] as const

/** Keys an extra filter must never be able to replace. */
const RESERVED = ['_id', 'workspaceId', 'rev']

const isPlain = (value: unknown): value is Record<string, unknown> => {
	if (value === null || typeof value !== 'object') return false
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * The driver stores `undefined` as null, even inside nested objects and arrays, so
 * `{ confidence: undefined }` would become `confidence: null` on disk. Null is a
 * value ("no kind"); undefined means absent. Only plain objects and arrays are
 * walked: Dates and ObjectIds pass through untouched.
 */
function clean(value: unknown, depth = 0): unknown {
	if (depth > 8) return value
	if (Array.isArray(value))
		return value
			.filter((item) => item !== undefined)
			.map((item) => clean(item, depth + 1))
	if (!isPlain(value)) return value
	const out: Record<string, unknown> = {}
	for (const [key, inner] of Object.entries(value))
		if (inner !== undefined) out[key] = clean(inner, depth + 1)
	return out
}

/** The writable part of a mutation's answer, or null when there is nothing to write. */
function toPatch(change: unknown): Record<string, unknown> | null {
	if (!isPlain(change)) return null
	const patch: Record<string, unknown> = {}
	for (const key of CHANGE_KEYS) {
		if (!Object.prototype.hasOwnProperty.call(change, key)) continue
		const value = change[key]
		if (value !== undefined) patch[key] = clean(value)
	}
	return Object.keys(patch).length > 0 ? patch : null
}

/** A document written before `rev` existed has none: it is read as null, which a `rev: null` filter matches. */
const revOf = (doc: MediaAssetDoc): number | null =>
	typeof doc.rev === 'number' && Number.isFinite(doc.rev) ? doc.rev : null

/**
 * The scope (`_id`, `workspaceId`, `rev`) can only ever be narrowed by an extra
 * filter. A key that collides with it goes through `$and`, so `{ workspaceId: other }`
 * matches nothing instead of replacing the scope.
 */
function guarded(
	base: Record<string, unknown>,
	extra: Record<string, unknown> | null,
): Filter<MediaAssetDoc> {
	if (!extra) return base as Filter<MediaAssetDoc>
	const clash = Object.keys(extra).some((key) => RESERVED.includes(key))
	return (clash ? { ...base, $and: [extra] } : { ...extra, ...base }) as Filter<MediaAssetDoc>
}

function retriesOf(value: unknown): number {
	if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_RETRIES
	return Math.min(MAX_RETRIES, Math.max(0, Math.floor(value)))
}

type Attempt = {
	doc: MediaAssetDoc
	patch: Record<string, unknown>
	merged: MediaAssetDoc
	derived: ReturnType<typeof derivedFields>
	set: Record<string, unknown>
}

/** Runs the mutation on a document and works out everything the write needs. Null when there is nothing to write. */
function prepare(doc: MediaAssetDoc, mutate: Mutation, now: Date): Attempt | null {
	const patch = toPatch(mutate(doc))
	if (!patch) return null
	const merged = { ...doc, ...patch } as MediaAssetDoc
	const derived = derivedFields(merged)
	return { doc, patch, merged, derived, set: { ...patch, ...derived, updatedAt: now } }
}

/**
 * Reads the asset (`{ _id, workspaceId, ...extraFilter }`; null if it does not match,
 * e.g. the AI claim was lost), applies `mutate` to it, merges the result, computes
 * `derivedFields(merged)` and writes ONE `updateOne` filtered on `{ _id, workspaceId,
 * rev: doc.rev, ...extraFilter }` with `$set: { ...patch, ...derived, updatedAt }` and
 * `$inc: { rev: 1 }`. If nothing matched (someone else wrote first) it re-reads and
 * re-applies, up to `retries` times (default 5). Returns the stored document, or the
 * unchanged one when `mutate` returned null, or null when the document is gone or the
 * extra filter no longer matches. After the retries it throws `MediaError` 409 "That
 * image changed while saving. Try again." Always calls `invalidateVocabulary` after a write.
 *
 * `extraFilter` is in the write filter as well as the read one. That is what makes a
 * lost AI lease fatal: a claim taken over by another worker does not bump `rev`, so
 * only the lease fields in the write filter stop the old worker from applying.
 */
export async function commitAsset(
	db: Db,
	workspaceId: ObjectId,
	id: ObjectId,
	mutate: Mutation,
	opts?: { extraFilter?: Record<string, unknown>; retries?: number },
): Promise<MediaAssetDoc | null> {
	// A value that is not an ObjectId must never reach a filter (`{ $ne: null }` would match any asset).
	if (!(workspaceId instanceof ObjectId) || !(id instanceof ObjectId)) return null
	const extra = opts?.extraFilter ?? null
	// A restriction that cannot be read must not widen the match.
	if (extra !== null && !isPlain(extra)) return null
	const retries = retriesOf(opts?.retries)
	const assets = assetsOf(db)

	for (let attempt = 0; attempt <= retries; attempt++) {
		const doc = await assets.findOne(guarded({ _id: id, workspaceId }, extra))
		if (!doc) return null

		const now = new Date()
		const next = prepare(doc, mutate, now)
		if (!next) return doc

		const rev = revOf(doc)
		const result = await assets.updateOne(
			guarded({ _id: id, workspaceId, rev }, extra),
			{ $set: next.set as Partial<MediaAssetDoc>, $inc: { rev: 1 } },
		)
		if (result.matchedCount === 1) {
			invalidateVocabulary(workspaceId)
			return { ...next.merged, ...next.derived, updatedAt: now, rev: (rev ?? 0) + 1 }
		}
		// Someone wrote first. Read again: the mutation must see what they wrote.
	}
	throw new MediaError('That image changed while saving. Try again.', 409)
}

/** True when every field of `patch` already holds exactly that value in `doc`. */
function applied(doc: MediaAssetDoc, patch: Record<string, unknown>): boolean {
	const stored = doc as unknown as Record<string, unknown>
	return Object.keys(patch).every((key) => sameValue(stored[key], patch[key]))
}

/** What a string becomes on disk: BSON is UTF-8, so a lone surrogate (JSON can carry one) is stored as U+FFFD. */
const asStored = (text: string): string => text.toWellFormed?.() ?? text

function sameValue(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (typeof a === 'string' && typeof b === 'string') return asStored(a) === asStored(b)
	if (a instanceof Date && b instanceof Date) return +a === +b
	if (a instanceof ObjectId && b instanceof ObjectId) return a.equals(b)
	if (Array.isArray(a) && Array.isArray(b))
		return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
	if (isPlain(a) && isPlain(b)) {
		const keysA = Object.keys(a).filter((key) => a[key] !== undefined)
		const keysB = Object.keys(b).filter((key) => b[key] !== undefined)
		return (
			keysA.length === keysB.length &&
			keysA.every(
				(key) => Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key]),
			)
		)
	}
	return false
}

/** One revision-filtered `updateOne` per attempt, in a single unordered bulk write. */
async function writeBatch(
	assets: Collection<MediaAssetDoc>,
	workspaceId: ObjectId,
	attempts: Attempt[],
): Promise<{ matched: number; errored: Set<number> }> {
	const ops: AnyBulkWriteOperation<MediaAssetDoc>[] = attempts.map(({ doc, set }) => ({
		updateOne: {
			filter: { _id: doc._id, workspaceId, rev: revOf(doc) } as Filter<MediaAssetDoc>,
			update: { $set: set as Partial<MediaAssetDoc>, $inc: { rev: 1 } },
		},
	}))
	try {
		const result = await assets.bulkWrite(ops, { ordered: false })
		return { matched: result.matchedCount, errored: new Set() }
	} catch (error) {
		if (!(error instanceof MongoBulkWriteError)) throw error
		// A write the server rejected (not one that merely found a newer revision) will
		// be rejected again, so it is reported and left out of the re-runs.
		const failures = ([] as WriteError[]).concat(error.writeErrors as WriteError | WriteError[])
		console.error('[media] commit: the database rejected', failures.length, 'write(s), code', failures[0]?.code)
		return { matched: error.matchedCount, errored: new Set(failures.map((failure) => failure.index)) }
	}
}

/**
 * One slice (at most bulkIdsCap documents) through up to 1 + RERUN_PASSES bulk writes.
 *
 * `bulkWrite` says how many writes matched, never which. Comparing revisions cannot
 * tell them apart (a foreign write bumps `rev` by one, just as ours does), so when some
 * writes did not match the documents are read back and one counts as done when our
 * change is in it: the fields we set are compared, which stays exact whatever else
 * changed since. The rest are re-run against their fresh state, so a mutation that
 * counts or appends still lands once per document. `changed` is the number of writes
 * that matched; a document whose change was replaced by someone else between our write
 * and the read, then written again, counts twice.
 */
async function commitSlice(
	db: Db,
	workspaceId: ObjectId,
	ids: ObjectId[],
	mutate: Mutation,
	totals: { changed: number; conflicts: number },
): Promise<void> {
	const assets = assetsOf(db)
	let pending = await assets.find({ workspaceId, _id: { $in: ids } }).toArray()

	for (let pass = 0; pending.length > 0; pass++) {
		const now = new Date()
		const attempts: Attempt[] = []
		for (const doc of pending) {
			const next = prepare(doc, mutate, now)
			if (next) attempts.push(next)
		}
		if (attempts.length === 0) return

		const { matched, errored } = await writeBatch(assets, workspaceId, attempts)
		totals.changed += matched
		totals.conflicts += errored.size

		const candidates = attempts.filter((_, index) => !errored.has(index))
		if (candidates.length === matched) return

		const patches = new Map(candidates.map((attempt) => [String(attempt.doc._id), attempt.patch]))
		const fresh = await assets
			.find({ workspaceId, _id: { $in: candidates.map((attempt) => attempt.doc._id) } })
			.toArray()
		// A document that vanished meanwhile is neither changed nor a conflict.
		const unsettled = fresh.filter((doc) => {
			const patch = patches.get(String(doc._id))
			return patch !== undefined && !applied(doc, patch)
		})
		if (unsettled.length === 0) return

		if (pass >= RERUN_PASSES) {
			// Out of passes. Only documents the mutation still wants to change are conflicts.
			for (const doc of unsettled) if (toPatch(mutate(doc))) totals.conflicts++
			return
		}
		pending = unsettled
	}
}

/**
 * The same for many assets of one workspace (ids of other workspaces are ignored),
 * in slices of MEDIA_LIMITS.bulkIdsCap: read the slice, compute each patch, write with
 * ONE `bulkWrite({ ordered: false })` of revision-filtered `updateOne`s, then re-read
 * the slice's revisions; any document whose write did not land is re-run (against its
 * fresh state) for at most 3 passes. A document that still conflicts after that is
 * counted in `conflicts`, not thrown, so a bulk action reports honestly. Safe to retry
 * (a mutation that is a no-op on a document returns null). `changed` counts documents
 * actually written. Calls `invalidateVocabulary` once at the end.
 *
 * A mutation here should return null once its work is on the document: after a
 * conflict the documents are read again and the mutation runs on those whose change is
 * not in place yet.
 */
export async function commitMany(
	db: Db,
	workspaceId: ObjectId,
	ids: ObjectId[],
	mutate: Mutation,
): Promise<{ changed: number; conflicts: number }> {
	const totals = { changed: 0, conflicts: 0 }
	if (!(workspaceId instanceof ObjectId) || !Array.isArray(ids)) return totals

	const seen = new Set<string>()
	const unique: ObjectId[] = []
	for (const id of ids) {
		if (!(id instanceof ObjectId)) continue
		const key = id.toHexString()
		if (seen.has(key)) continue
		seen.add(key)
		unique.push(id)
	}
	if (unique.length === 0) return totals

	try {
		const size = MEDIA_LIMITS.bulkIdsCap
		for (let start = 0; start < unique.length; start += size)
			await commitSlice(db, workspaceId, unique.slice(start, start + size), mutate, totals)
	} finally {
		// Even when a later slice threw, what landed before it has changed the index.
		if (totals.changed > 0) invalidateVocabulary(workspaceId)
	}
	return totals
}
