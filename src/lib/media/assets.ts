import 'server-only'
import { ObjectId, type Db } from 'mongodb'
import { analyzeImage, UnsupportedImageError } from '@/lib/media/analyze'
import {
	assetsOf,
	foldersOf,
	parseObjectId,
	workspaceAssets,
} from '@/lib/media/collections'
import { commitAsset, commitMany, type AssetChange } from '@/lib/media/commit'
import { MediaError } from '@/lib/media/errors'
import { filenameTags } from '@/lib/media/filename-tags'
import type { AssetPatch } from '@/lib/media/schemas'
import {
	BlobGoneError,
	BlobTooLargeError,
	BlobUrlError,
	deleteBlob,
	headBlob,
	isOwnedPathname,
	mediaPathPrefix,
	nameFromFilename,
	readBlob,
	safeFilename,
	type BlobInfo,
} from '@/lib/media/storage'
import { isTaggingConfigured } from '@/lib/media/tagger'
import {
	applyManualTags,
	loadTagRules,
	mergeAutoTags,
	normalizeTag,
	promoteAutoTags,
	removeTagsBySlug,
	type TagRules,
} from '@/lib/media/tags'
import { derivedFields } from '@/lib/media/terms'
import { clampText, slugify } from '@/lib/media/text'
import {
	MEDIA_CONTENT_TYPES,
	MEDIA_LIMITS,
	type ImageAnalysis,
	type MediaAssetDoc,
	type MediaTag,
	type MediaTaggingState,
} from '@/lib/media/types'
import { invalidateVocabulary } from '@/lib/media/vocabulary'

/**
 * Asset lifecycle: register an upload, edit it, move it, tag it, delete it.
 *
 * Rules every function here follows:
 *  - Every query carries `workspaceId`; an `_id` alone is never enough.
 *  - Every write that touches tags, caption, alt text, name, notes, kind or keywords goes
 *    through `commitAsset` / `commitMany` (commit.ts), which rebuild `derivedFields`, bump
 *    `rev` and call `invalidateVocabulary`. Never a bare `updateOne` on those fields.
 *  - There are no transactions. Operations are ordered to fail safe and are safe to retry.
 *  - NO CODE PATH deletes a blob named by a request body. Deletion targets come from
 *    `headBlob` results or stored documents, through `deleteBlob(info, prefix)`, and only
 *    ever via `discard` below.
 */

/** What went wrong, with the status a route answers with. */
export class AssetError extends MediaError {}

export type RegisterContext = { workspaceId: ObjectId; userId: string }

type BlobRef = Pick<BlobInfo, 'url' | 'pathname'>
type Registered = { status: 'created' | 'duplicate'; doc: MediaAssetDoc }
type Counts = { changed: number; conflicts: number }

const NOT_FOUND = 'Image not found.'
const NO_FOLDER = 'Folder not found.'
const UNVERIFIED = 'That upload could not be verified.'
const NOT_AN_IMAGE = 'That file is not a supported image.'
const MAX_MB = MEDIA_LIMITS.maxBytes / (1024 * 1024)
/** Blob deletions in flight at once, so a slice of 500 finishes well inside a request. */
const BLOB_BATCH = 16
/** The schema caps these; direct callers get the same ceilings. */
const MAX_ADD_TAGS = 20
const ALLOWED_TYPES: readonly string[] = MEDIA_CONTENT_TYPES

const isId = (value: unknown): value is ObjectId => value instanceof ObjectId

const isDuplicateKey = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	(error as { code?: unknown }).code === 11000

/** headBlob and readBlob already strip credentials from what they throw; this logs one bounded line of it. */
function logStoreError(what: string, error: unknown) {
	const text = error instanceof Error ? error.message : 'error'
	console.warn(`media: ${what}:`, text.replace(/\s+/g, ' ').slice(0, 200))
}

/** Distinct ObjectIds, first occurrence kept. Anything else (a string, an operator object) never reaches a filter. */
function uniqueIds(ids: unknown): ObjectId[] {
	if (!Array.isArray(ids)) return []
	const seen = new Set<string>()
	const out: ObjectId[] = []
	for (const id of ids) {
		if (!isId(id)) continue
		const key = id.toHexString()
		if (seen.has(key)) continue
		seen.add(key)
		out.push(id)
	}
	return out
}

