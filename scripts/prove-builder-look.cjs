/**
 * Proves the strict look model and the link rules:
 *
 *   node scripts/prove-builder-look.cjs
 *
 *  - sanitizeLook never throws on 1000 random values, nulls, `__proto__`/`constructor`
 *    keys or wrong types, is idempotent, returns defaultLook() for {}, keeps every valid
 *    partial look exactly as the old merge did, and drops bad block keys (at most 400 kept);
 *  - `scheme` survives only on blocks and the footer;
 *  - cssText leaves no `<`; builtSiteVars per header variant;
 *  - tintVar(null) and tintVar({}) paint the accent; the theme URL codec round-trips `rd`;
 *  - links.ts: the sectionHref table under three link bases, chromeHref never '',
 *    rewriteSlugRefs rewrites bare and root-relative forms only.
 */
const assert = require('node:assert/strict')
const { loadTs } = require('./lib/load-ts.cjs')

const look = loadTs('src/lib/builder/look.ts')
const links = loadTs('src/lib/builder/links.ts')
const themeSettings = loadTs('src/app/builder/theme-settings.ts')
const backgrounds = loadTs('src/app/builder/background-settings.ts')
const { isGoogleFont } = loadTs('src/app/builder/google-fonts.ts')
const { HEADER_VARIANTS } = loadTs('src/lib/builder/page-schema.ts')

const { sanitizeLook, defaultLook, mergeLook, BLOCK_KEY, cssText, builtSiteVars } = look
const { defaultSettings, tintVar, isTint, readSettings, writeSettings, SHAPES } = themeSettings
const { defaultBackground, globalBackground, patterns, glowModes, glowSizes, SURFACE_SCHEMES } = backgrounds

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

// ---- a seeded generator of junk ------------------------------------------------

