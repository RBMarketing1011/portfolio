/**
 * Proves the builder's undo history (src/lib/builder/history.ts):
 *
 *   node scripts/prove-builder-history.cjs
 *
 *  - commit / undo / redo move snapshots between past, present and future;
 *  - a burst of edits to one field within 1.2 s is one step, and a new key or a pause
 *    starts a new one; undo ends a burst;
 *  - at most 50 steps are kept;
 *  - site and look are restored together, and a landing is one step;
 *  - the functions are pure: the same input gives the same output and nothing is
 *    mutated, so React StrictMode calling a caller twice cannot push twice.
 */
const assert = require('node:assert/strict')
const { loadTs } = require('./lib/load-ts.cjs')

const history = loadTs('src/lib/builder/history.ts')
const { landAiResult } = loadTs('src/lib/builder/land.ts')
const { defaultLook } = loadTs('src/lib/builder/look.ts')
const { defaultChrome } = loadTs('src/lib/builder/page-schema.ts')
const { commit, undo, redo, initialHistory, HISTORY_LIMIT, COALESCE_MS } = history

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

/** Freezes a value all the way down, so any mutation throws in strict mode. */
function deepFreeze(value) {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const inner of Object.values(value)) deepFreeze(inner)
	}
	return value
}

const page = (id, slug, blocks = []) => ({
	id,
	name: id,
	slug,
	inHeader: true,
	blocks,
	createdAt: '2026-10-01T00:00:00.000Z',
	updatedAt: '2026-10-01T00:00:00.000Z',
})
const site = (pages) => ({ version: 1, chrome: { ...defaultChrome }, pages })
const snap = (label, accent = '#0197f6') => {
	const look = defaultLook()
	return {
		site: site([page('pg_home', '/', [{ id: 'blk_a', type: 'page-hero', props: { heading: label } }])]),
		look: { ...look, theme: { ...look.theme, accent } },
	}
}
const start = () => ({ ...initialHistory, present: snap('start') })

check('initialHistory is an empty site with the default look and nothing to undo', () => {
	assert.deepEqual(initialHistory.past, [])
	assert.deepEqual(initialHistory.future, [])
	assert.equal(initialHistory.group, null)
	assert.equal(initialHistory.present.site.version, 1)
	assert.deepEqual(initialHistory.present.site.pages, [])
	assert.deepEqual(initialHistory.present.look, defaultLook())
	assert.equal(HISTORY_LIMIT, 50)
	assert.equal(COALESCE_MS, 1200)
})

check('commit pushes the present into the past and clears the future', () => {
	const a = start()
	const b = snap('b')
	const h = commit(a, b, { now: 1000 })
	assert.equal(h.present, b)
	assert.deepEqual(h.past, [a.present])
	assert.deepEqual(h.future, [])
	assert.equal(h.group, null)
})

check('committing the present itself changes nothing', () => {
	const a = start()
	assert.equal(commit(a, a.present, { now: 1 }), a)
	assert.equal(commit(a, a.present, { coalesce: 'prop:blk_a:heading', now: 1 }), a)
})

check('undo and redo move one step each way, and do nothing at the ends', () => {
	const s0 = start()
	const s1 = commit(s0, snap('one'), { now: 1 })
	const s2 = commit(s1, snap('two'), { now: 2 })
	const u1 = undo(s2)
	assert.equal(u1.present, s1.present)
	assert.deepEqual(u1.future, [s2.present])
	const u2 = undo(u1)
	assert.equal(u2.present, s0.present)
	assert.equal(undo(u2), u2, 'nothing left to undo returns the same history')
	const r1 = redo(u2)
	assert.equal(r1.present, s1.present)
	const r2 = redo(r1)
	assert.equal(r2.present, s2.present)
	assert.equal(redo(r2), r2, 'nothing left to redo returns the same history')
})

check('a new change after undo throws the redo steps away', () => {
	const s2 = commit(commit(start(), snap('one'), { now: 1 }), snap('two'), { now: 2 })
	const u = undo(s2)
	const next = commit(u, snap('other'), { now: 3 })
	assert.deepEqual(next.future, [])
	assert.equal(next.past.length, 2)
})

check('a burst of typing in one field within 1.2 s is one step', () => {
	let h = start()
	const key = 'prop:blk_a:heading'
	for (let i = 1; i <= 8; i++) h = commit(h, snap(`typed ${i}`), { coalesce: key, now: 1000 + i * 150 })
	assert.equal(h.past.length, 1, 'eight keystrokes are one undo step')
	assert.equal(h.present.site.pages[0].blocks[0].props.heading, 'typed 8')
	const back = undo(h)
	assert.equal(back.present.site.pages[0].blocks[0].props.heading, 'start')
})

check('the burst window is measured from the last change, and a pause of 1.2 s starts a new step', () => {
	const key = 'prop:blk_a:heading'
	let h = commit(start(), snap('a'), { coalesce: key, now: 0 })
	h = commit(h, snap('b'), { coalesce: key, now: 1199 })
	assert.equal(h.past.length, 1, '1199 ms later still merges')
	h = commit(h, snap('c'), { coalesce: key, now: 1199 + 1200 })
	assert.equal(h.past.length, 2, 'exactly 1200 ms later is a new step')
})

