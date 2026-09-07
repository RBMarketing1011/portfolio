import {
	CaseStudyCard,
	CtaBand,
	FilterBar,
	Grid,
	PageHero,
	Section,
} from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { projects } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Case Studies',
	description:
		'How ReynoldsBuilt approached real builds: the problem, the approach, what shipped, and the systems behind them.',
	path: '/case-studies',
})

const categories = [
	'All',
	...new Set(projects.map((project) => project.category)),
]

export default function CaseStudiesPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Case Studies', path: '/case-studies' },
				])}
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

			<Section className='py-0'>
				<FilterBar filters={categories} resultCount={projects.length} />
			</Section>

			<Grid className='pt-12' columns={2}>
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
