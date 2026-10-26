/**
 * The curated metadata for every section the AI may choose (section 6.7), hand-written
 * from the component code and joined with `schema.ts` at runtime (`catalog()`), so
 * labels, field types and variant ids can never drift.
 *
 * Each entry says what the section is for, what each variant looks like and when to use
 * it, how many items read well, which photos and owner facts it needs, which strings the
 * writer must fill (slots: every visible string that has a component default), and a
 * `design` function that sets every structural prop (counts, numbers, spans, styles,
 * hrefs and owner data) so nothing falls back to a component default.
 *
 * Pure: no client modules, so the planner, the page route and the proofs share it.
 */
import { PERSONALITIES, type Personality } from '../design/personalities'
import type {
	Archetype, ComposeCtx, ComposeSpec, Count, DesignOutput, ItemRule, SectionMeta, SlotKind, SlotSpec,
	TextToken, Tweak, VariantMeta,
} from './types'

// ---------------------------------------------------------------- shared helpers

/** The default hard cap per slot kind (section 6.6). The writer is told 80% of it. */
export const SLOT_MAX: Record<SlotKind, number> = {
	eyebrow: 32, heading: 64, richtext: 64, subhead: 56, paragraph: 220, short: 120, label: 24, button: 24,
	question: 96, answer: 420, item: 100, prose: 6000, icon: 40, alt: 120, caption: 110, meta: 20,
}

/** Prose length per page archetype (section 6.7, prose-block). */
export const PROSE_LENGTH: Partial<Record<Archetype, { max: number; guide: string }>> = {
	about: { max: 6000, guide: 'the story from the brief only, 150-350 words' },
	article: { max: 12000, guide: '700-1500 words with specific <h2> section headings' },
	custom: { max: 6000, guide: '150-600 words' },
}

const DEFAULT_TEXT: TextToken[] = ['heading', 'body', 's400', 'accent']

const variant = (
	id: string,
	density: VariantMeta['density'],
	look: string,
	use: string,
	extra: Partial<VariantMeta> = {},
): VariantMeta => ({ id, density, look, use, text: DEFAULT_TEXT, ...extra })

const slot = (path: string, kind: SlotKind, max = SLOT_MAX[kind], extra: Partial<SlotSpec> = {}): SlotSpec => ({
	path,
	kind,
	max,
	...extra,
})

const heading = (titleMax = 60, descriptionMax = 200, extra: Partial<SlotSpec> = {}): SlotSpec[] => [
	slot('eyebrow', 'eyebrow', 32, extra),
	slot('title', 'richtext', titleMax, extra),
	slot('description', 'paragraph', descriptionMax, extra),
]

const personality = (ctx: ComposeCtx): Personality => PERSONALITIES[ctx.personality] ?? PERSONALITIES.friendly

export const archetypeOf = (ctx: ComposeCtx): Archetype => ctx.page?.archetype ?? 'custom'

const has = (spec: ComposeSpec, tweak: Tweak) => spec.tweaks.includes(tweak)

const range = (length: number) => Array.from({ length: Math.max(0, length) }, (_, index) => index)

/** The count rule of a list for one variant. */
export function countFor(rule: ItemRule | undefined, variantId: string | null): Count | null {
	if (!rule) return null
	return (variantId && rule.byVariant?.[variantId]) || rule.count
}

/** A requested count moved to the nearest one the rule allows (ties go up); 0 or junk reads as ideal. */
export function clampCount(count: Count, value: number): number {
	const wanted = Number.isFinite(value) && value > 0 ? Math.round(value) : count.ideal
	if (count.allowed?.length) {
		let best = count.allowed[0]
		for (const option of count.allowed) {
			if (Math.abs(option - wanted) < Math.abs(best - wanted) || (Math.abs(option - wanted) === Math.abs(best - wanted) && option > best))
				best = option
		}
		return best
	}
	return Math.min(count.max, Math.max(count.min, wanted))
}

/** The button icon follows its target: a phone, an envelope, or an arrow to a page. */
export function targetIcon(href: string): { icon: string; iconPosition: 'before' | 'after' } {
	if (href.startsWith('tel:')) return { icon: 'Phone', iconPosition: 'before' }
	if (href.startsWith('mailto:')) return { icon: 'Mail', iconPosition: 'before' }
	return { icon: 'ArrowRight', iconPosition: 'after' }
}

const primaryMeaning = (ctx: ComposeCtx) => `primary action: ${ctx.primary.label || 'get in touch'}`

/** The archetype's secondary target, never the primary action or the page itself. */
export function secondaryOf(ctx: ComposeCtx): { href: string; meaning: string } | null {
	const second = ctx.secondaryFor(archetypeOf(ctx))
	if (!second?.href || second.href === ctx.primary.href) return null
	if (ctx.page && second.href === ctx.page.path) return null
	return second
}

const phoneTarget = (ctx: ComposeCtx) =>
	ctx.phone && ctx.phone.href !== ctx.primary.href ? { href: ctx.phone.href, meaning: `call ${ctx.phone.display}` } : null
const emailTarget = (ctx: ComposeCtx) =>
	ctx.email && ctx.email.href !== ctx.primary.href ? { href: ctx.email.href, meaning: `email ${ctx.email.display}` } : null

/** Brands people phone (section 9.2). */
const callLed = (ctx: ComposeCtx) => ['rugged', 'bold', 'friendly'].includes(ctx.personality)

/** Some page other than this one and the primary action's, so a second button always goes somewhere real. */
function anotherPage(ctx: ComposeCtx): { href: string; meaning: string } {
	const other = ctx.pages.find((page) => page.path !== ctx.primary.href && page.path !== ctx.page?.path)
	return other ? { href: other.path, meaning: `the ${other.name} page` } : { href: '/', meaning: 'the home page' }
}

/** An outline button to a secondary target: a phone or email gets its own icon. */
const outline = (href: string) => ({
	href,
	style: 'outline',
	...(href.startsWith('tel:') || href.startsWith('mailto:') ? targetIcon(href) : {}),
})

/** The opener's buttons: the primary action, then the archetype's secondary target. */
function heroActions(spec: ComposeSpec, ctx: ComposeCtx) {
	const actions: Record<string, unknown>[] = []
	const links: DesignOutput['links'] = []
	if (has(spec, 'no-buttons')) return { actions, links }
	actions.push({ href: ctx.primary.href, style: 'primary', ...targetIcon(ctx.primary.href) })
	links.push({ slot: 'actions.0.label', href: ctx.primary.href, meaning: primaryMeaning(ctx) })
	const second = has(spec, 'one-button') ? null : secondaryOf(ctx)
	if (second) {
		actions.push(outline(second.href))
		links.push({ slot: 'actions.1.label', href: second.href, meaning: `secondary: ${second.meaning}` })
	}
	return { actions, links }
}

const factRows = (ctx: ComposeCtx, count: number) =>
	ctx.facts.slice(0, count).map(({ value, label }) => ({ value, label }))

/** Bento spans that fill every row of the grid (explain.tsx:403-413). */
export function bentoSpans(count: number, columns: 3 | 4): number[] {
	const table: Record<string, number[]> = {
		'3:4': [2, 1, 1, 2],
		'3:6': [2, 1, 1, 2, 2, 1],
		'4:4': [1, 1, 1, 1],
		'4:6': [2, 1, 1, 1, 1, 2],
		'4:8': [2, 1, 1, 2, 1, 1, 2, 2],
	}
	return table[`${columns}:${count}`] ?? range(count).map(() => 1)
}

/** Pages a related-card grid links to: the service pages, else every other page but home. */
export function relatedTargets(ctx: ComposeCtx) {
	const others = ctx.pages.filter((page) => page.path !== ctx.page?.path && page.path !== '/')
	const services = others.filter((page) => page.archetype === 'service')
	return services.length >= 2 ? services : others
}

