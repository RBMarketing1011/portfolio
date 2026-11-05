import { NextResponse } from 'next/server'
import { errorResponse, requireSitePermission } from '@/lib/auth/guards'
import type { SiteLibraryResponse } from '@/lib/builder/library'
import { folderImages, folderSubtree, libraryFolders } from '@/lib/builder/library-server'
import type { SiteDoc } from '@/lib/builder/site-doc'
import { parseObjectId } from '@/lib/media/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ siteId: string }> }

/**
 * The account media library, as one site's builder sees it. Without `folder`: every
 * folder and the one holding this site's content. With `folder=<id>`: that folder's
 * images and its subfolders', newest first. Always the site's own account.
 */
export async function GET(request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSitePermission(siteId, 'projects.view')

		const folder = new URL(request.url).searchParams.get('folder')
		if (folder !== null) {
			const id = parseObjectId(folder)
			const result = id ? await folderImages(db, site.workspaceId, id) : null
			if (!result)
				return NextResponse.json({ error: 'That folder no longer exists.' }, { status: 404 })
			return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
		}

		const { folders, total } = await libraryFolders(db, site.workspaceId)
		const saved = site.mediaFolderId ? site.mediaFolderId.toString() : null
		const body: SiteLibraryResponse = {
			folderId: saved && folders.some((item) => item.id === saved) ? saved : null,
			folders,
			total,
		}
		return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
	} catch (error) {
		return errorResponse(error)
	}
}

/** Chooses (or clears, with null) the folder that holds this site's content. */
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
		const raw = body && typeof body === 'object' ? (body as { folderId?: unknown }).folderId : undefined
		if (raw !== null && typeof raw !== 'string')
			return NextResponse.json({ error: 'Choose a folder.' }, { status: 400 })

		const id = raw === null ? null : parseObjectId(raw)
		if (raw !== null && (!id || !(await folderSubtree(db, site.workspaceId, id))))
			return NextResponse.json({ error: 'That folder no longer exists.' }, { status: 404 })

		await db
			.collection<SiteDoc>('sites')
			.updateOne({ _id: site._id }, { $set: { mediaFolderId: id, updatedAt: new Date() } })

		return NextResponse.json({ folderId: id ? id.toString() : null })
	} catch (error) {
		return errorResponse(error)
	}
}
