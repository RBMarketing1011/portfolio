'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
	Pagination as PaginationRoot,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from '@/components/ui/pagination'
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
	className,
}: {
	filters?: string[]
	defaultValue?: string
	onChange?: (value: string) => void
	resultCount?: number
	className?: string
}) {
	const [active, setActive] = useState(defaultValue ?? filters[0])

	const select = (value: string) => {
		setActive(value)
		onChange?.(value)
	}

	return (
		<div
			className={cn(
				'flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6',
				className,
			)}>
			<ul className='flex flex-wrap gap-2'>
				{filters.map((filter) => (
					<li key={filter}>
						<button
							type='button'
							onClick={() => select(filter)}
							aria-pressed={filter === active}
							className={cn(
								'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
								filter === active
									? 'border-brand/40 bg-brand/10 text-white'
									: 'border-white/10 bg-white/3 text-slate-400 hover:border-white/25 hover:text-white',
							)}>
							{filter}
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
	className,
}: {
	page?: number
	totalPages?: number
	/** Pages shown either side of the current one before an ellipsis takes over. */
	siblings?: number
	hrefFor?: (page: number) => string
	/** Handle paging in state instead of navigating. */
	onPageChange?: (page: number) => void
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

	return (
		<PaginationRoot className={className}>
			<PaginationContent>
				<PaginationItem>
					<PaginationPrevious
						{...linkProps(page - 1)}
						aria-disabled={first}
						className={cn(first && 'pointer-events-none opacity-40')}
					/>
				</PaginationItem>

				{pageItems(page, totalPages, siblings).map((item, index) =>
					item === 'gap' ? (
						<PaginationItem key={`gap-${index}`}>
							<PaginationEllipsis />
						</PaginationItem>
					) : (
						<PaginationItem key={item}>
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
				)}

				<PaginationItem>
					<PaginationNext
						{...linkProps(page + 1)}
						aria-disabled={last}
						className={cn(last && 'pointer-events-none opacity-40')}
					/>
				</PaginationItem>
			</PaginationContent>
		</PaginationRoot>
	)
}

export function TableOfContents({
	title = 'On This Page',
	items = [
		{ id: 'section-one', label: 'This is the first heading' },
		{ id: 'section-two', label: 'This is the second heading' },
		{ id: 'section-three', label: 'This is the third heading' },
		{ id: 'section-four', label: 'This is the fourth heading' },
	],
	className,
}: {
	title?: string
	items?: { id: string; label: string }[]
	className?: string
}) {
	const [active, setActive] = useState(items[0]?.id)

	useEffect(() => {
		const headings = items
			.map((item) => document.getElementById(item.id))
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
	}, [items])

	return (
		<nav
			aria-label='Table of contents'
			// self-start stops a grid parent stretching it, which would leave sticky no room to travel.
			className={cn('lg:sticky lg:top-28 lg:self-start', className)}>
			<p className='eyebrow'>{title}</p>
			<ul className='mt-4 space-y-1 border-l border-white/10'>
				{items.map((item) => (
					<li key={item.id}>
						<a
							href={`#${item.id}`}
							className={cn(
								'-ml-px block border-l py-1.5 pl-4 text-sm transition-colors',
								item.id === active
									? 'border-brand font-medium text-white'
									: 'border-transparent text-slate-500 hover:border-white/30 hover:text-slate-300',
							)}>
							{item.label}
						</a>
					</li>
				))}
			</ul>
		</nav>
	)
}
