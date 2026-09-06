'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

type NavGroup = {
	id: string
	label: string
	entries: { slug: string; name: string; built: boolean }[]
}

export function LibraryNav({ groups }: { groups: NavGroup[] }) {
	const pathname = usePathname()
	const params = useSearchParams()
	const navRef = useRef<HTMLElement>(null)
	// Preserves viewport and theme choices when moving between sections.
	const search = params.toString()
	const query = search ? `?${search}` : ''

	// The sidebar starts at the top on load, so bring the selected entry into view.
	// Skipped when it is already visible, or clicking a link would yank the list.
	useEffect(() => {
		const link = navRef.current?.querySelector('[data-active="true"]')
		const viewport = link?.closest('[data-slot="scroll-area-viewport"]')
		if (!link || !viewport) return

		const linkBox = link.getBoundingClientRect()
		const viewportBox = viewport.getBoundingClientRect()
		if (linkBox.top >= viewportBox.top && linkBox.bottom <= viewportBox.bottom)
			return

		viewport.scrollTop +=
			linkBox.top - viewportBox.top - (viewportBox.height - linkBox.height) / 2
	}, [pathname])

	return (
		<nav ref={navRef} className='space-y-6' aria-label='Section library'>
			{groups.map((group) => (
				<div key={group.id}>
					<p className='px-2 text-xs font-semibold uppercase tracking-widest text-slate-500'>
						{group.label}
					</p>
					<ul className='mt-2 space-y-0.5'>
						{group.entries.map((entry) => {
							const href = `/sections/${entry.slug}`
							const active = pathname === href

							return (
								<li key={entry.slug}>
									<Link
										href={`${href}${query}`}
										data-active={active}
										aria-current={active ? 'page' : undefined}
										className={cn(
											'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
											active
												? 'bg-brand/10 text-white'
												: 'text-slate-400 hover:bg-white/5 hover:text-white',
										)}>
										<span
											aria-hidden
											className={cn(
												'size-1.5 shrink-0 rounded-full',
												entry.built ? 'bg-brand' : 'bg-white/25',
											)}
										/>
										{entry.name}
									</Link>
								</li>
							)
						})}
					</ul>
				</div>
			))}
		</nav>
	)
}
