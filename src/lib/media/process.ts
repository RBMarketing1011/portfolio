import 'server-only'
import { ObjectId, type Db, type Filter } from 'mongodb'
import { toVisionJpeg, UnsupportedImageError } from './analyze'
import { aiUsageOf, assetsOf, foldersOf } from './collections'
import { commitAsset, type AssetChange, type Mutation } from './commit'
import { buildFolderIndex, type FolderIndex } from './folder-index'
import {
	BlobGoneError,
	BlobTooLargeError,
	BlobUrlError,
	readBlob,
} from './storage'
import {
	TaggerError,
	isTaggingConfigured,
	tagImage,
	taggingModel,
	type TagImageInput,
	type VisionResult,
} from './tagger'
import {
	canonicalizeAuto,
	listTagStats,
	loadTagRules,
	mergeAutoTags,
} from './tags'
import { clampText } from './text'
import {
	MEDIA_KINDS,
	MEDIA_LIMITS,
	type MediaAssetDoc,
	type MediaKind,
	type MediaProcessResponse,
	type MediaTaggingState,
	type MediaTaggingStatus,
	type MediaTaggingStatusDTO,
} from './types'

/**
 * The tagging queue. The queue is the `tagging.status` field itself: no worker, no
 * cron, nothing to deploy. A request claims images with a lease, tags them, and
 * returns; the browser keeps asking while anything is pending, and a registered
 * upload also nudges it once in the background. A lease that outlives a killed
 * request simply expires and the image is claimed again.
 *
 * Which writes go where. The CLAIM, the SWEEP, the queue/requeue calls and the budget
 * counters are single conditional writes whose filter is the whole rule ("only if the
 * lease is still ours / not live"): a read-modify-write through `commitAsset` could not
 * express that atomically, because a claim does not bump `rev`. Everything the run writes
 * to an image AFTER it holds the claim (the result, a failure, a release) goes through
 * `commitAsset` with the exact claim as `extraFilter`, so a worker whose lease was taken
 * over can never write over the newer state, and the result is always computed from the
 * freshest document, never from the copy read at claim time.
 */

export type ProcessedAsset = {
	id: ObjectId
	status: MediaTaggingStatus
	/** The asset as stored after this run. Null if it vanished meanwhile. */
	doc: MediaAssetDoc | null
}

/** Seams for tests: the real implementations are used when omitted. */
export type TaggingDeps = {
	configured?: () => boolean
	tag?: (
		input: TagImageInput,
		opts: { signal: AbortSignal },
	) => Promise<VisionResult>
	read?: (url: string, opts: { timeoutMs: number }) => Promise<Buffer>
	now?: () => Date
}

/**
 * What a person sees when tagging fails: a FIXED table keyed by failure kind. The
 * stored `tagging.error` is never an error's own text (which can carry hostnames,
 * request ids or URLs). Exported so a test can assert nothing else is ever stored.
 *   unavailable  "The AI service is unavailable. It will be retried."   (retryable, out of attempts)
 *   credentials  "AI credentials were rejected."                        (config)
 *   unreadable   "The image could not be read."                         (permanent, blob gone, undecodable)
 *   timeout      "Took too long to analyse."                            (a swept poison image)
 */
export const TAGGING_ERRORS: Record<
	'unavailable' | 'credentials' | 'unreadable' | 'timeout',
	string
> = {
	unavailable: 'The AI service is unavailable. It will be retried.',
	credentials: 'AI credentials were rejected.',
	unreadable: 'The image could not be read.',
	timeout: 'Took too long to analyse.',
}

/** Shown with `blocked.kind === 'rate_limited'`. Fixed text: never the provider's own words. */
const RATE_LIMITED_MESSAGE =
	'The AI service is busy. Tagging will continue shortly.'

const MAX_ATTEMPTS = MEDIA_LIMITS.aiMaxAttempts
/** A blob read gets the time left in the run, but never longer than this. */
const READ_CAP_MS = 10_000
/** A stage that failed this close to the run's deadline ran out of time; it did not fail on its own. */
const FINISH_SLACK_MS = 100
/** How many tag labels the model is shown, and how many it is canonicalised against. */
const KNOWN_TAGS_SENT = 60
const KNOWN_TAGS_POOL = 500
/** A result costs a paid model call, so losing it to write contention is worth a few more tries. */
const APPLY_RETRIES = 8
const KEYWORD_CHARS_MAX = 40
/** The tagger gives at most 15; a stub or a future model must not make the merge do unbounded work. */
const RESULT_TAGS_MAX = 100
/** Counters are housekeeping this long after their UTC day ends: the day is part of the key. */
const COUNTER_GRACE_DAYS = 1

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Every filter below leads with the workspace. `{ workspaceId: undefined }` would match every orphan, so a non-id never gets that far. */
const isObjectId = (value: unknown): value is ObjectId => value instanceof ObjectId

const validDate = (value: unknown): Date =>
	value instanceof Date && !Number.isNaN(value.getTime())
		? new Date(value.getTime())
		: new Date()

/** The clock a run reads: the injected one if it behaves, else the real one. A fresh Date every time, so nothing aliases a stub's. */
function clockOf(deps?: TaggingDeps): () => Date {
	const supplied = deps?.now
	return () => {
		if (typeof supplied === 'function') {
			try {
				const value = supplied()
				if (value instanceof Date && !Number.isNaN(value.getTime()))
					return new Date(value.getTime())
			} catch {
				// a broken clock must not stop the queue
			}
		}
		return new Date()
	}
}

function configuredOf(deps?: TaggingDeps): boolean {
	try {
		return Boolean((deps?.configured ?? isTaggingConfigured)())
	} catch {
		return false
	}
}

/** An integer in [min, max]; anything that is not a finite number is `fallback`. */
function intIn(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, Math.floor(value)))
}

/** Real ObjectIds only, each once, at most `cap`. Anything else is dropped, never turned into a wider filter. */
function uniqueIds(value: unknown, cap: number): ObjectId[] {
	if (!Array.isArray(value)) return []
	const seen = new Set<string>()
	const out: ObjectId[] = []
	for (const item of value) {
		if (!isObjectId(item)) continue
		const hex = item.toHexString()
		if (seen.has(hex)) continue
		seen.add(hex)
		out.push(item)
		if (out.length >= cap) break
	}
	return out
}

