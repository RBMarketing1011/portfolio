/**
 * Proves header, menu and footer normalization (section 9):
 *
 *   node scripts/prove-builder-chrome.cjs
 *
 *  - destinations (9.8 step 1): page:<slug> matched exactly or tolerantly (with a
 *    link-repaired Issue), tel and email from the owner's details, and nothing that would
 *    leave the site (root-relative paths, other hosts, javascript:);
 *  - structure (9.2-9.4): thin megas demoted, single links flattened, groups trimmed,
 *    coverage of every menu page, the phone entry rule, the three menu pins;
 *  - icons all or none and unique per panel; descriptions and promo copy through the
 *    facts gate; ids unique and valid; the final gate never blanks a value;
 *  - variants (9.1, 9.7) and footer details; inHeader; pruneChrome;
 *  - the worked examples of section 9.10 (the roofer, the dental clinic, the one-page landing).
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadTs } = require('./lib/load-ts.cjs')
const { fixtureContext } = require('./fixtures/builder-ai/context.cjs')

const chromeModule = loadTs('src/lib/builder/ai/chrome.ts')
const planner = loadTs('src/lib/builder/ai/planner.ts')
const normalize = loadTs('src/lib/builder/ai/plan-normalize.ts')
const images = loadTs('src/lib/builder/ai/images.ts')
const { chromeSchema } = loadTs('src/lib/builder/page-schema.ts')
const { isCanonicalIcon } = loadTs('src/lib/builder/catalog/lexicon.ts')
const { DEFAULT_PINS } = loadTs('src/lib/builder/ai/contract.ts')

const { normalizeChrome, pruneChrome, matchPageTarget } = chromeModule

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

const FIXTURES = path.join(__dirname, 'fixtures', 'builder-ai')
const loadFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `plan-${name}.json`), 'utf8'))

/** A fixture planned, then its chrome normalized exactly as the plan route does it. */
function planned(name, pins = {}) {
	const fixture = loadFixture(name)
	const built = fixtureContext(fixture)
	const reply = planner.readPlanReply(fixture.reply)
	const { plan, images: imagePlan } = normalize.normalizePlan(reply, built.ctx)
	const run = (overrides = {}) =>
		normalizeChrome({
			reply: reply.chrome,
			pages: plan.pages,
			existing: built.ctx.existing?.pages ?? [],
			site: plan.site,
			contact: {
				phone: built.business.phone?.display ?? null,
				email: built.business.email?.display ?? null,
				address: built.business.address || null,
				hours: built.business.hours,
			},
			personality: plan.site.personality,
			pins: { ...built.request.pins, ...pins },
			current: null,
			promoImage: images.promoImagePicker(imagePlan, plan.pages),
			corpus: built.ctx.corpus,
			language: plan.site.language,
			...overrides,
		})
	return { fixture, ...built, reply, plan, images: imagePlan, run }
}

