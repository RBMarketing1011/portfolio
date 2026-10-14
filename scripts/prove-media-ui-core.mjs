/**
 * Proves the media library's core UI: the API client, the state machine behind the page,
 * the assembled library and the server page.
 *
 *   node scripts/prove-media-ui-core.mjs
 *
 * What is covered, with no DOM and no browser:
 *  - media-api.ts: every wrapper's URL, method and body, the workspace header on EVERY call,
 *    error mapping, aborts, with a fake fetch.
 *  - use-media-library.ts: the pure helpers (URL <-> params, the reconcile decision,
 *    selection, optimistic edits and their rollback, query surgery, keyboard gating,
 *    the stale-response gate), the AI loop under fake timers, and the whole controller
 *    (debounce, history writes, popstate, races, selection rules, bulk actions, refreshes)
 *    against a fake API, environment and clock; plus the hook itself through a tiny
 *    hook-aware renderer, to prove it mounts in a LAYOUT effect.
 *  - media-library.tsx: server-rendered with a realistic `initial` (60 assets, 20 folders,
 *    saved searches, tagging states) for every permission combination, and in the states
 *    the controller can reach (selection, loading, error, notice, empty).
 *  - page.tsx and account-shell.tsx, with the server modules mocked.
 *
 * Expectations come from the build spec (sections 3, 5, 6.2, 6.3) and the contracts, not
 * from what the code happens to do.
 */
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'

// React picks its dev or prod build when it is first required: this must come first so key
// and nesting warnings are real and can be asserted absent.
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
let finished = false
process.on('exit', (code) => {
	if (!finished && code === 0) process.exitCode = 1
	if (!finished) console.log('FAIL  the proof did not run to the end')
})

const consoleProblems = []
for (const level of ['error', 'warn']) {
	const original = console[level]
	console[level] = (...args) => {
		consoleProblems.push(`${level}: ${args.map(String).join(' ').slice(0, 300)}`)
		original.apply(console, args)
	}
}

// ONLY="substring" runs just the checks whose name contains it, for working on one.
const only = process.env.ONLY
async function check(name, fn) {
	if (only && !name.includes(only)) return
	const before = consoleProblems.length
	try {
		await fn()
		if (consoleProblems.length !== before)
			throw new Error(`console output: ${consoleProblems[before]}`)
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		const text = error?.message ?? String(error)
		console.log(`FAIL  ${name} (${text.split('\n').slice(0, 3).join(' | ').slice(0, 400)})`)
	}
}

function assert(condition, message = 'assertion failed') {
	if (!condition) throw new Error(message)
}
/** JSON with object keys sorted: two objects with the same content are equal whatever order they were built in. */
const canonical = (value) =>
	JSON.stringify(value, (key, inner) =>
		inner && typeof inner === 'object' && !Array.isArray(inner)
			? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
			: inner,
	)
