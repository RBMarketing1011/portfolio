'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	defaultChrome,
	HOME_SLUG,
	slugify,
	uniqueSlug,
	type Page,
	type Site,
} from './page-schema'
import {
	cloneBlocks,
	createBlock,
	duplicateBlock,
	insertBlock,
	moveBlock,
	newId,
	removeBlock,
	updateBlock,
} from './block-ops'
import {
	driverFor,
	LOCAL_SITE_ID,
	StaleRevisionError,
	type SaveState,
} from './drivers'
import { isDataUrl, mediaRef, readMedia } from './media-store'
import type { MediaEntry } from './site-doc'
import type { Block } from './types'

const HISTORY_LIMIT = 50

const emptySite = (): Site => ({
	version: 1,
	chrome: { ...defaultChrome },
	pages: [],
})

/** The first page owns `/`; nothing else may claim it. */
function normalizeSlugs(site: Site): Site {
	if (site.pages.length === 0) return site
	const pages = site.pages.map((page, index) =>
		index === 0
			? page.slug === HOME_SLUG
				? page
				: { ...page, slug: HOME_SLUG }
			: page.slug === HOME_SLUG
				? { ...page, slug: slugify(page.name) }
				: page,
	)
	return pages.every((page, i) => page === site.pages[i])
		? site
		: { ...site, pages }
}

/**
 * Blocks used to inline the whole image, so one picture could sit in storage three
 * or four times over. Anything still matching a library entry becomes its reference.
 */
function dedupeMedia(site: Site, remote: MediaEntry[] = []): Site {
	const library = [
		...readMedia().map((item) => [item.src, item.id] as const),
		...remote.map((item) => [item.url, item.id] as const),
	]
	if (library.length === 0) return site
	const bySrc = new Map(library)
	let changed = false

	const walk = (value: unknown): unknown => {
		if (isDataUrl(value)) {
			const id = bySrc.get(value)
			if (!id) return value
			changed = true
			return mediaRef(id)
		}
		if (Array.isArray(value)) return value.map(walk)
		if (value && typeof value === 'object')
			return Object.fromEntries(
				Object.entries(value as Record<string, unknown>).map(([k, v]) => [
					k,
					walk(v),
				]),
			)
		return value
	}

	const next = walk(site) as Site
	return changed ? next : site
}

