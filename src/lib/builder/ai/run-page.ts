import 'server-only'
import type { Db } from 'mongodb'
import { composePage } from '../catalog'
import type { Chrome } from '../page-schema'
import type { SiteDoc } from '../site-doc'
import { buildsOf, finishPage, markReachedModel, settleBuild, toPageView } from './builds'
import { AI_LIMITS, type CallUsage, type PageView } from './contract'
import { AiError } from './errors'
import { callStructured, type Effort } from './model'
import type { RunContext } from './ndjson'
import { guessArchetype } from './planner'
import { addUsage, callSignal, planContextOf, recordDay, usageOfError, userKeyOf, ZERO_USAGE } from './run-shared'
import { pageManifest } from './site-context'
import type { AiBuildDoc, NormalizedPage } from './types'
import { composeContext, finishWrittenPage, readWriteReply, repairUserContent, WRITE_SCHEMA, WRITER_PROMPT, writeUserContent, type WriteReply } from './writer'

/**
 * The page stage (section 10.1): compose the page from its plan, one call writes every
 * slot, the result is cleaned and checked, an optional low-effort repair fixes what
 * failed, deterministic fallbacks cover the rest, and the finished page is stored under
 * the page's lease. A page that still cannot be completed fails as retryable.
 */

const WRITE_MS = 190_000
const REPAIR_MS = 45_000

const envEffort = (name: string, fallback: Effort): Effort => {
	const value = process.env[name]?.trim()
	return value === 'low' || value === 'medium' || value === 'high' ? value : fallback
}

/** Whether the page shows in the plain pages row: home, and every page the header menu links. */
function inHeaderOf(page: NormalizedPage, chrome: Chrome | null): boolean {
	if (page.slug === '/' || !chrome) return true
	const slug = page.slug.replace(/^\/+/, '')
	return chrome.menu.some((item) => item.href.replace(/^\/+/, '') === slug || item.links.some((link) => link.href.replace(/^\/+/, '') === slug))
}

/** The opener headings of pages already written, so a page does not repeat another's promise. */
function alreadyWritten(build: AiBuildDoc, key: string) {
	return build.pages
		.filter((page) => page.key !== key && page.status === 'written' && page.written)
		.map((page) => {
			const title = page.written!.page.blocks.map((block) => block.props?.title).find((value) => typeof value === 'string')
			return { page: page.name, h1: String(title ?? '').replace(/\[\[|\]\]/g, '').slice(0, 120) }
		})
		.filter((entry) => entry.h1)
		.slice(0, 11)
}

export async function runPage(input: {
	db: Db
	site: SiteDoc
	build: AiBuildDoc
	key: string
	leaseId: string
	attempt: number
	ctx: RunContext
	/** Usage spent so far by this request (repair included), for the failure path. */
	spent: { usage: CallUsage }
}): Promise<PageView> {
	const { db, site, build, key, leaseId, attempt, ctx, spent } = input
	const plan = build.plan
	const images = build.images
	const design = build.design
	const page = plan?.pages.find((item) => item.key === key)
	if (!plan || !images || !design || !page || !build.writerContext) throw new AiError('conflict', 'This build has no plan for that page.')
	if (!page.outlined) throw new AiError('not-ready')

	const planCtx = planContextOf(build, site.name)
	const request = build.input
	const existing = build.placement === 'replace-site'
		? []
		: build.snapshot.pages.map((item) => ({ name: item.name, slug: item.slug, archetype: guessArchetype(item) }))
	const composed = composePage(page, composeContext({ plan, page, images, business: planCtx.business, request, polarity: design.polarity, existing }))
	const manifest = pageManifest({ page, sections: composed.sections, alreadyWritten: alreadyWritten(build, key) })
	const system = [
		{ type: 'text' as const, text: WRITER_PROMPT, cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } },
		{ type: 'text' as const, text: build.writerContext, cache_control: { type: 'ephemeral' as const } },
	]
	const previous = build.pages.find((item) => item.key === key)?.lastError?.code
	const effort: Effort = attempt > 1 && (previous === 'timeout' || previous === 'truncated') ? 'low' : envEffort('BUILDER_AI_WRITE_EFFORT', 'medium')
	const models: string[] = []
	const requestIds: string[] = []
	let fallback = false
	let reached = false

	const take = (result: { usage: CallUsage; model: string; requestId: string | null; fallback: boolean }) => {
		spent.usage = addUsage(spent.usage, result.usage)
		models.push(result.model)
		if (result.requestId) requestIds.push(result.requestId)
		fallback ||= result.fallback
	}

	const first = await callStructured<WriteReply>({
		stage: 'write',
		effort,
		maxTokens: 32000,
		system,
		content: writeUserContent(manifest),
		schema: WRITE_SCHEMA,
		read: readWriteReply,
		signal: callSignal(ctx, WRITE_MS),
		userKey: userKeyOf(site),
		replayKey: `write-${key}`,
		onModel: () => {
			if (reached) return
			reached = true
			void markReachedModel(db, build._id, key, leaseId).catch(() => {})
		},
		onStage: (next) => ctx.emit({ t: 'stage', stage: next }),
		log: { buildId: build._id, key, attempt },
	})
	take(first)
	await recordDay(db, build, first.usage)

	ctx.emit({ t: 'stage', stage: 'checking' })
	const inHeader = inHeaderOf(page, build.chrome)
	const finish = (repair: WriteReply | null) =>
		finishWrittenPage({ page, composed, reply: first.value, repair, ctx: planCtx, kit: design.kit, plan, inHeader })
	let result = finish(null)

	if (result.problems.length && ctx.elapsed() < AI_LIMITS.repairCutoffMs) {
		ctx.emit({ t: 'stage', stage: 'repairing' })
		try {
			const repair = await callStructured<WriteReply>({
				stage: 'repair',
				effort: 'low',
				maxTokens: 8000,
				system,
				content: repairUserContent({ page, seo: first.value.seo, problems: result.problems }),
				schema: WRITE_SCHEMA,
				read: readWriteReply,
				signal: callSignal(ctx, REPAIR_MS),
				userKey: userKeyOf(site),
				replayKey: `repair-${key}`,
				log: { buildId: build._id, key, attempt },
			})
			take(repair)
			await recordDay(db, build, repair.usage)
			result = finish(repair.value)
		} catch (error) {
			// Stop still stops (the route records what the call spent). Any other failed repair
			// leaves the first pass with its fallbacks.
			if (ctx.signal.aborted) throw error
			await recordDay(db, build, usageOfError(error))
			spent.usage = addUsage(spent.usage, usageOfError(error))
		}
	}

	if (result.hard.length) throw new AiError('invalid-reply', 'This page could not be written cleanly. Try it again.')

	const now = new Date()
	const ok = await finishPage(db, build._id, key, leaseId, result.written, result.issues, spent.usage, requestIds, now, { models, fallback })
	if (!ok) throw new AiError('conflict', 'A newer attempt is writing this page.')
	await settleBuild(db, build._id, now)
	const doc = await buildsOf(db).findOne({ _id: build._id })
	const view = doc ? toPageView(doc, key) : null
	if (!view) throw new AiError('not-found')
	return view
}

export const __test = { inHeaderOf, alreadyWritten, ZERO_USAGE }
