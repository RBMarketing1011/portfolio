import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import {
	AuthorBio,
	CtaBand,
	Grid,
	PageHero,
	ProseBlock,
	RelatedCard,
	Section,
	TableOfContents,
} from '@/components/sections'
import {
	JsonLd,
	articleSchema,
	breadcrumbSchema,
	buildMetadata,
} from '@/lib/seo'
import { site } from '@/lib/site'
import { insights } from '@/lib/site-content'

export function generateStaticParams() {
	return insights.map((insight) => ({ slug: insight.slug }))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const insight = insights.find((item) => item.slug === slug)
	if (!insight) return {}

	return buildMetadata({
		title: insight.title,
		description: insight.excerpt,
		path: `/blog/${insight.slug}`,
		type: 'article',
		publishedTime: insight.date,
	})
}

const formatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
})

const headingId = (heading: string) =>
	heading
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')

export default async function BlogArticle({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const insight = insights.find((item) => item.slug === slug)
	if (!insight) notFound()

	const more = insights.filter((item) => item.slug !== insight.slug).slice(0, 3)

	return (
		<>
			<JsonLd
				schema={[
					articleSchema(insight),
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Blog', path: '/blog' },
						{ name: insight.title, path: `/blog/${insight.slug}` },
					]),
				]}
			/>

			<PageHero
				eyebrow={insight.category}
				title={insight.title}
				description={insight.excerpt}
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'All Articles', href: '/blog' },
				]}
				stats={[
					{
						value: formatter.format(new Date(insight.date)),
						label: 'Published',
					},
					{ value: insight.readTime, label: 'Read time' },
					{ value: insight.category, label: 'Category' },
				]}
			/>

			<Section>
				<div className='grid gap-14 lg:grid-cols-[16rem_1fr]'>
					<TableOfContents
						items={insight.body.map((block) => ({
							id: headingId(block.heading),
							label: block.heading,
						}))}
					/>
					<div className='min-w-0 max-w-3xl'>
						<ProseBlock>
							{insight.body.map((block) => (
								/* Flat children: ProseBlock styles direct descendants only. */
								<Fragment key={block.heading}>
									<h2 id={headingId(block.heading)}>{block.heading}</h2>
									{block.paragraphs.map((paragraph) => (
										<p key={paragraph}>{paragraph}</p>
									))}
								</Fragment>
							))}
						</ProseBlock>
						<AuthorBio
							className='mt-14'
							name={site.name}
							role='AI, automation, and custom software'
							bio='We audit an entire operation before building anything, then build what the business actually needs. Everything here comes out of real engagements.'
							href='/about'
							linkLabel='About the studio'
						/>
					</div>
				</div>
			</Section>

			<Grid
				eyebrow='Keep reading'
				title='More from the blog'
				description='Written for the person who has to make the call, not the person writing the spec.'>
				{more.map((item) => (
					<RelatedCard
						key={item.slug}
						title={item.title}
						meta={`${item.category} · ${item.readTime}`}
						description={item.excerpt}
						href={`/blog/${item.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
