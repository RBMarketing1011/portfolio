import 'server-only'
import { BlobNotFoundError, del, head, list } from '@vercel/blob'
import { MEDIA_LIMITS } from '@/lib/media/types'

/**
 * The only module that talks to Vercel Blob for the library. Everything the
 * browser claims about a blob (its url, its pathname, its size) is an attacker's
 * parameter until it has been checked here against what the store itself says.
 *
 * THE RULE FOR DELETION: no code path may call `del()` (or `deleteBlob`) with a
 * string that came from a request body. `del(urlOrPathname)` is unscoped, it deletes
 * ANY blob in the store, including another workspace's images and the project
 * images shown on published sites. Deletion targets come only from `headBlob`
 * results or from stored asset documents, and `deleteBlob` re-checks them against
 * the workspace's media prefix at the moment of deletion.
 */

export const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com'

/** The URL is not a blob URL we will touch (wrong scheme, host, credentials, path). Permanent. */
export class BlobUrlError extends Error {
	constructor(message = 'That is not a valid image URL.') {
		super(message)
		this.name = 'BlobUrlError'
	}
}

/** The blob no longer exists (404 / 410). Permanent. */
export class BlobGoneError extends Error {
	constructor(message = 'That image is no longer stored.') {
		super(message)
		this.name = 'BlobGoneError'
	}
}

/** The object is bigger than the cap the caller allowed. Permanent for that cap. */
export class BlobTooLargeError extends Error {
	constructor(message = 'That image is too large.') {
		super(message)
		this.name = 'BlobTooLargeError'
	}
}

// Built with RegExp() so the Unicode property escapes do not depend on the TS target.
// Controls (C0, DEL, C1), line/paragraph separators and the bidi override/isolate
// characters, which let a name read differently from what it is.
const UNSAFE_CHARS = new RegExp(
	'[\\p{Cc}\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069]',
	'u',
)
const UNSAFE_CHARS_G = new RegExp(UNSAFE_CHARS.source, 'gu')
// `%2e` `%2f` `%5c` (and their double-encoded forms) are never wanted in a name,
// and are how a traversal is smuggled past a check that compares decoded text.
const ENCODED_TRICKS = /%(?:25)*(?:2e|2f|5c)/i

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const PREFIX_PATTERN = /^workspaces\/([A-Za-z0-9_-]{1,64})\/media\/$/
const MAX_PATHNAME = 1024
const MAX_URL = 2048
const STORE_TIMEOUT_MS = 15_000
const DELETE_CHUNK = 200
const MAX_LIST_PAGES = 10_000
const MAX_SWEEPS = 25

/** `workspaces/<id>/media/` - where every library upload lives. */
export function mediaPathPrefix(workspaceId: string): string {
	// A prefix is what bounds every delete, so a malformed id must never produce a
	// broad one (`workspaces//media/`, an id with a slash, `..`).
	if (typeof workspaceId !== 'string' || !ID_PATTERN.test(workspaceId))
		throw new Error('Invalid workspace id for a media prefix.')
	return `workspaces/${workspaceId}/media/`
}

/**
 * True only for a pathname inside this workspace's prefix with a non-empty file
 * part, no `..` or `.` segments (also percent-encoded), no empty segments, no
 * backslashes, no control characters. A path under another workspace's prefix, or a
 * project's `sites/...` path, is false.
 */
export function isOwnedPathname(pathname: string, workspaceId: string): boolean {
	if (typeof pathname !== 'string' || typeof workspaceId !== 'string') return false
	if (!ID_PATTERN.test(workspaceId)) return false
	if (pathname.length > MAX_PATHNAME) return false
	const prefix = `workspaces/${workspaceId}/media/`
	if (!pathname.startsWith(prefix) || pathname.length === prefix.length) return false
	if (pathname.includes('\\')) return false
	if (UNSAFE_CHARS.test(pathname)) return false
	if (ENCODED_TRICKS.test(pathname)) return false
	for (const segment of pathname.split('/')) {
		if (segment === '' || segment === '.' || segment === '..') return false
	}
	return true
}

/** Decodes once; null when the escapes are malformed. */
function decodeOnce(text: string): string | null {
	try {
		return decodeURIComponent(text)
	} catch {
		return null
	}
}

function hasDotSegment(path: string): boolean {
	return path.split('/').some((segment) => segment === '.' || segment === '..')
}

/**
 * Parses and validates a blob URL: https only, hostname ending in
 * BLOB_HOST_SUFFIX (preceded by a label), no credentials, no non-default port, no
 * IP literal, no `..` path segments. Throws `BlobUrlError` otherwise. The host check
 * alone admits every Vercel Blob store, not just ours; it keeps the server from being
 * aimed at an arbitrary host, and `headBlob` (store-scoped by our token) is what
 * proves the blob is in OUR store.
 */