/** The counts a grid of N columns fills without a hole. */
export const GRID_FITS: Record<2 | 3 | 4, number[]> = { 2: [2, 4, 6], 3: [3, 6], 4: [4, 8] }

/**
 * A grid's columns (section 6.7): by child kind, a cols-* tweak when the count fits, and
 * otherwise the nearest column count the cards fill without a hole.
 */
const gridColumns = (spec: ComposeSpec, kind: string, count: number): 2 | 3 | 4 => {
	if (spec.variant === 'beside') return 2
	const tweak = ([2, 3, 4] as const).find((n) => has(spec, `cols-${n}` as Tweak))
	if (tweak && GRID_FITS[tweak].includes(count)) return tweak
	// A list of page links reads fine with any count; two columns unless three fit exactly.
	if (kind === 'related-card:list') return count % 3 === 0 && count % 2 !== 0 ? 3 : 2
	const preferred: 2 | 3 | 4 =
		kind === 'feature-card:inline' ? (count === 6 ? 3 : 2)
			: kind.startsWith('testimonial-card') ? (count === 2 || count === 4 ? 2 : 3)
				: 3
	for (const columns of [preferred, 3, 2, 4] as const) if (GRID_FITS[columns].includes(count)) return columns
	return preferred
}

/** The largest count no larger than `available` that a set of allowed counts holds. */
const fitDown = (available: number, allowed: number[]) =>
	[...allowed].sort((a, b) => b - a).find((option) => option <= available) ?? available

const reviewProps = (review: { quote: string; name: string; role: string; source: string }) => ({
	quote: review.quote,
	name: review.name,
	...(review.role ? { role: review.role } : {}),
	...(review.source ? { company: review.source } : {}),
})

const noDesign = (): DesignOutput => ({ props: {}, links: [] })

// ---------------------------------------------------------------- the never-types (section 6.10)

const never = (type: string, purpose: string, needs: SectionMeta['needs']): SectionMeta => ({
	type,
	ai: 'never',
	needs,
	roles: [],
	h1: false,
	purpose,
	pages: [],
	slots: [],
	tweaks: [],
	surfaces: [],
	variants: [],
	design: noDesign,
})

// ---------------------------------------------------------------- the AI sections

