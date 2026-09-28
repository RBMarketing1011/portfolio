import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Info, User, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { withHeadingIds } from '@/lib/builder/rich-text'
import { cn } from '@/lib/utils'
import { ActionButton, type Action } from './primitives'

export function ProseBlock({
	children,
	html,
	headings = 'plain',
	align = 'left',
	textAlign = 'left',
	className,
}: {
	children?: React.ReactNode
	/** Authored HTML from the builder's editor. Sanitised in the hydrator. */
	html?: string
	/** How headings inside the block are marked. */
	headings?: 'plain' | 'ruled' | 'marked'
	/** Where the measure sits inside the section. */
	align?: 'left' | 'center' | 'right'
	/** How the copy is aligned inside the measure. */
	textAlign?: 'left' | 'center' | 'right'
	className?: string
}) {
	const classes = cn(
		'max-w-3xl px-6 text-lg leading-8 text-slate-300 sm:px-0',
		align === 'center' && 'mx-auto',
		align === 'right' && 'ml-auto',
		textAlign === 'center' && 'text-center',
		textAlign === 'right' && 'text-right',
		'[&>h2]:mt-14 [&>h2]:font-display [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:text-white',
		'[&>h3]:mt-10 [&>h3]:font-display [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:text-white',
		'[&>h4]:mt-8 [&>h4]:font-display [&>h4]:text-lg [&>h4]:font-semibold [&>h4]:text-white',
		'[&>h5]:mt-6 [&>h5]:font-display [&>h5]:text-base [&>h5]:font-semibold [&>h5]:text-white',
		'[&>h6]:mt-6 [&>h6]:font-display [&>h6]:text-sm [&>h6]:font-semibold [&>h6]:uppercase [&>h6]:tracking-widest [&>h6]:text-slate-400',
		headings === 'ruled' &&
			'[&>h2]:border-t [&>h2]:border-white/12 [&>h2]:pt-8 [&>h3]:border-t [&>h3]:border-white/8 [&>h3]:pt-6',
		headings === 'marked' &&
			'[&>h2]:border-l-2 [&>h2]:border-brand [&>h2]:pl-5 [&>h3]:border-l-2 [&>h3]:border-brand/50 [&>h3]:pl-5',
		'[&>p]:mt-6',
		'[&>hr]:mt-8 [&>hr]:border-white/10',
		'[&>pre]:mt-6 [&>pre]:overflow-x-auto [&>pre]:rounded-lg [&>pre]:bg-white/4 [&>pre]:p-4 [&>pre]:text-sm',
		'[&>ul]:mt-6 [&>ul]:space-y-3 [&>ul]:pl-5 [&>ul>li]:list-disc [&>ul>li]:marker:text-brand',
		'[&>ol]:mt-6 [&>ol]:space-y-3 [&>ol]:pl-5 [&>ol>li]:list-decimal [&>ol>li]:marker:text-brand',
		'[&>blockquote]:mt-8 [&>blockquote]:border-l-2 [&>blockquote]:border-brand [&>blockquote]:pl-6 [&>blockquote]:italic [&>blockquote]:text-slate-400',
		'[&>a]:text-brand [&>a]:underline [&>a]:underline-offset-4',
		'[&_code]:rounded [&_code]:bg-white/8 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em]',
		className,
	)

	// Set on this element rather than a wrapper, or the `[&>…]` rules stop matching.
	if (html) {
		return (
			<div
				className={classes}
				dangerouslySetInnerHTML={{ __html: withHeadingIds(html) }}
			/>
		)
	}

	return (
		<div className={classes}>
			{children ?? (
				<>
					<p>
						This is the opening paragraph of a prose block. It holds long-form
						body copy at a comfortable measure, with headings, lists, and quotes
						all styled from the container so article content needs no extra
						classes.
					</p>
					<h2>This is a heading inside prose</h2>
					<p>
						This is a following paragraph. Spacing between elements is handled
						by the block itself, so authored content stays clean.
					</p>
					<ul>
						<li>This is a list item inside prose</li>
						<li>Markers pick up the brand color automatically</li>
						<li>Ordered lists are styled the same way</li>
					</ul>
					<blockquote>
						This is a pull quote inside prose. It sits against a brand rule and
						reads slightly quieter than the body copy around it.
					</blockquote>
					<h3>This is a subheading</h3>
					<p>
						This is the closing paragraph. Anything that needs to break out of
						the measure, like a callout or an image, sits outside this block.
					</p>
				</>
			)}
		</div>
	)
}

