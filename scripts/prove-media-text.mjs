/**
 * Proves the media library's text foundations against the REAL source:
 * src/lib/media/text.ts (normalisation, Porter stemmer, index tokens),
 * terms.ts (the per-asset search index) and filename-tags.ts.
 *
 * Expected values are derived from the specification (Porter's 1980 paper, the
 * stub doc comments, the build spec), never copied from what the code printed.
 * Pure: no database, no network.
 *
 *   node scripts/prove-media-text.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { loadTs } = require('./lib/load-ts.cjs')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const text = loadTs('src/lib/media/text.ts')
const terms = loadTs('src/lib/media/terms.ts')
const filename = loadTs('src/lib/media/filename-tags.ts')
const types = loadTs('src/lib/media/types.ts')

const {
	STOPWORDS,
	normalizeText,
	splitWords,
	slugify,
	cleanLabel,
	clampText,
	escapeRegex,
	stem,
	indexTokens,
	indexTokenSets,
} = text
const { fieldTexts, fieldTokens, buildTerms, derivedFields, FIELD_KEYS } = terms
const { filenameTags } = filename
const { MEDIA_LIMITS, MEDIA_TERMS_VERSION } = types

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0

const show = (value) => {
	const out = JSON.stringify(value)
	return out === undefined ? String(value) : out.length > 300 ? `${out.slice(0, 300)}...` : out
}

const same = (actual, expected, label = '') => {
	const a = JSON.stringify(actual)
	const b = JSON.stringify(expected)
	if (a !== b) throw new Error(`${label}expected ${show(expected)}, got ${show(actual)}`)
}
const ok = (condition, message) => {
	if (!condition) throw new Error(message)
}

/** One named check. */
function check(name, fn) {
	try {
		fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${String(error?.message ?? error).split('\n')[0]})`)
	}
}

/** A table of rows; every row is one assertion. Prints one line, lists failing rows. */
function table(name, rows, fn) {
	const bad = []
	for (const row of rows) {
		try {
			fn(...row)
			passed++
		} catch (error) {
			failed++
			bad.push(`${show(row[0])}: ${String(error?.message ?? error).split('\n')[0]}`)
		}
	}
	if (bad.length) console.log(`FAIL  ${name} (${bad.length}/${rows.length} rows) ${bad.slice(0, 6).join(' | ')}`)
	else console.log(`PASS  ${name} (${rows.length} rows)`)
}

// Deterministic randomness, so a failure reproduces.
function prng(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const cps = (value) => Array.from(value).length
const hasLoneSurrogate = (value) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(value)

/* -------------------------------------------------------------------------- */
/* 0. Purity: client safe, no node or server imports                          */
/* -------------------------------------------------------------------------- */

check('purity: the three modules import only local files (no server-only, mongodb, next, node:)', () => {
	for (const file of ['text.ts', 'terms.ts', 'filename-tags.ts']) {
		const source = fs.readFileSync(path.join(ROOT, 'src/lib/media', file), 'utf8')
		const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)]
		for (const [, isType, from] of imports) {
			if (isType) continue
			ok(from.startsWith('./'), `${file} imports ${from}`)
		}
		ok(!/server-only|node:|require\(/.test(source), `${file} mentions a server or node api`)
		ok(!/process\.|Buffer|fs\./.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), `${file} uses a node global`)
	}
})

/* -------------------------------------------------------------------------- */
/* 1. Porter stemmer                                                          */
/* -------------------------------------------------------------------------- */

// Final stems for the examples in Porter (1980), "An algorithm for suffix stripping",
// worked by hand through steps 1a to 5b with the original rule table.
const PAPER = [
	// step 1a
	['caresses', 'caress'],
	['ponies', 'poni'],
	['ties', 'ti'],
	['caress', 'caress'],
	['cats', 'cat'],
	// step 1b
	['feed', 'feed'],
	['agreed', 'agre'],
	['plastered', 'plaster'],
	['bled', 'bled'],
	['motoring', 'motor'],
	['sing', 'sing'],
	['conflated', 'conflat'],
	['troubled', 'troubl'],
	['sized', 'size'],
	['hopping', 'hop'],
	['tanned', 'tan'],
	['falling', 'fall'],
	['hissing', 'hiss'],
	['fizzed', 'fizz'],
	['failing', 'fail'],
	['filing', 'file'],
	// step 1c
	['happy', 'happi'],
	['sky', 'sky'],
	// step 2
	['relational', 'relat'],
	['conditional', 'condit'],
	['rational', 'ration'],
	['valenci', 'valenc'],
	['hesitanci', 'hesit'],
	['digitizer', 'digit'],
	['conformabli', 'conform'],
	['radicalli', 'radic'],
	['differentli', 'differ'],
	['vileli', 'vile'],
	['analogousli', 'analog'],
	['vietnamization', 'vietnam'],
	['predication', 'predic'],
	['operator', 'oper'],
	['feudalism', 'feudal'],
	['decisiveness', 'decis'],
	['hopefulness', 'hope'],
	['callousness', 'callous'],
	['formaliti', 'formal'],
	['sensitiviti', 'sensit'],
	['sensibiliti', 'sensibl'],
	// step 3
	['triplicate', 'triplic'],
	['formative', 'form'],
	['formalize', 'formal'],
	['electriciti', 'electr'],
	['electrical', 'electr'],
	['hopeful', 'hope'],
	['goodness', 'good'],
	// step 4
	['revival', 'reviv'],
	['allowance', 'allow'],
	['inference', 'infer'],
	['airliner', 'airlin'],
	['gyroscopic', 'gyroscop'],
	['adjustable', 'adjust'],
	['defensible', 'defens'],
	['irritant', 'irrit'],
	['replacement', 'replac'],
	['adjustment', 'adjust'],
	['dependent', 'depend'],
	['adoption', 'adopt'],
	['homologou', 'homolog'],
	['communism', 'commun'],
	['activate', 'activ'],
	['angulariti', 'angular'],
	['homologous', 'homolog'],
	['effective', 'effect'],
	['bowdlerize', 'bowdler'],
	// step 5
	['probate', 'probat'],
	['rate', 'rate'],
	['cease', 'ceas'],
	['controll', 'control'],
	['roll', 'roll'],
	// whole chains
	['generalizations', 'gener'],
	['oscillators', 'oscil'],
]

check('porter: paper sample has at least 60 pairs', () => ok(PAPER.length >= 60, `only ${PAPER.length}`))
table('porter: canonical pairs from the 1980 paper', PAPER, (word, expected) =>
	same(stem(word), expected),
)

// Worked by hand for the vocabulary of the businesses this library serves.
const DOMAIN = [
	['kitchen', 'kitchen'],
	['kitchens', 'kitchen'],
	['remodeling', 'remodel'],
	['remodeled', 'remodel'],
	['remodel', 'remodel'],
	['trucks', 'truck'],
	['plumbing', 'plumb'],
	['plumber', 'plumber'],
	['plumbers', 'plumber'],
	['painted', 'paint'],
	['painting', 'paint'],
	['painter', 'painter'],
	['bathrooms', 'bathroom'],
	['bathroom', 'bathroom'],
	['roofing', 'roof'],
	['roofs', 'roof'],
	['roofer', 'roofer'],
	['flooring', 'floor'],
	['floors', 'floor'],
	['siding', 'side'],
	['side', 'side'],
	['gutters', 'gutter'],
	['windows', 'window'],
	['doors', 'door'],
	['vans', 'van'],
	['vehicles', 'vehicl'],
	['electricians', 'electrician'],
	['electrical', 'electr'],
	['repairs', 'repair'],
	['repairing', 'repair'],
	['repaired', 'repair'],
	['installation', 'instal'],
	['installed', 'instal'],
	['installer', 'instal'],
	['cleaning', 'clean'],
	['cleaners', 'cleaner'],
	['landscaping', 'landscap'],
	['landscape', 'landscap'],
	['landscapes', 'landscap'],
	['lighting', 'light'],
	['lighted', 'light'],
	['paving', 'pave'],
	['pavers', 'paver'],
	['concrete', 'concret'],
	['decks', 'deck'],
	['decking', 'deck'],
	['fences', 'fenc'],
	['fencing', 'fenc'],
	['renovations', 'renov'],
	['renovating', 'renov'],
	['renovated', 'renov'],
	['before', 'befor'],
	['after', 'after'],
	['completed', 'complet'],
	['projects', 'project'],
	['services', 'servic'],
	['commercial', 'commerci'],
	['residential', 'residenti'],
	['emergency', 'emerg'],
	['company', 'compani'],
	['banner', 'banner'],
	['heroes', 'hero'],
	['cabinets', 'cabinet'],
	['cabinetry', 'cabinetri'],
	['countertops', 'countertop'],
	['tiles', 'tile'],
	['tiling', 'tile'],
	['tiled', 'tile'],
	['appliances', 'applianc'],
	['generators', 'gener'],
	['insulation', 'insul'],
	['gardening', 'garden'],
	['gardener', 'garden'],
	['photography', 'photographi'],
	['photographer', 'photograph'],
	['builders', 'builder'],
	['building', 'build'],
]
check('porter: at least 40 domain words', () => ok(DOMAIN.length >= 40, `only ${DOMAIN.length}`))
table('porter: domain words', DOMAIN, (word, expected) => same(stem(word), expected))

check('porter: inflections of one word share a stem', () => {
	for (const group of [
		['remodel', 'remodels', 'remodeled', 'remodeling'],
		['truck', 'trucks', 'trucking', 'trucked'],
		['paint', 'paints', 'painted', 'painting'],
		['tile', 'tiles', 'tiled', 'tiling'],
		['fence', 'fences', 'fencing', 'fenced'],
		['siding', 'side', 'sides', 'sided'],
		['renovate', 'renovated', 'renovating', 'renovation', 'renovations'],
		['landscape', 'landscaping', 'landscapes', 'landscaped'],
	]) {
		const stems = new Set(group.map(stem))
		ok(stems.size === 1, `${group.join('/')} -> ${[...stems].join(',')}`)
	}
})

table(
	'porter: anything that is not lowercase a-z, or is two characters or fewer, is unchanged',
	[
		['2024'],
		['4k'],
		['iphone15'],
		['h2o'],
		['Trucks'],
		['TRUCKS'],
		['trucks!'],
		['truck s'],
		['日本料理'],
		['Фотографии'],
		['café'],
		['straße'],
		[''],
		['a'],
		['is'],
		['as'],
		['ss'],
		['us'],
		['ed'],
		['ies'.slice(0, 2)],
		['tv'],
		['__proto__'],
		['\u0000'],
		['🔥🔥🔥'],
	],
	(word) => same(stem(word), word),
)

check('porter: non-string input comes back as given and never throws', () => {
	for (const value of [undefined, null, 5, {}, [], true]) same(stem(value), value)
})

check('porter: three-letter words that are only a suffix keep a non-empty stem', () => {
	for (const word of ['ing', 'ies', 'eed', 'sss', 'ess', 'ful', 'ive', 'ize', 'ous', 'ion', 'ant', 'ent', 'ism', 'iti', 'ate', 'ence', 'ance', 'ness', 'sses', 'ement', 'ment', 'able', 'ible', 'ational', 'tional'])
		ok(stem(word).length > 0, `${word} -> empty`)
})

check('porter: rules apply to the longest suffix only (rational is not retried as tional)', () => {
	same(stem('rational'), 'ration')
	// element: ement matches, m("el") = 1 fails, and ment/ent are not tried
	same(stem('element'), 'element')
})

check('porter: deterministic, even across a fresh load of the module', () => {
	const words = PAPER.map(([w]) => w).concat(DOMAIN.map(([w]) => w))
	const first = words.map(stem)
	same(words.map(stem), first)
	const fresh = require('./lib/load-ts.cjs')
	fresh.clearCache()
	const again = fresh.loadTs('src/lib/media/text.ts')
	same(words.map(again.stem), first)
})

check('porter: 20,000 random a-z words never throw, stay non-empty, a-z, never longer, deterministic', () => {
	const rand = prng(7)
	const alphabet = 'abcdefghijklmnopqrstuvwxyz'
	const suffixes = ['', 's', 'es', 'ed', 'ing', 'ly', 'y', 'ness', 'ful', 'ation', 'ization', 'ational', 'ement', 'able', 'ible', 'ous', 'ive', 'ize', 'iti', 'eed', 'll', 'e']
	for (let i = 0; i < 20000; i++) {
		let word = ''
		const length = 1 + Math.floor(rand() * 10)
		for (let c = 0; c < length; c++) word += alphabet[Math.floor(rand() * 26)]
		word += suffixes[Math.floor(rand() * suffixes.length)]
		const out = stem(word)
		ok(typeof out === 'string' && out.length > 0, `${word} -> ${show(out)}`)
		ok(/^[a-z]+$/.test(out), `${word} -> ${out}`)
		ok(out.length <= word.length, `${word} -> ${out} grew`)
		ok(stem(word) === out, `${word} not deterministic`)
	}
})

check('porter: hostile long words (100,000 y or a, alternating) finish fast with no stack overflow', () => {
	const started = Date.now()
	for (const word of ['y'.repeat(100000), 'a'.repeat(100000), 'ya'.repeat(50000), `${'b'.repeat(50000)}ing`, `${'x'.repeat(50000)}ization`]) {
		ok(typeof stem(word) === 'string', 'not a string')
	}
	ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`)
})

