import 'server-only'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { AiError } from './errors'

/**
 * Development-only seams around the model (section 3.4), so the routes and the UI can
 * run the whole pipeline without model cost:
 *
 *  - replay: with `BUILDER_AI_REPLAY_DIR` set, `callStructured` answers from
 *    `<dir>/<replayKey>.json` instead of calling the API. A fixture is
 *    `{ "reply": <the JSON object>, "usage": { … }, "model"?: "…", "stop"?: "end_turn" }`,
 *    or `{ "error": { "status": 400, "type": "invalid_request_error" } }`, which is raised
 *    as the SDK's own `APIError` of that status (optional `message` and `headers`, such
 *    as `retry-after`), so the classification and retry paths are the real ones. `usage`
 *    is the API's (`input_tokens`, …, `iterations`) or the pipeline's (`inputTokens`, …).
 *    `BUILDER_AI_REPLAY_LATENCY_MS` (default 0) delays every answer, honouring the signal.
 *  - record: with `BUILDER_AI_RECORD_DIR` set, every real reply is also written there under
 *    its `replayKey`, in the same format (the live run records the fixtures this way).
 *
 * Both are ignored in production and on Vercel, whatever the environment says.
 */

/** Never in production, never on Vercel. */
const allowed = () => process.env.NODE_ENV !== 'production' && !process.env.VERCEL

const dirOf = (name: string) => {
	const value = process.env[name]
	return typeof value === 'string' ? value.trim() : ''
}

export const replayEnabled = (): boolean => allowed() && dirOf('BUILDER_AI_REPLAY_DIR') !== ''
export const recordEnabled = (): boolean => allowed() && dirOf('BUILDER_AI_RECORD_DIR') !== ''

/** Keys come from code ('plan', 'write-p3'); anything else could walk out of the directory. */
const KEY = /^[a-z0-9][a-z0-9-]{0,63}$/

const LATENCY_MAX_MS = 600_000

function latencyMs(): number {
	const raw = process.env.BUILDER_AI_REPLAY_LATENCY_MS?.trim() ?? ''
	if (!/^\d{1,9}$/.test(raw)) return 0
	return Math.min(Number(raw), LATENCY_MAX_MS)
}

export type ReplayedReply = {
	/** The fixture's reply, as the model's text would have parsed. */
	reply: unknown
	usage: unknown
	model: string | null
	stop: string
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

/** Waits, but gives up the moment the signal aborts, with the error the SDK itself would throw. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) return Promise.reject(new Anthropic.APIUserAbortError())
	if (ms <= 0) return Promise.resolve()
	return new Promise((resolve, reject) => {
		const onAbort = () => {
			clearTimeout(timer)
			reject(new Anthropic.APIUserAbortError())
		}
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort)
			resolve()
		}, ms)
		signal.addEventListener('abort', onAbort, { once: true })
	})
}

/** The provider error a fixture describes, as the SDK would have raised it. */
function providerError(spec: Record<string, unknown>): Error {
	const status = typeof spec.status === 'number' && Number.isInteger(spec.status) ? spec.status : undefined
	const type = typeof spec.type === 'string' ? spec.type : 'api_error'
	const message = typeof spec.message === 'string' ? spec.message : `${type} (replayed)`
	const headers = new Headers()
	for (const [name, value] of Object.entries(asRecord(spec.headers) ?? {}))
		if (typeof value === 'string' || typeof value === 'number') headers.set(name, String(value))
	// No status is a connection failure, exactly as the SDK reports one.
	return Anthropic.APIError.generate(status, status ? { type: 'error', error: { type, message } } : undefined, message, status ? headers : undefined)
}

/**
 * The fixture for `key`, after the configured latency. A missing or unreadable fixture
 * is `invalid-reply`, like an unusable answer from the model. `onStart` runs when a
 * fixture that answers starts its latency: the moment a real stream reaches the model.
 */
export async function replayReply(
	key: string,
	signal: AbortSignal,
	hooks?: { onStart?: () => void },
): Promise<ReplayedReply> {
	if (!replayEnabled()) throw new AiError('not-configured')
	if (!KEY.test(key)) throw new AiError('invalid-reply')
	let fixture: Record<string, unknown> | null
	try {
		fixture = asRecord(JSON.parse(await readFile(path.join(dirOf('BUILDER_AI_REPLAY_DIR'), `${key}.json`), 'utf8')))
	} catch {
		fixture = null
	}
	if (!fixture) throw new AiError('invalid-reply')
	const error = asRecord(fixture.error)
	if (!error && !('reply' in fixture)) throw new AiError('invalid-reply')

	if (!error) hooks?.onStart?.()
	await pause(latencyMs(), signal)

	if (error) throw providerError(error)
	return {
		reply: fixture.reply,
		usage: fixture.usage ?? null,
		model: typeof fixture.model === 'string' && fixture.model ? fixture.model : null,
		stop: typeof fixture.stop === 'string' && fixture.stop ? fixture.stop : 'end_turn',
	}
}

/**
 * Writes a real reply as the fixture for `key`. Best effort: a recorder that cannot
 * write never fails the build, it only says so in the log.
 */
export async function recordReply(key: string, data: { reply: unknown; usage: unknown; model: string; stop: string }): Promise<void> {
	if (!recordEnabled() || !KEY.test(key)) return
	try {
		const dir = dirOf('BUILDER_AI_RECORD_DIR')
		await mkdir(dir, { recursive: true })
		const file = path.join(dir, `${key}.json`)
		// Written whole and then moved into place, so a replay never reads half a fixture.
		const temp = `${file}.${process.pid}.${Date.now()}.tmp`
		await writeFile(temp, `${JSON.stringify(data, null, '\t')}\n`, 'utf8')
		await rename(temp, file)
	} catch (error) {
		console.error('[ai-build]', JSON.stringify({ record: key, failed: error instanceof Error ? error.name : 'unknown' }))
	}
}
