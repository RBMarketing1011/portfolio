'use client'

import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { pageHref, type Chrome } from '@/lib/builder/page-schema'

export type NavPage = { id: string; name: string; slug: string }

type ChromeProps = {
	pages: NavPage[]
	chrome: Chrome
	current?: string
	linkBase?: string
	/** Overrides the configured call to action, for the builder's own controls. */
	action?: { label: string; href: string }
}

function navLinkClass(active: boolean) {
	return cn(
		'inline-flex h-9 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
		active ? 'text-brand' : 'text-slate-300 hover:text-white',
	)
}

function NavLinks({
	pages,
	current,
	linkBase,
	className,
}: {
	pages: NavPage[]
	current?: string
	linkBase: string
	className?: string
}) {
	if (pages.length === 0) {
		return (
			<span className='text-sm text-slate-500'>
				No pages are set to show in the header
			</span>
		)
	}
	return (
		<div className={cn('flex items-center', className)}>
			{pages.map((page) => (
				<Link
					key={page.id}
					href={pageHref(linkBase, page.slug)}
					aria-current={page.slug === current ? 'page' : undefined}
					className={navLinkClass(page.slug === current)}>
					{page.name}
				</Link>
			))}
		</div>
	)
}

function Cta({
	chrome,
	action,
	linkBase,
}: {
	chrome: Chrome
	action?: { label: string; href: string }
	linkBase: string
}) {
	const label = action?.label ?? chrome.ctaLabel
	if (!label) return null
	const href =
		action?.href ??
		(/^(https?:|mailto:|tel:|#|\/)/.test(chrome.ctaHref)
			? chrome.ctaHref
			: pageHref(linkBase, chrome.ctaHref || '/'))

	return (
		<Button
			asChild
			className='whitespace-nowrap bg-brand font-bold text-ink hover:bg-brand-strong'>
			<Link href={href}>{label}</Link>
		</Button>
	)
}

export function BuiltHeader({
	pages,
	chrome,
	current,
	linkBase = '/preview',
	action,
}: ChromeProps) {
	if (chrome.header === 'none') return null

	// data-surface lets the shared background CSS paint this exactly like the kit's header.
	const shell = 'z-50 backdrop-blur-md'
	const edge = 'border-white/10'
	const cta = <Cta chrome={chrome} action={action} linkBase={linkBase} />

	if (chrome.header === 'floating') {
		return (
			<header
				data-surface='header'
				className='sticky top-0 z-50 px-4 pt-4 sm:px-6 lg:px-10'>
				<nav
					aria-label='Main'
					className={cn(
						'mx-auto flex max-w-7xl items-center justify-between gap-6 rounded-full border px-5 py-2.5 shadow-[0_8px_32px_-12px_rgb(0_0_0/0.6)]',
						shell,
						edge,
					)}>
					<Wordmark href={linkBase} size='sm' />
					<NavLinks pages={pages} current={current} linkBase={linkBase} />
					{cta}
				</nav>
			</header>
		)
	}

	if (chrome.header === 'stacked') {
		return (
			<header
				data-surface='header'
				className={cn('sticky top-0 border-b', shell, edge)}>
				<div className='mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3 sm:px-6 lg:px-10'>
					<Wordmark href={linkBase} />
					{cta}
				</div>
				<nav
					aria-label='Main'
					className={cn('border-t px-4 sm:px-6 lg:px-10', edge)}>
					<div className='mx-auto flex max-w-7xl justify-center py-1'>
						<NavLinks pages={pages} current={current} linkBase={linkBase} />
					</div>
				</nav>
			</header>
		)
	}

	return (
		<header
			data-surface='header'
			className={cn(
				'sticky top-0 border-b px-4 sm:px-6 lg:px-10',
				shell,
				edge,
			)}>
			<nav
				aria-label='Main'
				className='mx-auto flex max-w-7xl items-center justify-between gap-6 py-3'>
				<Wordmark href={linkBase} />
				<NavLinks pages={pages} current={current} linkBase={linkBase} />
				{cta}
			</nav>
		</header>
	)
}

export function BuiltFooter({
	pages,
	chrome,
	linkBase = '/preview',
}: ChromeProps) {
	if (chrome.footer === 'none') return null

	const design = chrome.footer
	const edge = 'border-white/10'

	const brand = (
		<div>
			<Wordmark href={linkBase} size='sm' />
			<p
				className={cn(
					'mt-4 leading-7 text-slate-400',
					design === 'centered' ? 'mx-auto max-w-md' : 'max-w-xs',
				)}>
				This footer belongs to the site you are building.
			</p>
			{chrome.ctaLabel && (
				<Button
					asChild
					variant='outline'
					className={cn(
						'mt-6 bg-transparent text-slate-200 hover:bg-white/5',
						edge,
					)}>
					<Link href={pageHref(linkBase, chrome.ctaHref || '/')}>
						<Mail /> {chrome.ctaLabel}
					</Link>
				</Button>
			)}
		</div>
	)

	// One column per four pages keeps the kit's multi-column shape without inventing headings.
	const chunks: NavPage[][] = []
	const size = Math.max(1, Math.ceil(pages.length / 3))
	for (let i = 0; i < pages.length; i += size)
		chunks.push(pages.slice(i, i + size))
	if (chunks.length === 0) chunks.push([])

	const linkColumns = chunks.map((chunk, index) => (
		<div key={index}>
			<p
				className={cn(
					'font-display text-sm font-semibold text-white',
					design === 'split' && cn('border-t pt-4', edge),
				)}>
				{index === 0 ? 'Pages' : '\u00a0'}
			</p>
			<ul className='mt-4 space-y-3'>
				{chunk.map((page) => (
					<li key={page.id}>
						<Link
							href={pageHref(linkBase, page.slug)}
							className='text-slate-400 transition-colors hover:text-white'>
							{page.name}
						</Link>
					</li>
				))}
				{chunk.length === 0 && (
					<li className='text-sm text-slate-500'>No pages yet</li>
				)}
			</ul>
		</div>
	))

	const legal = (
		<div
			className={cn(
				'flex flex-col gap-2 text-sm text-slate-500',
				design === 'centered'
					? 'items-center'
					: 'sm:flex-row sm:items-center sm:justify-between',
			)}>
			<p>© {new Date().getFullYear()} Your Company. All rights reserved.</p>
			<p>yoursite.com</p>
		</div>
	)

	const surface = cn('border-t px-6 py-16 sm:px-10 lg:px-16', edge)

	if (design === 'centered') {
		return (
			<footer data-surface='footer' className={cn(surface, 'text-center')}>
				<div className='mx-auto max-w-6xl'>
					<div className='flex flex-col items-center'>{brand}</div>
					<div className='mt-12 grid gap-10 sm:grid-cols-3'>{linkColumns}</div>
					<Separator className={cn('my-10', edge, 'bg-white/10')} />
					{legal}
				</div>
			</footer>
		)
	}

	if (design === 'split') {
		return (
			<footer data-surface='footer' className={surface}>
				<div className='mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_1.4fr]'>
					{brand}
					<div className='grid gap-8 sm:grid-cols-3'>{linkColumns}</div>
				</div>
				<div className={cn('mx-auto mt-14 max-w-6xl border-t pt-8', edge)}>
					{legal}
				</div>
			</footer>
		)
	}

	return (
		<footer data-surface='footer' className={surface}>
			<div className='mx-auto max-w-6xl'>
				<div className='grid gap-12 md:grid-cols-[1.5fr_repeat(3,1fr)]'>
					{brand}
					{linkColumns}
				</div>
				<Separator className={cn('my-10', edge, 'bg-white/10')} />
				{legal}
			</div>
		</footer>
	)
}
