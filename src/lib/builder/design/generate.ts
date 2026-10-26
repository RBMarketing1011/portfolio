/**
 * Turns the planner's design choices, the owner's pins and (for "keep") the current look
 * into the site's look and its surface kit (section 8). Pins always win; invalid or
 * low-contrast colours are repaired with the renderer's own colour math, never rejected.
 *
 * Pure: the pipeline calls it server-side, the proofs call it directly.
 */
import { googleFonts, isGoogleFont } from '@/app/builder/google-fonts'
import type { BackgroundSettings } from '@/app/builder/background-settings'
import { defaultSettings, isShape, type Shape, type ThemeSettings, type Tint } from '@/app/builder/theme-settings'
import type { BuildPins, DesignView, Issue } from '../ai/contract'
import { sanitizeLook, type BuilderLook } from '../look'
import type { HeaderVariant } from '../page-schema'
import {
	BLACK,
	THRESHOLDS,
	WHITE,
	contrastRatio,
	luminance,
	mixSrgb,
	parseHex,
	toHex,
	type Rgb,
	type ThemeColors,
} from './contrast'
import { fontPairById, FONT_PAIRS, type FontPair } from './fonts'
import { walkLightness } from './oklch'
import { nearestPalette, paletteById, PALETTES, type Palette } from './palettes'
import { PERSONALITIES, type Personality } from './personalities'
import { polarityOf } from './scheme'
import {
	backdropFor,
	backdropSettings,
	buttonsReadable,
	footerLook,
	headerLook,
	solveSurfaceKit,
	type SurfaceKit,
} from './surfaces'
import { BACKDROP_IDS, type BackdropId, type FontPairId, type PaletteId, type PersonalityId } from './vocab'

/** The planner's design choices as the reader returns them (PlanReply['design'], section 11.9). Lives here so design never imports the pipeline. */
export type DesignChoice = {
	palette: PaletteId | 'custom' | null
	custom: { background: string; accent: string; heading: string; body: string }
	fonts: FontPairId | null; shape: Shape | null; buttons: 'solid' | 'gradient' | null
	width: '5xl' | '6xl' | '7xl' | null; backdrop: BackdropId | null; footerTone: 'match' | 'soft' | 'inverse' | null
}

export type ResolvedDesign = {
	look: { theme: ThemeSettings; page: BackgroundSettings; header: BackgroundSettings; footer: BackgroundSettings } | null // null = keep
	theme: ThemeSettings // the effective theme (current when kept) that surfaces are solved against
	kit: SurfaceKit
	polarity: 'light' | 'dark'
	paletteId: PaletteId | 'custom' | 'keep'
	fontPairId: FontPairId | 'custom' | 'keep'
	view: DesignView // section 5.1, what the plan card shows
	notes: Issue[] // codes color-repaired, font-replaced, pin-bent
}

const ROLES = ['background', 'heading', 'body', 'accent'] as const
type Role = (typeof ROLES)[number]
const ROLE_NAMES: Record<Role, string> = {
	background: 'background color',
	heading: 'heading color',
	body: 'body text color',
	accent: 'accent',
}
const ROLE_REASONS: Record<Role, string> = {
	background: 'text can be read on it',
	heading: 'headings stay readable',
	body: 'body text stays readable',
	accent: 'button labels stay readable',
}

/** A repaired heading starts at 12:1; the background must leave a little room above that. */
const HEADING_ROOM = 12.5
/** Accents are repaired to a hair above the 4.5 threshold, so rounding never drops them below it. */
const ACCENT_TARGET = 4.6

const GRADIENT_ANGLE = 135

// The widths the AI may choose (section 8.7); 3xl, 4xl and full are the owner's alone.
const WIDTHS = ['5xl', '6xl', '7xl'] as const

// Every check runs on the colour as it will be stored: rounded to a hex value.
const rounded = (rgb: Rgb) => parseHex(toHex(rgb)) as Rgb

const isLightPair = (background: Rgb, heading: Rgb) => luminance(background) > luminance(heading)

const bodyPasses = (body: Rgb, background: Rgb) =>
	contrastRatio(body, background) >= THRESHOLDS.body &&
	contrastRatio(mixSrgb(body, background, 66), background) >= THRESHOLDS.s500

const passesBase = (colors: Record<Role, Rgb>) =>
	contrastRatio(colors.heading, colors.background) >= THRESHOLDS.heading &&
	bodyPasses(colors.body, colors.background) &&
	contrastRatio(mixSrgb(colors.body, colors.background, 88), colors.background) >= THRESHOLDS.s400 &&
	contrastRatio(colors.accent, colors.background) >= THRESHOLDS.accent

