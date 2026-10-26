'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
	ExternalLink,
	Laptop,
	Loader2,
	Monitor,
	Redo2,
	Smartphone,
	Sparkles,
	Tablet,
	Undo2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { writeBackground } from '@/app/builder/background-settings'
import { SettingsDialog } from '@/app/builder/settings-dialog'
import { SaveButton } from '@/app/builder/save-button'
import { lookCss } from '@/app/section-preview/theme'
import { useBuilder } from '@/lib/builder/builder-context'
import { builtSiteVars, cssText } from '@/lib/builder/look'
import { writeSettings, type ThemeSettings } from '@/app/builder/theme-settings'
import type { NavPage } from '@/components/built-chrome'
import type { Chrome } from '@/lib/builder/page-schema'
import type { Block } from '@/lib/builder/types'
import { useAiBuild } from './ai-build-host'
import { writtenCount } from './ai-build-runner'
import { useBuilderAi } from './builder-ai'
import { SectionAiDialog } from './section-ai-dialog'

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

/**
 * "Build with AI" in the toolbar. While a build runs it is the chip that reopens it
 * ("Building · 3 of 8"); a build that finished while minimized waits here for Apply; an
 * unfinished one from an earlier visit offers Resume; after a landing it counts the
 * placeholders left to fill in.
 */
function BuildWithAiButton({ hasPages }: { hasPages: boolean }) {
	const ai = useAiBuild()
	if (!ai.enabled) return null
	const state = ai.state
	const pages = 'pages' in state ? state.pages : []
	const progress = `${writtenCount(pages)} of ${pages.length}`

	if (state.phase === 'planning' || state.phase === 'running' || state.phase === 'landing')
		return (
			<Button variant='outline' size='sm' className='h-8 text-xs' onClick={() => ai.open()}>
				<Loader2 className='animate-spin' />
				{state.phase === 'planning' ? 'Building · planning' : `Building · ${progress}`}
			</Button>
		)
	if (state.phase === 'ready' && pages.every((page) => page.status === 'written'))
		return (
			<Button size='sm' className='h-8 text-xs' onClick={() => void ai.apply()}>
				<Sparkles /> Site ready · Apply
			</Button>
		)
	if (state.phase === 'ready' || state.phase === 'stopped')
		return (
			<Button variant='outline' size='sm' className='h-8 text-xs' onClick={() => ai.open()}>
				<Sparkles /> Building · {progress}
			</Button>
		)
	if (ai.resumable && state.phase !== 'landed')
		return (
			<Button variant='outline' size='sm' className='h-8 text-xs' onClick={ai.resume}>
				<Sparkles /> Unfinished build · Resume
			</Button>
		)
	const count = ai.needsInputCount
	return (
		<Button
			variant='ghost'
			size='sm'
			className='h-8 text-xs text-brand hover:text-brand'
			onClick={() => (count > 0 ? ai.open() : ai.open({ mode: hasPages ? 'page' : 'site' }))}>
			<Sparkles /> Build with AI
			{count > 0 && <Badge variant='secondary'>{count} to fill in</Badge>}
		</Button>
	)
}

