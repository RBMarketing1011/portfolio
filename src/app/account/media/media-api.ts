/**
 * Typed fetch wrappers for every /api/account/media endpoint the library page uses.
 *
 * One client per page, made for the account the page was rendered for: EVERY request
 * names it in `x-media-workspace`. The server demands the account instead of trusting
 * the `rb.workspace` cookie, which every tab shares, so a library open in one tab can
 * never land its "delete all matching" on the account another tab switched to.
 *
 * Each call throws a `MediaApiError` carrying the server's `{ error }` sentence (or a
 * generic one) on a non-2xx answer, takes an optional AbortSignal, speaks JSON only and
 * is never cached. An aborted call rejects with the browser's own AbortError, untouched,
 * so a caller can tell "superseded" from "failed".
 *
 * Pure of React and of `next/*`: the proof drives it with a fake fetch.
 */
import {
	writeSearchParams,
	type AssetPatch,
	type BulkBody,
} from '@/lib/media/schemas'
import type {
	MediaAssetDTO,
	MediaBulkResponse,
	MediaFolderDTO,
	MediaFoldersResponse,
	MediaProcessResponse,
	MediaSavedSearchDTO,
	MediaSearchParams,
	MediaSearchResponse,
	MediaSort,
	MediaSuggestion,
	MediaTagStat,
	MediaTaggingStatusDTO,
} from '@/lib/media/types'

/** Not imported from access.ts: that module is server-only. */
export const MEDIA_WORKSPACE_HEADER = 'x-media-workspace'
export const MEDIA_API_BASE = '/api/account/media'

/** A failed call. `status` is 0 when the network never answered. */
export class MediaApiError extends Error {
	readonly status: number
	constructor(message: string, status: number) {
		super(message)
		this.name = 'MediaApiError'
		this.status = status
	}
}

export const isAbortError = (error: unknown): boolean =>
	typeof error === 'object' &&
	error !== null &&
	(error as { name?: unknown }).name === 'AbortError'

const NETWORK_MESSAGE = 'Could not reach the server. Check your connection and try again.'
const UNREADABLE_MESSAGE = 'The server sent an answer that could not be read. Try again.'
const MESSAGE_MAX = 300

/** What to say when the server's own sentence is missing: by status, in words. */
export function genericMessage(status: number): string {
	if (status === 400) return 'That request was not valid. Reload the page and try again.'
	if (status === 401) return 'Your session ended. Sign in again to continue.'
	if (status === 403) return 'Your role does not allow that.'
	if (status === 404) return 'That could not be found. It may have been deleted.'
	if (status === 409) return 'That conflicted with another change. Reload and try again.'
	if (status === 413) return 'That is too large.'
	if (status === 429) return 'Too many requests. Wait a moment and try again.'
	if (status >= 500) return 'Something went wrong on our side. Try again in a moment.'
	return 'Something went wrong. Try again.'
}

async function errorMessage(response: Response): Promise<string> {
	try {
		const body: unknown = await response.json()
		const text =
			typeof body === 'object' && body !== null
				? (body as { error?: unknown }).error
				: undefined
		if (typeof text === 'string' && text.trim())
			return text.trim().slice(0, MESSAGE_MAX)
	} catch {
		// An HTML error page or an empty body: fall through to the generic sentence.
	}
	return genericMessage(response.status)
}

export type FetchLike = (
	input: string,
	init: RequestInit,
) => Promise<Response>

type CallInit = {
	query?: URLSearchParams
	body?: unknown
	signal?: AbortSignal
}

export type MediaApiOptions = {
	/** The account the page was rendered for. Sent on every call. */
	workspaceId: string
	/** For tests. Wrapped, so a bare `fetch` is never called as a method of another object. */
	fetch?: FetchLike
}

export type FolderPatch = { name?: string; parentId?: string | null }
export type SavedSearchInput = {
	name: string
	query: string
	folder: string | null
	sort: MediaSort | null
}
export type ProcessOptions = { limit?: number; ids?: string[]; requeue?: boolean }

