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
	className,
	children,
}: HeadingProps & {
	columns?: keyof typeof columnClasses
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
			<div
				className={cn(
					'grid gap-5',
					columnClasses[columns],
					hasHeading && 'mt-12',
				)}>
				{children}
			</div>
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
	className,
	children,
}: HeadingProps & {
	size?: CarouselSize
	label?: string
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
			<CarouselTrack label={label} className={cn(hasHeading && 'mt-12')}>
				{React.Children.map(children, (child) => (
					<CarouselItem size={size}>{child}</CarouselItem>
				))}
			</CarouselTrack>
		</Section>
	)
}

export function Marquee({
	eyebrow,
	className,
	children,
}: {
	eyebrow?: string
	className?: string
	children: React.ReactNode
}) {
	return (
		<Section className={className}>
			{eyebrow && <p className='eyebrow text-center'>{eyebrow}</p>}
			{/* Masked at both edges so items fade rather than clip at the viewport. */}
			<div
				className={cn(
					'group -mx-6 overflow-hidden mask-[linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]',
					eyebrow && 'mt-9',
				)}>
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
		</Section>
	)
}
