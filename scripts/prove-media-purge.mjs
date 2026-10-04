/**
 * Proves account deletion removes the media library:
 * `node --env-file=.env scripts/prove-media-purge.mjs`
 *
 * Part 1 runs src/lib/media/purge.ts against the real database with a fresh workspace
 * id and a decoy workspace, with '@/lib/media/storage' replaced by a recording mock
 * (no blob is ever touched). Everything the proof creates carries one of its own ids
 * and is deleted in a `finally`; no collection or index is dropped.
 * Part 2 loads the real settings route with its collaborators mocked.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadTs, mock, clearCache, rootRequire, ROOT } = require('./lib/load-ts.cjs')
const { MongoClient, ObjectId } = rootRequire('mongodb')

const uri = process.env.MONGODB_URI
if (!uri) {
	console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/prove-media-purge.mjs')
	process.exit(1)
}

let passed = 0
let failed = 0
async function check(name, fn) {
	try {
		await fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		const detail = (error && error.message ? error.message : String(error))
			.split('\n')
			.slice(0, 6)
			.join(' | ')
		console.log(`FAIL  ${name} (${detail})`)
	}
}
const section = (title) => console.log(`\n== ${title}`)

/** Runs fn with console.warn/error captured; returns the lines. */
async function captureLogs(fn) {
	const lines = []
	const warn = console.warn
	const error = console.error
	console.warn = (...args) => lines.push(args.map(String).join(' '))
	console.error = (...args) => lines.push(args.map(String).join(' '))
	try {
		await fn()
	} finally {
		console.warn = warn
		console.error = error
	}
	return lines
}

// ------------------------------------------------------------------ storage mock

const storageCalls = []
let storageImpl = async () => 0
mock('@/lib/media/storage', {
	deleteAllUnderPrefix: (...args) => {
		storageCalls.push(args)
		return storageImpl(...args)
	},
})

const { purgeWorkspaceMedia } = loadTs('src/lib/media/purge.ts')
const V = loadTs('src/lib/media/vocabulary.ts')
const T = loadTs('src/lib/media/types.ts')
const COLLECTIONS = [T.MEDIA_ASSETS, T.MEDIA_FOLDERS, T.MEDIA_TAG_RULES, T.MEDIA_SAVED_SEARCHES]
const USAGE = T.MEDIA_AI_USAGE

const client = new MongoClient(uri)
await client.connect()
const db = client.db()

const W = new ObjectId()
const D = new ObjectId()
const W2 = new ObjectId()
const W3 = new ObjectId()
const hex = (id) => id.toHexString()
const FAR = new Date(Date.now() + 365 * 24 * 3600 * 1000)

// Usage counters whose _id merely looks like the workspace's. Every one must survive a
// purge of W: a wrong anchor, a missing colon, a case-insensitive or unescaped match.
const flip = (s) => (s[23] === '0' ? s.slice(0, 23) + '1' : s.slice(0, 23) + '0')
const upperW = hex(W).toUpperCase()
const DECOY_USAGE = [
	`${hex(D)}:2026-10-03`,
	`${hex(D)}:2026-10-04`,
	`${hex(W)}x:2026-10-03`, // W plus a character before the colon
	`${hex(W)}`, // W alone, no colon
	`${hex(W).slice(0, 23)}:2026-10-03`, // one character short
	`${hex(W).slice(0, 23)}.:2026-10-03`, // a dot where W has a hex character
	`${flip(hex(W))}:2026-10-03`, // one character different
	`x${hex(W)}:2026-10-03`, // W is only a suffix
	`${hex(W)}${hex(W)}:2026-10-03`, // W repeated
	`${hex(D)}:${hex(W)}:2026-10-03`, // W inside another workspace's key
]
if (upperW !== hex(W)) DECOY_USAGE.push(`${upperW}:2026-10-03`) // regex must be case-sensitive
const W_USAGE = [`${hex(W)}:2026-10-03`, `${hex(W)}:2026-10-04`, `${hex(W)}:`, `${hex(W)}:a:b`]