function chunks<T>(list: T[], size: number): T[][] {
	const out: T[][] = []
	for (let at = 0; at < list.length; at += size) out.push(list.slice(at, at + size))
	return out
}

function once<T>(make: () => Promise<T>): () => Promise<T> {
	let cached: Promise<T> | undefined
	return () => (cached ??= make())
}

// Built with RegExp() so the separators are escapes in the source, not literal characters.
const LINE_BREAKERS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+', 'g')

/** An error as one bounded, secret-free log line. The key never appears, even if a library put it in a message. */
function describe(error: unknown): string {
	let text: string
	try {
		text =
			error instanceof Error
				? `${error.name}: ${error.message}`
				: typeof error === 'string'
					? error
					: Object.prototype.toString.call(error)
	} catch {
		text = 'unprintable error'
	}
	const key = process.env.ANTHROPIC_API_KEY?.trim()
	if (key && key.length >= 8) text = text.split(key).join('[redacted]')
	return text
		.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]')
		.replace(/vercel_blob_[A-Za-z0-9_]+/g, '[redacted]')
		.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
		.replace(LINE_BREAKERS, ' ')
		.slice(0, 200)
}

/* -------------------------------------------------------------------------- */
/* Which images are in which state                                            */
/* -------------------------------------------------------------------------- */

type Where = Record<string, unknown>

/*
 * Every `running` image is exactly one of: live (a lease still in the future), reclaimable
 * or poisoned. They are written as complements (`$not` of the opposite test, which also
 * matches a field that is missing, null or not the right type), so no stored shape can fall
 * between them and sit where nothing counts it, takes it over or fails it.
 */

/** A lease that was never set, is not a date, or ended at or before `now`. */
const leaseOver = (now: Date): Where => ({ 'tagging.leaseUntil': { $not: { $gt: now } } })

/** `running`, nobody holds it, and it still has attempts left: the next run takes it over. */
const reclaimable = (now: Date): Where => ({
	'tagging.status': 'running',
	...leaseOver(now),
	'tagging.attempts': { $not: { $gte: MAX_ATTEMPTS } },
})

/** `running`, nobody holds it, and it is out of attempts: a request died on it every time. */
const poisoned = (now: Date): Where => ({
	'tagging.status': 'running',
	...leaseOver(now),
	'tagging.attempts': { $gte: MAX_ATTEMPTS },
})

const liveLease = (now: Date): Where => ({
	'tagging.status': 'running',
	'tagging.leaseUntil': { $gt: now },
})

/**
 * Still in the queue: `pending` (whether or not `retryAfter` has passed, so a client
 * knows to wait) or `running` with a lapsed lease and attempts left. `remaining` and
 * `getTaggingStatus().pending` are both exactly this.
 */
const queued = (now: Date): Where => ({
	$or: [{ 'tagging.status': 'pending' }, reclaimable(now)],
})

/** What a claim may take right now: queued, minus whatever a rate limit told us to leave alone. */
const claimable = (now: Date): Where => ({
	$or: [
		{ 'tagging.status': 'pending', 'tagging.retryAfter': { $not: { $gt: now } } },
		reclaimable(now),
	],
})

/** Skipped for want of a key (or with no recorded reason): recoverable. A refusal by the model is not. */
const skippedForKey: Where = {
	'tagging.status': 'skipped',
	'tagging.reason': { $in: ['not_configured', null] },
}

/** The whole `tagging` state of an image put back in the queue: nothing left of its last run. */
const QUEUE_RESET = {
	$set: { 'tagging.status': 'pending', 'tagging.attempts': 0 },
	$unset: {
		'tagging.leaseUntil': '',
		'tagging.retryAfter': '',
		'tagging.error': '',
		'tagging.reason': '',
		'tagging.model': '',
		'tagging.at': '',
	},
} as const

const asFilter = (where: Where) => where as Filter<MediaAssetDoc>

/* -------------------------------------------------------------------------- */
/* Budget                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A positive whole number written in plain digits; everything else (empty, text, zero,
 * negative, fractions, exponents, hex, absurd lengths) is "not set" and takes the
 * default. Switching AI off is `MEDIA_AI_ENABLED=false`, not a limit of 0.
 */
function limitFromEnv(name: string, fallback: number): number {
	const raw = process.env[name]
	if (typeof raw !== 'string') return fallback
	const text = raw.trim()
	if (!/^\d{1,15}$/.test(text)) return fallback
	const value = Number(text)
	return Number.isSafeInteger(value) && value >= 1 ? value : fallback
}

const workspaceLimit = () =>
	limitFromEnv('MEDIA_AI_DAILY_LIMIT', MEDIA_LIMITS.aiDailyDefault)
const globalLimit = () =>
	limitFromEnv('MEDIA_AI_GLOBAL_DAILY_LIMIT', MEDIA_LIMITS.aiGlobalDailyDefault)

/** The UTC day a counter belongs to. */
const dayOf = (at: Date): string => at.toISOString().slice(0, 10)

const utcMidnight = (at: Date, days: number): Date =>
	new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + days))

function counterKeys(workspaceId: ObjectId, at: Date): { workspace: string; global: string } {
	const day = dayOf(at)
	return { workspace: `${workspaceId.toHexString()}:${day}`, global: `global:${day}` }
}

const isDuplicateKey = (error: unknown): boolean =>
	typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000

/**
 * One counter, two steps. The one-call form (an upsert whose filter carries the `count`
 * predicate) throws E11000 on the first reservations of a day under concurrency, because
 * the predicate makes the upsert try to insert a second `_id`. So: make sure the document
 * exists with an upsert that is pure equality on `_id` (the server retries a duplicate-key
 * race for that shape), then take a unit with a guarded `$inc` that can never insert.
 * No match means the limit is reached.
 */
