import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { modelAcceptsEffort } from '@/lib/media/tagger'
import { AI_LIMITS, type CallUsage } from './contract'
import { AiError, type ProviderDetail } from './errors'
import { abortReasonOf, type AbortReason } from './ndjson'
import { recordEnabled, recordReply, replayEnabled, replayReply } from './replay'

/**
 * Every model call the AI builder makes goes through `callStructured` (section 3.4):
 * one streamed request with a closed JSON schema, the caller's abort signal and an
 * explicit retry and timeout policy, read back through a lenient reader. A reply that
 * cannot be used is an `AiError`, never a partial result.
 *
 * SDK FACTS (verified against @anthropic-ai/sdk 0.131):
 *  - The schema goes out RAW in `output_config.format`. Never through
 *    `zodOutputFormat`/`jsonSchemaOutputFormat`: their transform moves `enum` into a
 *    description, and the `parse` key they add makes the SDK `JSON.parse` every text
 *    block itself, which throws on a reply a server-side fallback split in two.
 *  - The SDK's `timeout` only covers the wait for response headers. The whole stream is
 *    bounded by the caller's signal, which carries its stage deadline (ndjson.ts).
 *  - Errors are classified by `status`, never by message: the provider's text can embed
 *    the request, so it is only ever inspected (a 400 that is about the account or the
 *    model), never logged or copied into an error.
 */

export const builderAiModel = () => process.env.BUILDER_AI_MODEL?.trim() || 'claude-opus-5-5'
export const builderAiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim()) || replayEnabled()
/** Same test as ai-writer.ts acceptsFallbacks today. */
const acceptsFallbacks = (model: string) => /claude-(opus-5|fable-5|sonnet-5-5)/.test(model)

export type Stage = 'plan' | 'outline' | 'write' | 'repair' | 'rewrite'
export type Effort = 'low' | 'medium' | 'high'

export type StructuredCall<T> = {
	stage: Stage
	effort: Effort
	maxTokens: number
	system: Anthropic.Beta.BetaTextBlockParam[] // cache_control set by the caller (section 3.5)
	content: Anthropic.Beta.BetaContentBlockParam[]
	schema: object // a module constant (section 11.9), sent as it is
	read: (value: unknown) => T | null // lenient zod reader; null = unusable
	signal: AbortSignal // request ∪ watchdog ∪ deadline (ndjson.ts)
	userKey: string // sha256(workspaceId) first 32 hex → metadata.user_id
	replayKey: string // 'plan', 'plan-noimages', 'outline', 'write-p3', 'repair-p3'
	onModel?: () => void // first stream event: the request reached the model
	onStage?: (stage: 'thinking' | 'writing') => void
	/** Names the call in its log line. Never sent to the model. */
	log?: { buildId?: string; key?: string; attempt?: number }
}

export type StructuredResult<T> = {
	value: T
	usage: CallUsage
	model: string
	requestId: string | null
	fallback: boolean
	stop: string
}

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

type Client = Pick<Anthropic, 'beta'>

let cached: { key: string; client: Client } | null = null
let injected: Client | null = null

/** Created on first use, once per API key, so importing this module never needs one. */
function client(): Client {
	if (injected) return injected
	const key = process.env.ANTHROPIC_API_KEY?.trim() ?? ''
	if (!key) throw new AiError('not-configured')
	if (cached?.key !== key)
		cached = {
			key,
			client: new Anthropic({ apiKey: key, maxRetries: AI_LIMITS.sdkMaxRetries, timeout: AI_LIMITS.sdkTimeoutMs }),
		}
	return cached.client
}

