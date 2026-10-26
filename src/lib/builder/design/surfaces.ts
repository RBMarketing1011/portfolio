/**
 * Surface tones → complete `BackgroundSettings` (section 8.9). The planner picks a tone
 * per section from a small vocabulary; `solveSurfaceKit` finds, for this exact theme,
 * the tint lightness each tone can use while every text role stays readable on it, and
 * `toneSettings` turns a tone into the settings a block stores. A tone with no passing
 * value maps to the next one, so a section never lands on a band it cannot be read on.
 */
import {
	defaultBackground,
	globalBackground,
	type BackgroundSettings,
	type PatternId,
	type SurfaceScheme,
	type SurfaceSettings,
} from '@/app/builder/background-settings'
import type { ThemeSettings, Tint } from '@/app/builder/theme-settings'
import type { HeaderVariant } from '../page-schema'
import {
	THRESHOLDS,
	contrastRatio,
	luminance,
	mixSrgb,
	parseHex,
	themeRgb,
	tintRgb,
	toHex,
	type Rgb,
	type ThemeColors,
} from './contrast'
import { PERSONALITIES } from './personalities'
import { deriveScheme, schemeStrong } from './scheme'
import type { BackdropId, PersonalityId, SurfaceTone } from './vocab'

export type SurfaceKit = {
	soft: number; tinted: number; wash: number | null; page: number | null; inverseGlow: number | null
	brand: boolean // the brand scheme passes heading/body
	brandS400: boolean // and s400 (split-cta:rows)
	pattern: PatternId | 'none' // from the personality
	patternColor: Tint // dark: { accent, 0 }; light: { heading, 0 }
	/** False when an inverse band's text or buttons cannot be read on this theme (inverse tones map to soft); absent means available. */
	inverse?: boolean
}

// Search orders: the design value first, then outward (section 8.9).
const SEARCH = {
	soft: { light: [70, 60, 50, -2, -3], dark: [6, 5, 4, 3] },
	tinted: { light: [88, 90, 92, 94, 95, 96, 97], dark: [-82, -84, -86, -88, -90] },
	wash: { light: [76, 78, 80, 82, 84, 86, 88, 90], dark: [-50, -55, -60, -65, -70, -75, -80] },
	page: {
		light: [76, 78, 80, 82, 84, 86, 88, 90, 92],
		dark: [-25, -30, -35, -40, -45, -50, -55, -60, -65, -70, -75, -80],
	},
	// Inside the inverse scheme: a light site's band is dark, so its glow comes from a darker accent.
	inverseGlow: { light: [-20, -30, -40, -50, -60, -70], dark: [70, 75, 80, 85, 90] },
} as const

/** A flat band must visibly differ from the page, or it is no band at all (pure white has no lighter step). */
const MIN_SEPARATION = 1.02

/** The brand band's text is held to AA: it is used only for a closer's large heading, its body and buttons. */
const BRAND_MIN = 4.5

/** Every colour a band's content is drawn in, as the renderer resolves it inside that scheme. */
type Ink = {
	background: Rgb; heading: Rgb; body: Rgb; s400: Rgb; s500: Rgb; accent: Rgb
	strong: Rgb; from: Rgb; to: Rgb; gradient: boolean
}

// The four colours as theme.ts lets them into the stylesheet (anything but `#rrggbb` paints
// the default), which are also the colours it derives the bands from.
const colorsOf = (theme: ThemeSettings): ThemeColors => {
	const rgb = themeRgb(theme)
	return { background: toHex(rgb.background), accent: toHex(rgb.accent), heading: toHex(rgb.heading), body: toHex(rgb.body) }
}

function inkOf(theme: ThemeSettings, scheme: SurfaceScheme): Ink {
	const colors = colorsOf(theme)
	const rgb = themeRgb(scheme === 'base' ? theme : { ...theme, ...deriveScheme(colors, scheme) })
	return {
		background: rgb.background, heading: rgb.heading, body: rgb.body, s400: rgb.s400, s500: rgb.s500, accent: rgb.accent,
		// A band's hover fill is the root's `--sch-inv-strong` or `--sch-brand-strong`, the same hex.
		strong: scheme === 'base' ? rgb.brandStrong : (parseHex(schemeStrong(colors, scheme)) as Rgb),
		from: rgb.buttonFrom,
		to: rgb.buttonTo,
		// theme.ts resets the primary button's gradient inside every band, hover included.
		gradient: scheme === 'base' && theme.buttonFill === 'gradient',
	}
}

/** Heading and body ≥ 7, both body fades and the accent ≥ 4.5, on this colour. */
const textPasses = (ink: Ink, on: Rgb) =>
	contrastRatio(ink.heading, on) >= THRESHOLDS.heading &&
	contrastRatio(ink.body, on) >= THRESHOLDS.body &&
	contrastRatio(ink.s400, on) >= THRESHOLDS.s400 &&
	contrastRatio(ink.s500, on) >= THRESHOLDS.s500 &&
	contrastRatio(ink.accent, on) >= THRESHOLDS.accent

