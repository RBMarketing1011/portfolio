import {
	alt,
	announcement,
	beforeAfter,
	bento,
	callout,
	carousel,
	checkList,
	comparison,
	countdown,
	ctaBand,
	detailCard,
	faq,
	featureRows,
	features,
	go,
	grid,
	leadCapture,
	logoStrip,
	marquee,
	masonry,
	page,
	pageHero,
	pricingTiers,
	processSteps,
	splitHero,
	statBand,
	testimonials,
	videoPlayer,
} from './helpers'

/*
 * Landing pages share a shape that converts: the headline repeats what the ad
 * promised, the form or the one button is visible without scrolling, proof sits
 * right under it, objections are answered before the last ask, and nothing on
 * the page competes with the single action.
 */
export const landingTemplates = [
	page(
		'landing',
		'landing-google-ads',
		'Google Ads Lead Gen',
		'Form above the fold, one action, and proof before the ask. Match the headline to your ad.',
		[
			announcement('strip', {
				message: 'Booking now for this month. Request your quote by Friday for priority scheduling.',
			}),
			splitHero('split', {
				eyebrow: 'Rated 4.9/5 by local customers',
				title: 'Get a [[free, fixed-price quote]] in 24 hours',
				description:
					'Repeat the promise from your ad here, word for word. Tell us what you need and we send a written price you can hold us to.',
				actions: [go('Get My Free Quote', '#quote')],
				mediaLabel: 'Photo of the result customers want',
			}),
			leadCapture('card', {
				title: 'Get your free quote',
				description: 'Takes 30 seconds. We reply within one business day, with no obligation.',
				collect: 'full-name-email',
				cta: 'Get My Free Quote',
			}),
			marquee('centered', 'Trusted by homeowners and businesses across the area'),
			grid(
				'centered',
				{ eyebrow: 'Why choose us', title: 'Three reasons people pick us over the rest', columns: '3' },
				features('card', [
					['Fixed pricing', 'The quote is the price. No surprise charges once work starts.', 'BadgeDollarSign'],
					['On time, every time', 'A set arrival time and a text when we are on the way.', 'Clock'],
					['Guaranteed work', 'If it is not right, we come back and fix it at no cost.', 'ShieldCheck'],
				]),
			),
			processSteps('cards', {
				eyebrow: 'How it works',
				title: 'From request to done in three steps',
				steps: [
					['Request a quote', 'Fill in the short form above. No phone tag.'],
					['Get your fixed price', 'A written quote within 24 hours, with a start date.'],
					['Relax, it is handled', 'We do the work, clean up, and back it with a warranty.'],
				],
			}),
			grid(
				'centered',
				{ eyebrow: 'Reviews', title: 'What customers say', columns: '2' },
				testimonials('card', [
					'Sample review: the quote came back the same afternoon and the final bill matched it exactly.',
					'Sample review: I called three companies. These were the only ones who showed up when they said.',
				]),
			),
			checkList('inline', [
				'Free, no-obligation quote',
				'Licensed and insured',
				'Workmanship warranty',
			]),
			faq('boxed', {
				title: 'Questions before you request a quote',
				faqs: [
					['Is the quote really free?', 'Yes. No cost and no obligation to go ahead.'],
					['How quickly can you start?', 'Most jobs start within the week of accepting your quote.'],
					['Will the price change?', 'No. The written quote is the price you pay.'],
					['What areas do you serve?', 'List your service area here so the right people keep reading.'],
				],
			}),
			ctaBand(
				'centered',
				'Your free quote is 30 seconds away',
				'Tell us what you need and get a fixed price within one business day.',
				[go('Get My Free Quote', '#quote')],
			),
		],
		{ pageName: 'Free Quote', keywords: ['ppc', 'adwords', 'google ads', 'paid', 'quote', 'lead generation'] },
	),

	page(
		'landing',
		'landing-free-consultation',
		'Free Consultation',
		'Books a free call: what the call covers, who it is for, and what happens after.',
		[
			splitHero('reversed', {
				eyebrow: 'Free 30-minute consultation',
				title: 'Get a clear plan in [[one conversation]]',
				description:
					'Book a free call and leave with a short, written plan for your situation, whether or not you work with us.',
				actions: [go('Book My Free Call', '/book'), alt('See How It Works', '#how')],
				mediaLabel: 'Friendly photo of the person they will speak to',
			}),
			detailCard('card', {
				eyebrow: 'What you get',
				title: 'Thirty minutes, focused on you',
				description: 'No pitch deck, no pressure. Just an honest look at where you are and what to do next.',
				details: [
					['Length', '30 minutes'],
					['Format', 'Video call or phone, your choice'],
					['Cost', 'Free, with no obligation'],
					['You leave with', 'A written summary and three next steps'],
				],
				action: go('Book My Free Call', '/book'),
				note: 'Only a handful of slots open each week.',
			}),
			beforeAfter('columns', {
				eyebrow: 'Is this for you?',
				title: 'This call is a good fit if',
				beforeLabel: 'You are dealing with',
				afterLabel: 'You want',
				before: [
					'A problem you have tried to fix more than once',
					'Advice that contradicts itself',
					'No clear idea of what to do first',
				],
				after: [
					'An expert view on your exact situation',
					'A plan in the right order',
					'To know what it would cost to get help',
				],
			}),
			processSteps('columns', {
				eyebrow: 'How it works',
				title: 'Simple from start to finish',
				steps: [
					['Pick a time', 'Choose a slot that suits you. It takes a minute.'],
					['Answer three questions', 'So we come prepared, not with a script.'],
					['Get your plan', 'We talk, then send a written summary the same day.'],
				],
			}),
			grid(
				'centered',
				{ eyebrow: 'Kind words', title: 'From people who booked a call', columns: '3' },
				testimonials('card', [
					'Sample testimonial: I got more out of thirty minutes than months of reading online.',
					'Sample testimonial: no hard sell at all. Just useful, honest advice.',
					'Sample testimonial: the written summary alone was worth booking.',
				]),
			),
			faq('split', {
				title: 'Before you book',
				faqs: [
					['Is it really free?', 'Yes. There is no charge and no obligation.'],
					['Will you try to sell me something?', 'If we can help further we will say so once, and then it is your call.'],
					['What should I prepare?', 'Nothing formal. A rough idea of what you want to change is enough.'],
					['Can I reschedule?', 'Yes, from the link in your confirmation email.'],
				],
			}),
			ctaBand(
				'split',
				'Ready to get a clear plan?',
				'Pick a time that works for you. It takes less than a minute.',
				[go('Book My Free Call', '/book')],
			),
		],
		{ pageName: 'Free Consultation', keywords: ['consult', 'call', 'booking', 'discovery call', 'strategy session'] },
	),

	page(
		'landing',
		'landing-long-form-sales',
		'Long-Form Sales Page',
		'Problem, solution, proof, offer, guarantee, urgency. For a single product or program.',
		[
			pageHero('centered', {
				eyebrow: 'For people who are tired of starting over',
				title: 'The proven way to [[finally get results]] in 90 days',
				description:
					'A step-by-step program that has helped people just like you get from stuck to steady, without guesswork or burnout.',
				actions: [go('Get Instant Access', '#offer'), alt('See What Is Inside', '#inside')],
			}),
			beforeAfter('rows', {
				eyebrow: 'The problem',
				title: 'If this sounds like you, keep reading',
				beforeLabel: 'Where you are now',
				afterLabel: 'Where you will be',
				before: [
					'You have tried everything and nothing sticks',
					'You are not sure what to do first',
					'You are spending money without seeing results',
				],
				after: [
					'A simple system you follow every week',
					'A clear first step, and the next, and the next',
					'Results you can measure within the first month',
				],
			}),
			featureRows('alternating', [
				{
					eyebrow: 'Module one',
					title: 'Build the foundation',
					description: 'Set up the few things that make everything after it easier, in your first week.',
					points: ['Step-by-step video lessons', 'Fill-in-the-blank worksheets'],
				},
				{
					eyebrow: 'Module two',
					title: 'Put it into practice',
					description: 'Use the system on your real situation with templates that do half the work for you.',
					points: ['Ready-made templates', 'Weekly live Q&A'],
				},
				{
					eyebrow: 'Module three',
					title: 'Make it stick',
					description: 'Turn what works into a habit so the results keep coming after the program ends.',
					points: ['Progress tracker', 'Lifetime access to updates'],
				},
			]),
			statBand('row', [
				['2,400+', 'Students enrolled'],
				['4.8/5', 'Average rating'],
				['90 days', 'To see the change'],
			]),
			carousel(
				'bars',
				{ eyebrow: 'Results', title: 'What students say' },
				testimonials('card', [
					'Sample testimonial: I had tried three other programs. This is the first one I actually finished.',
					'Sample testimonial: by week six I had already made back what I paid.',
					'Sample testimonial: clear, practical, and the community kept me going.',
					'Sample testimonial: I wish I had found this two years ago.',
				]),
			),
			pricingTiers('cards', {
				eyebrow: 'Choose your option',
				title: 'Everything you need to get results',
				description: 'Pay once, keep access forever.',
				tiers: [
					{
						name: 'Self-paced',
						price: '$297',
						blurb: 'The full program, on your schedule.',
						features: ['All three modules', 'Templates and worksheets', 'Lifetime updates'],
						cta: 'Get Self-Paced',
						href: '/checkout',
					},
					{
						name: 'With coaching',
						price: '$597',
						blurb: 'The program plus live help every week.',
						features: ['Everything in Self-paced', 'Weekly live Q&A calls', 'Private community', 'One 1:1 review'],
						cta: 'Get Coaching',
						href: '/checkout',
						featured: true,
					},
					{
						name: 'VIP',
						price: '$1,497',
						blurb: 'Done with you, one to one.',
						features: ['Everything in With coaching', 'Four private 1:1 sessions', 'Your plan reviewed line by line', 'Direct message access for 90 days'],
						cta: 'Apply For VIP',
						href: '/checkout',
					},
				],
			}),
			callout('card', {
				label: '30-day money-back guarantee',
				icon: 'ShieldCheck',
				html: '<p>Do the first two modules. If you do not see progress within 30 days, email us for a full refund. No forms, no hoops.</p>',
			}),
			countdown('inline', {
				eyebrow: 'Launch pricing ends soon',
				title: 'The price goes up when the timer runs out',
				note: 'Set the countdown values to your real deadline.',
			}),
			faq('boxed', {
				title: 'Frequently asked questions',
				faqs: [
					['How long do I have access?', 'For life, including every future update.'],
					['How much time does it take?', 'About two hours a week. Every lesson is under fifteen minutes.'],
					['What if it is not for me?', 'Ask for a refund within 30 days and you get every penny back.'],
					['Do I need any experience?', 'No. The program starts from the very beginning.'],
				],
			}),
			ctaBand(
				'centered',
				'Start today and see results in 90 days',
				'Instant access, lifetime updates, and a 30-day money-back guarantee.',
				[go('Get Instant Access', '#offer')],
			),
		],
		{ pageName: 'Program', keywords: ['sales letter', 'course', 'program', 'offer', 'funnel', 'vsl'] },
	),

	page(
		'landing',
		'landing-free-trial',
		'Free Trial Signup',
		'Product landing page that drives trial signups: demo video, outcomes, versus the old way.',
		[
			splitHero('split', {
				eyebrow: 'Free for 14 days. No card required.',
				title: 'Do in [[ten minutes]] what used to take all afternoon',
				description:
					'Name the painful task your product removes. Then show the trial is free, fast to start, and safe to cancel.',
				actions: [go('Start My Free Trial', '/signup'), alt('Watch The 2-Minute Demo', '#demo')],
				mediaLabel: 'Product screenshot',
			}),
			logoStrip('bare', 'Used by teams at'),
			videoPlayer('text-left', {
				eyebrow: 'See it in action',
				title: 'Two minutes to see how it works',
				description: 'Walk through the core workflow from start to finish, with nothing skipped.',
			}),
			bento('numbered', {
				eyebrow: 'What changes',
				title: 'Your first week with us',
				tiles: [
					['Set up in minutes', 'Import what you already have and you are ready.', 'Zap'],
					['Automate the routine', 'Rules handle the repetitive steps for you.', 'Repeat'],
					['See everything at once', 'One dashboard instead of five spreadsheets.', 'LayoutDashboard'],
				],
			}),
			comparison('accent', {
				eyebrow: 'Why switch',
				title: 'Compared with the way you do it now',
				columns: ['Our product', 'Spreadsheets', 'Hiring help'],
				rows: [
					['Ready in minutes', true, true, false],
					['Updates itself automatically', true, false, false],
					['Works for the whole team', true, false, true],
					['Costs less than a coffee a day', true, true, false],
				],
			}),
			masonry(
				'centered',
				{ eyebrow: 'Customers', title: 'Teams that made the switch', columns: '3' },
				testimonials('card', [
					'Sample testimonial: set up in one afternoon and saved hours the very first week.',
					'Sample testimonial: the whole team adopted it without a single training session.',
					'Sample testimonial: cancelled two other subscriptions because of it.',
				]),
			),
			faq('stacked', {
				title: 'About the free trial',
				faqs: [
					['Do I need a credit card?', 'No. Just an email address.'],
					['What happens after 14 days?', 'Choose a plan to keep going. Otherwise your account pauses and nothing is charged.'],
					['Can I invite my team?', 'Yes. Invite as many people as you like during the trial.'],
				],
			}),
			ctaBand(
				'centered',
				'Try it free for 14 days',
				'Full access, no credit card, and you can cancel in one click.',
				[go('Start My Free Trial', '/signup')],
			),
		],
		{ pageName: 'Free Trial', keywords: ['saas', 'signup', 'trial', 'product', 'demo'] },
	),

	page(
		'landing',
		'landing-local-offer',
		'Local Service Offer',
		'A specific offer with a price and a deadline, for local ads, flyers, and social posts.',
		[
			announcement('badge', {
				badge: 'Limited offer',
				message: 'New customers only, while slots last this month.',
			}),
			splitHero('reversed', {
				eyebrow: 'New customer special',
				title: 'Your first visit for just [[$49]]',
				description:
					'A full first service at a fraction of the usual price, so you can see the difference for yourself. Normally $129.',
				actions: [go('Claim My $49 Visit', '#claim')],
				mediaLabel: 'Photo of the service in progress',
			}),
			detailCard('rows', {
				eyebrow: 'The offer',
				title: 'Everything included in your first visit',
				details: [
					['Includes', 'Full inspection, the standard service, and a written report'],
					['Price', '$49 (normally $129)'],
					['Available', 'New customers, one per household'],
					['Ends', 'The last day of this month'],
				],
				action: go('Claim My $49 Visit', '#claim'),
				note: 'Only a limited number of first visits each week.',
			}),
			grid(
				'centered',
				{ title: 'Why neighbors choose us', columns: '3' },
				features('card', [
					['Local and family owned', 'We live here too, and our name is on every job.', 'House'],
					['Background-checked team', 'The same trusted faces at your door every time.', 'UserCheck'],
					['Satisfaction guarantee', 'Not happy? We come back and make it right.', 'ThumbsUp'],
				]),
			),
			masonry(
				'centered',
				{ eyebrow: 'Reviews', title: 'What first-time customers said', columns: '3' },
				testimonials('card', [
					'Sample review: booked the intro offer and have been a regular customer ever since.',
					'Sample review: on time, polite, and they explained everything they did.',
					'Sample review: honestly expected an upsell. There was none.',
				]),
			),
			leadCapture('banner', {
				title: 'Claim your $49 first visit',
				description: 'Leave your details and we will call to book a time that suits you.',
				collect: 'full-name-email',
				cta: 'Claim My Offer',
			}),
			faq('boxed', {
				title: 'Offer questions',
				faqs: [
					['Who is the offer for?', 'New customers in our service area, one per household.'],
					['Is there a catch?', 'No. You pay $49 for the first visit and there is no obligation to book again.'],
					['When does it end?', 'At the end of this month, or sooner if the slots fill up.'],
				],
			}),
		],
		{ pageName: 'Special Offer', keywords: ['coupon', 'discount', 'intro offer', 'local', 'facebook ads'] },
	),
]
