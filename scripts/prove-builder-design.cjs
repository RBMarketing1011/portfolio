/**
 * Proves the AI builder's design system against the renderer's own colour math:
 *
 *   node scripts/prove-builder-design.cjs
 *
 *  - contrast.ts reproduces the default theme's golden numbers and the whole section 8.2
 *    palette table (embedded below exactly as the spec prints it);
 *  - every curated palette passes every text role on every surface tone it offers, and
 *    its inverse and brand bands pass theirs or are reported unavailable;
 *  - primary buttons are measured as theme.ts paints them: the theme's gradient on the
 *    page, always solid inside inverse and brand bands, so AI gradients keep their full far
 *    stop (-20 on light sites, +25 on dark ones) instead of being flattened to ±5 by bands;
 *  - OKLCH round-trips; repairTheme turns 500 random palettes into passing themes and
 *    keeps a pinned colour's hue; `keep` is never repaired;
 *  - the palette, font and personality tables are complete and consistent;
 *  - resolveDesign is deterministic, and keepDesign returns `look: null`;
 *  - the derived band colours are pinned (SCHEME_VERSION 1).
 */
const assert = require('node:assert/strict')
const { loadTs } = require('./lib/load-ts.cjs')

const contrast = loadTs('src/lib/builder/design/contrast.ts')
const oklch = loadTs('src/lib/builder/design/oklch.ts')
const scheme = loadTs('src/lib/builder/design/scheme.ts')
const { PALETTES, paletteById, nearestPalette } = loadTs('src/lib/builder/design/palettes.ts')
const { FONT_PAIRS, fontPairById } = loadTs('src/lib/builder/design/fonts.ts')
const { PERSONALITIES, personalityFor } = loadTs('src/lib/builder/design/personalities.ts')
const surfaces = loadTs('src/lib/builder/design/surfaces.ts')
const { resolveDesign, repairTheme } = loadTs('src/lib/builder/design/generate.ts')
const vocab = loadTs('src/lib/builder/design/vocab.ts')
const { sanitizeLook, defaultLook } = loadTs('src/lib/builder/look.ts')
const { defaultSettings, SHAPES } = loadTs('src/app/builder/theme-settings.ts')
const { patterns } = loadTs('src/app/builder/background-settings.ts')
const { googleFonts } = loadTs('src/app/builder/google-fonts.ts')
const { HEADER_VARIANTS } = loadTs('src/lib/builder/page-schema.ts')
const { BUSINESS_TYPES } = loadTs('src/lib/builder/site-profile.ts')
const { lookCss, themeCss } = loadTs('src/app/section-preview/theme.ts')

const { parseHex, toHex, mixSrgb, tintRgb, contrastRatio, themeRgb, surfaceRgb, THRESHOLDS, WHITE, BLACK } = contrast
const { toneSettings, solveSurfaceKit, backdropSettings, headerLook, footerLook, buttonsReadable } = surfaces

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
const random = mulberry32(8_2_2026)
const randomRgb = () => ({ r: Math.floor(random() * 256), g: Math.floor(random() * 256), b: Math.floor(random() * 256) })
const randomHex = () => toHex(randomRgb())

const near = (actual, expected, tolerance, label) =>
	assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual.toFixed(3)} is not ${expected} ±${tolerance}`)

// ---- the section 8.2 table, exactly as the spec prints it -------------------------

const TABLE = `
| D1 | Midnight Electric | dark | \`#03080f #0197f6 #ffffff #cbd5e1\` | 20.1 | 13.5 | 6.2 | 6.5 | 8.2 | 6 | -82 | -50 | -25 | \`#ffffff\` \`#0a72bb\` (5.0) | \`#0197f6\` \`#03080f\` (6.5, 5.2) |
| D2 | Obsidian Gold | dark | \`#0b0b0c #d4a64a #f6f1e7 #cdc5b6\` | 17.5 | 11.5 | 5.4 | 8.8 | 10.6 | 6 | -82 | -75 | -55 | \`#f6f1e7\` \`#84610d\` (5.1) | \`#d4a64a\` \`#0b0b0c\` (8.8, 6.4) |
| D3 | Ember Works | dark | \`#0f0a07 #f97316 #fff7ed #d9cbbf\` | 18.5 | 12.4 | 5.8 | 7.0 | 8.7 | 6 | -82 | -60 | -35 | \`#fff7ed\` \`#b04d03\` (5.0) | \`#f97316\` \`#0f0a07\` (7.0, 5.4) |
| D4 | Forest Night | dark | \`#06130d #4fbf7a #eef7f1 #b7cbbe\` | 17.4 | 11.1 | 5.4 | 8.2 | 9.9 | 6 | -82 | -75 | -60 | \`#eef7f1\` \`#0c7741\` (5.1) | \`#4fbf7a\` \`#06130d\` (8.2, 5.9) |
| D5 | Deep Teal | dark | \`#04161a #2dd4bf #effcfa #a9c9c5\` | 17.6 | 10.4 | 5.1 | 9.9 | 11.2 | 5 | -84 | — | -70 | \`#effcfa\` \`#13776b\` (5.1) | \`#2dd4bf\` \`#04161a\` (9.9, 6.7) |
| D6 | Royal Violet | dark | \`#0b0716 #a78bfa #f5f3ff #c7c1e0\` | 18.1 | 11.5 | 5.4 | 7.3 | 9.3 | 6 | -82 | -75 | -50 | \`#f5f3ff\` \`#7355bf\` (5.0) | \`#a78bfa\` \`#0b0716\` (7.3, 5.6) |
| D7 | Crimson Steel | dark | \`#0c0d10 #f04a4a #f8fafc #c5cad3\` | 18.6 | 11.8 | 5.6 | 5.4 | 6.9 | 6 | -82 | -65 | -40 | \`#f8fafc\` \`#cf262f\` (4.9) | \`#f04a4a\` \`#0c0d10\` (5.4, 4.4) |
| D8 | Navy Brass | dark | \`#0a1020 #e0b15a #f7f4ec #c9cbd6\` | 17.2 | 11.7 | 5.6 | 9.6 | 11.2 | 6 | -82 | -70 | -55 | \`#f7f4ec\` \`#87620d\` (5.1) | \`#e0b15a\` \`#0a1020\` (9.6, 6.7) |
| D9 | Espresso Copper | dark | \`#140e0b #e08a5b #fbf3ec #d6c6b9\` | 17.4 | 11.5 | 5.5 | 7.2 | 9.1 | 6 | -82 | -70 | -50 | \`#fbf3ec\` \`#a25221\` (5.0) | \`#e08a5b\` \`#140e0b\` (7.2, 5.4) |
| D10 | Ink Coral | dark | \`#0e0d14 #ff7a66 #fdf7f5 #cdc6cf\` | 18.2 | 11.6 | 5.5 | 7.6 | 9.3 | 6 | -82 | -70 | -50 | \`#fdf7f5\` \`#be3e2f\` (5.0) | \`#ff7a66\` \`#0e0d14\` (7.6, 5.7) |
| D11 | Graphite Lime | dark | \`#0d0f0c #c4f04d #f7fbef #c8cfbf\` | 18.3 | 12.0 | 5.7 | 14.6 | 15.4 | 6 | -84 | -75 | -60 | \`#f7fbef\` \`#5b7407\` (5.1) | \`#c4f04d\` \`#0d0f0c\` (14.6, 9.1) |
| D12 | Midnight Rose | dark | \`#120a10 #f472b6 #fdf2f8 #e2cdd9\` | 17.9 | 13.0 | 6.0 | 7.4 | 9.1 | 6 | -82 | -55 | -35 | \`#fdf2f8\` \`#b4367d\` (5.1) | \`#f472b6\` \`#120a10\` (7.4, 5.6) |
| D13 | Arctic Night | dark | \`#061217 #7dd3fc #f0f9ff #c3d8e2\` | 17.8 | 12.9 | 6.1 | 11.4 | 12.7 | 6 | -82 | -65 | -50 | \`#f0f9ff\` \`#097297\` (5.0) | \`#7dd3fc\` \`#061217\` (11.4, 7.5) |
| L1 | Paper Navy | light | \`#fbfaf7 #1e3a8a #0b1220 #1e293b\` | 17.9 | 14.0 | 4.8 | 9.9 | 12.3 | 70 | 94 | 82 | 86 | \`#0b1220\` \`#5e82d8\` (5.0) | \`#1e3a8a\` \`#ffffff\` (10.4, 7.4) |
| L2 | Sandstone Rust | light | \`#f7f3ec #7c2d12 #1c1917 #292524\` | 15.8 | 13.7 | 4.8 | 8.5 | 10.8 | 70 | 92 | 76 | 84 | \`#1c1917\` \`#c97257\` (5.0) | \`#7c2d12\` \`#ffffff\` (9.4, 6.7) |
| L3 | Clinic Teal | light | \`#ffffff #115e59 #0b1f24 #1a2b30\` | 17.0 | 14.7 | 4.9 | 7.6 | 10.2 | -2 | 95 | 84 | 84 | \`#0b1f24\` \`#539892\` (5.1) | \`#115e59\` \`#ffffff\` (7.6, 5.6) |
| L4 | Sage Moss | light | \`#f4f6f1 #365314 #141c12 #1f2a1c\` | 16.0 | 13.7 | 4.8 | 8.0 | 10.4 | 70 | 92 | 76 | 84 | \`#141c12\` \`#739455\` (5.0) | \`#365314\` \`#ffffff\` (8.7, 6.4) |
| L5 | Nordic Ember | light | \`#f5f5f4 #9a3412 #0c0a09 #1c1917\` | 18.1 | 16.0 | 5.4 | 6.7 | 9.1 | 70 | 88 | 76 | 76 | \`#0c0a09\` \`#cd6243\` (5.1) | \`#9a3412\` \`#ffffff\` (7.3, 5.3) |
| L6 | Plum Linen | light | \`#faf7f5 #6b21a8 #1a1022 #2a2233\` | 17.3 | 14.3 | 4.9 | 8.2 | 10.7 | 70 | 92 | 76 | 82 | \`#1a1022\` \`#a866ed\` (5.1) | \`#6b21a8\` \`#ffffff\` (8.7, 6.2) |
| L7 | Bordeaux | light | \`#fbf8f6 #881337 #1c0f13 #2b2023\` | 17.6 | 14.9 | 5.0 | 9.0 | 11.6 | 70 | 92 | 76 | 78 | \`#1c0f13\` \`#d55e75\` (5.0) | \`#881337\` \`#ffffff\` (9.6, 6.7) |
| L8 | Coastal Cyan | light | \`#f7fafb #0e7490 #0a1a22 #162a33\` | 16.9 | 14.2 | 4.8 | 5.1 | 7.3 | 70 | 92 | 76 | 80 | \`#0a1a22\` \`#3a92af\` (5.0) | \`#0e7490\` \`#ffffff\` (5.4, 4.1) |
| L9 | Terracotta | light | \`#fbf7f2 #9c3d1c #1b130e #2a1f18\` | 17.2 | 15.1 | 5.1 | 6.4 | 8.7 | 70 | 90 | 76 | 76 | \`#1b130e\` \`#ce6a4a\` (5.1) | \`#9c3d1c\` \`#ffffff\` (6.8, 5.0) |
| L10 | Evergreen | light | \`#f6f8f5 #166534 #0e1a12 #1b2a20\` | 16.7 | 14.1 | 4.8 | 6.7 | 9.1 | 70 | 92 | 76 | 82 | \`#0e1a12\` \`#4d9662\` (5.0) | \`#166534\` \`#ffffff\` (7.1, 5.3) |
| L11 | Slate Indigo | light | \`#f8fafc #4338ca #0f172a #1e293b\` | 17.1 | 14.0 | 4.8 | 7.6 | 10.1 | 70 | 94 | 82 | 86 | \`#0f172a\` \`#737bfd\` (5.1) | \`#4338ca\` \`#ffffff\` (7.9, 5.7) |
| L12 | Ochre Ink | light | \`#fbf9f3 #8a5a0b #16120a #272116\` | 17.7 | 15.2 | 5.1 | 5.6 | 7.9 | 70 | 88 | 76 | 76 | \`#16120a\` \`#ae7c38\` (5.1) | \`#8a5a0b\` \`#ffffff\` (5.9, 4.5) |
| L13 | Rose Clay | light | \`#fcf7f6 #9f1d3f #1d1013 #2c1e22\` | 17.4 | 15.0 | 5.1 | 7.3 | 9.8 | 70 | 90 | 76 | 76 | \`#1d1013\` \`#dc5970\` (5.0) | \`#9f1d3f\` \`#ffffff\` (7.7, 5.5) |
| L14 | Charcoal Citrus | light | \`#fafaf7 #3f6212 #121410 #20241c\` | 17.7 | 15.1 | 5.0 | 6.8 | 9.2 | 70 | 90 | 76 | 76 | \`#121410\` \`#6a9044\` (5.0) | \`#3f6212\` \`#ffffff\` (7.1, 5.3) |
`

