import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AboutPage() {
	return (
		<div className='min-h-screen bg-[#03080f] px-6 pb-24 pt-36 sm:px-10 lg:px-16'>
			<section className='mx-auto max-w-4xl'>
				<p className='eyebrow'>About ReynoldsBuild.dev</p>
				<h1 className='mt-5 font-display text-4xl font-semibold leading-tight text-white sm:text-6xl'>
					A software partner for businesses ready to work differently.
				</h1>
				<div className='mt-10 max-w-2xl space-y-6 text-lg leading-8 text-slate-300'>
					<p>
						ReynoldsBuild.dev helps growing businesses replace fragmented,
						manual processes with software that makes daily work clearer.
					</p>
					<p>
						We bring strategy, interface design, and engineering together so
						useful tools reach the people who need them without the usual
						handoffs and confusion.
					</p>
					<p>
						Our point of view is simple: the best software respects the reality
						of your operation, then makes that reality easier to run.
					</p>
				</div>
				<Button
					asChild
					size='lg'
					className='mt-10 bg-[#1684f5] text-[#02101f] hover:bg-[#4aa2fb]'>
					<Link href='/contact'>
						Tell us what you are building <ArrowRight />
					</Link>
				</Button>
			</section>
		</div>
	)
}
