/**
 * Proves the first half of the media API (search, register, upload token, asset,
 * bulk, process, suggest) at handler level: real route files and real contract
 * modules (schemas, http, access, dto), with the auth guards, Next, the Blob SDK
 * and every lib module the routes call replaced by recording stand-ins. No Next,
 * no network, no database.
 *
 *   node scripts/prove-media-routes-a.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadTs, mock, rootRequire, ROOT } = require('./lib/load-ts.cjs')
const { ObjectId } = rootRequire('mongodb')

/* -------------------------------------------------------------------------- */
/* State the mocks read, reset before every case                              */
/* -------------------------------------------------------------------------- */

const WS = new ObjectId().toString()
const OTHER_WS = new ObjectId().toString()
const USER = 'user-1'
const S = {}

const realConsoleError = console.error

class HttpError extends Error {
	constructor(status, message) {
		super(message)
		this.status = status
	}
}
const errorResponse = (error) =>
	error instanceof HttpError
		? Response.json({ error: error.message }, { status: error.status })
		: Response.json({ error: 'Something went wrong.' }, { status: 500 })

const fakeDb = {
	collection: (name) => ({
		aggregate: (pipeline) => {
			S.aggregates.push({ name, pipeline })
			return {
				toArray: async () => {
					if (S.dbThrows) throw new Error('mongodb://user:hunter2@db.internal exploded')
					return S.usage ? [S.usage] : []
				},
			}
		},
	}),
}

/** requirePermission stand-in: records what it was asked for, and is a member of WS only. */
async function requirePermission(permission, workspaceId) {
	S.permCalls.push({ permission, workspaceId })
	if (S.permImpl) return S.permImpl(permission, workspaceId)
	if (workspaceId !== WS) throw new HttpError(404, 'Account not found.')
	return { db: fakeDb, userId: USER, workspace: { _id: new ObjectId(workspaceId) } }
}
mock('@/lib/auth/guards', { HttpError, errorResponse, requirePermission })

mock('next/server', {
	after: (fn) => {
		S.afterCalls.push(fn)
		if (S.afterThrows) throw new Error('after() called outside a request scope')
	},
})

mock('@vercel/blob/client', {
	handleUpload: async (opts) => {
		S.uploadCalls.push(opts)
		if (S.handleUploadThrows) throw new Error('Invalid callback signature (secret-detail)')
		const body = opts.body
		if (body.type === 'blob.generate-client-token') {
			const clientPayload =
				S.clientPayloadOverride !== undefined
					? S.clientPayloadOverride
					: body.payload.clientPayload
			S.tokenOptions = await opts.onBeforeGenerateToken(
				body.payload.pathname,
				clientPayload,
				false,
			)
			return { type: body.type, clientToken: 'client-token' }
		}
		if (body.type === 'blob.upload-completed') {
			if (opts.onUploadCompleted) await opts.onUploadCompleted(body.payload)
			return { type: body.type, response: 'ok' }
		}
		throw new Error('Invalid event type')
	},
})

mock('@/lib/mongo', {
	getDb: async () => {
		S.getDbCalls++
		if (S.getDbThrows) throw new Error('mongodb://user:hunter2@db.internal refused')
		return fakeDb
	},
})

const { buildFolderIndex } = loadTs('src/lib/media/folder-index.ts')
const { MediaError } = loadTs('src/lib/media/errors.ts')
const T = loadTs('src/lib/media/types.ts')
const { MEDIA_LIMITS, MEDIA_CONTENT_TYPES } = T

const makeDoc = (over = {}) => ({
	_id: new ObjectId(),
	workspaceId: new ObjectId(WS),
	folderId: null,
	name: 'Kitchen',
	nameKey: 'kitchen',
	filename: 'kitchen.jpg',
	url: `https://abc.public.blob.vercel-storage.com/workspaces/${WS}/media/kitchen-x1.jpg`,
	pathname: `workspaces/${WS}/media/kitchen-x1.jpg`,
	contentType: 'image/jpeg',
	bytes: 1234,
	width: 800,
	height: 600,
	pixels: 480000,
	orientation: 'landscape',
	hasAlpha: false,
	animated: false,
	colors: [{ hex: '#ffffff', name: 'white', share: 1 }],
	colorNames: ['white'],
	brightness: 'light',
	saturation: 'muted',
	sha256: 'ab'.repeat(32),
	blur: null,
	tags: [{ slug: 'kitchen', label: 'Kitchen', source: 'manual' }],
	rejectedTags: ['rejected-slug'],
	caption: '',
	altText: '',
	captionEdited: false,
	textInImage: '',
	keywords: ['hidden-keyword'],
	kind: 'photo',
	notes: '',
	terms: ['kitchen', 'secret-term'],
	termsVersion: 1,
	rev: 3,
	tagging: {
		status: 'done',
		attempts: 1,
		leaseUntil: new Date(),
		error: 'stale error',
		model: 'm',
	},
	uploadedBy: 'user-9',
	createdAt: new Date('2026-01-02T03:04:05Z'),
	updatedAt: new Date('2026-01-03T03:04:05Z'),
	...over,
})

const FORBIDDEN_DTO_KEYS = [
	'terms',
	'termsVersion',
	'workspaceId',
	'uploadedBy',
	'rev',
	'rejectedTags',
	'keywords',
	'sha256',
	'pathname',
	'nameKey',
	'colorNames',
	'pixels',
	'captionEdited',
]

/** Recording stand-ins for every lib module the routes call. */
const spies = {}
function lib(request, defs) {
	const exports = {}
	for (const [name, fallback] of Object.entries(defs)) {
		spies[name] = true
		exports[name] = (...args) => {
			S.calls.push({ name, args })
			return (S.impl[name] ?? fallback)(...args)
		}
	}
	mock(request, exports)
}
const idsOf = (n) => Array.from({ length: n }, () => new ObjectId())

lib('@/lib/media/assets', {
	registerUploadedBlob: async () => ({ status: 'created', doc: makeDoc() }),
	getAsset: async (_db, _ws, id) => makeDoc({ _id: id }),
	updateAsset: async (_db, _ws, id) => makeDoc({ _id: id }),
	deleteAssets: async (_db, _ws, ids) => ids.length,
	moveAssets: async (_db, _ws, ids) => ids.length,
	addTagsToAssets: async (_db, _ws, ids) => ({ changed: ids.length, conflicts: 0 }),
	removeTagsFromAssets: async (_db, _ws, ids) => ({ changed: ids.length, conflicts: 0 }),
	acceptAutoTags: async (_db, _ws, ids) => ({ changed: ids.length, conflicts: 0 }),
})
lib('@/lib/media/folders', {
	loadFolderIndex: async () => S.folderIndex ?? buildFolderIndex([]),
})
lib('@/lib/media/process', {
	runTagging: async () => ({ processed: [], remaining: 0, budgetExhausted: false }),
	getTaggingStatus: async () => ({
		configured: true,
		model: 'claude-opus-5-5',
		pending: 2,
		running: 1,
		failed: 0,
		skipped: 0,
		untagged: 4,
		budgetExhausted: false,
		resetsAt: null,
	}),
	queueTagging: async (_db, _ws, ids) => ids.length,
	requeueUntagged: async () => 0,
})
lib('@/lib/media/search', {
	searchAssets: async () => ({
		assets: [],
		total: 0,
		offset: 0,
		limit: 60,
		hasMore: false,
		truncated: false,
		sort: 'newest',
		query: { chips: [], warnings: [], sort: null, hasText: false },
		corrections: [],
		dropped: [],
		facets: null,
		pending: 0,
	}),
	resolveSearchIds: async () => {
		const ids = idsOf(2)
		return { ids, total: 2, overflow: false }
	},
})
lib('@/lib/media/suggest', { suggest: async () => [] })
lib('@/lib/media/tagger', { isTaggingConfigured: () => S.configured })
lib('@/lib/media/storage', {
	isOwnedPathname: (pathname, workspaceId) =>
		typeof pathname === 'string' &&
		pathname.startsWith(`workspaces/${workspaceId}/media/`) &&
		!pathname.includes('..') &&
		pathname.length > `workspaces/${workspaceId}/media/`.length,
})

function reset() {
	S.permCalls = []
	S.permImpl = null
	S.calls = []
	S.impl = {}
	S.afterCalls = []
	S.afterThrows = false
	S.configured = true
	S.uploadCalls = []
	S.handleUploadThrows = false
	S.clientPayloadOverride = undefined
	S.tokenOptions = null
	S.aggregates = []
	S.usage = null
	S.dbThrows = false
	S.getDbCalls = 0
	S.getDbThrows = false
	S.errors = []
	S.folderIndex = null
	console.error = (...args) => S.errors.push(args)
}
reset()

const callsOf = (name) => S.calls.filter((c) => c.name === name)
const count = (name) => callsOf(name).length
const WRITES = [
	'moveAssets',
	'addTagsToAssets',
	'removeTagsFromAssets',
	'acceptAutoTags',
	'deleteAssets',
	'queueTagging',
]
const writesMade = () => WRITES.filter((name) => count(name) > 0)

/* -------------------------------------------------------------------------- */
/* The routes under test                                                      */
/* -------------------------------------------------------------------------- */

