/**
 * Proves src/lib/media/assets.ts, the asset lifecycle (register, edit, bulk, delete),
 * against the REAL source and the real database:
 *
 *   node --env-file=.env scripts/prove-media-assets.mjs
 *
 * Nothing touches the network. '@vercel/blob' is replaced by an in-memory store and
 * global fetch by a function that only answers from it; the real storage.ts runs on top
 * of those (so the real URL checks and the real, guarded `deleteBlob` are exercised),
 * wrapped in a thin recording layer registered as '@/lib/media/storage'. Bytes are real
 * images generated with sharp and go through the real analyze.ts.
 *
 * Expected values come from the specification (the stub doc comments and the build spec),
 * not from what the code printed. Concurrent writers and the upload webhook's twin are
 * SIMULATED by pausing one call at a chosen database call and running another to the end
 * meanwhile, and by killing a call (it simply never continues) at every step.
 *
 * Hygiene: every run uses fresh workspace ids and only creates, reads and deletes
 * documents carrying them, in mediaAssets, mediaFolders and mediaTagRules; all of it is
 * deleted in a `finally`. No indexes are created or dropped (the unique pathname index
 * must already exist: scripts/ensure-indexes.mjs).
 *
 * Knobs: PROVE_ONLY=<regex> runs only the checks whose name matches; PROVE_ASSETS=<path>
 * loads another copy of assets.ts (used to check this proof FAILS on deliberately broken
 * code).
 */
import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadTs, mock, rootRequire, ROOT } = require('./lib/load-ts.cjs')
const { MongoClient, ObjectId } = rootRequire('mongodb')
const sharp = rootRequire('sharp')

const uri = process.env.MONGODB_URI
if (!uri) {
	console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/prove-media-assets.mjs')
	process.exit(1)
}

// Nothing here may be able to reach a real store, even by accident.
delete process.env.BLOB_READ_WRITE_TOKEN
const realFetch = globalThis.fetch
const originalEnv = {
	ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
	MEDIA_AI_ENABLED: process.env.MEDIA_AI_ENABLED,
}
// The default for every check: no key, so tagging is not configured. A check that needs a key is exclusive and puts it back.
delete process.env.ANTHROPIC_API_KEY
delete process.env.MEDIA_AI_ENABLED

/* -------------------------------------------------------------------------- */
/* Per-check state                                                            */
/* -------------------------------------------------------------------------- */

// Checks run concurrently (the database is a long way away), so everything a check can observe or change
// about the outside world lives in a context that follows its async chain: the fake store, what was called,
// what was injected, what was logged. The names below are views of the current check's context.
const als = new AsyncLocalStorage()
const makeContext = () => ({
	blobs: new Map(),
	calls: { head: [], read: [], del: [] },
	sdkCalls: { head: [], del: [], fetch: [] },
	faults: { del: new Set(), headError: null, fetchStatus: null, fetchThrow: false },
	hooks: { head: null, read: null, del: null },
	logs: { warn: [], error: [] },
})
const rootContext = makeContext()
const here = () => als.getStore() ?? rootContext
const part = (key) =>
	new Proxy(
		{},
		{
			get: (_, prop) => here()[key][prop],
			set: (_, prop, value) => {
				here()[key][prop] = value
				return true
			},
		},
	)
const calls = part('calls')
const sdkCalls = part('sdkCalls')
const faults = part('faults')
const hooks = part('hooks')
const logs = part('logs')
/** href -> { url, pathname, size, contentType, bytes } */
const blobs = new Proxy(new Map(), {
	get: (_, prop) => {
		const real = here().blobs
		const value = real[prop]
		return typeof value === 'function' ? value.bind(real) : value
	},
})
/** A fresh context for a piece of a check that needs its own state (several runs inside one exclusive check). */
const inContext = (fn) => als.run(makeContext(), fn)

/* -------------------------------------------------------------------------- */
/* The fake store: @vercel/blob and fetch                                     */
/* -------------------------------------------------------------------------- */

const STORE = 'proofstore'
const blobUrl = (pathname) =>
	`https://${STORE}.public.blob.vercel-storage.com/${pathname.split('/').map(encodeURIComponent).join('/')}`
/** The form a URL takes once parsed: what the real head() and fetch() are called with. */
const norm = (url) => new URL(url).href

class BlobNotFoundError extends Error {
	constructor() {
		super('Vercel Blob: The requested blob does not exist')
	}
}

mock('@vercel/blob', {
	BlobNotFoundError,
	head: async (href) => {
		sdkCalls.head.push(href)
		if (faults.headError) throw faults.headError
		const blob = blobs.get(href)
		if (!blob) throw new BlobNotFoundError()
		return { url: blob.url, downloadUrl: blob.url, pathname: blob.pathname, size: blob.size, contentType: blob.contentType }
	},
	del: async (target) => {
		for (const href of Array.isArray(target) ? target : [target]) {
			sdkCalls.del.push(href)
			if (faults.del.has(href)) throw new Error('store unavailable (secret-store-detail)')
			blobs.delete(href)
		}
	},
	list: async () => {
		throw new Error('list is not part of the asset lifecycle')
	},
})

globalThis.fetch = async (input) => {
	const href = String(input?.url ?? input)
	sdkCalls.fetch.push(href)
	if (faults.fetchThrow) throw new TypeError('fetch failed')
	if (faults.fetchStatus) return new Response(null, { status: faults.fetchStatus })
	const blob = blobs.get(href)
	if (!blob) return new Response(null, { status: 404 })
	return new Response(blob.bytes, { status: 200, headers: { 'content-length': String(blob.bytes.length) } })
}

const realStorage = loadTs('src/lib/media/storage.ts')

// What assets.ts sees as '@/lib/media/storage': the real module, with each external call recorded
// (and pausable) at the boundary. The real deleteBlob guard still runs underneath.
const storageMock = {
	...realStorage,
	headBlob: async (url) => {
		calls.head.push(url)
		await hooks.head?.(url, calls.head.length)
		return realStorage.headBlob(url)
	},
	readBlob: async (url, opts) => {
		calls.read.push(url)
		await hooks.read?.(url, calls.read.length)
		return realStorage.readBlob(url, opts)
	},
	deleteBlob: async (info, prefix) => {
		calls.del.push({ info: structuredClone(info), prefix })
		await hooks.del?.(info, calls.del.length)
		return realStorage.deleteBlob(info, prefix)
	},
}
mock('@/lib/media/storage', storageMock)

const ASSETS_FILE = process.env.PROVE_ASSETS ?? 'src/lib/media/assets.ts'
const A = loadTs(ASSETS_FILE)
const V = loadTs('src/lib/media/vocabulary.ts')
const T = loadTs('src/lib/media/types.ts')
const { derivedFields, buildTerms } = loadTs('src/lib/media/terms.ts')
const { filenameTags } = loadTs('src/lib/media/filename-tags.ts')
const { MediaError } = loadTs('src/lib/media/errors.ts')
const { folderKey } = loadTs('src/lib/media/folder-index.ts')
const { MEDIA_LIMITS } = T

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
const only = process.env.PROVE_ONLY ? new RegExp(process.env.PROVE_ONLY, 'i') : null
console.warn = (...args) => here().logs.warn.push(args.map(String).join(' '))
console.error = (...args) => here().logs.error.push(args.map(String).join(' '))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const NEVER = () => new Promise(() => {})

/*
 * The scheduler. `check` queues a check and returns at once; up to PROVE_CONCURRENCY run together, each in a
 * context of its own, and results print in the order the checks were written. A check that changes something
 * global (a library limit, an environment variable) is `exclusive`: it starts only when nothing else is running
 * and nothing else starts until it is done. Waiting for the pool to empty must not leave the pool idle, so an
 * exclusive check takes its turn only when no ordinary check is left to start (they all still run, one by one).
 */
const CONCURRENCY = Math.max(1, Number(process.env.PROVE_CONCURRENCY ?? 8))
/** The runner (prove-media-all) gives a proof five minutes; this ends the run, cleanup included, before that. */
const WATCHDOG_MS = Number(process.env.PROVE_WATCHDOG_MS ?? 4.5 * 60_000)
const entries = []
const queue = []
const runningNames = new Set()
let running = 0
let exclusiveRunning = false
let printed = 0

function flush() {
	while (printed < entries.length && entries[printed].line !== null) console.log(entries[printed++].line)
}

async function execute({ entry, name, fn, opts }) {
	const started = Date.now()
	runningNames.add(name)
	try {
		await fn()
		// The commit logs a rejected write and the terms builder an over-long index: neither is expected.
		if (!opts.errorsOk && logs.error.length) throw new Error(`unexpected console.error: ${logs.error[0]}`)
		passed++
		entry.line = `PASS  ${name}${process.env.PROVE_TIMES ? ` (${Date.now() - started} ms)` : ''}`
	} catch (error) {
		failed++
		const detail = (error && error.message ? error.message : String(error)).split('\n').slice(0, 8).join(' | ')
		entry.line = `FAIL  ${name} (${detail})`
	} finally {
		runningNames.delete(name)
	}
}

function pump() {
	while (queue.length) {
		if (exclusiveRunning || running >= CONCURRENCY) return
		let next = queue.findIndex((queued) => !queued.opts.exclusive)
		if (next < 0) {
			// Only exclusive checks are left: each needs the pool empty.
			if (running > 0) return
			next = 0
		}
		const [task] = queue.splice(next, 1)
		running++
		if (task.opts.exclusive) exclusiveRunning = true
		als
			.run(makeContext(), () => execute(task))
			.finally(() => {
				running--
				if (task.opts.exclusive) exclusiveRunning = false
				flush()
				task.resolve()
				pump()
			})
	}
}

function check(name, fn, opts = {}) {
	if (only && !only.test(name)) return Promise.resolve()
	const entry = { line: null }
	entries.push(entry)
	return new Promise((resolve) => {
		queue.push({ entry, name, fn, opts, resolve })
		pump()
	})
}
function section(title) {
	entries.push({ line: `\n== ${title}` })
	flush()
}
async function drain() {
	while (queue.length || running) await sleep(20)
	flush()
}

/** Runs `fn` with environment variables set (exclusive checks only: the environment is global), then puts the default back. */
async function withEnv(vars, fn) {
	Object.assign(process.env, vars)
	try {
		return await fn()
	} finally {
		delete process.env.ANTHROPIC_API_KEY
		delete process.env.MEDIA_AI_ENABLED
	}
}

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

/**
 * Runs `fn` with some MEDIA_LIMITS lowered, then puts them back. The library reads the limits when it runs,
 * so the slice size and the asset cap can be proved at small scale (every step, every kill point) while the
 * production values get their own, bigger check.
 */
async function withLimits(over, fn) {
	const saved = {}
	for (const key of Object.keys(over)) {
		saved[key] = MEDIA_LIMITS[key]
		MEDIA_LIMITS[key] = over[key]
	}
	try {
		return await fn()
	} finally {
		for (const key of Object.keys(saved)) MEDIA_LIMITS[key] = saved[key]
	}
}

/**
 * The same db with every call visible to `hook({ coll, method, n, phase, args, result })`, which
 * may delay (await), throw, or never return (a killed process). `n` counts calls per `coll.method`.
 */
function spyDb(real, hook = async () => {}) {
	const counts = new Map()
	const tick = (coll, method) => {
		const key = `${coll}.${method}`
		const n = (counts.get(key) ?? 0) + 1
		counts.set(key, n)
		return n
	}
	const wrap = (coll) =>
		new Proxy(real.collection(coll), {
			get(target, prop) {
				const value = Reflect.get(target, prop)
				if (typeof value !== 'function' || typeof prop !== 'string') return value
				if (prop === 'find' || prop === 'aggregate') {
					return (...args) => {
						const cursor = value.apply(target, args)
						const n = tick(coll, prop)
						const proxy = new Proxy(cursor, {
							get(c, p) {
								const inner = Reflect.get(c, p)
								if (p === 'toArray')
									return async () => {
										const ev = { coll, method: prop, n, args }
										await hook({ ...ev, phase: 'before' })
										const result = await c.toArray()
										await hook({ ...ev, phase: 'after', result })
										return result
									}
								if (typeof inner !== 'function') return inner
								// `.sort().limit().toArray()`: a chained call hands back the cursor, and it must be this one.
								return (...a) => {
									const out = inner.apply(c, a)
									return out === c ? proxy : out
								}
							},
						})
						return proxy
					}
				}
				return async (...args) => {
					const ev = { coll, method: prop, n: tick(coll, prop), args }
					await hook({ ...ev, phase: 'before' })
					const result = await value.apply(target, args)
					await hook({ ...ev, phase: 'after', result })
					return result
				}
			},
		})
	return { collection: wrap, counts }
}

const at = (ev, coll, method, n, phase = 'before') =>
	ev.coll === coll && ev.method === method && ev.n === n && ev.phase === phase

/**
 * The same db whose `k`-th call (every collection and method counted together, in the order the calls start)
 * fails. `how` 'throw' rejects it; 'kill' never lets it continue, which is a process that died. `phase` 'before'
 * fails it without running it; 'after' runs it first: a write that landed and whose answer never came back.
 * `calls()` is how many calls have started, so a clean run through `faultyDb(db, { k: Infinity })` counts them.
 */
function faultyDb(real, { k, how = 'throw', phase = 'before' }) {
	let count = 0
	let fired = false
	const ordinal = new Map()
	const reached = gate()
	const spy = spyDb(real, async (ev) => {
		const key = `${ev.coll}.${ev.method}#${ev.n}`
		if (ev.phase === 'before') ordinal.set(key, ++count)
		if (ev.phase !== phase || ordinal.get(key) !== k) return
		fired = true
		reached.open()
		if (how === 'kill') await NEVER()
		throw new Error('database went away')
	})
	return { db: spy, reached, calls: () => count, fired: () => fired }
}

/** The three ways a call can fail that matter: it never runs, it never finishes, it runs and its answer is lost. */
const FAULTS = [
	{ how: 'throw', phase: 'before' },
	{ how: 'kill', phase: 'before' },
	{ how: 'throw', phase: 'after' },
]
const faultName = (f) => `${f.how === 'kill' ? 'killed' : f.phase === 'after' ? 'answer lost' : 'failed'}`

/**
 * Runs `attempt(db)` with one fault and returns once it has failed (a thrown fault returns the error; a kill returns
 * `null` the moment it hangs). A fault point that was never reached is a mistake in the sweep, not a pass. A failure
 * that the operation absorbs by design (a best-effort cleanup) is allowed only where `absorbed` says so.
 */
async function faulted(real, fault, attempt, { absorbed = false } = {}) {
	const f = faultyDb(real, fault)
	const run = attempt(f.db)
	if (fault.how === 'kill') {
		run.catch(() => {})
		const outcome = await Promise.race([f.reached.wait().then(() => 'hung'), run.then(() => 'finished', () => 'threw')])
		assert.equal(outcome, 'hung', `call ${fault.k} was never reached (${outcome})`)
		return null
	}
	let error = null
	try {
		await run
	} catch (e) {
		error = e
	}
	assert.ok(f.fired(), `call ${fault.k} was never reached`)
	if (!absorbed) assert.ok(error, `a failure of call ${fault.k} (${faultName(fault)}) went unnoticed`)
	return error
}

/* -------------------------------------------------------------------------- */
/* Database                                                                   */
/* -------------------------------------------------------------------------- */

const client = new MongoClient(uri)
const workspaces = []
const newWs = () => {
	const id = new ObjectId()
	workspaces.push(id)
	return id
}
const hex = (id) => id.toHexString()
const prefixOf = (ws) => `workspaces/${hex(ws)}/media/`

let db
let assetCol
let folderCol
let ruleCol

const byKey = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0)
const docOf = (id) => assetCol.findOne({ _id: id })
const countIn = (ws, extra = {}) => assetCol.countDocuments({ workspaceId: ws, ...extra })

/** A full document as the library would store it, built with the real derivedFields. */
function assetDoc(ws, over = {}) {
	const _id = over._id ?? new ObjectId()
	const file = over.filename ?? `seed-${hex(_id).slice(-8)}.png`
	const pathname = over.pathname ?? `${prefixOf(ws)}${hex(_id)}-${file}`
	const base = {
		_id,
		workspaceId: ws,
		folderId: null,
		name: 'Seed',
		nameKey: '',
		filename: file,
		url: blobUrl(pathname),
		pathname,
		contentType: 'image/png',
		bytes: 1000,
		width: 10,
		height: 10,
		pixels: 100,
		orientation: 'square',
		hasAlpha: false,
		animated: false,
		colors: [],
		colorNames: [],
		brightness: 'mid',
		saturation: 'muted',
		sha256: createHash('sha256').update(hex(_id)).digest('hex'),
		blur: null,
		tags: [],
		rejectedTags: [],
		caption: '',
		altText: '',
		captionEdited: false,
		textInImage: '',
		keywords: [],
		kind: null,
		notes: '',
		terms: [],
		termsVersion: T.MEDIA_TERMS_VERSION,
		rev: 0,
		tagging: { status: 'done', attempts: 1 },
		uploadedBy: 'seed',
		createdAt: new Date('2026-01-01T00:00:00Z'),
		updatedAt: new Date('2026-01-01T00:00:00Z'),
		...over,
	}
	return { ...base, ...derivedFields(base) }
}

/** Inserts n documents (and, unless told not to, their blobs in the fake store). */
async function seed(ws, n, over = {}, { blobsToo = true } = {}) {
	if (n === 0) return []
	const docs = Array.from({ length: n }, (_, i) =>
		assetDoc(ws, typeof over === 'function' ? over(i) : over),
	)
	for (let start = 0; start < docs.length; start += 1000)
		await assetCol.insertMany(docs.slice(start, start + 1000), { ordered: false })
	if (blobsToo)
		for (const d of docs)
			blobs.set(norm(d.url), { url: norm(d.url), pathname: d.pathname, size: d.bytes, contentType: d.contentType, bytes: Buffer.from('x') })
	return docs
}

const manual = (slug, label = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ')) => ({ slug, label, source: 'manual' })
const vision = (slug, confidence = 0.9, label = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ')) => ({ slug, label, source: 'auto', via: 'vision', confidence })
const fname = (slug, label = slug.charAt(0).toUpperCase() + slug.slice(1)) => ({ slug, label, source: 'auto', via: 'filename' })
const slugsOf = (doc) => doc.tags.map((t) => t.slug)

/* -------------------------------------------------------------------------- */
/* Images                                                                     */
/* -------------------------------------------------------------------------- */

const imageCache = new Map()
const cached = async (key, build) => {
	if (!imageCache.has(key)) imageCache.set(key, await build())
	return imageCache.get(key)
}
const rgbOf = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255]
const encode = (image, format) => {
	switch (format) {
		case 'jpg':
			return image.jpeg({ quality: 90 }).toBuffer()
		case 'png':
			return image.png().toBuffer()
		case 'webp':
			return image.webp({ lossless: true }).toBuffer()
		case 'avif':
			return image.avif({ quality: 80 }).toBuffer()
		case 'gif':
			return image.gif().toBuffer()
		default:
			throw new Error(`bad format ${format}`)
	}
}
const solid = (rgb, w = 64, h = 48, format = 'png') =>
	cached(`solid:${rgb}:${w}:${h}:${format}`, () =>
		encode(sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }), format),
	)
const WHITE = [255, 255, 255]
/** An image that no call with a different n can equal. */
const unique = (n, format = 'png') => solid(rgbOf(n + 1000), 16, 16, format)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

const transparentPng = () =>
	cached('transparent', () => {
		const w = 32
		const h = 32
		const data = Buffer.alloc(w * h * 4)
		for (let i = 0; i < w * h; i++) {
			data[i * 4] = 255
			data[i * 4 + 3] = i % w < 16 ? 0 : 255
		}
		return sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
	})
const animatedGif = () =>
	cached('anim', () => {
		const size = 10
		const frames = 3
		const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255]]
		const raw = Buffer.alloc(size * size * frames * 3)
		for (let f = 0; f < frames; f++)
			for (let i = 0; i < size * size; i++) {
				const at = (f * size * size + i) * 3
				raw[at] = colors[f][0]
				raw[at + 1] = colors[f][1]
				raw[at + 2] = colors[f][2]
			}
		return sharp(raw, { raw: { width: size, height: size * frames, channels: 3, pageHeight: size } })
			.gif({ loop: 0, delay: Array(frames).fill(100) })
			.toBuffer()
	})
const rotatedJpeg = () =>
	cached('rotated', () =>
		sharp({ create: { width: 100, height: 50, channels: 3, background: { r: 200, g: 40, b: 40 } } })
			.jpeg({ quality: 90 })
			.withMetadata({ orientation: 6 })
			.toBuffer(),
	)

/* -------------------------------------------------------------------------- */
/* Blobs, registration, assertions                                            */
/* -------------------------------------------------------------------------- */

let seq = 0
/** Puts a blob in the fake store, in `ws`'s prefix unless told otherwise. */
function put(ws, bytes, opts = {}) {
	const name = opts.name ?? `img-${++seq}.png`
	const pathname = opts.pathname ?? `${prefixOf(ws)}${name}`
	const url = norm(blobUrl(pathname))
	blobs.set(url, {
		url,
		pathname,
		size: opts.size ?? bytes.length,
		contentType: opts.contentType ?? 'image/png',
		bytes,
	})
	return { url, pathname, name }
}

const register = (ws, ref, extra = {}, d = db) =>
	A.registerUploadedBlob(
		d,
		{ workspaceId: ws, userId: 'user-1' },
		{ url: ref.url, pathname: ref.pathname, filename: ref.name ?? 'image.png', folderId: null, ...extra },
	)

async function rejects(promise, status, label = '') {
	let thrown
	try {
		await promise
	} catch (error) {
		thrown = error
	}
	assert.ok(thrown, `${label} should have thrown`)
	assert.ok(thrown instanceof A.AssetError, `${label} threw ${thrown?.name}: ${thrown?.message}`)
	assert.ok(thrown instanceof MediaError, 'AssetError extends MediaError')
	assert.equal(thrown.status, status, `${label} status (${thrown.message})`)
	assert.ok(typeof thrown.message === 'string' && thrown.message.length > 0, 'a message a person can read')
	return thrown
}

