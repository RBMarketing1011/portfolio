/**
 * The media library's whole vocabulary: stored documents, what the API returns,
 * and the limits both sides agree on. Client safe on purpose (types and plain
 * constants only), so the browser and the server cannot drift apart.
 *
 * The library belongs to a workspace ("account" in the UI), not to a project, so
 * every site in the account draws on one shared pool of images.
 */
import type { ObjectId } from 'mongodb'

/* -------------------------------------------------------------------------- */
/* Collections                                                                */
/* -------------------------------------------------------------------------- */

export const MEDIA_ASSETS = 'mediaAssets'
export const MEDIA_FOLDERS = 'mediaFolders'
/** Aliases and blocks that make tag merges and deletions stick. */
export const MEDIA_TAG_RULES = 'mediaTagRules'
export const MEDIA_SAVED_SEARCHES = 'mediaSavedSearches'
/** One counter document per workspace per day, plus one global one, so AI spend has a ceiling. */
export const MEDIA_AI_USAGE = 'mediaAiUsage'

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

export const MEDIA_LIMITS = {
	/** Per file. Uploads go browser -> Vercel Blob, so this is not the 4.5 MB request cap. */
	maxBytes: 25 * 1024 * 1024,
	/** Per workspace, summed over every image. Blob storage is the owner's bill. */
	maxTotalBytes: 5 * 1024 * 1024 * 1024,
	/**
	 * Decode ceiling. A 100-megapixel image decodes to roughly 200-260 MB of
	 * working memory (measured), and a function runs a few of these at once.
	 */
	maxPixels: 64_000_000,
	maxAssets: 5000,
	maxFolders: 1000,
	/** The root is depth 0, so six levels of nesting means depth 5. */
	maxFolderDepth: 6,
	folderNameMax: 80,
	maxTagsPerAsset: 40,
	tagLabelMax: 40,
	nameMax: 200,
	captionMax: 500,
	altMax: 300,
	notesMax: 2000,
	textInImageMax: 300,
	/** Hidden related words the AI supplies; indexed, never shown as tags. */
	keywordsMax: 24,
	/**
	 * A vision tag below this confidence is not stored as a tag (the model's
	 * long tail would swamp the tag list and the facets). Its words still feed the
	 * hidden keywords.
	 */
	autoTagMinConfidence: 0.6,
	autoTagsMax: 10,
	rejectedTagsMax: 200,
	pageSize: 60,
	maxPageSize: 120,
	/** Text queries are scored in memory. Past this the result is reported as truncated. */
	candidateCap: 5000,
	bulkIdsCap: 500,
	/** "Select all N matching" resolves a search into ids, up to this many. Above it the action is refused, never truncated. */
	bulkSearchCap: 5000,
	savedSearchesMax: 50,
	savedSearchNameMax: 60,
	queryMax: 500,
	/** Group nesting beyond this is flattened, so a plan can never exceed Mongo's BSON depth. */
	queryMaxDepth: 8,
	/**
	 * A safety valve on one asset's index terms. Unreachable within the field
	 * limits above (about 1,500 at the extreme), and `terms` is NEVER truncated
	 * below it: a truncated index would make the prefilter exclude documents the
	 * evaluator accepts.
	 */
	termsMax: 2000,
	/** Images the process endpoint will tag in one request, at most. */
	aiBatchMax: 4,
	aiBatchDefault: 2,
	/** Per workspace per UTC day, unless MEDIA_AI_DAILY_LIMIT overrides it. */
	aiDailyDefault: 150,
	/** Across every workspace per UTC day, unless MEDIA_AI_GLOBAL_DAILY_LIMIT overrides it. The real cost ceiling. */
	aiGlobalDailyDefault: 1000,
	aiMaxAttempts: 3,
	/** One request stops claiming new images this long after it started (the function limit is 60 s). */
	aiRunBudgetMs: 40_000,
	/** A claim lasts the run budget plus 15 s: long enough to finish, short enough that a killed request is reclaimed quickly. */
	aiLeaseMs: 55_000,
	/** The SDK client's own timeout. Retrying belongs to the queue, not the SDK. */
	aiClientTimeoutMs: 25_000,
	aiRetryAfterDefaultMs: 30_000,
	aiRetryAfterMaxMs: 10 * 60_000,
} as const

/** Bumped whenever the way `terms` is built changes, so a reindex knows what is stale. */
export const MEDIA_TERMS_VERSION = 1

/* -------------------------------------------------------------------------- */
/* Image attributes                                                           */
/* -------------------------------------------------------------------------- */

export const MEDIA_CONTENT_TYPES = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif',
] as const
export type MediaContentType = (typeof MEDIA_CONTENT_TYPES)[number]

export const MEDIA_FORMATS = ['jpg', 'png', 'webp', 'avif', 'gif'] as const
export type MediaFormat = (typeof MEDIA_FORMATS)[number]

