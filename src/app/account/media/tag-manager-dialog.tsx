'use client'

/**
 * Every tag in the library, with what you can do about it: see its images, rename it,
 * merge it into another, delete it.
 *
 * The state machine is a reducer (`managerReducer`) and the screen is a function of
 * that state (`TagManagerView`), so every state a person can reach (loading, failed,
 * empty, a rename that collides with another tag, a merge about to happen) can be
 * rendered and read by the proof. `TagManagerBody` is the thin part that loads, calls
 * the page's callbacks and reloads after every change.
 *
 * Rules worth keeping:
 *  - A rename that lands on an existing tag is a merge, and the person is told so
 *    BEFORE they press Save (`renameImpact`), not after.
 *  - One change at a time: while one is running every other row action waits, so two
 *    changes to the same tag cannot cross.
 *  - The list is reloaded after every change, and keeps showing the old rows while it
 *    does (a flicker to a skeleton after each edit would read as the page losing them).
 */
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useReducer,
	useRef,
	useState,
	type KeyboardEvent,
} from 'react'
import { ArrowDown, ArrowUp, Check, GitMerge, Loader2, Pencil, Search, Trash2, X } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { slugify } from '@/lib/media/text'
import { MEDIA_LIMITS, type MediaTagStat } from '@/lib/media/types'
import { cn } from '@/lib/utils'
import type { TagManagerDialogProps } from './contracts'
import { formatCount, pluralize } from './format'
import {
	cleanTagLabel,
	messageOf,
	nextTagActive,
	sanitizeTagStats,
	useReturnFocus,
} from './tag-editor'

/* -------------------------------------------------------------------------- */
/* Pure                                                                       */
/* -------------------------------------------------------------------------- */

export type SortKey = 'count' | 'az'

/** Rows drawn at once. A library can hold a couple of thousand tags; search narrows, "Show more" widens. */
export const ROWS_PER_PAGE = 100
/** The merge picker lists at most this many candidates. */
export const MERGE_OPTIONS_MAX = 50
/** The server sends at most 2000 tags; this only bounds a hostile reply. */
export const MANAGER_TAGS_MAX = 5000

const clean = (tags: unknown) => sanitizeTagStats(tags, MANAGER_TAGS_MAX)

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

const byLabel = (a: MediaTagStat, b: MediaTagStat) =>
	collator.compare(a.label, b.label) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)

/**
 * The rows to show: filtered by what was typed (a case-insensitive match on the label
 * or the slug), then sorted. Most images first breaks ties alphabetically, so the order
 * never shuffles between reloads; A to Z is a natural sort (`Room 2` before `Room 10`).
 * Never mutates its input.
 */
export function filterAndSortTags(
	tags: readonly MediaTagStat[],
	options: { query: string; sort: SortKey },
): MediaTagStat[] {
	const rows = clean(tags)
	const q = typeof options.query === 'string' ? options.query.trim().toLowerCase() : ''
	const qSlug = q ? slugify(q) : ''
	const kept = q
		? rows.filter(
				(tag) =>
					tag.label.toLowerCase().includes(q) ||
					tag.slug.toLowerCase().includes(q) ||
					(qSlug !== '' && tag.slug.includes(qSlug)),
			)
		: rows
	return [...kept].sort(
		options.sort === 'az' ? byLabel : (a, b) => b.count - a.count || byLabel(a, b),
	)
}

export type RenameImpact =
	| { kind: 'invalid'; message: string }
	/** Nothing to save. */
	| { kind: 'unchanged' }
	/** Same identity, different capitalisation or punctuation: only how it reads changes. */
	| { kind: 'spelling'; slug: string; label: string }
	/** A name nobody has: the tag moves to a new slug. */
	| { kind: 'rename'; slug: string; label: string }
	/** The new name already exists: saving folds this tag into `into`. */
	| { kind: 'merge'; slug: string; label: string; into: MediaTagStat }

/**
 * What saving a rename would do, worked out from the list the person is looking at.
 * Identity is the slug, so "kitchens" and "Kitchens!" are the same name, and a name
 * whose slug belongs to another tag is a merge (the server says the same, afterwards).
 */
export function renameImpact(
	tags: readonly MediaTagStat[],
	slug: string,
	draft: string,
): RenameImpact {
	const label = cleanTagLabel(draft)
	if (!label) return { kind: 'invalid', message: 'Give the tag a name.' }
	const next = slugify(label)
	if (!next)
		return { kind: 'invalid', message: 'A tag name needs at least one letter or number.' }
	if (Array.from(label).length > MEDIA_LIMITS.tagLabelMax)
		return {
			kind: 'invalid',
			message: `A tag name can be at most ${MEDIA_LIMITS.tagLabelMax} characters.`,
		}
	const rows = clean(tags)
	const self = rows.find((tag) => tag.slug === slug)
	if (next === slug) {
		return self && self.label === label
			? { kind: 'unchanged' }
			: { kind: 'spelling', slug: next, label }
	}
	const into = rows.find((tag) => tag.slug === next)
	return into
		? { kind: 'merge', slug: next, label, into }
		: { kind: 'rename', slug: next, label }
}