const firstPalette = (polarity: 'light' | 'dark') => PALETTES.find((item) => item.polarity === polarity) ?? PALETTES[0]

/**
 * Makes four colours a theme that passes every threshold of section 8.12. Each colour
 * moves only as far as it must, along its OKLCH lightness (its hue is kept), and every
 * move becomes a note. With `keepHue` the colours are the owner's: none is ever swapped
 * for another hue, and the notes say "Your …".
 */
export function repairTheme(
	colors: ThemeColors,
	opts: { polarity?: 'light' | 'dark'; keepHue?: boolean } = {},
): { colors: ThemeColors; polarity: 'light' | 'dark'; notes: Issue[] } {
	const owner = opts.keepHue === true
	const notes: Issue[] = []
	const say = (message: string) =>
		notes.push({ level: owner ? 'warn' : 'info', code: 'color-repaired', message })
	const whose = owner ? 'Your' : 'The'

	// 1. Hex: '#abc', 'abc', '#aabbcc' in any case; anything else takes a curated colour.
	const fallback = firstPalette(opts.polarity ?? 'dark').colors
	const rgb = {} as Record<Role, Rgb>
	for (const role of ROLES) {
		const parsed = parseHex(colors?.[role] as string)
		rgb[role] = parsed ?? (parseHex(fallback[role]) as Rgb)
		if (!parsed) say(`${whose} ${ROLE_NAMES[role]} was not a hex color, so ${fallback[role]} is used.`)
	}
	const original = { ...rgb }

	// 2. Polarity from luminance; a pinned polarity that disagrees swaps background and heading.
	let light =
		luminance(rgb.background) === luminance(rgb.heading)
			? (opts.polarity ?? (luminance(rgb.background) > 0.18 ? 'light' : 'dark')) === 'light'
			: isLightPair(rgb.background, rgb.heading)
	if (opts.polarity && (opts.polarity === 'light') !== light) {
		;[rgb.background, rgb.heading] = [rgb.heading, rgb.background]
		light = !light
		say(`${whose} background and heading colors were swapped to make a ${opts.polarity} site.`)
	}
	const towardHeading = light ? 'darker' : 'lighter'
	const away = light ? 'lighter' : 'darker'
	const extreme = light ? BLACK : WHITE

	// Body text on the other side of the background from the headings can never read well.
	const wrongSide = light
		? luminance(rgb.body) >= luminance(rgb.background)
		: luminance(rgb.body) <= luminance(rgb.background)
	if (wrongSide && !owner) rgb.body = rounded(mixSrgb(rgb.heading, rgb.background, 85))

	// The background has to leave room for a 12:1 heading; a mid-tone one moves away from it.
	if (contrastRatio(extreme, rgb.background) < HEADING_ROOM)
		rgb.background =
			walkLightness(rgb.background, away, (next) => contrastRatio(extreme, rounded(next)) >= HEADING_ROOM) ??
			(light ? WHITE : BLACK)
	rgb.background = rounded(rgb.background)

	// 3. Heading: away from the background until 12:1 (clamped at black or white).
	if (contrastRatio(rgb.heading, rgb.background) < THRESHOLDS.headingTarget)
		rgb.heading =
			walkLightness(rgb.heading, towardHeading, (next) =>
				contrastRatio(rounded(next), rgb.background) >= THRESHOLDS.headingTarget,
			) ?? extreme
	rgb.heading = rounded(rgb.heading)

	// 4. Body: toward the heading until it reads at 7:1 and its 66% fade at 4.5:1.
	if (!bodyPasses(rgb.body, rgb.background))
		rgb.body = walkLightness(rgb.body, towardHeading, (next) => bodyPasses(rounded(next), rgb.background)) ?? rgb.heading
	rgb.body = rounded(rgb.body)

	// 5. Accent: darker on light sites, lighter on dark ones, until labels on it read.
	if (contrastRatio(rgb.accent, rgb.background) < ACCENT_TARGET)
		rgb.accent =
			walkLightness(rgb.accent, towardHeading, (next) => contrastRatio(rounded(next), rgb.background) >= ACCENT_TARGET) ??
			extreme
	rgb.accent = rounded(rgb.accent)

	// 6. Buttons are chosen with the rest of the theme, in resolveButtons.

	// A theme that still fails (it cannot, but a design must never ship unreadable) is a curated one.
	if (!passesBase(rgb)) {
		const safe = firstPalette(light ? 'light' : 'dark')
		say(`${whose} colors could not be made readable, so the ${safe.name} palette is used.`)
		return { colors: { ...safe.colors }, polarity: safe.polarity, notes }
	}

	// 7. Every change becomes a note: "Your accent #f5c518 was darkened to #8a6d00 so button labels stay readable."
	for (const role of ROLES) {
		const before = toHex(original[role])
		const after = toHex(rgb[role])
		if (before === after || !parseHex(colors?.[role] as string)) continue
		const moved = luminance(rgb[role]) < luminance(original[role]) ? 'darkened' : 'lightened'
		say(`${whose} ${ROLE_NAMES[role]} ${before} was ${moved} to ${after} so ${ROLE_REASONS[role]}.`)
	}

	return {
		colors: { background: toHex(rgb.background), accent: toHex(rgb.accent), heading: toHex(rgb.heading), body: toHex(rgb.body) },
		polarity: light ? 'light' : 'dark',
		notes,
	}
}

