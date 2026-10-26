import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isPlatformAdmin } from '@/lib/admin/role'
import { ADMIN_VIEW_COOKIE, WORKSPACE_COOKIE } from './cookie'
import { resolveMembership } from './index'

export { ADMIN_VIEW_COOKIE, WORKSPACE_COOKIE }

/**
 * Which account the request is acting in. A forged value is harmless: it is only
 * ever fed to `resolveMembership`, which refuses an account the caller is not in
 * and falls back to their own. An admin's selection is read only from the admin
 * view cookie, never the member one.
 */
export async function selectedWorkspaceId(userId: string) {
	const name = (await isPlatformAdmin(userId))
		? ADMIN_VIEW_COOKIE
		: WORKSPACE_COOKIE
	return (await cookies()).get(name)?.value ?? null
}

/** The one entry point server components should use, so no page can accidentally
 *  read the signed-in user's own account while they are working in another. */
export async function currentMembership() {
	const session = await auth()
	if (!session?.user?.id) return null
	return resolveMembership(
		session.user.id,
		await selectedWorkspaceId(session.user.id),
		{ preferred: true },
	)
}

/**
 * For pages under /account. With no account to show, an admin belongs in the
 * admin area and anyone else at sign-in. Each page must do this itself rather
 * than rely on the layout: a client navigation between account pages renders
 * only the page, so the layout's check does not run again.
 */
export async function requireAccountMembership() {
	const session = await auth()
	if (!session?.user?.id) redirect('/sign-in?next=/account')
	const membership = await resolveMembership(
		session.user.id,
		await selectedWorkspaceId(session.user.id),
		{ preferred: true },
	)
	if (!membership)
		redirect(
			(await isPlatformAdmin(session.user.id))
				? '/admin'
				: '/sign-in?next=/account',
		)
	return membership
}
