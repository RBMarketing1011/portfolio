import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { insights } from "@/lib/site-content"

export default function InsightsPage ()
{
  return <div className="min-h-screen bg-[#03080f] px-6 pb-24 pt-36 sm:px-10 lg:px-16"><section className="mx-auto max-w-6xl"><p className="eyebrow">Insights</p><h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold text-white sm:text-6xl">Useful thinking for the systems you run.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Notes on product decisions, automation, and the operational realities behind custom software.</p><div className="mt-14 grid gap-5 md:grid-cols-3">{ insights.map((insight) => <Card key={ insight.slug } className="flex flex-col border-white/10 bg-[#091525] shadow-none"><CardHeader><p className="text-sm font-medium text-[#1684f5]">{ insight.category }</p><h2 className="font-display text-xl font-semibold text-white">{ insight.title }</h2></CardHeader><CardContent className="flex-1 leading-7 text-slate-400">{ insight.excerpt }</CardContent><CardFooter><Link href={ `/insights/${insight.slug}` } className="inline-flex items-center gap-2 text-sm font-semibold text-[#61adfb] hover:text-white">Read article <ArrowUpRight size={ 16 } /></Link></CardFooter></Card>) }</div></section></div>
}