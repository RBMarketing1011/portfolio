/**
 * The search language's internal shapes. The parser produces them, the planner
 * consumes them, and the DB layer sits on top. Pure and client safe.
 *
 * The language, by example:
 *
 *   kitchen remodel            every word must match somewhere (implicit AND)
 *   kitchen-remodel  t-shirt   a hyphen or underscore inside a word makes it a phrase of its parts
 *   "before and after"         an exact phrase
 *   kitchen OR bathroom        OR, with ( ) for grouping:  (kitchen OR bath) blue
 *   -people   NOT people       exclusion
 *   tag:kitchen  #kitchen      has exactly this tag      (tag:kit*  prefix, tag:a,b  either)
 *   name:hero  caption:van  text:"grand opening"   match inside one field only
 *   folder:Clients/Acme        that folder and everything beneath it   (folder:none = unfiled)
 *   type:png,jpg  color:blue  orientation:landscape  kind:logo
 *   is:untagged  is:unreviewed  is:dark  is:animated   (see IS_FLAGS)
 *   width:>1200  height:<=600  width:800..1600
 *   size:>2mb  size:500kb..2mb
 *   added:2026-03-01  added:>2026-01-01  added:2026-01-01..2026-03-31
 *   added:today  added:7d  added:month
 *   sort:newest                relevance | newest | oldest | name | name-desc | largest | smallest | dimensions
 */
import type { ObjectId } from 'mongodb'
import type { FolderIndex } from '../folder-index'
import type {
	MediaAssetDoc,
	ParsedQueryDTO,
	QueryChip,
	MediaSort,
} from '../types'

export const QUERY_FIELDS = [
	'tag',
	'name',
	'folder',
	'type',
	'color',
	'orientation',
	'kind',
	'is',
	'width',
	'height',
	'size',
	'added',
	'caption',
	'text',
	'sort',
] as const
export type QueryField = (typeof QUERY_FIELDS)[number]

/**
 * `is:` takes one of these.
 *
 *   untagged / tagged     no tags of any source / at least one
 *   unreviewed / reviewed at least one automatic tag nobody has kept / has tags and
 *                         none are automatic. `unreviewed` is the review queue.
 */
export const IS_FLAGS = [
	'untagged',
	'tagged',
	'unreviewed',
	'reviewed',
	'unfiled',
	'filed',
	'animated',
	'transparent',
	'dark',
	'light',
	'vivid',
	'muted',
	'monochrome',
	'pending',
	'failed',
	'captioned',
	'uncaptioned',
] as const
export type IsFlag = (typeof IS_FLAGS)[number]

/**
 * A resolved numeric comparison. Widths and heights are pixels, sizes are bytes,
 * dates are epoch milliseconds. The parser has already turned `2mb` into bytes and
 * `added:2026-03-01` into that day's inclusive start and end, so nothing
 * downstream handles units or calendars.
 */
export type Comparison =
	| { op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'; value: number }
	/** Inclusive on both ends. */
	| { op: 'range'; from: number; to: number }

export type FieldNode = {
	type: 'field'
	field: Exclude<QueryField, 'sort'>
	/**
	 * Normalised values, any of which may match (`type:png,jpg`).
	 * tag: slugs. type/color/orientation/kind/is: canonical enum values.
	 * folder: path text, or `unfiled`. name/caption/text: lowercase words.
	 * Empty for the numeric fields, which use `cmp`.
	 */
	values: string[]
	cmp?: Comparison
	/** `tag:kit*`: each value is a prefix. */
	prefix?: boolean
	start: number
	end: number
}

export type QueryNode =
	| {
			type: 'term'
			/** A single normalised word. */
			text: string
			/** Written with a trailing `*`. */
			prefix: boolean
			start: number
			end: number
	  }
	| {
			type: 'phrase'
			/** Normalised, words separated by single spaces. */
			text: string
			/**
			 * True when the phrase came from a hyphenated or underscored word
			 * (`kitchen-remodel`) rather than quotes. The planner also accepts the
			 * joined run (`kitchenremodel`) as an alternative.
			 */
			implicit?: boolean
			start: number
			end: number
	  }
	| FieldNode
	| { type: 'and'; nodes: QueryNode[] }
	| { type: 'or'; nodes: QueryNode[] }
	| { type: 'not'; node: QueryNode; start: number; end: number }

export type ParsedQuery = {
	raw: string
	/** Null when the query holds no clause at all. */
	ast: QueryNode | null
	chips: QueryChip[]
	warnings: string[]
	/** From a `sort:` operator. */
	sort: MediaSort | null
	/**
	 * Free text, a phrase, or a field-scoped text match is present somewhere. Such a
	 * query is evaluated in memory and ranked; one without is exact in Mongo.
	 */
	hasText: boolean
}

export const toParsedQueryDTO = (parsed: ParsedQuery): ParsedQueryDTO => ({
	chips: parsed.chips,
	warnings: parsed.warnings,
	sort: parsed.sort,
	hasText: parsed.hasText,
})

export type PlanContext = {
	workspaceId: ObjectId
	userId: string
	now: Date
	folders: FolderIndex
	/**
	 * Tag redirects left by renames and merges (old slug -> new slug), redirect
	 * rules only (blocks are excluded). `tag:old` is rewritten to the end of the
	 * chain (at most 5 hops, cycle-safe) and reported in `corrections`, so a saved
	 * search or a bookmarked URL survives a rename without rewriting any stored text.
	 */
	tagRedirects: ReadonlyMap<string, string>
	/**
	 * Every term in the workspace index with the number of assets holding it.
	 * Null means typo tolerance is off. The caller loads it only for the second,
	 * fuzzy pass, because building it is not free.
	 */
	vocabulary: Map<string, number> | null
	/**
	 * Treat the final bare word as a prefix, for search-as-you-type. A word under
	 * 2 characters is never a prefix; a folder-name prefix needs 3.
	 */
	prefixLast: boolean
}

/** The fields a document must expose to be evaluated. */
export type EvaluableDoc = Pick<
	MediaAssetDoc,
	| '_id'
	| 'folderId'
	| 'name'
	| 'filename'
	| 'tags'
	| 'caption'
	| 'altText'
	| 'textInImage'
	| 'keywords'
	| 'notes'
	| 'colorNames'
	| 'orientation'
	| 'contentType'
	| 'kind'
	| 'brightness'
	| 'saturation'
	| 'hasAlpha'
	| 'animated'
	| 'width'
	| 'height'
	| 'bytes'
	| 'createdAt'
	| 'tagging'
	| 'nameKey'
	| 'pixels'
>

export type MatchResult = {
	/** 0 for a query with no text. Higher is better. */
	score: number
	/** Which fields matched, as short labels: `tag`, `name`, `caption`... */
	fields: string[]
}

export type SearchPlan = {
	/**
	 * A Mongo filter. It always carries the workspace. When `needsEvaluation` is
	 * true it is a superset of what `evaluate` accepts; when false it is exact and
	 * `evaluate` is not needed.
	 */
	prefilter: Record<string, unknown>
	needsEvaluation: boolean
	hasText: boolean
	/** The exact semantics of the whole query. Null means no match. */
	evaluate(doc: EvaluableDoc): MatchResult | null
	/**
	 * Substitutions this plan applied: typo fixes when a vocabulary was supplied,
	 * and tag redirects (`{ from: 'tag:van', to: 'tag:truck' }`) always.
	 */
	corrections: { from: string; to: string }[]
	/**
	 * Words a vocabulary could rescue (long enough, matching nothing as spelled).
	 * Empty means a fuzzy second pass cannot help.
	 */
	fuzzyEligible: string[]
}
