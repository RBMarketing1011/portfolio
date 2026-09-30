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

type Params = { params: Promise<{ roleId: string }> }

const patchSchema = z.object({
	name: z.string().min(1).max(60).optional(),
	permissions: z.array(z.string().max(64)).max(64).optional(),
})

export async function PATCH(request: Request, { params }: Params) {
	try {
		const { roleId } = await params
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace } = await requirePermission(
			'roles.manage',
			workspaceId,
		)

		if (!ObjectId.isValid(roleId))
			return NextResponse.json({ error: 'Role not found.' }, { status: 404 })

		const parsed = patchSchema.safeParse(await request.json().catch(() => null))
		if (!parsed.success)
			return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })

		const roles = db.collection<RoleDoc>(ROLES)
		const role = await roles.findOne({
			_id: new ObjectId(roleId),
			workspaceId: workspace._id,
		})
		if (!role)
			return NextResponse.json({ error: 'Role not found.' }, { status: 404 })

		// Admin is the account's escape hatch. If it can be narrowed, an account can
		// be left with nobody able to manage roles.
		if (role.system)
			return NextResponse.json(
				{ error: 'The Admin role cannot be changed.' },
				{ status: 400 },
			)

		const next: Partial<RoleDoc> = {}
		if (parsed.data.name !== undefined) next.name = parsed.data.name.trim()
		if (parsed.data.permissions !== undefined)
			next.permissions = sanitizePermissions(parsed.data.permissions)

		if (next.name && next.name !== role.name) {
			const clash = await roles.findOne({
				workspaceId: workspace._id,
				name: next.name,
			})
			if (clash)
				return NextResponse.json(
					{ error: 'A role with that name already exists.' },
					{ status: 409 },
				)
		}

		await roles.updateOne({ _id: role._id }, { $set: next })
		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}

export async function DELETE(request: Request, { params }: Params) {
	try {
		const { roleId } = await params
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace } = await requirePermission(
			'roles.manage',
			workspaceId,
		)

		if (!ObjectId.isValid(roleId))
			return NextResponse.json({ error: 'Role not found.' }, { status: 404 })

		const role = await db
			.collection<RoleDoc>(ROLES)
			.findOne({ _id: new ObjectId(roleId), workspaceId: workspace._id })
		if (!role)
			return NextResponse.json({ error: 'Role not found.' }, { status: 404 })

		if (role.system)
			return NextResponse.json(
				{ error: 'The Admin role cannot be deleted.' },
				{ status: 400 },
			)

		// Deleting a role out from under a member would leave them with access but
		// no permissions to resolve, so the role has to be emptied first.
		const inUse = await db
			.collection<MemberDoc>(MEMBERS)
			.countDocuments({ workspaceId: workspace._id, roleId: role._id })
		if (inUse)
			return NextResponse.json(
				{ error: 'Move everyone off this role before deleting it.' },
				{ status: 409 },
			)

		await db.collection<RoleDoc>(ROLES).deleteOne({ _id: role._id })
		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
