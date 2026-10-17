import { NextResponse, after } from 'next/server'
import { ObjectId } from 'mongodb'
import { hash, verify } from '@node-rs/argon2'
import { z } from 'zod'
import { errorResponse, requireUserId } from '@/lib/auth/guards'
import { firstIssue, passwordSchema } from '@/lib/auth/password-policy'
import {
	attemptKeys,
	clearFailures,
	clientIp,
	isLockedOut,
	recordFailure,
} from '@/lib/auth/rate-limit'
import { mailAvailable, sendEmail } from '@/lib/email/send'
import { passwordChangedEmail } from '@/lib/email/templates'
import { getDb } from '@/lib/mongo'

export const runtime = 'nodejs'
export const maxDuration = 30

const schema = z.object({
	current: z.string().max(200).optional(),
	next: passwordSchema,
})

/**
 * Changes the signed-in person's password. A session alone is not enough when
 * the login already has a password: whoever sits down at an unlocked browser
 * must not be able to take the account over in one field. Wrong guesses count
 * against the same limiter as the sign-in form, so this cannot be used to
 * brute-force the current password either.
 *
 * The change signs every other session of theirs out (the session token
 * carries the password's version); the caller signs in again with the new
 * password to keep its own.
 */
export async function POST(request: Request) {
	try {
		const userId = await requireUserId()
		const parsed = schema.safeParse(await request.json().catch(() => null))
		if (!parsed.success)
			return NextResponse.json(
				{
					error: firstIssue(
						parsed.error,
						'New password must be at least 10 characters.',
					),
				},
				{ status: 400 },
			)

		const db = await getDb()
		const users = db.collection('users')
		const user = await users.findOne({ _id: new ObjectId(userId) })
		if (!user)
			return NextResponse.json({ error: 'Not found.' }, { status: 404 })

		const email = typeof user.email === 'string' ? user.email : null
		const keys = email ? attemptKeys(email, clientIp(request)) : []

		if (typeof user.passwordHash === 'string') {
			if (keys.length && (await isLockedOut(keys)))
				return NextResponse.json(
					{
						error:
							'Too many attempts. Wait fifteen minutes, or reset your password by email.',
					},
					{ status: 429 },
				)
			if (
				!parsed.data.current ||
				!(await verify(user.passwordHash, parsed.data.current))
			) {
				if (keys.length) await recordFailure(keys)
				return NextResponse.json(
					{ error: 'Your current password is not right.' },
					{ status: 400 },
				)
			}
		}

		const now = new Date()
		await users.updateOne(
			{ _id: user._id },
			{
				$set: {
					passwordHash: await hash(parsed.data.next),
					passwordChangedAt: now,
					updatedAt: now,
				},
			},
		)

		const notified = Boolean(email) && mailAvailable()
		if (email) {
			// A lockout earned by guessing the old password must not keep the new
			// one out, and the inbox is told so a change they did not make is caught.
			await clearFailures(keys)
			if (notified)
				after(async () => {
					try {
						await sendEmail({
							to: email,
							...passwordChangedEmail({ to: email, at: now }),
						})
					} catch (error) {
						console.error('[password] change notice not sent', error)
					}
				})
		}

		return NextResponse.json({ ok: true, email, notified })
	} catch (error) {
		return errorResponse(error)
	}
}