/* -------------------------------------------------------------------------- */
/* 2. STOPWORDS                                                               */
/* -------------------------------------------------------------------------- */

check('stopwords: a ReadonlySet of lowercase a-z function words, a sensible size', () => {
	ok(STOPWORDS instanceof Set, 'not a Set')
	ok(STOPWORDS.size >= 80 && STOPWORDS.size <= 250, `size ${STOPWORDS.size}`)
	for (const word of STOPWORDS) ok(/^[a-z]+$/.test(word), `bad entry ${show(word)}`)
})

check('stopwords: articles, prepositions, pronouns, auxiliaries and conjunctions are present', () => {
	for (const word of ['a', 'an', 'the', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'to', 'from', 'i', 'you', 'we', 'they', 'it', 'he', 'she', 'my', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'have', 'has', 'had', 'will', 'would', 'should', 'and', 'or', 'but', 'if', 'as', 'at', 'am'])
		ok(STOPWORDS.has(word), `${word} should be a stopword`)
})

check('stopwords: words that carry meaning in image search are NOT stopwords', () => {
	for (const word of ['before', 'after', 'new', 'top', 'over', 'under', 'up', 'down', 'out', 'off', 'front', 'back', 'side', 'inside', 'outside', 'no', 'not'])
		ok(!STOPWORDS.has(word), `${word} must not be a stopword`)
})

check('stopwords: nouns and adjectives people search for are not stopwords', () => {
	for (const word of ['kitchen', 'truck', 'van', 'light', 'dark', 'red', 'logo', 'hero', 'banner', 'tv', 'near', 'above', 'below', 'can', 'may', 'one', 'two', 'first', 'last', 'more', 'most', 'other', 'work'])
		ok(!STOPWORDS.has(word), `${word} must not be a stopword`)
})

/* -------------------------------------------------------------------------- */
/* 3. normalizeText, splitWords, slugify, cleanLabel, clampText, escapeRegex  */
/* -------------------------------------------------------------------------- */

table(
	'normalizeText: table',
	[
		['Café_Menu--2', 'cafe menu 2'],
		['日本 Фото', '日本 фото'],
		['Crème Brûlée', 'creme brulee'],
		['ÀÉÎÕÜ àéîõü', 'aeiou aeiou'],
		['Straße', 'strasse'],
		['STRAẞE', 'strasse'],
		['Øresund', 'oresund'],
		['Ærø', 'aero'],
		['Œuvre', 'oeuvre'],
		['Đà Nẵng', 'da nang'],
		['Łódź', 'lodz'],
		['Þór', 'thor'],
		['R&D', 'r and d'],
		['Tom & Jerry', 'tom and jerry'],
		['Tom&Jerry', 'tom and jerry'],
		['&', 'and'],
		['＆', 'and'],
		['🔥 kitchen 🔥', 'kitchen'],
		['😀', ''],
		['', ''],
		['   ', ''],
		['\u0000kitchen\u0007', 'kitchen'],
		['\tfoo\nbar\r\n', 'foo bar'],
		['ＡＢＣ１２３', 'abc123'],
		['ﬁne ﬂoor', 'fine floor'],
		['İstanbul', 'istanbul'],
		['Фото', 'фото'],
		['\u0301', ''],
		['e\u0301', 'e'],
		['\ud800abc', 'abc'],
		['abc\udc00', 'abc'],
		['Room 101', 'room 101'],
		['٣ طاولة', '٣ طاولة'],
		['kitchen-remodel_after.v2', 'kitchen remodel after v2'],
		['  leading and trailing  ', 'leading and trailing'],
		['a   b\u00a0c\u3000d', 'a b c d'],
		['x\u200by', 'x y'],
		['$$$ 100% ???', '100'],
	],
	(input, expected) => same(normalizeText(input), expected),
)

check('normalizeText: distinct non-Latin inputs stay distinct (no collapse to empty)', () => {
	const inputs = ['日本', '日本語', '中国', '東京', 'Фото', 'Видео', 'ひらがな', 'カタカナ', '한국어', 'العربية', 'ελληνικά', 'עברית', 'ไทย']
	const keys = inputs.map(normalizeText)
	for (const key of keys) ok(key.length > 0, 'empty key')
	ok(new Set(keys).size === inputs.length, `collisions: ${keys.join(',')}`)
})

