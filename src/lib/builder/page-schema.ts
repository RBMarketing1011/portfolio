import { z } from 'zod'

export const blockSchema: z.ZodType<BlockInput> = z.lazy(() =>
	z.object({
		id: z.string().min(1),
		type: z.string().min(1),
		variant: z.string().optional(),
		props: z.record(z.string(), z.unknown()).optional(),
		children: z.array(blockSchema).optional(),
	}),
)

export type BlockInput = {
	id: string
	type: string
	variant?: string
	props?: Record<string, unknown>
	children?: BlockInput[]
}

/**
 * What search engines and link previews show for one page. Optional, and an unreadable
 * value is dropped rather than failing the page: a site that fails to parse loads empty.
 */
const pageSeoSchema = z.object({
	title: z.string().max(70).catch(''),
	description: z.string().max(160).catch(''),
})

export const pageSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(120),
	slug: z.string().min(1).max(120),
	/** Shows in the site header navigation. */
	inHeader: z.boolean().default(true),
	blocks: z.array(blockSchema),
	/** The page's own search title and description; the site's apply when empty. */
	seo: pageSeoSchema.optional().catch(undefined),
	createdAt: z.string(),
	updatedAt: z.string(),
})

// Variant ids mirror the `design` prop on the section kit's SiteHeader / SiteFooter.
export const HEADER_VARIANTS = ['none', 'bar', 'floating', 'stacked'] as const
export const FOOTER_VARIANTS = ['none', 'columns', 'centered', 'split'] as const

export type HeaderVariant = (typeof HEADER_VARIANTS)[number]
export type FooterVariant = (typeof FOOTER_VARIANTS)[number]

export const HEADER_VARIANT_LABELS: Record<HeaderVariant, string> = {
	none: 'No header',
	bar: 'Full-Width Bar',
	floating: 'Floating Pill',
	stacked: 'Two Rows, Centered Nav',
}

export const FOOTER_VARIANT_LABELS: Record<FooterVariant, string> = {
	none: 'No footer',
	columns: 'Brand Then Columns',
	centered: 'Centered',
	split: 'Brand Left, Ruled Columns',
}

// Chrome was a pair of booleans, then a pair of made-up ids, so migrate rather than reject.
const legacyHeader: Record<string, HeaderVariant> = {
	'header-1': 'bar',
	'header-2': 'stacked',
	'header-3': 'bar',
}
const legacyFooter: Record<string, FooterVariant> = {
	'footer-1': 'columns',
	'footer-2': 'centered',
	'footer-3': 'split',
}

const migrate =
	<T extends string>(on: T, legacy: Record<string, T>) =>
	(value: unknown) => {
		if (value === true) return on
		if (value === false) return 'none'
		if (typeof value === 'string' && legacy[value]) return legacy[value]
		return value
	}

// ---------------------------------------------------------------- header menu

/**
 * Where a menu link or button goes: the slug of a built page, or an external URL.
 * Kept loose on purpose: a link to a page that was later deleted must not make the
 * whole site fail to load, so it is only checked when it is rendered.
 */
const target = z.string().max(300).catch('').default('')

/** One link inside a menu panel: a title, an optional line under it, an optional icon. */
export const menuLinkSchema = z.object({
	id: z.string().min(1).max(40),
	label: z.string().max(80).catch('').default(''),
	href: target,
	description: z.string().max(160).catch('').default(''),
	/** A name from the builder's icon library. */
	icon: z.string().max(60).optional().catch(undefined),
})

/** The featured card on the right of a mega panel. */
export const menuPromoSchema = z.object({
	eyebrow: z.string().max(40).catch('').default(''),
	title: z.string().max(100).catch('').default(''),
	body: z.string().max(240).catch('').default(''),
	ctaLabel: z.string().max(40).catch('').default(''),
	href: target,
	/** A media reference, resolved when rendered. */
	image: z.string().max(2000).optional().catch(undefined),
})

export const MENU_STYLES = ['mega', 'dropdown'] as const
export type MenuStyle = (typeof MENU_STYLES)[number]

export const MENU_STYLE_LABELS: Record<MenuStyle, string> = {
	mega: 'Mega menu',
	dropdown: 'Dropdown list',
}

/**
 * A top-level entry in the header. With nothing under it, it is a plain link to
 * `href`. With links under it, it opens a panel and `href` is not used.
 */
