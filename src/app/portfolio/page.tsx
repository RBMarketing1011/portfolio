import { CaseStudyFilter } from '@/components/case-study-filter'
import {
	CtaBand,
	MediaGallery,
	PageHero,
	Section,
	SectionHeading,
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
	shippedProjects,
} from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Portfolio',
	description:
		'Software built by ReynoldsBuilt: SaaS platforms, scheduling products, client portals, reporting systems, and branded training platforms.',
	path: '/portfolio',
})

export default function PortfolioPage() {
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
						{ name: 'Portfolio', path: '/portfolio' },
					]),
					collectionSchema({
						path: '/portfolio',
						name: 'Portfolio',
						description:
							'Platforms, portals, scheduling products, and training systems we have shipped.',
						items: shippedProjects.map((project) => ({
							name: project.name,
							path: `/case-studies/${project.slug}`,
						})),
					}),
				]}
			/>

			<PageHero
				eyebrow='Portfolio'
				title='Real software, running in real businesses.'
				description='Platforms, portals, scheduling products, and training systems. Every one of these replaced a manual process or a tool that was not doing the job.'
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'Read The Case Studies', href: '/case-studies' },
				]}
			/>

			<MediaGallery
				eyebrow='The builds'
				title='What these actually look like'
				description='Pick a project to see the interface the team uses every day.'
				items={shippedProjects.map((project) => ({
					src: project.image as string,
					alt: `${project.name} interface`,
					caption: `${project.name} — ${project.summary}`,
				}))}
			/>

			<Section className='pb-0 lg:pb-0'>
				<SectionHeading
					eyebrow='Every engagement'
					title='The full list'
					description='Builds and assessments together. Each one links through to the problem, the approach, and what happened next.'
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
