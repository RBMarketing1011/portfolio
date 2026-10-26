import 'server-only'
import { ObjectId, type Db } from 'mongodb'
import { aiUsageOf } from '@/lib/media/collections'
import type { CallUsage } from './contract'

/**
 * The AI builder's daily allowance (section 15.4), shared with the section writer. Units
 * are reserved before any model call and given back for work that never happened;
 * tokens are added to the same day's counters after every call.
 *
 * Counters live in the media library's AI usage collection (its TTL index already
 * exists), one per workspace and one global per UTC day:
 *   `builder:<workspaceId hex>:<YYYY-MM-DD>` (the key the section writer has always used)
 *   `builder:global:<YYYY-MM-DD>`
 * each `{ count, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, expiresAt }`.
 * A refund names the day of its reservation, so one after midnight finds the right counter.
 */

const DAY_MS = 86_400_000
const DAY = /^\d{4}-\d{2}-\d{2}$/
const UNITS_MAX = 1_000_000

/** Plain digits, at least 1; anything else (empty, text, zero, fractions, hex) takes the default. Like `limitFromEnv` in process.ts. */
function limitFromEnv(name: string, fallback: number): number {
	const raw = process.env[name]
	if (typeof raw !== 'string') return fallback
	const text = raw.trim()
	if (!/^\d{1,15}$/.test(text)) return fallback
	const value = Number(text)
	return Number.isSafeInteger(value) && value >= 1 ? value : fallback
}

/** The day's limits, read from the environment each time. */
export function budgetLimits(): { workspace: number; global: number; outputTokens: number } {
	return {
		workspace: limitFromEnv('BUILDER_AI_DAILY_LIMIT', 100),
		global: limitFromEnv('BUILDER_AI_GLOBAL_DAILY_LIMIT', 2000),
		// A soft cap, checked before each model call.
		outputTokens: limitFromEnv('BUILDER_AI_DAILY_OUTPUT_TOKENS', 2_000_000),
	}
}

const validDate = (value: Date) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date())

/** The UTC day a counter belongs to. */
const dayOf = (at: Date): string => validDate(at).toISOString().slice(0, 10)

const isObjectId = (value: unknown): value is ObjectId => value instanceof ObjectId

const counterKeys = (workspaceId: ObjectId, day: string) => ({
	workspace: `builder:${workspaceId.toHexString()}:${day}`,
	global: `builder:global:${day}`,
})

const isDuplicateKey = (error: unknown): boolean =>
	typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000

const wholeUnits = (units: number) =>
	typeof units === 'number' && Number.isFinite(units) ? Math.min(Math.max(0, Math.floor(units)), UNITS_MAX) : 0

/**
 * One counter, two steps (the pattern documented in src/lib/media/process.ts). The
 * one-call form, an upsert whose filter carries the `count` predicate, throws E11000 on
 * a day's first reservations under concurrency, and that must never read as
 * "exhausted". So: make sure the document exists with an upsert that is pure equality on
 * `_id`, then take the units with a guarded `$inc` that can never insert.
 */
async function take(db: Db, id: string, units: number, limit: number, expiresAt: Date): Promise<boolean> {
	if (units > limit) return false
	try {
		await aiUsageOf(db).updateOne({ _id: id }, { $setOnInsert: { count: 0, expiresAt } }, { upsert: true })
	} catch (error) {
		// Another reserver created it in the same instant: the document exists, which is all this step is for.
		if (!isDuplicateKey(error)) throw error
	}
	const doc = await aiUsageOf(db).findOneAndUpdate(
		{ _id: id, count: { $lte: limit - units } },
		{ $inc: { count: units } },
		{ returnDocument: 'after' },
	)
	return doc !== null
}

/** Never below zero, never creates a counter. */
async function giveBack(db: Db, id: string, units: number): Promise<void> {
	await aiUsageOf(db).updateOne({ _id: id }, [{ $set: { count: { $max: [0, { $subtract: ['$count', units] }] } } }])
}

/**
 * Reserves `units` from this workspace's counter, then the global one; when the global
 * one is full, the workspace's units are given back. Nothing is reserved on a refusal.
 * `day` is what the refunds of this reservation must name.
 */
