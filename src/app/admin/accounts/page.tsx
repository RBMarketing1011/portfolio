import { formatDate, loadAdminData } from '@/lib/admin/queries'
import { OpenAccountButton } from '../open-account-button'
import { DataTable } from '../data-table'

export const metadata = { title: 'Accounts' }
export const dynamic = 'force-dynamic'

export default async function AdminAccountsPage() {
	const { accounts } = await loadAdminData()

	return (
		<div className='space-y-6'>
			<div>
				<h1 className='font-display text-3xl font-semibold text-white'>
					Accounts
				</h1>
				<p className='mt-2 leading-7 text-slate-400'>
					Every team that builds on the platform.
				</p>
			</div>
			<DataTable
				empty='No accounts yet.'
				columns={['Account', 'Owner', 'Members', 'Websites', 'Created', '']}
				rows={accounts.map((a) => [
					a.name,
					a.owner,
					a.members,
					a.sites,
					formatDate(a.createdAt),
					<OpenAccountButton key={a.id} workspaceId={a.id} />,
				])}
			/>
		</div>
	)
}
