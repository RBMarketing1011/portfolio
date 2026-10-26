import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { z } from 'zod'
import { errorResponse, requireSitePermission } from '@/lib/auth/guards'
import type { MediaEntry, SiteDoc } from '@/lib/builder/site-doc'
import { assertBlobUrl } from '@/lib/media/storage'

export const runtime = 'nodejs'

type Params = { params: Promise<{ siteId: string }> }

/** A display size the browser measured. Optional, and dropped rather than refused when it is not one. */
const side = z.number().int().min(1).max(20000).optional().catch(undefined)

const registerSchema = z.object({
	name: z.string().min(1).max(200),
	url: z.string().url().max(2000),
	pathname: z.string().min(1).max(500),
	bytes: z
		.number()
		.int()
		.nonnegative()
		.max(12 * 1024 * 1024),
	contentType: z.string().max(100),
	width: side,
	height: side,
})

/** Decodes once; null when the escapes are malformed. */
function decodeOnce(text: string): string | null {
	try {
		return decodeURIComponent(text)
	} catch {
		return null
	}
}

/**
 * The URL must point at exactly the pathname it claims, raw or decoded once (the rule of
 * the private `pathMatches` in src/lib/media/storage.ts): uploads keep the person's file
 * name, so a space or an accent arrives percent-encoded in the URL but not in `pathname`.
 */
function pathMatches(url: URL, pathname: string): boolean {
	const raw = url.pathname.slice(1)
	const decoded = decodeOnce(raw)
	return pathname === raw || (decoded !== null && pathname === decoded)
}

/** Records a blob the browser just uploaded. The webhook cannot reach localhost,
 *  so this is the path that actually runs in development. */
export async function POST(request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSitePermission(siteId, 'media.upload')

		const parsed = registerSchema.safeParse(await request.json())
		if (!parsed.success)
			return NextResponse.json({ error: 'Invalid image.' }, { status: 400 })

		// The blob must live under this site's prefix, or one account could attach
		// another account's image by posting its URL.
		if (!parsed.data.pathname.startsWith(`sites/${site._id.toString()}/`))
			return NextResponse.json({ error: 'Invalid image.' }, { status: 400 })

		// And the URL must be that blob: a Vercel Blob URL at exactly that path. Anything
		// else would be rendered on the site and sent to the AI model as this project's image.
		let blobUrl: URL
		try {
			blobUrl = assertBlobUrl(parsed.data.url)
		} catch {
			return NextResponse.json({ error: 'Invalid image.' }, { status: 400 })
		}
		if (!pathMatches(blobUrl, parsed.data.pathname))
			return NextResponse.json({ error: 'Invalid image.' }, { status: 400 })

		const existing = (site.media ?? []).find(
			(item) => item.pathname === parsed.data.pathname,
		)
		if (existing) return NextResponse.json({ media: existing })

		const { width, height, ...fields } = parsed.data
		const entry: MediaEntry = {
			id: `md_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
			...fields,
			...(width ? { width } : {}),
			...(height ? { height } : {}),
			addedAt: new Date().toISOString(),
		}

		await db
			.collection<SiteDoc>('sites')
			.updateOne(
				{ _id: site._id },
				{ $push: { media: entry }, $set: { updatedAt: new Date() } },
			)

		return NextResponse.json({ media: entry }, { status: 201 })
	} catch (error) {
		return errorResponse(error)
	}
}

export async function DELETE(request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSitePermission(siteId, 'media.delete')

		const id = new URL(request.url).searchParams.get('id')
		const entry = (site.media ?? []).find((item) => item.id === id)
		if (!entry)
			return NextResponse.json({ error: 'Image not found.' }, { status: 404 })

		await del(entry.url).catch(() => {})
		await db
			.collection<SiteDoc>('sites')
			.updateOne(
				{ _id: site._id },
				{ $pull: { media: { id: entry.id } }, $set: { updatedAt: new Date() } },
			)

		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}
