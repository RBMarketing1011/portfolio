import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Nodemailer from 'next-auth/providers/nodemailer'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import { verify } from '@node-rs/argon2'
import { z } from 'zod'
import { getMongoClient } from '@/lib/mongo-client'
import { getDb } from '@/lib/mongo'
import { mailFrom } from '@/lib/mail'
import { authConfig } from './config'
import {
	attemptKeys,
	clearFailures,
	clientIp,
	isLockedOut,
	recordFailure,
} from './rate-limit'

const credentialsSchema = z.object({
	email: z.string().email().max(254),
	password: z.string().min(1).max(200),
})

class TooManyAttempts extends CredentialsSignin {
	code = 'too_many_attempts'
}

export const { handlers, auth, signIn, signOut } = NextAuth({
	...authConfig,
	adapter: MongoDBAdapter(getMongoClient()),
	callbacks: {
		...authConfig.callbacks,
		// The email provider creates a user for any address it is given. Accounts
		// exist only by invitation, so a link may only be sent to, and redeemed by,
		// a login that is already in the database.
		async signIn({ account, user }) {
			if (account?.provider !== 'nodemailer') return true
			const email = user.email?.toLowerCase().trim()
			if (!email) return false
			const db = await getDb()
			return Boolean(
				await db.collection('users').findOne({ email }, { projection: { _id: 1 } }),
			)
		},
	},
	providers: [
		Nodemailer({
			server: {
				host: process.env.SMTP_HOST,
				port: 465,
				secure: true,
				auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
			},
			from: mailFrom(),
			maxAge: 15 * 60,
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
