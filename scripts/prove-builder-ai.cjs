/**
 * Proves the checks every AI-written value passes before it reaches a page: only
 * fields the section has, only the kinds of change that were asked for, never a
 * testimonial, never a design setting, never an image outside the library.
 *
 * No API call is made; a model reply is faked and run through the real sanitizer.
 *
 *   node scripts/prove-builder-ai.cjs
 */
const assert = require('node:assert/strict')
const { loadTs } = require('./lib/load-ts.cjs')

const { __test: T } = loadTs('src/lib/builder/ai-writer.ts')

let passed = 0
const check = (name, fn) => {
	fn()
	passed++
	console.log(`PASS  ${name}`)
}

const ALL = { text: true, replaceImages: true, fillImages: true }
const TEXT = { text: true, replaceImages: false, fillImages: false }
const choices = new Map([
	['img1', { ref: 'img1', value: 'https://x.public.blob.vercel-storage.com/a.jpg' }],
	['img2', { ref: 'img2', value: 'media:md_abc' }],
])

const hero = () => ({
	id: 'b1',
	type: 'split-hero',
	variant: 'split',
	props: {
		variant: 'split',
		eyebrow: 'Old eyebrow',
		title: 'Old [[title]]',
		actions: [
			{ label: 'Old one', href: '/old', style: 'primary', icon: 'ArrowRight' },
			{ label: 'Old two', href: '/two', style: 'outline' },
		],
		mediaSrc: 'media:md_old',
		backdrop: ['', 'media:md_b', '', '', ''],
	},
})

check('text fields are rewritten and merged over the rest of the section', () => {
	const out = T.applyReturned(
		hero(),
		{ id: 'b1', props: { eyebrow: 'Plumbing in Austin', title: 'Fixed [[today]]' } },
		TEXT,
		choices,
	)
	assert.equal(out.props.eyebrow, 'Plumbing in Austin')
	assert.equal(out.props.title, 'Fixed [[today]]')
	assert.equal(out.props.mediaSrc, 'media:md_old')
	assert.equal(out.variant, 'split')
})

check('unknown keys and design settings are dropped', () => {
	const out = T.applyReturned(
		hero(),
		{ id: 'b1', props: { variant: 'reversed', spacing: 'huge', background: 'red', nonsense: 1 } },
		TEXT,
		choices,
	)
	assert.deepEqual(out.props, hero().props)
})

check('button rows keep their style while the label and link change', () => {
	const out = T.applyReturned(
		hero(),
		{
			id: 'b1',
			props: {
				actions: [
					{ label: 'Book a visit', href: '/contact', style: 'ghost' },
					{ label: 'Call us', href: 'tel:+1 512 555 0100' },
				],
			},
		},
		TEXT,
		choices,
	)
	assert.equal(out.props.actions[0].label, 'Book a visit')
	assert.equal(out.props.actions[0].style, 'primary', 'the style is a design setting')
	assert.equal(out.props.actions[0].icon, 'ArrowRight')
	assert.equal(out.props.actions[1].href, 'tel:+1 512 555 0100')
})

check('unsafe links are refused and the old one kept', () => {
	const out = T.applyReturned(
		hero(),
		{ id: 'b1', props: { actions: [{ label: 'Go', href: 'javascript:alert(1)' }] } },
		TEXT,
		choices,
	)
	assert.equal(out.props.actions[0].href, '/old')
	assert.equal(out.props.actions[0].label, 'Go')
	for (const ok of ['/pricing', '#faq', 'mailto:a@b.co', 'tel:5125550100', 'https://example.com/x'])
		assert.ok(T.isSafeHref(ok), ok)
	for (const bad of ['javascript:x', 'data:text/html,x', 'http://plain.example', '//evil.example'])
		assert.ok(!T.isSafeHref(bad), bad)
})

const URL1 = 'https://x.public.blob.vercel-storage.com/a.jpg'
const LIB = new Map(
	Array.from({ length: 8 }, (_, i) => [`img${i + 1}`, { ref: `img${i + 1}`, value: `media:lib${i + 1}` }]),
)

