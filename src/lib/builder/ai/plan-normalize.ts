/**
 * Plan normalization (sections 7.3 to 7.11). The planner gets the judgement calls; this
 * module guarantees the invariants. Every page gets one opener first and (on marketing
 * pages) one closer last, sections whose owner data is missing fall back or go, density
 * and surfaces alternate, openers, closers and variants vary across the site, reviews and
 * photos are spread without repeats, and every count and tweak is one the layout accepts.
 * Every repair becomes an Issue for the review view.
 *
 * Pure: the routes and the proofs share it.
 */
import { catalog } from '../catalog'
import { CHILD_META } from '../catalog/children'
import { clampCount, countFor, SECTION_META } from '../catalog/meta'
import { ARCHETYPE_RULES, RECIPES, type RecipeStep } from '../catalog/recipes'
import type { Density, Need, SectionMeta, VariantMeta } from '../catalog/types'
import { PERSONALITIES, personalityFor } from '../design/personalities'
import {
	CLOSER_LAYOUTS,
	LAYOUT_IDS,
	OPENER_LAYOUTS,
	type Archetype,
	type ChildLayout,
	type Layout,
	type PersonalityId,
	type SurfaceTone,
	type Tweak,
} from '../design/vocab'
import { slugify, type Chrome } from '../page-schema'
import { ANNOUNCEMENT, cleanText, pageCapOf, PHOTO_KINDS } from './brief'
import { matchPageTarget } from './chrome'
import type { Issue, OwnerReview } from './contract'
import { normalizeForMatch, scanClaims } from './facts'
import { assignImages, photoFit, sectionImageSlots, type AssignResult, type PlannedImageSlot } from './images'
import type { OutlineReply } from './outline'
import { clampText, guessArchetype, type PlanReply, type SectionPlan } from './planner'
import type {
	Availability,
	GroundedBusiness,
	ImagePlan,
	NormalizedPage,
	NormalizedPlan,
	NormalizedRequest,
	NormalizedSection,
	PhotoCandidate,
	PhotoNote,
	SitePlan,
} from './types'

export type { Availability } from './types'

export type PlanContext = {
	request: NormalizedRequest
	corpus: string // factCorpus(): the owner's own text, for provenance checks (section 10.6)
	business: GroundedBusiness // groundBusiness(): verified name, phone, email, city, region, areas, hours
	pool: PhotoCandidate[]
	availability: Availability // section 7.9 counts before the plan, also shown to the planner
	existing: { pages: { id: string; name: string; slug: string; archetype: Archetype | null }[]; chrome: Chrome } | null
	now: string
	/** The project's name: a business name the planner read from the brief may also match it (section 7.10). */
	projectName?: string
	/**
	 * What the plan established, which composition relies on: the verified facts, services
	 * and areas, the sitemap, the photos as the planner described them. `normalizePlan` sets
	 * it; without it the pre-plan `availability` stands in.
	 */
	plan?: PlanData
}

export type PlanData = {
	personality: PersonalityId
	facts: number
	services: string[]
	areas: string[]
	/** The verified fact an announcement bar announces, else null (section 7.9). */
	announcement: string | null
	pages: { key: string; name: string; slug: string; path: string; archetype: Archetype }[]
	notes: PhotoNote[]
	footerTone: 'match' | 'soft' | 'inverse'
}

type Say = (code: Issue['code'], message: string, level?: Issue['level']) => void

// ---------------------------------------------------------------- the catalog, read

const OPENERS = new Set<string>(OPENER_LAYOUTS)
const CLOSERS = new Set<string>(CLOSER_LAYOUTS)
const LAYOUTS = new Set<string>(LAYOUT_IDS)
const STRONG = new Set<SurfaceTone>(['inverse', 'inverse-glow', 'brand'])

const metaOf = (type: string): SectionMeta | null =>
	Object.hasOwn(SECTION_META, type) && SECTION_META[type].ai !== 'never' ? SECTION_META[type] : null

function splitLayout(layout: string): { type: string; variant: string | null } {
	const at = layout.indexOf(':')
	if (at === -1) return { type: layout, variant: null }
	const variant = layout.slice(at + 1)
	return { type: layout.slice(0, at), variant: variant === 'default' ? null : variant }
}

const layoutId = (type: string, variant: string | null) => `${type}:${variant ?? 'default'}` as Layout

const variantMetaOf = (section: Pick<NormalizedSection, 'type' | 'variant'>): VariantMeta | undefined =>
	metaOf(section.type)?.variants.find((item) => item.id === (section.variant ?? 'default') && !item.excluded)

/** 'Page Hero (Centered)': the schema's labels, joined by the catalog. */
function labelOf(type: string, variant: string | null): string {
	try {
		const entry = catalog().get(type)
		if (entry) {
			const named = variant ? entry.variants.find((item) => item.id === variant) : undefined
			return named ? `${entry.label} (${named.label})` : entry.label
		}
	} catch {
		// The catalog join throws only on a curation bug, which the catalog proof reports.
	}
	const words = (text: string) => text.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
	return variant ? `${words(type)} (${words(variant)})` : words(type)
}

export const isOpener = (section: Pick<NormalizedSection, 'layout'>) => OPENERS.has(section.layout)
export const isCloser = (section: Pick<NormalizedSection, 'layout'>) => CLOSERS.has(section.layout)
const isTopBar = (section: NormalizedSection) => section.type === 'announcement-bar'
const isFaq = (section: NormalizedSection) => section.type === 'faq-accordion'
const isTestimonials = (section: NormalizedSection) => Boolean(section.child?.startsWith('testimonial-card'))
const rolesOf = (section: NormalizedSection) => metaOf(section.type)?.roles ?? []
const isExplain = (section: NormalizedSection) =>
	!isOpener(section) && !isCloser(section) && rolesOf(section).some((role) => role === 'explain' || role === 'showcase')

/** Density, where a grid of inline, numbered or list cards reads open (section 6.7). */
function densityOf(section: NormalizedSection): Density {
	const density = variantMetaOf(section)?.density ?? 'open'
	if (section.type === 'grid' && section.child) {
		const [type, variant] = section.child.split(':')
		if (CHILD_META[type]?.variants.find((item) => item.id === variant)?.density === 'open') return 'open'
	}
	return density
}

const headingBeside = (section: NormalizedSection) => variantMetaOf(section)?.headingBeside === true

/** "the page background", "a soft band", "an inverse band". */
const bandText = (tone: SurfaceTone) => (tone === 'plain' ? 'the page background' : `${/^[aeiou]/.test(tone) ? 'an' : 'a'} ${tone} band`)

// ---------------------------------------------------------------- what the owner's data supports

function dataOf(ctx: PlanContext): PlanData {
	if (ctx.plan) return ctx.plan
	return {
		personality: personalityFor(ctx.request.business.type || 'LocalBusiness'),
		facts: ctx.availability.facts,
		services: [],
		areas: ctx.business.areas,
		announcement: ctx.availability.announcement ? 'announced' : null,
		pages: (ctx.existing?.pages ?? []).map((page, index) => ({
			key: `e${index + 1}`,
			name: page.name,
			slug: page.slug,
			path: page.slug === '/' ? '/' : `/${page.slug}`,
			archetype: page.archetype ?? guessArchetype(page) ?? 'custom',
		})),
		notes: [],
		footerTone: 'match',
	}
}

const usablePhotos = (ctx: PlanContext) => ctx.pool.filter((photo) => PHOTO_KINDS.includes(photo.kind))

const notesOf = (data: PlanData) => new Map(data.notes.map((note) => [note.ref, note]))

/** A page opener's photo frame: large and 16:9. */
const HERO_FRAME = { role: 'hero', aspect: '16:9' } as const

/** Photos that can fill a page opener's frame (section 7.4). */
function heroCount(ctx: PlanContext, data: PlanData) {
	const notes = notesOf(data)
	return usablePhotos(ctx).filter((photo) => photoFit(photo, HERO_FRAME, notes) > 0).length
}

function pairCount(ctx: PlanContext, data: PlanData) {
	const refs = new Set(ctx.pool.map((photo) => photo.ref))
	const sides = new Map<string, Set<string>>()
	for (const note of data.notes) {
		if (note.pair === 'none' || !note.pairKey || !refs.has(note.ref)) continue
		const set = sides.get(note.pairKey) ?? new Set<string>()
		set.add(note.pair)
		sides.set(note.pairKey, set)
	}
	return [...sides.values()].filter((set) => set.has('before') && set.has('after')).length
}

const contactCount = (ctx: PlanContext) => ctx.availability.contactFacts.length

/**
 * The names a chips strip or a marquee shows (section 7.9): chips the areas served, a
 * marquee the services, each falling back to the other list when its own is too short.
 */
function tickerList(type: string, services: string[], areas: string[]): string[] {
	if (type === 'marquee') return services.length >= 6 || services.length >= areas.length ? services : areas
	return areas.length >= 4 || areas.length >= services.length ? areas : services
}

const tickerCount = (section: Pick<NormalizedSection, 'type'>, data: PlanData) =>
	tickerList(section.type, data.services, data.areas).length

/** The owner's names a page's chips or marquee lists (`ComposeCtx.ticker`): areas or services, whichever its section needs. */
export function tickerFor(page: Pick<NormalizedPage, 'sections'>, plan: Pick<NormalizedPlan, 'site'>): string[] {
	const type = page.sections.some((section) => section.type === 'marquee') ? 'marquee' : 'chips'
	return tickerList(type, plan.site.services, plan.site.areas)
}

/** What a chips strip lists: the areas served when there are enough of them, else the services (a marquee on the same page keeps its own list). */
export function chipsFor(plan: Pick<NormalizedPlan, 'site'>): string[] {
	return tickerList('chips', plan.site.services, plan.site.areas)
}

/** Other pages a related-card grid can link to: the service pages, else every other page but home. */
function relatedCount(page: Pick<NormalizedPage, 'slug'>, data: PlanData) {
	const others = data.pages.filter((item) => item.slug !== page.slug && item.slug !== '/')
	const services = others.filter((item) => item.archetype === 'service')
	return services.length >= 2 ? services.length : others.length
}

const reviewCount = (ctx: PlanContext) => ctx.request.reviews.length

/** The fewest reviews a testimonial layout reads well with (sections 6.7 and 7.9). */
const reviewsWanted = (section: NormalizedSection) => (section.type === 'masonry' ? 3 : section.type === 'grid' ? 2 : 1)

const NEED_TEXT: Record<string, string> = {
	photo: 'photos that fit',
	'photo-pair': 'a before and after pair of photos',
	reviews: 'reviews from the owner',
	facts: 'figures the owner stated',
	'contact-facts': 'contact details',
	'ticker-items': 'a list of services or areas',
	announcement: 'something the owner announced',
	'prose-headings': 'an article to list',
	pages: 'pages to link to',
}

/** The needs a section has: a container's come from its cards (reviews, photos, names, page links). */
function needsOf(section: NormalizedSection): (Need | 'pages')[] {
	const meta = metaOf(section.type)
	if (!meta) return []
	if (!meta.children) return meta.needs
	const [type] = (section.child ?? meta.children.default).split(':')
	switch (CHILD_META[type]?.data) {
		case 'review':
			return ['reviews']
		case 'photo':
			return ['photo']
		case 'ticker':
			return ['ticker-items']
		case 'page-link':
			return ['pages']
		default:
			return meta.needs
	}
}

/**
 * Enough photos that fit one section: a photo never repeats on a page, so the section's
 * required slots need as many different photos, and each kind of slot (a 16:9 hero, a
 * 21:9 feature, a gallery tile) as many photos that can fill it. Assignment across the
 * site has the last word (section 6.9).
 */
function photosFit(section: NormalizedSection, page: NormalizedPage, ctx: PlanContext, data: PlanData) {
	const slots = sectionImageSlots(page, section, false).filter((slot) => slot.required)
	const photos = usablePhotos(ctx)
	if (!slots.length) return photos.length > 0
	if (photos.length < slots.length) return false
	const notes = notesOf(data)
	const kinds = new Map<string, { slot: PlannedImageSlot; count: number }>()
	for (const slot of slots) {
		const key = `${slot.role} ${slot.aspect}`
		kinds.set(key, { slot, count: (kinds.get(key)?.count ?? 0) + 1 })
	}
	return [...kinds.values()].every(({ slot, count }) => photos.filter((photo) => photoFit(photo, slot, notes) > 0).length >= count)
}

function needMet(need: Need | 'pages', section: NormalizedSection, page: NormalizedPage, ctx: PlanContext, data: PlanData): boolean {
	switch (need) {
		case 'photo':
			return photosFit(section, page, ctx, data)
		case 'photo-pair':
			return pairCount(ctx, data) >= 1
		case 'reviews':
			return reviewCount(ctx) >= reviewsWanted(section)
		case 'facts':
			return data.facts >= (section.type === 'stat-band' ? 3 : 2)
		case 'contact-facts':
			return contactCount(ctx) >= (section.variant === 'inline' ? 4 : 2)
		case 'ticker-items':
			return tickerCount(section, data) >= (section.type === 'marquee' ? 6 : 4)
		case 'announcement':
			return Boolean(data.announcement)
		case 'prose-headings':
			return page.sections.some((item) => item.type === 'prose-block')
		case 'pages':
			return relatedCount(page, data) >= 2
		default:
			// prices, client logos, people, video, forms, deadlines and the rest: never in v1 (section 6.10).
			return false
	}
}

