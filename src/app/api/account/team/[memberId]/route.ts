import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { errorResponse, HttpError, requirePermission } from '@/lib/auth/guards'
import {
	MEMBERS,
	ROLES,
	type MemberDoc,
	type RoleDoc,
} from '@/lib/workspace/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ memberId: string }> }

const patchSchema = z.object({ roleId: z.string().min(1) })

async function loadMember(
	memberId: string,
	workspaceId: ObjectId,
	db: Awaited<ReturnType<typeof requirePermission>>['db'],
) {
	if (!ObjectId.isValid(memberId)) throw new HttpError(404, 'Member not found.')
	const member = await db
		.collection<MemberDoc>(MEMBERS)
		.findOne({ _id: new ObjectId(memberId), workspaceId })
	if (!member) throw new HttpError(404, 'Member not found.')
	return member
}

export async function PATCH(request: Request, { params }: Params) {
	try {
		const { memberId } = await params
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace } = await requirePermission(
			'team.manage',
			workspaceId,
		)

		const parsed = patchSchema.safeParse(await request.json().catch(() => null))
		if (!parsed.success || !ObjectId.isValid(parsed.data.roleId))
			return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })

		const member = await loadMember(memberId, workspace._id, db)

		// The owner's access is structural, not granted by a role. Letting anyone
		// re-role them is how an account ends up with nobody who can fix it.
		if (member.userId === workspace.ownerId)
			return NextResponse.json(
				{ error: 'The account owner\u2019s role cannot be changed.' },
				{ status: 400 },
			)

		const role = await db
			.collection<RoleDoc>(ROLES)
			.findOne({
				_id: new ObjectId(parsed.data.roleId),
				workspaceId: workspace._id,
			})
		if (!role)
			return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })

		await db
			.collection<MemberDoc>(MEMBERS)
			.updateOne({ _id: member._id }, { $set: { roleId: role._id } })

		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}

export async function DELETE(request: Request, { params }: Params) {
	try {
		const { memberId } = await params
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace } = await requirePermission(
			'team.manage',
			workspaceId,
		)

		const member = await loadMember(memberId, workspace._id, db)

		if (member.userId === workspace.ownerId)
			return NextResponse.json(
				{ error: 'The account owner cannot be removed.' },
				{ status: 400 },
			)

		await db.collection<MemberDoc>(MEMBERS).deleteOne({ _id: member._id })
		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
