// Generic containers. They arrange whatever display items are passed as children
// and know nothing about what those items are.
import * as React from 'react'
import {
	Carousel as CarouselTrack,
	CarouselItem,
	type CarouselSize,
} from '@/components/ui/carousel'
import { cn } from '@/lib/utils'
import { Section, SectionHeading } from './primitives'

const columnClasses = {
	2: 'sm:grid-cols-2',
	3: 'sm:grid-cols-2 lg:grid-cols-3',
	4: 'sm:grid-cols-2 lg:grid-cols-4',
} as const

const masonryColumns = {
	2: 'sm:columns-2',
	3: 'sm:columns-2 lg:columns-3',
	4: 'sm:columns-2 lg:columns-4',
} as const

type HeadingProps = {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
}

export function Grid({
	eyebrow,
	title,
	description,
	columns = 3,
	heading = 'above',
	className,
	children,
}: HeadingProps & {
	columns?: keyof typeof columnClasses
	/** Where the section heading sits relative to the cells. */
	heading?: 'above' | 'beside' | 'centered'
	className?: string
	children: React.ReactNode
}) {
	const hasHeading = Boolean(eyebrow || title || description)

	const cells = (
		<div className={cn('grid gap-5', columnClasses[columns])}>{children}</div>
	)

	if (hasHeading && heading === 'beside') {
		return (
			<Section className={className}>
				<div className='grid gap-12 lg:grid-cols-[18rem_1fr]'>
					<div className='lg:sticky lg:top-28 lg:self-start'>
						<SectionHeading
							eyebrow={eyebrow}
							title={title}
							description={description}
						/>
					</div>
					<div className={cn('grid gap-5', columnClasses[2])}>{children}</div>
				</div>
			</Section>
		)
	}

	return (
		<Section className={className}>
			{hasHeading && (
				<SectionHeading
					eyebrow={eyebrow}
					title={title}
					description={description}
					align={heading === 'centered' ? 'center' : undefined}
				/>
			)}
			<div className={cn(hasHeading && 'mt-12')}>{cells}</div>
		</Section>
	)
}

export function Masonry({
	eyebrow,
	title,
	description,
	columns = 3,
	className,
	children,
}: HeadingProps & {
	columns?: keyof typeof masonryColumns
	className?: string
	children: React.ReactNode
}) {
	const hasHeading = Boolean(eyebrow || title || description)

	return (
		<Section className={className}>
			{hasHeading && (
				<SectionHeading
					eyebrow={eyebrow}
					title={title}
					description={description}
				/>
			)}
			{/* CSS columns rather than grid, so each item keeps its own height. */}
			<div
				className={cn(
					'gap-5 *:mb-5 *:break-inside-avoid',
					masonryColumns[columns],
					hasHeading && 'mt-12',
				)}>
				{children}
			</div>
		</Section>
	)
}

export function Carousel({
	eyebrow,
	title,
	description,
	size = 'md',
	label = 'Carousel',
	controls = 'below',
	className,
	children,
}: HeadingProps & {
	size?: CarouselSize
	label?: string
	controls?: 'below' | 'overlay' | 'bars'
	className?: string
	children: React.ReactNode
}) {
	const hasHeading = Boolean(eyebrow || title || description)

	return (
		<Section className={className}>
			{hasHeading && (
				<SectionHeading
					eyebrow={eyebrow}
					title={title}
					description={description}
				/>
			)}
			<CarouselTrack
				label={label}
				controls={controls}
				className={cn(hasHeading && 'mt-12')}>
				{React.Children.map(children, (child) => (
					<CarouselItem size={size}>{child}</CarouselItem>
				))}
			</CarouselTrack>
		</Section>
	)
}

export function Marquee({
	eyebrow,
	heading = 'centered',
	className,
	children,
}: {
	eyebrow?: string
	/** How the label sits against the track. */
	heading?: 'centered' | 'rule' | 'inline'
	className?: string
	children: React.ReactNode
}) {
	const track = (
		// Masked at both edges so items fade rather than clip at the viewport.
		<div className='group overflow-hidden mask-[linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]'>
			{/* Two identical copies; the keyframe shifts exactly one, so the loop has no seam. */}
			<div className='flex w-max animate-marquee gap-14 group-hover:paused'>
				{[0, 1].map((copy) => (
					<div
						key={copy}
						aria-hidden={copy === 1}
						className='flex shrink-0 items-center gap-14'>
						{children}
					</div>
				))}
			</div>
		</div>
	)

	// Label pinned to the left with the track running beside it.
	if (heading === 'inline') {
		return (
			<Section className={className}>
				<div className='flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10'>
					{eyebrow && (
						<p className='eyebrow shrink-0 sm:max-w-32 sm:leading-5'>
							{eyebrow}
						</p>
					)}
					<div className='min-w-0 flex-1'>{track}</div>
				</div>
			</Section>
		)
	}

	// Label left, rule filling the rest of the width above the track.
	if (heading === 'rule') {
		return (
			<Section className={className}>
				{eyebrow && (
					<div className='flex items-center gap-5'>
						<p className='eyebrow shrink-0'>{eyebrow}</p>
						<span aria-hidden className='h-px flex-1 bg-white/12' />
					</div>
				)}
				<div className={cn('-mx-6', eyebrow && 'mt-9')}>{track}</div>
			</Section>
		)
	}

	return (
		<Section className={className}>
			{eyebrow && <p className='eyebrow text-center'>{eyebrow}</p>}
			<div className={cn('-mx-6', eyebrow && 'mt-9')}>{track}</div>
		</Section>
	)
}
