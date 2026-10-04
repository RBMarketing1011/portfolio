import 'server-only'
import { ObjectId, type Db } from 'mongodb'
import { assetsOf, foldersOf, parseObjectId } from './collections'
import { MediaError } from './errors'
import { buildFolderIndex, folderKey, type FolderIndex } from './folder-index'
import {
	MEDIA_LIMITS,
	type MediaFolderDoc,
	type MediaFolderDTO,
	type MediaFoldersResponse,
} from './types'

/**
 * Folder operations. The tree is rebuilt from the folder documents when needed
 * (see `folder-index.ts`); nothing about a folder's path is stored on an asset.
 *
 * `nameKey` is `folderKey(name)` imported from folder-index.ts, the only
 * definition, never recomputed locally. There are no transactions (the local
 * database is a standalone mongod), so every guard here is check-then-write and
 * every multi-step operation is ordered to be crash-safe and idempotent. The
 * guards only give friendly answers; what actually keeps the data sound is the
 * unique index { workspaceId, parentId, nameKey } plus re-reading after a write
 * that could have raced.
 */

/** What went wrong, with the status a route answers with. */
export class FolderError extends MediaError {}

const MAX_DEPTH = MEDIA_LIMITS.maxFolderDepth - 1

const isDuplicateKey = (error: unknown) =>
	typeof error === 'object' &&
	error !== null &&
	(error as { code?: unknown }).code === 11000

/**
 * Ids arrive as ObjectIds from routes, but a folder id that is anything else (a
 * string, an object carrying an operator) must never reach a filter. Re-parsing
 * through the strict 24-hex check yields a fresh id or null.
 */
const asId = (value: unknown): ObjectId | null => {
	if (value === null || value === undefined) return null
	if (typeof value === 'string') return parseObjectId(value)
	if (typeof value === 'object' && typeof (value as ObjectId).toHexString === 'function')
		return parseObjectId((value as ObjectId).toHexString())
	return null
}

/**
 * Trims and validates a display name. Rejects slashes (they would make a path
 * ambiguous), control characters, and names with nothing visible in them (only
 * spaces, zero-width or other invisible characters).
 */
function cleanName(raw: unknown): string {
	if (typeof raw !== 'string') throw new FolderError('Give the folder a name.', 400)
	const name = raw.trim()
	if (!name) throw new FolderError('Give the folder a name.', 400)
	if (name.length > MEDIA_LIMITS.folderNameMax)
		throw new FolderError(
			`Folder names can be at most ${MEDIA_LIMITS.folderNameMax} characters.`,
			400,
		)
	// eslint-disable-next-line no-control-regex
	if (/[/\\\u0000-\u001f\u007f]/.test(name))
		throw new FolderError('A folder name cannot contain slashes.', 400)
	// A lone surrogate cannot survive UTF-8, so the stored name and its key would drift.
	if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(name))
		throw new FolderError('A folder name contains an invalid character.', 400)
	if (/^[\p{Z}\p{C}]+$/u.test(name))
		throw new FolderError('Give the folder a name.', 400)
	return name
}

/** `Name (2)`, clipped so the whole thing still fits the name limit. */
function suffixed(name: string, n: number): string {
	const tail = ` (${n})`
	let base = name.slice(0, Math.max(1, MEDIA_LIMITS.folderNameMax - tail.length))
	// Never cut a surrogate pair in half.
	if (/[\ud800-\udbff]$/.test(base)) base = base.slice(0, -1)
	return `${base.trimEnd()}${tail}`
}

const idKey = (id: ObjectId | null) => (id ? id.toString() : null)

/**
 * Walks up from `startId` over the raw parent pointers (the index cuts cycles
 * to protect page loads, which is exactly what hides one here). Returns every
 * id on the way up, the start included, and whether the walk looped.
 */
function walkUp(
	docs: Pick<MediaFolderDoc, '_id' | 'parentId'>[],
	startId: string,
): { chain: string[]; loops: boolean } {
	const parentOf = new Map(docs.map((d) => [d._id.toString(), idKey(d.parentId)]))
	const chain: string[] = []
	const seen = new Set<string>()
	let cursor: string | null | undefined = startId
	while (cursor && parentOf.has(cursor)) {
		if (seen.has(cursor)) return { chain, loops: true }
		seen.add(cursor)
		chain.push(cursor)
		cursor = parentOf.get(cursor)
	}
	return { chain, loops: false }
}

