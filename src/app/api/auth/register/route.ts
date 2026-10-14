import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Open registration is closed. Logins are created only by accepting an
 * administrator's invitation (`/welcome/[token]`), so there is nothing here to
 * rate limit, challenge, or enumerate.
 */
export async function POST() {
	return NextResponse.json(
		{ error: 'Registration is by invitation only.' },
		{ status: 404 },
	)
}