function eq(actual, expected, message = '') {
	const a = canonical(actual)
	const b = canonical(expected)
	if (a !== b) throw new Error(`${message ? `${message}: ` : ''}expected ${b}, got ${a}`)
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
async function rejects(promise, test, message = 'expected a rejection') {
	try {
		await promise
	} catch (error) {
		if (test && !test(error)) throw new Error(`${message}: rejected with ${error?.message}`)
		return error
	}
	throw new Error(`${message}: it resolved`)
}

/* -------------------------------------------------------------------------- */
/* Stand-ins for next/*, then the real modules                                */
/* -------------------------------------------------------------------------- */

mock('next/image', {
	__esModule: true,
	default: function FakeImage(props) {
		return h('img', {
			src: props.src,
			alt: props.alt,
			sizes: props.sizes,
			draggable: props.draggable,
			'data-fill': props.fill ? '1' : undefined,
		})
	},
})
mock('next/link', {
	__esModule: true,
	default: function FakeLink({ href, children, ...rest }) {
		return h('a', { href, ...rest }, children)
	},
})
let currentPathname = '/account/media'
// Counted, because the library must read its URL through window.location only (spec 6.2).
const routerCalls = { usePathname: 0, useSearchParams: 0, useRouter: 0 }
mock('next/navigation', {
	notFound() {
		const error = new Error('NEXT_NOT_FOUND')
		error.digest = 'NEXT_NOT_FOUND'
		throw error
	},
	usePathname: () => (routerCalls.usePathname++, currentPathname),
	useRouter: () => (routerCalls.useRouter++, { push() {}, replace() {}, refresh() {} }),
	useSearchParams: () => (routerCalls.useSearchParams++, new URLSearchParams()),
})
mock('@vercel/blob/client', { upload: async () => ({ url: 'https://x.public.blob.vercel-storage.com/x' }) })

const types = loadTs('src/lib/media/types.ts')
const schemas = loadTs('src/lib/media/schemas.ts')
const apiModule = loadTs('src/app/account/media/media-api.ts')
const lib = loadTs('src/app/account/media/use-media-library.ts')
const { MEDIA_LIMITS } = types

const API_BASE = '/api/account/media'

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const hex = (n) => n.toString(16).padStart(24, '0')
const WS = hex(0xabc)
const BLUR = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4IA4AAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA=='

function asset(i, over = {}) {
	return {
		id: hex(i),
		name: `Kitchen ${i}`,
		filename: `kitchen-${i}.jpg`,
		url: `https://abc123.public.blob.vercel-storage.com/workspaces/${WS}/media/kitchen-${i}.jpg`,
		contentType: 'image/jpeg',
		format: 'jpg',
		bytes: 1_572_864,
		width: 1600,
		height: 1200,
		orientation: 'landscape',
		hasAlpha: false,
		animated: false,
		colors: [{ hex: '#3366cc', name: 'blue', share: 0.4 }],
		brightness: 'mid',
		saturation: 'muted',
		blur: BLUR,
		folderId: null,
		folderPath: '',
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
const many = (n, over = {}, from = 1) => Array.from({ length: n }, (_, i) => asset(from + i, over))

/** 20 folders: 4 at the top, 8 under them, 8 below those (`Clients/Acme/Kitchens`). */
function folderFixture() {
	const roots = ['Clients', 'Marketing', 'Projects', 'Archive']
	const out = []
	let n = 1000
	const add = (name, parent) => {
		const id = hex(++n)
		const path = parent ? `${parent.path}/${name}` : name
		out.push({ id, parentId: parent ? parent.id : null, name, path, depth: parent ? parent.depth + 1 : 0, count: 3, total: 6 })
		return out[out.length - 1]
	}
	const top = roots.map((name) => add(name, null))
	const mid = []
	for (const root of top) for (const name of ['Acme', 'Beta']) mid.push(add(name, root))
	for (const parent of mid) add('Kitchens', parent)
	return out
}
const FOLDERS = folderFixture()
const ACME = FOLDERS.find((f) => f.path === 'Clients/Acme')
const ACME_KITCHENS = FOLDERS.find((f) => f.path === 'Clients/Acme/Kitchens')

const noQuery = { chips: [], warnings: [], sort: null, hasText: false }
const noFacets = { tags: [], colors: [], folders: [] }
function searchResponse(assets, over = {}) {
	return {
		assets,
		total: assets.length,
		offset: 0,
		limit: 60,
		hasMore: false,
		truncated: false,
		sort: 'newest',
		query: noQuery,
		corrections: [],
		dropped: [],
		facets: { tags: [{ value: 'kitchen', label: 'Kitchen', count: 40 }], colors: [{ value: 'blue', label: 'blue', count: 30, hex: '#3366cc' }], folders: [{ value: ACME.id, label: ACME.path, count: 3 }] },
		pending: 0,
		...over,
	}
}
const TAGGING_OFF = { configured: false, model: null, pending: 0, running: 0, failed: 0, skipped: 0, untagged: 0, budgetExhausted: false, resetsAt: null }
const TAGGING_ON = { configured: true, model: 'claude-opus-5-5', pending: 0, running: 0, failed: 0, skipped: 0, untagged: 0, budgetExhausted: false, resetsAt: null }
const foldersResponse = (over = {}) => ({ folders: FOLDERS, unfiled: 12, total: 312, unreviewed: 9, bytes: 3_400_000_000, ...over })
const SAVED = [
	{ id: hex(5001), name: 'Kitchen photos', query: 'tag:kitchen type:jpg', folder: null, sort: null, createdAt: '2026-02-01T00:00:00.000Z' },
	{ id: hex(5002), name: 'Acme logos', query: 'kind:logo', folder: ACME.id, sort: 'name', createdAt: '2026-01-01T00:00:00.000Z' },
]

function baseInitial(over = {}) {
	return {
		params: { q: '' },
		search: searchResponse(many(60), { total: 312, hasMore: true }),
		folders: foldersResponse(),
		saved: SAVED,
		tagging: TAGGING_OFF,
		...over,
	}
}
function baseProps(over = {}) {
	return {
		initial: baseInitial(),
		can: { write: true, delete: true },
		workspaceId: WS,
		maxBytes: MEDIA_LIMITS.maxBytes,
		pathPrefix: `workspaces/${WS}/media/`,
		...over,
	}
}

/* ========================================================================== */
/* media-api                                                                  */
/* ========================================================================== */

const abortError = () => new DOMException('The operation was aborted.', 'AbortError')
const jsonResponse = (body, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function fakeFetch(responder = () => jsonResponse({})) {
	const calls = []
	const fetch = async (url, init) => {
		calls.push({ url, init })
		if (init?.signal?.aborted) throw abortError()
		return responder(url, init, calls.length)
	}
	fetch.calls = calls
	return fetch
}

const ID1 = hex(1)
const API_CASES = [
	{
		name: 'search',
		run: (api) => api.search({ q: 'kitchen', folder: ID1, deep: true, sort: 'oldest', offset: 60, limit: 30, facets: true }),
		method: 'GET', path: '', query: { q: 'kitchen', folder: ID1, deep: '1', sort: 'oldest', offset: '60', limit: '30', facets: '1' },
		reply: { assets: [], total: 0 },
	},
	{ name: 'suggest', run: (api) => api.suggest('ki'), method: 'GET', path: '/suggest', query: { q: 'ki' }, reply: { suggestions: [{ kind: 'tag', label: 'Kitchen', insert: 'tag:kitchen' }] } },
	{ name: 'getAsset', run: (api) => api.getAsset(ID1), method: 'GET', path: `/${ID1}`, query: {}, reply: { asset: asset(1) } },
	{ name: 'patchAsset', run: (api) => api.patchAsset(ID1, { name: 'x', addTags: ['a'] }), method: 'PATCH', path: `/${ID1}`, query: {}, body: { name: 'x', addTags: ['a'] }, reply: { asset: asset(1) } },
	{ name: 'deleteAsset', run: (api) => api.deleteAsset(ID1), method: 'DELETE', path: `/${ID1}`, query: {}, reply: { ok: true } },
	{ name: 'bulk', run: (api) => api.bulk({ action: 'delete', target: { ids: [ID1] } }), method: 'POST', path: '/bulk', query: {}, body: { action: 'delete', target: { ids: [ID1] } }, reply: { affected: 1 } },
	{ name: 'listTags', run: (api) => api.listTags({ q: 'kit', limit: 20 }), method: 'GET', path: '/tags', query: { q: 'kit', limit: '20' }, reply: { tags: [] } },
	{ name: 'renameTag', run: (api) => api.renameTag('kitchen', 'Kitchens'), method: 'PATCH', path: '/tags/kitchen', query: {}, body: { label: 'Kitchens' }, reply: { affected: 2, slug: 'kitchens', merged: false } },
	{ name: 'mergeTag', run: (api) => api.mergeTag('kitchens', 'kitchen'), method: 'PATCH', path: '/tags/kitchens', query: {}, body: { mergeInto: 'kitchen' }, reply: { affected: 2, slug: 'kitchen', merged: true } },
	{ name: 'deleteTag', run: (api) => api.deleteTag('kitchen'), method: 'DELETE', path: '/tags/kitchen', query: {}, reply: { affected: 3 } },
	{ name: 'listFolders', run: (api) => api.listFolders(), method: 'GET', path: '/folders', query: {}, reply: foldersResponse() },
	{ name: 'createFolder', run: (api) => api.createFolder({ name: 'Acme', parentId: null }), method: 'POST', path: '/folders', query: {}, body: { name: 'Acme', parentId: null }, reply: { folder: FOLDERS[0] } },
	{ name: 'patchFolder', run: (api) => api.patchFolder(ID1, { name: 'B', parentId: null }), method: 'PATCH', path: `/folders/${ID1}`, query: {}, body: { name: 'B', parentId: null }, reply: { folder: FOLDERS[0] } },
	{ name: 'deleteFolder', run: (api) => api.deleteFolder(ID1), method: 'DELETE', path: `/folders/${ID1}`, query: {}, reply: { moved: { assets: 1, folders: 0 } } },
	{ name: 'listSaved', run: (api) => api.listSaved(), method: 'GET', path: '/saved', query: {}, reply: { saved: SAVED } },
	{ name: 'createSaved', run: (api) => api.createSaved({ name: 'N', query: 'q', folder: null, sort: null }), method: 'POST', path: '/saved', query: {}, body: { name: 'N', query: 'q', folder: null, sort: null }, reply: { saved: SAVED[0] } },
	{ name: 'deleteSaved', run: (api) => api.deleteSaved(ID1), method: 'DELETE', path: `/saved/${ID1}`, query: {}, reply: { ok: true } },
	{ name: 'process', run: (api) => api.process(), method: 'POST', path: '/process', query: {}, body: {}, reply: { processed: [], remaining: 0, configured: true, budgetExhausted: false } },
	{ name: 'process (requeue)', run: (api) => api.process({ requeue: true }), method: 'POST', path: '/process', query: {}, body: { requeue: true }, reply: { processed: [], remaining: 0, configured: true, budgetExhausted: false } },
	{ name: 'processStatus', run: (api) => api.processStatus(), method: 'GET', path: '/process', query: {}, reply: TAGGING_ON },
]

await check('api: every endpoint of spec section 5 has a wrapper, with the right URL, method and body', async () => {
	for (const c of API_CASES) {
		const fetch = fakeFetch(() => jsonResponse(c.reply))
		const api = apiModule.createMediaApi({ workspaceId: WS, fetch })
		await c.run(api)
		eq(fetch.calls.length, 1, `${c.name} call count`)
		const { url, init } = fetch.calls[0]
		const parsed = new URL(url, 'http://localhost')
		eq(parsed.pathname, `${API_BASE}${c.path}`, `${c.name} path`)
		eq(Object.fromEntries(parsed.searchParams), c.query, `${c.name} query`)
		eq(init.method, c.method, `${c.name} method`)
		if (c.body !== undefined) eq(JSON.parse(init.body), c.body, `${c.name} body`)
		else assert(init.body === undefined, `${c.name} sent a body`)
	}
	// 19 endpoints (search, suggest, asset get/patch/delete, bulk, tags list/rename/merge/delete,
	// folders list/create/patch/delete, saved list/create/delete, process, process-status), and
	// `process` is listed twice for its requeue body.
	eq(API_CASES.length, 20)
})

await check('api: EVERY call sends x-media-workspace with the id the client was made for', async () => {
	for (const workspaceId of [WS, hex(0xdef)]) {
		for (const c of API_CASES) {
			const fetch = fakeFetch(() => jsonResponse(c.reply))
			await c.run(apiModule.createMediaApi({ workspaceId, fetch }))
			const headers = fetch.calls[0].init.headers
			eq(headers['x-media-workspace'], workspaceId, `${c.name} header`)
		}
	}
	eq(apiModule.MEDIA_WORKSPACE_HEADER, 'x-media-workspace')
})

await check('api: JSON only, never cached, same-origin, content type only with a body', async () => {
	for (const c of API_CASES) {
		const fetch = fakeFetch(() => jsonResponse(c.reply))
		await c.run(apiModule.createMediaApi({ workspaceId: WS, fetch }))
		const { init } = fetch.calls[0]
		eq(init.cache, 'no-store', `${c.name} cache`)
		eq(init.credentials, 'same-origin', `${c.name} credentials`)
		eq(init.headers.Accept, 'application/json', `${c.name} accept`)
		if (c.body !== undefined) eq(init.headers['Content-Type'], 'application/json', `${c.name} content type`)
		else assert(!('Content-Type' in init.headers), `${c.name} sent a content type without a body`)
	}
})

await check('api: every call takes an AbortSignal and passes it to fetch', async () => {
	const signalled = [
		(api, s) => api.search({ q: '' }, s),
		(api, s) => api.suggest('x', s),
		(api, s) => api.getAsset(ID1, s),
		(api, s) => api.patchAsset(ID1, { name: 'x' }, s),
		(api, s) => api.deleteAsset(ID1, s),
		(api, s) => api.bulk({ action: 'delete', target: { ids: [ID1] } }, s),
		(api, s) => api.listTags({}, s),
		(api, s) => api.renameTag('a', 'b', s),
		(api, s) => api.mergeTag('a', 'b', s),
		(api, s) => api.deleteTag('a', s),
		(api, s) => api.listFolders(s),
		(api, s) => api.createFolder({ name: 'a', parentId: null }, s),
		(api, s) => api.patchFolder(ID1, { name: 'a' }, s),
		(api, s) => api.deleteFolder(ID1, s),
		(api, s) => api.listSaved(s),
		(api, s) => api.createSaved({ name: 'a', query: '', folder: null, sort: null }, s),
		(api, s) => api.deleteSaved(ID1, s),
		(api, s) => api.process({}, s),
		(api, s) => api.processStatus(s),
	]
	eq(signalled.length, API_CASES.length - 1, 'one wrapper per endpoint (process has two cases)')
	// One reply that every wrapper accepts, so only the signal is under test.
	const universal = {
		assets: [], asset: asset(1), suggestions: [], affected: 1, tags: [], slug: 's', merged: false,
		folders: [], unfiled: 0, total: 0, unreviewed: 0, bytes: 0, folder: FOLDERS[0],
		moved: { assets: 0, folders: 0 }, saved: [], processed: [], remaining: 0, configured: true,
		budgetExhausted: false, ok: true,
	}
	for (const [index, run] of signalled.entries()) {
		const controller = new AbortController()
		const fetch = fakeFetch(() => jsonResponse(universal))
		await run(apiModule.createMediaApi({ workspaceId: WS, fetch }), controller.signal)
		assert(fetch.calls[0].init.signal === controller.signal, `wrapper ${index} dropped the signal`)
	}
	// And a call that was aborted rejects with the browser's AbortError, not a MediaApiError.
	const controller = new AbortController()
	controller.abort()
	const fetch = fakeFetch()
	const error = await rejects(
		apiModule.createMediaApi({ workspaceId: WS, fetch }).search({ q: 'x' }, controller.signal),
		(e) => e.name === 'AbortError',
	)
	assert(!(error instanceof apiModule.MediaApiError), 'an abort must not look like a failed call')
	assert(apiModule.isAbortError(error))
})

await check('api: a non-2xx answer throws an Error carrying the server { error } sentence and the status', async () => {
	for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 503]) {
		const fetch = fakeFetch(() => jsonResponse({ error: `Sentence for ${status}.` }, status))
		const api = apiModule.createMediaApi({ workspaceId: WS, fetch })
		const error = await rejects(api.getAsset(ID1), (e) => e instanceof Error)
		eq(error.message, `Sentence for ${status}.`)
		eq(error.status, status)
		assert(error instanceof apiModule.MediaApiError)
	}
})

await check('api: a missing or unusable { error } falls back to a generic sentence for the status', async () => {
	const bodies = [
		() => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
		() => new Response('', { status: 500 }),
		() => jsonResponse({ nope: 1 }, 500),
		() => jsonResponse({ error: '' }, 500),
		() => jsonResponse({ error: '   ' }, 500),
		() => jsonResponse({ error: { nested: true } }, 500),
		() => jsonResponse(null, 500),
		() => jsonResponse(['x'], 500),
	]
	for (const make of bodies) {
		const api = apiModule.createMediaApi({ workspaceId: WS, fetch: fakeFetch(make) })
		const error = await rejects(api.listFolders())
		assert(error.message.length > 10, `message too short: ${error.message}`)
		assert(!/html|object|nested/i.test(error.message), `leaked the body: ${error.message}`)
	}
	for (const status of [400, 401, 403, 404, 409, 413, 429, 500]) {
		const generic = apiModule.genericMessage(status)
		assert(generic.endsWith('.'), `generic for ${status} is a sentence`)
	}
	eq(new Set([400, 401, 403, 404, 409, 429, 500].map(apiModule.genericMessage)).size, 7, 'a different sentence per kind of failure')
})

await check('api: a long server sentence is cut, and the network failing is a plain sentence with status 0', async () => {
	const long = 'x'.repeat(5000)
	const api = apiModule.createMediaApi({ workspaceId: WS, fetch: fakeFetch(() => jsonResponse({ error: long }, 400)) })
	const error = await rejects(api.listSaved())
	assert(error.message.length <= 300, `message ${error.message.length} chars`)

	const offline = apiModule.createMediaApi({
		workspaceId: WS,
		fetch: async () => {
			throw new TypeError('Failed to fetch')
		},
	})
	const failure = await rejects(offline.search({ q: '' }))
	eq(failure.status, 0)
	assert(/connection|reach/i.test(failure.message), failure.message)
	assert(!/Failed to fetch/.test(failure.message), 'the browser text must not leak')
})

await check('api: a 200 that is not the expected shape is an error, never a value the UI would crash on', async () => {
	const cases = [
		[(api) => api.search({ q: '' }), { assets: 'no' }],
		[(api) => api.search({ q: '' }), {}],
		[(api) => api.getAsset(ID1), {}],
		[(api) => api.bulk({ action: 'delete', target: { ids: [ID1] } }), { affected: 'many' }],
		[(api) => api.listTags(), { tags: {} }],
		[(api) => api.listFolders(), { folders: 'x' }],
		[(api) => api.process(), { processed: null }],
		[(api) => api.renameTag('a', 'b'), { slug: 'x' }],
	]
	for (const [run, reply] of cases) {
		const api = apiModule.createMediaApi({ workspaceId: WS, fetch: fakeFetch(() => jsonResponse(reply)) })
		await rejects(run(api), (e) => e instanceof apiModule.MediaApiError)
	}
	const broken = apiModule.createMediaApi({ workspaceId: WS, fetch: fakeFetch(() => new Response('not json', { status: 200 })) })
	await rejects(broken.listSaved(), (e) => e instanceof apiModule.MediaApiError)
})

await check('api: hostile input stays inside its own path segment and query value', async () => {
	const fetch = fakeFetch(() => jsonResponse({ assets: [], asset: asset(1), affected: 0, slug: 's', merged: false, tags: [], suggestions: [] }))
	const api = apiModule.createMediaApi({ workspaceId: WS, fetch })
	await api.getAsset('../../../etc/passwd?x=1#frag')
	await api.renameTag('a/b?c=d', 'x')
	await api.suggest('a&b=c#d%00')
	await api.search({ q: 'kitchen&folder=evil#x', folder: undefined })
	for (const { url } of fetch.calls) {
		assert(!/#/.test(url), `a fragment reached the URL: ${url}`)
		// Escaped, a slash stays inside its segment; no segment is ever a dot segment.
		for (const segment of new URL(url, 'http://x').pathname.split('/'))
			assert(segment !== '.' && segment !== '..' && !/^%2e/i.test(segment), `a dot segment in ${url}`)
	}
	const asParsed = (i) => new URL(fetch.calls[i].url, 'http://x')
	eq(asParsed(0).pathname.slice(API_BASE.length + 1).split('/').length, 1, 'the id stayed one path segment')
	eq(asParsed(0).pathname.startsWith(`${API_BASE}/`), true)
	eq(asParsed(0).search, '', 'the id did not become a query string')
	eq(asParsed(1).pathname, `${API_BASE}/tags/a%2Fb%3Fc%3Dd`)
	eq(asParsed(2).searchParams.get('q'), 'a&b=c#d%00')
	eq(asParsed(3).searchParams.get('q'), 'kitchen&folder=evil#x')
	eq(asParsed(3).searchParams.get('folder'), null)
	// The query the server reads is exactly the text that was typed.
	eq(schemas.readSearchParams(asParsed(3).searchParams).q, 'kitchen&folder=evil#x')
})

await check('api: search omits defaults, so a plain library view is a clean URL', async () => {
	const fetch = fakeFetch(() => jsonResponse({ assets: [] }))
	const api = apiModule.createMediaApi({ workspaceId: WS, fetch })
	await api.search({ q: '', offset: 0, limit: MEDIA_LIMITS.pageSize })
	await api.search({ q: '   ' })
	await api.search({ q: 'x', deep: false })
	eq(fetch.calls[0].url, API_BASE)
	eq(fetch.calls[1].url, API_BASE)
	eq(new URL(fetch.calls[2].url, 'http://x').searchParams.get('deep'), '0')
})

await check('api: with no fetch given it uses the global one, called as a plain function', async () => {
	const original = globalThis.fetch
	const seen = []
	globalThis.fetch = function (url, init) {
		// A bare `fetch` called as a method of another object throws "Illegal invocation" in browsers.
		if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
		seen.push({ url, init })
		return Promise.resolve(jsonResponse({ assets: [] }))
	}
	try {
		await apiModule.createMediaApi({ workspaceId: WS }).search({ q: 'x' })
	} finally {
		globalThis.fetch = original
	}
	eq(seen.length, 1)
	eq(seen[0].init.headers['x-media-workspace'], WS)
})

/* ========================================================================== */
/* URL <-> params                                                             */
/* ========================================================================== */

const parseMod = loadTs('src/lib/media/query/parse.ts')
const parseQuery = parseMod.parseQuery
const OBJECT_ID = /^[a-f0-9]{24}$/i

await check('url: hostile query strings degrade to safe params and never throw', () => {
	const hostile = [
		'', '?', '??', 'q', 'q=', '?q=%E0%A4%A', '?q=%', '?q=%zz', `?q=${'a'.repeat(10_000)}`,
		'?q=a&q=b', '?q[]=x', '?__proto__[polluted]=1', '?constructor=1&folder=constructor',
		'?folder=zzz', `?folder=${'a'.repeat(24)}`, `?folder=${'Z'.repeat(24)}`, '?folder=unfiled',
		'?folder=unfiled&deep=1', '?deep=maybe', '?deep=1', '?sort=__proto__', '?sort=NEWEST', '?sort=oldest',
		'?asset=notanid', `?asset=${hex(7)}`, `?asset=${hex(7)}x`, `?asset=${hex(7)}&asset=zz`,
		null, undefined, 42, {}, [], '\u0000', '?q=%00%01', '?q=<script>alert(1)</script>', '?q=%F0%9F%98%80',
		'?offset=-5&limit=99999&facets=1', '&&&===&&', '?q=' + '('.repeat(5000),
	]
	for (const search of hostile) {
		const { params, asset } = lib.paramsFromSearch(search)
		assert(typeof params.q === 'string' && params.q.length <= MEDIA_LIMITS.queryMax, `q for ${String(search).slice(0, 30)}`)
		assert(params.folder === undefined || params.folder === 'unfiled' || OBJECT_ID.test(params.folder), 'folder')
		assert(params.deep === undefined || typeof params.deep === 'boolean', 'deep')
		assert(params.deep === undefined || params.folder !== undefined && params.folder !== 'unfiled', 'deep without a folder means nothing')
		assert(params.sort === undefined || types.MEDIA_SORTS.includes(params.sort), 'sort')
		assert(asset === null || OBJECT_ID.test(asset), 'asset')
		assert(!('offset' in params) && !('limit' in params) && !('facets' in params), 'page fields never enter the params')
	}
	assert(Object.prototype.polluted === undefined, 'prototype pollution')
	// Two values for one key: the first wins, as the server reads it.
	eq(lib.paramsFromSearch('?q=a&q=b').params.q, 'a')
	eq(lib.paramsFromSearch('?folder=constructor').params.folder, undefined)
	eq(lib.paramsFromSearch('?deep=maybe&folder=unfiled').params, { q: '', folder: 'unfiled' })
})

await check('url: params -> URL -> params is the identity, defaults are omitted, and asset rides along', () => {
	const f = hex(9)
	const combos = [
		{ q: '' }, { q: 'kitchen' }, { q: 'kitchen sink tag:remodel' }, { q: 'tag:"a b" "before and after" -people' },
		{ q: 'a&b=c#d+e%20f' }, { q: 'ünïcödé 日本 \u{1F600}' }, { q: 'x', folder: f, deep: true },
		{ q: 'x', folder: f, deep: false, sort: 'oldest' }, { q: '', folder: 'unfiled' }, { q: '', sort: 'name-desc' },
		{ q: 'kitchen', sort: 'relevance' }, { q: '  padded  ' }, { q: 'x'.repeat(500) },
	]
	for (const combo of combos)
		for (const asset of [null, hex(3)]) {
			const norm = lib.normalizeParams(combo)
			const search = lib.searchFromParams(combo, asset)
			const back = lib.paramsFromSearch(search)
			eq(back.params, norm, `round trip of ${JSON.stringify(combo).slice(0, 50)}`)
			eq(back.asset, asset)
			eq(lib.paramsFromSearch(`?${search}`).params, norm, 'with a leading ?')
		}
	eq(lib.searchFromParams({ q: '' }), '', 'a plain library view keeps a clean URL')
	eq(lib.searchFromParams({ q: '   ' }), '')
	eq(lib.searchFromParams({ q: 'x', folder: f }), `q=x&folder=${f}`, 'no deep unless chosen')
	eq(new URLSearchParams(lib.searchFromParams({ q: 'x', folder: f, deep: false })).get('deep'), '0')
	eq(new URLSearchParams(lib.searchFromParams({ q: '' }, hex(3))).get('asset'), hex(3))
	eq(lib.buildUrl({ pathname: '/account/media', search: '?a=1', hash: '#top' }, 'q=x'), '/account/media?q=x#top')
	eq(lib.buildUrl({ pathname: '/account/media', search: '', hash: '' }, ''), '/account/media')
})

await check('url: a positive top-level folder: clause supersedes the folder param (omitted from request and URL)', () => {
	const f = hex(9)
	const superseding = ['folder:Clients/Acme', 'folder:Clients/Acme tag:a', 'tag:a folder:none', '(folder:a tag:b)', 'folder:"Clients/Acme Co" blue']
	for (const q of superseding) {
		assert(lib.hasFolderClause(q), `${q} supersedes`)
		const params = { q, folder: f, deep: true, sort: 'oldest' }
		eq(lib.normalizeParams(params), { q, sort: 'oldest' }, `normalized ${q}`)
		const request = lib.requestFor(params)
		eq(request.folder, undefined, `request folder for ${q}`)
		eq(request.deep, undefined, `request deep for ${q}`)
		const url = new URLSearchParams(lib.searchFromParams(params))
		assert(!url.has('folder') && !url.has('deep'), `URL for ${q}`)
		eq(lib.resultsKeyOf(params), { q }, `the bulk target for ${q} carries no folder`)
	}
	const keeping = ['-folder:Clients', 'NOT folder:Clients', 'folder:a OR tag:b', 'my folder', 'folder:', 'is:unfiled', 'tag:folder', '(folder:a OR folder:b)']
	for (const q of keeping) {
		assert(!lib.hasFolderClause(q), `${q} does not supersede`)
		eq(lib.normalizeParams({ q, folder: f, deep: true }).folder, f, `kept for ${q}`)
	}
})

await check('url: reconcile compares the URL with the server-rendered hint (and ignores page fields)', () => {
	const f = hex(9)
	const hint = { q: 'kitchen', folder: f, deep: true, sort: 'oldest', offset: 0, limit: 60, facets: true }
	const url = `?q=kitchen&folder=${f}&deep=1&sort=oldest`
	const same = lib.decideReconcile(hint, url)
	eq(same.refetch, false)
	eq(same.params, { q: 'kitchen', folder: f, deep: true, sort: 'oldest' })
	eq(lib.decideReconcile(hint, `${url}&offset=60&limit=5&facets=0`).refetch, false, 'page fields are not part of the search')
	const withAsset = lib.decideReconcile(hint, `${url}&asset=${hex(4)}`)
	eq(withAsset.refetch, false, '?asset never changes the list')
	eq(withAsset.asset, hex(4))
	for (const [name, search] of [
		['q', `?q=other&folder=${f}&deep=1&sort=oldest`],
		['folder', `?q=kitchen&folder=${hex(8)}&deep=1&sort=oldest`],
		['no folder', '?q=kitchen&sort=oldest'],
		['deep', `?q=kitchen&folder=${f}&deep=0&sort=oldest`],
		['no deep', `?q=kitchen&folder=${f}&sort=oldest`],
		['sort', `?q=kitchen&folder=${f}&deep=1&sort=newest`],
		['empty URL (a Back to the plain entry)', ''],
	])
		eq(lib.decideReconcile(hint, search).refetch, true, `differs in ${name}`)
	eq(lib.decideReconcile({ q: '  kitchen ' }, '?q=kitchen').refetch, false, 'surrounding spaces are not a different search')
	eq(lib.decideReconcile({ q: '' }, '?q=%E0%A4%A&folder=zzz').refetch, true, 'garbage that still reads as text is a search')
	eq(lib.decideReconcile({ q: '' }, '?folder=zzz&sort=nope&deep=maybe').refetch, false, 'garbage that reads as nothing is nothing')
	eq(lib.decideReconcile(undefined, '').refetch, false)
	eq(lib.decideReconcile(null, '?q=x').refetch, true)
})

await check('url: the effective scope, as the pill and the toggle show it', () => {
	const f = ACME.id
	eq(lib.effectiveDeep({ q: '' }), false)
	eq(lib.effectiveDeep({ q: '', folder: f }), false, 'plain browsing is not deep by default')
	eq(lib.effectiveDeep({ q: 'kitchen', folder: f }), true, 'a query makes it deep by default')
	eq(lib.effectiveDeep({ q: '', folder: f, deep: true }), true)
	eq(lib.effectiveDeep({ q: 'kitchen', folder: f, deep: false }), false)
	eq(lib.effectiveDeep({ q: 'sort:name', folder: f }), false, 'a sort: operator is not a clause')
	eq(lib.scopeOf({ q: '' }, FOLDERS), null)
	eq(lib.scopeOf({ q: '', folder: f }, FOLDERS), { label: 'Clients/Acme', deep: false })
	eq(lib.scopeOf({ q: 'x', folder: f }, FOLDERS), { label: 'Clients/Acme', deep: true })
	eq(lib.scopeOf({ q: '', folder: 'unfiled' }, FOLDERS), { label: 'Unfiled', deep: false })
	eq(lib.scopeOf({ q: '', folder: hex(777) }, FOLDERS), { label: '', deep: false }, 'a folder that is gone has no name')
	eq(lib.scopeOf({ q: 'folder:Clients', folder: f }, FOLDERS), null, 'a superseding clause hides the pill')
	eq(lib.activeFolderOf({ q: '', folder: f }), f)
	eq(lib.activeFolderOf({ q: 'folder:x', folder: f }), undefined)
})

/* ========================================================================== */
/* Selection                                                                  */
/* ========================================================================== */

const ORDER = ['a', 'b', 'c', 'd', 'e', 'f']
const setOf = (selection) => [...selection.ids].sort()

await check('selection: toggle, shift-range from the anchor in either direction, and select all loaded', () => {
	let s = lib.emptySelection
	s = lib.toggleSelection(s, 'b', { range: false, order: ORDER })
	eq(setOf(s), ['b'])
	eq(s.anchor, 'b')
	s = lib.toggleSelection(s, 'e', { range: true, order: ORDER })
	eq(setOf(s), ['b', 'c', 'd', 'e'], 'a range is everything between the anchor and the card')
	eq(s.anchor, 'e')
	s = lib.toggleSelection(s, 'a', { range: true, order: ORDER })
	eq(setOf(s), ['a', 'b', 'c', 'd', 'e'], 'and backwards from the new anchor')
	s = lib.toggleSelection(s, 'c', { range: false, order: ORDER })
	eq(setOf(s), ['a', 'b', 'd', 'e'], 'a selected card is toggled off')
	// No anchor, or an anchor that is no longer shown, makes a range a plain toggle.
	eq(setOf(lib.toggleSelection(lib.emptySelection, 'c', { range: true, order: ORDER })), ['c'])
	const stale = { ...lib.emptySelection, ids: new Set(['x']), anchor: 'x' }
	eq(setOf(lib.toggleSelection(stale, 'c', { range: true, order: ORDER })), ['c', 'x'])
	eq(setOf(lib.toggleSelection(lib.emptySelection, 'c', { range: true, order: ORDER.slice(0, 1) })), ['c'], 'a card that is not in the order')
	// Never mutates the selection it was given.
	const before = lib.toggleSelection(lib.emptySelection, 'a', { range: false, order: ORDER })
	lib.toggleSelection(before, 'b', { range: false, order: ORDER })
	eq(setOf(before), ['a'])

	const all = lib.selectAllLoaded({ ...lib.emptySelection, ids: new Set(['ghost']) }, ORDER)
	eq(setOf(all), ['a', 'b', 'c', 'd', 'e', 'f', 'ghost'], 'a just-uploaded id that is not loaded yet stays selected')
	eq(all.allMatching, false)
	eq(lib.allLoadedSelected(all, ORDER), true)
	eq(lib.allLoadedSelected(lib.emptySelection, ORDER), false)
	eq(lib.allLoadedSelected(all, []), false, 'nothing loaded is not "all selected"')
	eq(lib.toggleAllLoaded(all, ORDER), lib.emptySelection, 'the toolbar checkbox clears when everything is selected')
	eq(setOf(lib.toggleAllLoaded(lib.toggleSelection(lib.emptySelection, 'a', { range: false, order: ORDER }), ORDER)).length, 6)
})

await check('selection: "all matching" is its own mode, ended by touching a card, and extended as pages load', () => {
	let s = lib.selectAllMatching(lib.emptySelection, ORDER.slice(0, 3), 312)
	eq(s.allMatching, true)
	eq(s.matchTotal, 312)
	eq(setOf(s), ['a', 'b', 'c'], 'the loaded cards show chosen')
	s = lib.extendAllMatching(s, ['d', 'e'])
	eq(setOf(s), ['a', 'b', 'c', 'd', 'e'], 'more pages are part of it')
	eq(lib.extendAllMatching(lib.emptySelection, ['x']), lib.emptySelection, 'but not when it is off')
	eq(lib.allLoadedSelected(s, ORDER.slice(0, 3)), true)
	const touched = lib.toggleSelection(s, 'b', { range: false, order: ORDER })
	eq(touched.allMatching, false, 'unchecking one card ends "all matching"')
	eq(touched.matchTotal, 0)
	eq(setOf(touched), ['a', 'c', 'd', 'e'], 'and leaves the loaded cards minus that one')
	eq(lib.selectAllLoaded(s, ORDER).allMatching, false)
})

await check('selection: cleared when q, folder or deep change, but NOT when sort changes', () => {
	const f = hex(9)
	const chosen = lib.toggleSelection(lib.emptySelection, 'a', { range: false, order: ORDER })
	const base = { q: 'kitchen', folder: f, deep: true, sort: 'oldest' }
	const same = lib.selectionAfterParamsChange(base, { ...base }, chosen)
	assert(same === chosen, 'no change keeps the very same selection')
	eq(lib.selectionAfterParamsChange(base, { ...base, q: 'bath' }, chosen), lib.emptySelection, 'q')
	eq(lib.selectionAfterParamsChange(base, { ...base, folder: hex(8) }, chosen), lib.emptySelection, 'folder')
	eq(lib.selectionAfterParamsChange(base, { ...base, folder: undefined, deep: undefined }, chosen), lib.emptySelection, 'folder removed')
	eq(lib.selectionAfterParamsChange(base, { ...base, deep: false }, chosen), lib.emptySelection, 'deep')
	assert(lib.selectionAfterParamsChange(base, { ...base, sort: 'name' }, chosen) === chosen, 'sort keeps it')
	assert(lib.selectionAfterParamsChange(base, { ...base, sort: undefined }, chosen) === chosen, 'sort removed keeps it')
	const matching = lib.selectAllMatching(lib.emptySelection, ORDER, 300)
	eq(lib.selectionAfterParamsChange(base, { ...base, q: 'x' }, matching), lib.emptySelection, 'allMatching ends too')
	assert(lib.selectionAfterParamsChange(base, { ...base, q: 'x' }, lib.emptySelection) === lib.emptySelection)
})

await check('selection: "select all matching" is offered only when exact: not truncated, not relaxed, within the bulk cap', () => {
	const ok = { total: 312, truncated: false, dropped: [] }
	eq(lib.canSelectAllMatching(ok), true)
	eq(lib.canSelectAllMatching({ ...ok, truncated: true }), false, 'a lower bound is not a set')
	eq(lib.canSelectAllMatching({ ...ok, dropped: ['sink'] }), false, 'a relaxed result is not what was typed')
	eq(lib.canSelectAllMatching({ ...ok, total: MEDIA_LIMITS.bulkSearchCap }), true, 'exactly the cap')
	eq(lib.canSelectAllMatching({ ...ok, total: MEDIA_LIMITS.bulkSearchCap + 1 }), false, 'over the cap is refused, never truncated')
	eq(lib.canSelectAllMatching({ ...ok, total: 0 }), false)
	eq(lib.canSelectAllMatching({ ...ok, total: Number.NaN }), false)
	eq(lib.canSelectAllMatching({ ...ok, total: Number.POSITIVE_INFINITY }), false)
	eq(lib.canSelectAllMatching({ ...ok, total: 1 }), true)
})

await check('selection: a bulk target is the chosen ids, or the search the results were made for plus expect', () => {
	const key = { q: 'tag:kitchen', folder: hex(9), deep: true }
	const ids = lib.toggleSelection(lib.emptySelection, 'a', { range: false, order: ORDER })
	eq(lib.bulkTargetFor(ids, key, 312), { ids: ['a'] })
	const matching = lib.selectAllMatching(ids, ORDER, 312)
	eq(lib.bulkTargetFor(matching, key, 999), { search: { q: 'tag:kitchen', folder: hex(9), deep: true, expect: 312 } }, 'expect is the total the person saw, not the live one')
	eq(lib.bulkTargetFor(matching, { q: '' }, 312), { search: { q: '', expect: 312 } }, 'no folder, no deep')
	eq(lib.chunkIds(Array.from({ length: 1200 }, (_, i) => i), MEDIA_LIMITS.bulkIdsCap).map((c) => c.length), [500, 500, 200])
	eq(lib.chunkIds([], 500), [])
	// What a prune and a removal leave behind.
	const sel = lib.toggleSelection(lib.toggleSelection(lib.emptySelection, 'a', { range: false, order: ORDER }), 'c', { range: false, order: ORDER })
	eq(setOf(lib.pruneSelection(sel, new Set(['a', 'z']))), ['a'])
	assert(lib.pruneSelection(sel, new Set(['a', 'c'])) === sel, 'nothing to prune keeps the selection')
	eq(lib.pruneSelection(lib.selectAllMatching(sel, ORDER, 9), new Set(ORDER)).allMatching, false)
	eq(setOf(lib.removeFromSelection(sel, new Set(['a']))), ['c'])
	eq(lib.removeFromSelection(sel, new Set(['a'])).anchor, 'c')
	assert(lib.removeFromSelection(sel, new Set(['zzz'])) === sel)
})

/* ========================================================================== */
/* The stale-response gate                                                    */
/* ========================================================================== */

await check('gate: a stale response can never overwrite a newer one, whichever order they resolve in', async () => {
	for (const order of [['A', 'B'], ['B', 'A']]) {
		const gate = lib.createRequestGate()
		let shown = null
		const resolvers = {}
		const start = (label) => {
			const ticket = gate.begin()
			return new Promise((resolve) => {
				resolvers[label] = () => {
					if (ticket.isCurrent()) shown = label
					resolve()
				}
			})
		}
		const a = start('A')
		assert(!resolvers.B)
		const b = start('B')
		for (const label of order) resolvers[label]()
		await Promise.all([a, b])
		eq(shown, 'B', `order ${order.join(',')}`)
	}
	const gate = lib.createRequestGate()
	const first = gate.begin()
	const second = gate.begin()
	assert(first.signal.aborted, 'beginning a request aborts the one before')
	assert(!first.isCurrent())
	assert(second.isCurrent() && !second.signal.aborted)
	gate.cancel()
	assert(second.signal.aborted && !second.isCurrent(), 'cancel makes everything stale')
	const third = gate.begin()
	assert(third.isCurrent() && third.id > second.id)
})

/* ========================================================================== */
/* Optimistic edits and rollback                                              */
/* ========================================================================== */

const pathOf = (id) => (id === ACME.id ? ACME.path : id === null ? '' : 'Elsewhere')
const slugs = (a) => a.tags.map((t) => `${t.slug}:${t.source}`)

await check('optimistic: tags show at once (a kept automatic tag becomes manual) and a failed edit puts them back', () => {
	const base = asset(1, {
		tags: [
			{ slug: 'old', label: 'Old', source: 'manual' },
			{ slug: 'auto-one', label: 'Auto one', source: 'auto', via: 'vision', confidence: 0.9 },
			{ slug: 'auto-two', label: 'Auto two', source: 'auto', via: 'vision', confidence: 0.8 },
		],
	})
	const edit = lib.optimisticPatch(base, { addTags: ['New Tag', 'auto one'], removeTags: ['old', 'auto-two'] }, pathOf)
	eq(slugs(edit.next), ['auto-one:manual', 'new-tag:manual'], 'manual first; kept; removed gone')
	eq(edit.next.tags[1].label, 'New Tag', 'the label as typed')
	eq(slugs(edit.undo(edit.next)), ['old:manual', 'auto-one:auto', 'auto-two:auto'], 'rolled back exactly')
	eq(edit.undo(edit.next).tags.find((t) => t.slug === 'auto-one').confidence, 0.9, 'the automatic tag is the original, not a copy of the kept one')
	eq(base.tags.length, 3, 'the original was not mutated')
	assert(edit.next !== base)
})

await check('optimistic: a rollback restores only the fields the failed edit set, and only if nothing newer replaced them', () => {
	const base = asset(1, { name: 'Original', caption: 'cap', notes: 'n', altText: 'a' })
	const first = lib.optimisticPatch(base, { name: 'First' }, pathOf)
	const second = lib.optimisticPatch(first.next, { name: 'Second', caption: 'new caption' }, pathOf)
	// The first edit fails after the second was applied: the later name survives.
	const afterFirstFails = first.undo(second.next)
	eq(afterFirstFails.name, 'Second')
	eq(afterFirstFails.caption, 'new caption')
	// The second fails: the name goes back to what the first left, the caption to the original.
	const afterSecondFails = second.undo(second.next)
	eq(afterSecondFails.name, 'First')
	eq(afterSecondFails.caption, 'cap')
	eq(afterSecondFails.notes, 'n')
	// A field the edit never touched is never restored.
	const tagOnly = lib.optimisticPatch(base, { addTags: ['x'] }, pathOf)
	eq(tagOnly.undo({ ...tagOnly.next, name: 'Changed meanwhile' }).name, 'Changed meanwhile')
})

await check('optimistic: a rename is trimmed like the server will, an empty name is ignored, and a move carries its path', () => {
	const base = asset(1, { name: 'Original', folderId: null, folderPath: '' })
	eq(lib.optimisticPatch(base, { name: '  Spaced  ' }, pathOf).next.name, 'Spaced')
	eq(lib.optimisticPatch(base, { name: '   ' }, pathOf).next.name, 'Original', 'the field refuses an empty name; so does the preview')
	eq(lib.optimisticPatch(base, { caption: '   ' }, pathOf).next.caption, '', 'other fields may be cleared')
	const move = lib.optimisticPatch(base, { folderId: ACME.id }, pathOf)
	eq([move.next.folderId, move.next.folderPath], [ACME.id, ACME.path])
	eq([move.undo(move.next).folderId, move.undo(move.next).folderPath], [null, ''])
	const back = lib.optimisticPatch(move.next, { folderId: null }, pathOf)
	eq([back.next.folderId, back.next.folderPath], [null, ''], 'to Unfiled')
	// Moved again by something newer: the older failure does not drag it back.
	const newer = { ...move.next, folderId: hex(77), folderPath: 'Elsewhere' }
	eq(move.undo(newer).folderId, hex(77))
})

await check('optimistic: hostile tag labels change nothing that the server would refuse', () => {
	const base = asset(1)
	for (const label of ['', '   ', '!!!', '\u0000\u0001', '\u200b\u200b', '---']) {
		const edit = lib.optimisticPatch(base, { addTags: [label] }, pathOf)
		eq(slugs(edit.next), ['kitchen:manual'], `label ${JSON.stringify(label)}`)
	}
	const long = lib.optimisticPatch(base, { addTags: ['x'.repeat(200)] }, pathOf)
	assert(long.next.tags.at(-1).label.length <= MEDIA_LIMITS.tagLabelMax, 'cut to the label limit')
	const dup = lib.optimisticPatch(base, { addTags: ['Kitchen', 'kitchen', 'KITCHEN'] }, pathOf)
	eq(slugs(dup.next), ['kitchen:manual'], 'a tag already there is not doubled')
	const gone = lib.optimisticPatch(base, { removeTags: ['not-there'] }, pathOf)
	eq(slugs(gone.next), ['kitchen:manual'])
	eq(slugs(gone.undo(gone.next)), ['kitchen:manual'])
	const none = lib.optimisticPatch(base, {}, pathOf)
	eq(none.next, base)
})

await check('optimistic: the server answer is the truth but keeps the card\'s own "matched" note', () => {
	const current = asset(1, { match: { score: 5, fields: ['tag'] } })
	const server = asset(1, { name: 'From server' })
	const merged = lib.mergeServerAsset(current, server)
	eq(merged.name, 'From server')
	eq(merged.match, { score: 5, fields: ['tag'] })
	eq(lib.mergeServerAsset(undefined, server), server)
	const withMatch = asset(1, { match: { score: 1, fields: ['name'] } })
	eq(lib.mergeServerAsset(current, withMatch).match, { score: 1, fields: ['name'] }, 'the server may bring one')
	// And the list helpers.
	const list = [asset(1), asset(2), asset(3)]
	eq(lib.replaceAsset(list, asset(2, { name: 'Two' })).map((a) => a.name), ['Kitchen 1', 'Two', 'Kitchen 3'])
	assert(lib.replaceAsset(list, asset(99)) === list, 'an asset that is not there changes nothing')
	eq(lib.removeAssets(list, new Set([hex(1), hex(3)])).map((a) => a.id), [hex(2)])
	assert(lib.removeAssets(list, new Set()) === list)
	eq(lib.dedupeById([asset(1), asset(2, { name: 'dup' }), asset(1, { name: 'second copy' })]).map((a) => a.name), ['Kitchen 1', 'dup'], 'the first is kept')
	eq(lib.dedupeById([null, undefined, { id: 5 }, asset(1)]).map((a) => a.id), [hex(1)], 'junk rows are dropped, not thrown on')
	eq(lib.appendPage([asset(1), asset(2)], [asset(2), asset(3)]).map((a) => a.id), [hex(1), hex(2), hex(3)])
	eq(lib.countTags([asset(1), asset(2, { tags: [{ slug: 'a', label: 'A', source: 'manual' }, { slug: 'kitchen', label: 'Kitchen', source: 'auto' }] })]), [
		{ slug: 'kitchen', label: 'Kitchen', count: 2 },
		{ slug: 'a', label: 'A', count: 1 },
	])
})

/* ========================================================================== */
/* Query surgery                                                              */
/* ========================================================================== */

await check('query: a chip is cut from the text in the box even when the box moved on from the committed query', () => {
	const committed = 'tag:kitchen color:blue'
	const chips = parseQuery(committed).chips
	const kitchen = chips.find((c) => c.clause === 'tag:kitchen')
	eq(lib.removeChipFromQuery(committed, kitchen), 'color:blue')
	eq(lib.removeChipFromQuery('sink tag:kitchen color:blue plus', kitchen), 'sink color:blue plus', 'offsets of the old text do not apply to the new')
	eq(lib.removeChipFromQuery('color:blue', kitchen), 'color:blue', 'a clause that is gone removes nothing')
	// Twins: the one at the chip's own position goes.
	const twins = 'tag:a tag:a'
	const [first, second] = parseQuery(twins).chips
	eq(lib.removeChipFromQuery(twins, second), 'tag:a')
	eq(lib.removeChipFromQuery(twins, first), 'tag:a')
	// A negated clause and a positive one with the same words are different chips.
	const mixed = '-tag:a tag:a'
	const [neg, pos] = parseQuery(mixed).chips
	eq(neg.negated && !pos.negated, true)
	eq(lib.removeChipFromQuery(mixed, pos), '-tag:a')
	eq(lib.removeChipFromQuery(mixed, neg), 'tag:a')
	eq(lib.removeChipFromQuery('', kitchen), '')
})

await check('query: a facet click adds a clause (merging type/orientation/kind) or takes one value out', () => {
	eq(lib.toggleFacetClause('tag:kitchen', 'type:png', false), 'tag:kitchen type:png')
	eq(lib.toggleFacetClause('type:png', 'type:jpg', false), 'type:png,jpg', 'a single-valued field merges, it does not AND')
	eq(lib.toggleFacetClause('type:png,jpg', 'type:jpg', true), 'type:png', 'only that value comes out')
	eq(lib.toggleFacetClause('type:png', 'type:png', true), '', 'the last value takes the clause')
	eq(lib.toggleFacetClause('tag:kitchen blue', 'tag:kitchen', true), 'blue')
	eq(lib.toggleFacetClause('tag:kitchen', 'tag:kitchen', false), 'tag:kitchen', 'adding what is there changes nothing')
	eq(lib.toggleFacetClause('blue', 'tag:kitchen', true), 'blue', 'removing what is not there changes nothing')
	eq(lib.toggleFacetClause('color:blue color:green', 'color:blue', true), 'color:green', 'color stays an AND of clauses')
	eq(lib.toggleFacetClause('x', 'junk', true), 'x')
	eq(lib.toggleFacetClause('-tag:kitchen', 'tag:kitchen', true), '-tag:kitchen', 'a negated clause is not "on"')
})

await check('query: a renamed or merged tag rewrites its tag: clauses, keeping stars and signs, leaving the rest alone', () => {
	eq(lib.rewriteTagClause('kitchen tag:van -tag:van,bath* #van', 'van', 'truck'), 'kitchen tag:truck -tag:truck,bath* tag:truck')
	eq(lib.rewriteTagClause('tag:van,truck', 'van', 'truck'), 'tag:truck', 'a merge into a tag already listed does not double it')
	eq(lib.rewriteTagClause('tag:van*', 'van', 'truck'), 'tag:truck*')
	eq(lib.rewriteTagClause('tag:vans', 'van', 'truck'), 'tag:vans', 'only the whole slug')
	eq(lib.rewriteTagClause('tag:van OR tag:bath', 'van', 'truck'), 'tag:van OR tag:bath', 'a tag inside an OR is left to the planner\'s redirect')
	eq(lib.rewriteTagClause('tag:van', 'van', 'van'), 'tag:van')
	eq(lib.rewriteTagClause('tag:van', '', 'x'), 'tag:van')
	eq(lib.rewriteTagClause('tag:van', 'van', ''), 'tag:van')
	eq(lib.rewriteTagClause('', 'van', 'truck'), '')
	eq(lib.rewriteTagClause('name:van caption:van van', 'van', 'truck'), 'name:van caption:van van', 'other fields and plain words are not tags')
	const once = lib.rewriteTagClause('tag:van', 'van', 'truck')
	eq(lib.rewriteTagClause(once, 'van', 'truck'), once, 'idempotent')
	eq(lib.stripFolderClauses('folder:Clients tag:a'), 'tag:a')
	eq(lib.stripFolderClauses('-folder:Clients tag:a'), '-folder:Clients tag:a')
	eq(lib.stripFolderClauses('folder:a OR tag:b'), 'folder:a OR tag:b')
	eq(lib.stripFolderClauses('folder:a folder:b tag:c'), 'tag:c')
})

/* ========================================================================== */
/* Keyboard                                                                   */
/* ========================================================================== */

const el = (over = {}) => ({ tagName: 'DIV', getAttribute: () => null, closest: () => null, ...over })
const TARGETS = {
	div: el(),
	button: el({ tagName: 'BUTTON' }),
	body: null,
	input: el({ tagName: 'INPUT' }),
	textarea: el({ tagName: 'TEXTAREA' }),
	select: el({ tagName: 'SELECT' }),
	contentEditable: el({ isContentEditable: true }),
	combobox: el({ getAttribute: (n) => (n === 'role' ? 'combobox' : null) }),
	insideCombobox: el({ closest: (s) => (s.includes('[role="combobox"]') ? {} : null) }),
	insideContentEditable: el({ closest: (s) => (s.includes('[contenteditable="true"]') ? {} : null) }),
	insideDialog: el({ closest: (s) => (s.includes('[role="dialog"]') ? {} : null) }),
	insideTree: el({ closest: (s) => (s.includes('[role="tree"]') ? {} : null) }),
}
const KEY_CTX = { detailOpen: false, modalOpen: false, hasSelection: true, selecting: false, hasAssets: true, canDelete: true }
const press = (key, over = {}, ctx = {}, target = TARGETS.div) =>
	lib.decideKeyAction({ key, target, ...over }, { ...KEY_CTX, ...ctx })

await check('keys: / focuses the search, Esc closes the detail then clears the selection, Ctrl/Cmd+A selects loaded, Delete asks', () => {
	eq(press('/'), 'focus-search')
	eq(press('Escape', {}, { hasSelection: false, selecting: false }), null, 'nothing to do')
	eq(press('Escape'), 'clear-selection')
	eq(press('Escape', {}, { hasSelection: false, selecting: true }), 'clear-selection', 'selection mode alone is cleared too')
	eq(press('Escape', {}, { detailOpen: true }), 'close-detail', 'the detail closes before the selection is touched')
	eq(press('a', { ctrlKey: true }), 'select-all')
	eq(press('A', { metaKey: true }), 'select-all')
	eq(press('a'), null, 'a bare a is typing')
	eq(press('a', { ctrlKey: true }, { hasAssets: false }), null, 'nothing loaded: leave the browser\'s select-all alone')
	eq(press('Delete'), 'delete')
	eq(press('x'), null)
	eq(press('Backspace'), null, 'only Delete')
	eq(press('Enter'), null)
})

await check('keys: every one ignores an event whose target is an input, textarea, contenteditable or role=combobox', () => {
	const typing = ['input', 'textarea', 'select', 'contentEditable', 'combobox', 'insideCombobox', 'insideContentEditable']
	const keys = [['/'], ['Escape'], ['a', { ctrlKey: true }], ['a', { metaKey: true }], ['Delete'], ['Escape', {}, { detailOpen: true }]]
	for (const name of typing)
		for (const [key, over, ctx] of keys)
			eq(press(key, over, ctx, TARGETS[name]), null, `${key} in ${name}`)
	// The same keys do work from a button, the page body and nothing at all.
	for (const name of ['div', 'button', 'body'])
		eq(press('/', {}, {}, TARGETS[name]), 'focus-search', `/ from ${name}`)
	// Duck typing never throws on odd targets.
	for (const odd of [undefined, null, 5, 'x', {}, { closest: () => { throw new Error('boom') } }, { getAttribute: () => { throw new Error('boom') } }])
		eq(typeof (() => { try { return lib.isEditableTarget(odd) } catch { return 'threw' } })(), 'boolean', `odd target ${String(odd)}`)
	assert(lib.isEditableTarget({ role: 'x', getAttribute: (n) => (n === 'role' ? 'textbox' : null) }) === true)
	assert(lib.isEditableTarget({ tagName: 'DIV', getAttribute: (n) => (n === 'role' ? ' Combobox extra' : null) }) === true, 'a role token list, any case')
})

await check('keys: a key another layer used, a composition, a held key, a dialog or the tree are left alone', () => {
	eq(press('/', { defaultPrevented: true }), null, 'a dialog\'s Esc or the tree\'s own key')
	eq(press('Escape', { defaultPrevented: true }, { detailOpen: true }), null, 'the sheet already closed itself')
	eq(press('/', { isComposing: true }), null)
	eq(press('Delete', { repeat: true }), null, 'a held Delete does not re-open the confirmation')
	eq(press('/', {}, { modalOpen: true }), null)
	eq(press('Delete', {}, { modalOpen: true }), null)
	eq(press('Escape', {}, { modalOpen: true }), null)
	for (const key of ['/', 'Delete', 'Escape'])
		eq(press(key, {}, {}, TARGETS.insideDialog), null, `${key} inside a dialog`)
	for (const key of ['/', 'Delete', 'Escape'])
		eq(press(key, {}, {}, TARGETS.insideTree), null, `${key} inside the tree`)
	eq(press('/', { ctrlKey: true }), null)
	eq(press('/', { metaKey: true }), null)
	eq(press('/', { altKey: true }), null)
	eq(press('Escape', { ctrlKey: true }), null)
	eq(press('a', { ctrlKey: true, shiftKey: true }), null)
	eq(press('a', { ctrlKey: true, altKey: true }), null)
	eq(press('Delete', { shiftKey: true }), 'delete', 'Shift+Delete is still Delete')
	eq(press('/', { shiftKey: true }), 'focus-search', 'on layouts where / needs Shift')
})

await check('keys: Delete also needs the permission and something selected; with the sheet open nothing else belongs to the page', () => {
	eq(press('Delete', {}, { canDelete: false }), null, 'no permission')
	eq(press('Delete', {}, { hasSelection: false }), null, 'nothing selected')
	eq(press('Delete', {}, { hasSelection: false, selecting: true }), null, 'selection mode with nothing chosen is not a selection')
	eq(press('Delete', {}, { detailOpen: true }), null, 'the sheet has its own delete button')
	eq(press('/', {}, { detailOpen: true }), null)
	eq(press('a', { ctrlKey: true }, { detailOpen: true }), null)
	for (const key of ['/', 'Delete', 'Escape', 'a', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', ' '])
		assert(press(key, {}, { canDelete: false, hasSelection: false, selecting: false, hasAssets: false }) !== 'delete')
	// Arrow keys in the detail panel get the same guard, and are the panel's own business.
	eq(press('ArrowLeft'), null)
	eq(press('ArrowRight'), null)
})

/* ========================================================================== */
/* Remembered choices and words                                               */
/* ========================================================================== */

await check('storage: recent searches and density survive hostile stored values', () => {
	eq(lib.parseRecent('["kitchen","bath"]'), ['kitchen', 'bath'])
	for (const bad of [null, undefined, 5, {}, '', 'null', '{}', '[1,2]', '[', '["a"', 'undefined', '"x"', '[null,{},[]]', 'x'.repeat(100_000)])
		eq(lib.parseRecent(bad), [], `bad value ${String(bad).slice(0, 20)}`)
	eq(lib.parseRecent('["a","a"," a ","b"]'), ['a', 'b'], 'trimmed and unique')
	eq(lib.parseRecent(JSON.stringify(Array.from({ length: 30 }, (_, i) => `q${i}`))).length, lib.RECENT_MAX)
	eq(lib.parseRecent(JSON.stringify(['x'.repeat(501), 'ok'])), ['ok'], 'longer than a query can be')
	eq(lib.parseRecent('["", "   ", "x"]'), ['x'])
	eq(lib.RECENT_MAX, 8)
	eq(lib.RECENT_KEY, 'rb.media.recent')
	eq(lib.DENSITY_KEY, 'rb.media.density')

	let recent = []
	for (const q of ['a', 'b', 'c', 'a', '  d  ', '', '   ']) recent = lib.pushRecent(recent, q)
	eq(recent, ['d', 'a', 'c', 'b'], 'newest first, a repeat moves to the front, nothing empty')
	for (let i = 0; i < 20; i++) recent = lib.pushRecent(recent, `s${i}`)
	eq(recent.length, 8)
	eq(recent[0], 's19')
	const frozen = Object.freeze(['x'])
	eq(lib.pushRecent(frozen, 'y'), ['y', 'x'], 'never mutates what it was given')
	eq(lib.pushRecent(['x'], 'z'.repeat(501)), ['x'])
	for (const d of ['compact', 'comfortable', 'large']) eq(lib.parseDensity(d), d)
	for (const bad of ['COMPACT', 'huge', '', null, undefined, 3, {}, ['compact']]) eq(lib.parseDensity(bad), null)
})

await check('words: counts, bulk shortfalls ("38 of 40"), the scope of an action and the delete warning', () => {
	eq(lib.describeResultCount(0, false), 'No results')
	eq(lib.describeResultCount(1, false), '1 result')
	eq(lib.describeResultCount(312, false), '312 results')
	eq(lib.describeResultCount(1284, false), '1,284 results')
	eq(lib.describeResultCount(5000, true), 'At least 5,000 results')
	for (const bad of [-3, Number.NaN, undefined, null]) eq(lib.describeResultCount(bad, false), 'No results')

	const actions = ['move', 'addTags', 'removeTags', 'delete', 'retag', 'acceptAutoTags']
	for (const action of actions) {
		const full = lib.describeBulkResult(action, 40, 40)
		eq(full.tone, 'info', `${action} full`)
		assert(/40/.test(full.text) && !/ of /.test(full.text), `${action} full text: ${full.text}`)
		const short = lib.describeBulkResult(action, 40, 38)
		eq(short.tone, 'warn', `${action} short`)
		assert(short.text.includes('38 of 40'), `${action} says "38 of 40": ${short.text}`)
		const none = lib.describeBulkResult(action, 40, 0)
		eq(none.tone, 'warn', `${action} none`)
		assert(!/\b0 of\b/.test(none.text) && none.text.length > 15, `${action} none text: ${none.text}`)
	}
	eq(lib.describeBulkResult('delete', 1, 1).text, 'Deleted 1 image.')
	eq(lib.describeBulkResult('move', 3, 3).text, 'Moved 3 images.')

	const spec = lib.describeSelectionScope({ allMatching: true, count: 5, total: 312, q: 'tag:kitchen', folderLabel: 'Clients/Acme', deep: false })
	assert(spec.includes('all 312 images matching tag:kitchen in Clients/Acme'), spec)
	eq(lib.describeSelectionScope({ allMatching: true, count: 5, total: 312, q: 'tag:kitchen', folderLabel: 'Clients/Acme', deep: true }), 'all 312 images matching tag:kitchen in Clients/Acme and its subfolders')
	eq(lib.describeSelectionScope({ allMatching: true, count: 5, total: 1284, q: '', folderLabel: null, deep: false }), 'all 1,284 images in your library')
	eq(lib.describeSelectionScope({ allMatching: true, count: 5, total: 12, q: '', folderLabel: 'Unfiled', deep: false }), 'all 12 images in Unfiled')
	eq(lib.describeSelectionScope({ allMatching: true, count: 5, total: 1, q: 'x', folderLabel: null, deep: false }), 'all 1 image matching x')
	eq(lib.describeSelectionScope({ allMatching: false, count: 3, total: 312, q: 'x', folderLabel: null, deep: false }), 'the 3 images you selected')
	eq(lib.describeSelectionScope({ allMatching: false, count: 1, total: 312, q: '', folderLabel: null, deep: false }), 'the 1 image you selected')
	assert(/permanent/i.test(lib.DELETE_WARNING) && /site/.test(lib.DELETE_WARNING) && /stop showing/.test(lib.DELETE_WARNING), lib.DELETE_WARNING)

	eq(lib.joinWords([]), '')
	eq(lib.joinWords(['a']), 'a')
	eq(lib.joinWords(['a', 'b'], 'or'), 'a or b')
	eq(lib.joinWords(['a', 'b', 'c']), 'a, b and c')
	eq(
		lib.describeSearchOutcome({ total: 0, truncated: false, dropped: ['sink'], corrections: [{ from: 'kithcen', to: 'kitchen' }] }),
		'No results. No images mention sink. Showing results for kitchen.',
	)
	eq(lib.describeSearchOutcome({ total: 5, truncated: false, dropped: [], corrections: [] }), '5 results.')
	eq(lib.messageOf(new Error('  Boom  ')), 'Boom')
	eq(lib.messageOf(new Error('')), 'Something went wrong. Try again.')
	eq(lib.messageOf('text'), 'Something went wrong. Try again.')
	eq(lib.messageOf(new Error('x'.repeat(900))).length, 300)
})

/* ========================================================================== */
/* Fakes for time, the browser and the API                                    */
/* ========================================================================== */

function createClock(start = 1_000_000) {
	let now = start
	let seq = 0
	const timers = new Map()
	return {
		now: () => now,
		setTimeout(fn, ms) {
			const id = ++seq
			timers.set(id, { id, at: now + Math.max(0, Math.floor(ms)), fn })
			return id
		},
		clearTimeout(id) {
			timers.delete(id)
		},
		/** Moves time forward, firing every timer on the way in order and letting promises settle after each. */
		async advance(ms) {
			const end = now + ms
			await flush()
			let fired = 0
			for (;;) {
				const due = [...timers.values()]
					.filter((timer) => timer.at <= end)
					.sort((a, b) => a.at - b.at || a.id - b.id)[0]
				if (!due) break
				// A page that re-arms a zero-delay timer for ever would hang the proof, and a real browser.
				if (++fired > 2000) throw new Error('timer storm: something keeps scheduling itself with no delay')
				timers.delete(due.id)
				now = Math.max(now, due.at)
				due.fn()
				await flush()
			}
			now = end
			await flush()
		},
		get pending() {
			return timers.size
		},
	}
}

function createEnv(clock, { search = '', pathname = '/account/media', hash = '' } = {}) {
	const loc = { search, hash, hidden: false }
	const writes = []
	const popListeners = new Set()
	const visibilityListeners = new Set()
	const storage = new Map()
	const land = (url) => {
		const parsed = new URL(url, 'http://localhost')
		loc.search = parsed.search
		loc.hash = parsed.hash
	}
	return {
		loc,
		writes,
		storage,
		get listeners() {
			return popListeners.size + visibilityListeners.size
		},
		location: () => ({ pathname, search: loc.search, hash: loc.hash }),
		replaceUrl(url) {
			writes.push(['replace', url])
			land(url)
		},
		pushUrl(url) {
			writes.push(['push', url])
			land(url)
		},
		onPopState(listener) {
			popListeners.add(listener)
			return () => popListeners.delete(listener)
		},
		readStorage: (key) => (storage.has(key) ? storage.get(key) : null),
		writeStorage: (key, value) => void storage.set(key, value),
		hidden: () => loc.hidden,
		onVisibilityChange(listener) {
			visibilityListeners.add(listener)
			return () => visibilityListeners.delete(listener)
		},
		setTimeout: clock.setTimeout,
		clearTimeout: clock.clearTimeout,
		now: clock.now,
		/** The browser's Back: the URL is already what it was, then popstate fires. */
		popTo(searchString) {
			loc.search = searchString
			for (const listener of [...popListeners]) listener()
		},
		setHidden(hidden) {
			loc.hidden = hidden
			for (const listener of [...visibilityListeners]) listener()
		},
	}
}

/** A handler for one API method whose answers are decided by the test, one call at a time. */
function manual({ ignoreAbort = false } = {}) {
	const items = []
	const handler = (...args) => {
		const signal = args.find((arg) => typeof AbortSignal !== 'undefined' && arg instanceof AbortSignal)
		const item = { args, signal, settled: false }
		item.promise = new Promise((resolve, reject) => {
			item.resolve = (value) => {
				item.settled = true
				resolve(value)
			}
			item.reject = (error) => {
				item.settled = true
				reject(error)
			}
		})
		// A fetch that honours its signal rejects when aborted; one that ignores it answers anyway.
		if (!ignoreAbort) signal?.addEventListener('abort', () => item.reject(abortError()))
		items.push(item)
		return item.promise
	}
	handler.items = items
	return handler
}

const API_NAMES = [
	'search', 'suggest', 'getAsset', 'patchAsset', 'deleteAsset', 'bulk', 'listTags', 'renameTag',
	'mergeTag', 'deleteTag', 'listFolders', 'createFolder', 'patchFolder', 'deleteFolder', 'listSaved',
	'createSaved', 'deleteSaved', 'process', 'processStatus',
]
function fakeApi(handlers = {}) {
	const calls = []
	const api = { workspaceId: WS, calls, handlers }
	for (const name of API_NAMES)
		api[name] = (...args) => {
			calls.push({ name, args })
			const handler = api.handlers[name]
			if (!handler) return Promise.reject(new Error(`no handler for api.${name}`))
			try {
				return Promise.resolve(handler(...args))
			} catch (error) {
				return Promise.reject(error)
			}
		}
	api.of = (name) => calls.filter((call) => call.name === name)
	return api
}

const apiError = (message, status) => new apiModule.MediaApiError(message, status)

function setup({ initial = baseInitial(), search = '', can = { write: true, delete: true }, handlers = {}, mount = true, searchHandler = manual(), stack = lib } = {}) {
	const clock = createClock()
	const env = createEnv(clock, { search })
	const api = fakeApi({ search: searchHandler, ...handlers })
	const t = { clock, env, api, search: searchHandler, can }
	t.controller = stack.createLibraryController({ initial, can: () => t.can, api, env })
	t.actions = t.controller.actions
	Object.defineProperty(t, 'state', { get: () => t.controller.getState() })
	t.unmount = mount ? t.controller.mount() : () => {}
	return t
}
const lastWrite = (t) => t.env.writes.at(-1)
const lastSearch = (t) => t.search.items.at(-1)
/** The params of the Nth search the API was asked. */
const searchParamsOf = (item) => item.args[0]
const answer = (item, assets, over = {}) => item.resolve(searchResponse(assets, over))

/* ========================================================================== */
/* The AI loop                                                                */
/* ========================================================================== */

const processed = (n, from = 100) => Array.from({ length: n }, (_, i) => ({ id: hex(from + i), status: 'done', asset: asset(from + i, { tagging: { status: 'done' } }) }))
const reply = (over = {}) => ({ processed: processed(2), remaining: 5, configured: true, budgetExhausted: false, ...over })

function loopHarness({ hidden = false } = {}) {
	const clock = createClock()
	const log = { calls: [], responses: [], stops: [], working: [], errors: [] }
	const queue = []
	const state = { hidden }
	const deps = {
		call(options, signal) {
			log.calls.push({ at: clock.now(), options, signal })
			const next = queue.shift()
			if (next === undefined) return Promise.resolve(reply({ remaining: 0, processed: [] }))
			if (typeof next === 'function') return next(signal)
			if (next instanceof Error) return Promise.reject(next)
			return Promise.resolve(next)
		},
		now: clock.now,
		setTimeout: clock.setTimeout,
		clearTimeout: clock.clearTimeout,
		hidden: () => state.hidden,
		onResponse: (response) => log.responses.push(response),
		onWorking: (working) => log.working.push(working),
		onStop: (reason, message) => log.stops.push({ reason, message }),
		onError: (error, fatal) => log.errors.push({ error, fatal }),
	}
	const loop = lib.createAiLoop(deps)
	return { loop, clock, log, queue, state, deps }
}
const gapsOf = (log) => log.calls.slice(1).map((call, i) => call.at - log.calls[i].at)

await check('ai loop: while work remains it asks again, one batch at a time, at least 3 s apart; zero remaining stops it', async () => {
	const t = loopHarness()
	t.queue.push(reply({ remaining: 4 }), reply({ remaining: 2 }), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(0)
	eq(t.log.calls.length, 1, 'the first call is immediate')
	await t.clock.advance(2999)
	eq(t.log.calls.length, 1, 'not before 3 s')
	await t.clock.advance(1)
	eq(t.log.calls.length, 2)
	await t.clock.advance(3000)
	eq(t.log.calls.length, 3)
	eq(gapsOf(t.log), [3000, 3000])
	await t.clock.advance(120_000)
	eq(t.log.calls.length, 3, 'zero remaining ends the loop')
	eq(t.log.stops, [{ reason: 'done', message: undefined }])
	eq(t.log.working, [true, false])
	assert(t.log.calls.every((c) => Object.keys(c.options).length === 0), 'plain polling sends no options')
	eq(t.clock.pending, 0, 'nothing is left scheduled')
})

await check('ai loop: an empty answer waits 10 s, not 3', async () => {
	const t = loopHarness()
	t.queue.push(reply({ processed: [], remaining: 3 }), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(0)
	await t.clock.advance(9999)
	eq(t.log.calls.length, 1, 'still waiting at 9.999 s')
	await t.clock.advance(1)
	eq(t.log.calls.length, 2)
	eq(gapsOf(t.log), [10_000])
})

await check('ai loop: budget exhaustion, a bad key and "not configured" stop it, with the message', async () => {
	for (const [name, answerToGive, reason, message] of [
		['budget', reply({ budgetExhausted: true, remaining: 3 }), 'budget', undefined],
		['config', reply({ blocked: { kind: 'config', message: 'AI credentials were rejected.' }, remaining: 3, processed: [] }), 'blocked', 'AI credentials were rejected.'],
		['unconfigured', reply({ configured: false, remaining: 3, processed: [] }), 'unconfigured', undefined],
	]) {
		const t = loopHarness()
		t.queue.push(answerToGive, reply())
		t.loop.setActive(true)
		await t.clock.advance(0)
		await t.clock.advance(120_000)
		eq(t.log.calls.length, 1, `${name}: one call and no more`)
		eq(t.log.stops, [{ reason, message }], name)
		eq(t.log.working.at(-1), false, `${name}: not working`)
		eq(t.clock.pending, 0, `${name}: nothing scheduled`)
		assert(!t.loop.isActive())
	}
})

await check('ai loop: a rate limit waits what the server said (at least 3 s, at most the cap), then goes on', async () => {
	for (const [asked, expected] of [[20_000, 20_000], [500, 3000], [undefined, 30_000], [10 * 3600_000, MEDIA_LIMITS.aiRetryAfterMaxMs]]) {
		const t = loopHarness()
		t.queue.push(
			reply({ blocked: { kind: 'rate_limited', message: 'busy', ...(asked === undefined ? {} : { retryAfterMs: asked }) }, remaining: 3, processed: [] }),
			reply({ remaining: 0 }),
		)
		t.loop.setActive(true)
		await t.clock.advance(0)
		await t.clock.advance(expected - 1)
		eq(t.log.calls.length, 1, `asked ${asked}: still waiting`)
		await t.clock.advance(1)
		eq(t.log.calls.length, 2, `asked ${asked}: resumed after ${expected}`)
		assert(t.log.stops.every((s) => s.reason !== 'blocked'), 'a rate limit is not a stop')
	}
})

await check('ai loop: errors back off 6, 12, 24, 30, 30 s, a success resets, and 401/403/404 stop for good', async () => {
	eq([1, 2, 3, 4, 5, 9].map(lib.backoffMs), [6000, 12_000, 24_000, 30_000, 30_000, 30_000])
	const t = loopHarness()
	const boom = () => apiError('Server down.', 500)
	t.queue.push(boom(), boom(), boom(), boom(), boom(), reply({ remaining: 2 }), boom(), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(0)
	await t.clock.advance(200_000)
	eq(gapsOf(t.log).slice(0, 5), [6000, 12_000, 24_000, 30_000, 30_000], 'backoff, capped at 30 s')
	eq(gapsOf(t.log)[5], 3000, 'a success returns to the normal pace')
	eq(gapsOf(t.log)[6], 6000, 'and the next error starts the backoff again')
	eq(t.log.errors.filter((e) => e.fatal).length, 0)
	eq(t.log.calls.length, 8)

	for (const status of [401, 403, 404]) {
		const stopped = loopHarness()
		stopped.queue.push(apiError('No.', status), reply())
		stopped.loop.setActive(true)
		await stopped.clock.advance(0)
		await stopped.clock.advance(200_000)
		eq(stopped.log.calls.length, 1, `${status} is not retried`)
		eq(stopped.log.stops, [{ reason: 'fatal', message: undefined }])
		eq(stopped.log.errors.map((e) => e.fatal), [true])
	}
})

await check('ai loop: nothing is sent while the tab is hidden, and it resumes when the tab is back', async () => {
	const t = loopHarness({ hidden: true })
	t.queue.push(reply({ remaining: 5 }), reply({ remaining: 5 }), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(60_000)
	eq(t.log.calls.length, 0, 'started in a background tab: nothing is sent')
	t.state.hidden = false
	t.loop.resume()
	await t.clock.advance(0)
	eq(t.log.calls.length, 1, 'back in view: it goes')
	await t.clock.advance(1000)
	t.state.hidden = true
	t.loop.pause()
	await t.clock.advance(120_000)
	eq(t.log.calls.length, 1, 'hidden again: the scheduled call did not fire')
	t.state.hidden = false
	t.loop.resume()
	await t.clock.advance(0)
	eq(t.log.calls.length, 2, 'the wait was already over, so it goes at once')
	// A call that was in flight when the tab went to the background finishes and nothing more follows.
	const slow = loopHarness()
	let release
	slow.queue.push(() => new Promise((resolve) => (release = () => resolve(reply({ remaining: 5 })))))
	slow.loop.setActive(true)
	await slow.clock.advance(0)
	slow.state.hidden = true
	slow.loop.pause()
	release()
	await slow.clock.advance(120_000)
	eq(slow.log.calls.length, 1)
	eq(slow.log.responses.length, 1, 'its answer is still used')
})

await check('ai loop: starting twice does not double the calls, and stopping aborts and ignores a late answer', async () => {
	const t = loopHarness()
	let release
	let seenSignal
	t.queue.push((signal) => {
		seenSignal = signal
		return new Promise((resolve) => (release = () => resolve(reply({ remaining: 5 }))))
	}, reply({ remaining: 0 }))
	t.loop.setActive(true)
	t.loop.setActive(true)
	t.loop.setActive(true)
	await t.clock.advance(0)
	eq(t.log.calls.length, 1)
	assert(t.loop.isBusy(), 'a batch is in flight')
	await t.clock.advance(60_000)
	eq(t.log.calls.length, 1, 'one batch at a time: nothing overlaps')
	t.loop.setActive(false)
	assert(seenSignal.aborted, 'stopping aborts the request')
	release()
	await t.clock.advance(60_000)
	eq(t.log.responses.length, 0, 'a late answer is ignored')
	eq(t.log.calls.length, 1)
	eq(t.clock.pending, 0)
	// And it can start again afterwards.
	t.loop.setActive(true)
	await t.clock.advance(0)
	eq(t.log.calls.length, 2)
})

await check('ai loop: a call that was aborted still counts for the spacing, so a restart cannot hammer the server', async () => {
	const t = loopHarness()
	t.queue.push(() => new Promise(() => {}), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(0)
	eq(t.log.calls.length, 1)
	// The request is out; the page leaves and comes back (or the role flickers) a moment later.
	t.loop.setActive(false)
	t.loop.setActive(true)
	await t.clock.advance(2999)
	eq(t.log.calls.length, 1, 'not within 3 s of the call that was aborted: the server may still be on it')
	await t.clock.advance(1)
	eq(t.log.calls.length, 2)
	eq(gapsOf(t.log), [3000])
	// A pause that does not abort (the batch lands) is not an abort, and an idle stop owes nothing.
	const idle = loopHarness()
	idle.queue.push(reply({ remaining: 0 }))
	idle.loop.setActive(true)
	idle.loop.setActive(false)
	idle.loop.setActive(true)
	await idle.clock.advance(0)
	eq(idle.log.calls.length, 1, 'nothing was ever sent, so nothing to wait for')
})

await check('ai loop: a kick that was cancelled before it went out leaves the spacing as it was, and is not replayed', async () => {
	const t = loopHarness()
	t.queue.push(reply({ remaining: 5 }), reply({ remaining: 5 }), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(0)
	eq(t.log.calls.length, 1)
	t.loop.kick({ requeue: true })
	t.loop.setActive(false)
	t.loop.setActive(true)
	await t.clock.advance(2999)
	eq(t.log.calls.length, 1, 'the ask was cancelled, so the normal 3 s wait stands')
	await t.clock.advance(1)
	eq(t.log.calls.length, 2)
	eq(t.log.calls[1].options, {}, 'and the cancelled ask is not replayed')
	// An ask that stands still goes at once, once, whatever the wait was.
	t.loop.kick({ requeue: true })
	await t.clock.advance(0)
	eq(t.log.calls.length, 3)
	eq(t.log.calls[2].options, { requeue: true })
})

await check('ai loop: an ask made while a call is out goes as soon as that call answers, even when it says nothing is left', async () => {
	const t = loopHarness()
	let release
	t.queue.push(() => new Promise((resolve) => (release = () => resolve(reply({ remaining: 0 })))), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(0)
	eq(t.log.calls.length, 1)
	assert(!t.loop.hasAsk(), 'a plain poll is not an ask')
	t.loop.kick({ requeue: true })
	assert(t.loop.hasAsk(), 'the ask is waiting for the call in flight')
	release()
	await t.clock.advance(0)
	eq(t.log.calls.length, 2, 'the first answer said "nothing left", but a person asked: it goes at once')
	eq(t.log.calls[1].options, { requeue: true })
	await t.clock.advance(60_000)
	eq(t.log.calls.length, 2)
	eq(t.log.stops, [{ reason: 'done', message: undefined }], 'and the loop ends once, after the ask was served')
	assert(!t.loop.hasAsk())

	// While the call that carries the ask is out, the ask still counts: the loop is wanted.
	const carrying = loopHarness()
	let finish
	carrying.queue.push(() => new Promise((resolve) => (finish = () => resolve(reply({ remaining: 0 })))))
	carrying.loop.kick({ requeue: true })
	await carrying.clock.advance(0)
	eq(carrying.log.calls.length, 1)
	assert(carrying.loop.hasAsk(), 'the call in flight is the ask')
	finish()
	await carrying.clock.advance(0)
	assert(!carrying.loop.hasAsk(), 'served')
})

await check('ai loop: stopping for any reason drops an ask that had not gone out, so a later start does not replay it', async () => {
	const t = loopHarness()
	let release
	t.queue.push(() => new Promise((resolve) => (release = () => resolve(reply({ budgetExhausted: true, remaining: 4 })))), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(0)
	t.loop.kick({ requeue: true })
	release()
	await t.clock.advance(0)
	eq(t.log.stops.map((s) => s.reason), ['budget'], 'the budget is spent: that ends it, ask or not')
	assert(!t.loop.hasAsk(), 'the ask went with the loop')
	t.loop.setActive(true)
	await t.clock.advance(60_000)
	eq(t.log.calls.length, 2)
	eq(t.log.calls[1].options, {}, 'a later start is a plain poll')
})

await check('ai loop: leaving the page aborts the call even when the loop was already paused, and a pause alone does not', async () => {
	const t = loopHarness()
	let seen
	t.queue.push((signal) => {
		seen = signal
		return new Promise(() => {})
	})
	t.loop.setActive(true)
	await t.clock.advance(0)
	t.loop.setActive(false, { abort: false })
	assert(!seen.aborted, 'a pause lets the batch land')
	assert(t.loop.isBusy())
	t.loop.setActive(false)
	assert(seen.aborted, 'leaving ends it, though the loop was no longer active')
	assert(!t.loop.isBusy())
	await t.clock.advance(60_000)
	eq(t.log.calls.length, 1)
	eq(t.clock.pending, 0)
})

await check('ai loop: every reader of a count agrees, so a hostile one ends the loop as "done" and never leaves it silently idle', async () => {
	for (const remaining of [0.5, Number.POSITIVE_INFINITY, '3', Number.NaN, -1, undefined, null, 0]) {
		const t = loopHarness()
		t.queue.push(reply({ remaining }), reply({ remaining: 5 }))
		t.loop.setActive(true)
		await t.clock.advance(0)
		await t.clock.advance(60_000)
		eq(t.log.calls.length, 1, `remaining ${String(remaining)}: one call`)
		eq(t.log.stops, [{ reason: 'done', message: undefined }], `remaining ${String(remaining)}: ended, and said so`)
		eq(t.log.working.at(-1), false)
	}
	// A count that is a real number still means "go on".
	const t = loopHarness()
	t.queue.push(reply({ remaining: 2.9 }), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(0)
	await t.clock.advance(3000)
	eq(t.log.calls.length, 2, 'two and a bit is two')
})

await check('ai loop: an explicit kick goes now, with its options once; the page may stop it from onResponse', async () => {
	const t = loopHarness()
	t.queue.push(reply({ remaining: 5 }), reply({ remaining: 5 }), reply({ remaining: 0 }))
	t.loop.setActive(true)
	await t.clock.advance(0)
	t.loop.kick({ requeue: true })
	await t.clock.advance(0)
	eq(t.log.calls.length, 2, 'it did not wait out the 3 s')
	eq(t.log.calls[1].options, { requeue: true })
	await t.clock.advance(3000)
	eq(t.log.calls[2].options, {}, 'the options were for one call')
	// A kick on an idle loop starts it.
	const idle = loopHarness()
	idle.queue.push(reply({ remaining: 0 }))
	idle.loop.kick({ requeue: true })
	await idle.clock.advance(0)
	eq(idle.log.calls.length, 1)
	eq(idle.log.working[0], true)
	// The page decides the loop is done while applying an answer: nothing is scheduled after it.
	const page = loopHarness()
	page.queue.push(reply({ remaining: 5 }), reply())
	page.deps.onResponse = () => page.loop.setActive(false)
	page.loop.setActive(true)
	await page.clock.advance(0)
	await page.clock.advance(60_000)
	eq(page.log.calls.length, 1)
	eq(page.clock.pending, 0)
})

/* ========================================================================== */
/* The controller: mount, typing, races                                       */
/* ========================================================================== */

await check('mount: a URL that matches the server render fetches nothing, keeps the results and writes no history', async () => {
	const t = setup({ search: '' })
	eq(t.api.calls.length, 0)
	eq(t.state.assets.length, 60)
	eq(t.state.loading, false)
	eq(t.env.writes, [], 'reading the URL writes nothing')
	eq(t.env.listeners, 2, 'popstate and visibility are listened to')
	t.unmount()
	eq(t.env.listeners, 0, 'and let go of')
})

await check('mount: a stale initial (the URL says something else) is discarded and page 1 is fetched again, with facets', async () => {
	const t = setup({ search: `?q=kitchen&folder=${ACME.id}&deep=1&sort=oldest` })
	eq(t.search.items.length, 1)
	const params = searchParamsOf(t.search.items[0])
	eq([params.q, params.folder, params.deep, params.sort, params.facets], ['kitchen', ACME.id, true, 'oldest', true])
	assert(!params.offset, 'from the first row')
	eq(t.state.loading, true)
	eq(t.state.assets, [], 'the rendered cards are for another search and are not shown')
	eq(t.state.draft, 'kitchen', 'the box shows the URL\'s search')
	eq(t.state.params, { q: 'kitchen', folder: ACME.id, deep: true, sort: 'oldest' })
	eq(t.env.writes, [], 'the URL already says it')
	answer(t.search.items[0], many(3, {}, 200), { total: 3 })
	await flush()
	eq(t.state.assets.map((a) => a.id), [hex(200), hex(201), hex(202)])
	eq(t.state.loading, false)
	eq(t.state.total, 3)
	assert(t.state.facets !== null && t.state.facets.tags.length === 1, 'facets came with it')
	t.unmount()
})

await check('mount: ?asset= opens the detail; an image that is not loaded is fetched by id; a missing one closes with a message', async () => {
	const inList = setup({ search: `?asset=${hex(3)}` })
	eq(inList.state.openId, hex(3))
	eq(inList.api.calls.length, 0, 'the list is not refetched for ?asset, and an image already loaded needs no fetch')
	eq(lib.selectOpenAsset(inList.state).id, hex(3))
	eq(lib.selectOpenIndex(inList.state), 2)
	inList.unmount()

	const handlers = { getAsset: manual() }
	const missing = setup({ search: `?asset=${hex(999)}`, handlers })
	eq(missing.state.openId, hex(999))
	eq(lib.selectOpenAsset(missing.state), null, 'not shown until it arrives')
	handlers.getAsset.items[0].resolve(asset(999, { name: 'Far away' }))
	await flush()
	eq(lib.selectOpenAsset(missing.state).name, 'Far away')
	eq(lib.selectOpenIndex(missing.state), -1, 'not among the loaded ones, so no position to page from')
	missing.unmount()

	const gone = setup({ search: `?asset=${hex(999)}`, handlers: { getAsset: () => Promise.reject(apiError('Image not found.', 404)) } })
	await flush()
	eq(gone.state.openId, null)
	eq(gone.state.notice?.tone, 'error')
	assert(/could not be found/i.test(gone.state.notice.text), gone.state.notice.text)
	eq(lastWrite(gone), ['replace', '/account/media'], '?asset= is taken out of the URL')
	gone.unmount()
})

await check('typing: the box is current at once, the search waits ~200 ms for a pause, and the URL is REPLACED, never pushed', async () => {
	const t = setup()
	t.actions.setDraft('k')
	await t.clock.advance(100)
	t.actions.setDraft('ki')
	await t.clock.advance(199)
	eq(t.search.items.length, 0, '199 ms after the last key: not yet')
	eq(t.state.draft, 'ki', 'the box never lags')
	eq(t.state.params.q, '', 'the committed search does')
	await t.clock.advance(1)
	eq(t.search.items.length, 1, 'one search for the burst')
	eq(searchParamsOf(lastSearch(t)).q, 'ki')
	eq(searchParamsOf(lastSearch(t)).facets, true)
	eq(t.env.writes, [['replace', '/account/media?q=ki']])
	eq(t.state.loading, true)
	eq(t.state.params.q, 'ki')

	// Back to what is already committed before the pause ends: nothing to do.
	answer(lastSearch(t), many(2), { query: { chips: [], warnings: [], sort: null, hasText: true } })
	await flush()
	t.actions.setDraft('kit')
	await t.clock.advance(50)
	t.actions.setDraft('ki')
	await t.clock.advance(1000)
	eq(t.search.items.length, 1, 'the box says what is already searched')
	// A trailing space is not a different search.
	t.actions.setDraft('ki ')
	await t.clock.advance(1000)
	eq(t.search.items.length, 1)
	assert(t.env.writes.every(([kind]) => kind === 'replace'), 'only replaceState while typing')
	t.unmount()
	eq(t.clock.pending, 0, 'unmounting leaves no timer behind')
})

await check('typing: Enter commits at once, cancelling the pause, and remembers the search (a repeat moves to the front)', async () => {
	const t = setup()
	t.actions.setDraft('kit')
	t.actions.submitDraft('kitchen')
	eq(t.search.items.length, 1, 'no waiting')
	eq(searchParamsOf(lastSearch(t)).q, 'kitchen')
	await t.clock.advance(1000)
	eq(t.search.items.length, 1, 'the pending pause was cancelled')
	eq(JSON.parse(t.env.storage.get('rb.media.recent')), ['kitchen'])
	answer(lastSearch(t), many(1))
	await flush()
	t.actions.submitDraft('bath')
	eq(JSON.parse(t.env.storage.get('rb.media.recent')), ['bath', 'kitchen'])
	answer(lastSearch(t), many(1))
	await flush()
	t.actions.submitDraft('bath')
	eq(t.search.items.length, 2, 'the same search again is not a new request')
	t.actions.submitDraft('kitchen')
	eq(JSON.parse(t.env.storage.get('rb.media.recent')), ['kitchen', 'bath'])
	eq(t.state.recent, ['kitchen', 'bath'])
	const before = t.env.storage.get('rb.media.recent')
	t.actions.submitDraft('')
	eq(t.env.storage.get('rb.media.recent'), before, 'an empty search is not remembered')
	assert(t.env.writes.every(([kind]) => kind === 'replace'))
	t.unmount()
})

await check('typing: Enter on a search that failed retries it', async () => {
	const t = setup()
	t.actions.submitDraft('kitchen')
	lastSearch(t).reject(apiError('Boom.', 500))
	await flush()
	eq(t.state.error, 'Boom.')
	eq(t.search.items.length, 1)
	t.actions.submitDraft('kitchen')
	eq(t.search.items.length, 2, 'Enter is a retry')
	eq(t.state.error, null)
	t.unmount()
})

await check('races: each search carries an abort signal, and a stale response never overwrites a newer one, in either order', async () => {
	// `honours`: the fetch rejects when aborted. `ignores`: it answers anyway, which a real
	// fetch of a cached response or a fake in a test can do; the controller must not care.
	for (const mode of ['honours', 'ignores'])
		for (const order of ['newest-first', 'oldest-first']) {
			const t = setup({ searchHandler: manual({ ignoreAbort: mode === 'ignores' }) })
			t.actions.submitDraft('first')
			const a = t.search.items[0]
			t.actions.submitDraft('second')
			const b = t.search.items[1]
			assert(a.signal.aborted, 'the superseded request was aborted')
			assert(!b.signal.aborted)
			const stale = () => a.resolve(searchResponse(many(9, {}, 700), { total: 9 }))
			const fresh = () => b.resolve(searchResponse(many(2, {}, 500), { total: 2 }))
			if (order === 'newest-first') {
				fresh()
				await flush()
				stale()
			} else {
				stale()
				await flush()
				eq(t.state.loading, true, 'the newer one is still awaited')
				eq(t.state.assets, [], 'and the stale rows are not shown meanwhile')
				fresh()
			}
			await flush()
			eq(t.state.assets.map((x) => x.id), [hex(500), hex(501)], `${mode} ${order}`)
			eq(t.state.total, 2)
			eq(t.state.loading, false)
			eq(t.state.error, null)
			eq(t.state.params.q, 'second')
			t.unmount()
		}
})

await check('races: a response that arrives after unmount changes nothing, and no timer outlives the page', async () => {
	const t = setup({ searchHandler: manual({ ignoreAbort: true }) })
	t.actions.submitDraft('kitchen')
	const item = lastSearch(t)
	const before = t.state
	t.unmount()
	assert(item.signal.aborted, 'unmount aborts what is in flight')
	item.resolve(searchResponse(many(5), { total: 5 }))
	await flush()
	assert(t.state === before, 'the state object itself is untouched')
	eq(t.clock.pending, 0)
})

/* ========================================================================== */
/* The controller: history, the browser, paging, failures                     */
/* ========================================================================== */

const idsOf = (list) => list.map((a) => a.id)
const idRange = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => hex(from + i))
const lastBulk = (t) => t.api.of('bulk').at(-1)?.args[0]
const selectedIds = (t) => [...t.state.selection.ids].sort()

await check('popstate: Back restores the search and the open image from the URL, writes no history and ends the selection', async () => {
	const handlers = { getAsset: (id) => asset(Number.parseInt(id, 16), { name: 'From the URL' }) }
	const t = setup({ handlers })
	t.actions.toggleSelect(hex(2), { range: false })
	t.actions.selectFolder(ACME.id)
	eq(lastWrite(t), ['push', `/account/media?folder=${ACME.id}`], 'a folder change is a new history entry')
	eq(t.state.selection.ids.size, 0, 'the selection belonged to the old results')
	answer(lastSearch(t), many(3, {}, 200), { total: 3 })
	await flush()
	const writes = t.env.writes.length

	// Back to the plain library: the URL is already what it was, then popstate fires.
	t.env.popTo('')
	eq(t.state.params, { q: '' })
	eq(t.state.draft, '')
	eq(t.state.loading, true)
	const restored = searchParamsOf(lastSearch(t))
	eq([restored.q, restored.folder, restored.facets], ['', undefined, true])
	eq(t.env.writes.length, writes, 'restoring writes nothing: that would fork the history')
	answer(lastSearch(t), many(60), { total: 60 })
	await flush()

	// Forward to a search with an image open: the text, the sort and the image all come back.
	t.env.popTo(`?q=kitchen&sort=name&asset=${hex(3)}`)
	eq(t.state.params, { q: 'kitchen', sort: 'name' })
	eq(t.state.draft, 'kitchen', 'the box shows the restored search')
	eq(t.state.openId, hex(3))
	answer(lastSearch(t), many(5), { total: 5 })
	await flush()
	eq(lib.selectOpenAsset(t.state)?.id, hex(3), 'shown once it is known')
	eq(t.env.writes.length, writes)

	// Only the image changed: no new search at all.
	const searches = t.search.items.length
	t.env.popTo(`?q=kitchen&sort=name&asset=${hex(4)}`)
	eq(t.state.openId, hex(4))
	t.env.popTo('?q=kitchen&sort=name')
	eq(t.state.openId, null, 'Back out of the sheet closes it')
	eq(t.search.items.length, searches, 'the list was not refetched for ?asset')

	// A hostile URL (a hand edit, a bad link) degrades to the plain library and never throws.
	t.env.popTo('?q=%E0%A4%A&folder=zzz&deep=maybe&sort=nope&asset=zz')
	assert(typeof t.state.params.q === 'string')
	eq([t.state.params.folder, t.state.params.deep, t.state.params.sort, t.state.openId], [undefined, undefined, undefined, null])
	t.unmount()
	eq(t.env.listeners, 0, 'the popstate listener is gone after unmount')
})

function fakeBrowser({ search = '?q=a', fail = {} } = {}) {
	const calls = []
	const store = new Map()
	const timers = { set: [], cleared: [] }
	const buckets = { window: new Map(), document: new Map() }
	const events = (bucket) => ({
		addEventListener(type, fn) {
			if (!bucket.has(type)) bucket.set(type, new Set())
			bucket.get(type).add(fn)
		},
		removeEventListener(type, fn) {
			bucket.get(type)?.delete(fn)
		},
	})
	const history = {
		state: { __router: 'owned by the framework' },
		pushState(data, unused, url) {
			if (fail.history) throw new Error('SecurityError')
			calls.push(['push', data, url])
		},
		replaceState(data, unused, url) {
			if (fail.history) throw new Error('SecurityError')
			calls.push(['replace', data, url])
		},
	}
	const storage = {
		getItem(key) {
			if (fail.storage) throw new Error('blocked')
			return store.has(key) ? store.get(key) : null
		},
		setItem(key, value) {
			if (fail.storage) throw new Error('quota')
			store.set(key, value)
		},
	}
	const win = {
		location: { pathname: '/account/media', search, hash: '#top' },
		history,
		...events(buckets.window),
		setTimeout(fn, ms) {
			timers.set.push([fn, ms])
			return timers.set.length
		},
		clearTimeout(id) {
			timers.cleared.push(id)
		},
	}
	Object.defineProperty(win, 'localStorage', {
		get() {
			if (fail.storageAccess) throw new Error('SecurityError')
			return storage
		},
	})
	const doc = { visibilityState: 'visible', ...events(buckets.document) }
	return { win, doc, calls, store, timers, history, buckets }
}

function withBrowser(browser, fn) {
	const had = { window: 'window' in globalThis, document: 'document' in globalThis }
	const before = { window: globalThis.window, document: globalThis.document }
	globalThis.window = browser.win
	globalThis.document = browser.doc
	try {
		return fn()
	} finally {
		if (had.window) globalThis.window = before.window
		else delete globalThis.window
		if (had.document) globalThis.document = before.document
		else delete globalThis.document
	}
}

await check('browser env: reads window.location.search, writes history with a fresh {} (never history.state), and a blocked history or storage changes nothing', () => {
	const b = fakeBrowser()
	withBrowser(b, () => {
		const env = lib.browserEnv()
		eq(env.location(), { pathname: '/account/media', search: '?q=a', hash: '#top' })
		env.replaceUrl('/account/media?q=b')
		env.pushUrl('/account/media?folder=x')
		eq(b.calls.map((c) => [c[0], c[2]]), [['replace', '/account/media?q=b'], ['push', '/account/media?folder=x']])
		for (const [, data] of b.calls) {
			eq(data, {}, 'the data argument is an empty object')
			assert(data !== b.history.state, 'never history.state: the framework owns it')
			assert(Object.getPrototypeOf(data) === Object.prototype, 'a plain object')
		}
		assert(b.calls[0][1] !== b.calls[1][1], 'a fresh one for each call')

		eq(env.readStorage('rb.media.density'), null)
		env.writeStorage('rb.media.density', 'large')
		eq(env.readStorage('rb.media.density'), 'large')

		let popped = 0
		const off = env.onPopState(() => popped++)
		for (const fn of b.buckets.window.get('popstate')) fn()
		eq(popped, 1)
		off()
		eq(b.buckets.window.get('popstate').size, 0, 'the listener is removed')

		let changes = 0
		const offVisibility = env.onVisibilityChange(() => changes++)
		for (const fn of b.buckets.document.get('visibilitychange')) fn()
		eq(changes, 1)
		offVisibility()
		eq(b.buckets.document.get('visibilitychange').size, 0)
		eq(env.hidden(), false)
		b.doc.visibilityState = 'hidden'
		eq(env.hidden(), true)
		b.doc.visibilityState = 'prerender'
		eq(env.hidden(), false, 'only "hidden" pauses the AI loop')

		const handle = env.setTimeout(() => {}, 250)
		eq(b.timers.set[0][1], 250)
		env.clearTimeout(handle)
		eq(b.timers.cleared, [handle])
		eq(typeof env.now(), 'number')
	})

	for (const fail of [{ history: true }, { storage: true }, { storageAccess: true }]) {
		const blocked = fakeBrowser({ fail })
		withBrowser(blocked, () => {
			const env = lib.browserEnv()
			env.replaceUrl('/x')
			env.pushUrl('/y')
			eq(env.readStorage('k'), null, JSON.stringify(fail))
			env.writeStorage('k', 'v')
			eq(env.location().search, '?q=a', 'reading the URL still works')
		})
	}
	// Server render: no window, no document. `hidden` must not throw there.
	assert(!('window' in globalThis) && !('document' in globalThis), 'the proof runs without a browser')
	eq(lib.browserEnv().hidden(), false)
})

await check('load more: appends below, de-duplicates by id (the first copy stays) and asks without facets from the row after what was handed over', async () => {
	const t = setup()
	t.actions.loadMore()
	const item = lastSearch(t)
	const first = searchParamsOf(item)
	eq([first.q, first.offset, first.facets], ['', 60, false], 'load-more asks for no facets')
	eq(t.state.loadingMore, true)
	t.actions.loadMore()
	eq(t.search.items.length, 1, 'a second press while one is in flight asks for nothing more')

	// The page overlaps the grid by six rows (offset paging drifts while data changes) and repeats one inside itself.
	const page = [...many(10, { name: 'Second copy' }, 55), asset(58, { name: 'Again' })]
	answer(item, page, { total: 313, hasMore: true })
	await flush()
	const loaded = idsOf(t.state.assets)
	eq(loaded.length, 64)
	eq(loaded.slice(54), idRange(55, 64))
	eq(new Set(loaded).size, loaded.length, 'one card per image')
	eq(t.state.assets[54].name, 'Kitchen 55', 'the first copy is kept')
	eq(t.state.assets[57].name, 'Kitchen 58')
	eq([t.state.total, t.state.loadingMore, t.state.hasMore, t.state.error], [313, false, true, null])
	assert(/Loaded 4 more images/.test(t.state.announcement.text), t.state.announcement.text)
	assert(/64 of 313/.test(t.state.announcement.text), t.state.announcement.text)

	// The server handed over 11 more rows, so the next page starts after those, not after the 64 cards.
	t.actions.loadMore()
	eq(searchParamsOf(lastSearch(t)).offset, 71)
	answer(lastSearch(t), many(2, {}, 100), { total: 313, hasMore: false })
	await flush()
	eq(t.state.hasMore, false)
	t.actions.loadMore()
	eq(t.search.items.length, 2, 'nothing more to load: no request')
	t.unmount()
})

await check('load more: a failure keeps the cards and shows an error with Retry, which tries the same page again', async () => {
	const t = setup()
	t.actions.loadMore()
	lastSearch(t).reject(apiError('The server is busy.', 503))
	await flush()
	eq(t.state.error, 'The server is busy.')
	eq(t.state.assets.length, 60, 'what was loaded stays')
	eq([t.state.loadingMore, t.state.loading, t.state.hasMore], [false, false, true])
	assert(/Could not load images\. The server is busy\./.test(t.state.announcement.text), t.state.announcement.text)
	t.actions.loadMore()
	eq(t.search.items.length, 1, 'no automatic retries while the error is up')
	t.actions.retry()
	eq(t.search.items.length, 2)
	eq(searchParamsOf(lastSearch(t)).offset, 60, 'the same page')
	eq(t.state.error, null)
	answer(lastSearch(t), many(5, {}, 61), { total: 312, hasMore: true })
	await flush()
	eq(t.state.assets.length, 65)
	eq(t.state.error, null)
	// Aborted requests are not failures: nothing is shown for a search the person replaced.
	t.actions.loadMore()
	const stale = lastSearch(t)
	t.actions.submitDraft('other')
	await flush()
	eq(t.state.error, null)
	assert(stale.signal.aborted)
	t.unmount()
})

await check('first page failure: an error with Retry and no cards, never the empty state; Retry asks again and clears it', async () => {
	const t = setup()
	t.actions.submitDraft('kitchen')
	lastSearch(t).reject(apiError('Search is down.', 500))
	await flush()
	eq(t.state.error, 'Search is down.')
	eq(t.state.assets, [])
	eq([t.state.loading, t.state.hasMore], [false, false])
	assert(t.state.error !== null && t.state.assets.length === 0, 'the grid gets an error to show instead of its empty node')
	t.actions.retry()
	eq(t.search.items.length, 2)
	eq(t.state.loading, true)
	eq(t.state.error, null)
	const again = searchParamsOf(lastSearch(t))
	eq([again.q, again.facets], ['kitchen', true])
	answer(lastSearch(t), many(2), { total: 2 })
	await flush()
	eq([t.state.assets.length, t.state.error], [2, null])
	// A network failure is a sentence, not the browser's text.
	t.actions.submitDraft('offline')
	lastSearch(t).reject(new apiModule.MediaApiError('Could not reach the server. Check your connection and try again.', 0))
	await flush()
	assert(/connection/i.test(t.state.error), t.state.error)
	t.unmount()
})

await check('every change to q, folder, deep or sort starts over at page 1 with facets, and a paged list does not carry its offset along', async () => {
	const t = setup()
	t.actions.loadMore()
	answer(lastSearch(t), many(10, {}, 61), { total: 312, hasMore: true })
	await flush()
	eq(t.state.assets.length, 70)
	const steps = [
		['q', () => t.actions.submitDraft('kitchen')],
		['folder', () => t.actions.selectFolder(ACME.id)],
		['deep', () => t.actions.toggleDeep()],
		['sort', () => t.actions.setSort('oldest')],
	]
	for (const [name, change] of steps) {
		const before = t.search.items.length
		change()
		eq(t.search.items.length, before + 1, `${name} asks again`)
		const p = searchParamsOf(lastSearch(t))
		assert(!p.offset, `${name}: from the first row`)
		eq(p.facets, true, `${name}: with facets`)
		eq(t.state.assets, [], `${name}: the old rows are not shown under the new search`)
		eq(t.state.loading, true)
		answer(lastSearch(t), many(60), { total: 312, hasMore: true })
		await flush()
		t.actions.loadMore()
		answer(lastSearch(t), many(10, {}, 61), { total: 312, hasMore: true })
		await flush()
		eq(t.state.assets.length, 70)
	}
	t.unmount()
})

/* ========================================================================== */
/* The controller: selection and bulk actions                                 */
/* ========================================================================== */

/** Click the first card, then shift-click the last: everything between is chosen. */
const pick = (t, from, to = from) => {
	t.actions.toggleSelect(hex(from), { range: false })
	if (to !== from) t.actions.toggleSelect(hex(to), { range: true })
}
const echo = (body) => ({ affected: 'ids' in body.target ? body.target.ids.length : body.target.search.expect })
const bulkHandlers = (over = {}) => ({
	bulk: echo,
	listFolders: () => foldersResponse(),
	processStatus: () => TAGGING_OFF,
	...over,
})

await check('selection (controller): a change to q, folder or deep ends it, sort and density do not, and Select mode ends with the selection', async () => {
	const t = setup()
	pick(t, 2, 5)
	eq(selectedIds(t), idRange(2, 5))
	eq(t.state.selecting, false, 'checkboxes show because something is selected, not because of the toggle')

	t.actions.setSort('oldest')
	answer(lastSearch(t), many(60), { total: 312 })
	await flush()
	eq(selectedIds(t), idRange(2, 5), 'a new sort keeps the selection')
	t.actions.setDensity('compact')
	eq(selectedIds(t), idRange(2, 5), 'so does the density')
	eq(JSON.stringify(t.env.storage.get('rb.media.density')), '"compact"')

	const clearedBy = [
		['q', () => t.actions.submitDraft('kitchen')],
		['folder', () => t.actions.selectFolder(ACME.id)],
		['deep', () => t.actions.toggleDeep()],
		['the scope pill x', () => t.actions.clearScope()],
		['clear all', () => t.actions.clearAll()],
		['a chip', () => t.actions.removeChip(parseQuery('tag:a').chips[0])],
		['a saved search', () => t.actions.applySaved(SAVED[1])],
		['needs review', () => t.actions.showReview()],
	]
	for (const [name, change] of clearedBy) {
		// Put a typed query and a folder in place first, so every step really changes something.
		if (name === 'the scope pill x' || name === 'deep') {
			t.actions.selectFolder(ACME.id)
			answer(lastSearch(t), many(60), { total: 312 })
			await flush()
		}
		if (name === 'a chip') {
			t.actions.submitDraft('tag:a')
			answer(lastSearch(t), many(60), { total: 312 })
			await flush()
		}
		pick(t, 2, 5)
		eq(selectedIds(t).length, 4, `${name}: something is selected`)
		change()
		eq(t.state.selection.ids.size, 0, `${name} ends the selection`)
		eq(t.state.selecting, false)
		answer(lastSearch(t), many(60), { total: 312 })
		await flush()
	}

	// Select mode ends when the selection does, by toggling the last card off or by Clear.
	t.actions.toggleSelecting()
	eq(t.state.selecting, true)
	t.actions.toggleSelect(hex(1), { range: false })
	t.actions.toggleSelect(hex(1), { range: false })
	eq([t.state.selecting, t.state.selection.ids.size], [false, 0])
	t.actions.toggleSelecting()
	t.actions.toggleSelect(hex(3), { range: false })
	t.actions.clearSelection()
	eq([t.state.selecting, t.state.selection.ids.size], [false, 0])
	// The toolbar checkbox: everything loaded, then nothing.
	t.actions.toggleAll()
	eq(t.state.selection.ids.size, 60)
	t.actions.toggleAll()
	eq(t.state.selection.ids.size, 0)
	t.unmount()
})

await check('select all matching (controller): offered only when exact; it sends the search the results were made for, with expect', async () => {
	const key = { q: 'tag:kitchen', folder: ACME.id, deep: true }
	const search = `?q=tag%3Akitchen&folder=${ACME.id}&deep=1`
	const initial = baseInitial({ params: key })
	const t = setup({ initial, search, handlers: bulkHandlers() })
	eq(t.search.items.length, 0, 'the URL matches the render: nothing refetched')
	t.actions.selectAllMatching()
	eq([t.state.selection.allMatching, t.state.selection.matchTotal, lib.selectBulkCount(t.state)], [true, 312, 312])
	eq(t.state.selection.ids.size, 60, 'the loaded cards show chosen')

	// Loading more while it is on: those cards are part of it too.
	t.actions.loadMore()
	answer(lastSearch(t), many(10, {}, 61), { total: 312, hasMore: true })
	await flush()
	eq([t.state.selection.allMatching, t.state.selection.ids.size], [true, 70])

	await t.actions.bulkDelete()
	eq(lastBulk(t), { action: 'delete', target: { search: { q: 'tag:kitchen', folder: ACME.id, deep: true, expect: 312 } } })
	eq([t.state.notice.tone, t.state.notice.text], ['info', 'Deleted 312 images.'])
	eq(t.state.selection.ids.size, 0)
	eq(t.state.selection.allMatching, false)
	await t.clock.advance(500)
	assert(t.search.items.length === 2, 'the list reloads once')
	t.unmount()

	// The guard, by every way a result can stop being exact.
	const exact = (over) => baseInitial({ search: searchResponse(many(60), { total: 312, hasMore: true, ...over }) })
	for (const [name, over, offered] of [
		['exact', {}, true],
		['truncated', { truncated: true }, false],
		['relaxed (dropped a word)', { dropped: ['sink'] }, false],
		['exactly the cap', { total: MEDIA_LIMITS.bulkSearchCap }, true],
		['one over the cap', { total: MEDIA_LIMITS.bulkSearchCap + 1 }, false],
		['nothing', { total: 0, hasMore: false }, false],
	]) {
		const g = setup({ initial: exact(over) })
		g.actions.selectAllMatching()
		eq(g.state.selection.allMatching, offered, name)
		g.unmount()
	}
})

await check('select all matching (controller): a changed total ends it, so the confirmed set cannot silently become another', async () => {
	const t = setup({ handlers: bulkHandlers() })
	t.actions.selectAllMatching()
	eq(t.state.selection.allMatching, true)
	t.actions.refresh()
	answer(lastSearch(t), many(60), { total: 313, hasMore: true })
	await flush()
	eq(t.state.selection.allMatching, false, 'it was made for 312 and the library now says 313')
	eq(t.state.selection.ids.size, 60, 'the cards that were chosen stay chosen')
	// The same total keeps it.
	t.actions.selectAllMatching()
	t.actions.refresh()
	answer(lastSearch(t), many(60), { total: 313, hasMore: true })
	await flush()
	eq(t.state.selection.allMatching, true)
	t.unmount()
})

await check('select all matching (controller): a result that stops being exact ends it too, and so does an image leaving the view', async () => {
	// The same total, but the reload (or the next page) says the result is no longer exact.
	for (const [name, over] of [['truncated', { truncated: true }], ['relaxed', { dropped: ['sink'] }], ['over the cap', { total: MEDIA_LIMITS.bulkSearchCap + 1 }]]) {
		const t = setup({ handlers: bulkHandlers() })
		t.actions.selectAllMatching()
		eq(t.state.selection.allMatching, true, `${name}: made while exact`)
		t.actions.refresh()
		answer(lastSearch(t), many(60), { total: 312, hasMore: true, ...over })
		await flush()
		eq(t.state.selection.allMatching, false, `${name}: the reload`)
		eq(t.state.selection.ids.size, 60, `${name}: the chosen cards stay chosen`)
		t.unmount()
	}
	const more = setup({ handlers: bulkHandlers() })
	more.actions.selectAllMatching()
	more.actions.loadMore()
	answer(lastSearch(more), many(10, {}, 61), { total: 312, hasMore: true, truncated: true })
	await flush()
	eq(more.state.selection.allMatching, false, 'the next page')
	more.unmount()

	// An image that leaves the view (moved out of the folder being looked at) is no longer chosen,
	// and "all matching" was made for a set that just shrank.
	const handlers = bulkHandlers({ patchAsset: (id) => asset(Number.parseInt(id, 16), { folderId: hex(777), folderPath: 'Elsewhere' }) })
	const moved = setup({ initial: baseInitial({ params: { q: '', folder: ACME.id } }), search: `?folder=${ACME.id}`, handlers })
	moved.actions.selectAllMatching()
	await moved.actions.patchAsset({ folderId: hex(777) }, hex(1))
	eq(moved.state.assets.length, 59, 'it left the view')
	eq(moved.state.selection.allMatching, false)
	eq(moved.state.selection.ids.has(hex(1)), false)
	eq(moved.state.selection.ids.size, 59)
	moved.unmount()
})

await check('popstate: Back to another search that keeps the same ?asset= keeps the sheet showing that image, with no request for it', async () => {
	const getAsset = manual()
	const t = setup({ handlers: { getAsset } })
	t.actions.openAsset(hex(3))
	eq(lib.selectOpenAsset(t.state)?.id, hex(3))
	t.env.popTo(`?q=other&asset=${hex(3)}`)
	eq([t.state.params.q, t.state.openId, t.state.loading], ['other', hex(3), true])
	eq(lib.selectOpenAsset(t.state)?.id, hex(3), 'the sheet does not close for the length of the request')
	answer(lastSearch(t), many(5, {}, 100), { total: 5 })
	await flush()
	eq(lib.selectOpenAsset(t.state)?.id, hex(3), 'and the list that lands does not hold it, so it is still the carried copy')
	eq(getAsset.items.length, 0, 'which needed no request')
	eq(lib.selectOpenIndex(t.state), -1)
	t.unmount()
})

await check('selection: a reload asked to drop what left the results does so even when another reload is the one that answers', async () => {
	const t = setup({ handlers: bulkHandlers() })
	pick(t, 1, 4)
	await t.actions.bulkAccept()
	eq(selectedIds(t), idRange(1, 4), 'keeping tags does not clear the selection')
	await t.clock.advance(500)
	const asked = lastSearch(t)
	// Something else reloads before it answers, and that request is the one that lands.
	t.actions.refresh()
	assert(asked.signal.aborted)
	answer(lastSearch(t), many(60, {}, 3), { total: 310 })
	await flush()
	eq(selectedIds(t), [hex(3), hex(4)], 'images 1 and 2 left the results: no longer chosen')
	t.unmount()

	// Across an unmount and a mount of the same page.
	const again = setup({ handlers: bulkHandlers() })
	pick(again, 1, 4)
	await again.actions.bulkAccept()
	await again.clock.advance(500)
	again.unmount()
	const stop = again.controller.mount()
	answer(lastSearch(again), many(60, {}, 3), { total: 310 })
	await flush()
	eq([...again.state.selection.ids].sort(), [hex(3), hex(4)], 'a remount still prunes')
	stop()
})

await check('the open image: a reload that no longer holds it keeps the sheet showing it, so ?asset= is never a lie', async () => {
	const t = setup({ handlers: bulkHandlers() })
	t.actions.openAsset(hex(3))
	eq(lib.selectOpenIndex(t.state), 2)
	t.actions.refresh()
	answer(lastSearch(t), many(5, {}, 100), { total: 5 })
	await flush()
	eq(t.state.openId, hex(3))
	eq(lib.selectOpenAsset(t.state)?.id, hex(3), 'the image is still shown')
	eq(lib.selectOpenIndex(t.state), -1, 'no neighbours to step to, as for an image opened from a link')
	assert(t.env.loc.search.includes(`asset=${hex(3)}`), 'and the URL still says so')
	t.actions.closeDetail()
	eq(lib.selectOpenAsset(t.state), null)
	t.unmount()
})

await check('bulk move: the chosen ids go, "38 of 40" is said when fewer moved, the selection clears and the list and counts refresh once', async () => {
	const t = setup({ handlers: bulkHandlers({ bulk: () => ({ affected: 38 }) }) })
	pick(t, 1, 40)
	eq(selectedIds(t).length, 40)
	await t.actions.bulkMove(ACME.id)
	eq(lastBulk(t), { action: 'move', target: { ids: idRange(1, 40) }, folderId: ACME.id })
	eq(t.state.notice.tone, 'warn')
	assert(t.state.notice.text.includes('38 of 40'), t.state.notice.text)
	eq(t.state.selection.ids.size, 0)
	eq(t.api.of('listFolders').length, 0, 'not yet: a burst of writes becomes one refresh')
	await t.clock.advance(499)
	eq(t.search.items.length, 0)
	await t.clock.advance(1)
	eq(t.api.of('listFolders').length, 1, 'the folder counts')
	eq(t.search.items.length, 1, 'the list')
	const refresh = searchParamsOf(lastSearch(t))
	eq([refresh.facets, !refresh.offset], [true, true])
	eq(t.state.refreshing, true)
	eq(t.state.assets.length, 60, 'the cards stay while it reloads, so nothing jumps')
	answer(lastSearch(t), many(60, {}, 100), { total: 272 })
	await flush()
	eq([t.state.refreshing, t.state.total], [false, 272])
	t.unmount()

	// To Unfiled (null), and when nothing moved the sentence says so without "0 of".
	const u = setup({ handlers: bulkHandlers({ bulk: () => ({ affected: 0 }) }) })
	pick(u, 1, 3)
	await u.actions.bulkMove(null)
	eq(lastBulk(u), { action: 'move', target: { ids: idRange(1, 3) }, folderId: null })
	eq(u.state.notice.tone, 'warn')
	assert(!/\b0 of\b/.test(u.state.notice.text), u.state.notice.text)
	u.unmount()
})

await check('bulk actions: every failure rejects with the server sentence, nothing is claimed done, and the selection is kept', async () => {
	const t = setup({ handlers: bulkHandlers({ bulk: () => Promise.reject(apiError('You cannot do that.', 403)) }) })
	pick(t, 1, 4)
	for (const run of [
		() => t.actions.bulkMove(ACME.id),
		() => t.actions.bulkTags({ add: ['x'], remove: [] }),
		() => t.actions.bulkRetag(),
		() => t.actions.bulkDelete(),
	]) {
		await rejects(run(), (e) => e.message === 'You cannot do that.')
		eq(selectedIds(t), idRange(1, 4), 'the selection stays so the person can try again')
		eq(t.state.notice, null, 'nothing is reported as done')
		eq(t.state.assets.length, 60, 'no card was removed on a failure')
	}
	// Keep-all-tags reports its own failure instead of throwing (the bar has no place to show one).
	await t.actions.bulkAccept()
	eq(t.state.notice.tone, 'error')
	assert(t.state.notice.text.includes('You cannot do that.'), t.state.notice.text)
	t.unmount()
})

await check('bulk actions: without the permission nothing is sent (write for everything, delete for delete)', async () => {
	const readOnly = setup({ can: { write: false, delete: false }, handlers: bulkHandlers() })
	pick(readOnly, 1, 2)
	for (const run of [
		() => readOnly.actions.bulkMove(null),
		() => readOnly.actions.bulkTags({ add: ['x'], remove: [] }),
		() => readOnly.actions.bulkRetag(),
		() => readOnly.actions.bulkAccept(),
		() => readOnly.actions.bulkDelete(),
		() => readOnly.actions.patchAsset({ name: 'x' }, hex(1)),
		() => readOnly.actions.deleteAsset(hex(1)),
		() => readOnly.actions.retagAsset(hex(1)),
		() => readOnly.actions.createFolder(null, 'x'),
		() => readOnly.actions.renameFolder(ACME.id, 'x'),
		() => readOnly.actions.moveFolder(ACME.id, null),
		() => readOnly.actions.deleteFolder(ACME.id),
		() => readOnly.actions.dropAssets(null, [hex(1)]),
		() => readOnly.actions.saveSearch('x'),
		() => readOnly.actions.deleteSaved(hex(5001)),
		() => readOnly.actions.renameTag('a', 'b'),
		() => readOnly.actions.mergeTag('a', 'b'),
		() => readOnly.actions.deleteTag('a'),
	])
		await rejects(run(), (e) => /role does not allow/i.test(e.message))
	eq(readOnly.api.calls.filter((c) => c.name !== 'search').length, 0, 'not one request was made')
	readOnly.unmount()

	// Write without delete: everything but the deletions.
	const t = setup({ can: { write: true, delete: false }, handlers: bulkHandlers() })
	pick(t, 1, 2)
	await rejects(t.actions.bulkDelete(), (e) => /role does not allow/i.test(e.message))
	await rejects(t.actions.deleteAsset(hex(1)), (e) => /role does not allow/i.test(e.message))
	await rejects(t.actions.deleteFolder(ACME.id), (e) => /role does not allow/i.test(e.message))
	await rejects(t.actions.deleteTag('a'), (e) => /role does not allow/i.test(e.message))
	await t.actions.bulkMove(null)
	eq(lastBulk(t).action, 'move')
	t.unmount()
	// And the other way: the permission is read when the action runs, so a changed role is honoured.
	const live = setup({ can: { write: true, delete: true }, handlers: bulkHandlers() })
	pick(live, 1, 2)
	live.can = { write: false, delete: false }
	await rejects(live.actions.bulkDelete(), (e) => /role does not allow/i.test(e.message))
	live.unmount()
})

await check('bulk actions: a long selection goes in slices the server accepts, and a failure part-way says how far it got', async () => {
	const ids = Array.from({ length: 1200 }, (_, i) => hex(10_000 + i))
	const t = setup({ handlers: bulkHandlers() })
	t.actions.onSelectBatch(ids)
	eq(t.state.selection.ids.size, 1200)
	await t.actions.bulkTags({ add: ['Kitchen'], remove: [] })
	const calls = t.api.of('bulk').map((c) => c.args[0])
	eq(calls.map((c) => c.target.ids.length), [500, 500, 200], 'bulkIdsCap is 500')
	eq(calls.map((c) => c.action), ['addTags', 'addTags', 'addTags'])
	eq(calls.map((c) => c.tags), [['Kitchen'], ['Kitchen'], ['Kitchen']])
	eq(calls.flatMap((c) => c.target.ids), ids, 'every id exactly once, in order')
	eq(t.state.notice.text, 'Tagged 1,200 images.')
	t.unmount()

	let n = 0
	const f = setup({ handlers: bulkHandlers({ bulk: (body) => (++n === 2 ? Promise.reject(apiError('Server down.', 500)) : echo(body)) }) })
	f.actions.onSelectBatch(ids)
	const error = await rejects(f.actions.bulkMove(null), () => true)
	assert(error.message.includes('500 of 1,200 images changed before this stopped'), error.message)
	assert(error.message.includes('Server down.'), error.message)
	eq(f.state.selection.ids.size, 1200, 'still selected')
	f.unmount()
})

await check('bulk delete by search: a 409 (the results changed) ends "all matching", reloads the list and tells the person', async () => {
	const t = setup({ handlers: bulkHandlers({ bulk: () => Promise.reject(apiError('The results changed. Review and try again.', 409)) }) })
	t.actions.selectAllMatching()
	const searches = t.search.items.length
	const error = await rejects(t.actions.bulkDelete(), () => true)
	eq(error.message, 'The results changed. Review and try again.')
	eq(t.state.selection.allMatching, false, 'what was confirmed is not what the server holds')
	eq(t.state.selection.ids.size, 60, 'the loaded cards stay chosen')
	eq(t.search.items.length, searches + 1, 'the list is reloaded now, not in half a second')
	assert(!lastSearch(t).signal.aborted)
	// "Too many matches" is also a 409 and also ends it.
	const big = setup({ handlers: bulkHandlers({ bulk: () => Promise.reject(apiError('Too many matches, narrow the search.', 409)) }) })
	big.actions.selectAllMatching()
	await rejects(big.actions.bulkMove(null), (e) => /Too many matches/.test(e.message))
	eq(big.state.selection.allMatching, false)
	t.unmount()
	big.unmount()
})

await check('bulk tags: add then remove, one message in the worse tone; a half-done pair says which half', async () => {
	const t = setup({ handlers: bulkHandlers() })
	pick(t, 1, 40)
	await t.actions.bulkTags({ add: ['Kitchen', 'Remodel'], remove: ['old'] })
	const calls = t.api.of('bulk').map((c) => c.args[0])
	eq(calls.map((c) => [c.action, c.tags]), [['addTags', ['Kitchen', 'Remodel']], ['removeTags', ['old']]])
	eq(t.state.notice.tone, 'info')
	eq(t.state.notice.text, 'Tagged 40 images. Removed the tags from 40 images.')
	eq(selectedIds(t).length, 40, 'tagging keeps the selection so the next step can follow')
	await t.clock.advance(1000)
	assert(t.search.items.some((i) => searchParamsOf(i).limit === 1), 'the facet counts are refreshed, quietly, with one row')
	// Nothing to do is not a request.
	const before = t.api.of('bulk').length
	await t.actions.bulkTags({ add: [], remove: [] })
	eq(t.api.of('bulk').length, before)
	t.unmount()

	let n = 0
	const half = setup({ handlers: bulkHandlers({ bulk: (body) => (++n === 2 ? Promise.reject(apiError('Nope.', 500)) : echo(body)) }) })
	pick(half, 1, 5)
	const error = await rejects(half.actions.bulkTags({ add: ['a'], remove: ['b'] }), () => true)
	assert(/Tags were added to 5 images, but they could not be removed\. Nope\./.test(error.message), error.message)
	half.unmount()

	// A shortfall on one half makes the whole message a warning.
	const short = setup({ handlers: bulkHandlers({ bulk: (body) => ({ affected: body.action === 'addTags' ? 3 : 5 }) }) })
	pick(short, 1, 5)
	await short.actions.bulkTags({ add: ['a'], remove: ['b'] })
	eq(short.state.notice.tone, 'warn')
	assert(short.state.notice.text.includes('3 of 5'), short.state.notice.text)
	short.unmount()
})

await check('bulk delete: the cards leave at once, an open one closes with the URL cleaned, and the list and counts refresh', async () => {
	const t = setup({ handlers: bulkHandlers() })
	t.actions.openAsset(hex(2))
	eq(lastWrite(t), ['replace', `/account/media?asset=${hex(2)}`], 'the open image is mirrored to ?asset=')
	pick(t, 1, 3)
	await t.actions.bulkDelete()
	eq(lastBulk(t), { action: 'delete', target: { ids: idRange(1, 3) } })
	eq(idsOf(t.state.assets).slice(0, 2), [hex(4), hex(5)])
	eq([t.state.assets.length, t.state.total], [57, 309])
	eq(t.state.openId, null, 'the open image was among them')
	eq(lastWrite(t), ['replace', '/account/media'])
	eq([t.state.notice.tone, t.state.notice.text], ['info', 'Deleted 3 images.'])
	eq(t.state.selection.ids.size, 0)
	await t.clock.advance(500)
	eq([t.api.of('listFolders').length, t.search.items.length], [1, 1])
	// An open image that was not selected stays open.
	t.actions.openAsset(hex(10))
	pick(t, 20, 21)
	await t.actions.bulkDelete()
	eq(t.state.openId, hex(10))
	t.unmount()
})

await check('bulk retag: queues the chosen images, cards show "waiting" at once, and a 409 (tagging is off) is a message, not a crash', async () => {
	const t = setup({ initial: baseInitial({ tagging: TAGGING_OFF }), handlers: bulkHandlers({ bulk: () => ({ affected: 3 }) }) })
	pick(t, 1, 5)
	await t.actions.bulkRetag()
	eq(lastBulk(t), { action: 'retag', target: { ids: idRange(1, 5) } })
	eq(t.state.notice.tone, 'warn')
	assert(t.state.notice.text.includes('3 of 5'), t.state.notice.text)
	eq(t.state.assets.slice(0, 5).map((a) => a.tagging.status), ['pending', 'pending', 'pending', 'pending', 'pending'])
	eq(t.state.assets[5].tagging.status, 'done', 'others are untouched')
	eq(t.state.pending, 3)
	t.unmount()

	const off = setup({ handlers: bulkHandlers({ bulk: () => Promise.reject(apiError('Auto-tagging is off. Add an ANTHROPIC_API_KEY to turn it on.', 409)) }) })
	pick(off, 1, 2)
	await rejects(off.actions.bulkRetag(), (e) => /Auto-tagging is off/.test(e.message))
	eq(off.state.assets[0].tagging.status, 'done', 'nothing was marked as queued')
	off.unmount()

	// All matching: no card can be marked (they are not all loaded), the loop picks the rest up.
	const all = setup({ handlers: bulkHandlers() })
	all.actions.selectAllMatching()
	await all.actions.bulkRetag()
	eq(lastBulk(all).target, { search: { q: '', expect: 312 } })
	eq(all.state.pending, 312)
	all.unmount()
})

await check('keep all auto tags: sends the target, reports, and the rail and list refresh because the review queue moved', async () => {
	const t = setup({ handlers: bulkHandlers() })
	pick(t, 1, 4)
	await t.actions.bulkAccept()
	eq(lastBulk(t), { action: 'acceptAutoTags', target: { ids: idRange(1, 4) } })
	eq([t.state.notice.tone, t.state.notice.text], ['info', 'Kept the automatic tags on 4 images.'])
	await t.clock.advance(1000)
	eq(t.api.of('listFolders').length, 1, 'the Needs review count')
	t.unmount()
})

/* ========================================================================== */
/* The controller: one image                                                  */
/* ========================================================================== */

await check('the open image: mirrored to ?asset= with replaceState, stepped with prev and next, and the next page is brought in near the end', async () => {
	const t = setup()
	t.actions.openAsset(hex(3))
	eq(lastWrite(t), ['replace', `/account/media?asset=${hex(3)}`])
	t.actions.next()
	eq([t.state.openId, lastWrite(t)], [hex(4), ['replace', `/account/media?asset=${hex(4)}`]])
	for (let i = 0; i < 6; i++) t.actions.prev()
	eq(t.state.openId, hex(1), 'prev stops at the first image')
	t.actions.closeDetail()
	eq([t.state.openId, lastWrite(t)], [null, ['replace', '/account/media']])
	t.actions.next()
	eq(t.state.openId, null, 'nothing is open: nothing to step from')
	assert(t.env.writes.every(([kind]) => kind === 'replace'), 'opening and closing never push history')

	// Next on the last loaded image asks for the following page, and the sheet stays where it is meanwhile.
	t.actions.openAsset(hex(59))
	t.actions.next()
	eq(t.state.openId, hex(60))
	eq(t.search.items.length, 1)
	eq(searchParamsOf(lastSearch(t)).offset, 60)
	t.actions.next()
	eq(t.state.openId, hex(60), 'at the end of what is loaded it waits for the page')

	// The URL carries the search and the image together.
	t.actions.submitDraft('kitchen')
	answer(lastSearch(t), many(60), { total: 312, hasMore: true })
	await flush()
	t.actions.openAsset(hex(7))
	eq(lastWrite(t), ['replace', `/account/media?q=kitchen&asset=${hex(7)}`])
	t.unmount()
})

await check('edit one image: tags, a rename and a move show at once; the server answer replaces them; a failure puts them back and says why', async () => {
	const patch = manual()
	const t = setup({ handlers: { patchAsset: patch, listFolders: () => foldersResponse() } })
	const original = t.state.assets[0]
	const done = t.actions.patchAsset({ addTags: ['Remodel'], name: '  Hero  ' }, hex(1))
	eq(slugs(t.state.assets[0]), ['kitchen:manual', 'remodel:manual'], 'tags show before any answer')
	eq(t.state.assets[0].name, 'Hero', 'trimmed like the server will')
	await flush()
	eq(patch.items.length, 1)
	eq(patch.items[0].args, [hex(1), { addTags: ['Remodel'], name: '  Hero  ' }])
	patch.items[0].reject(apiError('A name must be unique here.', 409))
	await rejects(done, (e) => e.message === 'A name must be unique here.')
	eq(t.state.assets[0], original, 'put back exactly')
	eq(t.state.notice.tone, 'error')
	assert(t.state.notice.text.includes('Could not save that change. A name must be unique here.'), t.state.notice.text)

	// Success: the answer is the truth (it may differ from the preview).
	const ok = t.actions.patchAsset({ addTags: ['Remodel'] }, hex(1))
	await flush()
	patch.items[1].resolve(asset(1, { tags: [...original.tags, { slug: 'remodel', label: 'Remodel', source: 'manual' }], updatedAt: '2026-06-01T00:00:00.000Z' }))
	await ok
	eq(t.state.assets[0].updatedAt, '2026-06-01T00:00:00.000Z')
	await t.clock.advance(1000)
	eq(t.api.of('listFolders').length, 1, 'the tree is refreshed for the tag counts')
	assert(t.search.items.some((i) => searchParamsOf(i).limit === 1 && searchParamsOf(i).facets === true), 'facet counts follow a tag change')
	t.unmount()
})

await check('edit one image: an error is shown inline by the sheet when it is open (and announced), as a notice when it is not', async () => {
	const patch = manual()
	const t = setup({ handlers: { patchAsset: patch } })
	t.actions.openAsset(hex(2))
	const failing = t.actions.patchAsset({ caption: 'A van' })
	eq(t.state.assets[1].caption, 'A van', 'with no id it edits the open image')
	await flush()
	patch.items[0].reject(apiError('Too long.', 400))
	await rejects(failing, (e) => e.message === 'Too long.')
	eq(t.state.assets[1].caption, '')
	eq(t.state.notice, null, 'the sheet shows it next to the field')
	assert(t.state.announcement.text.includes('Too long.'), 'and the live region says it')
	t.actions.closeDetail()
	await rejects(t.actions.patchAsset({ caption: 'x' }), (e) => /No image is open/.test(e.message))
	t.unmount()
})

await check('edit one image: edits to one image are sent one at a time in order, others do not wait, and an older failure does not undo a newer edit', async () => {
	const patch = manual()
	const t = setup({ handlers: { patchAsset: patch } })
	const first = t.actions.patchAsset({ name: 'First' }, hex(1))
	const second = t.actions.patchAsset({ name: 'Second', caption: 'Cap' }, hex(1))
	const other = t.actions.patchAsset({ name: 'Other' }, hex(2))
	await flush()
	eq(patch.items.map((i) => i.args[0]), [hex(1), hex(2)], 'the second edit of image 1 waits for the first')
	eq(t.state.assets[0].name, 'Second', 'the preview already shows the latest')
	patch.items[0].reject(apiError('Nope.', 500))
	await rejects(first, () => true)
	eq(t.state.assets[0].name, 'Second', 'the newer edit is not undone by the older failure')
	await flush()
	eq(patch.items.map((i) => i.args[0]), [hex(1), hex(2), hex(1)], 'then the queue moves on')
	patch.items[2].resolve(asset(1, { name: 'Second', caption: 'Cap' }))
	patch.items[1].resolve(asset(2, { name: 'Other' }))
	await Promise.all([second, other])
	eq([t.state.assets[0].name, t.state.assets[0].caption, t.state.assets[1].name], ['Second', 'Cap', 'Other'])
	t.unmount()
})

await check('edit one image: an image that is open but not in the list (a link) is edited in place', async () => {
	const patch = manual()
	const getAsset = manual()
	const t = setup({ search: `?asset=${hex(900)}`, handlers: { patchAsset: patch, getAsset } })
	getAsset.items[0].resolve(asset(900, { name: 'Far away' }))
	await flush()
	const p = t.actions.patchAsset({ name: 'Near' })
	eq(lib.selectOpenAsset(t.state).name, 'Near', 'the open copy shows it at once')
	await flush()
	patch.items[0].resolve(asset(900, { name: 'Near' }))
	await p
	eq(lib.selectOpenAsset(t.state).name, 'Near')
	assert(!t.state.assets.some((a) => a.id === hex(900)), 'it was never spliced into the grid')
	t.unmount()
})

await check('move one image: it leaves a view that no longer holds it (the sheet stays open), stays in one that does, and the counts refresh', async () => {
	const move = (to) => ({ patchAsset: (id) => asset(Number.parseInt(id, 16), { folderId: to, folderPath: to ? 'Somewhere' : '' }), listFolders: () => foldersResponse() })
	// Looking at Clients/Acme alone: an image moved to its child leaves.
	const alone = setup({ initial: baseInitial({ params: { q: '', folder: ACME.id } }), search: `?folder=${ACME.id}`, handlers: move(ACME_KITCHENS.id) })
	alone.actions.openAsset(hex(1))
	await alone.actions.patchAsset({ folderId: ACME_KITCHENS.id }, hex(1))
	eq([alone.state.assets.length, alone.state.total], [59, 311])
	eq(alone.state.openId, hex(1), 'the sheet stays open on the image that moved')
	eq(lib.selectOpenAsset(alone.state).id, hex(1))
	await alone.clock.advance(500)
	eq(alone.api.of('listFolders').length, 1)
	alone.unmount()

	// With subfolders included it still belongs.
	const deep = setup({ initial: baseInitial({ params: { q: '', folder: ACME.id, deep: true } }), search: `?folder=${ACME.id}&deep=1`, handlers: move(ACME_KITCHENS.id) })
	await deep.actions.patchAsset({ folderId: ACME_KITCHENS.id }, hex(1))
	eq([deep.state.assets.length, deep.state.total], [60, 312])
	deep.unmount()

	// Moved to Unfiled out of a folder view: gone from it; in an all-media view: nothing changes.
	const all = setup({ handlers: move(null) })
	await all.actions.patchAsset({ folderId: null }, hex(1))
	eq(all.state.assets.length, 60)
	all.unmount()
	const unfiled = setup({ initial: baseInitial({ params: { q: '', folder: 'unfiled' } }), search: '?folder=unfiled', handlers: move(ACME.id) })
	await unfiled.actions.patchAsset({ folderId: ACME.id }, hex(1))
	eq(unfiled.state.assets.length, 59)
	unfiled.unmount()

	// A folder: clause in the query decides the scope, and the client cannot tell: reload instead of guessing.
	const clause = setup({ initial: baseInitial({ params: { q: 'folder:Clients' } }), search: '?q=folder%3AClients', handlers: move(ACME_KITCHENS.id) })
	await clause.actions.patchAsset({ folderId: ACME_KITCHENS.id }, hex(1))
	eq(clause.state.assets.length, 60, 'not dropped on a guess')
	await clause.clock.advance(500)
	eq(clause.search.items.length, 1, 'the list is reloaded to find out')
	clause.unmount()
})

await check('delete one image: it leaves the list, the sheet closes, the counts refresh; a failure keeps everything', async () => {
	const t = setup({ handlers: { deleteAsset: () => ({ ok: true }), listFolders: () => foldersResponse() } })
	pick(t, 4, 6)
	t.actions.openAsset(hex(5))
	await t.actions.deleteAsset()
	eq(t.api.of('deleteAsset')[0].args, [hex(5)])
	eq([t.state.assets.length, t.state.total, t.state.openId], [59, 311, null])
	assert(!idsOf(t.state.assets).includes(hex(5)))
	eq(selectedIds(t), [hex(4), hex(6)], 'it is no longer selected')
	eq(lastWrite(t), ['replace', '/account/media'])
	eq([t.state.notice.tone, t.state.notice.text], ['info', 'Deleted 1 image.'])
	await t.clock.advance(500)
	eq([t.api.of('listFolders').length, t.search.items.length], [1, 1])
	// Another one by id, not open.
	await t.actions.deleteAsset(hex(9))
	eq(t.state.assets.length, 58)
	t.unmount()

	const failing = setup({ handlers: { deleteAsset: () => Promise.reject(apiError('Image not found.', 404)) } })
	failing.actions.openAsset(hex(2))
	await rejects(failing.actions.deleteAsset(), (e) => e.message === 'Image not found.')
	eq([failing.state.assets.length, failing.state.openId, failing.state.total], [60, hex(2), 312])
	failing.unmount()
})

await check('auto-tag one image again: it shows as waiting, the queue count rises, and "already waiting" is said rather than hidden', async () => {
	let affected = 1
	const t = setup({ initial: baseInitial({ tagging: TAGGING_ON }), handlers: bulkHandlers({ bulk: () => ({ affected }) }) })
	t.actions.openAsset(hex(2))
	await t.actions.retagAsset()
	eq(lastBulk(t), { action: 'retag', target: { ids: [hex(2)] } })
	eq(t.state.assets[1].tagging.status, 'pending')
	eq(lib.selectOpenAsset(t.state).tagging.status, 'pending')
	eq([t.state.pending, t.state.tagging.pending], [1, 1])
	affected = 0
	await t.actions.retagAsset(hex(3))
	eq(t.state.notice.tone, 'warn')
	eq(t.state.assets[2].tagging.status, 'done')
	t.unmount()
})

/* ========================================================================== */
/* The controller: folders, saved searches, tags, uploads                     */
/* ========================================================================== */

await check('folders: create, rename, move, delete and drop go through the API and refresh the tree; failures reject with the server sentence', async () => {
	const grown = { folders: [...FOLDERS, { id: hex(2001), parentId: null, name: 'New', path: 'New', depth: 0, count: 0, total: 0 }] }
	let reply = foldersResponse()
	const t = setup({
		handlers: bulkHandlers({
			createFolder: () => ({ folder: FOLDERS[0] }),
			patchFolder: () => ({ folder: FOLDERS[0] }),
			deleteFolder: () => ({ moved: { assets: 2, folders: 0 } }),
			listFolders: () => reply,
		}),
	})
	reply = foldersResponse(grown)
	await t.actions.createFolder(null, 'New')
	eq(t.api.of('createFolder')[0].args, [{ name: 'New', parentId: null }])
	eq(t.state.folders.folders.length, 21, 'the tree shows the new folder')
	await t.actions.createFolder(ACME.id, 'Sub')
	eq(t.api.of('createFolder')[1].args, [{ name: 'Sub', parentId: ACME.id }])

	await t.actions.renameFolder(ACME.id, 'Acme Co')
	eq(t.api.of('patchFolder')[0].args, [ACME.id, { name: 'Acme Co' }])
	await t.actions.moveFolder(ACME.id, null)
	eq(t.api.of('patchFolder')[1].args, [ACME.id, { parentId: null }], 'null moves it to the top')
	await t.clock.advance(500)
	assert(t.search.items.length >= 1, 'the cards show folder paths, so the list reloads after a rename or a move')

	// Dropping cards on a folder: a bulk move of exactly those ids.
	await t.actions.dropAssets(ACME.id, [hex(1), hex(2)])
	eq(lastBulk(t), { action: 'move', target: { ids: [hex(1), hex(2)] }, folderId: ACME.id })
	eq(t.state.notice.text, 'Moved 2 images.')
	await t.actions.dropAssets(null, [hex(3)])
	eq(lastBulk(t).folderId, null, 'Unfiled')
	await t.actions.dropAssets(ACME.id, [])
	eq(t.api.of('bulk').length, 2, 'nothing dropped, nothing sent')
	t.unmount()

	const failing = setup({
		handlers: bulkHandlers({
			createFolder: () => Promise.reject(apiError('A folder named Acme already exists here.', 409)),
			patchFolder: () => Promise.reject(apiError('A folder cannot go inside itself.', 400)),
			deleteFolder: () => Promise.reject(apiError('Folder not found.', 404)),
			bulk: () => ({ affected: 0 }),
		}),
	})
	await rejects(failing.actions.createFolder(null, 'Acme'), (e) => e.message === 'A folder named Acme already exists here.')
	await rejects(failing.actions.renameFolder(ACME.id, 'x'), (e) => e.message === 'A folder cannot go inside itself.')
	await rejects(failing.actions.moveFolder(ACME.id, ACME_KITCHENS.id), (e) => e.message === 'A folder cannot go inside itself.')
	await rejects(failing.actions.deleteFolder(ACME.id), (e) => e.message === 'Folder not found.')
	await rejects(failing.actions.dropAssets(ACME.id, [hex(1)]), (e) => /No images were moved/.test(e.message))
	eq(failing.api.of('listFolders').length, 0, 'a failure refreshes nothing')
	failing.unmount()
})

await check('folders: deleting the folder that is open goes to where its images went (its parent, or Unfiled), by replaceState', async () => {
	const handlers = bulkHandlers({ deleteFolder: () => ({ moved: { assets: 1, folders: 0 } }) })
	const inside = setup({ initial: baseInitial({ params: { q: 'tag:a', folder: ACME_KITCHENS.id } }), search: `?q=tag%3Aa&folder=${ACME_KITCHENS.id}`, handlers })
	await inside.actions.deleteFolder(ACME_KITCHENS.id)
	eq(inside.state.params, { q: 'tag:a', folder: ACME.id })
	eq(lastWrite(inside), ['replace', `/account/media?q=tag%3Aa&folder=${ACME.id}`])
	inside.unmount()

	const top = setup({ initial: baseInitial({ params: { q: '', folder: FOLDERS[0].id } }), search: `?folder=${FOLDERS[0].id}`, handlers })
	await top.actions.deleteFolder(FOLDERS[0].id)
	eq(top.state.params, { q: '', folder: 'unfiled' })
	top.unmount()

	// Deleting some other folder leaves the view alone and reloads the list.
	const other = setup({ initial: baseInitial({ params: { q: '', folder: ACME.id } }), search: `?folder=${ACME.id}`, handlers })
	await other.actions.deleteFolder(ACME_KITCHENS.id)
	eq(other.state.params, { q: '', folder: ACME.id })
	await other.clock.advance(500)
	eq(other.search.items.length, 1)
	other.unmount()
})

await check('saved searches: applying one is a new history entry; saving stores what is on screen; the newest is first; failures are sentences', async () => {
	const t = setup({
		handlers: {
			createSaved: (input) => ({ id: hex(5003), name: input.name, query: input.query, folder: input.folder, sort: input.sort, createdAt: '2026-03-01T00:00:00.000Z' }),
			deleteSaved: () => ({ ok: true }),
		},
	})
	t.actions.applySaved(SAVED[1])
	eq(t.state.params, { q: 'kind:logo', folder: ACME.id, sort: 'name' })
	eq(t.state.draft, 'kind:logo')
	eq(lastWrite(t), ['push', `/account/media?q=kind%3Alogo&folder=${ACME.id}&sort=name`])
	const p = searchParamsOf(lastSearch(t))
	eq([p.q, p.folder, p.sort, p.facets], ['kind:logo', ACME.id, 'name', true])
	answer(lastSearch(t), many(3), { total: 3 })
	await flush()

	await t.actions.saveSearch('Logos here')
	eq(t.api.of('createSaved')[0].args, [{ name: 'Logos here', query: 'kind:logo', folder: ACME.id, sort: 'name' }])
	eq(t.state.saved.map((s) => s.name), ['Logos here', 'Kitchen photos', 'Acme logos'])
	assert(t.state.announcement.text.includes('Saved the search "Logos here"'))
	await t.actions.deleteSaved(hex(5001))
	eq(t.state.saved.map((s) => s.id), [hex(5003), hex(5002)])
	eq(t.api.of('deleteSaved')[0].args, [hex(5001)])

	// A saved search with no folder and no sort sends nulls; one saved twice is not listed twice.
	t.actions.applySaved(SAVED[0])
	eq(t.state.params, { q: 'tag:kitchen type:jpg' })
	eq(lastWrite(t), ['push', '/account/media?q=tag%3Akitchen+type%3Ajpg'])
	t.unmount()

	const failing = setup({ handlers: { createSaved: () => Promise.reject(apiError('A saved search with that name already exists.', 409)), deleteSaved: () => Promise.reject(apiError('Saved search not found.', 404)) } })
	failing.actions.submitDraft('x')
	await rejects(failing.actions.saveSearch('Dup'), (e) => /already exists/.test(e.message))
	eq(failing.state.saved.length, 2, 'nothing was added')
	await rejects(failing.actions.deleteSaved(hex(5001)), (e) => /not found/.test(e.message))
	eq(failing.state.saved.length, 2, 'nothing was removed')
	failing.unmount()
})

await check('saved searches: a saved search whose folder was deleted still applies (the server says the folder is gone, the page shows it)', async () => {
	const t = setup()
	t.actions.applySaved({ ...SAVED[1], folder: hex(7777) })
	eq(t.state.params.folder, hex(7777))
	assert(lib.selectEmptyKind(t.state) === 'missing-folder', 'the empty state names the problem')
	t.unmount()
})

await check('tags: a rename or merge that changes the slug rewrites the tag: chips of the open query and searches again; other changes just refresh', async () => {
	const rename = manual()
	const initial = baseInitial({ params: { q: 'tag:van blue' } })
	const t = setup({ initial, search: '?q=tag%3Avan+blue', handlers: bulkHandlers({ renameTag: rename, mergeTag: () => ({ affected: 2, slug: 'truck', merged: true }), deleteTag: () => ({ affected: 2 }) }) })
	const result = t.actions.renameTag('van', 'Truck')
	rename.items[0].resolve({ affected: 2, slug: 'truck', merged: true })
	eq(await result, { slug: 'truck', merged: true })
	eq(t.state.params.q, 'tag:truck blue')
	eq(t.state.draft, 'tag:truck blue', 'the box shows it too')
	eq(lastWrite(t), ['replace', '/account/media?q=tag%3Atruck+blue'])
	eq(searchParamsOf(lastSearch(t)).q, 'tag:truck blue')
	t.unmount()

	// Merging does the same.
	const m = setup({ initial, search: '?q=tag%3Avan+blue', handlers: bulkHandlers({ mergeTag: () => ({ affected: 2, slug: 'truck', merged: true }) }) })
	await m.actions.mergeTag('van', 'truck')
	eq(m.state.params.q, 'tag:truck blue')
	eq(m.api.of('mergeTag')[0].args, ['van', 'truck'])
	m.unmount()

	// A rename that keeps the slug, a tag that is not in the query, and a deletion: no rewrite, a refresh.
	for (const [name, run, expected] of [
		['same slug', (x) => x.actions.renameTag('van', 'VAN'), 'tag:van blue'],
		['not in the query', (x) => x.actions.renameTag('bath', 'Bathroom'), 'tag:van blue'],
		['deleted', (x) => x.actions.deleteTag('van'), 'tag:van blue'],
	]) {
		const x = setup({
			initial,
			search: '?q=tag%3Avan+blue',
			handlers: bulkHandlers({
				renameTag: (slug, label) => ({ affected: 1, slug: slug === 'van' ? 'van' : 'bathroom', merged: false }),
				deleteTag: () => ({ affected: 2 }),
			}),
		})
		await run(x)
		eq(x.state.params.q, expected, name)
		await x.clock.advance(1000)
		assert(x.search.items.length >= 1, `${name}: the list reloads`)
		x.unmount()
	}

	// The slug in a different clause shape: a negation and a list are rewritten, a prefix is kept.
	const shapes = setup({ initial: baseInitial({ params: { q: '-tag:van tag:van,bath* kitchen' } }), search: '?q=-tag%3Avan+tag%3Avan%2Cbath*+kitchen', handlers: bulkHandlers({ renameTag: () => ({ affected: 3, slug: 'truck', merged: false }) }) })
	await shapes.actions.renameTag('van', 'Truck')
	eq(shapes.state.params.q, '-tag:truck tag:truck,bath* kitchen')
	shapes.unmount()

	const failing = setup({ initial, search: '?q=tag%3Avan+blue', handlers: { renameTag: () => Promise.reject(apiError('That tag name is not valid.', 400)) } })
	await rejects(failing.actions.renameTag('van', '!!!'), (e) => e.message === 'That tag name is not valid.')
	eq(failing.state.params.q, 'tag:van blue', 'a failed rename changes nothing')
	failing.unmount()
})

await check('tags and suggestions: the tag list asks for up to 2,000, suggestions fail soft to [], and the signal is passed', async () => {
	const listTags = manual()
	const suggest = manual()
	const t = setup({ handlers: { listTags, suggest } })
	const all = t.actions.fetchTags()
	eq(listTags.items[0].args[0], { limit: 2000 })
	listTags.items[0].resolve([{ slug: 'a', label: 'A', count: 1, manual: 1, auto: 0 }])
	eq((await all).length, 1)
	const failing = t.actions.fetchTags()
	listTags.items[1].reject(apiError('Tags are down.', 500))
	await rejects(failing, (e) => e.message === 'Tags are down.')

	const tagSuggestions = t.actions.fetchTagSuggestions('kit')
	eq(listTags.items[2].args[0], { q: 'kit', limit: 20 })
	listTags.items[2].reject(apiError('x', 500))
	eq(await tagSuggestions, [], 'a failing suggestion box is an empty one')

	const controller = new AbortController()
	const typed = t.actions.fetchSuggestions('ki', controller.signal)
	eq(suggest.items[0].args[0], 'ki')
	assert(suggest.items[0].signal === controller.signal, 'the box aborts it when the person keeps typing')
	suggest.items[0].resolve([{ kind: 'tag', label: 'Kitchen', insert: 'tag:kitchen' }])
	eq((await typed).length, 1)
	const failed = t.actions.fetchSuggestions('ki', new AbortController().signal)
	suggest.items[1].reject(apiError('x', 500))
	eq(await failed, [])
	t.unmount()
})

await check('uploads: a burst of registrations refreshes the list, the counts and the tagging status once, and the queue count rises', async () => {
	const t = setup({ initial: baseInitial({ tagging: TAGGING_ON }), handlers: bulkHandlers({ processStatus: () => ({ ...TAGGING_ON, pending: 5 }) }) })
	for (let i = 0; i < 5; i++)
		t.actions.onRegistered({ status: 'created', asset: asset(900 + i, { folderId: ACME.id, tagging: { status: 'pending' } }) })
	eq([t.state.pending, t.state.tagging.pending], [5, 5])
	// A duplicate is not new work.
	t.actions.onRegistered({ status: 'duplicate', asset: asset(1) })
	eq(t.state.pending, 5)
	await t.clock.advance(499)
	eq(t.api.of('listFolders').length, 0)
	await t.clock.advance(1)
	eq([t.api.of('listFolders').length, t.api.of('processStatus').length, t.search.items.length], [1, 1, 1], 'six registrations, one refresh of each')
	t.unmount()
})

await check('uploads: "N added. Select them" selects the new images, opens their folder, clears the typed query and the sort, and reloads', async () => {
	const t = setup({ handlers: bulkHandlers() })
	t.actions.submitDraft('sink')
	t.actions.setSort('name')
	answer(lastSearch(t), many(5), { total: 5 })
	await flush()
	const ids = [900, 901, 902].map(hex)
	for (const id of ids) t.actions.onRegistered({ status: 'created', asset: asset(Number.parseInt(id, 16), { folderId: ACME.id }) })
	const before = t.search.items.length
	t.actions.onSelectBatch(ids)
	eq(t.state.params, { q: '', folder: ACME.id }, 'the query and the sort are gone; the folder is where they went')
	eq(t.state.draft, '')
	eq(lastWrite(t), ['push', `/account/media?folder=${ACME.id}`])
	eq(selectedIds(t), [...ids].sort())
	eq(t.state.selecting, true)
	eq(t.search.items.length, before + 1)
	const p = searchParamsOf(lastSearch(t))
	eq([p.q, p.folder, p.facets], ['', ACME.id, true])
	answer(lastSearch(t), many(3, {}, 900), { total: 3 })
	await flush()
	eq(selectedIds(t), [...ids].sort(), 'the arrival of the list keeps them selected')
	t.unmount()

	// Where the destination cannot be told: everywhere. Unfiled: Unfiled.
	const mixed = setup({ handlers: bulkHandlers() })
	mixed.actions.onRegistered({ status: 'created', asset: asset(900, { folderId: ACME.id }) })
	mixed.actions.onRegistered({ status: 'created', asset: asset(901, { folderId: null }) })
	mixed.actions.onSelectBatch([hex(900), hex(901)])
	eq(mixed.state.params, { q: '' }, 'two folders: show everything')
	mixed.unmount()
	const root = setup({ handlers: bulkHandlers() })
	root.actions.onRegistered({ status: 'created', asset: asset(900, { folderId: null }) })
	root.actions.onSelectBatch([hex(900)])
	eq(root.state.params, { q: '', folder: 'unfiled' })
	root.unmount()
	const unknown = setup({ handlers: bulkHandlers() })
	unknown.actions.onSelectBatch([hex(555)])
	eq(unknown.state.params, { q: '' })
	eq(selectedIds(unknown), [hex(555)])
	unknown.actions.onSelectBatch([])
	eq(selectedIds(unknown), [hex(555)], 'an empty batch is ignored')
	unknown.unmount()
})

/* ========================================================================== */
/* The controller: the AI loop, remembered choices, the live region           */
/* ========================================================================== */

const TAGGED = (i, over = {}) =>
	asset(i, {
		tagging: { status: 'done' },
		tags: [
			{ slug: 'kitchen', label: 'Kitchen', source: 'manual' },
			{ slug: 'sink', label: 'Sink', source: 'auto', via: 'vision', confidence: 0.9 },
		],
		...over,
	})
const batch = (ids, over = {}) => ({
	processed: ids.map((i) => ({ id: hex(i), status: 'done', asset: TAGGED(i) })),
	remaining: 3,
	configured: true,
	budgetExhausted: false,
	...over,
})

/** A mounted library with `pending` images waiting and a fake POST /process that answers from a queue. */
function aiSetup({ pending = 3, tagging, can, responses = [], status, handlers = {}, hidden = false } = {}) {
	const queue = [...responses]
	const calls = []
	let t
	const process = (options, signal) => {
		calls.push({ at: t.clock.now(), options, signal })
		const next = queue.shift()
		if (typeof next === 'function') return next(signal)
		if (next instanceof Error) return Promise.reject(next)
		return Promise.resolve(next ?? batch([], { remaining: 0 }))
	}
	const list = [asset(1, { match: { score: 3, fields: ['tag'] } }), ...many(59, {}, 2)]
	t = setup({
		initial: baseInitial({
			tagging: tagging ?? { ...TAGGING_ON, pending },
			search: searchResponse(list, { total: 312, hasMore: true, pending }),
		}),
		can,
		mount: !hidden,
		handlers: bulkHandlers({ process, processStatus: status ?? (() => ({ ...TAGGING_ON, pending: 0 })), ...handlers }),
	})
	if (hidden) {
		t.env.loc.hidden = true
		t.unmount = t.controller.mount()
	}
	t.calls = calls
	t.queue = queue
	return t
}

await check('ai loop (page): while images wait it asks for a batch at once, patches the answer into the cards, goes on 3 s later and stops at zero', async () => {
	const t = aiSetup({ responses: [batch([1, 2], { remaining: 1 }), batch([3], { remaining: 0 })] })
	eq(t.state.aiWorking, true, 'the banner can say it is working')
	await t.clock.advance(0)
	eq(t.calls.length, 1)
	eq(t.calls[0].options, {})
	eq(slugs(t.state.assets[0]), ['kitchen:manual', 'sink:auto'], 'the card shows the new tags')
	eq(t.state.assets[0].tagging.status, 'done')
	eq(t.state.assets[0].match, { score: 3, fields: ['tag'] }, 'and keeps its own "matched" note')
	eq(t.state.pending, 1)
	assert(/Tagged 2 images\. 1 left\./.test(t.state.announcement.text), t.state.announcement.text)
	await t.clock.advance(2999)
	eq(t.calls.length, 1, 'not before 3 s')
	await t.clock.advance(1)
	eq(t.calls.length, 2)
	eq([t.state.aiWorking, t.state.pending], [false, 0])
	assert(/Auto-tagging finished\. 3 images tagged\./.test(t.state.announcement.text), t.state.announcement.text)
	await t.clock.advance(0)
	eq(t.api.of('processStatus').length, 1, 'the status is read once more at the end')
	await t.clock.advance(120_000)
	eq(t.calls.length, 2)
	eq(t.clock.pending, 0, 'nothing is left scheduled')
	t.unmount()
})

await check('ai loop (page): it does not start without a key, without anything waiting, with the budget spent, or for a viewer', async () => {
	for (const [name, opts] of [
		['no key', { tagging: { ...TAGGING_OFF, pending: 3 } }],
		['nothing waiting', { pending: 0 }],
		['budget spent', { tagging: { ...TAGGING_ON, pending: 3, budgetExhausted: true, resetsAt: '2026-10-05T00:00:00.000Z' } }],
		['a viewer', { can: { write: false, delete: false } }],
	]) {
		const t = aiSetup(opts)
		await t.clock.advance(60_000)
		eq(t.calls.length, 0, name)
		eq(t.state.aiWorking, false, name)
		t.unmount()
	}
})

await check('ai loop (page): a bad key stops it and shows the message; "Tag them now" asks again with requeue and clears it', async () => {
	const t = aiSetup({ responses: [batch([], { blocked: { kind: 'config', message: 'The AI key was rejected.' }, remaining: 3 }), batch([1], { remaining: 0 })] })
	await t.clock.advance(0)
	eq(t.calls.length, 1)
	eq(t.state.aiBlocked, 'The AI key was rejected.')
	eq(t.state.aiWorking, false)
	assert(t.state.announcement.text.includes('The AI key was rejected.'))
	await t.clock.advance(120_000)
	eq(t.calls.length, 1, 'it stays stopped')
	t.actions.tagUntagged()
	eq(t.state.aiBlocked, null, 'the old message goes the moment a new try starts')
	await t.clock.advance(0)
	eq(t.calls.length, 2)
	eq(t.calls[1].options, { requeue: true })
	t.unmount()

	// A viewer cannot ask.
	const viewer = aiSetup({ can: { write: false, delete: false } })
	viewer.actions.tagUntagged()
	await viewer.clock.advance(60_000)
	eq(viewer.calls.length, 0)
	viewer.unmount()
})

await check('ai loop (page): the daily budget stops it and the status says when it resumes', async () => {
	const t = aiSetup({
		responses: [batch([1], { budgetExhausted: true, remaining: 2 })],
		status: () => ({ ...TAGGING_ON, pending: 2, budgetExhausted: true, resetsAt: '2026-10-05T00:00:00.000Z' }),
	})
	await t.clock.advance(0)
	eq([t.state.tagging.budgetExhausted, t.state.aiWorking], [true, false])
	assert(/daily auto-tagging limit/i.test(t.state.announcement.text), t.state.announcement.text)
	await t.clock.advance(60_000)
	eq(t.calls.length, 1)
	eq(t.state.tagging.resetsAt, '2026-10-05T00:00:00.000Z')
	t.unmount()
})

await check('ai loop (page): a rate limit waits what the server asked; errors back off quietly; a 403 stops it until someone asks', async () => {
	const limited = aiSetup({ responses: [batch([], { blocked: { kind: 'rate_limited', message: 'busy', retryAfterMs: 20_000 }, remaining: 3 }), batch([1], { remaining: 0 })] })
	await limited.clock.advance(0)
	await limited.clock.advance(19_999)
	eq(limited.calls.length, 1)
	await limited.clock.advance(1)
	eq(limited.calls.length, 2)
	eq(limited.state.aiBlocked, null, 'a rate limit is a wait, not a stop')
	limited.unmount()

	const flaky = aiSetup({ responses: [apiError('Down.', 500), apiError('Down.', 502), batch([1], { remaining: 0 })] })
	await flaky.clock.advance(0)
	eq(flaky.calls.length, 1)
	await flaky.clock.advance(5999)
	eq(flaky.calls.length, 1)
	await flaky.clock.advance(1)
	eq(flaky.calls.length, 2, 'after 6 s')
	await flaky.clock.advance(11_999)
	eq(flaky.calls.length, 2)
	await flaky.clock.advance(1)
	eq(flaky.calls.length, 3, 'after 12 s more')
	eq(flaky.state.notice, null, 'a hiccup is not shown')
	assert(gapsOf({ calls: flaky.calls }).every((gap) => gap >= 3000 && gap <= 30_000), 'never faster than 3 s, never slower than 30 s')
	flaky.unmount()

	const denied = aiSetup({ responses: [apiError('Your role does not allow that.', 403), batch([1], { remaining: 0 })] })
	await denied.clock.advance(0)
	eq(denied.state.notice.tone, 'error')
	assert(denied.state.notice.text.includes('Auto-tagging stopped'), denied.state.notice.text)
	await denied.clock.advance(120_000)
	eq(denied.calls.length, 1)
	denied.actions.onRegistered({ status: 'created', asset: asset(900, { tagging: { status: 'pending' } }) })
	await denied.clock.advance(60_000)
	eq(denied.calls.length, 1, 'a new upload does not restart what the server refused')
	denied.actions.tagUntagged()
	await denied.clock.advance(0)
	eq(denied.calls.length, 2, 'a person asking does')
	denied.unmount()
})

await check('ai loop (page): nothing is sent from a background tab, and it goes on when the tab is back', async () => {
	const t = aiSetup({ responses: [batch([1], { remaining: 5 }), batch([2], { remaining: 5 }), batch([3], { remaining: 0 })] })
	await t.clock.advance(0)
	eq(t.calls.length, 1)
	t.env.setHidden(true)
	await t.clock.advance(120_000)
	eq(t.calls.length, 1, 'a hidden tab sends nothing')
	t.env.setHidden(false)
	await t.clock.advance(0)
	eq(t.calls.length, 2, 'the overdue call goes as soon as the tab is visible')
	t.unmount()

	const background = aiSetup({ hidden: true, responses: [batch([1], { remaining: 0 })] })
	await background.clock.advance(60_000)
	eq(background.calls.length, 0, 'opened in a background tab: it waits')
	background.env.setHidden(false)
	await background.clock.advance(0)
	eq(background.calls.length, 1)
	background.unmount()
})

await check('ai loop (page): one batch at a time (new uploads do not overlap it), a role change stops and restarts it, unmount aborts it', async () => {
	let release
	const t = aiSetup({ responses: [() => new Promise((resolve) => (release = () => resolve(batch([1], { remaining: 3 }))))] })
	await t.clock.advance(0)
	eq(t.calls.length, 1)
	for (let i = 0; i < 5; i++) t.actions.onRegistered({ status: 'created', asset: asset(900 + i, { tagging: { status: 'pending' } }) })
	await t.clock.advance(60_000)
	eq(t.calls.length, 1, 'a batch is in flight: nothing overlaps it')
	release()
	await t.clock.advance(0)
	await t.clock.advance(3000)
	eq(t.calls.length, 2)
	t.unmount()

	const role = aiSetup({ responses: [batch([1], { remaining: 5 }), batch([2], { remaining: 5 })] })
	await role.clock.advance(0)
	role.can = { write: false, delete: false }
	role.actions.permissionsChanged()
	eq(role.state.aiWorking, false)
	await role.clock.advance(60_000)
	eq(role.calls.length, 1, 'a viewer must not keep calling an endpoint that refuses them')
	role.can = { write: true, delete: true }
	role.actions.permissionsChanged()
	await role.clock.advance(0)
	eq(role.calls.length, 2)
	role.unmount()

	const aborted = aiSetup({ responses: [(signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(abortError())))] })
	await aborted.clock.advance(0)
	aborted.unmount()
	assert(aborted.calls[0].signal.aborted, 'leaving the page aborts the request')
	eq(aborted.clock.pending, 0)
})

await check('ai loop (page): an explicit ask made before the role lost write never goes out', async () => {
	const t = aiSetup({ pending: 0, responses: [batch([1], { remaining: 0 })] })
	t.actions.tagUntagged()
	eq(t.state.aiWorking, true, 'the ask is scheduled')
	t.can = { write: false, delete: false }
	t.actions.permissionsChanged()
	eq(t.state.aiWorking, false)
	await t.clock.advance(60_000)
	eq(t.calls.length, 0, 'a role that cannot write never reaches /process, whatever was asked before')
	t.can = { write: true, delete: true }
	t.actions.permissionsChanged()
	await t.clock.advance(60_000)
	eq(t.calls.length, 0, 'and getting it back does not replay the old ask: nothing is waiting')
	t.unmount()
})

await check('ai loop (page): a status read that finds the queue empty while a batch is out does not abort it; its answer lands and, if images still wait, the loop goes on', async () => {
	let release
	const t = aiSetup({
		// The server finished the batch a moment before the status was read; the answer is still on its way.
		status: () => ({ ...TAGGING_ON, pending: 0, running: 0 }),
		responses: [() => new Promise((resolve) => (release = () => resolve(batch([1, 2], { remaining: 4 })))), batch([3], { remaining: 0 })],
	})
	await t.clock.advance(0)
	eq(t.calls.length, 1)
	t.actions.onRegistered({ status: 'created', asset: asset(900, { tagging: { status: 'done' } }) })
	await t.clock.advance(500)
	eq(t.api.of('processStatus').length, 1)
	eq(t.state.pending, 0, 'the status said nothing is waiting')
	eq(t.state.aiWorking, false, 'so the loop is paused')
	assert(!t.calls[0].signal.aborted, 'but the batch that is out is not abandoned')
	release()
	await t.clock.advance(0)
	eq(slugs(t.state.assets[0]), ['kitchen:manual', 'sink:auto'], 'its answer reached the cards')
	eq(t.state.pending, 4)
	eq(t.state.aiWorking, true, 'and the answer says four are still waiting, so the loop goes on')
	await t.clock.advance(3000)
	eq(t.calls.length, 2)
	t.unmount()

	// Paused and the answer says the queue is empty: it finishes the way a finished loop does.
	let release2
	const done = aiSetup({
		status: () => ({ ...TAGGING_ON, pending: 0, running: 0 }),
		responses: [() => new Promise((resolve) => (release2 = () => resolve(batch([1], { remaining: 0 }))))],
	})
	await done.clock.advance(0)
	done.actions.onRegistered({ status: 'created', asset: asset(900, { tagging: { status: 'done' } }) })
	await done.clock.advance(500)
	release2()
	await done.clock.advance(0)
	assert(/Auto-tagging finished/.test(done.state.announcement.text), done.state.announcement.text)
	eq(done.state.aiWorking, false)
	done.unmount()
})

await check('ai loop (page): counts that disagree cannot make it spin (the 3 s / 10 s spacing holds across a stop and a restart), and hostile counts read as zero', async () => {
	// The status keeps saying one image waits while /process keeps saying the queue is empty.
	const t = aiSetup({ pending: 0, status: () => ({ ...TAGGING_ON, pending: 1, running: 0 }) })
	t.actions.onRegistered({ status: 'created', asset: asset(900, { tagging: { status: 'pending' } }) })
	await t.clock.advance(60_000)
	const gaps = gapsOf({ calls: t.calls })
	assert(t.calls.length >= 2 && t.calls.length <= 8, `${t.calls.length} calls in a minute`)
	assert(gaps.every((gap) => gap >= 10_000), `an empty answer is followed by 10 s, got ${gaps}`)
	t.unmount()
	// A reply with a missing or hostile count is read as zero, never as NaN that keeps a loop spinning.
	for (const remaining of [undefined, null, 'many', Number.NaN, -4, 0.5, Number.POSITIVE_INFINITY]) {
		const x = aiSetup({ responses: [batch([1], { remaining })] })
		await x.clock.advance(0)
		eq(x.state.pending, 0, `remaining ${String(remaining)}`)
		await x.clock.advance(60_000)
		eq(x.calls.length, 1, `remaining ${String(remaining)} does not loop`)
		eq(x.state.aiWorking, false, `remaining ${String(remaining)}: the banner stops saying it is working`)
		assert(/Auto-tagging finished/.test(x.state.announcement.text), `remaining ${String(remaining)}: ${x.state.announcement.text}`)
		x.unmount()
	}
})

await check('ai loop (page): queuing images again (auto-tag again) starts the loop even when nothing was waiting before', async () => {
	const t = aiSetup({ pending: 0, responses: [batch([1], { remaining: 0 })], handlers: { bulk: () => ({ affected: 2 }) } })
	await t.clock.advance(60_000)
	eq(t.calls.length, 0)
	pick(t, 1, 2)
	await t.actions.bulkRetag()
	eq([t.state.pending, t.state.aiWorking], [2, true])
	await t.clock.advance(0)
	eq(t.calls.length, 1)
	t.unmount()
})

await check('ai loop (page): "Tag them now" pressed while a batch is out is not lost when that batch answers with nothing left', async () => {
	let release
	const t = aiSetup({ responses: [() => new Promise((resolve) => (release = () => resolve(batch([1], { remaining: 0 })))), batch([2], { remaining: 0 })] })
	await t.clock.advance(0)
	eq(t.calls.length, 1)
	t.actions.tagUntagged()
	eq(t.state.aiBlocked, null)
	release()
	await t.clock.advance(0)
	eq(t.calls.length, 2, 'the ask goes as soon as the batch in flight answers')
	eq(t.calls[1].options, { requeue: true })
	await t.clock.advance(60_000)
	eq(t.calls.length, 2)
	eq(t.state.aiWorking, false)
	t.unmount()
})

await check('remembered choices: density and recent searches come back from storage at mount; hostile values and a missing store change nothing', async () => {
	const t = setup({ mount: false })
	t.env.storage.set('rb.media.density', 'large')
	t.env.storage.set('rb.media.recent', JSON.stringify(['kitchen', 'bath', 'kitchen', 5, '']))
	t.unmount = t.controller.mount()
	eq([t.state.density, t.state.recent], ['large', ['kitchen', 'bath']])
	const writes = t.env.storage.size
	t.actions.setDensity('large')
	eq(t.env.storage.size, writes, 'the same density is not written again')
	t.actions.setDensity('compact')
	eq(t.env.storage.get('rb.media.density'), 'compact')
	for (let i = 0; i < 12; i++) t.actions.submitDraft(`search ${i}`)
	eq(JSON.parse(t.env.storage.get('rb.media.recent')).length, 8, 'eight, newest first')
	eq(t.state.recent[0], 'search 11')
	t.unmount()

	const hostile = setup({ mount: false })
	hostile.env.storage.set('rb.media.density', '<script>')
	hostile.env.storage.set('rb.media.recent', '{"__proto__":{"x":1}}')
	hostile.unmount = hostile.controller.mount()
	eq([hostile.state.density, hostile.state.recent], ['comfortable', []])
	hostile.unmount()
})

await check('the live region: counts ("at least N" when truncated), load-more additions, tagging progress and errors, each a new message', async () => {
	const t = setup()
	t.actions.submitDraft('kitchen')
	const before = t.state.announcement.id
	answer(lastSearch(t), many(5), { total: 5 })
	await flush()
	eq(t.state.announcement.text, '5 results.')
	assert(t.state.announcement.id > before)

	t.actions.submitDraft('bath')
	answer(lastSearch(t), many(60), { total: 5000, truncated: true, hasMore: true })
	await flush()
	eq(t.state.announcement.text, 'At least 5,000 results.')

	t.actions.submitDraft('technician sink')
	answer(lastSearch(t), many(2), { total: 2, dropped: ['sink'], corrections: [{ from: 'kithcen', to: 'kitchen' }] })
	await flush()
	eq(t.state.announcement.text, '2 results. No images mention sink. Showing results for kitchen.')

	t.actions.submitDraft('nothing')
	answer(lastSearch(t), [], { total: 0 })
	await flush()
	eq(t.state.announcement.text, 'No results.')

	// A reload in place with the same total says nothing new; a changed total does.
	t.actions.refresh()
	const id = t.state.announcement.id
	answer(lastSearch(t), [], { total: 0 })
	await flush()
	eq(t.state.announcement.id, id)
	t.actions.refresh()
	answer(lastSearch(t), many(3), { total: 3 })
	await flush()
	eq(t.state.announcement.text, '3 results.')

	// The same words twice are still two messages (the region is told to change).
	t.actions.announce('Same words.')
	const first = t.state.announcement.id
	t.actions.announce('Same words.')
	assert(t.state.announcement.id > first)
	eq(t.state.announcement.text, 'Same words.')
	t.unmount()
})

/* ========================================================================== */
/* A hook-aware mini renderer, for effects, handlers and the assembled tree   */
/* ========================================================================== */

const INTERNALS = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
const MEMO = Symbol.for('react.memo')
const FORWARD = Symbol.for('react.forward_ref')
const FRAGMENT = Symbol.for('react.fragment')
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))

/**
 * Renders a component tree with hooks that really keep state, and runs effects in React's
 * order: every layout effect of a commit, then (after `afterLayout`) every passive one.
 * `strict` replays the first commit's effects the way StrictMode does: cleanup, then again.
 * Only function components, memo and forwardRef are expanded; whatever is not under test is
 * mocked out as a function component first.
 */
function mountTree(Component, initialProps, { afterLayout, strict = false } = {}) {
	const instances = new Map()
	let props = initialProps
	let tree = []
	let layoutQueue = []
	let passiveQueue = []
	let dirty = false
	let batch = 0
	let alive = true
	let idCounter = 0
	let commits = 0

	const markDirty = () => {
		dirty = true
		if (batch === 0)
			queueMicrotask(() => {
				if (dirty && alive && batch === 0) flushTree()
			})
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
			useSyncExternalStore(subscribe, getSnapshot) {
				const s = slot()
				index++
				const value = getSnapshot()
				s.snapshot = value
				if (!s.ran) {
					s.ran = true
					s.sub = {}
					layoutQueue.push({
						s: s.sub,
						effect: () => {
							const check = () => {
								if (!Object.is(getSnapshot(), s.snapshot)) markDirty()
							}
							const off = subscribe(check)
							check() // a change between the render and the subscription is not lost
							return off
						},
					})
				}
				return value
			},
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
		if (typeof type === 'string') return [{ type, props: p, path: here, children: expand(p.children, here) }]
		if (type.$$typeof === MEMO) return expand({ ...node, type: type.type }, path)
		if (type.$$typeof === FORWARD || typeof type === 'function') return expand(callComponent(type, p, here), here)
		throw new Error(`mountTree: cannot expand ${String(type)}`)
	}

	const runQueue = (queue) => {
		for (const { s, effect } of queue) {
			if (typeof s.cleanup === 'function') s.cleanup()
			s.cleanup = effect()
		}
	}

	function renderOnce() {
		layoutQueue = []
		passiveQueue = []
		tree = expand(h(Component, props), 'root')
		const layout = layoutQueue
		const passive = passiveQueue
		commits++
		runQueue(layout)
		afterLayout?.(commits)
		runQueue(passive)
		if (strict && commits === 1) {
			// StrictMode: tear every effect down and run it again, once, on the first commit.
			for (const { s } of [...layout, ...passive]) {
				if (typeof s.cleanup === 'function') s.cleanup()
				s.cleanup = undefined
			}
			runQueue(layout)
			runQueue(passive)
		}
	}

	function flushTree() {
		batch++
		try {
			let guard = 0
			do {
				dirty = false
				renderOnce()
				if (++guard > 80) throw new Error('mountTree: render loop did not settle')
			} while (dirty)
		} finally {
			batch--
		}
	}

	const hosts = (nodes, out = []) => {
		for (const n of nodes) {
			if (n.text !== undefined) continue
			out.push(n)
			hosts(n.children, out)
		}
		return out
	}
	const textOf = (n) => (n.text !== undefined ? n.text : n.children.map(textOf).join(''))

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
			if (batch === 0) flushTree()
			return result
		},
		flush: flushTree,
		setProps(next) {
			props = { ...props, ...next }
			flushTree()
		},
		get commits() {
			return commits
		},
		find: (predicate) => hosts(tree).find(predicate),
		findAll: (predicate) => hosts(tree).filter(predicate),
		text: textOf,
		get textContent() {
			return tree.map(textOf).join('')
		},
		unmount() {
			alive = false
			for (const inst of instances.values())
				for (const s of inst.hooks) if (s && typeof s.cleanup === 'function') s.cleanup()
			for (const inst of instances.values())
				for (const s of inst.hooks) if (s?.sub && typeof s.sub.cleanup === 'function') s.sub.cleanup()
		},
	}
	flushTree()
	return api
}

/** A fresh copy of the state machine as a browser would load it: with a `window`, so it picks the layout effect. */
function loadHookInBrowser() {
	clearCache()
	const had = 'window' in globalThis
	const before = globalThis.window
	globalThis.window = {}
	try {
		return { lib: loadTs('src/app/account/media/use-media-library.ts'), api: loadTs('src/app/account/media/media-api.ts') }
	} finally {
		if (had) globalThis.window = before
		else delete globalThis.window
	}
}

await check('the hook: the first render is exactly what the server rendered, then a LAYOUT effect (not a passive one) reconciles the URL and starts the fetch', async () => {
	const stack = loadHookInBrowser()
	const t = setup({ stack: stack.lib, mount: false, search: '?q=kitchen&sort=oldest' })
	const seen = []
	let latest
	function Probe(props) {
		latest = stack.lib.useMediaLibrary(props, t.controller)
		seen.push({ render: true, loading: latest.state.loading, cards: latest.state.assets.length, q: latest.state.params.q })
		return null
	}
	const tree = mountTree(Probe, baseProps(), {
		afterLayout: (commit) => seen.push({ afterLayout: commit, loading: t.state.loading, requests: t.search.items.length }),
	})
	eq(seen[0], { render: true, loading: false, cards: 60, q: '' }, 'hydration sees the server state')
	eq(seen[1], { afterLayout: 1, loading: true, requests: 1 }, 'by the end of the layout phase the URL was read and the first page requested')
	const request = searchParamsOf(t.search.items[0])
	eq([request.q, request.sort, request.facets], ['kitchen', 'oldest', true], 'with facets, from the URL')
	assert(!('offset' in request) || !request.offset)
	eq(seen[2], { render: true, loading: true, cards: 0, q: 'kitchen' }, 'the render after it shows the URL\'s search with no stale cards')
	eq(t.env.listeners, 2)
	tree.unmount()
	eq(t.env.listeners, 0, 'unmounting lets go of popstate and visibility')
	assert(t.search.items[0].signal.aborted, 'and aborts what is in flight')
})

await check('the hook: StrictMode\'s mount, unmount, mount leaves one set of listeners and one live request', async () => {
	const stack = loadHookInBrowser()
	const t = setup({ stack: stack.lib, mount: false, search: '?q=kitchen' })
	function Probe(props) {
		stack.lib.useMediaLibrary(props, t.controller)
		return null
	}
	const tree = mountTree(Probe, baseProps(), { strict: true })
	eq(t.env.listeners, 2, 'not four')
	const live = t.search.items.filter((i) => !i.signal.aborted)
	eq(live.length, 1, 'the request from the discarded first mount is aborted; one is live')
	answer(live[0], many(2), { total: 2 })
	await flush()
	eq([t.state.assets.length, t.state.loading], [2, false])
	tree.unmount()
	eq(t.env.listeners, 0)
})

await check('the hook: StrictMode\'s second mount still opens an image named by ?asset= that is not among the loaded ones', async () => {
	// The first mount's request for the image is aborted by the teardown; the second mount must
	// ask again, or the sheet stays closed for a URL that says it is open (a dev-only failure
	// that hides a real one: any unmount and mount of the same page).
	const stack = loadHookInBrowser()
	const getAsset = manual()
	const t = setup({ stack: stack.lib, mount: false, search: `?asset=${hex(999)}`, handlers: { getAsset } })
	function Probe(props) {
		stack.lib.useMediaLibrary(props, t.controller)
		return null
	}
	const tree = mountTree(Probe, baseProps(), { strict: true })
	const live = getAsset.items.filter((item) => !item.signal.aborted)
	eq(live.length, 1, 'exactly one live request for the image')
	live[0].resolve(asset(999, { name: 'Far away' }))
	await flush()
	eq(stack.lib.selectOpenAsset(t.state)?.name, 'Far away', 'the sheet has its image')
	eq(t.state.openId, hex(999))
	tree.unmount()

	// The same through the controller alone: mount, unmount (the page is left), mount again.
	const again = manual()
	const c = setup({ mount: false, search: `?asset=${hex(998)}`, handlers: { getAsset: again } })
	c.controller.mount()()
	const stop = c.controller.mount()
	const liveAgain = again.items.filter((item) => !item.signal.aborted)
	eq(liveAgain.length, 1, 'a remount asks for the open image again')
	liveAgain[0].resolve(asset(998, { name: 'Remounted' }))
	await flush()
	eq(lib.selectOpenAsset(c.state)?.name, 'Remounted')
	stop()
})

await check('remount: what the unmount interrupted is started again (first page, reload, typed pause, queued refresh, notice timer) and nothing is left waiting', async () => {
	const liveOf = (t) => t.search.items.filter((item) => !item.signal.aborted)

	// A first page in flight when the page went away.
	const first = setup({ search: '?q=kitchen' })
	eq(first.search.items.length, 1)
	first.unmount()
	assert(first.search.items[0].signal.aborted, 'the unmount aborted it')
	const stopFirst = first.controller.mount()
	eq(liveOf(first).length, 1, 'the first page is asked for again')
	eq(first.state.loading, true, 'first: loading again')
	answer(liveOf(first)[0], many(2), { total: 2 })
	await flush()
	eq([first.state.loading, first.state.assets.length, first.state.error], [false, 2, null])
	stopFirst()

	// A reload in place, and a "load more", both cut off.
	const reload = setup()
	reload.actions.refresh()
	eq(reload.state.refreshing, true, 'reload: the refreshing flag')
	reload.unmount()
	const stopReload = reload.controller.mount()
	eq(liveOf(reload).length, 1, 'the reload is asked for again')
	answer(liveOf(reload)[0], many(60, {}, 100), { total: 300, hasMore: true })
	await flush()
	eq([reload.state.refreshing, reload.state.total], [false, 300])
	reload.actions.loadMore()
	eq(reload.state.loadingMore, true, 'reload: the loadingMore flag')
	stopReload()
	const stopMore = reload.controller.mount()
	eq([reload.state.loadingMore, reload.state.error], [false, null], 'a load more that was cut off can be pressed again')
	eq(liveOf(reload).length, 0)
	stopMore()

	// A typed pause that had not run yet, and a refresh that was queued but not yet due.
	const typed = setup({ handlers: bulkHandlers() })
	typed.actions.setDraft('kitchen')
	pick(typed, 1, 2)
	await typed.actions.bulkMove(null)
	typed.unmount()
	await typed.clock.advance(5000)
	eq(typed.search.items.length, 0, 'nothing runs while the page is gone')
	const stopTyped = typed.controller.mount()
	await typed.clock.advance(200)
	eq(typed.search.items.length, 1, 'the typed words are searched after their pause')
	eq(searchParamsOf(typed.search.items[0]).q, 'kitchen')
	await typed.clock.advance(500)
	eq(typed.api.of('listFolders').length, 1, 'and the folder counts the move asked for are refreshed')
	stopTyped()

	// A good-news notice fades after a remount too.
	const notice = setup({ handlers: bulkHandlers() })
	pick(notice, 1, 2)
	await notice.actions.bulkMove(null)
	eq(notice.state.notice?.tone, 'info', 'a good-news notice')
	notice.unmount()
	const stopNotice = notice.controller.mount()
	await notice.clock.advance(lib.NOTICE_MS)
	eq(notice.state.notice, null)
	stopNotice()

	// A mount after an unmount adopts the URL as it is now: the open image that is gone from it closes.
	const closed = setup({ search: `?asset=${hex(3)}` })
	eq(closed.state.openId, hex(3))
	closed.unmount()
	closed.env.loc.search = ''
	const stopClosed = closed.controller.mount()
	eq(closed.state.openId, null)
	stopClosed()
})

await check('the hook: a changed role reaches the controller, and the state object is the store\'s own (no copies, no second source of truth)', async () => {
	const stack = loadHookInBrowser()
	const props = baseProps({ can: { write: true, delete: true } })
	const t = setup({ stack: stack.lib, mount: false, handlers: bulkHandlers() })
	t.can = props.can
	let latest
	function Probe(p) {
		latest = stack.lib.useMediaLibrary(p, t.controller)
		return null
	}
	const tree = mountTree(Probe, props)
	assert(latest.state === t.controller.getState(), 'the hook hands out the store\'s state object')
	eq(latest.actions, t.controller.actions)
	tree.act(() => latest.actions.toggleSelect(hex(1), { range: false }))
	eq(latest.state.selection.ids.size, 1, 'a store change re-renders the hook')
	assert(latest.state === t.controller.getState())
	tree.unmount()
})

await check('the hook (browser path): the page\'s workspace is sent on EVERY call, history gets a fresh {}, storage is used, and no router hook is involved', async () => {
	const stack = loadHookInBrowser()
	const b = fakeBrowser({ search: '?q=kitchen&sort=oldest' })
	const fetched = []
	const jsonOk = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
	const respond = (url, init) => {
		const path = new URL(url, 'http://x').pathname.replace('/api/account/media', '') || '/'
		const method = init.method
		if (path === '/' && method === 'GET') return jsonOk(searchResponse(many(60, {}, 1), { total: 120, hasMore: true }))
		if (path === '/bulk') return jsonOk({ affected: 2 })
		if (path === '/saved') return jsonOk({ saved: { ...SAVED[0], id: hex(5003), name: 'Mine' } })
		if (path === '/tags') return jsonOk({ tags: [] })
		if (path === '/folders') return jsonOk(method === 'POST' ? { folder: FOLDERS[0] } : foldersResponse())
		if (path === '/process' && method === 'POST') return jsonOk({ processed: [], remaining: 0, configured: true, budgetExhausted: false })
		if (path === '/process') return jsonOk(TAGGING_ON)
		if (path.startsWith('/suggest')) return jsonOk({ suggestions: [] })
		if (path.startsWith('/tags/')) return jsonOk({ affected: 1, slug: 'x', merged: false })
		if (path.startsWith('/folders/')) return jsonOk({ folder: FOLDERS[0], moved: { assets: 0, folders: 0 } })
		if (path.startsWith('/saved/')) return jsonOk({ ok: true })
		return jsonOk({ asset: asset(1), ok: true })
	}
	const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
	globalThis.window = b.win
	globalThis.document = b.doc
	globalThis.fetch = async (url, init) => {
		fetched.push({ url, init })
		return respond(url, init)
	}
	let tree
	try {
		let latest
		function Probe(p) {
			latest = stack.lib.useMediaLibrary(p)
			return null
		}
		tree = mountTree(Probe, baseProps({ workspaceId: WS }))
		await flush()
		eq(fetched.length, 1, 'the URL differs from the render, so page 1 is fetched once')
		const first = new URL(fetched[0].url, 'http://x')
		eq(first.pathname, '/api/account/media')
		eq([first.searchParams.get('q'), first.searchParams.get('sort'), first.searchParams.get('facets')], ['kitchen', 'oldest', '1'])
		eq(latest.state.assets.length, 60)

		// Every kind of call the page makes, through the hook's own client.
		latest.actions.loadMore()
		await flush()
		latest.actions.submitDraft('bath')
		await flush()
		await latest.actions.saveSearch('Mine')
		await latest.actions.fetchTags()
		await latest.actions.fetchSuggestions('ba', new AbortController().signal)
		await latest.actions.fetchTagSuggestions('ba')
		await latest.actions.patchAsset({ name: 'x' }, hex(1))
		await latest.actions.deleteAsset(hex(2))
		latest.actions.toggleSelect(hex(3), { range: false })
		await latest.actions.bulkMove(null)
		await latest.actions.createFolder(null, 'New')
		await latest.actions.renameFolder(ACME.id, 'Renamed')
		await latest.actions.deleteFolder(ACME_KITCHENS.id)
		await latest.actions.renameTag('a', 'B')
		await latest.actions.mergeTag('a', 'b')
		await latest.actions.deleteTag('a')
		await latest.actions.deleteSaved(hex(5001))
		await latest.actions.retagAsset(hex(4))
		await flush()
		assert(fetched.length >= 17, `${fetched.length} calls were made`)
		for (const { url, init } of fetched) {
			eq(init.headers['x-media-workspace'], WS, `${init.method} ${url}`)
			assert(url.startsWith('/api/account/media'), url)
			eq(init.cache, 'no-store')
		}
		const methods = new Set(fetched.map((f) => f.init.method))
		eq([...methods].sort(), ['DELETE', 'GET', 'PATCH', 'POST'])

		// History: replaceState while typing, with a fresh object, never history.state.
		assert(b.calls.length >= 1)
		for (const [, data] of b.calls) {
			eq(data, {})
			assert(data !== b.history.state)
		}
		eq(b.calls.find(([kind]) => kind === 'replace')[2], '/account/media?q=bath&sort=oldest#top', 'the hash is kept, and sort stays')
		eq(JSON.parse(b.store.get('rb.media.recent')), ['bath'])
		eq(routerCalls, { usePathname: 0, useSearchParams: 0, useRouter: 0 }, 'library state never goes through the router')
	} finally {
		tree?.unmount()
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete globalThis[key]
			else globalThis[key] = value
		}
	}
})

/* ========================================================================== */
/* The assembled library, server-rendered                                      */
/* ========================================================================== */

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'wbr'])
const decode = (text) =>
	text
		.replace(/&quot;/g, '"')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')

/** A small reader for SSR output: elements, attributes, text. Comments are dropped. */
function parseHtml(html) {
	const root = { tag: '#root', attrs: {}, children: [], parent: null }
	let current = root
	const token = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g
	let match
	while ((match = token.exec(html))) {
		const [, closing, tag, rawAttrs, selfClosing, text] = match
		if (text !== undefined) current.children.push({ text: decode(text) })
		else if (tag) {
			const name = tag.toLowerCase()
			if (closing) {
				let node = current
				while (node && node.tag !== name) node = node.parent
				if (node?.parent) current = node.parent
			} else {
				const attrs = {}
				for (const a of rawAttrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] === undefined ? '' : decode(a[2])
				const node = { tag: name, attrs, children: [], parent: current }
				current.children.push(node)
				if (!VOID.has(name) && !selfClosing) current = node
			}
		}
	}
	return root
}
const walkHtml = (node, visit) => {
	for (const child of node.children ?? []) {
		if (child.text !== undefined) continue
		visit(child)
		walkHtml(child, visit)
	}
}
const findAllNodes = (root, predicate) => {
	const out = []
	walkHtml(root, (n) => predicate(n) && out.push(n))
	return out
}
const textOfNode = (node) =>
	(node.children ?? []).map((c) => (c.text !== undefined ? c.text : textOfNode(c))).join('').replace(/\s+/g, ' ').trim()
const bySlot = (root, slot) => findAllNodes(root, (n) => n.attrs['data-slot'] === slot)
const buttonsWith = (root, text) => findAllNodes(root, (n) => n.tag === 'button' && textOfNode(n).includes(text))
const labelled = (root, tag, label) => findAllNodes(root, (n) => n.tag === tag && n.attrs['aria-label'] === label)

/** The library as the server renders it, with every `next/*` import stood in for and `<link>` hints stripped. */
function loadSsrStack() {
	clearCache()
	assert(!('window' in globalThis), 'the server has no window')
	const hook = loadTs('src/app/account/media/use-media-library.ts')
	const { MediaLibrary } = loadTs('src/app/account/media/media-library.tsx')
	return { lib: hook, MediaLibrary }
}
const ssr = loadSsrStack()
const renderLibrary = (props) => {
	const html = renderToString(h(ssr.MediaLibrary, props)).replace(/<link [^>]*\/>/g, '')
	return { html, root: parseHtml(html) }
}

const KINDS = ['photo', 'logo', 'screenshot', 'illustration', 'icon']
const FORMATS = [['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif'], ['image/avif', 'avif']]
const WORDS = ['kitchen', 'bath', 'roof', 'van', 'logo']
/** One realistic image: every combination of format, folder, tagging state and tag source turns up in 60. */
function realistic(i, over = {}) {
	const [contentType, format] = FORMATS[i % 5]
	const folder = i % 4 === 0 ? null : FOLDERS[i % FOLDERS.length]
	const status = ['done', 'done', 'done', 'pending', 'running', 'failed', 'skipped'][i % 7]
	return asset(i, {
		name: `Project ${i} ${WORDS[i % 5]}`,
		filename: `project-${i}.${format}`,
		contentType,
		format,
		bytes: 80_000 + i * 12_345,
		width: 800 + (i % 7) * 200,
		height: 600 + (i % 5) * 150,
		orientation: ['landscape', 'portrait', 'square', 'panorama'][i % 4],
		hasAlpha: format === 'png',
		animated: format === 'gif',
		blur: i % 3 === 0 ? BLUR : null,
		folderId: folder ? folder.id : null,
		folderPath: folder ? folder.path : '',
		kind: KINDS[i % 5],
		tags: [
			{ slug: WORDS[i % 5], label: WORDS[i % 5][0].toUpperCase() + WORDS[i % 5].slice(1), source: 'manual' },
			...(i % 2 === 0 ? [{ slug: 'interior', label: 'Interior', source: 'auto', via: 'vision', confidence: 0.8 }] : []),
			...(i % 5 === 0 ? [{ slug: 'project', label: 'Project', source: 'auto', via: 'filename' }] : []),
		],
		tagging: { status, ...(status === 'failed' ? { error: 'The AI service is unavailable.' } : {}), ...(status === 'skipped' ? { reason: 'not_configured' } : {}) },
		...over,
	})
}
const realisticSixty = () => Array.from({ length: 60 }, (_, i) => realistic(i + 1))
const manyFacets = () => ({
	tags: Array.from({ length: 30 }, (_, i) => ({ value: `tag-${i}`, label: `Tag ${i}`, count: 100 - i })),
	colors: ['blue', 'green', 'red', 'white', 'black', 'gray', 'brown', 'yellow'].map((name, i) => ({ value: name, label: name, count: 50 - i, hex: '#336699' })),
	folders: FOLDERS.slice(0, 10).map((f, i) => ({ value: f.id, label: f.path, count: 20 - i })),
})
const richInitial = (over = {}) => baseInitial({
	search: searchResponse(realisticSixty(), { total: 312, hasMore: true, facets: manyFacets(), pending: 4 }),
	...over,
})
const TAGGING_FAILED = { ...TAGGING_ON, failed: 3 }
const TAGGING_SKIPPED = { ...TAGGING_ON, skipped: 5 }
const TAGGING_BUDGET = { ...TAGGING_ON, pending: 7, budgetExhausted: true, resetsAt: '2026-10-05T00:00:00.000Z' }
const COMBOS = [
	{ write: true, delete: true },
	{ write: true, delete: false },
	{ write: false, delete: true },
	{ write: false, delete: false },
]

await check('ssr: the fixtures are what the brief says (60 images, 20 folders, saved searches, every tagging state)', () => {
	eq(FOLDERS.length, 20)
	eq(realisticSixty().length, 60)
	eq(new Set(realisticSixty().map((a) => a.tagging.status)).size, 5, 'pending, running, done, failed and skipped all occur')
	eq(new Set(realisticSixty().map((a) => a.format)).size, 5)
	eq(SAVED.length, 2)
})

await check('ssr: for every can.write / can.delete combination the page has its landmarks, 60 cards, a visible Load more, and exactly the controls the role may use', () => {
	for (const can of COMBOS) {
		const label = JSON.stringify(can)
		const { html, root } = renderLibrary(baseProps({ initial: richInitial(), can }))
		eq(textOfNode(findAllNodes(root, (n) => n.tag === 'h1')[0]), 'Media', label)
		eq(textOfNode(bySlot(root, 'media-counts')[0]), '312 images · 3.2 GB', label)
		eq(findAllNodes(root, (n) => n.attrs.role === 'search').length, 1, `${label} search landmark`)
		const aside = findAllNodes(root, (n) => n.tag === 'aside' && n.attrs['aria-label'] === 'Folders and filters')
		eq(aside.length, 1, `${label} rail`)
		const tree = findAllNodes(aside[0], (n) => n.attrs.role === 'tree')
		eq(tree.length, 1, `${label} folder tree`)
		const items = findAllNodes(tree[0], (n) => n.attrs.role === 'treeitem').map((n) => n.attrs['aria-label'] ?? textOfNode(n))
		for (const wanted of ['All media', 'Needs review', 'Clients', 'Marketing', 'Projects', 'Archive'])
			assert(items.some((text) => text.startsWith(wanted)), `${label}: the tree lists ${wanted}; has ${items.slice(0, 8)}`)
		const asideText = textOfNode(aside[0])
		for (const saved of SAVED) assert(asideText.includes(saved.name), `${label}: saved search ${saved.name}`)
		assert(findAllNodes(aside[0], (n) => n.attrs['data-slot'] === 'facet-panel').length === 1, `${label} facets`)

		const section = findAllNodes(root, (n) => n.tag === 'section' && n.attrs['aria-label'] === 'Images')
		eq(section.length, 1, `${label} results region`)
		eq(bySlot(root, 'grid-toolbar').length, 1, `${label} toolbar`)
		const cards = bySlot(root, 'asset-card')
		eq(cards.length, 60, `${label} cards`)
		eq(cards.filter((c) => c.attrs.draggable === 'true').length, can.write ? 60 : 0, `${label}: only a writer can drag`)
		eq(bySlot(root, 'load-more').length, 1, `${label} Load more`)
		eq(buttonsWith(root, 'Load more').length, 1)
		eq(bySlot(root, 'selection-bar').length, 0, `${label}: no selection bar without a selection`)

		const live = bySlot(root, 'media-live')
		eq(live.length, 1, `${label}: one live region of the library's own`)
		eq([live[0].attrs['aria-live'], live[0].attrs.role], ['polite', 'status'])
		assert(buttonsWith(root, 'Folders and filters').length >= 1, `${label}: a way to open the rail under lg`)
		eq(buttonsWith(root, 'Tags').length >= 1, true, `${label}: the tag manager entry is for every role`)

		const header = findAllNodes(root, (n) => n.tag === 'header')[0]
		eq(buttonsWith(header, 'Upload').length, can.write ? 1 : 0, `${label}: Upload names its destination, only for writers`)
		eq(buttonsWith(header, 'New folder').length, can.write ? 1 : 0, `${label}: New folder`)
		eq(labelled(aside[0], 'button', 'New folder').length, can.write ? 1 : 0, `${label}: the tree's own New folder`)
		assert(!/<script/i.test(html), `${label}: no script element`)
	}
})

await check('ssr: a selection shows the bar with only the actions the role may use, ticks the chosen cards, and offers "all matching" only when exact', async () => {
	for (const can of COMBOS) {
		const label = JSON.stringify(can)
		const t = setup({ stack: ssr.lib, initial: richInitial({ tagging: TAGGING_ON }), can })
		pick(t, 2, 4)
		const { root } = renderLibrary(baseProps({ initial: richInitial({ tagging: TAGGING_ON }), can, controller: t.controller }))
		const bar = bySlot(root, 'selection-bar')
		eq(bar.length, 1, label)
		eq(bar[0].attrs['aria-label'], '3 images selected')
		assert(textOfNode(bar[0]).includes('3 selected'))
		eq(buttonsWith(bar[0], 'Move to').length, can.write ? 1 : 0, `${label} move`)
		eq(buttonsWith(bar[0], 'Tag…').length, can.write ? 1 : 0, `${label} tag`)
		eq(buttonsWith(bar[0], 'Keep all auto tags').length, can.write ? 1 : 0, `${label} keep`)
		eq(buttonsWith(bar[0], 'Auto-tag again').length, can.write ? 1 : 0, `${label} retag (AI is configured)`)
		eq(buttonsWith(bar[0], 'Delete').length, can.delete ? 1 : 0, `${label} delete`)
		eq(buttonsWith(bar[0], 'Clear').length, 1, `${label} clear`)
		assert(buttonsWith(bar[0], 'Select all 312 matching').length === 1, `${label}: exact, so offered`)
		eq(findAllNodes(root, (n) => n.attrs.role === 'checkbox' && n.attrs['aria-checked'] === 'true' && /^Select /.test(n.attrs['aria-label'] ?? '')).length, 3, 'the three chosen cards are ticked')
		eq(findAllNodes(root, (n) => n.attrs.role === 'checkbox' && n.attrs['aria-label'] === 'Select all loaded images')[0].attrs['aria-checked'], 'mixed')
		t.unmount()
	}
	// Not offered when the result is truncated, relaxed or too big; "all matching" reads as such.
	for (const [name, over] of [['truncated', { truncated: true }], ['relaxed', { dropped: ['sink'] }], ['over the cap', { total: MEDIA_LIMITS.bulkSearchCap + 1 }]]) {
		const initial = richInitial({ search: searchResponse(realisticSixty(), { total: 312, hasMore: true, ...over }) })
		const t = setup({ stack: ssr.lib, initial })
		pick(t, 1, 2)
		const { root } = renderLibrary(baseProps({ initial, controller: t.controller }))
		eq(buttonsWith(bySlot(root, 'selection-bar')[0], 'Select all').length, 0, name)
		t.unmount()
	}
	const t = setup({ stack: ssr.lib, initial: richInitial() })
	t.actions.selectAllMatching()
	const { root } = renderLibrary(baseProps({ initial: richInitial(), controller: t.controller }))
	assert(textOfNode(bySlot(root, 'selection-bar')[0]).includes('All 312 matching selected'))
	eq(findAllNodes(root, (n) => n.attrs.role === 'checkbox' && n.attrs['aria-label'] === 'Select all loaded images')[0].attrs['aria-checked'], 'true')
	t.unmount()
})

await check('ssr: the AI banner says the right thing for each tagging state, with Retry and "Tag them now" only for writers', () => {
	const banner = (tagging, can, over = {}) => {
		const { root } = renderLibrary(baseProps({ initial: richInitial({ tagging, ...over }), can }))
		return { root, note: bySlot(root, 'ai-status-banner')[0] }
	}
	const full = { write: true, delete: true }
	const off = banner({ ...TAGGING_OFF, untagged: 12 }, full)
	eq(off.note.attrs['data-kind'], 'off')
	assert(/Auto-tagging is off\./.test(textOfNode(off.note)) && /ANTHROPIC_API_KEY/.test(textOfNode(off.note)), 'says how to turn it on')
	eq(banner(TAGGING_OFF, full).note, undefined, 'no key and nothing untagged: nothing to say')

	const failed = banner(TAGGING_FAILED, full)
	eq(failed.note.attrs['data-kind'], 'failed')
	assert(textOfNode(failed.note).includes('3 images could not be tagged'))
	eq(buttonsWith(failed.note, 'Retry').length, 1)
	eq(buttonsWith(banner(TAGGING_FAILED, { write: false, delete: false }).note, 'Retry').length, 0, 'a viewer cannot retry')

	const skipped = banner(TAGGING_SKIPPED, full)
	eq(skipped.note.attrs['data-kind'], 'skipped')
	eq(buttonsWith(skipped.note, 'Tag them now').length, 1)
	eq(buttonsWith(banner(TAGGING_SKIPPED, { write: false, delete: false }).note, 'Tag them now').length, 0)

	const budget = banner(TAGGING_BUDGET, full)
	eq(budget.note.attrs['data-kind'], 'budget')
	assert(/Tagging resumes at 00:00 UTC/.test(textOfNode(budget.note)), textOfNode(budget.note))
	eq(banner(TAGGING_ON, full).note, undefined, 'configured, nothing wrong: no banner')
})

await check('ssr: a folder view names its destination, shows the trail and the subfolders, and says what the pill covers', () => {
	const initial = richInitial({ params: { q: '', folder: ACME.id } })
	const { root } = renderLibrary(baseProps({ initial }))
	eq(buttonsWith(findAllNodes(root, (n) => n.tag === 'header')[0], 'Upload to Clients/Acme').length, 1)
	const trail = bySlot(root, 'media-breadcrumb')[0]
	eq(bySlot(trail, 'breadcrumb-item').map(textOfNode), ['All media', 'Clients', 'Acme'], 'the trail is the path')
	eq(findAllNodes(trail, (n) => n.attrs['aria-current'] === 'page').map(textOfNode), ['Acme'], 'the open folder is the current page')
	eq(findAllNodes(trail, (n) => n.tag === 'button').map(textOfNode), ['All media', 'Clients'], 'each step above it is a place to go')
	const subfolders = findAllNodes(root, (n) => n.tag === 'ul' && n.attrs['aria-label'] === 'Subfolders')[0]
	eq(findAllNodes(subfolders, (n) => n.tag === 'button').map((b) => textOfNode(b).replace(/\s*\d+$/, '')), ['Kitchens'])
	const search = bySlot(root, 'search-bar')[0]
	assert(/Clients\/Acme/.test(textOfNode(search)), 'the scope pill names the folder')
	assert(/only/.test(textOfNode(search)), `plain browsing: ${textOfNode(search)}`)
	const toggle = findAllNodes(root, (n) => n.attrs.role === 'switch')
	eq(toggle.length, 1, 'include subfolders is offered because a folder is open')
	eq(toggle[0].attrs['aria-checked'], 'false')

	const deep = renderLibrary(baseProps({ initial: richInitial({ params: { q: 'tag:kitchen', folder: ACME.id }, search: searchResponse(realisticSixty(), { total: 312, hasMore: true, query: { chips: [{ key: 'k', kind: 'filter', label: 'tag: kitchen', clause: 'tag:kitchen', field: 'tag', values: ['kitchen'], negated: false, start: 0, end: 11 }], warnings: [], sort: null, hasText: false } }) }) }))
	assert(/subfolders/.test(textOfNode(bySlot(deep.root, 'search-bar')[0])), 'with a query the scope includes subfolders')
	eq(findAllNodes(deep.root, (n) => n.attrs.role === 'switch')[0].attrs['aria-checked'], 'true')

	const unfiled = renderLibrary(baseProps({ initial: richInitial({ params: { q: '', folder: 'unfiled' } }) }))
	eq(buttonsWith(findAllNodes(unfiled.root, (n) => n.tag === 'header')[0], 'Upload').length, 1)
	eq(bySlot(bySlot(unfiled.root, 'media-breadcrumb')[0], 'breadcrumb-item').map(textOfNode), ['All media', 'Unfiled'])
	eq(findAllNodes(unfiled.root, (n) => n.attrs.role === 'switch').length, 0, 'there are no subfolders of Unfiled')
})

await check('ssr: the committed query shows its chips and the parser\'s warnings, and the sort offers "Best match" only for a text query', () => {
	const chips = [
		{ key: 'a', kind: 'filter', label: 'tag: kitchen', clause: 'tag:kitchen', field: 'tag', values: ['kitchen'], negated: false, start: 0, end: 11 },
		{ key: 'b', kind: 'term', label: 'sink', clause: 'sink', negated: false, start: 12, end: 16 },
	]
	const query = { chips, warnings: ['Unknown type "xyz" was ignored.'], sort: null, hasText: true }
	const { root } = renderLibrary(baseProps({ initial: richInitial({ params: { q: 'tag:kitchen sink type:xyz' }, search: searchResponse(realisticSixty(), { total: 312, hasMore: true, query }) }) }))
	const search = bySlot(root, 'search-bar')[0]
	const text = textOfNode(search)
	assert(/tag: kitchen/.test(text) && /sink/.test(text), text)
	assert(text.includes('Unknown type "xyz" was ignored.'), 'the parser\'s warning is shown inline')
	eq(findAllNodes(search, (n) => n.attrs.role === 'combobox')[0].attrs.value, 'tag:kitchen sink type:xyz', 'the box holds what was typed')
	const options = (r) => findAllNodes(findAllNodes(r, (n) => n.tag === 'select')[0], (n) => n.tag === 'option').map(textOfNode)
	assert(options(root).includes('Best match'))
	const plain = renderLibrary(baseProps({ initial: richInitial() }))
	assert(!options(plain.root).includes('Best match'), 'no text, no relevance')
})

await check('ssr: an empty library teaches, an empty folder and a missing folder say what happened, and a search with no hits names the dropped words and the corrections', () => {
	const none = (over = {}) => searchResponse([], { total: 0, hasMore: false, facets: null, ...over })
	for (const can of COMBOS) {
		const label = JSON.stringify(can)
		const { root } = renderLibrary(baseProps({ initial: baseInitial({ search: none(), folders: foldersResponse({ folders: [], unfiled: 0, total: 0, unreviewed: 0, bytes: 0 }) }), can }))
		const empty = bySlot(root, 'empty-library')
		eq(empty.length, 1, label)
		assert(textOfNode(empty[0]).includes('Your media library is empty'), label)
		eq(buttonsWith(empty[0], 'Upload images').length, can.write ? 1 : 0, `${label}: only a writer is told to upload`)
		if (!can.write) assert(/Ask someone with permission/.test(textOfNode(empty[0])), label)
		eq(textOfNode(bySlot(root, 'media-counts')[0]), '0 images · 0 B')
		eq(bySlot(root, 'load-more').length + bySlot(root, 'asset-card').length, 0)
		eq(bySlot(root, 'empty-results').length, 0, 'an empty library is not "no results"')
	}

	const folder = renderLibrary(baseProps({ initial: baseInitial({ params: { q: '', folder: ACME.id }, search: none() }) }))
	assert(textOfNode(bySlot(folder.root, 'empty-folder')[0]).includes('This folder is empty'))
	eq(buttonsWith(bySlot(folder.root, 'empty-folder')[0], 'Upload here').length, 1)
	const unfiled = renderLibrary(baseProps({ initial: baseInitial({ params: { q: '', folder: 'unfiled' } , search: none() }) }))
	assert(textOfNode(bySlot(unfiled.root, 'empty-folder')[0]).includes('Nothing is unfiled'))
	const parent = renderLibrary(baseProps({ initial: baseInitial({ params: { q: '', folder: FOLDERS[0].id }, search: none() }) }))
	eq(buttonsWith(bySlot(parent.root, 'empty-folder')[0], 'Include subfolders').length, 1, 'a folder whose images are all in subfolders offers to show them')
	const gone = renderLibrary(baseProps({ initial: baseInitial({ params: { q: '', folder: hex(9999) }, search: none() }) }))
	const missing = bySlot(gone.root, 'empty-missing-folder')[0]
	assert(textOfNode(missing).includes('That folder no longer exists'))
	eq(buttonsWith(missing, 'Show all media').length, 1)

	const query = { chips: [{ key: 'a', kind: 'term', label: 'technician', clause: 'technician', negated: false, start: 0, end: 10 }, { key: 'b', kind: 'term', label: 'sink', clause: 'sink', negated: false, start: 11, end: 15 }], warnings: [], sort: null, hasText: true }
	const results = renderLibrary(baseProps({ initial: baseInitial({ params: { q: 'technician sink' }, search: none({ query, dropped: ['sink'], corrections: [{ from: 'technicain', to: 'technician' }] }) }) }))
	const panel = bySlot(results.root, 'empty-results')[0]
	const text = textOfNode(panel)
	assert(text.includes('No images found'), text)
	assert(text.includes('No images mention sink.'), 'the dropped word is named')
	assert(text.includes('Showing results for technician found nothing either.'), 'and so is the correction')
	eq(buttonsWith(panel, 'Clear filters').length, 1)
	// Without a relaxation the words that found nothing are named from the query itself.
	const plain = renderLibrary(baseProps({ initial: baseInitial({ params: { q: 'technician sink' }, search: none({ query }) }) }))
	assert(textOfNode(bySlot(plain.root, 'empty-results')[0]).includes('No images mention technician or sink.'))
	const filter = renderLibrary(baseProps({ initial: baseInitial({ params: { q: 'tag:van' }, search: none({ query: { chips: [{ key: 'a', kind: 'filter', label: 'tag: van', clause: 'tag:van', field: 'tag', values: ['van'], negated: false, start: 0, end: 7 }], warnings: [], sort: null, hasText: false } }) }) }))
	assert(textOfNode(bySlot(filter.root, 'empty-results')[0]).includes('No images match tag: van.'))
	const inFolder = renderLibrary(baseProps({ initial: baseInitial({ params: { q: 'x', folder: ACME.id, deep: false }, search: none() }) }))
	eq(buttonsWith(bySlot(inFolder.root, 'empty-results')[0], 'Include subfolders').length, 1, 'a search confined to one folder can widen')
})

await check('ssr: a failed search is an error with Retry and never "no images"; loading shows skeletons; a failed refresh is a notice with Retry', async () => {
	const t = setup({ stack: ssr.lib })
	t.actions.submitDraft('kitchen')
	let page = renderLibrary(baseProps({ controller: t.controller }))
	const section = findAllNodes(page.root, (n) => n.tag === 'section' && n.attrs['aria-label'] === 'Images')[0]
	eq(section.attrs['aria-busy'], 'true')
	eq(findAllNodes(section, (n) => n.tag === 'ul' && n.attrs['aria-label'] === 'Loading images').length, 1)
	eq(bySlot(page.root, 'empty-results').length + bySlot(page.root, 'asset-card').length, 0, 'loading is neither empty nor stale cards')

	lastSearch(t).reject(apiError('Search is down.', 500))
	await flush()
	page = renderLibrary(baseProps({ controller: t.controller }))
	const error = bySlot(page.root, 'grid-error')[0]
	assert(textOfNode(error).includes('Could not load your images.') && textOfNode(error).includes('Search is down.'), textOfNode(error))
	eq(buttonsWith(error, 'Retry').length, 1)
	eq(bySlot(page.root, 'empty-results').length + bySlot(page.root, 'empty-library').length + bySlot(page.root, 'empty-folder').length, 0, 'an error is never an empty state')
	eq(bySlot(page.root, 'load-more').length, 0)
	t.unmount()

	// A failed reload in place keeps the cards and says so above the grid.
	const r = setup({ stack: ssr.lib, initial: richInitial() })
	r.actions.refresh()
	lastSearch(r).reject(apiError('Timed out.', 504))
	await flush()
	const refreshed = renderLibrary(baseProps({ initial: richInitial(), controller: r.controller }))
	const notice = bySlot(refreshed.root, 'media-notice')[0]
	eq(notice.attrs['data-tone'], 'error')
	assert(textOfNode(notice).includes('Could not refresh the images. Timed out.'), textOfNode(notice))
	eq(buttonsWith(notice, 'Retry').length, 1)
	eq(bySlot(refreshed.root, 'asset-card').length, 60, 'the cards stay')
	r.unmount()
})

await check('ssr: a truncated result says "5,000+", density changes the grid, and a missing facet list still renders', () => {
	const truncated = renderLibrary(baseProps({ initial: richInitial({ search: searchResponse(realisticSixty(), { total: 5000, truncated: true, hasMore: true, facets: null }) }) }))
	assert(textOfNode(bySlot(truncated.root, 'grid-toolbar')[0]).includes('5,000+ images'), textOfNode(bySlot(truncated.root, 'grid-toolbar')[0]))
	eq(findAllNodes(truncated.root, (n) => n.attrs['data-slot'] === 'facet-panel').length, 1, 'facets: null is still a panel (the static toggles)')
	const grid = (density) => {
		const t = setup({ stack: ssr.lib, initial: richInitial() })
		t.actions.setDensity(density)
		const out = renderLibrary(baseProps({ initial: richInitial(), controller: t.controller }))
		t.unmount()
		return findAllNodes(out.root, (n) => n.tag === 'ul' && n.attrs['aria-label'] === 'Images')[0].attrs.class
	}
	assert(grid('compact').includes('lg:grid-cols-6'))
	assert(grid('comfortable').includes('lg:grid-cols-4'))
	assert(grid('large').includes('md:grid-cols-3') && !grid('large').includes('lg:grid-cols-4'))
})

await check('ssr: hostile text (names, tags, folders, saved searches, the query) is escaped everywhere and the page never throws', () => {
	const evil = '<script>alert(1)</script>'
	const attack = '"><img src=x onerror=alert(1)>'
	const folders = FOLDERS.map((f, i) => (i === 0 ? { ...f, name: evil, path: evil } : i === 1 ? { ...f, name: attack, path: attack } : f))
	const assets = realisticSixty().map((a, i) =>
		i < 3
			? { ...a, name: evil, filename: attack, caption: attack, tags: [{ slug: 'x', label: attack, source: 'manual' }, { slug: 'y', label: evil, source: 'auto', via: 'vision', confidence: 0.9 }], folderPath: attack, folderId: folders[1].id }
			: a,
	)
	const saved = [{ ...SAVED[0], name: attack, query: evil }, { ...SAVED[1], name: evil }]
	const initial = baseInitial({
		params: { q: attack },
		search: searchResponse(assets, { total: 312, hasMore: true, dropped: [evil], corrections: [{ from: evil, to: attack }], facets: { tags: [{ value: 'x', label: evil, count: 3 }], colors: [{ value: 'blue', label: attack, count: 2, hex: '#336699' }], folders: [{ value: folders[0].id, label: evil, count: 1 }] }, query: { chips: [{ key: 'a', kind: 'term', label: attack, clause: attack, negated: false, start: 0, end: 5 }], warnings: [evil], sort: null, hasText: true } }),
		folders: foldersResponse({ folders }),
		saved,
	})
	for (const can of COMBOS) {
		const { html, root } = renderLibrary(baseProps({ initial, can }))
		eq(findAllNodes(root, (n) => n.tag === 'script').length, 0, 'no script element')
		eq(findAllNodes(root, (n) => 'onerror' in n.attrs || 'onclick' in n.attrs || 'onload' in n.attrs).length, 0, 'no handler attribute made of text')
		eq(findAllNodes(root, (n) => n.tag === 'img' && n.attrs.src === 'x').length, 0, 'the injected image is text')
		assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'the text is there, as text')
	}
})

await check('ssr: duplicate rows from the server, an orphaned folder and a response with fewer fields than the types promise render without a warning', () => {
	const assets = realisticSixty()
	const withDuplicates = [...assets, assets[0], assets[1], assets[59]]
	const { root } = renderLibrary(baseProps({ initial: baseInitial({ search: searchResponse(withDuplicates, { total: 312, hasMore: true }) }) }))
	eq(bySlot(root, 'asset-card').length, 60, 'one card per image id')
	const orphan = { id: hex(3001), parentId: hex(9998), name: 'Orphan', path: 'Orphan', depth: 1, count: 1, total: 1 }
	const odd = renderLibrary(baseProps({ initial: baseInitial({ folders: foldersResponse({ folders: [...FOLDERS, orphan] }) }) }))
	eq(bySlot(odd.root, 'asset-card').length, 60)
	// A page that is the tail of a longer result (the first page's offset is not 0 in a stale hint).
	const sparse = renderLibrary(baseProps({ initial: { ...baseInitial(), saved: undefined } }))
	eq(bySlot(sparse.root, 'asset-card').length, 60, 'saved: undefined is an empty list')
})

await check('ssr: the library is keyed by account, never reads the router, and every card name is unique so a screen reader can tell them apart', () => {
	const element = ssr.MediaLibrary(baseProps({ workspaceId: WS }))
	eq(element.key, WS, 'another account is another library: the whole thing remounts')
	assert(ssr.MediaLibrary(baseProps({ workspaceId: hex(0xdef) })).key !== element.key)
	const { root } = renderLibrary(baseProps({ initial: richInitial() }))
	const names = bySlot(root, 'asset-card').map((c) => findAllNodes(c, (n) => n.tag === 'button' && n.attrs['aria-label'])[0].attrs['aria-label'])
	eq(new Set(names).size, 60)
	const ids = findAllNodes(root, (n) => n.attrs.id !== undefined).map((n) => n.attrs.id)
	eq(new Set(ids).size, ids.length, 'no duplicate ids on the page')
	for (const attr of ['aria-labelledby', 'aria-controls', 'aria-describedby'])
		for (const el of findAllNodes(root, (n) => n.attrs[attr] !== undefined))
			for (const id of el.attrs[attr].split(/\s+/)) assert(ids.includes(id), `${attr} points at a missing id ${id}`)
	eq(routerCalls, { usePathname: 0, useSearchParams: 0, useRouter: 0 }, 'library state never goes through the router hooks')
})

/* ========================================================================== */
/* The assembled library, mounted with stand-ins for its leaves               */
/* ========================================================================== */

// The real leaves are proved in their own files, and server-rendered above. Here they are
// replaced by components that record the props they were given, so the WIRING can be driven:
// what each leaf is handed from the state, and what its callbacks do to it.
const realFacet = loadTs('src/app/account/media/facet-panel.tsx')
const realFolderDialogs = loadTs('src/app/account/media/folder-dialogs.tsx')

const seen = { latest: {}, all: {} }
const fakeInput = { calls: [], focus() { this.calls.push('focus') }, select() { this.calls.push('select') } }
const fakePicker = { calls: [], openPicker() { this.calls.push('openPicker') }, addFiles(files) { this.calls.push(['addFiles', files]) } }
function stub(name, after) {
	const Stub = (props) => {
		seen.latest[name] = props
		;(seen.all[name] ??= []).push(props)
		after?.(props)
		return h('div', { 'data-stub': name })
	}
	Object.defineProperty(Stub, 'name', { value: name })
	return Stub
}
const passthrough = (tag, extra = {}) => ({ children, ...rest }) => h(tag, { ...extra, ...rest }, children)
const gated = (name) => ({ open, onOpenChange, children }) => (open ? h('div', { 'data-ui': name, onOpenChange }, children) : null)

mock('./ai-status-banner', { AiStatusBanner: stub('AiStatusBanner') })
mock('./asset-grid', { AssetGrid: stub('AssetGrid') })
mock('./bulk-tag-dialog', { BulkTagDialog: stub('BulkTagDialog') })
mock('./detail-panel', { DetailPanel: stub('DetailPanel') })
mock('./facet-panel', { FacetPanel: stub('FacetPanel'), activeValuesFromChips: realFacet.activeValuesFromChips })
mock('./folder-tree', { FolderTree: stub('FolderTree') })
mock('./folder-dialogs', { attempt: realFolderDialogs.attempt, MAX_FOLDER_INDEX: realFolderDialogs.MAX_FOLDER_INDEX, validateFolderName: realFolderDialogs.validateFolderName })
mock('./grid-toolbar', { GridToolbar: stub('GridToolbar') })
mock('./move-dialog', { MoveDialog: stub('MoveDialog') })
mock('./search-bar', { SearchBar: stub('SearchBar', (props) => { if (props.inputRef) props.inputRef.current = fakeInput }) })
mock('./selection-bar', { SelectionBar: stub('SelectionBar') })
mock('./tag-manager-dialog', { TagManagerDialog: stub('TagManagerDialog') })
mock('./tag-editor', { useReturnFocus: () => () => {} })
mock('./upload-manager', { UploadManager: stub('UploadManager', (props) => { if (props.handleRef) props.handleRef.current = fakePicker }) })
mock('lucide-react', new Proxy({ __esModule: true }, { get: (target, key) => (key in target ? target[key] : () => null) }))
mock('@/components/ui/alert-dialog', {
	AlertDialog: gated('alert-dialog'),
	AlertDialogContent: passthrough('div', { 'data-ui': 'alert-dialog-content' }),
	AlertDialogHeader: passthrough('div'),
	AlertDialogFooter: passthrough('div'),
	AlertDialogTitle: passthrough('h2', { 'data-ui': 'alert-title' }),
	AlertDialogDescription: passthrough('p', { 'data-ui': 'alert-description' }),
	AlertDialogAction: passthrough('button', { 'data-ui': 'alert-confirm' }),
	AlertDialogCancel: passthrough('button', { 'data-ui': 'alert-cancel' }),
})
mock('@/components/ui/dialog', {
	Dialog: gated('dialog'),
	DialogContent: passthrough('div', { 'data-ui': 'dialog-content' }),
	DialogHeader: passthrough('div'),
	DialogFooter: passthrough('div'),
	DialogTitle: passthrough('h2'),
	DialogDescription: passthrough('p'),
})
mock('@/components/ui/sheet', {
	Sheet: gated('sheet'),
	SheetContent: passthrough('div'),
	SheetHeader: passthrough('div'),
	SheetTitle: passthrough('h2'),
	SheetDescription: passthrough('p'),
})
mock('@/components/ui/breadcrumb', {
	Breadcrumb: passthrough('nav'),
	BreadcrumbList: passthrough('ol'),
	BreadcrumbItem: passthrough('li'),
	BreadcrumbLink: ({ asChild, children, ...rest }) => (asChild ? children : h('a', rest, children)),
	BreadcrumbPage: passthrough('span'),
	BreadcrumbSeparator: passthrough('li'),
})
mock('@/components/ui/button', { Button: passthrough('button') })
mock('@/components/ui/input', { Input: (props) => h('input', props) })
mock('@/components/ui/label', { Label: passthrough('label') })

function loadWiringStack() {
	clearCache()
	const had = 'window' in globalThis
	const before = globalThis.window
	globalThis.window = {}
	try {
		return { lib: loadTs('src/app/account/media/use-media-library.ts'), MediaLibrary: loadTs('src/app/account/media/media-library.tsx').MediaLibrary }
	} finally {
		if (had) globalThis.window = before
		else delete globalThis.window
	}
}
const wired = loadWiringStack()

function createFakeDocument() {
	const listeners = new Map()
	return {
		visibilityState: 'visible',
		addEventListener(type, fn) {
			if (!listeners.has(type)) listeners.set(type, new Set())
			listeners.get(type).add(fn)
		},
		removeEventListener(type, fn) {
			listeners.get(type)?.delete(fn)
		},
		dispatch(type, event) {
			for (const fn of [...(listeners.get(type) ?? [])]) fn(event)
			return event
		},
		get listenerCount() {
			return [...listeners.values()].reduce((n, set) => n + set.size, 0)
		},
	}
}
const BODY = { tagName: 'BODY', getAttribute: () => null, closest: () => null }
const keyEvent = (key, over = {}) => ({
	key,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	shiftKey: false,
	repeat: false,
	isComposing: false,
	defaultPrevented: false,
	target: BODY,
	preventDefault() {
		this.defaultPrevented = true
	},
	...over,
})

/** The library mounted with the stand-ins, a fake document, and a controller over a fake API. */
function mountLibrary({ initial = baseInitial(), can = { write: true, delete: true }, handlers = {}, search = '' } = {}) {
	const doc = createFakeDocument()
	const previous = globalThis.document
	globalThis.document = doc
	const t = setup({ stack: wired.lib, initial, can, handlers: { ...bulkHandlers(), ...handlers }, mount: false, search })
	for (const key of Object.keys(seen.latest)) delete seen.latest[key]
	fakeInput.calls.length = 0
	fakePicker.calls.length = 0
	const props = baseProps({ initial, can, controller: t.controller })
	function Root(p) {
		for (const key of Object.keys(seen.all)) seen.all[key] = []
		return h(wired.MediaLibrary, p)
	}
	const tree = mountTree(Root, props)
	const out = {
		t,
		doc,
		tree,
		props,
		/** The latest props of a leaf. */
		leaf: (name) => seen.latest[name],
		/** Every instance of a leaf in the latest render (the rail is rendered twice while its sheet is open). */
		leaves: (name) => seen.all[name] ?? [],
		act: (fn) => tree.act(fn),
		button: (text) => tree.find((n) => n.type === 'button' && tree.text(n).includes(text)),
		click(node) {
			assert(node, 'no such control')
			tree.act(() => node.props.onClick({ preventDefault() {} }))
		},
		ui: (name) => tree.findAll((n) => n.props?.['data-ui'] === name),
		key(key, over) {
			const event = keyEvent(key, over)
			tree.act(() => doc.dispatch('keydown', event))
			return event
		},
		close() {
			tree.unmount()
			if (previous === undefined) delete globalThis.document
			else globalThis.document = previous
		},
	}
	return out
}

await check('wiring: every leaf is handed what the state says, and a viewer gets read-only props everywhere', () => {
	const initial = richInitial({ tagging: { ...TAGGING_ON, failed: 3 } })
	const m = mountLibrary({ initial })
	const search = m.leaf('SearchBar')
	eq([search.value, search.loading, search.canSave, search.scope], ['', false, false, null])
	const grid = m.leaf('AssetGrid')
	eq([grid.assets.length, grid.density, grid.selecting, grid.activeId, grid.loading, grid.hasMore, grid.error, grid.canDrag, grid.showFolderPath, grid.showMatch], [60, 'comfortable', false, null, false, true, null, true, true, false])
	assert(grid.selectedIds instanceof Set && grid.selectedIds.size === 0)
	const toolbar = m.leaf('GridToolbar')
	eq([toolbar.total, toolbar.truncated, toolbar.sort, toolbar.hasText, toolbar.density, toolbar.allSelected, toolbar.someSelected, toolbar.selecting, toolbar.showDeep, toolbar.deep], [312, false, 'newest', false, 'comfortable', false, false, false, false, false])
	const tree = m.leaf('FolderTree')
	eq([tree.folders.length, tree.total, tree.unfiled, tree.unreviewed, tree.active, tree.canWrite, tree.canDelete, tree.saved.length], [20, 312, 12, 9, undefined, true, true, 2])
	const facets = m.leaf('FacetPanel')
	eq([facets.facets.tags.length, facets.loading, facets.activeValues.size], [30, false, 0])
	const upload = m.leaf('UploadManager')
	eq([upload.folderId, upload.destinationLabel, upload.disabled, upload.maxBytes, upload.workspaceId, upload.pathPrefix], [null, 'Upload', false, MEDIA_LIMITS.maxBytes, WS, `workspaces/${WS}/media/`])
	eq(typeof upload.onRegistered, 'function')
	const detail = m.leaf('DetailPanel')
	eq([detail.asset, detail.index, detail.count, detail.canWrite, detail.canDelete, detail.aiConfigured, detail.folders.length], [null, -1, 60, true, true, true, 20])
	const banner = m.leaf('AiStatusBanner')
	// Four images wait and a key is set, so the page has already begun working through them.
	eq([banner.status.failed, banner.pending, banner.working, banner.blockedMessage, banner.canWrite], [3, 4, true, null, true])
	eq([m.leaf('SelectionBar').count, m.leaf('SelectionBar').allMatching], [0, false], 'the bar is always mounted; with nothing selected it renders nothing itself')
	m.close()

	const viewer = mountLibrary({ initial, can: { write: false, delete: false } })
	eq([viewer.leaf('AssetGrid').canDrag, viewer.leaf('FolderTree').canWrite, viewer.leaf('FolderTree').canDelete, viewer.leaf('UploadManager').disabled, viewer.leaf('DetailPanel').canWrite, viewer.leaf('DetailPanel').canDelete, viewer.leaf('AiStatusBanner').canWrite, viewer.leaf('SearchBar').canSave], [false, false, false, true, false, false, false, false])
	assert(!viewer.button('Upload to'), 'no Upload button')
	assert(!viewer.button('New folder'), 'no New folder button')
	assert(viewer.button('Tags'), 'but the tag manager can be opened to look')
	viewer.close()
})

await check('wiring: state -> props keeps up with the controller (selection, a folder, the open image, sort, density, the typed box)', () => {
	const m = mountLibrary({ initial: richInitial() })
	m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(2), { range: false }))
	m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(4), { range: true }))
	eq([...m.leaf('AssetGrid').selectedIds].sort(), idRange(2, 4))
	eq([m.leaf('SelectionBar').count, m.leaf('SelectionBar').totalMatching, m.leaf('SelectionBar').allMatching, m.leaf('SelectionBar').canSelectAllMatching], [3, 312, false, true])
	eq([m.leaf('GridToolbar').someSelected, m.leaf('GridToolbar').allSelected], [true, false])
	m.act(() => m.leaf('GridToolbar').onToggleAll())
	eq([m.leaf('GridToolbar').allSelected, m.leaf('SelectionBar').count], [true, 60])
	m.act(() => m.leaf('GridToolbar').onToggleAll())
	eq(m.leaf('SelectionBar').count, 0)

	m.act(() => m.leaf('GridToolbar').onToggleSelecting())
	eq([m.leaf('GridToolbar').selecting, m.leaf('AssetGrid').selecting], [true, true])
	m.act(() => m.leaf('GridToolbar').onDensity('large'))
	eq([m.leaf('GridToolbar').density, m.leaf('AssetGrid').density], ['large', 'large'])
	m.act(() => m.leaf('AssetGrid').onOpen(hex(3)))
	eq([m.leaf('DetailPanel').asset.id, m.leaf('DetailPanel').index, m.leaf('AssetGrid').activeId], [hex(3), 2, hex(3)])
	m.act(() => m.leaf('DetailPanel').onNext())
	eq(m.leaf('DetailPanel').asset.id, hex(4))
	m.act(() => m.leaf('DetailPanel').onPrev())
	m.act(() => m.leaf('DetailPanel').onPrev())
	eq(m.leaf('DetailPanel').asset.id, hex(2))
	m.act(() => m.leaf('DetailPanel').onClose())
	eq([m.leaf('DetailPanel').asset, m.leaf('AssetGrid').activeId], [null, null])

	m.act(() => m.leaf('SearchBar').onChange('kitch'))
	eq(m.leaf('SearchBar').value, 'kitch', 'the box is current before the search runs')
	eq(m.t.search.items.length, 0)
	m.act(() => m.leaf('GridToolbar').onSort('oldest'))
	eq(m.t.state.params.sort, 'oldest')
	assert(m.leaf('AssetGrid').loading, 'the new sort is loading')
	eq(m.leaf('SearchBar').loading, true)
	m.close()
})

