import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { CtaBand, PageHero, Section } from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { projects } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Portfolio',
	description:
		'Software built by ReynoldsBuilt: SaaS platforms, scheduling products, client portals, reporting systems, and branded training platforms.',
	path: '/portfolio',
})

export default function PortfolioPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Portfolio', path: '/portfolio' },
				])}
			/>

			<PageHero
				eyebrow='Portfolio'
				title='Real software, running in real businesses.'
				description='Platforms, portals, scheduling products, and training systems. Every one of these replaced a manual process or a tool that was not doing the job.'
			/>

			<Section>
				<div className='space-y-24'>
					{projects.map((project, index) => (
						<article
							key={project.slug}
							id={project.slug}
							className='grid scroll-mt-28 gap-10 lg:grid-cols-2 lg:items-center'>
							<div
								className={
									index % 2 === 1 ? 'lg:order-2' : undefined
								}>
								<GlassCard>
									{project.video ? (
										<video
											className='h-auto w-full'
											controls
											playsInline
											preload='metadata'
											poster={project.image}>
											<source src={project.video} type='video/mp4' />
										</video>
									) : (
										<Image
											src={project.image}
											alt={`${project.name} interface`}
											width={1600}
											height={900}
											className='h-auto w-full'
										/>
									)}
								</GlassCard>
							</div>

							<div>
								<p className='eyebrow'>{project.category}</p>
								<h2 className='mt-3 font-display text-3xl font-semibold text-white'>
									{project.name}
								</h2>
								<p className='mt-4 leading-8 text-slate-400'>
									{project.summary}
								</p>

								<div className='mt-6 flex flex-wrap gap-2'>
									{project.stack.map((tech) => (
										<Badge
											key={tech}
											variant='outline'
											className='border-white/15 text-slate-300'>
											{tech}
										</Badge>
									))}
								</div>

								<Link
									href={`/case-studies/${project.slug}`}
									className='mt-7 inline-flex items-center gap-2 font-semibold text-brand hover:text-brand-strong'>
									Read the case study <ArrowUpRight className='size-4' />
								</Link>
							</div>
						</article>
					))}
				</div>
			</Section>

			<CtaBand />
		</>
	)
}
