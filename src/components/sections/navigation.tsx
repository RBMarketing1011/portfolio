'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
	Pagination as PaginationRoot,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from '@/components/ui/pagination'
import { anchorId } from '@/lib/builder/ids'
import { cn } from '@/lib/utils'

export function FilterBar({
	filters = [
		'All',
		'First Filter',
		'Second Filter',
		'Third Filter',
		'Fourth Filter',
	],
	defaultValue,
	onChange,
	resultCount,
	design = 'pills',
	className,
}: {
	/** A plain label, or a label plus the value it matches on. */
	filters?: (string | { label?: string; value?: string })[]
	defaultValue?: string
	onChange?: (value: string) => void
	resultCount?: number
	/** How the filter controls are drawn. */
	design?: 'pills' | 'underline' | 'segmented'
	className?: string
}) {
	const options = filters.map((filter) => {
		const label = typeof filter === 'string' ? filter : (filter?.label ?? '')
		// Unset means the label doubles as the value, which is the common case.
		const value = typeof filter === 'string' ? filter : filter?.value || label
		return { label, value }
	})

	const [active, setActive] = useState(defaultValue ?? options[0]?.value)

	const select = (value: string) => {
		setActive(value)
		onChange?.(value)
	}

	return (
		<div
			className={cn(
				'flex flex-wrap items-center justify-between gap-4',
				design !== 'segmented' && 'border-b border-white/10 pb-6',
				className,
			)}>
			<ul
				className={cn(
					'flex flex-wrap',
					design === 'pills' && 'gap-2',
					design === 'underline' && 'gap-6',
					design === 'segmented' &&
						'gap-0 rounded-lg border border-white/12 bg-white/3 p-1',
				)}>
				{options.map((filter, index) => (
					<li key={`${filter.value}-${index}`}>
						<button
							type='button'
							onClick={() => select(filter.value)}
							aria-pressed={filter.value === active}
							className={cn(
								'text-sm font-medium transition-colors',
								design === 'pills' && 'rounded-full border px-4 py-1.5',
								design === 'pills' &&
									(filter.value === active
										? 'border-brand/40 bg-brand/10 text-white'
										: 'border-white/10 bg-white/3 text-slate-400 hover:border-white/25 hover:text-white'),
								design === 'underline' && 'border-b-2 pb-2',
								design === 'underline' &&
									(filter.value === active
										? 'border-brand text-white'
										: 'border-transparent text-slate-400 hover:text-white'),
								design === 'segmented' && 'rounded-md px-4 py-1.5',
								design === 'segmented' &&
									(filter.value === active
										? 'bg-brand text-ink'
										: 'text-slate-400 hover:text-white'),
							)}>
							{filter.label}
						</button>
					</li>
				))}
			</ul>
			{typeof resultCount === 'number' && (
				<p className='text-sm text-slate-500'>
					{resultCount} {resultCount === 1 ? 'result' : 'results'}
				</p>
			)}
		</div>
	)
}

// First page, a window around the current one, the last page, and gaps marked with an ellipsis.
function pageItems(page: number, totalPages: number, siblings: number) {
	if (totalPages <= siblings * 2 + 5)
		return Array.from({ length: totalPages }, (_, index) => index + 1)

	const left = Math.max(page - siblings, 1)
	const right = Math.min(page + siblings, totalPages)
	const items: (number | 'gap')[] = [1]

	if (left > 2) items.push('gap')
	for (let n = Math.max(left, 2); n <= Math.min(right, totalPages - 1); n++)
		items.push(n)
	if (right < totalPages - 1) items.push('gap')
	items.push(totalPages)

	return items
}

