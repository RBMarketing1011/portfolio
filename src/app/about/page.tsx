import {
	CtaBand,
	FeatureCard,
	Grid,
	PageHero,
	ProcessSteps,
	ProseBlock,
	Section,
	SectionHeading,
} from '@/components/sections'
import { JsonLd, breadcrumbSchema, buildMetadata, pageSchema } from '@/lib/seo'
import { deliverySteps, principles } from '@/lib/site-content'

export const metadata = buildMetadata({
	title: 'About Us',
	description:
		'ReynoldsBuilt is an AI, automation, and software consultancy that audits an entire operation before building anything, then builds what the business actually needs.',
	path: '/about',
})

export default function AboutPage() {
	return (
		<>
			<JsonLd
				schema={[
					breadcrumbSchema([
						{ name: 'Home', path: '/' },
						{ name: 'About Us', path: '/about' },
					]),
					pageSchema({
						path: '/about',
						name: 'About Us',
						description:
							'Who ReynoldsBuilt is, how we operate, and why the assessment comes before the build.',
						type: 'AboutPage',
					}),
				]}
			/>

			<PageHero
				eyebrow='About us'
				title='We are the people who ask why before we ask what.'
				description='ReynoldsBuilt exists because too many businesses buy software that does not fit and hire consultants who never build anything. We do both halves, and we do them in the right order.'
				actions={[
					{ label: 'Book An Assessment', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
			/>

			<Section>
				<SectionHeading
					eyebrow='Who we are'
					title='Consultants who ship'
					description='Most businesses we meet are running on a mix of good software, bad software, and a spreadsheet that quietly holds the whole thing together.'
				/>
				<div className='mt-12 max-w-3xl'>
					<ProseBlock>
						<p>
							Nobody planned it that way. It accumulated. The usual options are
							both bad: a strategy firm will produce a deck and leave, and a dev
							shop will build exactly what you asked for, whether or not it was
							the right thing to ask for.
						</p>
						<p>
							We start by walking your operation end to end. Every process,
							every handoff, every place a person is doing something a system
							should be doing. Then we show you what is worth building, what is
							worth automating, and what should be left alone.
						</p>
						<p>
							After that, we build it. The same people who mapped the process
							write the code, which means nothing gets lost in translation.
						</p>
					</ProseBlock>
				</div>
			</Section>

			<ProcessSteps
				eyebrow='What we actually do'
				title='Four steps, and you can stop after any of them'
				description='The assessment stands on its own. If it says do not build anything, that is a legitimate outcome and the roadmap is still yours.'
				steps={deliverySteps}
			/>

			<Grid
				eyebrow='How we operate'
				title='Four things we will not compromise on'
				description='These are the reasons projects finish, and the reasons we occasionally turn work down.'
				columns={2}>
				{principles.map((principle) => (
					<FeatureCard
						key={principle.title}
						title={principle.title}
						blurb={principle.body}
					/>
				))}
			</Grid>

			<CtaBand />
		</>
	)
}