check('normalizeText: idempotent, and 200,000-character input finishes fast', () => {
	for (const input of ['Café_Menu--2', '日本 Фото', 'R&D & more', 'ǅ ǆ ǈ', 'ﬃ']) same(normalizeText(normalizeText(input)), normalizeText(input))
	const started = Date.now()
	const big = 'Kitchen & Bath, '.repeat(12500)
	const out = normalizeText(big)
	ok(out.startsWith('kitchen and bath kitchen'), 'wrong output')
	ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`)
})

check('normalizeText: non-string input gives the empty string', () => {
	for (const value of [undefined, null, 5, {}, [], true]) same(normalizeText(value), '')
})

table(
	'splitWords: camelCase and letter/digit boundaries, stopwords kept',
	[
		['kitchenRemodel_final-2', ['kitchen', 'remodel', 'final', '2']],
		['IMG2034', ['img', '2034']],
		['iPhone15', ['i', 'phone', '15']],
		['XMLHttpRequest', ['xml', 'http', 'request']],
		['HeroBanner2x', ['hero', 'banner', '2', 'x']],
		['LeadsNearMe', ['leads', 'near', 'me']],
		['ABC123def', ['abc', '123', 'def']],
		['h2o', ['h', '2', 'o']],
		['4K', ['4', 'k']],
		['TV', ['tv']],
		['kitchen2020Remodel', ['kitchen', '2020', 'remodel']],
		['Café', ['cafe']],
		['naïveBayes', ['naive', 'bayes']],
		['日本 Фото', ['日本', 'фото']],
		['ФотоКухни', ['фото', 'кухни']],
		['the cat', ['the', 'cat']],
		['a&b', ['a', 'and', 'b']],
		['2024', ['2024']],
		['', []],
		['___', []],
		['   ', []],
		['😀😀', []],
		['PXL_20240101_123456789', ['pxl', '20240101', '123456789']],
		['McDonalds', ['mc', 'donalds']],
		['already lower', ['already', 'lower']],
		['ALL CAPS HERE', ['all', 'caps', 'here']],
	],
	(input, expected) => same(splitWords(input), expected),
)

check('splitWords: non-string input gives []', () => {
	for (const value of [undefined, null, 5, {}]) same(splitWords(value), [])
})

table(
	'slugify: table',
	[
		['Kitchen Remodel!', 'kitchen-remodel'],
		['日本', '日本'],
		['Фото', 'фото'],
		['!!!', ''],
		['', ''],
		['   ', ''],
		['Café Menu', 'cafe-menu'],
		['--a--', 'a'],
		['R&D', 'r-and-d'],
		['😀', ''],
		['😀 kitchen', 'kitchen'],
		['Kitchen   &   Bath', 'kitchen-and-bath'],
		['Room 101', 'room-101'],
		['a'.repeat(100), 'a'.repeat(60)],
		[`${'a'.repeat(59)} b`, 'a'.repeat(59)],
		[`${'a'.repeat(58)} b`, `${'a'.repeat(58)}-b`],
		['KITCHEN', 'kitchen'],
		['kitchen-remodel', 'kitchen-remodel'],
		['kitchen_remodel', 'kitchen-remodel'],
		['Straße', 'strasse'],
	],
	(input, expected) => same(slugify(input), expected),
)

check('slugify: distinct non-Latin labels give distinct, non-empty slugs', () => {
	const labels = ['日本', '日本語', '中国', '東京', 'Фото', 'Видео', 'ひらがな', 'カタカナ', '한국어', 'العربية', 'ελληνικά', 'עברית']
	const slugs = labels.map(slugify)
	for (const slug of slugs) ok(slug.length > 0, 'empty slug')
	ok(new Set(slugs).size === labels.length, `collisions: ${slugs.join(',')}`)
})

check('slugify: a letter outside the BMP is never cut in half at the 60 limit', () => {
	const slug = slugify('𠀀'.repeat(80))
	ok(!hasLoneSurrogate(slug), 'lone surrogate')
	same(cps(slug), 60)
})

check('slugify: output is idempotent and always dash-joined letters/numbers', () => {
	for (const input of ['Kitchen Remodel!', 'R&D', '日本 Фото', 'a'.repeat(90), 'x '.repeat(50), '---', 'Café']) {
		const slug = slugify(input)
		ok(slugify(slug) === slug, `${show(input)} -> ${slug} -> ${slugify(slug)}`)
		ok(slug === '' || /^[\p{L}\p{N}]+(-[\p{L}\p{N}]+)*$/u.test(slug), `bad shape ${slug}`)
		ok(cps(slug) <= 60, 'too long')
	}
})

table(
	'cleanLabel: table',
	[
		['  Kitchen   Remodel  ', 'Kitchen Remodel'],
		['a\u0000b', 'ab'],
		['a\tb\nc', 'a b c'],
		['KiTcHeN', 'KiTcHeN'],
		['x'.repeat(100), 'x'.repeat(MEDIA_LIMITS.tagLabelMax)],
		['a\u200Bb', 'ab'],
		['a\u202Eb', 'ab'],
		['a\u0007\u001bb', 'ab'],
		['', ''],
		['   \t\n  ', ''],
		['Café', 'Café'],
		['日本 Фото', '日本 Фото'],
		['\u0085kitchen\u007f', 'kitchen'],
		['a \u0000 b', 'a b'],
		[`${'word '.repeat(20)}`, `${'word '.repeat(8)}`.trimEnd()],
	],
	(input, expected) => same(cleanLabel(input), expected),
)

check('cleanLabel: a surrogate pair is never cut in half, ZWJ emoji sequences survive', () => {
	const cut = cleanLabel('😀'.repeat(50))
	ok(!hasLoneSurrogate(cut), 'lone surrogate')
	same(cps(cut), MEDIA_LIMITS.tagLabelMax)
	const family = '👨‍👩‍👧'
	same(cleanLabel(family), family)
})

check('cleanLabel: non-string input gives the empty string', () => {
	for (const value of [undefined, null, 5, {}]) same(cleanLabel(value), '')
})

table(
	'clampText: table',
	[
		['abc', 10, 'abc'],
		['  a   b  ', 10, 'a b'],
		['abcdef', 3, 'abc'],
		['aaaa bbbb', 5, 'aaaa'],
		['abc', 0, ''],
		['abc', -4, ''],
		['abc', Number.NaN, ''],
		['abcdef', 3.9, 'abc'],
		['abc', Number.POSITIVE_INFINITY, 'abc'],
		['a\u0000b\u0001c', 10, 'abc'],
		['a\nb', 10, 'a b'],
		['😀😀😀', 2, '😀😀'],
		['', 5, ''],
		['日本語のテキスト', 3, '日本語'],
	],
	(input, max, expected) => same(clampText(input, max), expected),
)

check('clampText: 5 MB of input is cut in time and to the limit', () => {
	const started = Date.now()
	const out = clampText(`  ${'ab \u0000'.repeat(1_250_000)}`, 2000)
	ok(cps(out) <= 2000, `length ${cps(out)}`)
	ok(!out.startsWith(' ') && !out.endsWith(' '), 'not trimmed')
	ok(Date.now() - started < 4000, `took ${Date.now() - started} ms`)
})

const REGEX_CASES = [
	'.',
	'*',
	'+',
	'?',
	'^',
	'$',
	'{',
	'}',
	'(',
	')',
	'|',
	'[',
	']',
	'\\',
	'a.c',
	'(a|b)',
	'[abc]',
	'a+b*c?',
	'^kitchen$',
	'.*',
	'\\d+',
	'{1,3}',
	'a{2}',
	'(?=x)',
	'(?<name>x)',
	'\\',
	'\\\\',
	'[^a-z]',
	'a-b',
	'a/b',
	'$1 $& $`',
	'日本.*',
	'Фото(1)',
	'🔥+',
	'kitchen\nremodel',
	'tab\there',
	'a\u0000b',
	'',
	' ',
	'-',
	'#',
	'~!@%&=<>:;,"\'`_',
]
table('escapeRegex: output compiles (plain and unicode mode) and matches exactly the literal', REGEX_CASES.map((s) => [s]), (input) => {
	const escaped = escapeRegex(input)
	for (const flags of ['', 'u']) {
		const exact = new RegExp(`^${escaped}$`, flags)
		ok(exact.test(input), `${flags || 'plain'}: does not match itself`)
		ok(!exact.test(`${input}x`), `${flags || 'plain'}: matches ${show(`${input}x`)}`)
		ok(!exact.test(`x${input}`), `${flags || 'plain'}: matches ${show(`x${input}`)}`)
	}
	// "any character" must not leak out of a literal dot
	if (input === '.') ok(!new RegExp(`^${escaped}$`).test('a'), '. matched a')
	if (input === '.*') ok(!new RegExp(`^${escaped}$`).test('abc'), '.* matched abc')
	if (input === 'a.c') ok(!new RegExp(`^${escaped}$`).test('abc'), 'a.c matched abc')
	if (input === '(a|b)') ok(!new RegExp(`^${escaped}$`).test('a'), '(a|b) matched a')
})

check('escapeRegex: every ASCII character individually, as a prefix and inside text', () => {
	for (let code = 0; code < 128; code++) {
		const char = String.fromCharCode(code)
		const body = `ab${char}cd`
		const escaped = escapeRegex(body)
		const prefix = new RegExp(`^${escaped}`)
		ok(prefix.test(`${body}tail`), `prefix failed for code ${code}`)
		ok(new RegExp(`^${escaped}$`, 'u').test(body), `u-mode failed for code ${code}`)
	}
})

check('escapeRegex: a NUL is written as an escape so a Mongo $regex pattern holds no raw NUL', () => {
	ok(!escapeRegex('a\u0000b').includes('\u0000'), 'raw NUL left in the pattern')
	ok(!escapeRegex('\u0000').includes('\u0000'), 'raw NUL left in the pattern')
})

check('escapeRegex: the anchored prefix form used by the planner works', () => {
	const re = new RegExp(`^${escapeRegex('kitc')}`)
	ok(re.test('kitchen') && !re.test('Kitchen') && !re.test('akitchen'), 'prefix semantics wrong')
	const hostile = new RegExp(`^${escapeRegex('.*')}`)
	ok(!hostile.test('kitchen'), 'hostile prefix matched everything')
})

check('escapeRegex: non-string input gives the empty string', () => {
	for (const value of [undefined, null, 5, {}]) same(escapeRegex(value), '')
})

/* -------------------------------------------------------------------------- */
/* 4. indexTokens                                                             */
/* -------------------------------------------------------------------------- */

check('indexTokens: the stub example, exactly', () => {
	same(indexTokens('Kitchen remodeling'), ['kitchen', 'remodeling', 'remodel'])
})

check('indexTokens: surface plus stem, de-duplicated, in first-seen order', () => {
	same(indexTokens('Kitchens'), ['kitchens', 'kitchen'])
	same(indexTokens('trucks truck'), ['trucks', 'truck'])
	same(indexTokens('zebra apple zebra'), ['zebra', 'apple', 'appl'])
	same(indexTokens('Painting painted paint'), ['painting', 'paint', 'painted'])
	same(indexTokens('siding'), ['siding', 'side'])
})

check('indexTokens: stopwords are dropped', () => {
	same(indexTokens('the'), [])
	same(indexTokens('THE'), [])
	same(indexTokens('of the and a'), [])
	same(indexTokens('a kitchen of the house'), ['kitchen', 'house', 'hous'])
	same(indexTokens('In 2024'), ['2024'])
	for (const word of ['i', 'is', 'am', 'at', 'to', 'by', 'or', 'if', 'it']) same(indexTokens(word), [])
})

check('indexTokens: words that carry meaning survive', () => {
	for (const word of ['before', 'after', 'new', 'top', 'over', 'under', 'up', 'down', 'out', 'off', 'front', 'back', 'side', 'inside', 'outside', 'no', 'not'])
		ok(indexTokens(word).includes(word), `${word} was dropped`)
	ok(indexTokens('before and after').includes('before'), 'before')
	ok(indexTokens('before and after').includes('after'), 'after')
	ok(!indexTokens('before and after').includes('and'), 'and kept')
})

check('indexTokens: joined runs. iPhone15 gives iphone15 and iphone beside its split words', () => {
	const tokens = indexTokens('iPhone15')
	for (const token of ['iphone15', 'iphone', 'phone', '15']) ok(tokens.includes(token), `missing ${token} in ${show(tokens)}`)
	ok(!tokens.includes('i'), 'a stopword leaked')
})

check('indexTokens: LeadsNearMe gives leadsnearme; 4K gives 4k; H2O and TV survive', () => {
	const lead = indexTokens('LeadsNearMe')
	for (const token of ['leadsnearme', 'leads', 'lead', 'near']) ok(lead.includes(token), `missing ${token} in ${show(lead)}`)
	ok(!lead.includes('me'), 'stopword "me" leaked')
	const k = indexTokens('4K')
	for (const token of ['4k', '4', 'k']) ok(k.includes(token), `missing ${token} in ${show(k)}`)
	ok(indexTokens('H2O').includes('h2o'), 'h2o lost')
	ok(indexTokens('h2o').includes('h2o'), 'lowercase h2o lost')
	ok(indexTokens('TV').includes('tv'), 'tv lost')
	ok(indexTokens('tv').includes('tv'), 'lowercase tv lost')
	ok(indexTokens('mp3').includes('mp3'), 'mp3 lost')
	ok(indexTokens('2x').includes('2x'), '2x lost')
})

check('indexTokens: a whole run that is all stopword parts is still found by its joined form', () => {
	ok(indexTokens('IN2').includes('in2'), 'in2 lost')
	ok(indexTokens('AtHome').includes('athome'), 'athome lost')
	ok(!indexTokens('AtHome').includes('at'), 'stopword at leaked')
})

check('indexTokens: the joined run applies per run, not across separators', () => {
	const tokens = indexTokens('kitchen-remodel_after')
	ok(!tokens.includes('kitchenremodelafter'), 'joined across separators')
	for (const token of ['kitchen', 'remodel', 'after']) ok(tokens.includes(token), `missing ${token}`)
})

check('indexTokens: run length bounds. 2 to 64 inclusive', () => {
	const sixtyFour = 'Ab'.repeat(32)
	const sixtyFive = `${sixtyFour}c`
	ok(indexTokens(sixtyFour).includes(sixtyFour.toLowerCase()), '64-char run not joined')
	ok(!indexTokens(sixtyFive).includes(sixtyFive.toLowerCase()), '65-char run was joined')
	ok(indexTokens(sixtyFive).includes('ab'), 'its words are still indexed')
	ok(indexTokens('k').includes('k'), 'a one-character word is still a word')
	ok(indexTokens('Ab').includes('ab'), 'two-character run')
})

check('indexTokens: query and index agree. iphone, iPhone and IPHONE meet on one token', () => {
	const lower = indexTokens('iphone')
	const upper = indexTokens('IPHONE')
	same(lower, upper)
	const camel = indexTokens('iPhone')
	ok(camel.includes('iphone'), 'iPhone lost the joined token')
	ok(lower.includes('iphone'), 'iphone lost the token')
	// and each finds a document named iPhone15.jpg
	const document = new Set(indexTokens('iPhone15.jpg'))
	for (const query of [lower, upper, camel]) ok(query.some((token) => document.has(token)), `${show(query)} misses the document`)
})

check('indexTokens: a document and a query for any of its words always share a token', () => {
	const rand = prng(11)
	const vocab = ['kitchen', 'Remodeling', 'IMG2034', 'iPhone15', 'LeadsNearMe', '4K', 'H2O', 'tv', 'Café', '日本', 'Фото', 'trucks', 'Siding', 'the', 'of', 'before', 'R&D', 'x-ray']
	for (let i = 0; i < 300; i++) {
		const doc = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => vocab[Math.floor(rand() * vocab.length)]).join(' ')
		const tokens = new Set(indexTokens(doc))
		for (const word of splitWords(doc)) {
			if (STOPWORDS.has(word)) continue
			ok(indexTokens(word).some((t) => tokens.has(t)), `query ${word} misses ${show(doc)}`)
		}
	}
})

