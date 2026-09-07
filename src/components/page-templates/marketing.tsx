import {
	BeforeAfter,
	Carousel,
	CheckList,
	ClientLogo,
	ComparisonTable,
	ContactSplit,
	CtaBand,
	FaqAccordion,
	FeatureCard,
	FeatureRows,
	FilterBar,
	Grid,
	LeadCapture,
	LogoStrip,
	Marquee,
	PageHero,
	PricingTiers,
	ProcessSteps,
	RoiCalculator,
	Section,
	SectionHeading,
	SplitCta,
	SplitHero,
	Spotlight,
	StatBand,
	StatHero,
	TabsShowcase,
	TestimonialCard,
	exampleLogos,
} from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { Highlight } from '@/components/ui/highlight'
import {
	beforeAfterPoints,
	buildVsBuy,
	capabilities,
	deliverySteps,
	engagementSplit,
	engagementTiers,
	generalFaqs,
	guideChapters,
	heroStats,
	pricingFaqs,
	resultStats,
	supportFaqs,
	testimonials,
	trustStats,
} from './content'

function Capabilities({
	count = 6,
	variant,
}: {
	count?: number
	variant?: 'card' | 'inline' | 'numbered'
}) {
	return capabilities
		.slice(0, count)
		.map((feature, index) => (
			<FeatureCard
				key={feature.title}
				{...feature}
				index={index + 1}
				variant={variant}
			/>
		))
}

function Logos({ count = 7 }: { count?: number }) {
	return exampleLogos
		.slice(0, count)
		.map((logo) => <ClientLogo key={logo.name} {...logo} />)
}

// Carousel wraps each child in a slide via React.Children.map, so the array has to
// be passed inline rather than returned from a component.
function quoteCards(count = 5) {
	return testimonials
		.slice(0, count)
		.map((item) => <TestimonialCard key={item.name} {...item} />)
}

