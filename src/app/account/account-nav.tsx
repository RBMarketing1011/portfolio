'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
	FolderKanban,
	Images,
	LayoutDashboard,
	LayoutTemplate,
	Building2,
	Globe,
	Settings,
	ShieldCheck,
	UserCog,
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
	admin: ShieldCheck,
	accounts: Building2,
	sites: Globe,
	people: UserCog,
}

export function AccountNav({
	items,
	showLibrary = true,
}: {
	items: NavItem[]
	showLibrary?: boolean
}) {
	const pathname = usePathname()
	const bestMatch = items
		.map((item) => item.href)
		.filter((href) => pathname === href || pathname.startsWith(`${href}/`))
		.sort((a, b) => b.length - a.length)[0]

	return (
		<>
			<SidebarGroup>
				<SidebarMenu>
					{items.map((item) => {
						const Icon = ICONS[item.icon]
						// The root item (Overview) is a prefix of every other route, so a match
						// only counts when no other item matches the path more specifically.
						const active = item.href === bestMatch

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

			{showLibrary && (
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
			)}
		</>
	)
}