async function reserveOne(
	db: Db,
	id: string,
	limit: number,
	expiresAt: Date,
): Promise<boolean> {
	const usage = aiUsageOf(db)
	try {
		await usage.updateOne({ _id: id }, { $setOnInsert: { count: 0, expiresAt } }, { upsert: true })
	} catch (error) {
		// Another reserver created it in the same instant. The document exists, which is all this step is for.
		if (!isDuplicateKey(error)) throw error
	}
	const taken = await usage.findOneAndUpdate(
		{ _id: id, count: { $lte: limit - 1 } },
		{ $inc: { count: 1 } },
		{ returnDocument: 'after' },
	)
	return taken !== null
}

/** Guarded, so a refund can never push a counter below zero or create one. */
async function giveBack(db: Db, id: string): Promise<void> {
	await aiUsageOf(db).updateOne({ _id: id, count: { $gt: 0 } }, { $inc: { count: -1 } })
}

/**
 * Daily budget. ONE unit is reserved per image, AFTER that image's claim succeeded,
 * never as a batch up front (an up-front batch leaks whatever is not used), from BOTH
 * the workspace's counter (`_id` `<workspaceId>:<UTC date>`, limit MEDIA_AI_DAILY_LIMIT,
 * default MEDIA_LIMITS.aiDailyDefault) and the global one (`_id` `global:<UTC date>`,
 * limit MEDIA_AI_GLOBAL_DAILY_LIMIT, default aiGlobalDailyDefault). Algorithm, per
 * counter (the obvious one-call form is WRONG: an upsert whose filter has a `count`
 * predicate throws E11000 on the first reservations of a day under concurrency, and
 * that must never be read as "exhausted"):
 *   1. ensure the document exists: `updateOne({ _id }, { $setOnInsert: { count: 0,
 *      expiresAt } }, { upsert: true })` (pure equality on `_id`, so the server retries a
 *      duplicate-key race);
 *   2. reserve: `findOneAndUpdate({ _id, count: { $lte: limit - 1 } }, { $inc: { count: 1 } },
 *      { returnDocument: 'after' })` with NO upsert. Null means exhausted.
 * Reserve the workspace counter first, then the global one; if the global one fails,
 * refund the workspace unit. The counters' `expiresAt` is the end of the UTC day plus a
 * day of grace. Garbage env values fall back to the defaults.
 *
 * A workspace id that is not an ObjectId reserves nothing (it would key a counter
 * `undefined:<day>`), and is reported as exhausted.
 */
export async function reserveAiBudget(
	db: Db,
	workspaceId: ObjectId,
	now: Date,
): Promise<{ ok: true } | { ok: false; scope: 'workspace' | 'global' }> {
	if (!isObjectId(workspaceId)) return { ok: false, scope: 'workspace' }
	const at = validDate(now)
	const keys = counterKeys(workspaceId, at)
	const expiresAt = utcMidnight(at, 1 + COUNTER_GRACE_DAYS)
	// Both limits are read now, so one reservation never mixes two readings of the environment.
	const limits = { workspace: workspaceLimit(), global: globalLimit() }

	if (!(await reserveOne(db, keys.workspace, limits.workspace, expiresAt)))
		return { ok: false, scope: 'workspace' }

	let reserved = false
	try {
		reserved = await reserveOne(db, keys.global, limits.global, expiresAt)
	} catch (error) {
		await giveBack(db, keys.workspace).catch((inner) =>
			console.error('[media]', 'could not give back a budget unit:', describe(inner)),
		)
		throw error
	}
	if (reserved) return { ok: true }

	await giveBack(db, keys.workspace).catch((inner) =>
		console.error('[media]', 'could not give back a budget unit:', describe(inner)),
	)
	return { ok: false, scope: 'global' }
}

/**
 * Gives back one unit to both counters (a run that never reached the model). `now` must be
 * the instant the unit was reserved at, so a refund after midnight finds the right day.
 */
export async function refundAiBudget(
	db: Db,
	workspaceId: ObjectId,
	now: Date,
): Promise<void> {
	if (!isObjectId(workspaceId)) return
	const keys = counterKeys(workspaceId, validDate(now))
	const results = await Promise.allSettled([
		giveBack(db, keys.workspace),
		giveBack(db, keys.global),
	])
	// Both are attempted; the first failure is still reported.
	for (const result of results) if (result.status === 'rejected') throw result.reason
}

/** True when this account's counter or the global one has reached its limit for `at`'s UTC day. */
async function budgetSpent(db: Db, workspaceId: ObjectId, at: Date): Promise<boolean> {
	const keys = counterKeys(workspaceId, at)
	const rows = await aiUsageOf(db)
		.find({ _id: { $in: [keys.workspace, keys.global] } }, { projection: { count: 1 } })
		.toArray()
	const used = (id: string): number => {
		const row = rows.find((candidate) => candidate._id === id)
		return typeof row?.count === 'number' ? row.count : 0
	}
	return used(keys.workspace) >= workspaceLimit() || used(keys.global) >= globalLimit()
}

const tokenCount = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.min(Math.floor(value), 1_000_000_000)
		: 0

/** The call's tokens, added to the same day's documents the unit was taken from. Not an upsert: a counter without `count` would read as exhausted. */
async function recordTokens(
	db: Db,
	workspaceId: ObjectId,
	at: Date,
	usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
	if (usage.inputTokens === 0 && usage.outputTokens === 0) return
	const keys = counterKeys(workspaceId, at)
	await Promise.all(
		[keys.workspace, keys.global].map((id) =>
			aiUsageOf(db).updateOne({ _id: id }, { $inc: usage }),
		),
	)
}

/* -------------------------------------------------------------------------- */
/* Queue operations                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Counts for the status banner. `configured`/`model` come from the environment.
 *  - `pending`: the queue, exactly what `runTagging` reports as `remaining`: `pending` images
 *    (delayed ones included) and `running` ones whose lease has lapsed with attempts left.
 *  - `running`: images a live lease says a request is working on right now. Never also pending.
 *  - `failed`: `tagging.status` failed. `skipped`: skipped for want of a key (not a refusal).
 *  - `untagged`: no tags of any source, whatever the tagging state (the `is:untagged` set).
 *  - `budgetExhausted`: this account's counter or the global one has reached its limit today;
 *    `resetsAt` is the next 00:00 UTC, set only then. (Read only: nothing is written here.)
 * A `running` image that lapsed with no attempts left is in none of these until the next run
 * sweeps it to `failed`.
 */
