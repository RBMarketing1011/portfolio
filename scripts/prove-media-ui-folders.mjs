// Proof for the folder tree, the folder dialogs and the move dialog.
//
//   node scripts/prove-media-ui-folders.mjs
//
// Loads the real .tsx through scripts/lib/load-ts.cjs and renders it with
// react-dom/server. There is no DOM in this environment, so what is proved is:
//   - the markup the components produce (roles, aria, names, permission variants),
//   - every decision the components make, extracted into pure helpers and called
//     directly (tree building, drag payloads, keyboard map, name checks, storage).
// What is NOT proved here (needs a browser): focus movement, real drag events,
// Radix menus and dialogs opening. Radix renders a dialog's content through a
// portal, which the server renderer leaves out, so an open MoveDialog renders
// nothing under renderToString; its content (MoveDialogBody) is rendered directly.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const React = rootRequire('react')
const { renderToString } = rootRequire('react-dom/server')
const h = React.createElement

let passed = 0
let failed = 0
const test = (name, fn) => {
	try {
		fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${error && error.message ? error.message.split('\n')[0] : error})`)
	}
}
const testAsync = async (name, fn) => {
	try {
		await fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${error && error.message ? error.message.split('\n')[0] : error})`)
	}
}

// React reports bad keys, invalid nesting and the like through console.error.
// Any of them during a render is a failure, so keep them.
// A proof that stops before its last line (an unsettled await) must not look like success.
let finished = false
process.on('exit', (code) => {
	if (!finished && code === 0) process.exitCode = 1
	if (!finished) console.log('FAIL  the proof did not run to the end')
})

const reactErrors = []
const realError = console.error
console.error = (...args) => {
	reactErrors.push(args.map(String).join(' ').slice(0, 300))
}

const contracts = loadTs('src/app/account/media/contracts.ts')
const dialogs = loadTs('src/app/account/media/folder-dialogs.tsx')
const treeModule = loadTs('src/app/account/media/folder-tree.tsx')
const moveModule = loadTs('src/app/account/media/move-dialog.tsx')
const { LIMITS } = { LIMITS: loadTs('src/lib/media/types.ts').MEDIA_LIMITS }
const { FolderTree } = treeModule
const { MoveDialog, MoveDialogBody, FolderPicker, canConfirmMove, initialChoice } = moveModule
const {
	buildFolderTree,
	ancestorsOf,
	descendantsOf,
	visibleNodes,
	moveBlockedIds,
	canHoldSubfolder,
	parseDragIds,
	carriesMediaIds,
	parseStoredExpanded,
	readStoredExpanded,
	writeStoredExpanded,
	FOLDERS_STORAGE_KEY,
	validateFolderName,
	messageOf,
	attempt,
	submitFolderName,
	planDrop,
	menuActionsFor,
	tabStopKey,
	activeKeyOf,
	resolveTreeKey,
	deleteExplanation,
	FolderNameForm,
	DeleteFolderDialog,
	MAX_DRAG_IDS,
} = dialogs

/* -------------------------------------------------------------------------- */
/* Fixtures and markup readers                                                */
/* -------------------------------------------------------------------------- */

const hex = (n) => n.toString(16).padStart(24, '0')

/** Flat DTOs, parents first, the way the API sends them. */
function dto(n, parent, name, count = 0, total = count) {
	return {
		id: hex(n),
		parentId: parent === null ? null : hex(parent),
		name,
		path: name,
		depth: 0,
		count,
		total,
	}
}

/**
 * Four levels, thirty folders: 3 + 9 + 9 + 9, depth first. Returns the list and
 * the nesting as plain data, so expectations come from this structure and not from
 * the code under test.
 */
function thirtyFolders() {
	const list = []
	const kids = new Map()
	const parentOf = new Map()
	let next = 1
	const add = (parent, name) => {
		const id = next++
		list.push(dto(id, parent, name, id % 5, 0))
		parentOf.set(id, parent)
		if (parent !== null) kids.set(parent, [...(kids.get(parent) ?? []), id])
		return id
	}
	const tops = []
	for (const top of ['Clients', 'Brand', 'Archive']) {
		const t = add(null, top)
		tops.push(t)
		for (let i = 1; i <= 3; i++) {
			const second = add(t, `${top} ${i}`)
			const third = add(second, `${top} ${i} photos`)
			add(third, `${top} ${i} photos final`)
		}
	}
	assert.equal(list.length, 30)
	return { list, kids, parentOf, tops }
}

const decode = (text) =>
	text
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')

const readAttrs = (tag) => {
	const out = {}
	for (const m of tag.matchAll(/\s([a-zA-Z_:][\w:.-]*)="([^"]*)"/g)) out[m[1]] = decode(m[2])
	return out
}
const treeitems = (html) =>
	[...html.matchAll(/<li\b[^>]*\brole="treeitem"[^>]*>/g)].map((m) => readAttrs(m[0]))
const buttons = (html) =>
	[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
		attrs: readAttrs(`<button${m[1]}>`),
		text: decode(m[2].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '')).trim(),
	}))