export function useBuilderStore(siteId: string = LOCAL_SITE_ID) {
	const [site, setSite] = useState<Site>(emptySite)
	const [pageId, setPageId] = useState<string | null>(null)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [hydrated, setHydrated] = useState(false)
	const [inspectorOpen, setInspectorOpen] = useState(true)
	const [saveError, setSaveError] = useState<string | null>(null)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [saveState, setSaveState] = useState<SaveState>('idle')
	const [siteName, setSiteName] = useState('My site')
	const [remoteMedia, setRemoteMedia] = useState<MediaEntry[]>([])
	const [remoteLook, setRemoteLook] = useState<Record<string, unknown> | null>(
		null,
	)

	const past = useRef<Site[]>([])
	const future = useRef<Site[]>([])
	const rev = useRef(0)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const pending = useRef<Site | null>(null)
	// The look is owned by the provider but shares the site's revision, so it is
	// staged here and written by the same flush.
	const lookRef = useRef<Record<string, unknown> | undefined>(undefined)

	const driver = useMemo(() => driverFor(siteId), [siteId])

	useEffect(() => {
		let live = true
		setHydrated(false)
		driver
			.load()
			.then((loaded) => {
				if (!live) return
				const next = loaded.site
					? dedupeMedia(normalizeSlugs(loaded.site), loaded.media)
					: emptySite()
				rev.current = loaded.rev
				setLoadError(null)
				setSiteName(loaded.name)
				setRemoteMedia(loaded.media)
				setRemoteLook(loaded.look)
				setSite(next)
				setPageId(next.pages[0]?.id ?? null)
				setHydrated(true)
			})
			.catch(() => {
				if (!live) return
				// Nothing may be edited against a site that did not load, or every save
				// fails against an id that does not exist.
				setLoadError(
					'This site could not be opened. It may have been deleted, or it belongs to another account.',
				)
				setHydrated(true)
			})
		return () => {
			live = false
		}
	}, [driver])

	const flush = useCallback(
		async (next: Site) => {
			setSaveState('saving')
			try {
				rev.current = await driver.save({
					site: next,
					look: lookRef.current,
					rev: rev.current,
				})
				setSaveError(null)
				setSaveState('saved')
			} catch (error) {
				setSaveState('error')
				setSaveError(
					error instanceof StaleRevisionError
						? error.message
						: driver.remote
							? 'Your changes could not be saved. They are still here — retry when you are back online.'
							: 'Your changes could not be saved: browser storage is full. Remove or re-upload a large image.',
				)
			}
		},
		[driver],
	)

	// Remote saves are debounced so a drag does not fire a request per frame.
	useEffect(() => {
		if (!hydrated || loadError) return
		pending.current = site
		if (!driver.remote) {
			void flush(site)
			return
		}
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => {
			if (pending.current) void flush(pending.current)
		}, 900)
		return () => {
			if (timer.current) clearTimeout(timer.current)
		}
	}, [site, hydrated, driver, flush])

	const retrySave = useCallback(() => {
		if (pending.current) void flush(pending.current)
	}, [flush])

	/** Stages the provider's look and rides the same debounced, revisioned save. */
	const stageLook = useCallback(
		(look: Record<string, unknown>) => {
			lookRef.current = look
			if (!hydrated) return
			const next = pending.current ?? site
			pending.current = next
			if (!driver.remote) {
				void flush(next)
				return
			}
			if (timer.current) clearTimeout(timer.current)
			timer.current = setTimeout(() => {
				if (pending.current) void flush(pending.current)
			}, 900)
		},
		[driver, flush, hydrated, site],
	)

	const mutate = useCallback((fn: (site: Site) => Site) => {
		setSite((current) => {
			past.current = [...past.current.slice(-HISTORY_LIMIT), current]
			future.current = []
			return normalizeSlugs(fn(current))
		})
	}, [])

	const page = useMemo(
		() => site.pages.find((p) => p.id === pageId) ?? null,
		[site.pages, pageId],
	)

	const patchPage = useCallback(
		(fn: (page: Page) => Page) => {
			mutate((current) => ({
				...current,
				pages: current.pages.map((p) =>
					p.id === pageId
						? { ...fn(p), updatedAt: new Date().toISOString() }
						: p,
				),
			}))
		},
		[mutate, pageId],
	)

	const patchBlocks = useCallback(
		(fn: (blocks: Block[]) => Block[]) => {
			patchPage((p) => ({ ...p, blocks: fn(p.blocks) }))
		},
		[patchPage],
	)

	const addPage = useCallback(
		(name: string, slug: string, blocks: Block[], inHeader = true) => {
			const now = new Date().toISOString()
			const id = newId('pg')
			mutate((current) => ({
				...current,
				pages: [
					...current.pages,
					{
						id,
						name: name.trim() || 'Untitled',
						slug: uniqueSlug(
							slug.trim().replace(/^\/+/, '') || slugify(name),
							current.pages.map((p) => p.slug),
						),
						inHeader,
						blocks: cloneBlocks(blocks),
						createdAt: now,
						updatedAt: now,
					},
				],
			}))
			setPageId(id)
			setSelectedId(null)
			return id
		},
		[mutate],
	)

	const removePage = useCallback(
		(id: string) => {
			mutate((current) => ({
				...current,
				pages: current.pages.filter((p) => p.id !== id),
			}))
			setPageId((current) => {
				if (current !== id) return current
				const remaining = site.pages.filter((p) => p.id !== id)
				return remaining[0]?.id ?? null
			})
			setSelectedId(null)
		},
		[mutate, site.pages],
	)

	const renamePage = useCallback(
		(id: string, patch: Partial<Pick<Page, 'name' | 'slug' | 'inHeader'>>) => {
			mutate((current) => ({
				...current,
				pages: current.pages.map((p) =>
					p.id === id
						? {
								...p,
								...patch,
								slug: uniqueSlug(
									(patch.slug ?? p.slug).replace(/^\/+/, '') ||
										slugify(patch.name ?? p.name),
									current.pages.filter((x) => x.id !== id).map((x) => x.slug),
								),
								updatedAt: new Date().toISOString(),
							}
						: p,
				),
			}))
		},
		[mutate],
	)

	const setChrome = useCallback(
		(patch: Partial<Site['chrome']>) => {
			mutate((current) => ({
				...current,
				chrome: { ...current.chrome, ...patch },
			}))
		},
		[mutate],
	)

	const addSection = useCallback(
		(type: string, afterId?: string | null) => {
			const block = createBlock(type)
			patchBlocks((blocks) => insertBlock(blocks, block, afterId))
			setSelectedId(block.id)
		},
		[patchBlocks],
	)

	const addChild = useCallback(
		(parentId: string, type: string) => {
			patchBlocks((blocks) =>
				updateBlock(blocks, parentId, (parent) => ({
					...parent,
					children: [...(parent.children ?? []), createBlock(type)],
				})),
			)
		},
		[patchBlocks],
	)

	const removeChild = useCallback(
		(parentId: string, childId: string) => {
			patchBlocks((blocks) =>
				updateBlock(blocks, parentId, (parent) => ({
					...parent,
					children: (parent.children ?? []).filter((c) => c.id !== childId),
				})),
			)
		},
		[patchBlocks],
	)

	const moveChild = useCallback(
		(parentId: string, from: number, to: number) => {
			patchBlocks((blocks) =>
				updateBlock(blocks, parentId, (parent) => {
					const children = [...(parent.children ?? [])]
					if (
						from < 0 ||
						to < 0 ||
						from >= children.length ||
						to >= children.length
					)
						return parent
					children.splice(to, 0, ...children.splice(from, 1))
					return { ...parent, children }
				}),
			)
		},
		[patchBlocks],
	)

	const duplicateChild = useCallback(
		(parentId: string, childId: string) => {
			patchBlocks((blocks) =>
				updateBlock(blocks, parentId, (parent) => {
					const children = parent.children ?? []
					const index = children.findIndex((c) => c.id === childId)
					if (index === -1) return parent
					const copy = cloneBlocks([children[index]])[0]
					return {
						...parent,
						children: [
							...children.slice(0, index + 1),
							copy,
							...children.slice(index + 1),
						],
					}
				}),
			)
		},
		[patchBlocks],
	)

	// A collection holds one kind of item, so the type and variant are set for the
	// whole set rather than per child.
	const setChildrenType = useCallback(
		(parentId: string, type: string) => {
			patchBlocks((blocks) =>
				updateBlock(blocks, parentId, (parent) => ({
					...parent,
					children: (parent.children ?? []).map((child) =>
						child.type === type
							? child
							: { ...createBlock(type), id: child.id },
					),
				})),
			)
		},
		[patchBlocks],
	)

	const setChildrenVariant = useCallback(
		(parentId: string, variant: string) => {
			patchBlocks((blocks) =>
				updateBlock(blocks, parentId, (parent) => ({
					...parent,
					children: (parent.children ?? []).map((child) => ({
						...child,
						variant,
					})),
				})),
			)
		},
		[patchBlocks],
	)

	const undo = useCallback(() => {
		const previous = past.current.pop()
		if (!previous) return
		setSite((current) => {
			future.current = [...future.current, current]
			return previous
		})
	}, [])

	const redo = useCallback(() => {
		const next = future.current.pop()
		if (!next) return
		setSite((current) => {
			past.current = [...past.current, current]
			return next
		})
	}, [])

	return {
		hydrated,
		saveError,
		loadError,
		saveState,
		retrySave,
		stageLook,
		siteId,
		siteName,
		remote: driver.remote,
		remoteMedia,
		remoteLook,
		inspectorOpen,
		setInspectorOpen,
		site,
		pages: site.pages,
		chrome: site.chrome,
		setChrome,
		page,
		pageId,
		selectedId,
		setPageId,
		setSelectedId,
		addPage,
		removePage,
		renamePage,
		addSection,
		addChild,
		removeChild,
		moveChild,
		duplicateChild,
		setChildrenType,
		setChildrenVariant,
		removeSection: (id: string) => {
			patchBlocks((blocks) => removeBlock(blocks, id))
			setSelectedId((current) => (current === id ? null : current))
		},
		duplicateSection: (id: string) =>
			patchBlocks((blocks) => duplicateBlock(blocks, id)),
		moveSection: (from: number, to: number) =>
			patchBlocks((blocks) => moveBlock(blocks, from, to)),
		setVariant: (id: string, variant: string) =>
			patchBlocks((blocks) =>
				updateBlock(blocks, id, (block) => ({ ...block, variant })),
			),
		setProp: (id: string, key: string, value: unknown) =>
			patchBlocks((blocks) =>
				updateBlock(blocks, id, (block) => {
					const props = { ...(block.props ?? {}) }
					if (value === undefined || value === '') delete props[key]
					else props[key] = value
					return { ...block, props }
				}),
			),
		replaceBlocks: (blocks: Block[]) => patchBlocks(() => blocks),
		undo,
		redo,
		canUndo: past.current.length > 0,
		canRedo: future.current.length > 0,
	}
}

export type BuilderStore = ReturnType<typeof useBuilderStore>