// A small synthetic site: home, a services hub, three service pages, about, contact.
const page = (key, name, slug, archetype, extra = {}) => ({
	key, id: `pg_${key.padStart(10, '0')}`, name, slug, path: slug === '/' ? '/' : `/${slug}`, archetype, purpose: '', keyword: '',
	inMenu: true, outlined: true, openerHint: null, closerHint: null, photoAllocation: [], sections: [], ...extra,
})
const PAGES = [
	page('p1', 'Home', '/', 'home'),
	page('p2', 'Services', 'services', 'services'),
	page('p3', 'Roof Repair', 'roof-repair', 'service'),
	page('p4', 'Roof Replacement', 'roof-replacement', 'service'),
	page('p5', 'Storm Damage', 'storm-damage', 'service'),
	page('p6', 'About', 'about', 'about'),
	page('p7', 'Contact', 'contact', 'contact'),
]
const SITE = {
	name: 'Summit Roofing Co.', language: 'en-US', businessType: 'RoofingContractor', tagline: '', description: '', audience: '',
	offer: 'Roof repair and replacement with free inspections.', voice: '', personality: 'rugged', services: [], areas: [],
	primary: { label: 'Free inspection', href: '/contact', chromeHref: 'contact' },
}
const PROMO_OFF = { show: false, eyebrow: '', title: '', body: '', ctaLabel: '', target: '', image: '' }
const item = (label, kind, target, links = [], extra = {}) => ({ label, kind, target, style: 'mega', links, promo: PROMO_OFF, ...extra })
const link = (label, target, description = '', icon = '') => ({ label, target, description, icon })
const CORPUS = 'family owned roofing company in austin since 2004 repairs full replacements storm damage free inspections'
const base = (overrides = {}) => ({
	reply: { header: 'bar', footer: 'columns', cta: { label: 'Free Inspection', target: 'page:contact' }, menu: [] },
	pages: PAGES,
	existing: [],
	site: SITE,
	contact: { phone: '(512) 555-0142', email: null, address: null, hours: [] },
	personality: 'rugged',
	pins: { header: 'ai', footer: 'ai', menu: 'ai', ctaLabel: '' },
	current: null,
	promoImage: () => null,
	corpus: CORPUS,
	...overrides,
})
const menuWith = (menu, overrides = {}) => normalizeChrome(base({ reply: { ...base().reply, menu }, ...overrides }))
const hrefs = (chrome) => chrome.menu.flatMap((entry) => (entry.links.length ? entry.links.map((item) => item.href) : [entry.href]))

// ---------------------------------------------------------------- destinations (9.8 step 1)

check('matchPageTarget: exact, slugified, by name, plural or singular; repaired when tolerant', () => {
	const pages = PAGES.map(({ slug, name }) => ({ slug, name }))
	assert.deepEqual(matchPageTarget('page:roof-repair', pages), { slug: 'roof-repair', repaired: false })
	assert.deepEqual(matchPageTarget('page:/', pages), { slug: '/', repaired: false })
	assert.deepEqual(matchPageTarget('page:Roof Repair', pages), { slug: 'roof-repair', repaired: true })
	assert.deepEqual(matchPageTarget('page:roof-repairs', pages), { slug: 'roof-repair', repaired: true })
	assert.deepEqual(matchPageTarget('page:storm-damages', pages), { slug: 'storm-damage', repaired: true })
	assert.deepEqual(matchPageTarget('page:service', pages), { slug: 'services', repaired: true })
	assert.deepEqual(matchPageTarget('page:home', pages), { slug: '/', repaired: true })
	assert.deepEqual(matchPageTarget('contact', pages), { slug: 'contact', repaired: true })
	for (const target of ['/contact', 'https://example.com', 'javascript:alert(1)', '//evil.example', 'page:gutters', '', 'tel', 'page:https://evil.example/x'])
		assert.equal(matchPageTarget(target, pages), null, target)
})

check('destinations: tel and email come from the owner; anything leaving the site is dropped', () => {
	const { chrome, notes } = menuWith([
		item('Call', 'phone', 'tel'),
		item('Email', 'page', 'email'),
		item('Away', 'page', 'https://evil.example'),
		item('Script', 'page', 'javascript:alert(1)'),
		item('Rooted', 'page', '/contact'),
		item('Repairs', 'page', 'page:roof-repairs'),
	])
	const all = hrefs(chrome)
	assert.ok(all.includes('tel:+15125550142'))
	assert.ok(!all.some((href) => /^(https?:|javascript:|\/\/|\/)/.test(href)), all.join(' '))
	assert.ok(!all.some((href) => href.startsWith('mailto:')), 'no email on file, so no email link')
	assert.ok(all.includes('roof-repair'))
	assert.ok(notes.some((note) => note.code === 'link-repaired' && /roof-repairs/.test(note.message)))
	assert.ok(notes.some((note) => note.code === 'menu-adjusted'))
})

// ---------------------------------------------------------------- structure (9.2-9.4)

