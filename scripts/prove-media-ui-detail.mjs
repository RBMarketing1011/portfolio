/**
 * Proof for the detail panel, the tag editor, the bulk tag dialog and the tag manager.
 *
 *   node scripts/prove-media-ui-detail.mjs
 *
 * No DOM and no browser, so the proof looks at the real components three ways:
 *  1. renderToString (SSR) for what a person would see and what a screen reader would
 *     be told, read back with a small HTML reader. Radix renders sheets and dialogs through
 *     a portal, which a server render leaves out, so the BODY of each (which is exported)
 *     is rendered directly and the wrapper is only proved to render nothing without crashing.
 *  2. The pure decisions the components make, extracted and called directly: parsing a
 *     typed or pasted tag list, the stem-aware suggestion order, the optimistic add and
 *     rollback reducer, the debounced stale-safe suggestion controller (on fake timers),
 *     rename collisions, the tag table's filter and sort, field saves, paging keys.
 *  3. A tiny hook-aware renderer (`mount`) that expands the same components into a tree of
 *     host elements, keeps hook state between renders and runs effects, so typing, keys,
 *     paste, blur and the promises behind them can be driven for real. Radix primitives need
 *     a browser, so only for this part their wrappers are swapped for plain stand-ins. It
 *     installs a hook dispatcher through React's internals, as the grid proof does: if a React
 *     upgrade renames them, this one place needs updating.
 *  4. Property checks (random but reproducible input) for the rules that must hold for ANY
 *     input: nothing the parser returns is refused by the real schemas, optimistic changes
 *     always end where the page says, a Use row is only ever offered for one stem-mate.
 *  5. Source hygiene: the style of the codebase, no markup from data, only client-safe imports.
 *
 * What is NOT proved here (needs a browser): real focus movement and the focus trap, the
 * Radix sheet and dialog opening and animating, real clipboard permission, touch.
 *
 * Every expectation comes from the build spec and contracts.ts, not from the code. Each rule
 * was also checked by breaking the code on purpose (a mutation run, not kept in the repo): a
 * proof that cannot fail proves nothing.
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

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
const consoleProblems = []
for (const level of ['error', 'warn']) {
	const original = console[level]
	console[level] = (...args) => {
		consoleProblems.push(`${level}: ${args.map(String).join(' ').slice(0, 300)}`)
		original.apply(console, args)
	}
}
const unhandled = []
process.on('unhandledRejection', (error) => unhandled.push(error))

// A proof that stops before its last line (an unsettled await) must not look like success.
let finished = false
process.on('exit', (code) => {
	if (!finished && code === 0) process.exitCode = 1
	if (!finished) console.log('FAIL  the proof did not run to the end')
})

async function check(name, fn) {
	const problems = consoleProblems.length
	const rejections = unhandled.length
	try {
		await fn()
		if (consoleProblems.length !== problems)
			throw new Error(`console output: ${consoleProblems[problems]}`)
		if (unhandled.length !== rejections)
			throw new Error(`unhandled rejection: ${String(unhandled[rejections]?.message ?? unhandled[rejections])}`)
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${String(error?.message ?? error).split('\n')[0]})`)
	}
}

function ok(condition, message = 'assertion failed') {
	if (!condition) throw new Error(message)
}
function eq(actual, expected, message = '') {
	const a = JSON.stringify(actual)
	const b = JSON.stringify(expected)
	if (a !== b) throw new Error(`${message} expected ${b}, got ${a}`)
}
const throwsNothing = (fn, message = 'threw') => {
	try {
		return fn()
	} catch (error) {
		throw new Error(`${message}: ${error?.message ?? error}`)
	}
}

const tick = () => new Promise((resolve) => setImmediate(resolve))
const noop = () => {}
const asyncNoop = async () => {}

/** A promise a test settles by hand, so "in flight" is a state it can hold. */
function deferred() {
	let resolve
	let reject
	const promise = new Promise((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

/** A clock a test advances by hand. The same shape as the controller's `timers`. */
class FakeClock {
	constructor() {
		this.now = 0
		this.next = 1
		this.timers = new Map()
	}
	set(callback, ms) {
		const id = this.next++
		this.timers.set(id, { at: this.now + ms, callback })
		return id
	}
	clear(id) {
		this.timers.delete(id)
	}
	advance(ms) {
		const target = this.now + ms
		for (;;) {
			let soonest = null
			for (const [id, timer] of this.timers)
				if (timer.at <= target && (soonest === null || timer.at < soonest.timer.at))
					soonest = { id, timer }
			if (!soonest) break
			this.timers.delete(soonest.id)
			this.now = soonest.timer.at
			soonest.timer.callback()
		}
		this.now = target
	}
	get pending() {
		return this.timers.size
	}
	/** Route the real `setTimeout` through this clock, for components that use it directly. */
	install() {
		this.saved = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
		globalThis.setTimeout = (callback, ms) => this.set(callback, ms ?? 0)
		globalThis.clearTimeout = (id) => this.clear(id)
	}
	uninstall() {
		globalThis.setTimeout = this.saved.setTimeout
		globalThis.clearTimeout = this.saved.clearTimeout
	}
}

/* -------------------------------------------------------------------------- */
/* Stand-ins for next/*, then the real modules                                */
/* -------------------------------------------------------------------------- */

const imageProps = []
mock('next/image', {
	__esModule: true,
	default: function FakeImage(props) {
		imageProps.push(props)
		return h('img', {
			src: props.src,
			alt: props.alt,
			sizes: props.sizes,
			className: props.className,
			'data-fill': props.fill ? '1' : undefined,
			'data-unoptimized': props.unoptimized ? '1' : undefined,
			'data-placeholder': props.placeholder,
			'data-blur': props.blurDataURL,
		})
	},
})

let editor = loadTs('src/app/account/media/tag-editor.tsx')
let panel = loadTs('src/app/account/media/detail-panel.tsx')
let bulk = loadTs('src/app/account/media/bulk-tag-dialog.tsx')
let manager = loadTs('src/app/account/media/tag-manager-dialog.tsx')
const { MEDIA_LIMITS } = loadTs('src/lib/media/types.ts')
const { slugify, stem } = loadTs('src/lib/media/text.ts')
const { assetPatchSchema, bulkBodySchema } = loadTs('src/lib/media/schemas.ts')

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
const classes = (node) => (node.attrs.class ?? '').split(/\s+/).filter(Boolean)
const hasClass = (node, cls) => classes(node).includes(cls)
const textOf = (node) =>
	(node.children ?? [])
		.map((c) => (c.text !== undefined ? c.text : textOf(c)))
		.join('')
const bySlot = (root, slot) => findAllNodes(root, (n) => n.attrs['data-slot'] === slot)
const byRole = (root, role) => findAllNodes(root, (n) => n.attrs.role === role)
const byTag = (root, tag) => findAllNodes(root, (n) => n.tag === tag)

/** Accessible name per the common subset of accname: labelledby, aria-label, <label for>, content, alt, title. */
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
				if (c.tag === 'img') return c.attrs.alt ?? ''
				return content(c)
			})
			.join(' ')
	if (node.tag === 'button' || node.tag === 'a' || ['checkbox', 'switch', 'button', 'option'].includes(node.attrs.role)) {
		const text = content(node).replace(/\s+/g, ' ').trim()
		if (text) return text
	}
	if (['input', 'select', 'textarea'].includes(node.tag)) {
		// A control wrapped by its label is named by that label's text.
		for (let p = node.parent; p; p = p.parent) {
			if (p.tag !== 'label') continue
			const wrapped = textOf(p).replace(/s+/g, ' ').trim()
			if (wrapped) return wrapped
		}
	}
	return (node.attrs.title ?? '').trim()
}

const interactive = (n) =>
	['button', 'select', 'input', 'a', 'textarea'].includes(n.tag) ||
	['checkbox', 'switch', 'button', 'combobox', 'option'].includes(n.attrs.role)

/** Checks that apply to any fragment of output. Returns the parsed tree. */
function staticChecks(html, label, { skipNames = false } = {}) {
	const root = parseHtml(html)
	if (!skipNames) {
		for (const el of findAllNodes(root, (n) => interactive(n) && n.attrs['aria-hidden'] !== 'true' && n.attrs.type !== 'hidden')) {
			// Radix renders a hidden native <select> beside its trigger; it is aria-hidden and not tabbable.
			if (el.tag === 'select' && el.attrs['aria-hidden'] === 'true') continue
			ok(accessibleName(el, root), `${label}: <${el.tag}${el.attrs.role ? ` role=${el.attrs.role}` : ''}> has no accessible name`)
		}
	}
	const ids = findAllNodes(root, (n) => n.attrs.id !== undefined).map((n) => n.attrs.id)
	eq(ids.length, new Set(ids).size, `${label}: duplicate ids ${ids}`)
	for (const attr of ['aria-labelledby', 'aria-controls', 'aria-describedby', 'aria-activedescendant']) {
		for (const el of findAllNodes(root, (n) => n.attrs[attr] !== undefined)) {
			for (const id of el.attrs[attr].split(/\s+/).filter(Boolean))
				ok(ids.includes(id), `${label}: ${attr} points at missing id ${id}`)
		}
	}
	// A button inside a button (or a link) is invalid and breaks keyboard and screen readers.
	for (const el of findAllNodes(root, (n) => n.tag === 'button' || n.tag === 'a')) {
		const inner = findAllNodes(el, interactive)
		ok(inner.length === 0, `${label}: interactive element nested inside <${el.tag}>`)
	}
	return root
}

/* -------------------------------------------------------------------------- */
/* A hook-aware mini renderer, for handlers, effects and promises             */
/* -------------------------------------------------------------------------- */

const INTERNALS = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
const sameDeps = (a, b) =>
	a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
const MEMO = Symbol.for('react.memo')
const FORWARD = Symbol.for('react.forward_ref')
const FRAGMENT = Symbol.for('react.fragment')

/** Expands a component tree into host elements: `{ type, props, children }` or `{ text }`. */
function mount(Component, initialProps) {
	const instances = new Map()
	let effects = []
	let dirty = false
	let queued = false
	let props = initialProps
	let tree = []
	let disposed = false
	const api = { focused: null, renders: 0 }

	const schedule = () => {
		dirty = true
		if (queued) return
		queued = true
		queueMicrotask(() => {
			queued = false
			if (dirty && !disposed) api.flush()
		})
	}

	function callComponent(type, elementProps, key) {
		let instance = instances.get(key)
		if (!instance) instances.set(key, (instance = { hooks: [] }))
		instance.visited = true
		let index = 0
		const slot = () => (instance.hooks[index] ??= {})
		const effectHook = (effect, deps) => {
			const s = slot()
			index++
			if (!s.ran || !deps || !sameDeps(s.deps, deps)) {
				s.ran = true
				s.deps = deps
				effects.push({ s, effect })
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
						schedule()
					}
				}
				return [s.value, s.set]
			},
			useReducer(reducer, arg, init) {
				const s = slot()
				index++
				s.reducer = reducer
				if (!('state' in s)) {
					s.state = init ? init(arg) : arg
					s.dispatch = (action) => {
						const next = s.reducer(s.state, action)
						if (Object.is(next, s.state)) return
						s.state = next
						schedule()
					}
				}
				return [s.state, s.dispatch]
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
			useEffect: effectHook,
			useLayoutEffect: effectHook,
			useInsertionEffect: effectHook,
			useId() {
				const s = slot()
				index++
				return (s.id ??= `:r${key.replace(/[^\w]/g, '')}${index}:`)
			},
			useDebugValue() {},
		}
		const previous = INTERNALS.H
		INTERNALS.H = dispatcher
		try {
			return type.render ? type.render(elementProps, elementProps.ref ?? null) : type(elementProps)
		} finally {
			INTERNALS.H = previous
		}
	}

	const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
	const descendants = (element) => {
		const out = []
		const visit = (nodes) => {
			for (const n of nodes) {
				if (n.text !== undefined) continue
				out.push(n)
				visit(n.children)
			}
		}
		visit(element.children)
		return out
	}
	const matches = (selector) => {
		// Only the selectors the components use: a tag name, or one [attribute="value"].
		const attr = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector)
		if (attr) return (n) => n.props[attr[1]] !== undefined && String(n.props[attr[1]]) === attr[2]
		return (n) => n.type === selector
	}
	function fakeNode(element) {
		return {
			isFake: true,
			tagName: element.type.toUpperCase(),
			element,
			get dataset() {
				return Object.fromEntries(
					Object.entries(element.props)
						.filter(([k]) => k.startsWith('data-'))
						.map(([k, v]) => [camel(k.slice(5)), String(v)]),
				)
			},
			getAttribute: (name) => (element.props[name] === undefined ? null : String(element.props[name])),
			get disabled() {
				return Boolean(element.props.disabled)
			},
			focus: () => {
				api.focused = element
			},
			select() {},
			setSelectionRange() {},
			scrollIntoView() {},
			querySelectorAll: (selector) => descendants(element).filter(matches(selector)).map(fakeNode),
			querySelector(selector) {
				return this.querySelectorAll(selector)[0] ?? null
			},
		}
	}

	function expand(node, path) {
		if (node === null || node === undefined || typeof node === 'boolean') return []
		if (Array.isArray(node)) return node.flatMap((c, i) => expand(c, `${path}[${i}]`))
		if (typeof node === 'string' || typeof node === 'number') return [{ text: String(node) }]
		const { type, props: elementProps } = node
		const here = `${path}/${node.key ?? ''}${typeof type === 'string' ? type : (type.displayName ?? type.name ?? 'c')}`
		if (type === FRAGMENT) return expand(elementProps.children, here)
		if (typeof type === 'string') {
			const element = { type, props: elementProps, children: expand(elementProps.children, here) }
			const ref = elementProps.ref
			if (ref) {
				const target = fakeNode(element)
				if (typeof ref === 'function') ref(target)
				else ref.current = target
			}
			return [element]
		}
		if (type.$$typeof === MEMO) return expand({ ...node, type: type.type }, path)
		if (type.$$typeof === FORWARD || typeof type === 'function')
			return expand(callComponent(type, elementProps, here), here)
		throw new Error(`mount: cannot expand ${String(type)}`)
	}

	function renderNow() {
		dirty = false
		api.renders++
		for (const instance of instances.values()) instance.visited = false
		effects = []
		tree = expand(h(Component, props), 'root')
		for (const [key, instance] of instances) {
			if (instance.visited) continue
			for (const s of instance.hooks) if (typeof s?.cleanup === 'function') s.cleanup()
			instances.delete(key)
		}
		const run = effects
		effects = []
		for (const { s, effect } of run) {
			if (typeof s.cleanup === 'function') s.cleanup()
			s.cleanup = effect()
		}
	}

	api.flush = () => {
		let guard = 0
		do {
			renderNow()
			if (++guard > 50) throw new Error('mount: render loop')
		} while (dirty)
		return api
	}
	api.rerender = (next) => {
		props = { ...props, ...next }
		return api.flush()
	}
	/** Let promises and microtasks run, rendering after each. */
	api.settle = async (rounds = 4) => {
		for (let i = 0; i < rounds; i++) {
			await tick()
			if (dirty) api.flush()
		}
		return api
	}
	api.unmount = () => {
		disposed = true
		for (const instance of instances.values())
			for (const s of instance.hooks) if (typeof s?.cleanup === 'function') s.cleanup()
		instances.clear()
	}

	const flat = () => {
		const out = []
		const gather = (nodes) => {
			for (const n of nodes) {
				if (n.text !== undefined) continue
				out.push(n)
				gather(n.children)
			}
		}
		gather(tree)
		return out
	}
	const nodeText = (n) => (n.text !== undefined ? n.text : n.children.map(nodeText).join(''))
	api.all = (predicate = () => true) => flat().filter(predicate)
	api.find = (predicate) => flat().find(predicate)
	api.text = (n) => (n ? nodeText(n) : tree.map(nodeText).join(''))
	api.byLabel = (label) => flat().find((n) => n.props['aria-label'] === label)
	api.byRole = (role) => flat().filter((n) => n.props.role === role)
	api.bySlot = (slotName) => flat().filter((n) => n.props['data-slot'] === slotName)
	api.button = (name) =>
		flat().find((n) => n.type === 'button' && (n.props['aria-label'] === name || nodeText(n).trim() === name))
	api.buttons = () => flat().filter((n) => n.type === 'button')
	return api.flush()
}

/** A DOM-ish event with spies. */
function ev(over = {}) {
	return {
		key: '',
		shiftKey: false,
		ctrlKey: false,
		altKey: false,
		metaKey: false,
		detail: 1,
		defaultPrevented: false,
		nativeEvent: { isComposing: false },
		preventDefault() {
			this.defaultPrevented = true
		},
		stopPropagation() {
			this.propagationStopped = true
		},
		...over,
	}
}

