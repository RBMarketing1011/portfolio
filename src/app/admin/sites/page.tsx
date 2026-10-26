import { formatDate, loadAdminData } from '@/lib/admin/queries'
import { OpenAccountButton } from '../open-account-button'
import { DataTable } from '../data-table'

export const metadata = { title: 'Websites' }
export const dynamic = 'force-dynamic'

export default async function AdminSitesPage() {
	const { sites } = await loadAdminData()

	return (
		<div className='space-y-6'>
			<div>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Websites
				</h1>
				<p className='mt-2 leading-7 text-slate-400'>
					Every website across every account.
				</p>
			</div>
			<DataTable
				empty='No websites yet.'
				columns={['Website', 'Account', 'Address', 'Status', 'Pages', 'Updated', '']}
				rows={sites.map((s) => [
					s.name,
					s.account,
					s.address,
					s.status === 'live' ? 'Live' : 'Draft',
					s.pages,
					formatDate(s.updatedAt),
					<OpenAccountButton
						key={s.id}
						workspaceId={s.workspaceId}
						to={`/account/projects/${s.id}`}
						label='View website'
					/>,
				])}
			/>
		</div>
	)
}
