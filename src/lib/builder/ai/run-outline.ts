import 'server-only'
import type { Db } from 'mongodb'
import type { SiteDoc } from '../site-doc'
import { buildsOf, failOutline, finishOutline, toBuildView } from './builds'
import { AI_LIMITS, type BuildView, type CallUsage, type Issue } from './contract'
import { AiError, toApiError } from './errors'
import { callStructured, type Effort } from './model'
import type { RunContext } from './ndjson'
import { LOOSE_OUTLINE_SCHEMA, OUTLINE_SCHEMA, outlineUserContent, readOutlineReply, type OutlineReply } from './outline'
import { normalizeOutlined, planDataOf } from './plan-normalize'
import { plannerSystem } from './run-plan'
import { addUsage, callSignal, dedupeIssues, footerToneOf, planContextOf, recordDay, usageOfError, userKeyOf, ZERO_USAGE } from './run-shared'
import type { AiBuildDoc } from './types'

/**
 * The outline stage (section 4.4): the pages the plan left empty get their sections in
 * one call, varied against the pages already outlined. A failed first attempt is
 * retryable; the second (or an attempt after a dead one) never fails: every page still
 * empty is laid out from its proven recipe instead. It never costs a unit.
 */

const OUTLINE_MS = 200_000
const FALLBACK_NOTE: Issue = { level: 'info', code: 'outline-fallback', message: 'Some pages were laid out from proven patterns instead.' }

export async function runOutline(input: {
	db: Db
	site: SiteDoc
	build: AiBuildDoc
	leaseId: string
	attempt: number
	ctx: RunContext
}): Promise<BuildView> {
	const { db, site, build, leaseId, attempt, ctx } = input
	if (!build.plan || !build.images) throw new AiError('conflict', 'This build has no plan yet.')
	const planCtx = planContextOf(build, site.name)
	const composing = { ...planCtx, plan: planDataOf(build.plan, build.images, build.placement === 'replace-site' ? null : planCtx.existing, footerToneOf(build.design)) }
	const last = attempt >= AI_LIMITS.outlineAttempts

	let reply: OutlineReply = { pages: [] }
	let usage: CallUsage = { ...ZERO_USAGE }
	let served: { models: string[]; fallback: boolean } = { models: [], fallback: false }
	let fellBack = attempt > AI_LIMITS.outlineAttempts
	if (!fellBack) {
		try {
			const effort: Effort = attempt > 1 && build.error?.code === 'timeout' ? 'low' : 'medium'
			const result = await callStructured<OutlineReply>({
				stage: 'outline',
				effort,
				maxTokens: 16000,
				system: plannerSystem(),
				content: outlineUserContent({ plan: build.plan, images: build.images, availability: planCtx.availability }),
				schema: process.env.BUILDER_AI_LOOSE_LAYOUTS === '1' ? LOOSE_OUTLINE_SCHEMA : OUTLINE_SCHEMA,
				read: readOutlineReply,
				signal: callSignal(ctx, OUTLINE_MS),
				userKey: userKeyOf(site),
				replayKey: 'outline',
				onStage: (next) => ctx.emit({ t: 'stage', stage: next }),
				log: { buildId: build._id, attempt },
			})
			reply = result.value
			usage = result.usage
			served = { models: [result.model], fallback: result.fallback }
			await recordDay(db, build, usage)
		} catch (error) {
			await recordDay(db, build, usageOfError(error))
			usage = addUsage(usage, usageOfError(error))
			// The person's Stop is never laid out around.
			if (ctx.reason() === 'cancel' || !last) {
				await failOutline(db, build._id, leaseId, toApiError(error), new Date())
				throw error
			}
			fellBack = true
		}
	}

	ctx.emit({ t: 'stage', stage: 'checking' })
	const normalized = normalizeOutlined(fellBack ? { pages: [] } : reply, build.plan, build.images, composing)
	const issuesByPage = new Map<string, Issue[]>()
	for (const issue of normalized.issues) if (issue.pageKey) issuesByPage.set(issue.pageKey, [...(issuesByPage.get(issue.pageKey) ?? []), issue])
	const pages = build.pages.map((page) => ({ ...page, issues: dedupeIssues([...(page.issues ?? []), ...(issuesByPage.get(page.key) ?? [])]) }))
	const issues = dedupeIssues([...(build.issues ?? []), ...normalized.issues.filter((issue) => !issue.pageKey), ...(fellBack ? [FALLBACK_NOTE] : [])])

	const saved = await finishOutline(db, build._id, leaseId, { plan: normalized.plan, images: normalized.images, pages, issues }, usage, new Date(), served)
	if (!saved) throw new AiError('conflict', 'The rest of the site is already being planned.')
	const doc = await buildsOf(db).findOne({ _id: build._id })
	if (!doc) throw new AiError('not-found')
	return toBuildView(doc)
}
