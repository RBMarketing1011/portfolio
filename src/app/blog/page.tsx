import {
	ArticleCard,
	CtaBand,
	FilterBar,
	Grid,
	PageHero,
	Section,
} from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { insightCategories, insights } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Blog',
	description:
		'Practical writing on applied AI, business automation, build strategy, and why most internal tools go unused.',
	path: '/blog',
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
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
			/>

			<Section className='py-0'>
				<FilterBar
					filters={['All', ...insightCategories]}
					resultCount={insights.length}
				/>
			</Section>

			<Grid className='pt-12'>
				{insights.map((insight) => (
					<ArticleCard
						key={insight.slug}
						title={insight.title}
						excerpt={insight.excerpt}
						category={insight.category}
						readTime={insight.readTime}
						href={`/blog/${insight.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