function mulberry32(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
const random = mulberry32(20261025)
const pickOne = (list) => list[Math.floor(random() * list.length)]

const KEYS = [
	'theme', 'page', 'header', 'footer', 'blocks', 'menu', 'panelGlow', 'featureGlow', 'megaMenu', 'scheme',
	'background', 'accent', 'heading', 'body', 'headingFont', 'bodyFont', 'maxWidth', 'buttonFill', 'buttonFrom',
	'buttonTo', 'buttonAngle', 'radius', 'pattern', 'patternAngle', 'patternColor', 'fill', 'gradientAngle',
	'color', 'from', 'to', 'mode', 'lightness', 'size', 'token', '__proto__', 'constructor', 'toString',
	'prototype', 'blk_a1b2c3', "x'] {}</style><script>alert(1)</script>", 'blk-ok_9', '',
]
const STRINGS = [
	'', ' ', '#03080f', '#ABCDEF', '#abc', 'ff0000', 'red', 'Space Grotesk', 'Comic Sans', 'Inter', 'inherit',
	'grid', 'dots', 'rings', 'nonsense', 'global', 'solid', 'gradient', 'transparent', 'accent', 'heading',
	'background', 'body', 'constructor', '__proto__', 'sharp', 'soft', 'round', 'inverse', 'brand', 'base',
	'6xl', 'full', 'sm', '2xl', 'md', 'none', '</style><script>', "'] {} *{color:red}",
]
const NUMBERS = [0, -0, 1, -1, 7, 40, -100, 100, 101, -250, 359, 360, 720, -45, 12.6, Number.NaN, Infinity, -Infinity, 1e21]

function junk(depth = 0) {
	const roll = random()
	if (depth > 4 || roll < 0.08) return pickOne([null, undefined, true, false])
	if (roll < 0.22) return pickOne(NUMBERS)
	if (roll < 0.38) return pickOne(STRINGS)
	if (roll < 0.48) return Array.from({ length: Math.floor(random() * 4) }, () => junk(depth + 1))
	const out = {}
	const n = Math.floor(random() * 7)
	for (let i = 0; i < n; i++) {
		// defineProperty, so '__proto__' becomes an own key like JSON.parse makes it.
		Object.defineProperty(out, pickOne(KEYS), { value: junk(depth + 1), enumerable: true, writable: true, configurable: true })
	}
	return out
}

// Realistic saves: complete looks with a few fields broken.
function brokenLook() {
	const base = JSON.parse(JSON.stringify(defaultLook()))
	base.blocks = { blk_1: JSON.parse(JSON.stringify(defaultBackground)), blk_2: { page: { fill: 'solid' } } }
	const paths = [
		['theme', 'buttonFrom'], ['theme', 'accent'], ['theme', 'headingFont'], ['page', 'page', 'color'],
		['page', 'page', 'pattern'], ['header', 'panelGlow'], ['footer', 'page', 'from'], ['blocks', 'blk_1', 'page', 'to'],
		['blocks', 'blk_2'], ['theme'], ['blocks'], ['footer', 'megaMenu'], ['theme', 'radius'], ['footer', 'scheme'],
	]
	for (let i = 0; i < 3; i++) {
		const path = pickOne(paths)
		let node = base
		for (const key of path.slice(0, -1)) node = node?.[key]
		if (node && typeof node === 'object') node[path[path.length - 1]] = junk(3)
	}
	return base
}

const corpus = [
	null, undefined, 0, 1, '', 'look', [], [{}], true, {}, Object.create(null),
	JSON.parse('{"__proto__":{"theme":{"accent":"#ff0000"}},"constructor":{"prototype":{"x":1}}}'),
	JSON.parse('{"theme":{"__proto__":{"accent":"#ff0000"}},"blocks":{"__proto__":{"page":{}},"constructor":{"page":{}}}}'),
	{ theme: null, page: null, header: null, footer: null, blocks: null },
	{ theme: { buttonFrom: null, buttonTo: { token: null } }, page: { page: { color: null, patternColor: 'x' } } },
	{ blocks: { blk_1: null, blk_2: 5, blk_3: 'x', blk_4: [], blk_5: { page: null } } },
	...Array.from({ length: 600 }, () => junk()),
	...Array.from({ length: 400 }, () => brokenLook()),
]

// ---- what a valid look is ------------------------------------------------------

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
const isAngle = (v) => Number.isInteger(v) && v >= 0 && v <= 359
const tintOk = (t) =>
	isTint(t) && Number.isInteger(t.lightness) && t.lightness >= -100 && t.lightness <= 100 && Object.keys(t).length === 2
const surfaceOk = (s) =>
	patterns.some((p) => p.id === s.pattern) && isAngle(s.patternAngle) && tintOk(s.patternColor) &&
	['global', 'solid', 'gradient', 'transparent'].includes(s.fill) && isAngle(s.gradientAngle) &&
	tintOk(s.color) && tintOk(s.from) && tintOk(s.to) && Object.keys(s).length === 8
const glowOk = (g) =>
	glowModes.some((m) => m.id === g.mode) && glowSizes.some((m) => m.id === g.size) &&
	Number.isInteger(g.lightness) && g.lightness >= -100 && g.lightness <= 100
function assertValidBackground(b, withScheme, where) {
	assert.ok(surfaceOk(b.page), `${where}.page`)
	assert.ok(surfaceOk(b.menu), `${where}.menu`)
	assert.equal(typeof b.megaMenu, 'boolean', `${where}.megaMenu`)
	assert.ok(glowOk(b.panelGlow) && glowOk(b.featureGlow), `${where} glows`)
	if ('scheme' in b) {
		assert.ok(withScheme, `${where} must not carry a scheme`)
		assert.ok(SURFACE_SCHEMES.includes(b.scheme), `${where}.scheme`)
	}
}
function assertValidLook(l) {
	const t = l.theme
	for (const key of ['background', 'accent', 'heading', 'body']) assert.ok(isHex(t[key]), `theme.${key}`)
	assert.ok(isGoogleFont(t.headingFont) && isGoogleFont(t.bodyFont), 'theme fonts')
	assert.ok(['3xl', '4xl', '5xl', '6xl', '7xl', 'full'].includes(t.maxWidth), 'theme.maxWidth')
	assert.ok(['solid', 'gradient'].includes(t.buttonFill), 'theme.buttonFill')
	assert.ok(tintOk(t.buttonFrom) && tintOk(t.buttonTo), 'theme button tints')
	assert.ok(isAngle(t.buttonAngle), 'theme.buttonAngle')
	assert.ok(SHAPES.includes(t.radius), 'theme.radius')
	assertValidBackground(l.page, false, 'page')
	assertValidBackground(l.header, false, 'header')
	assertValidBackground(l.footer, true, 'footer')
	const keys = Object.keys(l.blocks)
	assert.ok(keys.length <= 400, 'at most 400 blocks')
	assert.equal(Object.getPrototypeOf(l.blocks), Object.prototype, 'blocks is a plain object')
	for (const key of keys) {
		assert.ok(BLOCK_KEY.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key), `block key ${key}`)
		assertValidBackground(l.blocks[key], true, `blocks.${key}`)
	}
}

