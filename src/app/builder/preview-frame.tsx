'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Laptop, Monitor, Smartphone, Tablet } from 'lucide-react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { BackgroundDrawer } from './background-drawer'
import {
	readBackground,
	writeBackground,
	type BackgroundSettings,
} from './background-settings'
import { SettingsDialog } from './settings-dialog'
import {
	readSettings,
	writeSettings,
	type ThemeSettings,
} from './theme-settings'

// Devices widest first, sized to Tailwind's breakpoints. A null width fills the stage.
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

export function PreviewFrame({
	slug,
	name,
	variants,
}: {
	slug: string
	name: string
	variants: { id: string; name: string }[]
}) {
	const router = useRouter()
	const pathname = usePathname()
	const params = useSearchParams()
	const stageRef = useRef<HTMLDivElement>(null)
	const [stage, setStage] = useState({ width: 0, height: 0 })
	const [draftWidth, setDraftWidth] = useState<string | null>(null)
	const [drag, setDrag] = useState<{
		side: 'left' | 'right'
		startX: number
		startWidth: number
	} | null>(null)
	const [dragWidth, setDragWidth] = useState<number | null>(null)

	// Desktop resolves to a measured pixel width so the frame animates px to px.
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

	const requested = Number(params.get('w'))
	const requestedWidth =
		Number.isFinite(requested) && requested > 0 ? requested : null
	const activeViewport = viewports.find(
		(viewport) => viewport.width === requestedWidth,
	)

	const settings = readSettings(new URLSearchParams(params.toString()))
	const background = readBackground(new URLSearchParams(params.toString()))
	// A variant id from a previous entry would leave the select showing nothing.
	const requestedVariant = params.get('v')
	const variantId = variants.some((item) => item.id === requestedVariant)
		? (requestedVariant as string)
		: variants[0]?.id

	const push = (next: URLSearchParams) => {
		const query = next.toString()
		router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
	}

	const setWidth = (width: number | null) => {
		const next = new URLSearchParams(params.toString())
		if (width === null) next.delete('w')
		else next.set('w', String(Math.round(width)))
		setDraftWidth(null)
		push(next)
	}

	const setVariant = (id: string) => {
		const next = new URLSearchParams(params.toString())
		if (id === variants[0]?.id) next.delete('v')
		else next.set('v', id)
		push(next)
	}

	const applySettings = (value: ThemeSettings) =>
		push(writeSettings(new URLSearchParams(params.toString()), value))

	const applyBackground = (value: BackgroundSettings) =>
		push(writeBackground(new URLSearchParams(params.toString()), value))

	const commitDraft = () => {
		if (draftWidth === null) return
		const parsed = Number(draftWidth)
		if (!Number.isFinite(parsed) || parsed <= 0) {
			setDraftWidth(null)
			return
		}
		setWidth(clampWidth(parsed))
	}

	// `w` drives the wrapper, not the page, so it never reaches the frame.
	const frameParams = new URLSearchParams(params.toString())
	frameParams.delete('w')
	const frameQuery = frameParams.toString()

	const measured = stage.width > 0
	const frameWidth = requestedWidth ?? stage.width
	const liveWidth = dragWidth ?? frameWidth
	const shownWidth = draftWidth ?? String(Math.round(liveWidth))
	// The frame is centered, so each edge accounts for half of any width change.
	const edgeOffset = Math.max(0, (stage.width - liveWidth) / 2)

	const startDrag =
		(side: 'left' | 'right') => (event: React.PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) return
			event.preventDefault()
			event.currentTarget.setPointerCapture(event.pointerId)
			setDrag({ side, startX: event.clientX, startWidth: frameWidth })
			setDragWidth(frameWidth)
		}

	const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!drag) return
		const delta =
			(event.clientX - drag.startX) * (drag.side === 'left' ? -2 : 2)
		// Never past the visible stage, but a preset wider than the stage can stay put.
		const max = Math.max(stage.width, drag.startWidth)
		setDragWidth(clampWidth(drag.startWidth + delta, max))
	}

	const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!drag) return
		event.currentTarget.releasePointerCapture(event.pointerId)
		const committed = dragWidth
		setDrag(null)
		setDragWidth(null)
		if (committed !== null) setWidth(committed)
	}

	const nudge =
		(side: 'left' | 'right') =>
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			const step = event.shiftKey ? 100 : 20
			const max = Math.max(stage.width, frameWidth)
			const grow = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
			const shrink = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
			if (event.key === grow) setWidth(clampWidth(frameWidth + step * 2, max))
			else if (event.key === shrink)
				setWidth(clampWidth(frameWidth - step * 2, max))
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
			// Sits in the gutter beside the frame so it never covers the preview's scrollbar,
			// and tucks against the stage edge once the frame fills it.
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
			<div className='flex h-screen flex-col'>
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
						{requestedWidth !== null && (
							<button
								type='button'
								onClick={() => setWidth(null)}
								className='ml-1 text-xs text-slate-500 transition-colors hover:text-white'>
								Reset
							</button>
						)}
					</div>

					{variants.length > 1 && (
						<Select value={variantId} onValueChange={setVariant}>
							<SelectTrigger
								size='sm'
								aria-label='Variant'
								className='w-48 shrink-0 border-white/10 bg-white/4 text-xs text-slate-200'>
								<SelectValue placeholder='Variant' />
							</SelectTrigger>
							<SelectContent>
								{variants.map((variant) => (
									<SelectItem key={variant.id} value={variant.id}>
										{variant.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

					<div className='ml-2 flex shrink-0 items-center gap-1 border-l border-white/10 pl-2'>
						<SettingsDialog settings={settings} onChange={applySettings} />
					</div>
				</div>

				<div
					ref={stageRef}
					className='relative flex-1 overflow-hidden bg-black/30'>
					<ScrollArea className='size-full'>
						{/* An iframe gives the preview its own viewport so media queries actually fire. */}
						<iframe
							key={slug}
							src={`/section-preview/${slug}${frameQuery ? `?${frameQuery}` : ''}`}
							title={`${name} preview`}
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
						<ScrollBar orientation='horizontal' />
					</ScrollArea>

					{/* Keeps the pointer out of the iframe for the whole drag. */}
					{drag && <div className='absolute inset-0 z-10 cursor-col-resize' />}
					{measured && handle('left')}
					{measured && handle('right')}
				</div>
			</div>
		</TooltipProvider>
	)
}
