import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Collection, Db, Document, Filter, IndexDescription, ObjectId, UpdateFilter } from 'mongodb'
import {
	AI_LIMITS,
	PROFILE_FIELD_LABELS,
	type ApiError,
	type BuildStatus,
	type BuildSummary,
	type BuildView,
	type CallUsage,
	type ChromeView,
	type Issue,
	type PageView,
} from './contract'
import { BUSINESS_TYPES } from '../site-profile'
import { refundUnits } from './budget'
import { AiError } from './errors'
import type { AiBuildDoc, BuildPageDoc, ImagePlan, NormalizedPage, NormalizedPlan, WrittenPage } from './types'

/**
 * The `aiBuilds` collection (sections 5.3 and 5.4): one document per run of the
 * pipeline, kept for 24 hours, and every state change it goes through.
 *
 * Every transition is one guarded write, so two requests can never both win it:
 *  - `active` exists only while a build can still change (planning, planned, writing,
 *    ready); a partial unique index on it allows one such build per site;
 *  - a page is written under a lease (`leaseId`, `leaseUntil`): only the holder may
 *    record its outcome, and a holder that died frees the page when the lease runs out
 *    (the dead attempt counts);
 *  - units go back at most once: per page through its `refunded` flag, for the whole
 *    build through `budget.refunded`, and always to the day they were reserved on.
 */

export const AI_BUILDS = 'aiBuilds'

export const buildsOf = (db: Db): Collection<AiBuildDoc> => db.collection<AiBuildDoc>(AI_BUILDS)

const BUILD_ID = /^bld_[0-9a-f]{24}$/
const WRITABLE: BuildStatus[] = ['planned', 'writing', 'ready']
const ACTIVE: BuildStatus[] = ['planning', 'planned', 'writing', 'ready']
/** A teammate's finished, unapplied build is not thrown away while they may still apply it. */
const TEAMMATE_READY_MS = 30 * 60_000

/** Everything but the heavy parts (written pages, the plan, the frozen writer context): for decisions and log lines. */
const LIGHT = {
	'pages.written': 0,
	input: 0,
	snapshot: 0,
	context: 0,
	plan: 0,
	design: 0,
	chrome: 0,
	images: 0,
	writerContext: 0,
	profilePatch: 0,
} as const

/* -------------------------------------------------------------------------- */
/* Indexes and ids                                                            */
/* -------------------------------------------------------------------------- */

/** Also created by scripts/ensure-indexes.mjs, with the same names and options. */
export const BUILD_INDEXES: IndexDescription[] = [
	{ key: { expiresAt: 1 }, name: 'ttl', expireAfterSeconds: 0 },
	{ key: { siteId: 1 }, name: 'one_active_build_per_site', unique: true, partialFilterExpression: { active: true } },
	{ key: { workspaceId: 1, active: 1 }, name: 'active_by_workspace' },
	{ key: { siteId: 1, userId: 1, createdAt: -1 }, name: 'by_site_user' },
]

const indexed = new WeakMap<Db, Promise<void>>()

/** Idempotent and memoized per process. A failure is logged, never fatal, and the next build tries again. */
export function ensureBuildIndexes(db: Db): Promise<void> {
	const known = indexed.get(db)
	if (known) return known
	const pending = buildsOf(db)
		.createIndexes(BUILD_INDEXES)
		.then(
			() => undefined,
			(error: unknown) => {
				indexed.delete(db)
				console.error('[ai-build]', JSON.stringify({ indexes: 'failed', name: nameOf(error) }))
			},
		)
	indexed.set(db, pending)
	return pending
}

/** 'bld_' + 24 hex (12 random bytes). */
export function newBuildId(): string {
	return `bld_${randomBytes(12).toString('hex')}`
}

const newLeaseId = () => randomBytes(16).toString('hex')

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

const isDuplicateKey = (error: unknown): boolean =>
	typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000

function nameOf(error: unknown): string {
	if (!(error instanceof Error)) return typeof error
	const code = (error as { code?: unknown }).code
	return typeof code === 'number' || typeof code === 'string' ? `${error.name} ${code}` : error.name
}

const count = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 1_000_000_000) : 0

function cleanUsage(usage: Partial<CallUsage> | null | undefined): CallUsage {
	return {
		inputTokens: count(usage?.inputTokens),
		outputTokens: count(usage?.outputTokens),
		cacheReadTokens: count(usage?.cacheReadTokens),
		cacheWriteTokens: count(usage?.cacheWriteTokens),
		calls: count(usage?.calls),
		ms: count(usage?.ms),
	}
}

