import Link from 'next/link'
import {
	ArrowRight,
	Bot,
	LayoutPanelTop,
	Sparkles,
	type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function Home() {
	return (
		<>
			<section className='hero-grid relative overflow-hidden px-6 pb-24 pt-36 sm:px-10 lg:px-16 lg:pb-32'>
				<div className='mx-auto max-w-6xl'>
					<p className='eyebrow'>ReynoldsBuild.dev</p>
					<h1 className='mt-6 max-w-4xl font-display text-5xl font-semibold leading-[1.03] text-white sm:text-7xl'>
						Software that keeps your business moving.
					</h1>
					<p className='mt-7 max-w-2xl text-lg leading-8 text-slate-300'>
						We design and build the portals, tools, and automations that clear
						operational friction and give growing teams room to work.
					</p>
					<div className='mt-10 flex flex-wrap gap-4'>
						<Button
							asChild
							size='lg'
							className='bg-[#1684f5] text-[#02101f] hover:bg-[#4aa2fb]'>
							<Link href='/contact'>
								Start a project <ArrowRight />
							</Link>
						</Button>
						<Button
							asChild
							size='lg'
							variant='outline'
							className='border-[#1684f5]/70 bg-transparent text-slate-100 hover:bg-[#1684f5]/10 hover:text-white'>
							<Link href='/work'>Explore our work</Link>
						</Button>
					</div>
				</div>
			</section>

			<section className='border-y border-white/10 bg-[#07111f] px-6 py-16 sm:px-10 lg:px-16'>
				<div className='mx-auto grid max-w-6xl gap-5 md:grid-cols-3'>
					<ServiceHighlight
						icon={LayoutPanelTop}
						title='Built around your operations'
						text='Purpose-built portals and internal systems, designed around how your team actually works.'
					/>
					<ServiceHighlight
						icon={Bot}
						title='Automation that earns its keep'
						text='Practical AI and integrations that remove repetitive work without adding another fragile tool.'
					/>
					<ServiceHighlight
						icon={Sparkles}
						title='A focused delivery partner'
						text='Strategy, design, and engineering under one roof, from the first workflow map to launch.'
					/>
				</div>
			</section>
		</>
	)
}

function ServiceHighlight({
	icon: Icon,
	title,
	text,
}: {
	icon: LucideIcon
	title: string
	text: string
}) {
	return (
		<Card className='border-white/10 bg-[#091525] shadow-none'>
			<CardContent className='p-7'>
				<Icon className='text-[#1684f5]' size={25} strokeWidth={1.7} />
				<h2 className='mt-5 font-display text-xl font-semibold text-white'>
					{title}
				</h2>
				<p className='mt-3 leading-7 text-slate-400'>{text}</p>
			</CardContent>
		</Card>
	)
}
