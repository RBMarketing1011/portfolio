'use client'

import { useEffect, useState } from 'react'
import type {
	ApiError,
	AiErrorCode,
	BuildView,
	CapabilityResponse,
	CreateBuildRequest,
	LandRequest,
	LandResponse,
	PageView,
	StreamEvent,
} from '@/lib/builder/ai/contract'
import type { Block } from '@/lib/builder/types'

/** What the AI may change. Colours, layout and spacing are never among them. */
export type AiOptions = {
	/** Rewrite headings, copy, buttons, lists and icons. */
	text: boolean
	/** Swap images that are already set. */
	replaceImages: boolean
	/** Fill image spots that are empty. */
	fillImages: boolean
}

export type AiRequest = {
	page: { name: string; slug: string }
	blocks: Block[]
	instructions?: string
	scope: 'page' | 'section'
	options: AiOptions
}

// One answer per project for the life of the tab, once there is a real one: a probe
// that failed (offline, a deploy in progress) is asked again on the next mount.
const known = new Map<string, Promise<boolean>>()

/**
 * Whether AI writing is on for this project. Only a saved, signed-in project has the
 * business details and media library the AI writes from, so a browser-only site is
 * always off.
 */
export function useBuilderAi(siteId: string, remote: boolean) {
	const [enabled, setEnabled] = useState(false)
	useEffect(() => {
		if (!remote) return
		let live = true
		let answer = known.get(siteId)
		if (!answer) {
			const asked = fetch(`/api/sites/${siteId}/ai/write`, { cache: 'no-store' }).then(
				async (response) => {
					if (!response.ok) throw new Error(`capability ${response.status}`)
					const body = await response.json()
					return Boolean(body?.enabled)
				},
			)
			answer = asked
			known.set(siteId, asked)
			asked.catch(() => {
				if (known.get(siteId) === asked) known.delete(siteId)
			})
		}
		answer.then(
			(value) => {
				if (live) setEnabled(value)
			},
			() => {
				if (live) setEnabled(false)
			},
		)
		return () => {
			live = false
		}
	}, [siteId, remote])
	return remote && enabled
}

/** Sends sections to the AI and returns them rewritten. Throws with a message to show. */
export async function writeWithAi(
	siteId: string,
	request: AiRequest,
	signal?: AbortSignal,
): Promise<Block[]> {
	const response = await fetch(`/api/sites/${siteId}/ai/write`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request),
		signal,
	})
	const body = await response.json().catch(() => ({}))
	if (!response.ok || !Array.isArray(body.blocks))
		throw new Error(body.error ?? 'The AI could not write this right now.')
	return body.blocks as Block[]
}

// ---------------------------------------------------------------- Build with AI

/** A fetch that never reached the server. */
export const OFFLINE: ApiError = {
	code: 'network',
	status: 0,
	retryable: true,
	message: "You're offline. Retry when you're back.",
}

/** The person's own Stop (or leaving the builder) aborted the request. Never shown. */
export const STOPPED: ApiError = {
	code: 'cancelled',
	status: 499,
	retryable: false,
	message: 'Stopped.',
}

/** Thrown by the JSON calls below; carries the server's error, or one made from the status. */
export class AiRequestError extends Error {
	constructor(readonly error: ApiError) {
		super(error.message)
		this.name = 'AiRequestError'
	}
}

const STATUS_CODES: Record<number, AiErrorCode> = {
	400: 'bad-request',
	401: 'unauthorized',
	403: 'forbidden',
	404: 'not-found',
	409: 'conflict',
	410: 'expired',
	413: 'too-large',
	429: 'busy',
	503: 'not-configured',
	504: 'timeout',
}

/** The `{ error: ApiError }` a non-2xx answer carries, or one made from its status. */
async function errorOf(response: Response): Promise<{ error: ApiError; data?: unknown }> {
	const body = (await response.json().catch(() => null)) as {
		error?: unknown
		data?: unknown
	} | null
	const error = body?.error as Partial<ApiError> | string | undefined
	if (error && typeof error === 'object' && typeof error.code === 'string')
		return {
			error: {
				...(error as ApiError),
				status: typeof error.status === 'number' ? error.status : response.status,
				retryable: Boolean(error.retryable),
				message: typeof error.message === 'string' ? error.message : 'Something went wrong. Try again.',
			},
			...(body?.data !== undefined ? { data: body.data } : {}),
		}
	const code = STATUS_CODES[response.status] ?? 'upstream'
	return {
		error: {
			code,
			status: response.status,
			retryable: code === 'upstream' || code === 'timeout' || code === 'busy',
			message: typeof error === 'string' ? error : 'Something went wrong. Try again.',
		},
	}
}

/**
 * Reads an NDJSON answer line by line. A non-2xx answer (before any streaming) becomes
 * one `error` event. Resolves to how the stream ended: with `done`, with `error`, or
 * `ended` without either (the connection dropped; the server may still finish).
 */
