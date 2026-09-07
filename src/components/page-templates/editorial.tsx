import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import {
	ArticleCard,
	AuthorBio,
	Breadcrumbs,
	Callout,
	Chips,
	ContactSplit,
	FaqAccordion,
	Figure,
	Grid,
	LeadCapture,
	Marquee,
	Pagination,
	ProseBlock,
	RelatedCard,
	Section,
	SectionHeading,
	StatBand,
	TableOfContents,
	TestimonialCard,
	ClientLogo,
	exampleLogos,
} from '@/components/sections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GlassCard } from '@/components/ui/glass-card'
import {
	articles,
	generalFaqs,
	relatedReading,
	testimonials,
	trustStats,
} from './content'

function Logos({ count = 7 }: { count?: number }) {
	return exampleLogos
		.slice(0, count)
		.map((logo) => <ClientLogo key={logo.name} {...logo} />)
}

function RelatedReading() {
	return relatedReading.map((item) => (
		<RelatedCard key={item.title} {...item} variant='thumbnail' />
	))
}

export function BlogPostTemplate() {
	return (
		<>
			<section className='px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-3xl'>
					<Breadcrumbs
						variant='slash'
						items={[
							{ label: 'Home', href: '/' },
							{ label: 'Blog', href: '/blog' },
							{ label: 'Automation' },
						]}
					/>
					<Badge className='mt-8 uppercase tracking-widest'>Automation</Badge>
					<h1 className='mt-6 font-display text-4xl font-semibold leading-[1.1] text-white sm:text-5xl'>
						Most automation projects fail before anyone writes code
					</h1>
					<p className='mt-6 text-lg leading-8 text-slate-300'>
						The problem is almost never the technology. It is that nobody agreed
						what the process was before trying to automate it, and automating a
						process nobody agrees on just makes the disagreement faster.
					</p>
					<div className='mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-500'>
						<span className='text-slate-300'>Marcus Reynolds</span>
						<span>·</span>
						<time dateTime='2026-02-11'>11 February 2026</time>
						<span>·</span>
						<span>7 min read</span>
					</div>
				</div>
			</section>

			<Section>
				<div className='mx-auto grid max-w-6xl gap-14 lg:grid-cols-[16rem_1fr]'>
					<TableOfContents
						design='numbered'
						items={[
							{ id: 'the-pattern', label: 'The pattern nobody names' },
							{ id: 'why-it-happens', label: 'Why it keeps happening' },
							{ id: 'what-to-do', label: 'What to do instead' },
						]}
					/>
					<div className='min-w-0'>
						<ProseBlock headings='ruled'>
							<p>
								We have run discovery on somewhere north of sixty processes now,
								and the failure mode is remarkably consistent. Somebody
								identifies a repetitive task, gets budget to automate it, and
								six weeks later discovers that three departments were doing it
								three different ways and all of them were correct.
							</p>
							<h2 id='the-pattern'>The pattern nobody names</h2>
							<p>
								The request always arrives fully formed. Automate the onboarding
								flow. Automate the invoice approval. The word automate is doing
								an enormous amount of work in those sentences, because it
								assumes there is a single, agreed thing to automate. There
								usually is not.
							</p>
							<p>
								What exists instead is a process that has been patched by
								whoever happened to be in the room, four or five times over a
								decade, with the exceptions living in somebody&rsquo;s head. The
								documentation, if it exists, describes an arrangement that
								stopped being true in 2019.
							</p>
						</ProseBlock>
						<Figure
							design='framed'
							src='/hub/hub.png'
							alt=''
							caption='The system that came out of one of these. The fortnight of mapping that produced it is the part nobody budgets for.'
						/>
						<ProseBlock headings='ruled'>
							<h2 id='why-it-happens'>Why it keeps happening</h2>
							<p>
								Because mapping is boring and building is fun. Because the
								budget is easier to get for software than for two weeks of
								asking questions. And because the person requesting the
								automation is rarely the person doing the work, so the version
								they describe is the version they can see.
							</p>
						</ProseBlock>
						<Callout design='rule' label='The short version'>
							If you cannot draw the process on one page and have every person
							who touches it agree with the drawing, you are not ready to
							automate it. That drawing is cheaper than the rebuild.
						</Callout>
						<ProseBlock headings='ruled'>
							<h2 id='what-to-do'>What to do instead</h2>
							<p>
								Spend the fortnight. Sit with the people doing the job, not the
								people who own the budget. Write down what actually happens,
								including the exceptions, and get everyone to agree it is
								accurate before anything gets built.
							</p>
							<p>
								About one time in five, that exercise ends the project, because
								the map makes it obvious that the process itself is the problem
								and no amount of software will fix it. That is a good outcome
								and it costs two weeks instead of two quarters.
							</p>
						</ProseBlock>
						<AuthorBio
							design='bare'
							className='mt-14'
							name='Marcus Reynolds'
							role='Founder & Principal Engineer'
							bio='Fifteen years building operations software, mostly for companies who had outgrown their spreadsheets. Writes here about the parts that go wrong.'
							linkLabel='More from Marcus'
						/>
					</div>
				</div>
			</Section>

			<LeadCapture
				design='banner'
				title='One piece like this a month'
				description='No sequences, no webinars, and an unsubscribe link that works on the first click.'
				cta='Subscribe'
			/>
			<Grid eyebrow='Keep Reading' title='Related pieces' columns={3}>
				<RelatedReading />
			</Grid>
		</>
	)
}

