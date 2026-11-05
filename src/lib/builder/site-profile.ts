/**
 * Everything a project knows about the business behind it, as opposed to how its
 * pages look: the brand marks, the search and sharing defaults, and the business
 * facts that become LocalBusiness / Organization structured data.
 *
 * Client safe (zod only), so the project settings tabs validate with the same
 * schema the API stores with. Every field falls back rather than failing, so one
 * bad value never stops a live site from rendering.
 */
import { z } from 'zod'

/** A schema.org type, and how the settings tab names it. */
export const BUSINESS_TYPES = [
	{ value: 'LocalBusiness', label: 'Local business (general)' },
	{ value: 'Organization', label: 'Company with no public location' },
	{ value: 'ProfessionalService', label: 'Professional service' },
	{ value: 'HomeAndConstructionBusiness', label: 'Home and construction' },
	{ value: 'GeneralContractor', label: 'General contractor' },
	{ value: 'Plumber', label: 'Plumber' },
	{ value: 'Electrician', label: 'Electrician' },
	{ value: 'HVACBusiness', label: 'HVAC' },
	{ value: 'RoofingContractor', label: 'Roofing' },
	{ value: 'HousePainter', label: 'Painter' },
	{ value: 'Locksmith', label: 'Locksmith' },
	{ value: 'MovingCompany', label: 'Moving company' },
	{ value: 'AutoRepair', label: 'Auto repair' },
	{ value: 'Dentist', label: 'Dentist' },
	{ value: 'MedicalClinic', label: 'Medical clinic' },
	{ value: 'Physician', label: 'Physician' },
	{ value: 'VeterinaryCare', label: 'Veterinary care' },
	{ value: 'LegalService', label: 'Legal service' },
	{ value: 'Attorney', label: 'Attorney' },
	{ value: 'AccountingService', label: 'Accounting' },
	{ value: 'FinancialService', label: 'Financial service' },
	{ value: 'InsuranceAgency', label: 'Insurance agency' },
	{ value: 'RealEstateAgent', label: 'Real estate agent' },
	{ value: 'Restaurant', label: 'Restaurant' },
	{ value: 'CafeOrCoffeeShop', label: 'Cafe or coffee shop' },
	{ value: 'BeautySalon', label: 'Beauty salon' },
	{ value: 'HairSalon', label: 'Hair salon' },
	{ value: 'DaySpa', label: 'Day spa' },
	{ value: 'HealthClub', label: 'Gym or health club' },
	{ value: 'Store', label: 'Store' },
	{ value: 'PetStore', label: 'Pet store' },
	{ value: 'ChildCare', label: 'Child care' },
] as const

export type BusinessType = (typeof BUSINESS_TYPES)[number]['value']
/** The schema.org types alone, in the order above (the AI's output schemas use them as an enum). */
export const BUSINESS_TYPE_VALUES: readonly [BusinessType, ...BusinessType[]] =
	BUSINESS_TYPES.map((t) => t.value) as [BusinessType, ...BusinessType[]]

export const WEEKDAYS = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday',
] as const
export type Weekday = (typeof WEEKDAYS)[number]

const text = (max: number) => z.string().trim().max(max).catch('').default('')
const time = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
	.catch('09:00')

/** An uploaded image's URL, or nothing. The API checks it belongs to the project. */
const image = z.string().url().max(2000).nullable().catch(null).default(null)

/** How tall the logo stands in the header and footer. */
export const LOGO_SIZES = ['sm', 'md', 'lg', 'xl'] as const
export type LogoSize = (typeof LOGO_SIZES)[number]
export const LOGO_SIZE_LABELS: Record<LogoSize, string> = {
	sm: 'Small',
	md: 'Medium',
	lg: 'Large',
	xl: 'Extra large',
}

/**
 * The logo's height in pixels where it shows: the header bar, the floating header's
 * pill, and the footer. The renderer and the header's anchor offset both read it.
 */
export const LOGO_HEIGHTS: Record<'header' | 'pill' | 'footer', Record<LogoSize, number>> = {
	header: { sm: 32, md: 44, lg: 56, xl: 72 },
	pill: { sm: 28, md: 36, lg: 44, xl: 52 },
	footer: { sm: 32, md: 40, lg: 48, xl: 64 },
}

