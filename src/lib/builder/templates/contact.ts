import {
	checkList,
	contactSplit,
	ctaBand,
	detailCard,
	faq,
	go,
	grid,
	leadCapture,
	marquee,
	page,
	pageHero,
	processSteps,
	related,
	splitCta,
	statBand,
	testimonials,
} from './helpers'

/*
 * People reach a contact page already wanting to act. These pages remove the last
 * hesitation: what happens after I submit, how fast, and is there anything else I
 * should know first.
 */
export const contactTemplates = [
	page(
		'contact',
		'contact-form',
		'Contact Form',
		'Form beside what happens next, response times, and the questions people ask first.',
		[
			contactSplit('split', {
				eyebrow: 'Contact us',
				title: 'Let’s talk about what you need',
				description: 'Send a message and a real person will get back to you within one business day.',
				email: 'hello@yourbusiness.com',
				steps: [
					['We read every message', 'A person, not a bot, reads it the same day.', 'Inbox'],
					['We reply within a day', 'With answers, or a few questions to get it right.', 'Reply'],
					['We plan the next step', 'A call, a quote, or a visit, whatever suits you.', 'CalendarCheck'],
				],
			}),
			statBand('divided', [
				['< 24 hrs', 'Reply time'],
				['Mon to Fri', '8am to 6pm'],
				['4.9/5', 'Customer rating'],
			]),
			faq('boxed', {
				title: 'Before you get in touch',
				faqs: [
					['How quickly will you reply?', 'Within one business day, usually much sooner.'],
					['Can I call instead?', 'Yes. Add your phone number and hours here.'],
					['Do you work with businesses like mine?', 'Say who you work with, so the right people reach out.'],
				],
			}),
		],
		{ pageName: 'Contact', keywords: ['contact us', 'get in touch', 'email', 'message', 'form'] },
	),

	page(
		'contact',
		'contact-book-call',
		'Book a Call',
		'Booking page: the call details, what you will cover, and proof it is worth the time.',
		[
			contactSplit('reversed', {
				eyebrow: 'Book a call',
				title: 'Pick a time that works for you',
				description: 'Thirty minutes, on video or phone. Add your scheduling tool beside this text.',
				steps: [
					['Choose a time', 'Pick any open slot in the calendar.', 'CalendarDays'],
					['Get a confirmation', 'With a link, and a reminder the day before.', 'MailCheck'],
					['Have the call', 'We come prepared with ideas for your situation.', 'Video'],
				],
			}),
			detailCard('inline', {
				eyebrow: 'The call',
				title: 'What to expect',
				details: [
					['Length', '30 minutes'],
					['Where', 'Video call or phone'],
					['Cost', 'Free'],
					['Bring', 'Just your questions'],
				],
				action: go('Pick A Time', '#calendar'),
			}),
			checkList('columns', [
				'Where you are today and where you want to be',
				'The biggest obstacle in the way',
				'What it would take to get there',
				'Whether we are the right fit to help',
			]),
			grid(
				'centered',
				{ eyebrow: 'From past calls', title: 'What people say', columns: '3' },
				testimonials('card', [
					'Sample testimonial: thirty minutes, and I left with a clear plan.',
					'Sample testimonial: no pressure at all, just good advice.',
					'Sample testimonial: worth booking even just for the ideas.',
				]),
			),
			faq('stacked', {
				title: 'About the call',
				faqs: [
					['Is it a sales call?', 'It is a working session. If we can help further, we will say so once.'],
					['Can I reschedule?', 'Yes, from the link in your confirmation email.'],
				],
			}),
		],
		{ pageName: 'Book A Call', keywords: ['booking', 'schedule', 'appointment', 'calendar', 'meeting'] },
	),

	page(
		'contact',
		'contact-request-quote',
		'Request a Quote',
		'Quote form, what to include, and what happens after you send it.',
		[
			pageHero('compact', {
				eyebrow: 'Free quote',
				title: 'Request your [[free quote]]',
				description: 'Tell us a little about the job. We reply with a fixed price within one business day.',
			}),
			leadCapture('card', {
				title: 'Get your quote',
				description: 'Start with your name and email. We will ask for the details next.',
				collect: 'full-name-email',
				cta: 'Request My Quote',
			}),
			checkList('columns', [
				'What you need done',
				'Where the job is',
				'When you would like it done',
				'Photos, if you have them',
			]),
			processSteps('columns', {
				eyebrow: 'What happens next',
				title: 'From request to fixed price',
				steps: [
					['We review your request', 'Usually within a few hours.'],
					['We ask anything we need', 'Or visit if the job needs it.'],
					['You get a fixed quote', 'In writing, with a start date.'],
				],
			}),
			marquee('inline', 'Trusted by local homes and businesses'),
			faq('boxed', {
				title: 'Quote questions',
				faqs: [
					['Is there any cost for a quote?', 'No. Quotes are free with no obligation.'],
					['How long is the quote valid?', 'Thirty days.'],
					['Can the price change?', 'Only if the job changes, and we agree it with you first.'],
				],
			}),
		],
		{ pageName: 'Get A Quote', keywords: ['quote', 'estimate', 'pricing request', 'rfq', 'bid'] },
	),

	page(
		'contact',
		'contact-locations',
		'Locations or Visit Us',
		'Every location with its address and hours, plus how to get there.',
		[
			pageHero('centered', {
				eyebrow: 'Visit us',
				title: 'Find a location [[near you]]',
				description: 'Walk in, call ahead, or book online at any of our locations.',
			}),
			grid('above', { columns: '3' }, [
				related('card', 'Main location', 'Open today until 7pm', '123 Main Street, Your City. Mon to Sat, 9am to 7pm.', '/contact'),
				related('card', 'North location', 'Open today until 6pm', '45 North Avenue, Your City. Mon to Fri, 9am to 6pm.', '/contact'),
				related('card', 'West location', 'Open today until 5pm', '78 West Road, Nearby Town. Mon to Sat, 10am to 5pm.', '/contact'),
			]),
			detailCard('card', {
				eyebrow: 'Main location',
				title: 'Getting here',
				description: 'Add a map image or embed beside these details.',
				details: [
					['Address', '123 Main Street, Your City'],
					['Phone', '(555) 010-0000'],
					['Parking', 'Free lot behind the building'],
					['Transit', 'Two minutes from the Main Street stop'],
				],
				action: go('Get Directions', '/contact'),
			}),
			faq('split', {
				title: 'Visiting questions',
				faqs: [
					['Do I need an appointment?', 'Walk-ins are welcome. Booking ahead guarantees your time.'],
					['Are you open on holidays?', 'Holiday hours are posted here a week ahead.'],
					['Is there step-free access?', 'Yes, at every location.'],
				],
			}),
			ctaBand(
				'centered',
				'Book ahead and skip the wait',
				'Choose a location and a time in under a minute.',
				[go('Book Online', '/book')],
			),
		],
		{ pageName: 'Locations', keywords: ['address', 'directions', 'hours', 'map', 'stores', 'offices'] },
	),

	page(
		'contact',
		'contact-support',
		'Help and Support',
		'Help topics first, answers next, and a way to reach a person last.',
		[
			pageHero('centered', {
				eyebrow: 'Support',
				title: 'How can we [[help]]?',
				description: 'Find an answer fast, or reach our team. We are here Monday to Friday, 8am to 6pm.',
			}),
			grid('above', { eyebrow: 'Popular topics', title: 'Browse help by topic', columns: '3' }, [
				related('card', 'Getting started', 'Topic', 'Set up your account and the basics.', '/help'),
				related('card', 'Billing and payments', 'Topic', 'Invoices, plans, and refunds.', '/help'),
				related('card', 'Account and security', 'Topic', 'Passwords, access, and privacy.', '/help'),
				related('card', 'Orders and delivery', 'Topic', 'Tracking, changes, and returns.', '/help'),
				related('card', 'Troubleshooting', 'Topic', 'Fixes for the most common problems.', '/help'),
				related('card', 'Guides and videos', 'Topic', 'Step-by-step walkthroughs.', '/help'),
			]),
			faq('stacked', {
				eyebrow: 'Quick answers',
				title: 'Most asked questions',
				faqs: [
					['How do I reset my password?', 'Use the “Forgot password” link on the sign-in page.'],
					['How do I change my plan?', 'From your account settings, under Billing.'],
					['Where is my order?', 'Use the tracking link in your confirmation email.'],
					['How do I get a refund?', 'Contact us within 30 days and we will sort it out.'],
				],
			}),
			splitCta('cards', [
				{
					eyebrow: 'Still stuck?',
					title: 'Contact support',
					body: 'Send us a message and we reply within a few hours.',
					cta: 'Contact Support',
					href: '/contact',
					featured: true,
				},
				{
					eyebrow: 'Prefer to read?',
					title: 'Browse the help center',
					body: 'Step-by-step guides for everything.',
					cta: 'Open Help Center',
					href: '/help',
				},
			]),
		],
		{ pageName: 'Support', keywords: ['help', 'help center', 'customer service', 'faq', 'support'] },
	),
]
