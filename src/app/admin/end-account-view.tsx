'use client'

import { useEffect } from 'react'

const end = () => {
	void fetch('/api/account/workspace', { method: 'DELETE' }).catch(() => null)
}

/**
 * Being back in the admin area, however the admin got here (the banner, the
 * sidebar, the back button, a typed URL), ends any account they were viewing,
 * so /account cannot be reopened by typing it. Done from the browser rather
 * than middleware because the router prefetches admin links from inside the
 * account, and a prefetch must not end the view; a prefetch never mounts this.
 */
export function EndAccountView() {
	useEffect(() => {
		end()
		// Back restores the page from the browser's cache without mounting again.
		const onShow = (event: PageTransitionEvent) => {
			if (event.persisted) end()
		}
		window.addEventListener('pageshow', onShow)
		return () => window.removeEventListener('pageshow', onShow)
	}, [])
	return null
}
