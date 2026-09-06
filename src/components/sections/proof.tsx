import Link from 'next/link'
import {
	ArrowRight,
	Clock,
	Gauge,
	TrendingUp,
	type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { ClientLogo, exampleLogos, type Logo } from './cards'
import { Section, SectionHeading } from './primitives'

export function StatBand({
	stats = [
		{
			value: 'Stat One',
			label:
				'A short line explaining what this number means and why it matters',
			icon: Gauge,
		},
		{
			value: 'Stat Two',
			label: 'Two lines is the target so every column lines up across the row',
			icon: Clock,
		},
		{
			value: 'Stat Three',
			label: 'Values stay short so the label underneath can carry the detail',
			icon: TrendingUp,
		},
	],
}: {
	stats?: { value: string; label: string; icon?: LucideIcon }[]
}) {
	return (
		<Section className='border-y border-white/10'>
			<dl className='grid gap-10 text-center sm:grid-cols-3 sm:text-left'>
				{stats.map((stat) => {
					const Icon = stat.icon ?? Gauge
					return (
						<div key={stat.label}>
							<dt className='flex items-center justify-center gap-3 font-display text-3xl font-semibold text-brand sm:justify-start sm:text-4xl'>
								<span className='flex size-11 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
									<Icon className='size-5 text-brand' />
								</span>
								{stat.value}
							</dt>
							{/* Two lines are reserved so uneven labels still align across columns. */}
							<dd className='mt-3 min-h-14 leading-7 text-slate-400'>
								{stat.label}
							</dd>
						</div>
					)
				})}
			</dl>
		</Section>
	)
}

export function LogoStrip({
	eyebrow = 'Trusted by',
	logos = exampleLogos.slice(0, 5),
}: {
	eyebrow?: string
	logos?: Logo[]
}) {
	return (
		<Section>
			<GlassCard variant='accent' className='px-8 py-14 sm:px-12'>
				<p className='eyebrow text-center'>{eyebrow}</p>
				{/* Stacked and left-aligned on mobile so the marks form a clean column. */}
				<ul className='mx-auto mt-9 flex w-fit flex-col items-start gap-8 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-12'>
					{logos.map((logo) => (
						<li key={logo.name}>
							<ClientLogo {...logo} />
						</li>
					))}
				</ul>
			</GlassCard>
		</Section>
	)
}

export function Spotlight({
	eyebrow = 'Spotlight',
	title = 'This is the spotlight heading',
	summary = 'This is the spotlight summary. One paragraph on what is being featured and why it matters, then the labelled blocks underneath carry the specifics.',
	details = [
		{
			label: 'Detail Label',
			value:
				'This is a labelled detail line. Two of these sit under the summary as short blocks.',
		},
		{
			label: 'Detail Label',
			value:
				'Swap the labels to suit: challenge and outcome, problem and result, before and after.',
		},
	],
	href = '/case-studies',
	linkLabel = 'Read More',
	mediaLabel = 'Media slot: screenshot, video, or photo',
}: {
	eyebrow?: string
	title?: React.ReactNode
	summary?: string
	details?: { label: string; value: string }[]
	href?: string
	linkLabel?: string
	mediaLabel?: string
}) {
	return (
		<Section>
			<div className='grid items-center gap-12 lg:grid-cols-2'>
				<GlassCard className='aspect-video w-full'>
					<div className='flex h-full items-center justify-center px-6 text-center text-sm text-slate-500'>
						{mediaLabel}
					</div>
				</GlassCard>
				<div>
					<p className='eyebrow'>{eyebrow}</p>
					<h2 className='mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl'>
						{title}
					</h2>
					<p className='mt-5 leading-8 text-slate-400'>{summary}</p>
					{details.length > 0 && (
						<dl className='mt-8 space-y-5 border-t border-white/10 pt-8'>
							{details.map((detail, index) => (
								<div key={index}>
									<dt className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
										{detail.label}
									</dt>
									<dd className='mt-2 leading-7 text-slate-300'>
										{detail.value}
									</dd>
								</div>
							))}
						</dl>
					)}
					<Button
						asChild
						className='mt-9 bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Link href={href}>
							{linkLabel} <ArrowRight />
						</Link>
					</Button>
				</div>
			</div>
		</Section>
	)
}

export function BeforeAfter({
	eyebrow = 'Eyebrow',
	title = 'This is the before and after heading',
	beforeLabel = 'Before',
	afterLabel = 'After',
	before = [
		'This is a line describing the old process',
		'Each line is one concrete, specific problem',
		'Three to five reads best on either side',
		'Keep both columns the same length',
	],
	after = [
		'This is the matching line describing the new process',
		'Each one answers the problem directly across from it',
		'Specific beats abstract in both columns',
		'The contrast is the whole point of the section',
	],
}: {
	eyebrow?: string
	title?: React.ReactNode
	beforeLabel?: string
	afterLabel?: string
	before?: string[]
	after?: string[]
}) {
	return (
		<Section>
			<SectionHeading eyebrow={eyebrow} title={title} />
			<div className='mt-12 grid gap-5 lg:grid-cols-2'>
				<GlassCard className='p-8'>
					<Badge variant='secondary' className='uppercase tracking-widest'>
						{beforeLabel}
					</Badge>
					<ul className='mt-6 space-y-4'>
						{before.map((item) => (
							<li key={item} className='flex gap-3 text-slate-400'>
								<span className='mt-2.5 size-1.5 shrink-0 rounded-full bg-slate-600' />
								<span className='leading-7'>{item}</span>
							</li>
						))}
					</ul>
				</GlassCard>
				<GlassCard variant='accent' className='p-8'>
					<Badge className='uppercase tracking-widest'>{afterLabel}</Badge>
					<ul className='mt-6 space-y-4'>
						{after.map((item) => (
							<li key={item} className='flex gap-3 text-slate-200'>
								<span className='mt-2.5 size-1.5 shrink-0 rounded-full bg-brand' />
								<span className='leading-7'>{item}</span>
							</li>
						))}
					</ul>
				</GlassCard>
			</div>
		</Section>
	)
}