export async function getTaggingStatus(
	db: Db,
	workspaceId: ObjectId,
	deps?: TaggingDeps,
): Promise<MediaTaggingStatusDTO> {
	const configured = configuredOf(deps)
	const status: MediaTaggingStatusDTO = {
		configured,
		model: configured ? taggingModel() : null,
		pending: 0,
		running: 0,
		failed: 0,
		skipped: 0,
		untagged: 0,
		budgetExhausted: false,
		resetsAt: null,
	}
	if (!isObjectId(workspaceId)) return status

	const now = clockOf(deps)()
	const assets = assetsOf(db)
	const count = (where: Where) => assets.countDocuments(asFilter({ workspaceId, ...where }))
	const [pending, running, failed, skipped, untagged, spent] = await Promise.all([
		count(queued(now)),
		count(liveLease(now)),
		count({ 'tagging.status': 'failed' }),
		count(skippedForKey),
		// The `is:untagged` set: no tags of any source.
		count({ tags: { $size: 0 } }),
		budgetSpent(db, workspaceId, now),
	])
	return {
		...status,
		pending,
		running,
		failed,
		skipped,
		untagged,
		budgetExhausted: spent,
		resetsAt: spent ? utcMidnight(now, 1).toISOString() : null,
	}
}

/**
 * Puts images back in the queue (`pending`, attempts 0, lease and retryAfter
 * cleared). Used by "retag". An image whose lease has not expired is left alone.
 * Returns how many were queued. Returns 0 when tagging is not configured: the
 * caller reports that to the person.
 *
 * "Left alone" is part of the write's filter, so a claim that lands while this runs is
 * never overwritten. Ids that are not ObjectIds, and ids of other accounts, match nothing.
 */
export async function queueTagging(
	db: Db,
	workspaceId: ObjectId,
	ids: ObjectId[],
	deps?: TaggingDeps,
): Promise<number> {
	if (!isObjectId(workspaceId) || !configuredOf(deps)) return 0
	const wanted = uniqueIds(ids, MEDIA_LIMITS.bulkSearchCap)
	if (wanted.length === 0) return 0

	const now = clockOf(deps)()
	let queuedCount = 0
	for (const slice of chunks(wanted, MEDIA_LIMITS.bulkIdsCap)) {
		const result = await assetsOf(db).updateMany(
			asFilter({ workspaceId, _id: { $in: slice }, $nor: [liveLease(now)] }),
			QUEUE_RESET,
		)
		queuedCount += result.matchedCount
	}
	return queuedCount
}

/**
 * Images that were skipped because no key was set (`skipped` + `not_configured`)
 * and images that failed -> `pending`. Returns how many. Only acts when configured.
 * (A `skipped` image the model refused, `declined`, stays skipped: asking again would
 * only be refused again. "Retag" can still do it on purpose.)
 */
export async function requeueUntagged(
	db: Db,
	workspaceId: ObjectId,
	deps?: TaggingDeps,
): Promise<number> {
	if (!isObjectId(workspaceId) || !configuredOf(deps)) return 0
	const now = clockOf(deps)()
	const result = await assetsOf(db).updateMany(
		asFilter({
			workspaceId,
			$or: [skippedForKey, { 'tagging.status': 'failed' }],
			// A claim that landed in between is not ours to reset.
			$nor: [liveLease(now)],
		}),
		QUEUE_RESET,
	)
	return result.matchedCount
}

/* -------------------------------------------------------------------------- */
/* One run                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An image taken by a run, and the proof of it. `leaseUntil` + `attempts` identify THIS
 * claim: attempts only grows, so two claims of one image never look alike even if a clock
 * stood still and their leases came out equal.
 */
type Claim = {
	doc: MediaAssetDoc
	attempts: number
	leaseUntil: Date
	/** The instant a budget unit was taken, until it is given back or spent. */
	reservedAt: Date | null
	seq: number
}

/** The exact claim, as a filter: the write only lands while the image is still this run's. */
const heldBy = (claim: Claim): Where => ({
	'tagging.status': 'running',
	'tagging.leaseUntil': claim.leaseUntil,
	'tagging.attempts': claim.attempts,
})

/** `pending` again as if this attempt had not been made. */
const handedBack = (claim: Claim): MediaTaggingState => ({
	status: 'pending',
	attempts: Math.max(0, claim.attempts - 1),
})

type Stage = 'read' | 'decode' | 'model' | 'apply'

/** The run ran out of time (or was told to stop) before the image could finish. Not the image's fault. */
class Unfinished extends Error {
	constructor() {
		super('The run ended before this image could finish.')
		this.name = 'Unfinished'
	}
}

type Failure =
	| { kind: 'release' }
	| { kind: 'declined' }
	| { kind: 'unreadable' }
	| { kind: 'retryable' }
	| { kind: 'rate_limited'; retryAfterMs: number }
	| { kind: 'config' }

/** Read a property of something that may be hostile (a throwing getter is just "absent"). */
function read(value: unknown, key: string): unknown {
	try {
		return typeof value === 'object' && value !== null
			? (value as Record<string, unknown>)[key]
			: undefined
	} catch {
		return undefined
	}
}

/** `instanceof`, or the same class name from another copy of a module. */
const isKind = (value: unknown, ctor: abstract new (...args: never[]) => unknown, name: string) =>
	value instanceof ctor || read(value, 'name') === name

function retryDelay(value: unknown): number {
	const ms = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
	return ms > 0
		? Math.min(Math.round(ms), MEDIA_LIMITS.aiRetryAfterMaxMs)
		: MEDIA_LIMITS.aiRetryAfterDefaultMs
}

/** What a thrown value means for the image. Anything this does not recognise is retryable. */
function failureOf(error: unknown): Failure {
	if (error instanceof Unfinished) return { kind: 'release' }
	if (isKind(error, TaggerError, 'TaggerError')) {
		switch (read(error, 'kind')) {
			case 'declined':
				return { kind: 'declined' }
			case 'config':
				return { kind: 'config' }
			case 'permanent':
				return { kind: 'unreadable' }
			case 'rate_limited':
				return { kind: 'rate_limited', retryAfterMs: retryDelay(read(error, 'retryAfterMs')) }
			default:
				return { kind: 'retryable' }
		}
	}
	// This image will never work: no point asking again.
	if (
		isKind(error, BlobGoneError, 'BlobGoneError') ||
		isKind(error, BlobUrlError, 'BlobUrlError') ||
		isKind(error, BlobTooLargeError, 'BlobTooLargeError') ||
		isKind(error, UnsupportedImageError, 'UnsupportedImageError')
	)
		return { kind: 'unreadable' }
	return { kind: 'retryable' }
}

