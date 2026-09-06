import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CtaBand, Section } from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import { Separator } from '@/components/ui/separator'
import {
	JsonLd,
	articleSchema,
	breadcrumbSchema,
	buildMetadata,
} from '@/lib/seo'
import { insights } from '@/lib/site-content'

export function generateStaticParams() {
	return insights.map((insight) => ({ slug: insight.slug }))
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const insight = insights.find((item) => item.slug === slug)
	if (!insight) return {}

	return buildMetadata({
		title: insight.title,
		description: insight.excerpt,
		path: `/blog/${insight.slug}`,
		type: 'article',
		publishedTime: insight.date,
	})
}

const formatter = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'long',
	day: 'numeric',
})

export default async function BlogArticle({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const insight = insights.find((item) => item.slug === slug)
	if (!insight) notFound()

	const more = insights.filter((item) => item.slug !== insight.slug).slice(0, 3)

	return (
		<>
			<JsonLd
				schema={[
					articleSchema(insight),
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'Blog', path: '/blog' },
						{ name: insight.title, path: `/blog/${insight.slug}` },
					]),
				]}
			/>

			<section className='hero-grid border-b border-white/10 px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-3xl'>
					<Button
						asChild
						variant='ghost'
						className='mb-8 px-0 text-brand hover:bg-transparent hover:text-brand-strong'>
						<Link href='/blog'>
							<ArrowLeft /> All Articles
						</Link>
					</Button>
					<Badge variant='outline' className='border-brand/30 text-brand'>
						{insight.category}
					</Badge>
					<h1 className='mt-5 font-display text-4xl font-semibold leading-tight text-white sm:text-5xl'>
						{insight.title}
					</h1>
					<p className='mt-6 text-lg leading-8 text-slate-300'>
						{insight.excerpt}
					</p>
					<div className='mt-6 flex items-center gap-3 text-sm text-slate-500'>
						<time dateTime={insight.date}>
							{formatter.format(new Date(insight.date))}
						</time>
						<span aria-hidden>·</span>
						<span>{insight.readTime} read</span>
					</div>
				</div>
			</section>

			<Section>
				<article className='mx-auto max-w-3xl'>
					{insight.body.map((block) => (
						<section key={block.heading} className='mb-10'>
							<h2 className='font-display text-2xl font-semibold text-white'>
								{block.heading}
							</h2>
							{block.paragraphs.map((paragraph) => (
								<p
									key={paragraph}
									className='mt-4 text-lg leading-8 text-slate-400'>
									{paragraph}
								</p>
							))}
						</section>
					))}

					<Separator className='my-12 bg-white/10' />

					<h2 className='font-display text-xl font-semibold text-white'>
						Keep reading
					</h2>
					<ul className='mt-6 space-y-4'>
						{more.map((item) => (
							<li key={item.slug}>
								<GlassCard interactive asChild>
									<Link href={`/blog/${item.slug}`} className='block p-5'>
										<span className='text-sm font-medium text-brand'>
											{item.category}
										</span>
										<span className='mt-1 block font-display font-semibold text-white'>
											{item.title}
										</span>
									</Link>
								</GlassCard>
							</li>
						))}
					</ul>
				</article>
			</Section>

			<CtaBand />
		</>
	)
}
