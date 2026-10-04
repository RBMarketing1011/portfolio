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
mock('next/navigation', {
	notFound() {
		const error = new Error('NEXT_NOT_FOUND')
		error.digest = 'NEXT_NOT_FOUND'
		throw error
	},
	usePathname: () => currentPathname,
	useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
	useSearchParams: () => new URLSearchParams(),
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
		{ q: 'a&b=c#d+e%20f' }, { q: 'ünïcödé 日本 😀' }, { q: 'x', folder: f, deep: true },
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
	for (const label of ['', '   ', '!!!', '\u0000\u0001', '​​', '---']) {
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
			for (;;) {
				const due = [...timers.values()]
					.filter((timer) => timer.at <= end)
					.sort((a, b) => a.at - b.at || a.id - b.id)[0]
				if (!due) break
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

function setup({ initial = baseInitial(), search = '', can = { write: true, delete: true }, handlers = {}, mount = true, searchHandler = manual() } = {}) {
	const clock = createClock()
	const env = createEnv(clock, { search })
	const api = fakeApi({ search: searchHandler, ...handlers })
	const t = { clock, env, api, search: searchHandler, can }
	t.controller = lib.createLibraryController({ initial, can: () => t.can, api, env })
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

/* @@PART10@@ */

finished = true
console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed === 0 && consoleProblems.length === 0 ? 0 : 1)