const R = {
	root: loadTs('src/app/api/account/media/route.ts'),
	upload: loadTs('src/app/api/account/media/upload/route.ts'),
	id: loadTs('src/app/api/account/media/[id]/route.ts'),
	bulk: loadTs('src/app/api/account/media/bulk/route.ts'),
	process: loadTs('src/app/api/account/media/process/route.ts'),
	suggest: loadTs('src/app/api/account/media/suggest/route.ts'),
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
async function test(name, fn) {
	reset()
	try {
		await fn()
		console.log(`PASS  ${name}`)
		passed++
	} catch (error) {
		console.log(`FAIL  ${name} (${String(error?.message ?? error).split('\n')[0]})`)
		failed++
	}
}

const BASE = 'http://localhost/api/account/media'
function mk(path, { method = 'GET', body, raw, headers = {}, ws = WS } = {}) {
	const h = new Headers(headers)
	if (ws !== null) h.set('x-media-workspace', ws)
	let payload
	if (raw !== undefined) payload = raw
	else if (body !== undefined) {
		payload = JSON.stringify(body)
		h.set('content-type', 'application/json')
	}
	return new Request(`${BASE}${path}`, { method, headers: h, body: payload })
}

async function run(handler, request, id) {
	const response = await (id === undefined
		? handler(request)
		: handler(request, { params: Promise.resolve({ id }) }))
	const text = await response.text()
	let body = null
	try {
		body = JSON.parse(text)
	} catch {
		// not JSON
	}
	return { status: response.status, body, text, headers: response.headers }
}

const VALID_ID = new ObjectId().toString()
const registerBody = (over = {}) => ({
	url: `https://abc.public.blob.vercel-storage.com/workspaces/${WS}/media/a-x1.jpg`,
	pathname: `workspaces/${WS}/media/a-x1.jpg`,
	filename: 'a.jpg',
	...over,
})
const bulkIds = (over = {}) => ({ action: 'addTags', target: { ids: [VALID_ID] }, tags: ['kitchen'], ...over })
const SEARCH_TARGET = (over = {}) => ({ search: { q: 'tag:kitchen', expect: 2, ...over } })

const assertNoLeak = (asset) => {
	for (const key of FORBIDDEN_DTO_KEYS)
		assert.ok(!(key in asset), `DTO leaks ${key}`)
	assert.ok(!('leaseUntil' in asset.tagging), 'DTO leaks leaseUntil')
	assert.ok(!('attempts' in asset.tagging), 'DTO leaks attempts')
}
const personReadable = (message) => {
	assert.equal(typeof message, 'string')
	assert.ok(message.length > 0 && message.length < 200, `message length ${message?.length}`)
	// zod v4's own wording for a missing field ("expected string, received undefined")
	// is terse but safe; making it friendlier is a contract request (schemas.ts / http.ts).
	assert.ok(!/ZodError|\n\s+at |\[object/.test(message), `message: ${message}`)
}

/* -------------------------------------------------------------------------- */
/* Static facts about the route files                                         */
/* -------------------------------------------------------------------------- */

const FILES = {
	root: 'src/app/api/account/media/route.ts',
	upload: 'src/app/api/account/media/upload/route.ts',
	id: 'src/app/api/account/media/[id]/route.ts',
	bulk: 'src/app/api/account/media/bulk/route.ts',
	process: 'src/app/api/account/media/process/route.ts',
	suggest: 'src/app/api/account/media/suggest/route.ts',
}

for (const [key, mod] of Object.entries(R)) {
	await test(`${key}: exports runtime nodejs and dynamic force-dynamic`, () => {
		assert.equal(mod.runtime, 'nodejs')
		assert.equal(mod.dynamic, 'force-dynamic')
	})
}
for (const key of ['root', 'bulk', 'upload', 'process']) {
	await test(`${key}: exports maxDuration = 60`, () => {
		assert.equal(R[key].maxDuration, 60)
	})
}
await test('handlers exported per the table', () => {
	assert.deepEqual(['GET', 'POST'].map((m) => typeof R.root[m]), ['function', 'function'])
	assert.equal(typeof R.upload.POST, 'function')
	assert.deepEqual(['GET', 'PATCH', 'DELETE'].map((m) => typeof R.id[m]), ['function', 'function', 'function'])
	assert.equal(typeof R.bulk.POST, 'function')
	assert.deepEqual(['GET', 'POST'].map((m) => typeof R.process[m]), ['function', 'function'])
	assert.equal(typeof R.suggest.GET, 'function')
})
await test('invariants: no blob deletion, no bare asset writes in route sources', () => {
	for (const [key, file] of Object.entries(FILES)) {
		const source = readFileSync(`${ROOT}/${file}`, 'utf8')
		assert.ok(!/\bdel\s*\(/.test(source), `${key}: calls del()`)
		assert.ok(!/deleteBlob/.test(source), `${key}: calls deleteBlob`)
		assert.ok(!/\.(updateOne|updateMany|deleteOne|deleteMany|insertOne|findOneAndUpdate)\s*\(/.test(source), `${key}: bare collection write`)
		assert.ok(!/from '@vercel\/blob'/.test(source), `${key}: imports the server blob SDK`)
		assert.ok(!/cookies\(\)|rb\.workspace/.test(source), `${key}: reads the cookie`)
	}
})

/* -------------------------------------------------------------------------- */
/* Every route: the account is demanded, permissions are exact, errors are safe */
/* -------------------------------------------------------------------------- */

const idRoute = (name, handler, method, perm, explode, body) => ({
	name,
	perm,
	explode,
	handler,
	build: (o = {}) => mk(`/${VALID_ID}`, { method, body, ...o }),
	id: VALID_ID,
})

const MATRIX = [
	{
		name: 'GET /',
		perm: 'projects.view',
		explode: 'searchAssets',
		handler: R.root.GET,
		build: (o) => mk('?q=kitchen', o),
	},
	{
		name: 'POST /',
		perm: 'media.upload',
		explode: 'registerUploadedBlob',
		handler: R.root.POST,
		build: (o) => mk('', { method: 'POST', body: registerBody(), ...o }),
	},
	idRoute('GET /[id]', R.id.GET, 'GET', 'projects.view', 'getAsset'),
	idRoute('PATCH /[id]', R.id.PATCH, 'PATCH', 'media.upload', 'updateAsset', { name: 'New' }),
	idRoute('DELETE /[id]', R.id.DELETE, 'DELETE', 'media.delete', 'deleteAssets'),
	{
		name: 'POST /bulk (addTags)',
		perm: 'media.upload',
		explode: 'addTagsToAssets',
		handler: R.bulk.POST,
		build: (o) => mk('/bulk', { method: 'POST', body: bulkIds(), ...o }),
	},
	{
		name: 'POST /bulk (delete)',
		perm: 'media.delete',
		explode: 'deleteAssets',
		handler: R.bulk.POST,
		build: (o) => mk('/bulk', { method: 'POST', body: { action: 'delete', target: { ids: [VALID_ID] } }, ...o }),
	},
	{
		name: 'GET /process',
		perm: 'projects.view',
		explode: 'getTaggingStatus',
		handler: R.process.GET,
		build: (o) => mk('/process', o),
	},
	{
		name: 'POST /process',
		perm: 'media.upload',
		explode: 'runTagging',
		handler: R.process.POST,
		build: (o) => mk('/process', { method: 'POST', body: {}, ...o }),
	},
	{
		name: 'GET /suggest',
		perm: 'projects.view',
		explode: 'suggest',
		handler: R.suggest.GET,
		build: (o) => mk('/suggest?q=tag%3Aki', o),
	},
]

const BAD_HEADERS = [
	['missing', null],
	['empty', ''],
	['word', 'workspace'],
	['23 hex', 'a'.repeat(23)],
	['25 hex', 'a'.repeat(25)],
	['24 non-hex', 'g'.repeat(24)],
	['dash inside', `${WS.slice(0, 8)}-${WS.slice(9)}`],
	['injection', '{"$ne":null}'],
	['12 byte string', 'abcdefghijkl'],
]

for (const route of MATRIX) {
	await test(`${route.name}: success is 200/201 with no-store`, async () => {
		const r = await run(route.handler, route.build(), route.id)
		assert.ok(r.status === 200 || r.status === 201, `status ${r.status}: ${r.text}`)
		assert.equal(r.headers.get('cache-control'), 'no-store')
	})

	await test(`${route.name}: asks for ${route.perm} in the header's workspace`, async () => {
		await run(route.handler, route.build(), route.id)
		assert.equal(S.permCalls.length, 1, 'exactly one permission check')
		assert.deepEqual(S.permCalls[0], { permission: route.perm, workspaceId: WS })
	})

	await test(`${route.name}: missing or malformed workspace header is 400 and never reaches the guard`, async () => {
		for (const [label, value] of BAD_HEADERS) {
			reset()
			const r = await run(route.handler, route.build({ ws: value }), route.id)
			assert.equal(r.status, 400, `${label}: ${r.status}`)
			assert.equal(S.permCalls.length, 0, `${label}: guard reached`)
			assert.equal(S.calls.length, 0, `${label}: lib reached`)
			personReadable(r.body?.error)
		}
	})

	await test(`${route.name}: a workspace the caller is not in is 404`, async () => {
		const r = await run(route.handler, route.build({ ws: OTHER_WS }), route.id)
		assert.equal(r.status, 404)
		assert.equal(S.permCalls[0].workspaceId, OTHER_WS)
		assert.equal(S.calls.length, 0)
	})

	await test(`${route.name}: 401 and 403 from the guard propagate untouched`, async () => {
		S.permImpl = () => {
			throw new HttpError(401, 'Sign in to continue.')
		}
		let r = await run(route.handler, route.build(), route.id)
		assert.equal(r.status, 401)
		assert.equal(r.body.error, 'Sign in to continue.')
		S.permImpl = () => {
			throw new HttpError(403, 'Your role does not allow that.')
		}
		r = await run(route.handler, route.build(), route.id)
		assert.equal(r.status, 403)
		assert.equal(S.calls.length, 0, 'lib reached without permission')
	})

	await test(`${route.name}: an unexpected error is a bare 500 that leaks nothing`, async () => {
		S.impl[route.explode] = async () => {
			throw new Error('mongodb://admin:hunter2@db.internal:27017 ECONNRESET')
		}
		const r = await run(route.handler, route.build(), route.id)
		assert.equal(r.status, 500)
		assert.deepEqual(r.body, { error: 'Something went wrong.' })
		assert.ok(!/hunter2|mongodb|ECONN/.test(r.text))
	})

	await test(`${route.name}: a MediaError from the lib keeps its own status and message`, async () => {
		S.impl[route.explode] = async () => {
			throw new MediaError('Pick a smaller folder.', 429)
		}
		const r = await run(route.handler, route.build(), route.id)
		assert.equal(r.status, 429)
		assert.equal(r.body.error, 'Pick a smaller folder.')
	})
}

/* -------------------------------------------------------------------------- */
/* GET /                                                                      */
/* -------------------------------------------------------------------------- */

await test('GET /: reads the search params and returns searchAssets as is', async () => {
	const result = { assets: [], total: 7, marker: 'x' }
	S.impl.searchAssets = async () => result
	const r = await run(
		R.root.GET,
		mk('?q=kitchen%20tag%3Avan&folder=unfiled&deep=1&sort=oldest&offset=10&limit=30&facets=1'),
	)
	assert.equal(r.status, 200)
	assert.deepEqual(r.body, result)
	const [db, ctx, params] = callsOf('searchAssets')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ctx.workspaceId.toString(), WS)
	assert.equal(ctx.userId, USER)
	assert.deepEqual(params, {
		q: 'kitchen tag:van',
		folder: 'unfiled',
		deep: true,
		sort: 'oldest',
		offset: 10,
		limit: 30,
		facets: true,
	})
})
await test('GET /: hostile params degrade to defaults, never an error', async () => {
	const hostile = new URLSearchParams({
		q: 'a'.repeat(10_000),
		folder: '{"$ne":null}',
		deep: 'maybe',
		sort: '$where',
		offset: '-5',
		limit: '999999',
		facets: 'yes',
	})
	const r = await run(R.root.GET, mk(`?${hostile}`))
	assert.equal(r.status, 200)
	const params = callsOf('searchAssets')[0].args[2]
	assert.equal(params.q.length, MEDIA_LIMITS.queryMax)
	assert.equal(params.folder, undefined)
	assert.equal(params.deep, undefined)
	assert.equal(params.sort, undefined)
	assert.equal(params.offset, 0)
	assert.equal(params.limit, MEDIA_LIMITS.maxPageSize)
	assert.equal(params.facets, undefined)
})
await test('GET /: limit 0, negative and junk clamp to a valid page', async () => {
	for (const [raw, want] of [['0', 1], ['-3', 1], ['abc', MEDIA_LIMITS.pageSize], ['', MEDIA_LIMITS.pageSize]]) {
		reset()
		await run(R.root.GET, mk(`?limit=${raw}`))
		assert.equal(callsOf('searchAssets')[0].args[2].limit, want, raw)
	}
})
await test('GET /: no query at all searches with defaults', async () => {
	const r = await run(R.root.GET, mk(''))
	assert.equal(r.status, 200)
	const params = callsOf('searchAssets')[0].args[2]
	assert.equal(params.q, '')
	assert.equal(params.offset, 0)
	assert.equal(params.limit, MEDIA_LIMITS.pageSize)
})
await test('GET /: a body or a workspace id in the query string is ignored', async () => {
	await run(R.root.GET, mk(`?q=x&workspaceId=${OTHER_WS}&workspace=${OTHER_WS}`))
	assert.equal(callsOf('searchAssets')[0].args[1].workspaceId.toString(), WS)
	assert.deepEqual(S.permCalls.map((c) => c.workspaceId), [WS])
})

/* -------------------------------------------------------------------------- */
/* POST /                                                                     */
/* -------------------------------------------------------------------------- */

await test('POST /: created answers 201 with a DTO and registers under the caller', async () => {
	const doc = makeDoc({ name: 'Registered' })
	S.impl.registerUploadedBlob = async () => ({ status: 'created', doc })
	const r = await run(R.root.POST, mk('', { method: 'POST', body: registerBody() }))
	assert.equal(r.status, 201)
	assert.equal(r.body.status, 'created')
	assert.equal(r.body.asset.id, doc._id.toString())
	assert.equal(r.body.asset.name, 'Registered')
	assert.equal(r.body.asset.format, 'jpg')
	assert.equal(r.body.asset.createdAt, '2026-01-02T03:04:05.000Z')
	assertNoLeak(r.body.asset)
	const [db, ctx, input] = callsOf('registerUploadedBlob')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ctx.workspaceId.toString(), WS)
	assert.equal(ctx.userId, USER)
	assert.equal(input.pathname, registerBody().pathname)
	assert.equal(input.url, registerBody().url)
	assert.equal(input.filename, 'a.jpg')
	assert.equal(input.folderId, null)
})
await test('POST /: DTO carries the folder path from one folder index load', async () => {
	const folder = { _id: new ObjectId(), parentId: null, name: 'Clients' }
	const child = { _id: new ObjectId(), parentId: folder._id, name: 'Acme' }
	S.folderIndex = buildFolderIndex([folder, child])
	S.impl.registerUploadedBlob = async () => ({ status: 'created', doc: makeDoc({ folderId: child._id }) })
	const r = await run(R.root.POST, mk('', { method: 'POST', body: registerBody({ folderId: child._id.toString() }) }))
	assert.equal(r.body.asset.folderPath, 'Clients/Acme')
	assert.equal(r.body.asset.folderId, child._id.toString())
	assert.equal(count('loadFolderIndex'), 1)
	assert.equal(callsOf('loadFolderIndex')[0].args[1].toString(), WS)
	assert.equal(callsOf('registerUploadedBlob')[0].args[2].folderId.toString(), child._id.toString())
})
await test('POST /: duplicate answers 200 and schedules nothing', async () => {
	S.impl.registerUploadedBlob = async () => ({ status: 'duplicate', doc: makeDoc() })
	const r = await run(R.root.POST, mk('', { method: 'POST', body: registerBody() }))
	assert.equal(r.status, 200)
	assert.equal(r.body.status, 'duplicate')
	assert.equal(S.afterCalls.length, 0)
	assert.equal(count('runTagging'), 0)
})
await test('POST /: a created asset schedules runTagging for just that id, off the response path', async () => {
	const doc = makeDoc()
	S.impl.registerUploadedBlob = async () => ({ status: 'created', doc })
	const r = await run(R.root.POST, mk('', { method: 'POST', body: registerBody() }))
	assert.equal(r.status, 201)
	assert.equal(S.afterCalls.length, 1)
	assert.equal(count('runTagging'), 0, 'tagging ran inside the response path')
	await S.afterCalls[0]()
	assert.equal(count('runTagging'), 1)
	const [db, ws, opts] = callsOf('runTagging')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ws.toString(), WS)
	assert.deepEqual(opts.ids.map(String), [doc._id.toString()])
	assert.equal(opts.limit, 1)
})
await test('POST /: not configured schedules nothing', async () => {
	S.configured = false
	const r = await run(R.root.POST, mk('', { method: 'POST', body: registerBody() }))
	assert.equal(r.status, 201)
	assert.equal(S.afterCalls.length, 0)
})
await test('POST /: a throwing after() does not turn a registration into a 500', async () => {
	S.afterThrows = true
	const r = await run(R.root.POST, mk('', { method: 'POST', body: registerBody() }))
	assert.equal(r.status, 201)
	assert.equal(r.body.status, 'created')
	assert.equal(S.afterCalls.length, 1)
	assert.ok(S.errors.length >= 1, 'the failure was logged')
})
await test('POST /: a throwing isTaggingConfigured does not fail the registration', async () => {
	S.impl.isTaggingConfigured = () => {
		throw new Error('env exploded')
	}
	const r = await run(R.root.POST, mk('', { method: 'POST', body: registerBody() }))
	assert.equal(r.status, 201)
	assert.equal(S.afterCalls.length, 0)
})
await test('POST /: the scheduled task swallows the tagger failing', async () => {
	S.impl.runTagging = async () => {
		throw new Error('anthropic exploded sk-ant-secret')
	}
	await run(R.root.POST, mk('', { method: 'POST', body: registerBody() }))
	await assert.doesNotReject(S.afterCalls[0]())
	assert.ok(S.errors.length >= 1)
})
await test('POST /: body claims about workspace or user are ignored', async () => {
	await run(
		R.root.POST,
		mk('', { method: 'POST', body: { ...registerBody(), workspaceId: OTHER_WS, userId: 'attacker', uploadedBy: 'attacker' } }),
	)
	const ctx = callsOf('registerUploadedBlob')[0].args[1]
	assert.equal(ctx.workspaceId.toString(), WS)
	assert.equal(ctx.userId, USER)
	assert.deepEqual(Object.keys(callsOf('registerUploadedBlob')[0].args[2]).sort(), ['filename', 'folderId', 'pathname', 'url'])
})
await test('POST /: explicit null folder is the root; a hex folder becomes an ObjectId', async () => {
	await run(R.root.POST, mk('', { method: 'POST', body: registerBody({ folderId: null }) }))
	assert.equal(callsOf('registerUploadedBlob')[0].args[2].folderId, null)
	reset()
	const f = new ObjectId()
	await run(R.root.POST, mk('', { method: 'POST', body: registerBody({ folderId: f.toString() }) }))
	const got = callsOf('registerUploadedBlob')[0].args[2].folderId
	assert.ok(got instanceof ObjectId && got.equals(f))
})
await test('POST /: library errors map to their statuses (413, 415, 422, 429, 400)', async () => {
	for (const status of [400, 413, 415, 422, 429]) {
		S.impl.registerUploadedBlob = async () => {
			throw new MediaError(`failed ${status}`, status)
		}
		const r = await run(R.root.POST, mk('', { method: 'POST', body: registerBody() }))
		assert.equal(r.status, status)
		assert.equal(r.body.error, `failed ${status}`)
		assert.equal(S.afterCalls.length, 0)
	}
})
await test('POST /: invalid bodies are 400 with a readable message and register nothing', async () => {
	const cases = [
		['not json', { raw: '{nope' }],
		['empty body', { raw: '' }],
		['json null', { raw: 'null' }],
		['array', { body: [] }],
		['empty object', { body: {} }],
		['string', { body: 'x' }],
		['url not a url', { body: registerBody({ url: 'not a url' }) }],
		['url missing', { body: { pathname: 'a/b.png', filename: 'b.png' } }],
		['url too long', { body: registerBody({ url: `https://a.example/${'x'.repeat(2100)}` }) }],
		['pathname empty', { body: registerBody({ pathname: '' }) }],
		['pathname too long', { body: registerBody({ pathname: 'p'.repeat(501) }) }],
		['pathname number', { body: registerBody({ pathname: 5 }) }],
		['filename blank', { body: registerBody({ filename: '   ' }) }],
		['filename too long', { body: registerBody({ filename: 'f'.repeat(256) }) }],
		['folder not hex', { body: registerBody({ folderId: 'nope' }) }],
		['folder 12 chars', { body: registerBody({ folderId: 'abcdefghijkl' }) }],
		['folder object', { body: registerBody({ folderId: { $ne: null } }) }],
		['folder number', { body: registerBody({ folderId: 5 }) }],
	]
	for (const [label, o] of cases) {
		reset()
		const r = await run(R.root.POST, mk('', { method: 'POST', ...o }))
		assert.equal(r.status, 400, `${label}: ${r.status}`)
		personReadable(r.body?.error)
		assert.equal(count('registerUploadedBlob'), 0, `${label}: registered`)
		assert.equal(S.afterCalls.length, 0, `${label}: scheduled`)
	}
})
await test('POST /: authorisation comes before the body is looked at', async () => {
	S.permImpl = () => {
		throw new HttpError(403, 'Your role does not allow that.')
	}
	const r = await run(R.root.POST, mk('', { method: 'POST', raw: '{nope' }))
	assert.equal(r.status, 403)
})

/* -------------------------------------------------------------------------- */
/* POST /upload                                                               */
/* -------------------------------------------------------------------------- */

const REQUESTED = `workspaces/${WS}/media/Kitchen Remodel.JPG`
const genBody = (payload = {}) => ({
	type: 'blob.generate-client-token',
	payload: {
		pathname: REQUESTED,
		clientPayload: JSON.stringify({ workspaceId: WS, folderId: null }),
		multipart: false,
		...payload,
	},
})
const upReq = (body, o = {}) =>
	new Request(`${BASE}/upload`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(o.headers ?? {}) },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	})
