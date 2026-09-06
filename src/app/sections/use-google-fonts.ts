'use client'

import { useEffect } from 'react'
import { googleFontHref } from './google-fonts'

/** Loads families on demand so the picker can preview any of the 1,900+ faces. */
export function useGoogleFonts(families: string[]) {
	const href = googleFontHref(families)

	useEffect(() => {
		if (!href) return
		if (document.querySelector(`link[data-google-font="${href}"]`)) return

		const link = document.createElement('link')
		link.rel = 'stylesheet'
		link.href = href
		link.dataset.googleFont = href
		document.head.appendChild(link)
	}, [href])
}
