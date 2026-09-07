'use client'

import { useEffect, useRef, useState } from 'react'
import { defaultChrome } from '@/lib/builder/page-schema'
import type { Block } from '@/lib/builder/types'

const FRAME_WIDTH = 1440
const FALLBACK_HEIGHT = 2400

// Stand-in nav so a template preview reads like a real site.
const SAMPLE_NAV = [
	{ id: 'a', name: 'Home', slug: 'home' },
	{ id: 'b', name: 'Services', slug: 'services' },
	{ id: 'c', name: 'About', slug: 'about' },
	{ id: 'd', name: 'Contact', slug: 'contact' },
]

/** Renders a template at full desktop width, scaled down to fit the tile. */
export function TemplateThumbnail({ blocks }: { blocks: Block[] }) {
	const boxRef = useRef<HTMLDivElement>(null)
	const frameRef = useRef<HTMLIFrameElement>(null)
	const [scale, setScale] = useState(0.25)
	const [height, setHeight] = useState(FALLBACK_HEIGHT)
	const [ready, setReady] = useState(false)

	useEffect(() => {
		const el = boxRef.current
		if (!el) return
		const observer = new ResizeObserver(([entry]) =>
			setScale(entry.contentRect.width / FRAME_WIDTH),
		)
		observer.observe(el)
		return () => observer.disconnect()
	}, [])

	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (event.origin !== window.location.origin) return
			if (event.data?.kind === 'builder:ready') setReady(true)
			if (event.data?.kind === 'builder:height' && event.data.height > 0) {
				setHeight(event.data.height)
			}
		}
		window.addEventListener('message', onMessage)
		return () => window.removeEventListener('message', onMessage)
	}, [])

	useEffect(() => {
		setHeight(FALLBACK_HEIGHT)
		if (!ready) return
		frameRef.current?.contentWindow?.postMessage(
			{
				kind: 'builder:page',
				blocks,
				nav: SAMPLE_NAV,
				chrome: defaultChrome,
			},
			window.location.origin,
		)
	}, [ready, blocks])

	return (
		<div
			ref={boxRef}
			className='h-full w-full overflow-y-auto overflow-x-hidden bg-ink'>
			<div className='relative w-full' style={{ height: height * scale }}>
				<iframe
					ref={frameRef}
					src='/page-preview?inert=1'
					title='Template preview'
					tabIndex={-1}
					scrolling='no'
					className='absolute left-0 top-0'
					style={{
						width: FRAME_WIDTH,
						height,
						transform: `scale(${scale})`,
						transformOrigin: 'top left',
						border: 0,
						pointerEvents: 'none',
					}}
				/>
			</div>
		</div>
	)
}
