'use client'

/**
 * The media library, and the `media:<id>` reference blocks store instead of the
 * image itself. A data URL inlined into every block that used it was the same
 * picture held two, three, four times over in the same localStorage budget.
 */

export const MEDIA_KEY = 'reynoldsbuilt.builder.media.v1'

const REF_PREFIX = 'media:'

export type MediaItem = {
	id: string
	name: string
	src: string
	addedAt: string
}

// Parsing the library on every render would re-walk megabytes of base64.
let cache: MediaItem[] | null = null

export function invalidateMedia() {
	cache = null
}

if (typeof window !== 'undefined') {
	// Fires in the canvas iframe when the parent writes, and vice versa.
	window.addEventListener('storage', (event) => {
		if (event.key === MEDIA_KEY || event.key === null) invalidateMedia()
	})
}

export function readMedia(): MediaItem[] {
	if (typeof window === 'undefined') return []
	if (cache) return cache
	try {
		const raw = window.localStorage.getItem(MEDIA_KEY)
		cache = raw ? (JSON.parse(raw) as MediaItem[]) : []
	} catch {
		cache = []
	}
	return cache
}

/** Throws when the quota is gone, so callers can roll the change back. */
export function writeMedia(items: MediaItem[]) {
	window.localStorage.setItem(MEDIA_KEY, JSON.stringify(items))
	cache = items
}

export const mediaRef = (id: string) => `${REF_PREFIX}${id}`

export const isMediaRef = (value: unknown): value is string =>
	typeof value === 'string' && value.startsWith(REF_PREFIX)

export const mediaIdOf = (ref: string) => ref.slice(REF_PREFIX.length)

// A signed-in site keeps its library in the database, so refs resolve from this
// index instead of localStorage. Null means "not signed in, use the browser copy".
let index: Map<string, string> | null = null

export function setMediaIndex(entries: { id: string; url: string }[] | null) {
	index = entries ? new Map(entries.map((item) => [item.id, item.url])) : null
}

/**
 * Refs become the stored image. Anything else is returned untouched, so blocks
 * authored before references existed keep rendering their inlined data URL.
 */
export function resolveMediaSrc(value: unknown) {
	if (!isMediaRef(value)) return value
	const id = mediaIdOf(value)
	if (index) return index.get(id)
	return readMedia().find((item) => item.id === id)?.src
}

export const isDataUrl = (value: unknown): value is string =>
	typeof value === 'string' && value.startsWith('data:')

/** UTF-16, because that is what the storage budget is actually counted in. */
export const storageBytes = (value: string) => value.length * 2

export function mediaUsage() {
	const items = readMedia()
	return {
		count: items.length,
		bytes: items.reduce((sum, item) => sum + storageBytes(item.src), 0),
	}
}

// Probing the real ceiling costs half a second and a 100 MB write, so headroom is
// measured up to a cap and reported as "at least this much".
const HEADROOM_CAP_MB = 20
let headroom: { freeBytes: number; atCap: boolean } | null = null

export function freeStorage(refresh = false) {
	if (typeof window === 'undefined') return { freeBytes: 0, atCap: false }
	if (headroom && !refresh) return headroom

	const KEY = '__rb_probe__'
	const unit = 512 * 1024 // one megabyte of UTF-16
	const fits = (units: number) => {
		if (units === 0) return true
		try {
			window.localStorage.setItem(KEY, 'z'.repeat(units * unit))
			return true
		} catch {
			return false
		}
	}

	let low = 0
	let high = HEADROOM_CAP_MB
	try {
		if (fits(high)) low = high
		else
			while (low + 1 < high) {
				const mid = (low + high) >> 1
				if (fits(mid)) low = mid
				else high = mid
			}
	} finally {
		// Must survive a throw, or a probe string is left occupying the budget.
		window.localStorage.removeItem(KEY)
	}

	headroom = { freeBytes: low * unit * 2, atCap: low === HEADROOM_CAP_MB }
	return headroom
}

export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
