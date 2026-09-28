'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
	Check,
	ChevronLeft,
	ChevronRight,
	FastForward,
	Maximize,
	Minimize,
	Pause,
	Play,
	Rewind,
	RotateCcw,
	Volume2,
	VolumeX,
	type LucideIcon,
} from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'
import { MediaCard } from './media-card'
import { Section, SectionHeading } from './primitives'

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
	const total = Math.floor(seconds)
	return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

function ControlButton({
	label,
	onClick,
	children,
}: {
	label: string
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			title={label}
			aria-label={label}
			className='flex size-9 shrink-0 items-center justify-center rounded-md text-slate-200 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'>
			{children}
		</button>
	)
}

const ASPECTS: Record<string, number> = {
	'16:9': 16 / 9,
	'9:16': 9 / 16,
	'4:5': 4 / 5,
}

export function VideoPlayer({
	eyebrow = 'Eyebrow',
	title = 'This is the video section heading',
	description = 'This is the video description. It frames what the viewer is about to watch.',
	src = '/scheduler/scheduler.mp4',
	poster,
	caption = 'This is the video caption, describing what is on screen.',
	loop = false,
	skipSeconds = 10,
	aspect = '16:9',
	layout = 'stacked',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	src?: string
	/** Optional. Without one the browser shows the video's own first frame. */
	poster?: string
	caption?: string
	loop?: boolean
	/** How far the skip-forward and skip-back buttons jump. */
	skipSeconds?: number
	aspect?: '16:9' | '9:16' | '4:5'
	/** Where the copy sits, or player on its own. */
	layout?: 'stacked' | 'text-left' | 'text-right' | 'player'
}) {
	const frameRef = useRef<HTMLDivElement>(null)
	const videoRef = useRef<HTMLVideoElement>(null)
	const [playing, setPlaying] = useState(false)
	const [time, setTime] = useState(0)
	const [duration, setDuration] = useState(0)
	const [buffered, setBuffered] = useState(0)
	const [muted, setMuted] = useState(false)
	const [fullscreen, setFullscreen] = useState(false)

	useEffect(() => {
		const onChange = () =>
			setFullscreen(document.fullscreenElement === frameRef.current)
		document.addEventListener('fullscreenchange', onChange)
		return () => document.removeEventListener('fullscreenchange', onChange)
	}, [])

	const toggle = useCallback(() => {
		const video = videoRef.current
		if (!video) return
		if (video.paused) void video.play()
		else video.pause()
	}, [])

	const seekTo = useCallback((seconds: number) => {
		const video = videoRef.current
		if (!video) return
		const max = Number.isFinite(video.duration) ? video.duration : 0
		video.currentTime = Math.min(Math.max(seconds, 0), max)
		setTime(video.currentTime)
	}, [])

	const restart = () => {
		seekTo(0)
		const video = videoRef.current
		if (video?.paused) void video.play()
	}

	const toggleFullscreen = () => {
		if (document.fullscreenElement) void document.exitFullscreen()
		else void frameRef.current?.requestFullscreen()
	}

	const progress = duration > 0 ? (time / duration) * 100 : 0
	const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0

	const player = (
		<figure>
			<GlassCard
				ref={frameRef}
				style={{ aspectRatio: ASPECTS[aspect] ?? ASPECTS['16:9'] }}
				className='group relative w-full overflow-hidden bg-ink'>
				<video
					ref={videoRef}
					src={src}
					poster={poster}
					playsInline
					loop={loop}
					muted={muted}
					preload='metadata'
					onClick={toggle}
					onPlay={() => setPlaying(true)}
					onPause={() => setPlaying(false)}
					onEnded={() => setPlaying(false)}
					onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
					onDurationChange={(e) => setDuration(e.currentTarget.duration)}
					onProgress={(e) => {
						const ranges = e.currentTarget.buffered
						if (ranges.length) setBuffered(ranges.end(ranges.length - 1))
					}}
					className='size-full cursor-pointer object-cover'
				/>

				{!playing && (
					<button
						type='button'
						onClick={toggle}
						aria-label='Play video'
						className='absolute inset-0 flex items-center justify-center bg-ink/45 transition-colors'>
						<span className='flex size-16 items-center justify-center rounded-full border border-white/20 bg-ink/70 backdrop-blur'>
							<Play className='size-6 translate-x-0.5 text-white' />
						</span>
					</button>
				)}

				<div
					className={cn(
						'absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-ink/95 via-ink/70 to-transparent px-4 pb-3 pt-10 transition-opacity duration-200',
						playing
							? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
							: 'opacity-100',
					)}>
					<div className='group/seek relative flex h-4 items-center'>
						<div className='absolute inset-x-0 h-1 rounded-full bg-white/20' />
						<div
							className='absolute h-1 rounded-full bg-white/30'
							style={{ width: `${bufferedProgress}%` }}
						/>
						<div
							className='absolute h-1 rounded-full bg-brand'
							style={{ width: `${progress}%` }}
						/>
						<span
							className='pointer-events-none absolute size-3 -translate-x-1/2 rounded-full bg-brand transition-transform group-has-focus-visible/seek:scale-125 group-has-focus-visible/seek:ring-2 group-has-focus-visible/seek:ring-white'
							style={{ left: `${progress}%` }}
						/>
						{/* Transparent native range keeps drag, keyboard, and a11y for free. */}
						<input
							type='range'
							min={0}
							max={duration || 0}
							step={0.1}
							value={time}
							onChange={(event) => seekTo(Number(event.target.value))}
							aria-label='Seek'
							aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
							className='absolute inset-x-0 h-4 w-full cursor-pointer appearance-none bg-transparent focus:outline-none [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none'
						/>
					</div>

					<div className='mt-1.5 flex items-center gap-1'>
						<ControlButton label={playing ? 'Pause' : 'Play'} onClick={toggle}>
							{playing ? (
								<Pause className='size-5' />
							) : (
								<Play className='size-5' />
							)}
						</ControlButton>
						<ControlButton label='Restart' onClick={restart}>
							<RotateCcw className='size-4' />
						</ControlButton>
						<ControlButton
							label={`Back ${skipSeconds} seconds`}
							onClick={() => seekTo(time - skipSeconds)}>
							<Rewind className='size-4' />
						</ControlButton>
						<ControlButton
							label={`Forward ${skipSeconds} seconds`}
							onClick={() => seekTo(time + skipSeconds)}>
							<FastForward className='size-4' />
						</ControlButton>

						<span className='ml-2 font-mono text-xs tabular-nums text-slate-300'>
							{formatTime(time)}{' '}
							<span className='text-slate-500'>/ {formatTime(duration)}</span>
						</span>

						<div className='ml-auto flex items-center gap-1'>
							<ControlButton
								label={muted ? 'Unmute' : 'Mute'}
								onClick={() => setMuted((value) => !value)}>
								{muted ? (
									<VolumeX className='size-4' />
								) : (
									<Volume2 className='size-4' />
								)}
							</ControlButton>
							<ControlButton
								label={fullscreen ? 'Exit full screen' : 'Full screen'}
								onClick={toggleFullscreen}>
								{fullscreen ? (
									<Minimize className='size-4' />
								) : (
									<Maximize className='size-4' />
								)}
							</ControlButton>
						</div>
					</div>
				</div>
			</GlassCard>
			{caption && (
				<figcaption className='mt-4 text-sm text-slate-500'>
					{caption}
				</figcaption>
			)}
		</figure>
	)

	if (layout === 'player') {
		return (
			<Section>
				<div className='mx-auto max-w-4xl'>{player}</div>
			</Section>
		)
	}

	if (layout === 'text-left' || layout === 'text-right') {
		return (
			<Section>
				<div className='grid items-center gap-12 lg:grid-cols-2'>
					<div className={layout === 'text-right' ? 'lg:order-2' : undefined}>
						<SectionHeading
							eyebrow={eyebrow}
							title={title}
							description={description}
						/>
					</div>
					<div className={layout === 'text-right' ? 'lg:order-1' : undefined}>
						{player}
					</div>
				</div>
			</Section>
		)
	}

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			<div className='mt-12'>{player}</div>
		</Section>
	)
}

