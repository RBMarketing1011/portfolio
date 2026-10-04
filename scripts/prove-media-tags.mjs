/**
 * Proves the media library's write chokepoint (commit.ts) and tagging system
 * (tags.ts) against the REAL source and the real database:
 *
 *   node --env-file=.env scripts/prove-media-tags.mjs
 *
 * Expected values come from the specification (the stub doc comments and the build
 * spec), not from what the code printed. The pure functions are proved first
 * (table-driven, then property-style over seeded random input, so a failure
 * reproduces); the database sections follow. Concurrent writers are SIMULATED by
 * injecting a foreign write between a read and a write, and also run for real.
 *
 * Hygiene: every run uses fresh workspace ids and only creates, reads and deletes
 * documents carrying them, in mediaAssets and mediaTagRules; all of it is deleted
 * in a `finally`. No indexes are created or dropped. Nothing outside the database
 * is touched.
 *
 * Knobs: PROVE_ONLY=<regex> runs only the checks whose name matches; PROVE_SRC=<dir>
 * loads a copy of src/lib/media from <dir> (used to check the proof fails when the
 * code is deliberately broken).
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const { MongoClient, ObjectId } = rootRequire('mongodb')

// PROVE_SRC points the proof at a copy of src/lib/media, so a deliberately broken copy
// can show that the proof fails when the code is wrong. Unset, it is the real source.
const SRC = process.env.PROVE_SRC ?? 'src/lib/media'
const T = loadTs(`${SRC}/tags.ts`)
const C = loadTs(`${SRC}/commit.ts`)
const V = loadTs(`${SRC}/vocabulary.ts`)
const { derivedFields } = loadTs(`${SRC}/terms.ts`)
const { slugify } = loadTs(`${SRC}/text.ts`)
const { MEDIA_LIMITS } = loadTs(`${SRC}/types.ts`)
const { MediaError } = loadTs(`${SRC}/errors.ts`)

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
const only = process.env.PROVE_ONLY ? new RegExp(process.env.PROVE_ONLY, 'i') : null

async function check(name, fn) {
	if (only && !only.test(name)) return
	try {
		await fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		const detail = (error && error.message ? error.message : String(error))
			.split('\n')
			.slice(0, 8)
			.join(' | ')
		console.log(`FAIL  ${name} (${detail})`)
	}
}
const section = (title) => console.log(`\n== ${title}`)

/** Silences console.error for one call (the commit logs a rejected write) and returns what it printed. */
async function quietly(fn) {
	const original = console.error
	const lines = []
	console.error = (...args) => lines.push(args.map(String).join(' '))
	try {
		return { value: await fn(), lines }
	} finally {
		console.error = original
	}
}

function deepFreeze(value) {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const key of Object.keys(value)) deepFreeze(value[key])
	}
	return value
}