await check('wiring: the rail picks a folder (the upload button follows), a saved search, Needs review, a facet, and the sheet closes after a choice', async () => {
	const m = mountLibrary({ initial: richInitial() })
	m.act(() => m.leaf('FolderTree').onSelect(ACME.id))
	eq(m.t.state.params.folder, ACME.id)
	eq([m.leaf('UploadManager').folderId, m.leaf('UploadManager').destinationLabel], [ACME.id, 'Upload to Clients/Acme'])
	eq(m.leaf('FolderTree').active, ACME.id)
	eq(m.leaf('SearchBar').scope, { label: 'Clients/Acme', deep: false })
	eq(m.leaf('GridToolbar').showDeep, true)
	m.act(() => m.leaf('GridToolbar').onToggleDeep())
	eq(m.leaf('SearchBar').scope, { label: 'Clients/Acme', deep: true })
	m.act(() => m.leaf('SearchBar').onClearScope())
	eq([m.t.state.params.folder, m.leaf('SearchBar').scope], [undefined, null])

	m.act(() => m.leaf('FolderTree').onReview())
	eq(m.t.state.params.q, 'is:unreviewed')
	m.act(() => m.leaf('FolderTree').onApplySaved(SAVED[1]))
	eq(m.t.state.params, { q: 'kind:logo', folder: ACME.id, sort: 'name' })
	// The facet panel toggles clauses; its active set comes from the committed chips.
	answer(lastSearch(m.t), many(60), { total: 40, query: { chips: [{ key: 'a', kind: 'filter', label: 'type: png', clause: 'type:png', field: 'type', values: ['png'], negated: false, start: 0, end: 8 }], warnings: [], sort: null, hasText: false } })
	await flush()
	assert(m.leaf('FacetPanel').activeValues.has('type:png'), 'an active chip shows as active in the facets')
	m.act(() => m.leaf('FacetPanel').onToggle('type:jpg', false))
	eq(m.t.state.draft, 'kind:logo type:jpg', 'the clause is added to the text in the box')
	m.act(() => m.leaf('FacetPanel').onSelectFolder(ACME_KITCHENS.id))
	eq([m.t.state.params.folder, m.t.state.params.deep], [ACME_KITCHENS.id, false], 'the count beside a facet folder is for images directly in it')

	// Under lg the rail is a sheet; choosing something in it closes it.
	eq(m.leaves('FolderTree').length, 1)
	m.click(m.button('Folders and filters'))
	eq(m.ui('sheet').length, 1, 'the sheet is open')
	eq(m.leaves('FolderTree').length, 2, 'the rail is inside it')
	m.act(() => m.leaves('FolderTree')[1].onSelect(undefined))
	eq(m.ui('sheet').length, 0, 'it closed')
	eq(m.t.state.params.folder, undefined)
	m.close()
})

