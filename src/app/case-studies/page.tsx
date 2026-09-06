import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { CtaBand, PageHero, Section } from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { projects } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Case Studies',
	description:
		'How ReynoldsBuilt approached real builds: the problem, the approach, what shipped, and the systems behind them.',
	path: '/case-studies',
})

export default function CaseStudiesPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Case Studies', path: '/case-studies' },
				])}
			/>

			<PageHero
				eyebrow='Case studies'
				title='The problem, the approach, and what shipped.'
				description='No vanity metrics. Just what the business was dealing with, how we approached it, and what exists now.'
			/>

			<Section>
				<div className='grid gap-6 md:grid-cols-2'>
					{projects.map((project) => (
						<GlassCard key={project.slug} interactive asChild>
							<Link
								href={`/case-studies/${project.slug}`}
								className='group flex flex-col'>
							<span className='relative block aspect-video border-b border-white/10 bg-ink'>
								<Image
									src={project.image}
									alt={`${project.name} interface`}
									fill
									sizes='(min-width: 768px) 50vw, 100vw'
									className='object-cover transition-transform duration-500 group-hover:scale-105'
								/>
							</span>
							<span className='flex flex-1 flex-col p-7'>
								<span className='text-sm font-medium text-brand'>
									{project.category}
								</span>
								<span className='mt-1 font-display text-xl font-semibold text-white'>
									{project.name}
								</span>
								<span className='mt-3 flex-1 leading-7 text-slate-400'>
									{project.summary}
								</span>
								<span className='mt-5 flex flex-wrap gap-2'>
									{project.capabilities.map((capability) => (
										<Badge
											key={capability}
											variant='outline'
											className='border-brand/30 text-slate-300'>
											{capability}
										</Badge>
									))}
								</span>
								<span className='mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
									Read case study <ArrowUpRight className='size-4' />
								</span>
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
