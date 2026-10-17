import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { mailConfigured, mailFrom, mailTransport } from '@/lib/mail'
import type { RenderedEmail } from './layout'

export type OutgoingEmail = RenderedEmail & { to: string }

const sinkActive = () =>
	Boolean(process.env.MAIL_SINK_DIR) && process.env.NODE_ENV !== 'production'

/** Whether a message can go anywhere at all: a real SMTP account, or the sink. */
export const mailAvailable = () => sinkActive() || mailConfigured()

/** Why a message did not go out, in words for the person who asked for it. */
export function sendFailureMessage(cause: unknown) {
	const reason = cause instanceof Error ? cause.message : ''
	if (reason === 'mail-not-configured')
		return 'Email is not configured, so invitations cannot be sent yet.'
	if (reason === 'mail-rejected')
		return 'The mail server refused that address. Check it and try again.'
	return 'That invitation could not be sent. Try again in a moment.'
}

/**
 * Sends one transactional message. Throws `mail-not-configured` when there is
 * no SMTP account to send from, and `mail-rejected` when the server accepted the
 * connection but refused the recipient, so callers can tell a deployment problem
 * from a bad address.
 *
 * Outside production, `MAIL_SINK_DIR` diverts every message into a JSON file
 * instead of the network. That is how the proof scripts read the links they
 * need without a mailbox, and how a developer previews the rendered HTML.
 */
export async function sendEmail(message: OutgoingEmail) {
	if (sinkActive()) {
		const sink = process.env.MAIL_SINK_DIR as string
		await mkdir(sink, { recursive: true })
		const stamp = new Date().toISOString().replace(/[:.]/g, '-')
		const name = `${stamp}-${message.to.replace(/[^a-z0-9]+/gi, '_')}.json`
		await writeFile(
			path.join(sink, name),
			JSON.stringify(
				{ from: mailFrom(), at: new Date().toISOString(), ...message },
				null,
				'\t',
			),
		)
		return
	}

	if (!mailConfigured()) throw new Error('mail-not-configured')

	let result
	try {
		result = await mailTransport().sendMail({
			from: mailFrom(),
			to: message.to,
			subject: message.subject,
			text: message.text,
			html: message.html,
		})
	} catch (error) {
		// With a single recipient, a refused address rejects the send itself
		// (an envelope error on RCPT TO) rather than coming back in `rejected`.
		const smtp = error as { code?: string; command?: string; responseCode?: number }
		if (
			smtp?.code === 'EENVELOPE' &&
			smtp.command === 'RCPT TO' &&
			Number(smtp.responseCode) >= 500
		)
			throw new Error('mail-rejected')
		throw error
	}

	if (result.rejected?.length) throw new Error('mail-rejected')
}
