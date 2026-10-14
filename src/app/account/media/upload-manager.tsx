'use client'

import {
	memo,
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from 'react'
import type { UploadOptions } from '@vercel/blob/client'
import {
	ChevronDown,
	ChevronUp,
	CircleAlert,
	CircleCheck,
	Clock,
	CloudUpload,
	CopyCheck,
	LoaderCircle,
	RotateCw,
	X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
	DRAG_MIME,
	type UploadManagerHandle,
	type UploadManagerProps,
} from '@/app/account/media/contracts'
import { formatBytes, formatCount, pluralize } from '@/app/account/media/format'
import {
	MEDIA_CONTENT_TYPES,
	MEDIA_FORMAT_BY_TYPE,
	MEDIA_LIMITS,
	type MediaAssetDTO,
	type MediaContentType,
	type MediaRegisterResponse,
} from '@/lib/media/types'

export const UPLOAD_URL = '/api/account/media/upload'
export const REGISTER_URL = '/api/account/media'
export const WORKSPACE_HEADER = 'x-media-workspace'
export const MAX_CONCURRENT = 3
/** Past this a single PUT is brittle on a poor connection; the SDK splits it into retried parts. */
export const MULTIPART_ABOVE = 5 * 1024 * 1024
/** The blob's file name, extension included. The workspace prefix and Blob's random suffix come on top. */
export const MAX_BLOB_NAME = 100
/** Matches `registerBodySchema.filename`. */
export const MAX_FILENAME = 255
/** Types plus extensions: a system with no MIME mapping for avif or webp reports an empty type. */
export const ACCEPT = [
	...MEDIA_CONTENT_TYPES,
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.avif',
	'.gif',
].join(',')

// A drag that has not moved for this long has ended without telling us (Esc, a dropped
// window, a missed dragleave), so the overlay must not outlive it.
const DROP_STALE_MS = 2500
const DROP_CHECK_MS = 500
// Each row is a few nodes, but a drop of thousands of files must not build thousands of them.
const MAX_ROWS_SHOWN = 200

const NOT_AN_IMAGE = 'Not a supported image'
const IMAGE_HINT = 'Use JPG, PNG, WebP, AVIF or GIF.'
const UPLOAD_FAILED = 'Upload failed. Try again.'
const REGISTER_UNREADABLE = 'The server sent a reply this page could not read. Try again.'

// Names

// Built with RegExp() so the Unicode property escapes do not depend on the TS target.
// Controls, line and paragraph separators, and the bidi overrides that make a name read
// differently from what it is.
const UNSAFE_CHARS = new RegExp('[\\p{Cc}\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]', 'gu')
const COMBINING_MARKS = new RegExp('\\p{M}+', 'gu')

const TYPE_BY_EXTENSION = new Map<string, MediaContentType>([
	['jpg', 'image/jpeg'],
	['jpeg', 'image/jpeg'],
	['jpe', 'image/jpeg'],
	['jfif', 'image/jpeg'],
	['png', 'image/png'],
	['webp', 'image/webp'],
	['avif', 'image/avif'],
	['gif', 'image/gif'],
])

const isContentType = (value: string): value is MediaContentType =>
	(MEDIA_CONTENT_TYPES as readonly string[]).includes(value)

/** Cuts to a UTF-16 length without splitting a surrogate pair. */
function cutTo(text: string, length: number) {
	if (text.length <= length) return text
	let end = Math.max(0, length)
	const code = text.charCodeAt(end - 1)
	if (code >= 0xd800 && code <= 0xdbff) end--
	return text.slice(0, end)
}

/** The part after the last dot when it looks like an extension; the dot itself is dropped. */
function splitName(name: string) {
	const dot = name.lastIndexOf('.')
	if (dot === -1) return { stem: name, ext: '' }
	const ext = name.slice(dot + 1)
	return /^[a-z0-9]{1,8}$/i.test(ext)
		? { stem: name.slice(0, dot), ext }
		: { stem: name, ext: '' }
}

/** A person-readable file name, safe to show: no controls or bidi tricks, at most `max` long. */
function shorten(text: string, max: number) {
	if (text.length <= max) return text
	const { stem, ext } = splitName(text)
	const tail = ext ? `.${ext}` : ''
	return `${cutTo(stem, max - tail.length - 1)}…${tail}`
}

/** Text that came from outside, fit to show: no controls or bidi tricks, one line. */
function cleanText(value: unknown) {
	return typeof value === 'string'
		? value.replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim()
		: ''
}

export function displayName(name: unknown) {
	const text = cleanText(name)
	return text ? shorten(text, 120) : 'Untitled'
}

/**
 * The name the server is told the file had. Display text for the library, so it keeps
 * Unicode and spaces, but never path separators, controls or bidi tricks, and never more
 * than the schema allows.
 */
export function cleanFilename(name: unknown, fallback: string) {
	const text =
		typeof name === 'string'
			? name
					.replace(UNSAFE_CHARS, '')
					.replace(/[/\\]/g, '')
					.replace(/\s+/g, ' ')
					.trim()
			: ''
	if (/^\.*$/.test(text)) return fallback
	if (text.length <= MAX_FILENAME) return text
	const dot = text.lastIndexOf('.')
	const ext = dot > 0 && text.length - dot <= 17 ? text.slice(dot) : ''
	const stem = ext ? text.slice(0, dot) : text
	const cut = cutTo(stem, MAX_FILENAME - ext.length).replace(/[\s.]+$/, '') + ext
	return cutTo(cut, MAX_FILENAME) || fallback
}

/**
 * Letters, digits, dot and dash, lowercase: the rest collapses to a dash, accents are
 * folded (`café` reads `cafe`, not `caf-`), and nothing begins or ends with a separator
 * or repeats one, so the result can never be `.` or `..` or hide a `//`.
 */
function tidy(text: string, max: number) {
	const cleaned = text
		.replace(/[^a-z0-9.-]+/g, '-')
		.replace(/[-.]{2,}/g, '-')
		.replace(/^[-.]+/, '')
	return cleaned.slice(0, max).replace(/[-.]+$/, '')
}

/**
 * The file part of the blob pathname. The extension is kept when it is an image one;
 * otherwise (none, or something like `.php` on a file the browser says is a PNG) the type
 * decides, so the stored name always ends in what the bytes are claimed to be.
 */
export function safeBlobName(name: unknown, contentType?: MediaContentType | null) {
	const folded = (typeof name === 'string' ? name : '')
		.normalize('NFKD')
		.replace(COMBINING_MARKS, '')
		.toLowerCase()
		.trim()
	const split = splitName(folded)
	let stem = split.stem
	let ext = split.ext
	if (contentType && !TYPE_BY_EXTENSION.has(ext)) {
		// `x.php` -> `x-php.png`: keep the information, lose the dot.
		if (ext) stem = `${stem}-${ext}`
		ext = MEDIA_FORMAT_BY_TYPE[contentType]
	}
	const base = tidy(stem, MAX_BLOB_NAME - (ext ? ext.length + 1 : 0)) || 'image'
	return ext ? `${base}.${ext}` : base
}

export function buildPathname(
	prefix: string,
	name: unknown,
	contentType?: MediaContentType | null,
) {
	// Exactly one slash after the prefix: the SDK refuses a pathname containing `//`.
	const root = typeof prefix === 'string' ? prefix.replace(/\/+$/, '') : ''
	return `${root ? `${root}/` : ''}${safeBlobName(name, contentType)}`
}

// Validation

/**
 * The browser's type when it is one we take. When it has none (some systems have no
 * mapping for formats they cannot open) the extension is the only clue left. A type the
 * browser did report and we do not take is never overridden by the name.
 */
export function resolveContentType(file: {
	name?: unknown
	type?: unknown
}): MediaContentType | null {
	const type = typeof file.type === 'string' ? file.type.trim().toLowerCase() : ''
	if (type) return isContentType(type) ? type : null
	const name = typeof file.name === 'string' ? file.name.trim().toLowerCase() : ''
	return TYPE_BY_EXTENSION.get(splitName(name).ext) ?? null
}

/** The page's limit, never above what the server will accept and never a nonsense value. */
export function effectiveMaxBytes(maxBytes: unknown) {
	return typeof maxBytes === 'number' && Number.isFinite(maxBytes) && maxBytes > 0
		? Math.min(maxBytes, MEDIA_LIMITS.maxBytes)
		: MEDIA_LIMITS.maxBytes
}

/** `25 MB`, not `25.0 MB`. */
export const formatLimit = (bytes: number) => formatBytes(bytes).replace(/\.0 /, ' ')

export type FileCheck =
	| { ok: true; contentType: MediaContentType }
	| { ok: false; message: string; hint?: string }

/**
 * Type first, so a dropped folder (empty type, size 0 or 4096) reads "Not a supported
 * image" and not "File is empty" or "Too large".
 */
export function validateFile(
	file: { name?: unknown; type?: unknown; size?: unknown },
	maxBytes: number,
): FileCheck {
	const contentType = resolveContentType(file)
	if (!contentType) return { ok: false, message: NOT_AN_IMAGE, hint: IMAGE_HINT }
	const size = typeof file.size === 'number' ? file.size : Number.NaN
	if (!Number.isFinite(size) || size <= 0) return { ok: false, message: 'File is empty' }
	const limit = effectiveMaxBytes(maxBytes)
	if (size > limit)
		return { ok: false, message: `Too large (max ${formatLimit(limit)})` }
	return { ok: true, contentType }
}

// Failures

export type Failure = { message: string; hint?: string; retryable: boolean }

/**
 * What a person is told when the Blob SDK throws. Never the SDK's own text: it carries
 * request details, and `upload()` swallows our token route's message anyway (it throws
 * "Failed to retrieve the client token" for any non-2xx), so the likely causes are named.
 */
export function describeUploadError(error: unknown, maxBytes: number): Failure {
	const text =
		error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '')
	if (/abort/i.test(text)) return { message: 'Upload cancelled', retryable: true }
	if (/expired/i.test(text))
		return { message: 'The upload took too long. Try again.', retryable: true }
	if (/retrieve the (client token|presigned)/i.test(text))
		return {
			message:
				'The server refused this upload. Reload the page, or check that your library is not full.',
			retryable: true,
		}
	if (/too large|exceeds the maximum/i.test(text))
		return {
			message: `Too large (max ${formatLimit(effectiveMaxBytes(maxBytes))})`,
			retryable: false,
		}
	if (/content type/i.test(text))
		return { message: NOT_AN_IMAGE, hint: IMAGE_HINT, retryable: false }
	if (/too many requests|rate.?limit/i.test(text))
		return { message: 'The storage service is busy. Try again in a moment.', retryable: true }
	// A failed fetch is a TypeError in every engine, with a different message in each
	// (Chrome "Failed to fetch", Firefox "NetworkError...", Safari "Load failed", Node
	// "fetch failed"); a TypeError that says none of this is a bug and gets the generic one.
	if (/failed to fetch|fetch failed|network|connection|load failed|timed out/i.test(text))
		return { message: 'Network error. Check your connection and try again.', retryable: true }
	if (/not available|unavailable|unknown error|suspended|store does not exist|access denied/i.test(text))
		return { message: 'Storage is not available right now. Try again later.', retryable: true }
	return { message: UPLOAD_FAILED, retryable: true }
}