/** A plate behind the logo, so a dark logo reads on a dark header and a light one on a light header. */
export const LOGO_BACKDROPS = ['none', 'light', 'dark'] as const
export type LogoBackdrop = (typeof LOGO_BACKDROPS)[number]
export const LOGO_BACKDROP_LABELS: Record<LogoBackdrop, string> = {
	none: 'None',
	light: 'Light plate',
	dark: 'Dark plate',
}

/** The plate's padding above and below the logo, in pixels. */
export const LOGO_PLATE_PAD = 6

/**
 * The plate's own colours, literal on purpose: a built site points Tailwind's `white` at
 * its heading colour, which on a light site is near black.
 */
export const LOGO_PLATE_COLORS: Record<Exclude<LogoBackdrop, 'none'>, string> = {
	light: '#ffffff',
	dark: '#0b1220',
}

export const isLogoSize = (value: unknown): value is LogoSize =>
	typeof value === 'string' && (LOGO_SIZES as readonly string[]).includes(value)
export const isLogoBackdrop = (value: unknown): value is LogoBackdrop =>
	typeof value === 'string' && (LOGO_BACKDROPS as readonly string[]).includes(value)

const brandDefaults = () => ({
	logo: null as string | null,
	logoAlt: '',
	logoSize: 'md' as LogoSize,
	logoBackdrop: 'none' as LogoBackdrop,
	favicon: null as string | null,
})

const hoursSchema = z.object({
	days: z.array(z.enum(WEEKDAYS)).max(7).catch([]).default([]),
	opens: time.default('09:00'),
	closes: time.default('17:00'),
})

const businessDefaults = {
	enabled: false,
	type: 'LocalBusiness' as BusinessType,
	name: '',
	description: '',
	phone: '',
	email: '',
	street: '',
	city: '',
	region: '',
	postalCode: '',
	country: '',
	serviceArea: [] as string[],
	hours: [] as { days: Weekday[]; opens: string; closes: string }[],
	priceRange: '',
	profiles: [] as string[],
	latitude: null as number | null,
	longitude: null as number | null,
}

export const siteProfileSchema = z.object({
	brand: z
		.object({
			logo: image,
			/** Read by screen readers and shown if the logo fails to load. */
			logoAlt: text(120),
			logoSize: z.enum(LOGO_SIZES).catch('md').default('md'),
			logoBackdrop: z.enum(LOGO_BACKDROPS).catch('none').default('none'),
			/** A square PNG, ideally 512×512. */
			favicon: image,
		})
		.catch(brandDefaults)
		.default(brandDefaults),

	seo: z
		.object({
			/** The site's name in titles. Falls back to the project name. */
			siteTitle: text(70),
			/** The home page's whole title, when it should say more than the name. */
			homeTitle: text(70),
			/** Used on every page that has no description of its own. */
			description: text(300),
			/** The image link previews show. 1200×630 works everywhere. */
			shareImage: image,
			/** Without the @. */
			twitter: text(30),
			/** Ask search engines to stay away, for staging or private sites. */
			noindex: z.boolean().catch(false).default(false),
		})
		.catch({
			siteTitle: '',
			homeTitle: '',
			description: '',
			shareImage: null,
			twitter: '',
			noindex: false,
		})
		.default({
			siteTitle: '',
			homeTitle: '',
			description: '',
			shareImage: null,
			twitter: '',
			noindex: false,
		}),

	business: z
		.object({
			/** Whether to publish the business facts as structured data. */
			enabled: z.boolean().catch(false).default(false),
			type: z.enum(BUSINESS_TYPE_VALUES).catch('LocalBusiness').default('LocalBusiness'),
			name: text(120),
			description: text(300),
			phone: text(40),
			email: text(254),
			street: text(160),
			city: text(80),
			region: text(80),
			postalCode: text(20),
			/** Two-letter code, such as US. */
			country: text(2),
			/** Places served without a storefront there. */
			serviceArea: z.array(z.string().trim().min(1).max(80)).max(30).catch([]).default([]),
			hours: z.array(hoursSchema).max(7).catch([]).default([]),
			/** $, $$, $$$, or a range such as $50-$200. */
			priceRange: text(20),
			/** Profile URLs: Google Business, Facebook, Instagram, LinkedIn, Yelp. */
			profiles: z.array(z.string().url().max(300)).max(10).catch([]).default([]),
			latitude: z.number().min(-90).max(90).nullable().catch(null).default(null),
			longitude: z.number().min(-180).max(180).nullable().catch(null).default(null),
		})
		.catch(() => ({ ...businessDefaults }))
		.default(() => ({ ...businessDefaults })),
})