export function assertBlobUrl(url: string): URL {
	if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL)
		throw new BlobUrlError()
	// The URL parser silently drops tabs and newlines and turns `\` into `/`, so
	// the text it would have hidden is rejected before it parses anything.
	if (/[\s\\]/.test(url) || UNSAFE_CHARS.test(url)) throw new BlobUrlError()
	// The query and fragment mean nothing for a stored object; a clean URL has neither.
	if (url.includes('?') || url.includes('#')) throw new BlobUrlError()

	// Read the authority and path from the raw text: the parser would normalise
	// the case of the host and resolve `..` before we could look at them.
	const match = /^https:\/\/([^/]*)(\/.*)$/.exec(url)
	if (!match) throw new BlobUrlError()
	const authority = match[1] ?? ''
	const rawPath = match[2] ?? ''

	// Lowercase labels and digits only: no userinfo, no brackets (IPv6), no percent
	// escapes, no uppercase, no empty label.
	const hostMatch = /^([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::(\d{1,5}))?$/.exec(authority)
	if (!hostMatch) throw new BlobUrlError()
	const host = hostMatch[1] ?? ''
	const port = hostMatch[2]
	if (port !== undefined && port !== '443') throw new BlobUrlError()

	if (!host.endsWith(BLOB_HOST_SUFFIX)) throw new BlobUrlError()
	const label = host.slice(0, host.length - BLOB_HOST_SUFFIX.length)
	// One store label. A deeper name is not something the store hands out.
	if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) throw new BlobUrlError()

	if (rawPath.length < 2) throw new BlobUrlError()
	if (ENCODED_TRICKS.test(rawPath) || hasDotSegment(rawPath)) throw new BlobUrlError()
	const decodedPath = decodeOnce(rawPath)
	if (decodedPath === null || hasDotSegment(decodedPath) || UNSAFE_CHARS.test(decodedPath))
		throw new BlobUrlError()

	let parsed: URL
	try {
		parsed = new URL(url)
	} catch {
		throw new BlobUrlError()
	}
	// Belt and braces: what a fetch would connect to is what we validated.
	if (
		parsed.protocol !== 'https:' ||
		parsed.hostname !== host ||
		parsed.username !== '' ||
		parsed.password !== '' ||
		parsed.port !== '' ||
		parsed.search !== '' ||
		parsed.hash !== ''
	)
		throw new BlobUrlError()
	return parsed
}

/** The URL's path without the leading slash, raw and decoded once. */
function urlPaths(parsed: URL): { raw: string; decoded: string | null } {
	const raw = parsed.pathname.slice(1)
	return { raw, decoded: decodeOnce(raw) }
}

function pathMatches(parsed: URL, pathname: string): boolean {
	const { raw, decoded } = urlPaths(parsed)
	return pathname === raw || (decoded !== null && pathname === decoded)
}

export type BlobInfo = {
	url: string
	pathname: string
	size: number
	contentType: string
}

/** Never lets a credential into a message that gets logged or stored. */
function redact(text: string): string {
	let out = text
	const token = process.env.BLOB_READ_WRITE_TOKEN
	if (token) out = out.split(token).join('[redacted]')
	out = out.replace(/vercel_blob_[A-Za-z0-9_]+/g, '[redacted]')
	out = out.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
	return out.slice(0, 300)
}

function isNotFound(error: unknown): boolean {
	if (typeof BlobNotFoundError === 'function' && error instanceof BlobNotFoundError)
		return true
	if (typeof error !== 'object' || error === null) return false
	// A duplicate copy of the SDK would defeat instanceof.
	return (error as { constructor?: { name?: string } }).constructor?.name === 'BlobNotFoundError'
}

/** A fresh Error: no `cause`, no stack and no properties carried over from the SDK's. */
function storeError(error: unknown): Error {
	const name =
		typeof error === 'object' && error !== null
			? ((error as { constructor?: { name?: string } }).constructor?.name ?? 'Error')
			: 'Error'
	const message =
		error instanceof Error ? error.message : typeof error === 'string' ? error : ''
	return new Error(redact(`Blob store request failed (${name}): ${message}`))
}

/**
 * Asks the store about a blob (`head` from @vercel/blob). The result, not the
 * caller's claim, is the source of truth for pathname, size and content type.
 * Throws `BlobUrlError` for a non-blob URL and `BlobGoneError` when it does not exist;
 * any other store error is rethrown as a plain Error that never contains the token.
 * The returned `pathname` must match the URL's own path, or it is a `BlobUrlError`.
 */