const noLeak = (error) =>
	assert.ok(
		!/workspaces\/|blob\.vercel|proofstore|secret-store|Blob store|stack|\bat\s+\w+\s+\(/i.test(error.message),
		`the message must not carry internals: ${error.message}`,
	)

const assertNoDeletes = () => {
	assert.deepEqual(calls.del, [], 'deleteBlob must not be called')
	assert.deepEqual(sdkCalls.del, [], 'del() must not be called')
}
const assertNoRead = () => {
	assert.deepEqual(calls.read, [], 'readBlob must not be called')
	assert.deepEqual(sdkCalls.fetch, [], 'nothing may be downloaded')
}
/** Exactly these blobs were deleted, each through deleteBlob with the workspace prefix, and are gone. */
function assertDeleted(ws, refs) {
	const want = refs.map((r) => ({ url: norm(r.url), pathname: r.pathname })).sort(byKey('pathname'))
	const got = calls.del.map((c) => ({ url: c.info.url, pathname: c.info.pathname })).sort(byKey('pathname'))
	assert.deepEqual(got, want, 'deleteBlob targets')
	for (const c of calls.del) assert.equal(c.prefix, prefixOf(ws), 'deleteBlob is given the workspace prefix')
	assert.deepEqual([...sdkCalls.del].sort(), want.map((r) => r.url).sort(), 'del() urls')
	for (const r of want) assert.ok(!blobs.has(r.url), `${r.pathname} should be gone from the store`)
}
const assertKept = (refs) => {
	for (const r of refs) assert.ok(blobs.has(norm(r.url)), `${r.pathname} must still be stored`)
}

const lastCleanups = []

/* -------------------------------------------------------------------------- */

async function main() {
	await client.connect()
	db = client.db()
	assetCol = db.collection('mediaAssets')
	folderCol = db.collection('mediaFolders')
	ruleCol = db.collection('mediaTagRules')

	const indexes = await assetCol.indexes().catch(() => [])
	const unique1 = indexes.find(
		(i) => i.unique && JSON.stringify(i.key) === JSON.stringify({ workspaceId: 1, pathname: 1 }),
	)
	if (!unique1) {
		console.log('FAIL  the unique { workspaceId, pathname } index is missing; run scripts/ensure-indexes.mjs')
		process.exit(1)
	}
	console.log('PASS  unique { workspaceId, pathname } index exists on mediaAssets')
	passed++

	await sections()
}

/* -------------------------------------------------------------------------- */
/* The harness has to be able to see what it claims not to see                */
/* -------------------------------------------------------------------------- */

async function sectionHarness() {
	section('the harness itself')

	check('the fake store and the real storage module agree: head, read and the guarded delete', async () => {
		const ws = newWs()
		const bytes = await solid(WHITE)
		const ref = put(ws, bytes)
		const info = await realStorage.headBlob(ref.url)
		assert.deepEqual(info, { url: ref.url, pathname: ref.pathname, size: bytes.length, contentType: 'image/png' })
		assert.ok((await realStorage.readBlob(ref.url)).equals(bytes))
		await assert.rejects(
			realStorage.headBlob(blobUrl(`${prefixOf(ws)}missing.png`)),
			(e) => e instanceof realStorage.BlobGoneError,
		)
		await realStorage.deleteBlob({ url: ref.url, pathname: ref.pathname }, prefixOf(ws))
		assert.deepEqual(sdkCalls.del, [ref.url], 'a delete the guard allows reaches del()')
		assert.ok(!blobs.has(ref.url))
	})

	check('positive control: the real guard blocks a blob outside the prefix, so "nothing deleted" means something', async () => {
		const ws = newWs()
		const victim = put(ws, await solid(WHITE), { pathname: `workspaces/${hex(new ObjectId())}/media/theirs.png` })
		const site = put(ws, await solid(WHITE), { pathname: 'sites/site-1/hero.png' })
		await realStorage.deleteBlob({ url: victim.url, pathname: victim.pathname }, prefixOf(ws))
		await realStorage.deleteBlob({ url: site.url, pathname: site.pathname }, prefixOf(ws))
		assert.deepEqual(sdkCalls.del, [])
		assertKept([victim, site])
	})

	check('the recording layer sees deleteBlob with the info it was given', async () => {
		const ws = newWs()
		const ref = put(ws, await solid(WHITE))
		await storageMock.deleteBlob({ url: ref.url, pathname: ref.pathname }, prefixOf(ws))
		assert.equal(calls.del.length, 1)
		assert.deepEqual(calls.del[0].info, { url: ref.url, pathname: ref.pathname })
		assert.equal(calls.del[0].prefix, prefixOf(ws))
	})
}

/* -------------------------------------------------------------------------- */
/* Register: the happy path                                                   */
/* -------------------------------------------------------------------------- */

async function sectionRegister() {
	section('register: the happy path')

	check('creates an asset from a proven blob: the bytes, the store and the file name decide every field', async () => {
		const ws = newWs()
		const bytes = await solid(WHITE, 200, 100)
		const ref = put(ws, bytes, { name: 'Kitchen-Remodel_before.png' })
		const before = Date.now()
		const { status, doc } = await register(ws, ref)
		assert.equal(status, 'created')
		assert.ok(doc.workspaceId.equals(ws))
		assert.equal(doc.folderId, null)
		assert.equal(doc.pathname, ref.pathname)
		assert.equal(doc.url, ref.url)
		assert.equal(doc.contentType, 'image/png')
		assert.equal(doc.bytes, bytes.length)
		assert.equal(doc.width, 200)
		assert.equal(doc.height, 100)
		assert.equal(doc.pixels, 20000)
		assert.equal(doc.orientation, 'landscape')
		assert.equal(doc.hasAlpha, false)
		assert.equal(doc.animated, false)
		assert.equal(doc.sha256, sha(bytes))
		assert.equal(doc.brightness, 'light')
		assert.equal(doc.saturation, 'monochrome')
		assert.deepEqual(doc.colors, [{ hex: '#ffffff', name: 'white', share: 1 }])
		assert.deepEqual(doc.colorNames, ['white'])
		assert.match(doc.blur, /^data:image\/webp;base64,/)
		assert.equal(doc.filename, 'Kitchen-Remodel_before.png')
		assert.equal(doc.name, 'Kitchen Remodel before')
		assert.equal(doc.nameKey, 'kitchen remodel before')
		assert.deepEqual(doc.tags, [fname('kitchen'), fname('remodel'), fname('before')])
		assert.deepEqual(doc.rejectedTags, [])
		assert.equal(doc.caption, '')
		assert.equal(doc.altText, '')
		assert.equal(doc.captionEdited, false)
		assert.equal(doc.textInImage, '')
		assert.deepEqual(doc.keywords, [])
		assert.equal(doc.kind, null)
		assert.equal(doc.notes, '')
		assert.equal(doc.rev, 0)
		assert.equal(doc.termsVersion, T.MEDIA_TERMS_VERSION)
		assert.deepEqual(doc.terms, buildTerms(doc), 'terms are exactly what the document itself indexes')
		for (const term of ['kitchen', 'remodel', 'before', 'png', 'white', 'landscape'])
			assert.ok(doc.terms.includes(term), `terms should hold ${term}`)
		for (const term of ['light', 'monochrome', 'dark', 'muted'])
			assert.ok(!doc.terms.includes(term), `${term} is reached with is:, never as a word`)
		assert.deepEqual(doc.terms, [...doc.terms].sort())
		assert.equal(doc.uploadedBy, 'user-1')
		assert.ok(doc.createdAt instanceof Date && +doc.createdAt >= before - 1000 && +doc.createdAt <= Date.now())
		assert.equal(+doc.createdAt, +doc.updatedAt)
		assert.deepEqual(await docOf(doc._id), doc, 'what was returned is what was stored')
		assert.equal(await countIn(ws), 1)
		assert.equal(calls.head.length, 1)
		assert.equal(calls.read.length, 1)
		assertNoDeletes()
	})

	check('stores the store\'s own url and size, not the request\'s (a :443 url is the same blob in another spelling)', async () => {
		const ws = newWs()
		const bytes = await unique(1)
		const ref = put(ws, bytes, { name: 'a.png', size: bytes.length })
		const requested = ref.url.replace('.com/', '.com:443/')
		assert.notEqual(requested, ref.url)
		const { doc } = await register(ws, { ...ref, url: requested })
		assert.equal(doc.url, ref.url, 'the canonical url from head()')
		assert.deepEqual(calls.read, [ref.url], 'the download is of the proven url')
	})

	check('the size is the store\'s (head), the type is what the bytes decode to', async () => {
		const ws = newWs()
		const bytes = await solid([10, 20, 30], 20, 20, 'jpg')
		const ref = put(ws, bytes, { name: 'photo.png', contentType: 'image/png', size: 1234 })
		const { doc } = await register(ws, ref)
		assert.equal(doc.bytes, 1234, 'size comes from head()')
		assert.equal(doc.contentType, 'image/jpeg', 'a header that says png does not make a jpeg one')
		assert.ok(doc.terms.includes('jpeg') && doc.terms.includes('jpg'), 'jpeg indexes both words')
	})

	check('is idempotent on the pathname: a second call returns the same asset, one document, one download', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(2))
		const first = await register(ws, ref)
		const second = await register(ws, ref)
		assert.equal(first.status, 'created')
		assert.equal(second.status, 'created', 'an existing asset is answered as created')
		assert.ok(second.doc._id.equals(first.doc._id))
		assert.equal(await countIn(ws), 1)
		assert.equal(calls.head.length, 2, 'the claim is proven every time')
		assert.equal(calls.read.length, 1, 'but nothing is downloaded twice')
		assert.equal((await docOf(first.doc._id)).rev, 0, 'and nothing is rewritten')
		assertNoDeletes()
	})

	check('idempotent even when the second request names another file name or folder', async () => {
		const ws = newWs()
		const folder = await folderCol.insertOne({ workspaceId: ws, parentId: null, name: 'F', nameKey: 'f', createdBy: 'x', createdAt: new Date(), updatedAt: new Date() })
		const ref = put(ws, await unique(3))
		const first = await register(ws, ref, { filename: 'first.png' })
		const second = await register(ws, ref, { filename: 'second.png', folderId: folder.insertedId })
		assert.ok(second.doc._id.equals(first.doc._id))
		assert.equal(second.doc.filename, 'first.png')
		assert.equal(second.doc.folderId, null)
	})

	for (const [format, type] of [
		['jpg', 'image/jpeg'],
		['png', 'image/png'],
		['webp', 'image/webp'],
		['avif', 'image/avif'],
		['gif', 'image/gif'],
	])
		check(`every accepted format registers: ${format} -> ${type}`, async () => {
			const ws = newWs()
			const bytes = await unique(10, format)
			const ref = put(ws, bytes, { contentType: type, name: `pic.${format}` })
			const { status, doc } = await register(ws, ref)
			assert.equal(status, 'created')
			assert.equal(doc.contentType, type)
			assert.equal(doc.sha256, sha(bytes))
			assert.ok(doc.terms.includes(format))
		})

	const shapes = [
		['portrait', () => solid([40, 90, 160], 60, 120), { orientation: 'portrait', width: 60, height: 120 }],
		['square', () => solid([40, 90, 160], 50, 50), { orientation: 'square', width: 50, height: 50 }],
		['panorama', () => solid([40, 90, 160], 300, 100), { orientation: 'panorama', width: 300, height: 100 }],
		['transparent', () => transparentPng(), { hasAlpha: true, width: 32, height: 32 }],
		['animated', () => animatedGif(), { animated: true, width: 10, height: 10 }],
		['EXIF-rotated (the stored size is the display size)', () => rotatedJpeg(), { orientation: 'portrait', width: 50, height: 100 }],
	]
	for (const [label, build, expected] of shapes)
		check(`analysis fields reach the document: ${label}`, async () => {
			const ws = newWs()
			const bytes = await build()
			const type = label === 'animated' ? 'image/gif' : label.startsWith('EXIF') ? 'image/jpeg' : 'image/png'
			const { doc } = await register(ws, put(ws, bytes, { contentType: type }))
			for (const [key, value] of Object.entries(expected)) assert.equal(doc[key], value, key)
			assert.equal(doc.pixels, doc.width * doc.height)
			if (expected.hasAlpha) assert.ok(doc.terms.includes('transparent'))
			if (expected.animated) assert.ok(doc.terms.includes('animated'))
		})

	section('register: tagging state and file name tags')

	check('tagging is pending when a key is configured', async () => {
		await withEnv({ ANTHROPIC_API_KEY: 'proof-key-never-used' }, async () => {
			const ws = newWs()
			const { doc } = await register(ws, put(ws, await unique(20)))
			assert.deepEqual(doc.tagging, { status: 'pending', attempts: 0 })
			assert.deepEqual((await docOf(doc._id)).tagging, { status: 'pending', attempts: 0 })
		})
	}, { exclusive: true })

	check('tagging is skipped / not_configured with no key', async () => {
		const ws = newWs()
		const { doc } = await register(ws, put(ws, await unique(21)))
		assert.deepEqual(doc.tagging, { status: 'skipped', attempts: 0, reason: 'not_configured' })
	})

	for (const [label, env] of [
		['a blank key', { ANTHROPIC_API_KEY: '   ' }],
		['a key with MEDIA_AI_ENABLED=false', { ANTHROPIC_API_KEY: 'k', MEDIA_AI_ENABLED: 'false' }],
		['a key with MEDIA_AI_ENABLED=0', { ANTHROPIC_API_KEY: 'k', MEDIA_AI_ENABLED: '0' }],
		['a key with MEDIA_AI_ENABLED=off', { ANTHROPIC_API_KEY: 'k', MEDIA_AI_ENABLED: 'OFF' }],
	])
		check(`tagging is skipped / not_configured with ${label}`, async () => {
			await withEnv(env, async () => {
				const ws = newWs()
				const { doc } = await register(ws, put(ws, await unique(22)))
				assert.deepEqual(doc.tagging, { status: 'skipped', attempts: 0, reason: 'not_configured' })
			})
		}, { exclusive: true })

	check('the same blob registered unconfigured then configured keeps the first answer (idempotent)', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(23))
		const first = await register(ws, ref)
		await withEnv({ ANTHROPIC_API_KEY: 'k' }, async () => {
			const second = await register(ws, ref)
			assert.equal(second.doc.tagging.status, 'skipped')
			assert.ok(second.doc._id.equals(first.doc._id))
		})
	}, { exclusive: true })

	check('file name tags are automatic, via filename, six at most, and none for a camera name', async () => {
		const ws = newWs()
		const a = await register(ws, put(ws, await unique(30), { name: 'one-two-three-four-five-six-seven-eight.png' }))
		assert.equal(a.doc.tags.length, 6)
		assert.ok(a.doc.tags.every((t) => t.source === 'auto' && t.via === 'filename' && t.confidence === undefined))
		const b = await register(ws, put(ws, await unique(31), { name: 'IMG_2034.JPG' }))
		assert.deepEqual(b.doc.tags, [])
		assert.equal(b.doc.name, 'IMG 2034')
		assert.deepEqual(a.doc.tags, filenameTags('one-two-three-four-five-six-seven-eight.png'))
	})

	check('file name tags go through the workspace rules: a block drops one, a redirect renames one', async () => {
		const ws = newWs()
		await ruleCol.insertMany([
			{ workspaceId: ws, from: 'remodel', to: null, createdAt: new Date() },
			{ workspaceId: ws, from: 'before', to: { slug: 'earlier', label: 'Earlier' }, createdAt: new Date() },
		])
		const { doc } = await register(ws, put(ws, await unique(32), { name: 'Kitchen-Remodel_before.png' }))
		assert.deepEqual(doc.tags, [fname('kitchen'), { slug: 'earlier', label: 'Earlier', source: 'auto', via: 'filename' }])
		assert.ok(doc.terms.includes('earlier'), 'the redirected tag is indexed')
		assert.ok(doc.terms.includes('remodel'), 'a blocked tag does not take the word out of the name')
	})

	check('rules of another workspace do not apply', async () => {
		const ws = newWs()
		const other = newWs()
		await ruleCol.insertOne({ workspaceId: other, from: 'kitchen', to: null, createdAt: new Date() })
		const { doc } = await register(ws, put(ws, await unique(33), { name: 'kitchen.png' }))
		assert.deepEqual(slugsOf(doc), ['kitchen'])
	})

	section('register: file names and hostile input')

	const nameCases = [
		['path separators', '../../etc/passwd.png', (f) => !/[\\/]/.test(f) && f.endsWith('passwd.png')],
		['backslashes', '..\\..\\windows\\system32.png', (f) => !/[\\/]/.test(f)],
		['control characters and bidi overrides', 'a‮b\u0000c\u0007d.png', (f) => f === 'abcd.png'],
		['percent-encoded traversal', '..%2f..%2fetc%2fpasswd.png', (f) => !/%(25)*(2e|2f|5c)/i.test(f)],
		['five thousand characters', `${'x'.repeat(5000)}.png`, (f) => f.length <= 255 && f.endsWith('.png')],
		['nothing but dots', '....', (f) => f === 'image'],
		['only whitespace and controls', ' \t\n\u0001 ', (f) => f === 'image'],
		['unicode', '日本語 Фото café.png', (f) => f === '日本語 Фото café.png'],
		['an operator-looking name', '{"$ne":null}.png', (f) => f === '{"$ne":null}.png'],
	]
	for (const [label, filename, ok] of nameCases)
		check(`file name: ${label} is made safe, the blob and pathname are untouched`, async () => {
			const ws = newWs()
			const ref = put(ws, await unique(40 + seq))
			const { doc } = await register(ws, ref, { filename })
			assert.ok(ok(doc.filename), `stored filename ${JSON.stringify(doc.filename)}`)
			assert.ok(doc.name.length >= 1 && doc.name.length <= MEDIA_LIMITS.nameMax)
			assert.equal(doc.pathname, ref.pathname)
			assert.equal(await countIn(ws), 1)
		})

	for (const [label, filename] of [['a number', 42], ['undefined', undefined], ['null', null], ['an object', { $gt: '' }], ['an array', ['a']]])
		check(`file name: ${label} falls back to "image" and still registers`, async () => {
			const ws = newWs()
			const { doc } = await register(ws, put(ws, await unique(60 + seq)), { filename })
			assert.equal(doc.filename, 'image')
			assert.equal(typeof doc.name, 'string')
		})

	check('without an account, or with one that is not an ObjectId, nothing is read, written or deleted', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(70))
		const input = { url: ref.url, pathname: ref.pathname, filename: 'a.png', folderId: null }
		const spy = spyDb(db)
		for (const bad of [undefined, null, {}, { workspaceId: hex(ws) }, { workspaceId: { $ne: null } }, { workspaceId: ws.toString().slice(0, 12) }]) {
			let thrown
			try {
				await A.registerUploadedBlob(spy, bad, input)
			} catch (e) {
				thrown = e
			}
			assert.ok(thrown instanceof A.AssetError && thrown.status === 404, `ctx ${JSON.stringify(bad)}`)
		}
		assert.equal(spy.counts.size, 0, 'no database call')
		assert.deepEqual(calls.head, [], 'no store call')
		assertNoDeletes()
		assert.equal(await countIn(ws), 0)
	})

	check('a frozen context and input are only read, and a userId that is not a string is stored as empty', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(72))
		const { doc } = await A.registerUploadedBlob(
			db,
			Object.freeze({ workspaceId: ws, userId: 42 }),
			Object.freeze({ url: ref.url, pathname: ref.pathname, filename: 'f.png', folderId: null }),
		)
		assert.equal(doc.uploadedBy, '')
		const second = put(ws, await unique(73))
		const again = await A.registerUploadedBlob(
			db,
			Object.freeze({ workspaceId: ws, userId: 'real-user' }),
			Object.freeze({ url: second.url, pathname: second.pathname, filename: 'g.png', folderId: null }),
		)
		assert.equal(again.doc.uploadedBy, 'real-user')
	})

	for (const [label, name] of [
		['spaces, accents, a plus, a percent sign and brackets', 'Café déjà vu (1) + 100% [final].png'],
		['an emoji', 'sale 😀.png'],
		['an apostrophe and an ampersand', "o'brien & sons.png"],
		['CJK letters', '日本語のフォト.png'],
		['a leading dot', '.hidden.png'],
	])
		check(`a blob whose name has ${label} registers: the url and the pathname agree once decoded`, async () => {
			const ws = newWs()
			const ref = put(ws, await unique(74), { name })
			const { doc } = await register(ws, ref, { filename: name })
			assert.equal(doc.pathname, ref.pathname)
			assert.equal(doc.url, ref.url)
			assert.deepEqual(calls.read, [ref.url])
			assert.equal(await countIn(ws), 1)
			assertNoDeletes()
		})

	check('a missing or malformed input is a 400 with nothing deleted', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(71))
		for (const bad of [undefined, null, {}, { url: 5, pathname: ref.pathname }, { url: ref.url, pathname: 5 }, { url: { $ne: null }, pathname: { $ne: null } }, { url: ref.url }, { pathname: ref.pathname }])
			await rejects(A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, bad), 400, JSON.stringify(bad))
		assertNoDeletes()
		assertNoRead()
		assertKept([ref])
	})

	section('register: folders')

	check('registers into a folder of the workspace', async () => {
		const ws = newWs()
		const folder = (await folderCol.insertOne({ workspaceId: ws, parentId: null, name: 'Clients', nameKey: 'clients', createdBy: 'x', createdAt: new Date(), updatedAt: new Date() })).insertedId
		const { doc } = await register(ws, put(ws, await unique(80)), { folderId: folder })
		assert.ok(doc.folderId.equals(folder))
		assert.ok((await docOf(doc._id)).folderId.equals(folder))
	})

	check('the folder is deleted right after the insert: the new image is moved to the root instead of pointing at nothing', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'Doomed')
		const ref = put(ws, await unique(710))
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'insertOne', 1, 'after')) await folderCol.deleteOne({ _id: folder._id })
		})
		const { doc } = await register(ws, ref, { folderId: folder._id }, spy)
		assert.equal(doc.folderId, null)
		assert.equal((await assetCol.findOne({ workspaceId: ws, pathname: ref.pathname })).folderId, null)
		assertNoDeletes()
	})

	check('a 24-hex string folder id is re-parsed, not trusted as an object', async () => {
		const ws = newWs()
		const folder = (await folderCol.insertOne({ workspaceId: ws, parentId: null, name: 'C', nameKey: 'c', createdBy: 'x', createdAt: new Date(), updatedAt: new Date() })).insertedId
		const { doc } = await register(ws, put(ws, await unique(81)), { folderId: hex(folder) })
		assert.ok(doc.folderId instanceof ObjectId && doc.folderId.equals(folder))
	})

	check('no folder at all (the key absent, or undefined) registers at the root: a missing folder is not a bad one, and nothing is deleted', async () => {
		const ws = newWs()
		const absent = put(ws, await unique(82))
		const first = await A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url: absent.url, pathname: absent.pathname, filename: 'a.png' })
		assert.equal(first.doc.folderId, null)
		assert.equal((await docOf(first.doc._id)).folderId, null, 'an explicit null on disk, not a missing field')
		const explicit = await register(ws, put(ws, await unique(83)), { folderId: undefined })
		assert.equal(explicit.doc.folderId, null)
		assertNoDeletes()
	})

	const folderFailures = [
		['a folder that does not exist', () => new ObjectId()],
		['a folder of another workspace', async (ws) => (await folderCol.insertOne({ workspaceId: newWs(), parentId: null, name: 'Theirs', nameKey: 'theirs', createdBy: 'x', createdAt: new Date(), updatedAt: new Date() })).insertedId],
		['a malformed id', () => 'not-an-id'],
		['an operator object', () => ({ $ne: null })],
		['a number', () => 7],
		['a 12-character string', () => 'abcdefghijkl'],
	]
	for (const [label, make] of folderFailures)
		check(`${label}: a 400, and the proven blob is discarded (exactly info), no asset`, async () => {
			const ws = newWs()
			const ref = put(ws, await unique(90 + seq))
			const folderId = await make(ws)
			const error = await rejects(register(ws, ref, { folderId }), 400)
			noLeak(error)
			assertDeleted(ws, [ref])
			assert.equal(await countIn(ws), 0)
		})
}

