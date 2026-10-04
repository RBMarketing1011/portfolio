import type { ObjectId } from 'mongodb'
import { requireMedia } from '@/lib/media/access'
import { toAssetDTO } from '@/lib/media/dto'
import { loadFolderIndex } from '@/lib/media/folders'
import { json, mediaError, parseBody, parseId } from '@/lib/media/http'
import {
	getTaggingStatus,
	requeueUntagged,
	runTagging,
} from '@/lib/media/process'
import { processBodySchema } from '@/lib/media/schemas'
import { isTaggingConfigured } from '@/lib/media/tagger'
import type { MediaProcessResponse } from '@/lib/media/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
	try {
		const { db, workspace } = await requireMedia('view', request)
		return json(await getTaggingStatus(db, workspace._id))
	} catch (error) {
		return mediaError(error)
	}
}

export async function POST(request: Request) {
	try {
		const { db, workspace } = await requireMedia('write', request)
		// The polling client may send nothing at all; that means "the defaults".
		const empty = (await request.clone().text()).trim() === ''
		const body = empty
			? processBodySchema.parse({})
			: await parseBody(request, processBodySchema)

		if (body.requeue) await requeueUntagged(db, workspace._id)

		let ids: ObjectId[] | undefined
		if (body.ids) {
			const seen = new Set<string>()
			ids = []
			for (const raw of body.ids) {
				const id = parseId(raw)
				if (seen.has(id.toString())) continue
				seen.add(id.toString())
				ids.push(id)
			}
		}

		const run = await runTagging(db, workspace._id, {
			// Naming ids and no limit means "all of these", not the default of two.
			limit: body.limit ?? (ids?.length ? ids.length : undefined),
			ids,
		})

		const folders = await loadFolderIndex(db, workspace._id)
		const response: MediaProcessResponse = {
			processed: run.processed.map((item) => ({
				id: item.id.toString(),
				status: item.status,
				...(item.doc ? { asset: toAssetDTO(item.doc, folders) } : {}),
			})),
			remaining: run.remaining,
			configured: isTaggingConfigured(),
			budgetExhausted: run.budgetExhausted,
			...(run.blocked ? { blocked: run.blocked } : {}),
		}
		return json(response)
	} catch (error) {
		return mediaError(error)
	}
}
