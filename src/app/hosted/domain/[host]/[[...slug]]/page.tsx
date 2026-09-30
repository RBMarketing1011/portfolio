import { notFound } from 'next/navigation'
import { RenderedSite } from '@/components/rendered-site'
import { liveSiteByHost } from '@/lib/builder/public-site'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
	params,
}: {
	params: Promise<{ host: string }>
}) {
	const { host } = await params
	const project = await liveSiteByHost({ customDomain: host })
	return { title: project?.name ?? 'Not found' }
}

export default async function HostedDomainPage({
	params,
}: {
	params: Promise<{ host: string; slug?: string[] }>
}) {
	const { host, slug } = await params
	const project = await liveSiteByHost({ customDomain: host })
	if (!project) notFound()

	return (
		<RenderedSite
			site={project.site}
			look={project.look}
			media={project.media}
			slug={slug}
		/>
	)
}
