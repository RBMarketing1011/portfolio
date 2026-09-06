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
	Chips,
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
import { Badge } from '@/components/ui/badge'
import { Highlight } from '@/components/ui/highlight'
import { PaginationDemo } from './pagination-demo'
import SiteFooter from '@/components/site-footer'
import SiteHeader from '@/components/site-header'

export type Variant = {
	id: string
	name: string
	preview: React.ReactNode
}

export type Entry = {
	slug: string
	name: string
	description: string
	// Presence of a preview is what marks an entry as built.
	preview?: React.ReactNode
	/** Alternate takes on the same section, picked from the toolbar. */
	variants?: Variant[]
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
					'Fixed top bar with the wordmark, full navigation, and the mobile sheet menu. The variants reshape the bar.',
				variants: (['bar', 'floating', 'stacked'] as const).map((design) => ({
					id: design,
					name:
						design === 'bar'
							? 'Full-Width Bar'
							: design === 'floating'
								? 'Floating Pill'
								: 'Two Rows, Centred Nav',
					preview: (
						<>
							<SiteHeader design={design} />
							<div className='hero-grid flex min-h-screen items-center justify-center'>
								<p className='text-sm text-slate-500'>
									Page content sits under the fixed header.
								</p>
							</div>
						</>
					),
				})),
			},
			{
				slug: 'site-footer',
				name: 'Site Footer',
				description:
					'Wordmark, contact line, and the grouped link columns that close every page. The variants rearrange them.',
				variants: (['columns', 'centered', 'split'] as const).map((design) => ({
					id: design,
					name:
						design === 'columns'
							? 'Brand Then Columns'
							: design === 'centered'
								? 'Centred'
								: 'Brand Left, Ruled Columns',
					preview: <SiteFooter design={design} />,
				})),
			},
		],
	},
	{
		id: 'entry',
		label: 'Entry',
		kind: 'section',
		entries: [
			{
				slug: 'hero',
				name: 'Hero',
				description:
					'The opening block of a page. Three shapes: centred copy, copy beside media, or copy over numbers.',
				variants: [
					{
						id: 'centered',
						name: 'Centered',
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
						id: 'split',
						name: 'Split With Media',
						preview: <SplitHero />,
					},
					{ id: 'stats', name: 'Stat Led', preview: <StatHero /> },
				],
			},
			{
				slug: 'section-heading',
				name: 'Section Heading',
				description:
					'Eyebrow, title and description in three arrangements: stacked, split, or centred under a rule.',
				variants: [
					{
						id: 'stacked',
						name: 'Stacked',
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
									description='This is the section description. One or two lines that set up whatever comes below it.'
								/>
							</Section>
						),
					},
					{
						id: 'split',
						name: 'Split With Rule',
						preview: (
							<Section>
								<SectionHeading
									variant='split'
									eyebrow='Eyebrow'
									title={
										<>
											Title on the left, description{' '}
											<Highlight>on the right</Highlight>
										</>
									}
									description='Fills the full width and closes with a rule, so it holds its own above a wide grid instead of floating in the left half.'
								/>
							</Section>
						),
					},
					{
						id: 'rule',
						name: 'Centred Under A Rule',
						preview: (
							<Section>
								<SectionHeading
									variant='rule'
									eyebrow='Eyebrow'
									title={
										<>
											Centred, larger, under an{' '}
											<Highlight>accent rule</Highlight>
										</>
									}
									description='The heaviest of the three. Use it to open a major block, not for every section on a page.'
								/>
							</Section>
						),
					},
				],
			},
			{
				slug: 'breadcrumbs',
				name: 'Breadcrumbs',
				description:
					'Visible trail matching the breadcrumb JSON-LD so users and crawlers agree.',
				variants: [
					{
						id: 'chevron',
						name: 'Chevron Trail',
						preview: (
							<Section>
								<Breadcrumbs />
							</Section>
						),
					},
					{
						id: 'slash',
						name: 'Mono Slash',
						preview: (
							<Section>
								<Breadcrumbs variant='slash' />
							</Section>
						),
					},
					{
						id: 'pill',
						name: 'Back Pill',
						preview: (
							<Section>
								<Breadcrumbs variant='pill' />
							</Section>
						),
					},
				],
			},
			{
				slug: 'announcement-bar',
				name: 'Announcement Bar',
				description:
					'Dismissible site-wide strip for a new case study, an offer, or a notice.',
				variants: [
					{
						id: 'strip',
						name: 'Accent Strip',
						preview: (
							<>
								<AnnouncementBar />
								<Section>
									<p className='text-slate-500'>
										Edge to edge, centred, tinted with the accent. Dismissing it
										removes it for the session.
									</p>
								</Section>
							</>
						),
					},
					{
						id: 'badge',
						name: 'Badge Led',
						preview: (
							<>
								<AnnouncementBar
									variant='badge'
									badge='New'
									message='Left aligned on a solid panel, led by a badge that categorises the notice.'
								/>
								<Section>
									<p className='text-slate-500'>
										Quieter than the accent strip, so it can stay up longer
										without fighting the page.
									</p>
								</Section>
							</>
						),
					},
					{
						id: 'floating',
						name: 'Floating Pill',
						preview: (
							<>
								<AnnouncementBar
									variant='floating'
									message='A detached glass pill that follows the page.'
								/>
								<Section className='min-h-[120vh]'>
									<p className='text-slate-500'>
										Scroll: the pill sticks near the top rather than pushing the
										page down, so it never shifts the layout.
									</p>
								</Section>
							</>
						),
					},
				],
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
				description: 'Three metrics with labels. Short and scannable.',
				variants: [
					{ id: 'row', name: 'Icon Row', preview: <StatBand /> },
					{
						id: 'cards',
						name: 'Accent Cards',
						preview: <StatBand variant='cards' />,
					},
					{
						id: 'divided',
						name: 'Divided Numbers',
						preview: <StatBand variant='divided' />,
					},
				],
			},
			{
				slug: 'logo-marquee',
				name: 'Client Logo Strip',
				description:
					'Row of client marks, kept quiet so it never fights the page.',
				variants: [
					{ id: 'card', name: 'Glass Card', preview: <LogoStrip /> },
					{
						id: 'bare',
						name: 'Bare Rules',
						preview: <LogoStrip variant='bare' />,
					},
					{
						id: 'grid',
						name: 'Bordered Grid',
						preview: <LogoStrip variant='grid' logos={exampleLogos} />,
					},
				],
			},
			{
				slug: 'spotlight',
				name: 'Spotlight',
				description:
					'One featured thing with media, a summary, labelled details, and a link through.',
				variants: [
					{ id: 'split', name: 'Split', preview: <Spotlight /> },
					{
						id: 'stacked',
						name: 'Stacked Wide',
						preview: <Spotlight variant='stacked' />,
					},
					{
						id: 'overlap',
						name: 'Overlapping Panel',
						preview: <Spotlight variant='overlap' />,
					},
				],
			},
			{
				slug: 'before-after',
				name: 'Before / After',
				description: 'Contrasts the old process against the built one.',
				variants: [
					{ id: 'columns', name: 'Two Columns', preview: <BeforeAfter /> },
					{
						id: 'rows',
						name: 'Paired Rows',
						preview: <BeforeAfter variant='rows' />,
					},
					{
						id: 'stacked',
						name: 'Stacked With Arrow',
						preview: <BeforeAfter variant='stacked' />,
					},
				],
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
				description:
					'A quote with attribution. Three treatments: carded, bare, or attribution alongside.',
				variants: [
					{
						id: 'card',
						name: 'Glass Card',
						preview: (
							<Section>
								<div className='max-w-sm'>
									<TestimonialCard />
								</div>
							</Section>
						),
					},
					{
						id: 'bare',
						name: 'Bare Centred',
						preview: (
							<Section>
								<div className='mx-auto max-w-2xl'>
									<TestimonialCard variant='bare' />
								</div>
							</Section>
						),
					},
					{
						id: 'aside',
						name: 'Attribution Aside',
						preview: (
							<Section>
								<TestimonialCard variant='aside' />
							</Section>
						),
					},
				],
			},
			{
				slug: 'testimonial-featured',
				name: 'Testimonial (Featured)',
				description:
					'The same card at pull-quote size. One per page, where trust matters most.',
				variants: [
					{
						id: 'card',
						name: 'Accent Card',
						preview: (
							<Section>
								<TestimonialCard featured />
							</Section>
						),
					},
					{
						id: 'bare',
						name: 'Bare Centred',
						preview: (
							<Section>
								<div className='mx-auto max-w-4xl'>
									<TestimonialCard featured variant='bare' />
								</div>
							</Section>
						),
					},
					{
						id: 'aside',
						name: 'Attribution Aside',
						preview: (
							<Section>
								<TestimonialCard featured variant='aside' />
							</Section>
						),
					},
				],
			},
			{
				slug: 'case-study-card',
				name: 'Case Study',
				description:
					'Media, category, client, summary, and a link into the project.',
				variants: [
					{
						id: 'stacked',
						name: 'Stacked',
						preview: (
							<Section>
								<div className='max-w-sm'>
									<CaseStudyCard />
								</div>
							</Section>
						),
					},
					{
						id: 'overlay',
						name: 'Media Overlay',
						preview: (
							<Section>
								<div className='max-w-sm'>
									<CaseStudyCard variant='overlay' />
								</div>
							</Section>
						),
					},
					{
						id: 'row',
						name: 'Wide Row',
						preview: (
							<Section>
								<div className='max-w-3xl'>
									<CaseStudyCard variant='row' />
								</div>
							</Section>
						),
					},
				],
			},
			{
				slug: 'article-card',
				name: 'Article',
				description: 'Category, read time, title, excerpt, and a read link.',
				variants: [
					{
						id: 'card',
						name: 'Text Card',
						preview: (
							<Section>
								<div className='max-w-sm'>
									<ArticleCard />
								</div>
							</Section>
						),
					},
					{
						id: 'thumbnail',
						name: 'Thumbnail Led',
						preview: (
							<Section>
								<div className='max-w-sm'>
									<ArticleCard variant='thumbnail' />
								</div>
							</Section>
						),
					},
					{
						id: 'numbered',
						name: 'Numbered Row',
						preview: (
							<Section>
								<div className='max-w-xl'>
									{sampleArticles.slice(0, 3).map((item, index) => (
										<ArticleCard
											key={index}
											variant='numbered'
											index={index + 1}
											{...item}
										/>
									))}
								</div>
							</Section>
						),
					},
				],
			},
			{
				slug: 'team-card',
				name: 'Team Member',
				description: 'Portrait, name, role, and a one line bio.',
				variants: [
					{
						id: 'card',
						name: 'Glass Card',
						preview: (
							<Section>
								<div className='max-w-sm'>
									<TeamCard />
								</div>
							</Section>
						),
					},
					{
						id: 'portrait',
						name: 'Portrait Plate',
						preview: (
							<Section>
								<div className='max-w-64'>
									<TeamCard variant='portrait' />
								</div>
							</Section>
						),
					},
					{
						id: 'row',
						name: 'Compact Row',
						preview: (
							<Section>
								<div className='max-w-xl'>
									{samplePeople.map((person, index) => (
										<TeamCard key={index} variant='row' {...person} />
									))}
								</div>
							</Section>
						),
					},
				],
			},
			{
				slug: 'feature-card',
				name: 'Feature',
				description: 'Icon, title, and a short blurb.',
				variants: [
					{
						id: 'card',
						name: 'Glass Card',
						preview: (
							<Section>
								<div className='max-w-sm'>
									<FeatureCard />
								</div>
							</Section>
						),
					},
					{
						id: 'inline',
						name: 'Inline Icon',
						preview: (
							<Section>
								<div className='grid max-w-3xl gap-8 sm:grid-cols-2'>
									{sampleFeatures.slice(0, 4).map((item, index) => (
										<FeatureCard key={index} variant='inline' {...item} />
									))}
								</div>
							</Section>
						),
					},
					{
						id: 'numbered',
						name: 'Numbered Rule',
						preview: (
							<Section>
								<div className='grid max-w-4xl gap-8 sm:grid-cols-3'>
									{sampleFeatures.slice(0, 3).map((item, index) => (
										<FeatureCard
											key={index}
											variant='numbered'
											index={index + 1}
											{...item}
										/>
									))}
								</div>
							</Section>
						),
					},
				],
			},
			{
				slug: 'related-card',
				name: 'Related Item',
				description: 'Compact meta and title card for end-of-page rails.',
				variants: [
					{
						id: 'card',
						name: 'Glass Card',
						preview: (
							<Section>
								<div className='max-w-sm'>
									<RelatedCard />
								</div>
							</Section>
						),
					},
					{
						id: 'list',
						name: 'Divider List',
						preview: (
							<Section>
								<div className='max-w-xl'>
									{sampleRelated.map((item, index) => (
										<RelatedCard key={index} variant='list' {...item} />
									))}
								</div>
							</Section>
						),
					},
					{
						id: 'thumbnail',
						name: 'Thumbnail Row',
						preview: (
							<Section>
								<div className='grid max-w-xl gap-4'>
									{sampleRelated.map((item, index) => (
										<RelatedCard key={index} variant='thumbnail' {...item} />
									))}
								</div>
							</Section>
						),
					},
				],
			},
			{
				slug: 'media-card',
				name: 'Media',
				description:
					'A framed image with a caption. Opens the whole group in a lightbox.',
				variants: [
					{
						id: 'card',
						name: 'Glass Frame',
						preview: (
							<Section>
								<div className='max-w-xl'>
									<MediaCard />
								</div>
							</Section>
						),
					},
					{
						id: 'overlay',
						name: 'Caption Overlay',
						preview: (
							<Section>
								<div className='max-w-xl'>
									<MediaCard variant='overlay' />
								</div>
							</Section>
						),
					},
					{
						id: 'bare',
						name: 'Frameless',
						preview: (
							<Section>
								<div className='max-w-xl'>
									<MediaCard variant='bare' />
								</div>
							</Section>
						),
					},
				],
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
					'Columns of any display item. The variants move the heading, not the payload.',
				variants: (['above', 'centered', 'beside'] as const).map((heading) => ({
					id: heading,
					name:
						heading === 'above'
							? 'Heading Above, Left'
							: heading === 'centered'
								? 'Heading Above, Centred'
								: 'Heading Beside, Sticky',
					preview: (
						<Grid
							eyebrow='Grid'
							title='This is the grid heading'
							description='The container is generic. Whatever display item goes in is what it shows.'
							heading={heading}>
							{sampleCaseStudies.slice(0, 3).map((item, index) => (
								<CaseStudyCard key={index} {...item} />
							))}
						</Grid>
					),
				})),
			},
			{
				slug: 'carousel',
				name: 'Carousel',
				description:
					'Scroll track of any display item. The variants change where the controls sit.',
				variants: [
					{
						id: 'below',
						name: 'Dots Left, Arrows Right',
						preview: (
							<Carousel
								eyebrow='Carousel'
								title='Controls below the track'
								description='Paging dots on the left, arrows on the right, both under the slides.'
								label='Testimonials'>
								{sampleTestimonials.map((item, index) => (
									<TestimonialCard key={index} {...item} />
								))}
							</Carousel>
						),
					},
					{
						id: 'overlay',
						name: 'Arrows Over The Edges',
						preview: (
							<Carousel
								eyebrow='Carousel'
								title='Arrows floating on the track edges'
								description='Arrows sit over the slides and appear on hover, with the dots centred underneath.'
								controls='overlay'
								label='Testimonials'>
								{sampleTestimonials.map((item, index) => (
									<TestimonialCard key={index} {...item} />
								))}
							</Carousel>
						),
					},
					{
						id: 'bars',
						name: 'Arrows Top, Progress Bars',
						preview: (
							<Carousel
								eyebrow='Carousel'
								title='Arrows above, segmented bars below'
								description='Arrows sit top right, clear of the slides. Each bar fills to mark position and can be clicked.'
								controls='bars'
								label='Testimonials'>
								{sampleTestimonials.map((item, index) => (
									<TestimonialCard key={index} {...item} />
								))}
							</Carousel>
						),
					},
				],
			},
			{
				slug: 'marquee',
				name: 'Marquee',
				description:
					'Continuously scrolling track that pauses on hover. The variants change the heading.',
				variants: [
					{
						id: 'centered',
						name: 'Centred Label',
						preview: (
							<Marquee eyebrow='Trusted by'>
								{exampleLogos.map((logo) => (
									<ClientLogo key={logo.name} {...logo} />
								))}
							</Marquee>
						),
					},
					{
						id: 'rule',
						name: 'Label With Rule',
						preview: (
							<Marquee eyebrow='Trusted by' heading='rule'>
								{exampleLogos.map((logo) => (
									<ClientLogo key={logo.name} {...logo} />
								))}
							</Marquee>
						),
					},
					{
						id: 'inline',
						name: 'Label Beside Track',
						preview: (
							<Marquee eyebrow='Trusted by' heading='inline'>
								{exampleLogos.map((logo) => (
									<ClientLogo key={logo.name} {...logo} />
								))}
							</Marquee>
						),
					},
				],
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
					'One large frame with selectable thumbnails. The variants move the strip.',
				variants: [
					{
						id: 'bottom',
						name: 'Thumbnails Below',
						preview: <MediaGallery />,
					},
					{
						id: 'side',
						name: 'Thumbnails Beside',
						preview: <MediaGallery thumbnails='side' />,
					},
					{
						id: 'top',
						name: 'Thumbnails Above',
						preview: <MediaGallery thumbnails='top' />,
					},
				],
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
					'Mixed-size tiles for overviews where a uniform grid reads flat. The variants change how a tile is drawn.',
				variants: [
					{
						id: 'accent',
						name: 'Accent Cards',
						preview: <BentoGrid />,
					},
					{
						id: 'divided',
						name: 'Hairline Divided',
						preview: <BentoGrid tileStyle='divided' />,
					},
					{
						id: 'numbered',
						name: 'Numbered Outline',
						preview: <BentoGrid tileStyle='numbered' />,
					},
				],
			},
			{
				slug: 'feature-rows',
				name: 'Feature Rows',
				description:
					'Copy and media rows for capabilities needing a visual. The variants change how the pair is arranged.',
				variants: [
					{
						id: 'alternating',
						name: 'Alternating Sides',
						preview: <FeatureRows />,
					},
					{
						id: 'cards',
						name: 'Contained Cards',
						preview: <FeatureRows layout='cards' />,
					},
					{
						id: 'stacked',
						name: 'Media Over Copy',
						preview: <FeatureRows layout='stacked' />,
					},
				],
			},
			{
				slug: 'process-steps',
				name: 'Process Steps',
				description:
					'Numbered steps with a summary and a detail list each. The variants change how the sequence is drawn.',
				variants: [
					{
						id: 'cards',
						name: 'Accent Cards',
						preview: <ProcessSteps />,
					},
					{
						id: 'timeline',
						name: 'Vertical Timeline',
						preview: <ProcessSteps layout='timeline' />,
					},
					{
						id: 'columns',
						name: 'Ruled Columns',
						preview: <ProcessSteps layout='columns' />,
					},
				],
			},
			{
				slug: 'tabs-showcase',
				name: 'Tabs Showcase',
				description:
					'Tabbed panels for several products or workflows. The variants move and restyle the tab list.',
				variants: [
					{
						id: 'pills',
						name: 'Pill Tabs',
						preview: <TabsShowcase />,
					},
					{
						id: 'underline',
						name: 'Underlined Tabs',
						preview: <TabsShowcase tabStyle='underline' />,
					},
					{
						id: 'side',
						name: 'Side Rail Tabs',
						preview: <TabsShowcase tabStyle='side' />,
					},
				],
			},
			{
				slug: 'comparison-table',
				name: 'Comparison Table',
				description:
					'Side by side options, handling the objection before it is raised. The variants restyle the table.',
				variants: [
					{
						id: 'accent',
						name: 'Accent Card',
						preview: <ComparisonTable />,
					},
					{
						id: 'rules',
						name: 'Bare Rules',
						preview: <ComparisonTable tableStyle='rules' />,
					},
					{
						id: 'zebra',
						name: 'Zebra Rows',
						preview: <ComparisonTable tableStyle='zebra' />,
					},
				],
			},
			{
				slug: 'capability-chips',
				name: 'Chips',
				description: 'Compact labelled list, for a stack or a capability set.',
				variants: [
					{
						id: 'outline',
						name: 'Outline',
						preview: (
							<Section>
								<Chips />
							</Section>
						),
					},
					{
						id: 'solid',
						name: 'Accent Filled',
						preview: (
							<Section>
								<Chips variant='solid' />
							</Section>
						),
					},
					{
						id: 'inline',
						name: 'Inline Text',
						preview: (
							<Section>
								<Chips variant='inline' />
							</Section>
						),
					},
				],
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
					'Typographic container for long-form copy. The variants change how headings are marked.',
				variants: [
					{
						id: 'plain',
						name: 'Plain Headings',
						preview: (
							<Section>
								<ProseBlock />
							</Section>
						),
					},
					{
						id: 'ruled',
						name: 'Ruled Headings',
						preview: (
							<Section>
								<ProseBlock headings='ruled' />
							</Section>
						),
					},
					{
						id: 'marked',
						name: 'Accent Marked Headings',
						preview: (
							<Section>
								<ProseBlock headings='marked' />
							</Section>
						),
					},
				],
			},
			{
				slug: 'callout',
				name: 'Callout',
				description:
					'Inline highlighted note for asides and key takeaways. The variants change how it breaks from the copy.',
				variants: [
					{
						id: 'card',
						name: 'Accent Card',
						preview: (
							<Section>
								<Callout />
							</Section>
						),
					},
					{
						id: 'rule',
						name: 'Left Rule',
						preview: (
							<Section>
								<Callout design='rule' />
							</Section>
						),
					},
					{
						id: 'banner',
						name: 'Tinted Banner',
						preview: (
							<Section>
								<Callout design='banner' />
							</Section>
						),
					},
				],
			},
			{
				slug: 'figure',
				name: 'Figure',
				description:
					'Captioned image sized to the prose measure. The variants move the caption and frame.',
				variants: [
					{
						id: 'below',
						name: 'Caption Below',
						preview: (
							<Section>
								<Figure />
							</Section>
						),
					},
					{
						id: 'framed',
						name: 'Framed Card',
						preview: (
							<Section>
								<Figure design='framed' />
							</Section>
						),
					},
					{
						id: 'beside',
						name: 'Caption Beside',
						preview: (
							<Section>
								<Figure design='beside' />
							</Section>
						),
					},
				],
			},
			{
				slug: 'author-bio',
				name: 'Author Bio',
				description:
					'End-of-article credibility block. The variants change how it is framed.',
				variants: [
					{
						id: 'card',
						name: 'Glass Card',
						preview: (
							<Section>
								<AuthorBio />
							</Section>
						),
					},
					{
						id: 'bare',
						name: 'Ruled, No Card',
						preview: (
							<Section>
								<AuthorBio design='bare' />
							</Section>
						),
					},
					{
						id: 'centered',
						name: 'Centred Stack',
						preview: (
							<Section>
								<AuthorBio design='centered' />
							</Section>
						),
					},
				],
			},
			{
				slug: 'table-of-contents',
				name: 'Table Of Contents',
				description:
					'Sticky in-page nav that highlights the heading currently in view. The variants change the marker.',
				variants: (['rail', 'numbered', 'card'] as const).map((design) => ({
					id: design,
					name:
						design === 'rail'
							? 'Accent Rail'
							: design === 'numbered'
								? 'Numbered'
								: 'Card Panel',
					preview: (
						<Section>
							<div className='grid gap-14 lg:grid-cols-[16rem_1fr]'>
								<TableOfContents design={design} />
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
												Scroll the preview and the active line on the left
												follows the heading nearest the top of the viewport.
											</p>
										</div>
									))}
								</div>
							</div>
						</Section>
					),
				})),
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
					'Headline, supporting line, and two buttons. The variants reframe the band.',
				variants: (['card', 'centered', 'split'] as const).map((design) => ({
					id: design,
					name:
						design === 'card'
							? 'Accent Panel'
							: design === 'centered'
								? 'Centred, No Card'
								: 'Copy Left, Buttons Right',
					preview: (
						<CtaBand
							design={design}
							title='This is the closing call to action heading'
							description='This is the supporting line under it. Both the heading and this description are overridable, and both fall back to site defaults.'
						/>
					),
				})),
			},
			{
				slug: 'faq-accordion',
				name: 'FAQ Accordion',
				description:
					'Collapsible question list, ready to wire to FAQ schema. The variants move the heading and frame the rows.',
				variants: [
					{
						id: 'split',
						name: 'Heading Beside',
						preview: <FaqAccordion />,
					},
					{
						id: 'stacked',
						name: 'Heading Above',
						preview: <FaqAccordion layout='stacked' />,
					},
					{
						id: 'boxed',
						name: 'Boxed Rows',
						preview: <FaqAccordion layout='boxed' />,
					},
				],
			},
			{
				slug: 'contact-split',
				name: 'Contact Split',
				description:
					'Form, expectations, and direct contact. The variants move the form.',
				variants: [
					{
						id: 'split',
						name: 'Form Right',
						preview: <ContactSplit />,
					},
					{
						id: 'reversed',
						name: 'Form Left',
						preview: <ContactSplit layout='reversed' />,
					},
					{
						id: 'stacked',
						name: 'Form Below, Steps Across',
						preview: <ContactSplit layout='stacked' />,
					},
				],
			},
			{
				slug: 'pricing-tiers',
				name: 'Engagement Tiers',
				description:
					'Engagement shapes with what each includes. The variants reframe the columns.',
				variants: [
					{
						id: 'cards',
						name: 'Glass Cards',
						preview: <PricingTiers />,
					},
					{
						id: 'divided',
						name: 'Hairline Divided',
						preview: <PricingTiers design='divided' />,
					},
					{
						id: 'banded',
						name: 'Outlined, Accent Top',
						preview: <PricingTiers design='banded' />,
					},
				],
			},
			{
				slug: 'lead-capture',
				name: 'Inline Lead Capture',
				description:
					'Single-field email capture for mid-page conversion. The variants reframe the block.',
				variants: [
					{
						id: 'card',
						name: 'Accent Card',
						preview: <LeadCapture />,
					},
					{
						id: 'banner',
						name: 'Centred Tinted Banner',
						preview: <LeadCapture design='banner' />,
					},
					{
						id: 'ruled',
						name: 'Ruled, No Card',
						preview: <LeadCapture design='ruled' />,
					},
				],
			},
			{
				slug: 'split-cta',
				name: 'Split CTA',
				description:
					'Two paths for visitors ready to move and visitors still looking. The variants change the separation.',
				variants: [
					{
						id: 'cards',
						name: 'Two Cards',
						preview: <SplitCta />,
					},
					{
						id: 'divided',
						name: 'One Panel, Split',
						preview: <SplitCta design='divided' />,
					},
					{
						id: 'rows',
						name: 'Ruled Rows',
						preview: <SplitCta design='rows' />,
					},
				],
			},
			{
				slug: 'roi-calculator',
				name: 'ROI Calculator',
				description:
					'Interactive estimate of what a manual process costs per year. The variants move the inputs.',
				variants: [
					{
						id: 'split',
						name: 'Inputs Beside Result',
						preview: <RoiCalculator />,
					},
					{
						id: 'stacked',
						name: 'Inputs Across The Top',
						preview: <RoiCalculator layout='stacked' />,
					},
					{
						id: 'bare',
						name: 'Ruled, No Cards',
						preview: <RoiCalculator layout='bare' />,
					},
				],
			},
			{
				slug: 'filter-bar',
				name: 'Filter Bar',
				description:
					'Filters with a result count, for index pages once the list grows. The variants restyle the controls.',
				variants: (['pills', 'underline', 'segmented'] as const).map(
					(design) => ({
						id: design,
						name:
							design === 'pills'
								? 'Pills'
								: design === 'underline'
									? 'Underlined'
									: 'Segmented Control',
						preview: (
							<Section>
								<FilterBar design={design} resultCount={12} />
							</Section>
						),
					}),
				),
			},
			{
				slug: 'pagination',
				name: 'Pagination',
				description:
					'Pager that collapses long runs to an ellipsis. The variants change the control layout.',
				variants: (['numbers', 'compact', 'spread'] as const).map((design) => ({
					id: design,
					name:
						design === 'numbers'
							? 'Centred Numbers'
							: design === 'compact'
								? 'Prev / Next Only'
								: 'Edges Spread',
					preview: <PaginationDemo design={design} />,
				})),
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

// Entries yet to be split into variants still expose one, so callers need no special case.
export function entryVariants(entry: Entry): Variant[] {
	if (entry.variants?.length) return entry.variants
	return entry.preview
		? [{ id: 'default', name: 'Default', preview: entry.preview }]
		: []
}

export function findVariant(entry: Entry, id?: string | null) {
	const variants = entryVariants(entry)
	return variants.find((variant) => variant.id === id) ?? variants[0]
}
