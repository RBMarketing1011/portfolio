/**
 * Proves src/lib/media/colors.ts: the curated colour vocabulary, nearest-name
 * lookup in CIELAB, hex helpers and the resolver the search box uses.
 *
 *   node scripts/prove-media-colors.mjs
 *
 * Expectations come from the build spec and the stub's doc comment (what a web
 * designer would call each colour), not from whatever the code returns. Where the
 * spec leaves a judgement call (olive, magenta, cyan, cream, ivory) the choice is
 * named in the test.
 */
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const { loadTs, rootRequire, ROOT } = require('./lib/load-ts.cjs')
const fs = require('node:fs')
const path = require('node:path')

const colors = loadTs('src/lib/media/colors.ts')
const {
	NAMED_COLORS,
	COLOR_ALIASES,
	NEUTRAL_COLORS,
	hexToRgb,
	rgbToHex,
	nameColor,
	resolveColorName,
	isColorName,
	swatchFor,
} = colors

let passed = 0
let failed = 0

function check(name, fn) {
	try {
		fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${error instanceof Error ? error.message : error})`)
	}
}

function same(actual, expected, label = '') {
	const a = JSON.stringify(actual)
	const e = JSON.stringify(expected)
	if (a !== e) throw new Error(`${label ? `${label}: ` : ''}expected ${e}, got ${a}`)
}

function ok(condition, message) {
	if (!condition) throw new Error(message)
}

const NAMES = NAMED_COLORS.map((color) => color.name)
const NAME_SET = new Set(NAMES)
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

check('vocabulary: 14 to 18 unique lowercase one-word names', () => {
	ok(NAMES.length >= 14 && NAMES.length <= 18, `${NAMES.length} names`)
	same(new Set(NAMES).size, NAMES.length, 'unique')
	for (const name of NAMES) ok(/^[a-z]+$/.test(name), `bad name ${name}`)
})

check('vocabulary: the spec names are all present, in display order', () => {
	const required = [
		'red',
		'orange',
		'yellow',
		'green',
		'teal',
		'blue',
		'navy',
		'purple',
		'pink',
		'brown',
		'beige',
		'gray',
		'black',
		'white',
	]
	for (const name of required) ok(NAME_SET.has(name), `missing ${name}`)
	const order = NAMES.filter((name) => required.includes(name))
	same(order, required, 'display order')
})

check('vocabulary: every swatch is a valid lowercase #rrggbb', () => {
	for (const color of NAMED_COLORS) {
		ok(/^#[0-9a-f]{6}$/.test(color.hex), `${color.name} ${color.hex}`)
	}
	same(new Set(NAMED_COLORS.map((c) => c.hex)).size, NAMED_COLORS.length, 'distinct swatches')
})

check('vocabulary: the exported list is frozen', () => {
	ok(Object.isFrozen(NAMED_COLORS), 'array not frozen')
	for (const color of NAMED_COLORS) ok(Object.isFrozen(color), `${color.name} not frozen`)
	ok(Object.isFrozen(COLOR_ALIASES), 'aliases not frozen')
})

check('every NAMED_COLORS swatch names itself', () => {
	for (const color of NAMED_COLORS)
		same(nameColor(color.hex), color.name, `swatch of ${color.name}`)
})

check('swatches name themselves through every spelling of the hex', () => {
	for (const color of NAMED_COLORS) {
		same(nameColor(color.hex.toUpperCase()), color.name, `${color.name} upper`)
		same(nameColor(color.hex.slice(1)), color.name, `${color.name} no hash`)
	}
})

check('NEUTRAL_COLORS is exactly black, white, gray', () => {
	same([...NEUTRAL_COLORS].sort(), ['black', 'gray', 'white'])
	for (const name of NEUTRAL_COLORS) ok(NAME_SET.has(name), `${name} not a name`)
})

check('aliases: grey maps to gray; every value is canonical; no key shadows a name', () => {
	same(COLOR_ALIASES.grey, 'gray')
	for (const [key, value] of Object.entries(COLOR_ALIASES)) {
		ok(NAME_SET.has(value), `${key} -> ${value} is not canonical`)
		ok(!NAME_SET.has(key), `${key} shadows a canonical name`)
		ok(/^[a-z]+$/.test(key), `${key} must be lowercase letters only`)
	}
})

check('aliases: no key can be mistaken for a hex colour', () => {
	for (const key of Object.keys(COLOR_ALIASES)) ok(!HEX_RE.test(key), `${key} looks like hex`)
})

check('aliases: no key is a prefix target the prefix rule could confuse', () => {
	// An alias must not be a bare prefix of a canonical name, or `resolve` would
	// have two answers for one input.
	for (const key of Object.keys(COLOR_ALIASES))
		for (const name of NAMES) ok(!name.startsWith(key), `${key} is a prefix of ${name}`)
})

check('aliases: nameColor agrees with each alias for its everyday hex', () => {
	const everyday = {
		grey: '#808080',
		silver: '#c0c0c0',
		charcoal: '#36454f',
		slate: '#708090',
		crimson: '#dc143c',
		scarlet: '#ff2400',
		maroon: '#800000',
		burgundy: '#800020',
		gold: '#ffd700',
		lime: '#00ff00',
		olive: '#808000',
		cyan: '#00ffff',
		aqua: '#00ffff',
		turquoise: '#40e0d0',
		skyblue: '#87ceeb',
		royalblue: '#4169e1',
		lightblue: '#add8e6',
		navyblue: '#000080',
		darkblue: '#00008b',
		violet: '#ee82ee',
		indigo: '#4b0082',
		lavender: '#b57edc',
		magenta: '#ff00ff',
		fuchsia: '#ff00ff',
		hotpink: '#ff69b4',
		tan: '#d2b48c',
		cream: '#fffdd0',
		ivory: '#fffff0',
		offwhite: '#faf9f6',
		darkgreen: '#006400',
		lightgray: '#d3d3d3',
		lightgrey: '#d3d3d3',
		darkgray: '#a9a9a9',
		darkgrey: '#a9a9a9',
	}
	for (const [alias, hex] of Object.entries(everyday)) {
		ok(alias in COLOR_ALIASES, `alias ${alias} missing from the table`)
		same(nameColor(hex), COLOR_ALIASES[alias], `${alias} ${hex}`)
	}
	for (const alias of Object.keys(COLOR_ALIASES))
		ok(alias in everyday, `alias ${alias} has no everyday hex in this proof`)
})

/* -------------------------------------------------------------------------- */
/* Internals: Lab conversion and CIEDE2000 against published values            */
/* -------------------------------------------------------------------------- */

// The module keeps its metric private. Load the same source with one extra export
// line so the numbers can be checked against Sharma, Wu and Dalal (2005).
const internals = (() => {
	const ts = rootRequire('typescript')
	const Module = require('node:module')
	const file = path.join(ROOT, 'src/lib/media/colors.ts')
	const source = `${fs.readFileSync(file, 'utf8')}\nexport { deltaE2000, rgbToLab }\n`
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	})
	const mod = new Module(file, null)
	mod.filename = file
	mod._compile(outputText, file)
	return mod.exports
})()

check('internals: CIEDE2000 matches the Sharma-Wu-Dalal reference pairs', () => {
	const pairs = [
		[[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
		[[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
		[[50, 2.5, 0], [50, 0, -2.5], 4.3065],
		[[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
		[[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
		[[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
		[[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
		[[50, 2.5, 0], [73, 25, -18], 27.1492],
		[[50, 2.5, 0], [61, -5, 29], 22.8977],
	]
	for (const [one, two, expected] of pairs) {
		const got = internals.deltaE2000(one, two)
		ok(Math.abs(got - expected) < 1e-3, `${one} vs ${two}: ${got} not ${expected}`)
		const back = internals.deltaE2000(two, one)
		ok(Math.abs(got - back) < 1e-9, 'not symmetric')
	}
	same(internals.deltaE2000([50, 20, 30], [50, 20, 30]), 0, 'identity')
})

check('internals: sRGB to CIELAB D65 matches known values', () => {
	const known = [
		['#ffffff', [100, 0, 0]],
		['#000000', [0, 0, 0]],
		['#ff0000', [53.2408, 80.0925, 67.2032]],
		['#00ff00', [87.7347, -86.1827, 83.1793]],
		['#0000ff', [32.2970, 79.1875, -107.8602]],
		['#808080', [53.5850, 0, 0]],
	]
	for (const [hex, expected] of known) {
		const [r, g, b] = hexToRgb(hex)
		const lab = internals.rgbToLab(r, g, b)
		for (let i = 0; i < 3; i++)
			ok(Math.abs(lab[i] - expected[i]) < 0.02, `${hex} channel ${i}: ${lab[i]} not ${expected[i]}`)
	}
})

/* -------------------------------------------------------------------------- */
/* nameColor: the sample table                                                */
/* -------------------------------------------------------------------------- */

// [hex, expected name, why]. Every row is a call a web designer would make.
const SAMPLES = [
	// pure saturated primaries and secondaries
	['#ff0000', 'red', 'primary red'],
	['#00ff00', 'green', 'primary green'],
	['#0000ff', 'blue', 'primary blue'],
	['#ffff00', 'yellow', 'primary yellow'],
	['#ff8000', 'orange', 'pure orange'],
	['#00ffff', 'teal', 'cyan is teal'],
	['#ff00ff', 'pink', 'magenta is pink'],
	['#800080', 'purple', 'css purple'],
	// the stub's own examples
	['#0197f6', 'blue', 'stub example'],
	['#7a4a1e', 'brown', 'stub example'],
	['#f4ecd8', 'beige', 'stub example'],
	['#808080', 'gray', 'stub example'],
	// skin tones: beige, brown or orange, never pink or red
	['#ffdbac', 'beige', 'light skin'],
	['#f1c27d', 'beige', 'light-medium skin'],
	['#e0ac69', 'beige', 'medium skin'],
	['#c68642', 'brown', 'tan skin'],
	['#8d5524', 'brown', 'brown skin'],
	['#6b4226', 'brown', 'deep skin'],
	['#4a2f1d', 'brown', 'very deep skin'],
	['#f3c9a8', 'beige', 'fair skin'],
	['#e8b896', 'beige', 'peach skin'],
	// sky blue and royal blue
	['#87ceeb', 'blue', 'sky blue'],
	['#4169e1', 'blue', 'royal blue'],
	['#1e90ff', 'blue', 'dodger blue'],
	['#add8e6', 'blue', 'light blue'],
	['#5fa8f0', 'blue', 'mid sky'],
	// navy vs black
	['#0a1a3a', 'navy', 'spec navy'],
	['#101010', 'black', 'spec black'],
	['#000080', 'navy', 'css navy'],
	['#14213d', 'navy', 'oxford navy'],
	['#1b2a49', 'navy', 'dark navy'],
	['#0a0a0a', 'black', 'near black'],
	['#000000', 'black', 'black'],
	['#050510', 'black', 'blue-black is still black'],
	// green family, dark green, olive is green
	['#006400', 'green', 'dark green'],
	['#0b3d1e', 'green', 'forest night'],
	['#1f5f2f', 'green', 'dark green'],
	['#808000', 'green', 'olive: decided green (a yellow-green)'],
	['#556b2f', 'green', 'dark olive green'],
	['#2e8b57', 'green', 'sea green'],
	['#90ee90', 'green', 'light green'],
	// cream and ivory vs white vs beige
	['#fffdd0', 'beige', 'cream'],
	['#fffff0', 'white', 'ivory'],
	['#faf0e6', 'white', 'linen is a white'],
	['#f5f5dc', 'beige', 'css beige'],
	['#f5deb3', 'beige', 'wheat'],
	['#fdf6e3', 'beige', 'warm paper'],
	['#ffffff', 'white', 'white'],
	['#f5f5f5', 'white', 'whitesmoke'],
	// near-white pastels are white or beige, never a hue name
	['#ffe4e1', 'white', 'pale pink pastel'],
	['#e6f0ff', 'white', 'pale blue pastel'],
	['#f0fff0', 'white', 'pale green pastel'],
	['#e6e6fa', 'white', 'pale lavender pastel'],
	['#fbe9e7', 'white', 'blush pastel'],
	['#ffffe0', 'beige', 'pale yellow pastel'],
	['#ddddff', 'white', 'periwinkle tint'],
	// hot pink vs red vs purple
	['#ff69b4', 'pink', 'hot pink'],
	['#ff1493', 'pink', 'deep pink'],
	['#e91e63', 'pink', 'material pink'],
	['#ffc0cb', 'pink', 'pink'],
	['#dc143c', 'red', 'crimson'],
	['#b22222', 'red', 'firebrick'],
	['#800000', 'red', 'maroon is red'],
	['#4b0082', 'purple', 'indigo'],
	['#9370db', 'purple', 'medium purple'],
	['#8a2be2', 'purple', 'blue violet'],
	['#b19cd9', 'purple', 'light purple'],
	// teal vs green vs blue
	['#008080', 'teal', 'css teal'],
	['#20b2aa', 'teal', 'light sea green'],
	['#40e0d0', 'teal', 'turquoise'],
	['#2a9d8f', 'teal', 'persian green'],
	['#2f6fed', 'blue', 'ui blue'],
	// greys: 0x20 to 0xe0 is gray
	['#202020', 'gray', '0x20'],
	['#e0e0e0', 'gray', '0xe0'],
	['#999999', 'gray', 'mid grey'],
	['#4a4a4a', 'gray', 'dark grey'],
	['#c0c0c0', 'gray', 'silver'],
	['#708090', 'gray', 'slate gray'],
	['#8b8680', 'gray', 'warm gray, tiny chroma'],
	['#36454f', 'gray', 'charcoal'],
	['#fafafa', 'white', 'near white'],
	['#f0f0f0', 'white', 'near white'],
	// oranges, yellows
	['#ffa500', 'orange', 'css orange'],
	['#ffd700', 'yellow', 'gold'],
	['#f97316', 'orange', 'tailwind orange'],
	['#facc15', 'yellow', 'tailwind yellow'],
	['#8b4513', 'brown', 'saddle brown'],
]

check(`samples: ${SAMPLES.length} colours get the name a designer would give`, () => {
	ok(SAMPLES.length >= 50, 'need at least 50 samples')
	const misses = []
	for (const [hex, expected, why] of SAMPLES) {
		const got = nameColor(hex)
		if (got !== expected) misses.push(`${hex} (${why}) wanted ${expected}, got ${got}`)
	}
	if (misses.length) throw new Error(`\n    ${misses.join('\n    ')}`)
})

// One check per sample would drown the output; instead group by the spec's tricky areas.
const GROUPS = {
	'pure primaries': ['#ff0000', '#00ff00', '#0000ff', '#ffff00'],
	'skin tones never pink or red': [
		'#ffdbac',
		'#f1c27d',
		'#e0ac69',
		'#c68642',
		'#8d5524',
		'#6b4226',
		'#4a2f1d',
		'#f3c9a8',
		'#e8b896',
		'#ffcd94',
		'#d9a066',
		'#bf8f6a',
		'#a0674a',
		'#e5b887',
		'#c99a73',
	],
}
for (const [group, list] of Object.entries(GROUPS)) {
	check(`group: ${group}`, () => {
		for (const hex of list) {
			const name = nameColor(hex)
			if (group.startsWith('skin'))
				ok(['beige', 'brown', 'orange'].includes(name), `${hex} named ${name}`)
		}
	})
}

check('near-white pastels are never a hue name (random pastels)', () => {
	const rand = mulberry(11)
	for (let i = 0; i < 3000; i++) {
		const hue = rand() * 360
		const s = rand() * 0.08
		const v = 0.96 + rand() * 0.04
		const [r, g, b] = hsv(hue, s, v)
		const name = nameColor(rgbToHex(r, g, b))
		ok(name === 'white' || name === 'beige', `${rgbToHex(r, g, b)} -> ${name}`)
	}
})

check('any very desaturated colour is gray, black or white (never a hue)', () => {
	const rand = mulberry(7)
	for (let i = 0; i < 4000; i++) {
		const hue = rand() * 360
		const s = rand() * 0.03
		const v = rand()
		const [r, g, b] = hsv(hue, s, v)
		const name = nameColor(rgbToHex(r, g, b))
		ok(NEUTRAL_COLORS.has(name), `${rgbToHex(r, g, b)} -> ${name}`)
	}
})

check('every grey from 0x20 to 0xe0 is gray', () => {
	for (let v = 0x20; v <= 0xe0; v++) {
		const hex = rgbToHex(v, v, v)
		same(nameColor(hex), 'gray', hex)
	}
})

check('near-black greys are black and near-white greys are white', () => {
	for (let v = 0; v <= 0x18; v++) same(nameColor(rgbToHex(v, v, v)), 'black', `grey ${v}`)
	for (let v = 0xec; v <= 0xff; v++) same(nameColor(rgbToHex(v, v, v)), 'white', `grey ${v}`)
})

check('the grey ramp is monotonic: black, then gray, then white, no other name', () => {
	const seen = []
	for (let v = 0; v <= 255; v++) {
		const name = nameColor(rgbToHex(v, v, v))
		if (seen[seen.length - 1] !== name) seen.push(name)
	}
	same(seen, ['black', 'gray', 'white'])
})

check('a hue sweep at full saturation walks the wheel in order', () => {
	const run = []
	for (let hue = 0; hue < 360; hue += 2) {
		const [r, g, b] = hsv(hue, 1, 1)
		const name = nameColor(rgbToHex(r, g, b))
		ok(!NEUTRAL_COLORS.has(name), `hue ${hue} named ${name}`)
		if (run[run.length - 1] !== name) run.push(name)
	}
	// Wraps back to red at the end.
	if (run.length > 1 && run[0] === run[run.length - 1]) run.pop()
	const order = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']
	let cursor = -1
	for (const name of run) {
		const index = order.indexOf(name)
		ok(index > cursor, `hue order broke at ${name} in ${run.join(' > ')}`)
		cursor = index
	}
	for (const name of ['red', 'yellow', 'green', 'teal', 'blue', 'purple'])
		ok(run.includes(name), `${name} missing from sweep ${run.join(' > ')}`)
	const anchors = { 0: 'red', 30: 'orange', 60: 'yellow', 120: 'green', 180: 'teal', 240: 'blue' }
	for (const [hue, expected] of Object.entries(anchors)) {
		const [r, g, b] = hsv(Number(hue), 1, 1)
		same(nameColor(rgbToHex(r, g, b)), expected, `hue ${hue}`)
	}
})

check('darkening a hue keeps its family (value ramp at full saturation)', () => {
	const expectations = [
		[0, ['red', 'brown', 'black']],
		[120, ['green', 'black']],
		[240, ['blue', 'navy', 'black']],
		[60, ['yellow', 'green', 'brown', 'beige', 'black']],
	]
	for (const [hue, allowed] of expectations) {
		for (let v = 0.05; v <= 1; v += 0.05) {
			const [r, g, b] = hsv(hue, 1, v)
			const name = nameColor(rgbToHex(r, g, b))
			ok(allowed.includes(name), `hue ${hue} v ${v.toFixed(2)} -> ${name}`)
		}
	}
})

check('nameColor ignores case, # and 3-digit shorthand', () => {
	same(nameColor('#ABC'), nameColor('aabbcc'))
	same(nameColor('F00'), 'red')
	same(nameColor('#0F0'), 'green')
	same(nameColor('  #00F  '), 'blue')
	same(nameColor('#FFFFFF'), 'white')
})

check('nameColor is deterministic and pure', () => {
	for (const hex of ['#123456', '#fedcba', '#a1b2c3', '#777788']) {
		const first = nameColor(hex)
		for (let i = 0; i < 5; i++) same(nameColor(hex), first, hex)
	}
})

check('nameColor always returns a canonical name, even for hostile input', () => {
	const hostile = [
		'',
		' ',
		'#',
		'zzzzzz',
		'#ggg',
		'not a colour',
		'#12',
		'#12345',
		'#1234567',
		'#12345678',
		'rgb(1,2,3)',
		'red',
		'\u0000',
		'#fff\u0000',
		'__proto__',
		'constructor',
		'a'.repeat(100000),
		'#' + 'f'.repeat(100000),
		null,
		undefined,
		42,
		{},
		[],
		() => 1,
		Symbol.iterator.toString(),
		NaN,
	]
	for (const input of hostile) {
		let name
		try {
			name = nameColor(input)
		} catch (error) {
			throw new Error(`threw on ${String(input).slice(0, 20)}: ${error.message}`)
		}
		ok(NAME_SET.has(name), `${String(input).slice(0, 20)} -> ${name}`)
	}
})

check('nameColor on invalid input names it gray (documented fallback)', () => {
	same(nameColor('nonsense'), 'gray')
	same(nameColor(''), 'gray')
})

/* -------------------------------------------------------------------------- */
/* hexToRgb / rgbToHex                                                        */
/* -------------------------------------------------------------------------- */

check('hexToRgb: six digit, with and without #, any case', () => {
	same(hexToRgb('#0197f6'), [1, 151, 246])
	same(hexToRgb('0197f6'), [1, 151, 246])
	same(hexToRgb('#0197F6'), [1, 151, 246])
	same(hexToRgb('0197F6'), [1, 151, 246])
	same(hexToRgb('#000000'), [0, 0, 0])
	same(hexToRgb('#ffffff'), [255, 255, 255])
	same(hexToRgb('#FfFfFf'), [255, 255, 255])
})

check('hexToRgb: three digit shorthand expands each digit', () => {
	same(hexToRgb('#abc'), [170, 187, 204])
	same(hexToRgb('abc'), [170, 187, 204])
	same(hexToRgb('#ABC'), [170, 187, 204])
	same(hexToRgb('#fff'), [255, 255, 255])
	same(hexToRgb('#000'), [0, 0, 0])
	same(hexToRgb('#f00'), [255, 0, 0])
	same(hexToRgb('#123'), [0x11, 0x22, 0x33])
})

check('hexToRgb: surrounding whitespace is ignored', () => {
	same(hexToRgb('  #abc  '), [170, 187, 204])
	same(hexToRgb('\n#aabbcc\t'), [170, 187, 204])
})

check('hexToRgb: invalid input gives null', () => {
	const bad = [
		'',
		' ',
		'#',
		'##fff',
		'#ff',
		'#ffff',
		'#fffff',
		'#fffffff',
		'#ffffffff',
		'ffffffff',
		'#ggg',
		'#gggggg',
		'#12345g',
		'zzz',
		'blue',
		'rgb(0,0,0)',
		'#fff #fff',
		'# fff',
		'#ff ff ff',
		'0xfff',
		'0xffffff',
		'#fff\u0000',
		'\u0000#fff',
		'#ff\nf',
		'#ﬀf',
		'#ｆｆｆ',
		'-fff',
		'+fff',
		'#1e3',
		' # ',
		'a'.repeat(5000),
		null,
		undefined,
		0,
		255,
		0xffffff,
		true,
		{},
		[],
		['#fff'],
		{ toString: () => '#fff' },
		() => '#fff',
	]
	for (const input of bad) {
		const got = hexToRgb(input)
		// `#1e3` is valid shorthand; it sits in the list only to prove the digit
		// check is hex, not decimal. Handle it here rather than hide it.
		if (input === '#1e3') same(got, [0x11, 0xee, 0x33], '#1e3')
		else same(got, null, JSON.stringify(String(input).slice(0, 30)))
	}
})

