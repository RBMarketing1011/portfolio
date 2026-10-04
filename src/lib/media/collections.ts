import 'server-only'
import { ObjectId, type Collection, type Db } from 'mongodb'
import {
	MEDIA_AI_USAGE,
	MEDIA_ASSETS,
	MEDIA_FOLDERS,
	MEDIA_SAVED_SEARCHES,
	MEDIA_TAG_RULES,
	type MediaAssetDoc,
	type MediaFolderDoc,
	type MediaSavedSearchDoc,
	type MediaTagRuleDoc,
} from './types'

export const assetsOf = (db: Db): Collection<MediaAssetDoc> =>
	db.collection<MediaAssetDoc>(MEDIA_ASSETS)

export const foldersOf = (db: Db): Collection<MediaFolderDoc> =>
	db.collection<MediaFolderDoc>(MEDIA_FOLDERS)

export const tagRulesOf = (db: Db): Collection<MediaTagRuleDoc> =>
	db.collection<MediaTagRuleDoc>(MEDIA_TAG_RULES)

export const savedSearchesOf = (db: Db): Collection<MediaSavedSearchDoc> =>
	db.collection<MediaSavedSearchDoc>(MEDIA_SAVED_SEARCHES)

export type AiUsageDoc = {
	/** `<workspaceId>:<YYYY-MM-DD>` or `global:<YYYY-MM-DD>`, in UTC. */
	_id: string
	count: number
	/** Tokens spent, from the API's own `usage`. Output includes thinking. */
	inputTokens?: number
	outputTokens?: number
	expiresAt: Date
}

export const aiUsageOf = (db: Db): Collection<AiUsageDoc> =>
	db.collection<AiUsageDoc>(MEDIA_AI_USAGE)

/**
 * Strict: exactly 24 hex characters. `ObjectId.isValid` also accepts any 12-byte
 * string, so a stray 12-character value from a query string would become an id.
 */
export function parseObjectId(value: unknown): ObjectId | null {
	return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)
		? new ObjectId(value)
		: null
}

/**
 * The guard every asset query starts from: this workspace's assets. A function
 * rather than an inline object so there is one place to change if assets ever
 * gain a soft-delete state.
 */
export const workspaceAssets = (workspaceId: ObjectId) => ({ workspaceId })
