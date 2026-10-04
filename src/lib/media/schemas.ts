/**
 * Request validation for the media API, plus the one place a search is read from
 * and written to a URL. Client safe: the browser uses the URL helpers and the
 * server uses everything.
 */
import { z } from 'zod'
import {
	MEDIA_LIMITS,
	MEDIA_SORTS,
	type MediaSearchParams,
	type MediaSort,
} from './types'

export const OBJECT_ID = /^[a-f0-9]{24}$/i

export const objectIdSchema = z.string().regex(OBJECT_ID, 'Invalid id.')

const tagLabel = z.string().trim().min(1).max(MEDIA_LIMITS.tagLabelMax)
const tagSlug = z.string().trim().min(1).max(60)
const sortSchema = z.enum(MEDIA_SORTS)

/** `folder` is a folder id, the word `unfiled`, or absent. */
export const folderParamSchema = z
	.string()
	.refine((v) => v === 'unfiled' || OBJECT_ID.test(v), 'Invalid folder.')

export const registerBodySchema = z.object({
	url: z.string().url().max(2000),
	pathname: z.string().min(1).max(500),
	filename: z.string().trim().min(1).max(255),
	folderId: objectIdSchema.nullable().optional(),
})
export type RegisterBody = z.infer<typeof registerBodySchema>

/**
 * What the browser hands the upload token endpoint alongside the file. The token
 * request cannot carry the `x-media-workspace` header the other routes use, so the
 * workspace the page was rendered for travels here, and the route demands
 * membership of exactly that one (never the cookie's guess).
 */
export const uploadPayloadSchema = z.object({
	workspaceId: objectIdSchema,
	folderId: objectIdSchema.nullable().optional(),
})

export const assetPatchSchema = z.object({
	name: z.string().trim().min(1).max(MEDIA_LIMITS.nameMax).optional(),
	caption: z.string().trim().max(MEDIA_LIMITS.captionMax).optional(),
	altText: z.string().trim().max(MEDIA_LIMITS.altMax).optional(),
	notes: z.string().trim().max(MEDIA_LIMITS.notesMax).optional(),
	folderId: objectIdSchema.nullable().optional(),
	addTags: z.array(tagLabel).max(20).optional(),
	removeTags: z.array(tagSlug).max(MEDIA_LIMITS.maxTagsPerAsset).optional(),
})
export type AssetPatch = z.infer<typeof assetPatchSchema>

/**
 * Either explicit ids, or "everything this search matches". A search target
 * carries `expect`, the total the person was looking at: the server resolves the
 * search once and refuses (409) if the count has moved or exceeds the cap, so a
 * bulk delete can never hit a different set than the one that was confirmed.
 */
const bulkTargetSchema = z.union([
	z.object({
		ids: z.array(objectIdSchema).min(1).max(MEDIA_LIMITS.bulkIdsCap),
	}),
	z.object({
		search: z.object({
			q: z.string().max(MEDIA_LIMITS.queryMax).default(''),
			folder: folderParamSchema.optional(),
			deep: z.boolean().optional(),
			expect: z.number().int().min(1).max(MEDIA_LIMITS.bulkSearchCap),
		}),
	}),
])
export type BulkTarget = z.infer<typeof bulkTargetSchema>

export const bulkBodySchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('move'),
		target: bulkTargetSchema,
		folderId: objectIdSchema.nullable(),
	}),
	z.object({
		action: z.literal('addTags'),
		target: bulkTargetSchema,
		tags: z.array(tagLabel).min(1).max(20),
	}),
	z.object({
		action: z.literal('removeTags'),
		target: bulkTargetSchema,
		tags: z.array(tagSlug).min(1).max(MEDIA_LIMITS.maxTagsPerAsset),
	}),
	z.object({ action: z.literal('delete'), target: bulkTargetSchema }),
	z.object({
		action: z.literal('retag'),
		target: bulkTargetSchema,
	}),
	z.object({ action: z.literal('acceptAutoTags'), target: bulkTargetSchema }),
])
export type BulkBody = z.infer<typeof bulkBodySchema>

