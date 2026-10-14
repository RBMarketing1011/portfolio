import { NextResponse } from 'next/server'
import { errorResponse, requireSitePermission } from '@/lib/auth/guards'
import type { SiteDoc } from '@/lib/builder/site-doc'
import { profileImages, readSiteProfile } from '@/lib/builder/site-profile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ siteId: string }> }

/**
 * Replaces a project's brand, SEO and business details. The whole profile is sent
 * each time: it is small, and a partial merge would make "clear this field" and
 * "leave this field alone" impossible to tell apart.
 */
export async function PUT(request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSitePermission(siteId, 'projects.edit')

		let body: unknown
		try {
			body = await request.json()
		} catch {
			return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
		}

		const profile = readSiteProfile(body)

		// An image must be one this project uploaded. Otherwise one account could
		// point its logo or share image at a file it does not control.
		const owned = new Set((site.media ?? []).map((item) => item.url))
		if (profileImages(profile).some((url) => !owned.has(url)))
			return NextResponse.json(
				{ error: 'That image is not part of this project. Upload it here first.' },
				{ status: 400 },
			)

		await db
			.collection<SiteDoc>('sites')
			.updateOne({ _id: site._id }, { $set: { profile, updatedAt: new Date() } })

		return NextResponse.json({ profile })
	} catch (error) {
		return errorResponse(error)
	}
}
