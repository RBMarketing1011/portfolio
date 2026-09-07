'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	defaultChrome,
	HOME_SLUG,
	siteSchema,
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
import type { Block } from './types'

const STORAGE_KEY = 'reynoldsbuilt.builder.v1'
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

function load(): Site {
	if (typeof window === 'undefined') return emptySite()
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return emptySite()
		const parsed = siteSchema.safeParse(JSON.parse(raw))
		return parsed.success ? normalizeSlugs(parsed.data) : emptySite()
	} catch {
		return emptySite()
	}
}

function save(site: Site) {
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(site))
		return null
	} catch {
		// Almost always the quota, and almost always an uploaded image filled it.
		return 'Your changes could not be saved: browser storage is full. Remove or re-upload a large image.'
	}
}

export function useBuilderStore() {
	const [site, setSite] = useState<Site>(emptySite)
	const [pageId, setPageId] = useState<string | null>(null)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [hydrated, setHydrated] = useState(false)
	const [inspectorOpen, setInspectorOpen] = useState(true)
	const [saveError, setSaveError] = useState<string | null>(null)

	const past = useRef<Site[]>([])
	const future = useRef<Site[]>([])

	useEffect(() => {
		const loaded = load()
		setSite(loaded)
		setPageId(loaded.pages[0]?.id ?? null)
		setHydrated(true)
	}, [])

	useEffect(() => {
		if (hydrated) setSaveError(save(site))
	}, [site, hydrated])

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
