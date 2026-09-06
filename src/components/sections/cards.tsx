// Single-item cards. Standalone sections and every grid or carousel render these,
// so an item looks identical wherever it is placed.
import Image from 'next/image'
import Link from 'next/link'
import {
	ArrowRight,
	ArrowUpRight,
	Quote,
	User,
	Workflow,
	type LucideIcon,
} from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

export type Testimonial = {
	quote: string
	name: string
	role: string
	company: string
}

export function TestimonialCard({
	quote = 'This is a testimonial quote. It runs two or three lines and carries more weight than anything else on the page, so it is set large and given room to breathe.',
	name = 'Client Name',
	role = 'Role Or Title',
	company = 'Company Name',
	featured = false,
	variant = 'card',
	className,
}: Partial<Testimonial> & {
	featured?: boolean
	variant?: 'card' | 'bare' | 'aside'
	className?: string
}) {
	const attribution = (
		<>
			<span className='block font-semibold text-white'>{name}</span>
			<span className='mt-1 block text-slate-400'>{role}</span>
			<span className='mt-0.5 block text-slate-500'>{company}</span>
		</>
	)

	// No card at all: an oversized quote mark and centred copy.
	if (variant === 'bare') {
		return (
			<figure
				className={cn('flex flex-col items-center text-center', className)}>
				<span
					aria-hidden
					className='font-display text-7xl leading-none text-brand/30'>
					&ldquo;
				</span>
				<blockquote
					className={cn(
						'mt-2 flex-1 font-display font-medium leading-relaxed text-white',
						featured ? 'text-2xl sm:text-4xl' : 'text-lg sm:text-xl',
					)}>
					{quote}
				</blockquote>
				<figcaption className='mt-7 text-sm'>
					<span className='block font-semibold text-white'>{name}</span>
					<span className='mt-1 block text-slate-500'>
						{role} &middot; {company}
					</span>
				</figcaption>
			</figure>
		)
	}

	// Attribution beside the quote rather than under it, so the quote starts at the top edge.
	if (variant === 'aside') {
		return (
			<GlassCard
				variant={featured ? 'accent' : 'default'}
				className={cn('p-7 sm:p-10', className)}>
				<figure className='grid gap-7 sm:grid-cols-[auto_1fr] sm:gap-10'>
					<figcaption className='flex items-start gap-4 text-sm sm:w-48 sm:flex-col sm:gap-0'>
						<span className='flex size-12 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/10'>
							<User className='size-6 text-brand' strokeWidth={1.5} />
						</span>
						<span className='sm:mt-4'>{attribution}</span>
					</figcaption>
					<blockquote
						className={cn(
							'border-l border-white/10 leading-8 text-slate-300 sm:pl-10',
							featured && 'font-display text-xl text-white sm:text-2xl',
						)}>
						{quote}
					</blockquote>
				</figure>
			</GlassCard>
		)
	}

	return (
		<GlassCard
			variant={featured ? 'accent' : 'default'}
			className={cn(
				'flex flex-col',
				featured ? 'p-10 sm:p-14' : 'p-7',
				className,
			)}>
			<Quote className={cn('text-brand/50', featured ? 'size-9' : 'size-6')} />
			<blockquote
				className={cn(
					'flex-1',
					featured
						? 'mt-6 max-w-4xl font-display text-2xl font-medium leading-relaxed text-white sm:text-3xl'
						: 'mt-5 leading-7 text-slate-300',
				)}>
				{quote}
			</blockquote>
			<figcaption
				className={cn(
					'border-l-2 border-brand/60 pl-5 text-sm',
					featured ? 'mt-8' : 'mt-6',
				)}>
				{attribution}
			</figcaption>
		</GlassCard>
	)
}

export type CaseStudyItem = {
	name: string
	category: string
	client: string
	summary: string
	href: string
}