/** Lower-case `#rrggbb`, or null for anything that is not a hex colour. */
const normalizeHex = (value: unknown) => {
	const rgb = parseHex(value as string)
	return rgb ? toHex(rgb) : null
}

type ResolvedColors = {
	colors: ThemeColors
	id: PaletteId | 'custom' | 'keep'
	name: string
	/** The owner's current theme: its button styling stays with its colours. */
	kept: boolean
}

const curated = (palette: Palette): ResolvedColors => ({ colors: { ...palette.colors }, id: palette.id, name: palette.name, kept: false })

/** The personality's own first palette, of a polarity when one is pinned. */
function personaPalette(persona: Personality, polarity: 'light' | 'dark' | null): Palette {
	for (const id of persona.palettes) {
		const palette = paletteById(id)
		if (palette && (!polarity || palette.polarity === polarity)) return palette
	}
	return firstPalette(polarity ?? 'dark')
}

// Mid grey: a colour brighter than this reads as a light background (or a dark site's heading).
const MID_LUMINANCE = 0.18

/**
 * Custom colours with any invalid field taken from the personality's palette first, so
 * repair has four colours to work with. The palette is the polarity the valid colours
 * already imply, so a filled-in heading never lands on the wrong side of the background.
 */
function filledFrom(
	custom: Partial<ThemeColors> | undefined,
	persona: Personality,
	want: 'light' | 'dark' | null,
): { colors: ThemeColors; any: boolean } {
	const hex = Object.fromEntries(ROLES.map((role) => [role, normalizeHex(custom?.[role])])) as Record<Role, string | null>
	const implied = hex.background
		? luminance(parseHex(hex.background) as Rgb) > MID_LUMINANCE
			? 'light'
			: 'dark'
		: hex.heading
			? luminance(parseHex(hex.heading) as Rgb) > MID_LUMINANCE
				? 'dark'
				: 'light'
			: null
	const base = personaPalette(persona, want ?? implied)
	const colors = {} as ThemeColors
	for (const role of ROLES) colors[role] = hex[role] ?? base.colors[role]
	return { colors, any: ROLES.some((role) => hex[role] !== null) }
}

/** Section 8.13's order: keep → pinned palette → pinned brand colour → pinned colours → the planner's palette → its colours → the personality's. */
function resolveColors(
	reply: DesignChoice,
	persona: Personality,
	pin: BuildPins['palette'],
	current: ThemeSettings,
	notes: Issue[],
): ResolvedColors {
	switch (pin?.kind) {
		case 'keep':
			return {
				colors: { background: current.background, accent: current.accent, heading: current.heading, body: current.body },
				id: 'keep',
				name: 'Your current colors',
				kept: true,
			}
		case 'curated': {
			const palette = paletteById(pin.id)
			if (palette) return curated(palette)
			break
		}
		case 'brand': {
			const polarity = pin.polarity === 'light' ? 'light' : 'dark'
			const base = nearestPalette(pin.accent, polarity)
			const accent = normalizeHex(pin.accent) ?? base.colors.accent
			const repaired = repairTheme({ ...base.colors, accent }, { polarity, keepHue: true })
			notes.push(...repaired.notes)
			return { colors: repaired.colors, id: 'custom', name: `${base.name} with your brand color`, kept: false }
		}
		case 'custom': {
			const repaired = repairTheme(filledFrom(pin, persona, null).colors, { keepHue: true })
			notes.push(...repaired.notes)
			return { colors: repaired.colors, id: 'custom', name: 'Your colors', kept: false }
		}
	}

	// AI decides, perhaps with a pinned polarity.
	const want = pin?.kind === 'ai' && (pin.polarity === 'light' || pin.polarity === 'dark') ? pin.polarity : null
	if (reply.palette && reply.palette !== 'custom') {
		const palette = paletteById(reply.palette)
		if (palette && (!want || palette.polarity === want)) return curated(palette)
		return curated(personaPalette(persona, want))
	}
	if (reply.palette === 'custom') {
		const filled = filledFrom(reply.custom, persona, want)
		if (filled.any) {
			if (want && polarityOf(filled.colors) !== want) {
				const base = personaPalette(persona, want)
				notes.push({
					level: 'warn',
					code: 'pin-bent',
					message: `The AI's colors made a ${want === 'light' ? 'dark' : 'light'} site, so the ${base.name} palette is used to keep it ${want}.`,
				})
				return curated(base)
			}
			const repaired = repairTheme(filled.colors, want ? { polarity: want } : {})
			notes.push(...repaired.notes)
			return { colors: repaired.colors, id: 'custom', name: 'Custom colors', kept: false }
		}
	}
	return curated(personaPalette(persona, want))
}

