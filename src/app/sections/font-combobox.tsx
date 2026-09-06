'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { googleFonts, type FontCategory } from './google-fonts'

const categories: (FontCategory | 'All')[] = [
	'All',
	'Sans Serif',
	'Serif',
	'Display',
	'Monospace',
	'Handwriting',
]

// The catalogue is ~1,900 entries; rendering a slice keeps the list responsive.
const VISIBLE = 80

export function FontCombobox({
	label,
	value,
	onChange,
}: {
	label: string
	value: string
	onChange: (family: string) => void
}) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState('')
	const [category, setCategory] = useState<FontCategory | 'All'>('All')
	const inputRef = useRef<HTMLInputElement>(null)

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase()
		return googleFonts.filter(
			(font) =>
				(category === 'All' || font.category === category) &&
				(q === '' || font.family.toLowerCase().includes(q)),
		)
	}, [query, category])

	return (
		<div>
			<p className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
				{label}
			</p>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type='button'
						role='combobox'
						aria-expanded={open}
						className='mt-2 flex w-full items-center justify-between gap-2 rounded-md border border-white/15 bg-ink/60 px-3 py-2.5 text-left text-sm text-white transition-colors hover:border-white/30'>
						<span className='truncate'>{value}</span>
						<ChevronsUpDown className='size-4 shrink-0 text-slate-500' />
					</button>
				</PopoverTrigger>

				<PopoverContent
					align='start'
					className='w-[19rem] border-white/10 bg-panel p-0'
					onOpenAutoFocus={(event) => {
						event.preventDefault()
						inputRef.current?.focus()
					}}>
					<div className='border-b border-white/10 p-2'>
						<div className='flex items-center gap-2 rounded-md bg-ink/60 px-2.5'>
							<Search className='size-4 shrink-0 text-slate-500' />
							<input
								ref={inputRef}
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={`Search ${googleFonts.length} fonts`}
								className='w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-slate-500'
							/>
						</div>
						<div className='mt-2 flex flex-wrap gap-1'>
							{categories.map((option) => (
								<button
									key={option}
									type='button'
									onClick={() => setCategory(option)}
									className={cn(
										'rounded-full px-2.5 py-1 text-xs transition-colors',
										option === category
											? 'bg-brand/15 text-brand'
											: 'text-slate-500 hover:text-white',
									)}>
									{option}
								</button>
							))}
						</div>
					</div>

					<ScrollArea className='h-64'>
						<ul className='p-1'>
							{matches.slice(0, VISIBLE).map((font) => (
								<li key={font.family}>
									<button
										type='button'
										onClick={() => {
											onChange(font.family)
											setOpen(false)
										}}
										className={cn(
											'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
											font.family === value
												? 'bg-brand/10 text-white'
												: 'text-slate-300 hover:bg-white/5 hover:text-white',
										)}>
										<span className='truncate'>{font.family}</span>
										{font.family === value ? (
											<Check className='size-4 shrink-0 text-brand' />
										) : (
											<span className='shrink-0 text-xs text-slate-600'>
												{font.category}
											</span>
										)}
									</button>
								</li>
							))}

							{matches.length === 0 && (
								<li className='px-3 py-6 text-center text-sm text-slate-500'>
									No fonts match “{query}”.
								</li>
							)}
						</ul>
					</ScrollArea>

					{matches.length > VISIBLE && (
						<p className='border-t border-white/10 px-3 py-2 text-xs text-slate-500'>
							Showing {VISIBLE} of {matches.length}. Keep typing to narrow.
						</p>
					)}
				</PopoverContent>
			</Popover>
		</div>
	)
}
