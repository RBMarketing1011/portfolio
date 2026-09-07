import {
	CtaBand,
	FeatureCard,
	FeatureRows,
	Grid,
	PageHero,
	TabsShowcase,
} from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { capabilityGroups, projects, services } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Services',
	description:
		'AI and automation assessments, workflow automation, applied AI systems, and custom software built around how your business actually runs.',
	path: '/services',
})

// One screenshot per service, drawn from real builds rather than a stock image.
const serviceShots = projects.map((project) => project.image)

export default function ServicesPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Services', path: '/services' },
				])}
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

			<TabsShowcase
				eyebrow='What you get'
				title='The deliverables behind each service'
				description='Every engagement produces something concrete. This is what lands on your side of the table.'
				items={services.map((service, index) => ({
					id: service.slug,
					label: service.name,
					title: service.tagline,
					body: service.summary,
					points: service.deliverables,
					image: serviceShots[index % serviceShots.length],
				}))}
			/>

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

			<CtaBand />
		</>
	)
}