export function MediaGallery({
	eyebrow = 'Eyebrow',
	title = 'This is the media gallery heading',
	description = 'This is the gallery description. Use it when one screenshot cannot carry the project.',
	items = [
		{
			src: '/scheduler/scheduler.png',
			alt: '',
			caption: 'This is the first shot caption',
		},
		{
			src: '/hub/hub.png',
			alt: '',
			caption: 'This is the second shot caption',
		},
		{
			src: '/portal/portal.png',
			alt: '',
			caption: 'This is the third shot caption',
		},
		{
			src: '/reports/reports.png',
			alt: '',
			caption: 'This is the fourth shot caption',
		},
	],
	thumbnails = 'bottom',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	items?: { src: string; alt: string; caption?: string }[]
	/** Where the thumbnail strip sits, or a carousel with no strip at all. */
	thumbnails?: 'bottom' | 'side' | 'top' | 'carousel'
}) {
	// A freshly added row has no image yet, and next/image throws on an empty src.
	const shots = items.filter((item) => Boolean(item?.src))
	const [active, setActive] = useState(0)
	const index = Math.min(active, Math.max(shots.length - 1, 0))
	const current = shots[index]
	const side = thumbnails === 'side'
	const carousel = thumbnails === 'carousel'

	if (!current) {
		return (
			<Section>
				<SectionHeading
					eyebrow={eyebrow}
					title={title}
					description={description}
				/>
				<div className='mt-12 flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-slate-500'>
					Add an image to this gallery
				</div>
			</Section>
		)
	}

	const step = (delta: number) =>
		setActive((index + delta + shots.length) % shots.length)

	const lead = (
		<>
			<GlassCard className='relative aspect-video w-full overflow-hidden'>
				<Image
					key={current.src}
					src={current.src}
					alt={current.alt ?? ''}
					fill
					sizes='(min-width: 1024px) 72rem, 100vw'
					className='object-cover'
				/>
				{carousel && shots.length > 1 && (
					<>
						<button
							type='button'
							onClick={() => step(-1)}
							aria-label='Previous image'
							className='absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ink/70 text-white transition-colors hover:bg-ink'>
							<ChevronLeft className='size-5' />
						</button>
						<button
							type='button'
							onClick={() => step(1)}
							aria-label='Next image'
							className='absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ink/70 text-white transition-colors hover:bg-ink'>
							<ChevronRight className='size-5' />
						</button>
					</>
				)}
			</GlassCard>
			{current.caption && (
				<p className='mt-4 text-sm text-slate-500'>{current.caption}</p>
			)}
			{carousel && shots.length > 1 && (
				<div className='mt-5 flex justify-center gap-2'>
					{shots.map((shot, dot) => (
						<button
							key={dot}
							type='button'
							onClick={() => setActive(dot)}
							aria-label={`Go to image ${dot + 1}`}
							aria-current={dot === index}
							className={cn(
								'h-1.5 rounded-full transition-all',
								dot === index ? 'w-6 bg-brand' : 'w-1.5 bg-white/25',
							)}
						/>
					))}
				</div>
			)}
		</>
	)

	const strip = (
		<ul
			className={cn(
				'gap-4',
				side
					? 'grid grid-cols-3 sm:grid-cols-1'
					: 'grid grid-cols-2 sm:grid-cols-4',
			)}>
			{shots.map((item, thumb) => (
				<li key={thumb}>
					<button
						type='button'
						onClick={() => setActive(thumb)}
						aria-current={thumb === index}
						className={cn(
							'relative block aspect-video w-full overflow-hidden rounded-lg border transition-colors',
							thumb === index
								? 'border-brand'
								: 'border-white/10 hover:border-white/30',
						)}>
						<Image
							src={item.src}
							alt=''
							fill
							sizes='16rem'
							className={cn(
								'object-cover transition-opacity',
								thumb === index ? 'opacity-100' : 'opacity-55',
							)}
						/>
					</button>
				</li>
			))}
		</ul>
	)

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			{carousel ? (
				<div className='mt-12'>{lead}</div>
			) : side ? (
				<div className='mt-12 grid gap-6 sm:grid-cols-[1fr_10rem]'>
					<div>{lead}</div>
					{strip}
				</div>
			) : (
				<div className='mt-12'>
					{thumbnails === 'top' ? (
						<>
							{strip}
							<div className='mt-6'>{lead}</div>
						</>
					) : (
						<>
							{lead}
							<div className='mt-6'>{strip}</div>
						</>
					)}
				</div>
			)}
		</Section>
	)
}

