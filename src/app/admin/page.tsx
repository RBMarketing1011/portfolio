import Link from 'next/link'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { loadAdminData } from '@/lib/admin/queries'
import { DataTable } from './data-table'

export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
	const { accounts, sites, people } = await loadAdminData()

	const stats = [
		{ label: 'Accounts', value: accounts.length, href: '/admin/accounts' },
		{ label: 'Users', value: people.length, href: '/admin/users' },
		{ label: 'Websites', value: sites.length, href: '/admin/sites' },
		{
			label: 'Live websites',
			value: sites.filter((s) => s.status === 'live').length,
			href: '/admin/sites',
		},
	]

	return (
		<div className='space-y-8'>
			<div>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Overview
				</h1>
				<p className='mt-2 leading-7 text-slate-400'>
					Everything on the platform, across every account.
				</p>
			</div>

			<div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
				{stats.map((stat) => (
					<Link key={stat.label} href={stat.href}>
						<Card className='transition-colors hover:bg-accent'>
							<CardHeader>
								<CardDescription>{stat.label}</CardDescription>
								<CardTitle className='font-display text-3xl'>
									{stat.value}
								</CardTitle>
							</CardHeader>
						</Card>
					</Link>
				))}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Recently updated websites</CardTitle>
				</CardHeader>
				<CardContent>
					<DataTable
						empty='No websites yet.'
						columns={['Website', 'Account']}
						rows={sites.slice(0, 5).map((s) => [s.name, s.account])}
					/>
				</CardContent>
			</Card>
		</div>
	)
}
