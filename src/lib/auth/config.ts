import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-safe half of the config. `middleware.ts` runs on the edge runtime, where the
 * Mongo adapter and argon2 cannot load, so nothing here may import either.
 */
export const authConfig = {
	pages: { signIn: '/sign-in', error: '/sign-in', verifyRequest: '/sign-in' },
	// Credentials cannot use database sessions, so the whole app is JWT-backed.
	session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
	providers: [],
	callbacks: {
		jwt({ token, user }) {
			if (user?.id) token.uid = user.id
			return token
		},
		session({ session, token }) {
			if (token.uid) session.user.id = token.uid as string
			return session
		},
	},
} satisfies NextAuthConfig
