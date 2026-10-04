/**
 * The media library's state machine (spec 6.2), split in two so each half can be proved.
 *
 *  1. Pure helpers: URL <-> params, the reconcile decision, selection, the optimistic edits
 *     and their rollback, query surgery, keyboard gating, the stale-response gate and the
 *     AI loop. They take plain values, own no React and touch no browser global, so the
 *     proof calls them directly with fake timers and a fake API.
 *  2. `createLibraryController`: the store that wires them to an API and an environment
 *     (location, history, storage, visibility, timers), and `useMediaLibrary`, the thin
 *     hook that subscribes a component to it.
 *
 * The URL is the source of truth and `initial` only a hint. The URL is read ONLY through
 * `window.location.search` (the `env`), never `useSearchParams`/`usePathname`: the patched
 * history calls re-render those, which would make a second source of truth.
 */
import {
	useEffect,
	useLayoutEffect,
	useState,
	useSyncExternalStore,
} from 'react'
import {
	OBJECT_ID,
	readSearchParams,
	writeSearchParams,
	type AssetPatch,
	type BulkBody,
} from '@/lib/media/schemas'
import {
	addClause,
	parseQuery,
	removeClause,
	removeClauseValue,
} from '@/lib/media/query/parse'
import { cleanLabel, slugify } from '@/lib/media/text'
import {
	MEDIA_LIMITS,
	MEDIA_SORTS,
	type MediaAssetDTO,
	type MediaBulkAction,
	type MediaFacets,
	type MediaFolderDTO,
	type MediaFoldersResponse,
	type MediaProcessResponse,
	type MediaRegisterResponse,
	type MediaSavedSearchDTO,
	type MediaSearchParams,
	type MediaSearchResponse,
	type MediaSort,
	type MediaSuggestion,
	type MediaTag,
	type MediaTagStat,
	type MediaTaggingStatusDTO,
	type ParsedQueryDTO,
	type QueryChip,
} from '@/lib/media/types'
import type {
	Density,
	FolderSelection,
	MediaLibraryProps,
} from './contracts'
import { clauseFor, formatCount, pluralize } from './format'
import {
	createMediaApi,
	isAbortError,
	MediaApiError,
	type MediaApi,
	type ProcessOptions,
} from './media-api'

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** How long typing pauses before the box is searched. Enter does not wait. */
export const SEARCH_DEBOUNCE_MS = 200
/** Writes made in a burst (an upload batch, a drag of many) become one refresh. */
export const REFRESH_DELAY_MS = 500
/** Facet counts after a tag change: later still, they are never worth a flicker. */
export const FACET_REFRESH_DELAY_MS = 1_000
/** The AI loop: at least this long between calls, and this long after an empty answer. */
export const AI_GAP_MS = 3_000
export const AI_EMPTY_GAP_MS = 10_000
export const AI_BACKOFF_MAX_MS = 30_000
/** An "N images tagged" announcement at most this often, so a screen reader is not read to. */
export const ANNOUNCE_TAGGING_EVERY_MS = 10_000
export const NOTICE_MS = 8_000
export const RECENT_MAX = 8
export const RECENT_KEY = 'rb.media.recent'
export const DENSITY_KEY = 'rb.media.density'
export const DENSITIES: readonly Density[] = ['compact', 'comfortable', 'large']
export const DEFAULT_DENSITY: Density = 'comfortable'

/* -------------------------------------------------------------------------- */
/* Params and the URL                                                         */
/* -------------------------------------------------------------------------- */

/** What the library searches for: the only state the URL carries (besides `asset`). */
export type LibraryParams = {
	q: string
	folder?: string
	deep?: boolean
	sort?: MediaSort
}

const isFolderParam = (value: unknown): value is string =>
	typeof value === 'string' && (value === 'unfiled' || OBJECT_ID.test(value))

const isSort = (value: unknown): value is MediaSort =>
	typeof value === 'string' && (MEDIA_SORTS as readonly string[]).includes(value)

/**
 * Whether a positive, top-level `folder:` clause is in the query. Judged on the syntax
 * tree, not the chips: `(folder:a tag:b)` flattens into the top-level AND, so its
 * folder clause IS top level, but its chip is a group. Negated (`-folder:a`) and
 * OR-ed clauses are not.
 */
export function hasFolderClause(q: string): boolean {
	const ast = parseQuery(typeof q === 'string' ? q : '').ast
	const nodes = ast === null ? [] : ast.type === 'and' ? ast.nodes : [ast]
	return nodes.some((node) => node.type === 'field' && node.field === 'folder')
}

/** True when the query holds any clause at all (the server turns `deep` on for those). */
export const hasQueryClause = (q: string): boolean =>
	parseQuery(typeof q === 'string' ? q : '').ast !== null

/**
 * One canonical shape for the params, so two spellings of the same search compare equal:
 * the text trimmed and cut at the query limit, a bad folder or sort dropped, `deep`
 * dropped where it means nothing (no folder, or `unfiled`), and `folder`/`deep` dropped
 * when a `folder:` clause in the query supersedes them. Never throws.
 */
export function normalizeParams(
	input: Partial<LibraryParams> | null | undefined,
): LibraryParams {
	const rawQ = input?.q
	const rawFolder = input?.folder
	const rawDeep = input?.deep
	const rawSort = input?.sort
	const q = (typeof rawQ === 'string' ? rawQ : '').slice(0, MEDIA_LIMITS.queryMax).trim()
	let folder: string | undefined = isFolderParam(rawFolder) ? rawFolder : undefined
	let deep: boolean | undefined = typeof rawDeep === 'boolean' ? rawDeep : undefined
	if (folder === undefined || folder === 'unfiled') deep = undefined
	if (folder !== undefined && hasFolderClause(q)) {
		folder = undefined
		deep = undefined
	}
	const out: LibraryParams = { q }
	if (folder !== undefined) out.folder = folder
	if (deep !== undefined) out.deep = deep
	if (isSort(rawSort)) out.sort = rawSort
	return out
}

export const sameParams = (a: LibraryParams, b: LibraryParams): boolean =>
	a.q === b.q && a.folder === b.folder && a.deep === b.deep && a.sort === b.sort

/** A `?asset=` value is an id or nothing. */
const readAsset = (value: string | null): string | null =>
	value !== null && OBJECT_ID.test(value) ? value : null

/**
 * The search and the open image a query string describes. Hostile input degrades to the
 * default (a bad id, an unknown sort, a repeated key, broken percent escapes): this runs
 * on every popstate and on every mount, and a hand-edited URL must never throw.
 */
export function paramsFromSearch(search: unknown): {
	params: LibraryParams
	asset: string | null
} {
	const usp = new URLSearchParams(typeof search === 'string' ? search : '')
	const read = readSearchParams(usp)
	return {
		params: normalizeParams({
			q: read.q,
			folder: read.folder,
			deep: read.deep,
			sort: read.sort,
		}),
		asset: readAsset(usp.get('asset')),
	}
}

/** The query string (no leading `?`) for a search and the open image. Defaults are omitted. */
export function searchFromParams(
	params: Partial<LibraryParams>,
	asset: string | null = null,
): string {
	const clean = normalizeParams(params)
	return writeSearchParams(clean, asset ? { asset } : {}).toString()
}

export type UrlParts = { pathname: string; search: string; hash: string }

