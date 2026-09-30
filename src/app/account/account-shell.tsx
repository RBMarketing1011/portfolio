'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { AccountNav, type AccountOption, type NavItem } from './account-nav'

export function AccountShell({
	items,
	accountName,
	accounts,
	currentAccountId,
	email,
	roleName,
	children,
}: {
	items: NavItem[]
	accountName: string
	accounts: AccountOption[]
	currentAccountId: string
	email: string
	roleName: string
	children: React.ReactNode
}) {
	const pathname = usePathname()
	const [open, setOpen] = useState(false)

	// Navigating inside the drawer has to close it, or the new page is hidden
	// behind the sheet that opened it.
	useEffect(() => setOpen(false), [pathname])

	const nav = (
		<AccountNav
			items={items}
			accountName={accountName}
			accounts={accounts}
			currentAccountId={currentAccountId}
			email={email}
			roleName={roleName}
		/>
	)

	return (
		<div className='flex min-h-screen'>
			<aside className='sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/10 md:block'>
				{nav}
			</aside>

			<div className='flex min-w-0 flex-1 flex-col'>
				<header className='sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-ink/80 px-4 py-3 backdrop-blur md:hidden'>
					<Sheet open={open} onOpenChange={setOpen}>
						<SheetTrigger
							aria-label='Open account menu'
							className='flex size-9 items-center justify-center rounded-md border border-white/12 text-slate-300'>
							<Menu className='size-4' />
						</SheetTrigger>
						<SheetContent side='left' className='w-72 p-0'>
							<SheetTitle className='sr-only'>Account menu</SheetTitle>
							{nav}
						</SheetContent>
					</Sheet>
					<span className='truncate text-sm font-semibold text-white'>
						{accountName}
					</span>
				</header>

				<main className='min-w-0 flex-1'>
					<div className='mx-auto w-full max-w-6xl px-6 py-10 lg:px-10'>
						{children}
					</div>
				</main>
			</div>
		</div>
	)
}
