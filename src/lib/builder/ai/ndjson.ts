import 'server-only'
import { AI_LIMITS, type ApiError, type StreamEvent } from './contract'
import { toApiError } from './errors'

/**
 * The streaming envelope of the long build routes (section 4.0): one JSON object per
 * line, `accepted` first, a heartbeat every 10 s so proxies and the browser keep the
 * connection, and exactly one final `done` or `error`. Status 200 once it opens;
 * failures after that travel in-band.
 *
 * The work gets one signal that aborts for any of three reasons, and can always tell
 * which fired first:
 *  - `deadline`: the route's budget (285 s of the 300 s maxDuration) ran out;
 *  - `cancel`:   the person pressed Stop (`POST …/cancel`), seen by a watchdog that polls
 *                `isCancelled` every 5 s, because `request.signal` may never fire on the
 *                platform;
 *  - `client`:   the browser went away (a reload, a closed tab) without asking to stop.
 */

export type AbortReason = 'deadline' | 'cancel' | 'client'

export type RunContext = {
	/** AbortSignal.any([request.signal, watchdog.signal, deadline]), plus the stream being cancelled. */
	signal: AbortSignal
	/** Progress only (`stage`, `hb`); a no-op after the stream closed. `accepted` and the final line are this module's. */
	emit: (event: StreamEvent<unknown>) => void
	/** Which fired first; when that went unseen, checked deadline → cancel → client. Null while nothing has. */
	reason: () => AbortReason | null
	/** Milliseconds since the route started. */
	elapsed: () => number
	/** min(stageMs, what is left of the route's budget), never negative: a call's own deadline. */
	deadline: (stageMs: number) => number
}

/**
 * What the build's own controllers abort with, so a signal combined from several still
 * says why (`AbortSignal.any` takes the reason of the first source that aborted). A
 * deadline aborts with the platform's `TimeoutError`.
 */
export class BuildAbortError extends Error {
	constructor(readonly why: AbortReason) {
		super(why === 'cancel' ? 'The build was stopped.' : why === 'deadline' ? 'The time ran out.' : 'The connection closed.')
		this.name = 'AbortError'
	}
}

/** Why a signal aborted, from its reason alone: our own marker, a timeout (a deadline), or anything else (the client). */
export function abortReasonOf(signal: AbortSignal | null | undefined): AbortReason | null {
	if (!signal?.aborted) return null
	const reason: unknown = signal.reason
	if (reason instanceof BuildAbortError) return reason.why
	if (reason && typeof reason === 'object' && (reason as { name?: unknown }).name === 'TimeoutError') return 'deadline'
	return 'client'
}

const HEADERS = {
	'Content-Type': 'application/x-ndjson; charset=utf-8',
	'Cache-Control': 'no-store',
	'X-Accel-Buffering': 'no',
}

const encoder = new TextEncoder()

