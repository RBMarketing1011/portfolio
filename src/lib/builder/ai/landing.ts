/**
 * The server side of landing (sections 4.7 and 12.6). `landingPayload` assembles what the
 * client applies as one undo step: the written pages in plan order, the chrome and look
 * when the build replaces them, the block surfaces of landed blocks, menu entries to slot
 * in, the pages left out and why, and every placeholder the owner still has to fill.
 * `profileFill` is the business-details patch landing may apply, computed at plan time
 * from grounded values and only for fields that are still empty.
 *
 * Pure: the land route and the proofs share it.
 */
import type { BackgroundSettings } from '@/app/builder/background-settings'
import { iconFor } from '../catalog/lexicon'
import type { SiteProfile } from '../site-profile'
import { pruneChrome } from './chrome'
import type { LandingPayload, NeedsInput, ProfileField } from './contract'
import { clampText } from './planner'
import type { AiBuildDoc, GroundedBusiness, NormalizedPlan } from './types'

const SKIP_REASONS: Record<string, string> = {
	cancelled: 'Building stopped before this page was written.',
	pending: 'This page was not written.',
	writing: 'This page was still being written.',
	failed: 'This page could not be written.',
}

/** What `POST …/land` returns to apply (section 12.4): rebuilt the same way every time, so landing is idempotent. */
export function landingPayload(doc: AiBuildDoc): LandingPayload {
	const order = new Map((doc.plan?.pages ?? []).map((page, index) => [page.key, index]))
	const rank = (key: string) => order.get(key) ?? Number.MAX_SAFE_INTEGER
	const sorted = [...doc.pages].sort((a, b) => rank(a.key) - rank(b.key))
	const written = sorted.filter((page) => page.status === 'written' && page.written)
	const pages = written.map((page) => page.written!.page)

	// Links may point at landed pages and, outside a whole-site rebuild, at the pages the site keeps.
	const kept = doc.placement === 'replace-site' ? [] : doc.snapshot.pages.map((page) => page.slug)
	const keepSlugs = [...new Set([...pages.map((page) => page.slug), ...kept])]
	const chrome =
		doc.placement === 'replace-page' || !doc.chrome ? null : pruneChrome(doc.chrome, keepSlugs)

	const plannedByKey = new Map((doc.plan?.pages ?? []).map((page) => [page.key, page]))
	const menuAdd: LandingPayload['menuAdd'] =
		doc.placement === 'append' && !doc.chrome
			? written.map((entry) => {
					const planned = plannedByKey.get(entry.key)
					const page = entry.written!.page
					return {
						pageId: page.id,
						slug: page.slug,
						label: clampText(page.name, 28),
						archetype: planned?.archetype ?? 'custom',
						icon: iconFor(`${page.name} ${planned?.keyword ?? ''}`),
					}
				})
			: []

	const look =
		doc.placement !== 'replace-page' && doc.design?.look
			? { theme: doc.design.look.theme, page: doc.design.look.page, header: doc.design.look.header, footer: doc.design.look.footer }
			: null

	const blockLooks: Record<string, BackgroundSettings> = {}
	const needsInput: NeedsInput[] = []
	for (const entry of written) {
		Object.assign(blockLooks, entry.written!.blockLooks)
		needsInput.push(...entry.written!.needsInput)
	}

	const skipped = sorted
		.filter((page) => page.status !== 'written' || !page.written)
		.map((page) => ({
			key: page.key,
			name: page.name,
			reason: page.lastError?.message || SKIP_REASONS[page.status] || SKIP_REASONS.pending,
		}))

	const notes = [...new Set((doc.issues ?? []).filter((issue) => issue.level === 'warn').map((issue) => issue.message))]
	if (skipped.length) notes.push(`${skipped.length} ${skipped.length === 1 ? 'page was' : 'pages were'} left out.`)

	return {
		buildId: doc._id,
		placement: doc.placement,
		targetPageId: doc.targetPageId,
		pages,
		chrome,
		menuAdd,
		look,
		blockLooks,
		skipped,
		needsInput,
		notes,
	}
}

const PROFILE_MAX: Partial<Record<ProfileField, number>> = {
	'business.name': 120, 'business.description': 300, 'business.phone': 40, 'business.email': 254,
	'business.city': 80, 'business.region': 80, 'seo.description': 300,
}

/**
 * The business details landing would fill (section 12.6), from grounded values only and
 * only where the stored field is empty: the name, a type more specific than the default,
 * the tagline, the phone, email, city, region and areas the owner gave, and the meta
 * description. `business.enabled` (structured data) is never touched.
 */
export function profileFill(input: { plan: NormalizedPlan; business: GroundedBusiness; profile: SiteProfile }): AiBuildDoc['profilePatch'] {
	const { plan, business, profile } = input
	const stored = profile.business
	const patch: AiBuildDoc['profilePatch'] = []
	const empty = (value: unknown) => typeof value !== 'string' || !value.trim()
	const add = (field: ProfileField, value: string) => {
		const text = clampText(value, PROFILE_MAX[field] ?? 300)
		if (text) patch.push({ field, value: text })
	}

	if (empty(stored.name)) add('business.name', business.name || plan.site.name)
	if (stored.type === 'LocalBusiness' && plan.site.businessType !== 'LocalBusiness') patch.push({ field: 'business.type', value: plan.site.businessType })
	if (empty(stored.description)) add('business.description', plan.site.tagline)
	if (empty(stored.phone) && business.phone) add('business.phone', business.phone.display)
	if (empty(stored.email) && business.email) add('business.email', business.email.display)
	if (empty(stored.city)) add('business.city', business.city)
	if (empty(stored.region)) add('business.region', business.region)
	if (!(stored.serviceArea ?? []).length && business.areas.length)
		patch.push({ field: 'business.serviceArea', value: business.areas.map((area) => clampText(area, 80)).filter(Boolean).slice(0, 30) })
	if (empty(profile.seo.description)) add('seo.description', plan.site.description)
	return patch
}
