import 'server-only'
import type { Db } from 'mongodb'
import { catalogText } from '../catalog'
import { resolveDesign } from '../design/generate'
import { sanitizeLook } from '../look'
import type { SiteDoc } from '../site-doc'
import { readSiteProfile } from '../site-profile'
import { availability, factCorpus, groundBusiness, pageCapOf } from './brief'
import { buildsOf, savePlan, toBuildView } from './builds'
import { normalizeChrome } from './chrome'
import { AI_LIMITS, type BuildView, type CallUsage, type Issue } from './contract'
import { AiError } from './errors'
import { promoImagePicker } from './images'
import { profileFill } from './landing'
import { callStructured, type Effort } from './model'
import type { RunContext } from './ndjson'
import { normalizePlan, type PlanContext } from './plan-normalize'
import {
	CHROME_SCHEMA,
	LOOSE_PLAN_CORE_SCHEMA,
	PLAN_CORE_SCHEMA,
	PLANNER_PROMPT,
	chromeUserContent,
	existingForPlanner,
	planUserContent,
	readChromeReply,
	readPlanReply,
	type PlanReply,
} from './planner'
import { loadPhotoPool } from './pool'
import { addUsage, callSignal, dedupeIssues, existingOf, recordDay, userKeyOf, ZERO_USAGE } from './run-shared'
import { siteContextText } from './site-context'
import type { AiBuildDoc, BuildPageDoc, NormalizedRequest } from './types'

/**
 * The plan stage (section 4.2 steps 8 to 11): one model call that plans the site, then
 * everything code decides from it — the normalized pages, the design, the header and
 * footer, where the photos go, the frozen writer context and the profile fill — saved on
 * the build in one guarded write. Runs inside the create route's stream.
 */

const PLAN_STAGE = {
	site: { effort: 'medium' as Effort, maxTokens: 32000, ms: 240_000 },
	page: { effort: 'high' as Effort, maxTokens: 24000, ms: 200_000 },
}

const envEffort = (name: string, fallback: Effort): Effort => {
	const value = process.env[name]?.trim()
	return value === 'low' || value === 'medium' || value === 'high' ? value : fallback
}

/** The planner's system blocks: the prompt, then the catalog, cached for an hour (both are module constants). */
export function plannerSystem() {
	return [
		{ type: 'text' as const, text: PLANNER_PROMPT },
		{ type: 'text' as const, text: catalogText(), cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } },
	]
}

/** The plan without its chrome (the whole plan is too large a grammar for the API); the chrome is its own call. */
export const planSchema = () => (process.env.BUILDER_AI_LOOSE_LAYOUTS === '1' ? LOOSE_PLAN_CORE_SCHEMA : PLAN_CORE_SCHEMA)

const CHROME_MS = 60_000

const pageDoc = (page: { key: string; id: string; name: string; slug: string }): BuildPageDoc => ({
	key: page.key,
	pageId: page.id,
	name: page.name,
	slug: page.slug,
	status: 'pending',
	attempts: 0,
	leaseId: null,
	leaseUntil: null,
	startedAt: null,
	writtenAt: null,
	reachedModel: false,
	refunded: false,
	extraUnits: 0,
	lastError: null,
	issues: [],
	written: null,
	usage: { ...ZERO_USAGE },
})

