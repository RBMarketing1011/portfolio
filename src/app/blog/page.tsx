import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
	CtaBand,
	PageHero,
	Section,
	SectionHeading,
} from '@/components/sections'
import { Button } from '@/components/ui/button'
import {
	JsonLd,
	breadcrumbSchema,
	buildMetadata,
	collectionSchema,
} from '@/lib/seo'
import { insightCategories, insights } from '@/lib/site-content'
import { ArticleFilter } from './article-filter'

export const metadata = buildMetadata({
	title: 'Blog',
	description:
		'Practical writing on applied AI, business automation, build strategy, and why most internal tools go unused.',
	path: '/blog',
})

export default function BlogPage() {
	const [latest] = insights
	const formatter = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	})

	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Blog', path: '/blog' },
					]),
					collectionSchema({
						path: '/blog',
						name: 'Blog',
						description:
							'Writing on applied AI, business automation, and build strategy.',
						items: insights.map((insight) => ({
							name: insight.title,
							path: `/blog/${insight.slug}`,
						})),
					}),
				]}
			/>

			<PageHero
				eyebrow='Blog'
				title='AI and automation, minus the hype.'
				description='What we have learned building systems inside real operations, written for the person who has to make the call.'
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
			/>

			<Section>
				<SectionHeading
					eyebrow='Latest'
					title={latest.title}
					description={latest.excerpt}
					variant='split'
				/>
				<div className='mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400'>
					<span>{formatter.format(new Date(latest.date))}</span>
					<span>{latest.readTime} read</span>
					<span className='text-brand'>{latest.category}</span>
				</div>
				<Button
					asChild
					size='lg'
					className='mt-8 bg-brand font-bold text-ink hover:bg-brand-strong'>
					<Link href={`/blog/${latest.slug}`}>
						Read the article <ArrowRight />
					</Link>
				</Button>
			</Section>

			<Section className='pb-0 lg:pb-0'>
				<SectionHeading
					eyebrow='Every article'
					title={`All ${insights.length}, newest first`}
					description='Filter by what you are trying to decide. Every piece is written for the person who has to make the call, not for a search engine.'
				/>
			</Section>

			<ArticleFilter
				filters={['All', ...insightCategories]}
				items={insights.map((insight) => ({
					slug: insight.slug,
					title: insight.title,
					excerpt: insight.excerpt,
					category: insight.category,
					readTime: insight.readTime,
				}))}
			/>

			<CtaBand />
		</>
	)
}
