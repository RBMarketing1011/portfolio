import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, X } from 'lucide-react'
import {
	CheckList,
	CtaBand,
	PageHero,
	Section,
	SectionHeading,
} from '@/components/sections'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { industries } from '@/lib/site-content'

export function generateStaticParams() {
	return industries.map((industry) => ({ slug: industry.slug }))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const industry = industries.find((item) => item.slug === slug)
	if (!industry) return {}

	return buildMetadata({
		title: `${industry.name} Software & Automation`,
		description: industry.blurb,
		path: `/industries/${industry.slug}`,
	})
}

export default async function IndustryPage({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const industry = industries.find((item) => item.slug === slug)
	if (!industry) notFound()

	const others = industries.filter((item) => item.slug !== industry.slug)

	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Industries', path: '/industries' },
						{ name: industry.name, path: `/industries/${industry.slug}` },
					]),
					{
						'@type': 'FAQPage',
						mainEntity: industry.faqs.map((faq) => ({
							'@type': 'Question',
							name: faq.question,
							acceptedAnswer: { '@type': 'Answer', text: faq.answer },
						})),
					},
				]}
			/>

			<PageHero
				eyebrow='Industry'
				title={industry.name}
				description={industry.blurb}>
				<Button
					asChild
					size='lg'
					className='mt-9 bg-brand font-bold text-ink hover:bg-brand-strong'>
					<Link href='/contact'>
						Book An Assessment <ArrowRight />
					</Link>
				</Button>
			</PageHero>

			<Section>
				<div className='grid gap-14 lg:grid-cols-[1.3fr_1fr]'>
					<div className='max-w-2xl space-y-6 text-lg leading-8 text-slate-300'>
						{industry.intro.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</div>

					<GlassCard className='h-fit p-8'>
						<h2 className='font-display text-lg font-semibold text-white'>
							What we usually find
						</h2>
						<ul className='mt-6 space-y-4'>
							{industry.pains.map((pain) => (
								<li key={pain} className='flex gap-3 text-slate-400'>
									<X className='mt-1 size-4 shrink-0 text-red-400/70' />
									<span className='leading-7'>{pain}</span>
								</li>
							))}
						</ul>
					</GlassCard>
				</div>
			</Section>

			<Section className='border-y border-white/10 bg-[#060d18]'>
				<SectionHeading
					eyebrow='The workflow'
					title='Where the work actually moves'
					description='These are the points in the operation where information gets lost, duplicated, or delayed. They are also where the return is highest.'
				/>
				<ol className='mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4'>
					{industry.workflows.map((step, index) => (
						<GlassCard key={step.title} asChild>
							<li className='p-6'>
								<span className='font-display text-3xl font-semibold text-brand/40'>
									{String(index + 1).padStart(2, '0')}
								</span>
								<h3 className='mt-4 font-display text-lg font-semibold text-white'>
									{step.title}
								</h3>
								<p className='mt-3 leading-7 text-slate-400'>{step.body}</p>
							</li>
						</GlassCard>
					))}
				</ol>
			</Section>

			<Section>
				<div className='grid gap-12 lg:grid-cols-[1fr_1fr]'>
					<div>
						<SectionHeading
							eyebrow='What we build'
							title={`Systems for ${industry.name.toLowerCase()}`}
						/>
					</div>
					<GlassCard variant='accent' className='p-8'>
						<CheckList items={industry.builds} />
					</GlassCard>
				</div>
			</Section>

			<Section className='border-t border-white/10 bg-[#060d18]'>
				<SectionHeading eyebrow='Questions' title='Common questions' />
				<Accordion type='single' collapsible className='mt-10 max-w-3xl'>
					{industry.faqs.map((faq) => (
						<AccordionItem
							key={faq.question}
							value={faq.question}
							className='border-white/10'>
							<AccordionTrigger className='text-left font-display text-base text-white hover:no-underline'>
								{faq.question}
							</AccordionTrigger>
							<AccordionContent className='text-base leading-7 text-slate-400'>
								{faq.answer}
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			</Section>

			<Section>
				<h2 className='font-display text-2xl font-semibold text-white'>
					Other industries
				</h2>
				<div className='mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
					{others.map((item) => (
						<GlassCard key={item.slug} interactive asChild>
							<Link href={`/industries/${item.slug}`} className='p-5'>
								<item.icon className='size-5 text-brand' />
								<span className='mt-3 block font-medium text-white'>
									{item.name}
								</span>
							</Link>
						</GlassCard>
					))}
				</div>
			</Section>

			<CtaBand
				title={`Let us look at your ${industry.name.toLowerCase()} operation.`}
			/>
		</>
	)
}
