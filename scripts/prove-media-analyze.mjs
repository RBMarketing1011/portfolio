/**
 * Proves src/lib/media/analyze.ts: sharp-based image analysis, the vision JPEG,
 * and the hostile-input behaviour.
 *
 *   node scripts/prove-media-analyze.mjs
 *
 * Every image is generated here with sharp (or by hand, bytes and all, for the
 * hostile ones). Expectations come from the stub's doc comment and the build spec,
 * not from whatever the code returns. Where the code moved a threshold, the check
 * encodes the intended meaning (a mid gray is "mid"), not the old number.
 */
import { createRequire } from 'node:module'
import { createHash, randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const sharp = rootRequire('sharp')

const { analyzeImage, toVisionJpeg, UnsupportedImageError } = loadTs('src/lib/media/analyze.ts')
const { nameColor } = loadTs('src/lib/media/colors.ts')
const { MEDIA_LIMITS } = loadTs('src/lib/media/types.ts')

let passed = 0
let failed = 0

async function check(name, fn) {
	try {
		await fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		console.log(`FAIL  ${name} (${error instanceof Error ? error.message : error})`)
	}
}

const ok = (condition, message) => {
	if (!condition) throw new Error(message)
}
const same = (actual, expected, label = '') => {
	const a = JSON.stringify(actual)
	const e = JSON.stringify(expected)
	if (a !== e) throw new Error(`${label ? `${label}: ` : ''}expected ${e}, got ${a}`)
}
const near = (actual, expected, tolerance, label = '') => {
	if (Math.abs(actual - expected) > tolerance)
		throw new Error(`${label ? `${label}: ` : ''}expected ${expected} +- ${tolerance}, got ${actual}`)
}

/* -------------------------------------------------------------------------- */
/* Generators                                                                 */
/* -------------------------------------------------------------------------- */

const hexRgb = (hex) => {
	const n = Number.parseInt(hex.replace('#', ''), 16)
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Raw RGBA from a per-pixel function (x, y) -> [r, g, b, a]. */
function rawRgba(width, height, fn) {
	const data = Buffer.alloc(width * height * 4)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const [r, g, b, a = 255] = fn(x, y)
			const at = (y * width + x) * 4
			data[at] = r
			data[at + 1] = g
			data[at + 2] = b
			data[at + 3] = a
		}
	}
	return data
}

const fromRaw = (data, width, height, channels = 4) =>
	sharp(data, { raw: { width, height, channels } })

const solidRaw = (hex, width = 32, height = 32) => {
	const rgb = hexRgb(hex)
	return fromRaw(rawRgba(width, height, () => rgb), width, height)
}
const encode = (image, format, options = {}) => {
	switch (format) {
		case 'jpg':
			return image.removeAlpha().jpeg({ quality: 95, ...options }).toBuffer()
		case 'png':
			return image.png(options).toBuffer()
		case 'webp':
			return image.webp({ lossless: true, ...options }).toBuffer()
		case 'avif':
			return image.avif({ quality: 90, ...options }).toBuffer()
		case 'gif':
			return image.gif(options).toBuffer()
		default:
			throw new Error(`bad format ${format}`)
	}
}
const solid = (hex, format = 'png', width = 32, height = 32) =>
	encode(solidRaw(hex, width, height), format)

/** Two halves side by side (or top/bottom). */
const split = (left, right, format = 'png', width = 100, height = 60) => {
	const l = hexRgb(left)
	const r = hexRgb(right)
	return encode(
		fromRaw(rawRgba(width, height, (x) => (x < width / 2 ? l : r)), width, height),
		format,
	)
}

const blank = (width, height, hex = '#336699', format = 'png') =>
	solid(hex, format, width, height)

const gradient = (format = 'png') =>
	encode(fromRaw(rawRgba(256, 32, (x) => [x, x, x]), 256, 32), format)

/** Left half rgb(255,0,0) at alpha 0 (a hidden colour), right half rgb(0,128,0) opaque. */
const halfTransparent = () =>
	encode(
		fromRaw(rawRgba(64, 64, (x) => (x < 32 ? [255, 0, 0, 0] : [0, 128, 0, 255])), 64, 64),
		'png',
	)

const opaqueWithAlphaChannel = (hex = '#2f6fed') =>
	encode(solidRaw(hex, 40, 40), 'png') // raw RGBA in, alpha channel kept, every alpha 255

const withExif = async (width, height, orientation, format = 'jpg') => {
	// Left half red, right half blue, so a rotation is visible in the raw data too.
	const image = fromRaw(
		rawRgba(width, height, (x) => (x < width / 2 ? [255, 0, 0] : [0, 0, 255])),
		width,
		height,
	)
	const out =
		format === 'jpg'
			? image.removeAlpha().jpeg({ quality: 95 })
			: format === 'png'
				? image.png()
				: image.webp({ lossless: true })
	return out.withMetadata({ orientation }).toBuffer()
}

const animatedGif = async (frames = 3, size = 10) => {
	const colors = [
		[255, 0, 0],
		[0, 255, 0],
		[0, 0, 255],
		[255, 255, 0],
	]
	const raw = Buffer.alloc(size * size * frames * 3)
	for (let f = 0; f < frames; f++) {
		const [r, g, b] = colors[f % colors.length]
		for (let i = 0; i < size * size; i++) {
			const at = (f * size * size + i) * 3
			raw[at] = r
			raw[at + 1] = g
			raw[at + 2] = b
		}
	}
	return sharp(raw, { raw: { width: size, height: size * frames, channels: 3, pageHeight: size } })
		.gif({ loop: 0, delay: Array(frames).fill(100) })
		.toBuffer()
}