export async function headBlob(url: string): Promise<BlobInfo> {
	const parsed = assertBlobUrl(url)
	let result: Awaited<ReturnType<typeof head>>
	try {
		result = await head(parsed.href, { abortSignal: AbortSignal.timeout(STORE_TIMEOUT_MS) })
	} catch (error) {
		if (isNotFound(error)) throw new BlobGoneError()
		throw storeError(error)
	}

	if (!result || typeof result.pathname !== 'string' || result.pathname === '')
		throw new BlobUrlError()
	// The store looks a blob up by its path, so the answer must be about the path
	// we were asked about and not about some other blob.
	if (!pathMatches(parsed, result.pathname)) throw new BlobUrlError()

	// Return the store's own URL, after holding it to the same rules, and on the
	// same host as the claim: a claim naming another store must not stick.
	let canonical: URL
	try {
		canonical = assertBlobUrl(result.url)
	} catch {
		throw new BlobUrlError()
	}
	if (canonical.host !== parsed.host || !pathMatches(canonical, result.pathname))
		throw new BlobUrlError()

	if (typeof result.size !== 'number' || !Number.isFinite(result.size) || result.size < 0)
		throw new Error('Blob store returned an invalid size.')

	return {
		url: canonical.href,
		pathname: result.pathname,
		size: result.size,
		contentType: typeof result.contentType === 'string' ? result.contentType : '',
	}
}

function deadline(signal: AbortSignal): Promise<never> {
	const rejected = new Promise<never>((_, reject) => {
		const fail = () => reject(new Error('Timed out reading the image.'))
		if (signal.aborted) fail()
		else signal.addEventListener('abort', fail, { once: true })
	})
	// Never an unhandled rejection when the read finished first.
	rejected.catch(() => undefined)
	return rejected
}

async function dispose(body: ReadableStream<Uint8Array> | null | undefined) {
	try {
		await body?.cancel()
	} catch {
		// already closed or locked; nothing to free
	}
}

/**
 * Downloads the blob's bytes. Validates the URL with `assertBlobUrl`, refuses
 * redirects, aborts after `timeoutMs` (default 20 000; the AI queue passes the
 * time it has left, at most 10 000), checks content-length first when present, and
 * stops reading and throws as soon as the body exceeds `maxBytes` (default
 * MEDIA_LIMITS.maxBytes), so an oversized object is never buffered whole. A 404 or
 * 410 is `BlobGoneError`.
 */
export async function readBlob(
	url: string,
	opts?: { maxBytes?: number; timeoutMs?: number },
): Promise<Buffer> {
	const parsed = assertBlobUrl(url)
	const maxBytes =
		typeof opts?.maxBytes === 'number' && Number.isFinite(opts.maxBytes) && opts.maxBytes >= 0
			? Math.floor(opts.maxBytes)
			: MEDIA_LIMITS.maxBytes
	const timeoutMs =
		typeof opts?.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs)
			? Math.max(1, Math.floor(opts.timeoutMs))
			: 20_000
	// A plain timer, not AbortSignal.timeout: that one is unref'd, so it cannot
	// keep a script alive long enough to fire.
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		return await download(parsed, maxBytes, controller.signal)
	} finally {
		clearTimeout(timer)
	}
}

async function download(parsed: URL, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
	const expired = deadline(signal)

	let response: Response
	try {
		response = await Promise.race([
			fetch(parsed.href, { redirect: 'manual', signal, cache: 'no-store' }),
			expired,
		])
	} catch (error) {
		if (signal.aborted) throw new Error('Timed out reading the image.')
		throw new Error(redact(`Could not download the image: ${errorName(error)}`))
	}

	// Under `redirect: 'manual'` a redirect arrives as a response, not a failure.
	if (
		(response.status >= 300 && response.status < 400) ||
		response.type === 'opaqueredirect' ||
		response.redirected
	) {
		await dispose(response.body)
		throw new BlobUrlError('The image URL redirected, which is not allowed.')
	}
	if (response.status === 404 || response.status === 410) {
		await dispose(response.body)
		throw new BlobGoneError()
	}
	if (response.status !== 200) {
		await dispose(response.body)
		throw new Error(`Could not download the image (status ${response.status}).`)
	}

	const declared = response.headers.get('content-length')
	if (declared !== null && /^\d+$/.test(declared.trim())) {
		if (Number(declared.trim()) > maxBytes) {
			await dispose(response.body)
			throw new BlobTooLargeError()
		}
	}

	const body = response.body
	if (!body) throw new Error('The stored image is empty.')

	const reader = body.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	try {
		for (;;) {
			const { done, value } = await Promise.race([reader.read(), expired])
			if (done) break
			if (!value || value.byteLength === 0) continue
			total += value.byteLength
			if (total > maxBytes) throw new BlobTooLargeError()
			chunks.push(value)
		}
	} catch (error) {
		// Stop the transfer; do not wait on a stalled stream to acknowledge it.
		reader.cancel().catch(() => undefined)
		if (error instanceof BlobTooLargeError) throw error
		if (signal.aborted) throw new Error('Timed out reading the image.')
		if (error instanceof Error && error.message === 'Timed out reading the image.')
			throw error
		throw new Error(redact(`Could not download the image: ${errorName(error)}`))
	}

	if (total === 0) throw new Error('The stored image is empty.')
	return Buffer.concat(chunks, total)
}

