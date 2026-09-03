import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
} from '@/components/ui/navigation-menu'

const navigation = [
	{ href: '/services', label: 'Services' },
	{ href: '/work', label: 'Work' },
	{ href: '/insights', label: 'Insights' },
	{ href: '/about', label: 'About' },
]

function Wordmark() {
	return (
		<Link href='/' className='flex items-center gap-2.5'>
			<Image
				src='/logo/reynolds-built-logo.svg'
				alt=''
				width={34}
				height={27}
				priority
			/>
			<span className='font-display text-lg font-semibold tracking-tight text-white'>
				Reynolds<span className='text-brand'>Build</span>.dev
			</span>
		</Link>
	)
}

export default function SiteHeader() {
	return (
		<header className='absolute inset-x-0 top-0 z-20 border-b border-white/10 bg-ink/90 px-6 py-5 backdrop-blur sm:px-10 lg:px-16'>
			<nav
				className='mx-auto flex max-w-6xl items-center justify-between gap-8'
				aria-label='Main'>
				<Wordmark />

				<NavigationMenu className='hidden md:block'>
					<NavigationMenuList className='gap-7'>
						{navigation.map((item) => (
							<NavigationMenuItem key={item.href}>
								<NavigationMenuLink asChild>
									<Link
										href={item.href}
										className='text-slate-300 hover:bg-transparent hover:text-white focus:bg-transparent'>
										{item.label}
									</Link>
								</NavigationMenuLink>
							</NavigationMenuItem>
						))}
					</NavigationMenuList>
				</NavigationMenu>

				<div className='flex items-center gap-2'>
					<Button
						asChild
						className='hidden bg-brand text-ink hover:bg-brand-strong sm:inline-flex'>
						<Link href='/contact'>Let&apos;s talk</Link>
					</Button>

					<Sheet>
						<SheetTrigger asChild>
							<Button
								variant='outline'
								size='icon'
								className='border-white/15 bg-transparent text-white hover:bg-white/10 md:hidden'>
								<Menu />
								<span className='sr-only'>Open menu</span>
							</Button>
						</SheetTrigger>
						<SheetContent side='right' className='border-white/10 bg-ink'>
							<SheetHeader>
								<SheetTitle className='text-left text-white'>Menu</SheetTitle>
							</SheetHeader>
							<div className='flex flex-col gap-1 px-4'>
								{navigation.map((item) => (
									<Link
										key={item.href}
										href={item.href}
										className='rounded-md px-2 py-3 text-slate-300 hover:bg-white/5 hover:text-white'>
										{item.label}
									</Link>
								))}
								<Button
									asChild
									className='mt-4 bg-brand text-ink hover:bg-brand-strong'>
									<Link href='/contact'>Let&apos;s talk</Link>
								</Button>
							</div>
						</SheetContent>
					</Sheet>
				</div>
			</nav>
		</header>
	)
}
