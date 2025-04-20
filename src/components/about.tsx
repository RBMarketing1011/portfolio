import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Download } from "lucide-react"
import Image from "next/image"
import { HTMLAttributes } from "react"
import { GithubLogo } from "./icons"
import { Profile } from '@/prisma'
import Link from 'next/link'

const About = (
  {
    profile
  }: {
    profile: Profile
  }
) =>
{
  return (
    <section id="about" className="relative py-20 px-6">
      <div className="max-w-screen-md mx-auto">
        <div className="flex flex-col md:flex-row-reverse gap-12">
          {/* <ProfileImage className="hidden md:block" /> */ }

          <Image
            className="hidden md:block w-72 object-cover object-left self-center image rounded-lg"
            width={ 0 }
            height={ 0 }
            sizes="100vw"
            src={ profile.avatarUrl }
            alt={ profile.firstname + " " + profile.lastname + " profile image" }
          />

          {/* Content */ }
          <div className="flex-1 md:text-left">
            <Badge variant="secondary" className="mb-4">
              About Me
            </Badge>
            <Image
              className="mt-3 mb-8 block md:hidden w-48 aspect-square object-cover object-left self-center image rounded-lg"
              width={ 0 }
              height={ 0 }
              sizes="100vw"
              src={ profile.avatarUrl }
              alt={ profile.firstname + " " + profile.lastname + " profile image" }
            />
            <h2 className="text-4xl font-bold mb-4 tracking-tight">
              Code, Coffee, and No BS
            </h2>
            <p className="text-muted-foreground mb-6 text-justify">
              { profile.bio }
            </p>
            <div className="flex flex-wrap gap-4 justify-start">
              <Link
                href={ profile.github }
                target="_blank"
                rel="noopener noreferrer"
                className={ cn(buttonVariants(), "rounded-full") }
              >
                <GithubLogo />
                View Github
              </Link>
              <Button variant="outline" className="rounded-full">
                <Download />
                Download CV
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const ProfileImage = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={ cn("mt-10 w-48 h-48 md:w-64 md:h-64", className) } { ...props }>
    <div className="relative w-full h-full rounded-2xl overflow-hidden bg-accent">
      <Image src="/placeholder.svg" alt="" className="object-cover" fill />
    </div>
  </div>
)
export default About
