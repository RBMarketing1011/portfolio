import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { CtaBand, PageHero, Section } from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { insights } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Blog',
	description:
		'Practical writing on applied AI, business automation, build strategy, and why most internal tools go unused.',
	path: '/blog',
})

const formatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
})

export default function BlogPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Blog', path: '/blog' },
				])}
			/>

			<PageHero
				eyebrow='Blog'
				title='AI and automation, minus the hype.'
				description='What we have learned building systems inside real operations, written for the person who has to make the call.'
			/>

			<Section>
				<div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
					{insights.map((insight) => (
						<GlassCard key={insight.slug} interactive asChild>
							<Link
								href={`/blog/${insight.slug}`}
								className='flex flex-col p-7'>
							<Badge
								variant='outline'
								className='w-fit border-brand/30 text-brand'>
								{insight.category}
							</Badge>
							<h2 className='mt-4 font-display text-xl font-semibold leading-snug text-white'>
								{insight.title}
							</h2>
							<p className='mt-3 flex-1 leading-7 text-slate-400'>
								{insight.excerpt}
							</p>
							<div className='mt-6 flex items-center justify-between text-sm text-slate-500'>
								<time dateTime={insight.date}>
									{formatter.format(new Date(insight.date))}
								</time>
								<span>{insight.readTime}</span>
							</div>
							<span className='mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
								Read article <ArrowUpRight className='size-4' />
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
