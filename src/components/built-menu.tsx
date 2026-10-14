'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, Menu } from 'lucide-react'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { resolveIcon } from '@/lib/builder/icons'
import { resolveMediaSrc } from '@/lib/builder/media-store'
import {
	resolveHref,
	type MenuItem,
	type MenuLink,
	type MenuPromo,
} from '@/lib/builder/page-schema'
import { cn } from '@/lib/utils'

/**
 * The header menu a site builds for itself: plain links, dropdown lists, and the
 * mega panel the section library shows (columns of titled links, plus an optional
 * featured card). The styling matches the library's header so the two read as one.
 */

const panelClass = 'w-full p-3 md:w-full'

const triggerClass =
	'whitespace-nowrap bg-transparent px-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white data-[state=open]:bg-white/5 data-[state=open]:text-white'

const plainLinkClass =
	'inline-flex h-9 items-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus:bg-white/5 focus:text-white'

/** A group with nothing in it would open an empty panel, so it is a plain link. */
const hasLinks = (item: MenuItem) =>
	item.links.some((link) => link.label.trim() !== '')

const visibleLinks = (item: MenuItem) =>
	item.links.filter((link) => link.label.trim() !== '')

function MenuPanelLink({
	link,
	linkBase,
}: {
	link: MenuLink
	linkBase: string
}) {
	const Icon = resolveIcon(link.icon)
	return (
		<NavigationMenuLink asChild>
			<Link
				href={resolveHref(linkBase, link.href)}
				className='flex flex-row items-start gap-3 rounded-lg p-3 transition-colors hover:bg-white/5 focus:bg-white/5'>
				{Icon && (
					<span className='mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-brand/25 bg-brand/10'>
						<Icon className='size-4 text-brand' />
					</span>
				)}
				<span className='space-y-1'>
					<span className='block font-medium text-white'>{link.label}</span>
					{link.description && (
						<span className='block text-sm leading-6 text-slate-400'>
							{link.description}
						</span>
					)}
				</span>
			</Link>
		</NavigationMenuLink>
	)
}

function PromoCard({
	promo,
	linkBase,
}: {
	promo: MenuPromo
	linkBase: string
}) {
	const image = promo.image ? resolveMediaSrc(promo.image) : undefined
	return (
		<NavigationMenuLink asChild>
			<Link
				href={resolveHref(linkBase, promo.href)}
				data-menu-feature
				className='flex h-full flex-col justify-between rounded-lg border border-brand/20 bg-linear-to-br from-brand/15 via-panel to-panel p-5 transition-colors hover:border-brand/45'>
				<div>
					{promo.eyebrow && <p className='eyebrow'>{promo.eyebrow}</p>}
					{promo.title && (
						<p className='mt-3 font-display text-lg font-semibold leading-snug text-white'>
							{promo.title}
						</p>
					)}
					{promo.body && (
						<p className='mt-2 text-sm leading-6 text-slate-400'>
							{promo.body}
						</p>
					)}
				</div>
				{typeof image === 'string' && image && (
					<span className='relative mt-4 block aspect-video overflow-hidden rounded-md border border-white/10'>
						{/* A plain img: the source is the site's own upload, not a fixed host. */}
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={image}
							alt=''
							loading='lazy'
							className='absolute inset-0 size-full object-cover'
						/>
					</span>
				)}
				{promo.ctaLabel && (
					<span className='mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
						{promo.ctaLabel} <ArrowRight className='size-4' />
					</span>
				)}
			</Link>
		</NavigationMenuLink>
	)
}

/** The panel body: links in one or two columns, then the featured card if there is one. */
export function MegaPanel({ item, linkBase }: { item: MenuItem; linkBase: string }) {
	const links = visibleLinks(item)
	const promo =
		item.promo && (item.promo.title || item.promo.body) ? item.promo : null
	// Short lists read better as one column; longer ones split like the library's.
	const split = links.length > 3 ? Math.ceil(links.length / 2) : links.length
	const columns = [links.slice(0, split), links.slice(split)].filter(
		(column) => column.length > 0,
	)

	const layout =
		columns.length === 2
			? promo
				? 'md:grid-cols-[1fr_1fr_17rem]'
				: 'md:grid-cols-2'
			: promo
				? 'md:grid-cols-[1fr_17rem]'
				: 'md:grid-cols-1'

	return (
		<div className={cn('grid gap-2', layout)}>
			{columns.map((column, index) => (
				<ul key={index} className='space-y-1'>
					{column.map((link) => (
						<li key={link.id}>
							<MenuPanelLink link={link} linkBase={linkBase} />
						</li>
					))}
				</ul>
			))}
			{promo && <PromoCard promo={promo} linkBase={linkBase} />}
		</div>
	)
}