/** A folder id from a caller: an ObjectId, a 24-hex string or null. Undefined when it is none of these. */
function readFolderId(value: unknown): ObjectId | null | undefined {
	if (value === null || value === undefined) return null
	if (isId(value)) return value
	if (typeof value === 'string') return parseObjectId(value) ?? undefined
	return undefined
}

async function folderExists(
	db: Db,
	workspaceId: ObjectId,
	folderId: ObjectId,
): Promise<boolean> {
	const found = await foldersOf(db).findOne(
		{ _id: folderId, workspaceId },
		{ projection: { _id: 1 } },
	)
	return found !== null
}

/**
 * A folder deleted between the existence check and the write would leave the image
 * pointing at nothing, which the tree counts nowhere. Looking once more after the
 * write closes the gap from this side; `deleteFolder`'s own final sweep closes it
 * from the other, so every interleaving ends with the image somewhere real.
 */
async function settleFolder(
	db: Db,
	workspaceId: ObjectId,
	id: ObjectId,
	folderId: ObjectId,
	doc: MediaAssetDoc,
): Promise<MediaAssetDoc> {
	if (await folderExists(db, workspaceId, folderId)) return doc
	const moved = await commitAsset(db, workspaceId, id, (fresh) =>
		isId(fresh.folderId) && fresh.folderId.equals(folderId) ? { folderId: null } : null,
	)
	return moved ?? doc
}

/* -------------------------------------------------------------------------- */
/* Removing blobs                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The ONLY way this module removes a blob. A blob some asset in the workspace still
 * points at is never deleted, whatever race led here: those assets are returned
 * (by pathname) and nothing else is touched. Everything else goes through
 * `deleteBlob(info, prefix)`, which re-checks that it is inside this workspace's
 * prefix at the moment of deletion. Best effort: a blob that cannot be removed is
 * an orphan, which costs storage and nothing else.
 *
 * Not knowing is not a licence to delete: if the lookup fails the blobs stay.
 */
async function discard(
	db: Db,
	workspaceId: ObjectId,
	refs: BlobRef[],
): Promise<Map<string, MediaAssetDoc>> {
	const held = new Map<string, MediaAssetDoc>()
	const usable = refs.filter(
		(ref) => typeof ref?.url === 'string' && typeof ref?.pathname === 'string',
	)
	if (usable.length === 0) return held

	try {
		const docs = await assetsOf(db)
			.find({ workspaceId, pathname: { $in: usable.map((ref) => ref.pathname) } })
			.toArray()
		for (const doc of docs) held.set(doc.pathname, doc)
	} catch (error) {
		console.warn(
			'media: could not check whether an asset holds a blob, so it was kept:',
			error instanceof Error ? error.name : 'error',
		)
		return held
	}

	const prefix = mediaPathPrefix(workspaceId.toHexString())
	const doomed = usable.filter((ref) => !held.has(ref.pathname))
	for (let start = 0; start < doomed.length; start += BLOB_BATCH) {
		await Promise.all(
			doomed.slice(start, start + BLOB_BATCH).map(async (ref) => {
				try {
					await deleteBlob({ url: ref.url, pathname: ref.pathname }, prefix)
				} catch (error) {
					// deleteBlob never throws; this is only a promise that a slice cannot be aborted by one blob.
					console.warn(
						'media: a blob delete failed:',
						error instanceof Error ? error.name : 'error',
					)
				}
			}),
		)
	}
	return held
}

/**
 * Refuses a blob that is proven to be this workspace's: it is removed unless an asset
 * already holds it. Then the twin won, and that asset is the answer.
 */
async function refuse(
	db: Db,
	workspaceId: ObjectId,
	info: BlobRef,
	error: AssetError,
): Promise<Registered> {
	const twin = (await discard(db, workspaceId, [info])).get(info.pathname)
	if (twin) return { status: 'created', doc: twin }
	throw error
}

/* -------------------------------------------------------------------------- */
/* Registering                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Step 1: nothing is downloaded or deleted until the store itself says this blob exists,
 * is inside the workspace's prefix, and is the one the caller named. A pathname that is
 * not ours is somebody else's claim, so it costs no store round trip.
 */
