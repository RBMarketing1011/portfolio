/**
 * Proves the builder's header menu and the built site's chrome: the schema (old sites
 * still load unchanged, junk is repaired), link resolution, what the header, the mobile
 * sheet, the mega panel and the footer render, and the header's surface layer.
 *
 *   node scripts/prove-builder-menu.cjs
 */
const assert = require('node:assert/strict')
const { clearCache, loadTs, mock, rootRequire } = require('./lib/load-ts.cjs')
const React = rootRequire('react')
const { renderToStaticMarkup } = rootRequire('react-dom/server')

let passed = 0
let failed = 0
const check = (name, fn) => {
	try {
		fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name}`)
		console.log(`      ${String(error?.message ?? error).split('\n').join('\n      ')}`)
	}
}

const schema = loadTs('src/lib/builder/page-schema.ts')
const { BuiltHeader, BuiltFooter } = loadTs('src/components/built-chrome.tsx')
const builtMenu = loadTs('src/components/built-menu.tsx')

const h = React.createElement
const render = (element) => renderToStaticMarkup(element)
const header = (props) => render(h(BuiltHeader, props))
const footer = (props) => render(h(BuiltFooter, props))
const count = (text, part) => text.split(part).length - 1

// 1) An old site (no menu key) still loads, with an empty menu = "use pages".
const old = schema.siteSchema.parse({ version: 1, chrome: { header: 'bar', footer: 'columns', ctaLabel: '', ctaHref: '' }, pages: [] })

check('an old site without a menu still loads, with an empty menu', () => {
	assert.deepEqual(old.chrome.menu, [])
	const bare = schema.siteSchema.parse({ version: 1, pages: [] })
	assert.deepEqual(bare.chrome.menu, [])
	assert.equal(bare.chrome.footerDetails, false)
})

// 2) A menu round-trips, and junk is repaired rather than rejected.
const menu = [
	{ id: 'a', label: 'Home', href: '/' },
	{
		id: 'b',
		label: 'Services',
		style: 'mega',
		links: [
			{ id: 'l1', label: 'Web design', href: 'web', description: 'Sites that sell', icon: 'Globe' },
			{ id: 'l2', label: 'SEO', href: 'https://example.com/seo', description: 'Be found' },
			{ id: 'l3', label: 'Ads', href: 'ads' },
			{ id: 'l4', label: 'Email', href: 'email' },
		],
		promo: { eyebrow: 'Start here', title: 'Free audit', body: 'We look at your site.', ctaLabel: 'Book it', href: 'contact' },
	},
	{ id: 'c', label: 'More', style: 'dropdown', links: [{ id: 'm1', label: 'About', href: 'about' }] },
	{ id: 'd', label: 'Bad', style: 'nonsense', links: 'oops', promo: 5 },
]
const parsed = schema.chromeSchema.parse({ menu })

check('a menu round-trips and junk is repaired, never rejected', () => {
	assert.equal(parsed.menu.length, 4)
	assert.equal(parsed.menu[3].style, 'mega')
	assert.deepEqual(parsed.menu[3].links, [])
	assert.equal(parsed.menu[3].promo, null)
	assert.equal(parsed.menu[1].links[0].icon, 'Globe')
	assert.ok(schema.chromeSchema.safeParse({ menu: Array.from({ length: 11 }, (_, i) => ({ id: String(i), label: 'x' })) }).success, 'over-long list falls back instead of failing the site')
	assert.deepEqual(schema.chromeSchema.parse({ menu: Array.from({ length: 11 }, (_, i) => ({ id: String(i), label: 'x' })) }).menu, [])
})

check('footerDetails: a boolean, junk reads as off', () => {
	assert.equal(schema.chromeSchema.parse({ footerDetails: true }).footerDetails, true)
	for (const junk of ['yes', 1, null, {}]) assert.equal(schema.chromeSchema.parse({ footerDetails: junk }).footerDetails, false, String(junk))
	assert.equal(schema.defaultChrome.footerDetails, false)
})

// 3) Old saved sites, exactly as today's builder stores them (the PATCH route stores the
// parsed value), come back unchanged: the only addition is the new chrome default.
const block = (id, type, extra = {}) => ({ id, type, variant: 'default', props: { heading: `Heading ${id}` }, ...extra })
const fixtures = [
	{
		version: 1,
		chrome: { header: 'stacked', footer: 'split', ctaLabel: 'Free Inspection', ctaHref: 'contact', menu: parsed.menu },
		pages: [
			{ id: 'pg_home', name: 'Home', slug: '/', inHeader: true, blocks: [block('b1', 'page-hero'), block('b2', 'feature-grid', { children: [block('c1', 'feature-card'), block('c2', 'feature-card')] })], createdAt: '2026-01-02T03:04:05.000Z', updatedAt: '2026-02-03T04:05:06.000Z' },
			{ id: 'pg_contact', name: 'Contact', slug: 'contact', inHeader: false, blocks: [], createdAt: '2026-01-02T03:04:05.000Z', updatedAt: '2026-01-02T03:04:05.000Z' },
		],
	},
	{
		version: 1,
		chrome: { header: 'bar', footer: 'columns', ctaLabel: '', ctaHref: '', menu: [] },
		pages: [{ id: 'pg_1', name: 'Landing', slug: '/', inHeader: true, blocks: [{ id: 'x1', type: 'cta-band' }], createdAt: '', updatedAt: '' }],
	},
	{ version: 1, chrome: { header: 'none', footer: 'none', ctaLabel: 'Call', ctaHref: 'tel:+15125550142', menu: [] }, pages: [] },
]

check('old site fixtures round-trip through siteSchema unchanged', () => {
	for (const [index, fixture] of fixtures.entries()) {
		const copy = JSON.parse(JSON.stringify(fixture))
		const once = schema.siteSchema.parse(copy)
		assert.deepEqual(once, { ...fixture, chrome: { ...fixture.chrome, footerDetails: false } }, `fixture ${index}`)
		for (const page of once.pages) assert.ok(!Object.hasOwn(page, 'seo'), `fixture ${index}: no seo key appears on ${page.id}`)
		assert.deepEqual(schema.siteSchema.parse(JSON.parse(JSON.stringify(once))), once, `fixture ${index} is stable`)
	}
})

check('page seo is kept, and a bad value never fails the site', () => {
	const page = (seo) => ({ id: 'p', name: 'Services', slug: 'services', inHeader: true, blocks: [], createdAt: '', updatedAt: '', seo })
	const site = (seo) => schema.siteSchema.parse({ version: 1, pages: [page(seo)] }).pages[0].seo
	assert.deepEqual(site({ title: 'Roof Repair in Austin | Summit', description: 'Leaks fixed fast.' }), { title: 'Roof Repair in Austin | Summit', description: 'Leaks fixed fast.' })
	for (const junk of [null, 'junk', 5, []]) assert.equal(site(junk), undefined, JSON.stringify(junk))
	assert.deepEqual(site({ title: 'x'.repeat(71), description: 'y'.repeat(161) }), { title: '', description: '' }, 'over-long values are blanked, never fatal')
	assert.deepEqual(site({ title: 'Only a title' }), { title: 'Only a title', description: '' })
})

check('uniqueSlug: never a slash, never /-2', () => {
	const fresh = schema.uniqueSlug('/', ['/'])
	assert.ok(!fresh.includes('/'), `got ${fresh}`)
	assert.equal(fresh, 'home')
	assert.equal(schema.uniqueSlug('/', ['/', 'home']), 'home-2')
	assert.equal(schema.uniqueSlug('/', []), '/', 'home stays home while it is free')
	assert.equal(schema.uniqueSlug('/contact', []), 'contact')
	assert.equal(schema.uniqueSlug('//contact', ['contact']), 'contact-2')
	assert.equal(schema.uniqueSlug('contact', ['contact', 'contact-2']), 'contact-3')
	assert.equal(schema.uniqueSlug('', []), 'page')
	for (const [slug, taken] of [['/', ['/']], ['/', ['/', 'home', 'home-2']], ['///', ['/']], ['/x', ['x']]])
		assert.ok(!schema.uniqueSlug(slug, taken).includes('/'), `${slug} in ${taken}`)
})

// 4) resolveHref stays exported, unchanged, for existing callers.
check('resolveHref', () => {
	assert.equal(schema.resolveHref('/preview/1', 'web'), '/preview/1/web')
	assert.equal(schema.resolveHref('/preview/1', '/'), '/preview/1')
	assert.equal(schema.resolveHref('', '/'), '/')
	assert.equal(schema.resolveHref('/p', ''), '#')
	assert.equal(schema.resolveHref('/p', 'https://x.com'), 'https://x.com')
	assert.equal(schema.resolveHref('/p', 'mailto:a@b.c'), 'mailto:a@b.c')
	assert.equal(schema.resolveHref('/p', '#top'), '#top')
})

// 5) Rendering. Custom menu -> menu items, not the pages.
const pages = [{ id: 'p1', name: 'Page One', slug: 'one' }]

check('a custom menu replaces the pages; home resolves to the base; the current page is marked', () => {
	const html = header({ pages, chrome: { ...parsed, header: 'bar' }, current: '/', linkBase: '/s' })
	for (const text of ['Home', 'Services', 'More', 'Bad']) assert.ok(html.includes(text), `renders ${text}`)
	assert.ok(!html.includes('Page One'), 'custom menu replaces the pages list')
	assert.ok(html.includes('href="/s"'), 'Home resolves to the base path')
	assert.ok(html.includes('aria-current="page"'), 'the current page is marked')
	assert.ok(html.includes('Open menu'), 'there is a mobile menu trigger')
})

// 6) No menu -> the pages, as plain links, and a mobile menu all the same (fix 9).
check('without a custom menu the pages show, and a mobile menu trigger exists', () => {
	const legacy = header({ pages, chrome: { ...old.chrome }, current: 'one', linkBase: '/s' })
	assert.ok(legacy.includes('Page One'))
	assert.ok(legacy.includes('href="/s/one"'))
	assert.ok(legacy.includes('aria-current="page"'), 'the current page is marked')
	assert.ok(legacy.includes('data-slot="navigation-menu"'), 'the pages ride the same desktop menu')
	assert.ok(legacy.includes('Open menu'), 'phones get the sheet even without a custom menu')
	const trigger = legacy.match(/<button\b[^>]*aria-label="Open menu"[^>]*>/)?.[0] ?? ''
	assert.ok(/\blg:hidden\b/.test(trigger), `the trigger is for small screens only (${trigger})`)
})

check('an active link matches its page in either stored form', () => {
	const html = header({ pages, chrome: { ...old.chrome, menu: [{ id: 'm', label: 'Contact', href: '/contact' }] }, current: 'contact', linkBase: '/s' })
	assert.ok(html.includes('aria-current="page"'), 'root-relative /contact lights up the contact page')
	assert.ok(html.includes('href="/s/contact"'), 'and stays under the link base')
})

check('the empty-header hint shows only in the builder canvas', () => {
	const canvas = header({ pages: [], chrome: { ...old.chrome } })
	assert.ok(canvas.includes('No pages are set to show in the header'), 'the canvas passes no link base')
	for (const linkBase of ['', '/preview/abc', '/p/tok']) {
		const live = header({ pages: [], chrome: { ...old.chrome }, linkBase })
		assert.ok(!live.includes('No pages are set'), `never on a built site (${JSON.stringify(linkBase)})`)
		assert.ok(!live.includes('Open menu'), 'and no empty sheet')
	}
	assert.ok(!header({ pages: [], chrome: { ...old.chrome }, editing: false }).includes('No pages are set'), 'the canvas can turn it off')
})

check('with link base "" no chrome link is empty', () => {
	const home = [{ id: 'h', name: 'Home', slug: '/' }, ...pages]
	for (const variant of ['bar', 'floating', 'stacked']) {
		for (const chrome of [{ ...old.chrome, header: variant, ctaLabel: 'Go', ctaHref: '' }, { ...parsed, header: variant, ctaLabel: 'Go', ctaHref: '/' }]) {
			const html = header({ pages: home, chrome, current: '/', linkBase: '', brand: { name: 'Acme' } })
			assert.ok(!html.includes('href=""'), `${variant} header`)
			assert.ok(html.includes('href="/"'), `${variant}: home is "/"`)
		}
	}
	for (const variant of ['columns', 'centered', 'split']) {
		const html = footer({ pages: home, chrome: { ...old.chrome, footer: variant, ctaLabel: 'Go', ctaHref: '' }, linkBase: '', brand: { name: 'Acme' } })
		assert.ok(!html.includes('href=""'), `${variant} footer`)
		assert.ok(html.includes('href="/"'), `${variant} footer: home is "/"`)
	}
})

check('the header button: tel:, mailto: and pages resolve; phones see it in the sheet instead', () => {
	for (const [ctaHref, expected] of [['tel:+15125550142', 'tel:+15125550142'], ['mailto:hi@acme.example', 'mailto:hi@acme.example'], ['contact', '/s/contact'], ['', '/s'], ['javascript:alert(1)', '#']]) {
		const html = header({ pages, chrome: { ...old.chrome, ctaLabel: 'Go now', ctaHref }, linkBase: '/s' })
		assert.ok(html.includes(`href="${expected}"`), `${ctaHref} -> ${expected}`)
	}
	const html = header({ pages, chrome: { ...old.chrome, ctaLabel: 'Go now', ctaHref: 'contact' }, linkBase: '/s' })
	assert.match(html, /class="[^"]*hidden[^"]*sm:inline-flex[^"]*"[^>]*href="\/s\/contact"|href="\/s\/contact"[^>]*class="[^"]*hidden[^"]*sm:inline-flex/, 'the bar button hides on phones')
})

check('the footer button keeps tel: and mailto:, and its icon follows the target', () => {
	const cases = [
		['tel:+15125550142', 'href="tel:+15125550142"', 'lucide-phone'],
		['mailto:hello@acme.example', 'href="mailto:hello@acme.example"', 'lucide-mail'],
		['https://book.example/acme', 'href="https://book.example/acme"', 'lucide-arrow-right'],
		['contact', 'href="/s/contact"', 'lucide-arrow-right'],
	]
	for (const [ctaHref, href, icon] of cases) {
		const html = footer({ pages, chrome: { ...old.chrome, ctaLabel: 'Get in touch', ctaHref }, linkBase: '/s', brand: { name: 'Acme' } })
		assert.ok(html.includes(href), `${ctaHref}: ${href}`)
		assert.ok(html.includes(icon), `${ctaHref}: ${icon}`)
		assert.ok(!html.includes('/s/tel:') && !html.includes('/s/mailto:') && !html.includes('/s/https:'), `${ctaHref}: never prefixed`)
	}
})

const contact = {
	phone: '(512) 555-0142',
	email: 'hello@acme.example',
	address: '1 Main St, Austin, TX 78701',
	hours: ['Monday to Friday 7:00 to 18:00', 'Saturday 9:00 to 12:00'],
	areas: ['Austin', 'Round Rock'],
}
const brand = { name: 'Acme Roofing', contact }
const sixPages = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Page ${i}`, slug: `page-${i}` }))