/** For the infrastructure proof: drive `callStructured` with a fake stream. */
export const __test = {
	setClient(next: Pick<Anthropic, 'beta'> | null): void {
		injected = next
	},
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object' ? (value as Record<string, unknown>) : null

/** A header from a `Headers`, a Map-like with `get`, or a plain object. Never throws. */
function readHeader(headers: unknown, name: string): string | null {
	try {
		const bag = asRecord(headers)
		if (!bag) return null
		if (typeof bag.get === 'function') {
			const value = (bag.get as (key: string) => unknown).call(bag, name)
			return typeof value === 'string' || typeof value === 'number' ? String(value) : null
		}
		for (const key of Object.keys(bag)) {
			if (key.toLowerCase() !== name) continue
			const value = bag[key]
			if (typeof value === 'string' || typeof value === 'number') return String(value)
		}
	} catch {
		// an exotic headers object is not worth failing over
	}
	return null
}

const RETRY_AFTER_CAP_MS = 30_000

/** `retry-after-ms`, else `retry-after` (seconds or an HTTP date), capped; nothing usable means no hint. */
function retryAfterMsOf(error: Record<string, unknown>): number | undefined {
	let headers: unknown
	try {
		headers = error.headers
	} catch {
		return undefined
	}
	const usable = (ms: number) => Number.isFinite(ms) && ms > 0
	const millis = readHeader(headers, 'retry-after-ms')?.trim()
	if (millis) {
		const ms = Number(millis)
		if (usable(ms)) return Math.round(Math.min(ms, RETRY_AFTER_CAP_MS))
	}
	const after = readHeader(headers, 'retry-after')?.trim()
	if (after) {
		const seconds = Number(after)
		if (usable(seconds * 1000)) return Math.round(Math.min(seconds * 1000, RETRY_AFTER_CAP_MS))
		if (!/^[+-]?[0-9.]+$/.test(after)) {
			const ms = Date.parse(after) - Date.now()
			if (usable(ms)) return Math.round(Math.min(ms, RETRY_AFTER_CAP_MS))
		}
	}
	return undefined
}

/** The provider's own words for a 400, lowercased: inspected, never stored or logged (as tagger.ts reads them). */
function errorText(error: Record<string, unknown>): string {
	const body = asRecord(error.error)
	const inner = asRecord(body?.error)
	for (const candidate of [inner?.message, body?.message, error.message]) {
		if (typeof candidate === 'string' && candidate) return candidate.slice(0, 1000).toLowerCase()
	}
	return ''
}

// A 400 that is about the account or the model rather than the request (a copy of tagger.ts's CONFIG_400).
const CONFIG_400 = /credit|balance|billing|permission|not supported|not_supported|\bmodels?\b/

/** The body's `error.type`, when it is a plain identifier (so the log line can only ever carry one). */
function errorType(error: Record<string, unknown>): string | null {
	const body = asRecord(error.error)
	for (const candidate of [error.type, asRecord(body?.error)?.type, body?.type]) {
		if (typeof candidate === 'string' && /^[a-z_]{1,60}$/.test(candidate) && candidate !== 'error') return candidate
	}
	return null
}

/**
 * What a failed call means for the build (section 3.4's table): an abort by why it
 * fired, then the provider's status. Never by message text, except the one 400 check.
 */
export function classifyModelError(error: unknown, signal: AbortSignal, reason: () => AbortReason): AiError {
	if (error instanceof AiError) return error
	try {
		return classify(error, signal, reason)
	} catch {
		// A hostile error object (throwing getters) must not escape as itself.
		return new AiError('upstream')
	}
}

function classify(error: unknown, signal: AbortSignal, reason: () => AbortReason): AiError {
	if (signal?.aborted) {
		let why: AbortReason = 'client'
		try {
			why = reason() ?? 'client'
		} catch {
			// unknown: treat it as the client going away, which stays retryable
		}
		if (why === 'deadline') return new AiError('timeout')
		if (why === 'cancel') return new AiError('cancelled')
		return new AiError('network')
	}

	const bag = asRecord(error)
	const status = bag && typeof bag.status === 'number' && Number.isInteger(bag.status) ? bag.status : null
	const provider: ProviderDetail = { status, type: bag ? errorType(bag) : null }
	const failure = (code: AiError['code'], extra?: ConstructorParameters<typeof AiError>[2]) => {
		const result = new AiError(code, undefined, extra)
		result.provider = provider
		return result
	}

	// Connection errors and the SDK's own header timeout have no status.
	if (!bag || status === null) return failure('upstream')
	if (status === 401 || status === 402 || status === 403 || status === 404) return failure('config')
	// A rejected request (a schema too complex to compile, an unreadable image) fails the same way every time.
	if (status === 400) return CONFIG_400.test(errorText(bag)) ? failure('config') : failure('invalid-reply', { retryable: false })
	if (status === 413 || status === 422) return failure('invalid-reply', { retryable: false })
	if (status === 429) {
		const retryAfterMs = retryAfterMsOf(bag)
		return failure('rate-limited', retryAfterMs ? { retryAfterMs } : undefined)
	}
	// 408, 409, 5xx (529 included) and anything unexpected.
	return failure('upstream')
}

/* -------------------------------------------------------------------------- */
/* Usage                                                                      */
/* -------------------------------------------------------------------------- */

const tokens = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 1_000_000_000) : 0

