/**
 * Proves the AI builder's infrastructure (src/lib/builder/ai/{schema-kit,errors,model,
 * replay,ndjson,budget,builds,pool}.ts, section 16.1 #11) against the REAL source, a
 * fake model client and a LOCAL throwaway MongoDB:
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27117/reynoldsbuilt_ai_e2e node scripts/prove-builder-ai-infra.mjs
 *
 * Run it WITHOUT --env-file: the .env in this repo points at the production cluster.
 * It refuses any MONGODB_URI that is not mongodb://127.0.0.1:<port>/… or
 * mongodb://localhost:<port>/….
 *
 * No model is ever called. The model is a fake injected through model.ts's `__test`
 * seam, ANTHROPIC_API_KEY is removed from the environment, and `fetch` is replaced so
 * any request that tried to leave the process would fail the proof.
 *
 * Hygiene: every document it writes carries ids made for this run (fresh workspace and
 * site ObjectIds, `bld_…` build ids) and day counters for days in the 2200s, so nothing
 * real can match them; all of it is deleted at the end, also after a failure. The one
 * scratch database it creates (to run scripts/ensure-indexes.mjs from nothing) is
 * dropped straight after.
 *
 * Knob: PROVE_SRC=<dir> loads a copy of src/lib/builder/ai from <dir> (used to check the
 * proof fails when the code is deliberately broken).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomInt } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { loadTs, mock, rootRequire, ROOT } = require('./lib/load-ts.cjs')

/* -------------------------------------------------------------------------- */
/* Preflight: a local database, no key, no network                            */
/* -------------------------------------------------------------------------- */

const URI = process.env.MONGODB_URI ?? ''
const LOCAL = /^mongodb:\/\/(127\.0\.0\.1|localhost):(\d+)\/([A-Za-z0-9_-]+)(\?[^@]*)?$/
const local = LOCAL.exec(URI)
if (!local) {
	console.error(
		`Refusing to run against "${URI.replace(/\/\/[^@/]*@/, '//***@') || '(no MONGODB_URI)'}". This proof needs a local throwaway MongoDB, e.g. MONGODB_URI=mongodb://127.0.0.1:27117/reynoldsbuilt_ai_e2e.`,
	)
	process.exit(1)
}

const ENV_NAMES = [
	'ANTHROPIC_API_KEY',
	'BUILDER_AI_MODEL',
	'BUILDER_AI_REPLAY_DIR',
	'BUILDER_AI_RECORD_DIR',
	'BUILDER_AI_REPLAY_LATENCY_MS',
	'BUILDER_AI_DAILY_LIMIT',
	'BUILDER_AI_GLOBAL_DAILY_LIMIT',
	'BUILDER_AI_DAILY_OUTPUT_TOKENS',
	'NODE_ENV',
	'VERCEL',
]
for (const name of ENV_NAMES) delete process.env[name]

/** Sets these variables for the length of `fn` only. */
async function withEnv(values, fn) {
	const saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]))
	for (const [name, value] of Object.entries(values)) {
		if (value === undefined) delete process.env[name]
		else process.env[name] = value
	}
	try {
		return await fn()
	} finally {
		for (const name of ENV_NAMES) {
			if (saved[name] === undefined) delete process.env[name]
			else process.env[name] = saved[name]
		}
	}
}

let strayFetches = 0
globalThis.fetch = async () => {
	strayFetches++
	throw new Error('network is not allowed in this proof')
}

// What the code under test logs is kept, so the proof can look for content in it.
const logs = []
console.info = (...args) => logs.push(args.map(String).join(' '))
console.error = (...args) => logs.push(args.map(String).join(' '))

// The guards pull in the session machinery; errors.ts only needs their HttpError.
class HttpError extends Error {
	constructor(status, message) {
		super(message)
		this.status = status
	}
}
mock('@/lib/auth/guards', { HttpError })

const SRC = process.env.PROVE_SRC ?? 'src/lib/builder/ai'
const kit = loadTs(`${SRC}/schema-kit.ts`)
const E = loadTs(`${SRC}/errors.ts`)
const N = loadTs(`${SRC}/ndjson.ts`)
const R = loadTs(`${SRC}/replay.ts`)
const M = loadTs(`${SRC}/model.ts`)
const B = loadTs(`${SRC}/budget.ts`)
const D = loadTs(`${SRC}/builds.ts`)
const P = loadTs(`${SRC}/pool.ts`)
const { AI_LIMITS, AI_ERROR_CODES } = loadTs(`${SRC}/contract.ts`)

const { MongoClient, ObjectId } = rootRequire('mongodb')
const sdk = rootRequire('@anthropic-ai/sdk')
const { APIError, APIUserAbortError, APIConnectionError } = sdk

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

const registry = []
let section = 'general'
const group = (title) => {
	section = title
}
/** `slow` checks wait on real timers (heartbeat, watchdog); they run side by side at the end. */
const check = (name, fn, { slow = false } = {}) => registry.push({ name: `${section}: ${name}`, fn, slow })

let passed = 0
let failed = 0
async function execute({ name, fn }) {
	let timer
	try {
		await Promise.race([
			fn(),
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error('timed out after 60 s')), 60_000)
			}),
		])
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		const detail = String(error?.message ?? error)
			.split('\n')
			.slice(0, 8)
			.join(' | ')
		console.log(`FAIL  ${name} (${detail})`)
	} finally {
		clearTimeout(timer)
		M.__test.setClient(null)
	}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const DAY_MS = 86_400_000

/** Throws unless `promise` rejects with an AiError of `code`; returns the error. */
async function rejectsWith(promise, code) {
	try {
		await promise
	} catch (error) {
		assert.ok(error instanceof E.AiError, `expected an AiError, got ${error?.name}: ${error?.message}`)
		assert.equal(error.code, code)
		return error
	}
	assert.fail(`expected ${code}, but it resolved`)
}

/* -------------------------------------------------------------------------- */
/* A fake model                                                               */
/* -------------------------------------------------------------------------- */

const MARKERS = {
	system: 'SYSTEM-MARKER-7f3a1',
	content: 'CONTENT-MARKER-91bc2',
	reply: 'REPLY-MARKER-c0de3',
}

const apiUsage = (input, output, read = 0, write = 0, iterations = null) => ({
	input_tokens: input,
	output_tokens: output,
	cache_read_input_tokens: read,
	cache_creation_input_tokens: write,
	iterations,
})

const reply = ({ text = JSON.stringify({ note: MARKERS.reply }), stop = 'end_turn', model = 'claude-opus-5-5', usage = apiUsage(100, 50, 10, 20), content } = {}) => ({
	id: 'msg_fake',
	type: 'message',
	role: 'assistant',
	model,
	stop_reason: stop,
	content: content ?? [{ type: 'text', text }],
	usage,
})

const EVENTS = [
	{ type: 'message_start', message: {} },
	{ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
	{ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
	{ type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } },
]

const untilAborted = (signal) =>
	new Promise((_, reject) => {
		if (signal?.aborted) return reject(new APIUserAbortError())
		signal?.addEventListener('abort', () => reject(new APIUserAbortError()), { once: true })
	})

/** A stand-in for `client.beta.messages.stream`, scripted per check. */
function fakeModel(script = {}) {
	const calls = []
	const client = {
		beta: {
			messages: {
				stream(body, options) {
					calls.push({ body, options })
					const listeners = []
					const stream = {
						request_id: script.requestId === undefined ? 'req_fake_1' : script.requestId,
						on(event, listener) {
							if (event === 'streamEvent') listeners.push(listener)
							return stream
						},
						async finalMessage() {
							const signal = options?.signal
							if (script.throws) throw script.throws
							for (const event of script.events ?? EVENTS) {
								if (signal?.aborted) throw new APIUserAbortError()
								for (const listener of listeners) listener(event, {})
								await new Promise((resolve) => setImmediate(resolve))
							}
							if (script.hang) await untilAborted(signal)
							return script.message ?? reply()
						},
					}
					return stream
				},
			},
		},
	}
	M.__test.setClient(client)
	return { client, calls }
}

const SCHEMA = kit.obj({ seo: kit.obj({ title: kit.str, description: kit.str }), slots: kit.arr(kit.obj({ id: kit.str, value: kit.str })) })

const baseCall = (overrides = {}) => ({
	stage: 'write',
	effort: 'medium',
	maxTokens: 32000,
	system: [
		{ type: 'text', text: MARKERS.system, cache_control: { type: 'ephemeral', ttl: '1h' } },
		{ type: 'text', text: 'site context', cache_control: { type: 'ephemeral' } },
	],
	content: [{ type: 'text', text: MARKERS.content }],
	schema: SCHEMA,
	read: (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null),
	signal: new AbortController().signal,
	userKey: 'a'.repeat(32),
	replayKey: 'write-p3',
	log: { buildId: `bld_${'0'.repeat(24)}`, key: 'p3', attempt: 1 },
	...overrides,
})

/* -------------------------------------------------------------------------- */
/* schema-kit.ts                                                              */
/* -------------------------------------------------------------------------- */

group('schema-kit')

check('shapes and key order match section 11.9 and 11.12', () => {
	assert.deepEqual(kit.str, { type: 'string' })
	assert.deepEqual(kit.int, { type: 'integer' })
	assert.deepEqual(kit.bool, { type: 'boolean' })
	const values = ['a', 'b']
	const choice = kit.enumOf(values)
	values.push('c')
	assert.equal(JSON.stringify(choice), '{"type":"string","enum":["a","b"]}', 'enumOf copies its values')
	assert.equal(JSON.stringify(kit.arr(kit.str)), '{"type":"array","items":{"type":"string"}}')
	assert.equal(
		JSON.stringify(kit.obj({ title: kit.str, count: kit.int })),
		'{"type":"object","additionalProperties":false,"required":["title","count"],"properties":{"title":{"type":"string"},"count":{"type":"integer"}}}',
	)
	assert.equal(
		JSON.stringify(SCHEMA),
		'{"type":"object","additionalProperties":false,"required":["seo","slots"],"properties":{"seo":{"type":"object","additionalProperties":false,"required":["title","description"],"properties":{"title":{"type":"string"},"description":{"type":"string"}}},"slots":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["id","value"],"properties":{"id":{"type":"string"},"value":{"type":"string"}}}}}}',
		"the writer's schema as section 11.12 prints it",
	)
})

check('schemaHash is sha256 of JSON.stringify, first 16 hex, on 300 inputs', () => {
	const samples = [SCHEMA, {}, [], { a: 'é漢字😀'.repeat(40) }, { long: 'x'.repeat(100_000) }]
	for (let i = 0; i < 295; i++)
		samples.push({ i, text: Array.from({ length: randomInt(0, 200) }, () => String.fromCharCode(randomInt(1, 0xd7ff))).join('') })
	for (const sample of samples)
		assert.equal(kit.schemaHash(sample), createHash('sha256').update(JSON.stringify(sample)).digest('hex').slice(0, 16))
	assert.match(kit.schemaHash(SCHEMA), /^[0-9a-f]{16}$/)
})

/* -------------------------------------------------------------------------- */
/* errors.ts                                                                  */
/* -------------------------------------------------------------------------- */

group('errors')

const EXPECTED_CODES = {
	'bad-request': [400, false], unauthorized: [401, false], forbidden: [403, false], 'not-found': [404, false],
	'not-configured': [503, false], conflict: [409, false], 'not-ready': [409, true], busy: [429, true],
	expired: [410, false], 'too-large': [413, false], 'daily-limit': [429, false], 'global-limit': [429, false],
	'token-limit': [429, false], 'rate-limited': [429, true], refused: [422, false], timeout: [504, true],
	cancelled: [499, false], 'invalid-reply': [502, true], truncated: [502, true], upstream: [502, true],
	config: [503, false], 'attempts-exhausted': [409, false], 'home-failed': [409, false], network: [499, true],
}

check('every code has the status and retryability of section 15.7', () => {
	assert.deepEqual(Object.keys(EXPECTED_CODES).sort(), [...AI_ERROR_CODES].sort())
	for (const [code, [status, retryable]] of Object.entries(EXPECTED_CODES)) {
		const api = new E.AiError(code).toApi()
		assert.equal(api.code, code)
		assert.equal(api.status, status, code)
		assert.equal(api.retryable, retryable, code)
		assert.ok(api.message.length > 0 && api.message.length < 200, code)
	}
	assert.equal(new E.AiError('busy').toApi().retryAfterMs, 5000)
	const custom = new E.AiError('conflict', 'A build is already running for this site.', { buildId: 'bld_x' }).toApi()
	assert.deepEqual(custom, { code: 'conflict', message: 'A build is already running for this site.', status: 409, retryable: false, buildId: 'bld_x' })
	assert.deepEqual(Object.keys(new E.AiError('timeout').toApi()).sort(), ['code', 'message', 'retryable', 'status'])
	assert.equal(new E.AiError('bad-request', 'Up to 12 reviews.', { field: 'reviews' }).toApi().field, 'reviews')
})

check('toApiError: HttpError keeps its meaning, AiError is itself, anything else says nothing', () => {
	assert.deepEqual(E.toApiError(new HttpError(401, 'Sign in to continue.')), { code: 'unauthorized', message: 'Sign in to continue.', status: 401, retryable: false })
	assert.equal(E.toApiError(new HttpError(403, 'Your role does not allow that.')).code, 'forbidden')
	assert.equal(E.toApiError(new HttpError(404, 'Site not found.')).message, 'Site not found.')
	assert.equal(E.toApiError(new E.AiError('truncated')).code, 'truncated')
	const leak = new Error('E11000 duplicate key {"prompt":"secret brief"}')
	const api = E.toApiError(leak)
	assert.equal(api.code, 'upstream')
	assert.ok(!api.message.includes('secret') && !api.message.includes('E11000'))
	assert.equal(E.toApiError({ code: 'busy', message: 'Wait.', status: 429, retryable: true, retryAfterMs: 5000 }).retryAfterMs, 5000)
})

check('aiErrorResponse answers { error } with the status, and logs only a name', async () => {
	const response = E.aiErrorResponse(new E.AiError('daily-limit'))
	assert.equal(response.status, 429)
	assert.equal(response.headers.get('cache-control'), 'no-store')
	assert.equal((await response.json()).error.code, 'daily-limit')
	const before = logs.length
	const unknown = E.aiErrorResponse(new TypeError('secret brief text'))
	assert.equal(unknown.status, 502)
	const lines = logs.slice(before).join('\n')
	assert.ok(lines.includes('TypeError') && !lines.includes('secret brief'), 'the unexpected error is logged by name only')
})

/* -------------------------------------------------------------------------- */
/* model.ts with a fake client                                                */
/* -------------------------------------------------------------------------- */

group('model')

check('the request is exactly section 3.4: raw schema, betas, fallbacks, effort, metadata, SDK options', async () => {
	await withEnv({ BUILDER_AI_MODEL: 'claude-opus-5-5' }, async () => {
		const fake = fakeModel()
		const call = baseCall()
		const result = await M.callStructured(call)
		assert.equal(fake.calls.length, 1)
		const { body, options } = fake.calls[0]
		assert.deepEqual(Object.keys(body).sort(), ['betas', 'fallbacks', 'max_tokens', 'messages', 'metadata', 'model', 'output_config', 'system'])
		assert.equal(body.model, 'claude-opus-5-5')
		assert.equal(body.max_tokens, 32000)
		assert.deepEqual(body.betas, ['server-side-fallback-2026-07-01'])
		assert.equal(body.fallbacks, 'default')
		assert.deepEqual(body.output_config, { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } })
		assert.equal(body.output_config.format.schema, SCHEMA, 'the module constant itself, not a transformed copy')
		assert.equal(body.system, call.system)
		assert.deepEqual(body.messages, [{ role: 'user', content: call.content }])
		assert.deepEqual(body.metadata, { user_id: 'a'.repeat(32) })
		assert.ok(!('thinking' in body) && !('temperature' in body) && !('tools' in body))
		assert.equal(options.signal, call.signal)
		assert.equal(options.timeout, 120_000)
		assert.equal(options.maxRetries, 2)
		assert.deepEqual(result.value, { note: MARKERS.reply })
		assert.equal(result.requestId, 'req_fake_1')
		assert.equal(result.stop, 'end_turn')
		assert.equal(result.model, 'claude-opus-5-5')
	})
})

