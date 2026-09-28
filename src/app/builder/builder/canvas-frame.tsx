'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
	ExternalLink,
	Laptop,
	Monitor,
	Redo2,
	Smartphone,
	Tablet,
	Undo2,
} from 'lucide-react'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
	defaultBackground,
	writeBackground,
	type BackgroundSettings,
} from '@/app/builder/background-settings'
import { SettingsDialog } from '@/app/builder/settings-dialog'
import { backgroundCss } from '@/app/section-preview/theme'
import { useBuilder } from '@/lib/builder/builder-context'
import {
	defaultSettings,
	writeSettings,
	type ThemeSettings,
} from '@/app/builder/theme-settings'
import type { NavPage } from '@/components/built-chrome'
import type { Chrome } from '@/lib/builder/page-schema'
import type { Block } from '@/lib/builder/types'

const viewports = [
	{
		id: 'desktop',
		label: 'Desktop',
		width: null,
		icon: Monitor,
		rotate: false,
	},
	{ id: 'laptop', label: 'Laptop', width: 1280, icon: Laptop, rotate: false },
	{
		id: 'tablet-landscape',
		label: 'Tablet Landscape',
		width: 1024,
		icon: Tablet,
		rotate: true,
	},
	{ id: 'tablet', label: 'Tablet', width: 768, icon: Tablet, rotate: false },
	{
		id: 'mobile-landscape',
		label: 'Mobile Landscape',
		width: 640,
		icon: Smartphone,
		rotate: true,
	},
	{
		id: 'mobile',
		label: 'Mobile',
		width: 390,
		icon: Smartphone,
		rotate: false,
	},
] as const

const MIN_WIDTH = 280
const MAX_WIDTH = 3840
const HANDLE_WIDTH = 12
const clampWidth = (value: number, max = MAX_WIDTH) =>
	Math.min(Math.max(Math.round(value), MIN_WIDTH), max)