function errorName(error: unknown): string {
	return error instanceof Error ? error.name : 'Error'
}

const LOG_UNSAFE = new RegExp(
	'[\\u007f-\\u009f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069]',
	'g',
)

/** One line, bounded, with anything that could forge a second log line escaped. */
function logValue(value: unknown): string {
	const text = typeof value === 'string' ? value : String(value)
	// JSON escapes C0 controls and quotes; the rest (DEL, C1, line and paragraph
	// separators, bidi overrides) could still split or disguise a line, so they go too.
	return JSON.stringify(text.slice(0, 200)).replace(
		LOG_UNSAFE,
		(c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
	)
}

/**
 * The URL to delete, or null when the blob is not provably inside `ownedPrefix`.
 * `ownedPrefix` must be exactly `workspaces/<id>/media/`; a substring of one, a
 * missing slash or a broader prefix proves nothing.
 */
function provenDeleteTarget(
	info: { url?: unknown; pathname?: unknown } | null | undefined,
	ownedPrefix: unknown,
): { href: string } | { refusal: string } {
	if (typeof ownedPrefix !== 'string') return { refusal: 'prefix is not a string' }
	const match = PREFIX_PATTERN.exec(ownedPrefix)
	const workspaceId = match?.[1]
	if (!workspaceId) return { refusal: 'prefix is not a workspace media prefix' }
	if (!info || typeof info.pathname !== 'string' || typeof info.url !== 'string')
		return { refusal: 'blob info is incomplete' }
	if (!info.pathname.startsWith(ownedPrefix) || !isOwnedPathname(info.pathname, workspaceId))
		return { refusal: 'pathname is not owned by the workspace' }
	let parsed: URL
	try {
		parsed = assertBlobUrl(info.url)
	} catch {
		return { refusal: 'url is not a blob url' }
	}
	if (!pathMatches(parsed, info.pathname))
		return { refusal: 'url path differs from the pathname' }
	return { href: parsed.href }
}

/**
 * Deletes ONE blob, only if it provably belongs to the workspace: `ownedPrefix`
 * must be a non-empty `workspaces/<id>/media/` prefix (callers pass
 * `mediaPathPrefix(workspaceId)`), `info.pathname` must start with it and pass
 * `isOwnedPathname`, and the URL's own path must equal `info.pathname`. Anything
 * else is a silent no-op that logs one line. A blob that is already gone is not an
 * error. NEVER throws.
 */
export async function deleteBlob(
	info: Pick<BlobInfo, 'url' | 'pathname'>,
	ownedPrefix: string,
): Promise<void> {
	try {
		const target = provenDeleteTarget(info, ownedPrefix)
		if ('refusal' in target) {
			console.warn(
				`media: refused to delete blob (${target.refusal}) pathname=${logValue(info?.pathname)}`,
			)
			return
		}
		try {
			await del(target.href)
		} catch (error) {
			if (isNotFound(error)) return
			console.warn(
				`media: could not delete blob pathname=${logValue(info.pathname)}: ${redact(errorName(error))}`,
			)
		}
	} catch (error) {
		// The guard itself failing must still not throw into a delete flow.
		console.warn(`media: blob delete skipped: ${redact(errorName(error))}`)
	}
}

/**
 * Deletes every blob under `mediaPathPrefix(workspaceId)`, paging with
 * `list({ prefix, cursor })` and deleting each page. For account deletion, so
 * library images do not outlive the account. Returns how many were removed.
 * Idempotent; never touches anything outside the prefix.
 */
export async function deleteAllUnderPrefix(workspaceId: string): Promise<number> {
	const prefix = mediaPathPrefix(workspaceId)
	let removed = 0
	let skipped = 0

	// A cursor is a position in a list that is shrinking under it, and a store is
	// free to count it as an offset. So one sweep may step over survivors; sweep
	// again from the top until a whole sweep finds nothing left to delete.
	for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
		const before = removed
		skipped = 0
		let cursor: string | undefined
		for (let page = 0; page < MAX_LIST_PAGES; page++) {
			let result: Awaited<ReturnType<typeof list>>
			try {
				result = await list({ prefix, cursor, limit: 1000 })
			} catch (error) {
				throw storeError(error)
			}

			const urls: string[] = []
			for (const blob of Array.isArray(result?.blobs) ? result.blobs : []) {
				// The store's answer is trusted for what exists, not for where it is.
				const target = provenDeleteTarget(blob, prefix)
				if ('href' in target) urls.push(target.href)
				else skipped++
			}

			for (let i = 0; i < urls.length; i += DELETE_CHUNK) {
				const batch = urls.slice(i, i + DELETE_CHUNK)
				try {
					await del(batch)
					removed += batch.length
				} catch (error) {
					// Already gone is the state we wanted; it is just not ours to count.
					if (!isNotFound(error)) throw storeError(error)
				}
			}

			const next = result?.hasMore ? result.cursor : undefined
			// A cursor that does not advance would page forever.
			if (!next || next === cursor) break
			cursor = next
		}
		if (removed === before) break
	}

	if (skipped > 0)
		console.warn(`media: left ${skipped} blob(s) under ${prefix} that failed the ownership check`)
	return removed
}