/* -------------------------------------------------------------------------- */
/* The unproven claim                                                         */
/* -------------------------------------------------------------------------- */

async function sectionClaims() {
	section('THE UNPROVEN CLAIM: a request-supplied url can never cause a delete')

	const outsiders = (ws) => [
		["another account's library image", `workspaces/${hex(new ObjectId())}/media/victim.png`],
		["a published site's project image", 'sites/site-123/media/hero.png'],
		['a blob at the root of the store', 'logo.png'],
		["a sibling folder of the library inside the same account", `workspaces/${hex(ws)}/private/secret.png`],
		['an account whose id merely starts with ours', `workspaces/${hex(ws)}0/media/x.png`],
	]
	for (const [label] of outsiders(newWs()))
		check(`pathname inside the prefix, url naming ${label}: 400, nothing read, nothing deleted`, async () => {
			const ws = newWs()
			const outside = outsiders(ws).find(([l]) => l === label)[1]
			// The claim is "mine.png in my prefix"; the url is somebody else's blob.
			const victim = put(ws, await unique(110), { pathname: outside })
			const claimed = `${prefixOf(ws)}mine.png`
			const error = await rejects(
				A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url: victim.url, pathname: claimed, filename: 'mine.png', folderId: null }),
				400,
			)
			noLeak(error)
			assertNoDeletes()
			assertNoRead()
			assertKept([victim])
			assert.equal(await countIn(ws), 0)
		})

	check('the victim is a REAL library blob of another account, and still there afterwards (positive control for the claim above)', async () => {
		const ws = newWs()
		const other = newWs()
		const victim = put(other, await unique(111), { name: 'theirs.png' })
		await seed(other, 1, { pathname: victim.pathname, url: victim.url }, { blobsToo: false })
		await rejects(
			A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url: victim.url, pathname: `${prefixOf(ws)}x.png`, filename: 'x.png', folderId: null }),
			400,
		)
		assertNoDeletes()
		assertKept([victim])
		assert.equal(await countIn(other), 1, 'their asset is untouched')
		assert.equal(await countIn(ws), 0)
	})

	check('head says a different pathname than the claim, both inside the prefix: 400, neither blob deleted', async () => {
		const ws = newWs()
		const a = put(ws, await unique(112), { name: 'a.png' })
		const b = put(ws, await unique(113), { name: 'b.png' })
		const error = await rejects(
			A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url: b.url, pathname: a.pathname, filename: 'a.png', folderId: null }),
			400,
		)
		noLeak(error)
		assert.equal(calls.head.length, 1, 'the store was asked')
		assertNoDeletes()
		assertNoRead()
		assertKept([a, b])
		assert.equal(await countIn(ws), 0)
	})

	check('a pathname that differs only in case from the proven one is not the same claim', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(114), { name: 'photo.png' })
		await rejects(
			A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url: ref.url, pathname: `${prefixOf(ws)}PHOTO.png`, filename: 'x.png', folderId: null }),
			400,
		)
		assertNoDeletes()
		assertKept([ref])
	})

	check('the store reports another pathname than the url names (a lying or confused store): 400, nothing deleted', async () => {
		const ws = newWs()
		const a = put(ws, await unique(115), { name: 'a.png' })
		const b = put(ws, await unique(116), { name: 'b.png' })
		blobs.get(a.url).pathname = b.pathname
		await rejects(register(ws, a), 400)
		assertNoDeletes()
		assertNoRead()
		assertKept([a, b])
	})

	check('the store answers with a url on another host than the claim: 400, nothing deleted', async () => {
		const ws = newWs()
		const a = put(ws, await unique(117), { name: 'a.png' })
		blobs.get(a.url).url = a.url.replace('proofstore', 'otherstore')
		await rejects(register(ws, a), 400)
		assertNoDeletes()
		assertNoRead()
		assertKept([a])
	})

	const foreignPathnames = (ws, other) => [
		['an exact copy of another account\'s path', `workspaces/${hex(other)}/media/x.png`],
		['a project\'s path', 'sites/site-1/media/hero.png'],
		['the store root', 'x.png'],
		['the workspace prefix with no file part', prefixOf(ws)],
		['a traversal out of the prefix', `${prefixOf(ws)}../../${hex(other)}/media/x.png`],
		['a traversal that stays inside textually', `${prefixOf(ws)}a/../b.png`],
		['an encoded traversal', `${prefixOf(ws)}%2e%2e/x.png`],
		['a double-encoded traversal', `${prefixOf(ws)}%252e%252e/x.png`],
		['a backslash', `${prefixOf(ws)}a\\b.png`],
		['an empty segment', `${prefixOf(ws)}a//b.png`],
		['a control character', `${prefixOf(ws)}a\u0000b.png`],
		['the account id in upper case', `workspaces/${hex(ws).toUpperCase()}/media/x.png`],
		['a longer id that starts with ours', `workspaces/${hex(ws)}0/media/x.png`],
		['a path 2000 characters long', `${prefixOf(ws)}${'a'.repeat(2000)}.png`],
	]
	for (const [label] of foreignPathnames(newWs(), newWs()))
		check(`a claimed pathname that is ${label}: 400, no blob read, nothing deleted`, async () => {
			const ws = newWs()
			const other = newWs()
			const entry = foreignPathnames(ws, other).find(([l]) => l === label)
			const victim = put(other, await unique(120), { pathname: `workspaces/${hex(other)}/media/x.png` })
			// The url is either the victim's real blob or spelled to agree with the pathname.
			for (const url of [victim.url, blobUrl(entry[1])]) {
				const error = await rejects(
					A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url, pathname: entry[1], filename: 'x.png', folderId: null }),
					400,
				)
				noLeak(error)
			}
			assertNoDeletes()
			assertNoRead()
			assertKept([victim])
			assert.equal(await countIn(ws), 0)
			assert.equal(await countIn(other), 0)
		})

	const badUrls = (ws) => {
		const p = `${prefixOf(ws)}x.png`
		return [
			['another host', `https://evil.example.com/${p}`],
			['plain http', `http://${STORE}.public.blob.vercel-storage.com/${p}`],
			['a file url', 'file:///etc/passwd'],
			['a javascript url', 'javascript:alert(1)'],
			['a data url', 'data:image/png;base64,AAAA'],
			['credentials in the url', `https://user:pw@${STORE}.public.blob.vercel-storage.com/${p}`],
			['an ip literal', `https://127.0.0.1/${p}`],
			['an ipv6 literal', `https://[::1]/${p}`],
			['the blob host as a prefix of another host', `https://${STORE}.public.blob.vercel-storage.com.evil.com/${p}`],
			['a query string', `https://${STORE}.public.blob.vercel-storage.com/${p}?token=1`],
			['a fragment', `https://${STORE}.public.blob.vercel-storage.com/${p}#x`],
			['a non-default port', `https://${STORE}.public.blob.vercel-storage.com:8443/${p}`],
			['an encoded traversal in the path', `https://${STORE}.public.blob.vercel-storage.com/${p}/%2e%2e/%2e%2e/secret`],
			['a backslash', `https://${STORE}.public.blob.vercel-storage.com/${p.replace('/x', '\\x')}`],
			['whitespace', `https://${STORE}.public.blob.vercel-storage.com/${p} x`],
			['an empty string', ''],
			['not a url', 'not a url'],
		]
	}
	for (const [label] of badUrls(newWs()))
		check(`a url that is ${label}: 400, nothing fetched, nothing deleted`, async () => {
			const ws = newWs()
			const entry = badUrls(ws).find(([l]) => l === label)
			// Even if a real blob sits at the claimed pathname, the url is not trusted.
			const real = put(ws, await unique(130), { name: 'x.png' })
			await rejects(
				A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url: entry[1], pathname: `${prefixOf(ws)}x.png`, filename: 'x.png', folderId: null }),
				400,
			)
			assertNoDeletes()
			assertNoRead()
			assertKept([real])
			assert.equal(await countIn(ws), 0)
		})

	check('an absurdly long url or pathname (100,000 characters) is a 400 that costs the store nothing, and nothing is deleted', async () => {
		const ws = newWs()
		const real = put(ws, await unique(132), { name: 'x.png' })
		const longPath = `${prefixOf(ws)}${'a'.repeat(100_000)}.png`
		const longUrl = `https://${STORE}.public.blob.vercel-storage.com/${longPath}`
		for (const [url, pathname] of [[longUrl, longPath], [longUrl, real.pathname], [real.url, longPath]])
			noLeak(await rejects(A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url, pathname, filename: 'x.png', folderId: null }), 400))
		assert.deepEqual(sdkCalls.head, [], 'the store is never asked about an absurd claim')
		assertNoDeletes()
		assertNoRead()
		assertKept([real])
		assert.equal(await countIn(ws), 0)
	})

	check('no such blob (BlobGone at head): 400 with the fixed "no longer stored" text, nothing deleted', async () => {
		const ws = newWs()
		const ref = { url: norm(blobUrl(`${prefixOf(ws)}gone.png`)), pathname: `${prefixOf(ws)}gone.png`, name: 'gone.png' }
		const error = await rejects(register(ws, ref), 400)
		assert.match(error.message, /no longer stored/i)
		assertNoDeletes()
		assertNoRead()
	})

	check('a store error at head: 400, a generic message that carries nothing from the store, nothing deleted', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(131))
		faults.headError = new Error('503 from https://proofstore.public.blob.vercel-storage.com token=vercel_blob_rw_secret-store-detail')
		const error = await rejects(register(ws, ref), 400)
		noLeak(error)
		assert.ok(!/vercel_blob|token|503/.test(error.message))
		assertNoDeletes()
		assertNoRead()
		assertKept([ref])
		// A store that is down or misconfigured must leave a trace, one bounded line, with no credential in it.
		const lines = logs.warn.filter((l) => /could not confirm an upload/.test(l))
		assert.equal(lines.length, 1, logs.warn.join(' | '))
		assert.ok(lines[0].length < 400 && !/vercel_blob_rw_secret/.test(lines[0]), lines[0])
	})

	check('a hostile request leaves no log line: a bad url, an unknown blob and a foreign pathname are the caller\'s mistake, not an outage', async () => {
		const ws = newWs()
		const gone = { url: norm(blobUrl(`${prefixOf(ws)}gone.png`)), pathname: `${prefixOf(ws)}gone.png`, name: 'gone.png' }
		await rejects(register(ws, gone), 400)
		await rejects(A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url: 'https://evil.example.com/x.png', pathname: `${prefixOf(ws)}x.png`, filename: 'x.png', folderId: null }), 400)
		await rejects(A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url: gone.url, pathname: 'sites/s/x.png', filename: 'x.png', folderId: null }), 400)
		assert.deepEqual(logs.warn, [])
		assert.deepEqual(logs.error, [])
	})

	check('every unproven claim above left the claimed workspace empty and called neither delete path', async () => {
		// A property the cases above already assert one by one; this fuzzes pathname/url pairs together.
		const ws = newWs()
		const other = newWs()
		const mine = put(ws, await unique(140), { name: 'mine.png' })
		const theirs = put(other, await unique(141), { name: 'theirs.png' })
		const site = put(ws, await unique(142), { pathname: 'sites/s/hero.png' })
		const urls = [mine.url, theirs.url, site.url, 'https://evil.example.com/x', '', 'x', mine.url + '?x=1']
		const paths = [mine.pathname, theirs.pathname, site.pathname, '', 'x', `${prefixOf(ws)}x.png`, `${prefixOf(ws)}../x.png`]
		let ok = 0
		for (const url of urls)
			for (const pathname of paths) {
				if (url === mine.url && pathname === mine.pathname) continue // the one honest pair
				let thrown
				try {
					await A.registerUploadedBlob(db, { workspaceId: ws, userId: 'u' }, { url, pathname, filename: 'x.png', folderId: null })
				} catch (e) {
					thrown = e
				}
				assert.ok(thrown instanceof A.AssetError && thrown.status === 400, `${url} + ${pathname}`)
				ok++
			}
		assert.ok(ok > 40)
		assertNoDeletes()
		assertNoRead()
		assertKept([mine, theirs, site])
		assert.equal(await countIn(ws), 0)
	})
}

/* -------------------------------------------------------------------------- */
/* Proven claims that are refused                                             */
/* -------------------------------------------------------------------------- */

let bigWs = null
/** A workspace holding maxAssets - 1 minimal assets, built once and reused by the cap checks. */
async function bigWorkspace() {
	if (bigWs) return bigWs
	const ws = newWs()
	const docs = []
	for (let i = 0; i < MEDIA_LIMITS.maxAssets - 1; i++)
		docs.push({
			_id: new ObjectId(),
			workspaceId: ws,
			pathname: `${prefixOf(ws)}filler-${i}.png`,
			bytes: 1,
			sha256: createHash('sha256').update(`filler-${i}`).digest('hex'),
			createdAt: new Date(0),
		})
	for (let start = 0; start < docs.length; start += 1000)
		await assetCol.insertMany(docs.slice(start, start + 1000), { ordered: false })
	bigWs = ws
	return ws
}
/** Back to exactly the fillers. */
const resetBig = (ws) => assetCol.deleteMany({ workspaceId: ws, pathname: { $not: /\/filler-/ } })

async function sectionRejections() {
	section('register: a proven blob that is refused is deleted, exactly as head described it')

	check('oversize (413): refused from the claim alone, never downloaded; the blob is deleted (exactly info)', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(150), { size: MEDIA_LIMITS.maxBytes + 1 })
		const error = await rejects(register(ws, ref), 413)
		noLeak(error)
		assert.match(error.message, /25 MB/)
		assertNoRead()
		assertDeleted(ws, [ref])
		assert.equal(await countIn(ws), 0)
	})

	check('cleanup deletes info, never the request url: the request spelled the url with :443', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(151), { size: MEDIA_LIMITS.maxBytes + 1 })
		const requested = ref.url.replace('.com/', '.com:443/')
		await rejects(register(ws, { ...ref, url: requested }), 413)
		assert.equal(calls.del.length, 1)
		assert.equal(calls.del[0].info.url, ref.url)
		assert.notEqual(calls.del[0].info.url, requested)
		assert.deepEqual(Object.keys(calls.del[0].info).sort(), ['pathname', 'url'], 'only what is needed to delete')
		assertDeleted(ws, [ref])
	})

	// The same property for every way a proven blob is refused. The request spells the url with an explicit :443 (the
	// same blob, another spelling); whatever the reason for the refusal, what is deleted is what head described.
	const spelled = (ref) => ({ ...ref, url: ref.url.replace('.com/', '.com:443/') })
	const assertDeletedExactlyInfo = (ws, ref) => {
		assert.notEqual(spelled(ref).url, ref.url, 'the request really does spell it differently')
		assert.equal(calls.del.length, 1, 'one blob is deleted')
		assert.deepEqual(calls.del[0].info, { url: ref.url, pathname: ref.pathname }, "head's url and pathname and nothing else")
		assert.equal(calls.del[0].prefix, prefixOf(ws))
		assert.deepEqual(sdkCalls.del, [ref.url], 'the SDK is given the store\'s own spelling')
		assert.ok(!blobs.has(ref.url))
	}
	const exactlyInfo = [
		['oversize at head (413)', 413, async (ws) => put(ws, await unique(1500), { size: MEDIA_LIMITS.maxBytes + 1 }), {}],
		['an unsupported content type (415)', 415, async (ws) => put(ws, await unique(1501), { contentType: 'image/svg+xml' }), {}],
		['an empty object (422)', 422, async (ws) => put(ws, Buffer.alloc(0), { size: 0 }), {}],
		['bytes that do not decode (422)', 422, async (ws) => put(ws, randomBytes(512)), {}],
		['bigger at the download than head said (413)', 413, async (ws) => put(ws, Buffer.alloc(MEDIA_LIMITS.maxBytes + 1024), { size: 1000 }), {}],
		['the total-bytes quota (429)', 429, async (ws) => {
			await seed(ws, 1, { bytes: MEDIA_LIMITS.maxTotalBytes - 10 }, { blobsToo: false })
			return put(ws, await unique(1502), { size: 11 })
		}, {}],
		['a folder that does not exist (400)', 400, async (ws) => put(ws, await unique(1503)), { folderId: new ObjectId() }],
	]
	for (const [label, status, make, extra] of exactlyInfo)
		check(`the request spelled the url with :443, and the cleanup still deletes exactly what head described: ${label}`, async () => {
			const ws = newWs()
			const ref = await make(ws)
			await rejects(register(ws, spelled(ref), extra), status)
			assertDeletedExactlyInfo(ws, ref)
			assert.equal(await assetCol.countDocuments({ workspaceId: ws, pathname: ref.pathname }), 0, 'and no asset for it')
		})

	check('the request spelled the url with :443, and the cleanup still deletes exactly what head described: an exact duplicate', async () => {
		const ws = newWs()
		const bytes = await unique(1504)
		const first = put(ws, bytes, { name: 'first.png' })
		await register(ws, first)
		const again = put(ws, bytes, { name: 'again.png' })
		const out = await register(ws, spelled(again))
		assert.equal(out.status, 'duplicate')
		assertDeletedExactlyInfo(ws, again)
		assertKept([first])
	})

	check('the request spelled the url with :443, and the cleanup still deletes exactly what head described: the library is full (429)', async () => {
		await withLimits({ maxAssets: 3 }, async () => {
			const ws = newWs()
			await seed(ws, 3, {}, { blobsToo: false })
			const ref = put(ws, await unique(1505))
			await rejects(register(ws, spelled(ref)), 429)
			assertDeletedExactlyInfo(ws, ref)
			assert.equal(await countIn(ws), 3)
		})
	}, { exclusive: true })

	check('exactly maxBytes is accepted (the size is stored as head reported it)', async () => {
		const ws = newWs()
		const { doc } = await register(ws, put(ws, await unique(152), { size: MEDIA_LIMITS.maxBytes }))
		assert.equal(doc.bytes, MEDIA_LIMITS.maxBytes)
		assertNoDeletes()
	})

	check('oversize is judged before the type: a 26 MB svg is a 413', async () => {
		const ws = newWs()
		const ref = put(ws, Buffer.from('<svg/>'), { size: MEDIA_LIMITS.maxBytes + 1, contentType: 'image/svg+xml' })
		await rejects(register(ws, ref), 413)
		assertDeleted(ws, [ref])
	})

	for (const type of ['image/svg+xml', 'image/bmp', 'image/tiff', 'image/heic', 'image/jpg', 'text/html', 'application/octet-stream', 'application/pdf', 'image/', 'image', '', 'IMAGE/SVG+XML'])
		check(`unsupported content type ${JSON.stringify(type)} (415): never downloaded, the blob is deleted (exactly info)`, async () => {
			const ws = newWs()
			const ref = put(ws, await unique(160), { contentType: type })
			const error = await rejects(register(ws, ref), 415)
			noLeak(error)
			assertNoRead()
			assertDeleted(ws, [ref])
			assert.equal(await countIn(ws), 0)
		})

	for (const type of ['image/png; charset=binary', 'IMAGE/PNG', ' image/png ', 'image/png;'])
		check(`a content type that only differs in spelling is still a png: ${JSON.stringify(type)}`, async () => {
			const ws = newWs()
			const { doc } = await register(ws, put(ws, await unique(161 + type.length), { contentType: type }))
			assert.equal(doc.contentType, 'image/png', 'the decode decides what it is')
			assertNoDeletes()
		})

	check('an empty object (size 0) is no image: 422 without a download, the blob is deleted', async () => {
		const ws = newWs()
		const ref = put(ws, Buffer.alloc(0), { size: 0 })
		await rejects(register(ws, ref), 422)
		assertNoRead()
		assertDeleted(ws, [ref])
	})

	// An empty object carries whatever type it was given, often none: it is the emptiness that is wrong with it.
	for (const type of ['text/plain', 'application/octet-stream', '', 'image/svg+xml', 'image/png'])
		check(`an empty object declared as ${JSON.stringify(type)} is a 422 (emptiness is the answer, not the type), never downloaded, deleted`, async () => {
			const ws = newWs()
			const ref = put(ws, Buffer.alloc(0), { size: 0, contentType: type })
			const error = await rejects(register(ws, ref), 422)
			noLeak(error)
			assertNoRead()
			assertDeleted(ws, [ref])
			assert.equal(await countIn(ws), 0)
		})

	const hostileCases = [
		['random bytes', randomBytes(4096)],
		['an html page', Buffer.from('<html><body>not an image</body></html>')],
		['a png signature and then garbage', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(200)])],
		['a truncated png', (await unique(170)).subarray(0, 30)],
		['a jpeg start-of-image marker and nothing else', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
		['a gif header and nothing else', Buffer.from('GIF89a')],
		['an svg document', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')],
		['a real tiff (decodable, but not an accepted format)', await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } }).tiff().toBuffer()],
		['a single byte', Buffer.from([0])],
	]
	for (const [label, bytes] of hostileCases)
		check(`undecodable bytes (${label}), claimed as a png: 422, the blob is deleted (exactly info)`, async () => {
			const ws = newWs()
			const ref = put(ws, bytes)
			const error = await rejects(register(ws, ref), 422)
			noLeak(error)
			assert.equal(calls.read.length, 1, 'it had to be downloaded to find out')
			assertDeleted(ws, [ref])
			assert.equal(await countIn(ws), 0)
		})

	check('a decompression bomb (81 megapixels, a few hundred KB) is refused by the pixel ceiling: 422 and deleted', async () => {
		const ws = newWs()
		const bomb = await sharp(Buffer.alloc(9000 * 9000), { raw: { width: 9000, height: 9000, channels: 1 } })
			.png({ compressionLevel: 9 })
			.toBuffer()
		assert.ok(bomb.length < MEDIA_LIMITS.maxBytes)
		const ref = put(ws, bomb)
		const error = await rejects(register(ws, ref), 422)
		assert.match(error.message, /too large/i)
		assertDeleted(ws, [ref])
	})

	check('the production asset cap (5000): one below still registers, at the cap a new blob is refused (429) without a download and deleted, and twins at cap - 1 add exactly one', async () => {
		const ws = await bigWorkspace() // maxAssets - 1 assets
		assert.equal(await countIn(ws), MEDIA_LIMITS.maxAssets - 1)

		// One below the cap (the cap is >=, not >).
		const last = put(ws, await unique(181), { name: 'reg-last.png' })
		const { doc } = await register(ws, last)
		assert.equal(doc.rev, 0)
		assert.equal(await countIn(ws), MEDIA_LIMITS.maxAssets)
		assertNoDeletes()

		// At the cap.
		const ref = put(ws, await unique(180), { name: 'reg-cap.png' })
		const error = await rejects(register(ws, ref), 429)
		noLeak(error)
		assert.equal(calls.read.length, 1, 'only the first one was downloaded')
		assertDeleted(ws, [ref])
		assert.equal(await countIn(ws), MEDIA_LIMITS.maxAssets, 'nothing was added')

		// The cap pre-filled to maxAssets - 1 again, and the browser and the webhook arrive together.
		await resetBig(ws)
		const deletedSoFar = calls.del.length
		const twin = put(ws, await unique(340), { name: 'reg-race.png' })
		const [a, b] = await Promise.all([register(ws, twin), register(ws, twin)])
		assert.equal(a.status, 'created')
		assert.equal(b.status, 'created')
		assert.ok(a.doc._id.equals(b.doc._id))
		assert.equal(await countIn(ws), MEDIA_LIMITS.maxAssets)
		assert.equal(calls.del.length, deletedSoFar, 'nothing deleted by the race')
		assertKept([twin])
		await resetBig(ws)
	})

	check('the asset cap at a small size: the last place is still given (the cap is >=, not >), the next one is refused (429) and its blob deleted', async () => {
		await withLimits({ maxAssets: 6 }, async () => {
			const ws = newWs()
			await seed(ws, 4, {}, { blobsToo: false })
			await register(ws, put(ws, await unique(182), { name: 'fifth.png' }))
			await register(ws, put(ws, await unique(183), { name: 'sixth.png' }))
			assert.equal(await countIn(ws), 6)
			assertNoDeletes()
			const ref = put(ws, await unique(184), { name: 'seventh.png' })
			const error = await rejects(register(ws, ref), 429)
			noLeak(error)
			assert.equal(calls.read.length, 2, 'the refused one was never downloaded')
			assertDeleted(ws, [ref])
			assert.equal(await countIn(ws), 6)
		})
	}, { exclusive: true })

	check('the total-bytes quota (429): exactly at the quota is accepted, one byte over is not (and is deleted, never downloaded)', async () => {
		const ws = newWs()
		await seed(ws, 1, { bytes: MEDIA_LIMITS.maxTotalBytes - 500 })
		const fits = put(ws, await unique(190), { size: 500 })
		const { doc } = await register(ws, fits)
		assert.equal(doc.bytes, 500)
		assertNoDeletes()

		const over = put(ws, await unique(191), { size: 1 })
		const error = await rejects(register(ws, over), 429)
		noLeak(error)
		assertDeleted(ws, [over])
		assert.equal(calls.read.length, 1, 'only the accepted one was downloaded')
		assert.equal(await countIn(ws), 2)
	})

	check('the quota counts every asset of the workspace and only this workspace', async () => {
		const ws = newWs()
		const other = newWs()
		await seed(other, 1, { bytes: MEDIA_LIMITS.maxTotalBytes })
		await seed(ws, 3, { bytes: 1000 })
		const { status } = await register(ws, put(ws, await unique(192)))
		assert.equal(status, 'created', "another workspace's bytes are not ours")
		await seed(ws, 1, { bytes: MEDIA_LIMITS.maxTotalBytes })
		await rejects(register(ws, put(ws, await unique(193))), 429)
	})

	check('BlobGone at the download (deleted between head and read): 400, and there is nothing to delete', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(200))
		hooks.read = async (url) => {
			blobs.delete(norm(url))
		}
		const error = await rejects(register(ws, ref), 400)
		assert.match(error.message, /no longer stored/i)
		assertNoDeletes()
		assert.equal(await countIn(ws), 0)
	})

	check('a transient read failure (store 500): 503, the proven blob is KEPT for a retry', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(201))
		faults.fetchStatus = 500
		const error = await rejects(register(ws, ref), 503)
		noLeak(error)
		assertNoDeletes()
		assertKept([ref])
		assert.equal(logs.warn.filter((l) => /could not be read/.test(l)).length, 1, 'the failure is logged once')
		faults.fetchStatus = null
		const { status } = await register(ws, ref)
		assert.equal(status, 'created', 'and the retry works')
	})

	check('a network failure at the download (fetch throws): 503, the blob is kept', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(202))
		faults.fetchThrow = true
		const error = await rejects(register(ws, ref), 503)
		noLeak(error)
		assertNoDeletes()
		assertKept([ref])
	})

	check('bytes larger than the cap although head said otherwise (413 at the download): the blob is deleted', async () => {
		const ws = newWs()
		const ref = put(ws, Buffer.alloc(MEDIA_LIMITS.maxBytes + 1024), { size: 1000 })
		await rejects(register(ws, ref), 413)
		assertDeleted(ws, [ref])
		assert.equal(await countIn(ws), 0)
	})

	check('a refusal leaves no half-made state: no document, no vocabulary change, and a retry of the same blob gets the same answer', async () => {
		const ws = newWs()
		const ref = put(ws, Buffer.from('not an image'))
		await rejects(register(ws, ref), 422)
		assert.equal(await countIn(ws), 0)
		await rejects(register(ws, ref), 400) // it is gone now: the first answer deleted it
	})
}