/** Click a node like a browser would: a disabled control gets no click. */
function click(app, node, over = {}) {
	if (!node) throw new Error('click: no such node')
	if (node.props.disabled) return false
	const event = ev({ currentTarget: node, target: node, ...over })
	node.props.onClick?.(event)
	app.flush()
	return event
}
function typeInto(app, node, value, over = {}) {
	node.props.onChange(
		ev({ target: { value }, currentTarget: { value, selectionStart: value.length, selectionEnd: value.length }, ...over }),
	)
	app.flush()
}
function press(app, node, key, over = {}) {
	const event = ev({ key, target: node, currentTarget: node, ...over })
	node.props.onKeyDown?.(event)
	app.flush()
	return event
}
function pasteInto(app, node, text, selection = {}) {
	const event = ev({
		clipboardData: { getData: () => text },
		currentTarget: { selectionStart: selection.start ?? 0, selectionEnd: selection.end ?? 0, value: '' },
	})
	node.props.onPaste?.(event)
	app.flush()
	return event
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const hex = (n) => n.toString(16).padStart(24, '0')
const BLUR = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4IA4AAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=='
const F_CLIENTS = hex(1)
const F_ACME = hex(2)
const F_BRAND = hex(3)
const folders = [
	{ id: F_CLIENTS, parentId: null, name: 'Clients', path: 'Clients', depth: 0, count: 0, total: 3 },
	{ id: F_ACME, parentId: F_CLIENTS, name: 'Acme', path: 'Clients/Acme', depth: 1, count: 3, total: 3 },
	{ id: F_BRAND, parentId: null, name: 'Brand', path: 'Brand', depth: 0, count: 2, total: 2 },
]

const manual = (label, slug = slugify(label)) => ({ slug, label, source: 'manual' })
const auto = (label, over = {}) => ({ slug: slugify(label), label, source: 'auto', via: 'vision', confidence: 0.92, ...over })

function asset(over = {}) {
	return {
		id: hex(100),
		name: 'Kitchen 1',
		filename: 'kitchen-1.jpg',
		url: 'https://abc123.public.blob.vercel-storage.com/workspaces/w/media/kitchen-1.jpg',
		contentType: 'image/jpeg',
		format: 'jpg',
		bytes: 1_572_864,
		width: 1600,
		height: 1200,
		orientation: 'landscape',
		hasAlpha: false,
		animated: false,
		colors: [
			{ hex: '#2f6fed', name: 'blue', share: 0.42 },
			{ hex: '#ffffff', name: 'white', share: 0.3 },
		],
		brightness: 'mid',
		saturation: 'muted',
		blur: BLUR,
		folderId: F_ACME,
		folderPath: 'Clients/Acme',
		tags: [
			auto('Van'),
			manual('Kitchen'),
			auto('Before', { via: 'filename', confidence: undefined }),
			manual('Remodel'),
		],
		caption: 'A finished kitchen',
		altText: 'White kitchen with blue cabinets',
		textInImage: '',
		notes: 'Hero for the Acme page',
		kind: 'photo',
		tagging: { status: 'done' },
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...over,
	}
}

const stat = (label, count, over = {}) => ({
	slug: slugify(label),
	label,
	count,
	manual: count,
	auto: 0,
	...over,
})

function bodyProps(over = {}) {
	return {
		asset: asset(),
		canWrite: true,
		canDelete: true,
		aiConfigured: true,
		folders,
		registry: new Set(),
		onPatch: asyncNoop,
		onDelete: asyncNoop,
		onRetag: asyncNoop,
		onFilter: noop,
		fetchTagSuggestions: async () => [],
		...over,
	}
}
const renderBody = (over) => renderToString(h(panel.DetailPanelBody, bodyProps(over)))

function editorProps(over = {}) {
	return {
		tags: [],
		canEdit: true,
		onAdd: asyncNoop,
		onRemove: asyncNoop,
		onPromote: asyncNoop,
		onTagClick: noop,
		fetchSuggestions: async () => [],
		...over,
	}
}
const renderEditor = (over) => renderToString(h(editor.TagEditor, editorProps(over)))

const chips = (root) => bySlot(root, 'tag-chip')
const chipLabels = (root) => chips(root).map((li) => textOf(findNode(li, (n) => n.tag === 'button' || n.tag === 'span')).replace(/\s+/g, ' ').trim())
const buttonNames = (root) => byTag(root, 'button').map((b) => accessibleName(b, root))

/* ========================================================================== */
/* SSR: TagEditor                                                             */
/* ========================================================================== */

await check('tag editor: no tags shows a hint and a labelled combobox wired to a hidden listbox', () => {
	const root = staticChecks(renderEditor({ tags: [] }), 'no tags')
	ok(textOf(root).includes('No tags yet.'))
	eq(chips(root).length, 0)
	eq(findAllNodes(root, (n) => n.tag === 'ul' && n.attrs['aria-label'] === 'Tags').length, 0, 'no empty list')
	const input = findNode(root, (n) => n.tag === 'input')
	eq(input.attrs.role, 'combobox')
	eq(input.attrs['aria-expanded'], 'false')
	eq(input.attrs['aria-autocomplete'], 'list')
	eq(input.attrs['aria-haspopup'], 'listbox')
	ok(input.attrs['aria-label'], 'the box needs a name')
	ok(!('disabled' in input.attrs), 'never disabled')
	ok(!('aria-activedescendant' in input.attrs), 'nothing is highlighted while closed')
	const list = findNode(root, (n) => n.attrs.id === input.attrs['aria-controls'])
	ok(list, 'aria-controls must point at the listbox')
	eq(list.attrs.role, 'listbox')
	ok('hidden' in list.attrs, 'the listbox is hidden while closed')
	ok(findNode(root, (n) => n.attrs.role === 'status' && n.attrs['aria-live'] === 'polite'), 'a live region announces results')
})

await check('tag editor: manual tags first as solid chips, automatic ones quieter with a sparkle and a tooltip', () => {
	const root = staticChecks(renderEditor({ tags: asset().tags }), 'mixed')
	const lis = chips(root)
	eq(lis.map((li) => li.attrs['data-slug']), ['kitchen', 'remodel', 'van', 'before'], 'manual first, then automatic, order kept inside each')
	eq(lis.map((li) => li.attrs['data-source']), ['manual', 'manual', 'auto', 'auto'])
	for (const li of lis.slice(0, 2)) {
		for (const cls of ['border-brand/30', 'bg-brand/10', 'text-brand']) ok(hasClass(li, cls), `manual chip lacks ${cls}`)
		eq(findAllNodes(li, (n) => hasClass(n, 'lucide-sparkles')).length, 0, 'a manual chip has no sparkle')
	}
	for (const li of lis.slice(2)) {
		for (const cls of ['border-white/10', 'bg-white/5', 'text-slate-300']) ok(hasClass(li, cls), `auto chip lacks ${cls}`)
		eq(findAllNodes(li, (n) => hasClass(n, 'lucide-sparkles')).length, 1, 'an auto chip has a sparkle')
		ok(textOf(li).includes('automatic'), 'colour is not the only carrier of "automatic"')
	}
	eq(findNode(lis[2], (n) => n.tag === 'button').attrs.title, '92% sure')
	eq(findNode(lis[3], (n) => n.tag === 'button').attrs.title, 'From the file name')
	// Each chip is a button that filters; each has its own remove; an automatic one has Keep.
	for (const li of lis) {
		const names = byTag(li, 'button').map((b) => accessibleName(b, root))
		ok(names.some((n) => n.startsWith('Remove tag ')), `no remove on ${li.attrs['data-slug']}`)
	}
	ok(buttonNames(root).includes('Keep tag Van') && buttonNames(root).includes('Keep tag Before'))
	ok(!buttonNames(root).includes('Keep tag Kitchen'), 'a manual tag has nothing to keep')
	eq(byTag(lis[0], 'button').length, 2, 'manual: filter + remove')
	eq(byTag(lis[2], 'button').length, 3, 'auto: filter + keep + remove')
})

await check('tag editor: the tooltip carries the honest confidence, and none when there is none', () => {
	const root = renderToString(
		h(editor.TagEditor, editorProps({
			tags: [
				auto('A', { confidence: 0.6 }),
				auto('B', { confidence: 1 }),
				auto('C', { confidence: 0.005 }),
				auto('D', { confidence: 7 }),
				auto('E', { confidence: -1 }),
				auto('F', { confidence: Number.NaN }),
				auto('G', { confidence: undefined }),
			],
		})),
	)
	const titles = chips(parseHtml(root)).map((li) => findNode(li, (n) => n.tag === 'button').attrs.title)
	eq(titles, ['60% sure', '100% sure', '1% sure', 'Added automatically', 'Added automatically', 'Added automatically', 'Added automatically'])
})

await check('tag editor: the figure is also shown on touch screens, where a tooltip never appears; manual tags have none', () => {
	const root = staticChecks(renderEditor({ tags: [manual('Kitchen'), auto('Van', { confidence: 0.92 }), auto('Before', { via: 'filename', confidence: undefined })] }), 'touch confidence')
	const figure = (slug) => findAllNodes(chips(root).find((c) => c.attrs['data-slug'] === slug), (n) => n.attrs['aria-hidden'] === 'true' && /\d+%/.test(textOf(n)))
	eq(figure('van').length, 1)
	eq(textOf(figure('van')[0]), '92%')
	ok(hasClass(figure('van')[0], 'hidden') && hasClass(figure('van')[0], '[@media(hover:none)]:inline'), 'hidden with a pointer, shown without one')
	eq(figure('kitchen').length, 0)
	eq(figure('before').length, 0, 'no figure where there is no honest figure')
})

await check('tag editor: a one-line legend teaches the automatic tags, only to someone who can act on it', () => {
	const legend = 'Tags with a sparkle were added automatically.'
	ok(textOf(parseHtml(renderEditor({ tags: asset().tags }))).includes(legend))
	ok(textOf(parseHtml(renderEditor({ tags: asset().tags }))).includes('a tag you remove is not suggested again'))
	ok(!textOf(parseHtml(renderEditor({ tags: [manual('A')] }))).includes(legend), 'nothing automatic, nothing to explain')
	ok(!textOf(parseHtml(renderEditor({ tags: asset().tags, canEdit: false }))).includes(legend), 'a viewer cannot keep or remove')
	ok(!textOf(parseHtml(renderEditor({ tags: [] }))).includes(legend))
})

await check('tag editor: more than 12 tags collapses to 12 behind "Show all N"; exactly 12 does not', () => {
	const many = (n) => [
		...Array.from({ length: Math.ceil(n / 2) }, (_, i) => auto(`Auto ${i + 1}`)),
		...Array.from({ length: Math.floor(n / 2) }, (_, i) => manual(`Manual ${i + 1}`)),
	]
	const forty = staticChecks(renderEditor({ tags: many(40) }), '40 tags')
	eq(chips(forty).length, 12)
	ok(chips(forty).every((li) => li.attrs['data-source'] === 'manual'), 'the 12 shown are the manual ones')
	const more = byTag(forty, 'button').find((b) => textOf(b).trim() === 'Show all 40')
	ok(more, '"Show all 40" button')
	eq(more.attrs['aria-expanded'], 'false')
	const list = findNode(forty, (n) => n.tag === 'ul' && n.attrs['aria-label'] === 'Tags')
	eq(more.attrs['aria-controls'], list.attrs.id)
	const twelve = parseHtml(renderEditor({ tags: many(12) }))
	eq(chips(twelve).length, 12)
	ok(!textOf(twelve).includes('Show all'))
	const thirteen = parseHtml(renderEditor({ tags: many(13) }))
	eq(chips(thirteen).length, 12)
	ok(textOf(thirteen).includes('Show all 13'))
})

await check('tag editor: read-only keeps the chips clickable to filter but offers nothing that edits', () => {
	const root = staticChecks(renderEditor({ canEdit: false, tags: asset().tags }), 'read-only')
	eq(chips(root).length, 4)
	eq(findAllNodes(root, (n) => n.tag === 'input').length, 0, 'no box')
	const names = buttonNames(root)
	ok(!names.some((n) => n.startsWith('Remove') || n.startsWith('Keep')), `edit controls leaked: ${names}`)
	eq(names.length, 4, 'one filter button per chip')
	ok(!textOf(root).includes('No tags yet'))
	const empty = parseHtml(renderEditor({ canEdit: false, tags: [] }))
	ok(textOf(empty).includes('No tags.') && !textOf(empty).includes('yet'))
	// With nowhere to send a click, a chip is not a button at all.
	const inert = staticChecks(renderEditor({ canEdit: false, tags: asset().tags, onTagClick: undefined }), 'inert')
	eq(byTag(inert, 'button').length, 0)
})

await check('tag editor: Keep is only offered when the page can keep', () => {
	const root = parseHtml(renderEditor({ tags: asset().tags, onPromote: undefined }))
	ok(!buttonNames(root).some((n) => n.startsWith('Keep')))
})

await check('tag editor: hostile tags are escaped, repeated slugs collapse, junk rows are dropped', () => {
	const html = renderEditor({
		tags: [
			{ slug: 'x', label: '<script>alert(1)</script>', source: 'manual' },
			{ slug: 'x', label: 'second one with the same slug', source: 'manual' },
			{ slug: 'blank', label: '   ', source: 'manual' },
			{ slug: '', label: 'no slug', source: 'manual' },
			null,
			'text',
			{ slug: 'odd', label: 'Odd', source: 'weird' },
			{ slug: 'big', label: 'B', source: 'auto', confidence: 99 },
		],
	})
	ok(!html.includes('<script>'), 'label rendered as HTML')
	ok(html.includes('&lt;script&gt;'))
	const root = parseHtml(html)
	eq(chips(root).map((li) => li.attrs['data-slug']), ['x', 'blank', 'odd', 'big'])
	eq(chips(root).find((li) => li.attrs['data-slug'] === 'blank') && textOf(chips(root).find((li) => li.attrs['data-slug'] === 'blank')).trim(), 'blank', 'a blank label falls back to the slug')
	eq(chips(root).find((li) => li.attrs['data-slug'] === 'odd').attrs['data-source'], 'auto', 'an unknown source reads as automatic, the quieter one')
	for (const bad of [undefined, null, 'nope', 5, {}]) throwsNothing(() => renderEditor({ tags: bad }), `tags=${String(bad)}`)
})

await check('tag editor: extra fields on a tag from the network cannot make a chip look unsaved', () => {
	const root = parseHtml(renderEditor({ tags: [{ slug: 'a', label: 'A', source: 'manual', pending: 'add' }, { slug: 'b', label: 'B', source: 'auto', pending: 'promote', confidence: 0.5, via: 'bogus' }] }))
	eq(chips(root).map((c) => c.attrs['data-pending']), [undefined, undefined])
	eq(findNode(chips(root)[1], (n) => n.tag === 'button').attrs.title, '50% sure')
	ok(!chips(root).some((c) => hasClass(c, 'border-dashed')))
})

await check('tag editor: a long label is truncated on screen but keeps its full text in the DOM', () => {
	const label = 'x'.repeat(40)
	const root = parseHtml(renderEditor({ tags: [manual(label)] }))
	const span = findNode(chips(root)[0], (n) => n.tag === 'span' && n.attrs.dir === 'auto')
	ok(hasClass(span, 'truncate'))
	eq(textOf(span), label)
})

await check('suggestion list: stem-aware rows read exactly as the spec words them, with full option ARIA', () => {
	const ranked = editor.rankTagSuggestions('Kitchens', [stat('Kitchen', 214), stat('Kitchen remodel', 40)])
	const html = renderToString(
		h(editor.TagSuggestionList, {
			id: 'list',
			expanded: true,
			rows: ranked.options,
			activeIndex: ranked.defaultIndex,
			optionId: (i) => `opt-${i}`,
			onPick: noop,
		}),
	)
	const root = staticChecks(html, 'suggestions')
	const list = findNode(root, (n) => n.attrs.role === 'listbox')
	eq(list.attrs.id, 'list')
	ok(!('hidden' in list.attrs))
	const options = byRole(root, 'option')
	const texts = options.map((o) => textOf(o).replace(/\s+/g, ' ').trim())
	eq(texts, ['Use "Kitchen" (214)', 'Create "Kitchens"', 'Kitchen remodel (40)'])
	eq(options.map((o) => o.attrs['aria-selected']), ['true', 'false', 'false'], 'the stem suggestion is highlighted by default')
	eq(options.map((o) => o.attrs.id), ['opt-0', 'opt-1', 'opt-2'])
	// Closed: still in the DOM, empty and hidden.
	const closed = parseHtml(renderToString(h(editor.TagSuggestionList, { id: 'list', expanded: false, rows: ranked.options, activeIndex: 0, optionId: (i) => `o${i}`, onPick: noop })))
	eq(byRole(closed, 'option').length, 0)
	ok('hidden' in findNode(closed, (n) => n.attrs.role === 'listbox').attrs)
})

await check('suggestion list: a huge label from the network is clipped on screen, and object-key slugs are ordinary', () => {
	const rows = editor.rankTagSuggestions('x', [stat('y'.repeat(10_000), 5), { slug: '__proto__', label: 'Proto', count: 2 }, { slug: 'constructor', label: 'Ctor', count: 1 }]).options
	const html = renderToString(h(editor.TagSuggestionList, { id: 'l', expanded: true, rows, activeIndex: -1, optionId: (i) => 'o' + i, onPick: noop }))
	ok(html.length < 5000, 'the page is not handed ten thousand characters')
	const texts = byRole(parseHtml(html), 'option').map((o) => textOf(o).replace(/\s+/g, ' ').trim())
	ok(texts[1].length < 60)
	ok(texts.includes('Proto (2)') && texts.includes('Ctor (1)'))
	eq(new Set(rows.map((r) => r.key)).size, rows.length, 'every row has its own key')
})

await check('suggestion list: a tag already on the image reads as added, and hostile counts and labels are inert', () => {
	const rows = editor.rankTagSuggestions('kitchen', [stat('Kitchen', 3), { slug: 'x', label: '<b>bold</b>', count: Number.NaN }], new Map([['kitchen', 'manual']])).options
	const html = renderToString(h(editor.TagSuggestionList, { id: 'l', expanded: true, rows, activeIndex: -1, optionId: (i) => `o${i}`, onPick: noop }))
	ok(!html.includes('<b>'))
	const root = parseHtml(html)
	ok(textOf(byRole(root, 'option')[0]).includes('Added'))
	ok(textOf(byRole(root, 'option')[1]).includes('(0)'), 'a NaN count reads as zero, not "NaN"')
})

/* ========================================================================== */
/* SSR: DetailPanel                                                           */
/* ========================================================================== */

function panelProps(over = {}) {
	return {
		asset: asset(),
		index: 2,
		count: 40,
		canWrite: true,
		canDelete: true,
		aiConfigured: true,
		folders,
		onClose: noop,
		onPrev: noop,
		onNext: noop,
		onPatch: asyncNoop,
		onDelete: asyncNoop,
		onRetag: asyncNoop,
		onFilter: noop,
		fetchTagSuggestions: async () => [],
		...over,
	}
}

const field = (root, label) =>
	bySlot(root, 'detail-field').find((f) => textOf(findNode(f, (n) => n.tag === 'label' || (n.tag === 'p' && hasClass(n, 'text-xs')))).trim() === label)
const dd = (root, term) => {
	const dts = byTag(root, 'dt')
	const dt = dts.find((d) => textOf(d).trim() === term)
	if (!dt) return undefined
	const siblings = dt.parent.children.filter((c) => c.text === undefined)
	return siblings[siblings.indexOf(dt) + 1]
}
const dataset = (name) => (n) => n.attrs['data-slot'] === name

await check('detail panel: closed (asset null) renders nothing at all', () => {
	eq(renderToString(h(panel.DetailPanel, panelProps({ asset: null }))), '')
	for (const index of [-1, 0, 99, Number.NaN]) eq(renderToString(h(panel.DetailPanel, panelProps({ asset: null, index }))), '')
})

await check('detail panel: open is rendered through a Radix portal, so a server render is empty and must not crash', () => {
	eq(renderToString(h(panel.DetailPanel, panelProps())), '')
})

await check('detail panel: the full asset shows every part the spec lists', () => {
	const html = renderBody()
	const root = staticChecks(html, 'full asset')
	// Preview: next/image, contained, with a blur placeholder.
	const img = findNode(bySlot(root, 'detail-preview')[0], (n) => n.tag === 'img')
	eq(img.attrs['data-fill'], '1')
	ok(img.attrs.class.includes('object-contain'), 'contained, not cropped')
	eq(img.attrs['data-placeholder'], 'blur')
	eq(img.attrs.alt, 'White kitchen with blue cabinets', 'alt text is the alt for the preview')
	eq(img.attrs['data-unoptimized'], undefined, 'a jpg may be optimised')
	ok(!bySlot(root, 'detail-preview')[0].attrs['data-checkerboard'], 'no checkerboard without transparency')
	// Name, caption, alt, notes: editable fields holding the stored values.
	const name = findNode(field(root, 'Name'), (n) => n.tag === 'input')
	eq(name.attrs.value, 'Kitchen 1')
	eq(name.attrs.maxLength, String(MEDIA_LIMITS.nameMax))
	eq(textOf(findNode(field(root, 'Caption'), (n) => n.tag === 'textarea')), 'A finished kitchen')
	eq(textOf(findNode(field(root, 'Alt text'), (n) => n.tag === 'textarea')), 'White kitchen with blue cabinets')
	eq(textOf(findNode(field(root, 'Notes'), (n) => n.tag === 'textarea')), 'Hero for the Acme page')
	eq(findNode(field(root, 'Caption'), (n) => n.tag === 'textarea').attrs.maxLength, String(MEDIA_LIMITS.captionMax))
	eq(findNode(field(root, 'Alt text'), (n) => n.tag === 'textarea').attrs.maxLength, String(MEDIA_LIMITS.altMax))
	eq(findNode(field(root, 'Notes'), (n) => n.tag === 'textarea').attrs.maxLength, String(MEDIA_LIMITS.notesMax))
	// Folder: a Select showing the path.
	const folder = findNode(field(root, 'Folder'), (n) => n.attrs.role === 'combobox')
	eq(textOf(folder).trim(), 'Clients/Acme')
	ok(accessibleName(folder, root) === 'Folder', 'the folder trigger is named by its label')
	// Tags: the editor, manual first.
	eq(chips(root).map((li) => li.attrs['data-slug']), ['kitchen', 'remodel', 'van', 'before'])
	// Palette: one swatch per colour, name as text, percentage.
	const palette = bySlot(root, 'detail-palette')[0]
	const swatches = byTag(palette, 'button')
	eq(swatches.map((b) => textOf(b).replace(/\s+/g, ' ').trim()), ['blue 42%, search for this color', 'white 30%, search for this color'])
	ok(findNode(swatches[0], (n) => n.attrs.style)?.attrs.style.includes('#2f6fed'))
	// Metadata.
	eq(textOf(dd(root, 'Dimensions')).trim(), '1,600 × 1,200')
	eq(textOf(dd(root, 'File size')).trim(), '1.5 MB')
	eq(textOf(dd(root, 'Type')).trim(), 'JPG')
	eq(textOf(dd(root, 'Orientation')).trim(), 'Landscape')
	eq(textOf(dd(root, 'Kind')).trim(), 'Photo')
	ok(textOf(dd(root, 'Added')).trim().length > 0 && !textOf(dd(root, 'Added')).includes('Invalid'))
	ok(textOf(dd(root, 'Tagging')).includes('Tagged'))
	ok(buttonNames(root).includes('Auto-tag again'), 'Auto-tag again when aiConfigured && canWrite')
	// Actions.
	const names = buttonNames(root)
	ok(names.includes('Copy URL') && names.includes('Delete'))
	const links = byTag(root, 'a')
	const open = links.find((a) => textOf(a).includes('Open original'))
	eq(open.attrs.target, '_blank')
	ok(open.attrs.rel.split(' ').includes('noopener'), 'rel noopener')
	eq(open.attrs.href, asset().url)
	const download = links.find((a) => textOf(a).trim() === 'Download')
	eq(download.attrs.download, 'kitchen-1.jpg')
	eq(download.attrs.href, `${asset().url}?download=1`, 'Vercel Blob needs ?download=1 for a cross-origin download')
})

await check('detail panel: there is no similar-images strip in this version', () => {
	const root = parseHtml(renderBody())
	ok(!/similar/i.test(textOf(root)))
})

await check('detail panel: an image with no tags, caption or colours renders cleanly', () => {
	const bare = asset({ tags: [], caption: '', altText: '', notes: '', colors: [], kind: null, folderId: null, folderPath: '', blur: null })
	const root = staticChecks(renderBody({ asset: bare }), 'bare')
	ok(textOf(root).includes('No tags yet.'))
	eq(bySlot(root, 'detail-palette').length, 0, 'no empty palette section')
	eq(textOf(findNode(field(root, 'Caption'), (n) => n.tag === 'textarea')), '')
	eq(textOf(findNode(field(root, 'Folder'), (n) => n.attrs.role === 'combobox')).trim(), 'No folder')
	ok(dd(root, 'Kind') === undefined, 'no Kind row without a kind')
	const img = findNode(bySlot(root, 'detail-preview')[0], (n) => n.tag === 'img')
	eq(img.attrs['data-placeholder'], undefined, 'no blur data, no placeholder')
	ok(!bySlot(root, 'detail-palette').length)
})

await check('detail panel: a gif is not run through the optimiser, and says it is animated', () => {
	const gif = asset({ contentType: 'image/gif', format: 'gif', animated: true, url: 'https://abc.public.blob.vercel-storage.com/x.gif', filename: 'party.gif' })
	const root = staticChecks(renderBody({ asset: gif }), 'gif')
	eq(findNode(bySlot(root, 'detail-preview')[0], (n) => n.tag === 'img').attrs['data-unoptimized'], '1')
	eq(textOf(dd(root, 'Type')).replace(/\s+/g, ' ').trim(), 'GIF · animated')
	const still = asset({ contentType: 'image/gif', format: 'gif', animated: false })
	eq(findNode(bySlot(parseHtml(renderBody({ asset: still })), 'detail-preview')[0], (n) => n.tag === 'img').attrs['data-unoptimized'], '1', 'gif is never optimised, animated or not')
	const webp = asset({ contentType: 'image/webp', format: 'webp', animated: true })
	eq(findNode(bySlot(parseHtml(renderBody({ asset: webp })), 'detail-preview')[0], (n) => n.tag === 'img').attrs['data-unoptimized'], '1', 'an animated webp must not be flattened either')
})

await check('detail panel: transparency sits on a checkerboard so it reads as transparent, not as a hole', () => {
	const png = asset({ contentType: 'image/png', format: 'png', hasAlpha: true })
	const root = staticChecks(renderBody({ asset: png }), 'alpha')
	const box = bySlot(root, 'detail-preview')[0]
	eq(box.attrs['data-checkerboard'], 'true')
	ok(box.attrs.style.includes('conic-gradient'), 'a checker pattern is drawn')
	ok(!hasClass(box, 'bg-black/40'), 'not the plain backdrop')
	ok(findNode(box, (n) => n.tag === 'img').attrs.class.includes('object-contain'))
	eq(textOf(dd(root, 'Type')).replace(/\s+/g, ' ').trim(), 'PNG · transparent')
})

await check('detail panel: a failed tagging says so and what went wrong; a running one cannot be re-run', () => {
	const failedAsset = asset({ tagging: { status: 'failed', error: 'The AI service is unavailable.' } })
	const root = staticChecks(renderBody({ asset: failedAsset }), 'failed')
	const tagging = dd(root, 'Tagging')
	ok(textOf(tagging).includes('Tagging failed'))
	ok(textOf(tagging).includes('The AI service is unavailable.'))
	const retry = byTag(tagging, 'button').find((b) => textOf(b).includes('Auto-tag again'))
	ok(retry && !('disabled' in retry.attrs), 'a failed image can be tried again')
	for (const status of ['pending', 'running']) {
		const busy = parseHtml(renderBody({ asset: asset({ tagging: { status } }) }))
		const button = byTag(dd(busy, 'Tagging'), 'button').find((b) => textOf(b).includes('Auto-tag again'))
		ok('disabled' in button.attrs, `${status}: no second run while one is queued`)
	}
	const skipped = parseHtml(renderBody({ asset: asset({ tagging: { status: 'skipped', reason: 'not_configured' } }) }))
	ok(textOf(dd(skipped, 'Tagging')).includes('Not tagged'))
	ok(textOf(dd(skipped, 'Tagging')).includes('Auto-tagging is off.'))
})

await check('detail panel: Auto-tag again needs both AI and permission to write', () => {
	const names = (over) => buttonNames(parseHtml(renderBody(over)))
	ok(names({}).includes('Auto-tag again'))
	ok(!names({ aiConfigured: false }).includes('Auto-tag again'), 'no key, no button')
	ok(!names({ canWrite: false }).includes('Auto-tag again'), 'a viewer cannot re-run')
})

await check('detail panel: read-only has no field, no select, no tag box, no retag; tags still filter', () => {
	const root = staticChecks(renderBody({ canWrite: false, canDelete: false }), 'read-only')
	eq(byTag(root, 'textarea').length, 0)
	eq(findAllNodes(root, (n) => n.tag === 'input').length, 0)
	eq(findAllNodes(root, (n) => n.attrs.role === 'combobox').length, 0)
	const names = buttonNames(root)
	ok(!names.includes('Auto-tag again') && !names.includes('Delete'))
	ok(!names.some((n) => n.startsWith('Remove') || n.startsWith('Keep')))
	eq(chips(root).length, 4)
	ok(byTag(chips(root)[0], 'button').length === 1, 'a chip is still a filter button')
	ok(textOf(root).includes('Kitchen 1') && textOf(root).includes('A finished kitchen') && textOf(root).includes('Clients/Acme'))
	// A viewer still gets the harmless actions.
	ok(names.includes('Copy URL'))
	const empty = parseHtml(renderBody({ canWrite: false, asset: asset({ caption: '', altText: '', notes: '', tags: [] }) }))
	ok(textOf(empty).includes('No caption') && textOf(empty).includes('No alt text') && textOf(empty).includes('No notes') && textOf(empty).includes('No tags.'))
})

await check('detail panel: a viewer can still search by the image\'s folder, which is not an edit', () => {
	const root = staticChecks(renderBody({ canWrite: false }), 'read-only folder')
	const button = byTag(root, 'button').find((b) => b.attrs['aria-label'] === 'Show images in Clients/Acme')
	ok(button, 'a search button beside the folder path')
	const unfiled = parseHtml(renderBody({ canWrite: false, asset: asset({ folderId: null, folderPath: '' }) }))
	ok(!byTag(unfiled, 'button').some((b) => String(b.attrs['aria-label']).startsWith('Show images in')), 'nothing to search in the root')
	ok(textOf(unfiled).includes('No folder'))
})

await check('detail panel: delete is shown by canDelete alone, independent of canWrite', () => {
	const names = (over) => buttonNames(parseHtml(renderBody(over)))
	ok(names({ canWrite: true, canDelete: false }).every((n) => n !== 'Delete'), 'editable but not deletable')
	ok(names({ canWrite: false, canDelete: true }).includes('Delete'), 'deletable but not editable')
	ok(names({ canWrite: true, canDelete: true }).includes('Delete'))
	ok(!names({ canWrite: false, canDelete: false }).includes('Delete'))
})

await check('detail panel: hostile asset data cannot inject markup, scripts, styles or dangerous URLs', () => {
	const evil = asset({
		name: '<img src=x onerror=alert(1)>',
		caption: '"><script>alert(2)</script>',
		url: 'javascript:alert(3)',
		folderPath: '<i>x</i>',
		colors: [
			{ hex: 'red;background:url(//evil.example/x)', name: '<b>x</b>', share: 'NaN' },
			{ hex: '#12', name: 'ok', share: 5 },
			{ hex: '#00ff00', name: 'green', share: -2 },
			null,
			{ name: '', hex: '#fff' },
		],
		tags: [{ slug: 'x', label: '<script>alert(4)</script>', source: 'manual' }],
		tagging: { status: 'failed', error: '<script>alert(5)</script>' },
		blur: 'javascript:alert(6)',
		createdAt: 'not a date',
	})
	for (const canWrite of [true, false]) {
		const html = renderBody({ asset: evil, canWrite })
		ok(!html.includes('<script>') && !html.includes('<img src=x'), 'markup injected')
		ok(!/(href|src)="javascript:/i.test(html), 'javascript: URL')
		ok(!html.includes('//evil.example'), 'a hostile colour reached a style')
		ok(!/Invalid Date/.test(html), 'a broken timestamp must not print "Invalid Date"')
		const root = staticChecks(html, 'hostile', { skipNames: true })
		const buttons = buttonNames(root)
		ok(!buttons.includes('Copy URL') && !byTag(root, 'a').length, 'no link or copy for a URL that is not http(s)')
		const swatch = findAllNodes(bySlot(root, 'detail-palette')[0], (n) => n.tag === 'span' && n.attrs['aria-hidden'] === 'true')
		ok(swatch.every((s) => !s.attrs.style || /^background-color:#(?:[0-9a-f]{3,8});?$/i.test(s.attrs.style)), 'only hex colours may become a style')
	}
})

await check('detail panel: junk where lists and objects belong does not crash it', () => {
	const junk = asset({ tags: undefined, colors: null, tagging: undefined, name: undefined, caption: undefined, altText: undefined, notes: undefined, folderPath: undefined, kind: 5, orientation: undefined, format: undefined })
	for (const canWrite of [true, false]) throwsNothing(() => renderBody({ asset: junk, canWrite }), `canWrite=${canWrite}`)
	throwsNothing(() => renderBody({ folders: null }))
	throwsNothing(() => renderBody({ folders: [null, 5, {}, { id: 'x' }] }))
	throwsNothing(() => renderBody({ asset: asset({ width: Number.NaN, height: 0, bytes: -5 }) }))
	const root = parseHtml(renderBody({ asset: asset({ width: Number.NaN, height: 0, bytes: -5 }) }))
	eq(textOf(dd(root, 'Dimensions')).trim(), '—')
	eq(textOf(dd(root, 'File size')).trim(), '—')
})

await check('detail panel: paging shows "index+1 of count", disables the ends, and hides when the open image is not in the list', () => {
	const nav = (index, count) => parseHtml(renderToString(h(panel.DetailNav, { index, count, onPrev: noop, onNext: noop })))
	const mid = staticChecks(renderToString(h(panel.DetailNav, { index: 2, count: 40, onPrev: noop, onNext: noop })), 'nav')
	ok(textOf(mid).includes('3 of 40'))
	const prev = byTag(mid, 'button').find((b) => b.attrs['aria-label'] === 'Previous image')
	const next = byTag(mid, 'button').find((b) => b.attrs['aria-label'] === 'Next image')
	ok(prev && next && !('disabled' in prev.attrs) && !('disabled' in next.attrs))
	eq(prev.attrs['aria-keyshortcuts'], 'ArrowLeft')
	eq(next.attrs['aria-keyshortcuts'], 'ArrowRight')
	ok('disabled' in byTag(nav(0, 40), 'button').find((b) => b.attrs['aria-label'] === 'Previous image').attrs)
	ok('disabled' in byTag(nav(39, 40), 'button').find((b) => b.attrs['aria-label'] === 'Next image').attrs)
	ok(textOf(nav(0, 1)).includes('1 of 1'))
	ok(byTag(nav(0, 1), 'button').every((b) => 'disabled' in b.attrs), 'one image: nowhere to go')
	ok(textOf(nav(1234, 5000)).includes('1,235 of 5,000'), 'big numbers use separators')
	for (const [index, count] of [[-1, 40], [40, 40], [0, 0], [Number.NaN, 5], [1.5, 5], [0, -3]])
		eq(renderToString(h(panel.DetailNav, { index, count, onPrev: noop, onNext: noop })), '', `index=${index} count=${count}`)
})

/* ========================================================================== */
/* SSR: BulkTagDialog and TagManagerDialog                                    */
/* ========================================================================== */

const bulkProps = (over = {}) => ({
	count: 37,
	existing: [
		{ slug: 'kitchen', label: 'Kitchen', count: 12 },
		{ slug: 'van', label: 'Van', count: 3 },
	],
	fetchSuggestions: async () => [],
	onSubmit: asyncNoop,
	onClose: noop,
	busy: { current: false },
	...over,
})

await check('bulk dialog: open and closed wrappers render nothing server-side and do not crash', () => {
	for (const open of [true, false])
		eq(renderToString(h(bulk.BulkTagDialog, { open, onOpenChange: noop, count: 37, existing: [], fetchSuggestions: async () => [], onSubmit: asyncNoop })), '')
})

await check('bulk dialog: the form has an Add field, checkable existing tags with counts, and Apply disabled until something is entered', () => {
	const root = staticChecks(renderToString(h(bulk.BulkTagForm, bulkProps())), 'bulk form')
	const input = findNode(root, (n) => n.tag === 'input' && n.attrs.role === 'combobox')
	ok(input, 'the Add box is the same combobox as the editor')
	eq(accessibleName(input, root), 'Add tags', 'named by its visible label')
	const checkboxes = findAllNodes(root, (n) => n.tag === 'input' && n.attrs.type === 'checkbox')
	eq(checkboxes.length, 2)
	const items = byTag(root, 'label').filter((l) => findNode(l, (n) => n.attrs.type === 'checkbox'))
	eq(items.map((l) => textOf(l).replace(/\s+/g, ' ').trim()), ['Kitchen, 12 of 37', 'Van, 3 of 37'])
	ok(checkboxes.every((c) => !('checked' in c.attrs)), 'nothing is ticked at first')
	const apply = byTag(root, 'button').find((b) => textOf(b).trim() === 'Apply')
	ok('disabled' in apply.attrs, 'Apply starts disabled')
	eq(apply.attrs.type, 'submit')
	ok(byTag(root, 'button').some((b) => textOf(b).trim() === 'Cancel'))
	ok(textOf(root).includes('Up to 20 at a time'))
	// The typed-slug fallback is always there.
	ok(findNode(root, (n) => n.tag === 'input' && n.attrs.type === 'text' && n.attrs.id?.endsWith('-remove')))
})

await check('bulk dialog: with nothing to list, Remove explains and the typed fallback remains', () => {
	const root = staticChecks(renderToString(h(bulk.BulkTagForm, bulkProps({ existing: [] }))), 'no existing')
	eq(findAllNodes(root, (n) => n.attrs.type === 'checkbox').length, 0)
	ok(textOf(root).includes('Type one below to remove it'))
	ok(findNode(root, (n) => n.attrs.id?.endsWith('-remove')))
})

await check('bulk dialog: the count line says what the action applies to', () => {
	eq(bulk.applyCountLine(37), 'Applies to 37 images')
	eq(bulk.applyCountLine(1), 'Applies to 1 image')
	eq(bulk.applyCountLine(1234), 'Applies to 1,234 images')
	for (const bad of [0, -3, Number.NaN, Infinity, undefined, null, '5']) eq(bulk.applyCountLine(bad), 'Applies to 0 images', `count=${String(bad)}`)
})

const mgrActions = (over = {}) => new Proxy(over, { get: (target, key) => (key in target ? target[key] : noop) })
const mgrView = (state, over = {}) =>
	renderToString(h(manager.TagManagerView, { state, canEdit: true, canDelete: true, actions: mgrActions(), ...over }))
const readyState = (tags, over = {}) => ({
	...manager.initialManager(),
	load: { status: 'ready', tags, refreshing: false, refreshError: null },
	...over,
})

await check('tag manager: dialog wrappers render nothing server-side and do not crash', () => {
	for (const open of [true, false])
		eq(renderToString(h(manager.TagManagerDialog, { open, onOpenChange: noop, canEdit: true, canDelete: true, fetchTags: async () => [], onRename: async () => ({ slug: 'x', merged: false }), onMerge: asyncNoop, onDelete: asyncNoop, onFilter: noop })), '')
})

await check('tag manager: the real container renders its loading state first, and does not fetch while rendering on a server', () => {
	let fetched = 0
	const html = renderToString(h(manager.TagManagerBody, { canEdit: true, canDelete: true, busy: { current: false }, onClose: noop, onFilter: noop, onRename: async () => ({ slug: 'x', merged: false }), onMerge: asyncNoop, onDelete: asyncNoop, fetchTags: () => { fetched++; return Promise.resolve([]) } }))
	const root = staticChecks(html, 'body loading')
	eq(byRole(root, 'status')[0].attrs['aria-busy'], 'true')
	eq(byTag(root, 'table').length, 0)
	eq(fetched, 0, 'effects do not run on a server: the load starts in the browser')
})

await check('tag manager: loading shows a skeleton that is announced, with no rows', () => {
	const root = staticChecks(mgrView(manager.initialManager()), 'loading')
	const status = byRole(root, 'status')[0]
	eq(status.attrs['aria-busy'], 'true')
	ok(textOf(status).includes('Loading your tags'))
	ok(bySlot(root, 'skeleton').length >= 3)
	eq(byTag(root, 'table').length, 0)
	ok(bySlot(root, 'skeleton').every((s) => s.parent.attrs['aria-hidden'] === 'true'), 'skeletons are hidden from assistive tech')
})

await check('tag manager: a failed load shows the message and a retry, never an empty list', () => {
	const root = staticChecks(mgrView({ ...manager.initialManager(), load: { status: 'error', message: 'Could not load your tags.' } }), 'error')
	const alert = byRole(root, 'alert')[0]
	ok(textOf(alert).includes('Could not load your tags.'))
	ok(byTag(alert, 'button').some((b) => textOf(b).includes('Try again')))
	eq(byTag(root, 'table').length, 0)
	ok(!textOf(root).includes('No tags yet'), 'a network failure must not read as "no tags"')
	const evil = parseHtml(mgrView({ ...manager.initialManager(), load: { status: 'error', message: '<script>alert(1)</script>' } }))
	ok(!renderToString(h(manager.TagManagerView, { state: { ...manager.initialManager(), load: { status: 'error', message: '<script>alert(1)</script>' } }, canEdit: true, canDelete: true, actions: mgrActions() })).includes('<script>'))
	ok(textOf(evil).includes('<script>alert(1)</script>'))
})

await check('tag manager: an empty library says so and teaches', () => {
	const root = staticChecks(mgrView(readyState([])), 'empty')
	ok(textOf(bySlot(root, 'tag-manager-empty')[0]).includes('No tags yet'))
	eq(byTag(root, 'table').length, 0)
})

await check('tag manager: the table lists label, total, and the manual/automatic split, with per-row actions', () => {
	const tags = [
		stat('Kitchen', 214, { manual: 200, auto: 14 }),
		stat('Van', 40, { manual: 5, auto: 35 }),
		stat('Remodel', 3, { manual: 3, auto: 0 }),
	]
	const root = staticChecks(mgrView(readyState(tags)), 'list')
	const rows = bySlot(root, 'tag-row')
	eq(rows.map((r) => r.attrs['data-slug']), ['kitchen', 'van', 'remodel'], 'most images first')
	const cells = (r) => byTag(r, 'td').map((c) => textOf(c).replace(/\s+/g, ' ').trim())
	eq(cells(rows[0]).slice(0, 2), ['214', '200 manual · 14 automatic'])
	eq(cells(rows[1]).slice(0, 2), ['40', '5 manual · 35 automatic'])
	eq(textOf(findNode(rows[2], (n) => n.tag === 'th')).trim(), 'Remodel')
	for (const row of rows) {
		const names = byTag(row, 'button').map((b) => accessibleName(b, root))
		eq(names.length, 4)
		const label = textOf(findNode(row, (n) => n.tag === 'th')).trim()
		eq(names, [`Show images tagged "${label}"`, `Rename "${label}"`, `Merge "${label}" into another tag`, `Delete "${label}"`])
	}
	// Visible button text, as the spec words it.
	eq(byTag(rows[0], 'button').map((b) => textOf(b).trim()), ['Show images', 'Rename', 'Merge into…', 'Delete'])
	ok(textOf(root).includes('3 tags'))
	// Sorting: column headers are the controls, and the sorted one says so.
	const heads = byTag(root, 'th').filter((t) => t.attrs.scope === 'col')
	eq(heads.find((t) => textOf(t).includes('Images')).attrs['aria-sort'], 'descending')
	eq(heads.find((t) => textOf(t).includes('Tag')).attrs['aria-sort'], 'none')
	const az = parseHtml(mgrView(readyState(tags, { sort: 'az' })))
	eq(bySlot(az, 'tag-row').map((r) => r.attrs['data-slug']), ['kitchen', 'remodel', 'van'])
	eq(byTag(az, 'th').find((t) => t.attrs.scope === 'col' && textOf(t).includes('Tag')).attrs['aria-sort'], 'ascending')
	// Search box.
	ok(findNode(root, (n) => n.tag === 'input' && n.attrs.type === 'search'))
})

await check('tag manager: what a person may do follows permission, and a viewer sees only "Show images"', () => {
	const tags = [stat('Kitchen', 5)]
	const names = (props) => byTag(bySlot(parseHtml(mgrView(readyState(tags), props)), 'tag-row')[0], 'button').map((b) => textOf(b).trim())
	eq(names({ canEdit: true, canDelete: true }), ['Show images', 'Rename', 'Merge into…', 'Delete'])
	eq(names({ canEdit: true, canDelete: false }), ['Show images', 'Rename', 'Merge into…'])
	eq(names({ canEdit: false, canDelete: true }), ['Show images', 'Delete'])
	eq(names({ canEdit: false, canDelete: false }), ['Show images'])
})

await check('tag manager: a search with no match says what was searched and offers to clear it', () => {
	const root = staticChecks(mgrView(readyState([stat('Kitchen', 5)], { query: 'zzz' })), 'no match')
	const box = bySlot(root, 'tag-manager-no-match')[0]
	ok(textOf(box).includes('No tags match "zzz"'))
	ok(byTag(box, 'button').some((b) => textOf(b).includes('Clear search')))
	eq(byTag(root, 'table').length, 0)
	ok(textOf(root).includes('0 of 1 tag'))
})

await check('tag manager: a reload keeps the rows on screen and says it is updating; a failed reload keeps them and offers Reload', () => {
	const tags = [stat('Kitchen', 5)]
	const refreshing = staticChecks(mgrView(readyState(tags, { load: { status: 'ready', tags, refreshing: true, refreshError: null } })), 'refreshing')
	eq(bySlot(refreshing, 'tag-row').length, 1)
	ok(textOf(refreshing).includes('Updating'))
	ok(byTag(bySlot(refreshing, 'tag-row')[0], 'button').filter((b) => ['Rename', 'Merge into…', 'Delete'].some((t) => textOf(b).includes(t))).every((b) => 'disabled' in b.attrs), 'no new change while it reloads')
	const failedReload = staticChecks(mgrView(readyState(tags, { load: { status: 'ready', tags, refreshing: false, refreshError: 'Could not load your tags.' } })), 'failed reload')
	eq(bySlot(failedReload, 'tag-row').length, 1)
	ok(textOf(byRole(failedReload, 'alert')[0]).includes('Could not load your tags.'))
	ok(byTag(byRole(failedReload, 'alert')[0], 'button').some((b) => textOf(b).includes('Reload')))
})

await check('tag manager: a change reads back as a notice with a dismiss', () => {
	const root = staticChecks(mgrView(readyState([stat('Kitchen', 5)], { notice: 'Merged into "Kitchen".' })), 'notice')
	const notice = bySlot(root, 'tag-manager-notice')[0]
	ok(textOf(notice).includes('Merged into "Kitchen".'))
	eq(notice.attrs.role, 'status')
	ok(byTag(notice, 'button').some((b) => b.attrs['aria-label'] === 'Dismiss message'))
})

await check('tag manager: renaming into an existing tag is explained as a merge BEFORE it happens', () => {
	const tags = [stat('Kitchen', 214), stat('Kitchens', 12)]
	const row = { mode: 'rename', slug: 'kitchens', draft: 'kitchen', busy: false, error: null }
	const root = staticChecks(mgrView(readyState(tags, { row })), 'rename collision')
	const editorRow = bySlot(root, 'tag-row-editor')[0]
	eq(editorRow.attrs['data-mode'], 'rename')
	const note = findNode(editorRow, (n) => n.attrs['data-impact'])
	eq(note.attrs['data-impact'], 'merge')
	ok(textOf(note).includes('already exists'))
	ok(textOf(note).includes('merges "Kitchens" into it'))
	ok(textOf(note).includes('214 images') && textOf(note).includes('12 images'))
	const save = byTag(editorRow, 'button').find((b) => b.attrs.type === 'submit')
	eq(textOf(save).trim(), 'Merge', 'the button says what will happen')
	ok(!('disabled' in save.attrs))
	// A plain rename says Save, and a no-op cannot be saved.
	const plain = parseHtml(mgrView(readyState(tags, { row: { ...row, draft: 'Kitchenette' } })))
	eq(textOf(byTag(bySlot(plain, 'tag-row-editor')[0], 'button').find((b) => b.attrs.type === 'submit')).trim(), 'Save')
	eq(findNode(bySlot(plain, 'tag-row-editor')[0], (n) => n.attrs['data-impact']).attrs['data-impact'], 'rename')
	const same = parseHtml(mgrView(readyState(tags, { row: { ...row, draft: 'Kitchens' } })))
	ok('disabled' in byTag(bySlot(same, 'tag-row-editor')[0], 'button').find((b) => b.attrs.type === 'submit').attrs)
	const bad = parseHtml(mgrView(readyState(tags, { row: { ...row, draft: '!!!' } })))
	ok('disabled' in byTag(bySlot(bad, 'tag-row-editor')[0], 'button').find((b) => b.attrs.type === 'submit').attrs)
	ok(textOf(findNode(bySlot(bad, 'tag-row-editor')[0], (n) => n.attrs['data-impact'])).includes('at least one letter or number'))
})

await check('tag manager: a rename editor is labelled, can be cancelled, and shows a server error inline', () => {
	const tags = [stat('Kitchen', 214)]
	const row = { mode: 'rename', slug: 'kitchen', draft: 'Kitchen', busy: false, error: 'A tag with that name already exists.' }
	const root = staticChecks(mgrView(readyState(tags, { row })), 'rename editor')
	const form = bySlot(root, 'tag-row-editor')[0]
	ok(textOf(byTag(form, 'label')[0]).includes('New name for "Kitchen"'))
	ok(byTag(form, 'button').some((b) => textOf(b).trim() === 'Cancel'))
	ok(textOf(byRole(form, 'alert')[0]).includes('A tag with that name already exists.'))
	const busy = parseHtml(mgrView(readyState(tags, { row: { ...row, busy: true, error: null, draft: 'Kitchens' } })))
	const editorRow = bySlot(busy, 'tag-row-editor')[0]
	ok('disabled' in findNode(editorRow, (n) => n.tag === 'input').attrs, 'locked while the change runs')
	ok(byTag(editorRow, 'button').every((b) => 'disabled' in b.attrs))
	eq(findNode(editorRow, (n) => n.attrs.type === 'submit').attrs['aria-busy'], 'true')
})

await check('tag manager: the merge picker is a combobox of the OTHER tags, and a chosen target is explained before confirming', () => {
	const tags = [stat('Van', 40), stat('Truck', 90), stat('Car', 7)]
	const row = { mode: 'merge', slug: 'van', query: '', target: null, busy: false, error: null }
	const root = staticChecks(mgrView(readyState(tags, { row })), 'merge picker')
	const form = bySlot(root, 'tag-row-editor')[0]
	eq(form.attrs['data-mode'], 'merge')
	const combo = findNode(form, (n) => n.attrs.role === 'combobox')
	eq(combo.attrs['aria-expanded'], 'true')
	eq(combo.attrs['aria-autocomplete'], 'list')
	const options = byRole(form, 'option')
	eq(options.map((o) => textOf(o).replace(/\s+/g, ' ').trim()), ['Truck (90)', 'Car (7)'], 'never itself, most used first')
	ok(!options.some((o) => textOf(o).includes('Van')))
	ok('disabled' in byTag(form, 'button').find((b) => b.attrs.type === 'submit').attrs, 'Merge waits for a target')
	const chosen = parseHtml(mgrView(readyState(tags, { row: { ...row, target: 'truck' } })))
	const picked = bySlot(chosen, 'tag-row-editor')[0]
	eq(findAllNodes(picked, (n) => n.attrs.role === 'combobox').length, 0, 'the picker gives way to the choice')
	const note = findNode(picked, (n) => n.attrs['data-impact'])
	ok(textOf(note).includes('The 40 images tagged "Van" will be tagged "Truck" instead'))
	ok(!('disabled' in byTag(picked, 'button').find((b) => b.attrs.type === 'submit').attrs))
	const none = parseHtml(mgrView(readyState([stat('Van', 40)], { row })))
	ok(textOf(bySlot(none, 'tag-row-editor')[0]).includes('There are no other tags to merge into.'))
	const nothing = parseHtml(mgrView(readyState(tags, { row: { ...row, query: 'zzz' } })))
	ok(textOf(bySlot(nothing, 'tag-row-editor')[0]).includes('No other tag matches.'))
})

await check('tag manager: more than a page of rows shows a page and "Show more"', () => {
	const tags = Array.from({ length: 250 }, (_, i) => stat(`Tag ${String(i + 1).padStart(3, '0')}`, 1000 - i))
	const root = staticChecks(mgrView(readyState(tags)), 'paged')
	eq(bySlot(root, 'tag-row').length, manager.ROWS_PER_PAGE)
	const more = byTag(root, 'button').find((b) => textOf(b).includes('more'))
	ok(textOf(more).includes('Show 100 more (150 left)'))
	const all = parseHtml(mgrView(readyState(tags, { shown: 250 })))
	eq(bySlot(all, 'tag-row').length, 250)
	ok(!byTag(all, 'button').some((b) => textOf(b).includes('more')))
})

await check('tag manager: hostile tag data is escaped and junk rows are dropped', () => {
	const html = mgrView(readyState([{ slug: 'x', label: '<script>alert(1)</script>', count: 1, manual: 1, auto: 0 }, null, 5, { slug: 'x', label: 'dup', count: 9 }, { slug: 'n', label: 'N', count: Number.NaN, manual: -4, auto: 'x' }]))
	ok(!html.includes('<script>'))
	const root = parseHtml(html)
	eq(bySlot(root, 'tag-row').map((r) => r.attrs['data-slug']), ['x', 'n'])
	eq(byTag(bySlot(root, 'tag-row')[1], 'td').map((c) => textOf(c).replace(/\s+/g, ' ').trim()).slice(0, 2), ['0', '0 manual · 0 automatic'])
})

/* ========================================================================== */
/* Pure: parsing what was typed                                               */
/* ========================================================================== */

const {
	parseTagInput,
	describeParse,
	rankTagSuggestions,
	stemKey,
	filterStaleStats,
	sanitizeTagStats,
	createTagSuggestionController,
	decideTagKey,
	nextTagActive,
	tagOpsReducer,
	initialTagOps,
	projectTags,
	createSerialQueue,
	orderTags,
	sanitizeTags,
	confidencePercent,
	chipTitle,
	existingOf,
	cleanTagLabel,
	splitTagList,
	hasTagSeparator,
	isTypingTarget,
	escapeBelongsToList,
	messageOf,
} = editor

const labelsOf = (text, options) => parseTagInput(text, options).labels
const codePointCount = (text) => Array.from(text).length

await check('parse: a comma list is one label per entry, in the order typed', () => {
	eq(parseTagInput('a, b, c'), { labels: ['a', 'b', 'c'], duplicates: [], rejected: [], deferred: [], leftover: [], truncated: false })
	eq(labelsOf('kitchen,remodel ,  before '), ['kitchen', 'remodel', 'before'])
	eq(labelsOf('iPhone, Café'), ['iPhone', 'Café'], 'case and accents are kept as typed')
	eq(labelsOf('single'), ['single'])
})

await check('parse: whitespace is trimmed and collapsed, blank entries vanish', () => {
	eq(labelsOf('  kitchen   remodel  '), ['kitchen remodel'])
	eq(labelsOf('a ,  , b,   ,'), ['a', 'b'])
	for (const blank of ['', '   ', ',', ',,, ,', '\n\n', '\t', ' , \n , '])
		eq(parseTagInput(blank), { labels: [], duplicates: [], rejected: [], deferred: [], leftover: [], truncated: false }, JSON.stringify(blank))
	eq(labelsOf('  a  b  '), ['a b'], 'a non-breaking space collapses too')
})

await check('parse: commas of every script, tabs and line breaks all end a tag (a pasted column or row is a list)', () => {
	eq(labelsOf('日本，台所、キッチン'), ['日本', '台所', 'キッチン'])
	eq(labelsOf('a\tb\tc'), ['a', 'b', 'c'], 'a spreadsheet row')
	eq(labelsOf('a\nb\r\nc'), ['a', 'b', 'c'], 'a spreadsheet column')
	eq(labelsOf('\t kitchen \n remodel\r\nbefore'), ['kitchen', 'remodel', 'before'])
	ok(hasTagSeparator('a,b') && hasTagSeparator('a\nb') && hasTagSeparator('a，b') && hasTagSeparator('a\tb'))
	ok(!hasTagSeparator('kitchen remodel') && !hasTagSeparator(''))
	eq(splitTagList('a,,b'), ['a', '', 'b'], 'the raw split keeps empties; callers decide')
})

await check('parse: the same tag twice in one go is one tag, however it is spelled', () => {
	eq(parseTagInput('Kitchen, kitchen, KITCHEN, Kitchen!, KiTcHeN'), { labels: ['Kitchen'], duplicates: [], rejected: [], deferred: [], leftover: [], truncated: false })
	eq(labelsOf('Straße, strasse, STRASSE'), ['Straße'], 'ß folds to ss, as the slug does')
	eq(labelsOf('Kitchen Remodel, kitchen-remodel'), ['Kitchen Remodel'])
})

await check('parse: a duplicate of a manual chip is dropped and reported, whatever its case or punctuation', () => {
	const existing = new Map([['kitchen', 'manual'], ['strasse', 'manual']])
	eq(parseTagInput('KITCHEN', { existing }), { labels: [], duplicates: ['KITCHEN'], rejected: [], deferred: [], leftover: [], truncated: false })
	eq(parseTagInput('Kitchen!, remodel', { existing }).duplicates, ['Kitchen!'])
	eq(labelsOf('Kitchen!, remodel', { existing }), ['remodel'])
	eq(parseTagInput('Straße', { existing }).duplicates, ['Straße'])
	eq(parseTagInput('kitchen, KITCHEN', { existing }).duplicates, ['kitchen'], 'repeats of the duplicate are not reported twice')
})

await check('parse: typing an automatic tag that is already there keeps it (adding is how a tag is kept), and takes no room', () => {
	const existing = new Map([['kitchen', 'auto']])
	eq(labelsOf('Kitchen', { existing }), ['Kitchen'])
	eq(parseTagInput('Kitchen', { existing }).duplicates, [])
	const full = parseTagInput('Kitchen, Other', { existing, room: 0 })
	eq(full.labels, ['Kitchen'], 'promoting adds no new tag, so a full image can still keep it')
	eq(full.deferred, [{ text: 'Other', reason: 'room' }])
})

await check('parse: the 40 character limit counts characters, not UTF-16 units, as the schema does', () => {
	eq(labelsOf('a'.repeat(40)), ['a'.repeat(40)])
	const long = parseTagInput('a'.repeat(41))
	eq(long.labels, [])
	eq(long.rejected, [{ text: 'a'.repeat(41), reason: 'too-long' }])
	eq(long.leftover, ['a'.repeat(41)], 'a rejected entry stays in the box to be fixed')
	eq(labelsOf(`ok, ${'a'.repeat(41)}`), ['ok'], 'the valid ones still go')
	eq(labelsOf(`   ${'a'.repeat(40)}   `), ['a'.repeat(40)], 'spaces around do not count')
	// A letter outside the BMP is one character but two UTF-16 units: the schema counts characters.
	eq(labelsOf('𠀀'.repeat(40)).length, 1, '40 such letters are 40 characters (80 UTF-16 units)')
	eq(parseTagInput('𠀀'.repeat(41)).rejected.length, 1)
	ok(assetPatchSchema.safeParse({ addTags: ['𠀀'.repeat(40)] }).success, 'the schema agrees')
	ok(!assetPatchSchema.safeParse({ addTags: ['𠀀'.repeat(41)] }).success)
	// An emoji is not a letter or a number, so it cannot be a tag's identity.
	eq(parseTagInput('\u{1f600}').rejected, [{ text: '\u{1f600}', reason: 'no-letters' }])
})

await check('parse: at most 20 labels per call, the rest stay for the next Enter', () => {
	const text = Array.from({ length: 25 }, (_, i) => `tag ${i + 1}`).join(', ')
	const parsed = parseTagInput(text)
	eq(parsed.labels, Array.from({ length: 20 }, (_, i) => `tag ${i + 1}`))
	eq(parsed.deferred.map((d) => d.reason), ['per-call', 'per-call', 'per-call', 'per-call', 'per-call'])
	eq(parsed.leftover, ['tag 21', 'tag 22', 'tag 23', 'tag 24', 'tag 25'])
	ok(assetPatchSchema.safeParse({ addTags: parsed.labels }).success, 'exactly what the schema allows')
	eq(parseTagInput(Array.from({ length: 20 }, (_, i) => `t${i}`).join(',')).deferred, [], 'exactly 20 is fine')
	eq(labelsOf('a,b,c,d,e,f', { perCall: 5 }).length, 5)
	eq(labelsOf(text, { perCall: 500 }).length, 20, 'never above the schema cap')
	eq(labelsOf('a,b,c', { perCall: 0 }).length, 1, 'at least one')
	eq(labelsOf(text, { perCall: Number.NaN }).length, 20)
	eq(labelsOf(text, { perCall: -4 }).length, 1)
})

await check('parse: an image holds 40 tags, so only the room that is left is used', () => {
	const parsed = parseTagInput('a,b,c,d,e', { room: 2 })
	eq(parsed.labels, ['a', 'b'])
	eq(parsed.deferred, [{ text: 'c', reason: 'room' }, { text: 'd', reason: 'room' }, { text: 'e', reason: 'room' }])
	eq(labelsOf('a,b', { room: 0 }), [])
	eq(labelsOf('a,b', { room: -5 }), [])
	eq(labelsOf('a,b', { room: Number.NaN }), [], 'a NaN room is no room, never "unlimited"')
	eq(labelsOf('a,b', { room: Infinity }), ['a', 'b'])
	eq(labelsOf('a,b', {}), ['a', 'b'])
	eq(labelsOf('a,b,c', { room: 1.9 }), ['a'], 'a fractional room is rounded down to whole tags')
})

await check('parse: text with no letter or number cannot be a tag, but digits can', () => {
	const parsed = parseTagInput('!!!, ---, ok, 123, ¿?')
	eq(parsed.labels, ['ok', '123'])
	eq(parsed.rejected.map((r) => [r.text, r.reason]), [['!!!', 'no-letters'], ['---', 'no-letters'], ['¿?', 'no-letters']])
	eq(parsed.leftover, ['!!!', '---', '¿?'])
})

await check('parse: invisible and direction-changing characters never reach a label', () => {
	eq(labelsOf('a‮b\u0000c​d'), ['abcd'])
	eq(labelsOf('kit\u0007chen'), ['kitchen'])
	eq(labelsOf('​​'), [], 'only invisible characters is nothing')
	eq(labelsOf('a⁦b⁩'), ['ab'])
	eq(cleanTagLabel('  x\u0000  y  '), 'x y')
	eq(cleanTagLabel(undefined), '')
	eq(cleanTagLabel(5), '')
})

await check('parse: hostile input is bounded and cannot hang or throw', () => {
	for (const bad of [undefined, null, 5, {}, [], Symbol.iterator, () => 1]) throwsNothing(() => parseTagInput(bad), String(bad))
	eq(labelsOf(undefined), [])
	const t0 = performance.now()
	const huge = parseTagInput('x,'.repeat(5_000_000))
	ok(huge.truncated, 'a 10 MB paste is cut, and says so')
	eq(huge.labels, ['x'])
	const distinct = parseTagInput(Array.from({ length: 100_000 }, (_, i) => `tag${i}`).join(','))
	ok(distinct.truncated)
	eq(distinct.labels.length, 20)
	ok(distinct.leftover.length <= 200, `leftover is bounded, got ${distinct.leftover.length}`)
	const longRun = parseTagInput('a'.repeat(9_000_000))
	eq(longRun.rejected.length, 1)
	ok(performance.now() - t0 < 1500, `took ${Math.round(performance.now() - t0)}ms`)
	eq(labelsOf('constructor, __proto__, toString, hasOwnProperty'), ['constructor', '__proto__', 'toString', 'hasOwnProperty'], 'object keys are ordinary words')
	const existing = new Map()
	eq(labelsOf('__proto__', { existing }), ['__proto__'])
})

await check('parse: every label it returns passes the real schema (property check over 3000 hostile strings)', () => {
	let seed = 0x9e3779b9
	const rnd = () => {
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const alphabet = ['a', 'B', 'z', '0', '9', ' ', '  ', ',', ',', '，', '、', '\n', '\t', '!', '-', '_', '\u{1f600}', '\u{1f468}‍\u{1f469}‍\u{1f467}', 'é', 'é', 'ß', '日', '𠀀', 'ا', '‮', '​', '\u0000', '\u0007', 'İ', 'Σ', 'ǅ', '\ud800', '\udfff', 'x'.repeat(30), 'y'.repeat(12)]
	let checked = 0
	for (let i = 0; i < 3000; i++) {
		let text = ''
		const n = Math.floor(rnd() * 40)
		for (let j = 0; j < n; j++) text += alphabet[Math.floor(rnd() * alphabet.length)]
		const existing = new Map(rnd() < 0.5 ? [['a', 'manual'], ['b', 'auto']] : [])
		const parsed = parseTagInput(text, { existing, room: rnd() < 0.3 ? Math.floor(rnd() * 5) : Infinity })
		ok(parsed.labels.length <= 20, 'cap')
		const slugs = new Set()
		for (const label of parsed.labels) {
			ok(label === label.trim() && label.length > 0, `untrimmed or empty: ${JSON.stringify(label)}`)
			ok(!/[\u0000-\u001f\u007f​‪-‮⁦-⁩]/.test(label), `invisible in ${JSON.stringify(label)}`)
			ok(codePointCount(label) <= 40, 'length')
			const slug = slugify(label)
			ok(slug !== '' && !slugs.has(slug), `empty or repeated slug for ${JSON.stringify(label)}`)
			slugs.add(slug)
		}
		const parsedAgain = parseTagInput(parsed.labels.join(', '), { existing, room: Infinity })
		eq(parsedAgain.labels.length <= parsed.labels.length, true)
		if (parsed.labels.length > 0) {
			const verdict = assetPatchSchema.safeParse({ addTags: parsed.labels })
			ok(verdict.success, `schema refused ${JSON.stringify(parsed.labels)}: ${verdict.error?.message?.slice(0, 80)}`)
			checked++
		}
		for (const left of parsed.leftover) ok(left.length > 0, 'an empty leftover')
	}
	ok(checked > 1000, `only ${checked} inputs produced labels`)
})

await check('describe: clean input says nothing; the rest says why in a sentence', () => {
	eq(describeParse(parseTagInput('a, b')), null)
	eq(describeParse(parseTagInput('KITCHEN', { existing: new Map([['kitchen', 'manual']]) })), { tone: 'info', text: '"KITCHEN" is already on this image.' })
	eq(describeParse(parseTagInput('a, b, c', { existing: new Map([['a', 'manual'], ['b', 'manual'], ['c', 'manual']]) })), { tone: 'info', text: '3 of those are already on this image.' })
	eq(describeParse(parseTagInput('a', { existing: new Map([['a', 'manual']]) }), 'batch').text, '"a" is already in the list.')
	const tooLong = describeParse(parseTagInput('x'.repeat(41)))
	eq(tooLong.tone, 'error')
	ok(tooLong.text.includes('longer than 40 characters'))
	ok(describeParse(parseTagInput(`${'x'.repeat(41)}, ${'y'.repeat(50)}`)).text.includes('2 tags are longer than 40 characters'))
	ok(describeParse(parseTagInput('!!!')).text.includes('needs at least one letter or number'))
	ok(describeParse(parseTagInput('!!!, ???')).text.includes('2 entries need at least one letter or number'))
	const many = describeParse(parseTagInput(Array.from({ length: 22 }, (_, i) => `t${i}`).join(',')))
	ok(many.text.includes('up to 20 tags at a time') && many.text.includes('2 are still in the box'))
	ok(describeParse(parseTagInput('a,b', { perCall: 1 })).text.includes('One is still in the box'))
	ok(describeParse(parseTagInput('a,b,c', { room: 1 })).text.includes('An image holds up to 40 tags'))
	ok(describeParse(parseTagInput('a,b,c', { room: 1 }), 'batch').text.includes('up to 20 tags at a time'))
	ok(describeParse(parseTagInput('x,'.repeat(5_000_000))).text.includes('first 200'))
	eq(describeParse(parseTagInput(`${'z'.repeat(100)}`)).text.match(/"([^"]*)"/)[1].length, 40, 'a long label is clipped in the message')
	const both = describeParse(parseTagInput(`${'x'.repeat(41)}, kitchen`, { existing: new Map([['kitchen', 'manual']]) }))
	eq(both.tone, 'error', 'a problem outranks a duplicate')
})

/* ========================================================================== */
/* Pure: suggestions                                                          */
/* ========================================================================== */

await check('stem key: the spelling variants of one idea share it, per hyphen-separated word', () => {
	eq(stemKey('kitchens'), stemKey('kitchen'))
	eq(stemKey('kitchen-remodels'), 'kitchen-remodel')
	eq(stemKey('remodeling'), stemKey('remodel'))
	eq(stemKey('vans'), stemKey('van'))
	eq(stemKey('日本'), '日本', 'other scripts pass through')
	eq(stemKey('x2-y'), 'x2-y')
	eq(stemKey(''), '')
	ok(stemKey('kitchen') !== stemKey('chicken'))
	for (const word of ['dogs', 'running', 'painted', 'boxes', 'bunnies', 'children', 'a-b-c', 'The-End'])
		eq(stemKey(word), word.split('-').map((w) => stem(w)).join('-'), `the rule "stem each word": ${word}`)
})

await check('suggest: typing "Kitchens" with "Kitchen" in the library puts Use "Kitchen" first, highlighted, then Create "Kitchens"', () => {
	const ranked = rankTagSuggestions('Kitchens', [stat('Kitchen remodel', 40), stat('Kitchen', 214), stat('Chicken', 2)])
	eq(ranked.options.map((o) => [o.kind, o.label]), [['use', 'Kitchen'], ['create', 'Kitchens'], ['tag', 'Kitchen remodel'], ['tag', 'Chicken']])
	eq(ranked.options[0].count, 214)
	eq(ranked.defaultIndex, 0, 'highlighted by default')
	eq(ranked.options[0].slug, 'kitchen')
	eq(ranked.options[1].key, 'create')
})

await check('suggest: two different tags that share a stem are never guessed between', () => {
	const ranked = rankTagSuggestions('vanning', [stat('Van', 10), stat('Vans', 3)])
	eq(ranked.options.map((o) => [o.kind, o.label]), [['create', 'vanning'], ['tag', 'Van'], ['tag', 'Vans']], 'no Use row')
	eq(ranked.defaultIndex, -1, 'nothing is highlighted')
	eq(stemKey('vanning'), stemKey('van'))
	eq(stemKey('van'), stemKey('vans'))
	// With one of them gone it is unambiguous again.
	eq(rankTagSuggestions('vanning', [stat('Van', 10)]).options[0].kind, 'use')
})

await check('suggest: the exact tag comes first under its own spelling, with no Create row', () => {
	const ranked = rankTagSuggestions('KITCHEN!', [stat('Kitchen remodel', 40), stat('Kitchen', 214)])
	eq(ranked.options.map((o) => [o.kind, o.label]), [['tag', 'Kitchen'], ['tag', 'Kitchen remodel']])
	eq(ranked.defaultIndex, 0)
	// An exact match beats a stem-mate: it is not fragmentation to type a tag that exists.
	const both = rankTagSuggestions('kitchen', [stat('Kitchens', 3), stat('Kitchen', 214)])
	eq(both.options.map((o) => o.label), ['Kitchen', 'Kitchens'])
	ok(both.options.every((o) => o.kind !== 'create' && o.kind !== 'use'))
})

await check('suggest: with nothing close, Create comes first and nothing is highlighted', () => {
	const ranked = rankTagSuggestions('kit', [stat('Kitchen', 214), stat('Kitten', 3)])
	eq(ranked.options.map((o) => [o.kind, o.label]), [['create', 'kit'], ['tag', 'Kitchen'], ['tag', 'Kitten']], 'the server order is kept')
	eq(ranked.defaultIndex, -1)
	eq(rankTagSuggestions('zebra', []).options, [{ key: 'create', kind: 'create', label: 'zebra' }])
	eq(rankTagSuggestions('zebra', []).defaultIndex, -1)
})

await check('suggest: stems are compared across whole phrases, word by word', () => {
	const ranked = rankTagSuggestions('Kitchens remodels', [stat('Kitchen remodel', 7)])
	eq(ranked.options[0].kind, 'use')
	eq(ranked.options[0].slug, 'kitchen-remodel')
	eq(rankTagSuggestions('kitchen remodels', [stat('Kitchens remodel', 7)]).options[0].kind, 'use', 'either way round')
	eq(rankTagSuggestions('kitchen sink', [stat('Kitchen remodel', 7)]).options[0].kind, 'create', 'a different second word is a different tag')
})

await check('suggest: a tag already on the image reads as present, so choosing it cannot double-add', () => {
	const ranked = rankTagSuggestions('Kitchens', [stat('Kitchen', 214)], new Map([['kitchen', 'manual']]))
	eq(ranked.options[0].present, true)
	eq(ranked.options[1].kind, 'create')
	const auto = rankTagSuggestions('Kitchens', [stat('Kitchen', 214)], new Map([['kitchen', 'auto']]))
	eq(auto.options[0].present, false, 'an automatic tag can still be kept by choosing it')
})

await check('suggest: no rows for text that cannot be a tag; never more than eight; hostile replies are inert', () => {
	for (const text of ['', '   ', '!!!', 'x'.repeat(41), undefined, null, 5])
		eq(rankTagSuggestions(text, [stat('Kitchen', 1)]), { options: [], defaultIndex: -1 }, String(text))
	const many = Array.from({ length: 1000 }, (_, i) => stat(`Tag ${i}`, i))
	ok(rankTagSuggestions('tag', many).options.length <= 8)
	const junk = rankTagSuggestions('kitchen', [null, 5, 'x', { slug: '' }, { slug: 'a' }, { slug: 'kitchen', label: 'Kitchen', count: Number.NaN }, { slug: 'kitchen', label: 'dup', count: 9 }, { slug: 'b', label: '  ', count: -3 }])
	eq(junk.options.map((o) => [o.kind, o.label, o.count]), [['tag', 'Kitchen', 0], ['tag', 'a', 0], ['tag', 'b', 0]])
	for (const bad of [undefined, null, 'rows', 5, {}]) eq(rankTagSuggestions('kitchen', bad).options.map((o) => o.kind), ['create'])
	eq(sanitizeTagStats(many).length, 50, 'a suggestion list is bounded')
	eq(sanitizeTagStats(many, 5000).length, 1000, 'the manager bound is larger')
})

await check('suggest: while a new answer is on its way, the old one still shows what could still match', () => {
	const stale = [stat('Kitchen', 214), stat('Kitchen remodel', 40), stat('Bathroom', 9)]
	eq(filterStaleStats(stale, 'kitche').map((s) => s.label), ['Kitchen', 'Kitchen remodel'])
	eq(filterStaleStats(stale, 'Kitchens').map((s) => s.label), ['Kitchen'], 'a plural reads as its stem while it loads')
	eq(filterStaleStats(stale, 'xyz'), [])
	eq(filterStaleStats(stale, '!!!'), [])
	eq(filterStaleStats(stale, ''), [])
})

/* ========================================================================== */
/* Pure: the debounced, stale-safe suggestion controller                      */
/* ========================================================================== */

function controllerRig(over = {}) {
	const clock = new FakeClock()
	const calls = []
	const results = []
	const pendings = []
	const controller = createTagSuggestionController({
		fetch: over.fetch ?? ((query, signal) => {
			const d = deferred()
			calls.push({ query, signal, ...d })
			return d.promise
		}),
		onResult: (r) => results.push(r),
		onPending: (p) => pendings.push(p),
		timers: clock,
		delay: over.delay,
	})
	return { clock, calls, results, pendings, controller }
}

await check('controller: nothing is fetched until the person pauses for 120 ms, and only the last text is asked', () => {
	const { clock, calls, controller } = controllerRig()
	controller.request('k')
	clock.advance(100)
	controller.request('ki')
	clock.advance(100)
	controller.request('kit')
	clock.advance(119)
	eq(calls.length, 0, 'still inside the pause')
	clock.advance(1)
	eq(calls.map((c) => c.query), ['kit'], 'one request, for the last text')
	eq(clock.pending, 0)
	ok(editor.TAG_SUGGEST_DELAY_MS === 120)
})

await check('controller: a slow answer to an old question can never replace the answer to the new one', async () => {
	for (const order of ['new first', 'old first']) {
		const { clock, calls, results, controller } = controllerRig()
		controller.request('kit')
		clock.advance(120)
		controller.request('kitc')
		ok(calls[0].signal.aborted, 'the superseded fetch is aborted')
		clock.advance(120)
		eq(calls.map((c) => c.query), ['kit', 'kitc'])
		const answerOld = () => calls[0].resolve([stat('Old answer', 1)])
		const answerNew = () => calls[1].resolve([stat('New answer', 2)])
		if (order === 'new first') {
			answerNew()
			await tick()
			answerOld()
		} else {
			answerOld()
			await tick()
			eq(results.length, 0, 'an answer to a superseded question is dropped')
			answerNew()
		}
		await tick()
		eq(results.map((r) => [r.query, r.stats.map((s) => s.label)]), [['kitc', ['New answer']]], order)
	}
})

await check('controller: a blank query is answered with nothing, at once, and cancels what was waiting', async () => {
	const { clock, calls, results, controller, pendings } = controllerRig()
	controller.request('kit')
	controller.request('   ')
	eq(results, [{ query: '   ', stats: [] }])
	clock.advance(500)
	eq(calls.length, 0, 'no fetch for blank')
	eq(pendings, [true, false])
	controller.request('')
	eq(results.length, 2)
})

await check('controller: a fetch that fails is an empty list, not an unhandled rejection', async () => {
	const { clock, results, controller } = controllerRig({ fetch: () => Promise.reject(new Error('network down')) })
	controller.request('kit')
	clock.advance(120)
	await tick()
	eq(results, [{ query: 'kit', stats: [] }])
	const sync = controllerRig({ fetch: () => { throw new Error('threw before returning a promise') } })
	sync.controller.request('kit')
	sync.clock.advance(120)
	await tick()
	eq(sync.results, [{ query: 'kit', stats: [] }])
	const notPromise = controllerRig({ fetch: () => [stat('Kitchen', 1)] })
	notPromise.controller.request('kit')
	notPromise.clock.advance(120)
	await tick()
	eq(notPromise.results[0].stats.length, 1, 'a plain array works too')
})

await check('controller: cancel stops the timer and ignores a reply already in flight', async () => {
	const { clock, calls, results, controller, pendings } = controllerRig()
	controller.request('kit')
	clock.advance(50)
	controller.cancel()
	clock.advance(500)
	eq(calls.length, 0, 'a cancelled timer never fetches')
	controller.request('kit')
	clock.advance(120)
	eq(calls.length, 1)
	controller.cancel()
	ok(calls[0].signal.aborted)
	calls[0].resolve([stat('Kitchen', 1)])
	await tick()
	eq(results, [], 'a reply after cancel touches nothing')
	eq(pendings, [true, false, true, false])
})

await check('controller: pending is true from the request until the answer, and the next request starts clean', async () => {
	const { clock, calls, results, controller, pendings } = controllerRig()
	controller.request('a')
	eq(pendings, [true])
	clock.advance(120)
	calls[0].resolve([stat('Apple', 3)])
	await tick()
	eq(pendings, [true, false])
	eq(results.length, 1)
	controller.request('ap')
	clock.advance(120)
	calls[1].resolve([stat('Apple', 3)])
	await tick()
	eq(results.map((r) => r.query), ['a', 'ap'])
})

await check('controller: a reply is cleaned before anyone sees it', async () => {
	const { clock, calls, results, controller } = controllerRig()
	controller.request('kit')
	clock.advance(120)
	calls[0].resolve('not a list')
	await tick()
	eq(results[0].stats, [])
	controller.request('kitc')
	clock.advance(120)
	calls[1].resolve([null, { slug: 'k', label: 'K', count: 2 }, { slug: 'k', label: 'dup' }])
	await tick()
	eq(results[1].stats.map((s) => s.label), ['K'])
})

await check('controller: the delay is configurable and the fetch gets a live AbortSignal', async () => {
	const { clock, calls, controller } = controllerRig({ delay: 30 })
	controller.request('a')
	clock.advance(29)
	eq(calls.length, 0)
	clock.advance(1)
	eq(calls.length, 1)
	ok(calls[0].signal instanceof AbortSignal && !calls[0].signal.aborted)
})

/* ========================================================================== */
/* Pure: keys                                                                 */
/* ========================================================================== */

const ctx = (over = {}) => ({ typed: true, empty: false, open: true, count: 3, active: -1, explicit: false, hasChips: true, ...over })
const key = (name, over = {}) => ({ key: name, ...over })

await check('keys: Enter adds the highlighted row, or the typed text when nothing is highlighted', () => {
	eq(decideTagKey(key('Enter'), ctx({ active: 0 })), { type: 'accept', index: 0 })
	eq(decideTagKey(key('Enter'), ctx({ active: 2 })), { type: 'accept', index: 2 })
	eq(decideTagKey(key('Enter'), ctx({ active: -1 })), { type: 'commit' })
	eq(decideTagKey(key('Enter'), ctx({ active: 0, open: false })), { type: 'commit' }, 'a closed list highlights nothing')
	eq(decideTagKey(key('Enter'), ctx({ active: 7 })), { type: 'commit' }, 'a stale index is not a row')
	eq(decideTagKey(key('Enter'), ctx({ typed: false, empty: true })), { type: 'swallow' }, 'nothing typed: swallowed, so a second Enter cannot submit a form around the box')
	eq(decideTagKey(key('Enter'), ctx({ typed: false, empty: false })), { type: 'swallow' }, 'blank space is not typing')
	eq(decideTagKey(key('Enter', { ctrlKey: true }), ctx({ active: 0 })), { type: 'none' })
	eq(decideTagKey(key('Enter', { shiftKey: true }), ctx({ active: -1 })), { type: 'commit' })
})

await check('keys: Tab adds the typed text only while typing, and takes a row only if the person walked to it', () => {
	eq(decideTagKey(key('Tab'), ctx({ active: 0, explicit: false })), { type: 'commit' }, 'the default highlight is only a nudge')
	eq(decideTagKey(key('Tab'), ctx({ active: 1, explicit: true })), { type: 'accept', index: 1 })
	eq(decideTagKey(key('Tab'), ctx({ active: 1, explicit: true, open: false })), { type: 'commit' })
	eq(decideTagKey(key('Tab'), ctx({ typed: false, empty: true })), { type: 'none' }, 'an empty box lets focus move on')
	eq(decideTagKey(key('Tab', { shiftKey: true }), ctx()), { type: 'none' }, 'Shift+Tab is navigation')
	eq(decideTagKey(key('Tab', { altKey: true }), ctx()), { type: 'none' })
	eq(decideTagKey(key('Tab'), ctx({ open: false, active: -1 })), { type: 'commit' })
})

await check('keys: Backspace in an empty box goes to the last chip, and only then', () => {
	eq(decideTagKey(key('Backspace'), ctx({ typed: false, empty: true })), { type: 'chips' })
	eq(decideTagKey(key('Backspace'), ctx({ typed: false, empty: true, hasChips: false })), { type: 'none' })
	eq(decideTagKey(key('Backspace'), ctx()), { type: 'none' }, 'deleting typed text is just deleting')
	eq(decideTagKey(key('Backspace'), ctx({ typed: false, empty: false })), { type: 'none' }, 'blank space left in the box')
	eq(decideTagKey(key('Backspace', { shiftKey: true }), ctx({ typed: false, empty: true })), { type: 'none' })
	eq(decideTagKey(key('Backspace', { ctrlKey: true }), ctx({ typed: false, empty: true })), { type: 'none' })
})

await check('keys: the arrows walk the rows with a "nothing" stop, open a closed list, and ignore modifiers', () => {
	eq(decideTagKey(key('ArrowDown'), ctx({ active: -1 })), { type: 'move', active: 0 })
	eq(decideTagKey(key('ArrowDown'), ctx({ active: 2 })), { type: 'move', active: -1 }, 'past the end is "nothing"')
	eq(decideTagKey(key('ArrowUp'), ctx({ active: -1 })), { type: 'move', active: 2 })
	eq(decideTagKey(key('ArrowUp'), ctx({ active: 0 })), { type: 'move', active: -1 })
	eq(decideTagKey(key('ArrowDown'), ctx({ open: false })), { type: 'open' })
	eq(decideTagKey(key('ArrowDown'), ctx({ count: 0 })), { type: 'none' })
	eq(decideTagKey(key('ArrowDown'), ctx({ typed: false, empty: true })), { type: 'none' }, 'nothing to complete')
	for (const mod of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) eq(decideTagKey(key('ArrowDown', { [mod]: true }), ctx()), { type: 'none' }, mod)
	eq([nextTagActive(-1, 1, 0), nextTagActive(5, 1, 3), nextTagActive(-1, -1, 3), nextTagActive(1, -1, 3)], [-1, 0, 2, 0])
})

await check('keys: Esc closes an open list and otherwise passes through; a comma is not a key decision at all', () => {
	eq(decideTagKey(key('Escape'), ctx({ open: true })), { type: 'close' })
	eq(decideTagKey(key('Escape'), ctx({ open: false })), { type: 'none' })
	eq(decideTagKey(key('Escape', { ctrlKey: true }), ctx()), { type: 'none' })
	eq(decideTagKey(key(','), ctx()), { type: 'none' })
	eq(decideTagKey(key('a'), ctx()), { type: 'none' })
	eq(decideTagKey(key('Home'), ctx()), { type: 'none' })
})

await check('keys: keys belong to the input method while it is composing', () => {
	for (const name of ['Enter', 'Tab', 'Backspace', 'ArrowDown', 'Escape'])
		eq(decideTagKey(key(name, { isComposing: true }), ctx({ active: 0, explicit: true, typed: false, empty: true })), { type: 'none' }, name)
	eq(decideTagKey(key('Process'), ctx({ active: 0 })), { type: 'none' })
})

await check('keys: Esc over an expanded combobox is left to the list, not the sheet or dialog around it', () => {
	const el = (attrs) => ({ getAttribute: (name) => attrs[name] ?? null })
	ok(escapeBelongsToList(el({ role: 'combobox', 'aria-expanded': 'true' })))
	ok(!escapeBelongsToList(el({ role: 'combobox', 'aria-expanded': 'false' })))
	ok(!escapeBelongsToList(el({ role: 'button', 'aria-expanded': 'true' })))
	for (const bad of [null, undefined, 5, {}, 'x']) ok(!escapeBelongsToList(bad))
})

/* ========================================================================== */
/* Pure: chips and the optimistic reducer                                     */
/* ========================================================================== */

const deepFreeze = (value) => {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value)
		for (const inner of Object.values(value)) deepFreeze(inner)
	}
	return value
}
const showing = (tags) => tags.map((t) => `${t.label}:${t.source}${t.pending ? `:${t.pending}` : ''}`)

await check('optimistic: an add shows the new chips at once, pending, after the manual ones', () => {
	const base = deepFreeze([manual('Kitchen'), auto('Van')])
	const ops = [{ id: 1, kind: 'add', labels: ['Remodel', 'Before'] }]
	eq(showing(projectTags(base, ops)), ['Kitchen:manual', 'Van:auto', 'Remodel:manual:add', 'Before:manual:add'])
	eq(showing(orderTags(projectTags(base, ops))), ['Kitchen:manual', 'Remodel:manual:add', 'Before:manual:add', 'Van:auto'], 'manual first')
	eq(showing(projectTags(base, [])), ['Kitchen:manual', 'Van:auto'])
})

await check('optimistic: adding a label that is an automatic tag keeps it at once; adding a manual one changes nothing', () => {
	const base = deepFreeze([manual('Kitchen'), auto('Van')])
	const kept = projectTags(base, [{ id: 1, kind: 'add', labels: ['van'] }])
	eq(showing(kept), ['Kitchen:manual', 'Van:manual:add'], 'the existing label stays, and it is now the person\'s')
	eq(kept[1].confidence, undefined)
	eq(showing(projectTags(base, [{ id: 1, kind: 'add', labels: ['KITCHEN'] }])), ['Kitchen:manual', 'Van:auto'])
	eq(showing(projectTags(base, [{ id: 1, kind: 'add', labels: ['!!!', '', 'new'] }])), ['Kitchen:manual', 'Van:auto', 'new:manual:add'])
})

await check('optimistic: remove hides the chip at once; promote flips an automatic chip to manual', () => {
	const base = deepFreeze([manual('Kitchen'), auto('Van'), auto('Truck')])
	eq(showing(projectTags(base, [{ id: 1, kind: 'remove', slug: 'kitchen' }])), ['Van:auto', 'Truck:auto'])
	eq(showing(projectTags(base, [{ id: 1, kind: 'promote', slug: 'van' }])), ['Kitchen:manual', 'Van:manual:promote', 'Truck:auto'])
	eq(showing(projectTags(base, [{ id: 1, kind: 'promote', slug: 'kitchen' }, { id: 2, kind: 'promote', slug: 'nope' }])), ['Kitchen:manual', 'Van:auto', 'Truck:auto'], 'nothing to keep')
	eq(showing(projectTags(base, [{ id: 1, kind: 'remove', slug: 'kitchen' }, { id: 2, kind: 'add', labels: ['kitchen'] }])), ['Van:auto', 'Truck:auto', 'kitchen:manual:add'], 'later changes lay over earlier ones')
})

await check('optimistic: success drops the op, failure drops it and keeps the reason, and the base shows through (rollback)', () => {
	let state = deepFreeze(initialTagOps())
	const base = deepFreeze([manual('Kitchen')])
	const add = { id: 1, kind: 'add', labels: ['Remodel'] }
	state = tagOpsReducer(state, { type: 'start', op: add })
	eq(showing(projectTags(base, state.ops)), ['Kitchen:manual', 'Remodel:manual:add'])
	const failedState = tagOpsReducer(state, { type: 'fail', id: 1, message: 'Too many tags.' })
	eq(failedState, { ops: [], error: 'Too many tags.' })
	eq(showing(projectTags(base, failedState.ops)), ['Kitchen:manual'], 'rolled back')
	const okState = tagOpsReducer(state, { type: 'settle', id: 1 })
	eq(okState, { ops: [], error: null })
	// Only the failed change rolls back.
	const two = tagOpsReducer(tagOpsReducer(initialTagOps(), { type: 'start', op: add }), { type: 'start', op: { id: 2, kind: 'add', labels: ['Before'] } })
	const afterFirstFails = tagOpsReducer(two, { type: 'fail', id: 1, message: 'No.' })
	eq(showing(projectTags(base, afterFirstFails.ops)), ['Kitchen:manual', 'Before:manual:add'])
	// A new request is a fresh start for the message; dismiss clears it; settling does not hide a failure.
	eq(tagOpsReducer(failedState, { type: 'start', op: add }).error, null)
	eq(tagOpsReducer(failedState, { type: 'dismiss' }).error, null)
	eq(tagOpsReducer(failedState, { type: 'settle', id: 99 }).error, 'Too many tags.')
	const quiet = initialTagOps()
	ok(tagOpsReducer(quiet, { type: 'dismiss' }) === quiet, 'dismissing nothing changes nothing, not even identity')
	eq(tagOpsReducer(initialTagOps(), { type: 'unknown' }), initialTagOps())
	eq(tagOpsReducer(initialTagOps(), { type: 'settle', id: 5 }), initialTagOps(), 'settling an unknown op is harmless')
})

await check('chips: orderTags and sanitizeTags never lose a tag or reorder inside a group', () => {
	const tags = [auto('A'), manual('B'), auto('C'), manual('D')]
	eq(orderTags(tags).map((t) => t.label), ['B', 'D', 'A', 'C'])
	eq(orderTags([]), [])
	ok(orderTags(tags) !== tags, 'never the same array')
	eq(sanitizeTags([manual('A'), manual('A'), null, { slug: 's' }]).map((t) => [t.slug, t.label, t.source]), [['a', 'A', 'manual'], ['s', 's', 'auto']])
	eq(sanitizeTags('x'), [])
	eq(existingOf([manual('Kitchen'), auto('Van')]).get('van'), 'auto')
	eq([...existingOf([])].length, 0)
	eq(confidencePercent({ confidence: 0.926 }), 93)
	eq(confidencePercent({}), null)
	eq(chipTitle(manual('A')), undefined)
	eq(chipTitle(auto('A', { confidence: 0.5 })), '50% sure')
})

await check('queue: calls run one at a time, in order, and one failing never wedges the rest', async () => {
	const queue = createSerialQueue()
	const log = []
	const gates = [deferred(), deferred(), deferred()]
	let running = 0
	let peak = 0
	const task = (i, fail) => async () => {
		running++
		peak = Math.max(peak, running)
		log.push(`start ${i}`)
		await gates[i].promise
		running--
		log.push(`end ${i}`)
		if (fail === 'reject') throw new Error('boom')
		if (fail === 'throw') throw 'plain string'
	}
	const done = [queue.run(task(0, 'reject')), queue.run(task(1, 'throw')), queue.run(task(2))]
	await tick()
	eq(log, ['start 0'], 'the second waits for the first')
	gates[2].resolve()
	gates[1].resolve()
	await tick()
	eq(log, ['start 0'], 'finishing later ones early changes nothing')
	gates[0].resolve()
	const results = await Promise.all(done)
	eq(log, ['start 0', 'end 0', 'start 1', 'end 1', 'start 2', 'end 2'])
	eq(peak, 1)
	eq(results, [undefined, undefined, undefined], 'run() itself never rejects')
	// A task that throws synchronously, or returns a non-promise, is fine too.
	await queue.run(() => { throw new Error('sync') })
	let ran = false
	await queue.run(() => { ran = true })
	ok(ran)
})

await check('messages: any failure becomes a sentence; hostile ones are bounded and inert', () => {
	eq(messageOf(new Error('Too many tags.')), 'Too many tags.')
	eq(messageOf(new Error('  spaced  ')), 'spaced')
	eq(messageOf('plain'), 'plain')
	eq(messageOf({ message: 'from an object' }), 'from an object')
	for (const bad of [undefined, null, 5, {}, new Error(''), new Error('   '), { message: 5 }, Symbol.iterator]) eq(messageOf(bad), 'Something went wrong. Try again.')
	eq(messageOf(undefined, 'custom'), 'custom')
	eq(messageOf(new Error('x'.repeat(5000))).length, 300)
})

await check('typing targets: an input, textarea, select, editable host or open list keeps the arrow keys', () => {
	const el = (tagName, extra = {}) => ({ tagName, getAttribute: () => null, closest: () => null, ...extra })
	for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) ok(isTypingTarget(el(tag)), tag)
	ok(isTypingTarget(el('DIV', { isContentEditable: true })))
	ok(isTypingTarget(el('BUTTON', { getAttribute: (n) => (n === 'role' ? 'combobox' : null) })), 'a Select trigger')
	ok(isTypingTarget(el('DIV', { getAttribute: (n) => (n === 'role' ? 'option' : null) })))
	ok(isTypingTarget(el('DIV', { getAttribute: (n) => (n === 'role' ? 'listbox foo' : null) })))
	ok(isTypingTarget(el('SPAN', { closest: () => ({}) })), 'inside an editable host')
	ok(!isTypingTarget(el('DIV')))
	ok(!isTypingTarget(el('BUTTON')))
	ok(!isTypingTarget(el('DIV', { closest: () => { throw new Error('bad selector') } })), 'a throwing DOM is not typing')
	for (const bad of [null, undefined, 5, 'x', {}, []]) ok(!isTypingTarget(bad))
})

/* ========================================================================== */
/* Pure: the detail panel                                                     */
/* ========================================================================== */

const {
	planFieldSave,
	FIELD_SPECS,
	fieldReducer,
	initField,
	folderChoices,
	folderValueOf,
	folderPatchOf,
	UNFILED,
	navState,
	resolveArrow,
	describeTagging,
	downloadHref,
	downloadName,
	safeSwatch,
	copyText,
	dimensionsOf,
	addedText,
	isHttpUrl,
	isUsableSrc,
	SAVED_TICK_MS,
} = panel

const ctxOf = (saved, sending = null) => ({ saved, sending })

await check('field save: only a real change is sent, trimmed, and never twice', () => {
	const name = FIELD_SPECS.name
	eq(planFieldSave(name, 'Kitchen 1', ctxOf('Kitchen 1')), { type: 'noop' })
	eq(planFieldSave(name, '  Kitchen 1  ', ctxOf('Kitchen 1')), { type: 'noop' }, 'a stray space is not a change')
	eq(planFieldSave(name, ' Kitchen 2 ', ctxOf('Kitchen 1')), { type: 'save', value: 'Kitchen 2' })
	eq(planFieldSave(name, 'B', ctxOf('A', 'B')), { type: 'noop' }, 'Enter then blur sends once')
	eq(planFieldSave(name, 'C', ctxOf('A', 'B')), { type: 'save', value: 'C' }, 'a newer value is still sent')
	eq(planFieldSave(name, 'A', ctxOf('A', 'B')), { type: 'noop' }, 'back to the stored value')
	for (const bad of [undefined, null, 5, {}, []]) eq(planFieldSave(name, bad, ctxOf('A')), { type: 'noop' }, `draft ${String(bad)} is not something typed`)
})

await check('field save: a name cannot be emptied, the others can be cleared', () => {
	const bad = { type: 'invalid', message: 'Give the image a name.' }
	eq(planFieldSave(FIELD_SPECS.name, '', ctxOf('Kitchen 1')), bad)
	eq(planFieldSave(FIELD_SPECS.name, '   \t ', ctxOf('Kitchen 1')), bad)
	eq(planFieldSave(FIELD_SPECS.name, '', ctxOf('')), { type: 'noop' }, 'nothing to fix when it was already blank')
	eq(planFieldSave(FIELD_SPECS.caption, '', ctxOf('A van')), { type: 'save', value: '' })
	eq(planFieldSave(FIELD_SPECS.altText, '   ', ctxOf('x')), { type: 'save', value: '' })
	eq(planFieldSave(FIELD_SPECS.notes, '', ctxOf('')), { type: 'noop' })
	ok(assetPatchSchema.safeParse({ caption: '' }).success, 'the schema agrees a caption can be cleared')
	ok(!assetPatchSchema.safeParse({ name: '' }).success && !assetPatchSchema.safeParse({ name: '   ' }).success, 'and a name cannot')
})

await check('field save: limits match the schema, counted in characters', () => {
	for (const [key, max] of [['name', 200], ['caption', 500], ['altText', 300], ['notes', 2000]]) {
		eq(FIELD_SPECS[key].max, max, `${key} max`)
		const exact = planFieldSave(FIELD_SPECS[key], 'a'.repeat(max), ctxOf('x'))
		eq(exact, { type: 'save', value: 'a'.repeat(max) }, `${key} at the limit`)
		ok(assetPatchSchema.safeParse({ [key]: 'a'.repeat(max) }).success)
		const over = planFieldSave(FIELD_SPECS[key], 'a'.repeat(max + 1), ctxOf('x'))
		eq(over.type, 'invalid', `${key} over the limit`)
		ok(over.message.includes(String(max).replace(/\B(?=(\d{3})+(?!\d))/g, ',')), over.message)
		ok(!assetPatchSchema.safeParse({ [key]: 'a'.repeat(max + 1) }).success)
	}
	eq(planFieldSave(FIELD_SPECS.name, '𠀀'.repeat(200), ctxOf('x')).type, 'save', '200 characters of 2 UTF-16 units each')
	eq(planFieldSave(FIELD_SPECS.name, '𠀀'.repeat(201), ctxOf('x')).type, 'invalid')
	// Whatever it plans to save, the schema accepts.
	for (const draft of ['  a  ', 'x'.repeat(199), '日本語', 'line\nbreak', '<b>']) {
		const plan = planFieldSave(FIELD_SPECS.caption, draft, ctxOf('zzz'))
		if (plan.type === 'save') ok(assetPatchSchema.safeParse({ caption: plan.value }).success, draft)
	}
})

await check('field state: saving, saved and error follow the save, and the draft is never lost', () => {
	let s = initField('A')
	eq(s, { saved: 'A', draft: 'A', status: 'idle', error: null, saves: 0 })
	s = fieldReducer(s, { type: 'edit', value: 'B' })
	eq([s.draft, s.status], ['B', 'idle'])
	s = fieldReducer(s, { type: 'start' })
	eq(s.status, 'saving')
	s = fieldReducer(s, { type: 'edit', value: 'BC' })
	eq([s.draft, s.status], ['BC', 'saving'], 'typing during a save keeps it "Saving"')
	s = fieldReducer(s, { type: 'ok', value: 'B' })
	eq([s.saved, s.draft, s.status, s.saves], ['B', 'BC', 'saved', 1], 'the newer typing is kept, not overwritten')
	s = fieldReducer(s, { type: 'dismiss' })
	eq(s.status, 'idle')
	// A save that finishes with nothing typed since reads back as the stored value.
	const clean = fieldReducer(fieldReducer(fieldReducer(initField('A'), { type: 'edit', value: ' B ' }), { type: 'start' }), { type: 'ok', value: 'B' })
	eq([clean.draft, clean.saved], ['B', 'B'])
	// Failure: the reason shows, the draft stays, typing again clears it, revert goes back.
	const failedField = fieldReducer(fieldReducer(fieldReducer(initField('A'), { type: 'edit', value: 'B' }), { type: 'start' }), { type: 'fail', message: 'Offline.' })
	eq([failedField.status, failedField.error, failedField.draft], ['error', 'Offline.', 'B'])
	eq(fieldReducer(failedField, { type: 'edit', value: 'BB' }).error, null)
	eq(fieldReducer(failedField, { type: 'revert' }).draft, 'A')
	eq(fieldReducer(initField('A'), { type: 'invalid', message: 'Give the image a name.' }).status, 'error')
	// Dismiss only retires "Saved".
	eq(fieldReducer(failedField, { type: 'dismiss' }), failedField)
	eq(fieldReducer(initField('A'), { type: 'nope' }), initField('A'))
	ok(SAVED_TICK_MS >= 1000 && SAVED_TICK_MS <= 5000, '"Saved" is subtle: it goes away')
})

await check('field state: a stored value that changes under an untouched field is followed; under an edited one it is not', () => {
	const untouched = fieldReducer(initField('A'), { type: 'sync', saved: 'AI wrote this' })
	eq([untouched.saved, untouched.draft], ['AI wrote this', 'AI wrote this'])
	const editing = fieldReducer(fieldReducer(initField('A'), { type: 'edit', value: 'my words' }), { type: 'sync', saved: 'AI wrote this' })
	eq([editing.saved, editing.draft], ['AI wrote this', 'my words'], 'never clobber what the person is typing')
	const same = initField('A')
	ok(fieldReducer(same, { type: 'sync', saved: 'A' }) === same, 'no change, no re-render')
})

await check('folders: Unfiled first, then every folder in order with its depth, hostile data cleaned', () => {
	const choices = folderChoices(folders)
	eq(choices.map((c) => [c.value, c.label, c.path, c.depth]), [
		[UNFILED, 'No folder', '', 0],
		[F_CLIENTS, 'Clients', 'Clients', 0],
		[F_ACME, 'Acme', 'Clients/Acme', 1],
		[F_BRAND, 'Brand', 'Brand', 0],
	])
	eq(folderChoices(null).length, 1)
	eq(folderChoices(undefined)[0].value, UNFILED)
	const messy = folderChoices([
		{ id: 'a', name: '', path: '', depth: 99 },
		{ id: 'a', name: 'dup', path: 'dup', depth: 0 },
		{ id: 'b', name: 'B', path: 'x/B', depth: Number.NaN },
		{ id: 'c', name: 'C', path: 'C', depth: -3 },
		{ id: '', name: 'no id' },
		{ id: UNFILED, name: 'collides with the root choice' },
		null,
		5,
		{ id: 'd', name: 'D', path: 5, depth: 1.5 },
	])
	eq(messy.map((c) => [c.value, c.label, c.path, c.depth]), [
		[UNFILED, 'No folder', '', 0],
		['a', 'Untitled folder', 'Untitled folder', MEDIA_LIMITS.maxFolderDepth],
		['b', 'B', 'x/B', 0],
		['c', 'C', 'C', 0],
		['d', 'D', 'D', 0],
	])
	// An image whose folder was just deleted still says where it is.
	const stale = folderChoices(folders, { folderId: hex(77), folderPath: 'Gone/Folder' })
	eq(stale.at(-1), { value: hex(77), label: 'Gone/Folder', path: 'Gone/Folder', depth: 0 })
	eq(folderChoices(folders, { folderId: F_ACME, folderPath: 'Clients/Acme' }).length, 4, 'a known folder is not added twice')
	eq(folderChoices(folders, { folderId: hex(78), folderPath: '' }).at(-1).label, 'Unknown folder')
	eq(folderChoices(folders, { folderId: null, folderPath: '' }).length, 4)
})

await check('folders: choosing Unfiled sends null, a folder sends its id, and both pass the schema', () => {
	eq(folderPatchOf(UNFILED), { folderId: null })
	eq(folderPatchOf(F_ACME), { folderId: F_ACME })
	ok(assetPatchSchema.safeParse(folderPatchOf(UNFILED)).success)
	ok(assetPatchSchema.safeParse(folderPatchOf(F_ACME)).success)
	eq(folderValueOf({ folderId: null }), UNFILED)
	eq(folderValueOf({ folderId: F_ACME }), F_ACME)
	eq(folderValueOf({ folderId: '' }), UNFILED)
	eq(folderValueOf({}), UNFILED)
	ok(!/^[a-f0-9]{24}$/i.test(UNFILED), 'the root value can never be a folder id')
})

await check('paging: position, bounds and the arrow keys', () => {
	eq(navState(2, 40), { visible: true, label: '3 of 40', canPrev: true, canNext: true })
	eq(navState(0, 40), { visible: true, label: '1 of 40', canPrev: false, canNext: true })
	eq(navState(39, 40), { visible: true, label: '40 of 40', canPrev: true, canNext: false })
	eq(navState(0, 1), { visible: true, label: '1 of 1', canPrev: false, canNext: false })
	for (const [index, count] of [[-1, 5], [5, 5], [0, 0], [Number.NaN, 5], [1.2, 5], [0, Infinity], [undefined, 5], ['1', 5]])
		eq(navState(index, count), { visible: false, label: '', canPrev: false, canNext: false }, `${index}/${count}`)
})

await check('paging: ArrowLeft and ArrowRight page, except while typing, with a modifier, in a portal, or when used', () => {
	const div = { tagName: 'DIV', getAttribute: () => null, closest: () => null }
	const nav = { canPrev: true, canNext: true }
	const arrow = (name, over = {}, navOver = nav, inside = true) => resolveArrow({ key: name, target: div, ...over }, navOver, inside)
	eq(arrow('ArrowLeft'), 'prev')
	eq(arrow('ArrowRight'), 'next')
	eq(arrow('ArrowLeft', {}, { canPrev: false, canNext: true }), null, 'nowhere to go back to')
	eq(arrow('ArrowRight', {}, { canPrev: true, canNext: false }), null)
	for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) eq(arrow('ArrowLeft', { target: { ...div, tagName: tag } }), null, `typing in a ${tag}`)
	eq(arrow('ArrowRight', { target: { ...div, isContentEditable: true } }), null)
	eq(arrow('ArrowRight', { target: { ...div, getAttribute: () => 'combobox' } }), null, 'the tag box and a Select')
	eq(arrow('ArrowRight', { target: { ...div, closest: () => ({}) } }), null, 'inside an editable host or an open list')
	for (const mod of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) eq(arrow('ArrowLeft', { [mod]: true }), null, mod)
	eq(arrow('ArrowLeft', { defaultPrevented: true }), null, 'a key already handled')
	eq(arrow('ArrowLeft', { isComposing: true }), null)
	eq(arrow('ArrowLeft', {}, nav, false), null, 'a dialog stacked on top lives outside the sheet')
	for (const other of ['ArrowUp', 'ArrowDown', 'Enter', 'a', 'Home', ' ']) eq(arrow(other), null, other)
})

await check('tagging: every state has a plain label; a failure and a skip say why', () => {
	eq(describeTagging({ status: 'pending' }), { label: 'Waiting for tags', detail: null, tone: 'busy', busy: true })
	eq(describeTagging({ status: 'running' }), { label: 'Tagging…', detail: null, tone: 'busy', busy: true })
	eq(describeTagging({ status: 'done' }), { label: 'Tagged', detail: null, tone: 'ok', busy: false })
	eq(describeTagging({ status: 'failed', error: 'The AI service is unavailable.' }), { label: 'Tagging failed', detail: 'The AI service is unavailable.', tone: 'warn', busy: false })
	eq(describeTagging({ status: 'failed' }).detail, null)
	eq(describeTagging({ status: 'failed', error: '   ' }).detail, null)
	eq(describeTagging({ status: 'skipped', reason: 'not_configured' }).detail, 'Auto-tagging is off.')
	eq(describeTagging({ status: 'skipped', reason: 'declined' }).detail, 'The AI declined to tag this image.')
	eq(describeTagging({ status: 'skipped', reason: 'budget' }).detail, 'The daily auto-tagging limit was reached.')
	eq(describeTagging({ status: 'skipped', reason: 'constructor' }).detail, null, 'a reason is looked up as a key, never as a property')
	eq(describeTagging({ status: 'skipped' }), { label: 'Not tagged', detail: null, tone: 'muted', busy: false })
	for (const bad of [undefined, null, {}, { status: 'bogus' }, { status: 5 }]) eq(describeTagging(bad).label, 'Not tagged', String(JSON.stringify(bad)))
})

await check('links: a download of a Blob image asks for ?download=1, and nothing else is rewritten', () => {
	const blob = 'https://abc123.public.blob.vercel-storage.com/workspaces/w/media/kitchen-1.jpg'
	eq(downloadHref(blob), `${blob}?download=1`)
	eq(downloadHref(`${blob}?v=2`), `${blob}?v=2&download=1`)
	eq(downloadHref(`${blob}?download=1`), `${blob}?download=1`)
	eq(downloadHref(`${blob}?download=0`), `${blob}?download=0`, 'an existing choice is respected')
	eq(downloadHref('https://example.com/a b.jpg'), 'https://example.com/a b.jpg', 'another host is returned untouched')
	eq(downloadHref('/relative/x.jpg'), '/relative/x.jpg')
	eq(downloadHref('not a url'), 'not a url')
	eq(downloadHref(''), '')
	eq(downloadHref('https://evil.example/?u=.blob.vercel-storage.com'), 'https://evil.example/?u=.blob.vercel-storage.com')
	eq(downloadHref('https://blob.vercel-storage.com.evil.example/x.jpg'), 'https://blob.vercel-storage.com.evil.example/x.jpg', 'a look-alike host')
	ok(downloadHref('HTTPS://ABC.PUBLIC.BLOB.VERCEL-STORAGE.COM/x.jpg').endsWith('download=1'))
})

await check('links: a download name is always safe and has an extension', () => {
	eq(downloadName({ filename: 'kitchen-1.jpg', name: 'Kitchen 1', format: 'jpg' }), 'kitchen-1.jpg')
	eq(downloadName({ filename: 'a/b\\c:d?.png', name: 'x', format: 'png' }), 'a_b_c_d_.png')
	eq(downloadName({ filename: 'photo', name: 'x', format: 'png' }), 'photo.png')
	eq(downloadName({ filename: '', name: 'My Photo', format: 'webp' }), 'My Photo.webp')
	eq(downloadName({ filename: '', name: '', format: 'jpg' }), 'image.jpg')
	eq(downloadName({ filename: 'a\u0000b.jpg', name: '', format: 'jpg' }), 'a_b.jpg')
	eq(downloadName({ filename: '  spaced.jpg  ', name: '', format: 'jpg' }), 'spaced.jpg')
	eq(downloadName({ filename: undefined, name: undefined, format: undefined }), 'image.jpg')
	ok(!/[\\/]/.test(downloadName({ filename: '../../etc/passwd', name: '', format: 'jpg' })), 'no path traversal')
})

await check('links and colours: only http(s) links and hex colours get through', () => {
	for (const url of ['https://a.example/x.jpg', 'http://a.example/x.jpg', 'HTTPS://A.EXAMPLE/X']) ok(isHttpUrl(url) && isUsableSrc(url), url)
	for (const url of ['javascript:alert(1)', 'data:image/png;base64,AAAA', '//a.example/x', '/x.jpg', 'ftp://a', '', undefined, null, 5, {}]) ok(!isHttpUrl(url), String(url))
	ok(isUsableSrc('/x.jpg') && !isUsableSrc('//a.example/x') && !isUsableSrc('javascript:alert(1)') && !isUsableSrc(''))
	for (const color of ['#fff', '#FFFFFF', '#ffff', '#ffffffff', '#2f6fed']) eq(safeSwatch(color), color)
	for (const bad of ['#12', '#ggg', 'red', '#fff;x', 'url(x)', '#fffff', '', undefined, null, 5, {}, 'red;background:url(//e)']) eq(safeSwatch(bad), undefined, String(bad))
})

await check('metadata: sizes and dates read sensibly and a broken value is a dash, never NaN or Invalid Date', () => {
	eq(dimensionsOf({ width: 1600, height: 1200 }), '1,600 × 1,200')
	for (const bad of [{ width: 0, height: 5 }, { width: Number.NaN, height: 5 }, { width: 5, height: -1 }, {}]) eq(dimensionsOf(bad), '—')
	const now = Date.parse('2026-01-02T00:00:00.000Z')
	eq(addedText('2026-01-01T23:59:40.000Z', now), 'just now')
	eq(addedText('2026-01-01T23:50:00.000Z', now), '10m ago')
	eq(addedText('2026-01-01T21:00:00.000Z', now), '3h ago')
	eq(addedText('2025-12-30T00:00:00.000Z', now), '3d ago')
	ok(/\d{4}/.test(addedText('2024-03-01T00:00:00.000Z', now)), 'an old image shows a date')
	for (const bad of ['not a date', '', undefined, null, 5, {}]) eq(addedText(bad, now), '—', String(bad))
})

await check('copy: the async clipboard first, then the old way, and "failed" is an answer, not an exception', async () => {
	const log = []
	const env = (over = {}) => ({
		writeText: async (t) => { log.push(`write ${t}`) },
		execCopy: (t) => { log.push(`exec ${t}`); return true },
		...over,
	})
	eq(await copyText('u', env()), 'copied')
	eq(log, ['write u'], 'the fallback is not used when the first works')
	log.length = 0
	eq(await copyText('u', env({ writeText: async () => { throw new Error('denied') } })), 'copied')
	eq(log, ['exec u'])
	eq(await copyText('u', env({ writeText: () => { throw new Error('threw synchronously') } })), 'copied')
	eq(await copyText('u', env({ writeText: undefined })), 'copied')
	eq(await copyText('u', env({ writeText: async () => { throw new Error('x') }, execCopy: () => false })), 'failed')
	eq(await copyText('u', env({ writeText: async () => { throw new Error('x') }, execCopy: () => { throw new Error('y') } })), 'failed')
	eq(await copyText('u', {}), 'failed')
	eq(await copyText('u', { writeText: async () => { throw new Error('x') } }), 'failed')
})

/* ========================================================================== */
/* Pure: the bulk dialog                                                      */
/* ========================================================================== */

const { sanitizeExisting, existingCaption, parseRemoveInput, summarizeBulk, describeBulk } = bulk

await check('bulk existing: the tags on the target images are cleaned, capped by the image count, most common first', () => {
	const rows = sanitizeExisting([
		{ slug: 'van', label: 'Van', count: 3 },
		{ slug: 'kitchen', label: 'Kitchen', count: 12 },
		{ slug: 'kitchen', label: 'dup', count: 99 },
		{ slug: '', label: 'no slug', count: 5 },
		{ slug: 'big', label: 'Big', count: 500 },
		{ slug: 'neg', label: 'Neg', count: -4 },
		{ slug: 'nan', label: 'Nan', count: Number.NaN },
		{ slug: 'tie1', label: 'Tie 1', count: 3 },
		{ slug: 'blank', label: '  ', count: 1 },
		null,
		5,
	], 40)
	eq(rows.map((r) => [r.slug, r.label, r.count]), [
		['big', 'Big', 40],
		['kitchen', 'Kitchen', 12],
		['van', 'Van', 3],
		['tie1', 'Tie 1', 3],
		['blank', 'blank', 1],
		['neg', 'Neg', 0],
		['nan', 'Nan', 0],
	])
	for (const bad of [undefined, null, 'x', 5, {}]) eq(sanitizeExisting(bad, 10), [])
	const many = Array.from({ length: 1000 }, (_, i) => ({ slug: 's' + i, label: 'S' + i, count: i }))
	const shown = sanitizeExisting(many, 5000)
	eq(shown.length, bulk.EXISTING_SHOWN_MAX, 'a long list is a typed search away, not a thousand chips')
	eq(shown[0].slug, 's999', 'the most common survive the cut')
	const t0 = performance.now()
	eq(sanitizeExisting(Array.from({ length: 300_000 }, (_, i) => ({ slug: 'x' + i, label: 'X', count: i })), 10).length, bulk.EXISTING_SHOWN_MAX)
	ok(performance.now() - t0 < 1500, 'a hostile list cannot stall the dialog')
	eq(sanitizeExisting([{ slug: 'a', label: 'A', count: 5 }], 0)[0].count, 5, 'an unknown total does not clamp')
	eq(existingCaption({ count: 12 }, 40), '12 of 40')
	eq(existingCaption({ count: 1234 }, 5000), '1,234 of 5,000')
	eq(existingCaption({ count: 12 }, 0), '12')
	eq(existingCaption({ count: -3 }, 40), '0 of 40')
})

await check('bulk remove: typed names and remembered slugs become the same slugs, bounded', () => {
	eq(parseRemoveInput('Kitchen Remodel, kitchen-remodel, Van'), { slugs: ['kitchen-remodel', 'van'], invalid: [], truncated: false, capped: false })
	eq(parseRemoveInput(' old-logo ,  , draft ').slugs, ['old-logo', 'draft'])
	eq(parseRemoveInput('!!!, ok').invalid, ['!!!'])
	eq(parseRemoveInput('!!!, ok').slugs, ['ok'])
	eq(parseRemoveInput('').slugs, [])
	for (const bad of [undefined, null, 5, {}]) eq(parseRemoveInput(bad).slugs, [])
	const many = parseRemoveInput(Array.from({ length: 60 }, (_, i) => `tag${i}`).join(','))
	eq(many.slugs.length, 40)
	eq(many.capped, true, 'more than a call can take is reported, not silently cut')
	eq(parseRemoveInput(Array.from({ length: 40 }, (_, i) => `tag${i}`).join(',')).capped, false, 'exactly 40 is fine')
	ok(parseRemoveInput('x,'.repeat(100_000)).truncated)
	for (const slug of many.slugs) ok(bulkBodySchema.safeParse({ action: 'removeTags', target: { ids: [hex(1)] }, tags: [slug] }).success)
})

await check('bulk apply: nothing entered means nothing to apply', () => {
	const none = summarizeBulk({ staged: [], typedAdd: '', checked: [], typedRemove: '', count: 37 })
	eq(none, { add: [], remove: [], entered: false, problem: null, canApply: false })
	eq(summarizeBulk({ staged: [], typedAdd: '   ', checked: [], typedRemove: ' , ', count: 37 }).canApply, false, 'blank space and commas are nothing')
})

await check('bulk apply: staged chips, typed-but-not-entered text, ticked tags and typed slugs each count, trimmed', () => {
	const s = (over) => summarizeBulk({ staged: [], typedAdd: '', checked: [], typedRemove: '', count: 37, ...over })
	eq(s({ staged: ['Kitchen'] }), { add: ['Kitchen'], remove: [], entered: true, problem: null, canApply: true })
	eq(s({ typedAdd: ' kitchen ,  remodel ' }).add, ['kitchen', 'remodel'], 'typing counts before Enter')
	eq(s({ staged: ['A'], typedAdd: 'b, a' }).add, ['A', 'b'], 'a typed repeat of a chip is dropped')
	eq(s({ checked: ['kitchen'] }), { add: [], remove: ['kitchen'], entered: true, problem: null, canApply: true })
	eq(s({ typedRemove: 'Old Logo, draft' }).remove, ['old-logo', 'draft'])
	eq(s({ checked: ['kitchen'], typedRemove: 'kitchen, van' }).remove, ['kitchen', 'van'], 'ticked and typed are merged without repeats')
	eq(s({ staged: ['A'], checked: ['b'] }).canApply, true, 'add and remove together')
})

await check('bulk apply: text that cannot be a tag blocks Apply with a reason instead of vanishing', () => {
	const s = (over) => summarizeBulk({ staged: [], typedAdd: '', checked: [], typedRemove: '', count: 37, ...over })
	const letters = s({ typedAdd: '!!!' })
	eq([letters.canApply, letters.entered], [false, false])
	ok(letters.problem.includes('at least one letter or number'))
	ok(s({ staged: ['A'], typedAdd: 'x'.repeat(41) }).problem.includes('longer than 40 characters'))
	eq(s({ staged: ['A'], typedAdd: 'x'.repeat(41) }).canApply, false)
	ok(s({ typedRemove: '???' }).problem.includes('to name a tag'))
	const full = s({ staged: Array.from({ length: 20 }, (_, i) => `t${i}`), typedAdd: 'extra' })
	eq(full.add.length, 20)
	ok(full.problem.includes('up to 20 tags at a time'))
	eq(full.canApply, false)
	ok(s({ typedRemove: 'x,'.repeat(100_000) }).problem.includes('too long'))
	const many = s({ checked: Array.from({ length: 41 }, (_, i) => `c${i}`) })
	ok(many.problem.includes('up to 40 tags'))
	eq(many.remove.length, 40)
	eq(many.canApply, false)
	ok(s({ typedRemove: Array.from({ length: 41 }, (_, i) => `t${i}`).join(',') }).problem.includes('up to 40 tags'))
	// A tag typed with an existing chip's spelling is not a problem, only a no-op.
	eq(s({ staged: ['Kitchen'], typedAdd: 'KITCHEN' }).problem, null)
})

await check('bulk apply: a tag in both lists is refused, since add-then-remove would net to "gone for good"', () => {
	const both = summarizeBulk({ staged: ['Kitchen'], typedAdd: '', checked: ['kitchen'], typedRemove: '', count: 5 })
	ok(both.problem.includes('"Kitchen" is in both Add and Remove'))
	eq(both.canApply, false)
	eq(summarizeBulk({ staged: ['Kitchen Remodel'], typedAdd: '', checked: [], typedRemove: 'kitchen-remodel', count: 5 }).canApply, false, 'by slug, however it was typed')
	eq(summarizeBulk({ staged: ['Kitchen'], typedAdd: '', checked: ['van'], typedRemove: '', count: 5 }).canApply, true)
})

await check('bulk apply: no images means nothing to apply to', () => {
	for (const count of [0, -1, Number.NaN, undefined]) {
		const s = summarizeBulk({ staged: ['A'], typedAdd: '', checked: [], typedRemove: '', count })
		eq(s.canApply, false, String(count))
		eq(s.problem, 'There are no images to change.')
	}
})

await check('bulk apply: what it sends is accepted by the real bulk schema', () => {
	const s = summarizeBulk({ staged: ['Kitchen', 'Remodel'], typedAdd: 'before', checked: ['van'], typedRemove: 'old-logo', count: 37 })
	eq(s.add, ['Kitchen', 'Remodel', 'before'])
	eq(s.remove, ['van', 'old-logo'])
	ok(bulkBodySchema.safeParse({ action: 'addTags', target: { ids: [hex(1)] }, tags: s.add }).success)
	ok(bulkBodySchema.safeParse({ action: 'removeTags', target: { ids: [hex(1)] }, tags: s.remove }).success)
	ok(bulkBodySchema.safeParse({ action: 'addTags', target: { search: { q: 'tag:kitchen', expect: 37 } }, tags: s.add }).success)
	eq(describeBulk(s, 37), 'Add 3 tags and remove 2 tags on 37 images.')
	eq(describeBulk({ add: ['a'], remove: [] }, 1), 'Add 1 tag on 1 image.')
	eq(describeBulk({ add: [], remove: ['a'] }, 2), 'Remove 1 tag on 2 images.')
	eq(describeBulk({ add: [], remove: [] }, 2), '')
})

/* ========================================================================== */
/* Pure: the tag manager                                                      */
/* ========================================================================== */

const { filterAndSortTags, renameImpact, mergeTargets, decideMergeKey, managerReducer, initialManager, tagsOf, splitCaption, ROWS_PER_PAGE } = manager

const labels = (rows) => rows.map((r) => r.label)

await check('manager table: most images first, ties alphabetical, A to Z natural; the input is never mutated', () => {
	const tags = deepFreeze([stat('Beta', 5), stat('Alpha', 5), stat('Room 10', 9), stat('Room 2', 9), stat('Zed', 100), stat('apple', 5)])
	eq(labels(filterAndSortTags(tags, { query: '', sort: 'count' })), ['Zed', 'Room 2', 'Room 10', 'Alpha', 'apple', 'Beta'])
	eq(labels(filterAndSortTags(tags, { query: '', sort: 'az' })), ['Alpha', 'apple', 'Beta', 'Room 2', 'Room 10', 'Zed'], 'natural: Room 2 before Room 10; case ignored')
	eq(filterAndSortTags([], { query: '', sort: 'count' }), [])
	const again = filterAndSortTags(tags, { query: '', sort: 'count' })
	ok(again !== tags && labels(tags)[0] === 'Beta', 'a new array, in the order given')
	// A tie of both count and label is broken by slug, so the order never shuffles between reloads.
	const tie = filterAndSortTags([stat('Same', 1, { slug: 'b' }), stat('Same', 1, { slug: 'a' })], { query: '', sort: 'count' })
	eq(tie.map((r) => r.slug), ['a', 'b'])
})

await check('manager table: search matches the label or the slug, ignoring case, accents and punctuation', () => {
	const tags = [stat('Kitchen', 5), stat('Kitchen Remodel', 3), stat('Café', 2), stat('Van', 1), stat('日本', 1)]
	const found = (query, sort = 'count') => labels(filterAndSortTags(tags, { query, sort }))
	eq(found('KIT'), ['Kitchen', 'Kitchen Remodel'])
	eq(found('kitchen remodel'), ['Kitchen Remodel'], 'a multi-word query matches the slug too')
	eq(found('kitchen-remodel'), ['Kitchen Remodel'])
	eq(found('cafe'), ['Café'], 'accents fold through the slug')
	eq(found('  van  '), ['Van'])
	eq(found('日'), ['日本'])
	eq(found('kitchen_remodel'), ['Kitchen Remodel'], 'punctuation in the query is read the way a slug is')
	eq(found('Café!'), ['Café'])
	eq(found('KITCHEN  REMODEL'), ['Kitchen Remodel'])
	eq(found('zzz'), [])
	eq(found('').length, 5, 'blank shows everything')
	eq(found('   ').length, 5)
	eq(found('!!!').length, 0, 'punctuation matches only text that contains it')
	for (const bad of [undefined, null, 5, {}]) eq(filterAndSortTags(tags, { query: bad, sort: 'count' }).length, 5)
	eq(labels(filterAndSortTags(tags, { query: 'kit', sort: 'az' })), ['Kitchen', 'Kitchen Remodel'])
})

await check('manager table: hostile rows are dropped and a huge list is bounded', () => {
	const rows = filterAndSortTags([null, 5, 'x', { slug: '' }, stat('Ok', 1), { slug: 'ok', label: 'dup', count: 9 }], { query: '', sort: 'count' })
	eq(labels(rows), ['Ok'])
	for (const bad of [undefined, null, 'rows', 5, {}]) eq(filterAndSortTags(bad, { query: '', sort: 'count' }), [])
	const big = Array.from({ length: 6000 }, (_, i) => stat(`T${i}`, i))
	eq(filterAndSortTags(big, { query: '', sort: 'count' }).length, manager.MANAGER_TAGS_MAX)
	const t0 = performance.now()
	filterAndSortTags(big, { query: 't1', sort: 'az' })
	ok(performance.now() - t0 < 500, 'searching thousands of tags is instant')
})

await check('rename: the impact is known before saving, and a collision is a merge', () => {
	const tags = [stat('Kitchen', 214), stat('Kitchens', 12), stat('Van', 3)]
	const impact = (slug, draft) => renameImpact(tags, slug, draft)
	eq(impact('kitchens', 'kitchen').kind, 'merge', 'the new name is another tag')
	eq(impact('kitchens', 'kitchen').into.label, 'Kitchen')
	eq(impact('kitchens', 'KITCHEN!').kind, 'merge', 'case and punctuation are the same name')
	eq(impact('kitchens', ' Kitchen ').kind, 'merge')
	eq(impact('van', 'Truck'), { kind: 'rename', slug: 'truck', label: 'Truck' })
	eq(impact('van', 'Delivery van').kind, 'rename')
	eq(impact('van', 'Van'), { kind: 'unchanged' })
	eq(impact('van', 'van'), { kind: 'spelling', slug: 'van', label: 'van' }, 'same identity, different writing')
	eq(impact('van', 'VAN!'), { kind: 'spelling', slug: 'van', label: 'VAN!' })
	eq(impact('kitchen', 'Kitchens').kind, 'merge', 'the other way round')
	for (const draft of ['', '   ', '​']) eq(impact('van', draft), { kind: 'invalid', message: 'Give the tag a name.' }, JSON.stringify(draft))
	eq(impact('van', '!!!').kind, 'invalid')
	ok(impact('van', '!!!').message.includes('at least one letter or number'))
	ok(impact('van', 'x'.repeat(41)).message.includes('at most 40 characters'))
	eq(impact('van', 'x'.repeat(40)).kind, 'rename')
	eq(impact('gone', 'Van').kind, 'merge', 'a tag that has vanished from the list still collides by name')
	eq(renameImpact([], 'van', 'Truck').kind, 'rename')
	for (const bad of [undefined, null, 'x', 5]) throwsNothing(() => renameImpact(bad, 'van', 'x'))
	// Whatever it calls a rename or merge, the label is something the schema accepts.
	for (const draft of ['Truck', 'Kitchen', 'iPhone 15', '日本']) {
		const r = impact('van', draft)
		if (r.label) ok(assetPatchSchema.safeParse({ addTags: [r.label] }).success, draft)
	}
})

await check('merge: candidates are the other tags, most used first, narrowed by what is typed', () => {
	const tags = [stat('Van', 3), stat('Truck', 90), stat('Car', 7), stat('Cargo', 7)]
	eq(labels(mergeTargets(tags, 'van', '')), ['Truck', 'Car', 'Cargo'])
	eq(labels(mergeTargets(tags, 'van', 'car')), ['Car', 'Cargo'])
	eq(labels(mergeTargets(tags, 'van', 'van')), [], 'never itself')
	eq(labels(mergeTargets(tags, 'van', '', 2)), ['Truck', 'Car'])
	eq(mergeTargets(tags, 'van', '', 0), [])
	eq(mergeTargets(tags, 'van', '', -3), [])
	eq(mergeTargets([], 'van', ''), [])
	eq(mergeTargets(tags, 'gone', '').length, 4)
	eq(mergeTargets(Array.from({ length: 200 }, (_, i) => stat(`T${i}`, i)), 'x', '').length, manager.MERGE_OPTIONS_MAX)
})

await check('merge keys: arrows walk the candidates, Enter picks, Esc backs out', () => {
	const k = (name, over = {}) => decideMergeKey({ key: name, ...over }, { count: 3, active: -1 })
	eq(k('ArrowDown'), { type: 'move', active: 0 })
	eq(k('ArrowUp'), { type: 'move', active: 2 })
	eq(decideMergeKey({ key: 'ArrowDown' }, { count: 3, active: 2 }), { type: 'move', active: -1 })
	eq(decideMergeKey({ key: 'Enter' }, { count: 3, active: 1 }), { type: 'choose', index: 1 })
	eq(decideMergeKey({ key: 'Enter' }, { count: 1, active: -1 }), { type: 'choose', index: 0 }, 'the only candidate left')
	eq(decideMergeKey({ key: 'Enter' }, { count: 3, active: -1 }), { type: 'none' }, 'not a guess among several')
	eq(decideMergeKey({ key: 'Enter' }, { count: 0, active: -1 }), { type: 'none' })
	eq(k('Escape'), { type: 'cancel' })
	eq(k('Tab'), { type: 'none' })
	eq(decideMergeKey({ key: 'ArrowDown' }, { count: 0, active: -1 }), { type: 'none' })
	eq(k('ArrowDown', { shiftKey: true }), { type: 'none' })
	eq(k('Enter', { ctrlKey: true }), { type: 'none' })
	eq(k('Enter', { isComposing: true }), { type: 'none' })
	eq(k('Escape', { isComposing: true }), { type: 'none' })
})

await check('manager state: load, reload and failure keep the rows that were good', () => {
	let s = initialManager()
	eq([s.load.status, s.sort, s.query, s.shown, s.row, s.notice], ['loading', 'count', '', ROWS_PER_PAGE, null, null])
	eq(tagsOf(s), [])
	s = managerReducer(s, { type: 'loaded', tags: [stat('Kitchen', 5), null, stat('Van', 2)] })
	eq(s.load.status, 'ready')
	eq(labels(tagsOf(s)), ['Kitchen', 'Van'], 'cleaned on the way in')
	s = managerReducer(s, { type: 'load', refresh: true })
	eq([s.load.status, s.load.refreshing, labels(tagsOf(s))], ['ready', true, ['Kitchen', 'Van']], 'a reload keeps the rows')
	s = managerReducer(s, { type: 'load-failed', message: 'Offline.' })
	eq([s.load.status, s.load.refreshing, s.load.refreshError, labels(tagsOf(s))], ['ready', false, 'Offline.', ['Kitchen', 'Van']])
	s = managerReducer(s, { type: 'loaded', tags: [stat('Kitchen', 6)] })
	eq([s.load.refreshError, labels(tagsOf(s))], [null, ['Kitchen']], 'a good reload clears the failure')
	const failedFirst = managerReducer(managerReducer(initialManager(), { type: 'load', refresh: false }), { type: 'load-failed', message: 'Could not load your tags.' })
	eq(failedFirst.load, { status: 'error', message: 'Could not load your tags.' })
	eq(tagsOf(failedFirst), [])
	eq(managerReducer(failedFirst, { type: 'load', refresh: false }).load.status, 'loading', 'retry shows the skeleton again')
	eq(managerReducer(failedFirst, { type: 'load', refresh: true }).load.status, 'loading', 'a refresh with nothing to keep is a plain load')
})

await check('manager state: a list that is not a list is an empty library, never a crash', () => {
	for (const junk of ['junk', null, undefined, 5, {}, [null, 3, 'x']]) {
		const s = managerReducer(initialManager(), { type: 'loaded', tags: junk })
		eq([s.load.status, tagsOf(s)], ['ready', []], String(junk))
	}
})

await check('manager state: searching and sorting start again from the first page; "more" shows another page', () => {
	let s = managerReducer(initialManager(), { type: 'more' })
	eq(s.shown, ROWS_PER_PAGE * 2)
	s = managerReducer(s, { type: 'query', value: 'kit' })
	eq([s.query, s.shown], ['kit', ROWS_PER_PAGE])
	s = managerReducer(managerReducer(s, { type: 'more' }), { type: 'sort', value: 'az' })
	eq([s.sort, s.shown], ['az', ROWS_PER_PAGE])
})

await check('manager state: one change at a time, a running change cannot be cancelled, and success becomes a notice', () => {
	const ready = managerReducer(initialManager(), { type: 'loaded', tags: [stat('Kitchen', 5), stat('Van', 2)] })
	let s = managerReducer(ready, { type: 'rename-open', slug: 'kitchen', label: 'Kitchen' })
	eq(s.row, { mode: 'rename', slug: 'kitchen', draft: 'Kitchen', busy: false, error: null })
	s = managerReducer(s, { type: 'rename-edit', draft: 'Kitchens' })
	eq(s.row.draft, 'Kitchens')
	s = managerReducer(s, { type: 'merge-open', slug: 'van' })
	eq([s.row.mode, s.row.slug], ['merge', 'van'], 'opening another row replaces the first')
	s = managerReducer(s, { type: 'rename-edit', draft: 'ignored' })
	eq(s.row.mode, 'merge', 'an edit for another mode changes nothing')
	s = managerReducer(managerReducer(s, { type: 'merge-query', value: 'kit' }), { type: 'merge-pick', target: 'kitchen' })
	eq([s.row.query, s.row.target], ['kit', 'kitchen'])
	s = managerReducer(s, { type: 'row-busy' })
	eq(s.row.busy, true)
	const busyRow = s.row
	for (const action of [{ type: 'row-close' }, { type: 'rename-open', slug: 'kitchen', label: 'K' }, { type: 'merge-open', slug: 'kitchen' }, { type: 'delete-open', slug: 'kitchen' }])
		eq(managerReducer(s, action).row, busyRow, `${action.type} while busy`)
	const failedRow = managerReducer(s, { type: 'row-failed', message: 'That did not work.' })
	eq([failedRow.row.busy, failedRow.row.error], [false, 'That did not work.'])
	eq(managerReducer(failedRow, { type: 'row-close' }).row, null, 'after a failure it can be cancelled')
	eq(managerReducer(failedRow, { type: 'merge-pick', target: null }).row.error, null, 'changing the choice clears the message')
	const done = managerReducer(s, { type: 'changed', notice: 'Merged into "Truck".' })
	eq([done.row, done.notice], [null, 'Merged into "Truck".'])
	eq(managerReducer(done, { type: 'dismiss-notice' }).notice, null)
	eq(managerReducer(done, { type: 'delete-open', slug: 'van' }).notice, null, 'starting something new retires the old notice')
	eq(managerReducer(ready, { type: 'row-busy' }), ready, 'no row, nothing to lock')
	eq(managerReducer(ready, { type: 'row-failed', message: 'x' }), ready)
	eq(managerReducer(ready, { type: 'bogus' }), ready)
	const quiet = managerReducer(ready, { type: 'dismiss-notice' })
	ok(quiet === ready, 'dismissing nothing changes nothing')
	eq(splitCaption({ manual: 1234, auto: 0 }), '1,234 manual · 0 automatic')
})

/* ========================================================================== */
/* Property checks: random but reproducible input, invariants from the spec   */
/* ========================================================================== */

function rng(seedStart) {
	let seed = seedStart
	return () => {
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)]
const shuffled = (rnd, list) => {
	const out = [...list]
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rnd() * (i + 1))
		;[out[i], out[j]] = [out[j], out[i]]
	}
	return out
}

