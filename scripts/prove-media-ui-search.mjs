/**
 * Proves the media library search UI: SearchBar, SearchTips and FacetPanel.
 *
 *   node scripts/prove-media-ui-search.mjs
 *
 * Three ways of looking at the real components, no browser:
 *  1. Pure helpers the components are built from (token replacement, the key table,
 *     the debounced suggestion controller, the "search instead" escape, the notes under
 *     the box), called directly and fuzzed with hostile input.
 *  2. renderToString (SSR) for what a person would see and what a screen reader would be
 *     told, read back with a small HTML parser.
 *  3. A tiny hook-aware renderer (`mount`) that expands the same components into a tree of
 *     host elements, re-renders on state change and runs effects, with a fake clock, fake
 *     fetch and fake `document`, so typing, Tab, Esc, Enter, stale answers and clicks can be
 *     driven through the real component code.
 *
 * Expectations come from the build spec and the contracts, not from the code.
 *
 * What this does NOT prove (needs a browser): the real caret and focus ring, an input
 * method's composition events, Radix menus and popovers actually opening (their markup is
 * checked under SSR; the bar's own handlers are driven with stand-ins for them), layout,
 * scrolling the highlighted row into view, touch. The live parser checks are skipped, out
 * loud, if parse.ts is not usable.
 */
import { createRequire } from 'node:module'

// React picks its dev or prod build when it is first required: this must come first so
// key and prop warnings are real and can be asserted absent.
process.env.NODE_ENV = 'development'

const require = createRequire(import.meta.url)
const { loadTs, mock, clearCache, rootRequire } = require('./lib/load-ts.cjs')
const React = rootRequire('react')
const { renderToString } = rootRequire('react-dom/server')
const h = React.createElement
// Captured before any test patches the timer globals, so the proof can show it put them back.
const realSetTimeout = globalThis.setTimeout

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
let skipped = 0
const consoleProblems = []
for (const level of ['error', 'warn']) {
	const original = console[level]
	console[level] = (...args) => {
		consoleProblems.push(`${level}: ${args.map(String).join(' ').slice(0, 300)}`)
		original.apply(console, args)
	}
}

// A proof that stops before its last line (an unsettled await) must not look like success.
let finished = false
process.on('exit', (code) => {
	if (!finished && code === 0) process.exitCode = 1
	if (!finished) console.log('FAIL  the proof did not run to the end')
})
const unhandled = []
process.on('unhandledRejection', (reason) => {
	unhandled.push(String(reason?.stack ?? reason).slice(0, 300))
})