check('a split hero has six image slots: the main image and five backdrop slots', () => {
	const bare = { id: 'b9', type: 'split-hero', props: { title: 'x' } }
	const slots = T.imageSlots(require('./lib/load-ts.cjs').loadTs('src/lib/builder/schema.ts').getSchema('split-hero').fields, bare.props)
	assert.deepEqual(
		slots.map((s) => s.id),
		['mediaSrc', 'backdrop.0', 'backdrop.1', 'backdrop.2', 'backdrop.3', 'backdrop.4'],
	)
	const described = T.describeBlock(bare, true)
	assert.equal(described.imageSlots.length, 6)
})

check('selecting images fills every slot, even ones the model skipped', () => {
	// The model only picked the main image; all six must still change.
	const out = T.applyReturned(hero(), { id: 'b1', images: { mediaSrc: 'img3' } }, { text: false, replaceImages: true, fillImages: true }, LIB)
	assert.equal(out.props.mediaSrc, 'media:lib3')
	assert.equal(out.props.backdrop.length, 5)
	assert.ok(out.props.backdrop.every((src) => src.startsWith('media:lib')), JSON.stringify(out.props.backdrop))
	const all = [out.props.mediaSrc, ...out.props.backdrop]
	assert.equal(new Set(all).size, 6, 'six different images while the library has enough')

	// A section the model left out of its reply altogether still gets its images.
	const skipped = T.applyReturned({ id: 'b2', type: 'split-hero', props: {} }, undefined, ALL, LIB)
	assert.equal(skipped.props.backdrop.length, 5)
	assert.ok(skipped.props.mediaSrc)
})

check('a row of cards gets an image per card, and the model picks are honoured', () => {
	const fields = [
		{ key: 'title', label: 'Heading', type: 'text' },
		{ key: 'cards', label: 'Cards', type: 'list', of: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'image', label: 'Image', type: 'image' }] },
	]
	const props = { cards: [{ title: 'A', image: 'media:old' }, { title: 'B' }, { title: 'C', image: 'media:old2' }] }
	const slots = T.imageSlots(fields, props)
	assert.deepEqual(slots.map((s) => [s.id, s.set]), [['cards.0.image', true], ['cards.1.image', false], ['cards.2.image', true]])
})

check('images: only library refs, and only the kind of change asked for', () => {
	const returned = { id: 'b1', images: { mediaSrc: 'img1', 'backdrop.0': 'img2', 'backdrop.1': 'img1', 'backdrop.2': 'nope' } }

	const textOnly = T.applyReturned(hero(), returned, TEXT, choices)
	assert.equal(textOnly.props.mediaSrc, 'media:md_old')
	assert.deepEqual(textOnly.props.backdrop, hero().props.backdrop)

	const fill = T.applyReturned(hero(), returned, { text: false, replaceImages: false, fillImages: true }, choices)
	assert.equal(fill.props.mediaSrc, 'media:md_old', 'a set image is not replaced when only filling')
	assert.equal(fill.props.backdrop[0], 'media:md_abc')
	assert.equal(fill.props.backdrop[1], 'media:md_b', 'a set slot is not replaced when only filling')
	assert.ok(fill.props.backdrop.slice(2).every(Boolean), 'empty slots are all filled')

	const replace = T.applyReturned(hero(), returned, { text: false, replaceImages: true, fillImages: false }, choices)
	assert.equal(replace.props.mediaSrc, URL1)
	assert.equal(replace.props.backdrop[1], URL1)
	assert.deepEqual([replace.props.backdrop[0], ...replace.props.backdrop.slice(2)], ['', '', '', ''])

	const madeUp = T.applyReturned(hero(), { id: 'b1', images: { mediaSrc: 'https://evil.example/x.jpg' }, props: { mediaSrc: 'img1' } }, ALL, choices)
	assert.ok(madeUp.props.mediaSrc !== 'https://evil.example/x.jpg', 'a raw URL from the model is never used')
	assert.ok([URL1, 'media:md_abc'].includes(madeUp.props.mediaSrc))
})