export function Pagination({
	page = 2,
	totalPages = 12,
	siblings = 1,
	hrefFor = (n: number) => `?page=${n}`,
	onPageChange,
	design = 'numbers',
	className,
}: {
	page?: number
	totalPages?: number
	/** Pages shown either side of the current one before an ellipsis takes over. */
	siblings?: number
	hrefFor?: (page: number) => string
	/** Handle paging in state instead of navigating. */
	onPageChange?: (page: number) => void
	/** How the control is laid out. */
	design?: 'numbers' | 'compact' | 'spread'
	className?: string
}) {
	const first = page <= 1
	const last = page >= totalPages

	const linkProps = (target: number) => ({
		href: hrefFor(target),
		onClick: onPageChange
			? (event: React.MouseEvent) => {
					event.preventDefault()
					onPageChange(target)
				}
			: undefined,
	})

	const previous = (
		<PaginationPrevious
			{...linkProps(page - 1)}
			aria-disabled={first}
			className={cn(first && 'pointer-events-none opacity-40')}
		/>
	)

	const next = (
		<PaginationNext
			{...linkProps(page + 1)}
			aria-disabled={last}
			className={cn(last && 'pointer-events-none opacity-40')}
		/>
	)

	const numbers = pageItems(page, totalPages, siblings).map((item, index) =>
		item === 'gap' ? (
			<PaginationItem key={`gap-${index}`}>
				<PaginationEllipsis />
			</PaginationItem>
		) : (
			<PaginationItem key={`page-${index}`}>
				<PaginationLink
					{...linkProps(item)}
					isActive={item === page}
					className={cn(
						'tabular-nums',
						item === page &&
							'border-brand bg-transparent font-bold text-brand hover:bg-brand/10 hover:text-brand',
					)}>
					{item}
				</PaginationLink>
			</PaginationItem>
		),
	)

	if (design === 'compact') {
		return (
			<PaginationRoot className={className}>
				<PaginationContent className='gap-6'>
					<PaginationItem>{previous}</PaginationItem>
					<PaginationItem>
						<span className='px-2 text-sm tabular-nums text-slate-400'>
							Page <span className='font-semibold text-white'>{page}</span> of{' '}
							{totalPages}
						</span>
					</PaginationItem>
					<PaginationItem>{next}</PaginationItem>
				</PaginationContent>
			</PaginationRoot>
		)
	}

	if (design === 'spread') {
		return (
			<PaginationRoot
				className={cn('border-t border-white/10 pt-6', className)}>
				<PaginationContent className='w-full justify-between'>
					<PaginationItem>{previous}</PaginationItem>
					<div className='flex items-center gap-1'>{numbers}</div>
					<PaginationItem>{next}</PaginationItem>
				</PaginationContent>
			</PaginationRoot>
		)
	}

	return (
		<PaginationRoot className={className}>
			<PaginationContent>
				<PaginationItem>{previous}</PaginationItem>
				{numbers}
				<PaginationItem>{next}</PaginationItem>
			</PaginationContent>
		</PaginationRoot>
	)
}

export function TableOfContents({
	title = 'On This Page',
	items = [
		{ label: 'This is the first heading' },
		{ label: 'This is the second heading' },
		{ label: 'This is the third heading' },
		{ label: 'This is the fourth heading' },
	],
	design = 'rail',
	className,
}: {
	title?: string
	/** Without an id the label slug is the anchor, matching the ids headings carry. */
	items?: { id?: string; label: string }[]
	/** How the list marks the active heading. */
	design?: 'rail' | 'numbered' | 'card'
	className?: string
}) {
	const entries = useMemo(
		() =>
			items.map((item) => ({
				label: item.label,
				id: item.id || anchorId(item.label),
			})),
		[items],
	)
	const [active, setActive] = useState<string | undefined>()
	const current = entries.some((entry) => entry.id === active)
		? active
		: entries[0]?.id

	useEffect(() => {
		const headings = entries
			.map((entry) => document.getElementById(entry.id))
			.filter((el): el is HTMLElement => Boolean(el))

		if (headings.length === 0) return

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((entry) => entry.isIntersecting)
				if (visible.length > 0) setActive(visible[0].target.id)
			},
			// Bias the active line toward whatever sits near the top of the viewport.
			{ rootMargin: '-96px 0px -70% 0px', threshold: 0 },
		)

		headings.forEach((heading) => observer.observe(heading))
		return () => observer.disconnect()
	}, [entries])

	return (
		<nav
			aria-label='Table of contents'
			// self-start stops a grid parent stretching it, which would leave sticky no room to travel.
			// The max height keeps a long list inside the viewport rather than running past it.
			className={cn(
				'lg:sticky lg:top-28 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto',
				design === 'card' &&
					'rounded-xl border border-white/10 bg-white/3 p-6 backdrop-blur-xl',
				className,
			)}>
			<p className='eyebrow'>{title}</p>
			<ul
				className={cn(
					'mt-4 space-y-1',
					design === 'rail' && 'border-l border-white/10',
				)}>
				{entries.map((item, index) => (
					<li key={index}>
						<a
							href={`#${item.id}`}
							className={cn(
								'block text-sm transition-colors',
								design === 'rail' && '-ml-px border-l py-1.5 pl-4',
								design === 'rail' &&
									(item.id === current
										? 'border-brand font-medium text-white'
										: 'border-transparent text-slate-500 hover:border-white/30 hover:text-slate-300'),
								design === 'numbered' && 'flex gap-3 py-1.5',
								design === 'card' && 'rounded-md px-3 py-2',
								design === 'card' &&
									(item.id === current
										? 'bg-brand/12 font-medium text-white'
										: 'text-slate-500 hover:bg-white/5 hover:text-slate-300'),
								design === 'numbered' &&
									(item.id === current
										? 'font-medium text-white'
										: 'text-slate-500 hover:text-slate-300'),
							)}>
							{design === 'numbered' && (
								<span
									aria-hidden
									className={cn(
										'tabular-nums',
										item.id === current ? 'text-brand' : 'text-slate-700',
									)}>
									{String(index + 1).padStart(2, '0')}
								</span>
							)}
							{item.label}
						</a>
					</li>
				))}
			</ul>
		</nav>
	)
}