export const MEDIA_FORMAT_BY_TYPE: Record<MediaContentType, MediaFormat> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/gif': 'gif',
}

export const MEDIA_TYPE_BY_FORMAT: Record<MediaFormat, MediaContentType> = {
	jpg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	avif: 'image/avif',
	gif: 'image/gif',
}

export const MEDIA_ORIENTATIONS = [
	'landscape',
	'portrait',
	'square',
	'panorama',
] as const
export type MediaOrientation = (typeof MEDIA_ORIENTATIONS)[number]

export const MEDIA_BRIGHTNESS = ['dark', 'mid', 'light'] as const
export type MediaBrightness = (typeof MEDIA_BRIGHTNESS)[number]

export const MEDIA_SATURATION = ['monochrome', 'muted', 'vivid'] as const
export type MediaSaturation = (typeof MEDIA_SATURATION)[number]

/** What an image *is*, as opposed to what it shows. A single-valued facet. */
export const MEDIA_KINDS = [
	'photo',
	'illustration',
	'logo',
	'icon',
	'screenshot',
	'graphic',
	'pattern',
	'diagram',
	'other',
] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

/** A dominant colour. `name` comes from the curated list in `colors.ts`. */
export type MediaColor = {
	hex: string
	name: string
	/** Fraction of the opaque pixels, 0..1. */
	share: number
}

/** Everything the deterministic analysis pass learns from the bytes alone. */
export type ImageAnalysis = {
	format: MediaFormat
	contentType: MediaContentType
	/** Display dimensions, with the EXIF rotation already applied. */
	width: number
	height: number
	orientation: MediaOrientation
	hasAlpha: boolean
	animated: boolean
	/** Up to five, largest share first. */
	colors: MediaColor[]
	brightness: MediaBrightness
	saturation: MediaSaturation
	/** Hex of the original bytes. Exact-duplicate detection. */
	sha256: string
	/** A ~12px wide WebP data URL for instant placeholders. Null if it could not be made. */
	blur: string | null
}

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */

export type MediaTag = {
	/** Canonical identity, e.g. `kitchen-remodel`. */
	slug: string
	/** What a person sees, e.g. `Kitchen remodel`. */
	label: string
	/** `manual` was typed by a person. `auto` was produced by the library. */
	source: 'manual' | 'auto'
	/** How an auto tag was produced. */
	via?: 'vision' | 'filename'
	/** 0..1. Vision tags only. */
	confidence?: number
}

export type MediaTaggingStatus =
	| 'pending'
	| 'running'
	| 'done'
	| 'failed'
	| 'skipped'

export type MediaTaggingState = {
	status: MediaTaggingStatus
	attempts: number
	/** While `running`: until when this claim is honoured. */
	leaseUntil?: Date
	/** While `pending`: not claimable before this (a rate limit asked us to wait). */
	retryAfter?: Date
	/** Why `skipped`. `not_configured` is recoverable once a key is set. */
	reason?: 'not_configured' | 'declined' | 'budget'
	/**
	 * Shown to every viewer, so it comes from a fixed table of messages keyed by
	 * failure kind ("The AI service is unavailable."), never from an error's own
	 * text, which can carry hostnames, request ids or URLs.
	 */
	error?: string
	model?: string
	/** When the last run finished. */
	at?: Date
}

/* -------------------------------------------------------------------------- */
/* Stored documents                                                           */
/* -------------------------------------------------------------------------- */

export type MediaAssetDoc = {
	_id: ObjectId
	workspaceId: ObjectId
	/** Null means the library root ("Unfiled"). */
	folderId: ObjectId | null

	/** Editable display name, without the extension. */
	name: string
	/** Lowercased `name`, for sorting. */
	nameKey: string
	/** The file name as uploaded, with its extension. */
	filename: string

	url: string
	/** The Vercel Blob pathname. Unique per workspace. */
	pathname: string
	contentType: MediaContentType
	bytes: number

	width: number
	height: number
	/** width * height, for sorting. */
	pixels: number
	orientation: MediaOrientation
	hasAlpha: boolean
	animated: boolean
	colors: MediaColor[]
	/** Unique names from `colors`, for filtering. */
	colorNames: string[]
	brightness: MediaBrightness
	saturation: MediaSaturation
	sha256: string
	blur: string | null

	tags: MediaTag[]
	/** Slugs a person removed. The auto-tagger must never put them back. Capped. */
	rejectedTags: string[]
	caption: string
	altText: string
	/** True once a person edited the caption or alt text, so the AI stops overwriting them. */
	captionEdited: boolean
	/** Prominent text visible in the image, as read by the AI. Searchable. */
	textInImage: string
	/** Related words the AI supplied. Searchable, never shown as tags. */
	keywords: string[]
	kind: MediaKind | null
	notes: string

	/** Derived. Every write that changes searchable fields must rebuild it. Never truncated. */
	terms: string[]
	termsVersion: number

	/**
	 * Revision. Every write that sets tags, rejectedTags, caption, altText,
	 * captionEdited, name, textInImage, keywords, kind, notes or terms bumps it,
	 * and writes through `commitAsset`, which only applies a change to the
	 * revision it read. Without it, a slow AI run (10-30 s) erases whatever a
	 * person did meanwhile, and two people editing one image overwrite each other.
	 */
	rev: number

	tagging: MediaTaggingState
	/** The user who uploaded it. Internal: never sent to the browser. */
	uploadedBy: string
	createdAt: Date
	updatedAt: Date
}

