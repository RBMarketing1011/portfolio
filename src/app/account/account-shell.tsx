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
import { AccountBrand } from '@/components/account-brand'
import { ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AccountNav, type NavItem } from './account-nav'
import { LeaveAccountButton } from './leave-account-button'

/**
 * The media library is a working surface (a rail, a grid, a detail sheet), not a page of
 * prose, so it gets the full width instead of the reading column the other pages use.
 */
export const isWidePath = (pathname: string | null | undefined) =>
	typeof pathname === 'string' &&
	(pathname === '/account/media' || pathname.startsWith('/account/media/'))

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
	accountId,
	accountName,
	email,
	userName,
	userImage,
	viaAdmin,
	children,
}: {
	items: NavItem[]
	accountId: string
	accountName: string
	email: string
	userName: string
	userImage: string | null
	viaAdmin: boolean
	children: React.ReactNode
}) {
	const wide = isWidePath(usePathname())

	return (
		<SidebarProvider>
			<CloseSheetOnNavigate />
			<Sidebar collapsible='icon'>
				<SidebarHeader>
					<AccountBrand />
				</SidebarHeader>
				<SidebarContent>
					<AccountNav items={items} />
				</SidebarContent>
				<SidebarFooter>
					<NavUser
						user={{ name: userName, email, avatar: userImage }}
						admin={viaAdmin}
						accountId={accountId}
					/>
				</SidebarFooter>
				<SidebarRail />
			</Sidebar>

			<SidebarInset className='min-w-0'>
				<header className='sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-background/80 px-4 backdrop-blur'>
					<SidebarTrigger className='-ml-1' />
					<span className='truncate text-sm font-semibold'>{accountName}</span>
				</header>

				{viaAdmin && (
					<Alert className='rounded-none border-x-0 border-t-0'>
						<ShieldCheck />
						<AlertDescription className='flex flex-wrap items-center justify-between gap-3'>
							<span>
								Viewing <strong>{accountName}</strong> as an administrator.
							</span>
							<LeaveAccountButton />
						</AlertDescription>
					</Alert>
				)}

				<div
					className={cn(
						'mx-auto w-full',
						wide ? 'max-w-none px-4 py-6 lg:px-6' : 'max-w-6xl px-6 py-10 lg:px-10',
					)}>
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