await check('property: a random run of optimistic changes always ends exactly where the page says, never losing or inventing a tag', () => {
	const rnd = rng(7)
	const words = ['Kitchen', 'Van', 'Truck', 'Remodel', 'Before', 'After', 'Pantry', 'Sink', 'Tile']
	for (let run = 0; run < 400; run++) {
		const base = deepFreeze(
			words
				.filter(() => rnd() < 0.5)
				.map((w) => (rnd() < 0.5 ? manual(w) : auto(w))),
		)
		let state = deepFreeze(initialTagOps())
		const live = []
		let id = 1
		for (let step = 0; step < 12; step++) {
			const roll = rnd()
			if (roll < 0.5 || live.length === 0) {
				const word = pick(rnd, words)
				const kind = pick(rnd, ['add', 'remove', 'promote'])
				const op = kind === 'add' ? { id: id++, kind, labels: [word, pick(rnd, words)] } : { id: id++, kind, slug: slugify(word) }
				live.push(op.id)
				state = tagOpsReducer(state, { type: 'start', op })
			} else {
				const at = Math.floor(rnd() * live.length)
				const [done] = live.splice(at, 1)
				state = tagOpsReducer(state, roll < 0.75 ? { type: 'settle', id: done } : { type: 'fail', id: done, message: 'No.' })
			}
			const shown = projectTags(base, state.ops)
			// Every slug shown is unique; nothing shown is unknown.
			eq(new Set(shown.map((t) => t.slug)).size, shown.length, 'repeated slug')
			for (const t of shown) ok(t.slug === slugify(t.label) || base.some((b) => b.slug === t.slug), `invented ${t.slug}`)
			for (const t of shown) ok(t.pending === undefined || ['add', 'promote'].includes(t.pending))
			// A tag no change touches is shown exactly as the page has it.
			const touched = new Set(state.ops.flatMap((op) => (op.kind === 'add' ? op.labels.map((l) => slugify(l)) : [op.slug])))
			for (const b of base) if (!touched.has(b.slug)) ok(shown.some((t) => t.slug === b.slug && t.source === b.source && t.pending === undefined), `lost or changed ${b.slug}`)
		}
		for (const done of live) state = tagOpsReducer(state, { type: 'settle', id: done })
		eq(state.ops, [])
		eq(projectTags(base, state.ops).map((t) => `${t.slug}:${t.source}`), base.map((t) => `${t.slug}:${t.source}`), 'with nothing pending, the page is the truth')
	}
})

