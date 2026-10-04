import { after } from 'next/server'
import type { Db, ObjectId } from 'mongodb'
import { requireMedia } from '@/lib/media/access'
import {
	acceptAutoTags,
	addTagsToAssets,
	deleteAssets,
	moveAssets,
	removeTagsFromAssets,
} from '@/lib/media/assets'
import { parseObjectId } from '@/lib/media/collections'
import { MediaError } from '@/lib/media/errors'
import { json, mediaError, parseBody, parseId } from '@/lib/media/http'
import { queueTagging, runTagging } from '@/lib/media/process'
import { bulkBodySchema, type BulkTarget } from '@/lib/media/schemas'
import { resolveSearchIds, type SearchContext } from '@/lib/media/search'
import { isTaggingConfigured } from '@/lib/media/tagger'
import { MEDIA_LIMITS, type MediaBulkResponse } from '@/lib/media/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * The ids the action runs against. A search target is resolved ONCE and checked
 * against what the person saw, so a bulk delete cannot land on a different set than
 * the one they confirmed.
 */
async function resolveTarget(
	db: Db,
	ctx: SearchContext,
	target: BulkTarget,
): Promise<ObjectId[]> {
	if ('ids' in target) {
		const seen = new Set<string>()
		const ids: ObjectId[] = []
		for (const raw of target.ids) {
			const id = parseId(raw)
			const key = id.toString()
			if (seen.has(key)) continue
			seen.add(key)
			ids.push(id)
		}
		return ids
	}

	const { q, folder, deep, expect } = target.search
	const found = await resolveSearchIds(
		db,
		ctx,
		{ q, folder, deep },
		MEDIA_LIMITS.bulkSearchCap,
	)
	if (found.overflow)
		throw new MediaError('Too many matches, narrow the search.', 409)
	if (found.total !== expect || found.ids.length !== found.total)
		throw new MediaError('The results changed. Review and try again.', 409)
	return found.ids
}

/** One background run for freshly queued images; see the note in the register route. */
function nudgeTagging(db: Db, workspaceId: ObjectId) {
	try {
		if (!isTaggingConfigured()) return
		after(async () => {
			try {
				await runTagging(db, workspaceId)
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
		// Which permission to demand depends on the action, and the account has to be
		// demanded first. Peek at the action on a clone; the schema below is the judge,
		// and the same bytes cannot parse to a different action.
		const peek: unknown = await request
			.clone()
			.json()
			.catch(() => null)
		const wantsDelete =
			typeof peek === 'object' &&
			peek !== null &&
			(peek as { action?: unknown }).action === 'delete'
		const { db, workspace, userId } = await requireMedia(
			wantsDelete ? 'delete' : 'write',
			request,
		)
		const body = await parseBody(request, bulkBodySchema)
		const ctx: SearchContext = { workspaceId: workspace._id, userId }

		// Refuse before resolving anything: there is nothing to queue without a key.
		if (body.action === 'retag' && !isTaggingConfigured())
			throw new MediaError(
				'Auto-tagging is off. Add an ANTHROPIC_API_KEY to turn it on.',
				409,
			)

		const ids = await resolveTarget(db, ctx, body.target)
		let affected = 0
		if (ids.length > 0) {
			switch (body.action) {
				case 'move':
					affected = await moveAssets(
						db,
						workspace._id,
						ids,
						parseObjectId(body.folderId),
					)
					break
				case 'addTags':
					affected = (await addTagsToAssets(db, workspace._id, ids, body.tags))
						.changed
					break
				case 'removeTags':
					affected = (
						await removeTagsFromAssets(db, workspace._id, ids, body.tags)
					).changed
					break
				case 'acceptAutoTags':
					affected = (await acceptAutoTags(db, workspace._id, ids)).changed
					break
				case 'delete':
					affected = await deleteAssets(db, workspace._id, ids)
					break
				case 'retag':
					affected = await queueTagging(db, workspace._id, ids)
					if (affected > 0) nudgeTagging(db, workspace._id)
					break
			}
		}

		const response: MediaBulkResponse = { affected }
		return json(response)
	} catch (error) {
		return mediaError(error)
	}
}
