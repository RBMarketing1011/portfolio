/**
 * Proves the media library's folder operations and its cached vocabulary
 * against the real database: `node --env-file=.env scripts/prove-media-folders.mjs`.
 *
 * Every run uses fresh workspace ids and only ever touches documents carrying
 * them (mediaFolders and mediaAssets); all of it is deleted in a `finally`.
 * No indexes are created or dropped: the unique sibling-name index must already
 * exist (scripts/ensure-indexes.mjs), and the proof says so if it does not.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const { MongoClient, ObjectId } = rootRequire('mongodb')

const uri = process.env.MONGODB_URI
if (!uri) {
	console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/prove-media-folders.mjs')
	process.exit(1)
}

const F = loadTs('src/lib/media/folders.ts')
const V = loadTs('src/lib/media/vocabulary.ts')
const { folderKey, buildFolderIndex } = loadTs('src/lib/media/folder-index.ts')
const { MEDIA_LIMITS } = loadTs('src/lib/media/types.ts')
const { FolderError } = F
const { MediaError } = loadTs('src/lib/media/errors.ts')
const MAX_DEPTH = MEDIA_LIMITS.maxFolderDepth - 1

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
const only = process.env.PROVE_ONLY ? new RegExp(process.env.PROVE_ONLY, 'i') : null
async function check(name, fn) {
	if (only && !only.test(name)) return
	try {
		await fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		const detail = (error && error.message ? error.message : String(error)).split('\n').slice(0, 6).join(' | ')
		console.log(`FAIL  ${name} (${detail})`)
	}
}
const section = (title) => console.log(`\n== ${title}`)

const client = new MongoClient(uri)
const workspaces = []
const newWs = () => {
	const id = new ObjectId()
	workspaces.push(id)
	return id
}

let db
let folderCol
let assetCol

const mkFolder = async (ws, name, parentId = null, extra = {}) => {
	const doc = {
		_id: new ObjectId(),
		workspaceId: ws,
		parentId,
		name,
		nameKey: folderKey(name),
		createdBy: 'seed',
		createdAt: new Date(),
		updatedAt: new Date(),
		...extra,
	}
	await folderCol.insertOne(doc)
	return doc
}

const assetDoc = (ws, folderId, extra = {}) => ({
	_id: new ObjectId(),
	workspaceId: ws,
	folderId,
	name: 'img',
	nameKey: 'img',
	filename: 'img.png',
	url: 'https://example.invalid/img.png',
	pathname: `proof/${new ObjectId()}`,
	bytes: 100,
	tags: [],
	terms: [],
	rev: 0,
	createdAt: new Date(),
	updatedAt: new Date(),
	...extra,
})
const mkAssets = async (ws, folderId, n, extra = {}) => {
	if (!n) return []
	const docs = Array.from({ length: n }, () => assetDoc(ws, folderId, extra))
	await assetCol.insertMany(docs)
	return docs
}

/** The same db with every call recorded, and a hook that can delay or fail any of them. */
function spyDb(real, hook = () => {}) {
	const events = []
	const counts = new Map()
	const next = (coll, method) => {
		const key = `${coll}.${method}`
		const n = (counts.get(key) ?? 0) + 1
		counts.set(key, n)
		return n
	}
	const wrap = (name) => {
		const target = real.collection(name)
		return new Proxy(target, {
			get(t, prop) {
				const value = Reflect.get(t, prop)
				if (typeof value !== 'function' || typeof prop !== 'string') return value
				if (prop === 'find' || prop === 'aggregate') {
					return (...args) => {
						const cursor = value.apply(t, args)
						const n = next(name, prop)
						return new Proxy(cursor, {
							get(c, p) {
								const inner = Reflect.get(c, p)
								if (p === 'toArray')
									return async () => {
										const ev = { coll: name, method: prop, n, args }
										events.push({ ...ev, phase: 'before' })
										await hook({ ...ev, phase: 'before' })
										const result = await c.toArray()
										events.push({ ...ev, phase: 'after' })
										await hook({ ...ev, phase: 'after', result })
										return result
									}
								return typeof inner === 'function' ? inner.bind(c) : inner
							},
						})
					}
				}
				return async (...args) => {
					const ev = { coll: name, method: prop, n: next(name, prop), args }
					events.push({ ...ev, phase: 'before' })
					await hook({ ...ev, phase: 'before' })
					const result = await value.apply(t, args)
					events.push({ ...ev, phase: 'after' })
					await hook({ ...ev, phase: 'after', result })
					return result
				}
			},
		})
	}
	return { collection: wrap, events, counts }
}

const is = (ev, coll, method, n, phase = 'before') =>
	ev.coll === coll && ev.method === method && ev.n === n && ev.phase === phase

/** A one-shot gate: `wait()` blocks until `open()`. */
function gate() {
	let open
	const promise = new Promise((resolve) => (open = resolve))
	return { wait: () => promise, open }
}
/** Releases everyone once `parties` have arrived. */
function barrier(parties) {
	let arrived = 0
	const g = gate()
	return async () => {
		if (++arrived >= parties) g.open()
		await g.wait()
	}
}

async function expectError(fn, status, label = '') {
	let thrown
	try {
		await fn()
	} catch (error) {
		thrown = error
	}
	assert.ok(thrown, `${label} should have thrown`)
	assert.ok(thrown instanceof FolderError, `${label} threw ${thrown?.name}: ${thrown?.message}`)
	assert.ok(thrown instanceof MediaError, 'FolderError extends MediaError')
	assert.equal(thrown.status, status, `${label} status (${thrown.message})`)
	return thrown
}

const create = (ws, name, parentId = null, d = db) =>
	F.createFolder(d, ws, 'proof-user', { name, parentId })

const docsOf = (ws) => folderCol.find({ workspaceId: ws }).toArray()
const byName = async (ws, name, parentId) =>
	(await docsOf(ws)).find((d) => d.name === name && String(d.parentId) === String(parentId ?? null))
const pathsOf = async (ws) => (await F.loadFolderIndex(db, ws)).ordered().map((n) => n.path)

/** Everything a consistent tree promises, checked on the raw documents. */
async function soundness(ws) {
	const problems = []
	const docs = await docsOf(ws)
	const byId = new Map(docs.map((d) => [String(d._id), d]))
	const seenKeys = new Set()
	for (const d of docs) {
		if (d.parentId && !byId.has(String(d.parentId))) problems.push(`orphan ${d.name}`)
		const key = `${d.parentId}|${d.nameKey}`
		if (seenKeys.has(key)) problems.push(`duplicate sibling key ${d.name}`)
		seenKeys.add(key)
		if (d.nameKey !== folderKey(d.name) && !d.name.startsWith('legacy')) problems.push(`nameKey drift ${d.name}`)
		const seen = new Set([String(d._id)])
		let cursor = d.parentId ? byId.get(String(d.parentId)) : null
		while (cursor) {
			if (seen.has(String(cursor._id))) {
				problems.push(`cycle through ${d.name}`)
				break
			}
			seen.add(String(cursor._id))
			cursor = cursor.parentId ? byId.get(String(cursor.parentId)) : null
		}
	}
	const assets = await assetCol.find({ workspaceId: ws }).toArray()
	for (const a of assets)
		if (a.folderId && !byId.has(String(a.folderId))) problems.push(`asset ${a._id} points at a missing folder`)
	return problems
}
const assertSound = async (ws) => assert.deepEqual(await soundness(ws), [])

const hasCycle = async (ws) => (await soundness(ws)).some((p) => p.startsWith('cycle'))

/* -------------------------------------------------------------------------- */

