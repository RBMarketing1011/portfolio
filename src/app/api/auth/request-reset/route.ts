import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { issuePasswordReset } from '@/lib/auth/password-reset'
import { clientIp, throttle } from '@/lib/auth/rate-limit'
import { mailAvailable } from '@/lib/email/send'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const schema = z.object({ email: z.string().trim().email().max(254) })

/** Links one address may be sent per window, and one source may request. */
const PER_EMAIL = 3
const PER_IP = 12

/**
 * Starts a password reset. The answer, and the time it takes, is the same
 * whether or not the address has a login, so this cannot be used to find out
 * which addresses do: the lookup and the email happen after the response has
 * gone out. A failure to send is logged, not reported, for the same reason.
 */
export async function POST(request: Request) {
	const parsed = schema.safeParse(await request.json().catch(() => null))
	if (!parsed.success)
		return NextResponse.json(
			{ error: 'Enter a valid email address.' },
			{ status: 400 },
		)

	if (!mailAvailable())
		return NextResponse.json(
			{ error: 'Email is not configured, so a reset link cannot be sent yet.' },
			{ status: 503 },
		)

	const email = parsed.data.email.toLowerCase()
	const ip = clientIp(request)

	// A source hammering the form is told so: that reveals nothing about any
	// address. The per-address cap stays silent, or it would reveal one.
	if (ip && !(await throttle(`reset:ip:${ip}`, PER_IP)))
		return NextResponse.json(
			{ error: 'Too many reset requests. Wait fifteen minutes and try again.' },
			{ status: 429 },
		)
	if (!(await throttle(`reset:email:${email}`, PER_EMAIL)))
		return NextResponse.json({ ok: true })

	after(async () => {
		try {
			await issuePasswordReset(email)
		} catch (error) {
			console.error('[request-reset] could not send', error)
		}
	})

	return NextResponse.json({ ok: true })
}