async function proveClaim(
	workspaceId: ObjectId,
	url: unknown,
	pathname: unknown,
): Promise<BlobInfo> {
	const workspace = workspaceId.toHexString()
	if (
		typeof url !== 'string' ||
		typeof pathname !== 'string' ||
		!isOwnedPathname(pathname, workspace)
	)
		throw new AssetError(UNVERIFIED, 400)

	let info: BlobInfo
	try {
		info = await headBlob(url)
	} catch (error) {
		// Only the fixed "no longer stored" text is shown; a store error's own text never is.
		// A store that is down or misconfigured would otherwise fail every upload without a trace.
		if (!(error instanceof BlobGoneError) && !(error instanceof BlobUrlError))
			logStoreError('the blob store could not confirm an upload', error)
		throw new AssetError(error instanceof BlobGoneError ? error.message : UNVERIFIED, 400)
	}
	// The url may name any blob in the store (another account's, a published site's). Both
	// the claimed pathname and the store's answer must be ours, and the same.
	if (info.pathname !== pathname || !isOwnedPathname(info.pathname, workspace))
		throw new AssetError(UNVERIFIED, 400)
	return info
}

/** `image/png; charset=binary` is still a png: the decode, not the header, decides what it is. */
const baseType = (contentType: unknown): string =>
	typeof contentType === 'string' ? contentType.split(';')[0].trim().toLowerCase() : ''

/**
 * Turns a blob the browser just uploaded into a library asset. The browser AND the
 * upload webhook both call this for the same blob, at about the same moment, so every
 * step assumes a concurrent twin. In this ORDER:
 *
 *  1. Prove the claim BEFORE downloading or deleting anything. `info = await headBlob(url)`;
 *     if it throws (not a blob URL, no such blob, store error) -> AssetError 400 and
 *     delete NOTHING. Require `isOwnedPathname(pathname, ws)`, `info.pathname === pathname`
 *     and `isOwnedPathname(info.pathname, ws)`; otherwise AssetError 400 and delete NOTHING
 *     (the blob is not proven to be the caller's: the `url` may name another account's
 *     image or a published site's, and deleting it would destroy it). From here on the blob
 *     is proven to be inside this workspace's prefix, and EVERY cleanup below deletes
 *     `info`, never the request's `url`.
 *     Then: `info.size > MEDIA_LIMITS.maxBytes` -> discard + 413; a content type outside
 *     MEDIA_CONTENT_TYPES -> discard + 415 (an empty object is discard + 422).
 *  2. Idempotent on `{ workspaceId, pathname }`: an existing asset is returned as `created`.
 *  3. Caps: live assets >= MEDIA_LIMITS.maxAssets -> discard + 429; the workspace's total
 *     bytes + `info.size` > maxTotalBytes -> discard + 429 (a few concurrent uploads may
 *     overshoot slightly; that is acceptable).
 *  4. `readBlob(info.url)` + `analyzeImage`. `UnsupportedImageError` -> discard + 422;
 *     `BlobGoneError` -> AssetError 400, nothing to delete. A blob that could not be read
 *     for any other reason is kept (503): a retry may well succeed.
 *  5. Look up `{ workspaceId, pathname }` AGAIN (the twin may have finished while we analysed):
 *     if it exists return it as `created`, delete nothing.
 *  6. Exact duplicate: a document in this workspace with the same `sha256` AND
 *     `pathname: { $ne: info.pathname }` (a row for THIS blob is never a duplicate of itself)
 *     -> discard the new blob, return `{ status: 'duplicate', doc: existing }`.
 *  7. Folder: `folderId` must exist in this workspace or be null, else AssetError 400 (via
 *     `discard`, which returns the twin's asset if one appeared).
 *  8. Insert with: `name = nameFromFilename`, `filename = safeFilename`, filename tags via
 *     `mergeAutoTags(..., 'filename', rules)`, the analysis fields, `pixels`, `rev: 0`,
 *     `tagging` = pending (or `skipped`/`not_configured` when tagging is not configured),
 *     `uploadedBy`, derivedFields. An E11000 on the unique pathname index means the twin won:
 *     return the winner and NEVER delete the blob.
 *  9. `invalidateVocabulary`.
 *
 * `discard` is the only way this function removes a blob: it first checks that NO asset
 * document in the workspace references `info.pathname`, then calls
 * `deleteBlob(info, mediaPathPrefix(workspaceId))`. (A blob some asset points at is never
 * deleted, whatever race led here.) Where the check finds an existing asset on a rejection,
 * that asset is returned as `created` instead of throwing.
 *
 * Without transactions a rejection can still race a twin that read the blob before it was
 * deleted and has not inserted yet. That needs a rejection (a cap or a duplicate) and the
 * twin's insert inside one analysis, and costs one dangling image that a person can delete.
 */
