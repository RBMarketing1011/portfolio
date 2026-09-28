'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import {
	BuiltFooter,
	BuiltHeader,
	type NavPage,
} from '@/components/built-chrome'
import { defaultChrome, type Chrome } from '@/lib/builder/page-schema'
import { RenderBlocks } from '@/lib/builder/render'
import type { Block } from '@/lib/builder/types'

export type PreviewMessage =
	| {
			kind: 'builder:page'
			blocks: Block[]
			selectedId?: string | null
			nav?: NavPage[]
			chrome?: Chrome
			currentSlug?: string
			surfaceCss?: string
	  }
	| { kind: 'builder:select'; id: string | null }
	| { kind: 'builder:scroll-to'; id: string }

// The outline rides an overlay so section content cannot paint over it. `isolation`
// keeps that overlay inside the section, so it never covers the sticky header.
const HIGHLIGHT_CSS = `
[data-block-id][data-selected='true'] > *{position:relative;isolation:isolate;}
[data-block-id][data-selected='true'] > *::after{
content:'';
position:absolute;
inset:0;
z-index:9999;
pointer-events:none;
border:2px solid color-mix(in srgb, var(--color-brand) 45%, transparent);
}
[data-block-id][data-flash='true'] > *{animation:builder-flash 1.4s ease-out 1;}
@keyframes builder-flash{
0%{background-color:color-mix(in srgb, var(--color-brand) 26%, transparent);}
100%{background-color:transparent;}
}`

/**
 * Renders the page inside the toolbar's iframe. An iframe rather than an inline
 * container because Tailwind breakpoints key off viewport width, so a simulated
 * device size only works if the document itself is that wide.
 */