check('betas, fallbacks and effort are gated by the model', async () => {
	const cases = [
		['claude-opus-5-5', true, true],
		['claude-sonnet-5-5', true, true],
		['claude-fable-5', true, true],
		['claude-sonnet-4-6', false, true],
		['claude-opus-4-5', false, true],
		['claude-haiku-4-5', false, false],
	]
	for (const [model, fallbacks, effort] of cases)
		await withEnv({ BUILDER_AI_MODEL: model }, async () => {
			const fake = fakeModel({ message: reply({ model }) })
			await M.callStructured(baseCall({ effort: 'low' }))
			const { body } = fake.calls[0]
			assert.equal(body.model, model)
			assert.equal('betas' in body, fallbacks, `${model} betas`)
			assert.equal('fallbacks' in body, fallbacks, `${model} fallbacks`)
			assert.equal(body.output_config.effort, effort ? 'low' : undefined, `${model} effort`)
			assert.deepEqual(body.output_config.format, { type: 'json_schema', schema: SCHEMA })
		})
	await withEnv({}, async () => assert.equal(M.builderAiModel(), 'claude-opus-5-5'))
})

check('stop reasons: refusal, max_tokens and any other stop are errors that keep the usage', async () => {
	const cases = [
		['refusal', 'refused', 422, false],
		['max_tokens', 'truncated', 502, true],
		['pause_turn', 'invalid-reply', 502, true],
		['stop_sequence', 'invalid-reply', 502, true],
		['model_context_window_exceeded', 'invalid-reply', 502, true],
	]
	for (const [stop, code, status, retryable] of cases) {
		fakeModel({ message: reply({ stop, usage: apiUsage(1000, 32000) }) })
		const error = await rejectsWith(M.callStructured(baseCall()), code)
		assert.equal(error.status, status, stop)
		assert.equal(error.retryable, retryable, stop)
		assert.equal(error.usage?.outputTokens, 32000, `${stop}: the tokens spent are still known`)
		assert.equal(error.usage?.calls, 1)
	}
})