export async function readNdjson<T>(
	response: Response,
	onEvent: (event: StreamEvent<T>) => void,
): Promise<'done' | 'error' | 'ended'> {
	if (!response.ok) {
		const { error, data } = await errorOf(response)
		onEvent(data === undefined ? { t: 'error', error } : { t: 'error', error, data: data as T })
		return 'error'
	}
	if (!response.body) return 'ended'

	let outcome: 'done' | 'error' | 'ended' = 'ended'
	const take = (line: string) => {
		const text = line.trim()
		if (!text || outcome !== 'ended') return
		let event: StreamEvent<T>
		try {
			event = JSON.parse(text)
		} catch {
			return // a torn line is not an event
		}
		if (!event || typeof event !== 'object' || typeof event.t !== 'string') return
		if (event.t === 'done') outcome = 'done'
		else if (event.t === 'error') outcome = 'error'
		onEvent(event)
	}

	const reader = response.body.getReader()
	const decoder = new TextDecoder()
	let buffer = ''
	try {
		for (;;) {
			const { value, done } = await reader.read()
			if (done) break
			buffer += decoder.decode(value, { stream: true })
			let newline = buffer.indexOf('\n')
			while (newline !== -1) {
				take(buffer.slice(0, newline))
				buffer = buffer.slice(newline + 1)
				newline = buffer.indexOf('\n')
			}
		}
		take(buffer + decoder.decode())
	} catch {
		// The connection dropped, or the request was aborted: what arrived still counts.
	}
	return outcome
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const buildsUrl = (siteId: string) => `/api/sites/${encodeURIComponent(siteId)}/ai/builds`
const buildUrl = (siteId: string, buildId: string) =>
	`${buildsUrl(siteId)}/${encodeURIComponent(buildId)}`

async function stream<T>(
	url: string,
	body: unknown,
	onEvent: (event: StreamEvent<T>) => void,
	signal: AbortSignal,
): Promise<'done' | 'error' | 'ended'> {
	let response: Response
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { ...JSON_HEADERS, Accept: 'application/x-ndjson' },
			body: JSON.stringify(body),
			cache: 'no-store',
			signal,
		})
	} catch {
		onEvent({ t: 'error', error: signal.aborted ? STOPPED : OFFLINE })
		return 'error'
	}
	return readNdjson(response, onEvent)
}

async function json<T>(url: string, init: RequestInit = {}): Promise<T> {
	let response: Response
	try {
		response = await fetch(url, { cache: 'no-store', ...init })
	} catch {
		throw new AiRequestError(init.signal?.aborted ? STOPPED : OFFLINE)
	}
	if (!response.ok) throw new AiRequestError((await errorOf(response)).error)
	return (await response.json()) as T
}

/** Whether AI building is on, today's units, the library size and this person's recent builds. */
export function fetchCapability(siteId: string, signal?: AbortSignal): Promise<CapabilityResponse> {
	return json<CapabilityResponse>(buildsUrl(siteId), { signal })
}

/** Creates a build and plans it; the stream ends with the BuildView. */
export function createBuild(
	siteId: string,
	body: CreateBuildRequest,
	onEvent: (e: StreamEvent<BuildView>) => void,
	signal: AbortSignal,
): Promise<'done' | 'error' | 'ended'> {
	return stream(buildsUrl(siteId), body, onEvent, signal)
}

/** Outlines the pages the plan left empty. */
export function outlineBuild(
	siteId: string,
	buildId: string,
	onEvent: (e: StreamEvent<BuildView>) => void,
	signal: AbortSignal,
): Promise<'done' | 'error' | 'ended'> {
	return stream(`${buildUrl(siteId, buildId)}/outline`, {}, onEvent, signal)
}

/** Writes one page. */
export function writeBuildPage(
	siteId: string,
	buildId: string,
	key: string,
	onEvent: (e: StreamEvent<PageView>) => void,
	signal: AbortSignal,
): Promise<'done' | 'error' | 'ended'> {
	return stream(`${buildUrl(siteId, buildId)}/pages/${encodeURIComponent(key)}`, {}, onEvent, signal)
}

export async function getBuild(siteId: string, buildId: string, signal?: AbortSignal): Promise<BuildView> {
	return (await json<{ build: BuildView }>(buildUrl(siteId, buildId), { signal })).build
}

/** Stops a build. Sent with keepalive, so it still reaches the server as the tab closes. */
export async function cancelBuild(siteId: string, buildId: string): Promise<BuildView> {
	const body = await json<{ build: BuildView }>(`${buildUrl(siteId, buildId)}/cancel`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: '{}',
		keepalive: true,
	})
	return body.build
}

/** The landing payload for a finished build (and the profile after filling empty fields). */
export function landBuild(siteId: string, buildId: string, body: LandRequest): Promise<LandResponse> {
	return json<LandResponse>(`${buildUrl(siteId, buildId)}/land`, {
		method: 'POST',
		headers: JSON_HEADERS,
		body: JSON.stringify(body),
	})
}