export function CaseStudyCard({
	name = 'This is a project name',
	category = 'Category',
	client = 'Client',
	summary = 'This is the card summary. Two lines is the sweet spot before the grid starts to feel heavy.',
	href = '/case-studies',
	variant = 'stacked',
	className,
}: Partial<CaseStudyItem> & {
	variant?: 'stacked' | 'overlay' | 'row'
	className?: string
}) {
	const meta = (
		<div className='flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500'>
			<span>{category}</span>
			<span>&middot;</span>
			<span>{client}</span>
		</div>
	)

	// Copy sits on the media behind a scrim instead of beneath it.
	if (variant === 'overlay') {
		return (
			<GlassCard interactive asChild className={cn('group', className)}>
				<Link href={href} className='relative block aspect-4/3 overflow-hidden'>
					<span className='absolute inset-0 bg-white/4' />
					<span className='absolute inset-0 bg-linear-to-t from-ink via-ink/70 to-transparent' />
					<span className='absolute inset-x-0 bottom-0 p-7'>
						{meta}
						<span className='mt-3 block font-display text-xl font-semibold text-white'>
							{name}
						</span>
						<span className='mt-3 block leading-7 text-slate-300'>
							{summary}
						</span>
						<span className='mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
							View Project{' '}
							<ArrowUpRight className='size-4 transition-transform group-hover:translate-x-0.5' />
						</span>
					</span>
				</Link>
			</GlassCard>
		)
	}

	// Landscape row for index pages that would rather list than tile.
	if (variant === 'row') {
		return (
			<GlassCard interactive asChild className={className}>
				<Link href={href} className='grid gap-6 p-6 sm:grid-cols-[14rem_1fr]'>
					<span className='block aspect-video w-full rounded-lg border border-white/10 bg-white/3' />
					<span className='flex flex-col justify-center'>
						{meta}
						<span className='mt-3 block font-display text-xl font-semibold text-white'>
							{name}
						</span>
						<span className='mt-2 block leading-7 text-slate-400'>
							{summary}
						</span>
						<span className='mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
							View Project <ArrowUpRight className='size-4' />
						</span>
					</span>
				</Link>
			</GlassCard>
		)
	}

	return (
		<GlassCard interactive asChild className={className}>
			<Link href={href} className='flex flex-col p-7'>
				<div className='aspect-video w-full rounded-lg border border-white/10 bg-white/3' />
				<div className='mt-6'>{meta}</div>
				<h3 className='mt-3 font-display text-xl font-semibold text-white'>
					{name}
				</h3>
				<p className='mt-3 flex-1 leading-7 text-slate-400'>{summary}</p>
				<span className='mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
					View Project <ArrowUpRight className='size-4' />
				</span>
			</Link>
		</GlassCard>
	)
}

export type Article = {
	title: string
	excerpt: string
	category: string
	readTime: string
	href: string
}

export function ArticleCard({
	title = 'This is an article title that runs to about two lines',
	excerpt = 'This is the article excerpt. Two lines of preview copy before the reader decides whether to open it.',
	category = 'Category',
	readTime = '6 min',
	href = '/blog',
	index,
	variant = 'card',
	className,
}: Partial<Article> & {
	/** Shown by the numbered variant. */
	index?: number
	variant?: 'card' | 'numbered' | 'thumbnail'
	className?: string
}) {
	const meta = (
		<div className='flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500'>
			<span className='text-brand'>{category}</span>
			<span>&middot;</span>
			<span>{readTime}</span>
		</div>
	)

	// Ranked list with no card chrome, for a sidebar or a most-read block.
	if (variant === 'numbered') {
		return (
			<Link
				href={href}
				className={cn(
					'group flex gap-5 border-t border-white/10 py-6 transition-colors hover:border-brand/40',
					className,
				)}>
				<span className='font-display text-3xl font-semibold leading-none text-brand/40'>
					{String(index ?? 1).padStart(2, '0')}
				</span>
				<span className='flex-1'>
					{meta}
					<span className='mt-2 block font-display text-lg font-semibold leading-snug text-white group-hover:text-brand'>
						{title}
					</span>
				</span>
				<ArrowUpRight className='mt-1 size-4 shrink-0 text-slate-600 transition-colors group-hover:text-brand' />
			</Link>
		)
	}

	// Leads with a media slot, for a blog index where images carry the scan.
	if (variant === 'thumbnail') {
		return (
			<GlassCard interactive asChild className={className}>
				<Link href={href} className='flex flex-col'>
					<span className='block aspect-video w-full border-b border-white/10 bg-white/4' />
					<span className='flex flex-1 flex-col p-6'>
						{meta}
						<span className='mt-3 block font-display text-lg font-semibold leading-snug text-white'>
							{title}
						</span>
						<span className='mt-2 block flex-1 leading-7 text-slate-400'>
							{excerpt}
						</span>
					</span>
				</Link>
			</GlassCard>
		)
	}

	return (
		<GlassCard interactive asChild className={className}>
			<Link href={href} className='flex flex-col p-7'>
				{meta}
				<h3 className='mt-4 font-display text-xl font-semibold leading-snug text-white'>
					{title}
				</h3>
				<p className='mt-3 flex-1 leading-7 text-slate-400'>{excerpt}</p>
				<span className='mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
					Read Article <ArrowUpRight className='size-4' />
				</span>
			</Link>
		</GlassCard>
	)
}

