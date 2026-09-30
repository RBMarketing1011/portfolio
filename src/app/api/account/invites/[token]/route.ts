import { NextResponse } from 'next/server'
import { errorResponse, requireUserId } from '@/lib/auth/guards'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/mongo'
import { hashInviteToken } from '@/lib/workspace/invites'
import {
	INVITES,
	MEMBERS,
	WORKSPACES,
	type InviteDoc,
	type MemberDoc,
	type WorkspaceDoc,
} from '@/lib/workspace/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

async function liveInvite(token: string) {
	const db = await getDb()
	const invite = await db
		.collection<InviteDoc>(INVITES)
		.findOne({
			tokenHash: hashInviteToken(token),
			expiresAt: { $gt: new Date() },
		})
	return { db, invite }
}

/** Lets the accept page describe the invitation before asking anyone to sign in. */
export async function GET(_request: Request, { params }: Params) {
	try {
		const { token } = await params
		const { db, invite } = await liveInvite(token)
		if (!invite)
			return NextResponse.json(
				{ error: 'That invitation has expired or already been used.' },
				{ status: 404 },
			)

		const workspace = await db
			.collection<WorkspaceDoc>(WORKSPACES)
			.findOne({ _id: invite.workspaceId })

		return NextResponse.json({
			invite: {
				email: invite.email,
				accountName: workspace?.name ?? 'an account',
			},
		})
	} catch (error) {
		return errorResponse(error)
	}
}

export async function POST(_request: Request, { params }: Params) {
	try {
		const { token } = await params
		const userId = await requireUserId()
		const { db, invite } = await liveInvite(token)

		if (!invite)
			return NextResponse.json(
				{ error: 'That invitation has expired or already been used.' },
				{ status: 404 },
			)

		// The invitation names an address. Accepting it while signed in as someone
		// else would silently move the grant to the wrong person.
		const session = await auth()
		if (session?.user?.email?.toLowerCase() !== invite.email)
			return NextResponse.json(
				{
					error: `This invitation was sent to ${invite.email}. Sign in as that account to accept it.`,
				},
				{ status: 403 },
			)

		const members = db.collection<MemberDoc>(MEMBERS)
		const already = await members.findOne({
			workspaceId: invite.workspaceId,
			userId,
		})

		if (!already)
			await members.insertOne({
				workspaceId: invite.workspaceId,
				userId,
				roleId: invite.roleId,
				createdAt: new Date(),
			} as MemberDoc)

		// Single use.
		await db.collection<InviteDoc>(INVITES).deleteOne({ _id: invite._id })

		return NextResponse.json({
			ok: true,
			workspaceId: invite.workspaceId.toString(),
		})
	} catch (error) {
		return errorResponse(error)
	}
}