const textOf = (html) => decode(html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')

const noop = () => {}
const asyncNoop = async () => {}

function baseProps(over = {}) {
	return {
		folders: [],
		total: 0,
		unfiled: 0,
		unreviewed: 0,
		active: undefined,
		canWrite: true,
		canDelete: true,
		saved: [],
		onSelect: noop,
		onReview: noop,
		onCreate: asyncNoop,
		onRename: asyncNoop,
		onMove: asyncNoop,
		onDelete: asyncNoop,
		onDropAssets: asyncNoop,
		onApplySaved: noop,
		onDeleteSaved: asyncNoop,
		...over,
	}
}

function render(over) {
	const before = reactErrors.length
	const html = renderToString(h(FolderTree, baseProps(over)))
	const warnings = reactErrors.slice(before)
	return { html, warnings }
}

const keyed = (items, label) => items.find((item) => item['aria-label'].startsWith(label))

/* -------------------------------------------------------------------------- */
/* Pure model                                                                 */
/* -------------------------------------------------------------------------- */

test('contract: DRAG_MIME is the agreed type', () => {
	assert.equal(contracts.DRAG_MIME, 'application/x-media-ids')
})

test('model: builds the tree from the flat list (30 folders, 4 levels)', () => {
	const { list, kids, tops } = thirtyFolders()
	const model = buildFolderTree(list)
	assert.equal(model.ordered.length, 30)
	assert.equal(model.roots.length, 3)
	assert.deepEqual(model.roots.map((n) => n.id), tops.map(hex))
	for (const [parent, children] of kids)
		assert.deepEqual(model.byId.get(hex(parent)).children.map((n) => n.id), children.map(hex))
	assert.equal(Math.max(...model.ordered.map((n) => n.depth)), 3)
	assert.equal(model.byId.get(hex(tops[0])).height, 3)
	// Parents always come before their children.
	const position = new Map(model.ordered.map((n, i) => [n.id, i]))
	for (const n of model.ordered) if (n.parent) assert.ok(position.get(n.parent.id) < position.get(n.id))
})

test('model: depth is what the tree says, not what folder.depth claims', () => {
	const lying = [{ ...dto(1, null, 'A'), depth: 9 }, { ...dto(2, 1, 'B'), depth: 0 }]
	const model = buildFolderTree(lying)
	assert.equal(model.byId.get(hex(1)).depth, 0)
	assert.equal(model.byId.get(hex(2)).depth, 1)
})

test('model: sibling order follows the input; the input order of unrelated rows does not matter', () => {
	// Children listed before their parent (violates parents-first): still nested correctly.
	const shuffled = [dto(3, 1, 'Zed'), dto(2, 1, 'Alpha'), dto(1, null, 'Root')]
	const model = buildFolderTree(shuffled)
	assert.deepEqual(model.byId.get(hex(1)).children.map((n) => n.name), ['Zed', 'Alpha'])
	assert.equal(model.ordered[0].id, hex(1))
})

test('model: empty, null, undefined and junk input', () => {
	for (const input of [[], null, undefined, 'x', 5, {}, [null, undefined, 3, 'a', {}]]) {
		const model = buildFolderTree(input)
		assert.equal(model.ordered.length, 0)
		assert.equal(model.roots.length, 0)
	}
})

test('model: duplicate ids keep the first entry', () => {
	const model = buildFolderTree([dto(1, null, 'First'), dto(1, null, 'Second'), dto(2, 1, 'Kid')])
	assert.equal(model.ordered.length, 2)
	assert.equal(model.byId.get(hex(1)).name, 'First')
})

test('model: an orphan (missing parent) becomes top-level; a self-parent too', () => {
	const model = buildFolderTree([dto(1, 99, 'Orphan'), { ...dto(2, null, 'Self'), parentId: hex(2) }])
	assert.deepEqual(model.roots.map((n) => n.name), ['Orphan', 'Self'])
	assert.equal(model.ordered.length, 2)
})

test('model: a parent cycle loses no folder and does not loop', () => {
	// A under B under A, plus C under B.
	const model = buildFolderTree([dto(1, 2, 'A'), dto(2, 1, 'B'), dto(3, 2, 'C')])
	assert.equal(model.ordered.length, 3)
	assert.equal(new Set(model.ordered.map((n) => n.id)).size, 3)
	assert.equal(model.roots.length, 1)
	// Terminates and every ancestor walk is finite.
	for (const n of model.ordered) assert.ok(ancestorsOf(model, n.id).length < 3)
})

test('model: a 1000-folder chain does not overflow the stack', () => {
	const list = []
	for (let i = 1; i <= 1000; i++) list.push(dto(i, i === 1 ? null : i - 1, `F${i}`))
	const model = buildFolderTree(list)
	assert.equal(model.ordered.length, 1000)
	assert.equal(model.byId.get(hex(1000)).depth, 999)
	assert.equal(model.byId.get(hex(1)).height, 999)
	assert.equal(ancestorsOf(model, hex(1000)).length, 999)
	assert.equal(descendantsOf(model, hex(1)).length, 999)
})

test('model: a blank or non-string name reads "Untitled folder"', () => {
	const model = buildFolderTree([dto(1, null, ''), { ...dto(2, null, 'x'), name: undefined }, dto(3, null, '   ')])
	assert.deepEqual(model.ordered.map((n) => n.name), ['Untitled folder', 'Untitled folder', 'Untitled folder'])
})

test('ancestorsOf: root-first chain, empty for top-level, unknown, null and undefined', () => {
	const { list, tops } = thirtyFolders()
	const model = buildFolderTree(list)
	const deepest = model.ordered.find((n) => n.depth === 3)
	const chain = ancestorsOf(model, deepest.id)
	assert.equal(chain.length, 3)
	assert.equal(chain[0], deepest.parent.parent.parent.id)
	assert.equal(chain[2], deepest.parent.id)
	assert.deepEqual(ancestorsOf(model, hex(tops[0])), [])
	assert.deepEqual(ancestorsOf(model, 'nope'), [])
	assert.deepEqual(ancestorsOf(model, null), [])
	assert.deepEqual(ancestorsOf(model, undefined), [])
	assert.deepEqual(ancestorsOf(model, 'unfiled'), [])
})

test('descendantsOf: whole subtree depth first, never the folder itself', () => {
	const { list, tops } = thirtyFolders()
	const model = buildFolderTree(list)
	const sub = descendantsOf(model, hex(tops[0]))
	assert.equal(sub.length, 9)
	assert.ok(!sub.includes(hex(tops[0])))
	assert.deepEqual(descendantsOf(model, 'nope'), [])
	assert.deepEqual(descendantsOf(model, model.ordered.find((n) => n.depth === 3).id), [])
})

test('visibleNodes: only rows whose every ancestor is expanded', () => {
	const { list, tops } = thirtyFolders()
	const model = buildFolderTree(list)
	assert.equal(visibleNodes(model, new Set()).length, 3)
	const first = model.byId.get(hex(tops[0]))
	assert.equal(visibleNodes(model, new Set([first.id])).length, 3 + 3)
	// An expanded grandchild under a collapsed child stays hidden.
	const grand = first.children[0].children[0]
	assert.equal(visibleNodes(model, new Set([grand.id])).length, 3)
	// Ids that do not exist are harmless.
	assert.equal(visibleNodes(model, new Set(['nope', 'x'])).length, 3)
	// Everything expanded shows everything.
	assert.equal(visibleNodes(model, new Set(model.ordered.map((n) => n.id))).length, 30)
})

test('depth limit: new subfolders and moves respect depth + height <= 5', () => {
	const list = []
	for (let i = 1; i <= 6; i++) list.push(dto(i, i === 1 ? null : i - 1, `L${i - 1}`))
	list.push(dto(10, null, 'X'))
	list.push(dto(11, null, 'Y'))
	list.push(dto(12, 11, 'Y1'))
	const model = buildFolderTree(list)
	assert.equal(model.byId.get(hex(6)).depth, 5)
	assert.equal(canHoldSubfolder(model.byId.get(hex(5))), true)
	assert.equal(canHoldSubfolder(model.byId.get(hex(6))), false)
	// A leaf may go anywhere that can hold a child.
	assert.deepEqual([...moveBlockedIds(model, model.byId.get(hex(10)))].sort(), [hex(10), hex(6)].sort())
	// A folder with one level beneath it needs two free levels.
	assert.deepEqual(
		[...moveBlockedIds(model, model.byId.get(hex(11)))].sort(),
		[hex(11), hex(12), hex(5), hex(6)].sort(),
	)
	// Never itself or its own subtree (a cycle).
	const blocked = moveBlockedIds(model, model.byId.get(hex(2)))
	for (const id of [2, 3, 4, 5, 6]) assert.ok(blocked.has(hex(id)))
	assert.ok(!blocked.has(hex(1)))
})

test('menuActionsFor: permission and depth decide the menu; none means no button', () => {
	assert.deepEqual(menuActionsFor({ depth: 0 }, { write: false, delete: false }), [])
	assert.deepEqual(menuActionsFor({ depth: 0 }, { write: true, delete: false }), ['subfolder', 'rename', 'move'])
	assert.deepEqual(menuActionsFor({ depth: 0 }, { write: true, delete: true }), ['subfolder', 'rename', 'move', 'delete'])
	assert.deepEqual(menuActionsFor({ depth: 0 }, { write: false, delete: true }), ['delete'])
	assert.deepEqual(menuActionsFor({ depth: 4 }, { write: true, delete: false }), ['subfolder', 'rename', 'move'])
	assert.deepEqual(menuActionsFor({ depth: 5 }, { write: true, delete: true }), ['rename', 'move', 'delete'])
})

test('activeKeyOf and tabStopKey: one tab stop, with sensible fallbacks', () => {
	const model = buildFolderTree([dto(1, null, 'A')])
	assert.equal(activeKeyOf(undefined, model), 'all')
	// There is no Unfiled row any more; a stale unfiled scope lands on All media's key.
	assert.equal(activeKeyOf('unfiled', model), 'all')
	assert.equal(activeKeyOf(hex(1), model), `f:${hex(1)}`)
	assert.equal(activeKeyOf(hex(9), model), null)
	assert.equal(activeKeyOf('garbage', model), null)
	const keys = ['all', 'unfiled', 'f:a']
	assert.equal(tabStopKey(keys, 'f:a', 'all'), 'f:a')
	assert.equal(tabStopKey(keys, 'f:gone', 'unfiled'), 'unfiled')
	assert.equal(tabStopKey(keys, null, 'f:gone'), 'all')
	assert.equal(tabStopKey(keys, null, null), 'all')
})

/* -------------------------------------------------------------------------- */
/* Drag payload                                                               */
/* -------------------------------------------------------------------------- */

const A = 'a'.repeat(24)
const B = 'b1'.repeat(12)

test('drag: a valid payload parses, ids lower-cased and de-duplicated in order', () => {
	assert.deepEqual(parseDragIds(JSON.stringify([A, B])), { ok: true, ids: [A, B] })
	assert.deepEqual(parseDragIds(JSON.stringify([A, B, A, B, A])), { ok: true, ids: [A, B] })
	assert.deepEqual(parseDragIds(JSON.stringify([A.toUpperCase()])), { ok: true, ids: [A] })
	assert.deepEqual(parseDragIds(JSON.stringify([A, A.toUpperCase()])), { ok: true, ids: [A] })
	assert.deepEqual(parseDragIds(`  \n${JSON.stringify([A])}\t `), { ok: true, ids: [A] })
})

test('drag: not JSON, wrong shape, wrong types', () => {
	const invalid = (raw) => assert.deepEqual(parseDragIds(raw), { ok: false, reason: 'invalid' }, JSON.stringify(raw)?.slice(0, 40))
	for (const raw of [
		'',
		'not json',
		'{',
		'[',
		`[${A}]`,
		`['${A}']`,
		'null',
		'true',
		'42',
		`"${A}"`,
		JSON.stringify({ ids: [A] }),
		JSON.stringify({ 0: A, length: 1 }),
		JSON.stringify([1, 2, 3]),
		JSON.stringify([null]),
		JSON.stringify([[A]]),
		JSON.stringify([{ id: A }]),
		JSON.stringify([true]),
		JSON.stringify([A, 5]),
		undefined,
		null,
		42,
		{},
		[A],
		Symbol.iterator.toString(),
	])
		invalid(raw)
})

test('drag: non-hex and wrong-length ids reject the whole payload, not just the entry', () => {
	const bad = [
		'g'.repeat(24),
		'a'.repeat(23),
		'a'.repeat(25),
		`${'a'.repeat(23)} `,
		` ${'a'.repeat(23)}`,
		`${A}\n`,
		`${'a'.repeat(23)}\n`,
		`0x${'a'.repeat(22)}`,
		'../'.repeat(8),
		'$ne',
		'{"$gt":""}',
		'ａ'.repeat(24), // full-width letters
		'a'.repeat(12) + 'é' + 'a'.repeat(11),
		'__proto__',
		'',
	]
	for (const id of bad) {
		const result = parseDragIds(JSON.stringify([A, id]))
		assert.deepEqual(result, { ok: false, reason: 'invalid' }, JSON.stringify(id))
	}
})

test('drag: empty array is ignorable, not an error', () => {
	assert.deepEqual(parseDragIds('[]'), { ok: false, reason: 'empty' })
	assert.deepEqual(planDrop('[]'), { type: 'ignore' })
})

test('drag: exactly 500 ids pass; 501 are refused, never cut to 500', () => {
	const ids = (n) => Array.from({ length: n }, (_, i) => hex(i + 1))
	const ok = parseDragIds(JSON.stringify(ids(500)))
	assert.equal(ok.ok, true)
	assert.equal(ok.ids.length, 500)
	assert.deepEqual(parseDragIds(JSON.stringify(ids(501))), { ok: false, reason: 'too-many' })
	assert.equal(MAX_DRAG_IDS, 500)
})

test('drag: 10,000 ids, 10,000 duplicates and megabyte strings are refused fast', () => {
	const t0 = performance.now()
	const many = Array.from({ length: 10_000 }, (_, i) => hex(i + 1))
	assert.deepEqual(parseDragIds(JSON.stringify(many)), { ok: false, reason: 'too-many' })
	assert.deepEqual(parseDragIds(JSON.stringify(Array(10_000).fill(A))), { ok: false, reason: 'too-many' })
	assert.deepEqual(parseDragIds('x'.repeat(10 * 1024 * 1024)), { ok: false, reason: 'too-many' })
	assert.deepEqual(parseDragIds(`[${'['.repeat(100_000)}`), { ok: false, reason: 'too-many' })
	assert.ok(performance.now() - t0 < 500, `took ${performance.now() - t0}ms`)
	// Deep nesting under the size cap is just invalid, and must not throw.
	assert.deepEqual(parseDragIds('['.repeat(5000) + ']'.repeat(5000)), { ok: false, reason: 'invalid' })
})

test('drag: planDrop maps every result to one action', () => {
	assert.deepEqual(planDrop(JSON.stringify([A])), { type: 'move', ids: [A] })
	assert.equal(planDrop('nope').type, 'refuse')
	assert.match(planDrop('nope').message, /could not be moved/)
	const refused = planDrop(JSON.stringify(Array.from({ length: 501 }, (_, i) => hex(i + 1))))
	assert.equal(refused.type, 'refuse')
	assert.match(refused.message, /500/)
	assert.equal(planDrop(undefined).type, 'refuse')
})

test('drag: only a drag that carries our type is accepted (arrays, DOMStringList-likes, hostile)', () => {
	const M = contracts.DRAG_MIME
	assert.equal(carriesMediaIds([M], M), true)
	assert.equal(carriesMediaIds(['Files', M], M), true)
	assert.equal(carriesMediaIds({ length: 2, 0: 'text/plain', 1: M }, M), true)
	assert.equal(carriesMediaIds(Object.freeze([M]), M), true)
	assert.equal(carriesMediaIds(['Files'], M), false)
	assert.equal(carriesMediaIds(['text/plain', 'text/uri-list'], M), false)
	assert.equal(carriesMediaIds([`${M}-extra`], M), false)
	assert.equal(carriesMediaIds([M.toUpperCase()], M), false)
	assert.equal(carriesMediaIds([], M), false)
	assert.equal(carriesMediaIds(null, M), false)
	assert.equal(carriesMediaIds(undefined, M), false)
	assert.equal(carriesMediaIds({}, M), false)
})

/* -------------------------------------------------------------------------- */
/* Persisted expansion                                                        */
/* -------------------------------------------------------------------------- */

const fakeStorage = (initial = {}) => {
	const data = new Map(Object.entries(initial))
	return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => void data.set(k, String(v)) }
}

