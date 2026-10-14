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
const BUSINESS_TYPE_VALUES = BUSINESS_TYPES.map((t) => t.value) as [
	BusinessType,
	...BusinessType[],
]

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
			/** A square PNG, ideally 512×512. */
			favicon: image,
		})
		.catch({ logo: null, logoAlt: '', favicon: null })
		.default({ logo: null, logoAlt: '', favicon: null }),

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
		brand: { logo: null, logoAlt: '', favicon: null },
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

/**
 * Who a site belongs to, for its header and footer: the logo, or the name set as a
 * wordmark when there is no logo. The business name wins over the SEO title, which
 * wins over the project name, because it is the most deliberate of the three.
 */
export function brandFromProfile(profile: SiteProfile, projectName: string) {
	return {
		name: profile.business.name || profile.seo.siteTitle || projectName,
		logo: profile.brand.logo,
		logoAlt: profile.brand.logoAlt,
		tagline: profile.business.description || profile.seo.description,
	}
}
