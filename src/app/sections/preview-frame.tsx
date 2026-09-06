'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Monitor, Smartphone, Tablet } from 'lucide-react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
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

const viewports = [
	{ id: 'desktop', label: 'Desktop', icon: Monitor, width: null },
	{ id: 'tablet', label: 'Tablet', icon: Tablet, width: 834 },
	{ id: 'mobile', label: 'Mobile', icon: Smartphone, width: 390 },
] as const

export function PreviewFrame({ slug, name }: { slug: string; name: string }) {
	const router = useRouter()
	const pathname = usePathname()
	const params = useSearchParams()
	const stageRef = useRef<HTMLDivElement>(null)
	const [stage, setStage] = useState({ width: 0, height: 0 })

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

	const requested = params.get('view')
	const current =
		viewports.find((viewport) => viewport.id === requested) ?? viewports[0]

	const settings = readSettings(new URLSearchParams(params.toString()))

	const push = (next: URLSearchParams) => {
		const query = next.toString()
		router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
	}

	const select = (id: string) => {
		const next = new URLSearchParams(params.toString())
		if (id === viewports[0].id) next.delete('view')
		else next.set('view', id)
		push(next)
	}

	const applySettings = (value: ThemeSettings) =>
		push(writeSettings(new URLSearchParams(params.toString()), value))

	// Only theme params belong on the frame; `view` drives the wrapper, not the page.
	const frameParams = new URLSearchParams(params.toString())
	frameParams.delete('view')
	const frameQuery = frameParams.toString()

	const measured = stage.width > 0
	const frameWidth = current.width ?? stage.width

	return (
		<TooltipProvider>
			<div className='flex h-screen flex-col'>
				<div className='flex items-center gap-1 border-b border-white/10 px-3 py-2'>
					{viewports.map((viewport) => (
						<Tooltip key={viewport.id}>
							<TooltipTrigger asChild>
								<button
									type='button'
									onClick={() => select(viewport.id)}
									aria-pressed={current.id === viewport.id}
									className={cn(
										'flex size-8 items-center justify-center rounded-md transition-colors',
										current.id === viewport.id
											? 'bg-brand/15 text-brand'
											: 'text-slate-400 hover:bg-white/5 hover:text-white',
									)}>
									<viewport.icon className='size-4' />
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
					))}
					<span className='ml-auto text-xs tabular-nums text-slate-500'>
						{current.width ? `${current.width}px` : 'Full width'}
					</span>
					<div className='ml-2 border-l border-white/10 pl-2'>
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
								current.width && 'border-x border-white/10',
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