const ROWS = TABLE.trim().split('\n').map((line) => {
	const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
	const hexes = (cell) => cell.match(/#[0-9a-f]{6}/g)
	const numbers = (cell) => cell.match(/\(([^)]*)\)/)[1].split(',').map(Number)
	const tone = (cell) => (cell === '—' ? null : Number(cell))
	const [inverseBg, inverseAccent] = hexes(cells[13])
	const [brandBg, brandText] = hexes(cells[14])
	return {
		id: cells[0], name: cells[1], polarity: cells[2], colors: hexes(cells[3]),
		hd: Number(cells[4]), body: Number(cells[5]), s500: Number(cells[6]), accent: Number(cells[7]), hover: Number(cells[8]),
		soft: Number(cells[9]), tinted: Number(cells[10]), wash: tone(cells[11]), page: tone(cells[12]),
		inverseBg, inverseAccent, inverseMin: numbers(cells[13])[0],
		brandBg, brandText, brandHd: numbers(cells[14])[0], brandS400: numbers(cells[14])[1],
	}
})

/**
 * One cell is corrected rather than reproduced: the table measured L3's wash over a white
 * base, but L3's soft band is -2 (pure white has no lighter band), and the wash fades into
 * that band. Over it, 84 leaves the 66% body fade at 4.39:1 on the corner; 90 is the first
 * value that passes. Every other cell is reproduced.
 */
const CORRECTED = { L3: { wash: 90 } }

// Rounded to one decimal in the table; measured on the stored hex colours here.
const TABLE_TOLERANCE = 0.06
// The band colours are derived, and the table measured them before they were rounded to
// the hex values that are stored and painted; eight-bit rounding moves a ratio up to ~0.06.
const SCHEME_TOLERANCE = 0.1

// ---- helpers that re-measure from the primitives -----------------------------------

const themeOf = (colors, extra = {}) => ({ ...defaultSettings, ...colors, ...extra })
const textOn = (theme, on) => {
	const t = themeRgb(theme)
	return {
		heading: contrastRatio(t.heading, on), body: contrastRatio(t.body, on),
		s400: contrastRatio(t.s400, on), s500: contrastRatio(t.s500, on), accent: contrastRatio(t.accent, on),
	}
}
const failsOf = (ratios, limits) => Object.entries(limits).filter(([key, min]) => ratios[key] < min).map(([key]) => `${key} ${ratios[key].toFixed(2)}`)
const BASE_LIMITS = { heading: THRESHOLDS.heading, body: THRESHOLDS.body, s400: THRESHOLDS.s400, s500: THRESHOLDS.s500, accent: THRESHOLDS.accent }

/** The theme a scheme's content is drawn from, as the renderer re-declares it in the band. */
const schemeTheme = (theme, name) => (name && name !== 'base' ? { ...theme, ...scheme.deriveScheme(theme, name) } : theme)

/** The gradient's two stops and the two hover stops themeCss paints (each 88% toward the heading). */
const gradientFills = (t) => ({
	from: t.buttonFrom, to: t.buttonTo,
	'hover from': mixSrgb(t.buttonFrom, t.heading, 88), 'hover to': mixSrgb(t.buttonTo, t.heading, 88),
})

const fillsFailing = (t, fills) =>
	Object.entries(fills)
		.filter(([, fill]) => contrastRatio(t.background, fill) < THRESHOLDS.button)
		.map(([key, fill]) => `${key} ${contrastRatio(t.background, fill).toFixed(2)}`)

/**
 * The primary button's label (the page or band colour it sits on) on every fill it is
 * painted with. On the page: the accent and its hover fill when solid, the gradient's
 * stops when gradient. Inside a band theme.ts resets the gradient, hover included, so
 * whatever the theme's fill the button is the band's accent, and on hover the root's
 * `--sch-*-strong` (schemeStrong).
 */
function labelFails(theme, name = 'base') {
	const t = themeRgb(schemeTheme(theme, name))
	if (name !== 'base') return fillsFailing(t, { fill: t.accent, hover: parseHex(scheme.schemeStrong(theme, name)) })
	return fillsFailing(t, theme.buttonFill === 'gradient' ? gradientFills(t) : { fill: t.accent, hover: t.brandStrong })
}

