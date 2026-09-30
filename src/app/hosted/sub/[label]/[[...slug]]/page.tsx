import { notFound } from 'next/navigation'
import { RenderedSite } from '@/components/rendered-site'
import { SiteInactive } from '@/components/site-inactive'
import { appHost } from '@/lib/app-url'
import { resolveHost } from '@/lib/builder/public-site'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
	params,
}: {
	params: Promise<{ label: string }>
}) {
	const { label } = await params
	const found = await resolveHost({ subdomain: label })
	return found.state === 'live'
		? { title: found.site.name }
		: { title: 'Not live', robots: { index: false, follow: false } }
}

export default async function HostedSubdomainPage({
	params,
}: {
	params: Promise<{ label: string; slug?: string[] }>
}) {
	const { label, slug } = await params
	const found = await resolveHost({ subdomain: label })

	if (found.state === 'unknown') notFound()
	if (found.state === 'inactive')
		return <SiteInactive host={`${label}.${appHost}`} />

	return (
		<RenderedSite
			site={found.site.site}
			look={found.site.look}
			media={found.site.media}
			slug={slug}
		/>
	)
}
