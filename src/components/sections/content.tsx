import Link from 'next/link'
import { ArrowRight, Info, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

export function ProseBlock({
	children,
	className,
}: {
	children?: React.ReactNode
	className?: string
}) {
	return (
		<div
			className={cn(
				'max-w-3xl text-lg leading-8 text-slate-300',
				'[&>h2]:mt-14 [&>h2]:font-display [&>h2]:text-2xl [&>h2]:font-semibold [&>h2]:text-white',
				'[&>h3]:mt-10 [&>h3]:font-display [&>h3]:text-xl [&>h3]:font-semibold [&>h3]:text-white',
				'[&>p]:mt-6',
				'[&>ul]:mt-6 [&>ul]:space-y-3 [&>ul]:pl-5 [&>ul>li]:list-disc [&>ul>li]:marker:text-brand',
				'[&>ol]:mt-6 [&>ol]:space-y-3 [&>ol]:pl-5 [&>ol>li]:list-decimal [&>ol>li]:marker:text-brand',
				'[&>blockquote]:mt-8 [&>blockquote]:border-l-2 [&>blockquote]:border-brand [&>blockquote]:pl-6 [&>blockquote]:italic [&>blockquote]:text-slate-400',
				'[&>a]:text-brand [&>a]:underline [&>a]:underline-offset-4',
				className,
			)}>
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
						<li>Markers pick up the brand colour automatically</li>
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
	className,
}: {
	label?: string
	children?: React.ReactNode
	className?: string
}) {
	return (
		<GlassCard variant='accent' className={cn('my-8 max-w-3xl p-6', className)}>
			<div className='flex gap-4'>
				<Info className='mt-0.5 size-5 shrink-0 text-brand' />
				<div>
					<Badge className='uppercase tracking-widest'>{label}</Badge>
					<div className='mt-3 leading-7 text-slate-300'>{children}</div>
				</div>
			</div>
		</GlassCard>
	)
}

export function AuthorBio({
	name = 'Author Name',
	role = 'Role, Company',
	bio = 'This is the author bio. Two lines on who wrote the piece and why they are worth listening to on this subject.',
	href = '/about',
	linkLabel = 'More About The Author',
	className,
}: {
	name?: string
	role?: string
	bio?: string
	href?: string
	linkLabel?: string
	className?: string
}) {
	return (
		<GlassCard className={cn('max-w-3xl p-7', className)}>
			<div className='flex flex-col gap-5 sm:flex-row'>
				<div className='flex size-16 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/4'>
					<User className='size-7 text-slate-600' strokeWidth={1.5} />
				</div>
				<div>
					<p className='font-display text-lg font-semibold text-white'>
						{name}
					</p>
					<p className='mt-0.5 text-sm font-medium text-brand'>{role}</p>
					<p className='mt-3 leading-7 text-slate-400'>{bio}</p>
					<Link
						href={href}
						className='mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand-strong'>
						{linkLabel} <ArrowRight className='size-4' />
					</Link>
				</div>
			</div>
		</GlassCard>
	)
}
