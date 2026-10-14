/**
 * The vocabulary page templates are written in: one small function per section,
 * taking that section's copy. Every prop key here is a field key from schema.ts;
 * `scripts/prove-builder-templates.cjs` checks each template against the schema,
 * so a typo cannot silently fall back to a section's placeholder copy.
 *
 * Template copy is generic on purpose: it reads like a real page for a typical
 * business and is meant to be edited. Testimonials and client logos are clearly
 * marked as samples, because a template must never publish a review nobody gave.
 */
import type { Block } from '../types'
import type { TemplateCategoryId } from '../template-categories'

type Props = Record<string, unknown>

let counter = 0

/** Unset copy means "use the section's own", so undefined keys are dropped at every depth. */
function clean(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(clean)
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {}
		for (const [key, inner] of Object.entries(value)) {
			if (inner !== undefined) out[key] = clean(inner)
		}
		return out
	}
	return value
}

export function block(
	type: string,
	variant?: string,
	props?: Props,
	children?: Block[],
): Block {
	const out: Block = { id: `seed_${(counter++).toString(36)}`, type }
	if (variant) out.variant = variant
	if (props) {
		const kept = clean(props) as Props
		if (Object.keys(kept).length) out.props = kept
	}
	if (children) out.children = children
	return out
}

export type PageTemplate = {
	slug: string
	name: string
	description: string
	category: TemplateCategoryId
	/** What the new page is called (and its slug), unless the person typed one. */
	pageName?: string
	/** Extra words the search box matches. */
	keywords: string[]
	blocks: Block[]
}

export function page(
	category: TemplateCategoryId,
	slug: string,
	name: string,
	description: string,
	blocks: Block[],
	options: { pageName?: string; keywords?: string[] } = {},
): PageTemplate {
	return {
		slug,
		name,
		description,
		category,
		...(options.pageName ? { pageName: options.pageName } : {}),
		keywords: options.keywords ?? [],
		blocks,
	}
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

export type Action = {
	label: string
	href: string
	style?: 'primary' | 'outline' | 'secondary' | 'ghost' | 'link'
	icon?: string
	iconPosition?: 'before' | 'after'
}

/** The main button: solid, with an arrow after the label. */
export const go = (label: string, href: string): Action => ({
	label,
	href,
	icon: 'ArrowRight',
	iconPosition: 'after',
})

/** The secondary button: outlined, no icon. */
export const alt = (label: string, href: string): Action => ({
	label,
	href,
	style: 'outline',
})

type Stat = [value: string, label: string]
const stats = (rows: Stat[]) => rows.map(([value, label]) => ({ value, label }))

type Pair = [title: string, body: string, icon?: string]

type Heading = { eyebrow?: string; title?: string; description?: string }

/* -------------------------------------------------------------------------- */
/* Entry                                                                      */
/* -------------------------------------------------------------------------- */

type HeroCopy = {
	eyebrow?: string
	title: string
	description?: string
	actions?: Action[]
}

export const pageHero = (
	variant: 'left' | 'centered' | 'compact',
	copy: HeroCopy & { stats?: Stat[] },
) =>
	block('page-hero', variant, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		actions: copy.actions,
		stats: copy.stats ? stats(copy.stats) : undefined,
	})

export const splitHero = (
	variant: 'split' | 'reversed',
	copy: HeroCopy & { mediaLabel?: string },
) =>
	block('split-hero', variant, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		actions: copy.actions,
		mediaLabel: copy.mediaLabel,
	})

export const statHero = (
	variant: 'cards' | 'divided' | 'centered',
	copy: Omit<HeroCopy, 'actions'> & {
		stats: Stat[]
		link?: { label: string; href: string }
	},
) =>
	block('stat-hero', variant, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		stats: stats(copy.stats),
		showLink: Boolean(copy.link),
		linkLabel: copy.link?.label,
		linkHref: copy.link?.href,
	})

export const announcement = (
	variant: 'strip' | 'badge' | 'floating' | 'ticker',
	copy: { message: string; badge?: string; linkLabel?: string; href?: string },
) =>
	block('announcement-bar', variant, {
		message: copy.message,
		badge: copy.badge,
		linkLabel: copy.linkLabel,
		href: copy.href,
		align: 'center',
	})

