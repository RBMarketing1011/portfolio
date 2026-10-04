/**
 * The seams of the media library UI. Each leaf component takes exactly the props
 * declared here and knows nothing about fetching, URLs or the library hook, so
 * they can be built (and replaced) independently. `media-library.tsx` is the one
 * place that wires state to them.
 *
 * Conventions shared by every component:
 *  - An async callback REJECTS with an `Error` whose message is fit to show a
 *    person ("A folder named Acme already exists here."). The component catches it
 *    and shows it inline next to the control that caused it; it never lets it
 *    escape as an unhandled rejection.
 *  - A component that edits shows an optimistic or pending state while its promise
 *    is in flight and disables repeat submits of the SAME action.
 *  - Permissions arrive as booleans. A component without permission renders the
 *    read-only form of itself; it never renders a control that will 403.
 *  - Dark theme tokens as used elsewhere under /account: `border-white/10`,
 *    `bg-white/3`, `text-slate-400`, `text-white`, `text-brand`, `text-destructive`.
 *  - Keyboard, touch and screen readers are not optional: every control is reachable
 *    and labelled; focus returns to where it came from when a dialog closes; nothing
 *    depends on hover (there is no hover on a phone); motion respects
 *    `prefers-reduced-motion`; colour is never the only carrier of meaning.
 */
import type { ReactNode, Ref } from 'react'
import type { AssetPatch } from '@/lib/media/schemas'
import type {
	MediaAssetDTO,
	MediaFacets,
	MediaFolderDTO,
	MediaFoldersResponse,
	MediaRegisterResponse,
	MediaSavedSearchDTO,
	MediaSearchParams,
	MediaSearchResponse,
	MediaSort,
	MediaSuggestion,
	MediaTag,
	MediaTagStat,
	MediaTaggingStatusDTO,
	QueryChip,
} from '@/lib/media/types'

/** Dragging images onto a folder carries their ids under this MIME type, as a JSON string array. */
export const DRAG_MIME = 'application/x-media-ids'

export type Density = 'compact' | 'comfortable' | 'large'

/** `undefined` is "All media", `'unfiled'` is the root, anything else is a folder id. */
export type FolderSelection = string | undefined

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export type MediaLibraryProps = {
	/**
	 * Server-rendered first paint, so the page is never empty while it loads. It can be
	 * STALE after a client-side Back (Next reuses the cached page for history entries made
	 * with replaceState/pushState): the URL is the source of truth, and on mount the library
	 * reconciles `window.location.search` against `initial.params` and refetches if they differ.
	 */
	initial: {
		params: MediaSearchParams
		search: MediaSearchResponse
		folders: MediaFoldersResponse
		saved: MediaSavedSearchDTO[]
		tagging: MediaTaggingStatusDTO
	}
	can: {
		/** media.upload: upload, rename, tag, move, organise. */
		write: boolean
		/** media.delete: delete images, folders and tags. */
		delete: boolean
	}
	/** The account this page was rendered for. EVERY request names it in `x-media-workspace`. */
	workspaceId: string
	maxBytes: number
	/**
	 * `workspaces/<id>/media/`. A browser upload to Vercel Blob names its own path,
	 * and the server only checks it, so the page has to hand the browser the prefix.
	 */
	pathPrefix: string
}

/* -------------------------------------------------------------------------- */
/* Grid                                                                       */
/* -------------------------------------------------------------------------- */

