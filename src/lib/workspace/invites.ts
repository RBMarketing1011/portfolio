import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mailFrom, mailConfigured, mailTransport } from '@/lib/mail'
import { site } from '@/lib/site'
import { baseUrl } from '@/lib/seo'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** The raw token exists only in the emailed link; the database keeps its hash,
 *  so a database read cannot be replayed into someone else's account. */
export const newInviteToken = () => randomBytes(32).toString('base64url')

export const hashInviteToken = (token: string) =>
	createHash('sha256').update(token).digest('hex')

export function tokensMatch(candidateHash: string, storedHash: string) {
	const a = Buffer.from(candidateHash)
	const b = Buffer.from(storedHash)
	return a.length === b.length && timingSafeEqual(a, b)
}

export async function sendInviteEmail(input: {
	to: string
	token: string
	accountName: string
	invitedBy: string
	roleName: string
}) {
	if (!mailConfigured()) throw new Error('mail-not-configured')

	const link = `${baseUrl}/invite/${input.token}`

	await mailTransport().sendMail({
		from: mailFrom(),
		to: input.to,
		subject: `${input.invitedBy} invited you to ${input.accountName} on ${site.name}`,
		text: [
			`${input.invitedBy} added you to the ${input.accountName} account on ${site.name} as ${input.roleName}.`,
			'',
			`Accept the invitation: ${link}`,
			'',
			'The link works once and expires in seven days.',
		].join('\n'),
		html: `
			<p>${escapeHtml(input.invitedBy)} added you to the <strong>${escapeHtml(input.accountName)}</strong> account on ${escapeHtml(site.name)} as <strong>${escapeHtml(input.roleName)}</strong>.</p>
			<p><a href="${link}">Accept the invitation</a></p>
			<p>The link works once and expires in seven days.</p>
		`,
	})
}

const escapeHtml = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			})[char] as string,
	)