export function HomeTemplate() {
	return (
		<>
			<SplitHero
				eyebrow='Software & Automation'
				title={
					<>
						The work your team should{' '}
						<Highlight>never have to do again</Highlight>
					</>
				}
				description='We map how your business actually runs, then build the system that takes the repetitive half of it off your desk. Fixed price, live in weeks, owned by you.'
				actions={[
					{ label: 'Book A Discovery Call', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
				mediaSrc='/scheduler/scheduler.png'
				mediaLabel='Dispatch board'
				backdrop={[
					'/hub/hub.png',
					'/portal/portal.png',
					'/reports/reports.png',
					'/mmc/mmc.png',
					'/omni-u/omni.png',
				]}
			/>
			<Marquee eyebrow='Trusted by' heading='inline'>
				<Logos />
			</Marquee>
			<Grid
				eyebrow='What We Do'
				title='Four ways a build usually pays for itself'
				description='Most engagements start with one of these and grow into the next once the first is running.'
				heading='beside'
				columns={2}>
				<Capabilities count={4} variant='inline' />
			</Grid>
			<FeatureRows
				layout='alternating'
				rows={[
					{
						eyebrow: 'Discovery',
						title: 'We start by watching the work, not the software',
						description:
							'Two weeks with the people doing the job, mapping every system, spreadsheet, and handoff in the chain. You end up with a ranked list of what to build and what each one is worth.',
						points: [
							'Interviews across every team, not just the sponsor',
							'A written map of where the time and the errors go',
							'A fixed price estimate against whatever comes first',
						],
					},
					{
						eyebrow: 'Delivery',
						title: 'Something useful in week three, not month nine',
						description:
							'We build in two week cycles with a working demo at the end of each one. Nothing is saved up for a big reveal, and you can reorder the backlog at any point.',
						points: [
							'A demo every second Friday, no slides',
							'Your team testing it while it is still cheap to change',
							'Data migrated and reconciled before go-live',
						],
					},
				]}
			/>
			<StatBand variant='divided' stats={resultStats} />
			<Spotlight
				eyebrow='Featured Work'
				variant='overlap'
				mediaLabel='The live dispatch board'
				title='One dispatch board for forty drivers'
				summary='Northpoint ran their morning on a whiteboard and three spreadsheets. We replaced all of it with a live board that every depot and driver reads from the same copy of.'
				details={[
					{
						label: 'The problem',
						value:
							'Ninety minutes of manual dispatch every morning, and a run sheet that was out of date by the time it was printed.',
					},
					{
						label: 'The result',
						value:
							'Dispatch now takes eleven minutes, and nobody has rebuilt the board by hand since the week it launched.',
					},
				]}
				linkLabel='Read The Case Study'
			/>
			<Carousel
				eyebrow='What Clients Say'
				title='The part we would want to read first'
				controls='bars'>
				{quoteCards()}
			</Carousel>
			<CtaBand
				design='split'
				title='Find out what is actually worth building.'
				description='Discovery is two weeks, a fixed fee, and yours to keep whether or not we build anything afterwards.'
				actions={[
					{ label: 'Book Discovery', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
			/>
		</>
	)
}

export function OverviewTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Services'
				title='Everything we do, and when each one is the right call'
				description='Four practices that overlap more than they compete. Most companies need one of them now and a second within the year.'
				actions={[
					{ label: 'Book A Discovery Call', href: '/contact' },
					{ label: 'See What It Costs', href: '/pricing' },
				]}
				stats={heroStats}
			/>
			<Grid
				eyebrow='The Practices'
				title='Pick the one that matches the problem you have today'
				description='Each links through to a page covering scope, timelines, and what a typical engagement costs.'
				heading='centered'
				columns={3}>
				<Capabilities count={6} />
			</Grid>
			<TabsShowcase
				eyebrow='How They Fit Together'
				tabStyle='side'
				title='One system, approached from four directions'
				description='These are not separate products. They are the order things usually need to happen in.'
				items={[
					{
						id: 'map',
						label: 'Map It',
						title: 'Discovery comes first, every time',
						body: 'Before anything gets built we spend two weeks understanding how work moves through the business today. It is the cheapest fortnight you will spend, and it is the reason our estimates hold.',
						points: [
							'Every system and spreadsheet written down',
							'Time and error cost measured rather than guessed',
							'A ranked list you could hand to any developer',
						],
					},
					{
						id: 'automate',
						label: 'Automate It',
						title: 'Take out the steps nobody should be doing',
						body: 'The fastest return is almost always removing a handoff rather than building a new tool. We look for those first because they ship in days and pay for themselves in weeks.',
						points: [
							'Approvals and handoffs that run themselves',
							'No more re-keying the same record twice',
							'Errors caught before they leave the building',
						],
					},
					{
						id: 'build',
						label: 'Build It',
						title: 'The tool your team lives in all day',
						body: 'When a process genuinely needs its own software, we build it around how the job is actually done. Internal tools are a different discipline to marketing sites, and they are what we do most.',
						points: [
							'Clickable screens before a line of code',
							'Two week cycles with a demo at the end of each',
							'Designed for people who use it eight hours a day',
						],
					},
					{
						id: 'connect',
						label: 'Connect It',
						title: 'Make the systems you already own talk',
						body: 'Most companies do not need another system. They need the four they have to agree with each other, which is quieter work and usually cheaper than replacing any of them.',
						points: [
							'CRM, finance, and operations reconciled nightly',
							'One definition of a customer across all of them',
							'Reporting that stops contradicting itself',
						],
					},
				]}
			/>
			<ProcessSteps
				eyebrow='How It Works'
				title='The same five steps, whichever practice you start with'
				description='We run every engagement this way because it is the only version we have found that keeps estimates honest.'
				layout='columns'
				steps={deliverySteps.slice(0, 3)}
			/>
			<LogoStrip
				eyebrow='Companies we have done this for'
				variant='bare'
				logos={exampleLogos}
			/>
			<Spotlight
				eyebrow='In Practice'
				variant='split'
				mediaLabel='Quote to draft invoice, untouched'
				title='Quote to invoice in a single pass'
				summary='Ironwood were signing work in the CRM and raising invoices by hand in the finance system four days later. The two had never spoken to each other.'
				details={[
					{
						label: 'What we built',
						value:
							'A sync that turns a signed quote into a draft invoice, with the finance team approving rather than typing.',
					},
					{
						label: 'What changed',
						value:
							'Four days came out of the cycle and month-end reconciliation stopped being a two person job.',
					},
				]}
				linkLabel='Read The Case Study'
			/>
			<FaqAccordion
				eyebrow='Common Questions'
				title='The things everyone asks on the first call'
				description='If yours is not here, the answer is almost certainly that it depends, and discovery is how we find out.'
				layout='split'
				faqs={generalFaqs}
			/>
			<CtaBand
				design='centered'
				title='Not sure which of these you need?'
				description='That is what the first call is for. Thirty minutes, no deck, and a straight answer about whether we are the right people.'
				actions={[
					{ label: 'Book A Call', href: '/contact' },
					{ label: 'See What It Costs', href: '/pricing' },
				]}
			/>
		</>
	)
}

export function ServiceDetailTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Workflow Automation'
				title='Remove the steps nobody should be doing by hand'
				description='Approvals, handoffs, and re-keying are where the week actually goes. This is the practice that finds those steps and takes them out, usually in a fraction of the time a new system would take.'
				actions={[
					{ label: 'Book A Discovery Call', href: '/contact' },
					{ label: 'See What It Costs', href: '/pricing' },
				]}
			/>
			<LogoStrip
				eyebrow='Recently automated for'
				variant='bare'
				logos={exampleLogos.slice(0, 5)}
			/>
			<FeatureRows
				layout='alternating'
				rows={[
					{
						eyebrow: 'Where It Pays',
						title: 'The same record, typed into three systems',
						description:
							'Every business has a point where one person copies data from one screen into another. It is invisible on an org chart and it is usually the most expensive habit in the company.',
						points: [
							'One entry point that feeds everything downstream',
							'Validation that catches the problem at the source',
							'An audit trail that did not exist before',
						],
					},
					{
						eyebrow: 'Where It Pays',
						title: 'Approvals that sit in an inbox for two days',
						description:
							'Most delays are not work, they are waiting. Routing an approval to the right person with the right context turns two days into two minutes without changing who signs off.',
						points: [
							'Routed to the right person automatically',
							'Chased without anyone having to chase',
							'Escalated on a rule rather than on a hunch',
						],
					},
					{
						eyebrow: 'Where It Pays',
						title: 'The report that eats a day every week',
						description:
							'If someone assembles the same numbers by hand every Monday, that is a job for a scheduled query and an email. It is the quickest win in most engagements.',
						points: [
							'Assembled and delivered on its own',
							'One definition everyone agrees on',
							'Nobody rebuilding it from scratch each week',
						],
					},
				]}
			/>
			<ProcessSteps
				eyebrow='How We Run It'
				title='Five steps from the first call to something running live'
				description='The same shape every time, which is exactly why we can quote a fixed price against it.'
				layout='timeline'
				steps={deliverySteps}
			/>
			<ComparisonTable
				eyebrow='How We Compare'
				title='Us, a large agency, or an off-the-shelf tool'
				description='All three are the right answer sometimes. This is the honest version of when each one wins.'
				tableStyle='rules'
				columns={buildVsBuy.columns}
				rows={buildVsBuy.rows}
			/>
			<StatBand variant='divided' stats={resultStats} />
			<Section>
				<TestimonialCard variant='aside' featured {...testimonials[0]} />
			</Section>
			<FaqAccordion
				eyebrow='Before You Ask'
				title='Questions we get on almost every automation project'
				description='If the answer you need is not here, the contact form reaches a person and gets a reply the same day.'
				layout='boxed'
				faqs={generalFaqs.slice(0, 4)}
			/>
			<CtaBand
				design='split'
				title='Start with the two weeks that make the rest predictable.'
				description='Discovery is a fixed fee, it stands on its own, and half of it comes off the build if you go ahead.'
				actions={[
					{ label: 'Book Discovery', href: '/contact' },
					{ label: 'See What It Costs', href: '/pricing' },
				]}
			/>
		</>
	)
}

export function SolutionDetailTemplate() {
	return (
		<>
			<SplitHero
				eyebrow='Operations Platform'
				title={
					<>
						Replace the eleven spreadsheets with{' '}
						<Highlight>one system</Highlight>
					</>
				}
				description='For operations teams who have outgrown what a shared drive can hold together. One place for the work, the data, and the reporting, built around your process rather than a template.'
				actions={[
					{ label: 'Book A Walkthrough', href: '/contact' },
					{ label: 'See A Live Example', href: '/case-studies' },
				]}
				mediaSrc='/hub/hub.png'
				mediaLabel='Operations dashboard'
				backdrop={[
					'/portal/portal.png',
					'/reports/reports.png',
					'/scheduler/scheduler.png',
					'/mmc/mmc.png',
					'/omni-u/omni.png',
				]}
			/>
			<StatBand variant='cards' stats={resultStats} />
			<BeforeAfter
				eyebrow='The Difference'
				title='What changes in the first month'
				variant='rows'
				beforeLabel='Before'
				afterLabel='After'
				before={beforeAfterPoints.before}
				after={beforeAfterPoints.after}
			/>
			<Grid
				eyebrow='What You Get'
				title='Everything included in a standard platform build'
				description='Scope moves with the business, but this is the shape of nearly every engagement.'
				heading='beside'
				columns={2}>
				<Capabilities count={4} variant='inline' />
			</Grid>
			<Spotlight
				eyebrow='Proof'
				variant='stacked'
				mediaLabel='The nightly exception report'
				title='Stock counts that finally agree with reality'
				summary='Stonebridge reconciled two systems by hand once a quarter, which meant three months of drift before anyone noticed a problem. Now it happens nightly and nobody runs it.'
				details={[
					{
						label: 'The problem',
						value:
							'Quarterly reconciliation, a week of work each time, and write-offs discovered long after they could be fixed.',
					},
					{
						label: 'The result',
						value:
							'Nightly reconciliation, a same-day exception report, and write-offs down by a third in the first year.',
					},
				]}
				linkLabel='Read The Case Study'
			/>
			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[0]} />
			</Section>
			<SplitCta
				design='divided'
				paths={[
					{
						eyebrow: 'Ready',
						title: 'You know what needs to change',
						body: 'Book discovery and we will have a scoped, fixed price plan in front of you inside three weeks.',
						cta: 'Book Discovery',
						href: '/contact',
						featured: true,
					},
					{
						eyebrow: 'Still Looking',
						title: 'You want to see one working first',
						body: 'Fair enough. The case studies cover what got built, what it cost, and what actually changed.',
						cta: 'See The Work',
						href: '/case-studies',
					},
				]}
			/>
		</>
	)
}

export function IndustryDetailTemplate() {
	return (
		<>
			<StatHero
				eyebrow='Logistics & Distribution'
				title='Software for companies that move things for a living'
				description='Dispatch, proof of delivery, and stock reconciliation are the three places margin quietly leaks in this sector. We have built for all three.'
				stats={[
					{ value: '18', label: 'Logistics and distribution builds delivered' },
					{
						value: '31 hrs',
						label: 'Given back to the average ops team each week',
					},
					{
						value: '4 days',
						label: 'Typical cut in the quote-to-invoice cycle',
					},
					{ value: '1/3', label: 'Average fall in write-offs in year one' },
				]}
				linkLabel='See A Logistics Case Study'
				linkHref='/case-studies'
			/>
			<Section>
				<SectionHeading
					variant='rule'
					eyebrow='Sound Familiar'
					title='The four problems every operator in this sector has'
					description='If two or more of these are true, there is almost certainly a week a month sitting on the table.'
				/>
				<div className='mx-auto mt-14 grid max-w-4xl gap-x-12 gap-y-4 sm:grid-cols-2'>
					<CheckList
						items={[
							'Dispatch still starts on a whiteboard',
							'Proof of delivery arrives as photos in a group chat',
						]}
					/>
					<CheckList
						items={[
							'Stock is reconciled quarterly, at best',
							'Nobody can say what a job cost until month end',
						]}
					/>
				</div>
			</Section>
			<Grid
				eyebrow='What We Build Here'
				title='The systems this sector asks for most'
				description='Ranked by how often they come up on a first call.'
				columns={3}>
				<Capabilities count={6} variant='numbered' />
			</Grid>
			<Marquee eyebrow='Working with' heading='rule'>
				<Logos count={5} />
			</Marquee>
			<Spotlight
				eyebrow='In This Sector'
				variant='overlap'
				mediaLabel='Morning dispatch, every depot'
				title='One dispatch board for forty drivers'
				summary='Northpoint ran every morning off a whiteboard and three spreadsheets that never agreed. Dispatch took ninety minutes and the run sheet was stale before it printed.'
				details={[
					{
						label: 'What we built',
						value:
							'A live board every depot and driver reads from, with routes, exceptions, and proof of delivery in one place.',
					},
					{
						label: 'What changed',
						value:
							'Dispatch dropped to eleven minutes and nobody has rebuilt the board by hand since launch week.',
					},
				]}
				linkLabel='Read The Case Study'
			/>
			<Section>
				<TestimonialCard variant='aside' featured {...testimonials[0]} />
			</Section>
			<FaqAccordion
				eyebrow='Sector Questions'
				title='What operators ask before they commit'
				description='Mostly about disruption, because nobody can stop dispatching for a fortnight while a system goes in.'
				layout='stacked'
				faqs={generalFaqs}
			/>
			<CtaBand
				design='centered'
				title='Two weeks to find out where the margin is going.'
				description='Discovery in this sector nearly always pays for itself out of the first thing it finds.'
				actions={[
					{ label: 'Book Discovery', href: '/contact' },
					{ label: 'See A Logistics Build', href: '/case-studies' },
				]}
			/>
		</>
	)
}

export function PricingTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Pricing'
				title='Fixed price, agreed before anything gets built'
				description='Day rates reward slow work, so we do not use them. You get a number and a date in writing, and changes get their own conversation rather than quietly moving the total.'
				actions={[{ label: 'Book A Discovery Call', href: '/contact' }]}
			/>
			<PricingTiers
				design='cards'
				eyebrow='Engagements'
				title='Three shapes of work, not a price list'
				description='Most companies start at the top and move down the list as the relationship gets longer.'
				tiers={engagementTiers}
			/>
			<RoiCalculator
				eyebrow='Worth It?'
				layout='split'
				title='What the manual version is costing you now'
				description='Set the inputs to match your team. This is the same arithmetic we run in discovery, minus the interviews.'
				defaultPeople={4}
				defaultHours={7}
				defaultRate={38}
			/>
			<ComparisonTable
				eyebrow='Compare'
				title='Where each option actually wins'
				description='We lose some of these on purpose. If an off-the-shelf tool fits, buy the off-the-shelf tool.'
				tableStyle='zebra'
				columns={buildVsBuy.columns}
				rows={buildVsBuy.rows}
			/>
			<Carousel
				eyebrow='From Clients'
				title='People who have paid these numbers'
				controls='overlay'>
				{quoteCards()}
			</Carousel>
			<FaqAccordion
				eyebrow='Pricing Questions'
				title='The awkward ones, answered properly'
				description='Fixed price is unusual enough that it generates most of the questions we get.'
				layout='boxed'
				faqs={pricingFaqs}
			/>
			<CtaBand
				design='centered'
				title='Get a real number against your actual problem.'
				description='Thirty minutes on a call is usually enough to tell you which tier you are in, and whether it is worth doing at all.'
				actions={[
					{ label: 'Book A Call', href: '/contact' },
					{ label: 'Read The FAQ', href: '/faq' },
				]}
			/>
		</>
	)
}

