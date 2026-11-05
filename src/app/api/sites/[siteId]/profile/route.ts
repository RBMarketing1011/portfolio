import { NextResponse } from 'next/server'
import type { Db } from 'mongodb'
import { errorResponse, requireSitePermission } from '@/lib/auth/guards'
import { libraryUrlsOf } from '@/lib/builder/library-server'
import type { SiteDoc } from '@/lib/builder/site-doc'
import { profileImages, readSiteProfile, type SiteProfile } from '@/lib/builder/site-profile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ siteId: string }> }

const NOT_OURS = 'That image is not part of this project. Upload it here first.'

/**
 * Whether every image the profile newly points at is one this project uploaded, or one in
 * its account's media library. Otherwise one account could point its logo or share image
 * at a file it does not control. An image the stored profile already points at was checked
 * when it was set, so one deleted from the library since never blocks an unrelated change.
 */
async function imagesOwned(db: Db, site: SiteDoc, profile: SiteProfile) {
	const stored = new Set(profileImages(readSiteProfile(site.profile)))
	const owned = new Set((site.media ?? []).map((item) => item.url))
	const outside = profileImages(profile).filter((url) => !owned.has(url) && !stored.has(url))
	const library = await libraryUrlsOf(db, site.workspaceId, outside)
	return outside.every((url) => library.has(url))
}

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
	try {
		return { ok: true, body: await request.json() }
	} catch {
		return { ok: false }
	}
}

/**
 * Replaces a project's brand, SEO and business details. The whole profile is sent
 * each time: it is small, and a partial merge would make "clear this field" and
 * "leave this field alone" impossible to tell apart.
 */
export async function PUT(request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSitePermission(siteId, 'projects.edit')

		const read = await readJson(request)
		if (!read.ok) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

		const profile = readSiteProfile(read.body)
		if (!(await imagesOwned(db, site, profile)))
			return NextResponse.json({ error: NOT_OURS }, { status: 400 })

		await db
			.collection<SiteDoc>('sites')
			.updateOne({ _id: site._id }, { $set: { profile, updatedAt: new Date() } })

		return NextResponse.json({ profile })
	} catch (error) {
		return errorResponse(error)
	}
}

/**
 * Changes only the brand (logo, its size and plate, the favicon), as the builder does:
 * it holds the profile from when the site was opened, and sending all of it back would
 * undo business details edited elsewhere since. `{ brand: { … } }`; every brand field
 * sent replaces the stored one, every field left out is kept.
 */
export async function PATCH(request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSitePermission(siteId, 'projects.edit')

		const read = await readJson(request)
		const brand = read.ok && read.body && typeof read.body === 'object' ? (read.body as { brand?: unknown }).brand : undefined
		if (!brand || typeof brand !== 'object' || Array.isArray(brand))
			return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })

		const stored = readSiteProfile(site.profile)
		const profile = readSiteProfile({ ...stored, brand: { ...stored.brand, ...brand } })
		if (!(await imagesOwned(db, site, profile)))
			return NextResponse.json({ error: NOT_OURS }, { status: 400 })

		// A project made before profiles existed has nothing to set a brand inside yet.
		const whole = !site.profile || typeof site.profile !== 'object'
		await db
			.collection<SiteDoc>('sites')
			.updateOne(
				{ _id: site._id },
				{ $set: whole ? { profile, updatedAt: new Date() } : { 'profile.brand': profile.brand, updatedAt: new Date() } },
			)

		// The rest as stored now, so the builder catches up on edits made elsewhere.
		const after = await db.collection<SiteDoc>('sites').findOne({ _id: site._id }, { projection: { profile: 1 } })
		return NextResponse.json({ profile: readSiteProfile(after?.profile) })
	} catch (error) {
		return errorResponse(error)
	}
}
