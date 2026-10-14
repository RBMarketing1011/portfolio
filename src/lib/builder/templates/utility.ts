import {
	alt,
	authPanel,
	countdown,
	go,
	grid,
	leadCapture,
	notice,
	page,
	pageHero,
	prose,
	related,
	splitCta,
	tableOfContents,
} from './helpers'

/*
 * Utility pages are where people land after something happened (they signed up,
 * mistyped a link, arrived early). Each one tells them what happened and gives
 * them a useful next step instead of a dead end.
 */
const legalSections = [
	'Information we collect',
	'How we use it',
	'Who we share it with',
	'How long we keep it',
	'Your rights',
	'Contact us',
]

export const utilityTemplates = [
	page(
		'utility',
		'utility-thank-you',
		'Thank You',
		'Confirms the action, says what happens next, and offers a useful next step.',
		[
			notice('confirmation', {
				icon: 'CircleCheck',
				title: 'Thanks, [[we have got it]]',
				description: 'Your request is in. Here is what happens next.',
				steps: [
					['1', 'Check your inbox for a confirmation email'],
					['2', 'We will be in touch within one business day'],
					['3', 'In the meantime, take a look around'],
				],
				actions: [go('Back To Home', '/'), alt('Read The Blog', '/blog')],
			}),
			grid('above', { eyebrow: 'While you wait', title: 'You might find these useful', columns: '3' }, [
				related('card', 'How we work', 'Process', 'What to expect from start to finish.', '/process'),
				related('card', 'Recent work', 'Case studies', 'See what we have done for others.', '/case-studies'),
				related('card', 'Common questions', 'FAQ', 'Answers to what people ask most.', '/faq'),
			]),
			splitCta('divided', [
				{
					eyebrow: 'Know someone else?',
					title: 'Share with a friend',
					body: 'Pass it on to someone who would find it useful.',
					cta: 'Refer A Friend',
					href: '/refer',
				},
				{
					eyebrow: 'Stay in the loop',
					title: 'Follow along',
					body: 'Tips and news, once a week.',
					cta: 'Get The Newsletter',
					href: '/newsletter',
					featured: true,
				},
			]),
		],
		{ pageName: 'Thank You', keywords: ['confirmation', 'success', 'submitted', 'order complete'] },
	),

	page(
		'utility',
		'utility-not-found',
		'Not Found (404)',
		'An on-brand 404 with routes back to the pages people usually want.',
		[
			notice('code', {
				code: '404',
				title: 'This page has [[wandered off]]',
				description: 'The link may be old, or the address mistyped. Here are some good places to start.',
				actions: [go('Back To Home', '/'), alt('Contact Us', '/contact')],
			}),
			grid('above', { title: 'Popular pages', columns: '4' }, [
				related('card', 'Services', 'Page', 'What we do and how it works.', '/services'),
				related('card', 'Pricing', 'Page', 'Plans and what they include.', '/pricing'),
				related('card', 'About', 'Page', 'Who we are.', '/about'),
				related('card', 'Contact', 'Page', 'Get in touch.', '/contact'),
			]),
		],
		{ pageName: 'Page Not Found', keywords: ['404', 'error', 'missing', 'broken link'] },
	),

	page(
		'utility',
		'utility-coming-soon',
		'Coming Soon',
		'A pre-launch page that turns early visitors into a launch list.',
		[
			countdown('boxed', {
				eyebrow: 'Coming soon',
				title: 'Something new is [[almost here]]',
				description: 'We are putting the finishing touches on it. Join the list to hear the moment it launches.',
				note: 'Set the countdown to your real launch date.',
			}),
			leadCapture('card', {
				title: 'Be first to know',
				description: 'Early subscribers get launch-day pricing.',
				cta: 'Notify Me',
			}),
		],
		{ pageName: 'Coming Soon', keywords: ['launch', 'pre-launch', 'waitlist', 'under construction'] },
	),

	page(
		'utility',
		'utility-sign-in',
		'Sign In',
		'A sign-in screen with a customer quote beside it.',
		[
			authPanel('split', {
				eyebrow: 'Welcome back',
				title: 'Sign in to your account',
				description: 'Pick up where you left off.',
				footnote: 'New here?',
				footnoteLink: 'Create an account',
				href: '/signup',
				asideQuote: 'Sample testimonial: the quote beside the form reminds people why they signed up.',
			}),
		],
		{ pageName: 'Sign In', keywords: ['login', 'log in', 'account', 'members', 'portal'] },
	),

	page(
		'utility',
		'utility-legal',
		'Legal or Privacy Policy',
		'Narrow, readable legal copy with a linked table of contents.',
		[
			pageHero('compact', {
				eyebrow: 'Legal',
				title: 'Privacy policy',
				description: 'Last updated: add the date. A plain-language summary of how we handle your information.',
			}),
			tableOfContents('card', 'On this page', legalSections),
			prose(
				'marked',
				legalSections
					.map(
						(heading) =>
							`<h2>${heading}</h2><p>Replace this with your policy text. Have it reviewed by a qualified professional before publishing.</p>`,
					)
					.join(''),
			),
		],
		{ pageName: 'Privacy Policy', keywords: ['terms', 'privacy', 'cookies', 'policy', 'legal', 'gdpr'] },
	),
]