// Today's merge (builder-context.tsx before this change), for the fallback-parity check.
function oldMergeBackground(value, fallback = defaultBackground) {
	const saved = value ?? {}
	return {
		...fallback,
		...saved,
		page: { ...fallback.page, ...saved.page },
		menu: { ...fallback.menu, ...saved.menu },
		panelGlow: { ...fallback.panelGlow, ...saved.panelGlow },
		featureGlow: { ...fallback.featureGlow, ...saved.featureGlow },
	}
}
function oldMergeLook(value) {
	const saved = value ?? {}
	return {
		theme: { ...defaultSettings, ...saved.theme },
		page: oldMergeBackground(saved.page),
		header: oldMergeBackground(saved.header, globalBackground),
		footer: oldMergeBackground(saved.footer, globalBackground),
		blocks: Object.fromEntries(Object.entries(saved.blocks ?? {}).map(([id, s]) => [id, oldMergeBackground(s)])),
	}
}

// ---- sanitizeLook --------------------------------------------------------------

check('sanitizeLook never throws and always returns a valid look (1016 junk values)', () => {
	for (const [i, value] of corpus.entries()) {
		let out
		try {
			out = sanitizeLook(value)
		} catch (error) {
			throw new Error(`value ${i} threw: ${error.message}`)
		}
		try {
			assertValidLook(out)
		} catch (error) {
			throw new Error(`value ${i}: ${error.message}`)
		}
	}
})

check('sanitizeLook is idempotent', () => {
	for (const [i, value] of corpus.entries()) {
		const once = sanitizeLook(value)
		assert.deepEqual(sanitizeLook(once), once, `value ${i}`)
		assert.deepEqual(sanitizeLook(JSON.parse(JSON.stringify(once))), once, `value ${i} after JSON`)
	}
})

check('sanitizeLook({}) is defaultLook(), which is today\'s defaults exactly', () => {
	assert.deepEqual(sanitizeLook({}), defaultLook())
	assert.deepEqual(sanitizeLook(null), defaultLook())
	const d = defaultLook()
	assert.deepEqual(d.theme, defaultSettings)
	assert.deepEqual(d.page, defaultBackground)
	assert.deepEqual(d.header, globalBackground)
	assert.deepEqual(d.footer, globalBackground)
	assert.deepEqual(d.blocks, {})
	assert.equal(d.theme.radius, 'soft')
	assert.notEqual(d.theme, defaultSettings, 'fresh objects, not the shared constants')
	assert.notEqual(d.theme.buttonFrom, defaultSettings.buttonFrom)
})

check('mergeLook is sanitizeLook under its old name', () => assert.equal(mergeLook, sanitizeLook))

check('a valid saved look, complete or partial, reads exactly as the old merge read it', () => {
	const fixtures = [
		{},
		{ theme: { accent: '#ff7a66', headingFont: 'Inter', maxWidth: '5xl' } },
		{ theme: { ...defaultSettings, buttonFill: 'gradient', buttonTo: { token: 'heading', lightness: -35 }, buttonAngle: 200 } },
		{ page: { page: { fill: 'solid', pattern: 'dots' } }, header: { page: { fill: 'solid', color: { token: 'background', lightness: 4 } } } },
		{ footer: { page: { fill: 'gradient' }, panelGlow: { mode: 'none' } }, blocks: { blk_1: { page: { fill: 'solid' } } } },
		{ blocks: { blk_a: JSON.parse(JSON.stringify(globalBackground)), 'blk-b_2': { page: { fill: 'global', pattern: 'none' } } } },
		{ page: null, header: null, footer: null, blocks: { blk_n: null, blk_e: {} } },
		JSON.parse(JSON.stringify(defaultLook())),
	]
	for (const [i, fixture] of fixtures.entries()) {
		const old = oldMergeLook(fixture)
		old.theme = { ...old.theme, radius: old.theme.radius ?? 'soft' }
		assert.deepEqual(sanitizeLook(fixture), old, `fixture ${i}`)
	}
})