test('storage: the key is rb.media.folders', () => {
	assert.equal(FOLDERS_STORAGE_KEY, 'rb.media.folders')
})

test('storage: round trip, de-duplicated and lower-cased', () => {
	const store = fakeStorage()
	writeStoredExpanded([hex(1), hex(2), hex(1)], store)
	assert.deepEqual(readStoredExpanded(store), [hex(1), hex(2)])
	assert.deepEqual(JSON.parse(store.data.get('rb.media.folders')), [hex(1), hex(2)])
})

test('storage: hostile or stale values yield only usable ids', () => {
	for (const raw of [null, undefined, '', 'nope', '{}', '"x"', '5', 'null', '[', JSON.stringify({ a: 1 })])
		assert.deepEqual(parseStoredExpanded(raw), [], String(raw))
	assert.deepEqual(parseStoredExpanded(JSON.stringify([hex(1), 5, null, {}, 'zz', 'a'.repeat(23), hex(1)])), [hex(1)])
	assert.deepEqual(parseStoredExpanded(JSON.stringify(['A'.repeat(24)])), ['a'.repeat(24)])
	// Capped at the folder limit, and a huge value is not even parsed.
	const many = Array.from({ length: 5000 }, (_, i) => hex(i + 1))
	assert.equal(parseStoredExpanded(JSON.stringify(many)).length, LIMITS.maxFolders)
	assert.deepEqual(parseStoredExpanded('['.padEnd(300 * 1024, ' ')), [])
})

test('storage: missing, throwing or full storage never throws', () => {
	const throwing = {
		getItem() {
			throw new Error('SecurityError')
		},
		setItem() {
			throw new Error('QuotaExceededError')
		},
	}
	assert.deepEqual(readStoredExpanded(throwing), [])
	assert.doesNotThrow(() => writeStoredExpanded([hex(1)], throwing))
	assert.deepEqual(readStoredExpanded(null), [])
	assert.doesNotThrow(() => writeStoredExpanded([hex(1)], null))
	// No window at all (server): the default path.
	assert.deepEqual(readStoredExpanded(), [])
	assert.doesNotThrow(() => writeStoredExpanded([hex(1)]))
	// A window whose localStorage getter throws (blocked cookies).
	const saved = globalThis.window
	Object.defineProperty(globalThis, 'window', {
		configurable: true,
		value: {
			get localStorage() {
				throw new Error('blocked')
			},
		},
	})
	try {
		assert.deepEqual(readStoredExpanded(), [])
		assert.doesNotThrow(() => writeStoredExpanded([hex(1)]))
	} finally {
		if (saved === undefined) delete globalThis.window
		else globalThis.window = saved
	}
})

/* -------------------------------------------------------------------------- */
/* Names, errors, submit                                                      */
/* -------------------------------------------------------------------------- */