check('hexToRgb never throws, and always returns null or three 0..255 integers', () => {
	const rand = mulberry(3)
	const alphabet = '0123456789abcdefABCDEFgG# -xé\u0000'
	for (let i = 0; i < 20000; i++) {
		let text = ''
		const length = Math.floor(rand() * 9)
		for (let j = 0; j < length; j++) text += alphabet[Math.floor(rand() * alphabet.length)]
		const got = hexToRgb(text)
		if (got === null) continue
		ok(HEX_RE.test(text.trim()), `accepted ${JSON.stringify(text)}`)
		ok(got.length === 3 && got.every((n) => Number.isInteger(n) && n >= 0 && n <= 255), 'range')
	}
})

check('rgbToHex: lowercase #rrggbb, zero padded', () => {
	same(rgbToHex(1, 151, 246), '#0197f6')
	same(rgbToHex(0, 0, 0), '#000000')
	same(rgbToHex(255, 255, 255), '#ffffff')
	same(rgbToHex(0, 5, 10), '#00050a')
	same(rgbToHex(171, 205, 239), '#abcdef')
})

check('rgbToHex: rounds, clamps and survives NaN and infinities', () => {
	same(rgbToHex(0.4, 0.6, 254.5), '#0001ff')
	same(rgbToHex(-5, -0.4, -1e9), '#000000')
	same(rgbToHex(256, 300, 1e9), '#ffffff')
	same(rgbToHex(Number.NaN, Number.NaN, Number.NaN), '#000000')
	same(rgbToHex(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0), '#ff0000')
	same(rgbToHex(undefined, null, '12'), '#00000c')
})