check('text: every text block joined (a fallback continuation), thinking ignored', async () => {
	fakeModel({
		message: reply({
			content: [
				{ type: 'thinking', thinking: 'never { parsed' },
				{ type: 'text', text: '{"seo":{"title":"Ro' },
				{ type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-sonnet-5-5' }, trigger: {} },
				{ type: 'text', text: 'ofs","description":"x"},"slots":[]}' },
			],
		}),
	})
	const result = await M.callStructured(baseCall())
	assert.deepEqual(result.value, { seo: { title: 'Roofs', description: 'x' }, slots: [] })
})

check('unusable replies are invalid-reply: bad JSON, too long, read() null or throwing', async () => {
	fakeModel({ message: reply({ text: '{"not json' }) })
	await rejectsWith(M.callStructured(baseCall()), 'invalid-reply')
	fakeModel({ message: reply({ text: JSON.stringify({ pad: 'x'.repeat(AI_LIMITS.replyMaxChars) }) }) })
	await rejectsWith(M.callStructured(baseCall()), 'invalid-reply')
	fakeModel()
	await rejectsWith(M.callStructured(baseCall({ read: () => null })), 'invalid-reply')
	fakeModel()
	await rejectsWith(
		M.callStructured(baseCall({ read: () => { throw new Error('reader bug') } })),
		'invalid-reply',
	)
	fakeModel({ message: reply({ text: '[1,2]' }) })
	await rejectsWith(M.callStructured(baseCall()), 'invalid-reply')
})

check('enum casing: values reach read() as sent, so a case-insensitive reader matches', async () => {
	const LAYOUTS = ['faq-accordion:split', 'cta-band:card']
	const tolerant = (value) => {
		const raw = String(value?.layout ?? '').trim().toLowerCase()
		return LAYOUTS.includes(raw) ? { layout: raw } : null
	}
	const strict = (value) => (LAYOUTS.includes(value?.layout) ? value : null)
	fakeModel({ message: reply({ text: '{"layout":"  FAQ-Accordion:SPLIT "}' }) })
	assert.deepEqual((await M.callStructured(baseCall({ read: tolerant }))).value, { layout: 'faq-accordion:split' })
	fakeModel({ message: reply({ text: '{"layout":"FAQ-ACCORDION:SPLIT"}' }) })
	await rejectsWith(M.callStructured(baseCall({ read: strict })), 'invalid-reply')
})

check('usage: top level normally; summed over usage.iterations when a fallback served', async () => {
	fakeModel({ message: reply({ usage: apiUsage(1200, 340, 900, 300) }) })
	const plain = await M.callStructured(baseCall())
	assert.deepEqual(
		{ ...plain.usage, ms: 0 },
		{ inputTokens: 1200, outputTokens: 340, cacheReadTokens: 900, cacheWriteTokens: 300, calls: 1, ms: 0 },
	)
	assert.equal(plain.fallback, false)

	const iterations = [
		{ type: 'message', model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 120, cache_read_input_tokens: 800, cache_creation_input_tokens: 0, cache_creation: null },
		{ type: 'compaction', input_tokens: 99999, output_tokens: 99999, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
		{ type: 'fallback_message', model: 'claude-sonnet-5-5', input_tokens: 1100, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 700, cache_creation: null },
	]
	fakeModel({ message: reply({ model: 'claude-sonnet-5-5', usage: apiUsage(1100, 400, 0, 700, iterations) }) })
	const served = await M.callStructured(baseCall())
	assert.equal(served.fallback, true)
	assert.equal(served.model, 'claude-sonnet-5-5', 'the served model')
	assert.deepEqual(
		{ ...served.usage, ms: 0 },
		{ inputTokens: 2100, outputTokens: 520, cacheReadTokens: 800, cacheWriteTokens: 700, calls: 1, ms: 0 },
		'the declined attempt is billed too; compaction is not this call',
	)
	fakeModel({ message: reply({ usage: apiUsage(10, 5, 0, 0, []) }) })
	assert.equal((await M.callStructured(baseCall())).usage.inputTokens, 10, 'an empty iterations list keeps the top level')
})

check('stream events: onModel once, then thinking, then writing, each once; a throwing callback is harmless', async () => {
	fakeModel()
	const seen = []
	await M.callStructured(
		baseCall({
			onModel: () => {
				seen.push('model')
				throw new Error('callback bug')
			},
			onStage: (stage) => seen.push(stage),
		}),
	)
	assert.deepEqual(seen, ['model', 'thinking', 'writing'])
})

check('abort reasons: deadline is timeout, cancel is cancelled, client is network', async () => {
	fakeModel({ hang: true })
	const timedOut = await rejectsWith(M.callStructured(baseCall({ signal: AbortSignal.timeout(40) })), 'timeout')
	assert.equal(timedOut.status, 504)
	assert.equal(timedOut.retryable, true)

	const stop = new AbortController()
	fakeModel({ hang: true })
	const pending = M.callStructured(baseCall({ signal: stop.signal }))
	setTimeout(() => stop.abort(new N.BuildAbortError('cancel')), 20)
	const cancelled = await rejectsWith(pending, 'cancelled')
	assert.equal(cancelled.retryable, false)

	const gone = new AbortController()
	fakeModel({ hang: true })
	const away = M.callStructured(baseCall({ signal: gone.signal }))
	setTimeout(() => gone.abort(), 20)
	const network = await rejectsWith(away, 'network')
	assert.equal(network.retryable, true)

	// A combined signal still says which source fired first.
	const watchdog = new AbortController()
	const combined = AbortSignal.any([new AbortController().signal, watchdog.signal, AbortSignal.timeout(60_000)])
	watchdog.abort(new N.BuildAbortError('cancel'))
	assert.equal(N.abortReasonOf(combined), 'cancel')
	assert.equal(N.abortReasonOf(AbortSignal.abort()), 'client')
	assert.equal(N.abortReasonOf(new AbortController().signal), null)

	// Already aborted: the model is never called.
	const fake = fakeModel()
	await rejectsWith(M.callStructured(baseCall({ signal: AbortSignal.abort(new N.BuildAbortError('cancel')) })), 'cancelled')
	assert.equal(fake.calls.length, 0)
})

const providerError = (status, { message = 'provider words', type = 'invalid_request_error', headers = {} } = {}) =>
	APIError.generate(status, { type: 'error', error: { type, message } }, undefined, new Headers(headers))

check('classification by status, as the table in section 3.4', async () => {
	const signal = new AbortController().signal
	const reason = () => 'client'
	const cases = [
		[providerError(401, { type: 'authentication_error' }), 'config', false],
		[providerError(402, { type: 'billing_error' }), 'config', false],
		[providerError(403, { type: 'permission_error' }), 'config', false],
		[providerError(404, { type: 'not_found_error' }), 'config', false],
		[providerError(400, { message: 'Your credit balance is too low to access the Anthropic API.' }), 'config', false],
		[providerError(400, { message: 'model: claude-x is not supported' }), 'config', false],
		[providerError(400, { message: 'Schema is too complex for compilation.' }), 'invalid-reply', false],
		[providerError(413, { type: 'request_too_large' }), 'invalid-reply', false],
		[providerError(422), 'invalid-reply', false],
		[providerError(429, { type: 'rate_limit_error' }), 'rate-limited', true],
		[providerError(408), 'upstream', true],
		[providerError(409), 'upstream', true],
		[providerError(500, { type: 'api_error' }), 'upstream', true],
		[providerError(529, { type: 'overloaded_error' }), 'upstream', true],
		[new APIConnectionError({ message: 'socket hang up' }), 'upstream', true],
		[new Error('anything'), 'upstream', true],
		[null, 'upstream', true],
	]
	for (const [error, code, retryable] of cases) {
		const result = M.classifyModelError(error, signal, reason)
		assert.equal(result.code, code, `${error?.status ?? error?.name} → ${code}`)
		assert.equal(result.retryable, retryable, `${error?.status ?? error?.name} retryable`)
		assert.ok(!result.message.includes('provider words') && !result.message.includes('credit'), 'never the provider text')
	}
	const hostile = {}
	Object.defineProperty(hostile, 'status', { get: () => { throw new Error('boom') } })
	assert.equal(M.classifyModelError(hostile, signal, reason).code, 'upstream')
	const own = new E.AiError('refused')
	assert.equal(M.classifyModelError(own, signal, reason), own)
	const aborted = AbortSignal.abort()
	assert.equal(M.classifyModelError(providerError(500), aborted, () => 'deadline').code, 'timeout', 'an aborted signal decides first')
})

check('429: retryAfterMs from retry-after-ms or retry-after, capped at 30 s, absent when unknown', () => {
	const signal = new AbortController().signal
	const of = (headers) => M.classifyModelError(providerError(429, { headers }), signal, () => 'client').toApi().retryAfterMs
	assert.equal(of({ 'retry-after-ms': '1500' }), 1500)
	assert.equal(of({ 'retry-after': '3' }), 3000)
	assert.equal(of({ 'retry-after': '120' }), 30_000)
	assert.equal(of({ 'retry-after-ms': '999999' }), 30_000)
	assert.equal(of({ 'retry-after': new Date(Date.now() + 10_000).toUTCString() }) > 5000, true)
	assert.equal(of({}), undefined)
	assert.equal(of({ 'retry-after': 'soon' }), undefined)
	assert.equal(of({ 'retry-after': '0' }), undefined)
})

check('an SDK failure inside callStructured is classified and logged by status and type only', async () => {
	fakeModel({ throws: providerError(400, { message: `Schema is too complex ${MARKERS.reply}` }) })
	const before = logs.length
	const error = await rejectsWith(M.callStructured(baseCall()), 'invalid-reply')
	assert.equal(error.retryable, false)
	assert.deepEqual(error.provider, { status: 400, type: 'invalid_request_error' })
	const line = logs.slice(before).find((entry) => entry.includes('"code":"invalid-reply"'))
	assert.ok(line, 'a failure line was logged')
	const logged = JSON.parse(line.slice(line.indexOf('{')))
	assert.deepEqual(logged, { buildId: `bld_${'0'.repeat(24)}`, stage: 'write', key: 'p3', code: 'invalid-reply', status: 400, type: 'invalid_request_error' })
})

check('one info line per call with the spec fields, never content', async () => {
	fakeModel()
	const before = logs.length
	await M.callStructured(baseCall())
	const line = logs.slice(before).find((entry) => entry.startsWith('[ai-build]') && entry.includes('"requestId"'))
	assert.ok(line)
	const logged = JSON.parse(line.slice(line.indexOf('{')))
	assert.deepEqual(Object.keys(logged), ['buildId', 'stage', 'key', 'attempt', 'model', 'requestId', 'stop', 'ms', 'usage', 'fallback'])
	assert.equal(logged.attempt, 1)
	assert.equal(logged.requestId, 'req_fake_1')
})

check('no key, no replay, no injected client: not-configured, and nothing leaves the process', async () => {
	M.__test.setClient(null)
	await withEnv({}, async () => {
		assert.equal(M.builderAiConfigured(), false)
		await rejectsWith(M.callStructured(baseCall()), 'not-configured')
	})
	await withEnv({ ANTHROPIC_API_KEY: '  ' }, async () => assert.equal(M.builderAiConfigured(), false))
	await withEnv({ ANTHROPIC_API_KEY: 'sk-test' }, async () => assert.equal(M.builderAiConfigured(), true))
})

/* ---- replay and record seams ---- */

const REPLAY_DIR = mkdtempSync(path.join(os.tmpdir(), 'rb-ai-replay-'))
const RECORD_DIR = path.join(mkdtempSync(path.join(os.tmpdir(), 'rb-ai-record-')), 'out')
const fixture = (name, value) => writeFileSync(path.join(REPLAY_DIR, `${name}.json`), JSON.stringify(value))
fixture('plan', { reply: { pages: [{ name: 'Home' }] }, usage: apiUsage(5000, 3000, 4000, 0) })
fixture('write-p3', { reply: { seo: { title: 'T', description: 'D' }, slots: [] }, usage: { inputTokens: 7, outputTokens: 8, cacheReadTokens: 9, cacheWriteTokens: 1 }, model: 'claude-recorded' })
fixture('outline', { reply: { pages: [] }, stop: 'max_tokens', usage: apiUsage(1, 2) })
fixture('bad-400', { error: { status: 400, type: 'invalid_request_error' } })
fixture('busy-429', { error: { status: 429, type: 'rate_limit_error', headers: { 'retry-after': '3' } } })
fixture('down', { error: { type: 'api_error' } })
writeFileSync(path.join(REPLAY_DIR, 'broken.json'), '{ not json')

check('replay: fixtures answer through the same read, usage and stop checks', async () => {
	const fake = fakeModel()
	await withEnv({ BUILDER_AI_REPLAY_DIR: REPLAY_DIR }, async () => {
		assert.equal(R.replayEnabled(), true)
		assert.equal(M.builderAiConfigured(), true, 'configured by the replay seam alone')
		const seen = []
		const plan = await M.callStructured(baseCall({ replayKey: 'plan', onModel: () => seen.push('model'), onStage: (stage) => seen.push(stage) }))
		assert.deepEqual(plan.value, { pages: [{ name: 'Home' }] })
		assert.equal(plan.usage.inputTokens, 5000)
		assert.equal(plan.usage.cacheReadTokens, 4000)
		assert.equal(plan.requestId, null)
		assert.equal(plan.model, 'claude-opus-5-5')
		assert.deepEqual(seen, ['model', 'thinking', 'writing'])
		const write = await M.callStructured(baseCall({ replayKey: 'write-p3' }))
		assert.deepEqual({ ...write.usage, ms: 0 }, { inputTokens: 7, outputTokens: 8, cacheReadTokens: 9, cacheWriteTokens: 1, calls: 1, ms: 0 })
		assert.equal(write.model, 'claude-recorded')
		await rejectsWith(M.callStructured(baseCall({ replayKey: 'outline' })), 'truncated')
		await rejectsWith(M.callStructured(baseCall({ replayKey: 'missing-fixture' })), 'invalid-reply')
		await rejectsWith(M.callStructured(baseCall({ replayKey: 'broken' })), 'invalid-reply')
		await rejectsWith(M.callStructured(baseCall({ replayKey: '../plan' })), 'invalid-reply')
		await rejectsWith(M.callStructured(baseCall({ replayKey: 'plan', read: () => null })), 'invalid-reply')
	})
	assert.equal(fake.calls.length, 0, 'the model was never called')
})

check('replay: recorded errors are raised as the SDK would, and never reach "the model"', async () => {
	await withEnv({ BUILDER_AI_REPLAY_DIR: REPLAY_DIR }, async () => {
		let reached = false
		const bad = await rejectsWith(M.callStructured(baseCall({ replayKey: 'bad-400', onModel: () => (reached = true) })), 'invalid-reply')
		assert.equal(bad.retryable, false, 'a rejected request is not retried in a loop')
		assert.deepEqual(bad.provider, { status: 400, type: 'invalid_request_error' })
		assert.equal(reached, false)
		const busy = await rejectsWith(M.callStructured(baseCall({ replayKey: 'busy-429' })), 'rate-limited')
		assert.equal(busy.toApi().retryAfterMs, 3000)
		await rejectsWith(M.callStructured(baseCall({ replayKey: 'down' })), 'upstream')
	})
})

check('replay: the latency is honoured, and an abort during it is classified by its reason', async () => {
	await withEnv({ BUILDER_AI_REPLAY_DIR: REPLAY_DIR, BUILDER_AI_REPLAY_LATENCY_MS: '250' }, async () => {
		const started = Date.now()
		await M.callStructured(baseCall({ replayKey: 'plan' }))
		assert.ok(Date.now() - started >= 240, 'waited for the latency')
		const stop = new AbortController()
		const pending = M.callStructured(baseCall({ replayKey: 'plan', signal: stop.signal }))
		setTimeout(() => stop.abort(new N.BuildAbortError('cancel')), 30)
		const began = Date.now()
		await rejectsWith(pending, 'cancelled')
		assert.ok(Date.now() - began < 200, 'stopped at once, not after the latency')
		await rejectsWith(M.callStructured(baseCall({ replayKey: 'plan', signal: AbortSignal.timeout(20) })), 'timeout')
	})
	await withEnv({ BUILDER_AI_REPLAY_DIR: REPLAY_DIR, BUILDER_AI_REPLAY_LATENCY_MS: 'soon' }, async () => {
		const started = Date.now()
		await M.callStructured(baseCall({ replayKey: 'plan' }))
		assert.ok(Date.now() - started < 200, 'a garbage latency is 0')
	})
})

check('replay and record are refused when NODE_ENV=production or VERCEL is set', async () => {
	for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) {
		await withEnv({ BUILDER_AI_REPLAY_DIR: REPLAY_DIR, BUILDER_AI_RECORD_DIR: RECORD_DIR, ...env }, async () => {
			assert.equal(R.replayEnabled(), false, JSON.stringify(env))
			assert.equal(R.recordEnabled(), false, JSON.stringify(env))
			assert.equal(M.builderAiConfigured(), false, 'no key: not configured, whatever the replay dir says')
			const fake = fakeModel()
			const result = await M.callStructured(baseCall({ replayKey: 'plan' }))
			assert.equal(fake.calls.length, 1, 'the (fake) model answered, not the fixture')
			assert.deepEqual(result.value, { note: MARKERS.reply })
			await rejectsWith(R.replayReply('plan', new AbortController().signal), 'not-configured')
		})
	}
	assert.equal(existsSync(path.join(RECORD_DIR, 'plan.json')), false, 'nothing was recorded in production')
})

check('record: a real reply is written under its replayKey and replays the same', async () => {
	const usage = apiUsage(321, 123, 0, 45)
	fakeModel({ message: reply({ text: '{"seo":{"title":"Recorded","description":"x"},"slots":[]}', usage }) })
	await withEnv({ BUILDER_AI_RECORD_DIR: RECORD_DIR }, async () => {
		await M.callStructured(baseCall({ replayKey: 'write-p7' }))
	})
	const saved = JSON.parse(readFileSync(path.join(RECORD_DIR, 'write-p7.json'), 'utf8'))
	assert.deepEqual(saved, { reply: { seo: { title: 'Recorded', description: 'x' }, slots: [] }, usage, model: 'claude-opus-5-5', stop: 'end_turn' })
	const fake = fakeModel()
	await withEnv({ BUILDER_AI_REPLAY_DIR: RECORD_DIR }, async () => {
		const again = await M.callStructured(baseCall({ replayKey: 'write-p7' }))
		assert.equal(again.value.seo.title, 'Recorded')
		assert.equal(again.usage.inputTokens, 321)
	})
	assert.equal(fake.calls.length, 0)
})

check('no log line ever carried the prompt, the content or the reply', () => {
	const all = logs.join('\n')
	for (const marker of Object.values(MARKERS)) assert.ok(!all.includes(marker), `${marker} leaked into the log`)
	assert.equal(strayFetches, 0)
})

/* -------------------------------------------------------------------------- */
/* ndjson.ts                                                                  */
/* -------------------------------------------------------------------------- */

group('ndjson')

/** Every line of a finished stream. */
async function readAll(response) {
	const text = await response.text()
	return text
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line))
}

const ACCEPTED = { buildId: `bld_${'1'.repeat(24)}`, key: 'p2', attempt: 1 }
const failWith = (seen) => async (error, ctx) => {
	seen.error = error
	seen.reason = ctx.reason()
	return { error: E.toApiError(error), data: { key: 'p2' } }
}

