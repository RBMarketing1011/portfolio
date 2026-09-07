import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import {
	BentoGrid,
	Breadcrumbs,
	CaseStudyCard,
	CheckList,
	Chips,
	ClientLogo,
	CtaBand,
	FaqAccordion,
	FeatureCard,
	FilterBar,
	Grid,
	LeadCapture,
	Marquee,
	Masonry,
	MediaGallery,
	PageHero,
	Pagination,
	ProcessSteps,
	RelatedCard,
	Section,
	SectionHeading,
	SplitCta,
	StatBand,
	TeamCard,
	TestimonialCard,
	exampleLogos,
} from '@/components/sections'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import {
	careerBenefits,
	caseStudies,
	heroStats,
	hiringSteps,
	people,
	relatedReading,
	resultStats,
	studioServices,
	teamPractices,
	testimonials,
	trustStats,
	valueTiles,
} from './content'

function Logos({ count = 7 }: { count?: number }) {
	return exampleLogos
		.slice(0, count)
		.map((logo) => <ClientLogo key={logo.name} {...logo} />)
}

function Projects({
	count = 6,
	variant,
}: {
	count?: number
	variant?: 'stacked' | 'overlay' | 'row'
}) {
	return caseStudies
		.slice(0, count)
		.map((item) => (
			<CaseStudyCard key={item.name} {...item} variant={variant} />
		))
}

function People({
	count = 4,
	variant,
}: {
	count?: number
	variant?: 'card' | 'portrait' | 'row'
}) {
	return people
		.slice(0, count)
		.map((person) => (
			<TeamCard key={person.name} {...person} variant={variant} />
		))
}

export function CaseStudyDetailTemplate() {
	return (
		<>
			<section className='px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-6xl'>
					<Breadcrumbs
						variant='pill'
						items={[
							{ label: 'Home', href: '/' },
							{ label: 'Case Studies', href: '/case-studies' },
							{ label: 'Northpoint Logistics' },
						]}
					/>
					<h1 className='mt-8 max-w-4xl font-display text-4xl font-semibold leading-[1.08] text-white sm:text-5xl'>
						One dispatch board for forty drivers
					</h1>
					<p className='mt-6 max-w-2xl text-lg leading-8 text-slate-300'>
						Northpoint ran every morning off a whiteboard and three spreadsheets
						that never agreed with each other. We replaced all of it with a live
						board that every depot and driver reads from the same copy of.
					</p>
					<dl className='mt-12 grid gap-8 border-t border-white/10 pt-10 sm:grid-cols-4'>
						{[
							{ label: 'Client', value: 'Northpoint Logistics' },
							{ label: 'Sector', value: 'Logistics & Distribution' },
							{ label: 'Engagement', value: 'Discovery + First Build' },
							{ label: 'Delivered', value: 'Eleven weeks, 2025' },
						].map((item) => (
							<div key={item.label}>
								<dt className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
									{item.label}
								</dt>
								<dd className='mt-2 leading-7 text-slate-200'>{item.value}</dd>
							</div>
						))}
					</dl>
					<GlassCard className='mt-12 aspect-video w-full overflow-hidden'>
						<div className='flex h-full items-center justify-center text-sm text-slate-500'>
							Media slot: hero screenshot or product video
						</div>
					</GlassCard>
				</div>
			</section>

			<StatBand variant='divided' stats={resultStats} />

			<Section>
				<div className='grid gap-14 lg:grid-cols-[1.5fr_1fr]'>
					<div className='space-y-12'>
						<div>
							<h2 className='font-display text-2xl font-semibold text-white'>
								The challenge
							</h2>
							<p className='mt-4 leading-8 text-slate-400'>
								Dispatch took ninety minutes every morning and produced a run
								sheet that was already out of date by the time it printed.
								Drivers phoned in for changes, the office rewrote the board by
								hand, and nobody could say where a vehicle was without making
								two calls. Three separate spreadsheets held the schedule, the
								vehicle list, and the customer promises, and none of them
								agreed.
							</p>
						</div>
						<div>
							<h2 className='font-display text-2xl font-semibold text-white'>
								The approach
							</h2>
							<p className='mt-4 leading-8 text-slate-400'>
								Two weeks of discovery sat with the dispatch team through four
								mornings. The real constraint turned out not to be routing but
								the phone calls, so the first release did nothing clever with
								optimization and everything possible to remove the need to ring
								anyone. Drivers got a read-only view on their phones before the
								office got its new board.
							</p>
						</div>
						<div>
							<h2 className='font-display text-2xl font-semibold text-white'>
								What was delivered
							</h2>
							<div className='mt-5'>
								<CheckList
									items={[
										'A live dispatch board shared across all three depots',
										"Driver app with the day's run and proof of delivery capture",
										'Automatic customer notifications on dispatch and arrival',
										'Nightly reconciliation against the finance system',
									]}
								/>
							</div>
						</div>
					</div>

					<aside className='space-y-5 lg:sticky lg:top-28 lg:self-start'>
						<GlassCard className='p-7'>
							<Chips
								label='Built with'
								variant='outline'
								items={[
									'Next.js',
									'PostgreSQL',
									'Mapbox',
									'Twilio',
									'Xero API',
									'Vercel',
								]}
							/>
						</GlassCard>
						<GlassCard className='p-7'>
							<p className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
								Scope
							</p>
							<ul className='mt-4 space-y-2 text-slate-300'>
								<li>Discovery and process mapping</li>
								<li>Product design and prototyping</li>
								<li>Web application and driver app</li>
								<li>Data migration from three spreadsheets</li>
								<li>Training and thirty day support</li>
							</ul>
						</GlassCard>
					</aside>
				</div>
			</Section>

			<MediaGallery
				eyebrow='The Build'
				thumbnails='side'
				title='What the team actually uses every morning'
				description='Four screens carry ninety percent of the daily work. Everything else sits behind them.'
				items={[
					{
						src: '/scheduler/scheduler.png',
						alt: '',
						caption: 'The dispatch board, shared across all three depots',
					},
					{
						src: '/hub/hub.png',
						alt: '',
						caption: 'Vehicle and driver availability at a glance',
					},
					{
						src: '/portal/portal.png',
						alt: '',
						caption: 'Customer portal showing live delivery status',
					},
					{
						src: '/reports/reports.png',
						alt: '',
						caption: 'Weekly performance report, assembled automatically',
					},
				]}
			/>

			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[0]} />
			</Section>

			<Grid
				eyebrow='More Work'
				title='Other projects in this sector'
				columns={3}>
				{relatedReading.map((item) => (
					<RelatedCard key={item.title} {...item} variant='thumbnail' />
				))}
			</Grid>

			<CtaBand
				design='split'
				title='Got a morning that runs on a whiteboard?'
				description='Discovery is two weeks and a fixed fee. It usually pays for itself out of the first thing it finds.'
				actions={[
					{ label: 'Book Discovery', href: '/contact' },
					{ label: 'See More Work', href: '/case-studies' },
				]}
			/>
		</>
	)
}

