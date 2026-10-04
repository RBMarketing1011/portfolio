/**
 * Handler-level proof of the media routes for folders, tags and saved searches.
 *
 *   node scripts/prove-media-routes-b.mjs
 *
 * The real route files, schemas, http helpers, access helper, folder index and
 * DTO mappers run. Stood in for, because they are ESM-only, stubs still being
 * written, or I/O:
 *   - '@/lib/auth/guards'    records the permission and workspace id asked for
 *   - '@/lib/media/folders'  in-memory tree (FolderError is declared like the stub's)
 *   - '@/lib/media/tags'     recording fakes
 *   - '@/lib/media/text'     a `slugify` written from its documented contract
 *   - the database           an in-memory `mediaSavedSearches` collection that
 *                            REFUSES any filter or document without the workspace id
 * Nothing here touches the network or a real database.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadTs, mock, rootRequire } = require('./lib/load-ts.cjs')
const { ObjectId } = rootRequire('mongodb')

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
const check = async (name, fn) => {
	try {
		await fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${error instanceof Error ? error.message : error})`)
	}
}
const assert = (cond, detail) => {
	if (!cond) throw new Error(detail || 'assertion failed')
}
const eq = (actual, expected, what = 'value') => {
	const a = JSON.stringify(actual)
	const e = JSON.stringify(expected)
	if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`)
}

const WS = new ObjectId()
const WS_HEX = WS.toString()
const OTHER_WS = new ObjectId()
const USER = 'user-1'

/* -------------------------------------------------------------------------- */
/* Stand-ins                                                                  */
/* -------------------------------------------------------------------------- */

// The real error classes, so `instanceof MediaError` in http.ts holds.
const { MediaError } = loadTs('src/lib/media/errors.ts')
class FolderError extends MediaError {}

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

const state = {}
const reset = () => {
	Object.assign(state, {
		asked: [], // requirePermission(permission, workspaceId) calls
		member: true, // false: not a member of the account (404)
		deny: null, // a permission the role lacks (403)
		signedIn: true,
		calls: [], // every lib call: { fn, args }
		folders: [], // { _id, parentId, name }
		counts: new Map(), // folder id -> direct asset count
		unfiled: 0,
		hooks: {}, // per-function behaviour overrides
		tagResult: {},
	})
	fake.reset()
}

const requirePermission = async (permission, workspaceId) => {
	state.asked.push({ permission, workspaceId })
	if (!state.signedIn) throw new HttpError(401, 'Sign in to continue.')
	if (!state.member) throw new HttpError(404, 'Account not found.')
	if (state.deny === permission || state.deny === '*')
		throw new HttpError(403, 'Your role does not allow that.')
	return { db: fake.db, workspace: { _id: WS }, userId: USER }
}
mock('@/lib/auth/guards', { HttpError, errorResponse, requirePermission })

// A fake `mediaSavedSearches` collection. Every operation is checked for the
// account id: a query or write that lacks it is recorded as a violation, which the
// harness fails after each case, so scoping is proved on EVERY query, not sampled.
const fake = (() => {
	let docs = []
	let violations = []
	let log = []
	let onInsert = null
	const same = (a, b) =>
		a instanceof ObjectId || b instanceof ObjectId
			? String(a) === String(b)
			: a instanceof Date
				? a.getTime() === b?.getTime?.()
				: a === b
	const scoped = (filter, op) => {
		const w = filter && filter.workspaceId
		if (!(w instanceof ObjectId)) violations.push(`${op} without workspaceId: ${JSON.stringify(filter)}`)
		for (const [k, v] of Object.entries(filter || {}))
			if (v !== null && typeof v === 'object' && !(v instanceof ObjectId) && !(v instanceof Date))
				violations.push(`${op} with an operator object on ${k}`)
	}
	const match = (doc, filter) =>
		Object.entries(filter).every(([k, v]) => same(doc[k], v))
	const cmp = (a, b) => {
		const x = a instanceof Date ? a.getTime() : String(a)
		const y = b instanceof Date ? b.getTime() : String(b)
		return x < y ? -1 : x > y ? 1 : 0
	}
	const collection = {
		find(filter) {
			scoped(filter, 'find')
			log.push({ op: 'find', filter })
			let rows = docs.filter((d) => match(d, filter))
			const cursor = {
				sort(spec) {
					const keys = Object.entries(spec)
					rows = [...rows].sort((a, b) => {
						for (const [key, dir] of keys) {
							const c = cmp(a[key], b[key])
							if (c) return c * dir
						}
						return 0
					})
					return cursor
				},
				limit(n) {
					rows = rows.slice(0, n)
					return cursor
				},
				toArray: async () => rows.map((d) => ({ ...d })),
			}
			return cursor
		},
		async countDocuments(filter) {
			scoped(filter, 'countDocuments')
			return docs.filter((d) => match(d, filter)).length
		},
		async insertOne(doc) {
			if (!(doc.workspaceId instanceof ObjectId))
				violations.push('insertOne without workspaceId')
			log.push({ op: 'insertOne', doc })
			docs.push({ ...doc })
			if (onInsert) onInsert(docs)
			return { insertedId: doc._id }
		},
		async deleteOne(filter) {
			scoped(filter, 'deleteOne')
			log.push({ op: 'deleteOne', filter })
			const i = docs.findIndex((d) => match(d, filter))
			if (i >= 0) docs.splice(i, 1)
			return { deletedCount: i >= 0 ? 1 : 0 }
		},
		async updateOne() {
			violations.push('updateOne is not used by these routes')
			return { modifiedCount: 0 }
		},
		async deleteMany() {
			violations.push('deleteMany is not used by these routes')
			return { deletedCount: 0 }
		},
	}
	return {
		db: {
			collection(name) {
				if (name !== 'mediaSavedSearches') {
					violations.push(`unexpected collection ${name}`)
					throw new Error(`unexpected collection ${name}`)
				}
				return collection
			},
		},
		reset() {
			docs = []
			violations = []
			log = []
			onInsert = null
		},
		get docs() {
			return docs
		},
		get violations() {
			return violations
		},
		get log() {
			return log
		},
		seed(doc) {
			docs.push(doc)
		},
		setOnInsert(fn) {
			onInsert = fn
		},
	}
})()

const { buildFolderIndex } = loadTs('src/lib/media/folder-index.ts')
const { toFolderDTOs } = loadTs('src/lib/media/dto.ts')

const rec = (fn, impl) => async (...args) => {
	state.calls.push({ fn, args })
	if (state.hooks[fn]) return state.hooks[fn](...args)
	return impl(...args)
}
const index = () => buildFolderIndex(state.folders)

mock('@/lib/media/folders', {
	FolderError,
	loadFolders: rec('loadFolders', async () => state.folders),
	loadFolderIndex: rec('loadFolderIndex', async () => index()),
	getFoldersResponse: rec('getFoldersResponse', async () => {
		const idx = index()
		const total = [...state.counts.values()].reduce((a, b) => a + b, 0) + state.unfiled
		return {
			folders: toFolderDTOs(idx, state.counts),
			unfiled: state.unfiled,
			total,
			unreviewed: 0,
			bytes: 0,
		}
	}),
	createFolder: rec('createFolder', async (_db, _ws, _user, input) => {
		const doc = { _id: new ObjectId(), parentId: input.parentId, name: input.name }
		state.folders.push(doc)
		return { ...doc, workspaceId: WS, nameKey: input.name.toLowerCase() }
	}),
	renameFolder: rec('renameFolder', async (_db, _ws, id, name) => {
		const f = state.folders.find((x) => x._id.equals(id))
		if (!f) throw new FolderError('Folder not found.', 404)
		f.name = name
		return f
	}),
	moveFolder: rec('moveFolder', async (_db, _ws, id, parentId) => {
		const f = state.folders.find((x) => x._id.equals(id))
		if (!f) throw new FolderError('Folder not found.', 404)
		f.parentId = parentId
		return f
	}),
	deleteFolder: rec('deleteFolder', async (_db, _ws, id) => {
		const f = state.folders.find((x) => x._id.equals(id))
		if (!f) throw new FolderError('Folder not found.', 404)
		state.folders = state.folders.filter((x) => x !== f)
		return { assets: 3, folders: 1 }
	}),
})

