import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
	CtaBand,
	PageHero,
	Section,
	SectionHeading,
} from '@/components/sections'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { principles, processSteps } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'About Us',
	description:
		'ReynoldsBuilt is an AI, automation, and software consultancy that audits an entire operation before building anything, then builds what the business actually needs.',
	path: '/about',
})

export default function AboutPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'About Us', path: '/about' },
				])}
			/>

			<PageHero
				eyebrow='About us'
				title='We are the people who ask why before we ask what.'
				description='ReynoldsBuilt exists because too many businesses buy software that does not fit and hire consultants who never build anything. We do both halves, and we do them in the right order.'
			/>

			<Section>
				<div className='grid gap-14 lg:grid-cols-[1.2fr_1fr]'>
					<div className='max-w-2xl space-y-6 text-lg leading-8 text-slate-300'>
						<h2 className='font-display text-3xl font-semibold text-white'>
							Consultants who ship
						</h2>
						<p>
							Most businesses we meet are running on a mix of good software, bad
							software, and a spreadsheet that quietly holds the whole thing
							together. Nobody planned it that way. It accumulated.
						</p>
						<p>
							The usual options are both bad. A strategy firm will produce a
							deck and leave. A dev shop will build exactly what you asked for,
							whether or not it was the right thing to ask for.
						</p>
						<p>
							We start by walking your operation end to end. Every process,
							every handoff, every place a person is doing something a system
							should be doing. Then we show you what is worth building, what is
							worth automating, and what should be left alone.
						</p>
						<p>
							After that, we build it. The same people who mapped the process
							write the code, which means nothing gets lost in translation.
						</p>
					</div>

					<GlassCard variant='accent' className='h-fit p-8'>
						<h2 className='font-display text-xl font-semibold text-white'>
							What we actually do
						</h2>
						<ul className='mt-6 space-y-5'>
							{processSteps.map((step) => (
								<li key={step.number} className='flex gap-4'>
									<span className='font-display text-lg font-semibold text-brand/50'>
										{step.number}
									</span>
									<span>
										<span className='block font-medium text-white'>
											{step.title}
										</span>
										<span className='mt-1 block text-sm leading-6 text-slate-400'>
											{step.summary}
										</span>
									</span>
								</li>
							))}
						</ul>
						<Button
							asChild
							className='mt-8 w-full bg-brand font-bold text-ink hover:bg-brand-strong'>
							<Link href='/process'>
								See The Full Process <ArrowRight />
							</Link>
						</Button>
					</GlassCard>
				</div>
			</Section>

			<Section className='border-t border-white/10 bg-[#060d18]'>
				<SectionHeading
					eyebrow='How we operate'
					title='Four things we will not compromise on'
				/>
				<div className='mt-12 grid gap-5 sm:grid-cols-2'>
					{principles.map((principle) => (
						<GlassCard key={principle.title} className='p-7'>
							<h3 className='font-display text-lg font-semibold text-white'>
								{principle.title}
							</h3>
							<p className='mt-3 leading-7 text-slate-400'>{principle.body}</p>
						</GlassCard>
					))}
				</div>
			</Section>

			<CtaBand />
		</>
	)
}