export const breadcrumbs = (items: [label: string, href: string][]) =>
	block('breadcrumbs', 'chevron', {
		items: items.map(([label, href]) => ({ label, href })),
	})

/* -------------------------------------------------------------------------- */
/* Proof                                                                      */
/* -------------------------------------------------------------------------- */

export const statBand = (variant: 'row' | 'cards' | 'divided', rows: Stat[]) =>
	block('stat-band', variant, { stats: stats(rows) })

/** Logo slots, named so nobody mistakes them for real clients. */
export const logoStrip = (variant: 'card' | 'bare' | 'grid', eyebrow: string) =>
	block('logo-strip', variant, {
		eyebrow,
		logos: Array.from({ length: 6 }, () => ({ name: 'Client logo' })),
	})

export const marquee = (
	variant: 'centered' | 'rule' | 'inline',
	eyebrow: string,
	count = 7,
) =>
	block(
		'marquee',
		variant,
		{ eyebrow },
		Array.from({ length: count }, () =>
			block('client-logo', undefined, { name: 'Client logo' }),
		),
	)

export const spotlight = (
	variant: 'split' | 'stacked' | 'overlap',
	copy: {
		eyebrow?: string
		title: string
		summary: string
		details?: [label: string, value: string][]
		actions?: Action[]
		mediaLabel?: string
	},
) =>
	block('spotlight', variant, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		summary: copy.summary,
		details: copy.details?.map(([label, value]) => ({ label, value })),
		actions: copy.actions,
		mediaLabel: copy.mediaLabel,
	})

export const beforeAfter = (
	variant: 'columns' | 'rows' | 'stacked',
	copy: {
		eyebrow?: string
		title: string
		beforeLabel: string
		afterLabel: string
		before: string[]
		after: string[]
	},
) =>
	block('before-after', variant, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		beforeLabel: copy.beforeLabel,
		afterLabel: copy.afterLabel,
		before: copy.before.map((text) => ({ text, icon: 'X' })),
		after: copy.after.map((text) => ({ text, icon: 'Check' })),
	})

/* -------------------------------------------------------------------------- */
/* Explain                                                                    */
/* -------------------------------------------------------------------------- */

export const featureRows = (
	layout: 'alternating' | 'cards' | 'stacked',
	rows: {
		eyebrow?: string
		title: string
		description: string
		points?: string[]
	}[],
) =>
	block('feature-rows', layout, {
		rows: rows.map((row, index) => ({
			eyebrow: row.eyebrow,
			title: row.title,
			description: row.description,
			points: row.points?.map((text) => ({ text, icon: 'Check' })),
			mediaSide: index % 2 === 0 ? 'right' : 'left',
		})),
	})

export const processSteps = (
	layout: 'cards' | 'timeline' | 'columns',
	copy: {
		eyebrow?: string
		title: string
		description?: string
		steps: [title: string, summary: string, detail?: string[]][]
	},
) =>
	block('process-steps', layout, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		numberStyle: 'outline',
		steps: copy.steps.map(([title, summary, detail], index) => ({
			number: String(index + 1).padStart(2, '0'),
			title,
			summary,
			...(detail ? { detail: detail.map((text) => ({ text, icon: 'Check' })) } : {}),
		})),
	})

export const bento = (
	tileStyle: 'accent' | 'divided' | 'numbered',
	copy: {
		eyebrow?: string
		title: string
		description?: string
		/** Spans should total a multiple of three. */
		tiles: [title: string, blurb: string, icon: string, span?: '1' | '2' | '3'][]
	},
) =>
	block('bento-grid', tileStyle, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		columns: '3',
		tiles: copy.tiles.map(([title, blurb, icon, span]) => ({
			title,
			blurb,
			icon,
			span: span ?? '1',
		})),
	})

export const tabsShowcase = (
	tabStyle: 'pills' | 'underline' | 'side',
	copy: {
		eyebrow?: string
		title: string
		description?: string
		items: { label: string; title: string; body: string; points?: string[] }[]
	},
) =>
	block('tabs-showcase', tabStyle, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		items: copy.items.map((item) => ({
			label: item.label,
			title: item.title,
			body: item.body,
			points: item.points?.map((text) => ({ text, icon: 'Check' })),
		})),
	})