export function buildUrl(location: UrlParts, search: string): string {
	const query = search.startsWith('?') ? search.slice(1) : search
	return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`
}

/**
 * What to do with the server-rendered `initial` on mount. `initial` can be STALE after a
 * client-side Back (Next reuses the cached page for history entries made with
 * replaceState/pushState), so the URL wins: when it describes a different search than
 * the hint, the first page must be fetched again. `?asset=` never changes the list; it
 * only says which image is open.
 */
export function decideReconcile(
	initial: Partial<LibraryParams> | null | undefined,
	search: unknown,
): { params: LibraryParams; asset: string | null; refetch: boolean } {
	const url = paramsFromSearch(search)
	return {
		params: url.params,
		asset: url.asset,
		refetch: !sameParams(url.params, normalizeParams(initial)),
	}
}

/**
 * The request for a search. A superseding `folder:` clause removes `folder` and `deep`
 * here, so the server is never asked for two folders at once.
 */
export function requestFor(
	params: LibraryParams,
	extra: { offset?: number; limit?: number; facets?: boolean } = {},
): Partial<MediaSearchParams> {
	const clean = normalizeParams(params)
	return {
		q: clean.q,
		folder: clean.folder,
		deep: clean.deep,
		sort: clean.sort,
		...extra,
	}
}

/** What a set of results was computed for: the target of an "all matching" bulk action. */
export type ResultsKey = { q: string; folder?: string; deep?: boolean }

export function resultsKeyOf(params: LibraryParams): ResultsKey {
	const clean = normalizeParams(params)
	const key: ResultsKey = { q: clean.q }
	if (clean.folder !== undefined) key.folder = clean.folder
	if (clean.deep !== undefined) key.deep = clean.deep
	return key
}

/** The `deep` a folder scope really has: the explicit choice, else the server's default. */
export function effectiveDeep(params: LibraryParams): boolean {
	if (params.folder === undefined || params.folder === 'unfiled') return false
	return params.deep ?? hasQueryClause(params.q)
}

/** The folder a search is confined to, as the left rail selects it. */
export const activeFolderOf = (params: LibraryParams): FolderSelection =>
	normalizeParams(params).folder

/** The label of the scope pill, or null when the search is not confined to a folder. */
export function scopeOf(
	params: LibraryParams,
	folders: readonly Pick<MediaFolderDTO, 'id' | 'path'>[],
): { label: string; deep: boolean } | null {
	const clean = normalizeParams(params)
	if (clean.folder === undefined) return null
	if (clean.folder === 'unfiled') return { label: 'Unfiled', deep: false }
	const known = folders.find((folder) => folder.id === clean.folder)
	return { label: known?.path ?? '', deep: effectiveDeep(clean) }
}

/* -------------------------------------------------------------------------- */
/* Lists                                                                      */
/* -------------------------------------------------------------------------- */

/** One entry per id, the first kept: a repeated id would be two cards for one image. */
export function dedupeById<T extends { id: string }>(list: readonly T[]): T[] {
	const seen = new Set<string>()
	const out: T[] = []
	for (const item of list) {
		if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue
		seen.add(item.id)
		out.push(item)
	}
	return out
}

/** Appends a page, de-duplicating by id and keeping the first. */
export const appendPage = (
	loaded: readonly MediaAssetDTO[],
	page: readonly MediaAssetDTO[],
): MediaAssetDTO[] => dedupeById([...loaded, ...page])

export function replaceAsset(
	list: readonly MediaAssetDTO[],
	asset: MediaAssetDTO,
): MediaAssetDTO[] {
	let found = false
	const next = list.map((item) => {
		if (item.id !== asset.id) return item
		found = true
		return asset
	})
	return found ? next : (list as MediaAssetDTO[])
}

export function removeAssets(
	list: readonly MediaAssetDTO[],
	ids: ReadonlySet<string>,
): MediaAssetDTO[] {
	return ids.size === 0 ? (list as MediaAssetDTO[]) : list.filter((item) => !ids.has(item.id))
}

/** The server's answer is the truth, but it carries no `match`: the card keeps its own. */
export function mergeServerAsset(
	current: MediaAssetDTO | undefined,
	server: MediaAssetDTO,
): MediaAssetDTO {
	return current?.match && !server.match ? { ...server, match: current.match } : server
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `ids` are the cards chosen, `anchor` is where a shift-click range starts, and
 * `allMatching` means "everything this search matches", made when the total was
 * `matchTotal`. The selection belongs to the query it was made under.
 */
export type Selection = {
	ids: ReadonlySet<string>
	anchor: string | null
	allMatching: boolean
	matchTotal: number
}

export const emptySelection: Selection = Object.freeze({
	ids: new Set<string>(),
	anchor: null,
	allMatching: false,
	matchTotal: 0,
})

export const isEmptySelection = (selection: Selection): boolean =>
	selection.ids.size === 0 && !selection.allMatching

const leaveAllMatching = (selection: Selection): Selection =>
	selection.allMatching ? { ...selection, allMatching: false, matchTotal: 0 } : selection

/**
 * A click on a card's checkbox. A shift-click selects everything between the anchor and
 * this card, in the order the cards are shown; with no usable anchor it is a plain
 * toggle. Touching one card while "all matching" is on ends that mode: what is selected
 * is then the loaded cards, minus this one.
 */
export function toggleSelection(
	selection: Selection,
	id: string,
	options: { range: boolean; order: readonly string[] },
): Selection {
	const base = leaveAllMatching(selection)
	if (options.range && base.anchor !== null && base.anchor !== id) {
		const from = options.order.indexOf(base.anchor)
		const to = options.order.indexOf(id)
		if (from >= 0 && to >= 0) {
			const ids = new Set(base.ids)
			for (let i = Math.min(from, to); i <= Math.max(from, to); i++)
				ids.add(options.order[i])
			return { ...base, ids, anchor: id }
		}
	}
	const ids = new Set(base.ids)
	if (ids.has(id)) ids.delete(id)
	else ids.add(id)
	return { ...base, ids, anchor: id }
}

/** Ctrl/Cmd+A: every loaded card. Ids selected but not loaded (a fresh upload) stay. */
export function selectAllLoaded(selection: Selection, order: readonly string[]): Selection {
	const ids = new Set(selection.ids)
	for (const id of order) ids.add(id)
	return { ids, anchor: selection.anchor, allMatching: false, matchTotal: 0 }
}

export const allLoadedSelected = (
	selection: Selection,
	order: readonly string[],
): boolean =>
	order.length > 0 && (selection.allMatching || order.every((id) => selection.ids.has(id)))

/** The toolbar checkbox: everything loaded is chosen, or the selection is cleared. */
export function toggleAllLoaded(selection: Selection, order: readonly string[]): Selection {
	return allLoadedSelected(selection, order) ? emptySelection : selectAllLoaded(selection, order)
}

export function selectAllMatching(
	selection: Selection,
	order: readonly string[],
	total: number,
): Selection {
	const ids = new Set(selection.ids)
	for (const id of order) ids.add(id)
	return { ids, anchor: selection.anchor, allMatching: true, matchTotal: total }
}

/** More cards loaded while "all matching" is on: they are part of it, so they show chosen. */
export function extendAllMatching(selection: Selection, ids: readonly string[]): Selection {
	if (!selection.allMatching || ids.length === 0) return selection
	const next = new Set(selection.ids)
	for (const id of ids) next.add(id)
	return { ...selection, ids: next }
}

/**
 * The selection after the search moved from `prev` to `next`. A change to `q`, `folder`
 * or `deep` ends it (it was made under another set of results); a change to `sort` does
 * not, and neither does density.
 */
export function selectionAfterParamsChange(
	prev: LibraryParams,
	next: LibraryParams,
	selection: Selection,
): Selection {
	const changed = prev.q !== next.q || prev.folder !== next.folder || prev.deep !== next.deep
	return changed && !isEmptySelection(selection) ? emptySelection : selection
}

/** The selection without these ids (images that were deleted). "All matching" ends: its total moved. */
export function removeFromSelection(
	selection: Selection,
	gone: ReadonlySet<string>,
): Selection {
	if (gone.size === 0) return selection
	const ids = new Set<string>()
	for (const id of selection.ids) if (!gone.has(id)) ids.add(id)
	if (ids.size === selection.ids.size && !selection.allMatching) return selection
	return {
		ids,
		anchor: selection.anchor !== null && ids.has(selection.anchor) ? selection.anchor : null,
		allMatching: false,
		matchTotal: 0,
	}
}

/** Only ids still present: what is left after a list was reloaded. "All matching" ends. */
export function pruneSelection(
	selection: Selection,
	present: ReadonlySet<string>,
): Selection {
	const ids = new Set<string>()
	for (const id of selection.ids) if (present.has(id)) ids.add(id)
	if (ids.size === selection.ids.size && !selection.allMatching) return selection
	return {
		ids,
		anchor: selection.anchor !== null && ids.has(selection.anchor) ? selection.anchor : null,
		allMatching: false,
		matchTotal: 0,
	}
}

/**
 * "Select all N matching" is offered only when a bulk action would run on exactly the set
 * the person saw: the result is not truncated (the total is exact), not relaxed (nothing
 * was dropped), and within what a bulk call can resolve.
 */
export function canSelectAllMatching(input: {
	total: number
	truncated: boolean
	dropped: readonly string[]
}): boolean {
	return (
		!input.truncated &&
		input.dropped.length === 0 &&
		Number.isFinite(input.total) &&
		input.total >= 1 &&
		input.total <= MEDIA_LIMITS.bulkSearchCap
	)
}

export type BulkTarget =
	| { ids: string[] }
	| { search: { q: string; folder?: string; deep?: boolean; expect: number } }

/**
 * Who a bulk action touches. "All matching" sends the search the results were computed for
 * (not whatever the box says now) and `expect`, the total the person saw, so the server
 * can refuse if the set has moved. Otherwise the chosen ids.
 */
export function bulkTargetFor(
	selection: Selection,
	key: ResultsKey,
	total: number,
): BulkTarget {
	if (selection.allMatching)
		return { search: { ...key, expect: selection.matchTotal || total } }
	return { ids: [...selection.ids] }
}

export function chunkIds<T>(list: readonly T[], size: number): T[][] {
	const out: T[][] = []
	for (let at = 0; at < list.length; at += size) out.push(list.slice(at, at + size))
	return out
}

/* -------------------------------------------------------------------------- */
/* Optimistic edits and their rollback                                        */
/* -------------------------------------------------------------------------- */

const orderTags = (tags: MediaTag[]): MediaTag[] => [
	...tags.filter((tag) => tag.source === 'manual'),
	...tags.filter((tag) => tag.source !== 'manual'),
]

export type OptimisticEdit = {
	next: MediaAssetDTO
	/** The same asset with this edit taken back, leaving anything changed since alone. */
	undo(current: MediaAssetDTO): MediaAssetDTO
}

/**
 * What an edit will probably look like, applied at once, plus how to take it back.
 * Rolling back is per field and only where the field still holds what this edit put
 * there: a later edit that moved on is not undone by an earlier one failing.
 */
export function optimisticPatch(
	asset: MediaAssetDTO,
	patch: AssetPatch,
	folderPathOf: (id: string | null) => string,
): OptimisticEdit {
	const set: Partial<MediaAssetDTO> = {}
	const before: Partial<MediaAssetDTO> = {}
	for (const key of ['name', 'caption', 'altText', 'notes'] as const) {
		const value = patch[key]
		if (typeof value !== 'string') continue
		// The server trims; a name never becomes empty (the field refuses that earlier).
		const next = value.trim()
		if (key === 'name' && next === '') continue
		set[key] = next
		before[key] = asset[key]
	}
	if (patch.folderId !== undefined) {
		set.folderId = patch.folderId
		set.folderPath = folderPathOf(patch.folderId)
		before.folderId = asset.folderId
		before.folderPath = asset.folderPath
	}

	const added: string[] = []
	const promoted: MediaTag[] = []
	const removed: MediaTag[] = []
	let tags = asset.tags
	const touchesTags = (patch.addTags?.length ?? 0) > 0 || (patch.removeTags?.length ?? 0) > 0
	if (touchesTags) {
		for (const label of patch.addTags ?? []) {
			const clean = cleanLabel(label)
			const slug = clean ? slugify(clean) : ''
			if (!slug) continue
			const at = tags.findIndex((tag) => tag.slug === slug)
			if (at < 0) {
				tags = [...tags, { slug, label: clean, source: 'manual' }]
				added.push(slug)
			} else if (tags[at].source === 'auto') {
				// Adding the label of an automatic tag keeps it: it becomes the person's own.
				promoted.push(tags[at])
				tags = tags.map((tag, index) =>
					index === at ? { slug: tag.slug, label: tag.label, source: 'manual' as const } : tag,
				)
			}
		}
		for (const slug of patch.removeTags ?? []) {
			const at = tags.findIndex((tag) => tag.slug === slug)
			if (at < 0) continue
			removed.push(tags[at])
			tags = tags.filter((tag) => tag.slug !== slug)
		}
		set.tags = orderTags(tags)
	}

	const next: MediaAssetDTO = { ...asset, ...set }
	return {
		next,
		undo(current) {
			const back: Partial<MediaAssetDTO> = {}
			for (const key of ['name', 'caption', 'altText', 'notes'] as const)
				if (key in before && current[key] === next[key]) back[key] = before[key] as string
			if ('folderId' in before && current.folderId === next.folderId) {
				back.folderId = before.folderId as string | null
				back.folderPath = before.folderPath as string
			}
			if (touchesTags) {
				let restored = current.tags.filter(
					(tag) => !(added.includes(tag.slug) && tag.source === 'manual'),
				)
				restored = restored.map((tag) => {
					const original = promoted.find((p) => p.slug === tag.slug)
					return original && tag.source === 'manual' ? original : tag
				})
				for (const tag of removed)
					if (!restored.some((other) => other.slug === tag.slug)) restored.push(tag)
				back.tags = orderTags(restored)
			}
			return { ...current, ...back }
		},
	}
}

/** The tags on the target images with how many carry each, most common first. */
export function countTags(
	assets: readonly Pick<MediaAssetDTO, 'tags'>[],
): { slug: string; label: string; count: number }[] {
	const counts = new Map<string, { slug: string; label: string; count: number }>()
	for (const asset of assets)
		for (const tag of asset.tags ?? []) {
			const row = counts.get(tag.slug)
			if (row) row.count++
			else counts.set(tag.slug, { slug: tag.slug, label: tag.label, count: 1 })
		}
	return [...counts.values()].sort(
		(a, b) => b.count - a.count || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
	)
}

/* -------------------------------------------------------------------------- */
/* Query surgery                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Cuts a chip out of the text in the box. The chip came from the server's parse of the
 * COMMITTED query, and the box may have moved on, so the clause is found again in the
 * text as it is now (same clause, same sign; the same position when there are twins).
 * A clause that is no longer there removes nothing.
 */
export function removeChipFromQuery(q: string, chip: QueryChip): string {
	const chips = parseQuery(q).chips
	const same = (c: QueryChip) => c.clause === chip.clause && c.negated === chip.negated
	const target = chips.find((c) => same(c) && c.start === chip.start) ?? chips.find(same)
	return target ? removeClause(q, target) : q
}

const unquote = (value: string) =>
	value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value

/**
 * A facet was clicked. `clause` is `field:value`, `active` is its state before the click,
 * so true means take it out (one value of a comma list for type/orientation/kind) and false
 * means add it (merged into the comma list for those three).
 */
export function toggleFacetClause(q: string, clause: string, active: boolean): string {
	if (!active) return addClause(q, clause)
	const match = /^([A-Za-z]+):([\s\S]+)$/.exec(clause)
	if (!match) return q
	const field = match[1].toLowerCase()
	const value = unquote(match[2]).trim()
	const chip = parseQuery(q).chips.find(
		(c) =>
			c.kind === 'filter' &&
			!c.negated &&
			c.field === field &&
			(c.values ?? []).some((v) => v === value || v === value.toLowerCase()),
	)
	if (!chip) return q
	const hit = (chip.values ?? []).find((v) => v === value || v === value.toLowerCase()) ?? value
	return removeClauseValue(q, chip, hit)
}

/**
 * A tag was renamed or merged, so the `tag:old` clauses of the open query now read
 * `tag:new` (the planner would follow the redirect anyway; this keeps the chips honest).
 * Only whole `tag:` clauses are rewritten; a tag buried in an OR group is left to the
 * redirect. A prefix star and a leading `-` are kept.
 */
export function rewriteTagClause(q: string, oldSlug: string, newSlug: string): string {
	if (!oldSlug || !newSlug || oldSlug === newSlug) return q
	let text = q
	const chips = parseQuery(q).chips
	for (let i = chips.length - 1; i >= 0; i--) {
		const chip = chips[i]
		if (chip.kind !== 'filter' || chip.field !== 'tag') continue
		if (!(chip.values ?? []).includes(oldSlug)) continue
		const parts = /^(-?)tag:([\s\S]*)$/.exec(chip.clause)
		if (!parts) continue
		const seen = new Set<string>()
		const values: string[] = []
		for (const item of parts[2].split(',')) {
			const star = item.endsWith('*')
			const base = star ? item.slice(0, -1) : item
			const renamed = `${base === oldSlug ? newSlug : base}${star ? '*' : ''}`
			if (seen.has(renamed)) continue
			seen.add(renamed)
			values.push(renamed)
		}
		text = `${text.slice(0, chip.start)}${parts[1]}tag:${values.join(',')}${text.slice(chip.end)}`
	}
	return text
}

/* -------------------------------------------------------------------------- */
/* Keyboard                                                                   */
/* -------------------------------------------------------------------------- */

type ElementLike = {
	tagName?: unknown
	isContentEditable?: unknown
	getAttribute?: (name: string) => string | null
	closest?: (selector: string) => unknown
}

const EDITABLE_ROLES = new Set(['combobox', 'textbox', 'searchbox', 'listbox', 'option'])
const EDITABLE_SELECTOR =
	'[contenteditable=""],[contenteditable="true"],[role="combobox"],[role="textbox"],[role="searchbox"]'
const OVERLAY_SELECTOR =
	'[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="tree"]'

/** An input, a textarea, a select, anything contenteditable or `role=combobox`: the keys are the person's own. */
export function isEditableTarget(target: unknown): boolean {
	if (!target || typeof target !== 'object') return false
	const el = target as ElementLike
	const tag = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : ''
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
	if (el.isContentEditable === true) return true
	let role: string | null = null
	try {
		role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null
	} catch {
		role = null
	}
	if (role && EDITABLE_ROLES.has(role.trim().split(/\s+/)[0]?.toLowerCase() ?? '')) return true
	if (typeof el.closest === 'function') {
		try {
			return Boolean(el.closest(EDITABLE_SELECTOR))
		} catch {
			return false
		}
	}
	return false
}

/** A dialog, a menu, an open list or the folder tree: they have keys of their own. */
export function isInsideOverlay(target: unknown): boolean {
	if (!target || typeof target !== 'object') return false
	const el = target as ElementLike
	if (typeof el.closest !== 'function') return false
	try {
		return Boolean(el.closest(OVERLAY_SELECTOR))
	} catch {
		return false
	}
}

export type KeyEventLike = {
	key: string
	ctrlKey?: boolean
	metaKey?: boolean
	altKey?: boolean
	shiftKey?: boolean
	repeat?: boolean
	isComposing?: boolean
	defaultPrevented?: boolean
	target?: unknown
}

export type KeyAction =
	| 'focus-search'
	| 'close-detail'
	| 'clear-selection'
	| 'select-all'
	| 'delete'

export type KeyContext = {
	/** The detail sheet is open. */
	detailOpen: boolean
	/** One of the page's own dialogs is open. */
	modalOpen: boolean
	/** At least one image is selected. */
	hasSelection: boolean
	/** The toolbar's Select mode is on, with or without a selection. */
	selecting: boolean
	/** Cards are loaded to select. */
	hasAssets: boolean
	canDelete: boolean
}

/**
 * What a key press on the page means, or null to leave it alone. Every one of these
 * ignores an event whose target is an input, textarea, contenteditable or combobox, a
 * key another layer already used (a dialog's Esc, the tree's own keys), a composition and
 * anything inside a dialog, menu or the tree. `Delete` also needs the permission and
 * something selected, and never repeats.
 */
export function decideKeyAction(event: KeyEventLike, context: KeyContext): KeyAction | null {
	if (event.defaultPrevented || event.isComposing) return null
	if (isEditableTarget(event.target) || isInsideOverlay(event.target)) return null
	if (context.modalOpen) return null
	const chord = event.ctrlKey === true || event.metaKey === true
	const bare = !chord && event.altKey !== true

	if (event.key === 'Escape') {
		if (!bare) return null
		if (context.detailOpen) return 'close-detail'
		return context.hasSelection || context.selecting ? 'clear-selection' : null
	}
	// Behind an open sheet nothing else belongs to the page.
	if (context.detailOpen) return null
	if (event.key === '/') return bare ? 'focus-search' : null
	if (event.key === 'a' || event.key === 'A')
		return chord && event.altKey !== true && event.shiftKey !== true && context.hasAssets
			? 'select-all'
			: null
	if (event.key === 'Delete')
		return bare && !event.repeat && context.canDelete && context.hasSelection ? 'delete' : null
	return null
}

/* -------------------------------------------------------------------------- */
/* Remembered choices                                                         */
/* -------------------------------------------------------------------------- */

/** What storage held, made safe: strings only, trimmed, unique, at most `RECENT_MAX`. */
export function parseRecent(raw: unknown): string[] {
	if (typeof raw !== 'string' || raw.length > 64 * 1024) return []
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		return []
	}
	if (!Array.isArray(value)) return []
	const out: string[] = []
	for (const entry of value) {
		if (out.length >= RECENT_MAX) break
		if (typeof entry !== 'string') continue
		const text = entry.trim()
		if (!text || text.length > MEDIA_LIMITS.queryMax || out.includes(text)) continue
		out.push(text)
	}
	return out
}

/** A finished search goes to the front; an older copy of it goes; nothing empty is kept. */
export function pushRecent(list: readonly string[], q: string): string[] {
	const text = typeof q === 'string' ? q.trim() : ''
	if (!text || text.length > MEDIA_LIMITS.queryMax) return [...list]
	return [text, ...list.filter((entry) => entry !== text)].slice(0, RECENT_MAX)
}

export function parseDensity(raw: unknown): Density | null {
	return typeof raw === 'string' && (DENSITIES as readonly string[]).includes(raw)
		? (raw as Density)
		: null
}

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

export function joinWords(items: readonly string[], conjunction: 'and' | 'or' = 'and'): string {
	if (items.length <= 1) return items[0] ?? ''
	return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`
}

