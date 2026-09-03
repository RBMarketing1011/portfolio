import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { insights } from '@/lib/site-content'

export function generateStaticParams() {
	return insights.map((insight) => ({ slug: insight.slug }))
}

export default async function InsightArticle({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	const insight = insights.find((item) => item.slug === slug)
	if (!insight) notFound()
	return (
		<div className='min-h-screen bg-[#03080f] px-6 pb-24 pt-36 sm:px-10 lg:px-16'>
			<article className='mx-auto max-w-3xl'>
				<Button
					asChild
					variant='ghost'
					className='mb-10 px-0 text-[#61adfb] hover:bg-transparent hover:text-white'>
					<Link href='/insights'>
						<ArrowLeft /> All insights
					</Link>
				</Button>
				<p className='eyebrow'>{insight.category}</p>
				<h1 className='mt-5 font-display text-4xl font-semibold leading-tight text-white sm:text-6xl'>
					{insight.title}
				</h1>
				<p className='mt-7 text-lg leading-8 text-slate-300'>
					{insight.excerpt}
				</p>
				<div className='mt-12 space-y-7 leading-8 text-slate-400'>
					<p>
						This article is being prepared for publication. The final piece will
						share a clear point of view, concrete decision criteria, and
						examples from the work that prompted it.
					</p>
					<h2 className='font-display text-2xl font-semibold text-white'>
						A practical standard
					</h2>
					<p>
						Good operational software should make the next action more obvious.
						It should remove handoffs, present information at the moment it is
						needed, and earn the time it asks from the people using it.
					</p>
				</div>
			</article>
		</div>
	)
}