export function CanvasFrame({
	blocks,
	pageId,
	selectedId,
	viewHref,
	nav,
	footerPages,
	chrome,
	currentSlug,
	signedIn,
	onSelect,
	onUndo,
	onRedo,
}: {
	blocks: Block[]
	/** The page on the canvas, which "Build this page with AI" rebuilds. */
	pageId: string
	selectedId: string | null
	viewHref: string
	nav: NavPage[]
	/** Every page, which the footer lists as the live site's does. */
	footerPages: NavPage[]
	chrome: Chrome
	currentSlug: string
	signedIn: boolean
	onSelect: (id: string | null) => void
	onUndo: () => void
	onRedo: () => void
}) {
	const stageRef = useRef<HTMLDivElement>(null)
	const frameRef = useRef<HTMLIFrameElement>(null)
	const store = useBuilder()
	const ai = useAiBuild()
	const [stage, setStage] = useState({ width: 0, height: 0 })
	const [width, setWidth] = useState<number | null>(null)
	const [draftWidth, setDraftWidth] = useState<string | null>(null)
	const settings = store.look.theme
	const setSettings = (theme: ThemeSettings) => store.setLook({ theme })
	const background = store.look.page
	const [frameReady, setFrameReady] = useState(false)
	const aiEnabled = useBuilderAi(store.siteId, store.remote)
	const [aiBlockId, setAiBlockId] = useState<string | null>(null)
	// Section links resolve under the preview, so a button never sends the canvas to an
	// app route (clicks are caught in the canvas anyway; this is what hovering shows).
	const linkBase = `/preview/${store.siteId}`
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

	// The theme and page backdrop ride the URL; the chrome and block surfaces cannot
	// without key collisions, so the whole look comes by message, through the same
	// stylesheet the hosted site uses, with the variables a built site sets for its header.
	const surfaceCss = [
		cssText(builtSiteVars(chrome.header)),
		lookCss(store.look, { blockIds: blocks.map((block) => block.id) }),
	].join('\n')

	const post = useCallback(() => {
		frameRef.current?.contentWindow?.postMessage(
			{
				kind: 'builder:page',
				blocks,
				selectedId,
				nav,
				footerPages,
				chrome,
				currentSlug,
				surfaceCss,
				linkBase,
				brand: store.brand ?? null,
				ai: aiEnabled,
				aiBuild: ai.enabled,
				// The iframe is its own document, so a signed-in library cannot be read
				// from localStorage there.
				mediaIndex: store.remote
					? store.media.map((item) => ({ id: item.id, url: item.src }))
					: null,
			},
			window.location.origin,
		)
	}, [
		blocks,
		selectedId,
		nav,
		footerPages,
		chrome,
		currentSlug,
		surfaceCss,
		linkBase,
		store.remote,
		store.media,
		store.brand,
		aiEnabled,
		ai.enabled,
	])

	const openPageAi = ai.open
	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (event.origin !== window.location.origin) return
			if (event.data?.kind === 'builder:ready') setFrameReady(true)
			if (event.data?.kind === 'builder:select') onSelect(event.data.id ?? null)
			if (event.data?.kind === 'builder:duplicate' && event.data.id)
				store.duplicateSection(event.data.id)
			if (event.data?.kind === 'builder:remove' && event.data.id)
				store.removeSection(event.data.id)
			if (event.data?.kind === 'builder:ai' && event.data.id)
				setAiBlockId(event.data.id)
			// "Build this page with AI" on the empty canvas.
			if (event.data?.kind === 'builder:ai-page')
				openPageAi({ mode: 'page', placement: 'replace-page', targetPageId: pageId })
		}
		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
	}, [onSelect, store, openPageAi, pageId])

	useEffect(() => {
		if (frameReady) post()
	}, [frameReady, post])

	// A block asked for from elsewhere ("Show me") scrolls into view once this page shows it.
	const { scrollTarget, clearScrollTarget } = store
	useEffect(() => {
		if (!frameReady || !scrollTarget) return
		if (!blocks.some((block) => block.id === scrollTarget)) return
		const target = scrollTarget
		clearScrollTarget()
		requestAnimationFrame(() =>
			frameRef.current?.contentWindow?.postMessage(
				{ kind: 'builder:scroll-to', id: target },
				window.location.origin,
			),
		)
	}, [frameReady, scrollTarget, clearScrollTarget, blocks])

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
				<div className='@container flex items-center gap-1 border-b border-white/10 px-3 py-2'>
					{/* Scrolls rather than pushing the actions out from under the inspector. */}
					<div className='flex min-w-0 shrink items-center gap-1 overflow-x-auto'>
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
					</div>

					{/* Least important control, so it is the first to go when the
					    inspector squeezes the toolbar. */}
					<div className='mx-auto hidden shrink-0 items-center gap-1.5 @lg:flex'>
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
						<BuildWithAiButton hasPages={store.pages.length > 0} />
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
						<SaveButton variant='toolbar' signedIn={signedIn} />
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
			<SectionAiDialog
				blockId={aiEnabled ? aiBlockId : null}
				onOpenChange={(open) => {
					if (!open) setAiBlockId(null)
				}}
			/>
		</TooltipProvider>
	)
}
