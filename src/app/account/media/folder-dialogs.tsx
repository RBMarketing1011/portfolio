'use client'

/**
 * The folder tree's shared model and its small dialog pieces.
 *
 * Three parts live here so `folder-tree.tsx` stays readable and `move-dialog.tsx`
 * can reuse the model without importing the tree (which imports it):
 *  1. the pure model: build the tree from the flat DTO list, ancestors, the
 *     persisted expansion set, the drag payload check, name validation, and the
 *     keyboard map. Nothing in this part touches React or the DOM, so the proof
 *     tests it directly.
 *  2. `FolderNameForm`: the inline input used by "new folder" and "rename".
 *  3. `DeleteFolderDialog`: the confirmation that says nothing is lost.
 */
import {
	useEffect,
	useId,
	useRef,
	useState,
	type FormEvent,
	type KeyboardEvent,
} from 'react'
import { Folder, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { MEDIA_LIMITS, type MediaFolderDTO } from '@/lib/media/types'
import { pluralize } from './format'

/* -------------------------------------------------------------------------- */
/* Model                                                                      */
/* -------------------------------------------------------------------------- */

export type FolderNode = {
	id: string
	folder: MediaFolderDTO
	/** Always a non-empty string: a blank name from the server reads "Untitled folder". */
	name: string
	/** Where the node actually sits in the tree we built, not what `folder.depth` claims. */
	depth: number
	parent: FolderNode | null
	children: FolderNode[]
	/** Levels beneath this node: 0 for a leaf. */
	height: number
}

export type FolderTreeModel = {
	roots: FolderNode[]
	byId: Map<string, FolderNode>
	/** Every node, parents before children (depth first). */
	ordered: FolderNode[]
}

const displayName = (name: unknown) =>
	typeof name === 'string' && name.trim() ? name : 'Untitled folder'

/**
 * Builds the tree from the flat list the API returns (parents first, siblings by
 * name). The list is only trusted for order among siblings: parentage comes from
 * `parentId`, and a malformed list can neither lose a folder nor loop:
 *  - a repeated id keeps its first entry;
 *  - a parent that is missing (or the folder itself) makes it a top-level folder;
 *  - folders caught in a parent cycle are promoted to the top, so none vanishes.
 * Iterative, so a long chain cannot overflow the stack.
 */
export function buildFolderTree(
	input: readonly MediaFolderDTO[] | null | undefined,
): FolderTreeModel {
	const list = Array.isArray(input) ? input : []
	const byId = new Map<string, FolderNode>()
	for (const folder of list) {
		if (!folder || typeof folder.id !== 'string' || !folder.id) continue
		if (byId.has(folder.id)) continue
		byId.set(folder.id, {
			id: folder.id,
			folder,
			name: displayName(folder.name),
			depth: 0,
			parent: null,
			children: [],
			height: 0,
		})
	}

	// Candidate children per claimed parent, in input order.
	const claimed = new Map<string | null, FolderNode[]>()
	for (const node of byId.values()) {
		const wanted = node.folder.parentId
		const parentId =
			typeof wanted === 'string' && wanted !== node.id && byId.has(wanted)
				? wanted
				: null
		const bucket = claimed.get(parentId)
		if (bucket) bucket.push(node)
		else claimed.set(parentId, [node])
	}

	const ordered: FolderNode[] = []
	const roots: FolderNode[] = []
	const seen = new Set<string>()

	const walk = (start: FolderNode, parent: FolderNode | null) => {
		const stack: { node: FolderNode; parent: FolderNode | null }[] = [
			{ node: start, parent },
		]
		while (stack.length) {
			const { node, parent: from } = stack.pop()!
			if (seen.has(node.id)) continue
			seen.add(node.id)
			node.parent = from
			node.depth = from ? from.depth + 1 : 0
			if (from) from.children.push(node)
			else roots.push(node)
			ordered.push(node)
			const kids = claimed.get(node.id)
			if (kids)
				for (let i = kids.length - 1; i >= 0; i--)
					stack.push({ node: kids[i], parent: node })
		}
	}

	for (const node of claimed.get(null) ?? []) walk(node, null)
	// Whatever is still unseen sits in a cycle (A under B under A). Break it at the
	// first one met, in input order, so every folder stays reachable.
	for (const node of byId.values()) if (!seen.has(node.id)) walk(node, null)

	for (let i = ordered.length - 1; i >= 0; i--) {
		const node = ordered[i]
		if (node.parent)
			node.parent.height = Math.max(node.parent.height, node.height + 1)
	}

	return { roots, byId, ordered }
}

/** Ids from the top-level folder down to the parent. Empty for a top-level or unknown id. */
export function ancestorsOf(
	model: FolderTreeModel,
	id: string | null | undefined,
): string[] {
	const node = id ? model.byId.get(id) : undefined
	const chain: string[] = []
	for (let cursor = node?.parent ?? null; cursor; cursor = cursor.parent)
		chain.push(cursor.id)
	return chain.reverse()
}

/** Every folder beneath `id`, depth first. The folder itself is not included. */
export function descendantsOf(
	model: FolderTreeModel,
	id: string | null | undefined,
): string[] {
	const node = id ? model.byId.get(id) : undefined
	if (!node) return []
	const out: string[] = []
	const stack = [...node.children].reverse()
	while (stack.length) {
		const next = stack.pop()!
		out.push(next.id)
		for (let i = next.children.length - 1; i >= 0; i--)
			stack.push(next.children[i])
	}
	return out
}

/** The nodes a person can see: a node shows when every ancestor is expanded. */
export function visibleNodes(
	model: FolderTreeModel,
	expanded: ReadonlySet<string>,
): FolderNode[] {
	const shown = new Set<string>()
	const out: FolderNode[] = []
	for (const node of model.ordered) {
		const parent = node.parent
		if (parent && !(shown.has(parent.id) && expanded.has(parent.id))) continue
		shown.add(node.id)
		out.push(node)
	}
	return out
}

/**
 * A folder can hold children only while the deepest level stays within the
 * server's limit (the same arithmetic as `folders.ts`: depth + height <= max - 1).
 */
export const MAX_FOLDER_INDEX = MEDIA_LIMITS.maxFolderDepth - 1

export const canHoldSubfolder = (node: FolderNode) =>
	node.depth + 1 <= MAX_FOLDER_INDEX

/**
 * Folders that cannot receive `node`: itself, its descendants (a cycle) and any
 * folder so deep that the moved subtree would pass the depth limit.
 */
export function moveBlockedIds(
	model: FolderTreeModel,
	node: FolderNode,
): Set<string> {
	const blocked = new Set<string>([node.id, ...descendantsOf(model, node.id)])
	for (const other of model.ordered)
		if (other.depth + 1 + node.height > MAX_FOLDER_INDEX) blocked.add(other.id)
	return blocked
}

/* -------------------------------------------------------------------------- */
/* Drag payload                                                               */
/* -------------------------------------------------------------------------- */

const HEX_ID = /^[a-f0-9]{24}$/i

/** The server's bulk cap. More than this is refused, never truncated. */
export const MAX_DRAG_IDS = MEDIA_LIMITS.bulkIdsCap

/** 500 ids is about 14 KB of JSON. Anything past this is not ours; do not even parse it. */
const MAX_DRAG_CHARS = 64 * 1024

export type DragIdsResult =
	| { ok: true; ids: string[] }
	| { ok: false; reason: 'invalid' | 'empty' | 'too-many' }

/**
 * Validates what a drop carries under `DRAG_MIME`. The payload crosses a trust
 * boundary (any page, extension or app can put anything under any MIME type), so
 * it must be a JSON array of 24-hex ids: one stray entry rejects the lot rather
 * than being skipped, because a partly understood drag is not ours. Ids are
 * lower-cased (the server reads them case-insensitively) and de-duplicated, and
 * more than `MAX_DRAG_IDS` is refused, never silently cut to a different set.
 */
export function parseDragIds(raw: unknown): DragIdsResult {
	if (typeof raw !== 'string') return { ok: false, reason: 'invalid' }
	if (raw.length > MAX_DRAG_CHARS) return { ok: false, reason: 'too-many' }
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		return { ok: false, reason: 'invalid' }
	}
	if (!Array.isArray(value)) return { ok: false, reason: 'invalid' }
	if (value.length === 0) return { ok: false, reason: 'empty' }
	if (value.length > MAX_DRAG_IDS) return { ok: false, reason: 'too-many' }
	const ids = new Set<string>()
	for (const entry of value) {
		if (typeof entry !== 'string' || !HEX_ID.test(entry))
			return { ok: false, reason: 'invalid' }
		ids.add(entry.toLowerCase())
	}
	return { ok: true, ids: [...ids] }
}