/** A Map that throws if anything tries to change it, and counts every `get`. */
function readonlyMap(map) {
	const stats = { gets: 0 }
	const proxy = new Proxy(map, {
		get(target, prop) {
			if (prop === 'set' || prop === 'delete' || prop === 'clear')
				return () => {
					throw new Error(`rules were mutated (${String(prop)})`)
				}
			if (prop === 'get')
				return (key) => {
					stats.gets++
					return target.get(key)
				}
			const value = Reflect.get(target, prop)
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
	return { rules: proxy, stats }
}

const clone = (value) => structuredClone(value)

/** Runs `fn` on deep-frozen copies of the inputs (any write to an argument throws) and checks they are unchanged. */
function pureCall(inputs, fn) {
	const snapshot = clone(inputs)
	const frozen = deepFreeze(clone(inputs))
	const result = fn(...frozen)
	assert.deepEqual(frozen, snapshot, 'an argument was changed')
	return result
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const manual = (slug, label = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ')) => ({
	slug,
	label,
	source: 'manual',
})
const vision = (slug, confidence, label = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ')) => ({
	slug,
	label,
	source: 'auto',
	via: 'vision',
	confidence,
})
const fname = (slug, label = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ')) => ({
	slug,
	label,
	source: 'auto',
	via: 'filename',
})
const redirect = (slug, label) => ({ slug, label })
const rulesOf = (entries = []) => new Map(entries)
const slugs = (tags) => tags.map((tag) => tag.slug)
const cap = MEDIA_LIMITS.maxTagsPerAsset

/** No `undefined` anywhere: the driver would store it as null. */
const jsonSafe = (value, label = 'value') =>
	assert.deepEqual(JSON.parse(JSON.stringify(value)), value, `${label} holds an undefined value`)

/** The first deterministic PRNG that is good enough to cover shapes, so a failing seed reproduces. */
function rng(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
const pick = (r, list) => list[Math.floor(r() * list.length)]

/* -------------------------------------------------------------------------- */
/* Pure: normalizeTag                                                         */
/* -------------------------------------------------------------------------- */

async function provePure() {
	section('normalizeTag')

	const normalizeCases = [
		['Kitchen', { slug: 'kitchen', label: 'Kitchen' }],
		['Kitchen Remodel', { slug: 'kitchen-remodel', label: 'Kitchen Remodel' }],
		['  kitchen   remodel  ', { slug: 'kitchen-remodel', label: 'kitchen remodel' }],
		['Kitchen-Remodel!', { slug: 'kitchen-remodel', label: 'Kitchen-Remodel!' }],
		['Café', { slug: 'cafe', label: 'Café' }],
		['日本', { slug: '日本', label: '日本' }],
		['Фото', { slug: 'фото', label: 'Фото' }],
		['R&D', { slug: 'r-and-d', label: 'R&D' }],
		['iPhone 15', { slug: 'iphone-15', label: 'iPhone 15' }],
		['a\u200bb', { slug: 'ab', label: 'ab' }, 'a zero-width space inside a word'],
		['a\u0007b', { slug: 'ab', label: 'ab' }],
		['<b>x</b>', { slug: 'b-x-b', label: '<b>x</b>' }],
		['$ne', { slug: 'ne', label: '$ne' }],
		['__proto__', { slug: 'proto', label: '__proto__' }],
		['x'.repeat(100), { slug: 'x'.repeat(40), label: 'x'.repeat(40) }],
		['', null],
		['   ', null],
		['!!!', null],
		['😀', null],
		['\u200b', null, 'a lone zero-width space'],
		['\u202e\u202d', null, 'bidi overrides only'],
		[null, null],
		[undefined, null],
		[5, null],
		[{}, null],
		[['a'], null],
		[{ label: 'a' }, null],
	]
	for (const [input, expected, note] of normalizeCases)
		await check(`normalizeTag(${note ?? JSON.stringify(input) ?? String(input)}) -> ${expected ? expected.slug : 'null'}`, () => {
			assert.deepEqual(T.normalizeTag(input), expected)
		})

	await check('normalizeTag never cuts an emoji in half at the label limit', () => {
		const label = 'a'.repeat(39) + '😀' + 'b'
		const tag = T.normalizeTag(label)
		assert.equal(Array.from(tag.label).length, 40)
		assert.ok(tag.label.endsWith('😀'))
		assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(tag.label), 'no lone high surrogate')
		assert.ok(!/(?<![\ud800-\udbff])[\udc00-\udfff]/.test(tag.label), 'no lone low surrogate')
		assert.equal(tag.slug, 'a'.repeat(39))
	})

	await check('normalizeTag: a slug is capped at 60 characters and never ends in a dash', () => {
		const tag = T.normalizeTag('&'.repeat(40))
		assert.ok(tag.slug.length <= 60, `${tag.slug.length}`)
		assert.ok(!tag.slug.startsWith('-') && !tag.slug.endsWith('-'))
	})

	await check('normalizeTag is idempotent and stays valid over 3,000 random labels (never throws)', () => {
		const r = rng(1)
		const pieces = ['a', 'B', 'kitchen', 'Van', '1', ' ', '  ', '-', '_', '!', '&', 'é', 'ß', '日本', 'Фото', '😀', '\u200b', '\u0007', '\u202e', '"', "'", '<', '>', '$', '.', '*', '(', ')', '[', '\\', '/', '%', '\n', '\t', 'İ', 'ǅ', 'ﬁ', '\ud83d', '\ude00', 'x'.repeat(30)]
		for (let i = 0; i < 3000; i++) {
			const length = Math.floor(r() * 12)
			let label = ''
			for (let j = 0; j < length; j++) label += pick(r, pieces)
			const tag = T.normalizeTag(label)
			if (tag === null) continue
			assert.ok(tag.slug.length > 0 && tag.slug.length <= 60, `slug length for ${JSON.stringify(label)}`)
			assert.ok(/^[\p{L}\p{N}]+(-[\p{L}\p{N}]+)*$/u.test(tag.slug), `slug shape ${JSON.stringify(tag.slug)} from ${JSON.stringify(label)}`)
			assert.ok(Array.from(tag.label).length <= MEDIA_LIMITS.tagLabelMax, 'label length')
			assert.ok(!/[\p{Cc}]/u.test(tag.label), 'no control characters in the label')
			assert.deepEqual(T.normalizeTag(tag.label), tag, `idempotent for ${JSON.stringify(label)}`)
			jsonSafe(tag, 'tag')
		}
	})

	/* ---------------------------------------------------------------------- */
	section('resolveTag')

	await check('no rule: the slug comes back as it is, with no label key', () => {
		assert.deepEqual(T.resolveTag('x', rulesOf()), { slug: 'x', blocked: false })
	})

	await check('a redirect is followed and carries the target label', () => {
		assert.deepEqual(T.resolveTag('a', rulesOf([['a', redirect('b', 'B')]])), { slug: 'b', label: 'B', blocked: false })
	})

	await check('a chain is followed to its end (two hops)', () => {
		const rules = rulesOf([['a', redirect('b', 'B')], ['b', redirect('c', 'C')]])
		assert.deepEqual(T.resolveTag('a', rules), { slug: 'c', label: 'C', blocked: false })
	})

	await check('a block reports blocked on the slug it was found on', () => {
		assert.deepEqual(T.resolveTag('z', rulesOf([['z', null]])), { slug: 'z', blocked: true })
	})

	await check('a redirect into a block is blocked, at the end of the chain', () => {
		const rules = rulesOf([['a', redirect('b', 'B')], ['b', null]])
		const result = T.resolveTag('a', rules)
		assert.equal(result.blocked, true)
		assert.equal(result.slug, 'b')
		assert.equal(result.label, 'B')
	})

	await check('a two-slug cycle (a->b->a) ends, resolving each to itself', () => {
		const rules = rulesOf([['a', redirect('b', 'B')], ['b', redirect('a', 'A')]])
		assert.deepEqual(T.resolveTag('a', rules), { slug: 'a', blocked: false })
		assert.deepEqual(T.resolveTag('b', rules), { slug: 'b', blocked: false })
	})

	await check('a self-loop (a->a) is ignored', () => {
		assert.deepEqual(T.resolveTag('a', rulesOf([['a', redirect('a', 'A')]])), { slug: 'a', blocked: false })
	})

	await check('a slug that leads INTO a cycle does not escape it: x->a->b->a resolves x to x', () => {
		const rules = rulesOf([['x', redirect('a', 'A')], ['a', redirect('b', 'B')], ['b', redirect('a', 'A')]])
		assert.deepEqual(T.resolveTag('x', rules), { slug: 'x', blocked: false })
	})

	await check('depth: five hops are followed, a sixth is not (and nothing is blocked)', () => {
		const chain = (length) => {
			const entries = []
			for (let i = 0; i < length; i++) entries.push([`s${i}`, redirect(`s${i + 1}`, `S${i + 1}`)])
			return rulesOf(entries)
		}
		assert.equal(T.resolveTag('s0', chain(5)).slug, 's5')
		const six = T.resolveTag('s0', chain(6))
		assert.equal(six.slug, 's5', 'stops after five hops')
		assert.equal(six.blocked, false)
		assert.equal(T.resolveTag('s0', chain(40)).slug, 's5')
	})

	await check('a block on the fifth hop is seen; one on the sixth is not', () => {
		const five = rulesOf([['s0', redirect('s1')], ['s1', redirect('s2')], ['s2', redirect('s3')], ['s3', redirect('s4')], ['s4', null]])
		assert.equal(T.resolveTag('s0', five).blocked, true)
		const six = rulesOf([['s0', redirect('s1')], ['s1', redirect('s2')], ['s2', redirect('s3')], ['s3', redirect('s4')], ['s4', redirect('s5')], ['s5', null]])
		assert.deepEqual(T.resolveTag('s0', six), { slug: 's5', blocked: false })
	})

	await check('lookups are bounded (at most 5) however long the chain', () => {
		const entries = []
		for (let i = 0; i < 10_000; i++) entries.push([`c${i}`, redirect(`c${i + 1}`, `C${i + 1}`)])
		const { rules, stats } = readonlyMap(rulesOf(entries))
		const started = Date.now()
		const result = T.resolveTag('c0', rules)
		assert.equal(result.slug, 'c5')
		assert.ok(stats.gets <= 5, `${stats.gets} lookups`)
		assert.ok(Date.now() - started < 200)
	})

	await check('a hostile 10,000-rule map of cycles, blocks and self-loops never hangs, for resolveTag or redirectsOf', () => {
		const r = rng(7)
		const entries = []
		for (let i = 0; i < 10_000; i++) {
			const kind = r()
			entries.push([`h${i}`, kind < 0.15 ? null : kind < 0.3 ? redirect(`h${i}`, 'self') : redirect(`h${Math.floor(r() * 10_000)}`, 'x')])
		}
		const rules = rulesOf(entries)
		const started = Date.now()
		for (let i = 0; i < 10_000; i++) {
			const result = T.resolveTag(`h${i}`, rules)
			assert.equal(typeof result.slug, 'string')
			assert.equal(typeof result.blocked, 'boolean')
		}
		const redirects = T.redirectsOf(rules)
		assert.ok(redirects instanceof Map)
		assert.ok(Date.now() - started < 3000, `${Date.now() - started} ms`)
	})

	await check('a ring of 10,000 slugs (each redirects to the next, the last to the first) never hangs', () => {
		const entries = []
		for (let i = 0; i < 10_000; i++) entries.push([`r${i}`, redirect(`r${(i + 1) % 10_000}`, 'x')])
		const { rules, stats } = readonlyMap(rulesOf(entries))
		const result = T.resolveTag('r0', rules)
		assert.equal(result.slug, 'r5')
		assert.ok(stats.gets <= 5)
	})

	await check('malformed rules are ignored, never read as blocks and never thrown on', () => {
		const rules = rulesOf([
			['a', { slug: 5, label: 'x' }],
			['b', 'text'],
			['c', undefined],
			['d', { slug: '', label: 'x' }],
			['e', 7],
			['f', []],
			['g', { label: 'no slug' }],
		])
		for (const slug of ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
			assert.deepEqual(T.resolveTag(slug, rules), { slug, blocked: false }, slug)
	})

	await check('a redirect with no usable label resolves without a label key', () => {
		assert.deepEqual(T.resolveTag('a', rulesOf([['a', { slug: 'b', label: '' }]])), { slug: 'b', blocked: false })
		assert.deepEqual(T.resolveTag('a', rulesOf([['a', { slug: 'b' }]])), { slug: 'b', blocked: false })
	})

	await check('odd arguments: non-Map rules, non-string slug', () => {
		for (const rules of [undefined, null, {}, [], 'x', 5, new Set(['a'])])
			assert.deepEqual(T.resolveTag('a', rules), { slug: 'a', blocked: false })
		for (const slug of [undefined, null, 5, {}, [], '']) {
			const result = T.resolveTag(slug, rulesOf([['a', redirect('b', 'B')]]))
			assert.deepEqual(result, { slug: '', blocked: false })
		}
	})

	await check('resolveTag does not touch the rules', () => {
		const rules = rulesOf([['a', redirect('b', 'B')], ['b', null]])
		const { rules: guarded } = readonlyMap(rules)
		T.resolveTag('a', guarded)
		assert.equal(rules.size, 2)
	})

	/* ---------------------------------------------------------------------- */
	section('redirectsOf')

	await check('redirects map to their final slug; blocks, cycles, self-loops and redirects into blocks are left out', () => {
		const rules = rulesOf([
			['a', redirect('b', 'B')],
			['b', redirect('c', 'C')],
			['z', null],
			['x', redirect('y', 'Y')],
			['y', redirect('x', 'X')],
			['s', redirect('s', 'S')],
			['p', redirect('q', 'Q')],
			['q', null],
			['m', redirect('n', 'N')],
		])
		const out = T.redirectsOf(rules)
		assert.deepEqual([...out].sort(), [['a', 'c'], ['b', 'c'], ['m', 'n']])
		assert.ok(!out.has('z'), 'a block is not a redirect')
	})

	await check('redirectsOf excludes every block, however many', () => {
		const rules = rulesOf([['a', null], ['b', null], ['c', redirect('d', 'D')]])
		assert.deepEqual([...T.redirectsOf(rules)], [['c', 'd']])
	})

	await check('redirectsOf returns a new Map and leaves the rules alone; odd input gives an empty Map', () => {
		const rules = rulesOf([['a', redirect('b', 'B')]])
		const { rules: guarded } = readonlyMap(rules)
		const out = T.redirectsOf(guarded)
		out.set('zzz', 'y')
		assert.equal(rules.size, 1)
		for (const odd of [undefined, null, {}, [], 'x'])
			assert.equal(T.redirectsOf(odd).size, 0)
	})

	/* ---------------------------------------------------------------------- */
	section('applyManualTags')

	const add = (current, rejected, labels, rules = rulesOf()) => pureCall([current, rejected, labels, rules], (c, r, l, ru) => T.applyManualTags(c, r, l, ru))

	await check('adds a new manual tag', () => {
		assert.deepEqual(add([], [], ['Kitchen']), { tags: [manual('kitchen')], rejected: [] })
	})

	await check('the label is cleaned and its slug is the identity', () => {
		const out = add([], [], ['  kitchen   remodel '])
		assert.deepEqual(out.tags, [{ slug: 'kitchen-remodel', label: 'kitchen remodel', source: 'manual' }])
	})

	await check('a manual tag already present stays exactly as it is (its label is not changed)', () => {
		const out = add([manual('kitchen', 'Kitchen')], [], ['kitchen'])
		assert.deepEqual(out.tags, [manual('kitchen', 'Kitchen')])
	})

	await check('an automatic tag becomes manual: no via, no confidence, the same label', () => {
		const out = add([vision('kitchen', 0.9)], [], ['KITCHEN'])
		assert.deepEqual(out.tags, [manual('kitchen', 'Kitchen')])
		assert.ok(!('via' in out.tags[0]) && !('confidence' in out.tags[0]))
	})

	await check('a filename tag becomes manual too', () => {
		assert.deepEqual(add([fname('kitchen')], [], ['kitchen']).tags, [manual('kitchen', 'Kitchen')])
	})

	await check('adding un-rejects the slug (and only that slug)', () => {
		assert.deepEqual(add([], ['kitchen', 'bath'], ['Kitchen']).rejected, ['bath'])
	})

	await check('adding an already-present tag still un-rejects it', () => {
		assert.deepEqual(add([manual('kitchen')], ['kitchen'], ['Kitchen']).rejected, [])
	})

	await check('a redirect rule is followed: "Vans" becomes the existing "Van", and both slugs are un-rejected', () => {
		const rules = rulesOf([['vans', redirect('van', 'Van')]])
		const out = add([], ['vans', 'van', 'other'], ['Vans'], rules)
		assert.deepEqual(out.tags, [manual('van', 'Van')])
		assert.deepEqual(out.rejected, ['other'])
	})

	await check('a redirect onto a tag already present adds nothing new (and an auto one is promoted)', () => {
		const rules = rulesOf([['vans', redirect('van', 'Van')]])
		assert.deepEqual(add([vision('van', 0.8)], [], ['vans'], rules).tags, [manual('van', 'Van')])
		assert.deepEqual(add([manual('van')], [], ['vans'], rules).tags, [manual('van')])
	})

	await check('a block does not stop a person', () => {
		const out = add([], ['gone'], ['Gone'], rulesOf([['gone', null]]))
		assert.deepEqual(out.tags, [manual('gone', 'Gone')])
		assert.deepEqual(out.rejected, [])
	})

	await check('a redirect that ends in a block still lands on the redirect target for a person', () => {
		const out = add([], [], ['A'], rulesOf([['a', redirect('b', 'B')], ['b', null]]))
		assert.deepEqual(out.tags, [manual('b', 'B')])
	})

	await check('a redirect whose label is missing gets a label from its slug', () => {
		const out = add([], [], ['vans'], rulesOf([['vans', { slug: 'work-van' }]]))
		assert.deepEqual(out.tags, [manual('work-van', 'Work van')])
	})

	await check('the same slug written three ways in one call is added once', () => {
		assert.deepEqual(add([], [], ['Kitchen', 'kitchen', ' KITCHEN ']).tags, [manual('kitchen', 'Kitchen')])
	})

	await check('junk labels are skipped, valid ones kept', () => {
		const out = add([], [], ['', '!!!', null, 5, {}, '😀', 'Valid', undefined])
		assert.deepEqual(out.tags, [manual('valid', 'Valid')])
	})

	await check('the cap: a full asset drops the extra label instead of failing, and keeps it rejected', () => {
		const full = Array.from({ length: cap }, (_, i) => manual(`t${i}`))
		const out = add(full, ['extra'], ['Extra'])
		assert.equal(out.tags.length, cap)
		assert.ok(!slugs(out.tags).includes('extra'))
		assert.deepEqual(out.rejected, ['extra'])
	})

	await check('the cap: with room for one, the first label lands and the rest are dropped', () => {
		const nearly = Array.from({ length: cap - 1 }, (_, i) => manual(`t${i}`))
		const out = add(nearly, [], ['One', 'Two', 'Three'])
		assert.equal(out.tags.length, cap)
		assert.ok(slugs(out.tags).includes('one'))
		assert.ok(!slugs(out.tags).includes('two'))
	})

	await check('the cap does not stop promoting an automatic tag that is already there', () => {
		const full = [...Array.from({ length: cap - 1 }, (_, i) => manual(`t${i}`)), vision('last', 0.9)]
		const out = add(full, [], ['Last'])
		assert.equal(out.tags.length, cap)
		assert.equal(out.tags.find((tag) => tag.slug === 'last').source, 'manual')
	})

	await check('order: manual first (new ones after the old), then vision by confidence, then filename', () => {
		const current = [manual('m1'), vision('v1', 0.7), vision('v2', 0.95), fname('f1')]
		const out = add(current, [], ['E'])
		assert.deepEqual(slugs(out.tags), ['m1', 'e', 'v2', 'v1', 'f1'])
	})

	await check('a promoted tag joins the manual group, after the manual tags that were already there', () => {
		const out = add([manual('m1'), vision('v1', 0.9)], [], ['V1'])
		assert.deepEqual(slugs(out.tags), ['m1', 'v1'])
		assert.ok(out.tags.every((tag) => tag.source === 'manual'))
	})

	await check('applyManualTags is idempotent', () => {
		const current = [manual('a'), vision('b', 0.8), fname('c')]
		const once = add(current, ['d'], ['B', 'D', 'E'])
		const twice = add(once.tags, once.rejected, ['B', 'D', 'E'])
		assert.deepEqual(twice, once)
	})

	await check('hostile stored data is repaired, not thrown on', () => {
		const out = add([null, 5, 'x', {}, { slug: '' }, { slug: 'ok' }, { slug: 'two', label: '   ', source: 'weird' }, [] , { label: 'no slug' }], [null, 5, '', 'r', 'r'], [])
		assert.deepEqual(out.tags, [manual('ok', 'Ok'), manual('two', 'Two')])
		assert.deepEqual(out.rejected, ['r'])
	})

	await check('non-array arguments are treated as empty', () => {
		const out = T.applyManualTags(undefined, null, 'abc', undefined)
		assert.deepEqual(out, { tags: [], rejected: [] })
		assert.deepEqual(T.applyManualTags({}, 5, { length: 3 }, null), { tags: [], rejected: [] })
	})

	await check('a repeated slug in stored tags collapses to one (a manual copy beats an automatic one)', () => {
		const out = add([vision('a', 0.9), manual('a'), manual('b')], [], [])
		assert.deepEqual(out.tags, [manual('a'), manual('b')])
	})

	await check('the result is new arrays and new tag objects (nothing aliases the input)', () => {
		const current = [manual('a')]
		const out = T.applyManualTags(current, [], [], rulesOf())
		assert.notEqual(out.tags, current)
		assert.notEqual(out.tags[0], current[0])
		out.tags[0].label = 'changed'
		assert.equal(current[0].label, 'A')
	})

	/* ---------------------------------------------------------------------- */
	section('removeTagsBySlug')

	const remove = (current, rejected, list) => pureCall([current, rejected, list], (c, r, l) => T.removeTagsBySlug(c, r, l))

	await check('removes the tag and remembers it', () => {
		const out = remove([manual('kitchen'), vision('van', 0.9)], [], ['kitchen'])
		assert.deepEqual(out, { tags: [vision('van', 0.9)], rejected: ['kitchen'] })
	})

	await check('removing an automatic tag is remembered too (the main case)', () => {
		const out = remove([vision('van', 0.9), fname('kitchen')], [], ['van', 'kitchen'])
		assert.deepEqual(out, { tags: [], rejected: ['van', 'kitchen'] })
	})

	await check('a requested removal is remembered even when the tag was not there', () => {
		assert.deepEqual(remove([manual('a')], [], ['b']), { tags: [manual('a')], rejected: ['b'] })
	})

	await check('a slug already remembered keeps its place (so a re-run changes nothing)', () => {
		const out = remove([], ['a', 'b', 'c'], ['a'])
		assert.deepEqual(out.rejected, ['a', 'b', 'c'])
		const twice = remove(out.tags, out.rejected, ['a'])
		assert.deepEqual(twice, out)
	})

	await check('the cap: 200 remembered + 1 new keeps the newest 200 (oldest dropped)', () => {
		const old = Array.from({ length: MEDIA_LIMITS.rejectedTagsMax }, (_, i) => `r${i}`)
		const out = remove([manual('fresh')], old, ['fresh'])
		assert.equal(out.rejected.length, MEDIA_LIMITS.rejectedTagsMax)
		assert.equal(out.rejected[0], 'r1')
		assert.equal(out.rejected[out.rejected.length - 1], 'fresh')
		assert.ok(!out.rejected.includes('r0'))
	})

	await check('the cap: 198 + 5 at once leaves exactly 200 and the 5 newest are all there', () => {
		const old = Array.from({ length: 198 }, (_, i) => `r${i}`)
		const out = remove([], old, ['n1', 'n2', 'n3', 'n4', 'n5'])
		assert.equal(out.rejected.length, 200)
		assert.deepEqual(out.rejected.slice(-5), ['n1', 'n2', 'n3', 'n4', 'n5'])
		assert.equal(out.rejected[0], 'r3')
	})

	await check('the cap: 300 removals in one call keep the last 200', () => {
		const many = Array.from({ length: 300 }, (_, i) => `x${i}`)
		const out = remove([], [], many)
		assert.equal(out.rejected.length, 200)
		assert.equal(out.rejected[0], 'x100')
		assert.equal(out.rejected[199], 'x299')
	})

	await check('a stored list that is already over the cap is brought back to it', () => {
		const huge = Array.from({ length: 500 }, (_, i) => `h${i}`)
		const out = remove([], huge, [])
		assert.equal(out.rejected.length, 200)
		assert.equal(out.rejected[199], 'h499')
	})

	await check('a typed label works as a slug ("Kitchen Remodel" -> kitchen-remodel); duplicates collapse', () => {
		const out = remove([manual('kitchen-remodel')], [], ['Kitchen Remodel', 'kitchen-remodel', 'KITCHEN REMODEL'])
		assert.deepEqual(out, { tags: [], rejected: ['kitchen-remodel'] })
	})

	await check('removeTagsBySlug is idempotent', () => {
		const current = [manual('a'), vision('b', 0.8), fname('c')]
		const once = remove(current, ['z'], ['b', 'q'])
		const twice = remove(once.tags, once.rejected, ['b', 'q'])
		assert.deepEqual(twice, once)
	})

	await check('hostile slug lists: non-arrays, non-strings, junk and a megabyte string (fast)', () => {
		assert.deepEqual(remove([manual('a')], [], undefined), { tags: [manual('a')], rejected: [] })
		assert.deepEqual(remove([manual('a')], [], 'a'), { tags: [manual('a')], rejected: [] })
		const started = Date.now()
		const out = remove([manual('a')], [], [null, 5, {}, '', '!!!', '😀', 'x'.repeat(1_000_000), 'a'])
		assert.deepEqual(slugs(out.tags), [])
		assert.ok(out.rejected.includes('a'))
		assert.ok(Date.now() - started < 1000, `${Date.now() - started} ms`)
	})

	await check('re-adding a removed tag by hand un-rejects it (the round trip)', () => {
		const removed = remove([manual('kitchen')], [], ['kitchen'])
		assert.deepEqual(removed.rejected, ['kitchen'])
		const back = add(removed.tags, removed.rejected, ['Kitchen'])
		assert.deepEqual(back, { tags: [manual('kitchen', 'Kitchen')], rejected: [] })
	})

	/* ---------------------------------------------------------------------- */
	section('mergeAutoTags')

	const merge = (current, rejected, incoming, via = 'vision', rules = rulesOf()) =>
		pureCall([current, rejected, incoming, via, rules], (c, r, i, v, ru) => T.mergeAutoTags(c, r, i, v, ru))
	const inc = (label, confidence) => (confidence === undefined ? { label } : { label, confidence })

	await check('manual wins: an incoming tag with a manual twin is dropped and the manual one is untouched', () => {
		const out = merge([manual('kitchen', 'My kitchen')], [], [inc('Kitchen', 0.95)])
		assert.deepEqual(out, [manual('kitchen', 'My kitchen')])
	})

	await check('a vision tag is dropped when a filename tag has the slug, and the other way round', () => {
		assert.deepEqual(merge([fname('kitchen')], [], [inc('Kitchen', 0.9)]), [fname('kitchen')])
		assert.deepEqual(merge([vision('kitchen', 0.9)], [], [inc('Kitchen')], 'filename'), [vision('kitchen', 0.9)])
	})

	await check('a run replaces its own earlier tags and nothing else', () => {
		const current = [manual('m'), vision('old', 0.9), fname('f')]
		const out = merge(current, [], [inc('New', 0.8)])
		assert.deepEqual(out, [manual('m'), vision('new', 0.8), fname('f')])
	})

	await check('a filename run replaces filename tags only and stores no confidence', () => {
		const current = [manual('m'), vision('v', 0.9), fname('oldname')]
		const out = merge(current, [], [inc('Fresh', 0.99), inc('Other')], 'filename')
		assert.deepEqual(out, [manual('m'), vision('v', 0.9), fname('fresh'), fname('other')])
		for (const tag of out.filter((t) => t.via === 'filename')) assert.ok(!('confidence' in tag))
	})

	await check('the confidence floor: 0.6 is kept, anything under is not', () => {
		const out = merge([], [], [inc('exact', 0.6), inc('under', 0.5999), inc('low', 0.59), inc('zero', 0), inc('top', 1)])
		assert.deepEqual(slugs(out), ['top', 'exact'])
	})

	await check('the floor reads the constant from MEDIA_LIMITS', () => {
		assert.equal(MEDIA_LIMITS.autoTagMinConfidence, 0.6)
		assert.equal(MEDIA_LIMITS.autoTagsMax, 10)
		assert.equal(MEDIA_LIMITS.rejectedTagsMax, 200)
	})

	await check('an unusable confidence counts as zero: missing, NaN, text, negative are not stored; above 1 is clamped', () => {
		const out = merge([], [], [inc('missing'), inc('nan', Number.NaN), inc('text', '0.9'), inc('negative', -1), inc('over', 7), inc('inf', Infinity)])
		assert.deepEqual(out, [vision('over', 1, 'over'), vision('inf', 1, 'inf')])
	})

	await check('at most 10 vision tags are kept, the most confident first; ties keep the incoming order', () => {
		const incoming = Array.from({ length: 15 }, (_, i) => inc(`tag ${String(i).padStart(2, '0')}`, i < 5 ? 0.9 : 0.6 + i / 100))
		const out = merge([], [], incoming)
		assert.equal(out.length, 10)
		assert.deepEqual(slugs(out).slice(0, 5), ['tag-00', 'tag-01', 'tag-02', 'tag-03', 'tag-04'], 'the 0.9 ties in incoming order')
		for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].confidence >= out[i].confidence)
		assert.ok(out.every((tag) => tag.confidence >= 0.6))
	})

	await check('the cap is applied after the drops: rejected tags do not use up the ten places', () => {
		const incoming = Array.from({ length: 14 }, (_, i) => inc(`t${String(i).padStart(2, '0')}`, 0.99 - i / 100))
		const out = merge([], ['t00', 't01', 't02'], incoming)
		assert.equal(out.length, 10)
		assert.ok(!slugs(out).some((slug) => ['t00', 't01', 't02'].includes(slug)))
		assert.equal(out[0].slug, 't03')
		assert.equal(out[9].slug, 't12')
	})

	await check('rejected: the raw slug and the resolved slug are each enough to drop a tag', () => {
		const rules = rulesOf([['vans', redirect('van', 'Van')]])
		assert.deepEqual(merge([], ['vans'], [inc('Vans', 0.9)], 'vision', rules), [])
		assert.deepEqual(merge([], ['van'], [inc('Vans', 0.9)], 'vision', rules), [])
		assert.deepEqual(merge([], ['other'], [inc('Vans', 0.9)], 'vision', rules), [vision('van', 0.9, 'Van')])
	})

	await check('blocked: a block drops the tag, and so does a redirect that ends in a block', () => {
		const rules = rulesOf([['gone', null], ['a', redirect('b', 'B')], ['b', null]])
		assert.deepEqual(merge([], [], [inc('Gone', 0.9), inc('A', 0.9), inc('Fine', 0.9)], 'vision', rules), [vision('fine', 0.9)])
	})

	await check('a redirect rewrites the tag to its target, with the target label', () => {
		const rules = rulesOf([['vans', redirect('van', 'Van')]])
		assert.deepEqual(merge([], [], [inc('Vans', 0.7)], 'vision', rules), [vision('van', 0.7, 'Van')])
	})

	await check('two incoming labels that resolve to one tag give one tag, the more confident', () => {
		const rules = rulesOf([['vans', redirect('van', 'Van')]])
		const out = merge([], [], [inc('Vans', 0.7), inc('Van', 0.9), inc('vans', 0.8)], 'vision', rules)
		assert.deepEqual(out, [vision('van', 0.9, 'Van')])
	})

	await check('a redirect onto a tag a person already has is dropped', () => {
		const rules = rulesOf([['vans', redirect('van', 'Van')]])
		assert.deepEqual(merge([manual('van', 'Van')], [], [inc('Vans', 0.9)], 'vision', rules), [manual('van', 'Van')])
	})

	await check('order: manual (as they were), vision by confidence descending, filename last', () => {
		const current = [fname('f1'), manual('m1'), vision('stale', 0.9), manual('m2')]
		const out = merge(current, [], [inc('A', 0.7), inc('B', 0.95), inc('C', 0.7)])
		assert.deepEqual(slugs(out), ['m1', 'm2', 'b', 'a', 'c', 'f1'])
	})

	await check('over the tag cap: file name tags go first, then the least confident vision tags; manual tags are never dropped', () => {
		const manuals = Array.from({ length: 35 }, (_, i) => manual(`m${i}`))
		const files = ['f0', 'f1', 'f2', 'f3'].map((slug) => fname(slug))
		const incoming = Array.from({ length: 10 }, (_, i) => inc(`v${i}`, 0.99 - i / 100))
		const out = merge([...manuals, ...files], [], incoming)
		assert.equal(out.length, cap)
		assert.equal(out.filter((tag) => tag.source === 'manual').length, 35)
		assert.ok(!out.some((tag) => tag.via === 'filename'))
		assert.deepEqual(slugs(out.filter((tag) => tag.via === 'vision')), ['v0', 'v1', 'v2', 'v3', 'v4'])
	})

	await check('over the cap with only manual tags: nothing manual is dropped and no automatic tag is added', () => {
		const manuals = Array.from({ length: cap + 5 }, (_, i) => manual(`m${i}`))
		const out = merge(manuals, [], [inc('A', 0.9)])
		assert.equal(out.length, cap + 5)
		assert.ok(out.every((tag) => tag.source === 'manual'))
	})

	await check('mergeAutoTags is idempotent', () => {
		const current = [manual('m'), fname('f'), vision('old', 0.9)]
		const incoming = [inc('A', 0.9), inc('M', 0.9), inc('B', 0.7), inc('Gone', 0.9)]
		const rules = rulesOf([['gone', null]])
		const once = merge(current, ['b'], incoming, 'vision', rules)
		const twice = merge(once, ['b'], incoming, 'vision', rules)
		assert.deepEqual(twice, once)
	})

	await check('tags that came from the run carry via and, for vision, a confidence; nothing is undefined', () => {
		const out = merge([], [], [inc('A', 0.9)])
		assert.deepEqual(out, [{ slug: 'a', label: 'A', source: 'auto', via: 'vision', confidence: 0.9 }])
		jsonSafe(out)
		jsonSafe(merge([], [], [inc('A')], 'filename'))
	})

	await check('hostile input: junk incoming, junk current, a junk via, non-Map rules - no throw', () => {
		const out = merge([null, 7, { slug: 'ok', source: 'manual' }], [null, 3], [null, 5, 'x', {}, { label: 5 }, { label: '' }, { label: '!!!', confidence: 1 }, inc('Fine', 0.9)], 'bogus', 'nope')
		assert.deepEqual(out, [manual('ok', 'Ok'), vision('fine', 0.9, 'Fine')])
		assert.deepEqual(T.mergeAutoTags(undefined, undefined, undefined, 'vision', undefined), [])
	})

	await check('an automatic tag without a via reads as vision: a vision run replaces it, a filename run keeps it', () => {
		const legacy = [{ slug: 'old', label: 'Old', source: 'auto' }]
		assert.deepEqual(merge(legacy, [], [inc('New', 0.9)]), [vision('new', 0.9)])
		const kept = merge(legacy, [], [inc('New')], 'filename')
		assert.deepEqual(slugs(kept), ['old', 'new'])
	})

	await check('a promoted tag is manual and survives every later run', () => {
		const promoted = T.promoteAutoTags([vision('van', 0.9)])
		const out = merge(promoted, [], [inc('Other', 0.9)])
		assert.deepEqual(out, [manual('van'), vision('other', 0.9)])
	})

	/* ---------------------------------------------------------------------- */
	section('canonicalizeAuto')

	const canon = (incoming, known) => pureCall([incoming, known], (i, k) => T.canonicalizeAuto(i, k))

	await check('"vans" becomes the existing "Van" (the spec example)', () => {
		assert.deepEqual(canon([{ label: 'vans', confidence: 0.9 }], [{ slug: 'van', label: 'Van' }]), [{ label: 'Van', confidence: 0.9 }])
	})

	await check('"work vans" becomes the existing "Work van" (the spec example)', () => {
		assert.deepEqual(canon([{ label: 'work vans' }], [{ slug: 'work-van', label: 'Work van' }]), [{ label: 'Work van' }])
	})

	await check('case and punctuation are folded; an exact match takes the known casing', () => {
		const known = [{ slug: 'work-van', label: 'Work van' }]
		assert.equal(canon([{ label: 'WORK-VANS' }], known)[0].label, 'Work van')
		assert.equal(canon([{ label: 'Work Van' }], known)[0].label, 'Work van')
		assert.equal(canon([{ label: 'work van!' }], known)[0].label, 'Work van')
	})

	await check('two different known tags with the same key are left alone (never guess)', () => {
		const known = [{ slug: 'van', label: 'Van' }, { slug: 'vans', label: 'Vans' }]
		assert.deepEqual(canon([{ label: 'vans' }, { label: 'van' }, { label: 'VAN' }], known), [{ label: 'vans' }, { label: 'van' }, { label: 'VAN' }])
	})

	await check('the same known tag listed twice is still one tag', () => {
		const known = [{ slug: 'van', label: 'Van' }, { slug: 'van', label: 'Van' }]
		assert.equal(canon([{ label: 'vans' }], known)[0].label, 'Van')
	})

	await check('a label that matches nothing, or an empty known list, passes through', () => {
		assert.deepEqual(canon([{ label: 'brand new', confidence: 0.7 }], [{ slug: 'van', label: 'Van' }]), [{ label: 'brand new', confidence: 0.7 }])
		assert.deepEqual(canon([{ label: 'vans' }], []), [{ label: 'vans' }])
	})

	await check('the key folds tenses as well as plurals (running -> Run) and keeps different words apart (vans != van-driver)', () => {
		assert.equal(canon([{ label: 'running' }], [{ slug: 'run', label: 'Run' }])[0].label, 'Run')
		assert.equal(canon([{ label: 'vans' }], [{ slug: 'van-driver', label: 'Van driver' }])[0].label, 'vans')
	})

	await check('length, order and confidence are preserved; objects are new', () => {
		const incoming = [{ label: 'a' }, { label: 'vans', confidence: 0.5 }, { label: 'b', confidence: 1 }]
		const out = canon(incoming, [{ slug: 'van', label: 'Van' }])
		assert.deepEqual(out, [{ label: 'a' }, { label: 'Van', confidence: 0.5 }, { label: 'b', confidence: 1 }])
	})

	await check('canonicalizeAuto is idempotent', () => {
		const known = [{ slug: 'van', label: 'Van' }, { slug: 'work-van', label: 'Work van' }]
		const once = canon([{ label: 'vans' }, { label: 'work vans' }, { label: 'x' }], known)
		assert.deepEqual(canon(once, known), once)
	})

	await check('hostile input: junk known entries and junk incoming are skipped', () => {
		const known = [null, 5, 'x', {}, { slug: 5 }, { label: 'Van' }, { slug: '', label: '' }]
		assert.deepEqual(canon([null, 5, {}, { label: 5 }, { label: 'vans' }], known), [{ label: 'Van' }])
		assert.deepEqual(T.canonicalizeAuto(undefined, undefined), [])
		assert.deepEqual(T.canonicalizeAuto('x', 'y'), [])
	})

	/* ---------------------------------------------------------------------- */
	section('promoteAutoTags')

	await check('every automatic tag becomes manual (no via, no confidence); manual tags and the order stay', () => {
		const out = pureCall([[manual('m'), vision('v', 0.9), fname('f')]], (c) => T.promoteAutoTags(c))
		assert.deepEqual(out, [manual('m'), manual('v'), manual('f')])
		jsonSafe(out)
	})

	await check('promoteAutoTags is idempotent and tolerates junk', () => {
		const once = T.promoteAutoTags([vision('a', 0.9), null, 5, { slug: 'b' }, vision('a', 0.5)])
		assert.deepEqual(once, [manual('a'), manual('b', 'B')])
		assert.deepEqual(T.promoteAutoTags(once), once)
		assert.deepEqual(T.promoteAutoTags(undefined), [])
	})

	/* ---------------------------------------------------------------------- */
	section('property-style: random inputs, seeded')

	const POOL = ['kitchen', 'van', 'vans', 'work-van', 'bath', 'roof', 'logo', 'a', 'b', 'c', 'd', 'e', 'f', 'g']
	const labelOf = (slug) => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ')
	const genTags = (r) => {
		const tags = []
		for (let i = Math.floor(r() * 14); i > 0; i--) {
			const slug = pick(r, POOL)
			const kind = r()
			if (kind < 0.4) tags.push(manual(slug))
			else if (kind < 0.8) tags.push(vision(slug, Math.round(r() * 100) / 100))
			else tags.push(fname(slug))
		}
		return tags
	}
	const genRules = (r) => {
		const rules = new Map()
		for (let i = Math.floor(r() * 5); i > 0; i--) {
			const from = pick(r, POOL)
			const roll = r()
			rules.set(from, roll < 0.25 ? null : redirect(pick(r, POOL), 'Target'))
		}
		return rules
	}
	const genIncoming = (r) => {
		const out = []
		for (let i = Math.floor(r() * 18); i > 0; i--) {
			const slug = pick(r, POOL)
			const label = r() < 0.3 ? labelOf(slug).toUpperCase() : r() < 0.2 ? `  ${slug}  ` : labelOf(slug)
			const roll = r()
			const confidence = roll < 0.1 ? undefined : roll < 0.15 ? Number.NaN : roll < 0.2 ? 1.5 : Math.round(r() * 100) / 100
			out.push(confidence === undefined ? { label } : { label, confidence })
		}
		return out
	}
	const genRejected = (r) => {
		const out = []
		for (let i = Math.floor(r() * 5); i > 0; i--) out.push(pick(r, POOL))
		return out
	}
	const rankOf = (tag) => (tag.source === 'manual' ? 0 : tag.via === 'filename' ? 2 : 1)

	await check('mergeAutoTags keeps its promises over 4,000 random cases (manual sacred, rejected and blocked honoured, caps, order, idempotence, no mutation)', () => {
		const r = rng(20260401)
		for (let n = 0; n < 4000; n++) {
			const current = genTags(r)
			const rejected = genRejected(r)
			const incoming = genIncoming(r)
			const rules = genRules(r)
			const via = r() < 0.3 ? 'filename' : 'vision'
			const where = `case ${n} (seed 20260401) via ${via}`
			const { rules: guarded } = readonlyMap(rules)
			let out
			try {
				out = pureCall([current, rejected, incoming, via], (c, rj, i, v) => T.mergeAutoTags(c, rj, i, v, guarded))
			} catch (error) {
				throw new Error(`${where}: ${error.message}`)
			}
			const manualSlugs = new Set(current.filter((tag) => tag.source === 'manual').map((tag) => tag.slug))
			assert.equal(new Set(slugs(out)).size, out.length, `${where}: unique slugs`)
			for (const slug of manualSlugs) {
				const found = out.find((tag) => tag.slug === slug)
				assert.ok(found && found.source === 'manual', `${where}: manual ${slug} survives`)
			}
			const own = out.filter((tag) => tag.source === 'auto' && tag.via === via)
			for (const tag of own) {
				assert.ok(!rejected.includes(tag.slug), `${where}: rejected ${tag.slug} came back`)
				assert.ok(rules.get(tag.slug) !== null, `${where}: blocked ${tag.slug} applied`)
				if (via === 'vision') assert.ok(tag.confidence >= 0.6, `${where}: floor`)
				else assert.ok(!('confidence' in tag), `${where}: filename tag with a confidence`)
			}
			if (via === 'vision') assert.ok(own.length <= MEDIA_LIMITS.autoTagsMax, `${where}: vision cap`)
			assert.ok(out.length <= Math.max(cap, manualSlugs.size), `${where}: tag cap`)
			for (let i = 1; i < out.length; i++) {
				assert.ok(rankOf(out[i - 1]) <= rankOf(out[i]), `${where}: group order`)
				if (rankOf(out[i]) === 1 && rankOf(out[i - 1]) === 1)
					assert.ok(out[i - 1].confidence >= out[i].confidence, `${where}: confidence order`)
			}
			const other = current.filter((tag) => !(tag.source === 'auto' && (tag.via ?? 'vision') === via))
			for (const tag of other.filter((t) => t.source === 'auto'))
				if (out.length < cap || out.some((o) => o.slug === tag.slug))
					assert.ok(out.some((o) => o.slug === tag.slug) || manualSlugs.has(tag.slug), `${where}: the other source's tag ${tag.slug} kept`)
			jsonSafe(out, where)
			const again = T.mergeAutoTags(out, rejected, incoming, via, rules)
			assert.deepEqual(again, out, `${where}: idempotent`)
		}
	})

	await check('applyManualTags keeps its promises over 3,000 random cases (typed tags present, rejected shrinks, cap, order, idempotence, no mutation)', () => {
		const r = rng(77)
		for (let n = 0; n < 3000; n++) {
			const current = genTags(r)
			const rejected = genRejected(r)
			const labels = genIncoming(r).map((item) => item.label)
			const rules = genRules(r)
			const where = `case ${n} (seed 77)`
			const { rules: guarded } = readonlyMap(rules)
			const out = pureCall([current, rejected, labels], (c, rj, l) => T.applyManualTags(c, rj, l, guarded))
			assert.equal(new Set(slugs(out.tags)).size, out.tags.length, `${where}: unique`)
			const before = new Set(slugs(current))
			for (const tag of current.filter((t) => t.source === 'manual'))
				assert.ok(out.tags.some((o) => o.slug === tag.slug && o.source === 'manual'), `${where}: manual kept`)
			for (const tag of out.tags) if (!before.has(tag.slug)) assert.equal(tag.source, 'manual', `${where}: new tags are manual`)
			assert.ok(out.tags.length <= Math.max(cap, before.size), `${where}: cap`)
			for (const slug of out.rejected) assert.ok(rejected.includes(slug), `${where}: nothing new is rejected`)
			for (const tag of out.tags) if (tag.source === 'manual' && !before.has(tag.slug)) assert.ok(!out.rejected.includes(tag.slug), `${where}: an added tag is not rejected`)
			for (let i = 1; i < out.tags.length; i++) assert.ok(rankOf(out.tags[i - 1]) <= rankOf(out.tags[i]), `${where}: order`)
			jsonSafe(out, where)
			assert.deepEqual(T.applyManualTags(out.tags, out.rejected, labels, rules), out, `${where}: idempotent`)
		}
	})

	await check('removeTagsBySlug, promoteAutoTags and canonicalizeAuto keep their promises over 3,000 random cases', () => {
		const r = rng(5150)
		for (let n = 0; n < 3000; n++) {
			const current = genTags(r)
			const rejected = genRejected(r)
			const wanted = [pick(r, POOL), pick(r, POOL), pick(r, POOL)]
			const where = `case ${n} (seed 5150)`
			const out = pureCall([current, rejected, wanted], (c, rj, w) => T.removeTagsBySlug(c, rj, w))
			for (const slug of wanted) {
				assert.ok(!slugs(out.tags).includes(slug), `${where}: ${slug} removed`)
				assert.ok(out.rejected.includes(slug), `${where}: ${slug} remembered`)
			}
			assert.ok(out.rejected.length <= MEDIA_LIMITS.rejectedTagsMax)
			assert.equal(new Set(out.rejected).size, out.rejected.length)
			assert.deepEqual(T.removeTagsBySlug(out.tags, out.rejected, wanted), out, `${where}: idempotent`)

			const promoted = pureCall([current], (c) => T.promoteAutoTags(c))
			assert.ok(promoted.every((tag) => tag.source === 'manual' && !('via' in tag) && !('confidence' in tag)), `${where}: promoted`)
			assert.deepEqual(slugs(promoted), [...new Set(slugs(current))], `${where}: promote keeps every slug once, in order`)
			assert.deepEqual(T.promoteAutoTags(promoted), promoted)

			const known = [...new Set(slugs(current))].map((slug) => ({ slug, label: labelOf(slug) }))
			const incoming = genIncoming(r)
			const canonical = pureCall([incoming, known], (i, k) => T.canonicalizeAuto(i, k))
			assert.equal(canonical.length, incoming.length, `${where}: canonicalize keeps the length`)
			for (let i = 0; i < canonical.length; i++)
				assert.ok(canonical[i].label === incoming[i].label || known.some((k) => k.label === canonical[i].label), `${where}: a label is unchanged or a known label`)
			assert.deepEqual(T.canonicalizeAuto(canonical, known), canonical, `${where}: canonicalize idempotent`)
		}
	})

	await check('odd shapes: sparse arrays, null-prototype objects, BigInt, Symbol, String objects, functions - no throw, sane results', () => {
		const sparse = [, manual('a'), ,]
		const out = T.applyManualTags(sparse, [, 'x'], [, 'B'], rulesOf())
		assert.deepEqual(slugs(out.tags), ['a', 'b'])
		assert.deepEqual(out.rejected, ['x'])
		const bare = Object.assign(Object.create(null), { slug: 'bare', label: 'Bare', source: 'manual' })
		assert.deepEqual(T.removeTagsBySlug([bare], [], ['x']).tags, [manual('bare', 'Bare')])
		assert.deepEqual(T.promoteAutoTags([Object.assign(Object.create(null), { slug: 'b', label: 'B', source: 'auto', via: 'vision', confidence: 0.9 })]), [manual('b', 'B')])
		for (const label of [10n, Symbol('x'), new String('x'), () => 'x', new Date(), Number.NaN, true]) {
			assert.equal(T.normalizeTag(label), null)
			assert.deepEqual(T.applyManualTags([], [], [label], rulesOf()).tags, [])
			assert.deepEqual(T.mergeAutoTags([], [], [{ label, confidence: 1 }], 'vision', rulesOf()), [])
			assert.deepEqual(T.removeTagsBySlug([manual('a')], [], [label]), { tags: [manual('a')], rejected: [] })
			assert.deepEqual(T.canonicalizeAuto([{ label }], []), [])
		}
		for (const confidence of [10n, Symbol('x'), new Number(1), '1', null, {}, []])
			assert.deepEqual(T.mergeAutoTags([], [], [{ label: 'Fine', confidence }], 'vision', rulesOf()), [], String(typeof confidence))
	})

	await check('big inputs stay fast: 50,000 labels, 50,000 incoming tags, 50,000 known tags, 5,000 stored tags', () => {
		const started = Date.now()
		const labels = Array.from({ length: 50_000 }, (_, i) => `Label ${i % 20_000}`)
		const stored = Array.from({ length: 5000 }, (_, i) => manual(`m${i}`))
		const added = T.applyManualTags([], [], labels, rulesOf())
		assert.equal(added.tags.length, cap)
		const incomingBig = labels.map((label, i) => ({ label, confidence: 0.6 + (i % 40) / 100 }))
		const merged = T.mergeAutoTags(stored, [], incomingBig, 'vision', rulesOf())
		assert.equal(merged.length, 5000, 'the manual tags are over the cap, so nothing automatic fits')
		const known = Array.from({ length: 50_000 }, (_, i) => ({ slug: `s${i}`, label: `S${i}` }))
		assert.equal(T.canonicalizeAuto(incomingBig, known).length, 50_000)
		const removed = T.removeTagsBySlug(stored, Array.from({ length: 5000 }, (_, i) => `r${i}`), labels)
		assert.equal(removed.rejected.length, MEDIA_LIMITS.rejectedTagsMax)
		const elapsed = Date.now() - started
		assert.ok(elapsed < 8000, `${elapsed} ms`)
	})

	await check('resolveTag over 20,000 random rule maps: always ends within 5 lookups, blocked only when a block was reached', () => {
		const r = rng(31337)
		for (let n = 0; n < 20_000; n++) {
			const rules = new Map()
			for (let i = Math.floor(r() * 8); i > 0; i--) rules.set(pick(r, POOL), r() < 0.3 ? null : redirect(pick(r, POOL), 'T'))
			const start = pick(r, POOL)
			const { rules: counted, stats } = readonlyMap(rules)
			const result = T.resolveTag(start, counted)
			assert.ok(stats.gets <= 5, `lookups ${stats.gets}`)
			assert.equal(typeof result.slug, 'string')
			if (result.blocked) assert.equal(rules.get(result.slug), null, 'blocked only on a slug that has a block rule')
			if (!result.blocked && result.slug !== start) assert.ok(rules.get(start) !== undefined && rules.get(start) !== null, 'a changed slug means a redirect existed')
		}
	})
}

