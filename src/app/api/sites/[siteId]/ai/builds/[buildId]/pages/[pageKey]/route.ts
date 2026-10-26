import { budgetLimits, outputTokensToday, refundUnits, reserveUnits } from '@/lib/builder/ai/budget'
import { buildsOf, failPage, isCancelled, leasePage, refundPage, settleBuild, toPageView } from '@/lib/builder/ai/builds'
import { AI_LIMITS, type ApiError } from '@/lib/builder/ai/contract'
import { AiError, aiErrorResponse, toApiError } from '@/lib/builder/ai/errors'
import { ndjsonResponse } from '@/lib/builder/ai/ndjson'
import { buildAccess, readBody } from '@/lib/builder/ai/route-kit'
import { runPage } from '@/lib/builder/ai/run-page'
import { addUsage, recordDay, usageOfError, ZERO_USAGE } from '@/lib/builder/ai/run-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** One page: a write and, rarely, a short repair. */
export const maxDuration = 300

type Params = { params: Promise<{ siteId: string; buildId: string; pageKey: string }> }

const NETWORK: ApiError = { code: 'network', message: 'The connection closed before this page was finished.', status: 499, retryable: true }

/** Writes one page of a planned build (section 4.5). */
export async function POST(request: Request, { params }: Params) {
	const startedAt = Date.now()
	try {
		const { siteId, buildId, pageKey: key } = await params
		const { site, db, build } = await buildAccess(siteId, buildId, { includeExpired: true, pageKey: key })
		await readBody(request)
		const now = new Date()
		if (build.expiresAt.getTime() <= now.getTime()) throw new AiError('expired')
		if (!['planned', 'writing', 'ready'].includes(build.status)) throw new AiError('conflict', 'This build is not writing pages any more.')
		const planned = build.plan?.pages.find((page) => page.key === key)
		const stored = build.pages.find((page) => page.key === key)
		if (!planned || !stored) throw new AiError('not-found')
		if (!planned.outlined) throw new AiError('not-ready')
		if (stored.status === 'written') {
			const data = toPageView(build, key)
			return Response.json({ error: new AiError('conflict', 'This page is already written.').toApi(), data }, { status: 409 })
		}
		if (
			(await outputTokensToday(db, site.workspaceId, now)) >= budgetLimits().outputTokens ||
			(build.usage?.outputTokens ?? 0) > AI_LIMITS.runawayOutputTokens
		)
			throw new AiError('token-limit')

		// The third attempt costs one more unit, taken before the lease.
		let extra: { day: string } | null = null
		if (stored.attempts === AI_LIMITS.attemptsPerPage - 1) {
			const reservation = await reserveUnits(db, site.workspaceId, 1, now)
			if (!reservation.ok) throw new AiError(reservation.scope === 'global' ? 'global-limit' : 'daily-limit')
			extra = { day: reservation.day }
		}
		const lease = await leasePage(db, buildId, key, now)
		if (!lease.ok) {
			if (extra) await refundUnits(db, site.workspaceId, extra.day, 1)
			if (lease.reason === 'written')
				return Response.json({ error: new AiError('conflict', 'This page is already written.').toApi(), data: toPageView(build, key) }, { status: 409 })
			if (lease.reason === 'busy') throw new AiError('busy', 'Another attempt is writing this page. Trying again shortly.', { retryAfterMs: 5000 })
			if (lease.reason === 'exhausted') throw new AiError('attempts-exhausted')
			if (lease.reason === 'missing') throw new AiError('not-found')
			throw new AiError('conflict', 'This build is not writing pages any more.')
		}

		const spent = { usage: { ...ZERO_USAGE } }
		return ndjsonResponse(
			request,
			(ctx) => runPage({ db, site, build: lease.build, key, leaseId: lease.leaseId, attempt: lease.attempt, ctx, spent }),
			{
				budgetMs: AI_LIMITS.routeBudgetMs,
				startedAt,
				isCancelled: () => isCancelled(db, buildId),
				accepted: { buildId, key, attempt: lease.attempt },
				onError: async (error, ctx) => {
					const extraUsage = usageOfError(error)
					await recordDay(db, lease.build, extraUsage)
					const usage = addUsage(spent.usage, extraUsage)
					const at = new Date()
					const reason = ctx.reason()
					// Stop, seen by the watchdog or as the client's abort right before its cancel landed.
					const stopped = reason === 'cancel' || (reason === 'client' && (await isCancelled(db, buildId)))
					let failure: ApiError
					if (stopped) {
						failure = new AiError('cancelled').toApi()
						await failPage(db, buildId, key, lease.leaseId, 'cancelled', failure, usage, at)
						const current = await buildsOf(db).findOne({ _id: buildId }, { projection: { pages: 1, budget: 1, workspaceId: 1 } })
						const page = current?.pages.find((item) => item.key === key)
						const quick = page?.startedAt ? at.getTime() - page.startedAt.getTime() < AI_LIMITS.cancelRefundWindowMs : true
						if (current && page && (!page.reachedModel || quick)) await refundPage(db, { ...lease.build, ...current }, key)
					} else {
						failure = reason === 'client' ? NETWORK : reason === 'deadline' ? new AiError('timeout').toApi() : toApiError(error)
						await failPage(db, buildId, key, lease.leaseId, 'failed', failure, usage, at)
						// The last attempt failing for good gives the page's base unit back.
						if (lease.attempt >= AI_LIMITS.attemptsPerPage) await refundPage(db, lease.build, key)
					}
					await settleBuild(db, buildId, at)
					const doc = await buildsOf(db).findOne({ _id: buildId })
					return { error: failure, data: doc ? (toPageView(doc, key) ?? undefined) : undefined }
				},
			},
		)
	} catch (error) {
		return aiErrorResponse(error)
	}
}
