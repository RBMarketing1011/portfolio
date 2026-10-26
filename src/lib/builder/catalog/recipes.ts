/**
 * Page archetypes and their recipes (section 7.2), distilled from the 67 page templates'
 * measured rhythm: the opener first in every one, the FAQ second to last in most,
 * `faq → cta-band` the most common pair, and a single conversion close.
 *
 * A recipe is a list of steps; each step lists its alternatives in preference order, and
 * the first one whose needs are met is the default. Optional steps are skipped when
 * nothing fits. The planner sees them as patterns to adapt (`catalogText`), and
 * `outlineFromRecipe` walks them when an outline comes back unusable.
 *
 * Pure: never read from Mongo, so a missing template seed cannot fail a build.
 */
import type { Archetype, ChildLayout, Layout, Role, SurfaceTone, Tweak } from './types'

export type RecipeStep = {
	role: Role
	optional: boolean
	alternatives: { layout: Layout; child?: ChildLayout; tweaks?: Tweak[]; surface?: SurfaceTone }[]
}

type Alternative = RecipeStep['alternatives'][number]

const step = (role: Role, ...alternatives: (Layout | Alternative)[]): RecipeStep => ({
	role,
	optional: false,
	alternatives: alternatives.map((item) => (typeof item === 'string' ? { layout: item } : item)),
})
const optional = (role: Role, ...alternatives: (Layout | Alternative)[]): RecipeStep => ({
	...step(role, ...alternatives),
	optional: true,
})

// Testimonials appear only when the owner gave reviews; the layouts follow section 7.9.
const testimonials = (...layouts: Layout[]): RecipeStep =>
	optional('proof', ...layouts.map((layout) => ({ layout, child: 'testimonial-card:card' as const })))

export const RECIPES: Record<Archetype, RecipeStep[]> = {
	home: [
		optional('top-bar', 'announcement-bar:strip'),
		step('opener', 'split-hero:split', 'page-hero:centered', 'stat-hero:divided'),
		optional('proof', 'stat-band:divided', { layout: 'marquee:inline', child: 'client-logo:wordmark' }, 'chips:inline', 'detail-card:inline'),
		step('explain', { layout: 'grid:beside', child: 'feature-card:inline' }, 'bento-grid:accent', 'tabs-showcase:pills', 'feature-rows:alternating'),
		step('explain', { layout: 'process-steps:columns', surface: 'soft' }, 'process-steps:timeline'),
		step('showcase', 'before-after:columns', 'spotlight:overlap', 'media-mosaic:default'),
		testimonials('carousel:bars', 'masonry:centered'),
		step('convert', 'faq-accordion:split'),
		step('closer', 'cta-band:split', 'cta-band:centered', 'split-cta:cards'),
	],
	services: [
		step('opener', 'page-hero:centered', 'split-hero:reversed'),
		step('explain', { layout: 'grid:centered', child: 'related-card:list' }, 'tabs-showcase:side'),
		step('showcase', 'bento-grid:accent', 'feature-rows:stacked'),
		step('explain', 'process-steps:columns'),
		testimonials('grid:above'),
		step('convert', 'faq-accordion:boxed'),
		step('closer', { layout: 'cta-band:centered', surface: 'inverse' }),
	],
	service: [
		step('opener', 'split-hero:reversed', 'page-hero:left'),
		step('showcase', 'feature-rows:alternating', 'bento-grid:numbered'),
		optional('explain', 'check-list:columns'),
		step('explain', 'process-steps:timeline', 'process-steps:cards'),
		step('proof', 'before-after:rows'),
		testimonials('carousel:bars', 'grid:centered'),
		step('convert', 'faq-accordion:stacked', 'faq-accordion:boxed'),
		step('closer', 'cta-band:split', 'split-cta:cards'),
	],
	area: [
		step('opener', 'page-hero:left'),
		step('proof', 'chips:solid'),
		step('explain', { layout: 'grid:centered', child: 'feature-card:card' }),
		optional('proof', 'stat-band:divided'),
		testimonials('masonry:centered'),
		step('convert', 'faq-accordion:split'),
		step('closer', 'cta-band:split'),
	],
	about: [
		step('opener', 'split-hero:split', 'page-hero:left'),
		step('content', 'prose-block:plain', 'bento-grid:numbered'),
		optional('proof', 'stat-band:row'),
		step('explain', 'process-steps:timeline', 'before-after:columns'),
		optional('showcase', 'media-mosaic:default', { layout: 'grid:centered', child: 'testimonial-card:card' }),
		step('closer', { layout: 'split-cta:cards', surface: 'soft' }, 'cta-band:centered'),
	],
	contact: [
		step('opener', 'page-hero:compact'),
		step('convert', 'detail-card:card'),
		optional('explain', 'process-steps:columns', 'check-list:inline'),
		optional('convert', 'faq-accordion:stacked'),
	],
	work: [
		step('opener', 'page-hero:centered'),
		step('showcase', 'media-mosaic:default', 'image-compare:stacked'),
		step('showcase', 'media-gallery:bottom', { layout: 'masonry:above', child: 'media-card:bare' }),
		step('closer', { layout: 'cta-band:centered', surface: 'inverse' }),
	],
	reviews: [
		step('opener', 'page-hero:centered'),
		step('proof', { layout: 'masonry:centered', child: 'testimonial-card:card' }),
		optional('proof', 'stat-band:divided'),
		step('closer', 'cta-band:split'),
	],
	pricing: [
		step('opener', 'page-hero:compact'),
		step('explain', 'process-steps:columns'),
		optional('explain', 'check-list:inline'),
		optional('convert', 'detail-card:rows'),
		step('convert', 'faq-accordion:split'),
		step('closer', 'cta-band:centered'),
	],
	faq: [
		step('opener', 'page-hero:compact'),
		step('convert', 'faq-accordion:split'),
		optional('convert', 'faq-accordion:split'),
		step('closer', 'split-cta:cards'),
	],
	landing: [
		optional('top-bar', 'announcement-bar:strip'),
		step('opener', { layout: 'split-hero:split', tweaks: ['one-button'] }, { layout: 'page-hero:centered', tweaks: ['one-button'] }),
		step('explain', 'check-list:inline'),
		step('explain', 'bento-grid:accent', { layout: 'grid:centered', child: 'feature-card:card' }),
		step('explain', 'process-steps:cards'),
		testimonials('grid:above'),
		step('convert', 'faq-accordion:boxed'),
		step('closer', { layout: 'cta-band:centered', tweaks: ['one-button'], surface: 'brand' }),
	],
	process: [
		step('opener', 'page-hero:left'),
		step('explain', 'process-steps:timeline'),
		step('showcase', 'feature-rows:stacked', 'bento-grid:numbered'),
		step('convert', 'faq-accordion:boxed'),
		step('closer', 'cta-band:card'),
	],
	article: [
		step('opener', 'page-hero:compact'),
		step('content', 'table-of-contents:card'),
		step('content', 'prose-block:marked'),
		optional('content', 'callout:card'),
		optional('convert', 'faq-accordion:stacked'),
		step('closer', 'cta-band:split'),
	],
	// The planner's choice; the fallback outline uses layouts that suit any page.
	custom: [
		step('opener', 'page-hero:left'),
		step('explain', { layout: 'grid:centered', child: 'feature-card:card' }),
		optional('convert', 'faq-accordion:split'),
		step('closer', 'cta-band:split'),
	],
}

