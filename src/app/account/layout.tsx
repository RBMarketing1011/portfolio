import { auth } from '@/lib/auth'
import { requireAccountMembership } from '@/lib/workspace/current'
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
	// An admin has no account of their own: with none being viewed they belong
	// in the admin area, not bounced to sign-in.
	const membership = await requireAccountMembership()
	const session = (await auth())!

	const email = session.user.email ?? 'Account'

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
		// No Admin link: an admin is only ever here viewing an account, and the
		// banner's "Back to admin" is the way out.
	]

	return (
		<AccountShell
			items={items}
			accountId={membership.workspace._id.toString()}
			accountName={membership.workspace.name}
			email={email}
			userName={session.user.name?.trim() || email.replace(/@.*$/, '')}
			userImage={session.user.image ?? null}
			viaAdmin={membership.viaAdmin}>
			{children}
		</AccountShell>
	)
}
