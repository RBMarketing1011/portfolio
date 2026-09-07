import Link from 'next/link'
import { ArrowRight, Check, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

export function Section({
	id,
	className,
	children,
}: {
	id?: string
	className?: string
	children: React.ReactNode
}) {
	return (
		<section
			id={id}
			className={cn('px-6 py-20 sm:px-10 lg:px-16 lg:py-28', className)}>
			<div className='mx-auto max-w-6xl'>{children}</div>
		</section>
	)
}

export function SectionHeading({
	eyebrow,
	title,
	description,
	align = 'left',
	variant = 'stacked',
}: {
	eyebrow?: string
	/** Accepts markup so part of the title can be wrapped in <Highlight>. */
	title?: React.ReactNode
	description?: string
	align?: 'left' | 'center'
	variant?: 'stacked' | 'split' | 'rule'
}) {
	// Title left, description right. Fills the width above a wide grid.
	if (variant === 'split') {
		return (
			<div className='grid gap-6 border-b border-white/10 pb-10 lg:grid-cols-2 lg:items-end lg:gap-12'>
				<div>
					{eyebrow && <p className='eyebrow'>{eyebrow}</p>}
					{title && (
						<h2
							className={cn(
								'font-display text-3xl font-semibold leading-tight text-white sm:text-4xl',
								eyebrow && 'mt-4',
							)}>
							{title}
						</h2>
					)}
				</div>
				{description && (
					<p className='text-lg leading-8 text-slate-400 lg:pb-1'>
						{description}
					</p>
				)}
			</div>
		)
	}

	// Centered under a short accent rule, for the opening of a major block.
	if (variant === 'rule') {
		return (
			<div className='mx-auto max-w-3xl text-center'>
				<span
					aria-hidden
					className='mx-auto block h-0.5 w-12 rounded-full bg-brand'
				/>
				{eyebrow && <p className='eyebrow mt-6'>{eyebrow}</p>}
				{title && (
					<h2
						className={cn(
							'font-display text-3xl font-semibold leading-tight text-white sm:text-5xl',
							eyebrow ? 'mt-3' : 'mt-6',
						)}>
						{title}
					</h2>
				)}
				{description && (
					<p className='mt-5 text-lg leading-8 text-slate-400'>{description}</p>
				)}
			</div>
		)
	}

	return (
		<div
			className={cn(
				'max-w-3xl text-center sm:text-left',
				align === 'center' && 'mx-auto sm:text-center',
			)}>
			{eyebrow && <p className='eyebrow'>{eyebrow}</p>}
			{title && (
				<h2
					className={cn(
						'font-display text-3xl font-semibold leading-tight text-white sm:text-4xl',
						eyebrow && 'mt-4',
					)}>
					{title}
				</h2>
			)}
			{description && (
				<p className='mt-5 text-lg leading-8 text-slate-400'>{description}</p>
			)}
		</div>
	)
}

export function PageHero({
	eyebrow = 'Eyebrow Badge',
	title = 'This is the page hero heading, and it runs about this long',
	description = 'This is the hero description. It sits under the heading, holds two or three lines at this width, and explains what the page covers.',
	actions,
	stats,
	children,
	variant = 'left',
}: {
	eyebrow?: string
	/** Accepts markup so part of the headline can be wrapped in <Highlight>. */
	title?: React.ReactNode
	description?: string
	/** First action renders solid, second outlined. */
	actions?: { label: string; href: string }[]
	stats?: { value: string; label: string }[]
	children?: React.ReactNode
	/** How the opening block is aligned. */
	variant?: 'left' | 'centered' | 'compact'
}) {
	const buttons = actions?.slice(0, 2) ?? []
	const figures = stats?.slice(0, 3) ?? []
	const centered = variant === 'centered'

	return (
		<section
			className={cn(
				'px-6 sm:px-10 lg:px-16',
				variant === 'compact'
					? 'pb-10 pt-28 lg:pb-14 lg:pt-32'
					: 'pb-16 pt-36 lg:pb-24 lg:pt-44',
			)}>
			<div
				className={cn(
					'mx-auto max-w-6xl',
					centered ? 'text-center' : 'text-center sm:text-left',
				)}>
				<Badge className='uppercase tracking-widest'>{eyebrow}</Badge>
				<h1
					className={cn(
						'mx-auto mt-6 max-w-4xl font-display font-semibold leading-[1.08] text-white',
						variant === 'compact'
							? 'text-3xl sm:text-4xl'
							: 'text-4xl sm:text-6xl',
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

				{buttons.length > 0 && (
					<div
						className={cn(
							'mt-10 flex flex-col gap-4 sm:flex-row sm:flex-wrap',
							centered && 'sm:justify-center',
						)}>
						{buttons.map((action, index) =>
							index === 0 ? (
								<Button
									key={action.label}
									asChild
									size='lg'
									className='w-full bg-brand font-bold text-ink hover:bg-brand-strong sm:w-auto'>
									<Link href={action.href}>
										{action.label} <ArrowRight />
									</Link>
								</Button>
							) : (
								<Button
									key={action.label}
									asChild
									size='lg'
									variant='outline'
									className='w-full border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white sm:w-auto'>
									<Link href={action.href}>{action.label}</Link>
								</Button>
							),
						)}
					</div>
				)}

				{figures.length > 0 && (
					<dl className='mx-auto mt-16 grid max-w-3xl gap-8 border-t border-white/10 pt-10 sm:mx-0 sm:grid-cols-3'>
						{figures.map((figure) => (
							<div key={figure.label}>
								<dt className='font-display text-2xl font-semibold text-brand'>
									{figure.value}
								</dt>
								<dd className='mt-2 leading-7 text-slate-400'>
									{figure.label}
								</dd>
							</div>
						))}
					</dl>
				)}

				{children}
			</div>
		</section>
	)
}

export function CheckList({
	items = [
		'This is a single check list item',
		'Items run to whatever length they need and wrap onto a second line like this one does',
		'Add as many or as few as the section calls for',
		'The icon can be swapped per instance',
	],
	icon: Icon = Check,
	variant = 'stacked',
}: {
	items?: string[]
	icon?: LucideIcon
	/** How the list is arranged. */
	variant?: 'stacked' | 'columns' | 'inline'
}) {
	return (
		<ul
			className={cn(
				variant === 'stacked' && 'space-y-3',
				variant === 'columns' && 'grid gap-3 sm:grid-cols-2',
				variant === 'inline' && 'flex flex-wrap gap-x-6 gap-y-3',
			)}>
			{items.map((item) => (
				<li key={item} className='flex gap-3 text-slate-300'>
					<Icon className='mt-1 size-4 shrink-0 text-brand' />
					<span className='leading-7'>{item}</span>
				</li>
			))}
		</ul>
	)
}

export function CtaBand({
	title = 'Find out what should actually be built.',
	description = 'Start with an assessment. We walk your business end to end and show you where automation and AI pay off, ranked by what they are worth.',
	actions = [
		{ label: 'Book An Assessment', href: '/contact' },
		{ label: 'See What We Have Built', href: '/case-studies' },
	],
	design = 'card',
}: {
	title?: string
	description?: string
	/** First action renders solid, second outlined. */
	actions?: { label: string; href: string }[]
	/** How the band is framed and where the buttons sit. */
	design?: 'card' | 'centered' | 'split'
}) {
	const buttons = (
		<div
			className={cn(
				'flex flex-col gap-4 sm:flex-row sm:flex-wrap',
				design === 'centered' && 'justify-center',
				design === 'split' ? 'lg:justify-end' : 'mt-9',
			)}>
			{actions.slice(0, 2).map((action, index) =>
				index === 0 ? (
					<Button
						key={action.label}
						asChild
						size='lg'
						className='w-full bg-brand font-bold text-ink hover:bg-brand-strong sm:w-auto'>
						<Link href={action.href}>
							{action.label} <ArrowRight />
						</Link>
					</Button>
				) : (
					<Button
						key={action.label}
						asChild
						size='lg'
						variant='outline'
						className='w-full border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white sm:w-auto'>
						<Link href={action.href}>{action.label}</Link>
					</Button>
				),
			)}
		</div>
	)

	const heading = (
		<h2
			className={cn(
				'max-w-2xl font-display text-3xl font-semibold leading-tight text-white sm:text-4xl',
				design === 'centered' && 'mx-auto',
				design === 'card' && 'mx-auto sm:mx-0',
			)}>
			{title}
		</h2>
	)

	const body = (
		<p
			className={cn(
				'mt-5 max-w-2xl text-lg leading-8 text-slate-300',
				design === 'centered' && 'mx-auto',
				design === 'card' && 'mx-auto sm:mx-0',
			)}>
			{description}
		</p>
	)

	if (design === 'centered') {
		return (
			<Section className='text-center'>
				{heading}
				{body}
				{buttons}
			</Section>
		)
	}

	if (design === 'split') {
		return (
			<Section>
				<GlassCard className='grid items-center gap-8 p-10 sm:p-14 lg:grid-cols-[1.4fr_1fr]'>
					<div>
						{heading}
						{body}
					</div>
					{buttons}
				</GlassCard>
			</Section>
		)
	}

	return (
		<Section>
			<GlassCard
				variant='accent'
				className='p-10 text-center sm:p-14 sm:text-left'>
				{heading}
				{body}
				{buttons}
			</GlassCard>
		</Section>
	)
}