await check('wiring: the search box commits through the debounce and Enter, saves with permission, and chips and clear-all act on the box', async () => {
	const m = mountLibrary({ initial: richInitial({ params: { q: 'tag:kitchen' }, search: searchResponse(realisticSixty(), { total: 312, hasMore: true, query: { chips: [{ key: 'a', kind: 'filter', label: 'tag: kitchen', clause: 'tag:kitchen', field: 'tag', values: ['kitchen'], negated: false, start: 0, end: 11 }], warnings: [], sort: null, hasText: false } }) }), search: '?q=tag%3Akitchen', handlers: { createSaved: (input) => ({ id: hex(5009), ...input, createdAt: '2026-03-01T00:00:00.000Z' }) } })
	eq(m.leaf('SearchBar').canSave, true, 'a search with something to save')
	m.act(() => m.leaf('SearchBar').onChange('tag:kitchen sink'))
	await m.t.clock.advance(199)
	eq(m.t.search.items.length, 0)
	await m.t.clock.advance(1)
	eq(m.t.search.items.length, 1)
	m.act(() => m.leaf('SearchBar').onSubmit('bath'))
	eq(searchParamsOf(lastSearch(m.t)).q, 'bath', 'Enter does not wait')
	await m.leaf('SearchBar').onSave('Baths')
	eq(m.t.api.of('createSaved')[0].args[0], { name: 'Baths', query: 'bath', folder: null, sort: null })
	eq(m.leaf('FolderTree').saved[0].name, 'Baths', 'the rail lists it at once')
	answer(lastSearch(m.t), many(2), { total: 2, query: { chips: [{ key: 'a', kind: 'term', label: 'bath', clause: 'bath', negated: false, start: 0, end: 4 }], warnings: [], sort: null, hasText: true } })
	await flush()
	eq([m.leaf('GridToolbar').hasText, m.leaf('AssetGrid').showMatch], [true, true])
	m.act(() => m.leaf('SearchBar').onRemoveChip(m.leaf('SearchBar').chips[0]))
	eq(m.t.state.params.q, '')
	m.act(() => m.leaf('SearchBar').onSubmit('x'))
	m.act(() => m.leaf('SearchBar').onClearAll())
	eq([m.t.state.params.q, m.t.state.draft], ['', ''])
	assert(typeof m.leaf('SearchBar').fetchSuggestions === 'function')
	m.close()

	const viewer = mountLibrary({ initial: richInitial({ params: { q: 'x' } }), can: { write: false, delete: false }, search: '?q=x' })
	eq(viewer.leaf('SearchBar').canSave, false, 'saving needs write')
	viewer.close()
})

