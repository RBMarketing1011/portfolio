import { CtaBand, PageHero, ProcessSteps } from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata } from '@/lib/seo'
import { deliverySteps } from '@/lib/site-content'

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
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See What We Have Built', href: '/case-studies' },
				]}
			/>

			<ProcessSteps
				eyebrow='Step by step'
				title='From the first conversation to a system in use'
				description='You can stop after any step. The assessment stands on its own and the roadmap is yours either way.'
				steps={deliverySteps}
			/>

			<CtaBand
				title='The assessment is where it starts.'
				description='Two conversations and a walkthrough of your operation is usually enough to know whether there is real work worth doing.'
			/>
		</>
	)
}
