import { notFound } from 'next/navigation'
import { RenderedSite } from '@/components/rendered-site'
import { liveSiteByHost } from '@/lib/builder/public-site'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
	params,
}: {
	params: Promise<{ label: string }>
}) {
	const { label } = await params
	const project = await liveSiteByHost({ subdomain: label })
	return { title: project?.name ?? 'Not found' }
}

export default async function HostedSubdomainPage({
	params,
}: {
	params: Promise<{ label: string; slug?: string[] }>
}) {
	const { label, slug } = await params
	const project = await liveSiteByHost({ subdomain: label })
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