/* -------------------------------------------------------------------------- */
/* The race                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `hook` receives every database call of `spy`. The twin pattern: at the chosen call the hook runs a
 * whole second registration of the same blob (on the plain db) and only then lets the first continue,
 * which is the webhook finishing while the browser's request is in the middle of the same step.
 */
const twinAt = (match, makeTwin) => {
	let fired = false
	const result = { twin: null, fired: () => fired }
	const spy = spyDb(db, async (ev) => {
		if (fired || !match(ev)) return
		fired = true
		result.twin = await makeTwin(ev)
	})
	return { spy, result }
}

async function sectionRace() {
	section('THE RACE: the browser and the webhook register the same blob at the same moment')

	check('two concurrent registrations of one pathname: exactly one asset, both answers are it, nothing deleted (12 pairs at once)', async () => {
		const refs = []
		await Promise.all(
			Array.from({ length: 12 }, async (_, i) => {
				const ws = newWs()
				const ref = put(ws, await unique(300 + i), { name: `race-${i}.png` })
				refs.push(ref)
				const [a, b] = await Promise.all([register(ws, ref), register(ws, ref)])
				assert.equal(a.status, 'created')
				assert.equal(b.status, 'created')
				assert.ok(a.doc._id.equals(b.doc._id), 'one asset')
				assert.equal(await countIn(ws), 1)
				assert.equal((await docOf(a.doc._id)).rev, 0)
			}),
		)
		assertNoDeletes()
		assertKept(refs)
	})

	check('three and five concurrent callers (browser, webhook, a retry, more retries) still leave one asset', async () => {
		await Promise.all(
			[3, 5].map(async (n) => {
				const ws = newWs()
				const ref = put(ws, await unique(320 + n), { name: `many-${n}.png` })
				const out = await Promise.all(Array.from({ length: n }, () => register(ws, ref)))
				assert.ok(out.every((r) => r.status === 'created' && r.doc._id.equals(out[0].doc._id)))
				assert.equal(await countIn(ws), 1)
			}),
		)
		assertNoDeletes()
	})

	check('analysis delayed on one path: the slow call re-checks after analysis and returns the twin; no delete, one download each', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(330), { name: 'slow.png' })
		const firstDone = gate()
		hooks.read = async (_url, n) => {
			if (n === 1) await firstDone.wait()
		}
		const spy = spyDb(db)
		const calls2 = [register(ws, ref, {}, spy), register(ws, ref, {}, spy)]
		const settled = []
		const track = calls2.map((p, i) => p.then((r) => { settled.push(i); firstDone.open(); return r }))
		const [a, b] = await Promise.all(track)
		assert.ok(a.doc._id.equals(b.doc._id))
		assert.equal(await countIn(ws), 1)
		assert.equal(calls.read.length, 2, 'both downloaded: neither knew about the other')
		assert.equal(spy.counts.get('mediaAssets.insertOne'), 1, 'the slow call looked again after the analysis and found its twin: it never tried to insert')
		assertNoDeletes()
		assertKept([ref])
		assert.equal((await docOf(a.doc._id)).rev, 0)
	})

	check('the slow call is a duplicate of nothing: the twin\'s row is not an "exact duplicate" of the blob itself', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(331), { name: 'self.png' })
		const firstDone = gate()
		hooks.read = async (_url, n) => {
			if (n === 1) await firstDone.wait()
		}
		const ps = [register(ws, ref), register(ws, ref)]
		Promise.race(ps).then(() => firstDone.open())
		const out = await Promise.all(ps)
		assert.deepEqual(out.map((r) => r.status), ['created', 'created'], 'never "duplicate" of its own twin')
		assertNoDeletes()
	})

	check('cap pre-filled to maxAssets - 1: two concurrent calls add exactly one asset, both succeed, nothing deleted, no 429 (small cap, 10 pairs at once)', async () => {
		await withLimits({ maxAssets: 6 }, async () => {
			const refs = []
			await Promise.all(
				Array.from({ length: 10 }, async (_, i) => {
					const ws = newWs()
					await seed(ws, 5, {}, { blobsToo: false })
					const ref = put(ws, await unique(370 + i), { name: `reg-race-${i}.png` })
					refs.push(ref)
					const [a, b] = await Promise.all([register(ws, ref), register(ws, ref)])
					assert.equal(a.status, 'created')
					assert.equal(b.status, 'created')
					assert.ok(a.doc._id.equals(b.doc._id))
					assert.equal(await countIn(ws), 6)
				}),
			)
			assertNoDeletes()
			assertKept(refs)
		})
	}, { exclusive: true })

	check('cap race, the hard order: the twin fills the last place between the first call\'s idempotency check and its cap check', async () => {
		// A small cap: the comparison is the same, and the library does not need five thousand rows.
		await withLimits({ maxAssets: 6 }, async () => {
			const ws = newWs()
			await seed(ws, 5, {}, { blobsToo: false })
			const ref = put(ws, await unique(341), { name: 'reg-cap-race.png' })
			const { spy, result } = twinAt((ev) => at(ev, 'mediaAssets', 'aggregate', 1), () => register(ws, ref))
			const first = await register(ws, ref, {}, spy)
			assert.ok(result.fired())
			// At the cap check the library is full, because of the twin's own asset: the blob is the twin's.
			assert.equal(first.status, 'created')
			assert.ok(first.doc._id.equals(result.twin.doc._id))
			assert.equal(await countIn(ws), 6)
			assertNoDeletes()
			assertKept([ref])
			assert.equal(calls.read.length, 1, 'the first call never got as far as downloading')
		})
	}, { exclusive: true })

	check('quota race: the twin\'s bytes push the total over the quota just before the first call checks it; the twin keeps the blob', async () => {
		const ws = newWs()
		await seed(ws, 1, { bytes: MEDIA_LIMITS.maxTotalBytes - 1000 })
		const ref = put(ws, await unique(342), { size: 1000 })
		const { spy, result } = twinAt((ev) => at(ev, 'mediaAssets', 'aggregate', 1), () => register(ws, ref))
		const first = await register(ws, ref, {}, spy)
		assert.ok(first.doc._id.equals(result.twin.doc._id))
		assert.equal(first.status, 'created')
		assertNoDeletes()
		assertKept([ref])
	})

	check('exact-duplicate check: a row for THIS pathname (the twin) is never a duplicate of the blob itself', async () => {
		const ws = newWs()
		const bytes = await unique(343)
		const ref = put(ws, bytes, { name: 'dupself.png' })
		// Pause the first call right before it asks "is there a row with these bytes?"; the twin registers meanwhile.
		let asked
		const { spy, result } = twinAt(
			(ev) => {
				const hit = ev.coll === 'mediaAssets' && ev.method === 'findOne' && ev.phase === 'before' && ev.args[0]?.sha256 !== undefined
				if (hit) asked = ev.args[0]
				return hit
			},
			() => register(ws, ref),
		)
		const first = await register(ws, ref, {}, spy)
		assert.ok(result.fired(), 'the duplicate query was reached')
		// The spec'd query, term for term: this workspace, these bytes, any pathname but this blob's own.
		assert.ok(asked.workspaceId.equals(ws))
		assert.equal(asked.sha256, sha(bytes))
		assert.deepEqual(asked.pathname, { $ne: ref.pathname }, 'a row for this very blob is excluded in the query itself')
		assert.equal(first.status, 'created', 'the twin\'s row is not a duplicate of itself')
		assert.ok(first.doc._id.equals(result.twin.doc._id))
		assert.equal(await countIn(ws), 1)
		assertNoDeletes()
		assertKept([ref])
	})

	check('E11000: the twin inserts just before the first call does; the first returns the winner and never deletes the blob', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(344), { name: 'e11000.png' })
		const { spy, result } = twinAt((ev) => at(ev, 'mediaAssets', 'insertOne', 1), () => register(ws, ref))
		const first = await register(ws, ref, {}, spy)
		assert.ok(result.fired())
		assert.equal(first.status, 'created')
		assert.ok(first.doc._id.equals(result.twin.doc._id), 'the winner, not a fabricated document')
		assert.equal(await countIn(ws), 1)
		assertNoDeletes()
		assertKept([ref])
		assert.equal(logs.error.length, 0)
	})

	check('E11000 and then the winner is deleted before it can be read: a 409 to retry, and still nothing deleted', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(345), { name: 'e11000b.png' })
		let twin
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'insertOne', 1)) twin = await register(ws, ref)
			// the lookup after the failed insert
			if (twin && ev.coll === 'mediaAssets' && ev.method === 'findOne' && ev.phase === 'before' && ev.n === 4)
				await assetCol.deleteMany({ workspaceId: ws })
		})
		await rejects(register(ws, ref, {}, spy), 409)
		assertNoDeletes()
		assertKept([ref])
	})

	check('step 7: the folder is missing but the twin already holds the blob: the twin\'s asset is returned (no 400, no delete)', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(346), { name: 'folder-twin.png' })
		const { spy, result } = twinAt((ev) => at(ev, 'mediaFolders', 'findOne', 1), () => register(ws, ref))
		const first = await register(ws, ref, { folderId: new ObjectId() }, spy)
		assert.ok(result.fired())
		assert.equal(first.status, 'created')
		assert.ok(first.doc._id.equals(result.twin.doc._id))
		assertNoDeletes()
		assertKept([ref])
	})

	check('discard() refuses a blob an asset references: an oversize blob that already has an asset is answered with that asset', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(347), { size: MEDIA_LIMITS.maxBytes + 1, name: 'held-big.png' })
		const [held] = await seed(ws, 1, { pathname: ref.pathname, url: ref.url }, { blobsToo: false })
		const out = await register(ws, ref)
		assert.equal(out.status, 'created')
		assert.ok(out.doc._id.equals(held._id))
		assertNoDeletes()
		assertKept([ref])
	})

	check('discard() refuses a blob an asset references: an unsupported content type that already has an asset', async () => {
		const ws = newWs()
		const ref = put(ws, await unique(348), { contentType: 'image/svg+xml', name: 'held-svg.png' })
		const [held] = await seed(ws, 1, { pathname: ref.pathname, url: ref.url }, { blobsToo: false })
		const out = await register(ws, ref)
		assert.ok(out.doc._id.equals(held._id))
		assertNoDeletes()
		assertKept([ref])
	})

	check('discard() refuses a blob an asset references: an exact duplicate whose own row appears before the guard looks', async () => {
		const ws = newWs()
		const bytes = await unique(349)
		const [original] = await seed(ws, 1, { sha256: sha(bytes) })
		const ref = put(ws, bytes, { name: 'dup-held.png' })
		const twinDoc = assetDoc(ws, { pathname: ref.pathname, url: ref.url, sha256: sha(bytes), name: 'Twin' })
		const spy = spyDb(db, async (ev) => {
			// the guard's lookup is the first find()
			if (at(ev, 'mediaAssets', 'find', 1)) await assetCol.insertOne(twinDoc)
		})
		const out = await register(ws, ref, {}, spy)
		assert.equal(out.status, 'created', 'not "duplicate": this blob has an asset')
		assert.ok(out.doc._id.equals(twinDoc._id))
		assert.ok(!out.doc._id.equals(original._id))
		assertNoDeletes()
		assertKept([ref])
	})

	check('both calls refused for the same reason (library full): both answer 429, the one blob is deleted (twice is harmless)', async () => {
		await withLimits({ maxAssets: 5 }, async () => {
			const ws = newWs()
			await seed(ws, 5, {}, { blobsToo: false })
			const ref = put(ws, await unique(350), { name: 'reg-full.png' })
			const out = await Promise.allSettled([register(ws, ref), register(ws, ref)])
			assert.ok(out.every((o) => o.status === 'rejected' && o.reason instanceof A.AssetError && o.reason.status === 429))
			assert.ok(calls.del.length >= 1 && calls.del.every((c) => c.info.pathname === ref.pathname && c.info.url === ref.url))
			assert.ok(!blobs.has(ref.url))
			assert.equal(await countIn(ws), 5)
		})
	}, { exclusive: true })

	check('the same bytes arriving as two different blobs at once: at least one survives, no asset points at a deleted blob (8 pairs at once)', async () => {
		await Promise.all(
			Array.from({ length: 8 }, async (_, i) => {
				const ws = newWs()
				const bytes = await unique(360 + i)
				const a = put(ws, bytes, { name: `twin-a-${i}.png` })
				const b = put(ws, bytes, { name: `twin-b-${i}.png` })
				const out = await Promise.all([register(ws, a), register(ws, b)])
				const docs = await assetCol.find({ workspaceId: ws }).toArray()
				assert.ok(docs.length >= 1 && docs.length <= 2)
				for (const d of docs) assert.ok(blobs.has(norm(d.url)), 'every asset still has its blob')
				for (const r of out) assert.ok(['created', 'duplicate'].includes(r.status))
				// a blob that was discarded has no asset
				for (const ref of [a, b])
					if (!blobs.has(ref.url)) assert.ok(!docs.some((d) => d.pathname === ref.pathname), 'a deleted blob has no asset')
			}),
		)
	})

	/**
	 * Interleavings nobody wrote down. Browser and webhook twins for 24 blobs, and singles that must be refused (five
	 * ways) or answered as duplicates, all started at once in a shuffled order, with a random pause in front of every
	 * database call, every store lookup and every download. What each job ends in does not depend on the interleaving,
	 * so every outcome is asserted exactly. (A refusal that races a twin of the SAME blob is the documented residual
	 * and is kept out of the mix: no single here has a twin.) The seed fixes the shuffle and the first pauses; later
	 * pauses are drawn in the order calls happen to arrive, so interleavings differ from run to run, which is the point.
	 */
	const stressSeeds = [20260115, 7, 424242]
	for (const seed of stressSeeds)
		check(`random interleavings (seed ${seed}): twins keep one asset and their blob, each refusal deletes exactly its own blob, nothing points at a deleted blob`, async () => {
			let state = (Number(process.env.PROVE_SEED ?? seed) ^ 0x9e3779b9) >>> 0
			const rand = (n) => {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0
				return (state >>> 8) % n
			}
			const ws = newWs()
			// Pauses only start once the library has its originals: setup is not what is being shuffled.
			let shaking = false
			const spy = spyDb(db, async (ev) => {
				if (shaking && ev.phase === 'before') await sleep(rand(10))
			})
			hooks.head = async () => shaking && sleep(rand(8))
			hooks.read = async () => shaking && sleep(rand(15))

			const originals = []
			for (let i = 0; i < 4; i++) {
				const bytes = await unique(2100 + i)
				originals.push({ bytes, doc: (await register(ws, put(ws, bytes, { name: `orig-${i}.png` }))).doc })
			}

			const jobs = []
			const pairs = []
			for (let i = 0; i < 24; i++) {
				const ref = put(ws, await unique(2200 + i), { name: `pair-${i}.png` })
				pairs.push(ref)
				// Half of the requests spell the url another way: the same blob, as a browser may name it.
				for (const spellIt of [false, i % 2 === 0])
					jobs.push({ ref, run: () => register(ws, spellIt ? { ...ref, url: ref.url.replace('.com/', '.com:443/') } : ref, {}, spy), expect: { twin: true } })
			}
			const refused = []
			const refuse = (ref, status, extra = {}) => {
				refused.push(ref)
				jobs.push({ ref, run: () => register(ws, ref, extra, spy), expect: { status } })
			}
			for (let i = 0; i < 4; i++) refuse(put(ws, await unique(2300 + i), { name: `big-${i}.png`, size: MEDIA_LIMITS.maxBytes + 1 }), 413)
			for (let i = 0; i < 4; i++) refuse(put(ws, await unique(2310 + i), { name: `svg-${i}.png`, contentType: 'image/svg+xml' }), 415)
			for (let i = 0; i < 4; i++) refuse(put(ws, randomBytes(300 + i), { name: `junk-${i}.png` }), 422)
			for (let i = 0; i < 4; i++) refuse(put(ws, await unique(2320 + i), { name: `nofolder-${i}.png` }), 400, { folderId: new ObjectId() })
			for (let i = 0; i < 8; i++) {
				const original = originals[i % originals.length]
				const ref = put(ws, original.bytes, { name: `copy-${i}.png` })
				refused.push(ref)
				jobs.push({ ref, run: () => register(ws, ref, {}, spy), expect: { duplicateOf: original.doc._id } })
			}
			for (let i = jobs.length - 1; i > 0; i--) {
				const j = rand(i + 1)
				;[jobs[i], jobs[j]] = [jobs[j], jobs[i]]
			}

			shaking = true
			const settled = await Promise.allSettled(jobs.map((job) => job.run()))
			shaking = false

			const winners = new Map()
			settled.forEach((result, i) => {
				const { ref, expect } = jobs[i]
				const where = `${ref.pathname.split('/').pop()} (seed ${seed})`
				if (expect.twin) {
					assert.equal(result.status, 'fulfilled', `${where}: ${result.reason?.message}`)
					assert.equal(result.value.status, 'created', where)
					const known = winners.get(ref.pathname)
					if (known) assert.ok(known.equals(result.value.doc._id), `${where}: the two answers are one asset`)
					else winners.set(ref.pathname, result.value.doc._id)
				} else if (expect.duplicateOf) {
					assert.equal(result.status, 'fulfilled', `${where}: ${result.reason?.message}`)
					assert.equal(result.value.status, 'duplicate', where)
					assert.ok(result.value.doc._id.equals(expect.duplicateOf), `${where}: the original is the answer`)
				} else {
					assert.equal(result.status, 'rejected', where)
					assert.ok(result.reason instanceof A.AssetError && result.reason.status === expect.status, `${where}: ${result.reason?.status} ${result.reason?.message}`)
				}
			})

			const docs = await assetCol.find({ workspaceId: ws }).toArray()
			assert.equal(docs.length, originals.length + pairs.length, 'one asset per original and per twin pair, nothing else')
			assert.equal(new Set(docs.map((d) => d.pathname)).size, docs.length, 'no pathname twice')
			for (const d of docs) {
				assert.ok(blobs.has(norm(d.url)), `${d.pathname}: an asset whose blob is gone`)
				assert.equal(d.rev, 0, `${d.pathname}: written once, never rewritten`)
			}
			for (const ref of pairs) assert.ok(docs.some((d) => d.pathname === ref.pathname), `${ref.pathname}: the twins left no asset`)
			assertDeleted(ws, refused)
			assertKept([...pairs, ...originals.map((o) => ({ url: o.doc.url, pathname: o.doc.pathname }))])
		})
}

/* -------------------------------------------------------------------------- */
/* Exact duplicates                                                           */
/* -------------------------------------------------------------------------- */

