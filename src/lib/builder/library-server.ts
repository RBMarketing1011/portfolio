import 'server-only'
import { ObjectId, type Db } from 'mongodb'
import { assetsOf } from '@/lib/media/collections'
import type { FolderIndex } from '@/lib/media/folder-index'
import { getFoldersResponse, loadFolderIndex } from '@/lib/media/folders'
import type { MediaAssetDoc } from '@/lib/media/types'
import {
	LIBRARY_IMAGES_MAX,
	type LibraryFolder,
	type LibraryImage,
	type LibraryImagesResponse,
} from './library'

/**
 * The server half of library.ts: one workspace's folders, a folder's images, and the
 * checks that tie a URL or a folder to the workspace a site belongs to. Every query
 * starts from the workspace id, so nothing here can reach another account's images.
 */

/** Every folder of the workspace, parents before children, with its image counts. */
export async function libraryFolders(db: Db, workspaceId: ObjectId): Promise<{ folders: LibraryFolder[]; total: number }> {
	const response = await getFoldersResponse(db, workspaceId)
	return {
		folders: response.folders.map(({ id, parentId, name, path, depth, count, total }) => ({
			id,
			parentId,
			name,
			path,
			depth,
			count,
			total,
		})),
		total: response.total,
	}
}

/** The folder and every folder beneath it; null when it is not one of this workspace's folders. */
export async function folderSubtree(
	db: Db,
	workspaceId: ObjectId,
	folderId: ObjectId | string | null | undefined,
	index?: FolderIndex,
): Promise<ObjectId[] | null> {
	if (!folderId) return null
	const folders = index ?? (await loadFolderIndex(db, workspaceId))
	const id = folderId.toString()
	if (!folders.has(id)) return null
	return folders.subtree(id).map((value) => new ObjectId(value))
}

const IMAGE_PROJECTION = {
	name: 1,
	url: 1,
	width: 1,
	height: 1,
	kind: 1,
	hasAlpha: 1,
	blur: 1,
	caption: 1,
	altText: 1,
	folderId: 1,
} as const

type ImageFields = Pick<
	MediaAssetDoc,
	'_id' | 'name' | 'url' | 'width' | 'height' | 'kind' | 'hasAlpha' | 'blur' | 'caption' | 'altText' | 'folderId'
>

export function toLibraryImage(doc: ImageFields, folders: FolderIndex): LibraryImage {
	return {
		id: doc._id.toString(),
		name: doc.name ?? '',
		url: doc.url,
		width: doc.width,
		height: doc.height,
		kind: doc.kind ?? null,
		hasAlpha: Boolean(doc.hasAlpha),
		blur: doc.blur ?? null,
		caption: doc.caption || doc.altText || '',
		folderPath: doc.folderId ? folders.pathOf(doc.folderId.toString()) : '',
	}
}

/**
 * A folder's analysed images and its subfolders', newest first, at most
 * `LIBRARY_IMAGES_MAX`. Null when the folder is not this workspace's.
 */
export async function folderImages(db: Db, workspaceId: ObjectId, folderId: ObjectId | string): Promise<LibraryImagesResponse | null> {
	const folders = await loadFolderIndex(db, workspaceId)
	const scope = await folderSubtree(db, workspaceId, folderId, folders)
	if (!scope) return null
	const docs = await assetsOf(db)
		.find(
			{ workspaceId, folderId: { $in: scope }, width: { $gt: 0 }, height: { $gt: 0 } },
			{ projection: IMAGE_PROJECTION },
		)
		.sort({ createdAt: -1, _id: -1 })
		.limit(LIBRARY_IMAGES_MAX + 1)
		.toArray()
	return {
		folderId: folderId.toString(),
		images: docs.slice(0, LIBRARY_IMAGES_MAX).map((doc) => toLibraryImage(doc, folders)),
		truncated: docs.length > LIBRARY_IMAGES_MAX,
	}
}

/** Which of these URLs are images in this workspace's library. */
export async function libraryUrlsOf(db: Db, workspaceId: ObjectId, urls: string[]): Promise<Set<string>> {
	const wanted = [...new Set(urls.filter((url) => typeof url === 'string' && url))]
	if (!wanted.length) return new Set()
	const docs = await assetsOf(db)
		.find({ workspaceId, url: { $in: wanted } }, { projection: { url: 1 } })
		.toArray()
	return new Set(docs.map((doc) => doc.url))
}
