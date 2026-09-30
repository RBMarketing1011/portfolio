import { notFound } from 'next/navigation'
import { currentMembership } from '@/lib/workspace/current'
import { MEMBERS, type MemberDoc } from '@/lib/workspace/types'
import type { SiteDoc } from '@/lib/builder/site-doc'
import { AccountSettings } from './account-settings'

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function AccountSettingsPage() {
	const membership = await currentMembership()
	if (!membership) notFound()

	const { db, workspace } = membership
	const [projects, people] = await Promise.all([
		db
			.collection<SiteDoc>('sites')
			.countDocuments({ workspaceId: workspace._id }),
		db
			.collection<MemberDoc>(MEMBERS)
			.countDocuments({ workspaceId: workspace._id }),
	])

	return (
		<AccountSettings
			name={workspace.name}
			canManage={membership.permissions.has('account.manage')}
			isOwner={membership.isOwner}
			projects={projects}
			people={people}
			roleName={membership.isOwner ? 'Account owner' : membership.role.name}
			createdAt={workspace.createdAt.toISOString()}
		/>
	)
}
