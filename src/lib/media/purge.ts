import 'server-only'
import type { Db, ObjectId } from 'mongodb'
import {
	aiUsageOf,
	assetsOf,
	foldersOf,
	savedSearchesOf,
	tagRulesOf,
} from '@/lib/media/collections'
import { deleteAllUnderPrefix } from '@/lib/media/storage'
import { invalidateVocabulary } from '@/lib/media/vocabulary'

/**
 * Everything the library holds for an account, removed. Account deletion calls
 * this, or a departing customer's images and metadata would outlive their account:
 * library uploads live under `workspaces/<id>/media/`, which no site's `media`
 * array points at, so the existing account-deletion route never finds them.
 */

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&')

// Built with RegExp() so the separators are escapes in the source, not literal characters.
const LINE_BREAKERS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]+', 'g')

/** One bounded line, so a driver or store message cannot forge a second log line. */
function describe(error: unknown): string {
	let text: string
	try {
		text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
	} catch {
		text = 'unprintable error'
	}
	return text.replace(LINE_BREAKERS, ' ').slice(0, 200)
}

/**
 * An undefined or malformed id must stop here: the driver turns `{ workspaceId:
 * undefined }` into `{ workspaceId: null }`, which matches every document that has
 * no workspace, and a wrong type would silently match nothing.
 */
function hexOf(workspaceId: unknown): string {
	const candidate = workspaceId as { _bsontype?: unknown; toHexString?: () => string } | null
	if (
		candidate &&
		typeof candidate === 'object' &&
		candidate._bsontype === 'ObjectId' &&
		typeof candidate.toHexString === 'function'
	) {
		const hex = candidate.toHexString()
		if (typeof hex === 'string' && /^[a-f0-9]{24}$/.test(hex)) return hex
	}
	throw new Error('purgeWorkspaceMedia needs a workspace ObjectId.')
}

/**
 * In this order, each step idempotent and independent (a failure in one is logged and
 * does not stop the others, because account deletion must not be blockable by a blob
 * outage): delete every blob under the workspace's media prefix, then the workspace's
 * documents in the four media collections, then its usage counters (`mediaAiUsage`
 * has no `workspaceId`; the `_id` starts with `<workspaceId>:`, so an anchored,
 * escaped `$regex` on `_id`). Drops the cached vocabulary. Returns what was removed.
 * Only ever touches this workspace.
 */
export async function purgeWorkspaceMedia(
	db: Db,
	workspaceId: ObjectId,
): Promise<{ blobs: number; assets: number; folders: number }> {
	const hex = hexOf(workspaceId)
	const removed = { blobs: 0, assets: 0, folders: 0 }

	try {
		removed.blobs = await deleteAllUnderPrefix(hex)
	} catch (error) {
		console.warn(`media purge: blob cleanup failed for ${hex}: ${describe(error)}`)
	}

	const steps: Array<[string, () => Promise<number>]> = [
		['assets', async () => (await assetsOf(db).deleteMany({ workspaceId })).deletedCount],
		['folders', async () => (await foldersOf(db).deleteMany({ workspaceId })).deletedCount],
		['tag rules', async () => (await tagRulesOf(db).deleteMany({ workspaceId })).deletedCount],
		[
			'saved searches',
			async () => (await savedSearchesOf(db).deleteMany({ workspaceId })).deletedCount,
		],
		[
			'usage counters',
			async () =>
				(await aiUsageOf(db).deleteMany({ _id: { $regex: `^${escapeRegex(hex)}:` } }))
					.deletedCount,
		],
	]
	for (const [label, run] of steps) {
		try {
			const count = await run()
			if (label === 'assets') removed.assets = count
			if (label === 'folders') removed.folders = count
		} catch (error) {
			console.warn(`media purge: ${label} cleanup failed for ${hex}: ${describe(error)}`)
		}
	}

	try {
		invalidateVocabulary(workspaceId)
	} catch (error) {
		console.warn(`media purge: vocabulary reset failed for ${hex}: ${describe(error)}`)
	}
	return removed
}
