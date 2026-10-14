'use client'

/**
 * The detail panel: one image, everything about it, editable in place.
 *
 * Layout of the file:
 *  1. Pure helpers (field saves, folder choices, paging, metadata, clipboard, URLs).
 *     The proof calls them directly; nothing here touches React or the DOM.
 *  2. Hooks: `useSavedField` (a field that saves on blur and shows saving / saved /
 *     error), `useAction` (a button with its own pending and error state).
 *  3. The parts: preview, fields, palette, metadata, actions.
 *  4. `DetailPanelBody` (everything inside the sheet; renders without Radix, so it can
 *     be server rendered) and `DetailPanel` (the sheet around it).
 *
 * The one rule behind several choices: `onPatch` and `onDelete` act on whichever image
 * the page has open, with no id. So a save is only ever sent from an event that happens
 * while that image is the open one (blur, Enter, Esc, Next), never from an unmount or an
 * effect that runs after the page has moved on.
 */
import Image from 'next/image'
import {
	useCallback,
	useEffect,
	useId,
	useReducer,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactNode,
} from 'react'
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	Download,
	ExternalLink,
	Folder,
	ImageOff,
	Loader2,
	Search,
	Sparkles,
	Trash2,
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
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { AssetPatch } from '@/lib/media/schemas'
import {
	MEDIA_LIMITS,
	type MediaAssetDTO,
	type MediaFolderDTO,
	type MediaTag,
} from '@/lib/media/types'
import { cn } from '@/lib/utils'
import type { DetailPanelProps } from './contracts'
import {
	clauseFor,
	formatBytes,
	formatCount,
	formatDimensions,
	taggingLabel,
	timeAgo,
} from './format'
import {
	TagEditor,
	escapeBelongsToList,
	isTypingTarget,
	messageOf,
	useReturnFocus,
} from './tag-editor'

/* -------------------------------------------------------------------------- */
/* Fields: what a save means                                                  */
/* -------------------------------------------------------------------------- */

export type FieldKey = 'name' | 'caption' | 'altText' | 'notes'

export type FieldSpec = {
	key: FieldKey
	/** The schema's limit, in characters (code points, as zod counts them). */
	max: number
	/** An empty value is refused (a name); the others may be cleared. */
	required: boolean
}

export const FIELD_SPECS: Record<FieldKey, FieldSpec> = {
	name: { key: 'name', max: MEDIA_LIMITS.nameMax, required: true },
	caption: { key: 'caption', max: MEDIA_LIMITS.captionMax, required: false },
	altText: { key: 'altText', max: MEDIA_LIMITS.altMax, required: false },
	notes: { key: 'notes', max: MEDIA_LIMITS.notesMax, required: false },
}

export type FieldPlan =
	| { type: 'noop' }
	| { type: 'invalid'; message: string }
	| { type: 'save'; value: string }

/** A field from the network that should be text and is not reads as empty, never as "[object Object]". */
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const length = (text: string) => Array.from(text).length

/**
 * What blur or Enter should do with a draft. The server trims, so the comparison is on
 * the trimmed value (a stray trailing space is not a change), and a value already on its
 * way is not sent twice (Enter then blur).
 */
export function planFieldSave(
	spec: FieldSpec,
	draft: string,
	ctx: { saved: string; sending: string | null },
): FieldPlan {
	// Not text: nothing the person typed, so nothing to save (never "clear it").
	if (typeof draft !== 'string') return { type: 'noop' }
	const value = draft.trim()
	const saved = typeof ctx.saved === 'string' ? ctx.saved.trim() : ''
	if (value === saved) return { type: 'noop' }
	if (ctx.sending !== null && value === ctx.sending) return { type: 'noop' }
	if (spec.required && value === '')
		return { type: 'invalid', message: 'Give the image a name.' }
	if (length(value) > spec.max)
		return {
			type: 'invalid',
			message: `Keep it to ${formatCount(spec.max)} characters or fewer.`,
		}
	return { type: 'save', value }
}

export type FieldStatus = 'idle' | 'saving' | 'saved' | 'error'

export type FieldState = {
	/** The last value known to be stored. */
	saved: string
	draft: string
	status: FieldStatus
	error: string | null
	/** Counts successful saves, so the "Saved" tick restarts on each one. */
	saves: number
}

export type FieldAction =
	| { type: 'edit'; value: string }
	| { type: 'sync'; saved: string }
	| { type: 'start' }
	| { type: 'ok'; value: string }
	| { type: 'fail'; message: string }
	| { type: 'invalid'; message: string }
	| { type: 'revert' }
	| { type: 'dismiss' }

export const initField = (saved: string): FieldState => ({
	saved,
	draft: saved,
	status: 'idle',
	error: null,
	saves: 0,
})

export function fieldReducer(state: FieldState, action: FieldAction): FieldState {
	switch (action.type) {
		case 'edit':
			// Typing again retires an old "Saved" or error; a save still in flight stays "Saving".
			return {
				...state,
				draft: action.value,
				status: state.status === 'saving' ? 'saving' : 'idle',
				error: null,
			}
		case 'sync': {
			if (action.saved === state.saved) return state
			// The stored value changed under the field (the AI wrote a caption, another tab
			// saved). An untouched field follows it; one being edited keeps the person's words.
			const dirty = state.draft !== state.saved
			return { ...state, saved: action.saved, draft: dirty ? state.draft : action.saved }
		}
		case 'start':
			return { ...state, status: 'saving', error: null }
		case 'ok':
			return {
				...state,
				saved: action.value,
				draft: state.draft.trim() === action.value ? action.value : state.draft,
				status: 'saved',
				error: null,
				saves: state.saves + 1,
			}
		case 'fail':
		case 'invalid':
			return { ...state, status: 'error', error: action.message }
		case 'revert':
			return { ...state, draft: state.saved }
		case 'dismiss':
			return state.status === 'saved' ? { ...state, status: 'idle' } : state
		default:
			return state
	}
}

/** How long "Saved" stays on screen. */
export const SAVED_TICK_MS = 2000

/* -------------------------------------------------------------------------- */
/* Folders                                                                    */
/* -------------------------------------------------------------------------- */

/** The Select's value for the library root. Folder ids are 24 hex characters, so it cannot collide. */
export const UNFILED = 'unfiled'