test('names: trimmed, required, 80 characters, no slashes or control characters', () => {
	assert.deepEqual(validateFolderName('  Acme  '), { ok: true, name: 'Acme' })
	assert.deepEqual(validateFolderName('日本の写真'), { ok: true, name: '日本の写真' })
	assert.deepEqual(validateFolderName('a'.repeat(80)), { ok: true, name: 'a'.repeat(80) })
	assert.equal(validateFolderName('a'.repeat(81)).ok, false)
	assert.equal(validateFolderName(`${' '.repeat(10)}${'a'.repeat(81)}`).ok, false)
	assert.deepEqual(validateFolderName(`  ${'a'.repeat(80)}  `), { ok: true, name: 'a'.repeat(80) })
	for (const bad of ['', '   ', '\t', '​', ' ', '​​', undefined, null, 5, {}])
		assert.equal(validateFolderName(bad).ok, false, JSON.stringify(bad))
	for (const bad of ['a/b', 'a\\b', '/', 'a\u0000b', 'a\nb', 'a\u007fb'])
		assert.match(validateFolderName(bad).message, /slashes/, JSON.stringify(bad))
})

test('messageOf: a person-fit message, with fallbacks and a clip', () => {
	assert.equal(messageOf(new Error('A folder named Acme already exists here.')), 'A folder named Acme already exists here.')
	assert.equal(messageOf(new Error('')), 'Something went wrong. Try again.')
	assert.equal(messageOf(new Error('   ')), 'Something went wrong. Try again.')
	assert.equal(messageOf('boom'), 'Something went wrong. Try again.')
	assert.equal(messageOf(undefined, 'custom'), 'custom')
	assert.equal(messageOf({ message: 'x' }), 'Something went wrong. Try again.')
	assert.equal(messageOf(new Error('x'.repeat(5000))).length, 300)
})

await testAsync('attempt: rejection, sync throw, non-Error and success all come back as values', async () => {
	assert.deepEqual(await attempt(async () => {}), { ok: true })
	assert.deepEqual(await attempt(() => 5), { ok: true })
	assert.deepEqual(await attempt(async () => Promise.reject(new Error('Nope.'))), { ok: false, message: 'Nope.' })
	assert.deepEqual(
		await attempt(() => {
			throw new Error('Sync.')
		}),
		{ ok: false, message: 'Sync.' },
	)
	assert.deepEqual(await attempt(() => Promise.reject('plain')), { ok: false, message: 'Something went wrong. Try again.' })
	assert.deepEqual(await attempt(() => Promise.reject(undefined), 'fb'), { ok: false, message: 'fb' })
})

await testAsync('submit: trims, validates, never sends a blank, and shows the server message', async () => {
	const sent = []
	const busy = { current: false }
	const send = async (name) => void sent.push(name)
	assert.deepEqual(await submitFolderName({ value: '  Acme ', busy }, send), { type: 'saved' })
	assert.deepEqual(sent, ['Acme'])
	assert.equal((await submitFolderName({ value: '   ', busy }, send)).type, 'invalid')
	assert.equal((await submitFolderName({ value: 'a/b', busy }, send)).type, 'invalid')
	assert.equal((await submitFolderName({ value: 'x'.repeat(81), busy }, send)).type, 'invalid')
	assert.equal(sent.length, 1, 'nothing invalid reached the server')
	const failing = async () => {
		throw new Error('A folder named Acme already exists here.')
	}
	assert.deepEqual(await submitFolderName({ value: 'Acme', busy }, failing), {
		type: 'failed',
		message: 'A folder named Acme already exists here.',
	})
	assert.equal(busy.current, false, 'a failure releases the lock so the person can retry')
	// A rename to the same name (after trimming) sends nothing.
	assert.deepEqual(await submitFolderName({ value: ' Acme ', initial: 'Acme', busy }, send), { type: 'unchanged' })
	assert.equal(sent.length, 1)
	// A rename to a different name is sent.
	assert.deepEqual(await submitFolderName({ value: 'Acme 2', initial: 'Acme', busy }, send), { type: 'saved' })
	assert.deepEqual(sent, ['Acme', 'Acme 2'])
})

await testAsync('submit: a second submit while one is in flight is dropped (Enter held down)', async () => {
	let release
	let calls = 0
	const gate = new Promise((resolve) => (release = resolve))
	const busy = { current: false }
	const send = async () => {
		calls++
		await gate
	}
	const first = submitFolderName({ value: 'Acme', busy }, send)
	const second = submitFolderName({ value: 'Acme', busy }, send)
	const third = submitFolderName({ value: 'Acme', busy }, send)
	// Release on a timer so a missing guard fails the assertions instead of hanging the proof.
	setTimeout(release, 5)
	const [one, two, three] = await Promise.all([first, second, third])
	assert.deepEqual(two, { type: 'busy' })
	assert.deepEqual(three, { type: 'busy' })
	assert.deepEqual(one, { type: 'saved' })
	assert.equal(calls, 1)
	assert.equal(busy.current, false)
})

await testAsync('submit: a callback that throws synchronously or returns junk cannot escape', async () => {
	const busy = { current: false }
	const thrower = () => {
		throw new Error('Sync boom')
	}
	assert.deepEqual(await submitFolderName({ value: 'A', busy }, thrower), { type: 'failed', message: 'Sync boom' })
	assert.deepEqual(await submitFolderName({ value: 'A', busy }, () => undefined), { type: 'saved' })
	assert.equal(busy.current, false)
})

/* -------------------------------------------------------------------------- */
/* Keyboard map                                                               */
/* -------------------------------------------------------------------------- */

const navItems = [
	{ key: 'all', kind: 'all', parentKey: null, expandable: false, expanded: false },
	{ key: 'unfiled', kind: 'unfiled', parentKey: null, expandable: false, expanded: false },
	{ key: 'review', kind: 'review', parentKey: null, expandable: false, expanded: false },
	{ key: 'f:A', kind: 'folder', parentKey: null, expandable: true, expanded: true },
	{ key: 'f:A1', kind: 'folder', parentKey: 'f:A', expandable: false, expanded: false },
	{ key: 'f:A2', kind: 'folder', parentKey: 'f:A', expandable: true, expanded: false },
	{ key: 'f:B', kind: 'folder', parentKey: null, expandable: true, expanded: false },
	{ key: 'f:C', kind: 'folder', parentKey: null, expandable: true, expanded: true },
]
const full = { write: true, delete: true }
const key = (current, k, can = full, mods = {}) => resolveTreeKey(navItems, current, { key: k, ...mods }, can)

test('keys: Up and Down move one row and stop at the ends', () => {
	assert.deepEqual(key('all', 'ArrowDown'), { type: 'focus', key: 'unfiled' })
	assert.deepEqual(key('f:A', 'ArrowDown'), { type: 'focus', key: 'f:A1' })
	assert.deepEqual(key('f:B', 'ArrowUp'), { type: 'focus', key: 'f:A2' })
	assert.equal(key('all', 'ArrowUp'), null)
	assert.equal(key('f:C', 'ArrowDown'), null)
})

test('keys: Home and End', () => {
	assert.deepEqual(key('f:B', 'Home'), { type: 'focus', key: 'all' })
	assert.deepEqual(key('all', 'End'), { type: 'focus', key: 'f:C' })
})

test('keys: Right expands, then enters; a leaf or a top entry does nothing', () => {
	assert.deepEqual(key('f:B', 'ArrowRight'), { type: 'expand', key: 'f:B' })
	assert.deepEqual(key('f:A', 'ArrowRight'), { type: 'focus', key: 'f:A1' })
	assert.equal(key('f:A1', 'ArrowRight'), null)
	assert.equal(key('all', 'ArrowRight'), null)
	// Expanded and expandable, but its children are not the next rows: nothing to enter.
	assert.equal(key('f:C', 'ArrowRight'), null)
})

test('keys: Left collapses, then goes to the parent; a top-level collapsed folder does nothing', () => {
	assert.deepEqual(key('f:A', 'ArrowLeft'), { type: 'collapse', key: 'f:A' })
	assert.deepEqual(key('f:A1', 'ArrowLeft'), { type: 'focus', key: 'f:A' })
	assert.deepEqual(key('f:A2', 'ArrowLeft'), { type: 'focus', key: 'f:A' })
	assert.equal(key('f:B', 'ArrowLeft'), null)
	assert.equal(key('all', 'ArrowLeft'), null)
})