export const SECTION_META: Record<string, SectionMeta> = {
	// ------------------------------------------------------------------ entry
	'page-hero': {
		type: 'page-hero',
		ai: 'yes',
		needs: [],
		roles: ['opener'],
		h1: true,
		purpose: 'Typographic opener: badge eyebrow, large headline with one highlighted phrase, a short promise, up to two buttons, optionally up to three owner facts.',
		pages: 'all',
		items: { list: 'stats', count: { min: 0, max: 3, ideal: 0 } },
		slots: [
			slot('eyebrow', 'eyebrow', 32, { guide: "the page's topic: the service, the place, or what the business is" }),
			slot('title', 'richtext', 72, { guide: 'the page H1: the promise, one [[highlight]]' }),
			slot('description', 'paragraph', 220),
			slot('actions[].label', 'button', 24),
		],
		tweaks: ['one-button', 'no-buttons', 'hero-stats'],
		surfaces: ['plain', 'soft', 'wash', 'pattern', 'tinted', 'inverse-glow'],
		variants: [
			variant('centered', 'open', 'everything centred, very large headline', 'home and hub openers without a photo; the strongest image-free hero, dramatic on inverse-glow'),
			variant('left', 'open', 'left-aligned from tablet up, editorial', 'service, about, landing and area pages; when the next section carries the visual'),
			variant('compact', 'open', 'smaller headline, tight top', 'contact, FAQ, pricing and article pages'),
		],
		design(spec, ctx) {
			const { actions, links } = heroActions(spec, ctx)
			const stats = has(spec, 'hero-stats') && ctx.facts.length >= 2 ? factRows(ctx, 3) : []
			return { props: {}, rows: { actions, stats }, links }
		},
	},

	'split-hero': {
		type: 'split-hero',
		ai: 'when',
		needs: ['photo'],
		roles: ['opener'],
		h1: true,
		purpose: 'Image-led opener: copy on one side, a large 16:9 photo card on the other; "fan" adds five photos fanned behind it on tablet and desktop.',
		pages: ['home', 'services', 'service', 'about', 'landing', 'area', 'work'],
		images: [
			{ path: 'mediaSrc', role: 'hero', aspect: '16:9', required: true },
			{ path: 'backdrop[]', role: 'backdrop', aspect: 'any', required: true, tweak: 'fan' },
		],
		slots: [
			slot('eyebrow', 'eyebrow', 32, { guide: "the page's topic: the service, the place, or what the business is" }),
			slot('title', 'richtext', 64, { guide: 'the page H1: the promise, one [[highlight]]' }),
			slot('description', 'paragraph', 200),
			slot('actions[].label', 'button', 24),
			slot('mediaLabel', 'alt', 80, { guide: 'what the main photo shows' }),
		],
		tweaks: ['one-button', 'fan'],
		surfaces: ['plain', 'wash', 'pattern', 'inverse-glow'],
		fallback: 'page-hero:left',
		variants: [
			variant('split', 'media', 'copy left, 16:9 photo card right; with fan, five photos fanned behind it from tablet up', 'the default image-led opener when a strong landscape photo exists'),
			variant('reversed', 'media', 'photo left, copy right-aligned on desktop, the fan mirrored', 'a second image-led opener in the same site, typically service pages'),
		],
		design(spec, ctx) {
			const { actions, links } = heroActions(spec, ctx)
			// The five fan tiles are written by the image step, all or none.
			return { props: { backdrop: [] }, rows: { actions }, links }
		},
	},

	'stat-hero': {
		type: 'stat-hero',
		ai: 'when',
		needs: ['facts'],
		roles: ['opener'],
		h1: true,
		purpose: "Number-led opener: headline and promise above four (or two) of the owner's own figures, with an optional text link.",
		pages: ['home', 'about', 'service', 'work'],
		items: { list: 'stats', count: { min: 2, max: 4, ideal: 4, allowed: [2, 4] } },
		slots: [
			slot('eyebrow', 'eyebrow', 32, { guide: "the page's topic: the service, the place, or what the business is" }),
			slot('title', 'richtext', 72, { guide: 'the page H1: the promise, one [[highlight]]' }),
			slot('description', 'paragraph', 200),
			slot('linkLabel', 'button', 32, { tweak: 'hero-link' }),
		],
		tweaks: ['hero-link'],
		surfaces: ['plain', 'wash', 'inverse-glow'],
		fallback: 'page-hero:centered',
		variants: [
			variant('cards', 'card', 'four figures in glass cards', 'bold or technical, results-led brands'),
			variant('divided', 'open', 'figures in a ruled row', 'exactly 4 or 2 figures (3 leaves a stray rule on tablets)'),
			variant('centered', 'open', 'centred copy, plain centred figure cells', 'refined, editorial brands'),
		],
		design(spec, ctx) {
			const count = ctx.facts.length >= 4 && spec.items !== 2 ? 4 : 2
			const second = has(spec, 'hero-link') ? secondaryOf(ctx) : null
			// showLink false kills the default "See What All The Hype Is About" link.
			const props: Record<string, unknown> = { showLink: Boolean(second) }
			if (second) Object.assign(props, { linkHref: second.href, linkIcon: 'ArrowRight', linkIconPosition: 'after' })
			return {
				props,
				rows: { stats: factRows(ctx, count) },
				links: second ? [{ slot: 'linkLabel', href: second.href, meaning: `secondary: ${second.meaning}` }] : [],
			}
		},
	},

	'announcement-bar': {
		type: 'announcement-bar',
		ai: 'when',
		needs: ['announcement'],
		roles: ['top-bar'],
		h1: false,
		purpose: 'A one-line notice band above the opener for something the owner announced (an offer, an opening), with one link.',
		pages: ['home', 'landing', 'service'],
		slots: [
			slot('message', 'short', 110, { guide: 'the announcement itself, exactly as the owner stated it' }),
			slot('badge', 'label', 14, { variants: ['badge'] }),
			// The link cannot be removed (interactive.tsx:285,294-295), so it is always written.
			slot('linkLabel', 'button', 20),
		],
		tweaks: [],
		surfaces: ['plain'],
		placement: 'index 0 only, directly above the opener',
		variants: [
			variant('strip', 'open', 'a thin accent-tinted band with the message and a link', 'the default', { text: ['body', 'accent'], hides: ['badge'] }),
			variant('badge', 'open', 'a panel band with a small badge, then the message and link', 'a new service or opening news', { text: ['body', 'accent'] }),
			variant('floating', 'open', 'a sticky glass pill', 'never', {
				excluded: 'its sticky top-4 z-50 pill collides with the sticky built header (interactive.tsx:376)',
			}),
			variant('ticker', 'open', 'the message repeated and scrolling; pauses on hover, honours reduced motion', 'playful or bold brands with a very short message', { text: ['body', 'accent'], hides: ['badge'] }),
		],
		design(_spec, ctx) {
			const href = ctx.primary.href
			return {
				props: { href, align: 'center', dismissible: true, speed: 36 },
				links: [{ slot: 'linkLabel', href, meaning: primaryMeaning(ctx) }],
			}
		},
	},

	// ------------------------------------------------------------------ proof
	'stat-band': {
		type: 'stat-band',
		ai: 'when',
		needs: ['facts'],
		roles: ['proof'],
		h1: false,
		purpose: "A band of three or six of the owner's own figures, with no heading of its own.",
		pages: ['home', 'about', 'service', 'area', 'reviews'],
		items: { list: 'stats', count: { min: 3, max: 6, ideal: 3, allowed: [3, 6] } },
		slots: [slot('stats[].icon', 'icon', 40, { variants: ['row', 'cards'], guide: "an icon that depicts the figure's subject" })],
		tweaks: [],
		surfaces: ['plain', 'soft', 'tinted', 'wash', 'inverse'],
		placement: 'right after the opener, or right after an explain section',
		variants: [
			variant('divided', 'open', 'large accent numbers split by thin rules, centred', 'the default; the quietest, most elegant proof', { text: ['heading', 'accent', 's500'] }),
			variant('row', 'open', 'an icon chip beside each number, the label underneath', 'friendly or technical brands', { text: ['accent', 's400'] }),
			variant('cards', 'card', 'three accent glass cards', 'bold brands; never next to another card section', { openAlternative: 'divided' }),
		],
		design(spec, ctx) {
			const count = ctx.facts.length >= 6 && spec.items >= 6 ? 6 : 3
			return { props: {}, rows: { stats: factRows(ctx, count) }, links: [] }
		},
	},

	spotlight: {
		type: 'spotlight',
		ai: 'when',
		needs: ['photo'],
		roles: ['showcase', 'proof'],
		h1: false,
		purpose: 'One feature with its best photo: a heading, a summary, an optional list of contact facts and one button.',
		pages: ['home', 'service', 'about', 'work'],
		images: [
			{ path: 'mediaSrc', role: 'feature', aspect: '16:9', required: true, variants: ['split'] },
			{ path: 'mediaSrc', role: 'feature', aspect: '21:9', required: true, variants: ['stacked', 'overlap'] },
		],
		slots: [
			slot('eyebrow', 'eyebrow', 32),
			slot('title', 'richtext', 60),
			slot('summary', 'paragraph', 260),
			slot('actions[].label', 'button', 24),
			slot('mediaAlt', 'alt', 120, { guide: 'what the photo shows' }),
		],
		tweaks: ['details'],
		surfaces: ['plain', 'soft'],
		fallback: 'bento-grid:accent',
		variants: [
			// mediaLabel shows only in place of a missing photo, and the photo is required.
			variant('split', 'card', '16:9 photo card left, copy and details right', 'feature one service with its best photo', { text: [...DEFAULT_TEXT, 's500'], hides: ['mediaLabel'] }),
			variant('stacked', 'media', 'centred copy, a wide 21:9 photo below, details in two columns', 'a calm mid-page moment; wants a panorama or wide landscape', { text: [...DEFAULT_TEXT, 's500'], hides: ['mediaLabel'] }),
			variant('overlap', 'media', 'a wide 21:9 photo with an accent copy card floating over its right side; no details', 'the most editorial layout; at most one per site', { hides: ['details', 'mediaLabel'] }),
		],
		design(spec, ctx) {
			const href = ctx.primary.href
			// An empty list hides the details, so the default "Detail Label" rows never render.
			const details = has(spec, 'details') && spec.variant !== 'overlap'
				? ctx.contactFacts.slice(0, 4).map(({ label, value }) => ({ label, value }))
				: []
			// Shown only if the photo cannot load; better the photo's description than the kit's sample label.
			const shows = spec.images[0]?.shows?.trim()
			return {
				props: shows ? { mediaLabel: clampWords(shows, 40) } : {},
				rows: { details, actions: [{ href, style: 'primary', ...targetIcon(href) }] },
				links: [{ slot: 'actions.0.label', href, meaning: primaryMeaning(ctx) }],
			}
		},
	},

	'before-after': {
		type: 'before-after',
		ai: 'yes',
		needs: [],
		roles: ['explain', 'proof'],
		h1: false,
		purpose: 'Two lists set against each other: the problem or the usual way, then how this business does it.',
		pages: ['home', 'service', 'landing', 'about', 'pricing'],
		items: { list: 'before', count: { min: 3, max: 5, ideal: 4 }, byVariant: { rows: { min: 3, max: 4, ideal: 4 } } },
		slots: [
			slot('eyebrow', 'eyebrow', 32),
			slot('title', 'richtext', 60),
			slot('beforeLabel', 'label', 22),
			slot('afterLabel', 'label', 22),
			slot('before[].text', 'item', 110, { variants: ['columns', 'stacked'], guide: "the problem or the usual way, in the customer's words" }),
			slot('after[].text', 'item', 110, { variants: ['columns', 'stacked'], guide: 'how this business does it; only claims the owner made' }),
			// rows stays two-up on phones, so its lines are shorter.
			slot('before[].text', 'item', 70, { variants: ['rows'], guide: "the problem or the usual way, in the customer's words" }),
			slot('after[].text', 'item', 70, { variants: ['rows'], guide: 'how this business does it; only claims the owner made' }),
		],
		tweaks: [],
		surfaces: ['plain', 'soft', 'tinted', 'pattern'],
		variants: [
			variant('columns', 'card', 'two cards side by side, a muted "before" and an accent "after"', 'the default', { text: [...DEFAULT_TEXT, 's500'] }),
			variant('rows', 'panel', 'one table pairing each problem with its fix on the same line', 'short, parallel pairs', { text: [...DEFAULT_TEXT, 's500'] }),
			variant('stacked', 'card', 'the before card, a down-arrow chip, then the after card', 'a transformation story', { text: [...DEFAULT_TEXT, 's500'] }),
		],
		design(spec, ctx) {
			const count = clampCount(countFor(SECTION_META['before-after'].items, spec.variant)!, spec.items)
			const muted = ['refined', 'clinical', 'luxe'].includes(ctx.personality)
			const warm = ['friendly', 'warm'].includes(ctx.personality)
			return {
				props: {},
				rows: {
					before: range(count).map(() => ({ icon: muted ? 'Minus' : 'X' })),
					after: range(count).map(() => ({ icon: warm ? 'CircleCheck' : 'Check' })),
				},
				links: [],
			}
		},
	},

	// ------------------------------------------------------------ explain and showcase
	'feature-rows': {
		type: 'feature-rows',
		ai: 'when',
		needs: ['photo'],
		roles: ['showcase', 'explain'],
		h1: false,
		purpose: 'Rows of copy beside a photo each, with optional bullet points; no section heading of its own.',
		pages: ['home', 'service', 'services', 'about', 'process'],
		items: { list: 'rows', count: { min: 2, max: 4, ideal: 3 } },
		images: [{ path: 'rows[].image', role: 'feature', aspect: '16:9', required: true }],
		slots: [
			slot('rows[].eyebrow', 'eyebrow', 24),
			slot('rows[].title', 'subhead', 56),
			slot('rows[].description', 'paragraph', 260),
			slot('rows[].points[].text', 'item', 90, { tweak: 'points' }),
		],
		tweaks: ['points'],
		surfaces: ['plain', 'soft'],
		fallback: 'bento-grid:accent',
		placement: 'right after the opener, or after a section with a heading (it has none of its own)',
		variants: [
			variant('alternating', 'media', 'open rows, copy beside a 16:9 photo, sides alternating', 'the default; the best service showcase with real photos'),
			variant('cards', 'card', 'each row inside an accent glass card', 'two rows on a plain page', { openAlternative: 'alternating' }),
			variant('stacked', 'media', 'a full-width photo banner above a two-column heading and description', 'big, confident photography'),
		],
		design(spec) {
			const count = clampCount(SECTION_META['feature-rows'].items!.count, spec.items)
			const points = has(spec, 'points') ? 3 : 0
			// mediaSide stays unset (the automatic zig-zag) and point icons unset (Check).
			return { props: {}, rows: { rows: range(count).map(() => ({ points: range(points).map(() => ({})) })) }, links: [] }
		},
	},

	'process-steps': {
		type: 'process-steps',
		ai: 'yes',
		needs: [],
		roles: ['explain'],
		h1: false,
		purpose: 'Numbered steps under a heading: how working with the business goes.',
		pages: ['home', 'service', 'services', 'landing', 'process', 'about', 'pricing', 'contact'],
		items: {
			list: 'steps',
			count: { min: 3, max: 5, ideal: 4 },
			byVariant: {
				columns: { min: 3, max: 3, ideal: 3, allowed: [3] },
				timeline: { min: 3, max: 5, ideal: 4 },
				cards: { min: 3, max: 4, ideal: 3 },
			},
		},
		slots: [
			...heading(),
			slot('steps[].title', 'subhead', 40, { guide: 'what happens at this step, in 2-5 words' }),
			slot('steps[].summary', 'paragraph', 180),
			slot('steps[].detail[].text', 'item', 80, { tweak: 'details', variants: ['timeline', 'cards'] }),
		],
		tweaks: ['details', 'numbers-solid', 'numbers-outline', 'numbers-muted'],
		surfaces: ['plain', 'soft', 'tinted', 'wash', 'pattern', 'inverse'],
		variants: [
			variant('columns', 'open', 'three columns under accent top rules with large faded numbers', 'the default; a short three-step process'),
			variant('timeline', 'open', 'a vertical rule with numbered badges', '4-5 steps, or a project timeline'),
			variant('cards', 'card', 'stacked accent cards with a big number, title, summary and details', 'steps that need detail', { openAlternative: 'timeline' }),
		],
		design(spec, ctx) {
			const count = clampCount(countFor(SECTION_META['process-steps'].items, spec.variant)!, spec.items)
			const details = has(spec, 'details') && spec.variant !== 'columns' ? 3 : 0
			const tweak = (['solid', 'outline', 'muted'] as const).find((style) => has(spec, `numbers-${style}`))
			return {
				props: { numberStyle: tweak ?? personality(ctx).stepNumbers },
				rows: {
					steps: range(count).map((index) => ({
						number: String(index + 1).padStart(2, '0'),
						detail: range(details).map(() => ({})),
					})),
				},
				links: [],
			}
		},
	},

	'bento-grid': {
		type: 'bento-grid',
		ai: 'yes',
		needs: [],
		roles: ['explain', 'showcase'],
		h1: false,
		purpose: 'Mixed-width tiles with icons under a heading: capabilities, services, values or reasons.',
		pages: ['home', 'services', 'service', 'about', 'landing', 'process'],
		items: { list: 'tiles', count: { min: 4, max: 8, ideal: 6, allowed: [4, 6, 8] } },
		images: [{ path: 'tiles[].image', role: 'panel', aspect: 'any', required: false, tweak: 'tile-images', variants: ['accent', 'divided'] }],
		slots: [
			...heading(),
			slot('tiles[].title', 'subhead', 40),
			slot('tiles[].blurb', 'paragraph', 140),
			slot('tiles[].icon', 'icon', 40, { variants: ['accent', 'divided'] }),
		],
		tweaks: ['cols-4', 'tile-images'],
		surfaces: ['plain', 'soft', 'tinted', 'wash', 'pattern', 'inverse'],
		variants: [
			// The tile's html text panel is never used: photos or nothing.
			variant('accent', 'card', 'accent glass tiles of mixed widths with icon chips and rotating edge strengths', 'the most designed capability overview', { openAlternative: 'numbered', hides: ['tiles[].html'] }),
			variant('divided', 'panel', 'one panel split by hairlines into cells on the page colour', 'calm or refined brands', { hides: ['tiles[].html'] }),
			variant('numbered', 'card', 'bordered tiles numbered 01, 02… by position, no icons', 'values, principles, reasons', { hides: ['tiles[].html', 'tiles[].icon'] }),
		],
		design(spec) {
			const wide = has(spec, 'cols-4')
			const count = clampCount({ min: 4, max: wide ? 8 : 6, ideal: wide ? 4 : 6, allowed: wide ? [4, 6, 8] : [4, 6] }, spec.items)
			// Photos go on the wide tiles with alternating sides once placed (compose.ts).
			const tiles = bentoSpans(count, wide ? 4 : 3).map((span) => ({ span: String(span) }))
			return { props: { columns: wide ? '4' : '3' }, rows: { tiles }, links: [] }
		},
	},

	'tabs-showcase': {
		type: 'tabs-showcase',
		ai: 'when',
		needs: ['photo'],
		roles: ['showcase'],
		h1: false,
		purpose: 'Several services behind one set of tabs, each panel with copy, three points and a photo.',
		pages: ['services', 'home', 'service'],
		items: { list: 'items', count: { min: 3, max: 5, ideal: 4 } },
		images: [{ path: 'items[].image', role: 'panel', aspect: '16:9', required: true }],
		slots: [
			...heading(),
			slot('items[].label', 'label', 16, { guide: 'one or two words' }),
			slot('items[].title', 'subhead', 50),
			slot('items[].body', 'paragraph', 240),
			slot('items[].points[].text', 'item', 80),
		],
		tweaks: [],
		surfaces: ['plain', 'soft'],
		fallback: 'bento-grid:numbered',
		variants: [
			variant('pills', 'card', 'wrapped pill tabs above a glass panel (copy beside a 16:9 photo)', 'the default'),
			variant('underline', 'card', 'an underlined tab row above the panel', 'technical, editorial brands'),
			variant('side', 'card', 'a sticky vertical tab list beside a single-column panel; reads like a directory', '4-5 services on a hub page'),
		],
		design(spec) {
			const count = clampCount(SECTION_META['tabs-showcase'].items!.count, spec.items)
			return { props: {}, rows: { items: range(count).map(() => ({ points: range(3).map(() => ({})) })) }, links: [] }
		},
	},

	chips: {
		type: 'chips',
		ai: 'when',
		needs: ['ticker-items'],
		roles: ['proof'],
		h1: false,
		purpose: 'A compact labelled strip of short items: areas served or specialties.',
		pages: ['area', 'home', 'about', 'service', 'contact'],
		items: { list: 'items', count: { min: 4, max: 12, ideal: 6 } },
		slots: [slot('label', 'label', 24, { guide: 'names what the listed names are (they are under builderPlaces): areas served, or services' })],
		tweaks: [],
		surfaces: ['plain', 'soft'],
		placement: 'at most one per page (it is bare, so one strip gets a full section of padding)',
		variants: [
			variant('solid', 'open', 'accent-tinted badges', 'service areas', { text: ['accent'] }),
			variant('outline', 'open', 'outline badges', 'specialties the owner named', { text: ['body', 'accent'] }),
			variant('inline', 'open', 'a dot-separated line of text', 'a quiet list under a hero', { text: ['body', 'accent'] }),
		],
		design(_spec, ctx) {
			// The owner's own words, one chip each; composePage centres it after a centred section.
			return { props: { items: (ctx.chips ?? ctx.ticker).slice(0, 12), align: 'left' }, links: [] }
		},
	},

	'faq-accordion': {
		type: 'faq-accordion',
		ai: 'yes',
		needs: [],
		roles: ['convert'],
		h1: false,
		purpose: 'Questions and answers in an accordion under a heading.',
		pages: 'all',
		items: { list: 'faqs', count: { min: 4, max: 8, ideal: 5 } },
		slots: [
			...heading(),
			slot('faqs[].question', 'question', 96),
			slot('faqs[].answer', 'answer', 420),
		],
		tweaks: ['marker-plus', 'marker-chevron', 'marker-check', 'marker-arrow'],
		surfaces: ['plain', 'soft', 'pattern', 'tinted'],
		placement: 'second or third from the end, before the closer',
		variants: [
			variant('split', 'open', 'heading left (1fr), questions right (1.4fr)', 'the default, after open sections', { headingBeside: true }),
			variant('stacked', 'open', 'a centred heading, questions in a narrow column', 'after a heading-beside section; contact pages'),
			variant('boxed', 'card', 'like stacked, each question in its own bordered box', 'after open sections; FAQ pages', { openAlternative: 'stacked' }),
		],
		design(spec, ctx) {
			const rule = SECTION_META['faq-accordion'].items!.count
			// Five on home and service pages; six to eight per group on the FAQ page.
			const count = archetypeOf(ctx) === 'faq' ? clampCount({ ...rule, min: 6 }, spec.items) : clampCount(rule, spec.items)
			const tweak = (['plus', 'chevron', 'check', 'arrow'] as const).find((marker) => has(spec, `marker-${marker}`))
			return {
				props: { marker: tweak ?? personality(ctx).faqMarker, openFirst: true },
				rows: { faqs: range(count).map(() => ({})) },
				links: [],
			}
		},
	},

	'split-cta': {
		type: 'split-cta',
		ai: 'yes',
		needs: [],
		roles: ['closer', 'convert'],
		h1: false,
		purpose: 'Two paths side by side, each with its own heading and button: ready now, or still deciding.',
		pages: ['home', 'services', 'service', 'area', 'about', 'work', 'reviews', 'pricing', 'faq', 'landing', 'process', 'article', 'custom'],
		items: { list: 'paths', count: { min: 2, max: 2, ideal: 2, allowed: [2] } },
		slots: [
			slot('paths[].eyebrow', 'eyebrow', 24),
			slot('paths[].title', 'subhead', 50),
			slot('paths[].body', 'paragraph', 180),
			slot('paths[].cta', 'button', 22),
		],
		tweaks: [],
		// brand only for rows, and only when the palette's brand scheme keeps s400 at 4.5 (section 8.8).
		surfaces: ['plain', 'soft', 'tinted', 'inverse', 'brand'],
		variants: [
			variant('cards', 'card', 'two glass cards, the featured one accent', 'two audiences ("Need it fixed today" / "Planning ahead")'),
			variant('divided', 'panel', 'one bordered box split by a rule, the featured side tinted', 'a quieter two-path close'),
			variant('rows', 'open', 'two full-width ruled rows, the button on the right', 'on a band surface', { text: ['heading', 's400', 'accent'] }),
		],
		design(_spec, ctx) {
			const first = ctx.primary.href
			// The phone when the brand is call-led, else the archetype's secondary target.
			const second = (callLed(ctx) ? phoneTarget(ctx) : null) ?? secondaryOf(ctx) ?? phoneTarget(ctx) ?? emailTarget(ctx) ?? anotherPage(ctx)
			return {
				props: {},
				rows: {
					paths: [
						{ href: first, featured: true, style: 'primary', ...targetIcon(first) },
						outline(second.href),
					],
				},
				links: [
					{ slot: 'paths.0.cta', href: first, meaning: primaryMeaning(ctx) },
					{ slot: 'paths.1.cta', href: second.href, meaning: `secondary: ${second.meaning}` },
				],
			}
		},
	},

	'cta-band': {
		type: 'cta-band',
		ai: 'yes',
		needs: [],
		roles: ['closer'],
		h1: false,
		purpose: 'The closing call to action: a plain-text headline, one line and up to two buttons.',
		pages: ['home', 'services', 'service', 'area', 'about', 'work', 'reviews', 'pricing', 'faq', 'landing', 'process', 'article', 'custom'],
		slots: [
			// `title` is a text field (schema.ts:770): brackets would print literally.
			slot('title', 'heading', 60, { guide: 'plain text, no brackets' }),
			slot('description', 'paragraph', 200),
			slot('actions[].label', 'button', 24),
		],
		tweaks: ['one-button'],
		// inverse-glow and brand on centered only (section 7.3 rule 12).
		surfaces: ['plain', 'soft', 'inverse', 'inverse-glow', 'brand'],
		variants: [
			variant('card', 'card', 'an accent glass panel, left-aligned from tablet up', 'the default closer on a plain page', { openAlternative: 'centered' }),
			variant('centered', 'open', 'no card; a centred heading and buttons', 'on a brand or inverse band, or after a card-heavy section', { text: ['heading', 'body'] }),
			variant('split', 'card', 'a glass card, copy left and buttons right', 'a crisp closer on service pages'),
		],
		design(spec, ctx) {
			// Always fully written: the component defaults are the agency's own pitch (primitives.tsx:405-411).
			const first = ctx.primary.href
			const actions: Record<string, unknown>[] = [{ href: first, style: 'primary', ...targetIcon(first) }]
			const links: DesignOutput['links'] = [{ slot: 'actions.0.label', href: first, meaning: primaryMeaning(ctx) }]
			const second = has(spec, 'one-button') ? null : phoneTarget(ctx) ?? secondaryOf(ctx)
			if (second) {
				actions.push(outline(second.href))
				links.push({ slot: 'actions.1.label', href: second.href, meaning: `secondary: ${second.meaning}` })
			}
			return { props: {}, rows: { actions }, links }
		},
	},

	// ------------------------------------------------------------------ content
	'prose-block': {
		type: 'prose-block',
		ai: 'when',
		needs: [],
		roles: ['content'],
		h1: false,
		purpose: 'Long-form body copy with headings and lists, at a readable measure.',
		pages: ['about', 'article', 'custom'],
		slots: [slot('body', 'prose', 6000)],
		tweaks: [],
		surfaces: ['plain'],
		variants: [
			variant('plain', 'open', 'body copy at a readable measure', 'an about story, a guide'),
			variant('ruled', 'open', 'a rule above each heading', 'longer articles with several sections'),
			variant('marked', 'open', 'an accent left border on headings', 'articles and guides'),
		],
		design() {
			return { props: { align: 'left', textAlign: 'left' }, links: [] }
		},
	},

	callout: {
		type: 'callout',
		ai: 'yes',
		needs: [],
		roles: ['content'],
		h1: false,
		purpose: 'A short aside pulled out of the surrounding copy, with a label.',
		pages: ['about', 'service', 'article', 'pricing'],
		slots: [
			slot('label', 'label', 24),
			slot('body', 'prose', 400, { guide: 'one or two short paragraphs as <p>; no lists or headings' }),
			// An unset icon falls back to Info (content.tsx:104), so it is always written.
			slot('icon', 'icon', 40, { variants: ['card', 'banner'] }),
		],
		tweaks: ['full-width'],
		surfaces: ['plain'],
		variants: [
			variant('card', 'card', 'an accent glass card with an icon and a label badge', 'a key takeaway'),
			variant('rule', 'open', 'an accent left rule with an eyebrow label, no icon', 'a quiet aside inside prose', { hides: ['icon'] }),
			variant('banner', 'panel', 'an accent-tinted box with an inline "Label:"', 'a note or reassurance'),
		],
		design(spec) {
			return { props: { align: has(spec, 'full-width') ? 'full' : 'left' }, links: [] }
		},
	},

	'check-list': {
		type: 'check-list',
		ai: 'yes',
		needs: [],
		roles: ['explain', 'convert'],
		h1: false,
		purpose: 'An icon-led list of inclusions or deliverables, with no heading of its own.',
		pages: ['service', 'pricing', 'landing', 'home', 'contact'],
		items: {
			list: 'items',
			count: { min: 3, max: 8, ideal: 6 },
			byVariant: {
				columns: { min: 4, max: 8, ideal: 6, allowed: [4, 6, 8] },
				inline: { min: 3, max: 4, ideal: 4 },
				stacked: { min: 3, max: 6, ideal: 4 },
			},
		},
		slots: [
			slot('items[]', 'item', 90, { variants: ['columns', 'stacked'] }),
			slot('items[]', 'item', 40, { variants: ['inline'] }),
		],
		tweaks: [],
		surfaces: ['plain', 'soft'],
		placement: 'directly after the section whose heading it completes (it has no heading)',
		variants: [
			variant('columns', 'open', 'a two-column list', 'what is included', { text: ['body', 'accent'] }),
			variant('inline', 'open', 'a wrapped row of very short items', 'a quick line of reassurances under a hero or a step', { text: ['body', 'accent'] }),
			variant('stacked', 'open', 'a vertical list', 'a short list of deliverables', { text: ['body', 'accent'] }),
		],
		design(spec, ctx) {
			const count = clampCount(countFor(SECTION_META['check-list'].items, spec.variant)!, spec.items)
			return { props: { items: range(count).map(() => ''), icon: personality(ctx).checkIcon }, links: [] }
		},
	},

	// ------------------------------------------------------------------ media
	'media-gallery': {
		type: 'media-gallery',
		ai: 'when',
		needs: ['photo'],
		roles: ['showcase'],
		h1: false,
		purpose: 'A lead photo with a strip of thumbnails (or a carousel) under a heading.',
		pages: ['work', 'home', 'about', 'service'],
		items: { list: 'items', count: { min: 4, max: 8, ideal: 4 } },
		images: [{ path: 'items[].src', role: 'gallery', aspect: 'any', required: true }],
		slots: [
			...heading(),
			slot('items[].alt', 'alt', 120),
			slot('items[].caption', 'caption', 110),
		],
		tweaks: [],
		surfaces: ['plain', 'soft', 'inverse'],
		variants: [
			variant('bottom', 'media', 'a 16:9 lead photo with a thumbnail strip below', 'the default gallery', { text: [...DEFAULT_TEXT, 's500'] }),
			variant('side', 'media', 'a thumbnail column beside the lead photo', 'a wide page with many photos', { text: [...DEFAULT_TEXT, 's500'] }),
			variant('top', 'media', 'the thumbnail strip above the lead photo', 'after a section that ends low', { text: [...DEFAULT_TEXT, 's500'] }),
			variant('carousel', 'media', 'arrows and dots, no strip', 'a calm gallery that shows one photo at a time', { text: [...DEFAULT_TEXT, 's500'] }),
		],
		design(spec) {
			const count = clampCount(SECTION_META['media-gallery'].items!.count, spec.items)
			return { props: {}, rows: { items: range(count).map(() => ({})) }, links: [] }
		},
	},

	'media-mosaic': {
		type: 'media-mosaic',
		ai: 'when',
		needs: ['photo'],
		roles: ['showcase', 'proof'],
		h1: false,
		purpose: 'Five photos in a mosaic: one large lead and four smaller, each opening a lightbox.',
		pages: ['home', 'work', 'about'],
		items: { list: 'items', count: { min: 5, max: 5, ideal: 5, allowed: [5] } },
		images: [{ path: 'items[].src', role: 'gallery', aspect: 'any', required: true }],
		slots: [...heading(), slot('items[].caption', 'caption', 100)],
		tweaks: [],
		surfaces: ['plain', 'soft', 'inverse'],
		variants: [variant('default', 'media', 'a 2×2 lead photo with four smaller ones; every photo opens a lightbox', "the owner's best project photos")],
		design() {
			return { props: {}, rows: { items: range(5).map(() => ({})) }, links: [] }
		},
	},

	figure: {
		type: 'figure',
		ai: 'when',
		needs: ['photo'],
		roles: ['content'],
		h1: false,
		purpose: 'One captioned photo inside long-form copy.',
		pages: ['article', 'about'],
		images: [{ path: 'src', role: 'feature', aspect: '16:9', required: true }],
		slots: [slot('alt', 'alt', 120), slot('caption', 'caption', 140)],
		tweaks: ['full-width'],
		surfaces: ['plain'],
		variants: [
			variant('below', 'media', 'the caption under the photo', 'the default inside an article', { text: ['s500'] }),
			variant('framed', 'card', 'photo and caption in a glass card', 'a photo that needs a frame', { text: ['s500'] }),
			variant('beside', 'media', 'the caption in a narrow column to the left', 'an editorial aside', { text: ['s500'] }),
		],
		design(spec) {
			return { props: { align: has(spec, 'full-width') ? 'full' : 'center' }, links: [] }
		},
	},

	'image-compare': {
		type: 'image-compare',
		ai: 'when',
		needs: ['photo-pair'],
		roles: ['proof', 'showcase'],
		h1: false,
		purpose: 'A drag slider wiping between a before photo and an after photo of the same job.',
		pages: ['work', 'service', 'home'],
		images: [
			{ path: 'before.src', role: 'pair', aspect: 'any', required: true },
			{ path: 'after.src', role: 'pair', aspect: 'any', required: true },
		],
		slots: [
			...heading(),
			slot('before.alt', 'alt', 120),
			slot('before.label', 'label', 16),
			slot('after.alt', 'alt', 120),
			slot('after.label', 'label', 16),
			slot('points[].text', 'item', 90, { tweak: 'points' }),
		],
		tweaks: ['points'],
		surfaces: ['plain', 'soft'],
		variants: [
			variant('stacked', 'media', 'copy above the slider', 'the default'),
			variant('text-left', 'media', 'copy left, slider right', 'with points beside the comparison'),
			variant('text-right', 'media', 'slider left, copy right', 'a second comparison on the same site'),
		],
		design(spec) {
			// Both srcs are written together by the image step: setting any before.* key
			// replaces the whole default object (media.tsx:582-604).
			return { props: {}, rows: { points: range(has(spec, 'points') ? 3 : 0).map(() => ({})) }, links: [] }
		},
	},

	// ------------------------------------------------------------------ collections
	grid: {
		type: 'grid',
		ai: 'yes',
		needs: [],
		roles: ['explain', 'showcase', 'proof'],
		h1: false,
		purpose: 'A heading above (or beside) a grid of cards: features, owner reviews, links to pages or photos.',
		pages: 'all',
		children: {
			kinds: [
				'feature-card:card', 'feature-card:inline', 'feature-card:numbered',
				'testimonial-card:card', 'testimonial-card:bare',
				'related-card:list', 'related-card:card',
				'media-card:card', 'media-card:overlay', 'media-card:bare',
			],
			default: 'feature-card:card',
		},
		items: { list: 'children', count: { min: 2, max: 8, ideal: 3, allowed: [2, 3, 4, 6, 8] }, byVariant: { beside: { min: 4, max: 6, ideal: 4, allowed: [4, 6] } } },
		slots: heading(),
		tweaks: ['cols-2', 'cols-3', 'cols-4'],
		surfaces: ['plain', 'soft', 'tinted', 'wash', 'pattern', 'inverse'],
		variants: [
			variant('centered', 'card', 'a centred heading above the cards', 'the default'),
			variant('above', 'card', 'a left heading above the cards', 'after a centred section'),
			variant('beside', 'card', 'a sticky heading in a side column, the cards in two columns', '4-6 short items, such as a services list on the home page', { headingBeside: true }),
		],
		design(spec, ctx) {
			const kind = childKind(spec, 'grid')
			const rule = countFor(SECTION_META.grid.items, spec.variant)!
			const allowed = rule.allowed ?? [rule.min]
			const childType = kind.split(':')[0]
			let children: NonNullable<DesignOutput['children']>
			if (childType === 'testimonial-card') {
				// Quotes need room: at most three columns, so never eight cards.
				const fits = spec.variant === 'beside' ? [4, 6] : [2, 3, 4, 6]
				const reviews = spec.reviews.slice(0, fitDown(spec.reviews.length, fits))
				children = reviews.map((review) => ({ kind, props: reviewProps(review) }))
			} else if (childType === 'related-card') {
				const targets = relatedTargets(ctx)
				// One card per real page; a list of links reads fine with any count.
				const count = kind === 'related-card:list' ? Math.min(targets.length, 8) : fitDown(Math.min(targets.length, 6), [3, 4, 6])
				children = targets.slice(0, count).map((page) => ({ kind, props: { title: page.name, href: page.path } }))
			} else if (childType === 'media-card') {
				const count = clampCount(rule, spec.items)
				const placed = spec.images.length ? fitDown(Math.min(count, spec.images.length), allowed) : count
				children = range(placed).map(() => ({ kind, props: {} }))
			} else {
				children = range(clampCount(rule, spec.items)).map(() => ({ kind, props: {} }))
			}
			return { props: { columns: String(gridColumns(spec, kind, children.length)) }, children, links: [] }
		},
	},

	masonry: {
		type: 'masonry',
		ai: 'when',
		needs: [],
		roles: ['proof', 'showcase'],
		h1: false,
		purpose: "Columns where each card keeps its own height: the owner's reviews or photos.",
		pages: ['home', 'reviews', 'work', 'service', 'area'],
		children: {
			kinds: ['testimonial-card:card', 'testimonial-card:bare', 'media-card:bare', 'media-card:card', 'media-card:overlay'],
			default: 'testimonial-card:card',
		},
		items: { list: 'children', count: { min: 3, max: 12, ideal: 6 } },
		slots: heading(60, 200, { variants: ['centered', 'above'] }),
		tweaks: [],
		surfaces: ['plain', 'soft', 'inverse'],
		variants: [
			variant('centered', 'card', 'a centred heading above the columns', 'the reviews page'),
			variant('above', 'card', 'a left heading above the columns', 'photos on a work page'),
			variant('bare', 'card', 'no heading', 'only when the previous section introduces it', { hides: ['eyebrow', 'title', 'description'] }),
		],
		design(spec) {
			const kind = childKind(spec, 'masonry')
			let children: NonNullable<DesignOutput['children']>
			if (kind.startsWith('testimonial-card')) {
				children = spec.reviews.slice(0, 9).map((review) => ({ kind, props: reviewProps(review) }))
			} else {
				const count = Math.min(Math.max(clampCount(SECTION_META.masonry.items!.count, spec.items), 6), 12)
				const placed = spec.images.length ? Math.min(count, spec.images.length) : count
				children = range(placed).map(() => ({ kind, props: { natural: true } }))
			}
			return { props: { columns: children.length >= 5 ? '3' : '2' }, children, links: [] }
		},
	},

	carousel: {
		type: 'carousel',
		ai: 'when',
		needs: [],
		roles: ['proof', 'showcase'],
		h1: false,
		purpose: "A horizontal track of cards: the owner's reviews or photos.",
		pages: ['home', 'reviews', 'service', 'work'],
		children: {
			kinds: ['testimonial-card:card', 'testimonial-card:bare', 'media-card:card', 'media-card:overlay'],
			default: 'testimonial-card:card',
		},
		items: { list: 'children', count: { min: 1, max: 12, ideal: 4 } },
		slots: heading(),
		tweaks: ['size-md', 'size-lg', 'size-full'],
		surfaces: ['plain', 'soft', 'inverse'],
		variants: [
			variant('bars', 'card', 'progress bars, arrows always visible', 'the default for testimonials'),
			variant('below', 'card', 'dots, arrows on hover only (invisible on touch)', '4 or more items'),
			variant('overlay', 'card', 'edge arrows over the track', 'photos'),
		],
		design(spec) {
			let kind = childKind(spec, 'carousel')
			let children: NonNullable<DesignOutput['children']>
			let size: string
			if (kind.startsWith('testimonial-card')) {
				const reviews = spec.reviews.slice(0, 12)
				// One review is a single featured quote: full width, no card.
				if (reviews.length === 1) kind = 'testimonial-card:bare'
				size = reviews.length === 1 ? 'full' : reviews.length === 2 ? 'lg' : 'md'
				children = reviews.map((review) => ({ kind, props: reviewProps(review) }))
			} else {
				const count = Math.min(Math.max(clampCount(SECTION_META.carousel.items!.count, spec.items), 4), 10)
				const placed = spec.images.length ? Math.min(count, spec.images.length) : count
				size = 'lg'
				children = range(placed).map(() => ({ kind, props: {} }))
			}
			const tweak = (['md', 'lg', 'full'] as const).find((value) => has(spec, `size-${value}`))
			// `label`, the accessible name, is the written title without brackets (set by applySlots).
			return { props: { size: tweak ?? size }, children, links: [] }
		},
	},

	marquee: {
		type: 'marquee',
		ai: 'when',
		needs: ['ticker-items'],
		roles: ['proof'],
		h1: false,
		purpose: 'An endless scrolling strip of service or area names under a short label.',
		pages: ['home', 'services', 'about'],
		children: { kinds: ['client-logo:wordmark'], default: 'client-logo:wordmark' },
		items: { list: 'children', count: { min: 6, max: 12, ideal: 8 } },
		slots: [slot('eyebrow', 'eyebrow', 28, { guide: 'a short label for the strip, e.g. what the names are' })],
		tweaks: [],
		surfaces: ['plain', 'soft', 'tinted', 'inverse'],
		variants: [
			variant('inline', 'open', 'a label beside an endless strip', 'a services ticker under the hero', { text: ['accent', 's500'] }),
			variant('rule', 'open', 'a label above a hairline', 'between two heavier sections', { text: ['accent', 's500'] }),
			variant('centered', 'open', 'a label centred above the strip', 'after a centred section', { text: ['accent', 's500'] }),
		],
		design(_spec, ctx) {
			// Names are services or areas, never a client's name; `src` is never set.
			const children = ctx.ticker.slice(0, 12).map((name) => ({ kind: 'client-logo:wordmark' as const, props: { name } }))
			return { props: {}, children, links: [] }
		},
	},

	// ------------------------------------------------------------------ states and facts
	'detail-card': {
		type: 'detail-card',
		ai: 'when',
		needs: ['contact-facts'],
		roles: ['convert', 'proof'],
		h1: false,
		purpose: 'Contact facts (phone, email, address, hours, areas, prices) beside one button.',
		pages: ['contact', 'home', 'service', 'area', 'landing', 'pricing'],
		items: {
			list: 'details',
			count: { min: 2, max: 6, ideal: 4 },
			byVariant: {
				card: { min: 2, max: 5, ideal: 4 },
				rows: { min: 2, max: 6, ideal: 4 },
				inline: { min: 4, max: 4, ideal: 4, allowed: [4] },
			},
		},
		slots: [
			...heading(),
			slot('action.label', 'button', 24),
			slot('note', 'short', 120, { tweak: 'with-note', guide: 'one reassurance line under the button; no invented facts' }),
		],
		tweaks: ['with-note'],
		surfaces: ['plain', 'soft', 'tinted'],
		variants: [
			variant('card', 'card', 'copy left; an accent panel of facts with a full-width button right', 'contact pages', { headingBeside: true, text: [...DEFAULT_TEXT, 's500'] }),
			variant('rows', 'open', 'full-width ruled fact rows, a centred button below', 'visit and hours pages', { text: [...DEFAULT_TEXT, 's500'] }),
			variant('inline', 'open', 'four facts across the top like a stat row', 'under the hero on a storefront home page', { text: [...DEFAULT_TEXT, 's500'] }),
		],
		design(spec, ctx) {
			const count = Math.min(clampCount(countFor(SECTION_META['detail-card'].items, spec.variant)!, spec.items || ctx.contactFacts.length), ctx.contactFacts.length)
			const target = ctx.phone ?? ctx.email
			const href = target ? target.href : ctx.primary.href
			// showNote false kills the placeholder note (states.tsx:11-27).
			return {
				props: {
					action: { href, style: 'primary', ...targetIcon(href) },
					showNote: has(spec, 'with-note'),
				},
				rows: { details: ctx.contactFacts.slice(0, count).map(({ label, value }) => ({ label, value })) },
				links: [{ slot: 'action.label', href, meaning: ctx.phone ? `call ${ctx.phone.display}` : ctx.email ? `email ${ctx.email.display}` : primaryMeaning(ctx) }],
			}
		},
	},

	'table-of-contents': {
		type: 'table-of-contents',
		ai: 'when',
		needs: ['prose-headings'],
		roles: ['content'],
		h1: false,
		purpose: "A list of the article's section headings that tracks the reader's place.",
		pages: ['article'],
		slots: [slot('title', 'label', 30, { guide: 'a short title, e.g. In this guide' })],
		tweaks: [],
		surfaces: ['plain'],
		placement: 'directly before the prose block',
		variants: [
			variant('rail', 'open', 'a left rule with an active marker', 'the default', { text: ['heading', 's500', 'accent'] }),
			variant('numbered', 'open', '01, 02… prefixes', 'step-by-step guides', { text: ['heading', 's500', 'accent'] }),
			variant('card', 'card', 'inside a glass card', 'a guide with a strong opener', { text: ['heading', 's500', 'accent'] }),
		],
		design() {
			// The entries are the <h2> texts of the prose that follows, filled after writing
			// (applySlots), so the anchors always match (navigation.tsx:258).
			return { props: {}, rows: { items: [] }, links: [] }
		},
	},

	// ------------------------------------------------------------------ never in v1 (section 6.10)
	'contact-split': never('contact-split', 'Its form slot renders "Form slot: drop the contact form component in here" (convert.tsx:199-203); unlocks with a forms backend.', ['form']),
	'lead-capture': never('lead-capture', 'It validates, then sends nothing (convert.tsx:485-502); unlocks with a forms backend.', ['form']),
	'auth-panel': never('auth-panel', 'A placeholder form and a sample quote (states.tsx:205-342); never for marketing sites.', ['form']),
	'logo-strip': never('logo-strip', 'Without real logos it shows fictional brands (proof.tsx:124); unlocks with owner-marked client logos.', ['client-logos']),
	'comparison-table': never('comparison-table', 'Competitor claims and booleans the AI would invent; unlocks with an owner-supplied plan matrix.', ['comparison']),
	'author-bio': never('author-bio', "A real person's name, bio and photo; unlocks with owner-entered people.", ['people']),
	'video-player': never('video-player', 'Needs a video file; the library holds images only.', ['video']),
	'roi-calculator': never('roi-calculator', 'Its formulas are claims; unlocks with an owner-built calculator.', ['calculator']),
	'collection-page': never('collection-page', 'Hand-authored children, a cosmetic filter bar and pager (collections.tsx:238-317); unlocks with real articles or projects.', ['articles', 'projects']),
	countdown: never('countdown', 'Static numbers that go stale (states.tsx:128-195); unlocks with a deadline and a live timer.', ['deadline']),
	breadcrumbs: never('breadcrumbs', 'Flat slugs have no hierarchy, and one line gets a full section of padding (render.tsx:61-62).', []),
	'pricing-tiers': never('pricing-tiers', 'Needs three owner packages with names, prices and features; no structured price input exists.', ['prices']),
	notice: never('notice', 'A thank-you state that only makes sense after a form submits; its default steps leak (states.tsx:349-353).', ['form']),
}

