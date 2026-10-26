'use client'

import Link from 'next/link'
import { ArrowRight, Clock, Mail, MapIcon, MapPin, Phone } from 'lucide-react'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DesktopMenu, MobileMenu, type SheetLink } from '@/components/built-menu'
import { cn } from '@/lib/utils'
import { chromeHref } from '@/lib/builder/links'
import { HOME_SLUG, type Chrome, type MenuItem } from '@/lib/builder/page-schema'
import { phoneHref, type BusinessContact } from '@/lib/builder/site-profile'

export type NavPage = { id: string; name: string; slug: string }

/** Who the site belongs to. Without it (template thumbnails) the kit's own wordmark shows. */
export type SiteBrand = {
	name: string
	logo?: string | null
	logoAlt?: string
	/** The line under the logo in the footer. */
	tagline?: string
	/** The bare host, for the footer's last line. */
	host?: string
	/** How to reach the business: the footer's Contact column and the phone in the mobile menu. */
	contact?: BusinessContact
}

/** The site's logo, or its name set as a wordmark when there is no logo. */
function BrandMark({
	brand,
	href,
	size = 'md',
}: {
	brand?: SiteBrand
	href: string
	size?: 'sm' | 'md'
}) {
	if (!brand) return <Wordmark href={href} size={size === 'sm' ? 'sm' : undefined} />
	// Shrinks before anything else in a crowded row, so a long name never pushes the header wider.
	return (
		<Link href={href} className='flex min-w-0 items-center'>
			{brand.logo ? (
				// eslint-disable-next-line @next/next/no-img-element -- the site's own upload, any host
				<img
					src={brand.logo}
					alt={brand.logoAlt || brand.name}
					className={cn(
						'w-auto min-w-0 max-w-full object-contain',
						size === 'sm' ? 'h-7' : 'h-9',
					)}
				/>
			) : (
				<span
					className={cn(
						'truncate font-display font-semibold tracking-tight text-white',
						size === 'sm' ? 'text-base' : 'text-lg',
					)}>
					{brand.name}
				</span>
			)}
		</Link>
	)
}

type ChromeProps = {
	brand?: SiteBrand
	pages: NavPage[]
	chrome: Chrome
	current?: string
	/** What page links sit under: '' on a live site, `/preview/<id>` or `/p/<token>` elsewhere. */
	linkBase?: string
	/** Overrides the configured call to action, for the builder's own controls. */
	action?: { label: string; href: string }
	/**
	 * Rendered in the builder canvas, where an empty navigation explains itself. Defaults
	 * to on when no link base is given, which only the canvas does.
	 */
	editing?: boolean
}

/** The header button, resolved. "No link" goes home, as it always has; no text, no button. */
function ctaOf(
	chrome: Chrome,
	linkBase: string,
	action?: { label: string; href: string },
): SheetLink | null {
	const label = action?.label ?? chrome.ctaLabel
	if (!label) return null
	return {
		label,
		href: action?.href ?? chromeHref(linkBase, chrome.ctaHref || HOME_SLUG),
	}
}

/**
 * The header navigation: the menu the site built for itself, or, while it has none, the
 * pages that are set to show in the header, as plain links.
 */
function navItems(chrome: Chrome, pages: NavPage[]): MenuItem[] {
	const menu = Array.isArray(chrome.menu) ? chrome.menu : []
	if (menu.length > 0) return menu
	return pages.map((page) => ({
		id: page.id,
		label: page.name,
		href: page.slug,
		links: [],
		style: 'mega',
		promo: null,
	}))
}

const telDigits = (href: string) =>
	href.trim().startsWith('tel:') ? href.replace(/\D/g, '') : ''

// One number written with or without its country code.
const sameNumber = (a: string, b: string) =>
	a.length >= 7 && b.length >= 7 && (a.endsWith(b) || b.endsWith(a))

/** The business phone for the mobile sheet, unless the menu or the button already calls it. */
function sheetPhone(
	brand: SiteBrand | undefined,
	items: MenuItem[],
	cta: SheetLink | null,
): SheetLink | null {
	const label = brand?.contact?.phone?.trim() ?? ''
	const href = label ? phoneHref(label) : ''
	if (!href) return null
	const number = telDigits(href)
	const called = [
		cta?.href ?? '',
		...items.flatMap((item) => [
			item.href,
			...(item.links ?? []).map((link) => link.href),
		]),
	].some((other) => sameNumber(number, telDigits(other ?? '')))
	return called ? null : { label, href }
}

// Painted by the header's surface CSS instead of the header itself: it is clipped (a
// pattern cannot spill out) while the mega panel below still can, and on the floating
// header it fills the pill rather than the strip around it.
const surfaceLayer = (
	<span
		data-surface-layer
		aria-hidden
		className='pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]'
	/>
)