export function LandingTemplate() {
	return (
		<>
			<SplitHero
				eyebrow='Free Discovery Audit'
				title={
					<>
						Find the week a month <Highlight>hiding in your process</Highlight>
					</>
				}
				description='A ninety minute session where we map one workflow end to end and tell you what it costs to keep doing it by hand. No deck, no pitch, and you keep the map.'
				actions={[{ label: 'Claim Your Session', href: '/contact' }]}
				mediaSrc='/reports/reports.png'
				mediaLabel='Process map output'
				backdrop={[
					'/scheduler/scheduler.png',
					'/hub/hub.png',
					'/portal/portal.png',
					'/mmc/mmc.png',
					'/omni-u/omni.png',
				]}
			/>
			<Marquee eyebrow='Run for teams at' heading='centered'>
				<Logos />
			</Marquee>
			<Section>
				<SectionHeading
					variant='rule'
					eyebrow='What You Get'
					title='Ninety minutes, and something you can act on'
					description='A genuine piece of work rather than a sales call with a nicer name.'
				/>
				<div className='mx-auto mt-14 grid max-w-4xl gap-x-12 gap-y-4 sm:grid-cols-2'>
					<CheckList
						items={[
							'One workflow mapped end to end, on the call',
							'The hours and error cost measured against it',
						]}
					/>
					<CheckList
						items={[
							'Two or three fixes ranked by what they are worth',
							'The map itself, yours to keep and use',
						]}
					/>
				</div>
			</Section>
			<StatBand variant='row' stats={resultStats} />
			<BeforeAfter
				eyebrow='The Shift'
				title='What a mapped process looks like afterwards'
				variant='columns'
				beforeLabel='Today'
				afterLabel='After The Audit'
				before={beforeAfterPoints.before}
				after={beforeAfterPoints.after}
			/>
			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[2]} />
			</Section>
			<LeadCapture
				design='banner'
				title='Not ready for a call?'
				description='Get the same audit as a worksheet and run it yourself. One email, no sequence.'
				cta='Send The Worksheet'
			/>
			<FaqAccordion
				eyebrow='Before You Book'
				title='What actually happens on the session'
				description='Ninety minutes, one workflow, and nothing you have to prepare in advance.'
				layout='boxed'
				faqs={generalFaqs.slice(0, 3)}
			/>
			<CtaBand
				design='centered'
				title='Ninety minutes. One workflow. A real number.'
				description='We run four of these a month. If it turns out there is nothing worth building, we will tell you that too.'
				actions={[{ label: 'Claim Your Session', href: '/contact' }]}
			/>
		</>
	)
}

