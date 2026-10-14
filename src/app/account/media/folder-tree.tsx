'use client'

import {
	Fragment,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type DragEvent,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
} from 'react'
import {
	Bookmark,
	ChevronRight,
	Ellipsis,
	Folder,
	FolderInput,
	FolderOpen,
	Images,
	Loader2,
	Pencil,
	Plus,
	Sparkles,
	Trash2,
	X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { MediaSavedSearchDTO } from '@/lib/media/types'
import { DRAG_MIME, type FolderTreeProps } from './contracts'
import { formatCount, pluralize } from './format'
import {
	activeKeyOf,
	ancestorsOf,
	attempt,
	buildFolderTree,
	carriesMediaIds,
	DeleteFolderDialog,
	FolderNameForm,
	menuActionsFor,
	moveBlockedIds,
	NewFolderIcon,
	planDrop,
	readStoredExpanded,
	resolveTreeKey,
	tabStopKey,
	visibleNodes,
	writeStoredExpanded,
	type DeleteFolderInfo,
	type FolderAction,
	type FolderNode,
	type NavAction,
	type NavItem,
} from './folder-dialogs'
import { MoveDialog } from './move-dialog'

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

const folderKeyOf = (id: string) => `f:${id}`
const idOfKey = (key: string) => (key.startsWith('f:') ? key.slice(2) : null)

/** A count from the API, made safe to print. */
const countOf = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: 0

const noImages = (n: number) => pluralize(n, 'image')

const ACTION_LABEL: Record<FolderAction, string> = {
	subfolder: 'New subfolder',
	rename: 'Rename',
	move: 'Move to…',
	delete: 'Delete',
}
const ACTION_ICON: Record<FolderAction, ReactNode> = {
	subfolder: <Plus />,
	rename: <Pencil />,
	move: <FolderInput />,
	delete: <Trash2 />,
}

type Editing =
	| { kind: 'create'; parentId: string | null }
	| { kind: 'rename'; id: string }

type DragHandlers = {
	onDragEnter(event: DragEvent<HTMLElement>): void
	onDragOver(event: DragEvent<HTMLElement>): void
	onDragLeave(event: DragEvent<HTMLElement>): void
	onDrop(event: DragEvent<HTMLElement>): void
}

/* -------------------------------------------------------------------------- */
/* One row                                                                    */
/* -------------------------------------------------------------------------- */

type RowProps = {
	itemKey: string
	/** The treeitem's accessible name. Explicit, so the menu button inside is not read as part of it. */
	label: string
	selected: boolean
	tabStop: boolean
	level: number
	setSize?: number
	posInSet?: number
	/** Undefined for a leaf: a leaf must not claim to be expandable. */
	expanded?: boolean
	/** Left padding in rem. */
	pad: number
	dropState: 'none' | 'over' | 'busy'
	contains?: boolean
	onActivate(): void
	onKeyDown(event: KeyboardEvent<HTMLLIElement>): void
	onFocusRow(): void
	drag?: DragHandlers
	children: ReactNode
}

function TreeRow({
	itemKey,
	label,
	selected,
	tabStop,
	level,
	setSize,
	posInSet,
	expanded,
	pad,
	dropState,
	contains,
	onActivate,
	onKeyDown,
	onFocusRow,
	drag,
	children,
}: RowProps) {
	return (
		<li
			role='treeitem'
			data-key={itemKey}
			aria-label={label}
			aria-level={level}
			aria-setsize={setSize}
			aria-posinset={posInSet}
			aria-selected={selected}
			aria-expanded={expanded}
			tabIndex={tabStop ? 0 : -1}
			style={{ paddingLeft: `${pad}rem` }}
			onClick={(event: MouseEvent<HTMLLIElement>) => {
				// Buttons and the name field inside the row do their own thing.
				if ((event.target as HTMLElement).closest('button, input')) return
				onActivate()
			}}
			onKeyDown={onKeyDown}
			onFocus={onFocusRow}
			{...drag}
			className={cn(
				'group relative flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md pr-1 text-sm outline-none select-none',
				'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/70',
				selected
					? 'bg-brand/10 font-semibold text-white before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand'
					: contains
						? 'font-medium text-white hover:bg-white/5'
						: 'text-slate-300 hover:bg-white/5 hover:text-white',
				dropState === 'over' && 'bg-brand/20 ring-1 ring-brand',
				dropState === 'busy' && 'opacity-70',
			)}>
			{children}
		</li>
	)
}

const Count = ({ n, busy }: { n: number; busy?: boolean }) => (
	<Badge
		aria-hidden
		variant='outline'
		className='ml-auto border-transparent px-0 py-0 pl-1 font-normal tabular-nums text-slate-500 [&>svg]:size-3.5'>
		{busy ? <Loader2 className='animate-spin' /> : formatCount(n)}
	</Badge>
)

/* -------------------------------------------------------------------------- */
/* The tree                                                                   */
/* -------------------------------------------------------------------------- */

export function FolderTree({
	folders,
	total,
	unreviewed,
	active,
	canWrite,
	canDelete,
	saved,
	onSelect,
	onReview,
	onCreate,
	onRename,
	onMove,
	onDelete,
	onDropAssets,
	onApplySaved,
	onDeleteSaved,
}: FolderTreeProps) {
	const model = useMemo(() => buildFolderTree(folders), [folders])
	const headingId = useId()
	const treeRef = useRef<HTMLUListElement>(null)
	const addButtonRef = useRef<HTMLButtonElement>(null)

	/* --- expansion: persisted, and the active folder's ancestors open ----- */

	const activeAncestors = useMemo(() => ancestorsOf(model, active), [model, active])
	const ancestorKey = activeAncestors.join(',')
	// The first render (server and client) knows only what props say; storage joins after mount.
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		() => new Set(activeAncestors),
	)
	const expandedRef = useRef(expanded)
	const modelRef = useRef(model)
	useEffect(() => {
		modelRef.current = model
	}, [model])

	const updateExpanded = useCallback(
		(change: (prev: ReadonlySet<string>) => ReadonlySet<string>, persist = true) => {
			const prev = expandedRef.current
			const next = change(prev)
			if (next === prev) return
			expandedRef.current = next
			setExpanded(next)
			if (!persist) return
			// Forget folders that no longer exist, unless the list has not arrived yet.
			const known = modelRef.current.byId
			writeStoredExpanded(known.size ? [...next].filter((id) => known.has(id)) : next)
		},
		[],
	)
	const open = useCallback(
		(ids: readonly string[], persist = true) =>
			updateExpanded((prev) => {
				const missing = ids.filter((id) => !prev.has(id))
				return missing.length ? new Set([...prev, ...missing]) : prev
			}, persist),
		[updateExpanded],
	)
	const close = useCallback(
		(id: string) =>
			updateExpanded((prev) => {
				if (!prev.has(id)) return prev
				const next = new Set(prev)
				next.delete(id)
				return next
			}),
		[updateExpanded],
	)

	useEffect(() => {
		const stored = readStoredExpanded()
		if (stored.length) open(stored, false)
	}, [open])

	// Keyed on the chain, not the list: a refresh after a move must not re-open
	// a branch the person just collapsed.
	useEffect(() => {
		if (ancestorKey) open(ancestorKey.split(','))
	}, [ancestorKey, open])

	/* --- what is on screen ------------------------------------------------ */

	const shown = useMemo(() => visibleNodes(model, expanded), [model, expanded])
	const reviewCount = countOf(unreviewed)
	const activeKey = activeKeyOf(active, model)

	const navItems = useMemo<NavItem[]>(() => {
		const items: NavItem[] = [
			{ key: 'all', kind: 'all', parentKey: null, expandable: false, expanded: false },
		]
		if (reviewCount > 0)
			items.push({ key: 'review', kind: 'review', parentKey: null, expandable: false, expanded: false })
		for (const node of shown)
			items.push({
				key: folderKeyOf(node.id),
				kind: 'folder',
				parentKey: node.parent ? folderKeyOf(node.parent.id) : null,
				expandable: node.children.length > 0,
				expanded: expanded.has(node.id),
			})
		return items
	}, [shown, expanded, reviewCount])

	/* --- roving focus ----------------------------------------------------- */

	const [focusKey, setFocusKey] = useState<string | null>(null)
	const tabKey = tabStopKey(
		navItems.map((item) => item.key),
		focusKey,
		activeKey,
	)

	// An outside change of selection (a facet, Back) moves the tab stop to it,
	// unless the person is working inside the tree right now.
	useEffect(() => {
		if (!treeRef.current?.contains(document.activeElement)) setFocusKey(null)
	}, [active])

	const focusItem = useCallback((key: string | null) => {
		const root = treeRef.current
		if (!root) return
		if (key === 'new') {
			addButtonRef.current?.focus()
			return
		}
		const rows = Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]'))
		// A row that is gone (deleted, or tucked under a collapsed folder) falls back to the tab stop.
		const target =
			(key ? rows.find((row) => row.dataset.key === key) : undefined) ??
			rows.find((row) => row.tabIndex === 0) ??
			rows[0]
		target?.focus()
	}, [])

	/* --- editing, menus, dialogs ------------------------------------------ */

	const [editing, setEditing] = useState<Editing | null>(null)
	const [menuFor, setMenuFor] = useState<string | null>(null)
	const [deleteFor, setDeleteFor] = useState<(DeleteFolderInfo & { returnKey: string }) | null>(null)
	const [moveFor, setMoveFor] = useState<string | null>(null)
	const menuIntent = useRef(false)
	// Where focus lands when a dialog closes: the row, or its stand-in once it is gone.
	const dialogReturn = useRef<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)

	const startCreate = (parentId: string | null) => {
		setNotice(null)
		if (parentId) open([parentId])
		setEditing({ kind: 'create', parentId })
	}
	const startRename = (id: string) => {
		setNotice(null)
		setEditing({ kind: 'rename', id })
	}
	const finishEditing = (target: Editing, returnKey: string | null, refocus: boolean) => {
		setEditing((current) => (current === target ? null : current))
		if (refocus) focusItem(returnKey)
	}

	const askDelete = (node: FolderNode) => {
		setNotice(null)
		dialogReturn.current = folderKeyOf(node.id)
		setDeleteFor({
			id: node.id,
			name: node.name,
			images: countOf(node.folder.count),
			subfolders: node.children.length,
			destination: node.parent ? node.parent.name : null,
			returnKey: folderKeyOf(node.id),
		})
	}
	const askMove = (node: FolderNode) => {
		setNotice(null)
		dialogReturn.current = folderKeyOf(node.id)
		setMoveFor(node.id)
	}

	const runAction = (action: FolderAction, node: FolderNode) => {
		if (action === 'subfolder') startCreate(node.id)
		else if (action === 'rename') startRename(node.id)
		else if (action === 'move') askMove(node)
		else askDelete(node)
	}

	const activate = (key: string) => {
		if (key === 'all') onSelect(undefined)
		else if (key === 'review') onReview()
		else {
			const id = idOfKey(key)
			if (id) onSelect(id)
		}
	}

	const perform = (action: NavAction) => {
		const id = idOfKey(action.key)
		const node = id ? model.byId.get(id) : undefined
		switch (action.type) {
			case 'focus':
				return focusItem(action.key)
			case 'expand':
				return id ? open([id]) : undefined
			case 'collapse':
				return id ? close(id) : undefined
			case 'activate':
				return activate(action.key)
			case 'rename':
				return node ? startRename(node.id) : undefined
			case 'delete':
				return node ? askDelete(node) : undefined
			case 'menu':
				return node ? setMenuFor(node.id) : undefined
		}
	}

	const onRowKeyDown = (event: KeyboardEvent<HTMLLIElement>, key: string) => {
		// Keys typed in the name field or pressed on the row's buttons belong to them.
		if (event.target !== event.currentTarget) return
		const action = resolveTreeKey(navItems, key, event, { write: canWrite, delete: canDelete })
		if (!action) return
		event.preventDefault()
		perform(action)
	}

	/* --- drag and drop ---------------------------------------------------- */

	const [dropKey, setDropKey] = useState<string | null>(null)
	const [busyDrops, setBusyDrops] = useState<ReadonlySet<string>>(() => new Set())

	const handleDrop = async (key: string, folderId: string | null, event: DragEvent<HTMLElement>) => {
		let raw: unknown = ''
		try {
			raw = event.dataTransfer.getData(DRAG_MIME)
		} catch {
			raw = ''
		}
		const plan = planDrop(raw)
		if (plan.type === 'ignore') return
		if (plan.type === 'refuse') {
			setNotice(plan.message)
			return
		}
		if (busyDrops.has(key)) return
		setNotice(null)
		setBusyDrops((current) => new Set(current).add(key))
		const result = await attempt(
			() => onDropAssets(folderId, plan.ids),
			'Those images could not be moved.',
		)
		setBusyDrops((current) => {
			const next = new Set(current)
			next.delete(key)
			return next
		})
		if (!result.ok) setNotice(result.message)
	}

	// Only a drag that carries our ids is ours; a file from the desktop or a
	// selected word must pass through to the page untouched.
	const dragProps = (key: string, folderId: string | null): DragHandlers => ({
		onDragEnter: (event) => {
			if (!carriesMediaIds(event.dataTransfer?.types, DRAG_MIME)) return
			event.preventDefault()
			setDropKey(key)
		},
		onDragOver: (event) => {
			if (!carriesMediaIds(event.dataTransfer?.types, DRAG_MIME)) return
			event.preventDefault()
			event.dataTransfer.dropEffect = 'move'
			setDropKey((current) => (current === key ? current : key))
		},
		onDragLeave: (event) => {
			const next = event.relatedTarget
			if (next instanceof Node && event.currentTarget.contains(next)) return
			setDropKey((current) => (current === key ? null : current))
		},
		onDrop: (event) => {
			if (!carriesMediaIds(event.dataTransfer?.types, DRAG_MIME)) return
			event.preventDefault()
			event.stopPropagation()
			setDropKey(null)
			void handleDrop(key, folderId, event)
		},
	})
	const dropState = (key: string): RowProps['dropState'] =>
		busyDrops.has(key) ? 'busy' : dropKey === key ? 'over' : 'none'

	/* --- render ----------------------------------------------------------- */

	const tabStopOf = (key: string) => key === tabKey
	const rowEvents = (key: string) => ({
		itemKey: key,
		tabStop: tabStopOf(key),
		onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => onRowKeyDown(event, key),
		onFocusRow: () => setFocusKey(key),
		onActivate: () => activate(key),
	})

	const moveNode = moveFor ? model.byId.get(moveFor) : undefined
	const activeAncestorSet = useMemo(() => new Set(activeAncestors), [activeAncestors])

	const rows: ReactNode[] = []

	rows.push(
		<TreeRow
			key='all'
			{...rowEvents('all')}
			label={`All media, ${noImages(countOf(total))}`}
			selected={active === undefined}
			level={1}
			pad={0.5}
			dropState={dropState('all')}
			drag={canWrite ? dragProps('all', null) : undefined}>
			<span className='size-5 shrink-0' />
			<Images aria-hidden className='size-4 shrink-0 text-slate-400' />
			<span className='min-w-0 truncate'>All media</span>
			<Count n={countOf(total)} busy={busyDrops.has('all')} />
		</TreeRow>,
	)

	if (reviewCount > 0)
		rows.push(
			<TreeRow
				key='review'
				{...rowEvents('review')}
				label={`Needs review, ${noImages(reviewCount)}`}
				selected={false}
				level={1}
				pad={0.5}
				dropState='none'>
				<span className='size-5 shrink-0' />
				<Sparkles aria-hidden className='size-4 shrink-0 text-brand' />
				<span className='min-w-0 truncate'>Needs review</span>
				<Badge
					aria-hidden
					variant='secondary'
					className='ml-auto rounded-full bg-brand/15 px-1.5 py-0 tabular-nums text-brand'>
					{formatCount(reviewCount)}
				</Badge>
			</TreeRow>,
		)

	const createRow = (parentId: string | null, depth: number, target: Editing) => (
		<li
			key={`create:${parentId ?? 'root'}`}
			role='none'
			className='flex min-h-9 items-start gap-1.5 py-0.5 pr-1'
			style={{ paddingLeft: `${0.5 + depth * 1}rem` }}>
			<span className='size-5 shrink-0' />
			<span className='mt-1.5'>
				<NewFolderIcon />
			</span>
			<FolderNameForm
				label={parentId ? 'Name for the new subfolder' : 'Name for the new folder'}
				onSubmit={(name) => onCreate(parentId, name)}
				onCancel={(viaKeyboard) =>
					finishEditing(target, parentId ? folderKeyOf(parentId) : 'new', viaKeyboard)
				}
				onDone={() => finishEditing(target, parentId ? folderKeyOf(parentId) : 'new', true)}
			/>
		</li>
	)

	if (editing?.kind === 'create' && editing.parentId === null)
		rows.push(createRow(null, 0, editing))

	for (const node of shown) {
		const key = folderKeyOf(node.id)
		const siblings = node.parent ? node.parent.children : model.roots
		const isOpen = expanded.has(node.id)
		const hasKids = node.children.length > 0
		const folderTotal = countOf(node.folder.total)
		const renaming = editing?.kind === 'rename' && editing.id === node.id
		const actions = menuActionsFor(node, { write: canWrite, delete: canDelete })

		rows.push(
			<TreeRow
				key={key}
				{...rowEvents(key)}
				// While the name is being edited, a click on the row is not a selection.
				onActivate={renaming ? () => {} : () => activate(key)}
				label={`${node.name}, ${noImages(folderTotal)}`}
				selected={active === node.id}
				contains={!isOpen && activeAncestorSet.has(node.id)}
				level={node.depth + 1}
				setSize={siblings.length}
				posInSet={siblings.indexOf(node) + 1}
				expanded={hasKids ? isOpen : undefined}
				pad={0.5 + Math.min(node.depth, 8)}
				dropState={dropState(key)}
				drag={canWrite ? dragProps(key, node.id) : undefined}>
				{hasKids ? (
					<Button
						type='button'
						variant='ghost'
						size='icon-xs'
						tabIndex={-1}
						aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`}
						onClick={(event) => {
							event.stopPropagation()
							if (isOpen) close(node.id)
							else open([node.id])
							focusItem(key)
						}}
						className='size-5 rounded text-slate-400 hover:bg-white/10 hover:text-white dark:hover:bg-white/10'>
						<ChevronRight
							aria-hidden
							className={cn('size-3.5 transition-transform motion-reduce:transition-none', isOpen && 'rotate-90')}
						/>
					</Button>
				) : (
					<span className='size-5 shrink-0' />
				)}
				{hasKids && isOpen ? (
					<FolderOpen aria-hidden className='size-4 shrink-0 text-slate-400' />
				) : (
					<Folder aria-hidden className='size-4 shrink-0 text-slate-400' />
				)}
				{renaming && editing ? (
					<FolderNameForm
						label={`Rename ${node.name}`}
						initial={node.name}
						onSubmit={(name) => onRename(node.id, name)}
						onCancel={(viaKeyboard) => finishEditing(editing, key, viaKeyboard)}
						onDone={() => finishEditing(editing, key, true)}
					/>
				) : (
					<>
						<span className='min-w-0 truncate' title={node.name}>
							{node.name}
						</span>
						<Count n={folderTotal} busy={busyDrops.has(key)} />
						{actions.length > 0 && (
							<DropdownMenu
								modal={false}
								open={menuFor === node.id}
								onOpenChange={(next) => setMenuFor(next ? node.id : null)}>
								<DropdownMenuTrigger asChild>
									<Button
										type='button'
										variant='ghost'
										size='icon-sm'
										// Only the focused row's button is a tab stop, so a long tree is one stop, not hundreds.
										tabIndex={tabStopOf(key) ? 0 : -1}
										aria-label={`Actions for ${node.name}`}
										className='size-7 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/70 data-[state=open]:bg-white/10 data-[state=open]:text-white dark:hover:bg-white/10'>
										<Ellipsis aria-hidden className='size-4' />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align='end'
									onCloseAutoFocus={(event) => {
										// Radix would focus the button; the row is where arrow keys work.
										event.preventDefault()
										if (menuIntent.current) {
											menuIntent.current = false
											return
										}
										focusItem(key)
									}}>
										{actions.map((action, index) => (
											<Fragment key={action}>
												{action === 'delete' && index > 0 && <DropdownMenuSeparator />}
												<DropdownMenuItem
													variant={action === 'delete' ? 'destructive' : 'default'}
													onSelect={() => {
														menuIntent.current = true
														runAction(action, node)
													}}>
													{ACTION_ICON[action]} {ACTION_LABEL[action]}
												</DropdownMenuItem>
											</Fragment>
										))}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</>
				)}
			</TreeRow>,
		)

		if (editing?.kind === 'create' && editing.parentId === node.id && isOpen)
			rows.push(createRow(node.id, node.depth + 1, editing))
	}

	return (
		<nav aria-label='Folders and saved searches' className='space-y-5'>
			<div>
				<div className='mb-1 flex items-center justify-between px-2'>
					<h2
						id={headingId}
						className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
						Library
					</h2>
					{canWrite && (
						<Button
							ref={addButtonRef}
							type='button'
							variant='ghost'
							size='icon-sm'
							aria-label='New folder'
							title='New folder'
							onClick={() => startCreate(null)}
							className='size-7 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/70 dark:hover:bg-white/10'>
							<Plus aria-hidden className='size-4' />
						</Button>
					)}
				</div>

				{notice && (
					<Alert
						variant='destructive'
						className='mb-2 flex items-start gap-2 rounded-md border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs'>
						<AlertDescription className='min-w-0 flex-1 text-xs text-destructive'>
							{notice}
						</AlertDescription>
						<Button
							type='button'
							variant='ghost'
							size='icon-xs'
							aria-label='Dismiss message'
							onClick={() => setNotice(null)}
							className='size-5 rounded text-destructive hover:bg-destructive/20 hover:text-destructive dark:hover:bg-destructive/20'>
							<X aria-hidden className='size-3.5' />
						</Button>
					</Alert>
				)}

				<ul ref={treeRef} role='tree' aria-labelledby={headingId} className='space-y-0.5'>
					{rows}
				</ul>
			</div>

			<SavedSearches
				saved={saved}
				canDelete={canWrite}
				onApply={onApplySaved}
				onDelete={onDeleteSaved}
			/>

			{deleteFor && (
				<DeleteFolderDialog
					info={deleteFor}
					onConfirm={async () => {
						await onDelete(deleteFor.id)
						// The row is gone: focus goes to what was above it, or to the first entry.
						const node = model.byId.get(deleteFor.id)
						dialogReturn.current = node?.parent ? folderKeyOf(node.parent.id) : 'all'
					}}
					onClose={() => setDeleteFor(null)}
					restoreFocus={() => focusItem(dialogReturn.current)}
				/>
			)}

			{moveNode && (
				<MoveDialog
					open
					onOpenChange={(next) => {
						if (!next) setMoveFor(null)
					}}
					title={`Move "${moveNode.name}"`}
					description='Choose the folder it should live in. Its images and subfolders go with it.'
					folders={folders}
					disabledIds={moveBlockedIds(model, moveNode)}
					currentId={moveNode.parent ? moveNode.parent.id : null}
					confirmLabel='Move here'
					onConfirm={async (target) => {
						await onMove(moveNode.id, target)
						// Show it where it landed.
						if (target) open([...ancestorsOf(model, target), target])
					}}
					restoreFocus={() => focusItem(dialogReturn.current)}
				/>
			)}
		</nav>
	)
}

/* -------------------------------------------------------------------------- */
/* Saved searches                                                             */
/* -------------------------------------------------------------------------- */

function SavedSearches({
	saved,
	canDelete,
	onApply,
	onDelete,
}: {
	saved: MediaSavedSearchDTO[]
	canDelete: boolean
	onApply(search: MediaSavedSearchDTO): void
	onDelete(id: string): Promise<void>
}) {
	const headingId = useId()
	const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
	const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})

	const list = Array.isArray(saved)
		? saved.filter((item) => item && typeof item.id === 'string')
		: []
	if (list.length === 0) return null

	const remove = async (item: MediaSavedSearchDTO) => {
		if (pending.has(item.id)) return
		setPending((current) => new Set(current).add(item.id))
		setErrors(({ [item.id]: _gone, ...rest }) => rest)
		const result = await attempt(() => onDelete(item.id), 'Could not delete this search.')
		setPending((current) => {
			const next = new Set(current)
			next.delete(item.id)
			return next
		})
		if (!result.ok) setErrors((current) => ({ ...current, [item.id]: result.message }))
	}

	return (
		<section aria-labelledby={headingId}>
			<h2
				id={headingId}
				className='mb-1 px-2 text-xs font-semibold uppercase tracking-widest text-slate-500'>
				Saved searches
			</h2>
			<ul className='space-y-0.5'>
				{list.map((item) => {
					const name =
						typeof item.name === 'string' && item.name.trim()
							? item.name
							: typeof item.query === 'string' && item.query.trim()
								? item.query
								: 'Untitled search'
					const busy = pending.has(item.id)
					const error = errors[item.id]
					return (
						<li key={item.id}>
							<div className='group flex min-h-9 items-center gap-1 rounded-md pr-1 hover:bg-white/5'>
								<Button
									type='button'
									variant='ghost'
									onClick={() => onApply(item)}
									title={typeof item.query === 'string' ? item.query : undefined}
									className='h-auto min-w-0 flex-1 justify-start gap-2 px-2 py-1.5 text-left font-normal text-slate-300 hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-brand/70 has-[>svg]:px-2 dark:hover:bg-transparent'>
									<Bookmark aria-hidden className='size-4 shrink-0 text-slate-400' />
									<span className='min-w-0 truncate'>{name}</span>
								</Button>
								{canDelete && (
									<Button
										type='button'
										variant='ghost'
										size='icon-sm'
										disabled={busy}
										aria-label={`Delete saved search ${name}`}
										onClick={() => void remove(item)}
										className='size-7 text-slate-400 hover:bg-white/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-brand/70 disabled:opacity-60 dark:hover:bg-white/10'>
										{busy ? (
											<Loader2 aria-hidden className='size-3.5 animate-spin' />
										) : (
											<X aria-hidden className='size-3.5' />
										)}
									</Button>
								)}
							</div>
							{error && (
								<Alert
									variant='destructive'
									className='border-0 bg-transparent px-2 pt-0 pb-1 text-xs'>
									<AlertDescription className='text-xs text-destructive'>{error}</AlertDescription>
								</Alert>
							)}
						</li>
					)
				})}
			</ul>
		</section>
	)
}