check('null and junk tints fall back to that field\'s default only', () => {
	const out = sanitizeLook({ theme: { buttonFrom: null, buttonTo: { token: 'heading', lightness: 'x' }, accent: '#123456' } })
	assert.deepEqual(out.theme.buttonFrom, defaultSettings.buttonFrom)
	assert.deepEqual(out.theme.buttonTo, { token: 'heading', lightness: defaultSettings.buttonTo.lightness })
	assert.equal(out.theme.accent, '#123456')
	const clamped = sanitizeLook({ page: { page: { color: { token: 'accent', lightness: 140.4 }, gradientAngle: -90, fill: 'nope' } } })
	assert.deepEqual(clamped.page.page.color, { token: 'accent', lightness: 100 })
	assert.equal(clamped.page.page.gradientAngle, 270)
	assert.equal(clamped.page.page.fill, defaultBackground.page.fill)
	assert.equal(sanitizeLook({ theme: { headingFont: 'Not A Font' } }).theme.headingFont, defaultSettings.headingFont)
	assert.equal(sanitizeLook({ theme: { background: 'ff0000' } }).theme.background, defaultSettings.background)
})

check('block keys failing BLOCK_KEY are dropped and at most 400 are kept', () => {
	const bad = ["x'] {}</style><script>alert(1)</script>", '', 'a b', 'a.b', 'a'.repeat(41), '<x>', "o'k", '__proto__', 'constructor', 'prototype']
	const blocks = {}
	for (const key of bad) Object.defineProperty(blocks, key, { value: { page: {} }, enumerable: true })
	blocks.blk_ok = { page: { fill: 'solid' } }
	blocks['blk-ok_2'] = { page: {} }
	blocks.blk_null = null
	blocks.blk_list = [1, 2]
	const out = sanitizeLook({ blocks })
	assert.deepEqual(Object.keys(out.blocks).sort(), ['blk-ok_2', 'blk_list', 'blk_null', 'blk_ok'])
	// An entry that is not an object paints the page default, as the old merge painted it.
	for (const key of ['blk_null', 'blk_list']) {
		assert.deepEqual(out.blocks[key], defaultBackground, key)
		assert.notEqual(out.blocks[key].page, defaultBackground.page, `${key} is a fresh object`)
	}
	const many = Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`blk_${i}`, { page: {} }]))
	const kept = Object.keys(sanitizeLook({ blocks: many }).blocks)
	assert.equal(kept.length, 400)
	assert.deepEqual(kept, Object.keys(many).slice(0, 400))
	for (const key of ['blk_ok', 'a1', 'A-Z_09', 'x'.repeat(40)]) assert.ok(BLOCK_KEY.test(key), key)
})

check('scheme survives only on blocks and the footer', () => {
	const scheme = 'inverse'
	const out = sanitizeLook({
		page: { scheme }, header: { scheme }, footer: { scheme: 'brand' },
		blocks: { blk_1: { scheme }, blk_2: { scheme: 'nope' }, blk_3: {} },
	})
	assert.ok(!('scheme' in out.page))
	assert.ok(!('scheme' in out.header))
	assert.equal(out.footer.scheme, 'brand')
	assert.equal(out.blocks.blk_1.scheme, 'inverse')
	assert.ok(!('scheme' in out.blocks.blk_2))
	assert.ok(!('scheme' in out.blocks.blk_3))
	assert.ok(!('scheme' in sanitizeLook({}).footer), 'no scheme is invented')
})