/** Sections per page and whether the page must end on a closer (section 7.2, 7.3 rule 4). */
export const ARCHETYPE_RULES: Record<Archetype, { min: number; max: number; closer: boolean }> = {
	home: { min: 6, max: 9, closer: true },
	services: { min: 5, max: 8, closer: true },
	service: { min: 5, max: 8, closer: true },
	area: { min: 5, max: 8, closer: true },
	about: { min: 4, max: 7, closer: true },
	contact: { min: 2, max: 5, closer: false },
	work: { min: 3, max: 6, closer: true },
	reviews: { min: 3, max: 5, closer: true },
	pricing: { min: 4, max: 6, closer: true },
	faq: { min: 3, max: 5, closer: true },
	landing: { min: 6, max: 10, closer: true },
	process: { min: 4, max: 6, closer: true },
	article: { min: 3, max: 6, closer: true },
	custom: { min: 3, max: 8, closer: true },
}

/** One line per archetype for the planner: what the page is for. */
export const ARCHETYPE_TEXT: Record<Archetype, string> = {
	home: 'the front door: who the business is, what it does, why trust it, the one next step',
	services: 'the hub that lists every service and sends each visitor to the right service page',
	service: 'one service in depth: what is included, how it works, why this business, the ask',
	area: 'one place served: the services there, local reassurance, the ask',
	about: 'the people and the story behind the business, from the owner\'s own words only',
	contact: 'how to reach the business and what happens next',
	work: 'the owner\'s own photos of finished work',
	reviews: 'every review the owner supplied, quoted verbatim',
	pricing: 'how quotes and prices work, using only prices the owner stated',
	faq: 'the questions customers really ask, grouped, with direct answers',
	landing: 'one offer and one action, with no distractions (often a one-page site)',
	process: 'how working with the business goes, step by step',
	article: 'a long-form guide or story with a table of contents',
	custom: 'anything else the owner asked for',
}
