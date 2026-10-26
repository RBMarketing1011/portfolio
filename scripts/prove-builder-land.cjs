/**
 * Proves landing an AI build on the draft (src/lib/builder/land.ts):
 *
 *   node scripts/prove-builder-land.cjs
 *
 *  - the three placements (replace the site, add pages, rebuild one page);
 *  - slug collisions: never '/-2', never a leading slash, archetype pairs first;
 *  - rewriteHrefs across blocks, rows, groups, children, the menu, promos and the button;
 *  - slotIntoMenu: the family group, a plain item, the footer, the pages row, icons;
 *  - block ids kept, a colliding id replaced with its surface moved, orphan surfaces dropped;
 *  - a deleted rebuild target lands as a new page;
 *  - a payload that does not parse throws LandError and changes nothing;
 *  - the same payload twice throws LandError('already-landed') and changes nothing;
 *  - pruneSlug drops links, emptied groups and the button target of a deleted page.
 */
const assert = require('node:assert/strict')
const { loadTs } = require('./lib/load-ts.cjs')

const land = loadTs('src/lib/builder/land.ts')
const { defaultLook, BLOCK_KEY } = loadTs('src/lib/builder/look.ts')
const { defaultBackground } = loadTs('src/app/builder/background-settings.ts')
const { chromeSchema, defaultChrome, pageSchema } = loadTs('src/lib/builder/page-schema.ts')
const { landAiResult, LandError, freeSlug, rewriteHrefs, slotIntoMenu, pruneSlug } = land

let failed = 0
const check = (name, fn) => {
	try {
		fn()
		console.log(`PASS ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL ${name}: ${String(error.message).split('\n')[0]}`)
	}
}

function deepFreeze(value) {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const inner of Object.values(value)) deepFreeze(inner)
	}
	return value
}
const clone = (value) => JSON.parse(JSON.stringify(value))
const throwsLand = (fn, reason) =>
	assert.throws(fn, (error) => error instanceof LandError && error.reason === reason, `expected LandError('${reason}')`)

const NOW = '2026-10-25T12:00:00.000Z'
const OLD = '2026-10-01T00:00:00.000Z'
const WRITTEN = '2026-10-25T11:58:00.000Z'

const page = (id, name, slug, blocks, extra = {}) => ({
	id, name, slug, inHeader: true, blocks, createdAt: OLD, updatedAt: OLD, ...extra,
})
const tone = (lightness) => ({
	...defaultBackground,
	page: { ...defaultBackground.page, pattern: 'none', fill: 'solid', color: { token: 'accent', lightness } },
})

/** A roofer's site as the person has it now. */
function currentSite() {
	const look = defaultLook()
	return {
		site: {
			version: 1,
			chrome: {
				...defaultChrome,
				ctaLabel: 'Free inspection',
				ctaHref: 'contact',
				menu: [
					{
						id: 'mi_services1', label: 'Services', href: '', style: 'mega',
						links: [{ id: 'ml_allserv1', label: 'All services', href: 'services', description: 'Everything we do', icon: 'LayoutGrid' }],
						promo: { eyebrow: 'No cost', title: 'Book a free inspection', body: 'We check every slope.', ctaLabel: 'Book it', href: 'contact' },
					},
					{
						id: 'mi_company1', label: 'Company', href: '', style: 'dropdown',
						links: [{ id: 'ml_aboutus1', label: 'About us', href: 'about', description: '' }],
						promo: null,
					},
					{ id: 'mi_contact1', label: 'Contact', href: 'contact', links: [], style: 'mega', promo: null },
					{ id: 'mi_phone001', label: '(512) 555-0142', href: 'tel:+15125550142', links: [], style: 'mega', promo: null },
				],
			},
			pages: [
				page('pg_home00000', 'Home', '/', [
					{ id: 'blk_h1', type: 'page-hero', props: { heading: 'Roofs', actions: [{ label: 'Talk to us', href: '/contact' }] } },
					{ id: 'blk_h2', type: 'cta-band', props: { heading: 'Ready?', href: 'contact' } },
				]),
				page('pg_serv00000', 'Services', 'services', [
					{ id: 'blk_s1', type: 'grid', props: {}, children: [{ id: 'blk_s1c1', type: 'related-card', props: { href: '/about' } }] },
				]),
				page('pg_about0000', 'About', 'about', [{ id: 'blk_a1', type: 'prose-block', props: {} }]),
				page('pg_cont00000', 'Contact', 'contact', [{ id: 'blk_c1', type: 'cta-band', props: {} }]),
			],
		},
		look: {
			...look,
			blocks: { blk_h1: tone(10), blk_s1: tone(20), blk_gone01: tone(30) },
		},
	}
}