export type Person = {
	name: string
	role: string
	bio: string
}

export function TeamCard({
	name = 'Person Name',
	role = 'Role Or Title',
	bio = 'This is a one line bio describing what this person does.',
	variant = 'card',
	className,
}: Partial<Person> & {
	variant?: 'card' | 'portrait' | 'row'
	className?: string
}) {
	// Tall portrait plate with the name over it, for a leadership row.
	if (variant === 'portrait') {
		return (
			<GlassCard className={cn('overflow-hidden', className)}>
				<div className='flex aspect-3/4 items-center justify-center border-b border-white/10 bg-white/4'>
					<User className='size-16 text-slate-700' strokeWidth={1.25} />
				</div>
				<div className='p-6 text-center'>
					<h3 className='font-display text-lg font-semibold text-white'>
						{name}
					</h3>
					<p className='mt-1 text-sm font-medium text-brand'>{role}</p>
				</div>
			</GlassCard>
		)
	}

	// Compact horizontal entry, for a long list of contributors.
	if (variant === 'row') {
		return (
			<div
				className={cn(
					'flex items-start gap-4 border-b border-white/10 py-5',
					className,
				)}>
				<span className='flex size-12 shrink-0 items-center justify-center rounded-full border border-brand/25 bg-brand/10'>
					<User className='size-6 text-brand' strokeWidth={1.5} />
				</span>
				<div className='flex-1'>
					<h3 className='font-display text-base font-semibold text-white'>
						{name}
					</h3>
					<p className='mt-0.5 text-sm text-slate-500'>{role}</p>
					<p className='mt-2 text-sm leading-6 text-slate-400'>{bio}</p>
				</div>
			</div>
		)
	}

	return (
		<GlassCard className={cn('p-7', className)}>
			<div className='flex aspect-square w-20 items-center justify-center rounded-full border border-white/10 bg-white/4'>
				<User className='size-9 text-slate-600' strokeWidth={1.5} />
			</div>
			<div className='mt-5 border-l-2 border-brand/60 pl-5'>
				<h3 className='font-display text-lg font-semibold text-white'>
					{name}
				</h3>
				<p className='mt-1 text-sm font-medium text-brand'>{role}</p>
			</div>
			<p className='mt-4 leading-7 text-slate-400'>{bio}</p>
		</GlassCard>
	)
}

export type RelatedItem = {
	title: string
	meta: string
	description: string
	href: string
}

export function RelatedCard({
	title = 'This is a related item title',
	meta = 'Category',
	description = 'This is the related item description. One or two lines on why it is worth opening next.',
	href = '/blog',
	variant = 'card',
	className,
}: Partial<RelatedItem> & {
	variant?: 'card' | 'list' | 'thumbnail'
	className?: string
}) {
	// Divider rows rather than cards, for a tight end-of-page rail.
	if (variant === 'list') {
		return (
			<Link
				href={href}
				className={cn(
					'group flex items-center justify-between gap-6 border-b border-white/10 py-5 transition-colors hover:border-brand/40',
					className,
				)}>
				<span>
					<span className='text-xs uppercase tracking-widest text-brand'>
						{meta}
					</span>
					<span className='mt-1.5 block font-display text-lg font-semibold leading-snug text-white group-hover:text-brand'>
						{title}
					</span>
				</span>
				<ArrowRight className='size-4 shrink-0 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-brand' />
			</Link>
		)
	}

	// Media led, for when the related items are visual rather than editorial.
	if (variant === 'thumbnail') {
		return (
			<GlassCard interactive asChild className={className}>
				<Link href={href} className='flex items-center gap-4 p-4'>
					<span className='block size-20 shrink-0 rounded-lg border border-white/10 bg-white/4' />
					<span>
						<span className='text-xs uppercase tracking-widest text-brand'>
							{meta}
						</span>
						<span className='mt-1.5 block font-display text-base font-semibold leading-snug text-white'>
							{title}
						</span>
					</span>
				</Link>
			</GlassCard>
		)
	}

	return (
		<GlassCard interactive asChild className={className}>
			<Link href={href} className='flex flex-col p-6'>
				<p className='text-xs uppercase tracking-widest text-brand'>{meta}</p>
				<h3 className='mt-3 font-display text-lg font-semibold leading-snug text-white'>
					{title}
				</h3>
				<p className='mt-3 flex-1 leading-7 text-slate-400'>{description}</p>
				<span className='mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-400'>
					Read <ArrowRight className='size-4' />
				</span>
			</Link>
		</GlassCard>
	)
}

