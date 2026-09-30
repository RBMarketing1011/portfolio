import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { errorResponse, requirePermission } from '@/lib/auth/guards'
import { sanitizePermissions } from '@/lib/workspace/permissions'
import {
	MEMBERS,
	ROLES,
	type MemberDoc,
	type RoleDoc,
} from '@/lib/workspace/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const roleSchema = z.object({
	name: z.string().min(1).max(60),
	permissions: z.array(z.string().max(64)).max(64),
})

export async function GET(request: Request) {
	try {
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace } = await requirePermission('team.view', workspaceId)

		const [roles, members] = await Promise.all([
			db
				.collection<RoleDoc>(ROLES)
				.find({ workspaceId: workspace._id })
				.sort({ system: -1, name: 1 })
				.toArray(),
			db
				.collection<MemberDoc>(MEMBERS)
				.find({ workspaceId: workspace._id })
				.toArray(),
		])

		const counts = new Map<string, number>()
		for (const member of members) {
			const key = member.roleId.toString()
			counts.set(key, (counts.get(key) ?? 0) + 1)
		}

		return NextResponse.json({
			roles: roles.map((role) => ({
				id: role._id.toString(),
				name: role.name,
				permissions: sanitizePermissions(role.permissions),
				system: role.system,
				members: counts.get(role._id.toString()) ?? 0,
			})),
		})
	} catch (error) {
		return errorResponse(error)
	}
}

export async function POST(request: Request) {
	try {
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace } = await requirePermission(
			'roles.manage',
			workspaceId,
		)

		const parsed = roleSchema.safeParse(await request.json().catch(() => null))
		if (!parsed.success)
			return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })

		const name = parsed.data.name.trim()
		const roles = db.collection<RoleDoc>(ROLES)

		if (await roles.findOne({ workspaceId: workspace._id, name }))
			return NextResponse.json(
				{ error: 'A role with that name already exists.' },
				{ status: 409 },
			)

		const result = await roles.insertOne({
			workspaceId: workspace._id,
			name,
			// Unknown keys are dropped here, so a crafted body cannot invent a
			// permission that some future check might honour.
			permissions: sanitizePermissions(parsed.data.permissions),
			system: false,
			createdAt: new Date(),
		} as RoleDoc)

		return NextResponse.json(
			{ role: { id: (result.insertedId as ObjectId).toString(), name } },
			{ status: 201 },
		)
	} catch (error) {
		return errorResponse(error)
	}
}
