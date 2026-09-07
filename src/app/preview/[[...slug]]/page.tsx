import type { Metadata } from 'next'
import { SitePreview } from '../site-preview'

export const metadata: Metadata = {
	title: 'Preview',
	robots: { index: false, follow: false },
}

export default function PreviewRoute() {
	return <SitePreview />
}
