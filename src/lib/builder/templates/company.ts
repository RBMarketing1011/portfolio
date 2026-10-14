import {
	bento,
	checkList,
	ctaBand,
	detailCard,
	faq,
	go,
	grid,
	leadCapture,
	marquee,
	page,
	pageHero,
	pricingTiers,
	processSteps,
	related,
	splitCta,
	statBand,
	testimonials,
} from './helpers'

export const companyTemplates = [
	page(
		'company',
		'company-careers',
		'Careers',
		'Why work here, open roles, the hiring process, and what the team says.',
		[
			pageHero('centered', {
				eyebrow: 'Careers',
				title: 'Do the best work of your career, [[with good people]]',
				description: 'We are a small team that cares about doing things properly. Come help us grow.',
				actions: [go('See Open Roles', '#roles')],
			}),
			bento('accent', {
				eyebrow: 'Why join us',
				title: 'What you get here',
				tiles: [
					['Flexible hours', 'Work when you do your best work.', 'Clock'],
					['Real ownership', 'Your work ships, and you own it.', 'Rocket'],
					['Growth budget', 'Yearly budget for courses and books.', 'GraduationCap'],
					['Health cover', 'For you and your family.', 'HeartPulse'],
					['Time off that is real', 'Generous leave, and we expect you to take it.', 'Palmtree'],
					['Good people', 'Kind, curious, and great at what they do.', 'Users'],
				],
			}),
			grid('above', { eyebrow: 'Open roles', title: 'Current openings', columns: '2' }, [
				related('list', 'Role title', 'Full time · Remote', 'One line on the role and the team.', '/careers'),
				related('list', 'Role title', 'Full time · Your City', 'One line on the role and the team.', '/careers'),
				related('list', 'Role title', 'Part time · Remote', 'One line on the role and the team.', '/careers'),
				related('list', 'Do not see your role?', 'Open application', 'Tell us how you could help.', '/contact'),
			]),
			processSteps('columns', {
				eyebrow: 'Hiring process',
				title: 'What to expect after you apply',
				steps: [
					['Apply', 'A short form and your CV. No cover letter needed.'],
					['Intro call', 'Thirty minutes to get to know each other.'],
					['Skills chat', 'A practical conversation, never a trick test.'],
					['Offer', 'A decision within a week of your last chat.'],
				],
			}),
			grid(
				'centered',
				{ eyebrow: 'From the team', title: 'What it is like here', columns: '3' },
				testimonials('card', [
					'Sample quote from a team member: why they joined, and why they stayed.',
					'Sample quote from a team member: something about the people.',
					'Sample quote from a team member: something about the work itself.',
				]),
			),
			ctaBand(
				'centered',
				'Ready to join us?',
				'See the open roles, or send an open application.',
				[go('See Open Roles', '#roles')],
			),
		],
		{ pageName: 'Careers', keywords: ['jobs', 'hiring', 'work with us', 'join', 'recruitment'] },
	),

	page(
		'company',
		'company-faq',
		'FAQ',
		'Grouped answers to the questions people ask before buying, with a way to ask more.',
		[
			pageHero('centered', {
				eyebrow: 'FAQ',
				title: 'Questions, [[answered]]',
				description: 'Everything people ask us before getting started. Cannot find yours? Just ask.',
			}),
			faq('split', {
				eyebrow: 'Getting started',
				title: 'Before you buy',
				faqs: [
					['How do I get started?', 'Explain the first step in one or two sentences.'],
					['How long does it take?', 'Give a typical timeline.'],
					['What do you need from me?', 'List what the customer should have ready.'],
				],
			}),
			faq('split', {
				eyebrow: 'Pricing',
				title: 'Costs and payment',
				faqs: [
					['How much does it cost?', 'Give a range or link to your pricing page.'],
					['How do I pay?', 'List the payment methods you accept.'],
					['Do you offer refunds?', 'Explain your refund policy simply.'],
				],
			}),
			faq('split', {
				eyebrow: 'After you buy',
				title: 'Support and guarantees',
				faqs: [
					['What if something goes wrong?', 'Explain your guarantee and how to use it.'],
					['How do I get help?', 'Say how to reach support and when.'],
					['Can I cancel?', 'Explain how, and whether there is any notice period.'],
				],
			}),
			splitCta('cards', [
				{
					eyebrow: 'Still have a question?',
					title: 'Ask us directly',
					body: 'Send a message and we will reply within one business day.',
					cta: 'Contact Us',
					href: '/contact',
					featured: true,
				},
				{
					eyebrow: 'Ready to start?',
					title: 'See pricing',
					body: 'Clear plans, no hidden fees.',
					cta: 'See Pricing',
					href: '/pricing',
				},
			]),
		],
		{ pageName: 'FAQ', keywords: ['questions', 'help', 'answers', 'frequently asked'] },
	),

	page(
		'company',
		'company-partners',
		'Partner or Affiliate Program',
		'Recruit partners: the earnings, how it works, the tiers, and an application.',
		[
			pageHero('centered', {
				eyebrow: 'Partner program',
				title: 'Earn [[20% recurring]] for every customer you refer',
				description: 'Recommend us to your clients or audience and earn for as long as they stay.',
				actions: [go('Apply To Partner', '#apply')],
			}),
			statBand('cards', [
				['20%', 'Recurring commission'],
				['90 days', 'Cookie window'],
				['Monthly', 'Payouts'],
			]),
			processSteps('cards', {
				eyebrow: 'How it works',
				title: 'Start earning in three steps',
				steps: [
					['Apply', 'A short application, approved within two days.'],
					['Share', 'Use your link, banners, and ready-made emails.'],
					['Earn', 'Get paid every month for every active customer.'],
				],
			}),
			pricingTiers('divided', {
				eyebrow: 'Partner tiers',
				title: 'Grow as you refer',
				tiers: [
					{ name: 'Affiliate', price: '20%', blurb: 'For creators and audiences.', features: ['Recurring commission', 'Marketing kit', 'Monthly payouts'], cta: 'Apply', href: '#apply' },
					{ name: 'Partner', price: '25%', blurb: 'For agencies and consultants.', features: ['Everything in Affiliate', 'Partner dashboard', 'Co-marketing', 'Priority support'], cta: 'Apply', href: '#apply', featured: true },
					{ name: 'Strategic', price: 'Custom', blurb: 'For larger resellers.', features: ['Custom terms', 'Dedicated manager', 'Joint planning'], cta: 'Talk To Us', href: '/contact' },
				],
			}),
			faq('split', {
				title: 'Partner questions',
				faqs: [
					['Who can join?', 'Anyone with an audience or clients who would benefit.'],
					['How do I get paid?', 'Monthly, by bank transfer or PayPal.'],
					['Is there a minimum payout?', 'Payouts start from $50.'],
				],
			}),
			leadCapture('banner', {
				title: 'Apply to become a partner',
				description: 'Start with your name and email. We will send the short application.',
				collect: 'full-name-email',
				cta: 'Apply Now',
			}),
		],
		{ pageName: 'Partners', keywords: ['affiliate', 'reseller', 'partnership', 'commission', 'referral'] },
	),

	page(
		'company',
		'company-press',
		'Press and Media',
		'For journalists: coverage, the media contact, a media kit, and the boilerplate facts.',
		[
			pageHero('centered', {
				eyebrow: 'Press',
				title: 'News and [[media resources]]',
				description: 'Coverage, announcements, and everything a journalist needs in one place.',
				actions: [go('Download The Media Kit', '#kit')],
			}),
			marquee('rule', 'As featured in'),
			grid('above', { eyebrow: 'In the news', title: 'Recent coverage', columns: '3' }, [
				related('card', 'Headline of the article', 'Publication · Month Year', 'One line on what the piece covered.', '#'),
				related('card', 'Headline of the article', 'Publication · Month Year', 'One line on what the piece covered.', '#'),
				related('card', 'Headline of the article', 'Publication · Month Year', 'One line on what the piece covered.', '#'),
			]),
			detailCard('rows', {
				eyebrow: 'Media contact',
				title: 'Working on a story?',
				description: 'We reply to press requests the same day.',
				details: [
					['Contact', 'Name, role'],
					['Email', 'press@yourbusiness.com'],
					['Phone', '(555) 010-0000'],
					['Founded', 'Year, Your City'],
				],
				action: go('Email The Press Team', 'mailto:press@yourbusiness.com'),
			}),
			checkList('columns', [
				'Logos in every format',
				'Founder and team photos',
				'Product screenshots',
				'Company fact sheet and boilerplate',
			]),
			ctaBand(
				'centered',
				'Get the full media kit',
				'Logos, photos, and facts, ready to use.',
				[go('Download The Media Kit', '#kit')],
			),
		],
		{ pageName: 'Press', keywords: ['media', 'news', 'press kit', 'newsroom', 'journalists'] },
	),
]
