'use client'

import { ShieldCheck } from 'lucide-react'
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
} from '@/components/ui/sidebar'
import { NavUser } from '@/components/nav-user'
import { AccountNav, type NavItem } from '../account/account-nav'

const ITEMS: NavItem[] = [
	{ href: '/admin', label: 'Overview', icon: 'overview' },
	{ href: '/admin/accounts', label: 'Accounts', icon: 'accounts' },
	{ href: '/admin/sites', label: 'Websites', icon: 'sites' },
	{ href: '/admin/users', label: 'Users', icon: 'people' },
]

export function AdminShell({
	email,
	userName,
	children,
}: {
	email: string
	userName: string
	children: React.ReactNode
}) {
	return (
		<SidebarProvider>
			<Sidebar collapsible='icon'>
				<SidebarHeader>
					<div className='flex items-center gap-2 px-2 py-1.5 text-sm font-semibold'>
						<ShieldCheck className='size-4 text-brand' />
						<span className='truncate group-data-[collapsible=icon]:hidden'>
							Admin
						</span>
					</div>
				</SidebarHeader>
				<SidebarContent>
					<AccountNav items={ITEMS} showLibrary={false} />
				</SidebarContent>
				<SidebarFooter>
					<NavUser user={{ name: userName, email, avatar: null }} />
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>

			<SidebarInset className='min-w-0'>
				<header className='sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-background/80 px-4 backdrop-blur'>
					<SidebarTrigger className='-ml-1' />
					<span className='truncate text-sm font-semibold'>Administration</span>
				</header>
				<div className='mx-auto w-full max-w-6xl px-6 py-10 lg:px-10'>
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
