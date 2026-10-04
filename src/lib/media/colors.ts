/**
 * Colour naming. People search "blue", not `#0197f6`, so every dominant colour in
 * an image is reduced to one of a short, curated list of names. Pure and client
 * safe (the UI draws the swatches from `NAMED_COLORS`).
 *
 * How a colour gets its name, in order:
 *  1. Anything almost black (L* < 5) is black, whatever its hue.
 *  2. Anything with almost no chroma is black, gray or white by lightness alone.
 *  3. A near-white pastel is never a hue name: warm ones (cream, ivory-ish) are
 *     beige, the rest white.
 *  4. Everything else takes the name of the nearest reference point in CIELAB
 *     (CIEDE2000). Each name owns several reference points (a light and a dark
 *     brown, several greys) so a name covers its whole shade range, not one swatch.
 *
 * Judgement calls, on purpose: olive is green (it is a yellow-green, and nobody
 * searches a photo library for "olive" meaning brown); cyan and turquoise are teal;
 * magenta is pink; indigo and violet are purple; gold and amber are yellow or
 * orange by their hue; maroon is red; cream is beige; ivory is white.
 */

export type NamedColor = {
	/** Lowercase, one word: `blue`. */
	name: string
	/** A representative swatch, `#rrggbb`. Also the reference point for naming. */
	hex: string
}

/**
 * The vocabulary. Fourteen names that a web designer would use and that stay
 * unambiguous. Order is display order. Each swatch names itself.
 */
export const NAMED_COLORS: readonly NamedColor[] = Object.freeze(
	[
		{ name: 'red', hex: '#e02424' },
		{ name: 'orange', hex: '#f97316' },
		{ name: 'yellow', hex: '#facc15' },
		{ name: 'green', hex: '#2e9e4f' },
		{ name: 'teal', hex: '#0d9488' },
		{ name: 'blue', hex: '#2f6fed' },
		{ name: 'navy', hex: '#0f1f4d' },
		{ name: 'purple', hex: '#8e44ad' },
		{ name: 'pink', hex: '#ec4899' },
		{ name: 'brown', hex: '#7a4a1e' },
		{ name: 'beige', hex: '#e8dcc0' },
		{ name: 'gray', hex: '#808080' },
		{ name: 'black', hex: '#111111' },
		{ name: 'white', hex: '#ffffff' },
	].map((color) => Object.freeze(color)),
)

/**
 * Accepted spellings that map to a canonical name: `grey` -> `gray`. Keys are
 * lowercase with no spaces, hyphens or underscores (`sky blue` is looked up as
 * `skyblue`). Every value is a canonical name.
 */
export const COLOR_ALIASES: Readonly<Record<string, string>> = Object.freeze({
	grey: 'gray',
	silver: 'gray',
	charcoal: 'gray',
	slate: 'gray',
	crimson: 'red',
	scarlet: 'red',
	maroon: 'red',
	burgundy: 'red',
	gold: 'yellow',
	lime: 'green',
	olive: 'green',
	cyan: 'teal',
	aqua: 'teal',
	turquoise: 'teal',
	skyblue: 'blue',
	royalblue: 'blue',
	lightblue: 'blue',
	navyblue: 'navy',
	darkblue: 'navy',
	violet: 'purple',
	indigo: 'purple',
	lavender: 'purple',
	magenta: 'pink',
	fuchsia: 'pink',
	hotpink: 'pink',
	tan: 'beige',
	cream: 'beige',
	ivory: 'white',
	offwhite: 'white',
	darkgreen: 'green',
	lightgray: 'gray',
	lightgrey: 'gray',
	darkgray: 'gray',
	darkgrey: 'gray',
})

/** Black/white/gray have no hue; the UI lists them apart from the chromatic names. */
export const NEUTRAL_COLORS: ReadonlySet<string> = new Set([
	'gray',
	'black',
	'white',
])

const hasOwn = (object: object, key: string) =>
	Object.prototype.hasOwnProperty.call(object, key)

const SWATCHES = new Map(NAMED_COLORS.map((color) => [color.name, color.hex]))

/* -------------------------------------------------------------------------- */
/* Hex                                                                        */
/* -------------------------------------------------------------------------- */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * `#rrggbb`, `rrggbb`, `#rgb` or `rgb` (any case, surrounding whitespace ignored)
 * -> [r, g, b], or null if it is not a hex colour. Alpha forms (4 or 8 digits)
 * are not colours here and give null.
 */
