import { Button, buttonVariants } from "@/components/ui/button"
import
{
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet"
import
{
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu"
import { Menu } from "lucide-react"
import Link from 'next/link'
import { cn } from '@/lib/utils'

export const NavigationSheet = () =>
{
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent className="pt-3 px-6">
        <SheetHeader>
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <SheetDescription className="sr-only">Main navigation for mobile</SheetDescription>
        </SheetHeader>
        <Link href="/#hero">
          <SheetClose
            className={ cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              "rounded-full shadow-none bg-accent-foreground text-accent hover:bg-accent-foreground hover:text-accent"
            ) }
          >
            <span className="flex items-center gap-0.5">
              A <span className="rotate-y-180">R</span>
            </span>
          </SheetClose>
        </Link>
        <NavigationMenu
          className={ cn("data-[orientation=vertical]:items-start mt-12") }
          orientation="vertical"
        >
          <NavigationMenuList className="gap-1 space-x-0 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-start">
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link href="/#about">
                  <SheetClose>
                    About
                  </SheetClose>
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link href="/#experience">
                  <SheetClose>
                    Experience
                  </SheetClose>
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link href="/#projects">
                  <SheetClose>
                    Projects
                  </SheetClose>
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <Link href="/#stack">
                  <SheetClose>
                    Tech Stack
                  </SheetClose>
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </SheetContent>
    </Sheet>
  )
}