const animatedWebp = (frames = 3, size = 16) => {
	const raw = Buffer.alloc(size * size * frames * 3)
	for (let f = 0; f < frames; f++)
		for (let i = 0; i < size * size; i++) raw[(f * size * size + i) * 3 + (f % 3)] = 255
	return sharp(raw, { raw: { width: size, height: size * frames, channels: 3, pageHeight: size } })
		.webp({ loop: 0, delay: Array(frames).fill(100), lossless: true })
		.toBuffer()
}

/** Valid-looking GIF with `frames` full-canvas frames and no real pixel data, to test the stack ceiling. */
function craftedGif(width, height, frames) {
	const u16 = (n) => Buffer.from([n & 255, n >> 8])
	const parts = [
		Buffer.from('GIF89a'),
		u16(width),
		u16(height),
		Buffer.from([0x80, 0, 0, 0, 0, 0, 255, 255, 255]),
	]
	for (let i = 0; i < frames; i++) {
		parts.push(Buffer.from([0x21, 0xf9, 4, 0, 10, 0, 0, 0]))
		parts.push(
			Buffer.from([0x2c]),
			u16(0),
			u16(0),
			u16(width),
			u16(height),
			Buffer.from([0, 2, 2, 0x4c, 0x01, 0]),
		)
	}
	parts.push(Buffer.from([0x3b]))
	return Buffer.concat(parts)
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c >>> 0
	}
	return table
})()
const crc32 = (buffer) => {
	let c = 0xffffffff
	for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

/** A tiny real PNG whose IHDR is rewritten to claim another size, with a valid CRC. */
async function forgedPng(width, height) {
	const png = Buffer.from(await solid('#808080', 'png', 8, 8))
	png.writeUInt32BE(width, 16)
	png.writeUInt32BE(height, 20)
	png.writeUInt32BE(crc32(png.subarray(12, 29)), 29)
	return png
}

const decodeBlur = async (url) => {
	ok(typeof url === 'string' && url.startsWith('data:image/webp;base64,'), `bad blur prefix: ${String(url).slice(0, 30)}`)
	const bytes = Buffer.from(url.slice('data:image/webp;base64,'.length), 'base64')
	const meta = await sharp(bytes).metadata()
	ok(meta.format === 'webp', `blur decodes as ${meta.format}`)
	return meta
}

const rejects = async (promiseFactory, label) => {
	try {
		await promiseFactory()
	} catch (error) {
		ok(error instanceof UnsupportedImageError, `${label}: threw ${error?.constructor?.name}: ${error?.message}`)
		ok(error.name === 'UnsupportedImageError', `${label}: name ${error.name}`)
		return error
	}
	throw new Error(`${label}: did not throw`)
}

const share = (a, name) => a.colors.find((c) => c.name === name)?.share ?? 0
const shareSum = (a) => a.colors.reduce((s, c) => s + c.share, 0)

/* -------------------------------------------------------------------------- */
/* Format and size                                                            */
/* -------------------------------------------------------------------------- */

const FORMATS = [
	['jpg', 'image/jpeg'],
	['png', 'image/png'],
	['webp', 'image/webp'],
	['avif', 'image/avif'],
	['gif', 'image/gif'],
]

for (const [format, contentType] of FORMATS) {
	await check(`format: ${format} is decoded as ${contentType}`, async () => {
		const result = await analyzeImage(await solid('#e02424', format, 50, 30))
		same(result.format, format)
		same(result.contentType, contentType)
		same([result.width, result.height], [50, 30])
		same(result.orientation, 'landscape')
	})
}

await check('format comes from the bytes: every format analysed from a buffer with no name at all', async () => {
	// The API takes only bytes, so a lying extension cannot influence it; prove the
	// answer follows the content by swapping which encoder made the bytes.
	const asPng = await analyzeImage(await solid('#2f6fed', 'png'))
	const asJpg = await analyzeImage(await solid('#2f6fed', 'jpg'))
	ok(asPng.format === 'png' && asJpg.format === 'jpg', `${asPng.format} / ${asJpg.format}`)
})

await check('format: a PNG named like a JPEG but fed as JPEG-looking bytes is still judged by its content', async () => {
	const png = await solid('#2f6fed', 'png')
	// Same bytes, so the result cannot depend on anything but them.
	same((await analyzeImage(Buffer.from(png))).contentType, 'image/png')
})

await check('dimensions: sizes survive for 1x1 and for a very wide strip', async () => {
	same(
		(await analyzeImage(await blank(1, 1))).orientation,
		'square',
	)
	const strip = await analyzeImage(await blank(2000, 10))
	same([strip.width, strip.height], [2000, 10])
	same(strip.orientation, 'panorama')
})

/* -------------------------------------------------------------------------- */
/* EXIF orientation                                                           */
/* -------------------------------------------------------------------------- */

for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
	await check(`exif: orientation ${orientation} jpeg 40x20 -> ${orientation >= 5 ? '20x40' : '40x20'}`, async () => {
		const result = await analyzeImage(await withExif(40, 20, orientation))
		same([result.width, result.height], orientation >= 5 ? [20, 40] : [40, 20])
		same(result.orientation, orientation >= 5 ? 'portrait' : 'landscape')
	})
}

