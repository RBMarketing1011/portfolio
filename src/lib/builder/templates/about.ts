import {
	alt,
	authorBio,
	beforeAfter,
	bento,
	callout,
	checkList,
	ctaBand,
	go,
	grid,
	marquee,
	page,
	pageHero,
	processSteps,
	prose,
	splitCta,
	splitHero,
	statBand,
	teamCard,
	testimonials,
} from './helpers'

/*
 * About pages are read by people deciding whether to trust you. They work when
 * they are about the customer as much as the company: why you started, what you
 * believe, who they will actually deal with, and what to do next.
 */
const team = (variant: 'card' | 'portrait' | 'row', count: number) =>
	Array.from({ length: count }, (_, index) =>
		teamCard(
			variant,
			'Team member name',
			index === 0 ? 'Founder' : 'Their role',
			'One or two lines about them, and something human: what they love outside work.',
		),
	)

export const aboutTemplates = [
	page(
		'about',
		'about-story',
		'Company Story',
		'Why you started, how you have grown, who is behind it, and who trusts you.',
		[
			pageHero('centered', {
				eyebrow: 'About us',
				title: 'We started this to [[fix something broken]]',
				description: 'One sentence on why the company exists and who it exists for.',
			}),
			prose(
				'plain',
				'<h2>Our story</h2><p>How it started: the moment you saw the problem and decided to do something about it.</p><p>What you did differently from day one, and why it still matters to the people you serve.</p><p>Where you are today, and where you are going next.</p>',
			),
			statBand('row', [
				['2012', 'Founded'],
				['40', 'People on the team'],
				['3,000+', 'Customers served'],
			]),
			processSteps('timeline', {
				eyebrow: 'Milestones',
				title: 'How we got here',
				steps: [
					['The beginning', 'Where and how it started.'],
					['The first big win', 'The moment it started working.'],
					['Growing the team', 'When you brought in the people who made it bigger.'],
					['Today', 'Where you are now and what is next.'],
				],
			}),
			grid('centered', { eyebrow: 'The team', title: 'The people behind the work', columns: '4' }, team('card', 4)),
			marquee('rule', 'Trusted by'),
			ctaBand(
				'split',
				'Want to work with us?',
				'We would love to hear what you are working on.',
				[go('Get In Touch', '/contact'), alt('See Our Work', '/portfolio')],
			),
		],
		{ pageName: 'About', keywords: ['about us', 'story', 'history', 'company', 'who we are'] },
	),

	page(
		'about',
		'about-team',
		'Meet the Team',
		'Faces first: the whole team, how you work together, and ways to work with or join you.',
		[
			pageHero('centered', {
				eyebrow: 'Our team',
				title: 'Meet the people [[you will work with]]',
				description: 'No call centers, no hand-offs. These are the people who pick up the phone and do the work.',
			}),
			grid('centered', { columns: '4' }, team('portrait', 8)),
			checkList('columns', [
				'You always know who is responsible',
				'The person you meet is the person who does the work',
				'Every team member is trained and certified',
				'We answer within one business day',
			]),
			bento('numbered', {
				eyebrow: 'What we value',
				title: 'How we work together',
				tiles: [
					['Own it', 'If it is ours to do, we see it through.', 'Hand'],
					['Say it plainly', 'Clear answers, even when they are not what you hoped.', 'MessageCircle'],
					['Keep getting better', 'Every project teaches us something.', 'TrendingUp'],
				],
			}),
			splitCta('divided', [
				{
					eyebrow: 'Work with us',
					title: 'Start a project',
					body: 'Tell us what you need and meet the team who will do it.',
					cta: 'Get In Touch',
					href: '/contact',
					featured: true,
				},
				{
					eyebrow: 'Join us',
					title: 'See open roles',
					body: 'We are always looking for good people.',
					cta: 'View Careers',
					href: '/careers',
				},
			]),
		],
		{ pageName: 'Team', keywords: ['team', 'people', 'staff', 'leadership', 'who we are'] },
	),

	page(
		'about',
		'about-mission-values',
		'Mission and Values',
		'What you stand for, how it shows up in the work, and proof that it does.',
		[
			pageHero('centered', {
				eyebrow: 'Our mission',
				title: 'Make it [[simple, honest, and fair]]',
				description: 'Write your mission in one sentence that a customer would care about.',
			}),
			bento('accent', {
				eyebrow: 'Our values',
				title: 'What we believe',
				tiles: [
					['Customers first', 'Every decision starts with what is right for the customer.', 'Heart', '2'],
					['Honesty', 'Clear prices, clear advice, no fine print.', 'Scale'],
					['Craft', 'We take pride in work done properly.', 'Gem'],
					['Community', 'We hire, buy, and give back locally.', 'Users', '2'],
				],
			}),
			beforeAfter('columns', {
				eyebrow: 'Why it matters',
				title: 'How we do things differently',
				beforeLabel: 'Too often in our industry',
				afterLabel: 'How we do it',
				before: ['Prices that change after you agree', 'Advice that serves the seller', 'Corners cut when nobody is watching'],
				after: ['A fixed price, in writing', 'Advice we would give our own family', 'Work we are happy to sign our name to'],
			}),
			statBand('cards', [
				['1%', 'Of revenue given to local causes'],
				['100%', 'Of staff paid a living wage'],
				['0', 'Hidden fees, ever'],
			]),
			grid(
				'centered',
				{ eyebrow: 'In practice', title: 'Customers notice', columns: '3' },
				testimonials('card', [
					'Sample testimonial: they told us we did not need the expensive option. That honesty won us over.',
					'Sample testimonial: you can tell they actually care.',
					'Sample testimonial: fair, upfront, and true to their word.',
				]),
			),
			ctaBand(
				'centered',
				'Work with a company that shares your values',
				'Get in touch and see the difference for yourself.',
				[go('Get In Touch', '/contact')],
			),
		],
		{ pageName: 'Our Mission', keywords: ['values', 'mission', 'purpose', 'culture', 'beliefs'] },
	),

	page(
		'about',
		'about-founder',
		'Founder Story',
		'A personal page for the person behind the business: their story and why it matters to you.',
		[
			splitHero('split', {
				eyebrow: 'Meet the founder',
				title: 'Hi, I am [[Your Name]]',
				description:
					'One warm paragraph: who you are, who you help, and why you care about getting it right.',
				actions: [go('Work With Me', '/contact'), alt('Read My Story', '#story')],
				mediaLabel: 'Your photo',
			}),
			prose(
				'plain',
				'<h2>Why I started</h2><p>The moment that set this in motion. Make it personal and specific.</p><h2>What I learned</h2><p>The lesson that shapes how you work with every client today.</p><h2>Why it matters to you</h2><p>Connect your story back to the reader and what they will get from working with you.</p>',
			),
			callout('banner', {
				label: 'My promise',
				icon: 'Quote',
				html: '<p>Write the one promise you make to every client, in your own voice.</p>',
			}),
			statBand('row', [
				['15 yrs', 'Experience'],
				['600+', 'Clients helped'],
				['2', 'Books written'],
			]),
			authorBio('centered', {
				name: 'Your Name',
				role: 'Founder',
				bio: 'A short, third-person bio for press and partners: credentials, experience, and where you have been featured.',
				action: go('Get In Touch', '/contact'),
			}),
			ctaBand(
				'centered',
				'Let’s work together',
				'Book a free call and let’s see how I can help.',
				[go('Book A Free Call', '/book')],
			),
		],
		{ pageName: 'About', keywords: ['founder', 'owner', 'bio', 'personal', 'story'] },
	),
]
