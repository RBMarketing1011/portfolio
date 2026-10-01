'use client'

import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown } from 'lucide-react'

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from '@/components/ui/sidebar'
import { LogoMark } from '@/components/brand'
import { site } from '@/lib/site'
import { cn } from '@/lib/utils'

export type AccountOption = { id: string; name: string; isOwner: boolean }

export function TeamSwitcher({
	accounts,
	currentAccountId,
}: {
	accounts: AccountOption[]
	currentAccountId: string
}) {
	const { isMobile } = useSidebar()
	const router = useRouter()

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
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size='lg'
							className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'>
							<LogoMark className='aspect-791/841 h-7 shrink-0' />
							<div className='grid flex-1 text-left leading-tight'>
								<span className='truncate font-display text-base font-semibold tracking-tight'>
									{site.nameParts.first}
									<span className='text-brand'>{site.nameParts.second}</span>
								</span>
							</div>
							<ChevronsUpDown className='ml-auto' />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
						align='start'
						side={isMobile ? 'bottom' : 'right'}
						sideOffset={4}>
						<DropdownMenuLabel className='text-muted-foreground text-xs'>
							Accounts
						</DropdownMenuLabel>
						{accounts.map((account) => (
							<DropdownMenuItem
								key={account.id}
								onClick={() => switchTo(account.id)}
								className='gap-2 p-2'>
								<span className='min-w-0 flex-1 truncate'>{account.name}</span>
								{account.isOwner && (
									<span className='text-muted-foreground shrink-0 text-xs'>
										yours
									</span>
								)}
								<Check
									className={cn(
										'size-4 shrink-0',
										account.id === currentAccountId
											? 'text-brand opacity-100'
											: 'opacity-0',
									)}
								/>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