/** `5 manual · 2 automatic` */
export function splitCaption(tag: Pick<MediaTagStat, 'manual' | 'auto'>) {
	return `${formatCount(tag.manual)} manual · ${formatCount(tag.auto)} automatic`
}

/** The other tags a merge could go into, most used first, matching what was typed. */
export function mergeTargets(
	tags: readonly MediaTagStat[],
	slug: string,
	query: string,
	limit = MERGE_OPTIONS_MAX,
): MediaTagStat[] {
	return filterAndSortTags(
		clean(tags).filter((tag) => tag.slug !== slug),
		{ query, sort: 'count' },
	).slice(0, Math.max(0, limit))
}

export type MergeKeyDecision =
	| { type: 'none' }
	| { type: 'move'; active: number }
	| { type: 'choose'; index: number }
	| { type: 'cancel' }

/**
 * Down and Up walk the candidates (with a "nothing" stop), Enter chooses the one walked
 * to (or the only one left), Esc backs out of the merge. Tab is left alone.
 */
export function decideMergeKey(
	key: { key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; isComposing?: boolean },
	ctx: { count: number; active: number },
): MergeKeyDecision {
	if (key.isComposing || key.key === 'Process') return { type: 'none' }
	if (key.ctrlKey || key.altKey || key.metaKey) return { type: 'none' }
	switch (key.key) {
		case 'ArrowDown':
		case 'ArrowUp':
			if (key.shiftKey || ctx.count === 0) return { type: 'none' }
			return {
				type: 'move',
				active: nextTagActive(ctx.active, key.key === 'ArrowDown' ? 1 : -1, ctx.count),
			}
		case 'Enter':
			if (ctx.active >= 0 && ctx.active < ctx.count) return { type: 'choose', index: ctx.active }
			return ctx.count === 1 ? { type: 'choose', index: 0 } : { type: 'none' }
		case 'Escape':
			return { type: 'cancel' }
		default:
			return { type: 'none' }
	}
}

export type ManagerLoad =
	| { status: 'loading' }
	| { status: 'error'; message: string }
	| {
			status: 'ready'
			tags: MediaTagStat[]
			/** Reloading after a change; the rows stay on screen meanwhile. */
			refreshing: boolean
			/** The reload failed; the rows are the last good ones. */
			refreshError: string | null
	  }

export type RowMode =
	| { mode: 'rename'; slug: string; draft: string; busy: boolean; error: string | null }
	| {
			mode: 'merge'
			slug: string
			query: string
			target: string | null
			busy: boolean
			error: string | null
	  }
	| { mode: 'delete'; slug: string; busy: boolean; error: string | null }

export type ManagerState = {
	load: ManagerLoad
	query: string
	sort: SortKey
	/** How many rows are drawn. */
	shown: number
	/** The one row being renamed, merged or deleted. */
	row: RowMode | null
	notice: string | null
}

export type ManagerAction =
	| { type: 'load'; refresh: boolean }
	| { type: 'loaded'; tags: unknown }
	| { type: 'load-failed'; message: string }
	| { type: 'query'; value: string }
	| { type: 'sort'; value: SortKey }
	| { type: 'more' }
	| { type: 'rename-open'; slug: string; label: string }
	| { type: 'rename-edit'; draft: string }
	| { type: 'merge-open'; slug: string }
	| { type: 'merge-query'; value: string }
	| { type: 'merge-pick'; target: string | null }
	| { type: 'delete-open'; slug: string }
	| { type: 'row-close' }
	| { type: 'row-busy' }
	| { type: 'row-failed'; message: string }
	| { type: 'changed'; notice: string }
	| { type: 'dismiss-notice' }

export const initialManager = (): ManagerState => ({
	load: { status: 'loading' },
	query: '',
	sort: 'count',
	shown: ROWS_PER_PAGE,
	row: null,
	notice: null,
})

export const tagsOf = (state: Pick<ManagerState, 'load'>): MediaTagStat[] =>
	state.load.status === 'ready' ? state.load.tags : []

