'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { LOCAL_SITE_ID, LOOK_KEY } from './drivers'
import type { LibraryFolder, LibraryImagesResponse } from './library'
import { fetchFolderImages, fetchSiteLibrary, saveSiteBrand, saveSiteFolder } from './library-client'
import { defaultLook, mergeLook, sanitizeLook, type BuilderLook } from './look'
import {
	invalidateMedia,
	readMedia,
	setMediaIndex,
	writeMedia,
	type MediaItem,
} from './media-store'
import type { SiteProfile } from './site-profile'
import { useBuilderStore, type BuilderStore } from './store'

export type { MediaItem }

// The look model lives in look.ts; these names stay here for existing importers.
export type { BuilderLook }
export { defaultLook, mergeLook }

/** An uploaded image, with its pixel size when the upload knew it. */
export type UploadedMedia = MediaItem & { width?: number; height?: number }

/**
 * The account media library as this site sees it. Signed-in sites only; it loads the
 * first time something asks for it (`loadLibrary`).
 */
export type SiteLibrary = {
	/** Null until loaded, and always for a browser-only site. */
	folders: LibraryFolder[] | null
	/** The folder holding this site's content (photos, logo, favicon). */
	folderId: string | null
	/** Images in the whole library. */
	total: number
	loading: boolean
	error: string | null
}

/** For surfaces that only render the built site and never edit it. */
export function readLook(): BuilderLook {
	try {
		const raw = window.localStorage.getItem(LOOK_KEY)
		return raw ? sanitizeLook(JSON.parse(raw)) : defaultLook()
	} catch {
		return defaultLook()
	}
}

/** The store (site, look, history, saving) plus the media library around it. */
export type BuilderContextValue = BuilderStore & {
	/** Only images the user uploaded; the builder never offers repo assets. */
	media: MediaItem[]
	addMedia: (name: string, src: string) => MediaItem
	/**
	 * Signed-in uploads go to Blob; throws with 'local' when there is no account. The
	 * size, when given, is stored with the entry so the AI can place the photo by shape.
	 */
	uploadMedia: (
		name: string,
		file: Blob,
		size?: { width: number; height: number },
	) => Promise<UploadedMedia>
	removeMedia: (id: string) => void
	mediaError: string | null
	library: SiteLibrary
	/** Loads the folders once (again with `force`). A browser-only site has none. */
	loadLibrary: (force?: boolean) => void
	/** A folder's images, fetched once per tab unless `refresh`. */
	folderImages: (folderId: string, refresh?: boolean) => Promise<LibraryImagesResponse>
	/** Saves the folder that holds this site's content; throws with a message to show. */
	setLibraryFolder: (folderId: string | null) => Promise<void>
	/** Saves brand fields (logo, its size and plate, favicon); throws with a message to show. */
	saveBrand: (brand: Partial<SiteProfile['brand']>) => Promise<SiteProfile>
	/**
	 * A block the canvas should scroll to and flash once it shows the page that holds it
	 * (asked for before a navigation, so the canvas may not be mounted yet).
	 */
	scrollTarget: string | null
	showBlock: (id: string) => void
	clearScrollTarget: () => void
}

const BuilderContext = createContext<BuilderContextValue | null>(null)