const baseLanding = (patch) => ({
	buildId: 'bld_0123456789abcdef01234567',
	placement: 'append',
	targetPageId: null,
	pages: [],
	chrome: null,
	menuAdd: [],
	look: null,
	blockLooks: {},
	skipped: [],
	needsInput: [],
	notes: [],
	...patch,
})

/** Three pages added to the roofer's site, one of whose planned slugs was taken meanwhile. */
function appendLanding() {
	return baseLanding({
		pages: [
			page('pg_new1aaaaa', 'Roof Repair', 'roof-repair', [
				{ id: 'blk_n1aaaaaa', type: 'page-hero', props: { heading: 'Repairs', actions: [{ label: 'Book', href: '/contact' }, { label: 'Call', href: 'tel:+15125550142' }] } },
			], { inHeader: false, createdAt: WRITTEN, updatedAt: WRITTEN }),
			page('pg_new2aaaaa', 'Contact', 'contact', [
				{ id: 'blk_n2aaaaaa', type: 'cta-band', props: { heading: 'Write to us', href: '/contact#form' } },
			], { inHeader: false, createdAt: WRITTEN, updatedAt: WRITTEN }),
			page('pg_new3aaaaa', 'Our Work', 'gallery', [
				{ id: 'blk_n3aaaaaa', type: 'media-mosaic', props: { linkHref: 'roof-repair' } },
			], { inHeader: false, createdAt: WRITTEN, updatedAt: WRITTEN }),
		],
		menuAdd: [
			{ pageId: 'pg_new1aaaaa', slug: 'roof-repair', label: 'Roof Repair', archetype: 'service', icon: 'Wrench' },
			{ pageId: 'pg_new2aaaaa', slug: 'contact', label: 'Contact', archetype: 'contact', icon: 'PhoneCall' },
			{ pageId: 'pg_new3aaaaa', slug: 'gallery', label: 'Our Work', archetype: 'work', icon: 'LayoutGrid' },
		],
		blockLooks: { blk_n1aaaaaa: tone(40), blk_notlanded: tone(50) },
	})
}

// ------------------------------------------------------------------ append

check('append: existing pages keep their order and ids, new pages follow in plan order', () => {
	const current = deepFreeze(currentSite())
	const result = landAiResult({ current, landing: deepFreeze(appendLanding()), now: NOW })
	assert.deepEqual(result.site.pages.map((p) => p.id), [
		'pg_home00000', 'pg_serv00000', 'pg_about0000', 'pg_cont00000', 'pg_new1aaaaa', 'pg_new2aaaaa', 'pg_new3aaaaa',
	])
	assert.deepEqual(result.pageIds, ['pg_new1aaaaa', 'pg_new2aaaaa', 'pg_new3aaaaa'])
	assert.equal(result.firstPageId, 'pg_new1aaaaa')
	assert.equal(result.site.pages[0].slug, '/')
})

check('append: a taken slug takes its archetype pair, is recorded, and is never /-2', () => {
	const result = landAiResult({ current: currentSite(), landing: appendLanding(), now: NOW })
	const added = result.site.pages.find((p) => p.id === 'pg_new2aaaaa')
	assert.equal(added.slug, 'contact-us')
	assert.deepEqual(result.renamed, { contact: 'contact-us' })
	assert.ok(result.notes.some((note) => note.includes('/contact-us')))
	for (const p of result.site.pages) {
		assert.ok(!p.slug.startsWith('/') || p.slug === '/', `${p.slug} starts with a slash`)
		assert.ok(!/^\/-\d/.test(p.slug), `${p.slug} is a numbered home`)
	}
	assert.equal(new Set(result.site.pages.map((p) => p.slug)).size, result.site.pages.length, 'slugs are unique')
})

check('append: the build\'s links follow the rename, the existing pages\' links do not', () => {
	const result = landAiResult({ current: currentSite(), landing: appendLanding(), now: NOW })
	const byId = Object.fromEntries(result.site.pages.map((p) => [p.id, p]))
	assert.equal(byId.pg_new1aaaaa.blocks[0].props.actions[0].href, '/contact-us')
	assert.equal(byId.pg_new1aaaaa.blocks[0].props.actions[1].href, 'tel:+15125550142')
	assert.equal(byId.pg_new2aaaaa.blocks[0].props.href, '/contact-us#form')
	assert.equal(byId.pg_new3aaaaa.blocks[0].props.linkHref, 'roof-repair')
	// The home page's links point at the page that owns /contact, which is still there.
	assert.equal(byId.pg_home00000.blocks[0].props.actions[0].href, '/contact')
	assert.equal(byId.pg_home00000.blocks[1].props.href, 'contact')
	assert.equal(result.site.chrome.ctaHref, 'contact')
})