export function MediaMosaic({
	eyebrow = 'Eyebrow',
	title = 'This is the media mosaic heading',
	description = 'A lead shot with supporting ones around it, for when one image carries more weight than the rest.',
	items = [
		{ src: '/scheduler/scheduler.png', caption: 'This is the lead shot' },
		{ src: '/hub/hub.png', caption: 'This is a supporting shot' },
		{ src: '/portal/portal.png', caption: 'This is a supporting shot' },
		{ src: '/reports/reports.png', caption: 'This is a supporting shot' },
		{ src: '/mmc/mmc.png', caption: 'This is a supporting shot' },
	],
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	items?: { src: string; alt?: string; caption?: string }[]
}) {
	const [lead, ...rest] = items

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			{/* Auto rows rather than a fixed height, so a sixth image wraps onto a new
			    row instead of being clipped out of the grid. */}
			<div className='mt-12 grid grid-cols-2 gap-4 sm:auto-rows-[11rem] sm:grid-cols-4 lg:auto-rows-[16rem]'>
				{lead && (
					<div className='col-span-2 aspect-4/3 sm:row-span-2 sm:aspect-auto'>
						<MediaCard fill {...lead} />
					</div>
				)}
				{rest.map((item, index) => (
					<div
						key={index}
						className='aspect-square sm:aspect-auto'>
						<MediaCard fill {...item} />
					</div>
				))}
			</div>
		</Section>
	)
}

