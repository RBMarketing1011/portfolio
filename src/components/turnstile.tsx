'use client'

import Script from 'next/script'
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from 'react'

type RenderOptions = {
	sitekey: string
	action: string
	theme: 'light' | 'dark' | 'auto'
	appearance: 'always' | 'execute' | 'interaction-only'
	callback: (token: string) => void
	'expired-callback': () => void
	'timeout-callback': () => void
	'error-callback': () => void
}

declare global {
	interface Window {
		turnstile?: {
			render: (element: HTMLElement, options: RenderOptions) => string
			reset: (widgetId: string) => void
			remove: (widgetId: string) => void
		}
	}
}

export type TurnstileHandle = {
	reset: () => void
	/**
	 * The token already held, or the next one to arrive. An invisible widget
	 * gives the visitor nothing to look at while it solves, so a form that
	 * submits early has to wait for it rather than send null.
	 */
	getToken: (timeoutMs?: number) => Promise<string | null>
}

/**
 * Explicit rendering rather than the `cf-turnstile` class, because tokens are
 * single-use: the caller needs the widget id to reset it after each submit.
 */
export const Turnstile = forwardRef<
	TurnstileHandle,
	{
		siteKey: string
		action: string
		onToken: (token: string | null) => void
		className?: string
	}
>(function Turnstile({ siteKey, action, onToken, className }, ref) {
	const container = useRef<HTMLDivElement>(null)
	const widgetId = useRef<string | null>(null)
	const [ready, setReady] = useState(false)

	// Held in a ref so a new callback identity does not tear down the widget.
	const emit = useRef(onToken)
	emit.current = onToken

	const token = useRef<string | null>(null)
	const waiting = useRef<((token: string | null) => void)[]>([])

	const settle = (next: string | null) => {
		token.current = next
		if (next !== null) {
			const queued = waiting.current
			waiting.current = []
			for (const resolve of queued) resolve(next)
		}
		emit.current(next)
	}

	useImperativeHandle(ref, () => ({
		reset() {
			if (widgetId.current) window.turnstile?.reset(widgetId.current)
			token.current = null
			emit.current(null)
		},
		getToken(timeoutMs = 6000) {
			if (token.current) return Promise.resolve(token.current)
			return new Promise<string | null>((resolve) => {
				let done = false
				const once = (value: string | null) => {
					if (done) return
					done = true
					clearTimeout(timer)
					resolve(value)
				}
				const timer = setTimeout(() => {
					waiting.current = waiting.current.filter((fn) => fn !== once)
					once(null)
				}, timeoutMs)
				waiting.current.push(once)
			})
		},
	}))

	useEffect(() => {
		if (!ready || !container.current || !window.turnstile || widgetId.current)
			return

		// Turnstile refuses to render twice into the same node and leaves markup
		// behind after remove(), so each render gets a throwaway host element.
		const host = document.createElement('div')
		container.current.replaceChildren(host)

		widgetId.current = window.turnstile.render(host, {
			sitekey: siteKey,
			action,
			theme: 'dark',
			// Stays out of sight and solves in the background; the widget only paints
			// if Cloudflare decides this visitor has to do something.
			appearance: 'interaction-only',
			callback: (value) => settle(value),
			'expired-callback': () => settle(null),
			'timeout-callback': () => settle(null),
			'error-callback': () => settle(null),
		})
	}, [ready, siteKey, action])

	// Teardown is its own effect so re-running the render effect cannot orphan a widget.
	useEffect(
		() => () => {
			if (widgetId.current) window.turnstile?.remove(widgetId.current)
			widgetId.current = null
		},
		[],
	)

	return (
		<>
			<Script
				src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
				strategy='afterInteractive'
				onReady={() => setReady(true)}
			/>
			{/* No reserved height: an invisible widget must not leave a gap in the form. */}
			<div ref={container} className={className} />
		</>
	)
})