check('the footer Contact column renders from footerDetails', () => {
	for (const variant of ['columns', 'centered', 'split']) {
		const html = footer({ pages: sixPages, chrome: { ...old.chrome, footer: variant, footerDetails: true }, linkBase: '', brand })
		assert.ok(html.includes('data-footer-contact'), `${variant}: the column is there`)
		for (const text of ['>Contact<', 'href="tel:+15125550142"', '(512) 555-0142', 'href="mailto:hello@acme.example"', '1 Main St, Austin, TX 78701', 'Monday to Friday 7:00 to 18:00', 'Saturday 9:00 to 12:00', 'Serving Austin and Round Rock'])
			assert.ok(html.includes(text), `${variant}: ${text}`)
		assert.equal(count(html, '<ul class="mt-4 space-y-3">'), 2, `${variant}: the pages take two columns beside it`)
	}
	const off = footer({ pages: sixPages, chrome: { ...old.chrome, footerDetails: false }, linkBase: '', brand })
	assert.ok(!off.includes('data-footer-contact'), 'off by default')
	assert.equal(count(off, '<ul class="mt-4 space-y-3">'), 3, 'three page columns without it')
	const empty = footer({ pages: sixPages, chrome: { ...old.chrome, footerDetails: true }, linkBase: '', brand: { name: 'Acme', contact: { phone: '', email: '', address: '', hours: [], areas: [] } } })
	assert.ok(!empty.includes('data-footer-contact'), 'nothing to show, no column')
	assert.ok(!footer({ pages, chrome: { ...old.chrome, footerDetails: true }, linkBase: '' }).includes('data-footer-contact'), 'no brand (thumbnails), no column')
	const partial = footer({ pages, chrome: { ...old.chrome, footerDetails: true }, linkBase: '', brand: { name: 'Acme', contact: { ...contact, phone: 'ask for Sam', email: '', hours: [] } } })
	assert.ok(partial.includes('ask for Sam') && !partial.includes('href="tel:'), 'a phone that is not a number is shown, not linked')
})