check('cssText leaves no "<" and changes nothing else', () => {
	const samples = [
		"</style><script>alert(1)</script>", '<<<', "[data-block-id='x'] > *{color:red}", 'a<b<c', '',
		...corpus.slice(0, 200).map((v) => JSON.stringify(v) ?? ''),
	]
	for (const css of samples) {
		const out = cssText(css)
		assert.ok(!out.includes('<'), css)
		assert.equal(out.replace(/\\3c /g, '<'), css)
	}
	assert.equal(cssText(':root{--a:1}'), ':root{--a:1}')
})

check('builtSiteVars per header variant', () => {
	const want = {
		none: ':root{--hero-trim:4rem;--hero-trim-lg:4rem;--header-h:0rem}',
		bar: ':root{--hero-trim:5rem;--hero-trim-lg:5rem;--header-h:4.25rem}',
		floating: ':root{--hero-trim:5rem;--hero-trim-lg:5rem;--header-h:5.5rem}',
		stacked: ':root{--hero-trim:5rem;--hero-trim-lg:5rem;--header-h:6.75rem}',
	}
	assert.deepEqual(Object.keys(want).sort(), [...HEADER_VARIANTS].sort())
	for (const variant of HEADER_VARIANTS) assert.equal(builtSiteVars(variant), want[variant], variant)
	assert.equal(builtSiteVars('constructor'), want.bar)
	assert.equal(builtSiteVars(undefined), want.bar)
})

// ---- tints and the theme codec ---------------------------------------------------

check('tintVar(null), tintVar({}) and every other non-tint paint the accent variable', () => {
	for (const value of [null, undefined, {}, [], 'accent', 5, { token: 'constructor', lightness: 0 }, { token: 'accent' }, { token: 'accent', lightness: Number.NaN }, { lightness: 10 }])
		assert.equal(tintVar(value), 'var(--color-brand)', JSON.stringify(value) ?? String(value))
	assert.equal(tintVar({ token: 'background', lightness: 0 }), 'var(--color-ink)')
	assert.equal(tintVar({ token: 'accent', lightness: 40 }), 'color-mix(in srgb, var(--color-brand), white 40%)')
	assert.equal(tintVar({ token: 'heading', lightness: -25 }), 'color-mix(in srgb, var(--foreground), black 25%)')
	assert.equal(tintVar({ token: 'body', lightness: 300 }), 'color-mix(in srgb, var(--muted-foreground), white 100%)')
	assert.equal(themeSettings.tintHex(defaultSettings, null), defaultSettings.accent)
	assert.ok(isTint({ token: 'body', lightness: -3 }))
	assert.ok(!isTint({ token: 'toString', lightness: 0 }))
})

check('the theme URL codec round-trips radius as rd and omits it for soft', () => {
	assert.equal(writeSettings(new URLSearchParams(), defaultSettings).toString(), '')
	const codes = { sharp: 's', round: 'r' }
	for (const radius of SHAPES) {
		const params = writeSettings(new URLSearchParams(), { ...defaultSettings, radius })
		assert.equal(params.get('rd'), codes[radius] ?? null, radius)
		assert.deepEqual(readSettings(params), { ...defaultSettings, radius })
	}
	assert.equal(readSettings(new URLSearchParams('rd=o')).radius, 'soft')
	assert.equal(readSettings(new URLSearchParams('rd=x')).radius, 'soft')
	assert.equal(readSettings(new URLSearchParams('')).radius, 'soft')
	const full = { ...defaultSettings, accent: '#ff7a66', buttonFill: 'gradient', buttonTo: { token: 'accent', lightness: -20 }, buttonAngle: 135, radius: 'round' }
	assert.deepEqual(readSettings(writeSettings(new URLSearchParams('keep=1'), full)), full)
	assert.equal(writeSettings(new URLSearchParams('rd=s'), defaultSettings).get('rd'), null, 'a stale rd is cleared')
	assert.equal(writeSettings(new URLSearchParams(), { ...defaultSettings, radius: undefined }).get('rd'), null, 'an old look reads as soft')
})

// ---- links -------------------------------------------------------------------------