check('append: new pages slot into the owner\'s menu (family group, plain item before the phone)', () => {
	const result = landAiResult({ current: currentSite(), landing: appendLanding(), now: NOW })
	const menu = result.site.chrome.menu
	assert.deepEqual(menu.map((item) => item.label), ['Services', 'Company', 'Contact', 'Contact', '(512) 555-0142'])
	const services = menu[0]
	assert.equal(services.links.length, 2)
	assert.deepEqual(
		{ label: services.links[1].label, href: services.links[1].href, icon: services.links[1].icon, description: services.links[1].description },
		{ label: 'Roof Repair', href: 'roof-repair', icon: 'Wrench', description: '' },
	)
	const company = menu[1]
	assert.equal(company.links[1].href, 'gallery')
	assert.equal(company.links[1].icon, undefined, 'a group without icons gets no icon')
	assert.equal(menu[3].href, 'contact-us', 'the plain item uses the final slug')
	assert.equal(menu[3].links.length, 0)
	for (const item of menu) {
		assert.ok(/^mi_[0-9a-z]{8}$|^mi_[a-z0-9]+$/.test(item.id))
		for (const link of item.links) assert.ok(link.id.length <= 40)
	}
	assert.ok(/^ml_[0-9a-z]{8}$/.test(services.links[1].id))
	assert.ok(/^mi_[0-9a-z]{8}$/.test(menu[3].id))
	const ids = menu.flatMap((item) => [item.id, ...item.links.map((link) => link.id)])
	assert.equal(new Set(ids).size, ids.length, 'menu ids are unique')
	for (const id of ['pg_new1aaaaa', 'pg_new2aaaaa', 'pg_new3aaaaa'])
		assert.equal(result.site.pages.find((p) => p.id === id).inHeader, false, 'a custom menu decides the header')
	assert.deepEqual(result.unslotted, [])
})

check('append: surfaces of landed blocks are added, kept ones stay, orphans are dropped', () => {
	const result = landAiResult({ current: currentSite(), landing: appendLanding(), now: NOW })
	assert.deepEqual(Object.keys(result.look.blocks).sort(), ['blk_h1', 'blk_n1aaaaaa', 'blk_s1'])
	assert.equal(result.look.blocks.blk_n1aaaaaa.page.color.lightness, 40)
	assert.equal(result.look.blocks.blk_h1.page.color.lightness, 10)
	assert.deepEqual(result.look.theme, currentSite().look.theme, 'no look in the payload keeps the theme')
})

check('append: ids are kept, and only an id used elsewhere on the site is replaced (its surface moves)', () => {
	const landing = appendLanding()
	landing.pages[0].blocks[0].id = 'blk_h1' // the home hero's id
	landing.blockLooks = { blk_h1: tone(77) }
	const result = landAiResult({ current: currentSite(), landing, now: NOW })
	const moved = result.site.pages.find((p) => p.id === 'pg_new1aaaaa').blocks[0].id
	assert.notEqual(moved, 'blk_h1')
	assert.ok(/^blk_[0-9a-f]{10}$/.test(moved) && BLOCK_KEY.test(moved))
	assert.equal(result.look.blocks[moved].page.color.lightness, 77, 'the incoming surface moved with the block')
	assert.equal(result.look.blocks.blk_h1.page.color.lightness, 10, 'the home hero keeps its own surface')
	assert.equal(result.site.pages.find((p) => p.id === 'pg_new2aaaaa').blocks[0].id, 'blk_n2aaaaaa')
	assert.equal(result.site.pages[0].blocks[0].id, 'blk_h1')
})

