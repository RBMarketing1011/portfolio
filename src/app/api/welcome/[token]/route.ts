import { NextResponse } from 'next/server'
import { MongoServerError } from 'mongodb'
import { hash } from '@node-rs/argon2'
import { z } from 'zod'
import { PLATFORM_INVITES, type PlatformInviteDoc } from '@/lib/admin'
import { firstIssue, nameSchema, passwordSchema } from '@/lib/auth/password-policy'
import { attemptKeys, clearFailures, clientIp } from '@/lib/auth/rate-limit'
import { getDb } from '@/lib/mongo'
import { hashInviteToken } from '@/lib/workspace/invites'
import { ensureOwnWorkspace } from '@/lib/workspace'
import { WORKSPACES, type WorkspaceDoc } from '@/lib/workspace/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Argon2 plus a cold Atlas connection must finish before the platform limit,
// or the error path below never runs.
export const maxDuration = 30

type Params = { params: Promise<{ token: string }> }

const GONE =
	'That invitation has expired, was replaced by a newer one, or has already been used. Open the most recent invitation email, or ask to be invited again.'
const HAS_LOGIN =
	'This email already has a login. Sign in instead, or reset your password if you have forgotten it.'
const UNAVAILABLE =
	'We could not reach our database just now. Your invitation is still valid, so try again in a moment.'

async function liveInvite(token: string) {
	const db = await getDb()
	const invite = await db
		.collection<PlatformInviteDoc>(PLATFORM_INVITES)
		.findOne({
			tokenHash: hashInviteToken(token),
			expiresAt: { $gt: new Date() },
		})
	return { db, invite }
}

export async function GET(_request: Request, { params }: Params) {
	const { token } = await params
	try {
		const { db, invite } = await liveInvite(token)
		if (!invite) return NextResponse.json({ error: GONE }, { status: 404 })

		// An invitation that outlived the creation of a login (another admin, the
		// grant script) should send them to sign in, not to a form that will fail.
		const existing = await db
			.collection('users')
			.findOne({ email: invite.email }, { projection: { _id: 1 } })
		if (existing)
			return NextResponse.json(
				{ error: HAS_LOGIN, email: invite.email, hasLogin: true },
				{ status: 409 },
			)

		return NextResponse.json({
			invite: { email: invite.email, accountName: invite.accountName },
		})
	} catch (error) {
		console.error('[welcome] could not read invitation', error)
		return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
	}
}

const schema = z.object({ password: passwordSchema, name: nameSchema })

/**
 * The one place a login can come into existence from an invitation. The
 * invitation names the address, so nothing about who is signing up is taken
 * from the request.
 *
 * Ordered so that no failure can strand the person: nothing is claimed until
 * the password is hashed and the address is known to be free, the claim is
 * put back if the insert fails, and once the login exists the answer is
 * success whatever happens to the account bootstrap after it.
 */
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

	let live: Awaited<ReturnType<typeof liveInvite>>
	try {
		live = await liveInvite(token)
	} catch (error) {
		console.error('[welcome] could not read invitation', error)
		return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
	}
	const { db, invite } = live
	if (!invite) return NextResponse.json({ error: GONE }, { status: 404 })

	const users = db.collection('users')
	const invites = db.collection<PlatformInviteDoc>(PLATFORM_INVITES)

	let passwordHash: string
	try {
		if (await users.findOne({ email: invite.email }, { projection: { _id: 1 } }))
			return NextResponse.json(
				{ error: HAS_LOGIN, email: invite.email, hasLogin: true },
				{ status: 409 },
			)
		passwordHash = await hash(parsed.data.password)
	} catch (error) {
		console.error('[welcome] could not prepare login', error)
		return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
	}

	// Claim the invitation. Whoever deletes it owns it, so two parallel
	// submissions cannot both create a login.
	const claimed = await invites.findOneAndDelete({ _id: invite._id })
	if (!claimed) return NextResponse.json({ error: GONE }, { status: 404 })

	const now = new Date()
	let userId: string
	try {
		const result = await users.insertOne({
			email: invite.email,
			name: parsed.data.name || null,
			emailVerified: now,
			passwordHash,
			role: invite.role,
			createdAt: now,
			updatedAt: now,
		})
		userId = result.insertedId.toString()
	} catch (error) {
		// No login exists, so the invitation must: put it back exactly as it was.
		await invites.insertOne(claimed).catch((restoreError: unknown) => {
			console.error('[welcome] could not restore invitation', restoreError)
		})
		if (error instanceof MongoServerError && error.code === 11000)
			return NextResponse.json(
				{ error: HAS_LOGIN, email: invite.email, hasLogin: true },
				{ status: 409 },
			)
		console.error('[welcome] could not create login', error)
		return NextResponse.json(
			{
				error:
					'We could not create your login. Your invitation is still valid, so try again in a minute.',
			},
			{ status: 503 },
		)
	}

	// From here the login exists, and the answer is success whatever happens
	// next: the account is created on first visit if this does not finish.
	try {
		// Guesses made at the sign-in page before the link was opened must not
		// lock out the password chosen just now: the link proved the inbox.
		await clearFailures(attemptKeys(invite.email, clientIp(request)))
		// Admins run the platform; they do not get an account of their own to build in.
		const workspace =
			invite.role === 'admin' ? null : await ensureOwnWorkspace(userId)
		if (workspace && invite.accountName)
			await db
				.collection<WorkspaceDoc>(WORKSPACES)
				.updateOne(
					{ _id: workspace._id },
					{ $set: { name: invite.accountName, updatedAt: now } },
				)
	} catch (error) {
		console.error('[welcome] account bootstrap deferred to first visit', error)
	}

	return NextResponse.json({ ok: true, email: invite.email })
}
