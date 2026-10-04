import 'server-only'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { nameColor, rgbToHex } from './colors'
import {
	MEDIA_FORMAT_BY_TYPE,
	MEDIA_LIMITS,
	type ImageAnalysis,
	type MediaBrightness,
	type MediaColor,
	type MediaContentType,
	type MediaOrientation,
	type MediaSaturation,
} from './types'

/**
 * Everything learnable from the bytes alone, with `sharp`. Deterministic, free,
 * and fast (a few tens of ms), so it runs inline when an upload is registered.
 *
 * sharp is pinned to the version Next 15.3 itself depends on (^0.34.x). Never bump
 * it alone: a second copy makes two native addons collide in one process on
 * Windows dev and self-hosting (`/_next/image` and the route handlers share a process).
 *
 * Calibration notes (thresholds that differ from the first draft of the spec,
 * each checked against generated images in scripts/prove-media-analyze.mjs):
 *  - brightness uses gamma-encoded (sRGB) luma, not linear-light luminance. The
 *    spec's 0.30 / 0.68 cut-offs on LINEAR luminance would call a plain mid gray
 *    (#808080, Y = 0.22) "dark" and need #d6d6d6 to count as "light"; on encoded
 *    luma they read as a person sees them (#808080 is mid, #4d4d4d the dark edge).
 *  - saturation ignores pixels whose brightest channel is below 16: HSV saturation
 *    is wildly unstable near black (#010002 is "100% saturated"), so a noisy dark
 *    photo would otherwise read as vivid.
 *  - a pixel counts as "opaque" for colour sampling at alpha >= 128; `hasAlpha`
 *    uses the spec's alpha < 250 on the full-resolution image.
 *  - the blur placeholder is capped at 48px tall so an extreme portrait stays tiny.
 */

/** The bytes are not an image this library accepts, or cannot be decoded. */
export class UnsupportedImageError extends Error {
	constructor(message = 'That file is not a supported image.') {
		super(message)
		this.name = 'UnsupportedImageError'
	}
}

/** Longest edge of the colour sample. */
const SAMPLE_EDGE = 64
/** Sample pixels at or above this alpha are "opaque" for colours and tone. */
const SAMPLE_MIN_ALPHA = 128
/** An image is transparent only if some pixel is below this alpha (spec: 250). */
const TRANSPARENT_BELOW = 250
/** Share a palette entry needs to be kept, and how many survive. */
const MIN_SHARE = 0.03
const MAX_COLORS = 5
const CLUSTERS = 6
/** A new cluster is only seeded this far (Lab distance) from every existing one. */
const SPLIT_DISTANCE = 12
const LLOYD_ROUNDS = 24
const BRIGHTNESS_DARK = 0.3
const BRIGHTNESS_LIGHT = 0.68
const SATURATION_MONO = 0.08
const SATURATION_VIVID = 0.45
const SATURATION_FLOOR_MAX_CHANNEL = 16
const BLUR_WIDTH = 12
const BLUR_MAX_HEIGHT = 48
const BLUR_QUALITY = 40
const VISION_EDGE = 1024
const VISION_QUALITY = 80

/**
 * Every sharp input goes through here. `failOn: 'error'` (not sharp's stricter
 * default) so a JPEG with a harmless warning, which every browser shows, is not
 * rejected; a truncated PNG still fails because libspng reports it as an error.
 */
const INPUT = {
	limitInputPixels: MEDIA_LIMITS.maxPixels,
	failOn: 'error',
} as const

const TOO_LARGE = 'That image is too large to process.'

function unsupported(cause: unknown): UnsupportedImageError {
	if (cause instanceof UnsupportedImageError) return cause
	// sharp's own single-frame limit trips with this wording; say so plainly.
	const oversize = cause instanceof Error && /pixel limit/i.test(cause.message)
	const error = new UnsupportedImageError(oversize ? TOO_LARGE : undefined)
	error.cause = cause
	return error
}

type Inspected = {
	contentType: MediaContentType
	/** Display dimensions (EXIF rotation applied). */
	width: number
	height: number
	pages: number
	/** The file has an alpha channel (not yet: has real transparency). */
	alphaChannel: boolean
}