async function main() {
	await client.connect()
	db = client.db()
	folderCol = db.collection('mediaFolders')
	assetCol = db.collection('mediaAssets')

	const indexes = await folderCol.indexes().catch(() => [])
	const unique = indexes.find(
		(i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ workspaceId: 1, parentId: 1, nameKey: 1 }),
	)
	if (!unique) {
		console.log('FAIL  unique sibling index { workspaceId, parentId, nameKey } is missing; run scripts/ensure-indexes.mjs')
		process.exit(1)
	}
	console.log('PASS  unique sibling index exists on mediaFolders')
	passed++

	/* ---------------------------------------------------------------------- */
	section('create: shape and validation')

	await check('creates a top-level folder with the documented shape', async () => {
		const ws = newWs()
		const doc = await create(ws, '  Clients  ')
		assert.equal(doc.name, 'Clients')
		assert.equal(doc.nameKey, folderKey('Clients'))
		assert.equal(doc.parentId, null)
		assert.equal(doc.createdBy, 'proof-user')
		assert.ok(doc.createdAt instanceof Date && doc.updatedAt instanceof Date)
		const stored = await folderCol.findOne({ _id: doc._id })
		assert.equal(stored.parentId, null, 'parentId stored as an explicit null')
		assert.ok(stored.workspaceId.equals(ws))
		assert.equal(stored.name, 'Clients')
	})

	await check('creates nested folders and reports paths and depths', async () => {
		const ws = newWs()
		const a = await create(ws, 'Clients')
		const b = await create(ws, 'Acme', a._id)
		const c = await create(ws, 'Hero', b._id)
		assert.deepEqual(await pathsOf(ws), ['Clients', 'Clients/Acme', 'Clients/Acme/Hero'])
		const index = await F.loadFolderIndex(db, ws)
		assert.equal(index.depthOf(String(c._id)), 2)
	})

	const hostileNames = [
		['empty', ''],
		['spaces', '    '],
		['tabs and newlines', '\t\n \r'],
		['forward slash', 'a/b'],
		['leading slash', '/a'],
		['backslash', 'a\\b'],
		['NUL', 'a\u0000b'],
		['control char', 'a\u0001b'],
		['DEL', 'a\u007fb'],
		['zero-width only', '​'],
		['invisible mix', '​  ⁠'],
		['lone high surrogate', '\ud83d'],
		['lone surrogate inside text', 'a\ud83db'],
		['lone low surrogate', '\udc00x'],
		['too long (81)', 'x'.repeat(MEDIA_LIMITS.folderNameMax + 1)],
		['null', null],
		['undefined', undefined],
		['number', 5],
		['object', { $gt: '' }],
		['array', ['a']],
	]
	for (const [label, value] of hostileNames)
		await check(`create rejects ${label} with 400 and writes nothing`, async () => {
			const ws = newWs()
			await expectError(() => create(ws, value), 400, label)
			assert.equal((await docsOf(ws)).length, 0)
		})

	await check('create accepts exactly folderNameMax characters, and names that look like operators or paths', async () => {
		const ws = newWs()
		const ok = ['x'.repeat(MEDIA_LIMITS.folderNameMax), '$ne', '{"$gt":""}', '.', '..', 'a.b', '__proto__', 'constructor', 'a%2Fb', '  padded  ']
		for (const name of ok) await create(ws, name)
		const docs = await docsOf(ws)
		assert.equal(docs.length, ok.length)
		assert.ok(docs.some((d) => d.name === '__proto__'))
		assert.ok(docs.some((d) => d.name === 'padded'), 'trimmed')
	})

	await check('create: parent not found is 404 (missing, other workspace, malformed, operator object)', async () => {
		const ws = newWs()
		const other = newWs()
		const foreign = await mkFolder(other, 'Theirs')
		await expectError(() => create(ws, 'x', new ObjectId()), 404, 'missing parent')
		await expectError(() => create(ws, 'x', foreign._id), 404, 'foreign parent')
		await expectError(() => create(ws, 'x', 'not-an-id'), 404, 'malformed parent')
		await expectError(() => create(ws, 'x', { $ne: null }), 404, 'operator object parent')
		await expectError(() => create(ws, 'x', 12), 404, 'number parent')
		assert.equal((await docsOf(ws)).length, 0)
		assert.equal((await docsOf(other)).length, 1, 'the other workspace is untouched')
	})

	await check('create accepts a 24-hex string parent id (re-parsed, not trusted)', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const child = await create(ws, 'B', String(a._id))
		assert.ok(child.parentId.equals(a._id))
	})

	/* ---------------------------------------------------------------------- */
	section('sibling uniqueness')

	await check('case, accent, punctuation and width variants collide as siblings (409)', async () => {
		const ws = newWs()
		await create(ws, 'Photos')
		for (const variant of ['photos', 'PHOTOS ', 'Phótos', 'Photos!', 'photos.', '  ph-otos'.replace('ph-otos', 'Photos'), 'ＰＨＯＴＯＳ', 'Phótos'])
			await expectError(() => create(ws, variant), 409, JSON.stringify(variant))
		assert.equal((await docsOf(ws)).length, 1)
	})

	await check('inner whitespace and separators collapse: "Photo  Shoot" = "photo-shoot" = "Photo/Shoot is invalid"', async () => {
		const ws = newWs()
		await create(ws, 'Photo Shoot')
		await expectError(() => create(ws, 'photo  shoot'), 409)
		await expectError(() => create(ws, 'Photo-Shoot'), 409)
		await expectError(() => create(ws, 'Photo_Shoot'), 409)
		await create(ws, 'Photoshoot') // different words, different key
	})

	await check('the same name under different parents (and at the top level) is fine', async () => {
		const ws = newWs()
		const a = await create(ws, 'A')
		const b = await create(ws, 'B')
		await create(ws, 'Hero', a._id)
		await create(ws, 'Hero', b._id)
		await create(ws, 'Hero')
		await create(ws, 'A', a._id)
		await expectError(() => create(ws, 'hero', a._id), 409)
	})

	await check('non-Latin and symbol-only names are distinct siblings and do not 409 each other', async () => {
		const ws = newWs()
		const names = ['日本', '東京', 'Фото', 'Фото 2', '😀', '😂', '!!!', '???', '!!!!', 'العربية', 'ไทย', 'Ελλάδα']
		for (const name of names) await create(ws, name)
		assert.equal((await docsOf(ws)).length, names.length)
		await assertSound(ws)
	})

	await check('non-Latin repeats still collide (case-folded, normalised)', async () => {
		const ws = newWs()
		await create(ws, 'Фото')
		await create(ws, '日本')
		await create(ws, '!!!')
		await create(ws, '😀')
		await expectError(() => create(ws, 'фото'), 409, 'cyrillic case')
		await expectError(() => create(ws, 'ФОТО!'), 409, 'cyrillic punctuation')
		await expectError(() => create(ws, '日本'), 409, 'cjk repeat')
		await expectError(() => create(ws, '!!!'), 409, 'punctuation-only repeat')
		await expectError(() => create(ws, '😀'), 409, 'emoji repeat')
		await create(ws, '😂')
	})

	await check('the stored nameKey is the imported folderKey, and a legacy stored key is respected, never recomputed', async () => {
		const ws = newWs()
		const legacy = await mkFolder(ws, 'legacy name', null, { nameKey: 'legacy-key' })
		const target = await mkFolder(ws, 'Target')
		const moved = await F.moveFolder(db, ws, legacy._id, target._id)
		assert.equal(moved.nameKey, 'legacy-key', 'move leaves nameKey alone')
		const same = await F.renameFolder(db, ws, legacy._id, 'legacy name')
		assert.equal(same.nameKey, 'legacy-key', 'no-op rename leaves nameKey alone')
		const renamed = await F.renameFolder(db, ws, legacy._id, 'Fresh Name')
		assert.equal(renamed.nameKey, folderKey('Fresh Name'))
	})

	await check('workspaces are independent: the same names in two workspaces never collide', async () => {
		const a = newWs()
		const b = newWs()
		await create(a, 'Shared')
		await create(b, 'Shared')
	})

	/* ---------------------------------------------------------------------- */
	section('races on the unique index')

	await check('10 concurrent creates of one name: exactly one wins, the rest are 409', async () => {
		const ws = newWs()
		const results = await Promise.allSettled(Array.from({ length: 10 }, () => create(ws, 'Race')))
		const wins = results.filter((r) => r.status === 'fulfilled')
		const losses = results.filter((r) => r.status === 'rejected')
		assert.equal(wins.length, 1, `wins: ${wins.length}`)
		assert.equal(losses.length, 9)
		for (const loss of losses) {
			assert.ok(loss.reason instanceof FolderError, String(loss.reason))
			assert.equal(loss.reason.status, 409)
		}
		assert.equal((await docsOf(ws)).length, 1)
	})

	await check('10 concurrent creates of case/accent variants under one parent: one winner', async () => {
		const ws = newWs()
		const parent = await mkFolder(ws, 'Parent')
		const names = ['Race', 'race', 'RACE', 'Rácé', 'race!', 'Race ', ' race', 'rAcE', 'RACE.', 'ráce']
		const results = await Promise.allSettled(names.map((n) => create(ws, n, parent._id)))
		assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
		for (const r of results)
			if (r.status === 'rejected') assert.equal(r.reason.status, 409, String(r.reason))
		assert.equal((await docsOf(ws)).length, 2)
	})

	await check('10 concurrent creates of DIFFERENT names all succeed (no false conflicts)', async () => {
		const ws = newWs()
		const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => create(ws, `Name ${i}`)))
		assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10, JSON.stringify(results.filter((r) => r.status === 'rejected').map((r) => String(r.reason))))
		await assertSound(ws)
	})

	await check('two concurrent renames onto one name: one wins, one 409', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const b = await mkFolder(ws, 'B')
		const results = await Promise.allSettled([F.renameFolder(db, ws, a._id, 'Same'), F.renameFolder(db, ws, b._id, 'same')])
		assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
		const lost = results.find((r) => r.status === 'rejected')
		assert.equal(lost.reason.status, 409)
		await assertSound(ws)
	})

	await check('two concurrent moves into one parent with the same name: one wins, one 409', async () => {
		const ws = newWs()
		const x = await mkFolder(ws, 'X')
		const y = await mkFolder(ws, 'Y')
		const a = await mkFolder(ws, 'Same', x._id)
		const b = await mkFolder(ws, 'Same', y._id)
		const dest = await mkFolder(ws, 'Dest')
		const results = await Promise.allSettled([F.moveFolder(db, ws, a._id, dest._id), F.moveFolder(db, ws, b._id, dest._id)])
		assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
		assert.equal(results.find((r) => r.status === 'rejected').reason.status, 409)
		await assertSound(ws)
	})

	/* ---------------------------------------------------------------------- */
	section('rename')

	await check('rename changes name and nameKey, keeps createdAt, bumps updatedAt, keeps children and assets', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'Old', null, { updatedAt: new Date(2020, 1, 1) })
		const child = await mkFolder(ws, 'Child', a._id)
		const [asset] = await mkAssets(ws, a._id, 1)
		const renamed = await F.renameFolder(db, ws, a._id, '  New Name ')
		assert.equal(renamed.name, 'New Name')
		assert.equal(renamed.nameKey, folderKey('New Name'))
		assert.ok(renamed.updatedAt > a.updatedAt)
		assert.equal(+renamed.createdAt, +a.createdAt)
		assert.deepEqual(await pathsOf(ws), ['New Name', 'New Name/Child'])
		assert.ok((await assetCol.findOne({ _id: asset._id })).folderId.equals(a._id))
		assert.ok((await folderCol.findOne({ _id: child._id })).parentId.equals(a._id))
	})

	await check('renaming to the same name is a no-op, not a conflict (and writes nothing)', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'Same', null, { updatedAt: new Date(2020, 1, 1) })
		const spy = spyDb(db)
		const result = await F.renameFolder(spy, ws, a._id, ' Same ')
		assert.equal(result.name, 'Same')
		assert.equal(+result.updatedAt, +a.updatedAt, 'updatedAt untouched')
		assert.ok(!spy.events.some((e) => ['updateOne', 'findOneAndUpdate', 'updateMany'].includes(e.method)))
	})

	await check('a case-only or punctuation-only rename of the folder itself is allowed', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'photos')
		const up = await F.renameFolder(db, ws, a._id, 'Photos')
		assert.equal(up.name, 'Photos')
		const punct = await F.renameFolder(db, ws, a._id, 'Photos!')
		assert.equal(punct.name, 'Photos!')
		assert.equal(punct.nameKey, 'photos')
	})

	await check('rename to a sibling variant is 409; the same name under another parent is fine', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		await mkFolder(ws, 'Taken', p._id)
		const mine = await mkFolder(ws, 'Mine', p._id)
		const elsewhere = await mkFolder(ws, 'Else')
		await expectError(() => F.renameFolder(db, ws, mine._id, 'taken'), 409)
		await expectError(() => F.renameFolder(db, ws, mine._id, 'Tàken!'), 409)
		await F.renameFolder(db, ws, elsewhere._id, 'Taken')
		assert.equal((await folderCol.findOne({ _id: mine._id })).name, 'Mine', 'unchanged after the 409')
	})

	await check('rename: 400 for bad names, 404 for missing, foreign or malformed ids', async () => {
		const ws = newWs()
		const other = newWs()
		const a = await mkFolder(ws, 'A')
		const theirs = await mkFolder(other, 'Theirs')
		for (const bad of ['', '   ', 'a/b', 'a\\b', 'x'.repeat(81), '​', null, 7])
			await expectError(() => F.renameFolder(db, ws, a._id, bad), 400, JSON.stringify(bad))
		await expectError(() => F.renameFolder(db, ws, new ObjectId(), 'ok'), 404, 'missing')
		await expectError(() => F.renameFolder(db, ws, theirs._id, 'Hijacked'), 404, 'foreign')
		await expectError(() => F.renameFolder(db, ws, 'zzz', 'ok'), 404, 'malformed')
		await expectError(() => F.renameFolder(db, ws, { $ne: null }, 'ok'), 404, 'operator')
		assert.equal((await folderCol.findOne({ _id: theirs._id })).name, 'Theirs')
		assert.equal((await folderCol.findOne({ _id: a._id })).name, 'A')
	})

	await check('a rename of a folder deleted mid-flight answers 404 and does not resurrect it', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const spy = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'findOneAndUpdate', 1)) await folderCol.deleteOne({ _id: a._id })
		})
		await expectError(() => F.renameFolder(spy, ws, a._id, 'B'), 404)
		assert.equal((await docsOf(ws)).length, 0)
	})

	/* ---------------------------------------------------------------------- */
	section('move')

	await check('moves into another folder, to the top level, and reports the new path', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const b = await mkFolder(ws, 'B')
		const c = await mkFolder(ws, 'C', a._id)
		const [asset] = await mkAssets(ws, c._id, 1)
		const moved = await F.moveFolder(db, ws, c._id, b._id)
		assert.ok(moved.parentId.equals(b._id))
		assert.deepEqual(await pathsOf(ws), ['A', 'B', 'B/C'])
		const top = await F.moveFolder(db, ws, c._id, null)
		assert.equal(top.parentId, null)
		assert.deepEqual(await pathsOf(ws), ['A', 'B', 'C'])
		assert.ok((await assetCol.findOne({ _id: asset._id })).folderId.equals(c._id), 'assets stay in the folder')
	})

	await check('moving a folder carries its whole subtree', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const b = await mkFolder(ws, 'B', a._id)
		await mkFolder(ws, 'C', b._id)
		const dest = await mkFolder(ws, 'Dest')
		await F.moveFolder(db, ws, a._id, dest._id)
		assert.deepEqual(await pathsOf(ws), ['Dest', 'Dest/A', 'Dest/A/B', 'Dest/A/B/C'])
	})

	await check('moving to the current parent is a no-op that writes nothing', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const b = await mkFolder(ws, 'B', a._id, { updatedAt: new Date(2020, 1, 1) })
		const spy = spyDb(db)
		const same = await F.moveFolder(spy, ws, b._id, a._id)
		assert.equal(+same.updatedAt, +b.updatedAt)
		const top = await mkFolder(ws, 'Top')
		const topAgain = await F.moveFolder(spy, ws, top._id, null)
		assert.equal(topAgain.parentId, null)
		assert.ok(!spy.events.some((e) => e.method === 'updateOne'))
	})

	await check('move into itself, a child, a grandchild: 400 and nothing changes', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const b = await mkFolder(ws, 'B', a._id)
		const c = await mkFolder(ws, 'C', b._id)
		await expectError(() => F.moveFolder(db, ws, a._id, a._id), 400, 'self')
		await expectError(() => F.moveFolder(db, ws, a._id, b._id), 400, 'child')
		await expectError(() => F.moveFolder(db, ws, a._id, c._id), 400, 'grandchild')
		await expectError(() => F.moveFolder(db, ws, b._id, c._id), 400, 'own child')
		assert.deepEqual(await pathsOf(ws), ['A', 'A/B', 'A/B/C'])
		await assertSound(ws)
	})

	await check('move: 404 for missing folder, missing destination, foreign ids, malformed ids', async () => {
		const ws = newWs()
		const other = newWs()
		const a = await mkFolder(ws, 'A')
		const theirs = await mkFolder(other, 'Theirs')
		await expectError(() => F.moveFolder(db, ws, new ObjectId(), null), 404, 'missing folder')
		await expectError(() => F.moveFolder(db, ws, a._id, new ObjectId()), 404, 'missing destination')
		await expectError(() => F.moveFolder(db, ws, theirs._id, null), 404, 'foreign folder')
		await expectError(() => F.moveFolder(db, ws, a._id, theirs._id), 404, 'foreign destination')
		await expectError(() => F.moveFolder(db, ws, 'zz', null), 404, 'malformed folder')
		await expectError(() => F.moveFolder(db, ws, a._id, 'zz'), 404, 'malformed destination')
		await expectError(() => F.moveFolder(db, ws, a._id, { $ne: null }), 404, 'operator destination')
		assert.equal((await folderCol.findOne({ _id: theirs._id })).parentId, null, 'foreign folder untouched')
		assert.equal((await folderCol.findOne({ _id: a._id })).parentId, null)
	})

	await check('move onto a sibling-name clash (incl. variants) is 409 and leaves the folder where it was', async () => {
		const ws = newWs()
		const dest = await mkFolder(ws, 'Dest')
		await mkFolder(ws, 'Photos', dest._id)
		const src = await mkFolder(ws, 'photos!')
		await expectError(() => F.moveFolder(db, ws, src._id, dest._id), 409)
		assert.equal((await folderCol.findOne({ _id: src._id })).parentId, null)
		const cjkDest = await mkFolder(ws, 'D2')
		await mkFolder(ws, '日本', cjkDest._id)
		const cjk = await mkFolder(ws, '日本')
		await expectError(() => F.moveFolder(db, ws, cjk._id, cjkDest._id), 409, 'cjk')
	})

	await check('move up into a parent that has a same-named sibling is 409 (top level too)', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const inner = await mkFolder(ws, 'Same', p._id)
		await mkFolder(ws, 'same')
		await expectError(() => F.moveFolder(db, ws, inner._id, null), 409)
	})

	/* ---------------------------------------------------------------------- */
	section('depth limit')

	await check(`create allows depth ${MAX_DEPTH} (level ${MEDIA_LIMITS.maxFolderDepth}) and refuses one deeper (400)`, async () => {
		const ws = newWs()
		let parent = null
		for (let i = 0; i < MEDIA_LIMITS.maxFolderDepth; i++) parent = (await create(ws, `L${i}`, parent?._id ?? null))
		const index = await F.loadFolderIndex(db, ws)
		assert.equal(index.depthOf(String(parent._id)), MAX_DEPTH)
		await expectError(() => create(ws, 'too deep', parent._id), 400)
		assert.equal((await docsOf(ws)).length, MEDIA_LIMITS.maxFolderDepth)
	})

	await check('moving accounts for the moved subtree height, at the exact boundary', async () => {
		const ws = newWs()
		const chain = []
		for (let i = 0; i <= MAX_DEPTH; i++) chain.push(await mkFolder(ws, `L${i}`, chain[i - 1]?._id ?? null))
		const s = await mkFolder(ws, 'S')
		const s1 = await mkFolder(ws, 'S1', s._id)
		const s2 = await mkFolder(ws, 'S2', s1._id)
		const t = await mkFolder(ws, 'T')
		// S has height 2: it fits under depth-2 (S at 3, S2 at 5) but not depth-3 (S2 at 6).
		await expectError(() => F.moveFolder(db, ws, s._id, chain[3]._id), 400, 'S under L3')
		await expectError(() => F.moveFolder(db, ws, t._id, chain[MAX_DEPTH]._id), 400, 'leaf under deepest')
		await expectError(() => F.moveFolder(db, ws, s._id, chain[MAX_DEPTH]._id), 400, 'S under deepest')
		assert.equal((await folderCol.findOne({ _id: s._id })).parentId, null, 'failed moves changed nothing')
		await F.moveFolder(db, ws, s._id, chain[2]._id)
		const index = await F.loadFolderIndex(db, ws)
		assert.equal(index.depthOf(String(s2._id)), MAX_DEPTH)
		await F.moveFolder(db, ws, t._id, chain[MAX_DEPTH - 1]._id)
		await expectError(() => create(ws, 'x', s2._id), 400, 'create under the deepest')
		await expectError(() => F.moveFolder(db, ws, s._id, chain[3]._id), 400, 'shifting S one level deeper')
		await assertSound(ws)
	})

	await check('a move that reduces depth, and a move to top level, always passes the depth check', async () => {
		const ws = newWs()
		const chain = []
		for (let i = 0; i <= MAX_DEPTH; i++) chain.push(await mkFolder(ws, `L${i}`, chain[i - 1]?._id ?? null))
		await F.moveFolder(db, ws, chain[1]._id, null)
		const index = await F.loadFolderIndex(db, ws)
		assert.equal(index.depthOf(String(chain[MAX_DEPTH]._id)), MAX_DEPTH - 1)
	})

	/* ---------------------------------------------------------------------- */
	section('folder cap')

	await check(`the folder cap (${MEDIA_LIMITS.maxFolders}): cap-1 seeded, one more works, the next is 400`, async () => {
		const ws = newWs()
		const docs = Array.from({ length: MEDIA_LIMITS.maxFolders - 1 }, (_, i) => ({
			_id: new ObjectId(),
			workspaceId: ws,
			parentId: null,
			name: `seed ${String(i).padStart(4, '0')}`,
			nameKey: folderKey(`seed ${String(i).padStart(4, '0')}`),
			createdBy: 'seed',
			createdAt: new Date(),
			updatedAt: new Date(),
		}))
		await folderCol.insertMany(docs)
		const last = await create(ws, 'The thousandth')
		assert.equal((await docsOf(ws)).length, MEDIA_LIMITS.maxFolders)
		await expectError(() => create(ws, 'One too many'), 400, 'top level')
		await expectError(() => create(ws, 'Nested one too many', last._id), 400, 'nested')
		assert.equal((await docsOf(ws)).length, MEDIA_LIMITS.maxFolders)
		// Existing folders stay fully editable at the cap.
		await F.renameFolder(db, ws, last._id, 'Renamed at cap')
		await F.moveFolder(db, ws, docs[0]._id, last._id)
		// Deleting one frees a slot.
		await F.deleteFolder(db, ws, docs[1]._id)
		await create(ws, 'Fits again')
	})

	/* ---------------------------------------------------------------------- */
	section('cycles and concurrent moves')

	await check('a simulated A-into-B / B-into-A pair, both writing before either re-reads: both 409, tree back as it was', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const b = await mkFolder(ws, 'B')
		const beforeWrite = barrier(2)
		const afterWrite = barrier(2)
		const spy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaFolders' && ev.method === 'updateOne' && ev.n <= 2) {
				if (ev.phase === 'before') await beforeWrite()
				else await afterWrite()
			}
		})
		const results = await Promise.allSettled([F.moveFolder(spy, ws, a._id, b._id), F.moveFolder(spy, ws, b._id, a._id)])
		assert.ok(!(await hasCycle(ws)), 'no cycle left behind')
		for (const r of results) {
			assert.equal(r.status, 'rejected', 'a cycle-making move is never reported as success')
			assert.equal(r.reason.status, 409)
			assert.match(r.reason.message, /conflicted with another change/)
		}
		assert.deepEqual(await pathsOf(ws), ['A', 'B'])
		await assertSound(ws)
	})

	await check('a three-folder rotation (A into B, B into C, C into A) written together never leaves a cycle', async () => {
		const ws = newWs()
		const [a, b, c] = [await mkFolder(ws, 'A'), await mkFolder(ws, 'B'), await mkFolder(ws, 'C')]
		const beforeWrite = barrier(3)
		const afterWrite = barrier(3)
		const spy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaFolders' && ev.method === 'updateOne' && ev.n <= 3) {
				if (ev.phase === 'before') await beforeWrite()
				else await afterWrite()
			}
		})
		const results = await Promise.allSettled([F.moveFolder(spy, ws, a._id, b._id), F.moveFolder(spy, ws, b._id, c._id), F.moveFolder(spy, ws, c._id, a._id)])
		assert.ok(!(await hasCycle(ws)))
		assert.ok(results.every((r) => r.status === 'rejected' && r.reason.status === 409))
		await assertSound(ws)
	})

	await check('the second mover validated on a stale snapshot is reverted with 409 while the first stays', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const b = await mkFolder(ws, 'B')
		const aDone = gate()
		const slow = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'updateOne', 1)) await aDone.wait()
		})
		const second = F.moveFolder(slow, ws, b._id, a._id) // reads, validates, then waits at its write
		await new Promise((r) => setTimeout(r, 400))
		const first = await F.moveFolder(db, ws, a._id, b._id) // A into B completes entirely
		assert.ok(first.parentId.equals(b._id))
		aDone.open()
		const err = await second.then(() => null, (e) => e)
		assert.ok(err instanceof FolderError && err.status === 409, String(err))
		assert.ok(!(await hasCycle(ws)))
		assert.deepEqual(await pathsOf(ws), ['B', 'B/A'], 'the first move survived, the second was undone')
	})

	await check('deep variant: A/Aa into B/Bb while B into A, written together', async () => {
		const ws = newWs()
		const a = await mkFolder(ws, 'A')
		const aa = await mkFolder(ws, 'Aa', a._id)
		const b = await mkFolder(ws, 'B')
		const bb = await mkFolder(ws, 'Bb', b._id)
		const beforeWrite = barrier(2)
		const afterWrite = barrier(2)
		const spy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaFolders' && ev.method === 'updateOne' && ev.n <= 2) {
				if (ev.phase === 'before') await beforeWrite()
				else await afterWrite()
			}
		})
		// A into Bb (A -> B/Bb/A) and B into Aa (B -> A/Aa/B): a 4-cycle if both land.
		await Promise.allSettled([F.moveFolder(spy, ws, a._id, bb._id), F.moveFolder(spy, ws, b._id, aa._id)])
		assert.ok(!(await hasCycle(ws)))
		await assertSound(ws)
	})

	await check('20 natural (unsynchronised) A-into-B / B-into-A races never leave a cycle', async () => {
		for (let i = 0; i < 20; i++) {
			const ws = newWs()
			const a = await mkFolder(ws, 'A')
			const b = await mkFolder(ws, 'B')
			const results = await Promise.allSettled([F.moveFolder(db, ws, a._id, b._id), F.moveFolder(db, ws, b._id, a._id)])
			assert.ok(!(await hasCycle(ws)), `cycle on iteration ${i}`)
			for (const r of results)
				if (r.status === 'rejected') assert.ok(r.reason instanceof FolderError && [400, 409].includes(r.reason.status), String(r.reason))
			await assertSound(ws)
		}
	})

	await check('a create that lands under a folder just moved too deep is undone (409)', async () => {
		const ws = newWs()
		const chain = []
		for (let i = 0; i < MAX_DEPTH; i++) chain.push(await mkFolder(ws, `L${i}`, chain[i - 1]?._id ?? null)) // depths 0..4
		const x = await mkFolder(ws, 'X')
		// create validated while X is at depth 0; before its insert X is moved to depth 5
		const spy = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'insertOne', 1)) await F.moveFolder(db, ws, x._id, chain[MAX_DEPTH - 1]._id)
		})
		await expectError(() => create(ws, 'late', x._id, spy), 409)
		assert.ok(!(await docsOf(ws)).some((d) => d.name === 'late'), 'the late child was removed')
		assert.equal((await F.loadFolderIndex(db, ws)).depthOf(String(x._id)), MAX_DEPTH)
		await assertSound(ws)
	})

	await check('a move that lands after a create deepened its subtree is reverted (409)', async () => {
		const ws = newWs()
		const chain = []
		for (let i = 0; i < MAX_DEPTH; i++) chain.push(await mkFolder(ws, `L${i}`, chain[i - 1]?._id ?? null))
		const x = await mkFolder(ws, 'X')
		const spy = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'updateOne', 1)) await mkFolder(ws, 'late child', x._id)
		})
		await expectError(() => F.moveFolder(spy, ws, x._id, chain[MAX_DEPTH - 1]._id), 409)
		assert.equal((await folderCol.findOne({ _id: x._id })).parentId, null, 'X is back at the top level')
		await assertSound(ws)
	})

	await check('a create whose parent is deleted between check and insert is undone (404), leaving no orphan', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const spy = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'insertOne', 1)) await F.deleteFolder(db, ws, p._id)
		})
		await expectError(() => create(ws, 'child', p._id, spy), 404)
		assert.equal((await docsOf(ws)).length, 0)
	})

	await check('a move whose destination is deleted mid-flight is reverted (409)', async () => {
		const ws = newWs()
		const dest = await mkFolder(ws, 'Dest')
		const x = await mkFolder(ws, 'X')
		const spy = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'updateOne', 1)) await folderCol.deleteOne({ _id: dest._id })
		})
		await expectError(() => F.moveFolder(spy, ws, x._id, dest._id), 409)
		assert.equal((await folderCol.findOne({ _id: x._id })).parentId, null)
		await assertSound(ws)
	})

	await check('a move of a folder deleted mid-flight is 404; one moved elsewhere mid-flight is 409', async () => {
		const ws = newWs()
		const dest = await mkFolder(ws, 'Dest')
		const other = await mkFolder(ws, 'Other')
		const x = await mkFolder(ws, 'X')
		const gone = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'updateOne', 1)) await folderCol.deleteOne({ _id: x._id })
		})
		await expectError(() => F.moveFolder(gone, ws, x._id, dest._id), 404, 'deleted')
		const y = await mkFolder(ws, 'Y')
		const moved = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'updateOne', 1)) await folderCol.updateOne({ _id: y._id }, { $set: { parentId: other._id } })
		})
		await expectError(() => F.moveFolder(moved, ws, y._id, dest._id), 409, 'moved elsewhere')
		assert.ok((await folderCol.findOne({ _id: y._id })).parentId.equals(other._id), 'the other writer wins')
	})

	/* ---------------------------------------------------------------------- */
	section('delete')

	await check('delete moves assets and subfolders up to the parent and removes the folder', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const f = await mkFolder(ws, 'F', p._id)
		const c1 = await mkFolder(ws, 'C1', f._id)
		await mkFolder(ws, 'C2', f._id)
		await mkAssets(ws, f._id, 3)
		await mkAssets(ws, c1._id, 2)
		await mkAssets(ws, p._id, 1)
		await mkAssets(ws, null, 1)
		const moved = await F.deleteFolder(db, ws, f._id)
		assert.deepEqual(moved, { assets: 3, folders: 2 })
		assert.deepEqual(await pathsOf(ws), ['P', 'P/C1', 'P/C2'])
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: p._id }), 4)
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: c1._id }), 2, 'grandchildren assets untouched')
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: null }), 1)
		assert.equal(await assetCol.countDocuments({ workspaceId: ws }), 7, 'no asset lost')
		await assertSound(ws)
	})

	await check('deleting a top-level folder sends assets to Unfiled and children to the top level', async () => {
		const ws = newWs()
		const f = await mkFolder(ws, 'F')
		await mkFolder(ws, 'Kid', f._id)
		await mkAssets(ws, f._id, 2)
		const moved = await F.deleteFolder(db, ws, f._id)
		assert.deepEqual(moved, { assets: 2, folders: 1 })
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: null }), 2)
		assert.deepEqual(await pathsOf(ws), ['Kid'])
	})

	await check('deleting an empty leaf reports nothing moved', async () => {
		const ws = newWs()
		const f = await mkFolder(ws, 'F')
		assert.deepEqual(await F.deleteFolder(db, ws, f._id), { assets: 0, folders: 0 })
		assert.equal((await docsOf(ws)).length, 0)
	})

	await check('name clashes on the way up are resolved with (2), (3)... and nothing is lost', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		await mkFolder(ws, 'Dup', p._id)
		await mkFolder(ws, 'Other', p._id)
		const f = await mkFolder(ws, 'F', p._id)
		await mkFolder(ws, 'Dup', f._id)
		await mkFolder(ws, 'Dup (2)', f._id)
		await mkFolder(ws, 'Other', f._id)
		await mkFolder(ws, 'Fresh', f._id)
		const moved = await F.deleteFolder(db, ws, f._id)
		assert.equal(moved.folders, 4)
		const kids = (await docsOf(ws)).filter((d) => String(d.parentId) === String(p._id))
		assert.equal(kids.length, 6)
		assert.equal(new Set(kids.map((k) => k.nameKey)).size, 6, 'every sibling key is unique')
		assert.ok(kids.some((k) => k.name === 'Fresh'), 'a non-clashing child keeps its name')
		assert.ok(kids.filter((k) => k.name.startsWith('Dup')).length === 3)
		assert.ok(kids.some((k) => k.name === 'Dup'), 'the parent\'s own folder keeps its name')
		for (const k of kids) assert.equal(k.nameKey, folderKey(k.name), 'nameKey matches the new name')
		await assertSound(ws)
	})

	await check('a clash with "Name 2" (punctuation collapsed) is skipped: "Foo" cannot become "Foo (2)" beside "Foo 2"', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		await mkFolder(ws, 'Foo', p._id)
		await mkFolder(ws, 'Foo 2', p._id)
		const f = await mkFolder(ws, 'F', p._id)
		await mkFolder(ws, 'Foo', f._id)
		await F.deleteFolder(db, ws, f._id)
		const names = (await docsOf(ws)).filter((d) => String(d.parentId) === String(p._id)).map((d) => d.name).sort()
		assert.equal(names.length, 3)
		assert.ok(names.includes('Foo (3)'), names.join(','))
		await assertSound(ws)
	})

	await check('clash resolution keeps long names within the name limit, including emoji at the cut', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const long = 'L'.repeat(MEDIA_LIMITS.folderNameMax)
		// The suffix " (2)" leaves 76 characters: the cut falls between the two halves of the emoji.
		const emoji = 'E'.repeat(75) + '😀' + 'E'.repeat(MEDIA_LIMITS.folderNameMax - 77)
		assert.equal(emoji.length, MEDIA_LIMITS.folderNameMax)
		await mkFolder(ws, long, p._id)
		await mkFolder(ws, emoji, p._id)
		const f = await mkFolder(ws, 'F', p._id)
		await mkFolder(ws, long, f._id)
		await mkFolder(ws, emoji, f._id)
		await F.deleteFolder(db, ws, f._id)
		for (const d of await docsOf(ws)) {
			assert.ok(d.name.length <= MEDIA_LIMITS.folderNameMax, `${d.name.length}`)
			assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(d.name), `lone high surrogate in ${d.name}`)
			assert.ok(!/(?<![\ud800-\udbff])[\udc00-\udfff]/.test(d.name), `lone low surrogate in ${d.name}`)
		}
		assert.ok((await docsOf(ws)).some((d) => d.name === 'E'.repeat(75) + ' (2)'), 'cut before the emoji, suffix appended')
		assert.equal((await docsOf(ws)).length, 5, 'P, two originals, two renamed')
		await assertSound(ws)
	})

	await check('30 children all clashing with the parent\'s own 30 are all kept, uniquely named', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const f = await mkFolder(ws, 'F', p._id)
		for (let i = 0; i < 30; i++) {
			await mkFolder(ws, `Item ${i}`, p._id)
			await mkFolder(ws, `Item ${i}`, f._id)
		}
		const moved = await F.deleteFolder(db, ws, f._id)
		assert.equal(moved.folders, 30)
		assert.equal((await docsOf(ws)).length, 61)
		await assertSound(ws)
	})

	await check('delete twice: the second is a 404 that changes nothing', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const f = await mkFolder(ws, 'F', p._id)
		await mkFolder(ws, 'C', f._id)
		await mkAssets(ws, f._id, 2)
		await F.deleteFolder(db, ws, f._id)
		const snapshot = JSON.stringify((await docsOf(ws)).map((d) => [d.name, String(d.parentId), +d.updatedAt]).sort())
		const assets = JSON.stringify((await assetCol.find({ workspaceId: ws }).toArray()).map((a) => [String(a._id), String(a.folderId)]).sort())
		await expectError(() => F.deleteFolder(db, ws, f._id), 404)
		assert.equal(JSON.stringify((await docsOf(ws)).map((d) => [d.name, String(d.parentId), +d.updatedAt]).sort()), snapshot)
		assert.equal(JSON.stringify((await assetCol.find({ workspaceId: ws }).toArray()).map((a) => [String(a._id), String(a.folderId)]).sort()), assets)
	})

	await check('two concurrent deletes of one folder: nothing lost, tree sound, at most 404 for the loser', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const f = await mkFolder(ws, 'F', p._id)
		for (let i = 0; i < 6; i++) await mkFolder(ws, `K${i}`, f._id)
		await mkFolder(ws, 'K0', p._id)
		await mkAssets(ws, f._id, 10)
		const results = await Promise.allSettled([F.deleteFolder(db, ws, f._id), F.deleteFolder(db, ws, f._id)])
		for (const r of results)
			if (r.status === 'rejected') assert.ok(r.reason instanceof FolderError && r.reason.status === 404, String(r.reason))
		assert.ok(results.some((r) => r.status === 'fulfilled'))
		assert.equal((await docsOf(ws)).length, 8)
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: p._id }) + await assetCol.countDocuments({ workspaceId: ws, folderId: null }), 10)
		await assertSound(ws)
	})

	await check('delete: 404 for missing, foreign and malformed ids; another workspace is untouched', async () => {
		const ws = newWs()
		const other = newWs()
		const theirs = await mkFolder(other, 'Theirs')
		const theirKid = await mkFolder(other, 'Kid', theirs._id)
		await mkAssets(other, theirs._id, 2)
		// a hostile asset in OUR workspace pointing at THEIR folder id must not be rewritten by their delete
		await expectError(() => F.deleteFolder(db, ws, theirs._id), 404, 'foreign')
		await expectError(() => F.deleteFolder(db, ws, new ObjectId()), 404, 'missing')
		await expectError(() => F.deleteFolder(db, ws, 'nope'), 404, 'malformed')
		await expectError(() => F.deleteFolder(db, ws, { $ne: null }), 404, 'operator')
		assert.equal((await docsOf(other)).length, 2)
		assert.ok((await folderCol.findOne({ _id: theirKid._id })).parentId.equals(theirs._id))
		assert.equal(await assetCol.countDocuments({ workspaceId: other, folderId: theirs._id }), 2)
	})

	await check('deleting a folder never touches another workspace\'s assets, even ones carrying the same folder id', async () => {
		const ws = newWs()
		const other = newWs()
		const f = await mkFolder(ws, 'F')
		await mkAssets(ws, f._id, 1)
		const [stray] = await mkAssets(other, f._id, 1)
		await F.deleteFolder(db, ws, f._id)
		assert.ok((await assetCol.findOne({ _id: stray._id })).folderId.equals(f._id))
	})

	await check('deleting the top of a six-level chain flattens it by one level and keeps every asset', async () => {
		const ws = newWs()
		const chain = []
		for (let i = 0; i <= MAX_DEPTH; i++) {
			chain.push(await mkFolder(ws, `L${i}`, chain[i - 1]?._id ?? null))
			await mkAssets(ws, chain[i]._id, 1)
		}
		await F.deleteFolder(db, ws, chain[0]._id)
		assert.equal((await F.loadFolderIndex(db, ws)).depthOf(String(chain[MAX_DEPTH]._id)), MAX_DEPTH - 1)
		assert.equal(await assetCol.countDocuments({ workspaceId: ws }), MAX_DEPTH + 1)
		await assertSound(ws)
	})

	await check('delete runs steps in the documented order: children, assets, folder document, assets again', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const f = await mkFolder(ws, 'F', p._id)
		await mkFolder(ws, 'C', f._id)
		await mkAssets(ws, f._id, 1)
		const spy = spyDb(db)
		await F.deleteFolder(spy, ws, f._id)
		const writes = spy.events
			.filter((e) => e.phase === 'before' && ['updateOne', 'updateMany', 'deleteOne', 'deleteMany'].includes(e.method))
			.map((e) => `${e.coll}.${e.method}`)
		assert.deepEqual(writes, ['mediaFolders.updateOne', 'mediaAssets.updateMany', 'mediaFolders.deleteOne', 'mediaAssets.updateMany'])
	})

	await check('a simulated crash after step 1 (children moved, assets not) is consistent, and a retry finishes', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		await mkFolder(ws, 'Dup', p._id)
		const f = await mkFolder(ws, 'F', p._id)
		await mkFolder(ws, 'Dup', f._id)
		await mkFolder(ws, 'Solo', f._id)
		await mkAssets(ws, f._id, 4)
		const crashing = spyDb(db, (ev) => {
			if (is(ev, 'mediaAssets', 'updateMany', 1)) throw new Error('simulated crash')
		})
		await assert.rejects(F.deleteFolder(crashing, ws, f._id), /simulated crash/)
		assert.ok(await folderCol.findOne({ _id: f._id }), 'the folder is still there')
		assert.equal(await folderCol.countDocuments({ workspaceId: ws, parentId: f._id }), 0, 'its children already moved up')
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: f._id }), 4, 'its assets are still in it')
		await assertSound(ws)
		const moved = await F.deleteFolder(db, ws, f._id)
		assert.deepEqual(moved, { assets: 4, folders: 0 })
		assert.equal(await folderCol.countDocuments({ workspaceId: ws, parentId: p._id }), 3)
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: p._id }), 4)
		await assertSound(ws)
	})

	await check('a simulated crash in the middle of step 1 (after some children moved) resumes without loss', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const f = await mkFolder(ws, 'F', p._id)
		for (let i = 0; i < 6; i++) await mkFolder(ws, `K${i}`, f._id)
		const crashing = spyDb(db, (ev) => {
			if (is(ev, 'mediaFolders', 'updateOne', 3)) throw new Error('simulated crash')
		})
		await assert.rejects(F.deleteFolder(crashing, ws, f._id), /simulated crash/)
		const left = await folderCol.countDocuments({ workspaceId: ws, parentId: f._id })
		assert.ok(left > 0 && left < 6, `partly moved: ${left} left`)
		await assertSound(ws)
		await F.deleteFolder(db, ws, f._id)
		assert.equal(await folderCol.countDocuments({ workspaceId: ws, parentId: p._id }), 6)
		assert.ok(!(await folderCol.findOne({ _id: f._id })))
	})

	await check('a simulated crash after step 2 (assets moved, folder document remains) is consistent, and a retry finishes', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const f = await mkFolder(ws, 'F', p._id)
		await mkFolder(ws, 'K', f._id)
		await mkAssets(ws, f._id, 3)
		const crashing = spyDb(db, (ev) => {
			if (is(ev, 'mediaFolders', 'deleteOne', 1)) throw new Error('simulated crash')
		})
		await assert.rejects(F.deleteFolder(crashing, ws, f._id), /simulated crash/)
		assert.ok(await folderCol.findOne({ _id: f._id }), 'folder still exists, now empty')
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: p._id }), 3)
		await assertSound(ws)
		assert.deepEqual(await F.deleteFolder(db, ws, f._id), { assets: 0, folders: 0 })
		assert.ok(!(await folderCol.findOne({ _id: f._id })))
		await assertSound(ws)
	})

	await check('an upload landing in the folder after step 2 is caught by step 4; a child created after step 1 by the sweep', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const f = await mkFolder(ws, 'F', p._id)
		await mkAssets(ws, f._id, 1)
		let late
		const spy = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'deleteOne', 1)) {
				late = (await mkAssets(ws, f._id, 1))[0] // lands before the folder document goes
				await mkFolder(ws, 'Late child', f._id)
			}
		})
		const moved = await F.deleteFolder(spy, ws, f._id)
		assert.equal(moved.assets, 2)
		assert.equal(moved.folders, 1)
		assert.ok((await assetCol.findOne({ _id: late._id })).folderId.equals(p._id))
		assert.ok((await byName(ws, 'Late child', p._id)), 'late child re-homed under the parent')
		await assertSound(ws)
	})

	await check('a crash after step 3 leaves dangling assets only until the retry, which adopts them to the top level (404)', async () => {
		const ws = newWs()
		const p = await mkFolder(ws, 'P')
		const f = await mkFolder(ws, 'F', p._id)
		const crashing = spyDb(db, async (ev) => {
			if (is(ev, 'mediaFolders', 'deleteOne', 1, 'after')) {
				await mkAssets(ws, f._id, 2) // an upload that raced the delete
				await mkFolder(ws, 'Stray', f._id)
			}
			if (is(ev, 'mediaAssets', 'updateMany', 2)) throw new Error('simulated crash')
		})
		await assert.rejects(F.deleteFolder(crashing, ws, f._id), /simulated crash/)
		assert.ok(!(await folderCol.findOne({ _id: f._id })))
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: f._id }), 2, 'dangling until the retry')
		await expectError(() => F.deleteFolder(db, ws, f._id), 404)
		assert.equal(await assetCol.countDocuments({ workspaceId: ws, folderId: null }), 2, 'adopted by the library root')
		assert.equal((await byName(ws, 'Stray', null)) ? 1 : 0, 1, 'orphan folder adopted to the top level')
		await assertSound(ws)
	})

	/* ---------------------------------------------------------------------- */
	section('every query is scoped by workspace')

	await check('every read and write the folder module makes carries the workspace id', async () => {
		const ws = newWs()
		const spy = spyDb(db)
		const a = await create(ws, 'A', null, spy)
		const b = await create(ws, 'B', a._id, spy)
		await create(ws, 'C', null, spy)
		await F.renameFolder(spy, ws, b._id, 'B2')
		await F.moveFolder(spy, ws, b._id, null)
		await F.moveFolder(spy, ws, b._id, a._id)
		await mkAssets(ws, a._id, 2)
		await F.getFoldersResponse(spy, ws)
		await F.loadFolderIndex(spy, ws)
		await F.deleteFolder(spy, ws, a._id)
		await expectError(() => F.deleteFolder(spy, ws, a._id), 404)
		const unscoped = []
		for (const ev of spy.events) {
			if (ev.phase !== 'before') continue
			const first = ev.method === 'aggregate' ? ev.args[0]?.[0]?.$match : ev.args[0]
			const id = ev.method === 'insertOne' ? first?.workspaceId : first?.workspaceId
			if (!(id && ws.equals(id))) unscoped.push(`${ev.coll}.${ev.method}`)
		}
		assert.deepEqual(unscoped, [])
		assert.ok(spy.events.length > 20)
	})

	/* ---------------------------------------------------------------------- */
	section('getFoldersResponse')

	await check('an empty workspace answers zeros and no folders', async () => {
		const ws = newWs()
		assert.deepEqual(await F.getFoldersResponse(db, ws), { folders: [], unfiled: 0, total: 0, unreviewed: 0, bytes: 0 })
	})

	await check('counts, recursive totals, unfiled, total and bytes', async () => {
		const ws = newWs()
		const other = newWs()
		const a = await mkFolder(ws, 'A')
		const b = await mkFolder(ws, 'B', a._id)
		const c = await mkFolder(ws, 'C', b._id)
		const d = await mkFolder(ws, 'D')
		await mkFolder(ws, 'Empty', d._id)
		await mkAssets(ws, a._id, 2, { bytes: 10 })
		await mkAssets(ws, b._id, 3, { bytes: 100 })
		await mkAssets(ws, c._id, 1, { bytes: 1000 })
		await mkAssets(ws, d._id, 4, { bytes: 5 })
		await mkAssets(ws, null, 5, { bytes: 7 })
		await mkAssets(ws, new ObjectId(), 2, { bytes: 3 }) // points at a folder that no longer exists
		await mkAssets(other, a._id, 9, { bytes: 99999 }) // another workspace entirely
		const r = await F.getFoldersResponse(db, ws)
		const row = (name) => r.folders.find((f) => f.name === name)
		assert.equal(row('A').count, 2)
		assert.equal(row('A').total, 6)
		assert.equal(row('B').count, 3)
		assert.equal(row('B').total, 4)
		assert.equal(row('C').count, 1)
		assert.equal(row('C').total, 1)
		assert.equal(row('D').count, 4)
		assert.equal(row('D').total, 4)
		assert.equal(row('Empty').count, 0)
		assert.equal(row('Empty').total, 0)
		assert.equal(r.unfiled, 5)
		assert.equal(r.total, 2 + 3 + 1 + 4 + 5 + 2)
		assert.equal(r.bytes, 2 * 10 + 3 * 100 + 1000 + 4 * 5 + 5 * 7 + 2 * 3)
		assert.deepEqual(r.folders.map((f) => f.path), ['A', 'A/B', 'A/B/C', 'D', 'D/Empty'])
		assert.deepEqual(r.folders.map((f) => f.depth), [0, 1, 2, 0, 1])
		assert.equal(row('B').parentId, String(a._id))
		assert.equal(row('A').parentId, null)
		assert.equal(row('A').id, String(a._id))
	})

	await check('recursive totals fold a deep, wide tree correctly', async () => {
		const ws = newWs()
		const chain = []
		for (let i = 0; i <= MAX_DEPTH; i++) {
			chain.push(await mkFolder(ws, `L${i}`, chain[i - 1]?._id ?? null))
			await mkAssets(ws, chain[i]._id, i + 1)
			await mkFolder(ws, `side${i}`, chain[i]._id).then((s) => mkAssets(ws, s._id, 1))
		}
		const r = await F.getFoldersResponse(db, ws)
		const total = (name) => r.folders.find((f) => f.name === name).total
		let expected = 0
		for (let i = MAX_DEPTH; i >= 0; i--) {
			expected += i + 1 + 1
			assert.equal(total(`L${i}`), expected, `L${i}`)
		}
		assert.equal(r.total, expected)
	})

	await check('unreviewed counts assets with at least one automatic tag, and only those', async () => {
		const ws = newWs()
		const manual = { slug: 'a', label: 'A', source: 'manual' }
		const auto = { slug: 'b', label: 'B', source: 'auto', via: 'vision' }
		await mkAssets(ws, null, 1, { tags: [] })
		await mkAssets(ws, null, 2, { tags: [manual] })
		await mkAssets(ws, null, 3, { tags: [auto] })
		await mkAssets(ws, null, 4, { tags: [manual, auto] })
		await mkAssets(ws, null, 1, { tags: [auto, { ...auto, slug: 'c' }] })
		const r = await F.getFoldersResponse(db, ws)
		assert.equal(r.unreviewed, 3 + 4 + 1)
		assert.equal(r.total, 11)
	})

	await check('one aggregation and one countDocuments, started concurrently', async () => {
		const ws = newWs()
		await mkAssets(ws, null, 3, { tags: [{ slug: 'x', label: 'X', source: 'auto' }] })
		const spy = spyDb(db)
		const r = await F.getFoldersResponse(spy, ws)
		assert.equal(r.unreviewed, 3)
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 1)
		assert.equal(spy.counts.get('mediaAssets.countDocuments'), 1)
		assert.equal(spy.counts.get('mediaAssets.find') ?? 0, 0, 'assets are never loaded one by one')
		const firstAfter = spy.events.findIndex((e) => e.phase === 'after')
		const startedBefore = spy.events.slice(0, firstAfter).map((e) => `${e.coll}.${e.method}`)
		for (const needed of ['mediaFolders.find', 'mediaAssets.aggregate', 'mediaAssets.countDocuments'])
			assert.ok(startedBefore.includes(needed), `${needed} did not start before the first one finished: ${startedBefore}`)
	})

	await check('a 1000-folder tree answers one folder row per folder with parents before children', async () => {
		const ws = newWs()
		const top = []
		for (let i = 0; i < 10; i++) top.push(await mkFolder(ws, `T${i}`))
		const docs = []
		for (let i = 0; i < 990; i++) {
			const name = `k${String(i).padStart(3, '0')}`
			docs.push({ _id: new ObjectId(), workspaceId: ws, parentId: top[i % 10]._id, name, nameKey: folderKey(name), createdBy: 's', createdAt: new Date(), updatedAt: new Date() })
		}
		await folderCol.insertMany(docs)
		await mkAssets(ws, docs[0]._id, 2)
		const r = await F.getFoldersResponse(db, ws)
		assert.equal(r.folders.length, 1000)
		const seen = new Set()
		for (const f of r.folders) {
			if (f.parentId) assert.ok(seen.has(f.parentId), 'parent listed first')
			seen.add(f.id)
		}
		assert.equal(r.folders.find((f) => f.name === 'T0').total, 2)
	})

	await check('loadFolders and loadFolderIndex are workspace scoped', async () => {
		const ws = newWs()
		const other = newWs()
		await mkFolder(ws, 'Mine')
		await mkFolder(other, 'Theirs')
		assert.deepEqual((await F.loadFolders(db, ws)).map((d) => d.name), ['Mine'])
		assert.deepEqual((await F.loadFolderIndex(db, ws)).ordered().map((n) => n.path), ['Mine'])
	})

	/* ---------------------------------------------------------------------- */
	section('vocabulary')

	const term = (...terms) => ({ terms })

	await check('counts the assets carrying each term (de-duplicated within an asset), scoped to the workspace', async () => {
		const ws = newWs()
		const other = newWs()
		await assetCol.insertMany([
			assetDoc(ws, null, term('kitchen', 'sink', 'remodel')),
			assetDoc(ws, null, term('kitchen', 'bath')),
			assetDoc(ws, null, term('kitchen', 'sink', 'sink', 'sink')),
			assetDoc(other, null, term('secret', 'kitchen')),
		])
		const vocab = await V.loadVocabulary(db, ws)
		assert.ok(vocab instanceof Map)
		assert.deepEqual(Object.fromEntries(vocab), { kitchen: 3, sink: 2, remodel: 1, bath: 1 })
		assert.ok(!vocab.has('secret'))
	})

	await check('empty workspace, missing terms, non-array terms and non-string entries do not break the build', async () => {
		const ws = newWs()
		assert.equal((await V.loadVocabulary(db, newWs())).size, 0)
		const noTerms = assetDoc(ws, null)
		delete noTerms.terms
		await assetCol.insertMany([noTerms, assetDoc(ws, null, { terms: 'oops' }), assetDoc(ws, null, { terms: null }), assetDoc(ws, null, { terms: [null, 5, '', 'ok', { a: 1 }] })])
		const vocab = await V.loadVocabulary(db, ws)
		assert.deepEqual(Object.fromEntries(vocab), { ok: 1 })
	})

	await check('the aggregation is a workspace $match, $unwind, $group with allowDiskUse and a 50,000 limit', async () => {
		const ws = newWs()
		await mkAssets(ws, null, 1, term('a'))
		const spy = spyDb(db)
		await V.loadVocabulary(spy, ws)
		const agg = spy.events.find((e) => e.method === 'aggregate' && e.phase === 'before')
		assert.ok(agg)
		const [pipeline, options] = agg.args
		assert.ok(ws.equals(pipeline[0].$match.workspaceId), 'first stage matches the workspace')
		assert.ok(pipeline.some((s) => s.$unwind), '$unwind')
		assert.ok(pipeline.some((s) => s.$group), '$group')
		assert.equal(pipeline.find((s) => s.$limit)?.$limit, 50_000)
		assert.equal(options?.allowDiskUse, true)
	})

	await check('served from cache within the TTL (same Map, no second aggregation, stale by design)', async () => {
		const ws = newWs()
		await assetCol.insertOne(assetDoc(ws, null, term('alpha')))
		const spy = spyDb(db)
		const first = await V.loadVocabulary(spy, ws)
		await assetCol.insertOne(assetDoc(ws, null, term('beta')))
		const second = await V.loadVocabulary(spy, ws)
		assert.equal(second, first)
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 1)
		assert.ok(!second.has('beta'))
	})

	const at = (offsetMs, fn) => {
		const real = Date.now
		Date.now = () => real() + offsetMs
		try {
			return fn()
		} finally {
			Date.now = real
		}
	}

	await check('the cache lives 120 s: still served at 119 s, rebuilt at 121 s', async () => {
		const ws = newWs()
		await assetCol.insertOne(assetDoc(ws, null, term('alpha')))
		const spy = spyDb(db)
		const first = await V.loadVocabulary(spy, ws)
		await assetCol.insertOne(assetDoc(ws, null, term('beta')))
		const near = await at(119_000, () => V.loadVocabulary(spy, ws))
		assert.equal(near, first)
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 1)
		const later = await at(121_000, () => V.loadVocabulary(spy, ws))
		assert.notEqual(later, first)
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 2)
		assert.equal(later.get('beta'), 1)
	})

	await check('invalidateVocabulary drops the entry (ObjectId or string), only for that workspace', async () => {
		const ws = newWs()
		const other = newWs()
		await mkAssets(ws, null, 1, term('alpha'))
		await mkAssets(other, null, 1, term('gamma'))
		const spy = spyDb(db)
		const first = await V.loadVocabulary(spy, ws)
		const otherFirst = await V.loadVocabulary(spy, other)
		await mkAssets(ws, null, 1, term('beta'))
		V.invalidateVocabulary(ws)
		const second = await V.loadVocabulary(spy, ws)
		assert.notEqual(second, first)
		assert.equal(second.get('beta'), 1)
		assert.equal(await V.loadVocabulary(spy, other), otherFirst, 'the other workspace stays cached')
		await mkAssets(ws, null, 1, term('delta'))
		V.invalidateVocabulary(String(ws))
		assert.equal((await V.loadVocabulary(spy, ws)).get('delta'), 1)
		assert.doesNotThrow(() => V.invalidateVocabulary(new ObjectId()))
		assert.doesNotThrow(() => V.invalidateVocabulary('never-seen'))
	})

	await check('in-flight de-duplication: five concurrent callers share one aggregation and one Map', async () => {
		const ws = newWs()
		await mkAssets(ws, null, 2, term('alpha', 'beta'))
		const g = gate()
		const spy = spyDb(db, async (ev) => {
			if (is(ev, 'mediaAssets', 'aggregate', 1, 'before')) await g.wait()
		})
		const calls = Array.from({ length: 5 }, () => V.loadVocabulary(spy, ws))
		await new Promise((r) => setTimeout(r, 100))
		g.open()
		const maps = await Promise.all(calls)
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 1)
		assert.ok(maps.every((m) => m === maps[0]))
		assert.equal(maps[0].get('alpha'), 2)
		assert.equal(await V.loadVocabulary(spy, ws), maps[0])
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 1, 'and the result is cached afterwards')
	})

	await check('de-duplication is per workspace: two workspaces build independently', async () => {
		const a = newWs()
		const b = newWs()
		await mkAssets(a, null, 1, term('only-a'))
		await mkAssets(b, null, 1, term('only-b'))
		const spy = spyDb(db)
		const [va, vb] = await Promise.all([V.loadVocabulary(spy, a), V.loadVocabulary(spy, b)])
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 2)
		assert.ok(va.has('only-a') && !va.has('only-b') && vb.has('only-b'))
	})

	await check('a failed aggregation rejects every sharer, is not cached, and the next call retries', async () => {
		const ws = newWs()
		await mkAssets(ws, null, 1, term('alpha'))
		const g = gate()
		const spy = spyDb(db, async (ev) => {
			if (is(ev, 'mediaAssets', 'aggregate', 1, 'before')) {
				await g.wait()
				throw new Error('boom')
			}
		})
		const calls = [V.loadVocabulary(spy, ws), V.loadVocabulary(spy, ws), V.loadVocabulary(spy, ws)].map((p) => p.then(() => 'ok', (e) => e.message))
		g.open()
		assert.deepEqual(await Promise.all(calls), ['boom', 'boom', 'boom'])
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 1)
		const retry = await V.loadVocabulary(spy, ws)
		assert.equal(retry.get('alpha'), 1)
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 2)
	})

	await check('generation guard: an aggregation that started before an invalidation is not cached', async () => {
		const ws = newWs()
		await mkAssets(ws, null, 1, term('old'))
		const g = gate()
		const spy = spyDb(db, async (ev) => {
			// read the (old) data, then hang before handing it back
			if (is(ev, 'mediaAssets', 'aggregate', 1, 'after')) await g.wait()
		})
		const slow = V.loadVocabulary(spy, ws)
		await new Promise((r) => setTimeout(r, 400)) // the aggregation has read 'old' and is parked
		await mkAssets(ws, null, 1, term('fresh'))
		V.invalidateVocabulary(ws)
		g.open()
		const stale = await slow
		assert.ok(stale.has('old') && !stale.has('fresh'), 'the slow caller gets what it started with')
		const next = await V.loadVocabulary(spy, ws)
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 2, 'the stale result was NOT cached; a fresh aggregation ran')
		assert.ok(next.has('fresh'), 'and it sees the write')
		assert.equal(await V.loadVocabulary(spy, ws), next)
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 2)
	})

	await check('generation guard: a caller arriving after the invalidation does not share the stale in-flight build, and a late stale finish cannot overwrite the fresh cache', async () => {
		const ws = newWs()
		await mkAssets(ws, null, 1, term('old'))
		const g = gate()
		const spy = spyDb(db, async (ev) => {
			if (is(ev, 'mediaAssets', 'aggregate', 1, 'after')) await g.wait() // only the first build is slow
		})
		const slow = V.loadVocabulary(spy, ws)
		await new Promise((r) => setTimeout(r, 400))
		await mkAssets(ws, null, 1, term('fresh'))
		V.invalidateVocabulary(ws)
		const quick = await V.loadVocabulary(spy, ws) // a second, fresh aggregation, finishing first
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 2)
		assert.ok(quick.has('fresh'))
		g.open() // now the stale one lands
		const stale = await slow
		assert.ok(!stale.has('fresh'))
		assert.equal(await V.loadVocabulary(spy, ws), quick, 'the cache still holds the fresh map')
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 2)
	})

	await check('generation guard: invalidating with nothing cached or running is harmless and later builds are cached', async () => {
		const ws = newWs()
		await mkAssets(ws, null, 1, term('a'))
		V.invalidateVocabulary(ws)
		V.invalidateVocabulary(ws)
		const spy = spyDb(db)
		const one = await V.loadVocabulary(spy, ws)
		assert.equal(await V.loadVocabulary(spy, ws), one)
		assert.equal(spy.counts.get('mediaAssets.aggregate'), 1)
	})

	await check('caps the vocabulary at 50,000 terms, keeping the most frequent', async () => {
		const ws = newWs()
		const docs = []
		let n = 0
		for (let d = 0; d < 26; d++) {
			const terms = []
			for (let i = 0; i < 2000; i++) terms.push(`x${String(n++).padStart(6, '0')}`)
			if (d < 3) terms.push('common')
			docs.push(assetDoc(ws, null, { terms }))
		}
		await assetCol.insertMany(docs)
		const vocab = await V.loadVocabulary(db, ws)
		assert.equal(n, 52_000)
		assert.equal(vocab.size, 50_000)
		assert.equal(vocab.get('common'), 3, 'the frequent term survives the cut')
		const counts = new Set(vocab.values())
		assert.deepEqual([...counts].sort(), [1, 3])
	})

	/* ---------------------------------------------------------------------- */
	section('hostile and degenerate input')

	await check('operator-shaped, prototype-shaped and unicode-shaped names round-trip as plain data', async () => {
		const ws = newWs()
		const names = ['{"$where":"1"}', '$or', '"; DROP', 'á', 'ﬁle', 'İstanbul', 'ǅ', '‮rtl', 'a b', '🏳️‍🌈']
		for (const name of names) {
			try {
				await create(ws, name)
			} catch (error) {
				assert.ok(error instanceof FolderError && error.status === 409, `${JSON.stringify(name)}: ${error}`)
			}
		}
		await assertSound(ws)
		const index = await F.loadFolderIndex(db, ws)
		assert.ok(index.ordered().length >= 8)
	})

	await check('folders get no path or tag fields, and assets are never touched by create/rename/move', async () => {
		const ws = newWs()
		const [asset] = await mkAssets(ws, null, 1, { rev: 7, tags: [{ slug: 'k', label: 'K', source: 'manual' }] })
		const a = await create(ws, 'A')
		await F.renameFolder(db, ws, a._id, 'A2')
		const b = await create(ws, 'B')
		await F.moveFolder(db, ws, b._id, a._id)
		const after = await assetCol.findOne({ _id: asset._id })
		assert.deepEqual(after, asset)
		assert.deepEqual(Object.keys(await folderCol.findOne({ _id: a._id })).sort(), ['_id', 'createdAt', 'createdBy', 'name', 'nameKey', 'parentId', 'updatedAt', 'workspaceId'])
	})

	await check('deleteFolder bumps no asset revision and touches only folderId and updatedAt', async () => {
		const ws = newWs()
		const f = await mkFolder(ws, 'F')
		const [asset] = await mkAssets(ws, f._id, 1, { rev: 4, tags: [{ slug: 'k', label: 'K', source: 'manual' }] })
		await F.deleteFolder(db, ws, f._id)
		const after = await assetCol.findOne({ _id: asset._id })
		assert.equal(after.rev, 4)
		assert.deepEqual(after.tags, asset.tags)
		assert.deepEqual(after.terms, asset.terms)
		assert.equal(after.folderId, null)
	})

	console.log(`\n${passed} passed, ${failed} failed`)
}

try {
	await main()
} catch (error) {
	failed++
	console.log(`FAIL  harness (${error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : error})`)
} finally {
	try {
		if (db) {
			// Only documents carrying this run's workspace ids, only the two media collections.
			const folders = await db.collection('mediaFolders').deleteMany({ workspaceId: { $in: workspaces } })
			const assets = await db.collection('mediaAssets').deleteMany({ workspaceId: { $in: workspaces } })
			const left =
				(await db.collection('mediaFolders').countDocuments({ workspaceId: { $in: workspaces } })) +
				(await db.collection('mediaAssets').countDocuments({ workspaceId: { $in: workspaces } }))
			console.log(`cleanup: removed ${folders.deletedCount} folders and ${assets.deletedCount} assets across ${workspaces.length} workspaces; ${left} left`)
			if (left) failed++
		}
	} catch (error) {
		failed++
		console.log(`FAIL  cleanup (${error})`)
	}
	await client.close().catch(() => {})
}
process.exit(failed ? 1 : 0)