check('accepted first, exactly one final done, the NDJSON headers; run cannot forge lines', async () => {
	const response = N.ndjsonResponse(
		new Request('http://localhost/x', { method: 'POST' }),
		async (ctx) => {
			ctx.emit({ t: 'stage', stage: 'thinking' })
			ctx.emit({ t: 'done', data: 'forged' })
			ctx.emit({ t: 'error', error: { code: 'upstream' } })
			ctx.emit({ t: 'accepted', buildId: 'forged' })
			ctx.emit({ t: 'stage', stage: 'writing' })
			assert.ok(ctx.deadline(240_000) <= AI_LIMITS.routeBudgetMs)
			assert.equal(ctx.deadline(45_000), 45_000)
			assert.equal(ctx.reason(), null)
			return { answer: 42 }
		},
		{ budgetMs: AI_LIMITS.routeBudgetMs, onError: async () => assert.fail('no error expected'), accepted: ACCEPTED },
	)
	assert.equal(response.status, 200)
	assert.equal(response.headers.get('content-type'), 'application/x-ndjson; charset=utf-8')
	assert.equal(response.headers.get('cache-control'), 'no-store')
	assert.equal(response.headers.get('x-accel-buffering'), 'no')
	const events = await readAll(response)
	assert.deepEqual(events, [
		{ t: 'accepted', ...ACCEPTED },
		{ t: 'stage', stage: 'thinking' },
		{ t: 'stage', stage: 'writing' },
		{ t: 'done', data: { answer: 42 } },
	])
})

check('a failure: onError persists first, then exactly one error line with its data', async () => {
	const seen = {}
	let persisted = false
	const response = N.ndjsonResponse(
		new Request('http://localhost/x'),
		async () => {
			throw new E.AiError('invalid-reply')
		},
		{
			budgetMs: AI_LIMITS.routeBudgetMs,
			onError: async (error, ctx) => {
				await sleep(30)
				persisted = true
				return failWith(seen)(error, ctx)
			},
			accepted: ACCEPTED,
		},
	)
	const events = await readAll(response)
	assert.equal(persisted, true)
	assert.deepEqual(events.map((event) => event.t), ['accepted', 'error'])
	assert.equal(events[1].error.code, 'invalid-reply')
	assert.deepEqual(events[1].data, { key: 'p2' })
	// An onError that itself fails still ends the stream with one error line.
	const broken = await readAll(
		N.ndjsonResponse(new Request('http://localhost/x'), async () => { throw new Error('x') }, { budgetMs: 1000, onError: async () => { throw new Error('y') }, accepted: ACCEPTED }),
	)
	assert.deepEqual(broken.map((event) => event.t), ['accepted', 'error'])
	assert.equal(broken[1].error.code, 'upstream')
})

check('the reader going away aborts the work with reason client (a network failure)', async () => {
	fakeModel({ hang: true })
	const seen = {}
	let settled
	const done = new Promise((resolve) => (settled = resolve))
	const response = N.ndjsonResponse(
		new Request('http://localhost/x'),
		async (ctx) => {
			try {
				return await M.callStructured(baseCall({ signal: ctx.signal }))
			} finally {
				ctx.emit({ t: 'stage', stage: 'checking' }) // after the close: a no-op, never a throw
			}
		},
		{
			budgetMs: AI_LIMITS.routeBudgetMs,
			onError: async (error, ctx) => {
				const result = await failWith(seen)(error, ctx)
				settled()
				return result
			},
			accepted: ACCEPTED,
		},
	)
	const reader = response.body.getReader()
	const first = JSON.parse(new TextDecoder().decode((await reader.read()).value))
	assert.equal(first.t, 'accepted')
	await reader.cancel()
	await done
	assert.equal(seen.reason, 'client')
	assert.equal(seen.error.code, 'network')
	assert.equal(seen.error.retryable, true)
})

check('request.signal aborting is reason client too', async () => {
	fakeModel({ hang: true })
	const seen = {}
	const controller = new AbortController()
	const response = N.ndjsonResponse(
		new Request('http://localhost/x', { signal: controller.signal }),
		async (ctx) => M.callStructured(baseCall({ signal: ctx.signal })),
		{ budgetMs: AI_LIMITS.routeBudgetMs, onError: failWith(seen), accepted: ACCEPTED },
	)
	setTimeout(() => controller.abort(), 30)
	const events = await readAll(response)
	assert.equal(seen.reason, 'client')
	assert.equal(events.at(-1).error.code, 'network')
})

check('the route budget aborts the work with reason deadline (a timeout)', async () => {
	fakeModel({ hang: true })
	const seen = {}
	const started = Date.now()
	const response = N.ndjsonResponse(
		new Request('http://localhost/x'),
		async (ctx) => {
			assert.ok(ctx.deadline(240_000) <= 300)
			return M.callStructured(baseCall({ signal: ctx.signal }))
		},
		{ budgetMs: 300, onError: failWith(seen), accepted: ACCEPTED },
	)
	const events = await readAll(response)
	assert.ok(Date.now() - started < 2000)
	assert.equal(seen.reason, 'deadline')
	assert.equal(events.at(-1).error.code, 'timeout')
	assert.equal(events.at(-1).error.retryable, true)
	// A budget already spent before the stream opened leaves nothing for a call.
	const late = N.ndjsonResponse(new Request('http://localhost/x'), async (ctx) => ctx.deadline(45_000), {
		budgetMs: 10_000,
		startedAt: Date.now() - 20_000,
		onError: failWith({}),
		accepted: ACCEPTED,
	})
	const lateEvents = await readAll(late)
	assert.ok(lateEvents.at(-1).t === 'error' || lateEvents.at(-1).data === 0)
})

check('a heartbeat every 10 s with the elapsed time', async () => {
	const response = N.ndjsonResponse(new Request('http://localhost/x'), async () => {
		await sleep(10_700)
		return 'ok'
	}, { budgetMs: AI_LIMITS.routeBudgetMs, onError: failWith({}), accepted: ACCEPTED })
	const events = await readAll(response)
	const beats = events.filter((event) => event.t === 'hb')
	assert.equal(beats.length, 1, JSON.stringify(events))
	assert.ok(beats[0].ms >= 9_900 && beats[0].ms <= 10_700, `hb at ${beats[0].ms} ms`)
	assert.deepEqual(events.map((event) => event.t), ['accepted', 'hb', 'done'])
}, { slow: true })

check('the watchdog sees a cancel within 5 s and aborts with reason cancel', async () => {
	fakeModel({ hang: true })
	const seen = {}
	let flagged = 0
	let polls = 0
	setTimeout(() => (flagged = Date.now()), 600)
	const response = N.ndjsonResponse(
		new Request('http://localhost/x'),
		async (ctx) => M.callStructured(baseCall({ signal: ctx.signal })),
		{
			budgetMs: AI_LIMITS.routeBudgetMs,
			isCancelled: async () => {
				polls++
				return flagged > 0
			},
			onError: failWith(seen),
			accepted: ACCEPTED,
		},
	)
	const events = await readAll(response)
	const waited = Date.now() - flagged
	assert.ok(flagged > 0 && waited <= 5_600, `stopped ${waited} ms after the cancel`)
	assert.ok(polls >= 1)
	assert.equal(seen.reason, 'cancel')
	assert.equal(events.at(-1).error.code, 'cancelled')
}, { slow: true })

/* -------------------------------------------------------------------------- */
/* Mongo: budget, builds, pool                                                */
/* -------------------------------------------------------------------------- */

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 5000 })
let db
const created = { workspaces: new Set(), sites: new Set(), days: new Set() }

let dayCursor = Date.UTC(2200 + randomInt(0, 600), 0, 1) + randomInt(0, 300) * DAY_MS
/** Noon UTC on a day no other check (and nothing real) uses. */
function freshNow() {
	dayCursor += DAY_MS
	const at = new Date(dayCursor + 12 * 3_600_000)
	created.days.add(at.toISOString().slice(0, 10))
	return at
}
const newWorkspace = () => {
	const id = new ObjectId()
	created.workspaces.add(id.toHexString())
	return id
}
const newSite = () => {
	const id = new ObjectId()
	created.sites.add(id.toHexString())
	return id
}
const counter = async (id) => (await db.collection('mediaAiUsage').findOne({ _id: id })) ?? null
const wsKey = (workspaceId, at) => `builder:${workspaceId.toHexString()}:${at.toISOString().slice(0, 10)}`
const globalKey = (at) => `builder:global:${at.toISOString().slice(0, 10)}`

const ZERO = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 0, ms: 0 }
const MARK = {
	prompt: 'PROMPT-MARKER-55e1',
	review: 'REVIEW-MARKER-77a2',
	business: 'BUSINESS-MARKER-91f3',
	writer: 'WRITER-CONTEXT-MARKER-3bd4',
	photo: 'https://store9.public.blob.vercel-storage.com/PHOTO-MARKER-ee05.jpg',
	body: 'WRITTEN-BODY-MARKER-c9a6',
}

const pageDoc = (key, overrides = {}) => ({
	key,
	pageId: `pg_${key}`,
	name: `Page ${key}`,
	slug: key === 'p1' ? '/' : `page-${key}`,
	status: 'pending',
	attempts: 0,
	leaseId: null,
	leaseUntil: null,
	startedAt: null,
	writtenAt: null,
	reachedModel: false,
	refunded: false,
	extraUnits: 0,
	lastError: null,
	issues: [],
	written: null,
	usage: { ...ZERO },
	...overrides,
})

const ACTIVE_STATUSES = ['planning', 'planned', 'writing', 'ready']

function buildDoc({ siteId = newSite(), workspaceId = newWorkspace(), userId = 'user-a', status = 'planned', pages = [], budget, at = new Date(), ...rest } = {}) {
	return {
		_id: D.newBuildId(),
		siteId,
		workspaceId,
		userId,
		...(ACTIVE_STATUSES.includes(status) ? { active: true } : {}),
		status,
		mode: 'site',
		placement: 'replace-site',
		targetPageId: null,
		input: {
			mode: 'site', placement: 'replace-site', targetPageId: null, prompt: MARK.prompt, pins: {},
			business: { name: MARK.business, type: '', phone: '', email: '', city: '', region: '', areas: [] },
			reviews: [{ quote: MARK.review, name: 'Ann', role: '', source: '' }],
			photoIds: [], useLibrary: false, fast: false,
		},
		snapshot: { siteRev: 1, pages: [], chrome: { header: 'bar', footer: 'columns', ctaLabel: '', ctaHref: '', menu: [] }, theme: null },
		context: null,
		plan: null,
		design: null,
		chrome: null,
		images: null,
		writerContext: MARK.writer,
		outline: { status: 'none', attempts: 0, leaseId: null, leaseUntil: null },
		pages,
		profilePatch: [],
		budget: budget ?? { day: at.toISOString().slice(0, 10), reserved: 1 + pages.length, refunded: 0 },
		usage: { ...ZERO },
		model: 'claude-opus-5-5',
		servedModels: [],
		fallbackUsed: false,
		requestIds: [],
		issues: [],
		error: null,
		cancelRequestedAt: null,
		createdAt: at,
		updatedAt: at,
		expiresAt: new Date(Date.now() + DAY_MS),
		landedAt: null,
		...rest,
	}
}

const builds = () => D.buildsOf(db)
const insert = async (doc) => {
	created.sites.add(doc.siteId.toHexString())
	created.workspaces.add(doc.workspaceId.toHexString())
	await builds().insertOne(doc)
	return doc
}
const reload = (id) => builds().findOne({ _id: id })

/** Reserves `units` for a fresh workspace on a fresh day, and returns a build document charged with them. */
async function chargedBuild(units, options = {}) {
	const at = freshNow()
	const workspaceId = newWorkspace()
	const reserved = await B.reserveUnits(db, workspaceId, units, at)
	assert.deepEqual(reserved, { ok: true, day: at.toISOString().slice(0, 10) })
	const doc = buildDoc({ workspaceId, at, budget: { day: reserved.day, reserved: units, refunded: 0 }, ...options })
	return { doc, at, workspaceId }
}

group('budget')

check('50 concurrent reservations on a fresh day never over-reserve and never read E11000 as exhausted', async () => {
	await withEnv({ BUILDER_AI_DAILY_LIMIT: '30' }, async () => {
		const at = freshNow()
		const workspaceId = newWorkspace()
		const results = await Promise.all(Array.from({ length: 50 }, () => B.reserveUnits(db, workspaceId, 1, at)))
		assert.equal(results.filter((result) => result.ok).length, 30)
		assert.ok(results.filter((result) => !result.ok).every((result) => result.scope === 'workspace'))
		assert.equal((await counter(wsKey(workspaceId, at))).count, 30)
		assert.equal((await counter(globalKey(at))).count, 30)
	})
	await withEnv({ BUILDER_AI_DAILY_LIMIT: '100' }, async () => {
		for (let round = 0; round < 3; round++) {
			const at = freshNow()
			const workspaceId = newWorkspace()
			const results = await Promise.all(Array.from({ length: 50 }, () => B.reserveUnits(db, workspaceId, 1, at)))
			assert.equal(results.filter((result) => result.ok).length, 50, 'a duplicate-key race was read as exhausted')
			assert.equal((await counter(wsKey(workspaceId, at))).count, 50)
		}
	})
})