// The documented contract of text.slugify: fold, `&` -> and, non letters/digits
// collapse to dashes, at most 60 chars, no leading/trailing dash, empty when
// nothing letter-like survives.
const slugify = (label) =>
	label
		.normalize('NFKD')
		.replace(/\p{M}+/gu, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
		.split(' ')
		.filter(Boolean)
		.join('-')
		.slice(0, 60)
		.replace(/-+$/, '')
mock('@/lib/media/text', { slugify })

mock('@/lib/media/tags', {
	listTagStats: rec('listTagStats', async () => [
		{ slug: 'kitchen', label: 'Kitchen', count: 3, manual: 2, auto: 1 },
	]),
	renameTag: rec('renameTag', async (_db, _ws, slug, label) => ({
		affected: 4,
		slug: slugify(label),
		merged: slugify(label) === 'existing',
	})),
	mergeTag: rec('mergeTag', async () => ({ affected: 7 })),
	deleteTag: rec('deleteTag', async () => ({ affected: 2 })),
})

/* -------------------------------------------------------------------------- */
/* The routes under test                                                      */
/* -------------------------------------------------------------------------- */

const R = {
	folders: loadTs('src/app/api/account/media/folders/route.ts'),
	folder: loadTs('src/app/api/account/media/folders/[id]/route.ts'),
	tags: loadTs('src/app/api/account/media/tags/route.ts'),
	tag: loadTs('src/app/api/account/media/tags/[slug]/route.ts'),
	saved: loadTs('src/app/api/account/media/saved/route.ts'),
	savedOne: loadTs('src/app/api/account/media/saved/[id]/route.ts'),
}

const BASE = 'http://localhost/api/account/media'

/** Calls a handler the way Next does: a Request plus `{ params: Promise }`. */
async function call(handler, o = {}) {
	const headers = new Headers(o.headers ?? {})
	if (o.ws !== null && !headers.has('x-media-workspace') && o.noHeader !== true)
		headers.set('x-media-workspace', o.ws ?? WS_HEX)
	let body
	if (o.raw !== undefined) body = o.raw
	else if (o.body !== undefined) body = JSON.stringify(o.body)
	if (body !== undefined) headers.set('content-type', 'application/json')
	const request = new Request(`${BASE}${o.path ?? ''}`, {
		method: o.method ?? 'GET',
		headers,
		body,
	})
	const response = await handler(request, { params: Promise.resolve(o.params ?? {}) })
	const text = await response.text()
	let json = null
	try {
		json = JSON.parse(text)
	} catch {
		// not JSON
	}
	return { status: response.status, json, text, headers: response.headers }
}

const libCalls = () => state.calls.map((c) => c.fn)
const noLibCalls = () => eq(libCalls(), [], 'lib calls')

// Silence the 500 path's console.error without hiding it from the proof.
const originalError = console.error
const errors = []
console.error = (...args) => errors.push(args)

async function test(name, fn) {
	reset()
	errors.length = 0
	await check(name, async () => {
		await fn()
		assert(
			fake.violations.length === 0,
			`saved-search data layer violations: ${fake.violations.join('; ')}`,
		)
	})
}

const hex = (c) => c.repeat(24)
const addFolder = (name, parentId = null) => {
	const doc = { _id: new ObjectId(), parentId, name }
	state.folders.push(doc)
	return doc
}
const savedDoc = (over = {}) => ({
	_id: new ObjectId(),
	workspaceId: WS,
	name: 'Kitchens',
	query: 'tag:kitchen',
	folder: null,
	sort: null,
	createdBy: 'someone',
	createdAt: new Date('2026-01-01T00:00:00Z'),
	...over,
})

/* -------------------------------------------------------------------------- */
/* Every handler: shared guarantees                                           */
/* -------------------------------------------------------------------------- */

const FID = hex('a')
const SID = hex('b')
const VALID = {
	foldersGET: { h: R.folders.GET, method: 'GET', perm: 'projects.view' },
	foldersPOST: {
		h: R.folders.POST,
		method: 'POST',
		perm: 'media.upload',
		body: { name: 'Clients', parentId: null },
	},
	folderPATCH: {
		h: R.folder.PATCH,
		method: 'PATCH',
		perm: 'media.upload',
		params: { id: FID },
		body: { name: 'Renamed' },
	},
	folderDELETE: {
		h: R.folder.DELETE,
		method: 'DELETE',
		perm: 'media.delete',
		params: { id: FID },
	},
	tagsGET: { h: R.tags.GET, method: 'GET', perm: 'projects.view' },
	tagPATCH: {
		h: R.tag.PATCH,
		method: 'PATCH',
		perm: 'media.upload',
		params: { slug: 'kitchen' },
		body: { label: 'Cooking' },
	},
	tagDELETE: {
		h: R.tag.DELETE,
		method: 'DELETE',
		perm: 'media.delete',
		params: { slug: 'kitchen' },
	},
	savedGET: { h: R.saved.GET, method: 'GET', perm: 'projects.view' },
	savedPOST: {
		h: R.saved.POST,
		method: 'POST',
		perm: 'media.upload',
		body: { name: 'Mine', query: 'tag:a' },
	},
	savedDELETE: {
		h: R.savedOne.DELETE,
		method: 'DELETE',
		perm: 'media.upload',
		params: { id: SID },
	},
}

const run = (v, extra = {}) =>
	call(v.h, { method: v.method, params: v.params, body: v.body, ...extra })

for (const [name, v] of Object.entries(VALID)) {
	await test(`${name}: succeeds with a valid request and asks for ${v.perm} in the header's account`, async () => {
		if (name === 'folderPATCH' || name === 'folderDELETE') addFolder('Old')
		state.folders = state.folders.map((f) => ({ ...f, _id: new ObjectId(FID) }))
		if (name === 'savedDELETE') fake.seed(savedDoc({ _id: new ObjectId(SID) }))
		const r = await run(v)
		assert(r.status === 200 || r.status === 201, `status ${r.status}: ${r.text}`)
		eq(state.asked, [{ permission: v.perm, workspaceId: WS_HEX }], 'requirePermission')
		eq(r.headers.get('cache-control'), 'no-store', 'cache-control')
	})

	await test(`${name}: missing x-media-workspace is 400 and nothing runs`, async () => {
		const r = await run(v, { noHeader: true })
		eq(r.status, 400)
		assert(typeof r.json.error === 'string' && r.json.error.length > 0, 'error message')
		eq(state.asked, [], 'requirePermission must not be asked')
		noLibCalls()
	})

	await test(`${name}: malformed x-media-workspace values are all 400`, async () => {
		for (const bad of [
			'',
			'abc',
			'g'.repeat(24),
			'a'.repeat(23),
			'a'.repeat(25),
			`${WS_HEX},${WS_HEX}`,
			'$ne',
			'{"$ne":1}',
			'null',
			'../etc/passwd',
			'0x' + 'a'.repeat(22),
		]) {
			const r = await run(v, { headers: { 'x-media-workspace': bad }, noHeader: true })
			eq(r.status, 400, `status for ${JSON.stringify(bad)}`)
		}
		eq(state.asked, [], 'requirePermission must not be asked')
		noLibCalls()
	})

	await test(`${name}: a non-member gets 404, a role without the permission 403, no session 401, and no lib call`, async () => {
		state.member = false
		eq((await run(v)).status, 404, 'non-member')
		state.member = true
		state.deny = v.perm
		eq((await run(v)).status, 403, 'forbidden')
		state.deny = null
		state.signedIn = false
		eq((await run(v)).status, 401, 'signed out')
		noLibCalls()
		eq(fake.log.filter((l) => l.op !== 'find').length, 0, 'no writes')
	})

	await test(`${name}: an unexpected failure is a plain 500 that leaks nothing`, async () => {
		const secret = 'mongodb://user:hunter2@internal-host:27017'
		const boom = () => {
			throw new Error(secret)
		}
		const fnByHandler = {
			foldersGET: 'getFoldersResponse',
			foldersPOST: 'createFolder',
			folderPATCH: 'renameFolder',
			folderDELETE: 'deleteFolder',
			tagsGET: 'listTagStats',
			tagPATCH: 'renameTag',
			tagDELETE: 'deleteTag',
		}
		if (fnByHandler[name]) state.hooks[fnByHandler[name]] = boom
		else {
			// saved searches: break the collection itself
			const real = fake.db.collection
			fake.db.collection = () => {
				throw new Error(secret)
			}
			try {
				const r = await run(v)
				eq(r.status, 500)
				assert(!r.text.includes('hunter2'), 'secret leaked')
				assert(!r.text.includes('internal-host'), 'host leaked')
				return
			} finally {
				fake.db.collection = real
			}
		}
		const r = await run(v)
		eq(r.status, 500)
		eq(r.json, { error: 'Something went wrong.' })
		assert(!r.text.includes('hunter2'), 'secret leaked')
	})
}

await test('every route file exports runtime = nodejs and dynamic = force-dynamic', () => {
	for (const [name, mod] of Object.entries(R)) {
		eq(mod.runtime, 'nodejs', `${name}.runtime`)
		eq(mod.dynamic, 'force-dynamic', `${name}.dynamic`)
	}
})

await test('an uppercase hex account id is accepted and passed through unchanged', async () => {
	const upper = WS_HEX.toUpperCase()
	const r = await call(R.folders.GET, { ws: upper })
	eq(r.status, 200)
	eq(state.asked[0].workspaceId, upper)
})

await test('the account comes from the header only: a body or query naming another account changes nothing', async () => {
	const r = await call(R.folders.POST, {
		method: 'POST',
		path: `/folders?workspace=${OTHER_WS}&workspaceId=${OTHER_WS}`,
		body: { name: 'X', parentId: null, workspaceId: OTHER_WS.toString() },
	})
	eq(r.status, 201)
	eq(state.asked, [{ permission: 'media.upload', workspaceId: WS_HEX }])
	eq(state.calls[0].args[1].toString(), WS_HEX, 'workspace given to createFolder')
})

/* -------------------------------------------------------------------------- */
/* Folders: GET, POST                                                         */
/* -------------------------------------------------------------------------- */

await test('GET /folders returns getFoldersResponse unchanged, for this account', async () => {
	const a = addFolder('Clients')
	const b = addFolder('Acme', a._id)
	state.counts.set(b._id.toString(), 5)
	state.unfiled = 2
	const r = await call(R.folders.GET)
	eq(r.status, 200)
	eq(r.json.unfiled, 2)
	eq(r.json.total, 7)
	eq(
		r.json.folders.map((f) => [f.path, f.count, f.total]),
		[
			['Clients', 0, 5],
			['Clients/Acme', 5, 5],
		],
	)
	eq(state.calls[0].args[1].toString(), WS_HEX, 'workspace')
})

await test('POST /folders creates a top-level folder: 201 { folder } with zero counts and the right path', async () => {
	const r = await call(R.folders.POST, { method: 'POST', body: { name: 'Clients', parentId: null } })
	eq(r.status, 201)
	eq(Object.keys(r.json), ['folder'])
	const f = r.json.folder
	eq(
		{ ...f, id: 'x' },
		{ id: 'x', parentId: null, name: 'Clients', path: 'Clients', depth: 0, count: 0, total: 0 },
	)
	assert(/^[a-f0-9]{24}$/.test(f.id), 'id is an object id string')
	const create = state.calls.find((c) => c.fn === 'createFolder')
	eq(create.args[1].toString(), WS_HEX)
	eq(create.args[2], USER, 'userId comes from the membership')
	eq(create.args[3].parentId, null)
})

await test('POST /folders under a parent builds the path and depth from the fresh index, and passes the parent as an ObjectId', async () => {
	const p = addFolder('Clients')
	const r = await call(R.folders.POST, {
		method: 'POST',
		body: { name: '  Acme  ', parentId: p._id.toString() },
	})
	eq(r.status, 201)
	eq(r.json.folder.name, 'Acme', 'name is trimmed by the schema')
	eq(r.json.folder.path, 'Clients/Acme')
	eq(r.json.folder.depth, 1)
	eq(r.json.folder.parentId, p._id.toString())
	const input = state.calls.find((c) => c.fn === 'createFolder').args[3]
	assert(input.parentId instanceof ObjectId, 'parentId is an ObjectId')
	assert(input.parentId.equals(p._id))
})

await test('POST /folders: unknown extra body keys never reach the library', async () => {
	await call(R.folders.POST, {
		method: 'POST',
		body: { name: 'A', parentId: null, createdBy: 'evil', _id: hex('c'), workspaceId: hex('d') },
	})
	eq(Object.keys(state.calls.find((c) => c.fn === 'createFolder').args[3]).sort(), ['name', 'parentId'])
})

await test('POST /folders: FolderError statuses pass through with their messages', async () => {
	for (const [status, message] of [
		[404, 'Folder not found.'],
		[400, 'That folder is too deep.'],
		[409, 'A folder with that name already exists here.'],
		[400, 'You have reached the folder limit.'],
	]) {
		state.hooks.createFolder = () => {
			throw new FolderError(message, status)
		}
		const r = await call(R.folders.POST, { method: 'POST', body: { name: 'Dup', parentId: null } })
		eq(r.status, status, message)
		eq(r.json, { error: message })
	}
})

await test('POST /folders: invalid bodies are 400 with a readable message, and nothing is created', async () => {
	const cases = {
		'missing name': { parentId: null },
		'empty name': { name: '', parentId: null },
		'blank name': { name: '   ', parentId: null },
		'slash in name': { name: 'a/b', parentId: null },
		'backslash in name': { name: 'a\\b', parentId: null },
		'control character': { name: 'a\u0007b', parentId: null },
		'newline': { name: 'a\nb', parentId: null },
		'name too long': { name: 'x'.repeat(81), parentId: null },
		'name is a number': { name: 5, parentId: null },
		'name is an object': { name: { $ne: '' }, parentId: null },
		'name is an array': { name: ['a'], parentId: null },
		'parent is not an id': { name: 'A', parentId: 'nope' },
		'parent is 23 hex': { name: 'A', parentId: 'a'.repeat(23) },
		'parent is an object': { name: 'A', parentId: { $ne: null } },
		'parent is empty string': { name: 'A', parentId: '' },
		'parent is a number': { name: 'A', parentId: 12 },
		'parent missing': { name: 'A' },
	}
	for (const [label, body] of Object.entries(cases)) {
		const r = await call(R.folders.POST, { method: 'POST', body })
		eq(r.status, 400, label)
		assert(typeof r.json.error === 'string' && r.json.error.length > 3, `${label}: message`)
		assert(!/at .*\(.*:\d+/.test(r.json.error), `${label}: no stack in message`)
	}
	for (const raw of ['', 'not json', '{', '[]', 'null', '"str"', '5', 'true']) {
		const r = await call(R.folders.POST, { method: 'POST', raw })
		eq(r.status, 400, `raw ${JSON.stringify(raw)}`)
	}
	assert(!libCalls().includes('createFolder'), 'createFolder must not run')
})

await test('POST /folders: a name of exactly 80 characters is accepted, and a hostile-looking one is data', async () => {
	let r = await call(R.folders.POST, { method: 'POST', body: { name: 'x'.repeat(80), parentId: null } })
	eq(r.status, 201)
	r = await call(R.folders.POST, {
		method: 'POST',
		body: { name: '<img src=x onerror=alert(1)> $where', parentId: null },
	})
	eq(r.status, 201)
	eq(r.json.folder.name, '<img src=x onerror=alert(1)> $where')
})

/* -------------------------------------------------------------------------- */
/* Folders: PATCH, DELETE                                                     */
/* -------------------------------------------------------------------------- */

await test('PATCH /folders/[id] rename: renames, does not move, and answers with the folder and its live counts', async () => {
	const f = addFolder('Old')
	state.counts.set(f._id.toString(), 9)
	const r = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: f._id.toString() },
		body: { name: '  New  ' },
	})
	eq(r.status, 200)
	eq(Object.keys(r.json), ['folder'])
	eq({ ...r.json.folder, id: 'x' }, {
		id: 'x', parentId: null, name: 'New', path: 'New', depth: 0, count: 9, total: 9,
	})
	eq(libCalls(), ['renameFolder', 'getFoldersResponse'])
	eq(state.calls[0].args[3], 'New')
})