const completedBody = (over = {}) => ({
	type: 'blob.upload-completed',
	payload: {
		blob: {
			url: `https://abc.public.blob.vercel-storage.com/workspaces/${WS}/media/Kitchen-x9.JPG`,
			pathname: `workspaces/${WS}/media/Kitchen-x9.JPG`,
			contentType: 'image/jpeg',
		},
		tokenPayload: JSON.stringify({ workspaceId: WS, userId: USER, folderId: null, filename: 'Kitchen.JPG' }),
		...over,
	},
})

await test('upload token: requires write for the workspace in clientPayload, not the header', async () => {
	const r = await run(R.upload.POST, upReq(genBody(), { headers: { 'x-media-workspace': OTHER_WS } }))
	assert.equal(r.status, 200)
	assert.deepEqual(r.body, { type: 'blob.generate-client-token', clientToken: 'client-token' })
	assert.deepEqual(S.permCalls, [{ permission: 'media.upload', workspaceId: WS }])
})
await test('upload token: works with no header at all (the Blob client cannot send one)', async () => {
	const r = await run(R.upload.POST, upReq(genBody()))
	assert.equal(r.status, 200)
	assert.equal(S.permCalls[0].workspaceId, WS)
})
await test('upload token: handleUpload gets the original body object and a completion callback', async () => {
	await run(R.upload.POST, upReq(genBody()))
	assert.equal(S.uploadCalls.length, 1)
	assert.equal(typeof S.uploadCalls[0].onUploadCompleted, 'function', 'without it the SDK embeds no callback')
	assert.equal(S.uploadCalls[0].body.type, 'blob.generate-client-token')
	assert.ok(S.uploadCalls[0].request instanceof Request)
})
await test('upload token: a missing or invalid clientPayload is 400 and never reaches the guard or the SDK', async () => {
	const bad = [
		['null payload', null],
		['not json', 'nope'],
		['json null', 'null'],
		['array', '[]'],
		['empty object', '{}'],
		['workspace not hex', JSON.stringify({ workspaceId: 'abc' })],
		['workspace object', JSON.stringify({ workspaceId: { $ne: 1 } })],
		['workspace 12 chars', JSON.stringify({ workspaceId: 'abcdefghijkl' })],
		['folder not hex', JSON.stringify({ workspaceId: WS, folderId: 'x' })],
		['folder number', JSON.stringify({ workspaceId: WS, folderId: 4 })],
	]
	for (const [label, clientPayload] of bad) {
		reset()
		const r = await run(R.upload.POST, upReq(genBody({ clientPayload })))
		assert.equal(r.status, 400, `${label}: ${r.status}`)
		personReadable(r.body?.error)
		assert.equal(S.permCalls.length, 0, `${label}: guard reached`)
		assert.equal(S.uploadCalls.length, 0, `${label}: SDK reached`)
	}
	reset()
	const noPayload = await run(R.upload.POST, upReq({ type: 'blob.generate-client-token' }))
	assert.equal(noPayload.status, 400)
	assert.equal(S.permCalls.length, 0)
})
await test('upload: unreadable or unknown bodies are 400 and touch nothing', async () => {
	const bad = ['{nope', '', 'null', '[]', '"x"', '{}', '{"type":5}', '{"type":"blob.generate-presigned-url","payload":{}}', '{"type":"anything"}']
	for (const raw of bad) {
		reset()
		const r = await run(R.upload.POST, upReq(raw))
		assert.equal(r.status, 400, `${raw}: ${r.status}`)
		assert.equal(S.permCalls.length, 0)
		assert.equal(S.uploadCalls.length, 0)
	}
})
await test('upload token: non-member 404, 401 and 403 propagate, SDK never reached', async () => {
	let r = await run(R.upload.POST, upReq(genBody({ clientPayload: JSON.stringify({ workspaceId: OTHER_WS }) })))
	assert.equal(r.status, 404)
	assert.equal(S.permCalls[0].workspaceId, OTHER_WS)
	for (const status of [401, 403]) {
		reset()
		S.permImpl = () => {
			throw new HttpError(status, `denied ${status}`)
		}
		r = await run(R.upload.POST, upReq(genBody()))
		assert.equal(r.status, status)
		assert.equal(S.uploadCalls.length, 0)
	}
})
await test('upload token: returns the documented options with a mutable content-type array', async () => {
	const r = await run(R.upload.POST, upReq(genBody()))
	assert.equal(r.status, 200)
	const o = S.tokenOptions
	assert.deepEqual(o.allowedContentTypes, [...MEDIA_CONTENT_TYPES])
	assert.notEqual(o.allowedContentTypes, MEDIA_CONTENT_TYPES, 'the shared const was handed out')
	assert.ok(!Object.isFrozen(o.allowedContentTypes))
	o.allowedContentTypes.push('image/x')
	assert.equal(MEDIA_CONTENT_TYPES.length, 5, 'mutating the option changed the shared const')
	assert.equal(o.maximumSizeInBytes, MEDIA_LIMITS.maxBytes)
	assert.equal(o.addRandomSuffix, true)
	assert.deepEqual(Object.keys(o).sort(), ['addRandomSuffix', 'allowedContentTypes', 'maximumSizeInBytes', 'tokenPayload'])
})
await test('upload token: tokenPayload pins workspace and user from the membership, filename from the REQUESTED pathname', async () => {
	await run(R.upload.POST, upReq(genBody()))
	assert.deepEqual(JSON.parse(S.tokenOptions.tokenPayload), {
		workspaceId: WS,
		userId: USER,
		folderId: null,
		filename: 'Kitchen Remodel.JPG',
	})
	reset()
	const folder = new ObjectId().toString()
	await run(
		R.upload.POST,
		upReq(genBody({ pathname: `workspaces/${WS}/media/deep/er/photo.png`, clientPayload: JSON.stringify({ workspaceId: WS, folderId: folder }) })),
	)
	assert.deepEqual(JSON.parse(S.tokenOptions.tokenPayload), { workspaceId: WS, userId: USER, folderId: folder, filename: 'photo.png' })
})
await test('upload token: a client-supplied userId or extra payload keys never reach the token', async () => {
	await run(
		R.upload.POST,
		upReq(genBody({ clientPayload: JSON.stringify({ workspaceId: WS, userId: 'attacker', filename: 'evil.png', extra: 1 }) })),
	)
	const payload = JSON.parse(S.tokenOptions.tokenPayload)
	assert.equal(payload.userId, USER)
	assert.equal(payload.filename, 'Kitchen Remodel.JPG')
	assert.deepEqual(Object.keys(payload).sort(), ['filename', 'folderId', 'userId', 'workspaceId'])
})
await test('upload token: onBeforeGenerateToken rejects a pathname outside the workspace prefix', async () => {
	const outside = [
		`workspaces/${OTHER_WS}/media/x.png`,
		'sites/abc123/hero.png',
		`workspaces/${WS}/media/../../${OTHER_WS}/media/x.png`,
		`workspaces/${WS}/media/`,
		'x.png',
		'',
		`/workspaces/${WS}/media/x.png`,
	]
	for (const pathname of outside) {
		reset()
		const r = await run(R.upload.POST, upReq(genBody({ pathname })))
		assert.equal(r.status, 400, `${pathname}: ${r.status}`)
		personReadable(r.body?.error)
		assert.equal(S.tokenOptions, null, `${pathname}: token options produced`)
	}
})
await test('upload token: a clientPayload that differs from the authorised one is refused', async () => {
	S.clientPayloadOverride = JSON.stringify({ workspaceId: OTHER_WS })
	const r = await run(R.upload.POST, upReq(genBody()))
	assert.equal(r.status, 400)
	assert.equal(S.tokenOptions, null)
	reset()
	S.clientPayloadOverride = null
	assert.equal((await run(R.upload.POST, upReq(genBody()))).status, 400)
})
await test('upload token: the asset-count cap is enforced and scoped to the workspace', async () => {
	S.usage = { count: MEDIA_LIMITS.maxAssets, bytes: 10 }
	let r = await run(R.upload.POST, upReq(genBody()))
	assert.equal(r.status, 429)
	personReadable(r.body.error)
	assert.equal(S.tokenOptions, null)
	assert.equal(S.aggregates.length, 1)
	assert.equal(S.aggregates[0].name, 'mediaAssets')
	assert.equal(S.aggregates[0].pipeline[0].$match.workspaceId.toString(), WS)
	reset()
	S.usage = { count: MEDIA_LIMITS.maxAssets - 1, bytes: 10 }
	r = await run(R.upload.POST, upReq(genBody()))
	assert.equal(r.status, 200)
	assert.ok(S.tokenOptions)
})
await test('upload token: the total-bytes cap is enforced', async () => {
	S.usage = { count: 3, bytes: MEDIA_LIMITS.maxTotalBytes }
	let r = await run(R.upload.POST, upReq(genBody()))
	assert.equal(r.status, 429)
	assert.equal(S.tokenOptions, null)
	reset()
	S.usage = { count: 3, bytes: MEDIA_LIMITS.maxTotalBytes + 1 }
	assert.equal((await run(R.upload.POST, upReq(genBody()))).status, 429)
	reset()
	S.usage = { count: 3, bytes: MEDIA_LIMITS.maxTotalBytes - 1 }
	assert.equal((await run(R.upload.POST, upReq(genBody()))).status, 200)
})
await test('upload token: an empty library (no aggregate row) is under every cap', async () => {
	S.usage = null
	assert.equal((await run(R.upload.POST, upReq(genBody()))).status, 200)
})
await test('upload token: a database failure while counting is a bare 500', async () => {
	S.dbThrows = true
	const r = await run(R.upload.POST, upReq(genBody()))
	assert.equal(r.status, 500)
	assert.deepEqual(r.body, { error: 'Something went wrong.' })
	assert.ok(!/hunter2/.test(r.text))
})
await test('upload token: an SDK failure (missing blob token) is a bare 500', async () => {
	S.handleUploadThrows = true
	const r = await run(R.upload.POST, upReq(genBody()))
	assert.equal(r.status, 500)
	assert.ok(!/secret-detail/.test(r.text))
})
await test('upload completion: does NOT call the guard, registers from the tokenPayload', async () => {
	const r = await run(R.upload.POST, upReq(completedBody()))
	assert.equal(r.status, 200)
	assert.deepEqual(r.body, { type: 'blob.upload-completed', response: 'ok' })
	assert.equal(S.permCalls.length, 0, 'requirePermission called for a webhook')
	assert.equal(count('registerUploadedBlob'), 1)
	const [db, ctx, input] = callsOf('registerUploadedBlob')[0].args
	assert.equal(db, fakeDb)
	assert.ok(ctx.workspaceId instanceof ObjectId)
	assert.equal(ctx.workspaceId.toString(), WS)
	assert.equal(ctx.userId, USER)
	assert.equal(input.pathname, `workspaces/${WS}/media/Kitchen-x9.JPG`)
	assert.equal(input.url, completedBody().payload.blob.url)
	assert.equal(input.filename, 'Kitchen.JPG')
	assert.equal(input.folderId, null)
})
await test('upload completion: a header or cookie-ish hint cannot redirect it to another workspace', async () => {
	await run(R.upload.POST, upReq(completedBody(), { headers: { 'x-media-workspace': OTHER_WS } }))
	assert.equal(S.permCalls.length, 0)
	assert.equal(callsOf('registerUploadedBlob')[0].args[1].workspaceId.toString(), WS)
})
await test('upload completion: folder from the token becomes an ObjectId', async () => {
	const folder = new ObjectId()
	await run(
		R.upload.POST,
		upReq(completedBody({ tokenPayload: JSON.stringify({ workspaceId: WS, userId: USER, folderId: folder.toString(), filename: 'a.png' }) })),
	)
	const got = callsOf('registerUploadedBlob')[0].args[2].folderId
	assert.ok(got instanceof ObjectId && got.equals(folder))
})
await test('upload completion: running twice registers twice with identical arguments and never errors (idempotency is the lib\'s)', async () => {
	const doc = makeDoc()
	S.impl.registerUploadedBlob = async () => ({ status: 'created', doc })
	const a = await run(R.upload.POST, upReq(completedBody()))
	const b = await run(R.upload.POST, upReq(completedBody()))
	assert.equal(a.status, 200)
	assert.equal(b.status, 200)
	const [first, second] = callsOf('registerUploadedBlob')
	assert.equal(first.args[2].pathname, second.args[2].pathname)
	assert.equal(first.args[1].workspaceId.toString(), second.args[1].workspaceId.toString())
})
await test('upload completion: a failing registration is logged and swallowed (200, no Vercel retry)', async () => {
	S.impl.registerUploadedBlob = async () => {
		throw new Error('E11000 duplicate key mongodb://u:hunter2@h')
	}
	let r = await run(R.upload.POST, upReq(completedBody()))
	assert.equal(r.status, 200)
	assert.deepEqual(r.body, { type: 'blob.upload-completed', response: 'ok' })
	assert.ok(S.errors.length >= 1)
	assert.ok(!/hunter2/.test(r.text))
	reset()
	S.impl.registerUploadedBlob = async () => {
		throw new MediaError('Too large', 413)
	}
	r = await run(R.upload.POST, upReq(completedBody()))
	assert.equal(r.status, 200, 'a MediaError must not make the webhook fail either')
	reset()
	S.getDbThrows = true
	r = await run(R.upload.POST, upReq(completedBody()))
	assert.equal(r.status, 200)
	assert.equal(count('registerUploadedBlob'), 0)
})
await test('upload completion: unusable token payloads are swallowed and register nothing', async () => {
	const bad = [
		undefined,
		null,
		'',
		'not json',
		'null',
		'[]',
		'{}',
		JSON.stringify({ workspaceId: 'zzz', userId: USER, filename: 'a.png' }),
		JSON.stringify({ workspaceId: { $ne: 1 }, userId: USER, filename: 'a.png' }),
		JSON.stringify({ workspaceId: WS, filename: 'a.png' }),
		JSON.stringify({ workspaceId: WS, userId: USER }),
		JSON.stringify({ workspaceId: WS, userId: USER, filename: 'a.png', folderId: 'x' }),
		JSON.stringify({ workspaceId: WS, userId: USER, filename: 'f'.repeat(300) }),
	]
	for (const tokenPayload of bad) {
		reset()
		const r = await run(R.upload.POST, upReq(completedBody({ tokenPayload })))
		assert.equal(r.status, 200, `${tokenPayload}: ${r.status}`)
		assert.equal(count('registerUploadedBlob'), 0, `${tokenPayload}: registered`)
		assert.equal(S.permCalls.length, 0)
	}
})
await test('upload completion: a blob outside the tokenised workspace is not registered', async () => {
	const body = completedBody()
	body.payload.blob.pathname = `workspaces/${OTHER_WS}/media/x.png`
	const r = await run(R.upload.POST, upReq(body))
	assert.equal(r.status, 200)
	assert.equal(count('registerUploadedBlob'), 0)
})
await test('upload completion: a rejected signature is 400, never a 500 or a leak, and registers nothing', async () => {
	S.handleUploadThrows = true
	const r = await run(R.upload.POST, upReq(completedBody()))
	assert.equal(r.status, 400)
	assert.ok(!/secret-detail|signature/i.test(r.text))
	assert.equal(count('registerUploadedBlob'), 0)
	assert.equal(S.permCalls.length, 0)
})
await test('upload completion: never asks for a token', async () => {
	await run(R.upload.POST, upReq(completedBody()))
	assert.equal(S.tokenOptions, null)
})

