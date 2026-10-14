import {
	alt,
	beforeAfter,
	bento,
	carousel,
	checkList,
	ctaBand,
	detailCard,
	faq,
	featureRows,
	features,
	go,
	grid,
	logoStrip,
	marquee,
	masonry,
	mediaMosaic,
	page,
	pageHero,
	processSteps,
	splitCta,
	splitHero,
	spotlight,
	statBand,
	tabsShowcase,
	testimonials,
} from './helpers'

export const homeTemplates = [
	page(
		'home',
		'home-service-business',
		'Service Business',
		'Quote-first home page for trades and home services: trust, process, reviews, guarantee.',
		[
			splitHero('split', {
				eyebrow: 'Licensed, insured, and local',
				title: 'Done right the first time, [[on schedule]]',
				description:
					'Upfront pricing, a crew that shows up when we say we will, and work we guarantee in writing. Get a free quote within one business day.',
				actions: [go('Get A Free Quote', '/contact'), alt('See Our Work', '/portfolio')],
				mediaLabel: 'Photo of your team on a job',
			}),
			statBand('divided', [
				['4.9/5', 'Average customer rating'],
				['24 hrs', 'To get your written quote'],
				['10 yrs', 'Workmanship warranty'],
				['$0', 'For the estimate, always'],
			]),
			grid(
				'beside',
				{
					eyebrow: 'What we do',
					title: 'Every job, handled by our own crew',
					description:
						'No subcontractors you have never met. The people who quote the job are the people who do it.',
				},
				features('inline', [
					['Repairs', 'Fast fixes for the problems that cannot wait until next month.', 'Wrench'],
					['Installations', 'New equipment fitted properly, permitted, and tested before we leave.', 'Hammer'],
					['Maintenance plans', 'Scheduled check-ups that catch small problems before they get expensive.', 'CalendarCheck'],
					['Emergency service', 'A real person answers, day or night, and a crew is on the way.', 'Siren'],
				]),
			),
			processSteps('columns', {
				eyebrow: 'How it works',
				title: 'Three steps, no surprises',
				steps: [
					['Tell us about the job', 'Fill in the form or call. It takes about two minutes.'],
					['Get a fixed price', 'We visit, measure, and send a written quote. The price does not change.'],
					['We get it done', 'On the day we agreed, cleaned up after, and backed by our warranty.'],
				],
			}),
			beforeAfter('columns', {
				eyebrow: 'Why customers switch to us',
				title: 'Not every contractor works the same way',
				beforeLabel: 'What people are used to',
				afterLabel: 'What you get with us',
				before: [
					'A four-hour arrival window, then a no-show',
					'A vague estimate that grows once work starts',
					'A mess left behind for you to clean up',
					'Nobody answers when something goes wrong',
				],
				after: [
					'A set arrival time and a text when we are on the way',
					'A written, fixed price before any work begins',
					'The site left cleaner than we found it',
					'A warranty in writing and a number that gets answered',
				],
			}),
			carousel(
				'bars',
				{ eyebrow: 'Reviews', title: 'What customers say after the job' },
				testimonials('card', [
					'Sample review: they quoted on Monday, finished on Wednesday, and the price matched the quote to the dollar.',
					'Sample review: the crew arrived exactly when they said they would and left the place spotless.',
					'Sample review: three other companies never called back. These folks had someone out the same day.',
					'Sample review: clear pricing, no upsell, and they explained everything before starting.',
					'Sample review: we have used them for two years now and will not call anyone else.',
				]),
			),
			faq('split', {
				eyebrow: 'Questions',
				title: 'Before you book',
				description: 'Still unsure? Call us and a real person will answer.',
				faqs: [
					['Is the estimate really free?', 'Yes. We come out, look at the job, and send a written quote. There is no charge and no obligation.'],
					['How fast can you start?', 'Most jobs start within the week. Emergencies are usually seen the same day.'],
					['Are you licensed and insured?', 'Yes, fully. We are happy to send proof of both before any work begins.'],
					['What if something goes wrong later?', 'Our workmanship warranty covers it. Call us and we come back to fix it at no cost.'],
					['Do you offer financing?', 'Yes, on larger jobs. Ask for the options when we send your quote.'],
				],
			}),
			ctaBand(
				'split',
				'Get your free quote today',
				'Tell us about the job and get a written, fixed price within one business day.',
				[go('Get A Free Quote', '/contact'), alt('See Pricing', '/pricing')],
			),
		],
		{ pageName: 'Home', keywords: ['contractor', 'trades', 'home services', 'local', 'quote'] },
	),

	page(
		'home',
		'home-agency',
		'Agency or Studio',
		'Work-led home page for agencies and studios: capabilities, featured project, process, proof.',
		[
			pageHero('left', {
				eyebrow: 'Design and growth studio',
				title: 'Websites that [[win customers]], not just compliments',
				description:
					'We plan, design, and build sites and campaigns around one number: how many people become customers.',
				actions: [go('Start A Project', '/contact'), alt('See Our Work', '/portfolio')],
				stats: [
					['120+', 'Projects shipped'],
					['3.2x', 'Average lift in conversions'],
					['9 yrs', 'In business'],
				],
			}),
			marquee('inline', 'Trusted by teams like yours'),
			bento('accent', {
				eyebrow: 'What we do',
				title: 'One team from strategy to launch',
				description: 'Pick one service or hand us the whole thing.',
				tiles: [
					['Strategy', 'Positioning, messaging, and a plan tied to revenue.', 'Compass', '2'],
					['Brand', 'Identity systems that stay consistent everywhere.', 'Palette'],
					['Web design', 'Fast, accessible sites designed to convert.', 'MonitorSmartphone'],
					['Development', 'Clean builds your team can actually maintain.', 'Code'],
					['Growth', 'Paid search, SEO, and testing after launch.', 'TrendingUp'],
				],
			}),
			spotlight('overlap', {
				eyebrow: 'Featured project',
				title: 'A relaunch that doubled qualified leads',
				summary:
					'A short summary of a project you are proud of: the problem the client had, what you changed, and the result they got.',
				details: [
					['Client', 'Client name'],
					['Services', 'Strategy, web design, development'],
					['Timeline', '10 weeks'],
					['Result', '+112% qualified leads'],
				],
				actions: [go('Read The Case Study', '/case-studies')],
				mediaLabel: 'Project screenshot',
			}),
			processSteps('timeline', {
				eyebrow: 'How we work',
				title: 'A process built so nothing gets lost',
				steps: [
					['Discover', 'We learn your business, your customers, and what success looks like.', ['Stakeholder interviews', 'Analytics review']],
					['Design', 'Wireframes, then full designs you review every week.', ['Weekly check-ins', 'Clickable prototype']],
					['Build', 'Development, content, and testing on every device.', ['Performance budget', 'Accessibility checks']],
					['Grow', 'Launch, measure, and keep improving what matters.', ['Monthly reporting', 'Conversion tests']],
				],
			}),
			carousel(
				'overlay',
				{ eyebrow: 'Client words', title: 'What working with us is like' },
				testimonials('card', [
					'Sample testimonial: they asked better questions about our business than we had asked ourselves.',
					'Sample testimonial: on time, on budget, and the new site paid for itself in the first quarter.',
					'Sample testimonial: weekly updates meant we always knew exactly where things stood.',
					'Sample testimonial: our sales team noticed the difference in lead quality within a month.',
				]),
			),
			ctaBand(
				'centered',
				'Have a project in mind?',
				'Tell us where you are and where you want to be. We reply within one business day with next steps.',
				[go('Start A Project', '/contact'), alt('See Pricing', '/pricing')],
			),
		],
		{ pageName: 'Home', keywords: ['agency', 'studio', 'design', 'creative', 'portfolio'] },
	),

	page(
		'home',
		'home-saas',
		'Software Product',
		'Product-led home page: outcome headline, feature tour, proof, plans, and a trial call to action.',
		[
			splitHero('split', {
				eyebrow: 'Free 14-day trial. No card needed.',
				title: 'Stop chasing work. [[Start finishing it.]]',
				description:
					'One place for your team’s tasks, files, and conversations, so nothing slips and everyone knows what is next.',
				actions: [go('Start Free Trial', '/signup'), alt('Book A Demo', '/demo')],
				mediaLabel: 'Product screenshot',
			}),
			logoStrip('bare', 'Used by fast-moving teams'),
			tabsShowcase('pills', {
				eyebrow: 'Features',
				title: 'Everything your team needs, nothing it does not',
				items: [
					{
						label: 'Plan',
						title: 'Plan the week in minutes',
						body: 'Drag work onto a timeline and see who is overloaded before it becomes a problem.',
						points: ['Timelines and boards', 'Workload view', 'Recurring tasks'],
					},
					{
						label: 'Collaborate',
						title: 'Keep the conversation with the work',
						body: 'Comments, files, and approvals live on the task, not in someone’s inbox.',
						points: ['Threaded comments', 'File versions', 'One-click approvals'],
					},
					{
						label: 'Report',
						title: 'Know where everything stands',
						body: 'Live dashboards show progress without anyone writing a status update.',
						points: ['Live dashboards', 'Scheduled reports', 'Export to CSV'],
					},
				],
			}),
			featureRows('alternating', [
				{
					eyebrow: 'Automations',
					title: 'Let the busywork run itself',
					description: 'Set a rule once and the repetitive steps happen on their own: assigning, reminding, and moving work along.',
					points: ['No code needed', 'Templates for common workflows'],
				},
				{
					eyebrow: 'Integrations',
					title: 'Works with the tools you already use',
					description: 'Connect email, calendar, chat, and storage so updates flow both ways.',
					points: ['Two-way sync', 'Set up in minutes'],
				},
			]),
			statBand('cards', [
				['6 hrs', 'Saved per person, per week'],
				['38%', 'Fewer missed deadlines'],
				['4 min', 'Average setup time'],
			]),
			splitCta('cards', [
				{
					eyebrow: 'Try it yourself',
					title: 'Start a free trial',
					body: 'Every feature for 14 days. No credit card, cancel any time.',
					cta: 'Start Free Trial',
					href: '/signup',
					featured: true,
				},
				{
					eyebrow: 'See it first',
					title: 'Book a 20-minute demo',
					body: 'We walk through your workflow and show you exactly how it fits.',
					cta: 'Book A Demo',
					href: '/demo',
				},
			]),
			carousel(
				'bars',
				{ eyebrow: 'Customers', title: 'Teams that switched' },
				testimonials('card', [
					'Sample testimonial: we replaced three tools with one and our weekly status meeting disappeared.',
					'Sample testimonial: onboarding the whole team took one afternoon.',
					'Sample testimonial: for the first time, everyone knows what the priority is.',
					'Sample testimonial: support answered in minutes, every time.',
				]),
			),
			faq('boxed', {
				title: 'Common questions',
				faqs: [
					['Do I need a credit card to start?', 'No. Start your trial with just an email address.'],
					['Can I import from another tool?', 'Yes. Import from spreadsheets and most popular tools in a few clicks.'],
					['Is my data secure?', 'Your data is encrypted in transit and at rest, and backed up daily.'],
					['What happens when the trial ends?', 'Pick a plan to keep going, or your account pauses. Nothing is deleted.'],
				],
			}),
			ctaBand(
				'centered',
				'Get your team on the same page',
				'Start free today and see the difference in your first week.',
				[go('Start Free Trial', '/signup'), alt('Compare Plans', '/pricing')],
			),
		],
		{ pageName: 'Home', keywords: ['saas', 'software', 'app', 'startup', 'trial'] },
	),

	page(
		'home',
		'home-local-business',
		'Local Business',
		'Storefront home page: hours and location up front, services, photos, reviews, directions.',
		[
			splitHero('reversed', {
				eyebrow: 'Open today until 7pm',
				title: 'Your neighborhood favorite, [[since 2012]]',
				description:
					'Friendly people, fair prices, and the kind of service that keeps customers coming back. Walk in or book ahead.',
				actions: [go('Book An Appointment', '/book'), alt('Get Directions', '/contact')],
				mediaLabel: 'Photo of your storefront',
			}),
			detailCard('inline', {
				eyebrow: 'Visit us',
				title: 'Easy to find, easy to park',
				details: [
					['Address', '123 Main Street, Your City'],
					['Hours', 'Mon to Sat, 9am to 7pm. Sun, 10am to 4pm.'],
					['Phone', '(555) 010-0000'],
					['Parking', 'Free lot behind the building'],
				],
				action: go('Get Directions', '/contact'),
				note: 'Walk-ins welcome. Booking ahead guarantees your time.',
			}),
			grid(
				'centered',
				{ eyebrow: 'What we offer', title: 'Something for everyone', columns: '3' },
				features('card', [
					['Signature service', 'The one people drive across town for. Describe it here.', 'Star'],
					['Everyday essentials', 'The regular services customers book every few weeks.', 'ShoppingBag'],
					['Gift cards', 'Any amount, sent by email or picked up in store.', 'Gift'],
				]),
			),
			mediaMosaic({
				eyebrow: 'Take a look inside',
				title: 'A space you will want to come back to',
				description: 'Add photos of your space, your team, and your best work.',
			}),
			masonry(
				'centered',
				{ eyebrow: 'Reviews', title: 'Loved by locals', columns: '3' },
				testimonials('card', [
					'Sample review: the friendliest place in town, and they remember your name.',
					'Sample review: booked online in a minute and was seen right on time.',
					'Sample review: fair prices and they never rush you.',
					'Sample review: my whole family comes here now.',
					'Sample review: worth the drive every single time.',
				]),
			),
			faq('stacked', {
				title: 'Good to know',
				faqs: [
					['Do I need an appointment?', 'Walk-ins are welcome, but booking ahead guarantees your time.'],
					['Is there parking?', 'Yes, a free lot right behind the building.'],
					['Do you sell gift cards?', 'Yes, in any amount, in store or online.'],
					['Is the space accessible?', 'Yes. Step-free entry and an accessible restroom.'],
				],
			}),
			ctaBand(
				'split',
				'See you soon',
				'Book online in under a minute, or just stop by.',
				[go('Book An Appointment', '/book'), alt('Call Us', '/contact')],
			),
		],
		{ pageName: 'Home', keywords: ['storefront', 'shop', 'salon', 'restaurant', 'clinic', 'hours'] },
	),

	page(
		'home',
		'home-consultant',
		'Consultant or Coach',
		'Personal-brand home page: the transformation, how you work, proof, and a free first call.',
		[
			splitHero('split', {
				eyebrow: 'Consulting for growing businesses',
				title: 'Get your time back and [[grow on purpose]]',
				description:
					'I help owners build a business that runs without them in every meeting, with clear numbers, a real plan, and a team that owns the work.',
				actions: [go('Book A Free Call', '/book'), alt('How I Work', '/process')],
				mediaLabel: 'Your headshot',
			}),
			logoStrip('bare', 'As featured in'),
			beforeAfter('stacked', {
				eyebrow: 'Sound familiar?',
				title: 'Where you are, and where we will get you',
				beforeLabel: 'Right now',
				afterLabel: 'Ninety days from now',
				before: [
					'Every decision waits for you',
					'Revenue swings month to month',
					'You work evenings just to keep up',
				],
				after: [
					'Your team decides with a clear playbook',
					'A pipeline you can forecast',
					'Evenings back, and a plan for the year',
				],
			}),
			processSteps('cards', {
				eyebrow: 'How we work together',
				title: 'A simple path from stuck to steady',
				steps: [
					['Free strategy call', 'Thirty minutes to see where you are and whether I can help.'],
					['Your custom plan', 'A written ninety-day plan with priorities in order.'],
					['Weekly coaching', 'We work the plan together and adjust as you go.'],
				],
			}),
			carousel(
				'below',
				{ eyebrow: 'Results', title: 'What clients say' },
				testimonials('card', [
					'Sample testimonial: within three months I stopped being the bottleneck in my own company.',
					'Sample testimonial: the plan was simple, and for the first time we actually followed it.',
					'Sample testimonial: worth every penny. Revenue is up and I took my first real vacation in years.',
				]),
			),
			splitCta('divided', [
				{
					eyebrow: 'Ready to talk',
					title: 'Book a free strategy call',
					body: 'Thirty minutes, no pitch. You leave with at least one thing to do this week.',
					cta: 'Book A Free Call',
					href: '/book',
					featured: true,
				},
				{
					eyebrow: 'Not yet',
					title: 'Get the free guide',
					body: 'The seven questions I ask every new client, in a short PDF.',
					cta: 'Download The Guide',
					href: '/guide',
				},
			]),
			checkList('inline', [
				'No long-term contracts',
				'Cancel any time',
				'Results guarantee',
			]),
			faq('split', {
				title: 'Questions people ask',
				faqs: [
					['Who do you work with?', 'Owners of businesses with five to fifty people who want to grow without burning out.'],
					['How long is an engagement?', 'Most clients work with me for three to six months.'],
					['What does it cost?', 'It depends on the scope. We talk numbers on the free call, with no pressure.'],
				],
			}),
			ctaBand(
				'centered',
				'Let’s see if we are a fit',
				'Book a free thirty-minute call. If I can’t help, I’ll tell you who can.',
				[go('Book A Free Call', '/book')],
			),
		],
		{ pageName: 'Home', keywords: ['coach', 'consultant', 'freelancer', 'personal brand', 'expert'] },
	),
]