/** The first need of a section the owner's data does not meet, or null when all are met. */
function unmetNeed(section: NormalizedSection, page: NormalizedPage, ctx: PlanContext): string | null {
	const data = dataOf(ctx)
	if (!metaOf(section.type)) return 'a section the kit offers'
	for (const need of needsOf(section)) if (!needMet(need, section, page, ctx, data)) return need
	return null
}

export function sectionNeedsMet(section: NormalizedSection, page: NormalizedPage, ctx: PlanContext): boolean {
	return unmetNeed(section, page, ctx) === null
}

// ---------------------------------------------------------------- one section

const TWEAK_GROUPS: Tweak[][] = [
	['one-button', 'no-buttons'],
	['cols-2', 'cols-3', 'cols-4'],
	['marker-plus', 'marker-chevron', 'marker-check', 'marker-arrow'],
	['numbers-solid', 'numbers-outline', 'numbers-muted'],
	['size-md', 'size-lg', 'size-full'],
]

/** The tweaks the type offers and the owner's data backs, one of each exclusive group. */
function fitTweaks(section: NormalizedSection, ctx: PlanContext): Tweak[] {
	const meta = metaOf(section.type)
	if (!meta) return []
	const data = dataOf(ctx)
	const kept: Tweak[] = []
	for (const tweak of section.tweaks) {
		if (!meta.tweaks.includes(tweak) || kept.includes(tweak)) continue
		if (TWEAK_GROUPS.some((group) => group.includes(tweak) && group.some((other) => kept.includes(other)))) continue
		if (tweak === 'hero-stats' && data.facts < 2) continue
		// The fan wants five photos behind the main one (section 7.4).
		if (tweak === 'fan' && usablePhotos(ctx).length < 6) continue
		if (tweak === 'tile-images' && !usablePhotos(ctx).length) continue
		if (tweak === 'details' && section.type === 'spotlight' && (!contactCount(ctx) || section.variant === 'overlap')) continue
		kept.push(tweak)
	}
	return kept
}

/** The tone itself when the type allows it, else the nearest allowed one, soft then plain (section 7.3 rule 12). */
function fitSurface(section: Pick<NormalizedSection, 'type'>, tone: SurfaceTone): SurfaceTone {
	const allowed = metaOf(section.type)?.surfaces ?? ['plain']
	if (allowed.includes(tone)) return tone
	for (const next of ['soft', 'plain'] as const) if (allowed.includes(next)) return next
	return allowed[0] ?? 'plain'
}

/** The item count the layout accepts, held to what the owner's data can fill. */
function fitItems(section: NormalizedSection, page: NormalizedPage, ctx: PlanContext): number {
	const meta = metaOf(section.type)
	if (!meta) return 0
	const data = dataOf(ctx)
	const rule = countFor(meta.items, section.variant)
	let count = rule ? clampCount(rule, section.items) : 0
	switch (section.type) {
		case 'stat-band':
			return data.facts >= 6 && section.items >= 6 ? 6 : 3
		case 'stat-hero':
			return data.facts >= 4 && section.items !== 2 ? 4 : 2
		case 'page-hero':
			return section.tweaks.includes('hero-stats') ? Math.min(3, data.facts) : 0
		case 'chips':
		case 'marquee':
			return Math.min(12, tickerCount(section, data))
		case 'detail-card':
			return rule ? Math.min(count, Math.max(rule.min, contactCount(ctx))) : count
		case 'bento-grid': {
			const wide = section.tweaks.includes('cols-4')
			return clampCount({ min: 4, max: wide ? 8 : 6, ideal: wide ? 4 : 6, allowed: wide ? [4, 6, 8] : [4, 6] }, section.items)
		}
	}
	if (isTestimonials(section) && section.reviews.length) count = section.reviews.length
	else if (section.child?.startsWith('related-card')) count = Math.min(8, Math.max(2, relatedCount(page, data)))
	return count
}

/** A planned or recipe section, made valid for its type (unknown variants and child cards repaired). */
export function buildSection(
	spec: {
		layout: Layout; child?: ChildLayout | null; tweaks?: Tweak[]; surface?: SurfaceTone
		job?: string; items?: number; images?: string[]; reviews?: number[]
	},
	page: NormalizedPage,
	ctx: PlanContext,
): NormalizedSection | null {
	if (!LAYOUTS.has(spec.layout)) return null
	const { type, variant } = splitLayout(spec.layout)
	const meta = metaOf(type)
	if (!meta || !meta.variants.some((item) => item.id === (variant ?? 'default') && !item.excluded)) return null
	const child = meta.children
		? spec.child && meta.children.kinds.includes(spec.child)
			? spec.child
			: meta.children.default
		: null
	const refs = new Set(ctx.pool.map((photo) => photo.ref))
	const section: NormalizedSection = {
		key: '',
		layout: layoutId(type, variant),
		type,
		variant,
		label: labelOf(type, variant),
		job: clampText(spec.job || defaultJob(type, page), 160),
		items: spec.items ?? 0,
		child,
		surface: spec.surface ?? 'plain',
		tweaks: [...new Set(spec.tweaks ?? [])],
		images: (spec.images ?? []).filter((ref) => refs.has(ref)),
		reviews: spec.reviews ?? [],
	}
	section.tweaks = fitTweaks(section, ctx)
	section.surface = fitSurface(section, section.surface)
	section.items = fitItems(section, page, ctx)
	return section
}

/** The same section in another variant of its type (or another layout), keeping its job, images and reviews. */
function retarget(section: NormalizedSection, layout: Layout, page: NormalizedPage, ctx: PlanContext, extra: Tweak[] = []) {
	return buildSection(
		{
			layout,
			child: section.child,
			tweaks: [...section.tweaks, ...extra],
			surface: section.surface,
			job: section.job,
			items: section.items,
			images: section.images,
			reviews: section.reviews,
		},
		page,
		ctx,
	)
}

const JOBS: Record<string, string> = {
	'page-hero': 'Open the page with its promise and the primary action.',
	'split-hero': 'Open the page with its promise beside the best photo, and the primary action.',
	'stat-hero': "Open the page with its promise, backed by the owner's own figures.",
	'announcement-bar': 'Announce what the owner announced, in one line.',
	'stat-band': "Back the promise with the owner's own figures.",
	spotlight: 'Feature the main service with its best photo.',
	'before-after': 'Contrast the usual way with how this business does it.',
	'feature-rows': 'Show the main services, one row each with its photo.',
	'process-steps': 'Explain how working with the business goes, step by step.',
	'bento-grid': 'Show what the customer gets, one tile each.',
	'tabs-showcase': 'Walk through the main services, one tab each.',
	chips: 'List the places served, exactly as the owner named them.',
	'faq-accordion': 'Answer the questions customers ask before they get in touch.',
	'split-cta': 'Offer the two ways to take the next step.',
	'cta-band': 'Ask for the primary action.',
	'prose-block': "Tell the story in the owner's own words.",
	callout: 'Pull out the one thing the reader should remember.',
	'check-list': 'List what is included, one short item each.',
	'media-gallery': "Show the owner's work in photos.",
	'media-mosaic': "Show the owner's best work in photos.",
	figure: 'Show one photo with its context.',
	'image-compare': 'Show the before and after of one job.',
	grid: 'Present the items as cards, one line each.',
	masonry: 'Show what customers say, in their own words.',
	carousel: 'Show what customers say, in their own words.',
	marquee: 'Run the services in a ticker under a short label.',
	'detail-card': 'Give the ways to reach the business and invite the next step.',
	'table-of-contents': 'List the sections of the article.',
}

function defaultJob(type: string, page: Pick<NormalizedPage, 'purpose'>) {
	const base = JOBS[type] ?? 'Support the page with this section.'
	const purpose = page.purpose ? ` The page: ${page.purpose}` : ''
	return clampText(`${base}${purpose}`, 160)
}

// ---------------------------------------------------------------- openers and closers (sections 7.4, 7.5)

const BOLD_HOME = new Set<PersonalityId>(['bold', 'technical', 'luxe'])
const BRAND_CLOSE = new Set<PersonalityId>(['bold', 'playful', 'friendly', 'rugged'])
const QUIET_CLOSE = new Set<PersonalityId>(['refined', 'luxe', 'clinical'])
const TINTED_BAND = new Set<PersonalityId>(['bold', 'playful', 'friendly'])

type Choice = { layout: Layout; tweaks?: Tweak[]; surface?: SurfaceTone; child?: ChildLayout }

/** The opener an archetype gets when the page has none (section 7.4): a photo-led one when a photo can fill its frame. */
function openerChoices(page: NormalizedPage, ctx: PlanContext): Choice[] {
	const data = dataOf(ctx)
	const photo = heroCount(ctx, data) > 0
	const persona = data.personality
	switch (page.archetype) {
		case 'home':
			return [
				...(photo ? [{ layout: 'split-hero:split' as const, surface: 'plain' as const }] : []),
				{ layout: 'page-hero:centered', surface: BOLD_HOME.has(persona) ? 'inverse-glow' : 'wash' },
			]
		case 'services':
			return [{ layout: 'page-hero:centered', surface: 'tinted' }, ...(photo ? [{ layout: 'split-hero:reversed' as const }] : [])]
		case 'service':
			return [...(photo ? [{ layout: 'split-hero:reversed' as const }] : []), { layout: 'page-hero:left' }]
		case 'about':
			return [...(photo ? [{ layout: 'split-hero:split' as const }] : []), { layout: 'page-hero:left' }]
		case 'contact':
		case 'faq':
		case 'pricing':
		case 'article':
			return [{ layout: 'page-hero:compact' }]
		case 'landing':
			return [
				...(photo ? [{ layout: 'split-hero:split' as const, tweaks: ['one-button' as const], surface: 'wash' as const }] : []),
				{ layout: 'page-hero:centered', tweaks: ['one-button'], surface: 'wash' },
			]
		default:
			return (RECIPES[page.archetype]?.find((step) => step.role === 'opener')?.alternatives ?? [{ layout: 'page-hero:left' }]) as Choice[]
	}
}

const SERVICE_CLOSERS: Choice[] = [
	{ layout: 'cta-band:split', surface: 'plain' },
	{ layout: 'split-cta:cards', surface: 'inverse' },
	{ layout: 'cta-band:card', surface: 'soft' },
]

/** The closer an archetype gets when the page has none (section 7.5). */
function closerChoices(page: NormalizedPage, ctx: PlanContext, serviceIndex = 0): Choice[] {
	const persona = dataOf(ctx).personality
	switch (page.archetype) {
		case 'home':
			return QUIET_CLOSE.has(persona)
				? [{ layout: 'cta-band:split', surface: 'soft' }]
				: [{ layout: 'cta-band:centered', surface: BRAND_CLOSE.has(persona) ? 'brand' : 'inverse' }]
		case 'service':
			return [SERVICE_CLOSERS[serviceIndex % SERVICE_CLOSERS.length], ...SERVICE_CLOSERS]
		case 'services':
		case 'work':
		case 'process':
			return [{ layout: 'cta-band:centered', surface: 'inverse' }]
		case 'about':
			return [{ layout: 'split-cta:cards', surface: 'soft' }]
		case 'faq':
			return [{ layout: 'split-cta:cards', surface: 'plain' }]
		case 'landing':
			return [{ layout: 'cta-band:centered', tweaks: ['one-button'], surface: 'brand' }]
		default:
			return (RECIPES[page.archetype]?.find((step) => step.role === 'closer')?.alternatives ?? [{ layout: 'cta-band:split' }]) as Choice[]
	}
}

function firstFitting(choices: Choice[], page: NormalizedPage, ctx: PlanContext): NormalizedSection | null {
	for (const choice of choices) {
		const section = buildSection(choice, page, ctx)
		if (section && sectionNeedsMet(section, page, ctx)) return section
	}
	return null
}

/** The fallback of a section whose needs are unmet (section 7.3 rule 1). */
function fallbackOf(section: NormalizedSection, page: NormalizedPage): Choice | null {
	if (section.type === 'split-hero') return { layout: page.archetype === 'home' ? 'page-hero:centered' : 'page-hero:left' }
	if (section.type === 'stat-hero') return { layout: 'page-hero:centered', tweaks: ['hero-stats'] }
	if (isOpener(section)) return { layout: 'page-hero:left' }
	const fallback = metaOf(section.type)?.fallback
	return fallback ? { layout: fallback } : null
}

/** A section whose owner data is missing becomes its fallback (re-checked), else goes. */
function gate(section: NormalizedSection, page: NormalizedPage, ctx: PlanContext, say: Say): NormalizedSection | null {
	let current = section
	for (let hop = 0; hop < 3; hop++) {
		const unmet = unmetNeed(current, page, ctx)
		if (unmet === null) return current
		const fallback = fallbackOf(current, page)
		const next = fallback ? retarget(current, fallback.layout, page, ctx, fallback.tweaks) : null
		if (!next) {
			say('section-dropped', `${current.label} was left out: it needs ${NEED_TEXT[unmet] ?? unmet}.`)
			return null
		}
		say('section-replaced', `${current.label} needs ${NEED_TEXT[unmet] ?? unmet}, so ${next.label} is used instead.`)
		current = next
	}
	return unmetNeed(current, page, ctx) === null ? current : null
}

// ---------------------------------------------------------------- composition (section 7.3)

const HEADING_FIX: Record<string, string> = { 'faq-accordion': 'stacked', grid: 'centered', 'detail-card': 'rows' }
const BARE = new Set(['check-list', 'chips', 'callout', 'figure'])

/** Composition key: a layout once per page, a grid once per card kind (section 7.3 rule 7). */
const dupeKey = (section: NormalizedSection) => (section.type === 'grid' ? `${section.layout}+${section.child?.split(':')[0]}` : section.layout)

