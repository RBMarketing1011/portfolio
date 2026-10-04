/**
 * Proves src/lib/media/query/parse.ts: the search language parser, the chip
 * editing helpers and the relaxation helpers.
 *
 *   node scripts/prove-media-query.mjs
 *
 * Expectations come from the build spec, the stub's doc comment and the language
 * table in query/types.ts, not from whatever the parser printed. Where those leave
 * a judgement call (the label wording, calendar vs rolling `added:week`, what a
 * top-level OR chip covers) the parser's header comment names the choice and the
 * test says so. Pure: no database, no network. Dates run against a fixed `now`.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const { loadTs } = require('./lib/load-ts.cjs')

const parse = loadTs('src/lib/media/query/parse.ts')
const types = loadTs('src/lib/media/types.ts')
const qtypes = loadTs('src/lib/media/query/types.ts')
const colors = loadTs('src/lib/media/colors.ts')
const { STOPWORDS } = loadTs('src/lib/media/text.ts')
/** Removing the last real text can bring dropped stopwords back (the "no text at all" rule), so compare without them. */
const real = (list) => list.filter((clause) => !STOPWORDS.has(clause.replace(/^-/, '')))
const {
	parseQuery,
	removeClause,
	removeClauseValue,
	addClause,
	relaxableTerms,
	dropTerms,
} = parse
const { MEDIA_LIMITS, MEDIA_FORMATS, MEDIA_ORIENTATIONS, MEDIA_KINDS, MEDIA_SORTS } = types
const { IS_FLAGS, QUERY_FIELDS, toParsedQueryDTO } = qtypes

let passed = 0
let failed = 0
let assertions = 0

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

