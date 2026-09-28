import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'
import { ActionButton, ActionRow, Section, type Action } from './primitives'

export function DetailCard({
	eyebrow = 'Details',
	title = 'This is the detail card heading',
	description = 'This is the detail description. It sits above a labelled fact list, for the page where the facts are the reason someone acts.',
	details = [
		{ label: 'Date', value: 'This is a labelled fact' },
		{ label: 'Time', value: 'Four or five rows reads best' },
		{ label: 'Venue', value: 'Values run to one or two lines' },
		{ label: 'Price', value: 'The last one is usually the price' },
	],
	action = {
		label: 'Primary Button',
		href: '/contact',
		icon: ArrowRight,
	},
	showNote = true,
	note = 'This is the note under the button, for scarcity or reassurance.',
	variant = 'card',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	details?: { label: string; value: string }[]
	action?: Action
	/** Turn the line under the button off without clearing its text. */
	showNote?: boolean
	note?: string
	/** How the facts sit against the copy. */
	variant?: 'card' | 'rows' | 'inline'
}) {
	const copy = (
		<div>
			{eyebrow && <p className='eyebrow'>{eyebrow}</p>}
			<h2 className='mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl'>
				{title}
			</h2>
			{description && (
				<p className='mt-5 text-lg leading-8 text-slate-400'>{description}</p>
			)}
		</div>
	)

	const actionBlock = (
		<>
			{action?.label && (
				<ActionButton action={action} className='w-full' />
			)}
			{showNote && note && (
				<p className='mt-4 text-center text-sm text-slate-500'>{note}</p>
			)}
		</>
	)

	// Facts stacked down a panel beside the copy.
	if (variant === 'card') {
		return (
			<Section>
				<div className='grid gap-12 lg:grid-cols-[1.4fr_1fr] lg:items-start'>
					{copy}
					<GlassCard variant='accent' className='p-8'>
						<dl className='space-y-5'>
							{details.map((row, index) => (
								<div key={index}>
									<dt className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
										{row.label}
									</dt>
									<dd className='mt-1 leading-7 text-slate-200'>{row.value}</dd>
								</div>
							))}
						</dl>
							<div className='mt-8'>{actionBlock}</div>
					</GlassCard>
				</div>
			</Section>
		)
	}

	// Full-width ruled rows, for when the facts are the whole point.
	if (variant === 'rows') {
		return (
			<Section>
				{copy}
				<dl className='mt-12 divide-y divide-white/10 border-y border-white/10'>
					{details.map((row, index) => (
						<div
							key={index}
							className='grid gap-2 py-5 sm:grid-cols-[12rem_1fr] sm:gap-8'>
							<dt className='text-xs font-semibold uppercase tracking-widest text-slate-500 sm:pt-1'>
								{row.label}
							</dt>
							<dd className='leading-7 text-slate-200'>{row.value}</dd>
						</div>
					))}
				</dl>
				<div className='mx-auto mt-10 w-full max-w-sm'>{actionBlock}</div>
			</Section>
		)
	}

	// Facts across the top as a stat row, action underneath.
	return (
		<Section>
			{copy}
			<dl className='mt-12 grid gap-8 border-t border-white/10 pt-10 sm:grid-cols-2 lg:grid-cols-4'>
				{details.map((row, index) => (
					<div key={index}>
						<dt className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
							{row.label}
						</dt>
						<dd className='mt-2 font-display text-lg font-semibold text-white'>
							{row.value}
						</dd>
					</div>
				))}
			</dl>
			<div className='mx-auto mt-10 w-full max-w-sm'>{actionBlock}</div>
		</Section>
	)
}