/** "No results", "1 result", "312 results", "At least 5,000 results" when the count is a lower bound. */
export function describeResultCount(total: number, truncated: boolean): string {
	const n = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
	if (n === 0) return 'No results'
	if (truncated) return `At least ${formatCount(n)} results`
	return n === 1 ? '1 result' : `${formatCount(n)} results`
}

/** The announcement for a finished search: the count, then what was dropped or corrected. */
export function describeSearchOutcome(input: {
	total: number
	truncated: boolean
	dropped: readonly string[]
	corrections: readonly { from: string; to: string }[]
}): string {
	const parts = [`${describeResultCount(input.total, input.truncated)}.`]
	if (input.dropped.length > 0)
		parts.push(`No images mention ${joinWords(input.dropped, 'or')}.`)
	const showing = [...new Set(input.corrections.map((c) => c.to).filter(Boolean))]
	if (showing.length > 0) parts.push(`Showing results for ${joinWords(showing)}.`)
	return parts.join(' ')
}

export type Tone = 'info' | 'warn' | 'error'

/** What a bulk action did, compared with what was asked: "38 of 40" when it fell short. */
export function describeBulkResult(
	action: MediaBulkAction,
	asked: number,
	affected: number,
): { tone: Tone; text: string } {
	const a = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : 0
	const n = Number.isFinite(affected) && affected > 0 ? Math.floor(affected) : 0
	const of = `${formatCount(n)} of ${pluralize(a, 'image')}`
	const full = n >= a && n > 0
	switch (action) {
		case 'move':
			return full
				? { tone: 'info', text: `Moved ${pluralize(n, 'image')}.` }
				: n === 0
					? { tone: 'warn', text: 'No images were moved. They may already be in that folder.' }
					: { tone: 'warn', text: `Moved ${of}. The rest were already there or could not be moved.` }
		case 'addTags':
			return full
				? { tone: 'info', text: `Tagged ${pluralize(n, 'image')}.` }
				: n === 0
					? { tone: 'warn', text: 'No tags were added. The images already had them.' }
					: { tone: 'warn', text: `Tags added to ${of}. The rest already had them or changed while you worked.` }
		case 'removeTags':
			return full
				? { tone: 'info', text: `Removed the tags from ${pluralize(n, 'image')}.` }
				: n === 0
					? { tone: 'warn', text: 'No tags were removed. The images did not have them.' }
					: { tone: 'warn', text: `Tags removed from ${of}. The rest did not have them or changed while you worked.` }
		case 'delete':
			return full
				? { tone: 'info', text: `Deleted ${pluralize(n, 'image')}.` }
				: n === 0
					? { tone: 'warn', text: 'No images were deleted. They may already be gone.' }
					: { tone: 'warn', text: `Deleted ${of}. The rest could not be deleted.` }
		case 'retag':
			return full
				? { tone: 'info', text: `Queued ${pluralize(n, 'image')} for auto-tagging.` }
				: n === 0
					? { tone: 'warn', text: 'No images were queued. They may already be waiting for tags.' }
					: { tone: 'warn', text: `Queued ${of} for auto-tagging. The rest are already being tagged.` }
		case 'acceptAutoTags':
			return full
				? { tone: 'info', text: `Kept the automatic tags on ${pluralize(n, 'image')}.` }
				: n === 0
					? { tone: 'warn', text: 'Nothing to keep. These images have no automatic tags.' }
					: { tone: 'warn', text: `Kept automatic tags on ${of}. The rest had none to keep.` }
	}
}

const TONE_RANK: Record<Tone, number> = { info: 0, warn: 1, error: 2 }

/** Two results of one dialog (tags added, then removed) as one message, in the worse tone. */
export function combineResults(
	results: readonly { tone: Tone; text: string }[],
): { tone: Tone; text: string } {
	let tone: Tone = 'info'
	for (const result of results) if (TONE_RANK[result.tone] > TONE_RANK[tone]) tone = result.tone
	return { tone, text: results.map((result) => result.text).join(' ') }
}

/**
 * The scope of a bulk action in words, for the confirmation: "all 312 images matching
 * tag:kitchen in Clients/Acme and its subfolders", or "the 3 images you selected".
 */
export function describeSelectionScope(input: {
	allMatching: boolean
	count: number
	total: number
	q: string
	folderLabel: string | null
	deep: boolean
}): string {
	if (!input.allMatching) {
		const n = Math.max(0, Math.floor(input.count))
		return n === 1 ? 'the 1 image you selected' : `the ${formatCount(n)} images you selected`
	}
	const n = Math.max(0, Math.floor(input.total))
	const query = input.q.trim()
	const where =
		input.folderLabel === null
			? ''
			: input.folderLabel === 'Unfiled'
				? ' in Unfiled'
				: ` in ${input.folderLabel || 'this folder'}${input.deep ? ' and its subfolders' : ' only'}`
	if (query) return `all ${formatCount(n)} ${n === 1 ? 'image' : 'images'} matching ${query}${where}`
	return `all ${formatCount(n)} ${n === 1 ? 'image' : 'images'}${where || ' in your library'}`
}

/** The sentence a delete confirmation ends with: what is lost, and what it can break. */
export const DELETE_WARNING =
	'This is permanent. If an image is used on a site, it will stop showing there.'

export const messageOf = (error: unknown, fallback = 'Something went wrong. Try again.'): string => {
	const text = error instanceof Error ? error.message.trim() : ''
	return text ? text.slice(0, 300) : fallback
}

/* -------------------------------------------------------------------------- */
/* Stale responses                                                            */
/* -------------------------------------------------------------------------- */

export type RequestTicket = {
	id: number
	signal: AbortSignal
	/** True only for the latest request, and only until something supersedes or cancels it. */
	isCurrent(): boolean
}

