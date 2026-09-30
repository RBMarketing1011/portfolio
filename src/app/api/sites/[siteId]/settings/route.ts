import { NextResponse } from 'next/server'
import { errorResponse, requireSitePermission } from '@/lib/auth/guards'
import {
	siteSettingsSchema,
	slugifySite,
	toSiteResponse,
	type SiteDoc,
} from '@/lib/builder/site-doc'
import { newPreviewToken, uniqueSubdomain } from '@/lib/builder/site-slug'
import { appHostname } from '@/lib/builder/hosting'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ siteId: string }> }

/**
 * Project settings, deliberately separate from the canvas PATCH: renaming or
 * going live must not need the builder's current revision, and going live is a
 * different permission from editing.
 */
export async function PATCH(request: Request, { params }: Params) {
	try {
		const { siteId } = await params

		let body: unknown
		try {
			body = await request.json()
		} catch {
			return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
		}

		const parsed = siteSettingsSchema.safeParse(body)
		if (!parsed.success)
			return NextResponse.json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid settings.' },
				{ status: 400 },
			)

		// Going live, and choosing where it answers, are not the same right as
		// editing the pages.
		const publishing =
			parsed.data.status !== undefined ||
			parsed.data.subdomain !== undefined ||
			parsed.data.customDomain !== undefined

		const { site, db } = await requireSitePermission(
			siteId,
			publishing ? 'projects.publish' : 'projects.edit',
		)

		const sites = db.collection<SiteDoc>('sites')
		const next: Partial<SiteDoc> = { updatedAt: new Date() }

		if (parsed.data.name !== undefined) next.name = parsed.data.name

		if (parsed.data.subdomain !== undefined)
			next.subdomain = await uniqueSubdomain(
				sites,
				slugifySite(parsed.data.subdomain),
				site._id,
			)

		if (parsed.data.customDomain !== undefined) {
			const domain = parsed.data.customDomain?.toLowerCase().trim() || null

			// Pointing a customer domain at the app's own host would let a project
			// answer on the marketing site or the backend. Compared without the port,
			// because a domain name never carries one.
			if (
				domain &&
				(domain === appHostname || domain.endsWith(`.${appHostname}`))
			)
				return NextResponse.json(
					{ error: `Use the subdomain field for ${appHostname} names.` },
					{ status: 400 },
				)

			if (domain) {
				const taken = await sites.findOne({
					customDomain: domain,
					_id: { $ne: site._id },
				})
				if (taken)
					return NextResponse.json(
						{ error: 'That domain is already connected to another project.' },
						{ status: 409 },
					)
			}

			next.customDomain = domain
			// Changing the domain always restarts verification.
			if (domain !== (site.customDomain ?? null))
				next.customDomainVerifiedAt = null
		}

		if (parsed.data.status !== undefined) {
			// A project with no pages has nothing to serve, so it cannot go live.
			if (parsed.data.status === 'live' && !site.site?.pages?.length)
				return NextResponse.json(
					{ error: 'Add a page before setting this project live.' },
					{ status: 400 },
				)
			next.status = parsed.data.status
			next.publishedAt =
				parsed.data.status === 'live' ? new Date() : (site.publishedAt ?? null)
		}

		const updated = await sites.findOneAndUpdate(
			{ _id: site._id },
			{ $set: next },
			{ returnDocument: 'after' },
		)
		if (!updated)
			return NextResponse.json({ error: 'Site not found.' }, { status: 404 })

		return NextResponse.json({ site: toSiteResponse(updated) })
	} catch (error) {
		return errorResponse(error)
	}
}

/** Burns the old share link. The only way to un-share something already sent. */
export async function POST(_request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSitePermission(siteId, 'projects.edit')

		const updated = await db
			.collection<SiteDoc>('sites')
			.findOneAndUpdate(
				{ _id: site._id },
				{ $set: { previewToken: newPreviewToken(), updatedAt: new Date() } },
				{ returnDocument: 'after' },
			)
		if (!updated)
			return NextResponse.json({ error: 'Site not found.' }, { status: 404 })

		return NextResponse.json({ site: toSiteResponse(updated) })
	} catch (error) {
		return errorResponse(error)
	}
}