export function BuilderProvider({
	siteId = LOCAL_SITE_ID,
	children,
}: {
	siteId?: string
	children: React.ReactNode
}) {
	const store = useBuilderStore(siteId)
	const [media, setMedia] = useState<MediaItem[]>([])
	const [mediaError, setMediaError] = useState<string | null>(null)
	const [scrollTarget, setScrollTarget] = useState<string | null>(null)
	const clearScrollTarget = useCallback(() => setScrollTarget(null), [])
	const remote = store.remote
	const [library, setLibrary] = useState<SiteLibrary>({
		folders: null,
		folderId: null,
		total: 0,
		loading: false,
		error: null,
	})
	const libraryAsked = useRef(false)
	const folderCache = useRef(new Map<string, Promise<LibraryImagesResponse>>())
	const { setProfile } = store
	const siteRef = useRef(siteId)
	siteRef.current = siteId

	// Another site's library is another account's.
	useEffect(() => {
		libraryAsked.current = false
		folderCache.current = new Map()
		setLibrary({ folders: null, folderId: null, total: 0, loading: false, error: null })
	}, [siteId])

	const loadLibrary = useCallback(
		(force = false) => {
			if (!remote || (libraryAsked.current && !force)) return
			libraryAsked.current = true
			if (force) folderCache.current = new Map()
			setLibrary((current) => ({ ...current, loading: true, error: null }))
			fetchSiteLibrary(siteId).then(
				(body) => {
					if (siteRef.current !== siteId) return
					setLibrary({ folders: body.folders, folderId: body.folderId, total: body.total, loading: false, error: null })
				},
				(error: Error) => {
					if (siteRef.current !== siteId) return
					// Asked again next time, rather than stuck on one failed load.
					libraryAsked.current = false
					setLibrary((current) => ({ ...current, loading: false, error: error.message }))
				},
			)
		},
		[remote, siteId],
	)

	// The content folder decides where the pickers open, so it loads with the site.
	useEffect(() => {
		if (remote && store.hydrated) loadLibrary()
	}, [remote, store.hydrated, loadLibrary])

	const folderImages = useCallback(
		(folderId: string, refresh = false) => {
			const cached = folderCache.current.get(folderId)
			if (cached && !refresh) return cached
			const asked = fetchFolderImages(siteId, folderId)
			folderCache.current.set(folderId, asked)
			asked.catch(() => {
				if (folderCache.current.get(folderId) === asked) folderCache.current.delete(folderId)
			})
			return asked
		},
		[siteId],
	)

	const libraryFolderRef = useRef(library.folderId)
	libraryFolderRef.current = library.folderId
	const setLibraryFolder = useCallback(
		async (folderId: string | null) => {
			const before = libraryFolderRef.current
			setLibrary((current) => ({ ...current, folderId }))
			try {
				await saveSiteFolder(siteId, folderId)
			} catch (error) {
				setLibrary((current) => (current.folderId === folderId ? { ...current, folderId: before } : current))
				throw error
			}
		},
		[siteId],
	)

	const saveBrand = useCallback(
		async (brand: Partial<SiteProfile['brand']>) => {
			if (!remote) throw new Error('Sign in and save this site to give it a logo.')
			const saved = await saveSiteBrand(siteId, brand)
			setProfile(saved)
			return saved
		},
		[remote, siteId, setProfile],
	)

	useEffect(() => {
		if (remote) return
		try {
			invalidateMedia()
			setMedia(readMedia())
		} catch {
			// An unreadable library starts empty rather than blocking the builder.
		}
	}, [remote])

	// A signed-in site carries its own library, so it arrives with the load.
	useEffect(() => {
		if (!remote || !store.hydrated) return
		setMediaIndex(store.remoteMedia)
		setMedia(
			store.remoteMedia.map((item) => ({
				id: item.id,
				name: item.name,
				src: item.url,
				addedAt: item.addedAt,
			})),
		)
	}, [remote, store.hydrated, store.remoteMedia])

	// Uploads and deletes move the library, so the index has to follow.
	useEffect(() => {
		if (!remote) return
		setMediaIndex(media.map((item) => ({ id: item.id, url: item.src })))
	}, [remote, media])

	const persist = (next: MediaItem[]) => {
		try {
			writeMedia(next)
			setMediaError(null)
			return true
		} catch {
			setMediaError(
				'Browser storage is full. Delete an image from the library and try again.',
			)
			return false
		}
	}

	// Updates go through the functional form so uploading several files in a loop
	// does not have each call overwrite the last from a stale closure.
	const addMedia = (name: string, src: string) => {
		const item: MediaItem = {
			id: `md_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
			name,
			src,
			addedAt: new Date().toISOString(),
		}
		setMedia((current) => {
			const next = [item, ...current]
			return persist(next) ? next : current
		})
		return item
	}

	/** Signed in, the file goes straight to Blob and only its URL comes back. */
	const uploadMedia = async (
		name: string,
		file: Blob,
		size?: { width: number; height: number },
	) => {
		if (!remote) throw new Error('local')
		const { upload } = await import('@vercel/blob/client')
		const blob = await upload(`sites/${siteId}/${name}.webp`, file, {
			access: 'public',
			handleUploadUrl: `/api/sites/${siteId}/media/upload`,
			contentType: 'image/webp',
		})

		const response = await fetch(`/api/sites/${siteId}/media`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name,
				url: blob.url,
				pathname: blob.pathname,
				bytes: file.size,
				contentType: 'image/webp',
				...(size ? { width: size.width, height: size.height } : {}),
			}),
		})
		if (!response.ok) throw new Error('Could not save that image.')
		const { media: entry } = await response.json()

		const item: UploadedMedia = {
			id: entry.id,
			name: entry.name,
			src: entry.url,
			addedAt: entry.addedAt,
			...(size ? { width: size.width, height: size.height } : {}),
		}
		setMedia((current) => [item, ...current])
		setMediaError(null)
		return item
	}

	const removeMedia = (id: string) => {
		if (remote) {
			setMedia((current) => current.filter((m) => m.id !== id))
			void fetch(`/api/sites/${siteId}/media?id=${encodeURIComponent(id)}`, {
				method: 'DELETE',
			}).catch(() => {})
			return
		}
		setMedia((current) => {
			const next = current.filter((m) => m.id !== id)
			return persist(next) ? next : current
		})
	}

	return (
		<BuilderContext.Provider
			value={{
				...store,
				media,
				addMedia,
				uploadMedia,
				removeMedia,
				mediaError,
				library,
				loadLibrary,
				folderImages,
				setLibraryFolder,
				saveBrand,
				scrollTarget,
				showBlock: setScrollTarget,
				clearScrollTarget,
			}}>
			{children}
		</BuilderContext.Provider>
	)
}

export function useBuilder() {
	const store = useContext(BuilderContext)
	if (!store)
		throw new Error('useBuilder must be used inside a BuilderProvider')
	return store
}