const categoryOf = new Map(googleFonts.map((item) => [item.family, item.category]))

/** Display and handwriting faces are made for headlines and tire the eye as running text. */
const isTextFace = (family: string) => {
	const category = categoryOf.get(family)
	return category !== 'Display' && category !== 'Handwriting'
}

function resolveFonts(
	reply: DesignChoice,
	persona: Personality,
	pin: BuildPins['fonts'],
	current: ThemeSettings,
	notes: Issue[],
): { id: FontPairId | 'custom' | 'keep'; heading: string; body: string } {
	const fallback: FontPair = fontPairById(persona.fonts[0]) ?? FONT_PAIRS[0]
	switch (pin?.kind) {
		case 'keep':
			return { id: 'keep', heading: current.headingFont, body: current.bodyFont }
		case 'pair': {
			const pair = fontPairById(pin.id)
			if (pair) return { id: pair.id, heading: pair.heading, body: pair.body }
			break
		}
		case 'custom': {
			let heading = pin.heading
			let body = pin.body
			if (!isGoogleFont(heading)) {
				notes.push({ level: 'warn', code: 'font-replaced', message: `The heading font "${String(heading).slice(0, 60)}" is not in the font list, so ${fallback.heading} is used.` })
				heading = fallback.heading
			} else if (!isTextFace(heading)) {
				notes.push({ level: 'info', code: 'font-replaced', message: `${heading} is a decorative face, so it is used for headings only.` })
			}
			if (!isGoogleFont(body)) {
				notes.push({ level: 'warn', code: 'font-replaced', message: `The body font "${String(body).slice(0, 60)}" is not in the font list, so ${fallback.body} is used.` })
				body = fallback.body
			} else if (!isTextFace(body)) {
				notes.push({ level: 'warn', code: 'font-replaced', message: `${body} is a decorative face that is hard to read as body text, so ${fallback.body} is used for body text.` })
				body = fallback.body
			}
			return { id: 'custom', heading, body }
		}
	}
	const pair = (reply.fonts && fontPairById(reply.fonts)) || fallback
	return { id: pair.id, heading: pair.heading, body: pair.body }
}

type Buttons = Pick<ThemeSettings, 'buttonFill' | 'buttonFrom' | 'buttonTo' | 'buttonAngle'>

const accentTint = (lightness: number): Tint => ({ token: 'accent', lightness })

/**
 * Section 8.6. A gradient runs from the accent to a darker accent on light sites and a
 * lighter one on dark sites; its far stop steps back toward the accent only until the
 * label reads on both stops and both hover stops on the page itself. Inverse and brand
 * bands paint their primary buttons solid whatever the theme's fill (theme.ts), so they
 * never hold the gradient back. Solid stays solid while its hover reads.
 */
function resolveButtons(theme: ThemeSettings, style: 'solid' | 'gradient', light: boolean): Buttons {
	const start = light ? -20 : 25
	const gradient = (to: number): Buttons => ({
		buttonFill: 'gradient',
		buttonFrom: accentTint(0),
		buttonTo: accentTint(to),
		buttonAngle: GRADIENT_ANGLE,
	})
	const readable = (buttons: Buttons) => buttonsReadable({ ...theme, ...buttons }, 'base')

	if (style === 'solid') {
		const solid: Buttons = { ...gradient(start), buttonFill: 'solid' }
		if (readable(solid)) return solid
	}
	const step = light ? 5 : -5
	for (let to = start; light ? to <= 0 : to >= 0; to += step) {
		const buttons = gradient(to)
		if (readable(buttons) || to === 0) return buttons
	}
	return gradient(0)
}

const themeColorsOf = (theme: ThemeSettings): ThemeColors => ({
	background: theme.background, accent: theme.accent, heading: theme.heading, body: theme.body,
})