type TypesLike = ArrayLike<string> | null | undefined

/**
 * Whether a drag carries our ids. `types` is all a browser reveals during
 * dragover (the data itself is withheld until drop), and it is a frozen array in
 * current browsers but a DOMStringList in old ones, hence ArrayLike.
 */
export function carriesMediaIds(types: TypesLike, mime: string): boolean {
	if (!types) return false
	for (let i = 0; i < types.length; i++) if (types[i] === mime) return true
	return false
}

/* -------------------------------------------------------------------------- */
/* Persisted expansion                                                        */
/* -------------------------------------------------------------------------- */

export const FOLDERS_STORAGE_KEY = 'rb.media.folders'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** A hostile or stale value yields what is usable and nothing else: ids only, unique, capped. */
export function parseStoredExpanded(raw: unknown): string[] {
	if (typeof raw !== 'string' || raw.length > 256 * 1024) return []
	let value: unknown
	try {
		value = JSON.parse(raw)
	} catch {
		return []
	}
	if (!Array.isArray(value)) return []
	const ids = new Set<string>()
	for (const entry of value) {
		if (ids.size >= MEDIA_LIMITS.maxFolders) break
		if (typeof entry === 'string' && HEX_ID.test(entry))
			ids.add(entry.toLowerCase())
	}
	return [...ids]
}