check('the header surface layer exists (inside the pill on floating)', () => {
	for (const variant of ['bar', 'stacked', 'floating']) {
		const html = header({ pages, chrome: { ...parsed, header: variant }, linkBase: '/s' })
		assert.equal(count(html, 'data-surface-layer'), 1, `${variant}: exactly one layer`)
		const layer = html.indexOf('data-surface-layer')
		const tag = html.slice(html.lastIndexOf('<', layer), html.indexOf('>', layer) + 1)
		for (const part of ['aria-hidden="true"', 'pointer-events-none', 'absolute', 'inset-0', '-z-10', 'overflow-hidden', 'rounded-[inherit]'])
			assert.ok(tag.includes(part), `${variant}: layer has ${part} (${tag})`)
		const open = [...html.slice(0, layer).matchAll(/<(header|nav|div)\b[^>]*>/g)]
		const parent = open[open.length - 1][0]
		if (variant === 'floating') {
			assert.ok(parent.startsWith('<nav') && parent.includes('rounded-full'), `floating: the layer sits in the pill (${parent})`)
			assert.ok(/\brelative\b/.test(parent) && /\bisolate\b/.test(parent), 'floating: the pill clips and isolates it')
			assert.ok(!/<header[^>]*\bisolate\b/.test(html), 'floating: the strip around the pill paints nothing')
		} else {
			assert.ok(parent.startsWith('<header') && parent.includes('data-surface="header"'), `${variant}: the layer is the header's first child`)
			assert.ok(/\bisolate\b/.test(parent), `${variant}: the header isolates it`)
		}
	}
})

