import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { z } from 'zod'
import { errorResponse, requireSitePermission } from '@/lib/auth/guards'
import type { MediaEntry, SiteDoc } from '@/lib/builder/site-doc'

export const runtime = 'nodejs'

type Params = { params: Promise<{ siteId: string }> }

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
})

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

		const existing = (site.media ?? []).find(
			(item) => item.pathname === parsed.data.pathname,
		)
		if (existing) return NextResponse.json({ media: existing })

		const entry: MediaEntry = {
			id: `md_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
			...parsed.data,
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