/**
 * The rules of section 7.3 on one page, in order: needs and fallbacks, one opener first,
 * the top bar, one closer last, the FAQ near the end, testimonials after the explanation,
 * no repeats, the archetype's size, density rhythm, no two side headings in a row, no
 * repetitive pairs, surfaces, and counts. Every repair adds an Issue.
 */
export function enforceComposition(page: NormalizedPage, ctx: PlanContext): { page: NormalizedPage; issues: Issue[] } {
	const issues: Issue[] = []
	const say: Say = (code, message, level = 'info') => issues.push({ level, code, message, pageKey: page.key })
	const data = dataOf(ctx)
	const rules = ARCHETYPE_RULES[page.archetype] ?? ARCHETYPE_RULES.custom
	const working: NormalizedPage = { ...page, sections: [] }

	// 1. Map and gate.
	let list: NormalizedSection[] = []
	for (const section of page.sections) {
		const gated = gate({ ...section, tweaks: [...section.tweaks], images: [...section.images], reviews: [...section.reviews] }, { ...page, sections: page.sections }, ctx, say)
		if (gated) list.push(gated)
	}
	working.sections = list

	// 2. Exactly one opener, first (after an optional announcement bar).
	const openerAt = list.findIndex(isOpener)
	if (openerAt === -1) {
		const opener = firstFitting(openerChoices(page, ctx), working, ctx)
		if (opener) {
			list.splice(list[0]?.type === 'announcement-bar' ? 1 : 0, 0, opener)
			say('section-added', `The page had no opening section, so ${opener.label} was added.`)
		}
	} else {
		const opener = list[openerAt]
		const extra = list.filter((section, index) => isOpener(section) && index !== openerAt)
		if (extra.length) say('section-dropped', 'A page opens once, so a second opening section was left out.')
		list = list.filter((section) => !isOpener(section))
		list.splice(list[0]?.type === 'announcement-bar' ? 1 : 0, 0, opener)
	}

	// 3. The top bar sits at the very top, and only with something announced.
	const bars = list.filter(isTopBar)
	if (bars.length) {
		list = list.filter((section) => !isTopBar(section))
		if (data.announcement) list.unshift(bars[0])
		else say('section-dropped', 'The announcement bar was left out: nothing announced is in the facts.')
		if (bars.length > 1) say('section-dropped', 'A page has one announcement bar.')
	}

	// 4. Marketing pages end on one closer.
	const closers = list.filter(isCloser)
	if (closers.length) {
		const kept = closers[closers.length - 1]
		if (closers.length > 1) say('section-dropped', 'A page asks once, so an extra closing section was left out.')
		list = [...list.filter((section) => !isCloser(section)), kept]
	} else if (rules.closer) {
		working.sections = list
		const closer = firstFitting(closerChoices(page, ctx), working, ctx)
		if (closer) {
			list.push(closer)
			say('section-added', `The page had no closing call to action, so ${closer.label} was added.`)
		}
	}

	// 5. The FAQ just before the closer, unless it is already among the last three.
	if (page.archetype !== 'faq') {
		const faqAt = list.findIndex(isFaq)
		if (faqAt !== -1 && faqAt < list.length - 3) {
			const [faq] = list.splice(faqAt, 1)
			const closerAt = list.findIndex(isCloser)
			list.splice(closerAt === -1 ? list.length : closerAt, 0, faq)
		}
	}

	// 6. Testimonials after the first explanation and before the FAQ.
	for (const testimonials of list.filter(isTestimonials)) {
		const from = list.indexOf(testimonials)
		list.splice(from, 1)
		const explain = list.findIndex(isExplain)
		const faq = list.findIndex(isFaq)
		let to = from
		if (explain !== -1 && to <= explain) to = explain + 1
		if (faq !== -1 && to > faq) to = faq
		to = Math.max(to, list.findIndex(isOpener) + 1)
		list.splice(to, 0, testimonials)
	}

	// 7. A layout once per page (several FAQ groups on the FAQ page).
	const seen = new Set<string>()
	list = list.filter((section) => {
		if (isFaq(section) && page.archetype === 'faq') return true
		const key = dupeKey(section)
		if (seen.has(key)) {
			say('section-dropped', `${section.label} was already on the page, so the repeat was left out.`)
			return false
		}
		seen.add(key)
		return true
	})

	// 8. The archetype's size: optional middle sections go from the end; short pages take recipe steps.
	const essential = (section: NormalizedSection) =>
		isOpener(section) || isCloser(section) || isTopBar(section) || isFaq(section) || isTestimonials(section)
	while (list.length > rules.max) {
		const at = [...list.keys()].reverse().find((index) => !essential(list[index]))
		if (at === undefined) break
		say('section-dropped', `${list[at].label} was left out to keep the page focused.`)
		list.splice(at, 1)
	}
	for (let guard = 0; list.length < rules.min && guard < 10; guard++) {
		working.sections = list
		const added = nextRecipeSection(working, ctx)
		if (!added) break
		const faq = list.findIndex(isFaq)
		const closer = list.findIndex(isCloser)
		const at = faq !== -1 ? faq : closer !== -1 ? closer : list.length
		list.splice(at, 0, added)
		say('section-added', `${added.label} was added so the page has enough to say.`)
	}

	// 9-11. Rhythm, twice, so a repair that creates a new neighbour is seen.
	for (let pass = 0; pass < 2; pass++) {
		working.sections = list
		list = rhythm(list, working, ctx, say)
	}

	// 12. Surfaces.
	list = surfaces(list, page, ctx, say)

	// 13. Counts and tweaks for whatever changed.
	working.sections = list
	list = list.map((section, index) => {
		const tweaks = fitTweaks(section, ctx)
		const next = { ...section, tweaks, key: `s${index + 1}` }
		next.items = fitItems(next, working, ctx)
		return next
	})

	return { page: { ...page, sections: list }, issues }
}

/** The next recipe step the page does not cover yet, as a section whose needs are met. */
function nextRecipeSection(page: NormalizedPage, ctx: PlanContext): NormalizedSection | null {
	const present = new Set(page.sections.map((section) => section.type))
	const layouts = new Set(page.sections.map((section) => section.layout))
	for (const step of RECIPES[page.archetype] ?? RECIPES.custom) {
		if (step.role === 'opener' || step.role === 'closer' || step.role === 'top-bar') continue
		if (step.alternatives.some((alternative) => present.has(splitLayout(alternative.layout).type))) continue
		for (const alternative of step.alternatives) {
			if (layouts.has(alternative.layout)) continue
			const section = buildSection(alternative, page, ctx)
			// Reviews are allocated once per page, so a page that is short never gains a testimonial section.
			if (section && !isTestimonials(section) && sectionNeedsMet(section, page, ctx)) return section
		}
	}
	return null
}

/** Rules 9 to 11: card density, open runs, media neighbours, side headings and repetitive pairs. */
function rhythm(input: NormalizedSection[], page: NormalizedPage, ctx: PlanContext, say: Say): NormalizedSection[] {
	const list = [...input]
	const swap = (index: number, layout: Layout, why: string, extra: Tweak[] = []) => {
		const next = retarget(list[index], layout, page, ctx, extra)
		if (!next || !sectionNeedsMet(next, page, ctx)) return false
		say('variant-rotated', `${list[index].label} became ${next.label} ${why}.`)
		list[index] = next
		return true
	}
	const reband = (index: number, avoid: SurfaceTone[], why: string) => {
		const section = list[index]
		const allowed = metaOf(section.type)?.surfaces ?? []
		const tone = (['soft', 'plain', 'tinted', 'wash', 'pattern'] as const).find((item) => allowed.includes(item) && !avoid.includes(item))
		if (!tone || tone === section.surface) return false
		say('surface-changed', `${section.label} moved to ${bandText(tone)} ${why}.`)
		list[index] = { ...section, surface: tone }
		return true
	}

	for (let index = 1; index < list.length; index++) {
		const before = list[index - 1]
		const current = list[index]
		// 9. Never two card sections on the same surface.
		if (densityOf(before) === 'card' && densityOf(current) === 'card' && before.surface === current.surface) {
			const open = variantMetaOf(current)?.openAlternative
			if (!(open && swap(index, layoutId(current.type, open), 'so two card sections do not meet')))
				reband(index, [before.surface], 'so two card sections do not meet')
		}
		// Two photo-led sections only on different surfaces.
		if (densityOf(before) === 'media' && densityOf(list[index]) === 'media' && before.surface === list[index].surface)
			reband(index, [before.surface], 'so two photo sections do not run together')
		// 10. Never two side headings in a row.
		if (headingBeside(before) && headingBeside(list[index])) {
			const fix = HEADING_FIX[list[index].type]
			if (fix) swap(index, layoutId(list[index].type, fix), 'so two side headings do not sit together')
		}
		// 11. Repetitive pairs.
		const pair = `${before.layout}>${list[index].layout}`
		if (pair === 'feature-rows:alternating>spotlight:split') swap(index, 'spotlight:stacked', 'so two zig-zag rows do not repeat')
		if (before.type === 'page-hero' && before.tweaks.includes('hero-stats') && list[index].type === 'stat-band') {
			list[index - 1] = { ...before, tweaks: before.tweaks.filter((tweak) => tweak !== 'hero-stats') }
			say('variant-rotated', 'The opening figures were left to the stat band that follows, so the numbers show once.')
		}
		if (BARE.has(before.type) && BARE.has(list[index].type) && !isCloser(list[index])) {
			say('section-dropped', `${list[index].label} was left out: two bare strips in a row read as empty space.`)
			list.splice(index, 1)
			index--
		}
	}

	// 9. At most three open sections in a row without a band: the middle one gets soft.
	for (let guard = 0; guard < 4; guard++) {
		let run: number[] = []
		let changed = false
		for (let index = 0; index <= list.length && !changed; index++) {
			const section = list[index]
			if (section && densityOf(section) === 'open' && section.surface === 'plain') {
				run.push(index)
				continue
			}
			if (run.length > 3) {
				const middle = run.slice(1, 3).find((at) => !isOpener(list[at]) && (metaOf(list[at].type)?.surfaces ?? []).includes('soft'))
				if (middle !== undefined) changed = reband(middle, ['plain'], 'to break a long run of open sections')
			}
			run = []
		}
		if (!changed) break
	}
	return list
}

/** Rule 12: where bands go, how many, and which tones may meet. */
function surfaces(input: NormalizedSection[], page: NormalizedPage, ctx: PlanContext, say: Say): NormalizedSection[] {
	const data = dataOf(ctx)
	const list = input.map((section) => ({ ...section }))
	const change = (index: number, tone: SurfaceTone, why: string) => {
		const fitted = fitSurface(list[index], tone)
		if (fitted === list[index].surface) return
		say('surface-changed', `${list[index].label} moved to ${bandText(fitted)} ${why}.`)
		list[index].surface = fitted
	}

	// Brand only on one closer that carries it; inverse-glow only on openers and the centred band.
	let brands = 0
	list.forEach((section, index) => {
		if (section.surface === 'brand') {
			const carries = section.layout === 'cta-band:centered' || section.layout === 'split-cta:rows'
			if (!carries || brands > 0) change(index, 'inverse', 'because an accent band is kept for the closing call to action')
			else brands++
		}
		if (section.surface === 'inverse-glow' && !isOpener(section) && section.layout !== 'cta-band:centered')
			change(index, 'inverse', 'because the glow is kept for openers and the closing band')
		const fitted = fitSurface(section, list[index].surface)
		if (fitted !== list[index].surface) change(index, fitted, 'because its layout cannot carry that band')
	})

	// Never the same band twice in a row, and never two full colour flips side by side.
	for (let index = 1; index < list.length; index++) {
		const before = list[index - 1].surface
		const current = list[index].surface
		if (current === 'plain') continue
		if (before === current || (STRONG.has(before) && STRONG.has(current))) {
			// The closer keeps its band; the section before it steps back instead.
			if (isCloser(list[index])) change(index - 1, 'plain', 'so the closing band stands out')
			else change(index, 'plain', 'so two bands do not run together')
		}
	}

	// How many bands: at most 40%; a long page gets one to three; an all-plain page gets two.
	const max = Math.floor(list.length * 0.4)
	const banded = () => list.map((section, index) => (section.surface !== 'plain' ? index : -1)).filter((index) => index >= 0)
	if (list.length >= 4 && !banded().length) {
		const closer = list.findIndex(isCloser)
		if (closer !== -1 && max >= 1) {
			let tone: SurfaceTone = closerChoices(page, ctx)[0]?.surface ?? 'inverse'
			const carries = list[closer].layout === 'cta-band:centered' || list[closer].layout === 'split-cta:rows'
			if (tone === 'plain' || (tone === 'brand' && !carries)) tone = 'inverse'
			change(closer, tone, 'to give the page a closing band')
		}
		const middle = list.map((section, index) => ({ section, index })).filter(({ section }) => isExplain(section))
		const pick = middle[Math.floor((middle.length - 1) / 2)]
		if (pick && banded().length < max) {
			const tone: SurfaceTone = TINTED_BAND.has(data.personality) ? 'tinted' : 'soft'
			const neighbours = [list[pick.index - 1]?.surface, list[pick.index + 1]?.surface]
			if (!neighbours.includes(fitSurface(pick.section, tone))) change(pick.index, tone, 'to give the page rhythm')
		}
	}
	const limit = list.length >= 6 ? Math.min(3, max) : max
	// A band that keeps two card (or two photo) sections apart is rule 9's, so it goes last.
	const apart = (index: number, other: NormalizedSection | undefined) => {
		const section = list[index]
		if (!other || other.surface !== 'plain') return false
		const [a, b] = [densityOf(section), densityOf(other)]
		return (a === 'card' && b === 'card') || (a === 'media' && b === 'media')
	}
	const rank = (index: number) =>
		apart(index, list[index - 1]) || apart(index, list[index + 1]) ? 3 : isCloser(list[index]) ? 2 : isOpener(list[index]) ? 1 : 0
	while (banded().length > Math.max(limit, 0)) {
		// The middle bands step back first, then the opener's; the closer's and rule 9's stay longest.
		const index = banded().sort((a, b) => rank(a) - rank(b) || b - a)[0]
		if (index === undefined) break
		change(index, 'plain', 'to keep bands for punctuation')
		if (list[index].surface !== 'plain') break
	}

	// An inverse footer under an inverse closer would merge with it.
	const last = list.length - 1
	if (last >= 0 && data.footerTone === 'inverse' && list[last].surface === 'inverse') change(last, 'tinted', 'so it does not merge with the footer')
	return list
}