check('the floating header shadow uses the shadow ink token', () => {
	const html = header({ pages, chrome: { ...parsed, header: 'floating' }, linkBase: '/s' })
	assert.ok(html.includes('var(--shadow-ink,#000)'), 'shadow mixes --shadow-ink (black where it is not set)')
	assert.ok(!html.includes('rgb(0_0_0/0.6)'), 'no hard-coded black')
})

// 7) The panel content (mega) renders only when opened, so render it directly.
check('the menu module exports its parts', () => {
	for (const name of ['BuiltMenu', 'DesktopMenu', 'MobileMenu', 'MobileMenuPanel', 'MegaPanel'])
		assert.equal(typeof builtMenu[name], 'function', name)
})

// 8) The mega panel's content.
const { NavigationMenu } = loadTs('src/components/ui/navigation-menu.tsx')
const { MegaPanel, MobileMenuPanel } = builtMenu
const panel = (item) => render(h(NavigationMenu, { viewport: false }, h(MegaPanel, { item, linkBase: '/s' })))
const services = parsed.menu[1]

check('the mega panel: links, descriptions, promo, columns, icons', () => {
	const out = panel(services)
	for (const t of ['Web design', 'Sites that sell', 'Free audit', 'Start here', 'Book it', 'We look at your site.']) assert.ok(out.includes(t), `mega has ${t}`)
	assert.ok(out.includes('href="/s/web"'), 'page link resolved under the base')
	assert.ok(out.includes('href="https://example.com/seo"'), 'external link untouched')
	assert.ok(out.includes('href="/s/contact"'), 'promo link resolved')
	assert.ok(/md:grid-cols-\[1fr_1fr_17rem\]/.test(out), 'two columns + promo uses the library grid')
	assert.equal((out.match(/<ul/g) || []).length, 2, 'four links split into two columns')
	assert.ok(out.includes('<svg'), 'the icon renders')

	const noPromo = panel({ ...services, promo: null, links: services.links.slice(0, 2) })
	assert.ok(/md:grid-cols-1/.test(noPromo), 'a short list with no promo is one column')
	assert.ok(!noPromo.includes('data-menu-feature'), 'no featured card when none is set')
	const emptyPromo = panel({ ...services, promo: { eyebrow: '', title: '', body: '', ctaLabel: '', href: '' } })
	assert.ok(!emptyPromo.includes('data-menu-feature'), 'a blank featured card is not drawn')
	const unsafe = panel({ ...services, links: [{ id: 'x', label: 'Bad', href: 'javascript:alert(1)', description: '' }] })
	assert.ok(!unsafe.includes('javascript:') && unsafe.includes('href="#"'), 'an unsafe link goes nowhere')
})

