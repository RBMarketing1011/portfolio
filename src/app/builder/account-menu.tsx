'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { LayoutGrid, LogIn, LogOut, User } from 'lucide-react'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Session comes in as props, not from `useSession`: this renders during the SSR
 * pass of the builder layout, where the provider is not something it can rely on.
 */
export function AccountMenu({ email }: { email?: string | null }) {
	if (!email)
		return (
			<Link
				href='/sign-in?next=/account'
				className='flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white'>
				<LogIn className='size-4 shrink-0' />
				Sign in to save your sites
			</Link>
		)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className='flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white'>
				<User className='size-4 shrink-0' />
				<span className='min-w-0 flex-1 truncate text-left'>{email}</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align='start' side='top' className='w-56'>
				<DropdownMenuItem asChild>
					<Link href='/account/projects' className='cursor-pointer'>
						<LayoutGrid className='size-3.5' /> My sites
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link href='/account' className='cursor-pointer'>
						<User className='size-3.5' /> Account
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => signOut({ callbackUrl: '/' })}
					className='cursor-pointer'>
					<LogOut className='size-3.5' /> Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
