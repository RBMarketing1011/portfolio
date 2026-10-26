/**
 * The renderer's colour math, reproduced exactly so a theme can be checked before it is
 * ever painted. `src/app/section-preview/theme.ts` mixes the four theme colours with
 * `color-mix(in srgb, …)`, which interpolates the gamma-encoded channels; tints mix a
 * token with white or black (`mixWith` in theme-settings.ts); contrast is WCAG 2.x.
 *
 * Channels are 0..255 floats: a mix is never rounded until it becomes a hex string,
 * just as the browser keeps the mixed colour exact.
 */
import type { SurfaceSettings } from '@/app/builder/background-settings'
import {
	clampLightness,
	defaultSettings,
	isTint,
	type ThemeSettings,
} from '@/app/builder/theme-settings'

export type Rgb = { r: number; g: number; b: number }
export type ThemeColors = { background: string; accent: string; heading: string; body: string }

export const WHITE: Rgb = Object.freeze({ r: 255, g: 255, b: 255 })
export const BLACK: Rgb = Object.freeze({ r: 0, g: 0, b: 0 })

/** Every bound a theme is held to (section 8.12). Headings are repaired toward the target. */
export const THRESHOLDS = {
	heading: 7,
	headingTarget: 12,
	body: 7,
	s400: 4.5,
	s500: 4.5,
	accent: 4.5,
	button: 4.5,
} as const

/**
 * The light-site hover fill mixes this much accent with black, the dark one with white:
 * `--color-brand-strong` in theme.ts. The 8.2 table was measured with 78 in both cases.
 */
export const BRAND_STRONG_ACCENT = 78

/** `#abc`, `abc`, `#aabbcc` or `aabbcc`, in any case; anything else is null. */
export function parseHex(hex: string): Rgb | null {
	if (typeof hex !== 'string') return null
	const raw = hex.trim().replace(/^#/, '')
	const full = /^[0-9a-f]{3}$/i.test(raw)
		? raw.replace(/./g, (digit) => digit + digit)
		: /^[0-9a-f]{6}$/i.test(raw)
			? raw
			: null
	if (!full) return null
	const n = parseInt(full, 16)
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

const channel = (value: number) =>
	Math.round(Math.min(255, Math.max(0, Number.isFinite(value) ? value : 0)))
		.toString(16)
		.padStart(2, '0')

/** Lower-case `#rrggbb`, each channel clamped and rounded. */
export function toHex(rgb: Rgb): string {
	return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

/** `color-mix(in srgb, a p%, b)`: linear interpolation of the gamma-encoded channels. */
export function mixSrgb(a: Rgb, b: Rgb, percentA: number): Rgb {
	const p = percentA / 100
	return {
		r: a.r * p + b.r * (1 - p),
		g: a.g * p + b.g * (1 - p),
		b: a.b * p + b.b * (1 - p),
	}
}

/** `mixWith` in theme-settings.ts: +n mixes n% white, −n mixes n% black, rounded and clamped like the renderer. */
export function tintRgb(base: Rgb, lightness: number): Rgb {
	const amount = clampLightness(lightness)
	if (amount === 0) return base
	return mixSrgb(amount > 0 ? WHITE : BLACK, base, Math.abs(amount))
}

const linear = (value: number) => {
	const c = Math.min(1, Math.max(0, value / 255))
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance. */
export function luminance(rgb: Rgb): number {
	return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
	const x = luminance(a)
	const y = luminance(b)
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// theme.ts only lets a `#rrggbb` value into the stylesheet and falls back to the default.
const renderHex = (value: unknown, fallback: string) =>
	parseHex(typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback) as Rgb

type Palette4 = { background: Rgb; accent: Rgb; heading: Rgb; body: Rgb }

const colorsOf = (theme: Pick<ThemeSettings, keyof ThemeColors>): Palette4 => ({
	background: renderHex(theme.background, defaultSettings.background),
	accent: renderHex(theme.accent, defaultSettings.accent),
	heading: renderHex(theme.heading, defaultSettings.heading),
	body: renderHex(theme.body, defaultSettings.body),
})

/** A tint resolved against the four colours; a non-tint is the accent, as `tintVar` paints it. */
const tintOf = (colors: Palette4, tint: unknown) =>
	isTint(tint) ? tintRgb(colors[tint.token], tint.lightness) : colors.accent

/** Light when the background is brighter than the headings, the one test the whole kit relies on. */
const isLight = (colors: Palette4) => luminance(colors.background) > luminance(colors.heading)

/**
 * The colours `tokens()` and `themeCss()` derive from a theme: the 88% and 66% body
 * fades (`text-slate-400`, `text-slate-500`), the polarity-aware hover fill and the two
 * gradient stops. The button label is always the background colour.
 */
export function themeRgb(theme: ThemeSettings): {
	background: Rgb; accent: Rgb; heading: Rgb; body: Rgb
	s400: Rgb; s500: Rgb; brandStrong: Rgb; buttonFrom: Rgb; buttonTo: Rgb
} {
	const colors = colorsOf(theme)
	return {
		...colors,
		s400: mixSrgb(colors.body, colors.background, 88),
		s500: mixSrgb(colors.body, colors.background, 66),
		brandStrong: mixSrgb(colors.accent, isLight(colors) ? BLACK : WHITE, BRAND_STRONG_ACCENT),
		buttonFrom: tintOf(colors, theme.buttonFrom),
		buttonTo: tintOf(colors, theme.buttonTo),
	}
}

/**
 * What a surface paints under its content: the flat colour (solid) or the last stop
 * (gradient), and for a gradient the start corner, `mix(from 30%, to)`, the colour
 * `wash()` lays down first. `global` and `transparent` paint nothing, so the theme
 * background shows through.
 */
export function surfaceRgb(theme: ThemeSettings, surface: SurfaceSettings): { base: Rgb; corner: Rgb | null } {
	const colors = colorsOf(theme)
	if (surface.fill === 'global' || surface.fill === 'transparent') return { base: colors.background, corner: null }
	if (surface.fill !== 'gradient') return { base: tintOf(colors, surface.color), corner: null }
	const to = tintOf(colors, surface.to)
	return { base: to, corner: mixSrgb(tintOf(colors, surface.from), to, 30) }
}