await check('property: suggestion rows are bounded, unique, and follow the stem rules for any library', () => {
	const rnd = rng(11)
	const stems = ['kitchen', 'van', 'truck', 'remodel', 'tile', 'box', 'bunny', 'child', 'dog']
	const endings = ['', 's', 'es', 'ing', 'ed', 'ies']
	for (let run = 0; run < 1500; run++) {
		const library = shuffled(rnd, stems.flatMap((s) => endings.map((e) => s + e)))
			.filter(() => rnd() < 0.4)
			.map((w, i) => stat(w[0].toUpperCase() + w.slice(1), 1 + Math.floor(rnd() * 500) + i))
		const typed = pick(rnd, stems) + pick(rnd, endings)
		const existing = new Map(rnd() < 0.5 ? [[slugify(typed), 'manual']] : [])
		const { options, defaultIndex } = rankTagSuggestions(typed, library, existing)
		ok(options.length >= 1 && options.length <= editor.TAG_OPTIONS_MAX)
		eq(new Set(options.map((o) => o.key)).size, options.length, 'keys are unique')
		eq(options.filter((o) => o.kind === 'use').length <= 1, true, 'at most one Use row')
		const slug = slugify(typed)
		const exact = library.find((s) => s.slug === slug)
		const mates = library.filter((s) => s.slug !== slug && stemKey(s.slug) === stemKey(slug))
		if (exact) {
			eq([options[0].kind, options[0].slug], ['tag', slug], 'the exact tag leads')
			ok(!options.some((o) => o.kind === 'create'), 'no Create next to an existing tag')
			eq(defaultIndex, 0)
		} else if (mates.length === 1) {
			eq([options[0].kind, options[0].slug], ['use', mates[0].slug], 'one stem-mate is offered first')
			eq(options[1].kind, 'create')
			eq(defaultIndex, 0)
		} else {
			eq(options[0].kind, 'create', 'nothing close: what was typed leads')
			eq(defaultIndex, -1, `no highlight with ${mates.length} stem-mates`)
			ok(!options.some((o) => o.kind === 'use'), 'never a guess')
		}
		for (const o of options) if (o.kind !== 'create') ok(library.some((s) => s.slug === o.slug), 'a row for a tag that is not there')
	}
})