check('append with "Update the header menu": the build\'s complete menu replaces the menu', () => {
	const landing = appendLanding()
	landing.menuAdd = []
	landing.chrome = {
		...defaultChrome,
		ctaLabel: 'Free inspection',
		ctaHref: 'contact',
		menu: [
			{ id: 'mi_svc00001', label: 'Services', href: '', style: 'mega', promo: null, links: [
				{ id: 'ml_x0000001', label: 'All services', href: 'services', description: '' },
				{ id: 'ml_x0000002', label: 'Roof repair', href: 'roof-repair', description: '' },
			] },
			{ id: 'mi_gal00001', label: 'Our work', href: 'gallery', links: [], style: 'mega', promo: null },
			{ id: 'mi_con00001', label: 'Contact', href: 'contact', links: [], style: 'mega', promo: null },
		],
	}
	const result = landAiResult({ current: currentSite(), landing, now: NOW })
	assert.deepEqual(result.site.chrome.menu.map((item) => item.label), ['Services', 'Our work', 'Contact'])
	// Its links to the slug it planned follow the rename too.
	assert.equal(result.site.chrome.menu[2].href, 'contact-us')
	assert.equal(result.site.chrome.ctaHref, 'contact-us')
})

check('append: with the menu full the page is left to the footer', () => {
	const current = currentSite()
	current.site.chrome.menu = [
		...current.site.chrome.menu.slice(0, 3),
		{ id: 'mi_extra001', label: 'Blog', href: 'https://blog.example.com', links: [], style: 'mega', promo: null },
		{ id: 'mi_extra002', label: 'Shop', href: 'https://shop.example.com', links: [], style: 'mega', promo: null },
		current.site.chrome.menu[3],
	]
	const landing = baseLanding({
		pages: [page('pg_new9aaaaa', 'Pricing', 'pricing', [{ id: 'blk_n9aaaaaa', type: 'pricing-tiers', props: {} }])],
		menuAdd: [{ pageId: 'pg_new9aaaaa', slug: 'pricing', label: 'Pricing', archetype: 'pricing', icon: 'Receipt' }],
	})
	const result = landAiResult({ current, landing, now: NOW })
	assert.equal(result.site.chrome.menu.length, 6)
	assert.ok(!result.site.chrome.menu.some((item) => item.href === 'pricing'))
	assert.deepEqual(result.unslotted, ['pg_new9aaaaa'])
	assert.equal(result.site.pages.at(-1).inHeader, false)
})

// ------------------------------------------------------------------ replace-site

check('replace-site: the build\'s pages, chrome and look replace everything, ids kept', () => {
	const look = defaultLook()
	const landing = baseLanding({
		placement: 'replace-site',
		pages: [
			page('pg_r1aaaaaaa', 'Home', '/', [{ id: 'blk_r1aaaaaa', type: 'page-hero', props: { actions: [{ href: '/services' }] } }]),
			page('pg_r2aaaaaaa', 'Services', 'services', [{ id: 'blk_r2aaaaaa', type: 'grid', props: {}, children: [{ id: 'blk_r2child1', type: 'related-card', props: { href: '/contact' } }] }]),
			page('pg_r3aaaaaaa', 'Contact', 'contact', [{ id: 'blk_r3aaaaaa', type: 'cta-band', props: {} }], { inHeader: false }),
		],
		chrome: { ...defaultChrome, header: 'stacked', footer: 'split', ctaLabel: 'Call now', ctaHref: 'tel:+15125550142', menu: [] },
		look: { theme: { ...look.theme, accent: '#b45309', radius: 'round' }, page: tone(5), header: look.header, footer: look.footer },
		blockLooks: { blk_r1aaaaaa: tone(60), blk_r3aaaaaa: tone(70) },
	})
	const result = landAiResult({ current: deepFreeze(currentSite()), landing: deepFreeze(landing), now: NOW })
	assert.deepEqual(result.site.pages.map((p) => [p.id, p.slug]), [
		['pg_r1aaaaaaa', '/'], ['pg_r2aaaaaaa', 'services'], ['pg_r3aaaaaaa', 'contact'],
	])
	assert.deepEqual(result.renamed, {}, 'reusing an old slug is not a rename')
	assert.equal(result.site.chrome.header, 'stacked')
	assert.equal(result.site.chrome.ctaHref, 'tel:+15125550142')
	assert.deepEqual(result.site.chrome.menu, [])
	assert.equal(result.look.theme.accent, '#b45309')
	assert.equal(result.look.theme.radius, 'round')
	assert.equal(result.look.page.page.color.lightness, 5)
	assert.deepEqual(Object.keys(result.look.blocks).sort(), ['blk_r1aaaaaa', 'blk_r3aaaaaa'], 'old block looks went with their blocks')
	assert.equal(result.site.pages[1].blocks[0].children[0].id, 'blk_r2child1')
	assert.equal(result.site.pages[2].inHeader, false)
	assert.equal(result.firstPageId, 'pg_r1aaaaaaa')
})

