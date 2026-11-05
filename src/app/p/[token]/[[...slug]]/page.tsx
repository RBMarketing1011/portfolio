import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { brandOf } from '@/components/hosted-site'
import { RenderedSite } from '@/components/rendered-site'
import { siteByPreviewToken } from '@/lib/builder/public-site'
import { siteIcons } from '@/lib/builder/site-seo'

export const dynamic = 'force-dynamic'

// The metadata and the page read the same project once per request.
const projectFor = cache(siteByPreviewToken)

export async function generateMetadata({
	params,
}: {
	params: Promise<{ token: string }>
}): Promise<Metadata> {
	const { token } = await params
	const project = await projectFor(token)
	// A share link must never be indexed, whatever the project's own settings say.
	return {
		title: 'Preview',
		robots: { index: false, follow: false, nocache: true },
		...(project ? { icons: siteIcons({ profile: project.profile, siteName: project.name }) } : {}),
	}
}

export default async function SharedPreviewPage({
	params,
}: {
	params: Promise<{ token: string; slug?: string[] }>
}) {
	const { token, slug } = await params
	const project = await projectFor(token)
	if (!project) notFound()

	return (
		<RenderedSite
			site={project.site}
			look={project.look}
			media={project.media}
			slug={slug}
			linkBase={`/p/${token}`}
			brand={brandOf(project)}
		/>
	)
}