check('indexTokens: other scripts pass through as words, accents fold', () => {
	same(indexTokens('日本料理'), ['日本料理'])
	same(indexTokens('日本 Фото'), ['日本', 'фото'])
	same(indexTokens('Café'), ['cafe'])
	same(indexTokens('Cafés'), ['cafes', 'cafe'])
	same(indexTokens('Straße'), ['strasse', 'strass'])
})

check('indexTokenSets: surface and stems partition indexTokens exactly', () => {
	for (const input of ['Kitchen remodeling', 'iPhone15 trucks siding', 'the of 日本 Фото', 'before and after', '']) {
		const sets = indexTokenSets(input)
		same(sets.tokens, indexTokens(input))
		same([...new Set([...sets.surface, ...sets.stems])].sort(), [...sets.tokens].sort())
	}
	const sets = indexTokenSets('Siding trucks')
	ok(sets.surface.includes('siding') && !sets.surface.includes('side'), 'siding/side confused')
	ok(sets.stems.includes('side') && sets.stems.includes('truck'), 'stems missing')
})

check('indexTokens: non-string input gives []', () => {
	for (const value of [undefined, null, 5, {}]) same(indexTokens(value), [])
})

check('indexTokens: 300,000 characters of hostile text finish fast', () => {
	const started = Date.now()
	same(indexTokens('kitchen remodel '.repeat(20000)), ['kitchen', 'remodel'])
	ok(indexTokens('a'.repeat(300000)).length >= 1, 'long run')
	ok(indexTokens('aB'.repeat(100000)).includes('ba'), 'camel run')
	ok(Array.isArray(indexTokens('🔥日本Фото\u0000'.repeat(30000))), 'mixed')
	ok(Date.now() - started < 6000, `took ${Date.now() - started} ms`)
})

/* Random data for the property checks (defined early: the terms checks use it too) */