check('replace-site: the first page always owns "/" and its old slug follows', () => {
	const landing = baseLanding({
		placement: 'replace-site',
		pages: [
			page('pg_r1aaaaaaa', 'Home', 'home', [{ id: 'blk_r1aaaaaa', type: 'page-hero', props: {} }]),
			page('pg_r2aaaaaaa', 'About', 'about', [{ id: 'blk_r2aaaaaa', type: 'cta-band', props: { href: '/home' } }]),
		],
		chrome: { ...defaultChrome, menu: [{ id: 'mi_home0001', label: 'Home', href: 'home', links: [], style: 'mega', promo: null }] },
		look: null,
	})
	const result = landAiResult({ current: currentSite(), landing, now: NOW })
	assert.equal(result.site.pages[0].slug, '/')
	assert.equal(result.site.pages[1].blocks[0].props.href, '/')
	assert.equal(result.site.chrome.menu[0].href, '/')
	assert.deepEqual(result.look.theme, currentSite().look.theme, 'a null look keeps the current design')
})

// ------------------------------------------------------------------ replace-page

check('replace-page: the target keeps id, name, slug, inHeader and createdAt, and takes the new blocks', () => {
	const current = currentSite()
	current.site.pages[1].inHeader = false
	const landing = baseLanding({
		placement: 'replace-page',
		targetPageId: 'pg_serv00000',
		pages: [
			page('pg_serv00000', 'Services by AI', 'services-ai', [
				{ id: 'blk_p1aaaaaa', type: 'page-hero', props: { heading: 'Every roof service' } },
				{ id: 'blk_p2aaaaaa', type: 'faq-accordion', props: {} },
			], { inHeader: true, createdAt: WRITTEN, updatedAt: WRITTEN, seo: { title: 'Roofing services in Austin', description: 'Repairs and replacements.' } }),
		],
		blockLooks: { blk_p1aaaaaa: tone(15) },
	})
	const result = landAiResult({ current: deepFreeze(current), landing: deepFreeze(landing), now: NOW })
	const target = result.site.pages[1]
	assert.deepEqual(
		{ id: target.id, name: target.name, slug: target.slug, inHeader: target.inHeader, createdAt: target.createdAt, updatedAt: target.updatedAt },
		{ id: 'pg_serv00000', name: 'Services', slug: 'services', inHeader: false, createdAt: OLD, updatedAt: NOW },
	)
	assert.deepEqual(target.blocks.map((b) => b.id), ['blk_p1aaaaaa', 'blk_p2aaaaaa'])
	if (pageSchema.shape && pageSchema.shape.seo)
		assert.deepEqual(target.seo, { title: 'Roofing services in Austin', description: 'Repairs and replacements.' })
	assert.deepEqual(result.site.pages.map((p) => p.id), currentSite().site.pages.map((p) => p.id), 'page order unchanged')
	assert.deepEqual(result.site.chrome, chromeSchema.parse(currentSite().site.chrome), 'the chrome is kept')
	assert.deepEqual(Object.keys(result.look.blocks).sort(), ['blk_h1', 'blk_p1aaaaaa'], "the old page's surfaces are replaced, orphans dropped")
	assert.deepEqual(result.look.theme, currentSite().look.theme)
	assert.equal(result.firstPageId, 'pg_serv00000')
	assert.deepEqual(result.pageIds, ['pg_serv00000'])
})

check('replace-page: a target deleted during the build lands as a new page, with a note', () => {
	const current = currentSite()
	current.site.pages.splice(1, 1)
	const landing = baseLanding({
		placement: 'replace-page',
		targetPageId: 'pg_serv00000',
		pages: [page('pg_serv00000', 'Services', 'services', [{ id: 'blk_p1aaaaaa', type: 'page-hero', props: {} }])],
		blockLooks: { blk_p1aaaaaa: tone(15) },
	})
	const result = landAiResult({ current, landing, now: NOW })
	assert.equal(result.site.pages.length, 4)
	assert.equal(result.site.pages.at(-1).id, 'pg_serv00000')
	assert.equal(result.site.pages.at(-1).slug, 'services')
	assert.ok(result.notes.some((note) => /deleted/.test(note)))
	assert.ok(result.look.blocks.blk_p1aaaaaa)
})

// ------------------------------------------------------------------ applying once, failing cleanly

