import Link from 'next/link'
import {
	ArrowDown,
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
	variant = 'row',
}: {
	stats?: { value: string; label: string; icon?: LucideIcon }[]
	variant?: 'row' | 'cards' | 'divided'
}) {
	// Each stat on its own glass card, for a band that has to hold the page on its own.
	if (variant === 'cards') {
		return (
			<Section>
				<dl className='grid gap-5 sm:grid-cols-3'>
					{stats.map((stat) => {
						const Icon = stat.icon ?? Gauge
						return (
							<GlassCard key={stat.label} variant='accent' className='p-8'>
								<span className='flex size-11 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
									<Icon className='size-5 text-brand' />
								</span>
								<dt className='mt-6 font-display text-4xl font-semibold text-white'>
									{stat.value}
								</dt>
								<dd className='mt-3 leading-7 text-slate-400'>{stat.label}</dd>
							</GlassCard>
						)
					})}
				</dl>
			</Section>
		)
	}

	// Numbers only, split by rules. The quietest of the three.
	if (variant === 'divided') {
		return (
			<Section className='border-y border-white/10'>
				<dl className='grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0'>
					{stats.map((stat) => (
						<div
							key={stat.label}
							className='px-6 py-8 text-center first:pt-0 last:pb-0 sm:py-0'>
							<dt className='font-display text-5xl font-semibold text-brand'>
								{stat.value}
							</dt>
							<dd className='mx-auto mt-4 max-w-56 text-sm leading-6 text-slate-500'>
								{stat.label}
							</dd>
						</div>
					))}
				</dl>
			</Section>
		)
	}

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
	variant = 'card',
}: {
	eyebrow?: string
	logos?: Logo[]
	variant?: 'card' | 'bare' | 'grid'
}) {
	const list = (
		// Stacked and left-aligned on mobile so the marks form a clean column.
		<ul className='mx-auto mt-9 flex w-fit flex-col items-start gap-8 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-12'>
			{logos.map((logo) => (
				<li key={logo.name}>
					<ClientLogo {...logo} />
				</li>
			))}
		</ul>
	)

	// Bordered cells, so a long client list reads as a considered set.
	if (variant === 'grid') {
		return (
			<Section>
				<p className='eyebrow text-center'>{eyebrow}</p>
				<ul className='mt-9 grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 sm:grid-cols-3 lg:grid-cols-5'>
					{logos.map((logo) => (
						<li
							key={logo.name}
							className='flex items-center justify-center border-b border-r border-white/10 px-6 py-10'>
							<ClientLogo {...logo} />
						</li>
					))}
				</ul>
			</Section>
		)
	}

	// No card, just rules above and below. Sits quietly between two heavier sections.
	if (variant === 'bare') {
		return (
			<Section className='border-y border-white/10'>
				<p className='eyebrow text-center'>{eyebrow}</p>
				{list}
			</Section>
		)
	}

	return (
		<Section>
			<GlassCard variant='accent' className='px-8 py-14 sm:px-12'>
				<p className='eyebrow text-center'>{eyebrow}</p>
				{list}
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
	variant = 'split',
}: {
	eyebrow?: string
	title?: React.ReactNode
	summary?: string
	details?: { label: string; value: string }[]
	href?: string
	linkLabel?: string
	mediaLabel?: string
	variant?: 'split' | 'stacked' | 'overlap'
}) {
	const media = (
		<div className='flex h-full items-center justify-center px-6 text-center text-sm text-slate-500'>
			{mediaLabel}
		</div>
	)

	const detailList = details.length > 0 && (
		<dl className='mt-8 space-y-5 border-t border-white/10 pt-8'>
			{details.map((detail, index) => (
				<div key={index}>
					<dt className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
						{detail.label}
					</dt>
					<dd className='mt-2 leading-7 text-slate-300'>{detail.value}</dd>
				</div>
			))}
		</dl>
	)

	const cta = (
		<Button
			asChild
			className='mt-9 bg-brand font-bold text-ink hover:bg-brand-strong'>
			<Link href={href}>
				{linkLabel} <ArrowRight />
			</Link>
		</Button>
	)

	// Centred copy above full-bleed media, for when the visual is the argument.
	if (variant === 'stacked') {
		return (
			<Section>
				<div className='mx-auto max-w-3xl text-center'>
					<p className='eyebrow'>{eyebrow}</p>
					<h2 className='mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl'>
						{title}
					</h2>
					<p className='mt-5 leading-8 text-slate-400'>{summary}</p>
					{cta}
				</div>
				<GlassCard className='mt-14 aspect-21/9 w-full'>{media}</GlassCard>
				{details.length > 0 && (
					<dl className='mt-10 grid gap-8 sm:grid-cols-2'>
						{details.map((detail, index) => (
							<div key={index} className='border-t border-white/10 pt-6'>
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
			</Section>
		)
	}

	// Copy panel lifted over the corner of the media, for a heavier feature block.
	if (variant === 'overlap') {
		return (
			<Section>
				<div className='relative'>
					<GlassCard className='aspect-21/9 w-full'>{media}</GlassCard>
					<GlassCard
						variant='accent'
						className='relative -mt-16 ml-0 w-full p-8 sm:p-10 lg:absolute lg:inset-y-12 lg:right-10 lg:mt-0 lg:w-[26rem] lg:overflow-y-auto'>
						<p className='eyebrow'>{eyebrow}</p>
						<h2 className='mt-4 font-display text-2xl font-semibold leading-tight text-white sm:text-3xl'>
							{title}
						</h2>
						<p className='mt-4 leading-7 text-slate-300'>{summary}</p>
						{cta}
					</GlassCard>
				</div>
			</Section>
		)
	}

	return (
		<Section>
			<div className='grid items-center gap-12 lg:grid-cols-2'>
				<GlassCard className='aspect-video w-full'>{media}</GlassCard>
				<div>
					<p className='eyebrow'>{eyebrow}</p>
					<h2 className='mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl'>
						{title}
					</h2>
					<p className='mt-5 leading-8 text-slate-400'>{summary}</p>
					{detailList}
					{cta}
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
	variant = 'columns',
}: {
	eyebrow?: string
	title?: React.ReactNode
	beforeLabel?: string
	afterLabel?: string
	before?: string[]
	after?: string[]
	variant?: 'columns' | 'rows' | 'stacked'
}) {
	// Pairs each problem with its answer on the same line, so nothing is left to inference.
	if (variant === 'rows') {
		return (
			<Section>
				<SectionHeading eyebrow={eyebrow} title={title} />
				<GlassCard className='mt-12 overflow-hidden'>
					<div className='grid grid-cols-2 border-b border-white/10'>
						<p className='p-5 text-xs font-semibold uppercase tracking-widest text-slate-500'>
							{beforeLabel}
						</p>
						<p className='bg-brand/8 p-5 text-xs font-semibold uppercase tracking-widest text-brand'>
							{afterLabel}
						</p>
					</div>
					{before.map((item, index) => (
						<div
							key={item}
							className='grid grid-cols-2 border-b border-white/6 last:border-b-0'>
							<p className='p-5 leading-7 text-slate-500'>{item}</p>
							<p className='bg-brand/8 p-5 leading-7 text-slate-200'>
								{after[index]}
							</p>
						</div>
					))}
				</GlassCard>
			</Section>
		)
	}

	// One state above the other with an arrow between, which reads as a sequence.
	if (variant === 'stacked') {
		return (
			<Section>
				<SectionHeading eyebrow={eyebrow} title={title} />
				<div className='mx-auto mt-12 max-w-3xl'>
					<GlassCard className='p-8'>
						<Badge variant='secondary' className='uppercase tracking-widest'>
							{beforeLabel}
						</Badge>
						<ul className='mt-6 grid gap-4 sm:grid-cols-2'>
							{before.map((item) => (
								<li key={item} className='flex gap-3 text-slate-400'>
									<span className='mt-2.5 size-1.5 shrink-0 rounded-full bg-slate-600' />
									<span className='leading-7'>{item}</span>
								</li>
							))}
						</ul>
					</GlassCard>
					<div className='flex justify-center py-4'>
						<span className='flex size-10 items-center justify-center rounded-full border border-brand/30 bg-brand/10'>
							<ArrowDown className='size-5 text-brand' />
						</span>
					</div>
					<GlassCard variant='accent' className='p-8'>
						<Badge className='uppercase tracking-widest'>{afterLabel}</Badge>
						<ul className='mt-6 grid gap-4 sm:grid-cols-2'>
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