/* -------------------------------------------------------------------------- */
/* /[id]                                                                      */
/* -------------------------------------------------------------------------- */

const BAD_IDS = [
	'nope',
	'123',
	'g'.repeat(24),
	'a'.repeat(23),
	'a'.repeat(25),
	'abcdefghijkl',
	'%00',
	'..',
	'{"$ne":1}',
	'a'.repeat(5000),
	' ' + 'a'.repeat(23),
]

for (const [label, handler, method, body] of [
	['GET', R.id.GET, 'GET'],
	['PATCH', R.id.PATCH, 'PATCH', { name: 'x' }],
	['DELETE', R.id.DELETE, 'DELETE'],
]) {
	await test(`${label} /[id]: a malformed id is 404 (never 403 or 400), and nothing is looked up`, async () => {
		for (const id of BAD_IDS) {
			reset()
			const r = await run(handler, mk('/x', { method, body }), id)
			assert.equal(r.status, 404, `${id.slice(0, 30)}: ${r.status}`)
			assert.equal(r.body.error, 'Image not found.')
			assert.equal(S.calls.length, 0)
		}
	})
}
await test('GET /[id]: returns {asset} for the id, looked up inside the workspace', async () => {
	const id = new ObjectId()
	const r = await run(R.id.GET, mk(`/${id}`), id.toString())
	assert.equal(r.status, 200)
	assert.deepEqual(Object.keys(r.body), ['asset'])
	assert.equal(r.body.asset.id, id.toString())
	assertNoLeak(r.body.asset)
	const [db, ws, got] = callsOf('getAsset')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ws.toString(), WS)
	assert.equal(got.toString(), id.toString())
})
await test('GET /[id]: an id that is absent or belongs to another workspace is 404', async () => {
	S.impl.getAsset = async () => null
	const r = await run(R.id.GET, mk(`/${VALID_ID}`), VALID_ID)
	assert.equal(r.status, 404)
	assert.equal(r.body.error, 'Image not found.')
})
await test('GET /[id]: an uppercase hex id is accepted', async () => {
	const r = await run(R.id.GET, mk(`/x`), VALID_ID.toUpperCase())
	assert.equal(r.status, 200)
})
await test('PATCH /[id]: applies the validated patch and returns {asset}', async () => {
	const id = new ObjectId()
	const f = new ObjectId().toString()
	const r = await run(
		R.id.PATCH,
		mk(`/${id}`, {
			method: 'PATCH',
			body: { name: '  Hero  ', caption: ' A caption ', altText: 'Alt', notes: 'n', folderId: f, addTags: [' Kitchen '], removeTags: ['old'] },
		}),
		id.toString(),
	)
	assert.equal(r.status, 200)
	assert.equal(r.body.asset.id, id.toString())
	const [db, ws, got, patch] = callsOf('updateAsset')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ws.toString(), WS)
	assert.equal(got.toString(), id.toString())
	assert.deepEqual(patch, { name: 'Hero', caption: 'A caption', altText: 'Alt', notes: 'n', folderId: f, addTags: ['Kitchen'], removeTags: ['old'] })
})
await test('PATCH /[id]: null folderId moves to the root; unknown keys never reach the lib', async () => {
	await run(
		R.id.PATCH,
		mk(`/${VALID_ID}`, { method: 'PATCH', body: { folderId: null, workspaceId: OTHER_WS, tags: [], terms: ['x'], rev: 99, uploadedBy: 'x', $set: { a: 1 } } }),
		VALID_ID,
	)
	const patch = callsOf('updateAsset')[0].args[3]
	assert.deepEqual(patch, { folderId: null })
})
await test('PATCH /[id]: an empty patch is accepted and passed through', async () => {
	const r = await run(R.id.PATCH, mk(`/${VALID_ID}`, { method: 'PATCH', body: {} }), VALID_ID)
	assert.equal(r.status, 200)
	assert.deepEqual(callsOf('updateAsset')[0].args[3], {})
})
await test('PATCH /[id]: invalid bodies are 400 with a readable message and write nothing', async () => {
	const cases = [
		['not json', { raw: '{bad' }],
		['empty', { raw: '' }],
		['null', { raw: 'null' }],
		['array', { body: [] }],
		['blank name', { body: { name: '   ' } }],
		['name too long', { body: { name: 'n'.repeat(MEDIA_LIMITS.nameMax + 1) } }],
		['caption too long', { body: { caption: 'c'.repeat(MEDIA_LIMITS.captionMax + 1) } }],
		['alt too long', { body: { altText: 'a'.repeat(MEDIA_LIMITS.altMax + 1) } }],
		['notes too long', { body: { notes: 'n'.repeat(MEDIA_LIMITS.notesMax + 1) } }],
		['folder bad', { body: { folderId: 'x' } }],
		['folder object', { body: { folderId: { $ne: null } } }],
		['too many tags', { body: { addTags: Array.from({ length: 21 }, (_, i) => `t${i}`) } }],
		['empty tag label', { body: { addTags: [''] } }],
		['tag label too long', { body: { addTags: ['t'.repeat(MEDIA_LIMITS.tagLabelMax + 1)] } }],
		['tags not array', { body: { addTags: 'kitchen' } }],
		['removeTags not strings', { body: { removeTags: [1] } }],
	]
	for (const [label, o] of cases) {
		reset()
		const r = await run(R.id.PATCH, mk(`/${VALID_ID}`, { method: 'PATCH', ...o }), VALID_ID)
		assert.equal(r.status, 400, `${label}: ${r.status}`)
		personReadable(r.body?.error)
		assert.equal(count('updateAsset'), 0, `${label}: wrote`)
	}
})
await test('PATCH /[id]: an unknown id (lib says 404) is 404; a bad folder (lib says 400) is 400', async () => {
	S.impl.updateAsset = async () => {
		throw new MediaError('Image not found.', 404)
	}
	let r = await run(R.id.PATCH, mk(`/${VALID_ID}`, { method: 'PATCH', body: { name: 'x' } }), VALID_ID)
	assert.equal(r.status, 404)
	S.impl.updateAsset = async () => {
		throw new MediaError('That folder does not exist.', 400)
	}
	r = await run(R.id.PATCH, mk(`/${VALID_ID}`, { method: 'PATCH', body: { folderId: VALID_ID } }), VALID_ID)
	assert.equal(r.status, 400)
	assert.equal(r.body.error, 'That folder does not exist.')
})
await test('PATCH /[id]: a bad id beats a bad body (404, not 400)', async () => {
	const r = await run(R.id.PATCH, mk('/x', { method: 'PATCH', raw: '{bad' }), 'nope')
	assert.equal(r.status, 404)
})
await test('DELETE /[id]: deletes exactly [id] in the workspace and answers {ok:true}', async () => {
	const id = new ObjectId()
	const r = await run(R.id.DELETE, mk(`/${id}`, { method: 'DELETE' }), id.toString())
	assert.equal(r.status, 200)
	assert.deepEqual(r.body, { ok: true })
	const [db, ws, ids] = callsOf('deleteAssets')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ws.toString(), WS)
	assert.deepEqual(ids.map(String), [id.toString()])
})
await test('DELETE /[id]: nothing removed (absent or foreign) is 404', async () => {
	S.impl.deleteAssets = async () => 0
	const r = await run(R.id.DELETE, mk(`/${VALID_ID}`, { method: 'DELETE' }), VALID_ID)
	assert.equal(r.status, 404)
	assert.equal(r.body.error, 'Image not found.')
})
await test('DELETE /[id]: write permission alone is not enough', async () => {
	S.permImpl = (permission) => {
		if (permission === 'media.delete') throw new HttpError(403, 'Your role does not allow that.')
		return { db: fakeDb, userId: USER, workspace: { _id: new ObjectId(WS) } }
	}
	const r = await run(R.id.DELETE, mk(`/${VALID_ID}`, { method: 'DELETE' }), VALID_ID)
	assert.equal(r.status, 403)
	assert.equal(count('deleteAssets'), 0)
})