check('a thin mega panel without a promo opens as a dropdown; with a promo it stays', () => {
	// Two service pages only, so coverage has nothing to add to the panel.
	const pages = [PAGES[0], PAGES[2], PAGES[3], PAGES[5], PAGES[6]]
	const thin = menuWith([item('Services', 'group', '', [link('Repair', 'page:roof-repair'), link('Replacement', 'page:roof-replacement')])], { pages })
	assert.equal(thin.chrome.menu.find((entry) => entry.label === 'Services').style, 'dropdown')
	const promo = { show: true, eyebrow: 'Free', title: 'Book a free roof inspection', body: 'We check every slope and leave a written estimate.', ctaLabel: 'Book it', target: 'page:contact', image: '' }
	const kept = menuWith([item('Services', 'group', '', [link('Repair', 'page:roof-repair'), link('Replacement', 'page:roof-replacement')], { promo })], { pages })
	const services = kept.chrome.menu.find((entry) => entry.label === 'Services')
	assert.equal(services.style, 'mega')
	assert.equal(services.promo.href, 'contact')
})

check('a group with one link becomes a plain link named after its page; an empty group goes', () => {
	const { chrome } = menuWith([item('Company', 'group', '', [link('About us', 'page:about')], { style: 'dropdown' }), item('Nothing', 'group', '', [link('x', 'page:missing')])])
	const about = chrome.menu.find((entry) => entry.href === 'about')
	assert.ok(about)
	assert.equal(about.label, 'About')
	assert.equal(about.links.length, 0)
	assert.ok(!chrome.menu.some((entry) => entry.label === 'Nothing'))
})

check('three service pages get a Services panel even when the planner made none, hub first', () => {
	const { chrome } = menuWith([item('About', 'page', 'page:about'), item('Contact', 'page', 'page:contact')])
	const services = chrome.menu[0]
	assert.equal(services.label, 'Services')
	assert.deepEqual(services.links.map((entry) => entry.href), ['services', 'roof-repair', 'roof-replacement', 'storm-damage'])
	assert.equal(services.links[0].label, 'All services')
})

check('coverage: a menu page nobody links to joins its group, else a plain link', () => {
	const pages = [...PAGES, page('p8', 'Gutters', 'gutters', 'service'), page('p9', 'Reviews', 'reviews', 'reviews'), page('p10', 'Careers', 'careers', 'custom', { inMenu: false })]
	const { chrome } = menuWith(
		[item('Services', 'group', '', [link('All services', 'page:services'), link('Repair', 'page:roof-repair'), link('Replacement', 'page:roof-replacement'), link('Storm', 'page:storm-damage')]), item('Company', 'group', '', [link('About', 'page:about'), link('Contact', 'page:contact')], { style: 'dropdown' })],
		{ pages },
	)
	const services = chrome.menu.find((entry) => entry.label === 'Services')
	const company = chrome.menu.find((entry) => entry.label === 'Company')
	assert.ok(services.links.some((entry) => entry.href === 'gutters'), 'the service page joins Services')
	assert.ok(company.links.some((entry) => entry.href === 'reviews'), 'the reviews page joins Company')
	assert.ok(!hrefs(chrome).includes('careers'), 'a page kept out of the menu stays out')
	assert.ok(!hrefs(chrome).includes('/'), 'the logo links home')
})

check('a mega panel over eight links is trimmed into More; the top level never passes eight', () => {
	const many = Array.from({ length: 11 }, (_, index) => page(`p${index + 10}`, `Service ${index + 1}`, `service-${index + 1}`, 'service'))
	const pages = [PAGES[0], ...many, PAGES[6]]
	const { chrome } = menuWith([item('Services', 'group', '', many.map((entry) => link(entry.name, `page:${entry.slug}`)))], { pages })
	const services = chrome.menu.find((entry) => entry.label === 'Services')
	assert.equal(services.links.length, 8)
	const more = chrome.menu.find((entry) => entry.label === 'More')
	assert.ok(more && more.style === 'dropdown' && more.links.length >= 2)
	assert.ok(chrome.menu.length <= 8)
})

