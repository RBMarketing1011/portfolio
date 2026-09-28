import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { errorResponse, requireSiteOwner } from '@/lib/auth/guards'
import {
	sitePatchSchema,
	toSiteResponse,
	type SiteDoc,
} from '@/lib/builder/site-doc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ siteId: string }> }

export async function GET(_request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site } = await requireSiteOwner(siteId)
		return NextResponse.json({ site: toSiteResponse(site) })
	} catch (error) {
		return errorResponse(error)
	}
}

export async function PATCH(request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSiteOwner(siteId)

		let body: unknown
		try {
			body = await request.json()
		} catch {
			return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
		}

		const parsed = sitePatchSchema.safeParse(body)
		if (!parsed.success)
			return NextResponse.json(
				{ error: 'Those changes could not be saved.' },
				{ status: 400 },
			)

		// Two tabs editing the same site must not silently overwrite each other.
		if (parsed.data.rev !== site.rev)
			return NextResponse.json(
				{
					error:
						'This site was changed somewhere else. Reload to get the latest version.',
					rev: site.rev,
				},
				{ status: 409 },
			)

		const next: Partial<SiteDoc> = { updatedAt: new Date() }
		if (parsed.data.name !== undefined) next.name = parsed.data.name
		if (parsed.data.site !== undefined) next.site = parsed.data.site
		if (parsed.data.look !== undefined) next.look = parsed.data.look

		const updated = await db
			.collection<SiteDoc>('sites')
			.findOneAndUpdate(
				{ _id: site._id, rev: site.rev },
				{ $set: next, $inc: { rev: 1 } },
				{ returnDocument: 'after' },
			)

		if (!updated)
			return NextResponse.json(
				{ error: 'This site was changed somewhere else.', rev: site.rev },
				{ status: 409 },
			)

		return NextResponse.json({ site: toSiteResponse(updated) })
	} catch (error) {
		return errorResponse(error)
	}
}

export async function DELETE(_request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSiteOwner(siteId)

		// Blobs outlive their document unless they go first.
		const urls = (site.media ?? []).map((item) => item.url)
		if (urls.length) await del(urls).catch(() => {})

		await db.collection<SiteDoc>('sites').deleteOne({ _id: site._id })
		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