check('several units at once: all or nothing, against both limits', async () => {
	await withEnv({ BUILDER_AI_DAILY_LIMIT: '10' }, async () => {
		const at = freshNow()
		const workspaceId = newWorkspace()
		assert.equal((await B.reserveUnits(db, workspaceId, 9, at)).ok, true)
		assert.deepEqual(await B.reserveUnits(db, workspaceId, 2, at), { ok: false, scope: 'workspace' })
		assert.deepEqual(await B.reserveUnits(db, workspaceId, 11, freshNow()), { ok: false, scope: 'workspace' })
		assert.equal((await counter(wsKey(workspaceId, at))).count, 9)
		assert.deepEqual(await B.reserveUnits(db, workspaceId, 0, at), { ok: true, day: at.toISOString().slice(0, 10) })
		assert.deepEqual(await B.reserveUnits(db, 'not-an-id', 1, at), { ok: false, scope: 'workspace' })
	})
})

check('a full global counter gives the workspace its units back', async () => {
	await withEnv({ BUILDER_AI_DAILY_LIMIT: '100', BUILDER_AI_GLOBAL_DAILY_LIMIT: '5' }, async () => {
		const at = freshNow()
		const first = newWorkspace()
		const second = newWorkspace()
		assert.equal((await B.reserveUnits(db, first, 3, at)).ok, true)
		assert.deepEqual(await B.reserveUnits(db, second, 3, at), { ok: false, scope: 'global' })
		assert.equal((await counter(wsKey(second, at))).count, 0, 'given back')
		assert.equal((await counter(globalKey(at))).count, 3)
		assert.equal((await B.reserveUnits(db, second, 2, at)).ok, true)
		assert.equal((await counter(globalKey(at))).count, 5)
	})
})

check('refunds go to the reservation day, never below zero, and never create a counter', async () => {
	const at = new Date(freshNow().getTime() + 11 * 3_600_000 + 59 * 60_000) // 23:59 UTC
	const workspaceId = newWorkspace()
	const reserved = await B.reserveUnits(db, workspaceId, 4, at)
	const nextDay = new Date(at.getTime() + 2 * 60_000)
	created.days.add(nextDay.toISOString().slice(0, 10))
	await B.refundUnits(db, workspaceId, reserved.day, 3) // "after midnight", naming the reservation's day
	assert.equal((await counter(wsKey(workspaceId, at))).count, 1)
	assert.equal((await counter(globalKey(at))).count, 1)
	assert.equal(await counter(wsKey(workspaceId, nextDay)), null, 'the next day was not touched')
	await B.refundUnits(db, workspaceId, reserved.day, 5)
	assert.equal((await counter(wsKey(workspaceId, at))).count, 0, 'never below zero')
	await B.refundUnits(db, workspaceId, nextDay.toISOString().slice(0, 10), 1)
	assert.equal(await counter(wsKey(workspaceId, nextDay)), null, 'a refund never creates a counter')
	await B.refundUnits(db, workspaceId, 'not-a-day', 1)
})

check('usage is added to both counters; unitsToday and outputTokensToday read them', async () => {
	await withEnv({ BUILDER_AI_DAILY_LIMIT: '77' }, async () => {
		const at = freshNow()
		const workspaceId = newWorkspace()
		const { day } = await B.reserveUnits(db, workspaceId, 2, at)
		await B.recordUsage(db, workspaceId, day, { inputTokens: 100, outputTokens: 40, cacheReadTokens: 30, cacheWriteTokens: 20, calls: 1, ms: 5 })
		await B.recordUsage(db, workspaceId, day, { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, calls: 1, ms: 5 })
		const ws = await counter(wsKey(workspaceId, at))
		assert.deepEqual(
			{ inputTokens: ws.inputTokens, outputTokens: ws.outputTokens, cacheReadTokens: ws.cacheReadTokens, cacheWriteTokens: ws.cacheWriteTokens },
			{ inputTokens: 101, outputTokens: 42, cacheReadTokens: 33, cacheWriteTokens: 24 },
		)
		assert.equal((await counter(globalKey(at))).outputTokens, 42)
		assert.equal(await B.outputTokensToday(db, workspaceId, at), 42)
		const today = await B.unitsToday(db, workspaceId, at)
		assert.deepEqual(today, { used: 2, limit: 77, resetsAt: new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() + 1)).toISOString() })
		assert.equal((await B.unitsToday(db, newWorkspace(), at)).used, 0)
		assert.ok(ws.expiresAt.getTime() >= at.getTime() + 2 * DAY_MS - 1000, 'counters live two days')
	})
})

check('limits parse like limitFromEnv: plain digits ≥ 1, anything else the default', async () => {
	await withEnv({}, async () => assert.deepEqual(B.budgetLimits(), { workspace: 100, global: 2000, outputTokens: 2_000_000 }))
	for (const value of ['abc', '0', '-5', '1.5', '0x10', '1e3', ''])
		await withEnv({ BUILDER_AI_DAILY_LIMIT: value }, async () => assert.equal(B.budgetLimits().workspace, 100, JSON.stringify(value)))
	await withEnv({ BUILDER_AI_DAILY_LIMIT: ' 7 ', BUILDER_AI_GLOBAL_DAILY_LIMIT: '9', BUILDER_AI_DAILY_OUTPUT_TOKENS: '12345' }, async () =>
		assert.deepEqual(B.budgetLimits(), { workspace: 7, global: 9, outputTokens: 12345 }),
	)
})

group('builds')

check('ensureBuildIndexes creates the four indexes of section 5.3, idempotently', async () => {
	await D.ensureBuildIndexes(db)
	await D.ensureBuildIndexes(db)
	const indexes = Object.fromEntries((await builds().indexes()).map((index) => [index.name, index]))
	assert.deepEqual(indexes.ttl.key, { expiresAt: 1 })
	assert.equal(indexes.ttl.expireAfterSeconds, 0)
	assert.deepEqual(indexes.one_active_build_per_site.key, { siteId: 1 })
	assert.equal(indexes.one_active_build_per_site.unique, true)
	assert.deepEqual(indexes.one_active_build_per_site.partialFilterExpression, { active: true })
	assert.deepEqual(indexes.active_by_workspace.key, { workspaceId: 1, active: 1 })
	assert.deepEqual(indexes.by_site_user.key, { siteId: 1, userId: 1, createdAt: -1 })
})

check('one active build per site: a second insert is a conflict; finished builds do not count', async () => {
	const siteId = newSite()
	const first = buildDoc({ siteId, status: 'writing' })
	assert.equal(await D.insertBuild(db, first), 'ok')
	assert.equal(await D.insertBuild(db, buildDoc({ siteId, status: 'planning' })), 'conflict')
	assert.equal(await D.insertBuild(db, buildDoc({ siteId, status: 'landed' })), 'ok')
	assert.equal(await D.insertBuild(db, buildDoc({ siteId, status: 'cancelled' })), 'ok')
	assert.match(D.newBuildId(), /^bld_[0-9a-f]{24}$/)
})

check('leasePage is exclusive under 20 concurrent claims', async () => {
	const doc = await insert(buildDoc({ status: 'planned', pages: [pageDoc('p1')] }))
	const now = new Date()
	const results = await Promise.all(Array.from({ length: 20 }, () => D.leasePage(db, doc._id, 'p1', now)))
	const won = results.filter((result) => result.ok)
	assert.equal(won.length, 1)
	assert.ok(results.filter((result) => !result.ok).every((result) => result.reason === 'busy'))
	assert.equal(won[0].attempt, 1)
	const stored = await reload(doc._id)
	assert.equal(stored.status, 'writing')
	assert.equal(stored.pages[0].status, 'writing')
	assert.equal(stored.pages[0].leaseId, won[0].leaseId)
	assert.equal(stored.pages[0].attempts, 1)
	assert.equal(stored.pages[0].reachedModel, false)
	assert.equal(stored.pages[0].leaseUntil.getTime(), now.getTime() + AI_LIMITS.leaseMs)
})

check('at most 4 pages of a build write at once', async () => {
	const keys = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
	const doc = await insert(buildDoc({ status: 'planned', pages: keys.map((key) => pageDoc(key)) }))
	const now = new Date()
	const results = await Promise.all(keys.map((key) => D.leasePage(db, doc._id, key, now)))
	assert.equal(results.filter((result) => result.ok).length, 4)
	assert.ok(results.filter((result) => !result.ok).every((result) => result.reason === 'busy'))
	// A lease that ran out no longer counts against the cap.
	const later = new Date(now.getTime() + AI_LIMITS.leaseMs + 1000)
	const freed = await Promise.all(['p5', 'p6'].map((key) => D.leasePage(db, doc._id, key, later)))
	assert.ok(freed.every((result) => result.ok))
})

check('a stale finishPage (lost lease) changes nothing; the holder finishes', async () => {
	const doc = await insert(buildDoc({ status: 'planned', pages: [pageDoc('p1'), pageDoc('p2')] }))
	const now = new Date()
	const first = await D.leasePage(db, doc._id, 'p1', now)
	const later = new Date(now.getTime() + AI_LIMITS.leaseMs + 1)
	const second = await D.leasePage(db, doc._id, 'p1', later)
	assert.ok(first.ok && second.ok)
	assert.equal(second.attempt, 2, 'the dead attempt counts')
	const written = { page: { id: 'pg_p1', name: 'Home', slug: '/', inHeader: true, blocks: [], createdAt: '', updatedAt: '' }, blockLooks: {}, needsInput: [] }
	const usage = { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40, calls: 1, ms: 50 }
	const before = await reload(doc._id)
	assert.equal(await D.finishPage(db, doc._id, 'p1', first.leaseId, written, [], usage, ['req_a'], later), false)
	assert.deepEqual(await reload(doc._id), before, 'the stale result changed nothing')
	assert.equal(await D.failPage(db, doc._id, 'p1', first.leaseId, 'failed', new E.AiError('upstream').toApi(), usage, later), false)
	assert.equal(await D.finishPage(db, doc._id, 'p1', '', written, [], usage, [], later), false)
	const ids = Array.from({ length: 35 }, (_, i) => `req_${i}`)
	assert.equal(await D.finishPage(db, doc._id, 'p1', second.leaseId, written, [{ level: 'info', code: 'text-trimmed', message: 'x' }], usage, ids, later), true)
	const after = await reload(doc._id)
	assert.equal(after.pages[0].status, 'written')
	assert.equal(after.pages[0].leaseId, null)
	assert.equal(after.pages[0].leaseUntil, null)
	assert.deepEqual(after.pages[0].written, written)
	assert.equal(after.pages[0].issues.length, 1)
	assert.deepEqual(after.pages[0].usage, usage)
	assert.deepEqual(after.usage, usage)
	assert.equal(after.requestIds.length, 30)
	assert.equal(after.requestIds.at(-1), 'req_34')
	assert.equal(after.pages[1].status, 'pending', 'other pages untouched')
	assert.equal(await D.finishPage(db, doc._id, 'p1', second.leaseId, written, [], usage, [], later), false, 'finishing twice does nothing')
})

check('lease refusals are named: written, exhausted, missing, state', async () => {
	const now = new Date()
	const doc = await insert(
		buildDoc({
			status: 'writing',
			pages: [pageDoc('p1', { status: 'written', attempts: 1 }), pageDoc('p2', { status: 'failed', attempts: 3 }), pageDoc('p3')],
		}),
	)
	assert.deepEqual(await D.leasePage(db, doc._id, 'p1', now), { ok: false, reason: 'written' })
	assert.deepEqual(await D.leasePage(db, doc._id, 'p2', now), { ok: false, reason: 'exhausted' })
	assert.deepEqual(await D.leasePage(db, doc._id, 'p9', now), { ok: false, reason: 'missing' })
	assert.deepEqual(await D.leasePage(db, D.newBuildId(), 'p1', now), { ok: false, reason: 'missing' })
	const cancelled = await insert(buildDoc({ status: 'cancelled', pages: [pageDoc('p1')], cancelRequestedAt: now }))
	assert.deepEqual(await D.leasePage(db, cancelled._id, 'p1', now), { ok: false, reason: 'state' })
	const requested = await insert(buildDoc({ status: 'writing', pages: [pageDoc('p1')], cancelRequestedAt: now }))
	assert.deepEqual(await D.leasePage(db, requested._id, 'p1', now), { ok: false, reason: 'state' })
	const ready = await insert(buildDoc({ status: 'ready', pages: [pageDoc('p1', { status: 'failed', attempts: 1 })] }))
	const retried = await D.leasePage(db, ready._id, 'p1', now)
	assert.equal(retried.ok, true)
	assert.equal(retried.attempt, 2)
	assert.equal((await reload(ready._id)).status, 'writing', 'a retry in ready moves the build back to writing')
	// A released lease, or a writing page without any lease date, is free again at once (the attempt counts).
	await D.releaseLease(db, ready._id, 'p1', retried.leaseId)
	assert.equal(D.toBuildView(await reload(ready._id)).pages[0].status, 'failed')
	const again = await D.leasePage(db, ready._id, 'p1', new Date())
	assert.equal(again.attempt, 3)
	const orphan = await insert(buildDoc({ status: 'writing', pages: [pageDoc('p1', { status: 'writing', attempts: 1, leaseId: null, leaseUntil: null })] }))
	assert.equal((await D.leasePage(db, orphan._id, 'p1', now)).ok, true)
})