await check('property: the tag table is the same whatever order the server sends, sorted as asked, and never invents rows', () => {
	const rnd = rng(13)
	for (let run = 0; run < 300; run++) {
		const size = 1 + Math.floor(rnd() * 40)
		const tags = Array.from({ length: size }, (_, i) => stat(pick(rnd, ['Alpha', 'beta', 'Gamma', 'delta', 'Room 2', 'Room 10', 'Café']) + (rnd() < 0.5 ? ` ${i}` : ''), Math.floor(rnd() * 5), { slug: `s${i}` }))
		for (const sort of ['count', 'az']) {
			for (const query of ['', 'room', 'a', 'zzz', ' alpha ']) {
				const a = filterAndSortTags(tags, { query, sort })
				const b = filterAndSortTags(shuffled(rnd, tags), { query, sort })
				eq(a.map((t) => t.slug), b.map((t) => t.slug), `order depends on input order (${sort}, "${query}")`)
				ok(a.every((t) => tags.some((o) => o.slug === t.slug)))
				if (sort === 'count') for (let i = 1; i < a.length; i++) ok(a[i - 1].count >= a[i].count, 'not sorted by count')
				if (!query.trim()) eq(a.length, tags.length, 'nothing dropped without a search')
			}
		}
	}
})

await check('property: a rename is a merge exactly when the new name is another tag, and the label is always one the schema accepts', () => {
	const rnd = rng(17)
	const names = ['Kitchen', 'kitchen', 'KITCHENS', 'Van', 'Truck!', 'truck', 'Straße', 'Cafe', 'Café', '日本', '!!!', '', '  ', 'x'.repeat(41), 'Room 2', 'room-2']
	for (let run = 0; run < 2000; run++) {
		const tags = shuffled(rnd, ['Kitchen', 'Kitchens', 'Van', 'Truck', 'Strasse', 'Café', 'Room 2']).filter(() => rnd() < 0.6).map((l) => stat(l, 1 + Math.floor(rnd() * 9)))
		const from = tags.length ? pick(rnd, tags) : stat('Lonely', 1)
		const draft = pick(rnd, names)
		const result = renameImpact(tags, from.slug, draft)
		const slug = slugify(draft.replace(/\s+/g, ' ').trim())
		if (result.kind === 'invalid') ok(slug === '' || Array.from(draft.trim()).length > 40, `invalid for a fine name ${JSON.stringify(draft)}`)
		else {
			if (result.kind !== 'unchanged') eq(result.slug, slug)
			const other = tags.find((t) => t.slug === slug && t.slug !== from.slug)
			if (result.kind === 'merge') ok(other && result.into.slug === slug, 'a merge into something that is not there')
			else ok(!other, `a collision with ${other?.slug} was not called a merge`)
			if (result.label) ok(assetPatchSchema.safeParse({ addTags: [result.label] }).success, `label ${JSON.stringify(result.label)}`)
		}
	}
})

await check('property: whenever Apply is allowed, what it sends is valid, disjoint and within the limits', () => {
	const rnd = rng(19)
	const bits = ['kitchen', 'Kitchen', 'van', 'old-logo', 'Old Logo', 'x'.repeat(41), '!!!', '', ' ', ',', ', ', 'a', 'b', 'c', 'Straße', 'strasse', '日本', 'a,b,c', 'tag1, tag2']
	let allowed = 0
	for (let run = 0; run < 4000; run++) {
		const build = () => Array.from({ length: Math.floor(rnd() * 4) }, () => pick(rnd, bits)).join(pick(rnd, [', ', ',', ' ', '\n']))
		const staged = Array.from({ length: Math.floor(rnd() * 5) }, () => pick(rnd, ['Kitchen', 'Van', 'a', 'b', 'Straße'])).filter((l, i, all) => all.findIndex((x) => slugify(x) === slugify(l)) === i)
		const checked = Array.from({ length: Math.floor(rnd() * 4) }, () => pick(rnd, ['kitchen', 'van', 'old-logo', 'strasse']))
		const summary = summarizeBulk({ staged, typedAdd: build(), checked, typedRemove: build(), count: pick(rnd, [0, 1, 37, 500]) })
		ok(summary.add.length <= 20 && summary.remove.length <= 40)
		if (!summary.canApply) continue
		allowed++
		ok(summary.add.length + summary.remove.length > 0)
		if (summary.add.length) ok(bulkBodySchema.safeParse({ action: 'addTags', target: { ids: [hex(1)] }, tags: summary.add }).success, JSON.stringify(summary.add))
		if (summary.remove.length) ok(bulkBodySchema.safeParse({ action: 'removeTags', target: { ids: [hex(1)] }, tags: summary.remove }).success, JSON.stringify(summary.remove))
		const adding = new Set(summary.add.map((l) => slugify(l)))
		for (const slug of summary.remove) ok(!adding.has(slug), `${slug} is added and removed`)
		eq(adding.size, summary.add.length, 'a tag added twice')
		eq(new Set(summary.remove).size, summary.remove.length)
	}
	ok(allowed > 400, `only ${allowed} runs were allowed`)
})

await check('property: a field save is always trimmed, schema-valid, and never a repeat of what is stored or on its way', () => {
	const rnd = rng(23)
	const pieces = ['', ' ', 'A van', 'x'.repeat(201), 'x'.repeat(200), '\u{20000}'.repeat(150), '  padded  ', 'line\nbreak', '\u0000', '<b>']
	for (let run = 0; run < 3000; run++) {
		const key = pick(rnd, ['name', 'caption', 'altText', 'notes'])
		const spec = FIELD_SPECS[key]
		const draft = pick(rnd, pieces) + pick(rnd, pieces)
		const saved = pick(rnd, pieces).trim()
		const sending = rnd() < 0.3 ? pick(rnd, pieces).trim() : null
		const plan = planFieldSave(spec, draft, { saved, sending })
		if (plan.type === 'save') {
			eq(plan.value, plan.value.trim())
			ok(plan.value !== saved && plan.value !== sending, 'a repeat was saved')
			ok(assetPatchSchema.safeParse({ [key]: plan.value }).success, `${key}: ${JSON.stringify(plan.value).slice(0, 40)}`)
		} else if (plan.type === 'invalid') {
			ok(spec.required ? draft.trim() === '' || Array.from(draft.trim()).length > spec.max : Array.from(draft.trim()).length > spec.max)
			ok(plan.message.length > 0)
		} else {
			ok(draft.trim() === saved || draft.trim() === sending)
		}
	}
})

await check('fuzz: whatever a broken API sends for an image, the panel body renders without a crash, a warning or an injected script', () => {
	const rnd = rng(29)
	const junk = [undefined, null, '', ' ', 'x'.repeat(3000), '<script>alert(1)</script>', 'javascript:alert(1)', '\u0000', '\u202e', Number.NaN, -1, 0, 1e308, Infinity, true, {}, [], [null], { a: 1 }, () => 1, Symbol.iterator]
	const fields = ['id', 'name', 'filename', 'url', 'contentType', 'format', 'bytes', 'width', 'height', 'orientation', 'hasAlpha', 'animated', 'colors', 'brightness', 'saturation', 'blur', 'folderId', 'folderPath', 'tags', 'caption', 'altText', 'textInImage', 'notes', 'kind', 'tagging', 'createdAt', 'updatedAt']
	const weirdTag = () => pick(rnd, [null, 5, 'x', {}, { slug: 5 }, { slug: 'a', label: {}, source: 'manual' }, { slug: 'b', label: '<b>', source: 'auto', confidence: 'high' }, { slug: '__proto__', label: 'p', source: 'manual' }, { slug: 'c', label: 'C', source: 'manual', pending: 'add' }])
	const weirdColor = () => pick(rnd, [null, 5, {}, { name: 5 }, { name: 'blue', hex: 5 }, { name: 'blue', hex: '#fff', share: 'x' }, { name: '<i>', hex: 'url(x)', share: 9 }])
	let rendered = 0
	for (let run = 0; run < 400; run++) {
		const bad = asset()
		for (const field of fields) if (rnd() < 0.3) bad[field] = pick(rnd, junk)
		if (rnd() < 0.5) bad.tags = Array.from({ length: Math.floor(rnd() * 6) }, weirdTag)
		if (rnd() < 0.5) bad.colors = Array.from({ length: Math.floor(rnd() * 6) }, weirdColor)
		if (rnd() < 0.3) bad.tagging = pick(rnd, [{ status: 'failed', error: {} }, { status: 5 }, { status: 'done', reason: '__proto__' }, []])
		const canWrite = rnd() < 0.5
		const html = renderToString(h(panel.DetailPanelBody, bodyProps({ asset: bad, canWrite, canDelete: rnd() < 0.5, aiConfigured: rnd() < 0.5, folders: rnd() < 0.3 ? pick(rnd, [null, [null], [{}], 'x']) : folders })))
		rendered++
		ok(!html.includes('<script>'), 'a script was injected')
		ok(!/(href|src)="javascript:/i.test(html), 'a javascript: URL')
		const plain = html.replace(/<svg[\s\S]*?<\/svg>/g, '')
		const leak = /(>|\s)(undefined|NaN|null)(<|\s)|\[object Object\]/.exec(plain)
		ok(!leak, `a value leaked into the text: ${leak && plain.slice(Math.max(0, leak.index - 90), leak.index + 40)}`)
	}
	eq(rendered, 400)
})

await check('fuzz: junk in the lists the other components are handed renders without a crash, a warning or a leak', () => {
	const rnd = rng(31)
	const junk = [undefined, null, '', 'x'.repeat(400), '<script>alert(1)</script>', Number.NaN, -1, 1e308, Infinity, true, {}, [], () => 1, Symbol.iterator, '5']
	const leaks = (html, label) => {
		const plain = html.replace(/<svg[\s\S]*?<\/svg>/g, '')
		const leak = /(>|\s)(undefined|NaN|null)(<|\s)|\[object Object\]/.exec(plain)
		ok(!leak, `${label}: a value leaked into the text: ${leak && plain.slice(Math.max(0, leak.index - 80), leak.index + 40)}`)
		ok(!plain.includes('<script>'), `${label}: a script was injected`)
	}
	const weirdTag = () => pick(rnd, [...junk, { slug: pick(rnd, junk), label: pick(rnd, junk), source: pick(rnd, ['manual', 'auto', ...junk]), confidence: pick(rnd, junk), via: pick(rnd, junk) }, { slug: 'a', label: 'A', source: 'manual' }])
	const weirdStat = () => pick(rnd, [...junk, { slug: pick(rnd, junk), label: pick(rnd, junk), count: pick(rnd, junk), manual: pick(rnd, junk), auto: pick(rnd, junk) }, stat('Ok', 3)])
	const weirdExisting = () => pick(rnd, [...junk, { slug: pick(rnd, junk), label: pick(rnd, junk), count: pick(rnd, junk) }, { slug: 'kitchen', label: 'Kitchen', count: 3 }])
	for (let run = 0; run < 600; run++) {
		const tags = pick(rnd, [undefined, null, 'tags', ...[Array.from({ length: Math.floor(rnd() * 8) }, weirdTag)]])
		leaks(renderEditor({ tags, canEdit: rnd() < 0.5, onTagClick: rnd() < 0.5 ? noop : undefined, onPromote: rnd() < 0.5 ? asyncNoop : undefined }), 'editor')

		const existing = pick(rnd, [undefined, null, 'x', Array.from({ length: Math.floor(rnd() * 8) }, weirdExisting)])
		leaks(renderToString(h(bulk.BulkTagForm, bulkProps({ count: pick(rnd, [37, 0, -1, Number.NaN, '5', {}, undefined, Infinity]), existing }))), 'bulk')

		const state = managerReducer(initialManager(), { type: 'loaded', tags: Array.from({ length: Math.floor(rnd() * 10) }, weirdStat) })
		leaks(mgrView({ ...state, query: pick(rnd, ['', 'a', '<b>', 'x'.repeat(300), ' ']), sort: pick(rnd, ['count', 'az', 'bogus']), shown: pick(rnd, [100, 0, -1, Number.NaN, 1e9]), notice: pick(rnd, [null, 'Done.', '<i>x</i>']) }, { canEdit: rnd() < 0.5, canDelete: rnd() < 0.5 }), 'manager')
	}
})

/* ========================================================================== */
/* Interactive: the tag editor, driven through the real component             */
/* ========================================================================== */

const isCombobox = (n) => n.type === 'input' && n.props.role === 'combobox'
const flatText = (app, node) => app.text(node).replace(/\s+/g, ' ').trim()
const optionTexts = (app) => app.byRole('option').map((o) => flatText(app, o))
const chipsOf = (app) => app.bySlot('tag-chip')
const chipSlugs = (app) => chipsOf(app).map((c) => c.props['data-slug'])
const alertText = (app) => app.byRole('alert').map((n) => flatText(app, n)).join(' | ')

/** A tag editor wired to promises a test holds open, a clock it advances, and logs of every call. */
function editorRig({ hold = false, ...over } = {}) {
	const clock = new FakeClock()
	clock.install()
	const log = { add: [], remove: [], promote: [], suggest: [], click: [] }
	const gates = { add: [], remove: [], promote: [] }
	const gated = (name) => (arg) => {
		log[name].push(arg)
		// Held: the test settles it by hand, so "in flight" is a state it can inspect.
		if (!hold) return Promise.resolve()
		const gate = deferred()
		gates[name].push(gate)
		return gate.promise
	}
	const props = {
		tags: [],
		canEdit: true,
		onAdd: gated('add'),
		onRemove: gated('remove'),
		onPromote: gated('promote'),
		onTagClick: (slug) => log.click.push(slug),
		fetchSuggestions: (q, signal) => {
			const gate = deferred()
			log.suggest.push({ q, signal, gate })
			return gate.promise
		},
		...over,
	}
	const app = mount(editor.TagEditor, props)
	return {
		app,
		clock,
		log,
		gates,
		input: () => app.find(isCombobox),
		done: () => {
			app.unmount()
			clock.uninstall()
		},
	}
}

/** Type, let the debounce pass and answer the lookup, the way a person pausing would. */
async function typeAndAnswer(rig, text, stats) {
	typeInto(rig.app, rig.input(), text)
	rig.clock.advance(editor.TAG_SUGGEST_DELAY_MS)
	const call = rig.log.suggest.at(-1)
	call.gate.resolve(stats)
	await rig.app.settle()
	return call
}

await check('editor: typing asks the server after a 120 ms pause, shows matches with counts, and wires the combobox ARIA', async () => {
	const rig = editorRig()
	try {
		typeInto(rig.app, rig.input(), 'kit')
		eq(rig.log.suggest.length, 0, 'nothing yet')
		rig.clock.advance(119)
		eq(rig.log.suggest.length, 0)
		rig.clock.advance(1)
		eq(rig.log.suggest.map((c) => c.q), ['kit'])
		eq(rig.input().props['aria-expanded'], true, 'the list is already open with what can be said so far')
		rig.log.suggest[0].gate.resolve([stat('Kitchen', 214), stat('Kit car', 3)])
		await rig.app.settle()
		eq(optionTexts(rig.app), ['Create "kit"', 'Kitchen (214)', 'Kit car (3)'])
		const input = rig.input()
		eq(input.props['aria-expanded'], true)
		eq(input.props['aria-autocomplete'], 'list')
		eq(input.props.role, 'combobox')
		const list = rig.app.find((n) => n.props.role === 'listbox')
		eq(input.props['aria-controls'], list.props.id)
		ok(!list.props.hidden)
		const options = rig.app.byRole('option')
		eq(options.map((o) => o.props['aria-selected']), [false, false, false], 'nothing is highlighted when nothing is close')
		eq(input.props['aria-activedescendant'], undefined)
		ok(!input.props.disabled)
	} finally {
		rig.done()
	}
})

await check('editor: "Kitchens" with "Kitchen" in the library offers Use "Kitchen" first, highlighted, and Enter takes it', async () => {
	const rig = editorRig()
	try {
		await typeAndAnswer(rig, 'Kitchens', [stat('Kitchen', 214)])
		eq(optionTexts(rig.app), ['Use "Kitchen" (214)', 'Create "Kitchens"'])
		const options = rig.app.byRole('option')
		eq(options.map((o) => o.props['aria-selected']), [true, false])
		eq(rig.input().props['aria-activedescendant'], options[0].props.id, 'the highlight is announced')
		const event = press(rig.app, rig.input(), 'Enter')
		ok(event.defaultPrevented)
		await rig.app.settle()
		eq(rig.log.add, [['Kitchen']], 'the existing tag, in its own spelling')
		eq(rig.input().props.value, '', 'the box is cleared')
		eq(rig.input().props['aria-expanded'], false)
	} finally {
		rig.done()
	}
})

await check('editor: arrow keys move the highlight, so the person can keep the new spelling ("Create")', async () => {
	const rig = editorRig()
	try {
		await typeAndAnswer(rig, 'Kitchens', [stat('Kitchen', 214)])
		press(rig.app, rig.input(), 'ArrowDown')
		eq(rig.app.byRole('option').map((o) => o.props['aria-selected']), [false, true])
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [['Kitchens']])
		// Down past the end is "nothing highlighted", and Enter then adds the typed text too.
		rig.log.add.length = 0
		await typeAndAnswer(rig, 'Kitchens', [stat('Kitchen', 214)])
		press(rig.app, rig.input(), 'ArrowDown')
		press(rig.app, rig.input(), 'ArrowDown')
		eq(rig.app.byRole('option').map((o) => o.props['aria-selected']), [false, false])
		eq(rig.input().props['aria-activedescendant'], undefined)
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add.at(-1), ['Kitchens'])
		// Up from the default goes to "nothing", then to the last row.
		await typeAndAnswer(rig, 'Kitchens', [stat('Kitchen', 214)])
		press(rig.app, rig.input(), 'ArrowUp')
		eq(rig.app.byRole('option').map((o) => o.props['aria-selected']), [false, false])
		press(rig.app, rig.input(), 'ArrowUp')
		eq(rig.app.byRole('option').map((o) => o.props['aria-selected']), [false, true])
	} finally {
		rig.done()
	}
})

await check('editor: Enter with nothing highlighted adds the typed text; a comma adds it too, never the nudged suggestion', async () => {
	const rig = editorRig()
	try {
		typeInto(rig.app, rig.input(), 'zebra')
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [['zebra']])
		// A comma commits what was typed even when Use "Kitchen" is highlighted.
		await typeAndAnswer(rig, 'Kitchens', [stat('Kitchen', 214)])
		eq(rig.app.byRole('option')[0].props['aria-selected'], true)
		typeInto(rig.app, rig.input(), 'Kitchens,')
		await rig.app.settle()
		eq(rig.log.add.at(-1), ['Kitchens'])
		eq(rig.input().props.value, '', 'what follows the comma starts a new tag')
		// The text after the comma stays.
		typeInto(rig.app, rig.input(), 'alpha,beta')
		await rig.app.settle()
		eq(rig.log.add.at(-1), ['alpha'])
		eq(rig.input().props.value, 'beta')
		// A comma alone, or after nothing, adds nothing.
		const before = rig.log.add.length
		typeInto(rig.app, rig.input(), ',')
		eq(rig.input().props.value, '')
		await rig.app.settle()
		eq(rig.log.add.length, before)
	} finally {
		rig.done()
	}
})

await check('editor: Enter with nothing typed does nothing and is swallowed, so a form around the box is never submitted by it', async () => {
	const rig = editorRig()
	try {
		const empty = press(rig.app, rig.input(), 'Enter')
		ok(empty.defaultPrevented)
		typeInto(rig.app, rig.input(), '   ')
		ok(press(rig.app, rig.input(), 'Enter').defaultPrevented, 'blank space is not a tag either')
		await rig.app.settle()
		eq(rig.log.add, [])
		// A double tap: the first adds, the second is swallowed.
		typeInto(rig.app, rig.input(), 'alpha')
		press(rig.app, rig.input(), 'Enter')
		const second = press(rig.app, rig.input(), 'Enter')
		ok(second.defaultPrevented)
		await rig.app.settle()
		eq(rig.log.add, [['alpha']])
		// Ctrl+Enter is not ours.
		ok(!press(rig.app, rig.input(), 'Enter', { ctrlKey: true }).defaultPrevented)
	} finally {
		rig.done()
	}
})