// ---------------------------------------------------------------- variety across the site (section 7.6)

const ROTATIONS: Record<string, string[]> = {
	'faq-accordion': ['split', 'boxed', 'stacked'],
	'process-steps': ['columns', 'timeline', 'cards'],
	'cta-band': ['split', 'card', 'centered'],
	'bento-grid': ['accent', 'numbered', 'divided'],
	grid: ['centered', 'above', 'beside'],
}

/** Signature layouts appear on one page each (section 7.6 rule 5). */
const signatureOf = (section: NormalizedSection) =>
	section.type === 'split-hero' && section.tweaks.includes('fan')
		? 'fan'
		: section.layout === 'spotlight:overlap' || section.type === 'media-mosaic' || section.type === 'stat-hero'
			? section.type === 'stat-hero' ? 'stat-hero' : section.layout
			: null

/**
 * The site's ledger: every page's layouts in sitemap order, plus `opener=<layout>`,
 * `closer=<layout>@<surface>` and `signature=<id>` entries, so a page outlined later can
 * vary from the pages already outlined.
 */
export function ledgerOf(pages: NormalizedPage[]): string[] {
	const ledger: string[] = []
	for (const page of pages) {
		if (!page.outlined) continue
		for (const layout of new Set(page.sections.map((section) => section.layout))) ledger.push(layout)
		const opener = page.sections.find(isOpener)
		const closer = [...page.sections].reverse().find(isCloser)
		if (opener) ledger.push(`opener=${opener.layout}`)
		if (closer) ledger.push(`closer=${closer.layout}@${closer.surface}`)
		for (const section of page.sections) {
			const signature = signatureOf(section)
			if (signature) ledger.push(`signature=${signature}`)
		}
	}
	return ledger
}

/** Whether the site's ledger still allows this layout on another page (section 7.6). */
export function ledgerAllows(layout: Layout, ledger: string[], page: Pick<NormalizedPage, 'archetype'>): boolean {
	if (ledger.filter((entry) => entry === layout).length >= 3) return false
	const { type } = splitLayout(layout)
	if ((layout === 'spotlight:overlap' || type === 'media-mosaic') && ledger.includes(`signature=${layout}`)) return false
	if (type === 'stat-hero' && ledger.includes('signature=stat-hero')) return false
	if (OPENERS.has(layout) && page.archetype !== 'service' && ledger.includes(`opener=${layout}`)) return false
	if (CLOSERS.has(layout)) {
		const last = [...ledger].reverse().find((entry) => entry.startsWith('closer='))
		if (last && last.slice(7).split('@')[0] === layout) return false
	}
	return true
}

/**
 * The variety rules across the site (section 7.6) a change to one page could break,
 * counted: a layout on more than three pages (service openers aside), a signature on more
 * than one, two pages other than service pages on one opener, consecutive pages ending
 * on the same closer and surface, consecutive service pages on the same closer, and a
 * recurring type repeating the variant it had last time (rules 3 and 6).
 */
function siteProblems(pages: NormalizedPage[]): number {
	const outlined = pages.filter((page) => page.outlined && page.sections.length)
	const perLayout = new Map<string, number>()
	const signatures = new Map<string, number>()
	const openers = new Map<string, number>()
	const lastVariant = new Map<string, string>()
	const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)
	let problems = 0
	let serviceCloser: string | null = null
	outlined.forEach((page, index) => {
		const service = page.archetype === 'service'
		for (const layout of new Set(page.sections.filter((section) => !(service && isOpener(section))).map((section) => section.layout)))
			count(perLayout, layout)
		for (const section of page.sections) {
			const signature = signatureOf(section)
			if (signature) count(signatures, signature)
			const variant = section.variant ?? 'default'
			if (ROTATIONS[section.type] && !isOpener(section) && !isCloser(section) && lastVariant.get(section.type) === variant) problems++
			lastVariant.set(section.type, variant)
		}
		const opener = page.sections.find(isOpener)
		if (opener && !service) count(openers, opener.layout)
		const before = outlined[index - 1]?.sections.at(-1)
		const last = page.sections.at(-1)
		if (before && last && isCloser(before) && before.layout === last.layout && before.surface === last.surface) problems++
		const closer = [...page.sections].reverse().find(isCloser)
		if (service && closer) {
			if (serviceCloser === closer.layout) problems++
			serviceCloser = closer.layout
		}
	})
	for (const total of perLayout.values()) problems += Math.max(0, total - 3)
	for (const total of signatures.values()) problems += Math.max(0, total - 1)
	for (const total of openers.values()) problems += Math.max(0, total - 1)
	return problems
}

/**
 * The photo a service page's opener can carry (section 7.6 rule 1, "if its photo exists"):
 * the opener's own pick, else a photo allocated to the page that can fill the opener's
 * frame and none of its other sections uses.
 */
function openerPhoto(page: NormalizedPage, at: number, ctx: PlanContext): string | null {
	const opener = page.sections[at]
	if (opener.type === 'split-hero' && opener.images[0]) return opener.images[0]
	const taken = new Set(page.sections.filter((_, index) => index !== at).flatMap((section) => section.images))
	const notes = notesOf(dataOf(ctx))
	const byRef = new Map(ctx.pool.map((photo) => [photo.ref, photo]))
	return (
		page.photoAllocation.find((ref) => {
			const photo = byRef.get(ref)
			return photo && !taken.has(ref) && PHOTO_KINDS.includes(photo.kind) && photoFit(photo, HERO_FRAME, notes) > 0
		}) ?? null
	)
}

/** Section 7.6 on the pages in `mutable`, against every page (including frozen ones) in sitemap order. */
function varietyPass(input: NormalizedPage[], ctx: PlanContext, mutable: Set<string>): { pages: NormalizedPage[]; issues: Issue[] } {
	const issues: Issue[] = []
	const pages = input.map((page) => ({ ...page, sections: page.sections.map((section) => ({ ...section })) }))
	const changed = new Set<string>()
	const sayFor = (page: NormalizedPage): Say => (code, message, level = 'info') =>
		issues.push({ level, code, message, pageKey: page.key })
	const replace = (page: NormalizedPage, index: number, layout: Layout, why: string, extra: Tweak[] = [], drop: Tweak[] = []) => {
		const current = page.sections[index]
		const next = retarget({ ...current, tweaks: current.tweaks.filter((tweak) => !drop.includes(tweak)) }, layout, page, ctx, extra)
		if (!next || !sectionNeedsMet(next, page, ctx)) return false
		if (next.layout === current.layout && next.tweaks.join() === current.tweaks.join()) return false
		page.sections[index] = { ...next, key: current.key }
		changed.add(page.key)
		const message = next.layout === current.layout ? `${current.label} was simplified ${why}.` : `${current.label} became ${next.label} ${why}.`
		sayFor(page)('variant-rotated', message)
		return true
	}
	const outlined = pages.filter((page) => page.outlined && page.sections.length)

	// 1. Openers: no two non-service pages share one; service pages alternate.
	const openersUsed = new Set<string>()
	let serviceIndex = 0
	for (const page of outlined) {
		const at = page.sections.findIndex(isOpener)
		if (at === -1) continue
		if (page.archetype === 'service') {
			serviceIndex++
			if (mutable.has(page.key)) {
				const odd = serviceIndex % 2 === 1
				const photo = openerPhoto(page, at, ctx)
				const layout = page.sections[at].layout
				if (odd && photo && layout !== 'split-hero:reversed') {
					if (replace(page, at, 'split-hero:reversed', 'so service pages alternate their openers'))
						page.sections[at] = { ...page.sections[at], images: [photo] }
				} else if (odd && !photo && layout !== 'page-hero:left') replace(page, at, 'page-hero:left', 'so service pages share one opener family')
				else if (!odd && layout !== 'page-hero:left') replace(page, at, 'page-hero:left', 'so service pages alternate their openers')
				if (!odd && page.sections[at].layout === 'page-hero:left' && page.sections[at].surface === 'plain') {
					page.sections[at] = { ...page.sections[at], surface: fitSurface(page.sections[at], 'wash') }
					changed.add(page.key)
				}
			}
			continue
		}
		const layout = page.sections[at].layout
		if (openersUsed.has(layout) && mutable.has(page.key)) {
			const choices = openerChoices(page, ctx).map((choice) => choice.layout).filter((item) => !openersUsed.has(item))
			const recipe = (RECIPES[page.archetype]?.find((step) => step.role === 'opener')?.alternatives ?? []).map((item) => item.layout)
			const alternative = [...choices, ...recipe.filter((item) => !openersUsed.has(item))].find((item) => item !== layout)
			if (alternative) replace(page, at, alternative, 'so pages open differently')
		}
		openersUsed.add(page.sections[at].layout)
	}

	// 2. Closers: consecutive pages never end on the same layout and surface; service pages rotate.
	let previous: NormalizedSection | null = null
	let previousService: NormalizedSection | null = null
	for (const page of outlined) {
		const at = page.sections.findIndex(isCloser)
		const closer = at === -1 ? null : page.sections[at]
		if (closer && mutable.has(page.key)) {
			if (page.archetype === 'service' && previousService && previousService.layout === closer.layout) {
				const from = SERVICE_CLOSERS.findIndex((choice) => choice.layout === previousService!.layout)
				const next = SERVICE_CLOSERS[(from + 1) % SERVICE_CLOSERS.length]
				replace(page, at, next.layout, 'so service pages close differently')
			}
			const current = page.sections[at]
			if (previous && previous.layout === current.layout && previous.surface === current.surface) {
				const allowed = metaOf(current.type)?.surfaces ?? []
				const tone = (['soft', 'plain', 'inverse', 'tinted'] as const).find((item) => item !== current.surface && allowed.includes(item))
				if (tone) {
					page.sections[at] = { ...current, surface: tone }
					changed.add(page.key)
					sayFor(page)('surface-changed', `${current.label} moved to ${bandText(tone)} so consecutive pages end differently.`)
				}
			}
		}
		if (closer) {
			previous = page.sections[at]
			if (page.archetype === 'service') previousService = page.sections[at]
		}
	}

	// 3 and 6. Recurring types rotate their variants; 4. no layout on more than three pages.
	const last = new Map<string, string>()
	const pagesPer = new Map<string, number>()
	for (const page of outlined) {
		page.sections.forEach((section, index) => {
			// Closers follow rule 2 (layout and surface), openers rule 1.
			const order = isCloser(section) || isOpener(section) ? undefined : ROTATIONS[section.type]
			const variant = section.variant ?? 'default'
			if (order && mutable.has(page.key)) {
				const repeat = last.get(section.type) === variant
				const crowded = (pagesPer.get(section.layout) ?? 0) >= 3
				if (repeat || crowded) {
					for (let step = 1; step < order.length; step++) {
						const next = order[(order.indexOf(variant) + step + order.length) % order.length]
						if ((pagesPer.get(layoutId(section.type, next)) ?? 0) >= 3) continue
						if (replace(page, index, layoutId(section.type, next), 'so the site does not repeat itself')) break
					}
				}
			} else if (!order && !isOpener(section) && mutable.has(page.key) && (pagesPer.get(section.layout) ?? 0) >= 3) {
				const meta = metaOf(section.type)
				const others = (meta?.variants ?? []).filter((item) => !item.excluded && item.id !== variant).map((item) => layoutId(section.type, item.id === 'default' ? null : item.id))
				const next = others.find((item) => (pagesPer.get(item) ?? 0) < 3)
				if (next) replace(page, index, next, 'so no layout appears on more than three pages')
			}
			const now = page.sections[index]
			last.set(now.type, now.variant ?? 'default')
		})
		for (const layout of new Set(page.sections.map((section) => section.layout))) pagesPer.set(layout, (pagesPer.get(layout) ?? 0) + 1)
	}

	// 5. Signatures on one page each.
	const signatures = new Set<string>()
	for (const page of outlined) {
		page.sections.forEach((section, index) => {
			const signature = signatureOf(section)
			if (!signature) return
			if (signatures.has(signature) && mutable.has(page.key)) {
				if (signature === 'fan') replace(page, index, section.layout, 'so the fanned photos stay a one-page signature', [], ['fan'])
				else if (section.layout === 'spotlight:overlap') replace(page, index, 'spotlight:split', 'so the overlapping spotlight stays a one-page signature')
				else if (section.type === 'media-mosaic') replace(page, index, 'media-gallery:bottom', 'so the mosaic stays a one-page signature')
				else if (section.type === 'stat-hero') replace(page, index, 'page-hero:centered', 'so the figure-led opener stays a one-page signature', ['hero-stats'])
			}
			const now = signatureOf(page.sections[index])
			if (now) signatures.add(now)
		})
	}

	// A page whose sections moved is composed again, so the page-level rules still hold.
	const result = pages.map((page) => {
		if (!changed.has(page.key)) return page
		const composed = enforceComposition(page, ctx)
		issues.push(...composed.issues)
		return composed.page
	})
	return { pages: result, issues }
}

