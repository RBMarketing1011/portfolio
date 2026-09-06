'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Slightly under an even split so the next card always peeks and the track reads as scrollable.
const basisClasses = {
	sm: 'basis-[70%] sm:basis-[38%] lg:basis-[23%]',
	md: 'basis-[84%] sm:basis-[47%] lg:basis-[31%]',
	lg: 'basis-[90%] sm:basis-[68%] lg:basis-[47%]',
	full: 'basis-full',
} as const

export type CarouselSize = keyof typeof basisClasses

export function CarouselItem({
	size = 'md',
	className,
	children,
}: {
	size?: CarouselSize
	className?: string
	children: React.ReactNode
}) {
	return (
		<li
			className={cn(
				// The lone child stretches so every card in the row matches the tallest.
				'flex shrink-0 snap-start flex-col *:flex-1',
				basisClasses[size],
				className,
			)}>
			{children}
		</li>
	)
}

// Scroll positions a dot can jump to: each item that can reach the front, plus the
// end of the track when the last of those still leaves cards out of view.
function scrollStops(el: HTMLUListElement) {
	const items = [...el.children] as HTMLElement[]
	const origin = items[0]?.offsetLeft ?? 0
	const distance = el.scrollWidth - el.clientWidth
	const stops = items
		.map((item) => item.offsetLeft - origin)
		.filter((position) => position <= distance + 1)

	if (stops.length && distance - stops[stops.length - 1] > 1)
		stops.push(distance)
	return stops.length ? stops : [0]
}

export function Carousel({
	label = 'Carousel',
	className,
	children,
}: {
	label?: string
	className?: string
	children: React.ReactNode
}) {
	const trackRef = React.useRef<HTMLUListElement>(null)
	const [state, setState] = React.useState({
		offset: 0,
		scrollable: true,
		active: 0,
		count: 0,
	})

	const sync = React.useCallback(() => {
		const el = trackRef.current
		if (!el) return
		const distance = el.scrollWidth - el.clientWidth
		const stops = scrollStops(el)

		let active = 0
		let nearest = Infinity
		stops.forEach((position, index) => {
			const gap = Math.abs(position - el.scrollLeft)
			if (gap < nearest) {
				nearest = gap
				active = index
			}
		})

		setState({
			offset: distance > 0 ? el.scrollLeft / distance : 0,
			scrollable: distance > 1,
			active,
			count: stops.length,
		})
	}, [])

	React.useEffect(() => {
		const el = trackRef.current
		if (!el) return
		sync()
		const observer = new ResizeObserver(sync)
		observer.observe(el)
		return () => observer.disconnect()
	}, [sync])

	const step = (direction: 1 | -1) => {
		const el = trackRef.current
		if (!el) return
		const first = el.firstElementChild as HTMLElement | null
		const distance = first
			? first.getBoundingClientRect().width + 20
			: el.clientWidth
		el.scrollBy({ left: direction * distance, behavior: 'smooth' })
	}

	const goTo = (index: number) => {
		const el = trackRef.current
		if (!el) return
		el.scrollTo({ left: scrollStops(el)[index] ?? 0, behavior: 'smooth' })
	}

	const atStart = state.offset <= 0.01
	const atEnd = state.offset >= 0.99

	return (
		<div className={cn('group/carousel', className)}>
			<ul
				ref={trackRef}
				onScroll={sync}
				aria-label={label}
				className='-mx-6 flex snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto scroll-smooth scrollbar-none px-6 pb-2'>
				{children}
			</ul>

			{state.scrollable && (
				<div className='mt-8 flex items-center justify-between gap-6'>
					<div className='flex items-center gap-2'>
						{Array.from({ length: state.count }, (_, index) => (
							<button
								key={index}
								type='button'
								onClick={() => goTo(index)}
								aria-label={`Go to item ${index + 1}`}
								aria-current={index === state.active}
								className='group/dot flex h-4 items-center'>
								{/* Active stretches into a pill so position reads at a glance. */}
								<span
									className={cn(
										'block h-1.5 rounded-full transition-all duration-300',
										index === state.active
											? 'w-7 bg-brand'
											: 'w-1.5 bg-white/25 group-hover/dot:bg-white/50',
									)}
								/>
							</button>
						))}
					</div>
					<div className='flex shrink-0 gap-2 opacity-0 transition-opacity duration-200 group-focus-within/carousel:opacity-100 group-hover/carousel:opacity-100'>
						<CarouselButton
							label='Previous'
							disabled={atStart}
							onClick={() => step(-1)}>
							<ChevronLeft className='size-5' />
						</CarouselButton>
						<CarouselButton
							label='Next'
							disabled={atEnd}
							onClick={() => step(1)}>
							<ChevronRight className='size-5' />
						</CarouselButton>
					</div>
				</div>
			)}
		</div>
	)
}

function CarouselButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string
	disabled: boolean
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type='button'
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className='flex size-11 items-center justify-center rounded-full border border-white/12 bg-white/4 text-slate-300 transition-colors hover:border-brand hover:bg-brand hover:text-ink disabled:pointer-events-none disabled:opacity-35'>
			{children}
		</button>
	)
}
