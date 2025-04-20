import About from "@/components/about"
import Experience from "@/components/experience"
import Hero from "@/components/hero"
import Projects from "@/components/projects"
import AnimatedGridPattern from '@/components/ui/animated-grid-pattern'
import { Badge } from '@/components/ui/badge'
import prismaDB from '@/db/prismaDB'
import { cn } from '@/lib/utils'

export default async function Home ()
{
  const profile = await prismaDB.profile.findFirst({
    where: {
      email: 'rbmarketingandanalytics@gmail.com'
    },
    include: {
      experiences: {
        include: {
          bulletPoints: true,
        },
      },
      projects: true,
    },
  })


  return (
    profile &&
    <div className="space-y-10 sm:space-y-16">
      <div className="fixed inset-0 -z-10 w-screen h-screen">
        <AnimatedGridPattern
          numSquares={ 30 }
          maxOpacity={ 0.1 }
          duration={ 3 }
          className={ cn(
            "[mask-image:radial-gradient(700px_circle_at_center,white,transparent)]",
            "inset-x-0 w-full h-screen skew-y-12"
          ) }
        />
      </div>
      <Hero
        profile={ profile }
      />
      <About
        profile={ profile }
      />
      <Experience
        experiences={ profile.experiences }
      />
      <Projects
        projects={ profile.projects }
      />

      <section id='stack' className="flex flex-col gap-1 items-center justify-center text-center max-w-screen-md mx-auto">
        <span className="text-2xl font-bold">
          Psst…
        </span>
        <span>
          this template has been customized with some slick tech too.
        </span>
        <span>
          I didn&apos;t just clone it — peep the stack below.
        </span>
        <div className="max-w-[400px] flex flex-wrap gap-3 items-center justify-center mt-4">
          {
            [ 'React', 'NextJS', 'Typescript', 'Prisma ORM', 'SQLite', 'Vercel', 'TailwindCSS', 'ShadCN', 'SSR', 'ISR' ]
              .map((tech, idx) => (

                <Badge key={ idx } variant="default" className="rounded-full">
                  { tech }
                </Badge>

              ))
          }
        </div>
      </section>
    </div>
  )
}
