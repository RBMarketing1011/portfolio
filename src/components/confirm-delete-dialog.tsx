'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
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

/**
 * A destructive action behind a dialog. With `confirmText` the person must type
 * it exactly before the button enables; without, it is a plain confirmation.
 * `onConfirm` returns an error message to show, or null on success (the caller
 * closes the dialog or navigates away).
 */
export function ConfirmDeleteDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmText,
	actionLabel = 'Delete',
	icon,
	onConfirm,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	description: React.ReactNode
	confirmText?: string
	actionLabel?: string
	/** Defaults to a bin. */
	icon?: React.ReactNode
	onConfirm: () => Promise<string | null>
}) {
	const [typed, setTyped] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	// A reopened dialog must not remember the last attempt.
	useEffect(() => {
		if (!open) {
			setTyped('')
			setError(null)
			setBusy(false)
		}
	}, [open])

	const confirm = async () => {
		setBusy(true)
		setError(null)
		const message = await onConfirm()
		setBusy(false)
		if (message) setError(message)
	}

	return (
		<Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				{confirmText !== undefined && (
					<div className='space-y-2'>
						<Label htmlFor='confirm-delete-input'>
							Type <span className='font-semibold'>{confirmText}</span> to
							confirm
						</Label>
						<Input
							id='confirm-delete-input'
							autoComplete='off'
							value={typed}
							onChange={(event) => setTyped(event.target.value)}
						/>
					</div>
				)}

				{error && <p className='text-sm text-destructive'>{error}</p>}

				<DialogFooter>
					<Button
						variant='outline'
						disabled={busy}
						onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant='destructive'
						disabled={busy || (confirmText !== undefined && typed !== confirmText)}
						onClick={confirm}>
						{busy ? <Loader2 className='animate-spin' /> : (icon ?? <Trash2 />)}
						{actionLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