check('few pages: plain links only, unless the mega pin asks for a panel', () => {
	const pages = [PAGES[0], PAGES[2], PAGES[5], PAGES[6]]
	const grouped = [item('Company', 'group', '', [link('Repair', 'page:roof-repair'), link('About', 'page:about'), link('Contact', 'page:contact')], { style: 'dropdown' })]
	assert.ok(menuWith(grouped, { pages }).chrome.menu.every((entry) => !entry.links.length))
	const pinned = menuWith(grouped, { pages, pins: { ...base().pins, menu: 'mega' } })
	const mega = pinned.chrome.menu.find((entry) => entry.links.length)
	assert.equal(mega.style, 'mega')
	assert.ok(mega.promo && mega.promo.title && mega.promo.body, 'a short pinned mega panel gets a promo card')
})

check('the dropdown pin makes every group a list; the links pin flattens to six', () => {
	const menu = [item('Services', 'group', '', [link('All services', 'page:services'), link('Repair', 'page:roof-repair'), link('Replacement', 'page:roof-replacement'), link('Storm', 'page:storm-damage')], { promo: { ...PROMO_OFF, show: true, title: 'Book', body: 'A free inspection.' } })]
	const dropdown = menuWith(menu, { pins: { ...base().pins, menu: 'dropdown' } }).chrome
	assert.ok(dropdown.menu.filter((entry) => entry.links.length).every((entry) => entry.style === 'dropdown' && entry.promo === null))
	const links = menuWith(menu, { pins: { ...base().pins, menu: 'links' } }).chrome
	assert.ok(links.menu.every((entry) => !entry.links.length))
	assert.ok(links.menu.filter((entry) => !entry.href.startsWith('tel:')).length <= 6)
})

check('one-page sites have no menu entries', () => {
	const { chrome } = menuWith([item('Contact', 'page', 'page:contact')], { pages: [page('p1', 'Offer', '/', 'landing')] })
	assert.ok(chrome.menu.every((entry) => entry.href.startsWith('tel:')))
})

// ---------------------------------------------------------------- the phone entry (9.2)

check('the phone entry: call-led brands, a phone, a button that is not tel:, a header that is not floating', () => {
	const menu = [item('About', 'page', 'page:about')]
	assert.ok(hrefs(menuWith(menu).chrome).includes('tel:+15125550142'), 'rugged with a phone gets one')
	assert.equal(menuWith(menu).chrome.menu.find((entry) => entry.href.startsWith('tel:')).label, '(512) 555-0142')
	assert.ok(!hrefs(menuWith(menu, { personality: 'refined' }).chrome).some((href) => href.startsWith('tel:')), 'refined does not')
	const telButton = { ...base().reply, menu, cta: { label: 'Call now', target: 'tel' } }
	assert.ok(!hrefs(normalizeChrome(base({ reply: telButton })).chrome).some((href) => href.startsWith('tel:')), 'not when the button already calls')
	const floating = normalizeChrome(base({ reply: { ...base().reply, menu, header: 'floating' } })).chrome
	assert.ok(!hrefs(floating).some((href) => href.startsWith('tel:')), 'not on a floating header')
	assert.ok(!hrefs(menuWith(menu, { contact: { phone: null, email: null, address: null, hours: [] } }).chrome).some((href) => href.startsWith('tel:')))
})

// ---------------------------------------------------------------- icons, descriptions, promo (9.3)