export type MediaFolderDoc = {
	_id: ObjectId
	workspaceId: ObjectId
	parentId: ObjectId | null
	name: string
	/**
	 * `folderKey(name)` from folder-index.ts, the only definition: Unicode aware,
	 * accents stripped, case folded, punctuation collapsed, falling back to the
	 * lowercased trimmed name when nothing letter-like survives. Unique among siblings.
	 */
	nameKey: string
	createdBy: string
	createdAt: Date
	updatedAt: Date
}

/**
 * What a tag merge, rename or delete leaves behind, so the auto-tagger does not
 * quietly recreate the tag the person just got rid of. Redirects are flattened
 * when written (see tags.ts), so a lookup is one hop in practice.
 */
export type MediaTagRuleDoc = {
	_id: ObjectId
	workspaceId: ObjectId
	/** The slug being redirected. */
	from: string
	/** Where it now goes, or null to never apply it automatically. */
	to: { slug: string; label: string } | null
	createdAt: Date
}

export type MediaSavedSearchDoc = {
	_id: ObjectId
	workspaceId: ObjectId
	name: string
	query: string
	/** Same meaning as the `folder` search parameter. Store the id, not a path in `query`: a folder rename must not break a saved search. */
	folder: string | null
	sort: MediaSort | null
	createdBy: string
	createdAt: Date
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

export const MEDIA_SORTS = [
	'relevance',
	'newest',
	'oldest',
	'name',
	'name-desc',
	'largest',
	'smallest',
	'dimensions',
] as const
export type MediaSort = (typeof MEDIA_SORTS)[number]

export type MediaSearchParams = {
	/** The raw text from the search box, operators and all. */
	q: string
	/** Absent: every folder. `unfiled`: only assets with no folder. Otherwise a folder id. */
	folder?: string
	/**
	 * Include subfolders of `folder`. When undefined the server decides: on if there
	 * is a query or any filter, off for plain browsing.
	 */
	deep?: boolean
	/** Defaults to `relevance` for a text query and `newest` otherwise. */
	sort?: MediaSort
	offset?: number
	limit?: number
	/** Compute facet counts for the result set. */
	facets?: boolean
}

/** One clause of the query, as the search box shows it. */
export type QueryChip = {
	key: string
	kind: 'term' | 'phrase' | 'filter'
	/** What the chip reads, e.g. `tag: kitchen`, `"before and after"`, `width > 1200`. */
	label: string
	/**
	 * The clause in canonical form, e.g. `tag:kitchen`, `color:blue`, `-tag:people`.
	 * Always the whole chip, so removing a chip removes exactly this.
	 */
	clause: string
	/** For `filter` chips: the operator, lowercase (`tag`, `type`, `width`...). */
	field?: string
	/** For `filter` chips: the normalised values of a comma list (`type:png,jpg` is ['png','jpg']). Empty for numeric fields. */
	values?: string[]
	negated: boolean
	/** Character range in the raw query, so the UI can cut the clause out. */
	start: number
	end: number
}

export type ParsedQueryDTO = {
	chips: QueryChip[]
	/** Things the person should know, e.g. `Unknown type "xyz" was ignored.` */
	warnings: string[]
	/** A `sort:` operator written in the query, if any. */
	sort: MediaSort | null
	hasText: boolean
}

export type FacetCount = {
	/** What to put after the operator: a tag slug, a colour name, a folder id. */
	value: string
	label: string
	count: number
}

/**
 * Counts for the current result set. Only groups where a count means something:
 * tags, colours and folders. Format, orientation and kind are single-valued, so
 * counts over a result set that already filtered on one would hide its siblings;
 * the UI offers them as plain toggles from MEDIA_FORMATS / MEDIA_ORIENTATIONS /
 * MEDIA_KINDS instead.
 */
export type MediaFacets = {
	tags: FacetCount[]
	colors: (FacetCount & { hex: string })[]
	/** `value` is the folder id, `label` its path. */
	folders: FacetCount[]
}

export type MediaSuggestion = {
	kind: 'tag' | 'folder' | 'operator' | 'value' | 'search'
	label: string
	/** What replaces the token under the cursor when this is accepted. */
	insert: string
	hint?: string
	count?: number
	/** Hex, for colour values. */
	swatch?: string
}

/* -------------------------------------------------------------------------- */
/* API shapes                                                                 */
/* -------------------------------------------------------------------------- */

export type MediaAssetDTO = {
	id: string
	name: string
	filename: string
	url: string
	contentType: MediaContentType
	format: MediaFormat
	bytes: number
	width: number
	height: number
	orientation: MediaOrientation
	hasAlpha: boolean
	animated: boolean
	colors: MediaColor[]
	brightness: MediaBrightness
	saturation: MediaSaturation
	blur: string | null
	folderId: string | null
	/** `Clients/Acme`, or an empty string at the root. */
	folderPath: string
	tags: MediaTag[]
	caption: string
	altText: string
	textInImage: string
	notes: string
	kind: MediaKind | null
	tagging: {
		status: MediaTaggingStatus
		reason?: 'not_configured' | 'declined' | 'budget'
		error?: string
	}
	createdAt: string
	updatedAt: string
	/** Present only when a text query ranked this result. */
	match?: { score: number; fields: string[] }
}

export type MediaSearchResponse = {
	assets: MediaAssetDTO[]
	total: number
	offset: number
	limit: number
	hasMore: boolean
	/** The text query hit the candidate cap, so `total` is a lower bound. */
	truncated: boolean
	/** The sort actually applied. */
	sort: MediaSort
	query: ParsedQueryDTO
	/**
	 * Substitutions applied to get results: typo fixes (`kithcen` -> `kitchen`) and
	 * tag redirects left by a rename or merge (`tag:van` -> `tag:truck`).
	 */
	corrections: { from: string; to: string }[]
	/** Free-text words that appear nowhere in the library and were dropped to get results. */
	dropped: string[]
	facets: MediaFacets | null
	/** Assets in the whole library still waiting for AI tags. */
	pending: number
}

export type MediaFolderDTO = {
	id: string
	parentId: string | null
	name: string
	path: string
	depth: number
	/** Assets directly in this folder. */
	count: number
	/** Assets in this folder and everything beneath it. */
	total: number
}

export type MediaFoldersResponse = {
	folders: MediaFolderDTO[]
	/** Assets with no folder. */
	unfiled: number
	/** Every asset. */
	total: number
	/** Assets that still carry an automatic tag nobody has kept (the `is:unreviewed` set). */
	unreviewed: number
	bytes: number
}

export type MediaTagStat = {
	slug: string
	label: string
	/** Assets carrying it. */
	count: number
	manual: number
	auto: number
}

export type MediaSavedSearchDTO = {
	id: string
	name: string
	query: string
	folder: string | null
	sort: MediaSort | null
	createdAt: string
}

export type MediaTaggingStatusDTO = {
	/** Whether an API key is present and AI tagging is switched on, i.e. whether AI tags can be made at all. */
	configured: boolean
	model: string | null
	pending: number
	running: number
	failed: number
	/** Skipped because no key was set when they were uploaded. They can be requeued. */
	skipped: number
	/** Assets with no tags of any source (the `is:untagged` set). */
	untagged: number
	/** A daily ceiling (this account's or the global one) has been reached. */
	budgetExhausted: boolean
	/** ISO time of the next 00:00 UTC, set only when `budgetExhausted`. */
	resetsAt: string | null
}

export type MediaProcessResponse = {
	processed: {
		id: string
		status: MediaTaggingStatus
		asset?: MediaAssetDTO
	}[]
	/**
	 * Images still claimable after this call. The client stops looping when
	 * `budgetExhausted` is true, when `blocked` is set, when `processed` is empty,
	 * or when `remaining` is 0.
	 */
	remaining: number
	configured: boolean
	budgetExhausted: boolean
	/**
	 * The run stopped for a reason that affects every image, not one. `config`: the
	 * key, billing or model is wrong (stop and show `message`). `rate_limited`: wait
	 * `retryAfterMs` before the next call.
	 */
	blocked?: {
		kind: 'config' | 'rate_limited'
		message: string
		retryAfterMs?: number
	}
}

export type MediaRegisterResponse =
	| { status: 'created'; asset: MediaAssetDTO }
	/** Byte-identical to something already in the library. The new upload was discarded. */
	| { status: 'duplicate'; asset: MediaAssetDTO }

export type MediaBulkAction =
	| 'move'
	| 'addTags'
	| 'removeTags'
	| 'delete'
	| 'retag'
	| 'acceptAutoTags'

export type MediaBulkResponse = {
	affected: number
}

export const isMediaFormat = (value: string): value is MediaFormat =>
	(MEDIA_FORMATS as readonly string[]).includes(value)
