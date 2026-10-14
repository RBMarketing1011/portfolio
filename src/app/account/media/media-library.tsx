'use client'

/**
 * The library, assembled: the header, the search box, the rail (folders and filters), the
 * toolbar, the grid, the selection bar, the detail sheet, the upload queue and the dialogs.
 * Every leaf takes only what `contracts.ts` declares; this file is the one place that wires
 * them to `useMediaLibrary`, which owns every piece of state (spec 6.2).
 *
 * Permissions gate every control: a role that cannot write sees no Upload, no New folder,
 * no drag handles and a selection bar without edit actions; one that cannot delete sees no
 * Delete anywhere.
 */
import {
	Fragment,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type FormEvent,
	type ReactNode,
} from 'react'
import {
	Folder,
	FolderPlus,
	ImagePlus,
	Info,
	Loader2,
	SearchX,
	SlidersHorizontal,
	Tags,
	TriangleAlert,
	Upload,
	X,
} from 'lucide-react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { MediaFolderDTO } from '@/lib/media/types'
import { AiStatusBanner } from './ai-status-banner'
import { AssetGrid } from './asset-grid'
import { BulkTagDialog } from './bulk-tag-dialog'
import type {
	FolderSelection,
	MediaLibraryProps,
	UploadManagerHandle,
} from './contracts'
import { DetailPanel } from './detail-panel'
import { activeValuesFromChips, FacetPanel } from './facet-panel'
import { FolderTree } from './folder-tree'
import {
	attempt,
	MAX_FOLDER_INDEX,
	validateFolderName,
} from './folder-dialogs'
import { clauseFor, formatBytes, formatCount, pluralize } from './format'
import { GridToolbar } from './grid-toolbar'
import { MoveDialog } from './move-dialog'
import { SearchBar } from './search-bar'
import { SelectionBar } from './selection-bar'
import { TagManagerDialog } from './tag-manager-dialog'
import { useReturnFocus } from './tag-editor'
import { UploadManager } from './upload-manager'
import {
	canSelectAllMatching,
	decideKeyAction,
	DELETE_WARNING,
	effectiveDeep,
	emptySelection,
	isEmptySelection,
	joinWords,
	scopeOf,
	selectBreadcrumb,
	selectBulkCount,
	selectBulkExisting,
	selectBulkScope,
	selectDestination,
	selectEmptyKind,
	selectMoveCurrent,
	selectOpenAsset,
	selectOpenIndex,
	selectScopeText,
	selectSubfolders,
	useMediaLibrary,
	type BulkScope,
	type KeyContext,
	type LibraryActions,
	type LibraryController,
	type LibraryState,
} from './use-media-library'

type DialogKind = 'move' | 'tag' | 'delete' | 'retag' | 'tags' | 'folder' | null

/**
 * What a bulk dialog is about, as of the moment it opens: what it says, and the very selection
 * its action will run on. A dialog that said "Delete 12 images" must delete those 12 even if a
 * background reload moved the selection while it was up, and a successful action clears the
 * selection while its dialog is still fading out, when a title reading "Delete 0 images?" would
 * misreport what the person just confirmed.
 */
type BulkSnapshot = {
	count: number
	/** The scope in words ("all 312 images matching tag:kitchen in Clients/Acme"). */
	words: string
	existing: { slug: string; label: string; count: number }[]
	current: string | null | undefined
	/** What the action runs on. */
	scope: BulkScope
}

const NO_SNAPSHOT: BulkSnapshot = {
	count: 0,
	words: '',
	existing: [],
	current: undefined,
	scope: { selection: emptySelection, key: { q: '' }, total: 0 },
}

const takeSnapshot = (state: LibraryState): BulkSnapshot => ({
	count: selectBulkCount(state),
	words: selectScopeText(state),
	existing: selectBulkExisting(state),
	current: selectMoveCurrent(state),
	scope: selectBulkScope(state),
})

/** The page's props, plus a seam for the proof: a controller to render instead of making one. */
type LibraryProps = MediaLibraryProps & { controller?: LibraryController }

/**
 * Another account is another library. The key remounts the whole thing when the page is
 * re-rendered for a different account, so none of the first account's results, selection or
 * open image can be shown (or acted on) under the second.
 */