export function AuthorTemplate() {
	return (
		<>
			<section className='px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-5xl'>
					<Breadcrumbs
						variant='slash'
						items={[
							{ label: 'Home', href: '/' },
							{ label: 'Blog', href: '/blog' },
							{ label: 'Marcus Reynolds' },
						]}
					/>
					<div className='mt-10 flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-10'>
						<span className='flex size-28 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/5 text-sm text-slate-500'>
							Photo
						</span>
						<div className='min-w-0'>
							<h1 className='font-display text-4xl font-semibold leading-tight text-white sm:text-5xl'>
								Marcus Reynolds
							</h1>
							<p className='mt-3 text-lg text-brand'>
								Founder & Principal Engineer
							</p>
							<p className='mt-6 max-w-2xl text-lg leading-8 text-slate-300'>
								Fifteen years building operations software, mostly for companies
								who had outgrown their spreadsheets. Writes here about the parts
								of that work that go wrong, which is most of the interesting
								parts.
							</p>
							<div className='mt-8 flex flex-wrap gap-3'>
								<Button
									asChild
									variant='outline'
									className='border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
									<Link href='/contact'>Get In Touch</Link>
								</Button>
								<Button
									asChild
									variant='outline'
									className='border-white/20 bg-transparent text-slate-100 hover:bg-white/5 hover:text-white'>
									<Link href='/about'>About The Studio</Link>
								</Button>
							</div>
						</div>
					</div>
					<div className='mt-12'>
						<Chips
							label='Writes about'
							variant='inline'
							items={[
								'Automation',
								'Discovery',
								'Estimating',
								'Internal Tools',
								'Integration',
							]}
						/>
					</div>
					<dl className='mt-12 grid gap-8 border-t border-white/10 pt-10 sm:grid-cols-3'>
						{[
							{ value: '48', label: 'Pieces published since 2019' },
							{
								value: '9 yrs',
								label: 'Building software for operations teams',
							},
							{ value: '60+', label: 'Processes mapped in discovery' },
						].map((item) => (
							<div key={item.value}>
								<dt className='font-display text-2xl font-semibold text-brand'>
									{item.value}
								</dt>
								<dd className='mt-2 leading-7 text-slate-400'>{item.label}</dd>
							</div>
						))}
					</dl>
				</div>
			</section>

			<Grid
				eyebrow='Latest'
				title='Everything by Marcus'
				description='Newest first. Roughly one piece a month, and none of them are announcements.'
				columns={3}>
				{articles.slice(0, 6).map((item) => (
					<ArticleCard key={item.title} {...item} />
				))}
			</Grid>
			<Section className='pt-0'>
				<Pagination design='compact' page={1} totalPages={8} />
			</Section>
			<Marquee eyebrow='Referenced here' heading='inline'>
				<Logos />
			</Marquee>
			<LeadCapture
				design='ruled'
				title='Get new pieces by email'
				description='One a month, straight from the drafts folder. No sequence and no webinar invitation.'
				cta='Subscribe'
			/>
		</>
	)
}