await test('PATCH /folders/[id] move: parentId null is a valid move to the top level', async () => {
	const p = addFolder('Clients')
	const f = addFolder('Acme', p._id)
	const r = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: f._id.toString() },
		body: { parentId: null },
	})
	eq(r.status, 200)
	eq(r.json.folder.parentId, null)
	eq(r.json.folder.path, 'Acme')
	eq(libCalls(), ['moveFolder', 'getFoldersResponse'])
	eq(state.calls[0].args[3], null)
})

await test('PATCH /folders/[id] move into a parent: passes an ObjectId, response shows the new path', async () => {
	const p = addFolder('Clients')
	const f = addFolder('Acme')
	const r = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: f._id.toString() },
		body: { parentId: p._id.toString() },
	})
	eq(r.status, 200)
	eq(r.json.folder.path, 'Clients/Acme')
	eq(r.json.folder.depth, 1)
	assert(state.calls[0].args[3] instanceof ObjectId)
	assert(state.calls[0].args[3].equals(p._id))
})

await test('PATCH /folders/[id]: an absent parentId means unchanged (no move call)', async () => {
	const p = addFolder('Clients')
	const f = addFolder('Acme', p._id)
	const r = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: f._id.toString() },
		body: { name: 'Acme2' },
	})
	eq(r.status, 200)
	eq(r.json.folder.parentId, p._id.toString(), 'still under Clients')
	assert(!libCalls().includes('moveFolder'))
})