export type FolderChoice = {
	value: string
	label: string
	/** `Clients/Acme`, or empty for Unfiled. */
	path: string
	depth: number
}

/**
 * Unfiled, then every folder in the order given (parents first, siblings by name) with
 * its nesting depth. The list is data from the network: a repeated id keeps its first
 * entry, a blank name reads "Untitled folder", a silly depth is clamped. An image whose
 * folder is not in the list (deleted a moment ago) still shows where it is.
 */
export function folderChoices(
	folders: readonly MediaFolderDTO[] | null | undefined,
	current?: { folderId: string | null; folderPath: string },
): FolderChoice[] {
	const out: FolderChoice[] = [{ value: UNFILED, label: 'No folder', path: '', depth: 0 }]
	const seen = new Set<string>([UNFILED])
	for (const folder of Array.isArray(folders) ? folders : []) {
		if (!folder || typeof folder.id !== 'string' || !folder.id || seen.has(folder.id))
			continue
		seen.add(folder.id)
		const name =
			typeof folder.name === 'string' && folder.name.trim()
				? folder.name.trim()
				: 'Untitled folder'
		const depth = Number.isInteger(folder.depth)
			? Math.min(Math.max(folder.depth, 0), MEDIA_LIMITS.maxFolderDepth)
			: 0
		out.push({
			value: folder.id,
			label: name,
			path: typeof folder.path === 'string' && folder.path.trim() ? folder.path : name,
			depth,
		})
	}
	const id = current?.folderId
	if (typeof id === 'string' && id && !seen.has(id)) {
		const path = str(current?.folderPath).trim() || 'Unknown folder'
		out.push({ value: id, label: path, path, depth: 0 })
	}
	return out
}

export const folderValueOf = (asset: Pick<MediaAssetDTO, 'folderId'>) =>
	typeof asset.folderId === 'string' && asset.folderId ? asset.folderId : UNFILED

/** What a choice sends: the root is `null`, a folder is its id. */
export const folderPatchOf = (value: string): AssetPatch => ({
	folderId: value === UNFILED ? null : value,
})

/* -------------------------------------------------------------------------- */
/* Paging between images                                                      */
/* -------------------------------------------------------------------------- */

export type NavState = {
	/** There is a position to show (the open image is one of the loaded ones). */
	visible: boolean
	/** `3 of 40` */
	label: string
	canPrev: boolean
	canNext: boolean
}

export function navState(index: number, count: number): NavState {
	const valid =
		Number.isInteger(index) &&
		Number.isInteger(count) &&
		count > 0 &&
		index >= 0 &&
		index < count
	if (!valid) return { visible: false, label: '', canPrev: false, canNext: false }
	return {
		visible: true,
		label: `${formatCount(index + 1)} of ${formatCount(count)}`,
		canPrev: index > 0,
		canNext: index < count - 1,
	}
}

export type ArrowEvent = {
	key: string
	shiftKey?: boolean
	ctrlKey?: boolean
	altKey?: boolean
	metaKey?: boolean
	defaultPrevented?: boolean
	isComposing?: boolean
	target: unknown
}

/**
 * Left and Right page through the images, except where they belong to something else:
 * a field being typed in, a menu, an open list, a dialog stacked on top (those live in
 * portals, outside the sheet's DOM, though React still bubbles their events through it),
 * or a key already used.
 */
export function resolveArrow(
	event: ArrowEvent,
	nav: Pick<NavState, 'canPrev' | 'canNext'>,
	insideSheet: boolean,
): 'prev' | 'next' | null {
	if (event.defaultPrevented || event.isComposing) return null
	if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null
	if (!insideSheet || isTypingTarget(event.target)) return null
	if (event.key === 'ArrowLeft') return nav.canPrev ? 'prev' : null
	if (event.key === 'ArrowRight') return nav.canNext ? 'next' : null
	return null
}

/* -------------------------------------------------------------------------- */
/* Metadata                                                                   */
/* -------------------------------------------------------------------------- */

export type TaggingInfo = {
	label: string
	/** One more line of explanation, when there is one. */
	detail: string | null
	tone: 'ok' | 'busy' | 'warn' | 'muted'
	busy: boolean
}

const SKIP_REASONS: Record<string, string> = {
	not_configured: 'Auto-tagging is off.',
	declined: 'The AI declined to tag this image.',
	budget: 'The daily auto-tagging limit was reached.',
}

export function describeTagging(
	tagging: Partial<MediaAssetDTO['tagging']> | null | undefined,
): TaggingInfo {
	const status = tagging?.status
	const label = (status && taggingLabel(status)) || 'Not tagged'
	switch (status) {
		case 'pending':
		case 'running':
			return { label, detail: null, tone: 'busy', busy: true }
		case 'done':
			return { label, detail: null, tone: 'ok', busy: false }
		case 'failed':
			return {
				label,
				detail:
					typeof tagging?.error === 'string' && tagging.error.trim()
						? tagging.error.trim()
						: null,
				tone: 'warn',
				busy: false,
			}
		default:
			return {
				label,
				detail:
					(tagging?.reason && Object.hasOwn(SKIP_REASONS, tagging.reason)
						? SKIP_REASONS[tagging.reason]
						: null) ?? null,
				tone: 'muted',
				busy: false,
			}
	}
}

const capitalize = (text: string) =>
	text ? text.charAt(0).toUpperCase() + text.slice(1) : text

const positive = (n: unknown): n is number =>
	typeof n === 'number' && Number.isFinite(n) && n > 0

export const dimensionsOf = (asset: Pick<MediaAssetDTO, 'width' | 'height'>) =>
	positive(asset.width) && positive(asset.height) ? formatDimensions(asset) : '—'

/** `just now`, `3d ago`, or a date; a broken timestamp reads as a dash, never "Invalid Date". */
export function addedText(iso: unknown, now = Date.now()) {
	if (typeof iso !== 'string' || Number.isNaN(Date.parse(iso))) return '—'
	return timeAgo(iso, now)
}

export const fullDate = (iso: unknown) =>
	typeof iso === 'string' && !Number.isNaN(Date.parse(iso))
		? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
		: undefined

/* -------------------------------------------------------------------------- */
/* URLs, colours, the clipboard                                               */
/* -------------------------------------------------------------------------- */