export function PreviewCanvas({ inert = false }: { inert?: boolean }) {
	const [blocks, setBlocks] = useState<Block[]>([])
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [nav, setNav] = useState<NavPage[]>([])
	const [currentSlug, setCurrentSlug] = useState<string | undefined>()
	const [chrome, setChrome] = useState<Chrome>(defaultChrome)
	const [surfaceCss, setSurfaceCss] = useState('')
	const [flashId, setFlashId] = useState<string | null>(null)
	// Page coordinates of the selected section's top edge, for the action pill.
	const [pill, setPill] = useState<{ top: number; left: number } | null>(null)

	const act = useCallback(
		(kind: 'builder:duplicate' | 'builder:remove') => {
			if (!selectedId) return
			window.parent?.postMessage(
				{ kind, id: selectedId },
				window.location.origin,
			)
		},
		[selectedId],
	)

	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (event.origin !== window.location.origin) return
			const data = event.data as PreviewMessage
			if (data?.kind === 'builder:scroll-to') {
				setSelectedId(data.id)
				setFlashId(data.id)
				// The block may still be mounting, so look for it across a few frames.
				let tries = 0
				const find = () => {
					const target = document.querySelector(
						`[data-block-id='${data.id}']`,
					)?.firstElementChild
					if (!target) {
						if (tries++ < 20) requestAnimationFrame(find)
						return
					}
					const header = document.querySelector('header')
					const offset = header?.getBoundingClientRect().height ?? 0
					const top =
						target.getBoundingClientRect().top + window.scrollY - offset - 8
					window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
				}
				requestAnimationFrame(find)
				return
			}
			if (data?.kind === 'builder:page') {
				setBlocks(data.blocks ?? [])
				if (data.selectedId !== undefined) setSelectedId(data.selectedId)
				if (data.nav) setNav(data.nav)
				if (data.chrome) setChrome(data.chrome)
				if (data.currentSlug !== undefined) setCurrentSlug(data.currentSlug)
				if (data.surfaceCss !== undefined) setSurfaceCss(data.surfaceCss)
			}
		}
		window.addEventListener('message', onMessage)
		window.parent?.postMessage(
			{ kind: 'builder:ready' },
			window.location.origin,
		)
		return () => window.removeEventListener('message', onMessage)
	}, [])

	useEffect(() => {
		if (!flashId) return
		const timer = setTimeout(() => setFlashId(null), 1500)
		return () => clearTimeout(timer)
	}, [flashId])

	useEffect(() => {
		if (!blocks.length) return
		// Lets a scaled-down embed size itself to the real page height.
		const report = () =>
			window.parent?.postMessage(
				{
					kind: 'builder:height',
					height: document.documentElement.scrollHeight,
				},
				window.location.origin,
			)
		const timers = [80, 400, 1200].map((ms) => setTimeout(report, ms))
		return () => timers.forEach(clearTimeout)
	}, [blocks])

	useEffect(() => {
		if (inert || !selectedId) {
			setPill(null)
			return
		}
		const target = document.querySelector(
			`[data-block-id='${selectedId}']`,
		)?.firstElementChild
		if (!target) {
			setPill(null)
			return
		}
		const measure = () => {
			const box = target.getBoundingClientRect()
			setPill({
				top: box.top + window.scrollY,
				left: box.left + box.width / 2 + window.scrollX,
			})
		}
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(target)
		observer.observe(document.documentElement)
		window.addEventListener('scroll', measure, true)
		window.addEventListener('resize', measure)
		return () => {
			observer.disconnect()
			window.removeEventListener('scroll', measure, true)
			window.removeEventListener('resize', measure)
		}
	}, [selectedId, blocks, inert])

	useEffect(() => {
		if (inert) return
		function onClick(event: MouseEvent) {
			const node = event.target as HTMLElement | null
			// The pill sits over the page, so its own buttons must not reselect.
			if (node?.closest('[data-builder-pill]')) return
			const target = node?.closest('[data-block-id]')
			const id = target?.getAttribute('data-block-id') ?? null
			event.preventDefault()
			event.stopPropagation()
			setSelectedId(id)
			window.parent?.postMessage(
				{ kind: 'builder:select', id },
				window.location.origin,
			)
		}
		document.addEventListener('click', onClick, true)
		return () => document.removeEventListener('click', onClick, true)
	}, [inert])

	if (!blocks.length) {
		if (inert) return null
		return (
			<div className='flex min-h-screen items-center justify-center px-6 text-center'>
				<div className='max-w-sm'>
					<p className='font-display text-xl font-semibold text-white'>
						Nothing here yet
					</p>
					<p className='mt-3 leading-7 text-slate-400'>
						Add a section from the left to start building this page.
					</p>
				</div>
			</div>
		)
	}

	return (
		<div className='relative' data-selected={selectedId ?? undefined}>
			{!inert && <style dangerouslySetInnerHTML={{ __html: HIGHLIGHT_CSS }} />}
			{surfaceCss && <style dangerouslySetInnerHTML={{ __html: surfaceCss }} />}
			<BuiltHeader chrome={chrome} pages={nav} current={currentSlug} />
			<main>
				<RenderBlocks
					blocks={blocks}
					selectable={!inert}
					selectedId={selectedId}
					flashId={flashId}
				/>
			</main>
			<BuiltFooter chrome={chrome} pages={nav} />

			{/* Straddles the outline's top edge, so the border runs through its middle. */}
			{pill && (
				<div
					data-builder-pill
					style={{ top: pill.top, left: pill.left }}
					className='absolute z-10000 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border border-brand/50 bg-ink/95 p-1 shadow-[0_6px_20px_-6px_rgba(0,0,0,0.9)] backdrop-blur'>
					<button
						type='button'
						title='Duplicate this section'
						aria-label='Duplicate this section'
						onClick={() => act('builder:duplicate')}
						className='flex size-7 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white'>
						<Copy className='size-3.5' />
					</button>
					<button
						type='button'
						title='Delete this section'
						aria-label='Delete this section'
						onClick={() => act('builder:remove')}
						className='flex size-7 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-destructive/20 hover:text-destructive'>
						<Trash2 className='size-3.5' />
					</button>
				</div>
			)}
		</div>
	)
}
