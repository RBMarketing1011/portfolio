import { fontStack } from '@/app/builder/google-fonts'
import {
	defaultBackground,
	type BackgroundSettings,
	type GlowSettings,
	type GlowSize,
	type SurfaceSettings,
} from '@/app/builder/background-settings'
import {
	contentWidthValue,
	defaultSettings,
	isShape,
	shapeRadius,
	tintVar,
	type Shape,
	type ThemeSettings,
} from '@/app/builder/theme-settings'
import type { ThemeColors } from '@/lib/builder/design/contrast'
import { deriveScheme, polarityOf, schemeStrong } from '@/lib/builder/design/scheme'
import { BLOCK_KEY, cssText, sanitizeLook, type BuilderLook } from '@/lib/builder/look'

// Settings arrive from the URL, so nothing but validated hex reaches the stylesheet.
const safeHex = (value: string, fallback: string) =>
	/^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback

/** The four colours a token set is drawn from: hex at the root, `var()` inside a band. */
type Colors = { background: string; accent: string; heading: string; body: string }

// Shadows: black on dark sites; on light ones a soft slate, its alpha scaled down with it.
// Every shadow in the kit mixes this at its own strength, so one token sets both.
const SHADOW_INK = { dark: 'rgb(0 0 0)', light: 'rgb(15 23 42 / 0.28)' } as const

// The primary button's hover fill: the accent pushed away from the page, so its label (the
// background colour) stays readable. Toward white on dark sites, toward black on light ones.
const STRONG_MIX = 78

/** Every colour token the kit reads, from four colours, the hover fill and the shadow ink. */
function tokensFrom(colors: Colors, strong: string, shadow: string) {
	const { background, accent, heading, body } = colors

	// Surfaces are the background lifted toward the heading color, so they stay
	// correct whether the chosen background is dark or light.
	const lift = (percent: number) =>
		`color-mix(in srgb, ${heading} ${percent}%, ${background})`
	const fade = (percent: number) =>
		`color-mix(in srgb, ${body} ${percent}%, ${background})`

	return {
		'--color-ink': background,
		'--color-brand': accent,
		'--color-brand-strong': strong,
		'--color-panel': lift(6),

		'--background': background,
		'--color-background': background,
		'--card': lift(5),
		'--color-card': lift(5),
		'--popover': lift(7),
		'--color-popover': lift(7),
		'--sidebar': lift(5),
		'--color-sidebar': lift(5),
		'--secondary': lift(10),
		'--color-secondary': lift(10),
		'--muted': lift(8),
		'--color-muted': lift(8),
		'--accent': lift(12),
		'--color-accent': lift(12),

		'--foreground': heading,
		'--color-foreground': heading,
		'--card-foreground': heading,
		'--color-card-foreground': heading,
		'--popover-foreground': heading,
		'--color-popover-foreground': heading,
		'--secondary-foreground': heading,
		'--color-secondary-foreground': heading,
		'--accent-foreground': heading,
		'--color-accent-foreground': heading,
		'--sidebar-foreground': heading,
		'--color-sidebar-foreground': heading,
		'--muted-foreground': body,
		'--color-muted-foreground': body,

		'--primary': accent,
		'--color-primary': accent,
		'--primary-foreground': background,
		'--color-primary-foreground': background,
		'--sidebar-primary': accent,
		'--color-sidebar-primary': accent,
		'--sidebar-primary-foreground': background,
		'--color-sidebar-primary-foreground': background,
		'--ring': accent,
		'--color-ring': accent,
		'--sidebar-ring': accent,
		'--color-sidebar-ring': accent,

		'--border': lift(15),
		'--color-border': lift(15),
		'--input': lift(22),
		'--color-input': lift(22),
		'--sidebar-border': lift(15),
		'--color-sidebar-border': lift(15),

		// Overlays such as bg-white/10 read --color-white, so pointing it at the
		// heading keeps them readable on light and dark backgrounds alike.
		'--color-white': heading,
		'--color-slate-100': body,
		'--color-slate-200': body,
		'--color-slate-300': body,
		'--color-slate-400': fade(88),
		'--color-slate-500': fade(66),
		'--color-slate-600': fade(46),
		'--color-slate-700': fade(32),

		'--shadow-ink': shadow,
	}
}