await check('wiring: / focuses the search, Esc closes the detail and then clears the selection, Ctrl/Cmd+A selects the loaded cards, Delete asks; typing targets are left alone', () => {
	const m = mountLibrary({ initial: richInitial() })
	eq(m.doc.listenerCount, 1, 'one keydown listener, on the document')
	let e = m.key('/')
	eq([e.defaultPrevented, fakeInput.calls], [true, ['focus', 'select']], '/ focuses the box (and selects what is in it)')
	fakeInput.calls.length = 0

	const typing = [
		{ tagName: 'INPUT' },
		{ tagName: 'TEXTAREA' },
		{ tagName: 'SELECT' },
		{ tagName: 'DIV', isContentEditable: true },
		{ tagName: 'DIV', getAttribute: (n) => (n === 'role' ? 'combobox' : null) },
		{ tagName: 'DIV', closest: (s) => (s.includes('[role="combobox"]') ? {} : null) },
	]
	for (const [key, over] of [['/', {}], ['a', { ctrlKey: true }], ['Escape', {}], ['Delete', {}]])
		for (const target of typing) {
			e = m.key(key, { ...over, target: { getAttribute: () => null, closest: () => null, ...target } })
			eq(e.defaultPrevented, false, `${key} in ${JSON.stringify(Object.keys(target))}`)
		}
	eq(fakeInput.calls, [], 'nothing was focused')
	eq(m.leaf('SelectionBar').count, 0, 'and nothing was selected')

	e = m.key('a', { ctrlKey: true })
	eq([e.defaultPrevented, m.leaf('SelectionBar').count], [true, 60], 'Ctrl+A selects every loaded card')
	m.key('Escape')
	eq(m.leaf('SelectionBar').count, 0, 'Esc clears it')
	m.key('A', { metaKey: true })
	eq(m.leaf('SelectionBar').count, 60, 'Cmd+A too')
	m.act(() => m.leaf('SelectionBar').onClear())

	// Esc closes the sheet first and leaves the selection for the next Esc.
	m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(1), { range: false }))
	m.act(() => m.leaf('AssetGrid').onOpen(hex(2)))
	m.key('Escape')
	eq([m.leaf('DetailPanel').asset, m.leaf('SelectionBar').count], [null, 1])
	m.key('Escape')
	eq(m.leaf('SelectionBar').count, 0)
	// While the sheet is open the page's other keys are not the page's.
	m.act(() => m.leaf('AssetGrid').onOpen(hex(2)))
	e = m.key('a', { ctrlKey: true })
	eq([e.defaultPrevented, m.leaf('SelectionBar').count], [false, 0])
	m.act(() => m.leaf('DetailPanel').onClose())

	// Delete needs something selected and the permission; it only asks.
	e = m.key('Delete')
	eq([e.defaultPrevented, m.ui('alert-dialog').length], [false, 0], 'nothing selected')
	m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(1), { range: false }))
	e = m.key('Delete')
	eq([e.defaultPrevented, m.ui('alert-dialog').length], [true, 1])
	eq(m.t.api.of('bulk').length, 0, 'asking is not deleting')
	// With a dialog open the page's shortcuts stand down.
	fakeInput.calls.length = 0
	e = m.key('/')
	eq([e.defaultPrevented, fakeInput.calls.length], [false, 0])
	// A key inside a dialog or the tree is theirs.
	m.act(() => m.ui('alert-dialog')[0].props.onOpenChange(false))
	eq(m.ui('alert-dialog').length, 0)
	e = m.key('/', { target: { tagName: 'DIV', getAttribute: () => null, closest: (s) => (s.includes('[role="dialog"]') ? {} : null) } })
	eq(e.defaultPrevented, false)
	m.close()
	eq(m.doc.listenerCount, 0, 'the listener is removed on unmount')

	// A role without delete never gets the confirmation.
	const writer = mountLibrary({ initial: richInitial(), can: { write: true, delete: false } })
	writer.act(() => writer.leaf('AssetGrid').onToggleSelect(hex(1), { range: false }))
	e = writer.key('Delete')
	eq([e.defaultPrevented, writer.ui('alert-dialog').length], [false, 0])
	e = writer.key('a', { ctrlKey: true })
	eq(writer.leaf('SelectionBar').count, 60, 'but selecting is fine')
	writer.close()
})

