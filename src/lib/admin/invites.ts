import 'server-only'
import { mailFrom, mailConfigured, mailTransport } from '@/lib/mail'
import { site } from '@/lib/site'
import { baseUrl } from '@/lib/seo'

/** Same hashing and single-use rules as account invitations; only the landing
 *  page differs, because this person has no account to sign in to yet. */
export async function sendWelcomeEmail(input: {
	to: string
	token: string
	invitedBy: string
}) {
	if (!mailConfigured()) throw new Error('mail-not-configured')

	const link = `${baseUrl}/welcome/${input.token}`

	await mailTransport().sendMail({
		from: mailFrom(),
		to: input.to,
		subject: `You have been invited to ${site.name}`,
		text: [
			`${input.invitedBy} invited you to build websites on ${site.name}.`,
			'',
			`Create your login: ${link}`,
			'',
			'The link works once and expires in seven days.',
		].join('\n'),
		html: `
			<p>${esc(input.invitedBy)} invited you to build websites on ${esc(site.name)}.</p>
			<p><a href="${link}">Create your login</a></p>
			<p>The link works once and expires in seven days.</p>
		`,
	})
}

const esc = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(c) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
				c
			] as string,
	)
