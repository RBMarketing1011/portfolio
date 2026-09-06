import {
	ArticleCard,
	Breadcrumbs,
	CaseStudyCard,
	CheckList,
	Chips,
	CtaBand,
	FilterBar,
	Grid,
	LogoStrip,
	MediaGallery,
	PageHero,
	Pagination,
	RelatedCard,
	Section,
	SectionHeading,
	StatBand,
	TeamCard,
	VideoPlayer,
	sampleArticles,
	sampleCaseStudies,
	samplePeople,
	sampleRelated,
} from '@/components/sections'
import { GlassCard } from '@/components/ui/glass-card'

export function CaseStudyDetailTemplate() {
	return (
		<>
			<section className='hero-grid border-b border-white/10 px-6 pb-16 pt-36 sm:px-10 lg:px-16 lg:pt-44'>
				<div className='mx-auto max-w-6xl'>
					<Breadcrumbs
						items={[
							{ label: 'Home', href: '/' },
							{ label: 'Case Studies', href: '/case-studies' },
							{ label: 'This Is The Project Name' },
						]}
					/>
					<h1 className='mt-8 max-w-4xl font-display text-4xl font-semibold leading-[1.08] text-white sm:text-5xl'>
						This is the case study heading
					</h1>
					<p className='mt-6 max-w-2xl text-lg leading-8 text-slate-300'>
						This is the case study summary. One paragraph covering what the
						project was, who it was for, and what it changed.
					</p>
					<GlassCard className='mt-12 aspect-video w-full'>
						<div className='flex h-full items-center justify-center text-sm text-slate-500'>
							Media slot: project screenshot or video
						</div>
					</GlassCard>
				</div>
			</section>

			<Section className='pb-0'>
				<VideoPlayer bare caption='This is the project walkthrough caption.' />
			</Section>

			<Section>
				<div className='grid gap-14 lg:grid-cols-[1.4fr_1fr]'>
					<div className='space-y-12'>
						<div>
							<h2 className='font-display text-2xl font-semibold text-white'>
								The Challenge
							</h2>
							<p className='mt-4 leading-8 text-slate-400'>
								This is the challenge section. It describes the situation before
								the work started, in the client&apos;s terms rather than
								technical ones.
							</p>
						</div>
						<div>
							<h2 className='font-display text-2xl font-semibold text-white'>
								The Approach
							</h2>
							<p className='mt-4 leading-8 text-slate-400'>
								This is the approach section. It explains the decisions made and
								why, which is the part that actually builds trust.
							</p>
						</div>
						<div>
							<h2 className='font-display text-2xl font-semibold text-white'>
								What Was Delivered
							</h2>
							<div className='mt-5'>
								<CheckList
									items={[
										'This is a delivered item',
										'Each line is one concrete thing that shipped',
										'Three to five reads best here',
										'Avoid listing internal tasks nobody asked about',
									]}
								/>
							</div>
						</div>
					</div>

					<aside className='space-y-8'>
						<GlassCard className='p-7'>
							<Chips />
						</GlassCard>
						<GlassCard className='p-7'>
							<p className='text-xs font-semibold uppercase tracking-widest text-slate-500'>
								Capabilities
							</p>
							<ul className='mt-4 space-y-2 text-slate-300'>
								<li>This is a capability</li>
								<li>And another capability</li>
								<li>And a third one</li>
							</ul>
						</GlassCard>
					</aside>
				</div>
			</Section>

			<StatBand />
			<MediaGallery
				eyebrow='Screens'
				title='This is the project gallery'
				description='Several shots of the same build, so one screenshot does not have to carry it.'
			/>
			<Grid title='More Work' className='border-t border-white/10'>
				{sampleRelated.map((item, index) => (
					<RelatedCard key={index} {...item} />
				))}
			</Grid>
			<CtaBand />
		</>
	)
}

export function IndexListingTemplate() {
	return (
		<>
			<PageHero
				eyebrow='Listing Template'
				title='This is the index page heading'
				description='This is the index description. One shared shape covers portfolio, case studies, and the blog index.'
			/>
			<Section className='pb-0'>
				<FilterBar resultCount={12} />
			</Section>
			<Grid
				eyebrow='All Work'
				title='This is the card grid on an index page'
				description='Swap the card set for articles or projects depending on which index this is.'>
				{sampleCaseStudies.slice(0, 3).map((item, index) => (
					<CaseStudyCard key={index} {...item} />
				))}
			</Grid>
			<Grid
				eyebrow='Alternate Cards'
				title='The same layout carrying article cards'
				description='This is the variant an index uses when the content is editorial rather than project based.'>
				{sampleArticles.slice(0, 3).map((item, index) => (
					<ArticleCard key={index} {...item} />
				))}
			</Grid>
			<Section className='pt-0'>
				<Pagination />
			</Section>
			<CtaBand />
		</>
	)
}

export function AboutTemplate() {
	return (
		<>
			<PageHero
				eyebrow='About Template'
				title='This is the about page heading'
				description='This is the about description. It says who this is and why the work is done this way.'
				stats={[
					{ value: 'Stat One', label: 'A short supporting line' },
					{ value: 'Stat Two', label: 'Numbers that establish credibility' },
					{ value: 'Stat Three', label: 'Three is enough on an about page' },
				]}
			/>
			<Section>
				<SectionHeading
					eyebrow='The Story'
					title='This is the story section heading'
					description='This is where the longer narrative goes. Two or three paragraphs about how this came to be and what it stands for.'
				/>
			</Section>
			<Grid
				eyebrow='The Team'
				title='This is the team grid heading'
				description='This is the team description. One line about who is behind the work.'>
				{samplePeople.map((person, index) => (
					<TeamCard key={index} {...person} />
				))}
			</Grid>
			<LogoStrip eyebrow='Worked With' />
			<CtaBand />
		</>
	)
}
