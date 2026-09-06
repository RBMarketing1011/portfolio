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
	className,
}: Partial<Testimonial> & { featured?: boolean; className?: string }) {
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
				<span className='block font-semibold text-white'>{name}</span>
				<span className='mt-1 block text-slate-400'>{role}</span>
				<span className='mt-0.5 block text-slate-500'>{company}</span>
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
	className,
}: Partial<CaseStudyItem> & { className?: string }) {
	return (
		<GlassCard interactive asChild className={className}>
			<Link href={href} className='flex flex-col p-7'>
				<div className='aspect-video w-full rounded-lg border border-white/10 bg-white/3' />
				<div className='mt-6 flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500'>
					<span>{category}</span>
					<span>·</span>
					<span>{client}</span>
				</div>
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
	className,
}: Partial<Article> & { className?: string }) {
	return (
		<GlassCard interactive asChild className={className}>
			<Link href={href} className='flex flex-col p-7'>
				<div className='flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500'>
					<span className='text-brand'>{category}</span>
					<span>·</span>
					<span>{readTime}</span>
				</div>
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
	className,
}: Partial<Person> & { className?: string }) {
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
	className,
}: Partial<RelatedItem> & { className?: string }) {
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
	className,
}: Partial<Feature> & { className?: string }) {
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