const POOLS = [
	'abcdefghijklmnopqrstuvwxyz',
	'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	'0123456789',
	' \t\n\r  --__..,,',
	'.*+?^${}()|[]\\/&#@!%',
	'\u0000\u0001\u0007\u001b\u007f\u0085\u200b\u200d\u202e\u2066\ufeff',
	'éèêëàâäôöùûüçñÿœøßæđłþİıÉÀ',
	'日本語中文한국어ひらがなカタカナ',
	'ФотоВидеоКухняйё',
	'العربيةעבריתελληνικάไทย',
	'\u0301\u0300\u0308\u0327',
	'😀🔥👨‍👩‍👧🧑🏽‍🍳🇺🇸',
	'\ud800\udc00\ud83d\ude00',
	'\ud800\udbff\udc00\udfff', // lone surrogates
	'ＡＢＣ１２３ﬁﬂ½²',
]
function randomString(rand) {
	const parts = 1 + Math.floor(rand() * 12)
	let out = ''
	for (let i = 0; i < parts; i++) {
		const pool = POOLS[Math.floor(rand() * POOLS.length)]
		const chars = Array.from(pool)
		const length = 1 + Math.floor(rand() * 8)
		for (let c = 0; c < length; c++) out += chars[Math.floor(rand() * chars.length)]
	}
	if (rand() < 0.03) out = out.repeat(20)
	return out
}
function randomDoc(rand) {
	const types_ = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', '__proto__', 'x']
	return {
		name: randomString(rand),
		filename: randomString(rand),
		contentType: types_[Math.floor(rand() * types_.length)],
		tags: Array.from({ length: Math.floor(rand() * 5) }, () => ({
			slug: slugify(randomString(rand)),
			label: randomString(rand),
			source: rand() < 0.5 ? 'manual' : 'auto',
			via: rand() < 0.5 ? 'vision' : 'filename',
		})),
		caption: randomString(rand),
		altText: randomString(rand),
		textInImage: randomString(rand),
		keywords: Array.from({ length: Math.floor(rand() * 4) }, () => randomString(rand)),
		notes: randomString(rand),
		colorNames: Array.from({ length: Math.floor(rand() * 3) }, () => randomString(rand)),
		orientation: ['landscape', 'portrait', 'square', 'panorama'][Math.floor(rand() * 4)],
		kind: rand() < 0.3 ? null : ['photo', 'logo', 'icon'][Math.floor(rand() * 3)],
		hasAlpha: rand() < 0.5,
		animated: rand() < 0.5,
	}
}


/* -------------------------------------------------------------------------- */
/* 5. terms                                                                   */
/* -------------------------------------------------------------------------- */

const colorsOf = (...names) => names.map((name, i) => ({ hex: '#000000', name, share: 0.5 / (i + 1) }))

const jpegDoc = () => ({
	name: 'Kitchen remodel after',
	filename: 'kitchen-remodel-after.jpg',
	contentType: 'image/jpeg',
	tags: [
		{ slug: 'kitchen-remodel', label: 'Kitchen Remodel', source: 'manual' },
		{ slug: 'granite-countertops', label: 'Granite countertops', source: 'auto', via: 'vision', confidence: 0.9 },
		{ slug: 'after', label: 'After', source: 'auto', via: 'filename' },
	],
	caption: 'A bright modern kitchen with white cabinets and granite countertops',
	altText: 'Renovated kitchen with an island',
	textInImage: 'Acme Plumbing 555-0100',
	keywords: ['renovation', 'interior design'],
	notes: 'Client approved the quartz upgrade',
	colorNames: ['white', 'gray'],
	orientation: 'landscape',
	kind: 'photo',
	hasAlpha: false,
	animated: false,
})

check('terms: FIELD_KEYS has the ten fields of the table and NO project field', () => {
	same([...FIELD_KEYS], ['tag', 'auto-tag', 'filename-tag', 'name', 'caption', 'text', 'keyword', 'notes', 'color', 'look'])
	const texts = fieldTexts(jpegDoc())
	same(Object.keys(texts).sort(), [...FIELD_KEYS].sort())
	ok(!('project' in texts), 'project field present')
})

check('terms: every field of a realistic document is populated', () => {
	const doc = jpegDoc()
	const texts = fieldTexts(doc)
	const tokens = fieldTokens(doc)
	for (const key of FIELD_KEYS) {
		ok(texts[key].length > 0, `${key}: no texts`)
		ok(tokens[key].surface.size > 0, `${key}: no surface tokens`)
		ok(tokens[key].stems.size > 0, `${key}: no stems`)
	}
	ok(tokens.tag.surface.has('kitchen') && tokens.tag.surface.has('remodel'), 'manual tag words')
	ok(tokens['auto-tag'].surface.has('granite') && !tokens['auto-tag'].surface.has('kitchen'), 'auto tag words leak')
	ok(tokens['filename-tag'].surface.has('after'), 'filename tag')
	ok(tokens.name.surface.has('kitchen') && tokens.name.surface.has('jpg'), 'name and file name')
	ok(tokens.caption.surface.has('renovated') && tokens.caption.surface.has('countertops'), 'caption and alt text')
	ok(tokens.text.surface.has('acme') && tokens.text.surface.has('555'), 'text in image')
	ok(tokens.keyword.surface.has('renovation') && tokens.keyword.surface.has('interior'), 'keywords')
	ok(tokens.notes.surface.has('quartz'), 'notes')
	ok(tokens.color.surface.has('white') && tokens.color.surface.has('gray'), 'colours')
	ok(tokens.look.surface.has('landscape') && tokens.look.surface.has('photo'), 'look')
})

check('terms: fields are separated. manual, automatic and filename tags land in their own field', () => {
	const texts = fieldTexts(jpegDoc())
	ok(texts.tag.includes('Kitchen Remodel'), 'manual label')
	ok(texts.tag.includes('kitchen-remodel'), 'manual slug')
	same(texts['auto-tag'], ['Granite countertops'])
	same(texts['filename-tag'], ['After'])
	// a filename tag a person kept becomes manual: it is a tag now
	const kept = jpegDoc()
	kept.tags = [{ slug: 'after', label: 'After', source: 'manual', via: 'filename' }]
	same(fieldTexts(kept).tag, ['After', 'after'])
	same(fieldTexts(kept)['filename-tag'], [])
})

check('terms: fieldTexts keeps stopwords (raw text) and one string per source', () => {
	const doc = jpegDoc()
	doc.tags.push({ slug: 'before-and-after', label: 'Before and after', source: 'manual' })
	const texts = fieldTexts(doc)
	ok(texts.tag.includes('Before and after'), 'phrase tag lost its stopword')
	same(texts.caption, ['A bright modern kitchen with white cabinets and granite countertops', 'Renovated kitchen with an island'])
	same(texts.name, ['Kitchen remodel after', 'kitchen-remodel-after.jpg'])
	same(texts.keyword, ['renovation', 'interior design'])
	same(texts.text, ['Acme Plumbing 555-0100'])
	same(texts.color, ['white', 'gray'])
})

check('terms: empty fields are empty arrays', () => {
	const empty = {
		name: '',
		filename: '',
		contentType: 'image/png',
		tags: [],
		caption: '',
		altText: '   ',
		textInImage: '',
		keywords: [],
		notes: '',
		colorNames: [],
		orientation: 'square',
		kind: null,
		hasAlpha: false,
		animated: false,
	}
	const texts = fieldTexts(empty)
	for (const key of ['tag', 'auto-tag', 'filename-tag', 'name', 'caption', 'text', 'keyword', 'notes', 'color']) same(texts[key], [], key)
	same(texts.look, ['png', 'square'])
})

check('terms: look. jpeg gives BOTH jpg and jpeg; png, webp, avif, gif give their own word', () => {
	const base = jpegDoc()
	for (const [contentType, words] of [
		['image/jpeg', ['jpg', 'jpeg']],
		['image/png', ['png']],
		['image/webp', ['webp']],
		['image/avif', ['avif']],
		['image/gif', ['gif']],
	]) {
		const look = fieldTexts({ ...base, contentType }).look
		for (const word of words) ok(look.includes(word), `${contentType} lacks ${word}`)
		const surface = fieldTokens({ ...base, contentType }).look.surface
		for (const word of words) ok(surface.has(word), `${contentType} tokens lack ${word}`)
		ok(buildTerms({ ...base, contentType }).includes(words[0]), `${contentType} terms lack ${words[0]}`)
	}
	ok(!fieldTexts({ ...base, contentType: 'image/png' }).look.includes('jpeg'), 'png gained jpeg')
	ok(!fieldTexts({ ...base, contentType: 'image/png' }).look.includes('jpg'), 'png gained jpg')
	ok(buildTerms({ ...base, contentType: 'image/jpeg' }).includes('jpeg'), 'jpeg missing from terms')
})

check('terms: look. orientation, kind, animated and transparent', () => {
	const base = jpegDoc()
	const plain = fieldTexts(base).look
	for (const word of ['landscape', 'photo']) ok(plain.includes(word), `missing ${word}`)
	ok(!plain.includes('animated') && !plain.includes('transparent'), 'flags set without cause')
	const flagged = fieldTexts({ ...base, animated: true, hasAlpha: true, contentType: 'image/gif', kind: 'logo', orientation: 'portrait' }).look
	for (const word of ['gif', 'portrait', 'logo', 'animated', 'transparent']) ok(flagged.includes(word), `missing ${word}`)
	ok(!fieldTexts({ ...base, kind: null }).look.includes('null'), 'null kind became a word')
	for (const orientation of ['landscape', 'portrait', 'square', 'panorama'])
		ok(buildTerms({ ...base, orientation }).includes(orientation), orientation)
	for (const kind of ['photo', 'illustration', 'logo', 'icon', 'screenshot', 'graphic', 'pattern', 'diagram', 'other'])
		ok(buildTerms({ ...base, kind }).includes(kind), kind)
})

