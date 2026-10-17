import nodemailer from 'nodemailer'

export const mailConfigured = () =>
	Boolean(
		process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
	)

/**
 * 465 with implicit TLS, always. Not configurable: no port or flag may put this
 * connection on a plaintext socket.
 *
 * Every phase has a timeout well inside a serverless function's limit. Without
 * them a stalled SMTP handshake runs until the platform kills the invocation,
 * and the code that would undo a half-finished invitation never gets to run.
 */
export const smtpOptions = () => ({
	host: process.env.SMTP_HOST,
	port: 465,
	secure: true,
	auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
	connectionTimeout: 10_000,
	greetingTimeout: 10_000,
	socketTimeout: 20_000,
	dnsTimeout: 5_000,
})

export function mailTransport() {
	return nodemailer.createTransport(smtpOptions())
}

export const mailFrom = () =>
	process.env.SMTP_FROM_EMAIL ?? process.env.SMTP_USER
