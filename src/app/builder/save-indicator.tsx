'use client'

import { Check, CloudOff, Loader2, RotateCcw } from 'lucide-react'
import type { SaveState } from '@/lib/builder/drivers'

/** A failed network save is invisible otherwise, so this is always on screen. */
export function SaveIndicator({
	state,
	error,
	remote,
	onRetry,
}: {
	state: SaveState
	error: string | null
	remote: boolean
	onRetry: () => void
}) {
	if (state === 'error' || error)
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

	if (!remote) return null

	return (
		<div className='pointer-events-none fixed right-4 top-3 z-100 flex items-center gap-1.5 rounded-full border border-white/10 bg-ink/85 px-3 py-1 text-xs text-slate-400 backdrop-blur'>
			{state === 'saving' ? (
				<>
					<Loader2 className='size-3 animate-spin' /> Saving…
				</>
			) : state === 'saved' ? (
				<>
					<Check className='size-3 text-brand' /> All changes saved
				</>
			) : null}
		</div>
	)
}
