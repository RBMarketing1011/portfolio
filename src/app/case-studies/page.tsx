import {
	CtaBand,
	FeatureCard,
	Grid,
	PageHero,
	Section,
	SectionHeading,
	StatBand,
} from '@/components/sections'
import {
	JsonLd,
	breadcrumbSchema,
	buildMetadata,
	collectionSchema,
} from '@/lib/seo'
import {
	projects,
	projectsForService,
	serviceName,
	services,
} from '@/lib/site-content'
import { CaseStudyFilter } from '@/components/case-study-filter'

export const metadata = buildMetadata({
	title: 'Case Studies',
	description:
		'How ReynoldsBuilt approached real builds: the problem, the approach, what shipped, and the systems behind them.',
	path: '/case-studies',
})

export default function CaseStudiesPage() {
	// Only services that actually have work behind them become filters.
	const withWork = services.filter(
		(service) => projectsForService(service.slug).length > 0,
	)
	const categories = ['All', ...withWork.map((service) => service.name)]

	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Case Studies', path: '/case-studies' },
					]),
					collectionSchema({
						path: '/case-studies',
						name: 'Case Studies',
						description:
							'Real builds, with the problem, the approach, and what shipped.',
						items: projects.map((project) => ({
							name: project.name,
							path: `/case-studies/${project.slug}`,
						})),
					}),
				]}
			/>

			<PageHero
				eyebrow='Case studies'
				title='The problem, the approach, and what shipped.'
				description='No vanity metrics. Just what the business was dealing with, how we approached it, and what exists now.'
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See The Portfolio', href: '/portfolio' },
				]}
			/>

			<StatBand
				variant='cards'
				stats={[
					{
						value: String(projects.length),
						label:
							'Engagements written up in full, including the ones where we argued against the build',
					},
					{
						value: String(withWork.length),
						label:
							'Services represented, from a two-week assessment to a full product build',
					},
					{
						value: 'No logos',
						label:
							'Every study explains the problem and the decision, not the client badge',
					},
				]}
			/>

			<Section>
				<SectionHeading
					eyebrow='How to read these'
					title='What every case study on this page covers'
					description='The format is deliberate. A case study that only lists what shipped tells you nothing about whether it should have been built.'
					variant='split'
				/>
				<div className='mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4'>
					<FeatureCard
						variant='numbered'
						index={1}
						title='What we walked into'
						blurb='The situation as it actually was, including the assumptions nobody had tested.'
					/>
					<FeatureCard
						variant='numbered'
						index={2}
						title='What the evidence said'
						blurb='What we measured, and where it disagreed with what everyone believed.'
					/>
					<FeatureCard
						variant='numbered'
						index={3}
						title='What we recommended'
						blurb='The decision, the reasoning behind it, and what we advised leaving alone.'
					/>
					<FeatureCard
						variant='numbered'
						index={4}
						title='What happened next'
						blurb='What shipped, what changed, and what it cost to get there.'
					/>
				</div>
			</Section>

			<Section className='pb-0 lg:pb-0'>
				<SectionHeading
					eyebrow='Every engagement'
					title='Filter by the service that delivered it'
					description='Assessments sit alongside builds on purpose. Both are work we were paid to do, and the assessments are often the more useful read.'
				/>
			</Section>

			<CaseStudyFilter
				filters={categories}
				items={projects.map((project) => ({
					slug: project.slug,
					name: project.name,
					service: serviceName(project.service),
					category: project.category,
					summary: project.summary,
				}))}
			/>

			<CtaBand />
		</>
	)
}
