import { isCancelled, leaseOutline, toBuildView } from '@/lib/builder/ai/builds'
import { AI_LIMITS } from '@/lib/builder/ai/contract'
import { AiError, aiErrorResponse, toApiError } from '@/lib/builder/ai/errors'
import { ndjsonResponse } from '@/lib/builder/ai/ndjson'
import { buildAccess, readBody } from '@/lib/builder/ai/route-kit'
import { runOutline } from '@/lib/builder/ai/run-outline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Params = { params: Promise<{ siteId: string; buildId: string }> }

/** Outlines the pages the plan left empty (section 4.4). */
export async function POST(request: Request, { params }: Params) {
	const startedAt = Date.now()
	try {
		const { siteId, buildId } = await params
		const { site, db, build } = await buildAccess(siteId, buildId)
		await readBody(request)
		if (!['planned', 'writing', 'ready'].includes(build.status) || build.cancelRequestedAt)
			throw new AiError('conflict', 'This build is not planning any more pages.')

		const done = () => ndjsonResponse(request, async () => toBuildView(build), { budgetMs: AI_LIMITS.routeBudgetMs, startedAt, accepted: { buildId }, onError: async (error) => ({ error: toApiError(error) }) })
		if (build.outline.status === 'done' || build.outline.status === 'none') return done()

		const lease = await leaseOutline(db, buildId, new Date())
		if (!lease.ok) {
			if (lease.reason === 'done') return done()
			throw new AiError('conflict', 'The rest of the site is already being planned.')
		}

		return ndjsonResponse(request, (ctx) => runOutline({ db, site, build: lease.build, leaseId: lease.leaseId, attempt: lease.attempt, ctx }), {
			budgetMs: AI_LIMITS.routeBudgetMs,
			startedAt,
			isCancelled: () => isCancelled(db, buildId),
			accepted: { buildId },
			onError: async (error, ctx) => ({ error: ctx.reason() === 'cancel' ? new AiError('cancelled').toApi() : toApiError(error) }),
		})
	} catch (error) {
		return aiErrorResponse(error)
	}
}
