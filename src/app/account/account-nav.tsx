'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
	FolderKanban,
	Images,
	LayoutDashboard,
	LayoutTemplate,
	Settings,
	Users,
} from 'lucide-react'
import {
	SidebarGroup,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from '@/components/ui/sidebar'

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS }

const ICONS = {
	overview: LayoutDashboard,
	projects: FolderKanban,
	team: Users,
	media: Images,
	settings: Settings,
}

export function AccountNav({ items }: { items: NavItem[] }) {
	const pathname = usePathname()

	return (
		<>
			<SidebarGroup>
				<SidebarMenu>
					{items.map((item) => {
						const Icon = ICONS[item.icon]
						// Overview would otherwise light up on every child route.
						const active =
							item.href === '/account'
								? pathname === '/account'
								: pathname === item.href || pathname.startsWith(`${item.href}/`)

						return (
							<SidebarMenuItem key={item.href}>
								<SidebarMenuButton
									asChild
									isActive={active}
									tooltip={item.label}>
									<Link
										href={item.href}
										aria-current={active ? 'page' : undefined}>
										<Icon />
										<span>{item.label}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						)
					})}
				</SidebarMenu>
			</SidebarGroup>

			<SidebarGroup className='mt-auto'>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip='Section library'>
							<Link href='/builder/site-header'>
								<LayoutTemplate />
								<span>Section library</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarGroup>
		</>
	)
}
