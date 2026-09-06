import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Check, X } from 'lucide-react'
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
import { solutions } from '@/lib/site-content'

export function generateStaticParams() {
	return solutions.map((solution) => ({ slug: solution.slug }))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const solution = solutions.find((item) => item.slug === slug)
	if (!solution) return {}

	return buildMetadata({
		title: solution.name,
		description: solution.blurb,
		path: `/solutions/${solution.slug}`,
	})
}

export default async function SolutionPage({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const solution = solutions.find((item) => item.slug === slug)
	if (!solution) notFound()

	const others = solutions.filter((item) => item.slug !== solution.slug)

	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Solutions', path: '/solutions' },
						{ name: solution.name, path: `/solutions/${solution.slug}` },
					]),
					{
						'@type': 'FAQPage',
						mainEntity: solution.faqs.map((faq) => ({
							'@type': 'Question',
							name: faq.question,
							acceptedAnswer: { '@type': 'Answer', text: faq.answer },
						})),
					},
				]}
			/>

			<PageHero
				eyebrow={solution.name}
				title={solution.headline}
				description={solution.blurb}>
				<Button
					asChild
					size='lg'
					className='mt-9 bg-brand font-bold text-ink hover:bg-brand-strong'>
					<Link href='/contact'>
						Talk Through Your Process <ArrowRight />
					</Link>
				</Button>
			</PageHero>

			<Section>
				<div className='grid gap-14 lg:grid-cols-[1.3fr_1fr]'>
					<div className='max-w-2xl space-y-6 text-lg leading-8 text-slate-300'>
						{solution.intro.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</div>

					<GlassCard className='h-fit p-8'>
						<h2 className='font-display text-lg font-semibold text-white'>
							Problems this solves
						</h2>
						<ul className='mt-6 space-y-4'>
							{solution.problems.map((problem) => (
								<li key={problem} className='flex gap-3 text-slate-400'>
									<X className='mt-1 size-4 shrink-0 text-red-400/70' />
									<span className='leading-7'>{problem}</span>
								</li>
							))}
						</ul>
					</GlassCard>
				</div>
			</Section>

			<Section className='border-y border-white/10 bg-[#060d18]'>
				<SectionHeading eyebrow='What we build' title='What this looks like' />
				<div className='mt-12 grid gap-5 md:grid-cols-2'>
					{solution.whatWeBuild.map((item) => (
						<GlassCard key={item.title} className='p-7'>
							<h3 className='font-display text-lg font-semibold text-white'>
								{item.title}
							</h3>
							<p className='mt-3 leading-7 text-slate-400'>{item.body}</p>
						</GlassCard>
					))}
				</div>
			</Section>

			<Section>
				<div className='grid gap-12 md:grid-cols-2'>
					<GlassCard variant='accent' className='p-8'>
						<h2 className='font-display text-xl font-semibold text-white'>
							What changes
						</h2>
						<div className='mt-6'>
							<CheckList items={solution.outcomes} />
						</div>
					</GlassCard>

					<GlassCard className='p-8'>
						<h2 className='font-display text-xl font-semibold text-white'>
							This is a good fit if
						</h2>
						<ul className='mt-6 space-y-4'>
							{solution.goodFit.map((item) => (
								<li key={item} className='flex gap-3 text-slate-400'>
									<Check className='mt-1 size-4 shrink-0 text-brand' />
									<span className='leading-7'>{item}</span>
								</li>
							))}
						</ul>
					</GlassCard>
				</div>
			</Section>

			<Section className='border-t border-white/10 bg-[#060d18]'>
				<SectionHeading eyebrow='Questions' title='Common questions' />
				<Accordion type='single' collapsible className='mt-10 max-w-3xl'>
					{solution.faqs.map((faq) => (
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
					Other solutions
				</h2>
				<div className='mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
					{others.map((item) => (
						<GlassCard key={item.slug} interactive asChild>
							<Link href={`/solutions/${item.slug}`} className='p-5'>
								<item.icon className='size-5 text-brand' />
								<span className='mt-3 block font-medium text-white'>
									{item.name}
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