await check('exif: orientation is honoured in png and webp too', async () => {
	for (const format of ['png', 'webp']) {
		const result = await analyzeImage(await withExif(40, 20, 6, format))
		same([result.width, result.height], [20, 40], format)
	}
})

await check('exif: avif with orientation 6 reports the displayed size', async () => {
	const avif = await sharp(await solid('#2f6fed', 'png', 40, 20))
		.avif()
		.withMetadata({ orientation: 6 })
		.toBuffer()
	const displayed = await sharp(avif).autoOrient().raw().toBuffer({ resolveWithObject: true })
	const result = await analyzeImage(avif)
	same([result.width, result.height], [displayed.info.width, displayed.info.height])
})

await check('exif: the palette is sampled after rotation (same shares as the unrotated image)', async () => {
	const rotated = await analyzeImage(await withExif(80, 40, 6))
	same(rotated.colors.map((c) => c.name).sort(), ['blue', 'red'])
	near(share(rotated, 'red'), 0.5, 0.06)
	near(share(rotated, 'blue'), 0.5, 0.06)
})

/* -------------------------------------------------------------------------- */
/* Orientation classes                                                        */
/* -------------------------------------------------------------------------- */

const ORIENTATIONS = [
	[1, 1, 'square'],
	[20, 20, 'square'],
	[21, 20, 'square'], // ratio 1.05 is not > 1.05
	[22, 20, 'landscape'],
	[19, 20, 'square'], // ratio 0.95 is not < 0.95
	[18, 20, 'portrait'],
	[239, 100, 'landscape'],
	[24, 10, 'panorama'], // ratio 2.4 is >= 2.4
	[25, 10, 'panorama'],
	[10, 24, 'portrait'], // a tall panorama is just portrait
	[10, 100, 'portrait'],
	[100, 50, 'landscape'],
	[100, 40, 'panorama'],
	[3, 2, 'landscape'],
	[2, 3, 'portrait'],
]
for (const [w, h, expected] of ORIENTATIONS) {
	await check(`orientation: ${w}x${h} is ${expected}`, async () => {
		same((await analyzeImage(await blank(w, h))).orientation, expected)
	})
}

await check('orientation: judged on display dimensions (a 30x10 jpeg tagged 6 is portrait 10x30)', async () => {
	const result = await analyzeImage(await withExif(30, 10, 6))
	same([result.width, result.height], [10, 30])
	same(result.orientation, 'portrait')
})

/* -------------------------------------------------------------------------- */
/* Palette                                                                    */
/* -------------------------------------------------------------------------- */