/** The file itself was refused; the server deleted the blob and no retry can change that. */
const FILE_REFUSED = new Set([413, 415, 422])
/** Statuses after which the server has deleted the blob (so a retry must upload again). */
const BLOB_DISCARDED = new Set([413, 415, 422, 429])

const REGISTER_MESSAGES: Record<number, string> = {
	400: 'The server could not accept this image. Try again.',
	401: 'Your session has expired. Sign in again, then retry.',
	403: 'You do not have permission to upload here.',
	404: 'That account or folder could not be found. Reload the page.',
	429: 'Too many requests, or your library is full. Try again later.',
}

export type RegisterFailure = Failure & {
	/** The server deleted the blob, so Retry must upload again rather than re-register. */
	blobGone: boolean
}

/**
 * A non-2xx answer from `POST /api/account/media`. The server's own message is written
 * for people ("A folder named Acme already exists here.") and wins; a proxy's HTML error
 * page has none, so the status decides.
 */
export function describeRegisterFailure(
	status: number,
	body: unknown,
	maxBytes: number,
): RegisterFailure {
	const given =
		body && typeof body === 'object' ? cleanText((body as { error?: unknown }).error) : ''
	let message = given ? cutTo(given, 300) : ''
	if (!message) {
		if (status === 413) message = `Too large (max ${formatLimit(effectiveMaxBytes(maxBytes))})`
		else if (status === 415 || status === 422) message = NOT_AN_IMAGE
		else if (REGISTER_MESSAGES[status]) message = REGISTER_MESSAGES[status]
		else if (status >= 500) message = 'The server had a problem adding this image. Try again.'
		else if (status < 400) message = REGISTER_UNREADABLE
		else message = `Could not add this image (error ${status}). Try again.`
	}
	const refused = FILE_REFUSED.has(status)
	return {
		message,
		hint: status === 415 || status === 422 ? IMAGE_HINT : undefined,
		retryable: !refused,
		blobGone: BLOB_DISCARDED.has(status),
	}
}

