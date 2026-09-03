import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { projects } from "@/lib/site-content"

export default function WorkPage ()
{
  return <div className="min-h-screen bg-[#03080f] px-6 pb-24 pt-36 sm:px-10 lg:px-16"><section className="mx-auto max-w-6xl"><p className="eyebrow">Selected work</p><h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold text-white sm:text-6xl">Software built for the work behind the work.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">A growing collection of systems, portals, learning experiences, and decision tools. Full case-study details are being prepared.</p><div className="mt-14 grid gap-5 md:grid-cols-2">{ projects.map((project) => <Card key={ project.slug } className="overflow-hidden border-white/10 bg-[#091525] shadow-none"><div className="relative aspect-video border-b border-white/10 bg-[#050b14]"><Image src={ project.image } alt={ `${project.name} interface preview` } fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" /></div><CardHeader><p className="text-sm font-medium text-[#1684f5]">{ project.category }</p><h2 className="font-display text-2xl font-semibold text-white">{ project.name }</h2></CardHeader><CardContent><p className="leading-7 text-slate-400">{ project.summary }</p><div className="mt-5 flex flex-wrap gap-2">{ project.capabilities.map((capability) => <Badge key={ capability } variant="outline" className="border-[#1684f5]/40 text-slate-300">{ capability }</Badge>) }</div></CardContent><CardFooter><Link className="inline-flex items-center gap-2 text-sm font-semibold text-[#61adfb] hover:text-white" href={ `/work/${project.slug}` }>View case study <ArrowUpRight size={ 16 } /></Link></CardFooter></Card>) }</div></section></div>
}