check('a third attempt records its extra unit; a fourth is exhausted', async () => {
	const doc = await insert(buildDoc({ status: 'writing', pages: [pageDoc('p1', { status: 'failed', attempts: 2 })] }))
	const now = new Date()
	const third = await D.leasePage(db, doc._id, 'p1', now)
	assert.equal(third.ok, true)
	assert.equal(third.attempt, 3)
	assert.equal(third.build.budget.reserved, doc.budget.reserved + 1)
	const stored = await reload(doc._id)
	assert.equal(stored.pages[0].extraUnits, 1)
	assert.equal(stored.budget.reserved, doc.budget.reserved + 1)
	assert.equal(await D.failPage(db, doc._id, 'p1', third.leaseId, 'failed', new E.AiError('timeout').toApi(), ZERO, now), true)
	assert.deepEqual(await D.leasePage(db, doc._id, 'p1', now), { ok: false, reason: 'exhausted' })
})

check('refundPage runs once under 10 concurrent calls, and never for a written page', async () => {
	const { doc, at, workspaceId } = await chargedBuild(3, {
		status: 'writing',
		pages: [pageDoc('p1', { status: 'failed', attempts: 3 }), pageDoc('p2', { status: 'written', attempts: 1 })],
	})
	await insert(doc)
	const results = await Promise.all(Array.from({ length: 10 }, () => D.refundPage(db, doc, 'p1')))
	assert.equal(results.filter(Boolean).length, 1)
	assert.equal((await reload(doc._id)).budget.refunded, 1)
	assert.equal((await counter(wsKey(workspaceId, at))).count, 2)
	assert.equal((await counter(globalKey(at))).count, 2)
	assert.equal(await D.refundPage(db, doc, 'p2'), false)
	assert.equal((await counter(wsKey(workspaceId, at))).count, 2)
})

check('failPage and settleBuild: ready only when nothing is pending or writing', async () => {
	const doc = await insert(buildDoc({ status: 'planned', pages: [pageDoc('p1'), pageDoc('p2', { status: 'written', attempts: 1 })] }))
	const now = new Date()
	const lease = await D.leasePage(db, doc._id, 'p1', now)
	await D.settleBuild(db, doc._id, now)
	assert.equal((await reload(doc._id)).status, 'writing')
	const error = new E.AiError('network', undefined).toApi()
	assert.equal(await D.failPage(db, doc._id, 'p1', 'wrong-lease', 'failed', error, ZERO, now), false)
	assert.equal(await D.failPage(db, doc._id, 'p1', lease.leaseId, 'failed', error, { ...ZERO, outputTokens: 9, calls: 1 }, now), true)
	const failedDoc = await reload(doc._id)
	assert.equal(failedDoc.pages[0].status, 'failed')
	assert.deepEqual(failedDoc.pages[0].lastError, error)
	assert.equal(failedDoc.pages[0].leaseId, null)
	assert.equal(failedDoc.usage.outputTokens, 9)
	await D.settleBuild(db, doc._id, now)
	assert.equal((await reload(doc._id)).status, 'ready')
})

check('savePlan stores the plan and refunds reserved − (1 + pages) once', async () => {
	const { doc, at, workspaceId } = await chargedBuild(9, { status: 'planning' })
	await insert(doc)
	const pages = ['p1', 'p2', 'p3'].map((key) => pageDoc(key))
	const patch = {
		context: { business: { name: 'Acme' }, corpus: 'acme', availability: {} },
		plan: { site: { name: 'Acme' }, facts: [{ value: 'Since 2004', label: 'Founded', quote: 'since 2004' }], pages: [], issues: [] },
		design: null,
		chrome: null,
		images: { pool: [], notes: [], uses: {}, byPage: {} },
		writerContext: 'SITE CONTEXT',
		pages,
		outline: { status: 'none', attempts: 0, leaseId: null, leaseUntil: null },
		profilePatch: [],
		issues: [],
	}
	const usage = { inputTokens: 5, outputTokens: 6, cacheReadTokens: 7, cacheWriteTokens: 8, calls: 2, ms: 9 }
	await D.savePlan(db, doc._id, patch, usage, at)
	const stored = await reload(doc._id)
	assert.equal(stored.status, 'planned')
	assert.equal(stored.active, true)
	assert.equal(stored.pages.length, 3)
	assert.equal(stored.writerContext, 'SITE CONTEXT')
	assert.deepEqual(stored.usage, usage)
	assert.equal(stored.budget.refunded, 5)
	assert.equal((await counter(wsKey(workspaceId, at))).count, 4)
	await rejectsWith(D.savePlan(db, doc._id, patch, usage, at), 'conflict')
	assert.equal((await counter(wsKey(workspaceId, at))).count, 4, 'a second save refunds nothing')

	const stopped = await chargedBuild(3, { status: 'planning' })
	await insert(stopped.doc)
	await D.cancelBuild(db, stopped.doc, stopped.at)
	await rejectsWith(D.savePlan(db, stopped.doc._id, patch, usage, stopped.at), 'cancelled')
	assert.equal((await reload(stopped.doc._id)).plan, null, 'nothing stored after a cancel')
})

check('failBuild: planning → failed, inactive, everything reserved refunded once', async () => {
	const { doc, at, workspaceId } = await chargedBuild(9, { status: 'planning' })
	await insert(doc)
	const error = new E.AiError('timeout').toApi()
	await D.failBuild(db, doc._id, error, at)
	const stored = await reload(doc._id)
	assert.equal(stored.status, 'failed')
	assert.equal('active' in stored, false)
	assert.deepEqual(stored.error, error)
	assert.equal(stored.budget.refunded, 9)
	assert.equal((await counter(wsKey(workspaceId, at))).count, 0)
	assert.equal((await counter(globalKey(at))).count, 0)
	await D.failBuild(db, doc._id, error, at)
	assert.equal((await reload(doc._id)).budget.refunded, 9)
	// A planned build is not "failed" by a late failure, and keeps its units.
	const planned = await chargedBuild(3, { status: 'planned', pages: [pageDoc('p1'), pageDoc('p2')] })
	await insert(planned.doc)
	await D.failBuild(db, planned.doc._id, error, planned.at)
	assert.equal((await reload(planned.doc._id)).status, 'planned')
	assert.equal((await counter(wsKey(planned.workspaceId, planned.at))).count, 3)
})

check('cancelBuild: pending and failed pages cancelled and refunded once; in-flight pages settle themselves', async () => {
	const now = new Date()
	const { doc, at, workspaceId } = await chargedBuild(5, {
		status: 'writing',
		pages: [
			pageDoc('p1'),
			pageDoc('p2', { status: 'failed', attempts: 1 }),
			pageDoc('p3', { status: 'writing', attempts: 1, leaseId: 'live-lease', leaseUntil: new Date(now.getTime() + 60_000) }),
			pageDoc('p4', { status: 'written', attempts: 1 }),
		],
	})
	await insert(doc)
	const after = await D.cancelBuild(db, doc, now)
	assert.equal(after.status, 'cancelled')
	assert.ok(after.cancelRequestedAt instanceof Date)
	assert.equal('active' in after, false)
	assert.deepEqual(after.pages.map((page) => page.status), ['cancelled', 'cancelled', 'writing', 'written'])
	assert.deepEqual(after.pages.map((page) => page.refunded), [true, true, false, false])
	assert.equal(after.pages[2].leaseId, 'live-lease')
	assert.equal(after.budget.refunded, 2)
	assert.equal((await counter(wsKey(workspaceId, at))).count, 3)
	assert.equal(await D.isCancelled(db, doc._id), true)
	const again = await D.cancelBuild(db, after, now)
	assert.equal(again.budget.refunded, 2, 'idempotent')
	assert.equal((await counter(wsKey(workspaceId, at))).count, 3)

	const planning = await chargedBuild(9, { status: 'planning' })
	await insert(planning.doc)
	assert.equal(await D.isCancelled(db, planning.doc._id), false)
	const stopped = await D.cancelBuild(db, planning.doc, planning.at)
	assert.equal(stopped.budget.refunded, 9, 'a plan stopped midway gives everything back')
	assert.equal((await counter(wsKey(planning.workspaceId, planning.at))).count, 0)
	assert.equal(await D.isCancelled(db, D.newBuildId()), true, 'a build that is gone counts as stopped')

	// The caller's copy may be from before the plan saved its pages: the stored pages decide.
	const late = await chargedBuild(3, { status: 'planned', pages: [pageDoc('p1'), pageDoc('p2')] })
	await insert(late.doc)
	const lateAfter = await D.cancelBuild(db, { ...late.doc, status: 'planning', pages: [] }, now)
	assert.equal(lateAfter.status, 'cancelled')
	assert.deepEqual(lateAfter.pages.map((page) => page.status), ['cancelled', 'cancelled'])
	assert.equal(lateAfter.budget.refunded, 2, 'the planned pages, not everything')
	assert.equal((await counter(wsKey(late.workspaceId, late.at))).count, 1)
})

check('supersede: own ready cancelled; a teammate keeps a fresh ready or running build (409 without buildId)', async () => {
	const now = new Date()
	// (a) this person's ready build: cancelled, its unwritten pages refunded.
	const own = await chargedBuild(3, { status: 'ready', userId: 'user-a', pages: [pageDoc('p1', { status: 'written', attempts: 1 }), pageDoc('p2', { status: 'failed', attempts: 3, refunded: true }), pageDoc('p3', { status: 'failed', attempts: 1 })] })
	await insert(own.doc)
	assert.deepEqual(await D.supersede(db, own.doc.siteId, 'user-a', now), { active: null })
	const ownAfter = await reload(own.doc._id)
	assert.equal(ownAfter.status, 'cancelled')
	assert.equal('active' in ownAfter, false)
	assert.equal(ownAfter.budget.refunded, 1, 'only the page never refunded')
	assert.equal((await counter(wsKey(own.workspaceId, own.at))).count, 2)

	// (b) a teammate's ready build, 10 minutes idle: it survives, and the caller learns whose it is.
	const fresh = await insert(buildDoc({ status: 'ready', userId: 'user-b', at: new Date(now.getTime() - 10 * 60_000) }))
	assert.deepEqual(await D.supersede(db, fresh.siteId, 'user-a', now), { active: { buildId: fresh._id, userId: 'user-b' } })
	assert.equal((await reload(fresh._id)).status, 'ready')

	// (c) the same after 31 minutes: abandoned.
	const idle = await chargedBuild(2, { status: 'ready', userId: 'user-b', pages: [pageDoc('p1', { status: 'failed', attempts: 1 })] })
	idle.doc.updatedAt = new Date(now.getTime() - 31 * 60_000)
	await insert(idle.doc)
	assert.deepEqual(await D.supersede(db, idle.doc.siteId, 'user-a', now), { active: null })
	assert.equal((await reload(idle.doc._id)).status, 'abandoned')
	assert.equal((await counter(wsKey(idle.workspaceId, idle.at))).count, 1)

	// (d) this person's own running build that is still alive: it stays, with its id for Resume or Stop.
	const running = await insert(buildDoc({ status: 'writing', userId: 'user-a', pages: [pageDoc('p1')] }))
	assert.deepEqual(await D.supersede(db, running.siteId, 'user-a', now), { active: { buildId: running._id, userId: 'user-a' } })
})