export function managerReducer(state: ManagerState, action: ManagerAction): ManagerState {
	const busy = state.row?.busy === true
	switch (action.type) {
		case 'load':
			return action.refresh && state.load.status === 'ready'
				? { ...state, load: { ...state.load, refreshing: true, refreshError: null } }
				: { ...state, load: { status: 'loading' }, row: null }
		case 'loaded':
			return {
				...state,
				load: {
					status: 'ready',
					tags: clean(action.tags),
					refreshing: false,
					refreshError: null,
				},
			}
		case 'load-failed':
			return state.load.status === 'ready'
				? {
						...state,
						load: { ...state.load, refreshing: false, refreshError: action.message },
					}
				: { ...state, load: { status: 'error', message: action.message } }
		case 'query':
			return { ...state, query: action.value, shown: ROWS_PER_PAGE }
		case 'sort':
			return { ...state, sort: action.value, shown: ROWS_PER_PAGE }
		case 'more':
			return { ...state, shown: state.shown + ROWS_PER_PAGE }
		case 'rename-open':
			if (busy) return state
			return {
				...state,
				notice: null,
				row: { mode: 'rename', slug: action.slug, draft: action.label, busy: false, error: null },
			}
		case 'rename-edit':
			return state.row?.mode === 'rename'
				? { ...state, row: { ...state.row, draft: action.draft, error: null } }
				: state
		case 'merge-open':
			if (busy) return state
			return {
				...state,
				notice: null,
				row: { mode: 'merge', slug: action.slug, query: '', target: null, busy: false, error: null },
			}
		case 'merge-query':
			return state.row?.mode === 'merge'
				? { ...state, row: { ...state.row, query: action.value, error: null } }
				: state
		case 'merge-pick':
			return state.row?.mode === 'merge'
				? { ...state, row: { ...state.row, target: action.target, error: null } }
				: state
		case 'delete-open':
			if (busy) return state
			return {
				...state,
				notice: null,
				row: { mode: 'delete', slug: action.slug, busy: false, error: null },
			}
		case 'row-close':
			// A change already on its way cannot be called back.
			return busy ? state : { ...state, row: null }
		case 'row-busy':
			return state.row ? { ...state, row: { ...state.row, busy: true, error: null } } : state
		case 'row-failed':
			return state.row
				? { ...state, row: { ...state.row, busy: false, error: action.message } }
				: state
		case 'changed':
			return { ...state, row: null, notice: action.notice }
		case 'dismiss-notice':
			return state.notice === null ? state : { ...state, notice: null }
		default:
			return state
	}
}

/* -------------------------------------------------------------------------- */
/* Parts                                                                      */
/* -------------------------------------------------------------------------- */

const inputClass =
	'h-9 border-white/10 bg-white/3 text-white placeholder:text-slate-500 focus-visible:border-brand/60 focus-visible:ring-brand/20'
const focusRing =
	'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none'
const rowButton = cn(
	focusRing,
	'cursor-pointer text-slate-300 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed',
)

const clip = (text: string, max = 40) => {
	const chars = Array.from(text)
	return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

export type ManagerActions = {
	onQuery(value: string): void
	onSort(sort: SortKey): void
	onMore(): void
	onRetry(): void
	onShow(slug: string): void
	onRenameOpen(slug: string, label: string): void
	onRenameEdit(draft: string): void
	onRenameSave(): void
	onMergeOpen(slug: string): void
	onMergeQuery(value: string): void
	onMergePick(slug: string | null): void
	onMergeConfirm(): void
	onDeleteOpen(slug: string): void
	onDeleteConfirm(): void
	onRowClose(): void
	onDismissNotice(): void
}

export function RenameEditor({
	tag,
	tags,
	row,
	actions,
}: {
	tag: MediaTagStat
	tags: readonly MediaTagStat[]
	row: Extract<RowMode, { mode: 'rename' }>
	actions: Pick<ManagerActions, 'onRenameEdit' | 'onRenameSave' | 'onRowClose'>
}) {
	const id = useId()
	const impact = renameImpact(tags, tag.slug, row.draft)
	const canSave = (impact.kind === 'spelling' || impact.kind === 'rename' || impact.kind === 'merge') && !row.busy
	let message: string | null = null
	if (impact.kind === 'invalid') message = impact.message
	else if (impact.kind === 'spelling')
		message = `Only the spelling changes. All ${pluralize(tag.count, 'image')} keep the tag.`
	else if (impact.kind === 'rename')
		message = `Renames the tag on ${pluralize(tag.count, 'image')}.`
	else if (impact.kind === 'merge')
		message = `A tag named "${clip(impact.into.label)}" already exists (${pluralize(impact.into.count, 'image')}). Saving merges "${clip(tag.label)}" into it: its ${pluralize(tag.count, 'image')} get "${clip(impact.into.label)}", and "${clip(tag.label)}" goes away.`
	return (
		<form
			data-slot='tag-row-editor'
			data-mode='rename'
			onSubmit={(event) => {
				event.preventDefault()
				if (canSave) actions.onRenameSave()
			}}
			className='space-y-2'>
			<label htmlFor={id} className='text-xs font-medium text-slate-300'>
				{`New name for "${clip(tag.label)}"`}
			</label>
			<div className='flex flex-wrap items-center gap-2'>
				<Input
					id={id}
					type='text'
					autoFocus
					autoComplete='off'
					spellCheck={false}
					value={row.draft}
					disabled={row.busy}
					aria-invalid={impact.kind === 'invalid' || row.error ? true : undefined}
					aria-describedby={`${id}-note`}
					onFocus={(event) => event.currentTarget.select()}
					onChange={(event) => actions.onRenameEdit(event.target.value)}
					onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
						if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
						event.preventDefault()
						actions.onRowClose()
					}}
					className={cn(inputClass, 'min-w-48 flex-1')}
				/>
				<Button
					type='submit'
					size='sm'
					disabled={!canSave}
					aria-busy={row.busy || undefined}
					className='bg-brand font-bold text-ink hover:bg-brand-strong'>
					{row.busy && <Loader2 aria-hidden className='animate-spin motion-reduce:animate-none' />}
					{impact.kind === 'merge' ? 'Merge' : 'Save'}
				</Button>
				<Button
					type='button'
					size='sm'
					variant='ghost'
					disabled={row.busy}
					onClick={actions.onRowClose}
					className={rowButton}>
					Cancel
				</Button>
			</div>
			<p
				id={`${id}-note`}
				aria-live='polite'
				data-impact={impact.kind}
				className={cn(
					'min-h-4 text-xs',
					impact.kind === 'invalid' ? 'text-destructive' : 'text-slate-400',
					impact.kind === 'merge' && 'text-amber-300',
				)}>
				{message}
			</p>
			{row.error && (
				<p role='alert' className='text-xs text-destructive'>
					{row.error}
				</p>
			)}
		</form>
	)
}

