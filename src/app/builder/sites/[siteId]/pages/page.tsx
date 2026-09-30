import { BuilderStart } from '@/app/builder/pages/builder-start'
import { loadTemplates } from '@/lib/builder/load-templates'

export const metadata = {
	title: 'Builder',
	robots: { index: false, follow: false },
}

export default async function SiteBuilderStart({
	params,
}: {
	params: Promise<{ siteId: string }>
}) {
	const { siteId } = await params
	return <BuilderStart templates={await loadTemplates()} siteId={siteId} />
}
