import Link from 'next/link'
import { ArrowRight, Check, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

/** Where an icon sits relative to the text it belongs to. */
export type IconSide = 'before' | 'after'
export type IconPlacement = IconSide | 'above' | 'below'

export type ActionStyle = 'primary' | 'outline' | 'secondary' | 'ghost' | 'link'

export type Action = {
	label: string
	href: string
	icon?: LucideIcon
	iconPosition?: IconSide
	/** Omitted actions fall back to solid-first, outlined-second. */
	style?: ActionStyle
}

const ACTION_VARIANT: Record<
	ActionStyle,
	'default' | 'outline' | 'secondary' | 'ghost' | 'link'
> = {
	primary: 'default',
	outline: 'outline',
	secondary: 'secondary',
	ghost: 'ghost',
	link: 'link',
}

const ACTION_CLASS: Record<ActionStyle, string> = {
	primary: 'bg-brand font-bold text-ink hover:bg-brand-strong',
	outline:
		'border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white',
	secondary: '',
	ghost: 'text-slate-100 hover:bg-white/5 hover:text-white',
	link: 'px-0 text-brand hover:text-brand-strong',
}

export function ActionButton({
	action,
	fallbackStyle = 'primary',
	size = 'lg',
	className,
}: {
	action: Action
	fallbackStyle?: ActionStyle
	size?: 'sm' | 'default' | 'lg'
	className?: string
}) {
	const style = action.style ?? fallbackStyle
	const Icon = action.icon
	const before = action.iconPosition === 'before'

	return (
		<Button
			asChild
			size={size}
			variant={ACTION_VARIANT[style]}
			className={cn(ACTION_CLASS[style], className)}>
			<Link href={action.href || '#'}>
				{Icon && before && <Icon />}
				{action.label}
				{Icon && !before && <Icon />}
			</Link>
		</Button>
	)
}

export function ActionRow({
	actions,
	limit = 2,
	className,
}: {
	actions?: Action[]
	limit?: number
	className?: string
}) {
	const buttons = actions?.slice(0, limit) ?? []
	if (buttons.length === 0) return null

	return (
		<div
			className={cn('flex flex-col gap-4 sm:flex-row sm:flex-wrap', className)}>
			{buttons.map((action, index) => (
				<ActionButton
					key={`${action.label}-${index}`}
					action={action}
					fallbackStyle={index === 0 ? 'primary' : 'outline'}
					className='w-full sm:w-auto'
				/>
			))}
		</div>
	)
}

/**
 * One stat. The value and label stay a single group so the icon can sit on any
 * side of the pair, and a side-mounted icon pulls the text to that side.
 */
export function StatFigure({
	value,
	label,
	icon: Icon,
	iconPosition = 'above',
	valueClassName,
	labelClassName,
	className,
}: {
	value?: string
	label?: string
	icon?: LucideIcon
	iconPosition?: IconPlacement
	valueClassName?: string
	labelClassName?: string
	className?: string
}) {
	const copy = (
		<div className='min-w-0'>
			<dt className={valueClassName}>{value}</dt>
			<dd className={labelClassName}>{label}</dd>
		</div>
	)

	if (!Icon) return <div className={className}>{copy}</div>

	const glyph = <Icon className='size-6 shrink-0 text-brand' />

	if (iconPosition === 'before' || iconPosition === 'after') {
		return (
			<div
				className={cn(
					'flex items-start gap-3',
					iconPosition === 'after' && 'flex-row-reverse text-right',
					className,
				)}>
				{glyph}
				{copy}
			</div>
		)
	}

	return (
		<div
			className={cn(
				'flex flex-col gap-3',
				iconPosition === 'below' && 'flex-col-reverse',
				className,
			)}>
			{glyph}
			{copy}
		</div>
	)
}

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
			{/* The fallback is max-w-6xl, so an unthemed page measures as it always did. */}
			<div className='mx-auto w-full max-w-[var(--content-max,72rem)]'>
				{children}
			</div>
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
	/** First action renders solid, second outlined, unless each sets its own style. */
	actions?: Action[]
	stats?: {
		value: string
		label: string
		icon?: LucideIcon
		iconPosition?: IconPlacement
	}[]
	children?: React.ReactNode
	/** How the opening block is aligned. */
	variant?: 'left' | 'centered' | 'compact'
}) {
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
					'mx-auto w-full max-w-[var(--content-max,72rem)]',
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

				<ActionRow
					actions={actions}
					className={cn('mt-10', centered && 'sm:justify-center')}
				/>

				{figures.length > 0 && (
					<dl className='mx-auto mt-16 grid max-w-3xl gap-8 border-t border-white/10 pt-10 sm:mx-0 sm:grid-cols-3'>
						{figures.map((figure, index) => (
							<StatFigure
								key={`${figure.label}-${index}`}
								value={figure.value}
								label={figure.label}
								icon={figure.icon}
								iconPosition={figure.iconPosition}
								valueClassName='font-display text-2xl font-semibold text-brand'
								labelClassName='mt-2 leading-7 text-slate-400'
							/>
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
			{items.map((item, index) => (
				<li key={index} className='flex gap-3 text-slate-300'>
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
		{ label: 'Book An Assessment', href: '/contact', icon: ArrowRight },
		{ label: 'See What We Have Built', href: '/case-studies' },
	],
	design = 'card',
}: {
	title?: string
	description?: string
	/** First action renders solid, second outlined, unless each sets its own style. */
	actions?: Action[]
	/** How the band is framed and where the buttons sit. */
	design?: 'card' | 'centered' | 'split'
}) {
	const buttons = (
		<ActionRow
			actions={actions}
			className={cn(
				design === 'centered' && 'sm:justify-center',
				design === 'split' ? 'lg:justify-end' : 'mt-9',
			)}
		/>
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
