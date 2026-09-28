import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { LOCAL_SITE_ID } from '@/lib/builder/site-ids'

/** The builder moved under /builder/sites/<id>. Signed in, that means the
 *  dashboard; signed out, the browser-local site. */
export default async function PagesIndex() {
	if ((await auth())?.user?.id) redirect('/builder/sites')
	redirect(`/builder/sites/${LOCAL_SITE_ID}/pages`)
}