const confirmOf = async (m) => {
	m.act(() => m.ui('alert-confirm')[0].props.onClick({ preventDefault() {} }))
	await flush()
}

await check('wiring: Delete asks with the count and scope in words and that it is permanent; confirming sends the bulk delete; a failure stays open with the message and Esc cannot abandon a request in flight', async () => {
	let fail = true
	const gate = manual()
	const m = mountLibrary({ initial: richInitial(), handlers: { bulk: (body) => (fail ? Promise.reject(apiError('Could not delete.', 500)) : gate(body)) } })
	m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(1), { range: false }))
	m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(3), { range: true }))
	m.act(() => m.leaf('SelectionBar').onDelete())
	eq(m.tree.text(m.ui('alert-title')[0]), 'Delete 3 images?')
	const description = m.tree.text(m.ui('alert-description')[0])
	assert(description.includes('Delete the 3 images you selected.'), description)
	assert(description.includes('This is permanent.'), description)
	assert(description.includes('If an image is used on a site, it will stop showing there.'), description)

	await confirmOf(m)
	eq(m.ui('alert-dialog').length, 1, 'a failure keeps the dialog open')
	const alert = m.tree.find((n) => n.props?.role === 'alert')
	eq(m.tree.text(alert), 'Could not delete.')
	eq(m.leaf('SelectionBar').count, 3, 'and the selection')
	eq(m.leaf('AssetGrid').assets.length, 60)

	fail = false
	await confirmOf(m)
	eq(m.ui('alert-dialog').length, 1, 'still open while the request is out')
	eq(m.ui('alert-confirm')[0].props.disabled, true, 'a second click is not possible')
	m.act(() => m.ui('alert-dialog')[0].props.onOpenChange(false))
	eq(m.ui('alert-dialog').length, 1, 'Esc or a click outside cannot abandon it')
	gate.items[0].resolve({ affected: 3 })
	await flush()
	eq(m.ui('alert-dialog').length, 0, 'closed once it is done')
	eq([m.leaf('AssetGrid').assets.length, m.leaf('SelectionBar').count], [57, 0])
	eq(lastBulk(m.t), { action: 'delete', target: { ids: idRange(1, 3) } })
	m.close()

	// All matching: the scope in words, with the folder and whether subfolders count.
	const initial = richInitial({ params: { q: 'tag:kitchen', folder: ACME.id, deep: true } })
	const all = mountLibrary({ initial, search: `?q=tag%3Akitchen&folder=${ACME.id}&deep=1` })
	all.act(() => all.leaf('SelectionBar').onSelectAllMatching())
	all.act(() => all.leaf('SelectionBar').onDelete())
	eq(all.tree.text(all.ui('alert-title')[0]), 'Delete 312 images?')
	eq(all.tree.text(all.ui('alert-description')[0]), 'Delete all 312 images matching tag:kitchen in Clients/Acme and its subfolders. This is permanent. If an image is used on a site, it will stop showing there.')
	all.close()
	const only = mountLibrary({ initial: richInitial({ params: { q: '', folder: ACME.id, deep: false } }), search: `?folder=${ACME.id}&deep=0` })
	only.act(() => only.leaf('SelectionBar').onSelectAllMatching())
	only.act(() => only.leaf('SelectionBar').onDelete())
	assert(only.tree.text(only.ui('alert-description')[0]).startsWith('Delete all 312 images in Clients/Acme only.'), only.tree.text(only.ui('alert-description')[0]))
	only.close()
	const library = mountLibrary({ initial: richInitial() })
	library.act(() => library.leaf('SelectionBar').onSelectAllMatching())
	library.act(() => library.leaf('SelectionBar').onDelete())
	assert(library.tree.text(library.ui('alert-description')[0]).startsWith('Delete all 312 images in your library.'))
	library.close()
})

