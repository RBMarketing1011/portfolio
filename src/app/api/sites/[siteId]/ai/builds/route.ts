import { requireSitePermission } from '@/lib/auth/guards'
import { pageCapOf, parseCreateBuild } from '@/lib/builder/ai/brief'
import { budgetLimits, outputTokensToday, refundUnits, reserveUnits, unitsToday } from '@/lib/builder/ai/budget'
import { buildsOf, ensureBuildIndexes, failBuild, insertBuild, isCancelled, listBuilds, newBuildId, supersede, toBuildView } from '@/lib/builder/ai/builds'
import { AI_LIMITS, type CapabilityResponse } from '@/lib/builder/ai/contract'
import { AiError, aiErrorResponse, toApiError } from '@/lib/builder/ai/errors'
import { builderAiConfigured, builderAiModel } from '@/lib/builder/ai/model'
import { ndjsonResponse } from '@/lib/builder/ai/ndjson'
import { countLibraryPhotos } from '@/lib/builder/ai/pool'
import { readBody, siteAccess } from '@/lib/builder/ai/route-kit'
import { runPlan } from '@/lib/builder/ai/run-plan'
import { recordDay, usageOfError, ZERO_USAGE } from '@/lib/builder/ai/run-shared'
import type { AiBuildDoc } from '@/lib/builder/ai/types'
import { sanitizeLook } from '@/lib/builder/look'
import { assertBlobUrl } from '@/lib/media/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** A plan is one long model call, streamed. */
export const maxDuration = 300

type Params = { params: Promise<{ siteId: string }> }

const blobUrlOk = (url: string) => {
	try {
		assertBlobUrl(url)
		return true
	} catch {
		return false
	}
}

/** Whether AI building is on, today's allowance, the library's photos and this person's recent builds (section 4.1). */
export async function GET(_request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db, membership } = await requireSitePermission(siteId, 'projects.edit')
		const now = new Date()
		const enabled = builderAiConfigured()
		const body: CapabilityResponse = {
			enabled,
			units: await unitsToday(db, site.workspaceId, now),
			library: { photos: enabled ? await countLibraryPhotos(db, site.workspaceId) : 0 },
			builds: enabled ? await listBuilds(db, site._id, membership.userId, now) : [],
		}
		return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
	} catch (error) {
		return aiErrorResponse(error)
	}
}

/** Creates a build and plans it, streaming progress (section 4.2). */
export async function POST(request: Request, { params }: Params) {
	const startedAt = Date.now()
	try {
		const { siteId } = await params
		const { site, db, membership } = await siteAccess(siteId)
		const body = await readBody(request)
		const pages = site.site?.pages ?? []
		const parsed = parseCreateBuild(body, { pages, media: site.media ?? [] }, { blobUrlOk })
		if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.error.status })
		const input = parsed.request
		const now = new Date()

		await ensureBuildIndexes(db)
		const { active } = await supersede(db, site._id, membership.userId, now)
		if (active)
			throw active.userId === membership.userId
				? new AiError('conflict', 'A build is already running for this site.', { buildId: active.buildId })
				: new AiError('conflict', 'Someone else on your team is building this site with AI. Try again when they finish.')
		if ((await buildsOf(db).countDocuments({ workspaceId: site.workspaceId, active: true })) >= AI_LIMITS.activeBuildsPerWorkspace)
			throw new AiError('busy', 'Two builds are already running in this account. Try again when one finishes.')
		if ((await outputTokensToday(db, site.workspaceId, now)) >= budgetLimits().outputTokens) throw new AiError('token-limit')

		const reserved = 1 + pageCapOf(input)
		const reservation = await reserveUnits(db, site.workspaceId, reserved, now)
		if (!reservation.ok)
			throw reservation.scope === 'global'
				? new AiError('global-limit')
				: new AiError('daily-limit', `This needs up to ${reserved} AI writes and this account has fewer left today. The allowance resets at midnight UTC.`)

		const build: AiBuildDoc = {
			_id: newBuildId(),
			siteId: site._id,
			workspaceId: site.workspaceId,
			userId: membership.userId,
			active: true,
			status: 'planning',
			mode: input.mode,
			placement: input.placement,
			targetPageId: input.targetPageId,
			input,
			snapshot: {
				siteRev: site.rev,
				pages: pages.map((page) => ({ id: page.id, name: page.name, slug: page.slug, blocks: page.blocks.length })),
				chrome: site.site.chrome,
				theme: pages.length ? sanitizeLook(site.look ?? {}).theme : null,
			},
			context: null,
			plan: null,
			design: null,
			chrome: null,
			images: null,
			writerContext: null,
			outline: { status: 'none', attempts: 0, leaseId: null, leaseUntil: null },
			pages: [],
			profilePatch: [],
			budget: { day: reservation.day, reserved, refunded: 0 },
			usage: { ...ZERO_USAGE },
			model: builderAiModel(),
			servedModels: [],
			fallbackUsed: false,
			requestIds: [],
			issues: [],
			error: null,
			cancelRequestedAt: null,
			createdAt: now,
			updatedAt: now,
			expiresAt: new Date(now.getTime() + AI_LIMITS.buildTtlMs),
			landedAt: null,
		}
		if ((await insertBuild(db, build)) === 'conflict') {
			await refundUnits(db, site.workspaceId, reservation.day, reserved)
			throw new AiError('conflict', 'A build is already running for this site.')
		}

		return ndjsonResponse(request, (ctx) => runPlan({ db, site, userId: membership.userId, request: input, build, ctx }), {
			budgetMs: AI_LIMITS.routeBudgetMs,
			startedAt,
			isCancelled: () => isCancelled(db, build._id),
			accepted: { buildId: build._id, reserved },
			onError: async (error, ctx) => {
				await recordDay(db, build, usageOfError(error))
				const failure = ctx.reason() === 'cancel' ? new AiError('cancelled').toApi() : toApiError(error)
				await failBuild(db, build._id, failure, new Date())
				const doc = await buildsOf(db).findOne({ _id: build._id })
				return { error: failure, data: doc ? toBuildView(doc) : undefined }
			},
		})
	} catch (error) {
		return aiErrorResponse(error)
	}
}
