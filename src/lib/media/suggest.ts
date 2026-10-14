import 'server-only'
import type { Db } from 'mongodb'
import { NAMED_COLORS } from './colors'
import { buildFolderIndex, folderKey, type FolderIndex } from './folder-index'
import { allowedEdits, editDistance } from './query/fuzzy'
import { IS_FLAGS, QUERY_FIELDS } from './query/types'
import { foldersOf } from './collections'
import { listTagStats } from './tags'
import {
	MEDIA_FORMATS,
	MEDIA_KINDS,
	MEDIA_ORIENTATIONS,
	MEDIA_SORTS,
	type MediaSuggestion,
	type MediaTagStat,
} from './types'
import type { SearchContext } from './search'

/**
 * What the search box offers while you type. (The box also shows a STATIC list of
 * operators when it is focused and empty; that needs no server and lives in the UI.)
 */

const MAX_SUGGESTIONS = 10
const MAX_BARE_TAGS = 6
const MAX_BARE_FOLDERS = 3

const OPERATOR_HINTS: Record<(typeof QUERY_FIELDS)[number], string> = {
	tag: 'Has this tag',
	name: 'Match in the name',
	folder: 'In this folder and below',
	type: 'File type',
	color: 'Dominant colour',
	orientation: 'Landscape, portrait...',
	kind: 'Photo, logo, icon...',
	is: 'Untagged, unreviewed, dark...',
	width: 'Width in pixels',
	height: 'Height in pixels',
	size: 'File size',
	added: 'When it was added',
	caption: 'Match in the caption',
	text: 'Match text in the image',
	sort: 'Order the results',
}

const ADDED_VALUES = ['today', 'yesterday', '7d', '30d', 'month', 'year']

/** Starting points for the numeric operators, since they have no fixed values. */
const NUMERIC_VALUES: Record<string, string[]> = {
	width: ['>1200', '>=800', '<600', '800..1600'],
	height: ['>1200', '>=800', '<600', '800..1600'],
	size: ['>2mb', '<500kb', '500kb..2mb'],
}

/** The enumerated values an operator takes. Fields with free text have none. */
function valuesOf(field: string): { value: string; swatch?: string }[] | null {
	switch (field) {
		case 'type':
			return [...MEDIA_FORMATS].map((value) => ({ value }))
		case 'color':
			return NAMED_COLORS.map((c) => ({ value: c.name, swatch: c.hex }))
		case 'orientation':
			return [...MEDIA_ORIENTATIONS].map((value) => ({ value }))
		case 'kind':
			return [...MEDIA_KINDS].map((value) => ({ value }))
		case 'is':
			return [...IS_FLAGS].map((value) => ({ value }))
		case 'added':
			return ADDED_VALUES.map((value) => ({ value }))
		case 'sort':
			return [...MEDIA_SORTS].map((value) => ({ value }))
		case 'width':
		case 'height':
		case 'size':
			return NUMERIC_VALUES[field].map((value) => ({ value }))
		default:
			return null
	}
}

/**
 * The last whitespace-delimited token, outside quotes. Whitespace inside an open
 * quote belongs to the token, so `name:"grand op` is one token.
 */
function lastToken(input: string): string {
	let inQuote = false
	let start = 0
	for (let i = 0; i < input.length; i++) {
		const ch = input[i]
		if (ch === '"') inQuote = !inQuote
		else if (!inQuote && /\s/.test(ch)) start = i + 1
	}
	return input.slice(start)
}

type Request =
	| { kind: 'none' }
	| { kind: 'tag'; prefix: string; word: string }
	| { kind: 'folder'; prefix: string; word: string }
	| { kind: 'value'; prefix: string; field: string; done: string; word: string }
	| { kind: 'bare'; prefix: string; word: string }