export function IndexListingTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Case Studies'
				title='Work we can talk about'
				description='Every project here shipped, is still running, and had a number attached to it before we started. The ones we cannot name are not on this page.'
				stats={heroStats}
			/>
			<Section className='pb-0'>
				<FilterBar
					design='underline'
					filters={[
						'All',
						'Internal Tools',
						'Automation',
						'Integration',
						'Reporting',
					]}
					resultCount={caseStudies.length}
				/>
			</Section>
			<Grid columns={3}>
				<Projects />
			</Grid>
			<Section className='pt-0'>
				<Pagination design='spread' page={1} totalPages={4} />
			</Section>
			<Marquee eyebrow='Featured here' heading='inline'>
				<Logos />
			</Marquee>
			<LeadCapture
				design='ruled'
				title='New case study roughly every month'
				description='One email when a project goes live, with the numbers rather than the press release.'
				cta='Keep Me Posted'
			/>
		</>
	)
}

export function AboutTemplate() {
	return (
		<>
			<PageHero
				eyebrow='About'
				title='A small team that would rather talk you out of it'
				description='We build operations software for companies who have outgrown their spreadsheets. Nine years, forty-odd clients, and a strong preference for the smallest thing that works.'
				actions={[
					{ label: 'Work With Us', href: '/contact' },
					{ label: 'See The Work', href: '/case-studies' },
				]}
				stats={heroStats}
			/>
			<Section>
				<SectionHeading
					variant='split'
					eyebrow='The Story'
					title='It started with one spreadsheet that would not die'
					description='Nine years later the answer has not really changed: find the work nobody should be doing, and take it out.'
				/>
				<div className='mt-12 grid gap-10 text-lg leading-8 text-slate-400 lg:grid-cols-2 lg:gap-16'>
					<div className='space-y-6'>
						<p>
							The first project was a scheduling sheet that four people edited
							at once and nobody trusted. It had grown for six years, it ran a
							thirty person business, and it broke roughly every second Friday.
							Replacing it took eleven weeks and gave the operations manager her
							evenings back.
						</p>
						<p>
							Almost every engagement since has looked like a version of that.
							The tools change and the sector changes, but the shape does not:
							something load-bearing has been built by accident, and everyone is
							quietly working around it.
						</p>
					</div>
					<div className='space-y-6'>
						<p>
							We stayed small on purpose. There is no account layer, no sales
							team, and no junior developer learning on your budget. The person
							who scopes your project is the person who builds it and the person
							who answers when something breaks two years later.
						</p>
						<p>
							The part that surprises people is how often we recommend doing
							nothing. Roughly one discovery in five ends with us saying the
							problem is a process rather than a product. That call costs us the
							build and keeps the relationship, which has turned out to be the
							better trade.
						</p>
					</div>
				</div>
			</Section>
			<BentoGrid
				eyebrow='How We Work'
				tileStyle='divided'
				title='Six things we will not compromise on'
				description='These are the reasons projects finish, and the reasons we occasionally turn work down.'
				tiles={valueTiles}
			/>
			<StatBand variant='row' stats={trustStats} />
			<Grid
				eyebrow='The Team'
				title='Four people, and all four of them build'
				description='Everyone here writes code or designs the thing being coded. Nobody is only in meetings.'
				heading='centered'
				columns={4}>
				<People />
			</Grid>
			<Marquee eyebrow='Worked with' heading='rule'>
				<Logos />
			</Marquee>
			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[1]} />
			</Section>
			<CtaBand
				design='split'
				title='Start with two weeks and no commitment.'
				description='Discovery stands on its own. If it says do not build anything, that is a good outcome and you keep the map.'
				actions={[
					{ label: 'Book Discovery', href: '/contact' },
					{ label: 'Meet The Team', href: '/team' },
				]}
			/>
		</>
	)
}

