'use client'

import { useId } from 'react'
import { Check, Grid2x2, Grid3x3, Minus, Square, SquareCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Density, GridToolbarProps } from '@/app/account/media/contracts'
import { formatCount } from '@/app/account/media/format'
import { MEDIA_SORTS, type MediaSort } from '@/lib/media/types'

export const SORT_LABELS: Record<MediaSort, string> = {
	relevance: 'Best match',
	newest: 'Newest first',
	oldest: 'Oldest first',
	name: 'Name A to Z',
	'name-desc': 'Name Z to A',
	largest: 'Largest file',
	smallest: 'Smallest file',
	dimensions: 'Most pixels',
}

/** `relevance` ranks a text query, so it is only offered when there is one. */
export const sortOptions = (hasText: boolean) =>
	MEDIA_SORTS.filter((sort) => sort !== 'relevance' || hasText)

const isSort = (value: string): value is MediaSort =>
	(MEDIA_SORTS as readonly string[]).includes(value)

/** "1,284 images", "1 image", "1,000+ images" when the total is only a lower bound. */
export function formatTotal(total: number, truncated: boolean) {
	const n = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0
	return `${formatCount(n)}${truncated ? '+' : ''} ${n === 1 && !truncated ? 'image' : 'images'}`
}

const DENSITIES: { value: Density; label: string; Icon: typeof Square }[] = [
	{ value: 'compact', label: 'Compact', Icon: Grid3x3 },
	{ value: 'comfortable', label: 'Comfortable', Icon: Grid2x2 },
	{ value: 'large', label: 'Large', Icon: Square },
]

export function GridToolbar({
	total,
	truncated,
	sort,
	hasText,
	density,
	allSelected,
	someSelected,
	selecting,
	showDeep,
	deep,
	onToggleSelecting,
	onSort,
	onDensity,
	onToggleAll,
	onToggleDeep,
}: GridToolbarProps) {
	const sortId = useId()
	// A text-less query cannot be sorted by relevance; show what is really in effect.
	const options = sortOptions(hasText)
	const shown = options.includes(sort) ? sort : 'newest'

	return (
		<div
			data-slot='grid-toolbar'
			className='flex flex-wrap items-center gap-x-3 gap-y-2'>
			<Button
				type='button'
				variant='outline'
				size='sm'
				aria-pressed={selecting}
				onClick={onToggleSelecting}
				className={cn(
					'border-white/10 bg-white/3 text-slate-200 hover:bg-white/8 hover:text-white',
					selecting && 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/15',
				)}>
				<SquareCheck />
				Select
			</Button>

			<button
				type='button'
				role='checkbox'
				aria-checked={allSelected ? true : someSelected ? 'mixed' : false}
				aria-label='Select all loaded images'
				onClick={onToggleAll}
				className='grid size-8 cursor-pointer place-items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-white/40'>
				<span
					className={cn(
						'grid size-5 place-items-center rounded border-2 transition-colors',
						allSelected || someSelected
							? 'border-brand bg-brand text-white'
							: 'border-white/40 text-transparent',
					)}>
					{allSelected ? (
						<Check strokeWidth={3} className='size-3.5' />
					) : someSelected ? (
						<Minus strokeWidth={3} className='size-3.5' />
					) : null}
				</span>
			</button>

			<p
				aria-live='polite'
				aria-atomic='true'
				data-slot='result-count'
				className='text-sm text-slate-300'>
				{formatTotal(total, truncated)}
			</p>

			<div className='ml-auto flex flex-wrap items-center gap-x-3 gap-y-2'>
				{showDeep ? (
					<button
						type='button'
						role='switch'
						aria-checked={deep}
						onClick={onToggleDeep}
						className='inline-flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-slate-300 outline-none focus-visible:ring-[3px] focus-visible:ring-white/40'>
						<span
							aria-hidden='true'
							className={cn(
								'relative inline-block h-5 w-9 rounded-full transition-colors',
								deep ? 'bg-brand' : 'bg-white/15',
							)}>
							<span
								className={cn(
									'absolute top-0.5 left-0.5 size-4 rounded-full bg-white transition-transform motion-reduce:transition-none',
									deep && 'translate-x-4',
								)}
							/>
						</span>
						Include subfolders
					</button>
				) : null}

				<div className='flex items-center gap-2'>
					<label htmlFor={sortId} className='sr-only'>
						Sort images
					</label>
					<select
						id={sortId}
						value={shown}
						onChange={(event) => {
							const next = event.target.value
							if (isSort(next)) onSort(next)
						}}
						className='h-8 rounded-md border border-white/10 bg-white/3 px-2 text-sm text-white outline-none scheme-dark focus-visible:ring-[3px] focus-visible:ring-white/40'>
						{options.map((value) => (
							<option key={value} value={value}>
								{SORT_LABELS[value]}
							</option>
						))}
					</select>
				</div>

				<div
					role='group'
					aria-label='Thumbnail size'
					className='inline-flex rounded-md border border-white/10 bg-white/3 p-0.5'>
					{DENSITIES.map(({ value, label, Icon }) => (
						<button
							key={value}
							type='button'
							aria-pressed={density === value}
							title={label}
							onClick={() => onDensity(value)}
							className={cn(
								'grid size-7 cursor-pointer place-items-center rounded text-slate-400 outline-none hover:text-white focus-visible:ring-[3px] focus-visible:ring-white/40',
								density === value && 'bg-white/10 text-white',
							)}>
							<Icon className='size-4' />
							<span className='sr-only'>{label}</span>
						</button>
					))}
				</div>
			</div>
		</div>
	)
}
