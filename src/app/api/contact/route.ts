import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(request: Request) {
	const { name, email, company, message } = await request.json()
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
		!process.env.CONTACT_TO_EMAIL ||
		!process.env.SMTP_HOST ||
		!process.env.SMTP_USER ||
		!process.env.SMTP_PASS
	)
		return NextResponse.json(
			{ error: 'Email is not configured.' },
			{ status: 503 },
		)

	const transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT ?? 587),
		secure: process.env.SMTP_SECURE === 'true',
		auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
	})
	await transporter.sendMail({
		from: process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER,
		replyTo: email.trim(),
		to: process.env.CONTACT_TO_EMAIL,
		subject: `ReynoldsBuild.dev inquiry from ${name.trim()}`,
		text: `Name: ${name.trim()}\nEmail: ${email.trim()}\nCompany: ${typeof company === 'string' ? company.trim() : ''}\n\n${message.trim()}`,
	})
	return NextResponse.json({ ok: true })
}