async function sectionDuplicates() {
	section('register: exact duplicates')

	check('the same bytes under a different pathname: "duplicate" of the original, only the NEW blob is deleted', async () => {
		const ws = newWs()
		const bytes = await unique(400)
		const first = put(ws, bytes, { name: 'original.png' })
		const original = (await register(ws, first)).doc
		const second = put(ws, bytes, { name: 'again.png' })
		const out = await register(ws, second)
		assert.equal(out.status, 'duplicate')
		assert.ok(out.doc._id.equals(original._id), 'the original is the answer')
		assert.equal(out.doc.pathname, first.pathname)
		assertDeleted(ws, [second])
		assertKept([first])
		assert.equal(await countIn(ws), 1)
		assert.equal((await docOf(original._id)).rev, 0, 'the original is not touched')
	})

	check('a duplicate request for an original in a folder returns it with that folder', async () => {
		const ws = newWs()
		const folder = (await folderCol.insertOne({ workspaceId: ws, parentId: null, name: 'F', nameKey: 'f', createdBy: 'x', createdAt: new Date(), updatedAt: new Date() })).insertedId
		const bytes = await unique(401)
		await register(ws, put(ws, bytes, { name: 'o.png' }), { folderId: folder })
		const out = await register(ws, put(ws, bytes, { name: 'p.png' }), { folderId: null })
		assert.equal(out.status, 'duplicate')
		assert.ok(out.doc.folderId.equals(folder))
	})

	check('duplicates are per workspace: the same bytes in another account are a new asset', async () => {
		const bytes = await unique(402)
		const ws = newWs()
		const other = newWs()
		await register(other, put(other, bytes, { name: 'theirs.png' }))
		const out = await register(ws, put(ws, bytes, { name: 'mine.png' }))
		assert.equal(out.status, 'created')
		assertNoDeletes()
	})

	check('the same file name with different bytes is not a duplicate', async () => {
		const ws = newWs()
		await register(ws, put(ws, await unique(403), { name: 'same.png' }))
		const out = await register(ws, put(ws, await unique(404), { name: 'same.png', pathname: `${prefixOf(ws)}same-2.png` }), { filename: 'same.png' })
		assert.equal(out.status, 'created')
		assert.equal(await countIn(ws), 2)
		assertNoDeletes()
	})

	check('with several originals the OLDEST is the answer, whatever the natural order', async () => {
		const ws = newWs()
		const bytes = await unique(405)
		const newer = assetDoc(ws, { sha256: sha(bytes), createdAt: new Date('2026-06-01T00:00:00Z'), name: 'newer' })
		const older = assetDoc(ws, { sha256: sha(bytes), createdAt: new Date('2026-02-01T00:00:00Z'), name: 'older' })
		await assetCol.insertMany([newer, older])
		const out = await register(ws, put(ws, bytes, { name: 'third.png' }))
		assert.equal(out.status, 'duplicate')
		assert.ok(out.doc._id.equals(older._id))
	})

	check('a duplicate is discarded once and answered again as "gone" if the same blob is registered afterwards', async () => {
		const ws = newWs()
		const bytes = await unique(406)
		await register(ws, put(ws, bytes, { name: 'o.png' }))
		const dup = put(ws, bytes, { name: 'd.png' })
		assert.equal((await register(ws, dup)).status, 'duplicate')
		await rejects(register(ws, dup), 400) // the blob was deleted: nothing left to register
		assert.equal(await countIn(ws), 1)
	})

	check('the duplicate check does not read other fields: a different image with the same color but other bytes is new', async () => {
		const ws = newWs()
		const a = await solid([5, 6, 7], 10, 10)
		const b = await solid([5, 6, 7], 11, 10)
		await register(ws, put(ws, a, { name: 'a.png' }))
		assert.equal((await register(ws, put(ws, b, { name: 'b.png' }))).status, 'created')
	})
}

/* -------------------------------------------------------------------------- */
/* updateAsset                                                                */
/* -------------------------------------------------------------------------- */

const mkFolder = async (ws, name, parentId = null) => {
	const doc = { _id: new ObjectId(), workspaceId: ws, parentId, name, nameKey: folderKey(name), createdBy: 'seed', createdAt: new Date(), updatedAt: new Date() }
	await folderCol.insertOne(doc)
	return doc
}
const one = async (ws, over = {}) => (await seed(ws, 1, over))[0]
const update = (ws, id, patch, d = db) => A.updateAsset(d, ws, id, patch)
const writes = (spy) => spy.counts.get('mediaAssets.updateOne') ?? 0

async function sectionUpdate() {
	section('updateAsset: name, words, notes')

	check('name: trimmed, nameKey is the lowercase name, terms rebuilt, exactly one revision, what is returned is what is stored', async () => {
		const ws = newWs()
		const a = await one(ws, { name: 'Zebra', filename: 'img.png' })
		assert.ok(a.terms.includes('zebra'))
		const out = await update(ws, a._id, { name: '  New Hero Banner  ' })
		assert.equal(out.name, 'New Hero Banner')
		assert.equal(out.nameKey, 'new hero banner')
		assert.equal(out.rev, 1)
		const stored = await docOf(a._id)
		assert.deepEqual(stored, out)
		assert.ok(stored.terms.includes('hero') && stored.terms.includes('banner'))
		assert.ok(!stored.terms.includes('zebra'), 'the old name is out of the index')
		assert.deepEqual(stored.terms, buildTerms(stored))
		assert.equal(stored.captionEdited, false, 'a name is not a caption')
		assert.ok(+stored.updatedAt > +a.updatedAt)
		assert.deepEqual(stored.tags, a.tags)
		assert.equal(stored.filename, 'img.png', 'the original file name is never edited')
	})

	check('name: a case-only change is a change (and keeps the same nameKey)', async () => {
		const ws = newWs()
		const a = await one(ws, { name: 'zebra' })
		const out = await update(ws, a._id, { name: 'Zebra' })
		assert.equal(out.name, 'Zebra')
		assert.equal(out.nameKey, 'zebra')
		assert.equal(out.rev, 1)
	})

	check('name: unicode is kept, inner whitespace collapses, controls and bidi overrides are stripped', async () => {
		const ws = newWs()
		const a = await one(ws)
		assert.equal((await update(ws, a._id, { name: 'Café   Ünï 日本' })).name, 'Café Ünï 日本')
		assert.equal((await update(ws, a._id, { name: 'a‮b\u0000c​d' })).name, 'abcd')
		assert.equal((await update(ws, a._id, { name: 'ÀB' })).nameKey, 'àb')
	})

	check('name: longer than the limit is clamped to nameMax code points, never through a surrogate pair', async () => {
		const ws = newWs()
		const a = await one(ws)
		const out = await update(ws, a._id, { name: `${'a'.repeat(MEDIA_LIMITS.nameMax - 1)}😀😀😀` })
		assert.equal(Array.from(out.name).length, MEDIA_LIMITS.nameMax)
		assert.equal(out.name, out.name.toWellFormed(), 'no half a pair')
	})

	for (const [label, name] of [['empty', ''], ['spaces', '   '], ['zero-width only', '​​'], ['a bidi override only', '‮'], ['control characters only', '\u0000\u0007\u001b']])
		check(`name: ${label} is a 400 and changes nothing`, async () => {
			const ws = newWs()
			const a = await one(ws, { name: 'Keep me' })
			await rejects(update(ws, a._id, { name, caption: 'must not be written either' }), 400)
			const stored = await docOf(a._id)
			assert.equal(stored.name, 'Keep me')
			assert.equal(stored.caption, '', 'the whole patch is refused, not half of it')
			assert.equal(stored.rev, 0)
		})

	check('caption: set, captionEdited true, indexed, one revision', async () => {
		const ws = newWs()
		const a = await one(ws)
		const out = await update(ws, a._id, { caption: 'A white work van outside the shop' })
		assert.equal(out.caption, 'A white work van outside the shop')
		assert.equal(out.captionEdited, true)
		assert.equal(out.rev, 1)
		assert.deepEqual(await docOf(a._id), out)
		for (const term of ['white', 'work', 'van', 'outside', 'shop']) assert.ok(out.terms.includes(term), term)
		assert.ok(!out.terms.includes('a') && !out.terms.includes('the'), 'stopwords are never indexed')
	})

	check('alt text alone also sets captionEdited and is indexed', async () => {
		const ws = newWs()
		const a = await one(ws)
		const out = await update(ws, a._id, { altText: 'Technician repairing a boiler' })
		assert.equal(out.altText, 'Technician repairing a boiler')
		assert.equal(out.captionEdited, true)
		assert.ok(out.terms.includes('boiler') && out.terms.includes('technician'))
		assert.equal(out.caption, '')
	})

	check('notes alone do NOT set captionEdited, are indexed, and keep their line breaks', async () => {
		const ws = newWs()
		const a = await one(ws)
		const out = await update(ws, a._id, { notes: 'Client approved\r\nuse on homepage\n\nnot for print' })
		assert.equal(out.notes, 'Client approved\nuse on homepage\n\nnot for print')
		assert.equal(out.captionEdited, false)
		assert.ok(out.terms.includes('homepage') && out.terms.includes('approved'))
	})

	check('notes: control characters, zero-width characters and bidi overrides go, text stays; clamped to notesMax', async () => {
		const ws = newWs()
		const a = await one(ws)
		const out = await update(ws, a._id, { notes: 'a\u0000b‮c​d\u0007\nline two' })
		assert.equal(out.notes, 'abcd\nline two')
		const long = await update(ws, a._id, { notes: `${'x'.repeat(MEDIA_LIMITS.notesMax - 1)}😀😀` })
		assert.ok(Array.from(long.notes).length <= MEDIA_LIMITS.notesMax)
		assert.equal(long.notes, long.notes.toWellFormed())
	})

	check('caption: whitespace and line breaks collapse to single spaces, and the clamp is by code point', async () => {
		const ws = newWs()
		const a = await one(ws)
		assert.equal((await update(ws, a._id, { caption: 'line one\n\n  line   two\t!' })).caption, 'line one line two !')
		const long = await update(ws, a._id, { caption: `${'c'.repeat(MEDIA_LIMITS.captionMax - 1)}😀😀` })
		assert.equal(Array.from(long.caption).length, MEDIA_LIMITS.captionMax)
		const alt = await update(ws, a._id, { altText: 'a'.repeat(MEDIA_LIMITS.altMax + 50) })
		assert.equal(alt.altText.length, MEDIA_LIMITS.altMax)
	})

	check('caption: the same text again is not an edit (no write, no revision, captionEdited stays false)', async () => {
		const ws = newWs()
		const a = await one(ws, { caption: 'Written by the AI', captionEdited: false })
		const spy = spyDb(db)
		const out = await update(ws, a._id, { caption: 'Written by the AI', altText: '' }, spy)
		assert.equal(out.captionEdited, false)
		assert.equal(out.rev, 0)
		assert.equal(writes(spy), 0, 'nothing to write')
		assert.deepEqual(await docOf(a._id), a)
	})

	check('caption: clearing it is an edit by a person (empty, captionEdited true), and later patches keep the flag', async () => {
		const ws = newWs()
		const a = await one(ws, { caption: 'AI words' })
		const out = await update(ws, a._id, { caption: '' })
		assert.equal(out.caption, '')
		assert.equal(out.captionEdited, true)
		const again = await update(ws, a._id, { name: 'Renamed' })
		assert.equal(again.captionEdited, true)
		assert.equal(again.rev, 2)
	})

	check('text with a lone surrogate is stored well-formed, and saving it again is not a change', async () => {
		const ws = newWs()
		const a = await one(ws)
		const out = await update(ws, a._id, { caption: 'ab\ud83d' })
		assert.equal(out.caption, 'ab�')
		const spy = spyDb(db)
		const again = await update(ws, a._id, { caption: 'ab\ud83d' }, spy)
		assert.equal(again.rev, 1)
		assert.equal(writes(spy), 0)
	})

	section('updateAsset: tags')

	check('addTags: manual tags with cleaned labels, one per slug, terms rebuilt', async () => {
		const ws = newWs()
		const a = await one(ws)
		const out = await update(ws, a._id, { addTags: ['Kitchen Remodel', '  van  ', 'Kitchen   remodel', ''] })
		assert.deepEqual(out.tags, [manual('kitchen-remodel', 'Kitchen Remodel'), manual('van', 'van')])
		assert.deepEqual(out.rejectedTags, [])
		assert.equal(out.rev, 1)
		assert.deepEqual(await docOf(a._id), out)
		for (const term of ['kitchen', 'remodel', 'van']) assert.ok(out.terms.includes(term))
		assert.equal(out.captionEdited, false)
	})

	check('addTags: an automatic tag the person adds becomes manual, keeping its label; manual tags come first', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [vision('van', 0.9, 'Van'), fname('kitchen')] })
		const out = await update(ws, a._id, { addTags: ['Mine', 'van'] })
		// Manual first (in the order they stand: the promoted van keeps its place), then vision, then file name.
		assert.deepEqual(out.tags, [manual('van', 'Van'), manual('mine', 'Mine'), fname('kitchen')])
	})

	check('addTags: a tag already manual changes nothing (no write at all)', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [manual('van', 'Van')] })
		const spy = spyDb(db)
		const out = await update(ws, a._id, { addTags: ['VAN', 'van!'] }, spy)
		assert.equal(out.rev, 0)
		assert.equal(writes(spy), 0)
	})

	check('addTags: labels that are no tag at all are ignored, non-Latin ones are kept, a long label is clamped', async () => {
		const ws = newWs()
		const a = await one(ws)
		const out = await update(ws, a._id, { addTags: ['!!!', '   ', '日本', 'x'.repeat(200)] })
		assert.deepEqual(slugsOf(out), ['日本', 'x'.repeat(MEDIA_LIMITS.tagLabelMax)])
		assert.equal(out.tags[1].label.length, MEDIA_LIMITS.tagLabelMax)
		const none = await update(ws, a._id, { addTags: ['!!!'] })
		assert.equal(none.rev, 1, 'nothing valid, nothing written')
	})

	check('addTags: the tag cap is respected, extra labels are dropped (not an error) and nothing is written for them', async () => {
		const ws = newWs()
		const tags = Array.from({ length: MEDIA_LIMITS.maxTagsPerAsset }, (_, i) => manual(`t${i}`, `T${i}`))
		const a = await one(ws, { tags })
		const spy = spyDb(db)
		const out = await update(ws, a._id, { addTags: ['one more'] }, spy)
		assert.equal(out.tags.length, MEDIA_LIMITS.maxTagsPerAsset)
		assert.equal(out.rev, 0)
		assert.equal(writes(spy), 0)
	})

	check('addTags follows a redirect left by a rename or merge, and un-rejects what the person typed as well as the target', async () => {
		const ws = newWs()
		await ruleCol.insertOne({ workspaceId: ws, from: 'bee', to: { slug: 'insect', label: 'Insect' }, createdAt: new Date() })
		const a = await one(ws, { rejectedTags: ['old', 'bee', 'insect'] })
		const out = await update(ws, a._id, { addTags: ['Bee'] })
		assert.deepEqual(out.tags, [manual('insect', 'Insect')])
		assert.deepEqual(out.rejectedTags, ['old'])
	})

	check('addTags is allowed for a tag the auto-tagger is blocked from (a block is not for people)', async () => {
		const ws = newWs()
		await ruleCol.insertOne({ workspaceId: ws, from: 'spam', to: null, createdAt: new Date() })
		const a = await one(ws)
		const out = await update(ws, a._id, { addTags: ['Spam'] })
		assert.deepEqual(out.tags, [manual('spam', 'Spam')])
	})

	check('addTags: a rule of another workspace does not redirect', async () => {
		const ws = newWs()
		await ruleCol.insertOne({ workspaceId: newWs(), from: 'bee', to: { slug: 'insect', label: 'Insect' }, createdAt: new Date() })
		const a = await one(ws)
		assert.deepEqual(slugsOf(await update(ws, a._id, { addTags: ['Bee'] })), ['bee'])
	})

	check('removeTags: removes by slug, remembers each removal (oldest first), keeps the rest in order', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [manual('mine'), vision('van'), fname('kitchen')], rejectedTags: ['old'] })
		const out = await update(ws, a._id, { removeTags: ['kitchen'] })
		assert.deepEqual(out.tags, [manual('mine'), vision('van')])
		assert.deepEqual(out.rejectedTags, ['old', 'kitchen'])
		assert.equal(out.rev, 1)
		assert.ok(!out.terms.includes('kitchen'), 'the removed tag is out of the index')
		assert.deepEqual(await docOf(a._id), out)
	})

	check('removeTags: removing an AUTOMATIC tag is remembered, so the auto-tagger cannot put it back; a manual one too', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [vision('van'), manual('mine')] })
		const out = await update(ws, a._id, { removeTags: ['van', 'mine'] })
		assert.deepEqual(out.tags, [])
		assert.deepEqual(out.rejectedTags, ['van', 'mine'])
	})

	check('removeTags accepts a label as well as a slug', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [manual('kitchen-remodel', 'Kitchen Remodel')] })
		const out = await update(ws, a._id, { removeTags: ['Kitchen Remodel'] })
		assert.deepEqual(out.tags, [])
		assert.deepEqual(out.rejectedTags, ['kitchen-remodel'])
	})

	check('removing a tag and adding it back un-rejects it', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [fname('kitchen')] })
		const removed = await update(ws, a._id, { removeTags: ['kitchen'] })
		assert.deepEqual(removed.rejectedTags, ['kitchen'])
		const back = await update(ws, a._id, { addTags: ['Kitchen'] })
		assert.deepEqual(back.tags, [manual('kitchen', 'Kitchen')])
		assert.deepEqual(back.rejectedTags, [])
	})

	check('addTags then removeTags in ONE patch: add first, then remove, in a single write', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [manual('keep')] })
		const spy = spyDb(db)
		const out = await update(ws, a._id, { addTags: ['fresh', 'gone'], removeTags: ['gone'] }, spy)
		assert.deepEqual(out.tags, [manual('keep'), manual('fresh', 'fresh')])
		assert.deepEqual(out.rejectedTags, ['gone'])
		assert.equal(writes(spy), 1)
		assert.equal(out.rev, 1)
	})

	check('removing a slug the image never had is remembered (the library function\'s rule), and twice is idempotent', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [manual('keep')] })
		const first = await update(ws, a._id, { removeTags: ['never-had'] })
		assert.deepEqual(first.tags, [manual('keep')])
		assert.deepEqual(first.rejectedTags, ['never-had'])
		const spy = spyDb(db)
		const second = await update(ws, a._id, { removeTags: ['never-had'] }, spy)
		assert.equal(second.rev, 1)
		assert.equal(writes(spy), 0, 'already remembered: nothing to write')
	})

	check('tags of the stored document that are not in canonical order or not well formed are repaired when touched', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [fname('kitchen'), { slug: 'odd', label: 'Odd', source: 'weird' }, vision('van', 0.7), manual('mine')] })
		const out = await update(ws, a._id, { addTags: ['New'] })
		assert.deepEqual(slugsOf(out), ['odd', 'mine', 'new', 'van', 'kitchen'], 'manual (an unknown source counts as manual) first, then vision, then file name')
		assert.ok(out.tags.every((t) => ['manual', 'auto'].includes(t.source)))
	})

	section('updateAsset: folders')

	check('folderId: moves into a folder of the workspace, one revision; null moves it to the root', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'Clients')
		const a = await one(ws)
		const moved = await update(ws, a._id, { folderId: hex(folder._id) })
		assert.ok(moved.folderId.equals(folder._id))
		assert.equal(moved.rev, 1)
		assert.deepEqual(await docOf(a._id), moved)
		const root = await update(ws, a._id, { folderId: null })
		assert.equal(root.folderId, null)
		assert.equal((await docOf(a._id)).folderId, null, 'an explicit null, not a missing field')
		assert.equal(root.rev, 2)
	})

	check('folderId: the folder it is already in (or the root, for an unfiled image) is no change', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'Same')
		const a = await one(ws, { folderId: folder._id })
		const b = await one(ws)
		const spy = spyDb(db)
		assert.equal((await update(ws, a._id, { folderId: hex(folder._id) }, spy)).rev, 0)
		assert.equal((await update(ws, b._id, { folderId: null }, spy)).rev, 0)
		assert.equal(writes(spy), 0)
	})

	for (const [label, make] of [
		['a folder that does not exist', () => hex(new ObjectId())],
		['a folder of another workspace', async () => hex((await mkFolder(newWs(), 'Theirs'))._id)],
		['a malformed id', () => 'nope'],
		['an operator object', () => ({ $ne: null })],
		['a number', () => 12],
		['an ObjectId object of a missing folder', () => new ObjectId()],
	])
		check(`folderId: ${label} is a 400 and nothing is written (not even the other fields)`, async () => {
			const ws = newWs()
			const a = await one(ws, { name: 'Stay' })
			const error = await rejects(update(ws, a._id, { folderId: await make(), name: 'Changed', addTags: ['x'] }), 400)
			noLeak(error)
			assert.deepEqual(await docOf(a._id), a)
		})

	check('folder deleted between the check and the write: the image is moved to the root instead of pointing at nothing', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'Doomed')
		const a = await one(ws)
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'updateOne', 1)) await folderCol.deleteOne({ _id: folder._id })
		})
		const out = await update(ws, a._id, { folderId: hex(folder._id) }, spy)
		assert.equal(out.folderId, null)
		assert.equal((await docOf(a._id)).folderId, null)
	})

	section('updateAsset: scope, hostile input, concurrency')

	check('an unknown id, a foreign id and non-ObjectId ids are 404 "Image not found." and write nothing', async () => {
		const ws = newWs()
		const other = newWs()
		const theirs = await one(other, { name: 'Theirs' })
		for (const id of [new ObjectId(), theirs._id, hex(theirs._id), null, undefined, { $ne: null }, 5])
			noLeak(await rejects(update(ws, id, { name: 'Hijacked' }), 404, String(id)))
		assert.deepEqual(await docOf(theirs._id), theirs, 'the other account\'s image is untouched')
		await rejects(update({ $ne: null }, theirs._id, { name: 'x' }), 404)
		await rejects(update(hex(other), theirs._id, { name: 'x' }), 404)
		assert.deepEqual(await docOf(theirs._id), theirs)
	})

	check('the 404 for a foreign id does not depend on the patch being valid for it (no probing by folder or tags)', async () => {
		const ws = newWs()
		const theirs = await one(newWs())
		const folder = await mkFolder(ws, 'Mine')
		for (const patch of [{ folderId: hex(folder._id) }, { addTags: ['x'] }, { removeTags: ['x'] }, { notes: 'x' }, {}])
			await rejects(update(ws, theirs._id, patch), 404, JSON.stringify(patch))
	})

	check('keys the schema does not offer are never read: rev, workspaceId, terms, tags, tagging, kind, _id, uploadedBy', async () => {
		const ws = newWs()
		const a = await one(ws, { tags: [manual('keep')] })
		const evil = {
			caption: 'ok',
			rev: 999,
			workspaceId: new ObjectId(),
			terms: ['evil'],
			tags: [manual('evil')],
			rejectedTags: ['x'],
			tagging: { status: 'failed', attempts: 9 },
			kind: 'logo',
			_id: new ObjectId(),
			uploadedBy: 'someone else',
			textInImage: 'evil',
			keywords: ['evil'],
			pathname: 'workspaces/x/media/x.png',
			url: 'https://evil.example.com/x.png',
			sha256: 'x',
			bytes: 1,
			captionEdited: false,
		}
		const out = await update(ws, a._id, evil)
		const stored = await docOf(a._id)
		assert.deepEqual(stored, out)
		assert.equal(stored.caption, 'ok')
		assert.equal(stored.rev, 1)
		assert.ok(stored.workspaceId.equals(ws) && stored._id.equals(a._id))
		for (const key of ['tags', 'rejectedTags', 'tagging', 'kind', 'uploadedBy', 'textInImage', 'keywords', 'pathname', 'url', 'sha256', 'bytes'])
			assert.deepEqual(stored[key], a[key], key)
		assert.ok(!stored.terms.includes('evil'))
		assert.equal(stored.captionEdited, true, 'derived from the caption change, not copied from the body')
		// Not a list of fields to compare, the whole document: only what a caption edit changes may differ.
		const untouched = ({ caption, captionEdited, rev, terms, updatedAt, ...rest }) => rest
		assert.deepEqual(untouched(stored), untouched(a), 'nothing but what a caption edit changes was touched')
	})

	check('a body of Mongo operators, dotted paths and prototype keys changes nothing it did not ask for', async () => {
		const ws = newWs()
		const a = await one(ws, { name: 'Stay', tags: [manual('keep')], notes: 'keep me' })
		const body = JSON.parse(
			JSON.stringify({
				notes: 'asked for this',
				$set: { name: 'Hijacked', workspaceId: 'x' },
				$unset: { tags: '' },
				$inc: { rev: 50 },
				$rename: { notes: 'caption' },
				'tags.0.label': 'Hijacked',
				'tagging.status': 'failed',
				'$where': 'sleep(10000)',
				'_id': { $ne: null },
				'workspaceId': { $ne: null },
			}),
		)
		const out = await update(ws, a._id, body)
		const stored = await docOf(a._id)
		assert.deepEqual(stored, out)
		assert.equal(stored.notes, 'asked for this')
		assert.equal(stored.rev, 1)
		const untouched = ({ notes, rev, terms, updatedAt, ...rest }) => rest
		assert.deepEqual(untouched(stored), untouched(a), 'only the notes changed')
		assert.equal(await countIn(ws), 1)
	})

	check('a body with a "__proto__" key is just a key: nothing is polluted and only known fields apply', async () => {
		const ws = newWs()
		const a = await one(ws)
		const body = JSON.parse('{"__proto__":{"name":"pwned","isAdmin":true},"notes":"n","constructor":{"prototype":{"x":1}}}')
		const out = await update(ws, a._id, body)
		assert.equal(out.notes, 'n')
		assert.equal(out.name, a.name)
		assert.equal({}.name, undefined)
		assert.equal({}.isAdmin, undefined)
	})

	for (const [label, patch] of [
		['a name that is a number', { name: 5 }],
		['a caption that is an object', { caption: { $gt: '' } }],
		['alt text that is an array', { altText: ['x'] }],
		['notes that are null', { notes: null }],
		['addTags that is a string', { addTags: 'kitchen' }],
		['removeTags that is an object', { removeTags: { $ne: null } }],
		['a null patch', null],
		['an array patch', ['name']],
		['a string patch', 'name'],
	])
		check(`typed-hostile input: ${label} is a 400`, async () => {
			const ws = newWs()
			const a = await one(ws)
			await rejects(update(ws, a._id, patch), 400)
			assert.deepEqual(await docOf(a._id), a)
		})

	check('non-string items in a tag list are skipped, the rest apply; absurd lists are cut to the schema\'s own limits', async () => {
		const ws = newWs()
		const a = await one(ws)
		const out = await update(ws, a._id, { addTags: [5, null, { $ne: 1 }, 'ok', ...Array.from({ length: 500 }, (_, i) => `bulk-${i}`)] })
		assert.ok(out.tags.length <= 20 && out.tags.length >= 1)
		assert.equal(out.tags[0].slug, 'ok')
	})

	check('an empty patch, or one that changes nothing, is a read: the stored document comes back and nothing is written', async () => {
		const ws = newWs()
		const a = await one(ws, { name: 'Same', notes: 'same' })
		const spy = spyDb(db)
		for (const patch of [{}, { name: 'Same' }, { notes: 'same', addTags: [], removeTags: [] }]) {
			const out = await update(ws, a._id, patch, spy)
			assert.deepEqual(out, a)
		}
		assert.equal(writes(spy), 0)
	})

	check('several fields in one patch are ONE write and one revision', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'F')
		const a = await one(ws, { tags: [manual('x')] })
		const spy = spyDb(db)
		const out = await update(ws, a._id, { name: 'N', caption: 'C', altText: 'Al', notes: 'No', folderId: hex(folder._id), addTags: ['y'], removeTags: ['x'] }, spy)
		assert.equal(writes(spy), 1 + 0, 'one updateOne for the edit')
		assert.equal(out.rev, 1)
		assert.deepEqual([out.name, out.caption, out.altText, out.notes], ['N', 'C', 'Al', 'No'])
		assert.ok(out.folderId.equals(folder._id))
		assert.deepEqual(slugsOf(out), ['y'])
		assert.deepEqual(out.rejectedTags, ['x'])
		assert.equal(out.captionEdited, true)
		assert.deepEqual(await docOf(a._id), out)
	})

	check('concurrent tag edits keep BOTH changes: the loser re-reads and re-applies on the newer revision', async () => {
		const ws = newWs()
		const a = await one(ws)
		const wait = barrier(2)
		// Both read revision 0; neither may write until the other has also read.
		const spy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaAssets' && ev.method === 'updateOne' && ev.phase === 'before' && ev.n <= 2) await wait()
		})
		const [x, y] = await Promise.all([update(ws, a._id, { addTags: ['alpha'] }, spy), update(ws, a._id, { addTags: ['beta'] }, spy)])
		const stored = await docOf(a._id)
		assert.deepEqual(slugsOf(stored).sort(), ['alpha', 'beta'])
		assert.equal(stored.rev, 2)
		assert.equal(writes(spy), 3, 'two first writes, one lost and re-applied')
		assert.ok([x, y].some((r) => r.tags.length === 2), 'the loser answers with the merged tags')
		assert.ok(stored.terms.includes('alpha') && stored.terms.includes('beta'))
	})

	check('concurrent edits to different fields (name and tags and notes) all land', async () => {
		const ws = newWs()
		const a = await one(ws, { name: 'Before' })
		const wait = barrier(3)
		const spy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaAssets' && ev.method === 'updateOne' && ev.phase === 'before' && ev.n <= 3) await wait()
		})
		await Promise.all([update(ws, a._id, { name: 'After' }, spy), update(ws, a._id, { addTags: ['t'] }, spy), update(ws, a._id, { notes: 'n' }, spy)])
		const stored = await docOf(a._id)
		assert.equal(stored.name, 'After')
		assert.deepEqual(slugsOf(stored), ['t'])
		assert.equal(stored.notes, 'n')
		assert.equal(stored.rev, 3)
		assert.equal(stored.nameKey, 'after')
	})

	check('four racing tag additions on one image all land (the retry budget covers a few writers)', async () => {
		const ws = newWs()
		const a = await one(ws)
		await Promise.all(['a1', 'b2', 'c3', 'd4'].map((tag) => update(ws, a._id, { addTags: [tag] })))
		const stored = await docOf(a._id)
		assert.deepEqual(slugsOf(stored).sort(), ['a1', 'b2', 'c3', 'd4'])
		assert.equal(stored.rev, 4)
	})

	check('a write that can never land is a 409 "try again" (a MediaError), not a silent loss, and leaves no half-applied patch', async () => {
		const ws = newWs()
		const a = await one(ws)
		const spy = spyDb(db, async (ev) => {
			// somebody else always writes first
			if (ev.coll === 'mediaAssets' && ev.method === 'updateOne' && ev.phase === 'before')
				await assetCol.updateOne({ _id: a._id }, { $inc: { rev: 1 } })
		})
		let thrown
		try {
			await update(ws, a._id, { name: 'Never lands', addTags: ['nope'] }, spy)
		} catch (e) {
			thrown = e
		}
		assert.ok(thrown instanceof MediaError && thrown.status === 409, String(thrown))
		const stored = await docOf(a._id)
		assert.equal(stored.name, a.name)
		assert.deepEqual(stored.tags, [])
	})

	check('the answer is the stored document even after a lost-and-reapplied write', async () => {
		const ws = newWs()
		const a = await one(ws)
		let bumped = false
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'updateOne', 1) && !bumped) {
				bumped = true
				await assetCol.updateOne({ _id: a._id }, { $set: { notes: 'someone else' }, $inc: { rev: 1 } })
			}
		})
		const out = await update(ws, a._id, { addTags: ['mine'] }, spy)
		assert.equal(out.notes, 'someone else', 'their change is in the answer')
		assert.deepEqual(await docOf(a._id), out)
	})

	check('an image deleted while it is being edited is a 404 (it is gone), not a 409 or a crash, and nothing is brought back', async () => {
		const ws = newWs()
		const a = await one(ws)
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'updateOne', 1)) await assetCol.deleteOne({ _id: a._id })
		})
		const error = await rejects(update(ws, a._id, { addTags: ['x'], name: 'Late' }, spy), 404)
		noLeak(error)
		assert.equal(await countIn(ws), 0)
	})

	check('a frozen patch is read, never written to (callers may hand over a frozen object)', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'F')
		const a = await one(ws, { tags: [manual('old')] })
		const patch = Object.freeze({
			name: 'Frozen',
			folderId: hex(folder._id),
			addTags: Object.freeze(['b', 'a']),
			removeTags: Object.freeze(['old']),
		})
		const out = await update(ws, a._id, patch)
		assert.equal(out.name, 'Frozen')
		assert.deepEqual(slugsOf(out), ['b', 'a'])
		assert.deepEqual(patch.addTags, ['b', 'a'])
	})
}

