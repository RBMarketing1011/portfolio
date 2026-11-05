import type { Metadata } from 'next'
import { requireSitePermission } from '@/lib/auth/guards'
import { readSiteProfile } from '@/lib/builder/site-profile'
import { siteIcons } from '@/lib/builder/site-seo'
import { SitePreview } from '../../site-preview'

const base: Metadata = {
	title: 'Preview',
	robots: { index: false, follow: false },
}

/** The tab wears the site's own favicon, as the live site will. */
export async function generateMetadata({
	params,
}: {
	params: Promise<{ siteId: string }>
}): Promise<Metadata> {
	const { siteId } = await params
	try {
		const { site } = await requireSitePermission(siteId, 'projects.view')
		return {
			...base,
			icons: siteIcons({ profile: readSiteProfile(site.profile), siteName: site.name }),
		}
	} catch {
		// Signed out or not a member: the page itself says so; the tab keeps the app's icon.
		return base
	}
}

export default async function SitePreviewRoute({
	params,
}: {
	params: Promise<{ siteId: string; slug?: string[] }>
}) {
	const { siteId } = await params
	return <SitePreview siteId={siteId} />
}
