import { requireAdminPage } from '@/lib/admin'
import { loadAdminData } from '@/lib/admin/queries'
import { UsersManager } from './users-manager'

export const metadata = { title: 'Users' }
export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
	const { userId } = await requireAdminPage()
	const { people } = await loadAdminData()

	return <UsersManager you={userId} people={people} />
}