/**
 * Whether `id` currently sits somewhere it must not: it is its own ancestor
 * (a cycle), its parent no longer exists, or its subtree is deeper than allowed.
 */
function misplaced(docs: MediaFolderDoc[], id: string): boolean {
	const self = docs.find((d) => d._id.toString() === id)
	if (!self) return false
	if (self.parentId && !docs.some((d) => d._id.equals(self.parentId!))) return true
	const parentOf = new Map(docs.map((d) => [d._id.toString(), idKey(d.parentId)]))
	const seen = new Set<string>([id])
	let cursor = parentOf.get(id)
	while (cursor && parentOf.has(cursor)) {
		if (cursor === id) return true
		if (seen.has(cursor)) return true
		seen.add(cursor)
		cursor = parentOf.get(cursor)
	}
	const index = buildFolderIndex(docs)
	return index.depthOf(id) + index.height(id) > MAX_DEPTH
}

/**
 * Re-parents one folder, but only while it still sits under `from`. When the
 * destination already has a sibling of that name the folder is renamed
 * `Name (2)`, `Name (3)`... (`taken` holds the destination's name keys, kept up to
 * date by the caller). Returns false when the folder moved or vanished meanwhile.
 */
async function reparent(
	db: Db,
	workspaceId: ObjectId,
	folder: Pick<MediaFolderDoc, '_id' | 'name' | 'nameKey' | 'parentId'>,
	to: ObjectId | null,
	taken: Set<string>,
): Promise<boolean> {
	const folders = foldersOf(db)
	for (let n = 1; n <= MEDIA_LIMITS.maxFolders + 2; n++) {
		const name = n === 1 ? folder.name : suffixed(folder.name, n)
		const key = n === 1 ? folder.nameKey : folderKey(name)
		if (taken.has(key)) continue
		try {
			const result = await folders.updateOne(
				{ _id: folder._id, workspaceId, parentId: folder.parentId },
				{
					$set: {
						parentId: to,
						...(n === 1 ? {} : { name, nameKey: key }),
						updatedAt: new Date(),
					},
				},
			)
			if (result.matchedCount === 0) return false
			taken.add(key)
			return true
		} catch (error) {
			if (!isDuplicateKey(error)) throw error
			taken.add(key)
		}
	}
	throw new FolderError('That move conflicted with another change. Try again.', 409)
}

async function siblingKeys(db: Db, workspaceId: ObjectId, parentId: ObjectId | null) {
	const rows = await foldersOf(db)
		.find({ workspaceId, parentId }, { projection: { nameKey: 1 } })
		.toArray()
	return new Set(rows.map((row) => row.nameKey))
}

/**
 * Moves every folder whose parent is `from` up to `to`, as many passes as it
 * takes (each pass is a query, so a retry after a crash resumes). Returns how
 * many it moved.
 */
async function moveChildren(
	db: Db,
	workspaceId: ObjectId,
	from: ObjectId,
	to: ObjectId | null,
): Promise<number> {
	const folders = foldersOf(db)
	let moved = 0
	let taken: Set<string> | null = null
	for (let pass = 0; pass < 50; pass++) {
		const children = await folders.find({ workspaceId, parentId: from }).toArray()
		if (!children.length) break
		taken ??= await siblingKeys(db, workspaceId, to)
		for (const child of children)
			if (await reparent(db, workspaceId, child, to, taken)) moved++
	}
	return moved
}

async function moveAssets(
	db: Db,
	workspaceId: ObjectId,
	from: ObjectId,
	to: ObjectId | null,
): Promise<number> {
	const result = await assetsOf(db).updateMany(
		{ workspaceId, folderId: from },
		{ $set: { folderId: to, updatedAt: new Date() } },
	)
	return result.modifiedCount
}

export async function loadFolders(
	db: Db,
	workspaceId: ObjectId,
): Promise<MediaFolderDoc[]> {
	return foldersOf(db).find({ workspaceId }).toArray()
}