/** The first column is the recommended one; each row lists a yes/no per column. */
export const comparison = (
	tableStyle: 'accent' | 'rules' | 'zebra',
	copy: {
		eyebrow?: string
		title: string
		description?: string
		columns: string[]
		rows: [label: string, ...values: boolean[]][]
	},
) =>
	block('comparison-table', tableStyle, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		columns: copy.columns,
		highlight: 0,
		rows: copy.rows.map(([label, ...values]) => ({ label, values })),
	})

export const chips = (
	variant: 'outline' | 'solid' | 'inline',
	label: string,
	items: string[],
) => block('chips', variant, { label, align: 'center', items })

/* -------------------------------------------------------------------------- */
/* Convert                                                                    */
/* -------------------------------------------------------------------------- */

export const faq = (
	layout: 'split' | 'stacked' | 'boxed',
	copy: {
		eyebrow?: string
		title: string
		description?: string
		faqs: [question: string, answer: string][]
	},
) =>
	block('faq-accordion', layout, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		marker: 'plus',
		openFirst: true,
		faqs: copy.faqs.map(([question, answer]) => ({ question, answer })),
	})

export const contactSplit = (
	layout: 'split' | 'reversed' | 'stacked',
	copy: {
		eyebrow: string
		title: string
		description: string
		email?: string
		steps: Pair[]
	},
) =>
	block('contact-split', layout, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		email: copy.email,
		stepMark: 'number',
		steps: copy.steps.map(([title, body, icon]) => ({ title, body, icon })),
	})

export type Tier = {
	name: string
	price: string
	blurb: string
	features: string[]
	cta: string
	href: string
	featured?: boolean
}

export const pricingTiers = (
	design: 'cards' | 'divided' | 'banded',
	copy: {
		eyebrow?: string
		title: string
		description?: string
		tiers: Tier[]
	},
) =>
	block('pricing-tiers', design, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		tiers: copy.tiers.map((tier) => ({
			name: tier.name,
			price: tier.price,
			blurb: tier.blurb,
			features: tier.features.map((text) => ({ text, icon: 'Check' })),
			cta: tier.cta,
			href: tier.href,
			style: tier.featured ? 'primary' : 'outline',
			featured: Boolean(tier.featured),
		})),
	})

export const leadCapture = (
	design: 'card' | 'banner' | 'ruled',
	copy: {
		title: string
		description: string
		cta: string
		collect?: 'email' | 'name-email' | 'full-name-email'
		placeholder?: string
	},
) =>
	block('lead-capture', design, {
		title: copy.title,
		description: copy.description,
		cta: copy.cta,
		collect: copy.collect ?? 'email',
		placeholder: copy.placeholder ?? 'you@company.com',
	})

export const splitCta = (
	design: 'cards' | 'divided' | 'rows',
	paths: {
		eyebrow: string
		title: string
		body: string
		cta: string
		href: string
		featured?: boolean
	}[],
) =>
	block('split-cta', design, {
		paths: paths.map((path) => ({
			eyebrow: path.eyebrow,
			title: path.title,
			body: path.body,
			cta: path.cta,
			href: path.href,
			style: path.featured ? 'primary' : 'outline',
			featured: Boolean(path.featured),
		})),
	})

export const ctaBand = (
	design: 'card' | 'centered' | 'split',
	title: string,
	description: string,
	actions: Action[],
) => block('cta-band', design, { title, description, actions })

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

/** `html` is what the prose editor stores: headings, paragraphs and lists. */
export const prose = (headings: 'plain' | 'ruled' | 'marked', html: string) =>
	block('prose-block', headings, { body: html })

export const callout = (
	design: 'card' | 'rule' | 'banner',
	copy: { label: string; icon: string; html: string },
) =>
	block('callout', design, {
		label: copy.label,
		icon: copy.icon,
		body: copy.html,
	})

export const authorBio = (
	design: 'card' | 'bare' | 'centered',
	copy: { name: string; role: string; bio: string; action?: Action },
) =>
	block('author-bio', design, {
		name: copy.name,
		role: copy.role,
		bio: copy.bio,
		action: copy.action,
	})

