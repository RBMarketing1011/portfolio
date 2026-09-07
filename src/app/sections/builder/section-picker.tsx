'use client'

import { useMemo, useState } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
	GROUP_LABELS,
	GROUP_ORDER,
	pickableSchemas,
} from '@/lib/builder/schema'

export function SectionPicker({
	open,
	onOpenChange,
	onPick,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onPick: (type: string) => void
}) {
	const [query, setQuery] = useState('')

	const groups = useMemo(() => {
		const needle = query.trim().toLowerCase()
		const matches = pickableSchemas().filter(
			(schema) =>
				!needle ||
				schema.label.toLowerCase().includes(needle) ||
				schema.description.toLowerCase().includes(needle),
		)
		return GROUP_ORDER.map((id) => ({
			id,
			label: GROUP_LABELS[id] ?? id,
			items: matches.filter((schema) => schema.group === id),
		})).filter((group) => group.items.length > 0)
	}, [query])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-3xl'>
				<DialogHeader className='border-b border-white/10 px-6 py-5'>
					<DialogTitle>Add a section</DialogTitle>
					<DialogDescription>
						Every section starts with placeholder copy you can edit afterwards.
					</DialogDescription>
					<Input
						autoFocus
						value={query}
						placeholder='Search sections'
						onChange={(event) => setQuery(event.target.value)}
						className='mt-3'
					/>
				</DialogHeader>

				<ScrollArea className='min-h-0 flex-1'>
					<div className='space-y-7 px-6 py-5'>
						{groups.map((group) => (
							<div key={group.id}>
								<p className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
									{group.label}
								</p>
								<div className='mt-3 grid gap-2 sm:grid-cols-2'>
									{group.items.map((schema) => (
										<button
											key={schema.type}
											type='button'
											onClick={() => {
												onPick(schema.type)
												onOpenChange(false)
											}}
											className={cn(
												'rounded-lg border border-white/10 bg-white/3 p-3 text-left transition-colors',
												'hover:border-brand/50 hover:bg-brand/5',
											)}>
											<span className='block text-sm font-medium text-white'>
												{schema.label}
											</span>
											<span className='mt-1 block text-xs leading-5 text-slate-400'>
												{schema.description}
											</span>
										</button>
									))}
								</div>
							</div>
						))}
						{groups.length === 0 && (
							<p className='py-8 text-center text-sm text-slate-500'>
								Nothing matches that search.
							</p>
						)}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	)
}
