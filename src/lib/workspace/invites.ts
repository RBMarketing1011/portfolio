import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { linkOrigin } from '@/lib/app-url'
import { sendEmail } from '@/lib/email/send'
import { teamInviteEmail } from '@/lib/email/templates'

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
	/** Whether the address already has a login; the copy tells them what the link does. */
	hasLogin: boolean
}) {
	await sendEmail({
		to: input.to,
		...teamInviteEmail({
			to: input.to,
			link: `${linkOrigin()}/invite/${input.token}`,
			invitedBy: input.invitedBy,
			accountName: input.accountName,
			roleName: input.roleName,
			hasLogin: input.hasLogin,
		}),
	})
}
