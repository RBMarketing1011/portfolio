import {
	CaseStudyCard,
	CtaBand,
	Grid,
	MediaGallery,
	PageHero,
} from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { projects } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Portfolio',
	description:
		'Software built by ReynoldsBuilt: SaaS platforms, scheduling products, client portals, reporting systems, and branded training platforms.',
	path: '/portfolio',
})

export default function PortfolioPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Portfolio', path: '/portfolio' },
				])}
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
				items={projects.map((project) => ({
					src: project.image,
					alt: `${project.name} interface`,
					caption: `${project.name} — ${project.summary}`,
				}))}
			/>

			<Grid
				eyebrow='Every project'
				title='The full list'
				description='Each one links through to the problem, the approach, and what shipped.'>
				{projects.map((project) => (
					<CaseStudyCard
						key={project.slug}
						name={project.name}
						category={project.category}
						client={project.client}
						summary={project.summary}
						image={project.image}
						href={`/case-studies/${project.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
