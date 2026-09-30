import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { errorResponse, requirePermission } from '@/lib/auth/guards'
import {
	hashInviteToken,
	INVITE_TTL_MS,
	newInviteToken,
	sendInviteEmail,
} from '@/lib/workspace/invites'
import {
	INVITES,
	MEMBERS,
	ROLES,
	type InviteDoc,
	type MemberDoc,
	type RoleDoc,
} from '@/lib/workspace/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const inviteSchema = z.object({
	email: z.string().email().max(254),
	roleId: z.string().min(1),
})

export async function POST(request: Request) {
	try {
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace, userId } = await requirePermission(
			'team.invite',
			workspaceId,
		)

		const parsed = inviteSchema.safeParse(
			await request.json().catch(() => null),
		)
		if (!parsed.success || !ObjectId.isValid(parsed.data.roleId))
			return NextResponse.json(
				{ error: 'Enter a valid email and pick a role.' },
				{ status: 400 },
			)

		const email = parsed.data.email.toLowerCase().trim()

		const role = await db.collection<RoleDoc>(ROLES).findOne({
			_id: new ObjectId(parsed.data.roleId),
			workspaceId: workspace._id,
		})
		if (!role)
			return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })

		const existingUser = await db.collection('users').findOne({ email })
		if (existingUser) {
			const already = await db.collection<MemberDoc>(MEMBERS).findOne({
				workspaceId: workspace._id,
				userId: existingUser._id.toString(),
			})
			if (already)
				return NextResponse.json(
					{ error: 'They are already on this account.' },
					{ status: 409 },
				)
		}

		const token = newInviteToken()
		const now = new Date()
		const invites = db.collection<InviteDoc>(INVITES)

		// Re-inviting replaces the outstanding invitation rather than stacking a
		// second live token for the same address.
		await invites.deleteMany({ workspaceId: workspace._id, email })
		const result = await invites.insertOne({
			workspaceId: workspace._id,
			email,
			roleId: role._id,
			tokenHash: hashInviteToken(token),
			invitedBy: userId,
			expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
			createdAt: now,
		} as InviteDoc)

		const session = await auth()
		try {
			await sendInviteEmail({
				to: email,
				token,
				accountName: workspace.name,
				invitedBy: session?.user?.email ?? 'Someone',
				roleName: role.name,
			})
		} catch (cause) {
			await invites.deleteOne({ _id: result.insertedId })
			return NextResponse.json(
				{
					error:
						cause instanceof Error && cause.message === 'mail-not-configured'
							? 'Email is not configured, so invitations cannot be sent yet.'
							: 'That invitation could not be sent.',
				},
				{ status: 503 },
			)
		}

		return NextResponse.json({ ok: true, email }, { status: 201 })
	} catch (error) {
		return errorResponse(error)
	}
}

export async function DELETE(request: Request) {
	try {
		const url = new URL(request.url)
		const { db, workspace } = await requirePermission(
			'team.invite',
			url.searchParams.get('workspace'),
		)

		const id = url.searchParams.get('id')
		if (!id || !ObjectId.isValid(id))
			return NextResponse.json(
				{ error: 'Invitation not found.' },
				{ status: 404 },
			)

		const removed = await db
			.collection<InviteDoc>(INVITES)
			.deleteOne({ _id: new ObjectId(id), workspaceId: workspace._id })
		if (!removed.deletedCount)
			return NextResponse.json(
				{ error: 'Invitation not found.' },
				{ status: 404 },
			)

		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
