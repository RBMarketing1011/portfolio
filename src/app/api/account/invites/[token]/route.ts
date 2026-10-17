import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { MongoServerError, type ObjectId } from 'mongodb'
import { hash } from '@node-rs/argon2'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { errorResponse, requireTrustedOrigin } from '@/lib/auth/guards'
import { firstIssue, nameSchema, passwordSchema } from '@/lib/auth/password-policy'
import { attemptKeys, clearFailures, clientIp } from '@/lib/auth/rate-limit'
import { getDb } from '@/lib/mongo'
import { WORKSPACE_COOKIE } from '@/lib/workspace/current'
import { hashInviteToken } from '@/lib/workspace/invites'
import {
	INVITES,
	MEMBERS,
	WORKSPACES,
	type InviteDoc,
	type MemberDoc,
	type WorkspaceDoc,
} from '@/lib/workspace/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Params = { params: Promise<{ token: string }> }

const GONE =
	'That invitation has expired, was replaced by a newer one, or has already been used. Open the most recent invitation email, or ask to be invited again.'

async function liveInvite(token: string) {
	const db = await getDb()
	const invite = await db
		.collection<InviteDoc>(INVITES)
		.findOne({
			tokenHash: hashInviteToken(token),
			expiresAt: { $gt: new Date() },
		})
	return { db, invite }
}

/** Lets the accept page describe the invitation before asking anyone to sign in. */
export async function GET(_request: Request, { params }: Params) {
	try {
		const { token } = await params
		const { db, invite } = await liveInvite(token)
		if (!invite) return NextResponse.json({ error: GONE }, { status: 404 })

		const [workspace, existing] = await Promise.all([
			db
				.collection<WorkspaceDoc>(WORKSPACES)
				.findOne({ _id: invite.workspaceId }),
			db
				.collection('users')
				.findOne({ email: invite.email }, { projection: { _id: 1 } }),
		])

		return NextResponse.json({
			invite: {
				email: invite.email,
				accountName: workspace?.name ?? 'an account',
				// Decides whether the page asks them to sign in or to create a login.
				hasLogin: Boolean(existing),
			},
		})
	} catch (error) {
		return errorResponse(error)
	}
}

/** The account they were invited to is the one they should land in. */
async function selectWorkspace(workspaceId: ObjectId) {
	;(await cookies()).set(WORKSPACE_COOKIE, workspaceId.toString(), {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
	})
}

const createSchema = z.object({ password: passwordSchema, name: nameSchema })

/**
 * Accepts the invitation. Signed in, the session must belong to the invited
 * address. Signed out, a password in the body creates the login for that
 * address on the spot, so a person who has never had one is not sent to a
 * sign-in page that cannot help them.
 */
