import { requireMedia } from '@/lib/media/access'
import { deleteAssets, getAsset, updateAsset } from '@/lib/media/assets'
import { toAssetDTO } from '@/lib/media/dto'
import { MediaError } from '@/lib/media/errors'
import { loadFolderIndex } from '@/lib/media/folders'
import { json, mediaError, parseBody, parseId } from '@/lib/media/http'
import { assetPatchSchema } from '@/lib/media/schemas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
	try {
		const { db, workspace } = await requireMedia('view', request)
		const id = parseId((await params).id)
		const doc = await getAsset(db, workspace._id, id)
		if (!doc) throw new MediaError('Image not found.', 404)
		return json({
			asset: toAssetDTO(doc, await loadFolderIndex(db, workspace._id)),
		})
	} catch (error) {
		return mediaError(error)
	}
}

export async function PATCH(request: Request, { params }: Params) {
	try {
		const { db, workspace } = await requireMedia('write', request)
		const id = parseId((await params).id)
		const patch = await parseBody(request, assetPatchSchema)
		const doc = await updateAsset(db, workspace._id, id, patch)
		return json({
			asset: toAssetDTO(doc, await loadFolderIndex(db, workspace._id)),
		})
	} catch (error) {
		return mediaError(error)
	}
}

export async function DELETE(request: Request, { params }: Params) {
	try {
		const { db, workspace } = await requireMedia('delete', request)
		const id = parseId((await params).id)
		// Scoped by workspace inside: a foreign id removes nothing and reads as absent.
		const removed = await deleteAssets(db, workspace._id, [id])
		if (removed < 1) throw new MediaError('Image not found.', 404)
		return json({ ok: true })
	} catch (error) {
		return mediaError(error)
	}
}