function contentTypeOf(format: string | undefined, compression: string | undefined) {
	switch (format) {
		case 'jpeg':
			return 'image/jpeg'
		case 'png':
			return 'image/png'
		case 'webp':
			return 'image/webp'
		case 'gif':
			return 'image/gif'
		// libheif reports AVIF as `heif` with the av1 codec; HEIC (hevc) is not accepted.
		case 'heif':
			return compression === 'av1' ? 'image/avif' : null
		default:
			return null
	}
}

/**
 * Reads the header only (no pixels): the real format, the real size, and the
 * decode ceiling, so a hostile file is refused before anything big is allocated.
 */
async function inspect(buffer: Buffer): Promise<Inspected> {
	if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new UnsupportedImageError()
	let meta: sharp.Metadata
	try {
		meta = await sharp(buffer, INPUT).metadata()
	} catch (error) {
		throw unsupported(error)
	}

	const contentType = contentTypeOf(meta.format, meta.compression)
	if (!contentType) throw new UnsupportedImageError()

	const rawWidth = meta.width ?? 0
	const rawHeight = meta.height ?? 0
	if (!Number.isInteger(rawWidth) || !Number.isInteger(rawHeight) || rawWidth < 1 || rawHeight < 1) {
		throw new UnsupportedImageError()
	}

	// `meta.height` is one frame's height, which is also what sharp's own limit
	// counts, so an animation's whole stack is enforced here.
	const pages = Math.max(1, meta.pages ?? 1)
	const framePixels = rawWidth * rawHeight
	if (framePixels > MEDIA_LIMITS.maxPixels || framePixels * pages > MEDIA_LIMITS.maxPixels) {
		throw new UnsupportedImageError(TOO_LARGE)
	}

	// sharp reports the post-rotation size itself; swap by hand only if it did not
	// (and only for the transposing orientations 5..8). AVIF arrives pre-rotated.
	let width = meta.autoOrient?.width ?? rawWidth
	let height = meta.autoOrient?.height ?? rawHeight
	if (!meta.autoOrient && meta.orientation && meta.orientation >= 5 && meta.orientation <= 8) {
		;[width, height] = [rawHeight, rawWidth]
	}
	return { contentType, width, height, pages, alphaChannel: meta.hasAlpha === true }
}