test('keys: Enter and Space select any row, including Needs review', () => {
	assert.deepEqual(key('f:A1', 'Enter'), { type: 'activate', key: 'f:A1' })
	assert.deepEqual(key('review', ' '), { type: 'activate', key: 'review' })
	assert.deepEqual(key('unfiled', 'Enter', { write: false, delete: false }), { type: 'activate', key: 'unfiled' })
})

test('keys: F2 renames and Delete deletes, only a folder and only with permission', () => {
	assert.deepEqual(key('f:A1', 'F2'), { type: 'rename', key: 'f:A1' })
	assert.equal(key('f:A1', 'F2', { write: false, delete: true }), null)
	assert.equal(key('all', 'F2'), null)
	assert.equal(key('unfiled', 'F2'), null)
	assert.deepEqual(key('f:A1', 'Delete'), { type: 'delete', key: 'f:A1' })
	assert.equal(key('f:A1', 'Delete', { write: true, delete: false }), null)
	assert.equal(key('review', 'Delete'), null)
})

test('keys: the menu opens from the keyboard (ContextMenu, Shift+F10) when there is one', () => {
	assert.deepEqual(key('f:A1', 'ContextMenu'), { type: 'menu', key: 'f:A1' })
	assert.deepEqual(key('f:A1', 'F10', full, { shiftKey: true }), { type: 'menu', key: 'f:A1' })
	assert.equal(key('f:A1', 'F10'), null)
	assert.equal(key('f:A1', 'ContextMenu', { write: false, delete: false }), null)
	assert.deepEqual(key('f:A1', 'ContextMenu', { write: false, delete: true }), { type: 'menu', key: 'f:A1' })
	assert.equal(key('all', 'ContextMenu'), null)
})

test('keys: modified keys, typing, Tab and unknown rows are left to the browser', () => {
	for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
		assert.equal(key('f:A', 'ArrowDown', full, mods), null)
		assert.equal(key('f:A1', 'Delete', full, mods), null)
		assert.equal(key('f:A1', 'Enter', full, mods), null)
	}
	for (const k of ['Tab', 'a', 'Escape', 'PageDown', 'Backspace', 'Shift', ''])
		assert.equal(key('f:A', k), null, k)
	assert.equal(key('f:missing', 'ArrowDown'), null)
	assert.equal(resolveTreeKey([], 'x', { key: 'ArrowDown' }, full), null)
})

/* -------------------------------------------------------------------------- */
/* Delete wording                                                             */
/* -------------------------------------------------------------------------- */

test('delete: says images and subfolders move up and nothing is deleted', () => {
	const text = deleteExplanation({ id: 'x', name: 'Acme', images: 12, subfolders: 2, destination: 'Clients' })
	assert.match(text, /No images are deleted/)
	assert.match(text, /12 images and 2 subfolders/)
	assert.match(text, /move up to "Clients"/)
	assert.match(deleteExplanation({ id: 'x', name: 'A', images: 1, subfolders: 0, destination: null }), /1 image move up to All media/)
	assert.match(deleteExplanation({ id: 'x', name: 'A', images: 0, subfolders: 1, destination: 'P' }), /1 subfolder move up/)
	assert.match(deleteExplanation({ id: 'x', name: 'A', images: 0, subfolders: 0, destination: 'P' }), /empty/)
	assert.match(deleteExplanation({ id: 'x', name: 'A', images: 1200, subfolders: 0, destination: null }), /1,200 images/)
	assert.ok(deleteExplanation({ id: 'x', name: 'A', images: 1, subfolders: 0, destination: 'x'.repeat(500) }).length < 200)
})

/* -------------------------------------------------------------------------- */
/* FolderTree markup                                                          */
/* -------------------------------------------------------------------------- */

test('tree: empty library renders the top entries and nothing else', () => {
	const { html, warnings } = render({})
	assert.deepEqual(warnings, [])
	const items = treeitems(html)
	assert.deepEqual(items.map((i) => i['aria-label']), ['All media, 0 images'])
	assert.match(html, /role="tree"/)
	assert.ok(!html.includes('Needs review'))
	assert.ok(!html.includes('Saved searches'))
	assert.equal(items.filter((i) => i['aria-selected'] === 'true').length, 1)
	assert.equal(keyed(items, 'All media')['aria-selected'], 'true')
})

test('tree: one folder, counts and ARIA position', () => {
	const { html, warnings } = render({
		folders: [dto(1, null, 'Acme', 3, 3)],
		total: 3,
		unfiled: 0,
	})
	assert.deepEqual(warnings, [])
	const items = treeitems(html)
	const acme = keyed(items, 'Acme')
	assert.equal(acme['aria-label'], 'Acme, 3 images')
	assert.equal(acme['aria-level'], '1')
	assert.equal(acme['aria-setsize'], '1')
	assert.equal(acme['aria-posinset'], '1')
	assert.equal(acme['aria-selected'], 'false')
	assert.ok(!('aria-expanded' in acme), 'a leaf does not claim to be expandable')
	assert.equal(acme.tabindex, '-1')
})

test('tree: singular and thousands separators in names and counts', () => {
	const { html } = render({
		folders: [dto(1, null, 'One', 1, 1), dto(2, null, 'Many', 1284, 1284)],
		total: 1284,
		unfiled: 1,
	})
	const labels = treeitems(html).map((i) => i['aria-label'])
	assert.ok(labels.includes('All media, 1,284 images'))
	assert.ok(!labels.some((l) => l.startsWith('Unfiled')), 'there is no Unfiled row')
	assert.ok(labels.includes('One, 1 image'))
	assert.ok(labels.includes('Many, 1,284 images'))
	assert.ok(textOf(html).includes('1,284'))
})

test('tree: 30 folders, 4 levels, active folder expanded with its ancestors only', () => {
	const { list, kids, parentOf, tops } = thirtyFolders()
	// Independent expectation: walk the spec structure by hand.
	const activeId = kids.get(kids.get(kids.get(tops[0])[1])[0])[0]
	const chain = new Set()
	for (let cursor = parentOf.get(activeId); cursor !== null; cursor = parentOf.get(cursor)) chain.add(cursor)
	assert.equal(chain.size, 3)
	const expectVisible = []
	const walk = (id, level) => {
		expectVisible.push({ id, level })
		if (chain.has(id)) for (const kid of kids.get(id) ?? []) walk(kid, level + 1)
	}
	for (const top of tops) walk(top, 1)

	const { html, warnings } = render({ folders: list, total: 500, unfiled: 20, active: hex(activeId) })
	assert.deepEqual(warnings, [])
	const folderItems = treeitems(html).filter((i) => i['aria-level'] && !['All media', 'Unfiled'].some((n) => i['aria-label'].startsWith(n)))
	assert.equal(folderItems.length, expectVisible.length)
	const byName = new Map(list.map((f) => [f.name, f]))
	folderItems.forEach((item, i) => {
		const name = item['aria-label'].replace(/, \d+ images?$/, '')
		const f = byName.get(name)
		assert.equal(f.id, hex(expectVisible[i].id), `row ${i} order`)
		assert.equal(item['aria-level'], String(expectVisible[i].level))
		if (kids.has(Number.parseInt(f.id, 16)))
			assert.equal(item['aria-expanded'], chain.has(Number.parseInt(f.id, 16)) ? 'true' : 'false', name)
		else assert.ok(!('aria-expanded' in item), `${name} is a leaf`)
	})
	const selected = treeitems(html).filter((i) => i['aria-selected'] === 'true')
	assert.equal(selected.length, 1)
	assert.match(selected[0]['aria-label'], /Archive|Clients|Brand/)
	assert.equal(selected[0]['aria-level'], '4')
	// The tab stop is the selected row.
	const stops = treeitems(html).filter((i) => i.tabindex === '0')
	assert.equal(stops.length, 1)
	assert.equal(stops[0]['aria-selected'], 'true')
})