/** True when a theme meets every base threshold of section 8.12. */
const themePasses = (theme: ThemeSettings) => {
	const colors = {
		background: parseHex(theme.background) as Rgb,
		heading: parseHex(theme.heading) as Rgb,
		body: parseHex(theme.body) as Rgb,
		accent: parseHex(theme.accent) as Rgb,
	}
	return Object.values(colors).every(Boolean) && passesBase(colors) && buttonsReadable(theme, 'base')
}

const keptNote = (theme: ThemeSettings): Issue[] =>
	themePasses(theme)
		? []
		: [{
				level: 'warn',
				code: 'surface-changed',
				message: 'Some text is hard to read on your current colors, so they are kept as they are and plainer background bands are used.',
			}]

export function resolveDesign(input: {
	reply: DesignChoice
	personality: PersonalityId
	pins: Pick<BuildPins, 'palette' | 'fonts' | 'shape'>
	keepDesign: boolean // append with keepDesign, and every replace-page: look = null, kit solved for current
	current: BuilderLook | null
	header: HeaderVariant
}): ResolvedDesign {
	const { reply, personality, pins, keepDesign, header } = input
	// Own keys only: 'constructor' or 'toString' would otherwise read Object's prototype.
	const persona = Object.hasOwn(PERSONALITIES, personality) ? PERSONALITIES[personality] : PERSONALITIES.friendly
	const current = sanitizeLook(input.current ?? {}).theme
	const notes: Issue[] = []

	if (keepDesign) {
		const kit = solveSurfaceKit(current, persona.id)
		const polarity = polarityOf(themeColorsOf(current))
		return {
			look: null,
			theme: current,
			kit,
			polarity,
			paletteId: 'keep',
			fontPairId: 'keep',
			view: {
				polarity,
				personality: persona.id,
				palette: { id: 'keep', name: 'Your current colors', colors: themeColorsOf(current) },
				fonts: { id: 'keep', heading: current.headingFont, body: current.bodyFont },
				shape: current.radius,
				buttons: current.buttonFill,
				backdrop: 'keep',
			},
			notes: keptNote(current),
		}
	}

	const palette = resolveColors(reply, persona, pins.palette, current, notes)
	const fonts = resolveFonts(reply, persona, pins.fonts, current, notes)
	// The reader already turns unknown enums into null; anything else still takes the default.
	const shape: Shape = isShape(pins.shape) ? pins.shape : isShape(reply.shape) ? reply.shape : persona.shape
	const style = reply.buttons === 'solid' || reply.buttons === 'gradient' ? reply.buttons : persona.buttons
	const wanted: BackdropId = BACKDROP_IDS.some((id) => id === reply.backdrop) ? (reply.backdrop as BackdropId) : persona.backdrop
	const footerTone = reply.footerTone === 'soft' || reply.footerTone === 'inverse' ? reply.footerTone : 'match'
	const width = WIDTHS.find((item) => item === reply.width) ?? '6xl'
	const light = polarityOf(palette.colors) === 'light'
	const polarity = light ? 'light' : 'dark'

	const base: ThemeSettings = {
		...defaultSettings,
		...palette.colors,
		headingFont: fonts.heading,
		bodyFont: fonts.body,
		maxWidth: width,
		radius: shape,
	}
	const buttons: Buttons = palette.kept
		? {
				buttonFill: current.buttonFill,
				buttonFrom: { ...current.buttonFrom },
				buttonTo: { ...current.buttonTo },
				buttonAngle: current.buttonAngle,
			}
		: resolveButtons(base, style, light)
	const theme = sanitizeLook({ theme: { ...base, ...buttons } }).theme

	const kit = solveSurfaceKit(theme, persona.id)
	// A backdrop whose corner has no readable value on this theme falls back; the plan card shows the one painted.
	const backdrop = backdropFor(wanted, kit)
	const look = sanitizeLook({
		theme,
		page: backdropSettings(backdrop, kit),
		header: headerLook(header, polarity),
		footer: footerLook(footerTone, kit),
		blocks: {},
	})
	if (palette.kept) notes.push(...keptNote(look.theme))

	return {
		look: { theme: look.theme, page: look.page, header: look.header, footer: look.footer },
		theme: look.theme,
		kit,
		polarity,
		paletteId: palette.id,
		fontPairId: fonts.id,
		view: {
			polarity,
			personality: persona.id,
			palette: { id: palette.id, name: palette.name, colors: themeColorsOf(look.theme) },
			fonts: { id: fonts.id, heading: look.theme.headingFont, body: look.theme.bodyFont },
			shape: look.theme.radius,
			buttons: look.theme.buttonFill,
			backdrop,
		},
		notes,
	}
}
