import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/auth/guards'
import { getDb } from '@/lib/mongo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ role: z.enum(['member', 'admin']) })

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const { userId } = await requireAdmin()
		const { id } = await params
		const parsed = schema.safeParse(await request.json().catch(() => null))
		if (!ObjectId.isValid(id) || !parsed.success)
			return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

		// Otherwise the last admin can demote themselves and nobody can undo it
		// short of the grant script.
		if (id === userId)
			return NextResponse.json(
				{ error: 'You cannot change your own role.' },
				{ status: 400 },
			)

		const db = await getDb()
		const result = await db
			.collection('users')
			.updateOne(
				{ _id: new ObjectId(id) },
				{ $set: { role: parsed.data.role, updatedAt: new Date() } },
			)
		if (!result.matchedCount)
			return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