// 9) A mega panel is as wide as the content container, never the whole header: the
// element it is positioned against (the nearest `relative` ancestor of the menu)
// must be the width-limited container, in every header layout.
check('mega panels are as wide as the content container in every layout', () => {
	for (const variant of ['bar', 'floating', 'stacked']) {
		const markup = header({ pages, chrome: { ...parsed, header: variant }, current: '/', linkBase: '/s' })
		const slot = markup.indexOf('data-slot="navigation-menu"')
		assert.ok(slot > 0, `${variant}: has the menu`)
		const before = markup.slice(0, slot)
		// Walk back through the opening tags that enclose the menu, innermost first.
		const tags = [...before.matchAll(/<(header|nav|div)\b[^>]*class="([^"]*)"[^>]*>/g)].reverse()
		const anchor = tags.find((t) => /(^|\s)relative(\s|$)/.test(t[2]))
		assert.ok(anchor, `${variant}: something around the menu is positioned`)
		// Bar and stacked position against the container itself. The floating pill insets its
		// content, so it positions against the row inside the pill, whose parent is the container.
		const limited = (t) => t[2].includes('max-w-[var(--content-max')
		const parent = tags[tags.indexOf(anchor) + 1]
		assert.ok(
			limited(anchor) || (variant === 'floating' && parent && limited(parent)),
			`${variant}: the positioned box is the width-limited container (got: ${anchor[2].slice(0, 80)})`,
		)
		assert.ok(!/sticky|fixed/.test(anchor[2]), `${variant}: it is not the full-width header`)
	}
})

