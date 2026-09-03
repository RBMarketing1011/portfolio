import Link from 'next/link'
import { ArrowRight, Blocks, BrainCircuit, Map } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const services = [
	{
		icon: Map,
		title: 'Product strategy',
		text: 'We map the workflow, identify the leverage points, and define the smallest useful version before a line of code is written.',
	},
	{
		icon: Blocks,
		title: 'Custom software',
		text: 'Portals, internal systems, dashboards, and applications designed for your process instead of forcing you into a generic one.',
	},
	{
		icon: BrainCircuit,
		title: 'AI and automation',
		text: 'Useful automations and connected systems that help your team move faster while keeping the work visible and accountable.',
	},
]

export default function ServicesPage() {
	return (
		<div className='min-h-screen bg-[#03080f] px-6 pb-24 pt-36 sm:px-10 lg:px-16'>
			<section className='mx-auto max-w-6xl'>
				<p className='eyebrow'>What we build</p>
				<h1 className='mt-5 max-w-3xl font-display text-4xl font-semibold text-white sm:text-6xl'>
					The digital systems behind better workdays.
				</h1>
				<p className='mt-6 max-w-2xl text-lg leading-8 text-slate-300'>
					ReynoldsBuild.dev partners with small and mid-sized businesses that
					have outgrown spreadsheets, disconnected tools, and manual handoffs.
				</p>
				<div className='mt-14 grid gap-5 md:grid-cols-3'>
					{services.map(({ icon: Icon, title, text }) => (
						<Card
							key={title}
							className='border-white/10 bg-[#091525] shadow-none'>
							<CardHeader>
								<Icon className='text-[#1684f5]' size={28} />
								<CardTitle className='pt-5 font-display text-xl text-white'>
									{title}
								</CardTitle>
							</CardHeader>
							<CardContent className='leading-7 text-slate-400'>
								{text}
							</CardContent>
						</Card>
					))}
				</div>
				<div className='mt-14 border-l-2 border-[#1684f5] pl-6'>
					<p className='font-display text-2xl font-medium text-white'>
						Not sure where to begin?
					</p>
					<p className='mt-2 max-w-xl text-slate-400'>
						Bring the process that is slowing your team down. We will help
						determine the practical next step.
					</p>
					<Button
						asChild
						className='mt-6 bg-[#1684f5] text-[#02101f] hover:bg-[#4aa2fb]'>
						<Link href='/contact'>
							Talk through a project <ArrowRight />
						</Link>
					</Button>
				</div>
			</section>
		</div>
	)
}