export async function registerUploadedBlob(
	db: Db,
	ctx: RegisterContext,
	input: {
		url: string
		pathname: string
		filename: string
		folderId: ObjectId | null
	},
): Promise<Registered> {
	const workspaceId = ctx?.workspaceId
	if (!isId(workspaceId)) throw new AssetError('Account not found.', 404)
	const assets = assetsOf(db)

	// 1.
	const info = await proveClaim(workspaceId, input?.url, input?.pathname)
	const reject = (message: string, status: 400 | 413 | 415 | 422 | 429) =>
		refuse(db, workspaceId, info, new AssetError(message, status))
	if (!(info.size <= MEDIA_LIMITS.maxBytes))
		return reject(`That image is too large (max ${MAX_MB} MB).`, 413)
	// Before the type: an empty object carries whatever type it was given (often none), and is no image either way.
	if (info.size < 1) return reject(NOT_AN_IMAGE, 422)
	if (!ALLOWED_TYPES.includes(baseType(info.contentType)))
		return reject('That file type is not supported. Use JPEG, PNG, WebP, AVIF or GIF.', 415)

	// 2.
	const existing = await assets.findOne({ workspaceId, pathname: info.pathname })
	if (existing) return { status: 'created', doc: existing }

	// 3.
	const [usage] = await assets
		.aggregate<{ count: number; bytes: number }>([
			{ $match: workspaceAssets(workspaceId) },
			{ $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$bytes' } } },
		])
		.toArray()
	if ((usage?.count ?? 0) >= MEDIA_LIMITS.maxAssets)
		return reject('Your library is full. Delete some images first.', 429)
	if ((usage?.bytes ?? 0) + info.size > MEDIA_LIMITS.maxTotalBytes)
		return reject(
			'Your library has used all of its storage. Delete some images first.',
			429,
		)

	// 4.
	let bytes: Buffer
	try {
		bytes = await readBlob(info.url)
	} catch (error) {
		if (error instanceof BlobGoneError) throw new AssetError(error.message, 400)
		if (error instanceof BlobTooLargeError)
			return reject(`That image is too large (max ${MAX_MB} MB).`, 413)
		// The blob is proven ours and may be fine: keep it, a retry (or the webhook) can still register it.
		logStoreError('an uploaded image could not be read', error)
		throw new AssetError('That image could not be read. Try again.', 503)
	}
	let analysis: ImageAnalysis
	try {
		analysis = await analyzeImage(bytes)
	} catch (error) {
		if (error instanceof UnsupportedImageError) return reject(error.message, 422)
		throw error
	}

	// 5.
	const twin = await assets.findOne({ workspaceId, pathname: info.pathname })
	if (twin) return { status: 'created', doc: twin }

	// 6. Oldest first, so the answer does not depend on natural order.
	const original = await assets.findOne(
		{ workspaceId, sha256: analysis.sha256, pathname: { $ne: info.pathname } },
		{ sort: { createdAt: 1, _id: 1 } },
	)
	if (original) {
		const held = (await discard(db, workspaceId, [info])).get(info.pathname)
		return held
			? { status: 'created', doc: held }
			: { status: 'duplicate', doc: original }
	}

	// 7.
	const folderId = readFolderId(input.folderId)
	if (folderId === undefined || (folderId && !(await folderExists(db, workspaceId, folderId))))
		return reject(NO_FOLDER, 400)

	// 8.
	const filename = safeFilename(input.filename)
	const rules = await loadTagRules(db, workspaceId)
	const now = new Date()
	const base: MediaAssetDoc = {
		_id: new ObjectId(),
		workspaceId,
		folderId,
		name: nameFromFilename(filename),
		nameKey: '',
		filename,
		url: info.url,
		pathname: info.pathname,
		// What the bytes are, not what a header or a name claims.
		contentType: analysis.contentType,
		bytes: info.size,
		width: analysis.width,
		height: analysis.height,
		pixels: analysis.width * analysis.height,
		orientation: analysis.orientation,
		hasAlpha: analysis.hasAlpha,
		animated: analysis.animated,
		colors: analysis.colors,
		colorNames: [],
		brightness: analysis.brightness,
		saturation: analysis.saturation,
		sha256: analysis.sha256,
		blur: analysis.blur,
		tags: mergeAutoTags(
			[],
			[],
			filenameTags(filename).map((tag) => ({ label: tag.label })),
			'filename',
			rules,
		),
		rejectedTags: [],
		caption: '',
		altText: '',
		captionEdited: false,
		textInImage: '',
		keywords: [],
		kind: null,
		notes: '',
		terms: [],
		termsVersion: 0,
		rev: 0,
		tagging: initialTagging(),
		uploadedBy: typeof ctx.userId === 'string' ? ctx.userId : '',
		createdAt: now,
		updatedAt: now,
	}
	const doc: MediaAssetDoc = { ...base, ...derivedFields(base) }
	try {
		await assets.insertOne(doc)
	} catch (error) {
		if (!isDuplicateKey(error)) throw error
		// The unique pathname index: the twin won. Its asset is the answer and the blob is its.
		const winner = await assets.findOne({ workspaceId, pathname: info.pathname })
		if (winner) return { status: 'created', doc: winner }
		throw new AssetError('That image changed while it was being added. Try again.', 409)
	}

	// 9.
	invalidateVocabulary(workspaceId)
	if (!folderId) return { status: 'created', doc }
	return { status: 'created', doc: await settleFolder(db, workspaceId, doc._id, folderId, doc) }
}

function initialTagging(): MediaTaggingState {
	return isTaggingConfigured()
		? { status: 'pending', attempts: 0 }
		: { status: 'skipped', attempts: 0, reason: 'not_configured' }
}

/* -------------------------------------------------------------------------- */
/* Reading and editing                                                        */
/* -------------------------------------------------------------------------- */

export async function getAsset(
	db: Db,
	workspaceId: ObjectId,
	id: ObjectId,
): Promise<MediaAssetDoc | null> {
	if (!isId(workspaceId) || !isId(id)) return null
	return assetsOf(db).findOne({ _id: id, workspaceId })
}

type Edit = {
	name?: string
	caption?: string
	altText?: string
	notes?: string
	folderId?: ObjectId | null
	addTags: string[]
	removeTags: string[]
}

/** A lone surrogate cannot survive UTF-8: stored, it becomes U+FFFD, so compare what will be stored. */
const wellFormed = (text: string): string => text.toWellFormed?.() ?? text

/** Code points, never through a surrogate pair. */
const cutCodePoints = (text: string, max: number): string => {
	const points = Array.from(text)
	return points.length > max ? points.slice(0, max).join('').trimEnd() : text
}

/**
 * Notes keep their line breaks (a caption is one line, notes are not) but lose control
 * characters, zero-width characters and bidi overrides, like every other text here.
 */
function cleanNotes(text: string): string {
	const lines = wellFormed(text)
		.slice(0, MEDIA_LIMITS.notesMax * 4)
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => clampText(line, MEDIA_LIMITS.notesMax))
	return cutCodePoints(lines.join('\n').trim(), MEDIA_LIMITS.notesMax)
}