check('supersede: stale running builds without a live lease are abandoned and refunded', async () => {
	const now = new Date()
	const sevenMinutesAgo = new Date(now.getTime() - 7 * 60_000)
	// (e) writing, idle 7 minutes, every lease expired.
	const stale = await chargedBuild(3, { status: 'writing', userId: 'user-b', pages: [pageDoc('p1', { status: 'writing', attempts: 1, leaseId: 'dead', leaseUntil: new Date(now.getTime() - 1000) }), pageDoc('p2')] })
	stale.doc.updatedAt = sevenMinutesAgo
	await insert(stale.doc)
	assert.deepEqual(await D.supersede(db, stale.doc.siteId, 'user-a', now), { active: null })
	const staleAfter = await reload(stale.doc._id)
	assert.equal(staleAfter.status, 'abandoned')
	assert.deepEqual(staleAfter.pages.map((page) => page.status), ['cancelled', 'cancelled'])
	assert.equal(staleAfter.budget.refunded, 2)
	assert.equal((await counter(wsKey(stale.workspaceId, stale.at))).count, 1)

	// (f) idle as long, but a page holds a live lease: someone is still writing it.
	const leased = await insert(buildDoc({ status: 'writing', userId: 'user-b', pages: [pageDoc('p1', { status: 'writing', attempts: 1, leaseId: 'live', leaseUntil: new Date(now.getTime() + 60_000) })], at: sevenMinutesAgo }))
	assert.deepEqual(await D.supersede(db, leased.siteId, 'user-a', now), { active: { buildId: leased._id, userId: 'user-b' } })

	// (g) the outline holds a live lease.
	const outlining = await insert(buildDoc({ status: 'planned', userId: 'user-a', at: sevenMinutesAgo, outline: { status: 'running', attempts: 1, leaseId: 'o', leaseUntil: new Date(now.getTime() + 60_000) } }))
	assert.equal((await D.supersede(db, outlining.siteId, 'user-a', now)).active?.buildId, outlining._id)

	// (h) planning, idle 7 minutes: the plan request died; everything reserved goes back.
	const planning = await chargedBuild(9, { status: 'planning', userId: 'user-a' })
	planning.doc.updatedAt = sevenMinutesAgo
	await insert(planning.doc)
	assert.deepEqual(await D.supersede(db, planning.doc.siteId, 'user-a', now), { active: null })
	assert.equal((await reload(planning.doc._id)).status, 'abandoned')
	assert.equal((await counter(wsKey(planning.workspaceId, planning.at))).count, 0)

	// (i) planning for 5 minutes is still a plan in progress.
	const young = await insert(buildDoc({ status: 'planning', userId: 'user-a', at: new Date(now.getTime() - 5 * 60_000) }))
	assert.equal((await D.supersede(db, young.siteId, 'user-a', now)).active?.buildId, young._id)
})

check('leaseOutline: exclusive, two attempts, an expired lease is taken over; finishOutline is guarded', async () => {
	const now = new Date()
	const doc = await insert(
		buildDoc({
			status: 'writing',
			outline: { status: 'pending', attempts: 0, leaseId: null, leaseUntil: null },
			pages: [pageDoc('p1', { status: 'writing', attempts: 1, leaseId: 'home', leaseUntil: new Date(now.getTime() + 60_000) }), pageDoc('p7')],
		}),
	)
	const results = await Promise.all(Array.from({ length: 10 }, () => D.leaseOutline(db, doc._id, now)))
	const won = results.filter((result) => result.ok)
	assert.equal(won.length, 1)
	assert.ok(results.filter((result) => !result.ok).every((result) => result.reason === 'running'))
	assert.equal(won[0].attempt, 1)
	await D.failOutline(db, doc._id, won[0].leaseId, new E.AiError('timeout').toApi(), now)
	assert.equal((await reload(doc._id)).outline.status, 'failed')
	const second = await D.leaseOutline(db, doc._id, now)
	assert.equal(second.attempt, 2)
	const expired = new Date(now.getTime() + AI_LIMITS.leaseMs + 1)
	const third = await D.leaseOutline(db, doc._id, expired)
	assert.equal(third.ok, true, 'a running outline whose lease ran out is taken over')
	assert.equal(third.attempt, 3)
	const plan = { site: {}, facts: [], pages: [{ key: 'p7', outlined: true, sections: [] }], issues: [] }
	const images = { pool: [], notes: [], uses: { img1: 1 }, byPage: {} }
	const patch = {
		plan,
		images,
		issues: [{ level: 'info', code: 'outline-fallback', message: 'x' }],
		pages: [pageDoc('p1', { name: 'Clobbered', status: 'pending' }), pageDoc('p7', { name: 'Gutters' })],
	}
	assert.equal(await D.finishOutline(db, doc._id, second.leaseId, patch, ZERO, expired), false, 'the lost lease writes nothing')
	assert.equal(await D.finishOutline(db, doc._id, third.leaseId, patch, { ...ZERO, outputTokens: 11 }, expired), true)
	const stored = await reload(doc._id)
	assert.equal(stored.outline.status, 'done')
	assert.equal(stored.outline.leaseId, null)
	assert.deepEqual(stored.plan, plan)
	assert.deepEqual(stored.images, images)
	assert.equal(stored.issues[0].code, 'outline-fallback')
	assert.equal(stored.usage.outputTokens, 11)
	assert.equal(stored.pages[0].name, 'Page p1', 'a page being written is never touched')
	assert.equal(stored.pages[0].leaseId, 'home')
	assert.equal(stored.pages[1].name, 'Gutters')
	assert.deepEqual(await D.leaseOutline(db, doc._id, expired), { ok: false, reason: 'done' })
	const exhausted = await insert(buildDoc({ status: 'planned', outline: { status: 'failed', attempts: 2, leaseId: null, leaseUntil: null } }))
	assert.deepEqual(await D.leaseOutline(db, exhausted._id, now), { ok: false, reason: 'exhausted' })
	const cancelled = await insert(buildDoc({ status: 'cancelled', outline: { status: 'pending', attempts: 0, leaseId: null, leaseUntil: null } }))
	assert.deepEqual(await D.leaseOutline(db, cancelled._id, now), { ok: false, reason: 'state' })
})

check('markLanded: ready or writing → landed, inactive; idempotent; nothing else lands', async () => {
	const now = new Date()
	const ready = await insert(buildDoc({ status: 'ready', pages: [pageDoc('p1', { status: 'written', attempts: 1 })] }))
	await D.markLanded(db, ready._id, now)
	const landed = await reload(ready._id)
	assert.equal(landed.status, 'landed')
	assert.equal('active' in landed, false)
	assert.equal(landed.landedAt.getTime(), now.getTime())
	await D.markLanded(db, ready._id, new Date(now.getTime() + 1000))
	assert.equal((await reload(ready._id)).landedAt.getTime(), now.getTime())
	const planning = await insert(buildDoc({ status: 'planning' }))
	await D.markLanded(db, planning._id, now)
	assert.equal((await reload(planning._id)).status, 'planning')
})

check('loadBuild: only its owner, never a malformed id, an expired one only on request', async () => {
	const doc = await insert(buildDoc({ status: 'planned', userId: 'user-a' }))
	const owner = { siteId: doc.siteId, workspaceId: doc.workspaceId, userId: 'user-a' }
	assert.equal((await D.loadBuild(db, doc._id, owner))?._id, doc._id)
	assert.equal(await D.loadBuild(db, doc._id, { ...owner, userId: 'user-b' }), null)
	assert.equal(await D.loadBuild(db, doc._id, { ...owner, siteId: new ObjectId() }), null)
	assert.equal(await D.loadBuild(db, doc._id, { ...owner, workspaceId: new ObjectId() }), null)
	assert.equal(await D.loadBuild(db, 'bld_xyz', owner), null)
	assert.equal(await D.loadBuild(db, { $ne: null }, owner), null)
	const expired = await insert(buildDoc({ status: 'ready', userId: 'user-a', expiresAt: new Date(Date.now() - 1000) }))
	const expiredOwner = { siteId: expired.siteId, workspaceId: expired.workspaceId, userId: 'user-a' }
	assert.equal(await D.loadBuild(db, expired._id, expiredOwner), null)
	assert.equal((await D.loadBuild(db, expired._id, expiredOwner, { includeExpired: true }))?._id, expired._id)
})

check("listBuilds: this person's unexpired builds for the site, newest first, at most 3", async () => {
	const siteId = newSite()
	const workspaceId = newWorkspace()
	const now = new Date()
	const at = (minutes) => new Date(now.getTime() - minutes * 60_000)
	const make = (minutes, extra = {}) => insert(buildDoc({ siteId, workspaceId, status: 'landed', at: at(minutes), ...extra }))
	const oldest = await make(40)
	const second = await make(30, { pages: [pageDoc('p1', { status: 'written' }), pageDoc('p2')] })
	const third = await make(20)
	const newest = await make(10)
	await make(5, { userId: 'user-b' })
	await make(1, { expiresAt: new Date(now.getTime() - 1) })
	const list = await D.listBuilds(db, siteId, 'user-a', now)
	assert.deepEqual(list.map((item) => item.id), [newest._id, third._id, second._id])
	assert.ok(!list.some((item) => item.id === oldest._id))
	assert.deepEqual(list[2], { id: second._id, status: 'landed', mode: 'site', placement: 'replace-site', createdAt: at(30).toISOString(), pages: 2, written: 1 })
})

check('toBuildView: the view of section 5.1, and nothing private', () => {
	const now = new Date()
	const doc = buildDoc({
		status: 'writing',
		chrome: null,
		snapshot: {
			siteRev: 3,
			pages: [],
			theme: null,
			chrome: {
				header: 'floating', footer: 'split', ctaLabel: 'Book a visit', ctaHref: 'contact',
				menu: [
					{ id: 'm1', label: 'Services', href: '', style: 'mega', promo: null, links: [{ id: 'l1', label: 'Repair', href: 'repair', description: '' }, { id: 'l2', label: 'Gutters', href: 'gutters', description: '' }] },
					{ id: 'm2', label: 'About', href: 'about', style: 'mega', promo: null, links: [] },
					{ id: 'm3', label: 'Call', href: 'tel:+15125550142', style: 'mega', promo: null, links: [] },
				],
			},
		},
		plan: {
			site: {},
			facts: [{ value: 'Since 2004', label: 'Founded', quote: 'family-owned since 2004' }],
			pages: [{ key: 'p1', id: 'pg_p1', name: 'Home', slug: '/', path: '/', archetype: 'home', purpose: 'Win calls', keyword: 'roofing', inMenu: true, outlined: true, openerHint: null, closerHint: null, photoAllocation: [], sections: [{ key: 's1', layout: 'page-hero:centered', label: 'Page Hero (Centered)' }] }],
			issues: [],
		},
		design: { look: null, view: { polarity: 'light' } },
		images: { pool: [{ ref: 'img1', url: MARK.photo }], notes: [], uses: { img1: 2, img2: 0, img3: 1 }, byPage: {} },
		profilePatch: [{ field: 'business.phone', value: '(512) 555-0142' }, { field: 'business.serviceArea', value: ['Austin', 'Round Rock'] }],
		budget: { day: '2200-01-01', reserved: 9, refunded: 2 },
		issues: [{ level: 'info', code: 'no-testimonials', message: 'No reviews were given, so the site has no testimonials.' }],
		pages: [
			pageDoc('p1', { status: 'written', attempts: 1, written: { page: { blocks: [{ props: { title: MARK.body } }] }, blockLooks: {}, needsInput: [{ pageKey: 'p1', pageId: 'pg_p1', blockId: 'blk_1', path: 'title', text: '[License number]' }] } }),
			pageDoc('p2', { status: 'writing', attempts: 2, leaseId: 'secret-lease-id', leaseUntil: new Date(now.getTime() - 5000) }),
			pageDoc('p3', { status: 'failed', attempts: 2, lastError: new E.AiError('timeout').toApi() }),
		],
	})
	const view = D.toBuildView(doc)
	assert.deepEqual(Object.keys(view).sort(), ['chrome', 'createdAt', 'design', 'error', 'expiresAt', 'facts', 'id', 'issues', 'mode', 'outline', 'pages', 'photosUsed', 'placement', 'profileFill', 'status', 'targetPageId', 'units', 'updatedAt'])
	assert.equal(view.design, null, 'the look is kept')
	assert.deepEqual(view.chrome, {
		kept: true, header: 'floating', footer: 'split', cta: 'Book a visit',
		menu: [{ label: 'Services', kind: 'mega', links: 2 }, { label: 'About', kind: 'link', links: 0 }, { label: 'Call', kind: 'phone', links: 0 }],
	})
	assert.deepEqual(view.facts, [{ value: 'Since 2004', label: 'Founded' }])
	assert.deepEqual(view.profileFill, [
		{ field: 'business.phone', label: 'Phone', value: '(512) 555-0142' },
		{ field: 'business.serviceArea', label: 'Areas served', value: 'Austin, Round Rock' },
	])
	assert.equal(view.photosUsed, 2)
	assert.deepEqual(view.units, { reserved: 9, refunded: 2 })
	assert.deepEqual(Object.keys(view.pages[0]).sort(), ['archetype', 'attempts', 'canRetry', 'error', 'issues', 'key', 'name', 'needsInput', 'outlined', 'pageId', 'purpose', 'retryCostsUnit', 'sections', 'slug', 'status'])
	assert.deepEqual(view.pages[0].sections, [{ layout: 'page-hero:centered', label: 'Page Hero (Centered)' }])
	assert.equal(view.pages[0].archetype, 'home')
	assert.equal(view.pages[0].needsInput[0].text, '[License number]')
	assert.equal(view.pages[1].status, 'failed', 'a writer whose lease ran out reads as failed')
	assert.equal(view.pages[1].error.code, 'upstream')
	assert.equal(view.pages[1].error.retryable, true)
	assert.equal(view.pages[1].canRetry, true)
	assert.equal(view.pages[1].retryCostsUnit, true)
	assert.equal(view.pages[1].archetype, 'custom', 'a page the plan does not know')
	assert.equal(view.pages[2].error.code, 'timeout')
	const text = JSON.stringify(view)
	for (const marker of [MARK.prompt, MARK.review, MARK.business, MARK.writer, MARK.photo, MARK.body, 'secret-lease-id'])
		assert.ok(!text.includes(marker), `${marker} leaked into the view`)
	assert.equal(D.toPageView(doc, 'p3').status, 'failed')
	assert.equal(D.toPageView(doc, 'p9'), null)
	const planning = D.toBuildView(buildDoc({ status: 'planning' }))
	assert.equal(planning.chrome, null)
	assert.equal(planning.design, null)
	assert.deepEqual(planning.pages, [])
	const designed = D.toBuildView({ ...doc, design: { look: { theme: {} }, view: { polarity: 'dark', personality: 'bold' } }, chrome: { ...doc.snapshot.chrome, menu: [] }, status: 'cancelled' })
	assert.deepEqual(designed.design, { polarity: 'dark', personality: 'bold' })
	assert.equal(designed.chrome.kept, false)
	assert.equal(designed.pages[2].canRetry, false, 'nothing is retried in a cancelled build')
})

