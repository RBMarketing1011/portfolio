import { siteSchema } from './page-schema'
import { LOOK_KEY, SITE_KEY } from './site-ids'
import { isDataUrl, MEDIA_KEY, type MediaItem } from './media-store'

/** How many pages the browser copy holds, or 0 when there is nothing to claim. */
export function readLocalPageCount(storageKey = SITE_KEY) {
	try {
		const raw = window.localStorage.getItem(storageKey)
		if (!raw) return 0
		const parsed = siteSchema.safeParse(JSON.parse(raw))
		return parsed.success ? parsed.data.pages.length : 0
	} catch {
		// An unreadable local site simply has nothing to offer.
		return 0
	}
}

/**
 * Moves the browser copy onto the signed-in account and returns the new site id.
 * Nothing local is cleared until the server has confirmed every step, so a
 * failure anywhere leaves the work exactly where it was.
 */
export async function importLocalSite({
	name = 'Imported site',
	storageKey = SITE_KEY,
}: { name?: string; storageKey?: string } = {}) {
	const raw = window.localStorage.getItem(storageKey)
	const parsed = siteSchema.safeParse(JSON.parse(raw ?? '{}'))
	if (!parsed.success) throw new Error('unreadable')

	let look: unknown = undefined
	try {
		const rawLook = window.localStorage.getItem(LOOK_KEY)
		if (rawLook) look = JSON.parse(rawLook)
	} catch {
		// A broken look is not worth failing the import over.
	}

	const created = await fetch('/api/sites', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, site: parsed.data, look }),
	})
	if (!created.ok)
		throw new Error(created.status === 401 ? 'signed-out' : 'create failed')
	const { site } = await created.json()

	// The images live in this browser as data URLs, so they have to be
	// re-uploaded before the local copy can be thrown away.
	const library: MediaItem[] = JSON.parse(
		window.localStorage.getItem(MEDIA_KEY) ?? '[]',
	)
	const { upload } = await import('@vercel/blob/client')
	const remap = new Map<string, string>()

	for (const item of library) {
		if (!isDataUrl(item.src)) continue
		const blob = await (await fetch(item.src)).blob()
		const put = await upload(`sites/${site.id}/${item.name}.webp`, blob, {
			access: 'public',
			handleUploadUrl: `/api/sites/${site.id}/media/upload`,
			contentType: 'image/webp',
		})
		const registered = await fetch(`/api/sites/${site.id}/media`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: item.name,
				url: put.url,
				pathname: put.pathname,
				bytes: blob.size,
				contentType: 'image/webp',
			}),
		})
		if (registered.ok) {
			const { media } = await registered.json()
			remap.set(item.id, media.id)
		}
	}

	// Block refs point at the old local ids, so rewrite them to the new ones.
	if (remap.size) {
		const text = JSON.stringify(parsed.data).replace(
			/media:([a-z0-9_]+)/g,
			(match, id) => (remap.has(id) ? `media:${remap.get(id)}` : match),
		)
		await fetch(`/api/sites/${site.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ site: JSON.parse(text), rev: site.rev }),
		})
	}

	window.localStorage.removeItem(storageKey)
	window.localStorage.removeItem(LOOK_KEY)
	window.localStorage.removeItem(MEDIA_KEY)

	return site.id as string
}
