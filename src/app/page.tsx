import { X } from 'lucide-react'
import {
	ArticleCard,
	CaseStudyCard,
	CheckList,
	CtaBand,
	FaqAccordion,
	FeatureCard,
	Grid,
	PageHero,
	ProcessSteps,
	RelatedCard,
	Section,
	SectionHeading,
} from '@/components/sections'
import { Highlight } from '@/components/ui/highlight'
import { JsonLd, faqSchema, pageSchema } from '@/lib/seo'
import {
	deliverySteps,
	faqs,
	featuredProjects,
	industries,
	insights,
	principles,
	services,
	signals,
	solutions,
} from '@/lib/site-content'

export default function Home() {
	return (
		<>
			<JsonLd
				schema={[
					pageSchema({
						path: '/',
						name: 'AI, Automation & Custom Software Consultancy',
						description:
							'ReynoldsBuilt audits your entire operation, shows you exactly what should be built, and then builds it.',
					}),
					faqSchema,
				]}
			/>

			<PageHero
				eyebrow='AI · Automation · Custom Software'
				title={
					<>
						We find the work your business{' '}
						<Highlight>should not be doing by hand</Highlight>.
					</>
				}
				description='ReynoldsBuilt walks through your entire operation, shows you exactly where AI and automation pay off, and then builds the systems that make it real.'
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See Our Case Studies', href: '/case-studies' },
				]}
				stats={[
					{ value: 'Step one', label: 'We audit before we build anything' },
					{ value: 'Ranked', label: 'Every opportunity scored by payback' },
					{ value: 'You own it', label: 'Code, systems, and documentation' },
				]}
			/>

			<Section>
				<SectionHeading
					eyebrow='Sound familiar?'
					title='You do not have a technology problem. You have a manual work problem.'
					description='Most businesses we walk into are held together by spreadsheets, memory, and a few people doing the same thing over and over. That works until it caps your growth.'
				/>
				<div className='mt-12 grid gap-x-12 gap-y-4 sm:grid-cols-2'>
					<CheckList icon={X} items={signals.slice(0, 3)} />
					<CheckList icon={X} items={signals.slice(3)} />
				</div>
			</Section>

			<Grid
				eyebrow='What we do'
				title='A consultancy that can also build it'
				description='Most firms will tell you what to do and leave. Others will build whatever you ask for without asking why. We do both halves, in the right order.'
				columns={2}>
				{services.map((service) => (
					<FeatureCard
						key={service.slug}
						icon={service.icon}
						title={service.name}
						blurb={service.summary}
					/>
				))}
			</Grid>

			<ProcessSteps
				eyebrow='How it works'
				title='We look at everything before we build anything'
				description='The assessment is the product. Even if you never hire us to build, you leave with a roadmap you can act on.'
				steps={deliverySteps}
			/>

			<Grid
				eyebrow='Solutions'
				title='The systems businesses ask us for most'
				description='Every engagement is different, but the shape of the work repeats. These are the builds that come up again and again.'
				columns={4}>
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

			<Grid
				eyebrow='Selected work'
				title='Software already running in real businesses'
				description='Three builds that replaced a manual process, or a tool that was not doing the job.'>
				{featuredProjects.map((project) => (
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

			<Grid
				eyebrow='Industries'
				title='We work where manual process is the bottleneck'
				description='The tools change by industry. The underlying problems almost never do.'
				columns={3}>
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

			<Grid
				eyebrow='Why us'
				title='Straight answers, including the ones that cost us work'
				columns={2}>
				{principles.map((principle) => (
					<FeatureCard
						key={principle.title}
						title={principle.title}
						blurb={principle.body}
					/>
				))}
			</Grid>

			<FaqAccordion
				eyebrow='Questions'
				title='The things everyone asks first'
				description='If the answer you need is not here, the contact form reaches a person rather than a queue.'
				faqs={faqs}
			/>

			<Grid
				eyebrow='From the blog'
				title='Thinking about AI without the hype'
				description='What we have learned building systems inside real operations.'>
				{insights.slice(0, 3).map((insight) => (
					<ArticleCard
						key={insight.slug}
						title={insight.title}
						excerpt={insight.excerpt}
						category={insight.category}
						readTime={insight.readTime}
						href={`/blog/${insight.slug}`}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
