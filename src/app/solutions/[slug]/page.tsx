import { notFound } from 'next/navigation'
import {
	BeforeAfter,
	CheckList,
	CtaBand,
	FaqAccordion,
	FeatureCard,
	Grid,
	PageHero,
	ProseBlock,
	RelatedCard,
	Section,
	SectionHeading,
} from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { solutions } from '@/lib/site-content'

export function generateStaticParams() {
	return solutions.map((solution) => ({ slug: solution.slug }))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const solution = solutions.find((item) => item.slug === slug)
	if (!solution) return {}

	return buildMetadata({
		title: solution.name,
		description: solution.blurb,
		path: `/solutions/${solution.slug}`,
	})
}

export default async function SolutionPage({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const solution = solutions.find((item) => item.slug === slug)
	if (!solution) notFound()

	const others = solutions.filter((item) => item.slug !== solution.slug)

	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Solutions', path: '/solutions' },
						{ name: solution.name, path: `/solutions/${solution.slug}` },
					]),
					{
						'@type': 'FAQPage',
						mainEntity: solution.faqs.map((faq) => ({
							'@type': 'Question',
							name: faq.question,
							acceptedAnswer: { '@type': 'Answer', text: faq.answer },
						})),
					},
				]}
			/>

			<PageHero
				eyebrow={solution.name}
				title={solution.headline}
				description={solution.blurb}
				actions={[
					{ label: 'Talk Through Your Process', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
			/>

			<Section>
				<SectionHeading
					eyebrow='The context'
					title={`Why ${solution.name.toLowerCase()} keeps coming up`}
				/>
				<div className='mt-12 max-w-3xl'>
					<ProseBlock>
						{solution.intro.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</ProseBlock>
				</div>
			</Section>

			<BeforeAfter
				variant='rows'
				eyebrow='The shift'
				title='What this replaces, and what replaces it'
				beforeLabel='Problems this solves'
				afterLabel='What changes'
				before={solution.problems}
				after={solution.outcomes}
			/>

			<Grid
				eyebrow='What we build'
				title='What this looks like in practice'
				description='Scope moves with the business, but this is the shape of nearly every build in this category.'
				columns={2}>
				{solution.whatWeBuild.map((item) => (
					<FeatureCard key={item.title} title={item.title} blurb={item.body} />
				))}
			</Grid>

			<Section>
				<SectionHeading
					eyebrow='Fit'
					title='This is a good fit if'
					description='If none of these are true, we will say so on the first call rather than three weeks in.'
				/>
				<div className='mt-12 max-w-3xl'>
					<CheckList items={solution.goodFit} />
				</div>
			</Section>

			<FaqAccordion
				eyebrow='Questions'
				title='Common questions'
				description={`What people ask before committing to a ${solution.name.toLowerCase()} build.`}
				faqs={solution.faqs}
			/>

			<Grid
				eyebrow='Keep looking'
				title='Other solutions'
				description='Most engagements end up touching two or three of these.'>
				{others.map((item) => (
					<RelatedCard
						key={item.slug}
						title={item.name}
						meta='Solution'
						description={item.blurb}
						href={`/solutions/${item.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
