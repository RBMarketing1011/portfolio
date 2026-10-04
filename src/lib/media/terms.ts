/**
 * The search index for one asset. `terms` is a flat array of lowercase words (each
 * word and its stem) drawn from everything searchable about the image, indexed as
 * a Mongo multikey so a query narrows candidates cheaply. The query evaluator then
 * re-checks field by field, using `fieldTokens`, to rank and to be exact.
 *
 * Folder names are deliberately NOT in here: a folder rename must stay a
 * single-document write, so folders are matched at query time via the folder index.
 *
 * Pure and client safe. Every function tolerates a partial or malformed document
 * (a field missing, null or of the wrong type reads as empty) so one bad row can
 * never break a search or a reindex.
 */
import { indexTokenSets } from './text'
import {
	MEDIA_FORMAT_BY_TYPE,
	MEDIA_LIMITS,
	MEDIA_TERMS_VERSION,
	type MediaAssetDoc,
} from './types'

export type SearchableDoc = Pick<
	MediaAssetDoc,
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
	| 'hasAlpha'
	| 'animated'
>

/**
 * The fields a match can land in. Each has a weight in the scorer and a human
 * label used in `MatchResult.fields`.
 *
 *   tag           manual tags (label and slug words)
 *   auto-tag      AI tags (label words)
 *   filename-tag  tags derived from the file name
 *   name          the display name and the original file name
 *   caption       caption and alt text
 *   text          text read out of the image
 *   keyword       the AI's hidden related words
 *   notes         the person's notes
 *   color         names of the dominant colours
 *   look          format (png, jpg + jpeg for jpeg), orientation, kind, and the
 *                 words `animated` / `transparent`. NOT brightness or saturation:
 *                 `light` and `dark` are real tag vocabulary ("natural light"),
 *                 so they are reachable only through `is:light` / `is:dark`.
 */
export type FieldKey =
	| 'tag'
	| 'auto-tag'
	| 'filename-tag'
	| 'name'
	| 'caption'
	| 'text'
	| 'keyword'
	| 'notes'
	| 'color'
	| 'look'

export const FIELD_KEYS: readonly FieldKey[] = [
	'tag',
	'auto-tag',
	'filename-tag',
	'name',
	'caption',
	'text',
	'keyword',
	'notes',
	'color',
	'look',
]

/** What `MatchResult.fields` shows people: `auto-tag` reads as "auto tag" and so on. */
export const FIELD_LABELS: Record<FieldKey, string> = {
	tag: 'tag',
	'auto-tag': 'auto tag',
	'filename-tag': 'file name',
	name: 'name',
	caption: 'caption',
	text: 'text in image',
	keyword: 'keyword',
	notes: 'notes',
	color: 'color',
	look: 'type',
}

const has = (target: object, key: string) =>
	Object.prototype.hasOwnProperty.call(target, key)

/** A usable string, or nothing: whitespace-only and non-string values read as absent. */
const text = (value: unknown): string =>
	typeof value === 'string' && value.trim() ? value : ''

const textList = (value: unknown): string[] =>
	Array.isArray(value) ? value.map(text).filter(Boolean) : []

const emptyTexts = (): Record<FieldKey, string[]> => ({
	tag: [],
	'auto-tag': [],
	'filename-tag': [],
	name: [],
	caption: [],
	text: [],
	keyword: [],
	notes: [],
	color: [],
	look: [],
})

const pushUnique = (list: string[], value: string) => {
	if (value && !list.includes(value)) list.push(value)
}

/**
 * The raw strings behind each field, for phrase matching: a phrase must appear as
 * consecutive words inside ONE of a field's strings (so a phrase cannot straddle
 * two different tags). Stopwords ARE present here (it is the raw text), which is
 * what lets a phrase like "before and after" be checked. Empty arrays for empty fields.
 */