export type SiteProfile = z.infer<typeof siteProfileSchema>

export function siteProfileDefaults(): SiteProfile {
	return {
		brand: brandDefaults(),
		seo: {
			siteTitle: '',
			homeTitle: '',
			description: '',
			shareImage: null,
			twitter: '',
			noindex: false,
		},
		business: { ...businessDefaults },
	}
}

/** A stored profile, or the defaults for a project that has never had one. */
export const readSiteProfile = (value: unknown): SiteProfile =>
	siteProfileSchema.safeParse(value ?? {}).data ?? siteProfileDefaults()

/** Every image URL a profile points at, so the API can check they belong to the project. */
export const profileImages = (profile: SiteProfile) =>
	[profile.brand.logo, profile.brand.favicon, profile.seo.shareImage].filter(
		(url): url is string => Boolean(url),
	)

type Business = SiteProfile['business']

/** How a business is reached, as the footer's Contact column shows it. Empty when unknown. */
export type BusinessContact = {
	phone: string
	email: string
	/** Street, city, region and postal code on one line. */
	address: string
	/** One line per opening-hours row, such as "Monday to Friday 7:00 to 18:00". */
	hours: string[]
	areas: string[]
}

/** "1 Main St, Austin, TX 78701", from whichever parts are set. */
export function addressLine(business: Business) {
	const locality = [business.region, business.postalCode].filter(Boolean).join(' ')
	return [business.street, business.city, locality].filter(Boolean).join(', ')
}

const and = (parts: string[]) =>
	parts.length < 2
		? (parts[0] ?? '')
		: `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

/** Consecutive days read as a range ("Monday to Friday"), the rest are listed. */
function dayRange(days: Weekday[]) {
	const indexes = [...new Set(days)]
		.map((day) => WEEKDAYS.indexOf(day))
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)
	if (indexes.length === 7) return 'Every day'
	const runs: number[][] = []
	for (const index of indexes) {
		const run = runs[runs.length - 1]
		if (run && index === run[run.length - 1] + 1) run.push(index)
		else runs.push([index])
	}
	return and(
		runs.flatMap((run) =>
			run.length > 2
				? [`${WEEKDAYS[run[0]]} to ${WEEKDAYS[run[run.length - 1]]}`]
				: run.map((index) => WEEKDAYS[index]),
		),
	)
}

const clock = (time: string) => time.replace(/^0(?=\d)/, '')

/** The opening hours as plain lines; a row with no days is not published, as in the structured data. */
export function hoursLines(business: Business) {
	return business.hours
		.filter((slot) => slot.days.length > 0)
		.map((slot) => `${dayRange(slot.days)} ${clock(slot.opens)} to ${clock(slot.closes)}`)
}

/**
 * A phone number as a `tel:` link, or '' when it is not one: international when it is
 * written with a country code, and a 10-digit number reads as North American (+1).
 */
export function phoneHref(phone: string) {
	const number = phone.replace(/\s*(?:ext\.?|x|#)\s*\d+\s*$/i, '')
	const digits = number.replace(/\D/g, '')
	if (digits.length < 7 || digits.length > 15) return ''
	if (number.trim().startsWith('+')) return `tel:+${digits}`
	if (digits.length === 10) return `tel:+1${digits}`
	if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
	return `tel:${digits}`
}

/**
 * Who a site belongs to, for its header and footer: the logo, or the name set as a
 * wordmark when there is no logo. The business name wins over the SEO title, which
 * wins over the project name, because it is the most deliberate of the three. The
 * contact details feed the footer's Contact column and the phone in the mobile menu.
 */
export function brandFromProfile(profile: SiteProfile, projectName: string) {
	const business = profile.business
	const contact: BusinessContact = {
		phone: business.phone,
		email: business.email,
		address: addressLine(business),
		hours: hoursLines(business),
		areas: [...business.serviceArea],
	}
	return {
		name: business.name || profile.seo.siteTitle || projectName,
		logo: profile.brand.logo,
		logoAlt: profile.brand.logoAlt,
		logoSize: profile.brand.logoSize,
		logoBackdrop: profile.brand.logoBackdrop,
		tagline: business.description || profile.seo.description,
		contact,
	}
}
