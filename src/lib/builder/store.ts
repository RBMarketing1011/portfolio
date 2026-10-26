'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BackgroundSettings } from '@/app/builder/background-settings'
import type { LandingPayload } from './ai/contract'
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
	findBlock,
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
import {
	commit,
	initialHistory,
	redo as redoStep,
	undo as undoStep,
	type History,
	type Snapshot,
} from './history'
import { landAiResult, pruneSlug, rewriteHrefs, type LandSummary } from './land'
import { sanitizeLook, type BuilderLook } from './look'
import { isDataUrl, mediaRef, readMedia } from './media-store'
import { brandFromProfile, type SiteProfile } from './site-profile'
import type { MediaEntry } from './site-doc'
import type { Block } from './types'

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

/** Every slug a step changed, by page id, so links can follow the pages they point at. */
function slugChanges(before: Site, after: Site) {
	const renamed: Record<string, string> = {}
	const was = new Map(before.pages.map((page) => [page.id, page.slug]))
	for (const page of after.pages) {
		const slug = was.get(page.id)
		if (slug !== undefined && slug !== page.slug) renamed[slug] = page.slug
	}
	return renamed
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
	// The history lives in a ref and is changed outside any state updater (StrictMode
	// runs updaters twice); the present snapshot is state, so every change renders.
	const history = useRef<History>(initialHistory)
	const [present, setPresent] = useState<Snapshot>(initialHistory.present)
	const [pageId, setPageId] = useState<string | null>(null)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [hydrated, setHydrated] = useState(false)
	const [inspectorOpen, setInspectorOpen] = useState(true)
	const [saveError, setSaveError] = useState<string | null>(null)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [saveState, setSaveState] = useState<SaveState>('idle')
	const [siteName, setSiteName] = useState('My site')
	const [remoteMedia, setRemoteMedia] = useState<MediaEntry[]>([])
	const [profile, setProfile] = useState<SiteProfile | null>(null)

	const site = present.site
	const look = present.look

	const rev = useRef(0)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
	/** The newest snapshot not yet saved. */
	const pending = useRef<Snapshot | null>(null)
	const inFlight = useRef(false)
	/** The snapshot that was loaded, until the first change: opening a site saves nothing. */
	const loaded = useRef<Snapshot | null>(null)
	/** The next save skips the debounce (a landing is large and already marked landed). */
	const saveNow = useRef(false)
	/** One number per snapshot the history has held, so a mark can tell "still this step". */
	const marks = useRef(new WeakMap<Snapshot, number>())
	const nextMark = useRef(0)

	const driver = useMemo(() => driverFor(siteId), [siteId])

	useEffect(() => {
		let live = true
		setHydrated(false)
		driver
			.load()
			.then((result) => {
				if (!live) return
				const snapshot: Snapshot = {
					site: result.site
						? dedupeMedia(normalizeSlugs(result.site), result.media)
						: emptySite(),
					look: sanitizeLook(result.look),
				}
				history.current = { ...initialHistory, present: snapshot }
				loaded.current = snapshot
				pending.current = null
				rev.current = result.rev
				setLoadError(null)
				setSiteName(result.name)
				setRemoteMedia(result.media)
				setProfile(result.profile)
				setPresent(snapshot)
				setPageId(snapshot.site.pages[0]?.id ?? null)
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

	// One save at a time: a second debounced save that started before the first returned
	// would send the same revision and be refused as a conflict.
	const flush = useCallback(async () => {
		if (inFlight.current) return
		const snap = pending.current
		if (!snap) return
		inFlight.current = true
		setSaveState('saving')
		try {
			rev.current = await driver.save({
				site: snap.site,
				look: snap.look,
				rev: rev.current,
			})
			if (pending.current === snap) pending.current = null
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
		} finally {
			inFlight.current = false
			// A newer change arrived while this one was saving. A failed save is not
			// retried in a loop: the banner offers Retry and the next change tries again.
			if (pending.current && pending.current !== snap) void flush()
		}
	}, [driver])

	// Remote saves are debounced so a drag does not fire a request per frame.
	useEffect(() => {
		if (!hydrated || loadError) return
		if (loaded.current) {
			if (present === loaded.current) return
			loaded.current = null
		}
		pending.current = present
		if (!driver.remote || saveNow.current) {
			saveNow.current = false
			if (timer.current) clearTimeout(timer.current)
			void flush()
			return
		}
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => void flush(), 900)
		return () => {
			if (timer.current) clearTimeout(timer.current)
		}
	}, [present, hydrated, loadError, driver, flush])

	const retrySave = useCallback(() => {
		if (pending.current) void flush()
	}, [flush])

	/** Every change goes through here: computed from the history, never inside an updater. */
	const apply = useCallback(
		(fn: (snapshot: Snapshot) => Snapshot, coalesce?: string) => {
			const next = fn(history.current.present)
			history.current = commit(history.current, next, {
				coalesce,
				now: Date.now(),
			})
			setPresent(history.current.present)
		},
		[],
	)

	const mutate = useCallback(
		(fn: (site: Site) => Site, coalesce?: string) =>
			apply((snapshot) => {
				const next = normalizeSlugs(fn(snapshot.site))
				return next === snapshot.site ? snapshot : { ...snapshot, site: next }
			}, coalesce),
		[apply],
	)

	const mutateLook = useCallback(
		(fn: (look: BuilderLook) => BuilderLook, coalesce?: string) =>
			apply((snapshot) => {
				const next = fn(snapshot.look)
				return next === snapshot.look ? snapshot : { ...snapshot, look: next }
			}, coalesce),
		[apply],
	)

	const page = useMemo(
		() => site.pages.find((p) => p.id === pageId) ?? null,
		[site.pages, pageId],
	)

	const patchPage = useCallback(
		(fn: (page: Page) => Page, coalesce?: string) => {
			mutate(
				(current) => ({
					...current,
					pages: current.pages.map((p) =>
						p.id === pageId
							? { ...fn(p), updatedAt: new Date().toISOString() }
							: p,
					),
				}),
				coalesce,
			)
		},
		[mutate, pageId],
	)

	const patchBlocks = useCallback(
		(fn: (blocks: Block[]) => Block[], coalesce?: string) => {
			patchPage((p) => ({ ...p, blocks: fn(p.blocks) }), coalesce)
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

	/**
	 * Deletes a page, and in the same step everything in the chrome that pointed at it:
	 * menu links, groups left empty, plain items and the header button's target. When
	 * the home page goes, the next page takes '/', and links to it follow.
	 */
	const removePage = useCallback(
		(id: string) => {
			mutate((current) => {
				const removed = current.pages.find((p) => p.id === id)
				if (!removed) return current
				const next = normalizeSlugs({
					...current,
					chrome: pruneSlug(current.chrome, removed.slug),
					pages: current.pages.filter((p) => p.id !== id),
				})
				return rewriteHrefs(next, slugChanges(current, next))
			})
			const first = history.current.present.site.pages[0]?.id ?? null
			setPageId((current) => (current === id ? first : current))
			setSelectedId(null)
		},
		[mutate],
	)

	/**
	 * A page's own settings (name, address, header, search title and description). A new
	 * slug takes every menu and section link to the old one with it, in the same step.
	 */
	const renamePage = useCallback(
		(id: string, patch: Partial<Pick<Page, 'name' | 'slug' | 'inHeader' | 'seo'>>) => {
			mutate((current) => {
				const next = normalizeSlugs({
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
				})
				return rewriteHrefs(next, slugChanges(current, next))
			})
		},
		[mutate],
	)

	const setChrome = useCallback(
		(patch: Partial<Site['chrome']>) => {
			const keys = Object.keys(patch)
			mutate(
				(current) => ({
					...current,
					chrome: { ...current.chrome, ...patch },
				}),
				// Typing the header button's text is one step per burst.
				keys.length === 1 && keys[0] === 'ctaLabel' ? 'chrome:cta' : undefined,
			)
		},
		[mutate],
	)

	const setLook = useCallback(
		(patch: Partial<BuilderLook>) =>
			mutateLook(
				(current) => ({ ...current, ...patch }),
				`look:${Object.keys(patch).sort().join(',')}`,
			),
		[mutateLook],
	)

	const setBlockLook = useCallback(
		(id: string, value: BackgroundSettings) =>
			mutateLook(
				(current) => ({ ...current, blocks: { ...current.blocks, [id]: value } }),
				`look:block:${id}`,
			),
		[mutateLook],
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
		const next = undoStep(history.current)
		if (next === history.current) return
		history.current = next
		setPresent(next.present)
	}, [])

	const redo = useCallback(() => {
		const next = redoStep(history.current)
		if (next === history.current) return
		history.current = next
		setPresent(next.present)
	}, [])

	/**
	 * Lands a finished AI build as one undo step and saves it at once (the server has
	 * already marked it landed, so closing the tab must not lose it). Throws `LandError`
	 * and changes nothing when the payload does not apply.
	 */
	const applyAiResult = useCallback((landing: LandingPayload): LandSummary => {
		const result = landAiResult({
			current: history.current.present,
			landing,
			now: new Date().toISOString(),
		})
		const { site: nextSite, look: nextLook, ...summary } = result
		saveNow.current = true
		history.current = commit(
			history.current,
			{ site: nextSite, look: nextLook },
			{ now: Date.now() },
		)
		setPresent(history.current.present)
		setPageId(summary.firstPageId)
		setSelectedId(null)
		return summary
	}, [])

	/** A number for the step the history is on now; it differs after any later change. */
	const historyMark = useCallback(() => {
		const current = history.current.present
		let mark = marks.current.get(current)
		if (mark === undefined) {
			mark = ++nextMark.current
			marks.current.set(current, mark)
		}
		return mark
	}, [])

	return {
		hydrated,
		saveError,
		loadError,
		saveState,
		retrySave,
		siteId,
		siteName,
		remote: driver.remote,
		remoteMedia,
		/** The site's logo and name for its header and footer; none for a browser-only site. */
		brand: profile ? brandFromProfile(profile, siteName) : undefined,
		/** Brand, SEO and business details; none for a browser-only site. */
		profile,
		/** The profile the build route returned; not an undo step (it is business data). */
		setProfile: setProfile as (profile: SiteProfile) => void,
		inspectorOpen,
		setInspectorOpen,
		site,
		pages: site.pages,
		chrome: site.chrome,
		setChrome,
		/** Theme, backdrop, header, footer and per-section surfaces: undoable with the site. */
		look,
		setLook,
		setBlockLook,
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
		// Typing in one field is one step per burst, not one per keystroke.
		setProp: (id: string, key: string, value: unknown) =>
			patchBlocks(
				(blocks) =>
					updateBlock(blocks, id, (block) => {
						const props = { ...(block.props ?? {}) }
						if (value === undefined || value === '') delete props[key]
						else props[key] = value
						return { ...block, props }
					}),
				`prop:${id}:${key}`,
			),
		replaceBlocks: (blocks: Block[]) => patchBlocks(() => blocks),
		/**
		 * Swaps one block for a rewritten copy, on whichever page holds it, so a slow
		 * AI reply still lands if the person moved to another page meanwhile.
		 */
		replaceBlock: (id: string, block: Block) =>
			mutate((current) => ({
				...current,
				pages: current.pages.map((p) =>
					findBlock(p.blocks, id)
						? {
								...p,
								blocks: updateBlock(p.blocks, id, () => block),
								updatedAt: new Date().toISOString(),
							}
						: p,
				),
			})),
		applyAiResult,
		historyMark,
		undo,
		redo,
		canUndo: history.current.past.length > 0,
		canRedo: history.current.future.length > 0,
	}
}

export type BuilderStore = ReturnType<typeof useBuilderStore>
