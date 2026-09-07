import { notFound } from 'next/navigation'
import {
	CheckList,
	Chips,
	CtaBand,
	Grid,
	MediaCard,
	PageHero,
	ProseBlock,
	RelatedCard,
	Section,
	SectionHeading,
	VideoPlayer,
} from '@/components/sections'
import {
	JsonLd,
	breadcrumbSchema,
	buildMetadata,
	caseStudySchema,
} from '@/lib/seo'
import { projects } from '@/lib/site-content'

export function generateStaticParams() {
	return projects.map((project) => ({ slug: project.slug }))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const project = projects.find((item) => item.slug === slug)
	if (!project) return {}

	return buildMetadata({
		title: `${project.name} Case Study`,
		description: project.summary,
		path: `/case-studies/${project.slug}`,
		type: 'article',
	})
}

export default async function CaseStudyPage({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const project = projects.find((item) => item.slug === slug)
	if (!project) notFound()

	const more = projects.filter((item) => item.slug !== project.slug).slice(0, 3)

	return (
		<>
			<JsonLd
				schema={[
					caseStudySchema(project),
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Case Studies', path: '/case-studies' },
						{ name: project.name, path: `/case-studies/${project.slug}` },
					]),
				]}
			/>

			<PageHero
				eyebrow={project.category}
				title={project.name}
				description={project.summary}
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'All Case Studies', href: '/case-studies' },
				]}
				stats={[
					{ value: project.client, label: 'Client' },
					{ value: project.category, label: 'Engagement' },
					{ value: project.stack[0], label: 'Built on' },
				]}
			/>

			{project.video ? (
				<VideoPlayer
					eyebrow='Walkthrough'
					title={`${project.name} in use`}
					description='The interface the team works in every day.'
					src={project.video}
					poster={project.image}
					caption={`${project.name} — ${project.category}`}
				/>
			) : (
				<Section>
					<MediaCard
						src={project.image}
						alt={`${project.name} interface`}
						caption={`${project.name} — ${project.category}`}
					/>
				</Section>
			)}

			<Section>
				<SectionHeading eyebrow='The challenge' title='What we walked into' />
				<div className='mt-10 max-w-3xl'>
					<ProseBlock>
						<p>{project.challenge}</p>
					</ProseBlock>
				</div>

				<div className='mt-16 grid gap-12 lg:grid-cols-2'>
					<div>
						<h2 className='font-display text-2xl font-semibold text-white'>
							How we went at it
						</h2>
						<div className='mt-6'>
							<CheckList items={project.approach} />
						</div>
					</div>
					<div>
						<h2 className='font-display text-2xl font-semibold text-white'>
							What exists now
						</h2>
						<div className='mt-6'>
							<CheckList items={project.delivered} />
						</div>
					</div>
				</div>

				<div className='mt-16 grid gap-10 border-t border-white/10 pt-12 sm:grid-cols-2'>
					<Chips label='Capabilities' items={project.capabilities} />
					<Chips label='Stack' items={project.stack} />
				</div>
			</Section>

			<Grid
				eyebrow='More work'
				title='Other builds worth a look'
				description='Different sectors, the same underlying problem.'>
				{more.map((item) => (
					<RelatedCard
						key={item.slug}
						title={item.name}
						meta={item.category}
						description={item.summary}
						href={`/case-studies/${item.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