await check('editor: Tab adds the typed text only while typing, and keeps focus in the box; otherwise it just moves on', async () => {
	const rig = editorRig()
	try {
		const empty = press(rig.app, rig.input(), 'Tab')
		ok(!empty.defaultPrevented, 'an empty box lets focus move')
		await rig.app.settle()
		eq(rig.log.add, [])
		typeInto(rig.app, rig.input(), 'alpha')
		const typed = press(rig.app, rig.input(), 'Tab')
		ok(typed.defaultPrevented, 'the Tab was used to add')
		await rig.app.settle()
		eq(rig.log.add, [['alpha']])
		const shift = press(rig.app, rig.input(), 'Tab', { shiftKey: true })
		ok(!shift.defaultPrevented)
		// With the nudged suggestion highlighted by default, Tab still adds what was typed...
		await typeAndAnswer(rig, 'Kitchens', [stat('Kitchen', 214)])
		press(rig.app, rig.input(), 'Tab')
		await rig.app.settle()
		eq(rig.log.add.at(-1), ['Kitchens'])
		// ...but a row the person walked to with the arrows is taken.
		await typeAndAnswer(rig, 'Kitchens', [stat('Kitchen', 214)])
		press(rig.app, rig.input(), 'ArrowDown')
		press(rig.app, rig.input(), 'ArrowUp')
		press(rig.app, rig.input(), 'Tab')
		await rig.app.settle()
		eq(rig.log.add.at(-1), ['Kitchen'])
	} finally {
		rig.done()
	}
})

await check('editor: pasting "a, b, c" adds three tags in ONE call; a single word pastes as ordinary text', async () => {
	const rig = editorRig()
	try {
		const list = pasteInto(rig.app, rig.input(), 'a, b, c')
		ok(list.defaultPrevented)
		await rig.app.settle()
		eq(rig.log.add, [['a', 'b', 'c']], 'one call')
		eq(rig.input().props.value, '')
		const word = pasteInto(rig.app, rig.input(), 'kitchen')
		ok(!word.defaultPrevented, 'the browser pastes a single word')
		await rig.app.settle()
		eq(rig.log.add.length, 1)
		// A pasted column from a spreadsheet, and a row.
		pasteInto(rig.app, rig.input(), 'x\ny\r\nz')
		pasteInto(rig.app, rig.input(), 'p\tq')
		await rig.app.settle(6)
		eq(rig.log.add.slice(1), [['x', 'y', 'z'], ['p', 'q']])
	} finally {
		rig.done()
	}
})

await check('editor: pasting into text already typed splices at the caret and reads the whole thing', async () => {
	const rig = editorRig()
	try {
		typeInto(rig.app, rig.input(), 'ab')
		pasteInto(rig.app, rig.input(), ', y', { start: 1, end: 1 })
		await rig.app.settle()
		eq(rig.log.add, [['a', 'yb']], 'the text before the caret, the pasted list and the text after, read as one')
	} finally {
		rig.done()
	}
})

await check('editor: pasting more than 20 sends 20 and keeps the rest in the box with a reason', async () => {
	const rig = editorRig({ hold: true })
	try {
		const text = Array.from({ length: 25 }, (_, i) => `tag ${i + 1}`).join(', ')
		pasteInto(rig.app, rig.input(), text)
		await rig.app.settle()
		eq(rig.log.add.length, 1)
		eq(rig.log.add[0].length, 20)
		eq(rig.log.add[0][0], 'tag 1')
		eq(rig.log.add[0][19], 'tag 20')
		eq(rig.input().props.value, 'tag 21, tag 22, tag 23, tag 24, tag 25', 'nothing typed is thrown away')
		ok(alertText(rig.app).includes('up to 20 tags at a time'))
		ok(assetPatchSchema.safeParse({ addTags: rig.log.add[0] }).success, 'the call is one the server accepts')
		// Enter sends the rest.
		rig.gates.add[0].resolve()
		await rig.app.settle()
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add[1], ['tag 21', 'tag 22', 'tag 23', 'tag 24', 'tag 25'])
		eq(rig.input().props.value, '')
	} finally {
		rig.done()
	}
})

await check('editor: a new tag shows at once, pending, and the box stays enabled while the call is in flight', async () => {
	const rig = editorRig({ hold: true, tags: [manual('Kitchen')] })
	try {
		typeInto(rig.app, rig.input(), 'Remodel')
		press(rig.app, rig.input(), 'Enter')
		eq(chipSlugs(rig.app), ['kitchen', 'remodel'], 'the chip is there before the server has answered')
		const pending = chipsOf(rig.app)[1]
		eq(pending.props['data-pending'], 'add')
		ok(pending.props.className.includes('border-dashed') && pending.props.className.includes('opacity-70'), 'a pending style')
		ok(rig.app.text().includes('Saving…'))
		ok(!rig.input().props.disabled, 'never disabled')
		// Still typable, and a second tag can be added meanwhile.
		typeInto(rig.app, rig.input(), 'Before')
		press(rig.app, rig.input(), 'Enter')
		eq(chipSlugs(rig.app), ['kitchen', 'remodel', 'before'])
		ok(!rig.input().props.disabled)
		await rig.app.settle()
		eq(rig.log.add, [['Remodel']], 'calls go one at a time')
		// The page answers: it now holds the tags, and the pending style goes.
		rig.gates.add[0].resolve()
		await rig.app.settle()
		eq(rig.log.add, [['Remodel'], ['Before']])
		rig.app.rerender({ tags: [manual('Kitchen'), manual('Remodel')] })
		eq(chipsOf(rig.app).map((c) => c.props['data-pending']), [undefined, undefined, 'add'])
		rig.gates.add[1].resolve()
		await rig.app.settle()
		rig.app.rerender({ tags: [manual('Kitchen'), manual('Remodel'), manual('Before')] })
		eq(chipsOf(rig.app).map((c) => c.props['data-pending']), [undefined, undefined, undefined])
		ok(!rig.app.text().includes('Saving…'))
		eq(alertText(rig.app), '')
	} finally {
		rig.done()
	}
})

await check('editor: a rejected add rolls the chip back and says why inline; the next add is not blocked', async () => {
	const rig = editorRig({ hold: true, tags: [manual('Kitchen')] })
	try {
		typeInto(rig.app, rig.input(), 'Remodel')
		press(rig.app, rig.input(), 'Enter')
		typeInto(rig.app, rig.input(), 'Before')
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		rig.gates.add[0].reject(new Error('Too many tags on this image.'))
		await rig.app.settle()
		eq(chipSlugs(rig.app), ['kitchen', 'before'], 'only the failed change rolled back')
		ok(alertText(rig.app).startsWith('Too many tags on this image.'), alertText(rig.app))
		ok(!rig.input().props.disabled)
		eq(rig.log.add, [['Remodel'], ['Before']], 'the second call still ran')
		rig.gates.add[1].resolve()
		await rig.app.settle()
		// The message stays until the next action or a dismiss.
		ok(alertText(rig.app).includes('Too many tags'))
		click(rig.app, rig.app.button('Dismiss'))
		eq(alertText(rig.app), '')
		// A new request retires an old message.
		typeInto(rig.app, rig.input(), 'More')
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		rig.gates.add[2].reject(new Error('Offline.'))
		await rig.app.settle()
		ok(alertText(rig.app).startsWith('Offline.'), alertText(rig.app))
		typeInto(rig.app, rig.input(), 'Again')
		press(rig.app, rig.input(), 'Enter')
		eq(alertText(rig.app), '', 'starting something new clears the old failure')
	} finally {
		rig.done()
	}
})

await check('editor: every way a callback can fail is caught, with a sentence, and none escapes as an unhandled rejection', async () => {
	for (const failure of [
		() => Promise.reject(new Error('Specific reason.')),
		() => Promise.reject('a plain string'),
		() => Promise.reject(undefined),
		() => Promise.reject(null),
		() => Promise.reject({ message: 5 }),
		() => { throw new Error('threw before returning a promise') },
		() => Promise.reject(new Error('')),
	]) {
		const rig = editorRig({ onAdd: failure, onRemove: failure, onPromote: failure, tags: [manual('Kitchen'), auto('Van')] })
		try {
			typeInto(rig.app, rig.input(), 'Remodel')
			press(rig.app, rig.input(), 'Enter')
			await rig.app.settle(6)
			eq(chipSlugs(rig.app), ['kitchen', 'van'], 'rolled back')
			const text = alertText(rig.app)
			ok(text.length > 0, 'a message is shown')
			ok(!/undefined|null|\[object/.test(text), `the message must be a sentence, got ${text}`)
			click(rig.app, rig.app.button('Remove tag Kitchen'))
			await rig.app.settle(6)
			eq(chipSlugs(rig.app), ['kitchen', 'van'], 'a failed remove comes back')
			click(rig.app, rig.app.button('Keep tag Van'))
			await rig.app.settle(6)
			eq(chipsOf(rig.app).map((c) => c.props['data-source']), ['manual', 'auto'], 'a failed keep reverts')
		} finally {
			rig.done()
		}
	}
	await tick()
})

await check('editor: remove hides the chip at once and restores it if the call fails; Keep flips it and reverts the same way', async () => {
	const rig = editorRig({ hold: true, tags: [manual('Kitchen'), manual('Remodel'), auto('Van')] })
	try {
		click(rig.app, rig.app.button('Remove tag Remodel'))
		eq(chipSlugs(rig.app), ['kitchen', 'van'])
		await rig.app.settle()
		eq(rig.log.remove, ['remodel'])
		rig.gates.remove[0].reject(new Error('Could not remove it.'))
		await rig.app.settle()
		eq(chipSlugs(rig.app), ['kitchen', 'remodel', 'van'])
		ok(alertText(rig.app).includes('Could not remove it.'))
		click(rig.app, rig.app.button('Keep tag Van'))
		eq(chipsOf(rig.app).map((c) => `${c.props['data-slug']}:${c.props['data-source']}`), ['kitchen:manual', 'remodel:manual', 'van:manual'], 'Keep shows the result at once')
		eq(chipsOf(rig.app)[2].props['data-pending'], 'promote')
		await rig.app.settle()
		eq(rig.log.promote, ['van'])
		rig.gates.promote[0].resolve()
		await rig.app.settle()
		rig.app.rerender({ tags: [manual('Kitchen'), manual('Remodel'), manual('Van')] })
		eq(chipsOf(rig.app).map((c) => c.props['data-pending']), [undefined, undefined, undefined])
	} finally {
		rig.done()
	}
})

await check('editor: changes to one image go out in the order asked, one at a time, even when an early one is slow', async () => {
	const rig = editorRig({ hold: true, tags: [manual('Kitchen'), auto('Van')] })
	try {
		typeInto(rig.app, rig.input(), 'A')
		press(rig.app, rig.input(), 'Enter')
		click(rig.app, rig.app.button('Remove tag Kitchen'))
		click(rig.app, rig.app.button('Keep tag Van'))
		await rig.app.settle()
		const out = () => [rig.log.add.length, rig.log.remove.length, rig.log.promote.length]
		eq(out(), [1, 0, 0], 'only the first is out')
		eq(chipSlugs(rig.app), ['van', 'a'], 'but the chips already show all three changes')
		eq(chipsOf(rig.app).map((c) => c.props['data-source']), ['manual', 'manual'])
		// The page applies each answer as it comes, so the chips follow the server and never jump back.
		rig.gates.add[0].resolve()
		await rig.app.settle()
		rig.app.rerender({ tags: [manual('Kitchen'), auto('Van'), manual('A')] })
		eq(out(), [1, 1, 0])
		eq(chipSlugs(rig.app), ['van', 'a'])
		rig.gates.remove[0].resolve()
		await rig.app.settle()
		rig.app.rerender({ tags: [auto('Van'), manual('A')] })
		eq(out(), [1, 1, 1])
		eq(chipSlugs(rig.app), ['van', 'a'])
		rig.gates.promote[0].resolve()
		await rig.app.settle()
		rig.app.rerender({ tags: [manual('Van'), manual('A')] })
		eq(chipSlugs(rig.app), ['van', 'a'])
		eq(chipsOf(rig.app).map((c) => c.props['data-pending']), [undefined, undefined], 'nothing is pending any more')
		ok(!rig.app.text().includes('Saving…'))
	} finally {
		rig.done()
	}
})

await check('editor: a tag that is already on the image is not sent again, and the person is told', async () => {
	const rig = editorRig({ tags: [manual('Kitchen')] })
	try {
		typeInto(rig.app, rig.input(), 'KITCHEN')
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [])
		eq(chipSlugs(rig.app), ['kitchen'])
		eq(rig.input().props.value, '')
		const note = rig.app.byRole('status').map((n) => flatText(rig.app, n)).join(' | ')
		ok(note.includes('"KITCHEN" is already on this image.'), note)
		// Typing again retires the note.
		typeInto(rig.app, rig.input(), 'x')
		ok(!rig.app.byRole('status').some((n) => flatText(rig.app, n).includes('already on')))
		// A tag that is still being added counts as there already.
		typeInto(rig.app, rig.input(), 'Remodel')
		press(rig.app, rig.input(), 'Enter')
		typeInto(rig.app, rig.input(), 'remodel')
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [['Remodel']], 'no second request for a tag already on its way')
	} finally {
		rig.done()
	}
})

await check('editor: choosing a suggestion for a tag the image already has adds nothing, says so, and clears the box', async () => {
	const rig = editorRig({ tags: [manual('Kitchen')] })
	try {
		await typeAndAnswer(rig, 'kitchen', [stat('Kitchen', 214)])
		eq(optionTexts(rig.app), ['Kitchen (214) Added'], 'the exact tag leads, marked as added')
		eq(rig.app.byRole('option')[0].props['aria-selected'], true)
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [])
		eq(rig.input().props.value, '')
		ok(rig.app.byRole('status').some((n) => flatText(rig.app, n).includes('"Kitchen" is already on this image.')))
		// The same by pointer.
		await typeAndAnswer(rig, 'Kitchens', [stat('Kitchen', 214)])
		click(rig.app, rig.app.byRole('option')[0])
		await rig.app.settle()
		eq(rig.log.add, [])
		eq(rig.input().props.value, '')
	} finally {
		rig.done()
	}
})

await check('editor: a call that never answers leaves the box usable, and its chip stays pending instead of vanishing', async () => {
	const rig = editorRig({ onAdd: () => new Promise(() => {}), tags: [manual('Kitchen')] })
	try {
		typeInto(rig.app, rig.input(), 'Remodel')
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle(6)
		eq(chipsOf(rig.app).map((c) => c.props['data-pending']), [undefined, 'add'])
		ok(!rig.input().props.disabled)
		typeInto(rig.app, rig.input(), 'Before')
		eq(rig.input().props.value, 'Before', 'still typable')
		press(rig.app, rig.input(), 'Enter')
		eq(chipSlugs(rig.app), ['kitchen', 'remodel', 'before'], 'more can be queued')
		ok(rig.app.text().includes('Saving…'))
	} finally {
		rig.done()
	}
})

await check('editor: typing the label of an automatic tag keeps it, at once and in one call', async () => {
	const rig = editorRig({ tags: [auto('Van')] })
	try {
		typeInto(rig.app, rig.input(), 'van')
		press(rig.app, rig.input(), 'Enter')
		eq(chipsOf(rig.app).map((c) => `${c.props['data-slug']}:${c.props['data-source']}:${c.props['data-pending']}`), ['van:manual:add'])
		await rig.app.settle()
		eq(rig.log.add, [['van']])
	} finally {
		rig.done()
	}
})

await check('editor: a tag that is too long, or only punctuation, stays in the box with a reason and is never sent', async () => {
	const rig = editorRig()
	try {
		typeInto(rig.app, rig.input(), 'x'.repeat(41))
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [])
		eq(rig.input().props.value, 'x'.repeat(41), 'what was typed is kept so it can be fixed')
		ok(alertText(rig.app).includes('longer than 40 characters'))
		eq(rig.input().props['aria-invalid'], true)
		typeInto(rig.app, rig.input(), '!!!')
		press(rig.app, rig.input(), 'Enter')
		ok(alertText(rig.app).includes('at least one letter or number'))
		typeInto(rig.app, rig.input(), 'x'.repeat(40))
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [['x'.repeat(40)]])
	} finally {
		rig.done()
	}
})

await check('editor: an image holds 40 tags; adding past that is refused up front instead of dropped by the server', async () => {
	const full = Array.from({ length: 40 }, (_, i) => manual(`Tag ${i + 1}`))
	const rig = editorRig({ tags: full })
	try {
		typeInto(rig.app, rig.input(), 'one more')
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [])
		ok(alertText(rig.app).includes('An image holds up to 40 tags'))
		eq(rig.input().props.value, 'one more')
		// Keeping an automatic tag does not need room.
		rig.app.rerender({ tags: [...full.slice(0, 39), auto('Van')] })
		typeInto(rig.app, rig.input(), 'van')
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [['van']])
	} finally {
		rig.done()
	}
	const nearly = editorRig({ tags: Array.from({ length: 39 }, (_, i) => manual(`Tag ${i + 1}`)) })
	try {
		pasteInto(nearly.app, nearly.input(), 'a, b, c')
		await nearly.app.settle()
		eq(nearly.log.add, [['a']], 'only what fits')
		eq(nearly.input().props.value, 'b, c')
	} finally {
		nearly.done()
	}
})

await check('editor: Backspace in an empty box focuses the last chip; Backspace on a chip removes it and moves focus on', async () => {
	const rig = editorRig({ tags: [manual('Kitchen'), manual('Remodel'), auto('Van')] })
	try {
		const event = press(rig.app, rig.input(), 'Backspace')
		ok(event.defaultPrevented)
		eq(rig.app.focused.props.title, '92% sure', 'the last chip (automatic ones come last)')
		ok(flatText(rig.app, rig.app.focused).startsWith('Van, automatic, 92% sure'))
		// Backspace on the chip removes it.
		const chip = chipsOf(rig.app).at(-1)
		const main = chip.children.find((c) => c.type === 'button')
		const removal = press(rig.app, main, 'Backspace')
		ok(removal.defaultPrevented)
		ok(removal.propagationStopped, "Delete here is not the page's delete-the-selected-images shortcut")
		eq(chipSlugs(rig.app), ['kitchen', 'remodel'])
		eq(flatText(rig.app, rig.app.focused), 'Remodel', 'focus goes to the chip before it')
		await rig.app.settle()
		eq(rig.log.remove, ['van'])
		// Removing the first chip returns focus to the box.
		const first = chipsOf(rig.app)[0].children.find((c) => c.type === 'button')
		press(rig.app, first, 'Delete')
		eq(isCombobox(rig.app.focused), true, 'back to the box')
		// With text in the box, or no chips, Backspace is just Backspace.
		typeInto(rig.app, rig.input(), 'abc')
		ok(!press(rig.app, rig.input(), 'Backspace').defaultPrevented)
	} finally {
		rig.done()
	}
	const bare = editorRig()
	try {
		ok(!press(bare.app, bare.input(), 'Backspace').defaultPrevented, 'no chips, nowhere to go')
	} finally {
		bare.done()
	}
})

await check('editor: a keyboard click on a chip control keeps focus in the list; a pointer click does not move it', async () => {
	const rig = editorRig({ tags: [manual('Kitchen'), manual('Remodel')] })
	try {
		click(rig.app, rig.app.button('Remove tag Remodel'), { detail: 0 })
		eq(flatText(rig.app, rig.app.focused), 'Kitchen')
		rig.app.focused = null
		click(rig.app, rig.app.button('Remove tag Kitchen'), { detail: 1 })
		eq(rig.app.focused, null, 'a tap must not raise the on-screen keyboard')
	} finally {
		rig.done()
	}
})

await check('editor: chips are buttons that filter, Remove and Keep call the page with the slug', async () => {
	const rig = editorRig({ tags: [manual('Kitchen Remodel'), auto('Van')] })
	try {
		const main = chipsOf(rig.app)[0].children.find((c) => c.type === 'button')
		click(rig.app, main)
		eq(rig.log.click, ['kitchen-remodel'])
		click(rig.app, chipsOf(rig.app)[1].children.find((c) => c.type === 'button'))
		eq(rig.log.click, ['kitchen-remodel', 'van'])
		click(rig.app, rig.app.button('Remove tag Kitchen Remodel'))
		click(rig.app, rig.app.button('Keep tag Van'))
		await rig.app.settle()
		eq(rig.log.remove, ['kitchen-remodel'])
		eq(rig.log.promote, ['van'])
	} finally {
		rig.done()
	}
})

await check('editor: read-only has no box and no edit controls, but chips still filter', async () => {
	const rig = editorRig({ canEdit: false, tags: [manual('Kitchen'), auto('Van')] })
	try {
		eq(rig.app.find(isCombobox), undefined)
		ok(!rig.app.button('Remove tag Kitchen') && !rig.app.button('Keep tag Van'))
		click(rig.app, chipsOf(rig.app)[0].children.find((c) => c.type === 'button'))
		eq(rig.log.click, ['kitchen'])
		const key = press(rig.app, chipsOf(rig.app)[0].children.find((c) => c.type === 'button'), 'Backspace')
		ok(!key.defaultPrevented, 'Backspace removes nothing when read-only')
		await rig.app.settle()
		eq(rig.log.remove, [])
	} finally {
		rig.done()
	}
})

await check('editor: more than 12 tags collapse, Show all expands, and adding a tag expands so it is seen', async () => {
	const tags = Array.from({ length: 20 }, (_, i) => manual(`Tag ${String(i + 1).padStart(2, '0')}`))
	const rig = editorRig({ tags })
	try {
		eq(chipsOf(rig.app).length, 12)
		const more = rig.app.button('Show all 20')
		eq(more.props['aria-expanded'], false)
		click(rig.app, more)
		eq(chipsOf(rig.app).length, 20)
		const fewer = rig.app.button('Show fewer')
		eq(fewer.props['aria-expanded'], true)
		click(rig.app, fewer)
		eq(chipsOf(rig.app).length, 12)
		typeInto(rig.app, rig.input(), 'Brand new')
		press(rig.app, rig.input(), 'Enter')
		eq(chipsOf(rig.app).length, 21, 'the new tag is not hidden behind "Show all"')
		ok(chipSlugs(rig.app).includes('brand-new'))
	} finally {
		rig.done()
	}
})

await check('editor: Esc closes an open list first and passes through when there is none', async () => {
	const rig = editorRig()
	try {
		await typeAndAnswer(rig, 'kit', [stat('Kitchen', 3)])
		eq(rig.input().props['aria-expanded'], true)
		const first = press(rig.app, rig.input(), 'Escape')
		ok(first.defaultPrevented)
		eq(rig.input().props['aria-expanded'], false)
		const second = press(rig.app, rig.input(), 'Escape')
		ok(!second.defaultPrevented, 'the dialog around may now close')
		// ArrowDown reopens it.
		press(rig.app, rig.input(), 'ArrowDown')
		eq(rig.input().props['aria-expanded'], true)
	} finally {
		rig.done()
	}
})

await check('editor: leaving the box closes the list and cancels a lookup that has not gone out yet', async () => {
	const rig = editorRig()
	try {
		typeInto(rig.app, rig.input(), 'kit')
		rig.input().props.onBlur()
		rig.app.flush()
		rig.clock.advance(500)
		eq(rig.log.suggest.length, 0, 'no lookup for a box nobody is in')
		eq(rig.input().props['aria-expanded'], false)
		// Coming back with text re-asks.
		rig.input().props.onFocus()
		rig.app.flush()
		rig.clock.advance(120)
		eq(rig.log.suggest.map((c) => c.q), ['kit'])
	} finally {
		rig.done()
	}
})

await check('editor: a slow answer to an old text never replaces the answer to the new one, and the old fetch is aborted', async () => {
	const rig = editorRig()
	try {
		typeInto(rig.app, rig.input(), 'k')
		rig.clock.advance(120)
		const first = rig.log.suggest[0]
		typeInto(rig.app, rig.input(), 'ki')
		ok(first.signal.aborted, 'the superseded request was aborted')
		rig.clock.advance(120)
		const second = rig.log.suggest[1]
		ok(first.signal instanceof AbortSignal)
		second.gate.resolve([stat('Kitchen', 9)])
		await rig.app.settle()
		first.gate.resolve([stat('Kayak', 1)])
		await rig.app.settle()
		ok(optionTexts(rig.app).some((t) => t.startsWith('Kitchen')))
		ok(!optionTexts(rig.app).some((t) => t.startsWith('Kayak')))
	} finally {
		rig.done()
	}
})

await check('editor: a lookup that fails or is nonsense just shows no matches; adding still works', async () => {
	const rig = editorRig({ fetchSuggestions: () => Promise.reject(new Error('offline')) })
	try {
		typeInto(rig.app, rig.input(), 'kit')
		rig.clock.advance(120)
		await rig.app.settle()
		eq(optionTexts(rig.app), ['Create "kit"'])
		press(rig.app, rig.input(), 'Enter')
		await rig.app.settle()
		eq(rig.log.add, [['kit']])
	} finally {
		rig.done()
	}
	const odd = editorRig({ fetchSuggestions: async () => 'not a list' })
	try {
		typeInto(odd.app, odd.input(), 'kit')
		odd.clock.advance(120)
		await odd.app.settle()
		eq(optionTexts(odd.app), ['Create "kit"'])
	} finally {
		odd.done()
	}
})

await check('editor: while a new answer loads, the old one keeps showing what could still match instead of flickering', async () => {
	const rig = editorRig()
	try {
		await typeAndAnswer(rig, 'kitch', [stat('Kitchen', 214), stat('Bathroom', 3)])
		eq(optionTexts(rig.app), ['Create "kitch"', 'Kitchen (214)', 'Bathroom (3)'], 'the server decides what matches')
		typeInto(rig.app, rig.input(), 'kitche')
		eq(optionTexts(rig.app), ['Create "kitche"', 'Kitchen (214)'], 'the old answer narrowed to what still fits, while the new one loads')
		typeInto(rig.app, rig.input(), 'Kitchens')
		eq(optionTexts(rig.app)[0], 'Use "Kitchen" (214)', 'a plural is recognised before the answer arrives')
	} finally {
		rig.done()
	}
})

await check('editor: composing text with an input method is left alone until it ends; Enter during composition does nothing', async () => {
	const rig = editorRig()
	try {
		rig.input().props.onChange(ev({ target: { value: 'にほ,' }, nativeEvent: { isComposing: true } }))
		rig.app.flush()
		eq(rig.input().props.value, 'にほ,', 'no splitting mid-composition')
		eq(rig.log.add, [])
		const enter = press(rig.app, rig.input(), 'Enter', { nativeEvent: { isComposing: true } })
		ok(!enter.defaultPrevented)
		rig.input().props.onCompositionEnd(ev({ currentTarget: { value: 'にほ,' } }))
		rig.app.flush()
		await rig.app.settle()
		eq(rig.log.add, [['にほ']], 'the comma is read once the text is final')
		eq(rig.input().props.value, '')
	} finally {
		rig.done()
	}
})

await check('editor: unmounting cancels the lookup timer and nothing fires afterwards', async () => {
	const rig = editorRig()
	typeInto(rig.app, rig.input(), 'kit')
	ok(rig.clock.pending >= 1)
	rig.app.unmount()
	eq(rig.clock.pending, 0, 'the pending lookup was cancelled')
	rig.clock.uninstall()
})

await check('editor: a call made for one image reaches that image even if the editor is replaced before its turn', async () => {
	const sentTo = []
	const make = (name) => ({
		tags: [],
		canEdit: true,
		onAdd: (labels) => {
			sentTo.push([name, labels])
			return name === 'first' ? firstGate.promise : Promise.resolve()
		},
		onRemove: asyncNoop,
		fetchSuggestions: async () => [],
	})
	const firstGate = deferred()
	const clock = new FakeClock()
	clock.install()
	try {
		const app = mount(editor.TagEditor, make('first'))
		typeInto(app, app.find(isCombobox), 'a')
		press(app, app.find(isCombobox), 'Enter')
		typeInto(app, app.find(isCombobox), 'b')
		press(app, app.find(isCombobox), 'Enter')
		// The page moves to another image: new props, and the old callback must not be used for 'b'.
		app.rerender({ ...make('second') })
		firstGate.resolve()
		await app.settle()
		eq(sentTo, [['first', ['a']], ['first', ['b']]], 'both went through the callback they were asked with')
		app.unmount()
	} finally {
		clock.uninstall()
	}
})

/* ========================================================================== */
/* Interactive: the panel, the bulk form and the manager, with Radix swapped  */
/* for plain stand-ins (it needs a browser). Everything else is the real code. */
/* ========================================================================== */

const captured = {}
const pass = (tag) => (props) => {
	const { children, ...rest } = props
	return h(tag, rest, children)
}
mock('@/components/ui/label', { Label: pass('label') })
mock('@/components/ui/button', {
	Button: ({ asChild, children, variant, size, ...rest }) =>
		asChild ? React.cloneElement(children, rest) : h('button', rest, children),
	buttonVariants: () => '',
})
mock('@/components/ui/select', {
	Select: (props) => {
		captured.select = props
		return h('div', { 'data-slot': 'select' }, props.children)
	},
	SelectTrigger: ({ children, ...rest }) => h('button', { ...rest, role: 'combobox', type: 'button' }, children),
	SelectValue: ({ children }) => h('span', { 'data-slot': 'select-value' }, children),
	SelectContent: ({ children }) => h('div', { 'data-slot': 'select-content' }, children),
	SelectItem: ({ children, value, textValue }) => h('div', { 'data-slot': 'select-item', 'data-value': value, 'data-text': textValue }, children),
})
mock('@/components/ui/alert-dialog', {
	AlertDialog: (props) => {
		captured.alert = props
		return h('div', { 'data-slot': 'alert-dialog', 'data-open': String(Boolean(props.open)) }, props.children)
	},
	AlertDialogTrigger: ({ children }) => children,
	AlertDialogContent: ({ children }) => h('div', { role: 'alertdialog' }, children),
	AlertDialogHeader: pass('div'),
	AlertDialogFooter: pass('div'),
	AlertDialogTitle: pass('h2'),
	AlertDialogDescription: pass('p'),
	AlertDialogAction: ({ children, ...rest }) => h('button', { ...rest, 'data-slot': 'alert-action', type: 'button' }, children),
	AlertDialogCancel: ({ children, ...rest }) => h('button', { ...rest, 'data-slot': 'alert-cancel', type: 'button' }, children),
})
mock('@/components/ui/sheet', {
	Sheet: (props) => {
		captured.sheet = props
		return h('div', { 'data-slot': 'sheet' }, props.children)
	},
	SheetContent: (props) => {
		captured.sheetContent = props
		const { children, side, ...rest } = props
		return h('div', { 'data-slot': 'sheet-content', 'data-side': side, ...rest }, children)
	},
	SheetTitle: pass('h2'),
	SheetDescription: pass('p'),
})
mock('@/components/ui/dialog', {
	Dialog: (props) => {
		captured.dialog = props
		return h('div', { 'data-slot': 'dialog', 'data-open': String(Boolean(props.open)) }, props.children)
	},
	DialogContent: (props) => {
		captured.dialogContent = props
		const { children } = props
		return h('div', { 'data-slot': 'dialog-content' }, children)
	},
	DialogHeader: pass('div'),
	DialogFooter: pass('div'),
	DialogTitle: pass('h2'),
	DialogDescription: pass('p'),
})
// The hooks that return focus read `document`; there is none here, so a minimal one.
class FakeHTMLElement {
	constructor() {
		this.isConnected = true
		this.focused = 0
	}
	focus() {
		this.focused++
	}
}
const sharedDocument = () => ({ activeElement: null, body: { appendChild() {} } })
globalThis.HTMLElement = FakeHTMLElement
globalThis.document = sharedDocument()

clearCache()
editor = loadTs('src/app/account/media/tag-editor.tsx')
panel = loadTs('src/app/account/media/detail-panel.tsx')
bulk = loadTs('src/app/account/media/bulk-tag-dialog.tsx')
manager = loadTs('src/app/account/media/tag-manager-dialog.tsx')

/** A checkbox changes, it is not clicked. */
function toggle(app, node) {
	if (node.props.disabled) return
	node.props.onChange(ev({ target: { checked: !node.props.checked } }))
	app.flush()
}
const within = (node) => {
	const out = []
	const visit = (n) => {
		for (const c of n.children ?? []) {
			if (c.text !== undefined) continue
			out.push(c)
			visit(c)
		}
	}
	visit(node)
	return out
}

/* -------------------------------------------------------------------------- */
/* Hooks, through a probe component                                           */
/* -------------------------------------------------------------------------- */

function probe(useThing, props) {
	const out = {}
	function Probe(p) {
		out.value = useThing(p.options)
		return h('div')
	}
	const app = mount(Probe, { options: props })
	return { app, out, update: (options) => app.rerender({ options }) }
}

function fieldRig({ spec = panel.FIELD_SPECS.name, saved = 'Kitchen 1', hold = true, ...extra } = {}) {
	const clock = new FakeClock()
	clock.install()
	const sent = []
	const gates = []
	const registry = new Set()
	const options = {
		saved,
		registry,
		plan: (draft, ctx) => panel.planFieldSave(spec, draft, ctx),
		send: (value) => {
			sent.push(value)
			if (!hold) return Promise.resolve()
			const gate = deferred()
			gates.push(gate)
			return gate.promise
		},
		...extra,
	}
	const p = probe(panel.useSavedField, options)
	return {
		...p,
		clock,
		sent,
		gates,
		registry,
		field: () => p.out.value,
		set: (value) => {
			p.out.value.setDraft(value)
			p.app.flush()
		},
		commit: async (trigger) => {
			const promise = p.out.value.commit(trigger)
			p.app.flush()
			return promise
		},
		done: () => {
			p.app.unmount()
			clock.uninstall()
		},
	}
}

await check('field hook: a change is saved on blur, shows Saving then Saved, and Saved goes away on its own', async () => {
	const rig = fieldRig()
	try {
		eq([rig.field().draft, rig.field().status], ['Kitchen 1', 'idle'])
		rig.set('Kitchen 2')
		eq(rig.field().status, 'idle')
		eq(rig.sent, [], 'typing alone sends nothing')
		const done = rig.commit('blur')
		eq(rig.field().status, 'saving')
		eq(rig.sent, ['Kitchen 2'])
		rig.gates[0].resolve()
		await done
		rig.app.flush()
		eq([rig.field().status, rig.field().draft, rig.field().error], ['saved', 'Kitchen 2', null])
		rig.clock.advance(panel.SAVED_TICK_MS - 1)
		rig.app.flush()
		eq(rig.field().status, 'saved')
		rig.clock.advance(1)
		rig.app.flush()
		eq(rig.field().status, 'idle', 'the tick is subtle: it leaves')
	} finally {
		rig.done()
	}
})

await check('field hook: only a real change is sent; Enter then blur sends once', async () => {
	const rig = fieldRig()
	try {
		await rig.commit('blur')
		rig.set('  Kitchen 1  ')
		await rig.commit('blur')
		eq(rig.sent, [], 'unchanged, or only whitespace')
		rig.set('Kitchen 3')
		const first = rig.commit('enter')
		const second = rig.commit('blur')
		eq(rig.sent, ['Kitchen 3'], 'the second is not a second request')
		rig.gates[0].resolve()
		await Promise.all([first, second])
		rig.app.flush()
		eq(rig.sent, ['Kitchen 3'])
		eq(rig.field().status, 'saved')
	} finally {
		rig.done()
	}
})

await check('field hook: a failure stays next to the field with the draft kept, and blurring again retries', async () => {
	const rig = fieldRig()
	try {
		rig.set('Kitchen 2')
		const first = rig.commit('blur')
		rig.gates[0].reject(new Error('The server said no.'))
		await first
		rig.app.flush()
		eq([rig.field().status, rig.field().error, rig.field().draft], ['error', 'The server said no.', 'Kitchen 2'])
		const retry = rig.commit('blur')
		eq(rig.sent, ['Kitchen 2', 'Kitchen 2'], 'the same value is tried again')
		eq(rig.field().error, null, 'the old message is gone while it retries')
		rig.gates[1].resolve()
		await retry
		rig.app.flush()
		eq(rig.field().status, 'saved')
		// Editing again retires an error.
		rig.set('Kitchen 4')
		const bad = rig.commit('blur')
		rig.gates[2].reject('plain string')
		await bad
		rig.app.flush()
		eq(rig.field().error, 'plain string')
		rig.set('Kitchen 5')
		eq(rig.field().error, null)
	} finally {
		rig.done()
	}
})

