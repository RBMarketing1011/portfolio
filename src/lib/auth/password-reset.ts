import 'server-only'
import { ObjectId } from 'mongodb'
import { linkOrigin } from '@/lib/app-url'
import { sendEmail } from '@/lib/email/send'
import { passwordResetEmail } from '@/lib/email/templates'
import { getDb } from '@/lib/mongo'
import { hashInviteToken, newInviteToken } from '@/lib/workspace/invites'

export const PASSWORD_RESETS = 'passwordResets'
export const RESET_TTL_MINUTES = 30

export type PasswordResetDoc = {
	_id: ObjectId
	userId: string
	email: string
	/** Only the hash is stored; the raw token exists solely in the emailed link. */
	tokenHash: string
	expiresAt: Date
	createdAt: Date
}

/**
 * Issues a reset link for an address, if a login exists for it. Silent when
 * none does: the caller answers the same way either way, so the request form
 * cannot be used to discover which addresses have logins.
 */
export async function issuePasswordReset(email: string) {
	const db = await getDb()
	const user = await db
		.collection('users')
		.findOne({ email }, { projection: { _id: 1, email: 1 } })
	if (!user) return

	const token = newInviteToken()
	const now = new Date()
	const resets = db.collection<PasswordResetDoc>(PASSWORD_RESETS)

	// One live link per person: asking again replaces the previous one.
	await resets.deleteMany({ userId: user._id.toString() })
	const inserted = await resets.insertOne({
		userId: user._id.toString(),
		email,
		tokenHash: hashInviteToken(token),
		expiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000),
		createdAt: now,
	} as PasswordResetDoc)

	try {
		await sendEmail({
			to: email,
			...passwordResetEmail({
				to: email,
				link: `${linkOrigin()}/reset-password/${token}`,
				minutes: RESET_TTL_MINUTES,
			}),
		})
	} catch (error) {
		// A link nobody received must not sit there usable.
		await resets.deleteOne({ _id: inserted.insertedId })
		throw error
	}
}

/** The reset a link points at, if it is still live. Expiry is enforced here,
 *  so the TTL index is only housekeeping. */
export async function livePasswordReset(token: string) {
	const db = await getDb()
	const reset = await db.collection<PasswordResetDoc>(PASSWORD_RESETS).findOne({
		tokenHash: hashInviteToken(token),
		expiresAt: { $gt: new Date() },
	})
	return { db, reset }
}
