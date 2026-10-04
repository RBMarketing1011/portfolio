import { requireMedia } from '@/lib/media/access'
import { savedSearchesOf } from '@/lib/media/collections'
import { MediaError } from '@/lib/media/errors'
import { json, mediaError, parseId } from '@/lib/media/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(request: Request, { params }: Params) {
	try {
		const { db, workspace } = await requireMedia('write', request)
		const id = parseId((await params).id, 'Saved search')
		// An id alone never reaches the database: it is always paired with the account.
		const { deletedCount } = await savedSearchesOf(db).deleteOne({
			_id: id,
			workspaceId: workspace._id,
		})
		if (!deletedCount) throw new MediaError('Saved search not found.', 404)
		return json({ ok: true })
	} catch (error) {
		return mediaError(error)
	}
}