export function Callout({
	label = 'Note',
	children = 'This is a callout. It pulls a warning, an aside, or a key takeaway out of the surrounding copy without breaking the reading flow.',
	html,
	icon: Icon = Info,
	design = 'card',
	align = 'left',
	className,
}: {
	label?: string
	children?: React.ReactNode
	html?: string
	/** Leave unset for no icon at all. */
	icon?: LucideIcon
	/** How the callout separates itself from the surrounding copy. */
	design?: 'card' | 'rule' | 'banner'
	/** Where the block sits in the section, or full to drop the measure. */
	align?: 'left' | 'center' | 'right' | 'full'
	className?: string
}) {
	const box = cn(
		align === 'full' ? 'max-w-none' : 'max-w-3xl',
		align === 'center' && 'mx-auto',
		align === 'right' && 'ml-auto',
	)
	const body = html ? (
		<div dangerouslySetInnerHTML={{ __html: html }} />
	) : (
		children
	)

	if (design === 'rule') {
		return (
			<div className={cn('my-8 border-l-2 border-brand py-1 pl-6', box, className)}>
				<p className='eyebrow'>{label}</p>
				<div className='mt-2 leading-7 text-slate-300'>{body}</div>
			</div>
		)
	}

	if (design === 'banner') {
		return (
			<div
				className={cn(
					'my-8 flex items-start gap-4 rounded-lg bg-brand/12 p-5',
					box,
					className,
				)}>
				{Icon && <Icon className='mt-0.5 size-5 shrink-0 text-brand' />}
				<div className='leading-7 text-slate-200'>
					<span className='font-semibold text-brand'>{label}: </span>
					{body}
				</div>
			</div>
		)
	}

	return (
		<GlassCard variant='accent' className={cn('my-8 p-6', box, className)}>
			<div className='flex gap-4'>
				{Icon && <Icon className='mt-0.5 size-5 shrink-0 text-brand' />}
				<div>
					<Badge className='uppercase tracking-widest'>{label}</Badge>
					<div className='mt-3 leading-7 text-slate-300'>{body}</div>
				</div>
			</div>
		</GlassCard>
	)
}

export function AuthorBio({
	name = 'Author Name',
	role = 'Role, Company',
	bio = 'This is the author bio. Two lines on who wrote the piece and why they are worth listening to on this subject.',
	image,
	imageSide = 'left',
	action = {
		label: 'More About The Author',
		href: '/about',
		icon: ArrowRight,
		style: 'link',
	},
	align = 'left',
	design = 'card',
	className,
}: {
	name?: string
	role?: string
	bio?: string
	/** Author portrait. Falls back to the placeholder mark. */
	image?: string
	/** Which side the portrait sits on. The copy takes the other side. */
	imageSide?: 'left' | 'right'
	action?: Action
	/** Where the block sits in the section. */
	align?: 'left' | 'center' | 'right'
	/** How the bio block is framed. */
	design?: 'card' | 'bare' | 'centered'
	className?: string
}) {
	const centered = design === 'centered'
	const right = imageSide === 'right'

	const avatar = (
		<div
			className={cn(
				'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/4',
				centered ? 'size-20' : 'size-16',
			)}>
			{image ? (
				<Image src={image} alt={name} fill sizes='5rem' className='object-cover' />
			) : (
				<User
					className={
						centered ? 'size-9 text-slate-600' : 'size-7 text-slate-600'
					}
					strokeWidth={1.5}
				/>
			)}
		</div>
	)

	const copy = (
		<div className={cn(centered ? 'mt-5' : undefined, right && 'sm:text-right')}>
			<p className='font-display text-lg font-semibold text-white'>{name}</p>
			<p className='mt-0.5 text-sm font-medium text-brand'>{role}</p>
			<p className='mt-3 leading-7 text-slate-400'>{bio}</p>
			{action?.label && (
				<ActionButton
					action={action}
					fallbackStyle='link'
					size='sm'
					className='mt-4'
				/>
			)}
		</div>
	)

	const box = cn(
		align === 'center' && 'mx-auto',
		align === 'right' && 'ml-auto',
		className,
	)

	if (centered) {
		return (
			<div
				className={cn(
					'max-w-3xl border-y border-white/10 px-6 py-10 text-center',
					box,
				)}>
				<div className='flex justify-center'>{avatar}</div>
				{copy}
			</div>
		)
	}

	const row = cn(
		'flex flex-col gap-5 sm:flex-row',
		right && 'sm:flex-row-reverse',
	)

	if (design === 'bare') {
		return (
			<div
				className={cn(
					'max-w-3xl border-t border-white/10 pt-7',
					row,
					box,
				)}>
				{avatar}
				{copy}
			</div>
		)
	}

	return (
		<GlassCard className={cn('max-w-3xl p-7', box)}>
			<div className={row}>
				{avatar}
				{copy}
			</div>
		</GlassCard>
	)
}
