import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { CheckList, CtaBand, Section } from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Separator } from '@/components/ui/separator'
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

			<section className='hero-grid border-b border-white/10 px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-6xl'>
					<Button
						asChild
						variant='ghost'
						className='mb-8 px-0 text-brand hover:bg-transparent hover:text-brand-strong'>
						<Link href='/case-studies'>
							<ArrowLeft /> All Case Studies
						</Link>
					</Button>
					<p className='eyebrow'>{project.category}</p>
					<h1 className='mt-4 max-w-4xl font-display text-4xl font-semibold leading-tight text-white sm:text-6xl'>
						{project.name}
					</h1>
					<p className='mt-6 max-w-2xl text-lg leading-8 text-slate-300'>
						{project.summary}
					</p>
				</div>
			</section>

			<Section>
				<GlassCard>
					<Image
						src={project.image}
						alt={`${project.name} interface`}
						width={1600}
						height={900}
						className='h-auto w-full'
						priority
					/>
				</GlassCard>

				{project.video && (
					<video
						className='mt-6 w-full rounded-xl border border-white/10'
						controls
						playsInline
						preload='metadata'
						poster={project.image}>
						<source src={project.video} type='video/mp4' />
					</video>
				)}

				<div className='mt-14 grid gap-12 lg:grid-cols-[1.4fr_20rem]'>
					<div className='space-y-12'>
						<section>
							<h2 className='font-display text-2xl font-semibold text-white'>
								The challenge
							</h2>
							<p className='mt-4 leading-8 text-slate-400'>
								{project.challenge}
							</p>
						</section>

						<section>
							<h2 className='font-display text-2xl font-semibold text-white'>
								How we approached it
							</h2>
							<div className='mt-5'>
								<CheckList items={project.approach} />
							</div>
						</section>

						<section>
							<h2 className='font-display text-2xl font-semibold text-white'>
								What we delivered
							</h2>
							<div className='mt-5'>
								<CheckList items={project.delivered} />
							</div>
						</section>
					</div>

					<GlassCard asChild>
						<aside className='h-fit p-7'>
							<h2 className='font-display font-semibold text-white'>Client</h2>
							<p className='mt-2 text-slate-400'>{project.client}</p>

							<Separator className='my-6 bg-white/10' />

							<h2 className='font-display font-semibold text-white'>
								Capabilities
							</h2>
							<div className='mt-4 flex flex-wrap gap-2'>
								{project.capabilities.map((capability) => (
									<Badge
										key={capability}
										variant='outline'
										className='border-brand/30 text-slate-300'>
										{capability}
									</Badge>
								))}
							</div>

							<Separator className='my-6 bg-white/10' />

							<h2 className='font-display font-semibold text-white'>Stack</h2>
							<div className='mt-4 flex flex-wrap gap-2'>
								{project.stack.map((tech) => (
									<Badge
										key={tech}
										variant='outline'
										className='border-white/15 text-slate-300'>
										{tech}
									</Badge>
								))}
							</div>
						</aside>
					</GlassCard>
				</div>
			</Section>

			<Section className='border-t border-white/10 bg-[#060d18]'>
				<h2 className='font-display text-2xl font-semibold text-white'>
					More work
				</h2>
				<div className='mt-8 grid gap-5 md:grid-cols-3'>
					{more.map((item) => (
						<GlassCard key={item.slug} interactive asChild>
							<Link href={`/case-studies/${item.slug}`} className='p-6'>
								<span className='text-sm font-medium text-brand'>
									{item.category}
								</span>
								<span className='mt-1 block font-display text-lg font-semibold text-white'>
									{item.name}
								</span>
								<span className='mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand'>
									Read <ArrowUpRight className='size-4' />
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