export async function reserveUnits(
	db: Db,
	workspaceId: ObjectId,
	units: number,
	now: Date,
): Promise<{ ok: true; day: string } | { ok: false; scope: 'workspace' | 'global' }> {
	const at = validDate(now)
	const day = dayOf(at)
	if (!isObjectId(workspaceId)) return { ok: false, scope: 'workspace' }
	const n = wholeUnits(units)
	if (n === 0) return { ok: true, day }
	const keys = counterKeys(workspaceId, day)
	const expiresAt = new Date(at.getTime() + 2 * DAY_MS)
	// Both limits are read once, so a reservation never mixes two readings of the environment.
	const limits = budgetLimits()

	if (!(await take(db, keys.workspace, n, limits.workspace, expiresAt))) return { ok: false, scope: 'workspace' }

	let reserved = false
	try {
		reserved = await take(db, keys.global, n, limits.global, expiresAt)
	} catch (error) {
		await giveBack(db, keys.workspace, n).catch((inner) => logFailure('give back', inner))
		throw error
	}
	if (reserved) return { ok: true, day }
	await giveBack(db, keys.workspace, n).catch((inner) => logFailure('give back', inner))
	return { ok: false, scope: 'global' }
}

/** Gives `units` back to both counters of `day` (the reservation's day, even after midnight). */
export async function refundUnits(db: Db, workspaceId: ObjectId, day: string, units: number): Promise<void> {
	const n = wholeUnits(units)
	if (!isObjectId(workspaceId) || !DAY.test(day) || n === 0) return
	const keys = counterKeys(workspaceId, day)
	const results = await Promise.allSettled([giveBack(db, keys.workspace, n), giveBack(db, keys.global, n)])
	// Both are attempted; the first failure is still reported.
	for (const result of results) if (result.status === 'rejected') throw result.reason
}

/**
 * Adds a call's tokens to both counters of `day`. Not an upsert: the counters exist
 * from the reservation, and one created here without `count` would misreport the day.
 */
export async function recordUsage(db: Db, workspaceId: ObjectId, day: string, usage: CallUsage): Promise<void> {
	if (!isObjectId(workspaceId) || !DAY.test(day)) return
	const add = {
		inputTokens: tokens(usage?.inputTokens),
		outputTokens: tokens(usage?.outputTokens),
		cacheReadTokens: tokens(usage?.cacheReadTokens),
		cacheWriteTokens: tokens(usage?.cacheWriteTokens),
	}
	if (Object.values(add).every((value) => value === 0)) return
	const keys = counterKeys(workspaceId, day)
	await Promise.all([keys.workspace, keys.global].map((id) => aiUsageOf(db).updateOne({ _id: id }, { $inc: add })))
}

/** Units this workspace has used today, its limit, and when the day resets (the next UTC midnight). */
export async function unitsToday(
	db: Db,
	workspaceId: ObjectId,
	now: Date,
): Promise<{ used: number; limit: number; resetsAt: string }> {
	const at = validDate(now)
	const limit = budgetLimits().workspace
	const resetsAt = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1)).toISOString()
	if (!isObjectId(workspaceId)) return { used: 0, limit, resetsAt }
	const doc = await aiUsageOf(db).findOne({ _id: counterKeys(workspaceId, dayOf(at)).workspace }, { projection: { count: 1 } })
	return { used: tokens(doc?.count), limit, resetsAt }
}

/** Output tokens (thinking included) this workspace has spent today: the soft cap's measure. */
export async function outputTokensToday(db: Db, workspaceId: ObjectId, now: Date): Promise<number> {
	if (!isObjectId(workspaceId)) return 0
	const doc = await aiUsageOf(db).findOne(
		{ _id: counterKeys(workspaceId, dayOf(now)).workspace },
		{ projection: { outputTokens: 1 } },
	)
	return tokens(doc?.outputTokens)
}

function tokens(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 1_000_000_000) : 0
}

function logFailure(what: string, error: unknown) {
	console.error('[ai-build]', JSON.stringify({ budget: what, failed: error instanceof Error ? error.name : 'unknown' }))
}