/** What a person calls an image already in the library. */
export const assetLabel = (asset: Pick<MediaAssetDTO, 'name'>) =>
	cleanText(asset.name) || 'this image'

/** "Already in your library as Clients/Acme/Logo", or "as Logo in Unfiled" at the root. */
export function duplicateLocation(asset: Pick<MediaAssetDTO, 'name' | 'folderPath'>) {
	const name = assetLabel(asset)
	const path = cleanText(asset.folderPath).replace(/^\/+|\/+$/g, '')
	return path ? `${path}/${name}` : `${name} in All media`
}

function readRegistered(status: number, body: unknown): MediaRegisterResponse | null {
	if (!body || typeof body !== 'object') return null
	const { asset, status: label } = body as { asset?: unknown; status?: unknown }
	if (!asset || typeof asset !== 'object') return null
	const id = (asset as { id?: unknown }).id
	if (typeof id !== 'string' || !id) return null
	// The body says which it is; the HTTP code (201 created, 200 duplicate) only fills a gap.
	const kind =
		label === 'created' || label === 'duplicate'
			? label
			: label === undefined
				? status === 201
					? 'created'
					: 'duplicate'
				: null
	return kind ? { status: kind, asset: asset as MediaAssetDTO } : null
}

// The queue

export type UploadItemState =
	| 'queued'
	| 'uploading'
	| 'processing'
	| 'done'
	| 'duplicate'
	| 'failed'

export type UploadStage = 'validate' | 'upload' | 'register'

export type UploadItem = {
	readonly id: string
	/** Work that starts while the queue is idle shares a batch; its footer counts its own. */
	readonly batch: number
	readonly name: string
	readonly state: UploadItemState
	/** 0-100. Held below 100 until Blob has the whole file. */
	readonly progress: number
	/** What the queue said when this file was added ("Upload to Clients/Acme"). */
	readonly destination: string
	readonly message?: string
	readonly hint?: string
	readonly stage?: UploadStage
	readonly retryable?: boolean
	readonly asset?: MediaAssetDTO
}

export type QueueState = {
	readonly items: readonly UploadItem[]
	readonly batch: number
	/** The batch whose "N added. Select them" has been used. */
	readonly consumed: number
}

/** Captured when a file is added, so a later folder or account change cannot redirect it. */
export type UploadContext = {
	workspaceId: string
	folderId: string | null
	pathPrefix: string
	maxBytes: number
	destination: string
}

export type UploadFn = (
	pathname: string,
	body: File,
	options: UploadOptions,
) => Promise<{ url: string; pathname: string }>

export type UploadQueueDeps = {
	upload: UploadFn
	fetch: typeof fetch
	/** One call per file the server has registered, created or duplicate. */
	onRegistered(result: MediaRegisterResponse): void
	concurrency?: number
}

export type UploadQueue = {
	getState(): QueueState
	subscribe(listener: () => void): () => void
	/** Returns how many rows were added. */
	add(files: ArrayLike<File> | Iterable<File> | null | undefined, context: UploadContext): number
	retry(id: string): boolean
	retryAll(): number
	/** Cancels the work if it is running. */
	remove(id: string): boolean
	clearFinished(): number
	/** The assets this batch created, and marks its footer as used. */
	consumeBatch(): MediaAssetDTO[]
	/** While paused nothing new starts; work already running carries on. */
	setPaused(paused: boolean): void
	/** Resolves when nothing is running and nothing can start. */
	whenIdle(): Promise<void>
}

export const isActive = (item: UploadItem) =>
	item.state === 'queued' || item.state === 'uploading' || item.state === 'processing'

export const isBusy = (state: QueueState) => state.items.some(isActive)

export function selectCreated(state: QueueState): MediaAssetDTO[] {
	const out: MediaAssetDTO[] = []
	for (const item of state.items)
		if (item.batch === state.batch && item.state === 'done' && item.asset)
			out.push(item.asset)
	return out
}

/** How many the footer announces: none while working, none once it has been used. */
export function footerCount(state: QueueState) {
	return isBusy(state) || state.consumed === state.batch ? 0 : selectCreated(state).length
}

/** One label when everything shares a destination, else the first and how many more. */
export function describeDestinations(items: readonly UploadItem[]) {
	const labels: string[] = []
	for (const item of items)
		if (item.destination && !labels.includes(item.destination)) labels.push(item.destination)
	if (labels.length === 0) return ''
	if (labels.length === 1) return labels[0]
	return `${labels[0]} and ${labels.length - 1} more`
}

export type QueueSummary = {
	total: number
	settled: number
	active: number
	added: number
	duplicates: number
	failed: number
	/** 0-100 across the rows counted. */
	percent: number
	text: string
	destination: string
}