export function ImageCompare({
	eyebrow = 'Eyebrow',
	title = 'This is the before and after heading',
	description = 'Drag the handle to wipe between the two shots. Arrow keys work once it has focus.',
	before = { src: '/hub/hub.png', label: 'Before' },
	after = { src: '/portal/portal.png', label: 'After' },
	points = [],
	layout = 'stacked',
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	before?: { src: string; alt?: string; label?: string }
	after?: { src: string; alt?: string; label?: string }
	/** Optional supporting points beside the comparison. */
	points?: (string | { text?: string; icon?: LucideIcon })[]
	/** Where the copy sits relative to the comparison. */
	layout?: 'stacked' | 'text-left' | 'text-right'
}) {
	const [position, setPosition] = useState(50)
	const [ratio, setRatio] = useState<number | null>(null)
	const beside = layout !== 'stacked'

	const copy = (
		<div className={layout === 'text-right' ? 'lg:order-2' : undefined}>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			{points.length > 0 && (
				<ul className='mt-7 space-y-3'>
					{points.map((point, index) => {
						const text =
							typeof point === 'string' ? point : (point?.text ?? '')
						const Glyph =
							typeof point === 'string' ? Check : (point?.icon ?? Check)
						return (
							<li key={index} className='flex gap-3 text-slate-300'>
								<Glyph className='mt-1 size-4 shrink-0 text-brand' />
								<span className='leading-7'>{text}</span>
							</li>
						)
					})}
				</ul>
			)}
		</div>
	)

	const frame = (
		<div
			style={{ aspectRatio: ratio ?? 16 / 9 }}
			className={cn(
				'group/compare relative w-full overflow-hidden rounded-xl border border-white/10 bg-ink',
				beside ? (layout === 'text-right' ? 'lg:order-1' : '') : 'mt-12',
			)}>
				<Image
					src={after.src}
					alt={after.alt ?? ''}
					fill
					sizes='(min-width: 1024px) 72rem, 100vw'
					onLoad={(event) => {
						const { naturalWidth, naturalHeight } = event.currentTarget
						if (naturalWidth && naturalHeight)
							setRatio(naturalWidth / naturalHeight)
					}}
					className='object-cover'
				/>
				{/* Clipping the top layer is what produces the wipe. */}
				<div
					className='absolute inset-0'
					style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
					<Image
						src={before.src}
						alt={before.alt ?? ''}
						fill
						sizes='(min-width: 1024px) 72rem, 100vw'
						className='object-cover'
					/>
				</div>

				{before.label && (
					<span className='pointer-events-none absolute left-4 top-4 rounded-md bg-ink/75 px-2.5 py-1 text-xs font-semibold uppercase tracking-widest text-slate-200 backdrop-blur'>
						{before.label}
					</span>
				)}
				{after.label && (
					<span className='pointer-events-none absolute right-4 top-4 rounded-md bg-ink/75 px-2.5 py-1 text-xs font-semibold uppercase tracking-widest text-slate-200 backdrop-blur'>
						{after.label}
					</span>
				)}

				<div
					className='pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-brand'
					style={{ left: `${position}%` }}
				/>
				<span
					className='pointer-events-none absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-ink/80 text-white backdrop-blur group-has-focus-visible/compare:ring-2 group-has-focus-visible/compare:ring-white'
					style={{ left: `${position}%` }}>
					<ChevronLeft className='size-4' />
					<ChevronRight className='size-4' />
				</span>

				{/* Transparent native range keeps drag, keyboard, and a11y for free. */}
				<input
					type='range'
					min={0}
					max={100}
					step={0.1}
					value={position}
					onChange={(event) => setPosition(Number(event.target.value))}
					aria-label='Compare position'
					aria-valuetext={`${Math.round(position)}% ${before.label ?? 'before'}`}
					className='absolute inset-0 size-full cursor-ew-resize appearance-none bg-transparent focus:outline-none [&::-moz-range-thumb]:h-full [&::-moz-range-thumb]:w-11 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent [&::-webkit-slider-thumb]:h-full [&::-webkit-slider-thumb]:w-11 [&::-webkit-slider-thumb]:appearance-none'
				/>
			</div>
	)

	if (beside) {
		return (
			<Section>
				<div className='grid items-center gap-12 lg:grid-cols-2'>
					{copy}
					{frame}
				</div>
			</Section>
		)
	}

	return (
		<Section>
			{copy}
			{frame}
		</Section>
	)
}