test('tree: ARIA set size and position are right among siblings', () => {
	const { list, kids, tops } = thirtyFolders()
	const { html } = render({ folders: list, active: hex(kids.get(tops[0])[1]) })
	const items = treeitems(html)
	const second = items.filter((i) => i['aria-level'] === '2')
	assert.equal(second.length, 3)
	second.forEach((item, i) => {
		assert.equal(item['aria-setsize'], '3')
		assert.equal(item['aria-posinset'], String(i + 1))
	})
	const tops3 = items.filter((i) => i['aria-level'] === '1' && i['aria-setsize'])
	assert.deepEqual(tops3.map((i) => i['aria-posinset']), ['1', '2', '3'])
})

test('tree: a collapsed branch hides its children but the count of the folder includes them', () => {
	const { list } = thirtyFolders()
	const withTotal = list.map((f) => (f.parentId === null ? { ...f, total: 40 } : f))
	const { html } = render({ folders: withTotal })
	const items = treeitems(html)
	assert.equal(items.length, 1 + 3)
	assert.ok(items.some((i) => i['aria-label'] === 'Clients, 40 images'))
	assert.equal(keyed(items, 'Clients')['aria-expanded'], 'false')
})

test('tree: Needs review appears only when there is something to review', () => {
	const shown = render({ unreviewed: 12 })
	const review = keyed(treeitems(shown.html), 'Needs review')
	assert.equal(review['aria-label'], 'Needs review, 12 images')
	assert.equal(review['aria-selected'], 'false')
	assert.ok(textOf(shown.html).includes('Needs review'))
	assert.ok(textOf(shown.html).includes('12'))
	for (const unreviewed of [0, -3, Number.NaN, undefined, null, '7', Infinity])
		assert.ok(!render({ unreviewed }).html.includes('Needs review'), String(unreviewed))
	assert.equal(keyed(treeitems(render({ unreviewed: 1 }).html), 'Needs review')['aria-label'], 'Needs review, 1 image')
})

test('tree: Needs review sits between All media and the folders', () => {
	const labels = treeitems(render({ unreviewed: 4, folders: [dto(1, null, 'Acme')] }).html).map((i) => i['aria-label'])
	assert.deepEqual(labels.map((l) => l.split(',')[0]), ['All media', 'Needs review', 'Acme'])
})

test('tree: selection variants (All media, a folder, an unknown folder)', () => {
	const folders = [dto(1, null, 'Acme'), dto(2, 1, 'Hero')]
	const only = (html) => treeitems(html).filter((i) => i['aria-selected'] === 'true').map((i) => i['aria-label'].split(',')[0])
	assert.deepEqual(only(render({ folders, active: undefined }).html), ['All media'])
	// A stale unfiled scope has no row to select.
	assert.deepEqual(only(render({ folders, active: 'unfiled' }).html), [])
	assert.deepEqual(only(render({ folders, active: hex(1) }).html), ['Acme'])
	assert.deepEqual(only(render({ folders, active: hex(2) }).html), ['Acme', 'Hero'].slice(1))
	// A selection that is not in the list (deleted elsewhere) selects nothing but still leaves one tab stop.
	const gone = render({ folders, active: hex(77) })
	assert.deepEqual(only(gone.html), [])
	assert.equal(treeitems(gone.html).filter((i) => i.tabindex === '0').length, 1)
	assert.equal(keyed(treeitems(gone.html), 'All media').tabindex, '0')
})

test('tree: the ancestors of the active folder are open, and the page is the same without storage', () => {
	const folders = [dto(1, null, 'Acme'), dto(2, 1, 'Hero'), dto(3, 2, 'Deep'), dto(4, null, 'Other'), dto(5, 4, 'Hidden')]
	const plain = render({ folders, active: hex(3) }).html
	const labels = treeitems(plain).map((i) => i['aria-label'].split(',')[0])
	assert.deepEqual(labels, ['All media', 'Acme', 'Hero', 'Deep', 'Other'])
	// Storage is not read while rendering (it would make the server and client first paints differ).
	const saved = globalThis.window
	globalThis.window = {
		localStorage: {
			getItem: () => JSON.stringify([hex(4)]),
			setItem() {},
		},
	}
	try {
		assert.equal(render({ folders, active: hex(3) }).html, plain)
	} finally {
		if (saved === undefined) delete globalThis.window
		else globalThis.window = saved
	}
})

test('tree: permission variants hide the right controls', () => {
	const folders = [dto(1, null, 'Acme')]
	const saved = [{ id: hex(9), name: 'Kitchens', query: 'tag:kitchen', folder: null, sort: null, createdAt: '2026-01-01T00:00:00Z' }]
	const names = (html) => buttons(html).map((b) => b.attrs['aria-label'] ?? b.text)
	const viewer = names(render({ folders, saved, canWrite: false, canDelete: false }).html)
	assert.deepEqual(viewer.filter((n) => /New folder|Actions for|Delete saved/.test(n)), [])
	assert.ok(viewer.includes('') === false)
	const writer = names(render({ folders, saved, canWrite: true, canDelete: false }).html)
	assert.ok(writer.includes('New folder'))
	assert.ok(writer.includes('Actions for Acme'))
	assert.ok(writer.includes('Delete saved search Kitchens'))
	const deleter = names(render({ folders, saved, canWrite: false, canDelete: true }).html)
	assert.ok(!deleter.includes('New folder'), 'creating needs write')
	assert.ok(deleter.includes('Actions for Acme'), 'the menu still offers Delete')
	assert.ok(!deleter.includes('Delete saved search Kitchens'), 'saved searches follow write')
})

test('tree: saved searches listed when present, hidden when none', () => {
	const saved = [
		{ id: hex(1), name: 'Kitchens', query: 'tag:kitchen', folder: null, sort: null, createdAt: '2026-01-01T00:00:00Z' },
		{ id: hex(2), name: '', query: 'type:png', folder: null, sort: null, createdAt: '2026-01-01T00:00:00Z' },
	]
	const shown = render({ saved }).html
	assert.ok(textOf(shown).includes('Saved searches'))
	assert.ok(textOf(shown).includes('Kitchens'))
	assert.ok(textOf(shown).includes('type:png'), 'a blank name falls back to the query')
	assert.match(shown, /<section aria-labelledby="[^"]+"/)
	for (const none of [[], undefined, null, 'x', [null, undefined, {}, { id: 5 }]])
		assert.ok(!render({ saved: none }).html.includes('Saved searches'), JSON.stringify(none))
})

test('tree: a permission-less viewer gets a read-only tree (no controls, still navigable)', () => {
	const { html } = render({ folders: [dto(1, null, 'Acme')], canWrite: false, canDelete: false, unreviewed: 2 })
	assert.deepEqual(buttons(html).filter((b) => !b.attrs['aria-label']), [])
	assert.equal(buttons(html).length, 0)
	assert.equal(treeitems(html).length, 3)
})

test('tree: hostile names are escaped and cannot become markup', () => {
	const evil = ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "'; DROP TABLE", '</li></ul><b>x</b>', '&amp;&lt;']
	const { html, warnings } = render({ folders: evil.map((name, i) => dto(i + 1, null, name)) })
	assert.deepEqual(warnings, [])
	assert.ok(!html.includes('<img src=x'))
	assert.ok(!html.includes('<script>'))
	assert.ok(!html.includes('<b>x</b>'))
	const labels = treeitems(html).map((i) => i['aria-label'])
	for (const name of evil) assert.ok(labels.some((l) => l.startsWith(`${name},`)), name)
	assert.equal(treeitems(html).length, 1 + evil.length)
})

test('tree: very long, unicode and blank names render', () => {
	const { html, warnings } = render({
		folders: [dto(1, null, 'x'.repeat(5000)), dto(2, null, '日本の写真 🌅'), dto(3, null, ''), dto(4, null, '   ')],
	})
	assert.deepEqual(warnings, [])
	const labels = treeitems(html).map((i) => i['aria-label'])
	assert.ok(labels.some((l) => l.startsWith('日本の写真 🌅,')))
	assert.equal(labels.filter((l) => l.startsWith('Untitled folder,')).length, 2)
	assert.ok(html.includes('truncate'), 'long names truncate in CSS rather than breaking the rail')
})