/**
 * One request at a time owns a piece of state. `begin` aborts the one before it, and a
 * response is applied only if its ticket is still current, so a slow answer to an old
 * question can never overwrite the answer to a newer one whether or not the fetch
 * honours its signal.
 */
export function createRequestGate() {
	let latest = 0
	let controller: AbortController | null = null
	return {
		begin(): RequestTicket {
			controller?.abort()
			const id = ++latest
			const mine = new AbortController()
			controller = mine
			return {
				id,
				signal: mine.signal,
				isCurrent: () => id === latest && !mine.signal.aborted,
			}
		},
		/** Nothing in flight may be applied any more. */
		cancel() {
			controller?.abort()
			controller = null
			latest++
		},
	}
}

/* -------------------------------------------------------------------------- */
/* The AI loop                                                                */
/* -------------------------------------------------------------------------- */

export type AiStopReason = 'unconfigured' | 'budget' | 'blocked' | 'done' | 'fatal'

export type AiLoopDeps = {
	call(options: ProcessOptions, signal: AbortSignal): Promise<MediaProcessResponse>
	now(): number
	setTimeout(callback: () => void, ms: number): unknown
	clearTimeout(handle: unknown): void
	/** The tab is in the background: nothing is sent until it is not. */
	hidden(): boolean
	/** Every answer, before the loop decides what comes next. */
	onResponse(response: MediaProcessResponse): void
	onWorking(working: boolean): void
	onStop(reason: AiStopReason, message?: string): void
	onError(error: unknown, fatal: boolean): void
}

/** 401, 403 and 404 do not get better by asking again. */
const isFatalStatus = (error: unknown) =>
	error instanceof MediaApiError &&
	(error.status === 401 || error.status === 403 || error.status === 404)

/** The wait after the n-th error in a row: 6 s, 12 s, 24 s, then 30 s. */
export const backoffMs = (errors: number): number =>
	Math.min(AI_BACKOFF_MAX_MS, AI_GAP_MS * 2 ** Math.max(1, errors))

/**
 * Works through the tagging queue from the open page, one batch at a time: while
 * `setActive(true)`, POST /process, wait, ask again. At least 3 s between calls and 10 s
 * after an empty answer; a rate limit waits what the server said; errors back off up to
 * 30 s; budget, bad configuration and "nothing left" stop it. It sends nothing while the
 * tab is hidden and resumes (`resume`) when it is not.
 */
export function createAiLoop(deps: AiLoopDeps) {
	let active = false
	let timer: unknown = null
	let inFlight: AbortController | null = null
	let lastEnd = Number.NEGATIVE_INFINITY
	let gap = 0
	let errors = 0
	let next: ProcessOptions | null = null

	const clear = () => {
		if (timer !== null) deps.clearTimeout(timer)
		timer = null
	}

	const schedule = () => {
		clear()
		if (!active || inFlight) return
		// Hidden: nothing is scheduled, `resume` does it when the tab is back.
		if (deps.hidden()) return
		const wait = Math.max(0, lastEnd + gap - deps.now())
		timer = deps.setTimeout(() => {
			timer = null
			void run()
		}, wait)
	}

	const stop = (reason: AiStopReason, message?: string) => {
		active = false
		clear()
		inFlight = null
		deps.onWorking(false)
		deps.onStop(reason, message)
	}

	async function run(): Promise<void> {
		if (!active || inFlight) return
		if (deps.hidden()) return
		const options = next ?? {}
		next = null
		const controller = new AbortController()
		inFlight = controller
		let response: MediaProcessResponse
		try {
			response = await deps.call(options, controller.signal)
		} catch (error) {
			// Stopped (or restarted) while the request was out: whatever it says is stale.
			if (inFlight !== controller) return
			inFlight = null
			lastEnd = deps.now()
			if (isAbortError(error) || controller.signal.aborted) return schedule()
			errors++
			const fatal = isFatalStatus(error)
			deps.onError(error, fatal)
			if (fatal) return stop('fatal')
			gap = backoffMs(errors)
			return schedule()
		}
		if (inFlight !== controller) return
		inFlight = null
		lastEnd = deps.now()
		errors = 0
		deps.onResponse(response)
		// The page may have stopped the loop while it was applying the answer.
		if (!active) return

		if (!response.configured) return stop('unconfigured')
		if (response.budgetExhausted) return stop('budget')
		const blocked = response.blocked
		if (blocked?.kind === 'config') return stop('blocked', blocked.message)
		if (blocked?.kind === 'rate_limited') {
			const asked = Number.isFinite(blocked.retryAfterMs) ? (blocked.retryAfterMs as number) : 30_000
			gap = Math.min(MEDIA_LIMITS.aiRetryAfterMaxMs, Math.max(AI_GAP_MS, asked))
		} else if (response.remaining <= 0) return stop('done')
		else gap = response.processed.length === 0 ? AI_EMPTY_GAP_MS : AI_GAP_MS
		schedule()
	}

	return {
		/** Start working (true) or stop (false). Safe to call on every state change. */
		setActive(on: boolean) {
			if (on === active) return
			if (!on) {
				active = false
				clear()
				inFlight?.abort()
				inFlight = null
				deps.onWorking(false)
				return
			}
			active = true
			errors = 0
			deps.onWorking(true)
			schedule()
		},
		/**
		 * An explicit ask (Tag them now, Retry): go now, with these options once. It ignores the
		 * gaps and a halt, because a person pressed the button.
		 */
		kick(options: ProcessOptions) {
			next = options
			errors = 0
			gap = 0
			lastEnd = Number.NEGATIVE_INFINITY
			if (!active) {
				active = true
				deps.onWorking(true)
			}
			schedule()
		},
		/** The tab went to the background: no new call until `resume`. A call in flight finishes. */
		pause: clear,
		resume: schedule,
		isActive: () => active,
		isBusy: () => inFlight !== null,
		errorCount: () => errors,
	}
}

/* -------------------------------------------------------------------------- */
/* The environment                                                            */
/* -------------------------------------------------------------------------- */

/** Everything the controller needs from the browser, so a test can hand it fakes. */
export type LibraryEnv = {
	location(): UrlParts
	replaceUrl(url: string): void
	pushUrl(url: string): void
	onPopState(listener: () => void): () => void
	readStorage(key: string): string | null
	writeStorage(key: string, value: string): void
	hidden(): boolean
	onVisibilityChange(listener: () => void): () => void
	setTimeout(callback: () => void, ms: number): unknown
	clearTimeout(handle: unknown): void
	now(): number
}

/**
 * The real browser. History is written with a FRESH `{}` as the data argument, never
 * `history.state`: Next patches pushState/replaceState and copies its own router state
 * into the data it is given, so handing it the old state back would alias it. Every
 * storage and history call is wrapped: storage can be blocked, and Safari throws when
 * history is written too often. The page works without either.
 */
export function browserEnv(): LibraryEnv {
	return {
		location: () => ({
			pathname: window.location.pathname,
			search: window.location.search,
			hash: window.location.hash,
		}),
		replaceUrl(url) {
			try {
				window.history.replaceState({}, '', url)
			} catch {
				// The URL is a convenience; the page keeps working.
			}
		},
		pushUrl(url) {
			try {
				window.history.pushState({}, '', url)
			} catch {
				// As above.
			}
		},
		onPopState(listener) {
			window.addEventListener('popstate', listener)
			return () => window.removeEventListener('popstate', listener)
		},
		readStorage(key) {
			try {
				return window.localStorage.getItem(key)
			} catch {
				return null
			}
		},
		writeStorage(key, value) {
			try {
				window.localStorage.setItem(key, value)
			} catch {
				// Blocked or full: the choice is not remembered, nothing else changes.
			}
		},
		hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
		onVisibilityChange(listener) {
			document.addEventListener('visibilitychange', listener)
			return () => document.removeEventListener('visibilitychange', listener)
		},
		setTimeout: (callback, ms) => window.setTimeout(callback, ms),
		clearTimeout: (handle) => window.clearTimeout(handle as number),
		now: () => Date.now(),
	}
}

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export type Notice = { id: number; tone: Tone; text: string; retry?: 'refresh' }

export type LibraryState = {
	/** The committed search; the URL mirrors it. */
	params: LibraryParams
	/** The text in the box: ahead of `params.q` while the debounce runs. */
	draft: string
	assets: MediaAssetDTO[]
	total: number
	/** `total` is a lower bound (the text query hit the candidate cap). */
	truncated: boolean
	hasMore: boolean
	/** Rows the server has handed over so far: where the next page starts. */
	nextOffset: number
	/** The sort the server actually applied. */
	sortApplied: MediaSort
	query: ParsedQueryDTO
	corrections: { from: string; to: string }[]
	dropped: string[]
	facets: MediaFacets | null
	/** Images in the whole library still waiting for AI tags. */
	pending: number
	/** What the shown results were computed for: the target of an "all matching" action. */
	resultsKey: ResultsKey
	/** The first page of a new search is in flight (skeletons). */
	loading: boolean
	loadingMore: boolean
	/** A reload in place (after a move or an upload) is in flight; the cards stay. */
	refreshing: boolean
	/** The last list fetch failed. Never read as "no images". */
	error: string | null
	selection: Selection
	/** The toolbar's Select toggle: checkboxes stay visible. */
	selecting: boolean
	openId: string | null
	/** The open image when it is not among the loaded ones (a link, a duplicate's View). */
	fetchedAsset: MediaAssetDTO | null
	folders: MediaFoldersResponse
	saved: MediaSavedSearchDTO[]
	tagging: MediaTaggingStatusDTO
	density: Density
	recent: string[]
	aiWorking: boolean
	/** A bad key, billing or model stopped tagging: shown verbatim until a retry. */
	aiBlocked: string | null
	uploadBusy: boolean
	notice: Notice | null
	/** What the one live region says. `id` changes with every message, so a repeat is heard. */
	announcement: { id: number; text: string }
}

const EMPTY_QUERY: ParsedQueryDTO = { chips: [], warnings: [], sort: null, hasText: false }

export function createInitialState(initial: MediaLibraryProps['initial']): LibraryState {
	const params = normalizeParams(initial.params)
	const search = initial.search
	const assets = dedupeById(Array.isArray(search?.assets) ? search.assets : [])
	return {
		params,
		draft: params.q,
		assets,
		total: typeof search?.total === 'number' ? search.total : assets.length,
		truncated: search?.truncated === true,
		hasMore: search?.hasMore === true,
		nextOffset: assets.length,
		sortApplied: isSort(search?.sort) ? search.sort : 'newest',
		query: search?.query ?? EMPTY_QUERY,
		corrections: search?.corrections ?? [],
		dropped: search?.dropped ?? [],
		facets: search?.facets ?? null,
		pending: typeof search?.pending === 'number' ? search.pending : 0,
		resultsKey: resultsKeyOf(params),
		loading: false,
		loadingMore: false,
		refreshing: false,
		error: null,
		selection: emptySelection,
		selecting: false,
		openId: null,
		fetchedAsset: null,
		folders: initial.folders,
		saved: Array.isArray(initial.saved) ? initial.saved : [],
		tagging: initial.tagging,
		density: DEFAULT_DENSITY,
		recent: [],
		aiWorking: false,
		aiBlocked: null,
		uploadBusy: false,
		notice: null,
		announcement: { id: 0, text: '' },
	}
}

const clampInt = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, Math.floor(value)))

/** `folder:` clauses at the top level, taken out, so a click in the rail is not outvoted by one. */
export function stripFolderClauses(q: string): string {
	const chips = parseQuery(q)
		.chips.filter((c) => c.kind === 'filter' && c.field === 'folder' && !c.negated)
		.sort((a, b) => b.start - a.start)
	let text = q
	for (const chip of chips) text = removeClause(text, chip)
	return text
}