/* -------------------------------------------------------------------------- */
/* POST /bulk                                                                 */
/* -------------------------------------------------------------------------- */

const bulk = (body, o = {}) => run(R.bulk.POST, mk('/bulk', { method: 'POST', body, ...o }))
const ACTIONS = [
	['move', { action: 'move', folderId: null }, 'media.upload', 'moveAssets'],
	['addTags', { action: 'addTags', tags: ['Kitchen'] }, 'media.upload', 'addTagsToAssets'],
	['removeTags', { action: 'removeTags', tags: ['kitchen'] }, 'media.upload', 'removeTagsFromAssets'],
	['acceptAutoTags', { action: 'acceptAutoTags' }, 'media.upload', 'acceptAutoTags'],
	['retag', { action: 'retag' }, 'media.upload', 'queueTagging'],
	['delete', { action: 'delete' }, 'media.delete', 'deleteAssets'],
]

for (const [action, base, perm, fn] of ACTIONS) {
	await test(`bulk ${action}: asks for ${perm} for the header's workspace, exactly once`, async () => {
		const r = await bulk({ ...base, target: { ids: [VALID_ID] } })
		assert.equal(r.status, 200, r.text)
		assert.deepEqual(S.permCalls, [{ permission: perm, workspaceId: WS }])
		assert.equal(count(fn), 1)
	})
	await test(`bulk ${action}: runs on an ids target scoped to the workspace`, async () => {
		const a = new ObjectId()
		const b = new ObjectId()
		await bulk({ ...base, target: { ids: [a.toString(), b.toString()] } })
		const args = callsOf(fn)[0].args
		assert.equal(args[0], fakeDb)
		assert.equal(args[1].toString(), WS)
		assert.deepEqual(args[2].map(String), [a.toString(), b.toString()])
		assert.ok(args[2].every((id) => id instanceof ObjectId))
		assert.equal(count('resolveSearchIds'), 0)
	})
	await test(`bulk ${action}: a search target is resolved ONCE and the action runs on exactly those ids`, async () => {
		const found = idsOf(3)
		S.impl.resolveSearchIds = async () => ({ ids: found, total: 3, overflow: false })
		const r = await bulk({ ...base, target: SEARCH_TARGET({ expect: 3, folder: 'unfiled', deep: false }) })
		assert.equal(r.status, 200, r.text)
		assert.equal(count('resolveSearchIds'), 1)
		const [db, ctx, params, cap] = callsOf('resolveSearchIds')[0].args
		assert.equal(db, fakeDb)
		assert.equal(ctx.workspaceId.toString(), WS)
		assert.equal(ctx.userId, USER)
		assert.deepEqual(params, { q: 'tag:kitchen', folder: 'unfiled', deep: false })
		assert.equal(cap, MEDIA_LIMITS.bulkSearchCap)
		assert.deepEqual(callsOf(fn)[0].args[2], found)
		assert.equal(count(fn), 1)
	})
	await test(`bulk ${action}: a changed total is 409 and NOTHING is written`, async () => {
		for (const [total, expect] of [[10, 9], [9, 10], [0, 1], [5000, 1]]) {
			reset()
			S.impl.resolveSearchIds = async () => ({ ids: idsOf(Math.min(total, 3)), total, overflow: false })
			const r = await bulk({ ...base, target: SEARCH_TARGET({ expect }) })
			assert.equal(r.status, 409, `${total}/${expect}: ${r.status}`)
			assert.match(r.body.error, /results changed/i)
			assert.deepEqual(writesMade(), [], `${total}/${expect}: wrote`)
			assert.equal(S.afterCalls.length, 0)
			assert.equal(count('resolveSearchIds'), 1)
		}
	})
	await test(`bulk ${action}: overflow is 409 and NOTHING is written, even when the totals agree`, async () => {
		S.impl.resolveSearchIds = async () => ({ ids: idsOf(2), total: 2, overflow: true })
		const r = await bulk({ ...base, target: SEARCH_TARGET({ expect: 2 }) })
		assert.equal(r.status, 409)
		assert.match(r.body.error, /too many matches/i)
		assert.deepEqual(writesMade(), [])
	})
	await test(`bulk ${action}: an id list that disagrees with its own total is refused, nothing written`, async () => {
		S.impl.resolveSearchIds = async () => ({ ids: idsOf(2), total: 3, overflow: false })
		const r = await bulk({ ...base, target: SEARCH_TARGET({ expect: 3 }) })
		assert.equal(r.status, 409)
		assert.deepEqual(writesMade(), [])
	})
	await test(`bulk ${action}: a failing helper is a bare 500; MediaError keeps its status`, async () => {
		S.impl[fn] = async () => {
			throw new Error('mongodb://u:hunter2@h refused')
		}
		let r = await bulk({ ...base, target: { ids: [VALID_ID] } })
		assert.equal(r.status, 500)
		assert.ok(!/hunter2/.test(r.text))
		S.impl[fn] = async () => {
			throw new MediaError('That folder does not exist.', 400)
		}
		r = await bulk({ ...base, target: { ids: [VALID_ID] } })
		assert.equal(r.status, 400)
	})
}