const declarations = (tokens: Record<string, string>) =>
	Object.entries(tokens)
		.map(([key, value]) => `${key}:${value};`)
		.join('')

// Tailwind's own 2xl and 3xl are the soft pair; the other shapes scale them with --radius.
const largeRadius: Record<Shape, [string, string]> = {
	sharp: ['0.5rem', '0.75rem'],
	soft: ['1rem', '1.5rem'],
	round: ['1.5rem', '2rem'],
}

type SchemeName = 'inverse' | 'brand'

const SCHEME_PREFIX: Record<SchemeName, string> = { inverse: 'inv', brand: 'brand' }

/**
 * The band colours of both schemes, solved in JS from the theme (design/scheme.ts) and
 * written at the root, so a scoped surface can re-declare its tokens from them without
 * knowing the theme.
 */
function schemeVars(colors: ThemeColors) {
	const vars: Record<string, string> = {}
	for (const scheme of ['inverse', 'brand'] as const) {
		const band = deriveScheme(colors, scheme)
		const name = (key: string) => `--sch-${SCHEME_PREFIX[scheme]}-${key}`
		vars[name('bg')] = band.background
		vars[name('accent')] = band.accent
		vars[name('heading')] = band.heading
		vars[name('body')] = band.body
		vars[name('strong')] = schemeStrong(colors, scheme)
		vars[name('shadow')] = SHADOW_INK[polarityOf(band)]
	}
	return vars
}

function tokens(settings: ThemeSettings) {
	const colors = {
		background: safeHex(settings.background, defaultSettings.background),
		accent: safeHex(settings.accent, defaultSettings.accent),
		heading: safeHex(settings.heading, defaultSettings.heading),
		body: safeHex(settings.body, defaultSettings.body),
	}
	const polarity = polarityOf(colors)
	const strong = `color-mix(in srgb, ${colors.accent} ${STRONG_MIX}%, ${polarity === 'light' ? 'black' : 'white'})`

	const headingFamily = fontStack(settings.headingFont)
	const bodyFamily = fontStack(settings.bodyFont)

	// A look saved before shapes existed has no radius, which is the soft default.
	const shape = isShape(settings.radius) ? settings.radius : defaultSettings.radius
	const [radius2xl, radius3xl] = largeRadius[shape]

	return {
		...tokensFrom(colors, strong, SHADOW_INK[polarity]),

		'--font-heading': headingFamily,
		'--font-body': bodyFamily,
		'--font-space-grotesk': headingFamily,
		'--font-dm-sans': bodyFamily,

		// Sections, header, and footer all measure from this one value.
		'--content-max': contentWidthValue(settings.maxWidth),

		// Cards, buttons, inputs and badges all derive their corners from --radius.
		'--radius': shapeRadius[shape],
		'--radius-2xl': radius2xl,
		'--radius-3xl': radius3xl,

		...schemeVars(colors),
	}
}

// The primary button is the one carrying bg-brand, so its fill is dressed here.
const PRIMARY = `[data-slot='button'].bg-brand`

/**
 * Emitted as a :root stylesheet rather than inline styles because Radix portals
 * (sheet, dialog, dropdown) mount to document.body and would escape a wrapper.
 */
export function themeCss(settings: ThemeSettings) {
	const root = `:root{${declarations(tokens(settings))}}`

	if (settings.buttonFill !== 'gradient')
		return cssText(`${root}${PRIMARY}{background-image:none;}`)

	const from = tintVar(settings.buttonFrom)
	const to = tintVar(settings.buttonTo)
	const angle = Number.isFinite(settings.buttonAngle)
		? ((Math.round(settings.buttonAngle) % 360) + 360) % 360
		: defaultSettings.buttonAngle
	const lift = (color: string) =>
		`color-mix(in srgb, ${color} 88%, var(--color-white))`

	return cssText(
		[
			root,
			`${PRIMARY}{background-image:linear-gradient(${angle}deg, ${from}, ${to});}`,
			`${PRIMARY}:hover{background-image:linear-gradient(${angle}deg, ${lift(from)}, ${lift(to)});}`,
		].join(''),
	)
}

