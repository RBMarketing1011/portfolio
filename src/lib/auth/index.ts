import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Nodemailer from 'next-auth/providers/nodemailer'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import { verify } from '@node-rs/argon2'
import { z } from 'zod'
import { getMongoClient } from '@/lib/mongo-client'
import { getDb } from '@/lib/mongo'
import { mailFrom } from '@/lib/mail'
import { authConfig } from './config'

const credentialsSchema = z.object({
	email: z.string().email().max(254),
	password: z.string().min(1).max(200),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
	...authConfig,
	adapter: MongoDBAdapter(getMongoClient()),
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
			async authorize(raw) {
				const parsed = credentialsSchema.safeParse(raw)
				if (!parsed.success) return null

				const email = parsed.data.email.toLowerCase().trim()
				const db = await getDb()
				const user = await db.collection('users').findOne({ email })

				// Same null for "no such user" and "wrong password": the caller must not
				// be able to tell which, or the form becomes an account enumerator.
				if (!user?.passwordHash) return null
				if (!(await verify(user.passwordHash, parsed.data.password)))
					return null

				return {
					id: user._id.toString(),
					email: user.email as string,
					name: (user.name as string | undefined) ?? null,
				}
			},
		}),
	],
})
