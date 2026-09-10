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

export type TurnstileHandle = { reset: () => void }

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

	useImperativeHandle(ref, () => ({
		reset() {
			if (widgetId.current) window.turnstile?.reset(widgetId.current)
			emit.current(null)
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
			callback: (token) => emit.current(token),
			'expired-callback': () => emit.current(null),
			'timeout-callback': () => emit.current(null),
			'error-callback': () => emit.current(null),
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
			<div ref={container} className={className} />
		</>
	)
})
