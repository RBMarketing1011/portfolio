'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { ChevronsUpDown, LogOut, Settings, User } from 'lucide-react'

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

export function NavUser({
	user,
}: {
	user: { name: string; email: string; avatar: string | null }
}) {
	const { isMobile } = useSidebar()

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
								<Link href='/account/profile'>
									<User />
									Your profile
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link href='/account/settings'>
									<Settings />
									Account settings
								</Link>
							</DropdownMenuItem>
						</DropdownMenuGroup>
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