/** The latest batch, or everything when its rows have all gone. */
export function summarizeQueue(state: QueueState): QueueSummary {
	const mine = state.items.filter((item) => item.batch === state.batch)
	const scope = mine.length ? mine : state.items
	let added = 0
	let duplicates = 0
	let failed = 0
	let active = 0
	let points = 0
	for (const item of scope) {
		if (item.state === 'done') added++
		else if (item.state === 'duplicate') duplicates++
		else if (item.state === 'failed') failed++
		else active++
		points += item.state === 'queued' ? 0 : item.state === 'uploading' ? item.progress : 100
	}
	const total = scope.length
	const settled = total - active
	let text = ''
	if (total > 0 && active > 0) {
		text = `Uploading ${formatCount(settled)} of ${formatCount(total)}`
		if (failed) text += `, ${formatCount(failed)} failed`
	} else if (total > 0) {
		const parts: string[] = []
		if (added) parts.push(`${formatCount(added)} added`)
		if (duplicates) parts.push(`${formatCount(duplicates)} already in your library`)
		if (failed) parts.push(`${formatCount(failed)} failed`)
		text = parts.join(', ')
	}
	return {
		total,
		settled,
		active,
		added,
		duplicates,
		failed,
		percent: total ? Math.round(points / total) : 0,
		text,
		destination: describeDestinations(scope),
	}
}

/** The visible words for a row's state. A failed row's words are its message. */
export function describeItem(item: UploadItem) {
	switch (item.state) {
		case 'queued':
			return 'Queued'
		case 'uploading':
			return `Uploading ${item.progress}%`
		case 'processing':
			return 'Processing'
		case 'done':
			return 'Done'
		case 'duplicate':
			return item.asset
				? `Already in your library as ${duplicateLocation(item.asset)}`
				: 'Already in your library'
		case 'failed':
			return item.message || UPLOAD_FAILED
	}
}

type Job = {
	file: File
	contentType: MediaContentType
	context: UploadContext
	/** Kept after a successful upload, so a failed registration retries without uploading again. */
	blob?: { url: string; pathname: string }
	controller?: AbortController
}

function readBlob(result: unknown) {
	if (!result || typeof result !== 'object') return null
	const { url, pathname } = result as { url?: unknown; pathname?: unknown }
	return typeof url === 'string' && url && typeof pathname === 'string' && pathname
		? { url, pathname }
		: null
}

/**
 * The upload engine, free of React so it can be driven (and proved) directly.
 *
 * A job covers both steps (upload, then register) and holds its slot for both, so at
 * most `concurrency` uploads and at most as many registrations are ever in flight.
 */
