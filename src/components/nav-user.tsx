'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
	Building2,
	Check,
	ChevronsUpDown,
	LogOut,
	Settings,
	User,
} from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from '@/components/ui/sidebar'

function initials(value: string) {
	const letters = value
		.replace(/@.*$/, '')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join('')
	return letters.toUpperCase() || '?'
}

type Account = { id: string; name: string; isOwner: boolean }

export function NavUser({
	user,
	admin = false,
	accountId = null,
}: {
	user: { name: string; email: string; avatar: string | null }
	/**
	 * A platform admin has no account of their own: the profile lives under /admin,
	 * and account settings belong to whichever client account is open, not to them.
	 */
	admin?: boolean
	/** The account currently open, so the switcher can mark it. */
	accountId?: string | null
}) {
	const { isMobile } = useSidebar()
	const router = useRouter()
	const [accounts, setAccounts] = useState<Account[]>([])
	const [switching, setSwitching] = useState<string | null>(null)

	// Someone invited onto another account needs a way to reach it (and to get
	// back to their own). Admins switch from the admin area instead.
	useEffect(() => {
		if (admin) return
		let live = true
		void fetch('/api/account/workspace', { cache: 'no-store' })
			.then((response) => (response.ok ? response.json() : null))
			.then((body) => {
				if (live && body?.workspaces) setAccounts(body.workspaces)
			})
			.catch(() => {})
		return () => {
			live = false
		}
	}, [admin])

	const switchTo = async (id: string) => {
		setSwitching(id)
		const response = await fetch('/api/account/workspace', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ workspaceId: id }),
		}).catch(() => null)
		setSwitching(null)
		if (!response?.ok) {
			// The list was read when the menu mounted; an entry that no longer
			// works is one that no longer exists, so drop it and re-read.
			setAccounts((current) => current.filter((account) => account.id !== id))
			router.refresh()
			return
		}
		router.push('/account')
		router.refresh()
	}

	const identity = (
		<>
			<Avatar className='h-8 w-8 rounded-lg'>
				{user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
				<AvatarFallback className='rounded-lg'>
					{initials(user.name)}
				</AvatarFallback>
			</Avatar>
			<div className='grid flex-1 text-left text-sm leading-tight'>
				<span className='truncate font-medium'>{user.name}</span>
				<span className='truncate text-xs'>{user.email}</span>
			</div>
		</>
	)

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size='lg'
							className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'>
							{identity}
							<ChevronsUpDown className='ml-auto size-4' />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
						side={isMobile ? 'bottom' : 'right'}
						align='end'
						sideOffset={4}>
						<DropdownMenuLabel className='p-0 font-normal'>
							<div className='flex items-center gap-2 px-1 py-1.5 text-left text-sm'>
								{identity}
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem asChild>
								<Link href={admin ? '/admin/profile' : '/account/profile'}>
									<User />
									Your profile
								</Link>
							</DropdownMenuItem>
							{!admin && (
								<DropdownMenuItem asChild>
									<Link href='/account/settings'>
										<Settings />
										Account settings
									</Link>
								</DropdownMenuItem>
							)}
						</DropdownMenuGroup>
						{accounts.length > 1 && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuGroup>
									<DropdownMenuLabel className='text-xs text-muted-foreground'>
										Switch account
									</DropdownMenuLabel>
									{accounts.map((account) => (
										<DropdownMenuItem
											key={account.id}
											disabled={account.id === accountId || switching !== null}
											onClick={() => switchTo(account.id)}>
											<Building2 />
											<span className='truncate'>{account.name}</span>
											{account.id === accountId && <Check className='ml-auto' />}
										</DropdownMenuItem>
									))}
								</DropdownMenuGroup>
							</>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
							<LogOut />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
