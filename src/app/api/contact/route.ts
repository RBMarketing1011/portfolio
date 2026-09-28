import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { contactEmail } from '@/lib/contact-email'
import { verifyTurnstile } from '@/lib/turnstile'

const EXPECTED_ACTION = 'contact'

export async function POST(request: Request) {
	const body = await request.json()
	const { name, email, company, message } = body

	const clientIp =
		request.headers.get('cf-connecting-ip') ??
		request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		null

	if (
		!(await verifyTurnstile(
			body['cf-turnstile-response'],
			clientIp,
			EXPECTED_ACTION,
		))
	)
		return NextResponse.json(
			{ error: 'Verification failed. Please try again.' },
			{ status: 403 },
		)

	if (
		![name, email, message].every(
			(value) => typeof value === 'string' && value.trim(),
		)
	)
		return NextResponse.json(
			{ error: 'Name, email, and message are required.' },
			{ status: 400 },
		)
	if (
		!process.env.SMTP_HOST ||
		!process.env.SMTP_USER ||
		!process.env.SMTP_PASS
	)
		return NextResponse.json(
			{ error: 'Email is not configured.' },
			{ status: 503 },
		)

	// 465 with implicit TLS, always. Not configurable: no port or flag may put this
	// connection on a plaintext socket.
	const transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: 465,
		secure: true,
		requireTLS: true,
		auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
	})

	try {
		await transporter.sendMail({
			from: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER,
			replyTo: email.trim(),
			to: contactEmail,
			subject: `Reynolds Built inquiry from ${name.trim()}`,
			text: `Name: ${name.trim()}\nEmail: ${email.trim()}\nCompany: ${typeof company === 'string' ? company.trim() : ''}\n\n${message.trim()}`,
		})
	} catch {
		return NextResponse.json(
			{ error: 'We could not send your message. Please try again shortly.' },
			{ status: 502 },
		)
	}

	return NextResponse.json({ ok: true })
}
