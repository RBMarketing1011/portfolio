import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isPlatformAdmin } from '@/lib/admin/role'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Where a sign-in with no destination of its own ends up. The form cannot tell
 * an admin from a member, so it comes here and the server decides: admins have
 * no account of their own and start in the admin area.
 */
export async function GET(request: Request) {
	const session = await auth()
	const path = !session?.user?.id
		? '/sign-in'
		: (await isPlatformAdmin(session.user.id))
			? '/admin'
			: '/account'
	return NextResponse.redirect(new URL(path, request.url))
}
