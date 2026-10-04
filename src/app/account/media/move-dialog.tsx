'use client'

import {
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type FormEvent,
	type MutableRefObject,
} from 'react'
import { Check, Folder, Library, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import type { MoveDialogProps } from './contracts'
import { attempt, buildFolderTree, type FolderTreeModel } from './folder-dialogs'

/** What the radio group holds: a folder id, `null` for the library root, `undefined` for nothing chosen. */
type Choice = string | null | undefined

const isKnown = (model: FolderTreeModel, id: Choice): id is string | null =>
	id === null || (typeof id === 'string' && model.byId.has(id))

/** `currentId` undefined means "unknown or mixed", and an id that is not in the list cannot be shown: nothing starts chosen. */
export function initialChoice(model: FolderTreeModel, currentId: string | null | undefined): Choice {
	return isKnown(model, currentId) ? currentId : undefined
}

/**
 * Move is offered only for a real, allowed, different destination. Choosing where
 * the thing already is would be a no-op, a disabled folder is never allowed, and
 * an id the list does not contain (deleted meanwhile) is not a destination.
 */
export function canConfirmMove(input: {
	model: FolderTreeModel
	selected: Choice
	currentId?: string | null
	disabledIds?: ReadonlySet<string>
}): boolean {
	const { model, selected, currentId, disabledIds } = input
	if (selected === undefined || !isKnown(model, selected)) return false
	if (selected !== null && disabledIds?.has(selected)) return false
	return !(currentId !== undefined && selected === currentId)
}

export type FolderPickerProps = {
	model: FolderTreeModel
	/** Groups the radios; unique per picker on a page. */
	name: string
	selected: Choice
	disabledIds?: ReadonlySet<string>
	currentId?: string | null
	onSelect(folderId: string | null): void
}

const rowClass = cn(
	'relative flex min-h-9 cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-sm text-slate-200 hover:bg-white/5',
	'has-[:checked]:bg-brand/10 has-[:checked]:font-medium has-[:checked]:text-white',
	'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/70',
	'has-[:disabled]:cursor-not-allowed has-[:disabled]:text-slate-500 has-[:disabled]:hover:bg-transparent',
)

/**
 * The indented folder list as a radio group. Native radios, so arrow keys move
 * between choices, a disabled folder cannot be reached or chosen, and a screen
 * reader hears "radio, 3 of 12". The chosen row carries a check mark and the
 * current location says "Current", so colour is never the only signal.
 */
export function FolderPicker({
	model,
	name,
	selected,
	disabledIds,
	currentId,
	onSelect,
}: FolderPickerProps) {
	const chosenRef = useRef<HTMLLabelElement>(null)

	// A long tree opens scrolled to the chosen row, not the top.
	useEffect(() => {
		chosenRef.current?.scrollIntoView?.({ block: 'nearest' })
	}, [])

	return (
		<div
			role='radiogroup'
			aria-label='Destination folder'
			className='max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-white/3 p-1'>
			<label
				ref={selected === null ? chosenRef : undefined}
				className={rowClass}
				style={{ paddingLeft: '0.5rem' }}>
				<input
					type='radio'
					name={name}
					value=''
					className='peer sr-only'
					checked={selected === null}
					onChange={() => onSelect(null)}
				/>
				<Library aria-hidden className='size-4 shrink-0 text-slate-400' />
				<span className='truncate'>Library root (Unfiled)</span>
				{currentId === null && (
					<span className='ml-auto text-xs text-slate-400'>Current</span>
				)}
				<Check
					aria-hidden
					className={cn('hidden size-4 shrink-0 text-brand peer-checked:block', currentId !== null && 'ml-auto')}
				/>
			</label>

			{model.ordered.map((node) => {
				const disabled = disabledIds?.has(node.id) ?? false
				const checked = selected === node.id
				return (
					<label
						key={node.id}
						ref={checked ? chosenRef : undefined}
						title={node.folder.path || node.name}
						className={rowClass}
						// Real depth is at most 5; the clamp only protects the layout from hostile data.
						style={{ paddingLeft: `${0.5 + Math.min(node.depth + 1, 8)}rem` }}>
						<input
							type='radio'
							name={name}
							value={node.id}
							className='peer sr-only'
							checked={checked}
							disabled={disabled}
							onChange={() => onSelect(node.id)}
						/>
						<Folder aria-hidden className='size-4 shrink-0 text-slate-400' />
						<span className='truncate'>{node.name}</span>
						{node.parent && (
							<span className='sr-only'>, inside {node.parent.folder.path || node.parent.name}</span>
						)}
						{currentId === node.id && (
							<span className='ml-auto shrink-0 text-xs text-slate-400'>Current</span>
						)}
						{disabled && (
							<span
								className={cn(
									'shrink-0 text-xs text-slate-500',
									currentId !== node.id && 'ml-auto',
								)}>
								Not available
							</span>
						)}
						<Check
							aria-hidden
							className={cn(
								'hidden size-4 shrink-0 text-brand peer-checked:block',
								currentId !== node.id && !disabled && 'ml-auto',
							)}
						/>
					</label>
				)
			})}
		</div>
	)
}

type BodyProps = Pick<
	MoveDialogProps,
	'folders' | 'disabledIds' | 'currentId' | 'confirmLabel' | 'onConfirm'
> & {
	onClose(): void
	/** Shared with the dialog so Esc and the overlay can refuse to close mid-request. */
	busy: MutableRefObject<boolean>
}

/**
 * Everything inside the dialog that is not the title. Mounted only while the
 * dialog is open (Radix unmounts closed content), so the choice, the error and
 * the pending flag start fresh every time. Exported for the proof.
 */
export function MoveDialogBody({
	folders,
	disabledIds,
	currentId,
	confirmLabel,
	onConfirm,
	onClose,
	busy,
}: BodyProps) {
	const model = useMemo(() => buildFolderTree(folders), [folders])
	const groupName = useId()
	const [selected, setSelected] = useState<Choice>(() => initialChoice(model, currentId))
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const canConfirm = canConfirmMove({ model, selected, currentId, disabledIds })

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		if (busy.current || selected === undefined || !canConfirm) return
		busy.current = true
		setPending(true)
		setError(null)
		const result = await attempt(() => onConfirm(selected))
		busy.current = false
		setPending(false)
		if (result.ok) onClose()
		else setError(result.message)
	}

	return (
		<form onSubmit={submit} className='space-y-4'>
			<FolderPicker
				model={model}
				name={groupName}
				selected={selected}
				disabledIds={disabledIds}
				currentId={currentId}
				onSelect={(id) => {
					setSelected(id)
					if (error) setError(null)
				}}
			/>
			{error && (
				<p role='alert' className='text-sm text-destructive'>
					{error}
				</p>
			)}
			<DialogFooter>
				<Button type='button' variant='outline' disabled={pending} onClick={onClose}>
					Cancel
				</Button>
				<Button
					type='submit'
					disabled={!canConfirm || pending}
					aria-busy={pending || undefined}
					className='bg-brand font-bold text-ink hover:bg-brand-strong'>
					{pending && <Loader2 className='animate-spin' />} {confirmLabel}
				</Button>
			</DialogFooter>
		</form>
	)
}