await test('bulk: delete needs the delete permission even when write is granted', async () => {
	S.permImpl = (permission) => {
		if (permission === 'media.delete') throw new HttpError(403, 'Your role does not allow that.')
		return { db: fakeDb, userId: USER, workspace: { _id: new ObjectId(WS) } }
	}
	let r = await bulk({ action: 'delete', target: { ids: [VALID_ID] } })
	assert.equal(r.status, 403)
	assert.deepEqual(writesMade(), [])
	reset()
	S.permImpl = (permission) => {
		if (permission === 'media.delete') throw new HttpError(403, 'Your role does not allow that.')
		return { db: fakeDb, userId: USER, workspace: { _id: new ObjectId(WS) } }
	}
	r = await bulk(bulkIds())
	assert.equal(r.status, 200, 'a non-delete action must not need the delete permission')
})
await test('bulk: delete cannot be downgraded to write by key order or duplicate keys', async () => {
	const ids = JSON.stringify([VALID_ID])
	for (const raw of [
		`{"target":{"ids":${ids}},"action":"delete"}`,
		`{"action":"move","target":{"ids":${ids}},"folderId":null,"action":"delete"}`,
		`{"action":"delete","action":"delete","target":{"ids":${ids}}}`,
	]) {
		reset()
		const r = await run(R.bulk.POST, mk('/bulk', { method: 'POST', raw }))
		assert.equal(r.status, 200, `${raw}: ${r.text}`)
		assert.deepEqual(S.permCalls.map((c) => c.permission), ['media.delete'], raw)
	}
	reset()
	const raw = `{"action":"delete","target":{"ids":${ids}},"folderId":null,"action":"move"}`
	const r = await run(R.bulk.POST, mk('/bulk', { method: 'POST', raw }))
	assert.equal(r.status, 200)
	assert.deepEqual(S.permCalls.map((c) => c.permission), ['media.upload'])
	assert.equal(count('deleteAssets'), 0)
	assert.equal(count('moveAssets'), 1)
})
await test('bulk: look-alike delete actions are 400 and write nothing', async () => {
	for (const action of ['DELETE', 'Delete', ' delete', 'delete ', 'remove', '', null, 5, ['delete']]) {
		reset()
		const r = await bulk({ action, target: { ids: [VALID_ID] } })
		assert.equal(r.status, 400, `${JSON.stringify(action)}: ${r.status}`)
		assert.deepEqual(writesMade(), [])
	}
})
await test('bulk: invalid bodies are 400 with a readable message and write nothing', async () => {
	const ids = (n) => Array.from({ length: n }, () => new ObjectId().toString())
	const cases = [
		['not json', { raw: '{nope' }],
		['empty body', { raw: '' }],
		['json null', { raw: 'null' }],
		['array', { body: [] }],
		['no action', { body: { target: { ids: [VALID_ID] } } }],
		['no target', { body: { action: 'retag' } }],
		['empty target', { body: { action: 'retag', target: {} } }],
		['empty ids', { body: { action: 'retag', target: { ids: [] } } }],
		['too many ids', { body: { action: 'retag', target: { ids: ids(MEDIA_LIMITS.bulkIdsCap + 1) } } }],
		['bad id', { body: { action: 'retag', target: { ids: ['nope'] } } }],
		['id object', { body: { action: 'retag', target: { ids: [{ $ne: 1 }] } } }],
		['ids not array', { body: { action: 'retag', target: { ids: VALID_ID } } }],
		['expect 0', { body: { action: 'retag', target: { search: { q: 'x', expect: 0 } } } }],
		['expect fraction', { body: { action: 'retag', target: { search: { q: 'x', expect: 1.5 } } } }],
		['expect too big', { body: { action: 'retag', target: { search: { q: 'x', expect: MEDIA_LIMITS.bulkSearchCap + 1 } } } }],
		['expect string', { body: { action: 'retag', target: { search: { q: 'x', expect: '2' } } } }],
		['expect missing', { body: { action: 'retag', target: { search: { q: 'x' } } } }],
		['q too long', { body: { action: 'retag', target: { search: { q: 'x'.repeat(MEDIA_LIMITS.queryMax + 1), expect: 1 } } } }],
		['folder junk', { body: { action: 'retag', target: { search: { q: '', folder: '$ne', expect: 1 } } } }],
		['move without folderId', { body: { action: 'move', target: { ids: [VALID_ID] } } }],
		['move bad folderId', { body: { action: 'move', target: { ids: [VALID_ID] }, folderId: 'x' } }],
		['addTags empty', { body: { action: 'addTags', target: { ids: [VALID_ID] }, tags: [] } }],
		['addTags too many', { body: { action: 'addTags', target: { ids: [VALID_ID] }, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) } }],
		['addTags blank label', { body: { action: 'addTags', target: { ids: [VALID_ID] }, tags: ['  '] } }],
		['removeTags missing', { body: { action: 'removeTags', target: { ids: [VALID_ID] } } }],
	]
	for (const [label, o] of cases) {
		reset()
		const r = await run(R.bulk.POST, mk('/bulk', { method: 'POST', ...o }))
		assert.equal(r.status, 400, `${label}: ${r.status} ${r.text}`)
		personReadable(r.body?.error)
		assert.deepEqual(writesMade(), [], `${label}: wrote`)
		assert.equal(count('resolveSearchIds'), 0, `${label}: resolved`)
	}
})
await test('bulk: a non-JSON body still asks for write first (never for an unauthenticated guess)', async () => {
	const r = await run(R.bulk.POST, mk('/bulk', { method: 'POST', raw: '{nope' }))
	assert.equal(r.status, 400)
	assert.deepEqual(S.permCalls, [{ permission: 'media.upload', workspaceId: WS }])
})
await test('bulk: duplicate ids are collapsed so counts stay honest', async () => {
	const a = new ObjectId().toString()
	const r = await bulk({ action: 'delete', target: { ids: [a, a.toUpperCase(), a] } })
	assert.equal(r.status, 200)
	assert.equal(callsOf('deleteAssets')[0].args[2].length, 1)
})
await test('bulk: a body that names both ids and search uses the ids, never resolves a search', async () => {
	await bulk({ action: 'delete', target: { ids: [VALID_ID], search: { q: '', expect: 1 } } })
	assert.equal(count('resolveSearchIds'), 0)
	assert.equal(callsOf('deleteAssets')[0].args[2].length, 1)
})
await test('bulk: workspace claims in the body are ignored', async () => {
	await bulk({ ...bulkIds(), workspaceId: OTHER_WS })
	assert.equal(callsOf('addTagsToAssets')[0].args[1].toString(), WS)
})
await test('bulk: search q defaults to empty and folder/deep stay undefined when absent', async () => {
	await bulk({ action: 'acceptAutoTags', target: { search: { expect: 2 } } })
	assert.deepEqual(callsOf('resolveSearchIds')[0].args[2], { q: '', folder: undefined, deep: undefined })
})
await test('bulk: an empty resolved set cannot happen past the expect check, and nothing is written for it', async () => {
	S.impl.resolveSearchIds = async () => ({ ids: [], total: 0, overflow: false })
	const r = await bulk({ action: 'delete', target: SEARCH_TARGET({ expect: 1 }) })
	assert.equal(r.status, 409)
	assert.deepEqual(writesMade(), [])
})
await test('bulk: resolveSearchIds failing propagates (MediaError status, or a bare 500)', async () => {
	S.impl.resolveSearchIds = async () => {
		throw new MediaError('Folder not found.', 404)
	}
	let r = await bulk({ action: 'delete', target: SEARCH_TARGET() })
	assert.equal(r.status, 404)
	assert.deepEqual(writesMade(), [])
	S.impl.resolveSearchIds = async () => {
		throw new Error('boom mongodb://x')
	}
	r = await bulk({ action: 'delete', target: SEARCH_TARGET() })
	assert.equal(r.status, 500)
	assert.deepEqual(writesMade(), [])
})
await test('bulk move: folder id becomes an ObjectId, null stays null', async () => {
	const f = new ObjectId()
	await bulk({ action: 'move', target: { ids: [VALID_ID] }, folderId: f.toString() })
	const got = callsOf('moveAssets')[0].args[3]
	assert.ok(got instanceof ObjectId && got.equals(f))
	reset()
	await bulk({ action: 'move', target: { ids: [VALID_ID] }, folderId: null })
	assert.equal(callsOf('moveAssets')[0].args[3], null)
})
await test('bulk addTags/removeTags: tags are passed as validated and trimmed', async () => {
	await bulk({ action: 'addTags', target: { ids: [VALID_ID] }, tags: ['  Kitchen  ', 'Van'] })
	assert.deepEqual(callsOf('addTagsToAssets')[0].args[3], ['Kitchen', 'Van'])
	reset()
	await bulk({ action: 'removeTags', target: { ids: [VALID_ID] }, tags: [' kitchen '] })
	assert.deepEqual(callsOf('removeTagsFromAssets')[0].args[3], ['kitchen'])
})
await test('bulk: affected is the number changed, never the number asked for', async () => {
	const three = [new ObjectId(), new ObjectId(), new ObjectId()].map(String)
	S.impl.addTagsToAssets = async () => ({ changed: 1, conflicts: 2 })
	let r = await bulk({ action: 'addTags', target: { ids: three }, tags: ['a'] })
	assert.deepEqual(r.body, { affected: 1 })
	S.impl.removeTagsFromAssets = async () => ({ changed: 0, conflicts: 3 })
	r = await bulk({ action: 'removeTags', target: { ids: three }, tags: ['a'] })
	assert.deepEqual(r.body, { affected: 0 })
	S.impl.acceptAutoTags = async () => ({ changed: 2, conflicts: 1 })
	r = await bulk({ action: 'acceptAutoTags', target: { ids: three } })
	assert.deepEqual(r.body, { affected: 2 })
	S.impl.moveAssets = async () => 2
	r = await bulk({ action: 'move', target: { ids: three }, folderId: null })
	assert.deepEqual(r.body, { affected: 2 })
	S.impl.deleteAssets = async () => 1
	r = await bulk({ action: 'delete', target: { ids: three } })
	assert.deepEqual(r.body, { affected: 1 })
	S.impl.queueTagging = async () => 2
	r = await bulk({ action: 'retag', target: { ids: three } })
	assert.deepEqual(r.body, { affected: 2 })
	assert.deepEqual(Object.keys(r.body), ['affected'])
})
await test('bulk retag: not configured is a clear 409 before anything is resolved, queued or scheduled', async () => {
	S.configured = false
	for (const target of [{ ids: [VALID_ID] }, SEARCH_TARGET()]) {
		reset()
		S.configured = false
		const r = await bulk({ action: 'retag', target })
		assert.equal(r.status, 409)
		assert.match(r.body.error, /auto-tagging is off/i)
		personReadable(r.body.error)
		assert.equal(count('queueTagging'), 0)
		assert.equal(count('resolveSearchIds'), 0)
		assert.equal(S.afterCalls.length, 0)
	}
})
await test('bulk retag: configured queues then nudges runTagging once through after()', async () => {
	S.impl.queueTagging = async () => 3
	const r = await bulk({ action: 'retag', target: { ids: [VALID_ID] } })
	assert.deepEqual(r.body, { affected: 3 })
	assert.equal(S.afterCalls.length, 1)
	assert.equal(count('runTagging'), 0, 'ran in the response path')
	await S.afterCalls[0]()
	assert.equal(count('runTagging'), 1)
	const [db, ws, opts] = callsOf('runTagging')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ws.toString(), WS)
	assert.equal(opts, undefined)
	const order = S.calls.map((c) => c.name)
	assert.ok(order.indexOf('queueTagging') < order.indexOf('runTagging'))
})
await test('bulk retag: nothing queued schedules nothing', async () => {
	S.impl.queueTagging = async () => 0
	const r = await bulk({ action: 'retag', target: { ids: [VALID_ID] } })
	assert.deepEqual(r.body, { affected: 0 })
	assert.equal(S.afterCalls.length, 0)
})
await test('bulk retag: a throwing after() or a failing background run does not fail the request', async () => {
	S.afterThrows = true
	const r = await bulk({ action: 'retag', target: { ids: [VALID_ID] } })
	assert.equal(r.status, 200)
	assert.deepEqual(r.body, { affected: 1 })
	reset()
	S.impl.runTagging = async () => {
		throw new Error('sk-ant-secret')
	}
	await bulk({ action: 'retag', target: { ids: [VALID_ID] } })
	await assert.doesNotReject(S.afterCalls[0]())
})
await test('bulk: other actions never schedule background tagging', async () => {
	for (const [, base] of ACTIONS.filter(([name]) => name !== 'retag')) {
		reset()
		await bulk({ ...base, target: { ids: [VALID_ID] } })
		assert.equal(S.afterCalls.length, 0)
	}
})
await test('bulk: a failure mid-way does not schedule or report success', async () => {
	S.impl.queueTagging = async () => {
		throw new Error('boom')
	}
	const r = await bulk({ action: 'retag', target: { ids: [VALID_ID] } })
	assert.equal(r.status, 500)
	assert.equal(S.afterCalls.length, 0)
})