// Every pattern is drawn upright; the layer that carries them is rotated instead,
// so one angle control works the same for stripes, dots and rings alike.
const patternLayers = (
	color: string,
): Record<
	BackgroundSettings['page']['pattern'],
	{ image: string; size: string } | null
> => {
	const rule = `color-mix(in srgb, ${color} 7%, transparent)`
	const mark = `color-mix(in srgb, ${color} 12%, transparent)`

	return {
		none: null,
		grid: {
			image: `linear-gradient(${rule} 1px, transparent 1px), linear-gradient(90deg, ${rule} 1px, transparent 1px)`,
			size: '44px 44px, 44px 44px',
		},
		dots: {
			image: `radial-gradient(circle at center, ${mark} 1.5px, transparent 1.6px)`,
			size: '26px 26px',
		},
		lines: {
			image: `repeating-linear-gradient(90deg, ${rule} 0 1px, transparent 1px 16px)`,
			size: 'auto',
		},
		crosshatch: {
			image: `repeating-linear-gradient(45deg, ${rule} 0 1px, transparent 1px 22px), repeating-linear-gradient(-45deg, ${rule} 0 1px, transparent 1px 22px)`,
			size: 'auto',
		},
		rings: {
			image: `repeating-radial-gradient(circle at center, transparent 0 46px, ${mark} 46px 47px)`,
			size: 'auto',
		},
	}
}

const safeAngle = (value: number, fallback: number) =>
	Number.isFinite(value) ? ((Math.round(value) % 360) + 360) % 360 : fallback

/** The color under the surface: the flat pick when solid, the last stop when gradient. */
const surfaceColor = (surface: SurfaceSettings) =>
	surface.fill === 'transparent' || surface.fill === 'global'
		? 'transparent'
		: tintVar(surface.fill === 'gradient' ? surface.to : surface.color)

const wash = (surface: SurfaceSettings, fallback: number) => {
	if (surface.fill !== 'gradient') return 'none'
	const angle = safeAngle(surface.gradientAngle, fallback)
	const from = tintVar(surface.from)
	const to = tintVar(surface.to)
	return `linear-gradient(${angle}deg, color-mix(in srgb, ${from} 30%, transparent) 0%, color-mix(in srgb, ${from} 14%, transparent) 28%, color-mix(in srgb, ${to} 60%, transparent) 62%, color-mix(in srgb, ${to} 95%, transparent) 100%)`
}

/** Each selector of a list with the same suffix, e.g. `::before`. */
const each = (selector: string, suffix: string) =>
	selector
		.split(', ')
		.map((part) => `${part}${suffix}`)
		.join(', ')

const patternRule = (
	selector: string,
	surface: SurfaceSettings,
	position: 'fixed' | 'absolute',
	fallback: number,
) => {
	const layers = patternLayers(tintVar(surface.patternColor))
	const layer = Object.hasOwn(layers, surface.pattern) ? layers[surface.pattern] : null
	if (!layer) return ''
	const angle = safeAngle(surface.patternAngle, fallback)
	return `${each(selector, '::before')}{content:'';position:${position};inset:-100%;z-index:-1;pointer-events:none;background-image:${layer.image};background-size:${layer.size};transform:rotate(${angle}deg);}`
}

/**
 * Which element the surface controls dress. Chrome entries paint the header or
 * footer itself and leave the page behind them flat.
 */
export type SurfaceTarget = 'page' | 'header' | 'footer'

export function surfaceTargetFor(slug: string): SurfaceTarget {
	if (slug === 'site-header') return 'header'
	if (slug === 'site-footer') return 'footer'
	return 'page'
}

/**
 * The header is painted on a decorative layer inside it, clipped to the bar (or the pill
 * of a floating header), so a pattern never bleeds and the header itself stays unclipped
 * for its menu panels. The kit's own header (site-header.tsx) is that layer already.
 */
const HEADER_LAYER = `html [data-surface='header'] [data-surface-layer], html [data-surface='header'][aria-hidden]`

/** The selector a block's surface paints: the section element inside its display:contents wrapper. */
const blockScope = (id: string) => `[data-block-id='${id}'] > *`