function textField(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined
	if (typeof value !== 'string') throw new AssetError(`Invalid ${field}.`, 400)
	return value
}

function listField(value: unknown, field: string, max: number): string[] {
	if (value === undefined) return []
	if (!Array.isArray(value)) throw new AssetError(`Invalid ${field}.`, 400)
	return value.filter((item): item is string => typeof item === 'string').slice(0, max)
}

/**
 * The patch as this module understands it, and nothing else: unknown keys (`rev`,
 * `workspaceId`, `terms`, `tags`...) are not read, so a hostile body cannot reach a
 * field the schema does not offer. Text is cleaned and clamped to the limits, which
 * the schema checks too; this is for callers that did not go through it.
 */
function readEdit(patch: unknown): Edit {
	if (typeof patch !== 'object' || patch === null || Array.isArray(patch))
		throw new AssetError('Nothing to change.', 400)
	const raw = patch as Record<string, unknown>
	const edit: Edit = {
		addTags: listField(raw.addTags, 'tags', MAX_ADD_TAGS),
		removeTags: listField(raw.removeTags, 'tags', MEDIA_LIMITS.maxTagsPerAsset),
	}

	const name = textField(raw.name, 'name')
	if (name !== undefined) {
		edit.name = clampText(wellFormed(name), MEDIA_LIMITS.nameMax)
		if (!edit.name) throw new AssetError('Give the image a name.', 400)
	}
	const caption = textField(raw.caption, 'caption')
	if (caption !== undefined) edit.caption = clampText(wellFormed(caption), MEDIA_LIMITS.captionMax)
	const altText = textField(raw.altText, 'alt text')
	if (altText !== undefined) edit.altText = clampText(wellFormed(altText), MEDIA_LIMITS.altMax)
	const notes = textField(raw.notes, 'notes')
	if (notes !== undefined) edit.notes = cleanNotes(notes)

	if (raw.folderId !== undefined) {
		const folderId = readFolderId(raw.folderId)
		if (folderId === undefined) throw new AssetError(NO_FOLDER, 400)
		edit.folderId = folderId
	}
	return edit
}

