/**
 * Proves the media library grid UI: AssetGrid, AssetCard, GridToolbar, SelectionBar.
 *
 *   node scripts/prove-media-ui-grid.mjs
 *
 * Two ways of looking at the real components, no DOM and no browser:
 *  1. renderToString (SSR) for what a person would see and what a screen reader
 *     would be told, parsed back with a small HTML reader.
 *  2. A tiny hook-aware renderer (`mount`) that expands the same components into a
 *     tree of host elements, keeps hook state between renders and runs effects, so
 *     event handlers (click, keys, dragstart) and the IntersectionObserver sentinel
 *     can be driven for real.
 *
 * Expectations come from the build spec and the contracts, not from the code.
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

async function check(name, fn) {
	const before = consoleProblems.length
	try {
		await fn()
		if (consoleProblems.length !== before)
			throw new Error(`console output: ${consoleProblems[before]}`)
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${error?.message ?? error})`)
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message ?? 'assertion failed')
}
function eq(actual, expected, message = '') {
	const a = JSON.stringify(actual)
	const b = JSON.stringify(expected)
	if (a !== b) throw new Error(`${message} expected ${b}, got ${a}`)
}

/* -------------------------------------------------------------------------- */
/* Stand-ins for next/*, then the real components                             */
/* -------------------------------------------------------------------------- */

mock('next/image', {
	__esModule: true,
	default: function FakeImage(props) {
		return h('img', {
			src: props.src,
			alt: props.alt,
			sizes: props.sizes,
			className: props.className,
			draggable: props.draggable,
			'data-fill': props.fill ? '1' : undefined,
			'data-unoptimized': props.unoptimized ? '1' : undefined,
			'data-placeholder': props.placeholder,
			'data-blur': props.blurDataURL,
		})
	},
})
mock('next/link', {
	__esModule: true,
	default: function FakeLink({ href, children, ...rest }) {
		return h('a', { href, ...rest }, children)
	},
})

const { AssetGrid, GRID_COLUMNS, dedupeAssets } = loadTs('src/app/account/media/asset-grid.tsx')
const card = loadTs('src/app/account/media/asset-card.tsx')
const { GridToolbar, SORT_LABELS, formatTotal, sortOptions } = loadTs('src/app/account/media/grid-toolbar.tsx')
const { SelectionBar } = loadTs('src/app/account/media/selection-bar.tsx')
const { DRAG_MIME } = loadTs('src/app/account/media/contracts.ts')
const { MEDIA_SORTS } = loadTs('src/lib/media/types.ts')

/* -------------------------------------------------------------------------- */
/* Interactive copies: Radix swapped for faithful plain stand-ins             */
/* -------------------------------------------------------------------------- */

// The mini renderer below cannot expand context providers, so the copies that are mounted
// (handlers, effects) get stand-ins with the same host element, role, ARIA and callback
// semantics as Radix. The server-rendered checks above and below use the real components.
const captured = {}
let toggleGroup = null
const RADIX_UI = ['checkbox', 'switch', 'toggle', 'toggle-group', 'select']
mock('@/components/ui/checkbox', {
	// Radix: aria-checked true/false/mixed; a click runs onClick, then (unless prevented)
	// onCheckedChange with the next state (indeterminate -> true).
	Checkbox: ({ checked, onCheckedChange, onClick, ...rest }) =>
		h('button', {
			type: 'button',
			role: 'checkbox',
			'aria-checked': checked === 'indeterminate' ? 'mixed' : String(checked === true),
			'data-state': checked === 'indeterminate' ? 'indeterminate' : checked ? 'checked' : 'unchecked',
			value: 'on',
			'data-slot': 'checkbox',
			...rest,
			onClick: (event) => {
				onClick?.(event)
				if (!event?.defaultPrevented) onCheckedChange?.(checked === 'indeterminate' ? true : !checked)
			},
		}),
})
mock('@/components/ui/switch', {
	Switch: ({ checked, onCheckedChange, ...rest }) =>
		h('button', {
			type: 'button',
			role: 'switch',
			'aria-checked': String(!!checked),
			'data-state': checked ? 'checked' : 'unchecked',
			value: 'on',
			'data-slot': 'switch',
			...rest,
			onClick: () => onCheckedChange?.(!checked),
		}),
})
mock('@/components/ui/toggle', {
	Toggle: ({ pressed, onPressedChange, variant, size, children, ...rest }) =>
		h('button', {
			type: 'button',
			'aria-pressed': String(!!pressed),
			'data-state': pressed ? 'on' : 'off',
			'data-slot': 'toggle',
			...rest,
			onClick: () => onPressedChange?.(!pressed),
		}, children),
	toggleVariants: () => '',
})
mock('@/components/ui/toggle-group', {
	// type="single": role=radiogroup, items role=radio + aria-checked; pressing the active
	// item turns it off, which Radix reports as onValueChange('').
	ToggleGroup: ({ type, value, onValueChange, variant, size, spacing, children, ...rest }) => {
		toggleGroup = { type, value, onValueChange }
		return h('div', { role: type === 'single' ? 'radiogroup' : 'toolbar', 'data-slot': 'toggle-group', ...rest }, children)
	},
	ToggleGroupItem: ({ value, variant, size, children, ...rest }) => {
		const group = toggleGroup
		const on = group.value === value
		return h('button', {
			type: 'button',
			role: 'radio',
			'aria-checked': String(on),
			'data-state': on ? 'on' : 'off',
			'data-slot': 'toggle-group-item',
			'data-value': value,
			...rest,
			onClick: () => group.onValueChange(on ? '' : value),
		}, children)
	},
})
mock('@/components/ui/select', {
	Select: (props) => {
		captured.select = props
		return h('div', { 'data-slot': 'select' }, props.children)
	},
	SelectTrigger: ({ children, size, ...rest }) =>
		h('button', { type: 'button', role: 'combobox', 'aria-expanded': 'false', 'data-slot': 'select-trigger', ...rest }, children),
	SelectValue: ({ children }) => h('span', { 'data-slot': 'select-value' }, children),
	SelectContent: ({ children }) => h('div', { 'data-slot': 'select-content' }, children),
	SelectItem: ({ children, value }) => h('div', { role: 'option', 'data-slot': 'select-item', 'data-value': value }, children),
})
clearCache()
const MountGrid = loadTs('src/app/account/media/asset-grid.tsx').AssetGrid
const MountToolbar = loadTs('src/app/account/media/grid-toolbar.tsx').GridToolbar
const MountBar = loadTs('src/app/account/media/selection-bar.tsx').SelectionBar
// Back to the real components for anything loaded later.
for (const name of RADIX_UI) mock(`@/components/ui/${name}`, loadTs(`src/components/ui/${name}.tsx`))
clearCache()

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
const classes = (node) => (node.attrs.class ?? '').split(/\s+/).filter(Boolean)
const hasClass = (node, cls) => classes(node).includes(cls)
const textOf = (node) =>
	(node.children ?? [])
		.map((c) => (c.text !== undefined ? c.text : textOf(c)))
		.join('')
const hiddenFromAt = (node) => {
	for (let n = node; n; n = n.parent) if (n.attrs?.['aria-hidden'] === 'true') return true
	return false
}

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
	if (node.tag === 'button' || node.tag === 'a' || node.attrs.role === 'checkbox' || node.attrs.role === 'switch') {
		const text = content(node).replace(/\s+/g, ' ').trim()
		if (text) return text
	}
	return (node.attrs.title ?? '').trim()
}

const interactive = (n) =>
	['button', 'select', 'input', 'a', 'textarea'].includes(n.tag) ||
	['checkbox', 'switch', 'button', 'combobox', 'radio'].includes(n.attrs.role)

/** Static checks that apply to any fragment of output. */
function staticChecks(html, label) {
	const root = parseHtml(html)
	// Radix's hidden form mirrors (aria-hidden, tabindex -1) are outside the accessibility tree.
	for (const el of findAllNodes(root, (n) => interactive(n) && !hiddenFromAt(n))) {
		assert(accessibleName(el, root), `${label}: <${el.tag}${el.attrs.role ? ` role=${el.attrs.role}` : ''}> has no accessible name`)
	}
	const ids = findAllNodes(root, (n) => n.attrs.id !== undefined).map((n) => n.attrs.id)
	eq(ids.length, new Set(ids).size, `${label}: duplicate ids ${ids}`)
	for (const el of findAllNodes(root, (n) => n.attrs['aria-labelledby'] !== undefined)) {
		for (const id of el.attrs['aria-labelledby'].split(/\s+/))
			assert(ids.includes(id), `${label}: aria-labelledby points at missing id ${id}`)
	}
	for (const el of findAllNodes(root, (n) => ['checkbox', 'switch', 'radio'].includes(n.attrs.role)))
		assert(['true', 'false', 'mixed'].includes(el.attrs['aria-checked']), `${label}: ${el.attrs.role} without aria-checked`)
	// A button inside a button (or a link) is invalid and breaks keyboard and screen readers.
	for (const el of findAllNodes(root, (n) => n.tag === 'button' || n.tag === 'a')) {
		const inner = findAllNodes(el, interactive)
		assert(inner.length === 0, `${label}: interactive element nested inside <${el.tag}>`)
	}
	return root
}

