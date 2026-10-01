'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarInset,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger,
	useSidebar,
} from '@/components/ui/sidebar'
import { NavUser } from '@/components/nav-user'
import { TeamSwitcher, type AccountOption } from '@/components/team-switcher'
import { AccountNav, type NavItem } from './account-nav'

// Must live outside <Sidebar>: on mobile that subtree only mounts while the
// sheet is open, so the effect would close the sheet the moment it opened.
function CloseSheetOnNavigate() {
	const pathname = usePathname()
	const { setOpenMobile } = useSidebar()
	const first = useRef(true)

	useEffect(() => {
		if (first.current) {
			first.current = false
			return
		}
		setOpenMobile(false)
	}, [pathname, setOpenMobile])

	return null
}

export function AccountShell({
	items,
	accountName,
	accounts,
	currentAccountId,
	email,
	userName,
	userImage,
	children,
}: {
	items: NavItem[]
	accountName: string
	accounts: AccountOption[]
	currentAccountId: string
	email: string
	userName: string
	userImage: string | null
	children: React.ReactNode
}) {
	return (
		<SidebarProvider>
			<CloseSheetOnNavigate />
			<Sidebar collapsible='icon'>
				<SidebarHeader>
					<TeamSwitcher
						accounts={accounts}
						currentAccountId={currentAccountId}
					/>
				</SidebarHeader>
				<SidebarContent>
					<AccountNav items={items} />
				</SidebarContent>
				<SidebarFooter>
					<NavUser
						user={{ name: userName, email, avatar: userImage }}
					/>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>

			<SidebarInset className='min-w-0'>
				<header className='sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-background/80 px-4 backdrop-blur'>
					<SidebarTrigger className='-ml-1' />
					<span className='truncate text-sm font-semibold'>{accountName}</span>
				</header>

				<div className='mx-auto w-full max-w-6xl px-6 py-10 lg:px-10'>
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
