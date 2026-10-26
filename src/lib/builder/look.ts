/**
 * The site's look (theme, backdrop, header, footer and per-block surfaces) and the one
 * strict reader for it. A look arrives from Mongo, the URL, localStorage and the AI
 * pipeline, and every one of them can carry junk: a `null` tint, an unknown enum, a
 * block key built to break out of a stylesheet. `sanitizeLook` rebuilds every field
 * from its default instead of spreading what was saved, so nothing it returns can crash
 * the renderer or reach CSS unchecked.
 *
 * Pure: no React, no server code, so the store, the routes and the proofs share it.
 */
import { isGoogleFont } from '@/app/builder/google-fonts'
import {
	defaultBackground,
	globalBackground,
	glowModes,
	glowSizes,
	isSurfaceScheme,
	patterns,
	type BackgroundSettings,
	type GlowSettings,
	type SurfaceSettings,
} from '@/app/builder/background-settings'
import {
	clampLightness,
	defaultSettings,
	isContentWidth,
	isPaletteToken,
	isShape,
	type ThemeSettings,
	type Tint,
} from '@/app/builder/theme-settings'
import type { HeaderVariant } from './page-schema'

/** The site chrome carries its own surface, separate from the page surface. */
export type BuilderLook = {
	theme: ThemeSettings
	page: BackgroundSettings
	header: BackgroundSettings
	footer: BackgroundSettings
	/** Per-block surfaces, keyed by top-level block id. */
	blocks: Record<string, BackgroundSettings>
}

/** What a `look.blocks` key may be. The key becomes part of a CSS selector, so nothing else passes. */
export const BLOCK_KEY = /^[A-Za-z0-9_-]{1,40}$/

/** Every block surface is CSS on every page, so a runaway look is capped. */
const MAX_BLOCKS = 400

// Names that pass BLOCK_KEY but are never block ids, and would mean something else on an object.
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const HEX = /^#[0-9a-f]{6}$/i
const FILLS = ['global', 'solid', 'gradient', 'transparent'] as const

type Fields = Record<string, unknown>

/**
 * Own fields of a plain object; anything else reads as empty. The copy has no prototype,
 * so a saved `__proto__` or `constructor` key is just a field and nothing is inherited.
 */
const fieldsOf = (value: unknown): Fields => {
	const out: Fields = Object.create(null)
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return out
	for (const key of Object.keys(value)) out[key] = (value as Fields)[key]
	return out
}

const color = (value: unknown, fallback: string) =>
	typeof value === 'string' && HEX.test(value) ? value : fallback

const font = (value: unknown, fallback: string) =>
	typeof value === 'string' && isGoogleFont(value) ? value : fallback

// The renderer normalizes angles the same way, so a stored angle paints as it did.
const angle = (value: unknown, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value)
		? ((Math.round(value) % 360) + 360) % 360
		: fallback

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
	allowed.some((item) => item === value) ? (value as T) : fallback

function tint(value: unknown, fallback: Tint): Tint {
	const saved = fieldsOf(value)
	return {
		token: isPaletteToken(saved.token as string) ? (saved.token as Tint['token']) : fallback.token,
		lightness:
			typeof saved.lightness === 'number' && Number.isFinite(saved.lightness)
				? clampLightness(saved.lightness)
				: fallback.lightness,
	}
}

function surface(value: unknown, fallback: SurfaceSettings): SurfaceSettings {
	const saved = fieldsOf(value)
	return {
		pattern: oneOf(saved.pattern, patterns.map((item) => item.id), fallback.pattern),
		patternAngle: angle(saved.patternAngle, fallback.patternAngle),
		patternColor: tint(saved.patternColor, fallback.patternColor),
		fill: oneOf(saved.fill, FILLS, fallback.fill),
		gradientAngle: angle(saved.gradientAngle, fallback.gradientAngle),
		color: tint(saved.color, fallback.color),
		from: tint(saved.from, fallback.from),
		to: tint(saved.to, fallback.to),
	}
}

function glow(value: unknown, fallback: GlowSettings): GlowSettings {
	const saved = fieldsOf(value)
	return {
		mode: oneOf(saved.mode, glowModes.map((item) => item.id), fallback.mode),
		lightness:
			typeof saved.lightness === 'number' && Number.isFinite(saved.lightness)
				? clampLightness(saved.lightness)
				: fallback.lightness,
		size: oneOf(saved.size, glowSizes.map((item) => item.id), fallback.size),
	}
}

