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
}: {
	eyebrow?: string
	/** Accepts markup so part of the title can be wrapped in <Highlight>. */
	title?: React.ReactNode
	description?: string
	align?: 'left' | 'center'
}) {
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
	eyebrow,
	title,
	description,
	actions,
	stats,
	children,
}: {
	eyebrow: string
	/** Accepts markup so part of the headline can be wrapped in <Highlight>. */
	title: React.ReactNode
	description: string
	/** First action renders solid, second outlined. */
	actions?: { label: string; href: string }[]
	stats?: { value: string; label: string }[]
	children?: React.ReactNode
}) {
	const buttons = actions?.slice(0, 2) ?? []
	const figures = stats?.slice(0, 3) ?? []

	return (
		<section className='hero-grid border-b border-white/10 px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pb-24 lg:pt-44'>
			<div className='mx-auto max-w-6xl text-center sm:text-left'>
				<Badge className='uppercase tracking-widest'>{eyebrow}</Badge>
				<h1 className='mx-auto mt-6 max-w-4xl font-display text-4xl font-semibold leading-[1.08] text-white sm:mx-0 sm:text-6xl'>
					{title}
				</h1>
				<p className='mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:mx-0'>
					{description}
				</p>

				{buttons.length > 0 && (
					<div className='mt-10 flex flex-col gap-4 sm:flex-row sm:flex-wrap'>
						{buttons.map((action, index) =>
							index === 0 ? (
								<Button
									key={action.href}
									asChild
									size='lg'
									className='w-full bg-brand font-bold text-ink hover:bg-brand-strong sm:w-auto'>
									<Link href={action.href}>
										{action.label} <ArrowRight />
									</Link>
								</Button>
							) : (
								<Button
									key={action.href}
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
	items,
	icon: Icon = Check,
}: {
	items: string[]
	icon?: LucideIcon
}) {
	return (
		<ul className='space-y-3'>
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
}: {
	title?: string
	description?: string
}) {
	return (
		<Section className='border-t border-white/10'>
			<GlassCard
				variant='accent'
				className='p-10 text-center sm:p-14 sm:text-left'>
				<h2 className='mx-auto max-w-2xl font-display text-3xl font-semibold leading-tight text-white sm:mx-0 sm:text-4xl'>
					{title}
				</h2>
				<p className='mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300 sm:mx-0'>
					{description}
				</p>
				<div className='mt-9 flex flex-col gap-4 sm:flex-row sm:flex-wrap'>
					<Button
						asChild
						size='lg'
						className='w-full bg-brand font-bold text-ink hover:bg-brand-strong sm:w-auto'>
						<Link href='/contact'>
							Book An Assessment <ArrowRight />
						</Link>
					</Button>
					<Button
						asChild
						size='lg'
						variant='outline'
						className='w-full border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white sm:w-auto'>
						<Link href='/case-studies'>See What We Have Built</Link>
					</Button>
				</div>
			</GlassCard>
		</Section>
	)
}