await test('PATCH /folders/[id] both: rename runs first, then move, and the response reflects both', async () => {
	const p = addFolder('Clients')
	const f = addFolder('Old')
	const r = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: f._id.toString() },
		body: { name: 'New', parentId: p._id.toString() },
	})
	eq(r.status, 200)
	eq(r.json.folder.path, 'Clients/New')
	eq(libCalls().filter((c) => c === 'renameFolder' || c === 'moveFolder'), ['renameFolder', 'moveFolder'])
})

await test('PATCH /folders/[id] both: a failed move undoes the rename and its status passes through', async () => {
	const p = addFolder('Clients')
	const f = addFolder('Old')
	state.hooks.moveFolder = () => {
		throw new FolderError('A folder with that name already exists here.', 409)
	}
	const r = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: f._id.toString() },
		body: { name: 'New', parentId: p._id.toString() },
	})
	eq(r.status, 409)
	eq(r.json.error, 'A folder with that name already exists here.')
	eq(state.folders.find((x) => x._id.equals(f._id)).name, 'Old', 'rename was rolled back')
	eq(
		state.calls.filter((c) => c.fn === 'renameFolder').map((c) => c.args[3]),
		['New', 'Old'],
	)
})

await test('PATCH /folders/[id] both: if the rollback itself fails, the move error is still what the caller sees', async () => {
	const p = addFolder('Clients')
	const f = addFolder('Old')
	let renames = 0
	const realRename = state.hooks.renameFolder
	state.hooks.renameFolder = (...args) => {
		renames++
		if (renames === 2) throw new Error('rollback failed')
		return realRename ? realRename(...args) : undefined
	}
	state.hooks.moveFolder = () => {
		throw new FolderError('Too deep.', 400)
	}
	// renameFolder is hooked, so mutate the tree by hand for the first call
	const base = state.hooks.renameFolder
	state.hooks.renameFolder = (_d, _w, id, name) => {
		if (renames === 0) {
			renames++
			state.folders.find((x) => x._id.equals(id)).name = name
			return {}
		}
		return base()
	}
	const r = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: f._id.toString() },
		body: { name: 'New', parentId: p._id.toString() },
	})
	eq(r.status, 400)
	eq(r.json.error, 'Too deep.')
})

await test('PATCH /folders/[id] both: renaming to the same name then failing to move does not issue a pointless second rename', async () => {
	const p = addFolder('Clients')
	const f = addFolder('Same')
	state.hooks.moveFolder = () => {
		throw new FolderError('Nope.', 409)
	}
	const r = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: f._id.toString() },
		body: { name: 'Same', parentId: p._id.toString() },
	})
	eq(r.status, 409)
	eq(libCalls().filter((c) => c === 'renameFolder').length, 1)
})

await test('PATCH /folders/[id]: a failed rename stops before any move; FolderError statuses pass through', async () => {
	const p = addFolder('Clients')
	const f = addFolder('Old')
	for (const [status, message] of [[409, 'Name taken.'], [400, 'Bad name.'], [404, 'Folder not found.']]) {
		state.calls.length = 0
		state.hooks.renameFolder = () => {
			throw new FolderError(message, status)
		}
		const r = await call(R.folder.PATCH, {
			method: 'PATCH',
			params: { id: f._id.toString() },
			body: { name: 'X', parentId: p._id.toString() },
		})
		eq(r.status, status)
		eq(r.json.error, message)
		assert(!libCalls().includes('moveFolder'), 'no move after a failed rename')
	}
})

await test('PATCH /folders/[id]: move errors (cycle 400, depth 400, conflict 409, missing 404) pass through', async () => {
	const f = addFolder('A')
	for (const [status, message] of [
		[400, 'A folder cannot move into itself.'],
		[400, 'That would nest folders too deeply.'],
		[409, 'That move conflicted with another change. Try again.'],
		[404, 'Folder not found.'],
	]) {
		state.hooks.moveFolder = () => {
			throw new FolderError(message, status)
		}
		const r = await call(R.folder.PATCH, {
			method: 'PATCH',
			params: { id: f._id.toString() },
			body: { parentId: hex('e') },
		})
		eq(r.status, status)
		eq(r.json.error, message)
	}
})

await test('PATCH /folders/[id]: an unknown or foreign folder is 404 (never 403), even when only the response lookup fails', async () => {
	const r = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: hex('9') },
		body: { name: 'X' },
	})
	eq(r.status, 404)
	// the lib accepted the write (a race deleted it afterwards): the response lookup is the 404
	state.hooks.renameFolder = () => ({})
	const again = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: hex('9') },
		body: { name: 'X' },
	})
	eq(again.status, 404)
	eq(again.json.error, 'Folder not found.')
	// both-fields path checks existence up front, before any write
	state.calls.length = 0
	delete state.hooks.renameFolder
	const both = await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: hex('9') },
		body: { name: 'X', parentId: null },
	})
	eq(both.status, 404)
	assert(!libCalls().includes('renameFolder') && !libCalls().includes('moveFolder'), 'nothing written')
})

const BAD_IDS = [
	'123',
	'g'.repeat(24),
	'a'.repeat(23),
	'a'.repeat(25),
	'abcdefghijkl', // 12 chars: ObjectId.isValid accepts it, we must not
	'null',
	'undefined',
	'..',
	'%00',
	'$ne',
	'{"$ne":1}',
	' ' + 'a'.repeat(23),
	'a'.repeat(24) + '\n',
	'',
]

await test('PATCH/DELETE /folders/[id]: a malformed id is 404 "Folder not found." and never reaches the library', async () => {
	for (const id of BAD_IDS) {
		for (const [h, method, body] of [
			[R.folder.PATCH, 'PATCH', { name: 'X' }],
			[R.folder.DELETE, 'DELETE', undefined],
		]) {
			const r = await call(h, { method, params: { id }, body })
			eq(r.status, 404, `${method} ${JSON.stringify(id)}`)
			eq(r.json.error, 'Folder not found.')
		}
	}
	noLibCalls()
})