export function ResourceTemplate() {
	return (
		<>
			<section className='px-6 pb-20 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto grid max-w-6xl items-start gap-14 lg:grid-cols-[1.3fr_1fr]'>
					<div>
						<Badge className='uppercase tracking-widest'>Free Guide</Badge>
						<h1 className='mt-6 font-display text-4xl font-semibold leading-[1.08] text-white sm:text-5xl'>
							The Automation Audit
						</h1>
						<p className='mt-6 text-lg leading-8 text-slate-300'>
							A thirty page worksheet for finding the repetitive work hiding in
							your business, scoring it, and deciding what is actually worth
							automating. The same process we charge for, written down.
						</p>
						<div className='mt-10'>
							<CheckList
								items={[
									'A worked example from a real logistics client',
									'The scoring sheet we use to rank opportunities',
									'How to price the manual version so the case makes itself',
									'Four signs a process should be fixed rather than automated',
								]}
							/>
						</div>
						<p className='mt-10 text-sm text-slate-500'>
							Twelve pages of worksheet, eighteen of worked example. No email
							sequence afterwards.
						</p>
					</div>
					<GlassCard variant='accent' className='h-fit p-8 sm:p-10'>
						<h2 className='font-display text-2xl font-semibold text-white'>
							Send me the guide
						</h2>
						<p className='mt-2 leading-7 text-slate-400'>
							One field, one email, and the PDF arrives immediately.
						</p>
						<div className='mt-8 flex min-h-40 items-center justify-center rounded-lg border border-dashed border-white/15 px-6 text-center text-sm text-slate-500'>
							Form slot: drop the gated download form in here
						</div>
					</GlassCard>
				</div>
			</section>

			<Marquee eyebrow='Used by teams at' heading='inline'>
				<Logos />
			</Marquee>
			<Grid
				eyebrow='Inside The Guide'
				title='What each chapter covers'
				description='Structured so you can run it on one process this afternoon rather than reading it end to end.'
				columns={3}>
				{guideChapters.map((chapter, index) => (
					<FeatureCard
						key={chapter.title}
						{...chapter}
						index={index + 1}
						variant='numbered'
					/>
				))}
			</Grid>
			<StatBand variant='divided' stats={resultStats} />
			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[2]} />
			</Section>
			<FaqAccordion
				eyebrow='About The Guide'
				title='What you are actually signing up for'
				description='One email with the PDF attached, and nothing else unless you ask for it.'
				layout='boxed'
				faqs={[
					{
						question: 'Do I get added to a sequence?',
						answer:
							'No. One email with the PDF attached and that is the end of it, unless you separately subscribe to the monthly piece.',
					},
					{
						question: 'Is this the same thing you charge for?',
						answer:
							'It is the method, written down. What you pay us for is two weeks of interviews and the judgement that comes from having run it sixty times.',
					},
					{
						question: 'How long does it take to work through?',
						answer:
							'About two hours on a single process. The worked example takes another half hour if you want to see it applied before starting.',
					},
					{
						question: 'Can I share it with my team?',
						answer:
							'Please do. It works better with three people in a room than alone, and there is no licence attached to it.',
					},
				]}
			/>
			<CtaBand
				design='centered'
				title='Would rather we just ran it for you?'
				description='Discovery is the same process with our team in the room, and it takes two weeks instead of an afternoon.'
				actions={[
					{ label: 'Book Discovery', href: '/contact' },
					{ label: 'See What It Costs', href: '/pricing' },
				]}
			/>
		</>
	)
}