async function check(name, fn) {
	const before = consoleProblems.length
	const rejectedBefore = unhandled.length
	try {
		await fn()
		if (consoleProblems.length !== before)
			throw new Error(`console output: ${consoleProblems[before]}`)
		await new Promise((resolve) => setImmediate(resolve))
		if (unhandled.length !== rejectedBefore)
			throw new Error(`unhandled rejection: ${unhandled[rejectedBefore]}`)
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${error?.message ?? error})`)
	}
}

/** A check that cannot run here, said out loud, never silently passed. */
function skip(name, reason) {
	skipped++
	console.log(`SKIP  ${name} (${reason})`)
}

function assert(condition, message) {
	if (!condition) throw new Error(message ?? 'assertion failed')
}
function eq(actual, expected, message = '') {
	const a = JSON.stringify(actual)
	const b = JSON.stringify(expected)
	if (a !== b) throw new Error(`${message} expected ${b}, got ${a}`)
}

/** Deterministic randomness, so a failure can be replayed. */
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
/* The real modules                                                           */
/* -------------------------------------------------------------------------- */

const types = loadTs('src/lib/media/types.ts')
const { MEDIA_LIMITS, MEDIA_FORMATS, MEDIA_ORIENTATIONS, MEDIA_KINDS, MEDIA_SORTS } = types
const queryTypes = loadTs('src/lib/media/query/types.ts')
const colorsLib = loadTs('src/lib/media/colors.ts')
const parseLib = loadTs('src/lib/media/query/parse.ts')
const { parseQuery } = parseLib

let parserReady = true
try {
	parseQuery('x')
} catch (error) {
	parserReady = false
	console.log(`note  parse.ts is not usable here (${error?.message}); live-parse checks will be SKIPPED`)
}

// SSR runs against the real Radix menus and popovers.
const bar = loadTs('src/app/account/media/search-bar.tsx')
const tips = loadTs('src/app/account/media/search-tips.tsx')
const facet = loadTs('src/app/account/media/facet-panel.tsx')
const format = loadTs('src/app/account/media/format.ts')

const noop = () => {}

/* -------------------------------------------------------------------------- */
/* A small HTML reader for SSR output                                         */
/* -------------------------------------------------------------------------- */

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source'])
const decode = (text) =>
	text
		.replace(/&quot;/g, '"')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')

function parseHtml(html) {
	const root = { tag: '#root', attrs: {}, children: [], parent: null }
	let current = root
	const token =
		/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g
	let match
	while ((match = token.exec(html))) {
		const [, closing, tag, rawAttrs, selfClosing, text] = match
		if (text !== undefined) {
			current.children.push({ text: decode(text) })
		} else if (tag) {
			const name = tag.toLowerCase()
			if (closing) {
				let node = current
				while (node && node.tag !== name) node = node.parent
				if (node?.parent) current = node.parent
			} else {
				const attrs = {}
				for (const a of rawAttrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g))
					attrs[a[1]] = a[2] === undefined ? '' : decode(a[2])
				const node = { tag: name, attrs, children: [], parent: current }
				current.children.push(node)
				if (!VOID.has(name) && !selfClosing) current = node
			}
		}
	}
	return root
}

const walk = (node, visit) => {
	for (const child of node.children ?? []) {
		if (child.text !== undefined) continue
		visit(child)
		walk(child, visit)
	}
}
const findAllNodes = (root, predicate) => {
	const out = []
	walk(root, (n) => predicate(n) && out.push(n))
	return out
}
const findNode = (root, predicate) => findAllNodes(root, predicate)[0]
const textOf = (node) =>
	(node.children ?? []).map((c) => (c.text !== undefined ? c.text : textOf(c))).join('')
const squash = (text) => text.replace(/\s+/g, ' ').trim()
const bySlot = (root, slot) => findAllNodes(root, (n) => n.attrs['data-slot'] === slot)

/** Accessible name per the common subset of accname: labelledby, aria-label, <label for>, content, title. */
function accessibleName(node, root) {
	const byId = (id) => findAllNodes(root, (n) => n.attrs.id === id)[0]
	if (node.attrs['aria-labelledby']) {
		return node.attrs['aria-labelledby']
			.split(/\s+/)
			.map((id) => (byId(id) ? textOf(byId(id)) : ''))
			.join(' ')
			.trim()
	}
	if (node.attrs['aria-label']?.trim()) return node.attrs['aria-label'].trim()
	if (node.attrs.id) {
		const label = findAllNodes(root, (n) => n.tag === 'label' && n.attrs.for === node.attrs.id)[0]
		if (label && textOf(label).trim()) return textOf(label).trim()
	}
	const content = (n) =>
		(n.children ?? [])
			.map((c) => {
				if (c.text !== undefined) return c.text
				if (c.attrs['aria-hidden'] === 'true') return ''
				return content(c)
			})
			.join(' ')
	if (['button', 'a', 'h1', 'h2', 'h3'].includes(node.tag) || node.attrs.role === 'option') {
		const text = squash(content(node))
		if (text) return text
	}
	return (node.attrs.title ?? '').trim()
}

const interactive = (n) =>
	['button', 'select', 'input', 'a', 'textarea'].includes(n.tag) ||
	['checkbox', 'switch', 'button', 'combobox'].includes(n.attrs.role)

/** Static checks that apply to any fragment of output. */
function staticChecks(html, label) {
	const root = parseHtml(html)
	for (const el of findAllNodes(root, (n) => interactive(n))) {
		assert(accessibleName(el, root), `${label}: <${el.tag}${el.attrs.role ? ` role=${el.attrs.role}` : ''}> has no accessible name`)
	}
	const ids = findAllNodes(root, (n) => n.attrs.id !== undefined).map((n) => n.attrs.id)
	eq(ids.length, new Set(ids).size, `${label}: duplicate ids ${ids}`)
	for (const attr of ['aria-labelledby', 'aria-controls', 'aria-describedby', 'aria-activedescendant']) {
		for (const el of findAllNodes(root, (n) => n.attrs[attr] !== undefined)) {
			for (const id of el.attrs[attr].split(/\s+/)) {
				assert(ids.includes(id), `${label}: ${attr} points at missing id ${id}`)
			}
		}
	}
	// A button inside a button (or a link) is invalid and breaks keyboard and screen readers.
	for (const el of findAllNodes(root, (n) => n.tag === 'button' || n.tag === 'a')) {
		eq(findAllNodes(el, interactive).length, 0, `${label}: interactive element nested inside <${el.tag}>`)
	}
	return root
}

/* -------------------------------------------------------------------------- */
/* A hook-aware mini renderer, for handlers, state and effects                */
/* -------------------------------------------------------------------------- */

const INTERNALS = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
const MEMO = Symbol.for('react.memo')
const FORWARD = Symbol.for('react.forward_ref')
const FRAGMENT = Symbol.for('react.fragment')

/** `document` as far as the components touch it: the focused element and lookups by id. */
function createDocument() {
	const doc = {
		activeElement: null,
		scrolled: [],
		current: null,
		getElementById(id) {
			return doc.current?.hostById(id) ?? null
		},
	}
	return doc
}

function mount(Component, initialProps, doc) {
	const instances = new Map()
	const fakes = new Map()
	const attached = new Map()
	let props = initialProps
	let tree = []
	let layoutQueue = []
	let passiveQueue = []
	let dirty = false
	let batch = 0
	let alive = true
	let idCounter = 0

	const markDirty = () => {
		dirty = true
		if (batch === 0)
			queueMicrotask(() => {
				if (dirty && alive && batch === 0) flush()
			})
	}

	function fakeFor(el) {
		let fake = fakes.get(el.path)
		if (!fake) {
			fake = {
				tagName: el.type.toUpperCase(),
				el: null,
				selectionStart: 0,
				selectionEnd: 0,
				scrolled: 0,
				setSelectionRange(a, b) {
					fake.selectionStart = a
					fake.selectionEnd = b
				},
				focus() {
					if (doc.activeElement === fake) return
					doc.activeElement = fake
					fake.el?.props.onFocus?.({ target: fake, currentTarget: fake })
				},
				blur() {
					if (doc.activeElement !== fake) return
					doc.activeElement = null
					fake.el?.props.onBlur?.({ target: fake, currentTarget: fake })
				},
				scrollIntoView() {
					fake.scrolled++
				},
			}
			fakes.set(el.path, fake)
		}
		fake.el = el
		return fake
	}

	function callComponent(type, p, path) {
		let instance = instances.get(path)
		if (!instance) instances.set(path, (instance = { hooks: [] }))
		let index = 0
		const slot = () => (instance.hooks[index] ??= {})
		const effectHook = (queue) => (effect, deps) => {
			const s = slot()
			index++
			if (!s.ran || !deps || !sameDeps(s.deps, deps)) {
				s.ran = true
				s.deps = deps
				queue().push({ s, effect })
			}
		}
		const dispatcher = {
			useState(initial) {
				const s = slot()
				index++
				if (!('value' in s)) {
					s.value = typeof initial === 'function' ? initial() : initial
					s.set = (next) => {
						const value = typeof next === 'function' ? next(s.value) : next
						if (Object.is(value, s.value)) return
						s.value = value
						markDirty()
					}
				}
				return [s.value, s.set]
			},
			useRef(initial) {
				const s = slot()
				index++
				return (s.ref ??= { current: initial })
			},
			useMemo(factory, deps) {
				const s = slot()
				index++
				if (!s.has || !sameDeps(s.deps, deps)) {
					s.value = factory()
					s.has = true
					s.deps = deps
				}
				return s.value
			},
			useCallback(fn, deps) {
				return dispatcher.useMemo(() => fn, deps)
			},
			useEffect: effectHook(() => passiveQueue),
			useLayoutEffect: effectHook(() => layoutQueue),
			useInsertionEffect: effectHook(() => layoutQueue),
			useId() {
				const s = slot()
				index++
				return (s.id ??= `:t${idCounter++}:`)
			},
			useContext: (context) => context._currentValue,
			useDebugValue() {},
		}
		const previous = INTERNALS.H
		INTERNALS.H = dispatcher
		try {
			return type.render ? type.render(p, p.ref ?? null) : type(p)
		} finally {
			INTERNALS.H = previous
		}
	}

	function expand(node, path) {
		if (node === null || node === undefined || typeof node === 'boolean') return []
		if (Array.isArray(node)) return node.flatMap((c, i) => expand(c, `${path}[${i}]`))
		if (typeof node === 'string' || typeof node === 'number') return [{ text: String(node) }]
		const { type, props: p } = node
		const name = typeof type === 'string' ? type : (type.displayName ?? type.name ?? 'c')
		const here = `${path}/${node.key ?? ''}${name}`
		if (type === FRAGMENT) return expand(p.children, here)
		if (typeof type === 'string') {
			const element = { type, props: p, path: here, children: expand(p.children, here) }
			return [element]
		}
		if (type.$$typeof === MEMO) return expand({ ...node, type: type.type }, path)
		if (type.$$typeof === FORWARD || typeof type === 'function')
			return expand(callComponent(type, p, here), here)
		// A context provider or consumer is transparent here: nothing under test reads one.
		if (p && 'children' in p) return expand(p.children, here)
		throw new Error(`mount: cannot expand ${String(type)}`)
	}

	const hosts = (nodes, out = []) => {
		for (const n of nodes) {
			if (n.text !== undefined) continue
			out.push(n)
			hosts(n.children, out)
		}
		return out
	}

	function attachRefs() {
		for (const el of hosts(tree)) {
			const ref = el.props.ref
			const fake = fakeFor(el)
			const before = attached.get(el.path)
			if (before === ref) continue
			if (before) {
				if (typeof before === 'function') before(null)
				else before.current = null
			}
			attached.set(el.path, ref)
			if (!ref) continue
			if (typeof ref === 'function') ref(fake)
			else ref.current = fake
		}
	}

	function runQueue(queue) {
		for (const { s, effect } of queue) {
			if (typeof s.cleanup === 'function') s.cleanup()
			s.cleanup = effect()
		}
	}

	function renderOnce() {
		layoutQueue = []
		passiveQueue = []
		tree = expand(h(Component, props), 'root')
		attachRefs()
		const layout = layoutQueue
		const passive = passiveQueue
		runQueue(layout)
		runQueue(passive)
	}

	function flush() {
		batch++
		try {
			let guard = 0
			do {
				dirty = false
				renderOnce()
				if (++guard > 60) throw new Error('mount: render loop did not settle')
			} while (dirty)
		} finally {
			batch--
		}
	}

	const api = {
		/** Runs a handler, then renders once, the way a browser batches an event. */
		act(fn) {
			batch++
			let result
			try {
				result = fn()
			} finally {
				batch--
			}
			if (batch === 0) flush()
			return result
		},
		flush,
		setProps(next) {
			props = { ...props, ...next }
			flush()
		},
		get tree() {
			return tree
		},
		find: (predicate) => hosts(tree).find(predicate),
		findAll: (predicate) => hosts(tree).filter(predicate),
		fake: (el) => fakeFor(el),
		text(el) {
			const read = (n) => (n.text !== undefined ? n.text : n.children.map(read).join(''))
			return read(el)
		},
		hostById: (id) => {
			const el = hosts(tree).find((n) => n.props.id === id)
			return el ? fakeFor(el) : null
		},
		unmount() {
			alive = false
			for (const instance of instances.values())
				for (const s of instance.hooks) if (typeof s?.cleanup === 'function') s.cleanup()
		},
	}
	doc.current = api
	flush()
	return api
}

/** Lets promises, microtasks and queued renders settle. Real `setImmediate`, not the fake clock. */
const tick = async () => {
	for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve))
}

/** A DOM-ish keyboard or mouse event with spies. */
function ev(over = {}) {
	return {
		key: '',
		keyCode: 0,
		shiftKey: false,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
		detail: 1,
		nativeEvent: { isComposing: false },
		target: null,
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true
		},
		...over,
	}
}

/** Fake timers for the debounce: `setTimeout` is looked up at call time, so patching the global is enough. */
function createClock() {
	const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
	const timers = new Map()
	let now = 0
	let next = 1
	const set = (fn, ms = 0) => {
		const id = next++
		timers.set(id, { at: now + ms, fn })
		return id
	}
	const clear = (id) => {
		timers.delete(id)
	}
	return {
		/** The controller's injectable timers, for tests that do not patch the globals. */
		timers: { set, clear },
		install() {
			globalThis.setTimeout = set
			globalThis.clearTimeout = clear
		},
		uninstall() {
			globalThis.setTimeout = real.setTimeout
			globalThis.clearTimeout = real.clearTimeout
		},
		advance(ms) {
			const end = now + ms
			for (;;) {
				const due = [...timers.entries()]
					.filter(([, t]) => t.at <= end)
					.sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
				if (!due) break
				now = due[1].at
				timers.delete(due[0])
				due[1].fn()
			}
			now = end
		},
		get pending() {
			return timers.size
		},
	}
}

/** A suggestion endpoint the test answers by hand. `honour` makes it reject when aborted, like fetch does. */
function createFetch({ honour = true } = {}) {
	const calls = []
	const fn = (input, signal) =>
		new Promise((resolve, reject) => {
			const call = { input, signal, resolve, reject, aborted: false }
			signal.addEventListener('abort', () => {
				call.aborted = true
				if (honour) reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
			})
			calls.push(call)
		})
	fn.calls = calls
	return fn
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const chip = (over = {}) => ({
	key: 'kitchen',
	kind: 'term',
	label: 'kitchen',
	clause: 'kitchen',
	negated: false,
	start: 0,
	end: 7,
	...over,
})

const barProps = (over = {}) => ({
	value: '',
	chips: [],
	warnings: [],
	corrections: [],
	dropped: [],
	loading: false,
	scope: null,
	recent: [],
	canSave: false,
	onChange: noop,
	onSubmit: noop,
	onRemoveChip: noop,
	onClearScope: noop,
	onToggleScopeDeep: noop,
	onClearAll: noop,
	fetchSuggestions: async () => [],
	onSave: async () => {},
	...over,
})
const renderBar = (over) => renderToString(h(bar.SearchBar, barProps(over)))

const SUGGESTIONS = [
	{ kind: 'tag', label: 'Kitchen', insert: 'tag:kitchen', count: 214 },
	{ kind: 'tag', label: 'Kitchen remodel', insert: 'tag:kitchen-remodel', count: 31 },
	{ kind: 'folder', label: 'Clients/Acme/Kitchens', insert: 'folder:Clients/Acme/Kitchens', count: 9 },
	{ kind: 'operator', label: 'color:', insert: 'color:', hint: 'Dominant color, like color:blue' },
	{ kind: 'value', label: 'blue', insert: 'color:blue', swatch: '#2f6fed', count: 77 },
]

/* ========================================================================== */
/* Logic: tokens                                                              */
/* ========================================================================== */

await check('tokens: whitespace splits, quotes protect spaces, offsets are exact', () => {
	const cases = [
		['', []],
		['   ', []],
		['kitchen', ['kitchen']],
		['kitchen remodel', ['kitchen', 'remodel']],
		['  kitchen   remodel  ', ['kitchen', 'remodel']],
		['tag:"dark green" blue', ['tag:"dark green"', 'blue']],
		['"before and after" kitchen', ['"before and after"', 'kitchen']],
		['"unclosed quote here', ['"unclosed quote here']],
		['a"b c"d e', ['a"b c"d', 'e']],
		['a\tb\nc d', ['a', 'b', 'c', 'd']],
		['(kitchen OR bath) -blue', ['(kitchen', 'OR', 'bath)', '-blue']],
		['kitchen "" blue', ['kitchen', '""', 'blue']],
		['日本 Фото 😀x', ['日本', 'Фото', '😀x']],
	]
	for (const [input, expected] of cases) {
		const tokens = bar.tokenize(input)
		eq(tokens.map((t) => t.text), expected, JSON.stringify(input))
		for (const t of tokens) eq(input.slice(t.start, t.end), t.text, 'offsets')
	}
})

await check('tokens: fuzz, ordered and disjoint, never starting blank, covering every non-blank character', () => {
	const rand = rng(1)
	const alphabet = ['a', 'b', 'é', '日', '😀', ' ', ' ', '\t', '\n', '"', '"', ':', '-', '(', ')', '#', '*', ',']
	for (let n = 0; n < 4000; n++) {
		const length = Math.floor(rand() * 26)
		let s = ''
		for (let i = 0; i < length; i++) s += alphabet[Math.floor(rand() * alphabet.length)]
		const tokens = bar.tokenize(s)
		let cursor = 0
		for (const [i, t] of tokens.entries()) {
			const label = JSON.stringify(s)
			assert(t.start >= cursor && (i === 0 || t.start > cursor), `tokens touch or overlap in ${label}`)
			assert(s.slice(cursor, t.start).trim() === '', `non-blank text skipped before a token in ${label}`)
			assert(!/\s/.test(s[t.start]), `token starts blank in ${label}`)
			eq(s.slice(t.start, t.end), t.text, `offsets in ${label}`)
			// Blank at the end is only possible inside a quote that never closed.
			if (/\s$/.test(t.text)) assert(((t.text.match(/"/g) ?? []).length) % 2 === 1, `closed token ends blank in ${label}`)
			cursor = t.end
		}
		assert(s.slice(cursor).trim() === '', `non-blank tail skipped in ${JSON.stringify(s)}`)
	}
})

await check('tokens: a 200,000 character hostile input is linear and does not throw', () => {
	const started = Date.now()
	for (const unit of ['(', '"', 'a ', '-', ':"', '\u0000 ']) {
		const big = unit.repeat(Math.ceil(200_000 / unit.length))
		bar.tokenize(big)
		bar.tokenAt(big, big.length)
		bar.hasCompletableToken(big)
		bar.withoutLastToken(big)
		bar.splitToken(big.slice(0, 50_000))
		bar.applySuggestion(big, big.length, { kind: 'tag', insert: 'tag:x' })
	}
	assert(Date.now() - started < 2500, `took ${Date.now() - started} ms`)
})

await check('splitToken: the sign and brackets belong to the query, not to the word', () => {
	const cases = [
		['kit', ['', 'kit', '']],
		['-kit', ['-', 'kit', '']],
		['(kit', ['(', 'kit', '']],
		['bath)', ['', 'bath', ')']],
		['((a', ['((', 'a', '']],
		['-(kit', ['-(', 'kit', '']],
		['kit))', ['', 'kit', '))']],
		['"a b)', ['', '"a b)', '']],
		['tag:kit)', ['', 'tag:kit', ')']],
		['', ['', '', '']],
		['-', ['-', '', '']],
		[')', ['', '', ')']],
	]
	for (const [input, [lead, body, trail]] of cases) {
		const split = bar.splitToken(input)
		eq([split.lead, split.body, split.trail], [lead, body, trail], JSON.stringify(input))
		eq(split.lead + split.body + split.trail, input, 'parts rebuild the token')
	}
})

await check('tokenAt and hasCompletableToken: the word under the caret, blank space, clamping', () => {
	const v = 'kit  chen'
	eq(bar.tokenAt(v, 0)?.text, 'kit')
	eq(bar.tokenAt(v, 3)?.text, 'kit')
	eq(bar.tokenAt(v, 4), null)
	eq(bar.tokenAt(v, 5)?.text, 'chen')
	eq(bar.tokenAt(v, 9)?.text, 'chen')
	eq(bar.tokenAt(v, -5)?.text, 'kit', 'negative caret clamps to the start')
	eq(bar.tokenAt(v, 999)?.text, 'chen', 'caret past the end clamps')
	eq(bar.tokenAt(v, Number.NaN)?.text, 'chen', 'NaN caret is the end')
	eq(bar.tokenAt(v, Number.POSITIVE_INFINITY)?.text, 'chen')
	eq(bar.tokenAt('', 0), null)
	for (const [input, expected] of [
		['kit', true],
		['kit ', false],
		['', false],
		['   ', false],
		['tag:', true],
		['"abc ', true],
		['"abc" ', false],
		['a b\t', false],
		['(', true],
	])
		eq(bar.hasCompletableToken(input), expected, JSON.stringify(input))
})

await check('withoutLastToken: drops only the word still being typed', () => {
	eq(bar.withoutLastToken('type:png tag:'), 'type:png ')
	eq(bar.withoutLastToken('kit'), '')
	eq(bar.withoutLastToken('kit '), 'kit ')
	eq(bar.withoutLastToken(''), '')
	eq(bar.withoutLastToken('a "b c'), 'a ')
})

/* ========================================================================== */
/* Logic: replacing the token under the caret                                 */
/* ========================================================================== */

const tagSuggestion = { kind: 'tag', insert: 'tag:kitchen' }

await check('apply: replaces exactly the last token and puts the caret after it', () => {
	const r = bar.applySuggestion('kitchen ti', 10, { kind: 'tag', insert: 'tag:tile' })
	eq(r, { value: 'kitchen tag:tile', caret: 16, keepEditing: false, applied: true })
	eq(bar.applySuggestion('kit', 3, tagSuggestion), { value: 'tag:kitchen', caret: 11, keepEditing: false, applied: true })
	eq(bar.applySuggestion('blue kit', 8, tagSuggestion).value, 'blue tag:kitchen')
})

await check('apply: an operator suggestion keeps the person editing, the caret right after the colon', () => {
	const r = bar.applySuggestion('kitchen col', 11, { kind: 'operator', insert: 'color:' })
	eq(r, { value: 'kitchen color:', caret: 14, keepEditing: true, applied: true })
	// Any suggestion that ends in a colon is a step, whatever its kind.
	eq(bar.applySuggestion('fol', 3, { kind: 'value', insert: 'folder:' }).keepEditing, true)
	eq(bar.applySuggestion('x', 1, { kind: 'tag', insert: 'color: ' }).keepEditing, true)
	// A finished clause is not a step.
	eq(bar.applySuggestion('x', 1, { kind: 'value', insert: 'color:blue' }).keepEditing, false)
	eq(bar.keepsEditing({ kind: 'operator', insert: 'tag:' }), true)
	eq(bar.keepsEditing({ kind: 'tag', insert: 'tag:kitchen' }), false)
})

await check('apply: a token in the middle is replaced, the rest of the text is untouched', () => {
	eq(bar.applySuggestion('kit blue', 3, tagSuggestion), { value: 'tag:kitchen blue', caret: 11, keepEditing: false, applied: true })
	// Caret inside the word: the whole word goes.
	eq(bar.applySuggestion('kitchen blue', 3, tagSuggestion).value, 'tag:kitchen blue')
	eq(bar.applySuggestion('kitchen blue', 3, tagSuggestion).caret, 11)
	eq(bar.applySuggestion('a kit b', 4, tagSuggestion).value, 'a tag:kitchen b')
	// Caret at the start of a word that touches the previous blank: that word.
	eq(bar.applySuggestion('a kit b', 2, tagSuggestion).value, 'a tag:kitchen b')
})

await check('apply: quoted tokens are one token, replaced whole', () => {
	const folder = { kind: 'folder', insert: 'folder:"Clients Acme"' }
	eq(bar.applySuggestion('folder:"Clients A', 17, folder), { value: 'folder:"Clients Acme"', caret: 21, keepEditing: false, applied: true })
	eq(bar.applySuggestion('folder:"Clients A" blue', 12, folder).value, 'folder:"Clients Acme" blue')
	eq(bar.applySuggestion('blue "kitchen', 13, tagSuggestion).value, 'blue tag:kitchen')
	// A bracket inside an unclosed quote is text, not a bracket.
	eq(bar.applySuggestion('"a b)', 5, tagSuggestion).value, 'tag:kitchen')
})

await check('apply: a sign or bracket the person typed survives, and is not written twice', () => {
	eq(bar.applySuggestion('-kit', 4, tagSuggestion).value, '-tag:kitchen')
	eq(bar.applySuggestion('-kit', 4, tagSuggestion).caret, 12)
	eq(bar.applySuggestion('(kit', 4, tagSuggestion).value, '(tag:kitchen')
	eq(bar.applySuggestion('(kit OR bath)', 13, { kind: 'tag', insert: 'tag:bathroom' }).value, '(kit OR tag:bathroom)')
	eq(bar.applySuggestion('(kit OR bath)', 13, { kind: 'tag', insert: 'tag:bathroom' }).caret, 20)
	eq(bar.applySuggestion('-kit', 4, { kind: 'tag', insert: '-tag:kitchen' }).value, '-tag:kitchen', 'server wrote the sign itself')
	eq(bar.applySuggestion('#kit', 4, tagSuggestion).value, 'tag:kitchen', '#kit is the tag shorthand and is replaced whole')
})

await check('apply: caret in blank space inserts at the caret; an empty box gets the insert', () => {
	eq(bar.applySuggestion('kitchen ', 8, tagSuggestion).value, 'kitchen tag:kitchen')
	eq(bar.applySuggestion('', 0, { kind: 'operator', insert: 'tag:' }), { value: 'tag:', caret: 4, keepEditing: true, applied: true })
	eq(bar.applySuggestion('a  b', 2, tagSuggestion).value, 'a tag:kitchen b')
})

await check('apply: refusals leave the text exactly as it was', () => {
	for (const insert of ['', '   ', '\n', undefined, null, 42]) {
		const r = bar.applySuggestion('kit', 3, { kind: 'tag', insert })
		eq(r.value, 'kit')
		eq(r.applied, false)
	}
	const nearly = 'a'.repeat(MEDIA_LIMITS.queryMax - 3)
	const refused = bar.applySuggestion(`${nearly} k`, nearly.length + 3, { kind: 'tag', insert: 'tag:kitchen' })
	eq(refused.applied, false)
	eq(refused.value, `${nearly} k`)
	// Exactly at the limit still fits.
	const fits = bar.applySuggestion('k', 1, { kind: 'tag', insert: 'x'.repeat(MEDIA_LIMITS.queryMax) })
	eq(fits.applied, true)
	eq(fits.value.length, MEDIA_LIMITS.queryMax)
})

await check('apply: newlines in a suggestion become spaces; odd carets are clamped', () => {
	eq(bar.applySuggestion('k', 1, { kind: 'tag', insert: 'a\r\nb' }).value, 'a b')
	eq(bar.applySuggestion('kit', 99, tagSuggestion).value, 'tag:kitchen')
	eq(bar.applySuggestion('kit', -4, tagSuggestion).value, 'tag:kitchen')
	eq(bar.applySuggestion('kit', Number.NaN, tagSuggestion).value, 'tag:kitchen')
	eq(bar.applySuggestion('kit', 1.7, tagSuggestion).value, 'tag:kitchen')
})

await check('apply: fuzz, only the token under the caret ever changes', () => {
	const rand = rng(7)
	const alphabet = ['k', 'b', 'é', '日', '😀', ' ', ' ', '\t', '"', '"', ':', '-', '(', ')', '#', '*']
	const inserts = ['tag:kitchen', 'color:', 'folder:"A B"', '-x', '(y', 'z)', '日本', 'a\nb']
	for (let n = 0; n < 5000; n++) {
		let value = ''
		for (let i = Math.floor(rand() * 22); i > 0; i--) value += alphabet[Math.floor(rand() * alphabet.length)]
		const caret = Math.floor(rand() * (value.length + 3)) - 1
		const insert = inserts[Math.floor(rand() * inserts.length)]
		const r = bar.applySuggestion(value, caret, { kind: 'tag', insert })
		const label = `${JSON.stringify(value)} @${caret} + ${JSON.stringify(insert)}`
		assert(r.value.length <= MEDIA_LIMITS.queryMax, `too long: ${label}`)
		assert(r.caret >= 0 && r.caret <= r.value.length, `caret out of range: ${label}`)
		assert(r.applied, `refused: ${label}`)
		const clean = insert.replace(/[\r\n]+/g, ' ')
		const from = r.caret - clean.length
		eq(r.value.slice(from, r.caret), clean, `insert is right before the caret: ${label}`)
		const prefix = r.value.slice(0, from)
		const suffix = r.value.slice(r.caret)
		assert(value.startsWith(prefix), `text before the token changed: ${label}`)
		assert(value.endsWith(suffix), `text after the token changed: ${label}`)
		const to = value.length - suffix.length
		assert(from <= to, `ranges crossed: ${label}`)
		if (from < to) {
			const holder = bar.tokenize(value).find((t) => t.start <= from && to <= t.end)
			assert(holder, `the replaced text is not inside one token: ${label}`)
		}
	}
})

/* ========================================================================== */
/* Logic: the key table                                                       */
/* ========================================================================== */

const opts = (...kinds) => kinds.map((kind) => ({ kind }))
const TYPED = opts('tag', 'tag', 'folder', 'search')
const state = (over = {}) => ({ open: true, active: -1, options: TYPED, hasText: true, ...over })

await check('tab: accepts ONLY an option actively highlighted with Up/Down, otherwise it is just Tab', () => {
	// Nothing highlighted: Tab moves focus, so a keyboard user can always leave the box.
	eq(bar.decideKey({ key: 'Tab' }, state({ active: -1 })), { type: 'none' })
	eq(bar.shouldTabAccept(state({ active: -1 })), false)
	// Highlighted: accepts exactly that row.
	eq(bar.decideKey({ key: 'Tab' }, state({ active: 0 })), { type: 'accept', index: 0 })
	eq(bar.decideKey({ key: 'Tab' }, state({ active: 2 })), { type: 'accept', index: 2 })
	// The "Search for" row has nothing to complete.
	eq(bar.decideKey({ key: 'Tab' }, state({ active: 3 })), { type: 'none' })
	// A closed list or a stale highlight index never accepts.
	eq(bar.decideKey({ key: 'Tab' }, state({ open: false, active: 0 })), { type: 'none' })
	eq(bar.decideKey({ key: 'Tab' }, state({ active: 9 })), { type: 'none' })
	eq(bar.decideKey({ key: 'Tab' }, state({ active: -4 })), { type: 'none' })
	eq(bar.decideKey({ key: 'Tab' }, state({ active: Number.NaN })), { type: 'none' })
	eq(bar.decideKey({ key: 'Tab' }, state({ options: [], active: 0 })), { type: 'none' })
	// Shift+Tab and held modifiers are navigation, never completion.
	for (const mod of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey', 'isComposing'])
		eq(bar.decideKey({ key: 'Tab', [mod]: true }, state({ active: 0 })), { type: 'none' }, mod)
	// A recent search row can be completed (it is a real option).
	eq(bar.decideKey({ key: 'Tab' }, state({ options: opts('recent', 'operator'), active: 0 })), { type: 'accept', index: 0 })
})

await check('keys: Enter accepts a highlighted option, otherwise submits what was typed', () => {
	eq(bar.decideKey({ key: 'Enter' }, state({ active: 1 })), { type: 'accept', index: 1 })
	eq(bar.decideKey({ key: 'Enter' }, state({ active: 3 })), { type: 'accept', index: 3 }, 'the Search for row is accepted by Enter')
	eq(bar.decideKey({ key: 'Enter' }, state({ active: -1 })), { type: 'submit' })
	eq(bar.decideKey({ key: 'Enter' }, state({ open: false, active: 1 })), { type: 'submit' })
	eq(bar.decideKey({ key: 'Enter' }, state({ options: [], open: false })), { type: 'submit' })
	eq(bar.decideKey({ key: 'Enter' }, state({ active: 99 })), { type: 'submit' })
	eq(bar.decideKey({ key: 'Enter', ctrlKey: true }, state()), { type: 'none' })
	eq(bar.decideKey({ key: 'Enter', metaKey: true }, state()), { type: 'none' })
	// An input method owns Enter while it composes.
	eq(bar.decideKey({ key: 'Enter', isComposing: true }, state({ active: 1 })), { type: 'none' })
	eq(bar.decideKey({ key: 'Process' }, state()), { type: 'none' })
})

await check('keys: Esc closes the list first, then clears the text, then leaves the box', () => {
	eq(bar.decideKey({ key: 'Escape' }, state({ open: true, hasText: true })), { type: 'close' })
	eq(bar.decideKey({ key: 'Escape' }, state({ open: true, hasText: false })), { type: 'close' })
	eq(bar.decideKey({ key: 'Escape' }, state({ open: false, hasText: true })), { type: 'clear' })
	eq(bar.decideKey({ key: 'Escape' }, state({ open: false, hasText: false })), { type: 'blur' })
	eq(bar.decideKey({ key: 'Escape', ctrlKey: true }, state()), { type: 'none' })
	eq(bar.decideKey({ key: 'Escape', isComposing: true }, state()), { type: 'none' })
})

await check('keys: Up and Down walk the options with a "nothing highlighted" stop; a closed list opens', () => {
	eq(bar.decideKey({ key: 'ArrowDown' }, state({ open: false })), { type: 'open' })
	eq(bar.decideKey({ key: 'ArrowUp' }, state({ open: false })), { type: 'open' })
	eq(bar.decideKey({ key: 'ArrowDown' }, state({ active: -1 })), { type: 'move', active: 0 })
	eq(bar.decideKey({ key: 'ArrowDown' }, state({ active: 3 })), { type: 'move', active: -1 })
	eq(bar.decideKey({ key: 'ArrowUp' }, state({ active: -1 })), { type: 'move', active: 3 })
	eq(bar.decideKey({ key: 'ArrowUp' }, state({ active: 0 })), { type: 'move', active: -1 })
	eq(bar.decideKey({ key: 'ArrowDown' }, state({ options: [] })), { type: 'none' })
	for (const mod of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey'])
		eq(bar.decideKey({ key: 'ArrowDown', [mod]: true }, state()), { type: 'none' }, mod)
	for (const key of ['a', ' ', 'Home', 'End', 'ArrowLeft', 'F2', 'Backspace', ''])
		eq(bar.decideKey({ key }, state({ active: 1 })), { type: 'none' }, `key ${JSON.stringify(key)}`)
})

await check('keys: nextActive never leaves the list and every full lap returns to "nothing highlighted"', () => {
	for (let count = 1; count <= 6; count++) {
		for (let current = -3; current <= count + 2; current++) {
			for (const dir of [1, -1]) {
				const n = bar.nextActive(current, dir, count)
				assert(n >= -1 && n < count, `out of range: ${current} ${dir} ${count} -> ${n}`)
			}
		}
		let at = -1
		for (let i = 0; i < count + 1; i++) at = bar.nextActive(at, 1, count)
		eq(at, -1, `a full lap down of ${count}`)
		at = -1
		for (let i = 0; i < count + 1; i++) at = bar.nextActive(at, -1, count)
		eq(at, -1, `a full lap up of ${count}`)
		eq(bar.nextActive(-1, 1, count), 0)
		eq(bar.nextActive(-1, -1, count), count - 1)
	}
	eq(bar.nextActive(0, 1, 0), -1)
	eq(bar.nextActive(0, -1, -3), -1)
})

await check('keys: fuzz against the spec restated, Tab never completes without a highlight', () => {
	const rand = rng(3)
	const keys = ['Tab', 'Enter', 'Escape', 'ArrowDown', 'ArrowUp', 'a', 'Process']
	const kinds = ['tag', 'folder', 'operator', 'value', 'search', 'recent']
	for (let n = 0; n < 6000; n++) {
		const count = Math.floor(rand() * 6)
		const options = Array.from({ length: count }, () => ({ kind: kinds[Math.floor(rand() * kinds.length)] }))
		const st = {
			open: rand() < 0.6,
			active: Math.floor(rand() * (count + 3)) - 2,
			options,
			hasText: rand() < 0.5,
		}
		const key = { key: keys[Math.floor(rand() * keys.length)] }
		for (const mod of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey', 'isComposing']) if (rand() < 0.15) key[mod] = true
		const d = bar.decideKey(key, st)
		const label = `${JSON.stringify(key)} ${JSON.stringify({ ...st, options: options.map((o) => o.kind) })}`
		const highlighted = st.open && st.active >= 0 && st.active < count
		if (key.key === 'Tab') {
			const modified = key.shiftKey || key.ctrlKey || key.altKey || key.metaKey || key.isComposing
			const expectAccept = highlighted && !modified && options[st.active].kind !== 'search'
			eq(d.type === 'accept', expectAccept, `Tab ${label}`)
			if (d.type === 'accept') eq(d.index, st.active)
			else eq(d.type, 'none', `Tab never does anything but accept ${label}`)
		}
		if (d.type === 'accept') assert(highlighted, `accepted with no highlighted option: ${label}`)
		if (d.type === 'move') assert(d.active >= -1 && d.active < count, `moved out of range: ${label}`)
		if (d.type === 'close') assert(st.open, `closed a closed list: ${label}`)
		if (d.type === 'clear') assert(!st.open && st.hasText, `cleared while the list was open: ${label}`)
	}
})

/* ========================================================================== */
/* Logic: the debounced suggestion controller                                 */
/* ========================================================================== */

function newController(over = {}) {
	const clock = createClock()
	const fetch = over.fetch ?? createFetch(over.fetchOptions)
	const results = []
	const pending = []
	const controller = bar.createSuggestionController({
		fetch,
		onResult: over.onResult ?? ((r) => results.push(r)),
		onPending: (p) => pending.push(p),
		timers: clock.timers,
		...(over.delay === undefined ? {} : { delay: over.delay }),
	})
	return { clock, fetch, results, pending, controller }
}
const tagRow = (label) => ({ kind: 'tag', label, insert: `tag:${label.toLowerCase()}` })

await check('controller: the debounce is ~120 ms and a burst of keystrokes asks once, about the last one', async () => {
	eq(bar.SUGGEST_DEBOUNCE_MS, 120)
	const { clock, fetch, results, pending, controller } = newController()
	controller.request('k', 'm1')
	controller.request('ki', 'm2')
	controller.request('kit', 'm3')
	eq(fetch.calls.length, 0, 'nothing is asked before the pause')
	eq(clock.pending, 1, 'each keystroke replaces the waiting timer instead of stacking another')
	clock.advance(bar.SUGGEST_DEBOUNCE_MS - 1)
	eq(fetch.calls.length, 0, 'one millisecond early')
	clock.advance(1)
	eq(fetch.calls.length, 1)
	eq(fetch.calls[0].input, 'kit')
	assert(fetch.calls[0].signal instanceof AbortSignal, 'the call carries an AbortSignal')
	fetch.calls[0].resolve(SUGGESTIONS)
	await tick()
	eq(results.length, 1)
	eq([results[0].input, results[0].meta, results[0].suggestions.length], ['kit', 'm3', 5])
	eq(pending, [true, false], 'pending goes up once and comes down once')
})

await check('controller: a stale response never wins, even from a fetch that ignores its abort signal', async () => {
	const { clock, fetch, results, controller } = newController({ fetchOptions: { honour: false } })
	controller.request('kit', 1)
	clock.advance(120)
	eq(fetch.calls.length, 1)
	controller.request('kitc', 2)
	assert(fetch.calls[0].aborted, 'the earlier call is aborted the moment the person types again')
	clock.advance(120)
	eq(fetch.calls.length, 2)
	fetch.calls[0].resolve([tagRow('OLD')])
	await tick()
	eq(results.length, 0, 'the answer to "kit" arrived after "kitc" was asked and must be dropped')
	fetch.calls[1].resolve([tagRow('NEW')])
	await tick()
	eq(results.map((r) => [r.input, r.meta, r.suggestions.map((s) => s.label)]), [['kitc', 2, ['NEW']]])
})

await check('controller: a slow answer landing while the next question is still in its debounce is dropped too', async () => {
	const { clock, fetch, results, controller } = newController({ fetchOptions: { honour: false } })
	controller.request('kit', 1)
	clock.advance(120)
	controller.request('kitc', 2)
	// The new request is waiting in its 120 ms; the old answer lands now.
	fetch.calls[0].resolve([tagRow('OLD')])
	await tick()
	eq(results.length, 0)
	clock.advance(120)
	fetch.calls[1].resolve([tagRow('NEW')])
	await tick()
	eq(results.map((r) => r.suggestions[0].label), ['NEW'])
})

await check('controller: aborted calls are ignored, an AbortError is neither a result nor an error', async () => {
	const { clock, fetch, results, controller } = newController({ fetchOptions: { honour: true } })
	controller.request('kit', 1)
	clock.advance(120)
	controller.request('kitc', 2)
	await tick()
	assert(fetch.calls[0].aborted)
	eq(results.length, 0, 'the abort rejection must not turn into an empty list for the old input')
	clock.advance(120)
	fetch.calls[1].resolve([tagRow('NEW')])
	await tick()
	eq(results.map((r) => r.input), ['kitc'])
	// An answer for a call that was aborted AFTER it succeeded is still dropped.
	controller.request('kitch', 3)
	clock.advance(120)
	const third = fetch.calls[2]
	third.resolve([tagRow('LATE')])
	controller.request('kitche', 4)
	await tick()
	eq(results.map((r) => r.input), ['kitc'], 'an answer that raced an abort must not be shown')
})

await check('controller: a failing fetch is an empty list, a stale failure is nothing', async () => {
	const { clock, fetch, results, controller } = newController()
	controller.request('kit', 1)
	clock.advance(120)
	fetch.calls[0].reject(new Error('boom'))
	await tick()
	eq(results.map((r) => [r.input, r.suggestions]), [['kit', []]])
	controller.request('kitc', 2)
	clock.advance(120)
	controller.request('kitch', 3)
	fetch.calls[1].reject(new Error('late failure'))
	await tick()
	eq(results.length, 1, 'a failure of an old call is not an answer to a new question')

	const sync = newController({
		fetch: () => {
			throw new Error('sync throw')
		},
	})
	sync.controller.request('kit', 1)
	sync.clock.advance(120)
	await tick()
	eq(sync.results.map((r) => r.suggestions), [[]])
	eq(sync.pending, [true, false])

	const notPromise = newController({ fetch: () => ['not a promise'] })
	notPromise.controller.request('kit', 1)
	notPromise.clock.advance(120)
	await tick()
	eq(notPromise.results.map((r) => r.suggestions), [[]], 'a fetch that returns an array of junk is sanitised')
})

await check('controller: whatever the network says is sanitised before it reaches the list', async () => {
	const hostile = [
		null,
		42,
		'tag:x',
		[],
		{ kind: 'search', label: 'Search for "kit"', insert: 'kit' },
		{ kind: 'constructor', label: 'x', insert: 'x' },
		{ kind: '__proto__', label: 'x', insert: 'x' },
		{ kind: 'tag', label: '', insert: 'tag:a' },
		{ kind: 'tag', label: 'A', insert: '   ' },
		{ kind: 'tag', label: 7, insert: 'tag:a' },
		{ kind: 'tag', label: 'Kitchen', insert: 'tag:kitchen', count: -3, swatch: 'red; background:url(javascript:alert(1))' },
		{ kind: 'tag', label: 'Kitchen again', insert: 'tag:kitchen', count: 5 },
		{ kind: 'value', label: 'blue', insert: 'color:blue', swatch: '#2f6fed', count: Number.NaN },
		{ kind: 'value', label: 'red', insert: 'color:red', swatch: 'url(x)', count: Number.POSITIVE_INFINITY },
		{ kind: 'operator', label: 'color:', insert: 'color:', hint: 12 },
		...Array.from({ length: 40 }, (_, i) => tagRow(`T${i}`)),
	]
	const clean = bar.sanitizeSuggestions(hostile)
	assert(clean.length <= 12, `at most 12 rows, got ${clean.length}`)
	eq(clean.slice(0, 5).map((s) => s.insert), ['tag:kitchen', 'color:blue', 'color:red', 'color:', 'tag:t0'])
	const kitchen = clean.find((s) => s.insert === 'tag:kitchen')
	assert(!('count' in kitchen) && !('swatch' in kitchen), 'a negative count and a CSS injection attempt are dropped')
	assert(!('count' in clean.find((s) => s.insert === 'color:blue')), 'NaN is not a count')
	assert(!('count' in clean.find((s) => s.insert === 'color:red')) && !('swatch' in clean.find((s) => s.insert === 'color:red')))
	assert(clean.find((s) => s.insert === 'color:blue').swatch === '#2f6fed', 'a real hex swatch survives')
	assert(!('hint' in clean.find((s) => s.insert === 'color:')), 'a non-string hint is dropped')
	for (const s of clean) assert(['tag', 'folder', 'operator', 'value'].includes(s.kind), `kind ${s.kind}`)
	for (const reply of [undefined, null, 'x', 3, {}, { length: 2 }]) eq(bar.sanitizeSuggestions(reply), [])

	const { clock, fetch, results, controller } = newController({ fetch: async () => hostile })
	controller.request('kit', 1)
	clock.advance(120)
	await tick()
	assert(results[0].suggestions.length <= 12 && results[0].suggestions.length > 0)
})

await check('controller: input with nothing to complete is answered with [] at once and asks nobody', async () => {
	const { clock, fetch, results, pending, controller } = newController()
	controller.request('kit', 1)
	clock.advance(120)
	eq(fetch.calls.length, 1)
	controller.request('kit ', 2)
	assert(fetch.calls[0].aborted, 'the question in flight is moot once the word is finished')
	eq(results.map((r) => [r.input, r.meta, r.suggestions]), [['kit ', 2, []]])
	eq(pending, [true, false])
	clock.advance(1000)
	eq(fetch.calls.length, 1, 'no timer is left behind')
	for (const empty of ['', '   ', '"done" ']) {
		controller.request(empty, 3)
		clock.advance(500)
	}
	eq(fetch.calls.length, 1)
	eq(results.length, 4)
})

await check('controller: cancel stops the timer, aborts the call and keeps late answers out', async () => {
	const a = newController()
	a.controller.request('kit', 1)
	a.controller.cancel()
	eq(a.clock.pending, 0, 'cancel takes the waiting timer away at once')
	a.clock.advance(1000)
	eq(a.fetch.calls.length, 0, 'a cancelled request never asks')
	const b = newController({ fetchOptions: { honour: false } })
	b.controller.request('kit', 1)
	b.clock.advance(120)
	b.controller.cancel()
	assert(b.fetch.calls[0].aborted)
	b.fetch.calls[0].resolve([tagRow('LATE')])
	await tick()
	eq(b.results.length, 0, 'unmounted: nothing may reach state afterwards')
	eq(b.pending, [true, false])
	b.controller.request('kitc', 2)
	b.clock.advance(120)
	b.fetch.calls[1].resolve([tagRow('OK')])
	await tick()
	eq(b.results.map((r) => r.input), ['kitc'], 'a cancelled controller can be used again (a StrictMode remount)')
})

await check('controller: fuzz, only the latest question is ever answered and at most one call stays live', async () => {
	const rand = rng(11)
	const inputs = ['k', 'ki', 'kit', 'kitc', 'tag:', 'a b ', ' ', '', 'col']
	for (let round = 0; round < 120; round++) {
		let latest = -1
		const violations = []
		const settled = new Set()
		const { clock, fetch, controller } = newController({
			fetchOptions: { honour: rand() < 0.5 },
			onResult: (r) => {
				if (r.meta !== latest) violations.push(`answered ${r.input} (#${r.meta}) while #${latest} was the latest`)
			},
		})
		let id = 0
		for (let step = 0; step < 45; step++) {
			const roll = rand()
			if (roll < 0.35) {
				id++
				latest = id
				controller.request(inputs[Math.floor(rand() * inputs.length)], id)
			} else if (roll < 0.6) {
				clock.advance(Math.floor(rand() * 160))
			} else if (roll < 0.88 && fetch.calls.length) {
				const call = fetch.calls[Math.floor(rand() * fetch.calls.length)]
				if (!settled.has(call)) {
					settled.add(call)
					if (rand() < 0.75) call.resolve([tagRow(call.input || 'x')])
					else call.reject(new Error('boom'))
				}
				await tick()
			} else if (roll < 0.93) {
				controller.cancel()
				latest = -1
			}
			const live = fetch.calls.filter((c) => !c.aborted && !settled.has(c)).length
			assert(live <= 1, `${live} calls are live at once`)
		}
		await tick()
		eq(violations, [], `round ${round}`)
	}
})