const defaultStorage = (): StorageLike | null => {
	try {
		return typeof window === 'undefined' ? null : window.localStorage
	} catch {
		return null
	}
}

/** Storage can be missing, blocked or throw (private windows): the tree works without it. */
export function readStoredExpanded(storage?: StorageLike | null): string[] {
	try {
		const store = storage === undefined ? defaultStorage() : storage
		return store ? parseStoredExpanded(store.getItem(FOLDERS_STORAGE_KEY)) : []
	} catch {
		return []
	}
}

export function writeStoredExpanded(
	ids: Iterable<string>,
	storage?: StorageLike | null,
): void {
	try {
		const store = storage === undefined ? defaultStorage() : storage
		if (!store) return
		const list = [...new Set(ids)].slice(0, MEDIA_LIMITS.maxFolders)
		store.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(list))
	} catch {
		// Quota or blocked storage: expansion just is not remembered.
	}
}

/* -------------------------------------------------------------------------- */
/* Names and errors                                                           */
/* -------------------------------------------------------------------------- */

export type NameCheck = { ok: true; name: string } | { ok: false; message: string }

/**
 * The same rules `folders.ts` enforces, so a bad name is explained at once instead
 * of after a round trip. The server stays the authority (it also rejects duplicates).
 */
export function validateFolderName(raw: unknown): NameCheck {
	if (typeof raw !== 'string') return { ok: false, message: 'Give the folder a name.' }
	const name = raw.trim()
	if (!name) return { ok: false, message: 'Give the folder a name.' }
	if (name.length > MEDIA_LIMITS.folderNameMax)
		return {
			ok: false,
			message: `Folder names can be at most ${MEDIA_LIMITS.folderNameMax} characters.`,
		}
	// eslint-disable-next-line no-control-regex
	if (/[/\\\u0000-\u001f\u007f]/.test(name))
		return { ok: false, message: 'A folder name cannot contain slashes.' }
	if (/^[\p{Z}\p{C}]+$/u.test(name))
		return { ok: false, message: 'Give the folder a name.' }
	return { ok: true, name }
}

/** What to show for a rejected promise. Callbacks reject with a sentence fit for a person. */
export function messageOf(error: unknown, fallback = 'Something went wrong. Try again.') {
	const text = error instanceof Error ? error.message.trim() : ''
	return text ? text.slice(0, 300) : fallback
}

export type Attempt = { ok: true } | { ok: false; message: string }

/**
 * Runs a callback from the contract and turns every way it can fail (a rejected
 * promise, a synchronous throw, a non-Error rejection) into a message. Nothing
 * escapes, so no caller can leave an unhandled rejection behind.
 */
