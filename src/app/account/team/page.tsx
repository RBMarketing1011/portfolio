import { notFound } from 'next/navigation'
import { currentMembership } from '@/lib/workspace/current'
import { TeamManager } from './team-manager'

export const metadata = { title: 'Team' }
export const dynamic = 'force-dynamic'

export default async function TeamPage() {
	const membership = await currentMembership()
	if (!membership?.permissions.has('team.view')) notFound()

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