export async function loadFolderIndex(
	db: Db,
	workspaceId: ObjectId,
): Promise<FolderIndex> {
	return buildFolderIndex(await loadFolders(db, workspaceId))
}

/**
 * The tree for the sidebar: every folder with its direct and recursive counts, plus
 * how many assets are unfiled, the total, the total bytes, and `unreviewed` (assets with
 * at least one automatic tag nobody has kept: `{ 'tags.source': 'auto' }`). Counts come
 * from one aggregation over the workspace's assets grouped by `folderId`; unreviewed is one
 * `countDocuments`; run them concurrently.
 *
 * `unfiled` counts only assets whose folderId is null, matching `folder=unfiled`
 * in search; an asset pointing at a folder that no longer exists is in `total`
 * (it still shows under All media) but in no folder's count.
 */
export async function getFoldersResponse(
	db: Db,
	workspaceId: ObjectId,
): Promise<MediaFoldersResponse> {
	const [docs, groups, unreviewed] = await Promise.all([
		loadFolders(db, workspaceId),
		assetsOf(db)
			.aggregate<{ _id: ObjectId | null; count: number; bytes: number }>([
				{ $match: { workspaceId } },
				{
					$group: {
						_id: '$folderId',
						count: { $sum: 1 },
						bytes: { $sum: { $ifNull: ['$bytes', 0] } },
					},
				},
			])
			.toArray(),
		assetsOf(db).countDocuments({ workspaceId, 'tags.source': 'auto' }),
	])

	const index = buildFolderIndex(docs)
	const direct = new Map<string, number>()
	let unfiled = 0
	let total = 0
	let bytes = 0
	for (const group of groups) {
		total += group.count
		bytes += group.bytes
		if (group._id) direct.set(group._id.toString(), group.count)
		else unfiled += group.count
	}

	// Parents come before children in display order, so walking it backwards folds
	// every folder into its parent after the folder itself is complete.
	const ordered = index.ordered()
	const recursive = new Map<string, number>()
	for (const node of ordered) recursive.set(node.id, direct.get(node.id) ?? 0)
	for (let i = ordered.length - 1; i >= 0; i--) {
		const node = ordered[i]
		if (node.parentId)
			recursive.set(
				node.parentId,
				(recursive.get(node.parentId) ?? 0) + (recursive.get(node.id) ?? 0),
			)
	}

	const folders: MediaFolderDTO[] = ordered.map((node) => ({
		id: node.id,
		parentId: node.parentId,
		name: node.name,
		path: node.path,
		depth: node.depth,
		count: direct.get(node.id) ?? 0,
		total: recursive.get(node.id) ?? 0,
	}))

	return { folders, unfiled, total, unreviewed, bytes }
}

/**
 * Creates a folder. Errors (FolderError): empty or slash-containing name (400),
 * parent not found (404), deeper than MEDIA_LIMITS.maxFolderDepth (400), too many
 * folders (400), a sibling already has the name, compared via `nameKey` (409; also
 * catch the unique-index E11000 so a race still answers 409).
 *
 * The folder cap is check-then-write, so a burst of concurrent creates can
 * overshoot it by a few; it exists to bound the tree, not to be exact.
 */
