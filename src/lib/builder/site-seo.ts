/**
 * What a live site tells search engines and link previews: the page title, the
 * description, the share image, the favicon, indexing, and structured data
 * (WebSite, plus LocalBusiness or Organization when the business details are on).
 *
 * Pure, so the hosted routes and the proof use the same function.
 */
import type { Metadata } from 'next'
import { HOME_SLUG, type Site } from './page-schema'
import type { SiteProfile } from './site-profile'

export type SeoInput = {
	profile: SiteProfile
	/** The project's own name, the fallback for every name below. */
	siteName: string
	site: Site
	/** The slug segments from the URL; none means the home page. */
	slug?: string[]
	/** `https://example.com`, no trailing slash. */
	origin: string
}

/** The page a URL shows, exactly as the renderer picks it. */
export function pageFor(site: Site, slug?: string[]) {
	const wanted = slug?.join('/')
	return wanted
		? site.pages.find((item) => item.slug === wanted)
		: (site.pages.find((item) => item.slug === HOME_SLUG) ?? site.pages[0])
}

const brandName = (input: SeoInput) =>
	input.profile.seo.siteTitle ||
	input.profile.business.name ||
	input.siteName

/**
 * A favicon for a site that has not uploaded one: its initial on a dark tile, so a
 * customer's site never wears this app's own icon.
 */
export function letterIcon(name: string) {
	const letter = (name.trim()[0] ?? '?').toUpperCase().replace(/[<>&"']/g, '')
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111827"/><text x="32" y="43" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700" fill="#ffffff">${letter}</text></svg>`
	return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function siteMetadata(input: SeoInput): Metadata {
	const { profile, origin } = input
	const page = pageFor(input.site, input.slug)
	const name = brandName(input)
	const isHome = !page || page.slug === HOME_SLUG
	// A page's own search title and description win; the site's are the fallback.
	const own = page?.seo
	const title =
		own?.title.trim() ||
		(isHome ? profile.seo.homeTitle || name : `${page.name} | ${name}`)
	const description =
		own?.description.trim() ||
		profile.seo.description ||
		profile.business.description ||
		undefined
	const path = isHome ? '/' : `/${page.slug}`
	const url = `${origin}${path}`
	const image = profile.seo.shareImage ?? profile.brand.logo ?? undefined
	const favicon = profile.brand.favicon ?? letterIcon(name)
	const twitter = profile.seo.twitter.replace(/^@/, '')

	return {
		// Absolute, so no layout above can stamp another name onto it.
		title: { absolute: title },
		description,
		alternates: { canonical: url },
		robots: profile.seo.noindex
			? { index: false, follow: false }
			: { index: true, follow: true },
		icons: { icon: favicon, shortcut: favicon, apple: favicon },
		openGraph: {
			type: 'website',
			url,
			siteName: name,
			title,
			description,
			...(image ? { images: [{ url: image, alt: name }] } : {}),
		},
		twitter: {
			card: profile.seo.shareImage ? 'summary_large_image' : 'summary',
			title,
			description,
			...(image ? { images: [image] } : {}),
			...(twitter ? { site: `@${twitter}` } : {}),
		},
	}
}

type JsonLd = Record<string, unknown>

/** Drops empty strings, empty lists and empty objects, so the markup carries only facts. */
function compact<T>(value: T): T {
	if (Array.isArray(value))
		return value.map(compact).filter((item) => !isEmpty(item)) as T
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {}
		for (const [key, inner] of Object.entries(value)) {
			const kept = compact(inner)
			if (!isEmpty(kept)) out[key] = kept
		}
		return out as T
	}
	return value
}
const isEmpty = (value: unknown) =>
	value === undefined ||
	value === null ||
	value === '' ||
	(Array.isArray(value) && value.length === 0) ||
	(typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.keys(value as object).length === 0)

/** The schema.org objects for a site. WebSite always; the business when it is on. */
export function siteJsonLd(input: SeoInput): JsonLd[] {
	const { profile, origin } = input
	const name = brandName(input)
	const out: JsonLd[] = [
		compact({
			'@context': 'https://schema.org',
			'@type': 'WebSite',
			name,
			url: `${origin}/`,
			description: profile.seo.description,
		}),
	]

	const business = profile.business
	if (!business.enabled) return out

	const isOrganization = business.type === 'Organization'
	const address = compact({
		'@type': 'PostalAddress',
		streetAddress: business.street,
		addressLocality: business.city,
		addressRegion: business.region,
		postalCode: business.postalCode,
		addressCountry: business.country.toUpperCase(),
	})
	// Only a type is not an address.
	const hasAddress = Object.keys(address).length > 1

	out.push(
		compact({
			'@context': 'https://schema.org',
			'@type': business.type,
			'@id': `${origin}/#business`,
			name: business.name || name,
			description: business.description || profile.seo.description,
			url: `${origin}/`,
			logo: profile.brand.logo,
			image: profile.seo.shareImage ?? profile.brand.logo,
			telephone: business.phone,
			email: business.email,
			address: hasAddress ? address : undefined,
			sameAs: business.profiles,
			// Organisations have no opening hours, price range or map pin in schema.org.
			...(isOrganization
				? {}
				: {
						priceRange: business.priceRange,
						geo:
							business.latitude !== null && business.longitude !== null
								? {
										'@type': 'GeoCoordinates',
										latitude: business.latitude,
										longitude: business.longitude,
									}
								: undefined,
						areaServed: business.serviceArea.map((place) => ({
							'@type': 'Place',
							name: place,
						})),
						openingHoursSpecification: business.hours
							.filter((slot) => slot.days.length > 0)
							.map((slot) => ({
								'@type': 'OpeningHoursSpecification',
								dayOfWeek: slot.days,
								opens: slot.opens,
								closes: slot.closes,
							})),
					}),
		}),
	)
	return out
}

/** Safe to put inside a <script> tag: nothing in the data can close it. */
export const jsonLdScript = (data: JsonLd[]) =>
	JSON.stringify(data.length === 1 ? data[0] : data).replace(/</g, '\\u003c')