export function MergePicker({
	tag,
	tags,
	row,
	actions,
}: {
	tag: MediaTagStat
	tags: readonly MediaTagStat[]
	row: Extract<RowMode, { mode: 'merge' }>
	actions: Pick<
		ManagerActions,
		'onMergeQuery' | 'onMergePick' | 'onMergeConfirm' | 'onRowClose'
	>
}) {
	const baseId = useId()
	const listId = `${baseId}-list`
	const optionId = (index: number) => `${baseId}-option-${index}`
	const [active, setActive] = useState(-1)
	const candidates = useMemo(
		() => mergeTargets(tags, tag.slug, row.query),
		[tags, tag.slug, row.query],
	)
	const target = row.target ? tags.find((candidate) => candidate.slug === row.target) : undefined
	const expanded = !target && candidates.length > 0
	const index = active >= 0 && active < candidates.length ? active : -1

	return (
		<form
			data-slot='tag-row-editor'
			data-mode='merge'
			onSubmit={(event) => {
				event.preventDefault()
				if (target && !row.busy) actions.onMergeConfirm()
			}}
			className='space-y-2'>
			<p id={`${baseId}-title`} className='text-xs font-medium text-slate-300'>
				{`Merge "${clip(tag.label)}" into another tag`}
			</p>
			{target ? (
				<div className='space-y-2'>
					<p className='flex flex-wrap items-center gap-2 text-sm text-white'>
						<GitMerge aria-hidden className='size-4 text-slate-400' />
						<span>
							{`Into "${clip(target.label)}"`}
							<span className='ml-1 text-slate-400'>
								{`(${pluralize(target.count, 'image')})`}
							</span>
						</span>
						<Button
							type='button'
							size='xs'
							variant='ghost'
							disabled={row.busy}
							onClick={() => actions.onMergePick(null)}
							className={rowButton}>
							Change
						</Button>
					</p>
					<p data-impact='merge' className='text-xs text-amber-300'>
						{`The ${pluralize(tag.count, 'image')} tagged "${clip(tag.label)}" will be tagged "${clip(target.label)}" instead, and "${clip(tag.label)}" goes away.`}
					</p>
				</div>
			) : (
				<div className='relative'>
					<Input
						type='text'
						role='combobox'
						autoFocus
						autoComplete='off'
						spellCheck={false}
						aria-labelledby={`${baseId}-title`}
						aria-autocomplete='list'
						aria-haspopup='listbox'
						aria-expanded={expanded}
						aria-controls={listId}
						aria-activedescendant={expanded && index >= 0 ? optionId(index) : undefined}
						placeholder='Search for the tag to merge into'
						value={row.query}
						disabled={row.busy}
						onChange={(event) => {
							setActive(-1)
							actions.onMergeQuery(event.target.value)
						}}
						onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
							const decision = decideMergeKey(
								{
									key: event.key,
									shiftKey: event.shiftKey,
									ctrlKey: event.ctrlKey,
									altKey: event.altKey,
									metaKey: event.metaKey,
									isComposing: event.nativeEvent.isComposing,
								},
								{ count: candidates.length, active: index },
							)
							if (decision.type === 'none') return
							event.preventDefault()
							if (decision.type === 'move') setActive(decision.active)
							else if (decision.type === 'choose')
								actions.onMergePick(candidates[decision.index]?.slug ?? null)
							else actions.onRowClose()
						}}
						className={cn(inputClass, 'w-full')}
					/>
					<ul
						id={listId}
						role='listbox'
						aria-label='Tags to merge into'
						hidden={!expanded}
						onMouseDown={(event) => event.preventDefault()}
						className='absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-popover p-1 shadow-xl'>
						{expanded &&
							candidates.map((candidate, at) => (
								<li
									key={candidate.slug}
									id={optionId(at)}
									role='option'
									aria-selected={at === index}
									onClick={() => actions.onMergePick(candidate.slug)}
									className={cn(
										'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm',
										at === index ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
									)}>
									<span dir='auto' className='min-w-0 flex-1 truncate'>
										{candidate.label}
									</span>
									{' '}
									<span className='shrink-0 text-xs tabular-nums text-slate-500'>
										{`(${formatCount(candidate.count)})`}
									</span>
								</li>
							))}
					</ul>
					{candidates.length === 0 && (
						<p className='mt-1.5 text-xs text-slate-500'>
							{row.query.trim() ? 'No other tag matches.' : 'There are no other tags to merge into.'}
						</p>
					)}
				</div>
			)}
			<div className='flex items-center gap-2'>
				<Button
					type='submit'
					size='sm'
					disabled={!target || row.busy}
					aria-busy={row.busy || undefined}
					className='bg-brand font-bold text-ink hover:bg-brand-strong'>
					{row.busy && <Loader2 aria-hidden className='animate-spin motion-reduce:animate-none' />}
					Merge
				</Button>
				<Button
					type='button'
					size='sm'
					variant='ghost'
					disabled={row.busy}
					onClick={actions.onRowClose}
					className={rowButton}>
					Cancel
				</Button>
			</div>
			{row.error && (
				<p role='alert' className='text-xs text-destructive'>
					{row.error}
				</p>
			)}
		</form>
	)
}

