'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
	defaultBackground,
	type BackgroundSettings,
} from '@/app/sections/background-settings'
import {
	defaultSettings,
	type ThemeSettings,
} from '@/app/sections/theme-settings'
import { useBuilderStore, type BuilderStore } from './store'

const LOOK_KEY = 'reynoldsbuilt.builder.look.v1'
// Kept out of the look and the site so a big library cannot take either down with it.
const MEDIA_KEY = 'reynoldsbuilt.builder.media.v1'

export type MediaItem = {
	id: string
	name: string
	src: string
	addedAt: string
}

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
	header: defaultBackground,
	footer: defaultBackground,
	blocks: {},
})

export type BuilderContextValue = BuilderStore & {
	look: BuilderLook
	setLook: (patch: Partial<BuilderLook>) => void
	setBlockLook: (id: string, value: BackgroundSettings) => void
	/** Only images the user uploaded; the builder never offers repo assets. */
	media: MediaItem[]
	addMedia: (name: string, src: string) => MediaItem
	removeMedia: (id: string) => void
	mediaError: string | null
}

const BuilderContext = createContext<BuilderContextValue | null>(null)

export function BuilderProvider({ children }: { children: React.ReactNode }) {
	const store = useBuilderStore()
	const [look, setLookState] = useState<BuilderLook>(defaultLook)
	const [media, setMedia] = useState<MediaItem[]>([])
	const [mediaError, setMediaError] = useState<string | null>(null)
	const [loaded, setLoaded] = useState(false)

	useEffect(() => {
		try {
			const raw = window.localStorage.getItem(LOOK_KEY)
			if (raw) setLookState({ ...defaultLook(), ...JSON.parse(raw) })
		} catch {
			// Unreadable settings just fall back to the defaults.
		}
		try {
			const raw = window.localStorage.getItem(MEDIA_KEY)
			if (raw) setMedia(JSON.parse(raw))
		} catch {
			// An unreadable library starts empty rather than blocking the builder.
		}
		setLoaded(true)
	}, [])

	useEffect(() => {
		if (!loaded) return
		try {
			window.localStorage.setItem(LOOK_KEY, JSON.stringify(look))
		} catch {
			// Quota or private mode: the session keeps working, it just will not persist.
		}
	}, [look, loaded])

	const setLook = (patch: Partial<BuilderLook>) =>
		setLookState((current) => ({ ...current, ...patch }))

	const setBlockLook = (id: string, value: BackgroundSettings) =>
		setLookState((current) => ({
			...current,
			blocks: { ...current.blocks, [id]: value },
		}))

	const persist = (next: MediaItem[]) => {
		try {
			window.localStorage.setItem(MEDIA_KEY, JSON.stringify(next))
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

	const removeMedia = (id: string) => {
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