/* -------------------------------------------------------------------------- */
/* Database helpers                                                           */
/* -------------------------------------------------------------------------- */

const uri = process.env.MONGODB_URI
const client = uri ? new MongoClient(uri) : null
const workspaces = []
const newWs = () => {
	const id = new ObjectId()
	workspaces.push(id)
	return id
}

let db
let assetCol
let ruleCol

/** A complete asset document (every field the type promises), with `terms` built the way commitAsset builds them. */
function assetDoc(ws, extra = {}) {
	const base = {
		_id: new ObjectId(),
		workspaceId: ws,
		folderId: null,
		name: 'photo',
		nameKey: 'photo',
		filename: 'photo.jpg',
		url: 'https://example.invalid/photo.jpg',
		pathname: `proof-tags/${new ObjectId()}`,
		contentType: 'image/jpeg',
		bytes: 1000,
		width: 800,
		height: 600,
		pixels: 480000,
		orientation: 'landscape',
		hasAlpha: false,
		animated: false,
		colors: [{ hex: '#336699', name: 'blue', share: 0.6 }],
		colorNames: ['blue'],
		brightness: 'mid',
		saturation: 'muted',
		sha256: `${new ObjectId()}${new ObjectId()}${new ObjectId()}`.slice(0, 64),
		blur: null,
		tags: [],
		rejectedTags: [],
		caption: '',
		altText: '',
		captionEdited: false,
		textInImage: '',
		keywords: [],
		kind: null,
		notes: '',
		terms: [],
		termsVersion: 1,
		rev: 0,
		tagging: { status: 'done', attempts: 1 },
		uploadedBy: 'proof',
		createdAt: new Date(2020, 0, 1),
		updatedAt: new Date(2020, 0, 1),
		...extra,
	}
	const doc = { ...base, ...derivedFields(base) }
	// A fixture may carry a deliberately stale derived field.
	for (const key of ['terms', 'termsVersion', 'nameKey', 'colorNames']) if (key in extra) doc[key] = extra[key]
	return doc
}