export const tagPatchSchema = z
	.object({
		/** Rename: the new display label. */
		label: tagLabel.optional(),
		/** Merge: the slug of the tag this one folds into. */
		mergeInto: tagSlug.optional(),
	})
	.refine((v) => (v.label === undefined) !== (v.mergeInto === undefined), {
		message: 'Send either a new label or a tag to merge into.',
	})

const folderName = z
	.string()
	.trim()
	.min(1)
	.max(MEDIA_LIMITS.folderNameMax)
	// eslint-disable-next-line no-control-regex
	.regex(/^[^/\\\u0000-\u001f]+$/, 'A folder name cannot contain slashes.')

export const folderCreateSchema = z.object({
	name: folderName,
	parentId: objectIdSchema.nullable(),
})

export const folderPatchSchema = z.object({
	name: folderName.optional(),
	parentId: objectIdSchema.nullable().optional(),
})

export const savedSearchSchema = z.object({
	name: z.string().trim().min(1).max(MEDIA_LIMITS.savedSearchNameMax),
	query: z.string().max(MEDIA_LIMITS.queryMax),
	folder: folderParamSchema.nullable().optional(),
	sort: sortSchema.nullable().optional(),
})

export const processBodySchema = z.object({
	limit: z.number().int().min(1).max(MEDIA_LIMITS.aiBatchMax).optional(),
	ids: z.array(objectIdSchema).max(MEDIA_LIMITS.aiBatchMax).optional(),
	/** Put images skipped for want of an API key back in the queue first. */
	requeue: z.boolean().optional(),
})

/* -------------------------------------------------------------------------- */
/* Search params <-> URL                                                      */
/* -------------------------------------------------------------------------- */

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
	const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

const flag = (value: string | null | undefined) =>
	value === '1' || value === 'true'
		? true
		: value === '0' || value === 'false'
			? false
			: undefined

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

const read = (source: ParamSource, key: string): string | undefined => {
	if (source instanceof URLSearchParams) return source.get(key) ?? undefined
	const value = source[key]
	return Array.isArray(value) ? value[0] : value
}

/**
 * Reads a search from a query string or a Next `searchParams` object. Nothing
 * here throws: bad input degrades to the default, because this runs on every
 * page load and a hand-edited URL must not 500 the page.
 */
export function readSearchParams(source: ParamSource): MediaSearchParams {
	const folder = read(source, 'folder')
	const sort = read(source, 'sort')
	return {
		q: (read(source, 'q') ?? '').slice(0, MEDIA_LIMITS.queryMax),
		folder: folder && folderParamSchema.safeParse(folder).success ? folder : undefined,
		deep: flag(read(source, 'deep')),
		sort: (MEDIA_SORTS as readonly string[]).includes(sort ?? '')
			? (sort as MediaSort)
			: undefined,
		offset: clampInt(read(source, 'offset'), 0, 1_000_000, 0),
		limit: clampInt(
			read(source, 'limit'),
			1,
			MEDIA_LIMITS.maxPageSize,
			MEDIA_LIMITS.pageSize,
		),
		facets: flag(read(source, 'facets')),
	}
}

/** The inverse, omitting defaults so a plain library view keeps a clean URL. */
export function writeSearchParams(
	params: Partial<MediaSearchParams>,
	extra: Record<string, string | undefined> = {},
): URLSearchParams {
	const out = new URLSearchParams()
	if (params.q?.trim()) out.set('q', params.q)
	if (params.folder) out.set('folder', params.folder)
	if (params.deep !== undefined) out.set('deep', params.deep ? '1' : '0')
	if (params.sort) out.set('sort', params.sort)
	if (params.offset) out.set('offset', String(params.offset))
	if (params.limit && params.limit !== MEDIA_LIMITS.pageSize)
		out.set('limit', String(params.limit))
	if (params.facets) out.set('facets', '1')
	for (const [key, value] of Object.entries(extra))
		if (value !== undefined) out.set(key, value)
	return out
}
