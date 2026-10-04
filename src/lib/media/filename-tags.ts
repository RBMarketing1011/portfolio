/**
 * Tags read straight off a file name. `kitchen-remodel-after.jpg` says something;
 * `IMG_2034.jpg` does not. Free, offline, instant, and the only auto-tagging that
 * works with no API key. Pure and client safe.
 */
import { STOPWORDS, normalizeText, slugify } from './text'
import { MEDIA_LIMITS, type MediaTag } from './types'

/** Words that name a device, an app or an export rather than a subject. `hero` is NOT here. */
const NOISE: ReadonlySet<string> = new Set([
	'img',
	'imgp',
	'dsc',
	'dscn',
	'dscf',
	'pxl',
	'mvimg',
	'dji',
	'gopr',
	'screenshot',
	'screen',
	'shot',
	'copy',
	'final',
	'new',
	'untitled',
	'image',
	'photo',
	'pic',
	'picture',
	'file',
	'scan',
	'edited',
	'web',
	'optimized',
	'scaled',
	'large',
	'small',
	'whatsapp',
	// "photo.png.jpg": the middle one is an export artefact, not a subject
	'jpg',
	'jpeg',
	'png',
	'gif',
	'webp',
	'avif',
	'heic',
	'heif',
	'dpi',
])

// Only real image extensions are stripped. A generic ".xxxxx" rule would eat the
// last word of "kitchen.remodel" or the "v2" of "final.v2".
const EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'jpe',
	'jfif',
	'png',
	'gif',
	'webp',
	'avif',
	'heic',
	'heif',
	'tif',
	'tiff',
	'bmp',
	'svg',
	'ico',
	'raw',
	'cr2',
	'nef',
	'arw',
	'dng',
	'psd',
	'ai',
	'eps',
	'pdf',
])

const MAX_TAGS = 6
const MIN_LENGTH = 3
/** Longest stem of a name worth reading. Real names are under 255. */
const MAX_NAME = 512

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** The last path segment without its image extension(s). */
function stemOf(filename: string): string {
	let name = filename.slice(filename.lastIndexOf('/') + 1)
	name = name.slice(name.lastIndexOf('\\') + 1)
	// "photo.png.jpg": strip every trailing image extension.
	for (;;) {
		const dot = name.lastIndexOf('.')
		if (dot < 0 || !EXTENSIONS.has(name.slice(dot + 1).toLowerCase())) break
		name = name.slice(0, dot)
	}
	return name.slice(0, MAX_NAME)
}

/**
 * A hash, an id or a camera sequence rather than a word: hex-only and long, or
 * hex-only with digits in it. Short hex-looking WORDS ("cafe", "decade") stay.
 */
function isHashLike(run: string): boolean {
	if (!/^[0-9a-f]+$/i.test(run)) return false
	return run.length >= 8 || (run.length >= 6 && /\d/.test(run))
}

// Boundaries inside a run, accent-preserving (the labels keep their accents).
const CASE_BOUNDARY = /(\p{Ll}\p{M}*)(?=\p{Lu})/gu
const ACRONYM_BOUNDARY = /(\p{Lu}\p{M}*)(?=\p{Lu}\p{Ll})/gu
const LETTER_DIGIT = /(\p{L}\p{M}*)(?=\p{N})/gu
const DIGIT_LETTER = /(\p{N})(?=\p{L})/gu

const wordsOfRun = (run: string): string[] =>
	run
		.replace(CASE_BOUNDARY, '$1 ')
		.replace(ACRONYM_BOUNDARY, '$1 ')
		.replace(LETTER_DIGIT, '$1 ')
		.replace(DIGIT_LETTER, '$1 ')
		.split(' ')
		.filter(Boolean)

const titleCase = (word: string): string => {
	const [first = '', ...rest] = Array.from(word)
	return first.toUpperCase() + rest.join('').toLowerCase()
}

/**
 * Meaningful words from a file name as `source: 'auto', via: 'filename'` tags
 * (labels are Title-cased single words; slugs from `slugify`).
 *
 * Drops: the extension, digits-only and under-three-character words, stopwords, and
 * noise that names a device or an export rather than a subject (img, dsc, dscn,
 * pxl, mvimg, screenshot, screen, shot, copy, final, new, untitled, image, photo,
 * pic, picture, file, scan, edited, web, optimized, scaled, large, small, hero is
 * KEPT), hex or uuid-looking runs, and dimension markers like `1920x1080` or `2x`.
 * At most six tags; returns [] when nothing meaningful is left.
 */
export function filenameTags(filename: string): MediaTag[] {
	if (typeof filename !== 'string' || !filename) return []

	const base = stemOf(filename).normalize('NFC').replace(UUID, ' ')
	const tags: MediaTag[] = []
	const seen = new Set<string>()

	for (const run of base.split(/[^\p{L}\p{N}\p{M}]+/u)) {
		if (!run || isHashLike(run)) continue
		// A noise word written in camelCase ("WhatsApp") would otherwise be split
		// into innocent-looking halves before it could be recognised.
		if (NOISE.has(normalizeText(run))) continue
		// Dimension markers ("1920x1080", "2x") fall out here: digits and a lone
		// "x" are each dropped below.
		for (const word of wordsOfRun(run)) {
			if (Array.from(word).length < MIN_LENGTH) continue
			if (word.length > MEDIA_LIMITS.tagLabelMax) continue
			if (/^\p{N}+$/u.test(word)) continue
			const key = normalizeText(word)
			if (!key || STOPWORDS.has(key) || NOISE.has(key)) continue
			const label = titleCase(word)
			const slug = slugify(label)
			if (!slug || seen.has(slug)) continue
			seen.add(slug)
			tags.push({ slug, label, source: 'auto', via: 'filename' })
			if (tags.length === MAX_TAGS) return tags
		}
	}
	return tags
}
