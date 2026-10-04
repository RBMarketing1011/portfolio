import { after } from 'next/server'
import type { Db, ObjectId } from 'mongodb'
import { requireMedia } from '@/lib/media/access'
import { registerUploadedBlob } from '@/lib/media/assets'
import { parseObjectId } from '@/lib/media/collections'
import { toAssetDTO } from '@/lib/media/dto'
import { loadFolderIndex } from '@/lib/media/folders'
import { json, mediaError, parseBody } from '@/lib/media/http'
import { runTagging } from '@/lib/media/process'
import { readSearchParams, registerBodySchema } from '@/lib/media/schemas'
import { searchAssets } from '@/lib/media/search'
import { isTaggingConfigured } from '@/lib/media/tagger'
import type { MediaRegisterResponse } from '@/lib/media/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
	try {
		const { db, workspace, userId } = await requireMedia('view', request)
		const params = readSearchParams(new URL(request.url).searchParams)
		return json(await searchAssets(db, { workspaceId: workspace._id, userId }, params))
	} catch (error) {
		return mediaError(error)
	}
}

/**
 * One background nudge for a fresh upload. It must never fail the registration:
 * `after()` throws synchronously where there is no `waitUntil`, and the task's own
 * errors have nowhere to go. The browser keeps polling /process either way.
 */
function nudgeTagging(db: Db, workspaceId: ObjectId, ids: ObjectId[]) {
	try {
		if (!isTaggingConfigured()) return
		after(async () => {
			try {
				await runTagging(db, workspaceId, { ids, limit: ids.length })
			} catch (error) {
				console.error('[media] background tagging failed', error)
			}
		})
	} catch (error) {
		console.error('[media] could not schedule background tagging', error)
	}
}

export async function POST(request: Request) {
	try {
		const { db, workspace, userId } = await requireMedia('write', request)
		const body = await parseBody(request, registerBodySchema)

		const { status, doc } = await registerUploadedBlob(
			db,
			{ workspaceId: workspace._id, userId },
			{
				url: body.url,
				pathname: body.pathname,
				filename: body.filename,
				folderId: parseObjectId(body.folderId ?? null),
			},
		)

		if (status === 'created')
			nudgeTagging(db, workspace._id, [doc._id])

		const asset = toAssetDTO(doc, await loadFolderIndex(db, workspace._id))
		const response: MediaRegisterResponse = { status, asset }
		return json(response, status === 'created' ? 201 : 200)
	} catch (error) {
		return mediaError(error)
	}
}
