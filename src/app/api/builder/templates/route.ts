import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongo'
import { templateSchema, type Template } from '@/lib/builder/page-schema'

export const dynamic = 'force-dynamic'

export async function GET() {
	try {
		const db = await getDb()
		const docs = await db
			.collection('templates')
			.find({}, { projection: { _id: 0 } })
			.sort({ order: 1, name: 1 })
			.toArray()

		const templates = docs
			.map((doc) => templateSchema.safeParse(doc))
			.filter((result) => result.success)
			.map((result) => (result as { data: Template }).data)

		return NextResponse.json({ templates })
	} catch (error) {
		// The builder still works with a blank page if the database is down.
		return NextResponse.json(
			{
				templates: [],
				error: error instanceof Error ? error.message : 'unknown',
			},
			{ status: 200 },
		)
	}
}
