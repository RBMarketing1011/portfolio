import 'server-only'
import type { Db, Filter, ObjectId } from 'mongodb'
import { assetsOf } from '@/lib/media/collections'
import { assertBlobUrl } from '@/lib/media/storage'
import type { MediaAssetDoc } from '@/lib/media/types'
import type { MediaEntry, SiteDoc } from '../site-doc'
import { AI_LIMITS } from './contract'
import type { NormalizedRequest, PhotoCandidate } from './types'

/**
 * The photos a build may place (section 6.9): the ones the person picked in the dialog
 * (uploads and project photos left selected) first, newest first, then, only when they
 * turned the library on, the account library's own photos, illustrations and graphics,
 * newest first. At most 60, with refs `img1…` in that order.
 *
 * The library is opt-in and never offers screenshots, logos, icons, patterns, diagrams
 * or "other": one workspace library can hold several businesses' images (an agency
 * builds all its clients' sites in one account), and a built site must never show
 * another company's pictures. A deselected project photo is never used.
 *
 * Only a URL that passes `assertBlobUrl`, or a `data:image/(png|jpeg|webp|gif);base64,`
 * URL of at most 3.75 MB decoded, is ever offered; anything else is skipped and never
 * fetched. `vision` marks the candidates the planner may be shown as image blocks: up to
 * 12 picked photos the API can read (JPEG, PNG, WebP or GIF, at most 5 MB, at most 8000
 * px a side when known). Library assets stay in the text digest.
 */

const LIBRARY_KINDS = ['photo', 'illustration', 'graphic'] as const
const VISION_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const VISION_MAX_BYTES = 5_000_000
const VISION_MAX_SIDE = 8000
const SIDE_MAX = 20_000
const CAPTION_MAX = 120
const TAGS_MAX = 8
const COLORS_MAX = 3

const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]*={0,2})$/
// Base64 grows 4/3, plus the header: anything longer cannot be within the decoded cap.
const DATA_URL_CHARS_MAX = Math.ceil(AI_LIMITS.dataUrlMaxBytes / 3) * 4 + 64

/** What a URL is, if the model may be given it: a Blob URL, or an inline image within the cap. */
function readable(url: unknown): { kind: 'blob' } | { kind: 'data'; contentType: string; bytes: number } | null {
	if (typeof url !== 'string' || url.length === 0) return null
	if (url.startsWith('data:')) {
		if (url.length > DATA_URL_CHARS_MAX) return null
		const match = DATA_URL.exec(url)
		const body = match?.[2] ?? ''
		if (!match || body.length === 0 || body.length % 4 !== 0) return null
		const bytes = (body.length / 4) * 3 - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0)
		if (bytes <= 0 || bytes > AI_LIMITS.dataUrlMaxBytes) return null
		return { kind: 'data', contentType: `image/${match[1]}`, bytes }
	}
	try {
		assertBlobUrl(url)
		return { kind: 'blob' }
	} catch {
		return null
	}
}

/** A stored dimension, if it is one: a whole number of pixels in range. */
const side = (value: unknown): number | null =>
	typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= SIDE_MAX ? value : null

function orientationOf(width: number | null, height: number | null, stored?: string | null): PhotoCandidate['orientation'] {
	if (width && height) {
		const ratio = width / height
		if (ratio >= 2) return 'panorama'
		if (ratio >= 1.2) return 'landscape'
		if (ratio <= 0.83) return 'portrait'
		return 'square'
	}
	return stored === 'landscape' || stored === 'portrait' || stored === 'square' || stored === 'panorama' ? stored : 'unknown'
}

function visionReady(contentType: string, bytes: number, width: number | null, height: number | null): boolean {
	return (
		VISION_TYPES.has(contentType.trim().toLowerCase()) &&
		bytes > 0 &&
		bytes <= VISION_MAX_BYTES &&
		(width === null || width <= VISION_MAX_SIDE) &&
		(height === null || height <= VISION_MAX_SIDE)
	)
}

/** Cut at a word boundary, so a caption never ends mid-word. */
function clip(text: unknown, max: number): string {
	const value = typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : ''
	if (value.length <= max) return value
	const cut = value.slice(0, max + 1)
	const space = cut.lastIndexOf(' ')
	return (space > max * 0.6 ? cut.slice(0, space) : value.slice(0, max)).trim()
}

const kindOf = (kind: MediaAssetDoc['kind'] | undefined): PhotoCandidate['kind'] =>
	kind === 'photo' || kind === 'illustration' || kind === 'graphic' || kind === 'screenshot'
		? kind
		: kind === 'logo' || kind === 'icon' || kind === 'pattern' || kind === 'diagram'
			? 'graphic'
			: 'unknown'

