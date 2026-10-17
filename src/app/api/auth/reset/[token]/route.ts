import { NextResponse, after } from 'next/server'
import { ObjectId } from 'mongodb'
import { hash } from '@node-rs/argon2'
import { z } from 'zod'
import {
	livePasswordReset,
	PASSWORD_RESETS,
	type PasswordResetDoc,
} from '@/lib/auth/password-reset'
import { firstIssue, passwordSchema } from '@/lib/auth/password-policy'
import { attemptKeys, clearFailures, clientIp } from '@/lib/auth/rate-limit'
import { mailAvailable, sendEmail } from '@/lib/email/send'
import { passwordChangedEmail } from '@/lib/email/templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Params = { params: Promise<{ token: string }> }

const GONE = 'That reset link has expired or already been used.'
const UNAVAILABLE =
	'We could not reach our database just now. Your link is still valid, so try again in a moment.'

/** Lets the reset page say whose password is being reset before asking for one. */
export async function GET(_request: Request, { params }: Params) {
	const { token } = await params
	try {
		const { reset } = await livePasswordReset(token)
		if (!reset) return NextResponse.json({ error: GONE }, { status: 404 })
		return NextResponse.json({ email: reset.email })
	} catch (error) {
		console.error('[reset] could not read link', error)
		return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
	}
}

const schema = z.object({ password: passwordSchema })

export async function POST(request: Request, { params }: Params) {
	const { token } = await params
	const parsed = schema.safeParse(await request.json().catch(() => null))
	if (!parsed.success)
		return NextResponse.json(
			{
				error: firstIssue(
					parsed.error,
					'Choose a password of at least 10 characters.',
				),
			},
			{ status: 400 },
		)

	let live: Awaited<ReturnType<typeof livePasswordReset>>
	try {
		live = await livePasswordReset(token)
	} catch (error) {
		console.error('[reset] could not read link', error)
		return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
	}
	const { db, reset } = live
	if (!reset) return NextResponse.json({ error: GONE }, { status: 404 })

	// Hash before touching anything, so a hashing failure changes no state.
	const passwordHash = await hash(parsed.data.password)
	const resets = db.collection<PasswordResetDoc>(PASSWORD_RESETS)
	const users = db.collection('users')

	// Claim the link. Whoever deletes it owns it, so two submissions of the same
	// link cannot both set a password.
	const claimed = await resets.findOneAndDelete({ _id: reset._id })
	if (!claimed) return NextResponse.json({ error: GONE }, { status: 404 })

	const now = new Date()
	try {
		// Plain operators on purpose: an argon2 hash starts with `$`, which a
		// pipeline update would read as a field path and silently drop. The
		// change date is what signs every other session of theirs out.
		const updated = await users.updateOne(
			{ _id: new ObjectId(reset.userId) },
			{ $set: { passwordHash, passwordChangedAt: now, updatedAt: now } },
		)
		if (!updated.matchedCount)
			return NextResponse.json(
				{ error: 'That login no longer exists.' },
				{ status: 404 },
			)
	} catch (error) {
		// Nothing changed, so the link must still work: put it back as it was.
		await resets.insertOne(claimed).catch((restoreError: unknown) => {
			console.error('[reset] could not restore link', restoreError)
		})
		console.error('[reset] could not save password', error)
		return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
	}

	// Following an emailed link proves the inbox, if nothing had before. Any
	// other outstanding link for this person is now moot, and a lockout from
	// guessing the old password must not keep the new one out. None of this can
	// undo the reset, so a failure here is logged, not reported.
	try {
		await Promise.all([
			users.updateOne(
				{ _id: new ObjectId(reset.userId), emailVerified: { $in: [null] } },
				{ $set: { emailVerified: now } },
			),
			resets.deleteMany({ userId: reset.userId }),
			clearFailures(attemptKeys(reset.email, clientIp(request))),
		])
	} catch (error) {
		console.error('[reset] housekeeping deferred', error)
	}

	// After the response, kept alive by the platform, so a slow mail server
	// cannot hold up or fail the reset itself.
	const notified = mailAvailable()
	if (notified)
		after(async () => {
			try {
				await sendEmail({
					to: reset.email,
					...passwordChangedEmail({ to: reset.email, at: now }),
				})
			} catch (error) {
				console.error('[reset] password-changed notice not sent', error)
			}
		})

	return NextResponse.json({ ok: true, email: reset.email, notified })
}
