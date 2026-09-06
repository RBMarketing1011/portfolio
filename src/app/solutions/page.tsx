import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { CtaBand, PageHero, Section } from '@/components/sections'
import { GlassCard } from '@/components/ui/glass-card'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { solutions } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Solutions',
	description:
		'Document automation, customer intake and scheduling, client portals, reporting dashboards, training systems, internal tools, and systems integration.',
	path: '/solutions',
})

export default function SolutionsPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Solutions', path: '/solutions' },
				])}
			/>

			<PageHero
				eyebrow='Solutions'
				title='The builds that come up again and again.'
				description='Every business is different, but the shape of the work repeats. These are the systems we are asked for most, and the ones that tend to pay for themselves fastest.'
			/>

			<Section>
				<div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
					{solutions.map((solution) => (
						<GlassCard key={solution.slug} interactive asChild>
							<Link href={`/solutions/${solution.slug}`} className='group p-7'>
							<span className='flex size-11 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
								<solution.icon className='size-5 text-brand' />
							</span>
							<h2 className='mt-5 font-display text-lg font-semibold text-white'>
								{solution.name}
							</h2>
							<p className='mt-3 leading-7 text-slate-400'>{solution.blurb}</p>
							<span className='mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
								Details <ArrowUpRight className='size-4' />
							</span>
							</Link>
						</GlassCard>
					))}
				</div>
			</Section>

			<CtaBand />
		</>
	)
}