check('sectionHref follows the table under every link base', () => {
	const bases = ['', '/preview/abc', '/p/tok']
	const rows = [
		['', ['#', '#', '#']],
		['/', ['/', '/preview/abc', '/p/tok']],
		['/contact', ['/contact', '/preview/abc/contact', '/p/tok/contact']],
		['contact', ['/contact', '/preview/abc/contact', '/p/tok/contact']],
		['/x', ['/x', '/preview/abc/x', '/p/tok/x']],
		['https://example.com/x', null],
		['http://example.com', null],
		['mailto:a@b.co', null],
		['tel:+15125550142', null],
		['#faq', null],
		['#a', null],
		['javascript:alert(1)', ['#', '#', '#']],
		['JavaScript:alert(1)', ['#', '#', '#']],
		[' java\tscript:alert(1)', ['#', '#', '#']],
		['//evil.example', ['#', '#', '#']],
		['/\\evil.example', ['#', '#', '#']],
		['\\\\evil.example', ['#', '#', '#']],
		['data:text/html;base64,PHNjcmlwdD4=', ['#', '#', '#']],
		['vbscript:msgbox(1)', ['#', '#', '#']],
		['/contact#form', ['/contact#form', '/preview/abc/contact#form', '/p/tok/contact#form']],
		['/?ref=x', ['/?ref=x', '/preview/abc?ref=x', '/p/tok?ref=x']],
	]
	for (const [href, want] of rows) {
		bases.forEach((base, i) => {
			const expected = want ? want[i] : href
			assert.equal(links.sectionHref(base, href), expected, `${JSON.stringify(href)} under ${JSON.stringify(base)}`)
			assert.equal(links.chromeHref(base, href), expected, `chrome ${JSON.stringify(href)} under ${JSON.stringify(base)}`)
		})
	}
})

check('chromeHref never returns an empty href', () => {
	const hrefs = ['', '/', 'contact', '#', '  ', 'javascript:x', '//x', ...corpus.slice(0, 300).map((v) => (typeof v === 'string' ? v : JSON.stringify(v) ?? ''))]
	for (const base of ['', '/preview/abc', '/p/tok', '/p/tok/']) for (const href of hrefs) assert.notEqual(links.chromeHref(base, href), '', `${base} ${href}`)
	assert.equal(links.chromeHref('/p/tok/', '/'), '/p/tok')
})

check('isSafeHref and slugOfHref', () => {
	for (const href of ['/', '/a', 'a', '#x', 'https://x.co', 'HTTP://x.co', 'mailto:a@b.co', 'tel:+1555']) assert.ok(links.isSafeHref(href), href)
	for (const href of ['', 'javascript:alert(1)', '//x.co', '/\\x.co', 'data:x', 'vbscript:x', 'file:///etc', 'jav\nascript:1']) assert.ok(!links.isSafeHref(href), href)
	assert.equal(links.slugOfHref('/'), '/')
	assert.equal(links.slugOfHref('/contact'), 'contact')
	assert.equal(links.slugOfHref('contact'), 'contact')
	assert.equal(links.slugOfHref('/contact/#form'), 'contact')
	for (const href of ['', '#faq', 'https://x.co/contact', 'tel:+1555', 'mailto:a@b.co', 'javascript:x']) assert.equal(links.slugOfHref(href), null, href)
})

check('rewriteSlugRefs rewrites bare and root-relative forms only', () => {
	const r = links.rewriteSlugRefs
	assert.equal(r('old', 'old', 'new'), 'new')
	assert.equal(r('/old', 'old', 'new'), '/new')
	assert.equal(r('/old#faq', 'old', 'new'), '/new#faq')
	assert.equal(r('old?x=1', 'old', 'new'), 'new?x=1')
	assert.equal(r('/old', '/old', '/new'), '/new', 'slugs may be given with a slash')
	for (const href of ['https://x.co/old', '/older', 'older', '#old', 'mailto:old@x.co', 'tel:old', '/', '', 'javascript:old'])
		assert.equal(r(href, 'old', 'new'), href, href)
	assert.equal(r('/', '/', 'start'), '/start', 'a renamed home')
	assert.equal(r('/old', 'old', '/'), '/', 'a page that became home')
	assert.equal(r('old', 'old', 'old'), 'old')
})

if (failed) {
	console.log(`\n${failed} look checks failed`)
	process.exit(1)
}
console.log('\nlook checks passed')