/* -------------------------------------------------------------------------- */
/* Bulk                                                                       */
/* -------------------------------------------------------------------------- */

const idsOf = (docs) => docs.map((d) => d._id)
const stored = (docs) => assetCol.find({ _id: { $in: idsOf(docs) } }).toArray()
const storedById = async (docs) => new Map((await stored(docs)).map((d) => [String(d._id), d]))
const same = (a, b) => assert.deepEqual(a, b)

/** Every call of one collection method with its first argument, for slicing checks. */
function recordCalls(coll, method) {
	const seen = []
	const spy = spyDb(db, async (ev) => {
		if (ev.coll === coll && ev.method === method && ev.phase === 'before') seen.push(ev.args)
	})
	return { spy, seen }
}

async function sectionBulkMove() {
	section('bulk: moveAssets')

	check('moves into a folder and reports exactly how many moved; nothing else about the images changes', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'Clients')
		const docs = await seed(ws, 5, (i) => ({ tags: [manual(`t${i}`)], name: `n${i}` }))
		const moved = await A.moveAssets(db, ws, idsOf(docs), folder._id)
		assert.equal(moved, 5)
		const now = await storedById(docs)
		for (const d of docs) {
			const s = now.get(String(d._id))
			assert.ok(s.folderId.equals(folder._id))
			assert.equal(s.rev, 0, 'a move is not a revision')
			assert.deepEqual({ ...s, folderId: null, updatedAt: null }, { ...d, folderId: null, updatedAt: null }, 'tags, terms, name... untouched')
			assert.ok(+s.updatedAt > +d.updatedAt)
		}
	})

	check('images already in the folder are not counted and not rewritten', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'Target')
		const there = await seed(ws, 3, { folderId: folder._id })
		const elsewhere = await seed(ws, 4)
		const moved = await A.moveAssets(db, ws, idsOf([...there, ...elsewhere]), folder._id)
		assert.equal(moved, 4)
		const now = await storedById(there)
		for (const d of there) assert.equal(+now.get(String(d._id)).updatedAt, +d.updatedAt, 'untouched')
		assert.equal(await A.moveAssets(db, ws, idsOf([...there, ...elsewhere]), folder._id), 0, 'again: nothing left to move')
	})

	check('null moves to the root (an explicit null); a 24-hex string folder id is accepted', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'F')
		const docs = await seed(ws, 3, { folderId: folder._id })
		assert.equal(await A.moveAssets(db, ws, idsOf(docs), null), 3)
		for (const s of await stored(docs)) assert.equal(s.folderId, null)
		assert.equal(await A.moveAssets(db, ws, idsOf(docs), hex(folder._id)), 3)
		for (const s of await stored(docs)) assert.ok(s.folderId.equals(folder._id))
	})

	check('ids of another workspace are ignored and not counted; their images are not touched', async () => {
		const ws = newWs()
		const other = newWs()
		const theirFolder = await mkFolder(other, 'Theirs')
		const mine = await seed(ws, 3)
		const theirs = await seed(other, 2, { folderId: theirFolder._id })
		const folder = await mkFolder(ws, 'Mine')
		const moved = await A.moveAssets(db, ws, idsOf([...mine, ...theirs]), folder._id)
		assert.equal(moved, 3)
		const now = await stored(theirs)
		for (const s of now) assert.ok(s.folderId.equals(theirFolder._id))
		same(now.map((d) => +d.updatedAt).sort(), theirs.map((d) => +d.updatedAt).sort())
	})

	for (const [label, make] of [
		['a folder that does not exist', () => new ObjectId()],
		['a folder of another workspace', async () => (await mkFolder(newWs(), 'Theirs'))._id],
		['a malformed id', () => 'nope'],
		['an operator object', () => ({ $ne: null })],
		['a number', () => 42],
		['an array', () => [new ObjectId()]],
		['undefined (only an explicit null is the root)', () => undefined],
	])
		check(`target ${label}: a 400 and nothing moves`, async () => {
			const ws = newWs()
			const docs = await seed(ws, 3)
			const error = await rejects(A.moveAssets(db, ws, idsOf(docs), await make()), 400)
			noLeak(error)
			same(await stored(docs), docs)
		})

	check('hostile ids: strings, operator objects, null, repeats and unknown ids never reach the filter or the count', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'F')
		const docs = await seed(ws, 2)
		const spy = spyDb(db)
		const moved = await A.moveAssets(spy, ws, [hex(docs[0]._id), { $ne: null }, null, undefined, 7, docs[0]._id, docs[0]._id, new ObjectId(), docs[1]._id], folder._id)
		assert.equal(moved, 2)
		assert.equal(spy.counts.get('mediaAssets.updateMany'), 1)
		assert.equal(await A.moveAssets(db, ws, [], folder._id), 0)
		assert.equal(await A.moveAssets(db, ws, 'not-an-array', folder._id), 0)
		const none = spyDb(db)
		assert.equal(await A.moveAssets(none, { $ne: null }, [docs[0]._id], folder._id), 0)
		assert.equal(await A.moveAssets(none, hex(ws), [docs[0]._id], folder._id), 0)
		assert.equal(none.counts.size, 0, 'a workspace that is not an ObjectId costs no database call')
	})

	check('over 500 ids (501): slices of at most bulkIdsCap, every image moved', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'Big')
		const docs = await seed(ws, MEDIA_LIMITS.bulkIdsCap + 1, {}, { blobsToo: false })
		const { spy, seen } = recordCalls('mediaAssets', 'updateMany')
		const moved = await A.moveAssets(spy, ws, idsOf(docs), folder._id)
		assert.equal(moved, 501)
		assert.deepEqual(seen.map((args) => args[0]._id.$in.length), [500, 1])
		assert.ok(seen.every((args) => args[0].workspaceId.equals(ws)), 'every slice is scoped to the workspace')
		assert.equal(await countIn(ws, { folderId: folder._id }), 501)
	})

	check('three slices: a small slice size splits ids as 4, 4 and 3, and a repeated id does not make a fourth', async () => {
		await withLimits({ bulkIdsCap: 4 }, async () => {
			const ws = newWs()
			const folder = await mkFolder(ws, 'Small')
			const docs = await seed(ws, 11, {}, { blobsToo: false })
			const { spy, seen } = recordCalls('mediaAssets', 'updateMany')
			assert.equal(await A.moveAssets(spy, ws, [...idsOf(docs), docs[0]._id, docs[5]._id], folder._id), 11)
			assert.deepEqual(seen.map((args) => args[0]._id.$in.length), [4, 4, 3])
		})
	}, { exclusive: true })

	check('slice boundaries (slice size 4): exactly 4 ids are one slice, 5 are 4 and 1, 8 are two, for move and for a bulk tag add', async () => {
		await withLimits({ bulkIdsCap: 4 }, async () => {
			const ws = newWs()
			const folder = await mkFolder(ws, 'F')
			for (const [count, expected] of [[4, [4]], [5, [4, 1]], [8, [4, 4]]]) {
				const docs = await seed(ws, count, {}, { blobsToo: false })
				const moves = recordCalls('mediaAssets', 'updateMany')
				assert.equal(await A.moveAssets(moves.spy, ws, idsOf(docs), folder._id), count)
				assert.deepEqual(moves.seen.map((args) => args[0]._id.$in.length), expected, `move ${count}`)
				const writes = recordCalls('mediaAssets', 'bulkWrite')
				assert.deepEqual(await A.addTagsToAssets(writes.spy, ws, idsOf(docs), ['fresh']), { changed: count, conflicts: 0 })
				assert.deepEqual(writes.seen.map((args) => args[0].length), expected, `add ${count}`)
			}
		})
	}, { exclusive: true })

	check('a folder deleted right after the move: nothing is left pointing at it, they go to the root', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'Doomed')
		const docs = await seed(ws, 3)
		const spy = spyDb(db, async (ev) => {
			if (ev.phase === 'after' && ev.coll === 'mediaAssets' && ev.method === 'updateMany' && ev.n === 1) await folderCol.deleteOne({ _id: folder._id })
		})
		assert.equal(await A.moveAssets(spy, ws, idsOf(docs), folder._id), 3)
		for (const s of await stored(docs)) assert.equal(s.folderId, null)
	})

	check('a move and a tag edit at the same moment: both land (a move does not take a revision, so it cannot make the edit fail)', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'F')
		const [a] = await seed(ws, 1)
		const moving = gate()
		const editing = gate()
		const spy = spyDb(db, async (ev) => {
			if (!at(ev, 'mediaAssets', 'updateOne', 1)) return
			// The edit has read the image and is about to write: the move happens now.
			editing.open()
			await moving.wait()
		})
		const edit = update(ws, a._id, { addTags: ['edited'] }, spy)
		await editing.wait()
		await A.moveAssets(db, ws, [a._id], folder._id)
		moving.open()
		await edit
		const s = await docOf(a._id)
		assert.ok(s.folderId.equals(folder._id))
		assert.deepEqual(slugsOf(s), ['edited'])
		assert.equal(s.rev, 1)
	})

	check('move is idempotent and safe to retry after a partial run', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'F')
		const docs = await seed(ws, 6)
		// "Partial": the first slice's worth already moved by an earlier, killed run.
		await assetCol.updateMany({ _id: { $in: idsOf(docs.slice(0, 2)) } }, { $set: { folderId: folder._id } })
		assert.equal(await A.moveAssets(db, ws, idsOf(docs), folder._id), 4)
		assert.equal(await countIn(ws, { folderId: folder._id }), 6)
	})
}