export function enforceVariety(pages: NormalizedPage[], ctx: PlanContext): { pages: NormalizedPage[]; issues: Issue[] } {
	return varietyPass(pages, ctx, new Set(pages.map((page) => page.key)))
}

// ---------------------------------------------------------------- the recipe fallback (section 7.11)

/**
 * A page outlined in code: its archetype's recipe, the first alternative at each step
 * whose needs are met and that the ledger still allows, ideal counts, then the
 * composition rules (which band the middle explain section). `ledger` is `ledgerOf` the
 * pages already outlined. An opener and a closer are never skipped for the ledger's sake.
 */
export function outlineFromRecipe(page: NormalizedPage, ctx: PlanContext, ledger: string[]): NormalizedPage {
	const steps: RecipeStep[] = RECIPES[page.archetype] ?? RECIPES.custom
	const draft: NormalizedPage = { ...page, outlined: true, sections: [] }
	const fits = (choice: Choice, strict: boolean) => {
		const section = buildSection(choice, draft, ctx)
		if (!section || !sectionNeedsMet(section, draft, ctx)) return null
		if (isTestimonials(section) && !reviewCount(ctx)) return null
		if (strict && !ledgerAllows(section.layout, ledger, page)) return null
		if (draft.sections.some((other) => dupeKey(other) === dupeKey(section))) return null
		return section
	}
	for (const step of steps) {
		// An opener or a closer may also be the archetype's default (sections 7.4, 7.5), so the ledger can vary it.
		const essential = step.role === 'opener' || step.role === 'closer'
		const choices = [
			...(step.alternatives as Choice[]),
			...(essential ? (step.role === 'opener' ? openerChoices(page, ctx) : closerChoices(page, ctx)) : []),
		]
		let section: NormalizedSection | null = null
		for (const choice of choices) if (!section) section = fits(choice, true)
		if (!section && essential) for (const choice of choices) if (!section) section = fits(choice, false)
		if (section) draft.sections.push(section)
	}
	return enforceComposition(draft, ctx).page
}

// ---------------------------------------------------------------- reviews (section 7.9)

const words = (text: string) => new Set(normalizeForMatch(text).split(' ').filter((word) => word.length > 3))

/**
 * Reviews to testimonial sections: the reviews page gets all, home the best three or four
 * (longest first), a service page the ones that mention its service, without repeats
 * where possible. One review is a single featured quote on the home page only.
 */
function allocateReviews(pages: NormalizedPage[], ctx: PlanContext, mutable: Set<string>, say: (page: NormalizedPage) => Say): NormalizedPage[] {
	const reviews: OwnerReview[] = ctx.request.reviews
	const byLength = reviews.map((_, index) => index).sort((a, b) => reviews[b].quote.length - reviews[a].quote.length || a - b)
	const used = new Set<number>()
	for (const page of pages) for (const section of page.sections) if (!mutable.has(page.key)) section.reviews.forEach((index) => used.add(index))

	return pages.map((page) => {
		if (!mutable.has(page.key) || !page.sections.some(isTestimonials)) return page
		const sections: NormalizedSection[] = []
		for (const section of page.sections) {
			if (!isTestimonials(section)) {
				sections.push(section)
				continue
			}
			const total = reviews.length
			if (!total || (total === 1 && page.archetype !== 'home')) {
				say(page)('no-testimonials', `${section.label} was left out: it needs reviews from the owner.`)
				continue
			}
			const want =
				page.archetype === 'reviews' ? Math.min(total, section.type === 'masonry' ? 9 : 12)
					: section.type === 'carousel' ? Math.min(total, page.archetype === 'home' ? 4 : 3)
						: section.type === 'masonry' ? Math.min(total, 9)
							: [6, 4, 3, 2].find((count) => count <= Math.min(total, 6)) ?? total
			const topic = words(`${page.name} ${page.keyword}`)
			const mentions = (index: number) => [...words(reviews[index].quote)].some((word) => topic.has(word))
			const order =
				page.archetype === 'reviews'
					? byLength
					: [
							...byLength.filter((index) => page.archetype === 'service' && mentions(index) && !used.has(index)),
							...byLength.filter((index) => !used.has(index)),
							...byLength,
						]
			const picked = [...new Set(order)].slice(0, want)
			picked.forEach((index) => used.add(index))
			let next: NormalizedSection | null = { ...section, reviews: picked }
			// A layout that wants more quotes than there are becomes one that reads well with fewer.
			if (picked.length === 1) next = retarget(next, 'carousel:bars', page, ctx, ['size-full'])
			else if (next.type === 'masonry' && picked.length < 3) next = retarget(next, 'grid:centered', page, ctx)
			else if (next.layout === 'grid:beside' && ![4, 6].includes(picked.length)) next = retarget(next, 'grid:centered', page, ctx)
			if (!next) continue
			if (picked.length === 1) next = { ...next, child: 'testimonial-card:bare' }
			sections.push({ ...next, key: section.key, items: picked.length })
		}
		return { ...page, sections }
	})
}

// ---------------------------------------------------------------- the plan (section 7.10)

const LEGAL = /^(privacy( policy| notice)?|terms( (of (service|use)|and conditions|& conditions))?|cookie (policy|notice|settings)|legal( notice| information)?|gdpr|imprint|disclaimer|accessibility statement)$/i

const LANGUAGES: Record<string, string> = {
	english: 'en', spanish: 'es', español: 'es', espanol: 'es', french: 'fr', français: 'fr', francais: 'fr',
	german: 'de', deutsch: 'de', portuguese: 'pt', português: 'pt', italian: 'it', italiano: 'it', dutch: 'nl',
}

/** A BCP 47-looking tag ('en-US'), from a tag in any case or a language's name; else 'en'. */
function languageOf(value: string): string {
	const raw = String(value ?? '').trim()
	const named = LANGUAGES[raw.toLowerCase()]
	if (named) return named
	const [primary, ...rest] = raw.replace(/_/g, '-').split('-')
	const tag = [primary.toLowerCase(), ...rest.map((part) => (part.length === 2 ? part.toUpperCase() : part))].join('-')
	return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag) ? tag : 'en'
}

const pageId = () => `pg_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`

const SLUG_PAIRS: Partial<Record<Archetype, string>> = {
	services: 'our-services', pricing: 'pricing-plans', reviews: 'customer-reviews', contact: 'contact-us', about: 'about-us',
}

/** A flat slug of at most 60 characters, cut at a hyphen. */
function cleanSlug(raw: string, name: string) {
	let slug = slugify(String(raw || name).replace(/^\/+/, ''))
	if (slug.length > 60) slug = slug.slice(0, 60).replace(/-[^-]*$/, '') || slug.slice(0, 60)
	return slug
}

/**
 * A slug nobody holds (section 12.4's `freeSlug`): the wanted one, the pair of the page's
 * own archetype, `<slug>-<first word>`, then `-2`. Kept here because U7's copy in `land.ts`
 * is not a dependency of this unit; that one also takes the pair of the wanted slug, which
 * would give a "Gutters" page that asked for a taken `services` the address `our-services`.
 */
function freeSlug(wanted: string, taken: Set<string>, hint: { archetype: Archetype; name: string }) {
	const base = cleanSlug(wanted, hint.name)
	if (!taken.has(base) && base !== '/') return base
	const pair = SLUG_PAIRS[hint.archetype]
	if (pair && !taken.has(pair)) return pair
	const word = slugify(hint.name).split('-')[0]
	if (word && word !== base && !taken.has(`${base}-${word}`)) return `${base}-${word}`
	let n = 2
	while (taken.has(`${base}-${n}`)) n++
	return `${base}-${n}`
}

type Draft = PlanReply['pages'][number]

const sameName = (a: string, b: string) => normalizeForMatch(a) === normalizeForMatch(b) || slugify(a) === slugify(b)

/** The verified fact that backs an announcement bar (section 7.9): the owner's own announced offer or news. */
export function announcementFact(facts: NormalizedPlan['facts']): string | null {
	const fact = facts.find((item) => ANNOUNCEMENT.test(item.quote) || ANNOUNCEMENT.test(`${item.label} ${item.value}`))
	return fact ? fact.value : null
}

/** What composition relies on, from a normalized plan (for pages outlined after the plan). */
export function planDataOf(plan: NormalizedPlan, images: ImagePlan | null, existing: PlanContext['existing'], footerTone: PlanData['footerTone'] = 'match'): PlanData {
	const pages = plan.pages.map((page) => ({ key: page.key, name: page.name, slug: page.slug, path: page.path, archetype: page.archetype }))
	for (const [index, page] of (existing?.pages ?? []).entries()) {
		if (pages.some((item) => item.slug === page.slug)) continue
		pages.push({ key: `e${index + 1}`, name: page.name, slug: page.slug, path: page.slug === '/' ? '/' : `/${page.slug}`, archetype: page.archetype ?? guessArchetype(page) ?? 'custom' })
	}
	return {
		personality: plan.site.personality,
		facts: plan.facts.length,
		services: plan.site.services,
		areas: plan.site.areas,
		announcement: announcementFact(plan.facts),
		pages,
		notes: images?.notes ?? [],
		footerTone,
	}
}

/** The planner's pages under the pins and the placement (section 7.10 step 4), each with the reply page it came from. */
function planPages(reply: PlanReply, ctx: PlanContext, say: Say): { page: NormalizedPage; draft: Draft }[] {
	const { request } = ctx
	const cap = pageCapOf(request)
	const pins = request.pins.pages
	const existing = ctx.existing?.pages ?? []
	const legal = (name: string) => LEGAL.test(name.trim())
	const skipLegal = (name: string) => {
		say('page-skipped', 'The AI does not write legal pages. Add your own privacy policy.', 'warn')
		return name
	}

	let drafts: Draft[] = reply.pages.filter((page) => {
		if (!legal(page.name)) return true
		skipLegal(page.name)
		return false
	})
	const blank = (name: string, archetype: Archetype | null): Draft => ({
		name, slug: '', archetype, purpose: '', keyword: '', inMenu: true, opener: null, closer: null, photos: [], sections: [],
	})

	if (pins.kind === 'list') {
		const pool = [...drafts]
		drafts = []
		for (const name of pins.names) {
			if (legal(name)) {
				skipLegal(name)
				continue
			}
			const at = pool.findIndex((page) => sameName(page.name, name) || (page.slug && slugify(page.slug) === slugify(name)))
			const match = at === -1 ? null : pool.splice(at, 1)[0]
			drafts.push(match ? { ...match, name } : blank(name, guessArchetype({ slug: slugify(name), name })))
		}
	} else if (pins.kind === 'count') {
		if (drafts.length > pins.count) {
			// A count trims from the end, never the home page.
			const homeAt = drafts.findIndex((page) => page.archetype === 'home')
			const keep = homeAt >= pins.count ? [...drafts.slice(0, pins.count - 1), drafts[homeAt]] : drafts.slice(0, pins.count)
			for (const page of drafts.filter((page) => !keep.includes(page)))
				say('page-skipped', `"${clampText(page.name, 60)}" was left out to stay within ${pins.count} pages.`)
			drafts = keep
		}
		// Short of the count: recipe pages the business supports (service pages, then about and contact).
		const have = (archetype: Archetype) => drafts.some((page) => page.archetype === archetype)
		for (const service of reply.site.services) {
			if (drafts.length >= pins.count) break
			if (drafts.some((page) => sameName(page.name, service))) continue
			drafts.push({ ...blank(clampText(service, 60), 'service'), purpose: `The ${service} service in depth.` })
		}
		for (const [name, archetype] of [['About', 'about'], ['Contact', 'contact'], ['FAQ', 'faq']] as const) {
			if (drafts.length >= pins.count) break
			if (!have(archetype)) drafts.push(blank(name, archetype))
		}
	}

	// Placement.
	if (request.placement === 'replace-page') {
		const target = existing.find((page) => page.id === request.targetPageId)
		const first = drafts[0] ?? blank(target?.name ?? 'Page', target?.archetype ?? null)
		drafts = [{ ...first, name: target?.name ?? first.name, slug: target?.slug ?? first.slug, archetype: first.archetype ?? target?.archetype ?? null }]
	} else if (request.placement === 'replace-site') {
		// A page the planner calls home wins over one that merely asked for the root slug.
		const byArchetype = drafts.findIndex((page) => page.archetype === 'home')
		const homeAt = byArchetype !== -1 ? byArchetype : drafts.findIndex((page) => page.slug.trim() === '/')
		const onePage = Math.min(cap, drafts.length || 1) === 1
		if (pins.kind === 'list' || homeAt === 0) {
			// The first pinned name is the home page (the first chip in the dialog).
		} else if (homeAt > 0) {
			drafts.unshift(...drafts.splice(homeAt, 1))
		} else if (!(onePage && drafts[0]?.archetype === 'landing')) {
			drafts.unshift(blank('Home', 'home'))
			say('section-added', 'The plan had no home page, so one was added.')
		}
	}

	if (drafts.length > cap) {
		for (const page of drafts.slice(cap)) say('page-skipped', `"${clampText(page.name, 60)}" was left out to stay within ${cap} pages.`)
		drafts = drafts.slice(0, cap)
	}
	if (!drafts.length) drafts = [blank('Home', 'home')]

	// Names, slugs, archetypes, ids.
	const taken = new Set<string>(request.placement === 'append' ? existing.map((page) => page.slug) : [])
	const onePage = drafts.length === 1
	return drafts.map((draft, index) => ({ page: toPage(draft, index), draft }))

	function toPage(draft: Draft, index: number): NormalizedPage {
		const name = clampText(cleanText(draft.name) || (index === 0 ? 'Home' : `Page ${index + 1}`), 60)
		let archetype: Archetype = draft.archetype ?? guessArchetype({ slug: draft.slug, name }) ?? 'custom'
		let slug: string
		let id = pageId()
		if (request.placement === 'replace-page') {
			const target = existing.find((page) => page.id === request.targetPageId)
			slug = target?.slug ?? cleanSlug(draft.slug, name)
			id = target?.id ?? id
		} else if (request.placement === 'replace-site' && index === 0) {
			slug = '/'
			archetype = onePage && archetype === 'landing' ? 'landing' : 'home'
		} else {
			if (archetype === 'home') archetype = 'custom'
			const wanted = cleanSlug(draft.slug === '/' ? '' : draft.slug, name)
			slug = freeSlug(wanted, taken, { archetype, name })
			if (slug !== wanted && request.placement === 'append') say('slug-renamed', `"${name}" uses the address /${slug}, because /${wanted} is taken.`)
		}
		taken.add(slug)
		const refs = new Set(ctx.pool.map((photo) => photo.ref))
		return {
			key: `p${index + 1}`,
			id,
			name: request.placement === 'replace-page' ? (existing.find((page) => page.id === request.targetPageId)?.name ?? name) : name,
			slug,
			path: slug === '/' ? '/' : `/${slug}`,
			archetype,
			purpose: clampText(draft.purpose, 200),
			keyword: clampText(draft.keyword, 80),
			inMenu: draft.inMenu,
			// The plan outlines six pages; the rest (and any page it left empty) go to the outline call.
			outlined: index < 6 && draft.sections.length > 0,
			openerHint: draft.opener && OPENERS.has(draft.opener) ? draft.opener : null,
			closerHint: draft.closer && CLOSERS.has(draft.closer) ? draft.closer : null,
			photoAllocation: draft.photos.filter((ref) => refs.has(ref)),
			sections: [],
		}
	}
}

