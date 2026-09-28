import type { Field, SectionSchema, VariantOption } from './types'

const opts = (...ids: string[]): VariantOption[] =>
	ids.map((id) => ({
		id,
		label: id
			.split('-')
			.map((word) => word[0].toUpperCase() + word.slice(1))
			.join(' '),
	}))

const text = (key: string, label: string, hint?: string): Field => ({
	key,
	label,
	type: 'text',
	hint,
})
const area = (key: string, label: string, hint?: string): Field => ({
	key,
	label,
	type: 'textarea',
	hint,
})
const rich = (key: string, label: string): Field => ({
	key,
	label,
	type: 'richtext',
	hint: 'Wrap words in [[double brackets]] to highlight them.',
})
const num = (
	key: string,
	label: string,
	min = 0,
	max = 100,
	step = 1,
): Field => ({
	key,
	label,
	type: 'number',
	min,
	max,
	step,
})
const bool = (
	key: string,
	label: string,
	hint?: string,
	defaultValue = false,
): Field => ({
	key,
	label,
	type: 'boolean',
	hint,
	defaultValue,
})
const list = (
	key: string,
	label: string,
	rowLabel: string,
	of: Field[],
	addLabel?: string,
): Field => ({
	key,
	label,
	type: 'list',
	rowLabel,
	addLabel,
	of,
})

const eyebrow = text('eyebrow', 'Eyebrow', 'Small label above the heading.')
const description = area('description', 'Description')

const icon = (key = 'icon', label = 'Icon'): Field => ({
	key,
	label,
	type: 'icon',
})

/** Two-sided placement, for anything that sits inline with a line of text. */
const iconSide = (key = 'iconPosition'): Field => ({
	key,
	label: 'Icon position',
	type: 'select',
	options: [
		{ value: 'before', label: 'Before text' },
		{ value: 'after', label: 'After text' },
	],
})

/** Four-sided placement, for a block of copy the icon can sit around. */
const iconPlacement = (key = 'iconPosition'): Field => ({
	key,
	label: 'Icon position',
	type: 'select',
	options: [
		{ value: 'before', label: 'Left of text' },
		{ value: 'after', label: 'Right of text' },
		{ value: 'above', label: 'Above text' },
		{ value: 'below', label: 'Below text' },
	],
})

const align = (key = 'align', label = 'Alignment'): Field => ({
	key,
	label,
	type: 'select',
	options: [
		{ value: 'left', label: 'Left' },
		{ value: 'center', label: 'Center' },
		{ value: 'right', label: 'Right' },
	],
})

const buttonStyle: Field = {
	key: 'style',
	label: 'Button style',
	type: 'select',
	options: [
		{ value: 'primary', label: 'Primary' },
		{ value: 'outline', label: 'Outline' },
		{ value: 'secondary', label: 'Secondary' },
		{ value: 'ghost', label: 'Ghost' },
		{ value: 'link', label: 'Link' },
	],
}

const actionFields: Field[] = [
	text('label', 'Label'),
	text('href', 'Link'),
	buttonStyle,
	icon(),
	iconSide(),
]

/** Every button list in the kit, so they all edit the same way. */
const actions = (key = 'actions', label = 'Buttons'): Field =>
	list(key, label, 'label', actionFields, 'Button')

/** A single optional link: label, href, and which side its icon sits on. */
const linkFields = (prefix: string): Field[] => [
	text(`${prefix}Label`, 'Link label'),
	text(`${prefix}Href`, 'Link'),
	icon(`${prefix}Icon`, 'Link icon'),
	iconSide(`${prefix}IconPosition`),
]

const statFields: Field[] = [
	text('value', 'Value'),
	area('label', 'Label'),
	icon(),
	iconPlacement(),
]

/** One line in a two-sided list. The icon doubles as the bullet, or there is none. */
const contrastFields: Field[] = [
	area('text', 'Text'),
	{
		...icon(),
		hint: 'Used as the bullet. Leave it empty for no marker at all.',
	},
]

const range = (
	key: string,
	label: string,
	min = 0,
	max = 100,
	defaultValue = 100,
	step = 1,
): Field => ({
	key,
	label,
	type: 'range',
	min,
	max,
	step,
	unit: '%',
	defaultValue,
})

const COLUMN_OPTIONS = [
	{ value: '2', label: 'Two' },
	{ value: '3', label: 'Three' },
	{ value: '4', label: 'Four' },
]

const columns: Field = {
	key: 'columns',
	label: 'Columns',
	type: 'select',
	options: COLUMN_OPTIONS,
}

const DISPLAY_ITEMS = [
	'feature-card',
	'testimonial-card',
	'case-study-card',
	'article-card',
	'team-card',
	'related-card',
	'media-card',
	'client-logo',
]

