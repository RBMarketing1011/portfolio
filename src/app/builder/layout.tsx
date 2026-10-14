import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isPlatformAdmin } from '@/lib/admin'
import { loadTemplates } from '@/lib/builder/load-templates'
import { SidebarProvider } from '@/components/ui/sidebar'
import { BuilderShell } from './builder-shell'
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
	// The builder is not public: it is for invited people, who always have a login.
	const session = await auth()
	if (!session?.user?.id) redirect('/sign-in?next=/builder')

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
	// Resolved here rather than with useSession: the nav renders during SSR, where
	// a client provider higher up the tree is not something it can rely on.
	const signedIn = Boolean(session?.user?.id)
	const email = session?.user?.email ?? null

	return (
		<BuilderShell>
			<SidebarProvider>
				<aside className='sticky top-0 flex h-screen w-72 shrink-0 flex-col border-r border-white/10'>
					<Suspense fallback={null}>
						<LibraryNav
							groups={navGroups}
							templates={templates}
							signedIn={signedIn}
							email={email}
							userName={
								session?.user?.name?.trim() || email?.replace(/@.*$/, '') || ''
							}
							userImage={session?.user?.image ?? null}
							admin={await isPlatformAdmin(session.user.id)}
						/>
					</Suspense>
				</aside>

				<main className='min-w-0 flex-1'>{children}</main>
			</SidebarProvider>
		</BuilderShell>
	)
}
