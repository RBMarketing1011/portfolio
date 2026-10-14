import type { Metadata } from 'next'
import type { SiteBrand } from '@/components/built-chrome'
import { RenderedSite } from '@/components/rendered-site'
import { siteOrigin, type PublicSite } from '@/lib/builder/public-site'
import { brandFromProfile } from '@/lib/builder/site-profile'
import { jsonLdScript, siteJsonLd, siteMetadata } from '@/lib/builder/site-seo'

/**
 * A live site, as both hosted routes (subdomain and custom domain) serve it: the
 * metadata search engines and link previews read, the structured data, and the
 * pages themselves. One component, so the two addresses can never drift apart.
 */
export function hostedMetadata(site: PublicSite, slug?: string[]): Metadata {
	return siteMetadata({
		profile: site.profile,
		siteName: site.name,
		site: site.site,
		slug,
		origin: siteOrigin(site),
	})
}

/** Whose site this is, for the header and footer. */
export function brandOf(site: PublicSite): SiteBrand {
	return {
		...brandFromProfile(site.profile, site.name),
		host: new URL(siteOrigin(site)).host,
	}
}

export function HostedSite({ site, slug }: { site: PublicSite; slug?: string[] }) {
	const jsonLd = siteJsonLd({
		profile: site.profile,
		siteName: site.name,
		site: site.site,
		slug,
		origin: siteOrigin(site),
	})
	return (
		<>
			<script
				type='application/ld+json'
				// Escaped by jsonLdScript, so nothing in the data can close the tag.
				dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
			/>
			<RenderedSite
				site={site.site}
				look={site.look}
				media={site.media}
				slug={slug}
				brand={brandOf(site)}
			/>
		</>
	)
}