check('hexToRgb and rgbToHex round trip over a dense lattice', () => {
	for (let r = 0; r < 256; r += 5)
		for (let g = 0; g < 256; g += 5)
			for (let b = 0; b < 256; b += 5) {
				const hex = rgbToHex(r, g, b)
				ok(/^#[0-9a-f]{6}$/.test(hex), hex)
				same(hexToRgb(hex), [r, g, b], hex)
				same(hexToRgb(hex.toUpperCase()), [r, g, b], hex)
				same(hexToRgb(hex.slice(1)), [r, g, b], hex)
			}
})

check('hexToRgb and rgbToHex round trip every value of every channel', () => {
	for (let v = 0; v < 256; v++) {
		same(hexToRgb(rgbToHex(v, 0, 0)), [v, 0, 0])
		same(hexToRgb(rgbToHex(0, v, 0)), [0, v, 0])
		same(hexToRgb(rgbToHex(0, 0, v)), [0, 0, v])
	}
})

check('rgbToHex then hexToRgb round trips random colours', () => {
	const rand = mulberry(99)
	for (let i = 0; i < 5000; i++) {
		const rgb = [rand() * 256, rand() * 256, rand() * 256].map((n) => Math.floor(n))
		same(hexToRgb(rgbToHex(...rgb)), rgb)
	}
})

check('3-digit hex round trips through the 6-digit form', () => {
	for (let n = 0; n < 4096; n++) {
		const short = n.toString(16).padStart(3, '0')
		const long = short[0] + short[0] + short[1] + short[1] + short[2] + short[2]
		same(hexToRgb(`#${short}`), hexToRgb(`#${long}`), short)
		same(rgbToHex(...hexToRgb(short)), `#${long}`, short)
	}
})

/* -------------------------------------------------------------------------- */
/* resolveColorName                                                           */
/* -------------------------------------------------------------------------- */

check('resolveColorName: exact names, any case and padding', () => {
	for (const name of NAMES) {
		same(resolveColorName(name), name)
		same(resolveColorName(name.toUpperCase()), name)
		same(resolveColorName(`  ${name}\t`), name)
		same(resolveColorName(name[0].toUpperCase() + name.slice(1)), name)
	}
})

check('resolveColorName: aliases, including spaced and hyphenated spellings', () => {
	same(resolveColorName('grey'), 'gray')
	same(resolveColorName('GREY'), 'gray')
	same(resolveColorName(' Grey '), 'gray')
	for (const [alias, target] of Object.entries(COLOR_ALIASES)) {
		same(resolveColorName(alias), target, alias)
		same(resolveColorName(alias.toUpperCase()), target, alias)
	}
	same(resolveColorName('sky blue'), 'blue')
	same(resolveColorName('Sky-Blue'), 'blue')
	same(resolveColorName('sky_blue'), 'blue')
	same(resolveColorName('hot pink'), 'pink')
	same(resolveColorName('navy blue'), 'navy')
	same(resolveColorName('light grey'), 'gray')
	same(resolveColorName('dark   green'), 'green')
})

check('resolveColorName: unique prefixes resolve, ambiguous ones give null (every prefix of every name)', () => {
	for (const name of NAMES) {
		for (let length = 1; length <= name.length; length++) {
			const prefix = name.slice(0, length)
			ok(!HEX_RE.test(prefix), `prefix ${prefix} is also hex; resolver would be ambiguous`)
			const owners = NAMES.filter((other) => other.startsWith(prefix))
			const expected = owners.length === 1 ? owners[0] : null
			same(resolveColorName(prefix), expected, `prefix ${prefix}`)
			same(resolveColorName(prefix.toUpperCase()), expected, `prefix ${prefix} upper`)
		}
	}
})

check('resolveColorName: the named examples', () => {
	same(resolveColorName('pur'), 'purple')
	same(resolveColorName('pu'), 'purple')
	same(resolveColorName('pi'), 'pink')
	same(resolveColorName('bl'), null)
	same(resolveColorName('blu'), 'blue')
	same(resolveColorName('bla'), 'black')
	same(resolveColorName('b'), null)
	same(resolveColorName('p'), null)
	same(resolveColorName('gr'), null)
	same(resolveColorName('gre'), 'green')
	same(resolveColorName('gra'), 'gray')
	same(resolveColorName('gree'), 'green')
	same(resolveColorName('br'), 'brown')
	same(resolveColorName('be'), 'beige')
	same(resolveColorName('w'), 'white')
	same(resolveColorName('y'), 'yellow')
	same(resolveColorName('o'), 'orange')
	same(resolveColorName('t'), 'teal')
	same(resolveColorName('n'), 'navy')
	same(resolveColorName('r'), 'red')
})

check('resolveColorName: a prefix longer than the name is not a match', () => {
	same(resolveColorName('redd'), null)
	same(resolveColorName('blues'), null)
	same(resolveColorName('purplee'), null)
})

check('resolveColorName: hex input, with and without #, 3 and 6 digits', () => {
	same(resolveColorName('#0197f6'), 'blue')
	same(resolveColorName('0197f6'), 'blue')
	same(resolveColorName('#0197F6'), 'blue')
	same(resolveColorName('#f00'), 'red')
	same(resolveColorName('f00'), 'red')
	same(resolveColorName('#7a4a1e'), 'brown')
	same(resolveColorName('#f4ecd8'), 'beige')
	same(resolveColorName('#808080'), 'gray')
	same(resolveColorName('808080'), 'gray')
	same(resolveColorName('#fff'), 'white')
	same(resolveColorName('#000'), 'black')
	same(resolveColorName('  #0a1a3a '), 'navy')
	same(resolveColorName('#abc'), nameColor('#aabbcc'))
	same(resolveColorName('abc'), nameColor('#aabbcc'))
})

check('resolveColorName: a bare hex-looking word is hex (documented): bed, fee, beaded', () => {
	same(resolveColorName('bed'), nameColor('#bbeedd'))
	same(resolveColorName('fee'), nameColor('#ffeeee'))
	same(resolveColorName('beaded'), nameColor('#beaded'))
	same(resolveColorName('decade'), nameColor('#decade'))
})

check('resolveColorName: every swatch hex resolves to its own name', () => {
	for (const color of NAMED_COLORS) {
		same(resolveColorName(color.hex), color.name)
		same(resolveColorName(color.hex.slice(1)), color.name)
	}
})

check('resolveColorName: junk gives null', () => {
	const junk = [
		'',
		' ',
		'   \t\n',
		'#',
		'##fff',
		'xyz',
		'qwerty',
		'color:blue',
		'blue green',
		'red,blue',
		'rgb(1,2,3)',
		'#ggg',
		'#12',
		'#12345',
		'#1234567',
		'#ffffffff',
		'12',
		'1234',
		'123456789',
		'blue!',
		'bl ue',
		'-',
		'_',
		'.*',
		'^red$',
		'(',
		'[a-z]',
		'\\',
		'\u0000',
		'blue\u0000',
		'é',
		'ＢＬＵＥ',
		'ｂｌｕｅ',
		'blüe',
		'🙂',
		'a'.repeat(10000),
		'blue'.repeat(1000),
		'#' + 'f'.repeat(10000),
		null,
		undefined,
		0,
		42,
		true,
		{},
		[],
		['blue'],
		{ toString: () => 'blue' },
		() => 'blue',
		NaN,
	]
	for (const input of junk) {
		let got
		try {
			got = resolveColorName(input)
		} catch (error) {
			throw new Error(`threw on ${JSON.stringify(String(input).slice(0, 20))}: ${error.message}`)
		}
		same(got, null, JSON.stringify(String(input).slice(0, 20)))
	}
})

check('resolveColorName: object-prototype keys do not resolve', () => {
	const keys = [
		'constructor',
		'__proto__',
		'prototype',
		'toString',
		'valueOf',
		'hasOwnProperty',
		'isPrototypeOf',
		'__defineGetter__',
		'__lookupGetter__',
		'toLocaleString',
		'propertyIsEnumerable',
	]
	for (const key of keys) {
		same(resolveColorName(key), null, key)
		same(resolveColorName(key.toUpperCase()), null, key.toUpperCase())
		same(isColorName(key), false, `isColorName ${key}`)
		same(swatchFor(key), undefined, `swatchFor ${key}`)
	}
})

check('resolveColorName: results are always canonical names or null', () => {
	const rand = mulberry(5)
	const alphabet = 'abcdefghijklmnopqrstuvwxyz #-_0123456789ABCDEF'
	for (let i = 0; i < 20000; i++) {
		let text = ''
		const length = Math.floor(rand() * 8)
		for (let j = 0; j < length; j++) text += alphabet[Math.floor(rand() * alphabet.length)]
		const got = resolveColorName(text)
		ok(got === null || NAME_SET.has(got), `${JSON.stringify(text)} -> ${got}`)
	}
})

check('resolveColorName is idempotent on its own output', () => {
	for (const input of ['grey', 'pur', '#0197f6', 'Sky Blue', 'f00', 'br', 'cream']) {
		const first = resolveColorName(input)
		ok(first !== null, input)
		same(resolveColorName(first), first, input)
	}
})

/* -------------------------------------------------------------------------- */
/* isColorName / swatchFor                                                    */
/* -------------------------------------------------------------------------- */

check('isColorName: only canonical lowercase names', () => {
	for (const name of NAMES) same(isColorName(name), true, name)
	for (const bad of ['grey', 'Blue', 'BLUE', ' blue', 'blue ', '', 'bl', '#fff', 'sky blue', 'blu'])
		same(isColorName(bad), false, JSON.stringify(bad))
	for (const bad of [null, undefined, 0, {}, [], ['blue']]) same(isColorName(bad), false)
})

check('swatchFor: the NAMED_COLORS hex, undefined for anything else', () => {
	for (const color of NAMED_COLORS) same(swatchFor(color.name), color.hex)
	for (const bad of ['grey', 'Blue', '', 'nope', '#fff', null, undefined, 3, {}])
		same(swatchFor(bad), undefined, JSON.stringify(bad))
})

/* -------------------------------------------------------------------------- */
/* The 16 x 16 x 16 sweep                                                     */
/* -------------------------------------------------------------------------- */

const wins = Object.fromEntries(NAMES.map((name) => [name, 0]))
const examples = Object.fromEntries(NAMES.map((name) => [name, []]))
let sweepSeconds = 0

check('sweep: 4096 grid colours, nothing throws, every name is non-empty and canonical', () => {
	const started = performance.now()
	let count = 0
	for (let r = 0; r < 16; r++)
		for (let g = 0; g < 16; g++)
			for (let b = 0; b < 16; b++) {
				const hex = rgbToHex(r * 17, g * 17, b * 17)
				const name = nameColor(hex)
				ok(typeof name === 'string' && name.length > 0, `${hex} gave an empty name`)
				ok(NAME_SET.has(name), `${hex} gave ${name}`)
				wins[name]++
				if (examples[name].length < 6) examples[name].push(hex)
				count++
			}
	sweepSeconds = (performance.now() - started) / 1000
	same(count, 4096)
	same(Object.values(wins).reduce((a, b) => a + b, 0), 4096, 'every colour counted once')
})

check('sweep: every name wins at least once', () => {
	const never = NAMES.filter((name) => wins[name] === 0)
	same(never, [], 'names that never win')
})

check('sweep: the extremes land where they should', () => {
	same(nameColor('#000000'), 'black')
	same(nameColor('#ffffff'), 'white')
	ok(wins.black >= 1 && wins.white >= 1, 'black and white must win')
})

check('sweep: no name swallows the grid (each wins under 40 percent)', () => {
	for (const name of NAMES) ok(wins[name] < 4096 * 0.4, `${name} wins ${wins[name]}`)
})

check('sweep: the 16 grid greys are black, gray or white in order', () => {
	const seen = []
	for (let i = 0; i < 16; i++) {
		const name = nameColor(rgbToHex(i * 17, i * 17, i * 17))
		if (seen[seen.length - 1] !== name) seen.push(name)
	}
	same(seen, ['black', 'gray', 'white'])
})

check('sweep: nameColor is fast enough to run per pixel cluster (4096 calls under 1 s)', () => {
	ok(sweepSeconds < 1, `${sweepSeconds.toFixed(3)} s`)
})

check('purity: no file system, network or global state is touched by naming', () => {
	const before = JSON.stringify(wins)
	for (let i = 0; i < 100; i++) nameColor('#123456')
	same(JSON.stringify(wins), before)
	const source = fs.readFileSync(path.join(ROOT, 'src/lib/media/colors.ts'), 'utf8')
	ok(!/^\s*import\s/m.test(source), 'colors.ts must have no imports')
	ok(!/server-only|mongodb|sharp|next\//.test(source.replace(/\/\*[\s\S]*?\*\//g, '')), 'client unsafe reference')
})

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

console.log('\nWins per name over the 16 x 16 x 16 grid (4096 colours):')
for (const name of NAMES)
	console.log(
		`  ${name.padEnd(7)} ${String(wins[name]).padStart(5)}  ${(
			(wins[name] / 4096) *
			100
		)
			.toFixed(1)
			.padStart(5)}%  e.g. ${examples[name].join(' ')}`,
	)
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Small deterministic PRNG so a failure is reproducible. */
function mulberry(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** HSV (degrees, 0..1, 0..1) -> [r, g, b] in 0..255. */
function hsv(h, s, v) {
	const c = v * s
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
	const m = v - c
	let rgb
	if (h < 60) rgb = [c, x, 0]
	else if (h < 120) rgb = [x, c, 0]
	else if (h < 180) rgb = [0, c, x]
	else if (h < 240) rgb = [0, x, c]
	else if (h < 300) rgb = [x, 0, c]
	else rgb = [c, 0, x]
	return rgb.map((n) => Math.round((n + m) * 255))
}
