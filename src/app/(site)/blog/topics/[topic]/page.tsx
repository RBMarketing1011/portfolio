import { notFound } from 'next/navigation'
import {
	ArticleCard,
	CtaBand,
	Grid,
	PageHero,
	RelatedCard,
} from '@/components/sections'
import {
	JsonLd,
	breadcrumbSchema,
	buildMetadata,
	collectionSchema,
} from '@/lib/seo'
import { insightTopics } from '@/lib/site-content'

export function generateStaticParams() {
	return insightTopics.map((topic) => ({ topic: topic.slug }))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ topic: string }>
}) {
	const { topic } = await params
	const found = insightTopics.find((item) => item.slug === topic)
	if (!found) return {}

	return buildMetadata({
		title: `${found.category} articles`,
		description: `Writing on ${found.category} from ReynoldsBuilt: ${found.posts.length} articles for the person who has to make the call.`,
		path: `/blog/topics/${found.slug}`,
	})
}

export default async function BlogTopicPage({
	params,
}: {
	params: Promise<{ topic: string }>
}) {
	const { topic } = await params
	const found = insightTopics.find((item) => item.slug === topic)
	if (!found) notFound()

	const others = insightTopics.filter((item) => item.slug !== found.slug)

	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Blog', path: '/blog' },
						{ name: found.category, path: `/blog/topics/${found.slug}` },
					]),
					collectionSchema({
						path: `/blog/topics/${found.slug}`,
						name: `${found.category} articles`,
						description: `Every ReynoldsBuilt article filed under ${found.category}.`,
						items: found.posts.map((post) => ({
							name: post.title,
							path: `/blog/${post.slug}`,
						})),
					}),
				]}
			/>

			<PageHero
				variant='compact'
				eyebrow={`Topic · ${found.category}`}
				title={`${found.category} articles`}
				description={`Everything we have written under ${found.category}. ${found.posts.length} ${found.posts.length === 1 ? 'article' : 'articles'}, written for the person who has to make the call.`}
				actions={[
					{ label: 'All Articles', href: '/blog' },
					{ label: 'Book An Assessment', href: '/contact' },
				]}
			/>

			<Grid>
				{found.posts.map((post) => (
					<ArticleCard
						key={post.slug}
						title={post.title}
						excerpt={post.excerpt}
						category={post.category}
						readTime={post.readTime}
						href={`/blog/${post.slug}`}
					/>
				))}
			</Grid>

			<Grid
				eyebrow='Other topics'
				title='Read something else'
				columns={3}>
				{others.map((item) => (
					<RelatedCard
						key={item.slug}
						title={item.category}
						meta={`${item.posts.length} ${item.posts.length === 1 ? 'article' : 'articles'}`}
						description={`Everything filed under ${item.category}.`}
						href={`/blog/topics/${item.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
