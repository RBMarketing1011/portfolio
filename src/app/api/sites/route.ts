import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { errorResponse, requirePermission } from '@/lib/auth/guards'
import {
	sitePayloadSchema,
	slugifySite,
	toSiteResponse,
	type SiteDoc,
} from '@/lib/builder/site-doc'
import { newPreviewToken, uniqueSubdomain } from '@/lib/builder/site-slug'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
	try {
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace } = await requirePermission(
			'projects.view',
			workspaceId,
		)

		const docs = await db
			.collection<SiteDoc>('sites')
			.find({ workspaceId: workspace._id })
			.sort({ updatedAt: -1 })
			.toArray()

		return NextResponse.json({
			workspace: { id: workspace._id.toString(), name: workspace.name },
			sites: docs.map((doc) => ({
				id: doc._id.toString(),
				name: doc.name,
				subdomain: doc.subdomain,
				customDomain: doc.customDomain ?? null,
				status: doc.status ?? 'draft',
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
		const workspaceId = new URL(request.url).searchParams.get('workspace')
		const { db, workspace, userId } = await requirePermission(
			'projects.create',
			workspaceId,
		)

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

		const sites = db.collection<SiteDoc>('sites')
		const now = new Date()
		const doc: Omit<SiteDoc, '_id'> = {
			workspaceId: workspace._id,
			ownerId: userId,
			name: parsed.data.name,
			subdomain: await uniqueSubdomain(sites, slugifySite(parsed.data.name)),
			customDomain: null,
			customDomainVerifiedAt: null,
			previewToken: newPreviewToken(),
			status: 'draft',
			publishedAt: null,
			site: parsed.data.site,
			look: parsed.data.look ?? {},
			media: [],
			rev: 1,
			createdAt: now,
			updatedAt: now,
		}

		const result = await db.collection('sites').insertOne(doc)

		return NextResponse.json(
			{ site: toSiteResponse({ ...doc, _id: result.insertedId as ObjectId }) },
			{ status: 201 },
		)
	} catch (error) {
		return errorResponse(error)
	}
}
