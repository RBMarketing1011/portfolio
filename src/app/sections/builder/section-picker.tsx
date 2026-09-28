'use client'

import { useEffect, useMemo, useState } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
	GROUP_LABELS,
	GROUP_ORDER,
	pickableSchemas,
} from '@/lib/builder/schema'

const ALL = 'all'

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
	const [tab, setTab] = useState(ALL)

	// The picker stays mounted, so a tab left on "Media" would hide everything next open.
	useEffect(() => {
		if (open) setTab(ALL)
	}, [open])

	const tabs = useMemo(() => {
		const present = new Set(pickableSchemas().map((schema) => schema.group))
		return [
			{ id: ALL, label: 'All' },
			...GROUP_ORDER.filter((id) => present.has(id)).map((id) => ({
				id,
				label: GROUP_LABELS[id] ?? id,
			})),
		]
	}, [])

	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase()
		return pickableSchemas().filter(
			(schema) =>
				!needle ||
				schema.label.toLowerCase().includes(needle) ||
				schema.description.toLowerCase().includes(needle),
		)
	}, [query])

	const groupsFor = (tabId: string) =>
		GROUP_ORDER.filter((id) => tabId === ALL || id === tabId)
			.map((id) => ({
				id,
				label: GROUP_LABELS[id] ?? id,
				items: matches.filter((schema) => schema.group === id),
			}))
			.filter((group) => group.items.length > 0)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{/* `h-[85vh]` is load-bearing: max-height alone leaves the height indefinite,
			    so the ScrollArea viewport's `h-full` never resolves and it can't scroll. */}
			<DialogContent className='flex h-[85vh] max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl'>
				<DialogHeader className='shrink-0 border-b border-white/10 px-6 py-5'>
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

				{/* Radix inline-styles the viewport child to `display:table`, which makes the
				    two-column grid shrink-wrap and overflow sideways. */}
				<Tabs
					orientation='vertical'
					value={tab}
					onValueChange={setTab}
					className='min-h-0 flex-1 gap-0'>
					<TabsList
						variant='line'
						className='h-auto! w-28 shrink-0 items-stretch justify-start gap-0.5 overflow-y-auto rounded-none border-r border-white/10 bg-transparent p-2 sm:w-36'>
						{tabs.map((entry) => (
							<TabsTrigger
								key={entry.id}
								value={entry.id}
								className='h-auto! flex-none rounded-md px-3 py-2 after:hidden hover:bg-white/5 data-[state=active]:bg-white/10!'>
								{entry.label}
							</TabsTrigger>
						))}
					</TabsList>

					<ScrollArea
						type='auto'
						className='min-h-0 min-w-0 flex-1 [&>[data-radix-scroll-area-viewport]>div]:block! **:data-[slot=scroll-area-thumb]:bg-white/20'>
						{tabs.map((entry) => {
							const groups = groupsFor(entry.id)
							return (
								<TabsContent
									key={entry.id}
									value={entry.id}
									className='space-y-7 px-6 py-5'>
									{groups.map((group) => (
										<div key={group.id}>
											{entry.id === ALL && (
												<p className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
													{group.label}
												</p>
											)}
											<div
												className={cn(
													'grid gap-2 sm:grid-cols-2',
													entry.id === ALL && 'mt-3',
												)}>
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
								</TabsContent>
							)
						})}
					</ScrollArea>
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}
