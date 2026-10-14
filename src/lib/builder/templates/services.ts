import {
	alt,
	announcement,
	beforeAfter,
	breadcrumbs,
	checkList,
	chips,
	comparison,
	ctaBand,
	faq,
	featureRows,
	features,
	go,
	grid,
	logoStrip,
	masonry,
	page,
	pageHero,
	processSteps,
	splitHero,
	spotlight,
	statBand,
	statHero,
	tabsShowcase,
	testimonials,
} from './helpers'

/*
 * Service pages answer, in order: what exactly do I get, how does it work, why
 * you over the alternatives, what does it cost or how do I find out, and what
 * happens next. The location page adds what search engines need for local intent:
 * the place name in the heading, the areas covered, and local questions.
 */
export const serviceTemplates = [
	page(
		'services',
		'service-detail',
		'Single Service',
		'One service in depth: what is included, the process, why you, proof, and FAQ.',
		[
			pageHero('left', {
				eyebrow: 'Our service',
				title: 'Professional service that [[gets it right]]',
				description:
					'Describe the service in one sentence that names who it is for and the result they get.',
				actions: [go('Get A Free Quote', '/contact'), alt('See Pricing', '/pricing')],
				stats: [
					['500+', 'Jobs completed'],
					['4.9/5', 'Customer rating'],
					['48 hrs', 'Typical turnaround'],
				],
			}),
			featureRows('alternating', [
				{
					eyebrow: 'What is included',
					title: 'Everything handled, start to finish',
					description: 'List what the customer gets so there are no surprises later.',
					points: ['Initial assessment', 'All labor and standard materials', 'Clean-up and final check'],
				},
				{
					eyebrow: 'How we are different',
					title: 'Done properly, not just quickly',
					description: 'Explain the one or two things you do that others skip, and why they matter.',
					points: ['Certified specialists', 'Written guarantee'],
				},
			]),
			processSteps('timeline', {
				eyebrow: 'The process',
				title: 'What to expect',
				steps: [
					['Free consultation', 'We learn what you need and answer your questions.'],
					['Fixed quote', 'A written price and timeline. No hidden fees.'],
					['The work', 'Done on schedule, with updates along the way.'],
					['Follow-up', 'We check in afterwards to make sure everything is right.'],
				],
			}),
			comparison('rules', {
				eyebrow: 'Your options',
				title: 'Why customers choose us',
				columns: ['Us', 'Doing it yourself', 'Typical provider'],
				rows: [
					['Fixed, upfront price', true, true, false],
					['Done by certified specialists', true, false, true],
					['Written guarantee', true, false, false],
					['No time out of your week', true, false, true],
				],
			}),
			grid(
				'centered',
				{ eyebrow: 'Reviews', title: 'What customers say about this service', columns: '3' },
				testimonials('card', [
					'Sample review: professional from the first call to the final walkthrough.',
					'Sample review: the price on the quote was the price I paid.',
					'Sample review: finished a day early and left everything spotless.',
				]),
			),
			faq('split', {
				eyebrow: 'Questions',
				title: 'About this service',
				faqs: [
					['How long does it take?', 'Most jobs are finished within two days. We give you an exact timeline in your quote.'],
					['How much does it cost?', 'It depends on the job. Your quote is free and the price is fixed.'],
					['Is the work guaranteed?', 'Yes. Every job comes with a written workmanship guarantee.'],
				],
			}),
			ctaBand(
				'split',
				'Get a free quote for this service',
				'Tell us what you need. We reply within one business day.',
				[go('Get A Free Quote', '/contact')],
			),
		],
		{ pageName: 'Service', keywords: ['service page', 'offering', 'what we do', 'detail'] },
	),

	page(
		'services',
		'services-overview',
		'All Services',
		'A hub for everything you offer, with a tabbed deep dive and the shared process.',
		[
			pageHero('centered', {
				eyebrow: 'Services',
				title: 'Everything you need, [[under one roof]]',
				description: 'One team for every part of the job, so nothing falls between the cracks.',
				actions: [go('Get A Free Quote', '/contact')],
			}),
			grid(
				'centered',
				{ eyebrow: 'What we do', title: 'Our services', columns: '3' },
				features('card', [
					['Service one', 'One line on what it is and who it is for.', 'Wrench'],
					['Service two', 'Lead with the outcome, not the method.', 'Paintbrush'],
					['Service three', 'Keep each one to a single sentence.', 'Hammer'],
					['Service four', 'Link each to its own page for the detail.', 'Ruler'],
					['Service five', 'Group related services together.', 'Lightbulb'],
					['Service six', 'Put the most popular service first.', 'ShieldCheck'],
				]),
			),
			tabsShowcase('side', {
				eyebrow: 'A closer look',
				title: 'How each service helps',
				items: [
					{ label: 'Service one', title: 'Service one in detail', body: 'Describe the problem it solves and what is included.', points: ['Key benefit', 'What is included', 'Typical timeline'] },
					{ label: 'Service two', title: 'Service two in detail', body: 'Describe the problem it solves and what is included.', points: ['Key benefit', 'What is included', 'Typical timeline'] },
					{ label: 'Service three', title: 'Service three in detail', body: 'Describe the problem it solves and what is included.', points: ['Key benefit', 'What is included', 'Typical timeline'] },
				],
			}),
			processSteps('columns', {
				eyebrow: 'How we work',
				title: 'The same simple process for every service',
				steps: [
					['Talk to us', 'Tell us what you need.'],
					['Get your plan', 'A clear quote and timeline.'],
					['We deliver', 'On time, on budget, guaranteed.'],
				],
			}),
			logoStrip('bare', 'Trusted by customers across the region'),
			faq('boxed', {
				title: 'General questions',
				faqs: [
					['Can you combine services?', 'Yes, and combining usually saves time and money.'],
					['Do you offer free quotes?', 'Yes, for every service.'],
					['What areas do you cover?', 'List your service area here.'],
				],
			}),
			ctaBand(
				'centered',
				'Not sure which service you need?',
				'Tell us about the problem and we will point you in the right direction.',
				[go('Get A Free Quote', '/contact'), alt('Call Us', '/contact')],
			),
		],
		{ pageName: 'Services', keywords: ['services hub', 'overview', 'all services', 'offerings'] },
	),

	page(
		'services',
		'service-area',
		'Service Area or City Page',
		'Local SEO page for one city: the place in the heading, areas covered, local reviews.',
		[
			breadcrumbs([
				['Home', '/'],
				['Service areas', '/service-areas'],
				['Your City', '/service-areas/your-city'],
			]),
			pageHero('left', {
				eyebrow: 'Serving Your City and nearby',
				title: 'Trusted [[service in Your City]]',
				description:
					'Local, licensed, and on time. Replace Your City with the city or town this page targets, here and in the questions below.',
				actions: [go('Get A Free Quote', '/contact'), alt('Call Now', '/contact')],
				stats: [
					['15 min', 'Average drive to you'],
					['Same day', 'Appointments available'],
					['4.9/5', 'Local rating'],
				],
			}),
			chips('solid', 'Neighborhoods we serve', [
				'Downtown',
				'Northside',
				'Westfield',
				'Riverside',
				'Oak Park',
				'Hillcrest',
				'Lakeview',
			]),
			grid(
				'centered',
				{ eyebrow: 'Services in Your City', title: 'What we do locally', columns: '3' },
				features('card', [
					['Most requested service', 'Say what people in this area ask for most.', 'Star'],
					['Second service', 'Mention a local detail, such as older homes or weather.', 'House'],
					['Emergency calls', 'Fast response anywhere in the area.', 'Siren'],
				]),
			),
			statBand('divided', [
				['1,000+', 'Local jobs completed'],
				['12 yrs', 'Serving this area'],
				['100%', 'Licensed and insured'],
			]),
			masonry(
				'centered',
				{ eyebrow: 'Local reviews', title: 'What your neighbors say', columns: '3' },
				testimonials('card', [
					'Sample review: fast, local, and they knew exactly what our older house needed.',
					'Sample review: had someone here within the hour.',
					'Sample review: the only company in town I would recommend.',
				]),
			),
			faq('split', {
				title: 'Questions from Your City customers',
				faqs: [
					['Do you serve all of Your City?', 'Yes, plus the surrounding towns listed above.'],
					['Do you charge for travel?', 'No travel fees anywhere in our service area.'],
					['How soon can you get here?', 'Same-day appointments are often available.'],
				],
			}),
			ctaBand(
				'split',
				'Need help in Your City?',
				'Get a free quote today. Same-day appointments available.',
				[go('Get A Free Quote', '/contact')],
			),
		],
		{ pageName: 'Your City', keywords: ['local seo', 'city', 'location', 'near me', 'service area'] },
	),

	page(
		'services',
		'service-emergency',
		'Emergency or 24/7 Service',
		'For urgent jobs: call now above the fold, response times, and what happens next.',
		[
			announcement('strip', {
				message: 'Available 24 hours a day, 7 days a week. Average arrival in under 60 minutes.',
				linkLabel: 'Call now',
				href: 'tel:5550100000',
			}),
			splitHero('split', {
				eyebrow: '24/7 emergency service',
				title: 'Need help now? [[We are on our way.]]',
				description:
					'A real person answers day or night, and a licensed technician can be with you within the hour.',
				actions: [go('Call Now', 'tel:5550100000'), alt('Request A Callback', '/contact')],
				mediaLabel: 'Technician arriving at a job',
			}),
			checkList('inline', ['Answered 24/7 by a real person', 'No call-out fee', 'Upfront price before we start']),
			processSteps('cards', {
				eyebrow: 'What happens when you call',
				title: 'Help in three steps',
				steps: [
					['Call us', 'Tell us what is happening. We give you safety advice straight away.'],
					['We arrive fast', 'A technician is with you, usually within the hour.'],
					['We fix it', 'An upfront price, then the problem solved.'],
				],
			}),
			statBand('cards', [
				['< 60 min', 'Average arrival'],
				['24/7', 'Including holidays'],
				['$0', 'Call-out fee'],
			]),
			grid(
				'centered',
				{ eyebrow: 'Reviews', title: 'When it mattered most', columns: '3' },
				testimonials('card', [
					'Sample review: called at 2am and someone was here by 2:45.',
					'Sample review: calm, fast, and they told me the price before starting.',
					'Sample review: saved us from a much bigger repair bill.',
				]),
			),
			faq('boxed', {
				title: 'Emergency questions',
				faqs: [
					['Do you really answer at night?', 'Yes. A real person answers every call, 24 hours a day.'],
					['Is emergency service more expensive?', 'There is no call-out fee. You get a price before any work starts.'],
					['What should I do while I wait?', 'We tell you on the phone exactly what to do to stay safe.'],
				],
			}),
			ctaBand(
				'centered',
				'Do not wait. Call now.',
				'Day or night, we are ready to help.',
				[go('Call Now', 'tel:5550100000')],
			),
		],
		{ pageName: 'Emergency Service', keywords: ['24/7', 'urgent', 'same day', 'call now', 'after hours'] },
	),

	page(
		'services',
		'service-industry',
		'Industry or Vertical',
		'For one industry: opens on the numbers, names their problems, shows a relevant result.',
		[
			statHero('cards', {
				eyebrow: 'For your industry',
				title: 'Built for the way [[your industry]] works',
				description: 'Name the industry and the problem everyone in it recognises.',
				stats: [
					['40%', 'Less time on admin'],
					['3x', 'Faster turnaround'],
					['60+', 'Clients in this industry'],
				],
				link: { label: 'See industry results', href: '/case-studies' },
			}),
			beforeAfter('rows', {
				eyebrow: 'The challenge',
				title: 'The problems every business in this industry faces',
				beforeLabel: 'Common problems',
				afterLabel: 'How we solve them',
				before: ['A problem specific to this industry', 'A second, equally familiar one', 'A regulatory or compliance worry'],
				after: ['How you fix the first one', 'How you fix the second', 'How you keep them compliant'],
			}),
			grid(
				'above',
				{ eyebrow: 'What we do for you', title: 'Services tailored to the industry', columns: '3' },
				features('numbered', [
					['Industry-specific service', 'Show you understand their world.'],
					['Second tailored service', 'Use the words they use.'],
					['Third tailored service', 'Mention the tools they already rely on.'],
				]),
			),
			spotlight('split', {
				eyebrow: 'Industry result',
				title: 'How we helped a business like yours',
				summary: 'A short story about a client in this industry: what they struggled with and what changed.',
				details: [
					['Client', 'Client name'],
					['Challenge', 'The problem they came to us with'],
					['Result', 'The number that changed'],
				],
				actions: [go('Read The Story', '/case-studies')],
			}),
			grid(
				'centered',
				{ eyebrow: 'Industry voices', title: 'From people in your industry', columns: '2' },
				testimonials('card', [
					'Sample testimonial: they understood our industry from the first meeting.',
					'Sample testimonial: finally, someone who speaks our language.',
				]),
			),
			faq('stacked', {
				title: 'Industry questions',
				faqs: [
					['Have you worked with businesses like mine?', 'Yes. Mention how many and for how long.'],
					['Do you understand our compliance rules?', 'Explain how you handle the rules specific to this industry.'],
				],
			}),
			ctaBand(
				'centered',
				'Talk to someone who knows your industry',
				'Book a call with a specialist who has worked with businesses like yours.',
				[go('Book A Call', '/book')],
			),
		],
		{ pageName: 'Industry', keywords: ['vertical', 'sector', 'niche', 'who we serve'] },
	),
]
