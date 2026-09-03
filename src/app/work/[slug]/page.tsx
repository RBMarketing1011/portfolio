import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { projects } from "@/lib/site-content"

export function generateStaticParams () { return projects.map((project) => ({ slug: project.slug })) }

export default async function CaseStudyPage ({ params }: { params: Promise<{ slug: string }> })
{
  const { slug } = await params
  const project = projects.find((item) => item.slug === slug)
  if (!project) notFound()
  return <div className="min-h-screen bg-[#03080f] px-6 pb-24 pt-36 sm:px-10 lg:px-16"><article className="mx-auto max-w-6xl"><Button asChild variant="ghost" className="mb-10 px-0 text-[#61adfb] hover:bg-transparent hover:text-white"><Link href="/work"><ArrowLeft /> All work</Link></Button><p className="eyebrow">{ project.category }</p><h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold text-white sm:text-6xl">{ project.name }</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">{ project.summary }</p><div className="mt-12 overflow-hidden border border-white/10 bg-[#091525]"><Image src={ project.image } alt={ `${project.name} interface preview` } width={ 1600 } height={ 900 } className="h-auto w-full" priority /></div>{ project.video && <video className="mt-6 w-full border border-white/10" controls playsInline preload="metadata" poster={ project.image }><source src={ project.video } type="video/mp4" /></video> }<div className="mt-12 grid gap-8 lg:grid-cols-[1fr_18rem]"><div className="space-y-8"><CaseSection title="The opportunity" text="Detailed project context, constraints, and measurable outcomes are being prepared for publication. This case study will document the business problem, delivery approach, and the system in use." /><CaseSection title="What we built" text="The product was shaped around the workflows that needed to become clearer, faster, and easier to manage. Design and implementation details will be added alongside approved project context." /><CaseSection title="Next chapter" text="This work continues to inform how ReynoldsBuild.dev approaches practical, focused software for operating teams." /></div><Card className="h-fit border-white/10 bg-[#091525] shadow-none"><CardContent className="p-6"><p className="font-display font-semibold text-white">Capabilities</p><div className="mt-4 flex flex-wrap gap-2">{ project.capabilities.map((capability) => <Badge key={ capability } variant="outline" className="border-[#1684f5]/40 text-slate-300">{ capability }</Badge>) }</div></CardContent></Card></div></article></div>
}

function CaseSection ({ title, text }: { title: string, text: string }) { return <section><h2 className="font-display text-2xl font-semibold text-white">{ title }</h2><p className="mt-3 max-w-2xl leading-8 text-slate-400">{ text }</p></section> }