type Tokens = Pick<CallUsage, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>

/**
 * The API's usage as the pipeline counts it. Top-level `usage` covers only the attempt
 * that produced the returned message, and a model that declined mid-stream before a
 * fallback took over is billed too, so when `iterations` lists the attempts, the counts
 * are their sums (`message` and `fallback_message` entries; compaction and advisor
 * entries are not this call's output). A fixture may give the pipeline's own shape.
 */
function usageOf(raw: unknown): { counts: Tokens; fallback: boolean } {
	const usage = asRecord(raw)
	if (!usage) return { counts: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, fallback: false }
	if (!('input_tokens' in usage) && ('inputTokens' in usage || 'outputTokens' in usage))
		return {
			counts: {
				inputTokens: tokens(usage.inputTokens),
				outputTokens: tokens(usage.outputTokens),
				cacheReadTokens: tokens(usage.cacheReadTokens),
				cacheWriteTokens: tokens(usage.cacheWriteTokens),
			},
			fallback: usage.fallback === true,
		}

	const iterations = (Array.isArray(usage.iterations) ? usage.iterations : [])
		.map(asRecord)
		.filter((entry): entry is Record<string, unknown> => entry !== null)
	const fallback = iterations.some((entry) => entry.type === 'fallback_message')
	const billed = iterations.filter((entry) => entry.type === 'message' || entry.type === 'fallback_message')
	if (billed.length === 0)
		return {
			counts: {
				inputTokens: tokens(usage.input_tokens),
				outputTokens: tokens(usage.output_tokens),
				cacheReadTokens: tokens(usage.cache_read_input_tokens),
				cacheWriteTokens: tokens(usage.cache_creation_input_tokens),
			},
			fallback,
		}
	const sum = (field: string) => billed.reduce((total, entry) => total + tokens(entry[field]), 0)
	return {
		counts: {
			inputTokens: sum('input_tokens'),
			outputTokens: sum('output_tokens'),
			cacheReadTokens: sum('cache_read_input_tokens'),
			cacheWriteTokens: sum('cache_creation_input_tokens'),
		},
		fallback,
	}
}

/* -------------------------------------------------------------------------- */
/* The call                                                                   */
/* -------------------------------------------------------------------------- */

type Reply = { text: string; stop: string; model: string; usage: unknown; requestId: string | null; real: boolean }

/** The caller's callbacks are progress hints: one that throws must not break the stream. */
function notify(callback: (() => void) | undefined) {
	try {
		callback?.()
	} catch {
		// ignored on purpose
	}
}