/** What the last token is asking for. `prefix` is any `-` or `(` before the clause, kept in the insert. */
function classify(input: string): Request {
	const token = lastToken(input)
	if (!token) return { kind: 'none' }

	const lead = /^[-(]*/.exec(token)?.[0] ?? ''
	const body = token.slice(lead.length)
	if (!body) return { kind: 'none' }

	if (body.startsWith('#')) return { kind: 'tag', prefix: lead, word: body.slice(1).toLowerCase() }

	const colon = body.indexOf(':')
	if (colon === -1) return { kind: 'bare', prefix: lead, word: body.replace(/^"/, '').toLowerCase() }

	const field = body.slice(0, colon).toLowerCase()
	const raw = body.slice(colon + 1).replace(/"/g, '')
	if (field === 'tag') {
		const comma = raw.lastIndexOf(',')
		return {
			kind: 'tag',
			prefix: lead + (comma === -1 ? '' : `tag:${raw.slice(0, comma + 1)}`),
			word: raw.slice(comma + 1).replace(/\*+$/, '').toLowerCase(),
		}
	}
	if (field === 'folder') return { kind: 'folder', prefix: lead, word: raw.toLowerCase() }
	if ((QUERY_FIELDS as readonly string[]).includes(field)) {
		const comma = raw.lastIndexOf(',')
		return {
			kind: 'value',
			prefix: lead,
			field,
			done: comma === -1 ? '' : raw.slice(0, comma + 1),
			word: raw.slice(comma + 1).toLowerCase(),
		}
	}
	return { kind: 'none' }
}

const byCountThenSlug = (a: MediaTagStat, b: MediaTagStat) =>
	b.count - a.count || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)

/** Exact, then prefix, then typo-tolerant, each by descending count. */
function matchTags(word: string, tags: MediaTagStat[]): MediaTagStat[] {
	if (!word) return [...tags].sort(byCountThenSlug)

	const exact: MediaTagStat[] = []
	const prefix: MediaTagStat[] = []
	const fuzzy: MediaTagStat[] = []
	const allowed = allowedEdits(word.length)
	for (const tag of tags) {
		const label = tag.label.toLowerCase()
		if (tag.slug === word || label === word) exact.push(tag)
		else if (tag.slug.startsWith(word) || label.startsWith(word)) prefix.push(tag)
		else if (allowed > 0 && editDistance(word, tag.slug, allowed) <= allowed) fuzzy.push(tag)
	}
	return [...exact.sort(byCountThenSlug), ...prefix.sort(byCountThenSlug), ...fuzzy.sort(byCountThenSlug)]
}

/** A path with anything the parser would split on is quoted. */
const folderClause = (path: string) =>
	/[\s"():,]/.test(path) ? `folder:"${path}"` : `folder:${path}`

function matchFolders(word: string, folders: FolderIndex) {
	const key = folderKey(word)
	if (!key) return []
	const byName: string[] = []
	const byPath: string[] = []
	for (const node of folders.ordered()) {
		if (folderKey(node.name).startsWith(key)) byName.push(node.path)
		else if (folderKey(node.path).includes(key)) byPath.push(node.path)
	}
	return [...byName, ...byPath]
}

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
	const request = classify(typeof input === 'string' ? input : '')
	if (request.kind === 'none') return []

	const tagSuggestion = (tag: MediaTagStat, prefix: string): MediaSuggestion => ({
		kind: 'tag',
		label: tag.label,
		insert: `${prefix}${prefix.includes('tag:') ? '' : 'tag:'}${tag.slug}`,
		count: tag.count,
	})

	if (request.kind === 'tag')
		return matchTags(request.word, data.tags)
			.slice(0, MAX_SUGGESTIONS)
			.map((tag) => tagSuggestion(tag, request.prefix))

	if (request.kind === 'folder') {
		const out: MediaSuggestion[] = []
		if (!request.word || 'none'.startsWith(request.word))
			out.push({
				kind: 'folder',
				label: 'Unfiled',
				insert: `${request.prefix}folder:none`,
				hint: 'Not in any folder',
			})
		for (const path of matchFolders(request.word, data.folders))
			out.push({
				kind: 'folder',
				label: path,
				insert: `${request.prefix}${folderClause(path)}`,
			})
		return out.slice(0, MAX_SUGGESTIONS)
	}

	if (request.kind === 'value') {
		const values = valuesOf(request.field)
		if (!values) return []
		return values
			.filter((v) => v.value.toLowerCase().startsWith(request.word))
			.slice(0, MAX_SUGGESTIONS)
			.map((v) => ({
				kind: 'value' as const,
				label: v.value,
				insert: `${request.prefix}${request.field}:${request.done}${v.value}`,
				...(v.swatch ? { swatch: v.swatch } : {}),
			}))
	}

	// A bare word: operators first, then tags, then folders, then "search for".
	const out: MediaSuggestion[] = []
	for (const field of QUERY_FIELDS)
		if (field.startsWith(request.word))
			out.push({
				kind: 'operator',
				label: `${field}:`,
				insert: `${request.prefix}${field}:`,
				hint: OPERATOR_HINTS[field],
			})
	for (const tag of matchTags(request.word, data.tags).slice(0, MAX_BARE_TAGS))
		out.push(tagSuggestion(tag, request.prefix))
	for (const path of matchFolders(request.word, data.folders).slice(0, MAX_BARE_FOLDERS))
		out.push({
			kind: 'folder',
			label: path,
			insert: `${request.prefix}${folderClause(path)}`,
		})

	const room = out.slice(0, MAX_SUGGESTIONS - 1)
	// Never the first row: with nothing else to offer there is nothing to suggest.
	if (room.length === 0) return []
	room.push({
		kind: 'search',
		label: `Search for "${request.word}"`,
		insert: `${request.prefix}${request.word}`,
	})
	return room
}

/** Loads the tag statistics and folder tree, then defers to `suggestFromData`. */
export async function suggest(
	db: Db,
	ctx: SearchContext,
	input: string,
): Promise<MediaSuggestion[]> {
	const request = classify(typeof input === 'string' ? input : '')
	// Operator values and bare operator hints need no database.
	if (request.kind === 'none') return []

	const needsTags = request.kind === 'tag' || request.kind === 'bare'
	const needsFolders = request.kind === 'folder' || request.kind === 'bare'

	const [tags, folderDocs] = await Promise.all([
		needsTags ? listTagStats(db, ctx.workspaceId, { limit: 2000 }) : Promise.resolve([]),
		needsFolders
			? foldersOf(db)
					.find({ workspaceId: ctx.workspaceId }, { projection: { _id: 1, parentId: 1, name: 1 } })
					.toArray()
			: Promise.resolve([]),
	])
	return suggestFromData(input, { tags, folders: buildFolderIndex(folderDocs) })
}