/** The site object (section 7.10 step 1). */
function planSite(reply: PlanReply, ctx: PlanContext, say: Say): Omit<SitePlan, 'primary'> {
	const corpus = ` ${normalizeForMatch(ctx.corpus)} `
	const inCorpus = (text: string) => {
		const value = normalizeForMatch(text)
		return Boolean(value) && corpus.includes(` ${value} `)
	}
	const businessType = ctx.request.business.type || reply.site.businessType
	const personality = reply.site.personality ?? personalityFor(businessType)
	const project = ` ${normalizeForMatch(ctx.projectName ?? '')} `
	const proposed = clampText(reply.site.name, 120)
	const name =
		ctx.business.name ||
		(proposed && (inCorpus(proposed) || project.includes(` ${normalizeForMatch(proposed)} `)) ? proposed : '')
	if (!name)
		say('name-missing', 'Add your business name in Business details so the header and copy can use it.', 'warn')

	const language = languageOf(reply.site.language)
	const gateText = (text: string) => {
		// The tagline and description keep only sentences with nothing the owner did not say.
		const sentences = text.match(/[^.!?]+[.!?]*/g) ?? []
		return sentences.filter((sentence) => !scanClaims(sentence, ctx.corpus, {}, { language }).length).join('').trim()
	}
	const areas = [...new Set([...ctx.business.areas, ...reply.site.areas.filter(inCorpus)].map((area) => clampText(area, 80)))].slice(0, 30)
	const services = [...new Set(reply.site.services.map((service) => clampText(service, 30)).filter(Boolean))].slice(0, 12)
	return {
		name,
		language,
		businessType,
		tagline: gateText(clampText(reply.site.tagline, 120)),
		description: gateText(clampText(reply.site.description, 155)),
		audience: clampText(reply.site.audience, 120),
		offer: clampText(reply.site.offer, 160),
		voice: clampText(reply.site.voice, 160),
		personality: Object.hasOwn(PERSONALITIES, personality) ? personality : personalityFor(businessType),
		services,
		areas,
	}
}

/** Facts whose quote is the owner's own words and whose numbers are in that quote (section 7.10 step 2). */
function planFacts(reply: PlanReply, ctx: PlanContext, say: Say): NormalizedPlan['facts'] {
	const corpus = ` ${normalizeForMatch(ctx.corpus)} `
	const facts: NormalizedPlan['facts'] = []
	for (const fact of reply.facts) {
		const quote = normalizeForMatch(fact.quote)
		const tokens = new Set(quote.split(' '))
		const numbers = normalizeForMatch(fact.value).match(/\d+/g) ?? []
		const ok = Boolean(quote) && Boolean(fact.value.trim()) && corpus.includes(` ${quote} `) && numbers.every((number) => tokens.has(number))
		if (!ok) {
			say('fact-removed', `"${clampText(fact.value || fact.quote, 40)}" was left out: it is not something you wrote.`)
			continue
		}
		if (facts.some((item) => normalizeForMatch(item.value) === normalizeForMatch(fact.value))) continue
		facts.push({ value: clampText(fact.value, 24), label: clampText(fact.label, 40), quote: clampText(fact.quote, 200) })
		if (facts.length >= 8) break
	}
	return facts
}

/** The primary action (section 7.10 step 3): a real page, else a contact page, the phone, the email, then home. */
function planPrimary(reply: PlanReply, pages: NormalizedPage[], ctx: PlanContext, say: Say): SitePlan['primary'] {
	const all = [
		...pages.map((page) => ({ slug: page.slug, name: page.name, archetype: page.archetype })),
		...(ctx.request.placement === 'replace-site' ? [] : (ctx.existing?.pages ?? []).map((page) => ({ slug: page.slug, name: page.name, archetype: page.archetype ?? guessArchetype(page) }))),
	]
	const target = reply.site.primaryAction.target.trim()
	const label = clampText(reply.site.primaryAction.label, 40)
	const phone = ctx.business.phone
	const email = ctx.business.email
	const page = (slug: string, fallback: string) => ({ label: label || fallback, href: slug === '/' ? '/' : `/${slug}`, chromeHref: slug })
	const lower = target.toLowerCase()
	if (lower === 'tel' && phone) return { label: label || 'Call us', href: phone.href, chromeHref: phone.href }
	if (lower === 'email' && email) return { label: label || 'Email us', href: email.href, chromeHref: email.href }
	const match = matchPageTarget(target, all)
	if (match) {
		if (match.repaired) say('link-repaired', `The main button's target "${clampText(target, 40)}" was pointed at the matching page.`)
		return page(match.slug, 'Get in touch')
	}
	const contact = all.find((item) => item.archetype === 'contact')
	if (contact) return page(contact.slug, 'Contact us')
	if (phone) return { label: label || 'Call us', href: phone.href, chromeHref: phone.href }
	if (email) return { label: label || 'Email us', href: email.href, chromeHref: email.href }
	return page('/', 'Get in touch')
}

/** The planner's photo notes for photos in the pool; a note's shape fills an unknown orientation. */
function planNotes(reply: PlanReply, ctx: PlanContext): { notes: PhotoNote[]; pool: PhotoCandidate[] } {
	const refs = new Set(ctx.pool.map((photo) => photo.ref))
	const notes: PhotoNote[] = []
	for (const note of reply.photos) if (refs.has(note.ref) && !notes.some((item) => item.ref === note.ref)) notes.push(note)
	const byRef = new Map(notes.map((note) => [note.ref, note]))
	const pool = ctx.pool.map((photo) =>
		photo.orientation === 'unknown' && byRef.has(photo.ref) ? { ...photo, orientation: byRef.get(photo.ref)!.shape } : photo,
	)
	return { notes, pool }
}

/** One page's sections from the plan reply, composed (section 7.10 steps 5 and 6). */
function composeFromPlan(page: NormalizedPage, plans: SectionPlan[], ctx: PlanContext, issues: Issue[]): NormalizedPage {
	const say: Say = (code, message, level = 'info') => issues.push({ level, code, message, pageKey: page.key })
	const sections: NormalizedSection[] = []
	for (const plan of plans) {
		if (!plan.layout) {
			say('section-dropped', 'A section the AI chose is not in the section kit, so it was left out.')
			continue
		}
		const section = buildSection(
			{ layout: plan.layout, child: plan.child, tweaks: plan.tweaks, surface: plan.surface, job: plan.job, items: plan.items, images: plan.images },
			page,
			ctx,
		)
		if (section) sections.push(section)
		else say('section-dropped', `The ${plan.layout} layout cannot be used, so it was left out.`)
	}
	const composed = enforceComposition({ ...page, outlined: true, sections }, ctx)
	issues.push(...composed.issues)
	return composed.page
}

// ---------------------------------------------------------------- the owner's photos on the pages (section 6.9)

/**
 * Photo-led sections a page may gain, by kind in preference order, each kind at most once
 * per page and in the variant fewest pages use yet. Each is offered only on the archetypes
 * its layout suits, and only while enough of the owner's photos that fit its frames are
 * left to fill it without repeating one. A grid of photo cards suits any page, so it comes
 * last: the pages no other photo layout suits.
 */
const PHOTO_SECTIONS: Choice[][] = [
	[{ layout: 'feature-rows:alternating' }, { layout: 'feature-rows:stacked' }],
	[{ layout: 'spotlight:split' }, { layout: 'spotlight:stacked' }],
	[{ layout: 'media-mosaic:default' }],
	[{ layout: 'media-gallery:bottom' }, { layout: 'media-gallery:side' }, { layout: 'media-gallery:carousel' }],
	[{ layout: 'masonry:above', child: 'media-card:bare' }],
	[{ layout: 'figure:below' }],
	[{ layout: 'grid:above', child: 'media-card:card' }, { layout: 'grid:centered', child: 'media-card:card' }],
]

/** One photo section of a kind per page: a grid of photo cards is not a grid of feature cards. */
const photoKind = (section: { type: string; child?: string | null }) =>
	section.type === 'grid' ? `grid+${(section.child ?? '').split(':')[0]}` : section.type

/** A frame that crops to 16:9: the photos it takes are the ones a page's first photo section needs. */
const WIDE_PANEL = { role: 'panel', aspect: '16:9' } as const

/** How many more of the owner's photos a page may take, in all and of those a wide frame takes. */
type Room = { all: number; wide: number }

/** The frames of a photo section that need a photo a wide frame takes (all but galleries, fans and pairs). */
const wideSlots = (slots: PlannedImageSlot[]) => slots.filter((slot) => slot.role !== 'gallery' && slot.role !== 'backdrop' && slot.role !== 'pair').length

/** The most photos a photo-led section grows to: feature rows, gallery photos, masonry tiles. */
const PHOTO_ITEMS: Record<string, number> = { 'feature-rows': 4, 'media-gallery': 8, masonry: 12 }

/** Pages in the order they get the owner's photos: the front door, the services, then the rest. */
const PHOTO_PAGES: Archetype[] = ['home', 'service', 'about', 'landing', 'services', 'work', 'area', 'process', 'article', 'custom']

/** Middle sections a full page gives up for a photo-led one, the most expendable first. */
const EXPENDABLE = ['check-list', 'callout', 'marquee', 'chips', 'before-after', 'bento-grid', 'stat-band', 'grid']

function suits(type: string, archetype: Archetype) {
	const pages = metaOf(type)?.pages
	return pages === 'all' || Boolean(pages?.includes(archetype))
}

/** Sections that keep each photo's own shape, so a page they suit can show portraits. */
const SHAPE_KEEPING = ['media-gallery', 'media-mosaic', 'masonry']

/** The fewest photos a gallery shows. */
const GALLERY_MIN = SECTION_META['media-gallery'].items?.count.min ?? 4

/** The copywriter's job for an added photo section, where the default would not fit the page. */
function photoJob(type: string, page: NormalizedPage): string | undefined {
	const base =
		type === 'feature-rows'
			? page.archetype === 'service'
				? 'Show what this service includes, one row each with its photo.'
				: page.archetype === 'about'
					? 'Show how the business works and who does the work, one row each with its photo.'
					: null
			: type === 'spotlight'
				? page.archetype === 'service'
					? 'Feature the heart of this service with its best photo.'
					: page.archetype === 'about'
						? 'Feature the people or the place behind the business with its photo.'
						: null
				: null
	return base ? clampText(`${base}${page.purpose ? ` The page: ${page.purpose}` : ''}`, 160) : undefined
}

/**
 * The owner's photos (their uploads and the content folder's images, never other library
 * images) still unplaced go where the pages can show them (section 6.9): first a photo on
 * every page that shows none, then a second and a third photo-led section per page, then
 * any page takes the photos no page could take within its share (such as portraits only a
 * gallery shows; the fan, mosaics and masonry only then), and the photo sections there
 * grow. Pages take turns by rank: home, the service pages, then the rest, each page
 * outlined now before one the outline call lays out later. A page gains a photo opener
 * (alternate service pages keep a plain one, section 7.6 rule 1), photos on its bento
 * tiles, or a photo-led section its archetype suits, inserted, or in place of an
 * expendable section on a full page. A change stands only when the page keeps every
 * composition rule, the site every variety rule, every photo already placed stays where it
 * is, and more of the owner's photos show, within the page's share, with none repeated and
 * nothing else added. A page laid out later keeps the photos the planner set aside for it,
 * or one wide photo if it was given none and outranks the page taking photos (or that page
 * already shows one).
 */
