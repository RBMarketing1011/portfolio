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
import { Folder, Library, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
	'relative flex min-h-9 cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-sm leading-normal font-normal text-slate-200 hover:bg-white/5',
	'has-[[aria-checked=true]]:bg-brand/10 has-[[aria-checked=true]]:font-medium has-[[aria-checked=true]]:text-white',
	'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/70',
	'has-[:disabled]:cursor-not-allowed has-[:disabled]:text-slate-500 has-[:disabled]:hover:bg-transparent',
)

/** The visible radio, quiet until chosen; the row carries the focus ring. */
const radioClass =
	'border-white/25 text-brand focus-visible:ring-0 data-[state=checked]:border-brand [&_svg]:fill-brand'

/** The root's radio value. Folder ids are never empty, so it cannot collide with one. */
const ROOT_VALUE = ''

/**
 * The indented folder list as a radio group (Radix): arrow keys move between
 * choices and choose, a disabled folder cannot be reached or chosen, the group is
 * one tab stop that lands on the chosen row, and a screen reader hears "radio, 3
 * of 12". Each whole row is the radio's label. The chosen row shows the radio's
 * dot and the current location says "Current", so colour is never the only signal.
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

	// `null` keeps the group controlled with nothing chosen (undefined would make it uncontrolled).
	const value = selected === undefined ? null : selected === null ? ROOT_VALUE : selected

	return (
		<RadioGroup
			name={name}
			value={value}
			onValueChange={(next) => onSelect(next === ROOT_VALUE ? null : next)}
			aria-label='Destination folder'
			className='gap-0 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-white/3 p-1'>
			<Label
				ref={selected === null ? chosenRef : undefined}
				htmlFor={`${name}-root`}
				className={rowClass}
				style={{ paddingLeft: '0.5rem' }}>
				<RadioGroupItem id={`${name}-root`} value={ROOT_VALUE} className={radioClass} />
				<Library aria-hidden className='size-4 shrink-0 text-slate-400' />
				<span className='truncate'>All media (no folder)</span>
				{currentId === null && (
					<Badge
						variant='outline'
						className='ml-auto border-white/15 font-normal text-slate-400'>
						Current
					</Badge>
				)}
			</Label>

			{model.ordered.map((node) => {
				const disabled = disabledIds?.has(node.id) ?? false
				const checked = selected === node.id
				const id = `${name}-${node.id}`
				return (
					<Label
						key={node.id}
						ref={checked ? chosenRef : undefined}
						htmlFor={id}
						title={node.folder.path || node.name}
						className={rowClass}
						// Real depth is at most 5; the clamp only protects the layout from hostile data.
						style={{ paddingLeft: `${0.5 + Math.min(node.depth + 1, 8)}rem` }}>
						<RadioGroupItem
							id={id}
							value={node.id}
							disabled={disabled}
							className={radioClass}
						/>
						<Folder aria-hidden className='size-4 shrink-0 text-slate-400' />
						<span className='truncate'>{node.name}</span>
						{node.parent && (
							<span className='sr-only'>, inside {node.parent.folder.path || node.parent.name}</span>
						)}
						{currentId === node.id && (
							<Badge
								variant='outline'
								className='ml-auto border-white/15 font-normal text-slate-400'>
								Current
							</Badge>
						)}
						{disabled && (
							<Badge
								variant='outline'
								className={cn(
									'border-white/10 font-normal text-slate-500',
									currentId !== node.id && 'ml-auto',
								)}>
								Not available
							</Badge>
						)}
					</Label>
				)
			})}
		</RadioGroup>
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
				<Alert variant='destructive'>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
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