check('icons: every link or none, canonical, never repeated in a panel', () => {
	const repeated = menuWith([item('Treatments', 'group', '', [link('Cleanings', 'page:roof-repair', '', 'Sparkles'), link('Whitening', 'page:roof-replacement', '', 'Smile'), link('Invisalign', 'page:storm-damage', '', 'Smile'), link('Hub', 'page:services', '', 'NotAnIcon')], { promo: { ...PROMO_OFF, show: true, title: 'New patients welcome', body: 'Book a first visit.' } })])
	const icons = repeated.chrome.menu[0].links.map((entry) => entry.icon)
	assert.ok(icons.every((icon) => icon && isCanonicalIcon(icon)), icons.join(' '))
	assert.equal(new Set(icons).size, icons.length, 'unique in the panel')
	assert.ok(repeated.notes.some((note) => note.code === 'icon-replaced'))
	const none = menuWith([item('Services', 'group', '', [link('Repair', 'page:roof-repair'), link('Replacement', 'page:roof-replacement'), link('Storm', 'page:storm-damage'), link('All', 'page:services')])])
	assert.ok(none.chrome.menu[0].links.every((entry) => entry.icon === undefined), 'no icons in, no icons out')
	const some = menuWith([item('Services', 'group', '', [link('Repair', 'page:roof-repair', '', 'Wrench'), link('Replacement', 'page:roof-replacement'), link('Storm', 'page:storm-damage'), link('All', 'page:services')])])
	assert.ok(some.chrome.menu[0].links.every((entry) => entry.icon && isCanonicalIcon(entry.icon)), 'one icon in, icons on every link')
})

check('descriptions: one benefit line, no full stop, no invented facts', () => {
	const long = 'Leaks, lifted shingles and failed flashing fixed before they spread through the whole roof and into the ceiling below.'
	const { chrome } = menuWith([
		item('Services', 'group', '', [
			link('Repair', 'page:roof-repair', long),
			link('Replacement', 'page:roof-replacement', 'Licensed, insured and available 24/7 for 15 years'),
			link('Storm', 'page:storm-damage', 'Documented inspections to support your insurance claim.'),
			link('All', 'page:services', 'Every roofing service in one place'),
		]),
		item('More', 'group', '', [link('About', 'page:about', 'A family business that cares about every single customer'), link('Contact', 'page:contact', 'Book a free inspection')], { style: 'dropdown' }),
	])
	const [services, more] = chrome.menu
	assert.ok(services.links[0].description.length <= 90 && !services.links[0].description.endsWith('.'))
	assert.equal(services.links[1].description, '', 'unsupported claims empty the line')
	assert.equal(services.links[2].description, 'Documented inspections to support your insurance claim')
	assert.ok(more.links.every((entry) => entry.description.length <= 60))
})

check('promo cards: title and body required, the target is the primary page, the photo from the pool', () => {
	const promo = { show: true, eyebrow: 'Guaranteed', title: 'Book a free roof inspection with the family crew today', body: 'We check every slope, photograph what we find and leave you a written estimate.', ctaLabel: 'Schedule it', target: 'https://evil.example', image: 'img9' }
	const links4 = [link('All', 'page:services'), link('Repair', 'page:roof-repair'), link('Replacement', 'page:roof-replacement'), link('Storm', 'page:storm-damage')]
	const { chrome } = menuWith([item('Services', 'group', '', links4, { promo })], { promoImage: () => 'media:md_promo' })
	const card = chrome.menu[0].promo
	assert.equal(card.href, 'contact')
	assert.equal(card.image, 'media:md_promo')
	assert.ok(card.title.length <= 48)
	assert.ok(card.body.length <= 140)
	assert.equal(card.eyebrow, '', 'a guarantee the owner never made is not printed')
	const empty = menuWith([item('Services', 'group', '', links4, { promo: { ...promo, title: '', body: '' } })], { site: { ...SITE, primary: { ...SITE.primary, label: '' }, offer: '' } })
	assert.equal(empty.chrome.menu[0].promo, null, 'no title or body, no card')
})

// ---------------------------------------------------------------- variants (9.1, 9.7)