const sameFolder = (current: ObjectId | null | undefined, wanted: ObjectId | null): boolean =>
	isId(current) ? wanted !== null && current.equals(wanted) : wanted === null

function sameTags(a: unknown, b: unknown): boolean {
	const left: Partial<MediaTag>[] = Array.isArray(a) ? a : []
	const right: Partial<MediaTag>[] = Array.isArray(b) ? b : []
	return (
		left.length === right.length &&
		left.every((tag, index) => {
			const other = right[index]
			return (
				tag?.slug === other?.slug &&
				tag?.label === other?.label &&
				tag?.source === other?.source &&
				tag?.via === other?.via &&
				tag?.confidence === other?.confidence
			)
		})
	)
}

function sameList(a: unknown, b: unknown): boolean {
	const left: unknown[] = Array.isArray(a) ? a : []
	const right: unknown[] = Array.isArray(b) ? b : []
	return left.length === right.length && left.every((item, index) => item === right[index])
}

/** What this edit changes on the document it is given: null when it already holds. A pure function of `doc`, because commit re-runs it on a fresher one. */
function changeOf(doc: MediaAssetDoc, edit: Edit, rules: TagRules): AssetChange | null {
	const next: AssetChange = {}
	if (edit.name !== undefined && edit.name !== doc.name) next.name = edit.name
	let words = false
	if (edit.caption !== undefined && edit.caption !== doc.caption) {
		next.caption = edit.caption
		words = true
	}
	if (edit.altText !== undefined && edit.altText !== doc.altText) {
		next.altText = edit.altText
		words = true
	}
	// The person's words now: the AI stops overwriting them.
	if (words && doc.captionEdited !== true) next.captionEdited = true
	if (edit.notes !== undefined && edit.notes !== doc.notes) next.notes = edit.notes
	if (edit.folderId !== undefined && !sameFolder(doc.folderId, edit.folderId))
		next.folderId = edit.folderId

	if (edit.addTags.length > 0 || edit.removeTags.length > 0) {
		let tags = doc.tags
		let rejected = doc.rejectedTags
		if (edit.addTags.length > 0)
			({ tags, rejected } = applyManualTags(tags, rejected, edit.addTags, rules))
		if (edit.removeTags.length > 0)
			({ tags, rejected } = removeTagsBySlug(tags, rejected, edit.removeTags))
		if (!sameTags(tags, doc.tags)) next.tags = tags
		if (!sameList(rejected, doc.rejectedTags)) next.rejectedTags = rejected
	}
	return Object.keys(next).length > 0 ? next : null
}