export type MoveDialogComponentProps = MoveDialogProps & {
	/**
	 * Optional and additive to the contract. When the dialog was opened from a menu
	 * item (not a button that stays on screen) the element focused at open time is
	 * gone by close, so the opener says where focus goes instead. Without it, focus
	 * returns to whatever held it when the dialog opened.
	 */
	restoreFocus?: () => void
}

export function MoveDialog({
	open,
	onOpenChange,
	title,
	description,
	folders,
	disabledIds,
	currentId,
	confirmLabel,
	onConfirm,
	restoreFocus,
}: MoveDialogComponentProps) {
	const busy = useRef(false)
	const returnTo = useRef<HTMLElement | null>(null)

	// Layout effects run before Radix moves focus into the dialog, so this still sees the opener.
	useLayoutEffect(() => {
		if (!open) return
		const active = document.activeElement
		returnTo.current =
			active instanceof HTMLElement && active !== document.body ? active : null
	}, [open])

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// A request in flight cannot be abandoned by Esc or a click outside.
				if (!next && busy.current) return
				onOpenChange(next)
			}}>
			<DialogContent
				className='sm:max-w-md'
				onCloseAutoFocus={(event) => {
					if (restoreFocus) {
						event.preventDefault()
						restoreFocus()
						return
					}
					const target = returnTo.current
					if (target?.isConnected) {
						event.preventDefault()
						target.focus()
					}
				}}>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : (
						<DialogDescription className='sr-only'>Choose a destination folder.</DialogDescription>
					)}
				</DialogHeader>
				<MoveDialogBody
					folders={folders}
					disabledIds={disabledIds}
					currentId={currentId}
					confirmLabel={confirmLabel}
					onConfirm={onConfirm}
					busy={busy}
					onClose={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	)
}