export async function attempt(
	action: () => unknown,
	fallback?: string,
): Promise<Attempt> {
	try {
		await action()
		return { ok: true }
	} catch (error) {
		return { ok: false, message: messageOf(error, fallback) }
	}
}

export type SubmitOutcome =
	| { type: 'busy' }
	| { type: 'invalid'; message: string }
	| { type: 'unchanged' }
	| { type: 'saved' }
	| { type: 'failed'; message: string }

/**
 * One submit of the inline name field. `busy` is the form's in-flight flag: a
 * second submit while the first is unanswered (Enter held down, a double tap) is
 * dropped instead of creating the folder twice. The value is trimmed and checked
 * before anything is sent, and a rename to the same name sends nothing.
 */
export async function submitFolderName(
	input: { value: string; initial?: string; busy: { current: boolean } },
	send: (name: string) => Promise<void>,
): Promise<SubmitOutcome> {
	if (input.busy.current) return { type: 'busy' }
	const check = validateFolderName(input.value)
	if (!check.ok) return { type: 'invalid', message: check.message }
	if (input.initial && check.name === input.initial.trim()) return { type: 'unchanged' }
	input.busy.current = true
	try {
		const result = await attempt(() => send(check.name))
		return result.ok ? { type: 'saved' } : { type: 'failed', message: result.message }
	} finally {
		input.busy.current = false
	}
}

export type DropPlan =
	| { type: 'move'; ids: string[] }
	/** Nothing to do and nothing to say. */
	| { type: 'ignore' }
	/** Not done; tell the person why. */
	| { type: 'refuse'; message: string }

/** What a drop should do, from the raw `DRAG_MIME` string. */
export function planDrop(raw: unknown): DropPlan {
	const result = parseDragIds(raw)
	if (result.ok) return { type: 'move', ids: result.ids }
	if (result.reason === 'empty') return { type: 'ignore' }
	if (result.reason === 'too-many')
		return {
			type: 'refuse',
			message: `You can move up to ${MAX_DRAG_IDS} images at a time. Select fewer and try again.`,
		}
	return { type: 'refuse', message: 'Those images could not be moved.' }
}

/* -------------------------------------------------------------------------- */
/* What the tree offers                                                       */
/* -------------------------------------------------------------------------- */

export type FolderAction = 'subfolder' | 'rename' | 'move' | 'delete'

/**
 * The per-folder menu, from permission alone. Empty means no menu button at all:
 * a viewer is never shown a control that would be refused. A folder at the depth
 * limit cannot hold another level.
 */
export function menuActionsFor(
	node: Pick<FolderNode, 'depth'>,
	can: { write: boolean; delete: boolean },
): FolderAction[] {
	const actions: FolderAction[] = []
	if (can.write) {
		if (node.depth + 1 <= MAX_FOLDER_INDEX) actions.push('subfolder')
		actions.push('rename', 'move')
	}
	if (can.delete) actions.push('delete')
	return actions
}

/** Which row holds the single tab stop: the focused one, else the selected one, else the first. */
export function tabStopKey(
	keys: readonly string[],
	focusKey: string | null,
	activeKey: string | null,
): string {
	if (focusKey !== null && keys.includes(focusKey)) return focusKey
	if (activeKey !== null && keys.includes(activeKey)) return activeKey
	return keys[0]
}

/** The row `active` selects, or null when it names a folder that is not there. */
export function activeKeyOf(
	active: string | undefined,
	model: FolderTreeModel,
): string | null {
	if (active === undefined) return 'all'
	// There is no Unfiled row: an image with no folder is simply in All media.
	if (active === 'unfiled') return 'all'
	return model.byId.has(active) ? `f:${active}` : null
}

/* -------------------------------------------------------------------------- */
/* Keyboard map                                                               */
/* -------------------------------------------------------------------------- */

export type NavItem = {
	key: string
	kind: 'all' | 'unfiled' | 'review' | 'folder'
	parentKey: string | null
	/** Has children (so it can expand or collapse). */
	expandable: boolean
	expanded: boolean
}

