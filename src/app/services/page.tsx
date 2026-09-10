import {
	CtaBand,
	FaqAccordion,
	FeatureCard,
	FeatureRows,
	Grid,
	PageHero,
	ProcessSteps,
	RelatedCard,
} from '@/components/sections'
import {
	JsonLd,
	breadcrumbSchema,
	buildMetadata,
	collectionSchema,
} from '@/lib/seo'
import {
	capabilityGroups,
	deliverySteps,
	faqs,
	services,
	shippedProjects,
} from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Services',
	description:
		'AI and automation assessments, workflow automation, applied AI systems, and custom software built around how your business actually runs.',
	path: '/services',
})

// One screenshot per service, drawn from real builds rather than a stock image.
const serviceShots = shippedProjects.map((project) => project.image)

export default function ServicesPage() {
	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Services', path: '/services' },
					]),
					collectionSchema({
						path: '/services',
						name: 'Services',
						description:
							'The four engagements we run, and what each one delivers.',
						items: services.map((service) => ({
							name: service.name,
							path: `/services/${service.slug}`,
						})),
					}),
				]}
			/>

			<PageHero
				eyebrow='Services'
				title='Consulting that ends in working software.'
				description='We start by understanding the business, not the tech stack. Then we build the smallest thing that moves the needle, and keep going from there.'
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See The Process', href: '/process' },
				]}
			/>

			<FeatureRows
				rows={services.map((service, index) => ({
					eyebrow: service.tagline,
					title: service.name,
					description: service.summary,
					points: service.outcomes,
					image: serviceShots[index % serviceShots.length],
				}))}
			/>

			<Grid
				eyebrow='Every service'
				title='Four engagements, each with its own page'
				description='Every one covers what it delivers, the questions we get asked about it, and the work we have shipped doing it.'
				columns={2}>
				{services.map((service) => (
					<RelatedCard
						key={service.slug}
						title={service.name}
						meta={service.tagline}
						description={service.summary}
						href={`/services/${service.slug}`}
					/>
				))}
			</Grid>

			<Grid
				eyebrow='Capabilities'
				title='The engineering underneath'
				description='The consulting is the front half. This is what we bring to the build.'
				columns={3}>
				{capabilityGroups.map((group) => (
					<FeatureCard
						key={group.title}
						icon={group.icon}
						title={group.title}
						blurb={group.items.join(' · ')}
					/>
				))}
			</Grid>

			<ProcessSteps
				eyebrow='How we work'
				title='Every engagement runs the same way'
				description='Whichever service you start with, the sequence does not change. Understand it, plan it, build it in increments, then make sure it sticks.'
				steps={deliverySteps}
			/>

			<FaqAccordion
				eyebrow='Common questions'
				title='What people ask before engaging'
				description='Questions about a specific service live on its own page. These come up whichever one you pick.'
				faqs={faqs}
			/>

			<CtaBand />
		</>
	)
}