const seededWorkspaces = [W, D, W2, W3]
const seededUsageIds = [...DECOY_USAGE, ...W_USAGE]

async function seed(ws, tag, n = 3) {
	const t = `proof-${tag}-${hex(ws)}`
	await db.collection(T.MEDIA_ASSETS).insertMany(
		Array.from({ length: n }, (_, i) => ({
			workspaceId: ws,
			pathname: `workspaces/${hex(ws)}/media/${t}-${i}.png`,
			name: `${t} ${i}`,
			nameKey: `${t}-${i}`,
			terms: [`${tag}term`, `${tag}extra${i}`],
			createdAt: new Date(),
			bytes: 1,
		})),
	)
	await db.collection(T.MEDIA_FOLDERS).insertMany(
		[0, 1].map((i) => ({ workspaceId: ws, parentId: null, name: `${t}-${i}`, nameKey: `${t}-${i}` })),
	)
	await db.collection(T.MEDIA_TAG_RULES).insertMany(
		[0, 1].map((i) => ({ workspaceId: ws, from: `${t}-${i}`, to: 'x' })),
	)
	await db.collection(T.MEDIA_SAVED_SEARCHES).insertMany(
		[0, 1].map((i) => ({ workspaceId: ws, name: `${t}-${i}`, q: 'tag:x', createdAt: new Date() })),
	)
}
async function seedUsage(ids) {
	for (const _id of ids)
		await db.collection(USAGE).replaceOne({ _id }, { _id, count: 1, expiresAt: FAR }, { upsert: true })
}
const countFor = (ws) =>
	Promise.all(COLLECTIONS.map((c) => db.collection(c).countDocuments({ workspaceId: ws })))
const usageLeft = async (ids) =>
	(await db.collection(USAGE).find({ _id: { $in: ids } }).toArray()).map((d) => d._id).sort()

// A recording stand-in for the Db: every call is logged, nothing reaches Mongo.
function spyDb(events, { failOn } = {}) {
	return {
		collection(name) {
			return {
				deleteMany: async (filter) => {
					events.push({ op: 'deleteMany', name, filter })
					if (failOn && failOn.includes(name)) throw new Error(`boom ${name}`)
					return { deletedCount: 7 }
				},
			}
		},
	}
}

