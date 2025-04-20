import { Badge } from "@/components/ui/badge"
import type { Experience, Prisma } from '@/prisma'
import { Building2, Calendar } from "lucide-react"

type ExperienceBulletPoint = Prisma.ExperienceGetPayload<{
  include: {
    bulletPoints: true
  }
}>

const ExperienceItem = (
  {
    experience,
  }: {
    experience: ExperienceBulletPoint
  }) =>
{
  return (
    <div className="relative pl-8 not-last:pb-12">
      {/* Timeline line */ }
      <div className="absolute left-0 top-2.5 h-full w-[2px] bg-muted group-first:h-[calc(100%-24px)] group-first:top-6">
        <div className="absolute h-3 w-3 -left-[5px] top-0 rounded-full border-2 border-primary bg-background" />
      </div>

      {/* Content */ }
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 size-9 bg-accent rounded-full flex items-center justify-center">
            <Building2 className="size-5 text-muted-foreground" />
          </div>
          <span className="text-lg font-semibold">{ experience.company }</span>
        </div>
        <div>
          <h3 className="text-xl font-medium">{ experience.title }</h3>
          <div className="flex items-center gap-2 mt-1 text-sm">
            <Calendar className="size-4" />
            <span>
              {
                experience.startDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                })
              }
              { experience?.endDate ? ' - ' : ' - Present' }
              {
                experience?.endDate && experience.endDate.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                })
              }
            </span>
          </div>
        </div>
        <ul className="list-disc list-inside space-y-2">
          {
            experience.bulletPoints.map(p => (

              <li key={ p.id } className="text-muted-foreground">{ p.text }</li>

            ))
          }
        </ul>
        <div className="flex flex-wrap gap-2">
          {
            experience.technology?.split(' ').map((tech) => (

              <Badge key={ tech } variant="secondary" className="rounded-full">
                { tech }
              </Badge>

            ))
          }
        </div>
      </div>
    </div>
  )
}

const Experience = (
  {
    experiences,
  }: {
    experiences: ExperienceBulletPoint[]
  }
) =>
{

  return (
    <section id="experience" className="relative py-20 px-6">
      <div className="max-w-screen-md mx-auto">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
            Experience
          </Badge>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Professional Journey
          </h2>
          <p className="text-muted-foreground mt-2 sm:mt-4 text-lg">
            A timeline of my professional growth and key achievements
          </p>
        </div>

        <div className="relative">
          {
            experiences.map((experience, index) => (

              <ExperienceItem key={ index } experience={ experience } />

            )).sort((a, b) => (
              b.props.experience.startDate.getTime() - a.props.experience.startDate.getTime()
            ))
          }
        </div>
      </div>
    </section>
  )
}

export default Experience
