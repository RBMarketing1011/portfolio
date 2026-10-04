import { ObjectId } from 'mongodb'
import { requireMedia } from '@/lib/media/access'
import { savedSearchesOf } from '@/lib/media/collections'
import { toSavedSearchDTO } from '@/lib/media/dto'
import { MediaError } from '@/lib/media/errors'
import { loadFolderIndex } from '@/lib/media/folders'
import { json, mediaError, parseBody } from '@/lib/media/http'
import { savedSearchSchema } from '@/lib/media/schemas'
import { MEDIA_LIMITS, type MediaSavedSearchDoc } from '@/lib/media/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** "Kitchen  Ideas" and "kitchen ideas" are the same name. */
const nameKey = (name: string) =>
	name.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()

const capMessage = `You can keep up to ${MEDIA_LIMITS.savedSearchesMax} saved searches. Delete one to save another.`
const duplicateMessage = 'A saved search with that name already exists.'

export async function GET(request: Request) {
	try {
		const { db, workspace } = await requireMedia('view', request)
		const docs = await savedSearchesOf(db)
			.find({ workspaceId: workspace._id })
			.sort({ createdAt: -1, _id: -1 })
			.toArray()
		return json({ saved: docs.map(toSavedSearchDTO) })
	} catch (error) {
		return mediaError(error)
	}
}

export async function POST(request: Request) {
	try {
		const { db, workspace, userId } = await requireMedia('write', request)
		const body = await parseBody(request, savedSearchSchema)

		const name = body.name.replace(/\s+/g, ' ').trim()
		// eslint-disable-next-line no-control-regex
		if (!name || /[\u0000-\u001f\u007f]/.test(name))
			throw new MediaError('Give the search a name.', 400)
		const query = body.query.trim()
		const folder = body.folder ?? null
		if (!query && !folder)
			throw new MediaError('Type a search or choose a folder before saving.', 400)

		// A saved search stores the folder's id so a rename cannot break it, which
		// also means an id nobody owns would silently match nothing for ever.
		if (folder && folder !== 'unfiled') {
			const index = await loadFolderIndex(db, workspace._id)
			if (!index.has(folder))
				throw new MediaError('That folder no longer exists.', 400)
		}

		const saved = savedSearchesOf(db)
		const key = nameKey(name)
		const existing = await saved.find({ workspaceId: workspace._id }).toArray()
		if (existing.length >= MEDIA_LIMITS.savedSearchesMax)
			throw new MediaError(capMessage, 409)
		if (existing.some((doc) => nameKey(doc.name) === key))
			throw new MediaError(duplicateMessage, 409)

		const doc: MediaSavedSearchDoc = {
			_id: new ObjectId(),
			workspaceId: workspace._id,
			name,
			query,
			folder,
			sort: body.sort ?? null,
			createdBy: userId,
			createdAt: new Date(),
		}
		await saved.insertOne(doc)

		// The checks above are read-then-write, so two requests can both pass them.
		// Re-read in a fixed order: each side sees the same list, so exactly one of
		// two racers is the loser and removes itself.
		const ordered = await saved
			.find({ workspaceId: workspace._id })
			.sort({ createdAt: 1, _id: 1 })
			.toArray()
		const position = ordered.findIndex((other) => other._id.equals(doc._id))
		const earlier = position < 0 ? ordered : ordered.slice(0, position)
		const clash = earlier.some((other) => nameKey(other.name) === key)
		if (clash || position >= MEDIA_LIMITS.savedSearchesMax) {
			await saved.deleteOne({ _id: doc._id, workspaceId: workspace._id })
			throw new MediaError(clash ? duplicateMessage : capMessage, 409)
		}

		return json({ saved: toSavedSearchDTO(doc) }, 201)
	} catch (error) {
		return mediaError(error)
	}
}
