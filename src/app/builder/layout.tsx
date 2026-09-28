import { Suspense } from 'react'
import { BuilderProvider } from '@/lib/builder/builder-context'
import { loadTemplates } from '@/lib/builder/load-templates'
import { LibraryNav } from './library-nav'
import { entryVariants, library } from './library'

export const metadata = {
	title: 'Section Library',
	robots: { index: false, follow: false },
}

export default async function SectionsLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const navGroups = library.map((group) => ({
		id: group.id,
		label: group.label,
		kind: group.kind,
		entries: group.entries.map((entry) => ({
			slug: entry.slug,
			name: entry.name,
			// Most entries carry variants now rather than a single preview.
			built: entryVariants(entry).length > 0,
		})),
	}))

	const templates = await loadTemplates()

	return (
		<BuilderProvider>
			<div className='flex'>
				<aside className='sticky top-0 flex h-screen w-72 shrink-0 flex-col border-r border-white/10'>
					<Suspense fallback={null}>
						<LibraryNav groups={navGroups} templates={templates} />
					</Suspense>
				</aside>

				<main className='min-w-0 flex-1'>{children}</main>
			</div>
		</BuilderProvider>
	)
}
