/**
 * Per-block colour schemes. A band can flip the palette (inverse: a dark band on a
 * light site, a "paper" band on a dark site) or fill itself with the accent (brand).
 * `themeCss` re-declares the theme's tokens inside the band from these colours, so
 * every section reads them without knowing it is in a band.
 *
 * Deterministic and versioned: the design proof pins the derived colours of every
 * curated palette, so a change here is always a deliberate one.
 */
import { defaultSettings } from '@/app/builder/theme-settings'
import {
	BLACK,
	BRAND_STRONG_ACCENT,
	WHITE,
	contrastRatio,
	luminance,
	mixSrgb,
	parseHex,
	tintRgb,
	toHex,
	type Rgb,
	type ThemeColors,
} from './contrast'
import { solveLightness } from './oklch'

export const SCHEME_VERSION = 1

// Enough steps to reach black or white from any colour; the loops below never run longer.
const MAX_TINT_STEPS = 60

type Colors = { background: Rgb; accent: Rgb; heading: Rgb; body: Rgb }

// themeCss derives the bands on every render, so a missing or junk colour takes the default instead of throwing.
const rgbOf = (colors: ThemeColors): Colors => ({
	background: parseHex(colors?.background) ?? (parseHex(defaultSettings.background) as Rgb),
	accent: parseHex(colors?.accent) ?? (parseHex(defaultSettings.accent) as Rgb),
	heading: parseHex(colors?.heading) ?? (parseHex(defaultSettings.heading) as Rgb),
	body: parseHex(colors?.body) ?? (parseHex(defaultSettings.body) as Rgb),
})

const hexOf = (colors: Colors): ThemeColors => ({
	background: toHex(colors.background),
	accent: toHex(colors.accent),
	heading: toHex(colors.heading),
	body: toHex(colors.body),
})

/** Light when the background is brighter than the headings. */
export function polarityOf(colors: ThemeColors): 'light' | 'dark' {
	const { background, heading } = rgbOf(colors)
	return luminance(background) > luminance(heading) ? 'light' : 'dark'
}

/**
 * Light site → a dark band: the heading darkened in 10% black steps until it is nearly
 * black, with the site background as its headings. Dark site → a light band, the same
 * way toward white. Body text is the band's heading mixed toward the band until it reads
 * at 12.5 (dark band) or 14.5 (light band), so the 66% fade still clears 4.9. The accent
 * keeps its hue: only its OKLCH lightness moves until it reaches 5:1 on the band.
 */
function inverse(colors: Colors, light: boolean): Colors {
	let background = colors.heading
	for (let i = 0; i < MAX_TINT_STEPS; i++) {
		if (light ? luminance(background) <= 0.012 : luminance(background) >= 0.86) break
		background = tintRgb(background, light ? -10 : 10)
	}

	const heading = colors.background
	const goal = light ? 12.5 : 14.5
	let percent = light ? 78 : 86
	let body = mixSrgb(heading, background, percent)
	while (contrastRatio(body, background) < goal && percent < 100) {
		percent += 2
		body = mixSrgb(heading, background, percent)
	}

	const accent =
		contrastRatio(colors.accent, background) >= 5
			? colors.accent
			: (solveLightness(colors.accent, background, 5, light ? 'lighter' : 'darker') ?? (light ? WHITE : BLACK))

	return { background, accent, heading, body }
}

/**
 * The accent becomes the band. Its text is white, or the palette's darkest colour when
 * that reads better; below 5:1 the band's own lightness moves until it reaches it.
 * Headings, eyebrows and buttons all take the text colour; body text is 92% of it.
 */
function brand(colors: Colors): Colors {
	const darkest = [colors.background, colors.heading, colors.body].reduce((a, b) => (luminance(b) < luminance(a) ? b : a))
	const text = contrastRatio(WHITE, colors.accent) >= contrastRatio(darkest, colors.accent) ? WHITE : darkest
	const toWhite = text === WHITE

	let background = colors.accent
	if (contrastRatio(text, background) < 5)
		background = solveLightness(background, text, 5, toWhite ? 'darker' : 'lighter') ?? (toWhite ? BLACK : WHITE)

	return { background, accent: text, heading: text, body: mixSrgb(text, background, 92) }
}

/** The colours a band's tokens are drawn from. Always a complete, valid set. */
export function deriveScheme(colors: ThemeColors, scheme: 'inverse' | 'brand'): ThemeColors {
	const rgb = rgbOf(colors)
	const light = luminance(rgb.background) > luminance(rgb.heading)
	return hexOf(scheme === 'inverse' ? inverse(rgb, light) : brand(rgb))
}

/**
 * The hover fill (`--color-brand-strong`) inside a band. In the inverse scheme it is the
 * usual polarity mix of the band's accent. In the brand scheme the button is the text
 * colour itself, so mixing it with white or black would barely change it; it is the text
 * mixed toward the band instead, from 86% toward 92% until the label (the band colour)
 * reads at 4.5:1.
 */
export function schemeStrong(colors: ThemeColors, scheme: 'inverse' | 'brand'): string {
	const derived = rgbOf(deriveScheme(colors, scheme))
	if (scheme === 'inverse') {
		const light = luminance(derived.background) > luminance(derived.heading)
		return toHex(mixSrgb(derived.accent, light ? BLACK : WHITE, BRAND_STRONG_ACCENT))
	}
	let percent = 86
	let strong = mixSrgb(derived.accent, derived.background, percent)
	while (contrastRatio(derived.background, strong) < 4.5 && percent < 92) {
		percent += 2
		strong = mixSrgb(derived.accent, derived.background, percent)
	}
	return toHex(strong)
}
