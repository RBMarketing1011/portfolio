/**
 * The account media library as the builder sees it for one site: its folders, the folder
 * that holds this site's content (photos, the logo, the favicon), and the images in it.
 * The AI builder plans from that folder, and the builder's pickers open on it.
 *
 * Client safe: types and pure helpers only.
 */
import type { MediaFolderDTO, MediaKind } from '@/lib/media/types'

/** A library folder, with how many images sit in it and beneath it. */
export type LibraryFolder = Pick<MediaFolderDTO, 'id' | 'parentId' | 'name' | 'path' | 'depth' | 'count' | 'total'>

/** One analysed image of the account library. */
export type LibraryImage = {
	id: string
	name: string
	url: string
	width: number
	height: number
	kind: MediaKind | null
	hasAlpha: boolean
	/** A tiny placeholder data URL, when one could be made. */
	blur: string | null
	caption: string
	/** `Clients/Acme/Logos`; empty at the library root. */
	folderPath: string
}

/** GET /api/sites/:siteId/library */
export type SiteLibraryResponse = {
	/** The folder holding this site's content; null when none is chosen (or it was deleted). */
	folderId: string | null
	folders: LibraryFolder[]
	/** Images in the whole library. */
	total: number
}

/** GET /api/sites/:siteId/library?folder=<id> */
export type LibraryImagesResponse = {
	folderId: string
	/** The folder's images and its subfolders', newest first. */
	images: LibraryImage[]
	/** The folder holds more than were returned. */
	truncated: boolean
}

/** How many images one folder listing returns at most. */
export const LIBRARY_IMAGES_MAX = 200

/**
 * A small rendition of a Blob image through the app's image optimizer (next.config allows
 * the Blob hosts), so a grid of originals never downloads the originals.
 */
export const thumbSrc = (url: string, width: 128 | 256 | 384 = 256) =>
	/^https:\/\//i.test(url) ? `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75` : url

const LOGO_NAME = /logo/i
const NOT_LOGO_NAME = /catalog/i
const ICON_NAME = /fav.?icon|site.?icon|app.?icon|touch.?icon|^icon\b/i

const isSquarish = (image: Pick<LibraryImage, 'width' | 'height'>) =>
	image.width > 0 && image.height > 0 && image.width / image.height >= 0.8 && image.width / image.height <= 1.25

const looksLikeIcon = (image: LibraryImage) => ICON_NAME.test(image.name)

/**
 * The image in a folder most likely to be the business's logo: one the library marked as
 * a logo or one named as a logo, preferring a transparent, wide mark (it fits a header)
 * over a favicon-shaped one. Null when nothing looks like a logo.
 */
export function findLogo(images: LibraryImage[]): LibraryImage | null {
	let best: { image: LibraryImage; score: number } | null = null
	for (const image of images) {
		const named = LOGO_NAME.test(image.name) && !NOT_LOGO_NAME.test(image.name)
		if (image.kind !== 'logo' && !named) continue
		let score = (image.kind === 'logo' ? 4 : 0) + (named ? 3 : 0)
		if (looksLikeIcon(image)) score -= 3
		if (image.hasAlpha) score += 1
		if (image.width >= image.height * 1.5) score += 1
		if (score > 0 && (!best || score > best.score)) best = { image, score }
	}
	return best?.image ?? null
}

/** The image in a folder most likely to be the favicon: named as one, or a square icon. Never `except`. */
export function findFavicon(images: LibraryImage[], except?: string | null): LibraryImage | null {
	let best: { image: LibraryImage; score: number } | null = null
	for (const image of images) {
		if (image.url === except) continue
		const named = looksLikeIcon(image)
		const icon = image.kind === 'icon' && isSquarish(image)
		if (!named && !icon) continue
		const score = (named ? 3 : 0) + (icon ? 2 : 0) + (isSquarish(image) ? 1 : 0) + (image.hasAlpha ? 1 : 0)
		if (!best || score > best.score) best = { image, score }
	}
	return best?.image ?? null
}

/**
 * The images a build may place as photos: everything but logos, icons, patterns (as the
 * library classified them or as they are named) and the site's own brand marks.
 */
export function photoCandidates(images: LibraryImage[], brandUrls: (string | null | undefined)[]): LibraryImage[] {
	const brand = new Set(brandUrls.filter((url): url is string => Boolean(url)))
	return images.filter(
		(image) =>
			!brand.has(image.url) &&
			image.kind !== 'logo' &&
			image.kind !== 'icon' &&
			image.kind !== 'pattern' &&
			!(LOGO_NAME.test(image.name) && !NOT_LOGO_NAME.test(image.name)) &&
			!looksLikeIcon(image),
	)
}
