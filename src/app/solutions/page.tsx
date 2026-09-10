import {
	CtaBand,
	FaqAccordion,
	FeatureCard,
	Grid,
	PageHero,
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
import { capabilityGroups, faqs, solutions } from '@/lib/site-content'

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
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Solutions', path: '/solutions' },
					]),
					collectionSchema({
						path: '/solutions',
						name: 'Solutions',
						description:
							'The systems we are asked to build most often, and the problems each one solves.',
						items: solutions.map((solution) => ({
							name: solution.name,
							path: `/solutions/${solution.slug}`,
						})),
					}),
				]}
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
				title={`${solutions.length} systems, one underlying problem`}
				description='Each one exists because manual work had started to cap what the business could take on. Every page covers the problem, what gets built, who it fits, and what we would talk you out of.'>
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

			<Section>
				<SectionHeading
					eyebrow='How to choose'
					title='Most people pick the wrong one first'
					description='The solution that feels most urgent is usually the one that is most visible, which is not the same as the one costing you most. If you are not sure, the assessment exists to answer exactly that.'
					variant='split'
				/>
				<div className='mt-12 grid gap-5 sm:grid-cols-3'>
					<FeatureCard
						variant='numbered'
						index={1}
						title='Count the hours, not the noise'
						blurb='The loudest complaint is rarely the biggest cost. Find the task someone repeats forty times a week.'
					/>
					<FeatureCard
						variant='numbered'
						index={2}
						title='Check what you already pay for'
						blurb='Licensed features sitting unconfigured are common, and configuring one beats building its replacement.'
					/>
					<FeatureCard
						variant='numbered'
						index={3}
						title='Start with one workflow'
						blurb='One team, one process, in production. It tells you how your data really behaves before the design gets expensive.'
					/>
				</div>
			</Section>

			<Grid
				eyebrow='Underneath all of them'
				title='The engineering every solution draws on'
				description='The solution names describe the outcome. This is the work that actually delivers them.'
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

			<FaqAccordion
				eyebrow='Common questions'
				title='Before you pick a solution'
				description='Questions specific to each system live on its own page. These apply whichever one you land on.'
				faqs={faqs}
			/>

			<CtaBand />
		</>
	)
}
