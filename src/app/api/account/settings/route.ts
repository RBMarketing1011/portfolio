import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { del } from '@vercel/blob'
import { z } from 'zod'
import { errorResponse, requirePermission } from '@/lib/auth/guards'
import type { SiteDoc } from '@/lib/builder/site-doc'
import { WORKSPACE_COOKIE } from '@/lib/workspace/current'
import {
	INVITES,
	MEMBERS,
	ROLES,
	WORKSPACES,
	type WorkspaceDoc,
} from '@/lib/workspace/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ name: z.string().min(1).max(80) })

export async function PATCH(request: Request) {
	try {
		const { db, workspace } = await requirePermission('account.manage')

		const parsed = schema.safeParse(await request.json().catch(() => null))
		if (!parsed.success)
			return NextResponse.json(
				{ error: 'Enter a name between 1 and 80 characters.' },
				{ status: 400 },
			)

		await db
			.collection<WorkspaceDoc>(WORKSPACES)
			.updateOne(
				{ _id: workspace._id },
				{ $set: { name: parsed.data.name.trim(), updatedAt: new Date() } },
			)

		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}

/**
 * Only the owner, and only after typing the name back. Everything under the
 * account goes, for everyone on it, so this cannot be a one-click action.
 */
export async function DELETE(request: Request) {
	try {
		const { db, workspace, isOwner } = await requirePermission('account.manage')
		if (!isOwner)
			return NextResponse.json(
				{ error: 'Only the account owner can delete it.' },
				{ status: 403 },
			)

		const body = await request.json().catch(() => null)
		if (
			!body ||
			typeof body.confirm !== 'string' ||
			body.confirm.trim() !== workspace.name
		)
			return NextResponse.json(
				{ error: 'Type the account name exactly to confirm.' },
				{ status: 400 },
			)

		const sites = await db
			.collection<SiteDoc>('sites')
			.find({ workspaceId: workspace._id })
			.toArray()

		// Blobs outlive their documents unless they go first.
		const urls = sites.flatMap((site) =>
			(site.media ?? []).map((item) => item.url),
		)
		if (urls.length) await del(urls).catch(() => {})

		await db.collection('sites').deleteMany({ workspaceId: workspace._id })
		for (const name of [MEMBERS, ROLES, INVITES])
			await db.collection(name).deleteMany({ workspaceId: workspace._id })
		await db.collection(WORKSPACES).deleteOne({ _id: workspace._id })

		// The cookie now names an account that does not exist; clearing it sends
		// them back to their own on the next request.
		;(await cookies()).delete(WORKSPACE_COOKIE)

		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
