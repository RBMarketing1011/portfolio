import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import { errorResponse, requireUserId } from '@/lib/auth/guards'
import { getDb } from '@/lib/mongo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ name: z.string().max(80) })

export async function PATCH(request: Request) {
	try {
		const userId = await requireUserId()

		const parsed = schema.safeParse(await request.json().catch(() => null))
		if (!parsed.success)
			return NextResponse.json(
				{ error: 'Names are limited to 80 characters.' },
				{ status: 400 },
			)

		const name = parsed.data.name.trim()
		const db = await getDb()
		await db
			.collection('users')
			.updateOne(
				{ _id: new ObjectId(userId) },
				{ $set: { name: name || null, updatedAt: new Date() } },
			)

		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
