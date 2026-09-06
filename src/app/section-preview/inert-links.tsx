'use client'

import { useEffect } from 'react'

/**
 * Previews must never navigate — following a link would load the whole site,
 * and /sections inside the frame nests the tool in itself.
 *
 * Listens on document rather than a wrapper because Radix portals (sheet, dialog,
 * dropdown) mount to document.body and would otherwise escape the handler.
 */
export function InertLinks({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		const neutralize = () => {
			document.querySelectorAll('a[href]').forEach((anchor) => {
				const href = anchor.getAttribute('href')
				if (href === '#') return
				// Keep the original so previews can still show where a link points.
				anchor.setAttribute('data-href', href ?? '')
				anchor.setAttribute('href', '#')
			})
		}

		neutralize()

		// Attribute writes do not trigger childList records, so this cannot loop.
		const observer = new MutationObserver(neutralize)
		observer.observe(document.body, { childList: true, subtree: true })

		// Capture phase runs before Next's Link handler, which bails on defaultPrevented.
		// Links inside [data-preview-interactive] page in state rather than navigate,
		// so they only need their default suppressed, not their handlers cut off.
		const swallow = (event: MouseEvent) => {
			const anchor = (event.target as HTMLElement | null)?.closest?.('a')
			if (!anchor) return
			event.preventDefault()
			if (anchor.closest('[data-preview-interactive]')) return
			event.stopPropagation()
		}

		document.addEventListener('click', swallow, true)
		document.addEventListener('auxclick', swallow, true)

		return () => {
			observer.disconnect()
			document.removeEventListener('click', swallow, true)
			document.removeEventListener('auxclick', swallow, true)
		}
	}, [])

	return <>{children}</>
}