/**
 * Runs `start`, but gives up after `ms` even if it ignores its own timeout. The loser of
 * the race can still settle later; it is observed here, so it is never an unhandled rejection.
 */
function within<T>(start: () => Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const late = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error('Timed out reading the image.')), ms)
	})
	let work: Promise<T>
	try {
		work = Promise.resolve(start())
	} catch (error) {
		work = Promise.reject(error)
	}
	return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

/** Settles with `work`, or rejects the moment `signal` aborts (a stub that ignores the signal cannot hold the run). */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const abandon = () => reject(new Error('The AI request ran out of time.'))
		if (signal.aborted) {
			work.catch(() => undefined)
			abandon()
			return
		}
		signal.addEventListener('abort', abandon, { once: true })
		work.then(
			(value) => {
				signal.removeEventListener('abort', abandon)
				resolve(value)
			},
			(error) => {
				signal.removeEventListener('abort', abandon)
				reject(error)
			},
		)
	})
}

/** What the model said, made safe to store whatever produced it (the tagger already did this; a stub or a future model may not). */
type Cleaned = {
	caption: string
	altText: string
	tags: { label: string; confidence: number }[]
	keywords: string[]
	textInImage: string
	kind: MediaKind
	usage: { inputTokens: number; outputTokens: number }
}

const KINDS: ReadonlySet<string> = new Set(MEDIA_KINDS)

function cleanResult(raw: unknown): Cleaned {
	if (typeof raw !== 'object' || raw === null) throw new Error('The AI service returned no result.')
	const text = (value: unknown, max: number) =>
		typeof value === 'string' ? clampText(value, max) : ''

	const tags: Cleaned['tags'] = []
	for (const entry of (Array.isArray(read(raw, 'tags')) ? (read(raw, 'tags') as unknown[]) : []).slice(
		0,
		RESULT_TAGS_MAX,
	)) {
		const label = read(entry, 'label')
		const confidence = read(entry, 'confidence')
		if (typeof label === 'string')
			tags.push({ label, confidence: typeof confidence === 'number' ? confidence : 0 })
	}

	const keywords: string[] = []
	const seen = new Set<string>()
	for (const entry of Array.isArray(read(raw, 'keywords')) ? (read(raw, 'keywords') as unknown[]) : []) {
		if (keywords.length >= MEDIA_LIMITS.keywordsMax) break
		const keyword = text(entry, KEYWORD_CHARS_MAX)
		if (!keyword || seen.has(keyword)) continue
		seen.add(keyword)
		keywords.push(keyword)
	}

	const kind = read(raw, 'kind')
	const usage = read(raw, 'usage')
	return {
		caption: text(read(raw, 'caption'), MEDIA_LIMITS.captionMax),
		altText: text(read(raw, 'altText'), MEDIA_LIMITS.altMax),
		tags,
		keywords,
		textInImage: text(read(raw, 'textInImage'), MEDIA_LIMITS.textInImageMax),
		kind: typeof kind === 'string' && KINDS.has(kind) ? (kind as MediaKind) : 'other',
		usage: {
			inputTokens: tokenCount(read(usage, 'inputTokens')),
			outputTokens: tokenCount(read(usage, 'outputTokens')),
		},
	}
}

type Run = {
	/** Set by a rate limit, a config error, a spent budget or a failing database: nobody claims again. */
	stopped: boolean
	/**
	 * The provider itself is refusing (a rate limit, bad credentials): an image that has not
	 * called the model yet does not, because it would only be refused too. Not set by a spent
	 * budget: a worker that already holds a reserved unit has paid for its image.
	 */
	blocked: boolean
	/** A claim found nothing left to take. */
	drained: boolean
	/** Claims this run may still make. */
	slots: number
	budgetExhausted: boolean
	config: boolean
	rateLimitMs: number
	/** The first database failure, boxed so a falsy thrown value still counts. */
	infra: { error: unknown } | null
	touched: ObjectId[]
	seq: number
	done: { seq: number; item: ProcessedAsset }[]
}

