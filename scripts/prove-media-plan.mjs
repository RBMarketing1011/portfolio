/**
 * Proves src/lib/media/query/plan.ts (the planner: prefilter, exact evaluator, ranking,
 * typo tolerance) and src/lib/media/query/fuzzy.ts:
 *
 *   node --env-file=.env scripts/prove-media-plan.mjs
 *
 * The centre of it is THE INVARIANT against a real MongoDB: for every query, the
 * documents Mongo returns for `plan.prefilter`, filtered by `plan.evaluate`, must be
 * exactly what evaluating the whole library gives; and when `needsEvaluation` is false
 * the prefilter alone must be exact. The library is generated (300+ documents plus
 * hand-built fixtures, a real folder tree, real `derivedFields` terms) and lives under a
 * fresh workspace id in `mediaAssets` only; everything the proof inserts is deleted in
 * a `finally`. No collection or index is dropped, and nothing else is touched.
 *
 * Expectations are derived from the spec and the stub comments, not read off the
 * planner. The expected sets come from `oracle` predicates written here by hand (plain
 * string logic over the raw document fields), and the fixtures name what must and must
 * not match. Where the spec leaves a reading open, the planner's header says which one
 * it took and the check says so.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const { MongoClient, ObjectId, BSON } = rootRequire('mongodb')

const { parseQuery } = loadTs('src/lib/media/query/parse.ts')
const { planQuery } = loadTs('src/lib/media/query/plan.ts')
const fuzzy = loadTs('src/lib/media/query/fuzzy.ts')
const { buildFolderIndex } = loadTs('src/lib/media/folder-index.ts')
const { derivedFields } = loadTs('src/lib/media/terms.ts')
const text = loadTs('src/lib/media/text.ts')
const { NAMED_COLORS } = loadTs('src/lib/media/colors.ts')
const T = loadTs('src/lib/media/types.ts')
const { editDistance, allowedEdits, fuzzyCandidates, inVocabulary } = fuzzy
const { stem, slugify, STOPWORDS, indexTokenSets } = text

const uri = process.env.MONGODB_URI
if (!uri) {
	console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/prove-media-plan.mjs')
	process.exit(1)
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
let assertions = 0

async function check(name, fn) {
	try {
		await fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		const detail = (error && error.message ? error.message : String(error)).split('\n').slice(0, 6).join(' | ')
		console.log(`FAIL  ${name} (${detail.length > 700 ? `${detail.slice(0, 700)}...` : detail})`)
	}
}
const section = (title) => console.log(`\n== ${title}`)
const note = (message) => console.log(`NOTE  ${message}`)

/** deepStrictEqual with a label, counted as one assertion. */
function eq(actual, expected, label = '') {
	assertions++
	try {
		assert.deepStrictEqual(actual, expected)
	} catch {
		throw new Error(`${label ? `${label}: ` : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
	}
}
function ok(condition, message) {
	assertions++
	if (!condition) throw new Error(message)
}
const near = (actual, expected, label = '') => {
	assertions++
	if (!(Math.abs(actual - expected) < 1e-9)) throw new Error(`${label ? `${label}: ` : ''}expected ${expected}, got ${actual}`)
}

/** Seeded PRNG so a failing case reproduces. */
function rng(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/* -------------------------------------------------------------------------- */
/* fuzzy.ts                                                                   */
/* -------------------------------------------------------------------------- */

section('fuzzy: editDistance')

await check('editDistance: hand-derived table, transpositions included', () => {
	const table = [
		// word, word, max, expected
		['kitchen', 'kitchen', 2, 0],
		['kithcen', 'kitchen', 2, 1], // the stub's own example: one adjacent swap
		['kitchen', 'kitchn', 2, 1], // deletion
		['kitchen', 'kitchens', 2, 1], // insertion
		['kitchen', 'kitchan', 2, 1], // substitution
		['teh', 'the', 1, 1],
		['recieve', 'receive', 1, 1],
		['form', 'from', 1, 1],
		['ab', 'ba', 1, 1],
		['abcd', 'badc', 2, 2], // two swaps
		['kitten', 'sitting', 5, 3], // the textbook Levenshtein cases
		['sunday', 'saturday', 5, 3],
		['flaw', 'lawn', 5, 2],
		['gumbo', 'gambol', 5, 2],
		['abc', '', 5, 3],
		['', 'abc', 5, 3],
		['', '', 3, 0],
		// Optimal string alignment never edits a swapped pair again: 3, not Damerau's 2.
		['ca', 'abc', 5, 3],
	]
	for (const [a, b, max, expected] of table) {
		eq(editDistance(a, b, max), expected, `${a} -> ${b} (max ${max})`)
		eq(editDistance(b, a, max), expected, `${b} -> ${a} (max ${max}, reversed)`)
	}
	near(editDistance('kitten', 'sitting', Infinity), 3, 'no limit at all')
})

await check('editDistance: past the limit it answers max + 1, never the true distance', () => {
	eq(editDistance('abcdefgh', 'uvwxyzst', 3), 4)
	eq(editDistance('abcdef', 'uvwxyz', 2), 3)
	eq(editDistance('abcd', 'badc', 1), 2, 'two swaps, one allowed')
	eq(editDistance('ab', 'ba', 0), 1, 'a swap with no edits allowed')
	eq(editDistance('a', 'abcdefgh', 3), 4, 'a length gap alone is enough')
	eq(editDistance('kitchen', 'bathroom', 2), 3)
	eq(editDistance('', 'abcd', 2), 3)
	eq(editDistance('abc', 'abc', 0), 0, 'equal at limit 0')
	eq(editDistance('abc', 'abd', 0), 1)
})

await check('editDistance: matches an independent full-matrix reference (early exit is sound)', () => {
	// Plain O(nm) optimal-string-alignment, no tricks, written separately from the code under test.
	const reference = (a, b) => {
		const n = a.length
		const m = b.length
		const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
		for (let i = 0; i <= n; i++) d[i][0] = i
		for (let j = 0; j <= m; j++) d[0][j] = j
		for (let i = 1; i <= n; i++) {
			for (let j = 1; j <= m; j++) {
				d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
				if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
					d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
				}
			}
		}
		return d[n][m]
	}
	const next = rng(7)
	const word = (alphabet, max) => {
		let out = ''
		const length = Math.floor(next() * (max + 1))
		for (let i = 0; i < length; i++) out += alphabet[Math.floor(next() * alphabet.length)]
		return out
	}
	let pairs = 0
	for (let i = 0; i < 6000; i++) {
		// A tiny alphabet makes swaps and repeated letters common, which is where an early exit would go wrong.
		const alphabet = i % 3 === 0 ? 'ab' : i % 3 === 1 ? 'abc' : 'abcdefgh'
		const a = word(alphabet, 8)
		const b = next() < 0.4 ? a.split('').reverse().join('') : word(alphabet, 8)
		const truth = reference(a, b)
		for (const max of [0, 1, 2, 3, 5]) {
			const got = editDistance(a, b, max)
			if (got !== Math.min(truth, max + 1)) throw new Error(`${a} vs ${b} max ${max}: reference ${truth}, got ${got}`)
			pairs++
		}
		if (editDistance(a, b, 4) !== editDistance(b, a, 4)) throw new Error(`not symmetric: ${a} / ${b}`)
	}
	assertions += pairs
})

await check('editDistance: counts letters outside the BMP as one, tolerates odd input', () => {
	eq(editDistance('a\u{10348}b', 'ab', 1), 1, 'one astral letter is one deletion')
	eq(editDistance('\u{10348}', '', 1), 1)
	eq(editDistance('café', 'cafe', 1), 1)
	eq(editDistance(null, undefined, 2), 0, 'non-strings read as empty')
	eq(editDistance('a', 'b', -1), 1, 'a negative limit means none')
	eq(editDistance('a', 'a', Number.NaN), 0)
	eq(editDistance('a', 'b', Number.NaN), 1)
})

section('fuzzy: allowedEdits, fuzzyCandidates, inVocabulary')

await check('allowedEdits: 0 under 4 letters, 1 for 4-6, 2 for 7+', () => {
	for (const [length, expected] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 1], [5, 1], [6, 1], [7, 2], [8, 2], [20, 2], [-1, 0], [Number.NaN, 0], [undefined, 0]]) {
		eq(allowedEdits(length), expected, `length ${length}`)
	}
})

const V = new Map([
	['kitchen', 50],
	['kitchens', 10],
	['kitten', 7],
	['chicken', 5],
	['kitchenette', 2],
	['kit', 99],
	['bathroom', 20],
	['bathrooms', 4],
	['bathtub', 3],
	['truck', 2],
	['trucks', 2],
	['track', 9],
	['trick', 9],
	['tuck', 1],
	['café', 3],
])

await check('fuzzyCandidates: ranked by distance, then document count, then alphabetically', () => {
	// kithcen -> kitchen is 1 edit; kitchens and kitten are 2 (swap + insert / swap + 2 edits).
	eq(fuzzyCandidates('kithcen', V), ['kitchen', 'kitchens', 'kitten'])
	// All four are 1 edit from `truck`: counts 9, 9, 2, 1, and `track` sorts before `trick`.
	eq(fuzzyCandidates('truck', V, 4), ['track', 'trick', 'trucks', 'tuck'])
	eq(fuzzyCandidates('truck', V), ['track', 'trick', 'trucks'], 'three is the default limit')
})

await check('fuzzyCandidates: limit, first letter, itself, short words, bad input', () => {
	eq(fuzzyCandidates('kithcen', V, 1), ['kitchen'])
	eq(fuzzyCandidates('kithcen', V, 2), ['kitchen', 'kitchens'])
	eq(fuzzyCandidates('kithcen', V, 0), [])
	eq(fuzzyCandidates('kithcen', V, -3), [])
	eq(fuzzyCandidates('kithcen', V, Number.NaN), [])
	// The first letter must be shared: `xitchen` is one edit from `kitchen` and still gets nothing.
	eq(fuzzyCandidates('xitchen', V), [])
	eq(fuzzyCandidates('kitchen', V), ['kitchens', 'kitten'], 'never itself')
	eq(fuzzyCandidates('kit', V), [], 'three letters: no tolerance')
	eq(fuzzyCandidates('dek', new Map([['deck', 4]])), [], 'a short word is never fuzzed')
	// All five are one edit from `deck`; by document count the top three are decks (9), dock (4), duck (3).
	eq(fuzzyCandidates('deck', new Map([['dock', 4], ['duck', 3], ['dec', 2], ['dack', 1], ['decks', 9]])), ['decks', 'dock', 'duck'])
	eq(fuzzyCandidates('zzzzzz', V), [])
	eq(fuzzyCandidates('kithcen', new Map()), [])
	eq(fuzzyCandidates(undefined, V), [])
	eq(fuzzyCandidates('cafe', V), ['café'], 'accents are one edit')
	eq(fuzzyCandidates('kithcen', V, 10).length, 3, 'only what is close enough comes back')
})

await check('inVocabulary: the word, its stem, or (when asked) a prefix', () => {
	ok(inVocabulary('kitchen', V, false), 'exact')
	ok(inVocabulary('kitchens', V, false), 'plural')
	ok(inVocabulary('bathrooms', new Map([['bathroom', 2]]), false), 'its stem is there')
	ok(!inVocabulary('kitc', V, false), 'a prefix is not a word')
	ok(inVocabulary('kitc', V, true), 'a prefix when asked')
	ok(!inVocabulary('zzzz', V, true))
	ok(!inVocabulary('', V, true), 'empty is nothing')
	ok(!inVocabulary('kitchen', new Map(), true))
	ok(!inVocabulary('kitchen', new Map([['kitchen', 0]]), false), 'zero documents is absent')
	ok(!inVocabulary('kitc', new Map([['kitchen', 0]]), true))
	ok(!inVocabulary(undefined, V, true))
	// A stem alone is not the word the person typed, but it is what the index holds.
	ok(inVocabulary('remodeling', new Map([['remodel', 1]]), false))
})

/* -------------------------------------------------------------------------- */
/* The library: a real folder tree, hand-built fixtures, a generated bulk     */
/* -------------------------------------------------------------------------- */

const W = new ObjectId()
const NOW = new Date('2026-03-15T10:30:00.000Z')
const DAY = 86_400_000

/** key, name, parent key. Folder names double as search words, which is the point. */
const FOLDER_DEFS = [
	['clients', 'Clients', null],
	['acme', 'Acme', 'clients'],
	['hero', 'Hero Shots', 'acme'],
	['ba', 'Before and After', 'acme'],
	['beta', 'Beta Co', 'clients'],
	['marketing', 'Marketing', null],
	['social', 'Social Media', 'marketing'],
	['blog', 'Blog 2026', 'marketing'],
	['projects', 'Projects', null],
	['kitchenf', 'Kitchen Remodel', 'projects'],
	['archive', 'Archive', null],
	['cafe', 'Café Photos', null],
]
const FOLDER_ID = Object.fromEntries(FOLDER_DEFS.map(([key]) => [key, new ObjectId()]))
const KEY_OF_ID = new Map(FOLDER_DEFS.map(([key]) => [FOLDER_ID[key].toString(), key]))
const DEF = new Map(FOLDER_DEFS.map(([key, name, parent]) => [key, { key, name, parent }]))
const FOLDERS = buildFolderIndex(
	FOLDER_DEFS.map(([key, name, parent]) => ({ _id: FOLDER_ID[key], parentId: parent ? FOLDER_ID[parent] : null, name })),
)
/** A folder and its ancestors, nearest first. Written here, not taken from the index under test. */
const chainOf = (key) => {
	const out = []
	for (let at = key; at; at = DEF.get(at).parent) out.push(DEF.get(at))
	return out
}
const folderChainOfDoc = (doc) => (doc.folderId ? chainOf(KEY_OF_ID.get(doc.folderId.toString())) : [])

const COLOR_NAMES = NAMED_COLORS.map((color) => color.name)
const colorsOf = (...names) =>
	names.map((name, index) => ({ hex: NAMED_COLORS.find((c) => c.name === name).hex, name, share: 1 / (index + 2) }))

let serial = 0
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' }

/** A complete stored document, `terms` and friends built by the real `derivedFields`. */
function makeDoc(over = {}) {
	serial++
	const _id = new ObjectId()
	const contentType = over.contentType ?? 'image/jpeg'
	const width = over.width ?? 1600
	const height = over.height ?? 1000
	const doc = {
		_id,
		workspaceId: W,
		folderId: null,
		name: `asset ${serial}`,
		nameKey: '',
		filename: `asset-${serial}.${EXT[contentType]}`,
		url: `https://blob.example/${W}/${serial}`,
		pathname: `workspaces/${W}/media/p${serial}-${_id}.${EXT[contentType]}`,
		contentType,
		bytes: 250_000,
		width,
		height,
		pixels: width * height,
		orientation: 'landscape',
		hasAlpha: false,
		animated: false,
		colors: [],
		colorNames: [],
		brightness: 'mid',
		saturation: 'muted',
		sha256: _id.toString().repeat(3).slice(0, 64),
		blur: null,
		tags: [],
		rejectedTags: [],
		caption: '',
		altText: '',
		captionEdited: false,
		textInImage: '',
		keywords: [],
		kind: 'photo',
		notes: '',
		terms: [],
		termsVersion: T.MEDIA_TERMS_VERSION,
		rev: 1,
		tagging: { status: 'done', attempts: 1 },
		uploadedBy: 'proof',
		createdAt: new Date('2026-01-15T12:00:00.000Z'),
		updatedAt: new Date('2026-01-15T12:00:00.000Z'),
		...over,
	}
	doc.pixels = doc.width * doc.height
	return { ...doc, ...derivedFields(doc) }
}

const manual = (label) => ({ slug: slugify(label), label, source: 'manual' })
const auto = (label, confidence = 0.9) => ({ slug: slugify(label), label, source: 'auto', via: 'vision', confidence })
const fromName = (label) => ({ slug: slugify(label), label, source: 'auto', via: 'filename' })

/* ---- fixtures: each has a reason, and the queries below name them ----------- */

const FIX = {}
/** 71 characters: past the 64 the index keeps whole, so only its pieces are in `terms`. */
const LONG_RUN = `${'a'.repeat(30)}1${'b'.repeat(40)}`
const fx = (key, over) => {
	const doc = makeDoc({ name: key, ...over })
	FIX[key] = doc
	return doc
}
const fixtureDocs = []
const add = (key, over) => fixtureDocs.push(fx(key, over))

add('cap-before-after', { name: 'Garage floor job', caption: 'Before and after' })
add('cap-before-only', { name: 'Garage prep', caption: 'Before the remodel started' })
add('cap-after-before', { name: 'Garage reverse', caption: 'After and before' })
add('cap-before-amp', { name: 'Garage ampersand', caption: 'Before & After' })
add('cap-before-after-alt', { name: 'Garage alt text', altText: 'Before and after of the garage' })
add('tag-before-after', { name: 'Garage tagged', tags: [manual('Before and After')] })
add('name-the-who', { name: 'The Who', filename: 'the-who.jpg' })
add('name-the-theater', { name: 'Theater lobby', filename: 'theater-lobby.jpg' })
add('name-who-we-are', { name: 'Who we are', filename: 'who-we-are.jpg' })
add('name-it-is', { name: 'It Is What It Is', filename: 'it-is.jpg' })
add('cap-for-sale', { name: 'Elm Street listing', caption: 'House for sale on Elm Street' })
add('cap-sale-no-for', { name: 'Sale sign', caption: 'Sale starts today' })
add('cap-sale-for', { name: 'Sale crowd', caption: 'Sale for everyone' })
add('cap-for-rent', { name: 'Rent sign', caption: 'Apartment for rent' })
add('cap-kitchen-remodel', { name: 'Maple cabinets', caption: 'Kitchen remodel with new cabinets' })
add('name-camel', { name: 'KitchenRemodel_final', filename: 'KitchenRemodel_final.jpg' })
add('name-joined', { name: 'kitchenremodel', filename: 'kitchenremodel.png', contentType: 'image/png' })
add('cap-hyphen', { name: 'Gallery shot', caption: 'The kitchen-remodel gallery' })
add('cap-reverse', { name: 'Reverse order', caption: 'Remodel the kitchen' })
add('cap-split', { name: 'Split words', caption: 'Kitchen photos and a remodel plan' })
add('tag-kitchen', { name: 'Frame 201', tags: [manual('Kitchen')] })
add('tag-kitchen-auto', { name: 'Frame 202', tags: [auto('Kitchen', 0.8)] })
add('tag-kitchens', { name: 'Frame 203', tags: [manual('Kitchens')] })
add('kw-kitchen', { name: 'Frame 204', keywords: ['kitchen', 'cabinets'] })
add('tag-old-name', { name: 'Frame 205', tags: [manual('Old Name')] })
add('tag-h6', { name: 'Frame 206', tags: [manual('H6')] })
add('tag-kit-prefix', { name: 'Frame 207', tags: [manual('Kit Bag'), manual('Kitting')] })
add('tag-bath', { name: 'Frame 208', tags: [manual('Bathroom')] })
add('iphone', { name: 'iPhone15', filename: 'iPhone15.jpg' })
add('cafe', { name: 'Café Menu', caption: 'Crème brûlée', folderId: FOLDER_ID.cafe })
add('cjk', { name: '日本', caption: '東京タワー' })
add('cyrillic', { name: 'Фото галерея', caption: 'Новый дом' })
add('h2o', { name: 'H2O bottle', filename: 'h2o-bottle.png', contentType: 'image/png' })
add('four-k', { name: '4K banner', filename: '4k-banner.jpg' })
add('one-letter', { name: 'x marks the spot', filename: 'x-marks.jpg' })
add('long-run', { name: 'Long run', caption: `photo ${LONG_RUN}` })
add('siding-word', { name: 'Siding crew', caption: 'Vinyl siding install' })
add('side-word', { name: 'Side yard', caption: 'The side of the house' })
add('painting', { name: 'Painting crew', caption: 'Painting the trim' })
// Neutral names on purpose: these match a folder word only through the folder tree.
add('folder-hero', { name: 'Frame 101', folderId: FOLDER_ID.hero })
add('folder-acme', { name: 'Frame 102', folderId: FOLDER_ID.acme })
add('folder-ba', { name: 'Frame 103', folderId: FOLDER_ID.ba })
add('folder-beta', { name: 'Frame 104', folderId: FOLDER_ID.beta })
add('folder-kitchenf', { name: 'Frame 105', folderId: FOLDER_ID.kitchenf })
add('folder-social', { name: 'Frame 106', folderId: FOLDER_ID.social })
add('folder-archive', { name: 'Frame 107', folderId: FOLDER_ID.archive })
add('auto-high', { name: 'Auto high', tags: [auto('Roofing', 1)] })
add('auto-low', { name: 'Auto low', tags: [auto('Roofing', 0.6)] })
add('text-grand', { name: 'Storefront', textInImage: 'GRAND OPENING', kind: 'photo' })
add('text-grand-open-all', { name: 'Banner two', textInImage: 'Opening of the Grand Hotel' })
add('notes-long', { name: 'Notes long', notes: `${'deck patio fence '.repeat(110)}deck` })
add('look-png', { name: 'Look png', filename: 'look.png', contentType: 'image/png', hasAlpha: true, kind: 'logo', orientation: 'square', width: 800, height: 800 })
add('look-gif', { name: 'Look gif', filename: 'look.gif', contentType: 'image/gif', animated: true })
add('color-blue', { name: 'Blue thing', colors: colorsOf('blue', 'white'), brightness: 'light', saturation: 'vivid' })
add('color-gray', { name: 'Gray thing', colors: colorsOf('gray'), brightness: 'dark', saturation: 'monochrome' })
add('dark-roof', { name: 'Dark roof', colors: colorsOf('black', 'brown'), brightness: 'dark', tags: [manual('Roof')] })
add('natural-light', { name: 'Window light', tags: [auto('Natural light', 0.85)], brightness: 'mid' })
add('state-pending', { name: 'Pending shot', tagging: { status: 'pending', attempts: 0 } })
add('state-running', { name: 'Running shot', tagging: { status: 'running', attempts: 1 } })
add('state-failed', { name: 'Failed shot', tagging: { status: 'failed', attempts: 3, error: 'The AI service is unavailable.' } })
add('state-skipped', { name: 'Skipped shot', tagging: { status: 'skipped', attempts: 0, reason: 'not_configured' } })
add('reviewed', { name: 'Reviewed shot', tags: [manual('Deck'), manual('Patio')] })
add('unreviewed', { name: 'Unreviewed shot', tags: [manual('Deck'), auto('Patio', 0.7)] })
add('captioned-ws', { name: 'Captioned blank', caption: ' ' })
add('d-start', { name: 'Day start', createdAt: new Date('2026-03-01T00:00:00.000Z') })
add('d-end', { name: 'Day end', createdAt: new Date('2026-03-01T23:59:59.999Z') })
add('d-before', { name: 'Day before', createdAt: new Date('2026-02-28T23:59:59.999Z') })
add('d-after', { name: 'Day after', createdAt: new Date('2026-03-02T00:00:00.000Z') })
add('d-7d', { name: 'Seven days exactly', createdAt: new Date(NOW.getTime() - 7 * DAY) })
add('d-7d-minus', { name: 'Seven days and a ms', createdAt: new Date(NOW.getTime() - 7 * DAY - 1) })
add('s-2mb', { name: 'Exactly 2 MB', bytes: 2 * 1024 * 1024 })
add('s-2mb-plus', { name: 'Just over 2 MB', bytes: 2 * 1024 * 1024 + 1 })
add('s-500kb', { name: 'Exactly 500 KB', bytes: 500 * 1024 })
add('w-1200', { name: 'Width 1200', width: 1200, height: 900 })
add('w-1201', { name: 'Width 1201', width: 1201, height: 900 })
add('w-800', { name: 'Width 800', width: 800, height: 600 })

/* ---- malformed rows: a missing field must read the same in Mongo and in memory ---- */

const strip = (doc, ...keys) => {
	const copy = { ...doc }
	for (const key of keys) delete copy[key]
	return copy
}
const malformed = [
	strip(makeDoc({ name: 'Malformed no tags' }), 'tags', 'tagging', 'folderId'),
	{ ...strip(makeDoc({ name: 'Malformed null caption' }), 'colorNames', 'altText'), caption: null, keywords: null },
	strip(makeDoc({ name: 'Malformed no strings' }), 'caption', 'notes', 'keywords', 'kind', 'brightness', 'saturation'),
]
for (const doc of malformed) fixtureDocs.push(doc)
FIX['malformed-1'] = malformed[0]
FIX['malformed-2'] = malformed[1]
FIX['malformed-3'] = malformed[2]

/* ---- the generated bulk ---------------------------------------------------- */

const next = rng(20261003)
const pick = (list) => list[Math.floor(next() * list.length)]
const between = (low, high) => low + Math.floor(next() * (high - low + 1))
const chance = (p) => next() < p
const pickMany = (list, count) => {
	const copy = [...list]
	const out = []
	while (out.length < count && copy.length > 0) out.push(copy.splice(Math.floor(next() * copy.length), 1)[0])
	return out
}

const NOUNS = ['kitchen', 'bathroom', 'roof', 'deck', 'fence', 'garage', 'window', 'door', 'siding', 'floor', 'cabinet', 'countertop', 'shower', 'sink', 'faucet', 'truck', 'van', 'crew', 'technician', 'ladder', 'paint', 'tile', 'drywall', 'patio', 'driveway', 'garden', 'lawn', 'pool', 'furnace', 'heater', 'pipe', 'panel', 'lamp', 'team', 'house', 'office', 'logo', 'banner']
const ADJECTIVES = ['modern', 'rustic', 'wooden', 'new', 'finished', 'clean', 'bright', 'luxury', 'small', 'large', 'historic', 'custom']
const ACTIONS = ['remodel', 'remodeling', 'install', 'installed', 'repair', 'repaired', 'painting', 'cleaning']
const MANUAL_LABELS = ['Kitchen', 'Bathroom', 'Roof', 'Deck', 'Fence', 'Garage', 'Windows', 'Doors', 'Siding', 'Flooring', 'Cabinets', 'Countertops', 'Showers', 'Sinks', 'Trucks', 'Vans', 'Crew', 'Technicians', 'Before and After', 'Kitchen Remodel', 'Bathroom Remodel', 'Curb Appeal', 'Customer Favorite', 'Hero', 'Logo', 'Team Photo', 'Blue']
const AUTO_LABELS = ['Kitchen', 'Cabinetry', 'Countertop', 'Sink', 'Bathroom', 'Tile', 'Roof', 'Shingles', 'Deck', 'Patio', 'Van', 'Truck', 'Person', 'People', 'Tools', 'Ladder', 'Garden', 'Lawn', 'Pool', 'Interior', 'Exterior', 'Modern', 'Rustic', 'Natural light']
const TEXTS = ['GRAND OPENING', 'Open 7 days', 'Call now', 'Sale', 'Welcome to the shop', 'Free estimates', 'Since 1998']
const FOLDER_KEYS = [null, null, null, ...FOLDER_DEFS.map(([key]) => key)]
const FORMATS = [['image/jpeg', 0.5], ['image/png', 0.25], ['image/webp', 0.12], ['image/avif', 0.05], ['image/gif', 0.08]]
const KINDS = ['photo', 'photo', 'photo', 'illustration', 'logo', 'icon', 'screenshot', 'graphic', 'pattern', 'diagram', 'other', null]
const STATES = ['done', 'done', 'done', 'done', 'done', 'done', 'done', 'pending', 'running', 'failed', 'skipped', 'skipped']
const cap = (word) => word[0].toUpperCase() + word.slice(1)

function captionFor() {
	const [a, b, adj, action] = [pick(NOUNS), pick(NOUNS), pick(ADJECTIVES), pick(ACTIONS)]
	switch (between(0, 8)) {
		case 0:
			return `Before and after of a ${adj} ${a} ${action}`
		case 1:
			return `The ${adj} ${a} in the ${b}`
		case 2:
			return `A ${adj} ${a} with a ${b}`
		case 3:
			return `Our ${a} ${action} for the ${b}`
		case 4:
			return `${cap(a)} and ${b} at the end of the day`
		case 5:
			return `Photo of the crew at work on a ${a}`
		case 6:
			return `${cap(adj)} ${a}, ${b} to the left`
		default:
			return ''
	}
}

function generated() {
	const type = (() => {
		let roll = next()
		for (const [name, weight] of FORMATS) {
			if (roll < weight) return name
			roll -= weight
		}
		return 'image/jpeg'
	})()
	const noun = pick(NOUNS)
	const adj = pick(ADJECTIVES)
	const width = between(200, 6000)
	const height = between(200, 6000)
	const state = pick(STATES)
	const labels = new Map()
	for (const label of pickMany(MANUAL_LABELS, between(0, 3))) labels.set(slugify(label), manual(label))
	if (state === 'done') {
		for (const label of pickMany(AUTO_LABELS, between(0, 5))) {
			const tag = auto(label, Math.round((0.6 + next() * 0.4) * 100) / 100)
			if (!labels.has(tag.slug)) labels.set(tag.slug, tag)
		}
		if (chance(0.3)) {
			const tag = fromName(noun)
			if (!labels.has(tag.slug)) labels.set(tag.slug, tag)
		}
	}
	const styles = [`${noun}-${adj}-${between(1, 99)}`, `${noun} ${pick(NOUNS)}`, `IMG-${between(1000, 9999)}`, `${adj} ${noun}`]
	const name = pick(styles)
	const colorCount = between(0, 4)
	const hasText = chance(0.12)
	return makeDoc({
		name,
		filename: `${name.replace(/ /g, '-')}.${EXT[type]}`,
		contentType: type,
		folderId: ((key) => (key ? FOLDER_ID[key] : null))(pick(FOLDER_KEYS)),
		width,
		height,
		bytes: between(8_000, 21_000_000),
		orientation: width > height * 1.2 ? 'landscape' : height > width * 1.2 ? 'portrait' : 'square',
		hasAlpha: type !== 'image/jpeg' && chance(0.4),
		animated: type === 'image/gif' || (type === 'image/webp' && chance(0.1)),
		colors: colorsOf(...pickMany(COLOR_NAMES, colorCount)),
		brightness: pick(T.MEDIA_BRIGHTNESS),
		saturation: pick(T.MEDIA_SATURATION),
		tags: [...labels.values()],
		caption: state === 'done' ? captionFor() : '',
		altText: chance(0.3) ? `${cap(adj)} ${noun}` : '',
		textInImage: hasText ? pick(TEXTS) : '',
		keywords: state === 'done' && chance(0.5) ? pickMany(NOUNS, between(2, 6)) : [],
		kind: pick(KINDS),
		notes: chance(0.1) ? Array.from({ length: between(8, 200) }, () => pick(NOUNS)).join(' ') : '',
		tagging: { status: state, attempts: state === 'failed' ? 3 : state === 'done' ? 1 : 0 },
		createdAt: new Date(Date.UTC(2025, 5, 1) + next() * (Date.UTC(2026, 2, 14) - Date.UTC(2025, 5, 1))),
	})
}

const bulk = Array.from({ length: 360 }, generated)
const CORPUS = [...fixtureDocs, ...bulk]
const IDS = new Map(CORPUS.map((doc) => [doc._id.toString(), doc]))
const nameOf = (id) => IDS.get(id)?.name
const keyOfFixture = new Map(Object.entries(FIX).map(([key, doc]) => [doc._id.toString(), key]))

/* -------------------------------------------------------------------------- */
/* The oracle: the spec's semantics, restated by hand over the raw fields     */
/* -------------------------------------------------------------------------- */

const FORMAT_WORDS = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/avif': ['avif'], 'image/gif': ['gif'] }
const usable = (list) => list.filter((s) => typeof s === 'string' && s.trim())

/** The strings behind each field, read from the raw document (spec section 4.1), not from terms.ts. */
function fieldStrings(doc) {
	const f = { tag: [], auto: [], file: [], name: [], caption: [], text: [], keyword: [], notes: [], color: [], look: [] }
	for (const tag of Array.isArray(doc.tags) ? doc.tags : []) {
		if (tag.source === 'manual') f.tag.push(tag.label, tag.slug)
		else if (tag.via === 'filename') f.file.push(tag.label)
		else f.auto.push(tag.label)
	}
	f.name.push(doc.name, doc.filename)
	f.caption.push(doc.caption, doc.altText)
	f.text.push(doc.textInImage)
	if (Array.isArray(doc.keywords)) f.keyword.push(...doc.keywords)
	f.notes.push(doc.notes)
	for (const color of Array.isArray(doc.colors) ? doc.colors : []) f.color.push(color.name)
	f.look.push(...(FORMAT_WORDS[doc.contentType] ?? []), doc.orientation, doc.kind, doc.animated === true ? 'animated' : '', doc.hasAlpha === true ? 'transparent' : '')
	for (const key of Object.keys(f)) f[key] = usable(f[key])
	return f
}

const VIEWS = new WeakMap()
function viewOf(doc) {
	let out = VIEWS.get(doc)
	if (!out) {
		out = {}
		const f = fieldStrings(doc)
		for (const key of Object.keys(f)) {
			const surface = new Set()
			const stems = new Set()
			for (const s of f[key]) {
				const sets = indexTokenSets(s)
				for (const x of sets.surface) surface.add(x)
				for (const x of sets.stems) stems.add(x)
			}
			out[key] = { surface, stems, strings: f[key] }
		}
		VIEWS.set(doc, out)
	}
	return out
}

/** Phrase folding, written separately from text.ts: `&` is "and", accents go, everything else is a space. */
const fold = (s) =>
	` ${String(s).replace(/&/g, ' and ').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
const size = (word) => [...word].length

const hitIn = (surface, stems, word, prefix) =>
	surface.has(word) || stems.has(stem(word)) || (prefix && [...surface].some((token) => token.startsWith(word)))

/** A term: any field by word, stem or (2+ characters) prefix; or a folder name on the doc's chain (3+ for a prefix). */
function termHit(doc, word, prefix = false) {
	const v = viewOf(doc)
	for (const key of Object.keys(v)) if (hitIn(v[key].surface, v[key].stems, word, prefix && size(word) >= 2)) return true
	for (const folder of folderChainOfDoc(doc)) {
		const sets = indexTokenSets(folder.name)
		if (hitIn(new Set(sets.surface), new Set(sets.stems), word, prefix && size(word) >= 3)) return true
	}
	return false
}

/** A phrase: consecutive whole words inside ONE string of one field. Implicit: the joined run also counts. */
function phraseHit(doc, phrase, implicit = false) {
	const needle = ` ${phrase} `
	const joined = ` ${phrase.replace(/ /g, '')} `
	for (const list of Object.values(fieldStrings(doc))) {
		for (const s of list) {
			const folded = fold(s)
			if (folded.includes(needle) || (implicit && folded.includes(joined))) return true
		}
	}
	return false
}

/**
 * name: / caption: / text: for ONE value. Every non-stopword word must be in that field;
 * a value of only stopwords is matched as consecutive words of the field's text; with
 * other words present, stopwords are ignored. A star makes the last word a prefix.
 */
function valueHit(doc, field, value, prefix = false) {
	const key = { name: 'name', caption: 'caption', text: 'text' }[field]
	const v = viewOf(doc)[key]
	const words = value.split(' ')
	const last = words.length - 1
	const starred = prefix && size(words[last]) >= 2
	const content = words.map((word, index) => ({ word, prefix: starred && index === last })).filter((w) => !STOPWORDS.has(w.word) || w.prefix)
	if (content.length === 0) return v.strings.some((s) => fold(s).includes(` ${value} `))
	return content.every((w) => hitIn(v.surface, v.stems, w.word, w.prefix))
}

const slugsOfDoc = (doc) => (Array.isArray(doc.tags) ? doc.tags.map((tag) => tag.slug) : [])

const fkey = (s) => s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const pathOfKey = (key) => chainOf(key).reverse().map((f) => f.name).join('/')
/** The folders a `folder:` value names: a path, else an exact name, else a name prefix of 3+ characters. */
function folderRoots(value) {
	const wanted = value.split('/').map(fkey).join('/')
	const byPath = FOLDER_DEFS.filter(([key]) => pathOfKey(key).split('/').map(fkey).join('/') === wanted).map(([key]) => key)
	if (byPath.length) return byPath
	const exact = FOLDER_DEFS.filter(([, name]) => fkey(name) === fkey(value)).map(([key]) => key)
	if (exact.length) return exact
	return fkey(value).length >= 3 ? FOLDER_DEFS.filter(([, name]) => fkey(name).startsWith(fkey(value))).map(([key]) => key) : []
}

const O = {
	term: (word, { prefix = false } = {}) => (doc) => termHit(doc, word, prefix),
	phrase: (phrase, implicit = false) => (doc) => phraseHit(doc, phrase, implicit),
	value: (field, value, prefix = false) => (doc) => valueHit(doc, field, value, prefix),
	tag: (...slugs) => (doc) => slugsOfDoc(doc).some((slug) => slugs.includes(slug)),
	tagPrefix: (...prefixes) => (doc) => slugsOfDoc(doc).some((slug) => prefixes.some((p) => slug.startsWith(p))),
	folder: (...values) => (doc) => {
		const roots = values.flatMap(folderRoots)
		return folderChainOfDoc(doc).some((f) => roots.includes(f.key))
	},
	unfiled: (doc) => !doc.folderId,
	not: (o) => (doc) => !o(doc),
	and: (...os) => (doc) => os.every((o) => o(doc)),
	or: (...os) => (doc) => os.some((o) => o(doc)),
	any: () => true,
	none: () => false,
	where: (fn) => fn,
}

/** Rows that are missing fields on purpose. Mongo-versus-memory checks cover them; the hand oracles do not. */
const MALFORMED = new Set(malformed.map((doc) => doc._id.toString()))

/**
 * Every term in the library with the number of documents holding it: what
 * `loadVocabulary` builds with an aggregation, built here by hand from `terms`.
 */
const VOCAB = new Map()
for (const doc of CORPUS) for (const term of new Set(doc.terms)) VOCAB.set(term, (VOCAB.get(term) ?? 0) + 1)

/** A typo word's stand-ins: a vocabulary candidate present as a word or a stem of a field, or of a folder name. */
O.fuzzy = (word) => (doc) => {
	const candidates = fuzzyCandidates(word, VOCAB)
	const inSets = (surface, stems) => candidates.some((c) => surface.has(c) || stems.has(c))
	if (Object.values(viewOf(doc)).some((one) => inSets(one.surface, one.stems))) return true
	return folderChainOfDoc(doc).some((f) => {
		const sets = indexTokenSets(f.name)
		return inSets(new Set(sets.surface), new Set(sets.stems))
	})
}

/* -------------------------------------------------------------------------- */
/* The query suite                                                            */
/* -------------------------------------------------------------------------- */

const REDIRECTS = new Map([
	['old-name', 'kitchen'],
	['cycle-a', 'cycle-b'],
	['cycle-b', 'cycle-a'],
	['self', 'self'],
	['chain-1', 'chain-2'],
	['chain-2', 'chain-3'],
	['chain-3', 'kitchen'],
	...[1, 2, 3, 4, 5, 6, 7].map((n) => [`h${n}`, `h${n + 1}`]),
	['h8', 'kitchen'],
])
const ctxFor = (opts = {}) => ({
	workspaceId: W,
	userId: 'proof',
	now: NOW,
	folders: FOLDERS,
	tagRedirects: opts.tagRedirects ?? REDIRECTS,
	vocabulary: opts.vocabulary ?? null,
	prefixLast: opts.prefixLast ?? false,
})
const parsed = (text) => parseQuery(text, { now: NOW })

const Q = []
/**
 * One query. `oracle` is the hand-derived expectation over the whole library; `has` and
 * `lacks` name fixtures that must and must not match; `same` names another query that
 * must give an identical set; `opts` are the plan context (prefixLast, vocabulary).
 */
const q = (text, oracle = null, extra = {}) => Q.push({ text, oracle, ...extra })
const PL = { prefixLast: true }

/* ---- terms, stems, one-letter words, other scripts ---- */
q('kitchen', O.term('kitchen'), { has: ['tag-kitchen', 'tag-kitchen-auto', 'tag-kitchens', 'kw-kitchen', 'cap-kitchen-remodel', 'cap-reverse', 'cap-split', 'cap-hyphen', 'name-camel', 'folder-kitchenf'], lacks: ['name-joined', 'cap-before-after'] })
q('KITCHEN', O.term('kitchen'), { same: 'kitchen' })
q('kitchens', O.term('kitchens'), { has: ['tag-kitchen', 'tag-kitchens'] })
q('remodeling', O.term('remodeling'), { has: ['cap-kitchen-remodel', 'cap-reverse'] })
q('kitchen bathroom', O.and(O.term('kitchen'), O.term('bathroom')))
q('kitchen remodel', O.and(O.term('kitchen'), O.term('remodel')), { has: ['cap-kitchen-remodel', 'cap-split', 'cap-hyphen', 'cap-reverse', 'name-camel', 'folder-kitchenf'], lacks: ['name-joined', 'tag-kitchen'] })
q('kitc*', O.term('kitc', { prefix: true }), { has: ['tag-kitchen', 'name-camel', 'name-joined'], lacks: ['tag-kit-prefix'] })
q('ki*', O.term('ki', { prefix: true }), { has: ['tag-kit-prefix', 'tag-kitchen'] })
q('k*', O.term('k'), { lacks: ['tag-kit-prefix', 'tag-kitchen'] })
q('x', O.term('x'), { has: ['one-letter'] })
q('x*', O.term('x'), { has: ['one-letter'], same: 'x' })
q('kitchen -bathroom', O.and(O.term('kitchen'), O.not(O.term('bathroom'))))
q('siding', O.term('siding'), { has: ['siding-word', 'side-word'] })
q('side', O.term('side'), { has: ['siding-word', 'side-word'], same: 'siding' })
q('iphone', O.term('iphone'), { has: ['iphone'] })
q('iPhone15', O.term('iphone15'), { has: ['iphone'] })
q('phone', O.term('phone'), { has: ['iphone'] })
q('15', O.term('15'), { has: ['iphone'] })
q('4k', O.term('4k'), { has: ['four-k'] })
q('h2o', O.term('h2o'), { has: ['h2o'] })
q('zzzzqq', O.none)
q('café', O.term('cafe'), { has: ['cafe'] })
q('日本', O.term('日本'), { has: ['cjk'] })
q('東京タワー', O.term('東京タワー'), { has: ['cjk'] })
q('日本*', O.term('日本', { prefix: true }), { has: ['cjk'] })
q('фот*', O.term('фот', { prefix: true }), { has: ['cyrillic'] })
q('ФОТО', O.term('фото'), { has: ['cyrillic'] })
q('"фото галерея"', O.phrase('фото галерея'), { has: ['cyrillic'] })
q('name:гале*', O.value('name', 'гале', true), { has: ['cyrillic'] })
q('photo', O.term('photo'))
q('landscape', O.term('landscape'))
q('png', O.term('png'), { has: ['name-joined', 'look-png', 'h2o'] })
q('jpeg', O.term('jpeg'), { has: ['cap-before-after'] })
q('animated', O.term('animated'), { has: ['look-gif'] })
q('transparent', O.term('transparent'), { has: ['look-png'] })
q('blue', O.term('blue'), { has: ['color-blue'] })
q('natural light', O.and(O.term('natural'), O.term('light')), { has: ['natural-light'] })
q('painting', O.term('painting'), { has: ['painting'] })
q('deck patio fence', O.and(O.term('deck'), O.term('patio'), O.term('fence')), { has: ['notes-long'] })

/* ---- phrases ---- */
q('"before and after"', O.phrase('before and after'), { has: ['cap-before-after', 'cap-before-amp', 'cap-before-after-alt', 'tag-before-after'], lacks: ['cap-before-only', 'cap-after-before', 'folder-ba'] })
q('"the who"', O.phrase('the who'), { has: ['name-the-who'], lacks: ['name-the-theater', 'name-who-we-are', 'name-it-is'] })
q('"for sale"', O.phrase('for sale'), { has: ['cap-for-sale'], lacks: ['cap-sale-for', 'cap-sale-no-for', 'cap-for-rent'] })
q('"kitchen remodel"', O.phrase('kitchen remodel'), { has: ['cap-kitchen-remodel', 'cap-hyphen'], lacks: ['name-camel', 'name-joined', 'cap-reverse', 'cap-split'] })
q('kitchen-remodel', O.phrase('kitchen remodel', true), { has: ['cap-kitchen-remodel', 'cap-hyphen', 'name-camel', 'name-joined'], lacks: ['cap-reverse', 'cap-split'] })
q('kitchenremodel', O.term('kitchenremodel'), { has: ['name-camel', 'name-joined'], lacks: ['cap-kitchen-remodel', 'cap-hyphen'] })
q('"remodel kitchen"', O.phrase('remodel kitchen'), { lacks: ['cap-kitchen-remodel', 'cap-reverse'] })
q('before-and-after', O.phrase('before and after', true), { has: ['cap-before-after', 'cap-before-amp', 'tag-before-after'], lacks: ['cap-after-before'] })
q('before & after', O.and(O.term('before'), O.term('after')), { has: ['cap-before-after', 'cap-before-amp', 'cap-after-before', 'folder-ba'], lacks: ['cap-before-only'] })
q('"kitchen"', O.phrase('kitchen'), { has: ['tag-kitchen', 'tag-kitchen-auto', 'kw-kitchen'], lacks: ['tag-kitchens', 'name-joined'] })
q('"a"', O.phrase('a'))
q('t-shirt', O.phrase('t shirt', true))
q('""', O.any)
q('"hero shots"', O.phrase('hero shots'), { lacks: ['folder-hero'] })
// The index cannot hold a 71-character run, so neither side may match it as a phrase word.
q(`"photo ${LONG_RUN}"`, O.none)
q(LONG_RUN, O.none)

/* ---- field-scoped text ---- */
q('name:the', O.value('name', 'the'), { has: ['name-the-who', 'one-letter'], lacks: ['name-the-theater'] })
q('name:who', O.value('name', 'who'), { has: ['name-the-who', 'name-who-we-are'], lacks: ['name-the-theater'] })
q('name:"the who"', O.value('name', 'the who'), { has: ['name-the-who'], lacks: ['name-who-we-are', 'name-the-theater'] })
q('name:"who we are"', O.value('name', 'who we are'), { has: ['name-who-we-are'], lacks: ['name-the-who'] })
q('name:kitchen', O.value('name', 'kitchen'), { has: ['name-camel'], lacks: ['tag-kitchen', 'cap-kitchen-remodel'] })
q('name:kit*', O.value('name', 'kit', true), { has: ['name-camel', 'name-joined'] })
q('name:the,hero', O.or(O.value('name', 'the'), O.value('name', 'hero')), { has: ['name-the-who'] })
q('name:kitchenremodel', O.value('name', 'kitchenremodel'), { has: ['name-camel', 'name-joined'] })
q('caption:"for sale"', O.value('caption', 'for sale'), { has: ['cap-for-sale', 'cap-sale-no-for', 'cap-sale-for'], lacks: ['cap-for-rent'] })
q('caption:sale', O.value('caption', 'sale'), { same: 'caption:"for sale"' })
q('caption:"before and after"', O.value('caption', 'before and after'), { has: ['cap-before-after', 'cap-after-before', 'cap-before-amp', 'cap-before-after-alt'], lacks: ['cap-before-only', 'tag-before-after'] })
q('text:grand', O.value('text', 'grand'), { has: ['text-grand', 'text-grand-open-all'] })
q('text:"grand opening"', O.value('text', 'grand opening'), { has: ['text-grand', 'text-grand-open-all'] })
q('caption:the', O.value('caption', 'the'), { has: ['cap-hyphen', 'cap-reverse'] })
q('name:png', O.value('name', 'png'), { has: ['name-joined', 'h2o', 'look-png'] })
q('caption:kitchen name:the', O.and(O.value('caption', 'kitchen'), O.value('name', 'the')))

/* ---- prefixLast, folder words and the length rules ---- */
q('kitchen remo', O.and(O.term('kitchen'), O.term('remo', { prefix: true })), { opts: PL, has: ['cap-kitchen-remodel'] })
q('kitc', O.term('kitc', { prefix: true }), { opts: PL, has: ['tag-kitchen', 'name-joined'] })
q('kitc', O.none)
q('k', O.term('k'), { opts: PL })
q('x', O.term('x'), { opts: PL, has: ['one-letter'] })
q('ba', O.term('ba', { prefix: true }), { opts: PL })
q('bat', O.term('bat', { prefix: true }), { opts: PL, has: ['tag-bath'] })
q('acm', O.term('acm', { prefix: true }), { opts: PL, has: ['folder-acme', 'folder-hero', 'folder-ba'], lacks: ['folder-beta'] })
q('ac', O.term('ac', { prefix: true }), { opts: PL, lacks: ['folder-acme', 'folder-hero'] })
q('kitchen type:png remo', O.and(O.term('kitchen'), O.where((d) => d.contentType === 'image/png'), O.term('remo', { prefix: true })), { opts: PL })
q('kitchen -blu', O.and(O.term('kitchen'), O.not(O.term('blu'))), { opts: PL })
q('acme', O.term('acme'), { has: ['folder-acme', 'folder-hero', 'folder-ba'], lacks: ['folder-beta', 'folder-social'] })
q('hero', O.term('hero'), { has: ['folder-hero'], lacks: ['folder-acme'] })
q('shot', O.term('shot'), { has: ['folder-hero'] })
q('before', O.term('before'), { has: ['folder-ba', 'cap-before-after'] })
q('clients', O.term('clients'), { has: ['folder-acme', 'folder-hero', 'folder-ba', 'folder-beta'], lacks: ['folder-social'] })
q('media*', O.term('media', { prefix: true }), { has: ['folder-social'] })
q('mark*', O.term('mark', { prefix: true }), { has: ['folder-social', 'one-letter'] })

/* ---- tag: with redirects (old -> new, chains, a hop cap, a cycle) ---- */
q('tag:kitchen', O.tag('kitchen'), { has: ['tag-kitchen', 'tag-kitchen-auto'], lacks: ['tag-kitchens', 'kw-kitchen'], corrections: [] })
q('#kitchen', O.tag('kitchen'), { same: 'tag:kitchen' })
q('TAG:Kitchen', O.tag('kitchen'), { same: 'tag:kitchen' })
q('tag:kitchen,bathroom', O.tag('kitchen', 'bathroom'), { has: ['tag-kitchen', 'tag-bath'] })
q('tag:kit*', O.tagPrefix('kit'), { has: ['tag-kitchen', 'tag-kitchens', 'tag-kit-prefix'] })
q('tag:kit*,bath', O.or(O.tagPrefix('kit'), O.tag('bath')))
q('tag:old-name', O.tag('kitchen'), { has: ['tag-kitchen'], lacks: ['tag-old-name'], corrections: [{ from: 'tag:old-name', to: 'tag:kitchen' }] })
q('tag:chain-1', O.tag('kitchen'), { has: ['tag-kitchen'], corrections: [{ from: 'tag:chain-1', to: 'tag:kitchen' }] })
q('tag:h1', O.tag('h6'), { has: ['tag-h6'], lacks: ['tag-kitchen'], corrections: [{ from: 'tag:h1', to: 'tag:h6' }] })
q('tag:cycle-a', O.tag('cycle-b'), { corrections: [{ from: 'tag:cycle-a', to: 'tag:cycle-b' }] })
q('tag:cycle-b', O.tag('cycle-a'), { corrections: [{ from: 'tag:cycle-b', to: 'tag:cycle-a' }] })
q('tag:self', O.tag('self'), { corrections: [] })
q('tag:ghost', O.none, { corrections: [] })
q('-tag:kitchen', O.not(O.tag('kitchen')))
q('-tag:old-name', O.not(O.tag('kitchen')), { corrections: [{ from: 'tag:old-name', to: 'tag:kitchen' }] })
q('tag:kitchen tag:blue', O.and(O.tag('kitchen'), O.tag('blue')))
q('tag:old-name tag:chain-1', O.tag('kitchen'), { corrections: [{ from: 'tag:old-name', to: 'tag:kitchen' }, { from: 'tag:chain-1', to: 'tag:kitchen' }] })
q('tag:old-name tag:old-name', O.tag('kitchen'), { corrections: [{ from: 'tag:old-name', to: 'tag:kitchen' }] })
q('tag:old-name,bathroom', O.tag('kitchen', 'bathroom'), { corrections: [{ from: 'tag:old-name', to: 'tag:kitchen' }] })
q('tag:h1*', O.tagPrefix('h1'), { corrections: [] })
q('tag:"kitchen remodel"', O.tag('kitchen-remodel'))
q('tag:old-name kitchen', O.and(O.tag('kitchen'), O.term('kitchen')), { corrections: [{ from: 'tag:old-name', to: 'tag:kitchen' }] })

/* ---- structured: type, color, orientation, kind, is ---- */
const S = O.where
const colorIs = (...names) => (d) => (d.colors ?? []).some((c) => names.includes(c.name))
const tagsOf = (d) => (Array.isArray(d.tags) ? d.tags : [])
q('type:png', S((d) => d.contentType === 'image/png'), { has: ['name-joined', 'look-png'] })
q('type:jpg', S((d) => d.contentType === 'image/jpeg'))
q('type:jpeg', S((d) => d.contentType === 'image/jpeg'), { same: 'type:jpg' })
q('type:.png', S((d) => d.contentType === 'image/png'), { same: 'type:png' })
q('type:png,webp', S((d) => d.contentType === 'image/png' || d.contentType === 'image/webp'))
q('-type:gif', S((d) => d.contentType !== 'image/gif'))
q('type:gif', S((d) => d.contentType === 'image/gif'), { has: ['look-gif'] })
q('color:blue', S(colorIs('blue')), { has: ['color-blue'] })
q('color:grey', S(colorIs('gray')), { has: ['color-gray'] })
q('color:blue,green', S(colorIs('blue', 'green')))
q('color:pur', S(colorIs('purple')))
q('-color:blue', S((d) => !colorIs('blue')(d)))
q('color:blue color:white', S((d) => colorIs('blue')(d) && colorIs('white')(d)), { has: ['color-blue'] })
q('orientation:landscape', S((d) => d.orientation === 'landscape'))
q('orientation:portrait,square', S((d) => d.orientation === 'portrait' || d.orientation === 'square'), { has: ['look-png'] })
q('orientation:wide', S((d) => d.orientation === 'landscape'), { same: 'orientation:landscape' })
q('kind:logo', S((d) => d.kind === 'logo'), { has: ['look-png'] })
q('kind:photo,screenshot', S((d) => d.kind === 'photo' || d.kind === 'screenshot'))
q('kind:photos', S((d) => d.kind === 'photo'), { same: 'kind:photo' })
q('kind:photo', S((d) => d.kind === 'photo'))
q('-kind:photo', S((d) => d.kind !== 'photo'))
q('is:untagged', S((d) => Array.isArray(d.tags) && d.tags.length === 0))
q('is:tagged', S((d) => Array.isArray(d.tags) && d.tags.length > 0))
q('-is:untagged', S((d) => !(Array.isArray(d.tags) && d.tags.length === 0)))
q('is:unreviewed', S((d) => tagsOf(d).some((t) => t.source === 'auto')), { has: ['unreviewed', 'tag-kitchen-auto'], lacks: ['reviewed'] })
q('is:needsreview', S((d) => tagsOf(d).some((t) => t.source === 'auto')), { same: 'is:unreviewed' })
q('is:reviewed', S((d) => tagsOf(d).length > 0 && !tagsOf(d).some((t) => t.source === 'auto')), { has: ['reviewed', 'tag-kitchen'], lacks: ['unreviewed', 'tag-kitchen-auto'] })
q('is:unfiled', S((d) => !d.folderId))
q('is:filed', S((d) => !!d.folderId))
q('is:animated', S((d) => d.animated === true), { has: ['look-gif'] })
q('is:transparent', S((d) => d.hasAlpha === true), { has: ['look-png'] })
q('is:dark', S((d) => d.brightness === 'dark'), { has: ['color-gray', 'dark-roof'] })
q('is:light', S((d) => d.brightness === 'light'), { has: ['color-blue'] })
q('is:vivid', S((d) => d.saturation === 'vivid'))
q('is:muted', S((d) => d.saturation === 'muted'))
q('is:monochrome', S((d) => d.saturation === 'monochrome'), { has: ['color-gray'] })
q('is:pending', S((d) => ['pending', 'running'].includes(d.tagging?.status)), { has: ['state-pending', 'state-running'], lacks: ['state-failed'] })
q('is:failed', S((d) => d.tagging?.status === 'failed'), { has: ['state-failed'] })
q('is:captioned', S((d) => typeof d.caption === 'string' && d.caption !== ''), { has: ['cap-for-sale', 'captioned-ws'] })
q('is:uncaptioned', S((d) => d.caption === '' || d.caption == null), { lacks: ['cap-for-sale', 'captioned-ws'] })
q('is:dark,light', S((d) => d.brightness === 'dark' || d.brightness === 'light'))
q('is:alpha', S((d) => d.hasAlpha === true), { same: 'is:transparent' })

/* ---- numeric and date ranges (inclusive ends, exact boundaries) ---- */
const MB = 1024 * 1024
const at = (d) => d.createdAt.getTime()
q('width:>1200', S((d) => d.width > 1200), { has: ['w-1201'], lacks: ['w-1200'] })
q('width:>=1200', S((d) => d.width >= 1200), { has: ['w-1200', 'w-1201'] })
q('width:<=600', S((d) => d.width <= 600))
q('width:<800', S((d) => d.width < 800), { lacks: ['w-800'] })
q('width:800..1600', S((d) => d.width >= 800 && d.width <= 1600), { has: ['w-800', 'w-1200'] })
q('width:1600..800', S((d) => d.width >= 800 && d.width <= 1600), { same: 'width:800..1600' })
q('width:1200', S((d) => d.width === 1200), { has: ['w-1200'], lacks: ['w-1201'] })
q('width:..900', S((d) => d.width <= 900), { has: ['w-800'] })
q('width:1600..', S((d) => d.width >= 1600))
q('height:>600', S((d) => d.height > 600))
q('height:<400', S((d) => d.height < 400))
q('height:900', S((d) => d.height === 900), { has: ['w-1200', 'w-1201'] })
q('size:>2mb', S((d) => d.bytes > 2 * MB), { has: ['s-2mb-plus'], lacks: ['s-2mb'] })
q('size:>=2mb', S((d) => d.bytes >= 2 * MB), { has: ['s-2mb', 's-2mb-plus'] })
q('size:500kb..2mb', S((d) => d.bytes >= 500 * 1024 && d.bytes <= 2 * MB), { has: ['s-500kb', 's-2mb'], lacks: ['s-2mb-plus'] })
q('size:<100kb', S((d) => d.bytes < 100 * 1024))
q('size:1.5mb..', S((d) => d.bytes >= 1.5 * MB))
q('added:2026-03-01', S((d) => at(d) >= Date.UTC(2026, 2, 1) && at(d) <= Date.UTC(2026, 2, 1, 23, 59, 59, 999)), { has: ['d-start', 'd-end'], lacks: ['d-before', 'd-after'] })
q('added:>2026-01-01', S((d) => at(d) > Date.UTC(2026, 0, 1, 23, 59, 59, 999)))
q('added:<2026-01-01', S((d) => at(d) < Date.UTC(2026, 0, 1)))
q('added:2026-01-01..2026-03-31', S((d) => at(d) >= Date.UTC(2026, 0, 1) && at(d) <= Date.UTC(2026, 2, 31, 23, 59, 59, 999)), { has: ['d-start', 'd-end', 'd-after'] })
q('added:7d', S((d) => at(d) >= NOW.getTime() - 7 * DAY), { has: ['d-7d'], lacks: ['d-7d-minus'] })
q('added:>7d', S((d) => at(d) > NOW.getTime() - 7 * DAY), { lacks: ['d-7d'] })
q('added:<30d', S((d) => at(d) < NOW.getTime() - 30 * DAY))
q('added:month', S((d) => at(d) >= Date.UTC(2026, 2, 1) && at(d) <= Date.UTC(2026, 3, 1) - 1), { has: ['d-start', 'd-end', 'd-after', 'd-7d'], lacks: ['d-before'] })
q('added:year', S((d) => at(d) >= Date.UTC(2026, 0, 1) && at(d) <= Date.UTC(2027, 0, 1) - 1))
q('added:today', S((d) => at(d) >= Date.UTC(2026, 2, 15) && at(d) <= Date.UTC(2026, 2, 16) - 1))
q('added:2025', S((d) => at(d) >= Date.UTC(2025, 0, 1) && at(d) <= Date.UTC(2026, 0, 1) - 1))
q('added:2026-02', S((d) => at(d) >= Date.UTC(2026, 1, 1) && at(d) <= Date.UTC(2026, 2, 1) - 1), { has: ['d-before'] })

/* ---- folder: a path, a name, a prefix of 3+, none, nothing ---- */
q('folder:Clients/Acme', O.folder('Clients/Acme'), { has: ['folder-acme', 'folder-hero', 'folder-ba'], lacks: ['folder-beta'] })
q('folder:clients/acme', O.folder('Clients/Acme'), { same: 'folder:Clients/Acme' })
q('folder:Acme', O.folder('Acme'), { same: 'folder:Clients/Acme' })
q('folder:acm', O.folder('acm'), { same: 'folder:Clients/Acme' })
q('folder:ac', O.none, { lacks: ['folder-acme'] })
q('folder:none', O.unfiled)
q('folder:unfiled', O.unfiled, { same: 'folder:none' })
q('folder:nonexistent', O.none)
q('folder:"Clients/Acme/Hero Shots"', O.folder('Clients/Acme/Hero Shots'), { has: ['folder-hero'], lacks: ['folder-acme', 'folder-ba'] })
q('folder:Acme,Beta', O.folder('Acme', 'Beta'), { has: ['folder-acme', 'folder-beta'] })
q('folder:Acme,none', O.or(O.folder('Acme'), O.unfiled), { has: ['folder-acme'] })
q('folder:Acme,nonexistent', O.folder('Acme'), { same: 'folder:Acme' })
q('-folder:Clients', O.not(O.folder('Clients')), { has: ['folder-social'], lacks: ['folder-acme'] })
q('folder:Clients kitchen', O.and(O.folder('Clients'), O.term('kitchen')))
q('folder:"Before and After"', O.folder('Before and After'), { has: ['folder-ba'], lacks: ['folder-acme'] })
q('folder:cafe', O.folder('cafe'), { has: ['cafe'] })
q('folder:"Projects/Kitchen Remodel"', O.folder('Projects/Kitchen Remodel'), { has: ['folder-kitchenf'] })
q('folder:Projects/Kitchen Remodel', O.and(O.folder('Projects/Kitchen'), O.term('remodel')), { lacks: ['folder-kitchenf'] })
q('folder:remodel', O.none)
q('folder:Social', O.folder('Social'), { has: ['folder-social'] })
q('folder:ARCHIVE', O.folder('Archive'), { has: ['folder-archive'] })
q('folder:Marketing', O.folder('Marketing'), { has: ['folder-social'] })
q('is:filed folder:Clients', O.folder('Clients'))
q('folder:acme folder:hero', O.and(O.folder('acme'), O.folder('hero')), { has: ['folder-hero'], lacks: ['folder-acme'] })

/* ---- OR, NOT, groups ---- */
q('kitchen OR bathroom', O.or(O.term('kitchen'), O.term('bathroom')))
q('kitchen OR -blue', O.or(O.term('kitchen'), O.not(O.term('blue'))), { has: ['tag-kitchen', 'cap-before-after'], lacks: ['color-blue'] })
q('kitchen OR -tag:x', O.or(O.term('kitchen'), O.not(O.tag('x'))))
q('kitchen OR -tag:kitchen', O.or(O.term('kitchen'), O.not(O.tag('kitchen'))))
q('kitchen OR -(a b)', O.or(O.term('kitchen'), O.not(O.term('b'))))
q('kitchen OR -(deck patio)', O.or(O.term('kitchen'), O.not(O.and(O.term('deck'), O.term('patio')))))
q('-kitchen', O.not(O.term('kitchen')), { lacks: ['tag-kitchen'] })
q('NOT kitchen', O.not(O.term('kitchen')), { same: '-kitchen' })
q('-(a OR b)', O.not(O.term('b')))
q('-(deck OR patio)', O.not(O.or(O.term('deck'), O.term('patio'))))
q('kitchen (blue OR white)', O.and(O.term('kitchen'), O.or(O.term('blue'), O.term('white'))))
q('(kitchen OR bathroom) -blue', O.and(O.or(O.term('kitchen'), O.term('bathroom')), O.not(O.term('blue'))))
q('kitchen NOT blue', O.and(O.term('kitchen'), O.not(O.term('blue'))))
q('-tag:kitchen kitchen', O.and(O.not(O.tag('kitchen')), O.term('kitchen')), { has: ['tag-kitchens', 'kw-kitchen'], lacks: ['tag-kitchen'] })
q('tag:kitchen OR tag:bathroom', O.or(O.tag('kitchen'), O.tag('bathroom')))
q('is:dark OR is:light', S((d) => d.brightness === 'dark' || d.brightness === 'light'))
q('(kitchen bathroom) OR (deck patio)', O.or(O.and(O.term('kitchen'), O.term('bathroom')), O.and(O.term('deck'), O.term('patio'))))
q('kitchen OR bathroom OR deck', O.or(O.term('kitchen'), O.term('bathroom'), O.term('deck')))
q('kitchen OR', O.term('kitchen'), { same: 'kitchen' })
q('OR kitchen', O.term('kitchen'), { same: 'kitchen' })
q('kitchen OR OR bathroom', O.or(O.term('kitchen'), O.term('bathroom')))
q('((((kitchen))))', O.term('kitchen'), { same: 'kitchen' })
q('-(kitchen bathroom)', O.not(O.and(O.term('kitchen'), O.term('bathroom'))))
q('-(tag:kitchen OR type:png)', O.not(O.or(O.tag('kitchen'), S((d) => d.contentType === 'image/png'))))
q('-type:png -type:jpg', S((d) => d.contentType !== 'image/png' && d.contentType !== 'image/jpeg'))
q('--kitchen', O.term('kitchen'), { same: 'kitchen' })
q('- kitchen', O.term('kitchen'), { same: 'kitchen' })
q('kitchen -(-blue)', O.and(O.term('kitchen'), O.term('blue')))
q('kitchen OR bathroom blue', O.or(O.term('kitchen'), O.and(O.term('bathroom'), O.term('blue'))))
q('tag:kitchen OR -type:png', O.or(O.tag('kitchen'), S((d) => d.contentType !== 'image/png')))
q('-"before and after"', O.not(O.phrase('before and after')))
q('kitchen OR "before and after"', O.or(O.term('kitchen'), O.phrase('before and after')))
q('-name:the', O.not(O.value('name', 'the')))
q('kitchen OR name:the', O.or(O.term('kitchen'), O.value('name', 'the')))
q('-folder:Acme kitchen', O.and(O.not(O.folder('Acme')), O.term('kitchen')))
q('-acme', O.not(O.term('acme')), { lacks: ['folder-acme', 'folder-hero'] })

/* ---- mixed ---- */
q('kitchen type:png', O.and(O.term('kitchen'), S((d) => d.contentType === 'image/png')))
q('kitchen color:blue added:7d', O.and(O.term('kitchen'), S(colorIs('blue')), S((d) => at(d) >= NOW.getTime() - 7 * DAY)))
q('"before and after" -tag:kitchen', O.and(O.phrase('before and after'), O.not(O.tag('kitchen'))))
q('name:hero is:dark', O.and(O.value('name', 'hero'), S((d) => d.brightness === 'dark')))
q('tag:kitchen is:unreviewed', O.and(O.tag('kitchen'), S((d) => tagsOf(d).some((t) => t.source === 'auto'))))
q('kitchen -type:gif width:>1000 size:<5mb', O.and(O.term('kitchen'), S((d) => d.contentType !== 'image/gif'), S((d) => d.width > 1000), S((d) => d.bytes < 5 * MB)))
q('folder:Acme "before and after"', O.and(O.folder('Acme'), O.phrase('before and after')))
q('before after folder:Clients', O.and(O.term('before'), O.term('after'), O.folder('Clients')))
q('(kitchen OR bathroom) type:png,webp -color:white', O.and(O.or(O.term('kitchen'), O.term('bathroom')), S((d) => d.contentType === 'image/png' || d.contentType === 'image/webp'), S((d) => !colorIs('white')(d))))
q('sort:name kitchen', O.term('kitchen'), { same: 'kitchen' })
q('kitchen sort:oldest', O.term('kitchen'), { same: 'kitchen' })
q('is:untagged type:png', S((d) => Array.isArray(d.tags) && d.tags.length === 0 && d.contentType === 'image/png'))
q('is:captioned -is:pending kitchen', O.and(S((d) => typeof d.caption === 'string' && d.caption !== ''), S((d) => !['pending', 'running'].includes(d.tagging?.status)), O.term('kitchen')))
q('caption:"for sale" folder:none', O.and(O.value('caption', 'for sale'), O.unfiled))
q('tag:kitchen "kitchen remodel"', O.and(O.tag('kitchen'), O.phrase('kitchen remodel')))
q('width:>1000 height:>1000 orientation:square', S((d) => d.width > 1000 && d.height > 1000 && d.orientation === 'square'))

/* ---- hostile input: it parses to something harmless and the invariant still holds ---- */
for (const hostile of ['', '   ', '"', '(((', ')))', '-', 'OR', 'NOT', 'tag:', 'width:abc', 'type:xyz', 'sort:', ':::', '\\', '*', '**', '#', '# kitchen']) {
	q(hostile, hostile === '# kitchen' ? O.term('kitchen') : O.any)
}
q("kitchen'; db.dropDatabase(); //")
q('$where: function() { return true }')
q('{"$ne": null}')
q('.*')
q('(?i)kitchen')
q('a|b')
q('kitchen*.*')
q('^kitchen$')
q('kitchen\u0000blue')
q('‮kitchen')
q('\u{1f642} kitchen', O.term('kitchen'), { same: 'kitchen' })
q('KITCHEN​BLUE')
q('colour:blue')
q('tag:kitchen"')
q('tag:"')
q('name:"the who')
q('caption:')
q('folder:"')
q('"before and after')
q('kitchen '.repeat(60), O.term('kitchen'), { same: 'kitchen' })
q(Array(40).fill('kitchen').join(' OR '), O.term('kitchen'), { same: 'kitchen' })
q('k'.repeat(300))
q(`${'a'.repeat(200)}*`)
q('(('.repeat(5000) + 'kitchen' + '))'.repeat(5000), O.term('kitchen'), { same: 'kitchen' })
q('-('.repeat(200) + 'kitchen' + ')'.repeat(200))
q('(kitchen OR '.repeat(200) + 'bathroom' + ')'.repeat(200))
q('(-kitchen OR '.repeat(50) + 'bathroom' + ')'.repeat(50))
q('tag:a '.repeat(80))
q(`tag:${Array.from({ length: 80 }, (_, i) => `t${i}`).join(',')}`)
q(`type:${Array(60).fill('png').join(',')}`)

/* ---- more edges: scripts, spaces, words that are not operators, invalid values, contradictions ---- */
q('kitchen or bathroom', O.and(O.term('kitchen'), O.term('bathroom')), { same: 'kitchen bathroom' }) // lowercase `or` is a stopword, not an operator
q('kitchen not blue', O.and(O.term('kitchen'), O.term('not'), O.term('blue'))) // and so is lowercase `not`, but it is not a stopword
q('ＫＩＴＣＨＥＮ', O.term('kitchen'), { same: 'kitchen' }) // full-width letters fold to ASCII
q('kitchén', O.term('kitchen'), { same: 'kitchen' })
q('kitchen blue', O.and(O.term('kitchen'), O.term('blue')))
q('#kit*', O.tagPrefix('kit'), { same: 'tag:kit*' })
q('#"kitchen remodel"', O.tag('kitchen-remodel'))
q('added:2026-13-45', O.any)
q('added:abc', O.any)
q('width:..', O.any)
q('size:5xb', O.any)
q('type:png type:jpg', O.none) // an image has one format, so two ANDed type clauses match nothing
q('color:blue -color:blue', O.none)
q('is:tagged is:untagged', O.none)
q('width:>100 width:<50', O.none)
q('folder:Acme -folder:Acme', O.none)
q(`tag:${'a'.repeat(70)}`, O.none)

/* ---- typo tolerance: the second pass, planned with the library's vocabulary ---- */
const TY = { vocabulary: VOCAB }
const TYPL = { vocabulary: VOCAB, prefixLast: true }
const png = (d) => d.contentType === 'image/png'
q('kithcen', O.fuzzy('kithcen'), { opts: TY, corrections: [{ from: 'kithcen', to: 'kitchen' }], has: ['tag-kitchen', 'tag-kitchens'] })
q('kithcen', O.fuzzy('kithcen'), { opts: TYPL, corrections: [{ from: 'kithcen', to: 'kitchen' }], has: ['tag-kitchen'] })
q('kithcen bathrom', O.and(O.fuzzy('kithcen'), O.fuzzy('bathrom')), { opts: TY, corrections: [{ from: 'kithcen', to: 'kitchen' }, { from: 'bathrom', to: 'bathroom' }] })
q('kithcen -blue', O.and(O.fuzzy('kithcen'), O.not(O.term('blue'))), { opts: TY, corrections: [{ from: 'kithcen', to: 'kitchen' }] })
q('kithcen OR bathrom', O.or(O.fuzzy('kithcen'), O.fuzzy('bathrom')), { opts: TY, corrections: [{ from: 'kithcen', to: 'kitchen' }, { from: 'bathrom', to: 'bathroom' }] })
q('tag:old-name kithcen', O.and(O.tag('kitchen'), O.fuzzy('kithcen')), { opts: TY, corrections: [{ from: 'tag:old-name', to: 'tag:kitchen' }, { from: 'kithcen', to: 'kitchen' }] })
q('kitchen remodl', O.and(O.term('kitchen'), O.fuzzy('remodl')), { opts: TY, corrections: [{ from: 'remodl', to: 'remodel' }] })
q('bathrom*', O.fuzzy('bathrom'), { opts: TY, corrections: [{ from: 'bathrom', to: 'bathroom' }] })
q('kithcen type:png', O.and(O.fuzzy('kithcen'), S(png)), { opts: TY, corrections: [{ from: 'kithcen', to: 'kitchen' }] })
q('kithcen kithcen', O.fuzzy('kithcen'), { opts: TY, corrections: [{ from: 'kithcen', to: 'kitchen' }] })
q('"kithcen"', O.phrase('kithcen'), { opts: TY, corrections: [] })
q('name:kithcen', O.value('name', 'kithcen'), { opts: TY, corrections: [] })
q('-kithcen', O.not(O.term('kithcen')), { opts: TY, corrections: [] })
q('kitchen', O.term('kitchen'), { opts: TY, corrections: [], same: 'kitchen' })
q('kitchens', O.term('kitchens'), { opts: TY, corrections: [], same: 'kitchens' })
q('remodeling', O.term('remodeling'), { opts: TY, corrections: [], same: 'remodeling' })
q('acme', O.term('acme'), { opts: TY, corrections: [], same: 'acme' })
q('dek', O.term('dek'), { opts: TY, corrections: [] })
q('zzzzzzz', O.none, { opts: TY, corrections: [] })
q('kitc', O.term('kitc', { prefix: true }), { opts: TYPL, corrections: [] })
q('kitchen kithcen', O.and(O.term('kitchen'), O.fuzzy('kithcen')), { opts: TY, corrections: [{ from: 'kithcen', to: 'kitchen' }] })

/* -------------------------------------------------------------------------- */
/* Filter hygiene                                                             */
/* -------------------------------------------------------------------------- */

const OPERATORS_WITH_LISTS = new Set(['$and', '$or', '$nor'])

/** How many object/array levels deep a filter goes (BSON's own measure). */
function bsonDepth(value) {
	if (value instanceof ObjectId || value instanceof Date || value === null || typeof value !== 'object') return 0
	let deepest = 0
	for (const child of Array.isArray(value) ? value : Object.values(value)) deepest = Math.max(deepest, bsonDepth(child))
	return deepest + 1
}

/** What Mongo would reject, or what would let a user string through unescaped. */
function lintFilter(filter, path = '') {
	if (Array.isArray(filter)) return filter.forEach((child) => lintFilter(child, path))
	if (!filter || typeof filter !== 'object' || filter instanceof ObjectId || filter instanceof Date) return
	for (const [key, value] of Object.entries(filter)) {
		if (OPERATORS_WITH_LISTS.has(key) && (!Array.isArray(value) || value.length === 0)) throw new Error(`${key} must be a non-empty array`)
		if (key === '$in') {
			if (!Array.isArray(value)) throw new Error('$in must be an array')
			if (value.length === 0 && path !== '_id') throw new Error(`an empty $in outside the never-match clause (at ${path})`)
		}
		if (key === '$regex') {
			if (typeof value !== 'string' || !value.startsWith('^')) throw new Error(`$regex must be an anchored string: ${JSON.stringify(value)}`)
			// It must compile, and once the escapes are taken out nothing in it may be live syntax:
			// the pattern then means exactly the literal text it was built from.
			new RegExp(value)
			const bare = value.slice(1).replace(/\\x00/g, '').replace(/\\[.*+?^${}()|[\]\\]/g, '')
			if (/[.*+?^${}()|[\]\\]/.test(bare)) throw new Error(`$regex has unescaped syntax: ${JSON.stringify(value)}`)
		}
		if (key === '$where' || key === '$expr' || key === '$function') throw new Error(`${key} must never appear`)
		lintFilter(value, key.startsWith('$') ? path : key)
	}
}

const shapeOf = (filter) => {
	const { workspaceId, ...rest } = filter
	return JSON.parse(JSON.stringify(rest, (key, value) => (value && value._bsontype === 'ObjectId' ? `oid:${String(value).slice(-4)}` : value)))
}
const shown = (value, max = 360) => {
	const out = JSON.stringify(value)
	return out.length > max ? `${out.slice(0, max)}...` : out
}

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

const client = new MongoClient(uri)
await client.connect()
const assetsCollection = client.db().collection(T.MEDIA_ASSETS)

const idsOf = (docs) => new Set(docs.map((doc) => doc._id.toString()))
const sample = (set) => [...set].slice(0, 4).map((id) => keyOfFixture.get(id) ?? nameOf(id) ?? id).join(', ')
const labelOf = (entry) => `${entry.opts?.prefixLast ? '[prefixLast] ' : ''}${shown(entry.text, 74)}`
const sameSet = (a, b) => a.size === b.size && [...a].every((id) => b.has(id))
function diffNote(expected, actual) {
	const missing = new Set([...expected].filter((id) => !actual.has(id)))
	const extra = new Set([...actual].filter((id) => !expected.has(id)))
	return `${missing.size} missing (${sample(missing)}), ${extra.size} extra (${sample(extra)})`
}

/** Runs `tasks` with at most `width` in flight. */
async function pool(items, width, work) {
	const out = new Array(items.length)
	let cursor = 0
	await Promise.all(
		Array.from({ length: Math.min(width, items.length) }, async () => {
			while (cursor < items.length) {
				const mine = cursor++
				out[mine] = await work(items[mine], mine)
			}
		}),
	)
	return out
}

try {
	section(`library: ${CORPUS.length} documents (${fixtureDocs.length} fixtures, ${bulk.length} generated), ${FOLDER_DEFS.length} folders`)
	await assetsCollection.insertMany(CORPUS)
	const stored = await assetsCollection.countDocuments({ workspaceId: W })
	await check('library inserted under a fresh workspace id', () => eq(stored, CORPUS.length))
	await check('library: realistic spread (formats, tagging states, tag sources, folders, notes)', () => {
		ok(CORPUS.length >= 300, 'at least 300 documents')
		eq(new Set(bulk.map((d) => d.contentType)).size, 5, 'all five formats')
		ok(new Set(bulk.map((d) => d.tagging.status)).size >= 4, 'tagging states')
		ok(bulk.some((d) => d.tags.some((t) => t.source === 'manual')) && bulk.some((d) => d.tags.some((t) => t.via === 'vision')) && bulk.some((d) => d.tags.some((t) => t.via === 'filename')), 'manual, vision and file-name tags')
		ok(new Set(bulk.map((d) => String(d.folderId))).size >= 8, 'documents spread over the folder tree')
		ok(bulk.some((d) => d.notes.length > 800), 'long notes')
		ok(bulk.some((d) => /\b(the|and|of|for)\b/i.test(d.caption)), 'captions with stopwords')
		ok(CORPUS.every((d) => Array.isArray(d.terms) && d.terms.length > 0), 'every row has terms from derivedFields')
		// Each fixture's terms are the real derivedFields output: re-derive and compare.
		for (const doc of [FIX['cap-before-after'], FIX['name-camel'], FIX.cafe]) eq([...doc.terms].sort(), derivedFields(doc).terms, doc.name)
		eq(FOLDERS.ordered().length, FOLDER_DEFS.length, 'the folder index is the real one')
	})

	const started = performance.now()
	const RUNS = Q.map((entry) => {
		const plan = planQuery(parsed(entry.text), ctxFor(entry.opts))
		return { entry, plan, brute: null, found: null, viaMongo: null }
	})
	const planned = performance.now()
	for (const run of RUNS) run.brute = idsOf(CORPUS.filter((doc) => run.plan.evaluate(doc)))
	const evaluated = performance.now()
	await pool(RUNS, 8, async (run) => {
		try {
			run.found = await assetsCollection.find(run.plan.prefilter).toArray()
			run.foundIds = idsOf(run.found)
			run.viaMongo = idsOf(run.found.filter((doc) => run.plan.evaluate(doc)))
		} catch (error) {
			run.error = error && error.message ? error.message : String(error)
		}
	})
	const queried = performance.now()
	note(`${RUNS.length} queries: planned in ${Math.round(planned - started)} ms, evaluated over ${CORPUS.length} documents in ${Math.round(evaluated - planned)} ms, ${RUNS.length} Mongo finds in ${Math.round(queried - evaluated)} ms`)
	const byText = new Map()
	for (const run of RUNS) if (!byText.has(run.entry.text) || !run.entry.opts) byText.set(run.entry.text, run)

	section(`the invariant, expectations and fixtures: ${RUNS.length} queries`)
	for (const run of RUNS) {
		const { entry, plan } = run
		await check(`query ${labelOf(entry)}`, () => {
			if (run.error) throw new Error(`MongoDB rejected the prefilter ${shown(shapeOf(plan.prefilter), 160)}: ${run.error}`)
			// Plan hygiene.
			ok(plan.prefilter.workspaceId.equals(W), 'the prefilter leads with the workspace')
			eq(plan.needsEvaluation, plan.hasText, 'needsEvaluation is hasText')
			ok(Array.isArray(plan.corrections) && Array.isArray(plan.fuzzyEligible), 'corrections and fuzzyEligible are lists')
			lintFilter(plan.prefilter)
			ok(bsonDepth(plan.prefilter) <= 24, `filter depth ${bsonDepth(plan.prefilter)}`)
			BSON.serialize(plan.prefilter)

			// THE INVARIANT. Mongo's candidates are a superset of the evaluator's matches...
			const lost = new Set([...run.brute].filter((id) => !run.foundIds.has(id)))
			if (lost.size) throw new Error(`COUNTEREXAMPLE: the prefilter lost ${lost.size} document(s) the evaluator accepts (${sample(lost)}); prefilter ${shown(shapeOf(plan.prefilter))}`)
			// ...so candidates run through the evaluator are exactly the whole-library evaluation.
			if (!sameSet(run.viaMongo, run.brute)) throw new Error(`prefilter then evaluate differs from evaluating everything: ${diffNote(run.brute, run.viaMongo)}`)
			// With no text the prefilter alone is exact (Mongo sorts and pages it, nothing else filters).
			if (!plan.needsEvaluation && !sameSet(run.foundIds, run.brute)) throw new Error(`a text-free prefilter must be exact: ${diffNote(run.brute, run.foundIds)}; prefilter ${shown(shapeOf(plan.prefilter))}`)

			// Hand-derived expectations.
			const wellFormed = (set) => new Set([...set].filter((id) => !MALFORMED.has(id)))
			if (entry.oracle) {
				const expected = idsOf(CORPUS.filter((doc) => !MALFORMED.has(doc._id.toString()) && entry.oracle(doc)))
				const actual = wellFormed(run.brute)
				if (!sameSet(expected, actual)) throw new Error(`expected set differs: ${diffNote(expected, actual)}`)
			}
			for (const key of entry.has ?? []) ok(run.brute.has(FIX[key]._id.toString()), `fixture ${key} should match`)
			for (const key of entry.lacks ?? []) ok(!run.brute.has(FIX[key]._id.toString()), `fixture ${key} should NOT match`)
			if (entry.same) {
				const other = byText.get(entry.same)
				ok(other, `unknown reference query ${entry.same}`)
				if (!sameSet(run.brute, other.brute)) throw new Error(`should equal ${shown(entry.same, 60)}: ${diffNote(other.brute, run.brute)}`)
			}
			if (entry.corrections) eq(plan.corrections, entry.corrections, 'corrections')
		})
	}

	await check('the suite is not trivially satisfied: most expectations name real, non-empty result sets', () => {
		const withOracle = RUNS.filter((run) => run.entry.oracle)
		const nonEmpty = withOracle.filter((run) => [...run.brute].some((id) => !MALFORMED.has(id)) && run.brute.size > 0)
		const empty = RUNS.filter((run) => run.brute.size === 0).map((run) => labelOf(run.entry))
		const named = RUNS.filter((run) => (run.entry.has?.length ?? 0) + (run.entry.lacks?.length ?? 0) > 0).length
		const exact = RUNS.filter((run) => !run.plan.needsEvaluation).length
		note(`${RUNS.length} queries: ${withOracle.length} with a hand-written oracle, ${named} naming fixtures, ${RUNS.length - exact} with text (evaluated) and ${exact} exact in Mongo; ${empty.length} return nothing`)
		note(`queries that return nothing: ${empty.slice(0, 12).join('  |  ')}${empty.length > 12 ? '  | ...' : ''}`)
		ok(nonEmpty.length >= 0.8 * withOracle.length, `only ${nonEmpty.length} of ${withOracle.length} oracle queries return anything`)
		ok(RUNS.length >= 100, 'at least 100 queries')
		ok(withOracle.length >= 100, 'at least 100 hand-derived expectations')
		ok(RUNS.filter((run) => run.plan.needsEvaluation).length >= 100 && exact >= 40, 'both kinds of plan are exercised')
	})

	/* ---------------------------------------------------------------------- */
	section('prefilter shapes: the rules reviewers proved necessary')

	const planOf = (text, opts) => planQuery(parsed(text), ctxFor(opts))
	const shape = (text, opts) => shapeOf(planOf(text, opts).prefilter)
	const term = (...words) => ({ terms: { $in: words } })
	const tagIn = (...slugs) => ({ 'tags.slug': { $in: slugs } })
	const nor = (...children) => ({ $nor: children })
	const built = (ast, opts) => planQuery({ raw: '', ast, chips: [], warnings: [], sort: null, hasText: true }, ctxFor(opts))
	const leaf = (word, extra = {}) => ({ type: 'term', text: word, prefix: false, start: 0, end: word.length, ...extra })
	const field = (name, values, extra = {}) => ({ type: 'field', field: name, values, start: 0, end: 1, ...extra })
	/** The folder ids inside a filter, as sorted hex strings. */
	function folderIdsIn(filter) {
		const out = []
		const walk = (node) => {
			if (Array.isArray(node)) return node.forEach(walk)
			if (!node || typeof node !== 'object' || node instanceof ObjectId) return
			for (const [key, value] of Object.entries(node)) {
				if (key === 'folderId' && value && Array.isArray(value.$in)) out.push(...value.$in.filter(Boolean).map(String))
				else walk(value)
			}
		}
		walk(filter)
		return out.sort()
	}
	const hexes = (...keys) => keys.map((key) => String(FOLDER_ID[key])).sort()

	await check('null means TRUE: a node that cannot be narrowed adds no restriction', () => {
		for (const text of ['-deck', 'NOT deck', '-(deck OR patio)', '-(deck patio)', '-"before and after"', '"the who"', '"a"', 'the-who', 'name:the', 'name:who', 'name:"the who"', 'name:"who we are"', '-name:the', 'name:the,hero', 'deck OR -blue', 'deck OR -(a b)', 'deck OR -(patio roof)', '', '  ']) {
			eq(shape(text), {}, text)
		}
	})

	await check('or: ONE null child makes the node null; it is never narrowed to the other side', () => {
		eq(shape('deck OR -blue'), {}, 'kitchen OR -blue must not become the kitchen side alone')
		eq(shape('deck OR (patio OR -blue)'), {})
		eq(shape('(deck OR patio) OR -blue'), {})
		eq(shape('deck OR "the who"'), {}, 'an unrestricted phrase on one side')
		eq(shape('deck OR -tag:x'), { $or: [term('deck'), nor(tagIn('x'))] }, 'a structured NOT is a real filter, so the OR stays narrow')
		eq(shape('(deck OR -tag:x) OR patio'), { $or: [term('deck'), nor(tagIn('x')), term('patio')] }, 'nested $or is flattened')
		eq(shape('deck OR patio'), { $or: [term('deck'), term('patio')] })
		eq(shape('deck -blue'), term('deck'), 'an AND simply drops a null child')
		eq(shape('deck "the who"'), term('deck'))
	})

	await check('not: a fully structured child is $nor; a child with any text is null', () => {
		eq(shape('-tag:x'), nor(tagIn('x')))
		eq(shape('-type:png'), nor({ contentType: { $in: ['image/png'] } }))
		eq(shape('-is:untagged'), nor({ tags: { $size: 0 } }))
		eq(shape('-(tag:x OR type:png)'), nor(tagIn('x'), { contentType: { $in: ['image/png'] } }), 'a $nor of an $or is its children')
		eq(shape('-(tag:x type:png)'), nor({ $and: [tagIn('x'), { contentType: { $in: ['image/png'] } }] }))
		eq(shape('-(tag:x deck)'), {}, 'any text inside makes the NOT null')
		eq(shape('deck -tag:x'), { $and: [term('deck'), nor(tagIn('x'))] })
		eq(shape('-folder:nope'), nor({ _id: { $in: [] } }), 'not-nothing is everything, and says so')
	})

	await check('phrase and field values: non-stopword words only, null when none remain', () => {
		eq(shape('"before and after"'), { $and: [term('before'), term('after')] }, 'the index never holds `and`')
		eq(shape('"for sale"'), term('sale'))
		eq(shape('caption:"for sale"'), term('sale'))
		eq(shape('name:"the kitchen"'), term('kitchen'), 'a stopword is ignored when other words remain')
		eq(shape('"kitchen remodel"'), { $and: [term('kitchen'), term('remodel')] }, 'a phrase is matched against text, so it takes no folder names')
		eq(shape('kitchen-remodel'), { $or: [{ $and: [term('kitchen'), term('remodel')] }, term('kitchenremodel')] }, 'implicit: the joined run is an alternative')
		eq(shape('before-and-after'), { $or: [{ $and: [term('before'), term('after')] }, term('beforeandafter')] })
		eq(shape('name:hero,kit'), { $or: [term('hero'), term('kit')] })
		eq(shape('name:kit*'), { $or: [term('kit'), { terms: { $regex: '^kit' } }] })
		eq(shape('"the"'), {})
	})

	await check('prefix: 2+ characters; a folder-name prefix 3+; exact folder names are unchanged', () => {
		eq(shape('k*'), term('k'), 'one letter is not a prefix')
		eq(shape('ki*'), { $or: [term('ki'), { terms: { $regex: '^ki' } }] })
		eq(shape('k', PL), term('k'))
		eq(shape('ki', PL), { $or: [term('ki'), { terms: { $regex: '^ki' } }] })
		const folderClause = (text, opts) => JSON.stringify(shape(text, opts)).includes('"folderId"')
		ok(!folderClause('ac*'), 'a 2-letter prefix never reaches folder names')
		ok(folderClause('acm*'), 'a 3-letter prefix does')
		ok(!folderClause('be*'), 'be* would reach Beta Co only by prefix')
		ok(folderClause('bet*'))
		ok(folderClause('acme'), 'an exact folder name')
		ok(folderClause('co'), 'exact folder-name matching has no length floor')
		ok(folderClause('co*'), 'a star keeps the exact part')
		ok(!folderClause('ac', PL) && folderClause('acm', PL), 'prefixLast follows the same rules')
		eq(folderIdsIn(planOf('acme').prefilter), hexes('acme', 'hero', 'ba'), 'the folder and everything beneath it')
		eq(folderIdsIn(planOf('hero').prefilter), hexes('hero'))
		eq(folderIdsIn(planOf('clients').prefilter), hexes('clients', 'acme', 'hero', 'ba', 'beta'))
		eq(folderIdsIn(planOf('shot').prefilter), hexes('hero'), 'stem-only: shots')
	})

	await check('tag: values are anchored regexes when starred, and dedupe after redirects', () => {
		eq(shape('tag:kit*'), { 'tags.slug': { $regex: '^kit' } })
		eq(shape('tag:kit*,ab*'), { $or: [{ 'tags.slug': { $regex: '^kit' } }, { 'tags.slug': { $regex: '^ab' } }] })
		eq(shape('tag:old-name,kitchen'), tagIn('kitchen'), 'two spellings of one tag')
		eq(shape('tag:old-name,bathroom'), tagIn('kitchen', 'bathroom'))
		eq(shape('tag:h1*'), { 'tags.slug': { $regex: '^h1' } }, 'a prefix is not a tag, so it is not redirected')
	})

	await check('tag: redirects follow at most 5 hops, never loop, and are reported', () => {
		const chain = new Map(Array.from({ length: 7 }, (_, i) => [`a${i}`, `a${i + 1}`])) // a0 -> a1 -> ... -> a7
		const run = (text, redirects) => {
			const plan = planOf(text, { tagRedirects: redirects })
			return { plan, slugs: plan.prefilter['tags.slug']?.$in }
		}
		eq(run('tag:a0', chain).slugs, ['a5'], 'five hops from a0')
		eq(run('tag:a0', chain).plan.corrections, [{ from: 'tag:a0', to: 'tag:a5' }])
		eq(run('tag:a2', chain).slugs, ['a7'], 'a2 reaches the end in five')
		eq(run('tag:a3', chain).slugs, ['a7'])
		eq(run('tag:a7', chain).slugs, ['a7'], 'the end of a chain stays put')
		eq(run('tag:a7', chain).plan.corrections, [])
		const loop = new Map([['x', 'y'], ['y', 'z'], ['z', 'x']])
		eq(run('tag:x', loop).slugs, ['z'], 'stops where the loop would close')
		eq(run('tag:y', loop).slugs, ['x'])
		eq(run('tag:z', loop).slugs, ['y'])
		eq(run('tag:s', new Map([['s', 's']])).slugs, ['s'])
		eq(run('tag:s', new Map([['s', 's']])).plan.corrections, [], 'a self-redirect is not a correction')
		eq(run('tag:j', new Map([['j', '']])).slugs, ['j'])
		eq(run('tag:j', new Map([['j', 7]])).slugs, ['j'])
		eq(run('tag:j', new Map()).slugs, ['j'])
		const none = planQuery(parsed('tag:j'), { ...ctxFor(), tagRedirects: undefined })
		eq(none.prefilter['tags.slug'].$in, ['j'], 'no redirect map at all')
	})

	await check('folder: ids with their subtree, none, and the never-match clause', () => {
		eq(folderIdsIn(planOf('folder:Acme').prefilter), hexes('acme', 'hero', 'ba'))
		eq(folderIdsIn(planOf('folder:Clients').prefilter), hexes('clients', 'acme', 'hero', 'ba', 'beta'))
		eq(folderIdsIn(planOf('folder:acm').prefilter), hexes('acme', 'hero', 'ba'))
		eq(folderIdsIn(planOf('folder:"Clients/Acme/Hero Shots"').prefilter), hexes('hero'))
		eq(shape('folder:none'), { folderId: null })
		eq(shape('folder:unfiled'), { folderId: null })
		eq(shape('folder:nope'), { _id: { $in: [] } })
		eq(shape('folder:ac'), { _id: { $in: [] } }, 'two letters is too short for a name prefix')
		ok(planOf('folder:Acme,none').prefilter.folderId.$in[0] === null, 'unfiled joins the list as null')
		eq(shape('-folder:none'), nor({ folderId: null }))
	})

	await check('structured leaves: the exact filters the stub lists', () => {
		const table = [
			['is:untagged', { tags: { $size: 0 } }],
			['is:tagged', { 'tags.0': { $exists: true } }],
			['is:unreviewed', { 'tags.source': 'auto' }],
			['is:reviewed', { 'tags.0': { $exists: true }, 'tags.source': { $ne: 'auto' } }],
			['is:unfiled', { folderId: null }],
			['is:filed', { folderId: { $ne: null } }],
			['is:animated', { animated: true }],
			['is:transparent', { hasAlpha: true }],
			['is:dark', { brightness: 'dark' }],
			['is:light', { brightness: 'light' }],
			['is:vivid', { saturation: 'vivid' }],
			['is:muted', { saturation: 'muted' }],
			['is:monochrome', { saturation: 'monochrome' }],
			['is:pending', { 'tagging.status': { $in: ['pending', 'running'] } }],
			['is:failed', { 'tagging.status': 'failed' }],
			['is:captioned', { caption: { $type: 'string', $ne: '' } }],
			['is:uncaptioned', { caption: { $in: ['', null] } }],
			['type:png', { contentType: { $in: ['image/png'] } }],
			['type:png,jpg', { contentType: { $in: ['image/png', 'image/jpeg'] } }],
			['color:blue', { colorNames: { $in: ['blue'] } }],
			['color:blue,green', { colorNames: { $in: ['blue', 'green'] } }],
			['orientation:landscape', { orientation: 'landscape' }],
			['orientation:portrait,square', { orientation: { $in: ['portrait', 'square'] } }],
			['kind:logo', { kind: 'logo' }],
			['width:>1200', { width: { $gt: 1200 } }],
			['width:>=1200', { width: { $gte: 1200 } }],
			['height:<600', { height: { $lt: 600 } }],
			['height:<=600', { height: { $lte: 600 } }],
			['width:1200', { width: 1200 }],
			['width:800..1600', { width: { $gte: 800, $lte: 1600 } }],
			['size:>2mb', { bytes: { $gt: 2097152 } }],
			['size:500kb..2mb', { bytes: { $gte: 512000, $lte: 2097152 } }],
			['added:2026-03-01', { createdAt: { $gte: '2026-03-01T00:00:00.000Z', $lte: '2026-03-01T23:59:59.999Z' } }],
			['added:>2026-01-01', { createdAt: { $gt: '2026-01-01T23:59:59.999Z' } }],
		]
		for (const [text, expected] of table) eq(shape(text), expected, text)
	})

	await check('a clause that can match nothing is { _id: { $in: [] } }, never an empty $or / $and / $in', () => {
		for (const node of [
			field('type', []),
			field('type', ['bmp']),
			field('tag', []),
			field('color', []),
			field('orientation', []),
			field('width', []),
			field('is', ['nonsense']),
			field('is', ['__proto__']),
			field('folder', []),
			field('bogus', ['x']),
			{ type: 'or', nodes: [] },
			{ type: 'phrase', text: '', start: 0, end: 0 },
			{ type: 'mystery' },
		]) {
			const plan = built(node)
			eq(shapeOf(plan.prefilter), { _id: { $in: [] } }, JSON.stringify(node))
			lintFilter(plan.prefilter)
			ok(CORPUS.slice(0, 30).every((doc) => plan.evaluate(doc) === null), `${JSON.stringify(node)} matches nothing`)
		}
		const everything = built({ type: 'and', nodes: [] })
		eq(shapeOf(everything.prefilter), {}, 'an empty AND is TRUE')
		ok(CORPUS.slice(0, 30).every((doc) => everything.evaluate(doc) !== null))
		const hostile = built(field('tag', ['a.b(c)*[x]\\', 'z|y$'], { prefix: true }))
		eq(shapeOf(hostile.prefilter), { $or: [{ 'tags.slug': { $regex: '^a\\.b\\(c\\)\\*\\[x\\]\\\\' } }, { 'tags.slug': { $regex: '^z\\|y\\$' } }] }, 'regex syntax in a value is escaped')
		lintFilter(hostile.prefilter)
	})

	await check('$and in $and and $or in $or are flattened; nesting stays far under the 50-level limit', async () => {
		const flat = built({ type: 'and', nodes: [{ type: 'and', nodes: [leaf('deck'), leaf('patio')] }, { type: 'and', nodes: [leaf('roof'), leaf('blue')] }] })
		eq(shapeOf(flat.prefilter), { $and: [term('deck'), term('patio'), term('roof'), term('blue')] })
		const either = built({ type: 'or', nodes: [{ type: 'or', nodes: [leaf('deck'), leaf('patio')] }, { type: 'or', nodes: [leaf('roof'), leaf('blue')] }] })
		eq(shapeOf(either.prefilter), { $or: [term('deck'), term('patio'), term('roof'), term('blue')] })
		const deepest = planOf('(deck OR (patio (roof OR (blue -(tag:x OR (type:png (is:dark OR (width:>1 sink)))))))))')
		ok(bsonDepth(deepest.prefilter) <= 24, `depth ${bsonDepth(deepest.prefilter)}`)
		lintFilter(deepest.prefilter)
		BSON.serialize(deepest.prefilter)
		await assetsCollection.find(deepest.prefilter).limit(1).toArray()
	})

	await check('a hand-built tree deeper than twice the parser limit fails closed instead of throwing', async () => {
		const chain = (levels) => {
			let ast = field('tag', ['kitchen'])
			for (let i = 0; i < levels; i++) {
				ast = i % 2 ? { type: 'or', nodes: [ast, field('type', ['png'])] } : { type: 'not', node: ast, start: 0, end: 1 }
			}
			return ast
		}
		const limit = T.MEDIA_LIMITS.queryMaxDepth * 2
		const ok16 = built(chain(limit))
		ok(bsonDepth(ok16.prefilter) <= 44, `depth ${bsonDepth(ok16.prefilter)}`)
		lintFilter(ok16.prefilter)
		const viaMongo = await assetsCollection.find(ok16.prefilter).toArray()
		const brute = idsOf(CORPUS.filter((doc) => ok16.evaluate(doc)))
		ok(sameSet(idsOf(viaMongo), brute), 'the deepest legal tree is exact in Mongo')
		for (const levels of [limit + 1, 40, 200, 100_000]) {
			const closed = built(chain(levels))
			eq(shapeOf(closed.prefilter), { _id: { $in: [] } }, `${levels} levels`)
			ok(CORPUS.slice(0, 20).every((doc) => closed.evaluate(doc) === null), 'matches nothing')
		}
		ok(built(chain(100_000), PL).needsEvaluation, 'and says it needs evaluating')
	})

	await check('a term matching more than 40 folders widens to "any filed asset" instead of listing them', async () => {
		const parent = new ObjectId()
		const kids = Array.from({ length: 60 }, () => new ObjectId())
		const big = buildFolderIndex([{ _id: parent, parentId: null, name: 'Jobs' }, ...kids.map((id, i) => ({ _id: id, parentId: parent, name: `Kitchen ${i}` }))])
		const extra = [makeDoc({ name: 'Plain 1', folderId: kids[7] }), makeDoc({ name: 'Plain 2', folderId: parent }), makeDoc({ name: 'Plain 3', folderId: null }), makeDoc({ name: 'Plain 4', folderId: FOLDER_ID.acme })]
		await assetsCollection.insertMany(extra)
		try {
			const plan = planQuery(parsed('kitchen'), { ...ctxFor(), folders: big })
			eq(shapeOf(plan.prefilter), { $or: [term('kitchen'), { folderId: { $ne: null } }] })
			const found = await assetsCollection.find(plan.prefilter).toArray()
			const everyone = [...CORPUS, ...extra]
			const brute = idsOf(everyone.filter((doc) => plan.evaluate(doc)))
			ok([...brute].every((id) => idsOf(found).has(id)), 'a superset still')
			const hits = found.filter((doc) => plan.evaluate(doc)).map((doc) => doc.name)
			ok(hits.includes('Plain 1'), 'in a folder whose name has the word')
			ok(!hits.includes('Plain 2') && !hits.includes('Plain 3') && !hits.includes('Plain 4'), 'and nothing else')
		} finally {
			// The rest of the proof compares Mongo with the library, so these rows must not outlive the check.
			await assetsCollection.deleteMany({ _id: { $in: extra.map((doc) => doc._id) } })
		}
	})

	/* ---------------------------------------------------------------------- */
	section('evaluation: from the document, once compiled, and tolerant of bad rows')

	await check('hasText / needsEvaluation: text means evaluate, everything else is exact in Mongo', () => {
		const table = [['kitchen', true], ['"x y"', true], ['name:the', true], ['caption:sale', true], ['text:grand', true], ['-kitchen', true], ['tag:kitchen OR kitchen', true], ['kitchen type:png', true], ['type:png', false], ['tag:x', false], ['-tag:x', false], ['folder:Acme', false], ['is:dark OR color:blue', false], ['width:>1 height:<9 size:<1mb added:7d', false], ['', false], ['sort:name', false]]
		for (const [text, expected] of table) {
			const plan = planOf(text)
			eq(plan.hasText, expected, `${text} hasText`)
			eq(plan.needsEvaluation, expected, `${text} needsEvaluation`)
		}
	})

	await check('evaluate never reads doc.terms (a getter that throws proves it)', () => {
		const trap = (doc) => Object.defineProperty({ ...doc }, 'terms', { get() { throw new Error('doc.terms was read') }, enumerable: true })
		for (const text of ['kitchen', '"before and after"', 'name:the', 'kitchen OR -blue', 'tag:kitchen', 'ki*', 'acme', '-kitchen', 'kitchen-remodel', 'caption:"for sale"']) {
			const plan = planOf(text)
			for (const doc of CORPUS.slice(0, 80)) plan.evaluate(trap(doc))
		}
		const plan = planOf('kitchen')
		ok(plan.evaluate({ ...FIX['tag-kitchen'], terms: [] }), 'an empty terms array does not stop a match')
		eq(plan.evaluate({ ...FIX['name-the-who'], terms: ['kitchen'] }), null, 'a lying terms array does not make one')
	})

	await check('the query is compiled once: evaluating documents does no query-side work', () => {
		const counted = ['stem', 'escapeRegex']
		const originals = Object.fromEntries(counted.map((key) => [key, text[key]]))
		const calls = Object.fromEntries(counted.map((key) => [key, 0]))
		for (const key of counted) text[key] = (...args) => (calls[key]++, originals[key](...args))
		try {
			for (const query of ['kitchen remodel', 'ki* bathroom', '"before and after"', 'name:kit* caption:"for sale"', 'tag:old-name -deck', 'acme', 'kitchen OR -blue', 'kitchen-remodel']) {
				for (const key of counted) calls[key] = 0
				const plan = planOf(query)
				const planning = calls.stem + calls.escapeRegex
				for (const key of counted) calls[key] = 0
				for (const doc of CORPUS.slice(0, 80)) plan.evaluate(doc)
				eq([calls.stem, calls.escapeRegex], [0, 0], `${query}: evaluating re-did query work (planning did ${planning})`)
			}
		} finally {
			for (const key of counted) text[key] = originals[key]
		}
	})

	await check('planning does not mutate its inputs, and evaluating does not mutate documents', () => {
		const freeze = (value) => {
			if (value && typeof value === 'object' && !Object.isFrozen(value)) {
				Object.freeze(value)
				for (const child of Object.values(value)) freeze(child)
			}
			return value
		}
		// Plain copies, frozen all the way down: any write the planner made would throw.
		const frozen = (doc) => freeze(JSON.parse(JSON.stringify(doc)))
		const vocab = new Map(VOCAB)
		const redirects = new Map(REDIRECTS)
		for (const query of ['kithcen -blue tag:old-name "before and after" name:the folder:Acme', 'ki* OR bathrom', 'kitchen-remodel -(deck OR patio) caption:"for sale"']) {
			const ast = freeze(parsed(query))
			const plan = planQuery(ast, { ...ctxFor({ vocabulary: vocab, prefixLast: true }), tagRedirects: redirects })
			for (const doc of [CORPUS[0], FIX['cap-before-after'], FIX['tag-kitchen'], FIX['name-camel']]) plan.evaluate(frozen(doc))
		}
		eq([...vocab], [...VOCAB], 'the vocabulary is left alone')
		eq([...redirects], [...REDIRECTS], 'and the redirects')
	})

	await check('an empty query matches every document with score 0; non-objects match nothing', () => {
		for (const query of ['', '  ', '"', 'sort:name', 'tag:']) {
			const plan = planOf(query)
			for (const doc of CORPUS.filter((_, i) => i % 9 === 0)) eq(plan.evaluate(doc), { score: 0, fields: [] }, JSON.stringify(query))
		}
		for (const bad of [null, undefined, 'text', 42, true]) eq(planOf('kitchen').evaluate(bad), null)
		for (const bad of [null, undefined, 'text', 42]) eq(planOf('').evaluate(bad), null)
	})

	await check('evaluate shrugs off rows with missing, null or mistyped fields', () => {
		const bad = [
			{},
			{ _id: 1 },
			{ tags: 'oops', colors: 'x', colorNames: 5, keywords: { a: 1 }, name: 12, filename: [], caption: ['a'], altText: {}, notes: 7, textInImage: null, folderId: 'not-an-id', createdAt: 'yesterday', width: '1200', height: null, bytes: {}, tagging: 'x', contentType: '__proto__', kind: {}, orientation: [], animated: 'yes', hasAlpha: 1, brightness: 3, saturation: [] },
			{ tags: [null, 1, 'x', { slug: 5, label: {} }, { source: 'auto', label: 'Van', confidence: 'high' }, { source: 'auto', via: 'vision', label: 'Truck', confidence: Number.POSITIVE_INFINITY }, { source: 'auto', label: 'Roof', confidence: -4 }] },
			{ tags: [{ source: 'manual', label: null, slug: undefined }], keywords: [null, 3, 'x'], colorNames: [null, 'blue'] },
		]
		const queries = ['kitchen', 'ki*', '"before and after"', 'name:the', 'caption:"for sale"', 'text:grand', 'tag:kitchen', 'tag:kit*', 'type:png', 'color:blue', 'orientation:landscape', 'kind:logo', 'is:untagged', 'is:reviewed', 'is:captioned', 'is:pending', 'is:dark', 'width:>5', 'height:<5', 'size:>1', 'added:7d', 'folder:Acme', 'folder:none', '-kitchen', 'acme', 'kitchen OR -blue', 'van truck roof']
		for (const query of queries) {
			const plan = planOf(query)
			for (const doc of bad) {
				const result = plan.evaluate(doc)
				ok(result === null || (Number.isFinite(result.score) && Array.isArray(result.fields)), `${query} on ${JSON.stringify(doc).slice(0, 60)}`)
			}
		}
	})

	/* ---------------------------------------------------------------------- */
	section('ranking: field weights, match kinds, bonuses, match.fields')

	const D = (over) => makeDoc({ name: 'Plain', filename: 'plainfile', ...over })
	const run1 = (text, doc, opts) => planOf(text, opts).evaluate(doc)
	const Z = 'zorbex'
	const probes = [
		['manual tag', { tags: [manual('Zorbex')] }, 10, ['tag']],
		['auto tag at confidence 1', { tags: [auto('Zorbex', 1)] }, 7, ['auto tag']],
		['auto tag at confidence 0.6', { tags: [auto('Zorbex', 0.6)] }, 5.88, ['auto tag']],
		['auto tag with no confidence', { tags: [{ slug: 'zorbex', label: 'Zorbex', source: 'auto' }] }, 5.88, ['auto tag']],
		['name', { name: 'Zorbex' }, 6, ['name']],
		['file-name tag', { tags: [fromName('Zorbex')] }, 4, ['file name']],
		['caption', { caption: 'Zorbex' }, 3, ['caption']],
		['alt text', { altText: 'Zorbex' }, 3, ['caption']],
		['text in image', { textInImage: 'Zorbex' }, 3, ['text in image']],
		['notes', { notes: 'Zorbex' }, 3, ['notes']],
		['keyword', { keywords: ['zorbex'] }, 2, ['keyword']],
	]

	await check('field weights: tag 10, auto tag 7 x (0.6 + 0.4 x confidence), name 6, file-name tag 4, caption/text/notes 3, keyword 2', () => {
		for (const [label, over, score, fields] of probes) eq(run1(Z, D(over)), { score, fields }, label)
	})

	await check('colour and format words weigh 3, a folder name 2 (x its match kind)', () => {
		eq(run1('teal', D({ colors: colorsOf('teal') })), { score: 3, fields: ['color'] })
		eq(run1('gif', D({ contentType: 'image/gif' })), { score: 3, fields: ['type'] })
		eq(run1('landscape', D({})), { score: 3, fields: ['type'] })
		const folders = buildFolderIndex([{ _id: FOLDER_ID.acme, parentId: null, name: 'Zorbex Places' }])
		const inFolder = D({ folderId: FOLDER_ID.acme })
		const inFolders = (text) => planQuery(parsed(text), { ...ctxFor(), folders }).evaluate(inFolder)
		eq(inFolders(Z), { score: 2, fields: ['folder'] })
		eq(inFolders('place'), { score: 1.5, fields: ['folder'] }, 'stem-only: places -> place, 2 x 0.75')
		eq(inFolders('zorb*'), { score: 1.4, fields: ['folder'] }, 'prefix: 2 x 0.7')
		eq(inFolders('zo*'), null, 'a 2-letter prefix never reaches folder names')
		// ...and a child folder counts as "in" its ancestor.
		const nested = buildFolderIndex([{ _id: FOLDER_ID.acme, parentId: null, name: 'Zorbex' }, { _id: FOLDER_ID.hero, parentId: FOLDER_ID.acme, name: 'Deep' }])
		eq(planQuery(parsed(Z), { ...ctxFor(), folders: nested }).evaluate(D({ folderId: FOLDER_ID.hero })), { score: 2, fields: ['folder'] })
	})

	await check('ordering: manual tag beats auto tag beats name beats file-name tag beats caption beats keyword', () => {
		const score = (label) => run1(Z, D(probes.find((probe) => probe[0] === label)[1])).score
		const chain = ['manual tag', 'auto tag at confidence 1', 'name', 'file-name tag', 'caption', 'keyword']
		for (let i = 0; i + 1 < chain.length; i++) ok(score(chain[i]) > score(chain[i + 1]), `${chain[i]} should outrank ${chain[i + 1]}`)
		ok(score('auto tag at confidence 1') > score('auto tag at confidence 0.6'), 'a surer auto tag outranks a shakier one')
		eq(score('caption'), score('notes'), 'caption, text and notes tie')
	})

	await check('match kinds in one field: exact 1.0 > stem-only 0.75 > prefix 0.7 > fuzzy 0.5', () => {
		const exact = D({ tags: [manual('Truck')] })
		const stemOnly = D({ tags: [manual('Trucks')] })
		const prefix = D({ tags: [manual('Truckload')] })
		near(run1('truck', exact).score, 10)
		near(run1('truck', stemOnly).score, 7.5)
		eq(run1('truck', prefix), null, 'a prefix needs the star')
		near(run1('truck*', exact).score, 10)
		near(run1('truck*', stemOnly).score, 7.5)
		near(run1('truck*', prefix).score, 7)
		const typo = planOf('trcuk', { vocabulary: new Map([['truck', 3]]) })
		near(typo.evaluate(exact).score, 5)
		eq(typo.corrections, [{ from: 'trcuk', to: 'truck' }])
		// The stub's own example: `siding` and `side` share a stem and are not the same word.
		near(run1('siding', D({ caption: 'vinyl siding' })).score, 3, 'exact')
		near(run1('siding', D({ caption: 'the side yard' })).score, 2.25, 'stem-only: 3 x 0.75')
		near(run1('side', D({ caption: 'vinyl siding' })).score, 2.25)
	})

	await check('"best field" is the best weight x kind, and an auto tag counts its OWN confidence', () => {
		eq(run1('truck', D({ tags: [manual('Trucks')], name: 'Truck' })), { score: 7.5, fields: ['tag'] }, 'stem-only in a tag (7.5) beats exact in the name (6)')
		eq(run1('truck', D({ tags: [auto('Trucks', 1)], name: 'Truck' })), { score: 6, fields: ['name'] }, 'stem-only in an auto tag (5.25) loses to the name')
		eq(run1('truck', D({ tags: [auto('Truck', 0.6), auto('Banana', 1)] })).score, 5.88, 'an unrelated confident tag adds nothing')
		eq(run1('truck', D({ tags: [auto('Truck', 0.6), auto('Truck cab', 1)] })).score, 7, 'the best matching tag, never a sum')
		eq(run1('truck', D({ tags: [auto('Trucks', 0.9)] })).score, 5.04, 'rounded: 7 x 0.96 x 0.75')
		const withConfidence = (confidence) => D({ tags: [{ source: 'auto', via: 'vision', label: 'Truck', confidence }] })
		eq(run1('truck', withConfidence(7)).score, 7, 'a finite confidence above 1 is clamped to 1')
		eq(run1('truck', withConfidence(-4)).score, 4.2, 'and below 0 reads as 0')
		// Corrupt values read as the stored minimum, never the maximum: a bad row cannot inflate its own rank.
		for (const junk of ['high', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, {}]) eq(run1('truck', withConfidence(junk)).score, 5.88, String(junk))
	})

	await check('phrase: +6 on top of the best field it matched in', () => {
		const inCaption = D({ caption: 'Kitchen remodel' })
		const inTag = D({ tags: [manual('Kitchen Remodel')] })
		const plan = planOf('"kitchen remodel" OR bathroom')
		eq(plan.evaluate(inCaption), { score: 9, fields: ['caption'] })
		eq(plan.evaluate(inTag), { score: 16, fields: ['tag'] })
		eq(plan.evaluate(D({ caption: 'bathroom' })), { score: 3, fields: ['caption'] }, 'the bonus is what puts a phrase match ahead of a single word')
		near(planOf('"kitchen remodel"').evaluate(inCaption).score, 9)
		eq(planOf('"kitchen remodel" blue').evaluate(D({ caption: 'Kitchen remodel', colors: colorsOf('blue') })), { score: 12, fields: ['caption', 'color'] })
		eq(planOf('kitchen-remodel').evaluate(D({ name: 'KitchenRemodel_final' })), { score: 12, fields: ['name'] }, 'the joined run counts as the phrase')
	})

	await check('+2 when every term of a multi-word query matches inside one field', () => {
		const plan = planOf('kitchen remodel')
		const together = D({ caption: 'kitchen remodel project' })
		const apart = D({ caption: 'kitchen', notes: 'remodel' })
		eq(plan.evaluate(together), { score: 8, fields: ['caption'] })
		eq(plan.evaluate(apart), { score: 6, fields: ['caption', 'notes'] })
		eq(plan.evaluate(D({ tags: [manual('Kitchen')], caption: 'remodel' })), { score: 13, fields: ['tag', 'caption'] })
		eq(plan.evaluate(together).score - plan.evaluate(apart).score, 2, 'exactly the bonus')
		eq(run1('kitchen', D({ caption: 'kitchen' })).score, 3, 'one term has no bonus')
		const three = planOf('deck patio roof')
		eq(three.evaluate(D({ caption: 'deck patio', notes: 'roof' })).score, 9, 'only two share a field')
		eq(three.evaluate(D({ caption: 'deck patio roof' })).score, 11)
		eq(three.evaluate(D({ caption: 'deck patio roof', notes: 'deck' })).score, 11, 'matches elsewhere add nothing')
	})

	await check('match.fields: the fields that WON, strongest first; folder is a field; structured adds none', () => {
		eq(run1(Z, D({ tags: [manual('Zorbex')], caption: 'zorbex', keywords: ['zorbex'] })).fields, ['tag'], 'only the winning field per term')
		eq(run1('type:png', D({ contentType: 'image/png' })), { score: 0, fields: [] })
		eq(run1('-zorbex', D({})), { score: 0, fields: [] })
		eq(run1('zorbex type:png', D({ name: 'Zorbex', contentType: 'image/png' })), { score: 6, fields: ['name'] })
		eq(run1('zorbex plain', D({ tags: [manual('Zorbex')], name: 'Plain' })).fields, ['tag', 'name'])
		eq(run1('plain zorbex', D({ tags: [manual('Zorbex')], name: 'Plain' })).fields, ['tag', 'name'], 'whatever the order in the query')
		eq(run1(Z, D({ tags: [auto('Zorbex', 1)], keywords: ['zorbex'] })).fields, ['auto tag'])
		eq(run1('"zorbex plain"', D({ caption: 'Zorbex plain' })).fields, ['caption'])
		eq(run1('acme', D({ folderId: FOLDER_ID.acme })), { score: 2, fields: ['folder'] })
		eq(run1('acme', D({ folderId: FOLDER_ID.acme, caption: 'acme' })), { score: 3, fields: ['caption'] }, 'the caption (3) outranks the folder (2)')
	})

	await check('or adds up the sides that matched; name: / caption: / text: score their own field', () => {
		const plan = planOf('zorbex OR plain')
		eq(plan.evaluate(D({ tags: [manual('Zorbex')], name: 'Plain' })), { score: 16, fields: ['tag', 'name'] })
		eq(plan.evaluate(D({ tags: [manual('Zorbex')], name: 'Other', filename: 'otherfile' })), { score: 10, fields: ['tag'] }, 'one side alone')
		eq(plan.evaluate(D({ name: 'Plain' })), { score: 6, fields: ['name'] })
		eq(plan.evaluate(D({ name: 'Other', filename: 'otherfile' })), null)
		eq(run1('name:zorbex', D({ name: 'Zorbex' })), { score: 6, fields: ['name'] })
		eq(run1('caption:zorbex', D({ caption: 'Zorbex' })), { score: 3, fields: ['caption'] })
		eq(run1('text:zorbex', D({ textInImage: 'Zorbex' })), { score: 3, fields: ['text in image'] })
		eq(run1('name:"zorbex plainword"', D({ name: 'Zorbex Plainword' })), { score: 12, fields: ['name'] }, 'two words, each at the field weight')
		eq(run1('name:the', D({ name: 'The Who' })), { score: 6, fields: ['name'] }, 'a stopword-only value counts once')
		eq(run1('name:zorbex', D({ tags: [manual('Zorbex')] })), null, 'only that field')
		eq(run1('name:zorbexs', D({ name: 'Zorbex' })).score, 4.5, 'stem-only: 6 x 0.75')
		eq(run1('name:zorb*', D({ name: 'Zorbex' })).score, 4.2, 'prefix: 6 x 0.7')
	})

	/* ---------------------------------------------------------------------- */
	section('typo tolerance')

	const planV = (text, opts) => planOf(text, { vocabulary: VOCAB, ...opts })

	await check('kithcen -> kitchen: the correction is reported and results are fuzzy matches', () => {
		const plan = planV('kithcen')
		eq(plan.corrections, [{ from: 'kithcen', to: 'kitchen' }])
		eq(plan.fuzzyEligible, ['kithcen'])
		eq(plan.evaluate(FIX['tag-kitchen']), { score: 5, fields: ['tag'] }, 'a manual tag through a typo: 10 x 0.5')
		eq(plan.evaluate(FIX['name-the-who']), null)
		// Without a vocabulary nothing is corrected and nothing matches.
		const strict = planOf('kithcen')
		eq(strict.corrections, [])
		eq(CORPUS.filter((doc) => strict.evaluate(doc)).length, 0)
	})

	await check('a word that is in the vocabulary is never corrected: every word of the library, alone and as a prefix', () => {
		let tried = 0
		for (const [word] of VOCAB) {
			if (!/^\p{L}{4,}$/u.test(word)) continue
			for (const opts of [{}, PL]) {
				const plan = planV(word, opts)
				if (plan.corrections.length > 0) throw new Error(`${word} was corrected to ${plan.corrections[0].to}`)
				if (plan.fuzzyEligible.length > 0) throw new Error(`${word} is listed as fuzzyEligible although it exists`)
			}
			tried++
		}
		ok(tried > 150, `only ${tried} words tried`)
		// A word that is a stem of what the library holds exists too, and so does a prefix of one.
		eq(planV('kitchens').corrections, [])
		eq(planV('remodeling').corrections, [])
		eq(planV('kitc', PL).corrections, [])
		eq(planV('kitc*').corrections, [])
	})

	await check('short words are never fuzzed; four letters is enough', () => {
		const vocab = new Map([['deck', 4], ['fence', 4], ['van', 9], ['patio', 3]])
		for (const word of ['dek', 'vna', 'dec', 'pat', 'fnc']) eq(planOf(word, { vocabulary: vocab }).corrections, [], word)
		eq(planOf('fenc', { vocabulary: vocab }).corrections, [{ from: 'fenc', to: 'fence' }], 'four letters')
		eq(planOf('dekc', { vocabulary: vocab }).corrections, [{ from: 'dekc', to: 'deck' }], 'a swap in four letters')
		eq(planOf('patoi', { vocabulary: vocab }).corrections, [{ from: 'patoi', to: 'patio' }])
		eq(planOf('pattio', { vocabulary: vocab }).corrections, [{ from: 'pattio', to: 'patio' }], 'one extra letter')
		eq(planOf('xatio', { vocabulary: vocab }).corrections, [], 'the first letter must be right')
		eq(planOf('pxtxo', { vocabulary: vocab }).corrections, [], 'two edits in a five-letter word is too far')
	})

	await check('a typo word is replaced by at most three stand-ins: the three closest by document count', () => {
		// Five words one edit from `plank`, none sharing its stem; counts 5, 4, 3, 2, 1.
		const vocab = new Map([['plant', 5], ['plane', 4], ['plans', 3], ['plana', 2], ['planx', 1]])
		const plan = planOf('plank', { vocabulary: vocab })
		eq(plan.corrections, [{ from: 'plank', to: 'plant' }], 'the best stand-in is the one reported')
		for (const word of ['plant', 'plane', 'plans']) ok(plan.evaluate(D({ caption: word })) !== null, `${word} stands in`)
		for (const word of ['plana', 'planx']) eq(plan.evaluate(D({ caption: word })), null, `${word} is the fourth or fifth`)
		const filter = JSON.stringify(shapeOf(plan.prefilter))
		for (const word of ['plant', 'plane', 'plans']) ok(filter.includes(`"${word}"`), `${word} is in the prefilter`)
		ok(!filter.includes('"plana"') && !filter.includes('"planx"'), 'and the others are not')
		eq(plan.evaluate(D({ caption: 'plant' })), { score: 1.5, fields: ['caption'] }, 'a stand-in is a fuzzy match: 3 x 0.5')
	})

	await check('typo words: positive unquoted free text only; never phrases, field values, tags or negations', () => {
		for (const query of ['"kithcen"', '"kithcen bathrom"', 'name:kithcen', 'caption:kithcen', 'text:kithcen', 'tag:kithcen', '-kithcen', 'NOT kithcen', '-(kithcen bathrom)', 'folder:kithcen']) {
			const plan = planV(query)
			eq(plan.corrections, [], query)
			eq(plan.fuzzyEligible, [], query)
		}
		eq(planV('kithcen -kithcen').corrections, [{ from: 'kithcen', to: 'kitchen' }], 'the positive one only')
		eq(planV('kithcen*').corrections, [{ from: 'kithcen', to: 'kitchen' }], 'a typo with a star is still a typo')
	})

	await check('fuzzyEligible: words a vocabulary could rescue, and nothing else', () => {
		eq(planV('kitchen').fuzzyEligible, [])
		eq(planV('abc').fuzzyEligible, [], 'too short')
		eq(planV('xqzvbnm').fuzzyEligible, [], 'nothing is close, so a second pass cannot help')
		eq(planV('xqzvbnm kithcen').fuzzyEligible, ['kithcen'])
		eq(planV('kithcen').fuzzyEligible, ['kithcen'])
		eq(planV('kithcen bathrom').fuzzyEligible, ['kithcen', 'bathrom'])
		eq(planV('kithcen kithcen').fuzzyEligible, ['kithcen'], 'listed once')
		eq(planV('acme').fuzzyEligible, [], 'a folder name is not a typo, and the vocabulary has no folder names')
		eq(planV('2024').fuzzyEligible, [], 'a number')
		// With no vocabulary the planner cannot know, so it lists every free-text word the vocabulary could change.
		const blind = (text, opts) => planOf(text, opts).fuzzyEligible
		eq(blind('kithcen'), ['kithcen'])
		eq(blind('bathroom'), ['bathroom'], 'it cannot tell a typo from a word that exists')
		eq(blind('kithcen bathrom'), ['kithcen', 'bathrom'])
		eq(blind('abc'), [])
		eq(blind('"kithcen"'), [])
		eq(blind('name:kithcen'), [])
		eq(blind('-kithcen'), [])
		eq(blind('tag:kithcen'), [])
		eq(blind('2024'), [])
		eq(blind('iphone15'), [], 'an identifier, not a typo')
		eq(blind('acme'), [], 'the folder tree knows it')
		eq(blind('with'), [], 'a stopword the parser kept is not a typo')
		eq(blind('bathroom type:png'), ['bathroom'])
		eq(blind('bathroom OR deckk'), ['bathroom', 'deckk'])
		eq(blind(''), [])
	})

	await check('a typo pass finds what the strict pass could not, with the same invariant', async () => {
		const strict = planOf('kithcen bathrom')
		eq(CORPUS.filter((doc) => strict.evaluate(doc)).length, 0)
		const typo = planV('kithcen bathrom')
		const hits = CORPUS.filter((doc) => typo.evaluate(doc))
		ok(hits.length > 0, 'a corrected query finds documents')
		const expected = CORPUS.filter((doc) => !MALFORMED.has(doc._id.toString()) && termHit(doc, 'kitchen') && termHit(doc, 'bathroom'))
		ok(expected.length > 0, 'the library holds such documents')
		for (const doc of expected) ok(typo.evaluate(doc) !== null, `${doc.name} has both words`)
		ok(hits.every((doc) => typo.evaluate(doc).score > 0))
		const found = await assetsCollection.find(typo.prefilter).toArray()
		ok(hits.every((doc) => idsOf(found).has(doc._id.toString())), 'the prefilter keeps every fuzzy match')
	})

	/* ---------------------------------------------------------------------- */
	section('explain(): which index serves each prefilter (recorded, never asserted)')

	const stagesOf = (node, out = []) => {
		if (Array.isArray(node)) {
			for (const child of node) stagesOf(child, out)
			return out
		}
		if (node && typeof node === 'object') {
			if (typeof node.stage === 'string') out.push(node.stage)
			if (typeof node.indexName === 'string') out.push(`[${node.indexName}]`)
			for (const [key, value] of Object.entries(node)) if (key !== 'indexBounds' && value && typeof value === 'object') stagesOf(value, out)
		}
		return out
	}
	for (const query of ['kitchen', 'kitchen bathroom', 'ki*', 'tag:kitchen', 'kitchen OR -tag:x', 'type:png', 'folder:Acme']) {
		await check(`explain ${query}`, async () => {
			const explained = await assetsCollection.find(planOf(query).prefilter).explain('queryPlanner')
			const winning = explained?.queryPlanner?.winningPlan
			ok(winning, 'the server explained a winning plan')
			const names = [...new Set(stagesOf(winning))]
			ok(names.length > 0, 'with at least one stage')
			note(`EXPLAIN ${shown(query, 40).padEnd(22)} ${names.join(' > ')}`)
		})
	}

	/* ---------------------------------------------------------------------- */
	section('robustness: hostile input')

	const FRAGMENTS = [
		'kitchen', 'bathroom', 'blue', 'deck', 'kithcen', 'bathrom', 'remodl', 'the', 'a', 'x', 'ki*', 'k*', '*', '**', 'acm*', 'acme', 'hero',
		'"before and after"', '"the who"', '"kitchen remodel"', '"', '""', 'kitchen-remodel', 'before-and-after', 't-shirt',
		'tag:kitchen', '#kitchen', 'tag:ki*', 'tag:old-name', 'tag:cycle-a', 'tag:', 'tag:kitchen,bathroom', '-tag:kitchen',
		'name:the', 'name:"the who"', 'name:kit*', 'caption:"for sale"', 'text:grand',
		'type:png', 'type:png,jpg', 'type:xyz', 'color:blue', 'color:', 'orientation:landscape', 'kind:logo', 'is:untagged', 'is:dark', 'is:unreviewed',
		'width:>1200', 'height:<=600', 'size:>2mb', 'size:500kb..2mb', 'added:7d', 'added:2026-03-01', 'added:>2026',
		'folder:Clients/Acme', 'folder:Acme', 'folder:none', 'folder:nope', 'folder:"Clients/Acme"', 'sort:name',
		'OR', 'NOT', '-', '-kitchen', '-(', '(', ')', '((', '))', '\\', '$ne', '{', '}', '..', '|', '.*', '^', '$',
		'日本', 'café', '\u{1f642}', '‮', '\0', '​', 'x'.repeat(120), '1', '2024', 'iphone15', 'h2o', '4k',
	]
	const randomQuery = (random) => {
		const parts = Array.from({ length: 1 + Math.floor(random() * 12) }, () => FRAGMENTS[Math.floor(random() * FRAGMENTS.length)])
		return parts.join(random() < 0.15 ? '' : ' ')
	}

	await check('3,000 random parse -> plan -> evaluate runs never throw, and every filter is valid BSON', () => {
		const random = rng(424242)
		const documents = [...CORPUS.filter((_, i) => i % 37 === 0), ...malformed, FIX['cap-before-after'], FIX['name-the-who'], FIX['tag-kitchen'], FIX['folder-hero']]
		const variants = [{}, { prefixLast: true, vocabulary: VOCAB }]
		let evaluations = 0
		for (let i = 0; i < 3000; i++) {
			const query = randomQuery(random)
			try {
				const ast = parseQuery(query, { now: NOW })
				for (const opts of variants) {
					const plan = planQuery(ast, ctxFor(opts))
					lintFilter(plan.prefilter)
					if (bsonDepth(plan.prefilter) > 40) throw new Error(`filter depth ${bsonDepth(plan.prefilter)}`)
					BSON.serialize(plan.prefilter)
					if (plan.needsEvaluation !== plan.hasText) throw new Error('needsEvaluation differs from hasText')
					for (const doc of documents) {
						const result = plan.evaluate(doc)
						evaluations++
						if (result !== null && !(Number.isFinite(result.score) && result.score >= 0 && Array.isArray(result.fields) && result.fields.every((f) => typeof f === 'string'))) {
							throw new Error(`bad result ${JSON.stringify(result)}`)
						}
					}
					for (const one of plan.corrections) if (typeof one.from !== 'string' || typeof one.to !== 'string') throw new Error('bad correction')
					for (const word of plan.fuzzyEligible) if (typeof word !== 'string') throw new Error('bad fuzzyEligible')
				}
				if (i % 50 === 0) {
					const again = JSON.stringify(planQuery(ast, ctxFor()).prefilter)
					if (again !== JSON.stringify(planQuery(ast, ctxFor()).prefilter)) throw new Error('planning is not deterministic')
				}
			} catch (error) {
				throw new Error(`run ${i} on ${JSON.stringify(query).slice(0, 120)}: ${error.message}`)
			}
		}
		note(`${evaluations} evaluations across 6,000 plans`)
	})

	await check('300 random queries: the invariant holds against Mongo (superset, and exact without text)', async () => {
		const random = rng(99)
		const batch = Array.from({ length: 300 }, () => ({
			query: randomQuery(random),
			opts: random() < 0.3 ? { prefixLast: true, vocabulary: VOCAB } : random() < 0.4 ? { prefixLast: true } : {},
		}))
		const problems = []
		let withText = 0
		await pool(batch, 8, async ({ query, opts }) => {
			try {
				const plan = planOf(query, opts)
				if (plan.hasText) withText++
				const brute = idsOf(CORPUS.filter((doc) => plan.evaluate(doc)))
				const found = await assetsCollection.find(plan.prefilter).toArray()
				const foundIds = idsOf(found)
				const lost = new Set([...brute].filter((id) => !foundIds.has(id)))
				if (lost.size) problems.push(`COUNTEREXAMPLE ${shown(query, 80)}: the prefilter lost ${lost.size} (${sample(lost)}); ${shown(shapeOf(plan.prefilter), 200)}`)
				else if (!sameSet(idsOf(found.filter((doc) => plan.evaluate(doc))), brute)) problems.push(`${shown(query, 80)}: candidates then evaluate differs`)
				else if (!plan.needsEvaluation && !sameSet(foundIds, brute)) problems.push(`${shown(query, 80)}: a text-free prefilter is not exact`)
			} catch (error) {
				problems.push(`${shown(query, 80)}: ${error.message}`)
			}
		})
		if (problems.length) throw new Error(`${problems.length} problem(s): ${problems.slice(0, 3).join(' || ')}`)
		ok(withText > 100 && withText < 300, `a mix of text and structured queries (${withText} with text)`)
	})

	await check('400 random well-formed nested queries (AND, OR, NOT and groups over every kind of clause): the invariant holds against Mongo', async () => {
		const ATOMS = ['kitchen', 'bathroom', 'blue', 'deck', 'patio', 'the', 'ki*', 'bath*', 'acme', 'hero', 'kithcen', '"before and after"', '"kitchen remodel"', 'kitchen-remodel', '"the who"', 'tag:kitchen', 'tag:ki*', 'tag:old-name', 'type:png', 'type:jpg,webp', 'is:dark', 'is:untagged', 'is:unreviewed', 'is:captioned', 'color:blue', 'orientation:landscape', 'kind:logo', 'folder:Acme', 'folder:none', 'width:>1000', 'size:<1mb', 'added:month', 'name:the', 'name:kit*', 'caption:"for sale"', 'text:grand']
		const random = rng(2026)
		const grammar = (depth) => {
			const atom = () => ATOMS[Math.floor(random() * ATOMS.length)]
			const unary = (d) => {
				const base = d > 0 && random() < 0.3 ? `(${expression(d - 1)})` : atom()
				return random() < 0.25 ? `-${base}` : base
			}
			const conjunction = (d) => Array.from({ length: 1 + Math.floor(random() * 3) }, () => unary(d)).join(' ')
			const expression = (d) => Array.from({ length: random() < 0.4 ? 2 + Math.floor(random() * 2) : 1 }, () => conjunction(d)).join(' OR ')
			return expression(depth)
		}
		const batch = Array.from({ length: 400 }, () => ({
			query: grammar(1 + Math.floor(random() * 4)),
			opts: random() < 0.3 ? { prefixLast: true, vocabulary: VOCAB } : random() < 0.4 ? { prefixLast: true } : {},
		}))
		const problems = []
		let withText = 0
		let depthSeen = 0
		await pool(batch, 8, async ({ query, opts }) => {
			try {
				const plan = planOf(query, opts)
				if (plan.hasText) withText++
				depthSeen = Math.max(depthSeen, bsonDepth(plan.prefilter))
				lintFilter(plan.prefilter)
				const brute = idsOf(CORPUS.filter((doc) => plan.evaluate(doc)))
				const found = await assetsCollection.find(plan.prefilter).toArray()
				const foundIds = idsOf(found)
				const lost = new Set([...brute].filter((id) => !foundIds.has(id)))
				if (lost.size) problems.push(`COUNTEREXAMPLE ${shown(query, 100)}: the prefilter lost ${lost.size} (${sample(lost)}); ${shown(shapeOf(plan.prefilter), 240)}`)
				else if (!sameSet(idsOf(found.filter((doc) => plan.evaluate(doc))), brute)) problems.push(`${shown(query, 100)}: candidates then evaluate differs`)
				else if (!plan.needsEvaluation && !sameSet(foundIds, brute)) problems.push(`${shown(query, 100)}: a text-free prefilter is not exact`)
			} catch (error) {
				problems.push(`${shown(query, 100)}: ${error.message}`)
			}
		})
		if (problems.length) throw new Error(`${problems.length} problem(s): ${problems.slice(0, 3).join(' || ')}`)
		ok(withText > 150 && withText < 400, `a mix of text and structured queries (${withText} with text)`)
		note(`${batch.length} nested queries (${withText} with text), deepest filter ${depthSeen} BSON levels`)
	})

	/* ---------------------------------------------------------------------- */
	section('semantics: the planner against oracles, on random queries')

	const IS_ORACLE = {
		untagged: (d) => Array.isArray(d.tags) && d.tags.length === 0,
		tagged: (d) => Array.isArray(d.tags) && d.tags.length > 0,
		unreviewed: (d) => tagsOf(d).some((t) => t.source === 'auto'),
		reviewed: (d) => tagsOf(d).length > 0 && !tagsOf(d).some((t) => t.source === 'auto'),
		unfiled: (d) => !d.folderId,
		filed: (d) => !!d.folderId,
		animated: (d) => d.animated === true,
		transparent: (d) => d.hasAlpha === true,
		dark: (d) => d.brightness === 'dark',
		light: (d) => d.brightness === 'light',
		vivid: (d) => d.saturation === 'vivid',
		muted: (d) => d.saturation === 'muted',
		monochrome: (d) => d.saturation === 'monochrome',
		pending: (d) => ['pending', 'running'].includes(d.tagging?.status),
		failed: (d) => d.tagging?.status === 'failed',
		captioned: (d) => typeof d.caption === 'string' && d.caption !== '',
		uncaptioned: (d) => d.caption === '' || d.caption == null,
	}
	const FORMAT_OF = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' }
	/** `old -> new` at most five hops, never around a circle: restated here from the spec, not from plan.ts. */
	const redirected = (slug) => {
		let current = slug
		const seen = new Set([slug])
		for (let hop = 0; hop < 5; hop++) {
			const next = REDIRECTS.get(current)
			if (!next || seen.has(next)) break
			seen.add(next)
			current = next
		}
		return current
	}
	const compared = (cmp, read) => (d) => {
		const value = read(d)
		switch (cmp.op) {
			case 'eq': return value === cmp.value
			case 'gt': return value > cmp.value
			case 'gte': return value >= cmp.value
			case 'lt': return value < cmp.value
			case 'lte': return value <= cmp.value
			default: return value >= cmp.from && value <= cmp.to
		}
	}
	/** The meaning of a parsed query, node by node, in the oracle's own terms. */
	function oracleOfAst(node) {
		if (!node) return O.any
		switch (node.type) {
			case 'term': return O.term(node.text, { prefix: node.prefix })
			case 'phrase': return O.phrase(node.text, node.implicit === true)
			case 'not': return O.not(oracleOfAst(node.node))
			case 'and': return O.and(...node.nodes.map(oracleOfAst))
			case 'or': return O.or(...node.nodes.map(oracleOfAst))
			default: {
				const values = node.values
				switch (node.field) {
					case 'tag': return node.prefix ? O.tagPrefix(...values) : O.tag(...values.map(redirected))
					case 'name':
					case 'caption':
					case 'text': return O.or(...values.map((value) => O.value(node.field, value, node.prefix === true)))
					case 'folder': return O.or(...values.map((value) => (value === 'unfiled' ? O.unfiled : O.folder(value))))
					case 'type': return S((d) => values.some((value) => FORMAT_OF[value] === d.contentType))
					case 'color': return S(colorIs(...values))
					case 'orientation': return S((d) => values.includes(d.orientation))
					case 'kind': return S((d) => values.includes(d.kind))
					case 'is': return S((d) => values.some((value) => IS_ORACLE[value](d)))
					case 'width': return S(compared(node.cmp, (d) => d.width))
					case 'height': return S(compared(node.cmp, (d) => d.height))
					case 'size': return S(compared(node.cmp, (d) => d.bytes))
					case 'added': return S(compared(node.cmp, (d) => at(d)))
					default: throw new Error(`the oracle does not know field ${node.field}`)
				}
			}
		}
	}

	/** Every well-formed fixture and an eighth of the generated bulk: enough to tell queries apart, quick to evaluate. */
	const sampleDocs = [...fixtureDocs.filter((doc) => !MALFORMED.has(doc._id.toString())), ...bulk.filter((_, index) => index % 8 === 0)]
	const evaluatedIds = (plan) => idsOf(sampleDocs.filter((doc) => plan.evaluate(doc)))
	const TOO_COMPLEX = 'Query too complex, extra grouping ignored.'

	await check('400 random nested queries: the planner equals the oracle composed from the query text AND the oracle derived from its AST', () => {
		const sized = (d) => d.width > 1000
		const atoms = [
			['kitchen', O.term('kitchen')],
			['bathroom', O.term('bathroom')],
			['blue', O.term('blue')],
			['deck', O.term('deck')],
			['patio', O.term('patio')],
			['acme', O.term('acme')],
			['hero', O.term('hero')],
			['kithcen', O.term('kithcen')],
			['ki*', O.term('ki', { prefix: true })],
			['bath*', O.term('bath', { prefix: true })],
			['"before and after"', O.phrase('before and after')],
			['"kitchen remodel"', O.phrase('kitchen remodel')],
			['kitchen-remodel', O.phrase('kitchen remodel', true)],
			['"the who"', O.phrase('the who')],
			['tag:kitchen', O.tag('kitchen')],
			['tag:ki*', O.tagPrefix('ki')],
			['tag:old-name', O.tag('kitchen')],
			['type:png', S((d) => d.contentType === 'image/png')],
			['type:jpg,webp', S((d) => d.contentType === 'image/jpeg' || d.contentType === 'image/webp')],
			['is:dark', S((d) => d.brightness === 'dark')],
			['is:untagged', S((d) => Array.isArray(d.tags) && d.tags.length === 0)],
			['is:unreviewed', S((d) => tagsOf(d).some((t) => t.source === 'auto'))],
			['is:captioned', S((d) => typeof d.caption === 'string' && d.caption !== '')],
			['color:blue', S(colorIs('blue'))],
			['orientation:landscape', S((d) => d.orientation === 'landscape')],
			['kind:logo', S((d) => d.kind === 'logo')],
			['folder:Acme', O.folder('Acme')],
			['folder:none', O.unfiled],
			['width:>1000', S(sized)],
			['size:<1mb', S((d) => d.bytes < MB)],
			['added:month', S((d) => at(d) >= Date.UTC(2026, 2, 1) && at(d) <= Date.UTC(2026, 3, 1) - 1)],
			['name:the', O.value('name', 'the')],
			['name:kit*', O.value('name', 'kit', true)],
			['caption:"for sale"', O.value('caption', 'for sale')],
			['text:grand', O.value('text', 'grand')],
		]
		const random = rng(777)
		// Each piece is generated as text AND as the predicate that text means: NOT binds tightest, then
		// adjacency (AND), then OR, and parentheses group.
		const unary = (depth) => {
			const piece = depth > 0 && random() < 0.3 ? group(depth - 1) : atoms[Math.floor(random() * atoms.length)]
			return random() < 0.25 ? [`-${piece[0]}`, O.not(piece[1])] : piece
		}
		const conjunction = (depth) => {
			const parts = Array.from({ length: 1 + Math.floor(random() * 3) }, () => unary(depth))
			return [parts.map((p) => p[0]).join(' '), O.and(...parts.map((p) => p[1]))]
		}
		const expression = (depth) => {
			const parts = Array.from({ length: random() < 0.4 ? 2 + Math.floor(random() * 2) : 1 }, () => conjunction(depth))
			return [parts.map((p) => p[0]).join(' OR '), O.or(...parts.map((p) => p[1]))]
		}
		const group = (depth) => {
			const inner = expression(depth)
			return [`(${inner[0]})`, inner[1]]
		}
		let byText = 0
		let capped = 0
		let nonEmpty = 0
		for (let i = 0; i < 400; i++) {
			const [query, textOracle] = expression(1 + Math.floor(random() * 3))
			const parsedQuery = parsed(query)
			const actual = evaluatedIds(planQuery(parsedQuery, ctxFor()))
			const fromAst = idsOf(sampleDocs.filter(oracleOfAst(parsedQuery.ast)))
			if (!sameSet(fromAst, actual)) throw new Error(`${shown(query, 220)} (against its AST): ${diffNote(fromAst, actual)}`)
			// Past its nesting cap the parser rewrites a query on purpose and says so; the AST oracle covers those.
			if (parsedQuery.warnings.includes(TOO_COMPLEX)) {
				capped++
				continue
			}
			const fromText = idsOf(sampleDocs.filter(textOracle))
			if (!sameSet(fromText, actual)) throw new Error(`${shown(query, 220)} (against its text): ${diffNote(fromText, actual)}`)
			byText++
			if (fromText.size > 0) nonEmpty++
		}
		ok(byText >= 250, `only ${byText} of 400 stayed inside the parser's nesting cap (${capped} did not)`)
		ok(nonEmpty >= 120, `most queries should match something (${nonEmpty} did)`)
		note(`${byText} queries checked against their text and AST, ${capped} past the parser's cap checked against their AST only`)
	})

	await check('1,500 random queries, hostile fragments included: the planner equals the oracle derived from the parsed AST', () => {
		const random = rng(31337)
		let informative = 0
		for (let i = 0; i < 1500; i++) {
			const query = randomQuery(random)
			const parsedQuery = parsed(query)
			const expected = idsOf(sampleDocs.filter(oracleOfAst(parsedQuery.ast)))
			const actual = evaluatedIds(planQuery(parsedQuery, ctxFor()))
			if (!sameSet(expected, actual)) throw new Error(`${shown(query, 200)}: ${diffNote(expected, actual)}`)
			if (expected.size > 0 && expected.size < sampleDocs.length) informative++
		}
		ok(informative >= 200, `only ${informative} queries separated documents`)
	})

	await check('hand-built hostile trees (holes, bad values, odd operators, no context) never throw and stay safe in Mongo', async () => {
		const nodes = [
			leaf('', { prefix: true }),
			leaf('a b c'),
			leaf('A.B(C)*', { prefix: true }),
			leaf('$ne', { prefix: true }),
			leaf('x'.repeat(5000), { prefix: true }),
			{ type: 'phrase', text: '   ', start: 0, end: 1 },
			{ type: 'phrase', text: 'THE   WHO', start: 0, end: 1 },
			{ type: 'phrase', text: 'a.b (c)', implicit: true, start: 0, end: 1 },
			field('name', ['The  Who', '', '   ', '日本'], { prefix: true }),
			field('caption', [null, 5, {}]),
			field('tag', [null, 5, '', 'ok']),
			field('tag', ['a.b', 'c|d'], { prefix: true }),
			field('folder', ['', '/', '//a//', 'unfiled', 'Acme']),
			field('type', ['__proto__', 'constructor', 'png']),
			field('color', [null, 'blue']),
			field('width', [], { cmp: { op: 'gt', value: Number.NaN } }),
			field('width', [], { cmp: { op: 'range', from: 5, to: Number.POSITIVE_INFINITY } }),
			field('added', [], { cmp: { op: 'gte', value: 1e20 } }),
			field('size', [], { cmp: { op: 'wat', value: 1 } }),
			field('height', [], { cmp: null }),
			{ type: 'not', node: null, start: 0, end: 1 },
			{ type: 'not', node: leaf('deck'), start: 0, end: 1 },
			{ type: 'and', nodes: [null, leaf('deck'), undefined] },
			{ type: 'or', nodes: [leaf('deck'), 7, 'x'] },
			{ type: 'and', nodes: 'not an array' },
			{ type: 'or' },
		]
		const variants = [{}, { prefixLast: true, vocabulary: VOCAB }]
		const sampleDocs = [...CORPUS.filter((_, i) => i % 41 === 0), ...malformed]
		let sent = 0
		for (const ast of nodes) {
			for (const wrap of [(n) => n, (n) => ({ type: 'not', node: n, start: 0, end: 1 }), (n) => ({ type: 'and', nodes: [n, leaf('deck')] }), (n) => ({ type: 'or', nodes: [n, field('tag', ['kitchen'])] })]) {
				for (const opts of variants) {
					const plan = built(wrap(ast), opts)
					lintFilter(plan.prefilter)
					BSON.serialize(plan.prefilter)
					for (const doc of sampleDocs) plan.evaluate(doc)
					const found = await assetsCollection.find(plan.prefilter).toArray()
					const brute = idsOf(CORPUS.filter((doc) => plan.evaluate(doc)))
					ok([...brute].every((id) => idsOf(found).has(id)), `${JSON.stringify(ast).slice(0, 80)}: the prefilter lost a match`)
					sent++
				}
			}
		}
		// And a plan made with no folder tree, no redirects and no vocabulary at all.
		const bare = planQuery(parsed('acme tag:old-name kithcen folder:Acme "x y"'), { workspaceId: W, userId: 'p', now: NOW, prefixLast: true })
		lintFilter(bare.prefilter)
		for (const doc of sampleDocs) bare.evaluate(doc)
		note(`${sent} hostile filters planned, evaluated and sent to Mongo`)
	})

	/* ---------------------------------------------------------------------- */
	section('readings the spec leaves open, pinned here so a change is noticed')

	await check('a query of nothing but stopwords is index-only: unquoted it matches nothing, quoted or name: it finds the document', () => {
		const who = FIX['name-the-who']._id.toString()
		const hits = (text, opts) => idsOf(CORPUS.filter((doc) => planOf(text, opts).evaluate(doc)))
		for (const text of ['the who', 'the', 'who', 'it is what it is']) {
			ok(planOf(text).hasText, `${text} still counts as text`)
			ok(!hits(text).has(who), `${text}: the index holds no stopwords, so a bare term cannot find "The Who"`)
		}
		for (const text of ['"the who"', 'name:"the who"', 'name:the', 'name:who']) ok(hits(text).has(who), `${text} finds it`)
		eq(planOf('the who').fuzzyEligible, [], 'and a stopword is never a typo')
	})

	await check('the final bare word is the term that starts last, when it is positive; it alone becomes a prefix', () => {
		const regexOf = (text, opts) => JSON.stringify(shape(text, opts)).match(/"\$regex":"([^"]+)"/g) ?? []
		eq(regexOf('deck patio', PL), ['"$regex":"^patio"'])
		eq(regexOf('deck patio type:png', PL), ['"$regex":"^patio"'], 'a filter after it does not move the prefix')
		eq(regexOf('deck OR patio', PL), ['"$regex":"^patio"'])
		eq(regexOf('patio deck', PL), ['"$regex":"^deck"'])
		eq(regexOf('deck -patio', PL), [], 'a negated last word makes nothing a prefix')
		eq(regexOf('deck "the who"', PL), ['"$regex":"^deck"'], 'a phrase is not a bare word, so the last bare word is deck')
		eq(regexOf('deck patio', {}), [], 'and without prefixLast nothing is')
		eq(regexOf('deck* patio*', {}), ['"$regex":"^deck"', '"$regex":"^patio"'], 'explicit stars always count')
		eq(planOf('deck patio', PL).evaluate(D({ caption: 'deckhand patio' })), null, 'deck is exact here')
		ok(planOf('deck patio', PL).evaluate(D({ caption: 'deck patios' })), 'patio is the one that may continue')
		ok(planOf('deck pat', PL).evaluate(D({ caption: 'deck patio' })), 'pat is a prefix')
	})

	section('cost: what evaluating and planning spend (recorded, with a bound only against pathological slowness)')

	await check('evaluating 5,000 candidates and planning against 1,000 folders stay cheap', () => {
		const many = Array.from({ length: 5000 }, (_, i) => CORPUS[i % CORPUS.length])
		for (const query of ['kitchen bathroom', 'ki* blue', '"before and after" -tag:x', 'name:the OR caption:sale', 'type:png width:>1000']) {
			const plan = planOf(query)
			const start = performance.now()
			let matched = 0
			for (const doc of many) if (plan.evaluate(doc)) matched++
			const ms = performance.now() - start
			note(`evaluate ${shown(query, 34).padEnd(28)} 5,000 candidates in ${String(Math.round(ms)).padStart(5)} ms (${(ms / 5000).toFixed(3)} ms each, ${matched} matched)`)
			ok(ms < 30_000, `${query} took ${Math.round(ms)} ms`)
		}
		// 20 roots with 49 children each, a quarter of them named for the query's words.
		const nodes = []
		for (let i = 0; i < 1000; i++) {
			nodes.push({ _id: new ObjectId(), parentId: i % 50 === 0 ? null : nodes[i - (i % 50)]._id, name: i % 4 === 0 ? `Kitchen ${i}` : `Job ${i}` })
		}
		const big = buildFolderIndex(nodes)
		const start = performance.now()
		const plan = planQuery(parsed('kitchen bathroom blue deck ki*'), { ...ctxFor(PL), folders: big })
		const ms = performance.now() - start
		note(`plan 5 words against ${big.ordered().length} folders in ${Math.round(ms)} ms`)
		ok(ms < 5000, `planning took ${Math.round(ms)} ms`)
		lintFilter(plan.prefilter)
		BSON.serialize(plan.prefilter)
	})

	await check('tag: prefixes are as short as the person wrote them; a free-text prefix needs two characters', () => {
		eq(shape('tag:k*'), { 'tags.slug': { $regex: '^k' } })
		eq(shape('k*'), term('k'))
		ok(planOf('tag:k*').evaluate(FIX['tag-kitchen']) !== null)
	})

} catch (error) {
	failed++
	const trace = (error && error.stack ? error.stack : String(error)).split('\n').slice(0, 4).join(' | ')
	console.log(`FAIL  the proof itself crashed (${trace})`)
} finally {
	await assetsCollection.deleteMany({ workspaceId: W })
	const left = await assetsCollection.countDocuments({ workspaceId: W })
	if (left) console.log(`WARN  ${left} proof documents could not be cleaned up`)
	await client.close()
}

console.log(`\n${passed}/${passed + failed} passed, ${failed} failed (${assertions} assertions)`)
process.exit(failed ? 1 : 0)
