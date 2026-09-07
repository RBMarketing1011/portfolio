import { notFound } from 'next/navigation'
import {
	BeforeAfter,
	CtaBand,
	FaqAccordion,
	Grid,
	PageHero,
	ProcessSteps,
	ProseBlock,
	RelatedCard,
	Section,
	SectionHeading,
} from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { industries } from '@/lib/site-content'

export function generateStaticParams() {
	return industries.map((industry) => ({ slug: industry.slug }))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const industry = industries.find((item) => item.slug === slug)
	if (!industry) return {}

	return buildMetadata({
		title: industry.name,
		description: industry.blurb,
		path: `/industries/${industry.slug}`,
	})
}

export default async function IndustryPage({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const industry = industries.find((item) => item.slug === slug)
	if (!industry) notFound()

	const others = industries.filter((item) => item.slug !== industry.slug)

	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Industries', path: '/industries' },
						{ name: industry.name, path: `/industries/${industry.slug}` },
					]),
					{
						'@type': 'FAQPage',
						mainEntity: industry.faqs.map((faq) => ({
							'@type': 'Question',
							name: faq.question,
							acceptedAnswer: { '@type': 'Answer', text: faq.answer },
						})),
					},
				]}
			/>

			<PageHero
				eyebrow='Industry'
				title={industry.name}
				description={industry.blurb}
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
			/>

			<Section>
				<SectionHeading
					eyebrow='The context'
					title={`How ${industry.name.toLowerCase()} usually runs`}
				/>
				<div className='mt-12 max-w-3xl'>
					<ProseBlock>
						{industry.intro.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</ProseBlock>
				</div>
			</Section>

			<BeforeAfter
				variant='rows'
				eyebrow='The shift'
				title='What we find, and what we build instead'
				beforeLabel='What we usually find'
				afterLabel='What we build'
				before={industry.pains}
				after={industry.builds}
			/>

			<ProcessSteps
				eyebrow='The workflow'
				title='Where the work actually moves'
				description='These are the points in the operation where information gets lost, duplicated, or delayed. They are also where the return is highest.'
				steps={industry.workflows.map((step, index) => ({
					number: String(index + 1).padStart(2, '0'),
					title: step.title,
					summary: step.body,
					detail: [],
				}))}
			/>

			<FaqAccordion
				eyebrow='Questions'
				title='Common questions'
				description={`What operators in ${industry.name.toLowerCase()} ask before they commit.`}
				faqs={industry.faqs}
			/>

			<Grid
				eyebrow='Keep looking'
				title='Other industries'
				description='The tools change. The underlying problems rarely do.'
				columns={2}>
				{others.map((item) => (
					<RelatedCard
						key={item.slug}
						title={item.name}
						meta='Industry'
						description={item.blurb}
						href={`/industries/${item.slug}`}
					/>
				))}
			</Grid>

			<CtaBand
				title={`Let us look at your ${industry.name.toLowerCase()} operation.`}
			/>
		</>
	)
}