await test('PATCH /folders/[id]: invalid bodies are 400, nothing is written', async () => {
	const f = addFolder('A')
	const params = { id: f._id.toString() }
	const cases = {
		'empty object': {},
		'only unknown keys': { foo: 'bar' },
		'empty name': { name: '' },
		'blank name': { name: '  ' },
		'slash': { name: 'a/b' },
		'too long': { name: 'x'.repeat(81) },
		'name null': { name: null },
		'name object': { name: { $set: 1 } },
		'parent not an id': { parentId: 'root' },
		'parent empty string': { parentId: '' },
		'parent object': { parentId: { $ne: null } },
		'parent number': { parentId: 0 },
	}
	for (const [label, body] of Object.entries(cases)) {
		const r = await call(R.folder.PATCH, { method: 'PATCH', params, body })
		eq(r.status, 400, label)
		assert(typeof r.json.error === 'string' && r.json.error.length > 3, `${label}: message`)
	}
	for (const raw of ['', 'oops', '[]', 'null', '12']) {
		const r = await call(R.folder.PATCH, { method: 'PATCH', params, raw })
		eq(r.status, 400, `raw ${JSON.stringify(raw)}`)
	}
	noLibCalls()
})

await test('PATCH /folders/[id]: an empty patch explains itself rather than pretending to succeed', async () => {
	const f = addFolder('A')
	const r = await call(R.folder.PATCH, { method: 'PATCH', params: { id: f._id.toString() }, body: {} })
	eq(r.status, 400)
	eq(r.json.error, 'Nothing to change.')
})

await test('PATCH /folders/[id]: the account id reaches every library call', async () => {
	const p = addFolder('Clients')
	const f = addFolder('Old')
	await call(R.folder.PATCH, {
		method: 'PATCH',
		params: { id: f._id.toString() },
		body: { name: 'New', parentId: p._id.toString() },
	})
	assert(state.calls.length >= 3)
	for (const c of state.calls) eq(c.args[1].toString(), WS_HEX, `${c.fn} workspace`)
})

await test('DELETE /folders/[id]: asks for media.delete (not write), answers { moved } and passes ids as ObjectIds', async () => {
	const f = addFolder('Gone')
	const r = await call(R.folder.DELETE, { method: 'DELETE', params: { id: f._id.toString() } })
	eq(r.status, 200)
	eq(r.json, { moved: { assets: 3, folders: 1 } })
	eq(state.asked[0].permission, 'media.delete')
	assert(state.calls[0].args[2] instanceof ObjectId)
})

await test('DELETE /folders/[id]: a viewer-with-write but no delete permission is 403 and nothing is deleted', async () => {
	const f = addFolder('Keep')
	state.deny = 'media.delete'
	const r = await call(R.folder.DELETE, { method: 'DELETE', params: { id: f._id.toString() } })
	eq(r.status, 403)
	eq(state.folders.length, 1)
	noLibCalls()
})

await test('DELETE /folders/[id]: unknown folder is 404 from the library and a library error status passes through', async () => {
	let r = await call(R.folder.DELETE, { method: 'DELETE', params: { id: hex('7') } })
	eq(r.status, 404)
	state.hooks.deleteFolder = () => {
		throw new FolderError('Try again.', 409)
	}
	r = await call(R.folder.DELETE, { method: 'DELETE', params: { id: hex('7') } })
	eq(r.status, 409)
	eq(r.json.error, 'Try again.')
})

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */

const tagArgs = () => state.calls[0].args

await test('GET /tags: returns { tags } from listTagStats with no options when none are given', async () => {
	const r = await call(R.tags.GET, { path: '/tags' })
	eq(r.status, 200)
	eq(Object.keys(r.json), ['tags'])
	eq(r.json.tags[0].slug, 'kitchen')
	eq(tagArgs()[1].toString(), WS_HEX)
	eq(tagArgs()[2], {})
})

await test('GET /tags: q is trimmed and capped; an empty or blank q is omitted; q is only ever a plain string', async () => {
	const opts = async (query) => {
		state.calls.length = 0
		const r = await call(R.tags.GET, { path: `/tags?${query}` })
		eq(r.status, 200, query)
		return tagArgs()[2]
	}
	eq(await opts('q=kitch'), { q: 'kitch' })
	eq(await opts('q=%20%20kitch%20'), { q: 'kitch' })
	eq(await opts('q='), {})
	eq(await opts('q=%20%20'), {})
	eq((await opts(`q=${'x'.repeat(5000)}`)).q.length, 100)
	eq(await opts('q=a&q=b'), { q: 'a' }, 'first value wins')
	eq(await opts('q[$ne]=x'), {}, 'bracket syntax is not an object')
	eq(await opts('q=.*(%24ne'), { q: '.*($ne' }, 'regex characters pass as text')
})

await test('GET /tags: limit is clamped to 1..2000, junk falls back to the default (omitted)', async () => {
	const limit = async (v) => {
		state.calls.length = 0
		const r = await call(R.tags.GET, { path: `/tags?limit=${v}` })
		eq(r.status, 200, v)
		return tagArgs()[2].limit
	}
	eq(await limit('50'), 50)
	eq(await limit('1'), 1)
	eq(await limit('2000'), 2000)
	eq(await limit('2001'), 2000)
	eq(await limit('99999999999999999999'), 2000)
	eq(await limit('0'), 1)
	eq(await limit('-5'), 1)
	eq(await limit('12.9'), 12)
	eq(await limit('abc'), undefined)
	eq(await limit(''), undefined)
	eq(await limit('NaN'), undefined)
	eq(await limit('Infinity'), undefined)
	eq(await limit('1e3'), 1)
})

await test('GET /tags: a library failure 400 passes through (MediaError), nothing else is added', async () => {
	state.hooks.listTagStats = () => {
		throw new MediaError('Bad search.', 400)
	}
	const r = await call(R.tags.GET, { path: '/tags?q=x' })
	eq(r.status, 400)
	eq(r.json, { error: 'Bad search.' })
})

await test('PATCH /tags/[slug] rename: calls renameTag and answers { affected, slug, merged } from it', async () => {
	let r = await call(R.tag.PATCH, {
		method: 'PATCH',
		params: { slug: 'kitchen' },
		body: { label: 'Cooking Area' },
	})
	eq(r.status, 200)
	eq(r.json, { affected: 4, slug: 'cooking-area', merged: false })
	eq(libCalls(), ['renameTag'])
	eq(tagArgs().slice(2), ['kitchen', 'Cooking Area'])
	eq(tagArgs()[1].toString(), WS_HEX)

	// renaming onto an existing tag is a merge, and the response says so
	r = await call(R.tag.PATCH, {
		method: 'PATCH',
		params: { slug: 'kitchen' },
		body: { label: 'Existing' },
	})
	eq(r.json, { affected: 4, slug: 'existing', merged: true })
})

await test('PATCH /tags/[slug] rename: the label is trimmed by the schema and an invalid-label MediaError (400) passes through', async () => {
	await call(R.tag.PATCH, { method: 'PATCH', params: { slug: 'a' }, body: { label: '  Spaced  ' } })
	eq(tagArgs()[3], 'Spaced')
	state.hooks.renameTag = () => {
		throw new MediaError('That is not a valid tag name.', 400)
	}
	const r = await call(R.tag.PATCH, { method: 'PATCH', params: { slug: 'a' }, body: { label: '!!!' } })
	eq(r.status, 400)
	eq(r.json.error, 'That is not a valid tag name.')
})

await test('PATCH /tags/[slug] merge: calls mergeTag and answers { affected, slug: mergeInto, merged: true }', async () => {
	const r = await call(R.tag.PATCH, {
		method: 'PATCH',
		params: { slug: 'van' },
		body: { mergeInto: 'truck' },
	})
	eq(r.status, 200)
	eq(r.json, { affected: 7, slug: 'truck', merged: true })
	eq(libCalls(), ['mergeTag'])
	eq(tagArgs().slice(2), ['van', 'truck'])
})

await test('PATCH /tags/[slug] merge: mergeInto is normalised before use and in the response', async () => {
	const r = await call(R.tag.PATCH, {
		method: 'PATCH',
		params: { slug: 'van' },
		body: { mergeInto: '  Truck & Van!  ' },
	})
	eq(r.status, 200)
	eq(r.json.slug, 'truck-and-van')
	eq(tagArgs()[3], 'truck-and-van')
})

