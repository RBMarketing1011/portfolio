import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { errorResponse, requireUserId } from '@/lib/auth/guards'
import { listMemberships, resolveMembership } from '@/lib/workspace'
import { ADMIN_VIEW_COOKIE, WORKSPACE_COOKIE } from '@/lib/workspace/current'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ workspaceId: z.string().min(1) })

export async function GET() {
	try {
		const userId = await requireUserId()
		return NextResponse.json({ workspaces: await listMemberships(userId) })
	} catch (error) {
		return errorResponse(error)
	}
}

export async function POST(request: Request) {
	try {
		const userId = await requireUserId()
		const parsed = schema.safeParse(await request.json().catch(() => null))
		if (!parsed.success)
			return NextResponse.json({ error: 'Invalid account.' }, { status: 400 })

		// Membership is checked here rather than trusting the cookie later, so a
		// value that was never valid never gets written in the first place.
		const membership = await resolveMembership(userId, parsed.data.workspaceId)
		if (!membership)
			return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
		const base = {
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			path: '/',
		} as const
		const jar = await cookies()
		// An admin is viewing someone else's account: that lasts only as long as
		// the browser session, and never touches the member cookie.
		if (membership.viaAdmin) jar.set(ADMIN_VIEW_COOKIE, parsed.data.workspaceId, base)
		else
			jar.set(WORKSPACE_COOKIE, parsed.data.workspaceId, {
				...base,
				maxAge: 60 * 60 * 24 * 365,
			})

		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}

/** Leaves the selected account. For an admin that ends the visit entirely;
 *  a member falls back to their own account. */
export async function DELETE() {
	try {
		await requireUserId()
		const jar = await cookies()
		jar.delete(ADMIN_VIEW_COOKIE)
		jar.delete(WORKSPACE_COOKIE)
		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
