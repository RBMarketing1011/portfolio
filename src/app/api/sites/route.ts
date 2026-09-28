import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { errorResponse, requireUserId } from '@/lib/auth/guards'
import { getDb } from '@/lib/mongo'
import {
	sitePayloadSchema,
	toSiteResponse,
	type SiteDoc,
} from '@/lib/builder/site-doc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
	try {
		const ownerId = await requireUserId()
		const db = await getDb()
		const docs = await db
			.collection<SiteDoc>('sites')
			.find({ ownerId })
			.sort({ updatedAt: -1 })
			.toArray()

		return NextResponse.json({
			sites: docs.map((doc) => ({
				id: doc._id.toString(),
				name: doc.name,
				pages: doc.site?.pages?.length ?? 0,
				updatedAt: doc.updatedAt.toISOString(),
			})),
		})
	} catch (error) {
		return errorResponse(error)
	}
}

export async function POST(request: Request) {
	try {
		const ownerId = await requireUserId()

		let body: unknown
		try {
			body = await request.json()
		} catch {
			return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
		}

		const parsed = sitePayloadSchema.safeParse(body)
		if (!parsed.success)
			return NextResponse.json(
				{ error: 'That site could not be saved.' },
				{ status: 400 },
			)

		const now = new Date()
		const doc: Omit<SiteDoc, '_id'> = {
			ownerId,
			name: parsed.data.name,
			site: parsed.data.site,
			look: parsed.data.look ?? {},
			media: [],
			rev: 1,
			createdAt: now,
			updatedAt: now,
		}

		const db = await getDb()
		const result = await db.collection('sites').insertOne(doc)

		return NextResponse.json(
			{ site: toSiteResponse({ ...doc, _id: result.insertedId as ObjectId }) },
			{ status: 201 },
		)
	} catch (error) {
		return errorResponse(error)
	}
}