/**
 * Applies a patch through `commitAsset`. `name` also updates `nameKey` (via derivedFields).
 * Changing `caption` or `altText` sets `captionEdited` (so the AI stops overwriting a
 * person's words). `folderId` must exist in the workspace (400) or be null. `addTags` then
 * `removeTags` go through `applyManualTags` / `removeTagsBySlug` with the workspace's tag
 * rules. Returns the stored result. AssetError 404 if the asset is not in this workspace.
 *
 * One patch is one write: it lands on the revision it read, or is re-applied to the newer
 * one, so a concurrent edit to another field or tag is kept.
 */
export async function updateAsset(
	db: Db,
	workspaceId: ObjectId,
	id: ObjectId,
	patch: AssetPatch,
): Promise<MediaAssetDoc> {
	if (!isId(workspaceId) || !isId(id)) throw new AssetError(NOT_FOUND, 404)
	const edit = readEdit(patch)
	if (edit.folderId && !(await folderExists(db, workspaceId, edit.folderId)))
		throw new AssetError(NO_FOLDER, 400)
	// Redirects only matter when tags are being added.
	const rules: TagRules =
		edit.addTags.length > 0 ? await loadTagRules(db, workspaceId) : new Map()

	const updated = await commitAsset(db, workspaceId, id, (doc) => changeOf(doc, edit, rules))
	if (!updated) throw new AssetError(NOT_FOUND, 404)
	return edit.folderId ? settleFolder(db, workspaceId, id, edit.folderId, updated) : updated
}

/* -------------------------------------------------------------------------- */
/* Bulk                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Moves many. The target folder must exist in the workspace (400) or be null. Folder is
 * not derived or user-edited text, so this is a plain `updateMany` (in slices of
 * MEDIA_LIMITS.bulkIdsCap) scoped by `{ workspaceId, _id: { $in } }`. Returns how many changed:
 * an image already in the folder is not one of them.
 */
export async function moveAssets(
	db: Db,
	workspaceId: ObjectId,
	ids: ObjectId[],
	folderId: ObjectId | null,
): Promise<number> {
	if (!isId(workspaceId)) return 0
	const target = readFolderId(folderId)
	if (target === undefined) throw new AssetError(NO_FOLDER, 400)
	const unique = uniqueIds(ids)
	if (unique.length === 0) return 0
	if (target && !(await folderExists(db, workspaceId, target)))
		throw new AssetError(NO_FOLDER, 400)

	const assets = assetsOf(db)
	let moved = 0
	for (let start = 0; start < unique.length; start += MEDIA_LIMITS.bulkIdsCap) {
		const slice = unique.slice(start, start + MEDIA_LIMITS.bulkIdsCap)
		const result = await assets.updateMany(
			// `$ne` keeps an image that is already there out of the count and out of the write.
			{ workspaceId, _id: { $in: slice }, folderId: { $ne: target } },
			{ $set: { folderId: target, updatedAt: new Date() } },
		)
		moved += result.modifiedCount
	}

	// See settleFolder: whatever points at a folder that no longer exists goes to the root.
	if (target && moved > 0 && !(await folderExists(db, workspaceId, target)))
		await assets.updateMany(
			{ workspaceId, folderId: target },
			{ $set: { folderId: null, updatedAt: new Date() } },
		)
	return moved
}

/** Bulk tag add through `commitMany` (per-asset logic is `applyManualTags`). Returns `{ changed, conflicts }` honestly. */
export async function addTagsToAssets(
	db: Db,
	workspaceId: ObjectId,
	ids: ObjectId[],
	labels: string[],
): Promise<Counts> {
	const none = { changed: 0, conflicts: 0 }
	if (!isId(workspaceId) || !Array.isArray(labels)) return none
	const wanted = labels
		.filter((label): label is string => typeof label === 'string')
		.slice(0, MAX_ADD_TAGS)
		.filter((label) => normalizeTag(label) !== null)
	if (wanted.length === 0 || uniqueIds(ids).length === 0) return none

	const rules = await loadTagRules(db, workspaceId)
	return commitMany(db, workspaceId, ids, (doc): AssetChange | null => {
		const { tags, rejected } = applyManualTags(doc.tags, doc.rejectedTags, wanted, rules)
		const change: AssetChange = {}
		if (!sameTags(tags, doc.tags)) change.tags = tags
		if (!sameList(rejected, doc.rejectedTags)) change.rejectedTags = rejected
		return Object.keys(change).length > 0 ? change : null
	})
}

