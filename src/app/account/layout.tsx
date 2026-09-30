import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listMemberships } from '@/lib/workspace'
import { currentMembership } from '@/lib/workspace/current'
import { AccountShell } from './account-shell'
import type { NavItem } from './account-nav'

export const metadata = {
	title: { default: 'Account', template: '%s | Account' },
	robots: { index: false, follow: false },
}

export default async function AccountLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const session = await auth()
	if (!session?.user?.id) redirect('/sign-in?next=/account')

	const membership = await currentMembership()
	if (!membership) redirect('/sign-in?next=/account')

	const accounts = await listMemberships(session.user.id)

	// The sidebar must not advertise a page the role cannot open.
	const items: NavItem[] = [
		{ href: '/account', label: 'Overview', icon: 'overview' },
		...(membership.permissions.has('projects.view')
			? ([
					{ href: '/account/projects', label: 'Projects', icon: 'projects' },
				] as NavItem[])
			: []),
		...(membership.permissions.has('team.view')
			? ([{ href: '/account/team', label: 'Team', icon: 'team' }] as NavItem[])
			: []),
		...(membership.permissions.has('projects.view')
			? ([
					{ href: '/account/media', label: 'Media', icon: 'media' },
				] as NavItem[])
			: []),
		{ href: '/account/settings', label: 'Account settings', icon: 'settings' },
	]

	return (
		<AccountShell
			items={items}
			accountName={membership.workspace.name}
			accounts={accounts}
			currentAccountId={membership.workspace._id.toString()}
			email={session.user.email ?? 'Account'}
			roleName={membership.isOwner ? 'Account owner' : membership.role.name}>
			{children}
		</AccountShell>
	)
}
