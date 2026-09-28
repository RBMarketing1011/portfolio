import { redirect } from 'next/navigation'
import { LOCAL_SITE_ID } from '@/lib/builder/site-ids'

export default async function BuilderPageRoute({
	params,
}: {
	params: Promise<{ pageId: string }>
}) {
	const { pageId } = await params
	redirect(`/builder/sites/${LOCAL_SITE_ID}/pages/${pageId}`)
}