/** A block scope is only ever this exact shape, with a key that passes BLOCK_KEY. */
const isBlockScope = (scope: string) => {
	const match = /^\[data-block-id='(.*)'\] > \*$/.exec(scope)
	return Boolean(match && BLOCK_KEY.test(match[1]))
}

// Blur and spread follow Tailwind's shadow scale, read as a glow rather than a drop.
const glowScale: Record<GlowSize, string> = {
	sm: '0 1px 6px -1px',
	md: '0 4px 14px -3px',
	lg: '0 8px 26px -6px',
	xl: '0 14px 40px -10px',
	'2xl': '0 24px 64px -16px',
}

const glowShadow = (glow: GlowSettings) => {
	if (glow.mode === 'none') return null
	const color = tintVar({ token: glow.mode, lightness: glow.lightness })
	const size = Object.hasOwn(glowScale, glow.size) ? glowScale[glow.size] : glowScale.md
	return {
		border: `color-mix(in srgb, ${color} 60%, transparent)`,
		shadow: `0 0 0 1px color-mix(in srgb, ${color} 30%, transparent), ${size} color-mix(in srgb, ${color} 75%, transparent)`,
	}
}

const schemeOf = (settings: BackgroundSettings): SchemeName | null =>
	settings.scheme === 'inverse' || settings.scheme === 'brand' ? settings.scheme : null

/**
 * A band's tokens: every colour token re-declared from the root's scheme colours (never
 * fonts or the measure), so the section's text, buttons and surface tints all take the
 * band's colours. Primary buttons are a solid fill inside a band: the gradient belongs to
 * the page's own surfaces.
 */
function schemeRule(scheme: SchemeName, selectors: string[]) {
	if (!selectors.length) return ''
	const v = (key: string) => `var(--sch-${SCHEME_PREFIX[scheme]}-${key})`
	const band = tokensFrom(
		{ background: v('bg'), accent: v('accent'), heading: v('heading'), body: v('body') },
		v('strong'),
		v('shadow'),
	)
	const buttons = selectors
		.flatMap((selector) => [`${selector} ${PRIMARY}`, `${selector} ${PRIMARY}:hover`])
		.join(', ')
	return `${selectors.join(', ')}{${declarations(band)}}${buttons}{background-image:none;}`
}