// 10) The mega menu's colors, set in the header drawer, reach the menu panel on a
// built site. The site's CSS is the page surface, then the header layered on top
// (globals off), exactly as rendered-site.tsx composes it. The header's menu rule must
// be present and come last, so it wins over the page's defaults.
check('the header drawer’s menu colors and glow win on a built site', () => {
	const { backgroundCss } = loadTs('src/app/section-preview/theme.ts')
	const { defaultBackground, globalBackground } = loadTs('src/app/builder/background-settings.ts')
	const panelColors = (css) =>
		[...css.matchAll(/\[data-slot='navigation-menu-viewport'\], \[data-slot='dropdown-menu-content'\]\{[^}]*background-color:([^;]+);/g)].map((m) => m[1])
	const custom = { ...defaultBackground.menu, fill: 'solid', color: { token: 'accent', lightness: 25 } }
	const expected = panelColors(backgroundCss({ ...defaultBackground, menu: custom }))[0]
	assert.ok(expected, 'reference menu color')
	assert.notEqual(expected, panelColors(backgroundCss(defaultBackground))[0], 'the custom color differs from the default')

	for (const [name, chromeLook] of [
		['global header fill (the builder default)', { ...globalBackground, menu: custom }],
		['solid header fill', { ...defaultBackground, page: { ...defaultBackground.page, fill: 'solid' }, menu: custom }],
	]) {
		const css = backgroundCss(defaultBackground) + backgroundCss(chromeLook, 'header', false)
		const colors = panelColors(css)
		assert.equal(colors.at(-1), expected, `${name}: the header's menu color is the one that applies (got ${colors.join(' | ')})`)
	}

	// The panel glow setting travels the same way.
	const noGlow = { ...globalBackground, menu: custom, panelGlow: { mode: 'none', lightness: 0, size: 'md' } }
	const glowCss = backgroundCss(defaultBackground) + backgroundCss(noGlow, 'header', false)
	const borders = [...glowCss.matchAll(/\[data-slot='dropdown-menu-content'\]\{border-color:([^;]+);box-shadow:([^;}]+)/g)].map((m) => m[2])
	assert.equal(borders.at(-1), 'none', 'turning the panel glow off in the header applies')

	// Footers never carry a menu, so they still write no menu rules.
	assert.equal(panelColors(backgroundCss(globalBackground, 'footer', false)).length, 0, 'the footer writes no menu rules')
})

