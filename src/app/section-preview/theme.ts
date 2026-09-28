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
	tintVar,
	type ThemeSettings,
} from '@/app/builder/theme-settings'

// Settings arrive from the URL, so nothing but validated hex reaches the stylesheet.
const safeHex = (value: string, fallback: string) =>
	/^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback

function tokens(settings: ThemeSettings) {
	const background = safeHex(settings.background, defaultSettings.background)
	const accent = safeHex(settings.accent, defaultSettings.accent)
	const heading = safeHex(settings.heading, defaultSettings.heading)
	const body = safeHex(settings.body, defaultSettings.body)

	// Surfaces are the background lifted toward the heading color, so they stay
	// correct whether the chosen background is dark or light.
	const lift = (percent: number) =>
		`color-mix(in srgb, ${heading} ${percent}%, ${background})`
	const fade = (percent: number) =>
		`color-mix(in srgb, ${body} ${percent}%, ${background})`

	const headingFamily = fontStack(settings.headingFont)
	const bodyFamily = fontStack(settings.bodyFont)

	return {
		'--color-ink': background,
		'--color-brand': accent,
		'--color-brand-strong': `color-mix(in srgb, ${accent} 78%, white)`,
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

		'--font-heading': headingFamily,
		'--font-body': bodyFamily,
		'--font-space-grotesk': headingFamily,
		'--font-dm-sans': bodyFamily,

		// Sections, header, and footer all measure from this one value.
		'--content-max': contentWidthValue(settings.maxWidth),
	}
}

/**
 * Emitted as a :root stylesheet rather than inline styles because Radix portals
 * (sheet, dialog, dropdown) mount to document.body and would escape a wrapper.
 */
export function themeCss(settings: ThemeSettings) {
	const declarations = Object.entries(tokens(settings))
		.map(([key, value]) => `${key}:${value};`)
		.join('')

	// The primary button is the one carrying bg-brand, so its fill is dressed here.
	const primary = `[data-slot='button'].bg-brand`
	if (settings.buttonFill !== 'gradient')
		return `:root{${declarations}}${primary}{background-image:none;}`

	const from = tintVar(settings.buttonFrom)
	const to = tintVar(settings.buttonTo)
	const angle = Number.isFinite(settings.buttonAngle)
		? ((Math.round(settings.buttonAngle) % 360) + 360) % 360
		: defaultSettings.buttonAngle
	const lift = (color: string) =>
		`color-mix(in srgb, ${color} 88%, var(--color-white))`

	return [
		`:root{${declarations}}`,
		`${primary}{background-image:linear-gradient(${angle}deg, ${from}, ${to});}`,
		`${primary}:hover{background-image:linear-gradient(${angle}deg, ${lift(from)}, ${lift(to)});}`,
	].join('')
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

const patternRule = (
	selector: string,
	surface: SurfaceSettings,
	position: 'fixed' | 'absolute',
	fallback: number,
) => {
	const layer = patternLayers(tintVar(surface.patternColor))[surface.pattern]
	if (!layer) return ''
	const angle = safeAngle(surface.patternAngle, fallback)
	return `${selector}{content:'';position:${position};inset:-100%;z-index:-1;pointer-events:none;background-image:${layer.image};background-size:${layer.size};transform:rotate(${angle}deg);}`
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
	const size = glowScale[glow.size] ?? glowScale.md
	return {
		border: `color-mix(in srgb, ${color} 60%, transparent)`,
		shadow: `0 0 0 1px color-mix(in srgb, ${color} 30%, transparent), ${size} color-mix(in srgb, ${color} 75%, transparent)`,
	}
}

export function backgroundCss(
	settings: BackgroundSettings,
	target: SurfaceTarget = 'page',
	/** Off when layering several surfaces, so they do not fight over html/body. */
	globals = true,
	/** Paints this selector instead of the target's surface, for a single block. */
	scope?: string,
) {
	const { page, menu } = settings
	const panel = glowShadow(settings.panelGlow)
	const feature = glowShadow(settings.featureGlow)
	const flatBorder = 'color-mix(in srgb, var(--color-white) 12%, transparent)'

	// The shared panel in mega mode, or the plain dropdowns when it is off.
	const panelSelector = `[data-slot='navigation-menu-viewport'], [data-slot='dropdown-menu-content']`

	const menuRules = [
		`${panelSelector}{position:relative;isolation:isolate;overflow:hidden;background-color:${surfaceColor(menu)};background-image:${wash(menu, defaultBackground.menu.gradientAngle)};}`,
		patternRule(
			`[data-slot='navigation-menu-viewport']::before, [data-slot='dropdown-menu-content']::before`,
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

	if (target === 'page' && !scope) {
		return [
			`html{background-color:${surfaceColor(page)};background-image:${wash(page, defaultBackground.page.gradientAngle)};background-attachment:fixed;}`,
			// The section surfaces are transparent now, so the html layer is what shows.
			`body{background-color:transparent;}`,
			patternRule(
				'body::before',
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
	const selector = scope ?? `html [data-surface='${target}']`
	// Painting nothing is the point of `global`: no colour, no wash, no pattern, and
	// no stacking context that would cut this element out of the page background.
	const pageReset = globals
		? [
				`html{background-color:var(--color-ink);background-image:none;}`,
				`body{background-color:transparent;}`,
			]
		: []
	if (page.fill === 'global')
		return [...pageReset, ...(globals ? menuRules : [])].join('')

	// The header's surface is already its own clipped layer; the footer is the element itself.
	const box =
		target === 'footer' || scope
			? 'position:relative;isolation:isolate;overflow:hidden;'
			: ''

	return [
		...pageReset,
		`${selector}{${box}background-color:${base};background-image:${wash(page, defaultBackground.page.gradientAngle)};}`,
		patternRule(
			`${selector}::before`,
			page,
			'absolute',
			defaultBackground.page.patternAngle,
		),
		...(globals ? menuRules : []),
	].join('')
}
