import { X } from 'lucide-react'
import {
	CheckList,
	CtaBand,
	FaqAccordion,
	Grid,
	PageHero,
	ProcessSteps,
	RelatedCard,
	Section,
	SectionHeading,
} from '@/components/sections'
import {
	JsonLd,
	breadcrumbSchema,
	buildMetadata,
	collectionSchema,
} from '@/lib/seo'
import { deliverySteps, faqs, industries, signals } from '@/lib/site-content'

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
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Industries', path: '/industries' },
					]),
					collectionSchema({
						path: '/industries',
						name: 'Industries',
						description:
							'The sectors we have built in repeatedly and what the work looks like in each.',
						items: industries.map((industry) => ({
							name: industry.name,
							path: `/industries/${industry.slug}`,
						})),
					}),
				]}
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

			<Section>
				<SectionHeading
					eyebrow='What repeats'
					title='The tools change by industry. The bottleneck does not.'
					description='A plumbing company and an accounting firm describe their problem in completely different language, and then show you the same spreadsheet holding the operation together.'
					variant='split'
				/>
				<div className='mt-12 grid gap-x-12 gap-y-4 sm:grid-cols-2'>
					<CheckList icon={X} items={signals.slice(0, 3)} />
					<CheckList icon={X} items={signals.slice(3)} />
				</div>
			</Section>

			<Grid
				eyebrow='Where we work'
				title='Six sectors we have built in repeatedly'
				description='Each page covers what we usually find, what gets built, the workflow end to end, and the questions operators ask first.'
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

			<ProcessSteps
				eyebrow='How it runs'
				title='The same four steps, whatever the sector'
				description='We do not run a different playbook per industry. We spend longer learning the vocabulary, and the sequence stays the same.'
				steps={deliverySteps}
			/>

			<FaqAccordion
				eyebrow='Common questions'
				title='What operators ask before they engage'
				description='Sector-specific questions live on each industry page. These come up regardless of what you do.'
				faqs={faqs}
			/>

			<CtaBand />
		</>
	)
}
