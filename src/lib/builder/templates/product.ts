import {
	alt,
	beforeAfter,
	bento,
	caseCard,
	carousel,
	comparison,
	ctaBand,
	faq,
	featureRows,
	features,
	go,
	grid,
	logoStrip,
	page,
	pageHero,
	processSteps,
	splitCta,
	statBand,
	tabsShowcase,
	testimonials,
	videoPlayer,
} from './helpers'

/*
 * Product pages sell outcomes, then prove them with the feature. Each one ends on
 * the same two doors: try it yourself, or talk to someone.
 */
const tryOrTalk = () =>
	splitCta('cards', [
	{
		eyebrow: 'Try it yourself',
		title: 'Start a free trial',
		body: 'Full access for 14 days. No credit card needed.',
		cta: 'Start Free Trial',
		href: '/signup',
		featured: true,
	},
	{
		eyebrow: 'See it first',
		title: 'Book a demo',
		body: 'A 20-minute walkthrough built around your workflow.',
		cta: 'Book A Demo',
		href: '/demo',
	},
])

export const productTemplates = [
	page(
		'product',
		'product-features',
		'Features Overview',
		'Every feature, grouped by the job it does, with outcomes before details.',
		[
			pageHero('centered', {
				eyebrow: 'Features',
				title: 'Everything you need to [[work smarter]]',
				description: 'Powerful where it counts, simple everywhere else.',
				actions: [go('Start Free Trial', '/signup'), alt('Book A Demo', '/demo')],
			}),
			tabsShowcase('underline', {
				title: 'Built for every part of the job',
				items: [
					{ label: 'Organize', title: 'Keep everything in one place', body: 'Bring your work out of scattered tools and into one shared space.', points: ['Projects and folders', 'Tags and filters', 'Search everything'] },
					{ label: 'Automate', title: 'Let the routine run itself', body: 'Rules handle the repetitive steps so your team does not have to.', points: ['Triggers and actions', 'Scheduled tasks', 'Templates'] },
					{ label: 'Analyze', title: 'See what is working', body: 'Live reports show progress without anyone writing a status update.', points: ['Dashboards', 'Custom reports', 'Exports'] },
				],
			}),
			bento('numbered', {
				eyebrow: 'Highlights',
				title: 'The features customers love most',
				tiles: [
					['Real-time collaboration', 'Everyone sees changes the moment they happen.', 'Users', '2'],
					['Mobile apps', 'Full access from your phone.', 'Smartphone'],
					['Bank-level security', 'Encryption and daily backups.', 'Lock'],
					['Integrations', 'Connects with the tools you already use.', 'Plug', '2'],
				],
			}),
			featureRows('alternating', [
				{
					eyebrow: 'Deep dive',
					title: 'Your most important feature, explained',
					description: 'Show it in action and say what it saves people in time or money.',
					points: ['The specific benefit', 'A detail that proves it'],
				},
				{
					eyebrow: 'Deep dive',
					title: 'The feature competitors do not have',
					description: 'Make the difference concrete with a before and after.',
					points: ['What it replaces', 'How long it takes to set up'],
				},
			]),
			statBand('row', [
				['99.9%', 'Uptime'],
				['50+', 'Integrations'],
				['24/7', 'Support'],
			]),
			tryOrTalk(),
		],
		{ pageName: 'Features', keywords: ['features', 'capabilities', 'product tour', 'saas'] },
	),

	page(
		'product',
		'product-how-it-works',
		'How It Works',
		'Removes the fear of switching: a demo video, the steps, and setup questions.',
		[
			pageHero('centered', {
				eyebrow: 'How it works',
				title: 'Up and running in [[under ten minutes]]',
				description: 'No training, no setup fees, and nothing to install.',
				actions: [go('Start Free Trial', '/signup')],
			}),
			videoPlayer('text-left', {
				eyebrow: 'Watch',
				title: 'See the whole workflow in two minutes',
				description: 'From signing up to your first result, with nothing skipped.',
			}),
			processSteps('timeline', {
				eyebrow: 'Step by step',
				title: 'Four steps to your first result',
				steps: [
					['Sign up', 'Create your account with just an email.', ['No credit card', 'Takes 30 seconds']],
					['Bring your data', 'Import from a spreadsheet or another tool.', ['One-click imports', 'Nothing lost']],
					['Invite your team', 'Add people and set who can see what.', ['Unlimited invites', 'Simple roles']],
					['Get results', 'Your first win, usually on day one.', ['Guided setup', 'Help when you need it']],
				],
			}),
			featureRows('stacked', [
				{
					eyebrow: 'You are never on your own',
					title: 'Help at every step',
					description: 'Guided setup, a library of short videos, and real people when you need them.',
					points: ['Live chat support', 'Free onboarding call'],
				},
			]),
			faq('boxed', {
				title: 'Setup questions',
				faqs: [
					['Do I need technical skills?', 'No. If you can use email, you can use this.'],
					['Can I move my existing data in?', 'Yes. Import from spreadsheets and most popular tools.'],
					['How long until my team is using it?', 'Most teams are fully set up on day one.'],
				],
			}),
			tryOrTalk(),
		],
		{ pageName: 'How It Works', keywords: ['onboarding', 'setup', 'getting started', 'demo', 'walkthrough'] },
	),

	page(
		'product',
		'product-vs-competitor',
		'Comparison Versus a Competitor',
		'An honest head-to-head: the table, where you win, switching stories, migration help.',
		[
			pageHero('centered', {
				eyebrow: 'Comparison',
				title: 'Us versus [[the other option]]',
				description: 'An honest look at how we compare, so you can choose the right fit.',
				actions: [go('Start Free Trial', '/signup'), alt('Talk To Sales', '/contact')],
			}),
			comparison('accent', {
				eyebrow: 'Side by side',
				title: 'How we compare',
				columns: ['Us', 'Competitor'],
				rows: [
					['Free trial with no credit card', true, false],
					['All features on every plan', true, false],
					['Unlimited users', true, false],
					['Live chat support', true, true],
					['Free data migration', true, false],
				],
			}),
			beforeAfter('stacked', {
				eyebrow: 'Why people switch',
				title: 'What changes when you move over',
				beforeLabel: 'With the other option',
				afterLabel: 'With us',
				before: ['Paying extra for basic features', 'Per-seat pricing that punishes growth', 'Support that takes days'],
				after: ['Everything included', 'One price for the whole team', 'Answers in minutes'],
			}),
			featureRows('alternating', [
				{
					eyebrow: 'Where we win',
					title: 'The biggest difference, explained',
					description: 'Be specific and fair. Readers trust a comparison that admits trade-offs.',
				},
			]),
			carousel(
				'below',
				{ eyebrow: 'Switchers', title: 'From teams who moved over' },
				testimonials('card', [
					'Sample testimonial: we moved over in an afternoon and cut our bill in half.',
					'Sample testimonial: the migration team did all the heavy lifting.',
					'Sample testimonial: features we paid extra for are just included here.',
				]),
			),
			faq('split', {
				title: 'Switching questions',
				faqs: [
					['How hard is it to switch?', 'We migrate your data for free, usually within a day.'],
					['Will I lose anything?', 'No. Everything comes across, including history.'],
					['Can I run both while I decide?', 'Yes. Try us free alongside your current tool.'],
				],
			}),
			tryOrTalk(),
		],
		{ pageName: 'Comparison', keywords: ['vs', 'versus', 'alternative', 'competitor', 'switch'] },
	),

	page(
		'product',
		'product-use-cases',
		'Use Cases',
		'Shows how different teams use the product, each with a result.',
		[
			pageHero('centered', {
				eyebrow: 'Use cases',
				title: 'One tool, [[every team]]',
				description: 'See how teams like yours use it to save time and get more done.',
			}),
			tabsShowcase('side', {
				title: 'Pick your team',
				items: [
					{ label: 'Marketing', title: 'Campaigns on schedule', body: 'Plan, approve, and launch every campaign from one place.', points: ['Content calendar', 'Approval flows', 'Campaign reports'] },
					{ label: 'Operations', title: 'Processes that run themselves', body: 'Turn repeatable work into automated workflows.', points: ['Checklists', 'Automations', 'Hand-offs'] },
					{ label: 'Sales', title: 'A pipeline you can trust', body: 'Track every deal and never miss a follow-up.', points: ['Deal tracking', 'Reminders', 'Forecasts'] },
					{ label: 'Leadership', title: 'The big picture, live', body: 'See progress across every team without asking.', points: ['Portfolio view', 'Goals', 'Executive reports'] },
				],
			}),
			grid(
				'above',
				{ eyebrow: 'Customer stories', title: 'Results from real teams', columns: '3' },
				[
					caseCard('stacked', { name: 'A marketing team story', category: 'Marketing', client: 'Client name', summary: 'What they changed and the result in one line.' }),
					caseCard('stacked', { name: 'An operations team story', category: 'Operations', client: 'Client name', summary: 'What they changed and the result in one line.' }),
					caseCard('stacked', { name: 'A sales team story', category: 'Sales', client: 'Client name', summary: 'What they changed and the result in one line.' }),
				],
			),
			statBand('divided', [
				['5,000+', 'Teams'],
				['6 hrs', 'Saved per person each week'],
				['30+', 'Industries'],
			]),
			logoStrip('bare', 'Teams that use it every day'),
			ctaBand(
				'centered',
				'See how it fits your team',
				'Try it free, or book a demo tailored to how your team works.',
				[go('Start Free Trial', '/signup'), alt('Book A Demo', '/demo')],
			),
		],
		{ pageName: 'Use Cases', keywords: ['solutions', 'teams', 'roles', 'who it is for', 'examples'] },
	),

	page(
		'product',
		'product-integrations',
		'Integrations',
		'Shows the product fits the stack people already have.',
		[
			pageHero('centered', {
				eyebrow: 'Integrations',
				title: 'Works with the [[tools you already use]]',
				description: 'Connect your favorite apps in a couple of clicks. No code required.',
				actions: [go('Start Free Trial', '/signup')],
			}),
			grid(
				'centered',
				{ eyebrow: 'Popular integrations', title: 'Connect in seconds', columns: '4' },
				features('card', [
					['Email', 'Turn emails into tasks automatically.', 'Mail'],
					['Calendar', 'See deadlines next to your meetings.', 'Calendar'],
					['Chat', 'Get updates where your team talks.', 'MessageSquare'],
					['Storage', 'Attach files straight from your drive.', 'HardDrive'],
					['Payments', 'Track invoices and payments.', 'CreditCard'],
					['CRM', 'Keep customer records in sync.', 'Contact'],
					['Forms', 'Send form answers straight in.', 'ClipboardList'],
					['Developer API', 'Build your own connections.', 'Code'],
				]),
			),
			featureRows('alternating', [
				{
					eyebrow: 'Two-way sync',
					title: 'Changes flow both ways',
					description: 'Update something in one tool and it updates everywhere else.',
					points: ['Real-time sync', 'No duplicates'],
				},
				{
					eyebrow: 'Open API',
					title: 'Build whatever you need',
					description: 'A documented API and webhooks for custom workflows.',
					points: ['REST API', 'Webhooks'],
				},
			]),
			faq('boxed', {
				title: 'Integration questions',
				faqs: [
					['Do integrations cost extra?', 'No. Every integration is included on every plan.'],
					['What if the tool I use is not listed?', 'Connect it through the API, or tell us and we will look at adding it.'],
				],
			}),
			ctaBand(
				'centered',
				'Connect your tools today',
				'Start a free trial and set up your first integration in minutes.',
				[go('Start Free Trial', '/signup')],
			),
		],
		{ pageName: 'Integrations', keywords: ['apps', 'connect', 'api', 'plugins', 'ecosystem'] },
	),
]
