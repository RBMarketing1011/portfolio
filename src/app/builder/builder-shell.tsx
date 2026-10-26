'use client'

import { usePathname } from 'next/navigation'
import { BuilderProvider } from '@/lib/builder/builder-context'
import { LOCAL_SITE_ID } from '@/lib/builder/drivers'
import { AiBuildHost } from './builder/ai-build-host'

/** The site being edited lives in the URL, so the provider reads it from there
 *  rather than every page having to thread it down. */
export function BuilderShell({ children }: { children: React.ReactNode }) {
	const pathname = usePathname()
	const match = pathname.match(/^\/builder\/sites\/([^/]+)/)
	const siteId = match?.[1] ?? LOCAL_SITE_ID

	// Remounting on a site change throws away the previous site's undo history,
	// which is correct: it does not belong to the new one. A build with AI lives
	// here too, so it keeps running while the person moves between pages.
	return (
		<BuilderProvider key={siteId} siteId={siteId}>
			<AiBuildHost>{children}</AiBuildHost>
		</BuilderProvider>
	)
}
