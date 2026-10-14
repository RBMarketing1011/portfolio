/**
 * Proves src/lib/media/process.ts (the AI tagging queue and its budget) against the
 * REAL source and the real database:
 *
 *   node --env-file=.env scripts/prove-media-process.mjs
 *
 * No network and no key: every external seam (the model, the blob read, the clock, the
 * "is a key set" switch) is injected through `deps`, and `fetch` is guarded so a stray
 * request fails the proof. Expected values come from the stub's doc comments and the
 * build spec (sections 3, 4.8, 4.9), not from whatever the code printed. People's edits
 * are made with the real `commitAsset` / `tags.ts` functions, so the lost-update case is
 * the real race, not a simulation of it.
 *
 * Hygiene: every run uses fresh workspace ids and only creates, reads and deletes
 * documents carrying them (mediaAssets, mediaFolders, mediaTagRules) plus the usage
 * counters, whose `_id` starts with a workspace id or is `global:<day>`. The days are in
 * the future and chosen so that no counter exists for them (a past day would be removed by
 * the TTL monitor in the middle of a check, and a real day must never be touched), so the
 * global counters this run creates are its own, and only those are deleted. Everything is
 * deleted after each section, in a `finally`, and when SIGINT or SIGTERM arrives (a run that
 * is killed outright, which cannot be caught, leaves at most one section behind). No indexes
 * are created or dropped. What a killed run leaves is recognisable and nothing else looks like
 * it: assets with `uploadedBy: 'proof'` whose pathname is `workspaces/<their own workspaceId>/
 * media/proof-<n>-...`, counters whose `_id` starts with those workspace ids, and `global:<day>`
 * counters for days 60 or more days ahead.
 *
 * Speed: the database is a shared cluster and a round trip costs 50-150 ms, so checks that
 * do not touch the process environment run side by side (PROVE_PARALLEL, default 6) and
 * the ones that do (spend limits, the key, real elapsed time) run one at a time afterwards.
 *
 * Knobs: PROVE_ONLY=<regex> runs only the checks whose name matches; PROVE_SRC=<dir>
 * loads a copy of src/lib/media from <dir> (used to check the proof fails when the code
 * is deliberately broken); PROVE_PARALLEL=<n> sets how many checks run side by side;
 * PROVE_LATENCY_MS=<n> delays every database operation by n ms, to see how the checks that
 * measure real time behave on a bad link (they size their budgets from a fresh latency
 * reading and repeat a scenario whose premise the slow database spoiled).
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomInt } from 'node:crypto'

const require = createRequire(import.meta.url)
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const { MongoClient, ObjectId } = rootRequire('mongodb')
const sharp = rootRequire('sharp')

const SRC = process.env.PROVE_SRC ?? 'src/lib/media'
const P = loadTs(`${SRC}/process.ts`)
const T = loadTs(`${SRC}/tags.ts`)
const C = loadTs(`${SRC}/commit.ts`)
const V = loadTs(`${SRC}/vocabulary.ts`)
const { derivedFields, buildTerms } = loadTs(`${SRC}/terms.ts`)
const { indexTokens } = loadTs(`${SRC}/text.ts`)
const { MEDIA_LIMITS } = loadTs(`${SRC}/types.ts`)
const { TaggerError, taggingModel } = loadTs(`${SRC}/tagger.ts`)
const { BlobGoneError, BlobUrlError } = loadTs(`${SRC}/storage.ts`)
const { UnsupportedImageError } = loadTs(`${SRC}/analyze.ts`)
const {
	runTagging,
	getTaggingStatus,
	queueTagging,
	requeueUntagged,
	reserveAiBudget,
	refundAiBudget,
	TAGGING_ERRORS,
} = P

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

let passed = 0
let failed = 0
const only = process.env.PROVE_ONLY ? new RegExp(process.env.PROVE_ONLY, 'i') : null
const PARALLEL = Math.max(1, Number(process.env.PROVE_PARALLEL) || 6)

// Everything the code under test logs is kept, so a check can look for a leak in it.
const allLogs = []
const realError = console.error
console.error = (...args) => {
	allLogs.push(args.map(String).join(' '))
}

// Anything that reaches the network without meaning to is a failure of the proof.
const realFetch = globalThis.fetch
let strayFetches = 0
globalThis.fetch = async () => {
	strayFetches++
	throw new Error('network is not allowed in this proof')
}
const strayRejections = []
process.on('unhandledRejection', (reason) => {
	strayRejections.push(reason)
})

// The environment this proof controls. Whatever the shell had is saved and restored.
const ENV_NAMES = [
	'ANTHROPIC_API_KEY',
	'MEDIA_AI_ENABLED',
	'MEDIA_TAGGING_MODEL',
	'MEDIA_AI_DAILY_LIMIT',
	'MEDIA_AI_GLOBAL_DAILY_LIMIT',
]
const savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]))
function setEnv(values = {}) {
	for (const name of ENV_NAMES) delete process.env[name]
	for (const [name, value] of Object.entries(values)) process.env[name] = value
}
setEnv()
const envIsClean = () => ENV_NAMES.every((name) => process.env[name] === undefined)

const registry = []
/** A section groups checks under one heading; `check` adds to the latest one. */
const section = (title) => registry.push({ title, checks: [] })
/** `seq: true` for a check that changes the process environment or measures real elapsed time. */
const check = (name, fn, { seq = false } = {}) => registry[registry.length - 1].checks.push({ name, fn, seq })