async function sectionBulkTags() {
	section('bulk: addTagsToAssets')

	const mixed = (ws) =>
		seed(ws, 6, (i) => ({
			name: `m${i}`,
			tags: i < 2 ? [] : i < 4 ? [vision('kitchen', 0.9, 'Kitchen')] : [manual('kitchen', 'Kitchen')],
			rejectedTags: i === 0 ? ['kitchen', 'x'] : [],
		}))

	check('adds the tag to the images that lack it, promotes it where it was automatic, skips where it was manual: honest counts', async () => {
		const ws = newWs()
		const docs = await mixed(ws)
		const out = await A.addTagsToAssets(db, ws, idsOf(docs), ['Kitchen'])
		assert.deepEqual(out, { changed: 4, conflicts: 0 })
		const now = await storedById(docs)
		docs.forEach((d, i) => {
			const s = now.get(String(d._id))
			assert.deepEqual(s.tags, [manual('kitchen', 'Kitchen')], `doc ${i}`)
			if (i < 4) {
				assert.equal(s.rev, 1)
				assert.deepEqual(s.terms, buildTerms(s), 'terms rebuilt')
				assert.ok(+s.updatedAt > +d.updatedAt)
			} else {
				assert.equal(s.rev, 0, 'already manual: not rewritten')
				assert.equal(+s.updatedAt, +d.updatedAt)
			}
		})
		assert.deepEqual(now.get(String(docs[0]._id)).rejectedTags, ['x'], 'adding un-rejects')
		assert.ok(now.get(String(docs[0]._id)).terms.includes('kitchen'))
	})

	check('addTagsToAssets is idempotent: a second run changes nothing and says so', async () => {
		const ws = newWs()
		const docs = await mixed(ws)
		await A.addTagsToAssets(db, ws, idsOf(docs), ['Kitchen'])
		const before = await stored(docs)
		assert.deepEqual(await A.addTagsToAssets(db, ws, idsOf(docs), ['Kitchen']), { changed: 0, conflicts: 0 })
		same(await stored(docs), before)
	})

	check('several labels at once, the workspace\'s redirects applied, more than 20 labels cut to 20', async () => {
		const ws = newWs()
		await ruleCol.insertOne({ workspaceId: ws, from: 'bee', to: { slug: 'insect', label: 'Insect' }, createdAt: new Date() })
		const docs = await seed(ws, 3)
		assert.deepEqual(await A.addTagsToAssets(db, ws, idsOf(docs), ['Bee', 'Honey', '', '!!!']), { changed: 3, conflicts: 0 })
		for (const s of await stored(docs)) assert.deepEqual(s.tags, [manual('insect', 'Insect'), manual('honey', 'Honey')])
		const many = await seed(ws, 1)
		await A.addTagsToAssets(db, ws, idsOf(many), Array.from({ length: 50 }, (_, i) => `l${i}`))
		assert.equal((await stored(many))[0].tags.length, 20)
	})

	check('a full image (40 tags) is left as it is and not counted', async () => {
		const ws = newWs()
		const full = (await seed(ws, 1, { tags: Array.from({ length: MEDIA_LIMITS.maxTagsPerAsset }, (_, i) => manual(`t${i}`)) }))[0]
		const roomy = (await seed(ws, 1))[0]
		assert.deepEqual(await A.addTagsToAssets(db, ws, [full._id, roomy._id], ['extra']), { changed: 1, conflicts: 0 })
		assert.deepEqual((await docOf(full._id)), full)
	})

	check('images of another workspace are ignored: not changed, not counted', async () => {
		const ws = newWs()
		const mine = await seed(ws, 2)
		const theirs = await seed(newWs(), 2)
		assert.deepEqual(await A.addTagsToAssets(db, ws, idsOf([...mine, ...theirs]), ['x']), { changed: 2, conflicts: 0 })
		same(await stored(theirs), theirs)
	})

	check('addTagsToAssets: hostile input does nothing, and costs no database call when there is nothing to do', async () => {
		const ws = newWs()
		const docs = await seed(ws, 2)
		const spy = spyDb(db)
		const zero = { changed: 0, conflicts: 0 }
		assert.deepEqual(await A.addTagsToAssets(spy, ws, idsOf(docs), 'kitchen'), zero)
		assert.deepEqual(await A.addTagsToAssets(spy, ws, idsOf(docs), []), zero)
		assert.deepEqual(await A.addTagsToAssets(spy, ws, idsOf(docs), ['!!!', '', '   ', 5, null]), zero)
		assert.deepEqual(await A.addTagsToAssets(spy, ws, [], ['x']), zero)
		assert.deepEqual(await A.addTagsToAssets(spy, ws, 'nope', ['x']), zero)
		assert.deepEqual(await A.addTagsToAssets(spy, ws, [{ $ne: null }, 'x', null], ['x']), zero)
		assert.deepEqual(await A.addTagsToAssets(spy, { $ne: null }, idsOf(docs), ['x']), zero)
		assert.equal(spy.counts.size, 0)
		same(await stored(docs), docs)
	})

	check('over 500 images (501): one bulk write per slice of at most 500, every image tagged exactly once', async () => {
		const ws = newWs()
		const docs = await seed(ws, 501, {}, { blobsToo: false })
		const { spy, seen } = recordCalls('mediaAssets', 'bulkWrite')
		assert.deepEqual(await A.addTagsToAssets(spy, ws, idsOf(docs), ['Big Batch']), { changed: 501, conflicts: 0 })
		assert.deepEqual(seen.map((args) => args[0].length), [500, 1])
		assert.equal(await countIn(ws, { 'tags.slug': 'big-batch', rev: 1 }), 501)
		assert.equal(await countIn(ws, { terms: 'batch' }), 501, 'terms rebuilt on every one')
	})

	check('add, accept and remove each write in slices (slice size 4: 11 images are 4, 4 and 3) and handle every image exactly once', async () => {
		await withLimits({ bulkIdsCap: 4 }, async () => {
			const ws = newWs()
			const docs = await seed(ws, 11, { tags: [vision('van', 0.9, 'Van'), manual('keep')] }, { blobsToo: false })
			const slices = async (run) => {
				const { spy, seen } = recordCalls('mediaAssets', 'bulkWrite')
				return { out: await run(spy), sizes: seen.map((args) => args[0].length) }
			}
			const add = await slices((spy) => A.addTagsToAssets(spy, ws, idsOf(docs), ['Big Batch']))
			assert.deepEqual(add, { out: { changed: 11, conflicts: 0 }, sizes: [4, 4, 3] })
			assert.equal(await countIn(ws, { 'tags.slug': 'big-batch', rev: 1 }), 11)

			const accept = await slices((spy) => A.acceptAutoTags(spy, ws, idsOf(docs)))
			assert.deepEqual(accept, { out: { changed: 11, conflicts: 0 }, sizes: [4, 4, 3] })
			assert.equal(await countIn(ws, { 'tags.source': 'auto' }), 0)

			const remove = await slices((spy) => A.removeTagsFromAssets(spy, ws, idsOf(docs), ['keep']))
			assert.deepEqual(remove, { out: { changed: 11, conflicts: 0 }, sizes: [4, 4, 3] })
			assert.equal(await countIn(ws, { 'tags.slug': 'keep' }), 0)
			assert.equal(await countIn(ws, { rev: 3 }), 11, 'one revision per operation per image, no more')
		})
	}, { exclusive: true })

	check('a document that keeps conflicting is reported as a conflict, the rest are changed (honest counts)', async () => {
		const ws = newWs()
		const docs = await seed(ws, 4)
		const victim = docs[2]
		const spy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaAssets' && ev.method === 'bulkWrite' && ev.phase === 'before')
				await assetCol.updateOne({ _id: victim._id }, { $inc: { rev: 1 } })
		})
		const out = await A.addTagsToAssets(spy, ws, idsOf(docs), ['x'])
		assert.deepEqual(out, { changed: 3, conflicts: 1 })
		const now = await storedById(docs)
		for (const d of docs) assert.equal(now.get(String(d._id)).tags.length, d._id.equals(victim._id) ? 0 : 1)
	})

	check('a document that conflicts once is re-run on its fresh state and counted as changed, with the other writer\'s edit kept', async () => {
		const ws = newWs()
		const docs = await seed(ws, 3)
		let bumped = false
		const spy = spyDb(db, async (ev) => {
			if (!bumped && ev.coll === 'mediaAssets' && ev.method === 'bulkWrite' && ev.phase === 'before') {
				bumped = true
				await assetCol.updateOne({ _id: docs[1]._id }, { $set: { notes: 'theirs' }, $inc: { rev: 1 } })
			}
		})
		const out = await A.addTagsToAssets(spy, ws, idsOf(docs), ['x'])
		assert.deepEqual(out, { changed: 3, conflicts: 0 })
		const s = await docOf(docs[1]._id)
		assert.equal(s.notes, 'theirs')
		assert.deepEqual(slugsOf(s), ['x'])
		assert.equal(s.rev, 2)
	})

	section('bulk: removeTagsFromAssets')

	const carriers = (ws) =>
		seed(ws, 8, (i) => ({
			tags: i < 3 ? [manual('kitchen', 'Kitchen'), manual('other')] : i < 5 ? [vision('kitchen', 0.8, 'Kitchen'), fname('wood')] : [manual('other')],
			rejectedTags: ['old'],
			name: `c${i}`,
		}))

	check('only images that carry the tag are touched: counts are removals, the rest are not rewritten nor made to "reject" it', async () => {
		const ws = newWs()
		const docs = await carriers(ws)
		const out = await A.removeTagsFromAssets(db, ws, idsOf(docs), ['kitchen'])
		assert.deepEqual(out, { changed: 5, conflicts: 0 })
		const now = await storedById(docs)
		docs.forEach((d, i) => {
			const s = now.get(String(d._id))
			if (i < 5) {
				assert.ok(!slugsOf(s).includes('kitchen'))
				assert.deepEqual(s.rejectedTags, ['old', 'kitchen'], 'the removal is remembered, an automatic one too')
				assert.equal(s.rev, 1)
				assert.ok(!s.terms.includes('kitchen'))
				assert.deepEqual(s.terms, buildTerms(s))
			} else {
				assert.deepEqual(s, d, 'an image without the tag is exactly as it was')
			}
		})
		assert.deepEqual(slugsOf(now.get(String(docs[3]._id))), ['wood'], 'its other tags stay')
	})

	check('removeTagsFromAssets: idempotent, several slugs, a label works as a slug, unknown slugs do nothing', async () => {
		const ws = newWs()
		const docs = await carriers(ws)
		assert.deepEqual(await A.removeTagsFromAssets(db, ws, idsOf(docs), ['Kitchen', 'WOOD', 'nothing-like-this']), { changed: 5, conflicts: 0 })
		for (const s of await stored(docs.slice(0, 5))) assert.ok(!slugsOf(s).includes('wood') && !slugsOf(s).includes('kitchen'))
		const before = await stored(docs)
		assert.deepEqual(await A.removeTagsFromAssets(db, ws, idsOf(docs), ['kitchen', 'wood']), { changed: 0, conflicts: 0 })
		same(await stored(docs), before)
		assert.deepEqual(await A.removeTagsFromAssets(db, ws, idsOf(docs), ['unknown']), { changed: 0, conflicts: 0 })
	})

	check('removeTagsFromAssets: other workspaces ignored; hostile input does nothing and costs no query', async () => {
		const ws = newWs()
		const mine = await seed(ws, 2, { tags: [manual('kitchen')] })
		const theirs = await seed(newWs(), 2, { tags: [manual('kitchen')] })
		assert.deepEqual(await A.removeTagsFromAssets(db, ws, idsOf([...mine, ...theirs]), ['kitchen']), { changed: 2, conflicts: 0 })
		same(await stored(theirs), theirs)
		const spy = spyDb(db)
		const zero = { changed: 0, conflicts: 0 }
		for (const slugs of ['kitchen', [], ['!!!'], [5, null, {}], undefined])
			assert.deepEqual(await A.removeTagsFromAssets(spy, ws, idsOf(mine), slugs), zero)
		assert.deepEqual(await A.removeTagsFromAssets(spy, ws, [], ['x']), zero)
		assert.deepEqual(await A.removeTagsFromAssets(spy, { $ne: null }, idsOf(mine), ['x']), zero)
		assert.equal(spy.counts.size, 0)
	})

	section('bulk: acceptAutoTags')

	check('every automatic tag becomes a manual one (labels kept, no vision or file name leftovers); counts are the images that had any', async () => {
		const ws = newWs()
		const docs = await seed(ws, 6, (i) => ({
			tags: i < 2 ? [manual('mine'), vision('van', 0.9, 'Van'), fname('kitchen')] : i < 4 ? [vision('truck', 0.7, 'Truck')] : [manual('only')],
			rejectedTags: ['gone'],
		}))
		const out = await A.acceptAutoTags(db, ws, idsOf(docs))
		assert.deepEqual(out, { changed: 4, conflicts: 0 })
		const now = await storedById(docs)
		same(now.get(String(docs[0]._id)).tags, [manual('mine'), manual('van', 'Van'), manual('kitchen', 'Kitchen')])
		same(now.get(String(docs[2]._id)).tags, [manual('truck', 'Truck')])
		for (const [i, d] of docs.entries()) {
			const s = now.get(String(d._id))
			assert.ok(s.tags.every((t) => t.source === 'manual' && t.via === undefined && t.confidence === undefined))
			assert.deepEqual(s.rejectedTags, ['gone'])
			if (i < 4) {
				assert.equal(s.rev, 1)
				assert.deepEqual(s.terms, buildTerms(s))
			} else assert.deepEqual(s, d, 'an image with no automatic tag is not rewritten')
		}
	})

	check('acceptAutoTags is idempotent and ignores other workspaces', async () => {
		const ws = newWs()
		const docs = await seed(ws, 4, { tags: [vision('van', 0.9, 'Van')] }, { blobsToo: false })
		const theirs = await seed(newWs(), 2, { tags: [vision('van', 0.9, 'Van')] })
		assert.deepEqual(await A.acceptAutoTags(db, ws, [...idsOf(docs), ...idsOf(theirs)]), { changed: 4, conflicts: 0 })
		assert.deepEqual(await A.acceptAutoTags(db, ws, idsOf(docs)), { changed: 0, conflicts: 0 })
		same(await stored(theirs), theirs)
		assert.equal(await countIn(ws, { 'tags.source': 'auto' }), 0)
	})

	check('acceptAutoTags: hostile input does nothing', async () => {
		const ws = newWs()
		const docs = await seed(ws, 1, { tags: [vision('van')] })
		const spy = spyDb(db)
		const zero = { changed: 0, conflicts: 0 }
		assert.deepEqual(await A.acceptAutoTags(spy, { $ne: null }, idsOf(docs)), zero)
		assert.deepEqual(await A.acceptAutoTags(spy, ws, 'nope'), zero)
		assert.deepEqual(await A.acceptAutoTags(spy, ws, [{ $ne: null }, 'x']), zero)
		assert.equal(spy.counts.size, 0)
		same(await stored(docs), docs)
	})

	check('ids that only look like ObjectIds (they carry toHexString and the bson shape) are ignored everywhere: a type check, not duck typing', async () => {
		const ws = newWs()
		const folder = await mkFolder(ws, 'F')
		const docs = await seed(ws, 2, { tags: [vision('van', 0.9, 'Van')] })
		const fake = (id) => ({ _bsontype: 'ObjectId', id: id.id, toHexString: () => hex(id), toString: () => hex(id), equals: () => true })
		const ids = docs.map((d) => fake(d._id))
		const zero = { changed: 0, conflicts: 0 }
		assert.equal(await A.moveAssets(db, ws, ids, folder._id), 0)
		assert.deepEqual(await A.addTagsToAssets(db, ws, ids, ['x']), zero)
		assert.deepEqual(await A.removeTagsFromAssets(db, ws, ids, ['van']), zero)
		assert.deepEqual(await A.acceptAutoTags(db, ws, ids), zero)
		assert.equal(await A.deleteAssets(db, ws, ids), 0)
		same(await stored(docs), docs)
		// As the target folder, the workspace and the asset id of a single edit.
		await rejects(A.moveAssets(db, ws, idsOf(docs), fake(folder._id)), 400)
		assert.equal(await A.moveAssets(db, fake(ws), idsOf(docs), folder._id), 0)
		assert.equal(await A.getAsset(db, ws, fake(docs[0]._id)), null)
		await rejects(update(ws, fake(docs[0]._id), { name: 'x' }), 404)
		await rejects(update(fake(ws), docs[0]._id, { name: 'x' }), 404)
		same(await stored(docs), docs)
		assertNoDeletes()
	})
}

/* -------------------------------------------------------------------------- */
/* deleteAssets                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Runs deleteAssets and "kills" it at one point: the call there never continues, as if the process had
 * died. Returns what a restart would find.
 */
async function killedRun(total, kill) {
	const ws = newWs()
	const docs = await seed(ws, total, {}, { blobsToo: true })
	// The call at the kill point never continues: that is what a dead process looks like from outside.
	const reached = gate()
	const die = async () => {
		reached.open()
		await NEVER()
	}
	const spy = spyDb(db, async (ev) => {
		if (!kill.db || ev.coll !== 'mediaAssets' || `${ev.method}#${ev.n}` !== kill.db.key || ev.phase !== 'before') return
		if (kill.db.phase === 'half') {
			// dies in the middle of removing a slice's documents: the first half is gone, the rest is not
			const ids = ev.args[0]._id.$in
			await assetCol.deleteMany({ _id: { $in: ids.slice(0, Math.ceil(ids.length / 2)) } })
		}
		await die()
	})
	if (kill.blob) hooks.del = async (_info, n) => { if (n === kill.blob) await die() }
	const run = A.deleteAssets(spy, ws, idsOf(docs))
	// Wait for the run to reach its death (or to finish without ever reaching it), never a fixed time: the database is not that quick.
	const outcome = await Promise.race([run.then(() => 'finished', () => 'threw'), reached.wait().then(() => 'hung')])
	await sleep(250) // calls that were already in flight when it died settle
	const remaining = await assetCol.find({ workspaceId: ws }).toArray()
	const alive = new Set(remaining.map((d) => String(d._id)))
	const position = new Map(docs.map((d, i) => [String(d._id), i]))
	return {
		outcome,
		ws,
		docs,
		remaining,
		dangling: remaining.filter((d) => !blobs.has(norm(d.url))),
		orphans: docs.filter((d) => !alive.has(String(d._id)) && blobs.has(norm(d.url))),
		slicesOf: (list) => new Set(list.map((d) => Math.floor(position.get(String(d._id)) / MEDIA_LIMITS.bulkIdsCap))),
	}
}

async function sectionDelete() {
	section('deleteAssets')

	check('removes the documents, then deletes each blob through the guarded deleteBlob with exactly the stored {url, pathname}', async () => {
		const ws = newWs()
		const docs = await seed(ws, 5)
		assert.equal(await A.deleteAssets(db, ws, idsOf(docs)), 5)
		assert.equal(await countIn(ws), 0)
		assertDeleted(ws, docs)
	})

	check('documents first, slice by slice, at the production slice size: 501 images are a slice of 500 and a slice of 1', async () => {
		const ws = newWs()
		const docs = await seed(ws, MEDIA_LIMITS.bulkIdsCap + 1)
		const events = []
		const left = new Map()
		const spy = spyDb(db, async (ev) => {
			if (ev.coll === 'mediaAssets' && ev.method === 'deleteMany' && ev.phase === 'before') events.push(`deleteMany#${ev.n}`)
		})
		hooks.del = async (_info, n) => {
			events.push('blob')
			// the documents already deleted at the moment the n-th blob is being deleted
			if ([1, 500, 501].includes(n)) left.set(n, await countIn(ws))
		}
		assert.equal(await A.deleteAssets(spy, ws, idsOf(docs)), 501)
		// every blob of a slice goes before the next slice's documents are touched
		const runs = []
		for (const e of events) {
			const last = runs[runs.length - 1]
			if (e === 'blob' && last?.kind === 'blob') last.count++
			else runs.push(e === 'blob' ? { kind: 'blob', count: 1 } : { kind: e })
		}
		assert.deepEqual(
			runs.map((r) => (r.kind === 'blob' ? `blob*${r.count}` : r.kind)),
			['deleteMany#1', 'blob*500', 'deleteMany#2', 'blob*1'],
		)
		// slice 1 (500) is gone before its first blob; the last document is gone before its blob
		assert.deepEqual([...left].sort((a, b) => a[0] - b[0]), [[1, 1], [500, 1], [501, 0]])
		assert.equal(calls.del.length, 501)
	})

	check('returns how many were actually removed: unknown ids, repeats and ids of another workspace are not counted and not touched', async () => {
		const ws = newWs()
		const other = newWs()
		const mine = await seed(ws, 3)
		const theirs = await seed(other, 2)
		const out = await A.deleteAssets(db, ws, [mine[0]._id, mine[0]._id, new ObjectId(), ...idsOf(theirs), mine[1]._id])
		assert.equal(out, 2)
		assert.equal(await countIn(ws), 1)
		same(await stored(theirs), theirs)
		assertKept(theirs)
		assertDeleted(ws, [mine[0], mine[1]])
	})

	check('hostile input: non-ObjectId ids, operator objects, a non-array, a non-ObjectId workspace remove nothing and cost no database call', async () => {
		const ws = newWs()
		const [a] = await seed(ws, 1)
		const spy = spyDb(db)
		assert.equal(await A.deleteAssets(spy, ws, [hex(a._id), { $ne: null }, { _id: a._id }, null, undefined, 5, [a._id]]), 0)
		assert.equal(await A.deleteAssets(spy, ws, 'nope'), 0)
		assert.equal(await A.deleteAssets(spy, ws, []), 0)
		assert.equal(await A.deleteAssets(spy, { $ne: null }, [a._id]), 0)
		assert.equal(await A.deleteAssets(spy, hex(ws), [a._id]), 0)
		assert.equal(spy.counts.size, 0)
		assert.equal(await countIn(ws), 1)
		assertNoDeletes()
	})

	check('a blob delete failure leaves no document pointing at it: the documents are gone, the failed blobs are orphans, the rest are deleted', async () => {
		const ws = newWs()
		const docs = await seed(ws, 5)
		faults.del.add(norm(docs[1].url))
		faults.del.add(norm(docs[3].url))
		assert.equal(await A.deleteAssets(db, ws, idsOf(docs)), 5, 'the images are removed')
		assert.equal(await countIn(ws), 0)
		assert.ok(blobs.has(norm(docs[1].url)) && blobs.has(norm(docs[3].url)), 'orphans, which costs storage and nothing else')
		for (const i of [0, 2, 4]) assert.ok(!blobs.has(norm(docs[i].url)))
		const warned = logs.warn.filter((l) => /could not delete blob/.test(l))
		assert.equal(warned.length, 2)
		assert.ok(!logs.warn.some((l) => /secret-store-detail/.test(l)), 'the store\'s own message is never logged')
	})

	check('a delete that fails for every blob still removes every document and does not throw', async () => {
		const ws = newWs()
		const docs = await seed(ws, 4)
		for (const d of docs) faults.del.add(norm(d.url))
		assert.equal(await A.deleteAssets(db, ws, idsOf(docs)), 4)
		assert.equal(await countIn(ws), 0)
	})

	check('stored documents that name something outside the workspace (corrupt rows) are removed, but the real guard stops the blob delete', async () => {
		const ws = newWs()
		const other = newWs()
		const foreignPath = `workspaces/${hex(other)}/media/theirs.png`
		const foreign = assetDoc(ws, { pathname: foreignPath, url: blobUrl(foreignPath) })
		const sitePath = 'sites/site-1/hero.png'
		const site = assetDoc(ws, { pathname: sitePath, url: blobUrl(sitePath) })
		const mismatch = assetDoc(ws, { url: blobUrl(`workspaces/${hex(other)}/media/other.png`) })
		const good = assetDoc(ws, {})
		await assetCol.insertMany([foreign, site, mismatch, good])
		for (const d of [foreign, site, mismatch, good]) blobs.set(norm(d.url), { url: norm(d.url), pathname: d.pathname, size: 1, contentType: 'image/png', bytes: Buffer.from('x') })
		blobs.set(norm(blobUrl(mismatch.pathname)), { url: norm(blobUrl(mismatch.pathname)), pathname: mismatch.pathname, size: 1, contentType: 'image/png', bytes: Buffer.from('x') })
		assert.equal(await A.deleteAssets(db, ws, idsOf([foreign, site, mismatch, good])), 4)
		assert.equal(await countIn(ws), 0)
		assert.deepEqual(sdkCalls.del, [norm(good.url)], 'only the legitimate blob reached del()')
		assert.ok(blobs.has(norm(foreign.url)) && blobs.has(norm(site.url)) && blobs.has(norm(mismatch.url)), 'what is not ours is still there')
		assert.ok(logs.warn.filter((l) => /refused to delete/.test(l)).length >= 3)
	})

	check('a document with no url or pathname at all is removed without trouble and without a delete call', async () => {
		const ws = newWs()
		const _id = new ObjectId()
		await assetCol.insertOne({ _id, workspaceId: ws, name: 'corrupt' })
		const [good] = await seed(ws, 1)
		assert.equal(await A.deleteAssets(db, ws, [_id, good._id]), 2)
		assert.equal(await countIn(ws), 0)
		assertDeleted(ws, [good])
	})

	check('a late twin registers the same blob again after the document is gone: the blob is KEPT (an asset points at it)', async () => {
		const ws = newWs()
		const docs = await seed(ws, 3)
		const twin = assetDoc(ws, { pathname: docs[1].pathname, url: docs[1].url, name: 'Late twin' })
		let removed = false
		let inserted = false
		const spy = spyDb(db, async (ev) => {
			if (ev.phase === 'after' && ev.coll === 'mediaAssets' && ev.method === 'deleteMany') removed = true
			// the guard's lookup: a pathname-based query once the documents are gone
			if (removed && !inserted && ev.phase === 'before' && ev.coll === 'mediaAssets' && ev.args[0]?.pathname !== undefined) {
				inserted = true
				await assetCol.insertOne(twin)
			}
		})
		assert.equal(await A.deleteAssets(spy, ws, idsOf(docs)), 3)
		assert.ok(inserted, 'the guard looked')
		assertDeleted(ws, [docs[0], docs[2]])
		assertKept([docs[1]])
		assert.equal(await countIn(ws), 1)
	})

	check('two deleters at once: each counts only what it removed, every blob is deleted, nothing throws', async () => {
		const ws = newWs()
		const docs = await seed(ws, 8)
		const [x, y] = await Promise.all([A.deleteAssets(db, ws, idsOf(docs)), A.deleteAssets(db, ws, idsOf(docs))])
		assert.equal(x + y, 8, 'each image is removed exactly once between them')
		assert.equal(await countIn(ws), 0)
		for (const d of docs) assert.ok(!blobs.has(norm(d.url)))
	})

	check('a document removed by someone else between the read and the delete is not counted, and its blob is still cleaned up', async () => {
		const ws = newWs()
		const docs = await seed(ws, 4)
		const spy = spyDb(db, async (ev) => {
			if (at(ev, 'mediaAssets', 'deleteMany', 1)) await assetCol.deleteMany({ _id: { $in: idsOf(docs.slice(0, 2)) } })
		})
		assert.equal(await A.deleteAssets(spy, ws, idsOf(docs)), 2)
		for (const d of docs) assert.ok(!blobs.has(norm(d.url)))
	})

	check('retrying after a failure part-way is safe: the second call removes what is left and counts only that', async () => {
		await withLimits({ bulkIdsCap: 4 }, async () => {
			const ws = newWs()
			const docs = await seed(ws, 9) // slices of 4, 4 and 1
			const spy = spyDb(db, async (ev) => {
				if (at(ev, 'mediaAssets', 'deleteMany', 2)) throw new Error('database went away')
			})
			await assert.rejects(A.deleteAssets(spy, ws, idsOf(docs)), /database went away/)
			assert.equal(await countIn(ws), 5, 'slice 1 is gone, nothing of slice 2 was touched')
			assert.equal(calls.del.length, 4, 'only slice 1\'s blobs were deleted')
			assert.equal(await A.deleteAssets(db, ws, idsOf(docs)), 5)
			assert.equal(await countIn(ws), 0)
			for (const d of docs) assert.ok(!blobs.has(norm(d.url)))
		})
	}, { exclusive: true })

	section('deleteAssets: a killed request orphans at most one slice of blobs and never leaves a document pointing at a deleted file')

	// The slice size is lowered to 4 so that every database call and several blob deletes of three slices can be a kill
	// point; the production size has its own check above. Checks only queue, so everything queued so far is finished
	// first and these run (together, each in a context of its own) while the lower size is in force.
	await drain()
	await withLimits({ bulkIdsCap: 4 }, async () => {
		const TOTAL = 11 // slices of 4, 4 and 3
		let order = null
		await check('(baseline) an uninterrupted run of three slices makes a known, small number of database calls', async () => {
			const ws = newWs()
			const docs = await seed(ws, TOTAL)
			const keys = []
			const spy = spyDb(db, async (ev) => {
				if (ev.coll === 'mediaAssets' && ev.phase === 'before') keys.push(`${ev.method}#${ev.n}`)
			})
			assert.equal(await A.deleteAssets(spy, ws, idsOf(docs)), TOTAL)
			order = keys
			assert.ok(keys.length >= 6 && keys.length <= 15, `database calls: ${keys.join(',')}`)
			assert.ok(keys.includes('deleteMany#3'))
		})

		// What a finished call leaves behind is the same as what the next call finds, so "before" every call covers every
		// persistent state; a delete that dies half way through its documents is the one extra case.
		const killPoints = []
		for (const key of order ?? []) {
			killPoints.push({ db: { key, phase: 'before' } })
			if (key.startsWith('deleteMany')) killPoints.push({ db: { key, phase: 'half' } })
		}
		for (const blob of [1, 4, 5, 9, 11]) killPoints.push({ blob })
		for (const kill of killPoints)
			check(`kill ${kill.db ? `${kill.db.phase === 'half' ? 'half way through' : 'before'} ${kill.db.key}` : `during blob delete #${kill.blob}`}: no document points at a deleted blob, at most one slice of blobs is orphaned, a restart finishes`, async () => {
				const r = await killedRun(TOTAL, kill)
				assert.ok(['hung', 'finished', 'threw'].includes(r.outcome))
				assert.equal(r.dangling.length, 0, 'a document still points at a blob that was deleted')
				assert.ok(r.orphans.length <= MEDIA_LIMITS.bulkIdsCap, `orphans: ${r.orphans.length}`)
				assert.ok(r.slicesOf(r.orphans).size <= 1, 'the orphans are all from one slice')
				// documents leave in whole slices, oldest slice first
				const gone = r.docs.length - r.remaining.length
				if (kill.db?.phase === 'half') assert.ok(gone > 0 && gone < 11 && ![4, 8].includes(gone), `documents removed: ${gone}`)
				else assert.ok([0, 4, 8, 11].includes(gone), `documents removed: ${gone}`)
				// a restart (the same call again) finishes the job and counts what was left
				hooks.del = null
				const rest = await A.deleteAssets(db, r.ws, idsOf(r.docs))
				assert.equal(rest, r.remaining.length, `restart removed ${rest}, ${r.remaining.length} were left after the kill (${r.outcome}); orphans ${r.orphans.length}; dangling ${r.dangling.length}`)
				assert.equal(await countIn(r.ws), 0)
			})
		// The lower size must stay in force until the last of them is done.
		await drain()
	})

	section('vocabulary and reads')

	check('getAsset: found by { _id, workspaceId }; another workspace, unknown and malformed ids are null', async () => {
		const ws = newWs()
		const a = await one(ws)
		const theirs = await one(newWs())
		assert.deepEqual(await A.getAsset(db, ws, a._id), a)
		assert.equal(await A.getAsset(db, ws, theirs._id), null)
		assert.equal(await A.getAsset(db, ws, new ObjectId()), null)
		for (const id of [hex(a._id), null, undefined, { $ne: null }, 5]) assert.equal(await A.getAsset(db, ws, id), null)
		for (const w of [{ $ne: null }, hex(ws), null, undefined]) assert.equal(await A.getAsset(db, w, a._id), null)
	})

	const vocab = (ws) => V.loadVocabulary(db, ws)
	check('registering drops the cached vocabulary: a word of the new image is known at once', async () => {
		const ws = newWs()
		await seed(ws, 1, { name: 'alpha' })
		assert.ok(!(await vocab(ws)).has('zebra'))
		await register(ws, put(ws, await unique(500), { name: 'zebra-stripes.png' }))
		assert.ok((await vocab(ws)).has('zebra'))
	})

	check('updating, bulk-tagging, bulk-untagging and deleting each drop the cached vocabulary', async () => {
		const ws = newWs()
		const docs = await seed(ws, 2, { name: 'plain', tags: [manual('mango')] })
		assert.ok(!(await vocab(ws)).has('quokka'))
		await update(ws, docs[0]._id, { name: 'quokka' })
		assert.ok((await vocab(ws)).has('quokka'))
		await A.addTagsToAssets(db, ws, idsOf(docs), ['narwhal'])
		assert.ok((await vocab(ws)).has('narwhal'))
		await A.removeTagsFromAssets(db, ws, idsOf(docs), ['mango'])
		assert.ok(!(await vocab(ws)).has('mango'))
		await A.deleteAssets(db, ws, [docs[0]._id])
		assert.ok(!(await vocab(ws)).has('quokka'))
		assert.equal((await vocab(ws)).get('narwhal'), 1)
	})
}

