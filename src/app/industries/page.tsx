import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { CtaBand, PageHero, Section } from '@/components/sections'
import { GlassCard } from '@/components/ui/glass-card'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { industries } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Industries',
	description:
		'AI, automation, and custom software for home services, auto repair, moving and logistics, marketing agencies, professional services, and multi-location retail.',
	path: '/industries',
})

export default function IndustriesPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Industries', path: '/industries' },
				])}
			/>

			<PageHero
				eyebrow='Industries'
				title='Different trades, same bottleneck.'
				description='We work with operations where the growth ceiling is manual work, not demand. The tools vary by industry. The underlying problems rarely do.'
			/>

			<Section>
				<div className='grid gap-6 md:grid-cols-2'>
					{industries.map((industry) => (
						<GlassCard key={industry.slug} interactive asChild>
							<Link href={`/industries/${industry.slug}`} className='group p-8'>
							<span className='flex size-12 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
								<industry.icon className='size-6 text-brand' />
							</span>
							<h2 className='mt-6 font-display text-2xl font-semibold text-white'>
								{industry.name}
							</h2>
							<p className='mt-3 leading-7 text-slate-400'>{industry.blurb}</p>
							<span className='mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
								What we build here <ArrowUpRight className='size-4' />
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