export function hexToRgb(hex: string): [number, number, number] | null {
	if (typeof hex !== 'string') return null
	const match = HEX.exec(hex.trim())
	if (!match) return null
	let digits = match[1]
	if (digits.length === 3)
		digits = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2]
	const value = Number.parseInt(digits, 16)
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const channel = (value: number) => {
	const n = Math.round(Number(value))
	if (Number.isNaN(n)) return 0
	return Math.min(255, Math.max(0, n))
}

/** Lowercase `#rrggbb`. Channels are rounded and clamped to 0..255; NaN becomes 0, infinities clamp. */
export function rgbToHex(r: number, g: number, b: number): string {
	return `#${[r, g, b].map((v) => channel(v).toString(16).padStart(2, '0')).join('')}`
}

/* -------------------------------------------------------------------------- */
/* CIELAB                                                                     */
/* -------------------------------------------------------------------------- */

type Lab = readonly [number, number, number]

const srgbToLinear = (value: number) => {
	const c = value / 255
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const D65 = [0.95047, 1, 1.08883] as const
const EPSILON = 216 / 24389
const KAPPA = 24389 / 27

const labF = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116)

/** sRGB (0..255) -> linear -> XYZ (D65) -> CIELAB. */
function rgbToLab(r: number, g: number, b: number): Lab {
	const lr = srgbToLinear(r)
	const lg = srgbToLinear(g)
	const lb = srgbToLinear(b)
	const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb
	const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb
	const z = 0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb
	const fx = labF(x / D65[0])
	const fy = labF(y / D65[1])
	const fz = labF(z / D65[2])
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const RAD = Math.PI / 180

/** CIEDE2000 (Sharma, Wu, Dalal 2005), kL = kC = kH = 1. */
function deltaE2000(one: Lab, two: Lab): number {
	const [l1, a1, b1] = one
	const [l2, a2, b2] = two
	const c1 = Math.hypot(a1, b1)
	const c2 = Math.hypot(a2, b2)
	const cBar = (c1 + c2) / 2
	const cBar7 = cBar ** 7
	const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)))
	const a1p = (1 + g) * a1
	const a2p = (1 + g) * a2
	const c1p = Math.hypot(a1p, b1)
	const c2p = Math.hypot(a2p, b2)
	const hue = (b: number, a: number) => {
		if (b === 0 && a === 0) return 0
		const h = Math.atan2(b, a) / RAD
		return h < 0 ? h + 360 : h
	}
	const h1p = hue(b1, a1p)
	const h2p = hue(b2, a2p)

	const dLp = l2 - l1
	const dCp = c2p - c1p
	let dhp = 0
	if (c1p * c2p !== 0) {
		dhp = h2p - h1p
		if (dhp > 180) dhp -= 360
		else if (dhp < -180) dhp += 360
	}
	const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp * RAD) / 2)

	const lBarP = (l1 + l2) / 2
	const cBarP = (c1p + c2p) / 2
	let hBarP = h1p + h2p
	if (c1p * c2p !== 0) {
		if (Math.abs(h1p - h2p) <= 180) hBarP /= 2
		else hBarP = (hBarP + (h1p + h2p < 360 ? 360 : -360)) / 2
	}

	const t =
		1 -
		0.17 * Math.cos((hBarP - 30) * RAD) +
		0.24 * Math.cos(2 * hBarP * RAD) +
		0.32 * Math.cos((3 * hBarP + 6) * RAD) -
		0.2 * Math.cos((4 * hBarP - 63) * RAD)
	const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2))
	const cBarP7 = cBarP ** 7
	const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + 25 ** 7))
	const sL = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2)
	const sC = 1 + 0.045 * cBarP
	const sH = 1 + 0.015 * cBarP * t
	const rT = -Math.sin(2 * dTheta * RAD) * rC

	const termL = dLp / sL
	const termC = dCp / sC
	const termH = dHp / sH
	return Math.sqrt(termL ** 2 + termC ** 2 + termH ** 2 + rT * termC * termH)
}

/* -------------------------------------------------------------------------- */
/* Reference points                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The points a colour is measured against. The first point of each name is its
 * `NAMED_COLORS` swatch (added below); these are the extras that stretch a name
 * across light and dark variants and the shades people still call by it.
 */