check('header: a pin wins; floating fits five entries; six or more go stacked; none only for a landing page', () => {
	const many = [item('A', 'page', 'page:services'), item('B', 'page', 'page:roof-repair'), item('C', 'page', 'page:roof-replacement'), item('D', 'page', 'page:storm-damage'), item('E', 'page', 'page:about'), item('F', 'page', 'page:contact')]
	const pages = PAGES.map((entry) => ({ ...entry, archetype: entry.archetype === 'service' ? 'custom' : entry.archetype }))
	const header = (variant, extra = {}) => normalizeChrome(base({ reply: { ...base().reply, header: variant, menu: many }, pages, personality: 'refined', ...extra })).chrome.header
	assert.equal(header('floating'), 'bar', 'six entries do not fit a pill')
	assert.equal(header('bar'), 'bar')
	// Four entries covering every page but home: a pill fits.
	assert.equal(normalizeChrome(base({ reply: { ...base().reply, header: 'floating', menu: many.slice(0, 4) }, pages: pages.slice(0, 5), personality: 'refined' })).chrome.header, 'floating')
	assert.equal(normalizeChrome(base({ reply: { ...base().reply, header: 'floating', menu: [...many, item('G', 'page', 'page:x')] }, pages: [...pages, page('p8', 'X', 'x', 'custom')], personality: 'refined' })).chrome.header, 'stacked')
	assert.equal(header('none'), 'bar', 'no header only for a one-page landing site')
	const pinned = normalizeChrome(base({ reply: { ...base().reply, header: 'bar', menu: many }, pages, personality: 'refined', pins: { ...base().pins, header: 'floating' } })).chrome
	assert.equal(pinned.header, 'floating')
	assert.ok(pinned.menu.length <= 5, 'a pinned pill folds the rest into More')
	const landing = normalizeChrome(base({ reply: { ...base().reply, header: 'none', footer: 'none', menu: [] }, pages: [page('p1', 'Offer', '/', 'landing')] })).chrome
	assert.equal(landing.header, 'none')
	assert.equal(landing.footer, 'none')
	assert.equal(normalizeChrome(base({ reply: { ...base().reply, header: null } })).chrome.header, 'bar', "the rugged personality's default")
	assert.equal(normalizeChrome(base({ reply: { ...base().reply, header: null }, personality: 'technical', contact: { phone: null, email: null, address: null, hours: [] } })).chrome.header, 'floating')
})

check('footer: a pin wins; centered only with six pages or fewer; split for seven or more; details from two contact facts', () => {
	assert.equal(normalizeChrome(base({ reply: { ...base().reply, footer: 'centered' } })).chrome.footer, 'split', 'seven pages')
	assert.equal(normalizeChrome(base({ reply: { ...base().reply, footer: 'centered' }, pages: PAGES.slice(0, 4) })).chrome.footer, 'centered')
	assert.equal(normalizeChrome(base({ reply: { ...base().reply, footer: null }, pages: PAGES.slice(0, 4) })).chrome.footer, 'columns')
	assert.equal(normalizeChrome(base({ reply: { ...base().reply, footer: null }, pages: PAGES.slice(0, 4), personality: 'luxe' })).chrome.footer, 'centered')
	assert.equal(normalizeChrome(base({ pins: { ...base().pins, footer: 'none' } })).chrome.footer, 'none')
	assert.equal(normalizeChrome(base()).chrome.footerDetails, false, 'one contact fact')
	assert.equal(normalizeChrome(base({ contact: { phone: '(512) 555-0142', email: null, address: null, hours: ['Monday to Friday 7:00 to 18:00'] } })).chrome.footerDetails, true)
})