export function Countdown({
	eyebrow = 'Launching Soon',
	title = 'This is the countdown heading',
	description = 'This is the countdown description. Two lines on what is coming and why it is worth waiting for, because the page has nothing else to argue with.',
	units = [
		{ value: '00', label: 'Days' },
		{ value: '00', label: 'Hours' },
		{ value: '00', label: 'Minutes' },
		{ value: '00', label: 'Seconds' },
	],
	showNote = true,
	note = 'This is the closing line, usually a contact address for anyone who cannot wait.',
	variant = 'boxed',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	units?: { value: string; label: string }[]
	/** Turn the closing line off without clearing its text. */
	showNote?: boolean
	note?: string
	/** How each unit is framed. */
	variant?: 'boxed' | 'bare' | 'inline'
}) {
	const inline = variant === 'inline'

	return (
		<Section className='text-center'>
			{eyebrow && (
				<Badge className='uppercase tracking-widest'>{eyebrow}</Badge>
			)}
			<h2 className='mx-auto mt-8 max-w-3xl font-display text-4xl font-semibold leading-[1.05] text-white sm:text-6xl'>
				{title}
			</h2>
			{description && (
				<p className='mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-300'>
					{description}
				</p>
			)}

			<dl
				className={cn(
					'mx-auto mt-14',
					inline
						? 'flex max-w-2xl flex-wrap items-baseline justify-center gap-x-8 gap-y-4'
						: 'grid max-w-lg grid-cols-4 gap-3 sm:gap-5',
				)}>
				{units.map((unit, index) => (
					<div
						key={index}
						className={cn(
							inline && 'flex items-baseline gap-2',
							variant === 'boxed' &&
								'rounded-xl border border-white/10 bg-white/3 px-2 py-5',
							variant === 'bare' && 'border-t-2 border-brand/40 pt-5',
						)}>
						<dt className='font-display text-2xl font-semibold text-brand sm:text-3xl'>
							{unit.value}
						</dt>
						<dd
							className={cn(
								'text-xs uppercase tracking-widest text-slate-500',
								!inline && 'mt-1',
							)}>
							{unit.label}
						</dd>
					</div>
				))}
			</dl>

				{showNote && note && (
					<p className='mt-12 text-sm text-slate-500'>{note}</p>
				)}
		</Section>
	)
}

export function AuthPanel({
	eyebrow = 'Account',
	title = 'This is the sign in heading',
	description = 'This is the sign in description. One line, because anyone on this page already knows why they are here.',
	formLabel = 'Form slot: drop the sign in form in here',
	providers = ['Continue with Provider One', 'Continue with Provider Two'],
	footnote = 'No account yet?',
	footnoteLink = 'Create one',
	href = '/contact',
	asideQuote = 'This is the quote in the proof panel. The only job of this column is to make signing in feel worth it.',
	asideName = 'Client Name',
	asideRole = 'Role, Company',
	asideImage,
	variant = 'split',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	formLabel?: string
	providers?: string[]
	footnote?: string
	footnoteLink?: string
	href?: string
	asideQuote?: string
	asideName?: string
	asideRole?: string
	/** Sits behind the proof column, dimmed so the quote stays readable. */
	asideImage?: string
	/** Whether the proof panel shows, and how the form is framed. */
	variant?: 'split' | 'centered' | 'card'
}) {
	const form = (
		<div className='w-full max-w-sm'>
			{eyebrow && (
				<Badge className='uppercase tracking-widest'>{eyebrow}</Badge>
			)}
			<h2 className='mt-6 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl'>
				{title}
			</h2>
			{description && (
				<p className='mt-4 leading-7 text-slate-400'>{description}</p>
			)}

			<div className='mt-10 flex min-h-56 items-center justify-center rounded-xl border border-dashed border-white/15 px-6 text-center text-sm text-slate-500'>
				{formLabel}
			</div>

			{providers.length > 0 && (
				<>
					<div className='mt-8 flex items-center gap-4'>
						<span aria-hidden className='h-px flex-1 bg-white/10' />
						<span className='text-xs uppercase tracking-widest text-slate-500'>
							Or
						</span>
						<span aria-hidden className='h-px flex-1 bg-white/10' />
					</div>
					<div className='mt-8 space-y-3'>
						{providers.map((provider, index) => (
							<Button
								key={index}
								asChild
								variant='outline'
								className='w-full border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
								<Link href={href}>{provider}</Link>
							</Button>
						))}
					</div>
				</>
			)}

			<p className='mt-10 text-center text-sm text-slate-400'>
				{footnote}{' '}
				<Link
					href={href}
					className='font-medium text-brand underline-offset-4 hover:underline'>
					{footnoteLink}
				</Link>
			</p>
		</div>
	)

	if (variant === 'centered') {
		return (
			<section className='flex min-h-screen items-center justify-center px-6 py-24 sm:px-10'>
				{form}
			</section>
		)
	}

	if (variant === 'card') {
		return (
			<section className='flex min-h-screen items-center justify-center px-6 py-24 sm:px-10'>
				<GlassCard
					variant='accent'
					className='w-full max-w-xl p-8 sm:p-12 [&>div]:max-w-none'>
					{form}
				</GlassCard>
			</section>
		)
	}

	return (
		<section className='grid min-h-screen lg:grid-cols-2'>
			<div className='flex items-center justify-center px-6 py-24 sm:px-10 lg:px-16'>
				{form}
			</div>
			{/* Proof panel: the only job of the second column is to justify the sign in. */}
			<div
				className='relative hidden items-center border-l border-white/10 bg-white/2 px-16 lg:flex'>
				{asideImage && (
					<>
						<Image
							src={asideImage}
							alt=''
							fill
							sizes='50vw'
							className='object-cover'
						/>
						<span aria-hidden className='absolute inset-0 bg-ink/75' />
					</>
				)}
				<figure className='relative w-full max-w-md'>
					<span
						aria-hidden
						className='font-display text-7xl leading-none text-brand/30'>
						&ldquo;
					</span>
					<blockquote className='mt-2 font-display text-xl font-medium leading-relaxed text-white'>
						{asideQuote}
					</blockquote>
					<figcaption className='mt-7 text-sm'>
						<span className='block font-semibold text-white'>{asideName}</span>
						<span className='mt-1 block text-slate-500'>{asideRole}</span>
					</figcaption>
				</figure>
			</div>
		</section>
	)
}