async function seed(ws, ...specs) {
	const docs = specs.map((spec) => assetDoc(ws, spec))
	if (docs.length) await assetCol.insertMany(docs)
	return docs
}

async function seedMany(ws, count, spec) {
	const docs = Array.from({ length: count }, (_, i) => assetDoc(ws, spec(i)))
	for (let i = 0; i < docs.length; i += 500) await assetCol.insertMany(docs.slice(i, i + 500))
	return docs
}

const stored = (doc) => assetCol.findOne({ _id: doc._id })
const assetsOf = (ws) => assetCol.find({ workspaceId: ws }).sort({ _id: 1 }).toArray()
const rulesDocs = (ws) => ruleCol.find({ workspaceId: ws }).sort({ from: 1 }).toArray()
/** `{ from: to.slug | null }` for a workspace. */
const ruleMap = async (ws) => Object.fromEntries((await rulesDocs(ws)).map((doc) => [doc.from, doc.to ? doc.to.slug : null]))

/** Everything a state check needs, in one comparable value. */
const snapshot = async (ws) => ({ assets: await assetsOf(ws), rules: await rulesDocs(ws) })

/** Every asset's `terms` is what derivedFields says it should be. */
async function assertSynced(ws) {
	for (const doc of await assetsOf(ws)) assert.deepEqual(doc.terms, derivedFields(doc).terms, `terms of ${doc._id}`)
}

/**
 * The same db with every call recorded. `hook` runs before and after each call (it can
 * inject a concurrent write or throw to simulate a crash); `rewrite` can replace a
 * write's arguments. `find` and `aggregate` hook their `toArray`.
 */
function spyDb(real, hook = async () => {}, rewrite = null) {
	const events = []
	const counts = new Map()
	const bump = (name, method) => {
		const key = `${name}.${method}`
		const n = (counts.get(key) ?? 0) + 1
		counts.set(key, n)
		return n
	}
	const wrap = (name) =>
		new Proxy(real.collection(name), {
			get(target, prop) {
				const value = Reflect.get(target, prop)
				if (typeof value !== 'function' || typeof prop !== 'string') return value
				if (prop === 'find' || prop === 'aggregate') {
					return (...args) => {
						const cursor = value.apply(target, args)
						const ev = { coll: name, method: prop, n: bump(name, prop), args }
						events.push(ev)
						const proxy = new Proxy(cursor, {
							get(c, p) {
								const inner = Reflect.get(c, p)
								if (typeof inner !== 'function') return inner
								if (p === 'toArray')
									return async () => {
										await hook({ ...ev, phase: 'before' })
										const result = await c.toArray()
										await hook({ ...ev, phase: 'after', result })
										return result
									}
								return (...a) => {
									const out = inner.apply(c, a)
									return out === c ? proxy : out
								}
							},
						})
						return proxy
					}
				}
				return async (...args) => {
					const ev = { coll: name, method: prop, n: bump(name, prop), args }
					events.push(ev)
					await hook({ ...ev, phase: 'before' })
					const sent = (rewrite && (await rewrite({ ...ev, phase: 'before' }))) || args
					const result = await value.apply(target, sent)
					await hook({ ...ev, phase: 'after', result })
					return result
				}
			},
		})
	return { collection: wrap, events, counts }
}
const callsOf = (spy, coll, method) => spy.events.filter((e) => e.coll === coll && e.method === method)
const at = (ev, coll, method, n, phase = 'before') => ev.coll === coll && ev.method === method && ev.n === n && ev.phase === phase
const WRITES = ['updateOne', 'updateMany', 'bulkWrite', 'insertOne', 'insertMany', 'deleteOne', 'deleteMany', 'findOneAndUpdate', 'replaceOne']
const writesOf = (spy) => spy.events.filter((e) => WRITES.includes(e.method))

/** Foreign write: what another writer's commit looks like from outside (new content, revision bumped). */
const foreign = (doc, set) => assetCol.updateOne({ _id: doc._id }, { $set: set, $inc: { rev: 1 } })

/** A person adding tags, the way assets.ts is specified to: applyManualTags on the FRESH document, through the chokepoint. */
const personAddsTag = (db_, ws, doc, labels, rules) =>
	C.commitAsset(db_, ws, doc._id, (d) => {
		const result = T.applyManualTags(d.tags, d.rejectedTags, labels, rules)
		return { tags: result.tags, rejectedTags: result.rejected }
	})

async function expectMediaError(fn, status, label = '') {
	let thrown
	try {
		await fn()
	} catch (error) {
		thrown = error
	}
	assert.ok(thrown, `${label} should have thrown`)
	assert.ok(thrown instanceof MediaError, `${label} threw ${thrown?.name}: ${thrown?.message}`)
	assert.equal(thrown.status, status, `${label} status (${thrown.message})`)
	return thrown
}

/* -------------------------------------------------------------------------- */
/* Database: commitAsset                                                      */
/* -------------------------------------------------------------------------- */

async function proveCommitAsset() {
	section('commitAsset')

	await check('applies the change, bumps rev, stamps updatedAt and rebuilds terms from the merged document', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, { caption: 'old words', tags: [] })
		const before = await stored(doc)
		const result = await C.commitAsset(db, ws, doc._id, () => ({
			caption: 'Sunny kitchen remodel',
			tags: [manual('kitchen', 'Kitchen')],
			name: 'New Name',
		}))
		const after = await stored(doc)
		assert.equal(after.rev, 1)
		assert.ok(after.updatedAt > before.updatedAt)
		assert.equal(after.caption, 'Sunny kitchen remodel')
		assert.deepEqual(after.tags, [manual('kitchen', 'Kitchen')])
		assert.equal(after.nameKey, 'new name')
		const expected = derivedFields(after)
		assert.deepEqual(after.terms, expected.terms)
		assert.equal(after.termsVersion, expected.termsVersion)
		assert.deepEqual(after.colorNames, expected.colorNames)
		for (const word of ['kitchen', 'remodel', 'sunny', 'new', 'name']) assert.ok(after.terms.includes(word), word)
		assert.ok(!after.terms.includes('old'), 'the replaced caption left the index')
		for (const key of ['url', 'pathname', 'width', 'height', 'bytes', 'colors', 'workspaceId', 'createdAt', 'sha256', 'uploadedBy', 'folderId'])
			assert.deepEqual(after[key], before[key], `${key} untouched`)
		for (const key of Object.keys(after)) assert.deepEqual(result[key], after[key], `the returned document matches the stored one (${key})`)
	})

	await check('derived fields are recomputed, never carried: a stale colorNames and nameKey are corrected', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, { name: 'Hero', colors: [{ hex: '#ff0000', name: 'red', share: 1 }], colorNames: ['stale'], nameKey: 'wrong' })
		await C.commitAsset(db, ws, doc._id, () => ({ notes: 'n' }))
		const after = await stored(doc)
		assert.deepEqual(after.colorNames, ['red'])
		assert.equal(after.nameKey, 'hero')
		assert.ok(after.terms.includes('red') && !after.terms.includes('stale'))
	})

	await check('returns null for a missing asset, a foreign workspace\'s asset and a non-matching extra filter - the mutation is never called and nothing is written', async () => {
		const ws = newWs()
		const other = newWs()
		const [mine] = await seed(ws, {})
		const [theirs] = await seed(other, {})
		const spy = spyDb(db)
		let called = 0
		const mutate = () => {
			called++
			return { notes: 'x' }
		}
		assert.equal(await C.commitAsset(spy, ws, new ObjectId(), mutate), null)
		assert.equal(await C.commitAsset(spy, ws, theirs._id, mutate), null)
		assert.equal(await C.commitAsset(spy, ws, mine._id, mutate, { extraFilter: { 'tagging.status': 'running' } }), null)
		assert.equal(called, 0)
		assert.equal(writesOf(spy).length, 0)
		assert.equal((await stored(theirs)).rev, 0)
		assert.equal((await stored(mine)).rev, 0)
	})

	await check('a null mutation returns the document unchanged and writes nothing (also {}, undefined values and fields it may not set)', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, { rev: 3, notes: 'keep' })
		const before = await stored(doc)
		for (const nothing of [null, undefined, {}, { caption: undefined }, { rev: 99, workspaceId: new ObjectId() }]) {
			const spy = spyDb(db)
			const result = await C.commitAsset(spy, ws, doc._id, () => nothing)
			assert.deepEqual(result, before)
			assert.equal(writesOf(spy).length, 0, `no write for ${JSON.stringify(nothing)}`)
		}
		assert.deepEqual(await stored(doc), before)
	})

	await check('a conflict is retried and the mutation is re-applied to the NEWER document (once, never to the stale one)', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, { notes: '' })
		const seen = []
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'findOne', 1, 'after')) await foreign(doc, { notes: 'foreign' })
		})
		const result = await C.commitAsset(spy, ws, doc._id, (fresh) => {
			seen.push({ rev: fresh.rev, notes: fresh.notes })
			return { notes: `${fresh.notes}+mine` }
		})
		assert.deepEqual(seen, [{ rev: 0, notes: '' }, { rev: 1, notes: 'foreign' }])
		const after = await stored(doc)
		assert.equal(after.notes, 'foreign+mine')
		assert.equal(after.rev, 2)
		assert.equal(result.notes, 'foreign+mine')
		assert.equal(result.rev, 2)
		assert.equal(callsOf(spy, 'mediaAssets', 'updateOne').length, 2)
	})

	/** A foreign write lands before EVERY write attempt. */
	async function exhaust(opts) {
		const ws = newWs()
		const [doc] = await seed(ws, { notes: '' })
		const spy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaAssets' && ev.method === 'updateOne' && ev.phase === 'before') await foreign(doc, { notes: `foreign ${ev.n}` })
		})
		const error = await C.commitAsset(spy, ws, doc._id, (fresh) => ({ notes: `${fresh.notes}+` }), opts).then(() => null, (e) => e)
		const attempts = callsOf(spy, 'mediaAssets', 'updateOne').length
		return { error, attempts, after: await stored(doc) }
	}

	for (const [label, opts, expected] of [
		['the default (5 retries = 6 attempts)', undefined, 6],
		['retries: 2 (3 attempts)', { retries: 2 }, 3],
		['retries: 0 (1 attempt)', { retries: 0 }, 1],
		['retries: NaN falls back to the default', { retries: Number.NaN }, 6],
		['retries: -3 means none', { retries: -3 }, 1],
		['retries: 1.9 is rounded down (2 attempts)', { retries: 1.9 }, 2],
		['retries: "3" (not a number) falls back to the default', { retries: '3' }, 6],
		['retries: Infinity is capped at 20 (21 attempts)', { retries: Infinity }, 21],
	])
		await check(`409 after exhausting ${label}`, async () => {
			const { error, attempts, after } = await exhaust(opts)
			assert.ok(error instanceof MediaError, String(error))
			assert.equal(error.status, 409)
			assert.equal(error.message, 'That image changed while saving. Try again.')
			assert.equal(attempts, expected)
			assert.equal(after.notes, `foreign ${expected}`, 'only the foreign writes landed: ours never did')
			assert.equal(after.rev, expected)
		})

	await check('extraFilter is in the READ filter and in the WRITE filter, next to _id, workspaceId and (write only) the revision', async () => {
		const ws = newWs()
		const lease = new Date(Date.now() + 60_000)
		const [doc] = await seed(ws, { tagging: { status: 'running', attempts: 1, leaseUntil: lease } })
		const extra = { 'tagging.status': 'running', 'tagging.leaseUntil': lease }
		const spy = spyDb(db)
		const result = await C.commitAsset(spy, ws, doc._id, () => ({ notes: 'applied' }), { extraFilter: extra })
		assert.equal(result.notes, 'applied')
		const read = callsOf(spy, 'mediaAssets', 'findOne')[0].args[0]
		const write = callsOf(spy, 'mediaAssets', 'updateOne')[0].args[0]
		for (const [name, filter] of [['read', read], ['write', write]]) {
			assert.equal(filter['tagging.status'], 'running', `${name}: status`)
			assert.equal(+filter['tagging.leaseUntil'], +lease, `${name}: lease`)
			assert.ok(filter._id.equals(doc._id), `${name}: _id`)
			assert.ok(filter.workspaceId.equals(ws), `${name}: workspaceId`)
		}
		assert.equal(write.rev, 0)
		assert.ok(!('rev' in read))
		const update = callsOf(spy, 'mediaAssets', 'updateOne')[0].args[1]
		assert.deepEqual(update.$inc, { rev: 1 })
	})

	await check('the lost AI claim: the lease is taken over between read and write WITHOUT a revision bump and the old worker\'s result is dropped', async () => {
		const ws = newWs()
		const lease = new Date(Date.now() + 60_000)
		const takeover = new Date(Date.now() + 120_000)
		const claim = { 'tagging.status': 'running', 'tagging.leaseUntil': lease }
		const run = async (opts) => {
			const [doc] = await seed(ws, { notes: 'before', tagging: { status: 'running', attempts: 1, leaseUntil: lease } })
			let calls = 0
			const spy = spyDb(db, async (ev) => {
				if (at(ev, 'mediaAssets', 'findOne', 1, 'after'))
					await assetCol.updateOne({ _id: doc._id }, { $set: { 'tagging.leaseUntil': takeover, 'tagging.attempts': 2 } }) // a claim: no rev bump
			})
			const result = await C.commitAsset(spy, ws, doc._id, () => {
				calls++
				return { notes: 'stale result' }
			}, opts)
			return { result, calls, after: await stored(doc) }
		}
		const guarded = await run({ extraFilter: claim })
		assert.equal(guarded.result, null)
		assert.equal(guarded.calls, 1, 'the retry finds the claim gone, so the mutation is not run again')
		assert.equal(guarded.after.notes, 'before')
		assert.equal(guarded.after.rev, 0)
		assert.equal(+guarded.after.tagging.leaseUntil, +takeover)
		// Control: without the lease in the filter the very same takeover goes unnoticed (rev did not move).
		const unguarded = await run(undefined)
		assert.equal(unguarded.result.notes, 'stale result', 'only the extra filter in the write protects a lease')
	})

	await check('an extra filter can only narrow the match: keys that collide with the scope (workspaceId, _id, rev, $and) never replace it', async () => {
		const ws = newWs()
		const other = newWs()
		const [mine] = await seed(ws, { notes: 'a' })
		const [theirs] = await seed(other, { notes: 't' })
		for (const extra of [{ workspaceId: other }, { _id: theirs._id }, { rev: 99 }, { $and: [{ workspaceId: other }] }, { workspaceId: { $ne: ws } }])
			assert.equal(await C.commitAsset(db, ws, mine._id, () => ({ notes: 'x' }), { extraFilter: extra }), null, JSON.stringify(extra))
		assert.equal(await C.commitAsset(db, ws, theirs._id, () => ({ notes: 'x' }), { extraFilter: { workspaceId: other } }), null, 'aiming at the other workspace\'s asset')
		assert.equal((await stored(mine)).notes, 'a')
		assert.equal((await stored(theirs)).notes, 't')
		const narrowed = await C.commitAsset(db, ws, mine._id, () => ({ notes: 'ok' }), { extraFilter: { rev: 0, workspaceId: ws } })
		assert.equal(narrowed.notes, 'ok', 'a colliding key that agrees with the scope still narrows correctly')
	})

	await check('hostile arguments: ids and workspaces that are not ObjectIds, a malformed extra filter - nothing is queried or written', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, { notes: 'safe' })
		const spy = spyDb(db)
		const mutate = () => ({ notes: 'pwned' })
		for (const id of [String(doc._id), { $ne: null }, { $gt: '' }, null, undefined, 5, {}, [doc._id], doc._id.toHexString()])
			assert.equal(await C.commitAsset(spy, ws, id, mutate), null, JSON.stringify(id))
		for (const bad of [String(ws), { $ne: null }, null, undefined, 5, {}])
			assert.equal(await C.commitAsset(spy, bad, doc._id, mutate), null)
		for (const extra of [[], 'x', 5, true, () => 1, new Date(), new Map()])
			assert.equal(await C.commitAsset(spy, ws, doc._id, mutate, { extraFilter: extra }), null, String(extra))
		assert.equal(spy.events.length, 0, 'no query was even sent')
		assert.equal((await stored(doc)).notes, 'safe')
		assert.equal((await C.commitAsset(db, ws, doc._id, () => ({ notes: 'fine' }), { extraFilter: null })).notes, 'fine', 'a null extra filter means none')
	})

	await check('only the documented fields are written: a mutation cannot set workspaceId, rev, _id, terms, url... and an undefined never becomes null', async () => {
		const ws = newWs()
		const other = newWs()
		const [doc] = await seed(ws, { caption: 'keep', tags: [vision('old', 0.9)] })
		const before = await stored(doc)
		await C.commitAsset(db, ws, doc._id, () => ({
			notes: 'ok',
			workspaceId: other,
			rev: 99,
			_id: new ObjectId(),
			terms: ['evil'],
			termsVersion: 99,
			url: 'https://evil.invalid',
			pathname: 'p',
			createdAt: new Date(0),
			nameKey: 'evil',
			colorNames: ['evil'],
			updatedAt: new Date(0),
			$set: { x: 1 },
			'a.b': 1,
			caption: undefined,
			tags: [{ slug: 'a', label: 'A', source: 'auto', via: 'vision', confidence: undefined }, undefined],
			tagging: { status: 'done', attempts: 1, leaseUntil: undefined, error: undefined },
		}))
		const after = await stored(doc)
		assert.equal(after.notes, 'ok')
		assert.equal(after.rev, 1)
		assert.ok(after.workspaceId.equals(ws))
		assert.ok(after._id.equals(doc._id))
		assert.ok(!after.terms.includes('evil'))
		assert.ok(!after.colorNames.includes('evil'))
		assert.notEqual(after.nameKey, 'evil')
		assert.equal(after.termsVersion, 1)
		assert.equal(after.url, before.url)
		assert.equal(after.pathname, before.pathname)
		assert.equal(+after.createdAt, +before.createdAt)
		assert.ok(after.updatedAt > before.updatedAt, 'updatedAt is the commit\'s, not the mutation\'s')
		assert.ok(!('x' in after) && !('a' in after))
		assert.equal(after.caption, 'keep', 'an undefined field is "not set", not null')
		assert.deepEqual(after.tags, [{ slug: 'a', label: 'A', source: 'auto', via: 'vision' }])
		assert.ok(!('confidence' in after.tags[0]), 'no confidence: null')
		assert.deepEqual(after.tagging, { status: 'done', attempts: 1 })
	})

	await check('the returned document is the stored one even for Dates and ObjectIds in the patch (nothing is stringified or cloned wrongly)', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, {})
		const folder = new ObjectId()
		const at1 = new Date(Date.now() + 5000)
		const result = await C.commitAsset(db, ws, doc._id, () => ({ folderId: folder, tagging: { status: 'running', attempts: 2, leaseUntil: at1 } }))
		const after = await stored(doc)
		assert.ok(after.folderId.equals(folder))
		assert.equal(+after.tagging.leaseUntil, +at1)
		assert.ok(result.folderId.equals(folder))
		assert.ok(result.tagging.leaseUntil instanceof Date)
	})

	await check('a document written before revisions existed (no rev) can be committed: rev becomes 1', async () => {
		const ws = newWs()
		const doc = assetDoc(ws, {})
		delete doc.rev
		await assetCol.insertOne(doc)
		const result = await C.commitAsset(db, ws, doc._id, () => ({ notes: 'legacy' }))
		assert.equal(result.rev, 1)
		assert.equal((await stored(doc)).rev, 1)
		assert.equal((await C.commitAsset(db, ws, doc._id, () => ({ notes: 'again' }))).rev, 2)
	})

	await check('a mutation that throws propagates and writes nothing', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, {})
		const spy = spyDb(db)
		const error = await C.commitAsset(spy, ws, doc._id, () => {
			throw new Error('boom')
		}).then(() => null, (e) => e)
		assert.equal(error.message, 'boom')
		assert.equal(writesOf(spy).length, 0)
	})

	await check('a write invalidates the cached vocabulary; a null mutation leaves it alone', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, { caption: 'plain' })
		const first = await V.loadVocabulary(db, ws)
		assert.ok(!first.has('zebra'))
		assert.equal(await V.loadVocabulary(db, ws), first, 'cached')
		await C.commitAsset(db, ws, doc._id, () => null)
		assert.equal(await V.loadVocabulary(db, ws), first, 'nothing written, cache kept')
		await C.commitAsset(db, ws, doc._id, () => ({ caption: 'zebra crossing' }))
		const second = await V.loadVocabulary(db, ws)
		assert.notEqual(second, first)
		assert.ok(second.has('zebra'))
		assert.ok(!second.has('plain'))
	})

	/* ---------------------------------------------------------------------- */
	section('the lost-update case')

	const incoming = [
		{ label: 'Cabinets', confidence: 0.9 },
		{ label: 'Granite counter', confidence: 0.8 },
		{ label: 'Sink', confidence: 0.4 },
	]
	/** The AI's apply, written the way process.ts is specified to: from the FRESH document, nothing captured. */
	const aiApplyFor = (rules, tally) => (fresh) => {
		tally.runs++
		return {
			tags: T.mergeAutoTags(fresh.tags, fresh.rejectedTags, incoming, 'vision', rules),
			...(fresh.captionEdited ? {} : { caption: 'AI caption', altText: 'AI alt' }),
			textInImage: 'GRAND OPENING',
			keywords: ['cooking', 'remodel'],
			kind: 'photo',
			tagging: { status: 'done', attempts: 1, model: 'test-model', at: new Date() },
		}
	}
	await check('a slow AI apply cannot erase a manual tag or an edited caption added while it ran; the vision tags land exactly once', async () => {
		const ws = newWs()
		const lease = new Date(Date.now() + 55_000)
		const [doc] = await seed(ws, { caption: '', tags: [fname('kitchen')], tagging: { status: 'running', attempts: 1, leaseUntil: lease } })
		const rules = rulesOf()
		const tally = { runs: 0 }
		const spy = spyDb(db, async (ev) => {
			// the model is "thinking": the person adds a tag, then edits the caption
			if (at(ev, 'mediaAssets', 'findOne', 1, 'after')) {
				await personAddsTag(db, ws, doc, ['Hand picked'], rules)
				await C.commitAsset(db, ws, doc._id, () => ({ caption: 'A caption by hand', captionEdited: true }))
			}
		})
		const result = await C.commitAsset(spy, ws, doc._id, aiApplyFor(rules, tally), { extraFilter: { 'tagging.status': 'running', 'tagging.leaseUntil': lease } })
		const after = await stored(doc)
		assert.ok(result && result.rev === 3)
		assert.deepEqual(after.tags, [manual('hand-picked', 'Hand picked'), vision('cabinets', 0.9, 'Cabinets'), vision('granite-counter', 0.8, 'Granite counter'), fname('kitchen')])
		assert.equal(after.tags.filter((tag) => tag.slug === 'cabinets').length, 1, 'applied exactly once')
		assert.equal(after.caption, 'A caption by hand')
		assert.equal(after.altText, '', 'the AI did not overwrite what the person edited')
		assert.equal(after.captionEdited, true)
		assert.equal(after.tagging.status, 'done')
		assert.equal(after.tagging.leaseUntil, undefined)
		assert.equal(after.rev, 3, 'manual add, caption edit, AI apply')
		assert.equal(tally.runs, 2, 'once on the stale document (it lost the race), once on the fresh one')
		assert.deepEqual(after.terms, derivedFields(after).terms)
		for (const word of ['hand', 'picked', 'caption', 'cabinets', 'granite', 'counter', 'grand', 'opening', 'cooking', 'remodel', 'photo', 'kitchen'])
			assert.ok(after.terms.includes(word), `terms hold ${word}`)
		assert.ok(!after.terms.includes('sink'), 'a vision tag under the floor is neither stored nor indexed')
		assert.ok(!after.terms.includes('alt'), 'the AI alt text was not written')
	})

	await check('control: the naive read-modify-write this replaces DOES lose the manual tag in the same scenario', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, { tags: [], tagging: { status: 'running', attempts: 1 } })
		const stale = await stored(doc) // the AI reads once...
		await personAddsTag(db, ws, doc, ['Hand picked'], rulesOf()) // ...the person acts...
		await assetCol.updateOne({ _id: doc._id }, { $set: { tags: T.mergeAutoTags(stale.tags, stale.rejectedTags, incoming, 'vision', rulesOf()) } }) // ...and the AI writes whole arrays
		assert.ok(!(await stored(doc)).tags.some((tag) => tag.slug === 'hand-picked'), 'the bug is real, so the test above proves something')
	})

	await check('the same case with the person editing while a slow apply finishes in the other order (person last)', async () => {
		const ws = newWs()
		const lease = new Date(Date.now() + 55_000)
		const [doc] = await seed(ws, { tags: [], tagging: { status: 'running', attempts: 1, leaseUntil: lease } })
		const tally = { runs: 0 }
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'updateOne', 1, 'after')) await personAddsTag(db, ws, doc, ['Late tag'], rulesOf())
		})
		await C.commitAsset(spy, ws, doc._id, aiApplyFor(rulesOf(), tally), { extraFilter: { 'tagging.status': 'running', 'tagging.leaseUntil': lease } })
		const after = await stored(doc)
		assert.deepEqual(slugs(after.tags), ['late-tag', 'cabinets', 'granite-counter'])
		assert.equal(tally.runs, 1)
		assert.equal(after.rev, 2)
	})

	await check('real concurrency (no injection): 60 simultaneous person edits and AI applies on 60 assets - every edit and every apply survives', async () => {
		const ws = newWs()
		const leases = Array.from({ length: 60 }, (_, i) => new Date(Date.now() + 55_000 + i))
		const docs = await seed(ws, ...leases.map((lease) => ({ caption: '', tagging: { status: 'running', attempts: 1, leaseUntil: lease } })))
		const rules = rulesOf()
		const tally = { runs: 0 }
		await Promise.all(
			docs.flatMap((doc, i) => [
				C.commitAsset(db, ws, doc._id, aiApplyFor(rules, tally), { extraFilter: { 'tagging.status': 'running', 'tagging.leaseUntil': leases[i] } }),
				personAddsTag(db, ws, doc, [`Own ${i}`], rules),
				C.commitAsset(db, ws, doc._id, () => ({ notes: `note ${i}` })),
			]),
		)
		for (const [i, doc] of docs.entries()) {
			const after = await stored(doc)
			assert.ok(after.tags.some((tag) => tag.slug === `own-${i}` && tag.source === 'manual'), `asset ${i}: the manual tag survived`)
			assert.deepEqual(slugs(after.tags.filter((tag) => tag.via === 'vision')), ['cabinets', 'granite-counter'], `asset ${i}: the vision tags landed once`)
			assert.equal(after.notes, `note ${i}`, `asset ${i}: the note survived`)
			assert.equal(after.tagging.status, 'done')
			assert.equal(after.rev, 3, `asset ${i}: three commits, three revisions`)
			assert.deepEqual(after.terms, derivedFields(after).terms)
		}
	})
}