/** Whether an asset in `folderId` still belongs to a view confined to `params.folder`. Null: cannot be told here. */
export function folderStillInScope(
	params: LibraryParams,
	folders: readonly Pick<MediaFolderDTO, 'id' | 'parentId'>[],
	folderId: string | null,
): boolean | null {
	const clean = normalizeParams(params)
	if (hasFolderClause(clean.q)) return null
	if (clean.folder === undefined) return true
	if (clean.folder === 'unfiled') return folderId === null
	if (folderId === null) return false
	if (folderId === clean.folder) return true
	if (!effectiveDeep(clean)) return false
	// Walk up from the asset's folder; a cycle in bad data ends the walk.
	const parentOf = new Map(folders.map((f) => [f.id, f.parentId]))
	const seen = new Set<string>()
	let cursor: string | null | undefined = folderId
	while (cursor && !seen.has(cursor)) {
		if (cursor === clean.folder) return true
		seen.add(cursor)
		cursor = parentOf.get(cursor)
	}
	return false
}

/* -------------------------------------------------------------------------- */
/* The controller                                                             */
/* -------------------------------------------------------------------------- */

export type ControllerOptions = {
	initial: MediaLibraryProps['initial']
	/** Read at the moment of use, so a role that changed is honoured. */
	can(): { write: boolean; delete: boolean }
	api: MediaApi
	env: LibraryEnv
}

type HistoryMode = 'replace' | 'push' | 'none'