await test('PATCH /tags/[slug] merge: junk or self targets are 400 and nothing is merged', async () => {
	for (const mergeInto of ['!!!', '---', '   ', '???']) {
		const r = await call(R.tag.PATCH, { method: 'PATCH', params: { slug: 'van' }, body: { mergeInto } })
		eq(r.status, 400, JSON.stringify(mergeInto))
	}
	for (const mergeInto of ['van', 'VAN', ' Van ', 'v-a-n'.replace(/-/g, '')]) {
		const r = await call(R.tag.PATCH, { method: 'PATCH', params: { slug: 'van' }, body: { mergeInto } })
		eq(r.status, 400, `self ${JSON.stringify(mergeInto)}`)
		assert(/itself/.test(r.json.error), 'message says why')
	}
	noLibCalls()
})

await test('PATCH /tags/[slug]: the slug segment is decoded and normalised before use', async () => {
	const seen = async (slug) => {
		state.calls.length = 0
		const r = await call(R.tag.PATCH, { method: 'PATCH', params: { slug }, body: { mergeInto: 'target' } })
		eq(r.status, 200, slug)
		return tagArgs()[2]
	}
	eq(await seen('kitchen-remodel'), 'kitchen-remodel')
	eq(await seen('KITCHEN-Remodel'), 'kitchen-remodel')
	eq(await seen('Kitchen%20Remodel'), 'kitchen-remodel')
	eq(await seen('kitchen%2Dremodel'), 'kitchen-remodel')
	eq(await seen('Caf%C3%A9'), 'cafe')
	eq(await seen('%E6%97%A5%E6%9C%AC'), '日本')
	eq(await seen('日本'), '日本')
	eq(await seen('  padded  '), 'padded')
	eq(await seen('a'.repeat(60)), 'a'.repeat(60))
})

await test('/tags/[slug]: junk slugs are 404 "Tag not found." and never reach the library', async () => {
	const junk = [
		'!!!',
		'%21%21',
		'---',
		'%20%20',
		'   ',
		'.',
		'..',
		'%2e%2e',
		'%00',
		'%',
		'%E0%A4%A', // broken UTF-8 escape
		'%zz',
		'a'.repeat(61),
		'a'.repeat(5000),
		'%61'.repeat(100),
		'$ne',
		'{$ne:1}',
		'🙂',
		'',
	]
	for (const slug of junk) {
		for (const [h, method, body] of [
			[R.tag.PATCH, 'PATCH', { label: 'Fine' }],
			[R.tag.PATCH, 'PATCH', { mergeInto: 'fine' }],
			[R.tag.DELETE, 'DELETE', undefined],
		]) {
			const r = await call(h, { method, params: { slug }, body })
			// `$ne` slugifies to the legitimate tag `ne`; everything else is not a tag at all.
			if (slug === '$ne' || slug === '{$ne:1}') {
				assert(r.status === 200, `${method} ${slug} -> ${r.status}`)
				state.calls.length = 0
				continue
			}
			eq(r.status, 404, `${method} ${JSON.stringify(slug).slice(0, 40)}`)
			eq(r.json.error, 'Tag not found.')
		}
	}
	noLibCalls()
})

await test('PATCH /tags/[slug]: a slug at exactly 60 is fine, and a slug that only becomes long once decoded is rejected', async () => {
	let r = await call(R.tag.DELETE, { method: 'DELETE', params: { slug: 'b'.repeat(60) } })
	eq(r.status, 200)
	r = await call(R.tag.DELETE, { method: 'DELETE', params: { slug: 'b'.repeat(61) } })
	eq(r.status, 404)
	r = await call(R.tag.DELETE, { method: 'DELETE', params: { slug: '%62'.repeat(61) } })
	eq(r.status, 404)
})

await test('PATCH /tags/[slug]: invalid bodies are 400 with readable messages and nothing runs', async () => {
	const params = { slug: 'kitchen' }
	const cases = {
		'empty object': {},
		'both label and mergeInto': { label: 'A', mergeInto: 'b' },
		'only unknown keys': { name: 'A' },
		'blank label': { label: '   ' },
		'empty label': { label: '' },
		'label too long': { label: 'x'.repeat(41) },
		'label null': { label: null },
		'label number': { label: 5 },
		'label object': { label: { $ne: 1 } },
		'mergeInto empty': { mergeInto: '' },
		'mergeInto too long': { mergeInto: 'x'.repeat(61) },
		'mergeInto object': { mergeInto: { $ne: '' } },
		'mergeInto array': { mergeInto: ['a'] },
	}
	for (const [label, body] of Object.entries(cases)) {
		const r = await call(R.tag.PATCH, { method: 'PATCH', params, body })
		eq(r.status, 400, label)
		assert(typeof r.json.error === 'string' && r.json.error.length > 3, `${label}: message`)
	}
	const both = await call(R.tag.PATCH, { method: 'PATCH', params, body: { label: 'A', mergeInto: 'b' } })
	eq(both.json.error, 'Send either a new label or a tag to merge into.')
	for (const raw of ['', 'oops', '[]', 'null', '"x"']) {
		const r = await call(R.tag.PATCH, { method: 'PATCH', params, raw })
		eq(r.status, 400, `raw ${JSON.stringify(raw)}`)
	}
	noLibCalls()
})

await test('PATCH /tags/[slug]: label of exactly 40 and mergeInto of exactly 60 are accepted', async () => {
	let r = await call(R.tag.PATCH, { method: 'PATCH', params: { slug: 'a' }, body: { label: 'x'.repeat(40) } })
	eq(r.status, 200)
	r = await call(R.tag.PATCH, { method: 'PATCH', params: { slug: 'a' }, body: { mergeInto: 'y'.repeat(60) } })
	eq(r.status, 200)
})

await test('DELETE /tags/[slug]: asks for media.delete, answers { affected }, passes the normalised slug', async () => {
	const r = await call(R.tag.DELETE, { method: 'DELETE', params: { slug: 'Old%20Tag' } })
	eq(r.status, 200)
	eq(r.json, { affected: 2 })
	eq(state.asked[0].permission, 'media.delete')
	eq(tagArgs().slice(2), ['old-tag'])
	eq(tagArgs()[1].toString(), WS_HEX)
})

await test('DELETE /tags/[slug]: a role with write but not delete is 403 and the tag survives', async () => {
	state.deny = 'media.delete'
	const r = await call(R.tag.DELETE, { method: 'DELETE', params: { slug: 'kitchen' } })
	eq(r.status, 403)
	noLibCalls()
})

await test('tag routes: permission levels are view / write / delete as the table says', async () => {
	await call(R.tags.GET)
	await call(R.tag.PATCH, { method: 'PATCH', params: { slug: 'a' }, body: { label: 'B' } })
	await call(R.tag.DELETE, { method: 'DELETE', params: { slug: 'a' } })
	eq(state.asked.map((a) => a.permission), ['projects.view', 'media.upload', 'media.delete'])
})

/* -------------------------------------------------------------------------- */
/* Saved searches                                                             */
/* -------------------------------------------------------------------------- */

await test('GET /saved: newest first, only this account, DTO fields only', async () => {
	fake.seed(savedDoc({ name: 'Old', createdAt: new Date('2026-01-01T00:00:00Z') }))
	fake.seed(savedDoc({ name: 'New', createdAt: new Date('2026-03-01T00:00:00Z'), folder: hex('f'), sort: 'newest' }))
	fake.seed(savedDoc({ name: 'Mid', createdAt: new Date('2026-02-01T00:00:00Z') }))
	fake.seed(savedDoc({ name: 'Foreign', workspaceId: OTHER_WS, createdAt: new Date('2026-04-01T00:00:00Z') }))
	const r = await call(R.saved.GET)
	eq(r.status, 200)
	eq(Object.keys(r.json), ['saved'])
	eq(r.json.saved.map((s) => s.name), ['New', 'Mid', 'Old'])
	eq(Object.keys(r.json.saved[0]).sort(), ['createdAt', 'folder', 'id', 'name', 'query', 'sort'])
	eq(r.json.saved[0].createdAt, '2026-03-01T00:00:00.000Z')
	eq(r.json.saved[0].folder, hex('f'))
	assert(!r.text.includes('workspaceId') && !r.text.includes('createdBy'), 'no internal fields')
	const find = fake.log.find((l) => l.op === 'find')
	eq(String(find.filter.workspaceId), WS_HEX)
})