/**
 * The fills under the primary button's label (the colour of the page or band it sits on).
 * On the page: the accent and the hover fill when solid; both gradient stops and both
 * hover stops (each 88% toward the heading colour, `themeCss`) when the gradient covers
 * them. Inside an inverse or brand band the button is always solid, whatever the theme's
 * fill: the band's accent and its hover fill, so a gradient never has to suit a band.
 */
export function buttonsReadable(theme: ThemeSettings, scheme: SurfaceScheme = 'base'): boolean {
	const ink = inkOf(theme, scheme)
	// Inside inverse and brand bands the renderer paints primary buttons solid (theme.ts
	// resets the gradient there), so only the page itself ever shows a gradient.
	const fills = ink.gradient && scheme === 'base'
		? [ink.from, ink.to, mixSrgb(ink.from, ink.heading, 88), mixSrgb(ink.to, ink.heading, 88)]
		: [ink.accent, ink.strong]
	return fills.every((fill) => contrastRatio(ink.background, fill) >= THRESHOLDS.button)
}

/** Whether a band's text passes its own rules on its own background, buttons aside. */
export function bandTextReadable(theme: ThemeSettings, scheme: 'inverse' | 'brand'): boolean {
	const ink = inkOf(theme, scheme)
	if (scheme === 'inverse') return textPasses(ink, ink.background)
	return (
		contrastRatio(ink.heading, ink.background) >= BRAND_MIN &&
		contrastRatio(ink.body, ink.background) >= BRAND_MIN
	)
}

/** The tint lightness every surface tone can use on this theme, and which schemes it may use. */
export function solveSurfaceKit(theme: ThemeSettings, personality: PersonalityId): SurfaceKit {
	const base = inkOf(theme, 'base')
	const light = luminance(base.background) > luminance(base.heading)
	const side = light ? 'light' : 'dark'
	const page = base.background
	const visible = (on: Rgb) => contrastRatio(on, page) >= MIN_SEPARATION
	const flatBand = (on: Rgb) => visible(on) && textPasses(base, on)

	// With no passing value a tone maps down to plain: a soft band of the page colour itself,
	// and a "tinted" band at black (dark sites) or white (light ones), never less readable than the page.
	const softOf = (lightness: number) => tintRgb(page, lightness)
	const soft = SEARCH.soft[side].find((lightness) => flatBand(softOf(lightness))) ?? 0
	const tinted =
		SEARCH.tinted[side].find((lightness) => flatBand(tintRgb(base.accent, lightness))) ?? (light ? 100 : -100)

	// A wash fades from a pale accent corner into the soft band; the corner is the weakest spot.
	const softBand = softOf(soft)
	const wash =
		SEARCH.wash[side].find((lightness) => textPasses(base, mixSrgb(tintRgb(base.accent, lightness), softBand, 30))) ?? null
	const pageFrom =
		SEARCH.page[side].find((lightness) => textPasses(base, mixSrgb(tintRgb(base.accent, lightness), page, 30))) ?? null

	const inverse = inkOf(theme, 'inverse')
	const inverseOk = bandTextReadable(theme, 'inverse') && buttonsReadable(theme, 'inverse')
	const inverseGlow = inverseOk
		? (SEARCH.inverseGlow[side].find((lightness) =>
				textPasses(inverse, mixSrgb(tintRgb(inverse.accent, lightness), inverse.background, 30)),
			) ?? null)
		: null

	const brand = inkOf(theme, 'brand')
	const brandOk = bandTextReadable(theme, 'brand') && buttonsReadable(theme, 'brand')

	const pattern = Object.hasOwn(PERSONALITIES, personality) ? PERSONALITIES[personality].pattern : 'none'
	return {
		soft,
		tinted,
		wash,
		page: pageFrom,
		inverseGlow,
		brand: brandOk,
		brandS400: brandOk && contrastRatio(brand.s400, brand.background) >= BRAND_MIN,
		pattern,
		patternColor: light ? { token: 'heading', lightness: 0 } : { token: 'accent', lightness: 0 },
		...(inverseOk ? {} : { inverse: false }),
	}
}

// Everything here is plain data, so a copy keeps callers from sharing the module's constants.
const fresh = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** A complete block surface: a partial entry would inherit the page's grid and gradient. */
const surface = (page: Partial<SurfaceSettings>, scheme?: SurfaceScheme): BackgroundSettings => ({
	...fresh(globalBackground),
	...(scheme ? { scheme } : {}),
	page: {
		pattern: 'none', patternAngle: 0, patternColor: { token: 'accent', lightness: 0 },
		fill: 'solid', gradientAngle: 180,
		color: { token: 'background', lightness: 0 },
		from: { token: 'accent', lightness: 0 }, to: { token: 'background', lightness: 0 },
		...fresh(page),
	},
})

