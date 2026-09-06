'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
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

export function VideoPlayer({
	eyebrow = 'Eyebrow',
	title = 'This is the video section heading',
	description = 'This is the video description. It frames what the viewer is about to watch.',
	src = '/scheduler/scheduler.mp4',
	poster = '/scheduler/scheduler.png',
	caption = 'This is the video caption, describing what is on screen.',
	loop = false,
	skipSeconds = 10,
	aspect = 16 / 9,
	bare = false,
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	src?: string
	poster?: string
	caption?: string
	loop?: boolean
	skipSeconds?: number
	/** Fallback frame ratio, used until the video reports its own. */
	aspect?: number
	/** Render just the player, for use inside another section. */
	bare?: boolean
}) {
	const frameRef = useRef<HTMLDivElement>(null)
	const videoRef = useRef<HTMLVideoElement>(null)
	const [playing, setPlaying] = useState(false)
	const [ratio, setRatio] = useState<number | null>(null)
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
				style={{ aspectRatio: ratio ?? aspect }}
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
					onLoadedMetadata={(e) => {
						const { videoWidth, videoHeight } = e.currentTarget
						if (videoWidth && videoHeight) setRatio(videoWidth / videoHeight)
					}}
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

	if (bare) return player

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
	/** Where the thumbnail strip sits relative to the lead image. */
	thumbnails?: 'bottom' | 'side' | 'top'
}) {
	const [active, setActive] = useState(0)
	const current = items[active]
	const side = thumbnails === 'side'

	const lead = (
		<>
			<GlassCard className='relative aspect-video w-full overflow-hidden'>
				<Image
					key={current.src}
					src={current.src}
					alt={current.alt}
					fill
					sizes='(min-width: 1024px) 72rem, 100vw'
					className='object-cover'
				/>
			</GlassCard>
			{current.caption && (
				<p className='mt-4 text-sm text-slate-500'>{current.caption}</p>
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
			{items.map((item, index) => (
				<li key={item.src}>
					<button
						type='button'
						onClick={() => setActive(index)}
						aria-current={index === active}
						className={cn(
							'relative block aspect-video w-full overflow-hidden rounded-lg border transition-colors',
							index === active
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
								index === active ? 'opacity-100' : 'opacity-55',
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
			{side ? (
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
			{/* The lead keeps its emphasis at every width: full bleed and taller on
			    small screens, then a 2x2 block once the mosaic forms at sm. */}
			<div className='mt-12 grid grid-cols-2 gap-4 sm:h-96 sm:grid-cols-4 sm:grid-rows-2 lg:h-136'>
				{lead && (
					<div className='col-span-2 aspect-4/3 sm:row-span-2 sm:aspect-auto'>
						<MediaCard fill {...lead} />
					</div>
				)}
				{rest.map((item) => (
					<div key={item.src} className='aspect-square sm:aspect-auto'>
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
}: {
	eyebrow?: string
	title?: React.ReactNode
	description?: string
	before?: { src: string; alt?: string; label?: string }
	after?: { src: string; alt?: string; label?: string }
}) {
	const [position, setPosition] = useState(50)
	const [ratio, setRatio] = useState<number | null>(null)

	return (
		<Section>
			<SectionHeading
				eyebrow={eyebrow}
				title={title}
				description={description}
			/>
			<div
				style={{ aspectRatio: ratio ?? 16 / 9 }}
				className='group/compare relative mt-12 w-full overflow-hidden rounded-xl border border-white/10 bg-ink'>
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
		</Section>
	)
}

export function Figure({
	src = '/hub/hub.png',
	alt = '',
	caption = 'This is a figure caption. It sits under an image inside long-form copy.',
	design = 'below',
	className,
}: {
	src?: string
	alt?: string
	caption?: string
	/** Where the caption sits and how the image is framed. */
	design?: 'below' | 'framed' | 'beside'
	className?: string
}) {
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
			<figure className={cn('my-10 max-w-3xl', className)}>
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
		<figure className={cn('my-10 max-w-3xl', className)}>
			{image}
			{caption && (
				<figcaption className='mt-3 text-sm leading-6 text-slate-500'>
					{caption}
				</figcaption>
			)}
		</figure>
	)
}
