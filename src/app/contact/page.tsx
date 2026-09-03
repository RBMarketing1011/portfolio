import { Mail } from "lucide-react"
import ContactForm from "@/components/contact-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ContactPage ()
{
  return <div className="min-h-screen bg-[#03080f] px-6 pb-24 pt-36 sm:px-10 lg:px-16"><section className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr]"><div><p className="eyebrow">Start a conversation</p><h1 className="mt-5 font-display text-4xl font-semibold leading-tight text-white sm:text-6xl">Bring us the process that needs to work better.</h1><p className="mt-6 max-w-md text-lg leading-8 text-slate-300">Tell us where your team is losing time, visibility, or momentum. We will come back with the most useful next step.</p><div className="mt-10 flex items-center gap-3 text-slate-300"><Mail className="text-[#1684f5]" size={ 20 } /><span>Email details are configured when the form goes live.</span></div></div><Card className="border-white/10 bg-[#091525] shadow-none"><CardHeader><CardTitle className="font-display text-2xl text-white">Project inquiry</CardTitle></CardHeader><CardContent><ContactForm /></CardContent></Card></section></div>
}