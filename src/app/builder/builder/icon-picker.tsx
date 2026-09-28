'use client'

import { useMemo, useState } from 'react'
import { Ban, ChevronsUpDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ICON_NAMES, iconLabel, resolveIcon } from '@/lib/builder/icons'

// 1556 icons will not render at interactive speed, and nobody scrolls that far.
const MAX_RESULTS = 120

const HAYSTACK = ICON_NAMES.map((name) => ({
	name,
	search: `${name} ${iconLabel(name)}`.toLowerCase(),
}))

export function IconPicker({
	id,
	value,
	onChange,
}: {
	id?: string
	value: string | undefined
	onChange: (value: string | undefined) => void
}) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')

	const results = useMemo(() => {
		const needle = query.trim().toLowerCase()
		if (!needle) return HAYSTACK.slice(0, MAX_RESULTS)
		const hits = []
		for (const entry of HAYSTACK) {
			if (entry.search.includes(needle)) hits.push(entry)
			if (hits.length === MAX_RESULTS) break
		}
		return hits
	}, [query])

	const Selected = resolveIcon(value)

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next)
				if (next) setQuery('')
			}}>
			<PopoverTrigger asChild>
				<button
					id={id}
					type='button'
					role='combobox'
					aria-expanded={open}
					className='flex h-9 w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/4 px-3 text-sm text-white transition-colors hover:bg-white/6'>
					<span className='flex min-w-0 items-center gap-2'>
						{Selected ? (
							<Selected className='size-4 shrink-0 text-brand' />
						) : null}
						<span className={cn('truncate', !value && 'text-slate-500')}>
							{value ? iconLabel(value) : 'No icon'}
						</span>
					</span>
					<ChevronsUpDown className='size-3.5 shrink-0 opacity-50' />
				</button>
			</PopoverTrigger>

			<PopoverContent className='w-(--radix-popover-trigger-width) min-w-72 p-0'>
				<div className='border-b border-white/10 p-2'>
					<div className='relative'>
						<Search className='pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate-500' />
						<Input
							autoFocus
							value={query}
							placeholder={`Search ${ICON_NAMES.length} icons`}
							onChange={(event) => setQuery(event.target.value)}
							className='h-8 pl-8 text-sm'
						/>
					</div>
				</div>

				<button
					type='button'
					onClick={() => {
						onChange(undefined)
						setOpen(false)
					}}
					className={cn(
						'flex w-full items-center gap-2 border-b border-white/10 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5',
						value ? 'text-slate-400' : 'text-brand',
					)}>
					<Ban className='size-3.5' /> No icon
				</button>

				<div className='max-h-64 overflow-y-auto p-2'>
					{results.length === 0 ? (
						<p className='py-6 text-center text-xs text-slate-500'>
							No icon matches that search.
						</p>
					) : (
						<div className='grid grid-cols-6 gap-1'>
							{results.map((entry) => {
								const Icon = resolveIcon(entry.name)
								if (!Icon) return null
								return (
									<button
										key={entry.name}
										type='button'
										title={iconLabel(entry.name)}
										aria-label={iconLabel(entry.name)}
										onClick={() => {
											onChange(entry.name)
											setOpen(false)
										}}
										className={cn(
											'flex aspect-square items-center justify-center rounded-md border transition-colors',
											entry.name === value
												? 'border-brand/60 bg-brand/15 text-brand'
												: 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
										)}>
										<Icon className='size-4' />
									</button>
								)
							})}
						</div>
					)}
					{results.length === MAX_RESULTS && (
						<p className='pt-2 text-center text-[11px] text-slate-500'>
							Showing the first {MAX_RESULTS}. Keep typing to narrow it down.
						</p>
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}
