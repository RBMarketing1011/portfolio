/**
 * OKLCH, for moving a colour's lightness while keeping its hue. Mixing with white or
 * black greys a brand colour out (`#1e3a8a` lifted with white becomes a dull
 * `#7788b8`); walking its OKLCH lightness keeps the blue (`#5e82d8`).
 *
 * Hue is in degrees, 0..360. Channels are the 0..255 floats of `contrast.ts`.
 */
import { contrastRatio, type Rgb } from './contrast'

export type Oklch = { l: number; c: number; h: number }

const STEP_L = 0.005
const STEP_C = 0.005
const MAX_STEPS = 200
const GAMUT_SLACK = 0.0005

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

export function toOklch(rgb: Rgb): Oklch {
	const r = toLinear(rgb.r / 255)
	const g = toLinear(rgb.g / 255)
	const b = toLinear(rgb.b / 255)
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	const h = (Math.atan2(B, A) * 180) / Math.PI
	return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h }
}

/** The unclamped gamma-encoded channels, 0..1, which may fall outside the sRGB gamut. */
function channels({ l: L, c, h }: Oklch): [number, number, number] {
	const radians = (h * Math.PI) / 180
	const A = c * Math.cos(radians)
	const B = c * Math.sin(radians)
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
	return [
		toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	]
}

const inGamut = (rgb: [number, number, number]) =>
	rgb.every((v) => v >= -GAMUT_SLACK && v <= 1 + GAMUT_SLACK)

/** Back to sRGB; a colour outside the gamut loses chroma, never hue or lightness, until it fits. */
export function fromOklch(lch: Oklch): Rgb {
	let chroma = lch.c
	let rgb = channels(lch)
	while (!inGamut(rgb) && chroma > 0) {
		chroma = Math.max(0, chroma - STEP_C)
		rgb = channels({ ...lch, c: chroma })
	}
	const [r, g, b] = rgb.map((v) => Math.min(1, Math.max(0, v)) * 255)
	return { r, g, b }
}

/**
 * Walks a colour's OKLCH lightness one step at a time (hue kept, chroma reduced only to
 * stay in gamut) until `accept` takes it. The colour itself is tried first. Null when
 * the walk runs off the end of the lightness range.
 */
export function walkLightness(color: Rgb, direction: 'lighter' | 'darker', accept: (rgb: Rgb) => boolean): Rgb | null {
	const start = toOklch(color)
	const sign = direction === 'lighter' ? 1 : -1
	let l = start.l
	for (let i = 0; i < MAX_STEPS; i++) {
		const rgb = fromOklch({ ...start, l })
		if (accept(rgb)) return rgb
		l += sign * STEP_L
		if (l > 1 || l < 0) break
	}
	return null
}

/** The nearest lightness, in one direction, at which `color` reaches `target` contrast against `against`. */
export function solveLightness(color: Rgb, against: Rgb, target: number, direction: 'lighter' | 'darker'): Rgb | null {
	return walkLightness(color, direction, (rgb) => contrastRatio(rgb, against) >= target)
}
