import {
	alt,
	announcement,
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
	masonry,
	page,
	pageHero,
	pricingTiers,
	processSteps,
	splitCta,
	splitHero,
	statBand,
	testimonials,
	videoPlayer,
} from './helpers'

/*
 * Promotions convert on a clear offer, a real deadline, and as little reading as
 * possible between seeing the deal and taking it. Every countdown here is set by
 * hand, so its numbers should be changed to the real end of the offer.
 */
export const promotionTemplates = [
	page(
		'promotion',
		'promo-limited-offer',
		'Limited-Time Offer',
		'One offer, a countdown, what is included, and a single button.',
		[
			announcement('ticker', {
				message: 'Offer ends Sunday at midnight. Do not miss it.',
			}),
			countdown('boxed', {
				eyebrow: 'Ends Sunday at midnight',
				title: 'Save [[30%]] on everything, this week only',
				description:
					'Our biggest discount of the year, on every plan and package. When the timer hits zero, prices go back up.',
				note: 'Set these numbers to the real time left on your offer.',
			}),
			detailCard('card', {
				eyebrow: 'The offer',
				title: 'What you get',
				details: [
					['Discount', '30% off any plan or package'],
					['Applies to', 'New and returning customers'],
					['Bonus', 'Free setup, worth $150'],
					['Ends', 'Sunday at 11:59pm'],
				],
				action: go('Claim 30% Off', '/pricing'),
				note: 'Discount applied automatically at checkout.',
			}),
			checkList('inline', ['No coupon code needed', 'Cancel any time', '30-day money-back guarantee']),
			masonry(
				'centered',
				{ eyebrow: 'Customers', title: 'Why people do not wait for the next sale', columns: '3' },
				testimonials('card', [
					'Sample review: I almost waited for the next sale. Glad I did not.',
					'Sample review: paid for itself in the first month, discount or not.',
					'Sample review: easy setup and great support from day one.',
				]),
			),
			faq('boxed', {
				title: 'Offer details',
				faqs: [
					['When does the offer end?', 'Sunday at 11:59pm. After that, regular prices return.'],
					['Can existing customers use it?', 'Yes, on any upgrade or renewal during the offer.'],
					['Is there a catch?', 'No. The discount applies for as long as you stay on the plan.'],
				],
			}),
			ctaBand(
				'centered',
				'The clock is running',
				'Lock in 30% off before Sunday at midnight.',
				[go('Claim 30% Off', '/pricing')],
			),
		],
		{ pageName: 'Offer', keywords: ['sale', 'discount', 'deal', 'urgency', 'flash sale'] },
	),

	page(
		'promotion',
		'promo-seasonal-sale',
		'Seasonal Sale',
		'Holiday or Black Friday sale: headline discount, best sellers, deadline, shipping answers.',
		[
			announcement('strip', {
				message: 'Free shipping on every order during the sale.',
				linkLabel: 'Shop now',
				href: '/shop',
			}),
			pageHero('centered', {
				eyebrow: 'The holiday sale is on',
				title: 'Up to [[40% off]] our best sellers',
				description: 'Our favorite products at the lowest prices of the year. Limited stock, while it lasts.',
				actions: [go('Shop The Sale', '/shop'), alt('See Gift Ideas', '/gifts')],
				stats: [
					['40%', 'Off best sellers'],
					['Free', 'Shipping on every order'],
					['60 days', 'Holiday returns'],
				],
			}),
			grid(
				'centered',
				{ eyebrow: 'Best sellers', title: 'The ones that sell out first', columns: '3' },
				features('card', [
					['Best seller one', 'Why people love it, in one line. Now 40% off.', 'Star'],
					['Best seller two', 'Name the benefit, not the feature. Now 30% off.', 'Heart'],
					['Gift set', 'Everything they need, wrapped and ready. Now 25% off.', 'Gift'],
				]),
			),
			countdown('inline', {
				eyebrow: 'Sale ends soon',
				title: 'Prices go back up when the timer runs out',
			}),
			masonry(
				'centered',
				{ eyebrow: 'Reviews', title: 'Gifts people loved', columns: '3' },
				testimonials('card', [
					'Sample review: bought three as gifts, everyone asked where they were from.',
					'Sample review: arrived in two days, beautifully packed.',
					'Sample review: better than I expected at full price, never mind on sale.',
				]),
			),
			faq('boxed', {
				title: 'Shipping and returns',
				faqs: [
					['When will my order arrive?', 'Most orders ship within one business day and arrive in two to five days.'],
					['What is the last day to order for the holidays?', 'Order by the date shown at checkout for delivery in time.'],
					['Can I return a gift?', 'Yes. Holiday purchases can be returned for 60 days.'],
				],
			}),
			ctaBand(
				'split',
				'Do not miss the lowest prices of the year',
				'Free shipping, easy returns, and up to 40% off while stock lasts.',
				[go('Shop The Sale', '/shop')],
			),
		],
		{ pageName: 'Sale', keywords: ['black friday', 'cyber monday', 'holiday', 'christmas', 'ecommerce', 'shop'] },
	),

	page(
		'promotion',
		'promo-product-launch',
		'Product Launch',
		'Introduce something new: what it is, a video, why it matters, and pre-order or waitlist.',
		[
			announcement('badge', {
				badge: 'New',
				message: 'Introducing the newest addition to the family.',
				linkLabel: 'See what is new',
				href: '#launch',
			}),
			splitHero('split', {
				eyebrow: 'Just launched',
				title: 'Meet the [[new way]] to get it done',
				description:
					'Say what the new product is and the one problem it solves better than anything before it.',
				actions: [go('Pre-Order Now', '/checkout'), alt('Watch The Video', '#video')],
				mediaLabel: 'Hero shot of the new product',
			}),
			videoPlayer('stacked', {
				eyebrow: 'See it in action',
				title: 'Sixty seconds to see why it is different',
			}),
			featureRows('alternating', [
				{
					eyebrow: 'Faster',
					title: 'Twice as quick as before',
					description: 'Describe the biggest improvement and what it means for the customer’s day.',
					points: ['Name the measurable gain', 'Say who benefits most'],
				},
				{
					eyebrow: 'Simpler',
					title: 'Nothing new to learn',
					description: 'Remove the worry about switching. Show how familiar it already feels.',
					points: ['Works the way they expect', 'Set up in minutes'],
				},
			]),
			statBand('cards', [
				['2x', 'Faster than the previous version'],
				['30%', 'Lighter'],
				['2 yrs', 'Warranty included'],
			]),
			splitCta('cards', [
				{
					eyebrow: 'Be first',
					title: 'Pre-order today',
					body: 'Lock in launch pricing and be first in line when it ships.',
					cta: 'Pre-Order Now',
					href: '/checkout',
					featured: true,
				},
				{
					eyebrow: 'Not ready yet',
					title: 'Join the waitlist',
					body: 'Get an email the day it is back in stock. No commitment.',
					cta: 'Join The Waitlist',
					href: '#waitlist',
				},
			]),
			faq('stacked', {
				title: 'Launch questions',
				faqs: [
					['When does it ship?', 'Pre-orders ship first, in the order they were placed.'],
					['Is launch pricing permanent?', 'Launch pricing is for pre-orders only.'],
					['Can I cancel a pre-order?', 'Yes, any time before it ships, for a full refund.'],
				],
			}),
			leadCapture('banner', {
				title: 'Get launch updates',
				description: 'Be the first to know about shipping dates and new colors.',
				cta: 'Keep Me Posted',
			}),
		],
		{ pageName: 'Launch', keywords: ['new product', 'pre-order', 'waitlist', 'release', 'announcement'] },
	),

	page(
		'promotion',
		'promo-bundle',
		'Package Deal or Bundle',
		'Sell a bundle: packages side by side, the saving against buying separately, proof.',
		[
			pageHero('centered', {
				eyebrow: 'Bundle and save',
				title: 'Get everything you need and [[save over 35%]]',
				description: 'Our most popular products, packaged together for less than buying them one by one.',
				actions: [go('Choose A Bundle', '#bundles')],
			}),
			pricingTiers('cards', {
				eyebrow: 'Bundles',
				title: 'Pick the bundle that fits',
				tiers: [
					{
						name: 'Starter',
						price: '$99',
						blurb: 'The essentials to get going.',
						features: ['Product one', 'Product two', 'Free shipping'],
						cta: 'Choose Starter',
						href: '/checkout',
					},
					{
						name: 'Complete',
						price: '$179',
						blurb: 'Our best seller. Everything most people need.',
						features: ['Everything in Starter', 'Product three', 'Product four', 'Priority support'],
						cta: 'Choose Complete',
						href: '/checkout',
						featured: true,
					},
					{
						name: 'Ultimate',
						price: '$249',
						blurb: 'The full set, plus extras.',
						features: ['Everything in Complete', 'Product five', 'Extended warranty'],
						cta: 'Choose Ultimate',
						href: '/checkout',
					},
				],
			}),
			comparison('rules', {
				eyebrow: 'The math',
				title: 'Bundle versus buying separately',
				columns: ['Complete bundle', 'Bought separately'],
				rows: [
					['Everything in one order', true, false],
					['Save over 35%', true, false],
					['Free shipping', true, false],
					['Priority support', true, false],
				],
			}),
			grid(
				'centered',
				{ eyebrow: 'Reviews', title: 'Bundle buyers say', columns: '3' },
				testimonials('card', [
					'Sample review: should have bought the bundle from the start.',
					'Sample review: everything arrived together and worked perfectly.',
					'Sample review: great value, especially with the free shipping.',
				]),
			),
			faq('boxed', {
				title: 'Bundle questions',
				faqs: [
					['Can I swap an item in a bundle?', 'Yes. Contact us after ordering and we will help.'],
					['Can I return part of a bundle?', 'Returns are for the full bundle within 30 days.'],
				],
			}),
			ctaBand(
				'centered',
				'Get the bundle and save',
				'Everything you need, in one order, for less.',
				[go('Choose A Bundle', '#bundles')],
			),
		],
		{ pageName: 'Bundles', keywords: ['package', 'kit', 'combo', 'value', 'upsell'] },
	),

	page(
		'promotion',
		'promo-referral',
		'Referral Program',
		'Turn customers into promoters: the reward, how it works, the terms, and a signup.',
		[
			pageHero('centered', {
				eyebrow: 'Refer a friend',
				title: 'Give $25, [[get $25]]',
				description:
					'Share your link with friends. When they make their first purchase, you both get $25. There is no limit.',
				actions: [go('Get My Referral Link', '#join')],
			}),
			processSteps('cards', {
				eyebrow: 'How it works',
				title: 'Three steps, unlimited rewards',
				steps: [
					['Get your link', 'Sign up below and get a personal referral link.'],
					['Share it', 'Send it by text, email, or social. Your friend gets $25 off.'],
					['Get rewarded', 'When they make a purchase, $25 lands in your account.'],
				],
			}),
			statBand('row', [
				['$25', 'For you, per friend'],
				['$25', 'Off for your friend'],
				['No limit', 'On how many you refer'],
			]),
			checkList('columns', [
				'Rewards paid within 7 days of their purchase',
				'Track every referral from your account',
				'Stack rewards with no cap',
				'Works for every product we sell',
			]),
			faq('split', {
				title: 'Program details',
				faqs: [
					['Who can join?', 'Any customer with an account in good standing.'],
					['When do I get paid?', 'Within seven days of your friend’s first purchase.'],
					['Is there a limit?', 'No. Refer as many friends as you like.'],
				],
			}),
			leadCapture('banner', {
				title: 'Get your referral link',
				description: 'Enter your email and we will send your personal link.',
				cta: 'Get My Link',
			}),
		],
		{ pageName: 'Refer A Friend', keywords: ['referral', 'affiliate', 'rewards', 'word of mouth', 'invite'] },
	),
]
