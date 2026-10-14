import Link from 'next/link'
import { LogoMark } from '@/components/brand'
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from '@/components/ui/sidebar'
import { site } from '@/lib/site'

/**
 * The top of the account sidebar. It is only the brand: people do not switch
 * accounts from here. Admins open a different account from the admin area, so
 * there is nothing to choose between.
 */
export function AccountBrand() {
	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton size='lg' asChild>
					<Link href='/account'>
						<LogoMark className='aspect-791/841 h-7 shrink-0' />
						<span className='truncate font-display text-base font-semibold tracking-tight'>
							{site.nameParts.first}
							<span className='text-brand'>{site.nameParts.second}</span>
						</span>
					</Link>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	)
}
