'use client'

import { CheckCheck, FolderInput, Sparkles, Tag, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SelectionBarProps } from '@/app/account/media/contracts'
import { formatCount, pluralize } from '@/app/account/media/format'

const safeCount = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)

const actionClass =
	'text-slate-200 hover:bg-white/8 hover:text-white dark:hover:bg-white/8'

export function SelectionBar({
	count,
	totalMatching,
	allMatching,
	canSelectAllMatching,
	canWrite,
	canDelete,
	aiConfigured,
	onSelectAllMatching,
	onClear,
	onMove,
	onTag,
	onRetag,
	onAcceptTags,
	onDelete,
}: SelectionBarProps) {
	const selected = safeCount(count)
	const total = safeCount(totalMatching)
	// Nothing to act on: a bar of buttons that would all do nothing is worse than no bar.
	if (selected === 0 && !allMatching) return null

	const showSelectAll = canSelectAllMatching && !allMatching && selected < total
	const shown = allMatching ? total : selected

	return (
		<div
			role='region'
			aria-label={`${pluralize(shown, 'image')} selected`}
			data-slot='selection-bar'
			className='sticky bottom-4 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-panel/95 px-3 py-2 shadow-xl backdrop-blur-md'>
			<p className='text-sm font-medium text-white'>
				{allMatching
					? `All ${formatCount(total)} matching selected`
					: `${formatCount(selected)} selected`}
			</p>

			{showSelectAll ? (
				<button
					type='button'
					onClick={onSelectAllMatching}
					className='cursor-pointer rounded text-sm text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-white/40'>
					Select all {formatCount(total)} matching
				</button>
			) : null}

			<div className='ml-auto flex flex-wrap items-center gap-1'>
				{canWrite ? (
					<>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={onMove}
							className={actionClass}>
							<FolderInput />
							Move to…
						</Button>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={onTag}
							className={actionClass}>
							<Tag />
							Tag…
						</Button>
						{aiConfigured ? (
							<Button
								type='button'
								variant='ghost'
								size='sm'
								onClick={onRetag}
								className={actionClass}>
								<Sparkles />
								Auto-tag again
							</Button>
						) : null}
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={onAcceptTags}
							className={actionClass}>
							<CheckCheck />
							Keep all auto tags
						</Button>
					</>
				) : null}
				{canDelete ? (
					<Button
						type='button'
						variant='ghost'
						size='sm'
						onClick={onDelete}
						className={cn(
							'text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/10',
						)}>
						<Trash2 />
						Delete
					</Button>
				) : null}
				<Button
					type='button'
					variant='ghost'
					size='sm'
					onClick={onClear}
					className={actionClass}>
					<X />
					Clear
				</Button>
			</div>
		</div>
	)
}
