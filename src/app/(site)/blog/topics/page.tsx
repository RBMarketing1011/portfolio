import { CtaBand, Grid, PageHero, RelatedCard } from '@/components/sections'
import {
	JsonLd,
	breadcrumbSchema,
	buildMetadata,
	collectionSchema,
} from '@/lib/seo'
import { insightTopics, insights } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Blog Topics',
	description:
		'Every subject we write about: applied AI, business automation, build strategy, assessments, and product design.',
	path: '/blog/topics',
})

export default function BlogTopicsPage() {
	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Blog', path: '/blog' },
						{ name: 'Topics', path: '/blog/topics' },
					]),
					collectionSchema({
						path: '/blog/topics',
						name: 'Blog Topics',
						description: 'Every subject we write about.',
						items: insightTopics.map((topic) => ({
							name: topic.category,
							path: `/blog/topics/${topic.slug}`,
						})),
					}),
				]}
			/>

			<PageHero
				variant='compact'
				eyebrow='Topics'
				title='Pick what you are trying to decide.'
				description={`${insights.length} articles across ${insightTopics.length} subjects. Each topic collects everything we have written on it.`}
				actions={[
					{ label: 'All Articles', href: '/blog' },
					{ label: 'Book An Assessment', href: '/contact' },
				]}
			/>

			<Grid columns={2}>
				{insightTopics.map((topic) => (
					<RelatedCard
						key={topic.slug}
						title={topic.category}
						meta={`${topic.posts.length} ${topic.posts.length === 1 ? 'article' : 'articles'}`}
						description={`Everything filed under ${topic.category}.`}
						href={`/blog/topics/${topic.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