const CHECK_TIMEOUT_MS = 150_000
async function execute({ name, fn, seq }) {
	if (seq) setEnv()
	let timer
	const began = Date.now()
	// A check that takes long says so, which is how a slow database shows up.
	const took = () => (Date.now() - began >= 15_000 ? ` [${Math.round((Date.now() - began) / 1000)} s]` : '')
	try {
		await Promise.race([
			fn(),
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS / 1000} s`)), CHECK_TIMEOUT_MS)
			}),
		])
		if (!seq && !envIsClean()) throw new Error('it changed the environment, so it must be registered with { seq: true }')
		passed++
		console.log(`PASS  ${name}${took()}`)
	} catch (error) {
		failed++
		const detail = (error && error.message ? error.message : String(error)).split('\n').slice(0, 8).join(' | ')
		console.log(`FAIL  ${name} (${detail})`)
	} finally {
		clearTimeout(timer)
		setEnv()
	}
}

async function runRegistry() {
	for (const { title, checks } of registry) {
		const wanted = checks.filter((c) => !only || only.test(c.name))
		if (!wanted.length) continue
		console.log(`\n== ${title}`)
		const sectionBegan = Date.now()
		const side = wanted.filter((c) => !c.seq)
		let next = 0
		await Promise.all(
			Array.from({ length: Math.min(PARALLEL, side.length) }, async () => {
				while (next < side.length) await execute(side[next++])
			}),
		)
		for (const c of wanted.filter((entry) => entry.seq)) await execute(c)
		// Nothing of this section is needed again, and a run that dies later should not leave it behind.
		try {
			const left = await cleanupCreated()
			if (left) {
				failed++
				console.log(`FAIL  cleanup after "${title}" (${left} documents are still there)`)
			}
		} catch (error) {
			failed++
			console.log(`FAIL  cleanup after "${title}" (${error})`)
		}
		console.log(`   (${Math.round((Date.now() - sectionBegan) / 1000)} s)`)
	}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function deferred() {
	let resolve
	let reject
	const promise = new Promise((a, b) => {
		resolve = a
		reject = b
	})
	return { promise, resolve, reject }
}
const hex = (id) => id.toHexString()
const DAY = 86_400_000

/* -------------------------------------------------------------------------- */
/* Clocks and days                                                            */
/* -------------------------------------------------------------------------- */

/** A clock that only moves when told to: leases and deadlines become exact. */
function manualClock(startMs) {
	let t = startMs
	return {
		now: () => new Date(t),
		advance(ms) {
			t += ms
		},
		set(ms) {
			t = ms
		},
		get ms() {
			return t
		},
	}
}

/** A clock that starts at `startMs` and then runs in real time, for the checks about real elapsed time. */
function liveClock(startMs) {
	const origin = Date.now()
	return () => new Date(startMs + (Date.now() - origin))
}

const DAY_ROOM = 500
let dayBase = 0
let dayCounter = 0
const globalKeysUsed = []
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10)
/** The next UTC midnight after `ms`, as the status reports it. */
const nextMidnightIso = (ms) => new Date((Math.floor(ms / DAY) + 1) * DAY).toISOString()
/**
 * A UTC day nobody has a counter for: every check takes its own, so budgets never interfere.
 * Returns the epoch ms of `hour`:00 UTC on it. Days are handed out one after another, so a
 * check that needs the day after its own asks for it in the same breath (no await between).
 */
function newDay(hour = 12) {
	if (halted) throw new Error('the proof was interrupted')
	if (dayCounter >= DAY_ROOM) throw new Error('the proof used up its block of test days')
	const ms = dayBase + dayCounter++ * DAY
	globalKeysUsed.push(`global:${dayKey(ms)}`)
	return ms + hour * 3_600_000
}

/* -------------------------------------------------------------------------- */
/* Database                                                                   */
/* -------------------------------------------------------------------------- */

const uri = process.env.MONGODB_URI
// A check is a burst of parallel operations, and on a remote cluster every new connection costs a TLS handshake (often
// 0.3-1 s): a pool that starts with its connections open makes the first bursts as fast as the later ones.
const client = uri ? new MongoClient(uri, { minPoolSize: 20 }) : null
/** Accounts handed out since the last cleanup; every one is fresh, so nothing here is ever shared with anyone else. */
const workspaces = []
/** Set when the run is being interrupted: nothing new is created from then on. */
let halted = false
const newWs = () => {
	if (halted) throw new Error('the proof was interrupted')
	const id = new ObjectId()
	workspaces.push(id)
	return id
}
let db
let assets
let usage
let ruleCol
let folderCol
let seq = 0

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                    */
/* -------------------------------------------------------------------------- */

const removed = { accounts: 0, assets: 0, folders: 0, rules: 0, accountCounters: 0, globalCounters: 0 }

/**
 * Deletes what the accounts and days handed out so far created, and forgets them. Only documents carrying one of
 * this run's account ids, and the counters named after those accounts or after this run's own days, are touched.
 * It runs after every section (so a run that is killed leaves one section's worth behind, not everything), when
 * SIGINT or SIGTERM arrives, and at the end. Returns how many of those documents are still there (0 when it worked).
 */
async function cleanupCreated({ forget = true } = {}) {
	if (!db) return 0
	const accounts = forget ? workspaces.splice(0) : [...workspaces]
	const days = forget ? globalKeysUsed.splice(0) : [...globalKeysUsed]
	if (!accounts.length && !days.length) return 0
	const named = accounts.length ? { $regex: `^(?:${accounts.map(hex).join('|')}):` } : null
	if (forget) removed.accounts += accounts.length
	if (accounts.length) {
		removed.assets += (await assets.deleteMany({ workspaceId: { $in: accounts } })).deletedCount
		removed.folders += (await folderCol.deleteMany({ workspaceId: { $in: accounts } })).deletedCount
		removed.rules += (await ruleCol.deleteMany({ workspaceId: { $in: accounts } })).deletedCount
		removed.accountCounters += (await usage.deleteMany({ _id: named })).deletedCount
	}
	if (days.length) removed.globalCounters += (await usage.deleteMany({ _id: { $in: days } })).deletedCount
	let left = 0
	if (accounts.length) {
		left += await assets.countDocuments({ workspaceId: { $in: accounts } })
		left += await folderCol.countDocuments({ workspaceId: { $in: accounts } })
		left += await ruleCol.countDocuments({ workspaceId: { $in: accounts } })
		left += await usage.countDocuments({ _id: named })
	}
	if (days.length) left += await usage.countDocuments({ _id: { $in: days } })
	return left
}

/** Ctrl+C or a termination request: stop creating things, clean up, and leave. A second signal leaves at once. */
async function stopEarly(signal) {
	if (halted) process.exit(130)
	halted = true
	console.log(`\n${signal}: stopping, and removing what this run created`)
	try {
		// A check that was mid-flight may still insert something, so the sweep is repeated.
		for (let round = 0; round < 3; round++) {
			await cleanupCreated({ forget: false })
			await new Promise((resolve) => setTimeout(resolve, 400))
		}
	} catch (error) {
		console.log(`cleanup failed: ${error}`)
	}
	process.exit(130)
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void stopEarly(signal))

/** A complete asset document (every field the type promises), with `terms` built the way commitAsset builds them. */
function assetDoc(ws, extra = {}) {
	const n = seq++
	const base = {
		_id: new ObjectId(),
		workspaceId: ws,
		folderId: null,
		name: `photo ${n}`,
		nameKey: `photo ${n}`,
		filename: `photo-${n}.jpg`,
		url: `https://example.invalid/proof/${n}.jpg`,
		pathname: `workspaces/${hex(ws)}/media/proof-${n}-${new ObjectId()}.jpg`,
		contentType: 'image/jpeg',
		bytes: 1000,
		width: 800,
		height: 600,
		pixels: 480000,
		orientation: 'landscape',
		hasAlpha: false,
		animated: false,
		colors: [{ hex: '#336699', name: 'blue', share: 0.6 }],
		colorNames: ['blue'],
		brightness: 'mid',
		saturation: 'muted',
		sha256: `${new ObjectId()}${new ObjectId()}${new ObjectId()}`.slice(0, 64),
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
		termsVersion: 1,
		rev: 0,
		tagging: { status: 'pending', attempts: 0 },
		uploadedBy: 'proof',
		createdAt: new Date(Date.UTC(2020, 0, 1) + n * 1000),
		updatedAt: new Date(Date.UTC(2020, 0, 1)),
		...extra,
	}
	return { ...base, ...derivedFields(base) }
}
async function seed(ws, ...specs) {
	const docs = specs.map((spec) => assetDoc(ws, spec))
	if (docs.length) await assets.insertMany(docs)
	return docs
}
const get = (id) => assets.findOne({ _id: id })
const docsOf = (ws) => assets.find({ workspaceId: ws }).sort({ createdAt: 1, _id: 1 }).toArray()

// A tag's slug is `slugify(label)`: a label whose slug differs would not be a tag the library can produce.
const labelOf = (slug) => slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ')
const manual = (slug, label = labelOf(slug)) => ({ slug, label, source: 'manual' })
const filenameTag = (slug, label = labelOf(slug)) => ({ slug, label, source: 'auto', via: 'filename' })
const slugsOf = (doc) => doc.tags.map((tag) => tag.slug)
const tagOf = (doc, slug) => doc.tags.find((tag) => tag.slug === slug)

const running = (clock, attempts, leaseOffsetMs) => ({
	status: 'running',
	attempts,
	leaseUntil: new Date(clock.ms + leaseOffsetMs),
})

/** What the model says, unless a check says otherwise. */
const vision = (over = {}) => ({
	caption: 'A technician repairing a kitchen sink.',
	altText: 'Technician repairing a kitchen sink',
	tags: [
		{ label: 'Kitchen sink', confidence: 0.95 },
		{ label: 'Technician', confidence: 0.9 },
		{ label: 'Wrench', confidence: 0.7 },
	],
	keywords: ['plumber', 'home repair'],
	textInImage: 'ACME PLUMBING',
	kind: 'photo',
	usage: { inputTokens: 1000, outputTokens: 200 },
	...over,
})

let PNG
let foldersMade = 0
async function makeFolder(ws, name, parentId = null) {
	const doc = {
		_id: new ObjectId(),
		workspaceId: ws,
		parentId,
		name,
		nameKey: `${name.toLowerCase()}-${foldersMade++}`,
		createdBy: 'proof',
		createdAt: new Date(),
		updatedAt: new Date(),
	}
	await folderCol.insertOne(doc)
	return doc
}

const AbortSignalTimeout = AbortSignal.timeout.bind(AbortSignal)
const timeoutRequests = []
AbortSignal.timeout = (ms) => {
	timeoutRequests.push(ms)
	return AbortSignalTimeout(ms)
}

/**
 * The deps a run is given, with a record of what it did. `over.tag(input, opts, entry)` and
 * `over.read(url, opts, entry)` decide what the seam does; the default tags with `vision()`.
 */
function makeDeps(now, over = {}) {
	const calls = { tag: [], read: [], inflight: 0, maxInflight: 0 }
	const deps = {
		configured: over.configured ?? (() => true),
		now,
		read: async (url, opts) => {
			const entry = { url, timeoutMs: opts.timeoutMs }
			calls.read.push(entry)
			return over.read ? over.read(url, opts, entry) : PNG
		},
		tag: async (input, opts) => {
			const entry = {
				input,
				signal: opts.signal,
				// process.ts creates the signal and calls the seam in the same tick, so the last request is its own.
				timeoutMs: timeoutRequests[timeoutRequests.length - 1],
			}
			calls.tag.push(entry)
			calls.inflight++
			calls.maxInflight = Math.max(calls.maxInflight, calls.inflight)
			try {
				return over.tag ? await over.tag(input, opts, entry) : vision()
			} finally {
				calls.inflight--
			}
		},
	}
	return { deps, calls }
}

/** A day, a clock on it, an account and its deps: the usual start of a check. */
function setup(over = {}, { hour = 12 } = {}) {
	const ws = newWs()
	const dayMs = newDay(hour)
	const clock = manualClock(dayMs)
	return { ws, dayMs, clock, ...makeDeps(clock.now, over) }
}

async function counters(ws, ms) {
	const day = dayKey(ms)
	const [workspaceDoc, globalDoc] = await Promise.all([
		usage.findOne({ _id: `${hex(ws)}:${day}` }),
		usage.findOne({ _id: `global:${day}` }),
	])
	return { ws: workspaceDoc, global: globalDoc }
}
const countOf = (doc) => (doc ? doc.count : 0)

/** The invariants every document must keep after a run: only table errors, no stray lease, no half state. */
async function assertTidy(ws, label = 'tidy') {
	const allowed = new Set(Object.values(TAGGING_ERRORS))
	for (const doc of await docsOf(ws)) {
		const t = doc.tagging
		const where = `${label}: ${doc.filename} (${t.status})`
		if (t.error !== undefined) assert.ok(allowed.has(t.error), `${where} stored error ${JSON.stringify(t.error)} is not a TAGGING_ERRORS value`)
		if (t.status !== 'running') assert.ok(!('leaseUntil' in t), `${where} still carries a lease`)
		if (t.status !== 'pending') assert.ok(!('retryAfter' in t), `${where} still carries retryAfter`)
		if (t.status !== 'failed') assert.ok(t.error === undefined, `${where} carries an error`)
		assert.ok(Number.isInteger(t.attempts) && t.attempts >= 0, `${where} attempts ${t.attempts}`)
	}
}

/** The same Date value, whatever object it is. */
const sameTime = (a, b, label) => assert.equal(+a, +b, label)

/** A throwing-getter error, to prove nothing about a hostile throw escapes. */
function hostileError() {
	const error = new Error('hostile')
	for (const key of ['name', 'kind', 'message'])
		Object.defineProperty(error, key, {
			get() {
				throw new Error(`${key} getter`)
			},
		})
	return error
}

/**
 * A database whose calls are recorded, and which can be made to misbehave: `intercept(entry,
 * real)` may return a replacement result (or a rejected promise); returning undefined lets
 * the real call through.
 */
function spyDb(inner, intercept) {
	const ops = []
	const wrap = (collection, name) =>
		new Proxy(collection, {
			get(target, prop) {
				const value = target[prop]
				if (typeof value !== 'function') return value
				return (...args) => {
					const entry = { collection: name, op: String(prop), args }
					ops.push(entry)
					const replaced = intercept ? intercept(entry, () => value.apply(target, args)) : undefined
					return replaced !== undefined ? replaced : value.apply(target, args)
				}
			},
		})
	const proxy = new Proxy(inner, {
		get(target, prop) {
			if (prop === 'collection') return (name) => wrap(target.collection(name), name)
			const value = target[prop]
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
	return { db: proxy, ops }
}

/**
 * The same database behind a slow link: every operation waits `ms` first (a cursor waits when it is read). A way to see
 * how the checks behave when the network is bad (PROVE_LATENCY_MS=300); 0 returns the database itself.
 */
function slowDb(inner, ms) {
	if (!(ms > 0)) return inner
	const lag = () => new Promise((resolve) => setTimeout(resolve, ms))
	const cursorOf = (cursor) => {
		const proxy = new Proxy(cursor, {
			get(target, prop) {
				const value = target[prop]
				if (typeof value !== 'function') return value
				if (prop === 'toArray') return async (...args) => (await lag(), target.toArray(...args))
				return (...args) => {
					const out = value.apply(target, args)
					return out === target ? proxy : out
				}
			},
		})
		return proxy
	}
	const collectionOf = (collection) =>
		new Proxy(collection, {
			get(target, prop) {
				const value = target[prop]
				if (typeof value !== 'function') return value
				if (prop === 'find' || prop === 'aggregate') return (...args) => cursorOf(value.apply(target, args))
				return async (...args) => (await lag(), value.apply(target, args))
			},
		})
	return new Proxy(inner, {
		get(target, prop) {
			if (prop === 'collection') return (name) => collectionOf(target.collection(name))
			if (prop === 'command') return async (...args) => (await lag(), target.command(...args))
			const value = target[prop]
			return typeof value === 'function' ? value.bind(target) : value
		},
	})
}

/**
 * Answers every call on the usage counters itself, without touching them, and remembers which counters it was asked
 * about: for the checks that need the REAL clock (a garbage `now` falls back to it), whose counters must never be written.
 * `held` is the count every counter read reports.
 */
function offlineCounters({ held = 0 } = {}) {
	const keys = new Set()
	const ack = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null }
	const intercept = (entry) => {
		if (entry.collection !== 'mediaAiUsage') return undefined
		const id = entry.args[0]?._id
		if (typeof id === 'string') keys.add(id)
		else if (Array.isArray(id?.$in)) for (const key of id.$in) keys.add(key)
		if (entry.op === 'find') return { toArray: async () => (id?.$in ?? []).map((key) => ({ _id: key, count: held })) }
		if (entry.op === 'findOneAndUpdate') return Promise.resolve({ _id: id, count: 1, expiresAt: new Date() })
		return Promise.resolve(ack)
	}
	return { keys, intercept }
}

/** The field paths and operators of an update, whether it is an operator document or a pipeline of stages. */
function writtenBy(update) {
	const stages = Array.isArray(update) ? update : [update ?? {}]
	const paths = []
	const operators = []
	for (const stage of stages)
		for (const [operator, value] of Object.entries(stage)) {
			operators.push(operator)
			if (operator === '$unset') paths.push(...[].concat(value).flatMap((entry) => (typeof entry === 'string' ? [entry] : Object.keys(entry))))
			else if (value && typeof value === 'object') paths.push(...Object.keys(value))
		}
	return { paths, operators }
}

/* -------------------------------------------------------------------------- */
/* Fixed messages                                                             */
/* -------------------------------------------------------------------------- */

function registerConstants() {
	section('Fixed messages')

	check('TAGGING_ERRORS holds exactly the four strings of the stub, and nothing else', () => {
		assert.deepEqual(TAGGING_ERRORS, {
			unavailable: 'The AI service is unavailable. It will be retried.',
			credentials: 'AI credentials were rejected.',
			unreadable: 'The image could not be read.',
			timeout: 'Took too long to analyse.',
		})
	})
}

/* -------------------------------------------------------------------------- */
/* Budget, called directly                                                    */
/* -------------------------------------------------------------------------- */

function registerBudget() {
	section('Budget: reserveAiBudget and refundAiBudget')

	check('the first reservation creates both counters: _id, count 1, expiresAt = end of the UTC day plus a day of grace', async () => {
		const ws = newWs()
		const at = new Date(newDay(13))
		assert.deepEqual(await reserveAiBudget(db, ws, at), { ok: true })
		const day = dayKey(+at)
		const [workspaceDoc, globalDoc] = await Promise.all([
			usage.findOne({ _id: `${hex(ws)}:${day}` }),
			usage.findOne({ _id: `global:${day}` }),
		])
		const expires = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 2))
		for (const doc of [workspaceDoc, globalDoc]) {
			assert.ok(doc, 'counter missing')
			assert.deepEqual(Object.keys(doc).sort(), ['_id', 'count', 'expiresAt'])
			assert.equal(doc.count, 1)
			sameTime(doc.expiresAt, expires)
		}
	})

	check('refundAiBudget gives one unit back to both counters, never below zero, and never creates a counter', async () => {
		const ws = newWs()
		const at = new Date(newDay())
		for (let i = 0; i < 3; i++) await reserveAiBudget(db, ws, at)
		await refundAiBudget(db, ws, at)
		await refundAiBudget(db, ws, at)
		let c = await counters(ws, +at)
		assert.equal(c.ws.count, 1)
		assert.equal(c.global.count, 1)
		await Promise.all(Array.from({ length: 4 }, () => refundAiBudget(db, ws, at)))
		c = await counters(ws, +at)
		assert.equal(c.ws.count, 0, 'a refund pushed the workspace counter below zero')
		assert.equal(c.global.count, 0, 'a refund pushed the global counter below zero')

		const other = newWs()
		const emptyDay = new Date(newDay())
		await refundAiBudget(db, other, emptyDay)
		const none = await counters(other, +emptyDay)
		assert.equal(none.ws, null, 'a refund created a workspace counter')
		assert.equal(none.global, null, 'a refund created a global counter')
	})

	check('an account id that is not an ObjectId reserves, refunds and creates nothing', async () => {
		const at = new Date(newDay())
		const day = dayKey(+at)
		for (const bad of [undefined, null, 'abc', hex(new ObjectId()), 42, {}, [], { toHexString: () => 'a'.repeat(24) }]) {
			assert.deepEqual(await reserveAiBudget(db, bad, at), { ok: false, scope: 'workspace' }, String(bad))
			await refundAiBudget(db, bad, at)
		}
		const keys = ['undefined', 'null', 'abc', '42', '[object Object]', ''].map((prefix) => `${prefix}:${day}`)
		assert.equal(await usage.countDocuments({ _id: { $in: keys } }), 0, 'a counter was created under a garbage account')
		assert.equal(await usage.countDocuments({ _id: `global:${day}` }), 0, 'the global counter moved')
	})

	check('a duplicate-key error from the ensure step is not "exhausted": the document exists, the reservation goes on; other errors are not swallowed', async () => {
		const ws = newWs()
		const at = new Date(newDay())
		let raced = 0
		const loser = spyDb(db, (entry, real) => {
			if (entry.collection === 'mediaAiUsage' && entry.op === 'updateOne' && entry.args[2]?.upsert) {
				// The other reserver wins the insert; this one gets the duplicate-key error.
				return real().then(() => {
					raced++
					throw Object.assign(new Error('E11000 duplicate key error collection: mediaAiUsage'), { code: 11000 })
				})
			}
		})
		assert.deepEqual(await reserveAiBudget(loser.db, ws, at), { ok: true })
		assert.equal(raced, 2, 'both ensure steps lost the race')
		const c = await counters(ws, +at)
		assert.deepEqual([c.ws.count, c.global.count], [1, 1])

		const broken = spyDb(db, (entry) => {
			if (entry.collection === 'mediaAiUsage' && entry.op === 'updateOne' && entry.args[2]?.upsert)
				return Promise.reject(Object.assign(new Error('connection reset by peer'), { code: 6 }))
		})
		const other = newWs()
		await assert.rejects(reserveAiBudget(broken.db, other, at), /connection reset/)
		assert.equal((await counters(other, +at)).ws, null, 'a failed ensure still reserved something')
	})

	check('a failure while reserving the global counter gives the workspace unit back and is thrown, never read as "exhausted"', async () => {
		const ws = newWs()
		const at = new Date(newDay())
		let calls = 0
		const flaky = spyDb(db, (entry) => {
			if (entry.collection === 'mediaAiUsage' && entry.op === 'findOneAndUpdate' && ++calls === 2)
				return Promise.reject(new Error('network down'))
		})
		await assert.rejects(reserveAiBudget(flaky.db, ws, at), /network down/)
		assert.equal(countOf((await counters(ws, +at)).ws), 0, 'the workspace unit was left behind')
	})

	check('the limit is exact: with a limit of 3 the fourth reservation is refused and does not count', async () => {
		setEnv({ MEDIA_AI_DAILY_LIMIT: '3' })
		const ws = newWs()
		const at = new Date(newDay())
		const results = []
		for (let i = 0; i < 5; i++) results.push(await reserveAiBudget(db, ws, at))
		assert.deepEqual(results, [
			{ ok: true },
			{ ok: true },
			{ ok: true },
			{ ok: false, scope: 'workspace' },
			{ ok: false, scope: 'workspace' },
		])
		const { ws: w, global: g } = await counters(ws, +at)
		assert.equal(w.count, 3, 'a refused reservation must not move the counter')
		assert.equal(g.count, 3, 'a workspace refusal must not touch the global counter')
	}, { seq: true })

	check('the global counter is enforced separately, and its refusal gives the workspace unit back', async () => {
		setEnv({ MEDIA_AI_DAILY_LIMIT: '100', MEDIA_AI_GLOBAL_DAILY_LIMIT: '2' })
		const a = newWs()
		const b = newWs()
		const at = new Date(newDay())
		assert.deepEqual(await reserveAiBudget(db, a, at), { ok: true })
		assert.deepEqual(await reserveAiBudget(db, b, at), { ok: true })
		// Both accounts are far below their own limit; the shared ceiling is what stops them.
		assert.deepEqual(await reserveAiBudget(db, a, at), { ok: false, scope: 'global' })
		assert.deepEqual(await reserveAiBudget(db, b, at), { ok: false, scope: 'global' })
		const ca = await counters(a, +at)
		const cb = await counters(b, +at)
		assert.equal(ca.ws.count, 1, 'a refused global reservation left a workspace unit behind')
		assert.equal(cb.ws.count, 1)
		assert.equal(ca.global.count, 2)
	}, { seq: true })

	check('40 concurrent reservers on a fresh key: exactly `limit` succeed and none errors (the spurious E11000 must never read as exhausted)', async () => {
		setEnv({ MEDIA_AI_DAILY_LIMIT: '10' })
		for (let round = 0; round < 2; round++) {
			const ws = newWs()
			const at = new Date(newDay())
			const settled = await Promise.allSettled(Array.from({ length: 40 }, () => reserveAiBudget(db, ws, at)))
			const rejected = settled.filter((s) => s.status === 'rejected')
			assert.equal(rejected.length, 0, `round ${round}: ${rejected.map((r) => r.reason?.message).slice(0, 2)}`)
			const values = settled.map((s) => s.value)
			assert.equal(values.filter((v) => v.ok).length, 10, `round ${round}: successes`)
			assert.ok(values.filter((v) => !v.ok).every((v) => v.scope === 'workspace'))
			const { ws: w, global: g } = await counters(ws, +at)
			assert.equal(w.count, 10, `round ${round}: workspace counter`)
			assert.equal(g.count, 10, `round ${round}: refused reservers must not have taken global units`)
		}
	}, { seq: true })

	check('concurrent reservers also give exactly `limit` at the edges: limit 1, and limit equal to the crowd', async () => {
		for (const limit of [1, 40]) {
			setEnv({ MEDIA_AI_DAILY_LIMIT: String(limit) })
			const ws = newWs()
			const at = new Date(newDay())
			const settled = await Promise.allSettled(Array.from({ length: 40 }, () => reserveAiBudget(db, ws, at)))
			assert.equal(settled.filter((s) => s.status === 'rejected').length, 0)
			assert.equal(settled.filter((s) => s.status === 'fulfilled' && s.value.ok).length, limit)
		}
	}, { seq: true })

	check('the global counter holds under concurrency across accounts, with no error on its first reservations', async () => {
		setEnv({ MEDIA_AI_GLOBAL_DAILY_LIMIT: '25' })
		const accounts = Array.from({ length: 5 }, () => newWs())
		const at = new Date(newDay())
		const settled = await Promise.allSettled(
			accounts.flatMap((ws) => Array.from({ length: 10 }, () => reserveAiBudget(db, ws, at))),
		)
		assert.equal(settled.filter((s) => s.status === 'rejected').length, 0)
		assert.equal(settled.filter((s) => s.value.ok).length, 25)
		assert.ok(settled.filter((s) => !s.value.ok).every((s) => s.value.scope === 'global'))
		const global = await usage.findOne({ _id: `global:${dayKey(+at)}` })
		assert.equal(global.count, 25)
		let sum = 0
		for (const ws of accounts) sum += countOf((await counters(ws, +at)).ws)
		assert.equal(sum, 25, 'every unit the global counter refused must have been given back')
	}, { seq: true })

	check('a refunded unit can be reserved again', async () => {
		setEnv({ MEDIA_AI_DAILY_LIMIT: '1' })
		const ws = newWs()
		const at = new Date(newDay())
		assert.deepEqual(await reserveAiBudget(db, ws, at), { ok: true })
		assert.equal((await reserveAiBudget(db, ws, at)).ok, false)
		await refundAiBudget(db, ws, at)
		assert.deepEqual(await reserveAiBudget(db, ws, at), { ok: true })
	}, { seq: true })

	check('the UTC day is the key: 23:59:59.999 and 00:00:00.000 are different counters', async () => {
		setEnv({ MEDIA_AI_DAILY_LIMIT: '1' })
		const ws = newWs()
		const midnight = newDay(0)
		const lastMoment = new Date(midnight + DAY - 1)
		const firstMoment = new Date(midnight + DAY)
		newDay(0) // the day after is reserved too, so its counters are this check's own
		assert.deepEqual(await reserveAiBudget(db, ws, lastMoment), { ok: true })
		assert.equal((await reserveAiBudget(db, ws, lastMoment)).ok, false)
		assert.deepEqual(await reserveAiBudget(db, ws, firstMoment), { ok: true }, 'a new UTC day starts a new budget')
		assert.ok(await usage.findOne({ _id: `${hex(ws)}:${dayKey(+lastMoment)}` }))
		assert.ok(await usage.findOne({ _id: `${hex(ws)}:${dayKey(+firstMoment)}` }))
	}, { seq: true })

	const GARBAGE = [
		'',
		'   ',
		'abc',
		'NaN',
		'Infinity',
		'-5',
		'0',
		'-0',
		'1.5',
		'1e3',
		'0x10',
		'12abc',
		'+7',
		'7 7',
		'\uFF17',
		'999999999999999999999999',
		'null',
		'undefined',
	]
	for (const [name, defaultLimit] of [
		['MEDIA_AI_DAILY_LIMIT', MEDIA_LIMITS.aiDailyDefault],
		['MEDIA_AI_GLOBAL_DAILY_LIMIT', MEDIA_LIMITS.aiGlobalDailyDefault],
	]) {
		check(`${name}: garbage values fall back to the default of ${defaultLimit}, real numbers are honoured`, async () => {
			const isGlobal = name === 'MEDIA_AI_GLOBAL_DAILY_LIMIT'
			// Every probe has its own account and counter, seeded at `held` units; a reservation succeeds exactly
			// when held < the limit the environment value means. The value is set for the synchronous start of
			// each call (that is when both limits are read), so all the probes run side by side.
			const sharedDay = isGlobal ? 0 : newDay()
			const probes = []
			const add = (value, limit, held, expectOk) => {
				const dayMs = isGlobal ? newDay() : sharedDay
				probes.push({ value, limit, held, expectOk, ws: newWs(), dayMs })
			}
			for (const value of [undefined, ...GARBAGE]) {
				add(value, defaultLimit, defaultLimit - 1, true)
				add(value, defaultLimit, defaultLimit, false)
			}
			for (const [value, limit] of [['5', 5], [' 7 ', 7], ['007', 7]]) {
				add(value, limit, limit - 1, true)
				add(value, limit, limit, false)
			}
			await Promise.all(
				probes.map((p) =>
					usage.insertOne({
						_id: isGlobal ? `global:${dayKey(p.dayMs)}` : `${hex(p.ws)}:${dayKey(p.dayMs)}`,
						count: p.held,
						expiresAt: new Date(p.dayMs + 5 * DAY),
					}),
				),
			)
			const calls = probes.map((p) => {
				setEnv(p.value === undefined ? {} : { [name]: p.value })
				return reserveAiBudget(db, p.ws, new Date(p.dayMs))
			})
			setEnv()
			const results = await Promise.all(calls)
			const wrong = probes
				.map((p, i) => ({ p, ok: results[i].ok }))
				.filter(({ p, ok }) => ok !== p.expectOk)
				.map(({ p, ok }) => `${p.value === undefined ? '(unset)' : JSON.stringify(p.value)} with ${p.held} used: ${ok ? 'accepted' : 'refused'}`)
			assert.deepEqual(wrong, [])
		}, { seq: true })
	}
}

/* -------------------------------------------------------------------------- */
/* Claims, leases and poison                                                  */
/* -------------------------------------------------------------------------- */

function registerClaims() {
	section('Claims, leases and poison images')

	check('a claim sets running, the lease (now + 55 s) and attempts + 1, and the model is called with the right input', async () => {
		const { ws, clock } = setup()
		const clients = await makeFolder(ws, 'Clients')
		const acme = await makeFolder(ws, 'Acme', clients._id)
		// Other images give the library a vocabulary: Van x3, Truck x2, Garage x1.
		await seed(
			ws,
			{ tags: [manual('van', 'Van'), manual('truck', 'Truck'), manual('garage', 'Garage')], tagging: { status: 'done', attempts: 1 } },
			{ tags: [manual('van', 'Van'), manual('truck', 'Truck')], tagging: { status: 'done', attempts: 1 } },
			{ tags: [filenameTag('van', 'Van')], tagging: { status: 'done', attempts: 1 } },
		)
		const [target] = await seed(ws, { folderId: acme._id, filename: 'IMG_0042.jpg' })
		let seenDuringCall = null
		const { deps, calls } = makeDeps(clock.now, {
			tag: async () => {
				seenDuringCall = await get(target._id)
				return vision()
			},
		})
		const out = await runTagging(db, ws, { limit: 1, deadlineMs: 60_000 }, deps)
		assert.equal(out.processed.length, 1)

		assert.equal(seenDuringCall.tagging.status, 'running')
		assert.equal(seenDuringCall.tagging.attempts, 1)
		sameTime(seenDuringCall.tagging.leaseUntil, clock.ms + MEDIA_LIMITS.aiLeaseMs, 'lease = now + aiLeaseMs')
		assert.ok(!('retryAfter' in seenDuringCall.tagging))

		const input = calls.tag[0].input
		assert.equal(input.filename, 'IMG_0042.jpg')
		assert.equal(input.folderPath, 'Clients/Acme')
		assert.deepEqual(input.knownTags, ['Van', 'Truck', 'Garage'], 'the most used labels, most used first')
		const jpeg = Buffer.from(input.jpegBase64, 'base64')
		assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff], 'the model gets a JPEG')
		assert.ok(calls.tag[0].signal instanceof AbortSignal)
		assert.equal(calls.read[0].url, target.url)
	})

	check('knownTags is the top 60 labels, and a library with no tags sends none', async () => {
		const { ws, clock } = setup()
		const labels = Array.from({ length: 70 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`)
		const manualTags = labels.map((label) => manual(label.toLowerCase(), label))
		await seed(
			ws,
			{ tags: manualTags.slice(0, 35), tagging: { status: 'done', attempts: 1 } },
			{ tags: manualTags.slice(35), tagging: { status: 'done', attempts: 1 } },
		)
		await seed(ws, {})
		const { deps, calls } = makeDeps(clock.now)
		await runTagging(db, ws, { limit: 1 }, deps)
		assert.equal(calls.tag[0].input.knownTags.length, 60)
		assert.deepEqual(calls.tag[0].input.knownTags, labels.slice(0, 60), 'equal counts order by label')

		const empty = setup()
		await seed(empty.ws, {})
		await runTagging(db, empty.ws, { limit: 1 }, empty.deps)
		assert.deepEqual(empty.calls.tag[0].input.knownTags, [])
		assert.ok(!empty.calls.tag[0].input.folderPath, 'no folder, no folder path')
	})

	check('an expired lease is reclaimed (attempts + 1), a live lease is left alone, a missing lease counts as expired', async () => {
		const { ws, clock, deps, calls } = setup()
		const [expired, live, secondTry, noLease, endsNow, endsSoon] = await seed(
			ws,
			{ tagging: running(clock, 1, -1_000) },
			{ tagging: running(clock, 1, 30_000) },
			{ tagging: running(clock, 2, -60_000) },
			{ tagging: { status: 'running', attempts: 1 } },
			{ tagging: running(clock, 1, 0) },
			{ tagging: running(clock, 1, 1) },
		)
		const liveBefore = await get(live._id)
		const soonBefore = await get(endsSoon._id)
		const out = await runTagging(db, ws, { limit: 4, concurrency: 1 }, deps)
		const done = out.processed.map((p) => hex(p.id)).sort()
		assert.deepEqual(done, [expired, secondTry, noLease, endsNow].map((d) => hex(d._id)).sort())
		const after = Object.fromEntries(
			await Promise.all([expired, secondTry, noLease, endsNow].map(async (d) => [hex(d._id), await get(d._id)])),
		)
		assert.equal(after[hex(expired._id)].tagging.attempts, 2)
		assert.equal(after[hex(secondTry._id)].tagging.attempts, 3, 'a reclaim counts as an attempt')
		assert.equal(after[hex(noLease._id)].tagging.attempts, 2)
		assert.equal(after[hex(endsNow._id)].tagging.status, 'done', 'a lease that ends at exactly now has ended')
		assert.deepEqual(await get(live._id), liveBefore, 'a live lease was disturbed')
		assert.deepEqual(await get(endsSoon._id), soonBefore, 'a lease with a millisecond left was taken')
		assert.equal(calls.tag.length, 4)
		assert.equal(out.remaining, 0, 'remaining counts only what a run could still claim, and a live lease is not that')
	})

	check('poison: an expired lease with attempts at the cap is swept to failed (timeout), never claimed, never billed again', async () => {
		const { ws, clock, deps, calls } = setup()
		const [atCap, overCap, liveAtCap, ordinary] = await seed(
			ws,
			{ tagging: running(clock, MEDIA_LIMITS.aiMaxAttempts, -5_000) },
			{ tagging: running(clock, MEDIA_LIMITS.aiMaxAttempts + 2, -5_000) },
			{ tagging: running(clock, MEDIA_LIMITS.aiMaxAttempts, 20_000) },
			{},
		)
		const liveBefore = await get(liveAtCap._id)
		const out = await runTagging(db, ws, { limit: 4 }, deps)
		assert.deepEqual(out.processed.map((p) => hex(p.id)), [hex(ordinary._id)])
		for (const poisoned of [atCap, overCap]) {
			const doc = await get(poisoned._id)
			assert.equal(doc.tagging.status, 'failed')
			assert.equal(doc.tagging.error, TAGGING_ERRORS.timeout)
			assert.ok(!('leaseUntil' in doc.tagging))
			assert.equal(doc.tagging.attempts, poisoned.tagging.attempts, 'the sweep must not invent attempts')
			sameTime(doc.tagging.at, clock.ms)
		}
		assert.deepEqual(await get(liveAtCap._id), liveBefore, 'a live lease must not be swept, whatever its attempts')
		assert.equal(calls.tag.length, 1, 'only the ordinary image reached the model')

		// A later run, even much later, still does not claim them: the live-at-cap image has
		// lapsed by now, which makes it poison too, so it is swept rather than tried again.
		clock.advance(DAY)
		const again = await runTagging(db, ws, { limit: 4 }, deps)
		assert.equal(calls.tag.length, 1, 'a poison image reached the model')
		assert.equal(again.processed.length, 0)
		assert.equal((await get(atCap._id)).tagging.status, 'failed')
		assert.equal((await get(liveAtCap._id)).tagging.error, TAGGING_ERRORS.timeout)
		await assertTidy(ws)
	})

	check('the sweep runs even when the run is not allowed to claim (no time left), and remaining ignores poison', async () => {
		const { ws, clock, deps, calls } = setup()
		const [poison, waiting] = await seed(ws, { tagging: running(clock, 3, -1_000) }, {})
		const out = await runTagging(db, ws, { deadlineMs: 0 }, deps)
		assert.equal(calls.tag.length, 0)
		assert.equal((await get(poison._id)).tagging.status, 'failed')
		assert.equal((await get(waiting._id)).tagging.status, 'pending')
		assert.equal(out.remaining, 1)
	})

	check('garbled stored state never wedges the queue: attempts that are null or text, a lease or retryAfter that is not a date', async () => {
		const { ws, clock, deps, calls } = setup()
		const lapsed = new Date(clock.ms - 5_000)
		const docs = await seed(
			ws,
			{ filename: 'pending-null.jpg', tagging: { status: 'pending', attempts: null } },
			{ filename: 'pending-text.jpg', tagging: { status: 'pending', attempts: 'two' } },
			{ filename: 'pending-bare.jpg', tagging: { status: 'pending' } },
			{ filename: 'retry-text.jpg', tagging: { status: 'pending', attempts: 0, retryAfter: 'soon' } },
			{ filename: 'running-null.jpg', tagging: { status: 'running', attempts: null, leaseUntil: lapsed } },
			{ filename: 'running-text.jpg', tagging: { status: 'running', attempts: '9', leaseUntil: lapsed } },
			{ filename: 'lease-text.jpg', tagging: { status: 'running', attempts: 1, leaseUntil: 'tomorrow' } },
			{ filename: 'lease-none.jpg', tagging: { status: 'running', attempts: 1 } },
			{ filename: 'poison-lease-text.jpg', tagging: { status: 'running', attempts: 3, leaseUntil: 'tomorrow' } },
			{ filename: 'poison-lease-none.jpg', tagging: { status: 'running', attempts: 3 } },
			{ filename: 'live-garbled.jpg', tagging: { status: 'running', attempts: 'x', leaseUntil: new Date(clock.ms + 30_000) } },
		)
		const byName = Object.fromEntries(docs.map((d) => [d.filename, d]))
		const liveBefore = await get(byName['live-garbled.jpg']._id)
		const status = () => getTaggingStatus(db, ws, { configured: () => true, now: clock.now })

		// Every garbled image is accounted for: eight wait in the queue, one is live, two are poison (in neither until swept).
		const before = await status()
		assert.equal(before.pending, 8, 'a garbled image fell out of the queue')
		assert.equal(before.running, 1, 'only the image with a live lease is running')
		assert.equal(before.failed, 0)

		// Nothing throws, and no image is held up by its neighbours: a non-number counts as no attempts.
		const first = await runTagging(db, ws, { limit: 4, concurrency: 2 }, deps)
		assert.equal(first.processed.length, 4)
		assert.equal(first.remaining, 4, 'the poison images are swept, so they are not left in the queue')
		const second = await runTagging(db, ws, { limit: 4, concurrency: 2 }, deps)
		assert.equal(second.processed.length, 4)
		assert.equal(second.remaining, 0)
		assert.ok([...first.processed, ...second.processed].every((p) => p.status === 'done'))
		const attemptsAfter = {
			'pending-null.jpg': 1,
			'pending-text.jpg': 1,
			'pending-bare.jpg': 1,
			'retry-text.jpg': 1,
			'running-null.jpg': 1,
			'running-text.jpg': 1,
			'lease-text.jpg': 2,
			'lease-none.jpg': 2,
		}
		for (const [name, attempts] of Object.entries(attemptsAfter)) {
			const after = await get(byName[name]._id)
			assert.deepEqual([after.tagging.status, after.tagging.attempts], ['done', attempts], name)
			assert.ok(!('retryAfter' in after.tagging) && !('leaseUntil' in after.tagging), `${name} kept a stale field`)
		}
		for (const name of ['poison-lease-text.jpg', 'poison-lease-none.jpg']) {
			const after = await get(byName[name]._id)
			assert.deepEqual([after.tagging.status, after.tagging.error, after.tagging.attempts], ['failed', TAGGING_ERRORS.timeout, 3], name)
		}
		assert.deepEqual(await get(byName['live-garbled.jpg']._id), liveBefore, 'a live lease was disturbed')
		assert.equal(calls.tag.length, 8, 'only the eight claimable images reached the model')
		assert.equal(countOf((await counters(ws, clock.ms)).ws), 8, 'one unit per image')
		const after = await status()
		assert.deepEqual([after.pending, after.running, after.failed], [0, 1, 2])
	})

	check('a retag puts a garbled image right: pending with attempts 0 and nothing left of the old state', async () => {
		const { ws, clock } = setup()
		const deps = { configured: () => true, now: clock.now }
		const docs = await seed(
			ws,
			{ tagging: { status: 'pending', attempts: 'two', retryAfter: 'soon' } },
			{ tagging: { status: 'running', attempts: null, leaseUntil: 'tomorrow' } },
			{ tagging: { status: 'running', attempts: 3 } },
		)
		assert.equal(await queueTagging(db, ws, docs.map((d) => d._id), deps), 3)
		for (const doc of docs) assert.deepEqual((await get(doc._id)).tagging, { status: 'pending', attempts: 0 }, doc.tagging.status)
	})

	check('only images this account owns are claimed: pending queues of other accounts are never touched', async () => {
		const mine = setup()
		const theirs = newWs()
		await seed(mine.ws, {})
		const foreign = await seed(
			theirs,
			{},
			{ tagging: running(mine.clock, 1, -5_000) },
			{ tagging: running(mine.clock, 3, -5_000) },
		)
		const before = await Promise.all(foreign.map((d) => get(d._id)))
		const out = await runTagging(db, mine.ws, { limit: 4 }, mine.deps)
		assert.equal(out.processed.length, 1)
		assert.equal(out.remaining, 0, 'remaining must not count another account')
		assert.deepEqual(await Promise.all(foreign.map((d) => get(d._id))), before)
		assert.equal(mine.calls.tag.length, 1)
	})

	check('retryAfter: a rate-limited image is left alone until it has passed; absent, null and past are claimable', async () => {
		const { ws, clock, deps, calls } = setup()
		const [plain, past, nullish, future, done, failed, skipped] = await seed(
			ws,
			{ filename: 'plain.jpg' },
			{ filename: 'past.jpg', tagging: { status: 'pending', attempts: 1, retryAfter: new Date(clock.ms - 1) } },
			{ filename: 'nullish.jpg', tagging: { status: 'pending', attempts: 0, retryAfter: null } },
			{ filename: 'future.jpg', tagging: { status: 'pending', attempts: 0, retryAfter: new Date(clock.ms + 60_000) } },
			{ filename: 'done.jpg', tagging: { status: 'done', attempts: 1 } },
			{ filename: 'failed.jpg', tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.unreadable } },
			{ filename: 'skipped.jpg', tagging: { status: 'skipped', attempts: 0, reason: 'not_configured' } },
		)
		void plain
		const frozen = await Promise.all([future, done, failed, skipped].map((d) => get(d._id)))
		const out = await runTagging(db, ws, { limit: 4, concurrency: 1 }, deps)
		assert.deepEqual(
			calls.tag.map((c) => c.input.filename).sort(),
			['nullish.jpg', 'past.jpg', 'plain.jpg'],
		)
		assert.equal(out.remaining, 1, 'a delayed image is still in the queue: the client must know to wait')
		assert.deepEqual(await Promise.all([future, done, failed, skipped].map((d) => get(d._id))), frozen)
		const claimedPast = await get(past._id)
		assert.ok(!('retryAfter' in claimedPast.tagging), 'a done image must not keep retryAfter')
		assert.equal((await get(nullish._id)).tagging.status, 'done')

		clock.advance(60_000)
		const next = await runTagging(db, ws, { limit: 4 }, deps)
		assert.deepEqual(next.processed.map((p) => hex(p.id)), [hex(future._id)])
		assert.equal(next.remaining, 0)
	})

	check('two concurrent runs over the same 6 pending images process each exactly once', async () => {
		const { ws, clock } = setup()
		await seed(ws, ...Array.from({ length: 6 }, () => ({})))
		const { deps, calls } = makeDeps(clock.now, {
			tag: async () => {
				await sleep(40)
				return vision()
			},
		})
		const [a, b] = await Promise.all([
			runTagging(db, ws, { limit: 3 }, deps),
			runTagging(db, ws, { limit: 3 }, deps),
		])
		const filenames = calls.tag.map((c) => c.input.filename)
		assert.equal(filenames.length, 6)
		assert.equal(new Set(filenames).size, 6, `an image was tagged twice: ${filenames}`)
		const ids = [...a.processed, ...b.processed].map((p) => hex(p.id))
		assert.equal(new Set(ids).size, 6, 'an image was reported by both runs')
		for (const doc of await docsOf(ws)) {
			assert.equal(doc.tagging.status, 'done')
			assert.equal(doc.tagging.attempts, 1, 'exactly one attempt each')
		}
		const c = await counters(ws, clock.ms)
		assert.equal(c.ws.count, 6, 'one unit per image')
	})

	check('many runs racing for few images never double-claim one (6 runs x 4 slots over 12 images)', async () => {
		const { ws, clock } = setup()
		await seed(ws, ...Array.from({ length: 12 }, () => ({})))
		const { deps, calls } = makeDeps(clock.now, {
			tag: async () => {
				await sleep(25)
				return vision()
			},
		})
		const runs = await Promise.all(
			Array.from({ length: 6 }, () => runTagging(db, ws, { limit: 4, concurrency: 2 }, deps)),
		)
		const filenames = calls.tag.map((c) => c.input.filename)
		assert.equal(filenames.length, 12, `calls: ${filenames.length}`)
		assert.equal(new Set(filenames).size, 12, 'an image reached the model twice')
		assert.equal(runs.reduce((sum, r) => sum + r.processed.length, 0), 12)
		for (const doc of await docsOf(ws)) assert.equal(doc.tagging.attempts, 1)
		assert.equal(countOf((await counters(ws, clock.ms)).ws), 12)
	})

	check('runs racing for images whose leases lapsed reclaim each of them exactly once', async () => {
		const { ws, clock } = setup()
		await seed(ws, ...Array.from({ length: 3 }, () => ({ tagging: running(clock, 1, -1_000) })))
		const { deps, calls } = makeDeps(clock.now, {
			tag: async () => {
				await sleep(30)
				return vision()
			},
		})
		await Promise.all(Array.from({ length: 4 }, () => runTagging(db, ws, { limit: 3 }, deps)))
		const names = calls.tag.map((c) => c.input.filename)
		assert.equal(names.length, 3, `calls ${names.length}`)
		assert.equal(new Set(names).size, 3, 'a lapsed image was reclaimed twice')
		for (const doc of await docsOf(ws)) assert.deepEqual([doc.tagging.status, doc.tagging.attempts], ['done', 2])
	})

	check('a request that is killed on every try ends as failed (timeout) after the attempt cap, and is never billed again', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, {})
		for (let attempt = 1; attempt <= MEDIA_LIMITS.aiMaxAttempts; attempt++) {
			// The model call never answers and the request is gone: nothing will ever finish or release this claim.
			const dead = gated(clock, () => vision())
			runTagging(db, ws, { limit: 1 }, dead.deps).catch(() => undefined)
			await dead.reached.promise
			const claimed = await get(image._id)
			assert.deepEqual([claimed.tagging.status, claimed.tagging.attempts], ['running', attempt])
			clock.advance(MEDIA_LIMITS.aiLeaseMs + 1)
		}
		const fresh = makeDeps(clock.now)
		const out = await runTagging(db, ws, { limit: 1 }, fresh.deps)
		const doc = await get(image._id)
		assert.deepEqual([doc.tagging.status, doc.tagging.error, doc.tagging.attempts], ['failed', TAGGING_ERRORS.timeout, MEDIA_LIMITS.aiMaxAttempts])
		assert.equal(fresh.calls.tag.length, 0, 'a poison image reached the model again')
		assert.equal(out.processed.length, 0)
		assert.equal(out.remaining, 0)
		assert.equal(countOf((await counters(ws, clock.ms)).ws), MEDIA_LIMITS.aiMaxAttempts, 'each killed request paid once, and nothing more')
	})

	check('a slow worker whose lease was reclaimed cannot overwrite the newer result (the clock moved on)', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, {})
		const gate = deferred()
		const reached = deferred()
		const slow = makeDeps(clock.now, {
			tag: async () => {
				reached.resolve()
				await gate.promise
				return vision({ caption: 'STALE caption from the slow worker', tags: [{ label: 'Stale tag', confidence: 0.9 }] })
			},
		})
		const first = runTagging(db, ws, { limit: 1 }, slow.deps)
		await reached.promise
		const midway = await get(image._id)
		assert.equal(midway.tagging.status, 'running')
		assert.equal(midway.tagging.attempts, 1)

		clock.advance(MEDIA_LIMITS.aiLeaseMs + 5_000)
		const fast = makeDeps(clock.now, {
			tag: async () => vision({ caption: 'Fresh caption', tags: [{ label: 'Fresh tag', confidence: 0.9 }] }),
		})
		const second = await runTagging(db, ws, { limit: 1 }, fast.deps)
		assert.equal(second.processed[0].status, 'done')
		const settledBy = await get(image._id)
		assert.equal(settledBy.tagging.attempts, 2)

		gate.resolve()
		const firstOut = await first
		const final = await get(image._id)
		assert.equal(final.caption, 'Fresh caption', 'the slow worker overwrote the caption')
		assert.deepEqual(slugsOf(final), ['fresh-tag'], 'the slow worker overwrote the tags')
		assert.equal(final.rev, settledBy.rev, 'the stale result must not even bump the revision')
		assert.deepEqual(final.tagging, settledBy.tagging)
		assert.equal(firstOut.processed.length, 1, 'a lost claim is still reported')
		assert.equal(firstOut.processed[0].status, 'done', 'it reports what is stored now')
		assert.equal(firstOut.processed[0].doc.caption, 'Fresh caption')
		assert.equal(countOf((await counters(ws, clock.ms - MEDIA_LIMITS.aiLeaseMs - 5_000)).ws), 2, 'both model calls were paid for')
	})

	check('a slow worker cannot overwrite a claim that has the same lease: with the clock standing still the two claims differ only in attempts', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, {})
		const first = gated(clock, () => vision({ caption: 'STALE caption from the slow worker', tags: [{ label: 'Stale tag', confidence: 0.9 }] }))
		const run1 = runTagging(db, ws, { limit: 1 }, first.deps)
		await first.reached.promise
		const firstClaim = (await get(image._id)).tagging
		// The lease runs out (the proof says so directly: the clock does not move), and a second worker takes over.
		await assets.updateOne({ _id: image._id }, { $set: { 'tagging.leaseUntil': new Date(clock.ms - 1) } })
		const second = gated(clock, () => vision({ caption: 'Fresh caption', tags: [{ label: 'Fresh tag', confidence: 0.9 }] }))
		const run2 = runTagging(db, ws, { limit: 1 }, second.deps)
		await second.reached.promise
		const secondClaim = (await get(image._id)).tagging
		// The point of the check: the two claims are identical to the millisecond, except for the attempt.
		sameTime(secondClaim.leaseUntil, firstClaim.leaseUntil, 'the clock stood still, so the two leases must be equal')
		assert.deepEqual([firstClaim.attempts, secondClaim.attempts], [1, 2])

		// The first worker comes back while the second still holds the claim: its answer must not land.
		first.gate.resolve()
		const lost = await run1
		assert.deepEqual(lost.processed.map((p) => p.status), ['running'], 'a lost claim reports what is stored now: the other worker still holds it')
		const midway = await get(image._id)
		assert.equal(midway.tagging.status, 'running', 'a stale worker finished an image another worker holds')
		assert.equal(midway.tagging.attempts, 2)
		assert.equal(midway.caption, '', 'the stale caption landed')
		assert.deepEqual(midway.tags, [], 'the stale tags landed')
		assert.equal(midway.rev, 0, 'a stale write bumped the revision')

		second.gate.resolve()
		await run2
		const final = await get(image._id)
		assert.equal(final.caption, 'Fresh caption')
		assert.deepEqual(slugsOf(final), ['fresh-tag'])
		assert.deepEqual([final.tagging.status, final.tagging.attempts], ['done', 2])
	})

	check('a slow worker cannot record its failure over the newer result either', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, {})
		const gate = deferred()
		const reached = deferred()
		const slow = makeDeps(clock.now, {
			tag: async () => {
				reached.resolve()
				await gate.promise
				throw new TaggerError('late failure', 'permanent')
			},
		})
		const first = runTagging(db, ws, { limit: 1 }, slow.deps)
		await reached.promise
		clock.advance(MEDIA_LIMITS.aiLeaseMs + 1)
		const fast = makeDeps(clock.now)
		await runTagging(db, ws, { limit: 1 }, fast.deps)
		const settledBy = await get(image._id)
		assert.equal(settledBy.tagging.status, 'done')
		gate.resolve()
		await first
		assert.deepEqual((await get(image._id)).tagging, settledBy.tagging, 'a stale failure overwrote a finished image')
	})

	check('a requeued image whose worker is still running: the worker\'s result is dropped, the new claim stands', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, {})
		const gate = deferred()
		const reached = deferred()
		const slow = makeDeps(clock.now, {
			tag: async () => {
				reached.resolve()
				await gate.promise
				return vision({ caption: 'LATE caption', tags: [{ label: 'Late', confidence: 0.9 }] })
			},
		})
		const first = runTagging(db, ws, { limit: 1 }, slow.deps)
		await reached.promise
		// The lease has run out and a person asked to retag: attempts go back to zero.
		clock.advance(MEDIA_LIMITS.aiLeaseMs + 1)
		assert.equal(await queueTagging(db, ws, [image._id], { configured: () => true, now: clock.now }), 1)
		const requeued = await get(image._id)
		assert.equal(requeued.tagging.status, 'pending')
		assert.equal(requeued.tagging.attempts, 0)
		gate.resolve()
		const dropped = await first
		assert.deepEqual(dropped.processed.map((p) => p.status), ['pending'], 'a dropped result reports what is stored now, not what the run hoped for')
		const final = await get(image._id)
		assert.equal(final.tagging.status, 'pending', 'the dropped result must not mark the requeued image done')
		assert.equal(final.caption, '')
		assert.deepEqual(final.tags, [])
	})

	check('ids restricts a run to those images; remaining still counts the whole account', async () => {
		const { ws, deps, calls } = setup()
		const [a, b, c, d, e] = await seed(ws, {}, {}, {}, {}, {})
		const out = await runTagging(db, ws, { ids: [a._id, c._id], limit: 4 }, deps)
		assert.deepEqual(out.processed.map((p) => hex(p.id)).sort(), [hex(a._id), hex(c._id)].sort())
		assert.equal(out.remaining, 3)
		for (const untouched of [b, d, e]) assert.deepEqual((await get(untouched._id)).tagging, { status: 'pending', attempts: 0 })
		assert.equal(calls.tag.length, 2)
	})

	check('hostile ids never widen a run: junk, operators, other accounts\' ids, duplicates and a non-array', async () => {
		const mine = setup()
		const stranger = newWs()
		const [target, other] = await seed(mine.ws, {}, {})
		const [theirs] = await seed(stranger, {})
		const junk = [
			'not an id',
			{ $ne: null },
			{ $gt: '' },
			null,
			undefined,
			123,
			[],
			hex(target._id),
			theirs._id,
			target._id,
			target._id,
			new ObjectId(),
		]
		const out = await runTagging(db, mine.ws, { ids: junk, limit: 4 }, mine.deps)
		assert.deepEqual(out.processed.map((p) => hex(p.id)), [hex(target._id)], 'only the one valid id of this account may be tagged')
		assert.equal((await get(other._id)).tagging.status, 'pending')
		assert.equal((await get(theirs._id)).tagging.status, 'pending', 'another account\'s image was tagged')
		assert.equal(mine.calls.tag.length, 1, 'a duplicated id was tagged twice')

		for (const bad of [[], { $ne: null }, 'abc', 7, { length: 1, 0: target._id }, ['x']]) {
			const none = await runTagging(db, mine.ws, { ids: bad, limit: 4 }, mine.deps)
			assert.equal(none.processed.length, 0, `ids ${JSON.stringify(bad)} widened the run`)
		}
		assert.equal((await get(other._id)).tagging.status, 'pending')
	})

	check('limit: default 2, never above the batch maximum or below one image, fractions round down, junk means the default', async () => {
		const cases = [
			[{}, MEDIA_LIMITS.aiBatchDefault],
			[{ limit: 99 }, MEDIA_LIMITS.aiBatchMax],
			[{ limit: 1 }, 1],
			[{ limit: 3 }, 3],
			[{ limit: 0 }, 1],
			[{ limit: -3 }, 1],
			[{ limit: 2.9 }, 2],
			[{ limit: 4.9 }, MEDIA_LIMITS.aiBatchMax],
			[{ limit: Number.NaN }, MEDIA_LIMITS.aiBatchDefault],
			[{ limit: '3' }, MEDIA_LIMITS.aiBatchDefault],
			[{ limit: null }, MEDIA_LIMITS.aiBatchDefault],
			[{ limit: Infinity }, MEDIA_LIMITS.aiBatchDefault],
		]
		await Promise.all(
			cases.map(async ([opts, expected]) => {
				const ctx = setup()
				await seed(ctx.ws, ...Array.from({ length: 6 }, () => ({})))
				const out = await runTagging(db, ctx.ws, opts, ctx.deps)
				assert.equal(out.processed.length, expected, `limit ${String(opts.limit)}`)
				assert.equal(out.remaining, 6 - expected)
			}),
		)
	})

	check('concurrency: images in flight at once never exceed it (default 2, at most the limit), junk means the default', async () => {
		// Each call waits (up to a few seconds) until as many calls as the run may have in
		// flight are in flight, so the peak is the run's own limit and not database timing.
		const cases = [
			[1, 1],
			[2, 2],
			[4, 4],
			[99, 4],
			[undefined, 2],
			[Number.NaN, 2],
		]
		await Promise.all(
			cases.map(async ([concurrency, expected]) => {
				const holder = {}
				const ctx = setup({
					tag: async () => {
						// As long as the database needs: the wait ends the moment `expected` calls are in flight at once.
						const until = Date.now() + 30_000
						while (holder.calls.inflight < expected && Date.now() < until) await sleep(10)
						await sleep(30)
						return vision()
					},
				})
				holder.calls = ctx.calls
				await seed(ctx.ws, ...Array.from({ length: 4 }, () => ({})))
				await runTagging(db, ctx.ws, { limit: 4, concurrency }, ctx.deps)
				assert.equal(ctx.calls.maxInflight, expected, `concurrency ${concurrency}`)
			}),
		)
	})
}

/* -------------------------------------------------------------------------- */
/* Applying a result                                                          */
/* -------------------------------------------------------------------------- */

function registerApply() {
	section('Applying a result')

	check('happy path: tags, caption, alt text, keywords, kind, text in image, terms, rev, status, tokens, vocabulary', async () => {
		const { ws, clock, deps } = setup()
		const [image] = await seed(ws, { name: 'Hero shot', rev: 4 })
		const vocabularyBefore = await V.loadVocabulary(db, ws)
		assert.equal(vocabularyBefore.has('plumber'), false)

		const out = await runTagging(db, ws, { limit: 1 }, deps)
		const after = await get(image._id)

		assert.deepEqual(after.tagging, {
			status: 'done',
			attempts: 1,
			model: taggingModel(),
			at: new Date(clock.ms),
		})
		assert.equal(after.caption, 'A technician repairing a kitchen sink.')
		assert.equal(after.altText, 'Technician repairing a kitchen sink')
		assert.deepEqual(after.keywords, ['plumber', 'home repair'])
		assert.equal(after.kind, 'photo')
		assert.equal(after.textInImage, 'ACME PLUMBING')
		assert.deepEqual(after.tags, [
			{ slug: 'kitchen-sink', label: 'Kitchen sink', source: 'auto', via: 'vision', confidence: 0.95 },
			{ slug: 'technician', label: 'Technician', source: 'auto', via: 'vision', confidence: 0.9 },
			{ slug: 'wrench', label: 'Wrench', source: 'auto', via: 'vision', confidence: 0.7 },
		])
		assert.equal(after.rev, 5, 'one write, one revision')
		assert.equal(after.termsVersion, 1)
		assert.deepEqual(after.terms, buildTerms(after), 'terms are rebuilt from the document as it is now')
		const wanted = indexTokens(
			'A technician repairing a kitchen sink. Technician repairing a kitchen sink plumber home repair ACME PLUMBING Kitchen sink Technician Wrench photo',
		)
		const missing = wanted.filter((term) => !after.terms.includes(term))
		assert.deepEqual(missing, [], 'search terms for the new text are missing')
		assert.ok(+after.updatedAt > +image.updatedAt, 'updatedAt must move')

		const changed = ['tags', 'caption', 'altText', 'keywords', 'kind', 'textInImage', 'tagging', 'terms', 'rev', 'updatedAt']
		assert.deepEqual(
			{ ...after, ...Object.fromEntries(changed.map((k) => [k, image[k]])) },
			image,
			'a field the run has no business with changed',
		)

		assert.deepEqual(out.processed.map((p) => [hex(p.id), p.status]), [[hex(image._id), 'done']])
		assert.equal(out.processed[0].doc.rev, after.rev)
		assert.deepEqual(out.processed[0].doc.tags, after.tags)
		assert.equal(out.remaining, 0)
		assert.equal(out.budgetExhausted, false)
		assert.ok(!('blocked' in out), 'blocked must be absent, not undefined')

		const vocabularyAfter = await V.loadVocabulary(db, ws)
		assert.notEqual(vocabularyAfter, vocabularyBefore, 'the vocabulary cache was not invalidated')
		assert.equal(vocabularyAfter.has('plumber'), true, 'the new words are not in the vocabulary')

		const c = await counters(ws, clock.ms)
		for (const doc of [c.ws, c.global]) {
			assert.equal(doc.count, 1)
			assert.equal(doc.inputTokens, 1000)
			assert.equal(doc.outputTokens, 200)
		}
		await assertTidy(ws)
	})

	check('tokens add up across images, to the workspace and the global day documents', async () => {
		const { ws, clock } = setup()
		await seed(ws, {}, {}, {})
		let n = 0
		const { deps } = makeDeps(clock.now, {
			tag: async () => vision({ usage: { inputTokens: 100 * ++n, outputTokens: 10 * n } }),
		})
		await runTagging(db, ws, { limit: 3, concurrency: 1 }, deps)
		const c = await counters(ws, clock.ms)
		assert.equal(c.ws.inputTokens, 600)
		assert.equal(c.ws.outputTokens, 60)
		assert.equal(c.global.inputTokens, 600)
		assert.equal(c.global.outputTokens, 60)
	})

	check('garbage token counts are ignored, never added as NaN or negative', async () => {
		const { ws, clock } = setup()
		await seed(ws, {}, {}, {})
		const usages = [{ inputTokens: -5, outputTokens: Number.NaN }, { inputTokens: '12', outputTokens: null }, undefined]
		let i = 0
		const { deps } = makeDeps(clock.now, { tag: async () => vision({ usage: usages[i++] }) })
		await runTagging(db, ws, { limit: 3, concurrency: 1 }, deps)
		const c = await counters(ws, clock.ms)
		for (const doc of [c.ws, c.global]) {
			assert.equal(doc.count, 3)
			assert.ok((doc.inputTokens ?? 0) === 0 && (doc.outputTokens ?? 0) === 0, JSON.stringify(doc))
		}
		for (const doc of await docsOf(ws)) assert.equal(doc.tagging.status, 'done')
	})

	check('the confidence floor (0.6, inclusive) and the cap (10 vision tags) hold, and a rejected tag does not use up a place', async () => {
		const ctx = setup({
			tag: async () =>
				vision({
					tags: [
						...Array.from({ length: 14 }, (_, i) => ({ label: `Tag ${String(i + 1).padStart(2, '0')}`, confidence: 0.95 - i * 0.01 })),
						{ label: 'Edge', confidence: 0.6 },
						{ label: 'Below', confidence: 0.599 },
						{ label: 'Zero', confidence: 0 },
						{ label: 'Nan', confidence: Number.NaN },
						{ label: 'Missing' },
					],
				}),
		})
		const [image] = await seed(ctx.ws, { rejectedTags: ['tag-02'] })
		await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		const after = await get(image._id)
		const slugs = slugsOf(after)
		// Tag 02 is rejected: the ten places go to Tag 01, 03..11.
		assert.deepEqual(slugs, ['tag-01', 'tag-03', 'tag-04', 'tag-05', 'tag-06', 'tag-07', 'tag-08', 'tag-09', 'tag-10', 'tag-11'])
		assert.equal(after.tags.length, MEDIA_LIMITS.autoTagsMax)
		assert.ok(after.tags.every((t) => t.via === 'vision' && t.confidence >= 0.6))
		assert.deepEqual(after.rejectedTags, ['tag-02'])

		// The floor is inclusive.
		const edge = setup({ tag: async () => vision({ tags: [{ label: 'Good', confidence: 0.9 }, { label: 'Edge', confidence: 0.6 }, { label: 'Below', confidence: 0.599 }] }) })
		const [e] = await seed(edge.ws, {})
		await runTagging(db, edge.ws, { limit: 1 }, edge.deps)
		assert.deepEqual(slugsOf(await get(e._id)), ['good', 'edge'])
	})

	check('captionEdited is judged on the fresh document: a person\'s caption and alt text survive, everything else is still applied', async () => {
		const { ws, deps } = setup()
		const [edited, notEdited] = await seed(
			ws,
			{ caption: 'My own words', altText: 'My own alt', captionEdited: true },
			{ caption: 'Old machine caption', altText: 'Old machine alt', captionEdited: false },
		)
		await runTagging(db, ws, { limit: 2, concurrency: 1 }, deps)
		const a = await get(edited._id)
		assert.equal(a.caption, 'My own words')
		assert.equal(a.altText, 'My own alt')
		assert.equal(a.captionEdited, true)
		assert.deepEqual(a.keywords, ['plumber', 'home repair'], 'the rest of the result is still applied')
		assert.equal(a.kind, 'photo')
		assert.equal(a.textInImage, 'ACME PLUMBING')
		assert.deepEqual(slugsOf(a), ['kitchen-sink', 'technician', 'wrench'])
		assert.ok(a.terms.includes('plumber'))
		assert.ok(a.terms.includes('own'), 'the person\'s words stay searchable')
		const b = await get(notEdited._id)
		assert.equal(b.caption, 'A technician repairing a kitchen sink.')
		assert.equal(b.altText, 'Technician repairing a kitchen sink')
		assert.equal(b.captionEdited, false)
	})

	check('an empty caption or alt text from the model never erases the existing one', async () => {
		const ctx = setup({ tag: async () => vision({ caption: '', altText: '   ' }) })
		const [image] = await seed(ctx.ws, { caption: 'Earlier machine caption', altText: 'Earlier alt' })
		await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		const after = await get(image._id)
		assert.equal(after.caption, 'Earlier machine caption')
		assert.equal(after.altText, 'Earlier alt')
		assert.equal(after.tagging.status, 'done')
	})

	check('manual and file-name tags are untouched; a manual tag the model also names stays manual', async () => {
		const { ws, deps } = setup()
		const [image] = await seed(ws, {
			// Same slug as the model's "Kitchen sink", spelled the way the person typed it.
			tags: [manual('kitchen-sink', 'KITCHEN sink'), manual('garage', 'Garage'), filenameTag('img-001', 'Img 001')],
		})
		await runTagging(db, ws, { limit: 1 }, deps)
		const after = await get(image._id)
		assert.deepEqual(tagOf(after, 'kitchen-sink'), { slug: 'kitchen-sink', label: 'KITCHEN sink', source: 'manual' })
		assert.deepEqual(tagOf(after, 'garage'), { slug: 'garage', label: 'Garage', source: 'manual' })
		assert.deepEqual(tagOf(after, 'img-001'), { slug: 'img-001', label: 'Img 001', source: 'auto', via: 'filename' })
		assert.equal(after.tags.filter((t) => t.slug === 'kitchen-sink').length, 1)
		assert.ok(tagOf(after, 'technician') && tagOf(after, 'wrench'))
		// Manual tags first, then vision by confidence, then file name.
		assert.deepEqual(slugsOf(after), ['kitchen-sink', 'garage', 'technician', 'wrench', 'img-001'])
	})

	check('rejectedTags are honoured: a tag a person removed is not put back, and stays remembered', async () => {
		const { ws, deps } = setup()
		const [image] = await seed(ws, { rejectedTags: ['kitchen-sink', 'unrelated'] })
		await runTagging(db, ws, { limit: 1 }, deps)
		const after = await get(image._id)
		assert.deepEqual(slugsOf(after), ['technician', 'wrench'])
		assert.deepEqual(after.rejectedTags, ['kitchen-sink', 'unrelated'])
	})

	check('block and redirect rules are honoured: a deleted tag never comes back, a renamed one arrives under its new name', async () => {
		const { ws, deps } = setup()
		await T.writeRule(db, ws, 'wrench', null)
		await T.writeRule(db, ws, 'technician', { slug: 'tradesperson', label: 'Tradesperson' })
		const [image] = await seed(ws, {})
		await runTagging(db, ws, { limit: 1 }, deps)
		const after = await get(image._id)
		assert.deepEqual(after.tags.map((t) => [t.slug, t.label]), [
			['kitchen-sink', 'Kitchen sink'],
			['tradesperson', 'Tradesperson'],
		])
		assert.equal(tagOf(after, 'tradesperson').confidence, 0.9)
		assert.equal(tagOf(after, 'tradesperson').via, 'vision')
	})

	check('vision tags are replaced on a second run; manual tags and file-name tags are not', async () => {
		const ctx = setup()
		const { ws, clock } = ctx
		const [image] = await seed(ws, { tags: [manual('garage', 'Garage'), filenameTag('img-001')] })
		await runTagging(db, ws, { limit: 1 }, ctx.deps)
		const first = await get(image._id)
		assert.deepEqual(slugsOf(first), ['garage', 'kitchen-sink', 'technician', 'wrench', 'img-001'])

		assert.equal(await queueTagging(db, ws, [image._id], { configured: () => true, now: clock.now }), 1)
		const second = makeDeps(clock.now, {
			tag: async () => vision({ tags: [{ label: 'Bathroom', confidence: 0.8 }, { label: 'Technician', confidence: 0.91 }], caption: 'A bathroom.' }),
		})
		await runTagging(db, ws, { limit: 1 }, second.deps)
		const after = await get(image._id)
		assert.deepEqual(slugsOf(after), ['garage', 'technician', 'bathroom', 'img-001'])
		assert.equal(tagOf(after, 'technician').confidence, 0.91, 'the new run\'s confidence replaces the old')
		assert.equal(after.caption, 'A bathroom.')
		assert.equal(after.tagging.attempts, 1, 'a requeue starts the count again')
		assert.equal(after.rev, first.rev + 1, 'the requeue is not a revision write; the second apply is, so exactly one more')
	})

	check('the model\'s labels are pulled onto existing tags ("vans" becomes the library\'s "Van")', async () => {
		const ctx = setup({ tag: async () => vision({ tags: [{ label: 'vans', confidence: 0.9 }, { label: 'Work trucks', confidence: 0.8 }] }) })
		await seed(ctx.ws, { tags: [manual('van', 'Van')], tagging: { status: 'done', attempts: 1 } })
		const [image] = await seed(ctx.ws, {})
		await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		const after = await get(image._id)
		assert.deepEqual(after.tags.map((t) => [t.slug, t.label]), [
			['van', 'Van'],
			['work-trucks', 'Work trucks'],
		])
	})

	check('hostile model output is bounded and inert: long text clamped, kind checked, junk tags and keywords dropped', async () => {
		const huge = 'x'.repeat(100_000)
		const ctx = setup({
			tag: async () => ({
				caption: huge,
				altText: `${huge}\u0000\u202e`,
				textInImage: huge,
				kind: 'banana',
				keywords: [huge, 'ok phrase', 'ok phrase', 7, null, '<script>alert(1)</script>', ...Array.from({ length: 60 }, (_, i) => `k${i}`)],
				tags: [
					{ label: '<img src=x onerror=alert(1)>', confidence: 0.99 },
					{ label: huge, confidence: 0.98 },
					null,
					'a string',
					{ label: 5, confidence: 0.9 },
					...Array.from({ length: 500 }, (_, i) => ({ label: `Bulk ${i}`, confidence: 0.7 })),
				],
				usage: { inputTokens: 1, outputTokens: 1 },
			}),
		})
		const [image] = await seed(ctx.ws, {})
		const out = await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		assert.equal(out.processed[0].status, 'done')
		const after = await get(image._id)
		assert.ok(after.caption.length <= MEDIA_LIMITS.captionMax, `caption ${after.caption.length}`)
		assert.ok(after.altText.length <= MEDIA_LIMITS.altMax, `alt ${after.altText.length}`)
		assert.ok(!/[\u0000\u202e]/.test(after.altText), 'control and bidi characters were stored')
		assert.ok(after.textInImage.length <= MEDIA_LIMITS.textInImageMax)
		assert.equal(after.kind, 'other')
		assert.ok(after.keywords.length <= MEDIA_LIMITS.keywordsMax)
		assert.ok(after.keywords.every((k) => typeof k === 'string' && k.length > 0 && k.length <= 40))
		assert.equal(new Set(after.keywords).size, after.keywords.length)
		assert.ok(after.tags.length <= MEDIA_LIMITS.autoTagsMax)
		assert.ok(after.tags.every((t) => t.label.length <= MEDIA_LIMITS.tagLabelMax))
		assert.equal(after.tagging.status, 'done')
	})

	check('an unusable reply (nothing, a string, a number) is a retryable failure, not a crash and not a stored result', async () => {
		await Promise.all(
			[undefined, null, 'tags: all of them', 42, true].map(async (reply) => {
				const ctx = setup({ tag: async () => reply })
				const [image] = await seed(ctx.ws, {})
				const out = await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
				const after = await get(image._id)
				assert.equal(after.tagging.status, 'pending', `reply ${String(reply)}`)
				assert.equal(after.tagging.attempts, 1)
				assert.deepEqual(after.tags, [])
				assert.equal(out.processed[0].status, 'pending')
			}),
		)
	})

	check('malformed stored documents do not crash a run: junk tags, rejectedTags, keywords, caption, filename, a folder that no longer exists', async () => {
		const ctx = setup()
		const ghostFolder = new ObjectId()
		const docs = await seed(
			ctx.ws,
			{ tags: null, rejectedTags: [1, null, {}, 'kitchen-sink'], caption: null, keywords: 'not an array', folderId: ghostFolder },
			{ tags: 'oops', rejectedTags: 'x', altText: 5, captionEdited: 'yes', textInImage: null, notes: null },
			{ tags: [null, 1, 'x', { slug: '', label: 'No slug' }, { slug: 'ok', label: 'OK', source: 'weird' }], filename: undefined, name: undefined },
		)
		const out = await runTagging(db, ctx.ws, { limit: 3, concurrency: 1 }, ctx.deps)
		assert.deepEqual(out.processed.map((p) => p.status), ['done', 'done', 'done'])
		const [a, b, c] = await Promise.all(docs.map((d) => get(d._id)))
		assert.deepEqual(slugsOf(a), ['technician', 'wrench'], 'the one rejected slug is honoured among the junk')
		assert.deepEqual(slugsOf(b), ['kitchen-sink', 'technician', 'wrench'])
		assert.equal(b.altText, 5, 'an "edited" document keeps what it had')
		assert.deepEqual(c.tags.map((t) => [t.slug, t.source]), [['ok', 'manual'], ['kitchen-sink', 'auto'], ['technician', 'auto'], ['wrench', 'auto']])
		for (const doc of [a, b, c]) {
			assert.equal(doc.tagging.status, 'done')
			assert.ok(Array.isArray(doc.terms) && doc.terms.length > 0)
		}
		assert.equal(ctx.calls.tag[0].input.folderPath === undefined || ctx.calls.tag[0].input.folderPath === '', true, 'a deleted folder has no path')
	})

	check('hostile opts and deps shapes never crash a run, widen it, or switch it on by accident', async () => {
		const ctx = setup()
		await seed(ctx.ws, ...Array.from({ length: 4 }, () => ({})))
		for (const opts of [null, 5, 'abc', [], true, { limit: {} }, { concurrency: [] }, { deadlineMs: -5 }, { ids: 'x' }]) {
			const out = await runTagging(db, ctx.ws, opts, ctx.deps)
			assert.ok(Array.isArray(out.processed) && out.processed.length <= MEDIA_LIMITS.aiBatchMax, `opts ${JSON.stringify(opts)}`)
			assert.equal(typeof out.remaining, 'number')
		}
		// A `configured` that is not a function, and deps that are not objects, mean "not configured".
		const spy = spyDb(db)
		for (const deps of [null, 'deps', 7, {}, { configured: 'yes' }, { configured: null }, { configured: () => 0 }]) {
			assert.deepEqual(await runTagging(spy.db, ctx.ws, { limit: 1 }, deps), { processed: [], remaining: 0, budgetExhausted: false })
			assert.equal(await queueTagging(spy.db, ctx.ws, [new ObjectId()], deps), 0)
			assert.equal(await requeueUntagged(spy.db, ctx.ws, deps), 0)
		}
		assert.equal(spy.ops.length, 0)
	})

	check('an image deleted while the model works: no crash, no resurrection, the result is dropped, the tokens are still recorded', async () => {
		const target = {}
		const ctx = setup({
			tag: async () => {
				await assets.deleteOne({ _id: target.id })
				return vision()
			},
		})
		const [image] = await seed(ctx.ws, {})
		target.id = image._id
		const out = await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		assert.equal(out.processed.length, 1)
		assert.equal(out.processed[0].doc, null, 'doc is null when the image vanished')
		assert.equal(out.processed[0].status, 'done', 'the run still says what it concluded')
		assert.equal(await assets.countDocuments({ workspaceId: ctx.ws }), 0, 'the image came back')
		const c = await counters(ctx.ws, ctx.clock.ms)
		assert.equal(c.ws.inputTokens, 1000, 'the model was called and billed')
	})

	check('an image deleted while its model call fails: reported as the failure the run reached, with no document, and nothing comes back', async () => {
		const target = {}
		const ctx = setup({
			tag: async () => {
				await assets.deleteOne({ _id: target.id })
				throw new TaggerError('refused', 'permanent')
			},
		})
		const [image] = await seed(ctx.ws, {})
		target.id = image._id
		const out = await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		assert.deepEqual(out.processed.map((p) => [p.status, p.doc]), [['failed', null]])
		assert.equal(await assets.countDocuments({ workspaceId: ctx.ws }), 0, 'the image came back')
	})
}

/* -------------------------------------------------------------------------- */
/* The lost update                                                            */
/* -------------------------------------------------------------------------- */

async function personAdds(ws, id, labels) {
	const rules = await T.loadTagRules(db, ws)
	return C.commitAsset(db, ws, id, (doc) => {
		const result = T.applyManualTags(doc.tags, doc.rejectedTags, labels, rules)
		return { tags: result.tags, rejectedTags: result.rejected }
	})
}
const personEdits = (ws, id, change) => C.commitAsset(db, ws, id, () => change)

/** A run whose model call waits at a gate, so a person can act while it works. */
function gated(clock, answer) {
	const gate = deferred()
	const reached = deferred()
	const stub = makeDeps(clock.now, {
		tag: async () => {
			reached.resolve()
			await gate.promise
			return answer()
		},
	})
	return { ...stub, gate, reached }
}

function registerLostUpdate() {
	section('The lost update: a person edits while the model works')

	check('THE LOST-UPDATE CASE: a manual tag, an edited caption and a renamed tag all survive a slow model call, and the vision tags land once', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, {
			tags: [manual('kitchen', 'Kitchen'), manual('old-name', 'Old name')],
			rev: 7,
		})
		const { deps, calls, gate, reached } = gated(clock, () =>
			vision({
				caption: 'MACHINE caption that must lose',
				altText: 'MACHINE alt that must lose',
				tags: [
					{ label: 'Kitchen sink', confidence: 0.95 },
					{ label: 'Old name', confidence: 0.9 },
					{ label: 'Garage door', confidence: 0.8 },
				],
			}),
		)
		const run = runTagging(db, ws, { limit: 1 }, deps)
		await reached.promise
		const during = await get(image._id)
		assert.equal(during.tagging.status, 'running')

		// While the model works, a person: adds a tag, edits the caption, and a tag is renamed.
		await personAdds(ws, image._id, ['Garage door'])
		await personEdits(ws, image._id, { caption: 'Edited by hand', captionEdited: true })
		const renamed = await T.renameTag(db, ws, 'old-name', 'New name')
		assert.equal(renamed.slug, 'new-name')
		const beforeApply = await get(image._id)
		assert.ok(beforeApply.rev >= during.rev + 3)

		gate.resolve()
		const out = await run
		const after = await get(image._id)

		assert.equal(calls.tag.length, 1, 'the model is asked once')
		assert.equal(out.processed[0].status, 'done')
		assert.equal(after.tagging.status, 'done')
		assert.equal(after.tagging.attempts, 1)

		const bySlug = Object.fromEntries(after.tags.map((t) => [t.slug, t]))
		assert.equal(bySlug['garage-door']?.source, 'manual', 'the tag added during the call was lost, or downgraded to automatic')
		assert.equal(bySlug['garage-door']?.label, 'Garage door')
		assert.equal(bySlug['kitchen']?.source, 'manual')
		assert.equal(bySlug['new-name']?.source, 'manual', 'the renamed tag was lost')
		assert.equal(bySlug['new-name']?.label, 'New name')
		assert.equal(bySlug['old-name'], undefined, 'the old name came back (as a manual or a vision tag)')
		assert.equal(bySlug['kitchen-sink']?.via, 'vision', 'the vision tags were not applied')
		assert.equal(after.tags.filter((t) => t.slug === 'garage-door').length, 1, 'the model\'s duplicate of a manual tag')
		assert.deepEqual(
			after.tags.filter((t) => t.source === 'auto').map((t) => t.slug),
			['kitchen-sink'],
			'vision tags must be applied exactly once, and only those not already present',
		)

		assert.equal(after.caption, 'Edited by hand', 'the person\'s caption was overwritten')
		assert.equal(after.altText, '', 'alt text counts as edited together with the caption')
		assert.equal(after.captionEdited, true)

		// The searchable words follow the fresh document, including the tag added meanwhile.
		assert.deepEqual(after.terms, buildTerms(after))
		for (const term of ['garage', 'door', 'new', 'edited', 'kitchen']) assert.ok(after.terms.includes(term), `terms lack ${term}`)
		assert.ok(after.rev > beforeApply.rev, 'applying must bump the revision')
		assert.equal(after.rev, beforeApply.rev + 1)
	})

	check('a tag a person removes during the call is not put back (the fresh rejectedTags are used, not the claim-time copy)', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, { tags: [manual('technician', 'Technician')] })
		const { deps, gate, reached } = gated(clock, () => vision())
		const run = runTagging(db, ws, { limit: 1 }, deps)
		await reached.promise
		await C.commitAsset(db, ws, image._id, (doc) => {
			const result = T.removeTagsBySlug(doc.tags, doc.rejectedTags, ['technician'])
			return { tags: result.tags, rejectedTags: result.rejected }
		})
		gate.resolve()
		await run
		const after = await get(image._id)
		assert.equal(tagOf(after, 'technician'), undefined, 'a removed tag came back')
		assert.deepEqual(after.rejectedTags, ['technician'])
		assert.deepEqual(slugsOf(after), ['kitchen-sink', 'wrench'])
	})

	check('a tag deleted workspace-wide during the call is not re-added (rules are read after the call, not before)', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, { tags: [manual('wrench', 'Wrench')] })
		const { deps, gate, reached } = gated(clock, () => vision())
		const run = runTagging(db, ws, { limit: 1 }, deps)
		await reached.promise
		assert.deepEqual(await T.deleteTag(db, ws, 'wrench'), { affected: 1 })
		await T.writeRule(db, ws, 'technician', { slug: 'tradesperson', label: 'Tradesperson' })
		gate.resolve()
		await run
		const after = await get(image._id)
		assert.equal(tagOf(after, 'wrench'), undefined, 'a deleted tag was re-added by the vision pass')
		assert.deepEqual(after.tags.map((t) => t.slug), ['kitchen-sink', 'tradesperson'])
	})

	check('editing only the alt text during the call protects both the alt text and the caption (they share one flag)', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, { caption: 'Machine caption', altText: 'Machine alt' })
		const { deps, gate, reached } = gated(clock, () => vision())
		const run = runTagging(db, ws, { limit: 1 }, deps)
		await reached.promise
		await personEdits(ws, image._id, { altText: 'Alt typed by a person', captionEdited: true })
		gate.resolve()
		await run
		const after = await get(image._id)
		assert.equal(after.altText, 'Alt typed by a person')
		assert.equal(after.caption, 'Machine caption')
		assert.equal(after.tagging.status, 'done')
	})

	check('a person renaming the image or writing notes during the call is not undone', async () => {
		const { ws, clock } = setup()
		const [image] = await seed(ws, { name: 'photo', notes: '' })
		const { deps, gate, reached } = gated(clock, () => vision())
		const run = runTagging(db, ws, { limit: 1 }, deps)
		await reached.promise
		await personEdits(ws, image._id, { name: 'Renamed by a person', notes: 'Use on the brochure page' })
		gate.resolve()
		await run
		const after = await get(image._id)
		assert.equal(after.name, 'Renamed by a person')
		assert.equal(after.nameKey, 'renamed by a person')
		assert.equal(after.notes, 'Use on the brochure page')
		// "by" and "the" are stopwords and are not indexed; the other words are.
		for (const term of ['renamed', 'person', 'brochure', 'page', 'plumber']) assert.ok(after.terms.includes(term), `terms lack ${term}`)
	})
}

/* -------------------------------------------------------------------------- */
/* Failures                                                                   */
/* -------------------------------------------------------------------------- */

/** One image through one run; returns what a check needs to look at. */
async function oneImage(over, { opts = { limit: 1 }, seedWith = {}, ctx = setup(over) } = {}) {
	const [image] = await seed(ctx.ws, seedWith)
	const out = await runTagging(db, ctx.ws, opts, ctx.deps)
	const [after, c] = await Promise.all([get(image._id), counters(ctx.ws, ctx.clock.ms)])
	return { ...ctx, image, out, after, c }
}

function registerFailures() {
	section('Failures: what each kind does to the image, the run and the budget')

	check('declined (the model refused) -> skipped with reason declined, not retried, budget kept', async () => {
		const r = await oneImage({ tag: async () => { throw new TaggerError('refused', 'declined') } })
		assert.deepEqual(r.after.tagging, { status: 'skipped', attempts: 1, reason: 'declined', at: new Date(r.clock.ms) })
		assert.equal(r.out.processed[0].status, 'skipped')
		assert.deepEqual(r.out.processed[0].doc.tagging, r.after.tagging, 'processed carries the stored document')
		assert.equal(r.c.ws.count, 1, 'the model ran: the unit is spent')
		assert.ok(!('blocked' in r.out))
		const again = await runTagging(db, r.ws, { limit: 1 }, r.deps)
		assert.equal(again.processed.length, 0, 'a refusal must not be retried')
		assert.equal(r.calls.tag.length, 1)
	})

	check('permanent -> failed + "The image could not be read.", never retried', async () => {
		const r = await oneImage({ tag: async () => { throw new TaggerError('bad image', 'permanent') } })
		assert.deepEqual(r.after.tagging, { status: 'failed', attempts: 1, error: TAGGING_ERRORS.unreadable, at: new Date(r.clock.ms) })
		assert.equal(r.out.processed[0].status, 'failed')
		assert.deepEqual(r.out.processed[0].doc.tagging, r.after.tagging)
		assert.equal(r.c.ws.count, 1)
		assert.equal((await runTagging(db, r.ws, { limit: 1 }, r.deps)).processed.length, 0)
	})

	check('a blob that is gone, a bad blob URL and an undecodable image -> failed/unreadable before the model, and the budget is released', async () => {
		const cases = [
			['blob gone', { read: async () => { throw new BlobGoneError() } }],
			['bad blob url', { read: async () => { throw new BlobUrlError() } }],
			['not an image', { read: async () => Buffer.from('this is not an image at all') }],
			['empty bytes', { read: async () => Buffer.alloc(0) }],
			['unsupported', { read: async () => { throw new UnsupportedImageError() } }],
			['bytes but not a Buffer', { read: async () => new Uint8Array([1, 2, 3]) }],
		]
		await Promise.all(
			cases.map(async ([label, over]) => {
				const r = await oneImage(over)
				assert.equal(r.after.tagging.status, 'failed', label)
				assert.equal(r.after.tagging.error, TAGGING_ERRORS.unreadable, label)
				assert.equal(r.after.tagging.attempts, 1, label)
				assert.equal(r.calls.tag.length, 0, `${label}: the model must not be called`)
				assert.equal(countOf(r.c.ws), 0, `${label}: the workspace unit was not released`)
				assert.equal(countOf(r.c.global), 0, `${label}: the global unit was not released`)
				assert.equal(r.out.processed[0].status, 'failed', label)
			}),
		)
	})

	check('retryable: pending while attempts < 3 (no hot retry inside one run), failed + "unavailable" at the cap', async () => {
		const ctx = setup({ tag: async () => { throw new TaggerError('overloaded', 'retryable') } })
		const [image] = await seed(ctx.ws, {})
		const outcomes = []
		for (let run = 1; run <= 3; run++) {
			// One worker: with two, an idle one finding nothing to claim would end the run before a retry could happen.
			const out = await runTagging(db, ctx.ws, { limit: 4, concurrency: 1 }, ctx.deps)
			const doc = await get(image._id)
			outcomes.push([doc.tagging.status, doc.tagging.attempts, ctx.calls.tag.length, out.processed.map((p) => p.status)])
		}
		assert.deepEqual(outcomes, [
			['pending', 1, 1, ['pending']],
			['pending', 2, 2, ['pending']],
			['failed', 3, 3, ['failed']],
		])
		const last = await get(image._id)
		assert.equal(last.tagging.error, TAGGING_ERRORS.unavailable)
		assert.ok(!('leaseUntil' in last.tagging))
		assert.equal((await runTagging(db, ctx.ws, { limit: 4 }, ctx.deps)).processed.length, 0, 'a failed image is not claimed again')
		assert.equal(ctx.calls.tag.length, 3)
		assert.equal((await counters(ctx.ws, ctx.clock.ms)).ws.count, 3, 'each model call spent a unit')
	})

	check('retryable pending is claimable again at once, with its attempts intact', async () => {
		const ctx = setup({ tag: async () => { throw new TaggerError('overloaded', 'retryable') } })
		const [image] = await seed(ctx.ws, {})
		await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		const doc = await get(image._id)
		assert.deepEqual(doc.tagging, { status: 'pending', attempts: 1 })
		// A run with no time to claim anything reports what is still queued: this image, not delayed.
		assert.equal((await runTagging(db, ctx.ws, { deadlineMs: 0 }, ctx.deps)).remaining, 1)
		assert.equal((await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)).processed.length, 1)
		assert.equal((await get(image._id)).tagging.attempts, 2)
	})

	check('a retryable failure is not hot-retried inside the run even while another worker is busy (the queue is the retry, the poll is the spacing)', async () => {
		const ctx = setup({
			tag: async (input) => {
				if (input.filename === 'flaky.jpg') throw new TaggerError('overloaded', 'retryable')
				await sleep(400)
				return vision()
			},
		})
		const [flaky, steady] = await seed(ctx.ws, { filename: 'flaky.jpg' }, { filename: 'steady.jpg' })
		await runTagging(db, ctx.ws, { limit: 4, concurrency: 2 }, ctx.deps)
		assert.equal(ctx.calls.tag.filter((c) => c.input.filename === 'flaky.jpg').length, 1, 'the failing image was tried again inside one run')
		assert.deepEqual((await get(flaky._id)).tagging, { status: 'pending', attempts: 1 })
		assert.equal((await get(steady._id)).tagging.status, 'done')
	})

	check('any other throw is retryable and never escapes: Error, string, null, undefined, objects, hostile errors', async () => {
		const thrown = [
			new Error('boom'),
			new TypeError('x'),
			'a string',
			null,
			undefined,
			42,
			{ weird: true },
			{ kind: 'permanent' },
			Object.assign(new Error('status like'), { status: 429 }),
			Object.assign(new Error('kind like'), { kind: 'config' }),
			hostileError(),
			Symbol.for('sym'),
		]
		const nameOf = (value) => {
			try {
				return String(value?.message ?? value)
			} catch {
				return 'a hostile error'
			}
		}
		await Promise.all(
			thrown.map(async (value) => {
				const r = await oneImage({ tag: async () => { throw value } })
				assert.equal(r.after.tagging.status, 'pending', `thrown ${nameOf(value)}`)
				assert.equal(r.after.tagging.attempts, 1)
				assert.ok(!('blocked' in r.out), 'only a real TaggerError can block a run')
				assert.equal(r.c.ws.count, 1)
			}),
		)
	})

	check('errors from another copy of a module are recognised by class name (a bundler can load a module twice); a look-alike under another name is not', async () => {
		const copyOf = (name, props = {}) => Object.assign(new Error(`from another copy of ${name}`), { name, ...props })
		const viaModel = [
			['TaggerError permanent', copyOf('TaggerError', { kind: 'permanent' }), 'failed', TAGGING_ERRORS.unreadable],
			['TaggerError declined', copyOf('TaggerError', { kind: 'declined' }), 'skipped', undefined],
			['TaggerError retryable', copyOf('TaggerError', { kind: 'retryable' }), 'pending', undefined],
			['look-alike permanent', copyOf('OtherError', { kind: 'permanent' }), 'pending', undefined],
			['look-alike config', copyOf('OtherError', { kind: 'config' }), 'pending', undefined],
		]
		await Promise.all(
			viaModel.map(async ([label, error, status, stored]) => {
				const r = await oneImage({ tag: async () => { throw error } })
				assert.equal(r.after.tagging.status, status, label)
				assert.equal(r.after.tagging.error, stored, label)
				assert.ok(!('blocked' in r.out), `${label}: it must not block the run`)
			}),
		)
		const config = await oneImage({ tag: async () => { throw copyOf('TaggerError', { kind: 'config' }) } })
		assert.equal(config.out.blocked.kind, 'config')
		const limited = await oneImage({ tag: async () => { throw copyOf('TaggerError', { kind: 'rate_limited', retryAfterMs: 4_000 }) } })
		assert.deepEqual([limited.out.blocked.kind, limited.out.blocked.retryAfterMs], ['rate_limited', 4_000])
		await Promise.all(
			['BlobGoneError', 'BlobUrlError', 'BlobTooLargeError', 'UnsupportedImageError'].map(async (name) => {
				const r = await oneImage({ read: async () => { throw copyOf(name) } })
				assert.deepEqual([r.after.tagging.status, r.after.tagging.error], ['failed', TAGGING_ERRORS.unreadable], name)
				assert.equal(countOf(r.c.ws), 0, `${name}: the unit was not given back`)
			}),
		)
		const lookalike = await oneImage({ read: async () => { throw copyOf('BlobGone') } })
		assert.equal(lookalike.after.tagging.status, 'pending', 'a look-alike name must not be read as a permanent failure')
	})

	check('what is logged about an error is bounded and on one line, however long the error is and whatever it contains', async () => {
		const LS = String.fromCharCode(0x2028)
		const PS = String.fromCharCode(0x2029)
		const breaks = ['\r', '\n', LS, PS]
		// The token comes first: only the start of the text survives the length bound, so only there can redaction be seen.
		const huge = `vercel_blob_rw_abc123SECRET first line\nsecond line\r${'x'.repeat(1_000_000)}${LS}tail`
		const r = await oneImage({ tag: async () => { throw new Error(huge) } })
		assert.equal(r.after.tagging.status, 'pending')
		const lines = allLogs.filter((line) => line.includes(hex(r.image._id)))
		assert.ok(lines.length >= 1, 'the failure was not logged')
		for (const line of lines) {
			assert.ok(line.length < 600, `a log line of ${line.length} characters`)
			assert.ok(!breaks.some((character) => line.includes(character)), 'a line break reached a log line')
			assert.ok(!line.includes('abc123SECRET'), 'a blob token reached a log line')
		}
		assert.ok(!JSON.stringify(r.after).includes('first line'), 'error text was stored')
	})

	check('a seam that throws synchronously, or returns a rejected promise, is the same retryable failure', async () => {
		const ctx = setup()
		ctx.deps.tag = () => {
			throw new Error('sync boom')
		}
		const [a] = await seed(ctx.ws, {})
		await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		assert.equal((await get(a._id)).tagging.status, 'pending')
		const ctx2 = setup()
		ctx2.deps.read = () => {
			throw new Error('sync read boom')
		}
		const [b] = await seed(ctx2.ws, {})
		await runTagging(db, ctx2.ws, { limit: 1 }, ctx2.deps)
		const after = await get(b._id)
		assert.equal(after.tagging.status, 'pending')
		assert.equal(after.tagging.attempts, 1, 'a failed read of a stored image counts as an attempt, or it would be retried forever')
		assert.equal(countOf((await counters(ctx2.ws, ctx2.clock.ms)).ws), 0, 'a failed read never reached the model: the unit goes back')
	})

	check('a blob that never downloads still ends in failed (reads count as attempts), with the budget released each time', async () => {
		const ctx = setup({ read: async () => { throw new Error('connection reset') } })
		const [image] = await seed(ctx.ws, {})
		for (let i = 0; i < 3; i++) await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		const doc = await get(image._id)
		assert.equal(doc.tagging.status, 'failed')
		assert.equal(doc.tagging.error, TAGGING_ERRORS.unavailable)
		assert.equal(doc.tagging.attempts, 3)
		assert.equal(ctx.calls.tag.length, 0)
		assert.equal(countOf((await counters(ctx.ws, ctx.clock.ms)).ws), 0)
	})

	check('rate_limited: pending, attempts not counted, retryAfter set, budget refunded, the run stops, blocked is reported', async () => {
		const ctx = setup({ tag: async () => { throw new TaggerError('429', 'rate_limited', 7_000) } })
		const images = await seed(ctx.ws, {}, {}, {})
		const out = await runTagging(db, ctx.ws, { limit: 4, concurrency: 1 }, ctx.deps)
		assert.equal(ctx.calls.tag.length, 1, 'the run must stop after a 429, not hammer the provider')
		assert.deepEqual(out.blocked, {
			kind: 'rate_limited',
			message: out.blocked.message,
			retryAfterMs: 7_000,
		})
		assert.ok(typeof out.blocked.message === 'string' && out.blocked.message.length > 0)
		const docs = await Promise.all(images.map((d) => get(d._id)))
		const delayed = docs.filter((d) => 'retryAfter' in d.tagging)
		assert.equal(delayed.length, 1, 'exactly the image the provider refused is delayed')
		assert.deepEqual(delayed[0].tagging, { status: 'pending', attempts: 0, retryAfter: new Date(ctx.clock.ms + 7_000) })
		for (const untouched of docs.filter((d) => !('retryAfter' in d.tagging))) assert.deepEqual(untouched.tagging, { status: 'pending', attempts: 0 })
		assert.equal(out.remaining, 3, 'a delayed image is still waiting')
		assert.equal(out.budgetExhausted, false)
		const c = await counters(ctx.ws, ctx.clock.ms)
		assert.equal(countOf(c.ws), 0, 'the workspace unit was not refunded')
		assert.equal(countOf(c.global), 0, 'the global unit was not refunded')
		assert.deepEqual(out.processed.map((p) => p.status), ['pending'])
		await assertTidy(ctx.ws)

		// Not claimable until retryAfter passes: the others are, so give the run only the delayed one.
		const delayedId = delayed[0]._id
		const only = await runTagging(db, ctx.ws, { ids: [delayedId], limit: 1 }, ctx.deps)
		assert.equal(only.processed.length, 0)
		assert.equal(ctx.calls.tag.length, 1, 'an image still inside its retryAfter reached the model')
		ctx.clock.advance(6_999)
		await runTagging(db, ctx.ws, { ids: [delayedId], limit: 1 }, ctx.deps)
		assert.equal(ctx.calls.tag.length, 1, 'claimed 1 ms before retryAfter')
		ctx.clock.advance(1)
		const ok = makeDeps(ctx.clock.now)
		const later = await runTagging(db, ctx.ws, { ids: [delayedId], limit: 1 }, ok.deps)
		assert.deepEqual(later.processed.map((p) => p.status), ['done'])
		const finished = await get(delayedId)
		assert.equal(finished.tagging.attempts, 1, 'only the call that ran counts')
		assert.ok(!('retryAfter' in finished.tagging))
	})

	check('rate_limited waits are bounded: a missing, zero, negative, NaN or huge retryAfterMs becomes the default or the cap', async () => {
		const cases = [
			[undefined, MEDIA_LIMITS.aiRetryAfterDefaultMs],
			[0, MEDIA_LIMITS.aiRetryAfterDefaultMs],
			[-5, MEDIA_LIMITS.aiRetryAfterDefaultMs],
			[Number.NaN, MEDIA_LIMITS.aiRetryAfterDefaultMs],
			['30', MEDIA_LIMITS.aiRetryAfterDefaultMs],
			[1_234, 1_234],
			[10 ** 12, MEDIA_LIMITS.aiRetryAfterMaxMs],
			[Infinity, MEDIA_LIMITS.aiRetryAfterDefaultMs],
		]
		await Promise.all(
			cases.map(async ([asked, expected]) => {
				const r = await oneImage({ tag: async () => { throw new TaggerError('429', 'rate_limited', asked) } })
				assert.equal(r.out.blocked.retryAfterMs, expected, `asked ${String(asked)}`)
				sameTime(r.after.tagging.retryAfter, r.clock.ms + expected, `asked ${String(asked)}`)
			}),
		)
	})

	check('config -> pending, attempts not counted, budget refunded, the run stops, blocked reports the credentials message', async () => {
		const ctx = setup({ tag: async () => { throw new TaggerError('401', 'config') } })
		const images = await seed(ctx.ws, {}, {}, {})
		const out = await runTagging(db, ctx.ws, { limit: 4, concurrency: 1 }, ctx.deps)
		assert.equal(ctx.calls.tag.length, 1)
		assert.deepEqual(out.blocked, { kind: 'config', message: TAGGING_ERRORS.credentials })
		const docs = await Promise.all(images.map((d) => get(d._id)))
		for (const doc of docs) assert.deepEqual(doc.tagging, { status: 'pending', attempts: 0 })
		assert.equal(out.remaining, 3)
		const c = await counters(ctx.ws, ctx.clock.ms)
		assert.equal(countOf(c.ws), 0)
		assert.equal(countOf(c.global), 0)
		assert.deepEqual(out.processed.map((p) => p.status), ['pending'])
		// Nothing was stored that a person could read as a reason.
		await assertTidy(ctx.ws)
	})

	check('with two workers, a block found by one stops the other from calling the model', async () => {
		const gate = deferred()
		let n = 0
		const ctx = setup({
			tag: async () => {
				const mine = ++n
				if (mine === 1) {
					await sleep(30)
					throw new TaggerError('401', 'config')
				}
				await gate.promise
				return vision()
			},
		})
		await seed(ctx.ws, {}, {}, {}, {})
		setTimeout(() => gate.resolve(), 400)
		const out = await runTagging(db, ctx.ws, { limit: 4, concurrency: 2 }, ctx.deps)
		assert.equal(out.blocked.kind, 'config')
		assert.ok(ctx.calls.tag.length <= 2, `calls ${ctx.calls.tag.length}`)
		assert.equal(out.remaining, 4 - out.processed.filter((p) => p.status === 'done').length)
		await assertTidy(ctx.ws)
	})

	check('an image still being read when another finds the provider refusing never reaches the model: it is released (attempt and budget unit given back)', async () => {
		const reading = deferred()
		const refused = deferred()
		const ctx = setup({
			// The refusal is held back until the slow image is demonstrably in flight (a worker can be slow to get its
			// claim, and then there would be nothing to release), and the slow image reaches the model stage only after it.
			read: async (url) => {
				if (url.endsWith('/slow.jpg')) {
					reading.resolve()
					await Promise.race([refused.promise, sleep(8_000)])
					await sleep(150)
				}
				return PNG
			},
			tag: async () => {
				await Promise.race([reading.promise, sleep(8_000)])
				refused.resolve()
				throw new TaggerError('401', 'config')
			},
		})
		const images = await seed(ctx.ws, { url: 'https://example.invalid/proof/fast.jpg' }, { url: 'https://example.invalid/proof/slow.jpg' })
		const out = await runTagging(db, ctx.ws, { limit: 2, concurrency: 2 }, ctx.deps)
		assert.equal(out.blocked.kind, 'config')
		assert.equal(ctx.calls.read.length, 2, 'the slow image was never in flight, so this check proved nothing')
		assert.equal(ctx.calls.tag.length, 1, 'an image reached the model after the run had been refused')
		for (const image of images) assert.deepEqual((await get(image._id)).tagging, { status: 'pending', attempts: 0 }, image.url)
		assert.deepEqual(out.processed.map((p) => p.status), ['pending'], 'only the refused image is a verdict; the released one is not reported')
		const c = await counters(ctx.ws, ctx.clock.ms)
		assert.equal(countOf(c.ws), 0, 'both units must be given back')
		assert.equal(countOf(c.global), 0)
		assert.equal(out.remaining, 2)
	})

	check('config wins over a rate limit when both are found in one run', async () => {
		let n = 0
		const ctx = setup({
			tag: async () => {
				n++
				throw n === 1 ? new TaggerError('429', 'rate_limited', 5_000) : new TaggerError('401', 'config')
			},
		})
		await seed(ctx.ws, {}, {})
		const out = await runTagging(db, ctx.ws, { limit: 2, concurrency: 2 }, ctx.deps)
		if (ctx.calls.tag.length === 2) assert.equal(out.blocked.kind, 'config')
		else assert.equal(out.blocked.kind, 'rate_limited')
	})

	check('a failing model call costs the image nothing it did not earn: failed images keep their tags and caption', async () => {
		const ctx = setup({ tag: async () => { throw new TaggerError('nope', 'permanent') } })
		const [image] = await seed(ctx.ws, { tags: [manual('garage')], caption: 'Mine', captionEdited: true, keywords: ['x'] })
		await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		const after = await get(image._id)
		assert.deepEqual(after.tags, image.tags)
		assert.equal(after.caption, 'Mine')
		assert.deepEqual(after.keywords, ['x'])
	})

	check('a failure on the image the first worker took does not stop the second image from being tagged (ordinary failures are per image)', async () => {
		let n = 0
		const ctx = setup({
			tag: async () => {
				if (++n === 1) throw new TaggerError('bad', 'permanent')
				return vision()
			},
		})
		const [a, b] = await seed(ctx.ws, {}, {})
		const out = await runTagging(db, ctx.ws, { limit: 2, concurrency: 1 }, ctx.deps)
		assert.deepEqual(out.processed.map((p) => p.status), ['failed', 'done'])
		assert.equal((await get(a._id)).tagging.status, 'failed')
		assert.equal((await get(b._id)).tagging.status, 'done')
	})

	check('every error ever stored is exactly one of the four fixed messages, and the raw error is logged without the key', async () => {
		const KEY = 'sk-ant-api03-PROOFSECRETPROOFSECRET'
		const RAW = 'RAWBODY-should-never-be-stored https://api.example.test/v1/messages?id=req_123'
		setEnv({ ANTHROPIC_API_KEY: KEY })
		// Three kinds that do not stop a run share one account; the two that do get their own.
		const byName = {
			declined: new TaggerError(`declined ${RAW}`, 'declined'),
			permanent: new TaggerError(`permanent ${RAW}`, 'permanent'),
			unknown: new Error(`unknown ${RAW} ${KEY} Bearer abc.def.ghi`),
		}
		const shared = setup({
			tag: async (input) => {
				throw byName[input.filename.split('.')[0]]
			},
		})
		const docs = await seed(shared.ws, { filename: 'declined.jpg' }, { filename: 'permanent.jpg' }, { filename: 'unknown.jpg' })
		for (let i = 0; i < 3; i++) await runTagging(db, shared.ws, { limit: 3 }, shared.deps)
		await assertTidy(shared.ws)
		const states = Object.fromEntries((await Promise.all(docs.map((d) => get(d._id)))).map((d) => [d.filename, d.tagging]))
		assert.deepEqual(
			[states['declined.jpg'].status, states['permanent.jpg'].error, states['unknown.jpg'].status, states['unknown.jpg'].error],
			['skipped', TAGGING_ERRORS.unreadable, 'failed', TAGGING_ERRORS.unavailable],
		)
		const blocking = []
		for (const error of [new TaggerError(`rate ${RAW}`, 'rate_limited', 1_000), new TaggerError(`config ${RAW}`, 'config')]) {
			const one = setup({ tag: async () => { throw error } })
			blocking.push(await seed(one.ws, {}), one)
			await runTagging(db, one.ws, { limit: 3 }, one.deps)
			one.clock.advance(MEDIA_LIMITS.aiRetryAfterMaxMs)
			await runTagging(db, one.ws, { limit: 3 }, one.deps)
			await assertTidy(one.ws)
		}
		for (const doc of await Promise.all(docs.map((d) => get(d._id)))) {
			const stored = JSON.stringify(doc)
			assert.ok(!stored.includes('RAWBODY'), 'raw error text was stored')
			assert.ok(!stored.includes(KEY), 'the key was stored')
			assert.ok(!stored.includes('api.example.test'), 'a hostname from an error was stored')
		}
		const text = allLogs.join('\n')
		assert.ok(allLogs.some((line) => line.startsWith('[media]')), 'nothing was logged')
		assert.ok(!text.includes(KEY), 'the API key reached a log line')
		assert.ok(!/Bearer\s+abc/.test(text), 'a bearer token reached a log line')
		assert.ok(allLogs.every((line) => !/[\u0000-\u0008\u000b-\u001f]/.test(line)), 'a control character reached a log line')
		void blocking
	}, { seq: true })
}

/* -------------------------------------------------------------------------- */
/* Infrastructure failures                                                    */
/* -------------------------------------------------------------------------- */

function registerInfrastructure() {
	section('Infrastructure failures: the database misbehaves')

	check('a failing claim is thrown when nothing was processed, and nothing is left half done', async () => {
		const ctx = setup()
		const [image] = await seed(ctx.ws, {})
		const broken = spyDb(db, (entry) => {
			if (entry.collection === 'mediaAssets' && entry.op === 'findOneAndUpdate') return Promise.reject(new Error('connection reset'))
		})
		await assert.rejects(runTagging(broken.db, ctx.ws, { limit: 2 }, ctx.deps), /connection reset/)
		assert.deepEqual((await get(image._id)).tagging, { status: 'pending', attempts: 0 })
		assert.ok(allLogs.some((line) => line.includes('could not claim')), 'the failure was not logged')
	})

	check('a failing budget call hands the claim back and is thrown, never read as "budget exhausted"', async () => {
		const ctx = setup()
		const [image] = await seed(ctx.ws, {})
		const broken = spyDb(db, (entry) => {
			if (entry.collection === 'mediaAiUsage' && entry.op === 'updateOne' && entry.args[2]?.upsert) return Promise.reject(new Error('reserve failed'))
		})
		await assert.rejects(runTagging(broken.db, ctx.ws, { limit: 2 }, ctx.deps), /reserve failed/)
		assert.deepEqual((await get(image._id)).tagging, { status: 'pending', attempts: 0 }, 'the claim was not handed back')
		assert.equal(ctx.calls.tag.length, 0)
	})

	check('a failure after some images were done is not thrown: the run reports what it did', async () => {
		const ctx = setup()
		await seed(ctx.ws, {}, {}, {})
		let claims = 0
		const flaky = spyDb(db, (entry) => {
			if (entry.collection === 'mediaAssets' && entry.op === 'findOneAndUpdate' && ++claims === 2) return Promise.reject(new Error('connection reset'))
		})
		const out = await runTagging(flaky.db, ctx.ws, { limit: 3, concurrency: 1 }, ctx.deps)
		assert.equal(out.processed.length, 1)
		assert.equal(out.processed[0].status, 'done')
		assert.equal(out.remaining, 2)
		assert.equal(out.budgetExhausted, false)
	})

	check('writes that never land (the revision keeps moving) do not escape: the image keeps its lease, expires, and is tagged on the next run', async () => {
		const ctx = setup()
		const [image] = await seed(ctx.ws, {})
		const contested = spyDb(db, (entry) => {
			if (entry.collection === 'mediaAssets' && entry.op === 'updateOne' && entry.args[1]?.$inc?.rev === 1)
				return Promise.resolve({ acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null })
		})
		const out = await runTagging(contested.db, ctx.ws, { limit: 1 }, ctx.deps)
		assert.deepEqual(out.processed.map((p) => [p.status, p.doc]), [['running', null]], 'nothing could be written: the image is still running')
		const stuck = await get(image._id)
		assert.equal(stuck.tagging.status, 'running', 'with no write possible the lease is all there is')
		assert.equal(stuck.tagging.attempts, 1)
		assert.equal(stuck.caption, '')
		assert.equal(countOf((await counters(ctx.ws, ctx.clock.ms)).ws), 1, 'the model was called: the unit stays spent')

		// The database recovers and the lease has run out: the image is reclaimed and finished.
		ctx.clock.advance(MEDIA_LIMITS.aiLeaseMs + 1)
		const healed = await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		assert.equal(healed.processed[0].status, 'done')
		assert.equal((await get(image._id)).tagging.attempts, 2)
	})

	check('a failing count of what is left, after images were done, is not thrown: the work is reported and the client is told to ask again; with nothing done it is thrown', async () => {
		const failingCount = (entry) => {
			if (entry.collection === 'mediaAssets' && entry.op === 'countDocuments') return Promise.reject(new Error('count failed'))
		}
		const ctx = setup()
		await seed(ctx.ws, {}, {})
		const out = await runTagging(spyDb(db, failingCount).db, ctx.ws, { limit: 1 }, ctx.deps)
		assert.deepEqual(out.processed.map((p) => p.status), ['done'], 'a finished image was thrown away with the failed count')
		assert.ok(out.remaining >= 1, `remaining ${out.remaining}: an unknown count must not read as "nothing left"`)
		assert.deepEqual((await docsOf(ctx.ws)).map((d) => d.tagging.status).sort(), ['done', 'pending'])
		assert.ok(allLogs.some((line) => line.includes('could not count')), 'the failure was not logged')

		const idle = setup()
		await assert.rejects(runTagging(spyDb(db, failingCount).db, idle.ws, { limit: 1 }, idle.deps), /count failed/)
	})

	check('a failing sweep, or a failing first look at the budget, is thrown before anything is claimed or sent to the model', async () => {
		const cases = [
			['the sweep', (entry) => (entry.collection === 'mediaAssets' && entry.op === 'updateMany' ? Promise.reject(new Error('sweep failed')) : undefined), /sweep failed/],
			[
				'the budget read',
				(entry) => (entry.collection === 'mediaAiUsage' && entry.op === 'find' ? { toArray: () => Promise.reject(new Error('budget read failed')) } : undefined),
				/budget read failed/,
			],
		]
		for (const [label, intercept, pattern] of cases) {
			const ctx = setup()
			const [image] = await seed(ctx.ws, {})
			await assert.rejects(runTagging(spyDb(db, intercept).db, ctx.ws, { limit: 2 }, ctx.deps), pattern, label)
			assert.equal(ctx.calls.tag.length + ctx.calls.read.length, 0, `${label}: the run went on`)
			assert.deepEqual((await get(image._id)).tagging, { status: 'pending', attempts: 0 }, `${label}: the image was touched`)
		}
	})

	check('an unreadable tag vocabulary or folder list does not stop tagging: the model simply gets no hints', async () => {
		const ctx = setup()
		const folder = await makeFolder(ctx.ws, 'Clients')
		await seed(ctx.ws, { tags: [manual('van', 'Van')], tagging: { status: 'done', attempts: 1 } })
		const [image] = await seed(ctx.ws, { folderId: folder._id })
		const unreadable = { toArray: () => Promise.reject(new Error('read failed')) }
		const flaky = spyDb(db, (entry) => {
			if (entry.collection === 'mediaAssets' && entry.op === 'aggregate') return unreadable
			if (entry.collection === 'mediaFolders' && entry.op === 'find') return unreadable
		})
		const out = await runTagging(flaky.db, ctx.ws, { limit: 1 }, ctx.deps)
		assert.deepEqual(out.processed.map((p) => p.status), ['done'])
		assert.deepEqual(ctx.calls.tag[0].input.knownTags, [], 'no vocabulary, no hints')
		assert.ok(!ctx.calls.tag[0].input.folderPath, 'no folder list, no folder path')
		assert.equal((await get(image._id)).tagging.status, 'done')
		assert.ok(allLogs.some((line) => line.includes('tag vocabulary')), 'the vocabulary failure was not logged')
		assert.ok(allLogs.some((line) => line.includes('the folders')), 'the folder failure was not logged')
	})

	check('a tag-rules read that fails after the model call applies nothing (a deleted tag could come back): the image is retried, and the call is still paid for', async () => {
		const ctx = setup()
		const [image] = await seed(ctx.ws, {})
		const unreadable = { sort: () => unreadable, limit: () => unreadable, toArray: () => Promise.reject(new Error('rules unavailable')) }
		const flaky = spyDb(db, (entry) => {
			if (entry.collection === 'mediaTagRules' && entry.op === 'find') return unreadable
		})
		const out = await runTagging(flaky.db, ctx.ws, { limit: 1 }, ctx.deps)
		const after = await get(image._id)
		assert.deepEqual(after.tagging, { status: 'pending', attempts: 1 })
		assert.deepEqual(after.tags, [])
		assert.equal(after.caption, '')
		assert.deepEqual(out.processed.map((p) => p.status), ['pending'])
		const c = await counters(ctx.ws, ctx.clock.ms)
		assert.equal(c.ws.count, 1, 'the model was called: the unit stays spent')
		assert.equal(c.ws.inputTokens, 1000, 'and its tokens are recorded')
		const healed = await runTagging(db, ctx.ws, { limit: 1 }, ctx.deps)
		assert.deepEqual(healed.processed.map((p) => p.status), ['done'])
		assert.equal((await get(image._id)).tagging.attempts, 2)
	})
}

/* -------------------------------------------------------------------------- */
/* Time                                                                       */
/* -------------------------------------------------------------------------- */

function registerTime() {
	section('Time budget')

	check('reads get the time left capped at 10 s, and the model call min(remaining, 25 s), measured after the read', async () => {
		const cases = [
			// [deadlineMs, clock moves during the read, expected read timeout, expected call timeout]
			[undefined, 0, 10_000, 25_000],
			[30_000, 0, 10_000, 25_000],
			[12_000, 0, 10_000, 12_000],
			[6_000, 0, 6_000, 6_000],
			[12_000, 4_000, 10_000, 8_000],
			[40_000, 20_000, 10_000, 20_000],
			[500, 0, 500, 500],
		]
		await Promise.all(
			cases.map(async ([deadlineMs, spent, readMs, callMs]) => {
				const ctx = setup()
				const clock = ctx.clock
				const { deps, calls } = makeDeps(clock.now, { read: async () => { clock.advance(spent); return PNG } })
				await seed(ctx.ws, {})
				await runTagging(db, ctx.ws, { limit: 1, ...(deadlineMs === undefined ? {} : { deadlineMs }) }, deps)
				assert.equal(calls.read[0].timeoutMs, readMs, `deadline ${deadlineMs}: read timeout`)
				assert.equal(calls.tag[0].timeoutMs, callMs, `deadline ${deadlineMs}: model call timeout`)
			}),
		)
	})

	check('no time left after the read: the image is released (pending, attempts back, budget refunded) and the model is never called', async () => {
		const ctx = setup()
		const { deps, calls } = makeDeps(ctx.clock.now, { read: async () => { ctx.clock.advance(5_000); return PNG } })
		const [image] = await seed(ctx.ws, {})
		const out = await runTagging(db, ctx.ws, { limit: 1, deadlineMs: 3_000 }, deps)
		assert.equal(calls.tag.length, 0)
		assert.deepEqual((await get(image._id)).tagging, { status: 'pending', attempts: 0 })
		assert.equal(countOf((await counters(ctx.ws, ctx.clock.now().getTime())).ws), 0)
		assert.equal(out.processed.length, 0, 'an image released unfinished is not a verdict')
		assert.equal(out.remaining, 1)
		await assertTidy(ctx.ws)
	})

	check('the deadline passing during the model call: a retryable failure is released (no attempt, refund); a permanent one and a result still count', async () => {
		const run = async (over) => {
			const ctx = setup()
			const { deps } = makeDeps(ctx.clock.now, { tag: async (...args) => { ctx.clock.advance(5_000); return over(...args) } })
			const [image] = await seed(ctx.ws, {})
			const out = await runTagging(db, ctx.ws, { limit: 1, deadlineMs: 3_000 }, deps)
			return { ctx, out, doc: await get(image._id), c: await counters(ctx.ws, ctx.clock.ms) }
		}
		const [timedOut, permanent, finished, limited] = await Promise.all([
			run(() => { throw new TaggerError('The AI request was cancelled', 'retryable') }),
			run(() => { throw new TaggerError('bad', 'permanent') }),
			run(() => vision()),
			run(() => { throw new TaggerError('429', 'rate_limited', 4_000) }),
		])
		assert.deepEqual(timedOut.doc.tagging, { status: 'pending', attempts: 0 }, 'a call cut off by the run deadline is not the image\'s fault')
		assert.equal(countOf(timedOut.c.ws), 0, 'its budget was not refunded')
		assert.equal(timedOut.out.processed.length, 0)

		assert.equal(permanent.doc.tagging.status, 'failed')
		assert.equal(permanent.doc.tagging.error, TAGGING_ERRORS.unreadable)

		assert.equal(finished.doc.tagging.status, 'done', 'a result that arrived is applied even after the deadline')
		assert.equal(finished.c.ws.count, 1)

		assert.equal(limited.out.blocked.kind, 'rate_limited')
		assert.deepEqual(limited.doc.tagging.attempts, 0)
	})

	check('a retryable failure well before the deadline counts as an attempt (only running out of time is free)', async () => {
		const ctx = setup({ tag: async () => { throw new TaggerError('overloaded', 'retryable') } })
		const [image] = await seed(ctx.ws, {})
		await runTagging(db, ctx.ws, { limit: 1, deadlineMs: 30_000 }, ctx.deps)
		assert.deepEqual((await get(image._id)).tagging, { status: 'pending', attempts: 1 })
	})

	check('no image is claimed after the deadline: the rest of the queue stays exactly as it was', async () => {
		const ctx = setup()
		const clock = ctx.clock
		const { deps, calls } = makeDeps(clock.now, { tag: async () => { clock.advance(1_500); return vision() } })
		const images = await seed(ctx.ws, {}, {}, {}, {})
		const untouched = await Promise.all(images.slice(1).map((d) => get(d._id)))
		const out = await runTagging(db, ctx.ws, { limit: 4, concurrency: 1, deadlineMs: 1_000 }, deps)
		assert.equal(calls.tag.length, 1)
		assert.equal(out.processed.length, 1)
		assert.equal(out.remaining, 3)
		assert.deepEqual(await Promise.all(images.slice(1).map((d) => get(d._id))), untouched, 'an unclaimed image was touched')
		assert.equal(countOf((await counters(ctx.ws, clock.ms)).ws), 1, 'only the one image paid')
	})

	check('deadlineMs of 0 claims nothing at all; junk deadlines mean the default of 40 s', async () => {
		const zero = setup()
		await seed(zero.ws, {})
		const none = await runTagging(db, zero.ws, { deadlineMs: 0 }, zero.deps)
		assert.equal(none.processed.length, 0)
		assert.equal(zero.calls.tag.length, 0)
		await Promise.all(
			[Number.NaN, 'soon', null, Infinity, {}].map(async (junk) => {
				const ctx = setup()
				await seed(ctx.ws, {})
				await runTagging(db, ctx.ws, { limit: 1, deadlineMs: junk }, ctx.deps)
				assert.equal(ctx.calls.tag[0]?.timeoutMs, MEDIA_LIMITS.aiClientTimeoutMs, `deadline ${String(junk)}`)
				assert.equal(ctx.calls.read[0]?.timeoutMs, 10_000)
			}),
		)
	})

	/*
	 * The next four measure real elapsed time, and a database round trip lasts as long as the network says: a budget
	 * that is plenty at 50 ms a call is nothing at 1 s, and then the model is never called, so nothing about it can be
	 * observed. So every attempt sizes its budget from a fresh latency reading, and a scenario whose premise did not hold
	 * (the call it is about never started) throws SlowDatabase instead of failing and is repeated with more time. Only a
	 * scenario that DID start and then misbehaves is a failure.
	 */
	class SlowDatabase extends Error {}

	const roundTrip = async () => {
		const times = []
		for (let i = 0; i < 3; i++) {
			const sent = Date.now()
			await db.command({ ping: 1 })
			times.push(Date.now() - sent)
		}
		return times.sort((a, b) => a - b)[1]
	}

	/**
	 * `preMs`: room for the database work a run does before the model is called (about eight round trips, doubled on
	 * every retry). `afterMs`: how long after its deadline a run may take to wrap up (settle, refund, count: about five).
	 * A budget is never above 20 s: the model call is capped at 25 s whatever the budget says.
	 */
	const realTime = async (scenario) => {
		let slow
		for (let attempt = 0; attempt < 3; attempt++) {
			const rtt = await roundTrip()
			try {
				return await scenario({ rtt, preMs: 14 * rtt * 2 ** attempt, afterMs: 2_000 + 10 * rtt })
			} catch (error) {
				if (!(error instanceof SlowDatabase)) throw error
				slow = error
			}
		}
		throw slow
	}

	/** A model call that never answers; only the signal ends it. */
	const hangs = (input, { signal }) =>
		new Promise((resolve, reject) => {
			const timer = setTimeout(() => resolve(vision()), 60_000)
			signal.addEventListener('abort', () => {
				clearTimeout(timer)
				reject(new TaggerError('The AI request was cancelled', 'retryable'))
			})
		})

	check('real time: a model call that hangs is aborted at the deadline, the image is released, and the run returns promptly', async () => {
		await realTime(async ({ preMs, afterMs }) => {
			const dayMs = newDay()
			const ws = newWs()
			const deadlineMs = Math.min(20_000, preMs + 3_000)
			const { deps, calls } = makeDeps(liveClock(dayMs), { tag: hangs })
			const [image] = await seed(ws, {})
			const started = Date.now()
			const out = await runTagging(db, ws, { limit: 1, deadlineMs }, deps)
			const elapsed = Date.now() - started
			if (calls.tag.length === 0) throw new SlowDatabase('the model call never started: the database was too slow for this budget')
			assert.ok(elapsed >= deadlineMs - 300, `it returned after ${elapsed} ms, before the ${deadlineMs} ms deadline: the call was not given the time left`)
			assert.ok(elapsed < deadlineMs + afterMs, `the run took ${elapsed} ms for a ${deadlineMs} ms budget`)
			assert.equal(calls.tag[0].signal.aborted, true)
			assert.deepEqual((await get(image._id)).tagging, { status: 'pending', attempts: 0 })
			assert.equal(countOf((await counters(ws, dayMs)).ws), 0)
			assert.equal(out.processed.length, 0)
			assert.equal(out.remaining, 1)
		})
	}, { seq: true })

	check('real time: a model seam that ignores its signal cannot hold the run past the deadline, and its late answer is discarded', async () => {
		await realTime(async ({ preMs, afterMs }) => {
			const dayMs = newDay()
			const ws = newWs()
			const finished = deferred()
			const deadlineMs = Math.min(20_000, preMs + 2_000)
			// The seam answers well after the run had to return, whenever it was called.
			const lateMs = deadlineMs + afterMs + 2_000
			const { deps, calls } = makeDeps(liveClock(dayMs), {
				tag: async () => {
					await sleep(lateMs)
					finished.resolve()
					return vision({ caption: 'LATE ANSWER' })
				},
			})
			const [image] = await seed(ws, {})
			const started = Date.now()
			await runTagging(db, ws, { limit: 1, deadlineMs }, deps)
			const elapsed = Date.now() - started
			if (calls.tag.length === 0) throw new SlowDatabase('the model call never started: the database was too slow for this budget')
			assert.ok(elapsed < deadlineMs + afterMs, `the run took ${elapsed} ms for a ${deadlineMs} ms budget: it waited for a seam that ignores its signal`)
			assert.deepEqual((await get(image._id)).tagging, { status: 'pending', attempts: 0 })
			await finished.promise
			await sleep(300)
			const later = await get(image._id)
			assert.equal(later.caption, '', 'the abandoned call wrote its answer after all')
			assert.deepEqual(later.tagging, { status: 'pending', attempts: 0 })
			assert.deepEqual(strayRejections, [], 'an abandoned call left an unhandled rejection')
		})
	}, { seq: true })

	check('real time: a blob read that ignores its timeout cannot hold the run past the deadline either; the model is never called', async () => {
		await realTime(async ({ preMs, afterMs }) => {
			const dayMs = newDay()
			const ws = newWs()
			const finished = deferred()
			const deadlineMs = Math.min(20_000, preMs + 2_000)
			const lateMs = deadlineMs + afterMs + 2_000
			const { deps, calls } = makeDeps(liveClock(dayMs), {
				read: async () => {
					await sleep(lateMs)
					finished.resolve()
					return PNG
				},
			})
			const [image] = await seed(ws, {})
			const started = Date.now()
			await runTagging(db, ws, { limit: 1, deadlineMs }, deps)
			const elapsed = Date.now() - started
			if (calls.read.length === 0) throw new SlowDatabase('the read never started: the database was too slow for this budget')
			assert.ok(elapsed < deadlineMs + afterMs, `the run took ${elapsed} ms for a ${deadlineMs} ms budget`)
			assert.equal(calls.tag.length, 0)
			assert.deepEqual((await get(image._id)).tagging, { status: 'pending', attempts: 0 })
			assert.equal(countOf((await counters(ws, dayMs)).ws), 0)
			await finished.promise
			await sleep(300)
			assert.deepEqual(strayRejections, [])
		})
	}, { seq: true })

	check('real time: slow images and a short budget: it stops claiming, nothing is left running, and what it did not finish is pending with attempts at 0', async () => {
		await realTime(async ({ preMs, afterMs }) => {
			const dayMs = newDay()
			const ws = newWs()
			// The first image takes 0.8 s and finishes well inside the budget; the second one's call hangs until the
			// deadline aborts it. Nothing after the deadline is claimed.
			const firstMs = 800
			const deadlineMs = Math.min(20_000, preMs + firstMs + afterMs)
			let calledBefore = 0
			const { deps, calls } = makeDeps(liveClock(dayMs), {
				tag: (input, opts) => {
					if (calledBefore++ === 0) return new Promise((resolve) => setTimeout(() => resolve(vision()), firstMs))
					return hangs(input, opts)
				},
			})
			await seed(ws, {}, {}, {}, {})
			const started = Date.now()
			const out = await runTagging(db, ws, { limit: 4, concurrency: 1, deadlineMs }, deps)
			const elapsed = Date.now() - started
			const docs = await docsOf(ws)
			const done = docs.filter((d) => d.tagging.status === 'done')
			const rest = docs.filter((d) => d.tagging.status !== 'done')
			if (done.length === 0 || calls.tag.length < 2) throw new SlowDatabase(`the budget was used up before the second image: ${done.length} done, ${calls.tag.length} model calls`)
			assert.ok(elapsed < deadlineMs + afterMs, `the run took ${elapsed} ms for a ${deadlineMs} ms budget`)
			assert.equal(done.length, 1)
			assert.equal(calls.tag.length, 2, 'an image was claimed after the deadline, or the second was not given the time left')
			for (const doc of rest) assert.deepEqual(doc.tagging, { status: 'pending', attempts: 0 }, `${doc.filename} was left in a half state`)
			assert.equal(rest.length, 3)
			assert.equal(out.processed.length, 1)
			assert.equal(countOf((await counters(ws, dayMs)).ws), 1, 'unfinished images must not have paid')
			assert.equal(out.remaining, 3)
			await assertTidy(ws)
		})
	}, { seq: true })
}

/* -------------------------------------------------------------------------- */
/* Budget through the queue                                                   */
/* -------------------------------------------------------------------------- */

function registerQueueBudget() {
	section('Budget through runTagging')

	check('limit 5 with 8 pending stops at 5, reports budgetExhausted, and hands the sixth claim back clean', async () => {
		setEnv({ MEDIA_AI_DAILY_LIMIT: '5' })
		const ctx = setup()
		const tomorrowMs = newDay()
		assert.equal(tomorrowMs - ctx.dayMs, DAY, 'the proof asked for consecutive days')
		await seed(ctx.ws, ...Array.from({ length: 8 }, () => ({})))
		const r1 = await runTagging(db, ctx.ws, { limit: 4 }, ctx.deps)
		assert.equal(r1.processed.length, 4)
		assert.equal(r1.budgetExhausted, false)
		assert.equal(r1.remaining, 4)
		const r2 = await runTagging(db, ctx.ws, { limit: 4 }, ctx.deps)
		assert.equal(r2.processed.length, 1, 'the worker that reserved the fifth unit must finish its image')
		assert.equal(r2.budgetExhausted, true)
		assert.equal(r2.remaining, 3)
		assert.equal(ctx.calls.tag.length, 5)
		const c = await counters(ctx.ws, ctx.clock.ms)
		assert.equal(c.ws.count, 5, 'a refused reservation counted')
		assert.equal(c.global.count, 5)

		const left = (await docsOf(ctx.ws)).filter((d) => d.tagging.status !== 'done')
		assert.equal(left.length, 3)
		for (const doc of left) assert.deepEqual(doc.tagging, { status: 'pending', attempts: 0 }, 'the refused claim was not handed back clean')

		const frozen = await Promise.all(left.map((d) => get(d._id)))
		const r3 = await runTagging(db, ctx.ws, { limit: 4 }, ctx.deps)
		assert.deepEqual([r3.processed.length, r3.budgetExhausted, r3.remaining], [0, true, 3])
		assert.deepEqual(await Promise.all(left.map((d) => get(d._id))), frozen, 'a run with a spent budget must not even claim')
		assert.equal(ctx.calls.tag.length, 5)

		const status = await getTaggingStatus(db, ctx.ws, ctx.deps)
		assert.equal(status.budgetExhausted, true)
		assert.equal(status.resetsAt, nextMidnightIso(ctx.dayMs))

		// Budgets reset with the UTC day.
		ctx.clock.set(tomorrowMs)
		assert.equal((await getTaggingStatus(db, ctx.ws, ctx.deps)).budgetExhausted, false)
		const r4 = await runTagging(db, ctx.ws, { limit: 4 }, ctx.deps)
		assert.equal(r4.processed.length, 3)
		assert.equal(r4.budgetExhausted, false)
		assert.equal(r4.remaining, 0)
	}, { seq: true })

	check('a worker that reserved the last unit finishes its image even though the other worker found the budget spent', async () => {
		setEnv({ MEDIA_AI_DAILY_LIMIT: '1' })
		for (let round = 0; round < 3; round++) {
			const ctx = setup()
			await seed(ctx.ws, {}, {})
			const out = await runTagging(db, ctx.ws, { limit: 2, concurrency: 2 }, ctx.deps)
			assert.equal(out.processed.length, 1, `round ${round}: the unit was reserved, so its image must be tagged`)
			assert.equal(out.processed[0].status, 'done')
			assert.equal(out.budgetExhausted, true)
			assert.equal(out.remaining, 1)
			const states = (await docsOf(ctx.ws)).map((d) => d.tagging.status).sort()
			assert.deepEqual(states, ['done', 'pending'])
			assert.equal(countOf((await counters(ctx.ws, ctx.clock.ms)).ws), 1)
		}
	}, { seq: true })

	check('the global counter stops a run on its own: 3 of 6 are tagged, the workspace is not charged for the refused one, and another account is stopped too', async () => {
		setEnv({ MEDIA_AI_DAILY_LIMIT: '100', MEDIA_AI_GLOBAL_DAILY_LIMIT: '3' })
		const ctx = setup()
		await seed(ctx.ws, ...Array.from({ length: 6 }, () => ({})))
		const r1 = await runTagging(db, ctx.ws, { limit: 4, concurrency: 1 }, ctx.deps)
		assert.equal(r1.processed.length, 3)
		assert.equal(r1.budgetExhausted, true)
		assert.equal(r1.remaining, 3)
		const c = await counters(ctx.ws, ctx.clock.ms)
		assert.equal(c.ws.count, 3, 'the refused global reservation left a workspace unit behind')
		assert.equal(c.global.count, 3)
		const left = (await docsOf(ctx.ws)).filter((d) => d.tagging.status !== 'done')
		for (const doc of left) assert.deepEqual(doc.tagging, { status: 'pending', attempts: 0 })

		// Another account, same day: the shared ceiling is spent.
		const other = newWs()
		const [theirs] = await seed(other, {})
		const out = await runTagging(db, other, { limit: 2 }, ctx.deps)
		assert.equal(out.budgetExhausted, true)
		assert.equal(out.processed.length, 0)
		assert.deepEqual((await get(theirs._id)).tagging, { status: 'pending', attempts: 0 })
		assert.equal(ctx.calls.tag.length, 3)
	}, { seq: true })

	check('the budget is one unit per image, reserved after the claim: a run that claims nothing spends nothing', async () => {
		const ctx = setup()
		const out = await runTagging(db, ctx.ws, { limit: 4 }, ctx.deps)
		assert.equal(out.processed.length, 0)
		const c = await counters(ctx.ws, ctx.clock.ms)
		assert.equal(c.ws, null, 'a counter was created for a run that had nothing to do')
		assert.equal(c.global, null)
	})

	check('refunds by kind: released before or without a model result, kept when the model ran', async () => {
		const table = [
			['result', () => vision(), 1],
			['declined', () => { throw new TaggerError('x', 'declined') }, 1],
			['permanent', () => { throw new TaggerError('x', 'permanent') }, 1],
			['retryable', () => { throw new TaggerError('x', 'retryable') }, 1],
			['unknown throw', () => { throw new Error('x') }, 1],
			['rate_limited', () => { throw new TaggerError('x', 'rate_limited', 1000) }, 0],
			['config', () => { throw new TaggerError('x', 'config') }, 0],
		]
		await Promise.all(
			table.map(async ([label, tag, kept]) => {
				const r = await oneImage({ tag: async () => tag() })
				assert.equal(countOf(r.c.ws), kept, `${label}: workspace counter`)
				assert.equal(countOf(r.c.global), kept, `${label}: global counter`)
			}),
		)
	})

	check('a refund finds the day the unit was taken on, even if the run crosses midnight', async () => {
		const ctx = setup({}, { hour: 23 })
		const clock = ctx.clock
		const { deps } = makeDeps(clock.now, {
			read: async () => {
				// Midnight passes while the blob is read, and the image turns out to be unreadable.
				clock.set(ctx.dayMs + 2 * 3_600_000)
				throw new BlobGoneError()
			},
		})
		assert.equal(dayKey(newDay()), dayKey(ctx.dayMs + 2 * 3_600_000), 'the day after is reserved too')
		await seed(ctx.ws, {})
		await runTagging(db, ctx.ws, { limit: 1 }, deps)
		const reservedDay = await counters(ctx.ws, ctx.dayMs)
		assert.equal(countOf(reservedDay.ws), 0, 'the unit stayed on the day it was reserved')
		const nextDay = await counters(ctx.ws, clock.ms)
		assert.equal(nextDay.ws, null, 'the refund must not create the next day\'s counter')
	})

	check('tokens land on the reservation day\'s documents', async () => {
		const ctx = setup({}, { hour: 23 })
		const clock = ctx.clock
		const { deps } = makeDeps(clock.now, {
			tag: async () => {
				clock.set(ctx.dayMs + 2 * 3_600_000)
				return vision()
			},
		})
		assert.equal(dayKey(newDay()), dayKey(ctx.dayMs + 2 * 3_600_000), 'the day after is reserved too')
		await seed(ctx.ws, {})
		await runTagging(db, ctx.ws, { limit: 1 }, deps)
		const reserved = await counters(ctx.ws, ctx.dayMs)
		assert.equal(reserved.ws.inputTokens, 1000)
		assert.equal((await counters(ctx.ws, clock.ms)).ws, null)
	})
}

/* -------------------------------------------------------------------------- */
/* Queue operations and status                                                */
/* -------------------------------------------------------------------------- */

function registerQueueOps() {
	section('queueTagging, requeueUntagged and getTaggingStatus')

	check('queueTagging puts images back (pending, attempts 0, lease, retryAfter, error and reason cleared) and leaves a live lease alone', async () => {
		const { ws, clock } = setup()
		const deps = { configured: () => true, now: clock.now }
		const [done, failed, declined, delayed, live, lapsed, poison, already] = await seed(
			ws,
			{ tagging: { status: 'done', attempts: 1, model: 'm', at: new Date(clock.ms) }, tags: [manual('keep')] },
			{ tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.unreadable, at: new Date(clock.ms) } },
			{ tagging: { status: 'skipped', attempts: 1, reason: 'declined', at: new Date(clock.ms) } },
			{ tagging: { status: 'pending', attempts: 2, retryAfter: new Date(clock.ms + 60_000) } },
			{ tagging: running(clock, 1, 30_000) },
			{ tagging: running(clock, 2, -1_000) },
			{ tagging: running(clock, 3, -1_000) },
			{ tagging: { status: 'pending', attempts: 0 } },
		)
		const liveBefore = await get(live._id)
		const ids = [done, failed, declined, delayed, live, lapsed, poison, already].map((d) => d._id)
		const queued = await queueTagging(db, ws, ids, deps)
		assert.equal(queued, 7, 'everything except the live lease')
		for (const doc of [done, failed, declined, delayed, lapsed, poison, already]) {
			assert.deepEqual((await get(doc._id)).tagging, { status: 'pending', attempts: 0 }, doc.filename)
		}
		assert.deepEqual(await get(live._id), liveBefore, 'a live lease was reset')
		assert.deepEqual((await get(done._id)).tags, [manual('keep')], 'queueing must not touch tags')
		assert.equal(await queueTagging(db, ws, [live._id], deps), 0)
		clock.advance(MEDIA_LIMITS.aiLeaseMs)
		assert.equal(await queueTagging(db, ws, [live._id], deps), 1, 'once the lease has ended it is fair game')
	})

	check('queueTagging only reaches this account, ignores junk ids and duplicates, and handles more ids than one slice', async () => {
		const mine = setup()
		const stranger = newWs()
		const deps = { configured: () => true, now: mine.clock.now }
		const [a, b] = await seed(mine.ws, { tagging: { status: 'done', attempts: 1 } }, { tagging: { status: 'done', attempts: 1 } })
		const [theirs] = await seed(stranger, { tagging: { status: 'done', attempts: 1 } })
		const junk = ['x', null, undefined, 5, { $ne: null }, hex(a._id), theirs._id, a._id, a._id, new ObjectId()]
		assert.equal(await queueTagging(db, mine.ws, junk, deps), 1)
		assert.equal((await get(a._id)).tagging.status, 'pending')
		assert.equal((await get(b._id)).tagging.status, 'done')
		assert.equal((await get(theirs._id)).tagging.status, 'done', 'another account\'s image was queued')
		for (const bad of [[], undefined, null, 'abc', { length: 1 }]) assert.equal(await queueTagging(db, mine.ws, bad, deps), 0)

		const many = await seed(mine.ws, ...Array.from({ length: MEDIA_LIMITS.bulkIdsCap + 40 }, () => ({ tagging: { status: 'done', attempts: 1 } })))
		assert.equal(await queueTagging(db, mine.ws, many.map((d) => d._id), deps), many.length, 'more ids than one slice')
		assert.equal(await assets.countDocuments({ workspaceId: mine.ws, 'tagging.status': 'pending' }), many.length + 1)
	})

	check('a claim that lands between the decision and the write is not overwritten by queueTagging or requeueUntagged (the rule is the write\'s own filter)', async () => {
		const { ws, clock } = setup()
		const deps = { configured: () => true, now: clock.now }
		const [doneImage, failedImage] = await seed(
			ws,
			{ tagging: { status: 'done', attempts: 1 } },
			{ tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.unavailable } },
		)
		// Another worker takes the image in the instant before the caller's write reaches the database.
		const racing = (id) =>
			spyDb(db, (entry, real) => {
				if (entry.collection === 'mediaAssets' && entry.op === 'updateMany')
					return assets
						.updateOne({ _id: id }, { $set: { 'tagging.status': 'running', 'tagging.leaseUntil': new Date(clock.ms + 30_000), 'tagging.attempts': 1 } })
						.then(() => real())
			}).db
		assert.equal(await queueTagging(racing(doneImage._id), ws, [doneImage._id], deps), 0, 'a claim that landed first was reset')
		assert.equal(await requeueUntagged(racing(failedImage._id), ws, deps), 0, 'a claim that landed first was reset')
		for (const image of [doneImage, failedImage]) {
			const after = await get(image._id)
			assert.deepEqual([after.tagging.status, after.tagging.attempts], ['running', 1], 'the claim must stand')
			sameTime(after.tagging.leaseUntil, clock.ms + 30_000)
		}
	})

	check('requeueUntagged: skipped for want of a key and failed images go back to pending; a refusal, a live lease and other accounts do not', async () => {
		const { ws, clock } = setup()
		const deps = { configured: () => true, now: clock.now }
		const other = newWs()
		const [skipped1, skipped2, failed1, failed2, declined, done, pending, live] = await seed(
			ws,
			{ tagging: { status: 'skipped', attempts: 0, reason: 'not_configured' } },
			{ tagging: { status: 'skipped', attempts: 0, reason: 'not_configured' } },
			{ tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.unavailable } },
			{ tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.timeout } },
			{ tagging: { status: 'skipped', attempts: 1, reason: 'declined' } },
			{ tagging: { status: 'done', attempts: 1 } },
			{ tagging: { status: 'pending', attempts: 2 } },
			{ tagging: running(clock, 1, 30_000) },
		)
		const [foreign] = await seed(other, { tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.unavailable } })
		const frozen = await Promise.all([declined, done, pending, live, foreign].map((d) => get(d._id)))
		assert.equal(await requeueUntagged(db, ws, deps), 4)
		for (const doc of [skipped1, skipped2, failed1, failed2]) assert.deepEqual((await get(doc._id)).tagging, { status: 'pending', attempts: 0 })
		assert.deepEqual(await Promise.all([declined, done, pending, live, foreign].map((d) => get(d._id))), frozen)
		assert.equal(await requeueUntagged(db, ws, deps), 0, 'nothing left to requeue')

		// And the requeued images are really claimable.
		const ctx = makeDeps(clock.now)
		const out = await runTagging(db, ws, { limit: 4, concurrency: 1 }, ctx.deps)
		assert.equal(out.processed.length, 4)
		assert.equal(out.processed.every((p) => p.status === 'done'), true)
	})

	check('not configured: runTagging, queueTagging and requeueUntagged do nothing at all, and say so', async () => {
		const { ws, clock } = setup({ configured: () => false })
		const off = { configured: () => false, now: clock.now }
		const stub = makeDeps(clock.now, { configured: () => false })
		const [pendingImage, skipped, failed] = await seed(
			ws,
			{},
			{ tagging: { status: 'skipped', attempts: 0, reason: 'not_configured' } },
			{ tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.unavailable } },
		)
		const before = await Promise.all([pendingImage, skipped, failed].map((d) => get(d._id)))
		const out = await runTagging(db, ws, { limit: 4 }, stub.deps)
		assert.deepEqual(out, { processed: [], remaining: 0, budgetExhausted: false })
		assert.equal(await queueTagging(db, ws, [pendingImage._id, skipped._id, failed._id], off), 0)
		assert.equal(await requeueUntagged(db, ws, off), 0)
		assert.deepEqual(await Promise.all([pendingImage, skipped, failed].map((d) => get(d._id))), before)
		assert.equal(stub.calls.tag.length + stub.calls.read.length, 0)
		assert.deepEqual(await counters(ws, clock.ms), { ws: null, global: null })

		// A configured() that throws or lies counts as "not configured", never as a crash.
		const throwing = { ...stub.deps, configured: () => { throw new Error('env exploded') } }
		assert.deepEqual(await runTagging(db, ws, { limit: 4 }, throwing), { processed: [], remaining: 0, budgetExhausted: false })
		assert.equal(await queueTagging(db, ws, [failed._id], { ...off, configured: () => { throw new Error('x') } }), 0)
	})

	check('getTaggingStatus: pending, running (live lease), failed, skipped, untagged, and nothing from other accounts', async () => {
		const { ws, clock } = setup()
		const deps = { configured: () => true, now: clock.now }
		const other = newWs()
		await seed(
			ws,
			{ tagging: { status: 'pending', attempts: 0 }, tags: [] },
			{ tagging: { status: 'pending', attempts: 1, retryAfter: new Date(clock.ms + 60_000) }, tags: [manual('a')] },
			{ tagging: { status: 'pending', attempts: 1, retryAfter: new Date(clock.ms - 60_000) }, tags: [manual('a')] },
			{ tagging: running(clock, 1, -1_000), tags: [manual('a')] },
			{ tagging: running(clock, 2, -1_000), tags: [manual('a')] },
			{ tagging: { status: 'running', attempts: 1 }, tags: [manual('a')] },
			{ tagging: running(clock, 1, 40_000), tags: [manual('a')] },
			{ tagging: running(clock, 1, 1), tags: [manual('a')] },
			{ tagging: running(clock, 3, -1_000), tags: [manual('a')] },
			{ tagging: running(clock, 3, 40_000), tags: [manual('a')] },
			{ tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.unreadable }, tags: [] },
			{ tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.timeout }, tags: [manual('a')] },
			{ tagging: { status: 'skipped', attempts: 0, reason: 'not_configured' }, tags: [] },
			{ tagging: { status: 'skipped', attempts: 0, reason: 'not_configured' }, tags: [manual('a')] },
			{ tagging: { status: 'skipped', attempts: 1, reason: 'declined' }, tags: [] },
			{ tagging: { status: 'done', attempts: 1 }, tags: [filenameTag('only-a-filename-tag')] },
			{ tagging: { status: 'done', attempts: 1 }, tags: [] },
		)
		await seed(other, ...Array.from({ length: 9 }, () => ({ tagging: { status: 'pending', attempts: 0 }, tags: [] })))
		const status = await getTaggingStatus(db, ws, deps)
		assert.deepEqual(status, {
			configured: true,
			model: taggingModel(),
			// pending x3 (one delayed), running with a lapsed lease and attempts left x3
			pending: 6,
			// live leases x3 (an at-the-cap image whose lease is live is still running)
			running: 3,
			failed: 2,
			// the declined image is not "added before auto-tagging was on"
			skipped: 2,
			// tags: [] on: 1 pending, 1 failed, 1 skipped (not_configured), 1 skipped (declined), 1 done
			untagged: 5,
			budgetExhausted: false,
			resetsAt: null,
		})
	})

	check('getTaggingStatus: configured, model (environment) and a not-configured account', async () => {
		const { ws, clock } = setup()
		await seed(ws, {})
		const off = await getTaggingStatus(db, ws, { configured: () => false, now: clock.now })
		assert.equal(off.configured, false)
		assert.equal(off.model, null)
		assert.equal(off.pending, 1, 'counts are still reported')
		setEnv({ MEDIA_TAGGING_MODEL: 'claude-haiku-4-5' })
		const on = await getTaggingStatus(db, ws, { configured: () => true, now: clock.now })
		assert.equal(on.configured, true)
		assert.equal(on.model, 'claude-haiku-4-5')
		setEnv({})
		assert.equal((await getTaggingStatus(db, ws, { configured: () => true, now: clock.now })).model, 'claude-opus-5-5')
	}, { seq: true })

	check('getTaggingStatus: budgetExhausted and resetsAt (the next 00:00 UTC), for the account\'s counter, the global one, and an overshoot', async () => {
		const cases = [
			['workspace', { MEDIA_AI_DAILY_LIMIT: '3' }, 3, 0, true],
			['workspace under', { MEDIA_AI_DAILY_LIMIT: '3' }, 2, 0, false],
			['workspace over (the limit was lowered)', { MEDIA_AI_DAILY_LIMIT: '3' }, 9, 0, true],
			['global', { MEDIA_AI_GLOBAL_DAILY_LIMIT: '4' }, 0, 4, true],
			['global under', { MEDIA_AI_GLOBAL_DAILY_LIMIT: '4' }, 0, 3, false],
			['neither', {}, 0, 0, false],
		]
		for (const [label, env, held, heldGlobal, exhausted] of cases) {
			setEnv(env)
			const ws = newWs()
			const dayMs = newDay(17)
			const now = () => new Date(dayMs + 45 * 60_000)
			if (held) await usage.insertOne({ _id: `${hex(ws)}:${dayKey(dayMs)}`, count: held, expiresAt: new Date(dayMs + 5 * DAY) })
			if (heldGlobal) await usage.insertOne({ _id: `global:${dayKey(dayMs)}`, count: heldGlobal, expiresAt: new Date(dayMs + 5 * DAY) })
			const status = await getTaggingStatus(db, ws, { configured: () => true, now })
			assert.equal(status.budgetExhausted, exhausted, label)
			assert.equal(status.resetsAt, exhausted ? nextMidnightIso(dayMs) : null, label)
		}
		// 23:59:59.999 still resets at the very next midnight.
		setEnv({ MEDIA_AI_DAILY_LIMIT: '1' })
		const ws = newWs()
		const lastMoment = newDay(0) + DAY - 1
		await usage.insertOne({ _id: `${hex(ws)}:${dayKey(lastMoment)}`, count: 1, expiresAt: new Date(lastMoment + 5 * DAY) })
		const status = await getTaggingStatus(db, ws, { configured: () => true, now: () => new Date(lastMoment) })
		assert.equal(status.resetsAt, new Date(lastMoment + 1).toISOString())
	}, { seq: true })

	check('remaining uses the same filter as pending, in every state a run can leave behind', async () => {
		const { ws, clock, deps } = setup()
		await seed(
			ws,
			{},
			{ tagging: { status: 'pending', attempts: 1, retryAfter: new Date(clock.ms + 90_000) } },
			{ tagging: running(clock, 1, -1_000) },
			{ tagging: running(clock, 1, 25_000) },
			{ tagging: running(clock, 3, -1_000) },
			{ tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.timeout } },
			{ tagging: { status: 'done', attempts: 1 } },
		)
		const status = await getTaggingStatus(db, ws, { configured: () => true, now: clock.now })
		// deadlineMs 0: the run claims nothing, so `remaining` is exactly the queue after the sweep.
		const out = await runTagging(db, ws, { deadlineMs: 0 }, deps)
		const after = await getTaggingStatus(db, ws, { configured: () => true, now: clock.now })
		assert.equal(out.remaining, after.pending)
		assert.equal(out.remaining, 3, 'pending, a delayed pending, and a lapsed lease with attempts left')
		assert.equal(status.pending, 3, 'a lapsed lease at the cap is swept, not queued')
	})

	check('after a rate limit the run reports exactly the status\'s pending count as remaining', async () => {
		const ctx = setup({ tag: async () => { throw new TaggerError('429', 'rate_limited', 9_000) } })
		await seed(ctx.ws, {}, {}, {})
		const out = await runTagging(db, ctx.ws, { limit: 2 }, ctx.deps)
		const status = await getTaggingStatus(db, ctx.ws, { configured: () => true, now: ctx.clock.now })
		assert.equal(out.remaining, status.pending)
		assert.equal(out.remaining, 3)
	})
}

/* -------------------------------------------------------------------------- */
/* Defaults, isolation, and an audit of what the code writes                  */
/* -------------------------------------------------------------------------- */

function registerSafety() {
	section('Defaults, isolation, and audits')

	check('with no deps and no key, runTagging returns at once and touches nothing (the real "is a key set" switch)', async () => {
		setEnv({})
		const ws = newWs()
		await seed(ws, {})
		const spy = spyDb(db)
		const out = await runTagging(spy.db, ws, { limit: 2 })
		assert.deepEqual(out, { processed: [], remaining: 0, budgetExhausted: false })
		assert.equal(spy.ops.length, 0, 'it must not even read the database')
		setEnv({ ANTHROPIC_API_KEY: 'sk-ant-proof-not-a-real-key', MEDIA_AI_ENABLED: 'false' })
		assert.deepEqual(await runTagging(spy.db, ws, { limit: 2 }), { processed: [], remaining: 0, budgetExhausted: false }, 'MEDIA_AI_ENABLED=false switches it off')
		assert.equal(await queueTagging(spy.db, ws, []), 0)
		assert.equal(await requeueUntagged(spy.db, ws), 0)
		assert.equal(spy.ops.length, 0)
	}, { seq: true })

	check('with the real read and a key, hostile image URLs fail as unreadable without any network (only blob hosts are ever fetched)', async () => {
		setEnv({ ANTHROPIC_API_KEY: 'sk-ant-proof-not-a-real-key' })
		const ws = newWs()
		const dayMs = newDay()
		const urls = [
			'https://example.invalid/not-a-blob.jpg',
			'http://169.254.169.254/latest/meta-data/',
			'file:///etc/passwd',
			'javascript:alert(1)',
			'https://127.0.0.1/a.jpg',
			'https://evil.example.com/a.jpg',
			'https://store.public.blob.vercel-storage.com.evil.example/a.jpg',
			'https://user:pass@store.public.blob.vercel-storage.com/a.jpg',
			'https://store.public.blob.vercel-storage.com/a.jpg?token=1',
			'https://store.public.blob.vercel-storage.com/../../etc/passwd',
			'',
			null,
		]
		const images = await seed(ws, ...urls.map((url) => ({ url })))
		const before = strayFetches
		const deps = { now: () => new Date(dayMs) }
		for (let round = 0; round < Math.ceil(urls.length / MEDIA_LIMITS.aiBatchMax); round++) await runTagging(db, ws, { limit: MEDIA_LIMITS.aiBatchMax }, deps)
		for (const [i, image] of images.entries()) {
			const after = await get(image._id)
			assert.deepEqual([after.tagging.status, after.tagging.error], ['failed', TAGGING_ERRORS.unreadable], `url ${JSON.stringify(urls[i])}`)
		}
		assert.equal(strayFetches, before, 'a request left the process')
		assert.equal(countOf((await counters(ws, dayMs)).ws), 0, 'the model was never reached')
	}, { seq: true })

	check('workspace ids that are not ObjectIds do nothing and ask the database nothing', async () => {
		const spy = spyDb(db)
		const at = new Date(newDay())
		const deps = { configured: () => true, now: () => at }
		for (const bad of [undefined, null, 'abc', hex(new ObjectId()), 7, {}, [], { toHexString: () => 'a'.repeat(24) }]) {
			assert.deepEqual(await runTagging(spy.db, bad, { limit: 2 }, deps), { processed: [], remaining: 0, budgetExhausted: false })
			assert.equal(await queueTagging(spy.db, bad, [new ObjectId()], deps), 0)
			assert.equal(await requeueUntagged(spy.db, bad, deps), 0)
			const status = await getTaggingStatus(spy.db, bad, deps)
			assert.deepEqual(
				[status.pending, status.running, status.failed, status.skipped, status.untagged, status.budgetExhausted, status.resetsAt],
				[0, 0, 0, 0, 0, false, null],
			)
		}
		assert.equal(spy.ops.length, 0, `queries were made for a bad account: ${JSON.stringify(spy.ops.map((o) => o.op))}`)
	})

	check('a clock that throws or answers with something that is not a date falls back to the real one, and its counters are the real UTC day (none is written here)', async () => {
		const garbage = [
			() => {
				throw new Error('clock exploded')
			},
			() => new Date(Number.NaN),
			() => 'yesterday',
			() => 1_700_000_000_000,
			() => null,
			() => undefined,
			() => ({ getTime: () => 5 }),
		]
		const t0 = Date.now()
		const days = new Set()
		for (const now of garbage) {
			const ws = newWs()
			const [image] = await seed(ws, {})
			// The counters are answered here, so the real day's counters are never touched.
			const offline = offlineCounters()
			const spy = spyDb(db, offline.intercept)
			const started = Date.now()
			const out = await runTagging(spy.db, ws, { limit: 1 }, makeDeps(now).deps)
			const finished = Date.now()
			assert.deepEqual(out.processed.map((p) => p.status), ['done'], `clock ${String(now)}`)
			assert.equal((await get(image._id)).tagging.status, 'done')
			// The lease came from the real clock, not from the garbage.
			const claim = spy.ops.find((o) => o.collection === 'mediaAssets' && o.op === 'findOneAndUpdate')
			const lease = claim.args[1][0].$set['tagging.leaseUntil']
			assert.ok(lease instanceof Date && +lease >= started + MEDIA_LIMITS.aiLeaseMs && +lease <= finished + MEDIA_LIMITS.aiLeaseMs, `lease ${lease}`)
			for (const key of offline.keys) days.add(key.split(':')[1])

			// The status reads the same way, and says when a spent budget resets, by the real clock.
			const spent = offlineCounters({ held: 10 ** 9 })
			const status = await getTaggingStatus(spyDb(db, spent.intercept).db, ws, { configured: () => true, now })
			assert.equal(status.budgetExhausted, true)
			assert.ok([nextMidnightIso(started), nextMidnightIso(Date.now())].includes(status.resetsAt), `resetsAt ${status.resetsAt}`)
		}
		const allowed = new Set([dayKey(t0), dayKey(Date.now())])
		assert.ok(days.size > 0 && [...days].every((day) => allowed.has(day)), `counters were keyed by ${[...days]}`)
	})

	check('reserveAiBudget and refundAiBudget given something that is not a date use the real UTC day (none is written here)', async () => {
		const t0 = Date.now()
		const days = new Set()
		for (const bad of [new Date(Number.NaN), 'yesterday', null, undefined, 12345, {}]) {
			const offline = offlineCounters()
			const spy = spyDb(db, offline.intercept)
			const ws = newWs()
			assert.deepEqual(await reserveAiBudget(spy.db, ws, bad), { ok: true }, String(bad))
			await refundAiBudget(spy.db, ws, bad)
			assert.ok(offline.keys.size >= 2, 'both counters should have been named')
			for (const key of offline.keys) days.add(key.split(':')[1])
		}
		const allowed = new Set([dayKey(t0), dayKey(Date.now())])
		assert.ok([...days].every((day) => allowed.has(day)), `counters were keyed by ${[...days]}`)
	})

	check('a huge ids list is bounded: the run still works, and only the named image of this account is tagged', async () => {
		const ctx = setup()
		const [target, other] = await seed(ctx.ws, {}, {})
		const ids = [target._id, ...Array.from({ length: 20_000 }, () => new ObjectId())]
		const out = await runTagging(db, ctx.ws, { ids, limit: 4 }, ctx.deps)
		assert.deepEqual(out.processed.map((p) => hex(p.id)), [hex(target._id)])
		assert.equal((await get(other._id)).tagging.status, 'pending')
		assert.equal(ctx.calls.tag.length, 1)
	})

	check('other accounts are never read, claimed, swept, queued, requeued or counted by any call', async () => {
		const mine = setup()
		const theirs = newWs()
		const foreign = await seed(
			theirs,
			{},
			{ tagging: running(mine.clock, 1, -9_000) },
			{ tagging: running(mine.clock, 3, -9_000) },
			{ tagging: { status: 'failed', attempts: 3, error: TAGGING_ERRORS.unavailable } },
			{ tagging: { status: 'skipped', attempts: 0, reason: 'not_configured' } },
			{ tagging: { status: 'done', attempts: 1 }, tags: [manual('theirs')] },
		)
		await seed(mine.ws, {})
		const before = await Promise.all(foreign.map((d) => get(d._id)))
		const spy = spyDb(db)
		const deps = { ...mine.deps }
		await runTagging(spy.db, mine.ws, { limit: 4 }, deps)
		await queueTagging(spy.db, mine.ws, foreign.map((d) => d._id), deps)
		await requeueUntagged(spy.db, mine.ws, deps)
		const status = await getTaggingStatus(spy.db, mine.ws, deps)
		assert.deepEqual(await Promise.all(foreign.map((d) => get(d._id))), before)
		assert.equal(status.untagged, 0)
		assert.equal(status.failed, 0)
		// The vocabulary of one account never reaches another account's model call.
		const sentTags = mine.calls.tag.flatMap((c) => c.input.knownTags)
		assert.ok(!sentTags.includes('Theirs'), 'another account\'s tag was sent to the model')
		assert.ok(!JSON.stringify(mine.calls.tag.map((c) => c.input)).includes('theirs'))
	})

	check('AUDIT: every query on mediaAssets leads with this workspace, and every write is conditional or goes through commit', async () => {
		const ctx = setup()
		const stranger = newWs()
		await seed(stranger, { tags: [manual('theirs')] })
		await seed(ctx.ws, {}, {}, { tagging: running(ctx.clock, 3, -5_000) }, { tagging: running(ctx.clock, 1, -5_000) })
		await T.writeRule(db, ctx.ws, 'wrench', null)
		const spy = spyDb(db)
		// A mixed run: results, a failure.
		let n = 0
		const { deps } = makeDeps(ctx.clock.now, {
			tag: async () => {
				n++
				if (n === 2) throw new TaggerError('x', 'permanent')
				return vision()
			},
		})
		await runTagging(spy.db, ctx.ws, { limit: 4, concurrency: 1 }, deps)
		await queueTagging(spy.db, ctx.ws, [new ObjectId()], deps)
		await requeueUntagged(spy.db, ctx.ws, deps)
		await getTaggingStatus(spy.db, ctx.ws, deps)

		const filterOf = (op) => (op.op === 'aggregate' ? op.args[0]?.[0]?.$match : op.args[0])
		const mine = spy.ops.filter((o) => o.collection === 'mediaAssets')
		assert.ok(mine.length > 10, `only ${mine.length} asset operations were seen`)
		const scoped = spy.ops.filter((o) => ['mediaAssets', 'mediaFolders', 'mediaTagRules'].includes(o.collection))
		for (const op of scoped) {
			const filter = filterOf(op)
			assert.ok(
				filter && filter.workspaceId instanceof ObjectId && filter.workspaceId.equals(ctx.ws),
				`${op.op} on ${op.collection} is not scoped to the workspace: ${JSON.stringify(filter)}`,
			)
		}
		assert.ok(spy.ops.some((o) => o.collection === 'mediaTagRules'), 'the tag rules were never read')

		// Writes: a claim, a sweep, a queue reset touch `tagging.*` only; the rest is commit's write (it bumps rev).
		const writes = mine.filter((o) => ['updateOne', 'updateMany', 'findOneAndUpdate', 'bulkWrite', 'replaceOne', 'insertOne', 'insertMany', 'deleteOne', 'deleteMany', 'findOneAndReplace', 'findOneAndDelete'].includes(o.op))
		assert.ok(writes.length > 5)
		for (const op of writes) {
			const update = op.args[1]
			const isCommit = op.op === 'updateOne' && update?.$inc?.rev === 1
			if (isCommit) continue
			assert.ok(['updateMany', 'findOneAndUpdate'].includes(op.op), `a bare ${op.op} on mediaAssets`)
			const { paths, operators } = writtenBy(update)
			assert.ok(paths.length > 0 && paths.every((p) => p.startsWith('tagging.')), `a bare write outside tagging: ${paths}`)
			assert.deepEqual(operators.filter((k) => !['$set', '$unset', '$inc'].includes(k)), [], 'unexpected update operators')
		}

		// The budget counters: ensure is pure equality on _id with $setOnInsert; the reservation never upserts.
		const usageOps = spy.ops.filter((o) => o.collection === 'mediaAiUsage')
		assert.ok(usageOps.length > 5)
		for (const op of usageOps) {
			if (op.op === 'findOneAndUpdate') {
				assert.ok(!op.args[2]?.upsert, 'a reservation upserted')
				assert.deepEqual(Object.keys(op.args[0]).sort(), ['_id', 'count'])
				assert.deepEqual(Object.keys(op.args[0].count), ['$lte'], 'the guard is count <= limit - 1')
				assert.deepEqual(op.args[1], { $inc: { count: 1 } })
			} else if (op.op === 'updateOne' && op.args[2]?.upsert) {
				assert.deepEqual(Object.keys(op.args[0]), ['_id'], 'the ensure step must filter on _id alone')
				assert.deepEqual(Object.keys(op.args[1]), ['$setOnInsert'])
				assert.equal(op.args[1].$setOnInsert.count, 0)
				assert.ok(op.args[1].$setOnInsert.expiresAt instanceof Date)
			} else if (op.op === 'updateOne') {
				assert.ok(!op.args[2]?.upsert)
				const inc = op.args[1].$inc
				assert.ok(inc, 'an unexpected update on the counters')
				const refund = inc.count === -1 && op.args[0].count?.$gt === 0
				const tokens = inc.inputTokens !== undefined && inc.outputTokens !== undefined && op.args[0].count === undefined
				assert.ok(refund || tokens, `unexpected counter write ${JSON.stringify(op.args)}`)
			} else assert.ok(['find', 'findOne'].includes(op.op), `unexpected counter operation ${op.op}`)
		}
	})

	check('AUDIT: the claim is one findOneAndUpdate over this workspace, setting the lease and the attempts and clearing retryAfter, never an upsert', async () => {
		const ctx = setup()
		await seed(ctx.ws, {})
		const spy = spyDb(db)
		await runTagging(spy.db, ctx.ws, { limit: 1 }, ctx.deps)
		const claims = spy.ops.filter((o) => o.collection === 'mediaAssets' && o.op === 'findOneAndUpdate')
		assert.equal(claims.length, 1)
		const [filter, update, options] = claims[0].args
		assert.ok(filter.workspaceId.equals(ctx.ws))
		// A pipeline update (one atomic write): `$inc` throws on a stored null, which would wedge the queue.
		assert.ok(Array.isArray(update), 'the claim must be a pipeline update')
		const set = update.find((stage) => stage.$set)?.$set
		assert.equal(set['tagging.status'], 'running')
		assert.equal(+set['tagging.leaseUntil'], ctx.clock.ms + MEDIA_LIMITS.aiLeaseMs)
		assert.ok('tagging.attempts' in set, 'the claim must count an attempt')
		assert.deepEqual(writtenBy(update).paths.sort(), ['tagging.attempts', 'tagging.leaseUntil', 'tagging.retryAfter', 'tagging.status'])
		assert.equal(options.returnDocument, 'after')
		assert.ok(!options.upsert)
	})
}

function registerFinal() {
	section('Last')

	check('no stray network request, no unhandled rejection, no key in any log line', async () => {
		assert.equal(strayFetches, 0, 'a network request left the process')
		assert.deepEqual(strayRejections, [])
		// The raw error text is logged on purpose (that is what the log is for); the key never is.
		const secrets = ['sk-ant-api03-PROOFSECRETPROOFSECRET', 'sk-ant-proof-not-a-real-key']
		for (const line of allLogs) for (const secret of secrets) assert.ok(!line.includes(secret), `${secret} reached a log line: ${line}`)
	}, { seq: true })
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A UTC midnight at least 60 days out, with room for every day this run takes, none of them in
 * use. The space is large (decades), so two proofs running side by side do not meet.
 */
async function pickDayBase() {
	for (let attempt = 0; attempt < 20; attempt++) {
		const todayMs = Math.floor(Date.now() / DAY) * DAY
		const base = todayMs + (60 + randomInt(0, 20_000)) * DAY
		const keys = Array.from({ length: DAY_ROOM }, (_, i) => `global:${dayKey(base + i * DAY)}`)
		if ((await usage.countDocuments({ _id: { $in: keys } })) === 0) return base
	}
	throw new Error('could not find a free block of days for the test counters')
}

async function main() {
	if (!client) {
		failed++
		console.log('FAIL  database (MONGODB_URI is not set. Run with: node --env-file=.env scripts/prove-media-process.mjs)')
		return
	}
	await client.connect()
	db = slowDb(client.db(), Number(process.env.PROVE_LATENCY_MS) || 0)
	assets = db.collection('mediaAssets')
	usage = db.collection('mediaAiUsage')
	ruleCol = db.collection('mediaTagRules')
	folderCol = db.collection('mediaFolders')
	PNG = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#3366aa' } }).png().toBuffer()
	// Open the pool's connections side by side now, so no check pays for a handshake.
	await Promise.all(Array.from({ length: 20 }, () => db.command({ ping: 1 })))
	// Most of the time below is waiting for this: a check is a chain of round trips.
	const pings = []
	for (let i = 0; i < 3; i++) {
		const sent = Date.now()
		await db.command({ ping: 1 })
		pings.push(Date.now() - sent)
	}
	console.log(`database round trip: about ${Math.round(pings.reduce((a, b) => a + b, 0) / pings.length)} ms`)
	dayBase = await pickDayBase()

	registerConstants()
	registerBudget()
	registerClaims()
	registerApply()
	registerLostUpdate()
	registerFailures()
	registerInfrastructure()
	registerTime()
	registerQueueBudget()
	registerQueueOps()
	registerSafety()
	registerFinal()
	await runRegistry()
}

const started = Date.now()
try {
	await main()
} catch (error) {
	failed++
	console.log(`FAIL  harness (${error && error.stack ? error.stack.split('\n').slice(0, 5).join(' | ') : error})`)
} finally {
	console.error = realError
	globalThis.fetch = realFetch
	AbortSignal.timeout = AbortSignalTimeout
	try {
		// Whatever was handed out since the last section (everything, if the harness itself failed).
		const left = await cleanupCreated()
		if (db)
			console.log(
				`\ncleanup: removed ${removed.assets} assets, ${removed.folders} folders, ${removed.rules} rules, ${removed.accountCounters} account counters and ${removed.globalCounters} global counters across ${removed.accounts} accounts; ${left} left`,
			)
		if (left) failed++
	} catch (error) {
		failed++
		console.log(`FAIL  cleanup (${error})`)
	}
	for (const name of ENV_NAMES) {
		if (savedEnv[name] === undefined) delete process.env[name]
		else process.env[name] = savedEnv[name]
	}
	await client?.close().catch(() => {})
}
console.log(`\n${passed} passed, ${failed} failed (${((Date.now() - started) / 1000).toFixed(0)} s)`)
// The aggregator (prove-media-all.mjs) reads this form.
console.log(`${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