// 11) The mobile sheet. Its content mounts only when open (a portal), so its body is
// rendered directly, and then, with the sheet drawn in place, through the real header.
const sheetCta = { label: 'Free Inspection', href: '/s/contact' }
const sheetPhone = { label: '(512) 555-0142', href: 'tel:+15125550142' }

check('the mobile sheet lists the menu, then the phone, then the header button', () => {
	const items = [{ id: 'm1', label: 'About', href: 'about', links: [], style: 'mega', promo: null }, services]
	const html = render(h(MobileMenuPanel, { items, current: 'about', linkBase: '/s', cta: sheetCta, phone: sheetPhone }))
	for (const text of ['About', 'Services', 'href="/s/about"', 'aria-current="page"', 'Free Inspection', 'href="/s/contact"', '(512) 555-0142', 'href="tel:+15125550142"'])
		assert.ok(html.includes(text), text)
	assert.ok(html.indexOf('tel:+15125550142') < html.indexOf('Free Inspection'), 'the button comes last')
	const bare = render(h(MobileMenuPanel, { items, linkBase: '/s' }))
	assert.ok(!bare.includes('tel:') && !bare.includes('Free Inspection'), 'nothing extra when there is no button or phone')
})

clearCache()
mock('@/components/ui/sheet', {
	Sheet: ({ children }) => h(React.Fragment, null, children),
	SheetTrigger: ({ children }) => children,
	SheetContent: ({ children }) => h('div', { 'data-sheet': '' }, children),
	SheetHeader: ({ children }) => h('div', null, children),
	SheetTitle: ({ children }) => h('p', null, children),
})
const opened = loadTs('src/components/built-chrome.tsx')
const sheetOf = (props) => {
	const html = render(h(opened.BuiltHeader, props))
	const at = html.indexOf('data-sheet')
	assert.ok(at > 0, 'the header draws its sheet')
	return html.slice(at)
}

check('the mobile sheet carries the header button and the phone, on a site without a custom menu', () => {
	for (const variant of ['bar', 'floating', 'stacked']) {
		const sheet = sheetOf({ pages, chrome: { ...old.chrome, header: variant, ctaLabel: 'Book a tune-up', ctaHref: 'contact' }, linkBase: '/s', brand })
		for (const text of ['Page One', 'href="/s/one"', 'Book a tune-up', 'href="/s/contact"', 'href="tel:+15125550142"', '(512) 555-0142'])
			assert.ok(sheet.includes(text), `${variant}: ${text}`)
	}
})

check('the sheet never calls the same number twice', () => {
	const viaMenu = sheetOf({ pages, chrome: { ...old.chrome, menu: [{ id: 't', label: '(512) 555-0142', href: 'tel:+15125550142', links: [], style: 'mega', promo: null }] }, linkBase: '/s', brand })
	assert.equal(count(viaMenu, 'tel:'), 1, 'the menu already has the phone')
	const viaButton = sheetOf({ pages, chrome: { ...old.chrome, ctaLabel: 'Call now', ctaHref: 'tel:5125550142' }, linkBase: '/s', brand })
	assert.equal(count(viaButton, 'tel:'), 1, 'the button already calls it (written without +1)')
	const one = sheetOf({ pages: [], chrome: { ...old.chrome, ctaLabel: 'Book a tune-up', ctaHref: 'tel:+15125550142' }, linkBase: '', brand })
	assert.ok(one.includes('Book a tune-up'), 'a one-page site with no menu still gets the button on phones')
})

console.log(`\n${passed} checks passed${failed ? `, ${failed} failed` : ''}`)
if (failed) process.exit(1)
