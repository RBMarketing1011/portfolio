import 'server-only'
import { HttpError } from '@/lib/auth/guards'
import { AI_ERROR_CODES, type AiErrorCode, type ApiError, type CallUsage } from './contract'

/**
 * The AI builder's one error type, and the envelope every build route answers with
 * (`{ error: ApiError }`, section 5.1). Statuses and retryability follow section 15.7.
 *
 * A message is one plain sentence chosen here or by the route. It never carries the
 * provider's text, a prompt or anything the owner typed: the provider's own words can
 * embed request content, so they are only ever inspected (model.ts), never copied.
 */

type Defaults = { status: number; retryable: boolean; message: string; retryAfterMs?: number }

const DEFAULTS: Record<AiErrorCode, Defaults> = {
	'bad-request': { status: 400, retryable: false, message: 'Invalid request.' },
	unauthorized: { status: 401, retryable: false, message: 'Sign in to continue.' },
	forbidden: { status: 403, retryable: false, message: 'Your role does not allow that.' },
	'not-found': { status: 404, retryable: false, message: 'That build was not found.' },
	'not-configured': { status: 503, retryable: false, message: 'AI building is not set up on this deployment.' },
	conflict: { status: 409, retryable: false, message: 'That build cannot do this right now.' },
	'not-ready': { status: 409, retryable: true, message: 'This page is still being planned.' },
	busy: { status: 429, retryable: true, retryAfterMs: 5000, message: 'The AI builder is busy. Try again in a moment.' },
	expired: { status: 410, retryable: false, message: 'That build has expired. Start a new one.' },
	'too-large': { status: 413, retryable: false, message: 'That request is too large.' },
	'daily-limit': { status: 429, retryable: false, message: "This account has used today's AI writes. The allowance resets at midnight UTC." },
	'global-limit': { status: 429, retryable: false, message: 'The AI builder is very busy today. Try again tomorrow.' },
	'token-limit': { status: 429, retryable: false, message: "This account has used today's AI allowance. It resets at midnight UTC." },
	'rate-limited': { status: 429, retryable: true, message: 'The AI service is busy. Try again in a moment.' },
	refused: { status: 422, retryable: false, message: 'The AI declined this request. Try describing it differently.' },
	timeout: { status: 504, retryable: true, message: 'That took too long.' },
	cancelled: { status: 499, retryable: false, message: 'The build was stopped.' },
	'invalid-reply': { status: 502, retryable: true, message: "The AI's answer could not be used." },
	truncated: { status: 502, retryable: true, message: "The AI's answer was too long to use." },
	upstream: { status: 502, retryable: true, message: 'The AI service could not be reached.' },
	config: { status: 503, retryable: false, message: "AI building isn't set up correctly on this deployment." },
	'attempts-exhausted': { status: 409, retryable: false, message: 'This page could not be written after three tries.' },
	'home-failed': { status: 409, retryable: false, message: 'The home page could not be written. Start the build again.' },
	network: { status: 499, retryable: true, message: 'The connection closed before this page was finished.' },
}

const KNOWN: ReadonlySet<string> = new Set(AI_ERROR_CODES)

/** The guards throw 401, 403 and 404; the others are here so a route's own HttpError keeps its meaning. */
const HTTP_CODES: Partial<Record<number, AiErrorCode>> = {
	400: 'bad-request',
	401: 'unauthorized',
	403: 'forbidden',
	404: 'not-found',
	409: 'conflict',
	413: 'too-large',
}

/** What the provider said about a failed call: its HTTP status and `error.type` only (for the log line). */
export type ProviderDetail = { status: number | null; type: string | null }

export class AiError extends Error {
	readonly code: AiErrorCode
	readonly extra: Partial<ApiError>
	/**
	 * Tokens a model call spent before it failed (a refusal, a cut-off or unusable reply),
	 * so the caller can still record them against the build and the day.
	 */
	usage: CallUsage | null = null
	/** Set when the failure came from the provider (model.ts). Never shown to anyone. */
	provider: ProviderDetail | null = null

	constructor(code: AiErrorCode, message?: string, extra?: Partial<ApiError>) {
		const known = KNOWN.has(code) ? code : 'upstream'
		super(message?.trim() || DEFAULTS[known].message)
		this.name = 'AiError'
		this.code = known
		this.extra = extra ?? {}
	}

	get status(): number {
		return Number.isInteger(this.extra.status) ? (this.extra.status as number) : DEFAULTS[this.code].status
	}

	get retryable(): boolean {
		return typeof this.extra.retryable === 'boolean' ? this.extra.retryable : DEFAULTS[this.code].retryable
	}

	toApi(): ApiError {
		const retryAfterMs = this.extra.retryAfterMs ?? DEFAULTS[this.code].retryAfterMs
		return {
			code: this.code,
			message: this.message,
			status: this.status,
			retryable: this.retryable,
			...(typeof retryAfterMs === 'number' && retryAfterMs > 0 ? { retryAfterMs: Math.round(retryAfterMs) } : {}),
			...(this.extra.field ? { field: this.extra.field } : {}),
			...(this.extra.buildId ? { buildId: this.extra.buildId } : {}),
		}
	}
}

/** An `ApiError` that already went over the wire or into a document: copied field by field, never trusted whole. */
function isApiError(value: unknown): value is ApiError {
	if (!value || typeof value !== 'object') return false
	const record = value as Record<string, unknown>
	return typeof record.code === 'string' && KNOWN.has(record.code) && typeof record.message === 'string'
}

/**
 * Any thrown value as the envelope's `ApiError`. An `AiError` is itself; the guards'
 * `HttpError` keeps its message as `unauthorized` (401), `forbidden` (403) or
 * `not-found` (404); anything else is `upstream`, with a message that says nothing
 * about what failed (it may be a database error carrying a document's contents).
 */
export function toApiError(error: unknown): ApiError {
	if (error instanceof AiError) return error.toApi()
	if (error instanceof HttpError) {
		const code = HTTP_CODES[error.status]
		return code ? new AiError(code, error.message).toApi() : new AiError('upstream', 'Something went wrong. Try again.').toApi()
	}
	if (isApiError(error)) {
		return new AiError(error.code, error.message, {
			status: error.status,
			retryable: error.retryable,
			retryAfterMs: error.retryAfterMs,
			field: error.field,
			buildId: error.buildId,
		}).toApi()
	}
	return new AiError('upstream', 'Something went wrong. Try again.').toApi()
}

/** `{ error: ApiError }` with its status. Anything unexpected is logged by name only. */
export function aiErrorResponse(error: unknown): Response {
	if (!(error instanceof AiError) && !(error instanceof HttpError) && !isApiError(error))
		console.error('[ai-build]', JSON.stringify({ code: 'upstream', name: nameOf(error) }))
	const body = toApiError(error)
	return Response.json({ error: body }, { status: body.status, headers: { 'Cache-Control': 'no-store' } })
}

function nameOf(error: unknown): string {
	if (!(error instanceof Error)) return typeof error
	const code = (error as { code?: unknown }).code
	return typeof code === 'number' || typeof code === 'string' ? `${error.name} ${code}` : error.name
}