export function LegalTemplate() {
	return (
		<>
			<section className='px-6 pb-14 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-3xl'>
					<Breadcrumbs
						variant='slash'
						items={[{ label: 'Home', href: '/' }, { label: 'Privacy Policy' }]}
					/>
					<h1 className='mt-8 font-display text-4xl font-semibold leading-tight text-white sm:text-5xl'>
						Privacy Policy
					</h1>
					<p className='mt-5 text-slate-400'>
						Last updated 1 February 2026 ·{' '}
						<Link
							href='/legal'
							className='text-brand underline-offset-4 hover:underline'>
							View previous versions
						</Link>
					</p>
				</div>
			</section>

			<Section>
				<div className='mx-auto grid max-w-5xl gap-14 lg:grid-cols-[16rem_1fr]'>
					<TableOfContents
						design='card'
						title='Sections'
						items={[
							{ id: 'what-we-collect', label: 'What we collect' },
							{ id: 'how-we-use-it', label: 'How we use it' },
							{ id: 'who-we-share-with', label: 'Who we share it with' },
							{ id: 'your-rights', label: 'Your rights' },
						]}
					/>
					<div className='min-w-0'>
						<ProseBlock headings='marked'>
							<p>
								This policy covers what we collect when you use this site or
								work with us, why we collect it, and what you can ask us to do
								about it. It is written to be read rather than to be defensible,
								and if anything in it is unclear the contact address at the
								bottom reaches a person.
							</p>
							<h2 id='what-we-collect'>What we collect</h2>
							<p>
								If you fill in a form we keep what you typed and the date you
								typed it. If you visit the site we record aggregate page views
								with no cookies and no cross-site identifiers. If you become a
								client we hold the contact and billing details required to run
								the engagement.
							</p>
							<h2 id='how-we-use-it'>How we use it</h2>
							<p>
								Form submissions are used to reply to you and nothing else. We
								do not build profiles, we do not run retargeting, and we do not
								sell or rent any of it. Aggregate analytics are used to decide
								which pages are worth rewriting.
							</p>
							<h2 id='who-we-share-with'>Who we share it with</h2>
							<p>
								Our email provider, our hosting provider, and our accounting
								software, each of which sees only the data required to do its
								job. A current list of processors is available on request and we
								will tell you before that list changes.
							</p>
							<h2 id='your-rights'>Your rights</h2>
							<p>
								You can ask for a copy of everything we hold about you, ask us
								to correct it, or ask us to delete it. We will action any of
								those within thirty days and we will not ask you why.
							</p>
						</ProseBlock>
					</div>
				</div>
			</Section>
		</>
	)
}

export function ContactTemplate() {
	return (
		<>
			<ContactSplit
				layout='split'
				eyebrow='Contact'
				title='Tell us what is broken'
				description='Every message goes to the person who would run the project. You will get a written reply the same working day, even if the answer is that we are not the right fit.'
				email='hello@example.com'
				steps={[
					{
						title: '1. You send it',
						body: 'A paragraph is plenty. The process that is hurting and roughly how many people it touches.',
					},
					{
						title: '2. We reply the same day',
						body: 'A real answer from a real person, including whether we think it is worth doing at all.',
					},
					{
						title: '3. We book thirty minutes',
						body: 'Only if there is something worth talking about. No deck, no sales team, no follow-up sequence.',
					},
				]}
			/>
			<Marquee eyebrow='Recently worked with' heading='inline'>
				<Logos />
			</Marquee>
			<StatBand variant='divided' stats={trustStats} />
			<Section>
				<TestimonialCard variant='bare' featured {...testimonials[1]} />
			</Section>
			<FaqAccordion
				eyebrow='Before You Write'
				title='The questions we would otherwise answer in the reply'
				description='Covering these here means the first exchange can be about your problem instead.'
				layout='boxed'
				faqs={generalFaqs.slice(0, 4)}
			/>
		</>
	)
}