export function ndjsonResponse<T>(
	request: Request,
	run: (ctx: RunContext) => Promise<T>,
	options: {
		/** AI_LIMITS.routeBudgetMs (285 000). */
		budgetMs: number
		/** Polled every AI_LIMITS.watchdogMs (5 000); true aborts the work with reason `cancel`. */
		isCancelled?: () => Promise<boolean>
		/** Persists the failure, then names the final line. */
		onError: (error: unknown, ctx: RunContext) => Promise<{ error: ApiError; data?: unknown }>
		accepted: Omit<Extract<StreamEvent<T>, { t: 'accepted' }>, 't'>
		/** `Date.now()` when the route started, so the budget also covers the work before the stream opened. Default: now. */
		startedAt?: number
	},
): Response {
	const now = Date.now()
	const startedAt = typeof options.startedAt === 'number' && Number.isFinite(options.startedAt) ? Math.min(options.startedAt, now) : now
	const elapsed = () => Date.now() - startedAt
	const budgetMs = Number.isFinite(options.budgetMs) ? Math.max(0, options.budgetMs) : AI_LIMITS.routeBudgetMs
	const left = () => Math.max(0, budgetMs - elapsed())

	const deadline = AbortSignal.timeout(Math.max(1, left()))
	const watchdog = new AbortController()
	const gone = new AbortController()
	const signal = AbortSignal.any([request.signal, gone.signal, watchdog.signal, deadline])

	// Listeners on the sources run before the combined signal's, so by the time the work
	// sees its abort, the first reason is already known.
	const sources: [AbortSignal, AbortReason][] = [
		[deadline, 'deadline'],
		[watchdog.signal, 'cancel'],
		[request.signal, 'client'],
		[gone.signal, 'client'],
	]
	let first: AbortReason | null = request.signal.aborted ? 'client' : null
	const unlisten = sources.map(([source, why]) => {
		const listener = () => {
			first ??= why
		}
		source.addEventListener('abort', listener, { once: true })
		return () => source.removeEventListener('abort', listener)
	})
	const reason = (): AbortReason | null => {
		if (first) return first
		for (const [source, why] of sources) if (source.aborted) return why
		return null
	}

	let closed = false
	let controller: ReadableStreamDefaultController<Uint8Array> | null = null
	const body = new ReadableStream<Uint8Array>({
		start(stream) {
			controller = stream
		},
		// The reader went away: nobody is listening any more, and the work learns why.
		cancel() {
			closed = true
			gone.abort(new BuildAbortError('client'))
		},
	})

	/** Serializing may throw (the caller decides what then); a stream that cannot take the line is closed. */
	const write = (event: StreamEvent<unknown>) => {
		if (closed || !controller) return
		const line = encoder.encode(`${JSON.stringify(event)}\n`)
		try {
			controller.enqueue(line)
		} catch {
			closed = true
		}
	}
	const close = () => {
		if (closed || !controller) return
		closed = true
		try {
			controller.close()
		} catch {
			// already errored or cancelled
		}
	}

	const ctx: RunContext = {
		signal,
		emit: (event) => {
			if (event?.t !== 'stage' && event?.t !== 'hb') return
			try {
				write(event)
			} catch {
				// a progress line is never worth failing the work over
			}
		},
		reason,
		elapsed,
		deadline: (stageMs) => Math.max(0, Math.min(Number.isFinite(stageMs) ? stageMs : 0, left())),
	}

	void (async () => {
		const heartbeat = setInterval(() => ctx.emit({ t: 'hb', ms: elapsed() }), AI_LIMITS.heartbeatMs)
		let polling = false
		const isCancelled = options.isCancelled
		const watch = isCancelled
			? setInterval(() => {
					if (polling || watchdog.signal.aborted) return
					polling = true
					isCancelled()
						.then(
							(cancelled) => {
								if (cancelled) watchdog.abort(new BuildAbortError('cancel'))
							},
							// A failed read is not a cancellation; the next tick asks again.
							() => {},
						)
						.finally(() => {
							polling = false
						})
				}, AI_LIMITS.watchdogMs)
			: null

		try {
			write({ t: 'accepted', ...options.accepted })
			const data = await run(ctx)
			write({ t: 'done', data })
		} catch (error) {
			let failure: { error: ApiError; data?: unknown }
			try {
				failure = await options.onError(error, ctx)
			} catch (inner) {
				failure = { error: toApiError(inner) }
			}
			try {
				write({ t: 'error', error: failure.error, ...(failure.data !== undefined ? { data: failure.data } : {}) })
			} catch {
				// The data would not serialize; the error alone still ends the stream properly.
				write({ t: 'error', error: toApiError(failure.error) })
			}
		} finally {
			clearInterval(heartbeat)
			if (watch) clearInterval(watch)
			for (const remove of unlisten) remove()
			close()
		}
	})()

	return new Response(body, { status: 200, headers: HEADERS })
}
