import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { hash, verify } from '@node-rs/argon2'
import { z } from 'zod'
import { errorResponse, requireUserId } from '@/lib/auth/guards'
import { getDb } from '@/lib/mongo'

export const runtime = 'nodejs'

const schema = z.object({
	current: z.string().max(200).optional().default(''),
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

		// Someone who signed up by magic link has no password yet, so there is
		// nothing to prove. Anyone who does have one must prove it.
		if (user.passwordHash) {
			if (!(await verify(user.passwordHash, parsed.data.current)))
				return NextResponse.json(
					{ error: 'That current password is not right.' },
					{ status: 403 },
				)
		}

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