await test('GET /saved: an empty library is { saved: [] }', async () => {
	const r = await call(R.saved.GET)
	eq(r.json, { saved: [] })
})

await test('POST /saved: 201 { saved }, stored with the account, the user, trimmed text and null defaults', async () => {
	const r = await call(R.saved.POST, {
		method: 'POST',
		body: { name: '  Kitchen   ideas ', query: '  tag:kitchen color:blue  ' },
	})
	eq(r.status, 201)
	eq(Object.keys(r.json), ['saved'])
	const s = r.json.saved
	eq({ ...s, id: 'x', createdAt: 'x' }, {
		id: 'x', name: 'Kitchen ideas', query: 'tag:kitchen color:blue', folder: null, sort: null, createdAt: 'x',
	})
	assert(!Number.isNaN(Date.parse(s.createdAt)), 'createdAt is an ISO date')
	eq(fake.docs.length, 1)
	const doc = fake.docs[0]
	eq(String(doc.workspaceId), WS_HEX)
	eq(doc.createdBy, USER)
	eq(String(doc._id), s.id)
})

await test('POST /saved: folder id (that exists), unfiled, and sort are stored; folder-only searches are allowed', async () => {
	const f = addFolder('Clients')
	let r = await call(R.saved.POST, {
		method: 'POST',
		body: { name: 'A', query: 'x', folder: f._id.toString(), sort: 'oldest' },
	})
	eq(r.status, 201)
	eq(r.json.saved.folder, f._id.toString())
	eq(r.json.saved.sort, 'oldest')
	r = await call(R.saved.POST, { method: 'POST', body: { name: 'B', query: '', folder: 'unfiled' } })
	eq(r.status, 201)
	eq(r.json.saved.folder, 'unfiled')
	r = await call(R.saved.POST, { method: 'POST', body: { name: 'C', query: '', folder: f._id.toString() } })
	eq(r.status, 201)
	r = await call(R.saved.POST, { method: 'POST', body: { name: 'D', query: 'x', folder: null, sort: null } })
	eq(r.status, 201)
})

await test('POST /saved: a folder id that is not in this account is 400, and one in another account never validates', async () => {
	let r = await call(R.saved.POST, { method: 'POST', body: { name: 'A', query: 'x', folder: hex('1') } })
	eq(r.status, 400)
	eq(r.json.error, 'That folder no longer exists.')
	eq(fake.docs.length, 0)
	// "unfiled" needs no lookup
	state.calls.length = 0
	r = await call(R.saved.POST, { method: 'POST', body: { name: 'B', query: 'x', folder: 'unfiled' } })
	eq(r.status, 201)
	assert(!libCalls().includes('loadFolderIndex'))
})

await test('POST /saved: nothing to save (blank query and no folder) is 400', async () => {
	for (const body of [
		{ name: 'A', query: '' },
		{ name: 'A', query: '    ' },
		{ name: 'A', query: '\n\t ', folder: null },
		{ name: 'A', query: '', folder: null, sort: 'newest' },
	]) {
		const r = await call(R.saved.POST, { method: 'POST', body })
		eq(r.status, 400, JSON.stringify(body))
		eq(r.json.error, 'Type a search or choose a folder before saving.')
	}
	eq(fake.docs.length, 0)
})

await test('POST /saved: invalid bodies are 400 with readable messages and nothing is stored', async () => {
	const ok = { name: 'A', query: 'x' }
	const cases = {
		'missing name': { query: 'x' },
		'empty name': { ...ok, name: '' },
		'blank name': { ...ok, name: '   ' },
		'name 61 chars': { ...ok, name: 'n'.repeat(61) },
		'name control char': { ...ok, name: 'bad\u0007name' },
		'name NUL': { ...ok, name: 'a\u0000b' },
		'name number': { ...ok, name: 5 },
		'name object': { ...ok, name: { $ne: '' } },
		'name array': { ...ok, name: ['a'] },
		'missing query': { name: 'A' },
		'query 501 chars': { ...ok, query: 'q'.repeat(501) },
		'query object': { ...ok, query: { $ne: '' } },
		'query number': { ...ok, query: 5 },
		'query null': { ...ok, query: null },
		'folder garbage': { ...ok, folder: 'everything' },
		'folder 23 hex': { ...ok, folder: 'a'.repeat(23) },
		'folder object': { ...ok, folder: { $ne: null } },
		'folder empty': { ...ok, folder: '' },
		'sort garbage': { ...ok, sort: 'bogus' },
		'sort object': { ...ok, sort: { $ne: null } },
		'sort number': { ...ok, sort: 1 },
	}
	for (const [label, body] of Object.entries(cases)) {
		const r = await call(R.saved.POST, { method: 'POST', body })
		eq(r.status, 400, label)
		assert(typeof r.json.error === 'string' && r.json.error.length > 3, `${label}: message`)
	}
	for (const raw of ['', 'oops', '[]', 'null', '1']) {
		const r = await call(R.saved.POST, { method: 'POST', raw })
		eq(r.status, 400, `raw ${JSON.stringify(raw)}`)
	}
	eq(fake.docs.length, 0)
	eq(fake.log.filter((l) => l.op === 'insertOne').length, 0)
})

await test('POST /saved: whitespace inside a name (newline, tab) is collapsed to one space, not rejected', async () => {
	const r = await call(R.saved.POST, { method: 'POST', body: { name: 'a\n\tb', query: 'x' } })
	eq(r.status, 201)
	eq(r.json.saved.name, 'a b')
})

await test('POST /saved: a 60-character name and a 500-character query are accepted', async () => {
	const r = await call(R.saved.POST, {
		method: 'POST',
		body: { name: 'n'.repeat(60), query: 'q'.repeat(500) },
	})
	eq(r.status, 201)
})

await test('POST /saved: hostile extra keys (_id, workspaceId, createdBy) are ignored', async () => {
	const evil = hex('d')
	const r = await call(R.saved.POST, {
		method: 'POST',
		body: { name: 'A', query: 'x', _id: evil, workspaceId: OTHER_WS.toString(), createdBy: 'evil', createdAt: '2000-01-01' },
	})
	eq(r.status, 201)
	const doc = fake.docs[0]
	assert(String(doc._id) !== evil, '_id is generated here')
	eq(String(doc.workspaceId), WS_HEX)
	eq(doc.createdBy, USER)
	assert(doc.createdAt.getFullYear() >= 2026, 'createdAt is the server clock')
})

await test('POST /saved: names are unique case-insensitively within the account (409), whatever the spelling trick', async () => {
	fake.seed(savedDoc({ name: 'Kitchen Ideas' }))
	for (const name of [
		'Kitchen Ideas',
		'kitchen ideas',
		'KITCHEN IDEAS',
		'  kitchen ideas  ',
		'Kitchen    Ideas',
		'Kitchen\tIdeas',
		'KİTCHEN IDEAS'.replace('İ', 'i'),
	]) {
		const r = await call(R.saved.POST, { method: 'POST', body: { name, query: 'x' } })
		eq(r.status, 409, JSON.stringify(name))
		eq(r.json.error, 'A saved search with that name already exists.')
	}
	eq(fake.docs.length, 1, 'nothing was added')
	// a genuinely different name is fine
	const r = await call(R.saved.POST, { method: 'POST', body: { name: 'Kitchen Idea', query: 'x' } })
	eq(r.status, 201)
})

await test('POST /saved: case-insensitivity covers non-ASCII, and regex characters in a name are plain text', async () => {
	fake.seed(savedDoc({ name: 'Äpfel & Ölbäume' }))
	fake.seed(savedDoc({ name: 'abc' }))
	let r = await call(R.saved.POST, { method: 'POST', body: { name: 'äpfel & ölbäume', query: 'x' } })
	eq(r.status, 409)
	r = await call(R.saved.POST, { method: 'POST', body: { name: '.*', query: 'x' } })
	eq(r.status, 201, '".*" must not match "abc"')
	r = await call(R.saved.POST, { method: 'POST', body: { name: '^abc$', query: 'x' } })
	eq(r.status, 201)
	r = await call(R.saved.POST, { method: 'POST', body: { name: 'ABC', query: 'x' } })
	eq(r.status, 409)
})

