'use client'

import { useId } from 'react'
import { Grid2x2, Grid3x3, Square, SquareCheck } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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

const isDensity = (value: string): value is Density =>
	DENSITIES.some((density) => density.value === value)

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
	const deepId = useId()
	// A text-less query cannot be sorted by relevance; show what is really in effect.
	const options = sortOptions(hasText)
	const shown = options.includes(sort) ? sort : 'newest'

	return (
		<div
			data-slot='grid-toolbar'
			className='flex flex-wrap items-center gap-x-3 gap-y-2'>
			<Toggle
				variant='outline'
				size='sm'
				pressed={selecting}
				onPressedChange={() => onToggleSelecting()}
				className='gap-1.5 border-white/10 bg-white/3 px-2.5 text-slate-200 hover:bg-white/8 hover:text-white data-[state=on]:border-brand/40 data-[state=on]:bg-brand/10 data-[state=on]:text-brand data-[state=on]:hover:bg-brand/15'>
				<SquareCheck />
				Select
			</Toggle>

			{/* The size-8 wrapper keeps the old hit area around the 20px box. */}
			<span className='grid size-8 place-items-center'>
				<Checkbox
					checked={allSelected ? true : someSelected ? 'indeterminate' : false}
					aria-label='Select all loaded images'
					onCheckedChange={() => onToggleAll()}
					// Some but not all: a dash instead of the check the indicator always draws.
					className="grid size-5 cursor-pointer place-items-center rounded border-2 border-white/40 bg-transparent text-white shadow-none transition-colors focus-visible:ring-white/40 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand data-[state=indeterminate]:after:block data-[state=indeterminate]:after:h-0.5 data-[state=indeterminate]:after:w-2.5 data-[state=indeterminate]:after:rounded-full data-[state=indeterminate]:after:bg-current data-[state=indeterminate]:after:content-[''] data-[state=indeterminate]:[&>span]:hidden dark:bg-transparent dark:data-[state=checked]:bg-brand"
				/>
			</span>

			<p
				aria-live='polite'
				aria-atomic='true'
				data-slot='result-count'
				className='text-sm text-slate-300'>
				{formatTotal(total, truncated)}
			</p>

			<div className='ml-auto flex flex-wrap items-center gap-x-3 gap-y-2'>
				{showDeep ? (
					<div className='flex items-center gap-2 px-1 py-1'>
						<Switch
							id={deepId}
							checked={deep}
							onCheckedChange={() => onToggleDeep()}
							className='cursor-pointer data-[state=checked]:bg-brand data-[state=unchecked]:bg-white/15 dark:data-[state=unchecked]:bg-white/15 [&>span]:motion-reduce:transition-none'
						/>
						<Label
							htmlFor={deepId}
							className='cursor-pointer font-normal text-slate-300'>
							Include subfolders
						</Label>
					</div>
				) : null}

				<div className='flex items-center gap-2'>
					<Label htmlFor={sortId} className='sr-only'>
						Sort images
					</Label>
					<Select
						value={shown}
						onValueChange={(next) => {
							if (isSort(next)) onSort(next)
						}}>
						<SelectTrigger
							id={sortId}
							size='sm'
							className='border-white/10 bg-white/3 px-2 text-white dark:bg-white/3'>
							{/* Children, so the server render shows the sort before hydration. */}
							<SelectValue>{SORT_LABELS[shown]}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{options.map((value) => (
								<SelectItem key={value} value={value}>
									{SORT_LABELS[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<ToggleGroup
					type='single'
					aria-label='Thumbnail size'
					value={density}
					onValueChange={(next) => {
						// Radix lets the active item be pressed off (''); there is always one size.
						if (isDensity(next)) onDensity(next)
					}}
					className='rounded-md border border-white/10 bg-white/3 p-0.5'>
					{DENSITIES.map(({ value, label, Icon }) => (
						<ToggleGroupItem
							key={value}
							value={value}
							title={label}
							className='size-7 min-w-0 cursor-pointer rounded px-0 text-slate-400 hover:bg-transparent hover:text-white data-[spacing=0]:rounded data-[state=on]:bg-white/10 data-[state=on]:text-white data-[spacing=0]:first:rounded data-[spacing=0]:last:rounded'>
							<Icon className='size-4' />
							<span className='sr-only'>{label}</span>
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>
		</div>
	)
}