check('terms: NOT in the index. brightness and saturation words, folder names, project names', () => {
	const doc = {
		...jpegDoc(),
		// extra properties a stored document carries; none may reach the index
		brightness: 'dark',
		saturation: 'muted',
		folderId: 'abc',
		folderPath: 'Zebra Archive/Quokka',
		projectName: 'Springfield',
		project: 'Springfield',
		uploadedBy: 'someone@example.com',
		url: 'https://blob.example/mediaroot/uuidstuff.jpg',
		sha256: 'deadbeef'.repeat(8),
	}
	const all = buildTerms(doc)
	for (const word of ['dark', 'muted', 'light', 'vivid', 'mid', 'monochrome', 'zebra', 'archive', 'quokka', 'springfield', 'someone', 'blob', 'mediaroot', 'deadbeef'])
		ok(!all.includes(word), `${word} leaked into terms`)
	const tokens = fieldTokens(doc)
	for (const key of FIELD_KEYS) for (const word of ['dark', 'muted', 'zebra', 'springfield']) ok(!tokens[key].surface.has(word), `${word} in ${key}`)
})

check('terms: caption words "light" and "dark" still index when a person wrote them', () => {
	const doc = { ...jpegDoc(), caption: 'natural light and dark wood' }
	const all = buildTerms(doc)
	ok(all.includes('light') && all.includes('dark'), 'real vocabulary lost')
})

check('terms: surface versus stems. an exact word is told from a stem-only match', () => {
	const doc = { ...jpegDoc(), name: 'Siding repair', caption: '', altText: '', filename: '' }
	const name = fieldTokens(doc).name
	ok(name.surface.has('siding') && !name.surface.has('side'), 'siding/side: surface')
	ok(name.stems.has('side'), 'siding/side: stems')
	ok(name.surface.has('repair'), 'repair')
	const caption = fieldTokens(jpegDoc()).caption
	ok(caption.surface.has('countertops') && !caption.surface.has('countertop'), 'countertops surface')
	ok(caption.stems.has('countertop'), 'countertop stem')
})

check('terms: no stopword is ever a surface token', () => {
	const doc = { ...jpegDoc(), notes: 'This is the best of all the things that we have', caption: 'A of the' }
	const tokens = fieldTokens(doc)
	for (const key of FIELD_KEYS) for (const word of tokens[key].surface) ok(!STOPWORDS.has(word), `${word} in ${key}`)
})

check('terms: buildTerms is exactly the union of fieldTokens, sorted, unique', () => {
	const rand = prng(23)
	const docs = [jpegDoc(), { ...jpegDoc(), contentType: 'image/gif', animated: true, hasAlpha: true, kind: 'icon' }, { ...jpegDoc(), tags: [], caption: '', notes: '' }]
	for (let i = 0; i < 60; i++) docs.push(randomDoc(rand))
	for (const doc of docs) {
		const union = new Set()
		const tokens = fieldTokens(doc)
		for (const key of FIELD_KEYS) {
			for (const token of tokens[key].surface) union.add(token)
			for (const token of tokens[key].stems) union.add(token)
		}
		const built = buildTerms(doc)
		same([...built], [...union].sort(), 'union: ')
		same(new Set(built).size, built.length, 'unique: ')
		same([...built], [...built].sort(), 'sorted: ')
		for (const term of built) ok(typeof term === 'string' && term.length > 0, 'bad term')
	}
})

check('terms: buildTerms is deterministic and independent of tag and keyword order', () => {
	const a = jpegDoc()
	const b = jpegDoc()
	b.tags = [...b.tags].reverse()
	b.keywords = [...b.keywords].reverse()
	same(buildTerms(a), buildTerms(a))
	same(buildTerms(a), buildTerms(b))
})

check('terms: every term of every field is lowercase', () => {
	for (const term of buildTerms({ ...jpegDoc(), notes: 'LOUD Notes About iPhone15 And HVAC' })) ok(term === term.toLowerCase(), term)
})

check('terms: derivedFields. nameKey, colorNames, terms, termsVersion', () => {
	const doc = { ...jpegDoc(), name: 'Kitchen Remodel AFTER', colors: [...colorsOf('white', 'gray', 'white', 'Blue')], colorNames: ['red-stale'] }
	const derived = derivedFields(doc)
	same(Object.keys(derived).sort(), ['colorNames', 'nameKey', 'terms', 'termsVersion'])
	same(derived.nameKey, 'kitchen remodel after')
	same(derived.colorNames, ['white', 'gray', 'Blue'])
	same(derived.termsVersion, MEDIA_TERMS_VERSION)
	same(derived.termsVersion, 1)
	ok(derived.terms.includes('white') && derived.terms.includes('gray') && derived.terms.includes('blue'), 'colours missing from terms')
	ok(!derived.terms.includes('red'), 'stale colorNames leaked into terms')
	same(derived.terms, buildTerms({ ...doc, colorNames: derived.colorNames }))
})

check('terms: derivedFields on a bare document does not throw', () => {
	const derived = derivedFields({ ...jpegDoc(), name: '', colors: [], tags: [] })
	same(derived.nameKey, '')
	same(derived.colorNames, [])
	ok(Array.isArray(derived.terms), 'terms')
	const odd = derivedFields({ colors: [null, { name: '' }, { name: 5 }, { name: 'teal' }, 'x'] })
	same(odd.colorNames, ['teal'])
})

check('terms: partial and malformed documents never throw', () => {
	const hostile = [
		{},
		null,
		undefined,
		{ tags: 'x' },
		{ tags: [null, 5, 'x', {}, { label: 5 }, { label: 'ok', source: 'weird' }] },
		{ keywords: 'nope' },
		{ keywords: [1, null, '', 'fine'] },
		{ colorNames: [null, 3] },
		{ contentType: '__proto__' },
		{ contentType: 'constructor' },
		{ contentType: 'toString' },
		{ contentType: 'image/bmp' },
		{ contentType: 5 },
		{ orientation: 5, kind: {} },
		{ name: 5, filename: {}, caption: [], notes: null },
	]
	for (const doc of hostile) {
		ok(Array.isArray(buildTerms(doc)), `buildTerms ${show(doc)}`)
		ok(typeof fieldTexts(doc) === 'object', 'fieldTexts')
		ok(typeof fieldTokens(doc) === 'object', 'fieldTokens')
	}
	for (const contentType of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'image/bmp', '']) {
		const look = fieldTexts({ ...jpegDoc(), contentType }).look
		same(look, ['landscape', 'photo'], `${contentType}: `)
	}
	same(fieldTexts({ tags: [{ label: 'ok', source: 'weird' }] })['auto-tag'], ['ok'])
})

/* A worst case within MEDIA_LIMITS: nothing may be cut. */

function wordFactory(rand) {
	const consonants = 'bcdfghjklmnpqrstvwxyz'
	const vowels = 'aeiou'
	const seen = new Set()
	const next = (forceInitial) => {
		for (;;) {
			let word = forceInitial ?? consonants[Math.floor(rand() * consonants.length)]
			const length = 4 + Math.floor(rand() * 5)
			for (let i = 1; i < length; i++) word += i % 2 ? vowels[Math.floor(rand() * 5)] : consonants[Math.floor(rand() * consonants.length)]
			if (!seen.has(word) && !STOPWORDS.has(word)) {
				seen.add(word)
				return word
			}
		}
	}
	return next
}

function fill(next, limit, initials = []) {
	const words = [...initials.map((letter) => next(letter))]
	let out = words.join(' ')
	while (out.length < limit) {
		const word = next()
		if (out.length + word.length + 1 > limit) break
		out += ` ${word}`
	}
	return out
}

function worstCase(seed) {
	const rand = prng(seed)
	const next = wordFactory(rand)
	// the words the index would drop first if it were sorted then cut
	const tail = ['w', 'x', 'y', 'z']
	const tags = Array.from({ length: MEDIA_LIMITS.maxTagsPerAsset }, (_, i) => {
		const label = [next(i % 2 ? 'w' : 'z'), next('x'), next('y')].join(' ')
		return i < 20 ? { slug: slugify(label), label, source: 'manual' } : { slug: slugify(label), label, source: 'auto', via: i % 2 ? 'vision' : 'filename', confidence: 0.8 }
	})
	return {
		name: fill(next, MEDIA_LIMITS.nameMax - 4, ['x']),
		filename: `${fill(next, 120)}.jpg`.replace(/ /g, '_'),
		contentType: 'image/jpeg',
		tags,
		caption: fill(next, MEDIA_LIMITS.captionMax, tail),
		altText: fill(next, MEDIA_LIMITS.altMax, tail),
		textInImage: fill(next, MEDIA_LIMITS.textInImageMax, tail),
		keywords: Array.from({ length: MEDIA_LIMITS.keywordsMax }, (_, i) => `${next(tail[i % 4])} ${next()}`),
		notes: fill(next, MEDIA_LIMITS.notesMax, tail),
		colorNames: ['blue', 'white', 'gray', 'green', 'red'],
		orientation: 'landscape',
		kind: 'photo',
		hasAlpha: true,
		animated: true,
	}
}

