import {
	alt,
	beforeAfter,
	carousel,
	checkList,
	comparison,
	ctaBand,
	detailCard,
	faq,
	go,
	grid,
	logoStrip,
	page,
	pageHero,
	pricingTiers,
	processSteps,
	roiCalculator,
	testimonials,
	type Tier,
} from './helpers'

/*
 * Pricing pages convert when the recommended plan is obvious, the differences are
 * easy to scan, and the last doubts (contracts, cancelling, refunds) are answered
 * right under the prices instead of on another page.
 */

const threeTiers: Tier[] = [
	{
		name: 'Starter',
		price: '$29/mo',
		blurb: 'For individuals getting started.',
		features: ['Core features', 'Up to 3 projects', 'Email support'],
		cta: 'Start Free Trial',
		href: '/signup',
	},
	{
		name: 'Growth',
		price: '$79/mo',
		blurb: 'For growing teams. Our most popular plan.',
		features: ['Everything in Starter', 'Unlimited projects', 'Team collaboration', 'Priority support'],
		cta: 'Start Free Trial',
		href: '/signup',
		featured: true,
	},
	{
		name: 'Scale',
		price: '$199/mo',
		blurb: 'For larger teams with advanced needs.',
		features: ['Everything in Growth', 'Advanced reporting', 'Single sign-on', 'Dedicated manager'],
		cta: 'Talk To Sales',
		href: '/contact',
	},
]

const pricingFaqs: [string, string][] = [
	['Can I change plans later?', 'Yes. Upgrade or downgrade at any time and we prorate the difference.'],
	['Is there a contract?', 'No. Plans are month to month, or yearly at a discount.'],
	['Do you offer refunds?', 'Yes, within 30 days if it is not the right fit.'],
	['Is there a free trial?', 'Yes. Every plan starts with 14 days free, no credit card needed.'],
]

