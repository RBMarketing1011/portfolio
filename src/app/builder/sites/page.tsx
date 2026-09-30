import { redirect } from 'next/navigation'

export const metadata = {
	title: 'My Sites',
	robots: { index: false, follow: false },
}

/** The project list moved into the account backend; the builder is now only the
 *  editor. Kept so older links and bookmarks still land somewhere real. */
export default function SitesPage() {
	redirect('/account/projects')
}