await check('field hook: a rejection that is not a sentence, and a synchronous throw, are still caught', async () => {
	for (const failure of [() => Promise.reject(undefined), () => Promise.reject(null), () => Promise.reject(new Error('')), () => { throw new Error('sync boom') }]) {
		const rig = fieldRig({ send: failure })
		try {
			rig.set('Kitchen 2')
			await rig.commit('blur')
			rig.app.flush()
			eq(rig.field().status, 'error')
			ok(rig.field().error && !/undefined|null/.test(rig.field().error), String(rig.field().error))
			eq(rig.field().draft, 'Kitchen 2')
		} finally {
			rig.done()
		}
	}
})

await check('field hook: a name cannot be saved empty: blur puts the old name back with the reason, Enter keeps the draft', async () => {
	const rig = fieldRig()
	try {
		rig.set('')
		await rig.commit('enter')
		rig.app.flush()
		eq([rig.field().status, rig.field().error, rig.field().draft], ['error', 'Give the image a name.', ''], 'still editing: nothing is yanked away')
		await rig.commit('blur')
		rig.app.flush()
		eq([rig.field().status, rig.field().error, rig.field().draft], ['error', 'Give the image a name.', 'Kitchen 1'], 'left half-valid: show what is really stored')
		eq(rig.sent, [])
	} finally {
		rig.done()
	}
})

await check('field hook: typing while a save is out is sent after it answers, so two requests can never cross', async () => {
	const rig = fieldRig({ saved: 'A' })
	try {
		rig.set('A2')
		const first = rig.commit('blur')
		rig.set('A3')
		const second = rig.commit('blur')
		eq(rig.sent, ['A2'], 'one at a time')
		rig.gates[0].resolve()
		await first
		await second
		rig.app.flush()
		eq(rig.sent, ['A2', 'A3'], 'the newer text follows, by itself')
		eq(rig.field().status, 'saving')
		rig.gates[1].resolve()
		await rig.app.settle()
		eq([rig.field().status, rig.field().draft], ['saved', 'A3'])
		eq(rig.sent.length, 2)
	} finally {
		rig.done()
	}
})

await check('field hook: a value the page changes under an untouched field is followed; under an edited one it is not', async () => {
	const rig = fieldRig({ saved: 'A' })
	try {
		const options = (saved) => ({ saved, registry: rig.registry, plan: (d, c) => panel.planFieldSave(panel.FIELD_SPECS.caption, d, c), send: async () => {} })
		rig.update(options('Written by the AI'))
		eq(rig.field().draft, 'Written by the AI')
		rig.set('my own words')
		rig.update(options('AI wrote it again'))
		eq(rig.field().draft, 'my own words', 'what the person is typing is never overwritten')
	} finally {
		rig.done()
	}
})

await check('field hook: everything registered is saved when the panel closes or pages, and unregisters on unmount', async () => {
	const rig = fieldRig({ hold: false })
	try {
		eq(rig.registry.size, 1)
		rig.set('Typed, never blurred')
		for (const flush of [...rig.registry]) flush()
		await rig.app.settle()
		eq(rig.sent, ['Typed, never blurred'], 'Esc or Next does not blur a field, so the panel flushes it')
		eq(rig.field().status, 'saved')
	} finally {
		rig.done()
	}
	eq(rig.registry.size, 0, 'gone with the field')
})

await check('field hook: a choice that cannot be edited in place goes back to what is stored when saving fails', async () => {
	const rig = fieldRig({ saved: 'folderA', revertOnFail: true, plan: (draft, ctx) => (draft === ctx.saved || draft === ctx.sending ? { type: 'noop' } : { type: 'save', value: draft }) })
	try {
		rig.set('folderB')
		const done = rig.commit('change')
		rig.gates[0].reject(new Error('That folder is gone.'))
		await done
		rig.app.flush()
		eq([rig.field().draft, rig.field().status, rig.field().error], ['folderA', 'error', 'That folder is gone.'])
		rig.set('folderB')
		const ok2 = rig.commit('change')
		rig.gates[1].resolve()
		await ok2
		rig.app.flush()
		eq([rig.field().draft, rig.field().status], ['folderB', 'saved'])
	} finally {
		rig.done()
	}
})

await check('action hook: pending and error are its own, a second press is dropped, and success is remembered', async () => {
	const gate = deferred()
	let calls = 0
	const p = probe(panel.useAction, () => { calls++; return gate.promise })
	const state = () => p.out.value
	eq([state().pending, state().error, state().done], [false, null, false])
	const first = state().run()
	p.app.flush()
	eq(state().pending, true)
	eq(await state().run(), false, 'repeat press while running')
	eq(calls, 1)
	gate.resolve()
	eq(await first, true)
	p.app.flush()
	eq([state().pending, state().error, state().done], [false, null, true])
	state().reset()
	p.app.flush()
	eq(state().done, false)
	p.update(() => Promise.reject(new Error('Nope.')))
	eq(await state().run(), false)
	p.app.flush()
	eq([state().pending, state().error, state().done], [false, 'Nope.', false])
	p.update(() => { throw 'sync string' })
	await state().run()
	p.app.flush()
	eq(state().error, 'sync string')
	p.app.unmount()
})

await check('focus: the element the dialog was opened from gets focus back when it closes, if it still exists', () => {
	class FakeElement {
		constructor() {
			this.isConnected = true
			this.focused = 0
		}
		focus() {
			this.focused++
		}
	}
	const savedGlobals = { HTMLElement: globalThis.HTMLElement, document: globalThis.document }
	globalThis.HTMLElement = FakeElement
	const opener = new FakeElement()
	globalThis.document = { activeElement: opener, body: { fake: 'body' } }
	try {
		const p = probe(editor.useReturnFocus, true)
		const handler = p.out.value
		const event = ev()
		handler(event)
		ok(event.defaultPrevented, 'Radix must not also try to focus a trigger that does not exist')
		eq(opener.focused, 1)
		opener.isConnected = false
		const gone = ev()
		handler(gone)
		ok(!gone.defaultPrevented && opener.focused === 1, 'an element that left the page is not focused')
		p.app.unmount()
		// Opened from nowhere (focus was on the body): nothing to return to.
		globalThis.document = { activeElement: globalThis.document.body, body: globalThis.document.body }
		const q = probe(editor.useReturnFocus, true)
		const none = ev()
		q.out.value(none)
		ok(!none.defaultPrevented)
		q.app.unmount()
		// A closed dialog remembers nothing.
		globalThis.document = { activeElement: opener, body: {} }
		opener.isConnected = true
		const r = probe(editor.useReturnFocus, false)
		const idle = ev()
		r.out.value(idle)
		ok(!idle.defaultPrevented)
		r.app.unmount()
	} finally {
		globalThis.document = savedGlobals.document
		globalThis.HTMLElement = savedGlobals.HTMLElement
	}
})

/* -------------------------------------------------------------------------- */
/* The panel body                                                             */
/* -------------------------------------------------------------------------- */

function bodyRig(over = {}) {
	const clock = new FakeClock()
	clock.install()
	const log = { patch: [], delete: 0, retag: 0, filter: [] }
	const gates = { patch: [], delete: [], retag: [] }
	const hold = over.hold ?? false
	const make = (name, record) => (...args) => {
		record(...args)
		if (!hold) return Promise.resolve()
		const gate = deferred()
		gates[name].push(gate)
		return gate.promise
	}
	const props = bodyProps({
		onPatch: make('patch', (patch) => log.patch.push(patch)),
		onDelete: make('delete', () => log.delete++),
		onRetag: make('retag', () => log.retag++),
		onFilter: (clause) => log.filter.push(clause),
		...over.props,
	})
	const app = mount(panel.DetailPanelBody, props)
	const input = (max) => app.find((n) => n.type === 'input' && n.props.maxLength === max)
	const area = (max) => app.find((n) => n.type === 'textarea' && n.props.maxLength === max)
	return {
		app,
		clock,
		log,
		gates,
		props,
		name: () => input(200),
		caption: () => area(500),
		alt: () => area(300),
		notes: () => area(2000),
		field: (label) =>
			app.bySlot('detail-field').find((f) => {
				const first = within(f).find((n) => n.type === 'label' || (n.type === 'p' && String(n.props.className).includes('text-xs')))
				return first && flatText(app, first) === label
			}),
		done: () => {
			app.unmount()
			clock.uninstall()
		},
	}
}

const statusOf = (app, rig, label) => {
	const f = rig.field(label)
	const s = f && within(f).find((n) => n.props?.role === 'status')
	return s ? flatText(app, s) : undefined
}

await check('panel: the name saves on Enter and on blur, only if changed, as onPatch({ name })', async () => {
	const rig = bodyRig()
	try {
		eq(rig.name().props.value, 'Kitchen 1')
		typeInto(rig.app, rig.name(), 'Kitchen Final')
		eq(rig.log.patch, [], 'typing alone sends nothing')
		const enter = press(rig.app, rig.name(), 'Enter')
		ok(enter.defaultPrevented)
		await rig.app.settle()
		eq(rig.log.patch, [{ name: 'Kitchen Final' }])
		eq(statusOf(rig.app, rig, 'Name'), 'Saved')
		rig.name().props.onBlur()
		await rig.app.settle()
		eq(rig.log.patch.length, 1, 'blur right after Enter does not save again')
		// Unchanged: blur sends nothing.
		rig.name().props.onBlur()
		await rig.app.settle()
		eq(rig.log.patch.length, 1)
		// Blur alone saves a change.
		typeInto(rig.app, rig.name(), '  Kitchen Third  ')
		rig.name().props.onBlur()
		await rig.app.settle()
		eq(rig.log.patch.at(-1), { name: 'Kitchen Third' }, 'trimmed, as the server trims')
		// Shift+Enter or a composing Enter is not a save.
		typeInto(rig.app, rig.name(), 'Kitchen Fourth')
		press(rig.app, rig.name(), 'Enter', { nativeEvent: { isComposing: true } })
		await rig.app.settle()
		eq(rig.log.patch.length, 2)
		press(rig.app, rig.name(), 'a')
		eq(rig.log.patch.length, 2)
	} finally {
		rig.done()
	}
})

await check('panel: Saving, Saved and a failure are shown per field, and one field failing does not touch another', async () => {
	const rig = bodyRig({ hold: true })
	try {
		typeInto(rig.app, rig.caption(), 'A brand new caption')
		rig.caption().props.onBlur()
		rig.app.flush()
		eq(statusOf(rig.app, rig, 'Caption'), 'Saving…')
		eq(statusOf(rig.app, rig, 'Name'), '', 'other fields are quiet')
		typeInto(rig.app, rig.alt(), 'Alt words')
		rig.alt().props.onBlur()
		rig.app.flush()
		eq(rig.log.patch, [{ caption: 'A brand new caption' }, { altText: 'Alt words' }], 'different fields save independently')
		rig.gates.patch[0].reject(new Error('Caption is too long for us today.'))
		rig.gates.patch[1].resolve()
		await rig.app.settle()
		eq(statusOf(rig.app, rig, 'Alt text'), 'Saved')
		eq(statusOf(rig.app, rig, 'Caption'), '')
		const alerts = rig.app.byRole('alert').map((n) => flatText(rig.app, n))
		eq(alerts, ['Caption is too long for us today.'])
		eq(rig.caption().props.value, 'A brand new caption', 'the words are not lost')
		eq(rig.caption().props['aria-invalid'], true)
		ok(rig.caption().props['aria-describedby'])
		// The reason sits in the DOM where the described-by points.
		const target = rig.app.find((n) => n.props.id === rig.caption().props['aria-describedby'])
		eq(flatText(rig.app, target), 'Caption is too long for us today.')
		rig.clock.advance(panel.SAVED_TICK_MS)
		rig.app.flush()
		eq(statusOf(rig.app, rig, 'Alt text'), '', '"Saved" leaves by itself')
	} finally {
		rig.done()
	}
})

await check('panel: caption, alt text and notes save their own key, blank clears, and the name refuses to be blank', async () => {
	const rig = bodyRig()
	try {
		typeInto(rig.app, rig.caption(), 'New caption')
		rig.caption().props.onBlur()
		typeInto(rig.app, rig.alt(), 'New alt')
		rig.alt().props.onBlur()
		typeInto(rig.app, rig.notes(), 'New notes')
		rig.notes().props.onBlur()
		await rig.app.settle()
		eq(rig.log.patch, [{ caption: 'New caption' }, { altText: 'New alt' }, { notes: 'New notes' }])
		typeInto(rig.app, rig.caption(), '   ')
		rig.caption().props.onBlur()
		await rig.app.settle()
		eq(rig.log.patch.at(-1), { caption: '' }, 'a cleared caption is saved as cleared')
		for (const patch of rig.log.patch) ok(assetPatchSchema.safeParse(patch).success, JSON.stringify(patch))
		typeInto(rig.app, rig.name(), '   ')
		rig.name().props.onBlur()
		await rig.app.settle()
		eq(rig.log.patch.length, 4, 'nothing sent for a blank name')
		eq(rig.name().props.value, 'Kitchen 1', 'the stored name is shown again')
		eq(rig.app.byRole('alert').map((n) => flatText(rig.app, n)), ['Give the image a name.'])
	} finally {
		rig.done()
	}
})

await check('panel: text beyond the limits is held by the field and the schema agrees', async () => {
	const rig = bodyRig()
	try {
		eq(rig.caption().props.maxLength, 500)
		eq(rig.alt().props.maxLength, 300)
		eq(rig.notes().props.maxLength, 2000)
		eq(rig.name().props.maxLength, 200)
		// A value that got past maxLength anyway (a programmatic change) is refused with a reason.
		typeInto(rig.app, rig.caption(), 'x'.repeat(501))
		rig.caption().props.onBlur()
		await rig.app.settle()
		eq(rig.log.patch, [])
		ok(rig.app.byRole('alert').map((n) => flatText(rig.app, n)).join('').includes('500 characters'))
		// A counter shows near the limit.
		typeInto(rig.app, rig.caption(), 'x'.repeat(450))
		ok(rig.app.text().includes('450 / 500'))
		typeInto(rig.app, rig.caption(), 'short')
		ok(!rig.app.text().includes('/ 500'))
	} finally {
		rig.done()
	}
})

await check('panel: the folder picker lists Unfiled and the indented folders, and choosing one sends folderId', async () => {
	const rig = bodyRig()
	try {
		const items = rig.app.bySlot('select-item')
		eq(items.map((i) => i.props['data-value']), ['unfiled', F_CLIENTS, F_ACME, F_BRAND])
		eq(items.map((i) => i.props['data-text']), ['No folder', 'Clients', 'Clients/Acme', 'Brand'])
		const indent = (item) => item.children[0].props.style?.paddingLeft
		eq(items.map(indent), ['0rem', '0rem', '0.75rem', '0rem'], 'a child is indented under its parent')
		eq(captured.select.value, F_ACME, 'shows where the image is')
		eq(rig.app.find((n) => n.props['data-slot'] === 'select-value').children.map((c) => c.text).join(''), 'Clients/Acme', 'the trigger shows the whole path')
		captured.select.onValueChange(F_BRAND)
		rig.app.flush()
		await rig.app.settle()
		eq(rig.log.patch, [{ folderId: F_BRAND }])
		eq(captured.select.value, F_BRAND, 'the choice shows at once')
		captured.select.onValueChange('unfiled')
		rig.app.flush()
		await rig.app.settle()
		eq(rig.log.patch.at(-1), { folderId: null })
		for (const patch of rig.log.patch) ok(assetPatchSchema.safeParse(patch).success)
		// The same choice again sends nothing.
		const before = rig.log.patch.length
		captured.select.onValueChange('unfiled')
		await rig.app.settle()
		eq(rig.log.patch.length, before)
	} finally {
		rig.done()
	}
})

await check('panel: a folder that cannot be saved goes back to the old one with the reason, and the picker waits while saving', async () => {
	const rig = bodyRig({ hold: true })
	try {
		captured.select.onValueChange(F_BRAND)
		rig.app.flush()
		eq(captured.select.disabled, true, 'no second choice while one is out')
		rig.gates.patch[0].reject(new Error('That folder no longer exists.'))
		await rig.app.settle()
		eq(captured.select.value, F_ACME, 'back to where it really is')
		eq(captured.select.disabled, false)
		eq(rig.app.byRole('alert').map((n) => flatText(rig.app, n)), ['That folder no longer exists.'])
	} finally {
		rig.done()
	}
})

await check('panel: the tag editor is wired to onPatch with the right keys, and chips filter by tag', async () => {
	const rig = bodyRig()
	try {
		const tagInput = rig.app.find(isCombobox)
		typeInto(rig.app, tagInput, 'Pantry')
		press(rig.app, rig.app.find(isCombobox), 'Enter')
		await rig.app.settle()
		eq(rig.log.patch, [{ addTags: ['Pantry'] }])
		click(rig.app, rig.app.button('Remove tag Remodel'))
		await rig.app.settle()
		eq(rig.log.patch.at(-1), { removeTags: ['remodel'] })
		click(rig.app, rig.app.button('Keep tag Van'))
		await rig.app.settle()
		eq(rig.log.patch.at(-1), { addTags: ['Van'] }, 'keeping an automatic tag is adding it, in its own spelling')
		click(rig.app, chipsOf(rig.app).find((c) => c.props['data-slug'] === 'van').children[0])
		eq(rig.log.filter, ['tag:van'])
		for (const patch of rig.log.patch) ok(assetPatchSchema.safeParse(patch).success, JSON.stringify(patch))
		// The tag box asks the page for suggestions.
		const asked = []
		const rig2 = bodyRig({ props: { fetchTagSuggestions: (q) => { asked.push(q); return Promise.resolve([]) } } })
		typeInto(rig2.app, rig2.app.find(isCombobox), 'kit')
		rig2.clock.advance(120)
		eq(asked, ['kit'])
		rig2.done()
	} finally {
		rig.done()
	}
})

await check('panel: a colour, the type, the orientation, the kind and the folder each add a clause to the search', () => {
	const rig = bodyRig()
	try {
		const palette = rig.app.bySlot('detail-palette')[0]
		const swatches = palette.children[1].children.map((li) => li.children[0])
		eq(swatches.length, 2)
		click(rig.app, swatches[0])
		click(rig.app, swatches[1])
		const meta = rig.app.bySlot('detail-meta')[0]
		for (const label of ['JPG', 'Landscape', 'Photo']) click(rig.app, rig.app.all((n) => n.type === 'button' && flatText(rig.app, n) === label)[0])
		click(rig.app, rig.app.byLabel('Show images in Clients/Acme'))
		eq(rig.log.filter, ['color:blue', 'color:white', 'type:jpg', 'orientation:landscape', 'kind:photo', 'folder:Clients/Acme'])
		ok(meta)
		// A path with a space is quoted, as the query language wants.
		const spaced = bodyRig({ props: { asset: asset({ folderPath: 'My Clients/Acme' }) } })
		click(spaced.app, spaced.app.byLabel('Show images in My Clients/Acme'))
		eq(spaced.log.filter, ['folder:"My Clients/Acme"'])
		spaced.done()
		const unfiled = bodyRig({ props: { asset: asset({ folderId: null, folderPath: '' }) } })
		eq(unfiled.app.all((n) => String(n.props['aria-label'] ?? '').startsWith('Show images in')).length, 0, 'nothing to search for in the root')
		unfiled.done()
	} finally {
		rig.done()
	}
})

await check('panel: every call carries the id of the image it was made on, so a page can refuse one that arrives late', async () => {
	const calls = []
	const rig = bodyRig({ props: {
		onPatch: (patch, id) => { calls.push(['patch', patch, id]); return Promise.resolve() },
		onDelete: (id) => { calls.push(['delete', id]); return Promise.resolve() },
		onRetag: (id) => { calls.push(['retag', id]); return Promise.resolve() },
	} })
	try {
		const id = asset().id
		typeInto(rig.app, rig.name(), 'Renamed')
		rig.name().props.onBlur()
		captured.select.onValueChange(F_BRAND)
		typeInto(rig.app, rig.app.find(isCombobox), 'Pantry')
		press(rig.app, rig.app.find(isCombobox), 'Enter')
		click(rig.app, rig.app.button('Remove tag Remodel'))
		click(rig.app, rig.app.button('Keep tag Van'))
		await rig.app.settle(8)
		click(rig.app, rig.app.button('Auto-tag again'))
		click(rig.app, rig.app.find((n) => n.props['data-slot'] === 'alert-action'))
		await rig.app.settle(4)
		eq(calls.map((c) => c.at(-1)), [id, id, id, id, id, id, id], 'the id is the last argument of all seven calls')
		eq(calls.map((c) => c[0]), ['patch', 'patch', 'patch', 'patch', 'patch', 'retag', 'delete'])
		eq(calls[0][1], { name: 'Renamed' })
	} finally {
		rig.done()
	}
})

await check('panel: Auto-tag again has its own pending and error state and cannot be pressed twice', async () => {
	const rig = bodyRig({ hold: true })
	try {
		const retag = () => rig.app.button('Auto-tag again')
		click(rig.app, retag())
		eq(rig.log.retag, 1)
		ok(retag().props.disabled, 'busy while it runs')
		eq(retag().props['aria-busy'], true)
		click(rig.app, retag())
		eq(rig.log.retag, 1, 'a second press is dropped')
		rig.gates.retag[0].reject(new Error('Auto-tagging is paused for today.'))
		await rig.app.settle()
		eq(rig.app.byRole('alert').map((n) => flatText(rig.app, n)), ['Auto-tagging is paused for today.'])
		ok(!retag().props.disabled, 'it can be tried again')
		click(rig.app, retag())
		rig.gates.retag[1].resolve()
		await rig.app.settle()
		ok(rig.app.text().includes('Queued. New tags will appear here shortly.'))
		eq(rig.app.byRole('alert').length, 0)
	} finally {
		rig.done()
	}
})

await check('panel: Copy URL says Copied and then goes back; if copying is refused it shows the link to copy by hand', async () => {
	const written = []
	const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
	Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (t) => { written.push(t) } } }, configurable: true })
	const rig = bodyRig()
	try {
		click(rig.app, rig.app.button('Copy URL'))
		await rig.app.settle()
		eq(written, [asset().url])
		ok(rig.app.button('Copied'), 'confirmation')
		ok(rig.app.text().includes('Link copied.'), 'announced to a screen reader')
		rig.clock.advance(panel.SAVED_TICK_MS)
		rig.app.flush()
		ok(rig.app.button('Copy URL'), 'the button returns')
	} finally {
		rig.done()
	}
	// Refused, and no fallback available: the person gets the link to copy themselves.
	Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => { throw new Error('denied') } } }, configurable: true })
	globalThis.document = { activeElement: null, body: { appendChild() {} }, execCommand: () => false, createElement: () => ({ setAttribute() {}, style: {}, select() {}, setSelectionRange() {}, remove() {} }) }
	const refused = bodyRig()
	try {
		click(refused.app, refused.app.button('Copy URL'))
		await refused.app.settle()
		ok(refused.app.text().includes('Copying was blocked'))
		const readonly = refused.app.find((n) => n.type === 'input' && n.props.readOnly)
		eq(readonly.props.value, asset().url)
		ok(!refused.app.button('Copied'))
	} finally {
		refused.done()
		globalThis.document = sharedDocument()
		if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
		else delete globalThis.navigator
	}
})

await check('panel: Delete asks first, says it is permanent and that sites using the image lose it, and only then calls onDelete', async () => {
	const rig = bodyRig({ hold: true })
	try {
		captured.alert.onOpenChange(true)
		rig.app.flush()
		eq(captured.alert.open, true)
		const dialog = rig.app.find((n) => n.props.role === 'alertdialog')
		const words = flatText(rig.app, dialog)
		ok(words.includes('Delete this image?'))
		ok(words.includes('"Kitchen 1" will be deleted permanently'), words)
		ok(words.includes('cannot be undone'))
		ok(words.includes('stop showing on any site that uses it'), words)
		eq(rig.log.delete, 0, 'nothing is deleted by opening the dialog')
		const confirm = () => rig.app.find((n) => n.props['data-slot'] === 'alert-action')
		const event = click(rig.app, confirm())
		ok(event.defaultPrevented, 'stay open until the server has answered')
		eq(rig.log.delete, 1)
		ok(confirm().props.disabled && rig.app.find((n) => n.props['data-slot'] === 'alert-cancel').props.disabled, 'locked while it runs')
		click(rig.app, confirm())
		eq(rig.log.delete, 1, 'no second delete')
		rig.gates.delete[0].reject(new Error('Could not delete that image.'))
		await rig.app.settle()
		eq(rig.app.byRole('alert').map((n) => flatText(rig.app, n)), ['Could not delete that image.'])
		ok(!confirm().props.disabled, 'it can be tried again')
		click(rig.app, confirm())
		rig.gates.delete[1].resolve()
		await rig.app.settle()
		eq(captured.alert.open, false, 'closed on success')
	} finally {
		rig.done()
	}
})

await check('panel: the delete dialog cannot be dismissed while the delete is running', async () => {
	const rig = bodyRig({ hold: true })
	try {
		captured.alert.onOpenChange(true)
		rig.app.flush()
		eq(captured.alert.open, true)
		click(rig.app, rig.app.find((n) => n.props['data-slot'] === 'alert-action'))
		captured.alert.onOpenChange(false)
		rig.app.flush()
		eq(captured.alert.open, true, 'Esc or the overlay is ignored mid-delete')
		rig.gates.delete[0].reject(new Error('x'))
		await rig.app.settle()
		captured.alert.onOpenChange(false)
		rig.app.flush()
		eq(captured.alert.open, false, 'dismissable again once it is not running')
	} finally {
		rig.done()
	}
})

await check('panel: a viewer gets read-only text and no save can be triggered', async () => {
	const rig = bodyRig({ props: { canWrite: false, canDelete: false } })
	try {
		click(rig.app, rig.app.byLabel('Show images in Clients/Acme'))
		eq(rig.log.filter, ['folder:Clients/Acme'], 'searching is not editing')
		rig.log.filter.length = 0
		eq(rig.app.all((n) => n.type === 'input' || n.type === 'textarea').length, 0)
		eq(rig.app.find(isCombobox), undefined)
		eq(rig.app.bySlot('select').length, 0)
		click(rig.app, chipsOf(rig.app)[0].children[0])
		eq(rig.log.filter, ['tag:kitchen'])
		await rig.app.settle()
		eq(rig.log.patch, [])
	} finally {
		rig.done()
	}
})

/* -------------------------------------------------------------------------- */
/* The sheet                                                                  */
/* -------------------------------------------------------------------------- */

function sheetRig(over = {}) {
	const clock = new FakeClock()
	clock.install()
	const log = []
	const props = panelProps({
		onClose: () => log.push('close'),
		onPrev: () => log.push('prev'),
		onNext: () => log.push('next'),
		onPatch: async (patch) => { log.push(`patch ${JSON.stringify(patch)}`) },
		onFilter: (c) => log.push(`filter ${c}`),
		...over,
	})
	const app = mount(panel.DetailPanel, props)
	const div = { tagName: 'DIV', getAttribute: () => null, closest: () => null }
	const arrow = (name, over2 = {}) => {
		const event = ev({ key: name, target: div, currentTarget: { contains: () => true }, ...over2 })
		captured.sheetContent.onKeyDown(event)
		app.flush()
		return event
	}
	return { app, clock, log, props, arrow, done: () => { app.unmount(); clock.uninstall() } }
}

await check('sheet: a null asset renders nothing; an open one is a right-hand sheet that is wide, scrollable and named', () => {
	const closed = sheetRig({ asset: null })
	try {
		eq(closed.app.all().length, 0)
	} finally {
		closed.done()
	}
	const rig = sheetRig()
	try {
		eq(captured.sheet.open, true)
		eq(captured.sheetContent.side, 'right')
		const cls = captured.sheetContent.className
		ok(cls.includes('w-full') && cls.includes('sm:max-w-xl') && cls.includes('lg:max-w-2xl'), cls)
		ok(cls.includes('motion-reduce:'), 'respects reduced motion')
		ok(rig.app.all((n) => n.type === 'h2').some((n) => flatText(rig.app, n) === 'Image details'), 'the dialog has a title')
		const description = rig.app.all((n) => n.type === 'p').map((n) => flatText(rig.app, n)).join(' ')
		ok(description.includes('Kitchen 1') && description.includes('image 3 of 40'), description)
		const scroller = rig.app.find((n) => String(n.props.className ?? '').includes('overflow-y-auto'))
		ok(scroller, 'the body scrolls')
		ok(rig.app.bySlot('detail-panel').length === 1)
	} finally {
		rig.done()
	}
})

await check('sheet: paging is announced, since it moves no focus', () => {
	const rig = sheetRig()
	try {
		const live = () => rig.app.byRole('status').map((n) => flatText(rig.app, n)).find((t) => t.startsWith('Image '))
		eq(live(), 'Image 3 of 40: Kitchen 1')
		rig.app.rerender({ asset: asset({ id: hex(300), name: 'Pantry' }), index: 3 })
		eq(live(), 'Image 4 of 40: Pantry')
		rig.app.rerender({ index: -1 })
		eq(rig.app.byRole('status').map((n) => flatText(rig.app, n)).includes('Pantry'), true, 'an image outside the loaded list is still named')
	} finally {
		rig.done()
	}
})

await check('sheet: previous and next page through the images; arrow keys do too, except while typing', () => {
	const rig = sheetRig()
	try {
		click(rig.app, rig.app.byLabel('Next image'))
		click(rig.app, rig.app.byLabel('Previous image'))
		eq(rig.log, ['next', 'prev'])
		rig.log.length = 0
		const right = rig.arrow('ArrowRight')
		ok(right.defaultPrevented)
		ok(right.propagationStopped, 'the page behind does not also move on the same key')
		rig.arrow('ArrowLeft')
		eq(rig.log, ['next', 'prev'])
		rig.log.length = 0
		const typing = { tagName: 'TEXTAREA', getAttribute: () => null, closest: () => null }
		const blocked = rig.arrow('ArrowRight', { target: typing })
		ok(!blocked.defaultPrevented)
		rig.arrow('ArrowRight', { target: { ...typing, tagName: 'INPUT' } })
		rig.arrow('ArrowLeft', { target: { tagName: 'BUTTON', getAttribute: (n) => (n === 'role' ? 'combobox' : null), closest: () => null } })
		rig.arrow('ArrowRight', { ctrlKey: true })
		rig.arrow('ArrowRight', { defaultPrevented: true })
		const portal = ev({ key: 'ArrowRight', target: { tagName: 'DIV', getAttribute: () => null, closest: () => null }, currentTarget: { contains: () => false } })
		captured.sheetContent.onKeyDown(portal)
		eq(rig.log, [], 'nothing paged while typing, with a modifier, or from a stacked dialog')
		// At the ends the key does nothing.
		const first = sheetRig({ index: 0, count: 5 })
		first.arrow('ArrowLeft')
		eq(first.log, [])
		first.done()
		const last = sheetRig({ index: 4, count: 5 })
		last.arrow('ArrowRight')
		eq(last.log, [])
		last.done()
	} finally {
		rig.done()
	}
})

await check('sheet: closing or paging saves a field that was typed in but not blurred, before it leaves', async () => {
	const rig = sheetRig()
	try {
		const caption = () => rig.app.find((n) => n.type === 'textarea' && n.props.maxLength === 500)
		typeInto(rig.app, caption(), 'Typed, then Esc')
		captured.sheet.onOpenChange(false)
		await rig.app.settle()
		eq(rig.log, ['patch {"caption":"Typed, then Esc"}', 'close'], 'saved first, while the page still has this image open')
		rig.log.length = 0
		typeInto(rig.app, rig.app.find((n) => n.type === 'input' && n.props.maxLength === 200), 'Renamed, then Next')
		click(rig.app, rig.app.byLabel('Next image'))
		await rig.app.settle()
		eq(rig.log, ['patch {"name":"Renamed, then Next"}', 'next'])
		rig.log.length = 0
		typeInto(rig.app, caption(), 'Typed, then arrow')
		rig.arrow('ArrowRight')
		await rig.app.settle()
		eq(rig.log, ['patch {"caption":"Typed, then arrow"}', 'next'], 'order matters: patch first, so it reaches this image')
		rig.log.length = 0
		captured.sheet.onOpenChange(false)
		await rig.app.settle()
		eq(rig.log, ['close'], 'nothing unsaved, nothing sent')
		captured.sheet.onOpenChange(true)
		eq(rig.log, ['close'], 'opening is not a close')
	} finally {
		rig.done()
	}
})

await check('sheet: another image gets fresh fields, and nothing from the old one is carried over or re-sent', async () => {
	const rig = sheetRig()
	try {
		const name = () => rig.app.find((n) => n.type === 'input' && n.props.maxLength === 200)
		typeInto(rig.app, name(), 'Half typed')
		rig.app.rerender({ asset: asset({ id: hex(200), name: 'Bathroom 1', caption: 'A bathroom' }) })
		eq(name().props.value, 'Bathroom 1', 'the new image shows its own name')
		eq(rig.app.find((n) => n.type === 'textarea' && n.props.maxLength === 500).props.value, 'A bathroom')
		await rig.app.settle()
		eq(rig.log, [], 'the old draft is not sent to the new image')
		rig.log.length = 0
		captured.sheet.onOpenChange(false)
		await rig.app.settle()
		eq(rig.log, ['close'])
	} finally {
		rig.done()
	}
})

await check('sheet: opening does not focus a field, Esc leaves an open tag list alone, and focus goes back where it came from', () => {
	const rig = sheetRig()
	try {
		const open = ev()
		captured.sheetContent.onOpenAutoFocus(open)
		ok(open.defaultPrevented, 'not the first field: it would raise a phone keyboard and stop the arrows')
		eq(rig.app.focused.props['data-slot'], 'sheet-content', 'the sheet itself is focused')
		const esc = (attrs) => {
			const event = ev({ target: { getAttribute: (n) => attrs[n] ?? null } })
			captured.sheetContent.onEscapeKeyDown(event)
			return event.defaultPrevented
		}
		eq(esc({ role: 'combobox', 'aria-expanded': 'true' }), true, 'the first Esc closes the list')
		eq(esc({ role: 'combobox', 'aria-expanded': 'false' }), false, 'then the sheet closes')
		eq(esc({}), false)
		eq(typeof captured.sheetContent.onCloseAutoFocus, 'function')
	} finally {
		rig.done()
	}
})

/* -------------------------------------------------------------------------- */
/* The bulk form                                                              */
/* -------------------------------------------------------------------------- */

function bulkRig(over = {}) {
	const clock = new FakeClock()
	clock.install()
	const log = { submit: [], close: 0, suggest: [] }
	const gates = []
	const busy = { current: false }
	const hold = over.hold ?? false
	const props = bulkProps({
		busy,
		onSubmit: (change) => {
			log.submit.push(change)
			if (!hold) return Promise.resolve()
			const gate = deferred()
			gates.push(gate)
			return gate.promise
		},
		onClose: () => log.close++,
		fetchSuggestions: (q) => {
			log.suggest.push(q)
			return Promise.resolve([])
		},
		...over.props,
	})
	const app = mount(bulk.BulkTagForm, props)
	return {
		app,
		clock,
		log,
		gates,
		busy,
		addBox: () => app.find(isCombobox),
		removeBox: () => app.find((n) => n.type === 'input' && String(n.props.id).endsWith('-remove')),
		apply: () => app.buttons().find((b) => flatText(app, b) === 'Apply'),
		form: () => app.find((n) => n.type === 'form'),
		submit: async () => {
			app.find((n) => n.type === 'form').props.onSubmit(ev())
			app.flush()
			await app.settle()
		},
		done: () => {
			app.unmount()
			clock.uninstall()
		},
	}
}

await check('bulk form: Apply stays disabled until something is entered, then sends trimmed labels and slugs', async () => {
	const rig = bulkRig()
	try {
		ok(rig.apply().props.disabled)
		typeInto(rig.app, rig.addBox(), 'alpha')
		press(rig.app, rig.addBox(), 'Enter')
		ok(!rig.apply().props.disabled)
		eq(rig.app.bySlot('staged-tag').length, 1)
		typeInto(rig.app, rig.addBox(), 'Remodel,')
		eq(rig.app.bySlot('staged-tag').length, 2)
		toggle(rig.app, rig.app.all((n) => n.type === 'input' && n.props.type === 'checkbox')[0])
		typeInto(rig.app, rig.removeBox(), '  Old Logo , ')
		await rig.submit()
		eq(rig.log.submit, [{ add: ['alpha', 'Remodel'], remove: ['kitchen', 'old-logo'] }])
		eq(rig.log.close, 1, 'closes on success')
	} finally {
		rig.done()
	}
})

