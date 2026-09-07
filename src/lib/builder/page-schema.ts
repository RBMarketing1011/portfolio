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

export const pageSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).max(120),
	slug: z.string().min(1).max(120),
	/** Shows in the site header navigation. */
	inHeader: z.boolean().default(true),
	blocks: z.array(blockSchema),
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
})

export const defaultChrome: Chrome = {
	header: 'bar',
	footer: 'columns',
	ctaLabel: '',
	ctaHref: '',
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

export function uniqueSlug(slug: string, taken: string[]) {
	if (!taken.includes(slug)) return slug
	let n = 2
	while (taken.includes(`${slug}-${n}`)) n++
	return `${slug}-${n}`
}

/** Builds a link to a page, keeping the home page on the bare base path. */
export function pageHref(linkBase: string, slug: string) {
	return slug === HOME_SLUG ? linkBase : `${linkBase}/${slug}`
}

/** How a slug reads in the builder UI. */
export function displaySlug(slug: string) {
	return slug === HOME_SLUG ? HOME_SLUG : `/${slug}`
}