export function ComparisonTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Compare'
				title='Custom build or off-the-shelf: how to actually decide'
				description='Both are right sometimes. The question is never which is better, it is whether your process is genuinely different enough to be worth paying for.'
				actions={[{ label: 'Talk It Through', href: '/contact' }]}
			/>
			<ComparisonTable
				eyebrow='Side By Side'
				title='The six differences that actually matter'
				description='Everything else on a comparison page is noise. These are the ones that change the decision.'
				tableStyle='accent'
				columns={buildVsBuy.columns}
				rows={buildVsBuy.rows}
			/>
			<FeatureRows
				layout='alternating'
				rows={[
					{
						eyebrow: 'When To Buy',
						title: 'Buy it if the process is genuinely standard',
						description:
							'Payroll, email, accounting, and helpdesk are solved problems. Building your own is almost always the expensive way to end up with something worse.',
						points: [
							'A mature market with several credible options',
							'Your requirements match the demo without caveats',
							'Cost per seat stays sensible at double the headcount',
						],
					},
					{
						eyebrow: 'When To Build',
						title: 'Build it if the process is the business',
						description:
							'When the thing you do differently is the reason customers choose you, forcing it into generic software throws away the advantage you are paying to keep.',
						points: [
							'You are already paying people to work around the tool',
							'The workaround spreadsheet has become load-bearing',
							'Two or more systems need to agree and never do',
						],
					},
				]}
			/>
			<BeforeAfter
				eyebrow='In Practice'
				title='What each option feels like eighteen months in'
				variant='stacked'
				beforeLabel='Off The Shelf'
				afterLabel='Built For You'
				before={[
					"Your process bent to fit somebody else's software",
					'Per-seat pricing that grows faster than the team',
					'The feature you need sits on a roadmap you do not control',
					'Export is possible, but the data model is not yours',
				]}
				after={[
					'Software bent to fit the process you already run',
					'A fixed cost that does not move when you hire',
					'The next feature is a conversation, not a vote',
					'The database, the code, and the accounts are in your name',
				]}
			/>
			<StatBand variant='row' stats={trustStats} />
			<Section>
				<TestimonialCard variant='aside' featured {...testimonials[1]} />
			</Section>
			<FaqAccordion
				eyebrow='Still Deciding'
				title='The questions that usually settle it'
				description='If you are still torn after these, the answer is almost always to buy something cheap and revisit in a year.'
				layout='split'
				faqs={generalFaqs}
			/>
			<SplitCta
				design='cards'
				paths={[
					{
						eyebrow: 'Build',
						title: 'Your process is the differentiator',
						body: 'Discovery will tell you what it costs to build properly, and whether the return justifies it.',
						cta: 'Book Discovery',
						href: '/contact',
						featured: true,
					},
					{
						eyebrow: 'Buy',
						title: 'It sounds like a solved problem',
						body: 'We will happily point you at the tool we would pick and stay out of the way. That call is free.',
						cta: 'Ask Us Which',
						href: '/contact',
					},
				]}
			/>
		</>
	)
}

