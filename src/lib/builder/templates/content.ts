import {
	article,
	authorBio,
	callout,
	carousel,
	checkList,
	chips,
	collectionPage,
	faq,
	go,
	grid,
	leadCapture,
	page,
	pageHero,
	prose,
	related,
	tableOfContents,
} from './helpers'

/*
 * Content pages earn the visit and then turn it into a subscriber: every one of
 * them carries an email capture and a route to the next thing to read.
 */
const articles = (variant: 'card' | 'numbered' | 'thumbnail', count: number) =>
	Array.from({ length: count }, (_, index) =>
		article(
			variant,
			[
				'How to get more from the customers you already have',
				'The five-minute weekly review that keeps you on track',
				'What to do when sales slow down',
				'A beginner’s guide to pricing your work',
				'The mistakes we see most often, and how to avoid them',
				'Why simple beats clever, every time',
			][index % 6],
			'A one-line summary that makes the reader want to click.',
			['Guides', 'Tips', 'Strategy', 'Pricing', 'Mistakes', 'Opinion'][index % 6],
			`${4 + (index % 4)} min`,
		),
	)

const guideSections = [
	'What it is and why it matters',
	'Getting started',
	'The step-by-step process',
	'Common mistakes',
	'Tools that help',
	'Next steps',
]