const SOLIDS = [
	['#ff0000', 'red'],
	['#00a000', 'green'],
	['#0000ff', 'blue'],
	['#000000', 'black'],
	['#ffffff', 'white'],
	['#808080', 'gray'],
]
for (const [hex, name] of SOLIDS) {
	for (const format of ['png', 'jpg', 'webp']) {
		await check(`palette: solid ${name} (${format}) is one colour with share 1`, async () => {
			const result = await analyzeImage(await solid(hex, format))
			same(result.colors.length, 1)
			same(result.colors[0].name, name)
			near(result.colors[0].share, 1, 1e-9)
			ok(/^#[0-9a-f]{6}$/.test(result.colors[0].hex), `hex ${result.colors[0].hex}`)
			same(nameColor(result.colors[0].hex), name, 'hex names back to its name')
		})
	}
}

await check('palette: a solid png keeps its exact hex', async () => {
	same((await analyzeImage(await solid('#2f6fed', 'png'))).colors[0].hex, '#2f6fed')
})

await check('palette: two-colour split gives both names at about half each, summing to 1', async () => {
	const result = await analyzeImage(await split('#ff0000', '#0000ff'))
	same(result.colors.map((c) => c.name).sort(), ['blue', 'red'])
	near(share(result, 'red'), 0.5, 0.05)
	near(share(result, 'blue'), 0.5, 0.05)
	near(shareSum(result), 1, 1e-6)
})

await check('palette: an uneven split reports uneven shares, largest first', async () => {
	const data = rawRgba(100, 100, (x) => (x < 75 ? [0, 160, 0] : [255, 255, 255]))
	const result = await analyzeImage(await encode(fromRaw(data, 100, 100), 'png'))
	same(result.colors[0].name, 'green')
	near(result.colors[0].share, 0.75, 0.05)
	near(result.colors[1].share, 0.25, 0.05)
})

await check('palette: colours of the same name merge (dark red + red is one red)', async () => {
	const result = await analyzeImage(await split('#e02424', '#8b0000'))
	same(result.colors.length, 1)
	same(result.colors[0].name, 'red')
	near(result.colors[0].share, 1, 1e-9)
})

await check('palette: names are unique and from the curated list', async () => {
	const data = rawRgba(120, 40, (x) => {
		const stripe = Math.floor(x / 15)
		return [
			[255, 0, 0],
			[255, 140, 0],
			[255, 235, 0],
			[0, 160, 0],
			[0, 100, 255],
			[130, 40, 170],
			[255, 105, 180],
			[110, 70, 30],
		][stripe]
	})
	const result = await analyzeImage(await encode(fromRaw(data, 120, 40), 'png'))
	const names = result.colors.map((c) => c.name)
	same(new Set(names).size, names.length, 'unique names')
	for (const name of names)
		ok(
			['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'navy', 'purple', 'pink', 'brown', 'beige', 'gray', 'black', 'white'].includes(name),
			`unknown name ${name}`,
		)
})

await check('palette: capped at five even with eight equal stripes; shares sum to 1; sorted descending', async () => {
	const data = rawRgba(160, 40, (x) =>
		[
			[255, 0, 0],
			[255, 140, 0],
			[255, 235, 0],
			[0, 160, 0],
			[0, 100, 255],
			[130, 40, 170],
			[255, 105, 180],
			[110, 70, 30],
		][Math.floor(x / 20)],
	)
	const result = await analyzeImage(await encode(fromRaw(data, 160, 40), 'png'))
	ok(result.colors.length <= 5, `${result.colors.length} colours`)
	ok(result.colors.length >= 3, `only ${result.colors.length} colours for a rainbow`)
	near(shareSum(result), 1, 1e-6)
	for (let i = 1; i < result.colors.length; i++)
		ok(result.colors[i - 1].share >= result.colors[i].share, 'not sorted descending')
	for (const color of result.colors) ok(color.share >= 0.03, `share ${color.share} below 0.03`)
})

await check('palette: a 1% speck is dropped (below 3%), the main colour is renormalised to 1', async () => {
	const data = rawRgba(200, 200, (x, y) => (x < 4 && y < 20 ? [255, 0, 0] : [255, 255, 255]))
	const result = await analyzeImage(await encode(fromRaw(data, 200, 200), 'png'))
	ok(!result.colors.some((c) => c.name === 'red'), 'the speck survived')
	same(result.colors[0].name, 'white')
	near(shareSum(result), 1, 1e-6)
})

await check('palette: a 15% region is kept', async () => {
	const data = rawRgba(100, 100, (x) => (x < 15 ? [255, 0, 0] : [255, 255, 255]))
	const result = await analyzeImage(await encode(fromRaw(data, 100, 100), 'png'))
	near(share(result, 'red'), 0.15, 0.05)
})

await check('palette: a gradient yields several tones and is never empty', async () => {
	const result = await analyzeImage(await gradient('png'))
	ok(result.colors.length >= 2, `${result.colors.length} colours`)
	near(shareSum(result), 1, 1e-6)
	for (const color of result.colors) ok(['black', 'gray', 'white'].includes(color.name), color.name)
})

await check('palette: 1x1 image has a palette', async () => {
	const result = await analyzeImage(await blank(1, 1, '#ff0000'))
	same(result.colors.map((c) => c.name), ['red'])
})

await check('palette: tiny images (2x2 with four colours) work', async () => {
	const data = rawRgba(2, 2, (x, y) => [[255, 0, 0], [0, 160, 0], [0, 0, 255], [255, 255, 255]][y * 2 + x])
	const result = await analyzeImage(await encode(fromRaw(data, 2, 2), 'png'))
	same(result.colors.length, 4)
	near(shareSum(result), 1, 1e-6)
})

await check('palette: deterministic across runs (photo-like noise, 5 repeats)', async () => {
	const noise = await sharp({
		create: { width: 300, height: 200, channels: 3, noise: { type: 'gaussian', mean: 120, sigma: 70 } },
	})
		.jpeg()
		.toBuffer()
	const first = await analyzeImage(noise)
	for (let i = 0; i < 5; i++) same(await analyzeImage(noise), first, `run ${i}`)
})

await check('palette: deterministic across 20 concurrent runs', async () => {
	const image = await split('#ff0000', '#0000ff')
	const serial = await analyzeImage(image)
	const parallel = await Promise.all(Array.from({ length: 20 }, () => analyzeImage(image)))
	for (const result of parallel) same(result, serial)
})

await check('palette: noisy near-solid colour stays one colour', async () => {
	// JPEG noise on a flat blue must not be split into spurious clusters.
	const noisy = await sharp({
		create: { width: 200, height: 200, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 6 } },
	})
		.tint({ r: 20, g: 60, b: 200 })
		.jpeg({ quality: 60 })
		.toBuffer()
	const result = await analyzeImage(noisy)
	ok(result.colors.length <= 2, `${result.colors.length} colours: ${JSON.stringify(result.colors)}`)
})

await check('palette: grayscale, 16-bit and CMYK inputs decode to a sane palette', async () => {
	const gray = await sharp(await solid('#808080', 'png', 20, 20)).removeAlpha().toColourspace('b-w').png().toBuffer()
	same((await sharp(gray).metadata()).channels, 1, 'fixture really is 1 channel')
	const g = await analyzeImage(gray)
	same(g.colors[0].name, 'gray')
	same(g.saturation, 'monochrome')

	const wide = await sharp(await solid('#ff0000', 'png', 20, 20)).toColourspace('rgb16').png().toBuffer()
	const w = await analyzeImage(wide)
	same(w.colors[0].name, 'red')

	const cmyk = await sharp(await solid('#ff0000', 'png', 20, 20)).toColourspace('cmyk').jpeg().toBuffer()
	const c = await analyzeImage(cmyk)
	ok(c.colors.length >= 1, 'cmyk gave no palette')
	same(c.format, 'jpg')
})

await check('palette: palette-indexed png (8-bit) works', async () => {
	const indexed = await sharp(await split('#ff0000', '#0000ff')).png({ palette: true, colours: 4 }).toBuffer()
	const result = await analyzeImage(indexed)
	same(result.colors.map((c) => c.name).sort(), ['blue', 'red'])
})

/* -------------------------------------------------------------------------- */
/* Tone                                                                       */
/* -------------------------------------------------------------------------- */

const BRIGHTNESS = [
	['#000000', 'dark'],
	['#222222', 'dark'],
	['#404040', 'dark'],
	['#808080', 'mid'], // a plain mid gray is mid (linear luminance would call it dark)
	['#a0a0a0', 'mid'],
	['#d0d0d0', 'light'],
	['#ffffff', 'light'],
]
for (const [hex, expected] of BRIGHTNESS) {
	await check(`brightness: ${hex} is ${expected}`, async () => {
		same((await analyzeImage(await solid(hex))).brightness, expected)
	})
}

await check('brightness: a half-black half-white image is mid', async () => {
	same((await analyzeImage(await split('#000000', '#ffffff'))).brightness, 'mid')
})

await check('brightness: bright colours are judged by luma (yellow light, navy dark, pure blue dark)', async () => {
	same((await analyzeImage(await solid('#ffff00'))).brightness, 'light')
	same((await analyzeImage(await solid('#0f1f4d'))).brightness, 'dark')
	same((await analyzeImage(await solid('#0000ff'))).brightness, 'dark')
})

const SATURATION = [
	['#ff0000', 'vivid'],
	['#0000ff', 'vivid'],
	['#2f6fed', 'vivid'],
	['#c9a0a0', 'muted'],
	['#8f9fb8', 'muted'],
	['#808080', 'monochrome'],
	['#000000', 'monochrome'],
	['#ffffff', 'monochrome'],
	['#818180', 'monochrome'],
]
for (const [hex, expected] of SATURATION) {
	await check(`saturation: ${hex} is ${expected}`, async () => {
		same((await analyzeImage(await solid(hex))).saturation, expected)
	})
}

await check('saturation: a near-black noisy photo is not "vivid" (HSV saturation is unstable near black)', async () => {
	const data = rawRgba(64, 64, (x, y) => [(x * 7 + y) % 3, (x + y * 5) % 2, (x * 3 + y * 11) % 5])
	const result = await analyzeImage(await encode(fromRaw(data, 64, 64), 'png'))
	same(result.saturation, 'monochrome')
	same(result.brightness, 'dark')
})

await check('saturation: a black-to-white gradient is monochrome', async () => {
	same((await analyzeImage(await gradient())).saturation, 'monochrome')
})

await check('saturation: a red-to-blue gradient is vivid', async () => {
	const data = rawRgba(256, 16, (x) => [255 - x, 0, x])
	const result = await analyzeImage(await encode(fromRaw(data, 256, 16), 'png'))
	same(result.saturation, 'vivid')
})

/* -------------------------------------------------------------------------- */
/* Alpha                                                                      */
/* -------------------------------------------------------------------------- */

await check('alpha: a PNG with real transparency has hasAlpha', async () => {
	same((await analyzeImage(await halfTransparent())).hasAlpha, true)
})

await check('alpha: an opaque PNG that carries an alpha channel is NOT transparent', async () => {
	const png = await opaqueWithAlphaChannel()
	same((await sharp(png).metadata()).hasAlpha, true, 'fixture really has an alpha channel')
	same((await analyzeImage(png)).hasAlpha, false)
})

await check('alpha: a PNG without an alpha channel is not transparent', async () => {
	same((await analyzeImage(await sharp(await solid('#ff0000')).removeAlpha().png().toBuffer())).hasAlpha, false)
})

await check('alpha: opaque jpeg is false; lossless webp with transparency is true', async () => {
	same((await analyzeImage(await solid('#ff0000', 'jpg'))).hasAlpha, false)
	const webp = await encode(
		fromRaw(rawRgba(40, 40, (x) => (x < 20 ? [255, 0, 0, 0] : [0, 0, 255, 255])), 40, 40),
		'webp',
	)
	same((await analyzeImage(webp)).hasAlpha, true)
})

await check('alpha: threshold is 250 (alpha 249 everywhere is transparent, 250 is not)', async () => {
	const make = (a) => encode(fromRaw(rawRgba(30, 30, () => [10, 200, 30, a]), 30, 30), 'png')
	same((await analyzeImage(await make(249))).hasAlpha, true, 'alpha 249')
	same((await analyzeImage(await make(250))).hasAlpha, false, 'alpha 250')
	same((await analyzeImage(await make(254))).hasAlpha, false, 'alpha 254')
	same((await analyzeImage(await make(128))).hasAlpha, true, 'alpha 128')
})

await check('alpha: ONE transparent pixel in a 2000x2000 image is still found (the sample would average it away)', async () => {
	const w = 2000
	const data = rawRgba(w, w, (x, y) => (x === 1000 && y === 1000 ? [0, 0, 0, 0] : [30, 90, 200, 255]))
	const png = await sharp(data, { raw: { width: w, height: w, channels: 4 } }).png({ compressionLevel: 1 }).toBuffer()
	const result = await analyzeImage(png)
	same(result.hasAlpha, true)
	same(result.colors[0].name, 'blue')
})

await check('alpha: transparent pixels are ignored for colours (hidden red under alpha 0 is not red)', async () => {
	const result = await analyzeImage(await halfTransparent())
	same(result.colors.map((c) => c.name), ['green'])
	near(result.colors[0].share, 1, 1e-9)
	same(result.brightness, 'mid', 'tone of the visible green only')
})

await check('alpha: a semi-transparent drop-shadow does not become a palette colour of its own', async () => {
	const data = rawRgba(100, 100, (x) => (x < 80 ? [255, 0, 0, 255] : [0, 0, 0, 40]))
	const result = await analyzeImage(await encode(fromRaw(data, 100, 100), 'png'))
	same(result.colors.map((c) => c.name), ['red'])
	same(result.hasAlpha, true)
})

await check('alpha: a fully transparent image is analysable and still has a palette', async () => {
	const png = await encode(fromRaw(rawRgba(20, 20, () => [0, 0, 0, 0]), 20, 20), 'png')
	const result = await analyzeImage(png)
	same(result.hasAlpha, true)
	ok(result.colors.length >= 1, 'empty palette')
	near(shareSum(result), 1, 1e-6)
})

await check('alpha: transparent gif is true, opaque gif is false', async () => {
	const transparent = await sharp(await halfTransparent()).gif().toBuffer()
	same((await analyzeImage(transparent)).hasAlpha, true)
	same((await analyzeImage(await solid('#ff0000', 'gif'))).hasAlpha, false)
})

/* -------------------------------------------------------------------------- */
/* Animation                                                                  */
/* -------------------------------------------------------------------------- */

await check('animated: a 3-frame gif is animated, analysed on the first frame (red)', async () => {
	const result = await analyzeImage(await animatedGif(3))
	same(result.animated, true)
	same(result.format, 'gif')
	same([result.width, result.height], [10, 10])
	same(result.colors.map((c) => c.name), ['red'])
})

await check('animated: a 2-frame webp is animated at the frame size', async () => {
	const result = await analyzeImage(await animatedWebp(2, 16))
	same(result.animated, true)
	same([result.width, result.height], [16, 16])
})

await check('animated: a single-frame gif and a still webp are not animated', async () => {
	same((await analyzeImage(await solid('#ff0000', 'gif'))).animated, false)
	same((await analyzeImage(await solid('#ff0000', 'webp'))).animated, false)
	same((await analyzeImage(await solid('#ff0000', 'png'))).animated, false)
})

await check('animated: size reported is one frame, not the stack', async () => {
	const result = await analyzeImage(await animatedGif(4, 12))
	same([result.width, result.height], [12, 12])
})

/* -------------------------------------------------------------------------- */
/* Digest, blur                                                               */
/* -------------------------------------------------------------------------- */

await check('sha256 is the digest of the original bytes, for every format', async () => {
	for (const [format] of FORMATS) {
		const bytes = await solid('#2f6fed', format, 24, 24)
		same((await analyzeImage(bytes)).sha256, createHash('sha256').update(bytes).digest('hex'), format)
	}
})

await check('sha256: differs for one changed byte and ignores nothing (exif-rotated jpeg hashes the file, not the pixels)', async () => {
	const a = await withExif(40, 20, 6)
	const b = await withExif(40, 20, 1)
	const ra = await analyzeImage(a)
	const rb = await analyzeImage(b)
	ok(ra.sha256 !== rb.sha256, 'different files, same hash')
	same(ra.sha256, createHash('sha256').update(a).digest('hex'))
})

await check('analysis does not modify the input buffer', async () => {
	const input = await split('#ff0000', '#0000ff')
	const copy = Buffer.from(input)
	await analyzeImage(input)
	ok(input.equals(copy), 'input mutated')
})

const BLUR_FIXTURES = async () => ({
	solid: await solid('#2f6fed', 'png', 400, 300),
	noise: await sharp({
		create: { width: 800, height: 600, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 90 } },
	})
		.png()
		.toBuffer(),
	tall: await blank(20, 2000),
	panorama: await blank(4000, 20),
	tiny: await blank(1, 1),
	transparent: await halfTransparent(),
	gif: await animatedGif(3),
	avif: await solid('#e02424', 'avif', 200, 100),
})

