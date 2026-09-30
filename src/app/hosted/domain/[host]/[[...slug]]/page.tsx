import { notFound } from 'next/navigation'
import { RenderedSite } from '@/components/rendered-site'
import { SiteInactive } from '@/components/site-inactive'
import { resolveHost } from '@/lib/builder/public-site'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
	params,
}: {
	params: Promise<{ host: string }>
}) {
	const { host } = await params
	const found = await resolveHost({ customDomain: host })
	return found.state === 'live'
		? { title: found.site.name }
		: { title: 'Not live', robots: { index: false, follow: false } }
}

export default async function HostedDomainPage({
	params,
}: {
	params: Promise<{ host: string; slug?: string[] }>
}) {
	const { host, slug } = await params
	const found = await resolveHost({ customDomain: host })

	if (found.state === 'unknown') notFound()
	if (found.state === 'inactive') return <SiteInactive host={host} />

	return (
		<RenderedSite
			site={found.site.site}
			look={found.site.look}
			media={found.site.media}
			slug={slug}
		/>
	)
}