/** `$inc` entries adding a call's usage under `prefix` ('usage.', 'pages.$.usage.'). */
function usageInc(prefix: string, usage: CallUsage): Record<string, number> {
	const add: Record<string, number> = {}
	for (const [field, value] of Object.entries(usage)) add[`${prefix}${field}`] = value
	return add
}

const iso = (value: unknown): string => {
	const date = value instanceof Date ? value : new Date(value as string)
	return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

const later = (value: unknown, than: Date) => value instanceof Date && value.getTime() > than.getTime()

/** Which models answered a stage's calls and whether a fallback served one, when the caller passes them. */
export type Served = { models?: string[]; fallback?: boolean }

function servedOps(served: Served | undefined): { set: Record<string, unknown>; addToSet: Record<string, unknown> | null } {
	const models = [...new Set((served?.models ?? []).filter((model) => typeof model === 'string' && model.length > 0 && model.length <= 100))].slice(0, 10)
	return {
		set: served?.fallback === true ? { fallbackUsed: true } : {},
		addToSet: models.length ? { servedModels: { $each: models } } : null,
	}
}

/** One line per build when it lands, fails, is cancelled or is abandoned (section 15.8). Never content. */
function logBuild(doc: Pick<AiBuildDoc, '_id' | 'siteId' | 'status' | 'mode' | 'placement' | 'pages' | 'budget' | 'usage' | 'createdAt'>, now: Date) {
	const pages = doc.pages ?? []
	console.info(
		'[ai-build]',
		JSON.stringify({
			buildId: doc._id,
			siteId: String(doc.siteId),
			status: doc.status,
			mode: doc.mode,
			placement: doc.placement,
			pages: pages.length,
			written: pages.filter((page) => page.status === 'written').length,
			failed: pages.filter((page) => page.status === 'failed').length,
			units: { reserved: doc.budget?.reserved ?? 0, refunded: doc.budget?.refunded ?? 0 },
			outputTokens: doc.usage?.outputTokens ?? 0,
			ms: doc.createdAt instanceof Date ? now.getTime() - doc.createdAt.getTime() : null,
		}),
	)
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The build, only for its owner: the site, the workspace and the person who started it
 * must all match. Anything else, a malformed id or an expired document is `null` (the
 * routes answer 404, so nobody can probe for other people's builds). The page route,
 * which answers 410 for a build past its time, asks for `includeExpired`.
 */
export async function loadBuild(
	db: Db,
	buildId: string,
	owner: { siteId: ObjectId; workspaceId: ObjectId; userId: string },
	opts?: { includeExpired?: boolean },
): Promise<AiBuildDoc | null> {
	if (typeof buildId !== 'string' || !BUILD_ID.test(buildId)) return null
	const doc = await buildsOf(db).findOne({ _id: buildId, siteId: owner.siteId })
	if (!doc) return null
	if (!doc.workspaceId?.equals(owner.workspaceId) || doc.userId !== owner.userId) return null
	if (!opts?.includeExpired && !later(doc.expiresAt, new Date())) return null
	return doc
}

/** This person's unexpired builds for the site, newest first, at most 3. */
export async function listBuilds(db: Db, siteId: ObjectId, userId: string, now: Date): Promise<BuildSummary[]> {
	const docs = await buildsOf(db)
		.find(
			{ siteId, userId, expiresAt: { $gt: now } },
			{ projection: { status: 1, mode: 1, placement: 1, createdAt: 1, 'pages.status': 1 }, sort: { createdAt: -1 }, limit: 3 },
		)
		.toArray()
	return docs.map((doc) => ({
		id: doc._id,
		status: doc.status,
		mode: doc.mode,
		placement: doc.placement,
		createdAt: iso(doc.createdAt),
		pages: doc.pages?.length ?? 0,
		written: (doc.pages ?? []).filter((page) => page.status === 'written').length,
	}))
}

/** True once a cancel was requested, or when the build is gone (its site was deleted): either way, stop. */
export async function isCancelled(db: Db, buildId: string): Promise<boolean> {
	const doc = await buildsOf(db).findOne({ _id: buildId }, { projection: { cancelRequestedAt: 1 } })
	return !doc || doc.cancelRequestedAt != null
}

/* -------------------------------------------------------------------------- */
/* Creating, superseding, planning                                            */
/* -------------------------------------------------------------------------- */

/** 'conflict' when the site already has an active build (the partial unique index). */
export async function insertBuild(db: Db, doc: AiBuildDoc): Promise<'ok' | 'conflict'> {
	try {
		await buildsOf(db).insertOne(doc)
		return 'ok'
	} catch (error) {
		if (isDuplicateKey(error)) return 'conflict'
		throw error
	}
}

const hasLiveLease = (doc: Pick<AiBuildDoc, 'pages' | 'outline'>, now: Date) =>
	(doc.pages ?? []).some((page) => page.status === 'writing' && later(page.leaseUntil, now)) ||
	(doc.outline?.status === 'running' && later(doc.outline.leaseUntil, now))

/** What an active build becomes when this person starts a new one, or null when it stays. */
function supersededAs(doc: AiBuildDoc, userId: string, now: Date): 'cancelled' | 'abandoned' | 'inactive' | null {
	if (!ACTIVE.includes(doc.status)) return 'inactive'
	const idle = now.getTime() - (doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : 0)
	if (doc.status === 'ready') {
		if (doc.userId === userId) return 'cancelled'
		return idle > TEAMMATE_READY_MS ? 'abandoned' : null
	}
	// planning, planned, writing: stale and with nobody working on it.
	return idle > AI_LIMITS.staleActiveMs && !hasLiveLease(doc, now) ? 'abandoned' : null
}

/**
 * Gives back what a stopped build will never use: everything still reserved when it
 * stopped while planning; otherwise each page that never reached `written` and was not
 * refunded yet. Third-attempt units are never given back once the attempt started.
 */
async function releaseUnits(db: Db, before: AiBuildDoc): Promise<number> {
	if (before.status === 'planning') return refundRemaining(db, before._id)
	let refunded = 0
	for (const page of before.pages ?? [])
		if (page.status !== 'written' && !page.refunded && (await refundPage(db, before, page.key))) refunded++
	return refunded
}

/** Everything reserved and not yet refunded goes back, once (optimistic on `budget`). */
async function refundRemaining(db: Db, buildId: string): Promise<number> {
	const builds = buildsOf(db)
	for (let tries = 0; tries < 5; tries++) {
		const doc = await builds.findOne({ _id: buildId }, { projection: { budget: 1, workspaceId: 1 } })
		if (!doc?.budget) return 0
		const left = doc.budget.reserved - doc.budget.refunded
		if (!(left > 0)) return 0
		const result = await builds.updateOne(
			{ _id: buildId, 'budget.reserved': doc.budget.reserved, 'budget.refunded': doc.budget.refunded },
			{ $set: { 'budget.refunded': doc.budget.reserved } },
		)
		if (result.modifiedCount === 1) {
			await refundUnits(db, doc.workspaceId, doc.budget.day, left)
			return left
		}
	}
	return 0
}

/**
 * Clears the way for a new build on this site (section 4.2 step 2): this person's own
 * `ready` builds are cancelled; a teammate's `ready` build is abandoned only after 30
 * idle minutes; a planning, planned or writing build is abandoned when it has been idle
 * for 6 minutes and nobody holds a live lease on it. Each refunds what it never used.
 * Returns the build that is still active, if any (the route's 409).
 */
export async function supersede(
	db: Db,
	siteId: ObjectId,
	userId: string,
	now: Date,
): Promise<{ active: { buildId: string; userId: string } | null }> {
	const builds = buildsOf(db)
	const actives = await builds.find({ siteId, active: true }, { projection: LIGHT }).toArray()
	for (const doc of actives) {
		const next = supersededAs(doc, userId, now)
		if (!next) continue
		if (next === 'inactive') {
			// Inconsistent (a finished build still flagged active): only the flag goes.
			await builds.updateOne({ _id: doc._id, status: doc.status }, { $unset: { active: '' } })
			continue
		}
		// Guarded on what was read: a build that moved on meanwhile is left alone.
		const filter: Filter<AiBuildDoc> = { _id: doc._id, active: true, status: doc.status, updatedAt: doc.updatedAt }
		if (next === 'abandoned' && doc.status !== 'ready') {
			filter.pages = { $not: { $elemMatch: { status: 'writing', leaseUntil: { $gt: now } } } }
			filter.$nor = [{ 'outline.status': 'running', 'outline.leaseUntil': { $gt: now } }]
		}
		const open = Array.isArray(doc.pages)
		const before = await builds.findOneAndUpdate(
			filter,
			{
				$set: {
					status: next,
					updatedAt: now,
					...(open ? { 'pages.$[open].status': 'cancelled', 'pages.$[open].leaseId': null, 'pages.$[open].leaseUntil': null } : {}),
				},
				$unset: { active: '' },
			},
			{
				returnDocument: 'before',
				projection: LIGHT,
				...(open ? { arrayFilters: [{ 'open.status': { $in: ['pending', 'failed', 'writing'] } }] } : {}),
			},
		)
		if (!before) continue
		const refunded = await releaseUnits(db, before)
		logBuild({ ...before, status: next, budget: { ...before.budget, refunded: before.budget.refunded + refunded } }, now)
	}
	const remaining = await builds.findOne({ siteId, active: true }, { projection: { _id: 1, userId: 1 } })
	return { active: remaining ? { buildId: remaining._id, userId: remaining.userId } : null }
}

function stoppedError(status: BuildStatus | undefined): AiError {
	return status === 'cancelled'
		? new AiError('cancelled')
		: new AiError('conflict', 'This build stopped before its plan could be saved.')
}

/**
 * Stores the plan and moves the build to `planned` (section 4.2 step 10), refunding the
 * units reserved for pages it did not plan (`reserved − (1 + pages)`) in the same
 * guarded write. Usage is added to the build document only: the caller records every
 * call on the day counters (`recordUsage`). Throws `cancelled` when the person stopped
 * the build meanwhile (nothing is stored), `conflict` for any other state.
 */
export async function savePlan(
	db: Db,
	buildId: string,
	patch: Pick<AiBuildDoc, 'context' | 'plan' | 'design' | 'chrome' | 'images' | 'writerContext' | 'pages' | 'outline' | 'profilePatch' | 'issues'>,
	usage: CallUsage,
	now: Date,
	served?: Served,
): Promise<void> {
	const builds = buildsOf(db)
	const doc = await builds.findOne({ _id: buildId }, { projection: { status: 1, budget: 1, workspaceId: 1 } })
	if (!doc || doc.status !== 'planning') throw stoppedError(doc?.status)
	const keep = 1 + (patch.pages?.length ?? 0)
	const surplus = Math.max(0, doc.budget.reserved - doc.budget.refunded - keep)
	const ops = servedOps(served)
	const update: UpdateFilter<AiBuildDoc> = {
		$set: { ...patch, status: 'planned', updatedAt: now, ...ops.set },
		$inc: { 'budget.refunded': surplus, ...usageInc('usage.', cleanUsage(usage)) },
		...(ops.addToSet ? { $addToSet: ops.addToSet } : {}),
	}
	const result = await builds.updateOne({ _id: buildId, status: 'planning', 'budget.refunded': doc.budget.refunded }, update)
	if (result.matchedCount === 0) {
		const current = await builds.findOne({ _id: buildId }, { projection: { status: 1 } })
		throw stoppedError(current?.status)
	}
	if (surplus > 0) await refundUnits(db, doc.workspaceId, doc.budget.day, surplus)
}

/**
 * A plan that could not be made (section 4.2, any failure after the insert): `failed`,
 * no longer active, and everything reserved goes back. A build the person stopped
 * meanwhile stays `cancelled`; its units went back with the cancel.
 */
export async function failBuild(db: Db, buildId: string, error: ApiError, now: Date): Promise<void> {
	const failed = await buildsOf(db).findOneAndUpdate(
		{ _id: buildId, status: 'planning' },
		{ $set: { status: 'failed', error, updatedAt: now }, $unset: { active: '' } },
		{ returnDocument: 'after', projection: LIGHT },
	)
	if (!failed) return
	const refunded = await refundRemaining(db, buildId)
	logBuild({ ...failed, budget: { ...failed.budget, refunded: failed.budget.refunded + refunded } }, now)
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

/** Names a refused lease from the document as it is now. */
function pageRefusal(doc: AiBuildDoc | null, key: string): 'written' | 'busy' | 'exhausted' | 'missing' | 'state' {
	const page = doc?.pages?.find((item) => item.key === key)
	if (!doc || !page) return 'missing'
	if (page.status === 'written') return 'written'
	if (!WRITABLE.includes(doc.status) || doc.cancelRequestedAt != null || page.status === 'cancelled') return 'state'
	if (page.attempts >= AI_LIMITS.attemptsPerPage) return 'exhausted'
	// A live lease on this page, the build's writer cap, or a race the caller may retry.
	return 'busy'
}

/**
 * Takes the page for one attempt (section 5.4), atomically: the build must be writable
 * with no cancel requested, the page pending, failed or held by an expired lease, with
 * attempts left, and fewer than 4 of the build's pages may be writing under live leases.
 * The build moves to `writing`. A third attempt records the unit the caller reserved
 * for it (section 4.5 step 4) on the page and the build.
 */
export async function leasePage(
	db: Db,
	buildId: string,
	key: string,
	now: Date,
): Promise<
	{ ok: true; build: AiBuildDoc; leaseId: string; attempt: number } | { ok: false; reason: 'written' | 'busy' | 'exhausted' | 'missing' | 'state' }
> {
	const builds = buildsOf(db)
	const leaseId = newLeaseId()
	const build = await builds.findOneAndUpdate(
		{
			_id: buildId,
			status: { $in: WRITABLE },
			cancelRequestedAt: null,
			pages: {
				$elemMatch: {
					key,
					attempts: { $lt: AI_LIMITS.attemptsPerPage },
					// A writing page without a lease date has no live writer either (the view calls it failed).
					$or: [{ status: { $in: ['pending', 'failed'] } }, { status: 'writing', leaseUntil: { $lt: now } }, { status: 'writing', leaseUntil: null }],
				},
			},
			$expr: {
				$lt: [
					{
						$size: {
							$filter: {
								input: '$pages',
								cond: { $and: [{ $eq: ['$$this.status', 'writing'] }, { $gt: ['$$this.leaseUntil', now] }] },
							},
						},
					},
					AI_LIMITS.pagesWritingPerBuild,
				],
			},
		},
		{
			$set: {
				status: 'writing',
				updatedAt: now,
				'pages.$[p].status': 'writing',
				'pages.$[p].leaseId': leaseId,
				'pages.$[p].leaseUntil': new Date(now.getTime() + AI_LIMITS.leaseMs),
				'pages.$[p].startedAt': now,
				'pages.$[p].reachedModel': false,
			},
			$inc: { 'pages.$[p].attempts': 1 },
		},
		{ arrayFilters: [{ 'p.key': key }], returnDocument: 'after' },
	)

	if (!build) {
		const current = await builds.findOne({ _id: buildId }, { projection: LIGHT })
		return { ok: false, reason: pageRefusal(current, key) }
	}

	const page = build.pages.find((item) => item.key === key) as BuildPageDoc
	const attempt = page.attempts
	if (attempt >= AI_LIMITS.attemptsPerPage) {
		const { modifiedCount } = await builds.updateOne(
			{ _id: buildId, pages: { $elemMatch: { key, leaseId } } },
			{ $inc: { 'pages.$.extraUnits': 1, 'budget.reserved': 1 } },
		)
		if (modifiedCount === 1) {
			page.extraUnits = (page.extraUnits ?? 0) + 1
			build.budget.reserved += 1
		}
	}
	return { ok: true, build, leaseId, attempt }
}

/** The request reached the model under this lease (the first stream event). */
export async function markReachedModel(db: Db, buildId: string, key: string, leaseId: string): Promise<void> {
	if (!leaseId) return
	await buildsOf(db).updateOne({ _id: buildId, pages: { $elemMatch: { key, leaseId } } }, { $set: { 'pages.$.reachedModel': true } })
}

/**
 * Gives the lease up without an outcome: the lease ends now, so the page can be leased
 * again at once, the attempt still counts, and until then it reads as failed and
 * retryable, like any page whose lease ran out.
 */
export async function releaseLease(db: Db, buildId: string, key: string, leaseId: string): Promise<void> {
	if (!leaseId) return
	const now = new Date()
	await buildsOf(db).updateOne(
		{ _id: buildId, pages: { $elemMatch: { key, leaseId } } },
		{ $set: { 'pages.$.leaseId': null, 'pages.$.leaseUntil': new Date(now.getTime() - 1), updatedAt: now } },
	)
}

/** Only the lease holder may record the outcome. False: the lease was lost to a newer attempt, so the result is discarded. */
export async function finishPage(
	db: Db,
	buildId: string,
	key: string,
	leaseId: string,
	written: WrittenPage,
	issues: Issue[],
	usage: CallUsage,
	requestIds: string[],
	now: Date,
	served?: Served,
): Promise<boolean> {
	if (!leaseId) return false
	const u = cleanUsage(usage)
	const ops = servedOps(served)
	const ids = (requestIds ?? []).filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 200)
	const update: UpdateFilter<AiBuildDoc> = {
		$set: {
			'pages.$.status': 'written',
			'pages.$.written': written,
			'pages.$.issues': issues,
			'pages.$.leaseId': null,
			'pages.$.leaseUntil': null,
			'pages.$.writtenAt': now,
			'pages.$.lastError': null,
			updatedAt: now,
			...ops.set,
		},
		$inc: { ...usageInc('pages.$.usage.', u), ...usageInc('usage.', u) },
		$push: { requestIds: { $each: ids, $slice: -30 } },
		...(ops.addToSet ? { $addToSet: ops.addToSet } : {}),
	}
	const { matchedCount } = await buildsOf(db).updateOne({ _id: buildId, pages: { $elemMatch: { key, leaseId } } }, update)
	return matchedCount === 1
}

/** The same guard as `finishPage`: the attempt ends `failed` (or `cancelled` by Stop) with its error and usage. */
export async function failPage(
	db: Db,
	buildId: string,
	key: string,
	leaseId: string,
	status: 'failed' | 'cancelled',
	error: ApiError,
	usage: CallUsage,
	now: Date,
	served?: Served,
): Promise<boolean> {
	if (!leaseId) return false
	const u = cleanUsage(usage)
	const ops = servedOps(served)
	const update: UpdateFilter<AiBuildDoc> = {
		$set: {
			'pages.$.status': status === 'cancelled' ? 'cancelled' : 'failed',
			'pages.$.lastError': error,
			'pages.$.leaseId': null,
			'pages.$.leaseUntil': null,
			updatedAt: now,
			...ops.set,
		},
		$inc: { ...usageInc('pages.$.usage.', u), ...usageInc('usage.', u) },
		...(ops.addToSet ? { $addToSet: ops.addToSet } : {}),
	}
	const { matchedCount } = await buildsOf(db).updateOne({ _id: buildId, pages: { $elemMatch: { key, leaseId } } }, update)
	return matchedCount === 1
}

/** `writing` → `ready` once no page is pending or writing. */
export async function settleBuild(db: Db, buildId: string, now: Date): Promise<void> {
	await buildsOf(db).updateOne(
		{ _id: buildId, status: 'writing', pages: { $not: { $elemMatch: { status: { $in: ['pending', 'writing'] } } } } },
		{ $set: { status: 'ready', updatedAt: now } },
	)
}

/** Gives the page's base unit back, at most once and never for a written page. True when this call did it. */
export async function refundPage(db: Db, build: AiBuildDoc, key: string): Promise<boolean> {
	const { modifiedCount } = await buildsOf(db).updateOne(
		{ _id: build._id, pages: { $elemMatch: { key, refunded: false, status: { $ne: 'written' } } } },
		{ $set: { 'pages.$.refunded': true }, $inc: { 'budget.refunded': 1 } },
	)
	if (modifiedCount === 1) await refundUnits(db, build.workspaceId, build.budget.day, 1)
	return modifiedCount === 1
}

/* -------------------------------------------------------------------------- */
/* The outline                                                                */
/* -------------------------------------------------------------------------- */

function outlineRefusal(doc: AiBuildDoc | null, now: Date): 'done' | 'running' | 'exhausted' | 'state' {
	if (!doc || !WRITABLE.includes(doc.status) || doc.cancelRequestedAt != null) return 'state'
	const outline = doc.outline
	if (!outline || outline.status === 'done' || outline.status === 'none') return 'done'
	if (outline.status === 'running' && later(outline.leaseUntil, now)) return 'running'
	if (outline.attempts >= AI_LIMITS.outlineAttempts) return 'exhausted'
	return 'running'
}

/**
 * Takes the outline for one attempt (section 4.4 step 2): pending or failed with
 * attempts left, or running under an expired lease (the dead attempt counts, so an
 * attempt number above 2 means the last one died: go straight to the fallback).
 */
export async function leaseOutline(
	db: Db,
	buildId: string,
	now: Date,
): Promise<{ ok: true; build: AiBuildDoc; leaseId: string; attempt: number } | { ok: false; reason: 'done' | 'running' | 'exhausted' | 'state' }> {
	const builds = buildsOf(db)
	const leaseId = newLeaseId()
	const build = await builds.findOneAndUpdate(
		{
			_id: buildId,
			status: { $in: WRITABLE },
			cancelRequestedAt: null,
			$or: [
				{ 'outline.status': { $in: ['pending', 'failed'] }, 'outline.attempts': { $lt: AI_LIMITS.outlineAttempts } },
				{ 'outline.status': 'running', 'outline.leaseUntil': { $lt: now } },
			],
		},
		{
			$set: {
				'outline.status': 'running',
				'outline.leaseId': leaseId,
				'outline.leaseUntil': new Date(now.getTime() + AI_LIMITS.leaseMs),
				updatedAt: now,
			},
			$inc: { 'outline.attempts': 1 },
		},
		{ returnDocument: 'after' },
	)
	if (build) return { ok: true, build, leaseId, attempt: build.outline.attempts }
	const current = await builds.findOne({ _id: buildId }, { projection: { status: 1, cancelRequestedAt: 1, outline: 1 } })
	return { ok: false, reason: outlineRefusal(current, now) }
}

/**
 * Writes the outlined pages (their sections live in `plan`) and the images assigned to
 * them, guarded by the outline's lease. Pages that are being written meanwhile are
 * never touched: of `pages`, only the name, slug, id and issues of pages that are still
 * pending and were never attempted are taken over (an un-outlined page cannot be leased).
 */
export async function finishOutline(
	db: Db,
	buildId: string,
	leaseId: string,
	patch: { plan: NormalizedPlan; images: ImagePlan; pages: BuildPageDoc[]; issues: Issue[] },
	usage: CallUsage,
	now: Date,
	served?: Served,
): Promise<boolean> {
	if (!leaseId) return false
	const ops = servedOps(served)
	const set: Record<string, unknown> = {
		plan: patch.plan,
		images: patch.images,
		issues: patch.issues,
		'outline.status': 'done',
		'outline.leaseId': null,
		'outline.leaseUntil': null,
		updatedAt: now,
		...ops.set,
	}
	const arrayFilters: Document[] = []
	const seen = new Set<string>()
	for (const page of patch.pages ?? []) {
		if (!page || typeof page.key !== 'string' || seen.has(page.key)) continue
		seen.add(page.key)
		const id = `q${arrayFilters.length}`
		set[`pages.$[${id}].pageId`] = page.pageId
		set[`pages.$[${id}].name`] = page.name
		set[`pages.$[${id}].slug`] = page.slug
		set[`pages.$[${id}].issues`] = page.issues ?? []
		arrayFilters.push({ [`${id}.key`]: page.key, [`${id}.status`]: 'pending', [`${id}.attempts`]: 0 })
	}
	const update: UpdateFilter<AiBuildDoc> = {
		$set: set,
		$inc: usageInc('usage.', cleanUsage(usage)),
		...(ops.addToSet ? { $addToSet: ops.addToSet } : {}),
	}
	const { matchedCount } = await buildsOf(db).updateOne(
		{ _id: buildId, 'outline.leaseId': leaseId },
		update,
		arrayFilters.length ? { arrayFilters } : {},
	)
	return matchedCount === 1
}

/** The attempt failed: `failed` under the same guard, so a second attempt (or the fallback) can follow. */
export async function failOutline(db: Db, buildId: string, leaseId: string, error: ApiError, now: Date): Promise<void> {
	if (!leaseId) return
	const { modifiedCount } = await buildsOf(db).updateOne(
		{ _id: buildId, 'outline.leaseId': leaseId },
		{ $set: { 'outline.status': 'failed', 'outline.leaseId': null, 'outline.leaseUntil': null, updatedAt: now } },
	)
	if (modifiedCount === 1) console.info('[ai-build]', JSON.stringify({ buildId, stage: 'outline', outline: 'failed', code: error?.code ?? null }))
}

/* -------------------------------------------------------------------------- */
/* Stop and land                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The person's Stop (section 4.6). An active build becomes `cancelled` with
 * `cancelRequestedAt` set, in one write that also cancels its pending and failed pages;
 * each of those is refunded once, and a build stopped while planning gives back
 * everything. Pages being written see the flag through their watchdog within 5 s and
 * settle their own unit (section 4.5). Idempotent. Returns the build as it now is.
 */
export async function cancelBuild(db: Db, build: AiBuildDoc, now: Date): Promise<AiBuildDoc> {
	const builds = buildsOf(db)
	const stop = { cancelRequestedAt: now, status: 'cancelled' as const, updatedAt: now }
	// One write decides both the status and which pages it cancels (so exactly those are
	// refunded), from the stored document: the caller's copy may predate the plan's pages.
	const before =
		(await builds.findOneAndUpdate(
			{ _id: build._id, status: { $in: ACTIVE }, pages: { $type: 'array' } },
			{ $set: { ...stop, 'pages.$[open].status': 'cancelled' }, $unset: { active: '' } },
			{ returnDocument: 'before', projection: LIGHT, arrayFilters: [{ 'open.status': { $in: ['pending', 'failed'] } }] },
		)) ??
		// A document without a pages array (never written by this pipeline) still stops.
		(await builds.findOneAndUpdate(
			{ _id: build._id, status: { $in: ACTIVE }, pages: { $not: { $type: 'array' } } },
			{ $set: stop, $unset: { active: '' } },
			{ returnDocument: 'before', projection: LIGHT },
		))
	if (before) {
		let refunded = 0
		if (before.status === 'planning') refunded = await refundRemaining(db, before._id)
		else
			for (const page of before.pages ?? [])
				if ((page.status === 'pending' || page.status === 'failed') && !page.refunded && (await refundPage(db, before, page.key)))
					refunded++
		logBuild({ ...before, status: 'cancelled', budget: { ...before.budget, refunded: before.budget.refunded + refunded } }, now)
	}
	return (await builds.findOne({ _id: build._id })) ?? build
}

/** `landed`, from `ready` or (when the person gave up on failed pages) `writing`. Idempotent. */
export async function markLanded(db: Db, buildId: string, now: Date): Promise<void> {
	const landed = await buildsOf(db).findOneAndUpdate(
		{ _id: buildId, status: { $in: ['ready', 'writing'] } },
		{ $set: { status: 'landed', landedAt: now, updatedAt: now }, $unset: { active: '' } },
		{ returnDocument: 'after', projection: LIGHT },
	)
	if (landed) logBuild(landed, now)
}

/* -------------------------------------------------------------------------- */
/* Views                                                                      */
/* -------------------------------------------------------------------------- */

const LEASE_LOST: ApiError = {
	code: 'upstream',
	message: 'This page stopped before it was finished.',
	status: 502,
	retryable: true,
}

function pageView(doc: AiBuildDoc, page: BuildPageDoc, planned: NormalizedPage | undefined, now: Date): PageView {
	// A page whose writer died (its lease ran out) is a retryable failure, not "writing" forever.
	const stale = page.status === 'writing' && !later(page.leaseUntil, now)
	const status = stale ? 'failed' : page.status
	return {
		key: page.key,
		pageId: page.pageId,
		name: page.name,
		slug: page.slug,
		archetype: planned?.archetype ?? 'custom',
		purpose: planned?.purpose ?? '',
		outlined: planned?.outlined ?? false,
		sections: (planned?.sections ?? []).map((section) => ({ layout: section.layout, label: section.label })),
		status,
		attempts: page.attempts,
		canRetry: status === 'failed' && page.attempts < AI_LIMITS.attemptsPerPage && WRITABLE.includes(doc.status),
		retryCostsUnit: page.attempts === AI_LIMITS.attemptsPerPage - 1,
		error: stale ? LEASE_LOST : (page.lastError ?? null),
		issues: page.issues ?? [],
		needsInput: page.written?.needsInput ?? [],
	}
}

function chromeView(doc: AiBuildDoc): ChromeView | null {
	if (!doc.plan) return null
	// No chrome of its own means the site's header and footer stay as they are.
	const kept = doc.chrome == null
	const chrome = doc.chrome ?? doc.snapshot?.chrome
	if (!chrome) return null
	return {
		kept,
		header: chrome.header,
		footer: chrome.footer,
		cta: chrome.ctaLabel ?? '',
		menu: (chrome.menu ?? []).map((item) => ({
			label: item.label,
			kind: item.links?.length ? item.style : /^tel:/i.test(item.href ?? '') ? 'phone' : 'link',
			links: item.links?.length ?? 0,
		})),
	}
}

/** One page as the client sees it, or null for an unknown key. */
export function toPageView(doc: AiBuildDoc, key: string): PageView | null {
	const page = (doc.pages ?? []).find((item) => item.key === key)
	if (!page) return null
	return pageView(doc, page, doc.plan?.pages.find((item) => item.key === key), new Date())
}

/**
 * What the client may see of a build. Never the prompt, the business input, the
 * reviews, photo URLs, the writer context, lease ids or written page bodies.
 */
export function toBuildView(doc: AiBuildDoc): BuildView {
	const now = new Date()
	const planned = new Map((doc.plan?.pages ?? []).map((page) => [page.key, page]))
	return {
		id: doc._id,
		status: doc.status,
		mode: doc.mode,
		placement: doc.placement,
		targetPageId: doc.targetPageId ?? null,
		createdAt: iso(doc.createdAt),
		updatedAt: iso(doc.updatedAt),
		expiresAt: iso(doc.expiresAt),
		// Null while planning, and when the site keeps its own look.
		design: doc.design?.look ? doc.design.view : null,
		chrome: chromeView(doc),
		facts: (doc.plan?.facts ?? []).map((fact) => ({ value: fact.value, label: fact.label })),
		profileFill: (doc.profilePatch ?? []).map((entry) => ({
			field: entry.field,
			label: PROFILE_FIELD_LABELS[entry.field] ?? entry.field,
			value: Array.isArray(entry.value)
				? entry.value.join(', ')
				: entry.field === 'business.type'
					? (BUSINESS_TYPES.find((type) => type.value === entry.value)?.label ?? String(entry.value ?? ''))
					: String(entry.value ?? ''),
		})),
		photosUsed: Object.values(doc.images?.uses ?? {}).filter((uses) => uses > 0).length,
		outline: doc.outline?.status ?? 'none',
		pages: (doc.pages ?? []).map((page) => pageView(doc, page, planned.get(page.key), now)),
		issues: doc.issues ?? [],
		units: { reserved: doc.budget?.reserved ?? 0, refunded: doc.budget?.refunded ?? 0 },
		error: doc.error ?? null,
	}
}