export type Logo = {
	name: string
	/** Stroke mark for the mock lockup, ignored once a real asset is supplied. */
	mark?: React.ReactNode
	/** Uploaded logo asset. */
	src?: string
}

export function ClientLogo({
	name,
	mark,
	src,
	className,
}: Logo & { className?: string }) {
	if (src) {
		return (
			<span className={cn('flex h-10 items-center', className)}>
				<Image
					src={src}
					alt={name}
					width={160}
					height={40}
					className='h-full w-auto object-contain'
				/>
			</span>
		)
	}

	return (
		<span
			className={cn(
				'flex items-center gap-2.5 text-slate-500 transition-colors hover:text-slate-300',
				className,
			)}>
			{mark && (
				<svg
					viewBox='0 0 24 24'
					fill='none'
					stroke='currentColor'
					strokeWidth={1.75}
					strokeLinecap='round'
					strokeLinejoin='round'
					aria-hidden
					className='size-7 shrink-0'>
					{mark}
				</svg>
			)}
			<span className='font-display text-lg font-semibold tracking-tight'>
				{name}
			</span>
		</span>
	)
}

// Stroke marks so a logo row reads as real lockups rather than a list of names.
export const exampleLogos: Logo[] = [
	{
		name: 'Northpoint',
		mark: (
			<>
				<circle cx='12' cy='12' r='8.5' />
				<path d='M12 3.5v17M3.5 12h17' />
			</>
		),
	},
	{ name: 'Vectorworks', mark: <path d='M12 3.5 21 20H3z' /> },
	{
		name: 'Halcyon',
		mark: (
			<>
				<circle cx='9' cy='12' r='6.5' />
				<circle cx='15' cy='12' r='6.5' />
			</>
		),
	},
	{
		name: 'Meridian',
		mark: (
			<>
				<path d='M12 2.5 21.5 12 12 21.5 2.5 12z' />
				<path d='M12 7.5 16.5 12 12 16.5 7.5 12z' />
			</>
		),
	},
	{ name: 'Ironwood', mark: <path d='M4 19V13M10 19V8M16 19V11M22 19V4' /> },
	{
		name: 'Copperline',
		mark: (
			<>
				<path d='M3.5 16.5c4-9 13-9 17 0' />
				<circle cx='12' cy='16.5' r='2.5' />
			</>
		),
	},
	{
		name: 'Stonebridge',
		mark: (
			<>
				<rect x='3.5' y='7.5' width='17' height='9' rx='1.5' />
				<path d='M8 7.5v9M16 7.5v9' />
			</>
		),
	},
]

export type Feature = {
	title: string
	blurb: string
	icon?: LucideIcon
}