await check('wiring: a confirmation runs exactly what it said, even when the selection moved while it was up', async () => {
	// Three images are chosen and the dialog says so; then something (a reload that pruned, a
	// keystroke) changes the live selection. Confirming acts on the three that were read out.
	const open = (m, kind) => m.act(() => m.leaf('SelectionBar')[kind]())
	const three = (m) => {
		for (const i of [1, 2, 3]) m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(i), { range: false }))
	}
	const moveUnderneath = (m) => {
		m.act(() => m.t.actions.toggleSelect(hex(2), { range: false }))
		m.act(() => m.t.actions.toggleSelect(hex(9), { range: false }))
		eq([...m.t.state.selection.ids].sort(), [hex(1), hex(3), hex(9)], 'the live selection really moved')
	}
	const wanted = [hex(1), hex(2), hex(3)]

	const del = mountLibrary({ initial: richInitial(), handlers: { bulk: () => ({ affected: 3 }) } })
	three(del)
	open(del, 'onDelete')
	eq(del.tree.text(del.ui('alert-title')[0]), 'Delete 3 images?')
	moveUnderneath(del)
	eq(del.tree.text(del.ui('alert-title')[0]), 'Delete 3 images?', 'the words do not change under the person')
	await confirmOf(del)
	eq(lastBulk(del.t), { action: 'delete', target: { ids: wanted } }, 'delete: the three it asked about')
	del.close()

	const move = mountLibrary({ initial: richInitial() })
	three(move)
	open(move, 'onMove')
	moveUnderneath(move)
	await move.leaf('MoveDialog').onConfirm(ACME.id)
	eq(lastBulk(move.t), { action: 'move', target: { ids: wanted }, folderId: ACME.id }, 'move')
	move.close()

	const tag = mountLibrary({ initial: richInitial() })
	three(tag)
	open(tag, 'onTag')
	moveUnderneath(tag)
	await tag.leaf('BulkTagDialog').onSubmit({ add: ['Remodel'], remove: ['old'] })
	eq(tag.t.api.of('bulk').map((c) => [c.args[0].action, c.args[0].target.ids]), [['addTags', wanted], ['removeTags', wanted]], 'tags: both halves, the same three')
	tag.close()

	const retag = mountLibrary({ initial: richInitial({ tagging: TAGGING_ON }) })
	three(retag)
	open(retag, 'onRetag')
	moveUnderneath(retag)
	await confirmOf(retag)
	eq(lastBulk(retag.t), { action: 'retag', target: { ids: wanted } }, 'auto-tag again')
	retag.close()

	// "All matching": the search and the total that were read out, though the live mode ended meanwhile.
	const all = mountLibrary({ initial: richInitial({ params: { q: 'tag:kitchen' } }), search: '?q=tag%3Akitchen' })
	all.act(() => all.leaf('SelectionBar').onSelectAllMatching())
	open(all, 'onDelete')
	eq(all.tree.text(all.ui('alert-title')[0]), 'Delete 312 images?')
	all.act(() => all.t.actions.toggleSelect(hex(2), { range: false }))
	eq(all.t.state.selection.allMatching, false, 'touching a card ended "all matching" behind the dialog')
	await confirmOf(all)
	eq(lastBulk(all.t), { action: 'delete', target: { search: { q: 'tag:kitchen', expect: 312 } } }, 'it still deletes what it said: 312 matching, checked by the server against 312')
	all.close()
})

