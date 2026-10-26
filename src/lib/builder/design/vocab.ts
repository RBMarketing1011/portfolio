/**
 * The closed vocabularies the AI builder chooses from. They live here, apart from the
 * catalog, so the contract and the pipeline types never import the catalog itself;
 * the catalog's join (`catalog/index.ts`) asserts these lists match `schema.ts`.
 *
 * Pure: loaded by the routes, the browser and the proofs alike.
 */

export const SURFACE_TONES = ['plain', 'soft', 'tinted', 'wash', 'pattern', 'inverse', 'inverse-glow', 'brand'] as const
export type SurfaceTone = (typeof SURFACE_TONES)[number]

export const ARCHETYPES = ['home', 'services', 'service', 'area', 'about', 'contact', 'work', 'reviews', 'pricing', 'faq', 'landing', 'process', 'article', 'custom'] as const
export type Archetype = (typeof ARCHETYPES)[number]

export const TWEAKS = [
	'one-button', 'no-buttons', 'hero-stats', 'hero-link', 'fan',
	'cols-2', 'cols-3', 'cols-4',
	'points', 'details', 'tile-images', 'with-note', 'full-width',
	'marker-plus', 'marker-chevron', 'marker-check', 'marker-arrow',
	'numbers-solid', 'numbers-outline', 'numbers-muted',
	'size-md', 'size-lg', 'size-full',
] as const
export type Tweak = (typeof TWEAKS)[number]

export const LAYOUT_IDS = [
	'page-hero:centered', 'page-hero:left', 'page-hero:compact',
	'split-hero:split', 'split-hero:reversed',
	'stat-hero:cards', 'stat-hero:divided', 'stat-hero:centered',
	'announcement-bar:strip', 'announcement-bar:badge', 'announcement-bar:ticker',
	'stat-band:divided', 'stat-band:row', 'stat-band:cards',
	'spotlight:split', 'spotlight:stacked', 'spotlight:overlap',
	'before-after:columns', 'before-after:rows', 'before-after:stacked',
	'feature-rows:alternating', 'feature-rows:cards', 'feature-rows:stacked',
	'process-steps:columns', 'process-steps:timeline', 'process-steps:cards',
	'bento-grid:accent', 'bento-grid:divided', 'bento-grid:numbered',
	'tabs-showcase:pills', 'tabs-showcase:underline', 'tabs-showcase:side',
	'chips:solid', 'chips:outline', 'chips:inline',
	'faq-accordion:split', 'faq-accordion:stacked', 'faq-accordion:boxed',
	'split-cta:cards', 'split-cta:divided', 'split-cta:rows',
	'cta-band:card', 'cta-band:centered', 'cta-band:split',
	'prose-block:plain', 'prose-block:ruled', 'prose-block:marked',
	'callout:card', 'callout:rule', 'callout:banner',
	'check-list:columns', 'check-list:inline', 'check-list:stacked',
	'media-gallery:bottom', 'media-gallery:side', 'media-gallery:top', 'media-gallery:carousel',
	'media-mosaic:default',
	'figure:below', 'figure:framed', 'figure:beside',
	'image-compare:stacked', 'image-compare:text-left', 'image-compare:text-right',
	'grid:centered', 'grid:above', 'grid:beside',
	'masonry:centered', 'masonry:above', 'masonry:bare',
	'carousel:bars', 'carousel:below', 'carousel:overlay',
	'marquee:inline', 'marquee:rule', 'marquee:centered',
	'detail-card:card', 'detail-card:rows', 'detail-card:inline',
	'table-of-contents:rail', 'table-of-contents:numbered', 'table-of-contents:card',
] as const // 82 layouts, 28 types
export type Layout = (typeof LAYOUT_IDS)[number]

export const OPENER_LAYOUTS = [
	'page-hero:centered', 'page-hero:left', 'page-hero:compact', 'split-hero:split', 'split-hero:reversed',
	'stat-hero:cards', 'stat-hero:divided', 'stat-hero:centered',
] as const satisfies readonly Layout[]
export const CLOSER_LAYOUTS = [
	'cta-band:card', 'cta-band:centered', 'cta-band:split', 'split-cta:cards', 'split-cta:divided', 'split-cta:rows',
] as const satisfies readonly Layout[]

export const CHILD_LAYOUT_IDS = [
	'feature-card:card', 'feature-card:inline', 'feature-card:numbered',
	'testimonial-card:card', 'testimonial-card:bare',
	'related-card:card', 'related-card:list',
	'media-card:card', 'media-card:overlay', 'media-card:bare',
	'client-logo:wordmark',
] as const
export type ChildLayout = (typeof CHILD_LAYOUT_IDS)[number]

export const PALETTE_IDS = [
	'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13',
	'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12', 'L13', 'L14',
] as const
export type PaletteId = (typeof PALETTE_IDS)[number]

export const FONT_PAIR_IDS = [
	'grotesk-dm', 'sora-inter', 'bricolage-inter', 'instrument', 'manrope', 'jakarta', 'redhat', 'figtree',
	'outfit-figtree', 'oswald-barlow', 'archivo', 'epilogue-inter', 'schibsted-inter', 'plex', 'fraunces-inter',
	'lora-nunito', 'merriweather-source', 'caslon-franklin', 'playfair-source', 'cormorant-manrope', 'bodoni-jost',
	'newsreader-intertight', 'zilla-work', 'cinzel-raleway',
] as const
export type FontPairId = (typeof FONT_PAIR_IDS)[number]

export const PERSONALITY_IDS = ['technical', 'bold', 'friendly', 'refined', 'warm', 'rugged', 'clinical', 'editorial', 'luxe', 'playful'] as const
export type PersonalityId = (typeof PERSONALITY_IDS)[number]

export const BACKDROP_IDS = ['clean', 'paper', 'glow', 'grid', 'lines', 'blueprint'] as const
export type BackdropId = (typeof BACKDROP_IDS)[number]