function showPhotos(
	state: { pages: NormalizedPage[]; images: ImagePlan },
	ctx: PlanContext,
	mutable: Set<string>,
	issues: Issue[],
): { pages: NormalizedPage[]; images: ImagePlan } {
	const later = state.pages.filter((page) => !page.outlined)
	const held = new Set(later.flatMap((page) => page.photoAllocation).filter((ref) => !state.images.uses[ref]))
	const sitemap = new Map(state.pages.map((page, index) => [page.key, index]))
	const rankOf = (page: NormalizedPage) =>
		PHOTO_PAGES.indexOf(page.archetype) * 10_000 + (page.outlined ? 0 : 5_000) + (sitemap.get(page.key) ?? 0)
	// Pages laid out later that the planner gave no photo: each waits for one of the free photos,
	// and one a gallery suits waits for a gallery's worth when no wide photo is left for it.
	const waiting = later
		.filter((page) => PHOTO_PAGES.includes(page.archetype) && !page.photoAllocation.some((ref) => held.has(ref)))
		.map((page) => ({ rank: rankOf(page), gallery: SHAPE_KEEPING.some((type) => suits(type, page.archetype)) }))
		.sort((a, b) => a.rank - b.rank)
	const owned = usablePhotos(ctx).filter((photo) => photo.source !== 'library' && !held.has(photo.ref))
	const order = state.pages
		.filter((page) => mutable.has(page.key) && page.outlined && page.sections.length && PHOTO_PAGES.includes(page.archetype))
		.sort((a, b) => rankOf(a) - rankOf(b))
		.map((page) => page.key)
	if (!owned.length || !order.length) return state

	const notes = notesOf(dataOf(ctx))
	const mine = new Set(owned.map((photo) => photo.ref))
	// Photos a wide frame takes: almost every page's first photo needs one (an opener, a row, a spotlight).
	const wide = new Set(owned.filter((photo) => photoFit(photo, WIDE_PANEL, notes) > 0).map((photo) => photo.ref))
	const homeKey = state.pages.find((page) => page.slug === '/')?.key
	const placeable = state.pages.filter((page) => mutable.has(page.key) && page.outlined).map((page) => page.key)
	const place = (pages: NormalizedPage[], images: ImagePlan, hold: ReadonlySet<string>) =>
		assignImages({ pages: pages.filter((page) => mutable.has(page.key) && page.outlined), images, homeKey, hold })
	const start = place(state.pages, state.images, held)
	// A slot this pass adds takes the owner's photos only: never a library image or a screenshot nothing shows yet.
	const hold = new Set([...held, ...state.images.pool.filter((photo) => !mine.has(photo.ref) && !start.images.uses[photo.ref]).map((photo) => photo.ref)])
	let current = { pages: state.pages, images: start.images }
	let unsatisfied = start.unsatisfied
	// Bento tiles given photos here, with the note that says so.
	const tiled = new Map<string, Issue>()
	// While pages take their fair shares (levels 1 to 3) a gallery starts small; past them (0) it takes what is left.
	let stage = 1

	const pageOf = (key: string) => current.pages.find((page) => page.key === key)!
	const pagesUsing = (layout: string) => current.pages.filter((page) => page.sections.some((section) => section.layout === layout)).length
	const free = () => owned.filter((photo) => !current.images.uses[photo.ref])
	const showing = (images: ImagePlan, key: string) => Object.values(images.byPage[key] ?? {}).filter((list) => list.length).length
	const photoSections = (page: NormalizedPage) => showing(current.images, page.key)
	const missingOn = (list: AssignResult['unsatisfied'], key: string) => list.filter((miss) => miss.pageKey === key).length
	const tally = (images: ImagePlan) => {
		let shown = 0
		let wides = 0
		let repeats = 0
		let others = 0
		for (const [ref, count] of Object.entries(images.uses)) {
			if (count > 1) repeats += count - 1
			if (count > 0 && mine.has(ref)) {
				shown++
				if (wide.has(ref)) wides++
			} else if (!mine.has(ref)) others += count
		}
		return { shown, wides, repeats, others }
	}

	/**
	 * How many more of the owner's photos one page may take while pages are short of `level`
	 * photo sections, in all and of those a wide frame takes. Every page's first photo section
	 * needs a wide photo (an opener, a row, a spotlight, a tile), so of those the page leaves
	 * one for each page laid out later that outranks it (at the first level; after it, every
	 * such page) and one for each page after it still short of the level, but takes at least
	 * one. Other photos (portraits) only fill galleries, which start small while pages take
	 * their shares, so those go by rank, less a gallery's worth for each waiting page no wide
	 * photo is left for. Past the levels (`level` 0) any page takes what no waiting page needs.
	 */
	const roomFor = (key: string, level: number): Room => {
		const rank = rankOf(pageOf(key))
		const ahead = level === 1 ? waiting.filter((other) => other.rank < rank) : waiting
		const behind =
			level === 0
				? 0
				: order.slice(order.indexOf(key) + 1).filter((other) => photoSections(pageOf(other)) < level).length +
					(level === 1 ? waiting.filter((other) => other.rank > rank).length : 0)
		const photos = free()
		const wides = photos.filter((photo) => wide.has(photo.ref)).length
		const avail = wides - ahead.length
		// The waiting pages ranked first get the wide photos; the rest that a gallery suits need one.
		const galleries = ahead.slice(Math.max(0, wides)).filter((other) => other.gallery).length
		return {
			all: Math.max(0, photos.length - Math.min(wides, ahead.length) - galleries * GALLERY_MIN),
			wide: avail <= 0 ? 0 : level === 0 ? avail : Math.max(1, avail - behind),
		}
	}

	/**
	 * The sections with the photos placed on them as their picks, so placing again keeps
	 * every photo where it is: this pass only ever adds photos. A section without a key (just
	 * added) has nothing placed yet.
	 */
	const pinned = (page: NormalizedPage, sections: NormalizedSection[]) => {
		const placed = current.images.byPage[page.key] ?? {}
		return sections.map((section) => {
			const list = section.key ? placed[section.key] : undefined
			if (!list?.length) return section
			const slots = sectionImageSlots(page, section, page.key === homeKey)
			return { ...section, images: slots.map((slot) => list.find((image) => image.path === slot.path)?.ref ?? '') }
		})
	}

	/** One change to one page, kept only when more of the owner's photos show, within the page's room, and nothing breaks. */
	const attempt = (
		page: NormalizedPage,
		sections: NormalizedSection[],
		kept: (list: NormalizedSection[]) => boolean,
		room: Room,
		code: Issue['code'],
		message: string,
	) => {
		const composed = enforceComposition({ ...page, sections: pinned(page, sections) }, ctx)
		if (composed.page.sections.length < sections.length || !kept(composed.page.sections)) return false
		const pages = current.pages.map((item) => (item.key === page.key ? composed.page : item))
		if (siteProblems(pages) > siteProblems(current.pages)) return false
		const placed = place(
			pages.map((item) => (item.key === page.key ? item : { ...item, sections: pinned(item, item.sections) })),
			current.images,
			hold,
		)
		// No page loses a photo section, and none gains a section left without its photo.
		for (const key of placeable) {
			if (showing(placed.images, key) < showing(current.images, key)) return false
			if (missingOn(placed.unsatisfied, key) > missingOn(unsatisfied, key)) return false
		}
		const [before, after] = [tally(current.images), tally(placed.images)]
		if (after.shown <= before.shown || after.shown - before.shown > room.all || after.wides - before.wides > room.wide) return false
		if (after.repeats > before.repeats || after.others > before.others) return false
		issues.push(...composed.issues, { level: 'info', code, message, pageKey: page.key })
		current = { pages, images: placed.images }
		unsatisfied = placed.unsatisfied
		return true
	}
	const swap = (page: NormalizedPage, at: number, next: NormalizedSection) =>
		page.sections.map((section, index) => (index === at ? { ...next, key: section.key } : section))

	/** 1 for the first service page, 2 for the second…, counted as section 7.6 rule 1 counts them. */
	const serviceTurn = (page: NormalizedPage) => {
		let turn = 0
		for (const item of current.pages) {
			if (!item.outlined || item.archetype !== 'service' || !item.sections.some(isOpener)) continue
			turn++
			if (item.key === page.key) break
		}
		return turn
	}

	const photoOpener = (page: NormalizedPage, room: Room) => {
		const at = page.sections.findIndex(isOpener)
		const opener = page.sections[at]
		if (!opener || opener.type !== 'page-hero' || !suits('split-hero', page.archetype)) return false
		const service = page.archetype === 'service'
		if (service && serviceTurn(page) % 2 === 0) return false
		const taken = new Set(
			current.pages
				.filter((item) => item.key !== page.key && item.outlined && item.archetype !== 'service')
				.map((item) => item.sections.find(isOpener)?.layout),
		)
		const layouts: Layout[] = service
			? ['split-hero:reversed']
			: page.archetype === 'services'
				? ['split-hero:reversed', 'split-hero:split']
				: ['split-hero:split', 'split-hero:reversed']
		for (const layout of layouts) {
			if (!service && taken.has(layout)) continue
			const next = retarget({ ...opener, images: [] }, layout, page, ctx)
			if (!next) continue
			const message = `${opener.label} became ${next.label}, so the page opens on one of the owner's photos.`
			if (attempt(page, swap(page, at, next), (list) => list.some((item) => item.layout === layout), room, 'variant-rotated', message))
				return true
		}
		return false
	}

	const photoTiles = (page: NormalizedPage, room: Room) => {
		if (page.sections.some((section) => section.tweaks.includes('tile-images'))) return false
		const at = page.sections.findIndex((section) => section.type === 'bento-grid' && section.variant !== 'numbered')
		const bento = page.sections[at]
		const next = bento ? retarget(bento, bento.layout, page, ctx, ['tile-images']) : null
		if (!bento || !next?.tweaks.includes('tile-images')) return false
		const kept = (list: NormalizedSection[]) => list.some((item) => item.type === 'bento-grid' && item.tweaks.includes('tile-images'))
		if (!attempt(page, swap(page, at, next), kept, room, 'variant-rotated', `${bento.label} shows the owner's photos on its wide tiles.`)) return false
		tiled.set(page.key, issues[issues.length - 1])
		return true
	}

	const photoFan = (page: NormalizedPage, room: Room) => {
		const at = page.key === homeKey ? page.sections.findIndex((section) => section.type === 'split-hero' && !section.tweaks.includes('fan')) : -1
		const hero = page.sections[at]
		const next = hero ? retarget(hero, hero.layout, page, ctx, ['fan']) : null
		if (!hero || !next?.tweaks.includes('fan')) return false
		const kept = (list: NormalizedSection[]) => list.some((item) => item.type === 'split-hero' && item.tweaks.includes('fan'))
		return attempt(page, swap(page, at, next), kept, room, 'variant-rotated', `${hero.label} fans five more of the owner's photos behind the main one.`)
	}

	/** The middle section a full page gives up: the most expendable one that shows no photo. */
	const expendableAt = (page: NormalizedPage) => {
		const placed = current.images.byPage[page.key] ?? {}
		for (const type of EXPENDABLE) {
			for (let index = page.sections.length - 1; index >= 0; index--) {
				const section = page.sections[index]
				if (section.type !== type || isOpener(section) || isCloser(section) || isTestimonials(section)) continue
				if (section.type === 'grid' && !section.child?.startsWith('feature-card')) continue
				if (!placed[section.key]?.length) return index
			}
		}
		return -1
	}

	/** Rows and spotlights after the first explanation (or the opener), galleries before the proof and the ask. */
	const placeAt = (list: NormalizedSection[], section: NormalizedSection) => {
		const first = Math.max(list.findIndex(isOpener), list.findIndex(isTopBar)) + 1
		if (section.type === 'feature-rows' || section.type === 'spotlight') {
			const explain = list.findIndex((item, index) => index >= first && isExplain(item))
			return explain === -1 ? first : explain + 1
		}
		const end = list.findIndex((item, index) => index >= first && (isTestimonials(item) || isFaq(item) || isCloser(item)))
		return end === -1 ? list.length : end
	}

	const photoSection = (page: NormalizedPage, room: Room) => {
		const rules = ARCHETYPE_RULES[page.archetype] ?? ARCHETYPE_RULES.custom
		const kinds = new Set(page.sections.map(photoKind))
		const unused = free()
		let groups = PHOTO_SECTIONS.filter((group) => {
			const { type } = splitLayout(group[0].layout)
			// A mosaic or masonry wall takes more photos than a gallery, so it waits until every page has had its share.
			if (stage > 0 && (type === 'media-mosaic' || type === 'masonry')) return false
			return suits(type, page.archetype) && !kinds.has(photoKind({ type, child: group[0].child }))
		})
		// Service pages each lead with a different photo section, so they do not share one skeleton.
		if (page.archetype === 'service' && groups.length) {
			const turn = (serviceTurn(page) - 1 + groups.length) % groups.length
			groups = [...groups.slice(turn), ...groups.slice(0, turn)]
		}
		// Each kind in the variants fewest pages use first.
		const choices = groups.flatMap((group) =>
			group
				.map((choice, index) => ({ choice, index }))
				.sort((a, b) => pagesUsing(a.choice.layout) - pagesUsing(b.choice.layout) || a.index - b.index)
				.map(({ choice }) => choice),
		)
		const ranked: { section: NormalizedSection; tier: number }[] = []
		for (const choice of choices) {
			const { type } = splitLayout(choice.layout)
			const wanted =
				type === 'feature-rows' || type === 'grid' ? 3 : type === 'media-gallery' ? (stage === 0 ? 8 : GALLERY_MIN) : type === 'masonry' ? 9 : 0
			let section: NormalizedSection | null = null
			let slots: PlannedImageSlot[] = []
			const fits = (list: PlannedImageSlot[]) => list.length <= room.all && wideSlots(list) <= room.wide
			for (let items = Math.min(wanted, room.all); items >= 0; items--) {
				section = buildSection({ ...choice, items, job: photoJob(type, page) }, page, ctx)
				slots = section ? sectionImageSlots(page, section, false).filter((slot) => slot.required) : []
				if (!section || fits(slots) || items === 0) break
			}
			if (!section || !slots.length || !fits(slots)) continue
			// Enough unplaced photos for every kind of frame, well fitting (tier 0) or at all (tier 1).
			const frames = new Map<string, { slot: PlannedImageSlot; count: number }>()
			for (const slot of slots) frames.set(`${slot.role} ${slot.aspect}`, { slot, count: (frames.get(`${slot.role} ${slot.aspect}`)?.count ?? 0) + 1 })
			const enough = (least: number) =>
				[...frames.values()].every(({ slot, count }) => unused.filter((photo) => photoFit(photo, slot, notes) >= least).length >= count)
			if (enough(0.6)) ranked.push({ section, tier: 0 })
			else if (enough(0.01)) ranked.push({ section, tier: 1 })
		}
		for (const { section } of ranked.sort((a, b) => a.tier - b.tier)) {
			const kept = (list: NormalizedSection[]) => list.some((item) => item.layout === section.layout && photoKind(item) === photoKind(section))
			if (page.sections.length < rules.max) {
				const at = placeAt(page.sections, section)
				const sections = [...page.sections.slice(0, at), section, ...page.sections.slice(at)]
				if (attempt(page, sections, kept, room, 'section-added', `${section.label} was added, so the owner's photos appear on the page.`)) return true
				continue
			}
			const at = expendableAt(page)
			if (at === -1) return false
			const message = `${page.sections[at].label} made way for ${section.label}, so the owner's photos appear on the page.`
			if (attempt(page, swap(page, at, section), kept, room, 'section-replaced', message)) return true
		}
		return false
	}

	const photoMore = (page: NormalizedPage, room: Room) => {
		for (const [at, section] of page.sections.entries()) {
			// A mosaic holds five photos; a gallery in its place holds the ones left too.
			if (section.type === 'media-mosaic') {
				if (page.sections.some((item) => item.type === 'media-gallery')) continue
				const layout = (['media-gallery:bottom', 'media-gallery:side', 'media-gallery:top'] as const)
					.map((item, index) => ({ item, index }))
					.sort((a, b) => pagesUsing(a.item) - pagesUsing(b.item) || a.index - b.index)[0].item
				const next = buildSection({ layout, surface: section.surface, job: section.job, items: Math.min(8, 5 + room.all) }, page, ctx)
				if (!next || next.items <= 5) continue
				const message = `${section.label} became ${next.label}, so ${next.items} of the owner's photos appear there instead of 5.`
				if (attempt(page, swap(page, at, next), (list) => list.some((item) => item.layout === next.layout), room, 'variant-rotated', message))
					return true
				continue
			}
			const most = PHOTO_ITEMS[section.type]
			if (!most || section.items >= most || (section.type === 'masonry' && !section.child?.startsWith('media-card'))) continue
			const next = buildSection(
				{ layout: section.layout, child: section.child, tweaks: section.tweaks, surface: section.surface, job: section.job, items: Math.min(most, section.items + room.all), images: section.images, reviews: section.reviews },
				page,
				ctx,
			)
			if (!next || next.items <= section.items) continue
			const kept = (list: NormalizedSection[]) => list.some((item) => item.layout === section.layout && item.items === next.items)
			const message = `${section.label} grew from ${section.items} to ${next.items}, so more of the owner's photos appear.`
			if (attempt(page, swap(page, at, next), kept, room, 'count-adjusted', message)) return true
		}
		return false
	}

	// Fair shares first: a photo on every page, then a second and a third (the fan only as a
	// third). Then (`level` 0) the photos no page could take within its share, such as
	// portraits only a gallery shows, to any page, the pages that show the fewest photo
	// sections first; mosaics and masonry, which take five or more at once, only then.
	const fewestFirst = () => [...order].sort((a, b) => photoSections(pageOf(a)) - photoSections(pageOf(b)))
	for (const level of [1, 2, 3, 0]) {
		stage = level
		const steps: ((page: NormalizedPage, room: Room) => boolean)[] =
			level === 1
				? [photoOpener, photoTiles, photoSection]
				: level === 2
					? [photoOpener, photoSection, photoTiles]
					: [photoOpener, photoSection, photoFan, photoTiles]
		for (let sweep = 0; sweep < 3; sweep++) {
			let changed = false
			for (const key of level === 0 ? fewestFirst() : order) {
				const page = pageOf(key)
				if (level > 0 && photoSections(page) >= level) continue
				const room = roomFor(key, level)
				if (room.all > 0 && steps.some((step) => step(page, room))) changed = true
			}
			if (!changed) break
		}
	}
	for (const key of fewestFirst()) {
		let grew = true
		while (grew && roomFor(key, 0).all > 0) grew = photoMore(pageOf(key), roomFor(key, 0))
	}

	// Tiles whose photos a later change placed elsewhere go back to plain tiles, and the note goes.
	for (const [key, note] of tiled) {
		const page = pageOf(key)
		const at = page.sections.findIndex((section) => section.type === 'bento-grid' && section.tweaks.includes('tile-images'))
		if (at !== -1 && current.images.byPage[key]?.[page.sections[at].key]?.length) continue
		if (at !== -1) {
			const sections = page.sections.map((section, index) =>
				index === at ? { ...section, tweaks: section.tweaks.filter((tweak) => tweak !== 'tile-images') } : section,
			)
			current = { ...current, pages: current.pages.map((item) => (item.key === key ? { ...item, sections } : item)) }
		}
		const index = issues.indexOf(note)
		if (index !== -1) issues.splice(index, 1)
	}
	return current
}