await check('wiring: auto-tag again confirms with the scope and the daily limit, then queues; Move opens with where the images are now; Tag opens with their tags counted', async () => {
	const m = mountLibrary({ initial: richInitial({ tagging: TAGGING_ON }), handlers: { bulk: () => ({ affected: 3 }), process: () => batch([], { remaining: 0 }) } })
	// Images 4, 8, 12 are all unfiled; 4 and 5 are not.
	for (const i of [4, 8, 12]) m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(i), { range: false }))
	m.act(() => m.leaf('SelectionBar').onRetag())
	eq(m.tree.text(m.ui('alert-title')[0]), 'Auto-tag 3 images again?')
	const text = m.tree.text(m.ui('alert-description')[0])
	assert(text.includes('the 3 images you selected') && /daily auto-tagging limit/.test(text) && /tags you removed are not brought back/i.test(text), text)
	await confirmOf(m)
	eq(lastBulk(m.t), { action: 'retag', target: { ids: [hex(4), hex(8), hex(12)] } })
	eq(m.ui('alert-dialog').length, 0)
	eq(m.leaf('AssetGrid').assets.find((a) => a.id === hex(4)).tagging.status, 'pending', 'queued images show as waiting')

	m.act(() => m.leaf('SelectionBar').onMove())
	const move = m.leaf('MoveDialog')
	eq([move.open, move.title, move.confirmLabel, move.folders.length, move.currentId], [true, 'Move 3 images', 'Move here', 20, null], 'all three are unfiled, so the dialog starts there')
	await move.onConfirm(ACME.id)
	eq(lastBulk(m.t), { action: 'move', target: { ids: [hex(4), hex(8), hex(12)] }, folderId: ACME.id })
	eq(m.leaf('SelectionBar').count, 0, 'moved: the selection is done')
	eq(m.leaf('MoveDialog').open, true, 'closing is the dialog\'s own business after its promise resolves')
	eq(m.leaf('MoveDialog').title, 'Move 3 images', 'and while it fades out it still says what was asked, though the selection behind it is already clear')
	m.act(() => m.leaf('MoveDialog').onOpenChange(false))
	eq(m.leaf('MoveDialog').open, false)

	m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(2), { range: false }))
	m.act(() => m.leaf('AssetGrid').onToggleSelect(hex(4), { range: false }))
	m.act(() => m.leaf('SelectionBar').onMove())
	eq(m.leaf('MoveDialog').currentId, undefined, 'mixed places: no preselection')
	m.act(() => m.leaf('MoveDialog').onOpenChange(false))

	m.act(() => m.leaf('SelectionBar').onTag())
	const tag = m.leaf('BulkTagDialog')
	eq([tag.open, tag.count], [true, 2])
	assert(tag.existing.every((row) => row.count >= 1 && row.count <= 2 && typeof row.slug === 'string' && typeof row.label === 'string'))
	assert(tag.existing.every((row, i) => i === 0 || tag.existing[i - 1].count >= row.count), 'most common first')
	eq(tag.existing.find((row) => row.slug === 'interior')?.count, 2, 'both images carry the automatic tag Interior')
	await tag.onSubmit({ add: ['Remodel'], remove: ['interior'] })
	eq(m.t.api.of('bulk').slice(-2).map((c) => [c.args[0].action, c.args[0].tags]), [['addTags', ['Remodel']], ['removeTags', ['interior']]])
	m.act(() => m.leaf('BulkTagDialog').onOpenChange(false))
	eq(m.leaf('BulkTagDialog').open, false)
	assert(typeof tag.fetchSuggestions === 'function')
	m.close()

	// "All matching": the existing tags come from the facets (top 30), with the facet counts.
	const all = mountLibrary({ initial: richInitial() })
	all.act(() => all.leaf('SelectionBar').onSelectAllMatching())
	all.act(() => all.leaf('SelectionBar').onTag())
	eq([all.leaf('BulkTagDialog').count, all.leaf('BulkTagDialog').existing.length], [312, 30])
	eq(all.leaf('BulkTagDialog').existing[0], { slug: 'tag-0', label: 'Tag 0', count: 100 })
	all.act(() => all.leaf('SelectionBar').onMove())
	eq([all.leaf('MoveDialog').title, all.leaf('MoveDialog').currentId], ['Move 312 images', undefined])
	all.close()
})

await check('wiring: the tag manager opens from the header and from the filters; renaming rewrites the open query; "Show these images" filters and closes', async () => {
	const query = { chips: [{ key: 'a', kind: 'filter', label: 'tag: van', clause: 'tag:van', field: 'tag', values: ['van'], negated: false, start: 0, end: 7 }], warnings: [], sort: null, hasText: false }
	const m = mountLibrary({ initial: richInitial({ params: { q: 'tag:van' }, search: searchResponse(realisticSixty(), { total: 312, hasMore: true, query }) }), search: '?q=tag%3Avan', handlers: { renameTag: () => ({ affected: 4, slug: 'truck', merged: true }), listTags: () => [] } })
	eq(m.leaf('TagManagerDialog').open, false)
	m.click(m.button('Tags'))
	eq([m.leaf('TagManagerDialog').open, m.leaf('TagManagerDialog').canEdit, m.leaf('TagManagerDialog').canDelete], [true, true, true])
	m.act(() => m.leaf('TagManagerDialog').onOpenChange(false))
	eq(m.leaf('TagManagerDialog').open, false)
	m.act(() => m.leaf('FacetPanel').onManageTags())
	eq(m.leaf('TagManagerDialog').open, true, 'also from "Manage tags" in the filters')
	const renamed = await m.leaf('TagManagerDialog').onRename('van', 'Truck')
	eq(renamed, { slug: 'truck', merged: true })
	eq(m.t.state.params.q, 'tag:truck', 'the chip in the open query follows the rename')
	eq(m.leaf('SearchBar').value, 'tag:truck')
	m.act(() => m.leaf('TagManagerDialog').onFilter('bath'))
	eq(m.t.state.params.q, 'tag:truck tag:bath', 'a clause is added')
	m.act(() => m.leaf('TagManagerDialog').onOpenChange(false))
	m.close()

	const viewer = mountLibrary({ initial: richInitial(), can: { write: false, delete: false } })
	viewer.click(viewer.button('Tags'))
	eq([viewer.leaf('TagManagerDialog').canEdit, viewer.leaf('TagManagerDialog').canDelete], [false, false])
	viewer.close()
	const writer = mountLibrary({ initial: richInitial(), can: { write: true, delete: false } })
	writer.click(writer.button('Tags'))
	eq([writer.leaf('TagManagerDialog').canEdit, writer.leaf('TagManagerDialog').canDelete], [true, false])
	writer.close()
})

await check('wiring: New folder asks where it goes, checks the name, creates it under the open folder, and shows the server\'s refusal', async () => {
	let fail = null
	const m = mountLibrary({ initial: richInitial({ params: { q: '', folder: ACME.id } }), search: `?folder=${ACME.id}`, handlers: { createFolder: () => (fail ? Promise.reject(fail) : { folder: FOLDERS[0] }) } })
	assert(m.button('New folder'), 'the header has the button for a writer')
	m.click(m.button('New folder'))
	eq(m.ui('dialog').length, 1)
	assert(m.tree.text(m.ui('dialog')[0]).includes('It will be created inside Clients/Acme.'), m.tree.text(m.ui('dialog')[0]))
	const input = () => m.tree.find((n) => n.type === 'input')
	const submit = async () => {
		const form = m.tree.find((n) => n.type === 'form')
		m.tree.act(() => form.props.onSubmit({ preventDefault() {} }))
		await flush()
	}
	const create = () => m.tree.find((n) => n.type === 'button' && m.tree.text(n).includes('Create folder'))
	eq(create().props.disabled, true, 'nothing typed: nothing to create')
	for (const [typed, message] of [['bad/name', /slashes/], ['   ', /Give the folder a name/], ['x'.repeat(81), /at most 80/]]) {
		m.act(() => input().props.onChange({ target: { value: typed } }))
		await submit()
		assert(message.test(m.tree.text(m.tree.find((n) => n.props?.role === 'alert'))), `${typed.slice(0, 10)}: ${m.tree.text(m.tree.find((n) => n.props?.role === 'alert'))}`)
	}
	eq(m.t.api.of('createFolder').length, 0, 'a bad name never reaches the server')
	m.act(() => input().props.onChange({ target: { value: '  Photos  ' } }))
	eq(m.tree.find((n) => n.props?.role === 'alert'), undefined, 'typing clears the message')
	fail = apiError('A folder named Photos already exists here.', 409)
	await submit()
	eq(m.tree.text(m.tree.find((n) => n.props?.role === 'alert')), 'A folder named Photos already exists here.')
	eq(m.ui('dialog').length, 1, 'still open to fix it')
	fail = null
	await submit()
	eq(m.t.api.of('createFolder').at(-1).args[0], { name: 'Photos', parentId: ACME.id }, 'trimmed, under the open folder')
	eq(m.ui('dialog').length, 0, 'closed on success')
	m.close()

	// At the top when nothing is open, and when the open folder cannot hold another level.
	const top = mountLibrary({ initial: richInitial() })
	top.click(top.button('New folder'))
	assert(top.tree.text(top.ui('dialog')[0]).includes('created at the top of the library'))
	top.close()
	const deep = { id: hex(4001), parentId: ACME.id, name: 'Deep', path: 'Clients/Acme/Deep', depth: MEDIA_LIMITS.maxFolderDepth - 1, count: 0, total: 0 }
	const full = mountLibrary({ initial: richInitial({ params: { q: '', folder: deep.id }, folders: foldersResponse({ folders: [...FOLDERS, deep] }) }), search: `?folder=${deep.id}` })
	full.click(full.button('New folder'))
	assert(full.tree.text(full.ui('dialog')[0]).includes('created at the top of the library'), 'the open folder is at the depth limit, so it says where the new one really goes')
	full.close()
})

await check('wiring: the header Upload opens the picker, shows busy while a batch uploads, and what finishes goes through the same state', async () => {
	const m = mountLibrary({ initial: richInitial() })
	m.click(m.button('Upload'))
	eq(fakePicker.calls, ['openPicker'])
	m.act(() => m.leaf('UploadManager').onBusyChange(true))
	eq(m.button('Upload').props['aria-busy'], true)
	m.act(() => m.leaf('UploadManager').onBusyChange(false))
	eq(m.button('Upload').props['aria-busy'], undefined)
	m.act(() => m.leaf('UploadManager').onRegistered({ status: 'created', asset: asset(900, { folderId: ACME.id, tagging: { status: 'pending' } }) }))
	eq(m.leaf('AiStatusBanner').pending, 5, 'the new image waits for tags (4 + 1)')
	m.act(() => m.leaf('UploadManager').onSelectBatch([hex(900)]))
	eq(m.t.state.params, { q: '', folder: ACME.id })
	eq([m.leaf('UploadManager').folderId, m.leaf('UploadManager').destinationLabel], [ACME.id, 'Upload to Clients/Acme'])
	eq(m.leaf('SelectionBar').count, 1)
	eq(m.leaf('GridToolbar').selecting, true, 'selection mode, so the checkbox shows')
	m.act(() => m.leaf('UploadManager').onOpenAsset(hex(777)))
	eq(m.t.state.openId, hex(777), 'the View button of a duplicate opens it (and fetches it when it is not loaded)')
	eq(m.t.api.of('getAsset').length >= 1, true)
	m.close()
})

await check('wiring: the detail sheet\'s callbacks edit, delete, re-tag, filter and suggest through the controller for the open image', async () => {
	const m = mountLibrary({
		initial: richInitial({ tagging: TAGGING_ON }),
		handlers: {
			patchAsset: (id, patch) => realistic(Number.parseInt(id, 16), { name: patch.name ?? 'x' }),
			deleteAsset: () => ({ ok: true }),
			bulk: () => ({ affected: 1 }),
			listTags: () => [{ slug: 'kitchen', label: 'Kitchen', count: 214, manual: 200, auto: 14 }],
			process: () => batch([], { remaining: 0 }),
		},
	})
	m.act(() => m.leaf('AssetGrid').onOpen(hex(5)))
	await m.leaf('DetailPanel').onPatch({ name: 'Renamed', addTags: ['New'] })
	eq(m.t.api.of('patchAsset')[0].args, [hex(5), { name: 'Renamed', addTags: ['New'] }])
	eq(m.leaf('DetailPanel').asset.name, 'Renamed')
	await m.leaf('DetailPanel').onRetag()
	eq(lastBulk(m.t), { action: 'retag', target: { ids: [hex(5)] } })
	eq((await m.leaf('DetailPanel').fetchTagSuggestions('kit'))[0].count, 214)
	await m.leaf('DetailPanel').onDelete()
	eq([m.leaf('DetailPanel').asset, m.leaf('AssetGrid').assets.length, m.t.api.of('deleteAsset')[0].args], [null, 59, [hex(5)]])
	m.act(() => m.leaf('AssetGrid').onOpen(hex(6)))
	eq(m.leaf('DetailPanel').asset.id, hex(6))
	m.act(() => m.leaf('DetailPanel').onFilter('color:blue'))
	eq([m.leaf('DetailPanel').asset, m.t.state.params.q], [null, 'color:blue'], 'filtering from the sheet closes it and searches')
	eq(lastWrite(m.t)[1], '/account/media?q=color%3Ablue', 'and ?asset= is gone from the URL')
	m.close()
})

await check('wiring: the one live region speaks the controller\'s announcements, and the card count, tagging progress and errors all go through it', async () => {
	const m = mountLibrary({ initial: richInitial() })
	const live = () => m.tree.find((n) => n.props?.['data-slot'] === 'media-live')
	eq([live().props['aria-live'], live().props.role], ['polite', 'status'])
	eq(m.tree.findAll((n) => n.props?.['aria-live']).length, 1, 'one live region in the library\'s own markup')
	m.act(() => m.leaf('SearchBar').onSubmit('kitchen'))
	answer(lastSearch(m.t), many(5), { total: 5 })
	await flush()
	assert(m.tree.text(live()).replace(/\u200b/g, '') === '5 results.', m.tree.text(live()))
	m.act(() => m.t.actions.announce('Same words.'))
	const a = m.tree.text(live())
	m.act(() => m.t.actions.announce('Same words.'))
	assert(m.tree.text(live()) !== a, 'a repeated message still changes the text, so it is read again')
	m.close()
})

/* ========================================================================== */
/* page.tsx                                                                   */
/* ========================================================================== */

const { ObjectId } = rootRequire('mongodb')
const pageWorld = {
	calls: [],
	membership: null,
	searchAssets: null,
	getFoldersResponse: null,
	getTaggingStatus: null,
	savedDocs: null,
	savedFilter: null,
	savedSort: null,
	savedThrows: null,
}
const resetPageWorld = () => {
	pageWorld.calls = []
	pageWorld.membership = fakeMembership()
	pageWorld.searchAssets = async () => searchResponse(many(3), { total: 3 })
	pageWorld.getFoldersResponse = async () => foldersResponse()
	pageWorld.getTaggingStatus = async () => TAGGING_ON
	pageWorld.savedDocs = async () => []
	pageWorld.savedFilter = null
	pageWorld.savedSort = null
	pageWorld.savedThrows = null
}
function fakeMembership(permissions = ['projects.view', 'media.upload', 'media.delete'], workspaceId = WS) {
	return { db: { name: 'the-db' }, userId: 'user-1', workspace: { _id: new ObjectId(workspaceId), name: 'Acme' }, permissions: new Set(permissions) }
}
function MediaLibraryStub() {
	return null
}
mock('@/lib/workspace/current', {
	currentMembership: async () => {
		pageWorld.calls.push('membership')
		return pageWorld.membership
	},
})
mock('@/lib/media/search', {
	searchAssets: (db, ctx, params) => {
		pageWorld.calls.push('search')
		pageWorld.lastSearch = { db, ctx, params }
		return pageWorld.searchAssets(db, ctx, params)
	},
})
mock('@/lib/media/folders', {
	getFoldersResponse: (db, id) => {
		pageWorld.calls.push('folders')
		pageWorld.lastFolders = { db, id }
		return pageWorld.getFoldersResponse(db, id)
	},
})
mock('@/lib/media/process', {
	getTaggingStatus: (db, id) => {
		pageWorld.calls.push('tagging')
		pageWorld.lastTagging = { db, id }
		return pageWorld.getTaggingStatus(db, id)
	},
})
mock('@/lib/media/collections', {
	savedSearchesOf: (db) => {
		pageWorld.calls.push('saved')
		if (pageWorld.savedThrows) throw pageWorld.savedThrows
		return {
			find(filter) {
				pageWorld.savedFilter = filter
				return {
					sort(spec) {
						pageWorld.savedSort = spec
						return { toArray: () => pageWorld.savedDocs() }
					},
				}
			},
		}
	},
})
mock('./media-library', { MediaLibrary: MediaLibraryStub })
const mediaPage = loadTs('src/app/account/media/page.tsx')
const savedDoc = (n, over = {}) => ({
	_id: new ObjectId(hex(6000 + n)),
	workspaceId: new ObjectId(WS),
	name: `Saved ${n}`,
	query: `tag:t${n}`,
	folder: null,
	sort: null,
	createdBy: 'user-1',
	createdAt: new Date(Date.UTC(2026, 0, n)),
	...over,
})
async function renderPage(searchParams = {}) {
	return mediaPage.default({ searchParams: Promise.resolve(searchParams) })
}
/** Runs `fn` with console.error captured, so a logged-and-swallowed failure is asserted instead of failing the run. */
async function withConsoleCaptured(fn) {
	const logs = []
	const original = console.error
	console.error = (...args) => logs.push(args.map(String).join(' '))
	try {
		return { result: await fn(), logs }
	} finally {
		console.error = original
	}
}
const notFound = (e) => e?.digest === 'NEXT_NOT_FOUND'

await check('page: exports force-dynamic (never cached: the library is per person and per request) and the title', () => {
	resetPageWorld()
	eq(mediaPage.dynamic, 'force-dynamic')
	eq(mediaPage.metadata, { title: 'Media' })
	eq(typeof mediaPage.default, 'function')
	eq(mediaPage.default.constructor.name, 'AsyncFunction', 'a server component, awaited by Next')
})

await check('page: no membership, or no projects.view, is a 404 before anything is loaded', async () => {
	resetPageWorld()
	pageWorld.membership = null
	await rejects(renderPage(), notFound, 'signed out')
	eq(pageWorld.calls, ['membership'])
	for (const permissions of [[], ['media.upload'], ['media.upload', 'media.delete'], ['team.view', 'account.manage'], ['projects.edit']]) {
		resetPageWorld()
		pageWorld.membership = fakeMembership(permissions)
		await rejects(renderPage(), notFound, permissions.join(','))
		eq(pageWorld.calls, ['membership'], `${permissions.join(',') || 'no permissions'}: nothing was queried`)
	}
})

await check('page: can.write and can.delete come from media.upload and media.delete, in every combination', async () => {
	for (const [permissions, write, del] of [
		[['projects.view'], false, false],
		[['projects.view', 'media.upload'], true, false],
		[['projects.view', 'media.delete'], false, true],
		[['projects.view', 'media.upload', 'media.delete'], true, true],
		[['projects.view', 'projects.edit', 'projects.delete', 'team.manage'], false, false],
	]) {
		resetPageWorld()
		pageWorld.membership = fakeMembership(permissions)
		const element = await renderPage()
		assert(element.type === MediaLibraryStub, 'it renders the library')
		eq(element.props.can, { write, delete: del }, permissions.join(','))
		eq(typeof element.props.can.write, 'boolean')
	}
})

await check('page: the library gets the account it was rendered for, the upload limit and prefix, and the hint it needs', async () => {
	resetPageWorld()
	const other = hex(0xfeed)
	pageWorld.membership = fakeMembership(['projects.view'], other)
	const element = await renderPage()
	eq(element.props.workspaceId, other)
	eq(typeof element.props.workspaceId, 'string', 'a string, not an ObjectId: it crosses to the browser')
	eq(element.props.maxBytes, MEDIA_LIMITS.maxBytes)
	eq(element.props.pathPrefix, `workspaces/${other}/media/`)
	eq(Object.keys(element.props).sort(), ['can', 'initial', 'maxBytes', 'pathPrefix', 'workspaceId'])
	eq(Object.keys(element.props.initial).sort(), ['folders', 'params', 'saved', 'search', 'tagging'])
	// Everything the loaders return goes through untouched.
	const search = searchResponse(many(4), { total: 4 })
	const folders = foldersResponse({ total: 4 })
	const tagging = { ...TAGGING_ON, pending: 2 }
	pageWorld.searchAssets = async () => search
	pageWorld.getFoldersResponse = async () => folders
	pageWorld.getTaggingStatus = async () => tagging
	const again = await renderPage()
	assert(again.props.initial.search === search && again.props.initial.folders === folders && again.props.initial.tagging === tagging)
	eq(pageWorld.lastFolders.id.toString(), other, 'the folders are the account\'s own')
	assert(pageWorld.lastFolders.db === pageWorld.membership.db, 'through the membership\'s database')
})

await check('page: the URL is read with readSearchParams from the Promise Next 15 passes, the first page and its facets are asked for, hostile values degrade', async () => {
	resetPageWorld()
	await renderPage({ q: 'kitchen', folder: ACME.id, deep: '1', sort: 'oldest' })
	const { ctx, params } = pageWorld.lastSearch
	eq(params, { q: 'kitchen', folder: ACME.id, deep: true, sort: 'oldest', offset: 0, limit: 60, facets: true })
	assert(ctx.workspaceId instanceof ObjectId && ctx.workspaceId.toString() === WS, 'the account is an ObjectId in the search context')
	eq(ctx.userId, 'user-1')
	assert(pageWorld.lastSearch.db === pageWorld.membership.db)

	// The page asks for page one with facets whatever the URL says about paging.
	await renderPage({ offset: '9999', limit: '120', facets: '0' })
	eq([pageWorld.lastSearch.params.offset, pageWorld.lastSearch.params.limit, pageWorld.lastSearch.params.facets], [0, MEDIA_LIMITS.pageSize, true])

	const hostile = [
		{ q: ['a', 'b'] }, { q: 'x'.repeat(5000) }, { folder: 'zzz' }, { folder: ['unfiled', 'x'] }, { deep: 'maybe' }, { sort: 'NEWEST' },
		{ sort: ['name', 'oldest'] }, { __proto__: { polluted: 1 } }, { constructor: 'x', toString: 'y' }, { q: undefined }, { asset: 'zz' }, { q: '\u0000<script>' },
	]
	for (const searchParams of hostile) {
		resetPageWorld()
		const element = await renderPage(searchParams)
		const used = pageWorld.lastSearch.params
		assert(typeof used.q === 'string' && used.q.length <= MEDIA_LIMITS.queryMax)
		assert(used.folder === undefined || used.folder === 'unfiled' || /^[a-f0-9]{24}$/i.test(used.folder))
		assert(used.deep === undefined || typeof used.deep === 'boolean')
		assert(used.sort === undefined || types.MEDIA_SORTS.includes(used.sort))
		eq([used.offset, used.limit, used.facets], [0, 60, true])
		eq(element.props.initial.params, used, 'the hint the library gets is the search that was run')
	}
	eq((await renderPage({ q: ['a', 'b'] })).props.initial.params.q, 'a', 'a repeated key reads as its first value, like the API')
	assert(Object.prototype.polluted === undefined)
})

await check('page: saved searches are this account\'s, newest first, as DTOs that leak no ids but their own', async () => {
	resetPageWorld()
	const docs = [savedDoc(3), savedDoc(2, { folder: ACME.id, sort: 'name' }), savedDoc(1)]
	pageWorld.savedDocs = async () => docs
	const element = await renderPage()
	eq(pageWorld.savedFilter, { workspaceId: new ObjectId(WS) })
	assert(pageWorld.savedFilter.workspaceId.toString() === WS, 'scoped to the account')
	eq(pageWorld.savedSort, { createdAt: -1, _id: -1 }, 'newest first, ties by id')
	eq(element.props.initial.saved, [
		{ id: hex(6003), name: 'Saved 3', query: 'tag:t3', folder: null, sort: null, createdAt: '2026-01-03T00:00:00.000Z' },
		{ id: hex(6002), name: 'Saved 2', query: 'tag:t2', folder: ACME.id, sort: 'name', createdAt: '2026-01-02T00:00:00.000Z' },
		{ id: hex(6001), name: 'Saved 1', query: 'tag:t1', folder: null, sort: null, createdAt: '2026-01-01T00:00:00.000Z' },
	])
	for (const dto of element.props.initial.saved) eq(Object.keys(dto).sort(), ['createdAt', 'folder', 'id', 'name', 'query', 'sort'], 'no workspaceId, no createdBy')
})

await check('page: the four loads run together, not one after another', async () => {
	resetPageWorld()
	const open = {}
	const deferred = (name, value) => () => new Promise((resolve) => (open[name] = () => resolve(value)))
	pageWorld.searchAssets = deferred('search', searchResponse(many(1), { total: 1 }))
	pageWorld.getFoldersResponse = deferred('folders', foldersResponse())
	pageWorld.getTaggingStatus = deferred('tagging', TAGGING_ON)
	pageWorld.savedDocs = deferred('saved', [])
	const rendered = renderPage()
	await flush()
	eq(pageWorld.calls.slice().sort(), ['folders', 'membership', 'saved', 'search', 'tagging'], 'all four started before any finished')
	eq(Object.keys(open).sort(), ['folders', 'saved', 'search', 'tagging'])
	for (const name of ['tagging', 'saved', 'folders', 'search']) open[name]()
	const element = await rendered
	eq(element.props.initial.search.total, 1)
})

await check('page: a failing saved-search or tagging load degrades to an empty value and the page still renders; the failure is logged, not shown', async () => {
	const off = { configured: false, model: null, pending: 0, running: 0, failed: 0, skipped: 0, untagged: 0, budgetExhausted: false, resetsAt: null }
	for (const [name, setUp, expectSaved, expectTagging] of [
		['saved rejects', () => (pageWorld.savedDocs = async () => Promise.reject(new Error('mongo down'))), [], TAGGING_ON],
		['saved throws at once', () => (pageWorld.savedThrows = new Error('no db handle')), [], TAGGING_ON],
		['saved yields junk', () => (pageWorld.savedDocs = async () => [null]), [], TAGGING_ON],
		['tagging rejects', () => (pageWorld.getTaggingStatus = async () => Promise.reject(new Error('count failed'))), null, off],
		['tagging throws at once', () => (pageWorld.getTaggingStatus = () => { throw new Error('sync boom') }), null, off],
		['both', () => { pageWorld.savedDocs = async () => Promise.reject(new Error('a')); pageWorld.getTaggingStatus = async () => Promise.reject(new Error('b')) }, [], off],
	]) {
		resetPageWorld()
		setUp()
		const { result: element, logs } = await withConsoleCaptured(() => renderPage())
		assert(element.type === MediaLibraryStub, name)
		eq(element.props.initial.saved, expectSaved ?? [], name)
		eq(element.props.initial.tagging, expectTagging, name)
		assert(logs.length >= 1 && logs.every((line) => line.includes('[media]')), `${name}: logged ${JSON.stringify(logs)}`)
		eq(element.props.initial.search.total, 3, `${name}: the essential loads are untouched`)
		eq(element.props.can, { write: true, delete: true })
	}
	// "Tagging off, nothing waiting" means nothing starts polling.
	resetPageWorld()
	pageWorld.getTaggingStatus = async () => Promise.reject(new Error('x'))
	const { result } = await withConsoleCaptured(() => renderPage())
	eq([result.props.initial.tagging.configured, result.props.initial.tagging.pending], [false, 0])
})

await check('page: a failing search or folders load is NOT swallowed (those are the page), and nothing is left unhandled', async () => {
	resetPageWorld()
	pageWorld.searchAssets = async () => Promise.reject(new Error('search failed'))
	pageWorld.getFoldersResponse = async () => Promise.reject(new Error('folders failed too'))
	const error = await rejects(renderPage(), (e) => /failed/.test(e.message))
	assert(/search failed|folders failed too/.test(error.message))
	await flush()
	resetPageWorld()
	pageWorld.getFoldersResponse = async () => Promise.reject(new Error('folders failed'))
	await rejects(renderPage(), (e) => e.message === 'folders failed')
	resetPageWorld()
	pageWorld.searchAssets = async () => Promise.reject(new Error('search failed'))
	await rejects(renderPage(), (e) => e.message === 'search failed')
	await flush()
})

/* ========================================================================== */
/* account-shell.tsx                                                          */
/* ========================================================================== */

const shellPassthrough = (tag) => ({ children, className }) => h(tag, { className }, children)
mock('@/components/ui/sidebar', {
	Sidebar: shellPassthrough('aside'),
	SidebarContent: shellPassthrough('div'),
	SidebarFooter: shellPassthrough('div'),
	SidebarHeader: shellPassthrough('div'),
	SidebarInset: ({ children, className }) => h('main', { className, 'data-slot': 'inset' }, children),
	SidebarProvider: ({ children }) => h('div', { 'data-slot': 'provider' }, children),
	SidebarRail: () => null,
	SidebarTrigger: () => null,
	useSidebar: () => ({ setOpenMobile() {} }),
})
mock('@/components/nav-user', { NavUser: () => null })
mock('@/components/team-switcher', { TeamSwitcher: () => null })
mock('./account-nav', { AccountNav: () => null })
const shell = loadTs('src/app/account/account-shell.tsx')
const shellProps = {
	items: [],
	accountName: 'Acme',
	accounts: [],
	currentAccountId: WS,
	email: 'a@b.c',
	userName: 'A',
	userImage: null,
	children: h('p', { id: 'page-body' }, 'the page'),
}
const containerClassAt = (pathname) => {
	currentPathname = pathname
	const root = parseHtml(renderToString(h(shell.AccountShell, shellProps)))
	const main = findAllNodes(root, (n) => n.tag === 'main')[0]
	const container = main.children.find((c) => c.tag === 'div')
	assert(findAllNodes(container, (n) => n.attrs.id === 'page-body').length === 1, `the page is inside the container at ${pathname}`)
	return container.attrs.class
}

await check('account shell: /account/media and everything under it gets the wide container; every other page keeps the reading column exactly as before', () => {
	const original = 'mx-auto w-full max-w-6xl px-6 py-10 lg:px-10'
	for (const path of ['/account/media', '/account/media/', '/account/media/anything', '/account/media/a/b']) {
		const cls = containerClassAt(path)
		assert(cls.includes('max-w-none') && !cls.includes('max-w-6xl'), `${path}: ${cls}`)
		assert(cls.includes('px-4') && cls.includes('lg:px-6') && cls.includes('py-6'), `${path}: tighter padding, ${cls}`)
		assert(!cls.includes('px-6 py-10') && !cls.includes('lg:px-10'), `${path}: the loose padding is gone, ${cls}`)
		assert(cls.includes('mx-auto') && cls.includes('w-full'))
	}
	for (const path of ['/account', '/account/projects', '/account/projects/abc/media', '/account/team', '/account/settings', '/account/profile', '/account/medias', '/account/media-kit', '/account/mediafoo/x', '/media', '/', '/account/MEDIA']) {
		eq(containerClassAt(path), original, `${path} is unchanged`)
	}
	currentPathname = '/account/media'
	for (const odd of [null, undefined, '']) {
		currentPathname = odd
		eq(shell.isWidePath(odd), false)
	}
	eq(shell.isWidePath('/account/media'), true)
	eq(shell.isWidePath('/account/media/x'), true)
	eq(shell.isWidePath(42), false, 'not a string: not wide, and no throw')
	currentPathname = '/account/media'
})

/* @@PART16@@ */

finished = true
console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed === 0 && consoleProblems.length === 0 ? 0 : 1)