export function createUploadQueue(deps: UploadQueueDeps): UploadQueue {
	const limit = Math.max(1, Math.floor(deps.concurrency ?? MAX_CONCURRENT))
	const jobs = new Map<string, Job>()
	const listeners = new Set<() => void>()
	const idleWaiters: (() => void)[] = []
	let state: QueueState = { items: [], batch: 0, consumed: 0 }
	let running = 0
	let paused = false
	let counter = 0

	const update = (next: Partial<QueueState>) => {
		state = { ...state, ...next }
		for (const listener of [...listeners]) listener()
	}

	const patch = (id: string, change: Partial<UploadItem>) => {
		const index = state.items.findIndex((item) => item.id === id)
		if (index === -1) return
		const items = state.items.slice()
		items[index] = { ...items[index], ...change }
		update({ items })
	}

	const isIdle = () =>
		running === 0 && (paused || !state.items.some((item) => item.state === 'queued'))

	const settleWaiters = () => {
		if (!isIdle()) return
		for (const resolve of idleWaiters.splice(0)) resolve()
	}

	/** A batch is a run of activity: work added to an idle queue starts a new one. */
	const batchForNewWork = () => (isBusy(state) ? state.batch : state.batch + 1)

	const fail = (id: string, stage: UploadStage, failure: Failure) => {
		patch(id, {
			state: 'failed',
			progress: 0,
			stage,
			message: failure.message,
			hint: failure.hint,
			retryable: failure.retryable,
		})
		// Nothing left to retry: let go of the file.
		if (!failure.retryable) jobs.delete(id)
	}

	const progress = (id: string, event: { percentage?: unknown } | null | undefined) => {
		const raw = event?.percentage
		if (typeof raw !== 'number' || !Number.isFinite(raw)) return
		const next = Math.max(0, Math.min(99, Math.floor(raw)))
		const item = state.items.find((row) => row.id === id)
		if (item && item.state === 'uploading' && next > item.progress)
			patch(id, { progress: next })
	}

	const finish = (id: string, registered: MediaRegisterResponse) => {
		patch(id, {
			state: registered.status === 'created' ? 'done' : 'duplicate',
			progress: 100,
			asset: registered.asset,
			message: undefined,
			hint: undefined,
			stage: undefined,
			retryable: undefined,
		})
		jobs.delete(id)
		try {
			deps.onRegistered(registered)
		} catch (error) {
			// The server has the image; a page callback that throws must not undo that.
			console.error('[media] onRegistered failed', error)
		}
	}

	const processJob = async (id: string, job: Job, controller: AbortController) => {
		const { file, contentType, context } = job
		if (!job.blob) {
			patch(id, { state: 'uploading', progress: 0 })
			let result: unknown
			try {
				result = await deps.upload(
					buildPathname(context.pathPrefix, file.name, contentType),
					file,
					{
						access: 'public',
						handleUploadUrl: UPLOAD_URL,
						// The Blob client cannot add our header, so the account rides here.
						clientPayload: JSON.stringify({
							workspaceId: context.workspaceId,
							folderId: context.folderId,
						}),
						multipart: file.size > MULTIPART_ABOVE,
						// Explicit: inferred from the pathname, a name without an extension would
						// be `application/octet-stream` and the token would refuse it.
						contentType,
						abortSignal: controller.signal,
						onUploadProgress: (event) => progress(id, event),
					},
				)
			} catch (error) {
				if (jobs.has(id)) fail(id, 'upload', describeUploadError(error, context.maxBytes))
				return
			}
			if (!jobs.has(id)) return
			const blob = readBlob(result)
			if (!blob) return fail(id, 'upload', { message: UPLOAD_FAILED, retryable: true })
			job.blob = blob
		}

		patch(id, { state: 'processing', progress: 100 })
		let response: Response
		try {
			response = await deps.fetch(REGISTER_URL, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					[WORKSPACE_HEADER]: context.workspaceId,
				},
				body: JSON.stringify({
					// What Blob stored (it added a random suffix), not what we asked for.
					url: job.blob.url,
					pathname: job.blob.pathname,
					filename: cleanFilename(file.name, safeBlobName(file.name, contentType)),
					folderId: context.folderId,
				}),
				signal: controller.signal,
			})
		} catch {
			if (jobs.has(id))
				fail(id, 'register', {
					message: 'Network error while adding the image. Try again.',
					retryable: true,
				})
			return
		}
		if (!jobs.has(id)) return

		let body: unknown = null
		try {
			body = await response.json()
		} catch {
			// Not JSON: a proxy's error page. The status says what happened.
		}
		if (!jobs.has(id)) return

		if (response.status === 201 || response.status === 200) {
			const registered = readRegistered(response.status, body)
			if (!registered)
				return fail(id, 'register', { message: REGISTER_UNREADABLE, retryable: true })
			finish(id, registered)
			return
		}
		const failure = describeRegisterFailure(response.status, body, context.maxBytes)
		if (failure.blobGone) job.blob = undefined
		fail(id, 'register', failure)
	}

	const run = async (id: string) => {
		const job = jobs.get(id)
		if (!job) {
			// A queued row with nothing behind it would be picked again forever.
			fail(id, 'upload', { message: 'Something went wrong. Add the file again.', retryable: false })
			return
		}
		running++
		const controller = new AbortController()
		job.controller = controller
		try {
			await processJob(id, job, controller)
		} catch {
			// Nothing above should throw, but a row stuck on "uploading" is worse than a generic failure.
			if (jobs.has(id))
				fail(id, job.blob ? 'register' : 'upload', {
					message: 'Something went wrong. Try again.',
					retryable: true,
				})
		} finally {
			job.controller = undefined
			running--
			pump()
		}
	}

	function pump() {
		while (!paused && running < limit) {
			const next = state.items.find((item) => item.state === 'queued')
			if (!next) break
			// `run` marks the row before its first await, so the next turn cannot pick it again.
			void run(next.id)
		}
		settleWaiters()
	}

	const requeue = (ids: string[]) => {
		const batch = batchForNewWork()
		const wanted = new Set(ids)
		update({
			batch,
			items: state.items.map((item) =>
				wanted.has(item.id)
					? {
							...item,
							batch,
							state: 'queued',
							progress: 0,
							message: undefined,
							hint: undefined,
							stage: undefined,
							retryable: undefined,
						}
					: item,
			),
		})
		pump()
	}

	const retryable = (item: UploadItem) =>
		item.state === 'failed' && item.retryable !== false && jobs.has(item.id)

	/** A checked file becomes a queued row (and a job); a refused one becomes a failed row. */
	const makeRow = (file: File, context: UploadContext, batch: number): UploadItem => {
		const id = `u${++counter}`
		const row = {
			id,
			batch,
			progress: 0,
			destination: context.destination,
		}
		try {
			const name = displayName(file.name)
			const check = validateFile(file, context.maxBytes)
			if (check.ok) {
				jobs.set(id, { file, contentType: check.contentType, context })
				return { ...row, name, state: 'queued' }
			}
			return {
				...row,
				name,
				state: 'failed',
				message: check.message,
				hint: check.hint,
				stage: 'validate',
				retryable: false,
			}
		} catch {
			// An object whose properties throw is not a file this page can do anything with.
			jobs.delete(id)
			return {
				...row,
				name: 'Untitled',
				state: 'failed',
				message: NOT_AN_IMAGE,
				hint: IMAGE_HINT,
				stage: 'validate',
				retryable: false,
			}
		}
	}

	return {
		getState: () => state,
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		add(files, context) {
			let list: File[] = []
			try {
				list = files == null ? [] : Array.from(files as ArrayLike<File>)
			} catch {
				return 0
			}
			list = list.filter((file) => file != null && typeof file === 'object')
			if (!list.length) return 0
			const batch = batchForNewWork()
			const rows = list.map((file) => makeRow(file, context, batch))
			update({ batch, items: [...state.items, ...rows] })
			pump()
			return rows.length
		},
		retry(id) {
			const item = state.items.find((row) => row.id === id)
			if (!item || !retryable(item)) return false
			requeue([id])
			return true
		},
		retryAll() {
			const ids = state.items.filter(retryable).map((item) => item.id)
			if (ids.length) requeue(ids)
			return ids.length
		},
		remove(id) {
			if (!state.items.some((item) => item.id === id)) return false
			jobs.get(id)?.controller?.abort()
			jobs.delete(id)
			update({ items: state.items.filter((item) => item.id !== id) })
			settleWaiters()
			return true
		},
		clearFinished() {
			const gone = state.items.filter((item) => !isActive(item))
			if (!gone.length) return 0
			for (const item of gone) jobs.delete(item.id)
			update({ items: state.items.filter(isActive) })
			return gone.length
		},
		consumeBatch() {
			const created = selectCreated(state)
			if (!isBusy(state) && state.consumed !== state.batch) update({ consumed: state.batch })
			return created
		},
		setPaused(next) {
			paused = next
			if (!next) pump()
			else settleWaiters()
		},
		whenIdle() {
			return new Promise<void>((resolve) => {
				if (isIdle()) resolve()
				else idleWaiters.push(resolve)
			})
		},
	}
}

/** Loaded on first use, as the builder does, so the SDK is not in the page's first bundle. */
const defaultUpload: UploadFn = async (pathname, body, options) => {
	const { upload } = await import('@vercel/blob/client')
	return upload(pathname, body, options)
}

// Dragging files in

/**
 * Only a drag of real files. An in-app card drag carries `DRAG_MIME` and must never light
 * the overlay; Chrome also lists `Files` for an image dragged out of the page itself, so
 * `DRAG_MIME` vetoes it. `types` is a frozen array now and a DOMStringList in old engines.
 */
