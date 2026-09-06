import { Suspense } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LibraryNav } from './library-nav'
import { library } from './library'

export default function SectionsLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const navGroups = library.map((group) => ({
		id: group.id,
		label: group.label,
		entries: group.entries.map((entry) => ({
			slug: entry.slug,
			name: entry.name,
			built: Boolean(entry.preview),
		})),
	}))

	const built = navGroups
		.flatMap((g) => g.entries)
		.filter((e) => e.built).length
	const total = navGroups.flatMap((g) => g.entries).length

	return (
		<div className='flex'>
			<aside className='sticky top-0 h-screen w-64 shrink-0 border-r border-white/10'>
				<ScrollArea className='h-full'>
					<div className='p-4'>
						<p className='px-2 text-sm text-slate-500'>
							{built} of {total} built
						</p>
						<div className='mt-5'>
							<Suspense fallback={null}>
								<LibraryNav groups={navGroups} />
							</Suspense>
						</div>
					</div>
				</ScrollArea>
			</aside>

			<main className='min-w-0 flex-1'>{children}</main>
		</div>
	)
}