/** `scheme` is honoured on blocks and the footer only, so it is kept nowhere else. */
function background(
	value: unknown,
	fallback: BackgroundSettings,
	withScheme: boolean,
): BackgroundSettings {
	const saved = fieldsOf(value)
	const next: BackgroundSettings = {
		page: surface(saved.page, fallback.page),
		megaMenu: typeof saved.megaMenu === 'boolean' ? saved.megaMenu : fallback.megaMenu,
		menu: surface(saved.menu, fallback.menu),
		panelGlow: glow(saved.panelGlow, fallback.panelGlow),
		featureGlow: glow(saved.featureGlow, fallback.featureGlow),
	}
	if (withScheme && isSurfaceScheme(saved.scheme)) next.scheme = saved.scheme
	return next
}

function theme(value: unknown): ThemeSettings {
	const saved = fieldsOf(value)
	const fallback = defaultSettings
	return {
		background: color(saved.background, fallback.background),
		accent: color(saved.accent, fallback.accent),
		heading: color(saved.heading, fallback.heading),
		body: color(saved.body, fallback.body),
		headingFont: font(saved.headingFont, fallback.headingFont),
		bodyFont: font(saved.bodyFont, fallback.bodyFont),
		maxWidth: isContentWidth(saved.maxWidth as string) ? (saved.maxWidth as ThemeSettings['maxWidth']) : fallback.maxWidth,
		buttonFill: oneOf(saved.buttonFill, ['solid', 'gradient'] as const, fallback.buttonFill),
		buttonFrom: tint(saved.buttonFrom, fallback.buttonFrom),
		buttonTo: tint(saved.buttonTo, fallback.buttonTo),
		buttonAngle: angle(saved.buttonAngle, fallback.buttonAngle),
		radius: isShape(saved.radius) ? saved.radius : fallback.radius,
	}
}

function blocks(value: unknown): Record<string, BackgroundSettings> {
	const entries: [string, BackgroundSettings][] = []
	for (const [key, surface] of Object.entries(fieldsOf(value))) {
		if (entries.length >= MAX_BLOCKS) break
		if (!BLOCK_KEY.test(key) || RESERVED_KEYS.has(key)) continue
		// A partial entry saved by the builder inherits the page default, as it always has; so
		// does one that is not an object at all, exactly as the old merge painted it.
		entries.push([key, background(surface, defaultBackground, true)])
	}
	// fromEntries defines own properties, so no key can reach the object's prototype.
	return Object.fromEntries(entries)
}

/** Today's defaults, as fresh objects so no caller can mutate the shared constants. */
export function defaultLook(): BuilderLook {
	return {
		theme: theme({}),
		page: background({}, defaultBackground, false),
		// Chrome carries no surface of its own until it is deliberately given one.
		header: background({}, globalBackground, false),
		footer: background({}, globalBackground, false),
		blocks: {},
	}
}

/**
 * Reads any value as a complete, valid look. Never throws; every field that is missing
 * or invalid takes its own default (`page` and blocks fall back to the page default,
 * header and footer to the global one, exactly as the old merge did).
 */
export function sanitizeLook(value: unknown): BuilderLook {
	try {
		const saved = fieldsOf(value)
		return {
			theme: theme(saved.theme),
			page: background(saved.page, defaultBackground, false),
			header: background(saved.header, globalBackground, false),
			footer: background(saved.footer, globalBackground, true),
			blocks: blocks(saved.blocks),
		}
	} catch {
		// Only an exotic value (a throwing getter or proxy) gets here; the defaults always render.
		return defaultLook()
	}
}

/** The old name, kept for existing importers. */
export const mergeLook = sanitizeLook

/**
 * Makes a stylesheet safe to inline in a `<style>` element: no legitimate rule here
 * contains `<`, and without it the text can never close the element early.
 */
export function cssText(css: string): string {
	return String(css).replace(/</g, '\\3c ')
}

// Built sites have an in-flow sticky header, so heroes give back the space the kit
// reserves for the marketing site's overlay header, and in-page links clear the bar.
const SITE_VARS: Record<HeaderVariant, { trim: string; trimLg: string; header: string }> = {
	none: { trim: '4rem', trimLg: '4rem', header: '0rem' },
	bar: { trim: '5rem', trimLg: '5rem', header: '4.25rem' },
	floating: { trim: '5rem', trimLg: '5rem', header: '5.5rem' },
	stacked: { trim: '5rem', trimLg: '5rem', header: '6.75rem' },
}

/** The root variables a built site sets for its header variant (the kit defaults them to 0). */
export function builtSiteVars(header: HeaderVariant): string {
	const vars = Object.hasOwn(SITE_VARS, header) ? SITE_VARS[header] : SITE_VARS.bar
	return `:root{--hero-trim:${vars.trim};--hero-trim-lg:${vars.trimLg};--header-h:${vars.header}}`
}