check('scripts/ensure-indexes.mjs agrees with ensureBuildIndexes and creates them from nothing', async () => {
	const run = (uri) => spawnSync(process.execPath, ['scripts/ensure-indexes.mjs'], { cwd: ROOT, env: { ...process.env, MONGODB_URI: uri }, encoding: 'utf8' })
	const same = run(URI)
	assert.equal(same.status, 0, `on the proof database: ${same.stderr}`)
	// A scratch database on the same local server, dropped at once.
	const name = `${local[3]}_infra_${randomInt(1e9)}`
	const scratch = `mongodb://${local[1]}:${local[2]}/${name}`
	try {
		const fresh = run(scratch)
		assert.equal(fresh.status, 0, fresh.stderr)
		const again = run(scratch)
		assert.equal(again.status, 0, 'idempotent')
		const indexes = await client.db(name).collection('aiBuilds').indexes()
		const byName = Object.fromEntries(indexes.map((index) => [index.name, index]))
		for (const index of D.BUILD_INDEXES) {
			const found = byName[index.name]
			assert.ok(found, index.name)
			assert.deepEqual(found.key, index.key)
			assert.equal(found.unique ?? false, index.unique ?? false)
			assert.deepEqual(found.partialFilterExpression ?? null, index.partialFilterExpression ?? null)
			assert.equal(found.expireAfterSeconds ?? null, index.expireAfterSeconds ?? null)
		}
	} finally {
		await client.db(name).dropDatabase()
	}
})

group('pool')

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const blobUrl = (name) => `https://pool-proof.public.blob.vercel-storage.com/${name}`
const entry = (id, minutesAgo, extra = {}) => ({
	id,
	name: id,
	url: blobUrl(`sites/s/${id}.webp`),
	pathname: `sites/s/${id}.webp`,
	bytes: 120_000,
	contentType: 'image/webp',
	addedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
	...extra,
})
const request = (photoIds, useLibrary = false) => ({ mode: 'site', placement: 'replace-site', targetPageId: null, prompt: 'x', pins: {}, business: {}, reviews: [], photoIds, useLibrary, fast: false })

check('picked photos: newest first, only readable URLs, vision only where the API can read them', async () => {
	const huge = 'A'.repeat(Math.ceil((AI_LIMITS.dataUrlMaxBytes + 10) / 3) * 4)
	const site = {
		_id: newSite(),
		workspaceId: newWorkspace(),
		media: [
			entry('md_old', 50, { width: 1600, height: 900 }),
			entry('md_data', 1, { url: `data:image/png;base64,${PNG_1X1}`, contentType: 'image/png', width: 1, height: 1 }),
			entry('md_toolarge', 2, { url: `data:image/png;base64,${huge}` }),
			entry('md_foreign', 3, { url: 'https://evil.example.com/x.jpg' }),
			entry('md_svg', 4, { url: 'data:image/svg+xml;base64,PHN2Zz4=' }),
			entry('md_avif', 5, { contentType: 'image/avif', width: 800, height: 1200 }),
			entry('md_heavy', 6, { contentType: 'image/jpeg', bytes: 6_000_000, width: 1000, height: 1000 }),
			entry('md_wide', 7, { width: 9000, height: 3000 }),
			entry('md_unpicked', 0),
		],
	}
	const pool = await P.loadPhotoPool(db, site, request(['md_old', 'md_data', 'md_toolarge', 'md_foreign', 'md_svg', 'md_avif', 'md_heavy', 'md_wide', 'md_old', 'md_gone']))
	assert.deepEqual(pool.map((item) => item.value), ['media:md_data', 'media:md_avif', 'media:md_heavy', 'media:md_wide', 'media:md_old'])
	assert.deepEqual(pool.map((item) => item.ref), ['img1', 'img2', 'img3', 'img4', 'img5'])
	assert.ok(pool.every((item) => item.source === 'upload'))
	assert.deepEqual(pool.map((item) => item.vision), [true, false, false, false, true], 'AVIF, over 5 MB and over 8000 px stay digest-only')
	assert.deepEqual(pool.map((item) => item.orientation), ['square', 'portrait', 'square', 'panorama', 'landscape'])
	assert.equal(pool[4].url, blobUrl('sites/s/md_old.webp'))
	assert.equal(pool[0].width, 1)
	const plain = await P.loadPhotoPool(db, { ...site, media: [entry('md_nodims', 1)] }, request(['md_nodims']))
	assert.equal(plain[0].orientation, 'unknown')
	assert.equal(plain[0].width, null)
})

check('orientation from the size: panorama ≥ 2, landscape ≥ 1.2, portrait ≤ 0.83, else square', async () => {
	const sizes = [[2000, 1000, 'panorama'], [1200, 1000, 'landscape'], [1190, 1000, 'square'], [840, 1000, 'square'], [830, 1000, 'portrait'], [400, 2000, 'portrait']]
	// md_0 is the newest, so the pool keeps this order.
	const site = { _id: newSite(), workspaceId: newWorkspace(), media: sizes.map(([width, height], i) => entry(`md_${i}`, i + 1, { width, height })) }
	const pool = await P.loadPhotoPool(db, site, request(sizes.map((_, i) => `md_${i}`)))
	assert.deepEqual(pool.map((item) => item.orientation), sizes.map(([, , want]) => want))
})

check('at most 12 vision photos', async () => {
	const site = { _id: newSite(), workspaceId: newWorkspace(), media: Array.from({ length: 14 }, (_, i) => entry(`md_${i}`, 20 - i, { width: 1200, height: 800 })) }
	const pool = await P.loadPhotoPool(db, site, request(site.media.map((item) => item.id)))
	assert.equal(pool.length, 14)
	assert.equal(pool.filter((item) => item.vision).length, 12)
})

check('the library: opt-in, this workspace only, photos/illustrations/graphics or unclassified, newest first, 60 at most', async () => {
	const workspaceId = newWorkspace()
	const other = newWorkspace()
	const base = Date.now() - 10 * 60_000
	const kinds = ['photo', 'illustration', 'graphic', null, 'screenshot', 'logo', 'icon', 'pattern', 'diagram', 'other']
	const asset = (n, overrides = {}) => ({
		_id: new ObjectId(), workspaceId, folderId: null, name: `a${n}`, nameKey: `a${n}`, filename: `a${n}.jpg`,
		url: blobUrl(`workspaces/${workspaceId}/media/a${n}.jpg`), pathname: `workspaces/${workspaceId}/media/a${n}.jpg`,
		contentType: 'image/jpeg', bytes: 1000, width: 1600, height: 1000, pixels: 1_600_000, orientation: 'landscape',
		hasAlpha: false, animated: false, colors: [], colorNames: ['blue', 'gray', 'white', 'black'], brightness: 'dark',
		saturation: 'muted', sha256: `h${n}`, blur: null,
		tags: [
			{ slug: 'roof', label: 'Roof', source: 'auto', via: 'vision' },
			{ slug: 'jane-doe', label: 'Jane Doe', source: 'auto', via: 'filename' },
			...Array.from({ length: 10 }, (_, i) => ({ slug: `t${i}`, label: `Tag ${i}`, source: 'manual' })),
		],
		rejectedTags: [], caption: `A crew replacing shingles on a steep roof ${'with plenty of detail '.repeat(10)}`, altText: '', captionEdited: false,
		textInImage: '', keywords: [], kind: 'photo', notes: '', terms: [], termsVersion: 1, rev: 0, tagging: { status: 'done', attempts: 1 },
		uploadedBy: 'proof', createdAt: new Date(base + n * 1000), updatedAt: new Date(base + n * 1000),
		...overrides,
	})
	const docs = kinds.map((kind, n) => asset(n, { kind }))
	docs.push(asset(20, { workspaceId: other, pathname: `workspaces/${other}/media/x.jpg`, url: blobUrl(`workspaces/${other}/media/x.jpg`) }))
	docs.push(asset(21, { width: 0, height: 0 }))
	await db.collection('mediaAssets').insertMany(docs)

	const site = { _id: newSite(), workspaceId, media: [entry('md_pick', 1, { url: docs[0].url })] }
	const off = await P.loadPhotoPool(db, site, request(['md_pick'], false))
	assert.deepEqual(off.map((item) => item.source), ['upload'])
	const on = await P.loadPhotoPool(db, site, request(['md_pick'], true))
	assert.deepEqual(on.map((item) => item.source), ['upload', 'library', 'library', 'library'], 'the picked photo is not offered twice')
	assert.deepEqual(on.slice(1).map((item) => item.kind), ['unknown', 'graphic', 'illustration'], 'newest first; never screenshots, logos or other')
	const lib = on[1]
	assert.equal(lib.value, docs[3].url)
	assert.equal(lib.url, docs[3].url)
	assert.equal(lib.vision, false, 'library assets stay digest-only')
	assert.equal(lib.light, 'dark')
	assert.equal(lib.orientation, 'landscape')
	assert.ok(lib.caption.length <= 120 && lib.caption.startsWith('A crew replacing shingles'))
	assert.ok(!lib.caption.endsWith(' '))
	assert.equal(lib.tags.length, 8)
	assert.ok(!lib.tags.includes('Jane Doe'), 'filename-derived tags are left out')
	assert.deepEqual(lib.colors, ['blue', 'gray', 'white'])
	assert.equal(await P.countLibraryPhotos(db, workspaceId), 4)

	const many = Array.from({ length: 70 }, (_, n) => asset(100 + n))
	await db.collection('mediaAssets').insertMany(many)
	const picked = Array.from({ length: 24 }, (_, i) => entry(`md_${i}`, 30 - i))
	const full = await P.loadPhotoPool(db, { ...site, media: picked }, request(picked.map((item) => item.id), true))
	assert.equal(full.length, 60)
	assert.equal(full.filter((item) => item.source === 'upload').length, 24)
	assert.equal(full.at(-1).ref, 'img60')
})

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

async function cleanup() {
	if (!db) return
	const sites = [...created.sites].map((id) => new ObjectId(id))
	const workspaces = [...created.workspaces].map((id) => new ObjectId(id))
	const days = [...created.days]
	await Promise.allSettled([
		builds().deleteMany({ siteId: { $in: sites } }),
		db.collection('mediaAssets').deleteMany({ workspaceId: { $in: workspaces } }),
		days.length
			? db.collection('mediaAiUsage').deleteMany({ _id: { $regex: `^builder:(global|[0-9a-f]{24}):(${days.join('|')})$` } })
			: Promise.resolve(),
	])
}

process.on('SIGINT', () => {
	cleanup().finally(() => process.exit(130))
})

try {
	await client.connect()
	db = client.db()
	for (const entry of registry.filter((item) => !item.slow)) await execute(entry)
	// The heartbeat and watchdog checks wait on real timers, so they run side by side.
	await Promise.all(registry.filter((item) => item.slow).map((item) => execute(item)))
} finally {
	await cleanup().catch(() => {})
	await client.close().catch(() => {})
	rmSync(REPLAY_DIR, { recursive: true, force: true })
	rmSync(path.dirname(RECORD_DIR), { recursive: true, force: true })
}

if (strayFetches > 0) {
	failed++
	console.log(`FAIL  no network (${strayFetches} request(s) tried to leave the process)`)
}
console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed === 0 ? 0 : 1)
