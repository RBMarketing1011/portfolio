import { NextResponse } from 'next/server'
import { pingDb } from '@/lib/mongo'

export const dynamic = 'force-dynamic'

export async function GET() {
	try {
		return NextResponse.json(await pingDb())
	} catch (error) {
		return NextResponse.json(
			{ ok: false, error: error instanceof Error ? error.message : 'unknown' },
			{ status: 503 },
		)
	}
}
