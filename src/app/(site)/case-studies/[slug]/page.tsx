import { Fragment } from 'react'
import { notFound } from 'next/navigation'
import { X } from 'lucide-react'
import {
	Carousel,
	CheckList,
	Chips,
	CtaBand,
	MediaCard,
	PageHero,
	ProseBlock,
	RelatedCard,
	Section,
	SectionHeading,
	StatBand,
	TableOfContents,
	VideoPlayer,
} from '@/components/sections'
import { GlassCard } from '@/components/ui/glass-card'
import {
	JsonLd,
	breadcrumbSchema,
	buildMetadata,
	caseStudySchema,
} from '@/lib/seo'
import { projects, projectsForService, serviceName } from '@/lib/site-content'

const headingId = (heading: string) =>
	heading
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')

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
		image: project.image,
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

	// Related work stays within the same service, so the comparison is like for like.
	const more = projectsForService(project.service).filter(
		(item) => item.slug !== project.slug,
	)

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
					{ value: serviceName(project.service), label: 'Service' },
				]}
			/>

			{project.stats && <StatBand variant='cards' stats={project.stats} />}

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
				project.image && (
					<Section>
						<MediaCard
							src={project.image}
							alt={`${project.name} interface`}
							caption={`${project.name} — ${project.category}`}
						/>
					</Section>
				)
			)}

			<Section>
				<SectionHeading eyebrow='The challenge' title='What we walked into' />
				<div className='mt-10 max-w-3xl'>
					<ProseBlock>
						<p>{project.challenge}</p>
					</ProseBlock>
				</div>
			</Section>

			{project.sections && (
				<Section>
					<div className='grid gap-14 lg:grid-cols-[16rem_1fr]'>
						<TableOfContents
							items={project.sections.map((block) => ({
								id: headingId(block.heading),
								label: block.heading,
							}))}
						/>
						<div className='min-w-0 max-w-3xl'>
							<ProseBlock>
								{project.sections.map((block) => (
									/* Flat children: ProseBlock styles direct descendants only. */
									<Fragment key={block.heading}>
										<h2 id={headingId(block.heading)}>{block.heading}</h2>
										{block.paragraphs.map((paragraph) => (
											<p key={paragraph}>{paragraph}</p>
										))}
									</Fragment>
								))}
							</ProseBlock>
						</div>
					</div>
				</Section>
			)}

			{project.comparison && (
				<Section>
					<SectionHeading
						eyebrow='The decision'
						title='What they planned against what we recommended'
						description='The assessment exists to make this comparison before the money is committed, not after.'
						variant='split'
					/>
					<div className='mt-12 grid gap-5 lg:grid-cols-2'>
						{[project.comparison.planned, project.comparison.recommended].map(
							(column, index) => (
								<GlassCard
									key={column.title}
									variant={index === 1 ? 'accent' : 'default'}
									className='p-8'>
									<h3 className='font-display text-xl font-semibold text-white'>
										{column.title}
									</h3>
									<p className='mt-2 text-sm leading-6 text-slate-400'>
										{column.caption}
									</p>
									<div className='mt-7'>
										{/* Ticks would read as endorsement beside the rejected plan. */}
										<CheckList
											icon={index === 0 ? X : undefined}
											items={column.points}
										/>
									</div>
								</GlassCard>
							),
						)}
					</div>
				</Section>
			)}

			<Section>
				<div className='grid gap-12 lg:grid-cols-2'>
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
							{project.outcome ? 'What we handed over' : 'What exists now'}
						</h2>
						<div className='mt-6'>
							<CheckList items={project.delivered} />
						</div>
					</div>
				</div>

				{project.outcome && (
					<div className='mt-16 border-t border-white/10 pt-12'>
						<h2 className='font-display text-2xl font-semibold text-white'>
							What happened next
						</h2>
						<div className='mt-6 max-w-3xl'>
							<CheckList items={project.outcome} />
						</div>
					</div>
				)}

				<div className='mt-16 grid gap-10 border-t border-white/10 pt-12 sm:grid-cols-2'>
					<Chips label='Capabilities' items={project.capabilities} />
					<Chips label={project.stackLabel ?? 'Stack'} items={project.stack} />
				</div>
			</Section>

			{more.length > 0 && (
				<Carousel
					eyebrow='More work'
					title='Other builds worth a look'
					description={`More ${serviceName(project.service)} engagements, with the problem and the result written down.`}
					label={`Other ${serviceName(project.service)} case studies`}
					controls='below'
					size='md'>
					{more.map((item) => (
						<RelatedCard
							key={item.slug}
							title={item.name}
							meta={item.category}
							description={item.summary}
							href={`/case-studies/${item.slug}`}
						/>
					))}
				</Carousel>
			)}

			<CtaBand />
		</>
	)
}