export function createLibraryController(options: ControllerOptions) {
	const { api, env, initial } = options

	let state: LibraryState = createInitialState(initial)
	const listeners = new Set<() => void>()
	let mounted = false
	let sequence = 0

	const set = (patch: Partial<LibraryState>) => {
		state = { ...state, ...patch }
		for (const listener of [...listeners]) listener()
	}

	const announce = (text: string) => set({ announcement: { id: ++sequence, text } })

	let noticeTimer: unknown = null
	const clearNoticeTimer = () => {
		if (noticeTimer !== null) env.clearTimeout(noticeTimer)
		noticeTimer = null
	}
	const notify = (tone: Tone, text: string, extra: { retry?: 'refresh' } = {}) => {
		clearNoticeTimer()
		const id = ++sequence
		set({ notice: { id, tone, text, ...extra }, announcement: { id: ++sequence, text } })
		if (tone === 'info')
			noticeTimer = env.setTimeout(() => {
				noticeTimer = null
				if (state.notice?.id === id) set({ notice: null })
			}, NOTICE_MS)
	}

	/* ---- small lookups --------------------------------------------------- */

	const findAsset = (id: string): MediaAssetDTO | undefined =>
		state.assets.find((asset) => asset.id === id) ??
		(state.fetchedAsset?.id === id ? state.fetchedAsset : undefined)

	/** Applies `change` to the asset wherever it is held: the list, and the open copy. */
	const mapAsset = (id: string, change: (asset: MediaAssetDTO) => MediaAssetDTO) => {
		const patch: Partial<LibraryState> = {}
		const at = state.assets.findIndex((asset) => asset.id === id)
		if (at >= 0) {
			const next = state.assets.slice()
			next[at] = change(state.assets[at])
			patch.assets = next
		}
		if (state.fetchedAsset?.id === id) patch.fetchedAsset = change(state.fetchedAsset)
		if (at >= 0 || patch.fetchedAsset) set(patch)
	}

	const folderPathOf = (id: string | null): string =>
		id === null ? '' : (state.folders.folders.find((f) => f.id === id)?.path ?? '')

	const requirePermission = (kind: 'write' | 'delete') => {
		if (!options.can()[kind]) throw new Error('Your role does not allow that.')
	}

	const failure = (error: unknown) => new Error(messageOf(error))

	/* ---- timers and gates ------------------------------------------------ */

	let debounceTimer: unknown = null
	const clearDebounce = () => {
		if (debounceTimer !== null) env.clearTimeout(debounceTimer)
		debounceTimer = null
	}
	const searchGate = createRequestGate()
	const facetGate = createRequestGate()
	const openGate = createRequestGate()
	let foldersSeq = 0
	let taggingSeq = 0

	/* ---- the URL ----------------------------------------------------------- */

	function syncUrl(mode: 'replace' | 'push') {
		const location = env.location()
		const url = buildUrl(location, searchFromParams(state.params, state.openId))
		if (url === buildUrl(location, location.search)) return
		if (mode === 'push') {
			// The same search spelled differently is not a new history entry.
			const there = paramsFromSearch(location.search)
			if (sameParams(there.params, state.params) && there.asset === state.openId) return
			env.pushUrl(url)
		} else env.replaceUrl(url)
	}

	/* ---- fetching the list ------------------------------------------------- */

	/** The "all matching" flag survives a new page only while the total it was made under still holds. */
	const reconcileAllMatching = (
		selection: Selection,
		total: number,
		ids: readonly string[],
	): Selection => {
		if (!selection.allMatching) return selection
		if (selection.matchTotal !== total)
			return { ...selection, allMatching: false, matchTotal: 0 }
		return extendAllMatching(selection, ids)
	}

	async function fetchPage(kind: 'first' | 'more' | 'refresh', opts: { prune?: boolean } = {}) {
		const ticket = searchGate.begin()
		const params = state.params
		const key = resultsKeyOf(params)
		const offset = kind === 'more' ? state.nextOffset : 0
		const limit =
			kind === 'refresh'
				? clampInt(state.nextOffset, MEDIA_LIMITS.pageSize, MEDIA_LIMITS.maxPageSize)
				: undefined
		if (kind === 'first')
			set({ loading: true, loadingMore: false, refreshing: false, error: null })
		else if (kind === 'more') set({ loadingMore: true, refreshing: false, error: null })
		else set({ refreshing: true, loadingMore: false })

		let response: MediaSearchResponse
		try {
			response = await api.search(
				requestFor(params, { offset, limit, facets: kind !== 'more' }),
				ticket.signal,
			)
		} catch (error) {
			// Superseded or cancelled: a newer request owns the state now.
			if (!ticket.isCurrent() || isAbortError(error)) return
			const message = messageOf(error)
			if (kind === 'refresh') {
				set({ refreshing: false })
				notify('error', `Could not refresh the images. ${message}`, { retry: 'refresh' })
			} else {
				set({ loading: false, loadingMore: false, error: message })
				announce(`Could not load images. ${message}`)
			}
			return
		}
		if (!ticket.isCurrent()) return

		const page = dedupeById(response.assets)
		const ids = page.map((asset) => asset.id)
		const meta = {
			total: response.total,
			truncated: response.truncated === true,
			hasMore: response.hasMore === true,
			pending: typeof response.pending === 'number' ? response.pending : state.pending,
			resultsKey: key,
			error: null,
			loading: false,
			loadingMore: false,
			refreshing: false,
		}
		if (kind === 'more') {
			const merged = appendPage(state.assets, page)
			const added = merged.length - state.assets.length
			set({
				...meta,
				assets: merged,
				nextOffset: offset + response.assets.length,
				selection: reconcileAllMatching(state.selection, response.total, ids),
			})
			announce(
				`Loaded ${pluralize(added, 'more image')}. ${formatCount(merged.length)} of ${formatCount(
					response.total,
				)} shown.`,
			)
		} else {
			const totalChanged = response.total !== state.total
			let selection = reconcileAllMatching(state.selection, response.total, ids)
			if (kind === 'refresh' && opts.prune)
				selection = pruneSelection(selection, new Set(ids))
			set({
				...meta,
				assets: page,
				nextOffset: offset + response.assets.length,
				sortApplied: isSort(response.sort) ? response.sort : state.sortApplied,
				query: response.query ?? EMPTY_QUERY,
				corrections: response.corrections ?? [],
				dropped: response.dropped ?? [],
				facets: response.facets ?? null,
				selection,
				selecting: !isEmptySelection(state.selection) && isEmptySelection(selection) ? false : state.selecting,
			})
			if (kind === 'first' || totalChanged)
				announce(
					describeSearchOutcome({
						total: response.total,
						truncated: response.truncated === true,
						dropped: response.dropped ?? [],
						corrections: response.corrections ?? [],
					}),
				)
		}
		evaluateLoop()
	}

	/** First page of the current search again, with skeletons (a retry, or a refresh that caught a new search in flight). */
	const fetchFirst = () => void fetchPage('first')

	function loadMore() {
		if (state.loading || state.loadingMore || state.refreshing) return
		if (!state.hasMore || state.error !== null) return
		void fetchPage('more')
	}

	/** Reloads the list in place (the cards stay until the answer lands). */
	function refreshList(opts: { prune?: boolean } = {}) {
		if (!mounted) return
		if (state.loading) return fetchFirst()
		void fetchPage('refresh', opts)
	}

	function retry() {
		if (state.loading || state.loadingMore || state.refreshing) return
		if (state.assets.length === 0) return fetchFirst()
		set({ error: null })
		loadMore()
	}

	async function refreshFolders(): Promise<boolean> {
		const mine = ++foldersSeq
		try {
			const folders = await api.listFolders()
			if (mine === foldersSeq && mounted) set({ folders })
			return true
		} catch {
			// The counts are a convenience; the tree keeps what it has.
			return false
		}
	}

	async function refreshTagging(): Promise<void> {
		const mine = ++taggingSeq
		try {
			const tagging = await api.processStatus()
			if (mine !== taggingSeq || !mounted) return
			set({ tagging, pending: tagging.pending })
			evaluateLoop()
		} catch {
			// Status is a convenience.
		}
	}

	/** Facet counts after tags changed, without touching the cards. */
	async function refreshFacets(): Promise<void> {
		if (!mounted || state.loading) return
		const ticket = facetGate.begin()
		const params = state.params
		try {
			const response = await api.search(
				requestFor(params, { offset: 0, limit: 1, facets: true }),
				ticket.signal,
			)
			if (!ticket.isCurrent() || !sameParams(params, state.params) || !response.facets) return
			set({ facets: response.facets })
		} catch {
			// Counts that could not refresh are simply the old counts.
		}
	}

	/* ---- coalesced refreshes ---------------------------------------------- */

	let refreshTimer: unknown = null
	let refreshWanted = { list: false, folders: false, tagging: false, prune: false }
	function scheduleRefresh(wanted: Partial<typeof refreshWanted>) {
		refreshWanted = {
			list: refreshWanted.list || wanted.list === true,
			folders: refreshWanted.folders || wanted.folders === true,
			tagging: refreshWanted.tagging || wanted.tagging === true,
			prune: refreshWanted.prune || wanted.prune === true,
		}
		if (refreshTimer !== null || !mounted) return
		refreshTimer = env.setTimeout(() => {
			refreshTimer = null
			const run = refreshWanted
			refreshWanted = { list: false, folders: false, tagging: false, prune: false }
			if (run.list) refreshList({ prune: run.prune })
			if (run.folders) void refreshFolders()
			if (run.tagging) void refreshTagging()
		}, REFRESH_DELAY_MS)
	}

	let facetTimer: unknown = null
	function scheduleFacets() {
		if (facetTimer !== null || !mounted) return
		facetTimer = env.setTimeout(() => {
			facetTimer = null
			void refreshFacets()
		}, FACET_REFRESH_DELAY_MS)
	}

	/* ---- the search -------------------------------------------------------- */

	function applyParams(
		next: Partial<LibraryParams>,
		opts: { history: HistoryMode; keepOpen?: boolean; setDraft?: boolean; force?: boolean },
	): boolean {
		const params = normalizeParams(next)
		const prev = state.params
		if (!opts.force && sameParams(prev, params)) return false
		clearDebounce()
		// A change of q, folder or deep ends the selection; a change of sort does not.
		const selection = selectionAfterParamsChange(prev, params, state.selection)
		set({
			params,
			draft: opts.setDraft === false ? state.draft : params.q,
			selection,
			selecting: selection !== state.selection ? false : state.selecting,
			openId: opts.keepOpen ? state.openId : null,
			fetchedAsset: opts.keepOpen ? state.fetchedAsset : null,
			assets: [],
			hasMore: false,
			loading: true,
			loadingMore: false,
			refreshing: false,
			error: null,
		})
		if (opts.history !== 'none') syncUrl(opts.history)
		void fetchPage('first')
		return true
	}

	const recordRecent = (q: string) => {
		const recent = pushRecent(state.recent, q)
		if (recent.join('\u0000') === state.recent.join('\u0000')) return
		set({ recent })
		env.writeStorage(RECENT_KEY, JSON.stringify(recent))
	}

	function commitQuery(text: string, explicit: boolean) {
		const q = normalizeParams({ q: text }).q
		if (q === state.params.q) {
			// Enter on a search that failed is a retry.
			if (explicit && state.error !== null) retry()
		} else applyParams({ ...state.params, q }, { history: 'replace', setDraft: false })
		if (explicit && q) recordRecent(q)
	}

	function setDraft(text: string) {
		const draft = typeof text === 'string' ? text.slice(0, MEDIA_LIMITS.queryMax) : ''
		set({ draft })
		clearDebounce()
		if (normalizeParams({ q: draft }).q === state.params.q) return
		debounceTimer = env.setTimeout(() => {
			debounceTimer = null
			commitQuery(state.draft, false)
		}, SEARCH_DEBOUNCE_MS)
	}

	function submitDraft(text: string) {
		const draft = typeof text === 'string' ? text.slice(0, MEDIA_LIMITS.queryMax) : ''
		clearDebounce()
		set({ draft })
		commitQuery(draft, true)
	}

	/** The query in the box with its folder clauses out, for a click that picks a folder instead. */
	const baseQuery = () => stripFolderClauses(state.draft)

	function selectFolder(folder: FolderSelection) {
		applyParams(
			{ q: baseQuery(), folder, sort: state.params.sort },
			{ history: 'push' },
		)
	}

	function selectFolderFromFacet(id: string) {
		// The count beside a facet folder is for images directly in it: show exactly those.
		applyParams(
			{ q: baseQuery(), folder: id, deep: false, sort: state.params.sort },
			{ history: 'push' },
		)
	}

	function showReview() {
		applyParams({ q: 'is:unreviewed', sort: state.params.sort }, { history: 'push' })
	}

	function applySaved(saved: MediaSavedSearchDTO) {
		applyParams(
			{
				q: saved.query,
				folder: saved.folder ?? undefined,
				sort: saved.sort ?? undefined,
			},
			{ history: 'push' },
		)
	}

	function clearScope() {
		applyParams({ q: state.draft, sort: state.params.sort }, { history: 'push' })
	}

	function toggleDeep() {
		const { params } = state
		applyParams(
			{ q: state.draft, folder: params.folder, deep: !effectiveDeep(params), sort: params.sort },
			{ history: 'replace' },
		)
	}

	function clearAll() {
		applyParams(
			{ q: '', sort: state.params.sort },
			{ history: state.params.folder !== undefined ? 'push' : 'replace' },
		)
	}

	function setSort(sort: MediaSort) {
		const { params } = state
		applyParams(
			{ q: state.draft, folder: params.folder, deep: params.deep, sort },
			{ history: 'replace' },
		)
	}

	/** Edits the text in the box and runs it now (a chip's x, a facet, a clause from the detail panel). */
	function editQuery(change: (q: string) => string) {
		const { params } = state
		applyParams(
			{ q: change(state.draft), folder: params.folder, deep: params.deep, sort: params.sort },
			{ history: 'replace' },
		)
	}

	const removeChip = (chip: QueryChip) => editQuery((q) => removeChipFromQuery(q, chip))
	const toggleFacet = (clause: string, active: boolean) =>
		editQuery((q) => toggleFacetClause(q, clause, active))

	function filterBy(clause: string) {
		// The sheet is in the way of the results, and a clause already there must still close
		// it: that case changes no search, so nothing else would take `?asset=` out of the URL.
		setOpen(null, 'replace')
		editQuery((q) => addClause(q, clause))
	}

	/* ---- the open image ---------------------------------------------------- */

	async function fetchOpen(id: string) {
		const ticket = openGate.begin()
		try {
			const asset = await api.getAsset(id, ticket.signal)
			if (!ticket.isCurrent() || state.openId !== id) return
			set({ fetchedAsset: asset })
		} catch (error) {
			if (!ticket.isCurrent() || isAbortError(error)) return
			if (state.openId === id) {
				set({ openId: null, fetchedAsset: null })
				syncUrl('replace')
			}
			notify(
				'error',
				error instanceof MediaApiError && error.status === 404
					? 'That image could not be found. It may have been deleted.'
					: `Could not open that image. ${messageOf(error)}`,
			)
		}
	}

	function setOpen(id: string | null, history: HistoryMode) {
		if (id === state.openId) return
		const kept = id !== null && state.fetchedAsset?.id === id ? state.fetchedAsset : null
		if (id === null) openGate.cancel()
		set({ openId: id, fetchedAsset: kept })
		if (history !== 'none') syncUrl('replace')
		if (id !== null && !kept && !state.assets.some((asset) => asset.id === id)) void fetchOpen(id)
	}

	const openIndex = () =>
		state.openId === null ? -1 : state.assets.findIndex((asset) => asset.id === state.openId)

	function step(delta: 1 | -1) {
		const at = openIndex()
		if (at < 0) return
		const target = state.assets[at + delta]
		if (target) setOpen(target.id, 'replace')
		// Near the end of what is loaded, bring the next page so Next keeps going.
		if (delta === 1 && at >= state.assets.length - 2) loadMore()
	}

	/* ---- selection --------------------------------------------------------- */

	const order = () => state.assets.map((asset) => asset.id)

	function toggleSelect(id: string, opts: { range: boolean }) {
		const selection = toggleSelection(state.selection, id, { range: opts.range, order: order() })
		set({ selection, selecting: isEmptySelection(selection) ? false : state.selecting })
	}

	function toggleAll() {
		const selection = toggleAllLoaded(state.selection, order())
		set({ selection, selecting: isEmptySelection(selection) ? false : state.selecting })
	}

	function selectAllMatchingNow() {
		if (
			!canSelectAllMatching({
				total: state.total,
				truncated: state.truncated,
				dropped: state.dropped,
			})
		)
			return
		set({ selection: selectAllMatching(state.selection, order(), state.total) })
	}

	function selectEveryLoaded() {
		set({ selection: selectAllLoaded(state.selection, order()) })
	}

	function clearSelection() {
		set({ selection: emptySelection, selecting: false })
	}

	function toggleSelecting() {
		if (state.selecting) clearSelection()
		else set({ selecting: true })
	}

	/* ---- editing one image -------------------------------------------------- */

	const patchQueues = new Map<string, Promise<void>>()
	const patchesInFlight = new Map<string, number>()

	/** The asset moved or was deleted and no longer belongs in the grid: take it out, keep the sheet open. */
	function dropFromList(ids: readonly string[]) {
		const gone = new Set(ids)
		const keep = state.openId !== null && gone.has(state.openId) ? findAsset(state.openId) : undefined
		const before = state.assets.length
		const assets = removeAssets(state.assets, gone)
		set({
			assets,
			total: Math.max(0, state.total - (before - assets.length)),
			fetchedAsset: keep ?? state.fetchedAsset,
		})
	}

	function patchAsset(patch: AssetPatch, id?: string): Promise<void> {
		const target = id ?? state.openId
		try {
			requirePermission('write')
		} catch (error) {
			return Promise.reject(error)
		}
		if (!target) return Promise.reject(new Error('No image is open.'))

		// Shown at once; rolled back if the server says no.
		const current = findAsset(target)
		const edit = current ? optimisticPatch(current, patch, folderPathOf) : null
		if (edit) mapAsset(target, () => edit.next)
		patchesInFlight.set(target, (patchesInFlight.get(target) ?? 0) + 1)

		// One call at a time per image: two in flight can answer out of order.
		const run = (patchQueues.get(target) ?? Promise.resolve()).then(async () => {
			let server: MediaAssetDTO
			try {
				server = await api.patchAsset(target, patch)
			} catch (error) {
				patchesInFlight.set(target, Math.max(0, (patchesInFlight.get(target) ?? 1) - 1))
				if (edit) mapAsset(target, edit.undo)
				const message = messageOf(error)
				// The open sheet shows the rejection inline; anywhere else it would go unseen.
				if (state.openId === target) announce(`Could not save that change. ${message}`)
				else notify('error', `Could not save that change. ${message}`)
				throw new Error(message)
			}
			const left = Math.max(0, (patchesInFlight.get(target) ?? 1) - 1)
			patchesInFlight.set(target, left)
			// While a later edit is still out, its own answer is the final truth.
			if (left === 0) mapAsset(target, (asset) => mergeServerAsset(asset, server))
			if (patch.folderId !== undefined) afterSingleMove(target, server)
			if ((patch.addTags?.length ?? 0) > 0 || (patch.removeTags?.length ?? 0) > 0) {
				scheduleFacets()
				scheduleRefresh({ folders: true })
			}
		})
		patchQueues.set(
			target,
			run.catch(() => undefined),
		)
		return run
	}

	/** After one image was moved: does it still belong in this view? Folder counts change either way. */
	function afterSingleMove(id: string, server: MediaAssetDTO) {
		const stays = folderStillInScope(state.params, state.folders.folders, server.folderId)
		if (stays === false) dropFromList([id])
		scheduleRefresh({ folders: true, list: stays === null })
	}

	async function deleteAsset(id?: string): Promise<void> {
		requirePermission('delete')
		const target = id ?? state.openId
		if (!target) throw new Error('No image is open.')
		try {
			await api.deleteAsset(target)
		} catch (error) {
			throw failure(error)
		}
		dropFromList([target])
		set({ selection: removeFromSelection(state.selection, new Set([target])) })
		// The sheet was showing it.
		if (state.openId === target) setOpen(null, 'replace')
		notify('info', 'Deleted 1 image.')
		scheduleRefresh({ list: true, folders: true })
	}

	async function retagAsset(id?: string): Promise<void> {
		requirePermission('write')
		const target = id ?? state.openId
		if (!target) throw new Error('No image is open.')
		let affected: number
		try {
			affected = (await api.bulk({ action: 'retag', target: { ids: [target] } })).affected
		} catch (error) {
			throw failure(error)
		}
		if (affected > 0) markQueued([target], affected)
		else notify('warn', describeBulkResult('retag', 1, 0).text)
	}

	/** Images put back in the queue: their cards say so, and the loop has work. */
	function markQueued(ids: readonly string[], affected: number) {
		const queued = new Set(ids)
		const assets = state.assets.map((asset) =>
			queued.has(asset.id) ? { ...asset, tagging: { status: 'pending' as const } } : asset,
		)
		const fetched =
			state.fetchedAsset && queued.has(state.fetchedAsset.id)
				? { ...state.fetchedAsset, tagging: { status: 'pending' as const } }
				: state.fetchedAsset
		const pending = state.pending + affected
		set({
			assets,
			fetchedAsset: fetched,
			pending,
			tagging: { ...state.tagging, pending: state.tagging.pending + affected },
			aiBlocked: null,
		})
		aiFatal = false
		evaluateLoop()
	}

	/* ---- bulk actions -------------------------------------------------------- */

	type BulkExtra =
		| { action: 'move'; folderId: string | null }
		| { action: 'addTags'; tags: string[] }
		| { action: 'removeTags'; tags: string[] }
		| { action: 'delete' }
		| { action: 'retag' }
		| { action: 'acceptAutoTags' }

	/** Builds the whole body for one chunk of the target. */
	const bulkBody = (extra: BulkExtra, target: BulkTarget): BulkBody => ({ ...extra, target }) as BulkBody

	/**
	 * Runs one action over the selection and says how many it changed against how many were
	 * asked. A big id selection goes in slices the server accepts; an "all matching" one goes
	 * as the search with the total the person saw, and a 409 (the set moved) ends that mode.
	 */
	async function runBulk(extra: BulkExtra): Promise<{ asked: number; affected: number }> {
		const selection = state.selection
		const asked = selection.allMatching ? selection.matchTotal : selection.ids.size
		if (asked === 0) throw new Error('Select some images first.')
		const target = bulkTargetFor(selection, state.resultsKey, state.total)
		let affected = 0
		try {
			if ('ids' in target) {
				for (const slice of chunkIds(target.ids, MEDIA_LIMITS.bulkIdsCap))
					affected += (await api.bulk(bulkBody(extra, { ids: slice }))).affected
			} else affected = (await api.bulk(bulkBody(extra, target))).affected
		} catch (error) {
			const message = messageOf(error)
			if ('search' in target) {
				// Whatever the server saw, it is not what the person confirmed.
				set({ selection: { ...state.selection, allMatching: false, matchTotal: 0 } })
				if (error instanceof MediaApiError && error.status === 409) refreshList()
			}
			throw new Error(
				affected > 0
					? `${formatCount(affected)} of ${pluralize(asked, 'image')} changed before this stopped. ${message}`
					: message,
			)
		}
		return { asked, affected }
	}

	function report(action: MediaBulkAction, asked: number, affected: number) {
		const result = describeBulkResult(action, asked, affected)
		notify(result.tone, result.text)
	}

	async function bulkMove(folderId: string | null): Promise<void> {
		requirePermission('write')
		const { asked, affected } = await runBulk({ action: 'move', folderId })
		report('move', asked, affected)
		clearSelection()
		scheduleRefresh({ list: true, folders: true, prune: true })
	}

	async function bulkTags(change: { add: string[]; remove: string[] }): Promise<void> {
		requirePermission('write')
		let asked = 0
		let added: number | null = null
		let removed: number | null = null
		if (change.add.length > 0) {
			const result = await runBulk({ action: 'addTags', tags: change.add })
			asked = result.asked
			added = result.affected
		}
		if (change.remove.length > 0) {
			try {
				const result = await runBulk({ action: 'removeTags', tags: change.remove })
				asked = result.asked
				removed = result.affected
			} catch (error) {
				// The first half is done; say so rather than let "failed" hide it.
				if (added !== null) {
					scheduleRefresh({ list: true, folders: true })
					scheduleFacets()
					throw new Error(
						`Tags were added to ${pluralize(added, 'image')}, but they could not be removed. ${messageOf(error)}`,
					)
				}
				throw error
			}
		}
		// One notice for the whole dialog: a second one would replace the first unread.
		const results: { tone: Tone; text: string }[] = []
		if (added !== null) results.push(describeBulkResult('addTags', asked, added))
		if (removed !== null) results.push(describeBulkResult('removeTags', asked, removed))
		if (results.length > 0) {
			const combined = combineResults(results)
			notify(combined.tone, combined.text)
		}
		scheduleRefresh({ list: true, folders: true })
		scheduleFacets()
	}

	async function bulkRetag(): Promise<void> {
		requirePermission('write')
		const ids = state.selection.allMatching ? [] : [...state.selection.ids]
		const { asked, affected } = await runBulk({ action: 'retag' })
		report('retag', asked, affected)
		if (affected > 0) markQueued(ids, affected)
		scheduleRefresh({ list: true })
	}

	async function bulkAccept(): Promise<void> {
		requirePermission('write')
		try {
			const { asked, affected } = await runBulk({ action: 'acceptAutoTags' })
			report('acceptAutoTags', asked, affected)
		} catch (error) {
			notify('error', messageOf(error))
			return
		}
		// Kept images leave the review queue: the list, its counts and the rail change.
		scheduleRefresh({ list: true, folders: true, prune: true })
		scheduleFacets()
	}

	async function bulkDelete(): Promise<void> {
		requirePermission('delete')
		const selection = state.selection
		const ids = selection.allMatching ? [] : [...selection.ids]
		const { asked, affected } = await runBulk({ action: 'delete' })
		report('delete', asked, affected)
		if (!selection.allMatching) dropFromList(ids)
		// An open image that was deleted is gone with the rest.
		if (state.openId !== null && (selection.allMatching || ids.includes(state.openId)))
			setOpen(null, 'replace')
		clearSelection()
		scheduleRefresh({ list: true, folders: true, prune: true })
	}

	/* ---- folders ------------------------------------------------------------- */

	async function createFolder(parentId: string | null, name: string): Promise<void> {
		requirePermission('write')
		try {
			await api.createFolder({ name, parentId })
		} catch (error) {
			throw failure(error)
		}
		await refreshFolders()
	}

	async function renameFolder(id: string, name: string): Promise<void> {
		requirePermission('write')
		try {
			await api.patchFolder(id, { name })
		} catch (error) {
			throw failure(error)
		}
		await refreshFolders()
		// Cards show their folder's path: reload them.
		scheduleRefresh({ list: true })
	}

	async function moveFolder(id: string, parentId: string | null): Promise<void> {
		requirePermission('write')
		try {
			await api.patchFolder(id, { parentId })
		} catch (error) {
			throw failure(error)
		}
		await refreshFolders()
		scheduleRefresh({ list: true })
	}

	async function deleteFolder(id: string): Promise<void> {
		requirePermission('delete')
		const parent = state.folders.folders.find((f) => f.id === id)?.parentId ?? null
		try {
			await api.deleteFolder(id)
		} catch (error) {
			throw failure(error)
		}
		await refreshFolders()
		// Looking at the folder that just went: its images moved up, so go where they went.
		if (state.params.folder === id)
			applyParams(
				{ q: state.draft, folder: parent ?? 'unfiled', sort: state.params.sort },
				{ history: 'replace' },
			)
		else scheduleRefresh({ list: true })
	}

	async function dropAssets(folderId: string | null, ids: string[]): Promise<void> {
		requirePermission('write')
		if (ids.length === 0) return
		let affected = 0
		try {
			for (const slice of chunkIds(ids, MEDIA_LIMITS.bulkIdsCap))
				affected += (
					await api.bulk({ action: 'move', target: { ids: slice }, folderId })
				).affected
		} catch (error) {
			throw failure(error)
		}
		if (affected === 0) throw new Error(describeBulkResult('move', ids.length, 0).text)
		if (affected < ids.length) report('move', ids.length, affected)
		else notify('info', `Moved ${pluralize(affected, 'image')}.`)
		const dragged = new Set(ids)
		if ([...state.selection.ids].some((id) => dragged.has(id))) clearSelection()
		scheduleRefresh({ list: true, folders: true, prune: true })
	}

	/* ---- saved searches ------------------------------------------------------- */

	async function saveSearch(name: string): Promise<void> {
		requirePermission('write')
		const { params } = state
		let created: MediaSavedSearchDTO
		try {
			created = await api.createSaved({
				name,
				query: params.q,
				folder: params.folder ?? null,
				sort: params.sort ?? null,
			})
		} catch (error) {
			throw failure(error)
		}
		set({ saved: [created, ...state.saved.filter((item) => item.id !== created.id)] })
		announce(`Saved the search "${created.name}".`)
	}

	async function deleteSaved(id: string): Promise<void> {
		requirePermission('write')
		try {
			await api.deleteSaved(id)
		} catch (error) {
			throw failure(error)
		}
		set({ saved: state.saved.filter((item) => item.id !== id) })
	}

	/* ---- tags ------------------------------------------------------------------ */

	const fetchTags = (): Promise<MediaTagStat[]> =>
		api.listTags({ limit: 2000 }).catch((error) => {
			throw failure(error)
		})

	/** A tag changed everywhere: the box, the cards, the counts and the rail follow. */
	function afterTagChange(from: string, to: string | null) {
		if (to !== null && to !== from) {
			const rewritten = rewriteTagClause(state.draft, from, to)
			if (rewritten !== state.draft) {
				editQuery(() => rewritten)
				scheduleRefresh({ folders: true })
				return
			}
		}
		scheduleRefresh({ list: true, folders: true })
		scheduleFacets()
	}

	async function renameTag(slug: string, label: string) {
		requirePermission('write')
		try {
			const result = await api.renameTag(slug, label)
			afterTagChange(slug, result.slug)
			return { slug: result.slug, merged: result.merged }
		} catch (error) {
			throw failure(error)
		}
	}

	async function mergeTag(slug: string, into: string): Promise<void> {
		requirePermission('write')
		try {
			await api.mergeTag(slug, into)
		} catch (error) {
			throw failure(error)
		}
		afterTagChange(slug, into)
	}

	async function deleteTag(slug: string): Promise<void> {
		requirePermission('delete')
		try {
			await api.deleteTag(slug)
		} catch (error) {
			throw failure(error)
		}
		afterTagChange(slug, null)
	}

	/* ---- suggestions ----------------------------------------------------------- */

	const fetchSuggestions = async (
		input: string,
		signal: AbortSignal,
	): Promise<MediaSuggestion[]> => {
		try {
			return await api.suggest(input, signal)
		} catch {
			return []
		}
	}

	const fetchTagSuggestions = async (q: string, signal?: AbortSignal): Promise<MediaTagStat[]> => {
		try {
			return await api.listTags({ q, limit: 20 }, signal)
		} catch {
			return []
		}
	}

	/* ---- upload ---------------------------------------------------------------- */

	/** Folder of every asset this page saw created, so "Select them" can open the right one. */
	const createdIn = new Map<string, string | null>()

	function onRegistered(result: MediaRegisterResponse) {
		if (result.status === 'created') {
			createdIn.set(result.asset.id, result.asset.folderId)
			if (createdIn.size > 2_000) createdIn.delete(createdIn.keys().next().value as string)
			if (result.asset.tagging?.status === 'pending')
				set({
					pending: state.pending + 1,
					tagging: { ...state.tagging, pending: state.tagging.pending + 1 },
				})
		}
		scheduleRefresh({ list: true, folders: true, tagging: true })
		evaluateLoop()
	}

	function onSelectBatch(ids: string[]) {
		if (ids.length === 0) return
		const homes = new Set<string | null>()
		for (const id of ids) {
			const home = createdIn.get(id)
			if (home !== undefined) homes.add(home)
		}
		// One shared folder is opened; mixed or unknown shows everything, where they all are.
		const only = homes.size === 1 ? [...homes][0] : undefined
		const folder = homes.size === 1 ? (only === null ? 'unfiled' : only) : undefined
		// The text query goes (it could hide them) and so does the sort (they would sort to page two).
		const moved = applyParams({ q: '', folder }, { history: 'push' })
		if (!moved) refreshList()
		// After the navigation, which clears any selection made under the old search.
		set({
			selection: { ids: new Set(ids), anchor: null, allMatching: false, matchTotal: 0 },
			selecting: true,
		})
		scheduleRefresh({ folders: true })
	}

	/* ---- the AI loop ------------------------------------------------------------- */

	/** An explicit "Tag them now": runs even when the counts say nothing is waiting yet. */
	let forced = false
	/** The server said "not you" (401/403/404): no point asking again until the page is reloaded. */
	let aiFatal = false
	let taggedThisRun = 0
	let lastTaggingAnnounce = Number.NEGATIVE_INFINITY

	function handleProcessResponse(response: MediaProcessResponse) {
		forced = false
		let assets = state.assets
		let fetched = state.fetchedAsset
		for (const item of response.processed) {
			if (!item.asset) continue
			const asset = item.asset
			const at = assets.findIndex((a) => a.id === asset.id)
			if (at >= 0) {
				assets = assets.slice()
				assets[at] = mergeServerAsset(assets[at], asset)
			}
			if (fetched?.id === asset.id) fetched = mergeServerAsset(fetched, asset)
		}
		const remaining = Math.max(0, response.remaining)
		set({
			assets,
			fetchedAsset: fetched,
			pending: remaining,
			tagging: {
				...state.tagging,
				configured: response.configured,
				pending: remaining,
				budgetExhausted: response.budgetExhausted,
			},
			...(response.blocked?.kind === 'config' ? { aiBlocked: response.blocked.message } : {}),
		})
		if (response.processed.length > 0) {
			taggedThisRun += response.processed.length
			scheduleFacets()
			const now = env.now()
			// Progress is read out now and then; finishing is news every time.
			if (remaining === 0 || now - lastTaggingAnnounce >= ANNOUNCE_TAGGING_EVERY_MS) {
				lastTaggingAnnounce = now
				announce(
					remaining > 0
						? `Tagged ${pluralize(response.processed.length, 'image')}. ${formatCount(remaining)} left.`
						: `Auto-tagging finished. ${pluralize(taggedThisRun, 'image')} tagged.`,
				)
			}
		}
	}

	const loop = createAiLoop({
		call: (opts, signal) => api.process(opts, signal),
		now: () => env.now(),
		setTimeout: (callback, ms) => env.setTimeout(callback, ms),
		clearTimeout: (handle) => env.clearTimeout(handle),
		hidden: () => env.hidden(),
		onResponse: handleProcessResponse,
		onWorking: (aiWorking) => {
			if (aiWorking !== state.aiWorking) set({ aiWorking })
		},
		onStop(reason, message) {
			forced = false
			if (reason === 'blocked') {
				set({ aiBlocked: message ?? 'Auto-tagging stopped.' })
				announce(message ?? 'Auto-tagging stopped.')
			} else if (reason === 'budget') {
				void refreshTagging()
				announce('The daily auto-tagging limit was reached.')
			} else if (reason === 'done') {
				taggedThisRun = 0
				void refreshTagging()
				void refreshFolders()
			} else if (reason === 'fatal') aiFatal = true
		},
		onError(error, fatal) {
			if (fatal) notify('error', `Auto-tagging stopped. ${messageOf(error)}`)
		},
	})

	function evaluateLoop() {
		const { tagging } = state
		const wanted =
			mounted &&
			(forced ||
				(options.can().write &&
					tagging.configured &&
					state.pending > 0 &&
					!tagging.budgetExhausted &&
					state.aiBlocked === null &&
					!aiFatal))
		loop.setActive(wanted)
	}

	/** Queue every skipped or failed image again and start: the banner's "Tag them now" and Retry. */
	function requeueAndTag() {
		if (!options.can().write) return
		set({ aiBlocked: null })
		aiFatal = false
		forced = true
		taggedThisRun = 0
		loop.kick({ requeue: true })
	}

	/* ---- popstate, visibility, mount --------------------------------------------- */

	function restoreFromUrl() {
		if (!mounted) return
		const { params, asset } = paramsFromSearch(env.location().search)
		if (!sameParams(params, state.params))
			applyParams(params, { history: 'none', keepOpen: true, setDraft: true })
		setOpen(asset, 'none')
	}

	function onVisibility() {
		if (env.hidden()) loop.pause()
		else loop.resume()
	}

	function hydrateFromStorage() {
		const density = parseDensity(env.readStorage(DENSITY_KEY))
		const recent = parseRecent(env.readStorage(RECENT_KEY))
		const patch: Partial<LibraryState> = {}
		if (density && density !== state.density) patch.density = density
		if (recent.length > 0) patch.recent = recent
		if (Object.keys(patch).length > 0) set(patch)
	}

	let cleanups: (() => void)[] = []

	function unmount() {
		if (!mounted) return
		mounted = false
		for (const cleanup of cleanups.splice(0)) cleanup()
		clearDebounce()
		clearNoticeTimer()
		for (const timer of [refreshTimer, facetTimer]) if (timer !== null) env.clearTimeout(timer)
		refreshTimer = null
		facetTimer = null
		refreshWanted = { list: false, folders: false, tagging: false, prune: false }
		searchGate.cancel()
		facetGate.cancel()
		openGate.cancel()
		loop.setActive(false)
	}

	/**
	 * On mount, the URL is read and compared with what the server rendered. `initial` can be
	 * stale after a client-side Back, so when the two differ the first page is fetched again
	 * (with facets), seeded from the URL, and the server-rendered results are discarded.
	 */
	function mount(): () => void {
		if (mounted) return unmount
		mounted = true
		cleanups = [env.onPopState(restoreFromUrl), env.onVisibilityChange(onVisibility)]
		hydrateFromStorage()
		const decision = decideReconcile(initial.params, env.location().search)
		if (decision.refetch)
			applyParams(decision.params, {
				history: 'none',
				keepOpen: true,
				setDraft: true,
				force: true,
			})
		if (decision.asset) setOpen(decision.asset, 'none')
		evaluateLoop()
		return unmount
	}

	/* ---- the public surface --------------------------------------------------------- */

	const actions = {
		setDraft,
		submitDraft,
		removeChip,
		clearScope,
		toggleDeep,
		clearAll,
		setSort,
		selectFolder,
		selectFolderFromFacet,
		showReview,
		applySaved,
		toggleFacet,
		filterBy,
		loadMore,
		retry,
		refresh: () => refreshList(),
		retryRefresh() {
			set({ notice: null })
			refreshList()
		},

		toggleSelect,
		toggleAll,
		selectAllMatching: selectAllMatchingNow,
		selectEveryLoaded,
		clearSelection,
		toggleSelecting,

		openAsset: (id: string) => setOpen(id, 'replace'),
		closeDetail: () => setOpen(null, 'replace'),
		prev: () => step(-1),
		next: () => step(1),
		patchAsset,
		deleteAsset,
		retagAsset,

		bulkMove,
		bulkTags,
		bulkRetag,
		bulkAccept,
		bulkDelete,

		createFolder,
		renameFolder,
		moveFolder,
		deleteFolder,
		dropAssets,

		saveSearch,
		deleteSaved,

		fetchTags,
		renameTag,
		mergeTag,
		deleteTag,

		fetchSuggestions,
		fetchTagSuggestions,

		onRegistered,
		onSelectBatch,
		onUploadBusy: (uploadBusy: boolean) => set({ uploadBusy }),

		tagUntagged: requeueAndTag,
		retryFailed: requeueAndTag,

		setDensity(density: Density) {
			if (density === state.density) return
			set({ density })
			env.writeStorage(DENSITY_KEY, density)
		},
		dismissNotice() {
			clearNoticeTimer()
			if (state.notice !== null) set({ notice: null })
		},
		announce,
		/** The role changed under a mounted page: the loop and the guards follow it. */
		permissionsChanged: evaluateLoop,
	}

	return {
		getState: () => state,
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		actions,
		mount,
	}
}