export function MediaLibrary(props: LibraryProps) {
	return <Library key={props.workspaceId} {...props} />
}

/* -------------------------------------------------------------------------- */
/* The rail                                                                   */
/* -------------------------------------------------------------------------- */

type RailProps = {
	state: LibraryState
	actions: LibraryActions
	can: MediaLibraryProps['can']
	/** The rail inside the sheet closes it once a folder or saved search is chosen. */
	onNavigate?: () => void
	onManageTags(): void
}

function Rail({ state, actions, can, onNavigate, onManageTags }: RailProps) {
	const { folders } = state.folders
	const active: FolderSelection = state.params.folder
	const go = <A extends unknown[]>(run: (...args: A) => void) =>
		(...args: A) => {
			run(...args)
			onNavigate?.()
		}
	return (
		<div className='space-y-6'>
			<FolderTree
				folders={folders}
				total={state.folders.total}
				unfiled={state.folders.unfiled}
				unreviewed={state.folders.unreviewed}
				active={active}
				canWrite={can.write}
				canDelete={can.delete}
				saved={state.saved}
				onSelect={go(actions.selectFolder)}
				onReview={go(actions.showReview)}
				onCreate={actions.createFolder}
				onRename={actions.renameFolder}
				onMove={actions.moveFolder}
				onDelete={actions.deleteFolder}
				onDropAssets={actions.dropAssets}
				onApplySaved={go(actions.applySaved)}
				onDeleteSaved={actions.deleteSaved}
			/>
			<FacetPanel
				facets={state.facets}
				loading={state.loading}
				activeValues={activeValuesFromChips(state.query.chips)}
				onToggle={actions.toggleFacet}
				onSelectFolder={go(actions.selectFolderFromFacet)}
				onManageTags={onManageTags}
			/>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Empty states that teach                                                    */
/* -------------------------------------------------------------------------- */

const emptyShell =
	'flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/15 px-6 py-16 text-center'

function EmptyLibrary({ canWrite, onUpload }: { canWrite: boolean; onUpload(): void }) {
	return (
		<div data-slot='empty-library' className={emptyShell}>
			<ImagePlus aria-hidden className='size-8 text-slate-500' />
			<h2 className='text-base font-semibold text-white'>Your media library is empty</h2>
			<p className='max-w-md text-sm leading-6 text-slate-400'>
				Upload images to keep them in folders, tag them and find them again with search.
				Every project in this account draws on the same library.
			</p>
			{canWrite ? (
				<>
					<Button
						type='button'
						onClick={onUpload}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Upload aria-hidden />
						Upload images
					</Button>
					<p className='text-xs text-slate-500'>or drag them anywhere on this page</p>
				</>
			) : (
				<p className='text-xs text-slate-500'>
					Ask someone with permission to upload to add the first images.
				</p>
			)}
		</div>
	)
}

function EmptyFolder({
	state,
	canWrite,
	onUpload,
	onIncludeSubfolders,
}: {
	state: LibraryState
	canWrite: boolean
	onUpload(): void
	onIncludeSubfolders(): void
}) {
	const unfiled = state.params.folder === 'unfiled'
	const subfolders = selectSubfolders(state).length
	const hidden = subfolders > 0 && !effectiveDeep(state.params)
	return (
		<div data-slot='empty-folder' className={emptyShell}>
			<Folder aria-hidden className='size-8 text-slate-500' />
			<h2 className='text-base font-semibold text-white'>
				{unfiled ? 'Nothing is unfiled' : 'This folder is empty'}
			</h2>
			<p className='max-w-md text-sm leading-6 text-slate-400'>
				{unfiled
					? 'Every image is in a folder.'
					: hidden
						? 'It holds no images of its own. The images in its subfolders are not shown here.'
						: 'Nothing has been put in it yet.'}
				{canWrite ? ' Upload here, or drag images onto the folder in the list.' : ''}
			</p>
			<div className='flex flex-wrap items-center justify-center gap-2'>
				{hidden ? (
					<Button type='button' variant='outline' onClick={onIncludeSubfolders}>
						Include subfolders
					</Button>
				) : null}
				{canWrite ? (
					<Button
						type='button'
						onClick={onUpload}
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Upload aria-hidden />
						{unfiled ? 'Upload to Unfiled' : 'Upload here'}
					</Button>
				) : null}
			</div>
		</div>
	)
}

/** What the search was looking for, in words, for the "nothing found" panel. */
function describeLooking(state: LibraryState): string[] {
	const lines: string[] = []
	const { dropped, query, corrections } = state
	if (dropped.length > 0) {
		lines.push(`No images mention ${joinWords(dropped, 'or')}.`)
	} else {
		const words = query.chips
			.filter((chip) => !chip.negated && (chip.kind === 'term' || chip.kind === 'phrase'))
			.map((chip) => chip.label)
		const filters = query.chips
			.filter((chip) => chip.kind === 'filter' && chip.field !== 'sort')
			.map((chip) => chip.label)
		if (words.length > 0) lines.push(`No images mention ${joinWords(words, 'or')}.`)
		if (filters.length > 0)
			lines.push(`No images match ${joinWords(filters)}.`)
		if (words.length === 0 && filters.length === 0 && state.params.q !== '')
			lines.push(`No images match "${state.params.q}".`)
	}
	const tried = [...new Set(corrections.map((c) => c.to).filter(Boolean))]
	if (tried.length > 0) lines.push(`Showing results for ${joinWords(tried)} found nothing either.`)
	return lines
}

function EmptyResults({
	state,
	onClear,
	onIncludeSubfolders,
}: {
	state: LibraryState
	onClear(): void
	onIncludeSubfolders(): void
}) {
	const lines = describeLooking(state)
	const scope = scopeOf(state.params, state.folders.folders)
	const canWiden = scope !== null && scope.label !== 'Unfiled' && !scope.deep
	return (
		<div data-slot='empty-results' className={emptyShell}>
			<SearchX aria-hidden className='size-8 text-slate-500' />
			<h2 className='text-base font-semibold text-white'>No images found</h2>
			<div className='max-w-md space-y-1 text-sm leading-6 text-slate-400'>
				{lines.map((line) => (
					<p key={line}>{line}</p>
				))}
				<p>Try fewer or different words, check the spelling, or take a filter off.</p>
			</div>
			<div className='flex flex-wrap items-center justify-center gap-2'>
				<Button
					type='button'
					onClick={onClear}
					className='bg-brand font-bold text-ink hover:bg-brand-strong'>
					Clear filters
				</Button>
				{canWiden ? (
					<Button type='button' variant='outline' onClick={onIncludeSubfolders}>
						Include subfolders
					</Button>
				) : null}
			</div>
		</div>
	)
}

function EmptyMissingFolder({ onShowAll }: { onShowAll(): void }) {
	return (
		<div data-slot='empty-missing-folder' className={emptyShell}>
			<Folder aria-hidden className='size-8 text-slate-500' />
			<h2 className='text-base font-semibold text-white'>That folder no longer exists</h2>
			<p className='max-w-md text-sm leading-6 text-slate-400'>
				It was deleted or renamed after this link was made. Its images moved up to the folder that
				held it.
			</p>
			<Button type='button' variant='outline' onClick={onShowAll}>
				Show all media
			</Button>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Small parts                                                                */
/* -------------------------------------------------------------------------- */

function CrumbTrail({
	state,
	onGo,
}: {
	state: LibraryState
	onGo(folder: FolderSelection): void
}) {
	const trail = selectBreadcrumb(state)
	if (trail.length === 0) return null
	return (
		<Breadcrumb data-slot='media-breadcrumb'>
			<BreadcrumbList className='text-slate-400'>
				{trail.map((step, index) => (
					<Fragment key={`${step.folder ?? 'all'}:${index}`}>
						{index > 0 ? <BreadcrumbSeparator /> : null}
						<BreadcrumbItem>
							{step.current ? (
								<BreadcrumbPage className='text-white'>{step.label}</BreadcrumbPage>
							) : (
								<BreadcrumbLink asChild>
									<button
										type='button'
										onClick={() => onGo(step.folder)}
										className='cursor-pointer rounded text-slate-400 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-[3px] focus-visible:ring-white/40'>
										{step.label}
									</button>
								</BreadcrumbLink>
							)}
						</BreadcrumbItem>
					</Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	)
}

function Subfolders({
	folders,
	onGo,
}: {
	folders: MediaFolderDTO[]
	onGo(id: string): void
}) {
	if (folders.length === 0) return null
	return (
		<ul aria-label='Subfolders' className='flex flex-wrap gap-2'>
			{folders.map((folder) => (
				<li key={folder.id}>
					<button
						type='button'
						onClick={() => onGo(folder.id)}
						className='inline-flex min-h-9 max-w-full cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/3 px-3 text-sm text-slate-200 outline-none hover:bg-white/8 hover:text-white focus-visible:ring-[3px] focus-visible:ring-white/40'>
						<Folder aria-hidden className='size-4 shrink-0 text-slate-400' />
						<span className='max-w-48 truncate'>{folder.name}</span>
						<span className='text-xs tabular-nums text-slate-500'>{formatCount(folder.total)}</span>
					</button>
				</li>
			))}
		</ul>
	)
}

/** One line above the grid for what just happened or went wrong. The live region says it aloud; this only shows it. */
function NoticeBar({
	state,
	actions,
}: {
	state: LibraryState
	actions: LibraryActions
}) {
	const { notice } = state
	if (!notice) return null
	const warn = notice.tone !== 'info'
	const Icon = warn ? TriangleAlert : Info
	return (
		<div
			data-slot='media-notice'
			data-tone={notice.tone}
			className={cn(
				'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
				notice.tone === 'error'
					? 'border-destructive/30 bg-destructive/10 text-red-200'
					: notice.tone === 'warn'
						? 'border-amber-400/25 bg-amber-400/8 text-amber-200'
						: 'border-white/10 bg-white/3 text-slate-200',
			)}>
			<Icon aria-hidden className='mt-0.5 size-4 shrink-0' />
			<p className='min-w-0 flex-1 wrap-break-word'>{notice.text}</p>
			{notice.retry ? (
				<Button
					type='button'
					variant='ghost'
					size='xs'
					onClick={actions.retryRefresh}
					className='border border-white/15 text-white hover:bg-white/10'>
					Retry
				</Button>
			) : null}
			<button
				type='button'
				aria-label='Dismiss this message'
				onClick={actions.dismissNotice}
				className='grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-slate-400 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-[3px] focus-visible:ring-white/40'>
				<X aria-hidden className='size-3.5' />
			</button>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Dialogs this page owns                                                     */
/* -------------------------------------------------------------------------- */

type ConfirmProps = {
	open: boolean
	onOpenChange(open: boolean): void
	title: string
	description: ReactNode
	confirmLabel: string
	destructive?: boolean
	onConfirm(): Promise<void>
}

/** The inside of a confirmation, mounted only while open so its error and busy state start clean. */
function ConfirmBody({
	title,
	description,
	confirmLabel,
	destructive,
	onConfirm,
	onClose,
	busy,
}: Omit<ConfirmProps, 'open' | 'onOpenChange'> & {
	onClose(): void
	busy: { current: boolean }
}) {
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const run = async () => {
		if (busy.current) return
		busy.current = true
		setPending(true)
		setError(null)
		const result = await attempt(onConfirm)
		busy.current = false
		setPending(false)
		if (result.ok) onClose()
		else setError(result.message)
	}

	return (
		<>
			<AlertDialogHeader>
				<AlertDialogTitle>{title}</AlertDialogTitle>
				<AlertDialogDescription>{description}</AlertDialogDescription>
			</AlertDialogHeader>
			{error ? (
				<p role='alert' className='text-sm text-destructive'>
					{error}
				</p>
			) : null}
			<AlertDialogFooter>
				<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
				<AlertDialogAction
					disabled={pending}
					onClick={(event) => {
						// Radix closes on click; stay open until the server has answered.
						event.preventDefault()
						void run()
					}}
					className={cn(
						destructive
							? 'bg-destructive text-white hover:bg-destructive/90'
							: 'bg-brand font-bold text-ink hover:bg-brand-strong',
					)}>
					{pending ? <Loader2 aria-hidden className='animate-spin motion-reduce:animate-none' /> : null}
					{confirmLabel}
				</AlertDialogAction>
			</AlertDialogFooter>
		</>
	)
}

function ConfirmDialog({ open, onOpenChange, ...body }: ConfirmProps) {
	const busy = useRef(false)
	const returnFocus = useReturnFocus(open)
	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				// A request in flight cannot be abandoned by Esc or a click outside.
				if (!next && busy.current) return
				onOpenChange(next)
			}}>
			<AlertDialogContent
				onCloseAutoFocus={returnFocus}
				className='motion-reduce:animate-none! motion-reduce:duration-0!'>
				<ConfirmBody {...body} busy={busy} onClose={() => onOpenChange(false)} />
			</AlertDialogContent>
		</AlertDialog>
	)
}

/** Where the new folder goes, and the name. Enter or the button creates it. */
function NewFolderDialog({
	open,
	onOpenChange,
	parent,
	onCreate,
}: {
	open: boolean
	onOpenChange(open: boolean): void
	parent: { id: string; path: string } | null
	onCreate(parentId: string | null, name: string): Promise<void>
}) {
	const returnFocus = useReturnFocus(open)
	const busy = useRef(false)
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && busy.current) return
				onOpenChange(next)
			}}>
			<DialogContent className='sm:max-w-md' onCloseAutoFocus={returnFocus}>
				<DialogHeader>
					<DialogTitle>New folder</DialogTitle>
					<DialogDescription>
						{parent ? `It will be created inside ${parent.path}.` : 'It will be created at the top of the library.'}
					</DialogDescription>
				</DialogHeader>
				<NewFolderForm
					parent={parent}
					busy={busy}
					onCreate={onCreate}
					onClose={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	)
}

function NewFolderForm({
	parent,
	busy,
	onCreate,
	onClose,
}: {
	parent: { id: string; path: string } | null
	busy: { current: boolean }
	onCreate(parentId: string | null, name: string): Promise<void>
	onClose(): void
}) {
	const id = useId()
	const [name, setName] = useState('')
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		if (busy.current) return
		const check = validateFolderName(name)
		if (!check.ok) {
			setError(check.message)
			return
		}
		busy.current = true
		setPending(true)
		setError(null)
		const result = await attempt(() => onCreate(parent?.id ?? null, check.name))
		busy.current = false
		setPending(false)
		if (result.ok) onClose()
		else setError(result.message)
	}

	return (
		<form onSubmit={submit} noValidate className='space-y-4'>
			<div className='space-y-2'>
				<Label htmlFor={id}>Folder name</Label>
				<Input
					id={id}
					value={name}
					autoFocus
					autoComplete='off'
					disabled={pending}
					maxLength={80}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? `${id}-error` : undefined}
					onChange={(event) => {
						setName(event.target.value)
						if (error) setError(null)
					}}
				/>
				{error ? (
					<p id={`${id}-error`} role='alert' className='text-sm text-destructive'>
						{error}
					</p>
				) : null}
			</div>
			<DialogFooter>
				<Button type='button' variant='outline' disabled={pending} onClick={onClose}>
					Cancel
				</Button>
				<Button
					type='submit'
					disabled={pending || name.trim() === ''}
					className='bg-brand font-bold text-ink hover:bg-brand-strong'>
					{pending ? <Loader2 aria-hidden className='animate-spin motion-reduce:animate-none' /> : null}
					Create folder
				</Button>
			</DialogFooter>
		</form>
	)
}

/* -------------------------------------------------------------------------- */
/* The library                                                                */
/* -------------------------------------------------------------------------- */

function Library(props: LibraryProps) {
	const { can, workspaceId, maxBytes, pathPrefix } = props
	const { state, actions } = useMediaLibrary(props, props.controller)

	const searchInputRef = useRef<HTMLInputElement>(null)
	const uploadRef = useRef<UploadManagerHandle>(null)
	const [railOpen, setRailOpen] = useState(false)
	const [dialog, setDialog] = useState<DialogKind>(null)
	const [taken, setTaken] = useState<BulkSnapshot>(NO_SNAPSHOT)
	const closeDialog = () => setDialog(null)
	const openDialog = (kind: Exclude<DialogKind, null>) => {
		if (kind === 'move' || kind === 'tag' || kind === 'delete' || kind === 'retag')
			setTaken(takeSnapshot(state))
		setDialog(kind)
	}
	// The keyboard listener is made once; it opens dialogs through the latest of these.
	const openRef = useRef(openDialog)
	useEffect(() => {
		openRef.current = openDialog
	})
	const openUpload = () => uploadRef.current?.openPicker()

	const openAsset = selectOpenAsset(state)
	const scope = useMemo(
		() => scopeOf(state.params, state.folders.folders),
		[state.params, state.folders.folders],
	)
	const destination = selectDestination(state)
	const emptyKind = selectEmptyKind(state)
	const subfolders = selectSubfolders(state)
	const loadedIds = useMemo(() => state.assets.map((asset) => asset.id), [state.assets])
	const allSelected =
		loadedIds.length > 0 &&
		(state.selection.allMatching || loadedIds.every((id) => state.selection.ids.has(id)))
	const someSelected = !isEmptySelection(state.selection) && !allSelected
	const hasText = state.query.hasText
	const showFolderPath = scope === null || scope.deep || state.params.q !== ''
	const parentForNewFolder = useMemo(() => {
		const open = state.params.folder
		if (!open || open === 'unfiled') return null
		const folder = state.folders.folders.find((f) => f.id === open)
		return folder && folder.depth + 1 <= MAX_FOLDER_INDEX
			? { id: folder.id, path: folder.path }
			: null
	}, [state.params.folder, state.folders.folders])

	/* ---- keyboard: / focuses the search, Esc, Ctrl/Cmd+A, Delete ---------------- */

	const keyContext = useRef<KeyContext>({
		detailOpen: false,
		modalOpen: false,
		hasSelection: false,
		selecting: false,
		hasAssets: false,
		canDelete: false,
	})
	useEffect(() => {
		keyContext.current = {
			detailOpen: state.openId !== null,
			modalOpen: dialog !== null || railOpen,
			hasSelection: !isEmptySelection(state.selection),
			selecting: state.selecting,
			hasAssets: state.assets.length > 0,
			canDelete: can.delete,
		}
	})
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const action = decideKeyAction(event, keyContext.current)
			if (!action) return
			event.preventDefault()
			if (action === 'focus-search') {
				searchInputRef.current?.focus()
				searchInputRef.current?.select()
			} else if (action === 'close-detail') actions.closeDetail()
			else if (action === 'clear-selection') actions.clearSelection()
			else if (action === 'select-all') actions.selectEveryLoaded()
			else if (action === 'delete') openRef.current('delete')
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [actions])

	const emptyNode: ReactNode =
		emptyKind === 'library' ? (
			<EmptyLibrary canWrite={can.write} onUpload={openUpload} />
		) : emptyKind === 'folder' ? (
			<EmptyFolder
				state={state}
				canWrite={can.write}
				onUpload={openUpload}
				onIncludeSubfolders={actions.toggleDeep}
			/>
		) : emptyKind === 'missing-folder' ? (
			<EmptyMissingFolder onShowAll={() => actions.selectFolder(undefined)} />
		) : (
			<EmptyResults
				state={state}
				onClear={actions.clearAll}
				onIncludeSubfolders={actions.toggleDeep}
			/>
		)

	const rail = (onNavigate?: () => void) => (
		<Rail
			state={state}
			actions={actions}
			can={can}
			onNavigate={onNavigate}
			onManageTags={() => setDialog('tags')}
		/>
	)

	return (
		<div data-slot='media-library' className='space-y-5'>
			<header className='flex flex-wrap items-start gap-x-4 gap-y-3'>
				<div className='min-w-0'>
					<h1 className='font-display text-3xl font-semibold text-white'>Media</h1>
					<p data-slot='media-counts' className='mt-1 text-sm text-slate-400'>
						{pluralize(state.folders.total, 'image')} · {formatBytes(state.folders.bytes)}
					</p>
				</div>
				<div className='min-w-0 flex-1 basis-80 sm:max-w-xl'>
					<SearchBar
						value={state.draft}
						chips={state.query.chips}
						warnings={state.query.warnings}
						corrections={state.corrections}
						dropped={state.dropped}
						loading={state.loading || state.refreshing}
						scope={scope}
						recent={state.recent}
						canSave={can.write && (state.params.q !== '' || state.params.folder !== undefined)}
						onChange={actions.setDraft}
						onSubmit={actions.submitDraft}
						onRemoveChip={actions.removeChip}
						onClearScope={actions.clearScope}
						onToggleScopeDeep={actions.toggleDeep}
						onClearAll={actions.clearAll}
						fetchSuggestions={actions.fetchSuggestions}
						onSave={actions.saveSearch}
						inputRef={searchInputRef}
					/>
				</div>
				<div className='flex flex-wrap items-center gap-2 sm:ml-auto'>
					{can.write ? (
						<>
							<Button
								type='button'
								onClick={openUpload}
								aria-busy={state.uploadBusy || undefined}
								className='bg-brand font-bold text-ink hover:bg-brand-strong'>
								{state.uploadBusy ? (
									<Loader2 aria-hidden className='animate-spin motion-reduce:animate-none' />
								) : (
									<Upload aria-hidden />
								)}
								{destination.label}
							</Button>
							<Button type='button' variant='outline' onClick={() => setDialog('folder')}>
								<FolderPlus aria-hidden />
								New folder
							</Button>
						</>
					) : null}
					<Button type='button' variant='outline' onClick={() => setDialog('tags')}>
						<Tags aria-hidden />
						Tags
					</Button>
				</div>
			</header>

			<div className='empty:hidden'>
				<AiStatusBanner
					status={state.tagging}
					pending={state.pending}
					working={state.aiWorking}
					blockedMessage={state.aiBlocked}
					canWrite={can.write}
					onTagUntagged={actions.tagUntagged}
					onRetryFailed={actions.retryFailed}
				/>
			</div>

			<div className='flex items-start gap-6'>
				<aside
					aria-label='Folders and filters'
					data-slot='media-rail'
					className='hidden w-72 shrink-0 lg:block'>
					<div className='sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-1'>
						{rail()}
					</div>
				</aside>

				<section
					aria-label='Images'
					aria-busy={state.loading || undefined}
					className='min-w-0 flex-1 space-y-4'>
					<div className='lg:hidden'>
						<Button type='button' variant='outline' onClick={() => setRailOpen(true)}>
							<SlidersHorizontal aria-hidden />
							Folders and filters
						</Button>
					</div>

					<NoticeBar state={state} actions={actions} />

					<GridToolbar
						total={state.total}
						truncated={state.truncated}
						sort={state.sortApplied}
						hasText={hasText}
						density={state.density}
						allSelected={allSelected}
						someSelected={someSelected}
						selecting={state.selecting}
						showDeep={scope !== null && scope.label !== 'Unfiled'}
						deep={scope?.deep ?? false}
						onToggleSelecting={actions.toggleSelecting}
						onSort={actions.setSort}
						onDensity={actions.setDensity}
						onToggleAll={actions.toggleAll}
						onToggleDeep={actions.toggleDeep}
					/>

					<CrumbTrail state={state} onGo={actions.selectFolder} />
					{state.params.q === '' ? (
						<Subfolders folders={subfolders} onGo={actions.selectFolder} />
					) : null}

					<AssetGrid
						assets={state.assets}
						density={state.density}
						selectedIds={state.selection.ids}
						selecting={state.selecting}
						activeId={state.openId}
						loading={state.loading}
						loadingMore={state.loadingMore}
						hasMore={state.hasMore}
						error={state.error}
						canDrag={can.write}
						showFolderPath={showFolderPath}
						showMatch={hasText}
						empty={emptyNode}
						onLoadMore={actions.loadMore}
						onRetry={actions.retry}
						onOpen={actions.openAsset}
						onToggleSelect={actions.toggleSelect}
					/>

					<SelectionBar
						count={state.selection.ids.size}
						totalMatching={state.total}
						allMatching={state.selection.allMatching}
						canSelectAllMatching={
							!state.loading &&
							canSelectAllMatching({
								total: state.total,
								truncated: state.truncated,
								dropped: state.dropped,
							})
						}
						canWrite={can.write}
						canDelete={can.delete}
						aiConfigured={state.tagging.configured}
						onSelectAllMatching={actions.selectAllMatching}
						onClear={actions.clearSelection}
						onMove={() => openDialog('move')}
						onTag={() => openDialog('tag')}
						onRetag={() => openDialog('retag')}
						onAcceptTags={() => void actions.bulkAccept()}
						onDelete={() => openDialog('delete')}
					/>
				</section>
			</div>

			<Sheet open={railOpen} onOpenChange={setRailOpen}>
				<SheetContent side='left' className='w-80 max-w-[85vw] gap-0 p-0 sm:max-w-sm'>
					<SheetHeader className='border-b border-white/10'>
						<SheetTitle>Folders and filters</SheetTitle>
						<SheetDescription className='sr-only'>
							Browse folders and saved searches, and narrow the images.
						</SheetDescription>
					</SheetHeader>
					<div className='min-h-0 flex-1 overflow-y-auto p-4'>
						{railOpen ? rail(() => setRailOpen(false)) : null}
					</div>
				</SheetContent>
			</Sheet>

			<DetailPanel
				asset={openAsset}
				index={selectOpenIndex(state)}
				count={state.assets.length}
				canWrite={can.write}
				canDelete={can.delete}
				aiConfigured={state.tagging.configured}
				folders={state.folders.folders}
				onClose={actions.closeDetail}
				onPrev={actions.prev}
				onNext={actions.next}
				onPatch={actions.patchAsset}
				onDelete={actions.deleteAsset}
				onRetag={actions.retagAsset}
				onFilter={actions.filterBy}
				fetchTagSuggestions={actions.fetchTagSuggestions}
			/>

			<UploadManager
				folderId={destination.folderId}
				destinationLabel={destination.label}
				disabled={!can.write}
				maxBytes={maxBytes}
				workspaceId={workspaceId}
				pathPrefix={pathPrefix}
				onRegistered={actions.onRegistered}
				onOpenAsset={actions.openAsset}
				onSelectBatch={actions.onSelectBatch}
				onBusyChange={actions.onUploadBusy}
				handleRef={uploadRef}
			/>

			<MoveDialog
				open={dialog === 'move'}
				onOpenChange={(next) => !next && closeDialog()}
				title={`Move ${pluralize(taken.count, 'image')}`}
				description={`Choose where ${taken.words || 'the images you selected'} should go.`}
				folders={state.folders.folders}
				currentId={taken.current}
				confirmLabel='Move here'
				onConfirm={(folderId) => actions.bulkMove(folderId, taken.scope)}
			/>

			<BulkTagDialog
				open={dialog === 'tag'}
				onOpenChange={(next) => !next && closeDialog()}
				count={taken.count}
				existing={taken.existing}
				fetchSuggestions={actions.fetchTagSuggestions}
				onSubmit={(change) => actions.bulkTags(change, taken.scope)}
			/>

			<ConfirmDialog
				open={dialog === 'delete'}
				onOpenChange={(next) => !next && closeDialog()}
				title={`Delete ${pluralize(taken.count, 'image')}?`}
				description={`Delete ${taken.words}. ${DELETE_WARNING}`}
				confirmLabel='Delete images'
				destructive
				onConfirm={() => actions.bulkDelete(taken.scope)}
			/>

			<ConfirmDialog
				open={dialog === 'retag'}
				onOpenChange={(next) => !next && closeDialog()}
				title={`Auto-tag ${pluralize(taken.count, 'image')} again?`}
				description={`Auto-tagging will look at ${taken.words} again and replace their automatic tags. Tags you added or kept stay, and tags you removed are not brought back. This counts against your daily auto-tagging limit.`}
				confirmLabel='Auto-tag again'
				onConfirm={() => actions.bulkRetag(taken.scope)}
			/>

			<TagManagerDialog
				open={dialog === 'tags'}
				onOpenChange={(next) => !next && closeDialog()}
				canEdit={can.write}
				canDelete={can.delete}
				fetchTags={actions.fetchTags}
				onRename={actions.renameTag}
				onMerge={actions.mergeTag}
				onDelete={actions.deleteTag}
				onFilter={(slug) => actions.filterBy(clauseFor('tag', slug))}
			/>

			<NewFolderDialog
				open={dialog === 'folder'}
				onOpenChange={(next) => !next && closeDialog()}
				parent={parentForNewFolder}
				onCreate={actions.createFolder}
			/>

			<div
				role='status'
				aria-live='polite'
				aria-atomic='true'
				data-slot='media-live'
				className='sr-only'>
				{state.announcement.text}
				{/* A repeat of the same words is only heard when the text really changes. */}
				{state.announcement.id % 2 === 0 ? '\u200b' : ''}
			</div>
		</div>
	)
}