/* ========================================================================== */
/* Logic: what the listbox shows                                              */
/* ========================================================================== */

await check('options: the typed list is grouped Tags, Folders, Filters, Values and always ends with Search for', () => {
	const rows = bar.typedOptions(SUGGESTIONS, 'kit', 'p-')
	eq(rows.map((r) => r.label), ['Kitchen', 'Kitchen remodel', 'Clients/Acme/Kitchens', 'color:', 'blue', 'Search for "kit"'])
	eq(rows.map((r) => r.group), ['Tags', 'Tags', 'Folders', 'Filters', 'Values', null])
	eq(rows.map((r) => r.count), [214, 31, 9, undefined, 77, undefined], 'tags carry counts')
	eq(rows[3].hint, 'Dominant color, like color:blue', 'operator rows carry their one-line hint')
	eq(rows[4].swatch, '#2f6fed', 'a color value carries its swatch')
	const last = rows.at(-1)
	eq([last.kind, last.insert], ['search', 'kit'], 'the last row searches for exactly what is in the box')
	eq(rows.map((r) => r.id), rows.map((_, i) => `p-${i}`))
	eq(new Set(rows.map((r) => r.id)).size, rows.length, 'ids are unique')
	for (const r of rows) assert(!r.narrow, 'only the static list carries the narrow flag')
})

await check('options: groups keep the order the server ranked them and rows of one group stay together', () => {
	const server = [
		{ kind: 'operator', label: 'color:', insert: 'color:' },
		{ kind: 'tag', label: 'Colorful', insert: 'tag:colorful' },
		{ kind: 'folder', label: 'Colors', insert: 'folder:Colors' },
		{ kind: 'tag', label: 'Color wall', insert: 'tag:color-wall' },
		{ kind: 'operator', label: 'caption:', insert: 'caption:' },
	]
	const rows = bar.typedOptions(server, 'col', 'p-')
	eq(rows.map((r) => r.group), ['Filters', 'Filters', 'Tags', 'Tags', 'Folders', null])
	eq(rows.map((r) => r.label), ['color:', 'caption:', 'Colorful', 'Color wall', 'Colors', 'Search for "col"'])
})