const EXTRA_REFERENCES: Record<string, string[]> = {
	red: ['#ff0000', '#d32f2f', '#c62828', '#b71c1c', '#8b0000', '#a01818', '#ef4444', '#aa2233', '#9b1c31', '#c0392b'],
	orange: ['#ff8c00', '#ff9800', '#f57c00', '#ff6600', '#ea580c', '#ffa500', '#ff7f2a'],
	yellow: ['#ffff00', '#ffeb3b', '#ffd600', '#fdd835', '#ffd700', '#f5c518', '#fff176', '#d4d430', '#e6c200', '#c9b100'],
	green: [
		'#00ff00',
		'#008000',
		'#4caf50',
		'#1b5e20',
		'#006400',
		'#0b3d1e',
		'#7cb342',
		'#00c853',
		'#228b22',
		'#808000',
		'#556b2f',
		'#6b8e23',
		'#9acd32',
		'#a5d6a7',
		'#16a34a',
		'#a8a820',
		'#a4b84a',
		'#9ccc65',
		'#9a9a1a',
	],
	teal: [
		'#008080',
		'#14b8a6',
		'#26a69a',
		'#00897b',
		'#00ffff',
		'#00bcd4',
		'#40e0d0',
		'#20b2aa',
		'#004d4d',
		'#80deea',
	],
	blue: [
		'#0000ff',
		'#0197f6',
		'#1e88e5',
		'#4169e1',
		'#2563eb',
		'#87ceeb',
		'#64b5f6',
		'#42a5f5',
		'#3b82f6',
		'#1565c0',
		'#90caf9',
		'#5b8def',
		'#0d47a1',
		'#0a2fa8',
		'#0033cc',
		'#1a3fc0',
	],
	navy: ['#0a1a3a', '#000080', '#14213d', '#1a2a5a', '#0b1e4a', '#102a43', '#001f3f'],
	purple: [
		'#800080',
		'#7b1fa2',
		'#9c27b0',
		'#6a1b9a',
		'#673ab7',
		'#a855f7',
		'#7e57c2',
		'#4b0082',
		'#b57edc',
		'#8a2be2',
		'#7c3aed',
		'#4a148c',
		'#ce93d8',
	],
	pink: [
		'#ff69b4',
		'#e91e63',
		'#ff1493',
		'#ff80ab',
		'#f8bbd0',
		'#ffc0cb',
		'#ff00ff',
		'#d81b60',
		'#c71585',
		'#f48fb1',
		'#fb7185',
	],
	brown: [
		'#8b4513',
		'#5d4037',
		'#a0522d',
		'#3e2723',
		'#6d4c41',
		'#8d5524',
		'#c68642',
		'#4e342e',
		'#5c4033',
		'#654321',
		'#a1887f',
		'#7b3f00',
		'#9a6a3a',
		'#b5651d',
	],
	beige: [
		'#f5f0dc',
		'#f5f5dc',
		'#d9c7a0',
		'#d2b48c',
		'#c8ad7f',
		'#deb887',
		'#e6cfa9',
		'#f0d9b5',
		'#ffdbac',
		'#f1c27d',
		'#e0b894',
		'#fff8dc',
		'#c2b280',
		'#e8d5b5',
		'#f3e5ab',
		'#ffe0bd',
	],
	gray: [
		'#9e9e9e',
		'#616161',
		'#bdbdbd',
		'#424242',
		'#d0d0d0',
		'#707070',
		'#a0a0a0',
		'#303030',
		'#8d8d8d',
		'#5a5a5a',
		'#c8c8c8',
	],
	black: ['#000000', '#101010', '#1a1a1a'],
	white: ['#ffffff', '#f8f8f8', '#f4f4f4', '#fafafa'],
}

type Reference = { name: string; lab: Lab }

const toLab = (hex: string): Lab => {
	const rgb = hexToRgb(hex)
	if (!rgb) throw new Error(`colors: bad reference ${hex}`)
	return rgbToLab(rgb[0], rgb[1], rgb[2])
}

const REFERENCES: readonly Reference[] = NAMED_COLORS.flatMap((color) =>
	[color.hex, ...(EXTRA_REFERENCES[color.name] ?? [])].map((hex) => ({
		name: color.name,
		lab: toLab(hex),
	})),
)

