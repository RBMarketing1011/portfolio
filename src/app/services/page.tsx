import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
	CheckList,
	CtaBand,
	PageHero,
	Section,
	SectionHeading,
} from '@/components/sections'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Separator } from '@/components/ui/separator'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { capabilityGroups, services } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Services',
	description:
		'AI and automation assessments, workflow automation, applied AI systems, and custom software built around how your business actually runs.',
	path: '/services',
})

export default function ServicesPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Services', path: '/services' },
				])}
			/>

			<PageHero
				eyebrow='Services'
				title='Consulting that ends in working software.'
				description='We start by understanding the business, not the tech stack. Then we build the smallest thing that moves the needle, and keep going from there.'>
				<Button
					asChild
					size='lg'
					className='mt-9 bg-brand font-bold text-ink hover:bg-brand-strong'>
					<Link href='/contact'>
						Book An Assessment <ArrowRight />
					</Link>
				</Button>
			</PageHero>

			{services.map((service, index) => (
				<Section
					key={service.slug}
					id={service.slug}
					className={
						index % 2 === 1 ? 'border-y border-white/10 bg-[#060d18]' : ''
					}>
					<div className='grid gap-12 lg:grid-cols-[1fr_1.2fr]'>
						<div>
							<span className='flex size-12 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
								<service.icon className='size-6 text-brand' />
							</span>
							<p className='mt-6 eyebrow'>{service.tagline}</p>
							<h2 className='mt-3 font-display text-3xl font-semibold text-white sm:text-4xl'>
								{service.name}
							</h2>
							<p className='mt-5 leading-8 text-slate-400'>{service.summary}</p>
						</div>

						<GlassCard className='p-8'>
							<h3 className='font-display font-semibold text-white'>
								What you get
							</h3>
							<div className='mt-5'>
								<CheckList items={service.deliverables} />
							</div>

							<Separator className='my-7 bg-white/10' />

							<h3 className='font-display font-semibold text-white'>
								What changes
							</h3>
							<ul className='mt-5 space-y-3'>
								{service.outcomes.map((outcome) => (
									<li key={outcome} className='leading-7 text-slate-400'>
										{outcome}
									</li>
								))}
							</ul>
						</GlassCard>
					</div>
				</Section>
			))}

			<Section className='border-t border-white/10'>
				<SectionHeading
					eyebrow='Capabilities'
					title='The engineering underneath'
					description='The consulting is the front half. This is what we bring to the build.'
				/>
				<div className='mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
					{capabilityGroups.map((group) => (
						<GlassCard key={group.title} className='p-6'>
							<group.icon className='size-5 text-brand' />
							<h3 className='mt-4 font-display font-semibold text-white'>
								{group.title}
							</h3>
							<ul className='mt-3 space-y-2 text-slate-400'>
								{group.items.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						</GlassCard>
					))}
				</div>
			</Section>

			<CtaBand />
		</>
	)
}
