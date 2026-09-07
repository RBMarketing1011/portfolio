import { CtaBand, Grid, PageHero, RelatedCard } from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { solutions } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Solutions',
	description:
		'Document automation, customer intake and scheduling, client portals, reporting dashboards, training systems, internal tools, and systems integration.',
	path: '/solutions',
})

export default function SolutionsPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Solutions', path: '/solutions' },
				])}
			/>

			<PageHero
				eyebrow='Solutions'
				title='The builds that come up again and again.'
				description='Every business is different, but the shape of the work repeats. These are the systems we are asked for most, and the ones that tend to pay for themselves fastest.'
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
			/>

			<Grid
				eyebrow='All solutions'
				title='Seven systems, one underlying problem'
				description='Each one exists because manual work had started to cap what the business could take on.'>
				{solutions.map((solution) => (
					<RelatedCard
						key={solution.slug}
						title={solution.name}
						meta='Solution'
						description={solution.blurb}
						href={`/solutions/${solution.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