for (const [label, bytes] of Object.entries(await BLUR_FIXTURES())) {
	await check(`blur: ${label} is a small data:image/webp URL (< 600 bytes) that decodes`, async () => {
		const { blur } = await analyzeImage(bytes)
		ok(blur !== null, 'blur is null')
		ok(blur.length < 600, `${blur.length} bytes`)
		const meta = await decodeBlur(blur)
		ok(meta.width <= 12, `width ${meta.width}`)
	})
}

await check('blur: 12px wide for an ordinary image, and keeps the aspect ratio', async () => {
	const meta = await decodeBlur((await analyzeImage(await blank(400, 200))).blur)
	same([meta.width, meta.height], [12, 6])
})

await check('blur: transparent image keeps transparency, opaque image drops the alpha channel', async () => {
	const withAlpha = await decodeBlur((await analyzeImage(await halfTransparent())).blur)
	same(withAlpha.hasAlpha, true)
	const opaque = await decodeBlur((await analyzeImage(await opaqueWithAlphaChannel())).blur)
	same(opaque.hasAlpha, false)
})

await check('blur: never throws (bad internals are absorbed, result is string or null)', async () => {
	const { blur } = await analyzeImage(await blank(3, 3))
	ok(blur === null || typeof blur === 'string', 'type')
})