export function FeatureCard({
	title = 'This is a feature title',
	blurb = 'This is the feature blurb. Two lines of supporting copy is the target so the cards stay even.',
	icon: Icon = Workflow,
	index,
	variant = 'card',
	className,
}: Partial<Feature> & {
	/** Shown by the numbered variant. */
	index?: number
	variant?: 'card' | 'inline' | 'numbered'
	className?: string
}) {
	// No card: icon beside the copy, for a dense list of capabilities.
	if (variant === 'inline') {
		return (
			<div className={cn('flex gap-4', className)}>
				<span className='flex size-10 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
					<Icon className='size-5 text-brand' />
				</span>
				<div>
					<h3 className='font-display text-base font-semibold text-white'>
						{title}
					</h3>
					<p className='mt-1.5 leading-7 text-slate-400'>{blurb}</p>
				</div>
			</div>
		)
	}

	// Numbered under a top rule, for steps or an ordered set of ideas.
	if (variant === 'numbered') {
		return (
			<div className={cn('border-t-2 border-brand/40 pt-6', className)}>
				<span className='font-display text-4xl font-semibold leading-none text-brand/40'>
					{String(index ?? 1).padStart(2, '0')}
				</span>
				<h3 className='mt-5 font-display text-lg font-semibold text-white'>
					{title}
				</h3>
				<p className='mt-2 leading-7 text-slate-400'>{blurb}</p>
			</div>
		)
	}

	return (
		<GlassCard className={cn('p-7', className)}>
			<span className='flex size-11 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
				<Icon className='size-5 text-brand' />
			</span>
			<h3 className='mt-5 font-display text-lg font-semibold text-white'>
				{title}
			</h3>
			<p className='mt-3 leading-7 text-slate-400'>{blurb}</p>
		</GlassCard>
	)
}

export type MediaItem = {
	src: string
	alt?: string
	caption?: string
}

// Lengths deliberately vary so a grid's equal rows and masonry's natural heights read differently.
export const sampleTestimonials: Testimonial[] = [
	{
		quote: 'A short quote sits perfectly well beside a long one.',
		name: 'Client Name',
		role: 'Role Or Title',
		company: 'Company Name',
	},
	{
		quote:
			'A longer quote runs several lines and pushes its card taller than the rest. In a grid, every card in that row grows to match it, which is the thing masonry avoids by letting each card keep its own height.',
		name: 'Client Name',
		role: 'Role Or Title',
		company: 'Company Name',
	},
	{
		quote:
			'Two or three of these work when a page needs breadth rather than one deep quote.',
		name: 'Client Name',
		role: 'Role Or Title',
		company: 'Company Name',
	},
	{
		quote:
			'The longest quote in the set decides how tall a grid row becomes. When the gap between shortest and longest is wide, a grid leaves visible dead space under the short ones and masonry is the better container for the same cards.',
		name: 'Client Name',
		role: 'Role Or Title',
		company: 'Company Name',
	},
	{
		quote:
			'The container changes but the card does not, so a quote reads the same everywhere.',
		name: 'Client Name',
		role: 'Role Or Title',
		company: 'Company Name',
	},
]

export const sampleCaseStudies: CaseStudyItem[] = [
	{
		name: 'This is a project name',
		category: 'Category',
		client: 'Client',
		summary:
			'This is the card summary. Two lines is the sweet spot before the grid starts to feel heavy.',
		href: '/case-studies',
	},
	{
		name: 'This is a project name',
		category: 'Category',
		client: 'Client',
		summary:
			'Cards stretch to match the tallest in the row, so summaries of uneven length still line up.',
		href: '/case-studies',
	},
	{
		name: 'This is a project name',
		category: 'Category',
		client: 'Client',
		summary:
			'Three across on desktop, two on tablet, one on mobile. Add as many as the page needs.',
		href: '/case-studies',
	},
	{
		name: 'This is a project name',
		category: 'Category',
		client: 'Client',
		summary:
			'Once the list runs past six, the index page wants a filter bar above it.',
		href: '/case-studies',
	},
	{
		name: 'This is a project name',
		category: 'Category',
		client: 'Client',
		summary:
			'On a detail page, the same cards go in a carousel to pull in the rest of the work.',
		href: '/case-studies',
	},
]

export const sampleArticles: Article[] = [
	{
		title: 'This is an article title that runs to about two lines',
		excerpt:
			'This is the article excerpt. Two lines of preview copy before the reader decides whether to open it.',
		category: 'Category',
		readTime: '6 min',
		href: '/blog',
	},
	{
		title: 'This is another article title',
		excerpt:
			'Excerpts are trimmed to a consistent length so the cards line up across the row.',
		category: 'Category',
		readTime: '4 min',
		href: '/blog',
	},
	{
		title: 'This is a third article title',
		excerpt:
			'Category and read time sit above the title, and the link sits at the bottom of the card.',
		category: 'Category',
		readTime: '8 min',
		href: '/blog',
	},
	{
		title: 'This is a fourth article title',
		excerpt:
			'A grid takes the latest three. A carousel takes the whole archive.',
		category: 'Category',
		readTime: '5 min',
		href: '/blog',
	},
	{
		title: 'This is a fifth article title',
		excerpt:
			'Both containers render the same card, so a post looks the same wherever it appears.',
		category: 'Category',
		readTime: '7 min',
		href: '/blog',
	},
]

