import 'server-only'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { resolveMembership } from './index'

export const WORKSPACE_COOKIE = 'rb.workspace'

/**
 * Which account the request is acting in. A forged value is harmless: it is only
 * ever fed to `resolveMembership`, which refuses an account the caller is not in
 * and falls back to their own.
 */
export async function currentWorkspaceId() {
	return (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null
}

/** The one entry point server components should use, so no page can accidentally
 *  read the signed-in user's own account while they are working in another. */
export async function currentMembership() {
	const session = await auth()
	if (!session?.user?.id) return null
	return resolveMembership(session.user.id, await currentWorkspaceId(), {
		preferred: true,
	})
}
