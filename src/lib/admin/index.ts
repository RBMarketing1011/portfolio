import 'server-only'
import type { ObjectId } from 'mongodb'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { HttpError } from '@/lib/auth/guards'
import { isPlatformAdmin } from './role'

export { isPlatformAdmin } from './role'

/** For route handlers. Anyone who is not an admin gets 404, so the surface does
 *  not reveal that an admin area exists. */
export async function requireAdmin() {
	const session = await auth()
	if (!session?.user?.id) throw new HttpError(401, 'Sign in to continue.')
	if (!(await isPlatformAdmin(session.user.id)))
		throw new HttpError(404, 'Not found.')
	return { userId: session.user.id, email: session.user.email ?? '' }
}

/** For server components under /admin. */
export async function requireAdminPage() {
	const session = await auth()
	if (!session?.user?.id) redirect('/sign-in?next=/admin')
	if (!(await isPlatformAdmin(session.user.id))) redirect('/account')
	return { userId: session.user.id, email: session.user.email ?? '' }
}

export const PLATFORM_INVITES = 'platformInvites'

export type PlatformInviteDoc = {
	_id: ObjectId
	email: string
	/** Name for the account created when the invitation is accepted. */
	accountName: string | null
	role: 'member' | 'admin'
	tokenHash: string
	invitedBy: string
	expiresAt: Date
	createdAt: Date
}
