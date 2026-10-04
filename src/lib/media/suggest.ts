import 'server-only'
import type { Db } from 'mongodb'
import type { FolderIndex } from './folder-index'
import type { MediaSuggestion, MediaTagStat } from './types'
import type { SearchContext } from './search'

/**
 * What the search box offers while you type. (The box also shows a STATIC list of
 * operators when it is focused and empty; that needs no server and lives in the UI.)
 *
 * STUB: signatures are the contract; bodies are being written.
 */

/**
 * The pure core, so it can be tested without a database. `input` is the whole box
 * text; only its LAST whitespace-delimited token (outside quotes) is being completed.
 *
 *  - `#fo`, `tag:fo`        -> tags (prefix, then typo-tolerant) with counts; insert is `tag:slug`
 *  - `folder:ac`            -> folder paths whose path or name matches; insert is `folder:Path` (quoted if needed)
 *  - `color:`, `type:`, `orientation:`, `kind:`, `is:`, `added:`, `sort:`, `width:` etc. with a partial value
 *                           -> the matching enumerated values (colours carry a `swatch`); `added:` offers
 *                              today, yesterday, 7d, 30d, month, year; `is:` includes unreviewed, untagged
 *  - a bare word `col`      -> operator hints whose name starts with it (`color:`), THEN tags
 *                              (at most 6), THEN folders (at most 3), then
 *                              `{ kind: 'search', label: 'Search for "col"' }` last
 *  - an empty last token    -> [] (nothing to complete)
 *
 * At most 10 suggestions. Ordering within tags: exact, prefix, then fuzzy, each by
 * descending count. The `search` row is never the first row.
 */
export function suggestFromData(
	input: string,
	data: { tags: MediaTagStat[]; folders: FolderIndex },
): MediaSuggestion[] {
	throw new Error('not implemented: suggestFromData')
}

/** Loads the tag statistics and folder tree, then defers to `suggestFromData`. */
export async function suggest(
	db: Db,
	ctx: SearchContext,
	input: string,
): Promise<MediaSuggestion[]> {
	throw new Error('not implemented: suggest')
}
