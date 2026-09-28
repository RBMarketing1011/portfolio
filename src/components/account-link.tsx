'use client'

import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { LayoutGrid, LogOut, User } from 'lucide-react'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/** Signed out this is just a link, so the header looks the same as before. */
export function AccountLink({ className }: { className?: string }) {
	const { data: session, status } = useSession()

	if (status !== 'authenticated')
		return (
			<Link href='/sign-in' className={className}>
				Sign In
			</Link>
		)

	const label = session.user?.email?.split('@')[0] ?? 'Account'

	return (
		<DropdownMenu>
			<DropdownMenuTrigger className={cn(className, 'gap-1.5')}>
				<User className='size-3.5' />
				{label}
			</DropdownMenuTrigger>
			<DropdownMenuContent align='end' className='w-52 border-white/10'>
				<DropdownMenuItem asChild>
					<Link href='/builder/sites' className='cursor-pointer'>
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