export function Notice({
	icon: Icon = Check,
	code,
	title = 'This is the notice heading',
	description = 'This is the notice description. It confirms what just happened, or explains what went wrong, and says what to do next.',
	steps = [
		{ value: 'Step One', label: 'This is what happens immediately' },
		{ value: 'Step Two', label: 'This is the follow up and when to expect it' },
		{ value: 'Step Three', label: 'This is what to do in the meantime' },
	],
	actions = [
		{ label: 'Primary Button', href: '/', icon: ArrowRight },
		{ label: 'Secondary Button', href: '/contact' },
	],
	iconPosition = 'above',
	variant = 'confirmation',
}: {
	icon?: LucideIcon
	/** Where the mark sits relative to the heading. */
	iconPosition?: 'above' | 'before' | 'after'
	/** Large code above the heading, for error states. */
	code?: string
	title?: React.ReactNode
	description?: string
	steps?: { value: string; label: string }[]
	actions?: Action[]
	/** Whether the mark is an icon, a code, or nothing at all. */
	variant?: 'confirmation' | 'code' | 'plain'
}) {
	// The mark follows the icon field in every variant, not just confirmation.
	const inline = iconPosition !== 'above'
	const mark = Icon ? (
		<span
			className={
				inline
					? 'inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/10'
					: 'mx-auto flex size-16 items-center justify-center rounded-full border border-brand/30 bg-brand/10'
			}>
			<Icon className={inline ? 'size-5 text-brand' : 'size-7 text-brand'} />
		</span>
	) : null

	return (
		<section className='flex min-h-screen items-center px-6 py-28 sm:px-10 lg:px-16'>
			<div className='mx-auto w-full max-w-3xl text-center'>
				{variant !== 'plain' && !inline && mark}
				{variant === 'code' && (
					<p className='font-display text-7xl font-semibold text-brand sm:text-8xl'>
						{code ?? '404'}
					</p>
				)}

				<h1 className='mt-8 flex flex-wrap items-center justify-center gap-4 font-display text-4xl font-semibold leading-[1.1] text-white sm:text-5xl'>
					{variant !== 'plain' && inline && iconPosition === 'before' && mark}
					<span>{title}</span>
					{variant !== 'plain' && inline && iconPosition === 'after' && mark}
				</h1>
				{description && (
					<p className='mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-300'>
						{description}
					</p>
				)}

				{steps.length > 0 && (
					<dl className='mt-14 grid gap-8 text-left sm:grid-cols-3'>
						{steps.map((step, index) => (
							<div key={index}>
								<dt className='font-display text-xl font-semibold text-brand'>
									{step.value}
								</dt>
								<dd className='mt-2 leading-7 text-slate-400'>{step.label}</dd>
							</div>
						))}
					</dl>
				)}

				<ActionRow
					actions={actions}
					className='mt-12 sm:justify-center'
				/>
			</div>
		</section>
	)
}
