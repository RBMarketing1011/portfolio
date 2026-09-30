import { auth } from '@/lib/auth'
import { PageEditor } from '@/app/builder/pages/page-editor'

export const metadata = {
	title: 'Builder',
	robots: { index: false, follow: false },
}

export default async function SiteBuilderPageRoute({
	params,
}: {
	params: Promise<{ siteId: string; pageId: string }>
}) {
	const { siteId, pageId } = await params
	return (
		<PageEditor
			pageId={pageId}
			siteId={siteId}
			signedIn={Boolean((await auth())?.user?.id)}
		/>
	)
}