export const menuItemSchema = z.object({
	id: z.string().min(1).max(40),
	label: z.string().max(80).catch('').default(''),
	href: target,
	links: z.array(menuLinkSchema).max(24).catch([]).default([]),
	style: z.enum(MENU_STYLES).catch('mega').default('mega'),
	promo: menuPromoSchema.nullable().catch(null).default(null),
})

export type MenuLink = z.infer<typeof menuLinkSchema>
export type MenuPromo = z.infer<typeof menuPromoSchema>
export type MenuItem = z.infer<typeof menuItemSchema>

export const MENU_LIMITS = { items: 10, links: 24 } as const

export const chromeSchema = z.object({
	header: z
		.preprocess(migrate('bar', legacyHeader), z.enum(HEADER_VARIANTS))
		.catch('bar')
		.default('bar'),
	footer: z
		.preprocess(migrate('columns', legacyFooter), z.enum(FOOTER_VARIANTS))
		.catch('columns')
		.default('columns'),
	/** The button pinned to the right of the header. */
	ctaLabel: z.string().max(60).catch('').default(''),
	/** Slug of a built page, or an external URL. */
	ctaHref: z.string().max(300).catch('').default(''),
	/**
	 * The header navigation. Empty means "show the pages that are set to appear in
	 * the header", which is what every site did before menus existed.
	 */
	menu: z.array(menuItemSchema).max(MENU_LIMITS.items).catch([]).default([]),
	/** A Contact column in the footer: phone, email, address, hours and areas from the business details. */
	footerDetails: z.boolean().catch(false).default(false),
})

export const defaultChrome: Chrome = {
	header: 'bar',
	footer: 'columns',
	ctaLabel: '',
	ctaHref: '',
	menu: [],
	footerDetails: false,
}

export const siteSchema = z.object({
	version: z.literal(1),
	chrome: chromeSchema.default(() => defaultChrome),
	pages: z.array(pageSchema),
})

export type Page = z.infer<typeof pageSchema>
export type Site = z.infer<typeof siteSchema>
export type Chrome = z.infer<typeof chromeSchema>

export const templateSchema = z.object({
	slug: z.string().min(1),
	name: z.string().min(1),
	description: z.string(),
	/** A TEMPLATE_CATEGORIES id. Unknown ones still list under "All". */
	category: z.string().catch('').default(''),
	/** What the new page is called (and its slug), unless the person typed one. */
	pageName: z.string().max(120).optional().catch(undefined),
	/** Extra words the template search matches. */
	keywords: z.array(z.string()).catch([]).default([]),
	blocks: z.array(blockSchema),
})

export type Template = z.infer<typeof templateSchema>

/** The first page a site gets is always the home page, and it owns the root path. */
export const HOME_SLUG = '/'

/** Turns a page name into a URL slug, leaving `/` for the home page alone. */
export function slugify(name: string) {
	const slug = name
		.toLowerCase()
		.trim()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return slug || 'page'
}

/**
 * `slug`, or the first of `slug-2`, `slug-3`… that is free. Slugs are flat, so leading
 * slashes are dropped first; the home slug is the one exception, kept while it is free
 * and never suffixed (`/-2` is no address), so a second claim on it gets `home`.
 */
export function uniqueSlug(slug: string, taken: string[]) {
	if (slug === HOME_SLUG && !taken.includes(HOME_SLUG)) return HOME_SLUG
	const base = slug.replace(/^\/+/, '') || (slug ? 'home' : 'page')
	if (!taken.includes(base)) return base
	let n = 2
	while (taken.includes(`${base}-${n}`)) n++
	return `${base}-${n}`
}

/** Builds a link to a page, keeping the home page on the bare base path. */
export function pageHref(linkBase: string, slug: string) {
	return slug === HOME_SLUG ? linkBase : `${linkBase}/${slug}`
}

/**
 * Where a menu link points. A link with nothing set goes nowhere (`#`). The home page
 * is the site's base path. An absolute URL, `mailto:`, `tel:`, anchor or root-relative
 * path is used as written; anything else is the slug of a built page.
 */
export function resolveHref(linkBase: string, href: string) {
	if (!href) return '#'
	// The home slug is "/", which looks root-relative but must stay inside the site.
	if (href === HOME_SLUG) return pageHref(linkBase, HOME_SLUG) || '/'
	if (/^(https?:|mailto:|tel:|#|\/)/.test(href)) return href
	return pageHref(linkBase, href) || '/'
}

/** How a slug reads in the builder UI. */
export function displaySlug(slug: string) {
	return slug === HOME_SLUG ? HOME_SLUG : `/${slug}`
}
