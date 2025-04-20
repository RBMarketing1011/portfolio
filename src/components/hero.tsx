import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Profile } from '@/prisma/index'
import { CircleArrowDown, Zap } from "lucide-react"
import Link from 'next/link'

const Hero = (
  {
    profile
  }: {
    profile: Profile
  }) =>
{
  return (
    <div id='hero' className="relative min-h-screen flex items-center justify-center px-6 pt-6 overflow-hidden">
      <div className="relative z-[1] text-center max-w-screen-md">
        <Badge className="rounded-full border-none">
          <Zap className="fill-current" />
          { profile.title }
        </Badge>
        <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold !leading-[1.2] tracking-tight">
          Making Web Apps That Don&apos;t Break When You Blink
        </h1>
        <p className="mt-6 text-[17px] md:text-lg">
          { profile.excerpt } 🚀
        </p>
        <div className="mt-12 flex items-center justify-center gap-4">
          <Link href='/#projects' className={ cn(buttonVariants({ size: 'lg' }), 'rounded-full text-base') }>
            See What I Do <CircleArrowDown className="ml-2 !h-5.5 !w-5.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Hero
