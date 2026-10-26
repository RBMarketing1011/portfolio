/**
 * The outline call (sections 4.4, 7.11 and 11.4). The plan outlines at most six pages;
 * one outline request lays out every other page, with the same system blocks as the
 * planner and the ledger of layouts the outlined pages already use. When the outline
 * call fails twice, or a page comes back unusable, `outlineFromRecipe` lays the page out
 * in code from its archetype's recipe, so no page ever fails because of an outline.
 *
 * Pure: the routes and the proofs share it.
 */
import type Anthropic from '@anthropic-ai/sdk'
import type { ImagePlan, NormalizedPlan } from './types'
import { LOOSE_SECTION_ITEM, SECTION_ITEM, readSection, type SectionPlan } from './planner'
import { arr, obj, str } from './schema-kit'
import type { Availability } from './types'

// The recipe walker lives with the composition rules it shares; this module is its public home.
export { ledgerOf, outlineFromRecipe } from './plan-normalize'

export const OUTLINE_SCHEMA = obj({ pages: arr(obj({ key: str, sections: arr(SECTION_ITEM) })) })

/** With `BUILDER_AI_LOOSE_LAYOUTS=1`: layouts and child layouts as plain strings (section 11.9). */
export const LOOSE_OUTLINE_SCHEMA = obj({ pages: arr(obj({ key: str, sections: arr(LOOSE_SECTION_ITEM) })) })

export type OutlineReply = { pages: { key: string; sections: SectionPlan[] }[] }

const isPlain = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

/** The outline reply, read leniently; null only when the top level is not an object. */
export function readOutlineReply(value: unknown): OutlineReply | null {
	if (!isPlain(value)) return null
	const pages: OutlineReply['pages'] = []
	const seen = new Set<string>()
	for (const entry of Array.isArray(value.pages) ? value.pages.slice(0, 12) : []) {
		if (!isPlain(entry) || typeof entry.key !== 'string') continue
		const key = entry.key.trim().toLowerCase()
		if (!/^p([1-9]|1[0-2])$/.test(key) || seen.has(key)) continue
		seen.add(key)
		const sections = (Array.isArray(entry.sections) ? entry.sections.slice(0, 10) : [])
			.map(readSection)
			.filter((section): section is SectionPlan => section !== null)
		pages.push({ key, sections })
	}
	return { pages }
}

const INSTRUCTION =
	'Outline the sections of the pages listed under "pages", for a site that is already planned. Use the same section kit and rules, give each page its own opener and closer (different from the pages already outlined, listed under "usedOnOtherPages"), and reply with one entry per page key.'

/**
 * The outline call's user message (section 11.4): the pages still to outline with their
 * hints and photos, what the outlined pages already use, and what the owner's data supports.
 */
export function outlineUserContent(input: {
	plan: NormalizedPlan
	images: ImagePlan
	availability: Availability
}): Anthropic.Beta.BetaContentBlockParam[] {
	const { plan, images } = input
	const notes = new Map(images.notes.map((note) => [note.ref, note]))
	const byRef = new Map(images.pool.map((photo) => [photo.ref, photo]))
	const shows = (ref: string) => notes.get(ref)?.description || byRef.get(ref)?.caption || ''
	const message = {
		site: {
			name: plan.site.name,
			personality: plan.site.personality,
			offer: plan.site.offer,
			primaryAction: `${plan.site.primary.label} → ${plan.site.primary.chromeHref}`,
		},
		pages: plan.pages
			.filter((page) => !page.outlined)
			.map((page) => ({
				key: page.key,
				name: page.name,
				slug: page.slug,
				archetype: page.archetype,
				purpose: page.purpose,
				keyword: page.keyword,
				openerHint: page.openerHint,
				closerHint: page.closerHint,
				photos: page.photoAllocation.filter((ref) => byRef.has(ref)).map((ref) => ({ ref, shows: shows(ref) })),
			})),
		usedOnOtherPages: plan.pages
			.filter((page) => page.outlined)
			.map((page) => `${page.name}: ${page.sections.map((section) => section.layout).join(' ')}`),
		availability: input.availability,
	}
	return [{ type: 'text', text: `${INSTRUCTION}\n${JSON.stringify(message)}` }]
}