async function fromModel<T>(call: StructuredCall<T>): Promise<Reply> {
	const model = builderAiModel()
	const stream = client().beta.messages.stream(
		{
			model,
			max_tokens: call.maxTokens,
			...(acceptsFallbacks(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
			output_config: {
				...(modelAcceptsEffort(model) ? { effort: call.effort } : {}),
				// Sent raw. Never through zodOutputFormat/jsonSchemaOutputFormat: the SDK's transform demotes `enum`.
				format: { type: 'json_schema', schema: call.schema as Record<string, unknown> },
			},
			system: call.system,
			messages: [{ role: 'user', content: call.content }],
			metadata: { user_id: call.userKey },
		},
		{ signal: call.signal, timeout: AI_LIMITS.sdkTimeoutMs, maxRetries: AI_LIMITS.sdkMaxRetries },
	)

	let reached = false
	let thinking = false
	let writing = false
	stream.on('streamEvent', (event) => {
		if (!reached) {
			reached = true
			notify(call.onModel)
		}
		if (event.type !== 'content_block_start') return
		const kind = event.content_block.type
		if ((kind === 'thinking' || kind === 'redacted_thinking') && !thinking) {
			thinking = true
			notify(() => call.onStage?.('thinking'))
		} else if (kind === 'text' && !writing) {
			writing = true
			notify(() => call.onStage?.('writing'))
		}
	})

	const message = await stream.finalMessage()
	return {
		// Every text block: a reply that a fallback model continued arrives in more than one.
		text: message.content.map((block) => (block.type === 'text' ? block.text : '')).join(''),
		stop: message.stop_reason ?? '',
		model: message.model || model,
		usage: message.usage,
		requestId: stream.request_id ?? null,
		real: true,
	}
}

async function fromReplay<T>(call: StructuredCall<T>): Promise<Reply> {
	const replayed = await replayReply(call.replayKey, call.signal, {
		// Only a fixture that answers reaches "the model"; a recorded error fails before it, as a real one does.
		onStart: () => {
			notify(call.onModel)
			notify(() => call.onStage?.('thinking'))
		},
	})
	notify(() => call.onStage?.('writing'))
	let text: string | undefined
	try {
		text = JSON.stringify(replayed.reply)
	} catch {
		text = undefined
	}
	if (typeof text !== 'string') throw new AiError('invalid-reply')
	return { text, stop: replayed.stop, model: replayed.model ?? builderAiModel(), usage: replayed.usage, requestId: null, real: false }
}

function logCall(call: StructuredCall<unknown>, fields: Record<string, unknown>) {
	console.info(
		'[ai-build]',
		JSON.stringify({ buildId: call.log?.buildId ?? null, stage: call.stage, key: call.log?.key ?? null, attempt: call.log?.attempt ?? null, ...fields }),
	)
}

function logFailure(call: StructuredCall<unknown>, error: AiError) {
	console.error(
		'[ai-build]',
		JSON.stringify({
			buildId: call.log?.buildId ?? null,
			stage: call.stage,
			key: call.log?.key ?? null,
			code: error.code,
			status: error.provider?.status ?? null,
			type: error.provider?.type ?? null,
		}),
	)
}

/**
 * One structured call. After the reply, in this order: a refusal is `refused`, a reply
 * cut off at `max_tokens` is `truncated`, any other stop but `end_turn` is
 * `invalid-reply`; then the joined text must be short enough, parse as JSON and pass
 * `read`. A failure after the model answered carries the call's usage, so the tokens
 * are still recorded. With the replay seam on, the fixture takes the model's place
 * and goes through exactly the same checks.
 */
export async function callStructured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
	const started = Date.now()
	const reason = () => abortReasonOf(call.signal) ?? 'client'
	const failed = (error: AiError, usage?: CallUsage) => {
		if (usage) error.usage = usage
		logFailure(call as StructuredCall<unknown>, error)
		return error
	}

	let reply: Reply
	try {
		if (call.signal.aborted) throw new Anthropic.APIUserAbortError()
		reply = replayEnabled() ? await fromReplay(call) : await fromModel(call)
	} catch (error) {
		throw failed(classifyModelError(error, call.signal, reason))
	}

	const { counts, fallback } = usageOf(reply.usage)
	const usage: CallUsage = { ...counts, calls: 1, ms: Date.now() - started }
	logCall(call as StructuredCall<unknown>, { model: reply.model, requestId: reply.requestId, stop: reply.stop, ms: usage.ms, usage, fallback })

	if (reply.stop === 'refusal') throw failed(new AiError('refused'), usage)
	if (reply.stop === 'max_tokens') throw failed(new AiError('truncated'), usage)
	if (reply.stop !== 'end_turn') throw failed(new AiError('invalid-reply'), usage)
	if (reply.text.length > AI_LIMITS.replyMaxChars) throw failed(new AiError('invalid-reply'), usage)

	let json: unknown
	try {
		json = JSON.parse(reply.text)
	} catch {
		throw failed(new AiError('invalid-reply'), usage)
	}
	if (reply.real && recordEnabled())
		await recordReply(call.replayKey, { reply: json, usage: reply.usage, model: reply.model, stop: reply.stop })

	let value: T | null
	try {
		value = call.read(json)
	} catch {
		value = null
	}
	if (value === null || value === undefined) throw failed(new AiError('invalid-reply'), usage)
	return { value, usage, model: reply.model, requestId: reply.requestId, fallback, stop: reply.stop }
}