export function createMediaApi({ workspaceId, fetch: custom }: MediaApiOptions) {
	const send: FetchLike =
		custom ?? ((input, init) => globalThis.fetch(input, init))

	async function call<T>(
		method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
		path: string,
		{ query, body, signal }: CallInit = {},
	): Promise<T> {
		const search = query?.toString()
		const url = `${MEDIA_API_BASE}${path}${search ? `?${search}` : ''}`
		const headers: Record<string, string> = {
			[MEDIA_WORKSPACE_HEADER]: workspaceId,
			Accept: 'application/json',
		}
		let payload: string | undefined
		if (body !== undefined) {
			headers['Content-Type'] = 'application/json'
			payload = JSON.stringify(body)
		}

		let response: Response
		try {
			response = await send(url, {
				method,
				headers,
				body: payload,
				cache: 'no-store',
				credentials: 'same-origin',
				signal,
			})
		} catch (error) {
			if (isAbortError(error)) throw error
			throw new MediaApiError(NETWORK_MESSAGE, 0)
		}
		if (!response.ok)
			throw new MediaApiError(await errorMessage(response), response.status)
		try {
			return (await response.json()) as T
		} catch (error) {
			// The body of an abort mid-read is still an abort, not a bad answer.
			if (isAbortError(error)) throw error
			throw new MediaApiError(UNREADABLE_MESSAGE, response.status)
		}
	}

	/** One property of an answer, or an error: a 200 that lacks it is not a success. */
	const take = <T>(data: unknown, key: string, check: (value: unknown) => boolean): T => {
		const value =
			typeof data === 'object' && data !== null
				? (data as Record<string, unknown>)[key]
				: undefined
		if (!check(value)) throw new MediaApiError(UNREADABLE_MESSAGE, 200)
		return value as T
	}
	const isObject = (value: unknown) => typeof value === 'object' && value !== null
	const isArray = (value: unknown) => Array.isArray(value)

	const id = (value: string) => encodeURIComponent(value)

	const tagResult = (data: unknown) => ({
		affected: take<number>(data, 'affected', (value) => typeof value === 'number'),
		slug: take<string>(data, 'slug', (value) => typeof value === 'string' && value !== ''),
		merged: take<boolean>(data, 'merged', (value) => typeof value === 'boolean'),
	})

	return {
		workspaceId,

		/* ---- search ------------------------------------------------------ */

		async search(
			params: Partial<MediaSearchParams>,
			signal?: AbortSignal,
		): Promise<MediaSearchResponse> {
			const data = await call<MediaSearchResponse>('GET', '', {
				query: writeSearchParams(params),
				signal,
			})
			if (!isObject(data) || !isArray((data as { assets?: unknown }).assets))
				throw new MediaApiError(UNREADABLE_MESSAGE, 200)
			return data
		},

		async suggest(input: string, signal?: AbortSignal): Promise<MediaSuggestion[]> {
			const data = await call<{ suggestions?: unknown }>('GET', '/suggest', {
				query: new URLSearchParams({ q: input }),
				signal,
			})
			return take<MediaSuggestion[]>(data, 'suggestions', isArray)
		},

		/* ---- one asset ---------------------------------------------------- */

		async getAsset(assetId: string, signal?: AbortSignal): Promise<MediaAssetDTO> {
			const data = await call('GET', `/${id(assetId)}`, { signal })
			return take<MediaAssetDTO>(data, 'asset', isObject)
		},

		async patchAsset(
			assetId: string,
			patch: AssetPatch,
			signal?: AbortSignal,
		): Promise<MediaAssetDTO> {
			const data = await call('PATCH', `/${id(assetId)}`, { body: patch, signal })
			return take<MediaAssetDTO>(data, 'asset', isObject)
		},

		async deleteAsset(assetId: string, signal?: AbortSignal): Promise<void> {
			await call('DELETE', `/${id(assetId)}`, { signal })
		},

		async bulk(body: BulkBody, signal?: AbortSignal): Promise<MediaBulkResponse> {
			const data = await call('POST', '/bulk', { body, signal })
			const affected = take<number>(
				data,
				'affected',
				(value) => typeof value === 'number' && Number.isFinite(value),
			)
			return { affected }
		},

		/* ---- tags --------------------------------------------------------- */

		async listTags(
			options: { q?: string; limit?: number } = {},
			signal?: AbortSignal,
		): Promise<MediaTagStat[]> {
			const query = new URLSearchParams()
			if (options.q) query.set('q', options.q)
			if (options.limit !== undefined) query.set('limit', String(options.limit))
			const data = await call('GET', '/tags', { query, signal })
			return take<MediaTagStat[]>(data, 'tags', isArray)
		},

		async renameTag(
			slug: string,
			label: string,
			signal?: AbortSignal,
		): Promise<{ affected: number; slug: string; merged: boolean }> {
			const data = await call('PATCH', `/tags/${id(slug)}`, {
				body: { label },
				signal,
			})
			return tagResult(data)
		},

		async mergeTag(
			slug: string,
			into: string,
			signal?: AbortSignal,
		): Promise<{ affected: number; slug: string; merged: boolean }> {
			const data = await call('PATCH', `/tags/${id(slug)}`, {
				body: { mergeInto: into },
				signal,
			})
			return tagResult(data)
		},

		async deleteTag(slug: string, signal?: AbortSignal): Promise<{ affected: number }> {
			const data = await call('DELETE', `/tags/${id(slug)}`, { signal })
			const affected = take<number>(
				data,
				'affected',
				(value) => typeof value === 'number',
			)
			return { affected }
		},

		/* ---- folders ------------------------------------------------------ */

		async listFolders(signal?: AbortSignal): Promise<MediaFoldersResponse> {
			const data = await call<MediaFoldersResponse>('GET', '/folders', { signal })
			if (!isObject(data) || !isArray((data as { folders?: unknown }).folders))
				throw new MediaApiError(UNREADABLE_MESSAGE, 200)
			return data
		},

		async createFolder(
			input: { name: string; parentId: string | null },
			signal?: AbortSignal,
		): Promise<MediaFolderDTO> {
			const data = await call('POST', '/folders', { body: input, signal })
			return take<MediaFolderDTO>(data, 'folder', isObject)
		},

		async patchFolder(
			folderId: string,
			patch: FolderPatch,
			signal?: AbortSignal,
		): Promise<MediaFolderDTO> {
			const data = await call('PATCH', `/folders/${id(folderId)}`, {
				body: patch,
				signal,
			})
			return take<MediaFolderDTO>(data, 'folder', isObject)
		},

		async deleteFolder(
			folderId: string,
			signal?: AbortSignal,
		): Promise<{ assets: number; folders: number }> {
			const data = await call('DELETE', `/folders/${id(folderId)}`, { signal })
			return take<{ assets: number; folders: number }>(data, 'moved', isObject)
		},

		/* ---- saved searches ----------------------------------------------- */

		async listSaved(signal?: AbortSignal): Promise<MediaSavedSearchDTO[]> {
			const data = await call('GET', '/saved', { signal })
			return take<MediaSavedSearchDTO[]>(data, 'saved', isArray)
		},

		async createSaved(
			input: SavedSearchInput,
			signal?: AbortSignal,
		): Promise<MediaSavedSearchDTO> {
			const data = await call('POST', '/saved', { body: input, signal })
			return take<MediaSavedSearchDTO>(data, 'saved', isObject)
		},

		async deleteSaved(savedId: string, signal?: AbortSignal): Promise<void> {
			await call('DELETE', `/saved/${id(savedId)}`, { signal })
		},

		/* ---- the tagging queue -------------------------------------------- */

		/** Tags up to a batch of waiting images and answers with what happened. */
		async process(
			options: ProcessOptions = {},
			signal?: AbortSignal,
		): Promise<MediaProcessResponse> {
			const data = await call<MediaProcessResponse>('POST', '/process', {
				body: options,
				signal,
			})
			if (!isObject(data) || !isArray((data as { processed?: unknown }).processed))
				throw new MediaApiError(UNREADABLE_MESSAGE, 200)
			return data
		},

		async processStatus(signal?: AbortSignal): Promise<MediaTaggingStatusDTO> {
			const data = await call<MediaTaggingStatusDTO>('GET', '/process', { signal })
			if (!isObject(data)) throw new MediaApiError(UNREADABLE_MESSAGE, 200)
			return data
		},
	}
}

export type MediaApi = ReturnType<typeof createMediaApi>