export function TeamTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Team'
				title='The four people who would actually build it'
				description='No account managers, no bench, and no handover to someone you have never met. This is the whole company.'
				actions={[{ label: 'See Open Roles', href: '/careers' }]}
				stats={trustStats.map(({ value, label }) => ({ value, label }))}
			/>
			<Grid
				eyebrow='Who We Are'
				title='Everyone here ships'
				description='Between them, roughly forty years of building software for operations teams.'
				heading='centered'
				columns={4}>
				<People variant='portrait' />
			</Grid>
			<Section>
				<SectionHeading
					variant='rule'
					eyebrow='Between Us'
					title='Roughly forty years of this, split four ways'
					description='Everyone here has spent most of their career on operations software rather than on marketing sites, which is a genuinely different discipline.'
				/>
				<div className='mx-auto mt-14 grid max-w-4xl gap-x-12 gap-y-4 sm:grid-cols-2'>
					<CheckList
						items={[
							'Sixty-plus processes mapped in discovery',
							'Integrations against every major finance system',
							'Twelve years of it in regulated industries',
						]}
					/>
					<CheckList
						items={[
							'Four people who have all run a project end to end',
							'Nobody who has only ever worked at an agency',
							'One of us still on call for a system built in 2019',
						]}
					/>
				</div>
			</Section>
			<BentoGrid
				eyebrow='How We Run'
				tileStyle='numbered'
				title='The working agreement, written down'
				description='Most of this exists because one of us got it wrong somewhere and we decided not to repeat it.'
				tiles={teamPractices}
			/>
			<StatBand variant='divided' stats={trustStats} />
			<Section>
				<TestimonialCard variant='aside' featured {...testimonials[4]} />
			</Section>
			<SplitCta
				design='rows'
				paths={[
					{
						eyebrow: 'Hiring',
						title: 'Want to be the fifth?',
						body: 'We hire roughly once a year, we tell you the salary on the first call, and the working session is paid.',
						cta: 'See Open Roles',
						href: '/careers',
						featured: true,
					},
					{
						eyebrow: 'Working Together',
						title: 'Want us on your project instead?',
						body: 'Two of us are usually free within a month. Discovery is the fastest way to find out if it is a fit.',
						cta: 'Book A Call',
						href: '/contact',
					},
				]}
			/>
		</>
	)
}