check('NO TRUNCATION: a worst-case document keeps every word, w/x/y/z-initial ones included, under termsMax', () => {
	const errors = []
	const original = console.error
	console.error = (...args) => errors.push(args)
	try {
		for (const seed of [1, 2, 3, 4, 5]) {
			const doc = worstCase(seed)
			ok(doc.notes.length >= 1900, `notes only ${doc.notes.length} chars`)
			ok(doc.tags.length === 40 && doc.keywords.length === 24, 'document is not at the limits')
			const built = buildTerms(doc)
			const have = new Set(built)
			ok(built.length < MEDIA_LIMITS.termsMax, `seed ${seed}: ${built.length} terms, limit ${MEDIA_LIMITS.termsMax}`)
			// every token that every field's text produces is in the index
			const texts = fieldTexts(doc)
			let checked = 0
			for (const key of FIELD_KEYS)
				for (const value of texts[key])
					for (const token of indexTokens(value)) {
						ok(have.has(token), `seed ${seed}: lost ${token} from ${key}`)
						checked++
					}
			ok(checked > 800, `only ${checked} tokens checked`)
			// and the late-alphabet words in particular
			for (const letter of ['w', 'x', 'y', 'z']) ok(built.some((term) => term.startsWith(letter)), `seed ${seed}: no term starts with ${letter}`)
			for (const word of doc.notes.split(' ').slice(-20)) ok(have.has(word), `seed ${seed}: the last words of the notes were cut (${word})`)
			for (const tag of doc.tags) for (const word of tag.label.split(' ')) ok(have.has(word), `seed ${seed}: tag word ${word} lost`)
			for (const keyword of doc.keywords) for (const word of keyword.split(' ')) ok(have.has(word), `seed ${seed}: keyword word ${word} lost`)
			// the union is the union, still
			const union = new Set()
			const tokens = fieldTokens(doc)
			for (const key of FIELD_KEYS) {
				for (const token of tokens[key].surface) union.add(token)
				for (const token of tokens[key].stems) union.add(token)
			}
			ok(union.size === built.length, `seed ${seed}: union ${union.size} vs terms ${built.length}`)
		}
	} finally {
		console.error = original
	}
	same(errors.length, 0, 'console.error fired within the limits: ')
})

check('NO TRUNCATION: past termsMax every term is still returned and ONE console.error is logged', () => {
	const rand = prng(99)
	const next = wordFactory(rand)
	// deliberately beyond MEDIA_LIMITS (the safety valve case)
	const doc = { ...jpegDoc(), notes: fill(next, 30000, ['w', 'x', 'y', 'z']) }
	const errors = []
	const original = console.error
	console.error = (...args) => errors.push(args.join(' '))
	let built
	try {
		built = buildTerms(doc)
	} finally {
		console.error = original
	}
	ok(built.length > MEDIA_LIMITS.termsMax, `only ${built.length} terms`)
	same(errors.length, 1, 'console.error calls: ')
	ok(/terms/i.test(errors[0]) && errors[0].includes(String(built.length)), `message ${errors[0]}`)
	const have = new Set(built)
	for (const token of indexTokens(doc.notes)) ok(have.has(token), `lost ${token}`)
	for (const letter of ['w', 'x', 'y', 'z']) ok(built.some((term) => term.startsWith(letter)), `no term starts with ${letter}`)
	same([...built], [...built].sort())
})

check('terms: tag label and slug words are both indexed (a manual tag is findable either way)', () => {
	const doc = { ...jpegDoc(), tags: [{ slug: 'kitchen-remodel', label: 'Kitchen Remodel', source: 'manual' }, { slug: 'old-slug', label: 'New Label', source: 'manual' }] }
	const all = buildTerms(doc)
	for (const word of ['kitchen', 'remodel', 'old', 'slug', 'label', 'new']) ok(all.includes(word), word)
})

/* -------------------------------------------------------------------------- */
/* 6. filenameTags                                                            */
/* -------------------------------------------------------------------------- */

const nameCases = [
	// phone and camera names
	['IMG_20240315_142233.jpg', []],
	['DSC_0042.JPG', []],
	['PXL_20240101_123456789.jpg', []],
	['Screenshot 2024-03-15 at 10.22.33 AM.png', []],
	['Screen Shot 2024-03-15 at 10.22.33 AM.png', []],
	['IMG-20240315-WA0012.jpg', []],
	['DSCF1234.JPG', []],
	['MVIMG_20240315_142233.jpg', []],
	['IMG_2034 (1).jpg', []],
	['WhatsApp Image 2024-03-15 at 10.22.33.jpeg', []],
	// export noise
	['final_v2_COPY(1).png', []],
	['untitled.png', []],
	['image.png', []],
	['photo.jpg', []],
	['Untitled-1_copy_final_edited.png', []],
	['photo.png.jpg', []],
	['the-and-of.jpg', []],
	// descriptive names
	['kitchen-remodel-after.jpg', ['Kitchen', 'Remodel', 'After']],
	['acme_plumbing_van_front.webp', ['Acme', 'Plumbing', 'Van', 'Front']],
	['HeroBanner2x.png', ['Hero', 'Banner']],
	['before_after_deck.jpg', ['Before', 'After', 'Deck']],
	['new_roof.jpg', ['Roof']],
	['my-hero-shot.png', ['Hero']],
	['SMITH_residence_front-entry.JPG', ['Smith', 'Residence', 'Front', 'Entry']],
	['HVACUnit_install.jpeg', ['Hvac', 'Unit', 'Install']],
	['copy of kitchen.png', ['Kitchen']],
	['roofing.png.jpg', ['Roofing']],
	['van-van-VAN.jpg', ['Van']],
	['Kitchen-1920x1080.jpg', ['Kitchen']],
	['logo@2x.png', ['Logo']],
	['banner_300x250.gif', ['Banner']],
	['Kitchen Remodel (copy).JPEG', ['Kitchen', 'Remodel']],
	['kitchen-remodel-after (2).jpg', ['Kitchen', 'Remodel', 'After']],
	['kitchenRemodel_final-2.jpg', ['Kitchen', 'Remodel']],
	['Jean-Luc_Café.png', ['Jean', 'Luc', 'Café']],
	// no extension, odd extensions, paths
	['kitchen-remodel', ['Kitchen', 'Remodel']],
	['kitchen.remodel', ['Kitchen', 'Remodel']],
	['folder/sub/kitchen island.jpg', ['Kitchen', 'Island']],
	['C:\\Users\\me\\Pictures\\Truck_wrap.PNG', ['Truck', 'Wrap']],
	['kitchen.HEIC', ['Kitchen']],
	// ids and hashes
	['3f2504e0-4f89-41d3-9a0c-0305e82c3301.jpg', []],
	['3F2504E0-4F89-41D3-9A0C-0305E82C3301.PNG', []],
	['9e107d9d372bb6826bd81d3542a419d6.png', []],
	['deadbeefcafe1234.jpg', []],
	['da39a3ee5e6b4b0d3255bfef95601890afd80709.webp', []],
	['507f1f77bcf86cd799439011.jpg', []],
	['kitchen_3f2504e0-4f89-41d3-9a0c-0305e82c3301.jpg', ['Kitchen']],
	['cafe-menu.png', ['Cafe', 'Menu']],
	// unicode
	['Café Menu.jpg', ['Café', 'Menu']],
	['日本料理.jpg', ['日本料理']],
	['Фото_кухни.jpg', ['Фото', 'Кухни']],
	['🔥kitchen🔥.jpg', ['Kitchen']],
	['😀😀😀.png', []],
	['kitchen\u0000remodel.jpg', ['Kitchen', 'Remodel']],
	// degenerate
	['', []],
	['.jpg', []],
	['...', []],
	['   ', []],
	['_-_.png', []],
	['123456.jpg', []],
	['a.jpg', []],
	['ab.jpg', []],
	['abc.jpg', ['Abc']],
]
check('filenameTags: at least 25 file names with expected labels', () => ok(nameCases.length >= 25, `only ${nameCases.length}`))
table('filenameTags: labels for realistic and noisy names', nameCases, (input, expected) =>
	same(filenameTags(input).map((tag) => tag.label), expected),
)

