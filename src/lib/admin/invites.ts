import 'server-only'
import { linkOrigin } from '@/lib/app-url'
import { sendEmail } from '@/lib/email/send'
import { welcomeEmail } from '@/lib/email/templates'

/** Same hashing and single-use rules as account invitations; only the landing
 *  page differs, because this person has no account to sign in to yet. */
export async function sendWelcomeEmail(input: {
	to: string
	token: string
	invitedBy: string
	accountName?: string | null
	role: 'member' | 'admin'
}) {
	await sendEmail({
		to: input.to,
		...welcomeEmail({
			to: input.to,
			link: `${linkOrigin()}/welcome/${input.token}`,
			invitedBy: input.invitedBy,
			accountName: input.accountName,
			role: input.role,
		}),
	})
}
