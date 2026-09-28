import type { Metadata } from 'next'
import { SitePreview } from '../../site-preview'

export const metadata: Metadata = {
	title: 'Preview',
	robots: { index: false, follow: false },
}

export default async function SitePreviewRoute({
	params,
}: {
	params: Promise<{ siteId: string; slug?: string[] }>
}) {
	const { siteId } = await params
	return <SitePreview siteId={siteId} />
}