check('filenameTags: the six-tag cap keeps the first six, in order', () => {
	const out = filenameTags('alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel.jpg').map((tag) => tag.label)
	same(out, ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'])
})

check('filenameTags: tags have exactly the filename-tag shape and slugs from slugify', () => {
	for (const [input] of nameCases) {
		const tags = filenameTags(input)
		ok(tags.length <= 6, `${input}: ${tags.length} tags`)
		const slugs = new Set()
		for (const tag of tags) {
			same(Object.keys(tag).sort(), ['label', 'slug', 'source', 'via'], `${input}: keys `)
			same(tag.source, 'auto')
			same(tag.via, 'filename')
			ok(tag.slug === slugify(tag.label), `${input}: slug ${tag.slug} vs ${slugify(tag.label)}`)
			ok(tag.slug.length > 0, 'empty slug')
			ok(!slugs.has(tag.slug), `${input}: duplicate slug ${tag.slug}`)
			slugs.add(tag.slug)
			ok(cps(tag.label) >= 3 && cps(tag.label) <= MEDIA_LIMITS.tagLabelMax, `${input}: label length ${tag.label}`)
			ok(!/\s/.test(tag.label), `${input}: label is not a single word`)
			ok(tag.label === cleanLabel(tag.label), `${input}: label not clean`)
			ok(!/^\p{N}+$/u.test(tag.label), `${input}: digits-only label`)
			ok(!STOPWORDS.has(tag.slug), `${input}: stopword ${tag.slug}`)
			ok(tag.label === Array.from(tag.label)[0].toUpperCase() + Array.from(tag.label).slice(1).join('').toLowerCase(), `${input}: ${tag.label} is not Title-cased`)
		}
	}
})

check('filenameTags: labels are Title-cased single words whatever the input case', () => {
	same(filenameTags('KITCHEN.jpg').map((t) => t.label), ['Kitchen'])
	same(filenameTags('kitchen.jpg').map((t) => t.label), ['Kitchen'])
})

check('filenameTags: every noise word from the stub is dropped, and hero is kept', () => {
	for (const word of ['img', 'dsc', 'dscn', 'pxl', 'mvimg', 'screenshot', 'screen', 'shot', 'copy', 'final', 'new', 'untitled', 'image', 'photo', 'pic', 'picture', 'file', 'scan', 'edited', 'web', 'optimized', 'scaled', 'large', 'small'])
		for (const form of [`${word}.jpg`, `${word.toUpperCase()}.PNG`, `${word[0].toUpperCase()}${word.slice(1)}.webp`, `kitchen_${word}.jpg`]) {
			const labels = filenameTags(form).map((t) => t.label.toLowerCase())
			ok(!labels.includes(word), `${form} kept ${word}`)
		}
	same(filenameTags('hero.jpg').map((t) => t.label), ['Hero'])
	same(filenameTags('HERO_banner.png').map((t) => t.label), ['Hero', 'Banner'])
})

check('filenameTags: digits-only and under-three-character words are dropped', () => {
	same(filenameTags('2024_03_15.jpg'), [])
	same(filenameTags('ab_cd_ef.jpg'), [])
	same(filenameTags('a1b2c3.jpg'), [])
	same(filenameTags('kitchen_2_ab.jpg').map((t) => t.label), ['Kitchen'])
})

check('filenameTags: a very long name or word is handled without throwing or tagging garbage', () => {
	same(filenameTags(`${'z'.repeat(100)}.jpg`), [])
	same(filenameTags(`${'kitchen-'.repeat(10)}end.jpg`).map((t) => t.label), ['Kitchen', 'End'])
	const started = Date.now()
	const huge = filenameTags(`${'word_'.repeat(200000)}.jpg`)
	ok(huge.length === 1 && huge[0].label === 'Word', 'huge name')
	ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`)
	ok(Array.isArray(filenameTags('😀'.repeat(100000))), 'emoji flood')
})

check('filenameTags: non-string input gives []', () => {
	for (const value of [undefined, null, 5, {}, [], true]) same(filenameTags(value), [])
})

check('filenameTags: deterministic', () => {
	for (const [input] of nameCases) same(filenameTags(input), filenameTags(input))
})

/* -------------------------------------------------------------------------- */
/* 7. Property check: 1,000 random strings through every export               */
/* -------------------------------------------------------------------------- */

check('property: 1,000 random strings never throw from any export and always return the declared types', () => {
	const rand = prng(2024)
	const swallow = console.error
	console.error = () => {}
	try {
		for (let i = 0; i < 1000; i++) {
			const s = randomString(rand)
			const where = `#${i} ${show(s)}`
			const guard = (fn, label) => {
				try {
					return fn()
				} catch (error) {
					throw new Error(`${label} threw on ${where}: ${error.message}`)
				}
			}

			const norm = guard(() => normalizeText(s), 'normalizeText')
			ok(typeof norm === 'string', `normalizeText type ${where}`)
			ok(norm === '' || /^[\p{L}\p{N}]+( [\p{L}\p{N}]+)*$/u.test(norm), `normalizeText shape ${where} -> ${show(norm)}`)
			ok(normalizeText(norm) === norm, `normalizeText not idempotent ${where}`)

			const words = guard(() => splitWords(s), 'splitWords')
			ok(Array.isArray(words) && words.every((w) => typeof w === 'string' && /^[\p{L}\p{N}]+$/u.test(w)), `splitWords shape ${where} -> ${show(words)}`)

			const slug = guard(() => slugify(s), 'slugify')
			ok(typeof slug === 'string' && (slug === '' || /^[\p{L}\p{N}]+(-[\p{L}\p{N}]+)*$/u.test(slug)), `slugify shape ${where} -> ${show(slug)}`)
			ok(cps(slug) <= 60 && !hasLoneSurrogate(slug), `slugify length ${where}`)
			ok(slugify(slug) === slug, `slugify not idempotent ${where}`)
			ok((slug === '') === (norm === ''), `slugify empty only when no letter or digit survives ${where}`)

			const label = guard(() => cleanLabel(s), 'cleanLabel')
			ok(typeof label === 'string' && cps(label) <= MEDIA_LIMITS.tagLabelMax, `cleanLabel length ${where}`)
			ok(!/\p{Cc}/u.test(label) && label === label.trim() && !/\s{2}/.test(label), `cleanLabel shape ${where} -> ${show(label)}`)
			ok(label === '' || !hasLoneSurrogate(label) || hasLoneSurrogate(s), `cleanLabel invented a lone surrogate ${where}`)

			const max = Math.floor(rand() * 50)
			const clamped = guard(() => clampText(s, max), 'clampText')
			ok(typeof clamped === 'string' && cps(clamped) <= max && !/\p{Cc}/u.test(clamped), `clampText ${where}`)

			const escaped = guard(() => escapeRegex(s), 'escapeRegex')
			ok(typeof escaped === 'string', 'escapeRegex type')
			const literal = new RegExp(`^${escaped}$`)
			ok(literal.test(s), `escapeRegex does not match its input ${where}`)
			ok(!escaped.includes('\u0000'), `escapeRegex left a NUL ${where}`)

			const stems = guard(() => words.map(stem), 'stem')
			ok(stems.every((w) => typeof w === 'string' && w.length > 0), `stem shape ${where}`)

			const tokens = guard(() => indexTokens(s), 'indexTokens')
			ok(Array.isArray(tokens) && tokens.every((t) => typeof t === 'string' && t.length > 0), `indexTokens shape ${where}`)
			ok(new Set(tokens).size === tokens.length, `indexTokens not unique ${where}`)
			const sets = indexTokenSets(s)
			ok(sets.surface.every((t) => !STOPWORDS.has(t)), `a stopword is a surface token ${where}`)
			for (const word of words) if (!STOPWORDS.has(word)) ok(tokens.includes(word) && tokens.includes(stem(word)), `word or stem of ${word} missing ${where}`)
			ok(indexTokens(s) === indexTokens(s) || JSON.stringify(indexTokens(s)) === JSON.stringify(tokens), `indexTokens not deterministic ${where}`)

			const tags = guard(() => filenameTags(s), 'filenameTags')
			ok(Array.isArray(tags) && tags.length <= 6, `filenameTags shape ${where}`)
			for (const tag of tags) {
				ok(tag.source === 'auto' && tag.via === 'filename' && typeof tag.label === 'string' && tag.slug === slugify(tag.label) && tag.slug !== '', `filenameTags tag shape ${where} -> ${show(tag)}`)
				ok(!hasLoneSurrogate(tag.label) || hasLoneSurrogate(s), `filenameTags invented a lone surrogate ${where}`)
			}

			const doc = {
				...randomDoc(rand),
				name: s,
				caption: words.join(' '),
			}
			const texts = guard(() => fieldTexts(doc), 'fieldTexts')
			for (const key of FIELD_KEYS) ok(Array.isArray(texts[key]) && texts[key].every((t) => typeof t === 'string' && t.trim()), `fieldTexts ${key} ${where}`)
			const built = guard(() => buildTerms(doc), 'buildTerms')
			ok(Array.isArray(built) && built.every((t) => typeof t === 'string' && t.length > 0), `buildTerms shape ${where}`)
			ok(new Set(built).size === built.length, `buildTerms not unique ${where}`)
			const ft = guard(() => fieldTokens(doc), 'fieldTokens')
			const union = new Set()
			for (const key of FIELD_KEYS) {
				ok(ft[key].surface instanceof Set && ft[key].stems instanceof Set, `fieldTokens ${key} not Sets ${where}`)
				for (const t of ft[key].surface) union.add(t)
				for (const t of ft[key].stems) union.add(t)
			}
			ok(union.size === built.length && built.every((t) => union.has(t)), `union differs ${where}`)
			const derived = guard(() => derivedFields({ ...doc, colors: colorsOf(...doc.colorNames) }), 'derivedFields')
			ok(derived.termsVersion === MEDIA_TERMS_VERSION && typeof derived.nameKey === 'string' && Array.isArray(derived.colorNames) && Array.isArray(derived.terms), `derivedFields shape ${where}`)
			ok(derived.nameKey === doc.name.toLowerCase(), `nameKey ${where}`)
			ok(new Set(derived.colorNames).size === derived.colorNames.length, `colorNames not unique ${where}`)
		}
	} finally {
		console.error = swallow
	}
})

check('property: non-string and nullish values never throw from any export', () => {
	for (const value of [undefined, null, 0, NaN, -1, 1e9, true, false, {}, [], ['a'], () => 1, Symbol.iterator, 10n]) {
		for (const fn of [normalizeText, splitWords, slugify, cleanLabel, stem, indexTokens, escapeRegex, filenameTags, indexTokenSets]) {
			try {
				fn(value)
			} catch (error) {
				throw new Error(`${fn.name} threw on ${String(value)}: ${error.message}`)
			}
		}
		clampText(value, 5)
		clampText('abc', value)
	}
})

/* -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