test('tree: malformed counts and props never print NaN, undefined or null', () => {
	const folders = [
		{ ...dto(1, null, 'A'), count: undefined, total: Number.NaN },
		{ ...dto(2, null, 'B'), count: '5', total: -4 },
		{ ...dto(3, null, 'C'), total: 1e21 },
		{ ...dto(4, null, 'D'), total: Infinity },
	]
	const { html, warnings } = render({ folders, total: undefined, unfiled: Number.NaN })
	assert.deepEqual(warnings, [])
	const text = textOf(html)
	for (const bad of ['NaN', 'undefined', 'null', '-4', 'Infinity']) assert.ok(!text.includes(bad), bad)
	const labels = treeitems(html).map((i) => i['aria-label'])
	assert.ok(labels.includes('All media, 0 images'))
	assert.ok(labels.includes('A, 0 images'))
	assert.ok(labels.includes('B, 0 images'))
	assert.ok(labels.includes('D, 0 images'))
})

test('tree: malformed folder lists (null, duplicates, cycles, orphans) render every folder once', () => {
	for (const folders of [null, undefined, {}, 'x']) assert.equal(treeitems(render({ folders }).html).length, 1)
	const messy = [dto(1, 2, 'A'), dto(2, 1, 'B'), dto(3, 99, 'Orphan'), dto(3, null, 'Dup'), dto(4, 4, 'Self')]
	const { html, warnings } = render({ folders: messy, active: hex(2) })
	assert.deepEqual(warnings, [])
	const names = treeitems(html).map((i) => i['aria-label'].split(',')[0])
	for (const n of ['Orphan', 'Self']) assert.ok(names.includes(n), n)
	assert.ok(!names.includes('Dup'))
	assert.equal(new Set(names).size, names.length, 'no folder twice')
})

test('tree: 1000 folders in a chain render quickly and the indent is capped', () => {
	const folders = []
	for (let i = 1; i <= 1000; i++) folders.push(dto(i, i === 1 ? null : i - 1, `F${i}`))
	const t0 = performance.now()
	const { html, warnings } = render({ folders, active: hex(1000) })
	assert.deepEqual(warnings, [])
	assert.ok(performance.now() - t0 < 3000, `took ${performance.now() - t0}ms`)
	assert.equal(treeitems(html).length, 1001)
	const pads = [...html.matchAll(/padding-left:([\d.]+)rem/g)].map((m) => Number(m[1]))
	assert.ok(Math.max(...pads) <= 8.5, `max indent ${Math.max(...pads)}rem`)
	assert.equal(keyed(treeitems(html), 'F1000')['aria-level'], '1000')
})

test('tree: 1000 sibling folders render once each', () => {
	const folders = Array.from({ length: 1000 }, (_, i) => dto(i + 1, null, `Folder ${i + 1}`))
	const { html, warnings } = render({ folders })
	assert.deepEqual(warnings, [])
	assert.equal(treeitems(html).length, 1001)
	assert.equal(keyed(treeitems(html), 'Folder 1000')['aria-posinset'], '1000')
})

/* ---- accessibility, read from the markup ---- */

const a11yCases = {
	'empty': {},
	'full writer': (() => {
		const { list, kids, tops } = thirtyFolders()
		return {
			folders: list,
			total: 600,
			unfiled: 12,
			unreviewed: 4,
			active: hex(kids.get(tops[1])[0]),
			saved: [{ id: hex(90), name: 'Kitchens', query: 'tag:kitchen', folder: null, sort: null, createdAt: '' }],
		}
	})(),
	'viewer': { folders: [dto(1, null, 'Acme', 2)], canWrite: false, canDelete: false, unreviewed: 1 },
}