// Radix dropdowns are click-only, so the open state follows the pointer to match the
// mega panels. The delay stops the list flickering over the gap below the trigger.
function HoverDropdown({
	item,
	linkBase,
	active,
}: {
	item: MenuItem
	linkBase: string
	active: boolean
}) {
	const [open, setOpen] = useState(false)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const cancelClose = () => {
		if (timer.current) clearTimeout(timer.current)
		timer.current = null
	}
	const scheduleClose = () => {
		cancelClose()
		timer.current = setTimeout(() => setOpen(false), 120)
	}
	useEffect(() => cancelClose, [])

	return (
		<DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
			<DropdownMenuTrigger
				onPointerEnter={() => {
					cancelClose()
					setOpen(true)
				}}
				onPointerLeave={scheduleClose}
				className={cn(
					plainLinkClass,
					'gap-1 data-[state=open]:text-white',
					active && 'text-brand',
				)}>
				{item.label}
				<ChevronDown className='size-3' />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align='start'
				sideOffset={10}
				onPointerEnter={cancelClose}
				onPointerLeave={scheduleClose}
				onCloseAutoFocus={(event) => event.preventDefault()}
				className='w-64 border-white/10 bg-popover'>
				{visibleLinks(item).map((link) => (
					<DropdownMenuItem key={link.id} asChild>
						<Link
							href={resolveHref(linkBase, link.href)}
							className='cursor-pointer text-slate-300 focus:bg-white/5 focus:text-white'>
							{link.label}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

const isCurrent = (href: string, current?: string) =>
	Boolean(current) && href === current

function MobileMenu({
	items,
	current,
	linkBase,
}: {
	items: MenuItem[]
	current?: string
	linkBase: string
}) {
	const [open, setOpen] = useState(false)
	const close = () => setOpen(false)
	const row = 'block py-3 text-base font-medium text-slate-200'

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button
					variant='ghost'
					size='icon'
					aria-label='Open menu'
					className='text-slate-200 hover:bg-white/5 hover:text-white lg:hidden'>
					<Menu />
				</Button>
			</SheetTrigger>
			<SheetContent side='right' className='w-80 overflow-y-auto'>
				<SheetHeader>
					<SheetTitle>Menu</SheetTitle>
				</SheetHeader>
				<div className='px-4 pb-6'>
					<Accordion type='multiple'>
						{items.map((item) =>
							hasLinks(item) ? (
								<AccordionItem
									key={item.id}
									value={item.id}
									className='border-white/10'>
									<AccordionTrigger className='py-3 text-base font-medium text-slate-200 hover:no-underline'>
										{item.label}
									</AccordionTrigger>
									<AccordionContent>
										<ul className='space-y-1 pb-2'>
											{visibleLinks(item).map((link) => (
												<li key={link.id}>
													<Link
														href={resolveHref(linkBase, link.href)}
														onClick={close}
														className='block rounded-md px-2 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white'>
														{link.label}
														{link.description && (
															<span className='block text-xs text-slate-500'>
																{link.description}
															</span>
														)}
													</Link>
												</li>
											))}
										</ul>
									</AccordionContent>
								</AccordionItem>
							) : (
								<div key={item.id} className='border-b border-white/10'>
									<Link
										href={resolveHref(linkBase, item.href)}
										onClick={close}
										aria-current={
											isCurrent(item.href, current) ? 'page' : undefined
										}
										className={row}>
										{item.label}
									</Link>
								</div>
							),
						)}
					</Accordion>
				</div>
			</SheetContent>
		</Sheet>
	)
}

export function BuiltMenu({
	items,
	current,
	linkBase,
}: {
	items: MenuItem[]
	current?: string
	linkBase: string
}) {
	// An item with no label is a half-finished row in the editor, not a nav entry.
	const shown = items.filter((item) => item.label.trim() !== '')

	return (
		<>
			<NavigationMenu className='static hidden lg:block'>
				<NavigationMenuList className='gap-0'>
					{shown.map((item) => {
						const grouped = hasLinks(item)
						const active = grouped
							? item.links.some((link) => isCurrent(link.href, current))
							: isCurrent(item.href, current)

						if (!grouped)
							return (
								<NavigationMenuItem key={item.id}>
									<NavigationMenuLink asChild>
										<Link
											href={resolveHref(linkBase, item.href)}
											aria-current={active ? 'page' : undefined}
											className={cn(plainLinkClass, active && 'text-brand')}>
											{item.label}
										</Link>
									</NavigationMenuLink>
								</NavigationMenuItem>
							)

						if (item.style === 'dropdown')
							return (
								<NavigationMenuItem key={item.id}>
									<HoverDropdown
										item={item}
										linkBase={linkBase}
										active={active}
									/>
								</NavigationMenuItem>
							)

						return (
							<NavigationMenuItem key={item.id}>
								<NavigationMenuTrigger
									className={cn(triggerClass, active && 'text-brand')}>
									{item.label}
								</NavigationMenuTrigger>
								<NavigationMenuContent className={panelClass}>
									<MegaPanel item={item} linkBase={linkBase} />
								</NavigationMenuContent>
							</NavigationMenuItem>
						)
					})}
				</NavigationMenuList>
			</NavigationMenu>

			<MobileMenu items={shown} current={current} linkBase={linkBase} />
		</>
	)
}