/**
 * Only images that carry one of the tags are touched, so `changed` counts removals and a
 * selection that mostly lacks the tag does not read as "40 of 40" (nor remember a
 * rejection on images where nothing was removed).
 */
export async function removeTagsFromAssets(
	db: Db,
	workspaceId: ObjectId,
	ids: ObjectId[],
	slugs: string[],
): Promise<Counts> {
	const none = { changed: 0, conflicts: 0 }
	if (!isId(workspaceId) || !Array.isArray(slugs)) return none
	const drop = new Set<string>()
	for (const slug of slugs.slice(0, MEDIA_LIMITS.maxTagsPerAsset)) {
		const clean = typeof slug === 'string' ? slugify(slug.slice(0, 512)) : ''
		if (clean) drop.add(clean)
	}
	if (drop.size === 0 || uniqueIds(ids).length === 0) return none

	const wanted = [...drop]
	return commitMany(db, workspaceId, ids, (doc): AssetChange | null => {
		if (!Array.isArray(doc.tags) || !doc.tags.some((tag) => drop.has(tag?.slug))) return null
		const { tags, rejected } = removeTagsBySlug(doc.tags, doc.rejectedTags, wanted)
		return { tags, rejectedTags: rejected }
	})
}

/** Every automatic tag on these assets becomes a manual one (`promoteAutoTags`), through `commitMany`. */
export async function acceptAutoTags(
	db: Db,
	workspaceId: ObjectId,
	ids: ObjectId[],
): Promise<Counts> {
	if (!isId(workspaceId)) return { changed: 0, conflicts: 0 }
	return commitMany(db, workspaceId, ids, (doc): AssetChange | null => {
		if (!Array.isArray(doc.tags) || !doc.tags.some((tag) => tag?.source === 'auto')) return null
		return { tags: promoteAutoTags(doc.tags) }
	})
}

/* -------------------------------------------------------------------------- */
/* Deleting                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Deletes assets (hard delete). Works in slices of MEDIA_LIMITS.bulkIdsCap: for each slice
 * delete the documents FIRST (`deleteMany({ workspaceId, _id: { $in } })`, counting what was
 * actually removed), then delete each removed asset's blob with
 * `deleteBlob({ url, pathname }, mediaPathPrefix(workspaceId))`, best effort, before starting
 * the next slice, so a killed request orphans at most one slice of blobs and never leaves a
 * document pointing at a deleted file. Calls `invalidateVocabulary`. Returns how many were removed.
 *
 * The blobs are named by the stored documents, read before they are removed, never by the
 * caller; and a blob some asset still points at (a late twin registered it again) is kept.
 * Ids of other workspaces, unknown ids and repeats remove nothing and are not counted.
 */
export async function deleteAssets(
	db: Db,
	workspaceId: ObjectId,
	ids: ObjectId[],
): Promise<number> {
	if (!isId(workspaceId)) return 0
	const unique = uniqueIds(ids)
	const assets = assetsOf(db)
	let removed = 0

	for (let start = 0; start < unique.length; start += MEDIA_LIMITS.bulkIdsCap) {
		const slice = unique.slice(start, start + MEDIA_LIMITS.bulkIdsCap)
		const found = await assets
			.find({ workspaceId, _id: { $in: slice } }, { projection: { _id: 1, url: 1, pathname: 1 } })
			.toArray()
		if (found.length === 0) continue

		// Documents first: a document is never left pointing at a deleted file, and a blob
		// that cannot be removed afterwards is an orphan, not a broken image.
		const result = await assets.deleteMany({
			workspaceId,
			_id: { $in: found.map((doc) => doc._id) },
		})
		if (result.deletedCount > 0) {
			removed += result.deletedCount
			invalidateVocabulary(workspaceId)
		}

		const refs: BlobRef[] = []
		for (const doc of found)
			if (typeof doc.url === 'string' && typeof doc.pathname === 'string')
				refs.push({ url: doc.url, pathname: doc.pathname })
		await discard(db, workspaceId, refs)
	}
	return removed
}