await test('POST /saved: the same name in another account is not a clash', async () => {
	fake.seed(savedDoc({ name: 'Shared', workspaceId: OTHER_WS }))
	const r = await call(R.saved.POST, { method: 'POST', body: { name: 'shared', query: 'x' } })
	eq(r.status, 201)
})

await test('POST /saved: the cap is 50 per account: the 51st is 409 with a clear message; other accounts do not count', async () => {
	for (let i = 0; i < 49; i++) fake.seed(savedDoc({ name: `S${i}`, createdAt: new Date(2026, 0, 1, 0, i) }))
	for (let i = 0; i < 80; i++) fake.seed(savedDoc({ name: `O${i}`, workspaceId: OTHER_WS }))
	let r = await call(R.saved.POST, { method: 'POST', body: { name: 'Number fifty', query: 'x' } })
	eq(r.status, 201, 'the 50th is allowed')
	r = await call(R.saved.POST, { method: 'POST', body: { name: 'Number fifty one', query: 'x' } })
	eq(r.status, 409)
	assert(r.json.error.includes('50'), `message names the limit: ${r.json.error}`)
	assert(/delete/i.test(r.json.error), 'message says what to do')
	eq(fake.docs.filter((d) => String(d.workspaceId) === WS_HEX).length, 50)
	// a duplicate name at the cap says the cap (the more fundamental problem) without writing
	eq(fake.log.filter((l) => l.op === 'insertOne').length, 1)
})

await test('POST /saved race: two requests that both passed the checks leave exactly one name (the earlier one wins)', async () => {
	// our request inserts; a twin with the same name but EARLIER createdAt appears at the same moment
	fake.setOnInsert((docs) => {
		fake.setOnInsert(null)
		docs.push(savedDoc({ name: 'KITCHEN', createdAt: new Date(0) }))
	})
	let r = await call(R.saved.POST, { method: 'POST', body: { name: 'kitchen', query: 'x' } })
	eq(r.status, 409)
	eq(r.json.error, 'A saved search with that name already exists.')
	eq(fake.docs.length, 1, 'ours removed itself, the twin remains')
	eq(fake.docs[0].name, 'KITCHEN')
	// the twin is LATER: we win and keep our row
	reset()
	fake.setOnInsert((docs) => {
		fake.setOnInsert(null)
		docs.push(savedDoc({ name: 'KITCHEN', createdAt: new Date(Date.now() + 60_000) }))
	})
	r = await call(R.saved.POST, { method: 'POST', body: { name: 'kitchen', query: 'x' } })
	eq(r.status, 201)
	assert(fake.docs.some((d) => d.name === 'kitchen'), 'ours kept')
})

await test('POST /saved race: concurrent requests at 49 saved leave at most 50, the later one backs out with 409', async () => {
	for (let i = 0; i < 49; i++) fake.seed(savedDoc({ name: `S${i}`, createdAt: new Date(2026, 0, 1, 0, i) }))
	fake.setOnInsert((docs) => {
		fake.setOnInsert(null)
		docs.push(savedDoc({ name: 'Raced', createdAt: new Date(0) }))
	})
	const r = await call(R.saved.POST, { method: 'POST', body: { name: 'Ours', query: 'x' } })
	eq(r.status, 409)
	assert(r.json.error.includes('50'))
	eq(fake.docs.length, 50)
	assert(!fake.docs.some((d) => d.name === 'Ours'), 'ours removed')
	// the rollback delete is scoped like everything else
	const del = fake.log.find((l) => l.op === 'deleteOne')
	eq(String(del.filter.workspaceId), WS_HEX)
})

await test('POST /saved: every data call carries the account id (find, insert, rollback)', async () => {
	await call(R.saved.POST, { method: 'POST', body: { name: 'A', query: 'x' } })
	for (const l of fake.log)
		if (l.op === 'find' || l.op === 'deleteOne')
			eq(String(l.filter.workspaceId), WS_HEX, l.op)
		else eq(String(l.doc.workspaceId), WS_HEX, l.op)
})

await test('DELETE /saved/[id]: asks for write, deletes only this account\'s document, answers { ok: true }', async () => {
	const mine = savedDoc({ name: 'Mine' })
	const other = savedDoc({ name: 'Other', workspaceId: OTHER_WS })
	fake.seed(mine)
	fake.seed(other)
	const r = await call(R.savedOne.DELETE, { method: 'DELETE', params: { id: mine._id.toString() } })
	eq(r.status, 200)
	eq(r.json, { ok: true })
	eq(state.asked[0].permission, 'media.upload')
	eq(fake.docs.map((d) => d.name), ['Other'])
	const del = fake.log.find((l) => l.op === 'deleteOne')
	eq(Object.keys(del.filter).sort(), ['_id', 'workspaceId'])
	eq(String(del.filter.workspaceId), WS_HEX)
	assert(del.filter._id instanceof ObjectId, '_id is an ObjectId, not a string')
})

await test('DELETE /saved/[id]: another account\'s saved search is 404 (not 403) and survives; so does an unknown id and a repeat', async () => {
	const other = savedDoc({ name: 'Other', workspaceId: OTHER_WS })
	fake.seed(other)
	let r = await call(R.savedOne.DELETE, { method: 'DELETE', params: { id: other._id.toString() } })
	eq(r.status, 404)
	eq(r.json.error, 'Saved search not found.')
	eq(fake.docs.length, 1, 'untouched')
	r = await call(R.savedOne.DELETE, { method: 'DELETE', params: { id: hex('4') } })
	eq(r.status, 404)
	const mine = savedDoc({ name: 'Mine' })
	fake.seed(mine)
	eq((await call(R.savedOne.DELETE, { method: 'DELETE', params: { id: mine._id.toString() } })).status, 200)
	eq((await call(R.savedOne.DELETE, { method: 'DELETE', params: { id: mine._id.toString() } })).status, 404, 'second delete')
})

await test('DELETE /saved/[id]: a malformed id is 404 and never reaches the database', async () => {
	for (const id of BAD_IDS) {
		const r = await call(R.savedOne.DELETE, { method: 'DELETE', params: { id } })
		eq(r.status, 404, JSON.stringify(id))
		eq(r.json.error, 'Saved search not found.')
	}
	eq(fake.log.length, 0, 'no database call')
})

await test('DELETE /saved/[id]: a role that cannot write is 403 and the document survives', async () => {
	const mine = savedDoc()
	fake.seed(mine)
	state.deny = 'media.upload'
	const r = await call(R.savedOne.DELETE, { method: 'DELETE', params: { id: mine._id.toString() } })
	eq(r.status, 403)
	eq(fake.docs.length, 1)
	eq(fake.log.length, 0)
})

await test('saved routes: permission levels are view / write / write as the table says', async () => {
	await call(R.saved.GET)
	await call(R.saved.POST, { method: 'POST', body: { name: 'A', query: 'x' } })
	await call(R.savedOne.DELETE, { method: 'DELETE', params: { id: hex('4') } })
	eq(state.asked.map((a) => a.permission), ['projects.view', 'media.upload', 'media.upload'])
})

await test('a viewer (view only) cannot POST or DELETE saved searches, create folders or rename tags', async () => {
	state.deny = 'media.upload'
	for (const [h, o] of [
		[R.saved.POST, { method: 'POST', body: { name: 'A', query: 'x' } }],
		[R.savedOne.DELETE, { method: 'DELETE', params: { id: hex('4') } }],
		[R.folders.POST, { method: 'POST', body: { name: 'A', parentId: null } }],
		[R.folder.PATCH, { method: 'PATCH', params: { id: hex('4') }, body: { name: 'A' } }],
		[R.tag.PATCH, { method: 'PATCH', params: { slug: 'a' }, body: { label: 'B' } }],
	])
		eq((await call(h, o)).status, 403)
	noLibCalls()
	eq(fake.log.length, 0)
})

console.error = originalError
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