export function FaqTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Help Center'
				title='Everything people ask before they hire us'
				description='Grouped so you can jump to the part that applies. If the answer you need is not here, the contact form gets a reply the same day.'
			/>
			<Section className='pb-0'>
				<FilterBar
					design='segmented'
					filters={['All', 'Getting Started', 'Pricing', 'Support']}
					resultCount={
						generalFaqs.length + pricingFaqs.length + supportFaqs.length
					}
				/>
			</Section>
			<FaqAccordion
				eyebrow='Getting Started'
				title='Working with us for the first time'
				description='The questions that come up before anyone has signed anything.'
				layout='stacked'
				faqs={generalFaqs}
			/>
			<FaqAccordion
				eyebrow='Pricing'
				title='How the money works'
				description='Fixed price is unusual enough that it generates most of the questions on this page.'
				layout='stacked'
				faqs={pricingFaqs}
			/>
			<LeadCapture
				design='ruled'
				title='Want the long version?'
				description='The engagement handbook covers scope, change control, and what happens when we get an estimate wrong.'
				cta='Send It Over'
			/>
			<FaqAccordion
				eyebrow='After Launch'
				title='Support, ownership, and what happens next'
				description='The part most people forget to ask about until they need it.'
				layout='stacked'
				faqs={supportFaqs}
			/>
			<SplitCta
				design='divided'
				paths={[
					{
						eyebrow: 'Still Stuck',
						title: 'Ask us directly',
						body: 'Anything not covered here gets a written answer the same working day.',
						cta: 'Send A Question',
						href: '/contact',
						featured: true,
					},
					{
						eyebrow: 'Ready',
						title: 'Skip ahead and book the call',
						body: 'Thirty minutes is usually enough to know whether this is worth pursuing.',
						cta: 'Book A Call',
						href: '/contact',
					},
				]}
			/>
		</>
	)
}