export const checkList = (
	variant: 'stacked' | 'columns' | 'inline',
	items: string[],
	icon = 'CircleCheck',
) => block('check-list', variant, { items, icon })

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

export const videoPlayer = (
	layout: 'stacked' | 'text-left' | 'text-right' | 'player',
	copy: { eyebrow?: string; title: string; description?: string; caption?: string },
) => block('video-player', layout, copy)

export const mediaGallery = (
	thumbnails: 'bottom' | 'side' | 'top' | 'carousel',
	copy: { eyebrow?: string; title: string; description?: string },
) => block('media-gallery', thumbnails, copy)

export const mediaMosaic = (copy: {
	eyebrow?: string
	title: string
	description?: string
}) => block('media-mosaic', undefined, copy)

export const imageCompare = (
	layout: 'stacked' | 'text-left' | 'text-right',
	copy: { eyebrow?: string; title: string; description?: string; points?: string[] },
) =>
	block('image-compare', layout, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		points: copy.points?.map((text) => ({ text, icon: 'Check' })),
	})

/* -------------------------------------------------------------------------- */
/* Navigation and calculators                                                 */
/* -------------------------------------------------------------------------- */

/** A filterable, paged list: the filter bar and the pager come with it. */
export const collectionPage = (
	columns: '2' | '3' | '4',
	copy: Heading & {
		category: string
		filters: string[]
		filterStyle?: 'pills' | 'underline' | 'segmented'
		paginationStyle?: 'numbers' | 'compact' | 'spread'
	},
	children: Block[],
) =>
	block(
		'collection-page',
		columns,
		{
			eyebrow: copy.eyebrow,
			title: copy.title,
			description: copy.description,
			category: copy.category,
			showFilters: true,
			filters: copy.filters.map((label) => ({ label })),
			filterStyle: copy.filterStyle ?? 'pills',
			showPagination: true,
			page: 1,
			totalPages: 6,
			paginationStyle: copy.paginationStyle ?? 'numbers',
		},
		children,
	)

export const tableOfContents = (
	design: 'rail' | 'numbered' | 'card',
	title: string,
	labels: string[],
) =>
	block('table-of-contents', design, {
		title,
		items: labels.map((label) => ({ label })),
	})

export type CalculatorInput = {
	label: string
	suffix?: string
	value: number
	min: number
	max: number
	step: number
}
export type CalculatorOutput = {
	label: string
	/** References inputs by label, lowercased with underscores. */
	formula: string
	format: 'number' | 'currency' | 'percent' | 'hours'
	decimals?: number
	featured?: boolean
	note?: string
}

export const roiCalculator = (
	layout: 'split' | 'stacked' | 'bare',
	copy: {
		eyebrow?: string
		title: string
		description: string
		badge?: string
		inputs: CalculatorInput[]
		outputs: CalculatorOutput[]
		action: Action
		footnote?: string
	},
) =>
	block('roi-calculator', layout, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		badge: copy.badge,
		inputs: copy.inputs,
		outputs: copy.outputs.map((output) => ({
			...output,
			decimals: output.decimals ?? 0,
			featured: Boolean(output.featured),
		})),
		action: copy.action,
		footnote: copy.footnote,
	})

/* -------------------------------------------------------------------------- */
/* Collections and their items                                                */
/* -------------------------------------------------------------------------- */

export const grid = (
	heading: 'above' | 'centered' | 'beside',
	copy: Heading & { columns?: '2' | '3' | '4' },
	children: Block[],
) =>
	block(
		'grid',
		heading,
		{
			eyebrow: copy.eyebrow,
			title: copy.title,
			description: copy.description,
			columns: copy.columns,
		},
		children,
	)

export const masonry = (
	heading: 'above' | 'centered' | 'bare',
	copy: Heading & { columns?: '2' | '3' | '4' },
	children: Block[],
) =>
	block(
		'masonry',
		heading,
		{
			eyebrow: copy.eyebrow,
			title: copy.title,
			description: copy.description,
			columns: copy.columns,
		},
		children,
	)

