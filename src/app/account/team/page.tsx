import { notFound } from 'next/navigation'
import { requireAccountMembership } from '@/lib/workspace/current'
import { TeamManager } from './team-manager'

export const metadata = { title: 'Team' }
export const dynamic = 'force-dynamic'

export default async function TeamPage() {
	const membership = await requireAccountMembership()
	if (!membership.permissions.has('team.view')) notFound()

	return (
		<TeamManager
			you={membership.userId}
			can={{
				invite: membership.permissions.has('team.invite'),
				manage: membership.permissions.has('team.manage'),
				roles: membership.permissions.has('roles.manage'),
			}}
		/>
	)
}