/* -------------------------------------------------------------------------- */
/* A database that fails: at every call, three ways                           */
/* -------------------------------------------------------------------------- */

const equalTo = (a, b) => {
	try {
		assert.deepEqual(a, b)
		return true
	} catch {
		return false
	}
}
/** What a call answered, as a value two answers can be compared by. */
const answerOf = (promise) => promise.then((r) => ({ status: r.status }), (e) => ({ error: e.status }))

async function sectionFaults() {
	section('a database that fails at any call (never run, killed, or its answer lost): no blob is lost, nothing is half done, and again converges')

	// What each registration does on a clean database, and what it leaves behind.
	const scenarios = [
		{
			label: 'a new image',
			build: async (ws) => ({ ref: put(ws, await unique(700)), extra: {} }),
			expect: { answer: { status: 'created' }, assets: 1, deleted: false },
		},
		{
			label: 'a new image into a folder (the folder is looked at again after the insert)',
			build: async (ws) => ({ ref: put(ws, await unique(701)), extra: { folderId: (await mkFolder(ws, 'Clients'))._id } }),
			expect: { answer: { status: 'created' }, assets: 1, deleted: false },
		},
		{
			label: 'the same bytes as an image already stored (a duplicate: the new blob goes)',
			build: async (ws) => {
				const bytes = await unique(702)
				await register(ws, put(ws, bytes, { name: 'first.png' }))
				return { ref: put(ws, bytes, { name: 'second.png' }), extra: {} }
			},
			expect: { answer: { status: 'duplicate' }, assets: 1, deleted: true },
			// Its last call is the cleanup's lookup, which is best effort: when that fails the answer still stands and the blob stays.
			absorbsLastCall: true,
		},
		{
			label: 'an oversize blob (refused: the blob goes)',
			build: async (ws) => ({ ref: put(ws, await unique(703), { size: MEDIA_LIMITS.maxBytes + 1 }), extra: {} }),
			expect: { answer: { error: 413 }, assets: 0, deleted: true },
		},
		{
			label: 'a folder that does not exist (refused after the analysis: the blob goes)',
			build: async (ws) => ({ ref: put(ws, await unique(704)), extra: { folderId: new ObjectId() } }),
			expect: { answer: { error: 400 }, assets: 0, deleted: true },
		},
	]

	for (const scenario of scenarios)
		check(`registering ${scenario.label}: a failure at any database call loses no blob, and a second attempt gives the clean answer`, async () => {
			const total = await inContext(async () => {
				const ws = newWs()
				const { ref, extra } = await scenario.build(ws)
				const probe = faultyDb(db, { k: Infinity })
				assert.deepEqual(await answerOf(register(ws, ref, extra, probe.db)), scenario.expect.answer, 'the clean answer')
				return probe.calls()
			})
			assert.ok(total >= 1 && total <= 16, `database calls on a clean run: ${total}`)

			const jobs = []
			for (let k = 1; k <= total; k++) for (const fault of FAULTS) jobs.push({ k, ...fault })
			await Promise.all(
				jobs.map((job) =>
					inContext(async () => {
						const label = `call ${job.k} of ${total}, ${faultName(job)}`
						const ws = newWs()
						const { ref, extra } = await scenario.build(ws)
						await faulted(db, job, (d) => register(ws, ref, extra, d), { absorbed: scenario.absorbsLastCall && job.k === total })
						// A failure is never a reason to delete: not knowing is not a licence.
						assert.deepEqual(calls.del, [], `${label}: a blob was deleted`)
						assert.deepEqual(sdkCalls.del, [], `${label}: del() was called`)
						assertKept([ref])
						assert.ok((await countIn(ws)) <= scenario.expect.assets, `${label}: more assets than the clean run makes`)
						// Again, on a healthy database: the same answer, and the same end state.
						assert.deepEqual(await answerOf(register(ws, ref, extra)), scenario.expect.answer, `${label}: the second attempt`)
						assert.equal(await countIn(ws), scenario.expect.assets, `${label}: assets after the second attempt`)
						assert.equal(blobs.has(norm(ref.url)), !scenario.expect.deleted, `${label}: the blob after the second attempt`)
						if (!scenario.expect.deleted) assert.equal((await assetCol.findOne({ workspaceId: ws, pathname: ref.pathname })).rev, 0, `${label}: one document, never rewritten`)
					}),
				),
			)
		})

	check('updateAsset: a failure at any database call leaves the image untouched or fully edited, never half, and a second attempt applies the whole edit once', async () => {
		const build = async () => {
			const ws = newWs()
			const folder = await mkFolder(ws, 'Target')
			const a = await one(ws, { name: 'Before', tags: [manual('keep'), manual('gone')] })
			const patch = { name: 'After', caption: 'Cap', altText: 'Alt', notes: 'Note', folderId: hex(folder._id), addTags: ['New Tag'], removeTags: ['gone'] }
			return { ws, folder, a, patch }
		}
		const whole = (s, folder) =>
			s.rev === 1 &&
			s.name === 'After' &&
			s.caption === 'Cap' &&
			s.altText === 'Alt' &&
			s.notes === 'Note' &&
			s.captionEdited === true &&
			s.folderId?.equals(folder._id) &&
			equalTo(slugsOf(s), ['keep', 'new-tag']) &&
			equalTo(s.rejectedTags, ['gone'])
		const total = await inContext(async () => {
			const { ws, a, patch } = await build()
			const probe = faultyDb(db, { k: Infinity })
			await update(ws, a._id, patch, probe.db)
			return probe.calls()
		})
		assert.ok(total >= 3 && total <= 10, `database calls on a clean run: ${total}`)
		const jobs = []
		for (let k = 1; k <= total; k++) for (const fault of FAULTS) jobs.push({ k, ...fault })
		await Promise.all(
			jobs.map((job) =>
				inContext(async () => {
					const label = `call ${job.k} of ${total}, ${faultName(job)}`
					const { ws, folder, a, patch } = await build()
					await faulted(db, job, (d) => update(ws, a._id, patch, d))
					const half = await docOf(a._id)
					assert.ok(equalTo(half, a) || whole(half, folder), `${label}: half an edit: ${JSON.stringify({ rev: half.rev, name: half.name, folderId: half.folderId, tags: slugsOf(half) })}`)
					const again = await update(ws, a._id, patch)
					const final = await docOf(a._id)
					assert.ok(whole(final, folder), `${label}: the second attempt did not leave the whole edit once (rev ${final.rev})`)
					assert.deepEqual(again, final, `${label}: the answer is the stored document`)
				}),
			),
		)
	})

	check('bulk writes: a failure at any database call leaves each image done or untouched, and a second attempt finishes every one exactly once', async () => {
		// Slices of 4, so an 11-image run is three slices and every boundary between them is a place to fail.
		await withLimits({ bulkIdsCap: 4 }, async () => {
			const cases = [
				{ label: 'addTagsToAssets', over: { tags: [manual('keep')] }, run: (d, ws, ids) => A.addTagsToAssets(d, ws, ids, ['Fresh']), done: (s) => slugsOf(s).includes('fresh'), revs: 1 },
				{ label: 'removeTagsFromAssets', over: { tags: [manual('keep'), manual('drop')] }, run: (d, ws, ids) => A.removeTagsFromAssets(d, ws, ids, ['drop']), done: (s) => !slugsOf(s).includes('drop') && s.rejectedTags.includes('drop'), revs: 1 },
				{ label: 'acceptAutoTags', over: { tags: [vision('van', 0.9, 'Van')] }, run: (d, ws, ids) => A.acceptAutoTags(d, ws, ids), done: (s) => s.tags.length > 0 && s.tags.every((t) => t.source === 'manual'), revs: 1 },
				{ label: 'moveAssets', over: {}, run: (d, ws, ids, ctx) => A.moveAssets(d, ws, ids, ctx.folder._id), done: (s, ctx) => !!s.folderId && s.folderId.equals(ctx.folder._id), revs: 0 },
			]
			const outcomes = await Promise.all(
				cases.map(async (c) => {
					const build = async () => {
						const ws = newWs()
						const folder = await mkFolder(ws, 'F')
						const docs = await seed(ws, 11, c.over, { blobsToo: false })
						return { ws, folder, docs, ids: idsOf(docs) }
					}
					const total = await inContext(async () => {
						const ctx = await build()
						const probe = faultyDb(db, { k: Infinity })
						await c.run(probe.db, ctx.ws, ctx.ids, ctx)
						return probe.calls()
					})
					assert.ok(total >= 4 && total <= 12, `${c.label}: database calls on a clean run: ${total}`)
					const jobs = []
					for (let k = 1; k <= total; k++) for (const fault of FAULTS) jobs.push({ k, ...fault })
					await Promise.all(
						jobs.map((job) =>
							inContext(async () => {
								const label = `${c.label}: call ${job.k} of ${total}, ${faultName(job)}`
								const ctx = await build()
								await faulted(db, job, (d) => c.run(d, ctx.ws, ctx.ids, ctx))
								const mid = await stored(ctx.docs)
								let doneBefore = 0
								for (const s of mid) {
									const seedDoc = ctx.docs.find((d) => d._id.equals(s._id))
									if (c.done(s, ctx)) {
										doneBefore++
										assert.equal(s.rev, c.revs, `${label}: a finished image carries exactly one revision`)
									} else assert.deepEqual(s, seedDoc, `${label}: an image that is not done is exactly as it was`)
								}
								const result = await c.run(db, ctx.ws, ctx.ids, ctx)
								const changed = typeof result === 'number' ? result : result.changed
								assert.equal(changed, 11 - doneBefore, `${label}: the second attempt changes what was left, no more (${doneBefore} were done)`)
								for (const s of await stored(ctx.docs)) {
									assert.ok(c.done(s, ctx), `${label}: an image is still not done`)
									assert.equal(s.rev, c.revs, `${label}: written once, not twice`)
								}
							}),
						),
					)
					return total
				}),
			)
			assert.equal(outcomes.length, cases.length)
		})
	}, { exclusive: true })
}

/* -------------------------------------------------------------------------- */
/* The invariants, read off the source                                        */
/* -------------------------------------------------------------------------- */

/** Text of every call `.name(...)` / `name(...)` in `code`: from after the paren to its match. */
function callsOf(code, name) {
	const out = []
	// A method name is bounded by its dot; a bare function name must not be the tail of another identifier.
	const re = name.startsWith('.')
		? new RegExp(`\\.${name.slice(1)}\\s*\\(`, 'g')
		: new RegExp(`(?<![\\w$.])${name}\\s*\\(`, 'g')
	let m
	while ((m = re.exec(code))) {
		let depth = 1
		let i = re.lastIndex
		for (; i < code.length && depth > 0; i++) {
			if (code[i] === '(') depth++
			else if (code[i] === ')') depth--
		}
		out.push(code.slice(re.lastIndex, i - 1))
	}
	return out
}

async function sectionSource() {
	section('the two invariants and the scope rule, read off the source')

	const path = require('node:path')
	const raw = readFileSync(path.resolve(ROOT, ASSETS_FILE), 'utf8')
	const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')

	check('the only blob SDK in sight is storage.ts: no @vercel/blob import, no del(), no list(), no fetch', async () => {
		assert.ok(!/@vercel\/blob/.test(code))
		for (const fn of ['del', 'list', 'fetch', 'head']) assert.equal(callsOf(code, fn).length, 0, `${fn}(`)
	})

	check('one place removes a blob: deleteBlob is called exactly once, inside the function named discard', async () => {
		const [call] = callsOf(code, 'deleteBlob')
		assert.equal(callsOf(code, 'deleteBlob').length, 1)
		const start = code.indexOf('async function discard(')
		const end = code.indexOf('\n}\n', start)
		assert.ok(start > 0 && end > start)
		assert.ok(code.slice(start, end).includes('deleteBlob('), 'the one call is inside discard')
		// ...and what it is given comes from a ref (a head result or a stored document), never the caller's input
		assert.match(call, /\{\s*url:\s*ref\.url,\s*pathname:\s*ref\.pathname\s*\}\s*,\s*prefix/)
		assert.equal(callsOf(code, 'headBlob').length, 1)
		assert.equal(callsOf(code, 'readBlob').length, 1)
		assert.ok(!/input\??\.url/.test(code.slice(code.indexOf('const info = await proveClaim')).replace(/proveClaim\([^)]*\)/, '')), 'the request url is read once, by the claim proof')
	})

	check('no bare write to a derived or user-edited field: no updateOne, findOneAndUpdate, replaceOne, bulkWrite, update; updateMany only sets folderId and updatedAt', async () => {
		for (const fn of ['.updateOne', '.findOneAndUpdate', '.replaceOne', '.findOneAndReplace', '.bulkWrite', '.update', '.deleteOne', '.findOneAndDelete'])
			assert.equal(callsOf(code, fn).length, 0, `${fn}(`)
		const many = callsOf(code, '.updateMany')
		assert.ok(many.length >= 2)
		for (const call of many) {
			const set = /\$set:\s*\{([^}]*)\}/.exec(call)
			assert.ok(set, 'an updateMany with a $set')
			const keys = set[1].split(',').map((k) => k.trim().split(':')[0].trim()).filter(Boolean)
			assert.ok(keys.every((k) => ['folderId', 'updatedAt'].includes(k)), `$set keys: ${keys}`)
			assert.ok(!/\$unset|\$push|\$pull|\$addToSet|\$inc|\$rename/.test(call))
		}
	})

	check('every query and write names the workspace (find, findOne, aggregate, updateMany, deleteMany)', async () => {
		let seen = 0
		for (const fn of ['.find', '.findOne', '.aggregate', '.updateMany', '.deleteMany', '.countDocuments']) {
			for (const call of callsOf(code, fn)) {
				seen++
				assert.ok(/workspaceId|workspaceAssets\(/.test(call), `${fn}( ${call.slice(0, 80)} ...`)
			}
		}
		assert.ok(seen >= 10)
	})

	check('no server-side JavaScript, no regex built from input, no eval', async () => {
		assert.ok(!/\$where|\$function|\$accumulator|\beval\(|new Function\(|\$regex|new RegExp\(/.test(code))
	})

	check('every id that reaches a filter goes through an ObjectId check', async () => {
		assert.ok(/instanceof ObjectId/.test(code))
		assert.ok(!/ObjectId\(\s*(input|patch|ids|id)\b/.test(code), 'no ObjectId built from raw input')
	})
}

async function sections() {
	await sectionHarness()
	await sectionRegister()
	await sectionClaims()
	await sectionRejections()
	await sectionRace()
	await sectionDuplicates()
	await sectionUpdate()
	await sectionBulkMove()
	await sectionBulkTags()
	await sectionDelete()
	await sectionFaults()
	await sectionSource()
	// The sections only queue their checks; the run is over when the queue is empty and nothing is running.
	await drain()
}

/** Only documents carrying this run's workspace ids, only the media collections. Once. */
let cleaned = false
async function cleanup() {
	if (cleaned || !db) return
	cleaned = true
	try {
		const scope = { workspaceId: { $in: workspaces } }
		const assets = await assetCol.deleteMany(scope)
		const folders = await folderCol.deleteMany(scope)
		const rules = await ruleCol.deleteMany(scope)
		const left =
			(await assetCol.countDocuments(scope)) +
			(await folderCol.countDocuments(scope)) +
			(await ruleCol.countDocuments(scope))
		console.log(`\ncleanup: removed ${assets.deletedCount} assets, ${folders.deletedCount} folders and ${rules.deletedCount} rules across ${workspaces.length} workspaces; ${left} left`)
		if (left) failed++
	} catch (error) {
		failed++
		console.log(`FAIL  cleanup (${error})`)
	}
}

/** The run ends here, however it got here: what it created is removed first. */
async function bail(reason) {
	failed++
	console.log(`\nFAIL  ${reason}`)
	await cleanup()
	console.log(`\n${passed} passed, ${failed} failed`)
	console.log(`${passed}/${passed + failed} passed`)
	process.exit(1)
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => bail(`interrupted by ${signal}`))
// A check that never ends (a hung call) must not hold the runner until its own timeout kills this without a cleanup.
const watchdog = setTimeout(
	() => bail(`still running after ${Math.round(WATCHDOG_MS / 1000)} s: ${[...runningNames].slice(0, 6).join(' | ')}`),
	WATCHDOG_MS,
)
watchdog.unref()

try {
	await main()
} catch (error) {
	failed++
	console.log(`FAIL  harness (${error && error.stack ? error.stack.split('\n').slice(0, 5).join(' | ') : error})`)
} finally {
	clearTimeout(watchdog)
	globalThis.fetch = realFetch
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) delete process.env[key]
		else process.env[key] = value
	}
	await cleanup()
	await client.close().catch(() => {})
}
console.log(`\n${passed} passed, ${failed} failed`)
console.log(`${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