export const carousel = (
	controls: 'below' | 'overlay' | 'bars',
	copy: Heading & { size?: 'sm' | 'md' | 'lg' | 'full' },
	children: Block[],
) =>
	block(
		'carousel',
		controls,
		{
			eyebrow: copy.eyebrow,
			title: copy.title,
			description: copy.description,
			size: copy.size,
		},
		children,
	)

export const feature = (
	variant: 'card' | 'inline' | 'numbered',
	title: string,
	blurb: string,
	icon?: string,
) => block('feature-card', variant, { title, blurb, icon })

export const features = (
	variant: 'card' | 'inline' | 'numbered',
	rows: [title: string, blurb: string, icon?: string][],
) => rows.map(([title, blurb, icon]) => feature(variant, title, blurb, icon))

/**
 * A sample testimonial. The quote shows what a strong one says (the problem, the
 * result, a number); the attribution is a placeholder so it can never pass for a
 * real review if the page is published unedited.
 */
export const testimonial = (
	variant: 'card' | 'bare' | 'aside',
	quote: string,
	role = 'Their role',
) =>
	block('testimonial-card', variant, {
		quote,
		name: 'Customer name',
		role,
		company: 'Company',
	})

export const testimonials = (variant: 'card' | 'bare' | 'aside', quotes: string[]) =>
	quotes.map((quote) => testimonial(variant, quote))

export const teamCard = (
	variant: 'card' | 'portrait' | 'row',
	name: string,
	role: string,
	bio: string,
) => block('team-card', variant, { name, role, bio })

export const related = (
	variant: 'card' | 'list' | 'thumbnail',
	title: string,
	meta: string,
	description: string,
	href: string,
) => block('related-card', variant, { title, meta, description, href })

export const article = (
	variant: 'card' | 'numbered' | 'thumbnail',
	title: string,
	excerpt: string,
	category: string,
	readTime: string,
) =>
	block('article-card', variant, {
		title,
		excerpt,
		category,
		readTime,
		href: '/blog',
	})

export const caseCard = (
	variant: 'stacked' | 'overlay' | 'row',
	copy: { name: string; category: string; client: string; summary: string },
) => block('case-study-card', variant, { ...copy, href: '/case-studies' })

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

export const detailCard = (
	variant: 'card' | 'rows' | 'inline',
	copy: {
		eyebrow?: string
		title: string
		description?: string
		details: [label: string, value: string][]
		action: Action
		note?: string
	},
) =>
	block('detail-card', variant, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		details: copy.details.map(([label, value]) => ({ label, value })),
		action: copy.action,
		showNote: Boolean(copy.note),
		note: copy.note,
	})

export const countdown = (
	variant: 'boxed' | 'bare' | 'inline',
	copy: {
		eyebrow?: string
		title: string
		description?: string
		units?: [value: string, label: string][]
		note?: string
	},
) =>
	block('countdown', variant, {
		eyebrow: copy.eyebrow,
		title: copy.title,
		description: copy.description,
		units: (
			copy.units ?? [
				['03', 'Days'],
				['12', 'Hours'],
				['45', 'Minutes'],
				['30', 'Seconds'],
			]
		).map(([value, label]) => ({ value, label })),
		showNote: Boolean(copy.note),
		note: copy.note,
	})

export const authPanel = (
	variant: 'split' | 'centered' | 'card',
	copy: {
		eyebrow?: string
		title: string
		description?: string
		footnote?: string
		footnoteLink?: string
		href?: string
		asideQuote?: string
	},
) =>
	block('auth-panel', variant, {
		...copy,
		...(copy.asideQuote
			? { asideName: 'Customer name', asideRole: 'Their role, Company' }
			: {}),
	})

export const notice = (
	variant: 'confirmation' | 'code' | 'plain',
	copy: {
		icon?: string
		code?: string
		title: string
		description: string
		steps?: [value: string, label: string][]
		actions?: Action[]
	},
) =>
	block('notice', variant, {
		icon: copy.icon,
		code: copy.code,
		title: copy.title,
		description: copy.description,
		steps: copy.steps?.map(([value, label]) => ({ value, label })),
		actions: copy.actions,
	})