export const sectionSchemas: SectionSchema[] = [
	// ---------------------------------------------------------------- entry
	{
		type: 'page-hero',
		label: 'Page Hero',
		description:
			'Centered opening block with buttons and an optional stat row.',
		group: 'entry',
		variantProp: 'variant',
		variants: [
			{ id: 'left', label: 'Left Aligned' },
			{ id: 'centered', label: 'Centered' },
			{ id: 'compact', label: 'Compact' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			actions(),
			list('stats', 'Stats', 'value', statFields, 'Stat'),
		],
	},
	{
		type: 'split-hero',
		label: 'Split Hero',
		description: 'Copy on one side, product shot on the other.',
		group: 'entry',
		variantProp: 'variant',
		variants: [
			{ id: 'split', label: 'Media Right' },
			{ id: 'reversed', label: 'Media Left' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			actions(),
			{ key: 'mediaSrc', label: 'Main image', type: 'image' },
			text('mediaLabel', 'Image placeholder label'),
			{
				...list('backdrop', 'Backdrop images', 'image', [
					{ key: 'value', label: 'Image', type: 'image' },
				]),
				fixed: 5,
				hint: 'Five slots, sized and positioned by the layout.',
			},
		],
	},
	{
		type: 'stat-hero',
		label: 'Stat Hero',
		description: 'Opens on numbers rather than claims.',
		group: 'entry',
		variantProp: 'variant',
		variants: [
			{ id: 'cards', label: 'Stat Cards' },
			{ id: 'divided', label: 'Divided Row' },
			{ id: 'centered', label: 'Centered' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			list('stats', 'Stats', 'value', statFields, 'Stat'),
			bool(
				'showLink',
				'Show the link',
				'Turn the closing link off entirely.',
				true,
			),
			...linkFields('link'),
		],
	},
	{
		type: 'section-heading',
		label: 'Section Heading',
		description: 'Eyebrow, title and description used inside another section.',
		group: 'entry',
		displayItem: true,
		// The component is also a primitive inside other sections, where it must stay
		// blank when unset, so the placeholder copy is seeded per block instead.
		defaults: {
			eyebrow: 'Eyebrow',
			title: 'This is the section heading',
			description:
				'This is the section description. It sets up the content that follows.',
		},
		variantProp: 'variant',
		variants: [
			{ id: 'stacked', label: 'Stacked' },
			{ id: 'split', label: 'Title Left, Copy Right' },
			{ id: 'rule', label: 'Centered Under A Rule' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			{
				key: 'align',
				label: 'Alignment',
				type: 'select',
				options: [
					{ value: 'left', label: 'Left' },
					{ value: 'center', label: 'Center' },
				],
			},
		],
	},
	{
		type: 'breadcrumbs',
		label: 'Breadcrumbs',
		description: 'Trail showing where the page sits.',
		group: 'entry',
		// A bare nav, so the builder gives it the same shell every other section has.
		bare: true,
		variantProp: 'variant',
		variants: opts('chevron', 'slash', 'pill'),
		fields: [
			align(),
			list(
				'items',
				'Crumbs',
				'label',
				[text('label', 'Label'), text('href', 'Link')],
				'Crumb',
			),
		],
	},
	{
		type: 'announcement-bar',
		label: 'Announcement Bar',
		description: 'One-line notice across the top of a page.',
		group: 'entry',
		variantProp: 'variant',
		variants: [
			{ id: 'strip', label: 'Strip' },
			{ id: 'badge', label: 'Badge' },
			{ id: 'floating', label: 'Floating' },
			{ id: 'ticker', label: 'Scrolling Ticker' },
		],
		fields: [
			area('message', 'Message'),
			text('badge', 'Badge'),
			text('linkLabel', 'Link label'),
			text('href', 'Link'),
			align('align', 'Alignment'),
			{
				...num('speed', 'Scroll seconds', 5, 120, 1),
				hint: 'Ticker only. Seconds for one full loop, so lower is faster.',
			},
			bool('dismissible', 'Dismissible', undefined, true),
		],
	},

	// ---------------------------------------------------------------- proof
	{
		type: 'stat-band',
		label: 'Stat Band',
		description: 'A row of headline numbers.',
		group: 'proof',
		variantProp: 'variant',
		variants: opts('row', 'cards', 'divided'),
		fields: [
			list('stats', 'Stats', 'value', [
				text('value', 'Value'),
				area('label', 'Label'),
				icon(),
			]),
		],
	},
	{
		type: 'logo-strip',
		label: 'Logo Strip',
		description: 'Client logos in a static row.',
		group: 'proof',
		variantProp: 'variant',
		variants: opts('card', 'bare', 'grid'),
		fields: [
			eyebrow,
			list('logos', 'Logos', 'name', [
				text('name', 'Name'),
				{ key: 'src', label: 'Logo file', type: 'image' },
			]),
		],
	},
	{
		type: 'spotlight',
		label: 'Spotlight',
		description:
			'One featured item with media, a summary, and labeled details.',
		group: 'proof',
		variantProp: 'variant',
		variants: opts('split', 'stacked', 'overlap'),
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			area('summary', 'Summary'),
			list(
				'details',
				'Details',
				'label',
				[text('label', 'Label'), area('value', 'Value')],
				'Detail',
			),
			actions(),
			{ key: 'mediaSrc', label: 'Image', type: 'image' },
			text('mediaAlt', 'Image alt text'),
			text('mediaLabel', 'Media placeholder label'),
			{
				...range('mediaOpacity', 'Image opacity', 0, 100),
				hint: 'Fade the image back so copy on top of it stays readable.',
			},
			range('mediaBrightness', 'Image brightness', 0, 150),
		],
	},
	{
		type: 'before-after',
		label: 'Before / After',
		description: 'Two lists set against each other.',
		group: 'proof',
		variantProp: 'variant',
		variants: opts('columns', 'rows', 'stacked'),
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			text('beforeLabel', 'Left label'),
			text('afterLabel', 'Right label'),
			list('before', 'Left items', 'text', contrastFields, 'Item'),
			list('after', 'Right items', 'text', contrastFields, 'Item'),
		],
	},

	// -------------------------------------------------------------- explain
	{
		type: 'feature-rows',
		label: 'Feature Rows',
		description: 'Alternating rows of copy beside media.',
		group: 'explain',
		variantProp: 'layout',
		variants: [
			{ id: 'alternating', label: 'Alternating' },
			{ id: 'cards', label: 'Normal' },
			{ id: 'stacked', label: 'Stacked' },
		],
		fields: [
			list('rows', 'Rows', 'title', [
				text('eyebrow', 'Eyebrow'),
				text('title', 'Heading'),
				area('description', 'Description'),
				list('points', 'Points', 'text', contrastFields, 'Point'),
				{ key: 'image', label: 'Image', type: 'image' },
				{
					key: 'mediaSide',
					label: 'Image side',
					type: 'select',
					hint: 'Leave unset to keep the automatic zig-zag.',
					options: [
						{ value: 'left', label: 'Image left' },
						{ value: 'right', label: 'Image right' },
					],
				},
			]),
		],
	},
	{
		type: 'process-steps',
		label: 'Process Steps',
		description: 'Numbered steps with optional detail lists.',
		group: 'explain',
		variantProp: 'layout',
		variants: opts('cards', 'timeline', 'columns'),
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			{
				key: 'numberStyle',
				label: 'Number style',
				type: 'select',
				hint: 'Timeline only.',
				options: [
					{ value: 'outline', label: 'Outlined' },
					{ value: 'solid', label: 'Solid brand' },
					{ value: 'muted', label: 'Muted' },
				],
			},
			list('steps', 'Steps', 'title', [
				text('number', 'Number'),
				text('title', 'Title'),
				area('summary', 'Summary'),
				list('detail', 'Detail lines', 'text', contrastFields, 'Detail line'),
			]),
		],
	},
	{
		type: 'bento-grid',
		label: 'Bento Grid',
		description:
			'Mixed-size tiles. Wide tiles should total a multiple of three.',
		group: 'explain',
		variantProp: 'tileStyle',
		variants: opts('accent', 'divided', 'numbered'),
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			{
				key: 'columns',
				label: 'Grid columns',
				type: 'select',
				options: [
					{ value: '3', label: 'Three' },
					{ value: '4', label: 'Four' },
				],
			},
			list('tiles', 'Tiles', 'title', [
				text('title', 'Title'),
				area('blurb', 'Blurb'),
				icon(),
				{
					key: 'span',
					label: 'Columns spanned',
					type: 'select',
					options: [
						{ value: '1', label: 'One' },
						{ value: '2', label: 'Two' },
						{ value: '3', label: 'Three' },
						{ value: '4', label: 'Four' },
					],
				},
				{ key: 'image', label: 'Image', type: 'image' },
				{
					key: 'html',
					label: 'Text panel',
					type: 'prose',
					hint: 'Shown beside the copy when no image is set.',
				},
				{
					key: 'mediaSide',
					label: 'Panel side',
					type: 'select',
					options: [
						{ value: 'left', label: 'Left of the copy' },
						{ value: 'right', label: 'Right of the copy' },
					],
				},
			]),
		],
	},
	{
		type: 'tabs-showcase',
		label: 'Tabs Showcase',
		description: 'Several products or workflows behind one set of tabs.',
		group: 'explain',
		variantProp: 'tabStyle',
		variants: opts('pills', 'underline', 'side'),
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			list('items', 'Tabs', 'label', [
				text('label', 'Tab label'),
				text('title', 'Panel heading'),
				area('body', 'Panel body'),
				list('points', 'Points', 'text', contrastFields, 'Point'),
				{ key: 'image', label: 'Image', type: 'image' },
			]),
		],
	},
	{
		type: 'comparison-table',
		label: 'Comparison Table',
		description: 'Head-to-head table. The first column is the recommended one.',
		group: 'explain',
		variantProp: 'tableStyle',
		variants: opts('accent', 'rules', 'zebra'),
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			list('columns', 'Columns', 'value', [text('value', 'Heading')]),
			{
				...num('highlight', 'Highlighted column', 0, 6, 1),
				hint: 'Which column reads as the recommended one. 0 highlights none.',
			},
			icon('yesIcon', 'Included icon'),
			icon('noIcon', 'Excluded icon'),
			list('rows', 'Rows', 'label', [
				area('label', 'Row label'),
				{
					...list('values', 'Selected', 'value', [
						bool('value', 'Included'),
					]),
					slotsFrom: 'columns',
					hint: 'One switch per column.',
				},
			]),
		],
	},
	{
		type: 'chips',
		label: 'Chips',
		description: 'Compact labeled list for a stack or capability set.',
		group: 'explain',
		bare: true,
		variantProp: 'variant',
		variants: opts('outline', 'solid', 'inline'),
		fields: [
			text('label', 'Label'),
			align(),
			list('items', 'Chips', 'value', [text('value', 'Text')]),
		],
	},

	// -------------------------------------------------------------- convert
	{
		type: 'faq-accordion',
		label: 'FAQ Accordion',
		description: 'Collapsible question list.',
		group: 'convert',
		variantProp: 'layout',
		variants: [
			{ id: 'split', label: 'Heading Beside' },
			{ id: 'stacked', label: 'Heading Above' },
			{ id: 'boxed', label: 'Boxed Rows' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			{
				key: 'marker',
				label: 'Accordion icon',
				type: 'select',
				options: [
					{ value: 'chevron', label: 'Chevron' },
					{ value: 'plus', label: 'Plus and minus' },
					{ value: 'check', label: 'Circle and check' },
					{ value: 'arrow', label: 'Arrow' },
				],
			},
			bool('openFirst', 'Open the first question'),
			list('faqs', 'Questions', 'question', [
				text('question', 'Question'),
				area('answer', 'Answer'),
			]),
		],
	},
	{
		type: 'contact-split',
		label: 'Contact Split',
		description: 'Form, expectations, and a direct address.',
		group: 'convert',
		variantProp: 'layout',
		variants: [
			{ id: 'split', label: 'Form Right' },
			{ id: 'reversed', label: 'Form Left' },
			{ id: 'stacked', label: 'Form Below' },
		],
		fields: [
			eyebrow,
			text('title', 'Heading'),
			description,
			text('email', 'Email address'),
			{
				key: 'stepMark',
				label: 'Step marker',
				type: 'select',
				options: [
					{ value: 'icon', label: 'Icon' },
					{ value: 'number', label: 'Numbered 1, 2, 3' },
					{ value: 'none', label: 'No marker' },
				],
			},
			list('steps', 'Steps', 'title', [
				text('title', 'Title'),
				area('body', 'Body'),
				icon(),
			]),
		],
	},
	{
		type: 'pricing-tiers',
		label: 'Engagement Tiers',
		description: 'Engagement shapes and what each includes.',
		group: 'convert',
		variantProp: 'design',
		variants: opts('cards', 'divided', 'banded'),
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			list('tiers', 'Tiers', 'name', [
				text('name', 'Name'),
				text('price', 'Price'),
				area('blurb', 'Blurb'),
				list('features', 'Features', 'text', contrastFields),
				text('cta', 'Button label'),
				text('href', 'Button link'),
				buttonStyle,
				icon(),
				iconSide(),
				bool('featured', 'Featured'),
			]),
		],
	},
	{
		type: 'lead-capture',
		label: 'Lead Capture',
		description: 'Single-field email capture for mid-page conversion.',
		group: 'convert',
		variantProp: 'design',
		variants: opts('card', 'banner', 'ruled'),
		fields: [
			text('title', 'Heading'),
			description,
			{
				key: 'collect',
				label: 'Fields collected',
				type: 'select',
				options: [
					{ value: 'email', label: 'Email only' },
					{ value: 'name-email', label: 'Name and email' },
					{ value: 'full-name-email', label: 'First, last and email' },
				],
			},
			text('firstNamePlaceholder', 'Name placeholder'),
			text('lastNamePlaceholder', 'Last name placeholder'),
			text('placeholder', 'Email placeholder'),
			text('cta', 'Button label'),
			icon('ctaIcon', 'Button icon'),
			iconSide('ctaIconPosition'),
		],
	},
	{
		type: 'split-cta',
		label: 'Split CTA',
		description: 'Two paths: ready to move, or still looking.',
		group: 'convert',
		variantProp: 'design',
		variants: opts('cards', 'divided', 'rows'),
		fields: [
			list('paths', 'Paths', 'title', [
				text('eyebrow', 'Eyebrow'),
				text('title', 'Heading'),
				area('body', 'Body'),
				text('cta', 'Button label'),
				text('href', 'Button link'),
				buttonStyle,
				icon(),
				iconSide(),
				bool('featured', 'Featured'),
			]),
		],
	},
	{
		type: 'cta-band',
		label: 'CTA Band',
		description: 'Closing call to action.',
		group: 'convert',
		variantProp: 'design',
		variants: [
			{ id: 'card', label: 'Accent Panel' },
			{ id: 'centered', label: 'Centered, No Card' },
			{ id: 'split', label: 'Copy Left, Buttons Right' },
		],
		fields: [
			text('title', 'Heading'),
			description,
			actions(),
		],
	},

	// -------------------------------------------------------------- content
	{
		type: 'prose-block',
		label: 'Prose Block',
		description: 'Long-form body copy with headings and lists.',
		group: 'content',
		bare: true,
		variantProp: 'headings',
		variants: opts('plain', 'ruled', 'marked'),
		fields: [
			align('align', 'Block alignment'),
			align('textAlign', 'Text alignment'),
			{ key: 'body', label: 'Body', type: 'prose' },
		],
	},
	{
		type: 'callout',
		label: 'Callout',
		description: 'Pulls an aside out of the surrounding copy.',
		group: 'content',
		bare: true,
		variantProp: 'design',
		variants: opts('card', 'rule', 'banner'),
		fields: [
			text('label', 'Label'),
			{
				key: 'align',
				label: 'Block alignment',
				type: 'select',
				options: [
					{ value: 'left', label: 'Left' },
					{ value: 'center', label: 'Center' },
					{ value: 'right', label: 'Right' },
					{ value: 'full', label: 'Full width' },
				],
			},
			{ ...icon(), hint: 'Leave empty for no icon at all.' },
			{ key: 'body', label: 'Body', type: 'prose' },
		],
	},
	{
		type: 'author-bio',
		label: 'Author Bio',
		description: 'Byline block for the end of an article.',
		group: 'content',
		bare: true,
		variantProp: 'design',
		variants: opts('card', 'bare', 'centered'),
		fields: [
			text('name', 'Name'),
			text('role', 'Role'),
			area('bio', 'Bio'),
			{ key: 'image', label: 'Author image', type: 'image' },
			{
				key: 'imageSide',
				label: 'Image side',
				type: 'select',
				hint: 'The copy takes the other side and aligns to it.',
				options: [
					{ value: 'left', label: 'Image left' },
					{ value: 'right', label: 'Image right' },
				],
			},
			align('align', 'Block alignment'),
			{
				key: 'action',
				label: 'Link',
				type: 'group',
				of: actionFields,
			},
		],
	},
	{
		type: 'check-list',
		label: 'Check List',
		description: 'Icon-led list for deliverables and inclusions.',
		group: 'content',
		bare: true,
		variantProp: 'variant',
		variants: opts('stacked', 'columns', 'inline'),
		fields: [
			list('items', 'Items', 'value', [area('value', 'Text')]),
			icon(),
		],
	},

	// ---------------------------------------------------------------- media
	{
		type: 'video-player',
		label: 'Video Player',
		description: 'Custom video player with a poster frame.',
		group: 'media',
		variantProp: 'layout',
		variants: [
			{ id: 'stacked', label: 'Copy Above' },
			{ id: 'text-left', label: 'Copy Left, Video Right' },
			{ id: 'text-right', label: 'Copy Right, Video Left' },
			{ id: 'player', label: 'Player Only' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			{ key: 'src', label: 'Video file', type: 'image' },
			{
				key: 'poster',
				label: 'Poster image',
				type: 'image',
				hint: 'Optional. Left empty, the browser shows the first frame of the video.',
			},
			area('caption', 'Caption'),
			{
				key: 'aspect',
				label: 'Aspect ratio',
				type: 'select',
				options: [
					{ value: '16:9', label: '16:9 landscape' },
					{ value: '9:16', label: '9:16 portrait' },
					{ value: '4:5', label: '4:5 portrait' },
				],
			},
			{
				...num('skipSeconds', 'Skip button seconds', 1, 60),
				hint: 'How far the skip forward and back buttons jump.',
			},
			bool('loop', 'Loop'),
		],
	},
	{
		type: 'media-gallery',
		label: 'Media Gallery',
		description: 'Lead image with a thumbnail strip.',
		group: 'media',
		variantProp: 'thumbnails',
		variants: [
			{ id: 'bottom', label: 'Thumbnails Below' },
			{ id: 'side', label: 'Thumbnails Beside' },
			{ id: 'top', label: 'Thumbnails Above' },
			{ id: 'carousel', label: 'Carousel, No Thumbnails' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			list('items', 'Images', 'caption', [
				{ key: 'src', label: 'Image', type: 'image' },
				text('alt', 'Alt text'),
				area('caption', 'Caption'),
			]),
		],
	},
	{
		type: 'media-mosaic',
		label: 'Media Mosaic',
		description: 'A lead shot with supporting ones around it.',
		group: 'media',
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			list('items', 'Images', 'caption', [
				{ key: 'src', label: 'Image', type: 'image' },
				area('caption', 'Caption'),
			]),
		],
	},
	{
		type: 'image-compare',
		label: 'Image Compare',
		description: 'Drag handle wiping between two shots.',
		group: 'media',
		variantProp: 'layout',
		variants: [
			{ id: 'stacked', label: 'Copy Above' },
			{ id: 'text-left', label: 'Copy Left, Compare Right' },
			{ id: 'text-right', label: 'Copy Right, Compare Left' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			list('points', 'Points', 'text', contrastFields, 'Point'),
			{ key: 'before.src', label: 'Before image', type: 'image' },
			text('before.alt', 'Before alt text'),
			text('before.label', 'Before label'),
			{ key: 'after.src', label: 'After image', type: 'image' },
			text('after.alt', 'After alt text'),
			text('after.label', 'After label'),
		],
	},
	{
		type: 'figure',
		label: 'Figure',
		description: 'Captioned image for inside long-form copy.',
		group: 'media',
		bare: true,
		variantProp: 'design',
		variants: [
			{ id: 'below', label: 'Caption Below' },
			{ id: 'framed', label: 'Framed Card' },
			{ id: 'beside', label: 'Caption Beside' },
		],
		fields: [
			{ key: 'src', label: 'Image', type: 'image' },
			text('alt', 'Alt text'),
			area('caption', 'Caption'),
			{
				key: 'align',
				label: 'Alignment',
				type: 'select',
				options: [
					{ value: 'left', label: 'Left' },
					{ value: 'center', label: 'Center' },
					{ value: 'right', label: 'Right' },
					{ value: 'full', label: 'Full width' },
				],
			},
		],
	},

	// ----------------------------------------------------------- navigation
	{
		type: 'filter-bar',
		label: 'Filter Bar',
		description: 'Filters with a result count, for index pages.',
		group: 'navigation',
		// Only meaningful over a set, so it is an option on a collection page.
		displayItem: true,
		variantProp: 'design',
		variants: opts('pills', 'underline', 'segmented'),
		fields: [
			list(
				'filters',
				'Filters',
				'label',
				[
					text('label', 'Button label'),
					text(
						'value',
						'Filters for',
						'The category or tag this button matches. Defaults to the label.',
					),
				],
				'Filter',
			),
			text(
				'defaultValue',
				'Selected filter',
				'Must match one of the filter values above.',
			),
			num('resultCount', 'Result count', 0, 999),
		],
	},
	{
		type: 'pagination',
		label: 'Pagination',
		description: 'Pager that collapses long runs to an ellipsis.',
		group: 'navigation',
		// Belongs to a paged set, so it is an option on a collection page.
		displayItem: true,
		variantProp: 'design',
		variants: [
			{ id: 'numbers', label: 'Centered Numbers' },
			{ id: 'compact', label: 'Prev / Next Only' },
			{ id: 'spread', label: 'Edges Spread' },
		],
		fields: [
			num('page', 'Current page', 1, 999),
			num('totalPages', 'Total pages', 1, 999),
			num('siblings', 'Pages either side', 0, 5),
		],
	},
	{
		type: 'table-of-contents',
		label: 'Table Of Contents',
		description: 'Tracks the active heading while scrolling.',
		group: 'navigation',
		// Tracks headings in a body of copy, so it is an option on a prose block.
		displayItem: true,
		// A bare nav: without a section wrapper its sticky would range over the whole page.
		bare: true,
		variantProp: 'design',
		variants: opts('rail', 'numbered', 'card'),
		fields: [
			text('title', 'Title'),
			{
				...list('items', 'Entries', 'label', [text('label', 'Label')]),
				hint: 'Each label links to the matching heading in the copy beside it.',
			},
		],
	},
	{
		type: 'roi-calculator',
		label: 'ROI Calculator',
		description: 'Interactive estimate of what a manual process costs a year.',
		group: 'navigation',
		variantProp: 'layout',
		variants: [
			{ id: 'split', label: 'Inputs Beside Result' },
			{ id: 'stacked', label: 'Inputs Across The Top' },
			{ id: 'bare', label: 'Ruled, No Cards' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			text('badge', 'Result badge'),
			{
				...list('inputs', 'Inputs', 'label', [
					text('label', 'Label'),
					text('suffix', 'Suffix'),
					num('value', 'Starting value', 0, 100000),
					num('min', 'Minimum', 0, 100000),
					num('max', 'Maximum', 0, 100000),
					num('step', 'Step', 1, 1000),
				]),
				hint: 'Formulas below reference each input by its label, lowercased with underscores.',
			},
			{
				...list('outputs', 'Outputs', 'label', [
					text('label', 'Label'),
					{
						...text('formula', 'Formula'),
						tokensFrom: 'inputs',
					},
					{
						key: 'format',
						label: 'Format',
						type: 'select',
						options: [
							{ value: 'number', label: 'Number' },
							{ value: 'currency', label: 'Currency' },
							{ value: 'percent', label: 'Percent' },
							{ value: 'hours', label: 'Hours' },
						],
					},
					num('decimals', 'Decimal places', 0, 4),
					bool('featured', 'Featured'),
					area(
						'note',
						'Note',
						'Wrap a calculation in {{ }} to drop the number in, e.g. Roughly {{hours * 52}} hours.',
					),
					{
						key: 'noteFormat',
						label: 'Note number format',
						type: 'select',
						options: [
							{ value: 'number', label: 'Number' },
							{ value: 'currency', label: 'Currency' },
							{ value: 'percent', label: 'Percent' },
							{ value: 'hours', label: 'Hours' },
						],
					},
				]),
				hint: 'Each output is calculated from the inputs above.',
			},
			{
				key: 'action',
				label: 'Button',
				type: 'group',
				of: actionFields,
			},
			area('footnote', 'Footnote'),
		],
	},

	// ----------------------------------------------------- collections
	{
		type: 'grid',
		label: 'Grid',
		description: 'Columns of any display item.',
		group: 'collections',
		variantProp: 'heading',
		variants: [
			{ id: 'above', label: 'Heading Above, Left' },
			{ id: 'centered', label: 'Heading Above, Centered' },
			{ id: 'beside', label: 'Heading Beside, Sticky' },
		],
		fields: [eyebrow, rich('title', 'Heading'), description, columns],
		container: {
			accepts: DISPLAY_ITEMS,
			defaultChild: 'feature-card',
			defaultChildCount: 3,
		},
	},
	{
		type: 'masonry',
		label: 'Masonry',
		description: 'Columns where each item keeps its own height.',
		group: 'collections',
		variantProp: 'heading',
		variants: [
			{ id: 'above', label: 'Heading Above' },
			{ id: 'centered', label: 'Heading Centered' },
			{ id: 'bare', label: 'No Heading' },
		],
		fields: [eyebrow, rich('title', 'Heading'), description, columns],
		container: {
			accepts: DISPLAY_ITEMS,
			defaultChild: 'testimonial-card',
			defaultChildCount: 5,
		},
	},
	{
		type: 'carousel',
		label: 'Carousel',
		description: 'Horizontal track for a set longer than a grid should carry.',
		group: 'collections',
		variantProp: 'controls',
		variants: [
			{ id: 'below', label: 'Arrows Below' },
			{ id: 'overlay', label: 'Arrows Overlaid' },
			{ id: 'bars', label: 'Progress Bars' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			{
				key: 'size',
				label: 'Item width',
				type: 'select',
				options: [
					{ value: 'sm', label: 'Small' },
					{ value: 'md', label: 'Medium' },
					{ value: 'lg', label: 'Large' },
					{ value: 'full', label: 'Full' },
				],
			},
			text('label', 'Accessible name', 'Announced to screen readers.'),
		],
		container: {
			accepts: DISPLAY_ITEMS,
			defaultChild: 'testimonial-card',
			defaultChildCount: 5,
		},
	},
	{
		type: 'collection-page',
		label: 'Collection Page',
		description: 'Every entry in a category, with filters and a pager.',
		group: 'collections',
		variantProp: 'columns',
		variants: [
			{ id: '2', label: 'Two Columns' },
			{ id: '3', label: 'Three Columns' },
			{ id: '4', label: 'Four Columns' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			text('category', 'Category', 'What this page lists, e.g. Blog.'),
			bool('showFilters', 'Show the filter bar', undefined, true),
			list(
				'filters',
				'Filters',
				'label',
				[
					text('label', 'Button label'),
					text(
						'value',
						'Filters for',
						'The category or tag this button matches. Defaults to the label.',
					),
				],
				'Filter',
			),
			{
				key: 'filterStyle',
				label: 'Filter style',
				type: 'select',
				options: [
					{ value: 'pills', label: 'Pills' },
					{ value: 'underline', label: 'Underline' },
					{ value: 'segmented', label: 'Segmented' },
				],
			},
			align('filterAlign', 'Filter alignment'),
			bool('showPagination', 'Show pagination', 'Hidden under four items.', true),
			num('page', 'Current page', 1, 999),
			num('totalPages', 'Total pages', 1, 999),
			{
				key: 'paginationStyle',
				label: 'Pagination style',
				type: 'select',
				options: [
					{ value: 'numbers', label: 'Centered numbers' },
					{ value: 'compact', label: 'Prev / next only' },
					{ value: 'spread', label: 'Edges spread' },
				],
			},
		],
		container: {
			accepts: DISPLAY_ITEMS,
			defaultChild: 'article-card',
			defaultChildCount: 6,
		},
	},
	{
		type: 'marquee',
		label: 'Marquee',
		description: 'Looping track, usually for logos.',
		group: 'collections',
		variantProp: 'heading',
		variants: [
			{ id: 'centered', label: 'Label Centered' },
			{ id: 'rule', label: 'Label Under A Rule' },
			{ id: 'inline', label: 'Label Beside' },
		],
		fields: [eyebrow],
		container: {
			accepts: DISPLAY_ITEMS,
			defaultChild: 'client-logo',
			defaultChildCount: 7,
		},
	},

	// ----------------------------------------------------------- page states
	{
		type: 'detail-card',
		label: 'Detail Card',
		description: 'Labelled facts beside a single call to action.',
		group: 'states',
		variantProp: 'variant',
		variants: [
			{ id: 'card', label: 'Panel Beside Copy' },
			{ id: 'rows', label: 'Ruled Rows' },
			{ id: 'inline', label: 'Facts Across The Top' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			list('details', 'Details', 'label', [
				text('label', 'Label'),
				area('value', 'Value'),
			]),
			{
				key: 'action',
				label: 'Button',
				type: 'group',
				of: actionFields,
			},
			bool('showNote', 'Show the note', undefined, true),
			area('note', 'Note under the button'),
		],
	},
	{
		type: 'countdown',
		label: 'Countdown',
		description: 'Time remaining until a launch or an event.',
		group: 'states',
		variantProp: 'variant',
		variants: [
			{ id: 'boxed', label: 'Boxed Units' },
			{ id: 'bare', label: 'Ruled, No Boxes' },
			{ id: 'inline', label: 'Inline Row' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			list('units', 'Units', 'label', [
				text('value', 'Value'),
				text('label', 'Label'),
			]),
			bool('showNote', 'Show the closing line', undefined, true),
			area('note', 'Closing line'),
		],
	},
	{
		type: 'auth-panel',
		label: 'Auth Panel',
		description: 'Sign in or sign up, with an optional proof column.',
		group: 'states',
		variantProp: 'variant',
		variants: [
			{ id: 'split', label: 'Form Left, Proof Right' },
			{ id: 'centered', label: 'Centered, No Card' },
			{ id: 'card', label: 'Centered Card' },
		],
		fields: [
			eyebrow,
			rich('title', 'Heading'),
			description,
			text('formLabel', 'Form slot label'),
			list('providers', 'Providers', 'value', [text('value', 'Label')]),
			area('footnote', 'Footnote'),
			text('footnoteLink', 'Footnote link label'),
			text('href', 'Link'),
			area('asideQuote', 'Proof quote'),
			text('asideName', 'Proof name'),
			text('asideRole', 'Proof role'),
			{
				key: 'asideImage',
				label: 'Proof background image',
				type: 'image',
				hint: 'Form Left, Proof Right only. Dimmed so the quote stays readable.',
			},
		],
	},
	{
		type: 'notice',
		label: 'Notice',
		description: 'Full-screen confirmation, error, or status page.',
		group: 'states',
		variantProp: 'variant',
		variants: [
			{ id: 'confirmation', label: 'Icon Mark' },
			{ id: 'code', label: 'Large Code' },
			{ id: 'plain', label: 'No Mark' },
		],
		fields: [
			{ key: 'icon', label: 'Icon', type: 'icon' },
			{
				key: 'iconPosition',
				label: 'Icon position',
				type: 'select',
				options: [
					{ value: 'above', label: 'Above the heading' },
					{ value: 'before', label: 'Before the heading' },
					{ value: 'after', label: 'After the heading' },
				],
			},
			text('code', 'Code', 'Shown by the Large Code variant, e.g. 404.'),
			rich('title', 'Heading'),
			description,
			list('steps', 'Next steps', 'value', statFields),
			actions(),
		],
	},

	// -------------------------------------------------------- display items
	{
		type: 'testimonial-card',
		label: 'Testimonial',
		description: 'A single client quote.',
		group: 'items',
		displayItem: true,
		variantProp: 'variant',
		variants: [
			{ id: 'card', label: 'Card' },
			{ id: 'bare', label: 'No Card' },
			{ id: 'aside', label: 'Attribution Beside' },
		],
		fields: [
			area('quote', 'Quote'),
			text('name', 'Name'),
			text('role', 'Role'),
			text('company', 'Company'),
			bool('featured', 'Featured', 'Sets the quote larger.'),
		],
	},
	{
		type: 'case-study-card',
		label: 'Case Study Card',
		description: 'Project card for an index or a related row.',
		group: 'items',
		displayItem: true,
		variantProp: 'variant',
		variants: [
			{ id: 'stacked', label: 'Stacked' },
			{ id: 'overlay', label: 'Copy Over Media' },
			{ id: 'row', label: 'Landscape Row' },
		],
		fields: [
			text('name', 'Project name'),
			text('category', 'Category'),
			text('client', 'Client'),
			area('summary', 'Summary'),
			{ key: 'image', label: 'Image', type: 'image' },
			text('href', 'Link'),
		],
	},
	{
		type: 'article-card',
		label: 'Article Card',
		description: 'Blog card for an index or a related row.',
		group: 'items',
		displayItem: true,
		variantProp: 'variant',
		variants: [
			{ id: 'card', label: 'Card' },
			{ id: 'numbered', label: 'Numbered' },
			{ id: 'thumbnail', label: 'Thumbnail Row' },
		],
		fields: [
			text('title', 'Title'),
			area('excerpt', 'Excerpt'),
			text('category', 'Category'),
			text('readTime', 'Read time'),
			text('href', 'Link'),
		],
	},
	{
		type: 'team-card',
		label: 'Team Card',
		description: 'One person.',
		group: 'items',
		displayItem: true,
		variantProp: 'variant',
		variants: [
			{ id: 'card', label: 'Card' },
			{ id: 'portrait', label: 'Portrait' },
			{ id: 'row', label: 'Row' },
		],
		fields: [text('name', 'Name'), text('role', 'Role'), area('bio', 'Bio')],
	},
	{
		type: 'related-card',
		label: 'Related Card',
		description: 'Generic link card for closing out a page.',
		group: 'items',
		displayItem: true,
		variantProp: 'variant',
		variants: [
			{ id: 'card', label: 'Card' },
			{ id: 'list', label: 'List Row' },
			{ id: 'thumbnail', label: 'Thumbnail Row' },
		],
		fields: [
			text('title', 'Title'),
			text('meta', 'Meta'),
			area('description', 'Description'),
			text('href', 'Link'),
		],
	},
	{
		type: 'feature-card',
		label: 'Feature Card',
		description: 'Icon, title, and a short blurb.',
		group: 'items',
		displayItem: true,
		variantProp: 'variant',
		variants: [
			{ id: 'card', label: 'Card' },
			{ id: 'inline', label: 'Icon Beside Copy' },
			{ id: 'numbered', label: 'Numbered Under A Rule' },
		],
		fields: [
			text('title', 'Title'),
			area('blurb', 'Blurb'),
			{ key: 'icon', label: 'Icon', type: 'icon' },
			num('index', 'Number', 1, 99),
		],
	},
	{
		type: 'media-card',
		label: 'Media Card',
		description: 'A single captioned image.',
		group: 'items',
		displayItem: true,
		variantProp: 'variant',
		variants: [
			{ id: 'card', label: 'Card' },
			{ id: 'overlay', label: 'Caption Over Image' },
			{ id: 'bare', label: 'No Card' },
		],
		fields: [
			{ key: 'src', label: 'Image', type: 'image' },
			text('alt', 'Alt text'),
			area('caption', 'Caption'),
			bool('fill', 'Fill its cell', 'Stretches to the grid row height.'),
			bool('natural', 'Keep natural height'),
		],
	},
	{
		type: 'client-logo',
		label: 'Client Logo',
		description: 'One logo lockup.',
		group: 'items',
		displayItem: true,
		variantProp: 'variant',
		variants: [
			{ id: 'wordmark', label: 'Wordmark' },
			{ id: 'boxed', label: 'Boxed' },
			{ id: 'muted', label: 'Muted' },
		],
		fields: [
			text('name', 'Name'),
			{ key: 'src', label: 'Logo file', type: 'image' },
		],
	},
]

export const schemaByType = new Map(sectionSchemas.map((s) => [s.type, s]))

export const GROUP_LABELS: Record<string, string> = {
	entry: 'Entry',
	proof: 'Proof',
	explain: 'Explain',
	convert: 'Convert',
	content: 'Content',
	media: 'Media',
	navigation: 'Navigation',
	collections: 'Collections',
	states: 'Page states',
	items: 'Display items',
}

export const GROUP_ORDER = [
	'entry',
	'proof',
	'explain',
	'convert',
	'content',
	'media',
	'navigation',
	'collections',
	'states',
	'items',
]

export function getSchema(type: string) {
	return schemaByType.get(type)
}

/** Sections offered in the add-section picker: everything except child-only items. */
export function pickableSchemas() {
	return sectionSchemas.filter((s) => !s.displayItem)
}