export type AssetGridProps = {
	assets: MediaAssetDTO[]
	density: Density
	selectedIds: ReadonlySet<string>
	/** Checkboxes are forced visible (the toolbar's Select toggle, or any selection). */
	selecting: boolean
	/** The one open in the detail panel, highlighted. */
	activeId: string | null
	/** First page in flight: render skeleton cards instead of `empty`. */
	loading: boolean
	loadingMore: boolean
	hasMore: boolean
	/**
	 * The last list fetch failed. With assets: an end-of-grid "Could not load more. Retry" row
	 * replaces the load-more control and `onLoadMore` is not called while set. Without assets:
	 * an error panel with Retry, NEVER the `empty` node (a network failure must not read as "no images").
	 */
	error: string | null
	/** The person may drag cards onto folders. */
	canDrag: boolean
	/** Results span folders (a search, or "All media"): show each card's folder path. */
	showFolderPath: boolean
	/** A text query ranked these: show why each one matched (`match.fields`). */
	showMatch: boolean
	/** Rendered when there are no assets, nothing is loading and there is no error. */
	empty: ReactNode
	/**
	 * Auto-load when the end scrolls into view is a progressive enhancement. A visible "Load
	 * more" button ALWAYS follows the grid while `hasMore`, so keyboard users (who would
	 * otherwise tab through hundreds of cards and never reach what follows) can always get
	 * more and then move on. Safe to call repeatedly.
	 */
	onLoadMore(): void
	onRetry(): void
	onOpen(id: string): void
	/** `range` is a shift-click: select everything between the last toggled card and this one. */
	onToggleSelect(id: string, opts: { range: boolean }): void
}

/** The strip above the grid: counts, sort, density, select. */
export type GridToolbarProps = {
	total: number
	/** `total` is a lower bound (the search hit its candidate cap). */
	truncated: boolean
	sort: MediaSort
	/** Offer `relevance`: only meaningful for a text query. */
	hasText: boolean
	density: Density
	/** Every loaded card is selected. */
	allSelected: boolean
	someSelected: boolean
	/**
	 * A "Select" toggle button forces the card checkboxes visible for everyone (the hover
	 * affordance does not exist on a phone). Selection mode ends when the selection is cleared.
	 */
	selecting: boolean
	/** Offer "include subfolders" (a folder is open). */
	showDeep: boolean
	deep: boolean
	onToggleSelecting(): void
	onSort(sort: MediaSort): void
	onDensity(density: Density): void
	onToggleAll(): void
	onToggleDeep(): void
}

export type SelectionBarProps = {
	/** Cards selected. */
	count: number
	/** Everything the current search matches, for "Select all N". */
	totalMatching: number
	/** Selection means "everything matching", not just the loaded cards. */
	allMatching: boolean
	/**
	 * Offer "Select all N matching". False when the result was relaxed (`dropped` is non-empty),
	 * truncated, or exceeds the bulk cap: a bulk action must operate on exactly the set the person saw.
	 */
	canSelectAllMatching: boolean
	canWrite: boolean
	canDelete: boolean
	/** AI tagging is available: offer "Auto-tag again". */
	aiConfigured: boolean
	onSelectAllMatching(): void
	onClear(): void
	onMove(): void
	onTag(): void
	onRetag(): void
	/** "Keep all auto tags": turn every automatic tag on the selection into a kept (manual) one. */
	onAcceptTags(): void
	onDelete(): void
}

/* -------------------------------------------------------------------------- */
/* Folders and saved searches                                                 */
/* -------------------------------------------------------------------------- */

export type FolderTreeProps = {
	folders: MediaFolderDTO[]
	/** Every image. */
	total: number
	unfiled: number
	/** Images that still carry an automatic tag nobody has kept: the review queue. */
	unreviewed: number
	active: FolderSelection
	canWrite: boolean
	canDelete: boolean
	saved: MediaSavedSearchDTO[]
	onSelect(folder: FolderSelection): void
	/** "Needs review (N)": applies `is:unreviewed`. */
	onReview(): void
	onCreate(parentId: string | null, name: string): Promise<void>
	onRename(id: string, name: string): Promise<void>
	onMove(id: string, parentId: string | null): Promise<void>
	onDelete(id: string): Promise<void>
	/** Images were dropped on a folder (null = Unfiled). `ids` came from `DRAG_MIME`. */
	onDropAssets(folderId: string | null, ids: string[]): Promise<void>
	onApplySaved(search: MediaSavedSearchDTO): void
	onDeleteSaved(id: string): Promise<void>
}

