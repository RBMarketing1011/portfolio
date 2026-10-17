import { NextResponse } from 'next/server'
import { pingDb } from '@/lib/mongo'

export const dynamic = 'force-dynamic'

/** Whether the database answers. Which database, and what version, is only
 *  said outside production, where the proofs use it to check they share one. */
export async function GET() {
	try {
		const info = await pingDb()
		return NextResponse.json(
			process.env.NODE_ENV === 'production' ? { ok: true } : info,
		)
	} catch (error) {
		return NextResponse.json(
			{
				ok: false,
				error:
					process.env.NODE_ENV === 'production'
						? 'unavailable'
						: error instanceof Error
							? error.message
							: 'unknown',
			},
			{ status: 503 },
		)
	}
}
