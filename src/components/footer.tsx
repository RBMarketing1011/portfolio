'use client'

import { useState, useEffect } from 'react'
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { GithubLogo, LinkedInLogo } from "./icons"
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

const footerLinks = [
  {
    title: "About",
    href: "/#about",
  },
  {
    title: "Experience",
    href: "/#experience",
  },
  {
    title: "Projects",
    href: "/#projects",
  },
]

const Footer = () =>
{
  const [ isNearFooter, setIsNearFooter ] = useState(false)

  useEffect(() =>
  {
    const handleResize = () =>
    {
      const shouldWatch = window.innerWidth < 900
      const footer = document.querySelector('footer')

      if (!footer || !shouldWatch) return

      const observer = new IntersectionObserver(
        ([ entry ]) => setIsNearFooter(entry.isIntersecting),
        { root: null, threshold: 0 }
      )

      observer.observe(footer)

      return () => observer.disconnect()
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <footer className="mt-20">
      <div className="max-w-screen-md mx-auto">
        <div className="py-12 flex flex-col justify-start items-center">
          {/* Logo */ }
          <div className="flex items-center gap-1">
            Anthony
            <Link
              href='/#hero'
              className={ cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full shadow-none bg-accent-foreground text-accent hover:bg-accent-foreground hover:text-accent") }
            >
              <span className="flex items-center gap-0.5">
                A <span className='rotate-y-180'>R</span>
              </span>
            </Link>
            Reynolds
          </div>

          <ul className="mt-6 flex items-center gap-4 flex-wrap">
            { footerLinks.map(({ title, href }) => (
              <li key={ title }>
                <Link
                  href={ href }
                  className="text-muted-foreground hover:text-foreground"
                >
                  { title }
                </Link>
              </li>
            )) }
          </ul>
        </div>
        <Separator />
        <div className="py-6 flex flex-col-reverse sm:flex-row items-center justify-between gap-x-2 gap-y-5 px-6 xl:px-0">
          {/* Copyright */ }
          <span className="text-muted-foreground">
            &copy; { new Date().getFullYear() } Anthony Reynolds. All rights reserved.
          </span>

          <div className="flex items-center gap-5 text-muted-foreground">
            <Link href="https://github.com/RBMarketing1011" target="_blank">
              <GithubLogo className="h-5 w-5" />
            </Link>
            <Link href="https://www.linkedin.com/in/anthony-reynolds-87a528a3/" target="_blank">
              <LinkedInLogo className="h-5 w-5 fill-black" />
            </Link>
          </div>
        </div>
      </div>
      <div
        className={ `fixed right-5 z-50 transition-all duration-300 ${ isNearFooter ? 'bottom-24' : 'bottom-5'
          }` }
      >
        <ThemeToggle />
      </div>
    </footer>
  )
}

export default Footer
