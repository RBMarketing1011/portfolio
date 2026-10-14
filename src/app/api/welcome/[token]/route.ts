import { NextResponse } from 'next/server'
import { hash } from '@node-rs/argon2'
import { z } from 'zod'
import { PLATFORM_INVITES, type PlatformInviteDoc } from '@/lib/admin'
import { getDb } from '@/lib/mongo'
import { hashInviteToken } from '@/lib/workspace/invites'
import { ensureOwnWorkspace } from '@/lib/workspace'
import { WORKSPACES, type WorkspaceDoc } from '@/lib/workspace/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

const GONE = 'That invitation has expired or already been used.'

async function liveInvite(token: string) {
	const db = await getDb()
	const invite = await db
		.collection<PlatformInviteDoc>(PLATFORM_INVITES)
		.findOne({
			tokenHash: hashInviteToken(token),
			expiresAt: { $gt: new Date() },
		})
	return { db, invite }
}

export async function GET(_request: Request, { params }: Params) {
	const { token } = await params
	const { invite } = await liveInvite(token)
	if (!invite) return NextResponse.json({ error: GONE }, { status: 404 })
	return NextResponse.json({ invite: { email: invite.email } })
}

const schema = z.object({
	password: z.string().min(10).max(200),
	name: z.string().trim().max(120).nullish(),
})

/** The one place a login can come into existence. The invitation names the
 *  address, so nothing about who is signing up is taken from the request. */
export async function POST(request: Request, { params }: Params) {
	const { token } = await params
	const parsed = schema.safeParse(await request.json().catch(() => null))
	if (!parsed.success)
		return NextResponse.json(
			{ error: 'Choose a password of at least 10 characters.' },
			{ status: 400 },
		)

	const { db, invite } = await liveInvite(token)
	if (!invite) return NextResponse.json({ error: GONE }, { status: 404 })

	// Claim the invitation first. Whoever deletes it owns it, so two parallel
	// submissions cannot both create a login.
	const claimed = await db
		.collection<PlatformInviteDoc>(PLATFORM_INVITES)
		.deleteOne({ _id: invite._id })
	if (!claimed.deletedCount)
		return NextResponse.json({ error: GONE }, { status: 404 })

	const now = new Date()
	let userId: string
	try {
		const result = await db.collection('users').insertOne({
			email: invite.email,
			name: parsed.data.name || null,
			emailVerified: now,
			passwordHash: await hash(parsed.data.password),
			role: invite.role,
			createdAt: now,
			updatedAt: now,
		})
		userId = result.insertedId.toString()
	} catch {
		return NextResponse.json(
			{ error: 'That email already has a login.' },
			{ status: 409 },
		)
	}

	// Admins run the platform; they do not get an account of their own to build in.
	const workspace =
		invite.role === 'admin' ? null : await ensureOwnWorkspace(userId)
	if (workspace && invite.accountName)
		await db
			.collection<WorkspaceDoc>(WORKSPACES)
			.updateOne(
				{ _id: workspace._id },
				{ $set: { name: invite.accountName, updatedAt: now } },
			)

	return NextResponse.json({ ok: true, email: invite.email })
}