/** The settings a block with this tone stores; `plain` stores none at all. */
export function toneSettings(tone: SurfaceTone, kit: SurfaceKit): BackgroundSettings | null {
	switch (tone) {
		case 'plain':
			return null
		case 'soft':
			return surface({ color: { token: 'background', lightness: kit.soft } })
		case 'tinted':
			return surface({ color: { token: 'accent', lightness: kit.tinted } })
		case 'wash':
			return kit.wash === null
				? toneSettings('soft', kit)
				: surface({
						fill: 'gradient', gradientAngle: 160,
						from: { token: 'accent', lightness: kit.wash }, to: { token: 'background', lightness: kit.soft },
					})
		case 'pattern':
			return kit.pattern === 'none'
				? toneSettings('soft', kit)
				: surface({
						color: { token: 'background', lightness: kit.soft },
						pattern: kit.pattern, patternColor: kit.patternColor,
					})
		case 'inverse':
			// The fill is the background token, which resolves to the band's own background.
			return kit.inverse === false ? toneSettings('soft', kit) : surface({}, 'inverse')
		case 'inverse-glow':
			return kit.inverseGlow === null
				? toneSettings('inverse', kit)
				: surface(
						{
							fill: 'gradient', gradientAngle: 135,
							from: { token: 'accent', lightness: kit.inverseGlow }, to: { token: 'background', lightness: 0 },
						},
						'inverse',
					)
		case 'brand':
			return kit.brand ? surface({}, 'brand') : toneSettings('inverse', kit)
		default:
			return null
	}
}

/** The site backdrop (`look.page`). Its fill is never `global` or `transparent`, which would paint the live page white. */
const backdrop = (page: Partial<SurfaceSettings>): BackgroundSettings => ({
	...fresh(defaultBackground),
	page: {
		pattern: 'none', patternAngle: 0, patternColor: { token: 'accent', lightness: 0 },
		fill: 'solid', gradientAngle: 135,
		color: { token: 'background', lightness: 0 },
		from: { token: 'accent', lightness: 0 }, to: { token: 'background', lightness: 0 },
		...fresh(page),
	},
})

// The gradient backdrops need a readable corner (`kit.page`); without one each falls back (section 8.10).
const BACKDROP_FALLBACK: Partial<Record<BackdropId, BackdropId>> = { glow: 'clean', grid: 'paper', blueprint: 'lines' }

/** The backdrop that is actually painted for `id` on this kit, after the fallbacks of section 8.10. */
export function backdropFor(id: BackdropId, kit: SurfaceKit): BackdropId {
	const fallback = Object.hasOwn(BACKDROP_FALLBACK, id) ? BACKDROP_FALLBACK[id] : undefined
	return kit.page === null && fallback ? fallback : id
}

export function backdropSettings(id: BackdropId, kit: SurfaceKit): BackgroundSettings {
	// Only the gradient backdrops read it, and backdropFor sends them elsewhere when it is null.
	const corner: Tint = { token: 'accent', lightness: kit.page ?? 0 }
	switch (backdropFor(id, kit)) {
		case 'paper':
			return backdrop({ pattern: 'dots', patternColor: kit.patternColor })
		case 'glow':
			return backdrop({ fill: 'gradient', gradientAngle: 135, from: corner })
		case 'grid':
			// Today's default backdrop, with a corner that keeps small text readable on this theme.
			return backdrop({
				fill: 'gradient', gradientAngle: 135, from: corner,
				pattern: 'grid', patternColor: { token: 'accent', lightness: 0 },
			})
		case 'lines':
			return backdrop({ pattern: 'lines', patternAngle: 0, patternColor: { token: 'heading', lightness: 0 } })
		case 'blueprint':
			return backdrop({
				fill: 'gradient', gradientAngle: 160, from: corner,
				pattern: 'crosshatch', patternColor: { token: 'accent', lightness: 0 },
			})
		case 'clean':
		default:
			return backdrop({})
	}
}

/**
 * The header bar and its menu panels. The bar is the page background (shown 85%
 * translucent with a blur) and never patterned: a pattern behind navigation reads as
 * noise. Light sites get a neutral heading-coloured glow instead of an accent halo.
 */
export function headerLook(variant: HeaderVariant, polarity: 'light' | 'dark'): BackgroundSettings {
	const menuLightness = polarity === 'dark' ? 7 : 0
	return {
		...fresh(globalBackground),
		page:
			variant === 'none'
				? fresh(globalBackground.page)
				: { ...fresh(globalBackground.page), fill: 'solid', color: { token: 'background', lightness: 0 }, pattern: 'none' },
		// Ignored on built sites; kept for the library preview.
		megaMenu: true,
		menu: {
			...fresh(defaultBackground.menu),
			fill: 'solid',
			pattern: 'none',
			color: { token: 'background', lightness: menuLightness },
			to: { token: 'background', lightness: menuLightness },
		},
		panelGlow: polarity === 'dark' ? { mode: 'accent', lightness: 0, size: 'md' } : { mode: 'heading', lightness: 60, size: 'lg' },
		featureGlow: polarity === 'dark' ? { mode: 'accent', lightness: 0, size: 'sm' } : { mode: 'accent', lightness: 40, size: 'sm' },
	}
}

export function footerLook(tone: 'match' | 'soft' | 'inverse', kit: SurfaceKit): BackgroundSettings {
	if (tone === 'soft') return toneSettings('soft', kit) as BackgroundSettings
	if (tone === 'inverse') return toneSettings('inverse', kit) as BackgroundSettings
	return fresh(globalBackground)
}