export function TestimonialsTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Client Feedback'
				title='What people say once the project is finished'
				description='Unedited, attributed, and collected at the thirty day review rather than on the day we invoiced.'
				stats={[
					{ value: '4.9 / 5', label: 'Average score at the thirty day review' },
					{
						value: '94%',
						label: 'Come back with a second project inside a year',
					},
					{ value: '40+', label: 'Companies we have delivered for since 2017' },
				]}
			/>
			<Marquee eyebrow='Quotes from' heading='inline'>
				<Logos />
			</Marquee>
			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[0]} />
			</Section>
			<Section className='pb-0'>
				<FilterBar
					design='segmented'
					filters={['All', 'Operations', 'Finance', 'Product', 'Logistics']}
					resultCount={testimonials.length}
				/>
			</Section>
			{/* Masonry rather than a grid: quote lengths vary too much for equal rows.
			    Slice past the first, which is already featured above. */}
			<Masonry columns={3}>
				{testimonials.slice(1).map((item) => (
					<TestimonialCard key={item.name} {...item} />
				))}
			</Masonry>
			<Section className='pt-0'>
				<Pagination design='numbers' page={1} totalPages={6} />
			</Section>
			<StatBand variant='divided' stats={resultStats} />
			<CtaBand
				design='split'
				title='Talk to one of them directly.'
				description='We will put you in touch with a client in your sector before you commit to anything. No script, no supervision.'
				actions={[
					{ label: 'Ask For A Reference', href: '/contact' },
					{ label: 'Read The Case Studies', href: '/case-studies' },
				]}
			/>
		</>
	)
}

export function CareersTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Careers'
				title='Four people. Occasionally five.'
				description='We hire about once a year and we take it seriously when we do. Salary on the first call, a paid working session instead of a take-home, and an answer within a week.'
				actions={[
					{ label: 'See Open Roles', href: '/careers' },
					{ label: 'Meet The Team', href: '/team' },
				]}
				stats={[
					{
						value: '4 days',
						label: 'Delivery week, with Fridays for the backlog',
					},
					{ value: '4.2 yrs', label: 'Average time people stay here' },
					{ value: '100%', label: 'Remote, with two weeks a year together' },
				]}
			/>
			<Section>
				<SectionHeading
					variant='rule'
					eyebrow='Why Here'
					title='The honest pitch, including the bad parts'
					description='A small company is a genuinely different job. Some of this will read as a downside, and it should.'
				/>
				<div className='mx-auto mt-14 grid max-w-4xl gap-x-12 gap-y-4 sm:grid-cols-2'>
					<CheckList
						items={[
							'You own projects end to end, from discovery to support',
							'You talk to clients directly, every week',
							'Nobody hands you a ticket with the thinking already done',
						]}
					/>
					<CheckList
						items={[
							'There is no ladder to climb, because there is no ladder',
							'You will occasionally do work that is not your specialty',
							'Two projects at once, maximum, and we hold that line',
						]}
					/>
				</div>
			</Section>
			<Grid
				eyebrow='The Package'
				title='What you actually get'
				description='Short list, because most of it is the absence of things rather than the presence of perks.'
				heading='beside'
				columns={2}>
				{careerBenefits.map((item) => (
					<FeatureCard key={item.title} {...item} variant='inline' />
				))}
			</Grid>
			<Section>
				<SectionHeading
					eyebrow='Open Roles'
					title='Two positions, both open now'
					description='If neither fits and you would still be a good addition, the last line on this page is for you.'
				/>
				<div className='mt-12 space-y-4'>
					{[
						{
							title: 'Senior Full Stack Engineer',
							meta: 'Engineering · Remote (UK/EU) · £75k–£95k',
							blurb:
								'TypeScript, Postgres, and a lot of integration work. You would own two projects end to end.',
						},
						{
							title: 'Product Designer',
							meta: 'Design · Remote (UK/EU) · £60k–£78k',
							blurb:
								'Designing internal tools people use for eight hours a day. Very different to designing a homepage.',
						},
					].map((role) => (
						<GlassCard
							key={role.title}
							className='flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8'>
							<div className='min-w-0'>
								<p className='font-display text-xl font-semibold text-white'>
									{role.title}
								</p>
								<p className='mt-2 text-sm text-brand'>{role.meta}</p>
								<p className='mt-3 leading-7 text-slate-400'>{role.blurb}</p>
							</div>
							<Button
								asChild
								variant='outline'
								className='w-full shrink-0 border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white sm:w-auto'>
								<Link href='/careers'>
									View Role <ArrowRight />
								</Link>
							</Button>
						</GlassCard>
					))}
				</div>
				<p className='mt-8 leading-8 text-slate-400'>
					Neither of these you? Send us something you have built and a paragraph
					on why. We read all of them and we reply to all of them.
				</p>
			</Section>
			<ProcessSteps
				eyebrow='Hiring Process'
				title='Three steps, about two weeks'
				description='No panel interview, no whiteboard, and no unpaid take-home exercise at any point.'
				layout='timeline'
				steps={hiringSteps}
			/>
			<StatBand variant='row' stats={trustStats} />
			<Section>
				<TestimonialCard
					variant='bare'
					featured
					quote='I joined from a company of four hundred and the difference is that here I can see what my work did. That took some getting used to.'
					name='Ben Harrow'
					role='Lead Engineer'
					company='Joined 2022'
				/>
			</Section>
			<CtaBand
				design='centered'
				title='Think you would be a good fifth?'
				description='Applications go straight to the person you would work with, and everyone gets a reply within five working days.'
				actions={[
					{ label: 'Apply Now', href: '/careers' },
					{ label: 'Meet The Team', href: '/team' },
				]}
			/>
		</>
	)
}

