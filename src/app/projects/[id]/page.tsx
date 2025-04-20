import Image from "next/image"
import Link from "next/link"
import { Calendar, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import prismaDB from '@/db/prismaDB'
import { cn } from '@/lib/utils'

export default async function ProjectShowcase ({ params }: { params: Promise<{ id: string }> })
{
  // Fetch project details from the database using the provided ID
  const { id } = await params

  const project = await prismaDB.project.findFirst({
    where: {
      id,
    },
  })

  const formattedDate = new Date(project?.launchDate!).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="flex w-screen h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-7xl overflow-hidden border-none shadow-none">
        <CardContent className="p-0">
          <div className="grid max-h-screen pt-20 grid-cols-1 overflow-auto md:grid-cols-2 md:overflow-hidden lg:grid-cols-5">
            {/* Media Section - Takes full width on mobile, left side on desktop */ }
            <div className="relative h-[40vh] md:h-full lg:col-span-3">
              {
                !project?.videoUrl ? (
                  <div className="relative h-full w-full">
                    <Image
                      src={ project?.imageUrl! }
                      alt={ project?.title! }
                      width={ 0 }
                      height={ 0 }
                      sizes="100vw"
                      className={ cn(project?.shortTitle!.toLowerCase().includes('hub') && 'object-left', 'object-cover w-full h-full') }
                      priority
                    />
                  </div>
                )
                  :
                  (
                    <div className="flex flex-col justify-center h-full w-full">
                      <video
                        src={ project.videoUrl }
                        className="object-cover w-full h-auto"
                        autoPlay
                        muted
                        playsInline
                        controls
                      />
                    </div>
                  )
              }

            </div>

            {/* Content Section - Takes full width on mobile, right side on desktop */ }
            <div className="flex flex-col justify-between px-6 py-0 col-span-2">
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{ project?.title }</h1>
                  <p className="mt-2 text-lg text-muted-foreground">{ project?.excerpt }</p>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Launched { formattedDate }</span>
                </div>

                <Separator />

                <div>
                  <h2 className="mb-3 text-xl font-semibold">About</h2>
                  <p className="text-muted-foreground">{ project?.description }</p>
                </div>

                <div>
                  <h2 className="mb-3 text-xl font-semibold">Technologies</h2>
                  <div className="flex flex-wrap gap-2">
                    { project?.technologies?.split(' ').map((tech) => (
                      <Badge key={ tech } variant="secondary">
                        { tech }
                      </Badge>
                    )) }
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <Button asChild className="w-full gap-2" size="lg">
                  <Link href={ project?.websiteUrl! } target="_blank" rel="noopener noreferrer">
                    Visit Website
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