/** Exact integer comparisons, so 21x20 (ratio 1.05) is `square`, never float luck. */
function orientationOf(width: number, height: number): MediaOrientation {
	if (width * 100 >= height * 240) return 'panorama'
	if (width * 100 > height * 105) return 'landscape'
	if (width * 100 < height * 95) return 'portrait'
	return 'square'
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                     */
/* -------------------------------------------------------------------------- */

type Lab = [number, number, number]

const D65 = [0.95047, 1, 1.08883] as const
const EPSILON = 216 / 24389
const KAPPA = 24389 / 27

const linear = (value: number) => {
	const c = value / 255
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const labF = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116)

function toLab(r: number, g: number, b: number): Lab {
	const lr = linear(r)
	const lg = linear(g)
	const lb = linear(b)
	const fx = labF((0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / D65[0])
	const fy = labF((0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) / D65[1])
	const fz = labF((0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / D65[2])
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const distance2 = (a: Lab, b: Lab) =>
	(a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

type Bin = { weight: number; r: number; g: number; b: number; lab: Lab }

type Sample = {
	/** Pixels counted for colour and tone: the opaque ones. */
	count: number
	bins: Bin[]
	brightness: MediaBrightness
	saturation: MediaSaturation
	/** Lowest alpha anywhere in the sample (255 when there is no alpha). */
	minAlpha: number
}

/**
 * Reads the raw sample once: tone (mean luma, mean saturation) and a 4-bit-per-channel
 * histogram whose bins (sorted by key, so the order never depends on pixel order)
 * feed the clustering. Opaque pixels only; if there are none (a fully transparent
 * image) it falls back to the visible-at-all pixels, then to every pixel, so a
 * decodable image always has a palette.
 */
function readSample(data: Buffer, channels: number): Sample {
	const pixels = Math.floor(data.length / channels)
	const hasAlpha = channels === 2 || channels === 4
	const colour = channels >= 3
	const alphaAt = (i: number) => (hasAlpha ? data[i * channels + channels - 1] : 255)

	let minAlpha = 255
	let opaque = 0
	let visible = 0
	for (let i = 0; i < pixels; i++) {
		const a = alphaAt(i)
		if (a < minAlpha) minAlpha = a
		if (a >= SAMPLE_MIN_ALPHA) opaque++
		if (a > 0) visible++
	}
	const floor = opaque > 0 ? SAMPLE_MIN_ALPHA : visible > 0 ? 1 : 0

	const histogram = new Map<number, { weight: number; r: number; g: number; b: number }>()
	let count = 0
	let lumaSum = 0
	let saturationSum = 0
	for (let i = 0; i < pixels; i++) {
		if (alphaAt(i) < floor) continue
		const at = i * channels
		const r = data[at]
		const g = colour ? data[at + 1] : r
		const b = colour ? data[at + 2] : r
		count++
		lumaSum += 0.2126 * r + 0.7152 * g + 0.0722 * b
		const max = Math.max(r, g, b)
		if (max >= SATURATION_FLOOR_MAX_CHANNEL) saturationSum += (max - Math.min(r, g, b)) / max

		const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
		const bin = histogram.get(key)
		if (bin) {
			bin.weight++
			bin.r += r
			bin.g += g
			bin.b += b
		} else histogram.set(key, { weight: 1, r, g, b })
	}

	const bins: Bin[] = [...histogram.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([, bin]) => {
			const r = bin.r / bin.weight
			const g = bin.g / bin.weight
			const b = bin.b / bin.weight
			return { weight: bin.weight, r, g, b, lab: toLab(r, g, b) }
		})

	const luma = count ? lumaSum / count / 255 : 0
	const saturation = count ? saturationSum / count : 0
	return {
		count,
		bins,
		minAlpha,
		brightness: luma < BRIGHTNESS_DARK ? 'dark' : luma > BRIGHTNESS_LIGHT ? 'light' : 'mid',
		saturation:
			saturation < SATURATION_MONO ? 'monochrome' : saturation >= SATURATION_VIVID ? 'vivid' : 'muted',
	}
}

type Cluster = { weight: number; r: number; g: number; b: number }

/**
 * Deterministic k-means in Lab over the histogram bins. Seeding is weighted
 * farthest-point (the heaviest bin first, then whichever far-away bin carries the
 * most weight x distance), not random, and it stops early once everything is
 * within SPLIT_DISTANCE of a centre, so a solid colour with JPEG noise stays one
 * cluster instead of being split into noise.
 */
function cluster(bins: Bin[]): Cluster[] {
	if (bins.length === 0) return []
	let heaviest = 0
	for (let i = 1; i < bins.length; i++) if (bins[i].weight > bins[heaviest].weight) heaviest = i

	const centres: Lab[] = [[...bins[heaviest].lab]]
	const nearest = bins.map((bin) => distance2(bin.lab, centres[0]))
	while (centres.length < CLUSTERS) {
		let pick = -1
		let best = 0
		for (let i = 0; i < bins.length; i++) {
			if (nearest[i] < SPLIT_DISTANCE ** 2) continue
			const score = bins[i].weight * nearest[i]
			if (score > best) {
				best = score
				pick = i
			}
		}
		if (pick < 0) break
		centres.push([...bins[pick].lab])
		const added = centres[centres.length - 1]
		for (let i = 0; i < bins.length; i++) {
			const d = distance2(bins[i].lab, added)
			if (d < nearest[i]) nearest[i] = d
		}
	}

	const assign = new Int32Array(bins.length).fill(-1)
	for (let round = 0; round < LLOYD_ROUNDS; round++) {
		let changed = false
		for (let i = 0; i < bins.length; i++) {
			let chosen = 0
			let chosenDistance = Number.POSITIVE_INFINITY
			for (let c = 0; c < centres.length; c++) {
				const d = distance2(bins[i].lab, centres[c])
				if (d < chosenDistance) {
					chosenDistance = d
					chosen = c
				}
			}
			if (assign[i] !== chosen) {
				assign[i] = chosen
				changed = true
			}
		}
		if (!changed) break
		const sums = centres.map(() => ({ weight: 0, l: 0, a: 0, b: 0 }))
		for (let i = 0; i < bins.length; i++) {
			const sum = sums[assign[i]]
			sum.weight += bins[i].weight
			sum.l += bins[i].weight * bins[i].lab[0]
			sum.a += bins[i].weight * bins[i].lab[1]
			sum.b += bins[i].weight * bins[i].lab[2]
		}
		sums.forEach((sum, c) => {
			if (sum.weight > 0) centres[c] = [sum.l / sum.weight, sum.a / sum.weight, sum.b / sum.weight]
		})
	}

	const clusters = centres.map(() => ({ weight: 0, r: 0, g: 0, b: 0 }))
	for (let i = 0; i < bins.length; i++) {
		const target = clusters[assign[i]]
		target.weight += bins[i].weight
		target.r += bins[i].weight * bins[i].r
		target.g += bins[i].weight * bins[i].g
		target.b += bins[i].weight * bins[i].b
	}
	return clusters
		.filter((entry) => entry.weight > 0)
		.map((entry) => ({
			weight: entry.weight,
			r: entry.r / entry.weight,
			g: entry.g / entry.weight,
			b: entry.b / entry.weight,
		}))
}

/**
 * Names each cluster, merges clusters that share a name (shares add up; the hex
 * is the biggest member's mean, so `nameColor(hex)` always equals `name`), keeps
 * the top five at 3% or more, and re-normalises so the shares sum to exactly 1.
 */
function paletteOf(clusters: Cluster[], total: number): MediaColor[] {
	const byName = new Map<string, { weight: number; hex: string; biggest: number }>()
	for (const entry of clusters) {
		const hex = rgbToHex(entry.r, entry.g, entry.b)
		const name = nameColor(hex)
		const merged = byName.get(name)
		if (!merged) byName.set(name, { weight: entry.weight, hex, biggest: entry.weight })
		else {
			merged.weight += entry.weight
			if (entry.weight > merged.biggest) {
				merged.biggest = entry.weight
				merged.hex = hex
			}
		}
	}

	const ranked = [...byName.entries()]
		.map(([name, entry]) => ({ name, hex: entry.hex, share: entry.weight / total }))
		.sort((a, b) => b.share - a.share || (a.name < b.name ? -1 : 1))
	let kept = ranked.filter((entry) => entry.share >= MIN_SHARE).slice(0, MAX_COLORS)
	if (kept.length === 0) kept = ranked.slice(0, 1)

	const sum = kept.reduce((acc, entry) => acc + entry.share, 0)
	const colors = kept.map((entry) => ({
		hex: entry.hex,
		name: entry.name,
		share: Math.round((entry.share / sum) * 10_000) / 10_000,
	}))
	// Rounding leaves a few ten-thousandths over or under; settle them on the largest.
	const residual = 1 - colors.reduce((acc, entry) => acc + entry.share, 0)
	colors[0].share = Math.round((colors[0].share + residual) * 10_000) / 10_000
	// Settling the residual can tip two equal shares out of order.
	return colors.sort((a, b) => b.share - a.share || (a.name < b.name ? -1 : 1))
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Decodes once and returns the full `ImageAnalysis`.
 *
 *  - Format and `contentType` come from the DECODED data, never from a file name or
 *    a client header. Anything but jpeg/png/webp/avif/gif -> `UnsupportedImageError`.
 *    Decode with `limitInputPixels` of MEDIA_LIMITS.maxPixels (64 megapixels) so a
 *    decompression bomb cannot exhaust memory; and for an ANIMATED image check the
 *    whole frame stack (`pages x width x height`) against the same ceiling, because
 *    sharp's own limit counts one frame unless told otherwise. Zero-size or
 *    undecodable input -> `UnsupportedImageError`. Any sharp error becomes one.
 *  - `width`/`height` are display dimensions (swap when EXIF orientation is 5..8).
 *    `orientation`: ratio >= 2.4 `panorama`; > 1.05 `landscape`; < 0.95 `portrait`;
 *    else `square` (a tall panorama is just `portrait`).
 *  - `animated`: more than one page/frame. `hasAlpha`: the image has an alpha
 *    channel AND at least one pixel is meaningfully transparent (alpha < 250), so
 *    a fully opaque PNG with an alpha channel is not "transparent".
 *  - `colors`: downsample (about 64px, EXIF-rotated, first frame), ignore
 *    near-transparent pixels, quantise (k-means, up to 6 clusters in Lab,
 *    DETERMINISTIC so the same image always gives the same palette), name each cluster
 *    with `nameColor`, MERGE clusters that share a name (summing shares), keep the top
 *    five with share >= 0.03, shares re-normalised to sum to 1, sorted descending.
 *    Never empty for a decodable image. `hex` is the cluster mean.
 *  - `brightness` / `saturation`: see the calibration notes at the top of the file.
 *  - `sha256`: of the ORIGINAL buffer.
 *  - `blur`: 12px wide, WebP quality 40, as a `data:image/webp;base64,...` URL, or
 *    null if encoding fails (never throw for this).
 *  - Memory: the input, a <= 64px raw sample and the output; `resize` runs before any
 *    pixel is read so a large JPEG is shrunk while decoding.
 */
export async function analyzeImage(buffer: Buffer): Promise<ImageAnalysis> {
	const { contentType, width, height, pages, alphaChannel } = await inspect(buffer)

	let data: Buffer
	let info: sharp.OutputInfo
	try {
		;({ data, info } = await sharp(buffer, INPUT)
			.autoOrient()
			.resize({
				width: SAMPLE_EDGE,
				height: SAMPLE_EDGE,
				fit: 'inside',
				withoutEnlargement: true,
				kernel: 'mitchell',
			})
			.toColourspace('srgb')
			.ensureAlpha()
			.raw({ depth: 'uchar' })
			.toBuffer({ resolveWithObject: true }))
	} catch (error) {
		throw unsupported(error)
	}

	const sample = readSample(data, info.channels)
	const palette = paletteOf(cluster(sample.bins), sample.count)

	// A sample can average a few transparent pixels away, so an opaque-looking sample
	// of an image that has an alpha channel is confirmed on the full-resolution alpha
	// (a streaming pass). A transparent-looking sample is already proof: a mean below
	// 250 means some source pixel was below 250.
	let hasAlpha = false
	if (alphaChannel) {
		if (sample.minAlpha < TRANSPARENT_BELOW) hasAlpha = true
		else {
			try {
				const { channels } = await sharp(buffer, INPUT).stats()
				hasAlpha = channels.length > 0 && channels[channels.length - 1].min < TRANSPARENT_BELOW
			} catch (error) {
				throw unsupported(error)
			}
		}
	}

	return {
		format: MEDIA_FORMAT_BY_TYPE[contentType],
		contentType,
		width,
		height,
		orientation: orientationOf(width, height),
		hasAlpha,
		animated: pages > 1,
		colors: palette,
		brightness: sample.brightness,
		saturation: sample.saturation,
		sha256: createHash('sha256').update(buffer).digest('hex'),
		blur: await blurOf(data, info, hasAlpha),
	}
}

/** Never throws: a placeholder is a nicety, not a reason to refuse an upload. */
async function blurOf(data: Buffer, info: sharp.OutputInfo, keepAlpha: boolean): Promise<string | null> {
	try {
		let pipeline = sharp(data, {
			raw: { width: info.width, height: info.height, channels: info.channels as 4 },
		}).resize({
			width: BLUR_WIDTH,
			height: BLUR_MAX_HEIGHT,
			fit: 'inside',
			withoutEnlargement: true,
		})
		if (!keepAlpha) pipeline = pipeline.removeAlpha()
		const webp = await pipeline.webp({ quality: BLUR_QUALITY }).toBuffer()
		return `data:image/webp;base64,${webp.toString('base64')}`
	} catch {
		return null
	}
}

/**
 * A downscaled JPEG for the vision model: EXIF-rotated, longest edge at most 1024
 * (never enlarged), transparency flattened onto white, quality 80, first frame only
 * for animations. `data` is base64. Avif and gif inputs become jpeg here because the
 * model API does not take avif. Same decode limits and error type as `analyzeImage`.
 */
export async function toVisionJpeg(
	buffer: Buffer,
): Promise<{ data: string; mediaType: 'image/jpeg'; width: number; height: number }> {
	await inspect(buffer)
	try {
		const { data, info } = await sharp(buffer, INPUT)
			.autoOrient()
			.resize({
				width: VISION_EDGE,
				height: VISION_EDGE,
				fit: 'inside',
				withoutEnlargement: true,
			})
			.flatten({ background: '#ffffff' })
			.toColourspace('srgb')
			.jpeg({ quality: VISION_QUALITY })
			.toBuffer({ resolveWithObject: true })
		return {
			data: data.toString('base64'),
			mediaType: 'image/jpeg',
			width: info.width,
			height: info.height,
		}
	} catch (error) {
		throw unsupported(error)
	}
}