check('the same landing twice: LandError("already-landed"), and nothing changes', () => {
	const landing = deepFreeze(appendLanding())
	const once = landAiResult({ current: currentSite(), landing, now: NOW })
	const after = deepFreeze({ site: once.site, look: once.look })
	const before = clone(after)
	throwsLand(() => landAiResult({ current: after, landing, now: NOW }), 'already-landed')
	assert.deepEqual(clone(after), before)
	// After an undo the pages are gone again, so it applies once more.
	const again = landAiResult({ current: currentSite(), landing, now: NOW })
	assert.equal(again.site.pages.length, 7)
})

check('a rebuilt page applied twice is already landed too', () => {
	const landing = baseLanding({
		placement: 'replace-page',
		targetPageId: 'pg_serv00000',
		pages: [page('pg_serv00000', 'Services', 'services', [{ id: 'blk_p1aaaaaa', type: 'page-hero', props: {} }])],
	})
	const once = landAiResult({ current: currentSite(), landing, now: NOW })
	throwsLand(() => landAiResult({ current: { site: once.site, look: once.look }, landing, now: NOW }), 'already-landed')
})

check('a payload that does not parse throws LandError("invalid") and changes nothing', () => {
	const current = deepFreeze(currentSite())
	const before = clone(current)
	const bad = appendLanding()
	bad.pages[1].name = '' // pageSchema needs a name
	throwsLand(() => landAiResult({ current, landing: deepFreeze(bad), now: NOW }), 'invalid')
	throwsLand(() => landAiResult({ current, landing: baseLanding({ pages: [] }), now: NOW }), 'invalid')
	throwsLand(() => landAiResult({ current, landing: baseLanding({ placement: 'restyle', pages: appendLanding().pages }), now: NOW }), 'invalid')
	throwsLand(() => landAiResult({ current, landing: null, now: NOW }), 'invalid')
	throwsLand(() => landAiResult({ current, landing: baseLanding({ pages: [{ id: 'pg_x', blocks: 'nope' }] }), now: NOW }), 'invalid')
	assert.deepEqual(clone(current), before)
})

// ------------------------------------------------------------------ freeSlug

check('freeSlug: the wanted slug when free, archetype pairs first, then a word, and -2 last', () => {
	assert.equal(freeSlug('gallery', ['/', 'about'], { archetype: 'work', name: 'Gallery' }), 'gallery')
	assert.equal(freeSlug('/gallery', ['/'], { archetype: 'work', name: 'Gallery' }), 'gallery', 'leading slashes are stripped')
	assert.equal(freeSlug('contact', ['contact'], { archetype: 'contact', name: 'Contact' }), 'contact-us')
	assert.equal(freeSlug('services', ['services'], { archetype: 'services', name: 'Services' }), 'our-services')
	assert.equal(freeSlug('pricing', ['pricing'], { archetype: 'pricing', name: 'Pricing' }), 'pricing-plans')
	assert.equal(freeSlug('reviews', ['reviews'], { archetype: 'reviews', name: 'Reviews' }), 'customer-reviews')
	assert.equal(freeSlug('about', ['about'], { archetype: 'about', name: 'About' }), 'about-us')
	assert.equal(freeSlug('services', ['services'], { archetype: 'custom', name: 'Services' }), 'our-services', 'the slug names the pair when the archetype has none')
	assert.equal(freeSlug('contact', ['contact', 'contact-us'], { archetype: 'contact', name: 'Get in touch' }), 'contact-get')
	assert.equal(freeSlug('contact', ['contact', 'contact-us'], { archetype: 'contact', name: 'Contact us' }), 'contact-2', 'a word already in the slug is skipped')
	assert.equal(freeSlug('roof-repair', ['roof-repair', 'roof-repair-2'], { archetype: 'service', name: 'Roof Repair' }), 'roof-repair-3')
	assert.equal(freeSlug('/', ['/'], { archetype: 'home', name: 'Home' }), 'home', "'/' is never handed out")
	assert.equal(freeSlug('', [], { archetype: 'custom', name: 'Storm Damage' }), 'storm-damage')
	assert.equal(freeSlug('/', ['/', 'page'], { archetype: 'custom', name: '' }), 'page-2')
	const long = 'a'.repeat(118) + '-z'
	const free = freeSlug(long, [long], { archetype: 'custom', name: 'Zed' })
	assert.ok(free.length <= 120 && free !== long)
	for (let i = 0; i < 50; i++) {
		const slug = freeSlug('/', ['/', 'home', ...Array.from({ length: i }, (_, n) => `home-${n + 2}`)], { archetype: 'home', name: 'Home' })
		assert.ok(!slug.startsWith('/') && slug !== '/')
	}
})

