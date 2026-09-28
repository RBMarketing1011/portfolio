import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/** Deliberately unimplemented for now: signing in by magic link already recovers
 *  an account without a password, so this stays wired but inert. */
export async function POST() {
	return NextResponse.json(
		{
			error:
				'Password reset is not available yet. Use "Email me a sign-in link" instead.',
		},
		{ status: 501 },
	)
}