/** The library's usable images for this workspace: analysed, and a photo, illustration or graphic, or not yet classified. */
export function libraryFilter(workspaceId: ObjectId): Filter<MediaAssetDoc> {
	return {
		workspaceId,
		width: { $gt: 0 },
		height: { $gt: 0 },
		$or: [{ kind: { $in: [...LIBRARY_KINDS] } }, { kind: null }],
	}
}

/** How many library images a build could offer (the dialog shows it on the library switch). */
export async function countLibraryPhotos(db: Db, workspaceId: ObjectId): Promise<number> {
	return assetsOf(db).countDocuments(libraryFilter(workspaceId))
}

/** The picked project photos, newest first (the order the planner is shown them in). */
function pickedEntries(site: SiteDoc, request: NormalizedRequest): MediaEntry[] {
	const byId = new Map((site.media ?? []).map((entry) => [entry.id, entry]))
	const seen = new Set<string>()
	const picked: { entry: MediaEntry; order: number }[] = []
	for (const id of Array.isArray(request.photoIds) ? request.photoIds : []) {
		if (typeof id !== 'string' || seen.has(id)) continue
		seen.add(id)
		const entry = byId.get(id)
		if (entry) picked.push({ entry, order: picked.length })
	}
	const time = (entry: MediaEntry) => {
		const at = Date.parse(entry.addedAt)
		return Number.isNaN(at) ? 0 : at
	}
	return picked
		.sort((a, b) => time(b.entry) - time(a.entry) || a.order - b.order)
		.slice(0, AI_LIMITS.photosMax)
		.map((item) => item.entry)
}

export async function loadPhotoPool(db: Db, site: SiteDoc, request: NormalizedRequest): Promise<PhotoCandidate[]> {
	const pool: PhotoCandidate[] = []
	const urls = new Set<string>()
	let visions = 0
	const ref = () => `img${pool.length + 1}`

	for (const entry of pickedEntries(site, request)) {
		const url = readable(entry.url)
		if (!url || urls.has(entry.url)) continue
		// Width and height are new, optional fields on a media entry (older entries lack them).
		const stored = entry as MediaEntry & { width?: unknown; height?: unknown }
		const width = side(stored.width)
		const height = side(stored.height)
		const contentType = url.kind === 'data' ? url.contentType : String(entry.contentType ?? '')
		const bytes = url.kind === 'data' ? url.bytes : typeof entry.bytes === 'number' ? entry.bytes : 0
		const vision = visions < AI_LIMITS.visionPhotosMax && visionReady(contentType, bytes, width, height)
		if (vision) visions++
		urls.add(entry.url)
		pool.push({
			ref: ref(),
			source: 'upload',
			value: `media:${entry.id}`,
			url: entry.url,
			kind: 'unknown',
			width,
			height,
			orientation: orientationOf(width, height),
			light: 'unknown',
			caption: '',
			tags: [],
			colors: [],
			vision,
		})
	}

	if (!request.useLibrary || pool.length >= AI_LIMITS.digestMax) return pool

	const assets = await assetsOf(db)
		.find(libraryFilter(site.workspaceId), {
			projection: {
				url: 1,
				kind: 1,
				width: 1,
				height: 1,
				orientation: 1,
				brightness: 1,
				caption: 1,
				altText: 1,
				tags: 1,
				colorNames: 1,
			},
		})
		.sort({ createdAt: -1, _id: -1 })
		.limit(AI_LIMITS.digestMax + pool.length)
		.toArray()

	for (const asset of assets) {
		if (pool.length >= AI_LIMITS.digestMax) break
		// The library is Blob storage only; an inline or foreign URL is never offered.
		if (readable(asset.url)?.kind !== 'blob' || urls.has(asset.url)) continue
		urls.add(asset.url)
		const width = side(asset.width)
		const height = side(asset.height)
		// Filename-derived tags are photographer names and id fragments, not content.
		const labels = (asset.tags ?? [])
			.filter((tag) => tag && tag.via !== 'filename')
			.map((tag) => clip(tag.label, 40))
			.filter(Boolean)
		pool.push({
			ref: ref(),
			source: 'library',
			value: asset.url,
			url: asset.url,
			kind: kindOf(asset.kind),
			width,
			height,
			orientation: orientationOf(width, height, asset.orientation),
			light: asset.brightness === 'dark' || asset.brightness === 'mid' || asset.brightness === 'light' ? asset.brightness : 'unknown',
			caption: clip(asset.caption || asset.altText, CAPTION_MAX),
			tags: [...new Set(labels)].slice(0, TAGS_MAX),
			colors: (asset.colorNames ?? []).filter((name) => typeof name === 'string' && name).slice(0, COLORS_MAX),
			vision: false,
		})
	}
	return pool
}
