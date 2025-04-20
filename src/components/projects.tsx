import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { ExternalLink, FolderOpenDot, LinkIcon } from "lucide-react"
import Image from "next/image"
import { GithubLogo } from "./icons"
import { Project } from '@/prisma'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const ProjectCard = (
  {
    project,
  }: {
    project: Project
  }
) =>
{
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-accent transition-all hover:border-primary/50 bg-blur-sm bg-background/50">
      {/* Project Image */ }
      <div className="relative h-56 overflow-hidden bg-accent">
        <Image
          src={ project.imageUrl! }
          alt={ project.title }
          width={ 0 }
          height={ 0 }
          sizes="100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          fill
        />
      </div>

      {/* Content */ }
      <div className="flex-1 flex flex-col p-6">
        <h3 className="text-xl font-semibold mb-2">{ project.shortTitle }</h3>
        <p className="text-muted-foreground mb-4">
          { project.excerpt }
        </p>

        {/* Technologies */ }
        <div className="flex flex-wrap gap-2 mb-6">
          { project.technologies!.split(' ').map((tech) => (
            <Badge key={ tech } variant="secondary" className="rounded-full">
              { tech }
            </Badge>
          )) }
        </div>

        {/* Actions */ }
        <div className="flex gap-3 mt-auto">
          <Link href={ project.websiteUrl! } target='_blank' rel='noopener nofollow' className={ cn(buttonVariants(), "rounded-full") } >
            <ExternalLink className="mr-1 h-4 w-4" />
            Live Site
          </Link>

          <Link
            href={ `/projects/${ project.id }` }
            className={ cn(buttonVariants({ variant: 'outline' }), "rounded-full  shadow-none") }
          >
            <FolderOpenDot className="mr-1 h-4 w-4" />
            View Project
          </Link>
        </div>
      </div>
    </div>
  )
}

const Projects = (
  {
    projects
  }: {
    projects: Project[]
  }
) =>
{

  return (
    <section id="projects" className="relative py-20 px-6">
      <div className="max-w-screen-md mx-auto">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
            Projects
          </Badge>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Featured Work
          </h2>
          <p className="text-muted-foreground mt-2 sm:mt-4 text-lg">
            Showcasing some of my best projects and technical achievements
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {
            projects
              .sort((a, b) => b.launchDate.getTime() - a.launchDate.getTime())
              .map((project, index) => (

                <ProjectCard key={ index } project={ project } />

              ))
          }
        </div>
      </div>
    </section>
  )
}

export default Projects
