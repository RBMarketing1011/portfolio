import { requireMedia } from '@/lib/media/access'
import { MediaError } from '@/lib/media/errors'
import {
	deleteFolder,
	getFoldersResponse,
	loadFolderIndex,
	moveFolder,
	renameFolder,
} from '@/lib/media/folders'
import { json, mediaError, parseBody, parseId } from '@/lib/media/http'
import { folderPatchSchema } from '@/lib/media/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
	try {
		const { db, workspace } = await requireMedia('write', request)
		const id = parseId((await params).id, 'Folder')
		const body = await parseBody(request, folderPatchSchema)
		if (body.name === undefined && body.parentId === undefined)
			throw new MediaError('Nothing to change.', 400)

		// Rename and move are two writes. When both are asked for and the second
		// fails, the first is undone, so a failed request leaves the folder as it was.
		let original: string | undefined
		if (body.name !== undefined && body.parentId !== undefined) {
			const node = (await loadFolderIndex(db, workspace._id)).nodes.get(
				id.toString(),
			)
			if (!node) throw new MediaError('Folder not found.', 404)
			original = node.name
		}

		let renamed = false
		if (body.name !== undefined) {
			await renameFolder(db, workspace._id, id, body.name)
			renamed = body.name !== original
		}
		if (body.parentId !== undefined) {
			try {
				await moveFolder(
					db,
					workspace._id,
					id,
					body.parentId ? parseId(body.parentId, 'Folder') : null,
				)
			} catch (error) {
				if (renamed && original !== undefined)
					await renameFolder(db, workspace._id, id, original).catch(() => {})
				throw error
			}
		}

		// Live counts, so the tree can show the change without a second request.
		const { folders } = await getFoldersResponse(db, workspace._id)
		const folder = folders.find((f) => f.id === id.toString())
		if (!folder) throw new MediaError('Folder not found.', 404)
		return json({ folder })
	} catch (error) {
		return mediaError(error)
	}
}

export async function DELETE(request: Request, { params }: Params) {
	try {
		const { db, workspace } = await requireMedia('delete', request)
		const id = parseId((await params).id, 'Folder')
		const moved = await deleteFolder(db, workspace._id, id)
		return json({ moved })
	} catch (error) {
		return mediaError(error)
	}
}