/* -------------------------------------------------------------------------- */
/* toVisionJpeg                                                               */
/* -------------------------------------------------------------------------- */

const decodeJpeg = async (result) => {
	same(result.mediaType, 'image/jpeg')
	const bytes = Buffer.from(result.data, 'base64')
	const meta = await sharp(bytes).metadata()
	same(meta.format, 'jpeg')
	same([meta.width, meta.height], [result.width, result.height], 'reported size matches decoded size')
	return { bytes, meta }
}

await check('vision: 3000x2000 is scaled to a longest edge of 1024 (1024x683)', async () => {
	const result = await toVisionJpeg(await blank(3000, 2000))
	await decodeJpeg(result)
	same([result.width, result.height], [1024, 683])
})

await check('vision: tall 1000x4000 is scaled to 256x1024', async () => {
	const result = await toVisionJpeg(await blank(1000, 4000))
	same(Math.max(result.width, result.height), 1024)
	same([result.width, result.height], [256, 1024])
})

await check('vision: a small image is never enlarged', async () => {
	const result = await toVisionJpeg(await blank(100, 50))
	await decodeJpeg(result)
	same([result.width, result.height], [100, 50])
})

await check('vision: exactly 1024 and 1025 on the long edge', async () => {
	same([(await toVisionJpeg(await blank(1024, 512))).width, (await toVisionJpeg(await blank(1024, 512))).height], [1024, 512])
	const over = await toVisionJpeg(await blank(1025, 513))
	ok(Math.max(over.width, over.height) <= 1024, `${over.width}x${over.height}`)
})