/* -------------------------------------------------------------------------- */
/* /process                                                                   */
/* -------------------------------------------------------------------------- */

const proc = (body, o = {}) => run(R.process.POST, mk('/process', { method: 'POST', body, ...o }))

await test('GET /process: returns the tagging status for the workspace', async () => {
	const status = { configured: false, model: null, pending: 0, running: 0, failed: 0, skipped: 3, untagged: 3, budgetExhausted: false, resetsAt: null }
	S.impl.getTaggingStatus = async () => status
	const r = await run(R.process.GET, mk('/process'))
	assert.equal(r.status, 200)
	assert.deepEqual(r.body, status)
	const [db, ws] = callsOf('getTaggingStatus')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ws.toString(), WS)
	assert.equal(count('runTagging'), 0)
})
await test('POST /process: an empty or {} body means the defaults', async () => {
	for (const o of [{ body: {} }, { raw: '' }, { raw: '   \n' }]) {
		reset()
		const r = await run(R.process.POST, mk('/process', { method: 'POST', ...o }))
		assert.equal(r.status, 200, r.text)
		const [db, ws, opts] = callsOf('runTagging')[0].args
		assert.equal(db, fakeDb)
		assert.equal(ws.toString(), WS)
		assert.equal(opts.limit, undefined)
		assert.equal(opts.ids, undefined)
		assert.equal(count('requeueUntagged'), 0)
	}
})
await test('POST /process: every in-range limit passes through unchanged', async () => {
	for (let limit = 1; limit <= MEDIA_LIMITS.aiBatchMax; limit++) {
		reset()
		await proc({ limit })
		assert.equal(callsOf('runTagging')[0].args[2].limit, limit)
	}
})
await test('POST /process: out-of-range or malformed options are 400 and run nothing', async () => {
	const cases = [
		['limit 0', { body: { limit: 0 } }],
		['limit negative', { body: { limit: -1 } }],
		['limit over the cap', { body: { limit: MEDIA_LIMITS.aiBatchMax + 1 } }],
		['limit huge', { body: { limit: 1e9 } }],
		['limit fraction', { body: { limit: 1.5 } }],
		['limit string', { body: { limit: '2' } }],
		['too many ids', { body: { ids: idsOf(MEDIA_LIMITS.aiBatchMax + 1).map(String) } }],
		['bad id', { body: { ids: ['nope'] } }],
		['id object', { body: { ids: [{ $ne: 1 }] } }],
		['requeue string', { body: { requeue: 'yes' } }],
		['not json', { raw: '{nope' }],
		['json null', { raw: 'null' }],
		['array', { body: [] }],
	]
	for (const [label, o] of cases) {
		reset()
		const r = await run(R.process.POST, mk('/process', { method: 'POST', ...o }))
		assert.equal(r.status, 400, `${label}: ${r.status}`)
		personReadable(r.body?.error)
		assert.equal(count('runTagging'), 0, `${label}: ran`)
		assert.equal(count('requeueUntagged'), 0, `${label}: requeued`)
	}
})
await test('POST /process: requeue calls requeueUntagged first, then runs', async () => {
	await proc({ requeue: true })
	const order = S.calls.map((c) => c.name)
	assert.ok(order.indexOf('requeueUntagged') >= 0 && order.indexOf('requeueUntagged') < order.indexOf('runTagging'), order.join())
	const [db, ws] = callsOf('requeueUntagged')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ws.toString(), WS)
	reset()
	await proc({ requeue: false })
	assert.equal(count('requeueUntagged'), 0)
})
await test('POST /process: a failing requeue stops before running', async () => {
	S.impl.requeueUntagged = async () => {
		throw new Error('boom')
	}
	const r = await proc({ requeue: true })
	assert.equal(r.status, 500)
	assert.equal(count('runTagging'), 0)
})
await test('POST /process: named ids become ObjectIds, deduped, and default the limit to their count', async () => {
	const [a, b] = idsOf(2)
	await proc({ ids: [a.toString(), b.toString(), a.toString().toUpperCase()] })
	const opts = callsOf('runTagging')[0].args[2]
	assert.deepEqual(opts.ids.map(String), [a.toString(), b.toString()])
	assert.ok(opts.ids.every((id) => id instanceof ObjectId))
	assert.equal(opts.limit, 2)
	reset()
	await proc({ ids: [a.toString()], limit: 3 })
	assert.equal(callsOf('runTagging')[0].args[2].limit, 3)
})
await test('POST /process: shapes processed items with DTOs, omits asset when the doc vanished', async () => {
	const done = makeDoc({ tagging: { status: 'done', attempts: 1, leaseUntil: new Date() } })
	const failed = makeDoc({ tagging: { status: 'failed', attempts: 3, error: 'The image could not be read.' } })
	const gone = new ObjectId()
	S.impl.runTagging = async () => ({
		processed: [
			{ id: done._id, status: 'done', doc: done },
			{ id: failed._id, status: 'failed', doc: failed },
			{ id: gone, status: 'pending', doc: null },
		],
		remaining: 7,
		budgetExhausted: false,
	})
	const r = await proc({})
	assert.equal(r.status, 200)
	assert.equal(r.body.remaining, 7)
	assert.equal(r.body.configured, true)
	assert.equal(r.body.budgetExhausted, false)
	assert.ok(!('blocked' in r.body))
	assert.equal(r.body.processed.length, 3)
	assert.equal(r.body.processed[0].id, done._id.toString())
	assert.equal(r.body.processed[0].status, 'done')
	assert.equal(r.body.processed[0].asset.id, done._id.toString())
	assert.ok(!('error' in r.body.processed[0].asset.tagging))
	assert.equal(r.body.processed[1].asset.tagging.error, 'The image could not be read.')
	assert.deepEqual(r.body.processed[2], { id: gone.toString(), status: 'pending' })
	for (const item of r.body.processed) if (item.asset) assertNoLeak(item.asset)
	assert.equal(count('loadFolderIndex'), 1, 'the folder index is loaded once')
})
await test('POST /process: configured reflects the environment', async () => {
	S.configured = false
	let r = await proc({})
	assert.equal(r.body.configured, false)
	reset()
	S.configured = true
	r = await proc({})
	assert.equal(r.body.configured, true)
})
await test('POST /process: budgetExhausted is passed through', async () => {
	S.impl.runTagging = async () => ({ processed: [], remaining: 4, budgetExhausted: true })
	const r = await proc({})
	assert.equal(r.body.budgetExhausted, true)
	assert.equal(r.body.remaining, 4)
	assert.deepEqual(r.body.processed, [])
})
await test('POST /process: blocked is passed through untouched (config and rate_limited)', async () => {
	const config = { kind: 'config', message: 'AI credentials were rejected.' }
	S.impl.runTagging = async () => ({ processed: [], remaining: 5, budgetExhausted: false, blocked: config })
	let r = await proc({})
	assert.deepEqual(r.body.blocked, config)
	reset()
	const limited = { kind: 'rate_limited', message: 'Slow down.', retryAfterMs: 30_000 }
	S.impl.runTagging = async () => ({ processed: [], remaining: 5, budgetExhausted: false, blocked: limited })
	r = await proc({})
	assert.deepEqual(r.body.blocked, limited)
})
await test('POST /process: never schedules background work of its own', async () => {
	await proc({ requeue: true })
	assert.equal(S.afterCalls.length, 0)
})

