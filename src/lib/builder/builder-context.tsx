'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
	defaultBackground,
	globalBackground,
	type BackgroundSettings,
} from '@/app/builder/background-settings'
import {
	defaultSettings,
	type ThemeSettings,
} from '@/app/builder/theme-settings'
import { LOCAL_SITE_ID } from './drivers'
import {
	invalidateMedia,
	readMedia,
	setMediaIndex,
	writeMedia,
	type MediaItem,
} from './media-store'
import { useBuilderStore, type BuilderStore } from './store'

const LOOK_KEY = 'reynoldsbuilt.builder.look.v1'

export type { MediaItem }

/** The site chrome carries its own surface, separate from the page surface. */
export type BuilderLook = {
	theme: ThemeSettings
	page: BackgroundSettings
	header: BackgroundSettings
	footer: BackgroundSettings
	/** Per-block surfaces, keyed by block id. */
	blocks: Record<string, BackgroundSettings>
}

const defaultLook = (): BuilderLook => ({
	theme: defaultSettings,
	page: defaultBackground,
	// Chrome carries no surface of its own until it is deliberately given one.
	header: globalBackground,
	footer: globalBackground,
	blocks: {},
})

// A saved look predates any setting added since, so every nested object is filled in
// rather than spread wholesale — a missing glow would otherwise throw when painted.
function mergeBackground(
	value: unknown,
	fallback: BackgroundSettings = defaultBackground,
): BackgroundSettings {
	const saved = (value ?? {}) as Partial<BackgroundSettings>
	return {
		...fallback,
		...saved,
		page: { ...fallback.page, ...saved.page },
		menu: { ...fallback.menu, ...saved.menu },
		panelGlow: { ...fallback.panelGlow, ...saved.panelGlow },
		featureGlow: { ...fallback.featureGlow, ...saved.featureGlow },
	}
}

export function mergeLook(value: unknown): BuilderLook {
	const saved = (value ?? {}) as Partial<BuilderLook>
	return {
		theme: { ...defaultSettings, ...saved.theme },
		page: mergeBackground(saved.page),
		header: mergeBackground(saved.header, globalBackground),
		footer: mergeBackground(saved.footer, globalBackground),
		blocks: Object.fromEntries(
			Object.entries(saved.blocks ?? {}).map(([id, surface]) => [
				id,
				mergeBackground(surface),
			]),
		),
	}
}

/** For surfaces that only render the built site and never edit it. */
export function readLook(): BuilderLook {
	try {
		const raw = window.localStorage.getItem(LOOK_KEY)
		return raw ? mergeLook(JSON.parse(raw)) : defaultLook()
	} catch {
		return defaultLook()
	}
}

export type BuilderContextValue = BuilderStore & {
	look: BuilderLook
	setLook: (patch: Partial<BuilderLook>) => void
	setBlockLook: (id: string, value: BackgroundSettings) => void
	/** Only images the user uploaded; the builder never offers repo assets. */
	media: MediaItem[]
	addMedia: (name: string, src: string) => MediaItem
	/** Signed-in uploads go to Blob; throws with 'local' when there is no account. */
	uploadMedia: (name: string, file: Blob) => Promise<MediaItem>
	removeMedia: (id: string) => void
	mediaError: string | null
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
	const [look, setLookState] = useState<BuilderLook>(defaultLook)
	const [media, setMedia] = useState<MediaItem[]>([])
	const [mediaError, setMediaError] = useState<string | null>(null)
	const [loaded, setLoaded] = useState(false)
	const remote = store.remote

	useEffect(() => {
		if (remote) return
		try {
			const raw = window.localStorage.getItem(LOOK_KEY)
			if (raw) setLookState(mergeLook(JSON.parse(raw)))
		} catch {
			// Unreadable settings just fall back to the defaults.
		}
		try {
			invalidateMedia()
			setMedia(readMedia())
		} catch {
			// An unreadable library starts empty rather than blocking the builder.
		}
		setLoaded(true)
	}, [remote])

	// A signed-in site carries its own look and library, so they arrive with the load.
	useEffect(() => {
		if (!remote || !store.hydrated) return
		setLookState(mergeLook(store.remoteLook ?? {}))
		setMediaIndex(store.remoteMedia)
		setMedia(
			store.remoteMedia.map((item) => ({
				id: item.id,
				name: item.name,
				src: item.url,
				addedAt: item.addedAt,
			})),
		)
		setLoaded(true)
	}, [remote, store.hydrated, store.remoteLook, store.remoteMedia])

	// Uploads and deletes move the library, so the index has to follow.
	useEffect(() => {
		if (!remote) return
		setMediaIndex(media.map((item) => ({ id: item.id, url: item.src })))
	}, [remote, media])

	useEffect(() => {
		if (!loaded || remote) return
		try {
			window.localStorage.setItem(LOOK_KEY, JSON.stringify(look))
		} catch {
			// Quota or private mode: the session keeps working, it just will not persist.
		}
	}, [look, loaded, remote])

	// Remote looks ride along with the site's own debounced, revisioned save.
	useEffect(() => {
		if (!loaded || !remote || !store.hydrated) return
		store.stageLook(look as unknown as Record<string, unknown>)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [look, loaded, remote, store.hydrated])

	const setLook = (patch: Partial<BuilderLook>) =>
		setLookState((current) => ({ ...current, ...patch }))

	const setBlockLook = (id: string, value: BackgroundSettings) =>
		setLookState((current) => ({
			...current,
			blocks: { ...current.blocks, [id]: value },
		}))

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
	const uploadMedia = async (name: string, file: Blob) => {
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
			}),
		})
		if (!response.ok) throw new Error('Could not save that image.')
		const { media: entry } = await response.json()

		const item: MediaItem = {
			id: entry.id,
			name: entry.name,
			src: entry.url,
			addedAt: entry.addedAt,
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
				look,
				setLook,
				setBlockLook,
				media,
				addMedia,
				uploadMedia,
				removeMedia,
				mediaError,
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