export function hasFiles(dataTransfer: { types?: unknown } | null | undefined) {
	const raw = dataTransfer?.types
	if (!raw || typeof raw !== 'object') return false
	const types = Array.from(raw as ArrayLike<string>)
	return types.includes('Files') && !types.includes(DRAG_MIME)
}

/**
 * Counts enters and leaves, because `dragenter` and `dragleave` fire for every child the
 * pointer crosses (the enter of the next one before the leave of the last). Visible only
 * while the count is above zero, so crossing children never flickers.
 */
export function createDropTracker(staleMs = DROP_STALE_MS) {
	let depth = 0
	let active = false
	let lastSeen = 0
	const set = (next: boolean) => {
		const changed = next !== active
		active = next
		return changed
	}
	return {
		get active() {
			return active
		},
		get depth() {
			return depth
		},
		enter(now: number) {
			depth++
			lastSeen = now
			return set(true)
		},
		/** Sent continuously during a drag, so it also repairs a missed enter. */
		over(now: number) {
			lastSeen = now
			if (depth < 1) depth = 1
			return set(true)
		},
		leave() {
			depth = Math.max(0, depth - 1)
			return depth === 0 ? set(false) : false
		},
		drop() {
			depth = 0
			return set(false)
		},
		/** True when the overlay was hidden because the drag went quiet. */
		expire(now: number) {
			if (!active || now - lastSeen <= staleMs) return false
			depth = 0
			return set(false)
		},
	}
}

export type DropClock = {
	now(): number
	setInterval(callback: () => void, ms: number): unknown
	clearInterval(handle: unknown): void
}

const realClock: DropClock = {
	now: () => Date.now(),
	setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
	clearInterval: (handle) => globalThis.clearInterval(handle as number),
}

export type DropHandlers = {
	/** The overlay should be shown (true) or hidden (false). Reports changes only. */
	onActive(active: boolean): void
	onFiles(files: File[]): void
	disabled(): boolean
}

const transferOf = (event: Event) =>
	(event as Partial<DragEvent>).dataTransfer ?? null

function setDropEffect(transfer: DataTransfer | null, effect: 'copy' | 'none') {
	try {
		if (transfer) transfer.dropEffect = effect
	} catch {
		// Some engines make it read-only outside dragover.
	}
}

/**
 * Window-level file drop. While mounted, a dropped file never navigates the tab away to
 * the image (even when uploads are disabled, which says "no" with the cursor instead).
 * Everything that is not a drag of files is left completely alone.
 */
export function attachFileDrop(
	target: EventTarget,
	handlers: DropHandlers,
	clock: DropClock = realClock,
) {
	const tracker = createDropTracker()
	let timer: unknown = null
	let shown = false

	const publish = () => {
		const visible = tracker.active && !handlers.disabled()
		if (visible !== shown) {
			shown = visible
			handlers.onActive(visible)
		}
		if (tracker.active && timer === null) timer = clock.setInterval(check, DROP_CHECK_MS)
		else if (!tracker.active && timer !== null) {
			clock.clearInterval(timer)
			timer = null
		}
	}
	const check = () => {
		if (tracker.expire(clock.now())) publish()
	}

	const accept = (event: Event) => {
		const transfer = transferOf(event)
		if (!hasFiles(transfer)) return false
		// Both enter and over must be cancelled for the browser to allow a drop here.
		event.preventDefault()
		setDropEffect(transfer, handlers.disabled() ? 'none' : 'copy')
		return true
	}

	const onEnter = (event: Event) => {
		if (!accept(event)) return
		tracker.enter(clock.now())
		publish()
	}
	const onOver = (event: Event) => {
		if (!accept(event)) return
		tracker.over(clock.now())
		publish()
	}
	const onLeave = (event: Event) => {
		if (!hasFiles(transferOf(event))) return
		tracker.leave()
		publish()
	}
	const onDrop = (event: Event) => {
		const transfer = transferOf(event)
		if (!hasFiles(transfer)) return
		event.preventDefault()
		tracker.drop()
		publish()
		if (handlers.disabled()) return
		const files = Array.from(transfer?.files ?? [])
		if (files.length) handlers.onFiles(files)
	}

	target.addEventListener('dragenter', onEnter)
	target.addEventListener('dragover', onOver)
	target.addEventListener('dragleave', onLeave)
	target.addEventListener('drop', onDrop)
	return () => {
		target.removeEventListener('dragenter', onEnter)
		target.removeEventListener('dragover', onOver)
		target.removeEventListener('dragleave', onLeave)
		target.removeEventListener('drop', onDrop)
		if (timer !== null) clock.clearInterval(timer)
		timer = null
	}
}

/** Asks the browser to confirm before leaving. The wording is the browser's own. */
export function attachBeforeUnload(target: EventTarget) {
	const onBeforeUnload = (event: Event) => {
		event.preventDefault()
		const legacy = event as { returnValue?: unknown }
		try {
			// Older engines only prompt when this is set.
			legacy.returnValue = ''
		} catch {
			// Read-only on some implementations; preventDefault already asked.
		}
	}
	target.addEventListener('beforeunload', onBeforeUnload)
	return () => target.removeEventListener('beforeunload', onBeforeUnload)
}

// The panel

const rowButton =
	'grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-slate-400 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-[3px] focus-visible:ring-white/40 motion-reduce:transition-none'

const textButton =
	'cursor-pointer rounded text-xs font-medium text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-white/40'

function StateIcon({ state }: { state: UploadItemState }) {
	if (state === 'uploading' || state === 'processing')
		return (
			<LoaderCircle
				aria-hidden='true'
				className='size-4 animate-spin text-brand motion-reduce:animate-none'
			/>
		)
	if (state === 'done')
		return <CircleCheck aria-hidden='true' className='size-4 text-emerald-400' />
	if (state === 'duplicate')
		return <CopyCheck aria-hidden='true' className='size-4 text-slate-300' />
	if (state === 'failed')
		return <CircleAlert aria-hidden='true' className='size-4 text-destructive' />
	return <Clock aria-hidden='true' className='size-4 text-slate-500' />
}