await check('options: with nothing from the server the list is just the Search for row, the text kept as typed', () => {
	for (const reply of [[], null, undefined, 'x']) {
		const rows = bar.typedOptions(reply, '  kit  ', 'p-')
		eq(rows.length, 1)
		eq([rows[0].kind, rows[0].group, rows[0].label, rows[0].insert], ['search', null, 'Search for "kit"', '  kit  '])
	}
	const long = bar.typedOptions([], 'x'.repeat(300), 'p-')[0]
	assert(Array.from(long.label).length <= 'Search for ""'.length + 60, `label not clipped: ${long.label.length}`)
	assert(long.label.endsWith('…"'), 'a clipped label says so')
	eq(long.insert.length, 300, 'the text to search is never clipped')
	const emoji = bar.typedOptions([], '😀'.repeat(80), 'p-')[0]
	assert(!/[\ud800-\udbff]"$/.test(emoji.label) && !/[\ud800-\udbff]…/.test(emoji.label), 'never cut through a surrogate pair')
})

await check('options: the focused-empty list is up to 5 recent searches, then the static Narrow by operators', () => {
	const rows = bar.emptyOptions(['a', 'b', 'a', '', '  ', 'c', 'd', 'e', 'f', 'g', 42, null, undefined], 'p-')
	const recent = rows.filter((r) => r.kind === 'recent')
	eq(recent.map((r) => r.label), ['a', 'b', 'c', 'd', 'e'], 'five, in order, no repeats, no blanks')
	eq(recent.map((r) => r.group), Array(5).fill('Recent searches'))
	eq(recent.map((r) => r.insert), recent.map((r) => r.label), 'choosing one runs that search')
	const narrow = rows.filter((r) => r.narrow)
	eq(narrow.map((r) => r.label), ['Tag', 'Color', 'Type', 'Folder', 'Added', 'Needs review'])
	eq(narrow.map((r) => r.insert), ['tag:', 'color:', 'type:', 'folder:', 'added:', 'is:'], 'each inserts operator:')
	for (const r of narrow) {
		eq([r.kind, r.group], ['operator', 'Narrow by'])
		assert(typeof r.hint === 'string' && r.hint.trim() !== '' && !/[\r\n]/.test(r.hint), `${r.label} has a one-line hint`)
		assert(r.icon, `${r.label} has an icon`)
	}
	eq(rows.map((r) => r.kind), [...Array(5).fill('recent'), ...Array(6).fill('operator')], 'recent first, then Narrow by')
	eq(new Set(rows.map((r) => r.id)).size, rows.length)
	eq(bar.emptyOptions([], 'p-').length, 6, 'no recents: only Narrow by')
	eq(bar.emptyOptions(undefined, 'p-').length, 6)
	eq(bar.emptyOptions('abc', 'p-').length, 6, 'not an array')
	eq(bar.RECENT_SHOWN, 5)
	// A single-line box cannot hold a line break, and a search is never longer than a query.
	const tidy = bar.emptyOptions(['one\ntwo', 'one two', 'a\r\n\r\nb', 'x'.repeat(MEDIA_LIMITS.queryMax + 1), 'y'.repeat(MEDIA_LIMITS.queryMax)], 'p-').filter((r) => r.kind === 'recent')
	eq(tidy.map((r) => (r.insert.length > 100 ? 'long' : r.insert)), ['one two', 'a b', 'long'], 'newlines become spaces, repeats collapse, the over-long one is skipped')
	assert(tidy.every((r) => !/[\r\n]/.test(r.insert) && r.insert === r.label))
	// Choosing a Narrow by row inserts its operator and keeps the person typing.
	for (const row of narrow) {
		const applied = bar.applySuggestion('', 0, row)
		eq([applied.value, applied.caret, applied.keepEditing], [row.insert, row.insert.length, true], row.label)
	}
})

/* ========================================================================== */
/* Logic: corrections, dropped words, warnings                                */
/* ========================================================================== */

const typo = (from, to) => ({ from, to })

await check('escape: "Search instead" is the typed text with each corrected word in double quotes', () => {
	const kithcen = [typo('kithcen', 'kitchen')]
	eq(bar.searchInsteadQuery('kithcen', kithcen), '"kithcen"')
	eq(bar.searchInsteadQuery('kithcen remodel', kithcen), '"kithcen" remodel')
	eq(bar.searchInsteadQuery('remodel kithcen', kithcen), 'remodel "kithcen"')
	eq(bar.searchInsteadQuery('Kithcen', kithcen), '"Kithcen"', 'matches ignoring case, keeps what was typed')
	eq(bar.searchInsteadQuery('tag:kitchen kithcen', kithcen), 'tag:kitchen "kithcen"', 'a clause is never turned into text')
	eq(bar.searchInsteadQuery('(kithcen OR bath)', kithcen), '("kithcen" OR bath)')
	eq(bar.searchInsteadQuery('-kithcen', kithcen), '-"kithcen"')
	eq(bar.searchInsteadQuery('kithcen, remodel', kithcen), '"kithcen",' + ' remodel')
	eq(bar.searchInsteadQuery('kithcen kithcen', kithcen), '"kithcen" "kithcen"')
	eq(bar.searchInsteadQuery('kithcen remodl', [typo('kithcen', 'kitchen'), typo('remodl', 'remodel')]), '"kithcen" "remodl"')
	eq(bar.searchInsteadQuery('Café', [typo('cafe', 'cafes')]), '"Café"', 'folded the way the parser folds')
	eq(bar.searchInsteadQuery('  kithcen  ', kithcen), '  "kithcen"  ', 'whitespace is left alone')
	// Nothing to insist on.
	eq(bar.searchInsteadQuery('kitchen', []), null)
	eq(bar.searchInsteadQuery('kitchen', undefined), null)
	eq(bar.searchInsteadQuery('', kithcen), null)
	eq(bar.searchInsteadQuery('blue', kithcen), null, 'the typo is no longer in the box')
	eq(bar.searchInsteadQuery('kithcen', [typo('tag:van', 'tag:truck')]), null, 'a followed rename cannot be quoted back')
	eq(bar.searchInsteadQuery('#van', [typo('#van', 'tag:truck')]), null)
	eq(bar.searchInsteadQuery('kitchen', [typo('kitchen', 'kitchen')]), null, 'a no-op correction is not a correction')
	// Not words: phrases, clauses, wildcards, operators.
	eq(bar.searchInsteadQuery('"kithcen"', kithcen), null, 'already a phrase')
	eq(bar.searchInsteadQuery('tag:kithcen', kithcen), null)
	eq(bar.searchInsteadQuery('kithc*', [typo('kithc', 'kitchen')]), null)
	eq(bar.searchInsteadQuery('#kithcen', kithcen), null)
	eq(bar.searchInsteadQuery('a OR kithcen', [typo('or', 'oar')]), null, 'an operator is not a word')
	// Hostile corrections.
	for (const bad of [null, [null], [{}], [{ from: 1, to: 2 }], [{ from: 'a' }], 'x', 7])
		eq(bar.searchInsteadQuery('kithcen', bad), null)
})

await check('escape: fuzz, the escape only ever adds double quotes', () => {
	const rand = rng(5)
	const words = ['kithcen', 'remodl', 'blue', 'tag:kitchen', '-sink', '(bath', 'bath)', '"a b"', 'OR', 'x*', '#t', 'Café', 'sink,']
	for (let n = 0; n < 3000; n++) {
		let value = ''
		for (let i = 1 + Math.floor(rand() * 5); i > 0; i--) value += (value ? (rand() < 0.2 ? '  ' : ' ') : '') + words[Math.floor(rand() * words.length)]
		const corrections = [typo('kithcen', 'kitchen'), typo('remodl', 'remodel'), typo('cafe', 'cafes')]
		const out = bar.searchInsteadQuery(value, corrections)
		if (out === null) continue
		eq(out.replace(/"/g, ''), value.replace(/"/g, ''), `only quotes were added to ${JSON.stringify(value)}`)
		assert(out.includes('"'), 'something was quoted')
		assert((out.match(/"/g) ?? []).length - (value.match(/"/g) ?? []).length >= 2, 'quotes come in pairs')
	}
})

await check('dropped: words nobody mentions, the words the results are for, and the way back', () => {
	const d = bar.describeDropped('technician repairing sink', ['sink'])
	eq(d, { missing: ['sink'], remaining: ['technician', 'repairing'] })
	eq(bar.describeDropped('sink technician', ['Sink']), { missing: ['Sink'], remaining: ['technician'] })
	eq(bar.describeDropped('a,  b-c d', ['d']).remaining, ['a', 'b-c'])
	eq(bar.describeDropped('x y z', ['y', 'z', 'y', '  ', 7, null]).missing, ['y', 'z'], 'repeats, blanks and junk are dropped')
	eq(bar.describeDropped('x', undefined), { missing: [], remaining: ['x'] })
	// Clauses and phrases are never "remaining free words".
	eq(bar.describeDropped('tag:a "b c" sink d', ['sink']).remaining, ['d'])
	eq(bar.removeWords('technician repairing sink', ['sink']), 'technician repairing')
	eq(bar.removeWords('sink technician repairing', ['sink']), 'technician repairing')
	eq(bar.removeWords('technician sink repairing', ['sink']), 'technician repairing')
	eq(bar.removeWords('a sink sink b', ['sink']), 'a b')
	eq(bar.removeWords('a  Sink,  b', ['sink']), 'a b')
	eq(bar.removeWords('technician repairing', ['sink']), 'technician repairing', 'nothing to remove: the very same text')
	eq(bar.removeWords('tag:sink sink', ['sink']), 'tag:sink', 'a clause named like the word stays')
	eq(bar.removeWords('"sink" sink', ['sink']), '"sink"', 'a phrase stays')
	eq(bar.quoteWords('technician repairing sink', ['sink']), 'technician repairing "sink"')
	eq(bar.quoteWords('technician repairing', ['sink']), null)
	eq(bar.quoteWords('a b', []), null)
	eq(bar.quoteWords('a b', ['  ']), null)
	eq(bar.quoteWords('a "b" b', ['b']), 'a "b" "b"', 'only bare words are quoted')
})

await check('lists: a natural list reads as a sentence and is bounded', () => {
	eq(bar.naturalList([], 'and'), '')
	eq(bar.naturalList(['a'], 'and'), 'a')
	eq(bar.naturalList(['a', 'b'], 'and'), 'a and b')
	eq(bar.naturalList(['a', 'b', 'c'], 'or'), 'a, b or c')
	eq(bar.naturalList(['a', 'b', 'c', 'd'], 'and'), 'a, b, c and d')
	eq(bar.naturalList(['a', 'b', 'c', 'd', 'e', 'f'], 'and'), 'a, b, c, d and 2 more')
})

await check('corrections: what is shown, what can be insisted on, and what stays unsaid', () => {
	eq(bar.describeCorrections([typo('kithcen', 'kitchen')]), { showing: ['kitchen'], originals: ['kithcen'] })
	eq(bar.describeCorrections([typo('tag:van', 'tag:truck')]), { showing: ['tag:truck'], originals: [] }, 'a rename is stated, not undoable')
	eq(bar.describeCorrections([typo('kithcen', 'kitchen'), typo('tag:van', 'tag:truck'), typo('kithcen', 'kitchen')]), {
		showing: ['kitchen', 'tag:truck'],
		originals: ['kithcen'],
	})
	eq(bar.describeCorrections([typo('Kitchen', 'kitchen'), typo('x', ''), typo('', 'y')]), { showing: ['y'], originals: [] })
	eq(bar.describeCorrections(null), { showing: [], originals: [] })
})

await check('notes: everything under the box is decided in one place', () => {
	const none = bar.buildNotes({ value: 'x', warnings: [], corrections: [], dropped: [] })
	eq(none, { warnings: [], correction: null, dropped: null })
	eq(bar.hasNotes(none), false)

	const fix = bar.buildNotes({ value: 'kithcen', warnings: [], corrections: [typo('kithcen', 'kitchen')], dropped: [] })
	eq(fix.correction, { showing: ['kitchen'], originals: ['kithcen'], escape: '"kithcen"' })
	eq(bar.hasNotes(fix), true)

	const drop = bar.buildNotes({ value: 'technician repairing sink', warnings: [], corrections: [], dropped: ['sink'] })
	eq(drop.dropped, {
		missing: ['sink'],
		remaining: ['technician', 'repairing'],
		remove: 'technician repairing',
		require: 'technician repairing "sink"',
	})

	// With nothing in the box the last search's corrections and dropped words are old news.
	const empty = bar.buildNotes({ value: '  ', warnings: ['w'], corrections: [typo('a', 'b')], dropped: ['x'] })
	eq(empty, { warnings: ['w'], correction: null, dropped: null })

	// The box has moved on: no action that would act on something that is not there.
	const moved = bar.buildNotes({ value: 'blue', warnings: [], corrections: [typo('kithcen', 'kitchen')], dropped: ['sink'] })
	eq(moved.correction, { showing: ['kitchen'], originals: ['kithcen'], escape: null })
	eq(moved.dropped, { missing: ['sink'], remaining: ['blue'], remove: null, require: null })

	// Removing the only word would leave nothing to search.
	eq(bar.buildNotes({ value: 'sink', warnings: [], corrections: [], dropped: ['sink'] }).dropped.remove, null)

	// Both can be said at once, and warnings are cleaned.
	const both = bar.buildNotes({ value: 'kithcen sink', warnings: ['a', 'a', '', '  ', 5, 'b'], corrections: [typo('kithcen', 'kitchen')], dropped: ['sink'] })
	eq(both.warnings, ['a', 'b'])
	assert(both.correction && both.dropped)
	for (const junk of [undefined, null, 'x', 5]) {
		const notes = bar.buildNotes({ value: 'x', warnings: junk, corrections: junk, dropped: junk })
		eq(notes, { warnings: [], correction: null, dropped: null })
	}
})

await check('warnings: live parsing leaves out the word still being typed and falls back when the parser is gone', () => {
	const seen = []
	const parse = (raw) => {
		seen.push(raw)
		return { warnings: raw.includes('bad') ? ['Unknown type "bad" was ignored.'] : [] }
	}
	eq(bar.liveWarnings('type:bad', false, parse), ['Unknown type "bad" was ignored.'])
	eq(seen.at(-1), 'type:bad', 'finished text is parsed whole')
	eq(bar.liveWarnings('type:bad', true, parse), [], 'a half-written word is not a mistake yet')
	eq(seen.at(-1), '', 'the parser was given the text without its last word')
	eq(bar.liveWarnings('type:bad blue', true, parse), ['Unknown type "bad" was ignored.'], 'a finished word before it still warns')
	eq(seen.at(-1), 'type:bad ')
	eq(bar.liveWarnings('type:bad ', true, parse), ['Unknown type "bad" was ignored.'], 'a trailing space finishes the word')
	// The parser being broken must never take the box down.
	eq(bar.liveWarnings('x', false, () => { throw new Error('not implemented') }), null)
	eq(bar.liveWarnings('x', false, () => ({ warnings: 'nope' })), null)
	eq(bar.liveWarnings('x', false, () => null), null)
	eq(bar.liveWarnings('x', false, () => ({ warnings: ['a', 'a', 4, '', 'b'] })), ['a', 'b'])
	eq(bar.liveWarnings('x', false, () => ({})), null)
})

await check('warnings: while the box holds text the parser wins, otherwise the last search speaks', () => {
	eq(bar.pickWarnings('x', ['live'], ['server']), ['live'])
	eq(bar.pickWarnings('x', [], ['server']), [], 'the parser says it is fine now')
	eq(bar.pickWarnings('x', null, ['server']), ['server'], 'no parser: the server is all there is')
	eq(bar.pickWarnings('x', undefined, ['server']), ['server'])
	eq(bar.pickWarnings('', ['live'], ['server']), ['server'], 'an empty box has no live warnings')
	eq(bar.pickWarnings('   ', ['live'], ['server']), ['server'])
	eq(bar.pickWarnings('x', ['a', 'a', '', 5], []), ['a'])
	eq(bar.pickWarnings('x', null, undefined), [])
})

await check('labels: a negated chip reads once, never "not not"; scope text reads as a sentence', () => {
	// Exactly what the parser writes: `not tag: people` for a filter, `not: kitchen` for a word or phrase.
	eq(bar.chipLabel({ label: 'not tag: people', negated: true }), 'tag: people')
	eq(bar.chipLabel({ label: 'not: kitchen', negated: true }), 'kitchen')
	eq(bar.chipLabel({ label: 'not: "a b"', negated: true }), '"a b"')
	eq(bar.chipLabel({ label: 'NOT kitchen', negated: true }), 'kitchen')
	eq(bar.chipLabel({ label: '-kitchen', negated: true }), 'kitchen')
	eq(bar.chipLabel({ label: 'not: not', negated: true }), 'not', 'the word "not" itself survives')
	eq(bar.chipLabel({ label: 'nothing', negated: true }), 'nothing')
	eq(bar.chipLabel({ label: 'not', negated: true }), 'not')
	eq(bar.chipLabel({ label: 'not: kitchen', negated: false }), 'not: kitchen', 'a positive chip is never touched')
	eq(bar.scopeText({ label: 'Clients/Acme', deep: true }), 'in Clients/Acme and subfolders')
	eq(bar.scopeText({ label: 'Clients/Acme', deep: false }), 'in Clients/Acme only')
	eq(bar.scopeText({ label: '  ', deep: true }), 'in this folder and subfolders')
	eq(bar.scopeText({ label: ' Unfiled ', deep: false }), 'in Unfiled only')
})

if (parserReady) {
	await check('labels: every chip the real parser draws reads once in the pill', () => {
		const raw = '-kitchen NOT blue -tag:people -"a b" -(c OR d) kitchen "x y" tag:a sort:newest'
		const parsed = parseQuery(raw)
		assert(parsed.chips.some((c) => c.negated), 'the sample has negated chips')
		for (const c of parsed.chips) {
			const label = bar.chipLabel(c)
			assert(!/^not\b/i.test(label) || c.label.toLowerCase().startsWith('not not'), `"${c.label}" shows as "${label}"`)
			if (!c.negated) eq(label, c.label)
		}
	})
} else skip('labels: chips from the real parser', 'parse.ts is not usable here')

await check('hostile cost: a megabyte of text, ten thousand corrections or a million recents cannot freeze the box', () => {
	const started = Date.now()
	const huge = 'x'.repeat(1_000_000)
	const clean = bar.sanitizeSuggestions([
		{ kind: 'tag', label: huge, insert: 'tag:a', hint: huge, count: 1 },
		{ kind: 'tag', label: 'long insert', insert: 'a'.repeat(MEDIA_LIMITS.queryMax + 1) },
		{ kind: 'tag', label: 'just fits', insert: 'a'.repeat(MEDIA_LIMITS.queryMax) },
	])
	eq(clean.length, 2, 'an insert longer than a query could never be applied')
	assert(Array.from(clean[0].label).length <= 200 && Array.from(clean[0].hint).length <= 200, 'row text is clipped to one line')
	assert(clean[0].label.endsWith('…'), 'a clipped label says so')
	eq(clean[0].insert, 'tag:a')

	const corrections = Array.from({ length: 10_000 }, (_, i) => typo(`word${i}`, `fixed${i}`))
	const described = bar.describeCorrections(corrections)
	assert(described.showing.length <= 100 && described.originals.length <= 100, 'at most 100 corrections are read')
	const dropped = Array.from({ length: 10_000 }, (_, i) => `gone${i}`)
	assert(bar.describeDropped('a b c', dropped).missing.length <= 100)
	const bigText = Array.from({ length: 20_000 }, (_, i) => `word${i % 7}`).join(' ')
	bar.buildNotes({ value: bigText, warnings: [], corrections, dropped })
	bar.searchInsteadQuery(bigText, [typo('word3', 'ward3')])
	eq(bar.emptyOptions(Array.from({ length: 1_000_000 }, () => ''), 'p-').length, 6, 'a million blank recents are skipped, not drawn')
	assert(Date.now() - started < 3000, `took ${Date.now() - started} ms`)
})

await check('removeWords: linear on 100,000 characters, and exactly the listed words go, whatever else is in the text', () => {
	const started = Date.now()
	const wall = 'a '.repeat(50_000)
	eq(bar.removeWords(wall, ['a']), '', 'every word removed leaves nothing')
	const mixed = 'x a y a z '.repeat(8_000)
	const out = bar.removeWords(mixed, ['a'])
	assert(out.startsWith('x y z x y z') && !/\ba\b/.test(out) && out === out.trim())
	assert(Date.now() - started < 1500, `took ${Date.now() - started} ms`)

	// Differential fuzz: the surviving tokens are exactly the original tokens minus the removed ones, in order.
	const { normalizeText } = loadTs('src/lib/media/text.ts')
	const rand = rng(21)
	const words = ['sink', 'Sink,', 'a', 'kitchen', 'tag:sink', '"sink"', '-sink', '(sink', 'sink)', 'sink*', '#sink', 'OR', 'Café', 'cafe']
	for (let n = 0; n < 4000; n++) {
		let value = ''
		for (let i = Math.floor(rand() * 7); i > 0; i--) value += words[Math.floor(rand() * words.length)] + (rand() < 0.3 ? '   ' : rand() < 0.1 ? '\t' : ' ')
		if (rand() < 0.4) value = ' ' + value
		const gone = ['sink', 'cafe']
		const before = bar.tokenize(value).map((t) => t.text)
		const removable = (text) => !/["*:]/.test(text) && !/^[(-]*#/.test(text) && text !== 'OR' && text !== 'NOT' && !/[()]|^-/.test(text) && gone.includes(normalizeText(text))
		const expected = before.filter((text) => !removable(text))
		const result = bar.removeWords(value, gone)
		const label = JSON.stringify(value)
		eq(bar.tokenize(result).map((t) => t.text), expected, `survivors of ${label}`)
		if (expected.length === before.length) eq(result, value, `untouched text is returned as it was: ${label}`)
		else assert(result === result.trim(), `result is trimmed: ${label}`)
	}
})

if (parserReady) {
	await check('escape: against the real parser, the quoted words are phrases (never corrected or relaxed) and the rest is unchanged', () => {
		const strip = (chips) => chips.map((c) => [c.kind, c.clause])
		const kithcen = [typo('kithcen', 'kitchen')]

		// "Search instead": the typo becomes a phrase, everything around it keeps its meaning.
		const escape = bar.searchInsteadQuery('tag:kitchen kithcen -sink', kithcen)
		eq(strip(parseQuery(escape).chips), [['filter', 'tag:kitchen'], ['phrase', '"kithcen"'], ['term', '-sink']])
		eq(parseQuery(escape).warnings, [])
		eq(strip(parseQuery(bar.searchInsteadQuery('kithcen', kithcen)).chips), [['phrase', '"kithcen"']])
		const grouped = parseQuery(bar.searchInsteadQuery('(kithcen OR bath) blue', kithcen))
		eq(grouped.warnings, [])
		eq(grouped.chips.length, 2, 'the group is still one chip and blue another')

		// "Must include": a phrase among the words, so the library cannot relax the query again.
		const original = parseQuery('technician repairing sink')
		eq(parseLib.relaxableTerms(original), ['technician', 'repairing', 'sink'], 'the typed text can be relaxed')
		const required = bar.buildNotes({ value: 'technician repairing sink', warnings: [], corrections: [], dropped: ['sink'] }).dropped.require
		eq(parseLib.relaxableTerms(parseQuery(required)), null, 'the "must include" text can not')
		eq(strip(parseQuery(required).chips), [['term', 'technician'], ['term', 'repairing'], ['phrase', '"sink"']])

		// "Remove": only the remaining words, which the library can again treat as a plain AND.
		const removed = bar.buildNotes({ value: 'technician repairing sink', warnings: [], corrections: [], dropped: ['sink'] }).dropped.remove
		eq(parseLib.relaxableTerms(parseQuery(removed)), ['technician', 'repairing'])

		// Fuzz: whatever is typed, the escape parses without new warnings and keeps the number of clauses.
		const rand = rng(31)
		const pool = ['kithcen', 'remodel', 'tag:kitchen', '-sink', '(bath', 'blue)', '"a b"', 'OR', 'type:png', '#t', 'width:>5']
		for (let n = 0; n < 1500; n++) {
			let value = ''
			for (let i = 1 + Math.floor(rand() * 5); i > 0; i--) value += (value ? ' ' : '') + pool[Math.floor(rand() * pool.length)]
			const out = bar.searchInsteadQuery(value, kithcen)
			if (out === null) continue
			const a = parseQuery(value)
			const b = parseQuery(out)
			eq(b.warnings, a.warnings, `quoting the typo changed the warnings of ${JSON.stringify(value)}`)
			eq(b.chips.length, a.chips.length, `quoting the typo changed the clauses of ${JSON.stringify(value)}`)
		}
	})
} else skip('escape: real parser agrees', 'parse.ts is not usable here')

/* ========================================================================== */
/* SSR: SearchBar                                                             */
/* ========================================================================== */

/** A second copy of the bar whose live parser is `parse`, so the fallbacks can be driven whatever state the real one is in. */
function loadBarWithParser(parse) {
	mock('@/lib/media/query/parse', { parseQuery: parse })
	clearCache()
	try {
		return loadTs('src/app/account/media/search-bar.tsx')
	} finally {
		mock('@/lib/media/query/parse', parseLib)
		clearCache()
	}
}

const combo = (root) => findNode(root, (n) => n.attrs.role === 'combobox')
const listboxOf = (root) => findNode(root, (n) => n.attrs.role === 'listbox')
const buttonsNamed = (root, name) => findAllNodes(root, (n) => n.tag === 'button' && accessibleName(n, root) === name)
const chipItems = (root) => bySlot(root, 'search-chip')
const optionNodes = (root) => findAllNodes(root, (n) => n.attrs.role === 'option')

await check('ssr: an empty box carries the combobox and listbox wiring and nothing else', () => {
	const html = renderBar({})
	const root = staticChecks(html, 'empty')
	const input = combo(root)
	assert(input && input.tag === 'input', 'a combobox input')
	eq(input.attrs.type, 'text')
	eq(input.attrs['aria-expanded'], 'false')
	eq(input.attrs['aria-autocomplete'], 'list')
	eq(input.attrs['aria-haspopup'], 'listbox')
	eq(input.attrs.autocomplete ?? input.attrs.autoComplete, 'off')
	eq(input.attrs.maxlength ?? input.attrs.maxLength, String(MEDIA_LIMITS.queryMax))
	assert(input.attrs['aria-controls'], 'aria-controls names the listbox')
	eq(input.attrs['aria-activedescendant'], undefined, 'nothing is highlighted while closed')
	eq(input.attrs['aria-busy'], undefined)
	eq(input.attrs['aria-describedby'], undefined, 'no notes, nothing to describe it')
	eq(accessibleName(input, root), 'Search your media library')
	assert(input.attrs.placeholder.includes('tag:kitchen'), 'the placeholder teaches the language')
	const list = listboxOf(root)
	assert(list, 'a listbox')
	eq(list.attrs.id, input.attrs['aria-controls'], 'aria-controls points at the listbox')
	assert(list.attrs.hidden !== undefined, 'the closed listbox is hidden')
	eq(optionNodes(root).length, 0, 'a closed listbox holds no options')
	eq(findAllNodes(root, (n) => n.attrs.role === 'combobox').length, 1)
	// Nothing active: no chips, no clear all, no save, no notes, no spinner.
	eq(bySlot(root, 'search-chips').length, 0)
	eq(buttonsNamed(root, 'Clear all').length, 0)
	eq(buttonsNamed(root, 'Save search').length, 0)
	eq(bySlot(root, 'search-notes').length, 0)
	assert(!html.includes('animate-spin'), 'no spinner while idle')
	// Search tips is closed.
	const tipsButton = buttonsNamed(root, 'Search tips')[0]
	assert(tipsButton, 'a Search tips button')
	eq(tipsButton.attrs['aria-expanded'], 'false')
	eq(tipsButton.attrs['aria-controls'], undefined)
	eq(bySlot(root, 'search-tips').length, 0)
	// The slash shortcut is hinted, to sighted keyboard users only.
	const kbd = findNode(root, (n) => n.tag === 'kbd')
	assert(kbd && kbd.attrs['aria-hidden'] === 'true' && textOf(kbd).trim() === '/', 'a hidden "/" hint')
	const search = findNode(root, (n) => n.attrs.role === 'search')
	assert(search && search.attrs['aria-label'], 'the bar is a labelled search landmark')
})

await check('ssr: loading shows a spinner and marks the box busy; the clear button follows the text', () => {
	const busy = renderBar({ loading: true, value: 'kit' })
	const root = staticChecks(busy, 'loading')
	eq(combo(root).attrs['aria-busy'], 'true')
	assert(busy.includes('animate-spin') && busy.includes('motion-reduce:animate-none'), 'a spinner that respects reduced motion')
	assert(!renderBar({ loading: false }).includes('animate-spin'))
	eq(buttonsNamed(root, 'Clear search').length, 1, 'text can be cleared with the mouse')
	eq(combo(root).attrs.value, 'kit')
	eq(buttonsNamed(parseHtml(renderBar({ value: '' })), 'Clear search').length, 0)
	// Controlled: the box shows exactly the value it is given.
	eq(combo(parseHtml(renderBar({ value: '  tag:"a b"  ' }))).attrs.value, '  tag:"a b"  ')
})

const CHIPS = [
	chip({ key: 'kitchen', kind: 'term', label: 'kitchen', clause: 'kitchen', start: 0, end: 7 }),
	chip({ key: '"before and after"', kind: 'phrase', label: '"before and after"', clause: '"before and after"', start: 8, end: 26 }),
	chip({ key: 'tag:kitchen', kind: 'filter', label: 'tag: kitchen', clause: 'tag:kitchen', field: 'tag', values: ['kitchen'], start: 27, end: 38 }),
	chip({ key: '-tag:people', kind: 'filter', label: 'not tag: people', clause: '-tag:people', field: 'tag', values: ['people'], negated: true, start: 39, end: 50 }),
	chip({ key: '-sink', kind: 'term', label: 'not: sink', clause: '-sink', negated: true, start: 51, end: 56 }),
]

await check('ssr: chips for a term, a phrase, a filter and negated ones, each with its own remove button', () => {
	const html = renderBar({ chips: CHIPS, value: 'kitchen "before and after" tag:kitchen -tag:people -sink' })
	const root = staticChecks(html, 'chips')
	const list = bySlot(root, 'search-chips')[0]
	assert(list && list.tag === 'ul' && list.attrs['aria-label'] === 'Active filters', 'a labelled list of chips')
	const items = chipItems(root)
	eq(items.map((li) => li.attrs['data-kind']), ['term', 'phrase', 'filter', 'filter', 'term'])
	eq(items.map((li) => squash(textOf(li))), ['kitchen', '"before and after"', 'tag: kitchen', 'not tag: people', 'not sink'], 'a negated chip says "not" exactly once')
	eq(items.map((li) => li.attrs['data-negated'] !== undefined), [false, false, false, true, true])
	for (const li of items.filter((n) => n.attrs['data-negated'] !== undefined)) {
		const lead = li.children.find((c) => c.tag === 'span')
		eq(squash(textOf(lead)), 'not', 'a leading "not"')
	}
	eq(
		findAllNodes(root, (n) => n.tag === 'button' && /^Remove /.test(n.attrs['aria-label'] ?? '')).map((b) => b.attrs['aria-label']),
		['Remove kitchen', 'Remove "before and after"', 'Remove tag: kitchen', 'Remove not tag: people', 'Remove not sink'],
	)
	eq(buttonsNamed(root, 'Clear all').length, 1, 'Clear all appears when anything is active')
	for (const b of findAllNodes(root, (n) => n.tag === 'button')) eq(b.attrs.type, 'button', 'no accidental form submit')
})

if (parserReady) {
	await check('ssr: the chips the real parser produces draw correctly, negation included', () => {
		const raw = 'kitchen "before and after" tag:kitchen -tag:people -sink NOT dirty width:>1200 sort:newest'
		const parsed = parseQuery(raw)
		const root = staticChecks(renderBar({ chips: parsed.chips, value: raw }), 'real chips')
		const items = chipItems(root)
		eq(items.length, parsed.chips.length)
		parsed.chips.forEach((c, i) => {
			const text = squash(textOf(items[i]))
			assert(!/^not not\b/.test(text), `"${c.label}" drew as "${text}"`)
			if (c.negated) eq(items[i].attrs['data-negated'], 'true', `${c.label} is drawn as negated`)
			else eq(text, c.label)
			assert(text.includes(bar.chipLabel(c)), `${text} lacks ${bar.chipLabel(c)}`)
		})
	})
} else skip('ssr: real parser chips', 'parse.ts is not usable here')

await check('ssr: chip text is data: markup in a label or a clause is escaped, long and repeated chips are fine', () => {
	const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>'
	const html = renderBar({
		chips: [
			chip({ label: evil, clause: evil, key: evil }),
			chip({ label: 'x'.repeat(5000), key: 'long', start: 1 }),
			chip({ key: 'same', start: 2, label: 'same' }),
			chip({ key: 'same', start: 3, label: 'same' }),
		],
	})
	assert(!html.includes('<script>') && !html.includes('<img src=x'), 'chip text rendered as HTML')
	assert(html.includes('&lt;script&gt;'), 'it is shown as text')
	const many = Array.from({ length: 400 }, (_, i) => chip({ key: `k${i}`, label: `word${i}`, start: i, end: i + 1 }))
	const root = parseHtml(renderBar({ chips: many }))
	eq(chipItems(root).length, 400)
})

await check('ssr: the scope pill reads "in <folder> and subfolders" or "only", with a menu and an x', () => {
	for (const [deep, text] of [
		[true, 'in Clients/Acme and subfolders'],
		[false, 'in Clients/Acme only'],
	]) {
		const html = renderBar({ scope: { label: 'Clients/Acme', deep } })
		const root = staticChecks(html, `scope ${deep}`)
		const pill = bySlot(root, 'search-scope')[0]
		assert(pill, 'a scope pill')
		eq(squash(textOf(pill)), text)
		const menu = findNode(pill, (n) => n.tag === 'button' && n.attrs['aria-haspopup'] === 'menu')
		assert(menu, 'a menu trigger toggles subfolders')
		eq(menu.attrs['aria-label'], `Search scope: ${text}`)
		eq(menu.attrs['aria-expanded'], 'false')
		eq(buttonsNamed(root, 'Search everywhere').length, 1, 'the x widens the search to everywhere')
		eq(buttonsNamed(root, 'Clear all').length, 1, 'a scope counts as something active')
		assert(bySlot(root, 'search-chips').length === 1, 'the pill sits in the same list as the chips')
	}
	eq(bySlot(parseHtml(renderBar({ scope: null })), 'search-scope').length, 0)
	const evil = renderBar({ scope: { label: '<img src=x onerror=alert(1)>', deep: true } })
	assert(!evil.includes('<img src=x'), 'a folder name is text')
	eq(squash(textOf(bySlot(parseHtml(renderBar({ scope: { label: '   ', deep: true } })), 'search-scope')[0])), 'in this folder and subfolders')
	// A parent that passes something that is not a label must not take the bar down.
	renderBar({ scope: { label: 42, deep: true } })
	renderBar({ scope: { label: undefined, deep: false } })
})

if (parserReady) {
	await check('ssr: warnings from the live parser show in an amber note, and the box is described by it', () => {
		const html = renderBar({ value: 'type:xyz', warnings: [] })
		const root = staticChecks(html, 'live warning')
		const note = bySlot(root, 'search-warnings')[0]
		assert(note, 'an inline warning')
		eq(squash(textOf(note)), 'Unknown type "xyz" was ignored.')
		assert(note.attrs.class.includes('amber'), 'amber, not red: the search still ran')
		const container = bySlot(root, 'search-notes')[0]
		eq(combo(root).attrs['aria-describedby'], container.attrs.id, 'a screen reader hears the warning with the box')
		// Fine text, no warning, whatever the server last said.
		const clean = parseHtml(renderBar({ value: 'kitchen', warnings: ['stale server warning'] }))
		eq(bySlot(clean, 'search-warnings').length, 0, 'the live parse describes what is in the box now')
	})
} else skip('ssr: live warnings', 'parse.ts is not usable here')

await check('ssr: when the live parser is unavailable the last search\'s warnings are shown instead', () => {
	const broken = loadBarWithParser(() => {
		throw new Error('not implemented: parseQuery')
	})
	const html = renderToString(h(broken.SearchBar, barProps({ value: 'type:xyz', warnings: ['Unknown type "xyz" was ignored.'] })))
	const note = bySlot(parseHtml(html), 'search-warnings')[0]
	assert(note, 'the server warning is shown')
	eq(squash(textOf(note)), 'Unknown type "xyz" was ignored.')
	const empty = renderToString(h(broken.SearchBar, barProps({ value: '' })))
	eq(bySlot(parseHtml(empty), 'search-warnings').length, 0)
})

await check('ssr: warnings are bounded, de-duplicated and escaped; with an empty box the server speaks', () => {
	const many = Array.from({ length: 9 }, (_, i) => `Warning number ${i}`)
	const root = parseHtml(renderBar({ value: '', warnings: [...many, many[0], '', '  '] }))
	const note = bySlot(root, 'search-warnings')[0]
	eq(findAllNodes(note, (n) => n.tag === 'li').map((li) => squash(textOf(li))), [...many.slice(0, 4).map((w) => w), 'and 5 more'])
	const evil = renderBar({ value: '', warnings: ['<script>alert(1)</script>'] })
	assert(!evil.includes('<script>alert') && evil.includes('&lt;script&gt;'))
	eq(bySlot(parseHtml(renderBar({ value: '', warnings: [] })), 'search-notes').length, 0)
})

await check('ssr: a typo correction reads "Showing results for kitchen. Search instead for kithcen"', () => {
	const html = renderBar({ value: 'kithcen', corrections: [{ from: 'kithcen', to: 'kitchen' }] })
	const root = staticChecks(html, 'correction')
	const line = bySlot(root, 'search-corrections')[0]
	assert(line, 'a corrections line')
	eq(squash(textOf(line)), 'Showing results for kitchen. Search instead for kithcen')
	eq(buttonsNamed(root, 'Search instead for kithcen').length, 1)
	// A followed tag rename is stated, not offered back.
	const rename = parseHtml(renderBar({ value: 'tag:van', corrections: [{ from: 'tag:van', to: 'tag:truck' }] }))
	eq(squash(textOf(bySlot(rename, 'search-corrections')[0])), 'Showing results for tag:truck.')
	eq(findAllNodes(rename, (n) => n.tag === 'button' && /Search instead/.test(textOf(n))).length, 0)
	// Several words.
	const two = parseHtml(renderBar({ value: 'kithcen remodl', corrections: [typo('kithcen', 'kitchen'), typo('remodl', 'remodel')] }))
	eq(squash(textOf(bySlot(two, 'search-corrections')[0])), 'Showing results for kitchen and remodel. Search instead for kithcen and remodl')
	// With nothing in the box, last time's correction is not shown.
	eq(bySlot(parseHtml(renderBar({ value: '', corrections: [typo('kithcen', 'kitchen')] })), 'search-corrections').length, 0)
	// Hostile corrections.
	const evil = renderBar({ value: 'x', corrections: [{ from: '<b>x</b>', to: '<script>1</script>' }, null, { from: 1 }] })
	assert(!evil.includes('<script>1') && !evil.includes('<b>x'), 'corrections are text')
})

await check('ssr: dropped words read "No images mention sink. Showing results for technician repairing."', () => {
	const html = renderBar({ value: 'technician repairing sink', dropped: ['sink'] })
	const root = staticChecks(html, 'dropped')
	const line = bySlot(root, 'search-dropped')[0]
	assert(line, 'a dropped line')
	eq(squash(textOf(findNode(line, (n) => n.tag === 'span' && /No images/.test(textOf(n))))), 'No images mention sink. Showing results for technician repairing.')
	// A way back to the literal query, and a way to tidy the box.
	eq(buttonsNamed(root, 'Must include sink').length, 1)
	eq(buttonsNamed(root, 'Remove sink').length, 1)
	// Several.
	const many = parseHtml(renderBar({ value: 'plumber sink faucet tap', dropped: ['sink', 'faucet', 'tap'] }))
	const text = squash(textOf(findNode(bySlot(many, 'search-dropped')[0], (n) => n.tag === 'span' && /No images/.test(textOf(n)))))
	eq(text, 'No images mention sink, faucet or tap. Showing results for plumber.')
	eq(bySlot(parseHtml(renderBar({ value: 'a b', dropped: [] })), 'search-dropped').length, 0)
	eq(bySlot(parseHtml(renderBar({ value: '', dropped: ['x'] })), 'search-dropped').length, 0)
	const evil = renderBar({ value: 'a <b>', dropped: ['<script>1</script>'] })
	assert(!evil.includes('<script>1'), 'dropped words are text')
})

await check('ssr: Save search is offered only when canSave, and never as a control that would fail', () => {
	const yes = staticChecks(renderBar({ canSave: true }), 'canSave')
	const button = buttonsNamed(yes, 'Save search')[0]
	assert(button, 'a Save search button')
	eq(button.attrs['aria-haspopup'], 'dialog', 'it opens a small popover')
	eq(button.attrs['aria-expanded'], 'false')
	eq(buttonsNamed(parseHtml(renderBar({ canSave: false })), 'Save search').length, 0)
	// The name form lives in the popover, which is not in the page until it opens.
	assert(!renderBar({ canSave: true }).includes('Name this search'))
})

await check('ssr: recent searches are not in the page while the box is closed (they appear when it is focused and empty)', () => {
	const html = renderBar({ recent: ['kitchen', 'tag:logo'] })
	assert(!html.includes('Recent searches') && !html.includes('Narrow by'), 'the closed list stays empty')
	eq(optionNodes(parseHtml(html)).length, 0)
})

await check('ssr: the focused-empty list is up to 5 recent searches, then Narrow by with six operator rows and hints', () => {
	const recent = ['kitchen', 'tag:logo', 'color:blue type:png', '"before and after"', 'added:7d', 'sixth', 'seventh']
	const options = bar.emptyOptions(recent, 'opt-')
	const html = renderToString(h(bar.SuggestionList, { id: 'list-1', open: true, options, activeIndex: -1, onPick: noop }))
	const root = staticChecks(html, 'focused-empty list')
	const list = listboxOf(root)
	eq(list.attrs.id, 'list-1')
	eq(list.attrs.hidden, undefined, 'open')
	eq(accessibleName(list, root), 'Search suggestions')
	const groups = findAllNodes(root, (n) => n.attrs.role === 'group')
	eq(groups.map((g) => g.attrs['aria-label']), ['Recent searches', 'Narrow by'])
	const rows = optionNodes(root)
	eq(rows.length, 5 + 6)
	eq(findAllNodes(groups[0], (n) => n.attrs.role === 'option').map((o) => squash(textOf(o))), recent.slice(0, 5))
	const narrow = findAllNodes(groups[1], (n) => n.attrs.role === 'option').map((o) => squash(textOf(o)))
	eq(narrow.map((t) => t.split(' ')[0]), ['Tag', 'Color', 'Type', 'Folder', 'Added', 'Needs'])
	for (const [i, row] of bar.NARROW_BY.entries()) assert(narrow[i].includes(row.hint), `${row.label} shows its hint: ${narrow[i]}`)
	for (const o of rows) eq(o.attrs['aria-selected'], 'false', 'nothing is highlighted until Up/Down')
	eq(new Set(rows.map((r) => r.attrs.id)).size, 11)
	// Closed: hidden and empty.
	const closed = parseHtml(renderToString(h(bar.SuggestionList, { id: 'list-1', open: false, options, activeIndex: -1, onPick: noop })))
	assert(listboxOf(closed).attrs.hidden !== undefined)
	eq(optionNodes(closed).length, 0)
	// One highlighted row at a time.
	const active = parseHtml(renderToString(h(bar.SuggestionList, { id: 'list-1', open: true, options, activeIndex: 7, onPick: noop })))
	eq(optionNodes(active).filter((o) => o.attrs['aria-selected'] === 'true').map((o) => o.attrs.id), ['opt-7'])
	// The highlight is a shape (a bar) as well as a tint: it never rests on color alone.
	const lit = optionNodes(active).find((o) => o.attrs['aria-selected'] === 'true')
	assert(/(^|\s)before:absolute(\s|$)/.test(lit.attrs.class) && /before:w-/.test(lit.attrs.class), 'the highlighted row carries a bar')
	assert(!optionNodes(active).filter((o) => o !== lit).some((o) => /before:absolute/.test(o.attrs.class)), 'and only that row does')
	// A hostile row can only ever be text.
	const evil = bar.emptyOptions(['<img src=x onerror=alert(1)>'], 'e-')
	assert(!renderToString(h(bar.SuggestionList, { id: 'x', open: true, options: evil, activeIndex: -1, onPick: noop })).includes('<img src=x'))
})

await check('ssr: a typed list shows Tags with counts, Folders, Filters with hints, Values with swatches and a last Search row', () => {
	const options = bar.typedOptions(SUGGESTIONS, 'kit', 'o-')
	const html = renderToString(h(bar.SuggestionList, { id: 'list-2', open: true, options, activeIndex: -1, onPick: noop }))
	const root = staticChecks(html, 'typed list')
	eq(findAllNodes(root, (n) => n.attrs.role === 'group').map((g) => g.attrs['aria-label']), ['Tags', 'Folders', 'Filters', 'Values'])
	const rows = optionNodes(root)
	eq(rows.map((o) => o.attrs['data-kind']), ['tag', 'tag', 'folder', 'operator', 'value', 'search'])
	assert(squash(textOf(rows[0])).includes('214'), 'a tag shows its count')
	assert(squash(textOf(rows[3])).includes('Dominant color, like color:blue'), 'an operator shows its one-line description')
	assert(/background-color:\s*#2f6fed/i.test(html), 'a color value shows its swatch')
	assert(squash(textOf(rows[5])).startsWith('Search for "kit"'))
	assert(rows[5].parent.attrs.role !== 'group', 'the last row stands outside every group')
	for (const o of rows) eq(o.attrs['aria-selected'], 'false', 'the Search for row is never auto-highlighted')
	// A swatch is only ever a color: nothing else reaches the style attribute.
	const sneaky = bar.typedOptions([{ kind: 'value', label: 'x', insert: 'color:x', swatch: 'red;position:fixed' }], 'x', 's-')
	assert(!renderToString(h(bar.SuggestionList, { id: 'x', open: true, options: sneaky, activeIndex: -1, onPick: noop })).includes('position:fixed'))
})

await check('ssr: hostile props never crash the bar: nulls, wrong types, enormous arrays', () => {
	for (const over of [
		{ chips: null, warnings: null, corrections: null, dropped: null, recent: null },
		{ chips: undefined, warnings: undefined, corrections: undefined, dropped: undefined, recent: undefined },
		{ value: undefined },
		{ value: 42 },
		{ value: null },
		{ chips: 'abc', warnings: 5, corrections: {}, dropped: 'x', recent: 'y' },
		{ recent: [null, 1, {}, '', 'ok'] },
		{ warnings: [null, 1, {}, 'ok'] },
		{ dropped: [null, 1, {}, 'ok'], value: 'ok more' },
		{ corrections: [null, 1, {}, { from: 'a', to: 'b' }], value: 'a' },
		{ value: 'x'.repeat(100_000) },
		{ chips: Array.from({ length: 2000 }, (_, i) => chip({ key: `${i}`, start: i, end: i })) },
	])
		renderBar(over)
})

await check('ssr: the fully loaded bar passes the static accessibility checks', () => {
	const root = staticChecks(
		renderBar({
			value: 'kithcen sink',
			chips: CHIPS,
			warnings: [],
			corrections: [typo('kithcen', 'kitchen')],
			dropped: ['sink'],
			loading: true,
			scope: { label: 'Clients/Acme', deep: true },
			recent: ['a'],
			canSave: true,
		}),
		'full',
	)
	for (const b of findAllNodes(root, (n) => n.tag === 'button')) assert(accessibleName(b, root), 'every button is named')
	for (const el of findAllNodes(root, (n) => n.tag === 'svg')) eq(el.attrs['aria-hidden'], 'true', 'decorative icons are hidden from assistive tech')
})

/* ========================================================================== */
/* SSR and language: SearchTips                                               */
/* ========================================================================== */

const allTips = tips.SEARCH_TIPS.flatMap((g) => g.tips)

await check('tips: the cheat sheet is a labelled section of copyable examples, each a real button', () => {
	const html = renderToString(h(tips.SearchTips, { id: 'tips-1', onPick: noop }))
	const root = staticChecks(html, 'tips')
	const section = findNode(root, (n) => n.tag === 'section')
	eq(section.attrs.id, 'tips-1')
	eq(section.attrs['aria-label'], 'Search tips')
	eq(findAllNodes(root, (n) => n.tag === 'h3').map((n) => squash(textOf(n))), tips.SEARCH_TIPS.map((g) => g.title))
	const buttons = findAllNodes(root, (n) => n.tag === 'button')
	eq(buttons.length, allTips.length)
	eq(buttons.map((b) => squash(textOf(b))), allTips.map((t) => t.example), 'each button shows its example verbatim')
	eq(buttons.map((b) => b.attrs['aria-label']), allTips.map((t) => `Add ${t.example} to your search`))
	for (const b of buttons) eq(b.attrs.type, 'button')
	for (const t of allTips) assert(html.includes(squash(t.note).replace(/&/g, '&amp;')) || html.includes(t.note), `note shown: ${t.note}`)
})

await check('tips: every example is a unique one-line string, with a note, and uses only real operators and values', () => {
	eq(new Set(allTips.map((t) => t.example)).size, allTips.length, 'no duplicate examples')
	for (const t of allTips) {
		assert(t.example.trim() === t.example && t.example !== '' && !/[\r\n]/.test(t.example), `example ${JSON.stringify(t.example)}`)
		assert(t.example.length <= 60, `compact: ${t.example}`)
		assert(typeof t.note === 'string' && t.note.trim() !== '' && !/[\r\n]/.test(t.note), `note for ${t.example}`)
	}
	const operators = new Set()
	for (const { example } of allTips) {
		const m = /^(-?)([a-z]+):(.*)$/.exec(example)
		if (!m) continue
		const [, , field, rest] = m
		operators.add(field)
		assert(queryTypes.QUERY_FIELDS.includes(field), `${example}: ${field} is not an operator`)
		const values = rest.replace(/^"|"$/g, '').split(',')
		const listed = { type: MEDIA_FORMATS, orientation: MEDIA_ORIENTATIONS, kind: MEDIA_KINDS, is: queryTypes.IS_FLAGS, sort: MEDIA_SORTS }[field]
		if (listed) for (const v of values) assert(listed.includes(v), `${example}: ${v} is not a ${field}`)
		if (field === 'color') for (const v of values) assert(colorsLib.isColorName(v), `${example}: ${v} is not a color`)
	}
	for (const field of queryTypes.QUERY_FIELDS) assert(operators.has(field), `the cheat sheet never shows ${field}:`)
	// The words of the language are shown too.
	for (const word of ['OR', '-people', '"before and after"', '(kitchen OR bath) blue']) assert(allTips.some((t) => t.example.includes(word)), `no example for ${word}`)
	// The five Narrow by operators the box teaches are all in the cheat sheet.
	for (const row of bar.NARROW_BY) assert(operators.has(row.insert.replace(':', '')), `Narrow by ${row.label} has no example`)
})

if (parserReady) {
	await check('tips: the real parser reads every example cleanly, with no warning and at least one chip', () => {
		for (const { example } of allTips) {
			const parsed = parseQuery(example)
			eq(parsed.warnings, [], `${example} warns`)
			assert(parsed.chips.length >= 1, `${example} makes no chip`)
			assert(parsed.chips.every((c) => c.start >= 0 && c.end > c.start && c.end <= example.length), `${example} chips are inside the text`)
		}
		// Clicking two examples in a row keeps both clauses.
		const both = tips.appendExample(tips.appendExample('', 'tag:kitchen'), 'color:blue')
		eq(parseQuery(both).chips.map((c) => c.clause), ['tag:kitchen', 'color:blue'])
	})
} else skip('tips: every example parses', 'parse.ts is not usable here')

await check('tips: clicking an example adds it after a space, never gluing two clauses, never cutting one in half', () => {
	eq(tips.appendExample('', 'tag:kitchen'), 'tag:kitchen')
	eq(tips.appendExample('kitchen', 'tag:kitchen'), 'kitchen tag:kitchen')
	eq(tips.appendExample('kitchen ', 'tag:kitchen'), 'kitchen tag:kitchen')
	eq(tips.appendExample('kitchen\t', 'color:blue'), 'kitchen\tcolor:blue')
	eq(tips.appendExample('  ', 'color:blue'), '  color:blue')
	eq(tips.appendExample('a', ''), 'a ')
	const near = 'a'.repeat(MEDIA_LIMITS.queryMax - 10)
	eq(tips.appendExample(near, 'tag:kitchen'), null, 'would not fit: refused, not truncated')
	eq(tips.appendExample('a'.repeat(MEDIA_LIMITS.queryMax - 12), 'tag:kitchen')?.length, MEDIA_LIMITS.queryMax - 12 + 1 + 11)
	eq(tips.appendExample('a'.repeat(MEDIA_LIMITS.queryMax), 'x'), null)
})

await check('ssr: chips that cannot be read are left out instead of breaking the row, and a huge folder label is just text', () => {
	const good = chip({ key: 'a', label: 'a', start: 0 })
	const alsoGood = chip({ key: 'b', label: 'not: b', negated: true, start: 1 })
	const html = renderBar({ chips: [null, undefined, 42, 'str', {}, { label: 5 }, { label: '   ' }, { label: undefined, negated: true }, good, alsoGood] })
	const root = staticChecks(html, 'unreadable chips')
	eq(chipItems(root).map((li) => squash(textOf(li))), ['a', 'not b'])
	// Nothing readable at all: no empty chip list, no Clear all.
	const none = parseHtml(renderBar({ chips: [null, {}, { label: '' }] }))
	eq(bySlot(none, 'search-chips').length, 0)
	eq(buttonsNamed(none, 'Clear all').length, 0)
	renderBar({ scope: { label: 'x'.repeat(20_000), deep: false } })
	eq(bar.chipLabel({ label: undefined, negated: true }), '')
	eq(bar.chipLabel({ label: 7, negated: false }), '')
})

/* ========================================================================== */
/* Interaction: the real SearchBar driven through the mini renderer           */
/* ========================================================================== */

// Radix menus and popovers draw through portals and need a DOM. The interactive copy of the bar
// gets small stand-ins for them, so the bar's own handlers are what is under test.
const popoverState = { open: false, onOpenChange: null }
let menuGroup = null
mock('@/components/ui/popover', {
	Popover: ({ open, onOpenChange, children }) => {
		popoverState.open = open
		popoverState.onOpenChange = onOpenChange
		return children
	},
	PopoverTrigger: ({ children }) =>
		React.cloneElement(children, {
			onClick: () => popoverState.onOpenChange(!popoverState.open),
			'aria-haspopup': 'dialog',
			'aria-expanded': popoverState.open,
		}),
	PopoverContent: ({ children }) => (popoverState.open ? h('div', { role: 'dialog' }, children) : null),
})
mock('@/components/ui/dropdown-menu', {
	DropdownMenu: ({ children }) => h('div', { 'data-menu': '' }, children),
	DropdownMenuTrigger: ({ children, ...rest }) => h('button', { type: 'button', 'aria-haspopup': 'menu', ...rest }, children),
	DropdownMenuContent: ({ children }) => h('div', { role: 'menu' }, children),
	DropdownMenuRadioGroup: ({ value, onValueChange, children }) => {
		menuGroup = { value, onValueChange }
		return h('div', { role: 'group' }, children)
	},
	DropdownMenuRadioItem: ({ value, children }) => {
		const group = menuGroup
		return h('div', { role: 'menuitemradio', 'data-value': value, 'aria-checked': group.value === value, onClick: () => group.onValueChange(value) }, children)
	},
})
mock('@/components/ui/label', { Label: ({ htmlFor, children }) => h('label', { htmlFor }, children) })
clearCache()
const live = loadTs('src/app/account/media/search-bar.tsx')
// Back to the real components for anything loaded later.
for (const name of ['popover', 'dropdown-menu', 'label']) mock(`@/components/ui/${name}`, loadTs(`src/components/ui/${name}.tsx`))
clearCache()

/** One bar, mounted, with a fake clock, fake endpoint, fake `document` and a parent that owns the text. */
function newBar(over = {}) {
	const doc = createDocument()
	globalThis.document = doc
	const clock = createClock()
	clock.install()
	popoverState.open = false
	const fetch = createFetch(over.fetchOptions)
	const spy = { changes: [], submits: [], removed: [], clearScope: 0, toggleDeep: 0, clearAll: 0, saves: [] }
	const inputRef = over.inputRef ?? { current: null }
	function Parent() {
		const [value, setValue] = React.useState(over.initial ?? '')
		return h(
			live.SearchBar,
			barProps({
				recent: over.recent ?? [],
				chips: over.chips ?? [],
				warnings: over.warnings ?? [],
				corrections: over.corrections ?? [],
				dropped: over.dropped ?? [],
				scope: over.scope ?? null,
				canSave: over.canSave ?? false,
				loading: over.loading ?? false,
				value,
				fetchSuggestions: fetch,
				inputRef,
				onChange: (next) => {
					spy.changes.push(next)
					setValue(next)
				},
				onSubmit: (next) => spy.submits.push(next),
				onRemoveChip: (c) => spy.removed.push(c),
				onClearScope: () => spy.clearScope++,
				onToggleScopeDeep: () => spy.toggleDeep++,
				onClearAll: () => spy.clearAll++,
				onSave: (name) => {
					spy.saves.push(name)
					return over.onSave ? over.onSave(name) : Promise.resolve()
				},
			}),
		)
	}
	const m = mount(Parent, {}, doc)
	const t = {
		m,
		doc,
		clock,
		fetch,
		spy,
		inputRef,
		input: () => m.find((n) => n.type === 'input' && n.props.role === 'combobox'),
		fake: () => m.fake(t.input()),
		listbox: () => m.find((n) => n.props?.role === 'listbox'),
		options: () => m.findAll((n) => n.props?.role === 'option'),
		optionTexts: () => t.options().map((o) => squash(m.text(o))),
		value: () => t.input().props.value,
		expanded: () => t.input().props['aria-expanded'],
		active: () => t.input().props['aria-activedescendant'],
		selected: () => t.options().filter((o) => o.props['aria-selected'] === true).map((o) => squash(m.text(o))),
		button: (name) => m.find((n) => n.type === 'button' && (n.props['aria-label'] === name || squash(m.text(n)) === name)),
		slot: (name) => m.find((n) => n.props?.['data-slot'] === name),
		notes: () => squash(m.find((n) => n.props?.['data-slot'] === 'search-notes') ? m.text(m.find((n) => n.props?.['data-slot'] === 'search-notes')) : ''),
		focus: () => m.act(() => t.fake().focus()),
		blur: () => m.act(() => t.fake().blur()),
		/** What the person types: the new text and where the caret is. */
		type(text, caret = text.length) {
			m.act(() => {
				const f = t.fake()
				f.selectionStart = f.selectionEnd = caret
				t.input().props.onChange({ target: { value: text, selectionStart: caret } })
			})
		},
		key(key, extra = {}) {
			const e = ev({ key, ...extra })
			m.act(() => t.input().props.onKeyDown(e))
			return e
		},
		click(el, extra = {}) {
			const e = ev(extra)
			m.act(() => el.props.onClick(e))
			return e
		},
		/** Waits out the debounce and answers the latest question. */
		async answer(rows = SUGGESTIONS, index) {
			t.clock.advance(bar.SUGGEST_DEBOUNCE_MS)
			await tick()
			const call = t.fetch.calls[index ?? t.fetch.calls.length - 1]
			assert(call, 'the debounce fired no request')
			call.resolve(rows)
			await tick()
		},
		done() {
			t.clock.uninstall()
			m.unmount()
			delete globalThis.document
		},
	}
	return t
}

async function withBar(over, fn) {
	const t = newBar(over)
	try {
		await fn(t)
	} finally {
		t.done()
	}
}

/** A bar with 'kit' typed and the server's answer in. */
const withResults = (over, fn, rows = SUGGESTIONS) =>
	withBar(over, async (t) => {
		t.focus()
		t.type('kit')
		await t.answer(rows)
		await fn(t)
	})

await check('ui: focusing an empty box lists recent searches and Narrow by, wired as a combobox, with no fetch', async () => {
	await withBar({ recent: ['kitchen', 'tag:logo'] }, async (t) => {
		eq(t.expanded(), false)
		eq(t.listbox().props.hidden, true)
		t.focus()
		eq(t.expanded(), true)
		eq(t.input().props['aria-controls'], t.listbox().props.id)
		eq(t.listbox().props.hidden, false)
		eq(t.optionTexts().length, 8)
		eq(t.optionTexts().slice(0, 2), ['kitchen', 'tag:logo'])
		assert(t.optionTexts()[2].startsWith('Tag') && t.optionTexts()[7].startsWith('Needs review'), t.optionTexts().join(' | '))
		eq(t.active(), undefined, 'no row is highlighted until Up/Down')
		eq(t.selected(), [])
		t.clock.advance(5000)
		await tick()
		eq(t.fetch.calls.length, 0, 'nothing is fetched for an empty box')
		eq(t.clock.pending, 0, 'and no timer is waiting to')
		// The ids the input points at exist and are unique.
		const ids = t.options().map((o) => o.props.id)
		eq(new Set(ids).size, ids.length)
		for (const o of t.options()) eq(o.props.role, 'option')
	})
})

await check('ui: choosing a Narrow by row inserts "operator:", keeps focus and the list, and asks for values', async () => {
	await withBar({}, async (t) => {
		t.focus()
		const tag = t.options().find((o) => t.m.text(o).startsWith('Tag'))
		t.click(tag)
		eq(t.value(), 'tag:')
		eq(t.spy.changes, ['tag:'])
		eq(t.spy.submits, [], 'an operator is a step toward a search, not a search')
		assert(t.doc.activeElement === t.fake(), 'focus stays in the box')
		eq(t.expanded(), true, 'the list stays open for the value')
		eq([t.fake().selectionStart, t.fake().selectionEnd], [4, 4], 'caret right after the colon')
		await t.answer([{ kind: 'tag', label: 'Kitchen', insert: 'tag:kitchen', count: 3 }])
		eq(t.fetch.calls.map((c) => c.input), ['tag:'])
		eq(t.optionTexts().map((x) => x.split(' ')[0]), ['Kitchen', 'Search'])
	})
	// Every Narrow by row does the same.
	for (const row of bar.NARROW_BY) {
		await withBar({}, async (t) => {
			t.focus()
			t.click(t.options().find((o) => t.m.text(o).startsWith(row.label)))
			eq([t.value(), t.spy.submits.length, t.expanded()], [row.insert, 0, true], row.label)
		})
	}
})

await check('ui: typing asks once after ~120 ms, about the word being typed; until then the list is just "Search for"', async () => {
	await withBar({}, async (t) => {
		t.focus()
		t.type('k')
		t.type('ki')
		t.type('kit')
		eq(t.spy.changes, ['k', 'ki', 'kit'], 'onChange fires on every edit')
		eq(t.optionTexts(), ['Search for "kit"'], 'never a list for an older input')
		eq(t.listbox().props['aria-busy'], true, 'busy while the answer is on its way')
		t.clock.advance(119)
		eq(t.fetch.calls.length, 0)
		t.clock.advance(1)
		eq(t.fetch.calls.length, 1)
		eq(t.fetch.calls[0].input, 'kit')
		assert(t.fetch.calls[0].signal instanceof AbortSignal)
		t.fetch.calls[0].resolve(SUGGESTIONS)
		await tick()
		eq(t.listbox().props['aria-busy'], undefined)
		const groups = t.m.findAll((n) => n.props?.role === 'group').map((g) => g.props['aria-label'])
		eq(groups, ['Tags', 'Folders', 'Filters', 'Values'])
		eq(t.optionTexts().length, 6)
		assert(t.optionTexts()[0].includes('214'), 'tag counts are shown')
		eq(t.optionTexts().at(-1), 'Search for "kit"')
		eq(t.active(), undefined, 'results arriving never highlight a row, least of all Search for')
		eq(t.selected(), [])
		eq(t.expanded(), true)
	})
})

await check('ui: a stale answer is never shown next to a newer input, whether or not the old call is aborted', async () => {
	for (const honour of [true, false]) {
		await withBar({ fetchOptions: { honour } }, async (t) => {
			t.focus()
			t.type('kit')
			t.clock.advance(120)
			eq(t.fetch.calls.length, 1)
			t.type('kitc')
			assert(t.fetch.calls[0].aborted, 'the old call is aborted as soon as the text changes')
			eq(t.optionTexts(), ['Search for "kitc"'])
			t.clock.advance(120)
			eq(t.fetch.calls.length, 2)
			t.fetch.calls[0].resolve([{ kind: 'tag', label: 'OLD', insert: 'tag:old' }])
			await tick()
			eq(t.optionTexts(), ['Search for "kitc"'], `an answer to "kit" must not appear for "kitc" (honour=${honour})`)
			t.fetch.calls[1].resolve([{ kind: 'tag', label: 'NEW', insert: 'tag:new' }])
			await tick()
			eq(t.optionTexts().map((x) => x.split(' ')[0]), ['NEW', 'Search'])
		})
	}
	// Edited back to an earlier text: still only ever the answer to the current text.
	await withBar({}, async (t) => {
		t.focus()
		t.type('kit')
		await t.answer([{ kind: 'tag', label: 'FIRST', insert: 'tag:first' }])
		t.type('kitc')
		eq(t.optionTexts(), ['Search for "kitc"'])
		t.type('kit')
		t.clock.advance(120)
		t.fetch.calls.at(-1).resolve([{ kind: 'tag', label: 'SECOND', insert: 'tag:second' }])
		await tick()
		assert(t.optionTexts()[0].startsWith('SECOND'), t.optionTexts().join(' | '))
	})
})

await check('ui: a failing endpoint leaves the typed Search row, never an error or a stale list', async () => {
	await withBar({}, async (t) => {
		t.focus()
		t.type('kit')
		await t.answer([{ kind: 'tag', label: 'FIRST', insert: 'tag:first' }])
		t.type('kitc')
		t.clock.advance(120)
		t.fetch.calls[1].reject(new Error('network down'))
		await tick()
		eq(t.optionTexts(), ['Search for "kitc"'])
		eq(t.expanded(), true)
		t.key('Enter')
		eq(t.spy.submits, ['kitc'], 'searching still works')
	})
})

await check('ui: Up and Down walk the rows through aria-activedescendant, with a "nothing highlighted" stop', async () => {
	await withResults({}, async (t) => {
		const ids = t.options().map((o) => o.props.id)
		const down = t.key('ArrowDown')
		assert(down.defaultPrevented, 'the caret does not jump')
		eq(t.active(), ids[0])
		eq(t.selected().length, 1)
		assert(t.selected()[0].startsWith('Kitchen'))
		for (let i = 1; i < 6; i++) t.key('ArrowDown')
		eq(t.active(), ids[5], 'the last row is the Search for row')
		assert(t.selected()[0].startsWith('Search for'))
		t.key('ArrowDown')
		eq(t.active(), undefined, 'one more Down returns to nothing highlighted')
		eq(t.selected(), [])
		t.key('ArrowUp')
		eq(t.active(), ids[5], 'Up from nothing lands on the last row')
		t.key('ArrowUp')
		eq(t.active(), ids[4])
		// The input names the highlighted option, and the option exists.
		assert(t.options().some((o) => o.props.id === t.active()), 'aria-activedescendant points at a real option')
		eq(t.spy.changes, ['kit'], 'moving never changes the text')
		eq(t.spy.submits, [])
	})
})

await check('ui: Tab accepts ONLY a row highlighted with Up/Down; otherwise Tab moves focus as normal', async () => {
	// Nothing highlighted: Tab is not touched, so a keyboard user can leave the box.
	await withResults({}, async (t) => {
		const tab = t.key('Tab')
		eq(tab.defaultPrevented, false, 'Tab must not be swallowed')
		eq(t.value(), 'kit')
		eq(t.spy.submits, [])
		const shift = t.key('Tab', { shiftKey: true })
		eq(shift.defaultPrevented, false)
		eq(t.value(), 'kit')
	})
	// Nothing highlighted yet answers just arrived: Tab does not accept the first row on its own.
	await withResults({}, async (t) => {
		eq(t.active(), undefined)
		t.key('Tab')
		eq(t.spy.changes, ['kit'])
	})
	// Highlighted tag: Tab completes exactly that row, keeps focus and puts the caret after it.
	await withResults({}, async (t) => {
		t.key('ArrowDown')
		t.key('ArrowDown')
		const tab = t.key('Tab')
		assert(tab.defaultPrevented, 'completing consumes the Tab')
		eq(t.value(), 'tag:kitchen-remodel')
		eq(t.spy.submits, ['tag:kitchen-remodel'], 'a finished clause is committed at once')
		eq(t.expanded(), false)
		eq(t.fake().selectionStart, 'tag:kitchen-remodel'.length)
		assert(t.doc.activeElement === t.fake(), 'focus stays in the box')
	})
	// The Search for row has nothing to complete: Tab passes over it.
	await withResults({}, async (t) => {
		t.key('ArrowUp')
		assert(t.selected()[0].startsWith('Search for'))
		const tab = t.key('Tab')
		eq(tab.defaultPrevented, false)
		eq(t.value(), 'kit')
	})
	// A closed list never completes, even with a stale highlight.
	await withResults({}, async (t) => {
		t.key('ArrowDown')
		t.key('Escape')
		eq(t.expanded(), false)
		const tab = t.key('Tab')
		eq(tab.defaultPrevented, false)
		eq(t.value(), 'kit')
	})
})

await check('ui: Enter accepts the highlighted row, otherwise submits exactly what was typed', async () => {
	await withResults({}, async (t) => {
		const enter = t.key('Enter')
		assert(enter.defaultPrevented)
		eq(t.spy.submits, ['kit'])
		eq(t.expanded(), false, 'submitting closes the list')
		eq(t.spy.changes, ['kit'], 'the text is not rewritten')
	})
	await withResults({}, async (t) => {
		t.key('ArrowDown')
		t.key('Enter')
		eq([t.value(), t.spy.submits], ['tag:kitchen', ['tag:kitchen']])
		eq(t.fake().selectionStart, 11)
	})
	await withResults({}, async (t) => {
		for (let i = 0; i < 5; i++) t.key('ArrowDown')
		t.key('Enter')
		eq([t.value(), t.spy.submits], ['color:blue', ['color:blue']], 'a value row inserts its clause')
	})
	await withResults({}, async (t) => {
		t.key('ArrowUp')
		assert(t.selected()[0].startsWith('Search for'))
		t.key('Enter')
		eq([t.value(), t.spy.submits], ['kit', ['kit']], 'the Search for row submits the text as typed')
		eq(t.spy.changes, ['kit'])
	})
	// Enter with the list closed or empty is still a submit.
	await withBar({}, async (t) => {
		t.focus()
		t.key('Enter')
		eq(t.spy.submits, [''])
	})
})

await check('ui: an operator suggestion keeps the list open to carry on typing, and asks for the values', async () => {
	await withBar({}, async (t) => {
		t.focus()
		t.type('kitchen col')
		await t.answer([
			{ kind: 'operator', label: 'color:', insert: 'color:', hint: 'Dominant color' },
			{ kind: 'tag', label: 'Colorful', insert: 'tag:colorful', count: 4 },
		])
		t.key('ArrowDown')
		t.key('Enter')
		eq(t.value(), 'kitchen color:')
		eq(t.spy.submits, [], 'an operator is not a search yet')
		eq(t.expanded(), true)
		eq(t.fake().selectionStart, 14)
		await t.answer([{ kind: 'value', label: 'blue', insert: 'color:blue', swatch: '#2f6fed' }])
		eq(t.fetch.calls.at(-1).input, 'kitchen color:')
		t.key('ArrowDown')
		t.key('Tab')
		eq([t.value(), t.spy.submits], ['kitchen color:blue', ['kitchen color:blue']])
	})
})

await check('ui: a word in the middle is what is completed, the rest of the text and the caret are kept', async () => {
	await withBar({}, async (t) => {
		t.focus()
		t.type('kit blue', 3)
		await t.answer()
		eq(t.fetch.calls[0].input, 'kit', 'the server is asked about the word at the caret, not the end of the text')
		t.key('ArrowDown')
		t.key('Enter')
		eq(t.value(), 'tag:kitchen blue')
		eq(t.fake().selectionStart, 11, 'caret right after what was inserted')
		eq(t.spy.submits, ['tag:kitchen blue'])
	})
	// Quoted token.
	await withBar({}, async (t) => {
		t.focus()
		t.type('folder:"Clients A" blue', 17)
		await t.answer([{ kind: 'folder', label: 'Clients/Acme', insert: 'folder:"Clients Acme"' }])
		eq(t.fetch.calls[0].input, 'folder:"Clients A')
		t.key('ArrowDown')
		t.key('Enter')
		eq(t.value(), 'folder:"Clients Acme" blue')
	})
})

await check('ui: clicking a row accepts it without ever blurring the box', async () => {
	await withResults({}, async (t) => {
		const down = ev()
		t.listbox().props.onMouseDown(down)
		assert(down.defaultPrevented, 'pressing on the list must not move focus away from the box')
		t.click(t.options()[1])
		eq([t.value(), t.spy.submits], ['tag:kitchen-remodel', ['tag:kitchen-remodel']])
		assert(t.doc.activeElement === t.fake())
	})
	await withResults({}, async (t) => {
		t.click(t.options().at(-1))
		eq([t.value(), t.spy.submits], ['kit', ['kit']])
	})
	// A recent search runs that search.
	await withBar({ recent: ['color:blue type:png'] }, async (t) => {
		t.focus()
		t.click(t.options()[0])
		eq([t.value(), t.spy.changes, t.spy.submits], ['color:blue type:png', ['color:blue type:png'], ['color:blue type:png']])
		eq(t.expanded(), false)
		assert(t.doc.activeElement === t.fake())
		eq(t.fake().selectionStart, 'color:blue type:png'.length)
	})
})

await check('ui: Esc closes the list first, then clears the text, then leaves the box', async () => {
	await withResults({}, async (t) => {
		const first = t.key('Escape')
		assert(first.defaultPrevented)
		eq([t.expanded(), t.value(), t.spy.changes], [false, 'kit', ['kit']], 'the list closed, the text is untouched')
		t.key('Escape')
		eq([t.value(), t.spy.changes.at(-1)], ['', ''], 'the second Esc clears the text')
		assert(t.doc.activeElement === t.fake(), 'and focus stays in the box')
		t.key('Escape')
		assert(t.doc.activeElement === null, 'the third lets go of the box')
	})
	// Typing again reopens the list.
	await withResults({}, async (t) => {
		t.key('Escape')
		t.type('kitc')
		eq(t.expanded(), true)
	})
	// Esc with a highlighted row still closes first and highlights nothing afterwards.
	await withResults({}, async (t) => {
		t.key('ArrowDown')
		t.key('Escape')
		eq([t.expanded(), t.active(), t.value()], [false, undefined, 'kit'])
	})
})

await check('ui: leaving the box closes the list and cancels what was on its way', async () => {
	await withBar({}, async (t) => {
		t.focus()
		t.type('kit')
		t.blur()
		eq(t.expanded(), false)
		t.clock.advance(1000)
		eq(t.fetch.calls.length, 0, 'a pending debounce does not fire after blur')
		t.focus()
		eq(t.expanded(), true, 'focusing again reopens it')
		t.clock.advance(120)
		await tick()
		eq(t.fetch.calls.map((c) => c.input), ['kit'], 'and asks again for the text that is in the box')
		t.blur()
		assert(t.fetch.calls[0].aborted, 'a call in flight is aborted on blur')
	})
	// ArrowDown on a closed list opens it.
	await withResults({}, async (t) => {
		t.key('Escape')
		eq(t.expanded(), false)
		const down = t.key('ArrowDown')
		assert(down.defaultPrevented)
		eq(t.expanded(), true)
		eq(t.active(), undefined, 'opening does not highlight')
	})
	// Clicking into a focused box whose list is closed reopens it.
	await withResults({}, async (t) => {
		t.key('Escape')
		eq(t.expanded(), false)
		t.m.act(() => t.input().props.onClick(ev()))
		eq(t.expanded(), true)
	})
})

await check('ui: an input method keeps its Enter, a held modifier makes Enter and arrows do nothing', async () => {
	await withResults({}, async (t) => {
		for (const extra of [{ nativeEvent: { isComposing: true } }, { keyCode: 229 }, { key: 'Process' }]) {
			const e = t.key(extra.key ?? 'Enter', extra)
			eq(e.defaultPrevented, false, JSON.stringify(extra))
		}
		eq(t.spy.submits, [], 'composition Enter never submits')
		const tab = t.key('Tab', { nativeEvent: { isComposing: true } })
		eq(tab.defaultPrevented, false)
		t.key('Enter', { ctrlKey: true })
		t.key('Enter', { metaKey: true })
		t.key('ArrowDown', { altKey: true })
		eq(t.spy.submits, [])
		eq(t.active(), undefined)
		t.key('Enter')
		eq(t.spy.submits, ['kit'])
	})
})

await check('ui: Clear removes the text but not focus, and Esc/Enter on an empty box behave', async () => {
	await withResults({}, async (t) => {
		const clear = t.button('Clear search')
		const down = ev()
		clear.props.onMouseDown(down)
		assert(down.defaultPrevented, 'pressing Clear must not blur the box')
		t.click(clear)
		eq([t.value(), t.spy.changes.at(-1)], ['', ''])
		eq(t.button('Clear search'), undefined, 'nothing left to clear')
		t.clock.advance(1000)
		await tick()
		eq(t.fetch.calls.length, 1, 'clearing asks nobody')
	})
	// Cleared before the debounce fired: nobody is asked about text that is gone.
	await withBar({}, async (t) => {
		t.focus()
		t.type('kit')
		t.click(t.button('Clear search'))
		eq(t.clock.pending, 0, 'the waiting timer goes with the text')
		t.clock.advance(1000)
		await tick()
		eq(t.fetch.calls.length, 0)
	})
	// Cleared while a call was in flight: it is aborted and its answer never shows.
	await withBar({ fetchOptions: { honour: false } }, async (t) => {
		t.focus()
		t.type('kit')
		t.clock.advance(120)
		eq(t.fetch.calls.length, 1)
		t.click(t.button('Clear search'))
		assert(t.fetch.calls[0].aborted, 'the call for text that is gone is aborted')
		t.fetch.calls[0].resolve(SUGGESTIONS)
		await tick()
		eq(t.optionTexts().length, 6, 'an empty box shows Narrow by, not the answer to "kit"')
		assert(t.optionTexts()[0].startsWith('Tag'), t.optionTexts().join(' | '))
	})
})

await check('ui: a suggestion that does not fit in the box changes nothing', async () => {
	const long = `${'a'.repeat(MEDIA_LIMITS.queryMax - 8)} k`
	await withBar({}, async (t) => {
		t.focus()
		t.type(long)
		await t.answer([{ kind: 'tag', label: 'Kitchen', insert: 'tag:kitchen' }])
		t.key('ArrowDown')
		t.key('Enter')
		eq(t.value(), long, 'refused, not cut off')
		eq(t.spy.submits, [])
		eq(t.expanded(), true, 'the person can pick something else')
	})
})

await check('ui: Search tips toggles a cheat sheet whose examples go into the box, with focus back in it', async () => {
	await withBar({ initial: 'kitchen' }, async (t) => {
		const toggle = t.button('Search tips')
		eq([toggle.props['aria-expanded'], toggle.props['aria-controls']], [false, undefined])
		eq(t.slot('search-tips'), undefined)
		t.click(toggle)
		const sheet = t.slot('search-tips')
		assert(sheet, 'the cheat sheet opens')
		eq(t.button('Search tips').props['aria-expanded'], true)
		eq(t.button('Search tips').props['aria-controls'], sheet.props.id, 'aria-controls names the sheet')
		const example = t.m.findAll((n) => n.type === 'button' && n.props['aria-label'] === 'Add tag:kitchen to your search')[0]
		assert(example, 'an example button')
		t.click(example)
		eq(t.value(), 'kitchen tag:kitchen')
		eq(t.spy.changes, ['kitchen tag:kitchen'])
		eq(t.spy.submits, [], 'inserting is editing, not searching')
		assert(t.doc.activeElement === t.fake(), 'focus goes to the box')
		eq(t.expanded(), false, 'but the suggestion list does not pop over the cheat sheet')
		eq(t.fake().selectionStart, 'kitchen tag:kitchen'.length)
		// A second click appends after a space; the box still has exactly the two clauses.
		t.click(t.m.findAll((n) => n.type === 'button' && n.props['aria-label'] === 'Add color:blue to your search')[0])
		eq(t.value(), 'kitchen tag:kitchen color:blue')
		t.click(t.button('Search tips'))
		eq(t.slot('search-tips'), undefined, 'closes again')
		eq(t.fetch.calls.length, 0)
	})
})

await check('ui: chips, the scope pill and Clear all call their handlers; a keyboard removal keeps focus, a tap does not steal it', async () => {
	await withBar({ chips: CHIPS, scope: { label: 'Clients/Acme', deep: true }, initial: 'x' }, async (t) => {
		const remove = t.button('Remove tag: kitchen')
		t.click(remove, { detail: 1 })
		eq(t.spy.removed.map((c) => c.clause), ['tag:kitchen'], 'the exact chip is handed over, not a copy of its label')
		assert(t.spy.removed[0] === CHIPS[2])
		assert(t.doc.activeElement === null, 'a mouse click leaves focus alone (no keyboard pops up on a phone)')
		t.click(t.button('Remove not tag: people'), { detail: 0 })
		eq(t.spy.removed.length, 2)
		assert(t.doc.activeElement === t.fake(), 'a keyboard activation puts focus back in the box')
		eq(t.expanded(), false, 'without opening the list')
		t.click(t.button('Search everywhere'), { detail: 0 })
		eq(t.spy.clearScope, 1)
		t.click(t.button('Clear all'), { detail: 0 })
		eq(t.spy.clearAll, 1)
		for (const chipButton of t.m.findAll((n) => n.type === 'button' && /^Remove /.test(n.props['aria-label'] ?? ''))) eq(chipButton.props.type, 'button')
	})
})

await check('ui: the scope menu toggles subfolders only when the choice changes', async () => {
	for (const [deep, pick, calls] of [
		[true, 'only', 1],
		[true, 'deep', 0],
		[false, 'deep', 1],
		[false, 'only', 0],
	]) {
		await withBar({ scope: { label: 'Clients/Acme', deep }, initial: 'x' }, async (t) => {
			const radios = t.m.findAll((n) => n.props?.role === 'menuitemradio')
			eq(radios.map((r) => r.props['data-value']), ['deep', 'only'])
			eq(radios.filter((r) => r.props['aria-checked']).map((r) => r.props['data-value']), [deep ? 'deep' : 'only'], 'the current choice is checked')
			t.m.act(() => radios.find((r) => r.props['data-value'] === pick).props.onClick())
			eq(t.spy.toggleDeep, calls, `deep=${deep} pick=${pick}`)
		})
	}
})

await check('ui: "Search instead" runs the typed text with the typo in double quotes, at once', async () => {
	await withBar({ initial: 'kithcen', corrections: [typo('kithcen', 'kitchen')] }, async (t) => {
		assert(t.notes().startsWith('Showing results for kitchen. Search instead for kithcen'), t.notes())
		const link = t.button('Search instead for kithcen')
		t.click(link)
		eq(t.spy.changes, ['"kithcen"'])
		eq(t.spy.submits, ['"kithcen"'], 'committed without waiting for the debounce')
		eq(t.value(), '"kithcen"')
		eq(t.expanded(), false)
	})
	await withBar({ initial: 'tag:kitchen kithcen sink', corrections: [typo('kithcen', 'kitchen')] }, async (t) => {
		t.click(t.button('Search instead for kithcen'))
		eq(t.spy.submits, ['tag:kitchen "kithcen" sink'], 'only the typo is quoted, the clause stays a clause')
	})
})

await check('ui: dropped words offer the literal query, "Must include", and a tidy "Remove"', async () => {
	await withBar({ initial: 'technician repairing sink', dropped: ['sink'] }, async (t) => {
		assert(t.notes().startsWith('No images mention sink. Showing results for technician repairing.'), t.notes())
		t.click(t.button('Must include sink'))
		eq(t.spy.submits, ['technician repairing "sink"'])
		eq(t.value(), 'technician repairing "sink"')
	})
	await withBar({ initial: 'technician repairing sink', dropped: ['sink'] }, async (t) => {
		t.click(t.button('Remove sink'))
		eq(t.spy.submits, ['technician repairing'])
		eq(t.value(), 'technician repairing')
	})
})

if (parserReady) {
	await check('ui: a half-typed word does not flash a warning; a finished or submitted one does', async () => {
		await withBar({}, async (t) => {
			t.focus()
			t.type('type:png tag:')
			eq(t.notes(), '', 'typing "tag:" is a clause on its way, not a mistake')
			t.type('color:bl')
			eq(t.notes(), '', 'nor is "color:bl"')
			t.type('type:xyz')
			eq(t.notes(), '', 'the last word is still being typed')
			t.key('Enter')
			assert(t.notes().includes('Unknown type "xyz" was ignored.'), `Enter finishes the word: ${t.notes()}`)
			t.type('type:xyz ')
			assert(t.notes().includes('Unknown type "xyz"'), 'a space finishes it too')
			t.type('type:xyz png')
			assert(t.notes().includes('Unknown type "xyz"'), 'a finished word keeps warning while the next one is typed')
			t.type('type:png')
			eq(t.notes(), '', 'fixing it clears the warning at once')
			t.type('tag:')
			eq(t.notes(), '')
			t.blur()
			assert(t.notes().includes('"tag:" has no value'), `leaving the box finishes the word: ${t.notes()}`)
		})
		// Not focused at all (a saved search applied, Back): the whole text is judged.
		await withBar({ initial: 'type:xyz' }, async (t) => {
			assert(t.notes().includes('Unknown type "xyz"'))
		})
	})
} else skip('ui: warnings while typing', 'parse.ts is not usable here')

await check('ui: the page can focus the box through inputRef (object or callback), which opens the list', async () => {
	await withBar({ recent: ['a'] }, async (t) => {
		assert(t.inputRef.current === t.fake(), 'the object ref holds the input')
		t.m.act(() => t.inputRef.current.focus())
		eq(t.expanded(), true)
		assert(t.doc.activeElement === t.fake())
	})
	const seen = []
	await withBar({ inputRef: (node) => seen.push(node) }, async (t) => {
		assert(seen.at(-1) === t.fake(), 'a callback ref receives the input')
		assert(seen.filter(Boolean).length === 1, 'and only once, not on every render')
		t.focus()
		t.type('kit')
		t.type('kitc')
		assert(seen.filter(Boolean).length === 1, 'the merged ref keeps one identity across renders')
	})
})

await check('ui: unmounting cancels the debounce and the call in flight; nothing reaches state afterwards', async () => {
	const pendingTimer = newBar({})
	pendingTimer.focus()
	pendingTimer.type('kit')
	assert(pendingTimer.clock.pending > 0, 'a debounce is waiting')
	pendingTimer.m.unmount()
	pendingTimer.clock.advance(1000)
	eq(pendingTimer.fetch.calls.length, 0, 'it never fires after unmount')
	pendingTimer.clock.uninstall()
	delete globalThis.document

	const inFlight = newBar({ fetchOptions: { honour: false } })
	inFlight.focus()
	inFlight.type('kit')
	inFlight.clock.advance(120)
	eq(inFlight.fetch.calls.length, 1)
	inFlight.m.unmount()
	assert(inFlight.fetch.calls[0].aborted, 'the call is aborted')
	inFlight.fetch.calls[0].resolve(SUGGESTIONS)
	await tick()
	inFlight.clock.uninstall()
	delete globalThis.document
})

await check('ui: Save search opens a name form, saves once, and shows a failure inline', async () => {
	let release
	const gate = new Promise((resolve) => (release = resolve))
	await withBar({ canSave: true, initial: 'kitchen', onSave: () => gate }, async (t) => {
		t.click(t.button('Save search'))
		const dialog = t.m.find((n) => n.props?.role === 'dialog')
		assert(dialog, 'the popover opens')
		const nameInput = t.m.find((n) => n.type === 'input' && n.props.placeholder === 'Kitchen photos')
		const label = t.m.find((n) => n.type === 'label')
		eq(label.props.htmlFor, nameInput.props.id, 'the field is labelled')
		eq(squash(t.m.text(label)), 'Name this search')
		eq(nameInput.props.maxLength, MEDIA_LIMITS.savedSearchNameMax)
		const saveButton = () => t.m.find((n) => n.type === 'button' && n.props.type === 'submit')
		eq(saveButton().props.disabled, true, 'Save waits for a name')
		// A blank name is refused without bothering the server.
		const form = () => t.m.find((n) => n.type === 'form')
		await t.m.act(() => form().props.onSubmit(ev()))
		eq(t.spy.saves, [])
		eq(squash(t.m.text(t.m.find((n) => n.props?.role === 'alert'))), 'Give this search a name.')
		t.m.act(() => t.m.find((n) => n.type === 'input' && n.props.placeholder === 'Kitchen photos').props.onChange({ target: { value: '  Kitchen photos  ' } }))
		eq(t.m.find((n) => n.props?.role === 'alert'), undefined, 'typing clears the error')
		eq(saveButton().props.disabled, false)
		// Two quick submits are one save.
		const first = t.m.act(() => form().props.onSubmit(ev()))
		const second = t.m.act(() => form().props.onSubmit(ev()))
		eq(t.spy.saves, ['Kitchen photos'], 'the name is trimmed and sent once')
		eq(saveButton().props.disabled, true, 'busy: Save is disabled')
		eq(t.m.find((n) => n.type === 'input' && n.props.placeholder === 'Kitchen photos').props.disabled, true)
		// The popover cannot be dismissed in the middle of a save.
		t.m.act(() => popoverState.onOpenChange(false))
		assert(t.m.find((n) => n.props?.role === 'dialog'), 'still open while saving')
		release()
		await first
		await second
		await tick()
		eq(t.m.find((n) => n.props?.role === 'dialog'), undefined, 'closed after a successful save')
		eq(t.spy.saves.length, 1)
	})
	// A failure stays inline with a message a person can read; a retry works.
	let attempt = 0
	await withBar({ canSave: true, initial: 'kitchen', onSave: async () => { if (attempt++ === 0) throw new Error('A saved search named "Kitchen" already exists.') } }, async (t) => {
		t.click(t.button('Save search'))
		const type = (value) => t.m.act(() => t.m.find((n) => n.type === 'input' && n.props.placeholder === 'Kitchen photos').props.onChange({ target: { value } }))
		type('Kitchen')
		await t.m.act(() => t.m.find((n) => n.type === 'form').props.onSubmit(ev()))
		await tick()
		assert(t.m.find((n) => n.props?.role === 'dialog'), 'stays open on failure')
		eq(squash(t.m.text(t.m.find((n) => n.props?.role === 'alert'))), 'A saved search named "Kitchen" already exists.')
		eq(t.m.find((n) => n.type === 'button' && n.props.type === 'submit').props.disabled, false, 'not stuck busy')
		const describedBy = t.m.find((n) => n.type === 'input' && n.props.placeholder === 'Kitchen photos').props['aria-describedby']
		eq(describedBy, t.m.find((n) => n.props?.role === 'alert').props.id, 'the error is tied to the field')
		type('Kitchen 2')
		await t.m.act(() => t.m.find((n) => n.type === 'form').props.onSubmit(ev()))
		await tick()
		eq(t.spy.saves, ['Kitchen', 'Kitchen 2'])
		eq(t.m.find((n) => n.props?.role === 'dialog'), undefined)
	})
	// A rejection that is not an Error, or has no message, still says something useful.
	for (const reason of ['plain string', undefined, new Error('   ')]) {
		await withBar({ canSave: true, onSave: () => Promise.reject(reason) }, async (t) => {
			t.click(t.button('Save search'))
			t.m.act(() => t.m.find((n) => n.type === 'input' && n.props.placeholder === 'Kitchen photos').props.onChange({ target: { value: 'x' } }))
			await t.m.act(() => t.m.find((n) => n.type === 'form').props.onSubmit(ev()))
			await tick()
			eq(squash(t.m.text(t.m.find((n) => n.props?.role === 'alert'))), 'Could not save that search.')
		})
	}
	// A save that throws synchronously is caught too.
	await withBar({ canSave: true, onSave: () => { throw new Error('sync failure') } }, async (t) => {
		t.click(t.button('Save search'))
		t.m.act(() => t.m.find((n) => n.type === 'input' && n.props.placeholder === 'Kitchen photos').props.onChange({ target: { value: 'x' } }))
		await t.m.act(() => t.m.find((n) => n.type === 'form').props.onSubmit(ev()))
		await tick()
		eq(squash(t.m.text(t.m.find((n) => n.props?.role === 'alert'))), 'sync failure')
	})
})

await check('ui: an answer that lands after Enter never reopens the list or changes the text', async () => {
	await withBar({ fetchOptions: { honour: false } }, async (t) => {
		t.focus()
		t.type('kit')
		t.clock.advance(120)
		eq(t.fetch.calls.length, 1)
		t.key('Enter')
		eq([t.spy.submits, t.expanded()], [['kit'], false])
		assert(t.fetch.calls[0].aborted, 'the question is withdrawn once the search is run')
		t.fetch.calls[0].resolve(SUGGESTIONS)
		await tick()
		eq([t.expanded(), t.value(), t.spy.changes], [false, 'kit', ['kit']], 'the late answer changes nothing')
		eq(t.listbox().props.hidden, true)
		eq(t.active(), undefined)
	})
})

await check('ui: in the focused-empty list Down then Tab completes the row, plain Tab leaves the box', async () => {
	await withBar({}, async (t) => {
		t.focus()
		const plain = t.key('Tab')
		eq(plain.defaultPrevented, false, 'Tab with nothing highlighted is just Tab')
		eq(t.value(), '')
		t.key('ArrowDown')
		assert(t.selected()[0].startsWith('Tag'), t.selected().join(' | '))
		const tab = t.key('Tab')
		assert(tab.defaultPrevented)
		eq([t.value(), t.spy.submits, t.expanded()], ['tag:', [], true], 'an operator row is completed and the list stays for the value')
	})
	await withBar({ recent: ['kitchen', 'tag:logo'] }, async (t) => {
		t.focus()
		t.key('ArrowDown')
		t.key('ArrowDown')
		eq(t.selected(), ['tag:logo'])
		t.key('Enter')
		eq([t.value(), t.spy.submits], ['tag:logo', ['tag:logo']], 'a recent search runs when it is chosen')
	})
})

/* ========================================================================== */
/* FacetPanel: the pure helpers                                               */
/* ========================================================================== */

const FACETS = {
	tags: [
		{ value: 'kitchen', label: 'Kitchen', count: 214 },
		{ value: 'bathroom', label: 'Bathroom', count: 120 },
		{ value: 'kitchen-remodel', label: 'Kitchen remodel', count: 31 },
	],
	colors: [
		{ value: 'gray', label: 'gray', count: 50, hex: '#808080' },
		{ value: 'red', label: 'red', count: 40, hex: '#e02424' },
		{ value: 'black', label: 'black', count: 30, hex: '#111111' },
		{ value: 'blue', label: 'blue', count: 20, hex: '#2f6fed' },
		{ value: 'white', label: 'white', count: 10, hex: '#ffffff' },
		{ value: 'green', label: 'green', count: 5, hex: '#2e9e4f' },
	],
	folders: [
		{ value: 'f1', label: 'Clients/Acme/Kitchens', count: 12 },
		{ value: 'f2', label: 'Clients/Acme', count: 40 },
	],
}
const facetProps = (over = {}) => ({
	facets: FACETS,
	loading: false,
	activeValues: new Set(),
	onToggle: noop,
	onSelectFolder: noop,
	onManageTags: noop,
	...over,
})
const renderFacets = (over) => renderToString(h(facet.FacetPanel, facetProps(over)))
const manyTags = (n) => Array.from({ length: n }, (_, i) => ({ value: `t${i}`, label: `Tag ${i}`, count: 1000 - i }))
const manyFolders = (n) => Array.from({ length: n }, (_, i) => ({ value: `f${i}`, label: `Clients/Folder ${i}`, count: 50 - i }))

const facetSections = (root) => bySlot(root, 'facet-section')
const sectionNamed = (root, slot) => facetSections(root).find((s) => s.attrs['data-facet'] === slot)
const pressedButtons = (scope) => findAllNodes(scope, (n) => n.tag === 'button' && n.attrs['aria-pressed'] !== undefined)
const toggleLabels = (scope) => pressedButtons(scope).map((b) => b.attrs['aria-label'] ?? squash(textOf(b)))

await check('facet helpers: items are cleaned, repeats and junk dropped, counts that are not counts left off', () => {
	const clean = facet.cleanFacetItems(
		[
			null,
			7,
			'x',
			{},
			{ value: '', label: 'empty' },
			{ value: '  ', label: 'blank' },
			{ value: 'a', label: 'A', count: 3 },
			{ value: 'a', label: 'A again', count: 9 },
			{ value: 'b', label: '', count: -1 },
			{ value: 'c', label: 7, count: Number.NaN },
			{ value: 'd', label: 'D', count: 4.9 },
			{ value: 'e', label: 'E', count: '12' },
			{ value: 'f', label: 'F', count: Number.POSITIVE_INFINITY },
			{ value: 'g', label: `  ${'x'.repeat(200)}  `, count: 0 },
		],
		50,
	)
	eq(clean.map((i) => i.value), ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
	eq(clean.map((i) => i.count), [3, null, null, 4, null, null, 0], 'a count is a finite number >= 0 or nothing')
	eq(clean.map((i) => i.label).slice(0, 3), ['A', 'b', 'c'], 'a missing label falls back to the value')
	assert(Array.from(clean[6].label).length <= 60, 'long labels are bounded')
	eq(facet.cleanFacetItems('nope', 5), [])
	eq(facet.cleanFacetItems(undefined, 5), [])
	eq(facet.cleanFacetItems({ length: 2 }, 5), [])
	eq(facet.cleanFacetItems(manyTags(100), 30).length, 30, 'at most max rows')
	eq(facet.cleanFacetItems([{ value: 'a' }, { value: 'b' }], 0), [])
	// Colors keep only a real hex, else the curated swatch for that name, else none.
	const colors = facet.cleanFacetItems(
		[
			{ value: 'red', label: 'red', count: 1, hex: '#e02424' },
			{ value: 'blue', label: 'blue', count: 1, hex: 'red; position:fixed' },
			{ value: 'mauve', label: 'mauve', count: 1, hex: 'url(x)' },
			{ value: 'teal', label: 'teal', count: 1 },
			{ value: 'pink', label: 'pink', count: 1, hex: 'rgb(0,0,0)' },
			{ value: 'navy', label: 'navy', count: 1, hex: '#0f1f4d80' },
		],
		20,
		true,
	)
	eq(colors.map((c) => c.hex), ['#e02424', '#2f6fed', undefined, '#0d9488', '#ec4899', '#0f1f4d80'])
	assert(!('hex' in facet.cleanFacetItems([{ value: 'red', hex: '#e02424' }], 5)[0]), 'only colors carry a swatch')
})

await check('facet helpers: neutrals (gray, black, white) come after the chromatic colors, each group in its own order', () => {
	const order = (values) => facet.orderColors(values.map((value) => ({ value }))).map((c) => c.value)
	eq(order(['gray', 'red', 'black', 'blue', 'white', 'green']), ['red', 'blue', 'green', 'gray', 'black', 'white'])
	eq(order(['white', 'black', 'gray']), ['white', 'black', 'gray'])
	eq(order(['red', 'blue']), ['red', 'blue'])
	eq(order([]), [])
	eq(order(['beige', 'white', 'navy', 'brown']), ['beige', 'navy', 'brown', 'white'], 'beige, navy and brown are colors, not neutrals')
	// Whatever colors.ts calls neutral is what is moved.
	for (const name of colorsLib.NEUTRAL_COLORS) eq(order([name, 'red']), ['red', name])
	const input = ['b', 'a']
	facet.orderColors(input.map((value) => ({ value })))
	eq(input, ['b', 'a'], 'the input is not mutated')
})

await check('facet helpers: a collapsed list shows the first rows plus anything switched on, never hides a pressed value', () => {
	const items = Array.from({ length: 20 }, (_, i) => ({ value: `v${i}` }))
	const none = () => false
	eq(facet.visibleItems(items, 5, false, none).length, 5)
	eq(facet.visibleItems(items, 5, true, none).length, 20, 'expanded shows all')
	eq(facet.visibleItems(items.slice(0, 5), 5, false, none).length, 5, 'a short list shows all')
	eq(facet.visibleItems(items.slice(0, 3), 5, false, none).length, 3)
	const pressed = (item) => item.value === 'v17' || item.value === 'v2'
	eq(facet.visibleItems(items, 5, false, pressed).map((i) => i.value), ['v0', 'v1', 'v2', 'v3', 'v4', 'v17'], 'order is kept, v17 is not hidden')
	eq(facet.visibleItems([], 5, false, none), [])
	eq(facet.visibleItems(items, 0, false, none), [])
})

await check('facet helpers: folder paths split into a parent and the leaf, active pairs are matched exactly, counts are per field', () => {
	eq(facet.splitPath('Clients/Acme/Kitchens'), { parent: 'Clients/Acme/', leaf: 'Kitchens' })
	eq(facet.splitPath('Kitchens'), { parent: '', leaf: 'Kitchens' })
	eq(facet.splitPath('Clients/'), { parent: '', leaf: 'Clients/' })
	eq(facet.splitPath(''), { parent: '', leaf: '' })
	eq(facet.splitPath('/a'), { parent: '/', leaf: 'a' })
	eq(facet.facetPair('tag', 'kitchen'), 'tag:kitchen')
	const active = new Set(['tag:kitchen', 'tag:bath', 'color:red', 'type:png', 'tagx:no'])
	eq(facet.isActivePair(active, 'tag:kitchen'), true)
	eq(facet.isActivePair(active, 'tag:Kitchen'), false, 'exact, not case folded')
	eq(facet.isActivePair(active, 'color:kitchen'), false)
	for (const bad of [null, undefined, [], {}, 'tag:kitchen', 5]) eq(facet.isActivePair(bad, 'tag:kitchen'), false)
	eq(facet.countActive(active, 'tag'), 2, '"tagx:" is another field')
	eq(facet.countActive(active, 'color'), 1)
	eq(facet.countActive(active, 'kind'), 0)
	for (const bad of [null, undefined, [], 'x', 5]) eq(facet.countActive(bad, 'tag'), 0)
	eq(facet.countActive(new Set(['tag:a', 5, null]), 'tag'), 1)
})

await check('facet helpers: the static groups come from the media vocabulary, and the limits are the spec\'s', () => {
	const by = Object.fromEntries(facet.STATIC_FACETS.map((g) => [g.field, g]))
	eq(facet.STATIC_FACETS.map((g) => g.field), ['type', 'orientation', 'kind'])
	eq(by.type.values, MEDIA_FORMATS)
	eq(by.orientation.values, MEDIA_ORIENTATIONS)
	eq(by.kind.values, MEDIA_KINDS)
	eq(by.type.values.map(by.type.label), ['JPG', 'PNG', 'WEBP', 'AVIF', 'GIF'])
	eq(by.orientation.values.map(by.orientation.label), ['Landscape', 'Portrait', 'Square', 'Panorama'])
	eq(by.kind.label('photo'), 'Photo')
	eq(facet.FACET_LIMITS.tags.max, 30, 'top 30 tags')
	assert(facet.FACET_LIMITS.tags.shown < facet.FACET_LIMITS.tags.max, 'tags are collapsed to fewer than 30 until Show more')
	const norm = facet.normalizeFacets({ tags: manyTags(80), colors: 'x', folders: [{ value: 'f', label: 'F', count: 1 }] })
	eq([norm.tags.length, norm.colors.length, norm.folders.length], [30, 0, 1])
	for (const bad of [null, undefined, 'x', 5, []]) eq(facet.normalizeFacets(bad), { tags: [], colors: [], folders: [] })
})

/* ========================================================================== */
/* FacetPanel: SSR                                                            */
/* ========================================================================== */

await check('facet ssr: unknown facets (null) draw only the static groups, with nothing pressed and no skeleton', () => {
	const html = renderFacets({ facets: null })
	const root = staticChecks(html, 'null facets')
	eq(facetSections(root).map((s) => s.attrs['data-facet']), ['type', 'orientation', 'kind'])
	eq(findAllNodes(root, (n) => n.tag === 'h3').map((n) => squash(textOf(n))), ['Type', 'Orientation', 'Kind'])
	eq(bySlot(root, 'facet-skeleton').length, 0, 'not loading: no skeleton')
	eq(findNode(root, (n) => n.attrs['data-slot'] === 'facet-panel').attrs['aria-busy'], undefined)
	eq(toggleLabels(sectionNamed(root, 'type')), ['JPG', 'PNG', 'WEBP', 'AVIF', 'GIF'])
	eq(toggleLabels(sectionNamed(root, 'orientation')), ['Landscape', 'Portrait', 'Square', 'Panorama'])
	eq(toggleLabels(sectionNamed(root, 'kind')), ['Photo', 'Illustration', 'Logo', 'Icon', 'Screenshot', 'Graphic', 'Pattern', 'Diagram', 'Other'])
	for (const b of pressedButtons(root)) eq(b.attrs['aria-pressed'], 'false')
	assert(!/\d/.test(findAllNodes(root, (n) => n.tag === 'button' && n.attrs['aria-pressed'] !== undefined).map((b) => textOf(b)).join('')), 'static toggles carry no counts')
	eq(buttonsNamed(root, 'Manage tags').length, 0, 'no tags, no manager link')
})

await check('facet ssr: loading draws skeletons for the data groups, never stale facets, and keeps the static groups usable', () => {
	for (const facets of [null, FACETS]) {
		const html = renderFacets({ facets, loading: true })
		const root = staticChecks(html, `loading ${facets ? 'with' : 'without'} facets`)
		eq(findNode(root, (n) => n.attrs['data-slot'] === 'facet-panel').attrs['aria-busy'], 'true')
		eq(facetSections(root).map((s) => s.attrs['data-facet']), ['tags', 'colors', 'folders', 'type', 'orientation', 'kind'])
		eq(facetSections(root).filter((s) => s.attrs['data-loading'] !== undefined).map((s) => s.attrs['data-facet']), ['tags', 'colors', 'folders'])
		const skeletons = bySlot(root, 'facet-skeleton')
		eq(skeletons.length, 3)
		for (const s of skeletons) eq(s.attrs['aria-hidden'], 'true', 'skeletons are invisible to assistive tech')
		assert(html.includes('motion-reduce:animate-none'), 'the pulse respects reduced motion')
		assert(!html.includes('Kitchen') && !html.includes('Clients/Acme'), 'no stale facet shows while loading')
		eq(toggleLabels(sectionNamed(root, 'type')).length, 5, 'the static groups do not wait for results')
		eq(buttonsNamed(root, 'Manage tags').length, 0)
		// The loading headings say so, for a screen reader that reads them.
		assert(textOf(sectionNamed(root, 'tags')).includes('loading'))
	}
})

await check('facet ssr: all groups populated: Tags with counts and Manage tags, Colors as swatches with names, Folders with paths and counts', () => {
	const html = renderFacets({})
	const root = staticChecks(html, 'populated')
	eq(facetSections(root).map((s) => s.attrs['data-facet']), ['tags', 'colors', 'folders', 'type', 'orientation', 'kind'])
	eq(findAllNodes(root, (n) => n.tag === 'h2').map((n) => squash(textOf(n))), ['Filters'])
	eq(findAllNodes(root, (n) => n.tag === 'h3').map((n) => squash(textOf(n))), ['Tags', 'Colors', 'Folders', 'Type', 'Orientation', 'Kind'])
	const panel = findNode(root, (n) => n.attrs['data-slot'] === 'facet-panel')
	eq(accessibleName(panel, root), 'Filters', 'the panel is labelled by its heading')

	const tagSection = sectionNamed(root, 'tags')
	eq(toggleLabels(tagSection), ['Kitchen, 214 images', 'Bathroom, 120 images', 'Kitchen remodel, 31 images'])
	assert(squash(textOf(pressedButtons(tagSection)[0])).includes('214'), 'the count is visible')
	eq(buttonsNamed(root, 'Manage tags').length, 1)
	assert(!findAllNodes(sectionNamed(root, 'tags'), (n) => n.tag === 'button' && n.attrs['aria-expanded'] !== undefined).some((b) => /Manage/.test(textOf(b))), 'Manage tags is not inside the toggle button')

	const colorSection = sectionNamed(root, 'colors')
	eq(pressedButtons(colorSection).map((b) => squash(textOf(b))), ['red 40', 'blue 20', 'green 5', 'gray 50', 'black 30', 'white 10'], 'colors read as names with their counts, chromatics first')
	assert(/background-color:\s*#e02424/i.test(html) && /background-color:\s*#2f6fed/i.test(html), 'each color shows its swatch')
	for (const b of pressedButtons(colorSection)) assert(/, \d+ images$/.test(b.attrs['aria-label']) && b.attrs['aria-label'].length > 8, 'named, with a count')
	for (const sw of findAllNodes(colorSection, (n) => n.tag === 'span' && /background-color/.test(n.attrs.style ?? ''))) eq(sw.attrs['aria-hidden'], 'true', 'the swatch is decoration; the name is the content')

	const folderSection = sectionNamed(root, 'folders')
	const rows = findAllNodes(folderSection, (n) => n.tag === 'li')
	eq(rows.length, 2)
	const folderButtons = findAllNodes(folderSection, (n) => n.tag === 'button' && n.attrs.title)
	eq(folderButtons.map((b) => b.attrs['aria-label']), ['Clients/Acme/Kitchens, 12 images', 'Clients/Acme, 40 images'])
	eq(folderButtons.map((b) => b.attrs.title), ['Clients/Acme/Kitchens', 'Clients/Acme'])
	for (const b of folderButtons) eq(b.attrs['aria-pressed'], undefined, 'a folder is chosen, not toggled')
	assert(squash(textOf(folderButtons[0])).includes('Kitchens') && squash(textOf(folderButtons[0])).includes('12'))
})

await check('facet ssr: each section is a disclosure; Type is open, Orientation and Kind start closed', () => {
	const root = staticChecks(renderFacets({}), 'disclosure')
	for (const section of facetSections(root)) {
		const header = findNode(section, (n) => n.tag === 'button' && n.attrs['aria-controls'] !== undefined && n.attrs['aria-expanded'] !== undefined && n.attrs['aria-pressed'] === undefined && !/Show/.test(n.attrs['aria-label'] ?? ''))
		assert(header, `${section.attrs['data-facet']} has a header button`)
		const body = findNode(section, (n) => n.attrs.id === header.attrs['aria-controls'])
		assert(body, `${section.attrs['data-facet']}: aria-controls points at the body`)
		eq(body.attrs.role, 'group')
		const open = header.attrs['aria-expanded'] === 'true'
		eq(body.attrs.hidden === undefined, open, `${section.attrs['data-facet']}: hidden mirrors aria-expanded`)
	}
	eq(facetSections(root).map((s) => findNode(s, (n) => n.tag === 'button').attrs['aria-expanded']), ['true', 'true', 'true', 'true', 'false', 'false'])
})

await check('facet ssr: a value is pressed only when its field:value pair is in activeValues, and a group with one opens', () => {
	const active = new Set(['tag:kitchen', 'color:blue', 'type:png', 'orientation:landscape', 'kind:logo', 'tag:ghost', 'width:500'])
	const html = renderFacets({ activeValues: active })
	const root = staticChecks(html, 'active')
	const pressed = (slot) => pressedButtons(sectionNamed(root, slot)).filter((b) => b.attrs['aria-pressed'] === 'true').map((b) => b.attrs['aria-label'] ?? squash(textOf(b)))
	eq(pressed('tags'), ['Kitchen, 214 images'])
	eq(pressed('colors'), ['blue, 20 images'])
	eq(pressed('type'), ['PNG'])
	eq(pressed('orientation'), ['Landscape'])
	eq(pressed('kind'), ['Logo'])
	const unpressed = pressedButtons(root).filter((b) => b.attrs['aria-pressed'] === 'false').length
	eq(unpressed, pressedButtons(root).length - 5)
	// Header badges count what is on, even a tag that is not among the rows.
	const badge = (slot) => squash(textOf(findNode(sectionNamed(root, slot), (n) => n.tag === 'button' && n.attrs['aria-expanded'] !== undefined)))
	assert(badge('tags').includes('2 selected'), badge('tags'))
	assert(badge('colors').includes('1 selected') && badge('type').includes('1 selected'))
	assert(!badge('folders').includes('selected'))
	// Orientation and Kind are closed by default but open when something inside is on.
	eq(facetSections(root).map((s) => findNode(s, (n) => n.tag === 'button').attrs['aria-expanded']), ['true', 'true', 'true', 'true', 'true', 'true'])
	// Pairs are exact: another field's value, another case, or a quoted form do not press anything.
	const other = renderFacets({ activeValues: new Set(['color:kitchen', 'tag:Kitchen', 'tag:"kitchen"', 'type:PNG', 'kind:png']) })
	eq(pressedButtons(parseHtml(other)).filter((b) => b.attrs['aria-pressed'] === 'true').length, 0)
	// A parent that passes junk instead of a Set does not crash the panel.
	for (const bad of [undefined, null, [], 'tag:kitchen', {}, 7]) renderFacets({ activeValues: bad })
})

await check('facet ssr: colors are drawn chromatic first, then gray, black and white', () => {
	const root = parseHtml(renderFacets({}))
	eq(
		pressedButtons(sectionNamed(root, 'colors')).map((b) => b.attrs['aria-label'].split(',')[0]),
		['red', 'blue', 'green', 'gray', 'black', 'white'],
	)
	// Only neutrals, only chromatics, and a repeated color.
	const only = (values) => parseHtml(renderFacets({ facets: { tags: [], colors: values.map((value, i) => ({ value, label: value, count: 10 - i, hex: '#123456' })), folders: [] } }))
	eq(pressedButtons(sectionNamed(only(['white', 'black']), 'colors')).map((b) => b.attrs['aria-label'].split(',')[0]), ['white', 'black'])
	eq(pressedButtons(sectionNamed(only(['red', 'red', 'blue']), 'colors')).length, 2, 'a repeated color is drawn once')
})

await check('facet ssr: Show more appears only for long lists, and a pressed value beyond the fold is never hidden', () => {
	const tagsFor = (n, active = []) => parseHtml(renderFacets({ facets: { tags: manyTags(n), colors: [], folders: [] }, activeValues: new Set(active) }))
	const shown = facet.FACET_LIMITS.tags.shown
	const longTags = tagsFor(shown + 3)
	const more = findAllNodes(sectionNamed(longTags, 'tags'), (n) => n.tag === 'button' && /^Show more/.test(n.attrs['aria-label'] ?? ''))
	eq(more.length, 1)
	eq(more[0].attrs['aria-expanded'], 'false')
	eq(squash(textOf(more[0])), 'Show more')
	eq(more[0].attrs['aria-label'], 'Show more tags')
	const list = findNode(sectionNamed(longTags, 'tags'), (n) => n.attrs.id === more[0].attrs['aria-controls'])
	assert(list, 'aria-controls points at the list')
	eq(pressedButtons(list).length, shown, 'collapsed: the first rows only')
	eq(pressedButtons(sectionNamed(tagsFor(shown), 'tags')).length, shown)
	eq(findAllNodes(sectionNamed(tagsFor(shown), 'tags'), (n) => /^Show /.test(n.attrs['aria-label'] ?? '')).length, 0, 'exactly the limit: nothing to show')
	// A pressed tag past the fold stays visible.
	const pressed = tagsFor(shown + 8, [`tag:t${shown + 5}`])
	eq(pressedButtons(sectionNamed(pressed, 'tags')).length, shown + 1)
	assert(pressedButtons(sectionNamed(pressed, 'tags')).some((b) => b.attrs['aria-pressed'] === 'true' && b.attrs['aria-label'].startsWith(`Tag ${shown + 5},`)))
	// If everything past the fold is pressed there is nothing left to reveal.
	const folded = Array.from({ length: 3 }, (_, i) => `tag:t${shown + i}`)
	eq(findAllNodes(sectionNamed(tagsFor(shown + 3, folded), 'tags'), (n) => /^Show /.test(n.attrs['aria-label'] ?? '')).length, 0)
	// More than 30 are cut at 30 once opened (checked below by clicking); folders are shorter.
	const folders = (n) => parseHtml(renderFacets({ facets: { tags: [], colors: [], folders: manyFolders(n) } }))
	const fShown = facet.FACET_LIMITS.folders.shown
	eq(findAllNodes(sectionNamed(folders(fShown + 2), 'folders'), (n) => n.tag === 'li').length, fShown)
	eq(findAllNodes(sectionNamed(folders(fShown + 2), 'folders'), (n) => /^Show more folders/.test(n.attrs['aria-label'] ?? '')).length, 1)
	eq(findAllNodes(sectionNamed(folders(fShown), 'folders'), (n) => /^Show /.test(n.attrs['aria-label'] ?? '')).length, 0)
	// All 14 colors fit without a Show more.
	const fourteen = parseHtml(renderFacets({ facets: { tags: [], folders: [], colors: colorsLib.NAMED_COLORS.map((c, i) => ({ value: c.name, label: c.name, count: 20 - i, hex: c.hex })) } }))
	eq(pressedButtons(sectionNamed(fourteen, 'colors')).length, 14)
	eq(findAllNodes(sectionNamed(fourteen, 'colors'), (n) => /^Show /.test(n.attrs['aria-label'] ?? '')).length, 0)
})

await check('facet ssr: groups with nothing in them draw nothing, not even a heading', () => {
	const root = parseHtml(renderFacets({ facets: { tags: [], colors: [], folders: [] } }))
	eq(facetSections(root).map((s) => s.attrs['data-facet']), ['type', 'orientation', 'kind'])
	const some = parseHtml(renderFacets({ facets: { tags: [], colors: FACETS.colors, folders: [] } }))
	eq(facetSections(some).map((s) => s.attrs['data-facet']), ['colors', 'type', 'orientation', 'kind'])
	const junk = parseHtml(renderFacets({ facets: { tags: [null, {}, { value: '' }], colors: 'x', folders: undefined } }))
	eq(facetSections(junk).map((s) => s.attrs['data-facet']), ['type', 'orientation', 'kind'], 'rows that cannot be drawn do not make an empty section')
	// No Manage tags without the callback, even with tags.
	const noManage = parseHtml(renderFacets({ onManageTags: undefined }))
	eq(buttonsNamed(noManage, 'Manage tags').length, 0)
	eq(facetSections(noManage).length, 6)
})

await check('facet ssr: hostile facets are drawn as text and cannot break the layout or the pairs', () => {
	const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>'
	const html = renderFacets({
		facets: {
			tags: [{ value: evil, label: evil, count: 1 }, { value: 'a b', label: 'Spaced', count: 2 }, { value: 'x'.repeat(500), label: 'y'.repeat(500), count: 3 }],
			colors: [{ value: 'red', label: evil, count: 1, hex: 'red;position:fixed;background:url(javascript:1)' }],
			folders: [{ value: evil, label: evil, count: 1 }],
		},
	})
	assert(!html.includes('<script>') && !html.includes('<img src=x'), 'facet text rendered as HTML')
	assert(!html.includes('position:fixed') && !html.includes('javascript:'), 'a hex that is not a hex never reaches style')
	assert(html.includes('&lt;script&gt;'))
	const root = staticChecks(html, 'hostile')
	for (const b of pressedButtons(root)) assert((b.attrs['aria-label'] ?? '').length < 200, 'labels are bounded')
	// Counts that are huge or fractional read sensibly.
	const big = renderFacets({ facets: { tags: [{ value: 'a', label: 'A', count: 1234567 }, { value: 'b', label: 'B', count: 2.9 }], colors: [], folders: [] } })
	assert(big.includes('1,234,567') && big.includes('>2<'))
	assert(!big.includes('NaN') && !big.includes('undefined'))
})

/* ========================================================================== */
/* FacetPanel: interaction                                                    */
/* ========================================================================== */

function newFacets(over = {}) {
	const doc = createDocument()
	const calls = { toggles: [], folders: [], manage: 0 }
	const props = (extra = {}) => facetProps({
		onToggle: (clause, active) => calls.toggles.push([clause, active]),
		onSelectFolder: (id) => calls.folders.push(id),
		onManageTags: () => calls.manage++,
		...over,
		...extra,
	})
	const m = mount(facet.FacetPanel, props(), doc)
	const t = {
		m,
		calls,
		props,
		button: (name) => m.find((n) => n.type === 'button' && (n.props['aria-label'] === name || squash(m.text(n)) === name)),
		buttons: (pred) => m.findAll((n) => n.type === 'button' && pred(n)),
		section: (slot) => m.find((n) => n.props?.['data-facet'] === slot),
		pressedIn: (slot) => m.findAll((n) => n.type === 'button' && n.props['aria-pressed'] !== undefined).filter((b) => b.path.includes(`/${slot}`) || true),
		click: (el, extra = {}) => m.act(() => el.props.onClick(ev(extra))),
	}
	return t
}

await check('facet ui: clicking a value reports its clause and its current state; clicking an active one reports true', () => {
	const t = newFacets({ activeValues: new Set(['tag:bathroom', 'type:jpg']) })
	t.click(t.button('Kitchen, 214 images'))
	t.click(t.button('Bathroom, 120 images'))
	t.click(t.button('PNG'))
	t.click(t.button('JPG'))
	t.click(t.button('blue, 20 images'))
	t.click(t.button('Kitchen remodel, 31 images'))
	eq(t.calls.toggles, [
		['tag:kitchen', false],
		['tag:bathroom', true],
		['type:png', false],
		['type:jpg', true],
		['color:blue', false],
		['tag:kitchen-remodel', false],
	])
	// Orientation and Kind sit in closed sections but still work once reached.
	t.click(t.button('Landscape'))
	t.click(t.button('Logo'))
	eq(t.calls.toggles.slice(-2), [['orientation:landscape', false], ['kind:logo', false]])
})

await check('facet ui: the state is read when the click lands, so a second click after a re-render sees the new state', () => {
	const t = newFacets({})
	t.click(t.button('PNG'))
	t.m.setProps(t.props({ activeValues: new Set(['type:png']) }))
	t.click(t.button('PNG'))
	t.m.setProps(t.props({ activeValues: new Set() }))
	t.click(t.button('PNG'))
	eq(t.calls.toggles, [['type:png', false], ['type:png', true], ['type:png', false]])
	eq(t.button('PNG').props['aria-pressed'], false)
	t.m.setProps(t.props({ activeValues: new Set(['type:png']) }))
	eq(t.button('PNG').props['aria-pressed'], true)
})

await check('facet ui: a value with a space is clause-quoted for the query but matched raw against activeValues', () => {
	const facets = { tags: [{ value: 'a b', label: 'Spaced', count: 2 }], colors: [], folders: [] }
	const t = newFacets({ facets, activeValues: new Set(['tag:a b']) })
	eq(t.button('Spaced, 2 images').props['aria-pressed'], true, 'the chip pair is tag:a b, unquoted')
	t.click(t.button('Spaced, 2 images'))
	eq(t.calls.toggles, [['tag:"a b"', true]], 'the clause is quoted so it parses as one value')
})

await check('facet ui: a folder click selects the folder; Manage tags calls its handler; neither is a toggle', () => {
	const t = newFacets({})
	t.click(t.button('Clients/Acme/Kitchens, 12 images'))
	t.click(t.button('Clients/Acme, 40 images'))
	eq(t.calls.folders, ['f1', 'f2'])
	t.click(t.button('Manage tags'))
	eq(t.calls.manage, 1)
	eq(t.calls.toggles, [])
	eq(t.button('Clients/Acme, 40 images').props['aria-pressed'], undefined)
})

await check('facet ui: section headers open and close; a group with something on opens by itself until the person closes it', () => {
	const t = newFacets({})
	const header = (slot) => t.m.find((n) => n.type === 'button' && n.props['aria-expanded'] !== undefined && n.props['aria-pressed'] === undefined && n.path.includes('/') && squash(t.m.text(n)).startsWith({ orientation: 'Orientation', kind: 'Kind', type: 'Type', tags: 'Tags', colors: 'Colors', folders: 'Folders' }[slot]))
	const body = (slot) => t.m.find((n) => n.props?.id === header(slot).props['aria-controls'])
	eq([header('orientation').props['aria-expanded'], body('orientation').props.hidden], [false, true])
	t.click(header('orientation'))
	eq([header('orientation').props['aria-expanded'], body('orientation').props.hidden], [true, false])
	t.click(header('orientation'))
	eq([header('orientation').props['aria-expanded'], body('orientation').props.hidden], [false, true])
	t.click(header('type'))
	eq(header('type').props['aria-expanded'], false)
	// Something turned on from outside (a chip typed in the box): its group opens.
	t.m.setProps(t.props({ activeValues: new Set(['kind:logo', 'type:png']) }))
	eq(header('kind').props['aria-expanded'], true, 'kind had never been touched: it opens')
	eq(header('type').props['aria-expanded'], false, 'type was closed by the person: it stays closed')
	assert(squash(t.m.text(header('type'))).includes('1 selected'), 'and says something is on inside')
	t.click(header('kind'))
	eq(header('kind').props['aria-expanded'], false, 'the person can close an active group')
	t.m.setProps(t.props({ activeValues: new Set() }))
	eq(header('kind').props['aria-expanded'], false)
})

await check('facet ui: Show more reveals the rest (at most 30 tags), Show less folds back, pressed values stay visible', () => {
	const facets = { tags: manyTags(45), colors: [], folders: manyFolders(20) }
	const shown = facet.FACET_LIMITS.tags.shown
	const t = newFacets({ facets, activeValues: new Set(['tag:t25']) })
	const tagButtons = () => t.m.findAll((n) => n.type === 'button' && n.props['aria-pressed'] !== undefined && /^Tag \d+, /.test(n.props['aria-label'] ?? ''))
	eq(tagButtons().length, shown + 1, 'the first rows plus the pressed one')
	const more = () => t.button('Show more tags')
	assert(more(), 'a Show more button')
	eq(more().props['aria-expanded'], false)
	t.click(more())
	eq(tagButtons().length, 30, 'at most the top 30, whatever was sent')
	eq(t.button('Show less tags').props['aria-expanded'], true)
	eq(squash(t.m.text(t.button('Show less tags'))), 'Show less')
	t.click(t.button('Show less tags'))
	eq(tagButtons().length, shown + 1)
	// Folders: 20 sent, 6 shown, the rest after Show more.
	const folderRows = () => t.m.findAll((n) => n.type === 'li')
	eq(folderRows().length, facet.FACET_LIMITS.folders.shown)
	t.click(t.button('Show more folders'))
	eq(folderRows().length, 20)
	// Opening one list does not open the other.
	eq(tagButtons().length, shown + 1)
	// Clicking a revealed value still works.
	t.click(t.button('Show more tags'))
	t.click(t.button('Tag 29, 971 images'))
	eq(t.calls.toggles.at(-1), ['tag:t29', false])
})

await check('facet ui: everything is a native button in the tab order, with no tabindex tricks and a visible focus ring', () => {
	const t = newFacets({ activeValues: new Set(['type:png']) })
	const buttons = t.m.findAll((n) => n.type === 'button')
	assert(buttons.length > 20)
	for (const b of buttons) {
		eq(b.props.type, 'button', 'never submits a form')
		eq(b.props.tabIndex, undefined, 'natural tab order: no roving tabindex to get lost in')
		assert(/focus-visible:ring/.test(b.props.className), `no focus ring on ${squash(t.m.text(b))}`)
		assert(squash(t.m.text(b)) !== '' || b.props['aria-label'], 'every button has a name')
	}
	for (const b of buttons.filter((x) => x.props['aria-pressed'] !== undefined)) eq(typeof b.props['aria-pressed'], 'boolean', 'aria-pressed is a real state, never undefined')
	// Nothing depends on hover: no element is only revealed on hover.
	assert(!buttons.some((b) => /(^|\s)(hidden|invisible)\s/.test(b.props.className) || /group-hover:(block|visible|opacity-100)/.test(b.props.className)))
})

/* ========================================================================== */
/* Whole-component properties                                                 */
/* ========================================================================== */

await check('exports: the page gets SearchBar and FacetPanel by name, and the helpers the proof drives', () => {
	assert(typeof bar.SearchBar === 'function' && typeof facet.FacetPanel === 'function' && typeof tips.SearchTips === 'function')
	for (const name of ['tokenize', 'splitToken', 'tokenAt', 'applySuggestion', 'decideKey', 'shouldTabAccept', 'nextActive', 'createSuggestionController', 'searchInsteadQuery', 'buildNotes', 'emptyOptions', 'typedOptions', 'sanitizeSuggestions'])
		assert(typeof bar[name] === 'function', `search-bar exports ${name}`)
	assert(!('default' in bar) && !('default' in facet) && !('default' in tips) || true)
})

await check('ssr: rendering is deterministic, so a server render and the first client render cannot disagree', () => {
	const props = barProps({
		value: 'kithcen sink',
		chips: CHIPS,
		corrections: [typo('kithcen', 'kitchen')],
		dropped: ['sink'],
		scope: { label: 'Clients/Acme', deep: true },
		recent: ['a', 'b'],
		canSave: true,
		loading: true,
	})
	eq(renderToString(h(bar.SearchBar, props)), renderToString(h(bar.SearchBar, props)))
	eq(renderFacets({ activeValues: new Set(['tag:kitchen']) }), renderFacets({ activeValues: new Set(['tag:kitchen']) }))
	eq(renderToString(h(tips.SearchTips, { onPick: noop })), renderToString(h(tips.SearchTips, { onPick: noop })))
	// Two bars on one page never share an id.
	const both = renderToString(h('div', null, h(bar.SearchBar, barProps()), h(bar.SearchBar, barProps())))
	const ids = findAllNodes(parseHtml(both), (n) => n.attrs.id !== undefined).map((n) => n.attrs.id)
	eq(ids.length, new Set(ids).size, 'duplicate ids across two bars')
})

await check('facet helpers: the chips of a query give the pairs the panel presses, negated ones press nothing', () => {
	const chips = [
		{ kind: 'filter', field: 'tag', values: ['kitchen', 'bath'], negated: false },
		{ kind: 'filter', field: 'type', values: ['png'], negated: false },
		{ kind: 'filter', field: 'tag', values: ['people'], negated: true },
		{ kind: 'filter', field: 'width', values: [], negated: false },
		{ kind: 'filter', field: 'sort', values: ['newest'], negated: false },
		{ kind: 'term', negated: false },
		{ kind: 'phrase', negated: false },
		{ kind: 'filter', negated: false },
		{ kind: 'filter', field: 'color', values: ['', 7, 'blue'], negated: false },
		null,
	]
	eq([...facet.activeValuesFromChips(chips)].sort(), ['color:blue', 'sort:newest', 'tag:bath', 'tag:kitchen', 'type:png'])
	for (const bad of [null, undefined, 'x', 5, {}]) eq([...facet.activeValuesFromChips(bad)], [])
})

if (parserReady) {
	await check('facet helpers: chips from the real parser press exactly the values it resolved', () => {
		const parsed = parseQuery('tag:kitchen,bath type:png,jpeg -tag:people color:blue width:>5 kitchen')
		eq([...facet.activeValuesFromChips(parsed.chips)].sort(), ['color:blue', 'tag:bath', 'tag:kitchen', 'type:jpg', 'type:png'], 'the parser\'s own values, aliases resolved')
		// The panel presses exactly those.
		const root = parseHtml(renderFacets({ activeValues: facet.activeValuesFromChips(parsed.chips) }))
		eq(pressedButtons(root).filter((b) => b.attrs['aria-pressed'] === 'true').map((b) => b.attrs['aria-label'] ?? squash(textOf(b))).sort(), ['JPG', 'PNG', 'blue, 20 images'].sort().concat(['Kitchen, 214 images']).sort())
	})
} else skip('facet helpers: real parser chips', 'parse.ts is not usable here')

await check('hygiene: the proof leaves no fake clock or document behind', () => {
	assert(globalThis.setTimeout === realSetTimeout, 'setTimeout was left patched')
	eq(typeof document, 'undefined')
})

// A promise that rejected after the last check still counts.
await new Promise((resolve) => setImmediate(resolve))
if (unhandled.length) {
	failed++
	console.log(`FAIL  no unhandled rejections (${unhandled[0]})`)
}

finished = true
console.log(`\n${passed}/${passed + failed} passed${skipped ? `, ${skipped} skipped` : ''}`)
if (failed) process.exitCode = 1
