/**
 * Proves the builder's header menu: the schema (old sites still load, junk is repaired),
 * link resolution, and what the header and the mega panel render.
 *
 *   node scripts/prove-builder-menu.cjs
 */
const assert = require('node:assert/strict')
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const React = rootRequire('react')
const { renderToStaticMarkup } = rootRequire('react-dom/server')

const schema = loadTs('src/lib/builder/page-schema.ts')
const { BuiltHeader } = loadTs('src/components/built-chrome.tsx')

// 1) An old site (no menu key) still loads, with an empty menu = "use pages".
const old = schema.siteSchema.parse({ version: 1, chrome: { header: 'bar', footer: 'columns', ctaLabel: '', ctaHref: '' }, pages: [] })
assert.deepEqual(old.chrome.menu, [])
const bare = schema.siteSchema.parse({ version: 1, pages: [] })
assert.deepEqual(bare.chrome.menu, [])

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
assert.equal(parsed.menu.length, 4)
assert.equal(parsed.menu[3].style, 'mega')
assert.deepEqual(parsed.menu[3].links, [])
assert.equal(parsed.menu[3].promo, null)
assert.equal(parsed.menu[1].links[0].icon, 'Globe')
assert.ok(schema.chromeSchema.safeParse({ menu: Array.from({ length: 11 }, (_, i) => ({ id: String(i), label: 'x' })) }).success, 'over-long list falls back instead of failing the site')
assert.deepEqual(schema.chromeSchema.parse({ menu: Array.from({ length: 11 }, (_, i) => ({ id: String(i), label: 'x' })) }).menu, [])

// 3) resolveHref
assert.equal(schema.resolveHref('/preview/1', 'web'), '/preview/1/web')
assert.equal(schema.resolveHref('/preview/1', '/'), '/preview/1')
assert.equal(schema.resolveHref('', '/'), '/')
assert.equal(schema.resolveHref('/p', ''), '#')
assert.equal(schema.resolveHref('/p', 'https://x.com'), 'https://x.com')
assert.equal(schema.resolveHref('/p', 'mailto:a@b.c'), 'mailto:a@b.c')
assert.equal(schema.resolveHref('/p', '#top'), '#top')

// 4) Rendering. Custom menu -> menu items, not the pages.
const pages = [{ id: 'p1', name: 'Page One', slug: 'one' }]
const html = renderToStaticMarkup(
	React.createElement(BuiltHeader, { pages, chrome: { ...parsed, header: 'bar' }, current: '/', linkBase: '/s' }),
)
for (const text of ['Home', 'Services', 'More', 'Bad']) assert.ok(html.includes(text), `renders ${text}`)
assert.ok(!html.includes('Page One'), 'custom menu replaces the pages list')
assert.ok(html.includes('href="/s"'), 'Home resolves to the base path')
assert.ok(html.includes('aria-current="page"'), 'the current page is marked')
assert.ok(html.includes('Open menu'), 'there is a mobile menu trigger')

// 5) No menu -> exactly the old behaviour.
const legacy = renderToStaticMarkup(
	React.createElement(BuiltHeader, { pages, chrome: { ...old.chrome }, current: 'one', linkBase: '/s' }),
)
assert.ok(legacy.includes('Page One'))
assert.ok(!legacy.includes('Open menu'))

// 6) The panel content (mega) renders only when opened, so render it directly.
const builtMenu = loadTs('src/components/built-menu.tsx')
assert.equal(typeof builtMenu.BuiltMenu, 'function')
console.log('menu checks passed')

// 7) The mega panel's content.
const { NavigationMenu } = loadTs('src/components/ui/navigation-menu.tsx')
const { MegaPanel } = builtMenu
const panel = (item) =>
	renderToStaticMarkup(
		React.createElement(NavigationMenu, { viewport: false }, React.createElement(MegaPanel, { item, linkBase: '/s' })),
	)
const services = parsed.menu[1]
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
console.log('mega panel checks passed')

// 8) A mega panel is as wide as the content container, never the whole header: the
// element it is positioned against (the nearest `relative` ancestor of the menu)
// must be the width-limited container, in every header layout.
for (const header of ['bar', 'floating', 'stacked']) {
	const markup = renderToStaticMarkup(
		React.createElement(BuiltHeader, { pages, chrome: { ...parsed, header }, current: '/', linkBase: '/s' }),
	)
	const slot = markup.indexOf('data-slot="navigation-menu"')
	assert.ok(slot > 0, `${header}: has the menu`)
	const before = markup.slice(0, slot)
	// Walk back through the opening tags that enclose the menu, innermost first.
	const tags = [...before.matchAll(/<(header|nav|div)\b[^>]*class="([^"]*)"[^>]*>/g)].reverse()
	const anchor = tags.find((t) => /(^|\s)relative(\s|$)/.test(t[2]))
	assert.ok(anchor, `${header}: something around the menu is positioned`)
	// Bar and stacked position against the container itself. The floating pill insets its
	// content, so it positions against the row inside the pill, whose parent is the container.
	const limited = (t) => t[2].includes('max-w-[var(--content-max')
	const parent = tags[tags.indexOf(anchor) + 1]
	assert.ok(
		limited(anchor) || (header === 'floating' && parent && limited(parent)),
		`${header}: the positioned box is the width-limited container (got: ${anchor[2].slice(0, 80)})`,
	)
	assert.ok(!/sticky|fixed/.test(anchor[2]), `${header}: it is not the full-width header`)
}
console.log('panel width checks passed')

// 9) The mega menu's colors, set in the header drawer, reach the menu panel on a
// built site. The site's CSS is the page surface, then the header layered on top
// (globals off), exactly as rendered-site.tsx composes it. The header's menu rule must
// be present and come last, so it wins over the page's defaults.
{
	const { backgroundCss } = loadTs('src/app/section-preview/theme.ts')
	const { defaultBackground, globalBackground } = loadTs('src/app/builder/background-settings.ts')
	const panelColors = (css) =>
		[...css.matchAll(/\[data-slot='navigation-menu-viewport'\], \[data-slot='dropdown-menu-content'\]\{[^}]*background-color:([^;]+);/g)].map((m) => m[1])
	const custom = { ...defaultBackground.menu, fill: 'solid', color: { token: 'accent', lightness: 25 } }
	const expected = panelColors(backgroundCss({ ...defaultBackground, menu: custom }))[0]
	assert.ok(expected, 'reference menu color')
	assert.notEqual(expected, panelColors(backgroundCss(defaultBackground))[0], 'the custom color differs from the default')

	for (const [name, header] of [
		['global header fill (the builder default)', { ...globalBackground, menu: custom }],
		['solid header fill', { ...defaultBackground, page: { ...defaultBackground.page, fill: 'solid' }, menu: custom }],
	]) {
		const css = backgroundCss(defaultBackground) + backgroundCss(header, 'header', false)
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
	console.log('menu color checks passed')
}
