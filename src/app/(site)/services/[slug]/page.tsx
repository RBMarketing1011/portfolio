import { notFound } from 'next/navigation'
import {
	Carousel,
	CheckList,
	CtaBand,
	FaqAccordion,
	Grid,
	PageHero,
	ProseBlock,
	RelatedCard,
	Section,
	SectionHeading,
} from '@/components/sections'
import {
	JsonLd,
	breadcrumbSchema,
	buildMetadata,
	faqPageSchema,
	serviceSchema,
} from '@/lib/seo'
import { projectsForService, services } from '@/lib/site-content'

export function generateStaticParams() {
	return services.map((service) => ({ slug: service.slug }))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const service = services.find((item) => item.slug === slug)
	if (!service) return {}

	return buildMetadata({
		title: service.name,
		description: service.summary,
		path: `/services/${service.slug}`,
	})
}

export default async function ServicePage({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const service = services.find((item) => item.slug === slug)
	if (!service) notFound()

	const work = projectsForService(service.slug)
	const others = services.filter((item) => item.slug !== service.slug)

	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Services', path: '/services' },
						{ name: service.name, path: `/services/${service.slug}` },
					]),
					serviceSchema({
						path: `/services/${service.slug}`,
						name: service.name,
						description: service.summary,
						serviceType: service.name,
					}),
					faqPageSchema(`/services/${service.slug}`, service.faqs),
				]}
			/>

			<PageHero
				eyebrow={service.tagline}
				title={service.headline}
				description={service.summary}
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'All Services', href: '/services' },
				]}
			/>

			<Section>
				<SectionHeading
					eyebrow='The context'
					title={`Why ${service.name.toLowerCase()} is worth doing`}
				/>
				<div className='mt-10 max-w-3xl'>
					<ProseBlock>
						{service.intro.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</ProseBlock>
				</div>
			</Section>

			<Section>
				<SectionHeading
					eyebrow='What changes'
					title='The outcomes this is aimed at'
					description='If an engagement does not move these, it was the wrong engagement.'
					variant='split'
				/>
				<div className='mt-12 grid gap-x-12 gap-y-4 sm:grid-cols-2'>
					<CheckList items={service.outcomes} />
					<CheckList items={service.deliverables} />
				</div>
			</Section>

			{work.length > 0 && (
				<Carousel
					eyebrow='Proof'
					title={`${service.name} we have shipped`}
					description='The same work, done for someone else, with the problem and the result written down.'
					label={`${service.name} case studies`}
					controls='below'
					size='md'>
					{work.map((project) => (
						<RelatedCard
							key={project.slug}
							title={project.name}
							meta={project.client}
							description={project.summary}
							href={`/case-studies/${project.slug}`}
						/>
					))}
				</Carousel>
			)}

			<FaqAccordion
				eyebrow='Common questions'
				title={`Questions we get about ${service.name.toLowerCase()}`}
				description='The things worth settling before an engagement starts.'
				faqs={service.faqs}
			/>

			<Grid eyebrow='The other services' title='What else we do' columns={3}>
				{others.map((item) => (
					<RelatedCard
						key={item.slug}
						title={item.name}
						meta={item.tagline}
						description={item.summary}
						href={`/services/${item.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