/* -------------------------------------------------------------------------- */
/* Database: commitMany                                                       */
/* -------------------------------------------------------------------------- */

async function proveCommitMany() {
	section('commitMany')

	await check('applies to every document: rev bumped once, terms rebuilt, { changed, conflicts } returned', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 5 }, (_, i) => ({ caption: `c${i}` })))
		const result = await C.commitMany(db, ws, docs.map((d) => d._id), (doc) => ({ tags: [manual('kitchen', 'Kitchen')], notes: `n-${doc.caption}` }))
		assert.deepEqual(result, { changed: 5, conflicts: 0 })
		for (const doc of docs) {
			const after = await stored(doc)
			assert.equal(after.rev, 1)
			assert.deepEqual(after.tags, [manual('kitchen', 'Kitchen')])
			assert.equal(after.notes, `n-${doc.caption}`, 'the mutation saw each document')
			assert.deepEqual(after.terms, derivedFields(after).terms)
			assert.ok(after.terms.includes('kitchen'))
			assert.ok(after.updatedAt > doc.updatedAt)
		}
	})

	await check('documents the mutation returns null for are left alone (no write, no rev bump) and not counted; all-null writes nothing at all', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 6 }, (_, i) => ({ caption: `c${i}` })))
		const odd = (doc) => Number(doc.caption.slice(1)) % 2 === 1
		const spy = spyDb(db)
		const result = await C.commitMany(spy, ws, docs.map((d) => d._id), (doc) => (odd(doc) ? { notes: 'x' } : null))
		assert.deepEqual(result, { changed: 3, conflicts: 0 })
		assert.equal(callsOf(spy, 'mediaAssets', 'bulkWrite')[0].args[0].length, 3)
		for (const doc of docs) assert.deepEqual((await stored(doc)).rev, odd(doc) ? 1 : 0)
		const quiet = spyDb(db)
		assert.deepEqual(await C.commitMany(quiet, ws, docs.map((d) => d._id), () => null), { changed: 0, conflicts: 0 })
		assert.equal(writesOf(quiet).length, 0)
	})

	let big = null
	const bigDocs = async () => {
		if (!big) {
			const ws = newWs()
			big = { ws, docs: await seedMany(ws, 1200, (i) => ({ caption: `doc ${i}`, notes: '' })) }
		}
		return big
	}
	const append = (doc) => ({ notes: `${doc.notes}x` })

	await check('1,200 documents are written in slices of 500, one unordered bulkWrite of revision-filtered updates each, exactly once each', async () => {
		const { ws, docs } = await bigDocs()
		const spy = spyDb(db)
		const result = await C.commitMany(spy, ws, docs.map((d) => d._id), append)
		assert.deepEqual(result, { changed: 1200, conflicts: 0 })
		const bulks = callsOf(spy, 'mediaAssets', 'bulkWrite')
		assert.deepEqual(bulks.map((e) => e.args[0].length), [500, 500, 200])
		for (const e of bulks) assert.equal(e.args[1].ordered, false)
		const op = bulks[0].args[0][0].updateOne
		assert.deepEqual(Object.keys(op.filter).sort(), ['_id', 'rev', 'workspaceId'])
		assert.ok(op.filter.workspaceId.equals(ws))
		assert.deepEqual(op.update.$inc, { rev: 1 })
		for (const key of ['notes', 'terms', 'termsVersion', 'nameKey', 'colorNames', 'updatedAt']) assert.ok(key in op.update.$set, `$set holds ${key}`)
		assert.equal(callsOf(spy, 'mediaAssets', 'find').length, 3, 'one read per slice and no re-read when every write matched')
		const all = await assetsOf(ws)
		assert.equal(all.length, 1200)
		assert.ok(all.every((d) => d.notes === 'x' && d.rev === 1), 'every document written exactly once')
		for (const d of all) assert.deepEqual(d.terms, derivedFields(d).terms)
	})

	await check('slice boundaries: 500 is one write, 501 is two (500 + 1)', async () => {
		const { ws, docs } = await bigDocs()
		const ids = docs.map((d) => d._id)
		let spy = spyDb(db)
		assert.deepEqual(await C.commitMany(spy, ws, ids.slice(0, 500), append), { changed: 500, conflicts: 0 })
		assert.deepEqual(callsOf(spy, 'mediaAssets', 'bulkWrite').map((e) => e.args[0].length), [500])
		spy = spyDb(db)
		assert.deepEqual(await C.commitMany(spy, ws, ids.slice(0, 501), append), { changed: 501, conflicts: 0 })
		assert.deepEqual(callsOf(spy, 'mediaAssets', 'bulkWrite').map((e) => e.args[0].length), [500, 1])
		const all = await assetsOf(ws)
		const notes = new Map(all.map((d) => [String(d._id), d.notes]))
		assert.equal(notes.get(String(ids[0])), 'xxx')
		assert.equal(notes.get(String(ids[500])), 'xx')
		assert.equal(notes.get(String(ids[501])), 'x')
	})

	await check('ids of other workspaces, unknown ids, duplicates and values that are not ObjectIds are ignored', async () => {
		const ws = newWs()
		const other = newWs()
		const mine = await seed(ws, {}, {}, {})
		const theirs = await seed(other, {}, {})
		const ids = [mine[0]._id, mine[0]._id, mine[1]._id, ...theirs.map((d) => d._id), new ObjectId(), 'nope', null, undefined, 5, { $ne: null }, mine[1]._id.toHexString()]
		const shown = []
		const result = await C.commitMany(db, ws, ids, (doc) => {
			shown.push(String(doc._id))
			return { notes: 'x' }
		})
		assert.deepEqual(result, { changed: 2, conflicts: 0 })
		const foreignIds = new Set(theirs.map((d) => String(d._id)))
		assert.ok(shown.length > 0 && shown.every((id) => !foreignIds.has(id)), 'another workspace\'s document never even reaches the mutation')
		assert.equal((await stored(mine[2])).rev, 0)
		for (const doc of theirs) assert.deepEqual(await stored(doc), doc, 'a foreign workspace\'s asset is never touched')
	})

	await check('empty or odd arguments return zeros and send no query', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, {})
		const spy = spyDb(db)
		const m = () => ({ notes: 'x' })
		for (const ids of [[], undefined, null, 'x', 5, {}, [null, 'a']]) assert.deepEqual(await C.commitMany(spy, ws, ids, m), { changed: 0, conflicts: 0 })
		for (const bad of [String(ws), { $ne: null }, null, undefined]) assert.deepEqual(await C.commitMany(spy, bad, [doc._id], m), { changed: 0, conflicts: 0 })
		assert.equal(spy.events.length, 0)
		assert.equal((await stored(doc)).rev, 0)
	})

	await check('conflicts: documents changed under the bulk write are re-read and re-run, and a counting mutation lands exactly once on every document', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 40 }, (_, i) => ({ caption: `c${i}`, notes: '' })))
		const hit = docs.slice(0, 7)
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'bulkWrite', 1)) for (const doc of hit) await foreign(doc, { altText: 'foreign' })
		})
		const seen = new Map()
		const result = await C.commitMany(spy, ws, docs.map((d) => d._id), (doc) => {
			seen.set(String(doc._id), (seen.get(String(doc._id)) ?? 0) + 1)
			return { notes: `${doc.notes}x` }
		})
		assert.deepEqual(result, { changed: 40, conflicts: 0 })
		const hitIds = new Set(hit.map((d) => String(d._id)))
		for (const doc of await assetsOf(ws)) {
			assert.equal(doc.notes, 'x', 'applied exactly once')
			assert.equal(doc.rev, hitIds.has(String(doc._id)) ? 2 : 1)
			assert.equal(doc.altText, hitIds.has(String(doc._id)) ? 'foreign' : '', 'the foreign write was not lost')
			assert.equal(seen.get(String(doc._id)), hitIds.has(String(doc._id)) ? 2 : 1, 'a document that landed is not evaluated again')
		}
		assert.deepEqual(callsOf(spy, 'mediaAssets', 'bulkWrite').map((e) => e.args[0].length), [40, 7])
	})

	await check('conflicts: a document that changes before EVERY write is a reported conflict after 1 + 3 passes; the others land', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 40 }, (_, i) => ({ caption: `c${i}`, notes: '' })))
		const hot = docs.slice(0, 2)
		const spy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaAssets' && ev.method === 'bulkWrite' && ev.phase === 'before') for (const doc of hot) await foreign(doc, { altText: `foreign ${ev.n}` })
		})
		const result = await C.commitMany(spy, ws, docs.map((d) => d._id), (doc) => ({ notes: `${doc.notes}x` }))
		assert.deepEqual(result, { changed: 38, conflicts: 2 })
		assert.deepEqual(callsOf(spy, 'mediaAssets', 'bulkWrite').map((e) => e.args[0].length), [40, 2, 2, 2])
		for (const doc of hot) {
			const after = await stored(doc)
			assert.equal(after.notes, '', 'our change never landed on a conflict')
			assert.equal(after.rev, 4, 'four foreign writes, none of them lost')
			assert.equal(after.altText, 'foreign 4')
		}
		const others = (await assetsOf(ws)).filter((d) => !hot.some((h) => h._id.equals(d._id)))
		assert.ok(others.every((d) => d.notes === 'x' && d.rev === 1))
	})

	await check('conflicts: when the other writer made the very same change, nothing is re-run and it is neither changed nor a conflict', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 10 }, () => ({ caption: '' })))
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'bulkWrite', 1)) await foreign(docs[0], { caption: 'Shared', altText: 'foreign' })
		})
		const result = await C.commitMany(spy, ws, docs.map((d) => d._id), (doc) => (doc.caption === 'Shared' ? null : { caption: 'Shared' }))
		assert.deepEqual(result, { changed: 9, conflicts: 0 })
		assert.equal(callsOf(spy, 'mediaAssets', 'bulkWrite').length, 1)
		const first = await stored(docs[0])
		assert.equal(first.rev, 1, 'only the foreign write')
		assert.equal(first.altText, 'foreign')
	})

	await check('conflicts: a foreign write that copies our revision and timestamp cannot hide a failed write (content decides, not rev or updatedAt)', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 6 }, () => ({ notes: '' })))
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'bulkWrite', 1)) {
				const stamp = ev.args[0][0].updateOne.update.$set.updatedAt
				const victim = ev.args[0][0].updateOne.filter._id
				await assetCol.updateOne({ _id: victim }, { $set: { notes: 'foreign', updatedAt: stamp }, $inc: { rev: 1 } })
			}
		})
		const result = await C.commitMany(spy, ws, docs.map((d) => d._id), (doc) => ({ notes: `${doc.notes}x` }))
		assert.deepEqual(result, { changed: 6, conflicts: 0 })
		const notes = (await assetsOf(ws)).map((d) => d.notes).sort()
		assert.deepEqual(notes, ['foreignx', 'x', 'x', 'x', 'x', 'x'])
	})

	await check('text BSON cannot store as written (a lone surrogate becomes U+FFFD) does not make landed writes look unfinished', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 6 }, () => ({ caption: '', notes: '' })))
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'bulkWrite', 1)) await foreign(docs[0], { altText: 'foreign' })
		})
		// A counting mutation: if a landed document were mistaken for an unfinished one it would be counted twice.
		const result = await C.commitMany(spy, ws, docs.map((d) => d._id), (doc) => ({ caption: 'broken \ud800 text', notes: `${doc.notes}x` }))
		assert.deepEqual(result, { changed: 6, conflicts: 0 }, 'five landed in pass one, one in pass two: six writes, none repeated')
		assert.equal(callsOf(spy, 'mediaAssets', 'bulkWrite').length, 2)
		const all = await assetsOf(ws)
		assert.ok(all.every((d) => d.caption === 'broken \ufffd text' && d.notes === 'x'))
		assert.deepEqual(all.map((d) => d.rev).sort(), [1, 1, 1, 1, 1, 2])
	})

	await check('a write the server rejects is a reported conflict (not thrown, not retried); the rest of the batch lands', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 5 }, () => ({ notes: '' })))
		let replaced = null
		const spy = spyDb(db, undefined, (ev) => {
			if (!at(ev, 'mediaAssets', 'bulkWrite', 1)) return null
			const ops = ev.args[0].slice()
			replaced = ops[2].updateOne.filter._id
			// An insert of an existing _id: the server answers with a duplicate-key write error for this one op.
			ops[2] = { insertOne: { document: { _id: replaced, workspaceId: ws } } }
			return [ops, ev.args[1]]
		})
		const { value: result, lines } = await quietly(() => C.commitMany(spy, ws, docs.map((d) => d._id), (doc) => ({ notes: `${doc.notes}x` })))
		assert.deepEqual(result, { changed: 4, conflicts: 1 })
		assert.equal(callsOf(spy, 'mediaAssets', 'bulkWrite').length, 1, 'a rejected write is not retried')
		assert.equal(lines.length, 1)
		assert.ok(!lines[0].includes(String(ws)), 'the log line carries no ids')
		assert.equal((await assetCol.findOne({ _id: replaced })).notes, '', 'the rejected one was not applied')
		assert.equal((await assetsOf(ws)).filter((d) => d.notes === 'x').length, 4)
	})

	await check('errors other than a rejected write (a dropped connection) propagate, and the vocabulary is still invalidated for slices that landed', async () => {
		const ws = newWs()
		const docs = await seedMany(ws, 600, (i) => ({ caption: `tm ${i}`, notes: '' }))
		const before = await V.loadVocabulary(db, ws)
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'bulkWrite', 2)) throw new Error('connection reset')
		})
		const error = await C.commitMany(spy, ws, docs.map((d) => d._id), (doc) => ({ caption: `${doc.caption} zebra` })).then(() => null, (e) => e)
		assert.equal(error.message, 'connection reset')
		const after = await V.loadVocabulary(db, ws)
		assert.notEqual(after, before, 'the first slice landed, so the cached vocabulary was dropped')
		assert.ok(after.has('zebra'))
		const done = (await assetsOf(ws)).filter((d) => d.rev === 1).length
		assert.equal(done, 500, 'the first slice is in, the second never started')
	})

	await check('a write invalidates the cached vocabulary (commitMany)', async () => {
		const ws = newWs()
		const docs = await seed(ws, { caption: 'plain' }, { caption: 'plain' })
		const first = await V.loadVocabulary(db, ws)
		await C.commitMany(db, ws, docs.map((d) => d._id), () => ({ caption: 'zebra crossing' }))
		const second = await V.loadVocabulary(db, ws)
		assert.notEqual(second, first)
		assert.ok(second.has('zebra') && !second.has('plain'))
	})

	await check('real concurrency: a bulk tag over 60 assets while 60 people edit those same assets - no edit and no bulk tag is lost', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 60 }, () => ({})))
		const rules = rulesOf()
		const [bulk] = await Promise.all([
			C.commitMany(db, ws, docs.map((d) => d._id), (doc) => {
				const result = T.applyManualTags(doc.tags, doc.rejectedTags, ['Bulk'], rules)
				return result.tags.length === doc.tags.length && result.tags.every((t, i) => t.source === doc.tags[i].source) ? null : { tags: result.tags, rejectedTags: result.rejected }
			}),
			...docs.map((doc, i) => personAddsTag(db, ws, doc, [`Own ${i}`], rules)),
		])
		assert.deepEqual(bulk, { changed: 60, conflicts: 0 })
		for (const [i, doc] of docs.entries()) {
			const after = await stored(doc)
			const have = slugs(after.tags).sort()
			assert.deepEqual(have, ['bulk', `own-${i}`].sort(), `asset ${i}`)
			assert.deepEqual(after.terms, derivedFields(after).terms)
		}
	})

	await check('the tag cap and rejected cap hold through the chokepoint: a bulk add of 45 labels to an asset with 39 tags writes exactly 40', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, { tags: Array.from({ length: 39 }, (_, i) => manual(`t${i}`)) })
		await C.commitMany(db, ws, [doc._id], (d) => {
			const result = T.applyManualTags(d.tags, d.rejectedTags, Array.from({ length: 45 }, (_, i) => `New ${i}`), rulesOf())
			return { tags: result.tags, rejectedTags: result.rejected }
		})
		assert.equal((await stored(doc)).tags.length, cap)
	})
}