check('the header button: a pinned label wins, the target goes through dest, none means no button', () => {
	const pinned = normalizeChrome(base({ pins: { ...base().pins, ctaLabel: 'Schedule a free roof inspection' } })).chrome
	assert.equal(pinned.ctaLabel, 'Schedule a free roof inspection')
	assert.equal(pinned.ctaHref, 'contact')
	const long = normalizeChrome(base({ reply: { ...base().reply, cta: { label: 'Book your completely free roof inspection today', target: 'page:contacts' } } })).chrome
	assert.ok(long.ctaLabel.length <= 22)
	assert.equal(long.ctaHref, 'contact')
	const away = normalizeChrome(base({ reply: { ...base().reply, cta: { label: 'Go', target: 'https://evil.example' } } })).chrome
	assert.equal(away.ctaHref, 'contact', 'falls back to the primary action')
	const nothing = normalizeChrome(base({ reply: { ...base().reply, cta: { label: '', target: '' } }, site: { ...SITE, primary: { label: '', href: '', chromeHref: '' } } })).chrome
	assert.deepEqual([nothing.ctaLabel, nothing.ctaHref], ['', ''])
})

// ---------------------------------------------------------------- ids, inHeader, the final gate

check('ids: mi_ and ml_ with eight base-36 characters, unique across the menu', () => {
	const { chrome } = planned('roofer').run()
	const ids = chrome.menu.flatMap((entry) => [entry.id, ...entry.links.map((item) => item.id)])
	assert.equal(new Set(ids).size, ids.length)
	for (const entry of chrome.menu) {
		assert.match(entry.id, /^mi_[0-9a-z]{8}$/)
		for (const item of entry.links) assert.match(item.id, /^ml_[0-9a-z]{8}$/)
	}
})

check('inHeader: home and at most six pages of the menu, keyed by slug', () => {
	const many = Array.from({ length: 9 }, (_, index) => page(`p${index + 2}`, `Page ${index + 1}`, `page-${index + 1}`, 'custom'))
	const { inHeader } = menuWith(many.map((entry) => item(entry.name, 'page', `page:${entry.slug}`)), { pages: [PAGES[0], ...many] })
	assert.equal(inHeader['/'], true)
	assert.equal(Object.entries(inHeader).filter(([slug, shown]) => shown && slug !== '/').length, 6)
	assert.equal(Object.keys(inHeader).length, 10)
})

check('the final gate: every value survives the chrome schema as written', () => {
	const huge = 'x'.repeat(500)
	const { chrome } = menuWith([item(huge, 'group', '', [link(huge, 'page:roof-repair', huge, huge), link(huge, 'page:about', huge)], { style: 'dropdown' })], {
		reply: { header: 'bar', footer: 'columns', cta: { label: huge, target: 'page:contact' }, menu: [item(huge, 'group', '', [link(huge, 'page:roof-repair', huge, huge), link(huge, 'page:about', huge)], { style: 'dropdown' })] },
	})
	const parsed = chromeSchema.parse(chrome)
	assert.deepEqual(parsed, chrome)
	assert.ok(chrome.menu.every((entry) => entry.label && entry.label.length <= 22))
})

// ---------------------------------------------------------------- pruneChrome

check('pruneChrome drops links to pages that are not landing, flattens, and clears a dead button', () => {
	const { chrome } = planned('roofer').run()
	const pruned = pruneChrome(chrome, ['/', 'services', 'roof-replacement', 'about', 'contact'])
	assert.ok(!hrefs(pruned).includes('roof-repair'))
	assert.ok(!hrefs(pruned).includes('storm-damage'))
	assert.ok(hrefs(pruned).includes('tel:+15125550142'), 'the phone stays')
	const noContact = pruneChrome(chrome, ['/', 'services'])
	assert.equal(noContact.ctaHref, '')
	assert.equal(noContact.ctaLabel, '')
	assert.ok(!hrefs(noContact).includes('contact'))
	const flat = pruneChrome({ ...chrome, menu: [{ id: 'mi_aaaaaaaa', label: 'Company', href: '', style: 'dropdown', promo: null, links: [{ id: 'ml_aaaaaaaa', label: 'About', href: 'about', description: '' }, { id: 'ml_bbbbbbbb', label: 'Gone', href: 'gone', description: '' }] }] }, ['/', 'about'])
	assert.deepEqual(flat.menu.map((entry) => [entry.label, entry.href, entry.links.length]), [['About', 'about', 0]])
	assert.deepEqual(chromeSchema.parse(pruned), pruned)
})