check('a fixed-slot list keeps its length whatever the model returns', () => {
	const out = T.applyReturned(hero(), { id: 'b1', props: { backdrop: ['x'] } }, TEXT, choices)
	assert.equal(out.props.backdrop.length, 5)
})

check('nested lists are cleaned row by row, capped, and icons must exist', () => {
	const tiers = {
		id: 'p1',
		type: 'pricing-tiers',
		props: {
			tiers: [{ name: 'Basic', price: '$10', featured: false, features: [{ text: 'A', icon: 'Check' }] }],
		},
	}
	const out = T.applyReturned(
		tiers,
		{
			id: 'p1',
			props: {
				tiers: [
					{ name: 'Starter', price: '[Your price]', featured: true, features: [{ text: 'Drain clearing', icon: 'Wrench' }, { text: 'Bad icon', icon: 'NotARealIcon' }] },
					{ name: 'Standard', features: Array.from({ length: 30 }, (_, i) => ({ text: `F${i}` })) },
					{ name: 'Premium' },
				],
			},
		},
		TEXT,
		choices,
	)
	assert.equal(out.props.tiers.length, 3)
	assert.equal(out.props.tiers[0].name, 'Starter')
	assert.equal(out.props.tiers[0].featured, false, 'a switch is a design setting')
	assert.equal(out.props.tiers[0].features[0].icon, 'Wrench')
	assert.equal(out.props.tiers[0].features[1].icon, undefined)
	assert.equal(out.props.tiers[1].features.length, 12)
})

check('prose is sanitised HTML', () => {
	const out = T.applyReturned(
		{ id: 'r1', type: 'prose-block', props: { body: '<p>Old</p>' } },
		{ id: 'r1', props: { body: '<h2>New</h2><p onclick="x()">Hi <script>alert(1)</script><strong>there</strong></p>' } },
		TEXT,
		choices,
	)
	assert.match(out.props.body, /<h2>New<\/h2>/)
	assert.doesNotMatch(out.props.body, /script|onclick/)
})

check('testimonials are never written, even inside a container', () => {
	const grid = {
		id: 'g1',
		type: 'grid',
		props: { title: 'Old' },
		children: [{ id: 't1', type: 'testimonial-card', props: { quote: 'Real words', name: 'Sam' } }],
	}
	const out = T.applyReturned(
		grid,
		{ id: 'g1', props: {}, items: [{ id: 't1', props: { quote: 'Invented praise', name: 'Fake Person' } }] },
		ALL,
		choices,
	)
	assert.deepEqual(out.children[0].props, { quote: 'Real words', name: 'Sam' })
	assert.equal(T.describeBlock(grid.children[0], true).fields, undefined)
})

check('writing text only, a block the model skipped or garbled changes nothing', () => {
	const before = hero()
	assert.deepEqual(T.applyReturned(before, undefined, TEXT, choices), before)
	assert.deepEqual(T.applyReturned(before, { id: 'b1', props: 'nope' }, TEXT, choices), before)
})

check('the prompt shows no image URLs and no design fields', () => {
	const described = JSON.stringify(T.describeBlock(hero(), true))
	assert.doesNotMatch(described, /md_old|md_b|blob\.vercel/)
	assert.match(described, /"slot":"mediaSrc","label":"Main image","current":"\(image set\)"/)
	assert.match(described, /"slot":"backdrop.1","label":"Backdrop images 2","current":"\(image set\)"/)
	assert.doesNotMatch(described, /"key":"variant"|"key":"style"/)
	const noImages = JSON.stringify(T.describeBlock(hero(), false))
	assert.doesNotMatch(noImages, /mediaSrc|imageSlots|backdrop/)
})

check('replies are read through stray text and code fences', () => {
	assert.deepEqual(T.parseReply('```json\n{"blocks":[]}\n```'), { blocks: [] })
	assert.deepEqual(T.parseReply('Here you go: {"blocks":[{"id":"a"}]} thanks'), { blocks: [{ id: 'a' }] })
	assert.equal(T.parseReply('no json here'), null)
	assert.equal(T.parseReply('{broken'), null)
})

console.log(`\n${passed} checks passed`)
