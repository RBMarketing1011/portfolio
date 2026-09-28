'use client'

import { CloudOff, RotateCcw } from 'lucide-react'
import type { SaveState } from '@/lib/builder/drivers'

/** A failed network save is invisible otherwise, so this is always on screen.
 *  Success is reported by the Save button in the toolbar, not here. */
export function SaveIndicator({
	state,
	error,
	onRetry,
}: {
	state: SaveState
	error: string | null
	onRetry: () => void
}) {
	if (!(state === 'error' || error)) return null

	return (
		<div
			role='alert'
			className='fixed inset-x-0 top-0 z-100 flex items-center justify-center gap-3 bg-destructive px-4 py-2 text-sm font-medium text-white'>
			<CloudOff className='size-4 shrink-0' />
			{error ?? 'Your changes could not be saved.'}
			<button
				type='button'
				onClick={onRetry}
				className='flex items-center gap-1 rounded bg-white/15 px-2 py-0.5 text-xs hover:bg-white/25'>
				<RotateCcw className='size-3' /> Retry
			</button>
		</div>
	)
}