export const pricingTemplates = [
	page(
		'pricing',
		'pricing-three-tiers',
		'Three Plans',
		'Classic three-tier pricing with the middle plan recommended, proof, and FAQ.',
		[
			pageHero('compact', {
				eyebrow: 'Pricing',
				title: 'Simple pricing that [[grows with you]]',
				description: 'Start free for 14 days. No credit card. Cancel any time.',
			}),
			pricingTiers('cards', {
				title: 'Choose your plan',
				description: 'Save two months when you pay yearly.',
				tiers: threeTiers,
			}),
			checkList('inline', ['14-day free trial', 'No credit card required', 'Cancel any time']),
			logoStrip('bare', 'Trusted by teams of every size'),
			faq('split', {
				eyebrow: 'Questions',
				title: 'Pricing questions, answered',
				faqs: pricingFaqs,
			}),
			ctaBand(
				'centered',
				'Still deciding?',
				'Try any plan free for 14 days, or talk to us and we will help you choose.',
				[go('Start Free Trial', '/signup'), alt('Talk To Sales', '/contact')],
			),
		],
		{ pageName: 'Pricing', keywords: ['plans', 'tiers', 'subscription', 'cost', 'packages'] },
	),

	page(
		'pricing',
		'pricing-compare-plans',
		'Plans With Full Comparison',
		'Tiers up top, a full feature-by-feature table below, then reviews and FAQ.',
		[
			pageHero('centered', {
				eyebrow: 'Plans and pricing',
				title: 'Find the plan that [[fits your team]]',
				description: 'Every plan includes the core features. Compare the details below.',
			}),
			pricingTiers('divided', { title: 'Plans', tiers: threeTiers }),
			comparison('zebra', {
				eyebrow: 'Compare plans',
				title: 'Every feature, side by side',
				columns: ['Growth', 'Starter', 'Scale'],
				rows: [
					['Unlimited projects', true, false, true],
					['Team collaboration', true, false, true],
					['Priority support', true, false, true],
					['Advanced reporting', false, false, true],
					['Single sign-on', false, false, true],
					['Core features', true, true, true],
				],
			}),
			carousel(
				'overlay',
				{ eyebrow: 'Customers', title: 'Why teams choose Growth' },
				testimonials('card', [
					'Sample testimonial: we started on Starter and upgraded within a month. Worth it.',
					'Sample testimonial: the comparison table made the decision easy.',
					'Sample testimonial: the priority support alone justifies the plan.',
				]),
			),
			faq('boxed', { title: 'Questions about plans', faqs: pricingFaqs }),
			ctaBand(
				'split',
				'Start with Growth, free for 14 days',
				'Switch plans any time. No contracts, no setup fees.',
				[go('Start Free Trial', '/signup'), alt('Talk To Sales', '/contact')],
			),
		],
		{ pageName: 'Pricing', keywords: ['compare', 'feature matrix', 'plans', 'table'] },
	),

	page(
		'pricing',
		'pricing-calculator',
		'Pricing Calculator',
		'Let people estimate their own price, then show the plans and book a call.',
		[
			pageHero('centered', {
				eyebrow: 'Pricing',
				title: 'See what you would pay, [[in seconds]]',
				description: 'Move the sliders to match your team. The estimate updates as you go.',
			}),
			roiCalculator('split', {
				eyebrow: 'Estimate',
				title: 'Your estimated price',
				description: 'Pricing is based on team size and how much you use it. Adjust to fit.',
				badge: 'Live estimate',
				inputs: [
					{ label: 'Team members', value: 5, min: 1, max: 200, step: 1 },
					{ label: 'Projects per month', value: 10, min: 1, max: 200, step: 1 },
				],
				outputs: [
					{
						label: 'Estimated monthly price',
						formula: 'team_members * 12 + projects_per_month * 2',
						format: 'currency',
						featured: true,
					},
					{
						label: 'Per person, per month',
						formula: '(team_members * 12 + projects_per_month * 2) / team_members',
						format: 'currency',
						decimals: 2,
					},
					{
						label: 'Paid yearly (two months free)',
						formula: '(team_members * 12 + projects_per_month * 2) * 10',
						format: 'currency',
					},
				],
				action: go('Get An Exact Quote', '/contact'),
				footnote: 'Estimates only. Change the formulas to match your real pricing.',
			}),
			pricingTiers('banded', {
				eyebrow: 'Or pick a plan',
				title: 'Fixed plans for predictable budgets',
				tiers: threeTiers,
			}),
			faq('stacked', { title: 'Pricing questions', faqs: pricingFaqs }),
			ctaBand(
				'centered',
				'Want an exact number?',
				'Tell us about your team and we will send a quote within one business day.',
				[go('Get An Exact Quote', '/contact')],
			),
		],
		{ pageName: 'Pricing', keywords: ['calculator', 'estimate', 'quote', 'roi', 'usage based'] },
	),

	page(
		'pricing',
		'pricing-quote-based',
		'Custom Quote Pricing',
		'For work priced per project: starting points, what affects the price, how quotes work.',
		[
			pageHero('left', {
				eyebrow: 'Pricing',
				title: 'Clear pricing, [[built around your project]]',
				description:
					'Every project is different, so every quote is too. Here is where most projects land and what moves the number.',
				actions: [go('Get A Free Quote', '/contact')],
			}),
			pricingTiers('cards', {
				title: 'Where most projects start',
				description: 'Typical starting points. Your quote is fixed before any work begins.',
				tiers: [
					{
						name: 'Essentials',
						price: 'From $1,500',
						blurb: 'Smaller projects with a clear scope.',
						features: ['Fixed scope and price', 'Two rounds of changes', 'Delivered in 2 weeks'],
						cta: 'Get A Quote',
						href: '/contact',
					},
					{
						name: 'Standard',
						price: 'From $4,500',
						blurb: 'Our most common project size.',
						features: ['Everything in Essentials', 'Strategy session', 'Delivered in 4 to 6 weeks', '30 days of support'],
						cta: 'Get A Quote',
						href: '/contact',
						featured: true,
					},
					{
						name: 'Custom',
						price: 'Let’s talk',
						blurb: 'Larger or ongoing work.',
						features: ['Dedicated team', 'Flexible timeline', 'Ongoing support options'],
						cta: 'Book A Call',
						href: '/book',
					},
				],
			}),
			detailCard('rows', {
				eyebrow: 'What affects the price',
				title: 'The four things that move the number',
				details: [
					['Scope', 'How much there is to do, and how custom it is'],
					['Timeline', 'Rush jobs need more people at once'],
					['Materials', 'What goes into the work, at cost'],
					['Support', 'Whether you want help after we finish'],
				],
				action: go('Get A Free Quote', '/contact'),
				note: 'Quotes are free, fixed, and valid for 30 days.',
			}),
			processSteps('columns', {
				eyebrow: 'How quotes work',
				title: 'A fixed price before we start',
				steps: [
					['Tell us what you need', 'A short form or a quick call.'],
					['Get a written quote', 'A fixed price and timeline within two days.'],
					['Approve and we begin', 'No surprises. The price is the price.'],
				],
			}),
			faq('split', {
				title: 'Quote questions',
				faqs: [
					['Is the quote really fixed?', 'Yes. The price only changes if you change the scope, and we agree it with you first.'],
					['Do you need a deposit?', 'A deposit holds your start date. The rest is due on completion.'],
					['How long is a quote valid?', 'Thirty days from when we send it.'],
				],
			}),
			ctaBand(
				'split',
				'Get your fixed-price quote',
				'Tell us about the project and get a written price within two business days.',
				[go('Get A Free Quote', '/contact')],
			),
		],
		{ pageName: 'Pricing', keywords: ['quote', 'estimate', 'project pricing', 'packages', 'starting at'] },
	),

	page(
		'pricing',
		'pricing-retainer',
		'Monthly Retainer Plans',
		'Ongoing service plans: monthly tiers, retainer versus hourly, and what is included.',
		[
			pageHero('centered', {
				eyebrow: 'Monthly plans',
				title: 'An expert team on call, [[for a flat monthly fee]]',
				description: 'Predictable cost, priority turnaround, and no invoices that surprise you.',
				actions: [go('Choose A Plan', '#plans'), alt('Book A Call', '/book')],
			}),
			pricingTiers('banded', {
				title: 'Monthly plans',
				description: 'Month to month. Pause or cancel any time.',
				tiers: [
					{
						name: 'Essential',
						price: '$900/mo',
						blurb: 'Steady support for small teams.',
						features: ['10 hours a month', 'Two-day turnaround', 'Monthly report'],
						cta: 'Choose Essential',
						href: '/contact',
					},
					{
						name: 'Pro',
						price: '$2,400/mo',
						blurb: 'For teams with a steady flow of work.',
						features: ['30 hours a month', 'Next-day turnaround', 'Strategy call every month', 'Dedicated lead'],
						cta: 'Choose Pro',
						href: '/contact',
						featured: true,
					},
					{
						name: 'Partner',
						price: '$4,800/mo',
						blurb: 'Like having an in-house team.',
						features: ['70 hours a month', 'Same-day turnaround', 'Weekly check-ins', 'Quarterly planning'],
						cta: 'Choose Partner',
						href: '/contact',
					},
				],
			}),
			beforeAfter('columns', {
				eyebrow: 'Why a retainer',
				title: 'Retainer versus paying by the hour',
				beforeLabel: 'Hourly',
				afterLabel: 'Monthly plan',
				before: ['A new quote for every small job', 'Waiting in line behind other clients', 'Invoices you cannot predict'],
				after: ['Just ask, the hours are there', 'Priority turnaround, every time', 'One flat fee, budgeted in advance'],
			}),
			checkList('columns', [
				'Unused hours roll over for one month',
				'Pause your plan any month',
				'Upgrade or downgrade any time',
				'No long-term contract',
			]),
			grid(
				'centered',
				{ eyebrow: 'Clients', title: 'Why clients stay on a plan', columns: '2' },
				testimonials('card', [
					'Sample testimonial: it feels like having an extra team member, at a fraction of the cost.',
					'Sample testimonial: no more chasing quotes. We just ask and it gets done.',
				]),
			),
			faq('boxed', {
				title: 'Plan questions',
				faqs: [
					['What if I use more hours?', 'We will let you know before going over, and extra hours are billed at your plan rate.'],
					['Can I pause?', 'Yes. Pause any month with a week’s notice.'],
					['Is there a minimum term?', 'No. Plans are month to month.'],
				],
			}),
			ctaBand(
				'centered',
				'Get a team on call this month',
				'Pick a plan, or book a call and we will help you choose.',
				[go('Choose A Plan', '#plans'), alt('Book A Call', '/book')],
			),
		],
		{ pageName: 'Plans', keywords: ['retainer', 'subscription', 'monthly', 'maintenance plan', 'support plan'] },
	),
]