/* -------------------------------------------------------------------------- */
/* Database: rules                                                            */
/* -------------------------------------------------------------------------- */

async function proveRules() {
	section('writeRule and loadTagRules')

	await check('a->b then b->c leaves a->c and b->c (chains are flattened when written), and resolves in one hop', async () => {
		const ws = newWs()
		await T.writeRule(db, ws, 'a', redirect('b', 'B'))
		await T.writeRule(db, ws, 'b', redirect('c', 'C'))
		assert.deepEqual(await ruleMap(ws), { a: 'c', b: 'c' })
		const docs = await rulesDocs(ws)
		assert.deepEqual(docs.map((d) => d.to), [{ slug: 'c', label: 'C' }, { slug: 'c', label: 'C' }])
		const rules = await T.loadTagRules(db, ws)
		assert.deepEqual(T.resolveTag('a', rules), { slug: 'c', label: 'C', blocked: false })
		assert.deepEqual([...T.redirectsOf(rules)].sort(), [['a', 'c'], ['b', 'c']])
	})

	await check('a rule keeps the label it was given (cleaned and capped), not one derived from the slug', async () => {
		const ws = newWs()
		await T.writeRule(db, ws, 'a', redirect('bee', '  Bee   Special \u0007 '))
		await T.writeRule(db, ws, 'c', redirect('dee', 'D'.repeat(100)))
		const docs = await rulesDocs(ws)
		assert.deepEqual(docs.map((d) => d.to), [{ slug: 'bee', label: 'Bee Special' }, { slug: 'dee', label: 'D'.repeat(MEDIA_LIMITS.tagLabelMax) }])
		assert.deepEqual([...(await T.loadTagRules(db, ws))].map(([from, to]) => [from, to.label]), [['a', 'Bee Special'], ['c', 'D'.repeat(40)]])
	})

	await check('b->a after a->b leaves no cycle: the target is live again', async () => {
		const ws = newWs()
		await T.writeRule(db, ws, 'a', redirect('b', 'B'))
		await T.writeRule(db, ws, 'b', redirect('a', 'A'))
		assert.deepEqual(await ruleMap(ws), { b: 'a' })
	})

	await check('longer reshuffles never leave a cycle or a chain: a->b, b->c, c->a, then a->d', async () => {
		const ws = newWs()
		await T.writeRule(db, ws, 'a', redirect('b', 'B'))
		await T.writeRule(db, ws, 'b', redirect('c', 'C'))
		await T.writeRule(db, ws, 'c', redirect('a', 'A'))
		assert.deepEqual(await ruleMap(ws), { b: 'a', c: 'a' })
		await T.writeRule(db, ws, 'a', redirect('d', 'D'))
		assert.deepEqual(await ruleMap(ws), { a: 'd', b: 'd', c: 'd' })
		const rules = await T.loadTagRules(db, ws)
		for (const slug of ['a', 'b', 'c']) assert.equal(T.resolveTag(slug, rules).slug, 'd')
	})

	await check('a self-merge writes nothing (no query reaches the rules collection)', async () => {
		const ws = newWs()
		const spy = spyDb(db)
		await T.writeRule(spy, ws, 'a', redirect('a', 'A'))
		assert.equal(spy.events.length, 0)
		assert.deepEqual(await ruleMap(ws), {})
		await T.writeRule(db, ws, 'x', redirect('y', 'Y'))
		const before = await rulesDocs(ws)
		await T.writeRule(spy, ws, 'x', redirect('x', 'X again'))
		assert.deepEqual(await rulesDocs(ws), before, 'an existing rule is left exactly as it was')
	})

	await check('a second rule on the same slug upserts: one document, the new target, the original createdAt, no duplicate-key error', async () => {
		const ws = newWs()
		await T.writeRule(db, ws, 'a', redirect('b', 'B'))
		const [first] = await rulesDocs(ws)
		await T.writeRule(db, ws, 'a', redirect('c', 'C'))
		const docs = await rulesDocs(ws)
		assert.equal(docs.length, 1)
		assert.deepEqual(docs[0].to, { slug: 'c', label: 'C' })
		assert.ok(docs[0]._id.equals(first._id))
		assert.equal(+docs[0].createdAt, +first.createdAt)
		await T.writeRule(db, ws, 'a', null)
		const blocked = await rulesDocs(ws)
		assert.equal(blocked.length, 1)
		assert.equal(blocked[0].to, null)
		await T.writeRule(db, ws, 'a', redirect('z', 'Z'))
		assert.deepEqual((await rulesDocs(ws))[0].to, { slug: 'z', label: 'Z' })
	})

	await check('ten concurrent rules on one slug: no duplicate-key error, one document', async () => {
		const ws = newWs()
		const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => T.writeRule(db, ws, 'a', redirect(`t${i}`, `T${i}`))))
		assert.deepEqual(results.filter((r) => r.status === 'rejected').map((r) => String(r.reason)), [])
		assert.equal((await rulesDocs(ws)).length, 1)
	})

	await check('block rules: to is null; rules that pointed at the slug become blocks too; redirecting onto a blocked slug revives it', async () => {
		const ws = newWs()
		await T.writeRule(db, ws, 'a', redirect('b', 'B'))
		await T.writeRule(db, ws, 'b', null)
		assert.deepEqual(await ruleMap(ws), { a: null, b: null })
		const rules = await T.loadTagRules(db, ws)
		assert.deepEqual(T.resolveTag('a', rules), { slug: 'a', blocked: true })
		assert.equal(T.redirectsOf(rules).size, 0, 'blocks are not redirects')
		await T.writeRule(db, ws, 'c', redirect('b', 'B'))
		assert.deepEqual(await ruleMap(ws), { a: null, c: 'b' }, 'b is a live tag again: its block is gone')
	})

	await check('writeRule is idempotent: running the same call again leaves identical documents (ids and createdAt included), for every kind of call', async () => {
		const ws = newWs()
		const calls = [
			['a', redirect('b', 'B')],
			['x', redirect('a', 'A')], // repoints and deletes: a->b is gone, x->a is written
			['y', redirect('x', 'X')], // flattens: x->a gets repointed
			['z', null],
			['b', null],
		]
		for (const [from, to] of calls) {
			await T.writeRule(db, ws, from, to)
			const before = await rulesDocs(ws)
			await T.writeRule(db, ws, from, to)
			assert.deepEqual(await rulesDocs(ws), before, `calling it again: ${from}`)
		}
	})

	await check('writeRule validates: an empty slug or target is a 400 and nothing is written; a bad workspace is a 404', async () => {
		const ws = newWs()
		for (const [from, to] of [['', redirect('b', 'B')], [null, null], [undefined, redirect('b', 'B')], ['   ', null], ['a', redirect('', 'B')], ['a', { label: 'no slug' }], ['a', {}], [5, null]])
			await expectMediaError(() => T.writeRule(db, ws, from, to), 400, JSON.stringify([from, to]))
		await expectMediaError(() => T.writeRule(db, 'not an id', 'a', null), 404)
		await expectMediaError(() => T.writeRule(db, { $ne: null }, 'a', null), 404)
		assert.deepEqual(await ruleMap(ws), {})
		await T.writeRule(db, ws, 'a', { slug: 'work-van', label: '' })
		assert.equal((await rulesDocs(ws))[0].to.label, 'Work van', 'a missing label is derived from the slug')
	})

	await check('rules are per workspace: the same slug in two workspaces is independent, and no rule ever reaches another workspace', async () => {
		const a = newWs()
		const b = newWs()
		await T.writeRule(db, a, 'x', redirect('y', 'Y'))
		await T.writeRule(db, b, 'x', null)
		await T.writeRule(db, b, 'y', redirect('z', 'Z'))
		assert.deepEqual(await ruleMap(a), { x: 'y' })
		assert.deepEqual(await ruleMap(b), { x: null, y: 'z' })
		assert.deepEqual([...(await T.loadTagRules(db, a))], [['x', { slug: 'y', label: 'Y' }]])
	})

	await check('loadTagRules reads redirects and blocks, derives a missing label, skips corrupt documents', async () => {
		const ws = newWs()
		await ruleCol.insertMany([
			{ workspaceId: ws, from: 'ok', to: { slug: 'x', label: 'X' }, createdAt: new Date() },
			{ workspaceId: ws, from: 'blk', to: null, createdAt: new Date() },
			{ workspaceId: ws, from: 'lbl', to: { slug: 'work-van' }, createdAt: new Date() },
			{ workspaceId: ws, from: 'bad1', to: 5 },
			{ workspaceId: ws, from: 'bad2' },
			{ workspaceId: ws, from: 'bad3', to: { slug: '' } },
			{ workspaceId: ws, from: 'bad4', to: { label: 'x' } },
			{ workspaceId: ws, from: 'bad5', to: 'text' },
			{ workspaceId: ws, from: 7, to: null },
			{ workspaceId: ws, from: '', to: null },
		])
		const rules = await T.loadTagRules(db, ws)
		assert.deepEqual([...rules].sort(), [['blk', null], ['lbl', { slug: 'work-van', label: 'Work van' }], ['ok', { slug: 'x', label: 'X' }]])
		assert.equal((await T.loadTagRules(db, newWs())).size, 0)
		assert.equal((await T.loadTagRules(db, 'nope')).size, 0)
	})
}

/* -------------------------------------------------------------------------- */
/* Database: counting tags                                                    */
/* -------------------------------------------------------------------------- */