export async function createFolder(
	db: Db,
	workspaceId: ObjectId,
	userId: string,
	input: { name: string; parentId: ObjectId | null },
): Promise<MediaFolderDoc> {
	const name = cleanName(input?.name)
	const nameKey = folderKey(name)
	const rawParent = input?.parentId ?? null
	const parentId = asId(rawParent)
	if (rawParent !== null && !parentId) throw new FolderError('Folder not found.', 404)

	const docs = await loadFolders(db, workspaceId)
	let parentDepth = -1
	if (parentId) {
		if (!docs.some((d) => d._id.equals(parentId)))
			throw new FolderError('Folder not found.', 404)
		parentDepth = buildFolderIndex(docs).depthOf(parentId.toString())
	}
	if (parentDepth + 1 > MAX_DEPTH)
		throw new FolderError(
			`Folders can be nested at most ${MEDIA_LIMITS.maxFolderDepth} levels deep.`,
			400,
		)
	if (docs.length >= MEDIA_LIMITS.maxFolders)
		throw new FolderError(
			`A library can hold at most ${MEDIA_LIMITS.maxFolders} folders.`,
			400,
		)
	const clash = (existing: MediaFolderDoc[]) =>
		existing.some((d) => idKey(d.parentId) === idKey(parentId) && d.nameKey === nameKey)
	if (clash(docs))
		throw new FolderError('A folder with that name already exists here.', 409)

	const now = new Date()
	const doc: MediaFolderDoc = {
		_id: new ObjectId(),
		workspaceId,
		parentId,
		name,
		nameKey,
		createdBy: userId,
		createdAt: now,
		updatedAt: now,
	}
	try {
		await foldersOf(db).insertOne(doc)
	} catch (error) {
		if (isDuplicateKey(error))
			throw new FolderError('A folder with that name already exists here.', 409)
		throw error
	}

	// The parent may have been deleted or moved deeper between the check and the
	// insert. Look once more and undo our own insert rather than leave an orphan.
	const after = await loadFolders(db, workspaceId)
	if (parentId && !after.some((d) => d._id.equals(parentId))) {
		await foldersOf(db).deleteOne({ _id: doc._id, workspaceId })
		throw new FolderError('Folder not found.', 404)
	}
	if (misplaced(after, doc._id.toString())) {
		await foldersOf(db).deleteOne({ _id: doc._id, workspaceId })
		throw new FolderError('That change conflicted with another one. Try again.', 409)
	}
	return doc
}

/** Same name rules as `createFolder`. Renaming to the same name is a no-op, not a conflict. */
export async function renameFolder(
	db: Db,
	workspaceId: ObjectId,
	id: ObjectId,
	name: string,
): Promise<MediaFolderDoc> {
	const clean = cleanName(name)
	const folderId = asId(id)
	if (!folderId) throw new FolderError('Folder not found.', 404)
	const folders = foldersOf(db)
	const current = await folders.findOne({ _id: folderId, workspaceId })
	if (!current) throw new FolderError('Folder not found.', 404)
	if (current.name === clean) return current

	const nameKey = folderKey(clean)
	// A case-only change keeps the key; excluding the folder itself lets it through.
	const sibling = await folders.findOne({
		workspaceId,
		parentId: current.parentId,
		nameKey,
		_id: { $ne: folderId },
	})
	if (sibling) throw new FolderError('A folder with that name already exists here.', 409)

	try {
		const updated = await folders.findOneAndUpdate(
			{ _id: folderId, workspaceId },
			{ $set: { name: clean, nameKey, updatedAt: new Date() } },
			{ returnDocument: 'after' },
		)
		if (!updated) throw new FolderError('Folder not found.', 404)
		return updated
	} catch (error) {
		if (isDuplicateKey(error))
			throw new FolderError('A folder with that name already exists here.', 409)
		throw error
	}
}

/**
 * Re-parents a folder (null = top level). Errors: not found (404); into itself or one
 * of its own descendants (400); the result would exceed the depth limit counting the
 * folder's own height (400); a sibling already has the name (409).
 *
 * Two concurrent moves (A into B while B into A) each validate against their own snapshot
 * and could both succeed, creating a cycle. After the write, RE-READ the tree and, if the
 * moved folder is now an ancestor of itself, put it back where it was and answer 409
 * ("That move conflicted with another change. Try again."). The same re-read catches a
 * destination deleted meanwhile and a subtree pushed past the depth limit by a concurrent
 * create.
 */