export function BookingTemplate() {
	return (
		<>
			<ContactSplit
				layout='reversed'
				eyebrow='Book A Call'
				title='Thirty minutes, and a straight answer'
				description='A call with the person who would run your project. No sales team, no deck, and no follow-up sequence if it turns out we are not a fit.'
				email='hello@example.com'
				steps={[
					{
						title: '1. Pick a time',
						body: 'Live availability, so nothing gets double booked or moved on you afterwards.',
					},
					{
						title: '2. Answer three questions',
						body: 'Just enough context that we can be useful in the first five minutes.',
					},
					{
						title: '3. Get the invite',
						body: 'A calendar invite with the call link lands straight away.',
					},
				]}
				form={
					<div className='flex h-full min-h-80 items-center justify-center text-center text-sm text-slate-500'>
						Calendar slot: drop the scheduling widget in here
					</div>
				}
			/>
			<Marquee eyebrow='Calls booked by' heading='inline'>
				<Logos />
			</Marquee>
			<BeforeAfter
				eyebrow='What To Expect'
				title='Both sides of the half hour'
				variant='columns'
				beforeLabel='What we cover'
				afterLabel='What to have ready'
				before={[
					'The process causing the most pain right now',
					'Roughly what it costs you today in hours and errors',
					'Whether this is a build, a fix, or leave it alone',
					'What discovery would look like and what it would cost',
				]}
				after={[
					'A rough headcount for the team involved',
					'Which systems are already in play, spreadsheets included',
					'Any budget range you have in mind, even a wide one',
					'Anyone else who would need to be on the next call',
				]}
			/>
			<StatBand variant='row' stats={trustStats} />
			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[1]} />
			</Section>
			<FaqAccordion
				eyebrow='Before You Book'
				title='The last few things people check'
				description='Nothing on this call is recorded, and nobody else joins it unless you ask them to.'
				layout='boxed'
				faqs={generalFaqs.slice(0, 4)}
			/>
		</>
	)
}

