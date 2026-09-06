'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'
import type { MediaItem } from './cards'

function LightboxNavButton({
	label,
	side,
	onClick,
}: {
	label: string
	side: 'left' | 'right'
	onClick: () => void
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			aria-label={label}
			className={cn(
				'absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-ink/70 text-white backdrop-blur transition-colors hover:bg-ink/90',
				side === 'left' ? 'left-4' : 'right-4',
			)}>
			{side === 'left' ? (
				<ChevronLeft className='size-5' />
			) : (
				<ChevronRight className='size-5' />
			)}
		</button>
	)
}

export function MediaCard({
	src = '/scheduler/scheduler.png',
	alt = '',
	caption = 'This is the media caption, describing what is on screen.',
	fill = false,
	natural = false,
	className,
}: Partial<MediaItem> & {
	/** Fill the parent cell instead of holding 16:9, for collage layouts. */
	fill?: boolean
	/** Take the image's own ratio instead of 16:9, for masonry and mixed sets. */
	natural?: boolean
	className?: string
}) {
	const triggerRef = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const [items, setItems] = useState<MediaItem[]>([])
	const [index, setIndex] = useState(0)
	const [ratio, setRatio] = useState<number | null>(null)
	const [cardRatio, setCardRatio] = useState<number | null>(null)

	// The enclosing <section> is the group, so a whole grid or carousel opens as one set.
	const openLightbox = () => {
		const trigger = triggerRef.current
		const scope = trigger?.closest('section')
		const nodes = scope
			? [...scope.querySelectorAll<HTMLButtonElement>('[data-media-item]')]
			: []
		const found = nodes.map((node) => ({
			src: node.dataset.src ?? '',
			alt: node.dataset.alt ?? '',
			caption: node.dataset.caption || undefined,
		}))

		setItems(found.length ? found : [{ src, alt, caption }])
		setIndex(found.length && trigger ? Math.max(0, nodes.indexOf(trigger)) : 0)
		setRatio(null)
		setOpen(true)
	}

	const current = items[index]
	const many = items.length > 1

	const go = (step: number) => {
		setRatio(null)
		setIndex((value) => (value + step + items.length) % items.length)
	}

	useEffect(() => {
		if (!open || !many) return
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'ArrowLeft') go(-1)
			if (event.key === 'ArrowRight') go(1)
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
	})

	return (
		<>
			<figure className={cn(fill && 'h-full', className)}>
				<button
					ref={triggerRef}
					type='button'
					onClick={openLightbox}
					data-media-item
					data-src={src}
					data-alt={alt}
					data-caption={caption}
					aria-label={caption ? `Open ${caption}` : 'Open media'}
					className={cn('group block w-full cursor-zoom-in', fill && 'h-full')}>
					<GlassCard
						interactive
						style={natural ? { aspectRatio: cardRatio ?? 16 / 9 } : undefined}
						className={cn(
							'relative w-full overflow-hidden',
							fill && 'h-full',
							!fill && !natural && 'aspect-video',
						)}>
						<Image
							src={src}
							alt={alt}
							fill
							sizes='(min-width: 1024px) 34rem, 90vw'
							onLoad={(event) => {
								if (!natural) return
								const { naturalWidth, naturalHeight } = event.currentTarget
								if (naturalWidth && naturalHeight)
									setCardRatio(naturalWidth / naturalHeight)
							}}
							className='object-cover'
						/>
						<span className='absolute inset-0 flex items-center justify-center bg-ink/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'>
							<span className='flex size-12 items-center justify-center rounded-full border border-white/20 bg-ink/70 backdrop-blur'>
								<Maximize2 className='size-5 text-white' />
							</span>
						</span>
					</GlassCard>
				</button>
				{caption && !fill && (
					<figcaption className='mt-4 text-sm text-slate-500'>
						{caption}
					</figcaption>
				)}
			</figure>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className='gap-0 border-white/10 bg-panel p-3 pt-12 sm:max-w-[min(72rem,calc(100%-2rem))]'>
					<DialogTitle className='sr-only'>
						{current?.caption ?? 'Media'}
					</DialogTitle>
					{current && (
						<figure>
							{/* The frame takes the image's own ratio, so it is never padded or cropped. */}
							<div
								style={{ aspectRatio: ratio ?? 16 / 9 }}
								className='relative w-full overflow-hidden rounded-md bg-ink'>
								<Image
									key={current.src}
									src={current.src}
									alt={current.alt ?? ''}
									fill
									sizes='90vw'
									onLoad={(event) => {
										const { naturalWidth, naturalHeight } = event.currentTarget
										if (naturalWidth && naturalHeight)
											setRatio(naturalWidth / naturalHeight)
									}}
									className='object-contain'
								/>
								{many && (
									<>
										<LightboxNavButton
											label='Previous image'
											side='left'
											onClick={() => go(-1)}
										/>
										<LightboxNavButton
											label='Next image'
											side='right'
											onClick={() => go(1)}
										/>
									</>
								)}
							</div>
							<figcaption className='mt-3 flex items-center justify-between gap-4 px-1 text-sm text-slate-400'>
								<span>{current.caption}</span>
								{many && (
									<span className='shrink-0 tabular-nums text-slate-500'>
										{index + 1} / {items.length}
									</span>
								)}
							</figcaption>
						</figure>
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}