/** The old rule for bands: the theme's gradient painted inside the band, its tints resolved against the band. */
const bandGradientFails = (theme, name) => {
	const t = themeRgb(schemeTheme(theme, name))
	return fillsFailing(t, gradientFills(t)).length > 0
}

/**
 * The far stop an AI gradient should get, measured independently: the full design value
 * (section 8.6), stepping toward the accent only while the label fails on the page itself.
 */
const fullStop = (polarity) => (polarity === 'light' ? -20 : 25)
function stopFor(theme, polarity) {
	const step = polarity === 'light' ? 5 : -5
	for (let to = fullStop(polarity); to !== 0; to += step) {
		const buttons = { buttonFill: 'gradient', buttonFrom: { token: 'accent', lightness: 0 }, buttonTo: { token: 'accent', lightness: to }, buttonAngle: 135 }
		if (!labelFails({ ...theme, ...buttons }, 'base').length) return to
	}
	return 0
}

/** A stylesheet as its rules in order, each with its selector list and its body. */
const cssRules = (css) =>
	css
		.split('}')
		.map((rule) => rule.split('{'))
		.filter((parts) => parts.length === 2)
		.map(([selector, body]) => ({ selectors: selector.trim().split(', '), body }))

// The themes the AI actually produces for each palette: solid and gradient buttons.
const designFor = (palette, buttons, personality = 'technical') =>
	resolveDesign({
		reply: { palette: palette.id, custom: { background: '', accent: '', heading: '', body: '' }, fonts: null, shape: null, buttons, width: null, backdrop: null, footerTone: null },
		personality,
		pins: { palette: { kind: 'ai', polarity: 'any' }, fonts: { kind: 'ai' }, shape: 'ai' },
		keepDesign: false,
		current: null,
		header: 'bar',
	})

// ---- the renderer's math ----------------------------------------------------------

check('contrast.ts reproduces the default theme\'s golden numbers', () => {
	const t = themeRgb(defaultSettings)
	near(contrastRatio(t.heading, t.background), 20.09, 0.005, 'heading')
	near(contrastRatio(t.body, t.background), 13.53, 0.005, 'body')
	near(contrastRatio(t.s400, t.background), 10.5, 0.005, 's400')
	near(contrastRatio(t.s500, t.background), 6.16, 0.005, 's500')
	near(contrastRatio(t.accent, t.background), 6.46, 0.005, 'accent')
	near(contrastRatio(t.background, t.brandStrong), 8.2, 0.005, 'hover label')
})

check('the colour primitives behave like color-mix and mixWith', () => {
	assert.deepEqual(parseHex('#abc'), { r: 170, g: 187, b: 204 })
	assert.deepEqual(parseHex('AABBCC'), { r: 170, g: 187, b: 204 })
	for (const bad of ['', '#ab', '#abcd', 'xyzxyz', null, 5]) assert.equal(parseHex(bad), null, String(bad))
	assert.equal(toHex({ r: 255.4, g: -3, b: 300 }), '#ff00ff')
	assert.equal(toHex(mixSrgb(WHITE, BLACK, 50)), '#808080')
	assert.deepEqual(tintRgb(WHITE, 0), WHITE)
	assert.equal(toHex(tintRgb(parseHex('#0197f6'), -82)), toHex(mixSrgb(BLACK, parseHex('#0197f6'), 82)))
	assert.equal(toHex(tintRgb(parseHex('#0197f6'), 140)), '#ffffff', 'lightness clamps like the renderer')
	near(contrastRatio(WHITE, BLACK), 21, 1e-9, 'white on black')
	assert.deepEqual(themeRgb({ ...defaultSettings, accent: 'nope', buttonFrom: null }).accent, parseHex(defaultSettings.accent), 'invalid hex paints the default, like safeHex')
	const s = surfaceRgb(defaultSettings, { ...defaultLook().page.page })
	assert.deepEqual(s.base, parseHex('#03080f'))
	assert.equal(toHex(s.corner), toHex(mixSrgb(parseHex('#0197f6'), parseHex('#03080f'), 30)))
})

check('five cells of the section 8.2 table to ±0.05', () => {
	const cells = [
		['D1', 'hd', (t) => contrastRatio(t.heading, t.background)],
		['L1', 'body', (t) => contrastRatio(t.body, t.background)],
		['L5', 's500', (t) => contrastRatio(t.s500, t.background)],
		['D11', 'accent', (t) => contrastRatio(t.accent, t.background)],
		['L8', 'hover', (t) => contrastRatio(t.background, t.brandStrong)],
	]
	for (const [id, key, measure] of cells) {
		const row = ROWS.find((r) => r.id === id)
		near(measure(themeRgb(themeOf(paletteById(id).colors))), row[key], 0.05, `${id} ${key}`)
	}
})

check('every cell of the section 8.2 table is reproduced (27 palettes)', () => {
	assert.equal(ROWS.length, 27)
	for (const row of ROWS) {
		const palette = paletteById(row.id)
		assert.ok(palette, row.id)
		assert.equal(palette.name, row.name, `${row.id} name`)
		assert.equal(palette.polarity, row.polarity, `${row.id} polarity`)
		assert.deepEqual([palette.colors.background, palette.colors.accent, palette.colors.heading, palette.colors.body], row.colors, `${row.id} colours`)

		const theme = themeOf(palette.colors)
		const t = themeRgb(theme)
		near(contrastRatio(t.heading, t.background), row.hd, TABLE_TOLERANCE, `${row.id} hd`)
		near(contrastRatio(t.body, t.background), row.body, TABLE_TOLERANCE, `${row.id} body`)
		near(contrastRatio(t.s500, t.background), row.s500, TABLE_TOLERANCE, `${row.id} s500`)
		near(contrastRatio(t.accent, t.background), row.accent, TABLE_TOLERANCE, `${row.id} accent`)
		near(contrastRatio(t.background, t.brandStrong), row.hover, TABLE_TOLERANCE, `${row.id} btn hover`)

		const kit = solveSurfaceKit(theme, 'technical')
		const want = { ...row, ...CORRECTED[row.id] }
		assert.equal(kit.soft, want.soft, `${row.id} soft`)
		assert.equal(kit.tinted, want.tinted, `${row.id} tinted`)
		assert.equal(kit.wash, want.wash, `${row.id} wash from`)
		assert.equal(kit.page, want.page, `${row.id} page from`)

		const inverse = scheme.deriveScheme(palette.colors, 'inverse')
		assert.equal(inverse.background, row.inverseBg, `${row.id} inverse bg`)
		assert.equal(inverse.accent, row.inverseAccent, `${row.id} inverse accent`)
		const ratios = textOn(themeOf(inverse), parseHex(inverse.background))
		near(Math.min(...Object.values(ratios)), row.inverseMin, SCHEME_TOLERANCE, `${row.id} inverse min`)

		const brand = scheme.deriveScheme(palette.colors, 'brand')
		assert.equal(brand.background, row.brandBg, `${row.id} brand bg`)
		assert.equal(brand.accent, row.brandText, `${row.id} brand text`)
		const inBrand = textOn(themeOf(brand), parseHex(brand.background))
		near(inBrand.heading, row.brandHd, SCHEME_TOLERANCE, `${row.id} brand hd`)
		near(inBrand.s400, row.brandS400, SCHEME_TOLERANCE, `${row.id} brand s400`)
	}
})

check('every curated palette passes every text role on every surface tone it offers', () => {
	for (const palette of PALETTES) {
		for (const buttons of ['solid', 'gradient']) {
			const design = designFor(palette, buttons)
			const theme = design.theme
			const kit = design.kit
			const where = `${palette.id} ${buttons}`
			assert.deepEqual(failsOf(textOn(theme, parseHex(theme.background)), BASE_LIMITS), [], `${where} on the page`)
			assert.deepEqual(labelFails(theme, 'base'), [], `${where} buttons`)

			for (const tone of vocab.SURFACE_TONES) {
				const settings = toneSettings(tone, kit)
				if (!settings) continue
				const name = settings.scheme ?? 'base'
				const inside = schemeTheme(theme, name)
				const { base, corner } = surfaceRgb(inside, settings.page)
				const limits = name === 'brand'
					? { heading: 4.5, body: 4.5, ...(kit.brandS400 ? { s400: 4.5 } : {}) }
					: BASE_LIMITS
				for (const [spot, on] of [['base', base], ['corner', corner]]) {
					if (!on) continue
					assert.deepEqual(failsOf(textOn(inside, on), limits), [], `${where} ${tone} ${spot}`)
				}
				if (name !== 'base') assert.deepEqual(labelFails(theme, name), [], `${where} ${tone} buttons`)
			}

			// The page backdrop's corner, which 'plain' sections sit on.
			for (const id of vocab.BACKDROP_IDS) {
				const { base, corner } = surfaceRgb(theme, backdropSettings(id, kit).page)
				for (const on of [base, corner].filter(Boolean)) assert.deepEqual(failsOf(textOn(theme, on), BASE_LIMITS), [], `${where} backdrop ${id}`)
			}
			const footer = footerLook('soft', kit)
			assert.deepEqual(failsOf(textOn(theme, surfaceRgb(theme, footer.page).base), BASE_LIMITS), [], `${where} soft footer`)
		}
	}
})