export function ProcessTemplate() {
	return (
		<>
			<PageHero
				eyebrow='How We Work'
				title='Five steps, and no surprises in any of them'
				description='Every engagement runs the same way. It is the only version we have found that keeps a fixed price honest and lets you change your mind while it is still cheap to.'
				actions={[
					{ label: 'Book A Discovery Call', href: '/contact' },
					{ label: 'See What It Costs', href: '/pricing' },
				]}
			/>
			<ProcessSteps
				eyebrow='Step By Step'
				title='From the first call to thirty days after launch'
				description='Roughly fourteen weeks end to end for a first build, though discovery alone is often enough to change what you do next.'
				layout='timeline'
				steps={deliverySteps}
			/>
			<BeforeAfter
				eyebrow='Who Does What'
				title='A project only stays on schedule if both sides show up'
				variant='columns'
				beforeLabel='What we handle'
				afterLabel='What we need from you'
				before={engagementSplit.ours}
				after={engagementSplit.yours}
			/>
			<StatBand variant='divided' stats={resultStats} />
			<Spotlight
				eyebrow='A Project End To End'
				variant='stacked'
				mediaLabel='One approval, four systems'
				title='Onboarding cut from nine days to one'
				summary='Copperline is a good example of the whole process running as intended: two weeks of discovery, six weeks of build, and a thirty day review that added two things nobody had thought of at the start.'
				details={[
					{
						label: 'Discovery found',
						value:
							'Six separate emails and four systems behind a single approval, none of which anyone had mapped before.',
					},
					{
						label: 'The build delivered',
						value:
							'One approval that triggers contracts, accounts, and equipment requests, with onboarding down from nine days to one.',
					},
				]}
				linkLabel='Read The Case Study'
			/>
			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[3]} />
			</Section>
			<FaqAccordion
				eyebrow='Process Questions'
				title='How this holds up when something goes wrong'
				description='No project runs perfectly. These are the answers for when it does not.'
				layout='split'
				faqs={[...generalFaqs.slice(0, 2), ...pricingFaqs.slice(1, 3)]}
			/>
			<CtaBand
				design='centered'
				title='Start at step one.'
				description='Discovery is two weeks and a fixed fee, and you keep the output whether or not we build anything after it.'
				actions={[
					{ label: 'Book Discovery', href: '/contact' },
					{ label: 'See What It Costs', href: '/pricing' },
				]}
			/>
		</>
	)
}