check('moving to another field, or a change with no key, starts a new step', () => {
	let h = commit(start(), snap('a'), { coalesce: 'prop:blk_a:heading', now: 0 })
	h = commit(h, snap('b'), { coalesce: 'prop:blk_a:body', now: 100 })
	assert.equal(h.past.length, 2)
	h = commit(h, snap('c'), { coalesce: 'prop:blk_a:body', now: 200 })
	assert.equal(h.past.length, 2, 'the second field merges with itself')
	h = commit(h, snap('d'), { now: 300 })
	assert.equal(h.past.length, 3, 'an add or remove is its own step')
	assert.equal(h.group, null)
	h = commit(h, snap('e'), { coalesce: 'prop:blk_a:body', now: 400 })
	assert.equal(h.past.length, 4, 'a keyless step ends the burst before it')
})

check('undo ends a burst, so typing again after undo is a new step', () => {
	const key = 'look:theme'
	let h = commit(start(), snap('a'), { coalesce: key, now: 0 })
	h = undo(h)
	assert.equal(h.group, null)
	h = commit(h, snap('b'), { coalesce: key, now: 10 })
	assert.equal(h.past.length, 1)
	assert.equal(h.present.site.pages[0].blocks[0].props.heading, 'b')
	assert.equal(undo(h).present.site.pages[0].blocks[0].props.heading, 'start')
})

check('at most 50 steps are kept, oldest first out', () => {
	let h = start()
	const made = []
	for (let i = 0; i < 60; i++) {
		const next = snap(`s${i}`)
		made.push(next)
		h = commit(h, next, { now: i * 5000 })
	}
	assert.equal(h.past.length, 50)
	// The present is s59; the past holds s9 … s58.
	assert.equal(h.past[0], made[9])
	assert.equal(h.past[49], made[58])
	let walked = h
	for (let i = 0; i < 50; i++) walked = undo(walked)
	assert.equal(walked.present, made[9])
	assert.equal(undo(walked), walked)
	const small = [1, 2, 3, 4, 5, 6, 7].reduce((acc, i) => commit(acc, snap(`x${i}`), { now: i, limit: 3 }), start())
	assert.equal(small.past.length, 3, 'the limit option is honoured')
})

check('site and look are one snapshot: undo restores both together', () => {
	const before = start()
	const after = snap('new pages', '#e11d48')
	assert.notEqual(after.look.theme.accent, before.present.look.theme.accent)
	const h = commit(before, after, { now: 1 })
	const back = undo(h)
	assert.equal(back.present.site.pages[0].blocks[0].props.heading, 'start')
	assert.equal(back.present.look.theme.accent, before.present.look.theme.accent)
	const again = redo(back)
	assert.equal(again.present.look.theme.accent, '#e11d48')
	assert.equal(again.present.site.pages[0].blocks[0].props.heading, 'new pages')
})

check('a landing (pages, chrome and look) is one undo step', () => {
	const now = '2026-10-25T12:00:00.000Z'
	const base = start()
	const look = defaultLook()
	const landing = {
		buildId: 'bld_000000000000000000000001',
		placement: 'replace-site',
		targetPageId: null,
		pages: [
			page('pg_aaaaaaaaaa', '/', [{ id: 'blk_1111111111', type: 'page-hero', props: { heading: 'Roofs' } }]),
			page('pg_bbbbbbbbbb', 'contact', [{ id: 'blk_2222222222', type: 'cta-band', props: { heading: 'Call' } }]),
		],
		chrome: { ...defaultChrome, header: 'stacked', ctaLabel: 'Free inspection', ctaHref: 'contact' },
		menuAdd: [],
		look: { theme: { ...look.theme, accent: '#b45309' }, page: look.page, header: look.header, footer: look.footer },
		blockLooks: { blk_1111111111: look.page },
		skipped: [],
		needsInput: [],
		notes: [],
	}
	const landed = landAiResult({ current: base.present, landing, now })
	// The store applies exactly this, with no coalescing key.
	let h = commit(base, { site: landed.site, look: landed.look }, { now: 5 })
	// Typing right after a landing is a separate step from it.
	h = commit(h, { ...h.present, site: { ...h.present.site, chrome: { ...h.present.site.chrome, ctaLabel: 'Free inspections' } } }, { coalesce: 'chrome:cta', now: 6 })
	assert.equal(h.past.length, 2)
	h = undo(h)
	assert.equal(h.present.site.pages.length, 2)
	assert.equal(h.present.look.theme.accent, '#b45309')
	h = undo(h)
	assert.equal(h.present.site.pages.length, 1, 'one undo takes every landed page away')
	assert.equal(h.present.site.pages[0].id, 'pg_home')
	assert.equal(h.present.look.theme.accent, base.present.look.theme.accent, 'and the theme with them')
	assert.deepEqual(h.present.look.blocks, base.present.look.blocks)
	assert.equal(h.present.site.chrome.header, base.present.site.chrome.header)
})

check('commit, undo and redo are pure: same input, same output, nothing mutated', () => {
	const h = deepFreeze(commit(commit(start(), snap('one'), { now: 1 }), snap('two'), { coalesce: 'k', now: 2 }))
	const next = deepFreeze(snap('three'))
	const a = commit(h, next, { coalesce: 'k', now: 3 })
	const b = commit(h, next, { coalesce: 'k', now: 3 })
	assert.deepEqual(a, b)
	assert.equal(a.past.length, b.past.length)
	assert.deepEqual(undo(h), undo(h))
	assert.deepEqual(redo(undo(h)), redo(undo(h)))
	// A caller run twice by StrictMode computes from the same history, so it lands once.
	const once = commit(h, next, { now: 99 })
	const twice = commit(h, next, { now: 99 })
	assert.equal(once.past.length, h.past.length + 1)
	assert.equal(twice.past.length, h.past.length + 1)
})

if (failed) {
	console.log(`\n${failed} check(s) failed`)
	process.exit(1)
}
console.log('\nAll history checks passed')