// ------------------------------------------------------------------ rewriteHrefs

check('rewriteHrefs: block links at every depth, the menu, promos and the button; external ones untouched', () => {
	const site = {
		version: 1,
		chrome: {
			...defaultChrome,
			ctaHref: 'about',
			menu: [
				{ id: 'mi_a', label: 'About', href: 'about', links: [], style: 'mega', promo: null },
				{ id: 'mi_b', label: 'More', href: '', style: 'mega', links: [{ id: 'ml_a', label: 'Team', href: 'about#team', description: '' }], promo: { eyebrow: '', title: 'Meet us', body: '', ctaLabel: '', href: '/about' } },
			],
		},
		pages: [
			page('pg_1', 'Home', '/', [
				{
					id: 'blk_1', type: 'page-hero',
					props: {
						heading: 'See /about for more', href: '/about', linkHref: 'about', other: '/about',
						actions: [{ label: 'A', href: '/about/' }, { label: 'B', href: 'https://example.com/about' }, { label: 'C', href: 'tel:+1555' }],
						group: { cta: { href: '/about?ref=hero' } },
					},
					children: [{ id: 'blk_1c', type: 'feature-card', props: { href: 'about' } }],
				},
				{ id: 'blk_2', type: 'cta-band', props: { href: '/contact' } },
			]),
		],
	}
	const next = rewriteHrefs(deepFreeze(site), { about: 'team' })
	const props = next.pages[0].blocks[0].props
	assert.equal(props.href, '/team')
	assert.equal(props.linkHref, 'team')
	assert.equal(props.heading, 'See /about for more', 'text that is not a link is left alone')
	assert.equal(props.other, '/about', 'only href fields are links')
	assert.deepEqual(props.actions.map((a) => a.href), ['/team/', 'https://example.com/about', 'tel:+1555'])
	assert.equal(props.group.cta.href, '/team?ref=hero')
	assert.equal(next.pages[0].blocks[0].children[0].props.href, 'team')
	assert.equal(next.pages[0].blocks[1], site.pages[0].blocks[1], 'an untouched block is shared')
	assert.equal(next.chrome.menu[0].href, 'team')
	assert.equal(next.chrome.menu[1].links[0].href, 'team#team')
	assert.equal(next.chrome.menu[1].promo.href, '/team')
	assert.equal(next.chrome.ctaHref, 'team')
	assert.equal(rewriteHrefs(site, {}), site)
	assert.equal(rewriteHrefs(site, { gallery: 'work' }), site, 'nothing to rename returns the same site')
})

check('rewriteHrefs: renames apply at once, so a → b and b → c never make c out of a', () => {
	const site = {
		version: 1,
		chrome: { ...defaultChrome, menu: [] },
		pages: [page('pg_1', 'Home', '/', [{ id: 'blk_1', type: 'x', props: { actions: [{ href: '/a' }, { href: 'b' }, { href: '/' }] } }])],
	}
	const next = rewriteHrefs(site, { a: 'b', b: 'c', '/': 'home' })
	assert.deepEqual(next.pages[0].blocks[0].props.actions.map((a) => a.href), ['/b', 'c', '/home'])
})

// ------------------------------------------------------------------ slotIntoMenu

const item = (id, label, href, links = [], style = 'mega') => ({ id, label, href, links, style, promo: null })
const link = (id, label, href, icon) => ({ id, label, href, description: '', ...(icon ? { icon } : {}) })

check('slotIntoMenu: the pages row shows new pages while it has room for six', () => {
	const chrome = { ...defaultChrome, menu: [] }
	const pages = [1, 2, 3, 4, 5].map((n) => page(`pg_${n}`, `P${n}`, n === 1 ? '/' : `p${n}`, []))
	pages.push(page('pg_hidden', 'Hidden', 'hidden', [], { inHeader: false }))
	const add = [
		{ pageId: 'pg_a', slug: 'a', label: 'A', archetype: 'custom', icon: '' },
		{ pageId: 'pg_b', slug: 'b', label: 'B', archetype: 'custom', icon: '' },
	]
	const result = slotIntoMenu(chrome, [...pages, page('pg_a', 'A', 'a', []), page('pg_b', 'B', 'b', [])], add)
	assert.equal(result.chrome, chrome, 'the menu is untouched')
	assert.deepEqual(result.inHeader, { pg_a: true, pg_b: false })
})

