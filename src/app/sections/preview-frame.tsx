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
import { SettingsDialog } from './settings-dialog'
import {
	readSettings,
	writeSettings,
	type ThemeSettings,
} from './theme-settings'

// A null width means fill the stage, which is what Desktop does.
const viewports = [
	{
		id: 'desktop',
		label: 'Desktop',
		icon: Monitor,
		width: null,
		rotate: false,
	},
	{ id: 'laptop', label: 'Laptop', icon: Laptop, width: 1280, rotate: false },
	{
		id: 'tablet-landscape',
		label: 'Tablet Landscape',
		icon: Tablet,
		width: 1194,
		rotate: true,
	},
	{ id: 'tablet', label: 'Tablet', icon: Tablet, width: 834, rotate: false },
	{
		id: 'mobile-landscape',
		label: 'Mobile Landscape',
		icon: Smartphone,
		width: 844,
		rotate: true,
	},
	{
		id: 'mobile',
		label: 'Mobile',
		icon: Smartphone,
		width: 390,
		rotate: false,
	},
] as const

const MIN_WIDTH = 280
const MAX_WIDTH = 3840

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

	const commitDraft = () => {
		if (draftWidth === null) return
		const parsed = Number(draftWidth)
		if (!Number.isFinite(parsed) || parsed <= 0) {
			setDraftWidth(null)
			return
		}
		setWidth(Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH))
	}

	// `w` drives the wrapper, not the page, so it never reaches the frame.
	const frameParams = new URLSearchParams(params.toString())
	frameParams.delete('w')
	const frameQuery = frameParams.toString()

	const measured = stage.width > 0
	const frameWidth = requestedWidth ?? stage.width
	const shownWidth =
		draftWidth ?? String(Math.round(requestedWidth ?? stage.width))

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
									{viewport.width ? (
										<span className='ml-1.5 text-slate-500'>
											{viewport.width}px
										</span>
									) : null}
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

					<div className='ml-2 shrink-0 border-l border-white/10 pl-2'>
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
								'mx-auto block bg-ink motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out',
								requestedWidth !== null && 'border-x border-white/10',
							)}
							style={{
								width: measured ? frameWidth : '100%',
								height: stage.height || '100%',
							}}
						/>
						<ScrollBar orientation='horizontal' />
					</ScrollArea>
				</div>
			</div>
		</TooltipProvider>
	)
}