type RowProps = {
	item: UploadItem
	readOnly: boolean
	onRetry(id: string): void
	onRemove(id: string): void
	onView(id: string): void
}

const UploadRow = memo(function UploadRow({
	item,
	readOnly,
	onRetry,
	onRemove,
	onView,
}: RowProps) {
	const active = isActive(item)
	const canRetry = item.state === 'failed' && item.retryable !== false
	return (
		<li
			data-slot='upload-row'
			data-state={item.state}
			className='flex items-start gap-2.5 px-4 py-2.5'>
			<span className='mt-0.5 shrink-0'>
				<StateIcon state={item.state} />
			</span>
			<div className='min-w-0 flex-1'>
				<p className='truncate text-sm text-white' title={item.name}>
					{item.name}
				</p>
				<p
					className={cn(
						'text-xs wrap-break-word',
						item.state === 'failed' ? 'text-destructive' : 'text-slate-400',
					)}>
					{item.state === 'failed' ? <span className='sr-only'>Failed: </span> : null}
					{describeItem(item)}
				</p>
				{item.state === 'failed' && item.hint ? (
					<p className='text-xs text-slate-500'>{item.hint}</p>
				) : null}
				{item.state === 'uploading' ? (
					<div
						role='progressbar'
						aria-label={`Upload progress for ${item.name}`}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={item.progress}
						className='mt-1.5 h-1 overflow-hidden rounded-full bg-white/10'>
						<div
							className='h-full rounded-full bg-brand transition-[width] duration-150 ease-out motion-reduce:transition-none'
							style={{ width: `${item.progress}%` }}
						/>
					</div>
				) : null}
				{item.state === 'processing' ? (
					<div
						role='progressbar'
						aria-label={`Processing ${item.name}`}
						aria-valuetext='Processing'
						className='mt-1.5 h-1 overflow-hidden rounded-full bg-white/10'>
						<div className='h-full w-full animate-pulse rounded-full bg-brand/60 motion-reduce:animate-none' />
					</div>
				) : null}
			</div>
			{readOnly ? null : (
				<div className='flex shrink-0 items-center gap-1'>
					{item.state === 'duplicate' && item.asset ? (
						<button
							type='button'
							aria-label={`View ${assetLabel(item.asset)}`}
							onClick={() => onView(item.asset?.id ?? '')}
							className={textButton}>
							View
						</button>
					) : null}
					{canRetry ? (
						<button
							type='button'
							title='Retry'
							aria-label={`Retry ${item.name}`}
							onClick={() => onRetry(item.id)}
							className={rowButton}>
							<RotateCw aria-hidden='true' className='size-3.5' />
						</button>
					) : null}
					<button
						type='button'
						title={active ? 'Cancel' : 'Remove'}
						aria-label={`${active ? 'Cancel upload of' : 'Remove'} ${item.name}`}
						onClick={() => onRemove(item.id)}
						className={rowButton}>
						<X aria-hidden='true' className='size-3.5' />
					</button>
				</div>
			)}
		</li>
	)
})

export type UploadQueuePanelProps = {
	state: QueueState
	collapsed: boolean
	/** Nothing interactive: used while uploads are disabled. */
	readOnly: boolean
	onToggle(): void
	onRetry(id: string): void
	onRetryAll(): void
	onRemove(id: string): void
	onClear(): void
	onSelectBatch(): void
	onView(id: string): void
}

/**
 * The summary is a live region that is in the page from the first render, empty, and
 * only gains its visible panel around it: a region that appears already filled is often
 * not announced, one whose text changes is.
 */
export function UploadQueuePanel({
	state,
	collapsed,
	readOnly,
	onToggle,
	onRetry,
	onRetryAll,
	onRemove,
	onClear,
	onSelectBatch,
	onView,
}: UploadQueuePanelProps) {
	const listId = useId()
	const summary = summarizeQueue(state)
	const hasRows = state.items.length > 0
	const busy = summary.active > 0
	const added = footerCount(state)
	const shown = state.items.slice(0, MAX_ROWS_SHOWN)
	const hiddenRows = state.items.length - shown.length
	const retryable = state.items.filter(
		(item) => item.state === 'failed' && item.retryable !== false,
	).length
	const hasFinished = state.items.some((item) => !isActive(item))

	return (
		<div
			data-slot='upload-panel'
			data-empty={hasRows ? undefined : 'true'}
			className={
				hasRows
					? 'fixed right-4 bottom-4 z-40 flex max-h-[min(32rem,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-white/10 bg-panel/95 shadow-2xl backdrop-blur-md'
					: 'sr-only'
			}>
			<div className={hasRows ? 'flex items-center gap-2 px-4 py-3' : undefined}>
				<div className='min-w-0 flex-1'>
					<p
						role='status'
						aria-live='polite'
						aria-atomic='true'
						data-slot='upload-summary'
						className='truncate text-sm font-medium text-white'>
						{summary.text}
					</p>
					{hasRows && summary.destination ? (
						<p className='truncate text-xs text-slate-400'>{summary.destination}</p>
					) : null}
				</div>
				{hasRows && !readOnly ? (
					<button
						type='button'
						aria-expanded={!collapsed}
						aria-controls={listId}
						aria-label={collapsed ? 'Show upload details' : 'Hide upload details'}
						onClick={onToggle}
						className={rowButton}>
						{collapsed ? (
							<ChevronUp aria-hidden='true' className='size-4' />
						) : (
							<ChevronDown aria-hidden='true' className='size-4' />
						)}
					</button>
				) : null}
			</div>
			{hasRows && busy ? (
				<div
					role='progressbar'
					aria-label='Overall upload progress'
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={summary.percent}
					className='h-0.5 bg-white/10'>
					<div
						className='h-full bg-brand transition-[width] duration-150 ease-out motion-reduce:transition-none'
						style={{ width: `${summary.percent}%` }}
					/>
				</div>
			) : null}
			{hasRows && !readOnly && !collapsed && (retryable > 1 || hasFinished) ? (
				<div className='flex items-center gap-4 border-t border-white/10 px-4 py-1.5'>
					{retryable > 1 ? (
						<button type='button' onClick={onRetryAll} className={textButton}>
							{`Retry ${retryable} failed`}
						</button>
					) : null}
					{hasFinished ? (
						<button type='button' onClick={onClear} className={textButton}>
							Clear finished
						</button>
					) : null}
				</div>
			) : null}
			{hasRows ? (
				<ul
					id={listId}
					hidden={collapsed}
					className='min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto border-t border-white/10'>
					{shown.map((item) => (
						<UploadRow
							key={item.id}
							item={item}
							readOnly={readOnly}
							onRetry={onRetry}
							onRemove={onRemove}
							onView={onView}
						/>
					))}
					{hiddenRows > 0 ? (
						<li className='px-4 py-2 text-xs text-slate-500'>
							{`and ${formatCount(hiddenRows)} more`}
						</li>
					) : null}
				</ul>
			) : null}
			{hasRows && added > 0 ? (
				<div
					data-slot='upload-footer'
					className='flex items-center justify-between gap-3 border-t border-white/10 bg-brand/10 px-4 py-2.5'>
					<span className='text-sm text-white'>{`${formatCount(added)} added. `}</span>
					{readOnly ? null : (
						<button type='button' onClick={onSelectBatch} className={textButton}>
							Select them
							<span className='sr-only'>{` (${pluralize(added, 'new image')})`}</span>
						</button>
					)}
				</div>
			) : null}
		</div>
	)
}