export function BuiltHeader({
	pages,
	chrome,
	current,
	linkBase: base,
	action,
	brand,
	editing,
}: ChromeProps) {
	if (chrome.header === 'none') return null

	const linkBase = base ?? '/preview'
	const home = chromeHref(linkBase, HOME_SLUG)
	const items = navItems(chrome, pages)
	const cta = ctaOf(chrome, linkBase, action)
	const phone = sheetPhone(brand, items, cta)
	const hints = editing ?? base === undefined

	// data-surface lets the shared background CSS paint this exactly like the kit's header.
	const shell = 'z-50 backdrop-blur-md'
	const edge = 'border-white/10'

	const desktop =
		items.length > 0 ? (
			<DesktopMenu items={items} current={current} linkBase={linkBase} />
		) : hints ? (
			<span className='hidden text-sm text-slate-500 lg:inline'>
				No pages are set to show in the header
			</span>
		) : null

	// Phones get the button inside the sheet instead, so the bar always fits.
	const actions = (
		<div className='flex shrink-0 items-center gap-2'>
			{cta && (
				<Button
					asChild
					className='hidden whitespace-nowrap bg-brand font-bold text-ink hover:bg-brand-strong sm:inline-flex'>
					<Link href={cta.href}>{cta.label}</Link>
				</Button>
			)}
			<MobileMenu
				items={items}
				current={current}
				linkBase={linkBase}
				cta={cta}
				phone={phone}
			/>
		</div>
	)

	if (chrome.header === 'floating') {
		return (
			<header
				data-surface='header'
				className='sticky top-0 z-50 px-6 pt-4 sm:px-10 lg:px-16'>
				<nav
					aria-label='Main'
					className={cn(
						'relative isolate mx-auto w-full max-w-[var(--content-max,72rem)] rounded-full border px-5 py-2.5 shadow-[0_8px_32px_-12px_color-mix(in_srgb,var(--shadow-ink,#000)_60%,transparent)]',
						shell,
						edge,
					)}>
					{surfaceLayer}
					{/* Relative, so a menu panel is exactly as wide as this row. */}
					<div className='relative flex items-center justify-between gap-6'>
						<BrandMark brand={brand} href={home} size='sm' />
						{desktop}
						{actions}
					</div>
				</nav>
			</header>
		)
	}

	if (chrome.header === 'stacked') {
		return (
			<header
				data-surface='header'
				className={cn('sticky top-0 isolate border-b', shell, edge)}>
				{surfaceLayer}
				{/* Gutters sit outside the measure, as they do on a section, so both
				    rows start where the page content starts. */}
				<div className='px-6 sm:px-10 lg:px-16'>
					<div className='mx-auto flex w-full max-w-[var(--content-max,72rem)] items-center justify-between gap-6 py-3'>
						<BrandMark brand={brand} href={home} />
						{actions}
					</div>
				</div>
				{/* Below lg the sheet button in the first row carries the navigation. */}
				{desktop && (
					<nav
						aria-label='Main'
						className={cn('hidden border-t px-6 sm:px-10 lg:block lg:px-16', edge)}>
						<div className='relative mx-auto flex w-full max-w-[var(--content-max,72rem)] justify-center py-1'>
							{desktop}
						</div>
					</nav>
				)}
			</header>
		)
	}

	return (
		<header
			data-surface='header'
			className={cn(
				'sticky top-0 isolate border-b px-6 sm:px-10 lg:px-16',
				shell,
				edge,
			)}>
			{surfaceLayer}
			<nav
				aria-label='Main'
				className='relative mx-auto flex w-full max-w-[var(--content-max,72rem)] items-center justify-between gap-6 py-3'>
				<BrandMark brand={brand} href={home} />
				{desktop}
				{actions}
			</nav>
		</header>
	)
}