async function proveStats() {
	section('listTagStats and topTagLabels')

	const ws = newWs()
	const other = newWs()
	let ready = false
	const prepare = async () => {
		if (ready) return
		await seed(ws,
			{ tags: [manual('kitchen', 'Kitchen'), vision('van', 0.9, 'Van')] },
			{ tags: [manual('kitchen', 'Kitchen'), manual('kitchen-remodel', 'Kitchen remodel')] },
			{ tags: [vision('kitchen', 0.8, 'Kitchen'), manual('work-van', 'Work van')] },
			{ tags: [manual('kitchen', 'Kitchen'), fname('bathroom', 'Bathroom')] },
			{ tags: [fname('kitchen', 'Kitchen')] },
			{ tags: [vision('kitchen-remodel', 0.7, 'Kitchen remodel')] },
			{ tags: [manual('kitchen-remodel', 'Kitchen remodel')] },
			{ tags: [manual('van', 'Van')] },
			{ tags: [manual('van', 'van')] },
			{ tags: [manual('van', 'Van')] },
			{ tags: [manual('tools', 'Tools')] },
			{ tags: [manual('tools', 'tools')] },
			{ tags: [manual('caravan', 'Caravan')] },
			{ tags: [manual('bathroom', 'Bathroom')] },
			{ tags: [] },
		)
		await seed(other, { tags: [manual('kitchen', 'Kitchen')] }, { tags: [manual('kitchen', 'Kitchen')] }, { tags: [manual('onlyhere', 'Onlyhere')] })
		ready = true
	}
	const stat = (slug, label, count, manualCount, auto) => ({ slug, label, count, manual: manualCount, auto })
	const expectedAll = [
		stat('kitchen', 'Kitchen', 5, 3, 2),
		stat('van', 'Van', 4, 3, 1),
		stat('kitchen-remodel', 'Kitchen remodel', 3, 2, 1),
		stat('bathroom', 'Bathroom', 2, 1, 1),
		stat('tools', 'Tools', 2, 2, 0),
		stat('caravan', 'Caravan', 1, 1, 0),
		stat('work-van', 'Work van', 1, 1, 0),
	]

	await check('counts assets per tag with the manual/auto split, ordered by count then label; other workspaces never leak in', async () => {
		await prepare()
		assert.deepEqual(await T.listTagStats(db, ws), expectedAll)
		assert.deepEqual(await T.listTagStats(db, other), [stat('kitchen', 'Kitchen', 2, 2, 0), stat('onlyhere', 'Onlyhere', 1, 1, 0)])
		assert.deepEqual(await T.listTagStats(db, newWs()), [])
	})

	await check('the label is the most frequent one (Van x3 beats van x1); a tie goes to the smaller label under < (Tools before tools)', async () => {
		await prepare()
		const stats = await T.listTagStats(db, ws)
		assert.equal(stats.find((s) => s.slug === 'van').label, 'Van')
		assert.equal(stats.find((s) => s.slug === 'tools').label, 'Tools')
	})

	await check('one aggregation does the counting (no per-tag queries)', async () => {
		await prepare()
		const spy = spyDb(db)
		await T.listTagStats(spy, ws)
		assert.equal(spy.events.length, 1)
		assert.equal(spy.events[0].method, 'aggregate')
		const stages = spy.events[0].args[0].map((stage) => Object.keys(stage)[0])
		assert.ok(stages.includes('$unwind') && stages.includes('$group'))
		assert.ok(JSON.stringify(spy.events[0].args[0][0]).includes('workspaceId'), 'the pipeline leads with the workspace')
	})

	for (const [q, expected] of [
		['kit', ['kitchen', 'kitchen-remodel']],
		['KITCHEN', ['kitchen', 'kitchen-remodel']],
		['  kit  ', ['kitchen', 'kitchen-remodel']],
		['kitchen rem', ['kitchen-remodel']],
		['kitchen-rem', ['kitchen-remodel']],
		['van', ['van', 'caravan', 'work-van']], // prefix first, then contains (count desc, label)
		['remodel', ['kitchen-remodel']], // contains
		['Kîtchen', ['kitchen', 'kitchen-remodel']], // accent folded
		['kithcen', ['kitchen', 'kitchen-remodel']], // typo: only because nothing else matched
		['kitchn', ['kitchen', 'kitchen-remodel']],
		['bathrom', ['bathroom']],
		['trucks', []], // nothing close
		['zzzzzz', []],
		['ka', []], // too short for a typo
		['', null],
		['   ', null],
		['!!!', null],
	])
		await check(`q ${JSON.stringify(q)} -> ${expected ? JSON.stringify(expected) : 'everything (unfiltered)'}`, async () => {
			await prepare()
			const out = await T.listTagStats(db, ws, { q })
			assert.deepEqual(out.map((s) => s.slug), expected ?? expectedAll.map((s) => s.slug))
		})

	await check('q matches the label as well as the slug (they can differ for tags written by other code)', async () => {
		const wsx = newWs()
		await seed(wsx, { tags: [{ slug: 'x1', label: 'Pantry', source: 'manual' }] }, { tags: [manual('shelf', 'Shelf')] })
		assert.deepEqual((await T.listTagStats(db, wsx, { q: 'pant' })).map((s) => s.slug), ['x1'], 'by label prefix')
		assert.deepEqual((await T.listTagStats(db, wsx, { q: 'ntry' })).map((s) => s.slug), ['x1'], 'by label contents')
		assert.deepEqual((await T.listTagStats(db, wsx, { q: 'x1' })).map((s) => s.slug), ['x1'], 'by slug')
		assert.deepEqual((await T.listTagStats(db, wsx, { q: 'elf' })).map((s) => s.slug), ['shelf'])
	})

	await check('a typo is not added next to real matches: "van" does not also return "man"-like tags', async () => {
		await prepare()
		const wsx = newWs()
		await seed(wsx, { tags: [manual('van', 'Van')] }, { tags: [manual('man', 'Man')] }, { tags: [manual('fan', 'Fan')] })
		assert.deepEqual((await T.listTagStats(db, wsx, { q: 'van' })).map((s) => s.slug), ['van'])
	})

	await check('hostile q: regex characters and operators are plain text, objects are ignored, a huge q is fast', async () => {
		await prepare()
		for (const q of ['(', '.*', '[a-z]', '\\', '$ne', '{"$gt":""}', '^kit', 'kit$', '\u0000', 'a'.repeat(10_000)]) {
			const started = Date.now()
			const out = await T.listTagStats(db, ws, { q })
			assert.ok(Array.isArray(out))
			assert.ok(Date.now() - started < 5000)
		}
		for (const q of [{ $ne: 1 }, 5, null, [], true]) assert.deepEqual((await T.listTagStats(db, ws, { q })).length, expectedAll.length, JSON.stringify(q))
	})

	await check('limit: honoured, at least 1, junk falls back to the default', async () => {
		await prepare()
		assert.deepEqual((await T.listTagStats(db, ws, { limit: 2 })).map((s) => s.slug), ['kitchen', 'van'])
		for (const limit of [0, -5, 0.4]) assert.equal((await T.listTagStats(db, ws, { limit })).length, 1, String(limit))
		assert.equal((await T.listTagStats(db, ws, { limit: 1.9 })).length, 1)
		for (const limit of [Number.NaN, undefined, '3', null]) assert.equal((await T.listTagStats(db, ws, { limit })).length, 7, String(limit))
		assert.equal((await T.listTagStats(db, ws, { q: 'kit', limit: 1 })).length, 1)
		assert.equal((await T.listTagStats(db, ws, { limit: 5000 })).length, 7)
	})

	await check('limit defaults to 500 and is capped at 2000, over 2,100 distinct tags', async () => {
		const big = newWs()
		await seedMany(big, 2100, (i) => ({ tags: [manual(`tag-${String(i).padStart(4, '0')}`, `Tag ${String(i).padStart(4, '0')}`)] }))
		const defaults = await T.listTagStats(db, big)
		assert.equal(defaults.length, 500)
		assert.equal(defaults[0].slug, 'tag-0000', 'equal counts: label order')
		assert.equal((await T.listTagStats(db, big, { limit: 5000 })).length, 2000)
		assert.equal((await T.listTagStats(db, big, { limit: 3 })).length, 3)
		assert.equal((await T.listTagStats(db, big, { q: 'tag 20' })).length, 100, 'a q filter sees every tag, not just the first page')
	})

	await check('corrupt tag data does not break counting: missing labels, non-string slugs, non-array tags', async () => {
		const wsx = newWs()
		const docs = [
			assetDoc(wsx, { tags: [manual('ok', 'Ok')] }),
			assetDoc(wsx, {}),
			assetDoc(wsx, {}),
			assetDoc(wsx, {}),
			assetDoc(wsx, {}),
		]
		docs[1].tags = [{ slug: 'nolabel', source: 'manual' }, { slug: 5, label: 'Five', source: 'manual' }, null, 'text', { label: 'no slug' }]
		docs[2].tags = 'not an array'
		docs[3].tags = { slug: 'single', label: 'Single', source: 'manual' }
		delete docs[4].tags
		await assetCol.insertMany(docs)
		const stats = await T.listTagStats(db, wsx)
		assert.deepEqual(stats.map((s) => s.slug).sort(), ['nolabel', 'ok'])
		assert.equal(stats.find((s) => s.slug === 'nolabel').label, 'Nolabel')
	})

	await check('topTagLabels: the labels of the most used tags, count order; limit honoured; zero and junk give nothing', async () => {
		await prepare()
		assert.deepEqual(await T.topTagLabels(db, ws, 3), ['Kitchen', 'Van', 'Kitchen remodel'])
		assert.equal((await T.topTagLabels(db, ws, 100)).length, 7)
		for (const limit of [0, -1, Number.NaN, undefined, null, '5']) assert.deepEqual(await T.topTagLabels(db, ws, limit), [], String(limit))
		assert.deepEqual(await T.topTagLabels(db, newWs(), 10), [])
		assert.deepEqual(await T.topTagLabels(db, 'nope', 10), [])
	})

	await check('stats follow edits made through the chokepoint (a person adds, the counts move)', async () => {
		const wsx = newWs()
		const [a, b] = await seed(wsx, { tags: [vision('van', 0.9, 'Van')] }, { tags: [] })
		assert.deepEqual(await T.listTagStats(db, wsx), [stat('van', 'Van', 1, 0, 1)])
		await personAddsTag(db, wsx, a, ['van'], rulesOf())
		await personAddsTag(db, wsx, b, ['Van'], rulesOf())
		assert.deepEqual(await T.listTagStats(db, wsx), [stat('van', 'Van', 2, 2, 0)])
	})
}

/* -------------------------------------------------------------------------- */
/* Database: rename, merge, delete                                            */
/* -------------------------------------------------------------------------- */