export function LocationTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Manchester'
				title='Our northern studio'
				description='Four minutes from Piccadilly, above the print works on Ducie Street. Discovery workshops run from here, and you are welcome to use the room even when we are not in it.'
				actions={[
					{ label: 'Get Directions', href: '/contact' },
					{ label: 'Book The Room', href: '/contact' },
				]}
			/>
			<Section className='pt-0'>
				<div className='grid gap-5 lg:grid-cols-[1.6fr_1fr]'>
					<GlassCard className='min-h-80 overflow-hidden lg:min-h-104'>
						<div className='flex h-full items-center justify-center px-6 text-center text-sm text-slate-500'>
							Map slot: drop the embedded map in here
						</div>
					</GlassCard>
					<div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-1'>
						<GlassCard className='p-7'>
							<p className='eyebrow'>Address</p>
							<address className='mt-4 not-italic leading-7 text-slate-300'>
								Second Floor, The Print Works
								<br />
								18 Ducie Street
								<br />
								Manchester M1 2JW
							</address>
							<p className='mt-5 text-sm text-slate-500'>
								Step-free access via the Ducie Street entrance. Two accessible
								parking bays behind the building.
							</p>
						</GlassCard>
						<GlassCard className='p-7'>
							<p className='eyebrow'>Opening Hours</p>
							<dl className='mt-4 space-y-2 text-sm'>
								{[
									{ day: 'Monday to Thursday', hours: '08:30 — 17:30' },
									{ day: 'Friday', hours: '08:30 — 14:00' },
									{ day: 'Saturday', hours: 'By appointment' },
									{ day: 'Sunday', hours: 'Closed' },
								].map((row) => (
									<div key={row.day} className='flex justify-between gap-4'>
										<dt className='text-slate-400'>{row.day}</dt>
										<dd className='text-slate-200'>{row.hours}</dd>
									</div>
								))}
							</dl>
						</GlassCard>
					</div>
				</div>
			</Section>
			<Section>
				<SectionHeading
					variant='rule'
					eyebrow='Service Area'
					title='Where we work from this studio'
					description='On site within ninety minutes of the door, which covers most of the north west and a good part of Yorkshire.'
				/>
				<div className='mx-auto mt-12 max-w-3xl'>
					<Chips
						label='Regularly on site in'
						variant='solid'
						items={[
							'Manchester',
							'Salford',
							'Stockport',
							'Warrington',
							'Bolton',
							'Liverpool',
							'Leeds',
							'Sheffield',
							'Preston',
						]}
					/>
				</div>
			</Section>
			<Grid
				eyebrow='At This Studio'
				title='What actually happens here'
				description='Most delivery is remote. This is the part that works better with everyone around one wall.'
				columns={3}>
				{studioServices.map((item) => (
					<FeatureCard key={item.title} {...item} />
				))}
			</Grid>
			<StatBand variant='divided' stats={resultStats} />
			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[4]} />
			</Section>
			<FaqAccordion
				eyebrow='Visiting'
				title='Getting here and what to expect'
				description='Parking, access, and whether you can use the room when we are not in it.'
				layout='boxed'
				faqs={[
					{
						question: 'Where should I park?',
						answer:
							'The Ducie Street multi-storey is thirty seconds away and we validate the first three hours. There are two accessible bays behind the building, which are worth reserving when you book.',
					},
					{
						question: 'Is the studio step-free?',
						answer:
							'Yes, via the Ducie Street entrance and the lift. The workshop room, kitchen, and toilets are all on the same floor.',
					},
					{
						question: 'Can we use the room without you?',
						answer:
							'Clients can book the workshop room free of charge whenever it is empty. Coffee is included and the whiteboard wall is the whole point.',
					},
					{
						question: 'Do you travel to us instead?',
						answer:
							'Usually, yes. Discovery works better in your building than in ours, so we come to you for the interviews and use this room for the readout.',
					},
				]}
			/>
			<CtaBand
				design='split'
				title='Come in for the first conversation.'
				description='Ninety minutes, a whiteboard, and no obligation to do anything afterwards.'
				actions={[
					{ label: 'Book The Room', href: '/contact' },
					{ label: 'Get Directions', href: '/contact' },
				]}
			/>
		</>
	)
}
