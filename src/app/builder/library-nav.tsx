'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, SlidersHorizontal } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { LOCAL_SITE_ID } from '@/lib/builder/site-ids'
import type { Template } from '@/lib/builder/page-schema'
import { AccountMenu } from './account-menu'
import { BackgroundDrawer } from './background-drawer'
import { readBackground, writeBackground } from './background-settings'
import { readSettings } from './theme-settings'
import { PagesNav } from './pages-nav'

type NavGroup = {
	id: string
	label: string
	kind: 'section' | 'template'
	entries: { slug: string; name: string; built: boolean }[]
}

const tabClass =
	'flex-1 rounded-none border-0 border-b-2 border-transparent bg-transparent pb-2 text-sm font-medium text-slate-400 data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none'

export function LibraryNav({
	groups,
	templates,
	signedIn = false,
	email = null,
}: {
	groups: NavGroup[]
	templates: Template[]
	signedIn?: boolean
	email?: string | null
}) {
	const pathname = usePathname()
	const router = useRouter()
	const params = useSearchParams()
	const navRef = useRef<HTMLElement>(null)
	// Viewport and theme carry across sections; the variant is per entry, so it does not.
	const carried = new URLSearchParams(params.toString())
	carried.delete('v')
	const search = carried.toString()
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

	const sections = groups.filter((group) => group.kind === 'section')
	const onPages =
		pathname.startsWith('/builder/pages') ||
		pathname.startsWith('/builder/sites')
	const openSite = pathname.match(/^\/builder\/sites\/[^/]+/)?.[0]
	// Stay inside whichever site is open. Otherwise the projects list, but only
	// when there is an account to show it for: signed out goes to the builder.
	const pagesHref = openSite
		? `${openSite}/pages`
		: signedIn
			? '/account/projects'
			: `/builder/sites/${LOCAL_SITE_ID}/pages`
	const [settingsSlug, setSettingsSlug] = useState<string | null>(null)

	const renderGroups = (list: NavGroup[], showLabels: boolean) =>
		list.map((group) => (
			<div key={group.id}>
				{showLabels && (
					<p className='px-2 text-xs font-semibold uppercase tracking-widest text-slate-500'>
						{group.label}
					</p>
				)}
				<ul className={cn('space-y-0.5', showLabels && 'mt-2')}>
					{group.entries.map((entry) => {
						const href = `/builder/${entry.slug}`
						const active = pathname === href

						return (
							<li
								key={entry.slug}
								className={cn(
									'group flex items-center rounded-md pr-1 transition-colors',
									active ? 'bg-brand/10' : 'hover:bg-white/5',
								)}>
								<Link
									href={`${href}${query}`}
									data-active={active}
									aria-current={active ? 'page' : undefined}
									className={cn(
										'flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-sm transition-colors',
										active ? 'text-white' : 'text-slate-400 hover:text-white',
									)}>
									<span
										aria-hidden
										className={cn(
											'size-1.5 shrink-0 rounded-full',
											entry.built ? 'bg-brand' : 'bg-white/25',
										)}
									/>
									<span className='truncate'>{entry.name}</span>
								</Link>
								<button
									type='button'
									onClick={() => setSettingsSlug(entry.slug)}
									aria-label={`${entry.name} settings`}
									className='flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 opacity-0 transition-all hover:bg-white/5 hover:text-white focus-visible:opacity-100 group-hover:opacity-100'>
									<SlidersHorizontal className='size-3.5' />
								</button>
							</li>
						)
					})}
				</ul>
			</div>
		))

	// Inside a project the sidebar is the editor and nothing else. The section
	// library is a shop window for the public site, not a tool you work in.
	if (openSite)
		return (
			<nav aria-label='Builder' className='flex min-h-0 flex-1 flex-col'>
				<div className='border-b border-white/10 px-4 py-3'>
					<Link
						href={
							signedIn
								? `/account/projects/${openSite.split('/').pop()}`
								: '/builder'
						}
						className='flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white'>
						<ChevronLeft className='size-4 shrink-0' />
						{signedIn ? 'Project' : 'Section library'}
					</Link>
				</div>

				<div className='flex min-h-0 flex-1 flex-col pt-4'>
					<PagesNav templates={templates} signedIn={signedIn} />
				</div>

				<div className='shrink-0 border-t border-white/10 p-2'>
					<AccountMenu email={email} />
				</div>

				<BackgroundDrawer
					slug={settingsSlug ?? ''}
					open={settingsSlug !== null}
					onOpenChange={(next) => !next && setSettingsSlug(null)}
					settings={readBackground(params)}
					theme={readSettings(params)}
					onChange={(next) => {
						const merged = writeBackground(
							new URLSearchParams(params.toString()),
							next,
						)
						router.replace(`${pathname}?${merged.toString()}`, {
							scroll: false,
						})
					}}
				/>
			</nav>
		)

	return (
		<nav
			ref={navRef}
			aria-label='Section library'
			className='flex min-h-0 flex-1 flex-col'>
			<Tabs
				value={onPages ? 'pages' : 'sections'}
				onValueChange={(value) =>
					router.push(value === 'pages' ? pagesHref : '/builder')
				}
				className='flex min-h-0 flex-1 flex-col gap-0'>
				<TabsList className='h-auto w-full shrink-0 gap-4 rounded-none border-b border-white/10 bg-transparent px-4 pt-4'>
					<TabsTrigger value='sections' className={tabClass}>
						Sections
					</TabsTrigger>
					{/* Signed in, "the builder" is a project in the backend, not a tab. */}
					{!signedIn && (
						<TabsTrigger value='pages' className={tabClass}>
							Builder
						</TabsTrigger>
					)}
				</TabsList>

				<TabsContent value='sections' className='min-h-0 flex-1'>
					<ScrollArea className='h-full'>
						<div className='space-y-6 p-4'>{renderGroups(sections, true)}</div>
					</ScrollArea>
				</TabsContent>
				{!signedIn && (
					<TabsContent
						value='pages'
						className='flex min-h-0 flex-1 flex-col pt-4'>
						<PagesNav templates={templates} signedIn={signedIn} />
					</TabsContent>
				)}
			</Tabs>

			<div className='shrink-0 border-t border-white/10 p-2'>
				<AccountMenu email={email} />
			</div>

			<BackgroundDrawer
				slug={settingsSlug ?? ''}
				open={settingsSlug !== null}
				onOpenChange={(next) => !next && setSettingsSlug(null)}
				settings={readBackground(params)}
				theme={readSettings(params)}
				onChange={(next) => {
					const merged = writeBackground(
						new URLSearchParams(params.toString()),
						next,
					)
					router.replace(`${pathname}?${merged.toString()}`, { scroll: false })
				}}
			/>
		</nav>
	)
}