export function DropOverlay({ label }: { label: string }) {
	return (
		<div
			data-slot='drop-overlay'
			aria-hidden='true'
			// No pointer events: the drag keeps crossing the page underneath, so the enter
			// and leave events the counter reads stay the same whether this is shown or not.
			className='pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6 backdrop-blur-sm animate-in fade-in-0 duration-150 motion-reduce:animate-none'>
			<div className='flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand/70 bg-panel/90 px-10 py-12 text-center'>
				<CloudUpload className='size-10 text-brand' />
				<p className='text-lg font-semibold text-white'>{label}</p>
				<p className='text-sm text-slate-300'>Drop the images anywhere to add them</p>
			</div>
		</div>
	)
}

// The manager

export function UploadManager(props: UploadManagerProps) {
	const { disabled, destinationLabel, handleRef, onBusyChange } = props

	// The engine outlives renders and calls back into whatever the page passed most recently.
	const latest = useRef(props)
	useLayoutEffect(() => {
		latest.current = props
	})

	const inputRef = useRef<HTMLInputElement>(null)
	const [queue] = useState(() =>
		createUploadQueue({
			upload: defaultUpload,
			// Wrapped: a bare `fetch` called as a method of another object throws "Illegal invocation".
			fetch: (input, init) => globalThis.fetch(input, init),
			onRegistered: (result) => latest.current.onRegistered(result),
		}),
	)
	const state = useSyncExternalStore(queue.subscribe, queue.getState, queue.getState)
	const [collapsed, setCollapsed] = useState(false)
	const [dragging, setDragging] = useState(false)
	const busy = isBusy(state)

	const addFiles = useCallback(
		(files: readonly File[]) => {
			const current = latest.current
			if (current.disabled) return
			const added = queue.add(files, {
				workspaceId: current.workspaceId,
				folderId: current.folderId,
				pathPrefix: current.pathPrefix,
				maxBytes: current.maxBytes,
				destination: current.destinationLabel,
			})
			if (added > 0) setCollapsed(false)
		},
		[queue],
	)

	const openPicker = useCallback(() => {
		if (latest.current.disabled) return
		inputRef.current?.click()
	}, [])

	useImperativeHandle<UploadManagerHandle, UploadManagerHandle>(
		handleRef,
		() => ({ openPicker, addFiles }),
		[openPicker, addFiles],
	)

	useEffect(
		() =>
			attachFileDrop(window, {
				onActive: setDragging,
				onFiles: addFiles,
				disabled: () => latest.current.disabled,
			}),
		[addFiles],
	)

	// Disabled, or gone (unmounted, or React's dev re-mount): nothing new starts. Work
	// already in flight is allowed to finish.
	useEffect(() => {
		queue.setPaused(disabled)
		return () => queue.setPaused(true)
	}, [queue, disabled])

	const reported = useRef(false)
	useEffect(() => {
		if (reported.current === busy) return
		reported.current = busy
		onBusyChange?.(busy)
	}, [busy, onBusyChange])
	useEffect(
		() => () => {
			if (!reported.current) return
			reported.current = false
			latest.current.onBusyChange?.(false)
		},
		[],
	)

	useEffect(() => (busy ? attachBeforeUnload(window) : undefined), [busy])

	const onSelectBatch = useCallback(() => {
		const created = queue.consumeBatch()
		if (created.length) latest.current.onSelectBatch(created.map((asset) => asset.id))
	}, [queue])
	const onView = useCallback((id: string) => latest.current.onOpenAsset(id), [])
	const onToggle = useCallback(() => setCollapsed((value) => !value), [])

	return (
		<>
			<input
				ref={inputRef}
				type='file'
				multiple
				hidden
				tabIndex={-1}
				accept={ACCEPT}
				disabled={disabled}
				aria-label='Choose images to upload'
				data-slot='upload-input'
				onChange={(event) => {
					// A live FileList: clearing the value (so the same file can be chosen again) empties it.
					const files = Array.from(event.target.files ?? [])
					event.target.value = ''
					addFiles(files)
				}}
			/>
			{dragging && !disabled ? <DropOverlay label={destinationLabel} /> : null}
			<UploadQueuePanel
				state={state}
				collapsed={collapsed}
				readOnly={disabled}
				onToggle={onToggle}
				onRetry={queue.retry}
				onRetryAll={queue.retryAll}
				onRemove={queue.remove}
				onClear={queue.clearFinished}
				onSelectBatch={onSelectBatch}
				onView={onView}
			/>
		</>
	)
}