const listed = (parts: string[]) =>
	parts.length < 2
		? (parts[0] ?? '')
		: `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

/** The Contact column's lines, or nothing when the business has none of them. */
function contactOf(brand?: SiteBrand) {
	const contact = brand?.contact
	if (!contact) return null
	const lines = (value: unknown) =>
		Array.isArray(value)
			? value.filter((line): line is string => typeof line === 'string' && line.trim() !== '')
			: []
	const phone = contact.phone?.trim() ?? ''
	const email = contact.email?.trim() ?? ''
	const address = contact.address?.trim() ?? ''
	const hours = lines(contact.hours)
	const areas = lines(contact.areas)
	if (!phone && !email && !address && hours.length === 0 && areas.length === 0)
		return null
	return { phone, tel: phoneHref(phone), email, address, hours, areas }
}

export function BuiltFooter({
	pages,
	chrome,
	linkBase = '/preview',
	brand,
}: ChromeProps) {
	if (chrome.footer === 'none') return null

	const design = chrome.footer
	const edge = 'border-white/10'
	const cta = ctaOf(chrome, linkBase)
	// The icon says where the button goes: a call, an email, or a page.
	const CtaIcon = cta?.href.startsWith('tel:')
		? Phone
		: cta?.href.startsWith('mailto:')
			? Mail
			: null
	const contact = chrome.footerDetails === true ? contactOf(brand) : null

	const brandBlock = (
		<div>
			<BrandMark brand={brand} href={chromeHref(linkBase, HOME_SLUG)} size='sm' />
			{(!brand || brand.tagline) && (
				<p
					className={cn(
						'mt-4 leading-7 text-slate-400',
						design === 'centered' ? 'mx-auto max-w-md' : 'max-w-xs',
					)}>
					{brand ? brand.tagline : 'This footer belongs to the site you are building.'}
				</p>
			)}
			{cta && (
				<Button
					asChild
					variant='outline'
					className={cn(
						'mt-6 bg-transparent text-slate-200 hover:bg-white/5',
						edge,
					)}>
					<Link href={cta.href}>
						{CtaIcon ? (
							<>
								<CtaIcon /> {cta.label}
							</>
						) : (
							<>
								{cta.label} <ArrowRight />
							</>
						)}
					</Link>
				</Button>
			)}
		</div>
	)

	const heading = cn(
		'font-display text-sm font-semibold text-white',
		design === 'split' && cn('border-t pt-4', edge),
	)

	// The pages fill up to three columns, or two beside the Contact column.
	const chunks: NavPage[][] = []
	const size = Math.max(1, Math.ceil(pages.length / (contact ? 2 : 3)))
	for (let i = 0; i < pages.length; i += size)
		chunks.push(pages.slice(i, i + size))
	if (chunks.length === 0) chunks.push([])

	const linkColumns = chunks.map((chunk, index) => (
		<div key={index}>
			<p className={heading}>{index === 0 ? 'Pages' : ' '}</p>
			<ul className='mt-4 space-y-3'>
				{chunk.map((page) => (
					<li key={page.id}>
						<Link
							href={chromeHref(linkBase, page.slug)}
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

	const line = cn('flex gap-2.5', design === 'centered' && 'justify-center')
	const icon = 'mt-1 size-4 shrink-0 text-slate-500'
	const contactColumn = contact && (
		<div data-footer-contact>
			<p className={heading}>Contact</p>
			<ul className='mt-4 space-y-3 text-slate-400'>
				{contact.phone && (
					<li className={line}>
						<Phone aria-hidden className={icon} />
						{contact.tel ? (
							<a
								href={contact.tel}
								className='transition-colors hover:text-white'>
								{contact.phone}
							</a>
						) : (
							<span>{contact.phone}</span>
						)}
					</li>
				)}
				{contact.email && (
					<li className={line}>
						<Mail aria-hidden className={icon} />
						<a
							href={`mailto:${contact.email}`}
							className='min-w-0 wrap-anywhere transition-colors hover:text-white'>
							{contact.email}
						</a>
					</li>
				)}
				{contact.address && (
					<li className={line}>
						<MapPin aria-hidden className={icon} />
						<span>{contact.address}</span>
					</li>
				)}
				{contact.hours.length > 0 && (
					<li className={line}>
						<Clock aria-hidden className={icon} />
						<span>
							{contact.hours.map((hours, index) => (
								<span key={index} className='block'>
									{hours}
								</span>
							))}
						</span>
					</li>
				)}
				{contact.areas.length > 0 && (
					<li className={line}>
						<MapIcon aria-hidden className={icon} />
						<span>Serving {listed(contact.areas)}</span>
					</li>
				)}
			</ul>
		</div>
	)

	const legal = (
		<div
			className={cn(
				'flex flex-col gap-2 text-sm text-slate-500',
				design === 'centered'
					? 'items-center'
					: 'sm:flex-row sm:items-center sm:justify-between',
			)}>
			<p>
				© {new Date().getFullYear()} {brand?.name ?? 'Your Company'}. All rights reserved.
			</p>
			{(brand ? brand.host : 'yoursite.com') && <p>{brand ? brand.host : 'yoursite.com'}</p>}
		</div>
	)

	const surface = cn('border-t px-6 py-16 sm:px-10 lg:px-16', edge)

	if (design === 'centered') {
		return (
			<footer data-surface='footer' className={cn(surface, 'text-center')}>
				<div className='mx-auto w-full max-w-[var(--content-max,72rem)]'>
					<div className='flex flex-col items-center'>{brandBlock}</div>
					<div className='mt-12 grid gap-10 sm:grid-cols-3'>
						{linkColumns}
						{contactColumn}
					</div>
					<Separator className={cn('my-10', edge, 'bg-white/10')} />
					{legal}
				</div>
			</footer>
		)
	}

	if (design === 'split') {
		return (
			<footer data-surface='footer' className={surface}>
				<div className='mx-auto grid w-full max-w-[var(--content-max,72rem)] gap-14 lg:grid-cols-[1fr_1.4fr]'>
					{brandBlock}
					<div className='grid gap-8 sm:grid-cols-3'>
						{linkColumns}
						{contactColumn}
					</div>
				</div>
				<div
					className={cn(
						'mx-auto mt-14 w-full max-w-[var(--content-max,72rem)] border-t pt-8',
						edge,
					)}>
					{legal}
				</div>
			</footer>
		)
	}

	return (
		<footer data-surface='footer' className={surface}>
			<div className='mx-auto w-full max-w-[var(--content-max,72rem)]'>
				<div className='grid gap-12 md:grid-cols-[1.5fr_repeat(3,1fr)]'>
					{brandBlock}
					{linkColumns}
					{contactColumn}
				</div>
				<Separator className={cn('my-10', edge, 'bg-white/10')} />
				{legal}
			</div>
		</footer>
	)
}
