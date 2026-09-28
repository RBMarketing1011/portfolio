import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { errorResponse, requireSiteOwner } from '@/lib/auth/guards'
import type { MediaEntry, SiteDoc } from '@/lib/builder/site-doc'

export const runtime = 'nodejs'

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif']
const MAX_BYTES = 12 * 1024 * 1024
const MAX_PER_SITE = 200

type Params = { params: Promise<{ siteId: string }> }

/**
 * Client upload, not a server `put`: a serverless request body caps around 4.5 MB
 * and photographs run past it. The read-write token never leaves the server; the
 * browser gets a short-lived scoped one instead.
 */
export async function POST(request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSiteOwner(siteId)
		const body = (await request.json()) as HandleUploadBody

		const result = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async () => {
				if ((site.media ?? []).length >= MAX_PER_SITE)
					throw new Error('This site has reached its image limit.')
				return {
					allowedContentTypes: ALLOWED,
					maximumSizeInBytes: MAX_BYTES,
					addRandomSuffix: true,
					// Anything the browser sends back is attacker-controlled, so the
					// site it belongs to is pinned here instead.
					tokenPayload: JSON.stringify({ siteId: site._id.toString() }),
				}
			},
			onUploadCompleted: async ({ blob, tokenPayload }) => {
				const payload = JSON.parse(tokenPayload || '{}')
				if (payload.siteId !== site._id.toString()) return

				// This webhook never reaches localhost, so the client also registers the
				// blob directly. Both paths key on pathname so neither double-inserts.
				await db.collection<SiteDoc>('sites').updateOne(
					{ _id: site._id, 'media.pathname': { $ne: blob.pathname } },
					{
						$push: {
							media: {
								id: `md_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
								name: blob.pathname.split('/').pop() ?? 'image',
								url: blob.url,
								pathname: blob.pathname,
								bytes: 0,
								contentType: blob.contentType ?? 'image/webp',
								addedAt: new Date().toISOString(),
							} satisfies MediaEntry,
						},
						$set: { updatedAt: new Date() },
					},
				)
			},
		})

		return NextResponse.json(result)
	} catch (error) {
		return errorResponse(error)
	}
}