try {
	section('Part 1: purgeWorkspaceMedia against the real database')

	await check('removes every media document of the workspace, returns counts, decoys untouched', async () => {
		await seed(W, 'w', 3)
		await seed(D, 'd', 4)
		await seedUsage([...W_USAGE, ...DECOY_USAGE])
		const before = await countFor(W)
		assert.deepEqual(before, [3, 2, 2, 2])
		assert.deepEqual(await countFor(D), [4, 2, 2, 2])

		storageCalls.length = 0
		storageImpl = async () => 5
		const result = await purgeWorkspaceMedia(db, W)

		assert.deepEqual(result, { blobs: 5, assets: 3, folders: 2 })
		assert.deepEqual(await countFor(W), [0, 0, 0, 0], 'all four collections emptied for W')
		assert.deepEqual(await usageLeft(W_USAGE), [], 'W usage counters gone, including odd suffixes')
		assert.deepEqual(await usageLeft(DECOY_USAGE), [...DECOY_USAGE].sort(), 'lookalike counters survive')
		assert.deepEqual(await countFor(D), [4, 2, 2, 2], 'decoy workspace documents untouched')
		assert.equal(storageCalls.length, 1)
		assert.equal(storageCalls[0].length, 1)
		assert.equal(typeof storageCalls[0][0], 'string')
		assert.equal(storageCalls[0][0], hex(W), 'blob purge is given the id as a string')
	})

	await check('the usage counter lookalikes are really distinct from W (guards the test itself)', () => {
		const re = new RegExp(`^${hex(W)}:`)
		assert.equal(DECOY_USAGE.filter((id) => re.test(id)).length, 0)
		assert.ok(W_USAGE.every((id) => re.test(id)))
	})

	await check('idempotent: a second purge removes nothing and leaves the decoys alone', async () => {
		storageImpl = async () => 0
		const second = await purgeWorkspaceMedia(db, W)
		assert.deepEqual(second, { blobs: 0, assets: 0, folders: 0 })
		const third = await purgeWorkspaceMedia(db, W)
		assert.deepEqual(third, { blobs: 0, assets: 0, folders: 0 })
		assert.deepEqual(await countFor(D), [4, 2, 2, 2])
		assert.deepEqual(await usageLeft(DECOY_USAGE), [...DECOY_USAGE].sort())
	})

	await check('a workspace with nothing in the library purges cleanly', async () => {
		const empty = new ObjectId()
		seededWorkspaces.push(empty)
		storageImpl = async () => 0
		assert.deepEqual(await purgeWorkspaceMedia(db, empty), { blobs: 0, assets: 0, folders: 0 })
	})

	await check('the vocabulary cache is dropped for the purged workspace only', async () => {
		await seed(W2, 'v', 2)
		await seed(D, 'dv', 1) // D gets one more asset with its own terms
		const dBefore = await V.loadVocabulary(db, D)
		const w2Before = await V.loadVocabulary(db, W2)
		assert.ok(w2Before.has('vterm'), 'cache was primed with the workspace terms')
		assert.equal(await V.loadVocabulary(db, W2), w2Before, 'and is served from cache')

		storageImpl = async () => 0
		await purgeWorkspaceMedia(db, W2)

		const w2After = await V.loadVocabulary(db, W2)
		assert.notEqual(w2After, w2Before)
		assert.equal(w2After.size, 0, 'stale terms of a deleted library are not suggested')
		assert.equal(await V.loadVocabulary(db, D), dBefore, "another workspace's cache is left in place")
	})

	await check('a storage failure does not stop the database cleanup', async () => {
		await seed(W3, 'f', 3)
		await seedUsage([`${hex(W3)}:2026-10-03`])
		seededUsageIds.push(`${hex(W3)}:2026-10-03`)
		storageCalls.length = 0
		storageImpl = async () => {
			throw new Error('Blob store request failed (Error): outage\nforged: line')
		}
		let result
		const logs = await captureLogs(async () => {
			result = await purgeWorkspaceMedia(db, W3)
		})
		assert.deepEqual(result, { blobs: 0, assets: 3, folders: 2 })
		assert.deepEqual(await countFor(W3), [0, 0, 0, 0])
		assert.deepEqual(await usageLeft([`${hex(W3)}:2026-10-03`]), [])
		assert.equal(storageCalls.length, 1)
		assert.equal(logs.length, 1, 'the failure is logged once')
		assert.ok(!/[\r\n]/.test(logs[0]), 'a message with a newline cannot forge a second log line')
		assert.ok(logs[0].includes('blob'))
	})

	await check('a storage failure of a non-Error kind (string, undefined) is also survived', async () => {
		for (const thrown of ['just text', undefined, null, { weird: true }]) {
			storageImpl = async () => {
				throw thrown
			}
			const events = []
			let result
			await captureLogs(async () => {
				result = await purgeWorkspaceMedia(spyDb(events), W3)
			})
			assert.deepEqual(result, { blobs: 0, assets: 7, folders: 7 })
			assert.equal(events.length, 5)
		}
	})

	await check('a synchronous throw from the blob step is survived too', async () => {
		storageImpl = () => {
			throw new TypeError('sync')
		}
		const events = []
		let result
		await captureLogs(async () => {
			result = await purgeWorkspaceMedia(spyDb(events), W3)
		})
		assert.equal(result.blobs, 0)
		assert.equal(events.length, 5)
	})

	await check('order and filters: blobs first, four workspace deletes, usage last, nothing else', async () => {
		const events = []
		storageImpl = async () => {
			events.push({ op: 'blobs' })
			return 2
		}
		const result = await purgeWorkspaceMedia(spyDb(events), W)
		assert.deepEqual(result, { blobs: 2, assets: 7, folders: 7 })
		assert.deepEqual(
			events.map((e) => (e.op === 'blobs' ? 'blobs' : e.name)),
			['blobs', T.MEDIA_ASSETS, T.MEDIA_FOLDERS, T.MEDIA_TAG_RULES, T.MEDIA_SAVED_SEARCHES, USAGE],
		)
		for (const e of events.slice(1, 5)) {
			assert.deepEqual(Object.keys(e.filter), ['workspaceId'], `${e.name} filter is exactly the workspace`)
			assert.ok(e.filter.workspaceId instanceof ObjectId)
			assert.equal(e.filter.workspaceId.toHexString(), hex(W))
		}
		const usage = events[5].filter
		assert.deepEqual(Object.keys(usage), ['_id'])
		assert.deepEqual(Object.keys(usage._id), ['$regex'], 'no options (case-sensitive), no other operator')
		const source = String(usage._id.$regex)
		assert.ok(source.startsWith('^'), 'anchored at the start')
		assert.ok(source.endsWith(':'), 'ends at the colon')
		const re = new RegExp(source)
		assert.ok(W_USAGE.every((id) => re.test(id)))
		assert.ok(DECOY_USAGE.every((id) => !re.test(id)))
	})

	await check('one failing collection is logged and the rest still run, counts stay honest', async () => {
		for (const failing of [...COLLECTIONS, USAGE]) {
			const events = []
			storageImpl = async () => 1
			let result
			const logs = await captureLogs(async () => {
				result = await purgeWorkspaceMedia(spyDb(events, { failOn: [failing] }), W)
			})
			assert.equal(events.length, 5, `${failing}: every step was still attempted`)
			assert.equal(logs.length, 1, `${failing}: one log line`)
			assert.equal(result.blobs, 1)
			assert.equal(result.assets, failing === T.MEDIA_ASSETS ? 0 : 7)
			assert.equal(result.folders, failing === T.MEDIA_FOLDERS ? 0 : 7)
		}
	})

	await check('a real database failure on one collection leaves the others purged', async () => {
		const w = new ObjectId()
		seededWorkspaces.push(w)
		await seed(w, 'g', 2)
		const broken = {
			collection: (name) =>
				name === T.MEDIA_FOLDERS
					? {
							deleteMany: async () => {
								throw new Error('folders unavailable')
							},
						}
					: db.collection(name),
		}
		storageImpl = async () => 0
		let result
		await captureLogs(async () => {
			result = await purgeWorkspaceMedia(broken, w)
		})
		assert.deepEqual(result, { blobs: 0, assets: 2, folders: 0 })
		assert.deepEqual(await countFor(w), [0, 2, 0, 0])
		// a retry (idempotent) finishes the job
		assert.deepEqual(await purgeWorkspaceMedia(db, w), { blobs: 0, assets: 0, folders: 2 })
	})

	await check('hostile workspace ids are refused before anything is deleted', async () => {
		const hostile = [
			undefined,
			null,
			'',
			hex(W), // a string is not an ObjectId: it would match nothing, and say it succeeded
			{},
			{ toHexString: () => hex(W) },
			{ _bsontype: 'ObjectId', toHexString: () => '../../..' },
			{ _bsontype: 'ObjectId', toHexString: () => `${hex(W)}.*` },
			{ _bsontype: 'ObjectId', toHexString: () => '.*' },
			{ _bsontype: 'ObjectId', toHexString: () => hex(W).toUpperCase() + 'x' },
			{ _bsontype: 'ObjectId', toHexString: () => 42 },
			{ _bsontype: 'ObjectId' },
			0,
			42,
			[],
			[W],
			new Date(),
			Symbol.iterator,
		]
		for (const value of hostile) {
			const events = []
			storageCalls.length = 0
			let threw = false
			try {
				await purgeWorkspaceMedia(spyDb(events), value)
			} catch {
				threw = true
			}
			assert.ok(threw, `refused: ${String(typeof value === 'symbol' ? 'symbol' : JSON.stringify(value))}`)
			assert.equal(events.length, 0, 'no delete was issued')
			assert.equal(storageCalls.length, 0, 'no blob was deleted')
		}
	})

	await check('the purge of W never touched the decoy workspace after all the above', async () => {
		assert.deepEqual(await countFor(D), [5, 4, 4, 4], 'D was seeded twice: 4+1 assets, 2+2 of the rest')
		assert.deepEqual(await usageLeft(DECOY_USAGE), [...DECOY_USAGE].sort())
	})

	await check('source never builds a blob target from anything but the workspace id', () => {
		const text = readFileSync(join(ROOT, 'src/lib/media/purge.ts'), 'utf8')
		assert.ok(!/\bdel\s*\(/.test(text), 'purge does not call del() itself')
		assert.ok(!/@vercel\/blob/.test(text), 'purge does not talk to the store directly')
		assert.ok(/deleteAllUnderPrefix\(hex\)/.test(text))
		assert.ok(/invalidateVocabulary\(/.test(text))
		assert.ok(!/(createIndex|dropIndex|drop\()/.test(text))
	})

	// ------------------------------------------------------------------ the route

	section('Part 2: the account settings route')

	const events = []
	let currentSites = []
	let authState = null
	let purgeImpl = async () => ({ blobs: 0, assets: 0, folders: 0 })
	const purgeCalls = []
	const wsId = new ObjectId()
	const workspace = { _id: wsId, name: 'Acme' }

	const fakeDb = {
		collection(name) {
			return {
				find: (filter) => {
					events.push({ op: 'find', name, filter })
					return { toArray: async () => currentSites }
				},
				deleteMany: async (filter) => {
					events.push({ op: 'deleteMany', name, filter })
				},
				deleteOne: async (filter) => {
					events.push({ op: 'deleteOne', name, filter })
				},
				updateOne: async (filter, update) => {
					events.push({ op: 'updateOne', name, filter, update })
				},
			}
		},
	}

	class FakeHttpError extends Error {}
	mock('next/server', {
		NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
	})
	mock('next/headers', {
		cookies: async () => ({ delete: (name) => events.push({ op: 'cookie', name }) }),
	})
	mock('@vercel/blob', {
		del: (urls) => {
			events.push({ op: 'del', urls })
			return delRejects ? Promise.reject(new Error('blob outage')) : Promise.resolve()
		},
	})
	let delRejects = false
	mock('@/lib/auth/guards', {
		errorResponse: (error) => ({ body: { error: 'guard' }, status: error instanceof FakeHttpError ? 403 : 500 }),
		requirePermission: async () => {
			if (authState === 'denied') throw new FakeHttpError('denied')
			return { db: fakeDb, workspace, isOwner: authState !== 'member' }
		},
	})
	mock('@/lib/workspace/current', { WORKSPACE_COOKIE: 'rb-workspace' })
	mock('@/lib/media/purge', {
		purgeWorkspaceMedia: (...args) => {
			purgeCalls.push(args)
			events.push({ op: 'purge' })
			return purgeImpl(...args)
		},
	})

	clearCache()
	const route = loadTs('src/app/api/account/settings/route.ts')
	const request = (body) => ({ json: async () => body })
	const reset = () => {
		events.length = 0
		purgeCalls.length = 0
		purgeImpl = async () => ({ blobs: 0, assets: 0, folders: 0 })
		delRejects = false
		authState = null
		currentSites = [{ media: [{ url: 'https://a.example/1.png' }, { url: 'https://a.example/2.png' }] }, {}]
	}
	const indexOf = (op, name) => events.findIndex((e) => e.op === op && (name === undefined || e.name === name))
	const lastIndexOf = (pred) => events.map(pred).lastIndexOf(true)
	const workspaceRemovals = () => events.filter((e) => e.op === 'deleteMany' || e.op === 'deleteOne')

	await check('DELETE calls purgeWorkspaceMedia once, with the db and the workspace id', async () => {
		reset()
		const response = await route.DELETE(request({ confirm: 'Acme' }))
		assert.deepEqual(response, { body: { ok: true }, status: 200 })
		assert.equal(purgeCalls.length, 1)
		assert.equal(purgeCalls[0].length, 2)
		assert.equal(purgeCalls[0][0], fakeDb)
		assert.equal(purgeCalls[0][1], wsId)
	})

	await check('the purge runs after the site blobs and before every workspace document removal', async () => {
		reset()
		await route.DELETE(request({ confirm: ' Acme ' }))
		const purge = indexOf('purge')
		assert.ok(purge > 0)
		assert.ok(indexOf('del') >= 0 && indexOf('del') < purge, 'site blobs first')
		assert.deepEqual(events[indexOf('del')].urls, ['https://a.example/1.png', 'https://a.example/2.png'])
		const removals = workspaceRemovals()
		assert.ok(removals.length >= 5, 'sites, members, roles, invites, workspace')
		for (const removal of removals) assert.ok(events.indexOf(removal) > purge, `${removal.name} is removed after the purge`)
		const lastWorkspaceRemoval = lastIndexOf((e) => e.op === 'deleteOne' && e.name === 'workspaces')
		assert.ok(lastWorkspaceRemoval > purge)
		assert.equal(events.at(-1).op, 'cookie', 'cookie still cleared last')
	})

	await check('a rejecting purge changes nothing in the response or the deletions', async () => {
		reset()
		await route.DELETE(request({ confirm: 'Acme' }))
		const clean = { response: null, ops: events.filter((e) => e.op !== 'purge').map((e) => `${e.op}:${e.name ?? ''}`) }

		for (const failure of [
			async () => {
				throw new Error('blob outage')
			},
			() => {
				throw new Error('sync outage')
			},
			() => Promise.reject('a string'),
			() => Promise.reject(undefined),
		]) {
			reset()
			purgeImpl = failure
			let response
			const logs = await captureLogs(async () => {
				response = await route.DELETE(request({ confirm: 'Acme' }))
			})
			assert.deepEqual(response, { body: { ok: true }, status: 200 })
			assert.equal(purgeCalls.length, 1)
			assert.equal(logs.length, 1, 'the failure is logged')
			assert.deepEqual(
				events.filter((e) => e.op !== 'purge').map((e) => `${e.op}:${e.name ?? ''}`),
				clean.ops,
				'the same deletions happen in the same order',
			)
		}
	})

	await check('a failing site-blob delete still reaches the purge and the account deletion', async () => {
		reset()
		delRejects = true
		const response = await route.DELETE(request({ confirm: 'Acme' }))
		assert.equal(response.status, 200)
		assert.equal(purgeCalls.length, 1)
		assert.ok(indexOf('deleteOne', 'workspaces') > indexOf('purge'))
	})

	await check('a project with no images skips the site-blob delete but still purges the library', async () => {
		reset()
		currentSites = []
		await route.DELETE(request({ confirm: 'Acme' }))
		assert.equal(indexOf('del'), -1)
		assert.equal(purgeCalls.length, 1)
	})

	await check('the guards still come first: no purge for a wrong name, a missing body, a non-owner or a denied caller', async () => {
		for (const [body, state, status] of [
			[{ confirm: 'acme' }, null, 400],
			[{ confirm: 'Acme ' + 'x' }, null, 400],
			[{ confirm: 42 }, null, 400],
			[{}, null, 400],
			[null, null, 400],
			[{ confirm: 'Acme' }, 'member', 403],
			[{ confirm: 'Acme' }, 'denied', 403],
		]) {
			reset()
			authState = state
			const response = await route.DELETE(request(body))
			assert.equal(response.status, status, JSON.stringify([body, state]))
			assert.equal(purgeCalls.length, 0, `no purge for ${JSON.stringify([body, state])}`)
			assert.equal(workspaceRemovals().length, 0, 'nothing was deleted')
		}
	})

	await check('PATCH still renames and never purges', async () => {
		reset()
		const ok = await route.PATCH(request({ name: '  New name  ' }))
		assert.deepEqual(ok, { body: { ok: true }, status: 200 })
		const update = events.find((e) => e.op === 'updateOne')
		assert.deepEqual(update.filter, { _id: wsId })
		assert.equal(update.update.$set.name, 'New name')
		assert.equal(purgeCalls.length, 0)
		reset()
		for (const body of [{}, { name: '' }, { name: 'x'.repeat(81) }, null]) {
			const bad = await route.PATCH(request(body))
			assert.equal(bad.status, 400)
		}
		assert.equal(events.filter((e) => e.op === 'updateOne').length, 0)
		assert.equal(purgeCalls.length, 0)
	})

	await check('source: one import, one call, PATCH text is byte-for-byte the original', () => {
		// The working tree may hold CRLF (autocrlf); the content is what is under test.
		const text = readFileSync(join(ROOT, 'src/app/api/account/settings/route.ts'), 'utf8').replace(/\r\n/g, '\n')
		assert.equal((text.match(/purgeWorkspaceMedia/g) ?? []).length, 2, 'the import and the one call, nothing else')
		assert.equal((text.match(/purgeWorkspaceMedia\(/g) ?? []).length, 1)
		assert.ok(text.includes("import { purgeWorkspaceMedia } from '@/lib/media/purge'\n"))
		const patch = text.slice(
			text.indexOf('export async function PATCH'),
			text.indexOf('/**\n * Only the owner'),
		)
		const original = `export async function PATCH(request: Request) {
	try {
		const { db, workspace } = await requirePermission('account.manage')

		const parsed = schema.safeParse(await request.json().catch(() => null))
		if (!parsed.success)
			return NextResponse.json(
				{ error: 'Enter a name between 1 and 80 characters.' },
				{ status: 400 },
			)

		await db
			.collection<WorkspaceDoc>(WORKSPACES)
			.updateOne(
				{ _id: workspace._id },
				{ $set: { name: parsed.data.name.trim(), updatedAt: new Date() } },
			)

		return NextResponse.json({ ok: true })
	} catch (error) {
		return errorResponse(error)
	}
}

`
		assert.equal(patch, original)
		const del = text.slice(text.indexOf('export async function DELETE'))
		const at = del.indexOf('await purgeWorkspaceMedia(db, workspace._id)')
		assert.ok(at > del.indexOf('await del(urls)'), 'after the site blob cleanup')
		assert.ok(at < del.indexOf("db.collection('sites').deleteMany"), 'before the first workspace removal')
		assert.ok(/try \{\n\t\t\tawait purgeWorkspaceMedia[\s\S]*?\} catch \(error\) \{[\s\S]*?\n\t\t\}/.test(del), 'wrapped in a swallowing try/catch')
		assert.ok(!/;\s*$/m.test(text), 'no semicolons added')
	})
} finally {
	for (const c of COLLECTIONS) await db.collection(c).deleteMany({ workspaceId: { $in: seededWorkspaces } })
	await db.collection(USAGE).deleteMany({ _id: { $in: seededUsageIds } })
	const leftovers =
		(
			await Promise.all(
				COLLECTIONS.map((c) => db.collection(c).countDocuments({ workspaceId: { $in: seededWorkspaces } })),
			)
		).reduce((a, b) => a + b, 0) + (await db.collection(USAGE).countDocuments({ _id: { $in: seededUsageIds } }))
	if (leftovers) console.log(`WARN  ${leftovers} proof documents could not be cleaned up`)
	await client.close()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