export async function runPlan(input: {
	db: Db
	site: SiteDoc
	userId: string
	request: NormalizedRequest
	build: AiBuildDoc
	ctx: RunContext
}): Promise<BuildView> {
	const { db, site, request, build, ctx } = input
	const profile = readSiteProfile(site.profile)
	const projectName = site.name
	const pages = site.site?.pages ?? []
	const chromeNow = site.site?.chrome

	const pool = await loadPhotoPool(db, site, request)
	const business = groundBusiness({ request, profile, projectName })
	const corpus = factCorpus({ request, profile, projectName, reviews: request.reviews })
	const avail = availability({ request, business, pool, profile })
	const currentLook = pages.length ? sanitizeLook(site.look ?? {}) : null
	const plannerExisting = existingForPlanner({ request, pages, chrome: chromeNow, theme: currentLook?.theme ?? null })
	const businessType = request.business.type || (profile.business.type === 'LocalBusiness' ? '' : profile.business.type)
	const pageCap = pageCapOf(request)

	const stage = PLAN_STAGE[request.mode]
	const effort: Effort = request.fast ? 'low' : envEffort('BUILDER_AI_PLAN_EFFORT', stage.effort)
	const issues: Issue[] = []
	let usage: CallUsage = { ...ZERO_USAGE }
	const models: string[] = []
	let fallback = false

	const call = (images: boolean) =>
		callStructured<PlanReply>({
			stage: 'plan',
			effort,
			maxTokens: stage.maxTokens,
			system: plannerSystem(),
			content: planUserContent({ request, business, businessType, availability: avail, pool, existing: plannerExisting, pageCap, images }),
			schema: planSchema(),
			read: readPlanReply,
			signal: callSignal(ctx, stage.ms),
			userKey: userKeyOf(site),
			replayKey: images ? 'plan' : 'plan-noimages',
			onStage: (next) => ctx.emit({ t: 'stage', stage: next }),
			log: { buildId: build._id },
		})

	let reply: PlanReply
	try {
		const result = await call(true)
		reply = result.value
		usage = addUsage(usage, result.usage)
		models.push(result.model)
		fallback = result.fallback
	} catch (error) {
		// A photo the API could not open fails the whole call as a 400; one retry without them.
		if (!(error instanceof AiError) || error.code !== 'invalid-reply' || error.provider?.status !== 400 || !pool.some((photo) => photo.vision))
			throw error
		await recordDay(db, build, error.usage)
		usage = addUsage(usage, error.usage)
		const result = await call(false)
		reply = result.value
		usage = addUsage(usage, result.usage)
		models.push(result.model)
		fallback = result.fallback
		issues.push({ level: 'warn', code: 'photos-unseen', message: 'Some photos could not be opened, so the AI placed them from their descriptions.' })
	}
	await recordDay(db, build, usage)
	ctx.emit({ t: 'stage', stage: 'checking' })

	const existing = existingOf(pages, chromeNow)
	const planCtx: PlanContext = { request, corpus, business, pool, availability: avail, existing, now: new Date().toISOString(), projectName }
	const normalized = normalizePlan(reply, planCtx)
	const plan = normalized.plan
	if (!plan.pages.length) throw new AiError('invalid-reply', 'The AI could not plan any pages. Try describing the site differently.')

	// replace-page always keeps the look; append keeps it when asked; a whole new site never does.
	const keepDesign = request.placement === 'replace-site' ? false : request.placement === 'replace-page' ? true : request.pins.keepDesign
	const replacesChrome = request.placement === 'replace-site' || (request.placement === 'append' && request.mode === 'site' && request.pins.updateMenu)

	let chrome: AiBuildDoc['chrome'] = null
	let chromeNotes: Issue[] = []
	if (replacesChrome) {
		const named = request.placement === 'append' ? pages.map((page) => ({ name: page.name, slug: page.slug })) : []
		// The header and menu, planned against the final slugs. A failure never fails the
		// build: the menu is then laid out from the pages themselves.
		let chromeReply = reply.chrome
		try {
			const result = await callStructured<PlanReply['chrome']>({
				stage: 'plan',
				effort: 'low',
				maxTokens: 8000,
				system: plannerSystem(),
				content: chromeUserContent({ plan, request, business, existing: named }),
				schema: CHROME_SCHEMA,
				read: readChromeReply,
				signal: callSignal(ctx, CHROME_MS),
				userKey: userKeyOf(site),
				replayKey: 'chrome',
				log: { buildId: build._id, key: 'chrome' },
			})
			chromeReply = result.value
			usage = addUsage(usage, result.usage)
			models.push(result.model)
			await recordDay(db, build, result.usage)
		} catch (error) {
			if (ctx.signal.aborted) throw error
			const spent = error instanceof AiError ? error.usage : null
			usage = addUsage(usage, spent)
			await recordDay(db, build, spent)
			issues.push({ level: 'info', code: 'menu-adjusted', message: 'The menu was laid out from your pages.' })
		}
		const result = normalizeChrome({
			reply: chromeReply,
			pages: plan.pages,
			existing: named,
			site: plan.site,
			contact: {
				phone: business.phone?.display ?? null,
				email: business.email?.display ?? null,
				address: business.address || null,
				hours: business.hours,
			},
			personality: plan.site.personality,
			pins: request.pins,
			current: keepDesign && chromeNow ? chromeNow : null,
			promoImage: promoImagePicker(normalized.images, plan.pages),
			corpus,
			language: plan.site.language,
		})
		chrome = result.chrome
		chromeNotes = result.notes
	}

	const design = resolveDesign({
		reply: reply.design,
		personality: plan.site.personality,
		pins: request.pins,
		keepDesign,
		current: currentLook,
		header: chrome?.header ?? chromeNow?.header ?? 'bar',
	})

	const outlinePending = plan.pages.some((page) => !page.outlined)
	await savePlan(
		db,
		build._id,
		{
			context: { business, corpus, availability: avail },
			plan,
			design,
			chrome,
			images: normalized.images,
			writerContext: siteContextText({ plan, business, request }),
			pages: plan.pages.map(pageDoc),
			outline: { status: outlinePending ? 'pending' : 'none', attempts: 0, leaseId: null, leaseUntil: null },
			profilePatch: profileFill({ plan, business, profile }),
			issues: dedupeIssues([...issues, ...plan.issues, ...design.notes, ...chromeNotes]),
		},
		usage,
		new Date(),
		{ models, fallback },
	)

	const saved = await buildsOf(db).findOne({ _id: build._id })
	if (!saved) throw new AiError('not-found')
	return toBuildView(saved)
}

/** Exported for the route proof. */
export const __test = { PLAN_STAGE, pageDoc, AI_LIMITS }