const MAX_FILENAME = 255

/** Splits at the last dot that has a stem before it and a plausible extension. */
function splitExtension(name: string): { stem: string; ext: string } {
	const dot = name.lastIndexOf('.')
	if (dot <= 0) return { stem: name, ext: '' }
	const ext = name.slice(dot)
	if (ext.length > 17) return { stem: name, ext: '' }
	return { stem: name.slice(0, dot), ext }
}

/** Cuts to a UTF-16 length without splitting a surrogate pair. */
function cutTo(text: string, length: number): string {
	if (text.length <= length) return text
	let end = length
	const code = text.charCodeAt(end - 1)
	if (code >= 0xd800 && code <= 0xdbff) end--
	return text.slice(0, end)
}

/**
 * A client-supplied file name made safe to store: path separators and control
 * characters removed, whitespace collapsed, at most 255 characters keeping the
 * extension. Falls back to `image` when nothing is left.
 */
export function safeFilename(name: string): string {
	if (typeof name !== 'string') return 'image'
	let cleaned = name
		.replace(UNSAFE_CHARS_G, '')
		.replace(/[/\\]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	// Keep a `%2e` style sequence, however nested, from surviving into a pathname.
	// Each pass can expose another (`%25%2e`), so go until nothing changes.
	for (let guard = 0; guard < 8 && ENCODED_TRICKS.test(cleaned); guard++)
		cleaned = cleaned.replace(/%(?=(?:25)*(?:2e|2f|5c))/gi, '')
	// Nothing but dots is a traversal segment or a hidden nothing.
	if (/^\.*$/.test(cleaned)) return 'image'

	if (cleaned.length > MAX_FILENAME) {
		const { stem, ext } = splitExtension(cleaned)
		cleaned = cutTo(stem, MAX_FILENAME - ext.length).replace(/[\s.]+$/, '') + ext
		if (cleaned.length > MAX_FILENAME) cleaned = cutTo(cleaned, MAX_FILENAME)
	}
	cleaned = cleaned.replace(/^\s+|\s+$/g, '')
	if (cleaned === '' || /^\.*$/.test(cleaned)) return 'image'
	return cleaned
}

/**
 * The display name for a file: its name without the extension, underscores and
 * dashes read as spaces, trimmed, at most MEDIA_LIMITS.nameMax. `kitchen_remodel-2.JPG`
 * -> `kitchen remodel 2`. Falls back to `Untitled` when nothing is left.
 */
export function nameFromFilename(filename: string): string {
	if (typeof filename !== 'string') return 'Untitled'
	const cleaned = filename.replace(UNSAFE_CHARS_G, '').replace(/[/\\]/g, ' ')
	// An extension is a short letter-led run; `kitchen 2.5` and `v1.2` keep theirs.
	const stem = cleaned.replace(/\.[A-Za-z][A-Za-z0-9]{0,4}\s*$/, '')
	const spaced = stem
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	if (spaced === '') return 'Untitled'
	return cutTo(spaced, MEDIA_LIMITS.nameMax).trim() || 'Untitled'
}
