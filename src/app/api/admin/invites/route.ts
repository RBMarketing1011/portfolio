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
import { getDb } from '@/lib/mongo'
import {
	hashInviteToken,
	INVITE_TTL_MS,
	newInviteToken,
} from '@/lib/workspace/invites'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
		const { userId, email: adminEmail } = await requireAdmin()
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

		await invites.deleteMany({ email })
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
				invitedBy: adminEmail || 'An administrator',
			})
		} catch (cause) {
			await invites.deleteOne({ _id: result.insertedId })
			return NextResponse.json(
				{
					error:
						cause instanceof Error && cause.message === 'mail-not-configured'
							? 'Email is not configured, so invitations cannot be sent yet.'
							: 'That invitation could not be sent.',
				},
				{ status: 503 },
			)
		}

		return NextResponse.json({ ok: true, email }, { status: 201 })
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
