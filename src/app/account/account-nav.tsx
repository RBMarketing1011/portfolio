'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
	Check,
	ChevronsUpDown,
	FolderKanban,
	Images,
	LayoutDashboard,
	LayoutTemplate,
	LogOut,
	Settings,
	User,
	Users,
} from 'lucide-react'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Wordmark } from '@/components/brand'
import { cn } from '@/lib/utils'

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS }
export type AccountOption = { id: string; name: string; isOwner: boolean }

const ICONS = {
	overview: LayoutDashboard,
	projects: FolderKanban,
	team: Users,
	media: Images,
	settings: Settings,
}

export function AccountNav({
	items,
	accountName,
	accounts,
	currentAccountId,
	email,
	roleName,
}: {
	items: NavItem[]
	accountName: string
	accounts: AccountOption[]
	currentAccountId: string
	email: string
	roleName: string
}) {
	const router = useRouter()
	const pathname = usePathname()

	const switchTo = async (workspaceId: string) => {
		if (workspaceId === currentAccountId) return
		await fetch('/api/account/workspace', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ workspaceId }),
		})
		// Back to the overview: the project you were looking at belongs to the
		// account you just left.
		router.push('/account')
		router.refresh()
	}

	return (
		<div className='flex h-full flex-col'>
			<div className='border-b border-white/10 p-4'>
				<Wordmark size='sm' />
				{accounts.length > 1 ? (
					<DropdownMenu>
						<DropdownMenuTrigger className='mt-3 flex w-full items-center justify-between gap-2 rounded-md border border-white/12 bg-white/3 px-2.5 py-1.5 text-sm text-white transition-colors hover:bg-white/6'>
							<span className='truncate'>{accountName}</span>
							<ChevronsUpDown className='size-3.5 shrink-0 opacity-50' />
						</DropdownMenuTrigger>
						<DropdownMenuContent align='start' className='w-56'>
							<DropdownMenuLabel className='text-xs font-normal text-slate-500'>
								Accounts
							</DropdownMenuLabel>
							{accounts.map((account) => (
								<DropdownMenuItem
									key={account.id}
									onClick={() => switchTo(account.id)}
									className='cursor-pointer'>
									<Check
										className={cn(
											'size-3.5',
											account.id === currentAccountId
												? 'text-brand opacity-100'
												: 'opacity-0',
										)}
									/>
									<span className='min-w-0 flex-1 truncate'>
										{account.name}
									</span>
									{account.isOwner && (
										<span className='shrink-0 text-xs text-slate-500'>
											yours
										</span>
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<p className='mt-3 truncate text-xs font-semibold uppercase tracking-widest text-slate-500'>
						{accountName}
					</p>
				)}
			</div>

			<nav aria-label='Account' className='min-h-0 flex-1 overflow-y-auto p-3'>
				<ul className='space-y-0.5'>
					{items.map((item) => {
						const Icon = ICONS[item.icon]
						// Overview would otherwise light up on every child route.
						const active =
							item.href === '/account'
								? pathname === '/account'
								: pathname === item.href || pathname.startsWith(`${item.href}/`)

						return (
							<li key={item.href}>
								<Link
									href={item.href}
									aria-current={active ? 'page' : undefined}
									className={cn(
										'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
										active
											? 'bg-brand/10 text-white'
											: 'text-slate-400 hover:bg-white/5 hover:text-white',
									)}>
									<Icon className='size-4 shrink-0' />
									{item.label}
								</Link>
							</li>
						)
					})}
				</ul>

				<div className='mt-6 border-t border-white/10 pt-3'>
					<Link
						href='/builder'
						className='flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white'>
						<LayoutTemplate className='size-4 shrink-0' />
						Section library
					</Link>
				</div>
			</nav>

			<div className='shrink-0 border-t border-white/10 p-2'>
				<DropdownMenu>
					<DropdownMenuTrigger className='flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white'>
						<User className='size-4 shrink-0' />
						<span className='min-w-0 flex-1 truncate text-left'>{email}</span>
					</DropdownMenuTrigger>
					<DropdownMenuContent align='start' side='top' className='w-56'>
						<DropdownMenuLabel className='text-xs font-normal text-slate-500'>
							{roleName}
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<Link href='/account/profile' className='cursor-pointer'>
								<User className='size-3.5' /> Your profile
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link href='/account/settings' className='cursor-pointer'>
								<Settings className='size-3.5' /> Account settings
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => signOut({ callbackUrl: '/' })}
							className='cursor-pointer'>
							<LogOut className='size-3.5' /> Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	)
}
