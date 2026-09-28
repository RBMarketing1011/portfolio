'use client'

import { usePathname } from 'next/navigation'

// The section library, the builder, and both preview surfaces render their own
// chrome, so they opt out of the real header and footer.
const bareRoutes = [
	'/builder',
	'/section-preview',
	'/page-preview',
	'/preview',
]

export function AppShell({
	header,
	footer,
	children,
}: {
	header: React.ReactNode
	footer: React.ReactNode
	children: React.ReactNode
}) {
	const pathname = usePathname()
	const isBare = bareRoutes.some(
		(route) => pathname === route || pathname.startsWith(`${route}/`),
	)

	if (isBare) return <>{children}</>

	return (
		<>
			<div aria-hidden className='site-backdrop' />
			<a
				href='#main'
				className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-60 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:font-bold focus:text-ink'>
				Skip to main content
			</a>
			{header}
			<main id='main'>{children}</main>
			{footer}
		</>
	)
}