/* -------------------------------------------------------------------------- */
/* GET /suggest                                                               */
/* -------------------------------------------------------------------------- */

await test('GET /suggest: returns {suggestions} from suggest for the typed text', async () => {
	const suggestions = [{ kind: 'tag', label: 'Kitchen', insert: 'tag:kitchen', count: 4 }]
	S.impl.suggest = async () => suggestions
	const r = await run(R.suggest.GET, mk('/suggest?q=tag%3Aki'))
	assert.equal(r.status, 200)
	assert.deepEqual(r.body, { suggestions })
	const [db, ctx, q] = callsOf('suggest')[0].args
	assert.equal(db, fakeDb)
	assert.equal(ctx.workspaceId.toString(), WS)
	assert.equal(ctx.userId, USER)
	assert.equal(q, 'tag:ki')
})
await test('GET /suggest: a trailing space is passed on (it means nothing left to complete)', async () => {
	await run(R.suggest.GET, mk('/suggest?q=tag%3Akitchen%20'))
	assert.equal(callsOf('suggest')[0].args[2], 'tag:kitchen ')
})
await test('GET /suggest: no, empty or blank q is an empty list without touching the library', async () => {
	for (const url of ['/suggest', '/suggest?q=', '/suggest?q=%20%20%20']) {
		reset()
		const r = await run(R.suggest.GET, mk(url))
		assert.equal(r.status, 200)
		assert.deepEqual(r.body, { suggestions: [] })
		assert.equal(count('suggest'), 0)
		assert.equal(S.permCalls.length, 1, 'still authorised first')
	}
})
await test('GET /suggest: q is cut at the query limit', async () => {
	await run(R.suggest.GET, mk(`/suggest?q=${'a'.repeat(5000)}`))
	assert.equal(callsOf('suggest')[0].args[2].length, MEDIA_LIMITS.queryMax)
})
await test('GET /suggest: hostile q is passed as a plain string', async () => {
	await run(R.suggest.GET, mk(`/suggest?q=${encodeURIComponent('{"$ne":null}')}&q=second`))
	assert.equal(typeof callsOf('suggest')[0].args[2], 'string')
})

/* -------------------------------------------------------------------------- */

console.error = realConsoleError
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