/**
 * Tags up to `limit` (default MEDIA_LIMITS.aiBatchDefault, maximum aiBatchMax) queued
 * images within a TIME BUDGET.
 *
 *  - Not configured: returns immediately with nothing processed.
 *  - Time: `start = now()`, `deadline = start + (opts.deadlineMs ?? MEDIA_LIMITS.aiRunBudgetMs)`.
 *    Never claim another image after the deadline. Each claim sets `leaseUntil = now +
 *    MEDIA_LIMITS.aiLeaseMs`. Each model call gets `AbortSignal.timeout(min(remaining,
 *    aiClientTimeoutMs))`; each blob read gets the time left (capped at 10 s). An image that
 *    cannot finish is released to `pending` with `attempts - 1` and its budget refunded:
 *    only count an attempt when the model was actually called.
 *  - Sweep first: `updateMany` of images `running` with an EXPIRED lease and `attempts >=
 *    aiMaxAttempts` -> `failed` with TAGGING_ERRORS.timeout. (A killed request never reaches
 *    the failure branch, so without this a poison image is billed forever.)
 *  - Claim: atomically (`findOneAndUpdate`) over THIS workspace's assets (a bare `_id` is
 *    never enough) take an image that is `pending` (and whose `retryAfter` is absent or
 *    past), or `running` with an expired lease AND `attempts < aiMaxAttempts`; set `running`,
 *    `leaseUntil`, `attempts + 1`. Never two workers on one image. Reserve budget (see
 *    `reserveAiBudget`) after the claim; if that fails, release the claim (`pending`,
 *    `attempts - 1`, no lease) and report `budgetExhausted`.
 *  - Per image (`concurrency` at a time, default 2): `deps.read` (or `readBlob`),
 *    `toVisionJpeg`, `tag` with `knownTags` = the workspace's top 60 tag labels and the
 *    folder path, then APPLY. Apply never merges against the claim-time document (the model
 *    call takes 10-30 s, during which a person may add a tag or edit the caption): it goes
 *    through `commitAsset` with `extraFilter` = this run's claim (`tagging.status: 'running'`
 *    and the exact `tagging.leaseUntil` it set), so the mutation sees the FRESH document:
 *      * tags: `mergeAutoTags(fresh.tags, fresh.rejectedTags, incoming, 'vision', rules)`
 *        (replaces the previous vision tags, honours rejectedTags, rules, the confidence
 *        floor and cap; manual and filename tags untouched)
 *      * `caption` / `altText`: set only if the FRESH `captionEdited` is false
 *      * `textInImage`, `keywords`, `kind`: set; `tagging`: `{ status: 'done', attempts,
 *        model, at }`, lease cleared; `commitAsset` rewrites `derivedFields` and bumps `rev`,
 *        then `invalidateVocabulary`
 *    A lost claim means the result is dropped silently. Add the call's tokens to today's
 *    usage documents (`$inc inputTokens/outputTokens`).
 *  - Failures (never thrown out of `runTagging`; recorded on the image):
 *      declined      -> `skipped` + reason `declined`
 *      permanent, BlobGone, UnsupportedImage -> `failed` + TAGGING_ERRORS.unreadable
 *      retryable     -> back to `pending` while attempts < aiMaxAttempts, else `failed` +
 *                       TAGGING_ERRORS.unavailable
 *      rate_limited  -> `pending`, `attempts - 1`, `retryAfter = now + retryAfterMs`, budget
 *                       refunded, STOP claiming, return `blocked: { kind: 'rate_limited', ... }`
 *      config        -> `pending`, `attempts - 1`, budget refunded, STOP claiming, return
 *                       `blocked: { kind: 'config', message: TAGGING_ERRORS.credentials }`
 *      any other throw -> treated as `retryable`
 *    The stored `tagging.error` is ALWAYS a TAGGING_ERRORS value; the raw error is logged
 *    server-side (`console.error('[media]', ...)`) with no key and no body.
 *  - `remaining`: THIS workspace's images still claimable: `pending` (whether or not
 *    `retryAfter` has passed, so the client knows to wait) plus `running` with an expired
 *    lease and attempts under the cap. It uses the same filter as `getTaggingStatus.pending`.
 *
 * Choices the list above leaves open:
 *  - An image is claimed at most once per run, so a retryable failure waits for the next
 *    run (the client's poll is the spacing) instead of being hot-retried three times in a row.
 *  - Budget is refunded when the model was not (successfully) reached: the image could not be
 *    read or decoded, the run ran out of time, or the provider answered 429 or a config error.
 *    It is kept when the model ran: a result (even a lost one), a refusal, a permanent
 *    rejection, a retryable failure.
 *  - A failed read or decode that is retryable counts as an attempt, so a blob that never
 *    downloads still ends in `failed` instead of being retried forever. Only running out of
 *    time is "not the image's fault".
 *  - `processed` lists images that reached a verdict. An image released without one (budget
 *    spent, out of time, or the run was stopped) is not in it. A claim lost to another worker
 *    is, with whatever is stored now.
 *  - A database failure (claim, sweep, count, budget) is the one thing that throws, and only
 *    when nothing was processed: a run that got somewhere reports what it did.
 *  - "Stop claiming" and "do not call the model" are different. Any stop reason (a spent
 *    budget, a rate limit, a config error, a failing database) ends claiming. Only a
 *    provider-wide refusal (rate limit, config) also keeps the images already in flight
 *    from calling the model, because it would only be refused too. A worker that already
 *    holds a reserved unit when another finds the budget spent finishes its image.
 *  - A claim is checked against the budget once at the start of the run (a spent budget
 *    returns at once without claiming anything) and again, per image, by the reservation.
 */
