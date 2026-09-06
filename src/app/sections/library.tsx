import {
	AnnouncementBar,
	ArticleCard,
	AuthorBio,
	BeforeAfter,
	BentoGrid,
	Breadcrumbs,
	Callout,
	Carousel,
	CaseStudyCard,
	CheckList,
	ClientLogo,
	ComparisonTable,
	ContactSplit,
	CtaBand,
	FaqAccordion,
	FeatureCard,
	FeatureRows,
	Figure,
	FilterBar,
	Grid,
	ImageCompare,
	LeadCapture,
	LogoStrip,
	Marquee,
	Masonry,
	MediaCard,
	MediaGallery,
	MediaMosaic,
	PageHero,
	Pagination,
	PricingTiers,
	ProcessSteps,
	ProseBlock,
	RelatedCard,
	RoiCalculator,
	Section,
	SectionHeading,
	SplitCta,
	SplitHero,
	Spotlight,
	StatBand,
	StatHero,
	TableOfContents,
	TabsShowcase,
	TeamCard,
	TechStackChips,
	TestimonialCard,
	VideoPlayer,
	exampleLogos,
	sampleArticles,
	sampleCaseStudies,
	sampleFeatures,
	sampleMedia,
	samplePeople,
	samplePhotos,
	sampleRelated,
	sampleTestimonials,
} from '@/components/sections'
import {
	AboutTemplate,
	BlogPostTemplate,
	CaseStudyDetailTemplate,
	ComparisonTemplate,
	ContactTemplate,
	HomeTemplate,
	IndexListingTemplate,
	IndustryDetailTemplate,
	LandingTemplate,
	LegalTemplate,
	NotFoundTemplate,
	PricingTemplate,
	ResourceTemplate,
	ServiceDetailTemplate,
	SolutionDetailTemplate,
	ThankYouTemplate,
} from '@/components/page-templates'
import { Highlight } from '@/components/ui/highlight'
import { PaginationDemo } from './pagination-demo'
import SiteFooter from '@/components/site-footer'
import SiteHeader from '@/components/site-header'

export type Entry = {
	slug: string
	name: string
	description: string
	// Presence of a preview is what marks an entry as built.
	preview?: React.ReactNode
}

export type Group = {
	id: string
	label: string
	kind: 'section' | 'template'
	entries: Entry[]
}