function surfaceCss(
	settings: BackgroundSettings,
	target: SurfaceTarget,
	globals: boolean,
	scope: string | undefined,
	/** Off when the caller writes the scheme's tokens itself, once for many blocks. */
	withSchemeTokens: boolean,
) {
	// A scope is only ever built from a block id; anything else would write CSS of its own.
	if (scope !== undefined && !isBlockScope(scope)) return ''

	const { menu } = settings
	const panel = glowShadow(settings.panelGlow)
	const feature = glowShadow(settings.featureGlow)
	const flatBorder = 'color-mix(in srgb, var(--color-white) 12%, transparent)'

	// Colours of its own are honoured on blocks and the footer only.
	const scheme = scope !== undefined || target === 'footer' ? schemeOf(settings) : null
	// A band in other colours must paint its own background, or its text would sit on the page's.
	const page =
		scheme && (settings.page.fill === 'global' || settings.page.fill === 'transparent')
			? {
					...settings.page,
					fill: 'solid' as const,
					color: { token: 'background' as const, lightness: 0 },
				}
			: settings.page

	// The shared panel in mega mode, or the plain dropdowns when it is off.
	const panelSelector = `[data-slot='navigation-menu-viewport'], [data-slot='dropdown-menu-content']`

	const menuRules = [
		`${panelSelector}{position:relative;isolation:isolate;overflow:hidden;background-color:${surfaceColor(menu)};background-image:${wash(menu, defaultBackground.menu.gradientAngle)};}`,
		patternRule(
			panelSelector,
			menu,
			'absolute',
			defaultBackground.menu.patternAngle,
		),
		panel
			? `${panelSelector}{border-color:${panel.border};box-shadow:${panel.shadow};}`
			: `${panelSelector}{border-color:${flatBorder};box-shadow:none;}`,
		feature
			? `[data-menu-feature]{border-color:${feature.border};box-shadow:${feature.shadow};}`
			: `[data-menu-feature]{border-color:${flatBorder};box-shadow:none;}`,
	]

	// The menu panel is the header's, and its settings live in the header drawer. A
	// layered header (globals off, as on a built site) must still write them, or the
	// panel keeps the page's defaults whatever is chosen. It is emitted after the page
	// surface, so these rules win over the page's own defaults.
	const withMenu = globals || target === 'header'

	if (target === 'page' && !scope) {
		return [
			`html{background-color:${surfaceColor(page)};background-image:${wash(page, defaultBackground.page.gradientAngle)};background-attachment:fixed;}`,
			// The section surfaces are transparent now, so the html layer is what shows.
			`body{background-color:transparent;}`,
			patternRule(
				'body',
				page,
				'fixed',
				defaultBackground.page.patternAngle,
			),
			...menuRules,
		].join('')
	}

	// Chrome keeps a little translucency so the header's backdrop blur still reads.
	const base =
		target === 'header'
			? `color-mix(in srgb, ${surfaceColor(page)} 85%, transparent)`
			: surfaceColor(page)
	// One step more specific than the utility classes already on the element.
	const selector =
		scope ??
		(target === 'header' ? HEADER_LAYER : `html [data-surface='${target}']`)
	// Painting nothing is the point of `global`: no colour, no wash, no pattern, and
	// no stacking context that would cut this element out of the page background.
	const pageReset = globals
		? [
				`html{background-color:var(--color-ink);background-image:none;}`,
				`body{background-color:transparent;}`,
			]
		: []
	if (page.fill === 'global')
		return [...pageReset, ...(withMenu ? menuRules : [])].join('')

	// The header's surface is already its own clipped layer; the footer is the element
	// itself. A block clips its pattern with `clip`, which, unlike `hidden`, makes no
	// scroll container, so sticky content inside the section still sticks (`hidden` is
	// the fallback where `clip` is unknown).
	const box = scope
		? 'position:relative;isolation:isolate;overflow:hidden;overflow:clip;'
		: target === 'footer'
			? 'position:relative;isolation:isolate;overflow:hidden;'
			: ''

	return [
		...pageReset,
		scheme && withSchemeTokens ? schemeRule(scheme, [selector]) : '',
		`${selector}{${box}background-color:${base};background-image:${wash(page, defaultBackground.page.gradientAngle)};}`,
		patternRule(
			selector,
			page,
			'absolute',
			defaultBackground.page.patternAngle,
		),
		...(withMenu ? menuRules : []),
	].join('')
}

export function backgroundCss(
	settings: BackgroundSettings,
	target: SurfaceTarget = 'page',
	/** Off when layering several surfaces, so they do not fight over html/body. */
	globals = true,
	/** Paints this selector instead of the target's surface, for a single block. */
	scope?: string,
) {
	return cssText(surfaceCss(settings, target, globals, scope, true))
}

/**
 * The whole look as one stylesheet: the theme, the page backdrop, the header and footer,
 * and the block surfaces, shared by the hosted site, the preview and the canvas. With
 * `blockIds` only those blocks' surfaces are written (the page being rendered), and each
 * scheme's tokens are written once for all of its blocks, so a many-page site does not
 * inline every page's bands into every page.
 */
export function lookCss(look: BuilderLook, opts?: { blockIds?: string[] }): string {
	// Read again here, so a look from anywhere paints only what it is allowed to.
	const safe = sanitizeLook(look)
	const wanted = opts?.blockIds ? new Set(opts.blockIds) : null
	const blocks = Object.entries(safe.blocks).filter(
		([id]) => BLOCK_KEY.test(id) && (!wanted || wanted.has(id)),
	)

	const bands = (['inverse', 'brand'] as const)
		.map((scheme) =>
			schemeRule(
				scheme,
				blocks.filter(([, surface]) => surface.scheme === scheme).map(([id]) => blockScope(id)),
			),
		)
		.filter(Boolean)

	return cssText(
		[
			themeCss(safe.theme),
			backgroundCss(safe.page),
			backgroundCss(safe.header, 'header', false),
			backgroundCss(safe.footer, 'footer', false),
			...bands,
			...blocks.map(([id, surface]) =>
				cssText(surfaceCss(surface, 'page', false, blockScope(id), false)),
			),
		].join('\n'),
	)
}
