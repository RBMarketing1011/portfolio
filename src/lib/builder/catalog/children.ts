/**
 * The cards a container holds (section 6.8). The writer fills only the strings listed as
 * slots; everything that is the owner's data (a review, a page link, a photo, a service
 * name in a ticker) is placed by code and never written.
 *
 * Excluded variants stay listed with their reason, so a variant added to `schema.ts`
 * fails the catalog proof until it is curated.
 *
 * Pure: no client modules.
 */
import { SLOT_MAX } from './meta'
import type { ChildMeta, SlotKind, SlotSpec, TextToken, VariantMeta } from './types'

const DEFAULT_TEXT: TextToken[] = ['heading', 'body', 's400', 'accent']

const variant = (
	id: string,
	ai: boolean,
	density: VariantMeta['density'],
	look: string,
	use: string,
	extra: Partial<VariantMeta> = {},
): VariantMeta & { ai: boolean } => ({ id, ai, density, look, use, text: DEFAULT_TEXT, ...extra })

const slot = (path: string, kind: SlotKind, max = SLOT_MAX[kind], extra: Partial<SlotSpec> = {}): SlotSpec => ({
	path,
	kind,
	max,
	...extra,
})

const none = () => ({})

export const CHILD_META: Record<string, ChildMeta> = {
	'feature-card': {
		type: 'feature-card',
		variants: [
			variant('card', true, 'card', 'a glass card with an icon chip, title and blurb', 'a set of services or benefits'),
			variant('inline', true, 'open', 'the icon beside the copy, no card', 'a dense services list'),
			variant('numbered', true, 'open', 'a large faded number under an accent rule, no icon', 'an ordered set of ideas', { hides: ['icon'] }),
		],
		slots: [
			slot('title', 'subhead', 40),
			slot('blurb', 'paragraph', 140),
			slot('icon', 'icon', 40, { variants: ['card', 'inline'] }),
		],
		// The numbered card reads `index` (the default always reads 01, cards.tsx:652-654).
		design: (index) => ({ index: index + 1 }),
	},
	'testimonial-card': {
		type: 'testimonial-card',
		variants: [
			variant('card', true, 'card', 'a glass card with a quote mark, the attribution under a rule', 'reviews in a grid, masonry or carousel'),
			variant('bare', true, 'open', 'an oversized quote mark and a centred display-font quote', 'one or two standout reviews'),
			variant('aside', false, 'card', 'the attribution beside the quote', 'never', {
				excluded: 'always draws a generic silhouette avatar (cards.tsx:79-81)',
			}),
		],
		slots: [],
		data: 'review',
		// The owner's review verbatim (quote, name, role, company = source); featured when the container holds 1-2.
		design: (_index, total) => (total <= 2 ? { featured: true } : {}),
	},
	'related-card': {
		type: 'related-card',
		variants: [
			variant('list', true, 'open', 'a ruled row with a label, the page name and an arrow', 'an index of service pages', { hides: ['description'] }),
			variant('card', true, 'card', 'a glass card with a label, the page name, a description and "Read"', 'a few pages worth opening next'),
			variant('thumbnail', false, 'card', 'a small media box beside the title', 'never', {
				excluded: 'a permanently empty image box (cards.tsx:461)',
			}),
		],
		slots: [
			slot('meta', 'meta', 20, { guide: 'a 1-2 word label above the page name' }),
			slot('description', 'paragraph', 120, { variants: ['card'] }),
		],
		data: 'page-link',
		// `title` is the target page's name and `href` its path: one card per real page.
		design: none,
	},
	'media-card': {
		type: 'media-card',
		variants: [
			variant('card', true, 'card', 'the photo in a glass card with a caption below', 'photos in a grid or carousel', { text: ['s500'] }),
			variant('overlay', true, 'media', 'the caption over the bottom of the photo', 'photos with short captions', { text: ['body'] }),
			variant('bare', true, 'media', 'no card, a small centred caption', 'masonry photo walls', { text: ['s500'] }),
		],
		slots: [slot('alt', 'alt', 120), slot('caption', 'caption', 100)],
		data: 'photo',
		design: none,
	},
	'client-logo': {
		type: 'client-logo',
		variants: [
			variant('wordmark', true, 'open', 'the name in the display font, muted', 'a ticker of services or areas', { text: ['s500'] }),
			variant('boxed', false, 'open', 'a bordered box', 'never', {
				excluded: 'logos are never shown without real logo files',
			}),
			variant('muted', false, 'open', 'dimmed', 'never', {
				excluded: 'paints text-slate-600, which no theme validates (cards.tsx:536-538)',
			}),
		],
		slots: [],
		data: 'ticker',
		// `name` is a service or area, never a client's name; `src` is never set.
		design: none,
	},
	// Never chosen in v1 (section 6.10): no image field, or no real content to put in them.
	'team-card': {
		type: 'team-card',
		variants: ['card', 'portrait', 'row'].map((id) =>
			variant(id, false, 'card', 'a silhouette in place of a photo', 'never', { excluded: 'no image field; needs owner-entered people (schema.ts:1472-1484)' }),
		),
		slots: [],
		design: none,
	},
	'article-card': {
		type: 'article-card',
		variants: ['card', 'numbered', 'thumbnail'].map((id) =>
			variant(id, false, 'card', 'a blog card', 'never', { excluded: 'needs real articles; numbered always reads 01 (cards.tsx:296)' }),
		),
		slots: [],
		design: none,
	},
	'case-study-card': {
		type: 'case-study-card',
		variants: ['stacked', 'overlay', 'row'].map((id) =>
			variant(id, false, 'card', 'a project card', 'never', { excluded: 'needs real projects and clients' }),
		),
		slots: [],
		design: none,
	},
}