check('slotIntoMenu: a full group sends the page to a plain item, a full menu to the footer', () => {
	const fullLinks = Array.from({ length: 8 }, (_, n) => link(`ml_full000${n}`, `S${n}`, `s${n}`, 'Wrench'))
	const chrome = { ...defaultChrome, menu: [item('mi_svc', 'What we do', '', fullLinks), item('mi_con', 'Contact', 'contact')] }
	const add = [{ pageId: 'pg_a', slug: 'gutters', label: 'Gutters', archetype: 'service', icon: 'Droplets' }]
	const result = slotIntoMenu(chrome, [], add)
	assert.deepEqual(result.chrome.menu.map((i) => i.label), ['What we do', 'Contact', 'Gutters'])
	assert.equal(result.chrome.menu[0].links.length, 8, 'the full group is left as it was')
	assert.deepEqual(result.inHeader, { pg_a: false })

	const crowded = { ...defaultChrome, menu: Array.from({ length: 6 }, (_, n) => item(`mi_c${n}`, `Item ${n}`, `i${n}`)) }
	const left = slotIntoMenu(crowded, [], add)
	assert.equal(left.chrome, crowded, 'six items: the footer lists it')
})

check('slotIntoMenu: icons only when the group\'s links all have them; "More" and "Company" take about-type pages', () => {
	const chrome = {
		...defaultChrome,
		menu: [
			item('mi_svc', 'Services', '', [link('ml_1', 'Repair', 'repair', 'Wrench'), link('ml_2', 'Install', 'install')]),
			item('mi_more', 'More', '', [link('ml_3', 'About', 'about', 'Users')], 'dropdown'),
		],
	}
	const result = slotIntoMenu(chrome, [], [
		{ pageId: 'pg_a', slug: 'storm', label: 'Storm Damage', archetype: 'service', icon: 'CloudHail' },
		{ pageId: 'pg_b', slug: 'faq', label: 'FAQ', archetype: 'faq', icon: 'CircleHelp' },
		{ pageId: 'pg_c', slug: 'repair', label: 'Repair again', archetype: 'service', icon: 'Wrench' },
	])
	assert.equal(result.chrome.menu[0].links[2].icon, undefined, 'a mixed group gets no icon')
	assert.equal(result.chrome.menu[1].links[1].href, 'faq')
	assert.equal(result.chrome.menu[1].links[1].icon, 'CircleHelp')
	assert.equal(result.chrome.menu[0].links.length, 3, 'a slug the menu already links is not added twice')
})

// ------------------------------------------------------------------ pruneSlug

check('pruneSlug: links, emptied groups, plain items, promos and the button target of a deleted page go', () => {
	const chrome = {
		...defaultChrome,
		ctaLabel: 'Meet us',
		ctaHref: 'about',
		menu: [
			item('mi_co', 'Company', '', [link('ml_a', 'About', 'about')], 'dropdown'),
			{ ...item('mi_svc', 'Services', '', [link('ml_r', 'Repair', 'repair'), link('ml_t', 'Team', '/about')]), promo: { eyebrow: '', title: 'Our story', body: '', ctaLabel: 'Read', href: 'about' } },
			item('mi_ab', 'About', 'about'),
			item('mi_ph', 'Call', 'tel:+15125550142'),
		],
	}
	const next = pruneSlug(deepFreeze(chrome), 'about')
	assert.deepEqual(next.menu.map((i) => i.id), ['mi_svc', 'mi_ph'])
	assert.deepEqual(next.menu[0].links.map((l) => l.id), ['ml_r'])
	assert.equal(next.menu[0].promo, null)
	assert.equal(next.ctaHref, '')
	assert.equal(next.ctaLabel, 'Meet us')
	assert.equal(pruneSlug(chrome, 'gallery'), chrome, 'nothing pointing at it: the same chrome')
	assert.deepEqual(pruneSlug(chrome, '/about'), next, 'a root-relative slug is the same slug')
	const home = pruneSlug({ ...defaultChrome, ctaHref: '/', menu: [item('mi_h', 'Home', '/'), item('mi_x', 'X', 'x')] }, '/')
	assert.deepEqual(home.menu.map((i) => i.id), ['mi_x'])
	assert.equal(home.ctaHref, '')
})

if (failed) {
	console.log(`\n${failed} check(s) failed`)
	process.exit(1)
}
console.log('\nAll landing checks passed')