await check('bulk form: typed text counts without Enter, and a ticked tag alone is enough', async () => {
	const rig = bulkRig()
	try {
		typeInto(rig.app, rig.addBox(), 'alpha, beta')
		ok(!rig.apply().props.disabled, 'typing is entering')
		await rig.submit()
		eq(rig.log.submit, [{ add: ['alpha', 'beta'], remove: [] }])
	} finally {
		rig.done()
	}
	const ticked = bulkRig()
	try {
		toggle(ticked.app, ticked.app.all((n) => n.type === 'input' && n.props.type === 'checkbox')[1])
		ok(!ticked.apply().props.disabled)
		await ticked.submit()
		eq(ticked.log.submit, [{ add: [], remove: ['van'] }])
	} finally {
		ticked.done()
	}
})

await check('bulk form: a second Enter, in either box, never applies the change', async () => {
	const rig = bulkRig()
	try {
		typeInto(rig.app, rig.addBox(), 'alpha')
		press(rig.app, rig.addBox(), 'Enter')
		ok(!rig.apply().props.disabled, 'it could be applied: that is the danger')
		const again = press(rig.app, rig.addBox(), 'Enter')
		ok(again.defaultPrevented, 'the browser is not left to submit the form')
		typeInto(rig.app, rig.removeBox(), 'old-logo')
		ok(press(rig.app, rig.removeBox(), 'Enter').defaultPrevented)
		ok(!press(rig.app, rig.removeBox(), 'a').defaultPrevented)
		ok(!press(rig.app, rig.removeBox(), 'Enter', { nativeEvent: { isComposing: true } }).defaultPrevented, 'an input method\'s Enter is its own')
		await rig.app.settle()
		eq(rig.log.submit, [], 'only the Apply button applies')
		await rig.submit()
		eq(rig.log.submit.length, 1)
	} finally {
		rig.done()
	}
})

await check('bulk form: a failed apply says why, stays open, and can be tried again; a double submit sends once', async () => {
	const rig = bulkRig({ hold: true })
	try {
		typeInto(rig.app, rig.addBox(), 'alpha')
		press(rig.app, rig.addBox(), 'Enter')
		rig.form().props.onSubmit(ev())
		rig.form().props.onSubmit(ev())
		rig.app.flush()
		eq(rig.log.submit.length, 1, 'a second submit while one is out is dropped')
		ok(rig.busy.current, 'the dialog is told it is busy (Esc and the overlay are refused)')
		ok(rig.apply().props.disabled)
		ok(rig.addBox().props.disabled, 'inputs wait while it applies')
		ok(rig.app.all((n) => n.type === 'input' && n.props.type === 'checkbox').every((c) => c.props.disabled))
		rig.gates[0].reject(new Error('Only 38 of 40 could be changed.'))
		await rig.app.settle()
		eq(rig.app.byRole('alert').map((n) => flatText(rig.app, n)), ['Only 38 of 40 could be changed.'])
		eq(rig.log.close, 0, 'not closed on failure')
		eq(rig.busy.current, false)
		ok(!rig.apply().props.disabled, 'it can be tried again')
		eq(rig.app.bySlot('staged-tag').length, 1, 'what was entered is kept')
		await rig.submit()
		eq(rig.log.submit.length, 2)
		rig.gates[1].resolve()
		await rig.app.settle()
		eq(rig.log.close, 1)
	} finally {
		rig.done()
	}
})

await check('bulk form: failures of every shape become a sentence, never an unhandled rejection', async () => {
	for (const failure of [() => Promise.reject(undefined), () => Promise.reject('plain'), () => { throw new Error('sync') }]) {
		const rig = bulkRig({ props: { onSubmit: failure } })
		try {
			typeInto(rig.app, rig.addBox(), 'alpha')
			await rig.submit()
			ok(rig.app.byRole('alert').length === 1 && !/undefined/.test(flatText(rig.app, rig.app.byRole('alert')[0])))
			eq(rig.log.close, 0)
		} finally {
			rig.done()
		}
	}
})

await check('bulk form: a tag in both lists blocks Apply and says so; a staged chip can be taken back', async () => {
	const rig = bulkRig()
	try {
		typeInto(rig.app, rig.addBox(), 'Kitchen')
		press(rig.app, rig.addBox(), 'Enter')
		toggle(rig.app, rig.app.all((n) => n.type === 'input' && n.props.type === 'checkbox')[0])
		ok(rig.apply().props.disabled)
		ok(rig.app.text().includes('"Kitchen" is in both Add and Remove'))
		click(rig.app, rig.app.byLabel('Do not add Kitchen'))
		eq(rig.app.bySlot('staged-tag').length, 0)
		ok(!rig.apply().props.disabled, 'only the removal is left')
		await rig.submit()
		eq(rig.log.submit, [{ add: [], remove: ['kitchen'] }])
	} finally {
		rig.done()
	}
})

await check('bulk form: pasting a list stages every tag; the same tag twice is noted; 20 is the most', async () => {
	const rig = bulkRig()
	try {
		pasteInto(rig.app, rig.addBox(), 'a, b, c')
		eq(rig.app.bySlot('staged-tag').map((t) => flatText(rig.app, t)), ['a', 'b', 'c'])
		typeInto(rig.app, rig.addBox(), 'B')
		press(rig.app, rig.addBox(), 'Enter')
		eq(rig.app.bySlot('staged-tag').length, 3)
		ok(rig.app.byRole('status').some((n) => flatText(rig.app, n).includes('"B" is already in the list.')))
		pasteInto(rig.app, rig.addBox(), Array.from({ length: 25 }, (_, i) => `t${i}`).join(','))
		eq(rig.app.bySlot('staged-tag').length, 20, 'never more than a call can carry')
		ok(rig.app.byRole('alert').map((n) => flatText(rig.app, n)).join(' ').includes('up to 20 tags at a time'))
	} finally {
		rig.done()
	}
})

await check('bulk form: the Add box asks for suggestions the same way the editor does', async () => {
	const rig = bulkRig()
	try {
		typeInto(rig.app, rig.addBox(), 'kit')
		rig.clock.advance(120)
		eq(rig.log.suggest, ['kit'])
		eq(rig.addBox().props.role, 'combobox')
	} finally {
		rig.done()
	}
})

await check('bulk dialog: Esc and the overlay cannot close it mid-request, and the count line is shown', async () => {
	const closes = []
	const gate = deferred()
	const app = mount(bulk.BulkTagDialog, {
		open: true,
		onOpenChange: (open) => closes.push(open),
		count: 37,
		existing: [],
		fetchSuggestions: async () => [],
		onSubmit: () => gate.promise,
	})
	try {
		ok(app.all((n) => n.type === 'p').some((n) => flatText(app, n) === 'Applies to 37 images'))
		ok(app.all((n) => n.type === 'h2').some((n) => flatText(app, n) === 'Tag images'))
		captured.dialog.onOpenChange(false)
		eq(closes, [false], 'free to close when nothing is running')
		closes.length = 0
		const input = app.find(isCombobox)
		typeInto(app, input, 'alpha')
		app.find((n) => n.type === 'form').props.onSubmit(ev())
		app.flush()
		captured.dialog.onOpenChange(false)
		eq(closes, [], 'refused while applying')
		gate.resolve()
		await app.settle()
		eq(closes, [false], 'closes itself on success')
		const escape = (attrs) => {
			const event = ev({ target: { getAttribute: (n) => attrs[n] ?? null } })
			captured.dialogContent.onEscapeKeyDown(event)
			return event.defaultPrevented
		}
		eq(escape({ role: 'combobox', 'aria-expanded': 'true' }), true)
		eq(escape({}), false)
	} finally {
		app.unmount()
	}
})

/* -------------------------------------------------------------------------- */
/* The tag manager                                                            */
/* -------------------------------------------------------------------------- */

function managerRig(over = {}) {
	const clock = new FakeClock()
	clock.install()
	const log = { fetch: 0, rename: [], merge: [], delete: [], filter: [], close: 0 }
	const gates = { fetch: [], rename: [], merge: [], delete: [] }
	const busy = { current: false }
	const hold = over.hold ?? true
	const make = (name, record) => (...args) => {
		record(...args)
		const gate = deferred()
		gates[name].push(gate)
		return gate.promise
	}
	const props = {
		canEdit: true,
		canDelete: true,
		busy,
		fetchTags: make('fetch', () => log.fetch++),
		onRename: make('rename', (slug, label) => log.rename.push([slug, label])),
		onMerge: make('merge', (slug, into) => log.merge.push([slug, into])),
		onDelete: make('delete', (slug) => log.delete.push(slug)),
		onFilter: (slug) => log.filter.push(slug),
		onClose: () => log.close++,
		...over.props,
	}
	const app = mount(manager.TagManagerBody, props)
	return {
		app,
		clock,
		log,
		gates,
		busy,
		props,
		rows: () => app.bySlot('tag-row').map((r) => r.props['data-slug']),
		button: (name) => app.button(name),
		editor: () => app.bySlot('tag-row-editor')[0],
		load: async (tags, index = log.fetch - 1) => {
			gates.fetch[index].resolve(tags)
			await app.settle()
		},
		done: () => {
			app.unmount()
			clock.uninstall()
		},
	}
}
const sampleTags = () => [
	stat('Kitchen', 214, { manual: 200, auto: 14 }),
	stat('Kitchens', 12, { manual: 12, auto: 0 }),
	stat('Van', 40, { manual: 5, auto: 35 }),
	stat('Truck', 90),
]

await check('manager: it loads once when opened, shows a skeleton, then the rows; a failed load can be retried', async () => {
	const rig = managerRig()
	try {
		eq(rig.log.fetch, 1)
		ok(rig.app.bySlot('tag-manager-loading').length === 1)
		rig.gates.fetch[0].reject(new Error('Could not load your tags.'))
		await rig.app.settle()
		eq(rig.app.byRole('alert').map((n) => flatText(rig.app, n)).join(' ').includes('Could not load your tags.'), true)
		eq(rig.rows(), [])
		click(rig.app, rig.button('Try again'))
		eq(rig.log.fetch, 2)
		ok(rig.app.bySlot('tag-manager-loading').length === 1, 'the skeleton again while retrying')
		await rig.load(sampleTags())
		eq(rig.rows(), ['kitchen', 'truck', 'van', 'kitchens'], 'most images first')
		// A re-render with a new callback identity must not trigger another load.
		rig.app.rerender({ fetchTags: () => { rig.log.fetch++; return Promise.resolve([]) } })
		await rig.app.settle()
		eq(rig.log.fetch, 2)
	} finally {
		rig.done()
	}
})

await check('manager: closing before the answer arrives leaves nothing to update', async () => {
	const rig = managerRig()
	rig.app.unmount()
	rig.gates.fetch[0].resolve(sampleTags())
	await tick()
	rig.clock.uninstall()
})

await check('manager: search narrows the rows and sorting switches between most images and A to Z', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		const search = rig.app.find((n) => n.type === 'input' && n.props.type === 'search')
		typeInto(rig.app, search, 'kit')
		eq(rig.rows(), ['kitchen', 'kitchens'])
		typeInto(rig.app, rig.app.find((n) => n.type === 'input' && n.props.type === 'search'), 'zzz')
		eq(rig.rows(), [])
		ok(rig.app.bySlot('tag-manager-no-match').length === 1)
		click(rig.app, rig.button('Clear search'))
		eq(rig.rows().length, 4)
		const heads = rig.app.all((n) => n.type === 'th' && n.props.scope === 'col')
		click(rig.app, heads[0].children[0])
		eq(rig.rows(), ['kitchen', 'kitchens', 'truck', 'van'], 'A to Z')
		eq(rig.app.all((n) => n.type === 'th' && n.props.scope === 'col')[0].props['aria-sort'], 'ascending')
		click(rig.app, rig.app.all((n) => n.type === 'th' && n.props.scope === 'col')[1].children[0])
		eq(rig.rows(), ['kitchen', 'truck', 'van', 'kitchens'])
	} finally {
		rig.done()
	}
})

await check('manager: closing the dialog while a change runs (Show images) starts no reload nobody will see', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Rename "Van"'))
		typeInto(rig.app, rig.app.all((n) => n.type === 'input' && n.props.type === 'text')[0], 'Delivery van')
		rig.editor().props.onSubmit(ev())
		rig.app.flush()
		click(rig.app, rig.button('Show images tagged "Truck"'))
		eq(rig.log.close, 1)
		rig.app.unmount()
		rig.gates.rename[0].resolve({ slug: 'delivery-van', merged: false })
		await tick()
		await tick()
		eq(rig.log.fetch, 1, 'no second load once the dialog is gone')
		eq(rig.busy.current, false, 'and the busy flag is released')
	} finally {
		rig.done()
	}
})

await check('manager: Show images filters by the tag and closes the dialog', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Show images tagged "Van"'))
		eq(rig.log.filter, ['van'])
		eq(rig.log.close, 1)
	} finally {
		rig.done()
	}
})

await check('manager: renaming into an existing tag is explained first, then saved as the merge it is, and the list reloads', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Rename "Kitchens"'))
		const input = () => rig.app.all((n) => n.type === 'input' && n.props.type === 'text')[0]
		eq(input().props.value, 'Kitchens')
		typeInto(rig.app, input(), 'Kitchen')
		const note = () => rig.app.find((n) => n.props['data-impact'])
		eq(note().props['data-impact'], 'merge')
		ok(flatText(rig.app, note()).includes('merges "Kitchens" into it'))
		eq(rig.log.rename, [], 'nothing happened yet: it was only explained')
		rig.editor().props.onSubmit(ev())
		rig.app.flush()
		eq(rig.log.rename, [['kitchens', 'Kitchen']])
		ok(rig.busy.current, 'the dialog cannot be closed while it runs')
		const rowActions = rig.app.all((n) => n.type === 'button' && /^(Rename|Merge|Delete) /.test(n.props['aria-label'] ?? ''))
		ok(rowActions.length === 12 && rowActions.every((b) => b.props.disabled), 'one change at a time')
		rig.editor().props.onSubmit(ev())
		eq(rig.log.rename.length, 1, 'no second request')
		rig.gates.rename[0].resolve({ slug: 'kitchen', merged: true })
		await rig.app.settle()
		eq(rig.busy.current, false)
		const notice = rig.app.bySlot('tag-manager-notice')[0]
		ok(flatText(rig.app, notice).includes('Merged into "Kitchen".'), flatText(rig.app, notice))
		eq(rig.log.fetch, 2, 'reloaded after the change')
		eq(rig.rows().length, 4, 'the old rows stay while it reloads')
		ok(rig.app.text().includes('Updating'))
		await rig.load([stat('Kitchen', 226), stat('Van', 40), stat('Truck', 90)])
		eq(rig.rows(), ['kitchen', 'truck', 'van'])
		ok(!rig.app.text().includes('Updating'))
		eq(rig.app.bySlot('tag-row-editor').length, 0)
	} finally {
		rig.done()
	}
})

await check('manager: a plain rename says "Renamed to ...", and the label sent is the cleaned one', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Rename "Van"'))
		typeInto(rig.app, rig.app.all((n) => n.type === 'input').find((n) => n.props.value === 'Van'), '  Delivery   van ')
		rig.editor().props.onSubmit(ev())
		rig.app.flush()
		eq(rig.log.rename, [['van', 'Delivery van']], 'whitespace collapsed and trimmed')
		ok(assetPatchSchema.safeParse({ addTags: [rig.log.rename[0][1]] }).success)
		rig.gates.rename[0].resolve({ slug: 'delivery-van', merged: false })
		await rig.app.settle()
		ok(flatText(rig.app, rig.app.bySlot('tag-manager-notice')[0]).includes('Renamed to "Delivery van".'))
	} finally {
		rig.done()
	}
})

await check('manager: a rename answer that is not what the contract says still reads as a rename, not a crash', async () => {
	for (const answer of [undefined, null, {}, { merged: 'yes' }, 'text']) {
		const rig = managerRig()
		try {
			await rig.load(sampleTags())
			click(rig.app, rig.button('Rename "Van"'))
			typeInto(rig.app, rig.app.all((n) => n.type === 'input' && n.props.type === 'text')[0], 'Delivery van')
			rig.editor().props.onSubmit(ev())
			rig.gates.rename[0].resolve(answer)
			await rig.app.settle()
			const notice = flatText(rig.app, rig.app.bySlot('tag-manager-notice')[0])
			ok(notice.startsWith('Renamed to "Delivery van"'), notice)
			ok(!/undefined|null|object/.test(notice), notice)
			eq(rig.busy.current, false)
		} finally {
			rig.done()
		}
	}
})

await check('manager: a rename that cannot be saved stays open with the reason, and a no-op or invalid name never reaches the server', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Rename "Van"'))
		const box = () => rig.app.all((n) => n.type === 'input' && n.props.type === 'text')[0]
		rig.editor().props.onSubmit(ev())
		eq(rig.log.rename, [], 'unchanged')
		typeInto(rig.app, box(), '!!!')
		rig.editor().props.onSubmit(ev())
		eq(rig.log.rename, [], 'invalid')
		typeInto(rig.app, box(), 'Truck van')
		rig.editor().props.onSubmit(ev())
		rig.gates.rename[0].reject(new Error('A tag cannot be renamed right now.'))
		await rig.app.settle()
		eq(rig.app.bySlot('tag-row-editor').length, 1, 'still open')
		ok(rig.app.byRole('alert').map((n) => flatText(rig.app, n)).join(' ').includes('A tag cannot be renamed right now.'))
		eq(rig.busy.current, false)
		eq(rig.log.fetch, 1, 'a failed change does not reload')
		ok(box().props.value === 'Truck van', 'the name is kept for another try')
		// Esc backs out of the rename, and is claimed so the dialog stays open.
		const esc = press(rig.app, box(), 'Escape')
		ok(esc.defaultPrevented)
		eq(rig.app.bySlot('tag-row-editor').length, 0)
	} finally {
		rig.done()
	}
})

await check('manager: merging picks a target from the other tags, explains it, then merges and reloads', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Merge "Van" into another tag'))
		const combo = () => rig.app.find(isCombobox)
		eq(combo().props['aria-expanded'], true)
		typeInto(rig.app, combo(), 'tru')
		eq(rig.app.byRole('option').map((o) => flatText(rig.app, o)), ['Truck (90)'])
		ok(!rig.app.byRole('option').some((o) => flatText(rig.app, o).includes('Van')))
		press(rig.app, combo(), 'ArrowDown')
		press(rig.app, combo(), 'Enter')
		eq(rig.app.find(isCombobox), undefined, 'a target is chosen')
		ok(flatText(rig.app, rig.app.find((n) => n.props['data-impact'])).includes('The 40 images tagged "Van" will be tagged "Truck" instead'))
		eq(rig.log.merge, [], 'not yet')
		rig.editor().props.onSubmit(ev())
		rig.app.flush()
		eq(rig.log.merge, [['van', 'truck']])
		rig.gates.merge[0].resolve()
		await rig.app.settle()
		ok(flatText(rig.app, rig.app.bySlot('tag-manager-notice')[0]).includes('Merged "Van" into "Truck".'))
		eq(rig.log.fetch, 2)
		await rig.load([stat('Truck', 130), stat('Kitchen', 214)])
		eq(rig.rows(), ['kitchen', 'truck'])
	} finally {
		rig.done()
	}
})

await check('manager: focus goes back to the button that opened a rename or merge when it is cancelled', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Rename "Van"'))
		click(rig.app, rig.app.button('Cancel'))
		eq(rig.app.focused.props['aria-label'], 'Rename "Van"', 'back on the row action')
		click(rig.app, rig.button('Merge "Truck" into another tag'))
		press(rig.app, rig.app.find(isCombobox), 'Escape')
		eq(rig.app.focused.props['aria-label'], 'Merge "Truck" into another tag')
		// Delete: the alert closes and focus returns to that row's Delete button.
		click(rig.app, rig.button('Delete "Van"'))
		captured.alert.onOpenChange(false)
		rig.app.flush()
		eq(rig.app.focused.props['aria-label'], 'Delete "Van"')
	} finally {
		rig.done()
	}
})

await check('manager: after a change the opener is waiting for the reload, so focus goes to the search box instead of being lost', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Delete "Van"'))
		click(rig.app, rig.app.find((n) => n.props['data-slot'] === 'alert-action'))
		rig.gates.delete[0].resolve()
		await rig.app.settle()
		eq(rig.app.focused.props.type, 'search', 'the search box')
		await rig.load([stat('Kitchen', 214)])
		rig.app.focused = null
		click(rig.app, rig.button('Rename "Kitchen"'))
		typeInto(rig.app, rig.app.all((n) => n.type === 'input' && n.props.type === 'text')[0], 'Kitchens')
		rig.editor().props.onSubmit(ev())
		rig.app.flush()
		rig.gates.rename[0].resolve({ slug: 'kitchens', merged: false })
		await rig.app.settle()
		eq(rig.app.focused.props.type, 'search')
	} finally {
		rig.done()
	}
})

await check('manager: Esc in the merge picker backs out of the merge, and Change returns to the picker', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Merge "Van" into another tag'))
		typeInto(rig.app, rig.app.find(isCombobox), 'tru')
		press(rig.app, rig.app.find(isCombobox), 'ArrowDown')
		press(rig.app, rig.app.find(isCombobox), 'Enter')
		click(rig.app, rig.button('Change'))
		ok(rig.app.find(isCombobox), 'the picker is back')
		const esc = press(rig.app, rig.app.find(isCombobox), 'Escape')
		ok(esc.defaultPrevented)
		eq(rig.app.bySlot('tag-row-editor').length, 0)
		eq(rig.log.merge, [])
	} finally {
		rig.done()
	}
})

await check('manager: a merge that fails stays open with the reason', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Merge "Van" into another tag'))
		typeInto(rig.app, rig.app.find(isCombobox), 'tru')
		press(rig.app, rig.app.find(isCombobox), 'ArrowDown')
		press(rig.app, rig.app.find(isCombobox), 'Enter')
		rig.editor().props.onSubmit(ev())
		rig.gates.merge[0].reject(new Error('That tag was just deleted.'))
		await rig.app.settle()
		ok(rig.app.byRole('alert').map((n) => flatText(rig.app, n)).join(' ').includes('That tag was just deleted.'))
		eq(rig.app.bySlot('tag-row-editor').length, 1)
		eq(rig.busy.current, false)
	} finally {
		rig.done()
	}
})

await check('manager: delete explains what it removes and that the auto-tagger will not bring it back, then deletes and reloads', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Delete "Van"'))
		eq(captured.alert.open, true)
		const words = flatText(rig.app, rig.app.find((n) => n.props.role === 'alertdialog'))
		ok(words.includes('Delete the tag "Van"?'), words)
		ok(words.includes('removed from every image that has it (40 images)'), words)
		ok(words.includes('the auto-tagger will not bring it back'), words)
		ok(words.includes('The images themselves are not deleted'), words)
		eq(rig.log.delete, [], 'nothing deleted by opening it')
		const confirm = () => rig.app.find((n) => n.props['data-slot'] === 'alert-action')
		ok(click(rig.app, confirm()).defaultPrevented, 'stay open until answered')
		eq(rig.log.delete, ['van'])
		ok(confirm().props.disabled)
		click(rig.app, confirm())
		eq(rig.log.delete.length, 1)
		captured.alert.onOpenChange(false)
		rig.app.flush()
		eq(captured.alert.open, true, 'not dismissable mid-delete')
		rig.gates.delete[0].resolve()
		await rig.app.settle()
		eq(captured.alert.open, false)
		ok(flatText(rig.app, rig.app.bySlot('tag-manager-notice')[0]).includes('Deleted "Van".'))
		eq(rig.log.fetch, 2)
	} finally {
		rig.done()
	}
})

await check('manager: a delete that fails stays open in the dialog with the reason; cancelling leaves everything as it was', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Delete "Van"'))
		click(rig.app, rig.app.find((n) => n.props['data-slot'] === 'alert-action'))
		rig.gates.delete[0].reject(new Error('Could not delete that tag.'))
		await rig.app.settle()
		eq(captured.alert.open, true)
		ok(rig.app.byRole('alert').map((n) => flatText(rig.app, n)).join(' ').includes('Could not delete that tag.'))
		captured.alert.onOpenChange(false)
		rig.app.flush()
		eq(captured.alert.open, false)
		eq(rig.log.fetch, 1)
		eq(rig.rows().length, 4)
	} finally {
		rig.done()
	}
})

await check('manager: every failure shape becomes a sentence, never an unhandled rejection', async () => {
	for (const failure of [() => Promise.reject(undefined), () => Promise.reject('plain'), () => Promise.reject(new Error('')), () => { throw new Error('sync') }]) {
		const rig = managerRig({ props: { onDelete: failure, onRename: failure, onMerge: failure } })
		try {
			await rig.load(sampleTags())
			click(rig.app, rig.button('Delete "Van"'))
			click(rig.app, rig.app.find((n) => n.props['data-slot'] === 'alert-action'))
			await rig.app.settle(6)
			const text = rig.app.byRole('alert').map((n) => flatText(rig.app, n)).join(' ')
			ok(text.length > 0 && !/undefined|null/.test(text), text)
			eq(rig.busy.current, false)
		} finally {
			rig.done()
		}
	}
})

await check('manager: a viewer or editor without delete sees only what they can do, and cannot reach the rest', async () => {
	const rig = managerRig({ props: { canEdit: false, canDelete: false } })
	try {
		await rig.load(sampleTags())
		eq(rig.app.all((n) => n.type === 'button' && /^(Rename|Merge|Delete)/.test(n.props['aria-label'] ?? '')).length, 0)
		ok(rig.app.all((n) => n.type === 'button' && /^Show images/.test(n.props['aria-label'] ?? '')).length === 4)
	} finally {
		rig.done()
	}
})

await check('manager: a reload that fails keeps the last good rows and offers Reload, and the retry works', async () => {
	const rig = managerRig()
	try {
		await rig.load(sampleTags())
		click(rig.app, rig.button('Delete "Van"'))
		click(rig.app, rig.app.find((n) => n.props['data-slot'] === 'alert-action'))
		rig.gates.delete[0].resolve()
		await rig.app.settle()
		eq(rig.log.fetch, 2, 'the change reloads')
		rig.gates.fetch[1].reject(new Error('Could not load your tags.'))
		await rig.app.settle()
		eq(rig.rows().length, 4, 'the last good rows stay')
		ok(rig.app.byRole('alert').map((n) => flatText(rig.app, n)).join(' ').includes('Could not load your tags.'))
		ok(rig.app.button('Reload'))
		click(rig.app, rig.button('Reload'))
		eq(rig.log.fetch, 3)
		ok(!rig.app.byRole('alert').length, 'the message goes while it retries')
		ok(rig.app.text().includes('Updating'))
		ok(rig.app.all((n) => n.type === 'button' && /^(Rename|Merge|Delete) /.test(n.props['aria-label'] ?? '')).every((b) => b.props.disabled), 'no change while it reloads')
		await rig.load([stat('Truck', 90), stat('Kitchen', 214)])
		eq(rig.rows(), ['kitchen', 'truck'])
		ok(!rig.app.text().includes('Updating'))
	} finally {
		rig.done()
	}
})

await check('manager dialog: it cannot be closed mid-change, and Esc inside a rename or merge only backs out of that', async () => {
	const closes = []
	const rig = (() => {
		const gates = { fetch: [], rename: [] }
		const props = {
			open: true,
			onOpenChange: (open) => closes.push(open),
			canEdit: true,
			canDelete: true,
			fetchTags: () => { const g = deferred(); gates.fetch.push(g); return g.promise },
			onRename: () => { const g = deferred(); gates.rename.push(g); return g.promise },
			onMerge: asyncNoop,
			onDelete: asyncNoop,
			onFilter: noop,
		}
		return { gates, app: mount(manager.TagManagerDialog, props) }
	})()
	try {
		ok(rig.app.all((n) => n.type === 'h2').some((n) => flatText(rig.app, n) === 'Manage tags'))
		captured.dialog.onOpenChange(false)
		eq(closes, [false])
		closes.length = 0
		rig.gates.fetch[0].resolve(sampleTags())
		await rig.app.settle()
		click(rig.app, rig.app.button('Rename "Van"'))
		const box = rig.app.all((n) => n.type === 'input').find((n) => n.props.value === 'Van')
		typeInto(rig.app, box, 'Delivery van')
		rig.app.bySlot('tag-row-editor')[0].props.onSubmit(ev())
		rig.app.flush()
		captured.dialog.onOpenChange(false)
		eq(closes, [], 'refused while a change is running')
		rig.gates.rename[0].resolve({ slug: 'delivery-van', merged: false })
		await rig.app.settle()
		captured.dialog.onOpenChange(false)
		eq(closes, [false])
		const esc = (inEditor) => {
			const event = ev({ target: { closest: (sel) => (inEditor && sel.includes('tag-row-editor') ? {} : null) } })
			captured.dialogContent.onEscapeKeyDown(event)
			return event.defaultPrevented
		}
		eq(esc(true), true)
		eq(esc(false), false)
	} finally {
		rig.app.unmount()
	}
})

/* ========================================================================== */
/* Source hygiene: the rules of the codebase and of the build spec            */
/* ========================================================================== */

const { readFile } = await import('node:fs/promises')
const MEDIA_UI = ['detail-panel', 'tag-editor', 'bulk-tag-dialog', 'tag-manager-dialog']
const sources = {}
for (const name of MEDIA_UI) sources[name] = await readFile(new URL(`../src/app/account/media/${name}.tsx`, import.meta.url), 'utf8')
const codeLines = (name) => sources[name].split('\n').map((text, index) => ({ text, number: index + 1 })).filter(({ text }) => !/^\s*(\*|\/\/|\/\*)/.test(text))

await check('source: style of the codebase (use client first, named exports, tabs, no semicolons, single-quoted JSX, no emoji)', () => {
	for (const name of MEDIA_UI) {
		const source = sources[name]
		ok(source.startsWith("'use client'\n"), `${name}: 'use client' must come first`)
		ok(!/^export default/m.test(source), `${name}: named exports only`)
		const lines = codeLines(name)
		const semis = lines.filter(({ text }) => /;\s*$/.test(text))
		eq(semis.map((l) => `${name}:${l.number}`), [], `${name} has lines ending in a semicolon`)
		const spaced = source.split('\n').map((text, index) => ({ text, number: index + 1 })).filter(({ text }) => /^ +\S/.test(text) && !/^ \*/.test(text))
		eq(spaced.map((l) => `${name}:${l.number}`), [], `${name} is indented with spaces`)
		const doubleQuoted = lines.filter(({ text }) => /(^|\s)[A-Za-z][\w-]*="/.test(text) && !/Selector|SELECTOR|querySelector|\[data-|contenteditable|=""/.test(text))
		eq(doubleQuoted.map((l) => `${name}:${l.number} ${l.text.trim().slice(0, 60)}`), [], `${name} has double-quoted JSX attributes`)
		ok(!/\p{Extended_Pictographic}/u.test(source), `${name} contains an emoji`)
		ok(!/\r/.test(source), `${name} has carriage returns`)
	}
})

await check('source: nothing here can render markup from data, run code from data or keep state outside the page', () => {
	for (const name of MEDIA_UI) {
		const source = sources[name]
		for (const banned of ['dangerouslySetInnerHTML', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'localStorage', 'sessionStorage', 'console.', 'window.open', 'location.href', 'location.assign'])
			ok(!source.includes(banned), `${name} uses ${banned}`)
		// A link that opens another page must not hand it the opener.
		for (const match of source.matchAll(/target='_blank'/g)) {
			const around = source.slice(match.index - 200, match.index + 200)
			ok(/rel='noopener noreferrer'/.test(around), `${name}: target=_blank without rel=noopener`)
		}
	}
})

await check('source: only client-safe modules are imported (no server-only, mongodb, sharp, stubs or other agents\' files)', () => {
	const allowedRelative = new Set(['./contracts', './format', './tag-editor'])
	const allowedMedia = new Set(['@/lib/media/text', '@/lib/media/types', '@/lib/media/schemas'])
	for (const name of MEDIA_UI) {
		const imports = [...sources[name].matchAll(/^import\s+(type\s+)?([\s\S]*?)\s+from\s+'([^']+)'/gm)].map((m) => ({ isType: Boolean(m[1]), from: m[3], text: m[0] }))
		ok(imports.length > 3, `${name}: found its imports`)
		for (const { from, isType, text } of imports) {
			if (from.startsWith('./')) ok(allowedRelative.has(from), `${name} imports ${from}`)
			else if (from.startsWith('@/lib/media/')) {
				ok(allowedMedia.has(from), `${name} imports ${from}`)
				if (from === '@/lib/media/schemas') ok(isType, `${name}: schemas must be a type-only import`)
			} else if (from.startsWith('@/')) ok(/^@\/(components\/ui\/[a-z-]+|lib\/utils)$/.test(from), `${name} imports ${from}`)
			else if (from.startsWith('next/')) ok(from === 'next/image' && name === 'detail-panel', `${name} imports ${from}`)
			else ok(['react', 'lucide-react'].includes(from), `${name} imports package ${from}`)
			ok(!/server-only|mongodb|sharp|@vercel\/blob|@anthropic/.test(from), `${name} imports ${from}`)
		}
	}
})

await check('source: the contract types are used as written, and nothing outside the five owned files is needed to run them', () => {
	for (const [file, type] of [['detail-panel', 'DetailPanelProps'], ['tag-editor', 'TagEditorProps'], ['bulk-tag-dialog', 'BulkTagDialogProps'], ['tag-manager-dialog', 'TagManagerDialogProps']])
		ok(new RegExp(`\\b${type}\\b`).test(sources[file]), `${file} does not use ${type}`)
	for (const [file, names] of [['detail-panel', ['DetailPanel']], ['tag-editor', ['TagEditor']], ['bulk-tag-dialog', ['BulkTagDialog']], ['tag-manager-dialog', ['TagManagerDialog']]])
		for (const name of names) ok(new RegExp(`^export function ${name}\\(`, 'm').test(sources[file]), `${file} must export ${name}`)
})

await check('source: Radix is the only way a dialog or sheet opens, and every one has a title and a description', () => {
	for (const [name, parts] of [['detail-panel', ['SheetTitle', 'SheetDescription', 'AlertDialogTitle', 'AlertDialogDescription']], ['bulk-tag-dialog', ['DialogTitle', 'DialogDescription']], ['tag-manager-dialog', ['DialogTitle', 'DialogDescription', 'AlertDialogTitle', 'AlertDialogDescription']]])
		for (const part of parts) ok(new RegExp(`<${part}[ >]`).test(sources[name]), `${name} lacks <${part}>`)
})

await check('source: motion respects prefers-reduced-motion (spinners, skeletons, and every sheet and dialog)', () => {
	for (const name of MEDIA_UI) {
		const source = sources[name]
		for (const match of source.matchAll(/animate-spin/g))
			ok(source.slice(match.index, match.index + 60).includes('motion-reduce:animate-none'), `${name}: a spinner that ignores reduced motion`)
		ok(!/animate-pulse|animate-bounce|animate-ping/.test(source), `${name} animates by hand`)
		for (const match of source.matchAll(/<Skeleton className='([^']*)'/g))
			ok(match[1].includes('motion-reduce:animate-none'), `${name}: a skeleton that pulses regardless`)
		for (const match of source.matchAll(/<(SheetContent|DialogContent|AlertDialogContent)\b/g))
			ok(source.slice(match.index, match.index + 1600).includes('motion-reduce:animate-none!'), `${name}: <${match[1]}> slides or zooms regardless`)
	}
})

/* -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`)
console.log(`${passed}/${passed + failed} passed`)
if (consoleProblems.length) {
	console.log(`console problems (${consoleProblems.length}):`)
	for (const p of consoleProblems.slice(0, 10)) console.log(`  ${p}`)
}
if (unhandled.length) console.log(`unhandled rejections: ${unhandled.length}`)
finished = true
process.exit(failed === 0 && consoleProblems.length === 0 && unhandled.length === 0 ? 0 : 1)