await check('vision: transparency is flattened onto white', async () => {
	const result = await toVisionJpeg(
		await encode(fromRaw(rawRgba(40, 40, () => [255, 0, 0, 0]), 40, 40), 'png'),
	)
	const { bytes } = await decodeJpeg(result)
	const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
	for (let i = 0; i < data.length; i++) ok(data[i] >= 250, `channel value ${data[i]} is not white`)
})

await check('vision: half-transparent png keeps the opaque half and whitens the rest', async () => {
	const result = await toVisionJpeg(await halfTransparent())
	const { bytes } = await decodeJpeg(result)
	const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
	const px = (x, y) => [0, 1, 2].map((c) => data[(y * info.width + x) * info.channels + c])
	const left = px(4, 32)
	const right = px(info.width - 5, 32)
	ok(left.every((v) => v >= 245), `left ${left}`)
	ok(right[1] > right[0] + 60 && right[1] > right[2] + 60, `right ${right} is not green`)
})

for (const [format] of [['avif'], ['gif'], ['webp'], ['png'], ['jpg']]) {
	await check(`vision: ${format} input becomes a decodable jpeg`, async () => {
		const result = await toVisionJpeg(await solid('#2f6fed', format, 64, 48))
		await decodeJpeg(result)
		same([result.width, result.height], [64, 48])
	})
}

await check('vision: animated gif uses the first frame (red)', async () => {
	const result = await toVisionJpeg(await animatedGif(3))
	const { bytes } = await decodeJpeg(result)
	const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
	ok(data[0] > 200 && data[1] < 60 && data[2] < 60, `first pixel ${data[0]},${data[1]},${data[2]}`)
})

await check('vision: EXIF orientation 6 is applied (40x20 -> 20x40)', async () => {
	const result = await toVisionJpeg(await withExif(40, 20, 6))
	same([result.width, result.height], [20, 40])
	await decodeJpeg(result)
})

await check('vision: grayscale, 16-bit and CMYK sources produce jpegs', async () => {
	const gray = await sharp(await solid('#808080', 'png', 20, 20)).removeAlpha().toColourspace('b-w').png().toBuffer()
	const wide = await sharp(await solid('#ff0000', 'png', 20, 20)).toColourspace('rgb16').png().toBuffer()
	const cmyk = await sharp(await solid('#ff0000', 'png', 20, 20)).toColourspace('cmyk').jpeg().toBuffer()
	for (const input of [gray, wide, cmyk]) await decodeJpeg(await toVisionJpeg(input))
})

await check('vision: output is a reasonable size (a 4000x3000 noise photo stays well under 1 MB)', async () => {
	const noise = await sharp({
		create: { width: 2000, height: 1500, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } },
	})
		.jpeg({ quality: 70 })
		.toBuffer()
	const result = await toVisionJpeg(noise)
	ok(Buffer.from(result.data, 'base64').length < 1_000_000, 'too large')
	same(Math.max(result.width, result.height), 1024)
})

/* -------------------------------------------------------------------------- */
/* Hostile input                                                              */
/* -------------------------------------------------------------------------- */

const rssMb = () => process.memoryUsage().rss / 1e6

const HOSTILE = async () => {
	const png = await solid('#2f6fed', 'png', 200, 200)
	const noisy = await sharp({
		create: { width: 400, height: 400, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 80 } },
	})
		.png()
		.toBuffer()
	return {
		'empty buffer': Buffer.alloc(0),
		'one byte': Buffer.from([0]),
		'random bytes': randomBytes(2048),
		'text file': Buffer.from('this is definitely not an image, just some text\n'.repeat(20)),
		'html page': Buffer.from('<!doctype html><html><body><img src=x></body></html>'),
		'svg image': Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>',
		),
		'svg with script': Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script></svg>',
		),
		'truncated png (half)': noisy.subarray(0, noisy.length >> 1),
		'png signature only': png.subarray(0, 8),
		'png header only': png.subarray(0, 33),
		'zeroed bytes': Buffer.alloc(4096),
		'tiff': await sharp(png).tiff().toBuffer(),
		'pdf-ish': Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
		'png claiming 60000x60000': await forgedPng(60000, 60000),
		'png claiming 65535x65535': await forgedPng(65535, 65535),
		'png one pixel over the ceiling': await forgedPng(8001, 8000),
		'png claiming 0 width': await forgedPng(0, 10),
		'gif stack over the ceiling (3000x3000 x 8 frames)': craftedGif(3000, 3000, 8),
		'gif stack over the ceiling (200x200 x 2000 frames)': craftedGif(200, 200, 2000),
		'gif single frame over the ceiling': craftedGif(9000, 9000, 1),
	}
}