export function CanvasFrame({
	blocks,
	selectedId,
	viewHref,
	nav,
	chrome,
	currentSlug,
	onSelect,
	onUndo,
	onRedo,
}: {
	blocks: Block[]
	selectedId: string | null
	viewHref: string
	nav: NavPage[]
	chrome: Chrome
	currentSlug: string
	onSelect: (id: string | null) => void
	onUndo: () => void
	onRedo: () => void
}) {
	const stageRef = useRef<HTMLDivElement>(null)
	const frameRef = useRef<HTMLIFrameElement>(null)
	const store = useBuilder()
	const [stage, setStage] = useState({ width: 0, height: 0 })
	const [width, setWidth] = useState<number | null>(null)
	const [draftWidth, setDraftWidth] = useState<string | null>(null)
	const settings = store.look.theme
	const setSettings = (theme: ThemeSettings) => store.setLook({ theme })
	const background = store.look.page
	const [frameReady, setFrameReady] = useState(false)
	const [drag, setDrag] = useState<{
		side: 'left' | 'right'
		startX: number
		startWidth: number
	} | null>(null)
	const [dragWidth, setDragWidth] = useState<number | null>(null)

	useEffect(() => {
		const el = stageRef.current
		if (!el) return
		const observer = new ResizeObserver(([entry]) =>
			setStage({
				width: entry.contentRect.width,
				height: entry.contentRect.height,
			}),
		)
		observer.observe(el)
		return () => observer.disconnect()
	}, [])

	// The chrome and per-block surfaces cannot ride the URL without key collisions.
	const surfaceCss = [
		backgroundCss(store.look.header, 'header', false),
		backgroundCss(store.look.footer, 'footer', false),
		...Object.entries(store.look.blocks).map(([id, surface]) =>
			backgroundCss(surface, 'page', false, `[data-block-id='${id}'] > *`),
		),
	].join('\n')

	const post = useCallback(() => {
		frameRef.current?.contentWindow?.postMessage(
			{
				kind: 'builder:page',
				blocks,
				selectedId,
				nav,
				chrome,
				currentSlug,
				surfaceCss,
			},
			window.location.origin,
		)
	}, [blocks, selectedId, nav, chrome, currentSlug, surfaceCss])

	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (event.origin !== window.location.origin) return
			if (event.data?.kind === 'builder:ready') setFrameReady(true)
			if (event.data?.kind === 'builder:select') onSelect(event.data.id ?? null)
			if (event.data?.kind === 'builder:duplicate' && event.data.id)
				store.duplicateSection(event.data.id)
			if (event.data?.kind === 'builder:remove' && event.data.id)
				store.removeSection(event.data.id)
		}
		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
	}, [onSelect, store])

	useEffect(() => {
		if (frameReady) post()
	}, [frameReady, post])

	const query = (() => {
		const params = writeBackground(
			writeSettings(new URLSearchParams(), settings),
			background,
		)
		return params.toString()
	})()

	const measured = stage.width > 0
	const activeViewport = viewports.find((viewport) => viewport.width === width)
	const fallbackWidth = width ?? stage.width
	const liveWidth = drag && dragWidth !== null ? dragWidth : fallbackWidth
	const shownWidth = draftWidth ?? String(Math.round(liveWidth))
	const edgeOffset = Math.max(0, (stage.width - liveWidth) / 2)

	const commitDraft = () => {
		if (draftWidth === null) return
		const parsed = Number(draftWidth)
		if (Number.isFinite(parsed) && parsed > 0) setWidth(clampWidth(parsed))
		setDraftWidth(null)
	}

	const startDrag = (side: 'left' | 'right') => (event: React.PointerEvent) => {
		event.currentTarget.setPointerCapture(event.pointerId)
		setDrag({ side, startX: event.clientX, startWidth: liveWidth })
		setDragWidth(liveWidth)
	}

	const moveDrag = (event: React.PointerEvent) => {
		if (!drag) return
		const delta =
			(event.clientX - drag.startX) * (drag.side === 'left' ? -2 : 2)
		setDragWidth(clampWidth(drag.startWidth + delta, stage.width || MAX_WIDTH))
	}

	const endDrag = (event: React.PointerEvent) => {
		if (!drag) return
		event.currentTarget.releasePointerCapture(event.pointerId)
		if (dragWidth !== null) setWidth(dragWidth)
		setDrag(null)
		setDragWidth(null)
	}

	const nudge = (side: 'left' | 'right') => (event: React.KeyboardEvent) => {
		const step = event.shiftKey ? 100 : 20
		const sign = side === 'left' ? -1 : 1
		if (event.key === 'ArrowRight')
			setWidth(clampWidth(liveWidth + step * sign))
		else if (event.key === 'ArrowLeft')
			setWidth(clampWidth(liveWidth - step * sign))
		else if (event.key === 'Home') setWidth(MIN_WIDTH)
		else if (event.key === 'End') setWidth(null)
		else return
		event.preventDefault()
	}

	const handle = (side: 'left' | 'right') => (
		<div
			role='separator'
			aria-orientation='vertical'
			aria-label={`Drag to resize the preview from the ${side}`}
			aria-valuenow={Math.round(liveWidth)}
			aria-valuemin={MIN_WIDTH}
			aria-valuemax={MAX_WIDTH}
			tabIndex={0}
			onPointerDown={startDrag(side)}
			onPointerMove={moveDrag}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onKeyDown={nudge(side)}
			style={{ [side]: Math.max(0, edgeOffset - HANDLE_WIDTH) }}
			className='group absolute inset-y-0 z-20 flex w-3 cursor-col-resize touch-none items-center justify-center focus:outline-none'>
			<span
				className={cn(
					'h-14 w-1 rounded-full transition-colors',
					drag?.side === side
						? 'bg-brand'
						: 'bg-white/20 group-hover:bg-brand/70 group-focus-visible:bg-brand',
				)}
			/>
		</div>
	)

	return (
		<TooltipProvider>
			<div className='flex h-full flex-col'>
				<div className='flex items-center gap-1 border-b border-white/10 px-3 py-2'>
					{viewports.map((viewport) => {
						const active = activeViewport?.id === viewport.id
						return (
							<Tooltip key={viewport.id}>
								<TooltipTrigger asChild>
									<button
										type='button'
										onClick={() => setWidth(viewport.width)}
										aria-pressed={active}
										className={cn(
											'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors',
											active
												? 'bg-brand/15 text-brand'
												: 'text-slate-400 hover:bg-white/5 hover:text-white',
										)}>
										<viewport.icon
											className={cn('size-4', viewport.rotate && 'rotate-90')}
										/>
										<span className='sr-only'>{viewport.label}</span>
									</button>
								</TooltipTrigger>
								<TooltipContent side='bottom'>
									{viewport.label}
									<span className='ml-1.5 text-slate-500'>
										{viewport.width ?? Math.round(stage.width)}px
									</span>
								</TooltipContent>
							</Tooltip>
						)
					})}

					<div className='mx-auto flex items-center gap-1.5'>
						<input
							type='number'
							min={MIN_WIDTH}
							max={MAX_WIDTH}
							value={shownWidth}
							aria-label='Preview width in pixels'
							onChange={(event) => setDraftWidth(event.target.value)}
							onBlur={commitDraft}
							onKeyDown={(event) => {
								if (event.key === 'Enter') event.currentTarget.blur()
								if (event.key === 'Escape') setDraftWidth(null)
							}}
							className='w-20 rounded-md border border-white/10 bg-white/4 px-2 py-1 text-center text-xs tabular-nums text-slate-200 transition-colors hover:border-white/20 focus:border-brand/50 focus:outline-none'
						/>
						<span className='text-xs text-slate-500'>px</span>
						{width !== null && (
							<button
								type='button'
								onClick={() => setWidth(null)}
								className='ml-1 text-xs text-slate-500 transition-colors hover:text-white'>
								Reset
							</button>
						)}
					</div>

					<div className='flex shrink-0 items-center gap-1'>
						<button
							type='button'
							onClick={onUndo}
							aria-label='Undo'
							className='flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-white'>
							<Undo2 className='size-4' />
						</button>
						<button
							type='button'
							onClick={onRedo}
							aria-label='Redo'
							className='flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-white'>
							<Redo2 className='size-4' />
						</button>
					</div>

					<div className='ml-2 flex shrink-0 items-center gap-1 border-l border-white/10 pl-2'>
						<SettingsDialog settings={settings} onChange={setSettings} />
						<Tooltip>
							<TooltipTrigger asChild>
								<a
									href={viewHref}
									target='_blank'
									rel='noreferrer'
									className='flex h-8 items-center gap-1.5 rounded-md bg-brand/15 px-2.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/25'>
									<ExternalLink className='size-3.5' /> View
								</a>
							</TooltipTrigger>
							<TooltipContent side='bottom'>
								Open the site in a new tab
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<div
					ref={stageRef}
					className='relative flex-1 overflow-hidden bg-black/30'>
					{/* An iframe gives the preview its own viewport so media queries actually fire. */}
					<iframe
						ref={frameRef}
						src={`/page-preview${query ? `?${query}` : ''}`}
						title='Page preview'
						onLoad={post}
						className={cn(
							'mx-auto block bg-ink',
							!drag &&
								'motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out',
							liveWidth < stage.width && 'border-x border-white/10',
						)}
						style={{
							width: measured ? liveWidth : '100%',
							height: stage.height || '100%',
						}}
					/>

					{drag && <div className='absolute inset-0 z-10 cursor-col-resize' />}
					{measured && handle('left')}
					{measured && handle('right')}
				</div>
			</div>
		</TooltipProvider>
	)
}
