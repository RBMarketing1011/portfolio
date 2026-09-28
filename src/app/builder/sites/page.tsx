import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { SitesDashboard } from './sites-dashboard'

export const metadata = {
	title: 'My Sites',
	robots: { index: false, follow: false },
}

export default async function SitesPage() {
	if (!(await auth())?.user?.id) redirect('/sign-in?next=/builder/sites')

	return (
		<div className='mx-auto w-full max-w-6xl px-6 sm:px-10 lg:px-16'>
			<SitesDashboard />
		</div>
	)
}