check('inverse and brand bands pass their own rules or are reported unavailable (D5 has no wash)', () => {
	for (const palette of PALETTES) {
		const kit = solveSurfaceKit(themeOf(palette.colors), 'technical')
		assert.notEqual(kit.inverse, false, `${palette.id} inverse is available`)
		assert.equal(kit.brand, true, `${palette.id} brand is available`)
		assert.equal(kit.brandS400, !['D7', 'L8'].includes(palette.id), `${palette.id} brand s400 (all but D7 and L8)`)
		assert.notEqual(kit.inverseGlow, null, `${palette.id} inverse glow`)
		const inverse = scheme.deriveScheme(palette.colors, 'inverse')
		const ratios = textOn(themeOf(inverse), parseHex(inverse.background))
		assert.ok(Math.min(...Object.values(ratios)) >= 4.9, `${palette.id} inverse keeps all five text tokens ≥ 4.9`)
		const brand = scheme.deriveScheme(palette.colors, 'brand')
		assert.ok(Number(textOn(themeOf(brand), parseHex(brand.background)).heading.toFixed(1)) >= 5.4, `${palette.id} brand heading ≥ 5.4`)
	}
	const d5 = solveSurfaceKit(themeOf(paletteById('D5').colors), 'technical')
	assert.equal(d5.wash, null)
	assert.deepEqual(toneSettings('wash', d5), toneSettings('soft', d5))
	// A kept grey-on-grey theme: its inverse band cannot be read, its brand band (white on a darkened grey) can.
	const unreadable = solveSurfaceKit({ ...defaultSettings, background: '#777777', heading: '#888888', body: '#808080', accent: '#7a7a7a' }, 'bold')
	assert.equal(unreadable.inverse, false, 'a theme whose inverse band fails reports it unavailable')
	assert.equal(unreadable.wash, null)
	assert.equal(unreadable.inverseGlow, null)
	assert.deepEqual(toneSettings('inverse', unreadable), toneSettings('soft', unreadable), 'and inverse maps down to soft')
	assert.deepEqual(toneSettings('inverse-glow', unreadable), toneSettings('soft', unreadable))
	assert.equal(unreadable.brand, true)
	assert.ok(contrastRatio(WHITE, parseHex(scheme.deriveScheme({ background: '#777777', heading: '#888888', body: '#808080', accent: '#7a7a7a' }, 'brand').background)) >= 5)
	assert.deepEqual(toneSettings('brand', { ...unreadable, brand: false }), toneSettings('soft', unreadable), 'brand → inverse → soft')
})

check('every curated hover label reads at 6.9:1 or more (and above 4.5 even at an 82% mix)', () => {
	for (const palette of PALETTES) {
		const t = themeRgb(themeOf(palette.colors))
		assert.ok(Number(contrastRatio(t.background, t.brandStrong).toFixed(1)) >= 6.9, palette.id)
		const light = palette.polarity === 'light'
		const at82 = mixSrgb(t.accent, light ? BLACK : WHITE, 82)
		assert.ok(contrastRatio(t.background, at82) >= THRESHOLDS.button, `${palette.id} at 82%`)
	}
})

check('THRESHOLDS are section 8.12\'s', () => {
	assert.deepEqual({ ...THRESHOLDS }, { heading: 7, headingTarget: 12, body: 7, s400: 4.5, s500: 4.5, accent: 4.5, button: 4.5 })
})

// ---- OKLCH ------------------------------------------------------------------------

check('OKLCH round trip within 0.5/255 per channel over 1000 seeded random colours', () => {
	let worst = 0
	for (let i = 0; i < 1000; i++) {
		const rgb = randomRgb()
		const back = oklch.fromOklch(oklch.toOklch(rgb))
		worst = Math.max(worst, Math.abs(back.r - rgb.r), Math.abs(back.g - rgb.g), Math.abs(back.b - rgb.b))
	}
	assert.ok(worst <= 0.5, `worst channel error ${worst}`)
	const white = oklch.toOklch(WHITE)
	near(white.l, 1, 1e-6, 'white lightness')
	assert.ok(white.c < 1e-6, 'white has no chroma')
	const outOfGamut = oklch.fromOklch({ l: 0.6, c: 0.5, h: 140 })
	for (const v of Object.values(outOfGamut)) assert.ok(v >= 0 && v <= 255, 'gamut-mapped')
})

check('solveLightness keeps the hue and reaches its target', () => {
	const navy = parseHex('#1e3a8a')
	const band = parseHex('#0b1220')
	const lifted = oklch.solveLightness(navy, band, 5, 'lighter')
	assert.equal(toHex(lifted), '#5e82d8', 'the spec\'s example: #1e3a8a on #0b1220')
	assert.ok(contrastRatio(lifted, band) >= 5)
	near(oklch.toOklch(lifted).h, oklch.toOklch(navy).h, 1, 'hue')
	assert.equal(oklch.solveLightness(parseHex('#808080'), parseHex('#808080'), 30, 'lighter'), null, 'impossible targets are null')
})

// ---- repairs, pins and keep ---------------------------------------------------------

const passesBase = (colors) => {
	const theme = themeOf(colors)
	const ratios = textOn(theme, parseHex(colors.background))
	return failsOf(ratios, { ...BASE_LIMITS, heading: THRESHOLDS.headingTarget })
}