/* -------------------------------------------------------------------------- */
/* Naming                                                                     */
/* -------------------------------------------------------------------------- */

/** Below this lightness a colour is black whatever its hue (#050510 and darker). */
const BLACK_ANY_HUE_L = 5
/** Below this chroma a colour has no hue worth naming (sRGB grey +- a few steps). */
const NEUTRAL_CHROMA = 7
/** Neutral lightness bands: 0x1c and darker is black, 0xe6 and lighter is white. */
const NEUTRAL_BLACK_L = 11
const NEUTRAL_WHITE_L = 91
/** Pastel zone starts a little lower: #ddddff is a white with a tint, not a gray. */
const PASTEL_L = 88
/** Pastels at or above WHITE_L with at most this chroma are white or beige. */
const PASTEL_CHROMA = 22
/** Lab hue angles (degrees) that read as warm cream or beige when pale. */
const BEIGE_HUE_MIN = 35
const BEIGE_HUE_MAX = 115
/** Paler than this chroma a warm near-white is just white (ivory is #fffff0, chroma 7.6; cream #fffdd0 is 22.8). */
const BEIGE_MIN_CHROMA = 9

/**
 * The curated name nearest to this colour, judged in CIELAB so "nearest" matches
 * what an eye sees. `#0197f6` -> `blue`, `#7a4a1e` -> `brown`, `#f4ecd8` -> `beige`,
 * `#808080` -> `gray`. Always returns a name; input that is not a hex colour
 * names as `gray`.
 */
export function nameColor(hex: string): string {
	const rgb = hexToRgb(hex)
	if (!rgb) return 'gray'
	const lab = rgbToLab(rgb[0], rgb[1], rgb[2])
	const [l, a, b] = lab
	if (l < BLACK_ANY_HUE_L) return 'black'

	const chroma = Math.hypot(a, b)
	if (chroma <= NEUTRAL_CHROMA) {
		if (l < NEUTRAL_BLACK_L) return 'black'
		return l >= NEUTRAL_WHITE_L ? 'white' : 'gray'
	}

	if (l >= PASTEL_L && chroma <= PASTEL_CHROMA) {
		let hue = Math.atan2(b, a) / RAD
		if (hue < 0) hue += 360
		const warm = hue >= BEIGE_HUE_MIN && hue <= BEIGE_HUE_MAX
		return warm && chroma >= BEIGE_MIN_CHROMA ? 'beige' : 'white'
	}

	let best = REFERENCES[0]
	let bestDistance = Number.POSITIVE_INFINITY
	for (const reference of REFERENCES) {
		const distance = deltaE2000(lab, reference.lab)
		if (distance < bestDistance) {
			bestDistance = distance
			best = reference
		}
	}
	return best.name
}

/**
 * Turns whatever a person typed into a canonical colour name: an exact name, an
 * alias (`grey`), a hex value (named via `nameColor`), or a unique prefix of a
 * canonical name (`pur` -> `purple`). Case and surrounding space are ignored.
 * Null when it is none of those or the prefix is ambiguous (`b`, `gr`, `p`).
 *
 * A bare run of three or six hex digits is hex even when it is also a word
 * (`bed`, `fee`): the spec accepts hex with or without `#`. No colour name
 * starts with three hex digits, so this never shadows a prefix.
 */
export function resolveColorName(input: string): string | null {
	if (typeof input !== 'string') return null
	const text = input.trim().toLowerCase()
	if (!text || text.length > 64) return null

	if (SWATCHES.has(text)) return text
	const squashed = text.replace(/[\s_-]+/g, '')
	if (hasOwn(COLOR_ALIASES, squashed)) return COLOR_ALIASES[squashed]
	if (HEX.test(text)) return nameColor(text)

	let found: string | null = null
	for (const color of NAMED_COLORS) {
		if (!color.name.startsWith(text)) continue
		if (found) return null
		found = color.name
	}
	return found
}

/** True only for a canonical name exactly as stored (lowercase): `blue`, not `Blue` or `grey`. */
export function isColorName(value: string): boolean {
	return typeof value === 'string' && SWATCHES.has(value)
}

/** The swatch for a canonical name, for facet chips. Undefined for anything else. */
export function swatchFor(name: string): string | undefined {
	return typeof name === 'string' ? SWATCHES.get(name) : undefined
}
