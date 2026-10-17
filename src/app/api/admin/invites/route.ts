import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'
import {
	PLATFORM_INVITES,
	requireAdmin,
	type PlatformInviteDoc,
} from '@/lib/admin'
import { sendWelcomeEmail } from '@/lib/admin/invites'
import { errorResponse } from '@/lib/auth/guards'
import { sendFailureMessage } from '@/lib/email/send'
import { getDb } from '@/lib/mongo'
import {
	hashInviteToken,
	INVITE_TTL_MS,
	newInviteToken,
} from '@/lib/workspace/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The SMTP timeouts must fire before the platform limit does, so a stalled
// send ends in the error path and not in a killed function with a phantom invite.
export const maxDuration = 30

const schema = z.object({
	email: z.string().email().max(254),
	accountName: z.string().trim().max(80).nullish(),
	role: z.enum(['member', 'admin']).default('member'),
})


export async function GET() {
	try {
		await requireAdmin()
		const db = await getDb()
		const docs = await db
			.collection<PlatformInviteDoc>(PLATFORM_INVITES)
			.find({ expiresAt: { $gt: new Date() } })
			.sort({ createdAt: -1 })
			.toArray()
		return NextResponse.json({
			invites: docs.map((d) => ({
				id: d._id.toString(),
				email: d.email,
				accountName: d.accountName,
				role: d.role,
				expiresAt: d.expiresAt.toISOString(),
			})),
		})
	} catch (error) {
		return errorResponse(error)
	}
}

export async function POST(request: Request) {
	try {
		const { userId, email: adminEmail, name: adminName } = await requireAdmin()
		const parsed = schema.safeParse(await request.json().catch(() => null))
		if (!parsed.success)
			return NextResponse.json(
				{ error: 'Enter a valid email address.' },
				{ status: 400 },
			)

		const email = parsed.data.email.toLowerCase().trim()
		const db = await getDb()

		// Unlike the public flows this is an admin tool, so it may say plainly that
		// the person already has a login.
		if (await db.collection('users').findOne({ email }))
			return NextResponse.json(
				{ error: 'That person already has a login.' },
				{ status: 409 },
			)

		const token = newInviteToken()
		const now = new Date()
		const invites = db.collection<PlatformInviteDoc>(PLATFORM_INVITES)

		const result = await invites.insertOne({
			email,
			accountName: parsed.data.accountName || null,
			role: parsed.data.role,
			tokenHash: hashInviteToken(token),
			invitedBy: userId,
			expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
			createdAt: now,
		} as PlatformInviteDoc)

		try {
			await sendWelcomeEmail({
				to: email,
				token,
				invitedBy: adminName || adminEmail || 'An administrator',
				accountName: parsed.data.accountName || null,
				role: parsed.data.role,
			})
		} catch (cause) {
			await invites.deleteOne({ _id: result.insertedId })
			console.error('[admin/invites] could not send', cause)
			return NextResponse.json(
				{ error: sendFailureMessage(cause) },
				{ status: 503 },
			)
		}

		// Re-inviting replaces the outstanding invitation. Only once the new one
		// is in their inbox: a failed send must not take away a link that works.
		const replaced = await invites.deleteMany({
			email,
			_id: { $ne: result.insertedId },
		})

		return NextResponse.json(
			{ ok: true, email, replaced: replaced.deletedCount > 0 },
			{ status: 201 },
		)
	} catch (error) {
		return errorResponse(error)
	}
}

export async function DELETE(request: Request) {
	try {
		await requireAdmin()
		const id = new URL(request.url).searchParams.get('id')
		if (!id || !ObjectId.isValid(id))
			return NextResponse.json(
				{ error: 'Invitation not found.' },
				{ status: 404 },
			)
		const db = await getDb()
		const removed = await db
			.collection<PlatformInviteDoc>(PLATFORM_INVITES)
			.deleteOne({ _id: new ObjectId(id) })
		if (!removed.deletedCount)
			return NextResponse.json(
				{ error: 'Invitation not found.' },
				{ status: 404 },
			)
		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
