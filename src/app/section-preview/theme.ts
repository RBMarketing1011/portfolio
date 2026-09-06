import { fontStack } from '@/app/sections/google-fonts'
import {
	defaultSettings,
	type ThemeSettings,
} from '@/app/sections/theme-settings'

// Settings arrive from the URL, so nothing but validated hex reaches the stylesheet.
const safeHex = (value: string, fallback: string) =>
	/^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback

function tokens(settings: ThemeSettings) {
	const background = safeHex(settings.background, defaultSettings.background)
	const accent = safeHex(settings.accent, defaultSettings.accent)
	const heading = safeHex(settings.heading, defaultSettings.heading)
	const body = safeHex(settings.body, defaultSettings.body)

	// Surfaces are the background lifted toward the heading colour, so they stay
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

	return `:root{${declarations}}`
}