export type LibraryController = ReturnType<typeof createLibraryController>
export type LibraryActions = LibraryController['actions']

/* -------------------------------------------------------------------------- */
/* Selectors: what the screen is made of                                      */
/* -------------------------------------------------------------------------- */

export function selectOpenAsset(state: LibraryState): MediaAssetDTO | null {
	if (state.openId === null) return null
	return (
		state.assets.find((asset) => asset.id === state.openId) ??
		(state.fetchedAsset?.id === state.openId ? state.fetchedAsset : null)
	)
}

export const selectOpenIndex = (state: LibraryState): number =>
	state.openId === null ? -1 : state.assets.findIndex((asset) => asset.id === state.openId)

/** The folder id uploads go to (null is the root) and how the button says so. */
export function selectDestination(state: LibraryState): { folderId: string | null; label: string } {
	const folder = state.params.folder
	if (folder && folder !== 'unfiled') {
		const known = state.folders.folders.find((f) => f.id === folder)
		if (known) return { folderId: known.id, label: `Upload to ${known.path}` }
	}
	return { folderId: null, label: 'Upload to Unfiled' }
}

export type EmptyKind = 'library' | 'folder' | 'missing-folder' | 'results'

export function selectEmptyKind(state: LibraryState): EmptyKind {
	const { folder, q } = state.params
	if (folder && folder !== 'unfiled' && !state.folders.folders.some((f) => f.id === folder))
		return 'missing-folder'
	if (q !== '') return 'results'
	if (folder) return 'folder'
	return state.folders.total === 0 ? 'library' : 'results'
}

