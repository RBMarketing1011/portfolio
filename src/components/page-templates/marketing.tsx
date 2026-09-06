import {
	BeforeAfter,
	CheckList,
	ComparisonTable,
	CtaBand,
	FaqAccordion,
	FeatureCard,
	FeatureRows,
	Grid,
	LogoStrip,
	PageHero,
	PricingTiers,
	ProcessSteps,
	Section,
	SectionHeading,
	SplitCta,
	SplitHero,
	Spotlight,
	StatBand,
	StatHero,
	TestimonialCard,
	sampleFeatures,
	sampleTestimonials,
} from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { Highlight } from '@/components/ui/highlight'

function FeatureCards({ count = 6 }: { count?: number }) {
	return sampleFeatures
		.slice(0, count)
		.map((feature, index) => <FeatureCard key={index} {...feature} />)
}

export function HomeTemplate() {
	return (
		<>
			<SplitHero
				eyebrow='Home Template'
				title={
					<>
						This is the home hero heading with{' '}
						<Highlight>emphasis on this</Highlight>
					</>
				}
			/>
			<StatBand />
			<LogoStrip />
			<Grid
				eyebrow='What We Do'
				title='This is the capability section on the home page'>
				<FeatureCards />
			</Grid>
			<Spotlight eyebrow='Featured Work' />
			<Section>
				<TestimonialCard featured />
			</Section>
			<CtaBand />
		</>
	)
}

export function ServiceDetailTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Service Template'
				title='This is the service detail heading'
				description='This is the service description. It says what the service is and who it is for before the page goes into detail.'
				actions={[
					{ label: 'Primary Button', href: '/contact' },
					{ label: 'Secondary Button', href: '/case-studies' },
				]}
			/>
			<FeatureRows />
			<ProcessSteps
				eyebrow='How It Works'
				title='This is how the service is delivered'
			/>
			<ComparisonTable />
			<FaqAccordion />
			<CtaBand />
		</>
	)
}

export function SolutionDetailTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Solution Template'
				title='This is the solution detail heading'
				description='This is the solution description. It names the problem this solution removes and what replaces it.'
				actions={[{ label: 'Primary Button', href: '/contact' }]}
			/>
			<BeforeAfter />
			<Grid
				eyebrow='What You Get'
				title='This is what the solution includes'
				columns={2}>
				<FeatureCards count={4} />
			</Grid>
			<Spotlight eyebrow='Proof' />
			<CtaBand />
		</>
	)
}

export function IndustryDetailTemplate() {
	return (
		<>
			<StatHero
				eyebrow='Industry Template'
				title='This is the industry detail heading'
				description='This is the industry description. It opens with the numbers that matter to this sector.'
			/>
			<Section>
				<SectionHeading
					eyebrow='Sound Familiar'
					title='This is the pain point section for the industry'
					description='This is where the specific, recognisable problems for this industry get named.'
				/>
			</Section>
			<Grid
				eyebrow='What We Build'
				title='This is what typically gets built for this industry'>
				<FeatureCards />
			</Grid>
			<Spotlight eyebrow='In This Industry' />
			<FaqAccordion />
			<CtaBand />
		</>
	)
}

export function PricingTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Pricing Template'
				title='This is the pricing page heading'
				description='This is the pricing description. It frames how engagements are shaped before showing the tiers.'
			/>
			<PricingTiers />
			<ComparisonTable
				eyebrow='Compare'
				title='This is the comparison under the tiers'
			/>
			<Grid eyebrow='What Clients Say' title='This is the testimonial row'>
				{sampleTestimonials.slice(0, 3).map((item, index) => (
					<TestimonialCard key={index} {...item} />
				))}
			</Grid>
			<FaqAccordion
				eyebrow='Pricing Questions'
				title='This is the pricing FAQ'
			/>
			<CtaBand />
		</>
	)
}

export function LandingTemplate() {
	return (
		<>
			<SplitHero
				eyebrow='Landing Template'
				title='This is the campaign landing heading'
				description='This is the landing description. Stripped chrome, one offer, and a single conversion path for paid traffic.'
				actions={[{ label: 'Primary Button', href: '/contact' }]}
			/>
			<StatBand />
			<Grid eyebrow='The Offer' title='This is what is included' columns={2}>
				<FeatureCards count={4} />
			</Grid>
			<Section>
				<TestimonialCard featured />
			</Section>
			<FaqAccordion />
			<CtaBand
				title='This is the single closing call to action'
				description='A landing page ends with one ask, repeated from the hero.'
			/>
		</>
	)
}

export function ResourceTemplate() {
	return (
		<>
			<section className='hero-grid border-b border-white/10 px-6 pb-20 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto grid max-w-6xl gap-14 lg:grid-cols-2'>
					<div>
						<Badge className='uppercase tracking-widest'>Free Resource</Badge>
						<h1 className='mt-6 font-display text-4xl font-semibold leading-[1.08] text-white sm:text-5xl'>
							This is the resource title
						</h1>
						<p className='mt-6 text-lg leading-8 text-slate-300'>
							This is the resource description. It says what the download is,
							who it is for, and what the reader will be able to do after
							reading it.
						</p>
						<div className='mt-10'>
							<CheckList
								items={[
									'This is something the reader gets',
									'Three or four bullets is the right length here',
									'Each one is a concrete takeaway, not a chapter title',
									'The last one should be the most valuable',
								]}
							/>
						</div>
					</div>
					<GlassCard className='h-fit p-8 sm:p-10'>
						<h2 className='font-display text-2xl font-semibold text-white'>
							This is the download form heading
						</h2>
						<p className='mt-2 leading-7 text-slate-400'>
							One field, one button, no other links on the card.
						</p>
						<div className='mt-8 flex min-h-40 items-center justify-center rounded-lg border border-dashed border-white/15 px-6 text-center text-sm text-slate-500'>
							Form slot: drop the gated download form in here
						</div>
					</GlassCard>
				</div>
			</section>

			<StatBand />
			<Section>
				<TestimonialCard featured />
			</Section>
			<FaqAccordion
				eyebrow='About This Resource'
				title='This is the FAQ for the download'
			/>
			<CtaBand />
		</>
	)
}

export function ComparisonTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Comparison Template'
				title='This is the comparison page heading'
				description='This is the comparison description. It names both options plainly and states which reader each one suits.'
			/>
			<ComparisonTable
				eyebrow='Side By Side'
				title='This is the direct comparison'
				description='The recommended option sits in the first column so it reads first.'
			/>
			<BeforeAfter
				eyebrow='In Practice'
				title='This is what the difference looks like day to day'
			/>
			<FeatureRows />
			<Section>
				<TestimonialCard featured />
			</Section>
			<FaqAccordion
				eyebrow='Common Questions'
				title='This is the FAQ that closes out the comparison'
			/>
			<SplitCta />
		</>
	)
}