// ---------------------------------------------------------------- the worked examples (9.10)

check('roofer (9.10): Services mega, About, Contact and the phone; bar, split, details, the button', () => {
	const { chrome, notes } = planned('roofer').run()
	assert.deepEqual(chrome.menu.map((entry) => [entry.label, entry.href || entry.style]), [['Services', 'mega'], ['About', 'about'], ['Contact', 'contact'], ['(512) 555-0142', 'tel:+15125550142']])
	const services = chrome.menu[0]
	assert.deepEqual(services.links.map((entry) => entry.href), ['services', 'roof-replacement', 'roof-repair', 'storm-damage'])
	assert.deepEqual(services.links.map((entry) => entry.icon), ['LayoutGrid', 'House', 'Hammer', 'CloudHail'])
	assert.equal(services.links[1].description, '', '"the same day" is not something the owner said')
	assert.equal(services.links[2].description, 'Leaks, lifted shingles and failed flashing fixed before they spread')
	assert.equal(services.promo.title, 'Book a free roof inspection')
	assert.equal(services.promo.href, 'contact')
	assert.ok(services.promo.image?.startsWith('media:'), 'a landscape photo from the pool')
	assert.equal(chrome.header, 'bar')
	assert.equal(chrome.footer, 'split')
	assert.equal(chrome.footerDetails, true)
	assert.deepEqual([chrome.ctaLabel, chrome.ctaHref], ['Free Inspection', 'contact'])
	assert.ok(!notes.some((note) => note.level === 'warn'))
})

check('dental (9.10): the pinned Treatments mega with unique icons and a promo, About and Contact plain', () => {
	const { chrome } = planned('dental').run()
	const treatments = chrome.menu.find((entry) => entry.label === 'Treatments')
	assert.equal(treatments.style, 'mega')
	assert.equal(treatments.links.length, 6)
	const icons = treatments.links.map((entry) => entry.icon)
	assert.ok(icons.every((icon) => isCanonicalIcon(icon)))
	assert.equal(new Set(icons).size, 6, `icons repeat: ${icons.join(' ')}`)
	assert.equal(treatments.promo.title, 'New patients welcome')
	assert.equal(treatments.promo.href, 'contact')
	assert.equal(treatments.promo.image, undefined, 'no photos, no promo image')
	assert.deepEqual(chrome.menu.filter((entry) => !entry.links.length).map((entry) => entry.href), ['about', 'contact'])
	assert.equal(chrome.footerDetails, false, 'the clinic gave no contact details')
})

check('one-page landing (9.10): floating, no menu entries, the button calls, centered footer', () => {
	const { chrome } = planned('landing').run()
	assert.equal(chrome.header, 'floating')
	assert.deepEqual(chrome.menu, [])
	assert.deepEqual([chrome.ctaLabel, chrome.ctaHref], ['Book a tune-up', 'tel:+15125550142'])
	assert.equal(chrome.footer, 'centered')
})

check('append with the menu updated: old and new pages are destinations, the kept design keeps the variants', () => {
	const result = planned('append')
	const current = { header: 'stacked', footer: 'centered', ctaLabel: '', ctaHref: '', menu: [], footerDetails: false }
	const { chrome } = result.run({ current })
	assert.deepEqual([chrome.header, chrome.footer], ['stacked', 'centered'])
	const all = hrefs(chrome)
	for (const slug of ['services', 'services-gutters', 'roof-inspections', 'about', 'contact']) assert.ok(all.includes(slug), slug)
	assert.ok(!all.includes('gutters'), 'the planner\'s stale slug does not survive')
})

if (failed) {
	console.log(`\n${failed} chrome checks failed`)
	process.exit(1)
}
console.log('\nchrome checks passed')