export type NavAction =
	| { type: 'focus'; key: string }
	| { type: 'expand'; key: string }
	| { type: 'collapse'; key: string }
	| { type: 'activate'; key: string }
	| { type: 'rename'; key: string }
	| { type: 'delete'; key: string }
	| { type: 'menu'; key: string }

/**
 * What a key does on the focused tree item (the WAI-ARIA tree pattern, plus the
 * folder shortcuts). Pure, so the map is testable without a DOM. `null` means the
 * key is not ours and the browser keeps it (Tab, typing, scrolling).
 */
export function resolveTreeKey(
	items: readonly NavItem[],
	currentKey: string,
	event: {
		key: string
		shiftKey?: boolean
		altKey?: boolean
		ctrlKey?: boolean
		metaKey?: boolean
	},
	can: { write: boolean; delete: boolean },
): NavAction | null {
	const index = items.findIndex((item) => item.key === currentKey)
	if (index < 0) return null
	const item = items[index]
	if (event.altKey || event.ctrlKey || event.metaKey) return null
	const isFolder = item.kind === 'folder'
	const hasMenu = isFolder && (can.write || can.delete)

	switch (event.key) {
		case 'ArrowDown':
			return index + 1 < items.length ? { type: 'focus', key: items[index + 1].key } : null
		case 'ArrowUp':
			return index > 0 ? { type: 'focus', key: items[index - 1].key } : null
		case 'Home':
			return { type: 'focus', key: items[0].key }
		case 'End':
			return { type: 'focus', key: items[items.length - 1].key }
		case 'ArrowRight':
			if (!item.expandable) return null
			if (!item.expanded) return { type: 'expand', key: item.key }
			// The first child is the next row, because the list is depth first.
			return items[index + 1]?.parentKey === item.key
				? { type: 'focus', key: items[index + 1].key }
				: null
		case 'ArrowLeft':
			if (item.expandable && item.expanded) return { type: 'collapse', key: item.key }
			return item.parentKey ? { type: 'focus', key: item.parentKey } : null
		case 'Enter':
		case ' ':
			return { type: 'activate', key: item.key }
		case 'F2':
			return isFolder && can.write ? { type: 'rename', key: item.key } : null
		case 'Delete':
			return isFolder && can.delete ? { type: 'delete', key: item.key } : null
		case 'ContextMenu':
			return hasMenu ? { type: 'menu', key: item.key } : null
		case 'F10':
			return event.shiftKey && hasMenu ? { type: 'menu', key: item.key } : null
		default:
			return null
	}
}

/* -------------------------------------------------------------------------- */
/* Inline name input                                                          */
/* -------------------------------------------------------------------------- */

export type FolderNameFormProps = {
	/** The accessible name, e.g. `Name for the new folder`. */
	label: string
	/** Rename starts with the current name; create with nothing. */
	initial?: string
	/** Rejects with a sentence for a person on failure. */
	onSubmit(name: string): Promise<void>
	/** Esc (`viaKeyboard`), or a blur with nothing worth keeping. */
	onCancel(viaKeyboard: boolean): void
	/** The server accepted the name. */
	onDone(): void
}

/**
 * One text field: Enter saves, Esc cancels, the value is trimmed, repeat submits
 * are ignored while one is in flight, and a rejection stays on screen beside the
 * field. It never rethrows, so nothing escapes as an unhandled rejection.
 */
