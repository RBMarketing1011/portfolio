import {
	article,
	authorBio,
	beforeAfter,
	bento,
	checkList,
	detailCard,
	faq,
	features,
	go,
	grid,
	leadCapture,
	page,
	pageHero,
	processSteps,
	splitHero,
	statBand,
	testimonials,
} from './helpers'

/*
 * A lead magnet page asks for one thing, an email address, and earns it by being
 * specific about what is inside. The form appears twice: once for people who are
 * already sold, and again after the proof for everyone else.
 */
export const leadMagnetTemplates = [
	page(
		'lead-magnet',
		'lead-guide-download',
		'Free Guide or Ebook',
		'Gated download: what is inside, who it is for, the author, and the form twice.',
		[
			splitHero('split', {
				eyebrow: 'Free guide',
				title: 'The [[7 mistakes]] that quietly cost you customers',
				description:
					'A short, practical guide to finding and fixing the leaks in your business. Read it in 20 minutes and act on it the same day.',
				actions: [go('Send Me The Guide', '#get-guide')],
				mediaLabel: 'Cover of the guide',
			}),
			leadCapture('card', {
				title: 'Get the free guide',
				description: 'Enter your details and it lands in your inbox in under a minute.',
				collect: 'name-email',
				cta: 'Send Me The Guide',
			}),
			grid(
				'above',
				{ eyebrow: 'What is inside', title: 'Seven chapters, each with a fix you can use today', columns: '3' },
				features('numbered', [
					['Mistake one', 'Describe the first mistake and the cost of ignoring it.'],
					['Mistake two', 'Each chapter ends with a checklist you can work through.'],
					['Mistake three', 'Use real numbers wherever you can. They make it credible.'],
					['Mistake four', 'Short chapters get read. Long ones get saved for later.'],
					['Mistake five', 'Name the quick win so readers act straight away.'],
					['Mistakes six and seven', 'Finish strong with the one most people miss.'],
				]),
			),
			checkList('columns', [
				'You run a small or growing business',
				'You want more customers without more ad spend',
				'You have twenty minutes this week',
				'You prefer practical steps to theory',
			]),
			authorBio('card', {
				name: 'Your name',
				role: 'Author of the guide',
				bio: 'A short bio that says why the reader should trust you on this topic: years of experience, people helped, results.',
			}),
			grid(
				'centered',
				{ eyebrow: 'Readers say', title: 'Worth the twenty minutes', columns: '3' },
				testimonials('card', [
					'Sample testimonial: fixed two of the seven the same afternoon.',
					'Sample testimonial: short, clear, and actually useful. Rare for a free guide.',
					'Sample testimonial: I shared it with my whole team.',
				]),
			),
			faq('boxed', {
				title: 'Quick questions',
				faqs: [
					['Is it really free?', 'Yes. No payment details, ever.'],
					['What format is it?', 'A PDF you can read on any device or print.'],
					['Will you spam me?', 'No. You get the guide and an occasional useful email. Unsubscribe in one click.'],
				],
			}),
			leadCapture('banner', {
				title: 'Get the guide free',
				description: 'Twenty minutes to read. A lot longer to forget.',
				collect: 'name-email',
				cta: 'Send Me The Guide',
			}),
		],
		{ pageName: 'Free Guide', keywords: ['ebook', 'download', 'pdf', 'whitepaper', 'opt-in', 'gated'] },
	),

	page(
		'lead-magnet',
		'lead-checklist',
		'Checklist or Template',
		'Short page for a quick-win download: the promise, a peek inside, and one form.',
		[
			pageHero('centered', {
				eyebrow: 'Free checklist',
				title: 'The [[one-page checklist]] we use on every project',
				description:
					'Twenty-five checks that catch the problems before your customers do. Print it, pin it, use it.',
			}),
			leadCapture('card', {
				title: 'Download the checklist',
				description: 'Free. Sent straight to your inbox.',
				cta: 'Get The Checklist',
			}),
			bento('divided', {
				eyebrow: 'A peek inside',
				title: 'Grouped so you can work through it in order',
				tiles: [
					['Before you start', 'The setup checks that save the most time later.', 'ClipboardList'],
					['While you work', 'Quality checks for the middle of every project.', 'ListChecks'],
					['Before you launch', 'The final pass that catches what everyone misses.', 'Rocket'],
				],
			}),
			statBand('divided', [
				['25', 'Checks in one page'],
				['10 min', 'To run through it'],
				['Free', 'Forever'],
			]),
			grid(
				'centered',
				{ title: 'People who use it', columns: '2' },
				testimonials('card', [
					'Sample testimonial: it lives on my desk now. Caught a costly mistake in week one.',
					'Sample testimonial: simple, and it covers things I never thought to check.',
				]),
			),
			leadCapture('ruled', {
				title: 'Get your copy',
				description: 'One page. Twenty-five checks. Zero cost.',
				cta: 'Get The Checklist',
			}),
		],
		{ pageName: 'Free Checklist', keywords: ['template', 'cheat sheet', 'download', 'swipe file', 'toolkit'] },
	),

	page(
		'lead-magnet',
		'lead-free-audit',
		'Free Audit or Assessment',
		'High-intent offer: what the audit covers, how it works, what it usually finds.',
		[
			splitHero('split', {
				eyebrow: 'Free audit, worth $500',
				title: 'Find out exactly [[what is holding you back]]',
				description:
					'We review your setup and send a short video walkthrough of the three biggest fixes, ranked by impact. Free, with no obligation.',
				actions: [go('Get My Free Audit', '#audit')],
				mediaLabel: 'Example of an audit report',
			}),
			detailCard('card', {
				eyebrow: 'What you get',
				title: 'A personal review, not an automated report',
				details: [
					['Delivered as', 'A 10-minute video walkthrough plus a written summary'],
					['Turnaround', 'Within three business days'],
					['Covers', 'Your three biggest opportunities, ranked'],
					['Cost', 'Free. No obligation.'],
				],
				action: go('Get My Free Audit', '#audit'),
				note: 'We only take on a few audits each week, so we can do them properly.',
			}),
			processSteps('columns', {
				eyebrow: 'How it works',
				title: 'Three steps to your audit',
				steps: [
					['Tell us about you', 'A short form with the basics. Two minutes.'],
					['We do the review', 'A specialist looks at everything by hand.'],
					['You get the fixes', 'A walkthrough video and summary in your inbox.'],
				],
			}),
			beforeAfter('columns', {
				eyebrow: 'What we usually find',
				title: 'The most common problems, and their fixes',
				beforeLabel: 'What we find',
				afterLabel: 'What we recommend',
				before: [
					'Visitors leave before they see the offer',
					'No clear next step on key pages',
					'Slow pages losing mobile visitors',
				],
				after: [
					'A clearer opening that matches what they searched',
					'One obvious action on every page',
					'Quick speed fixes that keep people around',
				],
			}),
			grid(
				'centered',
				{ eyebrow: 'Results', title: 'What people did with their audit', columns: '3' },
				testimonials('card', [
					'Sample testimonial: we fixed the first item on the list and enquiries went up the same week.',
					'Sample testimonial: more useful than the paid report we bought last year.',
					'Sample testimonial: clear, specific, and no sales pressure afterwards.',
				]),
			),
			faq('split', {
				title: 'About the audit',
				faqs: [
					['Why is it free?', 'It is the best way to show what we can do. Some people hire us afterwards, most simply use the fixes.'],
					['What do you need from me?', 'Just a link and a few details about your goals.'],
					['Is there a catch?', 'No. If we can help further we will mention it once.'],
				],
			}),
			leadCapture('banner', {
				title: 'Request your free audit',
				description: 'Spots are limited each week. Request yours now.',
				collect: 'full-name-email',
				cta: 'Get My Free Audit',
			}),
		],
		{ pageName: 'Free Audit', keywords: ['assessment', 'review', 'analysis', 'report', 'evaluation'] },
	),

	page(
		'lead-magnet',
		'lead-newsletter',
		'Newsletter Signup',
		'Sell the newsletter like a product: what you get, how often, and recent issues.',
		[
			pageHero('centered', {
				eyebrow: 'Free weekly newsletter',
				title: 'One useful idea, [[every Tuesday]]',
				description:
					'Join thousands of readers who get one practical, five-minute read each week. No fluff, no spam, unsubscribe any time.',
			}),
			leadCapture('card', {
				title: 'Join the newsletter',
				description: 'Free. One email a week.',
				cta: 'Subscribe',
			}),
			checkList('inline', ['Five-minute reads', 'Every Tuesday', 'Unsubscribe in one click']),
			grid(
				'above',
				{ eyebrow: 'Recent issues', title: 'A taste of what you will get', columns: '3' },
				[
					article('card', 'The two-minute habit that saves an hour a week', 'Why small, boring routines beat big plans.', 'Productivity', '4 min'),
					article('card', 'What to do when a customer says it is too expensive', 'Three replies that keep the conversation going.', 'Sales', '5 min'),
					article('card', 'The one number worth checking every Monday', 'Skip the dashboards. Watch this.', 'Growth', '3 min'),
				],
			),
			grid(
				'centered',
				{ eyebrow: 'Readers', title: 'Why people stay subscribed', columns: '2' },
				testimonials('card', [
					'Sample testimonial: the only newsletter I read every single week.',
					'Sample testimonial: short, smart, and always something I can use.',
				]),
			),
			leadCapture('ruled', {
				title: 'Get next Tuesday’s issue',
				description: 'Join free and get the next one in your inbox.',
				cta: 'Subscribe',
			}),
		],
		{ pageName: 'Newsletter', keywords: ['subscribe', 'email list', 'mailing list', 'updates', 'digest'] },
	),

	page(
		'lead-magnet',
		'lead-email-course',
		'Free Email Course',
		'A short email course: the day-by-day lessons, the outcome, and a signup.',
		[
			splitHero('split', {
				eyebrow: 'Free 5-day email course',
				title: 'Learn the basics in [[five short lessons]]',
				description:
					'One email a day for five days. Each lesson takes ten minutes and ends with one thing to do.',
				actions: [go('Start The Course', '#signup')],
				mediaLabel: 'Course preview',
			}),
			processSteps('timeline', {
				eyebrow: 'The lessons',
				title: 'What you will learn each day',
				steps: [
					['Day one: the foundation', 'The one idea everything else builds on.'],
					['Day two: the first win', 'A quick change you can make the same day.'],
					['Day three: the common trap', 'The mistake most people make, and how to avoid it.'],
					['Day four: the system', 'Turn what you learned into a routine.'],
					['Day five: what is next', 'Where to go from here, at your own pace.'],
				],
			}),
			leadCapture('card', {
				title: 'Start the free course',
				description: 'Lesson one arrives in a few minutes.',
				collect: 'name-email',
				cta: 'Start The Course',
			}),
			grid(
				'centered',
				{ eyebrow: 'Graduates', title: 'What people said after day five', columns: '3' },
				testimonials('card', [
					'Sample testimonial: I learned more in five emails than in a month of videos.',
					'Sample testimonial: each lesson was short enough to actually finish.',
					'Sample testimonial: day two alone was worth signing up for.',
				]),
			),
			faq('stacked', {
				title: 'About the course',
				faqs: [
					['How much time does it take?', 'About ten minutes a day for five days.'],
					['Is it really free?', 'Yes, completely.'],
					['What happens after day five?', 'You get our weekly newsletter, which you can leave at any time.'],
				],
			}),
		],
		{ pageName: 'Free Course', keywords: ['email course', 'mini course', 'lessons', 'drip', 'training'] },
	),
]
