import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import {
	CheckList,
	CtaBand,
	Section,
	SectionHeading,
} from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion'
import { JsonLd, faqSchema } from '@/lib/seo'
import {
	faqs,
	featuredProjects,
	industries,
	insights,
	processSteps,
	services,
	signals,
	solutions,
} from '@/lib/site-content'

export default function Home() {
	return (
		<>
			<JsonLd schema={faqSchema} />

			<section className='hero-grid relative overflow-hidden px-6 pb-24 pt-36 sm:px-10 lg:px-16 lg:pb-32 lg:pt-44'>
				<div className='mx-auto max-w-6xl'>
					<Badge
						variant='outline'
						className='border-brand/40 bg-brand/10 text-brand'>
						AI · Automation · Custom Software
					</Badge>
					<h1 className='mt-6 max-w-4xl font-display text-4xl font-semibold leading-[1.05] text-white sm:text-6xl lg:text-7xl'>
						We find the work your business should not be doing by hand.
					</h1>
					<p className='mt-7 max-w-2xl text-lg leading-8 text-slate-300'>
						ReynoldsBuilt walks through your entire operation, shows you exactly
						where AI and automation pay off, and then builds the systems that
						make it real.
					</p>
					<div className='mt-10 flex flex-wrap gap-4'>
						<Button
							asChild
							size='lg'
							className='bg-brand font-bold text-ink hover:bg-brand-strong'>
							<Link href='/contact'>
								Book An Assessment <ArrowRight />
							</Link>
						</Button>
						<Button
							asChild
							size='lg'
							variant='outline'
							className='border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
							<Link href='/case-studies'>See Our Case Studies</Link>
						</Button>
					</div>

					<dl className='mt-16 grid max-w-3xl gap-8 border-t border-white/10 pt-10 sm:grid-cols-3'>
						{[
							{ value: 'Step one', label: 'We audit before we build anything' },
							{ value: 'Ranked', label: 'Every opportunity scored by payback' },
							{
								value: 'You own it',
								label: 'Code, systems, and documentation',
							},
						].map((stat) => (
							<div key={stat.label}>
								<dt className='font-display text-2xl font-semibold text-brand'>
									{stat.value}
								</dt>
								<dd className='mt-2 leading-7 text-slate-400'>{stat.label}</dd>
							</div>
						))}
					</dl>
				</div>
			</section>

			<Section className='border-y border-white/10 bg-[#060d18]'>
				<SectionHeading
					eyebrow='Sound familiar?'
					title='You do not have a technology problem. You have a manual work problem.'
					description='Most businesses we walk into are held together by spreadsheets, memory, and a few people doing the same thing over and over. That works until it caps your growth.'
				/>
				<div className='mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
					{signals.map((signal) => (
						<GlassCard key={signal} className='p-5 leading-7 text-slate-300'>
							{signal}
						</GlassCard>
					))}
				</div>
			</Section>

			<Section id='services'>
				<SectionHeading
					eyebrow='What we do'
					title='A consultancy that can also build it'
					description='Most firms will tell you what to do and leave. Others will build whatever you ask for without asking why. We do both halves, in the right order.'
				/>
				<div className='mt-12 grid gap-5 md:grid-cols-2'>
					{services.map((service) => (
						<GlassCard key={service.slug} className='p-7'>
							<span className='flex size-11 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
								<service.icon className='size-5 text-brand' />
							</span>
							<p className='mt-5 text-sm font-semibold text-brand'>
								{service.tagline}
							</p>
							<h3 className='mt-1 font-display text-xl font-semibold text-white'>
								{service.name}
							</h3>
							<p className='mt-3 leading-7 text-slate-400'>{service.summary}</p>
							<Link
								href={`/services#${service.slug}`}
								className='mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand-strong'>
								Learn more <ArrowUpRight className='size-4' />
							</Link>
						</GlassCard>
					))}
				</div>
			</Section>

			<Section className='border-t border-white/10 bg-[#060d18]'>
				<SectionHeading
					eyebrow='How it works'
					title='We look at everything before we build anything'
					description='The assessment is the product. Even if you never hire us to build, you leave with a roadmap you can act on.'
				/>
				<ol className='mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4'>
					{processSteps.map((step) => (
						<GlassCard key={step.number} asChild>
							<li className='p-6'>
								<span className='font-display text-3xl font-semibold text-brand/40'>
									{step.number}
								</span>
								<step.icon className='mt-4 size-5 text-brand' />
								<h3 className='mt-4 font-display text-lg font-semibold text-white'>
									{step.title}
								</h3>
								<p className='mt-3 leading-7 text-slate-400'>{step.summary}</p>
							</li>
						</GlassCard>
					))}
				</ol>
				<Button
					asChild
					variant='outline'
					className='mt-10 border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
					<Link href='/process'>
						See The Full Process <ArrowRight />
					</Link>
				</Button>
			</Section>

			<Section>
				<SectionHeading
					eyebrow='Solutions'
					title='The systems businesses ask us for most'
					description='Every engagement is different, but the shape of the work repeats. These are the builds that come up again and again.'
				/>
				<div className='mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
					{solutions.map((solution) => (
						<GlassCard key={solution.slug} interactive asChild>
							<Link href={`/solutions/${solution.slug}`} className='p-6'>
								<solution.icon className='size-5 text-brand' />
								<h3 className='mt-4 font-display font-semibold text-white'>
									{solution.name}
								</h3>
								<p className='mt-2 text-sm leading-6 text-slate-400'>
									{solution.blurb}
								</p>
							</Link>
						</GlassCard>
					))}
				</div>
			</Section>

			<Section className='border-t border-white/10 bg-[#060d18]'>
				<SectionHeading
					eyebrow='Selected work'
					title='Software already running in real businesses'
				/>
				<div className='mt-12 grid gap-6 md:grid-cols-3'>
					{featuredProjects.map((project) => (
						<GlassCard key={project.slug} interactive asChild>
							<Link href={`/case-studies/${project.slug}`} className='group'>
								<span className='relative block aspect-video border-b border-white/10 bg-ink'>
									<Image
										src={project.image}
										alt={`${project.name} interface`}
										fill
										sizes='(min-width: 768px) 33vw, 100vw'
										className='object-cover transition-transform duration-500 group-hover:scale-105'
									/>
								</span>
								<span className='block p-6'>
									<span className='text-sm font-medium text-brand'>
										{project.category}
									</span>
									<span className='mt-1 block font-display text-lg font-semibold text-white'>
										{project.name}
									</span>
									<span className='mt-3 block leading-7 text-slate-400'>
										{project.summary}
									</span>
								</span>
							</Link>
						</GlassCard>
					))}
				</div>
				<Button
					asChild
					variant='outline'
					className='mt-10 border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
					<Link href='/case-studies'>
						All Case Studies <ArrowRight />
					</Link>
				</Button>
			</Section>

			<Section>
				<div className='grid gap-12 lg:grid-cols-[1fr_1fr]'>
					<div>
						<SectionHeading
							eyebrow='Industries'
							title='We work where manual process is the bottleneck'
							description='The tools change by industry. The underlying problems almost never do.'
						/>
						<Button
							asChild
							variant='outline'
							className='mt-8 border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
							<Link href='/industries'>
								Explore Industries <ArrowRight />
							</Link>
						</Button>
					</div>
					<ul className='grid gap-3 sm:grid-cols-2'>
						{industries.map((industry) => (
							<li key={industry.slug}>
								<GlassCard interactive asChild>
									<Link
										href={`/industries/${industry.slug}`}
										className='flex items-center gap-3 p-4'>
										<industry.icon className='size-5 shrink-0 text-brand' />
										<span className='font-medium text-white'>
											{industry.name}
										</span>
									</Link>
								</GlassCard>
							</li>
						))}
					</ul>
				</div>
			</Section>

			<Section className='border-t border-white/10 bg-[#060d18]'>
				<div className='grid gap-12 lg:grid-cols-[1fr_1.1fr]'>
					<div>
						<SectionHeading
							eyebrow='Why us'
							title='Straight answers, including the ones that cost us work'
						/>
						<div className='mt-8'>
							<CheckList
								icon={Check}
								items={[
									'We tell you what not to build',
									'You talk directly to the person building it',
									'Plain language, never jargon',
									'You own the code and the documentation',
								]}
							/>
						</div>
					</div>
					<Accordion type='single' collapsible className='w-full'>
						{faqs.map((faq) => (
							<AccordionItem
								key={faq.question}
								value={faq.question}
								className='border-white/10'>
								<AccordionTrigger className='text-left font-display text-base text-white hover:no-underline'>
									{faq.question}
								</AccordionTrigger>
								<AccordionContent className='leading-7 text-slate-400'>
									{faq.answer}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</Section>

			<Section>
				<SectionHeading
					eyebrow='From the blog'
					title='Thinking about AI without the hype'
				/>
				<div className='mt-12 grid gap-5 md:grid-cols-3'>
					{insights.slice(0, 3).map((insight) => (
						<GlassCard key={insight.slug} interactive asChild>
							<Link
								href={`/blog/${insight.slug}`}
								className='flex flex-col p-6'>
								<span className='text-sm font-medium text-brand'>
									{insight.category}
								</span>
								<span className='mt-2 font-display text-lg font-semibold leading-snug text-white'>
									{insight.title}
								</span>
								<span className='mt-3 flex-1 leading-7 text-slate-400'>
									{insight.excerpt}
								</span>
								<span className='mt-5 text-sm text-slate-500'>
									{insight.readTime} read
								</span>
							</Link>
						</GlassCard>
					))}
				</div>
			</Section>

			<CtaBand />
		</>
	)
}