export function FolderNameForm({
	label,
	initial = '',
	onSubmit,
	onCancel,
	onDone,
}: FolderNameFormProps) {
	const [value, setValue] = useState(initial)
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	const busy = useRef(false)
	const closed = useRef(false)
	const errorId = useId()

	// A disabled input loses focus; after a failure hand it back so the person can fix the name.
	useEffect(() => {
		if (error) inputRef.current?.focus()
	}, [error])

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		event.stopPropagation()
		if (closed.current) return
		const outcome = await submitFolderName({ value, initial, busy }, (name) => {
			// Only a name that passed the checks reaches here, so only then does the field lock.
			setPending(true)
			setError(null)
			return onSubmit(name)
		})
		if (outcome.type === 'busy') return
		setPending(false)
		if (outcome.type === 'invalid' || outcome.type === 'failed') {
			setError(outcome.message)
		} else if (outcome.type === 'unchanged') {
			closed.current = true
			onCancel(true)
		} else {
			closed.current = true
			onDone()
		}
	}

	const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		// The tree and the page have their own keys; typing in a field is not one of them.
		event.stopPropagation()
		if (event.key !== 'Escape') return
		event.preventDefault()
		if (busy.current || closed.current) return
		closed.current = true
		onCancel(true)
	}

	const blur = () => {
		if (busy.current || closed.current) return
		// Leaving an untouched field abandons it; leaving typed text keeps it open so a
		// stray tap does not throw the work away. Esc always cancels.
		if (value.trim() === '' || value.trim() === initial.trim()) {
			closed.current = true
			onCancel(false)
		}
	}

	return (
		<form onSubmit={submit} noValidate className='min-w-0 flex-1'>
			<Input
				ref={inputRef}
				value={value}
				onChange={(event) => {
					setValue(event.target.value)
					if (error) setError(null)
				}}
				onKeyDown={keyDown}
				onBlur={blur}
				onFocus={(event) => event.currentTarget.select()}
				aria-label={label}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? errorId : undefined}
				aria-busy={pending || undefined}
				disabled={pending}
				maxLength={MEDIA_LIMITS.folderNameMax}
				autoComplete='off'
				autoCorrect='off'
				spellCheck={false}
				enterKeyHint='done'
				autoFocus
				className='h-8 border-white/15 bg-ink/60 px-2 text-white'
			/>
			{error && (
				<p id={errorId} role='alert' className='mt-1 text-xs text-destructive'>
					{error}
				</p>
			)}
		</form>
	)
}

/** The decorative folder glyph the create row shows where a chevron would be. */
export const NewFolderIcon = () => (
	<Folder aria-hidden className='size-4 shrink-0 text-slate-400' />
)

/* -------------------------------------------------------------------------- */
/* Delete confirmation                                                        */
/* -------------------------------------------------------------------------- */

export type DeleteFolderInfo = {
	id: string
	name: string
	/** Images directly in it. */
	images: number
	/** Direct subfolders. */
	subfolders: number
	/** Where they land: the parent's name, or null for the library root. */
	destination: string | null
}

const clip = (text: string, max = 60) =>
	text.length > max ? `${text.slice(0, max - 1)}…` : text

export function deleteExplanation(info: DeleteFolderInfo) {
	const where = info.destination ? `"${clip(info.destination)}"` : 'All media'
	const parts: string[] = []
	if (info.images > 0) parts.push(pluralize(info.images, 'image'))
	if (info.subfolders > 0) parts.push(pluralize(info.subfolders, 'subfolder'))
	if (parts.length === 0)
		return 'This folder is empty, so only the folder itself is removed.'
	return `No images are deleted. Its ${parts.join(' and ')} move up to ${where}. Only the folder itself is removed.`
}

export type DeleteFolderDialogProps = {
	info: DeleteFolderInfo
	/** Rejects with a sentence for a person on failure. */
	onConfirm(): Promise<void>
	onClose(): void
	/** Focus goes back to the tree, to the row the person came from. */
	restoreFocus(): void
}

/** Mounted only while open, so its pending and error state reset on every open. */
export function DeleteFolderDialog({
	info,
	onConfirm,
	onClose,
	restoreFocus,
}: DeleteFolderDialogProps) {
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const busy = useRef(false)

	const confirm = async () => {
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
		<AlertDialog
			open
			onOpenChange={(open) => {
				// Esc and the overlay must not abandon a delete that is already in flight.
				if (!open && !busy.current) onClose()
			}}>
			<AlertDialogContent
				onCloseAutoFocus={(event) => {
					event.preventDefault()
					restoreFocus()
				}}>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete the folder &ldquo;{clip(info.name)}&rdquo;?</AlertDialogTitle>
					<AlertDialogDescription>{deleteExplanation(info)}</AlertDialogDescription>
				</AlertDialogHeader>
				{error && (
					<p role='alert' className='text-sm text-destructive'>
						{error}
					</p>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						disabled={pending}
						onClick={(event) => {
							// Radix closes on click; stay open until the server has answered.
							event.preventDefault()
							void confirm()
						}}
						className='bg-destructive text-white hover:bg-destructive/90'>
						{pending && <Loader2 className='animate-spin' />} Delete folder
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
