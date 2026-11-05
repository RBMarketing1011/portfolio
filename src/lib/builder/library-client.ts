'use client'

/**
 * The browser's calls for one site's media library and brand: the folders, a folder's
 * images, the site's content folder, and the brand (logo, its size and plate, favicon).
 * Every call throws an Error whose message can be shown as it is.
 */
import type { LibraryImagesResponse, SiteLibraryResponse } from './library'
import { readSiteProfile, type SiteProfile } from './site-profile'

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const siteUrl = (siteId: string, rest: string) => `/api/sites/${encodeURIComponent(siteId)}/${rest}`

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
	let response: Response
	try {
		response = await fetch(url, { cache: 'no-store', ...init })
	} catch {
		throw new Error(init.signal?.aborted ? 'Stopped.' : "You're offline. Try again when you're back.")
	}
	const body = (await response.json().catch(() => null)) as { error?: unknown } | null
	if (!response.ok)
		throw new Error(typeof body?.error === 'string' ? body.error : 'Something went wrong. Try again.')
	return body as T
}

/** The account library's folders and the one holding this site's content. */
export const fetchSiteLibrary = (siteId: string, signal?: AbortSignal) =>
	call<SiteLibraryResponse>(siteUrl(siteId, 'library'), { signal })

/** A folder's images and its subfolders', newest first. */
export const fetchFolderImages = (siteId: string, folderId: string, signal?: AbortSignal) =>
	call<LibraryImagesResponse>(siteUrl(siteId, `library?folder=${encodeURIComponent(folderId)}`), { signal })

/** Makes a folder (or none) the one holding this site's content. */
export async function saveSiteFolder(siteId: string, folderId: string | null): Promise<string | null> {
	const body = await call<{ folderId: string | null }>(siteUrl(siteId, 'library'), {
		method: 'PUT',
		headers: JSON_HEADERS,
		body: JSON.stringify({ folderId }),
	})
	return body.folderId
}

/** Changes only the brand; resolves to the whole profile as stored now. */
export async function saveSiteBrand(siteId: string, brand: Partial<SiteProfile['brand']>): Promise<SiteProfile> {
	const body = await call<{ profile: unknown }>(siteUrl(siteId, 'profile'), {
		method: 'PATCH',
		headers: JSON_HEADERS,
		body: JSON.stringify({ brand }),
	})
	return readSiteProfile(body.profile)
}