/** The container's child kind: the planned one when the container accepts it, else its default. */
export function childKind(spec: Pick<ComposeSpec, 'child'>, type: string) {
	const kinds = SECTION_META[type]?.children
	if (!kinds) return spec.child ?? 'feature-card:card'
	return spec.child && kinds.kinds.includes(spec.child) ? spec.child : kinds.default
}

/** A string cut at the last word boundary that fits, without trailing punctuation. */
export function clampWords(value: string, max: number): string {
	const text = String(value ?? '').replace(/\s+/g, ' ').trim()
	if (text.length <= max) return text
	const cut = text.slice(0, max + 1)
	const space = cut.lastIndexOf(' ')
	return (space > 0 ? cut.slice(0, space) : text.slice(0, max)).replace(/[\s,;:.\-–—]+$/, '')
}

/** Planner-facing notes on what satisfies a section's needs (catalogText). */
export const NEED_NOTES: Record<string, string> = {
	'split-hero': 'photo (1 landscape; fan needs 5 more)',
	'stat-hero': 'facts (exactly 4, or exactly 2)',
	'announcement-bar': 'announcement (something the owner announced: an offer, an opening, a date)',
	'stat-band': 'facts (3 or 6)',
	spotlight: 'photo (1; a panorama or wide landscape for stacked and overlap)',
	'feature-rows': 'photo (one landscape per row)',
	'tabs-showcase': 'photo (one landscape per tab)',
	chips: 'ticker-items (4-12 areas or specialties)',
	'media-gallery': 'photo (4-8)',
	'media-mosaic': 'photo (exactly 5; the first landscape or square)',
	figure: 'photo (1 landscape)',
	'image-compare': 'photo-pair (a before and an after photo of the same job)',
	grid: 'per child: reviews for testimonial cards, photos for media cards, other pages for related cards',
	masonry: 'reviews (3-9, testimonial children) or photos (6-12, media children)',
	carousel: 'reviews (1-12, testimonial children) or photos (4-10, media children)',
	marquee: 'ticker-items (6-12 services or areas)',
	'detail-card': 'contact-facts (at least 2 of phone, email, address, hours, areas, prices)',
	'table-of-contents': 'prose-headings (at least 3 <h2> in the prose block right after it)',
}

/** Planner-facing notes for lists that code fills from owner data (catalogText). */
export const ITEM_NOTES: Record<string, string> = {
	'page-hero': '0 (with hero-stats, up to three facts are shown)',
	'bento-grid': '4 or 6; 4, 6 or 8 with cols-4',
	'stat-hero': '4 or 2 (one per fact)',
	'stat-band': '3 or 6 (one per fact)',
	chips: 'one per area or specialty (4-12)',
	marquee: 'one per service or area (6-12)',
	'detail-card': 'card 2-5 · rows 2-6 · inline exactly 4 (one per contact fact)',
	'table-of-contents': '0 (built from the prose headings)',
	grid: 'children: 2 columns 2, 4 or 6 · 3 columns 3 or 6 · 4 columns 4 or 8 · beside 4 or 6; testimonial children one per review, related children one per page',
	masonry: 'one per review (3-9) or photo (6-12)',
	carousel: 'one per review (1-12) or photo (4-10)',
}
