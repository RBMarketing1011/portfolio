import {
	alt,
	authorBio,
	checkList,
	countdown,
	ctaBand,
	detailCard,
	faq,
	features,
	go,
	grid,
	leadCapture,
	marquee,
	mediaGallery,
	page,
	pageHero,
	pricingTiers,
	processSteps,
	related,
	splitHero,
	teamCard,
	testimonials,
	videoPlayer,
} from './helpers'

/*
 * Registration pages convert on specifics: the date, the time, what someone will
 * be able to do afterwards, and who is teaching it. Put those above everything else.
 */
const speakers = (variant: 'card' | 'portrait' | 'row', count: number) =>
	Array.from({ length: count }, () =>
		teamCard(variant, 'Speaker name', 'Their title, Company', 'One line on why they are worth listening to on this topic.'),
	)

export const eventTemplates = [
	page(
		'events',
		'event-webinar',
		'Webinar Registration',
		'Date and time up front, what attendees will learn, the speakers, and a signup.',
		[
			splitHero('split', {
				eyebrow: 'Free live webinar',
				title: 'How to [[get more customers]] without spending more',
				description:
					'A free 45-minute session with practical steps you can use the same week. Live Q&A at the end.',
				actions: [go('Save My Seat', '#register')],
				mediaLabel: 'Webinar title card',
			}),
			detailCard('card', {
				eyebrow: 'When',
				title: 'Join us live',
				details: [
					['Date', 'Thursday, the 14th'],
					['Time', '1pm Eastern, 10am Pacific'],
					['Length', '45 minutes plus Q&A'],
					['Cost', 'Free'],
				],
				action: go('Save My Seat', '#register'),
				note: 'Cannot make it live? Register anyway and we will send the recording.',
			}),
			grid(
				'beside',
				{ eyebrow: 'What you will learn', title: 'Walk away with a plan, not just notes' },
				features('inline', [
					['The biggest quick win', 'The one change that brings results fastest.', 'Zap'],
					['What to stop doing', 'The common habits that waste money.', 'Ban'],
					['A simple weekly routine', 'Thirty minutes a week that keeps things moving.', 'CalendarCheck'],
					['Live answers', 'Bring your questions for the Q&A.', 'MessagesSquare'],
				]),
			),
			grid('above', { eyebrow: 'Your hosts', title: 'Who is presenting', columns: '2' }, speakers('row', 2)),
			marquee('inline', 'Past attendees came from'),
			faq('stacked', {
				title: 'Webinar questions',
				faqs: [
					['Is it really free?', 'Yes, completely.'],
					['Will there be a recording?', 'Yes. Everyone who registers gets it, even if they attend live.'],
					['Do I need to install anything?', 'No. It runs in your browser.'],
				],
			}),
			leadCapture('banner', {
				title: 'Save your free seat',
				description: 'Register now and we will send the link and a reminder.',
				collect: 'name-email',
				cta: 'Save My Seat',
			}),
		],
		{ pageName: 'Webinar', keywords: ['webinar', 'online event', 'live session', 'registration', 'zoom'] },
	),

	page(
		'events',
		'event-live',
		'Live Event or Conference',
		'The full event page: countdown, agenda, speakers, tickets, venue, and gallery.',
		[
			pageHero('centered', {
				eyebrow: 'Live event',
				title: 'The one-day event for [[people who build]]',
				description: 'Talks, workshops, and the people you have been meaning to meet, all in one room.',
				actions: [go('Get Tickets', '#tickets'), alt('See The Agenda', '#agenda')],
				stats: [
					['20+', 'Speakers'],
					['500', 'Attendees'],
					['1 day', 'Of talks and workshops'],
				],
			}),
			countdown('inline', {
				eyebrow: 'Doors open in',
				title: 'Early-bird pricing ends soon',
			}),
			detailCard('inline', {
				eyebrow: 'The details',
				title: 'Where and when',
				details: [
					['Date', 'Saturday, the 21st'],
					['Time', '9am to 6pm, drinks after'],
					['Venue', 'Venue name, Your City'],
					['Includes', 'Lunch, coffee, and the evening social'],
				],
				action: go('Get Tickets', '#tickets'),
			}),
			processSteps('timeline', {
				eyebrow: 'Agenda',
				title: 'How the day runs',
				steps: [
					['9am: Welcome and keynote', 'Opening talk from the headline speaker.'],
					['11am: Breakout sessions', 'Choose from three tracks.'],
					['1pm: Lunch and networking', 'Included with every ticket.'],
					['3pm: Workshops', 'Hands-on sessions in small groups.'],
					['5pm: Closing panel', 'Then drinks and the evening social.'],
				],
			}),
			grid('centered', { eyebrow: 'Speakers', title: 'Who you will hear from', columns: '4' }, speakers('portrait', 4)),
			pricingTiers('cards', {
				eyebrow: 'Tickets',
				title: 'Choose your ticket',
				tiers: [
					{ name: 'Early bird', price: '$99', blurb: 'Limited, while they last.', features: ['Full day access', 'Lunch included', 'Evening social'], cta: 'Get Early Bird', href: '/checkout', featured: true },
					{ name: 'Standard', price: '$149', blurb: 'After early bird sells out.', features: ['Full day access', 'Lunch included', 'Evening social'], cta: 'Get Standard', href: '/checkout' },
					{ name: 'VIP', price: '$299', blurb: 'The full experience.', features: ['Everything in Standard', 'Front-row seating', 'Speaker dinner'], cta: 'Get VIP', href: '/checkout' },
				],
			}),
			mediaGallery('carousel', { eyebrow: 'Last year', title: 'Moments from the last event' }),
			faq('boxed', {
				title: 'Event questions',
				faqs: [
					['Can I get a refund?', 'Yes, up to 14 days before the event.'],
					['Is there parking?', 'Yes, at the venue, with a discount for attendees.'],
					['Can I transfer my ticket?', 'Yes, just email us the new name.'],
				],
			}),
			ctaBand(
				'centered',
				'See you there',
				'Early-bird tickets are limited. Grab yours before they go.',
				[go('Get Tickets', '#tickets')],
			),
		],
		{ pageName: 'Event', keywords: ['conference', 'summit', 'meetup', 'tickets', 'agenda', 'in person'] },
	),

	page(
		'events',
		'event-workshop',
		'Workshop or Course',
		'Sell a paid workshop: outcomes, the modules, the instructor, dates and seats.',
		[
			splitHero('split', {
				eyebrow: 'Hands-on workshop',
				title: 'Learn it by [[doing it]], in one afternoon',
				description: 'A small-group workshop where you leave with real work done, not just notes.',
				actions: [go('Reserve My Spot', '#reserve')],
				mediaLabel: 'Photo of a past workshop',
			}),
			checkList('columns', [
				'Leave with a finished, usable result',
				'Small group, maximum 12 people',
				'All materials included',
				'Follow-up session two weeks later',
			]),
			processSteps('cards', {
				eyebrow: 'What we cover',
				title: 'The workshop, step by step',
				steps: [
					['The fundamentals', 'The core ideas, explained simply.'],
					['Guided practice', 'Work through it together, with help at every step.'],
					['Your own project', 'Apply it to your real situation.'],
				],
			}),
			detailCard('card', {
				eyebrow: 'Details',
				title: 'Reserve your place',
				details: [
					['Dates', 'Choose from the next three sessions'],
					['Length', '4 hours'],
					['Group size', '12 people maximum'],
					['Price', '$249, materials included'],
				],
				action: go('Reserve My Spot', '#reserve'),
				note: 'Only a few seats left in the next session.',
			}),
			authorBio('card', {
				name: 'Instructor name',
				role: 'Workshop lead',
				bio: 'Why they are the right person to teach this: experience, people taught, results.',
			}),
			grid(
				'centered',
				{ eyebrow: 'Past attendees', title: 'What people said afterwards', columns: '3' },
				testimonials('card', [
					'Sample testimonial: I learned more in four hours than in months on my own.',
					'Sample testimonial: small group, lots of attention, and I left with something finished.',
					'Sample testimonial: the follow-up session was a great touch.',
				]),
			),
			faq('split', {
				title: 'Workshop questions',
				faqs: [
					['Do I need experience?', 'No. We start from the basics.'],
					['What do I need to bring?', 'Just yourself. Everything else is provided.'],
					['What if I cannot make my date?', 'Move to any future session for free.'],
				],
			}),
			ctaBand(
				'centered',
				'Seats are limited',
				'Reserve your place in the next workshop today.',
				[go('Reserve My Spot', '#reserve')],
			),
		],
		{ pageName: 'Workshop', keywords: ['class', 'course', 'training', 'bootcamp', 'masterclass'] },
	),

	page(
		'events',
		'event-replay',
		'On-Demand Recording',
		'For a past webinar: the recording behind a short form, key takeaways, related content.',
		[
			splitHero('split', {
				eyebrow: 'Watch on demand',
				title: 'Missed it live? [[Watch the recording.]]',
				description: 'The full session, plus the slides, free. Enter your email to unlock it.',
				actions: [go('Watch Now', '#watch')],
				mediaLabel: 'Recording thumbnail',
			}),
			leadCapture('card', {
				title: 'Unlock the recording',
				description: 'Free. The video and slides arrive in your inbox.',
				collect: 'name-email',
				cta: 'Watch Now',
			}),
			videoPlayer('player', {
				title: 'Preview: the first five minutes',
			}),
			checkList('stacked', [
				'The three biggest takeaways from the session',
				'The framework, with an example you can copy',
				'Answers to the most asked questions from the live Q&A',
			]),
			grid('above', { eyebrow: 'Presented by', title: 'Your hosts', columns: '2' }, speakers('row', 2)),
			grid('above', { eyebrow: 'Keep learning', title: 'More sessions you might like', columns: '3' }, [
				related('card', 'Another session title', 'Recording', 'One line on what it covers.', '/webinars'),
				related('card', 'Another session title', 'Recording', 'One line on what it covers.', '/webinars'),
				related('card', 'Upcoming live session', 'Upcoming', 'Register for the next one.', '/webinars'),
			]),
		],
		{ pageName: 'Recording', keywords: ['replay', 'on demand', 'recording', 'video', 'gated video'] },
	),
]
