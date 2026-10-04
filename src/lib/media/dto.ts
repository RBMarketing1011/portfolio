/**
 * Stored document -> what the API returns. This is the one place that decides
 * what leaves the server, so the search index (`terms`), the AI lease, the
 * uploader's user id and the workspace id never reach a browser by accident.
 *
 * Pure.
 */
import type { FolderIndex } from './folder-index'
import {
	MEDIA_FORMAT_BY_TYPE,
	type MediaAssetDTO,
	type MediaAssetDoc,
	type MediaFolderDTO,
	type MediaSavedSearchDTO,
	type MediaSavedSearchDoc,
} from './types'

export function toAssetDTO(
	doc: MediaAssetDoc,
	folders: FolderIndex,
	match?: { score: number; fields: string[] },
): MediaAssetDTO {
	const folderId = doc.folderId ? doc.folderId.toString() : null
	return {
		id: doc._id.toString(),
		name: doc.name,
		filename: doc.filename,
		url: doc.url,
		contentType: doc.contentType,
		format: MEDIA_FORMAT_BY_TYPE[doc.contentType] ?? 'jpg',
		bytes: doc.bytes,
		width: doc.width,
		height: doc.height,
		orientation: doc.orientation,
		hasAlpha: doc.hasAlpha,
		animated: doc.animated,
		colors: doc.colors ?? [],
		brightness: doc.brightness,
		saturation: doc.saturation,
		blur: doc.blur ?? null,
		// A folder deleted out from under an asset reads as the root, not as a dead id.
		folderId: folderId && folders.has(folderId) ? folderId : null,
		folderPath: folderId ? folders.pathOf(folderId) : '',
		tags: doc.tags ?? [],
		caption: doc.caption ?? '',
		altText: doc.altText ?? '',
		textInImage: doc.textInImage ?? '',
		notes: doc.notes ?? '',
		kind: doc.kind ?? null,
		tagging: {
			status: doc.tagging?.status ?? 'skipped',
			...(doc.tagging?.reason ? { reason: doc.tagging.reason } : {}),
			...(doc.tagging?.status === 'failed' && doc.tagging.error
				? { error: doc.tagging.error }
				: {}),
		},
		createdAt: doc.createdAt.toISOString(),
		updatedAt: doc.updatedAt.toISOString(),
		...(match ? { match } : {}),
	}
}

/**
 * `direct` is assets per folder id. Totals fold each folder's subtree in, so the
 * tree can show "Clients (212)" without a second query.
 */
export function toFolderDTOs(
	folders: FolderIndex,
	direct: Map<string, number>,
): MediaFolderDTO[] {
	return folders.ordered().map((node) => ({
		id: node.id,
		parentId: node.parentId,
		name: node.name,
		path: node.path,
		depth: node.depth,
		count: direct.get(node.id) ?? 0,
		total: folders
			.subtree(node.id)
			.reduce((sum, id) => sum + (direct.get(id) ?? 0), 0),
	}))
}

export const toSavedSearchDTO = (
	doc: MediaSavedSearchDoc,
): MediaSavedSearchDTO => ({
	id: doc._id.toString(),
	name: doc.name,
	query: doc.query,
	folder: doc.folder ?? null,
	sort: doc.sort ?? null,
	createdAt: doc.createdAt.toISOString(),
})
