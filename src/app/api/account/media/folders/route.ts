import { requireMedia } from '@/lib/media/access'
import { toFolderDTOs } from '@/lib/media/dto'
import {
	createFolder,
	getFoldersResponse,
	loadFolderIndex,
} from '@/lib/media/folders'
import { json, mediaError, parseBody, parseId } from '@/lib/media/http'
import { folderCreateSchema } from '@/lib/media/schemas'
import type { MediaFolderDTO } from '@/lib/media/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
	try {
		const { db, workspace } = await requireMedia('view', request)
		return json(await getFoldersResponse(db, workspace._id))
	} catch (error) {
		return mediaError(error)
	}
}

export async function POST(request: Request) {
	try {
		const { db, workspace, userId } = await requireMedia('write', request)
		const body = await parseBody(request, folderCreateSchema)
		const parentId = body.parentId ? parseId(body.parentId, 'Folder') : null

		const doc = await createFolder(db, workspace._id, userId, {
			name: body.name,
			parentId,
		})

		// A new folder holds nothing yet, so its counts are zero by construction.
		const index = await loadFolderIndex(db, workspace._id)
		const id = doc._id.toString()
		const built = toFolderDTOs(index, new Map()).find((f) => f.id === id)
		const parent = parentId ? parentId.toString() : null
		const folder: MediaFolderDTO = built ?? {
			id,
			parentId: parent,
			name: doc.name,
			path: parent ? `${index.pathOf(parent)}/${doc.name}` : doc.name,
			depth: parent ? index.depthOf(parent) + 1 : 0,
			count: 0,
			total: 0,
		}
		return json({ folder }, 201)
	} catch (error) {
		return mediaError(error)
	}
}