/** deepStrictEqual with a label, counted as one assertion. */
function eq(actual, expected, label = '') {
	assertions++
	try {
		assert.deepStrictEqual(actual, expected)
	} catch {
		throw new Error(
			`${label ? `${label}: ` : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		)
	}
}

function ok(condition, message) {
	assertions++
	if (!condition) throw new Error(message)
}

const NOW = new Date('2026-03-15T10:30:00.000Z') // a Sunday
const DAY = 86_400_000
const utc = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => Date.UTC(y, m - 1, d, h, mi, s, ms)

const P = (q, now = NOW) => parseQuery(q, { now })

/* ---- AST builders (offsets stripped) ------------------------------------ */

const strip = (node) => {
	if (!node) return node
	const { start, end, ...rest } = node
	if (rest.nodes) rest.nodes = rest.nodes.map(strip)
	if (rest.node) rest.node = strip(rest.node)
	return rest
}
const T = (text, prefix = false) => ({ type: 'term', text, prefix })
const PH = (text, implicit = false) =>
	implicit ? { type: 'phrase', text, implicit: true } : { type: 'phrase', text }
const F = (field, values, extra = {}) => ({ type: 'field', field, values, ...extra })
const AND = (...nodes) => ({ type: 'and', nodes })
const OR = (...nodes) => ({ type: 'or', nodes })
const NOT = (node) => ({ type: 'not', node })
const astOf = (q, now) => strip(P(q, now).ast)
const slices = (q) => P(q).chips.map((chip) => q.slice(chip.start, chip.end))
const clauses = (q) => P(q).chips.map((chip) => chip.clause)
const warns = (q) => P(q).warnings
const cmpOf = (q, now) => P(q, now).ast.cmp

/** And/or/not levels. */
const depth = (node) => {
	if (!node) return 0
	if (node.nodes) return 1 + Math.max(0, ...node.nodes.map(depth))
	if (node.type === 'not') return 1 + depth(node.node)
	return 0
}

/** Seeded PRNG so a failing fuzz case reproduces. */
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
/* Basics                                                                     */
/* -------------------------------------------------------------------------- */

check('empty and whitespace-only input hold no clause', () => {
	for (const q of ['', ' ', '   ', '\t\n ']) {
		const r = P(q)
		eq(r.ast, null, JSON.stringify(q))
		eq(r.chips, [])
		eq(r.warnings, [])
		eq(r.sort, null)
		eq(r.hasText, false)
		eq(r.raw, q)
	}
})

check('non-string input never throws', () => {
	for (const value of [undefined, null, 0, 42, {}, [], true, Symbol.iterator]) {
		const r = parseQuery(value)
		eq(r.ast, null)
		eq(r.chips, [])
	}
	ok(parseQuery('kitchen', { now: new Date('nope') }).ast !== null, 'invalid now falls back')
	ok(parseQuery('added:7d', { now: undefined }).ast !== null, 'default now')
})

check('words become terms: lowercase, implicit AND, no stemming at parse time', () => {
	eq(astOf('kitchen'), T('kitchen'))
	eq(astOf('Kitchen REMODEL'), AND(T('kitchen'), T('remodel')))
	eq(astOf('remodeling sinks'), AND(T('remodeling'), T('sinks')))
	eq(astOf('  kitchen   blue  '), AND(T('kitchen'), T('blue')))
})

check('term node offsets point at the word', () => {
	const r = P('kitchen  blue')
	eq([r.ast.nodes[0].start, r.ast.nodes[0].end], [0, 7])
	eq([r.ast.nodes[1].start, r.ast.nodes[1].end], [9, 13])
})

check('the DTO projection carries chips, warnings, sort and hasText', () => {
	const dto = toParsedQueryDTO(P('kitchen sort:newest type:xyz'))
	eq(Object.keys(dto).sort(), ['chips', 'hasText', 'sort', 'warnings'])
	eq(dto.sort, 'newest')
})

/* -------------------------------------------------------------------------- */
/* Operators                                                                  */
/* -------------------------------------------------------------------------- */

check('OR and NOT are operators only in capitals', () => {
	eq(astOf('kitchen OR bath'), OR(T('kitchen'), T('bath')))
	// lowercase "or" and "and" are stopwords: dropped, so an implicit AND remains
	eq(astOf('kitchen or bath'), AND(T('kitchen'), T('bath')))
	eq(astOf('kitchen Or bath'), AND(T('kitchen'), T('bath')))
	eq(astOf('kitchen and bath'), AND(T('kitchen'), T('bath')))
	// "not" is deliberately not a stopword: it is an ordinary word here
	eq(astOf('kitchen not bath'), AND(T('kitchen'), T('not'), T('bath')))
	eq(astOf('kitchen NOT bath'), AND(T('kitchen'), NOT(T('bath'))))
	eq(astOf('kitchen Not bath'), AND(T('kitchen'), T('not'), T('bath')))
})

check('field names and enumerated values are case-insensitive', () => {
	eq(astOf('TAG:Kitchen'), F('tag', ['kitchen']))
	eq(astOf('Type:PNG'), F('type', ['png']))
	eq(astOf('COLOR:BLUE'), F('color', ['blue']))
	eq(astOf('Is:Unreviewed'), F('is', ['unreviewed']))
})

check('precedence NOT > AND > OR', () => {
	eq(astOf('kitchen OR bath blue'), OR(T('kitchen'), AND(T('bath'), T('blue'))))
	eq(astOf('kitchen bath OR blue'), OR(AND(T('kitchen'), T('bath')), T('blue')))
	eq(astOf('NOT kitchen bath'), AND(NOT(T('kitchen')), T('bath')))
	eq(astOf('NOT kitchen OR bath'), OR(NOT(T('kitchen')), T('bath')))
	eq(astOf('kitchen OR bath OR blue'), OR(T('kitchen'), T('bath'), T('blue')))
	eq(astOf('kitchen sink OR bath tile OR blue'), OR(AND(T('kitchen'), T('sink')), AND(T('bath'), T('tile')), T('blue')))
})

check('grouping, nesting and flattening', () => {
	eq(astOf('(kitchen OR bath) blue'), AND(OR(T('kitchen'), T('bath')), T('blue')))
	eq(astOf('blue (kitchen OR bath)'), AND(T('blue'), OR(T('kitchen'), T('bath'))))
	eq(astOf('((kitchen))'), T('kitchen'))
	eq(astOf('(kitchen)'), T('kitchen'))
	eq(astOf('(kitchen bath) blue'), AND(T('kitchen'), T('bath'), T('blue')), 'and in and flattens')
	eq(astOf('(kitchen OR bath) OR blue'), OR(T('kitchen'), T('bath'), T('blue')), 'or in or flattens')
	eq(astOf('kitchen OR (bath OR (blue OR sink))'), OR(T('kitchen'), T('bath'), T('blue'), T('sink')))
	eq(astOf('((kitchen OR bath) tile) OR blue'), OR(AND(OR(T('kitchen'), T('bath')), T('tile')), T('blue')))
	eq(astOf('(kitchen OR bath) (tile OR blue)'), AND(OR(T('kitchen'), T('bath')), OR(T('tile'), T('blue'))))
	eq(astOf('()'), null)
	eq(astOf('(())'), null)
})

check('every negation form', () => {
	eq(astOf('-people'), NOT(T('people')))
	eq(astOf('NOT people'), NOT(T('people')))
	eq(astOf('-tag:people'), NOT(F('tag', ['people'])))
	eq(astOf('NOT tag:people'), NOT(F('tag', ['people'])))
	eq(astOf('-"before and after"'), NOT(PH('before and after')))
	eq(astOf('NOT "before and after"'), NOT(PH('before and after')))
	eq(astOf('-(kitchen OR bath)'), NOT(OR(T('kitchen'), T('bath'))))
	eq(astOf('NOT (kitchen OR bath)'), NOT(OR(T('kitchen'), T('bath'))))
	eq(astOf('-(kitchen bath)'), NOT(AND(T('kitchen'), T('bath'))))
	eq(astOf('-type:png,jpg'), NOT(F('type', ['png', 'jpg'])))
	eq(astOf('-width:>1200').type, 'not')
	eq(astOf('-kitchen-remodel'), NOT(PH('kitchen remodel', true)))
	eq(astOf('-#people'), NOT(F('tag', ['people'])))
	eq(astOf('NOT NOT people'), T('people'), 'NOT NOT x is x')
	eq(astOf('--people'), T('people'))
	eq(astOf('-NOT people'), T('people'))
	eq(astOf('NOT -people'), T('people'))
	eq(astOf('NOT NOT NOT people'), NOT(T('people')))
	eq(astOf('-(-people)'), T('people'))
	eq(astOf('NOT (NOT (kitchen OR bath))'), OR(T('kitchen'), T('bath')))
})

check('a dash followed by whitespace or the end is ignored', () => {
	eq(astOf('- people'), T('people'))
	eq(astOf('people -'), T('people'))
	eq(astOf('kitchen - bath'), AND(T('kitchen'), T('bath')))
	eq(astOf('-'), null)
	eq(astOf('--'), null)
	eq(astOf('- - -'), null)
	eq(astOf('kitchen -'), T('kitchen'))
})

check('a dash inside a word is not a negation', () => {
	eq(astOf('kitchen-blue'), PH('kitchen blue', true))
	eq(astOf('kitchen -blue'), AND(T('kitchen'), NOT(T('blue'))))
	eq(astOf('(-blue)'), NOT(T('blue')))
	eq(astOf('kitchen (-blue)'), AND(T('kitchen'), NOT(T('blue'))))
})

/* -------------------------------------------------------------------------- */
/* Hyphenated words, prefix, hashtags                                         */
/* -------------------------------------------------------------------------- */

check('hyphen, underscore and dot inside a word make an implicit phrase; one part stays a term', () => {
	eq(astOf('kitchen-remodel'), PH('kitchen remodel', true))
	eq(astOf('t-shirt'), PH('t shirt', true))
	eq(astOf('kitchen_remodel'), PH('kitchen remodel', true))
	eq(astOf('kitchen.remodel'), PH('kitchen remodel', true))
	eq(astOf('kitchen--remodel'), PH('kitchen remodel', true))
	eq(astOf('a.b.c'), PH('a b c', true))
	eq(astOf('3.5'), PH('3 5', true))
	eq(astOf('4k-tv'), PH('4k tv', true))
	eq(astOf('state-of-the-art'), PH('state of the art', true), 'stopwords stay inside a phrase')
	eq(astOf('4k'), T('4k'))
	eq(astOf('h2o'), T('h2o'))
	eq(astOf('iPhone15'), T('iphone15'))
	eq(astOf('kitchen-'), T('kitchen'))
	eq(astOf('kitchen_'), T('kitchen'))
	eq(astOf('Café-Menu'), PH('cafe menu', true))
})

check('a hyphenated word is ONE chip covering the whole token', () => {
	const r = P('kitchen-remodel blue')
	eq(r.chips.length, 2)
	eq([r.chips[0].start, r.chips[0].end, r.chips[0].kind, r.chips[0].clause], [0, 15, 'phrase', 'kitchen-remodel'])
	eq(r.ast.nodes[0].implicit, true)
	eq(P('"kitchen remodel"').ast.implicit, undefined, 'a quoted phrase is not implicit')
})

check('a trailing * makes a term a prefix', () => {
	eq(astOf('kit*'), T('kit', true))
	eq(astOf('kit**'), T('kit', true))
	eq(astOf('kit* chen'), AND(T('kit', true), T('chen')))
	eq(astOf('*'), null)
	eq(astOf('**'), null)
	eq(astOf('the*'), T('the', true), 'a stopword prefix is a prefix, not a stopword')
	eq(astOf('kit*chen'), PH('kit chen', true), 'a star mid-word is just a separator')
	eq(P('kit*').chips[0].clause, 'kit*')
	eq(P('kit*').chips[0].label, 'kit*')
})

check('#tag is tag:tag', () => {
	eq(astOf('#kitchen'), F('tag', ['kitchen']))
	eq(astOf('#Kitchen'), F('tag', ['kitchen']))
	eq(astOf('#kit*'), F('tag', ['kit'], { prefix: true }))
	eq(astOf('#kitchen-remodel'), F('tag', ['kitchen-remodel']))
	eq(astOf('#a,b'), F('tag', ['a', 'b']))
	eq(astOf('#kitchen #bath'), AND(F('tag', ['kitchen']), F('tag', ['bath'])))
	eq(astOf('#'), null)
	eq(astOf('# kitchen'), T('kitchen'))
	eq(astOf('(#kitchen)'), F('tag', ['kitchen']))
	eq(P('#kitchen').chips[0].clause, 'tag:kitchen')
	eq(P('#kitchen').chips[0].field, 'tag')
	eq(astOf('a#b'), PH('a b', true), 'a hash inside a word is a separator')
})

/* -------------------------------------------------------------------------- */
/* Phrases and quoting                                                        */
/* -------------------------------------------------------------------------- */

check('quoted phrases', () => {
	eq(astOf('"before and after"'), PH('before and after'))
	eq(astOf('"Kitchen  Remodel"'), PH('kitchen remodel'))
	eq(astOf('"kitchen"'), PH('kitchen'), 'a quoted single word is an exact phrase, not a fuzzy term')
	eq(astOf('"the"'), PH('the'))
	eq(astOf('"kitchen-remodel"'), PH('kitchen remodel'))
	eq(astOf('"Café"'), PH('cafe'))
	eq(astOf('""'), null)
	eq(astOf('"   "'), null)
	eq(astOf('"a" "b"'), AND(PH('a'), PH('b')))
	eq(astOf('"kitchen blue" sink'), AND(PH('kitchen blue'), T('sink')))
})

check('field values: bare, quoted (colons and spaces allowed), comma lists', () => {
	eq(astOf('tag:kitchen'), F('tag', ['kitchen']))
	eq(astOf('tag:"kitchen remodel"'), F('tag', ['kitchen-remodel']))
	eq(astOf('tag:"kitchen remodel",bath'), F('tag', ['kitchen-remodel', 'bath']))
	eq(astOf('tag:bath,"kitchen remodel"'), F('tag', ['bath', 'kitchen-remodel']))
	eq(astOf('tag:a,b,c'), F('tag', ['a', 'b', 'c']))
	eq(astOf('tag:a,a,A'), F('tag', ['a']), 'duplicates collapse')
	eq(astOf('text:"grand opening"'), F('text', ['grand opening']))
	eq(astOf('text:"open: 9:30 sharp"'), F('text', ['open 9 30 sharp']), 'colons inside quotes')
	eq(astOf('name:"a:b"'), F('name', ['a b']))
	eq(astOf('caption:"van, truck"'), F('caption', ['van truck']), 'a comma inside quotes is not a separator')
	eq(astOf('name:hero'), F('name', ['hero']))
	eq(astOf('name:Hero*'), F('name', ['hero'], { prefix: true }))
	eq(astOf('caption:van'), F('caption', ['van']))
	eq(astOf('name:the'), F('name', ['the']), 'a stopword stays inside a field value')
	eq(astOf('folder:Clients/Acme'), F('folder', ['Clients/Acme']))
	eq(astOf('folder:"Clients/Acme Co"'), F('folder', ['Clients/Acme Co']))
	eq(astOf('folder:none'), F('folder', ['unfiled']))
	eq(astOf('folder:UNFILED'), F('folder', ['unfiled']))
	eq(astOf('folder:/Clients//Acme/'), F('folder', ['Clients/Acme']))
	eq(astOf('tag:a,'), F('tag', ['a']), 'a trailing comma is harmless')
	eq(astOf('tag:,a'), F('tag', ['a']))
	eq(astOf('tag:kitchen blue'), AND(F('tag', ['kitchen']), T('blue')))
})

check('prefix star on tag/name values, including mixed lists', () => {
	eq(astOf('tag:kit*'), F('tag', ['kit'], { prefix: true }))
	eq(astOf('tag:kit*,bat*'), F('tag', ['kit', 'bat'], { prefix: true }))
	eq(astOf('tag:kit*,bath'), OR(F('tag', ['kit'], { prefix: true }), F('tag', ['bath'])), 'mixed list = an OR of the two shapes')
	eq(astOf('tag:"kitchen rem"*'), F('tag', ['kitchen-rem'], { prefix: true }))
	eq(astOf('type:p*').type, 'field', 'a star on an enum value is stripped, not a prefix flag')
	eq(P('tag:kit*,bath').chips.length, 1, 'still one chip')
	eq(P('tag:kit*,bath').chips[0].clause, 'tag:kit*,bath')
	eq(P('tag:kit*,bath').chips[0].values, ['kit', 'bath'])
})

check('empty and unusable values are dropped with a warning', () => {
	for (const q of ['tag:', 'tag:*', 'tag:,', 'tag:""', 'name:', 'type:', 'color:', 'width:', 'added:', 'sort:', 'is:', 'folder:']) {
		const r = P(q)
		eq(r.ast, null, q)
		eq(r.chips, [], q)
		ok(r.warnings.length === 1, `${q} warns once: ${JSON.stringify(r.warnings)}`)
	}
	eq(astOf('tag: kitchen'), T('kitchen'), 'a space after the colon leaves an empty value')
	eq(warns('tag: kitchen').length, 1)
	eq(astOf('tag:!!!'), null, 'a punctuation-only tag is dropped')
	eq(warns('tag:!!!').length, 1)
	eq(astOf('tag:(kitchen)'), T('kitchen'), 'a paren ends an empty value')
})

/* -------------------------------------------------------------------------- */
/* Unknown fields and colons                                                  */
/* -------------------------------------------------------------------------- */

check('unknown alphabetic field: plain text WITH a warning that suggests the closest field', () => {
	let r = P('colour:red')
	eq(strip(r.ast), PH('colour red', true))
	eq(r.warnings.length, 1)
	ok(r.warnings[0].includes('colour') && r.warnings[0].includes('color'), r.warnings[0])
	r = P('tagg:x')
	ok(r.warnings[0].includes('"tag:"'), r.warnings[0])
	r = P('nme:hero')
	ok(r.warnings[0].includes('"name:"'), r.warnings[0])
	r = P('folders:x')
	ok(r.warnings[0].includes('"folder:"'), r.warnings[0])
	r = P('foo:bar')
	eq(r.warnings.length, 1)
	ok(!r.warnings[0].includes('Did you mean'), 'no suggestion when nothing is within distance 2')
	r = P('project:acme')
	ok(r.warnings.length === 1 && !r.warnings[0].includes('Did you mean'), 'there is no project: field')
	eq(strip(r.ast), PH('project acme', true))
	eq(QUERY_FIELDS.includes('project'), false)
	r = P('Colour:Red')
	eq(r.warnings.length, 1)
	r = P('tg:x')
	ok(r.warnings.length === 1 && r.warnings[0].includes('"tag:"'), 'a two-letter typo within distance 1 is suggested')
	r = P('zz:x')
	ok(r.warnings.length === 1 && !r.warnings[0].includes('Did you mean'), 'a two-letter word far from every field has no suggestion')
	r = P('a:b')
	ok(r.warnings.length === 1 && !r.warnings[0].includes('Did you mean'), 'any alphabetic prefix warns, a single letter suggests nothing')
	r = P('colour:"red apple"')
	ok(r.warnings.length === 1 && r.warnings[0].includes('color'), 'quoted value after an unknown field still warns')
})

check('a colon that is not an operator is plain text and NOT warned about', () => {
	for (const q of ['10:30', 'http://x', 'https://example.com/a', '1:2:3', 'x1:y', 'colour:', ':foo', ':', 'a::b', '12:30pm']) {
		eq(warns(q), [], q)
	}
	eq(astOf('10:30'), PH('10 30', true))
	eq(astOf('http://example.com'), PH('http example com', true))
	eq(astOf(':'), null)
	eq(astOf(':foo'), T('foo'))
	eq(astOf('colour:'), T('colour'))
})

/* -------------------------------------------------------------------------- */
/* Enumerations                                                               */
/* -------------------------------------------------------------------------- */

check('type: values, aliases, prefixes, lists', () => {
	for (const format of MEDIA_FORMATS) eq(astOf(`type:${format}`), F('type', [format]), format)
	eq(astOf('type:jpeg'), F('type', ['jpg']))
	eq(astOf('type:JPEG'), F('type', ['jpg']))
	eq(astOf('type:jpe'), F('type', ['jpg']))
	eq(astOf('type:.png'), F('type', ['png']))
	eq(astOf('type:pngs'), F('type', ['png']))
	eq(astOf('type:jp'), F('type', ['jpg']), 'unique prefix')
	eq(astOf('type:we'), F('type', ['webp']))
	eq(astOf('type:av'), F('type', ['avif']))
	eq(astOf('type:g'), F('type', ['gif']))
	eq(astOf('type:p'), F('type', ['png']))
	eq(astOf('type:png,jpg'), F('type', ['png', 'jpg']))
	eq(astOf('type:png,jpeg,JPG,PNG'), F('type', ['png', 'jpg']), 'aliases dedupe')
	eq(astOf('type:png,xyz'), F('type', ['png']), 'a bad value in a list is dropped, the rest kept')
	eq(warns('type:png,xyz'), ['Unknown type "xyz" was ignored.'])
	eq(P('type:xyz').ast, null)
	eq(warns('type:xyz'), ['Unknown type "xyz" was ignored.'], 'the stub wording')
	eq(P('type:xyz').chips, [], 'a dropped clause has no chip')
	eq(warns('type:bmp'), ['Unknown type "bmp" was ignored.'])
})

check('orientation: values, aliases, prefixes, ambiguity', () => {
	for (const o of MEDIA_ORIENTATIONS) eq(astOf(`orientation:${o}`), F('orientation', [o]), o)
	eq(astOf('orientation:LAND'), F('orientation', ['landscape']))
	eq(astOf('orientation:po'), F('orientation', ['portrait']))
	eq(astOf('orientation:pa'), F('orientation', ['panorama']))
	eq(astOf('orientation:sq'), F('orientation', ['square']))
	eq(astOf('orientation:wide'), F('orientation', ['landscape']))
	eq(astOf('orientation:tall'), F('orientation', ['portrait']))
	eq(astOf('orientation:p'), null, 'p is ambiguous (portrait, panorama)')
	eq(warns('orientation:p').length, 1)
	eq(astOf('orientation:diagonal'), null)
	eq(astOf('orientation:landscape,portrait'), F('orientation', ['landscape', 'portrait']))
})

check('kind: values, aliases, prefixes, ambiguity', () => {
	for (const k of MEDIA_KINDS) eq(astOf(`kind:${k}`), F('kind', [k]), k)
	eq(astOf('kind:LOGO'), F('kind', ['logo']))
	eq(astOf('kind:photos'), F('kind', ['photo']))
	eq(astOf('kind:logos'), F('kind', ['logo']))
	eq(astOf('kind:scr'), F('kind', ['screenshot']))
	eq(astOf('kind:ic'), F('kind', ['icon']))
	eq(astOf('kind:photograph'), F('kind', ['photo']))
	eq(astOf('kind:drawing'), F('kind', ['illustration']))
	eq(astOf('kind:i'), null, 'i is ambiguous (icon, illustration)')
	eq(astOf('kind:p'), null, 'p is ambiguous (photo, pattern)')
	eq(warns('kind:p').length, 1)
	eq(astOf('kind:nonsense'), null)
	eq(astOf('kind:logo,icon'), F('kind', ['logo', 'icon']))
})

check('color: names, aliases via resolveColorName, hex, prefixes', () => {
	eq(astOf('color:blue'), F('color', ['blue']))
	eq(astOf('color:BLUE'), F('color', ['blue']))
	eq(astOf('color:grey'), F('color', ['gray']))
	eq(astOf('color:crimson'), F('color', ['red']))
	eq(astOf('color:pur'), F('color', ['purple']))
	eq(astOf('color:#0197f6'), F('color', [colors.nameColor('#0197f6')]))
	eq(colors.nameColor('#0197f6'), 'blue')
	eq(astOf('color:#0197f6'), F('color', ['blue']))
	eq(astOf('color:0197f6'), F('color', ['blue']))
	eq(astOf('color:#fff'), F('color', ['white']))
	eq(astOf('color:#7a4a1e'), F('color', ['brown']))
	eq(astOf('color:"sky blue"'), F('color', ['blue']))
	eq(astOf('color:red,blue'), F('color', ['red', 'blue']))
	eq(astOf('color:b'), null, 'b is ambiguous')
	eq(warns('color:b'), ['Unknown color "b" was ignored.'])
	eq(warns('color:b').length, 1)
	eq(astOf('color:chartreuse'), null)
	eq(warns('color:chartreuse'), ['Unknown color "chartreuse" was ignored.'])
	eq(astOf('color:blue color:green'), AND(F('color', ['blue']), F('color', ['green'])))
	for (const named of colors.NAMED_COLORS) eq(astOf(`color:${named.name}`), F('color', [named.name]), named.name)
})

check('is: every flag, aliases, prefixes', () => {
	for (const flag of IS_FLAGS) eq(astOf(`is:${flag}`), F('is', [flag]), flag)
	eq(astOf('is:unreviewed'), F('is', ['unreviewed']))
	eq(astOf('is:reviewed'), F('is', ['reviewed']))
	eq(astOf('is:UNREVIEWED'), F('is', ['unreviewed']))
	eq(astOf('is:unr'), F('is', ['unreviewed']))
	eq(astOf('is:anim'), F('is', ['animated']))
	eq(astOf('is:alpha'), F('is', ['transparent']))
	eq(astOf('is:bw'), F('is', ['monochrome']))
	eq(astOf('is:un'), null, 'un is ambiguous')
	eq(astOf('is:t'), null, 't is ambiguous (tagged, transparent)')
	eq(astOf('is:xyz'), null)
	eq(warns('is:xyz').length, 1)
	eq(astOf('is:untagged,unreviewed'), F('is', ['untagged', 'unreviewed']))
	eq(astOf('is:project'), null)
})

check('sort: sets ParsedQuery.sort and a chip, never an AST node', () => {
	for (const s of MEDIA_SORTS) {
		const r = P(`sort:${s}`)
		eq(r.sort, s, s)
		eq(r.ast, null, s)
		eq(r.chips.length, 1, s)
		eq([r.chips[0].field, r.chips[0].values, r.chips[0].clause, r.chips[0].kind], ['sort', [s], `sort:${s}`, 'filter'], s)
		eq(r.hasText, false)
	}
	eq(P('SORT:Newest').sort, 'newest')
	eq(P('sort:na').sort, 'name', 'name beats its extension name-desc')
	eq(P('sort:name-').sort, 'name-desc', 'name- is a unique prefix of name-desc only')
	eq(P('sort:name-d').sort, 'name-desc')
	eq(P('sort:n').sort, null, 'n is ambiguous')
	eq(P('sort:recent').sort, 'newest')
	eq(P('sort:az').sort, 'name')
	eq(P('sort:xyz').sort, null)
	eq(warns('sort:xyz').length, 1)
	eq(P('sort:newest sort:oldest').sort, 'oldest', 'the last one wins')
	eq(P('sort:newest sort:oldest').chips.length, 2)
	eq(astOf('kitchen sort:largest'), T('kitchen'))
	eq(P('kitchen sort:largest').sort, 'largest')
	eq(P('(kitchen sort:largest)').sort, 'largest', 'inside a group it still sets the sort, with no chip of its own')
	eq(P('(kitchen sort:largest)').chips.length, 1)
	eq(P('-sort:newest').sort, null, 'a sort cannot be negated')
	eq(warns('-sort:newest').length, 1)
	eq(P('kitchen OR bath sort:newest').chips.length, 2)
})

/* -------------------------------------------------------------------------- */
/* Numbers and sizes                                                          */
/* -------------------------------------------------------------------------- */

check('width and height comparisons', () => {
	const w = (q) => P(q).ast
	eq(w('width:>1200').cmp, { op: 'gt', value: 1200 })
	eq(w('width:>=1200').cmp, { op: 'gte', value: 1200 })
	eq(w('width:<600').cmp, { op: 'lt', value: 600 })
	eq(w('height:<=600').cmp, { op: 'lte', value: 600 })
	eq(w('width:=800').cmp, { op: 'eq', value: 800 })
	eq(w('width:800').cmp, { op: 'eq', value: 800 })
	eq(w('width:800..1600').cmp, { op: 'range', from: 800, to: 1600 })
	eq(w('width:1600..800').cmp, { op: 'range', from: 800, to: 1600 }, 'reversed range is swapped')
	eq(w('width:800..800').cmp, { op: 'range', from: 800, to: 800 })
	eq(w('width:..1600').cmp, { op: 'lte', value: 1600 })
	eq(w('width:800..').cmp, { op: 'gte', value: 800 })
	eq(w('width:1200px').cmp, { op: 'eq', value: 1200 })
	eq(w('WIDTH:>1200').cmp, { op: 'gt', value: 1200 })
	eq(w('height:100.5..200.5').cmp, { op: 'range', from: 100.5, to: 200.5 })
	eq(strip(w('width:>1200')), F('width', [], { cmp: { op: 'gt', value: 1200 } }))
	eq(P('width:>1200').hasText, false)
	eq(P('width:>1200').chips[0].values, [])
	for (const q of ['width:abc', 'width:-5', 'width:>', 'width:..', 'width:1..2..3', 'width:>>5', 'width:5x', 'width:>1..2', 'height:1e3', 'width:12,34']) {
		eq(P(q).ast, null, q)
		ok(P(q).warnings.length >= 1, `${q} warns`)
	}
})

check('sizes: b kb mb gb, 1024-based, decimals', () => {
	const s = (q) => P(q).ast.cmp
	eq(s('size:100b'), { op: 'eq', value: 100 })
	eq(s('size:100'), { op: 'eq', value: 100 })
	eq(s('size:1kb'), { op: 'eq', value: 1024 })
	eq(s('size:2mb'), { op: 'eq', value: 2 * 1024 * 1024 })
	eq(s('size:1gb'), { op: 'eq', value: 1024 ** 3 })
	eq(s('size:1.5mb'), { op: 'eq', value: 1.5 * 1024 * 1024 })
	eq(s('size:0.5kb'), { op: 'eq', value: 512 })
	eq(s('size:>2MB'), { op: 'gt', value: 2097152 })
	eq(s('size:>=500KB'), { op: 'gte', value: 512000 })
	eq(s('size:<1mb'), { op: 'lt', value: 1048576 })
	eq(s('size:<=10kb'), { op: 'lte', value: 10240 })
	eq(s('size:500kb..2mb'), { op: 'range', from: 512000, to: 2097152 })
	eq(s('size:2mb..500kb'), { op: 'range', from: 512000, to: 2097152 })
	eq(s('size:1..2mb'), { op: 'range', from: 1048576, to: 2097152 }, 'a bare lower bound borrows the unit')
	eq(s('size:..2mb'), { op: 'lte', value: 2097152 })
	eq(s('size:500kb..'), { op: 'gte', value: 512000 })
	for (const q of ['size:2tb', 'size:mb', 'size:>2xb', 'size:1.5.5mb', 'size:99999999999999999999999gb', `size:${'9'.repeat(400)}`]) {
		eq(P(q).ast, null, q)
		eq(P(q).warnings.length, 1, q)
	}
	eq(astOf('size:2 mb'), AND(F('size', [], { cmp: { op: 'eq', value: 2 } }), T('mb')), 'a space ends the value')
})

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

check('every date form against a fixed now (a table)', () => {
	const endOf = (start, length) => start + length - 1
	const rows = [
		['added:2026-03-01', { op: 'range', from: utc(2026, 3, 1), to: endOf(utc(2026, 3, 1), DAY) }],
		['added:2026-03-31', { op: 'range', from: utc(2026, 3, 31), to: utc(2026, 4, 1) - 1 }],
		['added:2026-03', { op: 'range', from: utc(2026, 3, 1), to: utc(2026, 4, 1) - 1 }],
		['added:2026-02', { op: 'range', from: utc(2026, 2, 1), to: utc(2026, 3, 1) - 1 }],
		['added:2026-12', { op: 'range', from: utc(2026, 12, 1), to: utc(2027, 1, 1) - 1 }],
		['added:2026', { op: 'range', from: utc(2026, 1, 1), to: utc(2027, 1, 1) - 1 }],
		['added:2024-02-29', { op: 'range', from: utc(2024, 2, 29), to: utc(2024, 3, 1) - 1 }],
		['added:today', { op: 'range', from: utc(2026, 3, 15), to: utc(2026, 3, 16) - 1 }],
		['added:yesterday', { op: 'range', from: utc(2026, 3, 14), to: utc(2026, 3, 15) - 1 }],
		['added:week', { op: 'range', from: utc(2026, 3, 9), to: utc(2026, 3, 16) - 1 }],
		['added:month', { op: 'range', from: utc(2026, 3, 1), to: utc(2026, 4, 1) - 1 }],
		['added:year', { op: 'range', from: utc(2026, 1, 1), to: utc(2027, 1, 1) - 1 }],
		['added:7d', { op: 'gte', value: utc(2026, 3, 8, 10, 30) }],
		['added:1d', { op: 'gte', value: utc(2026, 3, 14, 10, 30) }],
		['added:0d', { op: 'gte', value: NOW.getTime() }],
		['added:2w', { op: 'gte', value: utc(2026, 3, 1, 10, 30) }],
		['added:3m', { op: 'gte', value: utc(2025, 12, 15, 10, 30) }],
		['added:1y', { op: 'gte', value: utc(2025, 3, 15, 10, 30) }],
		['added:30d', { op: 'gte', value: utc(2026, 2, 13, 10, 30) }],
		['added:>2026-01-01', { op: 'gt', value: utc(2026, 1, 2) - 1 }],
		['added:>=2026-01-01', { op: 'gte', value: utc(2026, 1, 1) }],
		['added:<2026-01-01', { op: 'lt', value: utc(2026, 1, 1) }],
		['added:<=2026-01-01', { op: 'lte', value: utc(2026, 1, 2) - 1 }],
		['added:=2026-01-01', { op: 'range', from: utc(2026, 1, 1), to: utc(2026, 1, 2) - 1 }],
		['added:>2026-03', { op: 'gt', value: utc(2026, 4, 1) - 1 }],
		['added:>=2026', { op: 'gte', value: utc(2026, 1, 1) }],
		['added:<2026', { op: 'lt', value: utc(2026, 1, 1) }],
		['added:>7d', { op: 'gt', value: utc(2026, 3, 8, 10, 30) }],
		['added:<7d', { op: 'lt', value: utc(2026, 3, 8, 10, 30) }],
		['added:>today', { op: 'gt', value: utc(2026, 3, 16) - 1 }],
		['added:2026-01-01..2026-03-31', { op: 'range', from: utc(2026, 1, 1), to: utc(2026, 4, 1) - 1 }],
		['added:2026-03-31..2026-01-01', { op: 'range', from: utc(2026, 1, 1), to: utc(2026, 4, 1) - 1 }],
		['added:2026-01..2026-02', { op: 'range', from: utc(2026, 1, 1), to: utc(2026, 3, 1) - 1 }],
		['added:2025..2026', { op: 'range', from: utc(2025, 1, 1), to: utc(2027, 1, 1) - 1 }],
		['added:2026-01-01..', { op: 'gte', value: utc(2026, 1, 1) }],
		['added:..2026-01-01', { op: 'lte', value: utc(2026, 1, 2) - 1 }],
		['ADDED:TODAY', { op: 'range', from: utc(2026, 3, 15), to: utc(2026, 3, 16) - 1 }],
	]
	for (const [q, expected] of rows) {
		const r = P(q)
		ok(r.ast && r.ast.type === 'field' && r.ast.field === 'added', `${q} parsed: ${JSON.stringify(r.warnings)}`)
		eq(r.ast.cmp, expected, q)
		eq(r.ast.values, [], q)
	}
	// 7 days of wall-clock arithmetic across the end of a month; month arithmetic clamps the day
	eq(cmpOf('added:1m', new Date('2026-03-31T12:00:00Z')), { op: 'gte', value: utc(2026, 2, 28, 12) }, 'Mar 31 minus a month clamps to Feb 28')
	eq(cmpOf('added:1y', new Date('2024-02-29T00:00:00Z')), { op: 'gte', value: utc(2023, 2, 28) }, 'leap day minus a year')
	eq(cmpOf('added:3m', new Date('2026-01-31T00:00:00Z')), { op: 'gte', value: utc(2025, 10, 31) })
	eq(cmpOf('added:1d', new Date('2026-01-01T00:00:00Z')), { op: 'gte', value: utc(2025, 12, 31) }, 'across a year boundary')
	// another now: the same words move with it
	eq(cmpOf('added:today', new Date('2027-07-04T23:59:59.999Z')), { op: 'range', from: utc(2027, 7, 4), to: utc(2027, 7, 5) - 1 })
	eq(cmpOf('added:week', new Date('2026-03-16T00:00:00Z')), { op: 'range', from: utc(2026, 3, 16), to: utc(2026, 3, 23) - 1 }, 'Monday starts its own week')
	eq(cmpOf('added:week', new Date('2026-03-22T23:59:59Z')), { op: 'range', from: utc(2026, 3, 16), to: utc(2026, 3, 23) - 1 }, 'Sunday ends it')
})

check('invalid dates are dropped with a warning', () => {
	for (const q of ['added:2026-02-30', 'added:2026-13', 'added:2026-00', 'added:2026-04-31', 'added:2023-02-29', 'added:soon', 'added:7x', 'added:7', 'added:d', 'added:99999d', 'added:1201m', 'added:0999', 'added:2026-1-1', 'added:..', 'added:>', 'added:2026-01-01...2026-02-01', 'added:1d,2d']) {
		const r = P(q)
		eq(r.ast, null, q)
		ok(r.warnings.length >= 1, `${q} warns`)
		eq(r.chips, [], q)
	}
})

/* -------------------------------------------------------------------------- */
/* Stopwords and text                                                         */
/* -------------------------------------------------------------------------- */

check('stopword terms are dropped unless that leaves no text', () => {
	eq(astOf('the kitchen'), T('kitchen'))
	eq(astOf('kitchen of the year'), AND(T('kitchen'), T('year')))
	eq(astOf('a kitchen with a view'), AND(T('kitchen'), T('view')))
	eq(astOf('the'), T('the'))
	eq(astOf('the a'), AND(T('the'), T('a')))
	eq(astOf('the OR a'), OR(T('the'), T('a')))
	eq(astOf('the tag:png'), AND(T('the'), F('tag', ['png'])), 'no other text: kept')
	eq(astOf('the kitchen tag:png'), AND(T('kitchen'), F('tag', ['png'])))
	eq(astOf('-the'), NOT(T('the')))
	eq(astOf('the OR kitchen'), T('kitchen'))
	eq(astOf('the -people'), NOT(T('people')), 'negated text counts as text')
	eq(astOf('"the kitchen"'), PH('the kitchen'), 'phrases keep stopwords')
	eq(astOf('the-kitchen'), PH('the kitchen', true))
	eq(astOf('before after'), AND(T('before'), T('after')), 'before/after are not stopwords')
	eq(astOf('new top over under up down out off'), AND(...['new', 'top', 'over', 'under', 'up', 'down', 'out', 'off'].map((w) => T(w))))
	eq(astOf('can may'), AND(T('can'), T('may')))
	eq(astOf('front back side no near'), AND(...['front', 'back', 'side', 'no', 'near'].map((w) => T(w))))
	// a dropped stopword leaves no chip: it has no effect, so there is nothing to remove
	eq(slices('the kitchen'), ['kitchen'])
	eq(slices('the'), ['the'])
})

check('hasText: terms, phrases and name/caption/text clauses, anywhere in the tree', () => {
	const rows = [
		['kitchen', true],
		['"a b"', true],
		['name:hero', true],
		['caption:van', true],
		['text:"grand opening"', true],
		['(tag:x OR kitchen)', true],
		['-kitchen', true],
		['tag:x -(type:png OR kitchen)', true],
		['tag:kitchen', false],
		['type:png', false],
		['folder:Acme', false],
		['width:>100 added:7d', false],
		['sort:newest', false],
		['-tag:x', false],
		['is:unreviewed color:blue', false],
		['', false],
	]
	for (const [q, expected] of rows) eq(P(q).hasText, expected, q)
})

check('unicode, emoji and control characters', () => {
	eq(astOf('café'), T('cafe'))
	eq(astOf('Фото'), T('фото'))
	eq(astOf('日本'), T('日本'))
	eq(astOf('日本 Фото'), AND(T('日本'), T('фото')))
	eq(astOf('naïve'), T('naive'))
	eq(astOf('Straße'), T('strasse'))
	eq(astOf('🍕'), null)
	eq(astOf('🍕🍕🍕'), null)
	eq(astOf('kitchen🍕'), T('kitchen'))
	eq(astOf('\u0000kitchen\u0007'), T('kitchen'))
	eq(astOf('kitchen\u0000bath'), AND(T('kitchen'), T('bath')), 'a control character separates')
	eq(astOf('kitchen bath'), AND(T('kitchen'), T('bath')), 'NBSP is whitespace')
	eq(astOf('kitchen　bath'), AND(T('kitchen'), T('bath')))
	eq(astOf('kitchen\n\tbath\r\n'), AND(T('kitchen'), T('bath')))
	eq(astOf('‮kitchen‬'), T('kitchen'))
	eq(astOf('\ud800'), null, 'a lone surrogate')
	eq(astOf('kitchen\ud800bath'), PH('kitchen bath', true))
	eq(astOf('tag:🍕'), null)
	eq(warns('tag:🍕').length, 1)
	eq(astOf('R&D'), PH('r and d', true))
	eq(astOf('école'), T('ecole'), 'combining marks fold')
	eq(astOf('tag:Café'), F('tag', ['cafe']))
	eq(astOf('tag:日本'), F('tag', ['日本']))
	ok(JSON.stringify(P('\ud800kitchen\udc00')) !== undefined, 'lone surrogates stay serialisable')
})

/* -------------------------------------------------------------------------- */
/* Chips                                                                      */
/* -------------------------------------------------------------------------- */

check('chip offsets are exact: each chip is the clause as typed', () => {
	const rows = [
		['kitchen  blue', ['kitchen', 'blue']],
		[' tag:x ', ['tag:x']],
		['-people', ['-people']],
		['NOT people', ['NOT people']],
		['NOT   people', ['NOT   people']],
		['kitchen NOT people', ['kitchen', 'NOT people']],
		['-"before and after" blue', ['-"before and after"', 'blue']],
		['(kitchen OR bath) blue', ['(kitchen OR bath)', 'blue']],
		['-(kitchen OR bath) blue', ['-(kitchen OR bath)', 'blue']],
		['kitchen OR bath', ['kitchen OR bath']],
		['kitchen bath OR blue', ['kitchen bath OR blue']],
		['tag:"kitchen remodel",bath type:png', ['tag:"kitchen remodel",bath', 'type:png']],
		['#kit* x1', ['#kit*', 'x1']],
		['width:>1200 height:<=600', ['width:>1200', 'height:<=600']],
		['sort:newest kitchen', ['sort:newest', 'kitchen']],
		['kitchen sort:newest', ['kitchen', 'sort:newest']],
		['"unclosed', ['"unclosed']],
		['( kitchen', ['( kitchen']],
		['kitchen-remodel blue', ['kitchen-remodel', 'blue']],
		['kitchen ) blue', ['kitchen', 'blue']],
		['kitchen -', ['kitchen']],
		['kitchen OR', ['kitchen']],
		['OR kitchen', ['kitchen']],
		['-type:png,jpg kitchen', ['-type:png,jpg', 'kitchen']],
		['type:xyz kitchen', ['kitchen']],
		['NOT NOT kitchen', ['NOT NOT kitchen']],
		['colour:red blue', ['colour:red', 'blue']],
		['kitchen    ', ['kitchen']],
	]
	for (const [q, expected] of rows) eq(slices(q), expected, JSON.stringify(q))
})

check('chip labels and canonical clauses', () => {
	const rows = [
		['tag:kitchen', 'tag: kitchen', 'tag:kitchen', 'filter'],
		['type:png,jpg', 'type: png, jpg', 'type:png,jpg', 'filter'],
		['type:jpeg', 'type: jpg', 'type:jpg', 'filter'],
		['width:>1200', 'width > 1200', 'width:>1200', 'filter'],
		['width:>=1200', 'width >= 1200', 'width:>=1200', 'filter'],
		['height:<600', 'height < 600', 'height:<600', 'filter'],
		['height:<=600', 'height <= 600', 'height:<=600', 'filter'],
		['width:800', 'width = 800', 'width:800', 'filter'],
		['width:800..1600', 'width 800 to 1600', 'width:800..1600', 'filter'],
		['size:500kb..2mb', 'size 500 KB to 2 MB', 'size:500kb..2mb', 'filter'],
		['size:>2MB', 'size > 2 MB', 'size:>2mb', 'filter'],
		['size:1.5mb', 'size = 1.5 MB', 'size:1.5mb', 'filter'],
		['size:100', 'size = 100 B', 'size:100', 'filter'],
		['added:7d', 'added since 7 days ago', 'added:7d', 'filter'],
		['added:1d', 'added since 1 day ago', 'added:1d', 'filter'],
		['added:2w', 'added since 2 weeks ago', 'added:2w', 'filter'],
		['added:today', 'added today', 'added:today', 'filter'],
		['added:week', 'added this week', 'added:week', 'filter'],
		['added:2026-03-01', 'added on 2026-03-01', 'added:2026-03-01', 'filter'],
		['added:2026-03', 'added in 2026-03', 'added:2026-03', 'filter'],
		['added:>2026-01-01', 'added after 2026-01-01', 'added:>2026-01-01', 'filter'],
		['added:2026-01-01..2026-03-31', 'added 2026-01-01 to 2026-03-31', 'added:2026-01-01..2026-03-31', 'filter'],
		['-people', 'not: people', '-people', 'term'],
		['NOT people', 'not: people', '-people', 'term'],
		['-tag:people', 'not tag: people', '-tag:people', 'filter'],
		['-"before and after"', 'not: "before and after"', '-"before and after"', 'phrase'],
		['"before and after"', '"before and after"', '"before and after"', 'phrase'],
		['kitchen', 'kitchen', 'kitchen', 'term'],
		['Kitchen', 'kitchen', 'kitchen', 'term'],
		['kitchen-remodel', '"kitchen remodel"', 'kitchen-remodel', 'phrase'],
		['(kitchen OR bath)', '(kitchen OR bath)', '(kitchen OR bath)', 'term'],
		['-(kitchen OR bath)', 'not: (kitchen OR bath)', '-(kitchen OR bath)', 'term'],
		['(tag:a OR tag:b)', '(tag:a OR tag:b)', '(tag:a OR tag:b)', 'filter'],
		['kitchen OR bath', 'kitchen OR bath', 'kitchen OR bath', 'term'],
		['sort:newest', 'sort: newest', 'sort:newest', 'filter'],
		['color:grey', 'color: gray', 'color:gray', 'filter'],
		['folder:"Clients/Acme Co"', 'folder: Clients/Acme Co', 'folder:"Clients/Acme Co"', 'filter'],
		['folder:none', 'folder: unfiled', 'folder:unfiled', 'filter'],
		['name:Hero', 'name: hero', 'name:hero', 'filter'],
		['text:"grand opening"', 'text: grand opening', 'text:"grand opening"', 'filter'],
		['is:UNREVIEWED', 'is: unreviewed', 'is:unreviewed', 'filter'],
	]
	for (const [q, label, clause, kind] of rows) {
		const chip = P(q).chips[0]
		ok(chip, `${q} has a chip`)
		eq([chip.label, chip.clause, chip.kind], [label, clause, kind], q)
	}
})

check('filter chips carry field and values; negation is flagged', () => {
	let chip = P('type:png,jpg').chips[0]
	eq([chip.field, chip.values, chip.negated], ['type', ['png', 'jpg'], false])
	chip = P('-tag:people').chips[0]
	eq([chip.field, chip.values, chip.negated], ['tag', ['people'], true])
	chip = P('width:>5').chips[0]
	eq([chip.field, chip.values], ['width', []])
	chip = P('kitchen').chips[0]
	eq([chip.field, chip.values, chip.negated], [undefined, undefined, false])
	chip = P('NOT NOT kitchen').chips[0]
	eq([chip.negated, chip.clause], [false, 'kitchen'])
	chip = P('(tag:a OR tag:b)').chips[0]
	eq([chip.field, chip.values], [undefined, undefined])
	ok(typeof chip.key === 'string' && chip.key.length > 0, 'a key')
})

check('chips: one per top-level clause, ordered and non-overlapping', () => {
	for (const q of ['kitchen blue tag:x', '(kitchen OR bath) blue color:red', 'kitchen OR bath sort:newest', 'sort:newest kitchen OR bath', '-a "b c" (d e) f-g #h']) {
		const chips = P(q).chips
		for (let i = 1; i < chips.length; i++) ok(chips[i - 1].end <= chips[i].start, `${q}: chips overlap`)
		for (const chip of chips) ok(chip.start >= 0 && chip.end <= q.length && chip.start < chip.end, `${q}: bad span`)
	}
	eq(P('kitchen OR bath blue').chips.length, 1, 'a top-level OR is one clause')
	eq(P('kitchen blue').chips.length, 2)
	eq(P('(kitchen blue)').chips.length, 1, 'a group is one chip')
	eq(P('(kitchen OR bath) (tile OR blue)').chips.length, 2)
})

check('removeClause: every chip of several queries, the rest intact and parseable', () => {
	const queries = [
		'kitchen blue tag:x',
		'-people "before and after" type:png,jpg',
		'(kitchen OR bath) blue color:red',
		'kitchen OR bath',
		'#a #b sort:newest width:>100',
		'NOT kitchen   bath',
		'kitchen-remodel tag:"a b",c size:1..2mb',
		'-(kitchen OR bath) added:7d folder:"Clients/Acme Co" is:unreviewed',
		'"unclosed',
		'( kitchen blue',
		'kitchen NOT',
		'name:hero caption:van text:"grand opening" orientation:wide kind:logo',
	]
	for (const q of queries) {
		const before = P(q)
		for (let i = 0; i < before.chips.length; i++) {
			const result = removeClause(q, before.chips[i])
			const after = P(result)
			const expected = before.chips.filter((_, index) => index !== i).map((chip) => chip.clause)
			eq(real(after.chips.map((chip) => chip.clause)), real(expected), `${q} minus chip ${i} -> ${JSON.stringify(result)}`)
			ok(result === result.trim() && !/\s{2,}/.test(result) || /\s{2,}/.test(q), `tidy: ${JSON.stringify(result)}`)
		}
	}
	eq(removeClause('kitchen blue tag:x', { start: 8, end: 12 }), 'kitchen tag:x')
	eq(removeClause('kitchen blue', { start: 0, end: 7 }), 'blue')
	eq(removeClause('kitchen blue', { start: 8, end: 12 }), 'kitchen')
	eq(removeClause('kitchen', { start: 0, end: 7 }), '')
	eq(removeClause('a b c', { start: 2, end: 3 }), 'a c')
	eq(removeClause('kitchen', { start: 5, end: 2 }), 'kitchen', 'inverted offsets change nothing')
	eq(removeClause('kitchen', { start: NaN, end: 3 }), 'kitchen')
	eq(removeClause('kitchen', { start: -5, end: 99 }), '', 'out-of-range offsets clamp')
	eq(removeClause(undefined, { start: 0, end: 1 }), '')
})

check('removeClauseValue: comma lists', () => {
	const rv = (q, value, index = 0) => removeClauseValue(q, P(q).chips[index], value)
	eq(rv('type:png,jpg', 'jpg'), 'type:png')
	eq(rv('type:png,jpg', 'png'), 'type:jpg')
	eq(rv('type:png,jpg,webp', 'jpg'), 'type:png,webp')
	eq(rv('type:png', 'png'), '', 'the last value removes the chip')
	eq(rv('kitchen type:png,jpg blue', 'png', 1), 'kitchen type:jpg blue')
	eq(rv('kitchen type:png blue', 'png', 1), 'kitchen blue')
	eq(rv('-type:png,jpg', 'png'), '-type:jpg')
	eq(rv('NOT type:png,jpg', 'jpg'), 'NOT type:png')
	eq(rv('tag:"kitchen remodel",bath', 'bath'), 'tag:"kitchen remodel"')
	eq(rv('tag:"kitchen remodel",bath', 'kitchen-remodel'), 'tag:bath')
	eq(rv('tag:kit*,bath', 'bath'), 'tag:kit*')
	eq(rv('tag:kit*,bath', 'kit'), 'tag:bath')
	eq(rv('#a,b', 'a'), '#b')
	eq(rv('type:png,jpg', 'gif'), 'type:png,jpg', 'a value that is not there changes nothing')
	eq(rv('type:png,jpg', 'jpeg'), 'type:png', 'aliases resolve before comparing')
	eq(rv('color:red,blue,green', 'blue'), 'color:red,green')
	eq(rv('kitchen OR bath', 'bath'), '', 'a chip without a field is removed whole')
	eq(rv('width:>5', '5'), '', 'a numeric chip is removed whole')
	eq(rv('type:png,jpg sort:newest', 'jpg'), 'type:png sort:newest')
	const remaining = P(rv('type:png,jpg,webp', 'png')).chips[0]
	eq(remaining.values, ['jpg', 'webp'])
})

check('addClause: append, idempotence, quoting', () => {
	eq(addClause('', 'tag:kitchen'), 'tag:kitchen')
	eq(addClause('kitchen', 'tag:bath'), 'kitchen tag:bath')
	eq(addClause('kitchen   ', 'tag:bath'), 'kitchen tag:bath')
	eq(addClause('tag:kitchen', 'tag:kitchen'), 'tag:kitchen', 'identical clause is not added twice')
	eq(addClause('tag:kitchen', 'tag:Kitchen'), 'tag:kitchen', 'identical up to case')
	eq(addClause('tag:a tag:b', 'tag:b'), 'tag:a tag:b')
	eq(addClause('tag:a', 'tag:b'), 'tag:a tag:b', 'tags stay an AND')
	eq(addClause('color:blue', 'color:green'), 'color:blue color:green', 'colours stay an AND')
	eq(addClause('is:dark', 'is:vivid'), 'is:dark is:vivid')
	eq(addClause('width:>100', 'width:<500'), 'width:>100 width:<500')
	eq(addClause('', 'folder:Clients/Acme Co'), 'folder:"Clients/Acme Co"', 'a value with spaces is quoted')
	eq(addClause('kitchen', 'tag:kitchen remodel'), 'kitchen tag:"kitchen remodel"')
	eq(addClause('folder:"Clients/Acme Co"', 'folder:Clients/Acme Co'), 'folder:"Clients/Acme Co"', 'quoting is idempotent')
	eq(addClause('kitchen', 'color:blue'), 'kitchen color:blue')
	eq(addClause('kitchen', ''), 'kitchen')
	eq(addClause('kitchen', '   '), 'kitchen')
	eq(addClause('kitchen', 'type:xyz'), 'kitchen', 'a clause that says nothing adds nothing')
	eq(addClause(undefined, 'tag:x'), 'tag:x')
	eq(addClause('kitchen', '-tag:people'), 'kitchen -tag:people')
	eq(addClause('kitchen -tag:people', '-tag:people'), 'kitchen -tag:people')
	eq(addClause('kitchen', undefined), 'kitchen')
})

check('addClause: type, orientation and kind merge into a comma list', () => {
	eq(addClause('type:png', 'type:jpg'), 'type:png,jpg')
	eq(addClause('type:png,jpg', 'type:png'), 'type:png,jpg', 'idempotent')
	eq(addClause('type:png,jpg', 'type:jpg'), 'type:png,jpg')
	eq(addClause('type:png,jpg', 'type:webp'), 'type:png,jpg,webp')
	eq(addClause('type:png', 'type:jpeg'), 'type:png,jpg', 'aliases resolve before merging')
	eq(addClause('kitchen type:png blue', 'type:jpg'), 'kitchen type:png,jpg blue', 'merges in place')
	eq(addClause('orientation:landscape', 'orientation:portrait'), 'orientation:landscape,portrait')
	eq(addClause('kind:logo', 'kind:icon'), 'kind:logo,icon')
	eq(addClause('kitchen', 'type:png'), 'kitchen type:png')
	eq(addClause('type:png', 'type:png'), 'type:png')
	// negated clauses are not merged into, and a negated clause is never merged
	eq(addClause('-type:png', 'type:jpg'), '-type:png type:jpg')
	eq(addClause('type:png', '-type:jpg'), 'type:png -type:jpg')
	eq(addClause('NOT type:png', 'type:jpg'), 'NOT type:png type:jpg')
	eq(addClause('-type:png type:gif', 'type:jpg'), '-type:png type:gif,jpg', 'merges into the positive one only')
	// other fields do not merge
	eq(addClause('tag:a', 'tag:b'), 'tag:a tag:b')
	eq(addClause('is:dark', 'is:light'), 'is:dark is:light')
	eq(addClause('type:png OR type:gif', 'type:jpg'), '(type:png OR type:gif) type:jpg', 'never merged into an OR expression')
})

check('addClause: repairs the end of the query before appending', () => {
	eq(addClause('kitchen OR', 'tag:x'), 'kitchen tag:x', 'a dangling OR is dropped, not joined to the new clause')
	eq(addClause('kitchen NOT', 'tag:x'), 'kitchen tag:x')
	eq(addClause('kitchen -', 'tag:x'), 'kitchen tag:x')
	eq(addClause('"unclosed', 'tag:x'), '"unclosed" tag:x')
	eq(addClause('(kitchen', 'tag:x'), '(kitchen) tag:x')
	eq(addClause('(kitchen OR', 'tag:x'), '(kitchen) tag:x')
	eq(addClause('((kitchen', 'tag:x'), '((kitchen)) tag:x')
	eq(addClause('kitchen OR bath', 'tag:x'), '(kitchen OR bath) tag:x', 'an OR is wrapped so the new clause ANDs the whole')
	eq(addClause('kitchen OR bath sort:newest', 'tag:x'), '(kitchen OR bath) sort:newest tag:x')
	const joined = addClause('kitchen OR bath', 'tag:x')
	eq(astOf(joined), AND(OR(T('kitchen'), T('bath')), F('tag', ['x'])))
	// a dangling operator that is not the tail is just repaired by the parser
	eq(astOf(addClause('kitchen OR OR bath', 'tag:x')), AND(OR(T('kitchen'), T('bath')), F('tag', ['x'])))
})

check('relaxableTerms: only a pure AND of 2+ bare terms', () => {
	const rt = (q) => relaxableTerms(P(q))
	eq(rt('kitchen sink'), ['kitchen', 'sink'])
	eq(rt('kitchen sink blue'), ['kitchen', 'sink', 'blue'])
	eq(rt('Kitchen   Sink'), ['kitchen', 'sink'])
	eq(rt('kitchen the sink'), ['kitchen', 'sink'], 'a dropped stopword is not a term')
	eq(rt('kitchen'), null, 'one term is not enough')
	eq(rt(''), null)
	eq(rt('kitchen OR sink'), null)
	eq(rt('kitchen -sink'), null)
	eq(rt('kitchen NOT sink'), null)
	eq(rt('"kitchen sink"'), null)
	eq(rt('kitchen "kitchen sink"'), null)
	eq(rt('kitchen-sink'), null)
	eq(rt('kitchen-sink blue'), null)
	eq(rt('(kitchen sink)'), null)
	eq(rt('(kitchen sink) blue'), null)
	eq(rt('kitchen (sink OR blue)'), null)
	eq(rt('kitchen tag:x'), null)
	eq(rt('tag:x kitchen sink'), null)
	eq(rt('kitchen sink type:png'), null)
	eq(rt('kitchen sink name:hero'), null)
	eq(rt('kitchen sink*'), null)
	eq(rt('kitchen sink sort:newest'), null)
	eq(rt('colour:red kitchen'), null)
	eq(rt('tag:x'), null)
})

check('dropTerms: rebuilds chips, offsets and the AST', () => {
	const drop = (q, words) => dropTerms(P(q), words)
	let r = drop('kitchen sink blue', ['sink'])
	eq(r.raw, 'kitchen blue')
	eq(strip(r.ast), AND(T('kitchen'), T('blue')))
	eq(r.chips.map((c) => r.raw.slice(c.start, c.end)), ['kitchen', 'blue'])
	eq(r.chips.map((c) => c.clause), ['kitchen', 'blue'])
	eq([r.ast.nodes[1].start, r.ast.nodes[1].end], [8, 12])
	eq(r.hasText, true)

	r = drop('kitchen   sink    blue', ['kitchen'])
	eq(r.raw, 'sink    blue', 'the text between clauses is kept as typed')
	eq(r.chips.map((c) => [c.start, c.end]), [[0, 4], [8, 12]])
	r = drop('kitchen   sink    blue', ['sink'])
	eq(r.raw, 'kitchen blue', 'a seam collapses to one space')
	eq(r.chips.map((c) => [c.start, c.end]), [[0, 7], [8, 12]])

	r = drop('kitchen sink blue', ['kitchen', 'blue'])
	eq(r.raw, 'sink')
	eq(strip(r.ast), T('sink'), 'a single term remains')

	r = drop('kitchen sink', ['kitchen', 'sink'])
	eq([r.raw, r.ast, r.chips, r.hasText], ['', null, [], false])

	r = drop('kitchen sink', ['SINK'])
	eq(r.raw, 'kitchen', 'words compare case-insensitively')

	r = drop('kitchen tag:x sink', ['sink'])
	eq(r.raw, 'kitchen tag:x')
	eq(r.chips.map((c) => r.raw.slice(c.start, c.end)), ['kitchen', 'tag:x'])
	eq(strip(r.ast), AND(T('kitchen'), F('tag', ['x'])))

	r = drop('kitchen sink', ['elephant'])
	eq(r.raw, 'kitchen sink', 'nothing to drop')
	eq(strip(r.ast), AND(T('kitchen'), T('sink')))

	r = drop('kitchen sink sort:newest', ['sink'])
	eq(r.sort, 'newest')
	eq(r.chips.map((c) => r.raw.slice(c.start, c.end)), ['kitchen', 'sort:newest'])

	// the rebuilt query is the same as parsing the new text from scratch
	for (const [q, words] of [['kitchen sink blue', ['sink']], ['a  kitchen  sink   blue tile', ['kitchen', 'tile']], ['kitchen tag:"a b" sink', ['kitchen']], ['kitchen sink', ['sink', 'kitchen']]]) {
		const dropped = drop(q, words)
		const fresh = P(dropped.raw)
		eq(dropped.ast, fresh.ast, `${q}: ast`)
		eq(dropped.chips, fresh.chips, `${q}: chips`)
		eq(dropped.hasText, fresh.hasText, `${q}: hasText`)
	}
	// negated and phrase terms are not terms to drop
	r = drop('kitchen -sink', ['sink'])
	eq(r.raw, 'kitchen -sink')
	r = drop('kitchen "sink"', ['sink'])
	eq(r.raw, 'kitchen "sink"')
	r = drop('kitchen sink*', ['sink'])
	eq(r.raw, 'kitchen')
})

/* -------------------------------------------------------------------------- */
/* Dangling and unbalanced input                                              */
/* -------------------------------------------------------------------------- */

check('dangling operators and unbalanced input are repaired, never an error', () => {
	const rows = [
		['kitchen OR', T('kitchen')],
		['OR kitchen', T('kitchen')],
		['OR', null],
		['NOT', null],
		['NOT NOT', null],
		['kitchen NOT', T('kitchen')],
		['kitchen OR OR bath', OR(T('kitchen'), T('bath'))],
		['kitchen OR NOT', T('kitchen')],
		['kitchen NOT OR bath', OR(T('kitchen'), T('bath'))],
		['( kitchen', T('kitchen')],
		['kitchen )', T('kitchen')],
		[') kitchen (', T('kitchen')],
		['((kitchen', T('kitchen')],
		['kitchen))', T('kitchen')],
		['(kitchen OR', T('kitchen')],
		['(OR kitchen)', T('kitchen')],
		['(kitchen OR)', T('kitchen')],
		['(OR)', null],
		['()', null],
		[')(', null],
		['(', null],
		[')', null],
		['"unclosed', PH('unclosed')],
		['kitchen "unclosed bath', AND(T('kitchen'), PH('unclosed bath'))],
		['("unclosed', PH('unclosed')],
		['"', null],
		['""', null],
		['" "', null],
		['tag:', null],
		['tag:"unclosed', F('tag', ['unclosed'])],
		['tag:"kitchen remodel', F('tag', ['kitchen-remodel'])],
		['-', null],
		['--', null],
		['---', null],
		['#', null],
		['##', null],
		[':', null],
		['::', null],
		['tag:*', null],
		[',', null],
		['kitchen ,', T('kitchen')],
		['kitchen OR (bath', OR(T('kitchen'), T('bath'))],
		['-(', null],
		['-(kitchen', NOT(T('kitchen'))],
		['NOT (', null],
		['kitchen OR -', T('kitchen')],
	]
	for (const [q, expected] of rows) {
		const r = parseQuery(q, { now: NOW })
		eq(strip(r.ast), expected, JSON.stringify(q))
	}
})

check('very long words, 10,000 characters, deep nesting and long runs of operators', () => {
	const time = (q) => {
		parseQuery(q, { now: NOW })
		let best = Infinity
		for (let i = 0; i < 5; i++) {
			const t0 = performance.now()
			parseQuery(q, { now: NOW })
			best = Math.min(best, performance.now() - t0)
		}
		return best
	}
	const long = 'a'.repeat(10_000)
	let r = P(long)
	eq(r.ast.type, 'term')
	ok(r.ast.text.length <= 100, 'a long word is bounded')
	eq([r.chips[0].start, r.chips[0].end], [0, 10_000], 'but its chip still covers the token')
	ok(time(long) < 50, 'one 10k word under 50 ms')

	const words = Array.from({ length: 1428 }, (_, i) => `w${i}x`).join(' ')
	ok(words.length >= 7000)
	ok(time(words) < 50, `many words under 50 ms (${time(words).toFixed(1)} ms)`)

	const tenK = ('kitchen blue '.repeat(800)).slice(0, 10_000)
	ok(tenK.length === 10_000)
	ok(time(tenK) < 50, `10k characters under 50 ms (${time(tenK).toFixed(1)} ms)`)

	const opens = `${'('.repeat(10_000)}kitchen`
	r = P(opens)
	eq(strip(r.ast), T('kitchen'))
	ok(r.warnings.filter((w) => w.includes('too complex')).length === 1, 'one complexity warning')
	ok(time(opens) < 50, `10,000 "(" under 50 ms (${time(opens).toFixed(1)} ms)`)

	const balanced = `${'('.repeat(5000)}kitchen OR bath${')'.repeat(5000)}`
	r = P(balanced)
	eq(strip(r.ast), OR(T('kitchen'), T('bath')))
	eq(r.warnings.filter((w) => w.includes('too complex')).length, 1)
	ok(time(balanced) < 50, `5000 balanced under 50 ms (${time(balanced).toFixed(1)} ms)`)

	const closes = ')'.repeat(10_000)
	eq(P(closes).ast, null)
	ok(time(closes) < 50)

	const nots = `${'NOT '.repeat(2500)}kitchen`
	ok(nots.length >= 10_000)
	eq(strip(P(nots).ast), T('kitchen'), 'an even number of NOTs cancels')
	eq(strip(P(`${'NOT '.repeat(2501)}kitchen`).ast), NOT(T('kitchen')), 'an odd number negates once')
	ok(time(nots) < 50, `10,000 characters of NOT under 50 ms (${time(nots).toFixed(1)} ms)`)

	const dashes = `${'-'.repeat(10_000)}kitchen`
	eq(strip(P(dashes).ast), T('kitchen'))
	ok(time(dashes) < 50)

	const groups = '(kitchen) '.repeat(1000)
	eq(P(groups).ast.type, 'and')
	ok(time(groups) < 50, `1000 groups under 50 ms (${time(groups).toFixed(1)} ms)`)

	const alt = '(kitchen OR (bath '.repeat(600)
	ok(time(alt) < 50, `alternating nest under 50 ms (${time(alt).toFixed(1)} ms)`)
	ok(depth(P(alt).ast) <= MEDIA_LIMITS.queryMaxDepth)

	const tags = 'tag:'.repeat(2500)
	ok(time(tags) < 50)
	ok(P(tags).warnings.length <= 20, 'warnings are bounded')

	const quotes = '"'.repeat(10_000)
	ok(time(quotes) < 50)

	const commas = `tag:${'a,'.repeat(4000)}`
	r = P(commas)
	ok(r.ast.values.length <= 50, 'a comma list is bounded')
	ok(time(commas) < 50)
})

check('nesting deeper than the cap is flattened with one warning', () => {
	const cap = MEDIA_LIMITS.queryMaxDepth
	eq(cap, 8)
	const wrap = (n, inner) => '('.repeat(n) + inner + ')'.repeat(n)
	for (let n = 1; n <= cap; n++) {
		const r = P(wrap(n, 'kitchen OR bath'))
		eq(r.warnings, [], `${n} levels need no warning`)
		eq(strip(r.ast), OR(T('kitchen'), T('bath')))
	}
	for (const n of [cap + 1, cap + 2, 20, 100]) {
		const r = P(wrap(n, 'kitchen OR bath'))
		eq(r.warnings, ['Query too complex, extra grouping ignored.'], `${n} levels warn once`)
		eq(strip(r.ast), OR(T('kitchen'), T('bath')))
	}
	// alternating and/or nesting: the tree never exceeds the cap at any depth
	for (let n = 1; n <= 40; n++) {
		let s = 'kitchen'
		let neg = 'kitchen'
		for (let k = 1; k <= n; k++) {
			s = k % 2 ? `(bath ${s})` : `(sink OR ${s})`
			neg = k % 2 ? `-(bath ${neg})` : `(sink OR -(tile ${neg}))`
		}
		for (const q of [s, neg]) {
			const r = P(q)
			ok(depth(r.ast) <= cap, `depth ${depth(r.ast)} for ${n} levels of ${q.slice(0, 40)}`)
			ok(r.warnings.filter((w) => w.includes('too complex')).length <= 1, 'at most one complexity warning')
			ok(r.ast !== null, 'still a query')
		}
	}
	const deepAlt = P('(kitchen OR (bath (sink OR (tile (paint OR (wall (door OR (window floor))))))))')
	ok(depth(deepAlt.ast) <= cap)
	eq(deepAlt.warnings.length <= 1, true)
	// a flattened negated group is discarded, never inverted into its opposite
	const dropped = P(`${'('.repeat(cap)}kitchen -(bath OR sink)${')'.repeat(cap)}`)
	ok(JSON.stringify(dropped.ast).includes('bath') === false, 'a too-deep negated group is not turned positive')
	eq(dropped.warnings.length, 1)
})

/* -------------------------------------------------------------------------- */
/* Limits and hostile values                                                  */
/* -------------------------------------------------------------------------- */

check('warnings are deduplicated and bounded', () => {
	eq(warns('tag: tag: tag: tag:').length, 1)
	eq(warns('type:xyz type:xyz type:XYZ').length, 2, 'text differs by case: both echoed')
	const many = Array.from({ length: 60 }, (_, i) => `type:bad${i}`).join(' ')
	ok(warns(many).length <= 20, 'at most 20 warnings')
	ok(warns(`type:${'x'.repeat(5000)}`)[0].length < 120, 'a warning echoes a short excerpt')
	ok(!/[\u0000-\u001f]/.test(warns('type:a\u0000b')[0] ?? ''), 'no control characters in a warning')
})

check('comma lists are bounded', () => {
	const list = Array.from({ length: 80 }, (_, i) => `t${i}`).join(',')
	const r = P(`tag:${list}`)
	eq(r.ast.values.length, 50)
	eq(r.warnings.length, 1)
})

check('the result is JSON serialisable and stable', () => {
	for (const q of ['kitchen OR bath', 'tag:kit*,bath -people width:>1 added:7d sort:name "a b"', '(a OR b) -(c d)', '', 'tag:']) {
		const r = P(q)
		assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), r)
		assert.deepStrictEqual(P(q), r)
		assertions += 2
	}
})

/* -------------------------------------------------------------------------- */
/* Fuzz                                                                       */
/* -------------------------------------------------------------------------- */

const ALPHABET = ['(', ')', '"', '-', ':', ',', '*', '#', '.', '_', '>', '<', '=', '..', ' ', ' ', '  ', 'OR', 'NOT', 'or', 'not', 'tag:', 'type:', 'color:', 'is:', 'width:', 'size:', 'added:', 'sort:', 'name:', 'folder:', 'text:', 'caption:', 'kitchen', 'bath', 'the', 'a', 'png', 'jpg', 'blue', '7d', '2026-01-01', '1.5mb', '\u0000', 'é', '日本', '🍕', '‮', '​', '\ud800', '\n', '\t', '&', 'x', '1', '0', 'orientation:', 'kind:', 'colour:', '\\', '/', '|', '$', '{', '}', '[', ']', '%']

function walk(node, visit) {
	visit(node)
	if (node.nodes) for (const child of node.nodes) walk(child, visit)
	if (node.node) walk(node.node, visit)
}

check('fuzz: 2,000 adversarial strings never throw and always satisfy the invariants', () => {
	const random = rng(0xc0ffee)
	let withText = 0
	for (let n = 0; n < 2000; n++) {
		const count = 1 + Math.floor(random() * 30)
		let q = ''
		for (let k = 0; k < count; k++) q += ALPHABET[Math.floor(random() * ALPHABET.length)]
		let r
		try {
			r = parseQuery(q, { now: NOW })
		} catch (error) {
			throw new Error(`threw on ${JSON.stringify(q)}: ${error.message}`)
		}
		const label = JSON.stringify(q)
		assertions++
		if (r.raw !== q) throw new Error(`${label}: raw changed`)
		for (let i = 0; i < r.chips.length; i++) {
			const chip = r.chips[i]
			if (!(chip.start >= 0 && chip.end <= q.length && chip.start < chip.end)) throw new Error(`${label}: chip span ${chip.start}..${chip.end}`)
			if (i > 0 && r.chips[i - 1].end > chip.start) throw new Error(`${label}: chips overlap`)
			if (typeof chip.clause !== 'string' || !chip.clause || typeof chip.label !== 'string') throw new Error(`${label}: chip text`)
			// removing the chip always leaves something parseable, with the others intact
			const left = removeClause(q, chip)
			const after = parseQuery(left, { now: NOW })
			const expected = r.chips.filter((_, index) => index !== i).map((c) => c.clause)
			if (JSON.stringify(real(after.chips.map((c) => c.clause))) !== JSON.stringify(real(expected))) {
				throw new Error(`${label}: removing chip ${i} -> ${JSON.stringify(left)} gave ${JSON.stringify(after.chips.map((c) => c.clause))}, wanted ${JSON.stringify(expected)}`)
			}
		}
		if (r.ast) {
			walk(r.ast, (node) => {
				if (node.start !== undefined && !(node.start >= 0 && node.end <= q.length && node.start <= node.end)) throw new Error(`${label}: node span`)
			})
			if (depth(r.ast) > MEDIA_LIMITS.queryMaxDepth) throw new Error(`${label}: too deep`)
			if (r.ast.type === 'and' && r.ast.nodes.length < 2) throw new Error(`${label}: single-child and`)
			walk(r.ast, (node) => {
				if ((node.type === 'and' || node.type === 'or') && node.nodes.length < 2) throw new Error(`${label}: single-child ${node.type}`)
				if (node.type === 'not' && node.node.type === 'not') throw new Error(`${label}: NOT NOT survived`)
				if (node.type === 'and' && node.nodes.some((child) => child.type === 'and')) throw new Error(`${label}: and in and`)
				if (node.type === 'or' && node.nodes.some((child) => child.type === 'or')) throw new Error(`${label}: or in or`)
			})
		}
		if (r.warnings.length > 20) throw new Error(`${label}: too many warnings`)
		try {
			assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), r)
		} catch {
			throw new Error(`${label}: not JSON-stable`)
		}
		// the editing helpers never throw on it either
		addClause(q, 'tag:x')
		addClause(q, 'type:png')
		relaxableTerms(r)
		dropTerms(r, ['kitchen', 'bath'])
		if (r.hasText) withText++
	}
	ok(withText > 200, `the fuzzer reaches text queries (${withText})`)
})

check('fuzz: parse of 10,000 random characters stays under 50 ms', () => {
	const random = rng(7)
	for (let round = 0; round < 8; round++) {
		let q = ''
		while (q.length < 10_000) q += ALPHABET[Math.floor(random() * ALPHABET.length)]
		q = q.slice(0, 10_000)
		parseQuery(q, { now: NOW })
		let best = Infinity
		for (let i = 0; i < 3; i++) {
			const t0 = performance.now()
			parseQuery(q, { now: NOW })
			best = Math.min(best, performance.now() - t0)
		}
		ok(best < 50, `round ${round}: ${best.toFixed(1)} ms`)
	}
})

check('fuzz: removeClause and removeClauseValue accept any offsets', () => {
	const random = rng(11)
	for (let n = 0; n < 300; n++) {
		const q = Array.from({ length: 12 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join('')
		const pick = () => [-5, 0, 1, 3, q.length, q.length + 9, NaN, Infinity, 2.5][Math.floor(random() * 9)]
		const chip = { start: pick(), end: pick(), field: 'type', values: ['png', 'jpg'], negated: false }
		const out = removeClause(q, chip)
		assertions++
		if (typeof out !== 'string') throw new Error('not a string')
		const out2 = removeClauseValue(q, chip, 'png')
		if (typeof out2 !== 'string') throw new Error('not a string')
	}
})

/* -------------------------------------------------------------------------- */
/* Round trip                                                                 */
/* -------------------------------------------------------------------------- */

const FRAGMENTS = [
	'kitchen', 'bath', 'blue', 'sink', '4k', 'h2o', 'kit*', 'the', 'kitchen-remodel', 't-shirt', '"before and after"', '"kitchen"',
	'tag:kitchen', 'tag:kit*,bath', 'tag:"kitchen remodel",bath', '#people', '#kit*', '-people', 'NOT tag:x', '-"a b"', '-kitchen-remodel',
	'type:png,jpg', 'type:jpeg', 'color:blue', 'color:#0197f6', 'orientation:landscape', 'kind:logo', 'is:unreviewed', 'is:reviewed',
	'width:>1200', 'height:<=600', 'width:800..1600', 'size:500kb..2mb', 'size:>1.5mb', 'added:7d', 'added:2026-01-01..2026-03-31', 'added:>2026-01-01', 'added:month',
	'name:hero', 'name:he*', 'caption:van', 'text:"grand opening"', 'folder:"Clients/Acme Co"', 'folder:none', 'folder:Clients/Acme',
	'(kitchen OR bath)', '-(bath OR sink)', '(tag:a OR tag:b) blue', '(kitchen bath)', 'NOT (a1 b1)',
]

check('round trip: re-parsing the chips joined by spaces gives an equivalent query', () => {
	const random = rng(2026)
	let tested = 0
	for (let n = 0; n < 1500; n++) {
		const count = 1 + Math.floor(random() * 7)
		const parts = []
		for (let k = 0; k < count; k++) {
			if (k > 0 && random() < 0.25) parts.push('OR')
			parts.push(FRAGMENTS[Math.floor(random() * FRAGMENTS.length)])
		}
		if (random() < 0.3) parts.push(`sort:${MEDIA_SORTS[Math.floor(random() * MEDIA_SORTS.length)]}`)
		const q = parts.join(' ')
		const first = P(q)
		const rejoined = first.chips.map((chip) => chip.clause).join(' ')
		const second = P(rejoined)
		const label = `${q} -> ${rejoined}`
		eq(strip(second.ast), strip(first.ast), label)
		eq(second.sort, first.sort, `${label}: sort`)
		eq(second.hasText, first.hasText, `${label}: hasText`)
		eq(second.chips.map((chip) => chip.clause), first.chips.map((chip) => chip.clause), `${label}: clauses`)
		eq(second.warnings, [], `${label}: the canonical text is clean`)
		// and the canonical text is a fixed point
		eq(P(second.chips.map((chip) => chip.clause).join(' ')).chips.map((chip) => chip.clause), second.chips.map((chip) => chip.clause), `${label}: fixed point`)
		tested++
	}
	ok(tested === 1500, 'all cases ran')
})

check('round trip: every chip clause alone parses to one chip with the same clause', () => {
	const random = rng(99)
	for (let n = 0; n < 400; n++) {
		const fragment = FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]
		for (const chip of P(fragment).chips) {
			const again = P(chip.clause).chips
			eq(again.length, 1, `${fragment}: ${chip.clause}`)
			eq(again[0].clause, chip.clause)
		}
	}
})

/* -------------------------------------------------------------------------- */
/* Contract                                                                   */
/* -------------------------------------------------------------------------- */

check('contract: exports, purity and client safety', () => {
	for (const name of ['parseQuery', 'removeClause', 'removeClauseValue', 'addClause', 'relaxableTerms', 'dropTerms']) {
		eq(typeof parse[name], 'function', name)
	}
	const fs = require('node:fs')
	const path = require('node:path')
	const source = fs.readFileSync(path.join(__dirname_(), '../src/lib/media/query/parse.ts'), 'utf8')
	ok(!/server-only/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')), 'no server-only import')
	ok(!/from 'mongodb'|from 'sharp'|from 'next|from 'node:/.test(source), 'no node or server imports')
	ok(!/(:|\bas|<)\s*any\b/.test(source), 'no any')
})

function __dirname_() {
	return new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
}

console.log(`\n${passed} passed, ${failed} failed (${assertions} assertions)`)
process.exit(failed ? 1 : 0)