/**
 * Composes, varies, allocates reviews and places photos on the pages in `mutable`, with the
 * other pages' layouts, reviews and photos as the ledger; sections whose photos cannot be
 * found fall back and their page is composed again (section 7.10 steps 5 to 8). The
 * owner's photos still unplaced then go where the pages can show them (`showPhotos`).
 */
function settle(
	pages: NormalizedPage[],
	images: ImagePlan,
	ctx: PlanContext,
	mutable: Set<string>,
	issues: Issue[],
): { pages: NormalizedPage[]; images: ImagePlan } {
	const sayFor = (page: NormalizedPage): Say => (code, message, level = 'info') => issues.push({ level, code, message, pageKey: page.key })
	const varied = varietyPass(pages, ctx, mutable)
	issues.push(...varied.issues)
	let current = allocateReviews(varied.pages, ctx, mutable, sayFor)
	let plan = images
	const place = () =>
		assignImages({
			pages: current.filter((page) => mutable.has(page.key) && page.outlined),
			images: plan,
			homeKey: current.find((page) => page.slug === '/')?.key,
		})
	let dirty = true
	for (let round = 0; round < 6 && dirty; round++) {
		const result = place()
		plan = result.images
		dirty = false
		if (!result.unsatisfied.length) break
		dirty = true
		const misses = new Map<string, Set<string>>()
		for (const miss of result.unsatisfied) misses.set(miss.pageKey, new Set([...(misses.get(miss.pageKey) ?? []), miss.sectionKey]))
		current = current.map((page) => {
			const keys = misses.get(page.key)
			if (!keys) return page
			const say = sayFor(page)
			const sections = page.sections.flatMap((section) => {
				if (!keys.has(section.key)) return [section]
				const fallback = round < 3 ? fallbackOf(section, page) : null
				const next = fallback ? retarget({ ...section, images: [] }, fallback.layout, page, ctx, fallback.tweaks) : null
				if (next && next.type !== section.type) {
					say('section-replaced', `${section.label} had no photo that fits, so ${next.label} is used instead.`)
					return [next]
				}
				say('section-dropped', `${section.label} was left out: no photo fits it.`)
				return []
			})
			const composed = enforceComposition({ ...page, sections }, ctx)
			issues.push(...composed.issues)
			return composed.page
		})
	}
	// The last round changed pages: place their photos once more (anything still missing is dropped when written).
	if (dirty) plan = place().images
	;({ pages: current, images: plan } = showPhotos({ pages: current, images: plan }, ctx, mutable, issues))
	// A photo these pages share with another page, because the pool ran out.
	const placedHere = new Set(
		[...mutable].flatMap((key) => Object.values(plan.byPage[key] ?? {}).flatMap((list) => list.map((image) => image.ref))),
	)
	if ([...placedHere].some((ref) => (plan.uses[ref] ?? 0) > 1))
		issues.push({ level: 'info', code: 'photo-reused', message: 'Some photos appear on more than one page, because there were not enough photos for every slot.' })
	return { pages: current, images: plan }
}

const dedupe = (issues: Issue[]) => {
	const seen = new Set<string>()
	return issues.filter((issue) => {
		const key = `${issue.code}|${issue.pageKey ?? ''}|${issue.message}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

/**
 * The plan reply normalized against the pins, the placement and the owner's data (section
 * 7.10): the site, provenance-checked facts, the primary action, the pages, every outlined
 * page composed and varied, reviews allocated and photos placed across the site.
 */
export function normalizePlan(reply: PlanReply, ctx: PlanContext): { plan: NormalizedPlan; images: ImagePlan; issues: Issue[] } {
	const issues: Issue[] = []
	const say: Say = (code, message, level = 'info') => issues.push({ level, code, message })

	const site = planSite(reply, ctx, say)
	const facts = planFacts(reply, ctx, say)
	const planned = planPages(reply, ctx, say)
	const pages = planned.map((entry) => entry.page)
	const primary = planPrimary(reply, pages, ctx, say)
	const { notes, pool } = planNotes(reply, ctx)
	if (!ctx.request.reviews.length) say('no-testimonials', 'No reviews were given, so the site has no testimonials.')
	if (!facts.length) say('no-stats', 'No figures were given, so the site shows no statistics.')

	const plan: NormalizedPlan = { site: { ...site, primary }, facts, pages, issues: [] }
	const images: ImagePlan = { pool, notes, uses: {}, byPage: {} }
	const footerTone = reply.design.footerTone ?? 'match'
	const composing: PlanContext = { ...ctx, pool, plan: planDataOf(plan, images, ctx.request.placement === 'replace-site' ? null : ctx.existing, footerTone) }

	const outlined: NormalizedPage[] = []
	for (const { page, draft } of planned) {
		if (!page.outlined) {
			outlined.push(page)
			continue
		}
		const composed = composeFromPlan(page, draft.sections, composing, issues)
		if (composed.sections.length >= 2) {
			outlined.push(composed)
			continue
		}
		issues.push({ level: 'info', code: 'outline-fallback', message: `${page.name} was laid out from a proven pattern instead.`, pageKey: page.key })
		outlined.push(outlineFromRecipe(page, composing, ledgerOf(outlined)))
	}

	const mutable = new Set(outlined.filter((page) => page.outlined).map((page) => page.key))
	const settled = settle(outlined, images, composing, mutable, issues)
	const all = dedupe(issues)
	return { plan: { ...plan, pages: settled.pages, issues: all }, images: settled.images, issues: all }
}

/**
 * The pages the outline call returned, normalized like the plan's (section 7.10, last
 * paragraph): unknown keys are ignored, a page left empty or with fewer than two usable
 * sections is laid out from its recipe, and pages already outlined (perhaps being written)
 * never change: they are the ledger the new pages vary against. The photos those pages
 * show are theirs, so the new pages compose from the rest and none repeats.
 */
export function normalizeOutlined(
	reply: OutlineReply,
	plan: NormalizedPlan,
	images: ImagePlan,
	ctx: PlanContext,
): { plan: NormalizedPlan; images: ImagePlan; issues: Issue[] } {
	const issues: Issue[] = []
	const composing: PlanContext = {
		...ctx,
		pool: images.pool.filter((photo) => !images.uses[photo.ref]),
		plan: ctx.plan ?? planDataOf(plan, images, ctx.request.placement === 'replace-site' ? null : ctx.existing),
	}
	const frozen = plan.pages.filter((page) => page.outlined)
	const byKey = new Map(reply.pages.map((page) => [page.key, page]))
	let ledger = ledgerOf(frozen)
	// A page laid out from its recipe here plans no photo sections for the owner's photos: the
	// ones the planned pages left over are spread over the new pages afterwards, each once
	// (`showPhotos`). Other library images it may still plan for, as before.
	const recipeCtx: PlanContext = { ...composing, pool: composing.pool.filter((photo) => photo.source === 'library') }

	const pages = plan.pages.map((page) => {
		if (page.outlined) return page
		const entry = byKey.get(page.key)
		let next = entry?.sections.length ? composeFromPlan({ ...page, sections: [] }, entry.sections, composing, issues) : null
		if (!next || next.sections.length < 2) {
			issues.push({ level: 'info', code: 'outline-fallback', message: `${page.name} was laid out from a proven pattern instead.`, pageKey: page.key })
			next = outlineFromRecipe(page, recipeCtx, ledger)
		}
		ledger = [...ledger, ...ledgerOf([next])]
		return { ...next, outlined: true }
	})

	const mutable = new Set(plan.pages.filter((page) => !page.outlined).map((page) => page.key))
	const settled = settle(pages, images, composing, mutable, issues)
	const all = dedupe(issues)
	return { plan: { ...plan, pages: settled.pages, issues: dedupe([...plan.issues, ...all]) }, images: settled.images, issues: all }
}
