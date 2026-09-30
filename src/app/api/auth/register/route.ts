import { NextResponse } from 'next/server'
import { hash } from '@node-rs/argon2'
import { z } from 'zod'
import { getDb } from '@/lib/mongo'
import { clientIp } from '@/lib/auth/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'

export const runtime = 'nodejs'

const schema = z.object({
	email: z.string().email().max(254),
	password: z.string().min(10).max(200),
	// Nullish, not optional: the client sends null when the invisible widget has
	// not issued a token, and that must fail verification, not field validation.
	token: z.string().max(2048).nullish(),
})

// One message for every failure mode. A different reply for "already registered"
// turns this endpoint into an account enumerator.
const GENERIC = 'That email and password combination could not be used.'

export async function POST(request: Request) {
	let body: unknown
	try {
		body = await request.json()
	} catch {
		return NextResponse.json({ error: GENERIC }, { status: 400 })
	}

	const parsed = schema.safeParse(body)
	if (!parsed.success)
		return NextResponse.json(
			{
				error: 'Enter a valid email and a password of at least 10 characters.',
			},
			{ status: 400 },
		)

	if (
		!(await verifyTurnstile(parsed.data.token, clientIp(request), 'register'))
	)
		return NextResponse.json(
			{ error: 'Verification failed. Please try again.' },
			{ status: 403 },
		)

	const email = parsed.data.email.toLowerCase().trim()
	const db = await getDb()
	const users = db.collection('users')

	if (await users.findOne({ email }))
		return NextResponse.json({ error: GENERIC }, { status: 409 })

	const passwordHash = await hash(parsed.data.password)
	const now = new Date()

	try {
		await users.insertOne({
			email,
			emailVerified: null,
			passwordHash,
			createdAt: now,
			updatedAt: now,
		})
	} catch {
		// The unique index lost a race with a parallel signup.
		return NextResponse.json({ error: GENERIC }, { status: 409 })
	}

	return NextResponse.json({ ok: true })
}