export const samplePeople: Person[] = [
	{
		name: 'Person Name',
		role: 'Role Or Title',
		bio: 'This is a one line bio describing what this person does.',
	},
	{
		name: 'Person Name',
		role: 'Role Or Title',
		bio: 'Bios stay to a single line so the cards sit level.',
	},
	{
		name: 'Person Name',
		role: 'Role Or Title',
		bio: 'Three or four across reads best on a full-width row.',
	},
]

export const sampleRelated: RelatedItem[] = [
	{
		title: 'This is a related item title',
		meta: 'Category',
		description:
			'This is the related item description. One or two lines on why it is worth opening next.',
		href: '/blog',
	},
	{
		title: 'This is another related item',
		meta: 'Category',
		description:
			'Descriptions stay the same length so the three cards sit level across the row.',
		href: '/blog',
	},
	{
		title: 'Three related items close a detail page',
		meta: 'Category',
		description:
			'More than three starts competing with the call to action underneath it.',
		href: '/blog',
	},
]

export const sampleFeatures: Feature[] = [
	{
		title: 'This is a feature title',
		blurb:
			'This is the feature blurb. Two lines of supporting copy is the target so the cards stay even.',
	},
	{
		title: 'This is a feature title',
		blurb:
			'Every card takes an icon, a title, and a short description. The icon is optional.',
	},
	{
		title: 'This is a feature title',
		blurb:
			'Three across on desktop. Switch the column count to two for longer descriptions.',
	},
	{
		title: 'This is a feature title',
		blurb:
			'Six cards fill two clean rows, which is usually the most a page should carry.',
	},
	{
		title: 'This is a feature title',
		blurb: 'Keep titles to a few words so they never wrap onto a third line.',
	},
	{
		title: 'This is a feature title',
		blurb:
			'The grid collapses to a single column on mobile with the same spacing.',
	},
]

export const sampleMedia: MediaItem[] = [
	{ src: '/scheduler/scheduler.png', caption: 'This is a media caption' },
	{ src: '/hub/hub.png', caption: 'Captions are optional per item' },
	{ src: '/portal/portal.png', caption: 'This is a media caption' },
	{ src: '/reports/reports.png', caption: 'This is a media caption' },
	{ src: '/mmc/mmc.png', caption: 'This is a media caption' },
]

// Mixed portrait and landscape shots, for layouts that must cope with uneven proportions.
export const samplePhotos: MediaItem[] = [
	{
		src: '/section-images/tom-podmore-p8lNJRI9MRc-unsplash.jpg',
		caption: 'Landscape, 3:2',
	},
	{
		src: '/section-images/kevin-bonefaas-40qDC-wqp4g-unsplash.jpg',
		caption: 'Portrait, 2:3',
	},
	{
		src: '/section-images/heino-eisner-oOmRb7EPHro-unsplash.jpg',
		caption: 'Landscape, 4:3',
	},
	{
		src: '/section-images/mavis-hopper-FFPu5QDn40Y-unsplash.jpg',
		caption: 'Portrait, 3:4',
	},
	{
		src: '/section-images/gabriel-hohenstein-UGzxTdhC254-unsplash.jpg',
		caption: 'Landscape, 3:2',
	},
	{
		src: '/section-images/microsoft-copilot-pqMPnPo4_ZA-unsplash.jpg',
		caption: 'Portrait, 2:3',
	},
	{
		src: '/section-images/sandisk-OOJJoY1vwzQ-unsplash.jpg',
		caption: 'Landscape, 3:2',
	},
	{
		src: '/section-images/eugene-golovesov-U9d2x-SfIG4-unsplash.jpg',
		caption: 'Landscape, 3:2',
	},
	{
		src: '/section-images/microsoft-copilot-MJLy1fUvX_w-unsplash.jpg',
		caption: 'Landscape, 3:2',
	},
	{
		src: '/section-images/tom-podmore-i3AQoPduUkU-unsplash.jpg',
		caption: 'Landscape, 3:2',
	},
]
