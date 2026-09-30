import { notFound } from 'next/navigation'
import { RenderedSite } from '@/components/rendered-site'
import { siteByPreviewToken } from '@/lib/builder/public-site'

export const dynamic = 'force-dynamic'

// A share link must never be indexed, whatever the project's own settings say.
export const metadata = {
	title: 'Preview',
	robots: { index: false, follow: false, nocache: true },
}

export default async function SharedPreviewPage({
	params,
}: {
	params: Promise<{ token: string; slug?: string[] }>
}) {
	const { token, slug } = await params
	const project = await siteByPreviewToken(token)
	if (!project) notFound()

	return (
		<RenderedSite
			site={project.site}
			look={project.look}
			media={project.media}
			slug={slug}
			linkBase={`/p/${token}`}
		/>
	)
}