for (const [name, props] of Object.entries(a11yCases)) {
	test(`a11y (${name}): roles, names and ids`, () => {
		const { html, warnings } = render(props)
		assert.deepEqual(warnings, [])
		assert.equal((html.match(/role="tree"/g) ?? []).length, 1)
		const tree = readAttrs(html.match(/<ul\b[^>]*role="tree"[^>]*>/)[0])
		assert.ok(tree['aria-labelledby'], 'the tree is labelled')
		assert.ok(html.includes(`id="${tree['aria-labelledby']}"`), 'and the label exists')
		assert.match(html, /<nav[^>]*aria-label="[^"]+"/)
		const items = treeitems(html)
		assert.ok(items.length >= 1)
		for (const item of items) {
			assert.ok(item['aria-label'] && item['aria-label'].length > 0, 'treeitem has a name')
			assert.ok(['true', 'false'].includes(item['aria-selected']), `aria-selected on ${item['aria-label']}`)
			assert.ok(['0', '-1'].includes(item.tabindex), `tabindex on ${item['aria-label']}`)
			assert.ok(Number(item['aria-level']) >= 1)
			if (item['aria-setsize']) assert.ok(Number(item['aria-posinset']) <= Number(item['aria-setsize']))
			if ('aria-expanded' in item) assert.ok(['true', 'false'].includes(item['aria-expanded']))
		}
		assert.equal(items.filter((i) => i.tabindex === '0').length, 1, 'exactly one tab stop among the rows')
		assert.ok(!/tabindex="[1-9]/.test(html), 'no positive tabindex')
		// Every control has a name; every glyph is hidden from assistive tech.
		for (const b of buttons(html)) assert.ok(b.attrs['aria-label'] || b.text, `unnamed button: ${JSON.stringify(b.attrs)}`)
		for (const m of html.matchAll(/<svg\b[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/)
		const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
		assert.equal(new Set(ids).size, ids.length, 'ids are unique')
		// Order on the page: only rows are tree children.
		const treeHtml = html.slice(html.indexOf('role="tree"'), html.indexOf('</ul>', html.indexOf('role="tree"')))
		assert.ok(!/<(a|input)\b/.test(treeHtml), 'no stray interactive elements in the tree')
	})
}

test('a11y: the per-folder menu button is a real button, named for its folder, and only the focused row tabs to it', () => {
	const { list, kids, tops } = thirtyFolders()
	const { html } = render({ folders: list, active: hex(kids.get(tops[0])[0]) })
	const menus = buttons(html).filter((b) => b.attrs['aria-label']?.startsWith('Actions for '))
	assert.equal(menus.length, treeitems(html).length - 1)
	assert.equal(menus.filter((b) => b.attrs.tabindex === '0').length, 1)
	for (const b of menus) {
		assert.equal(b.attrs.type, 'button')
		assert.equal(b.attrs['aria-haspopup'], 'menu')
		assert.equal(b.attrs['aria-expanded'], 'false')
	}
	// Expand toggles are labelled too, and out of the tab order (arrow keys do this).
	const toggles = buttons(html).filter((b) => /^(Expand|Collapse) /.test(b.attrs['aria-label'] ?? ''))
	assert.ok(toggles.length >= 3)
	for (const t of toggles) assert.equal(t.attrs.tabindex, '-1')
})

test('a11y: motion is opt-out-able (the chevron turn respects prefers-reduced-motion)', () => {
	const { html } = render({ folders: [dto(1, null, 'A'), dto(2, 1, 'B')], active: hex(2) })
	assert.match(html, /motion-reduce:transition-none/)
})

test('a11y: selection is not conveyed by colour alone (a bar and a heavier weight)', () => {
	const { html } = render({})
	assert.match(html, /font-semibold[^"]*before:bg-brand/)
})

/* -------------------------------------------------------------------------- */
/* Inline form and dialogs: markup                                            */
/* -------------------------------------------------------------------------- */

test('name form: a labelled, length-limited field with no error showing', () => {
	const html = renderToString(h(FolderNameForm, { label: 'Name for the new folder', onSubmit: asyncNoop, onCancel: noop, onDone: noop }))
	const input = readAttrs(html.match(/<input\b[^>]*>/)[0])
	assert.equal(input['aria-label'], 'Name for the new folder')
	assert.equal(input.maxLength, '80')
	assert.equal(input.autoComplete, 'off')
	assert.ok(!('disabled' in input))
	assert.ok(!('aria-invalid' in input))
	assert.ok(!html.includes('role="alert"'))
	assert.match(html, /<form\b/)
})

test('name form: rename starts with the current name', () => {
	const html = renderToString(h(FolderNameForm, { label: 'Rename Acme', initial: 'Acme', onSubmit: asyncNoop, onCancel: noop, onDone: noop }))
	assert.equal(readAttrs(html.match(/<input\b[^>]*>/)[0]).value, 'Acme')
})

test('delete dialog: mounts without throwing (its content is portalled, so nothing renders on the server)', () => {
	const html = renderToString(
		h(DeleteFolderDialog, {
			info: { id: 'x', name: 'Acme', images: 3, subfolders: 1, destination: null },
			onConfirm: asyncNoop,
			onClose: noop,
			restoreFocus: noop,
		}),
	)
	assert.equal(typeof html, 'string')
})

/* -------------------------------------------------------------------------- */
/* MoveDialog                                                                 */
/* -------------------------------------------------------------------------- */

const moveFolders = [dto(1, null, 'Clients'), dto(2, 1, 'Acme'), dto(3, 2, 'Hero'), dto(4, null, 'Brand')]

const bodyProps = (over = {}) => ({
	folders: moveFolders,
	confirmLabel: 'Move here',
	onConfirm: asyncNoop,
	onClose: noop,
	busy: { current: false },
	...over,
})

function renderBody(over) {
	const before = reactErrors.length
	const html = renderToString(h(MoveDialogBody, bodyProps(over)))
	return { html, warnings: reactErrors.slice(before) }
}
const radios = (html) =>
	[...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map((m) => {
		const tag = m[1].match(/<input\b[^>]*>/)[0]
		return { attrs: readAttrs(tag), checked: /\schecked(=|\s|>)/.test(tag), disabled: /\sdisabled(=|\s|>)/.test(tag), text: textOf(m[1]).trim() }
	})

test('move dialog: open and closed render without throwing (portalled content is a browser concern)', () => {
	const before = reactErrors.length
	const props = { onOpenChange: noop, title: 'Move "Acme"', folders: moveFolders, confirmLabel: 'Move', onConfirm: asyncNoop }
	assert.equal(typeof renderToString(h(MoveDialog, { ...props, open: true })), 'string')
	assert.equal(typeof renderToString(h(MoveDialog, { ...props, open: false })), 'string')
	assert.deepEqual(reactErrors.slice(before), [])
})

test('move dialog: first choice is the library root; every folder follows, indented in tree order', () => {
	const { html, warnings } = renderBody({})
	assert.deepEqual(warnings, [])
	const rows = radios(html)
	assert.equal(rows.length, 5)
	assert.match(rows[0].text, /^All media \(no folder\)/)
	assert.deepEqual(rows.slice(1).map((r) => r.text.split(',')[0].replace(/ Current| Not available/g, '').trim()), ['Clients', 'Acme', 'Hero', 'Brand'])
	const pads = [...html.matchAll(/padding-left:([\d.]+)rem/g)].map((m) => Number(m[1]))
	assert.deepEqual(pads, [0.5, 1.5, 2.5, 3.5, 1.5])
	assert.equal(new Set(rows.map((r) => r.attrs.name)).size, 1, 'one radio group')
	assert.ok(rows.every((r) => r.attrs.type === 'radio'))
	assert.match(html, /role="radiogroup"[^>]*aria-label="Destination folder"|aria-label="Destination folder"[^>]*role="radiogroup"/)
})

test('move dialog: disabled ids are greyed and unselectable, with a text reason', () => {
	const { html } = renderBody({ disabledIds: new Set([hex(2), hex(3)]) })
	const rows = radios(html)
	assert.deepEqual(rows.map((r) => r.disabled), [false, false, true, true, false])
	assert.equal(rows.filter((r) => /Not available/.test(r.text)).length, 2)
	assert.match(html, /has-\[:disabled\]:cursor-not-allowed/)
})

test('move dialog: currentId is preselected and marked Current; Move is off until it changes', () => {
	const { html } = renderBody({ currentId: hex(2) })
	const rows = radios(html)
	assert.deepEqual(rows.map((r) => r.checked), [false, false, true, false, false])
	assert.equal(rows.filter((r) => /Current/.test(r.text)).length, 1)
	assert.match(rows[2].text, /Current/)
	const submit = buttons(html).find((b) => b.attrs.type === 'submit')
	assert.equal(submit.text, 'Move here')
	assert.ok('disabled' in submit.attrs, 'Move is disabled while nothing differs')
})

test('move dialog: currentId null preselects the root; undefined and unknown select nothing', () => {
	assert.deepEqual(radios(renderBody({ currentId: null }).html).map((r) => r.checked), [true, false, false, false, false])
	assert.match(radios(renderBody({ currentId: null }).html)[0].text, /Current/)
	for (const currentId of [undefined, hex(99), 'garbage'])
		assert.ok(radios(renderBody({ currentId }).html).every((r) => !r.checked), String(currentId))
	const submit = buttons(renderBody({ currentId: undefined }).html).find((b) => b.attrs.type === 'submit')
	assert.ok('disabled' in submit.attrs, 'nothing chosen, nothing to confirm')
})

test('move dialog: the picker is scrollable and its radios are named', () => {
	const { html } = renderBody({ currentId: hex(3) })
	assert.match(html, /max-h-72 overflow-y-auto/)
	// A nested folder is announced with its parent so duplicate names are told apart.
	const hero = radios(html).find((r) => r.text.startsWith('Hero'))
	assert.match(hero.text, /inside Clients\/Acme|inside Acme/)
	assert.ok(buttons(html).some((b) => b.text === 'Cancel'))
	assert.ok(!html.includes('role="alert"'))
})

test('move dialog: a long hostile tree (1000 folders, cycles) renders every folder once', () => {
	const folders = Array.from({ length: 1000 }, (_, i) => dto(i + 1, i === 0 ? 2 : i === 1 ? 1 : i, `F${i + 1}`))
	const { html, warnings } = renderBody({ folders, currentId: hex(500) })
	assert.deepEqual(warnings, [])
	assert.equal(radios(html).length, 1001)
	assert.equal(radios(html).filter((r) => r.checked).length, 1)
	const names = radios(html).slice(1).map((r) => r.attrs.value)
	assert.equal(new Set(names).size, 1000)
})

test('move dialog: hostile folder names are escaped', () => {
	const { html } = renderBody({ folders: [dto(1, null, '<img src=x onerror=alert(1)>')] })
	assert.ok(!html.includes('<img src=x'))
})

test('move dialog: confirm rules (initial choice and canConfirmMove)', () => {
	const model = buildFolderTree(moveFolders)
	assert.equal(initialChoice(model, hex(2)), hex(2))
	assert.equal(initialChoice(model, null), null)
	assert.equal(initialChoice(model, undefined), undefined)
	assert.equal(initialChoice(model, hex(99)), undefined)
	const can = (selected, extra = {}) => canConfirmMove({ model, selected, ...extra })
	assert.equal(can(undefined), false, 'nothing chosen')
	assert.equal(can(hex(4)), true, 'a real folder, current unknown')
	assert.equal(can(null), true, 'the root is a destination')
	assert.equal(can(hex(4), { currentId: hex(4) }), false, 'where it already is')
	assert.equal(can(null, { currentId: null }), false, 'already at the root')
	assert.equal(can(hex(4), { currentId: hex(2) }), true)
	assert.equal(can(hex(4), { disabledIds: new Set([hex(4)]) }), false, 'a disabled folder is never allowed')
	assert.equal(can(hex(99)), false, 'a folder that is not in the list')
	assert.equal(can(null, { disabledIds: new Set([hex(1)]) }), true, 'the root cannot be disabled')
})

test('move dialog: FolderPicker marks a disabled current folder without making it confirmable', () => {
	const model = buildFolderTree(moveFolders)
	const html = renderToString(h(FolderPicker, { model, name: 'g', selected: hex(2), disabledIds: new Set([hex(2)]), currentId: hex(2), onSelect: noop }))
	const rows = radios(html)
	assert.ok(rows[2].checked && rows[2].disabled)
	assert.match(rows[2].text, /Current/)
	assert.match(rows[2].text, /Not available/)
	assert.equal(canConfirmMove({ model, selected: hex(2), currentId: hex(2), disabledIds: new Set([hex(2)]) }), false)
})

/* -------------------------------------------------------------------------- */

console.error = realError
console.log(`\n${passed} passed, ${failed} failed`)
if (reactErrors.length) console.log(`(${reactErrors.length} React console messages were captured during renders)`)
finished = true
process.exit(failed ? 1 : 0)