for (const [label, bytes] of Object.entries(await HOSTILE())) {
	await check(`hostile: ${label} -> UnsupportedImageError from both entry points, quickly, without big allocation`, async () => {
		const before = rssMb()
		const started = performance.now()
		await rejects(() => analyzeImage(bytes), 'analyzeImage')
		await rejects(() => toVisionJpeg(bytes), 'toVisionJpeg')
		const ms = performance.now() - started
		const grew = rssMb() - before
		ok(ms < 1500, `took ${Math.round(ms)} ms`)
		ok(grew < 150, `rss grew ${Math.round(grew)} MB`)
	})
}

await check('hostile: non-buffer input is the same error type (undefined, null, string, number, object)', async () => {
	for (const bad of [undefined, null, 'hello', 42, {}, []])
		await rejects(() => analyzeImage(bad), `analyzeImage(${JSON.stringify(bad)})`)
	for (const bad of [undefined, null, 'hello'])
		await rejects(() => toVisionJpeg(bad), `toVisionJpeg(${JSON.stringify(bad)})`)
})

await check('hostile: the error carries a fixed, safe message (no sharp internals)', async () => {
	const error = await rejects(() => analyzeImage(randomBytes(512)), 'random')
	ok(!/sharp|vips|libspng|buffer/i.test(error.message), error.message)
})

await check('hostile: a real animated gif whose stack exceeds the ceiling is rejected (two 5700x5700 frames)', async () => {
	// 32.5 MP per frame passes sharp's own single-frame limit; only the stack check can stop it.
	const w = 5700
	const frame = Buffer.alloc(w * w, 7)
	// Frames must differ or the encoder merges them into one.
	const raw = Buffer.concat([frame, Buffer.alloc(w * w, 250)])
	const gif = await sharp(raw, { raw: { width: w, height: w * 2, channels: 1, pageHeight: w } })
		.gif({ loop: 0, delay: [100, 100] })
		.toBuffer()
	same((await sharp(gif).metadata()).pages, 2, 'fixture really has 2 frames')
	const before = rssMb()
	const started = performance.now()
	await rejects(() => analyzeImage(gif), 'analyzeImage')
	await rejects(() => toVisionJpeg(gif), 'toVisionJpeg')
	ok(performance.now() - started < 1500, `took ${Math.round(performance.now() - started)} ms`)
	ok(rssMb() - before < 150, `rss grew ${Math.round(rssMb() - before)} MB`)
})

await check('ceiling: a stack just under it is accepted (3000x3000 x 7 = 63 MP header)', async () => {
	// Header-level acceptance only: inspect passes, then the first frame decodes (the crafted
	// frames hold no pixel data), so either a result or UnsupportedImageError (bad data) is
	// fine, but it must not be rejected for SIZE. Check via the message.
	try {
		await analyzeImage(craftedGif(3000, 3000, 7))
	} catch (error) {
		ok(error instanceof UnsupportedImageError, `wrong type ${error?.constructor?.name}`)
		ok(!/too large/i.test(error.message), 'rejected for size at 63 MP')
	}
})

await check('ceiling: exactly 64 megapixels is accepted, one more row is not', async () => {
	const accepted = await analyzeImage(
		await sharp({ create: { width: 8000, height: 8000, channels: 3, background: '#336699' } })
			.png({ compressionLevel: 1 })
			.toBuffer(),
	)
	same([accepted.width, accepted.height], [8000, 8000])
	same(accepted.colors[0].name, 'blue')
	const error = await rejects(async () => analyzeImage(await forgedPng(8000, 8001)), '8000x8001')
	ok(/too large/i.test(error.message), error.message)
})

await check('large jpeg (6000x4000): analysed quickly thanks to shrink-on-load, memory stays small', async () => {
	const big = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: '#cc6633' } })
		.jpeg({ quality: 80 })
		.toBuffer()
	const before = rssMb()
	const started = performance.now()
	const result = await analyzeImage(big)
	const ms = performance.now() - started
	same([result.width, result.height], [6000, 4000])
	ok(ms < 3000, `${Math.round(ms)} ms`)
	ok(rssMb() - before < 200, `rss grew ${Math.round(rssMb() - before)} MB`)
})

await check('large jpeg tagged orientation 6 still reports rotated size', async () => {
	const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#33cc66' } })
		.jpeg()
		.withMetadata({ orientation: 6 })
		.toBuffer()
	const result = await analyzeImage(big)
	same([result.width, result.height], [3000, 4000])
	same(result.colors[0].name, 'green')
})

await check('a damaged-but-decodable jpeg (trailing garbage) is accepted, not rejected for a warning', async () => {
	const jpeg = await solid('#2f6fed', 'jpg', 64, 64)
	const result = await analyzeImage(Buffer.concat([jpeg, randomBytes(64)]))
	same(result.format, 'jpg')
})

await check('errors never escape as another type: 40 random corruptions of a real png are all ok or UnsupportedImageError', async () => {
	const base = await split('#ff0000', '#0000ff', 'png', 64, 64)
	for (let i = 0; i < 40; i++) {
		const bad = Buffer.from(base)
		const at = 8 + Math.floor(Math.random() * (bad.length - 8))
		bad[at] ^= 0xff
		try {
			await analyzeImage(bad)
		} catch (error) {
			ok(error instanceof UnsupportedImageError, `${error?.constructor?.name}: ${error?.message}`)
		}
	}
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
