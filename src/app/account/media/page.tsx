import { notFound } from 'next/navigation'
import { savedSearchesOf } from '@/lib/media/collections'
import { toSavedSearchDTO } from '@/lib/media/dto'
import { getFoldersResponse } from '@/lib/media/folders'
import { getTaggingStatus } from '@/lib/media/process'
import { readSearchParams } from '@/lib/media/schemas'
import { searchAssets } from '@/lib/media/search'
import { mediaPathPrefix } from '@/lib/media/storage'
import {
	MEDIA_LIMITS,
	type MediaSavedSearchDTO,
	type MediaTaggingStatusDTO,
} from '@/lib/media/types'
import { currentMembership } from '@/lib/workspace/current'
import { MediaLibrary } from './media-library'

export const metadata = { title: 'Media' }
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

/**
 * What the banner and the AI loop see when the tagging status could not be read: tagging
 * off, nothing waiting. Nothing then polls, and the page still works.
 */
const NO_TAGGING: MediaTaggingStatusDTO = {
	configured: false,
	model: null,
	pending: 0,
	running: 0,
	failed: 0,
	skipped: 0,
	untagged: 0,
	budgetExhausted: false,
	resetsAt: null,
}

/**
 * A load that only decorates the page: its value, or `fallback` when it fails, whether it
 * throws at once or rejects later. The failure is logged, never shown: the page works
 * without it.
 */
async function orElse<T>(what: string, load: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return await load()
	} catch (error) {
		console.error(`[media] could not load ${what}`, error)
		return fallback
	}
}

export default async function MediaPage({
	searchParams,
}: {
	// Next 15: searchParams is a Promise.
	searchParams: Promise<SearchParams>
}) {
	const membership = await currentMembership()
	if (!membership?.permissions.has('projects.view')) notFound()

	const { db, workspace, userId } = membership
	const workspaceId = workspace._id.toString()

	// The URL is read once here; whatever it holds, the first page and its facets are loaded.
	const params = {
		...readSearchParams(await searchParams),
		offset: 0,
		limit: MEDIA_LIMITS.pageSize,
		facets: true,
	}

	// The search and the folders are the page. Saved searches and the tagging status only
	// decorate it: when they fail the page renders without them instead of failing.
	const [search, folders, saved, tagging] = await Promise.all([
		searchAssets(db, { workspaceId: workspace._id, userId }, params),
		getFoldersResponse(db, workspace._id),
		orElse(
			'saved searches',
			async (): Promise<MediaSavedSearchDTO[]> =>
				(
					await savedSearchesOf(db)
						.find({ workspaceId: workspace._id })
						.sort({ createdAt: -1, _id: -1 })
						.toArray()
				).map(toSavedSearchDTO),
			[],
		),
		orElse('the tagging status', () => getTaggingStatus(db, workspace._id), NO_TAGGING),
	])

	return (
		<MediaLibrary
			initial={{ params, search, folders, saved, tagging }}
			can={{
				write: membership.permissions.has('media.upload'),
				delete: membership.permissions.has('media.delete'),
			}}
			workspaceId={workspaceId}
			maxBytes={MEDIA_LIMITS.maxBytes}
			pathPrefix={mediaPathPrefix(workspaceId)}
		/>
	)
}