check('repairTheme turns 500 seeded random custom palettes into themes that pass', () => {
	const forms = [(h) => h, (h) => h.slice(1), (h) => h.toUpperCase(), (h) => `#${h[1]}${h[3]}${h[5]}`, () => 'not a colour', () => '']
	for (let i = 0; i < 500; i++) {
		const input = Object.fromEntries(['background', 'accent', 'heading', 'body'].map((role) => [role, (random() < 0.9 ? forms[i % 4] : forms[4 + (i % 2)])(randomHex())]))
		const polarity = i % 3 === 0 ? 'light' : i % 3 === 1 ? 'dark' : undefined
		const out = repairTheme(input, { polarity, keepHue: i % 2 === 0 })
		for (const value of Object.values(out.colors)) assert.match(value, /^#[0-9a-f]{6}$/, `palette ${i} hex`)
		assert.deepEqual(passesBase(out.colors), [], `palette ${i} ${JSON.stringify(input)}`)
		assert.equal(scheme.polarityOf(out.colors), out.polarity, `palette ${i} polarity`)
		if (polarity) assert.equal(out.polarity, polarity, `palette ${i} keeps the pinned polarity`)
		for (const note of out.notes) assert.equal(note.code, 'color-repaired')
		// And the design built on it is readable end to end.
		const design = resolveDesign({
			reply: { palette: null, custom: input, fonts: null, shape: null, buttons: i % 2 ? 'solid' : 'gradient', width: null, backdrop: null, footerTone: null },
			personality: vocab.PERSONALITY_IDS[i % 10],
			pins: { palette: { kind: 'custom', ...input }, fonts: { kind: 'ai' }, shape: 'ai' },
			keepDesign: false, current: null, header: 'bar',
		})
		assert.deepEqual(labelFails(design.theme, 'base'), [], `palette ${i} buttons`)
		if (design.theme.buttonFill === 'gradient')
			assert.equal(design.theme.buttonTo.lightness, stopFor(design.theme, design.polarity), `palette ${i} far stop`)
	}
})

check('repairTheme keeps a pinned colour\'s hue and moves only its lightness', () => {
	let checked = 0
	for (let i = 0; i < 400; i++) {
		const accent = randomHex()
		const base = PALETTES[i % PALETTES.length]
		const out = repairTheme({ ...base.colors, accent }, { polarity: base.polarity, keepHue: true })
		const before = oklch.toOklch(parseHex(accent))
		const after = oklch.toOklch(parseHex(out.colors.accent))
		assert.ok(after.c <= before.c + 0.004, `accent ${accent} gained chroma`)
		for (const role of ['background', 'heading', 'body']) assert.equal(out.colors[role], base.colors[role], `${base.id} ${role} untouched`)
		if (out.colors.accent === accent.toLowerCase()) continue
		assert.ok(out.notes.some((n) => n.message.startsWith(`Your accent ${accent}`)), `a note for ${accent}`)
		if (before.c < 0.04 || after.c < 0.04) continue
		const turn = Math.abs(before.h - after.h) % 360
		assert.ok(Math.min(turn, 360 - turn) <= 3, `${accent} → ${out.colors.accent} turned ${turn.toFixed(1)}°`)
		checked++
	}
	assert.ok(checked > 100, `only ${checked} accents needed a repair`)
	// Four pinned custom colours: each one keeps its own hue, whichever of them had to move.
	let turned = 0
	for (let i = 0; i < 400; i++) {
		const input = { background: randomHex(), accent: randomHex(), heading: randomHex(), body: randomHex() }
		const out = repairTheme(input, { keepHue: true })
		for (const role of ['background', 'accent', 'heading', 'body']) {
			const before = oklch.toOklch(parseHex(input[role]))
			const after = oklch.toOklch(parseHex(out.colors[role]))
			assert.ok(after.c <= before.c + 0.004, `${role} ${input[role]} gained chroma`)
			if (before.c < 0.04 || after.c < 0.04) continue
			const turn = Math.abs(before.h - after.h) % 360
			assert.ok(Math.min(turn, 360 - turn) <= 3, `${role} ${input[role]} → ${out.colors[role]} turned ${turn.toFixed(1)}°`)
			turned++
		}
	}
	assert.ok(turned > 400, `only ${turned} colours kept enough chroma to measure`)
	const gold = repairTheme({ ...paletteById('L2').colors, accent: '#f5c518' }, { polarity: 'light', keepHue: true })
	assert.match(gold.notes[0].message, /^Your accent #f5c518 was darkened to #[0-9a-f]{6} so button labels stay readable\.$/)
	const fine = repairTheme(paletteById('D3').colors, {})
	assert.deepEqual(fine.colors, paletteById('D3').colors, 'a passing palette is left exactly as it is')
	assert.deepEqual(fine.notes, [])
})

check('keep is never repaired: keepDesign returns look: null, the keep pin keeps the colours (notes only)', () => {
	const failing = { ...defaultSettings, background: '#777777', accent: '#7a7a7a', heading: '#888888', body: '#808080', headingFont: 'Inter', radius: 'round' }
	const current = { ...defaultLook(), theme: failing }
	const reply = { palette: 'L1', custom: { background: '', accent: '', heading: '', body: '' }, fonts: 'plex', shape: 'sharp', buttons: 'gradient', width: '7xl', backdrop: 'grid', footerTone: 'inverse' }
	const kept = resolveDesign({ reply, personality: 'refined', pins: { palette: { kind: 'curated', id: 'D1' }, fonts: { kind: 'ai' }, shape: 'sharp' }, keepDesign: true, current, header: 'bar' })
	assert.equal(kept.look, null)
	assert.deepEqual(kept.theme, sanitizeLook(current).theme)
	assert.equal(kept.paletteId, 'keep')
	assert.equal(kept.fontPairId, 'keep')
	assert.equal(kept.view.backdrop, 'keep')
	assert.ok(kept.notes.length >= 1, 'a failing kept theme gets a note')
	const pin = resolveDesign({ reply, personality: 'refined', pins: { palette: { kind: 'keep' }, fonts: { kind: 'keep' }, shape: 'ai' }, keepDesign: false, current, header: 'bar' })
	for (const role of ['background', 'accent', 'heading', 'body']) assert.equal(pin.look.theme[role], failing[role], `keep pin ${role}`)
	assert.equal(pin.look.theme.headingFont, 'Inter')
	assert.equal(pin.look.theme.buttonFill, failing.buttonFill, 'kept colours keep their buttons')
	assert.ok(!pin.notes.some((n) => n.code === 'color-repaired'), 'nothing is repaired')
	assert.equal(pin.paletteId, 'keep')
})

check('pins win: curated, brand colour, custom colours, fonts and shape', () => {
	const reply = { palette: 'D3', custom: { background: '', accent: '', heading: '', body: '' }, fonts: 'archivo', shape: 'round', buttons: 'solid', width: null, backdrop: null, footerTone: null }
	const base = { reply, personality: 'rugged', keepDesign: false, current: null, header: 'bar' }
	const curated = resolveDesign({ ...base, pins: { palette: { kind: 'curated', id: 'L7' }, fonts: { kind: 'pair', id: 'playfair-source' }, shape: 'sharp' } })
	assert.equal(curated.paletteId, 'L7')
	assert.equal(curated.look.theme.accent, '#881337')
	assert.equal(curated.look.theme.headingFont, 'Playfair Display')
	assert.equal(curated.look.theme.radius, 'sharp')
	const brand = resolveDesign({ ...base, pins: { palette: { kind: 'brand', accent: '#0B5FFF', polarity: 'light' }, fonts: { kind: 'ai' }, shape: 'ai' } })
	assert.equal(brand.polarity, 'light')
	assert.equal(brand.paletteId, 'custom')
	assert.equal(brand.look.theme.accent, '#0b5fff')
	assert.equal(brand.look.theme.radius, 'round', 'the planner\'s shape when shape is not pinned')
	const custom = resolveDesign({ ...base, pins: { palette: { kind: 'custom', background: '#ffffff', accent: '#ffcc00', heading: '#999999', body: '#aaaaaa' }, fonts: { kind: 'custom', heading: 'Lobster', body: 'Pacifico' }, shape: 'ai' } })
	assert.equal(custom.look.theme.background, '#ffffff')
	assert.deepEqual(passesBase(custom.look.theme), [])
	assert.equal(custom.look.theme.headingFont, 'Lobster', 'a display face is allowed for headings')
	assert.notEqual(custom.look.theme.bodyFont, 'Pacifico', 'but not for body text')
	assert.ok(custom.notes.some((n) => n.code === 'font-replaced'))
	assert.ok(custom.notes.some((n) => n.code === 'color-repaired' && n.level === 'warn'))
	const polar = resolveDesign({ ...base, reply: { ...reply, palette: 'custom', custom: { background: '#111111', accent: '#ff5500', heading: '#ffffff', body: '#dddddd' } }, pins: { palette: { kind: 'ai', polarity: 'light' }, fonts: { kind: 'ai' }, shape: 'ai' } })
	assert.equal(polar.polarity, 'light', 'a pinned polarity wins over the planner\'s colours')
	assert.ok(polar.notes.some((n) => n.code === 'pin-bent'))
	const bent = resolveDesign({ ...base, pins: { palette: { kind: 'ai', polarity: 'light' }, fonts: { kind: 'ai' }, shape: 'ai' } })
	assert.equal(bent.polarity, 'light')
	assert.equal(bent.paletteId, 'L5', 'the personality\'s first light palette')
	assert.ok(!bent.notes.some((n) => n.code === 'pin-bent'), 'no note when a curated palette was swapped')
})

check('nearestPalette returns a palette of the pinned polarity', () => {
	for (let i = 0; i < 300; i++) {
		const polarity = i % 2 ? 'light' : 'dark'
		assert.equal(nearestPalette(randomHex(), polarity).polarity, polarity)
	}
	for (const palette of PALETTES) assert.equal(nearestPalette(palette.colors.accent, palette.polarity).id, palette.id, palette.id)
	assert.equal(nearestPalette('nope', 'light').polarity, 'light')
	assert.equal(nearestPalette('#777777', 'dark').polarity, 'dark')
})

// ---- the tables ---------------------------------------------------------------------

check('PALETTE_IDS, FONT_PAIR_IDS and PERSONALITY_IDS equal the data tables\' keys', () => {
	assert.deepEqual(PALETTES.map((p) => p.id), [...vocab.PALETTE_IDS])
	assert.deepEqual(FONT_PAIRS.map((f) => f.id), [...vocab.FONT_PAIR_IDS])
	assert.deepEqual(Object.keys(PERSONALITIES), [...vocab.PERSONALITY_IDS])
	for (const [id, p] of Object.entries(PERSONALITIES)) assert.equal(p.id, id)
	for (const palette of PALETTES) assert.equal(scheme.polarityOf(palette.colors), palette.polarity, palette.id)
	assert.equal(paletteById('nope'), null)
	assert.equal(fontPairById('nope'), null)
	assert.equal(vocab.LAYOUT_IDS.length, 82)
	assert.equal(new Set(vocab.LAYOUT_IDS.map((l) => l.split(':')[0])).size, 28)
	assert.equal(vocab.CHILD_LAYOUT_IDS.length, 11)
	assert.equal(vocab.TWEAKS.length, 23)
	for (const l of [...vocab.OPENER_LAYOUTS, ...vocab.CLOSER_LAYOUTS]) assert.ok(vocab.LAYOUT_IDS.includes(l), l)
})

check('every font family is in googleFonts as Sans Serif or Serif', () => {
	const category = new Map(googleFonts.map((f) => [f.family, f.category]))
	for (const pair of FONT_PAIRS) {
		for (const family of [pair.heading, pair.body]) assert.ok(['Sans Serif', 'Serif'].includes(category.get(family)), `${pair.id} ${family}`)
		assert.equal(pair.category, category.get(pair.heading) === 'Serif' ? 'Serif' : 'Sans', `${pair.id} category`)
		for (const p of pair.personalities) assert.ok(vocab.PERSONALITY_IDS.includes(p), `${pair.id} ${p}`)
	}
})

check('every personality\'s shortlists resolve to real ids and its pattern exists', () => {
	const patternIds = patterns.map((p) => p.id)
	for (const p of Object.values(PERSONALITIES)) {
		for (const id of p.palettes) assert.ok(paletteById(id), `${p.id} palette ${id}`)
		for (const id of p.fonts) assert.ok(fontPairById(id), `${p.id} font ${id}`)
		assert.ok(patternIds.includes(p.pattern), `${p.id} pattern ${p.pattern}`)
		assert.ok(SHAPES.includes(p.shape) && vocab.BACKDROP_IDS.includes(p.backdrop) && HEADER_VARIANTS.includes(p.header), p.id)
		assert.ok(['solid', 'gradient'].includes(p.buttons) && p.bands >= 1 && p.bands <= 3, p.id)
		assert.ok(p.palettes.some((id) => paletteById(id).polarity === 'light') && p.palettes.some((id) => paletteById(id).polarity === 'dark'), `${p.id} offers both polarities`)
	}
	assert.equal(PERSONALITIES.luxe.pattern, 'none')
	const kit = solveSurfaceKit(defaultSettings, 'luxe')
	assert.deepEqual(toneSettings('pattern', kit), toneSettings('soft', kit), 'luxe\'s pattern tone is soft')
	for (const type of BUSINESS_TYPES) assert.ok(vocab.PERSONALITY_IDS.includes(personalityFor(type.value)), type.value)
	assert.equal(personalityFor('RoofingContractor'), 'rugged')
	assert.equal(personalityFor('Dentist'), 'clinical')
	assert.equal(personalityFor('HealthClub'), 'bold')
	assert.equal(personalityFor('nope'), 'friendly')
})

// ---- surfaces, backdrops, chrome ------------------------------------------------------

check('every tone is a complete BackgroundSettings, and unavailable tones map down', () => {
	for (const palette of PALETTES) {
		const kit = solveSurfaceKit(themeOf(palette.colors), 'technical')
		assert.equal(toneSettings('plain', kit), null)
		for (const tone of vocab.SURFACE_TONES.filter((t) => t !== 'plain')) {
			const settings = toneSettings(tone, kit)
			assert.deepEqual(sanitizeLook({ blocks: { blk_1: settings } }).blocks.blk_1, settings, `${palette.id} ${tone} is complete`)
		}
		assert.equal(toneSettings('inverse', kit).scheme, 'inverse')
		assert.equal(toneSettings('inverse-glow', kit).scheme, 'inverse')
		assert.equal(toneSettings('brand', kit).scheme, 'brand')
		assert.equal(toneSettings('soft', kit).scheme, undefined)
		assert.equal(toneSettings('brand', { ...kit, brand: false }).scheme, 'inverse')
		assert.deepEqual(toneSettings('inverse-glow', { ...kit, inverseGlow: null }), toneSettings('inverse', kit))
		assert.deepEqual(toneSettings('pattern', { ...kit, pattern: 'none' }), toneSettings('soft', kit))
		assert.deepEqual(toneSettings('inverse', { ...kit, inverse: false }), toneSettings('soft', kit))
		assert.deepEqual(kit.patternColor, palette.polarity === 'light' ? { token: 'heading', lightness: 0 } : { token: 'accent', lightness: 0 })
	}
	const kit = solveSurfaceKit(defaultSettings, 'technical')
	const a = toneSettings('soft', kit)
	a.page.color.lightness = 99
	assert.notEqual(toneSettings('soft', kit).page.color.lightness, 99, 'every call returns fresh objects')
})

check('backdrops never paint a global or transparent page, and fall back when the corner has no safe value', () => {
	const kit = solveSurfaceKit(defaultSettings, 'technical')
	for (const id of vocab.BACKDROP_IDS) {
		const page = backdropSettings(id, kit)
		assert.ok(['solid', 'gradient'].includes(page.page.fill), id)
		assert.deepEqual(sanitizeLook({ page }).page, page, `${id} is complete`)
	}
	assert.equal(backdropSettings('grid', kit).page.pattern, 'grid')
	assert.equal(backdropSettings('grid', kit).page.from.lightness, kit.page)
	assert.equal(backdropSettings('paper', kit).page.pattern, 'dots')
	assert.equal(backdropSettings('blueprint', kit).page.pattern, 'crosshatch')
	const noCorner = { ...kit, page: null }
	assert.deepEqual(backdropSettings('glow', noCorner), backdropSettings('clean', noCorner))
	assert.deepEqual(backdropSettings('grid', noCorner), backdropSettings('paper', noCorner))
	assert.deepEqual(backdropSettings('blueprint', noCorner), backdropSettings('lines', noCorner))
})

check('header and footer looks', () => {
	const kit = solveSurfaceKit(defaultSettings, 'technical')
	for (const variant of HEADER_VARIANTS)
		for (const polarity of ['light', 'dark']) {
			const header = headerLook(variant, polarity)
			assert.equal(header.page.pattern, 'none', 'never a pattern behind navigation')
			assert.equal(header.page.fill, variant === 'none' ? 'global' : 'solid')
			assert.equal(header.menu.fill, 'solid')
			assert.equal(header.panelGlow.mode, polarity === 'dark' ? 'accent' : 'heading')
			assert.deepEqual(sanitizeLook({ header }).header, header, `${variant} ${polarity} is complete`)
		}
	assert.equal(footerLook('match', kit).page.fill, 'global')
	assert.deepEqual(footerLook('soft', kit), toneSettings('soft', kit))
	assert.equal(footerLook('inverse', kit).scheme, 'inverse')
	assert.deepEqual(sanitizeLook({ footer: footerLook('inverse', kit) }).footer, footerLook('inverse', kit))
})

check('AI gradients keep their full far stop (-20 light, +25 dark): bands no longer flatten them to ±5', () => {
	let held = 0
	for (const palette of PALETTES) {
		const design = designFor(palette, 'gradient', 'bold')
		const theme = design.theme
		assert.equal(theme.buttonFill, 'gradient')
		assert.deepEqual(theme.buttonFrom, { token: 'accent', lightness: 0 })
		assert.equal(theme.buttonAngle, 135)
		// Darker on light sites, never the light +40 default; lighter on dark ones.
		assert.equal(theme.buttonTo.lightness, fullStop(palette.polarity), `${palette.id} far stop ${theme.buttonTo.lightness}`)
		assert.equal(theme.buttonTo.lightness, stopFor(theme, palette.polarity), `${palette.id} as measured`)
		assert.deepEqual(labelFails(theme, 'base'), [], `${palette.id} on the page`)
		for (const name of ['base', 'inverse', 'brand']) assert.ok(buttonsReadable(theme, name), `${palette.id} ${name}`)
		for (const name of ['inverse', 'brand']) assert.deepEqual(labelFails(theme, name), [], `${palette.id} ${name} buttons, solid`)
		// Painted inside the inverse band, this gradient would fail: that is what held every palette at ±5.
		if (bandGradientFails(theme, 'inverse')) held++
	}
	assert.equal(held, PALETTES.length, 'every full-range gradient would fail if a band painted it')
})

check('band buttons are measured solid, as theme.ts paints them, whatever the theme\'s fill', () => {
	// The renderer: the page's primary button wears the gradient; every band (blocks and the
	// footer) resets it, hover included, in a later and more specific rule, and fills it from
	// the band's own colours, which the root carries.
	const PRIMARY = "[data-slot='button'].bg-brand"
	const design = designFor(paletteById('L1'), 'gradient', 'bold')
	const blocks = { blk_inv: toneSettings('inverse', design.kit), blk_glow: toneSettings('inverse-glow', design.kit), blk_brand: toneSettings('brand', design.kit) }
	const rules = cssRules(lookCss(sanitizeLook({ ...design.look, footer: footerLook('inverse', design.kit), blocks })))
	const at = (selector) => rules.findIndex((rule) => rule.selectors.includes(selector))
	for (const selector of [PRIMARY, `${PRIMARY}:hover`]) assert.match(rules[at(selector)].body, /^background-image:linear-gradient\(/, `the page paints ${selector} with the gradient`)
	const root = rules[at(':root')].body
	const scopes = {
		inverse: ["html [data-surface='footer']", "[data-block-id='blk_inv'] > *", "[data-block-id='blk_glow'] > *"],
		brand: ["[data-block-id='blk_brand'] > *"],
	}
	for (const [name, list] of Object.entries(scopes)) {
		const prefix = name === 'inverse' ? 'inv' : 'brand'
		const band = scheme.deriveScheme(design.theme, name)
		assert.ok(root.includes(`--sch-${prefix}-bg:${band.background};`) && root.includes(`--sch-${prefix}-accent:${band.accent};`), `${name} colours at the root`)
		assert.ok(root.includes(`--sch-${prefix}-strong:${scheme.schemeStrong(design.theme, name)};`), `${name} hover fill at the root`)
		for (const scope of list) {
			const tokens = rules[at(scope)].body
			for (const [token, key] of [['--color-ink', 'bg'], ['--color-brand', 'accent'], ['--color-brand-strong', 'strong']])
				assert.ok(tokens.includes(`${token}:var(--sch-${prefix}-${key});`), `${scope} ${token}`)
			const reset = at(`${scope} ${PRIMARY}`)
			assert.ok(reset > at(`${PRIMARY}:hover`), `${scope}: the reset follows the page's gradient`)
			assert.ok(rules[reset].selectors.includes(`${scope} ${PRIMARY}:hover`), `${scope}: hover included`)
			assert.equal(rules[reset].body, 'background-image:none;', `${scope}: solid`)
		}
	}

	// The design measures exactly that: a band's accent and hover fill, never the theme's
	// stops, so neither the verdict nor the bands a site may use depend on its button fill.
	for (const palette of PALETTES) {
		const solid = themeOf(palette.colors)
		const kit = solveSurfaceKit(solid, 'technical')
		for (const name of ['inverse', 'brand']) {
			const want = buttonsReadable(solid, name)
			assert.equal(want, !labelFails(solid, name).length, `${palette.id} ${name}`)
			for (const to of [-40, -20, -5, 0, 5, 25, 40])
				for (const from of [{ token: 'accent', lightness: 0 }, { token: 'heading', lightness: -35 }])
					assert.equal(buttonsReadable({ ...solid, buttonFill: 'gradient', buttonFrom: from, buttonTo: { token: 'accent', lightness: to } }, name), want, `${palette.id} ${name} gradient to ${to}`)
		}
		for (const to of [-40, 40])
			assert.deepEqual(solveSurfaceKit({ ...solid, buttonFill: 'gradient', buttonTo: { token: 'accent', lightness: to } }, 'technical'), kit, `${palette.id} kit with a gradient to ${to}`)
	}

	// Over random themes it agrees with the model above, both ways, and it is not the old rule.
	const draw = mulberry32(14_4_2026)
	const hex = () => toHex({ r: Math.floor(draw() * 256), g: Math.floor(draw() * 256), b: Math.floor(draw() * 256) })
	const tint = () => ({ token: ['accent', 'heading', 'body', 'background'][Math.floor(draw() * 4)], lightness: Math.round(draw() * 100 - 50) })
	const seen = { pass: 0, fail: 0, old: 0 }
	for (let i = 0; i < 500; i++) {
		const theme = { ...defaultSettings, background: hex(), accent: hex(), heading: hex(), body: hex(), buttonFill: draw() < 0.5 ? 'solid' : 'gradient', buttonFrom: tint(), buttonTo: tint() }
		for (const name of ['base', 'inverse', 'brand']) {
			const ok = buttonsReadable(theme, name)
			assert.equal(ok, !labelFails(theme, name).length, `random theme ${i} ${name}`)
			if (name === 'base') continue
			seen[ok ? 'pass' : 'fail']++
			if (theme.buttonFill === 'gradient' && ok === bandGradientFails(theme, name)) seen.old++
		}
	}
	assert.ok(seen.pass > 0 && seen.fail > 0, `band buttons pass and fail: ${JSON.stringify(seen)}`)
	assert.ok(seen.old > 0, 'the gradient painted inside a band would give other answers')

	// Bands come from the colours theme.ts paints: one it does not accept (it wants #rrggbb)
	// paints the default, at the root and in every band alike.
	const short = { ...defaultSettings, accent: '#04a' }
	assert.ok(themeCss(short).includes(`--sch-inv-accent:${scheme.deriveScheme(defaultSettings, 'inverse').accent};`), 'theme.ts derives the band from the default accent')
	assert.deepEqual(solveSurfaceKit(short, 'bold'), solveSurfaceKit(defaultSettings, 'bold'))
	assert.notEqual(solveSurfaceKit({ ...defaultSettings, accent: '#0044aa' }, 'bold').inverseGlow, solveSurfaceKit(defaultSettings, 'bold').inverseGlow, 'not the colour #04a would parse to')
})

// ---- resolveDesign -------------------------------------------------------------------

check('resolveDesign is deterministic and its looks are complete and safe', () => {
	const replies = [
		{ palette: 'L5', custom: { background: '', accent: '', heading: '', body: '' }, fonts: 'oswald-barlow', shape: 'sharp', buttons: 'solid', width: '7xl', backdrop: 'blueprint', footerTone: 'inverse' },
		{ palette: 'custom', custom: { background: '#FAFAFA', accent: 'f5c518', heading: '#333', body: '#666666' }, fonts: null, shape: null, buttons: 'gradient', width: null, backdrop: 'glow', footerTone: 'soft' },
		{ palette: null, custom: { background: '', accent: '', heading: '', body: '' }, fonts: null, shape: null, buttons: null, width: null, backdrop: null, footerTone: null },
	]
	const pinsList = [
		{ palette: { kind: 'ai', polarity: 'any' }, fonts: { kind: 'ai' }, shape: 'ai' },
		{ palette: { kind: 'ai', polarity: 'dark' }, fonts: { kind: 'pair', id: 'manrope' }, shape: 'round' },
		{ palette: { kind: 'brand', accent: '#c026d3', polarity: 'dark' }, fonts: { kind: 'keep' }, shape: 'ai' },
	]
	for (const reply of replies)
		for (const pins of pinsList)
			for (const personality of vocab.PERSONALITY_IDS)
				for (const header of HEADER_VARIANTS) {
					const input = { reply, personality, pins, keepDesign: false, current: null, header }
					const a = resolveDesign(input)
					const b = resolveDesign(JSON.parse(JSON.stringify(input)))
					assert.deepEqual(a, b, 'deterministic')
					assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'plain data')
					const full = sanitizeLook({ ...a.look, blocks: {} })
					assert.deepEqual({ theme: full.theme, page: full.page, header: full.header, footer: full.footer }, a.look, 'already sanitized')
					assert.deepEqual(a.theme, a.look.theme)
					assert.ok(['solid', 'gradient'].includes(a.look.page.page.fill), 'never a white live page')
					assert.equal(a.look.header.page.pattern, 'none')
					assert.deepEqual(passesBase(a.theme), [], `${personality} ${JSON.stringify(pins.palette)}`)
					assert.deepEqual(labelFails(a.theme, 'base'), [])
					assert.equal(a.view.polarity, a.polarity)
					assert.equal(a.view.shape, a.theme.radius)
					assert.ok(['5xl', '6xl', '7xl'].includes(a.theme.maxWidth))
					for (const note of a.notes) assert.ok(['color-repaired', 'font-replaced', 'pin-bent', 'surface-changed'].includes(note.code), note.code)
				}
	const kept = resolveDesign({ reply: replies[0], personality: 'warm', pins: pinsList[0], keepDesign: true, current: null, header: 'bar' })
	assert.equal(kept.look, null)
	assert.deepEqual(kept.theme, defaultLook().theme)
})

check('resolveDesign shrugs off junk: prototype-key personalities, widths the AI may not choose', () => {
	const reply = { palette: 'L3', custom: { background: '', accent: '', heading: '', body: '' }, fonts: null, shape: null, buttons: null, width: 'full', backdrop: null, footerTone: null }
	const pins = { palette: { kind: 'ai', polarity: 'any' }, fonts: { kind: 'ai' }, shape: 'ai' }
	for (const personality of ['constructor', 'toString', '__proto__', 'nope']) {
		for (const keepDesign of [false, true]) {
			const design = resolveDesign({ reply, personality, pins, keepDesign, current: null, header: 'bar' })
			assert.equal(design.view.personality, 'friendly', `${personality} falls back to friendly`)
		}
	}
	assert.equal(solveSurfaceKit(defaultSettings, 'constructor').pattern, 'none')
	for (const width of ['full', '3xl', '4xl', 'x', null]) {
		const design = resolveDesign({ reply: { ...reply, width }, personality: 'clinical', pins, keepDesign: false, current: null, header: 'bar' })
		assert.equal(design.theme.maxWidth, '6xl', String(width))
	}
	assert.equal(resolveDesign({ reply: { ...reply, width: '7xl' }, personality: 'clinical', pins, keepDesign: false, current: null, header: 'bar' }).theme.maxWidth, '7xl')
	assert.equal(nearestPalette('#0197f6', 'neither').id, 'D1', 'a junk polarity still finds a palette')
	for (const value of Object.values(scheme.deriveScheme(null, 'brand'))) assert.match(value, /^#[0-9a-f]{6}$/)
})

check('the plan card shows the backdrop that is painted', () => {
	const kit = solveSurfaceKit(defaultSettings, 'technical')
	for (const id of vocab.BACKDROP_IDS) assert.equal(surfaces.backdropFor(id, kit), id, `${id} is painted as chosen when the corner is readable`)
	const noCorner = { ...kit, page: null }
	const want = { clean: 'clean', paper: 'paper', glow: 'clean', grid: 'paper', lines: 'lines', blueprint: 'lines' }
	for (const id of vocab.BACKDROP_IDS) {
		assert.equal(surfaces.backdropFor(id, noCorner), want[id], id)
		assert.deepEqual(backdropSettings(id, noCorner), backdropSettings(want[id], noCorner), `${id} paints ${want[id]}`)
	}
	for (const palette of PALETTES) {
		const design = resolveDesign({
			reply: { palette: palette.id, custom: { background: '', accent: '', heading: '', body: '' }, fonts: null, shape: null, buttons: null, width: null, backdrop: 'blueprint', footerTone: null },
			personality: 'rugged', pins: { palette: { kind: 'ai', polarity: 'any' }, fonts: { kind: 'ai' }, shape: 'ai' }, keepDesign: false, current: null, header: 'bar',
		})
		assert.equal(design.view.backdrop, surfaces.backdropFor('blueprint', design.kit), palette.id)
		assert.deepEqual(design.look.page, backdropSettings(design.view.backdrop, design.kit), palette.id)
	}
})

// ---- pinned band colours ----------------------------------------------------------------

// bg accent heading body hover, per scheme. A change here must be deliberate: bump SCHEME_VERSION.
const PINNED = {
	D1: { inverse: '#ffffff #0a72bb #03080f #21262c #085992', brand: '#0197f6 #03080f #03080f #031321 #031c2f' },
	D2: { inverse: '#f6f1e7 #84610d #0b0b0c #1e1d1e #674c0a', brand: '#d4a64a #0b0b0c #0b0b0c #1b1711 #272115' },
	D3: { inverse: '#fff7ed #b04d03 #0f0a07 #27221e #893c02', brand: '#f97316 #0f0a07 #0f0a07 #221208 #301909' },
	D4: { inverse: '#eef7f1 #0c7741 #06130d #14211b #095d33', brand: '#4fbf7a #06130d #06130d #0c2116 #102b1c' },
	D5: { inverse: '#effcfa #13776b #04161a #122427 #0f5d53', brand: '#2dd4bf #04161a #04161a #072527 #0a3131' },
	D6: { inverse: '#f5f3ff #7355bf #0b0716 #221f2d #5a4295', brand: '#a78bfa #0b0716 #0b0716 #171228 #211936' },
	D7: { inverse: '#f8fafc #cf262f #0c0d10 #242528 #a11e25', brand: '#f04a4a #0c0d10 #0c0d10 #1e1215 #2c1618' },
	D8: { inverse: '#f7f4ec #87620d #0a1020 #181e2c #694c0a', brand: '#e0b15a #0a1020 #0a1020 #1b1d25 #282728' },
	D9: { inverse: '#fbf3ec #a25221 #140e0b #26201d #7e401a', brand: '#e08a5b #140e0b #140e0b #241811 #311f16' },
	D10: { inverse: '#fdf7f5 #be3e2f #0e0d14 #212026 #943025', brand: '#ff7a66 #0e0d14 #0e0d14 #21161b #301c1f' },
	D11: { inverse: '#f7fbef #5b7407 #0d0f0c #20221e #475a05', brand: '#c4f04d #0d0f0c #0d0f0c #1c2111 #272f15' },
	D12: { inverse: '#fdf2f8 #b4367d #120a10 #251d23 #8c2a62', brand: '#f472b6 #120a10 #120a10 #24121d #321927' },
	D13: { inverse: '#f0f9ff #097297 #061217 #19242a #075976', brand: '#7dd3fc #061217 #061217 #102129 #172d37' },
	L1: { inverse: '#0b1220 #5e82d8 #fbfaf7 #d5d5d5 #819ee1', brand: '#1e3a8a #ffffff #ffffff #edeff6 #dfe3ef' },
	L2: { inverse: '#1c1917 #c97257 #f7f3ec #e1ddd7 #d5917c', brand: '#7c2d12 #ffffff #ffffff #f5eeec #ede2de' },
	L3: { inverse: '#0b1f24 #539892 #ffffff #dde0e0 #79afaa', brand: '#115e59 #ffffff #ffffff #ecf2f2 #dee8e8' },
	L4: { inverse: '#141c12 #739455 #f4f6f1 #d9dcd6 #92ac7a', brand: '#365314 #ffffff #ffffff #eff1ec #e3e7de' },
	L5: { inverse: '#0c0a09 #cd6243 #f5f5f4 #d0cfce #d8856c', brand: '#9a3412 #ffffff #ffffff #f7efec #f1e3de' },
	L6: { inverse: '#1a1022 #a866ed #faf7f5 #dbd7d7 #bb88f1', brand: '#6b21a8 #ffffff #ffffff #f3edf8 #eae0f3' },
	L7: { inverse: '#1c0f13 #d55e75 #fbf8f6 #d7d3d2 #de8193', brand: '#881337 #ffffff #ffffff #f5ecef #eedee3' },
	L8: { inverse: '#0a1a22 #3a92af #f7fafb #d6dbdd #65aac1', brand: '#0e7490 #ffffff #ffffff #ecf4f6 #e2eef2' },
	L9: { inverse: '#1b130e #ce6a4a #fbf7f2 #dcd7d2 #d98b72', brand: '#9c3d1c #ffffff #ffffff #f7efed #f1e4df' },
	L10: { inverse: '#0e1a12 #4d9662 #f6f8f5 #d6d9d5 #74ad85', brand: '#166534 #ffffff #ffffff #ecf3ef #dee9e3' },
	L11: { inverse: '#0f172a #737bfd #f8fafc #d7dadf #9298fd', brand: '#4338ca #ffffff #ffffff #f0effb #e5e3f8' },
	L12: { inverse: '#16120a #ae7c38 #fbf9f3 #d6d4ce #c09964', brand: '#8a5a0b #ffffff #ffffff #f6f2eb #efe8dd' },
	L13: { inverse: '#1d1013 #dc5970 #fcf7f6 #ddd7d6 #e47e8f', brand: '#9f1d3f #ffffff #ffffff #f7edf0 #f2dfe4' },
	L14: { inverse: '#121410 #6a9044 #fafaf7 #d5d5d2 #8ba86d', brand: '#3f6212 #ffffff #ffffff #f0f2ec #e4e9de' },
}

check(`derived band colours are pinned for every curated palette (SCHEME_VERSION ${scheme.SCHEME_VERSION})`, () => {
	assert.equal(scheme.SCHEME_VERSION, 1)
	assert.deepEqual(Object.keys(PINNED), [...vocab.PALETTE_IDS])
	for (const palette of PALETTES)
		for (const name of ['inverse', 'brand']) {
			const d = scheme.deriveScheme(palette.colors, name)
			const got = `${d.background} ${d.accent} ${d.heading} ${d.body} ${scheme.schemeStrong(palette.colors, name)}`
			assert.equal(got, PINNED[palette.id][name], `${palette.id} ${name}`)
		}
	const junk = scheme.deriveScheme({ background: 'x', accent: null, heading: '#fff', body: 5 }, 'inverse')
	for (const value of Object.values(junk)) assert.match(value, /^#[0-9a-f]{6}$/, 'always a complete, valid set')
	assert.equal(scheme.polarityOf({ background: '#ffffff', accent: '#000000', heading: '#000000', body: '#000000' }), 'light')
	assert.equal(scheme.polarityOf(defaultSettings), 'dark')
})

if (failed) {
	console.log(`\n${failed} design checks failed`)
	process.exit(1)
}
console.log('\ndesign checks passed')
