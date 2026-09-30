import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { errorResponse, requirePermission } from '@/lib/auth/guards'
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

export async function GET(request: Request) {
	try {
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace, userId } = await requirePermission(
			'team.view',
			workspaceId,
		)

		const [members, roles, invites] = await Promise.all([
			db
				.collection<MemberDoc>(MEMBERS)
				.find({ workspaceId: workspace._id })
				.toArray(),
			db
				.collection<RoleDoc>(ROLES)
				.find({ workspaceId: workspace._id })
				.toArray(),
			db
				.collection<InviteDoc>(INVITES)
				.find({ workspaceId: workspace._id, expiresAt: { $gt: new Date() } })
				.toArray(),
		])

		const users = await db
			.collection('users')
			.find(
				{ _id: { $in: members.map((m) => new ObjectId(m.userId)) } },
				{ projection: { email: 1, name: 1 } },
			)
			.toArray()

		const byId = new Map(users.map((u) => [u._id.toString(), u]))
		const roleName = new Map(roles.map((r) => [r._id.toString(), r.name]))

		return NextResponse.json({
			you: userId,
			members: members.map((member) => ({
				id: member._id.toString(),
				userId: member.userId,
				email: (byId.get(member.userId)?.email as string) ?? 'Unknown',
				name: (byId.get(member.userId)?.name as string | null) ?? null,
				roleId: member.roleId.toString(),
				roleName: roleName.get(member.roleId.toString()) ?? 'No role',
				isOwner: workspace.ownerId === member.userId,
				joinedAt: member.createdAt.toISOString(),
			})),
			invites: invites.map((invite) => ({
				id: invite._id.toString(),
				email: invite.email,
				roleId: invite.roleId.toString(),
				roleName: roleName.get(invite.roleId.toString()) ?? 'No role',
				expiresAt: invite.expiresAt.toISOString(),
			})),
		})
	} catch (error) {
		return errorResponse(error)
	}
}