async function proveOperations() {
	section('renameTag')

	/** An asset stays exactly as seeded. */
	const untouched = async (doc) => assert.deepEqual(await stored(doc), doc, `asset ${doc._id} was touched`)

	await check('a new name rewrites every asset (source, via and confidence kept), leaves a redirect, bumps rev once and rebuilds terms', async () => {
		const ws = newWs()
		const other = newWs()
		const [r1, r2, r3] = await seed(ws,
			{ tags: [manual('kitchen', 'Kitchen'), vision('cabinets', 0.8, 'Cabinets')] },
			{ tags: [vision('kitchen', 0.9, 'Kitchen')] },
			{ tags: [manual('bath', 'Bath')] })
		const [o1] = await seed(other, { tags: [manual('kitchen', 'Kitchen')] })
		const result = await T.renameTag(db, ws, 'kitchen', 'Galley')
		assert.deepEqual(result, { affected: 2, slug: 'galley', merged: false })
		const a1 = await stored(r1)
		assert.deepEqual(a1.tags, [manual('galley', 'Galley'), vision('cabinets', 0.8, 'Cabinets')])
		assert.equal(a1.rev, 1)
		assert.ok(a1.terms.includes('galley') && !a1.terms.includes('kitchen'))
		const a2 = await stored(r2)
		assert.deepEqual(a2.tags, [vision('galley', 0.9, 'Galley')])
		assert.equal(a2.rev, 1)
		await untouched(r3)
		await untouched(o1)
		await assertSynced(ws)
		assert.deepEqual(await ruleMap(ws), { kitchen: 'galley' })
		assert.deepEqual((await rulesDocs(ws))[0].to, { slug: 'galley', label: 'Galley' })
		assert.deepEqual(await rulesDocs(other), [])
	})

	await check('into an existing slug it is a merge: merged true, the existing label wins over the typed one, manual beats automatic', async () => {
		const ws = newWs()
		const [r1, r2, r3, r4] = await seed(ws,
			{ tags: [manual('kitchen', 'Kitchen'), vision('cabinets', 0.8, 'Cabinets')] },
			{ tags: [vision('kitchen', 0.9, 'Kitchen')] },
			{ tags: [vision('cabinets', 0.7, 'Cabinets')] },
			{ tags: [manual('cabinets', 'cabinets')] })
		const result = await T.renameTag(db, ws, 'kitchen', 'CABINETS')
		assert.deepEqual(result, { affected: 2, slug: 'cabinets', merged: true })
		assert.deepEqual((await stored(r1)).tags, [manual('cabinets', 'Cabinets')], 'one tag, manual, the existing label')
		assert.deepEqual((await stored(r2)).tags, [vision('cabinets', 0.9, 'Cabinets')])
		await untouched(r3)
		await untouched(r4)
		assert.deepEqual((await rulesDocs(ws))[0].to, { slug: 'cabinets', label: 'Cabinets' })
		await assertSynced(ws)
	})

	await check('a rename that keeps the slug only relabels: no rule, merged false, assets already right are not touched; the second run is a no-op', async () => {
		const ws = newWs()
		const [a, b, c] = await seed(ws,
			{ tags: [manual('kitchen', 'Kitchen')] },
			{ tags: [vision('kitchen', 0.9, 'Kitchen')] },
			{ tags: [manual('kitchen', 'KITCHEN')] })
		const result = await T.renameTag(db, ws, 'kitchen', 'KITCHEN')
		assert.deepEqual(result, { affected: 2, slug: 'kitchen', merged: false })
		assert.deepEqual((await stored(a)).tags, [manual('kitchen', 'KITCHEN')])
		assert.deepEqual((await stored(b)).tags, [vision('kitchen', 0.9, 'KITCHEN')])
		await untouched(c)
		assert.deepEqual(await rulesDocs(ws), [], 'a label-only rename writes no rule')
		const before = await snapshot(ws)
		assert.deepEqual(await T.renameTag(db, ws, 'kitchen', 'KITCHEN'), { affected: 0, slug: 'kitchen', merged: false })
		assert.deepEqual(await snapshot(ws), before)
		assert.deepEqual((await T.renameTag(db, ws, 'kitchen', 'Kitchen!')).slug, 'kitchen', 'punctuation does not change the slug')
		assert.ok((await assetsOf(ws)).every((d) => d.tags[0].label === 'Kitchen!'))
	})

	await check('a relabel finds only the assets that still need it: 250 already-correct assets must not starve the 10 that do not', async () => {
		const ws = newWs()
		await seedMany(ws, 250, () => ({ tags: [manual('kitchen', 'KITCHEN')] }))
		await seedMany(ws, 10, () => ({ tags: [manual('kitchen', 'Kitchen')] }))
		const result = await T.renameTag(db, ws, 'kitchen', 'KITCHEN')
		assert.deepEqual(result, { affected: 10, slug: 'kitchen', merged: false })
		const all = await assetsOf(ws)
		assert.ok(all.every((d) => d.tags[0].label === 'KITCHEN'))
		assert.equal(all.filter((d) => d.rev === 1).length, 10, 'only the ones that needed it were written')
	})

	await check('an invalid label or slug is a 400 and nothing is written', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('kitchen', 'Kitchen')] })
		const before = await snapshot(ws)
		for (const label of ['', '   ', '!!!', '😀', '\u200b', null, undefined, 5, {}, ['a']])
			await expectMediaError(() => T.renameTag(db, ws, 'kitchen', label), 400, JSON.stringify(label))
		for (const slug of ['', '!!!', null, undefined, 5, {}, '😀'])
			await expectMediaError(() => T.renameTag(db, ws, slug, 'Fine'), 400, JSON.stringify(slug))
		await expectMediaError(() => T.renameTag(db, 'nope', 'kitchen', 'Fine'), 404)
		assert.deepEqual(await snapshot(ws), before)
	})

	await check('running it twice is a no-op the second time (same assets, same rules, no extra revision)', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('kitchen', 'Kitchen')] }, { tags: [vision('kitchen', 0.9, 'Kitchen')] })
		await T.renameTag(db, ws, 'kitchen', 'Galley')
		const before = await snapshot(ws)
		const second = await T.renameTag(db, ws, 'kitchen', 'Galley')
		assert.equal(second.affected, 0)
		assert.deepEqual(await snapshot(ws), before)
	})

	await check('renaming a tag nobody carries writes the redirect and rewrites nothing (zero assets is not an error)', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('other', 'Other')] })
		assert.deepEqual(await T.renameTag(db, ws, 'ghost', 'Spirit'), { affected: 0, slug: 'spirit', merged: false })
		assert.deepEqual(await ruleMap(ws), { ghost: 'spirit' })
	})

	await check('rename a->b then b->c: assets end on c, the rules are a->c and b->c', async () => {
		const ws = newWs()
		const [x, y] = await seed(ws, { tags: [manual('a', 'A')] }, { tags: [manual('b', 'B')] })
		await T.renameTag(db, ws, 'a', 'B')
		assert.deepEqual(slugs((await stored(x)).tags), ['b'])
		await T.renameTag(db, ws, 'b', 'C')
		assert.deepEqual(slugs((await stored(x)).tags), ['c'])
		assert.deepEqual(slugs((await stored(y)).tags), ['c'])
		assert.deepEqual(await ruleMap(ws), { a: 'c', b: 'c' })
		await assertSynced(ws)
	})

	await check('rename b->a after a->b: the tag comes back, no cycle, assets follow', async () => {
		const ws = newWs()
		const [x] = await seed(ws, { tags: [manual('a', 'A')] })
		await T.renameTag(db, ws, 'a', 'B')
		await T.renameTag(db, ws, 'b', 'A')
		assert.deepEqual((await stored(x)).tags, [manual('a', 'A')])
		assert.deepEqual(await ruleMap(ws), { b: 'a' })
	})

	await check('renaming onto a name that was deleted brings the tag back (the block is lifted)', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('old', 'Old')] }, { tags: [manual('gone', 'Gone')] })
		await T.deleteTag(db, ws, 'gone')
		assert.deepEqual(await ruleMap(ws), { gone: null })
		await T.renameTag(db, ws, 'old', 'Gone')
		assert.deepEqual(await ruleMap(ws), { old: 'gone' })
		assert.ok((await assetsOf(ws)).some((d) => d.tags.some((t) => t.slug === 'gone')))
	})

	await check('more than one batch: 450 assets are rewritten in batches of 200 until none remain', async () => {
		const ws = newWs()
		await seedMany(ws, 450, (i) => ({ tags: [manual('kitchen', 'Kitchen')], caption: `c${i}` }))
		const spy = spyDb(db)
		const result = await T.renameTag(spy, ws, 'kitchen', 'Galley')
		assert.deepEqual(result, { affected: 450, slug: 'galley', merged: false })
		assert.deepEqual(callsOf(spy, 'mediaAssets', 'bulkWrite').map((e) => e.args[0].length), [200, 200, 50])
		assert.ok((await assetsOf(ws)).every((d) => d.tags.length === 1 && d.tags[0].slug === 'galley' && d.rev === 1))
		await assertSynced(ws)
	})

	await check('the vocabulary is invalidated: the new word is found and the old one is gone', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('kitchen', 'Kitchen')] })
		const before = await V.loadVocabulary(db, ws)
		assert.ok(before.has('kitchen'))
		await T.renameTag(db, ws, 'kitchen', 'Galley')
		const after = await V.loadVocabulary(db, ws)
		assert.notEqual(after, before)
		assert.ok(after.has('galley') && !after.has('kitchen'))
	})

	await check('crash between the rule write and the asset rewrite: the rule is there, the assets are not rewritten, and a retry finishes the job', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 5 }, () => ({ tags: [manual('kitchen', 'Kitchen')] })))
		const crashing = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'find', 1)) throw new Error('simulated crash')
		})
		const error = await T.renameTag(crashing, ws, 'kitchen', 'Galley').then(() => null, (e) => e)
		assert.equal(error.message, 'simulated crash')
		assert.deepEqual(await ruleMap(ws), { kitchen: 'galley' }, 'the rule came first')
		for (const doc of docs) assert.deepEqual((await stored(doc)).tags, [manual('kitchen', 'Kitchen')], 'nothing rewritten yet')
		const retried = await T.renameTag(db, ws, 'kitchen', 'Galley')
		assert.equal(retried.affected, 5)
		assert.ok((await assetsOf(ws)).every((d) => d.tags[0].slug === 'galley' && d.rev === 1))
		await assertSynced(ws)
	})

	await check('crash half way (second batch): the first 200 are done, a retry rewrites exactly the other 50', async () => {
		const ws = newWs()
		await seedMany(ws, 250, () => ({ tags: [manual('kitchen', 'Kitchen')] }))
		const crashing = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'bulkWrite', 2)) throw new Error('simulated crash')
		})
		await T.renameTag(crashing, ws, 'kitchen', 'Galley').then(() => assert.fail('should have crashed'), (e) => assert.equal(e.message, 'simulated crash'))
		const mid = await assetsOf(ws)
		assert.equal(mid.filter((d) => d.tags[0].slug === 'galley').length, 200)
		assert.equal(mid.filter((d) => d.tags[0].slug === 'kitchen').length, 50)
		const retried = await T.renameTag(db, ws, 'kitchen', 'Galley')
		assert.equal(retried.affected, 50)
		assert.ok((await assetsOf(ws)).every((d) => d.tags[0].slug === 'galley' && d.rev === 1), 'every asset rewritten exactly once')
	})

	await check('a rename that cannot make progress (everything keeps changing) ends with a 409 instead of looping', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 3 }, () => ({ tags: [manual('kitchen', 'Kitchen')] })))
		const busy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaAssets' && ev.method === 'bulkWrite' && ev.phase === 'before') for (const doc of docs) await foreign(doc, { altText: `foreign ${ev.n}` })
		})
		const started = Date.now()
		const error = await expectMediaError(() => T.renameTag(busy, ws, 'kitchen', 'Galley'), 409)
		assert.equal(error.message, 'Some images changed while saving. Try again.')
		assert.ok(Date.now() - started < 30_000)
		assert.deepEqual(await ruleMap(ws), { kitchen: 'galley' }, 'the rule stays, so a retry resumes')
	})

	/* ---------------------------------------------------------------------- */
	section('mergeTag')

	await check('folds A into B everywhere: manual beats auto, the more confident auto wins, B keeps its label, a rejected B is un-rejected, assets without A are untouched', async () => {
		const ws = newWs()
		const [m1, m2, m3, m4, m5, m6, m7] = await seed(ws,
			{ tags: [manual('a', 'A'), vision('b', 0.8, 'Bee')] },
			{ tags: [vision('a', 0.7, 'A'), manual('b', 'Bee')] },
			{ tags: [vision('a', 0.9, 'A'), vision('b', 0.6, 'Bee')] },
			{ tags: [vision('a', 0.5, 'A'), vision('b', 0.65, 'Bee')] },
			{ tags: [fname('a', 'A')], rejectedTags: ['b', 'zzz'] },
			{ tags: [manual('b', 'Bee')] },
			{ tags: [manual('other', 'Other')] })
		const result = await T.mergeTag(db, ws, 'a', 'b')
		assert.deepEqual(result, { affected: 5 })
		assert.deepEqual((await stored(m1)).tags, [manual('b', 'Bee')])
		assert.deepEqual((await stored(m2)).tags, [manual('b', 'Bee')])
		assert.deepEqual((await stored(m3)).tags, [vision('b', 0.9, 'Bee')], 'the more confident automatic tag')
		assert.deepEqual((await stored(m4)).tags, [vision('b', 0.65, 'Bee')])
		const a5 = await stored(m5)
		assert.deepEqual(a5.tags, [fname('b', 'Bee')], 'the source tag keeps its kind and takes the target label')
		assert.deepEqual(a5.rejectedTags, ['zzz'], 'the asset now carries b on purpose')
		await untouched(m6)
		await untouched(m7)
		assert.deepEqual(await ruleMap(ws), { a: 'b' })
		await assertSynced(ws)
	})

	await check('a self-merge writes nothing at all', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('a', 'A')] })
		const spy = spyDb(db)
		assert.deepEqual(await T.mergeTag(spy, ws, 'a', 'a'), { affected: 0 })
		assert.deepEqual(await T.mergeTag(spy, ws, 'A', ' a '), { affected: 0 }, 'the same slug spelled differently')
		assert.equal(writesOf(spy).length, 0)
		assert.deepEqual(await rulesDocs(ws), [])
	})

	await check('the target may not exist anywhere: it is created with a label derived from its slug', async () => {
		const ws = newWs()
		const [a] = await seed(ws, { tags: [manual('a', 'A')] })
		assert.deepEqual(await T.mergeTag(db, ws, 'a', 'brand-new'), { affected: 1 })
		assert.deepEqual((await stored(a)).tags, [manual('brand-new', 'Brand new')])
		assert.deepEqual((await rulesDocs(ws))[0].to, { slug: 'brand-new', label: 'Brand new' })
	})

	await check('the target label can come from a rule when no asset carries the target', async () => {
		const ws = newWs()
		const [a] = await seed(ws, { tags: [manual('a', 'A')] })
		await T.writeRule(db, ws, 'x', redirect('truck', 'Pickup Truck'))
		await T.mergeTag(db, ws, 'a', 'truck')
		assert.deepEqual((await stored(a)).tags, [manual('truck', 'Pickup Truck')])
	})

	await check('typed labels work as slugs ("Work Van" -> work-van), and invalid slugs are a 400 with nothing written', async () => {
		const ws = newWs()
		const [a] = await seed(ws, { tags: [manual('vans', 'Vans')] }, { tags: [manual('work-van', 'Work van')] })
		assert.deepEqual(await T.mergeTag(db, ws, 'Vans', 'Work Van'), { affected: 1 })
		assert.deepEqual((await stored(a)).tags, [manual('work-van', 'Work van')])
		const before = await snapshot(ws)
		for (const [from, into] of [['', 'b'], ['a', '!!!'], [null, 'b'], ['a', undefined], [{ $ne: 1 }, 'b'], ['a', 5]])
			await expectMediaError(() => T.mergeTag(db, ws, from, into), 400, JSON.stringify([from, into]))
		await expectMediaError(() => T.mergeTag(db, null, 'a', 'b'), 404)
		assert.deepEqual(await snapshot(ws), before)
	})

	await check('merge a->b then b->c: assets follow to c; rules a->c and b->c', async () => {
		const ws = newWs()
		const [x, y] = await seed(ws, { tags: [manual('a', 'A')] }, { tags: [manual('b', 'B')] })
		await T.mergeTag(db, ws, 'a', 'b')
		await T.mergeTag(db, ws, 'b', 'c')
		assert.deepEqual(slugs((await stored(x)).tags), ['c'])
		assert.deepEqual(slugs((await stored(y)).tags), ['c'])
		assert.deepEqual(await ruleMap(ws), { a: 'c', b: 'c' })
		assert.deepEqual((await T.listTagStats(db, ws)).map((s) => [s.slug, s.count]), [['c', 2]])
	})

	await check('merging into a deleted (blocked) tag lifts the block', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('a', 'A')] }, { tags: [manual('b', 'B')] })
		await T.deleteTag(db, ws, 'b')
		assert.deepEqual(await ruleMap(ws), { b: null })
		await T.mergeTag(db, ws, 'a', 'b')
		assert.deepEqual(await ruleMap(ws), { a: 'b' })
	})

	await check('running it twice is a no-op the second time', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('a', 'A')] }, { tags: [vision('a', 0.9, 'A'), manual('b', 'B')] })
		await T.mergeTag(db, ws, 'a', 'b')
		const before = await snapshot(ws)
		assert.deepEqual(await T.mergeTag(db, ws, 'a', 'b'), { affected: 0 })
		assert.deepEqual(await snapshot(ws), before)
	})

	await check('crash between the rule and the rewrite is finished by a retry (merge)', async () => {
		const ws = newWs()
		await seed(ws, ...Array.from({ length: 4 }, () => ({ tags: [manual('a', 'A')] })), { tags: [manual('b', 'B')] })
		const crashing = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'bulkWrite', 1)) throw new Error('simulated crash')
		})
		await T.mergeTag(crashing, ws, 'a', 'b').then(() => assert.fail('should have crashed'), (e) => assert.equal(e.message, 'simulated crash'))
		assert.deepEqual(await ruleMap(ws), { a: 'b' })
		assert.equal((await assetsOf(ws)).filter((d) => d.tags.some((t) => t.slug === 'a')).length, 4)
		assert.deepEqual(await T.mergeTag(db, ws, 'a', 'b'), { affected: 4 })
		assert.ok((await assetsOf(ws)).every((d) => slugs(d.tags).join() === 'b'))
	})

	/* ---------------------------------------------------------------------- */
	section('deleteTag')

	await check('removes the tag from every asset, leaves a block rule, fills rejectedTags, rebuilds terms; other assets and workspaces are untouched', async () => {
		const ws = newWs()
		const other = newWs()
		const [d1, d2, d3] = await seed(ws,
			{ tags: [manual('kitchen', 'Kitchen'), vision('van', 0.9, 'Van')], rejectedTags: ['old'] },
			{ tags: [vision('kitchen', 0.7, 'Kitchen')] },
			{ tags: [manual('bath', 'Bath')] })
		const [o1] = await seed(other, { tags: [manual('kitchen', 'Kitchen')] })
		assert.deepEqual(await T.deleteTag(db, ws, 'kitchen'), { affected: 2 })
		const a1 = await stored(d1)
		assert.deepEqual(a1.tags, [vision('van', 0.9, 'Van')])
		assert.deepEqual(a1.rejectedTags, ['old', 'kitchen'])
		assert.equal(a1.rev, 1)
		assert.ok(!a1.terms.includes('kitchen'))
		const a2 = await stored(d2)
		assert.deepEqual(a2.tags, [])
		assert.deepEqual(a2.rejectedTags, ['kitchen'])
		await untouched(d3)
		await untouched(o1)
		assert.deepEqual(await ruleMap(ws), { kitchen: null })
		assert.equal((await rulesDocs(ws))[0].to, null)
		assert.deepEqual(await rulesDocs(other), [])
		await assertSynced(ws)
	})

	await check('rejectedTags is filled through the capped helper: at 200 the oldest is dropped and the new slug is last', async () => {
		const ws = newWs()
		const old = Array.from({ length: 200 }, (_, i) => `r${i}`)
		const [doc] = await seed(ws, { tags: [manual('kitchen', 'Kitchen')], rejectedTags: old })
		await T.deleteTag(db, ws, 'kitchen')
		const after = await stored(doc)
		assert.equal(after.rejectedTags.length, 200)
		assert.equal(after.rejectedTags[0], 'r1')
		assert.equal(after.rejectedTags[199], 'kitchen')
	})

	await check('after a delete the auto-tagger cannot bring the tag back, but a person still can', async () => {
		const ws = newWs()
		const [doc] = await seed(ws, { tags: [manual('kitchen', 'Kitchen')] })
		await T.deleteTag(db, ws, 'kitchen')
		const rules = await T.loadTagRules(db, ws)
		const proposal = [{ label: 'Kitchen', confidence: 0.99 }]
		assert.deepEqual(T.mergeAutoTags([], [], proposal, 'vision', rules), [], 'a block applies to assets that never rejected it')
		assert.deepEqual(T.mergeAutoTags([], [], [{ label: 'kitchen' }], 'filename', rules), [])
		const person = T.applyManualTags([], [], ['Kitchen'], rules)
		assert.deepEqual(person.tags, [manual('kitchen', 'Kitchen')])
		const back = await C.commitAsset(db, ws, doc._id, (d) => {
			const r = T.applyManualTags(d.tags, d.rejectedTags, ['Kitchen'], rules)
			return { tags: r.tags, rejectedTags: r.rejected }
		})
		assert.deepEqual(back.tags, [manual('kitchen', 'Kitchen')])
		assert.deepEqual(back.rejectedTags, [], 'adding it by hand un-rejects it')
	})

	await check('a redirect that pointed at the deleted tag becomes a block too (a->b, then delete b: a and b are both blocked)', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('b', 'B')] })
		await T.writeRule(db, ws, 'a', redirect('b', 'B'))
		await T.deleteTag(db, ws, 'b')
		assert.deepEqual(await ruleMap(ws), { a: null, b: null })
	})

	await check('deleting a tag nobody carries still leaves the block (zero assets is not an error)', async () => {
		const ws = newWs()
		assert.deepEqual(await T.deleteTag(db, ws, 'ghost'), { affected: 0 })
		assert.deepEqual(await ruleMap(ws), { ghost: null })
	})

	await check('running it twice is a no-op the second time (same assets, same rules, no extra revision, rejected list not reshuffled)', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('kitchen', 'Kitchen')], rejectedTags: ['a', 'b'] }, { tags: [vision('kitchen', 0.9, 'Kitchen')] })
		await T.deleteTag(db, ws, 'kitchen')
		const before = await snapshot(ws)
		assert.deepEqual(await T.deleteTag(db, ws, 'kitchen'), { affected: 0 })
		assert.deepEqual(await snapshot(ws), before)
	})

	await check('invalid slugs are a 400 and write nothing; a bad workspace is a 404', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('kitchen', 'Kitchen')] })
		const before = await snapshot(ws)
		for (const slug of ['', '   ', '!!!', null, undefined, 5, {}, ['a'], '😀'])
			await expectMediaError(() => T.deleteTag(db, ws, slug), 400, JSON.stringify(slug))
		await expectMediaError(() => T.deleteTag(db, undefined, 'kitchen'), 404)
		assert.deepEqual(await snapshot(ws), before)
	})

	await check('the vocabulary is invalidated by a delete', async () => {
		const ws = newWs()
		await seed(ws, { tags: [manual('zebra', 'Zebra')] })
		const before = await V.loadVocabulary(db, ws)
		assert.ok(before.has('zebra'))
		await T.deleteTag(db, ws, 'zebra')
		const after = await V.loadVocabulary(db, ws)
		assert.notEqual(after, before)
		assert.ok(!after.has('zebra'))
	})

	await check('crash between the rule and the rewrite is finished by a retry (delete)', async () => {
		const ws = newWs()
		await seed(ws, ...Array.from({ length: 5 }, () => ({ tags: [manual('kitchen', 'Kitchen')] })))
		const crashing = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'find', 2)) throw new Error('simulated crash')
		})
		await T.deleteTag(crashing, ws, 'kitchen').then(() => assert.fail('should have crashed'), (e) => assert.equal(e.message, 'simulated crash'))
		assert.deepEqual(await ruleMap(ws), { kitchen: null }, 'the block was written first')
		assert.equal((await assetsOf(ws)).filter((d) => d.tags.length === 1).length, 5)
		assert.deepEqual(await T.deleteTag(db, ws, 'kitchen'), { affected: 5 })
		assert.ok((await assetsOf(ws)).every((d) => d.tags.length === 0 && d.rejectedTags.join() === 'kitchen'))
	})

	await check('two deletes of the same tag at once: every asset is rewritten exactly once between them', async () => {
		const ws = newWs()
		await seedMany(ws, 300, () => ({ tags: [manual('kitchen', 'Kitchen'), manual('keep', 'Keep')] }))
		const results = await Promise.all([T.deleteTag(db, ws, 'kitchen'), T.deleteTag(db, ws, 'kitchen')])
		assert.equal(results[0].affected + results[1].affected, 300)
		const all = await assetsOf(ws)
		assert.ok(all.every((d) => slugs(d.tags).join() === 'keep' && d.rev === 1 && d.rejectedTags.join() === 'kitchen'))
		await assertSynced(ws)
	})

	await check('real concurrency: a delete over 80 assets while 80 people add a tag to the same assets - no edit and no delete is lost', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 80 }, () => ({ tags: [manual('kitchen', 'Kitchen')] })))
		await Promise.all([T.deleteTag(db, ws, 'kitchen'), ...docs.map((doc, i) => personAddsTag(db, ws, doc, [`Own ${i}`], rulesOf()))])
		for (const [i, doc] of docs.entries()) {
			const after = await stored(doc)
			assert.deepEqual(slugs(after.tags), [`own-${i}`], `asset ${i}`)
			assert.deepEqual(after.rejectedTags, ['kitchen'])
			assert.deepEqual(after.terms, derivedFields(after).terms)
		}
	})

	await check('a rename racing a person adding the old tag: the person\'s tag is not lost (it is renamed or already new)', async () => {
		const ws = newWs()
		const docs = await seed(ws, ...Array.from({ length: 40 }, () => ({ tags: [manual('other', 'Other')] })))
		await Promise.all([
			T.renameTag(db, ws, 'kitchen', 'Galley'),
			...docs.map((doc) => personAddsTag(db, ws, doc, ['Kitchen'], rulesOf())),
		])
		// A "Kitchen" add that landed before the rewrite was renamed; one that landed after the rule
		// was written was added with the old slug by a person who had not loaded the rule yet.
		for (const doc of docs) {
			const after = await stored(doc)
			assert.ok(after.tags.some((t) => t.slug === 'other'), 'the other tag is intact')
			assert.ok(after.tags.length === 2 && after.tags.some((t) => t.slug === 'galley' || t.slug === 'kitchen'), `the added tag survived on ${doc._id}`)
		}
		// Whatever is left under the old name is picked up by running the operation again.
		await T.renameTag(db, ws, 'kitchen', 'Galley')
		for (const doc of docs) assert.deepEqual(slugs((await stored(doc)).tags).sort(), ['galley', 'other'])
	})
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

async function main() {
	await provePure()

	if (!client) {
		failed++
		console.log('\nFAIL  database sections (MONGODB_URI is not set. Run with: node --env-file=.env scripts/prove-media-tags.mjs)')
		return
	}
	await client.connect()
	db = client.db()
	assetCol = db.collection('mediaAssets')
	ruleCol = db.collection('mediaTagRules')

	await proveCommitAsset()
	await proveCommitMany()
	await proveRules()
	await proveStats()
	await proveOperations()
}

try {
	await main()
} catch (error) {
	failed++
	console.log(`FAIL  harness (${error && error.stack ? error.stack.split('\n').slice(0, 5).join(' | ') : error})`)
} finally {
	try {
		if (db) {
			// Only documents carrying this run's workspace ids, only the two media collections.
			const assets = await db.collection('mediaAssets').deleteMany({ workspaceId: { $in: workspaces } })
			const rules = await db.collection('mediaTagRules').deleteMany({ workspaceId: { $in: workspaces } })
			const left =
				(await db.collection('mediaAssets').countDocuments({ workspaceId: { $in: workspaces } })) +
				(await db.collection('mediaTagRules').countDocuments({ workspaceId: { $in: workspaces } }))
			console.log(`\ncleanup: removed ${assets.deletedCount} assets and ${rules.deletedCount} rules across ${workspaces.length} workspaces; ${left} left`)
			if (left) failed++
		}
	} catch (error) {
		failed++
		console.log(`FAIL  cleanup (${error})`)
	}
	await client?.close().catch(() => {})
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