export const contentTemplates = [
	page(
		'content',
		'blog-post',
		'Blog Post',
		'Article with a contents rail, a callout, the author, an email capture, and related reads.',
		[
			pageHero('compact', {
				eyebrow: 'Guides · 6 min read',
				title: 'How to get more from the customers [[you already have]]',
				description: 'The standfirst: one or two sentences that tell the reader exactly what they will get.',
			}),
			tableOfContents('rail', 'In this article', ['Why it matters', 'The three steps', 'What to do next']),
			prose(
				'ruled',
				'<p>Open with the problem in the reader’s words. Keep paragraphs short; most people read on a phone.</p><h2>Why it matters</h2><p>Explain the cost of the problem with a number or a short story.</p><h2>The three steps</h2><p>Give the method. Number the steps if order matters.</p><ul><li>Step one, with an example</li><li>Step two, with an example</li><li>Step three, with an example</li></ul><h2>What to do next</h2><p>End with one specific action the reader can take today.</p>',
			),
			callout('card', {
				label: 'Key takeaway',
				icon: 'Lightbulb',
				html: '<p>Sum up the article in one or two sentences for skimmers.</p>',
			}),
			authorBio('bare', {
				name: 'Author name',
				role: 'Their role',
				bio: 'One line on who they are and why they know this topic.',
			}),
			leadCapture('banner', {
				title: 'Get articles like this every week',
				description: 'One practical idea in your inbox each Tuesday. Free.',
				cta: 'Subscribe',
			}),
			grid('above', { eyebrow: 'Keep reading', title: 'Related articles', columns: '3' }, articles('card', 3)),
		],
		{ pageName: 'Article', keywords: ['article', 'post', 'blog', 'news', 'story'] },
	),

	page(
		'content',
		'blog-index',
		'Blog Index',
		'Filterable, paged list of articles with a newsletter signup.',
		[
			pageHero('centered', {
				eyebrow: 'Blog',
				title: 'Ideas you can [[use this week]]',
				description: 'Practical guides, tips, and lessons from the work we do.',
			}),
			collectionPage(
				'3',
				{
					category: 'Blog',
					filters: ['All', 'Guides', 'Tips', 'Strategy', 'News'],
					filterStyle: 'underline',
				},
				articles('card', 6),
			),
			leadCapture('ruled', {
				title: 'Never miss a post',
				description: 'Get the best article each week, straight to your inbox.',
				cta: 'Subscribe',
			}),
		],
		{ pageName: 'Blog', keywords: ['blog', 'articles', 'news', 'posts', 'index'] },
	),

	page(
		'content',
		'resource-hub',
		'Resource Hub',
		'Guides, templates, and tools gathered in one place, with featured picks and a signup.',
		[
			pageHero('centered', {
				eyebrow: 'Resources',
				title: 'Everything you need to [[get it right]]',
				description: 'Free guides, templates, and tools. Pick what fits where you are.',
			}),
			grid('above', { eyebrow: 'Start here', title: 'Most popular', columns: '3' }, [
				related('card', 'The complete beginner’s guide', 'Guide', 'Everything you need to know, in plain language.', '/resources'),
				related('card', 'The planning template', 'Template', 'Fill it in and you have a plan.', '/resources'),
				related('card', 'The cost calculator', 'Tool', 'Work out what it will cost in a minute.', '/resources'),
			]),
			carousel('below', { eyebrow: 'Latest', title: 'New guides and articles' }, articles('card', 5)),
			grid('above', { eyebrow: 'By type', title: 'Browse everything', columns: '3' }, [
				related('list', 'Guides', '12 guides', 'In-depth walkthroughs.', '/resources/guides'),
				related('list', 'Templates', '8 templates', 'Ready to copy and use.', '/resources/templates'),
				related('list', 'Videos', '15 videos', 'Short, practical lessons.', '/resources/videos'),
				related('list', 'Case studies', '10 stories', 'How others did it.', '/case-studies'),
				related('list', 'Tools', '4 tools', 'Calculators and checkers.', '/resources/tools'),
				related('list', 'Glossary', '60 terms', 'The jargon, explained.', '/resources/glossary'),
			]),
			leadCapture('banner', {
				title: 'Get new resources first',
				description: 'We email when something new is published. Nothing else.',
				cta: 'Notify Me',
			}),
		],
		{ pageName: 'Resources', keywords: ['library', 'downloads', 'learning center', 'knowledge base', 'hub'] },
	),

	page(
		'content',
		'blog-guide',
		'Ultimate Guide',
		'A long-form pillar page with contents, sections, a checklist, FAQ, and capture.',
		[
			pageHero('left', {
				eyebrow: 'The complete guide',
				title: 'The complete guide to [[your topic]]',
				description: 'Everything a beginner needs to know, in one place. Bookmark it; it is long.',
				actions: [go('Get The PDF Version', '#pdf')],
			}),
			tableOfContents('card', 'Contents', guideSections),
			prose(
				'marked',
				guideSections
					.map(
						(heading) =>
							`<h2>${heading}</h2><p>Write this section in short paragraphs. Use subheadings, examples, and lists so readers can find what they came for.</p>`,
					)
					.join(''),
			),
			checkList('columns', [
				'Your first step, in one line',
				'Your second step',
				'The check most people forget',
				'How to know it is working',
			]),
			callout('banner', {
				label: 'Pro tip',
				icon: 'Sparkles',
				html: '<p>Share the one insight that separates experts from beginners.</p>',
			}),
			faq('stacked', {
				title: 'Frequently asked questions',
				faqs: [
					['How long does it take to learn?', 'Answer the question beginners ask most.'],
					['What does it cost?', 'Give a range and what changes it.'],
					['Can I do it myself?', 'Be honest about when to get help.'],
				],
			}),
			leadCapture('banner', {
				title: 'Get this guide as a PDF',
				description: 'Read it offline or share it with your team.',
				collect: 'name-email',
				cta: 'Send Me The PDF',
			}),
		],
		{ pageName: 'Guide', keywords: ['pillar page', 'ultimate guide', 'long form', 'seo', 'how to'] },
	),

	page(
		'content',
		'author-page',
		'Author Profile',
		'An author’s bio, topics, and everything they have written.',
		[
			pageHero('compact', {
				eyebrow: 'Author',
				title: 'Author name',
				description: 'A two-line bio: what they do, what they write about, and why readers trust them.',
			}),
			chips('inline', 'Writes about', ['Strategy', 'Pricing', 'Marketing', 'Operations']),
			authorBio('card', {
				name: 'Author name',
				role: 'Their role',
				bio: 'A fuller bio: experience, credentials, and where else their work has appeared.',
				action: go('Follow Them', '#follow'),
			}),
			collectionPage(
				'3',
				{ title: 'Articles by this author', category: 'Articles', filters: ['All', 'Guides', 'Opinion'], filterStyle: 'pills', paginationStyle: 'compact' },
				articles('card', 6),
			),
			leadCapture('ruled', {
				title: 'Get their next article',
				description: 'Sent to your inbox when it is published.',
				cta: 'Subscribe',
			}),
		],
		{ pageName: 'Author', keywords: ['writer', 'contributor', 'byline', 'profile'] },
	),
]
