import { redirect } from 'next/navigation'
import { LOCAL_SITE_ID } from '@/lib/builder/site-ids'

export default function PreviewIndex() {
	redirect(`/preview/${LOCAL_SITE_ID}`)
}