function DeleteTagDialog({
	tag,
	row,
	actions,
}: {
	tag: MediaTagStat | undefined
	row: Extract<RowMode, { mode: 'delete' }> | null
	actions: Pick<ManagerActions, 'onDeleteConfirm' | 'onRowClose'>
}) {
	return (
		<AlertDialog
			open={row !== null && tag !== undefined}
			onOpenChange={(next) => {
				// Esc and the overlay must not abandon a delete that is already running.
				if (!next && !row?.busy) actions.onRowClose()
			}}>
			<AlertDialogContent className='motion-reduce:animate-none! motion-reduce:duration-0!'>
				<AlertDialogHeader>
					<AlertDialogTitle>{`Delete the tag "${clip(tag?.label ?? '')}"?`}</AlertDialogTitle>
					<AlertDialogDescription>
						{`It is removed from every image that has it (${pluralize(tag?.count ?? 0, 'image')}), and the auto-tagger will not bring it back. The images themselves are not deleted.`}
					</AlertDialogDescription>
				</AlertDialogHeader>
				{row?.error && (
					<p role='alert' className='text-sm text-destructive'>
						{row.error}
					</p>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={row?.busy}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={row?.busy}
						onClick={(event) => {
							// Radix closes on click; stay open until the server has answered.
							event.preventDefault()
							actions.onDeleteConfirm()
						}}
						className='bg-destructive text-white hover:bg-destructive/90'>
						{row?.busy && (
							<Loader2 aria-hidden className='animate-spin motion-reduce:animate-none' />
						)}
						Delete tag
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function SortHeader({
	label,
	active,
	direction,
	onClick,
	className,
}: {
	label: string
	active: boolean
	direction: 'ascending' | 'descending'
	onClick(): void
	className?: string
}) {
	return (
		<th
			scope='col'
			aria-sort={active ? direction : 'none'}
			className={cn('py-2 pr-3 font-semibold', className)}>
			<button
				type='button'
				onClick={onClick}
				className={cn(
					focusRing,
					'inline-flex cursor-pointer items-center gap-1 rounded uppercase tracking-widest hover:text-white',
					active && 'text-white',
				)}>
				{label}
				{active &&
					(direction === 'ascending' ? (
						<ArrowUp aria-hidden className='size-3' />
					) : (
						<ArrowDown aria-hidden className='size-3' />
					))}
			</button>
		</th>
	)
}

export type TagManagerViewProps = {
	state: ManagerState
	canEdit: boolean
	canDelete: boolean
	actions: ManagerActions
}

export function TagManagerView({ state, canEdit, canDelete, actions }: TagManagerViewProps) {
	const searchId = useId()
	const { load } = state
	const tags = tagsOf(state)
	const rows = useMemo(
		() => filterAndSortTags(tags, { query: state.query, sort: state.sort }),
		// `tags` is read from `state.load`.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[load, state.query, state.sort],
	)
	const row = state.row
	const rowTag = row ? tags.find((tag) => tag.slug === row.slug) : undefined
	const locked = row?.busy === true || (load.status === 'ready' && load.refreshing)
	const visible = rows.slice(0, state.shown)
	const searching = state.query.trim() !== ''

	// When a rename, merge or delete closes, the control that held focus is gone (a removed
	// editor, a closed alert). Put focus back on the button that opened it; if that button is
	// waiting for the reload, on the search box. Never leave it on nothing.
	const searchRef = useRef<HTMLInputElement>(null)
	const tableRef = useRef<HTMLDivElement>(null)
	const before = useRef<RowMode | null>(null)
	useEffect(() => {
		const closed = before.current
		before.current = row
		if (!closed || row) return
		const rowEl = Array.from(
			tableRef.current?.querySelectorAll<HTMLElement>('[data-slot="tag-row"]') ?? [],
		).find((el) => el.dataset.slug === closed.slug)
		const opener = rowEl?.querySelector<HTMLButtonElement>(`[data-action="${closed.mode}"]`)
		if (opener && !opener.disabled) opener.focus()
		else searchRef.current?.focus()
	}, [row])

	if (load.status === 'loading') {
		return (
			<div
				role='status'
				aria-busy='true'
				data-slot='tag-manager-loading'
				className='space-y-3 py-2'>
				<span className='sr-only'>Loading your tags</span>
				{Array.from({ length: 6 }, (_, index) => (
					<div key={index} aria-hidden className='flex items-center gap-4'>
						<Skeleton className='h-5 flex-1 rounded motion-reduce:animate-none' />
						<Skeleton className='h-5 w-12 rounded motion-reduce:animate-none' />
						<Skeleton className='h-5 w-28 rounded motion-reduce:animate-none' />
						<Skeleton className='h-7 w-40 rounded-md motion-reduce:animate-none' />
					</div>
				))}
			</div>
		)
	}

	if (load.status === 'error') {
		return (
			<div
				role='alert'
				data-slot='tag-manager-error'
				className='space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4'>
				<p className='text-sm text-destructive'>{load.message}</p>
				<Button
					type='button'
					size='sm'
					variant='outline'
					onClick={actions.onRetry}
					className='border-white/15 bg-transparent text-white hover:bg-white/5'>
					Try again
				</Button>
			</div>
		)
	}

	return (
		<div data-slot='tag-manager' className='flex min-h-0 flex-1 flex-col gap-3'>
			<div className='flex flex-wrap items-center gap-3'>
				<div className='relative min-w-48 flex-1'>
					<label htmlFor={searchId} className='sr-only'>
						Search tags
					</label>
					<Search
						aria-hidden
						className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500'
					/>
					<Input
						ref={searchRef}
						id={searchId}
						type='search'
						autoComplete='off'
						spellCheck={false}
						placeholder='Search tags'
						value={state.query}
						onChange={(event) => actions.onQuery(event.target.value)}
						className={cn(inputClass, 'pl-9')}
					/>
				</div>
				<p aria-live='polite' className='shrink-0 text-xs text-slate-400'>
					{tags.length === 0
						? ''
						: searching
							? `${formatCount(rows.length)} of ${pluralize(tags.length, 'tag')}`
							: pluralize(tags.length, 'tag')}
					{load.refreshing && (
						<span className='ml-2 inline-flex items-center gap-1'>
							<Loader2 aria-hidden className='size-3 animate-spin motion-reduce:animate-none' />
							Updating
						</span>
					)}
				</p>
			</div>

			{state.notice && (
				<p
					role='status'
					data-slot='tag-manager-notice'
					className='flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-white'>
					<Check aria-hidden className='mt-0.5 size-4 shrink-0 text-brand' />
					<span className='min-w-0 flex-1'>{state.notice}</span>
					<button
						type='button'
						aria-label='Dismiss message'
						onClick={actions.onDismissNotice}
						className={cn(focusRing, 'shrink-0 cursor-pointer rounded text-slate-400 hover:text-white')}>
						<X aria-hidden className='size-4' />
					</button>
				</p>
			)}
			{load.refreshError && (
				<p
					role='alert'
					className='flex flex-wrap items-center gap-2 text-sm text-destructive'>
					<span>{load.refreshError}</span>
					<Button
						type='button'
						size='xs'
						variant='outline'
						onClick={actions.onRetry}
						className='border-white/15 bg-transparent text-white hover:bg-white/5'>
						Reload
					</Button>
				</p>
			)}

			{tags.length === 0 ? (
				<div
					data-slot='tag-manager-empty'
					className='rounded-xl border border-dashed border-white/15 px-4 py-12 text-center'>
					<p className='font-medium text-white'>No tags yet</p>
					<p className='mt-1 text-sm text-slate-400'>
						Tags you add to an image, and the ones the auto-tagger suggests, will be listed
						here.
					</p>
				</div>
			) : rows.length === 0 ? (
				<div
					data-slot='tag-manager-no-match'
					className='rounded-xl border border-dashed border-white/15 px-4 py-10 text-center'>
					<p className='font-medium text-white'>{`No tags match "${clip(state.query.trim())}"`}</p>
					<Button
						type='button'
						size='sm'
						variant='ghost'
						onClick={() => actions.onQuery('')}
						className={cn(rowButton, 'mt-2')}>
						Clear search
					</Button>
				</div>
			) : (
				<div
					ref={tableRef}
					className='min-h-0 flex-1 overflow-auto rounded-lg border border-white/10'>
					<table aria-label='Tags' className='w-full min-w-136 border-collapse text-sm'>
						<thead className='sticky top-0 z-10 bg-popover'>
							<tr className='border-b border-white/10 text-left text-xs text-slate-500'>
								<SortHeader
									label='Tag'
									active={state.sort === 'az'}
									direction='ascending'
									onClick={() => actions.onSort('az')}
									className='pl-3'
								/>
								<SortHeader
									label='Images'
									active={state.sort === 'count'}
									direction='descending'
									onClick={() => actions.onSort('count')}
								/>
								<th scope='col' className='py-2 pr-3 font-semibold uppercase tracking-widest'>
									Manual / automatic
								</th>
								<th scope='col' className='py-2 pr-3'>
									<span className='sr-only'>Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{visible.map((tag) => {
								const editing = row?.slug === tag.slug
								const quoted = `"${clip(tag.label)}"`
								return (
									<TagRows
										key={tag.slug}
										tag={tag}
										tags={tags}
										quoted={quoted}
										row={editing ? row : null}
										locked={locked}
										canEdit={canEdit}
										canDelete={canDelete}
										actions={actions}
									/>
								)
							})}
						</tbody>
					</table>
					{rows.length > visible.length && (
						<div className='border-t border-white/10 p-2 text-center'>
							<Button
								type='button'
								size='sm'
								variant='ghost'
								onClick={actions.onMore}
								className={rowButton}>
								{`Show ${formatCount(Math.min(ROWS_PER_PAGE, rows.length - visible.length))} more (${formatCount(rows.length - visible.length)} left)`}
							</Button>
						</div>
					)}
				</div>
			)}

			<DeleteTagDialog
				tag={rowTag}
				row={row?.mode === 'delete' ? row : null}
				actions={actions}
			/>
		</div>
	)
}

function TagRows({
	tag,
	tags,
	quoted,
	row,
	locked,
	canEdit,
	canDelete,
	actions,
}: {
	tag: MediaTagStat
	tags: readonly MediaTagStat[]
	quoted: string
	row: RowMode | null
	locked: boolean
	canEdit: boolean
	canDelete: boolean
	actions: ManagerActions
}) {
	return (
		<>
			<tr
				data-slot='tag-row'
				data-slug={tag.slug}
				className='border-b border-white/5 align-middle last:border-b-0'>
				<th scope='row' className='max-w-[16rem] py-2 pr-3 pl-3 text-left font-medium'>
					<span dir='auto' title={tag.label} className='block truncate text-white'>
						{tag.label}
					</span>
				</th>
				<td className='py-2 pr-3 whitespace-nowrap text-slate-200 tabular-nums'>
					{formatCount(tag.count)}
				</td>
				<td className='py-2 pr-3 whitespace-nowrap text-xs text-slate-400'>{splitCaption(tag)}</td>
				<td className='py-2 pr-3'>
					<div className='flex flex-wrap items-center justify-end gap-1'>
						<Button
							type='button'
							size='xs'
							variant='ghost'
							data-action='show'
							aria-label={`Show images tagged ${quoted}`}
							onClick={() => actions.onShow(tag.slug)}
							className={rowButton}>
							Show images
						</Button>
						{canEdit && (
							<>
								<Button
									type='button'
									size='xs'
									variant='ghost'
									disabled={locked}
									data-action='rename'
									aria-label={`Rename ${quoted}`}
									onClick={() => actions.onRenameOpen(tag.slug, tag.label)}
									className={rowButton}>
									<Pencil aria-hidden />
									Rename
								</Button>
								<Button
									type='button'
									size='xs'
									variant='ghost'
									disabled={locked}
									data-action='merge'
									aria-label={`Merge ${quoted} into another tag`}
									onClick={() => actions.onMergeOpen(tag.slug)}
									className={rowButton}>
									<GitMerge aria-hidden />
									Merge into…
								</Button>
							</>
						)}
						{canDelete && (
							<Button
								type='button'
								size='xs'
								variant='ghost'
								disabled={locked}
								data-action='delete'
								aria-label={`Delete ${quoted}`}
								onClick={() => actions.onDeleteOpen(tag.slug)}
								className={cn(rowButton, 'text-destructive hover:bg-destructive/10 hover:text-destructive')}>
								<Trash2 aria-hidden />
								Delete
							</Button>
						)}
					</div>
				</td>
			</tr>
			{row && row.mode !== 'delete' && (
				<tr data-slot='tag-row-detail' className='border-b border-white/5 bg-white/3'>
					<td colSpan={4} className='px-3 py-3'>
						{row.mode === 'rename' ? (
							<RenameEditor tag={tag} tags={tags} row={row} actions={actions} />
						) : (
							<MergePicker tag={tag} tags={tags} row={row} actions={actions} />
						)}
					</td>
				</tr>
			)}
		</>
	)
}

/* -------------------------------------------------------------------------- */
/* Container                                                                  */
/* -------------------------------------------------------------------------- */

export type TagManagerBodyProps = Pick<
	TagManagerDialogProps,
	'canEdit' | 'canDelete' | 'fetchTags' | 'onRename' | 'onMerge' | 'onDelete' | 'onFilter'
> & {
	onClose(): void
	/** Shared with the dialog so Esc and the overlay can refuse to close mid-change. */
	busy: { current: boolean }
}

/** Mounted only while the dialog is open, so every open loads fresh and starts clean. */
export function TagManagerBody({
	canEdit,
	canDelete,
	fetchTags,
	onRename,
	onMerge,
	onDelete,
	onFilter,
	onClose,
	busy,
}: TagManagerBodyProps) {
	const [state, dispatch] = useReducer(managerReducer, undefined, initialManager)
	const live = useRef({ fetchTags, onRename, onMerge, onDelete, onFilter, onClose })
	useEffect(() => {
		live.current = { fetchTags, onRename, onMerge, onDelete, onFilter, onClose }
	})
	const stateRef = useRef(state)
	useEffect(() => {
		stateRef.current = state
	})
	const generation = useRef(0)
	const mounted = useRef(true)
	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
		}
	}, [])

	const load = useCallback(async (refresh: boolean) => {
		const mine = ++generation.current
		dispatch({ type: 'load', refresh })
		try {
			const tags = await live.current.fetchTags()
			if (mine === generation.current) dispatch({ type: 'loaded', tags })
		} catch (error) {
			if (mine === generation.current)
				dispatch({ type: 'load-failed', message: messageOf(error, 'Could not load your tags.') })
		}
	}, [])

	useEffect(() => {
		void load(false)
		return () => {
			// A reply that arrives after the dialog closed has nowhere to go.
			generation.current++
		}
	}, [load])

	const change = async (run: (tags: MediaTagStat[]) => Promise<string>) => {
		if (busy.current) return
		busy.current = true
		dispatch({ type: 'row-busy' })
		try {
			const notice = await run(tagsOf(stateRef.current))
			busy.current = false
			dispatch({ type: 'changed', notice })
			// The dialog may have been closed (Show images) while this ran: nothing to refresh then.
			if (mounted.current) void load(true)
		} catch (error) {
			busy.current = false
			dispatch({ type: 'row-failed', message: messageOf(error, 'Could not make that change.') })
		}
	}

	const labelFor = (tags: readonly MediaTagStat[], slug: string, fallback = slug) =>
		tags.find((tag) => tag.slug === slug)?.label ?? fallback

	const actions: ManagerActions = {
		onQuery: (value) => dispatch({ type: 'query', value }),
		onSort: (value) => dispatch({ type: 'sort', value }),
		onMore: () => dispatch({ type: 'more' }),
		onRetry: () => void load(state.load.status === 'ready'),
		onShow: (slug) => {
			live.current.onFilter(slug)
			live.current.onClose()
		},
		onRenameOpen: (slug, label) => dispatch({ type: 'rename-open', slug, label }),
		onRenameEdit: (draft) => dispatch({ type: 'rename-edit', draft }),
		onRenameSave: () => {
			const row = stateRef.current.row
			if (!row || row.mode !== 'rename') return
			const impact = renameImpact(tagsOf(stateRef.current), row.slug, row.draft)
			if (impact.kind === 'invalid' || impact.kind === 'unchanged') return
			const label = cleanTagLabel(row.draft)
			void change(async (tags) => {
				const result = await live.current.onRename(row.slug, label)
				const slug = typeof result?.slug === 'string' && result.slug ? result.slug : impact.slug
				const into = labelFor(tags, slug, label)
				return result?.merged === true
					? `Merged into "${clip(into)}".`
					: `Renamed to "${clip(label)}".`
			})
		},
		onMergeOpen: (slug) => dispatch({ type: 'merge-open', slug }),
		onMergeQuery: (value) => dispatch({ type: 'merge-query', value }),
		onMergePick: (target) => dispatch({ type: 'merge-pick', target }),
		onMergeConfirm: () => {
			const row = stateRef.current.row
			if (!row || row.mode !== 'merge' || !row.target) return
			const { slug, target } = row
			void change(async (tags) => {
				await live.current.onMerge(slug, target)
				return `Merged "${clip(labelFor(tags, slug))}" into "${clip(labelFor(tags, target))}".`
			})
		},
		onDeleteOpen: (slug) => dispatch({ type: 'delete-open', slug }),
		onDeleteConfirm: () => {
			const row = stateRef.current.row
			if (!row || row.mode !== 'delete') return
			const { slug } = row
			void change(async (tags) => {
				await live.current.onDelete(slug)
				return `Deleted "${clip(labelFor(tags, slug))}".`
			})
		},
		onRowClose: () => dispatch({ type: 'row-close' }),
		onDismissNotice: () => dispatch({ type: 'dismiss-notice' }),
	}

	return <TagManagerView state={state} canEdit={canEdit} canDelete={canDelete} actions={actions} />
}

export function TagManagerDialog({
	open,
	onOpenChange,
	canEdit,
	canDelete,
	fetchTags,
	onRename,
	onMerge,
	onDelete,
	onFilter,
}: TagManagerDialogProps) {
	const busy = useRef(false)
	const returnFocus = useReturnFocus(open)
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// A change in flight cannot be abandoned by Esc or a click outside.
				if (!next && busy.current) return
				onOpenChange(next)
			}}>
			<DialogContent
				className='flex max-h-[85vh] flex-col gap-4 sm:max-w-3xl motion-reduce:animate-none! motion-reduce:duration-0!'
				onCloseAutoFocus={returnFocus}
				onEscapeKeyDown={(event) => {
					// Esc inside a rename or merge backs out of that, not out of the dialog.
					const target = event.target as { closest?: (selector: string) => unknown } | null
					if (target?.closest?.('[data-slot="tag-row-editor"]')) event.preventDefault()
				}}>
				<DialogHeader>
					<DialogTitle>Manage tags</DialogTitle>
					<DialogDescription>
						Every tag in your library. Rename, merge or delete them everywhere at once.
					</DialogDescription>
				</DialogHeader>
				<TagManagerBody
					canEdit={canEdit}
					canDelete={canDelete}
					fetchTags={fetchTags}
					onRename={onRename}
					onMerge={onMerge}
					onDelete={onDelete}
					onFilter={onFilter}
					busy={busy}
					onClose={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	)
}