export async function runTagging(
	db: Db,
	workspaceId: ObjectId,
	opts?: {
		limit?: number
		ids?: ObjectId[]
		concurrency?: number
		deadlineMs?: number
	},
	deps?: TaggingDeps,
): Promise<{
	processed: ProcessedAsset[]
	remaining: number
	budgetExhausted: boolean
	blocked?: MediaProcessResponse['blocked']
}> {
	if (!isObjectId(workspaceId) || !configuredOf(deps))
		return { processed: [], remaining: 0, budgetExhausted: false }

	const clock = clockOf(deps)
	const startedAt = clock().getTime()
	const budgetMs =
		typeof opts?.deadlineMs === 'number' && Number.isFinite(opts.deadlineMs)
			? Math.max(0, opts.deadlineMs)
			: MEDIA_LIMITS.aiRunBudgetMs
	const deadline = startedAt + budgetMs
	const timeLeft = () => deadline - clock().getTime()

	const limit = intIn(opts?.limit, 1, MEDIA_LIMITS.aiBatchMax, MEDIA_LIMITS.aiBatchDefault)
	const concurrency = intIn(opts?.concurrency, 1, limit, Math.min(2, limit))
	// `null` is "everything this account has"; anything named, even nothing valid, only narrows.
	const named =
		opts?.ids === undefined || opts.ids === null
			? null
			: uniqueIds(opts.ids, MEDIA_LIMITS.bulkIdsCap)

	const readImage =
		deps?.read ?? ((url: string, o: { timeoutMs: number }) => readBlob(url, o))
	const askModel =
		deps?.tag ??
		((input: TagImageInput, o: { signal: AbortSignal }) => tagImage(input, { signal: o.signal }))
	const assets = assetsOf(db)

	const run: Run = {
		stopped: false,
		blocked: false,
		drained: false,
		slots: limit,
		budgetExhausted: false,
		config: false,
		rateLimitMs: 0,
		infra: null,
		touched: [],
		seq: 0,
		done: [],
	}

	/* ---- shared, loaded once and only if an image gets that far ---- */

	const known = once(async () => {
		try {
			const stats = await listTagStats(db, workspaceId, { limit: KNOWN_TAGS_POOL })
			return {
				refs: stats.map(({ slug, label }) => ({ slug, label })),
				labels: stats.slice(0, KNOWN_TAGS_SENT).map((stat) => stat.label),
			}
		} catch (error) {
			console.error('[media]', 'could not read the tag vocabulary:', describe(error))
			return { refs: [], labels: [] as string[] }
		}
	})
	const folderIndex = once(async (): Promise<FolderIndex | null> => {
		try {
			const docs = await foldersOf(db)
				.find({ workspaceId }, { projection: { _id: 1, parentId: 1, name: 1 } })
				.toArray()
			return buildFolderIndex(docs)
		} catch (error) {
			console.error('[media]', 'could not read the folders:', describe(error))
			return null
		}
	})
	const folderPathOf = async (doc: MediaAssetDoc): Promise<string> =>
		doc.folderId ? ((await folderIndex())?.pathOf(doc.folderId.toHexString()) ?? '') : ''

	/* ---- writes made while holding a claim ---- */

	/**
	 * Records `next` on the image, but only while the claim still stands. Returns what is
	 * stored now. `applied` is false when the claim was lost (someone took the image over,
	 * or it is gone) or the write failed; `failed` says it was the write, and the lease is
	 * then left to expire.
	 */
	const settle = async (
		claim: Claim,
		next: MediaTaggingState,
	): Promise<{ doc: MediaAssetDoc | null; applied: boolean; failed: boolean }> => {
		try {
			const stored = await commitAsset(db, workspaceId, claim.doc._id, () => ({ tagging: next }), {
				extraFilter: heldBy(claim),
				retries: APPLY_RETRIES,
			})
			if (stored) return { doc: stored, applied: true, failed: false }
		} catch (error) {
			console.error('[media]', 'could not record the outcome:', claim.doc._id.toHexString(), describe(error))
			return { doc: null, applied: false, failed: true }
		}
		return { doc: await currentDoc(claim), applied: false, failed: false }
	}

	const currentDoc = async (claim: Claim): Promise<MediaAssetDoc | null> => {
		try {
			return await assets.findOne({ _id: claim.doc._id, workspaceId })
		} catch {
			return null
		}
	}

	const refund = async (claim: Claim): Promise<void> => {
		const at = claim.reservedAt
		if (!at) return
		claim.reservedAt = null
		try {
			await refundAiBudget(db, workspaceId, at)
		} catch (error) {
			console.error('[media]', 'could not give back a budget unit:', describe(error))
		}
	}

	const conclude = (claim: Claim, status: MediaTaggingStatus, doc: MediaAssetDoc | null) => {
		run.done.push({ seq: claim.seq, item: { id: claim.doc._id, status, doc } })
	}

	/* ---- one image ---- */

	const apply = async (claim: Claim, result: Cleaned): Promise<void> => {
		// After the model call, not before: a tag deleted or renamed while it ran must not come back.
		const rules = await loadTagRules(db, workspaceId)
		const finishedAt = clock()
		const model = taggingModel()
		const { refs } = await known()
		const incoming = canonicalizeAuto(result.tags, refs)

		const mutate: Mutation = (fresh) => {
			const change: AssetChange = {
				tags: mergeAutoTags(fresh.tags, fresh.rejectedTags, incoming, 'vision', rules),
				textInImage: result.textInImage,
				keywords: result.keywords,
				kind: result.kind,
				tagging: { status: 'done', attempts: claim.attempts, model, at: finishedAt },
			}
			// A person's words win, judged on the document as it is now. An empty reply never erases text.
			if (!fresh.captionEdited) {
				if (result.caption) change.caption = result.caption
				if (result.altText) change.altText = result.altText
			}
			return change
		}

		const stored = await commitAsset(db, workspaceId, claim.doc._id, mutate, {
			extraFilter: heldBy(claim),
			retries: APPLY_RETRIES,
		})
		if (stored) {
			conclude(claim, 'done', stored)
			return
		}
		// The claim was lost (another worker owns the image now) or the image is gone: drop the result.
		const current = await currentDoc(claim)
		conclude(claim, current?.tagging?.status ?? 'done', current)
	}

	const recover = async (claim: Claim, stage: Stage, error: unknown): Promise<void> => {
		let failure = failureOf(error)
		// Running out of time is not the image's fault, and no attempt is counted for it. The
		// slack covers a timer that fires a millisecond before the clock says the time is up.
		if (failure.kind === 'retryable' && stage !== 'apply' && timeLeft() <= FINISH_SLACK_MS)
			failure = { kind: 'release' }
		if (failure.kind !== 'release')
			console.error(
				'[media]',
				`tagging failed (${stage}, ${failure.kind})`,
				claim.doc._id.toHexString(),
				describe(error),
			)

		const at = clock()
		const beforeModel = stage === 'read' || stage === 'decode'
		let next: MediaTaggingState
		let refundUnit = false
		let verdict = true
		switch (failure.kind) {
			case 'release':
				next = handedBack(claim)
				refundUnit = true
				verdict = false
				break
			case 'declined':
				next = { status: 'skipped', attempts: claim.attempts, reason: 'declined', at }
				break
			case 'unreadable':
				next = { status: 'failed', attempts: claim.attempts, error: TAGGING_ERRORS.unreadable, at }
				refundUnit = beforeModel
				break
			case 'retryable':
				next =
					claim.attempts < MAX_ATTEMPTS
						? { status: 'pending', attempts: claim.attempts }
						: { status: 'failed', attempts: claim.attempts, error: TAGGING_ERRORS.unavailable, at }
				refundUnit = beforeModel
				break
			case 'rate_limited':
				// Not this image's doing, so it is not an attempt, and it is left alone until the provider says so.
				next = { ...handedBack(claim), retryAfter: new Date(at.getTime() + failure.retryAfterMs) }
				refundUnit = true
				run.stopped = true
				run.blocked = true
				run.rateLimitMs = Math.max(run.rateLimitMs, failure.retryAfterMs)
				break
			case 'config':
				next = handedBack(claim)
				refundUnit = true
				run.stopped = true
				run.blocked = true
				run.config = true
				break
		}

		const settled = await settle(claim, next)
		if (refundUnit) await refund(claim)
		if (verdict) {
			// What is stored if the claim was lost, what the run concluded if the image is gone, and
			// "still running" only when the write itself failed and the lease is all there is.
			const status = settled.applied
				? next.status
				: settled.doc
					? (settled.doc.tagging?.status ?? next.status)
					: settled.failed
						? 'running'
						: next.status
			conclude(claim, status, settled.doc)
		}
	}

	const handle = async (claim: Claim): Promise<void> => {
		const doc = claim.doc
		let stage: Stage = 'read'
		try {
			if (run.blocked) throw new Unfinished()
			const readMs = Math.min(READ_CAP_MS, timeLeft())
			if (readMs <= 0) throw new Unfinished()
			const bytes = await within(() => readImage(doc.url, { timeoutMs: readMs }), readMs)

			stage = 'decode'
			const jpeg = await toVisionJpeg(bytes)

			const [vocabulary, folderPath] = await Promise.all([known(), folderPathOf(doc)])
			const callMs = Math.min(timeLeft(), MEDIA_LIMITS.aiClientTimeoutMs)
			if (run.blocked || callMs <= 0) throw new Unfinished()

			stage = 'model'
			const input: TagImageInput = {
				jpegBase64: jpeg.data,
				filename: doc.filename,
				knownTags: vocabulary.labels,
			}
			if (folderPath) input.folderPath = folderPath
			const signal = AbortSignal.timeout(Math.max(1, Math.floor(callMs)))
			let call: Promise<VisionResult>
			try {
				call = Promise.resolve(askModel(input, { signal }))
			} catch (error) {
				call = Promise.reject(error)
			}
			const result = cleanResult(await untilAborted(call, signal))

			// Spent whether or not the result can still be applied.
			try {
				await recordTokens(db, workspaceId, claim.reservedAt ?? clock(), result.usage)
			} catch (error) {
				console.error('[media]', 'could not record token usage:', describe(error))
			}

			stage = 'apply'
			await apply(claim, result)
		} catch (error) {
			await recover(claim, stage, error)
		}
	}

	/* ---- claiming ---- */

	const claimNext = async (): Promise<Claim | null> => {
		const now = clock()
		const ids: Record<string, unknown> = {}
		if (named) ids.$in = named
		if (run.touched.length > 0) ids.$nin = run.touched
		const leaseUntil = new Date(now.getTime() + MEDIA_LIMITS.aiLeaseMs)
		const doc = await assets.findOneAndUpdate(
			asFilter({
				workspaceId,
				...(Object.keys(ids).length > 0 ? { _id: ids } : {}),
				...claimable(now),
			}),
			// A pipeline rather than `$inc`, which throws on a stored null or text: one such
			// document would then fail every claim of the account. Not a number counts as 0.
			[
				{
					$set: {
						'tagging.status': 'running',
						'tagging.leaseUntil': leaseUntil,
						'tagging.attempts': {
							$add: [{ $cond: [{ $isNumber: '$tagging.attempts' }, '$tagging.attempts', 0] }, 1],
						},
					},
				},
				{ $unset: 'tagging.retryAfter' },
			],
			{ returnDocument: 'after' },
		)
		if (!doc) return null
		run.touched.push(doc._id)
		const attempts = doc.tagging?.attempts
		return {
			doc,
			attempts: typeof attempts === 'number' ? attempts : 1,
			leaseUntil: doc.tagging?.leaseUntil instanceof Date ? doc.tagging.leaseUntil : leaseUntil,
			reservedAt: null,
			seq: run.seq++,
		}
	}

	const work = async (): Promise<void> => {
		while (!run.stopped && !run.drained && run.slots > 0 && timeLeft() > 0) {
			run.slots--
			let claim: Claim | null
			try {
				claim = await claimNext()
			} catch (error) {
				run.infra ??= { error }
				run.stopped = true
				console.error('[media]', 'could not claim an image:', describe(error))
				return
			}
			if (!claim) {
				run.slots++
				run.drained = true
				return
			}

			// Another worker may have found the run blocked while this claim was in flight.
			if (run.stopped) {
				await settle(claim, handedBack(claim))
				return
			}
			const reservedAt = clock()
			let verdict: Awaited<ReturnType<typeof reserveAiBudget>>
			try {
				verdict = await reserveAiBudget(db, workspaceId, reservedAt)
			} catch (error) {
				run.infra ??= { error }
				run.stopped = true
				console.error('[media]', 'could not reserve budget:', describe(error))
				await settle(claim, handedBack(claim))
				return
			}
			if (!verdict.ok) {
				run.budgetExhausted = true
				run.stopped = true
				await settle(claim, handedBack(claim))
				return
			}
			claim.reservedAt = reservedAt

			try {
				await handle(claim)
			} catch (error) {
				// `handle` records its own failures; this is a bug or a database outage.
				run.infra ??= { error }
				console.error('[media]', 'unexpected failure while tagging:', describe(error))
			}
		}
	}

	/* ---- the run ---- */

	const sweptAt = clock()
	await assets.updateMany(asFilter({ workspaceId, ...poisoned(sweptAt) }), {
		$set: {
			'tagging.status': 'failed',
			'tagging.error': TAGGING_ERRORS.timeout,
			'tagging.at': sweptAt,
		},
		$unset: { 'tagging.leaseUntil': '', 'tagging.retryAfter': '' },
	})

	// Known spent: do not claim an image only to hand it back.
	if (await budgetSpent(db, workspaceId, clock())) run.budgetExhausted = true
	else {
		const results = await Promise.allSettled(Array.from({ length: concurrency }, () => work()))
		for (const result of results)
			if (result.status === 'rejected') run.infra ??= { error: result.reason }
	}

	const remaining = await assets.countDocuments(asFilter({ workspaceId, ...queued(clock()) }))
	if (run.infra && run.done.length === 0) throw run.infra.error

	run.done.sort((a, b) => a.seq - b.seq)
	const blocked: MediaProcessResponse['blocked'] = run.config
		? { kind: 'config', message: TAGGING_ERRORS.credentials }
		: run.rateLimitMs > 0
			? { kind: 'rate_limited', message: RATE_LIMITED_MESSAGE, retryAfterMs: run.rateLimitMs }
			: undefined
	return {
		processed: run.done.map((entry) => entry.item),
		remaining,
		budgetExhausted: run.budgetExhausted,
		...(blocked ? { blocked } : {}),
	}
}
