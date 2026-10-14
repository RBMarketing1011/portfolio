import {
	alt,
	beforeAfter,
	caseCard,
	carousel,
	collectionPage,
	ctaBand,
	detailCard,
	go,
	grid,
	imageCompare,
	marquee,
	masonry,
	mediaGallery,
	page,
	pageHero,
	prose,
	related,
	statBand,
	statHero,
	testimonial,
	testimonials,
} from './helpers'

/*
 * Proof pages do the selling for every other page. They lead with the result,
 * keep the story short, and always end with a way to get the same result.
 */
const sampleCases = () => [
	caseCard('stacked', { name: 'Project name', category: 'Category', client: 'Client name', summary: 'The result in one line, with a number if you have one.' }),
	caseCard('stacked', { name: 'Project name', category: 'Category', client: 'Client name', summary: 'What changed for the client, briefly.' }),
	caseCard('stacked', { name: 'Project name', category: 'Category', client: 'Client name', summary: 'Lead with the outcome, not the process.' }),
]

export const proofTemplates = [
	page(
		'proof',
		'proof-case-study',
		'Case Study',
		'Result-first story: the numbers, the challenge, the approach, the quote, related work.',
		[
			pageHero('left', {
				eyebrow: 'Case study',
				title: 'How Client Name [[doubled their leads]] in 90 days',
				description: 'One sentence on who the client is and what they needed.',
				stats: [
					['+112%', 'Qualified leads'],
					['-38%', 'Cost per lead'],
					['90 days', 'From start to result'],
				],
			}),
			detailCard('rows', {
				eyebrow: 'At a glance',
				title: 'The project',
				details: [
					['Client', 'Client name'],
					['Industry', 'Their industry'],
					['Services', 'What you did for them'],
					['Timeline', 'How long it took'],
				],
				action: go('Get Results Like These', '/contact'),
			}),
			prose(
				'ruled',
				'<h2>The challenge</h2><p>What was going wrong, and what it was costing them. Use their words if you can.</p><h2>The approach</h2><p>What you did and why. Keep it to the decisions that mattered.</p><h2>The result</h2><p>What changed, with numbers. Say what it meant for the business, not just the metric.</p>',
			),
			beforeAfter('columns', {
				title: 'Before and after',
				beforeLabel: 'Before',
				afterLabel: 'After',
				before: ['The first problem they had', 'The second problem', 'The cost of leaving it'],
				after: ['What it looks like now', 'The improvement, measured', 'What they do with the time saved'],
			}),
			grid('centered', { columns: '2' }, [
				testimonial('card', 'Sample testimonial: a quote from the client about the result, in their own words.', 'Their role'),
				testimonial('card', 'Sample testimonial: a second quote about what working with you was like.', 'Their role'),
			]),
			grid('above', { eyebrow: 'More work', title: 'Related case studies', columns: '3' }, sampleCases()),
			ctaBand(
				'split',
				'Want results like these?',
				'Tell us where you are. We will show you what is possible.',
				[go('Start A Project', '/contact'), alt('See More Work', '/case-studies')],
			),
		],
		{ pageName: 'Case Study', keywords: ['success story', 'client story', 'results', 'project'] },
	),

	page(
		'proof',
		'proof-portfolio',
		'Portfolio or Work',
		'Filterable grid of projects with paging and a closing call to action.',
		[
			pageHero('centered', {
				eyebrow: 'Our work',
				title: 'Work we are [[proud of]]',
				description: 'A selection of recent projects. Filter by the kind of work you are interested in.',
			}),
			collectionPage(
				'3',
				{ category: 'Work', filters: ['All', 'Websites', 'Branding', 'Campaigns'] },
				[...sampleCases(), ...sampleCases()],
			),
			marquee('rule', 'Clients we have worked with'),
			ctaBand(
				'centered',
				'Like what you see?',
				'Let’s talk about your project.',
				[go('Start A Project', '/contact')],
			),
		],
		{ pageName: 'Portfolio', keywords: ['work', 'projects', 'gallery', 'showcase', 'case studies'] },
	),

	page(
		'proof',
		'proof-testimonials',
		'Testimonials Wall',
		'A wall of reviews with the headline numbers, for people who need reassurance.',
		[
			pageHero('centered', {
				eyebrow: 'Reviews',
				title: 'Do not take our word for it',
				description: 'Here is what customers say about working with us.',
				stats: [
					['4.9/5', 'Average rating'],
					['500+', 'Reviews'],
					['98%', 'Would recommend us'],
				],
			}),
			marquee('inline', 'Trusted by'),
			masonry(
				'bare',
				{ columns: '3' },
				testimonials('card', [
					'Sample review: a longer review works well here. Say what the problem was, what you did, and how it felt.',
					'Sample review: short and punchy.',
					'Sample review: mention the person who helped you by name.',
					'Sample review: the result, with a number.',
					'Sample review: what surprised you most.',
					'Sample review: why you would recommend them.',
					'Sample review: what it was like from the first call.',
					'Sample review: the moment you knew it was the right choice.',
				]),
			),
			statBand('divided', [
				['12 yrs', 'In business'],
				['3,000+', 'Customers served'],
				['24 hrs', 'Average response'],
			]),
			ctaBand(
				'split',
				'Join hundreds of happy customers',
				'See what we can do for you.',
				[go('Get Started', '/contact')],
			),
		],
		{ pageName: 'Reviews', keywords: ['testimonials', 'reviews', 'social proof', 'ratings', 'feedback'] },
	),

	page(
		'proof',
		'proof-results',
		'Results by the Numbers',
		'Leads with outcomes: headline stats, the stories behind them, and the shift.',
		[
			statHero('divided', {
				eyebrow: 'Results',
				title: 'The numbers [[speak for themselves]]',
				description: 'What clients achieved working with us over the last year.',
				stats: [
					['$4.2M', 'Revenue generated for clients'],
					['+86%', 'Average lift in conversions'],
					['14,000', 'Hours saved'],
				],
				link: { label: 'See the case studies', href: '/case-studies' },
			}),
			grid('above', { eyebrow: 'Behind the numbers', title: 'The stories', columns: '3' }, sampleCases()),
			beforeAfter('rows', {
				eyebrow: 'The pattern',
				title: 'What usually changes',
				beforeLabel: 'Before working with us',
				afterLabel: 'After',
				before: ['Guessing what works', 'Spending without tracking', 'Growth that stalls'],
				after: ['Decisions backed by data', 'Every dollar accounted for', 'Growth you can forecast'],
			}),
			carousel(
				'bars',
				{ eyebrow: 'Clients', title: 'In their words' },
				testimonials('card', [
					'Sample testimonial: the numbers moved within the first month.',
					'Sample testimonial: we finally know what is working.',
					'Sample testimonial: best investment we made this year.',
				]),
			),
			ctaBand(
				'centered',
				'Want to be the next success story?',
				'Book a call and we will show you where the opportunities are.',
				[go('Book A Call', '/book')],
			),
		],
		{ pageName: 'Results', keywords: ['results', 'outcomes', 'roi', 'stats', 'impact'] },
	),

	page(
		'proof',
		'proof-before-after',
		'Before and After Gallery',
		'Visual proof for renovation, cleaning, design, and beauty work.',
		[
			pageHero('centered', {
				eyebrow: 'Before and after',
				title: 'See the [[transformation]]',
				description: 'Drag the slider to see the difference. Every photo is from a real job.',
				actions: [go('Get A Free Quote', '/contact')],
			}),
			imageCompare('stacked', {
				eyebrow: 'Featured project',
				title: 'A complete transformation',
				description: 'Add the before and after photos from your best project.',
			}),
			imageCompare('text-left', {
				eyebrow: 'Project two',
				title: 'What changed',
				description: 'A short note on what you did.',
				points: ['What was replaced', 'How long it took', 'What it cost, if you share prices'],
			}),
			mediaGallery('bottom', {
				eyebrow: 'Gallery',
				title: 'More recent work',
			}),
			grid('above', { eyebrow: 'Explore', title: 'Browse by project type', columns: '3' }, [
				related('card', 'Kitchens', 'Project type', 'Describe this kind of project.', '/portfolio'),
				related('card', 'Bathrooms', 'Project type', 'Describe this kind of project.', '/portfolio'),
				related('card', 'Exteriors', 'Project type', 'Describe this kind of project.', '/portfolio'),
			]),
			ctaBand(
				'split',
				'Ready for your own before and after?',
				'Get a free quote and a timeline for your project.',
				[go('Get A Free Quote', '/contact')],
			),
		],
		{ pageName: 'Before And After', keywords: ['gallery', 'transformation', 'renovation', 'makeover', 'photos'] },
	),
]