export async function POST(request: Request, { params }: Params) {
	try {
		const { token } = await params
		const { db, invite } = await liveInvite(token)
		if (!invite) return NextResponse.json({ error: GONE }, { status: 404 })

		const invites = db.collection<InviteDoc>(INVITES)
		const members = db.collection<MemberDoc>(MEMBERS)
		const users = db.collection('users')
		const now = new Date()

		const addMember = (userId: string) =>
			members.updateOne(
				{ workspaceId: invite.workspaceId, userId },
				{
					$setOnInsert: {
						workspaceId: invite.workspaceId,
						userId,
						roleId: invite.roleId,
						createdAt: now,
					},
				},
				{ upsert: true },
			)

		const join = async (userId: string) => {
			// Claim first: whoever deletes the invitation owns it, so two accepts
			// cannot race, and the member row is an upsert so a repeat is harmless.
			const claimed = await invites.findOneAndDelete({ _id: invite._id })
			if (!claimed) return null
			try {
				await addMember(userId)
			} catch (error) {
				// Not a member, so the invitation must still work: put it back.
				await invites.insertOne(claimed).catch((restoreError: unknown) => {
					console.error('[invite] could not restore invitation', restoreError)
				})
				throw error
			}
			await selectWorkspace(invite.workspaceId)
			return claimed
		}

		const session = await auth()
		if (session?.user?.id) {
			// A session is acting here, so the request must be one of our pages.
			await requireTrustedOrigin()
			// The invitation names an address. Accepting it while signed in as
			// someone else would silently move the grant to the wrong person.
			if (session.user.email?.toLowerCase() !== invite.email)
				return NextResponse.json(
					{
						error: `This invitation was sent to ${invite.email}. Sign in as that account to accept it.`,
						sentTo: invite.email,
					},
					{ status: 403 },
				)
			if (!(await join(session.user.id)))
				return NextResponse.json({ error: GONE }, { status: 404 })
			return NextResponse.json({
				ok: true,
				email: invite.email,
				workspaceId: invite.workspaceId.toString(),
			})
		}

		// Signed out. Without a password this is just an unauthenticated accept.
		const body = await request.json().catch(() => null)
		if (!body || typeof body !== 'object' || !('password' in body))
			return NextResponse.json(
				{ error: 'Sign in to accept this invitation.' },
				{ status: 401 },
			)
		const parsed = createSchema.safeParse(body)
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

		if (await users.findOne({ email: invite.email }, { projection: { _id: 1 } }))
			return NextResponse.json(
				{
					error: 'This email already has a login. Sign in to accept the invitation.',
					hasLogin: true,
				},
				{ status: 409 },
			)

		// Nothing is claimed until the password is hashed and the address is known
		// to be free, so a failure here costs the person nothing.
		const passwordHash = await hash(parsed.data.password)

		const claimed = await invites.findOneAndDelete({ _id: invite._id })
		if (!claimed) return NextResponse.json({ error: GONE }, { status: 404 })

		let userId: string
		try {
			const result = await users.insertOne({
				email: invite.email,
				name: parsed.data.name || null,
				emailVerified: now,
				passwordHash,
				role: 'member',
				createdAt: now,
				updatedAt: now,
			})
			userId = result.insertedId.toString()
		} catch (error) {
			// No login exists, so the invitation must: put it back exactly as it was.
			await invites.insertOne(claimed).catch((restoreError: unknown) => {
				console.error('[invite] could not restore invitation', restoreError)
			})
			if (error instanceof MongoServerError && error.code === 11000)
				return NextResponse.json(
					{
						error:
							'This email already has a login. Sign in to accept the invitation.',
						hasLogin: true,
					},
					{ status: 409 },
				)
			console.error('[invite] could not create login', error)
			return NextResponse.json(
				{
					error:
						'We could not create your login. Your invitation is still valid, so try again in a minute.',
				},
				{ status: 503 },
			)
		}

		// The login exists. The membership is the point of the link, so if it
		// cannot be written the invitation goes back: signing in and opening the
		// link again then completes it through the signed-in path above.
		try {
			await addMember(userId)
		} catch (error) {
			await invites.insertOne(claimed).catch((restoreError: unknown) => {
				console.error('[invite] could not restore invitation', restoreError)
			})
			console.error('[invite] could not add member', error)
			return NextResponse.json(
				{
					error:
						'Your login was created, but we could not add you to the account just now. Sign in with the password you chose, then open the invitation link again.',
					hasLogin: true,
				},
				{ status: 503 },
			)
		}

		// Neither of these can undo the join, so a failure is logged, not reported.
		try {
			// The link proved the inbox: guesses made before it was opened must
			// not lock out the password chosen just now.
			await clearFailures(attemptKeys(invite.email, clientIp(request)))
			await selectWorkspace(invite.workspaceId)
		} catch (error) {
			console.error('[invite] housekeeping deferred', error)
		}

		return NextResponse.json({
			ok: true,
			email: invite.email,
			workspaceId: invite.workspaceId.toString(),
			created: true,
		})
	} catch (error) {
		return errorResponse(error)
	}
}
