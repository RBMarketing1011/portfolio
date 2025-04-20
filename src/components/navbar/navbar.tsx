import { Button, buttonVariants } from "@/components/ui/button"
import { GithubLogo, LinkedInLogo } from "../icons"
import
{
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { NavigationSheet } from "./navigation-sheet"
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Profile } from '@/prisma'

const Navbar = (
  {
    profile
  }: {
    profile: Profile
  }
) =>
{
  return (
    <nav className="fixed z-10 top-6 inset-x-4 h-14 bg-background border dark:border-slate-700/70 max-w-screen-md mx-auto rounded-full">
      <div className="h-full flex items-center justify-between mx-auto px-3">
        {/* <Logo /> */ }
        <Link
          href='/#hero'
          className={ cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full shadow-none bg-accent-foreground text-accent hover:bg-accent-foreground hover:text-accent") }
        >
          <span className="flex items-center gap-0.5">
            A <span className='rotate-y-180'>R</span>
          </span>
        </Link>

        {/* Desktop Menu */ }

        <NavigationMenu
          className={ cn("data-[orientation=vertical]:items-start hidden md:block") }
        >
          <NavigationMenuList className="gap-1 space-x-0 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-start">
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link href="/#about">
                  About
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link href="/#experience">
                  Experience
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link href="/#projects">
                  Projects
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link href="/#stack">
                  Tech Stack
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-2">
          <Link
            href={ profile.linkedIn }
            target='_blank'
            rel='noopener noreferrer'
            className={ cn(buttonVariants({ variant: 'outline', size: 'icon' }), "hidden sm:inline-flex rounded-full shadow-none") }
          >
            <LinkedInLogo />
          </Link>
          <Link
            href={ profile.github }
            target='_blank'
            rel='noopener noreferrer'
            className={ cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full shadow-none") }
          >
            <GithubLogo className="h-5! w-5!" />
          </Link>

          {/* Mobile Menu */ }
          <div className="md:hidden">
            <NavigationSheet />
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