export function NotFoundTemplate() {
	return (
		<section className='flex min-h-screen items-center px-6 py-32 sm:px-10 lg:px-16'>
			<div className='mx-auto w-full max-w-4xl'>
				<div className='text-center'>
					<p className='font-display text-7xl font-semibold text-brand sm:text-8xl'>
						404
					</p>
					<h1 className='mt-8 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl'>
						That page has moved, or never existed
					</h1>
					<p className='mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-300'>
						Either way you are stuck, so here are the four pages people are
						usually looking for when they land here.
					</p>
				</div>

				<div className='mt-14 grid gap-3 sm:grid-cols-2'>
					{[
						{
							title: 'The work',
							description: 'Case studies with real numbers attached',
							href: '/case-studies',
						},
						{
							title: 'What we do',
							description: 'The four practices and when each one fits',
							href: '/services',
						},
						{
							title: 'Pricing',
							description: 'Three engagement shapes and what they cost',
							href: '/pricing',
						},
						{
							title: 'Get in touch',
							description: 'A reply from a person, the same working day',
							href: '/contact',
						},
					].map((item) => (
						<Link
							key={item.href}
							href={item.href}
							className='group flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/3 px-6 py-5 transition-colors hover:border-brand/40 hover:bg-white/6'>
							<span>
								<span className='block font-semibold text-white'>
									{item.title}
								</span>
								<span className='mt-1 block text-sm text-slate-400'>
									{item.description}
								</span>
							</span>
							<ArrowRight className='size-5 shrink-0 text-brand transition-transform group-hover:translate-x-1' />
						</Link>
					))}
				</div>

				<div className='mt-12 text-center'>
					<Button
						asChild
						size='lg'
						className='bg-brand font-bold text-ink hover:bg-brand-strong'>
						<Link href='/'>
							Back To Home <ArrowRight />
						</Link>
					</Button>
				</div>
			</div>
		</section>
	)
}

export function ThankYouTemplate() {
	return (
		<>
			<section className='px-6 pb-20 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-3xl text-center'>
					<span className='mx-auto flex size-16 items-center justify-center rounded-full border border-brand/30 bg-brand/10'>
						<Check className='size-7 text-brand' />
					</span>
					<h1 className='mt-8 font-display text-4xl font-semibold leading-[1.1] text-white sm:text-5xl'>
						Got it. Check your inbox.
					</h1>
					<p className='mt-6 text-lg leading-8 text-slate-300'>
						Your message is with Sofia, who runs delivery here. A confirmation
						has gone to the address you gave us, and the real reply will follow
						before the end of the working day.
					</p>
				</div>
			</section>

			<Section className='pt-0'>
				<SectionHeading
					variant='rule'
					eyebrow='What Happens Next'
					title='Three steps, and none of them are automated'
				/>
				<dl className='mx-auto mt-14 grid max-w-4xl gap-10 text-left sm:grid-cols-3'>
					{[
						{
							value: 'Today',
							label:
								'A written reply from the person who would actually run the project, not a routing confirmation.',
						},
						{
							value: 'This week',
							label:
								'If there is something worth discussing, a thirty minute call at a time you pick.',
						},
						{
							value: 'After that',
							label:
								'A scoped discovery proposal with a fixed fee, or an honest note explaining why we are not the right fit.',
						},
					].map((item) => (
						<div key={item.value}>
							<dt className='font-display text-xl font-semibold text-brand'>
								{item.value}
							</dt>
							<dd className='mt-3 leading-7 text-slate-400'>{item.label}</dd>
						</div>
					))}
				</dl>
			</Section>

			<StatBand variant='divided' stats={trustStats} />
			<Grid
				eyebrow='While You Wait'
				title='Worth ten minutes before we speak'
				columns={3}>
				<RelatedReading />
			</Grid>
			<LeadCapture
				design='ruled'
				title='One piece a month, if it is useful'
				description='Written from real projects. Unsubscribing takes one click and we never send twice.'
				cta='Subscribe'
			/>
		</>
	)
}