export async function moveFolder(
	db: Db,
	workspaceId: ObjectId,
	id: ObjectId,
	parentId: ObjectId | null,
): Promise<MediaFolderDoc> {
	const folderId = asId(id)
	if (!folderId) throw new FolderError('Folder not found.', 404)
	const destination = asId(parentId ?? null)
	if (parentId !== null && parentId !== undefined && !destination)
		throw new FolderError('Folder not found.', 404)

	const docs = await loadFolders(db, workspaceId)
	const current = docs.find((d) => d._id.equals(folderId))
	if (!current) throw new FolderError('Folder not found.', 404)
	if (idKey(current.parentId) === idKey(destination)) return current

	let destinationDepth = -1
	if (destination) {
		if (!docs.some((d) => d._id.equals(destination)))
			throw new FolderError('Folder not found.', 404)
		if (walkUp(docs, destination.toString()).chain.includes(folderId.toString()))
			throw new FolderError('A folder cannot be moved into itself or its own subfolders.', 400)
		destinationDepth = buildFolderIndex(docs).depthOf(destination.toString())
	}
	const height = buildFolderIndex(docs).height(folderId.toString())
	if (destinationDepth + 1 + Math.max(height, 0) > MAX_DEPTH)
		throw new FolderError(
			`Folders can be nested at most ${MEDIA_LIMITS.maxFolderDepth} levels deep.`,
			400,
		)
	if (
		docs.some(
			(d) =>
				!d._id.equals(folderId) &&
				idKey(d.parentId) === idKey(destination) &&
				d.nameKey === current.nameKey,
		)
	)
		throw new FolderError('A folder with that name already exists there.', 409)

	const folders = foldersOf(db)
	let matched = 0
	try {
		const result = await folders.updateOne(
			{ _id: folderId, workspaceId, parentId: current.parentId },
			{ $set: { parentId: destination, updatedAt: new Date() } },
		)
		matched = result.matchedCount
	} catch (error) {
		if (isDuplicateKey(error))
			throw new FolderError('A folder with that name already exists there.', 409)
		throw error
	}
	if (!matched) {
		const still = await folders.findOne({ _id: folderId, workspaceId })
		if (!still) throw new FolderError('Folder not found.', 404)
		throw new FolderError('That move conflicted with another change. Try again.', 409)
	}

	const after = await loadFolders(db, workspaceId)
	if (misplaced(after, folderId.toString())) {
		// Put it back, renaming only if someone took its old name in the meantime.
		await reparent(
			db,
			workspaceId,
			{ ...current, parentId: destination },
			current.parentId,
			await siblingKeys(db, workspaceId, current.parentId),
		)
		throw new FolderError('That move conflicted with another change. Try again.', 409)
	}

	const moved = after.find((d) => d._id.equals(folderId))
	if (!moved) throw new FolderError('Folder not found.', 404)
	return moved
}

/**
 * Deletes a folder WITHOUT deleting what is in it: its images and subfolders move up to
 * its parent. Each step is a QUERY, not a precomputed list, so a retry after a crash
 * resumes safely:
 *   1. move each child folder up to the parent, retrying with ` (2)`, ` (3)`... on E11000
 *      (a name clash with the parent's existing children);
 *   2. `updateMany({ workspaceId, folderId: id }, { $set: { folderId: parentId } })`;
 *   3. delete the folder document LAST (a crash before this leaves a consistent tree:
 *      the folder is simply still there and empty);
 *   4. repeat step 2 once to catch an upload that landed in the folder meanwhile.
 * An asset must never point at a deleted folder before it has been moved. Returns what moved.
 *
 * After step 4 the children are swept once more: a folder created under this one
 * after step 1 would otherwise be left pointing at a parent that is gone.
 *
 * Deleting a folder that does not exist is a 404, and a second delete changes
 * nothing. That path also adopts anything still pointing at the missing id (what a
 * crash between steps 3 and 4 leaves) up to the top level, since its parent is
 * no longer known.
 */
export async function deleteFolder(
	db: Db,
	workspaceId: ObjectId,
	id: ObjectId,
): Promise<{ assets: number; folders: number }> {
	const folderId = asId(id)
	if (!folderId) throw new FolderError('Folder not found.', 404)
	const folder = await foldersOf(db).findOne({ _id: folderId, workspaceId })
	if (!folder) {
		await moveChildren(db, workspaceId, folderId, null)
		await moveAssets(db, workspaceId, folderId, null)
		throw new FolderError('Folder not found.', 404)
	}
	const parentId = folder.parentId

	let folders = await moveChildren(db, workspaceId, folderId, parentId)
	let assets = await moveAssets(db, workspaceId, folderId, parentId)
	await foldersOf(db).deleteOne({ _id: folderId, workspaceId })
	assets += await moveAssets(db, workspaceId, folderId, parentId)
	folders += await moveChildren(db, workspaceId, folderId, parentId)
	return { assets, folders }
}