/** "All media / Clients / Acme": the open folder's chain, each step a place to go. */
export function selectBreadcrumb(
	state: LibraryState,
): { folder: FolderSelection; label: string; current: boolean }[] {
	const { folder } = state.params
	if (folder === undefined) return []
	const trail: { folder: FolderSelection; label: string; current: boolean }[] = [
		{ folder: undefined, label: 'All media', current: false },
	]
	if (folder === 'unfiled') return [...trail, { folder, label: 'Unfiled', current: true }]
	const byId = new Map(state.folders.folders.map((f) => [f.id, f]))
	const chain: MediaFolderDTO[] = []
	const seen = new Set<string>()
	for (let cursor = byId.get(folder); cursor && !seen.has(cursor.id); ) {
		seen.add(cursor.id)
		chain.unshift(cursor)
		cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
	}
	if (chain.length === 0) return trail
	return [
		...trail,
		...chain.map((f, index) => ({
			folder: f.id as FolderSelection,
			label: f.name,
			current: index === chain.length - 1,
		})),
	]
}

export function selectSubfolders(state: LibraryState): MediaFolderDTO[] {
	const { folder } = state.params
	if (!folder || folder === 'unfiled') return []
	return state.folders.folders.filter((f) => f.parentId === folder)
}

/** Tags on the target images with counts: counted from the chosen cards, or from the facets for "all matching". */
export function selectBulkExisting(
	state: LibraryState,
): { slug: string; label: string; count: number }[] {
	if (state.selection.allMatching)
		return (state.facets?.tags ?? []).map((tag) => ({
			slug: tag.value,
			label: tag.label,
			count: tag.count,
		}))
	return countTags(state.assets.filter((asset) => state.selection.ids.has(asset.id)))
}

/** For the Move dialog: where the chosen images are now, when they all agree. */
export function selectMoveCurrent(state: LibraryState): string | null | undefined {
	if (state.selection.allMatching) return undefined
	const chosen = state.assets.filter((asset) => state.selection.ids.has(asset.id))
	if (chosen.length === 0 || chosen.length < state.selection.ids.size) return undefined
	const first = chosen[0].folderId
	return chosen.every((asset) => asset.folderId === first) ? first : undefined
}

/** The scope of the current selection in words, for the confirmations. */
export function selectScopeText(state: LibraryState): string {
	const key = state.resultsKey
	const label =
		key.folder === undefined
			? null
			: key.folder === 'unfiled'
				? 'Unfiled'
				: (state.folders.folders.find((f) => f.id === key.folder)?.path ?? '')
	return describeSelectionScope({
		allMatching: state.selection.allMatching,
		count: state.selection.ids.size,
		total: state.selection.matchTotal || state.total,
		q: key.q,
		folderLabel: label,
		deep: key.folder !== undefined ? (key.deep ?? hasQueryClause(key.q)) : false,
	})
}

/** The number a bulk action is about: the whole result for "all matching", else the chosen cards. */
export const selectBulkCount = (state: LibraryState): number =>
	state.selection.allMatching ? state.selection.matchTotal : state.selection.ids.size

/* -------------------------------------------------------------------------- */
/* The hook                                                                   */
/* -------------------------------------------------------------------------- */

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Subscribes a component to a controller made for this page. The controller is created
 * once (it starts nothing until `mount`), and mounts in a layout effect so the URL is
 * reconciled before the first paint after hydration.
 */
export function useMediaLibrary(props: MediaLibraryProps, injected?: LibraryController) {
	const [bundle] = useState(() => {
		const latest = { can: props.can }
		// `injected` is a seam for the proof, which drives the same machine and renders what it holds.
		const controller =
			injected ??
			createLibraryController({
				initial: props.initial,
				can: () => latest.can,
				api: createMediaApi({ workspaceId: props.workspaceId }),
				env: browserEnv(),
			})
		return { controller, latest }
	})
	const { controller, latest } = bundle
	const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)

	useIsoLayoutEffect(() => controller.mount(), [controller])
	useIsoLayoutEffect(() => {
		latest.can = props.can
		controller.actions.permissionsChanged()
	}, [controller, latest, props.can.write, props.can.delete])

	return { state, actions: controller.actions }
}