export type MoveDialogProps = {
	open: boolean
	onOpenChange(open: boolean): void
	title: string
	description?: string
	folders: MediaFolderDTO[]
	/** Folders that cannot be chosen (a folder and its descendants, when moving a folder). */
	disabledIds?: ReadonlySet<string>
	/** Where the thing is now; shown selected. `null` is the root. */
	currentId?: string | null
	confirmLabel: string
	/** `null` means the library root (Unfiled). */
	onConfirm(folderId: string | null): Promise<void>
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

export type SearchBarProps = {
	/** The text in the box. Controlled: the parent owns the draft and debounces. */
	value: string
	chips: QueryChip[]
	warnings: string[]
	/** "Showing results for kitchen" - typo fixes and tag redirects the server applied. */
	corrections: { from: string; to: string }[]
	/** "No images mention "sink". Showing results for technician repairing." */
	dropped: string[]
	loading: boolean
	/** The folder the search is confined to, shown as a removable pill. Null when searching everything. */
	scope: { label: string; deep: boolean } | null
	/**
	 * Most recent first, already de-duplicated. When the box is focused and EMPTY it shows,
	 * with no fetch: up to 5 of these, then a static "Narrow by" list of operator rows (Tag,
	 * Color, Type, Folder, Added, Needs review), each with a one-line hint. Choosing a row
	 * inserts `operator:` and keeps focus, so the normal typed-suggestion flow takes over.
	 */
	recent: string[]
	canSave: boolean
	/** Fires on every edit. */
	onChange(value: string): void
	/** Enter pressed, or a suggestion accepted: commit now, without waiting for the debounce. */
	onSubmit(value: string): void
	onRemoveChip(chip: QueryChip): void
	onClearScope(): void
	/** The scope pill's menu: include or exclude subfolders. */
	onToggleScopeDeep(): void
	onClearAll(): void
	/** Aborts via `signal` when the person keeps typing. Resolves to [] on failure. */
	fetchSuggestions(input: string, signal: AbortSignal): Promise<MediaSuggestion[]>
	onSave(name: string): Promise<void>
	/** So the page can focus the box on `/`. */
	inputRef?: Ref<HTMLInputElement>
}

export type FacetPanelProps = {
	/** Tags, colours and folders, with counts for the current result set. Null while unknown. */
	facets: MediaFacets | null
	loading: boolean
	/**
	 * `field:value` pairs already in the query, from the chips' `field` and `values`
	 * (`type:png`, `tag:kitchen`, `color:blue`). A facet is active when its pair is here.
	 */
	activeValues: ReadonlySet<string>
	/**
	 * `clause` is e.g. `tag:kitchen`; `active` is its current state, so true means remove
	 * it. For `type`, `orientation` and `kind` (single-valued) adding merges into a comma
	 * list and removing takes only that value out.
	 */
	onToggle(clause: string, active: boolean): void
	onSelectFolder(folderId: string): void
	onManageTags?(): void
}

/* -------------------------------------------------------------------------- */
/* Detail, tags                                                               */
/* -------------------------------------------------------------------------- */

export type DetailPanelProps = {
	/** Null: closed. */
	asset: MediaAssetDTO | null
	/** 0-based position among the loaded assets, and how many are loaded. */
	index: number
	count: number
	canWrite: boolean
	canDelete: boolean
	aiConfigured: boolean
	folders: MediaFolderDTO[]
	onClose(): void
	onPrev(): void
	onNext(): void
	onPatch(patch: AssetPatch): Promise<void>
	onDelete(): Promise<void>
	onRetag(): Promise<void>
	/** A tag, colour, type or folder was clicked: add `clause` to the search. */
	onFilter(clause: string): void
	fetchTagSuggestions(q: string): Promise<MediaTagStat[]>
}

export type TagEditorProps = {
	tags: MediaTag[]
	canEdit: boolean
	/**
	 * Labels as typed. The editor splits on comma, Enter and paste ("kitchen, remodel, before"
	 * is three tags in one call), caps at 20 per call (assetPatchSchema.addTags), and shows
	 * them as pending chips optimistically. It does NOT disable the input while a call is in
	 * flight; failures roll back with an inline error.
	 */
	onAdd(labels: string[]): Promise<void>
	onRemove(slug: string): Promise<void>
	/** Keep an automatic tag: it becomes a manual one. */
	onPromote?(slug: string): Promise<void>
	onTagClick?(slug: string): void
	/**
	 * When the typed text slugifies to a slug that differs from an existing tag with the same
	 * stem (apply `stem` per hyphen-separated word, client side, over the returned stats), list
	 * that tag FIRST as 'Use "Kitchen" (214)', highlighted by default; 'Create "Kitchens"' is the
	 * next option so the person can keep the new spelling. Stops fragmentation at the source.
	 */
	fetchSuggestions(q: string): Promise<MediaTagStat[]>
}

export type BulkTagDialogProps = {
	open: boolean
	onOpenChange(open: boolean): void
	/** How many images this will touch (may be "all matching"). The denominator for `existing`. */
	count: number
	/**
	 * Tags on the target images with how many of `count` carry each, most common first, so
	 * Remove can offer checkable chips ("kitchen, 12 of 40") instead of slugs typed from
	 * memory. Built by media-library from the selected loaded images; for "all matching" it
	 * comes from the facets (top 30 only), and a typed slug still works.
	 */
	existing: { slug: string; label: string; count: number }[]
	fetchSuggestions(q: string): Promise<MediaTagStat[]>
	/** Add accepts a comma list of up to 20 labels. */
	onSubmit(change: { add: string[]; remove: string[] }): Promise<void>
}

export type TagManagerDialogProps = {
	open: boolean
	onOpenChange(open: boolean): void
	canEdit: boolean
	canDelete: boolean
	fetchTags(): Promise<MediaTagStat[]>
	/**
	 * Resolves with the slug the tag ended up with and whether the rename became a merge
	 * (the new name already existed). The page rewrites any `tag:old` chip in the open query.
	 */
	onRename(slug: string, label: string): Promise<{ slug: string; merged: boolean }>
	onMerge(slug: string, intoSlug: string): Promise<void>
	onDelete(slug: string): Promise<void>
	/** "Show these images": closes the dialog and filters by the tag. */
	onFilter(slug: string): void
}

/* -------------------------------------------------------------------------- */
/* Upload, status                                                             */
/* -------------------------------------------------------------------------- */

/** Imperative handle so the page header's Upload button can open the picker. */
export type UploadManagerHandle = {
	openPicker(): void
	addFiles(files: File[]): void
}

export type UploadManagerProps = {
	/** Where new uploads land. `null` is the root. */
	folderId: string | null
	/** What the Upload button and queue say: "Upload to Clients/Acme" or "Upload to Unfiled". */
	destinationLabel: string
	disabled: boolean
	maxBytes: number
	/** The account the page was rendered for; goes in the upload `clientPayload` and the `x-media-workspace` header. */
	workspaceId: string
	/** Every uploaded pathname starts with this; the server rejects anything else. */
	pathPrefix: string
	/**
	 * One call per file once the server has registered it (created OR duplicate). A duplicate
	 * row reads "Already in your library as <asset.folderPath>/<asset.name>" (or "in Unfiled")
	 * with a View button that calls `onOpenAsset`.
	 */
	onRegistered(result: MediaRegisterResponse): void
	/** Open an existing asset in the detail panel (the View button on a duplicate row). Fetch it by id if it is not loaded. */
	onOpenAsset(id: string): void
	/**
	 * A batch finished: ids of the newly CREATED assets, for the queue footer's "N added. Select
	 * them". The page selects them, opens the batch's folder, clears the text query so the cards
	 * are visible, and refreshes. It does not splice cards into the grid.
	 */
	onSelectBatch(ids: string[]): void
	/** True while anything is uploading or registering. */
	onBusyChange?(busy: boolean): void
	/** Where the shared handle is exposed. */
	handleRef?: Ref<UploadManagerHandle>
}

export type AiStatusBannerProps = {
	status: MediaTaggingStatusDTO | null
	/** Images waiting for tags, as the library last counted them. */
	pending: number
	/** The page is actively working through them. */
	working: boolean
	/** The run stopped for a reason that affects every image (bad key, billing, wrong model). Shown verbatim. */
	blockedMessage: string | null
	canWrite: boolean
	/** Queue every image that has no automatic tags and (if configured) start. */
	onTagUntagged(): void
	onRetryFailed(): void
}
