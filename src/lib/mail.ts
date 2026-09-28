import nodemailer from 'nodemailer'

export const mailConfigured = () =>
	Boolean(
		process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
	)

/**
 * 465 with implicit TLS, always. Not configurable: no port or flag may put this
 * connection on a plaintext socket.
 */
export function mailTransport() {
	return nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: 465,
		secure: true,
		requireTLS: true,
		auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
	})
}

export const mailFrom = () =>
	process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER
