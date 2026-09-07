import { CtaBand, Grid, PageHero, RelatedCard } from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { industries } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Industries',
	description:
		'AI, automation, and custom software for home services, auto repair, moving and logistics, marketing agencies, professional services, and multi-location retail.',
	path: '/industries',
})

export default function IndustriesPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Industries', path: '/industries' },
				])}
			/>

			<PageHero
				eyebrow='Industries'
				title='Different trades, same bottleneck.'
				description='We work with operations where the growth ceiling is manual work, not demand. The tools vary by industry. The underlying problems rarely do.'
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
			/>

			<Grid
				eyebrow='Where we work'
				title='Six sectors we have built in repeatedly'
				description='Each page covers what we usually find, what gets built, and the questions operators ask first.'
				columns={2}>
				{industries.map((industry) => (
					<RelatedCard
						key={industry.slug}
						title={industry.name}
						meta='Industry'
						description={industry.blurb}
						href={`/industries/${industry.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
