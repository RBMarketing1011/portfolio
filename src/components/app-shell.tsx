'use client'

import { usePathname } from 'next/navigation'

// The section library and its preview frames render chrome as previewable sections,
// so they opt out of the real header and footer. Remove alongside /sections.
const bareRoutes = ['/sections', '/section-preview']

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

	if (bareRoutes.some((route) => pathname.startsWith(route)))
		return <>{children}</>

	return (
		<>
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
