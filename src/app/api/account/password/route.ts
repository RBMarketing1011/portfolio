import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { hash } from '@node-rs/argon2'
import { z } from 'zod'
import { errorResponse, requireUserId } from '@/lib/auth/guards'
import { getDb } from '@/lib/mongo'

export const runtime = 'nodejs'

const schema = z.object({
	next: z.string().min(10).max(200),
})

export async function POST(request: Request) {
	try {
		const userId = await requireUserId()
		const parsed = schema.safeParse(await request.json())
		if (!parsed.success)
			return NextResponse.json(
				{ error: 'New password must be at least 10 characters.' },
				{ status: 400 },
			)

		const db = await getDb()
		const users = db.collection('users')
		const user = await users.findOne({ _id: new ObjectId(userId) })
		if (!user)
			return NextResponse.json({ error: 'Not found.' }, { status: 404 })

		// Being signed in is the proof: whoever has a session for this account may
		// set its password, whether or not it had one before.
		await users.updateOne(
			{ _id: user._id },
			{
				$set: {
					passwordHash: await hash(parsed.data.next),
					updatedAt: new Date(),
				},
			},
		)

		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