export function Figure({
	src = '/hub/hub.png',
	alt = '',
	caption = 'This is a figure caption. It sits under an image inside long-form copy.',
	design = 'below',
	align = 'left',
	className,
}: {
	src?: string
	alt?: string
	caption?: string
	/** Where the caption sits and how the image is framed. */
	design?: 'below' | 'framed' | 'beside'
	/** Where the figure sits in the section, or full to drop the measure. */
	align?: 'left' | 'center' | 'right' | 'full'
	className?: string
}) {
	const box = cn(
		align === 'full' && 'max-w-none!',
		align === 'center' && 'mx-auto',
		align === 'right' && 'ml-auto',
	)

	const image = (
		<div className='relative aspect-video w-full overflow-hidden rounded-xl border border-white/10'>
			<Image
				src={src}
				alt={alt}
				fill
				sizes='(min-width: 768px) 48rem, 100vw'
				className='object-cover'
			/>
		</div>
	)

	if (design === 'framed') {
		return (
			<figure className={cn('my-10 max-w-3xl', box, className)}>
				<GlassCard className='p-3'>
					{image}
					{caption && (
						<figcaption className='px-2 py-3 text-sm leading-6 text-slate-500'>
							{caption}
						</figcaption>
					)}
				</GlassCard>
			</figure>
		)
	}

	if (design === 'beside') {
		return (
			<figure
				className={cn(
					'my-10 grid max-w-4xl gap-5 sm:grid-cols-[10rem_1fr]',
					box,
					className,
				)}>
				{caption && (
					<figcaption className='order-2 border-t border-white/10 pt-3 text-sm leading-6 text-slate-500 sm:order-1 sm:border-t-0 sm:border-r sm:pt-0 sm:pr-5 sm:text-right'>
						{caption}
					</figcaption>
				)}
				<div className='order-1 sm:order-2'>{image}</div>
			</figure>
		)
	}

	return (
		<figure className={cn('my-10 max-w-3xl', box, className)}>
			{image}
			{caption && (
				<figcaption className='mt-3 text-sm leading-6 text-slate-500'>
					{caption}
				</figcaption>
			)}
		</figure>
	)
}