export const isHttpUrl = (value: unknown): value is string =>
	typeof value === 'string' && /^https?:\/\//i.test(value)

/** next/image throws on an empty or malformed src, which would take the panel down with it. */
export const isUsableSrc = (value: unknown): value is string =>
	typeof value === 'string' && /^(https?:\/\/|\/(?!\/))/i.test(value)

const BLOB_HOST = /\.blob\.vercel-storage\.com$/i

/**
 * The `download` attribute is ignored for another origin, so a plain link would just
 * open the image. Vercel Blob answers `?download=1` with a download header.
 */
export function downloadHref(url: string): string {
	try {
		const parsed = new URL(url)
		if (!BLOB_HOST.test(parsed.hostname) || parsed.searchParams.has('download')) return url
		parsed.searchParams.set('download', '1')
		return parsed.toString()
	} catch {
		return url
	}
}

/** A file name safe to hand the browser: no path separators or control characters, always an extension. */
export function downloadName(
	asset: Pick<MediaAssetDTO, 'filename' | 'name' | 'format'>,
): string {
	// eslint-disable-next-line no-control-regex
	const unsafe = /[\\/:*?"<>|\u0000-\u001f]+/g
	const pick = (value: unknown) =>
		typeof value === 'string' ? value.replace(unsafe, '_').trim() : ''
	const base = pick(asset.filename) || pick(asset.name) || 'image'
	return /\.[A-Za-z0-9]{2,5}$/.test(base) ? base : `${base}.${str(asset.format) || 'jpg'}`
}

const SWATCH = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** A colour from the network goes into a style attribute: only a hex value is allowed through. */
export const safeSwatch = (value: unknown): string | undefined =>
	typeof value === 'string' && SWATCH.test(value) ? value : undefined

export type ClipboardEnv = {
	writeText?: (text: string) => Promise<void>
	/** The old `execCommand('copy')` route, for pages the async clipboard refuses (plain http). */
	execCopy?: (text: string) => boolean
}

/** Tries the async clipboard, then the fallback. Never throws. */
export async function copyText(
	text: string,
	env: ClipboardEnv,
): Promise<'copied' | 'failed'> {
	if (env.writeText) {
		try {
			await env.writeText(text)
			return 'copied'
		} catch {
			// Refused (permissions, an insecure page): try the old way.
		}
	}
	if (env.execCopy) {
		try {
			if (env.execCopy(text)) return 'copied'
		} catch {
			// Nothing else to try.
		}
	}
	return 'failed'
}

export function browserClipboard(): ClipboardEnv {
	const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
	return {
		writeText:
			clipboard && typeof clipboard.writeText === 'function'
				? (text) => clipboard.writeText(text)
				: undefined,
		execCopy:
			typeof document === 'undefined'
				? undefined
				: (text) => {
						const active = document.activeElement as HTMLElement | null
						// Inside the open dialog, so its focus trap does not take the selection back.
						const host = active?.closest?.('[role="dialog"]') ?? document.body
						const area = document.createElement('textarea')
						area.value = text
						area.setAttribute('readonly', '')
						area.style.position = 'fixed'
						area.style.opacity = '0'
						host.appendChild(area)
						area.select()
						area.setSelectionRange(0, text.length)
						let ok = false
						try {
							ok = document.execCommand('copy')
						} catch {
							ok = false
						}
						area.remove()
						active?.focus?.()
						return ok
					},
	}
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

type FlushSet = Set<() => void>

type SavedFieldOptions = {
	/** What is stored now. */
	saved: string
	plan(draft: string, ctx: { saved: string; sending: string | null }): FieldPlan
	send(value: string): Promise<void>
	/** A choice that cannot be edited in place (a Select) goes back to what is stored when it fails. */
	revertOnFail?: boolean
	/** Everything registered here is saved right now when the panel closes or pages. */
	registry?: FlushSet
}

/**
 * A field that saves when the person is done with it. One save per field is in flight
 * at a time: anything typed meanwhile is sent when the first one answers, so two
 * requests can never land out of order. Failures stay next to the field with the draft
 * kept, so blurring again retries.
 */
export function useSavedField({
	saved,
	plan,
	send,
	revertOnFail = false,
	registry,
}: SavedFieldOptions) {
	const [state, dispatch] = useReducer(fieldReducer, saved, initField)
	const live = useRef({ plan, send })
	useEffect(() => {
		live.current = { plan, send }
	})
	const draftRef = useRef(saved)
	const savedRef = useRef(saved)
	const sendingRef = useRef<string | null>(null)
	const again = useRef(false)

	useEffect(() => {
		const dirty = draftRef.current !== savedRef.current
		savedRef.current = saved
		if (!dirty) draftRef.current = saved
		dispatch({ type: 'sync', saved })
	}, [saved])

	const commit = useCallback(
		async (trigger: 'blur' | 'enter' | 'flush' | 'change'): Promise<void> => {
			if (sendingRef.current !== null) {
				// Typed (or chosen) while a save is out: send that too once this one answers.
				again.current = true
				return
			}
			const plan = live.current.plan(draftRef.current, {
				saved: savedRef.current,
				sending: sendingRef.current,
			})
			if (plan.type === 'noop') return
			if (plan.type === 'invalid') {
				dispatch({ type: 'invalid', message: plan.message })
				// Leaving a field half-valid would show something that is not stored.
				if (trigger !== 'enter') {
					draftRef.current = savedRef.current
					dispatch({ type: 'revert' })
				}
				return
			}
			sendingRef.current = plan.value
			dispatch({ type: 'start' })
			try {
				await live.current.send(plan.value)
				savedRef.current = plan.value
				if (draftRef.current.trim() === plan.value) draftRef.current = plan.value
				dispatch({ type: 'ok', value: plan.value })
			} catch (error) {
				if (revertOnFail) {
					draftRef.current = savedRef.current
					dispatch({ type: 'revert' })
				}
				dispatch({ type: 'fail', message: messageOf(error, 'Could not save. Try again.') })
			} finally {
				sendingRef.current = null
				if (again.current) {
					again.current = false
					void commit('flush')
				}
			}
		},
		[revertOnFail],
	)

	useEffect(() => {
		if (!registry) return
		const flush = () => {
			void commit('flush')
		}
		registry.add(flush)
		return () => {
			registry.delete(flush)
		}
	}, [registry, commit])

	useEffect(() => {
		if (state.status !== 'saved') return
		const timer = setTimeout(() => dispatch({ type: 'dismiss' }), SAVED_TICK_MS)
		return () => clearTimeout(timer)
	}, [state.status, state.saves])

	const setDraft = (value: string) => {
		draftRef.current = value
		dispatch({ type: 'edit', value })
	}

	return {
		draft: state.draft,
		status: state.status,
		error: state.error,
		setDraft,
		commit,
	}
}

export type ActionState = { pending: boolean; error: string | null; done: boolean }

/** A button's own pending and error state; a second press while one is running is dropped. */
export function useAction(action: () => Promise<void>) {
	const [state, setState] = useState<ActionState>({
		pending: false,
		error: null,
		done: false,
	})
	const busy = useRef(false)
	const latest = useRef(action)
	useEffect(() => {
		latest.current = action
	})
	const run = useCallback(async () => {
		if (busy.current) return false
		busy.current = true
		setState({ pending: true, error: null, done: false })
		try {
			await latest.current()
			setState({ pending: false, error: null, done: true })
			return true
		} catch (error) {
			setState({ pending: false, error: messageOf(error), done: false })
			return false
		} finally {
			busy.current = false
		}
	}, [])
	const reset = useCallback(
		() => setState({ pending: false, error: null, done: false }),
		[],
	)
	return { ...state, run, reset }
}

/* -------------------------------------------------------------------------- */
/* Parts                                                                      */
/* -------------------------------------------------------------------------- */

const labelClass = 'text-xs font-medium text-slate-300'
const fieldClass =
	'border-white/10 bg-white/3 text-white placeholder:text-slate-500 focus-visible:border-brand/60 focus-visible:ring-brand/20'
const linkButton = 'h-auto rounded p-0 text-sm font-normal text-brand underline-offset-2'
/** An inline error under a field or an action: compact, so the form does not jump. */
const errorAlert = 'border-destructive/30 bg-destructive/5 px-3 py-2 text-xs'
const sectionTitle = 'text-xs font-semibold uppercase tracking-widest text-slate-500'

const clip = (text: string, max = 80) => {
	const chars = Array.from(typeof text === 'string' ? text : '')
	return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

export function FieldStatusText({ status }: { status: FieldStatus }) {
	return (
		<span
			role='status'
			aria-live='polite'
			className='flex min-h-4 items-center gap-1 text-xs text-slate-400'>
			{status === 'saving' && (
				<>
					<Loader2 aria-hidden className='size-3 animate-spin motion-reduce:animate-none' />
					Saving…
				</>
			)}
			{status === 'saved' && (
				<>
					<Check aria-hidden className='size-3 text-brand' />
					Saved
				</>
			)}
		</span>
	)
}

function FieldShell({
	id,
	label,
	status,
	error,
	children,
	footer,
}: {
	id: string
	label: string
	status: FieldStatus
	error: string | null
	children: ReactNode
	footer?: ReactNode
}) {
	return (
		<div data-slot='detail-field' className='space-y-1.5'>
			<div className='flex items-center justify-between gap-2'>
				<Label htmlFor={id} className={labelClass}>
					{label}
				</Label>
				<FieldStatusText status={status} />
			</div>
			{children}
			{error && (
				<Alert id={`${id}-error`} variant='destructive' className={errorAlert}>
					<AlertDescription className='text-xs'>{error}</AlertDescription>
				</Alert>
			)}
			{footer}
		</div>
	)
}

function ReadOnlyBlock({
	label,
	value,
	empty,
	action,
}: {
	label: string
	value: string
	empty: string
	/** A harmless button beside the text (searching is not editing): a viewer gets it too. */
	action?: { label: string; onClick(): void }
}) {
	return (
		<div data-slot='detail-field' data-readonly='true' className='space-y-1'>
			<p className={labelClass}>{label}</p>
			<div className='flex items-start gap-2'>
				{value ? (
					<p
						dir='auto'
						className='min-w-0 flex-1 text-sm wrap-break-word whitespace-pre-wrap text-slate-200'>
						{value}
					</p>
				) : (
					<p className='min-w-0 flex-1 text-sm text-slate-500'>{empty}</p>
				)}
				{action && (
					<Button
						type='button'
						variant='ghost'
						size='icon-sm'
						aria-label={action.label}
						title={action.label}
						onClick={action.onClick}
						className='-my-1 shrink-0 text-slate-400 hover:bg-white/5 hover:text-white'>
						<Search aria-hidden />
					</Button>
				)}
			</div>
		</div>
	)
}

type TextFieldProps = {
	spec: FieldSpec
	label: string
	saved: string
	registry: FlushSet
	onPatch(patch: AssetPatch): Promise<void>
	multiline?: boolean
	rows?: number
	placeholder?: string
}

function TextField({
	spec,
	label,
	saved,
	registry,
	onPatch,
	multiline,
	rows = 3,
	placeholder,
}: TextFieldProps) {
	const id = useId()
	const field = useSavedField({
		saved,
		registry,
		plan: (draft, ctx) => planFieldSave(spec, draft, ctx),
		send: (value) => onPatch({ [spec.key]: value } as AssetPatch),
	})
	const used = length(field.draft)
	const common = {
		id,
		value: field.draft,
		maxLength: spec.max,
		'aria-invalid': field.error ? true : undefined,
		'aria-describedby': field.error ? `${id}-error` : undefined,
		onBlur: () => void field.commit('blur'),
		className: cn(fieldClass, 'w-full'),
	}
	return (
		<FieldShell
			id={id}
			label={label}
			status={field.status}
			error={field.error}
			footer={
				multiline && used >= spec.max * 0.8 ? (
					<p className='text-right text-xs tabular-nums text-slate-500'>
						{formatCount(used)} / {formatCount(spec.max)}
					</p>
				) : null
			}>
			{multiline ? (
				<Textarea
					{...common}
					rows={rows}
					placeholder={placeholder}
					onChange={(event) => field.setDraft(event.target.value)}
					// Not text-sm here: under 16px a phone zooms the page when the field is focused.
					className={cn(common.className, 'min-h-0 resize-y')}
				/>
			) : (
				<Input
					{...common}
					type='text'
					autoComplete='off'
					enterKeyHint='done'
					placeholder={placeholder}
					onChange={(event) => field.setDraft(event.target.value)}
					onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
						if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
						event.preventDefault()
						void field.commit('enter')
					}}
				/>
			)}
		</FieldShell>
	)
}

function FolderField({
	asset,
	folders,
	registry,
	onPatch,
	onFilter,
}: {
	asset: MediaAssetDTO
	folders: MediaFolderDTO[]
	registry: FlushSet
	onPatch(patch: AssetPatch): Promise<void>
	onFilter(clause: string): void
}) {
	const id = useId()
	const folderPath = str(asset.folderPath)
	const choices = folderChoices(folders, asset)
	const field = useSavedField({
		saved: folderValueOf(asset),
		registry,
		revertOnFail: true,
		plan: (draft, ctx) =>
			draft === ctx.saved || draft === ctx.sending
				? { type: 'noop' }
				: { type: 'save', value: draft },
		send: (value) => onPatch(folderPatchOf(value)),
	})
	const current = choices.find((choice) => choice.value === field.draft) ?? choices[0]
	return (
		<FieldShell id={id} label='Folder' status={field.status} error={field.error}>
			<div className='flex items-center gap-2'>
				<Select
					value={current.value}
					disabled={field.status === 'saving'}
					onValueChange={(value) => {
						field.setDraft(value)
						void field.commit('change')
					}}>
					<SelectTrigger
						id={id}
						className={cn(fieldClass, 'min-w-0 flex-1')}
						aria-describedby={field.error ? `${id}-error` : undefined}>
						<SelectValue>{current.path || current.label}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{choices.map((choice) => (
							<SelectItem
								key={choice.value}
								value={choice.value}
								textValue={choice.path || choice.label}>
								<span
									className='flex min-w-0 items-center gap-2'
									style={{ paddingLeft: `${choice.depth * 0.75}rem` }}>
									<Folder aria-hidden className='size-4 shrink-0 text-slate-400' />
									<span className='truncate'>{choice.label}</span>
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{folderPath !== '' && (
					<Button
						type='button'
						variant='ghost'
						size='icon'
						aria-label={`Show images in ${folderPath}`}
						title={`Show images in ${folderPath}`}
						onClick={() => onFilter(clauseFor('folder', folderPath))}
						className='shrink-0 text-slate-400 hover:bg-white/5 hover:text-white'>
						<Search aria-hidden />
					</Button>
				)}
			</div>
		</FieldShell>
	)
}

/** Light and dark squares, so a transparent image reads as transparent and not as a hole. */
const CHECKER_STYLE = {
	backgroundImage:
		'conic-gradient(#1c2433 25%, #2a3548 0 50%, #1c2433 0 75%, #2a3548 0)',
	backgroundSize: '20px 20px',
} as const

const BLUR_URL = /^data:image\/[a-z0-9.+-]+;base64,/i

export function Preview({ asset }: { asset: MediaAssetDTO }) {
	const [failed, setFailed] = useState(false)
	const usable = isUsableSrc(asset.url) && !failed
	const gif = asset.format === 'gif' || asset.contentType === 'image/gif'
	const alt = str(asset.altText) || str(asset.caption) || str(asset.name)
	return (
		<div
			data-slot='detail-preview'
			data-checkerboard={asset.hasAlpha ? 'true' : undefined}
			style={asset.hasAlpha ? CHECKER_STYLE : undefined}
			className={cn(
				'relative h-64 w-full overflow-hidden rounded-xl border border-white/10 sm:h-80',
				!asset.hasAlpha && 'bg-black/40',
			)}>
			{usable ? (
				<Image
					src={asset.url}
					alt={alt}
					fill
					sizes='(min-width: 768px) 640px, 100vw'
					unoptimized={gif || asset.animated}
					{...(typeof asset.blur === 'string' && BLUR_URL.test(asset.blur)
						? { placeholder: 'blur' as const, blurDataURL: asset.blur }
						: {})}
					onError={() => setFailed(true)}
					className='object-contain'
				/>
			) : (
				<span className='absolute inset-0 grid place-items-center text-slate-500'>
					<ImageOff aria-hidden className='size-8' />
					<span className='sr-only'>The image could not be shown.</span>
				</span>
			)}
		</div>
	)
}

export function Palette({
	asset,
	onFilter,
}: {
	asset: MediaAssetDTO
	onFilter(clause: string): void
}) {
	const titleId = useId()
	const colors = (Array.isArray(asset.colors) ? asset.colors : []).filter(
		(color) => color && typeof color.name === 'string' && color.name.trim(),
	)
	if (colors.length === 0) return null
	return (
		<section data-slot='detail-palette' aria-labelledby={titleId} className='space-y-2'>
			<h3 id={titleId} className={sectionTitle}>
				Colors
			</h3>
			<ul className='flex flex-wrap gap-2'>
				{colors.map((color, index) => {
					const swatch = safeSwatch(color.hex)
					const share =
						typeof color.share === 'number' && Number.isFinite(color.share)
							? Math.round(Math.min(Math.max(color.share, 0), 1) * 100)
							: null
					return (
						<li key={`${color.name}:${color.hex}:${index}`}>
							<Button
								type='button'
								variant='outline'
								size='sm'
								title={`Show images with ${color.name}`}
								onClick={() => onFilter(clauseFor('color', color.name))}
								className='h-auto min-h-8 gap-2 rounded-full border-white/10 bg-white/3 py-1 pr-3 pl-1.5 text-xs font-normal text-slate-200 shadow-none hover:bg-white/8 hover:text-slate-200 motion-reduce:transition-none dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/8'>
								<span
									aria-hidden
									className='size-4 shrink-0 rounded-full ring-1 ring-white/25'
									style={swatch ? { backgroundColor: swatch } : undefined}
								/>
								<span>{color.name}</span>
								{share !== null && (
									<>
										{' '}
										<span className='text-slate-500 tabular-nums'>{share}%</span>
									</>
								)}
								<span className='sr-only'>, search for this color</span>
							</Button>
						</li>
					)
				})}
			</ul>
		</section>
	)
}

function FilterValue({
	text,
	clause,
	onFilter,
}: {
	text: string
	clause: string | null
	onFilter(clause: string): void
}) {
	if (!clause) return <>{text}</>
	return (
		<Button
			type='button'
			variant='link'
			size='xs'
			title={`Show images where ${clause.replace(':', ' is ')}`}
			onClick={() => onFilter(clause)}
			className={linkButton}>
			{text}
		</Button>
	)
}

function Meta({
	asset,
	canRetag,
	onRetag,
	onFilter,
}: {
	asset: MediaAssetDTO
	canRetag: boolean
	onRetag(): Promise<void>
	onFilter(clause: string): void
}) {
	const titleId = useId()
	const retag = useAction(onRetag)
	const tagging = describeTagging(asset.tagging)
	const format = typeof asset.format === 'string' ? asset.format : ''
	const kind = typeof asset.kind === 'string' && asset.kind ? asset.kind : null
	const orientation =
		typeof asset.orientation === 'string' && asset.orientation ? asset.orientation : null
	const added = fullDate(asset.createdAt)
	return (
		<section data-slot='detail-meta' aria-labelledby={titleId} className='space-y-2'>
			<h3 id={titleId} className={sectionTitle}>
				Details
			</h3>
			<dl className='grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm'>
				<dt className='text-slate-400'>Dimensions</dt>
				<dd className='text-slate-200'>{dimensionsOf(asset)}</dd>
				<dt className='text-slate-400'>File size</dt>
				<dd className='text-slate-200'>{formatBytes(asset.bytes)}</dd>
				<dt className='text-slate-400'>Type</dt>
				<dd className='text-slate-200'>
					<FilterValue
						text={format.toUpperCase() || '—'}
						clause={format ? clauseFor('type', format) : null}
						onFilter={onFilter}
					/>
					{asset.animated ? ' · animated' : ''}
					{asset.hasAlpha ? ' · transparent' : ''}
				</dd>
				<dt className='text-slate-400'>Orientation</dt>
				<dd className='text-slate-200'>
					<FilterValue
						text={orientation ? capitalize(orientation) : '—'}
						clause={orientation ? clauseFor('orientation', orientation) : null}
						onFilter={onFilter}
					/>
				</dd>
				{kind && (
					<>
						<dt className='text-slate-400'>Kind</dt>
						<dd className='text-slate-200'>
							<FilterValue
								text={capitalize(kind)}
								clause={clauseFor('kind', kind)}
								onFilter={onFilter}
							/>
						</dd>
					</>
				)}
				<dt className='text-slate-400'>Added</dt>
				<dd className='text-slate-200'>
					<time dateTime={str(asset.createdAt) || undefined} title={added} suppressHydrationWarning>
						{addedText(asset.createdAt)}
					</time>
				</dd>
				<dt className='text-slate-400'>Tagging</dt>
				<dd className='min-w-0 space-y-1.5 text-slate-200'>
					<p className='flex flex-wrap items-center gap-2'>
						<Badge
							variant='outline'
							data-tone={tagging.tone}
							className={cn(
								'rounded-full font-normal',
								tagging.tone === 'ok' && 'border-brand/30 bg-brand/10 text-brand',
								tagging.tone === 'busy' && 'border-white/15 bg-white/5 text-slate-200',
								tagging.tone === 'warn' && 'border-destructive/40 bg-destructive/10 text-destructive',
								tagging.tone === 'muted' && 'border-white/10 text-slate-400',
							)}>
							{tagging.label}
						</Badge>
						{canRetag && (
							<Button
								type='button'
								variant='outline'
								size='xs'
								disabled={retag.pending || tagging.busy}
								aria-busy={retag.pending || undefined}
								onClick={() => void retag.run()}
								className='border-white/15 bg-transparent text-white hover:bg-white/5'>
								{retag.pending ? (
									<Loader2 aria-hidden className='animate-spin motion-reduce:animate-none' />
								) : (
									<Sparkles aria-hidden />
								)}
								Auto-tag again
							</Button>
						)}
					</p>
					{tagging.detail && <p className='text-xs text-slate-400'>{tagging.detail}</p>}
					{retag.done && !retag.error && (
						<Alert role='status' className='border-white/10 bg-white/3 px-3 py-2 text-xs'>
							<AlertDescription className='text-xs text-slate-400'>
								Queued. New tags will appear here shortly.
							</AlertDescription>
						</Alert>
					)}
					{retag.error && (
						<Alert variant='destructive' className={errorAlert}>
							<AlertDescription className='text-xs'>{retag.error}</AlertDescription>
						</Alert>
					)}
				</dd>
			</dl>
		</section>
	)
}

function DeleteAction({
	name,
	onDelete,
}: {
	name: string
	onDelete(): Promise<void>
}) {
	const [open, setOpen] = useState(false)
	const action = useAction(onDelete)
	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				// Esc and the overlay must not abandon a delete that is already running.
				if (!next && action.pending) return
				setOpen(next)
				if (!next) action.reset()
			}}>
			<AlertDialogTrigger asChild>
				<Button
					type='button'
					variant='outline'
					size='sm'
					className='border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive'>
					<Trash2 aria-hidden />
					Delete
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent className='motion-reduce:animate-none! motion-reduce:duration-0!'>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete this image?</AlertDialogTitle>
					<AlertDialogDescription>
						{`"${clip(name)}" will be deleted permanently. This cannot be undone, and the image will stop showing on any site that uses it.`}
					</AlertDialogDescription>
				</AlertDialogHeader>
				{action.error && (
					<Alert variant='destructive' className='border-destructive/30 bg-destructive/5 px-3 py-2'>
						<AlertDescription>{action.error}</AlertDescription>
					</Alert>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={action.pending}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={action.pending}
						onClick={(event) => {
							// Radix closes on click; stay open until the server has answered.
							event.preventDefault()
							void action.run().then((ok) => {
								if (ok) setOpen(false)
							})
						}}
						className='bg-destructive text-white hover:bg-destructive/90'>
						{action.pending && (
							<Loader2 aria-hidden className='animate-spin motion-reduce:animate-none' />
						)}
						Delete image
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function Actions({
	asset,
	canDelete,
	onDelete,
}: {
	asset: MediaAssetDTO
	canDelete: boolean
	onDelete(): Promise<void>
}) {
	const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle')
	const urlId = useId()
	const urlRef = useRef<HTMLInputElement>(null)
	const usable = isHttpUrl(asset.url)

	useEffect(() => {
		if (copy !== 'copied') return
		const timer = setTimeout(() => setCopy('idle'), SAVED_TICK_MS)
		return () => clearTimeout(timer)
	}, [copy])

	useEffect(() => {
		if (copy === 'manual') urlRef.current?.select()
	}, [copy])

	const copyUrl = async () => {
		const result = await copyText(asset.url, browserClipboard())
		setCopy(result === 'copied' ? 'copied' : 'manual')
	}

	if (!usable && !canDelete) return null
	return (
		<section data-slot='detail-actions' aria-label='Actions' className='space-y-2'>
			<div className='flex flex-wrap items-center gap-2'>
				{usable && (
					<>
						<Button
							type='button'
							variant='outline'
							size='sm'
							onClick={() => void copyUrl()}
							className='border-white/15 bg-transparent text-white hover:bg-white/5'>
							{copy === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />}
							{copy === 'copied' ? 'Copied' : 'Copy URL'}
						</Button>
						<Button
							asChild
							variant='outline'
							size='sm'
							className='border-white/15 bg-transparent text-white hover:bg-white/5'>
							<a href={asset.url} target='_blank' rel='noopener noreferrer'>
								<ExternalLink aria-hidden />
								Open original
								<span className='sr-only'> (opens in a new tab)</span>
							</a>
						</Button>
						<Button
							asChild
							variant='outline'
							size='sm'
							className='border-white/15 bg-transparent text-white hover:bg-white/5'>
							<a href={downloadHref(asset.url)} download={downloadName(asset)}>
								<Download aria-hidden />
								Download
							</a>
						</Button>
					</>
				)}
				{canDelete && (
					<DeleteAction
						name={str(asset.name) || str(asset.filename) || 'this image'}
						onDelete={onDelete}
					/>
				)}
			</div>
			<p role='status' aria-live='polite' className='sr-only'>
				{copy === 'copied' ? 'Link copied.' : ''}
			</p>
			{copy === 'manual' && (
				<div className='space-y-1'>
					<Label htmlFor={urlId} className='text-xs font-normal text-slate-400'>
						Copying was blocked. Press Ctrl+C (or Cmd+C) to copy the link.
					</Label>
					<Input
						ref={urlRef}
						id={urlId}
						readOnly
						value={asset.url}
						onFocus={(event) => event.currentTarget.select()}
						className={cn(fieldClass, 'h-8 text-xs')}
					/>
				</div>
			)}
		</section>
	)
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export function DetailNav({
	index,
	count,
	onPrev,
	onNext,
}: {
	index: number
	count: number
	onPrev(): void
	onNext(): void
}) {
	const nav = navState(index, count)
	if (!nav.visible) return null
	return (
		<nav aria-label='Browse images' className='ml-auto flex items-center gap-1'>
			<Button
				type='button'
				variant='ghost'
				size='icon-sm'
				disabled={!nav.canPrev}
				aria-label='Previous image'
				aria-keyshortcuts='ArrowLeft'
				title='Previous image (left arrow)'
				onClick={onPrev}
				className='text-slate-300 hover:bg-white/8 hover:text-white'>
				<ChevronLeft aria-hidden />
			</Button>
			<span className='min-w-16 text-center text-xs tabular-nums text-slate-400'>
				{nav.label}
			</span>
			<Button
				type='button'
				variant='ghost'
				size='icon-sm'
				disabled={!nav.canNext}
				aria-label='Next image'
				aria-keyshortcuts='ArrowRight'
				title='Next image (right arrow)'
				onClick={onNext}
				className='text-slate-300 hover:bg-white/8 hover:text-white'>
				<ChevronRight aria-hidden />
			</Button>
		</nav>
	)
}

/* -------------------------------------------------------------------------- */
/* Body and sheet                                                             */
/* -------------------------------------------------------------------------- */

export type DetailPanelBodyProps = Pick<
	DetailPanelProps,
	| 'canWrite'
	| 'canDelete'
	| 'aiConfigured'
	| 'folders'
	| 'onPatch'
	| 'onDelete'
	| 'onRetag'
	| 'onFilter'
	| 'fetchTagSuggestions'
> & {
	asset: MediaAssetDTO
	/** Saves everything pending when the panel closes or pages (Esc and Next do not blur a field). */
	registry: FlushSet
}

const NO_TAGS: MediaTag[] = []

/**
 * Everything inside the sheet. Mounted per image (the sheet keys it by id), so each
 * field, each pending state and each error starts fresh on every image. Radix renders
 * the sheet through a portal, which a server render leaves out; this renders without
 * one, so the proof can read it.
 */
export function DetailPanelBody({
	asset,
	canWrite,
	canDelete,
	aiConfigured,
	folders,
	registry,
	onPatch: patchOpen,
	onDelete: deleteOpen,
	onRetag: retagOpen,
	onFilter,
	fetchTagSuggestions,
}: DetailPanelBodyProps) {
	const tagsTitleId = useId()
	const folderPath = str(asset.folderPath)
	const tags = Array.isArray(asset.tags) ? asset.tags : NO_TAGS
	const labelOf = (slug: string) => tags.find((tag) => tag.slug === slug)?.label ?? slug

	// The page's callbacks act on whichever image it has open and take no id. A change sent
	// as the person pages on could therefore land on the neighbour. The id goes along as a
	// trailing argument: a page that accepts it can refuse a call about an image that is no
	// longer open, and one that does not simply ignores it.
	const onPatch = (change: AssetPatch) =>
		(patchOpen as unknown as (change: AssetPatch, id: string) => Promise<void>)(change, asset.id)
	const onDelete = () => (deleteOpen as unknown as (id: string) => Promise<void>)(asset.id)
	const onRetag = () => (retagOpen as unknown as (id: string) => Promise<void>)(asset.id)

	return (
		<div data-slot='detail-panel' className='space-y-6 p-4 sm:p-5'>
			<Preview asset={asset} />

			<div className='space-y-4'>
				{canWrite ? (
					<>
						<TextField
							spec={FIELD_SPECS.name}
							label='Name'
							saved={str(asset.name)}
							registry={registry}
							onPatch={onPatch}
						/>
						<FolderField
							asset={asset}
							folders={folders}
							registry={registry}
							onPatch={onPatch}
							onFilter={onFilter}
						/>
						<TextField
							spec={FIELD_SPECS.caption}
							label='Caption'
							saved={str(asset.caption)}
							registry={registry}
							onPatch={onPatch}
							multiline
							rows={3}
							placeholder='A sentence about what the image shows'
						/>
						<TextField
							spec={FIELD_SPECS.altText}
							label='Alt text'
							saved={str(asset.altText)}
							registry={registry}
							onPatch={onPatch}
							multiline
							rows={2}
							placeholder='What a screen reader should say about it'
						/>
						<TextField
							spec={FIELD_SPECS.notes}
							label='Notes'
							saved={str(asset.notes)}
							registry={registry}
							onPatch={onPatch}
							multiline
							rows={3}
							placeholder='Private notes, searchable'
						/>
					</>
				) : (
					<>
						<ReadOnlyBlock label='Name' value={str(asset.name)} empty='Untitled' />
						<ReadOnlyBlock
							label='Folder'
							value={folderPath || 'No folder'}
							empty='No folder'
							action={
								folderPath
									? {
											label: `Show images in ${folderPath}`,
											onClick: () => onFilter(clauseFor('folder', folderPath)),
										}
									: undefined
							}
						/>
						<ReadOnlyBlock label='Caption' value={str(asset.caption)} empty='No caption' />
						<ReadOnlyBlock label='Alt text' value={str(asset.altText)} empty='No alt text' />
						<ReadOnlyBlock label='Notes' value={str(asset.notes)} empty='No notes' />
					</>
				)}
			</div>

			<section aria-labelledby={tagsTitleId} className='space-y-2'>
				<h3 id={tagsTitleId} className={sectionTitle}>
					Tags
				</h3>
				<TagEditor
					tags={tags}
					canEdit={canWrite}
					fetchSuggestions={fetchTagSuggestions}
					onAdd={(labels) => onPatch({ addTags: labels })}
					onRemove={(slug) => onPatch({ removeTags: [slug] })}
					// Adding the label of an automatic tag keeps it: it becomes the person's own.
					onPromote={(slug) => onPatch({ addTags: [labelOf(slug)] })}
					onTagClick={(slug) => onFilter(clauseFor('tag', slug))}
				/>
			</section>

			<Palette asset={asset} onFilter={onFilter} />
			<Meta
				asset={asset}
				canRetag={aiConfigured && canWrite}
				onRetag={onRetag}
				onFilter={onFilter}
			/>
			<Actions asset={asset} canDelete={canDelete} onDelete={onDelete} />
		</div>
	)
}

export function DetailPanel({
	asset,
	index,
	count,
	canWrite,
	canDelete,
	aiConfigured,
	folders,
	onClose,
	onPrev,
	onNext,
	onPatch,
	onDelete,
	onRetag,
	onFilter,
	fetchTagSuggestions,
}: DetailPanelProps) {
	const open = asset !== null
	const [registry] = useState<FlushSet>(() => new Set())
	const returnFocus = useReturnFocus(open)
	const contentRef = useRef<HTMLDivElement>(null)
	const nav = navState(index, count)

	if (!asset) return null

	const flush = () => {
		for (const save of [...registry]) save()
	}
	const close = () => {
		flush()
		onClose()
	}
	const page = (go: () => void) => () => {
		flush()
		go()
	}
	const name = str(asset.name) || str(asset.filename) || 'Untitled image'

	return (
		<Sheet
			open
			onOpenChange={(next) => {
				if (!next) close()
			}}>
			<SheetContent
				ref={contentRef}
				side='right'
				onOpenAutoFocus={(event) => {
					// Not the first field: that would raise a keyboard on a phone and stop the arrow keys.
					event.preventDefault()
					contentRef.current?.focus()
				}}
				onCloseAutoFocus={returnFocus}
				onEscapeKeyDown={(event) => {
					if (escapeBelongsToList(event.target)) event.preventDefault()
				}}
				onKeyDown={(event) => {
					const direction = resolveArrow(
						{
							key: event.key,
							shiftKey: event.shiftKey,
							ctrlKey: event.ctrlKey,
							altKey: event.altKey,
							metaKey: event.metaKey,
							defaultPrevented: event.defaultPrevented,
							isComposing: event.nativeEvent.isComposing,
							target: event.target,
						},
						nav,
						event.currentTarget.contains(event.target as Node),
					)
					if (!direction) return
					event.preventDefault()
					event.stopPropagation()
					page(direction === 'prev' ? onPrev : onNext)()
				}}
				className='w-full gap-0 border-white/10 bg-background p-0 outline-none sm:max-w-xl lg:max-w-2xl motion-reduce:animate-none! motion-reduce:duration-0! motion-reduce:transition-none'>
				<div className='flex items-center gap-2 border-b border-white/10 py-3 pr-14 pl-4'>
					<SheetTitle className='text-sm font-semibold text-white'>Image details</SheetTitle>
					<SheetDescription className='sr-only'>
						{`${clip(name)}${nav.visible ? `, image ${nav.label}` : ''}. Use the left and right arrow keys to browse.`}
					</SheetDescription>
					<DetailNav
						index={index}
						count={count}
						onPrev={page(onPrev)}
						onNext={page(onNext)}
					/>
					{/* Paging moves no focus, so a screen reader is told which image it is on now. */}
					<p role='status' aria-live='polite' className='sr-only'>
						{nav.visible ? `Image ${nav.label}: ${clip(name)}` : clip(name)}
					</p>
				</div>
				<div className='min-h-0 flex-1 overflow-y-auto overscroll-contain'>
					<DetailPanelBody
						key={asset.id}
						asset={asset}
						canWrite={canWrite}
						canDelete={canDelete}
						aiConfigured={aiConfigured}
						folders={folders}
						registry={registry}
						onPatch={onPatch}
						onDelete={onDelete}
						onRetag={onRetag}
						onFilter={onFilter}
						fetchTagSuggestions={fetchTagSuggestions}
					/>
				</div>
			</SheetContent>
		</Sheet>
	)
}