export const library: Group[] = [
	{
		id: 'chrome',
		label: 'Chrome',
		kind: 'section',
		entries: [
			{
				slug: 'site-header',
				name: 'Site Header',
				description:
					'Fixed top bar with the wordmark, full navigation, and the mobile sheet menu.',
				preview: (
					<>
						<SiteHeader />
						<div className='hero-grid flex min-h-screen items-center justify-center'>
							<p className='text-sm text-slate-500'>
								Page content sits under the fixed header.
							</p>
						</div>
					</>
				),
			},
			{
				slug: 'site-footer',
				name: 'Site Footer',
				description:
					'Wordmark, contact line, and the grouped link columns that close every page.',
				preview: <SiteFooter />,
			},
		],
	},
	{
		id: 'entry',
		label: 'Entry',
		kind: 'section',
		entries: [
			{
				slug: 'page-hero',
				name: 'Page Hero',
				description:
					'Badge, headline, supporting line, two actions, and up to three stats.',
				preview: (
					<PageHero
						eyebrow='Eyebrow Badge'
						title={
							<>
								This is the hero heading, and it runs{' '}
								<Highlight>about this long</Highlight>
							</>
						}
						description='This is the hero description. It sits under the heading, holds two or three lines at this width, and explains what the page covers.'
						actions={[
							{ label: 'Primary Button', href: '/contact' },
							{ label: 'Secondary Button', href: '/case-studies' },
						]}
						stats={[
							{
								value: 'Optional',
								label: 'This whole stat row can be left off entirely',
							},
							{
								value: 'Up To Three',
								label: 'Each one takes a short value and a supporting line',
							},
							{
								value: 'Or None',
								label: 'Drop the stats and the divider above them goes too',
							},
						]}
					/>
				),
			},
			{
				slug: 'split-hero',
				name: 'Split Hero',
				description:
					'Copy on one side, product shot on the other, for pages where the work is the argument.',
				preview: <SplitHero />,
			},
			{
				slug: 'stat-hero',
				name: 'Stat Hero',
				description:
					'Hero with a full-width row of numbers built into it. Leads with outcome over claim.',
				preview: <StatHero />,
			},
			{
				slug: 'section-heading',
				name: 'Section Heading',
				description:
					'Eyebrow, title, optional description, left or centre aligned.',
				preview: (
					<Section>
						<SectionHeading
							eyebrow='Eyebrow'
							title={
								<>
									This is the section heading with an{' '}
									<Highlight>optional highlight</Highlight>
								</>
							}
							description='This is the section description. One or two lines that set up whatever comes below it. Optional.'
						/>
					</Section>
				),
			},
			{
				slug: 'breadcrumbs',
				name: 'Breadcrumbs',
				description:
					'Visible trail matching the breadcrumb JSON-LD so users and crawlers agree.',
				preview: (
					<Section>
						<Breadcrumbs />
					</Section>
				),
			},
			{
				slug: 'announcement-bar',
				name: 'Announcement Bar',
				description:
					'Dismissible site-wide strip for a new case study, an offer, or a notice.',
				preview: (
					<>
						<AnnouncementBar />
						<Section>
							<p className='text-slate-500'>
								The bar sits above everything else on the page. Dismissing it
								removes it for the session.
							</p>
						</Section>
					</>
				),
			},
		],
	},
	{
		id: 'proof',
		label: 'Proof',
		kind: 'section',
		entries: [
			{
				slug: 'stat-band',
				name: 'Stat Band',
				description: 'Three metrics in a row with labels. Short and scannable.',
				preview: <StatBand />,
			},
			{
				slug: 'logo-marquee',
				name: 'Client Logo Strip',
				description:
					'Row of client marks, kept quiet so it never fights the page.',
				preview: <LogoStrip />,
			},
			{
				slug: 'spotlight',
				name: 'Spotlight',
				description:
					'One featured thing with media, a summary, labelled details, and a link through.',
				preview: <Spotlight />,
			},
			{
				slug: 'before-after',
				name: 'Before / After',
				description:
					'Two columns contrasting the old process against the built one.',
				preview: <BeforeAfter />,
			},
		],
	},
	{
		id: 'items',
		label: 'Display items',
		kind: 'section',
		entries: [
			{
				slug: 'testimonial',
				name: 'Testimonial',
				description: 'A quote with attribution beside a left rule.',
				preview: (
					<Section>
						<div className='max-w-sm'>
							<TestimonialCard />
						</div>
					</Section>
				),
			},
			{
				slug: 'testimonial-featured',
				name: 'Testimonial (Featured)',
				description:
					'The same card at pull-quote size. One per page, where trust matters most.',
				preview: (
					<Section>
						<TestimonialCard featured />
					</Section>
				),
			},
			{
				slug: 'case-study-card',
				name: 'Case Study',
				description:
					'Media slot, category, client, summary, and a link into the project.',
				preview: (
					<Section>
						<div className='max-w-sm'>
							<CaseStudyCard />
						</div>
					</Section>
				),
			},
			{
				slug: 'article-card',
				name: 'Article',
				description: 'Category, read time, title, excerpt, and a read link.',
				preview: (
					<Section>
						<div className='max-w-sm'>
							<ArticleCard />
						</div>
					</Section>
				),
			},
			{
				slug: 'team-card',
				name: 'Team Member',
				description: 'Portrait, name, role, and a one line bio.',
				preview: (
					<Section>
						<div className='max-w-sm'>
							<TeamCard />
						</div>
					</Section>
				),
			},
			{
				slug: 'feature-card',
				name: 'Feature',
				description: 'Icon, title, and a short blurb.',
				preview: (
					<Section>
						<div className='max-w-sm'>
							<FeatureCard />
						</div>
					</Section>
				),
			},
			{
				slug: 'related-card',
				name: 'Related Item',
				description: 'Compact meta and title card for end-of-page rails.',
				preview: (
					<Section>
						<div className='max-w-sm'>
							<RelatedCard />
						</div>
					</Section>
				),
			},
			{
				slug: 'media-card',
				name: 'Media',
				description:
					'A framed image with an optional caption. Opens the whole group in a lightbox.',
				preview: (
					<Section>
						<div className='max-w-xl'>
							<MediaCard />
						</div>
					</Section>
				),
			},
		],
	},
	{
		id: 'collections',
		label: 'Collections',
		kind: 'section',
		entries: [
			{
				slug: 'grid',
				name: 'Grid',
				description:
					'Two, three, or four columns of any display item. Pass the cards as children.',
				preview: (
					<>
						<Grid
							eyebrow='Grid'
							title='This is a grid carrying case study cards'
							description='The container is generic. Whatever display item goes in is what it shows.'>
							{sampleCaseStudies.slice(0, 3).map((item, index) => (
								<CaseStudyCard key={index} {...item} />
							))}
						</Grid>
						<Grid
							title='The same grid carrying feature cards, two across'
							columns={2}>
							{sampleFeatures.slice(0, 4).map((item, index) => (
								<FeatureCard key={index} {...item} />
							))}
						</Grid>
						<Grid title='And four across, carrying team cards' columns={4}>
							{[...samplePeople, samplePeople[0]].map((item, index) => (
								<TeamCard key={index} {...item} />
							))}
						</Grid>
					</>
				),
			},
			{
				slug: 'carousel',
				name: 'Carousel',
				description:
					'Scroll track of any display item, with arrows and a progress bar.',
				preview: (
					<>
						<Carousel
							eyebrow='Carousel'
							title='This is a carousel carrying testimonial cards'
							description='Use it when there are more items than a single row can hold.'
							label='Testimonials'>
							{sampleTestimonials.map((item, index) => (
								<TestimonialCard key={index} {...item} />
							))}
						</Carousel>
						<Carousel
							title='The same carousel carrying article cards'
							label='Articles'>
							{sampleArticles.map((item, index) => (
								<ArticleCard key={index} {...item} />
							))}
						</Carousel>
						<Carousel
							title='And media cards, at the wide size'
							size='lg'
							label='Media'>
							{sampleMedia.map((item) => (
								<MediaCard key={item.src} {...item} />
							))}
						</Carousel>
					</>
				),
			},
			{
				slug: 'marquee',
				name: 'Marquee',
				description:
					'Continuously scrolling track that pauses on hover. Best for small items.',
				preview: (
					<Marquee eyebrow='Trusted by'>
						{exampleLogos.map((logo) => (
							<ClientLogo key={logo.name} {...logo} />
						))}
					</Marquee>
				),
			},
		],
	},
	{
		id: 'media',
		label: 'Media',
		kind: 'section',
		entries: [
			{
				slug: 'media-gallery',
				name: 'Media Gallery',
				description:
					'One large frame with selectable thumbnails, for projects needing several shots.',
				preview: <MediaGallery />,
			},
			{
				slug: 'masonry',
				name: 'Masonry',
				description:
					'Columns where every image renders at its own proportions, so nothing is cropped or padded to match.',
				preview: (
					<Masonry
						eyebrow='Masonry'
						title='This is a masonry grid of media'
						description='Every card takes the ratio of the image inside it, so portrait and landscape shots sit together without cropping or padding.'>
						{samplePhotos.map((item) => (
							<MediaCard key={item.src} natural {...item} />
						))}
					</Masonry>
				),
			},
			{
				slug: 'media-mosaic',
				name: 'Media Mosaic',
				description:
					'A lead shot held large with supporting ones around it, for when one image outranks the rest.',
				preview: <MediaMosaic />,
			},
			{
				slug: 'media-carousel',
				name: 'Media Carousel',
				description:
					'Wide slides on a scroll track, when each shot deserves real width.',
				preview: (
					<Carousel
						eyebrow='Screens'
						title='This is a carousel of media'
						description='Clicking any slide opens the whole set in the lightbox.'
						size='lg'
						label='Media'>
						{sampleMedia.map((item) => (
							<MediaCard key={item.src} {...item} />
						))}
					</Carousel>
				),
			},
			{
				slug: 'image-compare',
				name: 'Image Compare',
				description:
					'Draggable wipe between two shots, for before and after on a rebuild.',
				preview: <ImageCompare />,
			},
			{
				slug: 'video-player',
				name: 'Video Player',
				description:
					'Poster frame with full transport controls, for the project walkthroughs in /public.',
				preview: <VideoPlayer />,
			},
		],
	},
	{
		id: 'explain',
		label: 'Explain',
		kind: 'section',
		entries: [
			{
				slug: 'bento-grid',
				name: 'Bento Grid',
				description:
					'Mixed-size tiles for overviews where a uniform grid reads flat.',
				preview: <BentoGrid />,
			},
			{
				slug: 'feature-rows',
				name: 'Alternating Feature Rows',
				description:
					'Zig-zag copy and media rows for capabilities needing a visual.',
				preview: <FeatureRows />,
			},
			{
				slug: 'process-steps',
				name: 'Process Steps',
				description: 'Numbered steps with a summary and a detail list each.',
				preview: <ProcessSteps />,
			},
			{
				slug: 'tabs-showcase',
				name: 'Tabs Showcase',
				description:
					'Tabbed panels for several products or workflows without stacking the page.',
				preview: <TabsShowcase />,
			},
			{
				slug: 'comparison-table',
				name: 'Comparison Table',
				description:
					'Side by side options, handling the objection before it is raised.',
				preview: <ComparisonTable />,
			},
			{
				slug: 'capability-chips',
				name: 'Tech Stack Chips',
				description: 'Compact pill list of the stack behind a project.',
				preview: (
					<Section>
						<TechStackChips />
					</Section>
				),
			},
			{
				slug: 'check-list',
				name: 'Check List',
				description: 'Icon-led list for deliverables and inclusions.',
				preview: (
					<Section>
						<CheckList
							items={[
								'This is a single check list item',
								'Items run to whatever length they need and wrap onto a second line like this one does',
								'Add as many or as few as the section calls for',
								'The icon can be swapped per instance',
							]}
						/>
					</Section>
				),
			},
		],
	},
	{
		id: 'content',
		label: 'Content',
		kind: 'section',
		entries: [
			{
				slug: 'prose-block',
				name: 'Prose Block',
				description:
					'Typographic container for long-form copy, headings, lists, and quotes.',
				preview: (
					<Section>
						<ProseBlock />
					</Section>
				),
			},
			{
				slug: 'callout',
				name: 'Callout',
				description: 'Inline highlighted note for asides and key takeaways.',
				preview: (
					<Section>
						<Callout />
					</Section>
				),
			},
			{
				slug: 'figure',
				name: 'Figure',
				description:
					'Captioned image sized to the prose measure, for use inside long-form copy.',
				preview: (
					<Section>
						<Figure />
					</Section>
				),
			},
			{
				slug: 'author-bio',
				name: 'Author Bio',
				description:
					'End-of-article credibility block with a link to the full profile.',
				preview: (
					<Section>
						<AuthorBio />
					</Section>
				),
			},
			{
				slug: 'table-of-contents',
				name: 'Table Of Contents',
				description:
					'Sticky in-page nav that highlights the heading currently in view.',
				preview: (
					<Section>
						<div className='grid gap-14 lg:grid-cols-[16rem_1fr]'>
							<TableOfContents />
							<div className='space-y-32'>
								{[
									'section-one',
									'section-two',
									'section-three',
									'section-four',
								].map((id, index) => (
									<div key={id}>
										<h2
											id={id}
											className='scroll-mt-32 font-display text-2xl font-semibold text-white'>
											{`This is heading number ${index + 1}`}
										</h2>
										<p className='mt-4 leading-8 text-slate-400'>
											Scroll the preview and the active line on the left follows
											the heading nearest the top of the viewport.
										</p>
									</div>
								))}
							</div>
						</div>
					</Section>
				),
			},
		],
	},
	{
		id: 'convert',
		label: 'Convert',
		kind: 'section',
		entries: [
			{
				slug: 'cta-band',
				name: 'CTA Band',
				description:
					'Accent glass panel with headline, supporting line, and two buttons.',
				preview: (
					<CtaBand
						title='This is the closing call to action heading'
						description='This is the supporting line under it. Both the heading and this description are overridable, and both fall back to site defaults.'
					/>
				),
			},
			{
				slug: 'faq-accordion',
				name: 'FAQ Accordion',
				description: 'Collapsible question list, ready to wire to FAQ schema.',
				preview: <FaqAccordion />,
			},
			{
				slug: 'contact-split',
				name: 'Contact Split',
				description:
					'Form on one side, expectations and direct contact on the other.',
				preview: <ContactSplit />,
			},
			{
				slug: 'pricing-tiers',
				name: 'Engagement Tiers',
				description: 'Two or three engagement shapes with what each includes.',
				preview: <PricingTiers />,
			},
			{
				slug: 'lead-capture',
				name: 'Inline Lead Capture',
				description: 'Single-field email capture for mid-page conversion.',
				preview: <LeadCapture />,
			},
			{
				slug: 'split-cta',
				name: 'Split CTA',
				description:
					'Two paths side by side, for visitors ready to move and visitors still looking.',
				preview: <SplitCta />,
			},
			{
				slug: 'roi-calculator',
				name: 'ROI Calculator',
				description:
					'Interactive estimate of what a manual process costs per year and what is recoverable.',
				preview: <RoiCalculator />,
			},
			{
				slug: 'filter-bar',
				name: 'Filter Bar',
				description:
					'Pill filters with a result count, for index pages once the list grows.',
				preview: (
					<Section>
						<FilterBar resultCount={12} />
					</Section>
				),
			},
			{
				slug: 'pagination',
				name: 'Pagination',
				description:
					'Numbered pager that collapses long runs to an ellipsis, disabled at the ends.',
				preview: <PaginationDemo />,
			},
		],
	},
	{
		id: 'templates',
		label: 'Page templates',
		kind: 'template',
		entries: [
			{
				slug: 'tpl-home',
				name: 'Home',
				description:
					'Split hero, stat band, logo strip, feature grid, spotlight, testimonial, CTA.',
				preview: <HomeTemplate />,
			},
			{
				slug: 'tpl-service-detail',
				name: 'Service Detail',
				description:
					'Page hero, feature rows, process steps, comparison table, FAQ, CTA.',
				preview: <ServiceDetailTemplate />,
			},
			{
				slug: 'tpl-solution-detail',
				name: 'Solution Detail',
				description: 'Page hero, before/after, feature grid, spotlight, CTA.',
				preview: <SolutionDetailTemplate />,
			},
			{
				slug: 'tpl-industry-detail',
				name: 'Industry Detail',
				description:
					'Stat hero, pain points, feature grid, spotlight, FAQ, CTA.',
				preview: <IndustryDetailTemplate />,
			},
			{
				slug: 'tpl-case-study-detail',
				name: 'Case Study Detail',
				description:
					'Breadcrumbs, media hero, challenge/approach/delivered, chips, stats, related.',
				preview: <CaseStudyDetailTemplate />,
			},
			{
				slug: 'tpl-index-listing',
				name: 'Index / Listing',
				description:
					'Page hero plus card grids, in project and article variants.',
				preview: <IndexListingTemplate />,
			},
			{
				slug: 'tpl-blog-post',
				name: 'Blog Post',
				description:
					'Article hero, prose, callout, lead capture, related rail.',
				preview: <BlogPostTemplate />,
			},
			{
				slug: 'tpl-about',
				name: 'About',
				description: 'Hero with stats, story, team grid, logo strip, CTA.',
				preview: <AboutTemplate />,
			},
			{
				slug: 'tpl-contact',
				name: 'Contact',
				description:
					'Contact split with form slot and expectations, then an FAQ.',
				preview: <ContactTemplate />,
			},
			{
				slug: 'tpl-pricing',
				name: 'Pricing',
				description: 'Page hero, tiers, comparison, testimonials, FAQ, CTA.',
				preview: <PricingTemplate />,
			},
			{
				slug: 'tpl-landing',
				name: 'Campaign Landing',
				description:
					'Stripped chrome, one offer, proof, and a single conversion path.',
				preview: <LandingTemplate />,
			},
			{
				slug: 'tpl-legal',
				name: 'Legal',
				description: 'Narrow prose template for privacy policy and terms.',
				preview: <LegalTemplate />,
			},
			{
				slug: 'tpl-not-found',
				name: 'Not Found',
				description: 'On-brand 404 with routes back into the site.',
				preview: <NotFoundTemplate />,
			},
			{
				slug: 'tpl-thank-you',
				name: 'Thank You',
				description:
					'Post-submission confirmation with next steps and somewhere to go meanwhile.',
				preview: <ThankYouTemplate />,
			},
			{
				slug: 'tpl-resource',
				name: 'Resource / Lead Magnet',
				description:
					'Gated download with a single form, proof underneath, and no competing links.',
				preview: <ResourceTemplate />,
			},
			{
				slug: 'tpl-comparison',
				name: 'Comparison',
				description:
					'Head to head page built on the comparison table, before/after, and a split CTA.',
				preview: <ComparisonTemplate />,
			},
		],
	},
]

export function findEntry(slug: string) {
	for (const group of library) {
		const entry = group.entries.find((e) => e.slug === slug)
		if (entry) return { entry, group }
	}
	return null
}