export function fieldTexts(doc: SearchableDoc): Record<FieldKey, string[]> {
	const out = emptyTexts()
	if (!doc || typeof doc !== 'object') return out

	for (const tag of Array.isArray(doc.tags) ? doc.tags : []) {
		if (!tag || typeof tag !== 'object') continue
		const label = text(tag.label)
		if (tag.source === 'manual') {
			// A manual tag is findable by its slug as well as its label.
			pushUnique(out.tag, label)
			pushUnique(out.tag, text(tag.slug))
		} else if (tag.via === 'filename') pushUnique(out['filename-tag'], label)
		else pushUnique(out['auto-tag'], label)
	}

	pushUnique(out.name, text(doc.name))
	pushUnique(out.name, text(doc.filename))
	pushUnique(out.caption, text(doc.caption))
	pushUnique(out.caption, text(doc.altText))
	pushUnique(out.text, text(doc.textInImage))
	for (const keyword of textList(doc.keywords)) pushUnique(out.keyword, keyword)
	pushUnique(out.notes, text(doc.notes))
	for (const color of textList(doc.colorNames)) pushUnique(out.color, color)

	// Own-property lookups: a hostile `contentType` of "__proto__" or "constructor"
	// must not resolve to something on Object.prototype.
	const contentType = typeof doc.contentType === 'string' ? doc.contentType : ''
	if (contentType && has(MEDIA_FORMAT_BY_TYPE, contentType)) {
		pushUnique(out.look, MEDIA_FORMAT_BY_TYPE[contentType as keyof typeof MEDIA_FORMAT_BY_TYPE])
		// People say both, and the stored format word is only `jpg`.
		if (contentType === 'image/jpeg') pushUnique(out.look, 'jpeg')
	}
	pushUnique(out.look, text(doc.orientation))
	pushUnique(out.look, text(doc.kind))
	if (doc.animated === true) pushUnique(out.look, 'animated')
	if (doc.hasAlpha === true) pushUnique(out.look, 'transparent')

	return out
}

export type FieldTokenSet = {
	/** Non-stopword words as written (plus the joined runs `indexTokens` adds). */
	surface: Set<string>
	/** `stem(word)` for each surface word. */
	stems: Set<string>
}

/**
 * Per field, the index tokens split into what was written and what it stems to,
 * so the scorer can tell an exact word match from a stem-only match (`siding`
 * and `side` share a stem; they are not the same word). Built with `indexTokens`:
 * `surface` plus `stems` is exactly the token set `indexTokens` gives for the
 * field's strings. A joined run (`iphone15`) is surface only; it has no stem entry.
 */
export function fieldTokens(doc: SearchableDoc): Record<FieldKey, FieldTokenSet> {
	const texts = fieldTexts(doc)
	const out = {} as Record<FieldKey, FieldTokenSet>
	for (const key of FIELD_KEYS) {
		const surface = new Set<string>()
		const stems = new Set<string>()
		for (const value of texts[key]) {
			const sets = indexTokenSets(value)
			for (const token of sets.surface) surface.add(token)
			for (const token of sets.stems) stems.add(token)
		}
		out[key] = { surface, stems }
	}
	return out
}

/**
 * The union of every field's surface and stem tokens, deduplicated, in a stable
 * order (sorted, for stable output only). NEVER truncated: the evaluator reads
 * `fieldTokens` in full, so an index that dropped terms would make the Mongo
 * prefilter exclude documents the evaluator accepts. Every input is bounded by
 * MEDIA_LIMITS so size is bounded without a cap; MEDIA_LIMITS.termsMax is a
 * safety valve that must be unreachable in practice, and if it ever is reached the
 * excess is an error to surface, not something to cut silently. Past it, one
 * `console.error` per call reports the size and every term is still returned.
 */
export function buildTerms(doc: SearchableDoc): string[] {
	const all = new Set<string>()
	const fields = fieldTokens(doc)
	for (const key of FIELD_KEYS) {
		for (const token of fields[key].surface) all.add(token)
		for (const token of fields[key].stems) all.add(token)
	}
	const terms = [...all].sort()
	if (terms.length > MEDIA_LIMITS.termsMax)
		console.error(
			`media: an asset's search index has ${terms.length} terms, above the ${MEDIA_LIMITS.termsMax} safety limit. Kept in full.`,
		)
	return terms
}

/**
 * Everything denormalised from the fields above, ready to `$set` in one go. Every
 * write that touches name, tags, caption, alt text, text-in-image, keywords, notes,
 * kind or colours MUST include this (and bump `rev`), or search quietly goes stale.
 * `commitAsset` does it for you.
 *   nameKey      lowercased name
 *   colorNames   unique names out of `colors`
 *   terms        buildTerms of the document as it will be after the write
 *   termsVersion MEDIA_TERMS_VERSION
 */
export function derivedFields(
	doc: SearchableDoc & Pick<MediaAssetDoc, 'colors'>,
): Pick<MediaAssetDoc, 'terms' | 'termsVersion' | 'nameKey' | 'colorNames'> {
	const colorNames: string[] = []
	for (const color of Array.isArray(doc?.colors) ? doc.colors : []) {
		const name = color && typeof color === 'object' ? text(color.name) : ''
		if (name && !colorNames.includes(name)) colorNames.push(name)
	}
	return {
		// From `colors`, never the stored `colorNames`, which may be stale.
		terms: buildTerms({ ...doc, colorNames }),
		termsVersion: MEDIA_TERMS_VERSION,
		nameKey: typeof doc?.name === 'string' ? doc.name.toLowerCase() : '',
		colorNames,
	}
}
