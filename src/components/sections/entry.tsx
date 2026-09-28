import Image from 'next/image'
import Link from 'next/link'
import {
	ArrowLeft,
	ArrowRight,
	ChevronRight,
	type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'
import {
	ActionRow,
	StatFigure,
	type Action,
	type IconPlacement,
	type IconSide,
} from './primitives'

// Positions are percentages of the primary card, so the cluster scales with it.
// Tiles stay fully opaque and are shaded with brightness instead, so each one reads
// as a solid screenshot; the shadow is what separates the layers.
// `z` sets the stacking order explicitly; the primary card sits above all of them.
const backdropLayouts = [
	{
		// Left edge is fixed; the extra width extends it to the right.
		// Lifted 36px: one grid line plus a half square.
		left: 'calc(45% - 88px)',
		top: 'calc(-24% - 36px)',
		width: 'calc(71% + 88px)',
		height: 'calc(55% + 44px)',
		z: 2,
		brightness: 0.86,
		shadow: '0 20px 45px -12px rgba(0,0,0,0.85)',
	},
	{
		left: '100%',
		top: 'calc(-70% + 22px)',
		width: '36%',
		height: '75%',
		z: 1,
		brightness: 0.72,
		shadow: '0 24px 50px -14px rgba(0,0,0,0.88)',
	},
	{
		// 16:9 (width % equals height % on a 16:9 parent). Right edge stays at 148%.
		left: '80%',
		top: '6%',
		width: '68%',
		height: '68%',
		z: 3,
		brightness: 0.66,
		shadow: '0 26px 55px -16px rgba(0,0,0,0.9)',
	},
	{
		left: '41%',
		top: '69%',
		width: '79%',
		height: '64%',
		z: 4,
		brightness: 0.58,
		shadow: '0 28px 60px -16px rgba(0,0,0,0.92)',
	},
	{
		// Nudged up and left by 1.5 hero-grid squares (66px).
		left: 'calc(104% - 66px)',
		top: 'calc(72% - 66px)',
		width: '45%',
		height: '73%',
		z: 5,
		brightness: 0.5,
		shadow: '0 30px 65px -18px rgba(0,0,0,0.94)',
	},
]

export function SplitHero({
	eyebrow = 'Eyebrow Badge',
	title = 'This is the split hero heading',
	description = 'This is the split hero description. Copy sits on one side and the product shot sits on the other, for pages where the work itself is the argument.',
	actions = [
		{ label: 'Primary Button', href: '/contact', icon: ArrowRight },
		{ label: 'Secondary Button', href: '/case-studies' },
	],
	media,
	mediaSrc,
	mediaLabel = 'Main Image',
	backdrop = [],
	variant = 'split',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	actions?: Action[]
	media?: React.ReactNode
	mediaSrc?: string
	mediaLabel?: string
	/** Slot images, in the order of backdropLayouts. Empty slots render numbered placeholders. */
	backdrop?: string[]
	/** Which side the media sits on. The copy takes the other side and aligns to it. */
	variant?: 'split' | 'reversed'
}) {
	const mediaLeft = variant === 'reversed'

	return (
		<section className='relative overflow-hidden px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pb-24 lg:pt-44'>
			<div className='mx-auto grid w-full max-w-[var(--content-max,72rem)] items-center gap-14 lg:grid-cols-2'>
				<div
					className={cn(
						'text-center sm:text-left',
						mediaLeft && 'lg:order-2 lg:text-right',
					)}>
					<Badge className='uppercase tracking-widest'>{eyebrow}</Badge>
					<h1 className='mt-6 font-display text-4xl font-semibold leading-[1.08] text-white sm:text-5xl'>
						{title}
					</h1>
					<p className='mt-6 text-lg leading-8 text-slate-300'>{description}</p>
					<ActionRow
						actions={actions}
						className={cn('mt-9', mediaLeft && 'lg:justify-end')}
					/>
				</div>

				{/* Backdrop tiles sit behind the primary and are clipped by the section where they bleed.
				    The wrapper matches the primary card's box, so tile percentages are unchanged and
				    the whole cluster scales as one piece rather than each tile individually. */}
				<div
					className={cn(
						'relative mx-4 mb-12 mt-16 sm:mx-10 lg:mx-6 lg:my-0',
						mediaLeft && 'lg:order-1',
					)}>
					<div className='absolute inset-0 z-0 hidden scale-85 sm:block lg:scale-100'>
						{backdropLayouts.map((layout, index) => {
							const { brightness, shadow, z, ...position } = layout
							const src = backdrop[index]
							return (
								<div
									key={index}
									aria-hidden
									className='absolute flex items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-panel'
									style={{ ...position, zIndex: z, boxShadow: shadow }}>
									{src ? (
										<Image
											src={src}
											alt=''
											fill
											sizes='(min-width: 1024px) 22rem, 45vw'
											className='object-cover'
											style={{ filter: `brightness(${brightness})` }}
										/>
									) : (
										<span className='font-display text-sm font-semibold uppercase tracking-widest text-slate-400'>
											Image {index + 1}
										</span>
									)}
								</div>
							)
						})}
					</div>

					<GlassCard className='relative z-10 flex aspect-video w-full items-center justify-center overflow-hidden shadow-[0_32px_70px_-16px_rgba(0,0,0,0.95)]'>
						{media ??
							(mediaSrc ? (
								<Image
									src={mediaSrc}
									alt=''
									fill
									sizes='(min-width: 1024px) 32rem, 90vw'
									priority
									className='object-cover'
								/>
							) : (
								<span className='font-display text-base font-semibold uppercase tracking-widest text-slate-300'>
									{mediaLabel}
								</span>
							))}
					</GlassCard>
				</div>
			</div>
		</section>
	)
}

export function StatHero({
	eyebrow = 'Eyebrow Badge',
	title = 'This is the stat hero heading',
	description = 'This is the stat hero description. It leads with outcomes rather than claims, so the numbers carry the opening.',
	stats = [
		{
			value: '01',
			label: 'This is a stat label describing the number above it',
		},
		{ value: '02', label: 'Three or four reads best across a full-width row' },
		{ value: '03', label: 'Keep each value short so the row stays scannable' },
		{
			value: '04',
			label: 'The fourth is optional and drops off on smaller screens',
		},
	],
	showLink = true,
	linkLabel = 'See What All The Hype Is About',
	linkHref = '/case-studies',
	linkIcon: LinkIcon = ArrowRight,
	linkIconPosition = 'after',
	variant = 'cards',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	stats?: {
		value: string
		label: string
		icon?: LucideIcon
		iconPosition?: IconPlacement
	}[]
	/** Turn the closing link off without clearing its text. */
	showLink?: boolean
	linkLabel?: string | null
	linkHref?: string
	linkIcon?: LucideIcon
	linkIconPosition?: IconSide
	/** How the stat row is drawn against the copy. */
	variant?: 'cards' | 'divided' | 'centered'
}) {
	const centered = variant === 'centered'

	return (
		<section className='px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pb-20 lg:pt-44'>
			<div
				className={cn(
					'mx-auto w-full max-w-[var(--content-max,72rem)]',
					centered ? 'text-center' : 'text-center sm:text-left',
				)}>
				<Badge className='uppercase tracking-widest'>{eyebrow}</Badge>
				<h1
					className={cn(
						'mx-auto mt-6 max-w-4xl font-display text-4xl font-semibold leading-[1.08] text-white sm:text-6xl',
						!centered && 'sm:mx-0',
					)}>
					{title}
				</h1>
				<p
					className={cn(
						'mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300',
						!centered && 'sm:mx-0',
					)}>
					{description}
				</p>
				<dl
					className={cn(
						'mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4',
						variant === 'divided' &&
							'gap-0 divide-y divide-white/10 border-y border-white/10 sm:divide-x sm:divide-y-0',
					)}>
					{stats.map((stat, index) => {
						const figure = (
							<StatFigure
								value={stat.value}
								label={stat.label}
								icon={stat.icon}
								iconPosition={stat.iconPosition}
								valueClassName='font-display text-4xl font-semibold text-brand'
								labelClassName='mt-3 text-sm leading-6 text-slate-400'
							/>
						)
						return variant === 'cards' ? (
							<GlassCard key={`${stat.label}-${index}`} className='p-7'>
								{figure}
							</GlassCard>
						) : (
							<div
								key={`${stat.label}-${index}`}
								className={cn('p-7', centered && 'text-center')}>
								{figure}
							</div>
						)
					})}
				</dl>

				{showLink && linkLabel && (
					<Link
						href={linkHref || '#'}
						className='mt-10 inline-flex items-center gap-2 text-sm font-semibold text-brand transition-colors hover:text-brand-strong'>
						{LinkIcon && linkIconPosition === 'before' && (
							<LinkIcon className='size-4' />
						)}
						{linkLabel}
						{LinkIcon && linkIconPosition !== 'before' && (
							<LinkIcon className='size-4' />
						)}
					</Link>
				)}
			</div>
		</section>
	)
}

export function Breadcrumbs({
	items = [
		{ label: 'Home', href: '/' },
		{ label: 'Parent Page', href: '/services' },
		{ label: 'This Is The Current Page' },
	],
	align = 'left',
	variant = 'chevron',
	className,
}: {
	items?: { label: string; href?: string }[]
	/** Where the trail sits across the section. */
	align?: 'left' | 'center' | 'right'
	variant?: 'chevron' | 'slash' | 'pill'
	className?: string
}) {
	const parent = [...items].reverse().find((item) => item.href)
	const justify = cn(
		align === 'center' && 'justify-center',
		align === 'right' && 'justify-end',
	)

	// A back link rather than a trail, for deep pages on small screens.
	if (variant === 'pill') {
		return (
			<nav aria-label='Breadcrumb' className={className}>
				<ol className={cn('flex flex-wrap items-center gap-2', justify)}>
					{parent && (
						<li>
							<Link
								href={parent.href ?? '/'}
								className='flex items-center gap-1.5 rounded-full border border-white/12 bg-white/4 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-brand/40 hover:text-white'>
								<ArrowLeft className='size-3.5' />
								{parent.label}
							</Link>
						</li>
					)}
					<li>
						<span
							aria-current='page'
							className='rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand'>
							{items[items.length - 1]?.label}
						</span>
					</li>
				</ol>
			</nav>
		)
	}

	// Quieter than the chevron trail; sits well directly above a long headline.
	if (variant === 'slash') {
		return (
			<nav aria-label='Breadcrumb' className={className}>
				<ol
					className={cn(
						'flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-slate-600',
						justify,
					)}>
					{items.map((item, index) => {
						const last = index === items.length - 1
						return (
							<li key={index} className='flex items-center gap-2'>
								{item.href && !last ? (
									<Link
										href={item.href}
										className='transition-colors hover:text-brand'>
										{item.label}
									</Link>
								) : (
									<span aria-current='page' className='text-slate-300'>
										{item.label}
									</span>
								)}
								{!last && <span aria-hidden>/</span>}
							</li>
						)
					})}
				</ol>
			</nav>
		)
	}

	return (
		<nav aria-label='Breadcrumb' className={className}>
			<ol
				className={cn(
					'flex flex-wrap items-center gap-1.5 text-sm text-slate-500',
					justify,
				)}>
				{items.map((item, index) => {
					const last = index === items.length - 1
					return (
							<li key={index} className='flex items-center gap-1.5'>
							{item.href && !last ? (
								<Link
									href={item.href}
									className='transition-colors hover:text-white'>
									{item.label}
								</Link>
							) : (
								<span
									aria-current={last ? 'page' : undefined}
									className='text-slate-300'>
									{item.label}
								</span>
							)}
							{!last && <ChevronRight className='size-3.5 shrink-0' />}
						</li>
					)
				})}
			</ol>
		</nav>
	)
}