/* -------------------------------------------------------------------------- */
/* A hook-aware mini renderer, for handlers and effects                       */
/* -------------------------------------------------------------------------- */

const INTERNALS = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
const sameDeps = (a, b) =>
	a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
const MEMO = Symbol.for('react.memo')
const FORWARD = Symbol.for('react.forward_ref')
const FRAGMENT = Symbol.for('react.fragment')

function mount(Component, initialProps) {
	const instances = new Map()
	let pendingEffects = []
	let current

	function callComponent(type, props, instanceKey) {
		let instance = instances.get(instanceKey)
		if (!instance) instances.set(instanceKey, (instance = { hooks: [] }))
		let index = 0
		const slot = () => (instance.hooks[index] ??= {})
		const dispatcher = {
			useState(initial) {
				const s = slot()
				index++
				if (!('value' in s)) {
					s.value = typeof initial === 'function' ? initial() : initial
					s.set = (next) => {
						s.value = typeof next === 'function' ? next(s.value) : next
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
			useEffect(effect, deps) {
				const s = slot()
				index++
				if (!s.ran || !deps || !sameDeps(s.deps, deps)) {
					s.ran = true
					s.deps = deps
					pendingEffects.push({ s, effect })
				}
			},
			useId() {
				const s = slot()
				index++
				return (s.id ??= `:r${instanceKey.replace(/[^\w]/g, '')}${index}:`)
			},
		}
		dispatcher.useLayoutEffect = dispatcher.useEffect
		dispatcher.useInsertionEffect = dispatcher.useEffect
		const previous = INTERNALS.H
		INTERNALS.H = dispatcher
		try {
			return type.render ? type.render(props, props.ref ?? null) : type(props)
		} finally {
			INTERNALS.H = previous
		}
	}

	function expand(node, path) {
		if (node === null || node === undefined || typeof node === 'boolean') return []
		if (Array.isArray(node)) return node.flatMap((c, i) => expand(c, `${path}[${i}]`))
		if (typeof node === 'string' || typeof node === 'number') return [{ text: String(node) }]
		const { type, props } = node
		const here = `${path}/${node.key ?? ''}${typeof type === 'string' ? type : (type.displayName ?? type.name ?? 'c')}`
		if (type === FRAGMENT) return expand(props.children, here)
		if (typeof type === 'string') {
			const element = { type, props, children: expand(props.children, here) }
			if (props.ref && typeof props.ref === 'object') props.ref.current = { tagName: type, isFake: true }
			return [element]
		}
		if (type.$$typeof === MEMO) return expand({ ...node, type: type.type }, path)
		if (type.$$typeof === FORWARD || typeof type === 'function')
			return expand(callComponent(type, props, here), here)
		throw new Error(`mount: cannot expand ${String(type)}`)
	}

	function render(props) {
		pendingEffects = []
		current = expand(h(Component, props), '')
		for (const { s, effect } of pendingEffects) {
			if (typeof s.cleanup === 'function') s.cleanup()
			s.cleanup = effect()
		}
		pendingEffects = []
		return api
	}

	const flat = []
	const gather = (nodes, out) => {
		for (const n of nodes) {
			if (n.text !== undefined) continue
			out.push(n)
			gather(n.children, out)
		}
		return out
	}
	const nodeText = (n) => (n.text !== undefined ? n.text : n.children.map(nodeText).join(''))

	const api = {
		render,
		get nodes() {
			return gather(current, flat.splice(0))
		},
		find(predicate) {
			return api.nodes.find(predicate)
		},
		findAll(predicate) {
			return api.nodes.filter(predicate)
		},
		text: nodeText,
		unmount() {
			for (const inst of instances.values())
				for (const s of inst.hooks) if (typeof s?.cleanup === 'function') s.cleanup()
		},
	}
	return render(initialProps)
}

/** A DOM-ish event with spies. */
function ev(over = {}) {
	return {
		shiftKey: false,
		ctrlKey: false,
		metaKey: false,
		detail: 1,
		key: '',
		repeat: false,
		defaultPrevented: false,
		target: null,
		preventDefault() {
			this.defaultPrevented = true
		},
		...over,
	}
}

/** Fake IntersectionObserver with a registry, so a test can fire the sentinel. */
function installObserver() {
	const created = []
	globalThis.IntersectionObserver = class {
		constructor(callback, options) {
			this.callback = callback
			this.options = options
			this.targets = []
			this.disconnected = false
			created.push(this)
		}
		observe(node) {
			this.targets.push(node)
		}
		disconnect() {
			this.disconnected = true
		}
		fire(isIntersecting = true) {
			this.callback([{ isIntersecting }])
		}
	}
	return {
		created,
		live: () => created.filter((o) => !o.disconnected),
		uninstall: () => delete globalThis.IntersectionObserver,
	}
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const noop = () => {}
const BLUR = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4IA4AAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=='

function asset(i, over = {}) {
	return {
		id: `a${String(i).padStart(24, '0')}`,
		name: `Kitchen ${i}`,
		filename: `kitchen-${i}.jpg`,
		url: `https://abc123.public.blob.vercel-storage.com/workspaces/w/media/kitchen-${i}.jpg`,
		contentType: 'image/jpeg',
		format: 'jpg',
		bytes: 1_572_864,
		width: 1600,
		height: 1200,
		orientation: 'landscape',
		hasAlpha: false,
		animated: false,
		colors: [],
		brightness: 'mid',
		saturation: 'muted',
		blur: BLUR,
		folderId: null,
		folderPath: 'Clients/Acme',
		tags: [{ slug: 'kitchen', label: 'Kitchen', source: 'manual' }],
		caption: '',
		altText: '',
		textInImage: '',
		notes: '',
		kind: 'photo',
		tagging: { status: 'done' },
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...over,
	}
}
const many = (n, over) => Array.from({ length: n }, (_, i) => asset(i + 1, over))

const EMPTY_MARK = 'THE-EMPTY-NODE'
function gridProps(over = {}) {
	return {
		assets: [],
		density: 'comfortable',
		selectedIds: new Set(),
		selecting: false,
		activeId: null,
		loading: false,
		loadingMore: false,
		hasMore: false,
		error: null,
		canDrag: false,
		showFolderPath: false,
		showMatch: false,
		empty: h('p', { 'data-empty': '1' }, EMPTY_MARK),
		onLoadMore: noop,
		onRetry: noop,
		onOpen: noop,
		onToggleSelect: noop,
		...over,
	}
}
const renderGrid = (over) => renderToString(h(AssetGrid, gridProps(over)))
const cards = (root) => findAllNodes(root, (n) => n.attrs['data-slot'] === 'asset-card')
const skeletons = (root) => findAllNodes(root, (n) => n.attrs['data-slot'] === 'asset-card-skeleton')
const buttonsNamed = (root, name) =>
	findAllNodes(root, (n) => n.tag === 'button' && accessibleName(n, root) === name)
const loadMore = (root) => findAllNodes(root, (n) => n.attrs['data-slot'] === 'load-more')

function toolbarProps(over = {}) {
	return {
		total: 1284,
		truncated: false,
		sort: 'newest',
		hasText: false,
		density: 'comfortable',
		allSelected: false,
		someSelected: false,
		selecting: false,
		showDeep: false,
		deep: false,
		onToggleSelecting: noop,
		onSort: noop,
		onDensity: noop,
		onToggleAll: noop,
		onToggleDeep: noop,
		...over,
	}
}
const renderToolbar = (over) => renderToString(h(GridToolbar, toolbarProps(over)))

function barProps(over = {}) {
	return {
		count: 3,
		totalMatching: 40,
		allMatching: false,
		canSelectAllMatching: true,
		canWrite: true,
		canDelete: true,
		aiConfigured: true,
		onSelectAllMatching: noop,
		onClear: noop,
		onMove: noop,
		onTag: noop,
		onRetag: noop,
		onAcceptTags: noop,
		onDelete: noop,
		...over,
	}
}
const renderBar = (over) => renderToString(h(SelectionBar, barProps(over)))
const buttonNames = (root) =>
	findAllNodes(root, (n) => n.tag === 'button').map((b) => accessibleName(b, root))

/* ========================================================================== */
/* AssetGrid: loading, empty, error                                           */
/* ========================================================================== */

await check('grid: loading renders skeleton cards, not the empty node, no real cards', () => {
	for (const density of ['compact', 'comfortable', 'large']) {
		const html = renderGrid({ loading: true, density })
		const root = staticChecks(html, `loading ${density}`)
		assert(skeletons(root).length >= 4, `${density}: too few skeletons`)
		eq(cards(root).length, 0)
		assert(!html.includes(EMPTY_MARK), 'empty node shown while loading')
		assert(findAllNodes(root, (n) => n.attrs['aria-busy'] === 'true').length === 1, 'aria-busy missing')
		assert(
			skeletons(root).every((s) => s.attrs['aria-hidden'] === 'true'),
			'skeletons must be hidden from assistive tech',
		)
	}
})

await check('grid: loading wins over stale assets and a stale error', () => {
	const html = renderGrid({ loading: true, assets: many(3), error: 'boom', hasMore: true })
	const root = parseHtml(html)
	eq(cards(root).length, 0)
	assert(skeletons(root).length > 0)
	assert(!html.includes('boom') && !html.includes(EMPTY_MARK))
	eq(loadMore(root).length, 0)
})

await check('grid: the empty node renders only when empty, not loading, no error', () => {
	const html = renderGrid({})
	assert(html.includes(EMPTY_MARK), 'empty node missing')
	eq(cards(parseHtml(html)).length, 0)
	assert(!renderGrid({ assets: many(2) }).includes(EMPTY_MARK), 'empty node shown with assets')
	assert(!renderGrid({ loading: true }).includes(EMPTY_MARK), 'empty node shown while loading')
	assert(!renderGrid({ error: 'Network down' }).includes(EMPTY_MARK), 'empty node shown on error')
	assert(!renderGrid({ error: '' }).includes(EMPTY_MARK), 'empty-string error treated as no error')
})

await check('grid: error with no assets is an error panel with Retry, never the empty node', () => {
	const html = renderGrid({ error: 'Network down' })
	const root = staticChecks(html, 'error panel')
	assert(!html.includes(EMPTY_MARK))
	const panel = findAllNodes(root, (n) => n.attrs['data-slot'] === 'grid-error')
	eq(panel.length, 1)
	assert(textOf(panel[0]).includes('Network down'), 'error message not shown')
	eq(buttonsNamed(root, 'Retry').length, 1)
	eq(loadMore(root).length, 0)
	eq(cards(root).length, 0)
})

await check('grid: an empty-string error is still an error panel', () => {
	const root = parseHtml(renderGrid({ error: '' }))
	eq(findAllNodes(root, (n) => n.attrs['data-slot'] === 'grid-error').length, 1)
})

await check('grid: hostile error text is escaped, never markup', () => {
	const html = renderGrid({ error: '<img src=x onerror=alert(1)><script>alert(2)</script>' })
	assert(!html.includes('<script>') && !html.includes('<img src=x'), 'error text rendered as HTML')
	assert(html.includes('&lt;script&gt;'))
})

await check('grid: error with assets keeps the cards and shows the end-of-grid retry row, not Load more', () => {
	const html = renderGrid({ assets: many(3), error: 'Timed out', hasMore: true })
	const root = staticChecks(html, 'retry row')
	eq(cards(root).length, 3)
	const row = findAllNodes(root, (n) => n.attrs['data-slot'] === 'grid-load-error')
	eq(row.length, 1)
	assert(textOf(row[0]).includes('Could not load more.'))
	eq(buttonsNamed(root, 'Retry').length, 1)
	eq(loadMore(root).length, 0, 'Load more must be replaced by the retry row')
	assert(!html.includes('data-slot="grid-error"'), 'full error panel shown over assets')
	assert(!html.includes(EMPTY_MARK))
})

await check('grid: error with assets and hasMore false still offers the retry row', () => {
	const root = parseHtml(renderGrid({ assets: many(2), error: 'x', hasMore: false }))
	eq(findAllNodes(root, (n) => n.attrs['data-slot'] === 'grid-load-error').length, 1)
})

/* ========================================================================== */
/* AssetGrid: Load more                                                       */
/* ========================================================================== */

await check('grid: a visible Load more button follows the grid while hasMore', () => {
	const html = renderGrid({ assets: many(5), hasMore: true })
	const root = staticChecks(html, 'load more')
	const [btn] = loadMore(root)
	assert(btn, 'no Load more button')
	eq(btn.tag, 'button')
	eq(accessibleName(btn, root), 'Load more')
	assert(btn.attrs.type === 'button')
	assert(btn.attrs['aria-disabled'] === 'false' && btn.attrs.disabled === undefined, 'idle button must be enabled')
	// It comes after the grid in document order.
	assert(html.indexOf('data-slot="load-more"') > html.lastIndexOf('data-slot="asset-card"'))
	eq(loadMore(parseHtml(renderGrid({ assets: many(5), hasMore: false }))).length, 0)
})

await check('grid: Load more is never removed while loading more, it stays focusable and says busy', () => {
	const root = parseHtml(renderGrid({ assets: many(5), hasMore: true, loadingMore: true }))
	const [btn] = loadMore(root)
	assert(btn, 'Load more removed during load-more')
	eq(btn.attrs['aria-disabled'], 'true')
	assert(btn.attrs.disabled === undefined, 'a disabled attribute would drop keyboard focus')
	eq(accessibleName(btn, root), 'Load more')
})

await check('grid: Load more click calls onLoadMore, ignored while loadingMore', () => {
	let calls = 0
	const m = mount(MountGrid, gridProps({ assets: many(3), hasMore: true, onLoadMore: () => calls++ }))
	m.find((n) => n.props?.['data-slot'] === 'load-more').props.onClick()
	eq(calls, 1)
	m.render(gridProps({ assets: many(3), hasMore: true, loadingMore: true, onLoadMore: () => calls++ }))
	m.find((n) => n.props?.['data-slot'] === 'load-more').props.onClick()
	eq(calls, 1, 'clicked while in flight')
	m.unmount()
})

await check('grid: hasMore with zero assets and no error still renders the empty node, no Load more', () => {
	const html = renderGrid({ hasMore: true })
	assert(html.includes(EMPTY_MARK))
	eq(loadMore(parseHtml(html)).length, 0)
})

/* ========================================================================== */
/* AssetGrid: cards                                                           */
/* ========================================================================== */

for (const n of [0, 1, 500]) {
	await check(`grid: ${n} assets render ${n} cards, unique keys, no console errors`, () => {
		const started = Date.now()
		const html = renderGrid({ assets: many(n) })
		const root = parseHtml(html)
		eq(cards(root).length, n)
		if (n === 0) assert(html.includes(EMPTY_MARK))
		if (n === 500) {
			staticChecks(html, '500 cards')
			console.log(`      (500 cards rendered in ${Date.now() - started} ms)`)
		}
	})
}

await check('grid: duplicate and malformed assets collapse to one card per id, no key warning', () => {
	const a = many(2)
	const input = [a[0], a[1], { ...a[0], name: 'Dupe' }, null, { name: 'no id' }]
	const html = renderGrid({ assets: input })
	eq(cards(parseHtml(html)).length, 2)
	assert(!html.includes('Dupe'), 'first occurrence must win')
	eq(dedupeAssets(input).map((x) => x.id), [a[0].id, a[1].id])
})

await check('grid: column count follows density, 2 across on a phone at every density', () => {
	for (const density of ['compact', 'comfortable', 'large']) {
		const root = parseHtml(renderGrid({ assets: many(2), density }))
		const grid = findAllNodes(root, (n) => n.tag === 'ul' && hasClass(n, 'grid'))[0]
		assert(grid, 'no grid')
		assert(hasClass(grid, 'grid-cols-2'), `${density}: phones must be 2 across`)
		for (const cls of GRID_COLUMNS[density].split(' ')) assert(hasClass(grid, cls), `${density} missing ${cls}`)
	}
	assert(GRID_COLUMNS.compact.includes('2xl:grid-cols-8'), 'compact is about 8 across when wide')
	assert(/(^| )(\w+:)?grid-cols-5( |$)/.test(GRID_COLUMNS.comfortable), 'comfortable is about 5 across')
	assert(GRID_COLUMNS.large.includes('md:grid-cols-3') && !/grid-cols-[4-9]/.test(GRID_COLUMNS.large), 'large is 3 across')
	const rank = (d) => Math.max(...GRID_COLUMNS[d].match(/grid-cols-(\d+)/g).map((s) => +s.split('-')[2]))
	assert(rank('compact') > rank('comfortable') && rank('comfortable') > rank('large'), 'density must order the columns')
})

await check('grid: card has fixed aspect-square thumbnail, object-cover, fill, sizes, no alt text duplication', () => {
	for (const density of ['compact', 'comfortable', 'large']) {
		const root = parseHtml(renderGrid({ assets: many(1), density }))
		const img = findAllNodes(root, (n) => n.tag === 'img')[0]
		assert(img, 'no image')
		assert(hasClass(img, 'object-cover'))
		eq(img.attrs['data-fill'], '1', 'fill')
		assert(/vw/.test(img.attrs.sizes ?? ''), `${density}: sizes missing`)
		eq(img.attrs.alt, '', 'decorative: the button carries the name')
		let box = img.parent
		while (box && !hasClass(box, 'aspect-square')) box = box.parent
		assert(box, `${density}: thumbnail is not aspect-square`)
	}
})

await check('grid: blur placeholder only when blur exists and is an image data URL', () => {
	const img = (over) => findAllNodes(parseHtml(renderGrid({ assets: [asset(1, over)] })), (n) => n.tag === 'img')[0]
	const withBlur = img({})
	eq(withBlur.attrs['data-placeholder'], 'blur')
	eq(withBlur.attrs['data-blur'], BLUR)
	for (const blur of [null, '', 'javascript:alert(1)', 'https://evil.example/x.png', 'data:text/html;base64,AAAA', undefined]) {
		const without = img({ blur })
		assert(without, 'card without blur must still render its image')
		eq(without.attrs['data-placeholder'], undefined, `placeholder for blur=${blur}`)
		eq(without.attrs['data-blur'], undefined)
	}
})

await check('grid: gif is unoptimized, other formats are optimized', () => {
	const img = (over) => findAllNodes(parseHtml(renderGrid({ assets: [asset(1, over)] })), (n) => n.tag === 'img')[0]
	eq(img({ format: 'gif', contentType: 'image/gif' }).attrs['data-unoptimized'], '1')
	eq(img({ format: 'gif', contentType: 'image/gif', animated: true }).attrs['data-unoptimized'], '1')
	for (const [format, contentType] of [['jpg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp'], ['avif', 'image/avif']])
		eq(img({ format, contentType }).attrs['data-unoptimized'], undefined, format)
})

await check('grid: an unusable url renders a placeholder, not a crashing image', () => {
	for (const url of ['', null, undefined, 'javascript:alert(1)', '//evil.example/x.png', 'data:image/png;base64,AA', 42]) {
		const root = parseHtml(renderGrid({ assets: [asset(1, { url })] }))
		eq(cards(root).length, 1, `url=${String(url)}`)
		eq(findAllNodes(root, (n) => n.tag === 'img').length, 0, `url=${String(url)} rendered an <img>`)
	}
	const rooted = parseHtml(renderGrid({ assets: [asset(1, { url: '/uploads/a.png' })] }))
	eq(findAllNodes(rooted, (n) => n.tag === 'img').length, 1, 'same-origin path is fine')
})

await check('grid: meta shows dimensions and size from format.ts', () => {
	const root = parseHtml(renderGrid({ assets: [asset(1, { width: 1600, height: 1200, bytes: 1_572_864 })] }))
	const text = textOf(cards(root)[0])
	assert(text.includes('1,600 × 1,200'), 'dimensions')
	assert(text.includes('1.5 MB'), 'size')
	assert(text.includes('Kitchen 1'))
})

await check('grid: hostile numbers and names do not print NaN, undefined or null', () => {
	const bad = asset(1, { width: NaN, height: 0, bytes: -5, name: '   ', filename: '' })
	const html = renderGrid({ assets: [bad, asset(2, { width: Infinity, bytes: NaN, name: 'x'.repeat(5000) })] })
	const root = staticChecks(html, 'hostile numbers')
	eq(cards(root).length, 2)
	for (const bit of ['NaN', 'undefined', 'null', 'Infinity']) assert(!html.includes(bit), `printed ${bit}`)
	assert(buttonNames(root).includes('Untitled image'), 'empty name needs a fallback')
})

await check('grid: asset text is escaped (names, tags, folder paths, match fields)', () => {
	const evil = '<script>alert(1)</script>'
	const html = renderGrid({
		assets: [
			asset(1, {
				name: evil,
				folderPath: evil,
				tags: [{ slug: 'x', label: evil, source: 'manual' }],
				match: { score: 1, fields: [evil, 7, '', null, 'tag'] },
			}),
		],
		showFolderPath: true,
		showMatch: true,
	})
	assert(!html.includes('<script>'), 'unescaped script')
	const root = parseHtml(html)
	const line = findAllNodes(root, (n) => n.attrs['data-slot'] === 'match-line')[0]
	assert(line, 'match line')
	eq(textOf(line), `Matched: ${evil}, tag`, 'non-string and blank fields are dropped')
})

await check('grid: aria-label carries name and dimensions; every card button is named', () => {
	const html = renderGrid({ assets: many(3) })
	const root = staticChecks(html, 'cards')
	const mains = findAllNodes(root, (n) => n.tag === 'button' && n.attrs.role === undefined)
	eq(mains.length, 3)
	assert(mains[0].attrs['aria-label'].startsWith('Kitchen 1, 1,600 × 1,200'), mains[0].attrs['aria-label'])
	eq(findAllNodes(root, (n) => n.tag === 'button' && n.attrs.type !== 'button').length, 0, 'buttons must be type=button')
})

await check('grid: selected card has ring-2 ring-brand and a checked checkbox; others do not', () => {
	const a = many(3)
	const html = renderGrid({ assets: a, selectedIds: new Set([a[1].id]) })
	const root = staticChecks(html, 'selected')
	const [c0, c1, c2] = cards(root)
	assert(hasClass(c1, 'ring-2') && hasClass(c1, 'ring-brand'))
	eq(c1.attrs['data-selected'], 'true')
	for (const c of [c0, c2]) {
		assert(!hasClass(c, 'ring-2') && !hasClass(c, 'ring-brand'))
		eq(c.attrs['data-selected'], 'false')
	}
	const checked = findAllNodes(root, (n) => n.attrs.role === 'checkbox').map((n) => n.attrs['aria-checked'])
	eq(checked, ['false', 'true', 'false'])
	assert(!html.slice(html.indexOf('data-selected="false"')).startsWith('ring-brand'))
})

await check('grid: the active card is subtly highlighted and marked aria-current, only that card', () => {
	const a = many(3)
	const root = parseHtml(renderGrid({ assets: a, activeId: a[2].id }))
	const current = findAllNodes(root, (n) => n.attrs['aria-current'] === 'true')
	eq(current.length, 1)
	eq(cards(root).map((c) => c.attrs['data-active']), ['false', 'false', 'true'])
	assert(!hasClass(cards(root)[2], 'ring-brand'), 'active must be subtler than selected')
	eq(findAllNodes(parseHtml(renderGrid({ assets: a, activeId: 'nope' })), (n) => n.attrs['aria-current']).length, 0)
})

await check('grid: tagging badge and shimmer only for pending and running, shimmer honours reduced motion', () => {
	for (const status of ['pending', 'running']) {
		const html = renderGrid({ assets: [asset(1, { tagging: { status } })] })
		const root = staticChecks(html, status)
		eq(findAllNodes(root, (n) => n.attrs['data-slot'] === 'tagging-badge').length, 1, status)
		assert(html.includes('motion-safe:animate-pulse'), 'shimmer must be motion-safe only')
		assert(!/(^|[ "])animate-pulse/.test(html.replace(/motion-safe:animate-pulse/g, '')), 'unconditional animation')
		assert(buttonNames(root)[0].includes('tagging'), 'status must reach screen readers')
	}
	for (const status of ['done', 'failed', 'skipped']) {
		const html = renderGrid({ assets: [asset(1, { tagging: { status } })] })
		eq(findAllNodes(parseHtml(html), (n) => n.attrs['data-slot'] === 'tagging-badge').length, 0, status)
		assert(!html.includes('motion-safe:animate-pulse'), `${status} must not shimmer`)
	}
	assert(textOf(findAllNodes(parseHtml(renderGrid({ assets: [asset(1, { tagging: { status: 'running' } })] })), (n) => n.attrs['data-slot'] === 'tagging-badge')[0]).includes('Tagging'))
})

await check('grid: a missing tagging object does not crash', () => {
	const html = renderGrid({ assets: [asset(1, { tagging: undefined, tags: undefined })] })
	eq(cards(parseHtml(html)).length, 1)
})

await check('grid: animated and transparent icons appear only when true, with a text equivalent', () => {
	const root = (over) => parseHtml(renderGrid({ assets: [asset(1, over)] }))
	const slots = (r, s) => findAllNodes(r, (n) => n.attrs['data-slot'] === s).length
	eq([slots(root({}), 'animated-icon'), slots(root({}), 'transparent-icon')], [0, 0])
	eq([slots(root({ animated: true }), 'animated-icon'), slots(root({ animated: true }), 'transparent-icon')], [1, 0])
	eq([slots(root({ hasAlpha: true }), 'animated-icon'), slots(root({ hasAlpha: true }), 'transparent-icon')], [0, 1])
	const both = root({ animated: true, hasAlpha: true })
	const label = findAllNodes(both, (n) => n.tag === 'button' && n.attrs.role === undefined)[0].attrs['aria-label']
	assert(label.includes('animated') && label.includes('transparent'), label)
})

await check('grid: folder path line only when showFolderPath, No folder at the root', () => {
	const on = parseHtml(renderGrid({ assets: [asset(1), asset(2, { folderPath: '' })], showFolderPath: true }))
	const lines = findAllNodes(on, (n) => n.attrs['data-slot'] === 'folder-path').map(textOf)
	eq(lines, ['Clients/Acme', 'No folder'])
	const off = renderGrid({ assets: [asset(1)], showFolderPath: false })
	assert(!off.includes('folder-path') && !off.includes('Clients/Acme'))
})

await check('grid: matched line only when showMatch and the asset has match fields', () => {
	const a = [asset(1, { match: { score: 3, fields: ['tag', 'caption'] } }), asset(2), asset(3, { match: { score: 1, fields: [] } })]
	const on = parseHtml(renderGrid({ assets: a, showMatch: true }))
	eq(findAllNodes(on, (n) => n.attrs['data-slot'] === 'match-line').map(textOf), ['Matched: tag, caption'])
	const off = renderGrid({ assets: a, showMatch: false })
	assert(!off.includes('Matched'), 'showMatch=false must hide it even when match exists')
})

await check('grid: checkbox visibility - hover/focus, always on hover:none, always while selecting or selected', () => {
	const box = (over, sel) => {
		const a = many(2)
		const root = parseHtml(renderGrid({ assets: a, ...over, selectedIds: sel ?? new Set() }))
		return findAllNodes(root, (n) => n.attrs.role === 'checkbox').map((n) => n)
	}
	const idle = box({})[0]
	assert(hasClass(idle, 'opacity-0'), 'hidden at rest')
	assert(hasClass(idle, 'group-hover/card:opacity-100'), 'visible on hover')
	assert(hasClass(idle, 'group-focus-within/card:opacity-100'), 'visible on focus')
	assert(hasClass(idle, '[@media(hover:none)]:opacity-100'), 'always visible where there is no hover')
	assert(!hasClass(idle, 'opacity-100'))
	for (const c of box({ selecting: true })) assert(hasClass(c, 'opacity-100') && !hasClass(c, 'opacity-0'), 'selecting')
	const some = box({}, new Set([asset(1).id]))
	for (const c of some) assert(hasClass(c, 'opacity-100') && !hasClass(c, 'opacity-0'), 'any selected shows every checkbox')
	eq(idle.attrs.tabindex, '-1', 'one tab stop per card')
})

await check('grid: draggable only when canDrag; the checkbox is never a drag source', () => {
	const on = parseHtml(renderGrid({ assets: many(2), canDrag: true }))
	for (const c of cards(on)) eq(c.attrs.draggable, 'true')
	const off = parseHtml(renderGrid({ assets: many(2), canDrag: false }))
	for (const c of cards(off)) eq(c.attrs.draggable, undefined)
	const boxes = findAllNodes(on, (n) => n.attrs.role === 'checkbox')
	eq(boxes.length, 2)
	for (const cb of boxes) eq(cb.attrs.draggable, 'false')
	// beginAssetDrag recognises the checkbox by this marker, so it must be on the checkbox itself.
	for (const cb of boxes) eq(cb.attrs['data-card-checkbox'], '', 'checkbox marker')
	eq(boxes.map((cb) => cb.attrs['aria-label']), ['Select Kitchen 1', 'Select Kitchen 2'])
	for (const img of findAllNodes(on, (n) => n.tag === 'img')) eq(img.attrs.draggable, 'false')
})

await check('grid: the sentinel exists only while auto-load is possible', () => {
	const sentinel = (over) => findAllNodes(parseHtml(renderGrid({ assets: many(2), ...over })), (n) => n.tag === 'div' && n.attrs['aria-hidden'] === 'true' && hasClass(n, 'h-px')).length
	eq(sentinel({ hasMore: true }), 1)
	eq(sentinel({ hasMore: false }), 0)
	eq(sentinel({ hasMore: true, loadingMore: true }), 0)
	eq(sentinel({ hasMore: true, error: 'x' }), 0)
})

await check('grid: server rendering is stable (same input, same output) and output has no key or prop warnings', () => {
	const props = { assets: many(20), selectedIds: new Set([asset(3).id]), activeId: asset(4).id, showFolderPath: true, showMatch: true, hasMore: true, canDrag: true }
	eq(renderGrid(props), renderGrid(props))
})

/* ========================================================================== */
/* Card behaviour (pure helpers and real handlers)                            */
/* ========================================================================== */

await check('card: click intent - plain opens, shift ranges, ctrl or meta toggles, keyboard activation always opens', () => {
	const intent = (o) => card.cardClickIntent({ shiftKey: false, ctrlKey: false, metaKey: false, detail: 1, ...o })
	eq(intent({}), 'open')
	eq(intent({ shiftKey: true }), 'range')
	eq(intent({ ctrlKey: true }), 'toggle')
	eq(intent({ metaKey: true }), 'toggle')
	eq(intent({ shiftKey: true, ctrlKey: true }), 'range')
	eq(intent({ detail: 0 }), 'open')
	eq(intent({ detail: 0, shiftKey: true }), 'open', 'Shift+Enter is not a range select')
})

await check('card: drag ids - a selected card drags the whole selection, an unselected one only itself', () => {
	const sel = new Set(['a', 'b', 'c'])
	eq(card.dragIdsFor('b', sel), ['a', 'b', 'c'])
	eq(card.dragIdsFor('z', sel), ['z'])
	eq(card.dragIdsFor('z', new Set()), ['z'])
})

function dragFake() {
	const data = {}
	return { data, setData: (t, v) => (data[t] = v), effectAllowed: 'uninitialized' }
}

await check('card: beginAssetDrag sets DRAG_MIME as a JSON id array and effectAllowed move', () => {
	const dt = dragFake()
	let prevented = false
	const ids = card.beginAssetDrag({ id: 'b', selectedIds: new Set(['a', 'b']), origin: null, dataTransfer: dt, preventDefault: () => (prevented = true) })
	eq(ids, ['a', 'b'])
	eq(JSON.parse(dt.data[DRAG_MIME]), ['a', 'b'])
	eq(DRAG_MIME, 'application/x-media-ids')
	eq(dt.effectAllowed, 'move')
	assert(!prevented)
	const dt2 = dragFake()
	card.beginAssetDrag({ id: 'q', selectedIds: new Set(['a', 'b']), origin: { closest: () => null }, dataTransfer: dt2, preventDefault: noop })
	eq(JSON.parse(dt2.data[DRAG_MIME]), ['q'])
})

await check('card: a drag that began on the checkbox is cancelled and carries nothing', () => {
	const dt = dragFake()
	let prevented = false
	const origin = { closest: (sel) => (sel === '[data-card-checkbox]' ? {} : null) }
	const ids = card.beginAssetDrag({ id: 'a', selectedIds: new Set(['a']), origin, dataTransfer: dt, preventDefault: () => (prevented = true) })
	eq(ids, null)
	assert(prevented)
	eq(Object.keys(dt.data).length, 0)
	// No dataTransfer at all (a synthetic event) must not throw either.
	let p2 = false
	eq(card.beginAssetDrag({ id: 'a', selectedIds: new Set(), origin: null, dataTransfer: null, preventDefault: () => (p2 = true) }), null)
	assert(p2)
})

const descendants = (node) => (node.children ?? []).flatMap((c) => (c.text !== undefined ? [] : [c, ...descendants(c)]))
const handlersFor = (m, id) => {
	const li = m
		.findAll((n) => n.type === 'li' && n.props['data-slot'] === 'asset-card')
		.find((n) => descendants(n).some((c) => c.props?.['aria-label']?.startsWith?.(`Kitchen ${id},`)))
	assert(li, `card ${id} not found`)
	const inside = descendants(li)
	return {
		li,
		main: inside.find((c) => c.type === 'button' && c.props.role === undefined),
		checkbox: inside.find((c) => c.props?.role === 'checkbox'),
	}
}

await check('card handlers: click opens, shift-click ranges, ctrl-click toggles, checkbox toggles with range on shift', () => {
	const opened = []
	const toggled = []
	const a = many(3)
	const m = mount(MountGrid, gridProps({ assets: a, onOpen: (id) => opened.push(id), onToggleSelect: (id, o) => toggled.push([id, o]) }))
	const { main, checkbox } = handlersFor(m, 2)
	main.props.onClick(ev())
	main.props.onClick(ev({ shiftKey: true }))
	main.props.onClick(ev({ ctrlKey: true }))
	main.props.onClick(ev({ detail: 0 }))
	checkbox.props.onClick(ev())
	checkbox.props.onClick(ev({ shiftKey: true }))
	eq(opened, [a[1].id, a[1].id])
	eq(toggled, [
		[a[1].id, { range: true }],
		[a[1].id, { range: false }],
		[a[1].id, { range: false }],
		[a[1].id, { range: true }],
	])
	m.unmount()
})

await check('card handlers: Space toggles (and cancels the native click), Enter opens, repeats and keyup are swallowed', () => {
	const opened = []
	const toggled = []
	const a = many(1)
	const m = mount(MountGrid, gridProps({ assets: a, onOpen: (id) => opened.push(id), onToggleSelect: (id, o) => toggled.push([id, o]) }))
	const { main } = handlersFor(m, 1)
	const space = ev({ key: ' ' })
	main.props.onKeyDown(space)
	assert(space.defaultPrevented, 'Space keydown must be cancelled or the browser clicks (= opens)')
	const repeat = ev({ key: ' ', repeat: true })
	main.props.onKeyDown(repeat)
	assert(repeat.defaultPrevented)
	const shiftSpace = ev({ key: ' ', shiftKey: true })
	main.props.onKeyDown(shiftSpace)
	const up = ev({ key: ' ' })
	main.props.onKeyUp(up)
	assert(up.defaultPrevented, 'Firefox clicks on Space keyup')
	const enter = ev({ key: 'Enter' })
	main.props.onKeyDown(enter)
	assert(!enter.defaultPrevented, 'Enter must be left to the native click that opens')
	const tab = ev({ key: 'Tab' })
	main.props.onKeyDown(tab)
	main.props.onKeyUp(tab)
	assert(!tab.defaultPrevented)
	eq(toggled, [[a[0].id, { range: false }], [a[0].id, { range: true }]], 'toggle once per press, none for the repeat')
	eq(opened, [])
	m.unmount()
})

await check('card handlers: dragstart on a selected card carries every selected id, on another card only its own', () => {
	const a = many(4)
	const selected = new Set([a[0].id, a[2].id])
	const m = mount(MountGrid, gridProps({ assets: a, selectedIds: selected, canDrag: true }))
	const dragFrom = (n, origin) => {
		const dt = dragFake()
		let prevented = false
		handlersFor(m, n).li.props.onMouseDown({ target: origin })
		handlersFor(m, n).li.props.onDragStart({ dataTransfer: dt, preventDefault: () => (prevented = true) })
		return { dt, prevented }
	}
	const inSel = dragFrom(3, { closest: () => null })
	eq(JSON.parse(inSel.dt.data[DRAG_MIME]).sort(), [a[0].id, a[2].id].sort())
	eq(inSel.dt.effectAllowed, 'move')
	const outSel = dragFrom(2, { closest: () => null })
	eq(JSON.parse(outSel.dt.data[DRAG_MIME]), [a[1].id])
	const fromBox = dragFrom(1, { closest: (s) => (s === '[data-card-checkbox]' ? {} : null) })
	assert(fromBox.prevented, 'drag from the checkbox must be cancelled')
	eq(Object.keys(fromBox.dt.data).length, 0)
	m.unmount()
})

await check('card handlers: no drag handlers at all without canDrag', () => {
	const m = mount(MountGrid, gridProps({ assets: many(1), canDrag: false }))
	const { li } = handlersFor(m, 1)
	eq([li.props.onDragStart, li.props.onMouseDown, li.props.draggable], [undefined, undefined, undefined])
	m.unmount()
})

await check('card handlers: callbacks read the latest props (stable card props, fresh behaviour)', () => {
	const first = []
	const second = []
	const a = many(1)
	const m = mount(MountGrid, gridProps({ assets: a, onOpen: (id) => first.push(id) }))
	const before = handlersFor(m, 1).main
	m.render(gridProps({ assets: a, onOpen: (id) => second.push(id) }))
	before.props.onClick(ev())
	handlersFor(m, 1).main.props.onClick(ev())
	eq([first.length, second.length], [0, 2], 'a stale onOpen was called')
	m.unmount()
})

/* ========================================================================== */
/* Sentinel auto-load                                                         */
/* ========================================================================== */

await check('sentinel: observes only when hasMore, not loading, not loadingMore, no error', () => {
	const obs = installObserver()
	try {
		const live = (over) => {
			obs.created.length = 0
			const m = mount(MountGrid, gridProps({ assets: many(3), ...over }))
			const n = obs.live().length
			m.unmount()
			return n
		}
		eq(live({ hasMore: true }), 1)
		eq(live({ hasMore: false }), 0)
		eq(live({ hasMore: true, loadingMore: true }), 0)
		eq(live({ hasMore: true, loading: true }), 0)
		eq(live({ hasMore: true, error: 'x' }), 0)
		eq(live({ hasMore: true, error: '' }), 0)
		eq(live({ hasMore: true, assets: [] }), 0)
	} finally {
		obs.uninstall()
	}
})

await check('sentinel: firing again and again loads once; a non-intersecting entry loads nothing', () => {
	const obs = installObserver()
	try {
		let calls = 0
		const m = mount(MountGrid, gridProps({ assets: many(3), hasMore: true, onLoadMore: () => calls++ }))
		const [o] = obs.live()
		o.fire(false)
		eq(calls, 0)
		for (let i = 0; i < 10; i++) o.fire(true)
		eq(calls, 1, 'repeat sightings must not repeat the request')
		m.unmount()
	} finally {
		obs.uninstall()
	}
})

await check('sentinel: asks again after new cards arrive, and never loops when a page adds nothing', () => {
	const obs = installObserver()
	try {
		let calls = 0
		const onLoadMore = () => calls++
		const m = mount(MountGrid, gridProps({ assets: many(3), hasMore: true, onLoadMore }))
		obs.live()[0].fire()
		eq(calls, 1)
		// In flight, then the page lands with no new unique rows (offset paging can do that).
		m.render(gridProps({ assets: many(3), hasMore: true, loadingMore: true, onLoadMore }))
		eq(obs.live().length, 0, 'observer must be released while loading')
		m.render(gridProps({ assets: many(3), hasMore: true, onLoadMore }))
		obs.live()[0].fire()
		eq(calls, 1, 'a page that added nothing must not trigger another request')
		// Now a page that does add rows.
		m.render(gridProps({ assets: many(6), hasMore: true, onLoadMore }))
		obs.live()[0].fire()
		eq(calls, 2)
		m.unmount()
		eq(obs.live().length, 0, 'unmount disconnects')
	} finally {
		obs.uninstall()
	}
})

await check('sentinel: a new first page of the same size is not mistaken for one already requested', () => {
	const obs = installObserver()
	try {
		let calls = 0
		const onLoadMore = () => calls++
		const a = many(3)
		const m = mount(MountGrid, gridProps({ assets: a, hasMore: true, onLoadMore }))
		obs.live()[0].fire()
		eq(calls, 1)
		m.render(gridProps({ assets: [], loading: true, onLoadMore }))
		m.render(gridProps({ assets: a, hasMore: true, onLoadMore }))
		obs.live()[0].fire()
		eq(calls, 2, 'a fresh result must be able to auto-load')
		m.unmount()
	} finally {
		obs.uninstall()
	}
})

await check('sentinel: the button and the sentinel do not double-request', () => {
	const obs = installObserver()
	try {
		let calls = 0
		const m = mount(MountGrid, gridProps({ assets: many(3), hasMore: true, onLoadMore: () => calls++ }))
		m.find((n) => n.props?.['data-slot'] === 'load-more').props.onClick()
		obs.live()[0].fire()
		eq(calls, 1, 'a click followed by a sighting before the parent flips loadingMore')
		m.unmount()
	} finally {
		obs.uninstall()
	}
})

await check('sentinel: no IntersectionObserver (old browser, SSR) is fine and the button still works', () => {
	assert(typeof globalThis.IntersectionObserver === 'undefined')
	let calls = 0
	const m = mount(MountGrid, gridProps({ assets: many(3), hasMore: true, onLoadMore: () => calls++ }))
	m.find((n) => n.props?.['data-slot'] === 'load-more').props.onClick()
	eq(calls, 1)
	m.unmount()
})

await check('sentinel: a stale sighting after the parent set an error does not call onLoadMore', () => {
	const obs = installObserver()
	try {
		let calls = 0
		const m = mount(MountGrid, gridProps({ assets: many(3), hasMore: true, onLoadMore: () => calls++ }))
		const [o] = obs.live()
		// The error arrives; the old observer is disconnected by the effect cleanup, but a
		// callback already queued by the browser can still run.
		m.render(gridProps({ assets: many(3), hasMore: true, error: 'x', onLoadMore: () => calls++ }))
		o.fire()
		eq(calls, 0)
		m.unmount()
	} finally {
		obs.uninstall()
	}
})

await check('error panel: Retry calls onRetry; so does the end-of-grid Retry', () => {
	let retries = 0
	const panel = mount(MountGrid, gridProps({ error: 'x', onRetry: () => retries++ }))
	panel.find((n) => n.type === 'button' && panel.text(n) === 'Retry').props.onClick()
	const row = mount(MountGrid, gridProps({ assets: many(2), error: 'x', onRetry: () => retries++ }))
	row.find((n) => n.type === 'button' && row.text(n) === 'Retry').props.onClick()
	eq(retries, 2)
})

/* ========================================================================== */
/* GridToolbar                                                                */
/* ========================================================================== */

/** The sort menu's items as rendered (Radix portals them, so they are read from a mounted copy). */
function sortItems(over) {
	const m = mount(MountToolbar, toolbarProps(over))
	const items = m
		.findAll((n) => n.props?.['data-slot'] === 'select-item')
		.map((n) => ({ value: n.props['data-value'], label: m.text(n) }))
	const value = captured.select.value
	m.unmount()
	return { items, value }
}

await check('toolbar: relevance is offered only with hasText', () => {
	const options = (over) => {
		staticChecks(renderToolbar(over), 'toolbar')
		return sortItems(over).items.map((o) => o.value)
	}
	const without = options({ hasText: false })
	assert(!without.includes('relevance'))
	eq(without, MEDIA_SORTS.filter((s) => s !== 'relevance'))
	eq(options({ hasText: true }), [...MEDIA_SORTS])
	eq(sortOptions(false).includes('relevance'), false)
	eq(sortOptions(true).includes('relevance'), true)
})

await check('toolbar: the select shows the sort in effect; relevance without text falls back to newest', () => {
	// The value handed to the select, and the label its trigger shows in the server render.
	const selected = (over) => {
		const root = parseHtml(renderToolbar(over))
		const triggers = findAllNodes(root, (n) => n.attrs.role === 'combobox')
		eq(triggers.length, 1, 'one sort control')
		const shown = findAllNodes(triggers[0], (n) => n.attrs['data-slot'] === 'select-value').map(textOf)
		const { value } = sortItems(over)
		eq(shown, [SORT_LABELS[value]], 'the trigger shows the sort in effect before hydration')
		return [value]
	}
	eq(selected({ sort: 'name', hasText: false }), ['name'])
	eq(selected({ sort: 'relevance', hasText: true }), ['relevance'])
	eq(selected({ sort: 'relevance', hasText: false }), ['newest'])
	for (const sort of MEDIA_SORTS) assert(selected({ sort, hasText: true }).length === 1, sort)
})

await check('toolbar: every sort option has a human label and the select is labelled', () => {
	const root = staticChecks(renderToolbar({ hasText: true }), 'toolbar sort')
	const { items } = sortItems({ hasText: true })
	eq(items.length, MEDIA_SORTS.length)
	for (const o of items) {
		assert(o.label.trim() && o.label !== o.value, `option ${o.value} has no label`)
	}
	const select = findAllNodes(root, (n) => n.attrs.role === 'combobox' && !hiddenFromAt(n))[0]
	assert(select, 'no sort control')
	assert(accessibleName(select, root).length > 0)
})

await check('toolbar: count formatting - plural, singular, zero, thousands, truncated', () => {
	const count = (over) => {
		const root = parseHtml(renderToolbar(over))
		const live = findAllNodes(root, (n) => n.attrs['aria-live'] === 'polite')
		eq(live.length, 1, 'exactly one polite live region')
		return textOf(live[0])
	}
	eq(count({ total: 1284 }), '1,284 images')
	eq(count({ total: 1 }), '1 image')
	eq(count({ total: 0 }), '0 images')
	eq(count({ total: 1000, truncated: true }), '1,000+ images')
	eq(count({ total: 5000, truncated: true }), '5,000+ images')
	eq(count({ total: 1_234_567 }), '1,234,567 images')
	eq(formatTotal(NaN, false), '0 images')
	eq(formatTotal(-4, false), '0 images')
	eq(formatTotal(Infinity, false), '0 images')
	eq(formatTotal(12.9, false), '12 images')
})

await check('toolbar: the live region is polite, not assertive, and the only live region', () => {
	const html = renderToolbar({ showDeep: true })
	assert(!html.includes('aria-live="assertive"') && !html.includes('role="alert"'))
	eq((html.match(/aria-live=/g) ?? []).length, 1)
})

await check('toolbar: Select toggle reflects selecting in aria-pressed', () => {
	for (const selecting of [false, true]) {
		const root = staticChecks(renderToolbar({ selecting }), 'select toggle')
		const [btn] = buttonsNamed(root, 'Select')
		assert(btn, 'no Select button')
		eq(btn.attrs['aria-pressed'], String(selecting))
	}
})

await check('toolbar: include subfolders switch only with showDeep and mirrors deep', () => {
	const sw = (over) => findAllNodes(parseHtml(renderToolbar(over)), (n) => n.attrs.role === 'switch')
	eq(sw({ showDeep: false, deep: true }).length, 0)
	const [on] = sw({ showDeep: true, deep: true })
	const [off] = sw({ showDeep: true, deep: false })
	eq(on.attrs['aria-checked'], 'true')
	eq(off.attrs['aria-checked'], 'false')
	eq(accessibleName(on, parseHtml(renderToolbar({ showDeep: true }))), 'Include subfolders')
	assert(!renderToolbar({ showDeep: false }).includes('Include subfolders'))
	staticChecks(renderToolbar({ showDeep: true, deep: true }), 'deep switch')
})

await check('toolbar: select-all is a tri-state checkbox (none, some, all)', () => {
	const state = (over) => {
		const root = staticChecks(renderToolbar(over), 'select-all')
		const cb = findAllNodes(root, (n) => n.attrs.role === 'checkbox')
		eq(cb.length, 1)
		return cb[0].attrs['aria-checked']
	}
	eq(state({}), 'false')
	eq(state({ someSelected: true }), 'mixed')
	eq(state({ allSelected: true, someSelected: true }), 'true')
	eq(state({ allSelected: true, someSelected: false }), 'true')
})

await check('toolbar: density group marks exactly the current density checked, with names', () => {
	for (const density of ['compact', 'comfortable', 'large']) {
		const root = staticChecks(renderToolbar({ density }), `density ${density}`)
		// A single-choice group: radiogroup of radios (Radix ToggleGroup type="single").
		const group = findAllNodes(root, (n) => n.attrs.role === 'radiogroup')[0]
		assert(group && group.attrs['aria-label'], 'group needs a label')
		const buttons = findAllNodes(group, (n) => n.tag === 'button')
		assert(buttons.every((b) => b.attrs.role === 'radio'), 'items are radios')
		eq(buttons.map((b) => accessibleName(b, root)), ['Compact', 'Comfortable', 'Large'])
		eq(buttons.filter((b) => b.attrs['aria-checked'] === 'true').map((b) => accessibleName(b, root)), [density[0].toUpperCase() + density.slice(1)])
	}
})

await check('toolbar: two toolbars on one page never share an id', () => {
	const html = renderToString(h('div', null, h(GridToolbar, toolbarProps({ showDeep: true })), h(GridToolbar, toolbarProps({ showDeep: true }))))
	staticChecks(html, 'two toolbars')
})

await check('toolbar handlers: every control calls the right callback; an invalid sort value is ignored', () => {
	const log = []
	const m = mount(MountToolbar, toolbarProps({
		showDeep: true,
		hasText: true,
		onToggleSelecting: () => log.push('selecting'),
		onSort: (s) => log.push(`sort:${s}`),
		onDensity: (d) => log.push(`density:${d}`),
		onToggleAll: () => log.push('all'),
		onToggleDeep: () => log.push('deep'),
	}))
	m.find((n) => n.type === 'button' && m.text(n).trim() === 'Select').props.onClick()
	m.find((n) => n.props?.role === 'checkbox').props.onClick()
	m.find((n) => n.props?.role === 'switch').props.onClick()
	const select = captured.select
	select.onValueChange('oldest')
	select.onValueChange('relevance')
	select.onValueChange('$where')
	select.onValueChange('')
	// Density is 'comfortable': pressing it again is Radix turning it off (''), which is ignored
	// so there is always one size; the other two switch to themselves.
	const radios = m.findAll((n) => n.type === 'button' && n.props.role === 'radio')
	eq(radios.map((b) => b.props.title), ['Compact', 'Comfortable', 'Large'])
	for (const b of radios) b.props.onClick()
	eq(log, ['selecting', 'all', 'deep', 'sort:oldest', 'sort:relevance', 'density:compact', 'density:large'])
	m.render(toolbarProps({ density: 'large', onDensity: (d) => log.push(`density:${d}`) }))
	m.find((n) => n.props?.role === 'radio' && n.props.title === 'Comfortable').props.onClick()
	eq(log.at(-1), 'density:comfortable')
	m.unmount()
})

/* ========================================================================== */
/* SelectionBar                                                               */
/* ========================================================================== */

const baseAlways = ['Clear']
function expectedActions({ canWrite, canDelete, aiConfigured, canSelectAllMatching, allMatching, count, totalMatching }) {
	const out = []
	if (canSelectAllMatching && !allMatching && count < totalMatching) out.push(`Select all ${totalMatching.toLocaleString('en-US')} matching`)
	if (canWrite) out.push('Move to…', 'Tag…')
	if (canWrite && aiConfigured) out.push('Auto-tag again')
	if (canWrite) out.push('Keep all auto tags')
	if (canDelete) out.push('Delete')
	out.push(...baseAlways)
	return out
}

await check('selection bar: every combination of permissions and flags shows exactly the right actions', () => {
	const bools = [false, true]
	let combos = 0
	for (const canWrite of bools)
		for (const canDelete of bools)
			for (const aiConfigured of bools)
				for (const canSelectAllMatching of bools)
					for (const allMatching of bools)
						for (const [count, totalMatching] of [[3, 40], [40, 40], [1, 1], [5, 0]]) {
							const props = { canWrite, canDelete, aiConfigured, canSelectAllMatching, allMatching, count, totalMatching }
							const root = staticChecks(renderBar(props), JSON.stringify(props))
							eq(buttonNames(root), expectedActions(props), JSON.stringify(props))
							combos++
						}
	console.log(`      (${combos} combinations)`)
})

await check('selection bar: view-only person sees the count and Clear only', () => {
	const root = parseHtml(renderBar({ canWrite: false, canDelete: false, aiConfigured: true, canSelectAllMatching: false }))
	eq(buttonNames(root), ['Clear'])
})

await check('selection bar: Auto-tag again needs both aiConfigured and canWrite', () => {
	for (const [canWrite, aiConfigured, shown] of [[true, true, true], [true, false, false], [false, true, false], [false, false, false]])
		eq(buttonNames(parseHtml(renderBar({ canWrite, aiConfigured }))).includes('Auto-tag again'), shown, `write=${canWrite} ai=${aiConfigured}`)
})

await check('selection bar: count wording, singular and plural, thousands', () => {
	const text = (over) => textOf(findAllNodes(parseHtml(renderBar(over)), (n) => n.tag === 'p')[0])
	const region = (over) => findAllNodes(parseHtml(renderBar(over)), (n) => n.attrs.role === 'region')[0].attrs['aria-label']
	eq(text({ count: 1 }), '1 selected')
	eq(region({ count: 1 }), '1 image selected')
	eq(text({ count: 3 }), '3 selected')
	eq(region({ count: 3 }), '3 images selected')
	eq(text({ count: 1234, totalMatching: 5000 }), '1,234 selected')
	eq(region({ count: 1234, totalMatching: 5000 }), '1,234 images selected')
})

await check('selection bar: Select all N matching - shown only when offered, count below total, not already all', () => {
	const link = (over) => buttonNames(parseHtml(renderBar(over))).find((n) => n.startsWith('Select all'))
	eq(link({ count: 3, totalMatching: 1284 }), 'Select all 1,284 matching')
	eq(link({ count: 3, totalMatching: 1284, canSelectAllMatching: false }), undefined, 'relaxed, truncated or over the cap: no link')
	eq(link({ count: 40, totalMatching: 40 }), undefined, 'already everything loaded')
	eq(link({ count: 50, totalMatching: 40 }), undefined, 'count above total')
	eq(link({ count: 3, totalMatching: 1284, allMatching: true }), undefined)
	eq(link({ count: 3, totalMatching: 1, canWrite: false, canDelete: false }), undefined)
})

await check('selection bar: allMatching says All N matching selected and counts the whole set', () => {
	const root = parseHtml(renderBar({ allMatching: true, count: 60, totalMatching: 1284 }))
	eq(textOf(findAllNodes(root, (n) => n.tag === 'p')[0]), 'All 1,284 matching selected')
	eq(findAllNodes(root, (n) => n.attrs.role === 'region')[0].attrs['aria-label'], '1,284 images selected')
	assert(!renderBar({ allMatching: true, count: 60, totalMatching: 1284 }).includes('60 selected'))
	const one = parseHtml(renderBar({ allMatching: true, count: 1, totalMatching: 1 }))
	eq(findAllNodes(one, (n) => n.attrs.role === 'region')[0].attrs['aria-label'], '1 image selected')
	eq(textOf(findAllNodes(parseHtml(renderBar({ allMatching: false, count: 60, totalMatching: 1284 })), (n) => n.tag === 'p')[0]), '60 selected')
})

await check('selection bar: nothing selected renders nothing; hostile counts are safe', () => {
	for (const count of [0, -3, NaN, Infinity, -Infinity])
		eq(renderBar({ count, allMatching: false }), '', `count=${count}`)
	const html = renderBar({ count: 2.7, totalMatching: NaN })
	assert(html.includes('2 selected') && !html.includes('NaN'))
	eq(renderBar({ count: 0, allMatching: true, totalMatching: 5 }).includes('All 5 matching selected'), true)
})

await check('selection bar: it is a labelled, sticky region and has no live region of its own', () => {
	const html = renderBar({})
	const root = parseHtml(html)
	const region = findAllNodes(root, (n) => n.attrs.role === 'region')[0]
	assert(region.attrs['aria-label'])
	assert(hasClass(region, 'sticky'))
	assert(!html.includes('aria-live'), 'the page owns the one live region')
})

await check('selection bar handlers: every button calls its own callback', () => {
	const log = []
	const m = mount(MountBar, barProps({
		onSelectAllMatching: () => log.push('all'),
		onClear: () => log.push('clear'),
		onMove: () => log.push('move'),
		onTag: () => log.push('tag'),
		onRetag: () => log.push('retag'),
		onAcceptTags: () => log.push('accept'),
		onDelete: () => log.push('delete'),
	}))
	const press = (label) => m.find((n) => n.type === 'button' && m.text(n).replace(/\s+/g, ' ').trim() === label).props.onClick()
	for (const label of ['Select all 40 matching', 'Move to…', 'Tag…', 'Auto-tag again', 'Keep all auto tags', 'Delete', 'Clear']) press(label)
	eq(log, ['all', 'move', 'tag', 'retag', 'accept', 'delete', 'clear'])
	m.unmount()
})

/* ========================================================================== */
/* Whole-page static checks                                                   */
/* ========================================================================== */

await check('page: toolbar + grid + selection bar together have named controls and no duplicate ids', () => {
	const a = many(30)
	const html = renderToString(
		h('div', null,
			h(GridToolbar, toolbarProps({ showDeep: true, hasText: true, selecting: true, someSelected: true })),
			h(AssetGrid, gridProps({ assets: a, selectedIds: new Set([a[0].id, a[5].id]), selecting: true, hasMore: true, showFolderPath: true, showMatch: true, canDrag: true, activeId: a[2].id })),
			h(SelectionBar, barProps({ count: 2 })),
		),
	)
	staticChecks(html, 'page')
})

await check('page: no inline style, no dangerouslySetInnerHTML, no semicolon statements in the sources', async () => {
	// Radix owns some inline styles (its hidden form mirrors, indicator and group wrappers);
	// everything else in the output is ours and must have none.
	const RADIX_STYLED = new Set(['checkbox-indicator', 'select-value', 'toggle-group'])
	const radixOwned = (n) =>
		(hiddenFromAt(n) && ['input', 'select'].includes(n.tag)) || RADIX_STYLED.has(n.attrs['data-slot'])
	const styled = (html) => findAllNodes(parseHtml(html), (n) => n.attrs.style !== undefined && !radixOwned(n))
	const a = many(5)
	eq(styled(renderGrid({ assets: a, showFolderPath: true, showMatch: true, selectedIds: new Set([a[0].id]) })).length, 0, 'inline styles in the grid')
	eq(styled(renderToolbar({ showDeep: true, someSelected: true })).length, 0, 'inline styles in the toolbar')
	eq(styled(renderBar({})).length, 0, 'inline styles in the selection bar')
	const { readFile } = await import('node:fs/promises')
	for (const f of ['asset-grid', 'asset-card', 'grid-toolbar', 'selection-bar']) {
		const src = await readFile(new URL(`../src/app/account/media/${f}.tsx`, import.meta.url), 'utf8')
		assert(!src.includes('dangerouslySetInnerHTML'), `${f} uses dangerouslySetInnerHTML`)
		assert(!/\sstyle=/.test(src), `${f} sets an inline style`)
		const stray = src.split('\n').filter((line) => /;\s*$/.test(line) && !/^\s*(\*|\/\/)/.test(line))
		eq(stray, [], `${f} has lines ending in a semicolon`)
	}
})

/* -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed`)
if (consoleProblems.length) {
	console.log(`console problems (${consoleProblems.length}):`)
	for (const p of consoleProblems.slice(0, 10)) console.log(`  ${p}`)
}
process.exit(failed === 0 && consoleProblems.length === 0 ? 0 : 1)
