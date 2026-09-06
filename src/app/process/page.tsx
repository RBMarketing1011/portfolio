import { CheckList, CtaBand, PageHero, Section } from '@/components/sections'
import { GlassCard } from '@/components/ui/glass-card'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { processSteps } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'Our Process',
	description:
		'How a ReynoldsBuilt engagement runs: a full operational assessment, a ranked blueprint, an incremental build, and support that keeps it working.',
	path: '/process',
})

export default function ProcessPage() {
	return (
		<>
			<JsonLd
				schema={breadcrumbSchema([
					{ name: 'Home', path: '/' },
					{ name: 'Process', path: '/process' },
				])}
			/>

			<PageHero
				eyebrow='Process'
				title='No mystery, no black box.'
				description='Every engagement follows the same four steps. You always know what is happening, what it costs, and what happens next.'
			/>

			<Section>
				<ol className='space-y-6'>
					{processSteps.map((step) => (
						<GlassCard key={step.number} asChild>
							<li className='grid gap-8 p-8 lg:grid-cols-[auto_1fr_1fr] lg:items-start'>
							<span className='font-display text-5xl font-semibold text-brand/30'>
								{step.number}
							</span>
							<div>
								<span className='flex size-11 items-center justify-center rounded-lg border border-brand/25 bg-brand/10'>
									<step.icon className='size-5 text-brand' />
								</span>
								<h2 className='mt-5 font-display text-2xl font-semibold text-white'>
									{step.title}
								</h2>
								<p className='mt-3 leading-8 text-slate-400'>{step.summary}</p>
							</div>
							<CheckList items={step.detail} />
							</li>
						</GlassCard>
					))}
				</ol>
			</Section>

			<CtaBand
				title='The assessment is where it starts.'
				description='Two conversations and a walkthrough of your operation is usually enough to know whether there is real work worth doing.'
			/>
		</>
	)
}
