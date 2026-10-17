import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Nodemailer from 'next-auth/providers/nodemailer'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import { verify } from '@node-rs/argon2'
import { ObjectId } from 'mongodb'
import { after } from 'next/server'
import { z } from 'zod'
import { linkOrigin } from '@/lib/app-url'
import { getMongoClient } from '@/lib/mongo-client'
import { getDb } from '@/lib/mongo'
import { mailFrom, smtpOptions } from '@/lib/mail'
import { sendEmail } from '@/lib/email/send'
import { magicLinkEmail } from '@/lib/email/templates'
import { authConfig } from './config'
import {
	attemptKeys,
	clearFailures,
	clientIp,
	isLockedOut,
	recordFailure,
	throttle,
} from './rate-limit'

const credentialsSchema = z.object({
	email: z.string().email().max(254),
	password: z.string().min(1).max(200),
})

/** Sign-in links one address may be sent per window, and one source may ask
 *  for. Enough for a flaky inbox, far too few to flood someone with. */
const LINKS_PER_WINDOW = 5
const LINKS_PER_SOURCE = 20

class TooManyAttempts extends CredentialsSignin {
	code = 'too_many_attempts'
}

/**
 * When the person's password last changed, as a number the session token can
 * carry. A token minted before a change is refused, so resetting a password
 * really does sign out whoever else was using the account. Null when the
 * login no longer exists, which ends that session too.
 */
async function passwordVersion(userId: string): Promise<number | null> {
	if (!ObjectId.isValid(userId)) return null
	const db = await getDb()
	const user = await db
		.collection('users')
		.findOne(
			{ _id: new ObjectId(userId) },
			{ projection: { passwordChangedAt: 1 } },
		)
	if (!user) return null
	return user.passwordChangedAt instanceof Date
		? user.passwordChangedAt.getTime()
		: 0
}

export const { handlers, auth, signIn, signOut } = NextAuth({
	...authConfig,
	// A function, so every adapter call goes through the cache and a connection
	// that failed once is retried rather than handed out forever.
	adapter: MongoDBAdapter(() => getMongoClient()),
	callbacks: {
		...authConfig.callbacks,
		async jwt({ token, user }) {
			if (user?.id) {
				token.uid = user.id
				token.pv = (await passwordVersion(user.id)) ?? 0
				return token
			}
			if (typeof token.uid === 'string') {
				const current = await passwordVersion(token.uid)
				const held = typeof token.pv === 'number' ? token.pv : 0
				if (current === null || current > held) return null
			}
			return token
		},
		// The email provider creates a user for any address it is given. Accounts
		// exist only by invitation, so a link may only be redeemed by a login that
		// is already in the database. Requesting one is answered the same way for
		// every address; whether anything is sent is decided in the sender.
		async signIn({ account, user, email: request }) {
			if (account?.provider !== 'nodemailer') return true
			const email = user.email?.toLowerCase().trim()
			if (!email) return false
			if (request?.verificationRequest) return true
			const db = await getDb()
			return Boolean(
				await db
					.collection('users')
					.findOne({ email }, { projection: { _id: 1 } }),
			)
		},
	},
	providers: [
		Nodemailer({
			// The provider insists on a server block, though sending below goes
			// through the shared transport; keep the two from ever disagreeing.
			server: smtpOptions(),
			from: mailFrom(),
			maxAge: 15 * 60,
			// The branded message instead of the library's default. Everything
			// that could differ between a known and an unknown address (the
			// lookup, the caps, the SMTP round trip) happens after the response,
			// so the answer and its timing are the same for every address. The
			// link goes to a page with a button rather than straight to the
			// callback: mail scanners open every URL in an email on arrival, and
			// the callback spends the one-time token on its first GET.
			async sendVerificationRequest({ identifier, url, request }) {
				const ip = clientIp(request)
				after(async () => {
					try {
						if (ip && !(await throttle(`link:ip:${ip}`, LINKS_PER_SOURCE)))
							return
						if (!(await throttle(`link:${identifier}`, LINKS_PER_WINDOW)))
							return
						const db = await getDb()
						const known = await db
							.collection('users')
							.findOne({ email: identifier }, { projection: { _id: 1 } })
						if (!known) return
						const callback = new URL(url)
						const link = `${linkOrigin()}/sign-in/verify?${callback.searchParams}`
						await sendEmail({
							to: identifier,
							...magicLinkEmail({ to: identifier, link }),
						})
					} catch (error) {
						console.error('[magic-link] could not send', error)
					}
				})
			},
		}),
		Credentials({
			credentials: { email: {}, password: {} },
			// Deliberately no Turnstile here. The widget does issue tokens that fail
			// siteverify, and a challenge that can hard-fail on the sign-in path locks
			// people out of their own accounts. Brute force is handled by the rate
			// limiter below; registration is where the challenge belongs.
			async authorize(raw, request) {
				const parsed = credentialsSchema.safeParse(raw)
				if (!parsed.success) return null

				const email = parsed.data.email.toLowerCase().trim()
				const keys = attemptKeys(email, clientIp(request))

				// Before any hashing work, so a locked-out caller cannot keep burning
				// argon2 time on this process.
				if (await isLockedOut(keys)) throw new TooManyAttempts()

				const db = await getDb()
				const user = await db.collection('users').findOne({ email })

				// Same null for "no such user" and "wrong password": the caller must not
				// be able to tell which, or the form becomes an account enumerator.
				if (
					!user?.passwordHash ||
					!(await verify(user.passwordHash, parsed.data.password))
				) {
					await recordFailure(keys)
					return null
				}

				await clearFailures(keys)

				return {
					id: user._id.toString(),
					email: user.email as string,
					name: (user.name as string | undefined) ?? null,
				}
			},
		}),
	],
})
