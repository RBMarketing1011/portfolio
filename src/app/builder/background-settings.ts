import {
	clampLightness,
	readTint,
	writeTint,
	type Tint,
} from './theme-settings'

export const patterns = [
	{ id: 'none', label: 'None', hint: 'Flat color only' },
	{ id: 'grid', label: 'Grid', hint: 'Square rule lines' },
	{ id: 'dots', label: 'Dots', hint: 'Even dot matrix' },
	{ id: 'lines', label: 'Lines', hint: 'Single hairline stripes' },
	{ id: 'crosshatch', label: 'Crosshatch', hint: 'Two crossing stripe sets' },
	{ id: 'rings', label: 'Rings', hint: 'Concentric radial rings' },
] as const

export type PatternId = (typeof patterns)[number]['id']

export type SurfaceSettings = {
	pattern: PatternId
	patternAngle: number
	patternColor: Tint
	fill: 'solid' | 'gradient' | 'transparent'
	gradientAngle: number
	/** The flat color under everything, and what shows when the fill is solid. */
	color: Tint
	from: Tint
	to: Tint
}

// Glow colors come from the theme palette only, never a free hex.
export const glowModes = [
	{ id: 'none', label: 'None', hint: 'Plain hairline border' },
	{ id: 'accent', label: 'Accent', hint: 'The theme accent color' },
	{ id: 'heading', label: 'Heading', hint: 'The theme heading color' },
	{ id: 'body', label: 'Body', hint: 'The theme body color' },
] as const

export type GlowMode = (typeof glowModes)[number]['id']

export const glowSizes = [
	{ id: 'sm', label: 'sm' },
	{ id: 'md', label: 'md' },
	{ id: 'lg', label: 'lg' },
	{ id: 'xl', label: 'xl' },
	{ id: '2xl', label: '2xl' },
] as const

export type GlowSize = (typeof glowSizes)[number]['id']

export type GlowSettings = {
	mode: GlowMode
	lightness: number
	size: GlowSize
}

export type BackgroundSettings = {
	page: SurfaceSettings
	megaMenu: boolean
	menu: SurfaceSettings
	panelGlow: GlowSettings
	featureGlow: GlowSettings
}

// The page default reproduces the background the sections used to carry themselves;
// the menu default matches the flat popover surface it has today.
export const defaultBackground: BackgroundSettings = {
	page: {
		pattern: 'grid',
		patternAngle: 0,
		patternColor: { token: 'accent', lightness: 0 },
		fill: 'gradient',
		gradientAngle: 135,
		color: { token: 'background', lightness: 0 },
		from: { token: 'accent', lightness: 0 },
		to: { token: 'background', lightness: 0 },
	},
	megaMenu: true,
	menu: {
		pattern: 'none',
		patternAngle: 0,
		patternColor: { token: 'accent', lightness: 0 },
		fill: 'solid',
		gradientAngle: 135,
		color: { token: 'background', lightness: 7 },
		from: { token: 'accent', lightness: 0 },
		to: { token: 'background', lightness: 7 },
	},
	panelGlow: { mode: 'accent', lightness: 0, size: 'md' },
	featureGlow: { mode: 'accent', lightness: 0, size: 'sm' },
}

const surfaceKeys = {
	page: {
		pattern: 'pt',
		patternAngle: 'pa',
		fill: 'fl',
		gradientAngle: 'ga',
		patternColor: { token: 'ptc', lightness: 'ptl' },
		color: { token: 'sc', lightness: 'scl' },
		from: { token: 'gf', lightness: 'gfl' },
		to: { token: 'gt', lightness: 'gtl' },
	},
	menu: {
		pattern: 'mpt',
		patternAngle: 'mpa',
		fill: 'mfl',
		gradientAngle: 'mga',
		patternColor: { token: 'mptc', lightness: 'mptl' },
		color: { token: 'msc', lightness: 'mscl' },
		from: { token: 'mgf', lightness: 'mgfl' },
		to: { token: 'mgt', lightness: 'mgtl' },
	},
} as const

const glowKeys = {
	panelGlow: { mode: 'gl', lightness: 'gll', size: 'gs' },
	featureGlow: { mode: 'fgl', lightness: 'fgll', size: 'fgs' },
} as const

type TintKeys = { token: string; lightness: string }
type SurfaceKeys = {
	pattern: string
	patternAngle: string
	fill: string
	gradientAngle: string
	patternColor: TintKeys
	color: TintKeys
	from: TintKeys
	to: TintKeys
}
type GlowKeys = { mode: string; lightness: string; size: string }

const isPattern = (value: string | null): value is PatternId =>
	patterns.some((item) => item.id === value)

const readAngle = (value: string | null) => {
	// Number(null) is 0, which would silently override the default.
	if (value === null || value.trim() === '') return null
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return null
	return ((Math.round(parsed) % 360) + 360) % 360
}

const normalizeHex = (value: string | null) => {
	if (!value) return null
	const hex = value.startsWith('#') ? value.slice(1) : value
	return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : null
}

function readSurface(
	params: URLSearchParams,
	keys: SurfaceKeys,
	fallback: SurfaceSettings,
): SurfaceSettings {
	const next = { ...fallback }

	const pattern = params.get(keys.pattern)
	if (isPattern(pattern)) next.pattern = pattern

	const patternAngle = readAngle(params.get(keys.patternAngle))
	if (patternAngle !== null) next.patternAngle = patternAngle

	next.patternColor = readTint(params, keys.patternColor, fallback.patternColor)
	next.color = readTint(params, keys.color, fallback.color)
	next.from = readTint(params, keys.from, fallback.from)
	next.to = readTint(params, keys.to, fallback.to)

	const fill = params.get(keys.fill)
	if (fill === 'solid' || fill === 'gradient' || fill === 'transparent')
		next.fill = fill

	const gradientAngle = readAngle(params.get(keys.gradientAngle))
	if (gradientAngle !== null) next.gradientAngle = gradientAngle

	return next
}

function readGlow(
	params: URLSearchParams,
	keys: GlowKeys,
	fallback: GlowSettings,
): GlowSettings {
	const mode = params.get(keys.mode)
	const size = params.get(keys.size)
	const raw = params.get(keys.lightness)
	const lightness = raw === null || raw.trim() === '' ? null : Number(raw)

	return {
		mode: glowModes.some((item) => item.id === mode)
			? (mode as GlowMode)
			: fallback.mode,
		lightness:
			lightness !== null && Number.isFinite(lightness)
				? clampLightness(lightness)
				: fallback.lightness,
		size: glowSizes.some((item) => item.id === size)
			? (size as GlowSize)
			: fallback.size,
	}
}

export function readBackground(params: URLSearchParams): BackgroundSettings {
	return {
		page: readSurface(params, surfaceKeys.page, defaultBackground.page),
		megaMenu: params.get('mm') !== '0',
		menu: readSurface(params, surfaceKeys.menu, defaultBackground.menu),
		panelGlow: readGlow(
			params,
			glowKeys.panelGlow,
			defaultBackground.panelGlow,
		),
		featureGlow: readGlow(
			params,
			glowKeys.featureGlow,
			defaultBackground.featureGlow,
		),
	}
}

function writeSurface(
	params: URLSearchParams,
	keys: SurfaceKeys,
	value: SurfaceSettings,
	fallback: SurfaceSettings,
) {
	for (const key of [
		'pattern',
		'patternAngle',
		'fill',
		'gradientAngle',
	] as const) {
		if (value[key] === fallback[key]) params.delete(keys[key])
		else params.set(keys[key], String(value[key]))
	}

	for (const key of ['patternColor', 'color', 'from', 'to'] as const) {
		writeTint(params, keys[key], value[key], fallback[key])
	}
}

function writeGlow(
	params: URLSearchParams,
	keys: GlowKeys,
	value: GlowSettings,
	fallback: GlowSettings,
) {
	if (value.mode === fallback.mode) params.delete(keys.mode)
	else params.set(keys.mode, value.mode)

	if (value.lightness === fallback.lightness) params.delete(keys.lightness)
	else params.set(keys.lightness, String(value.lightness))

	if (value.size === fallback.size) params.delete(keys.size)
	else params.set(keys.size, value.size)
}

export function writeBackground(
	params: URLSearchParams,
	settings: BackgroundSettings,
): URLSearchParams {
	const next = new URLSearchParams(params.toString())

	writeSurface(next, surfaceKeys.page, settings.page, defaultBackground.page)
	writeSurface(next, surfaceKeys.menu, settings.menu, defaultBackground.menu)
	writeGlow(
		next,
		glowKeys.panelGlow,
		settings.panelGlow,
		defaultBackground.panelGlow,
	)
	writeGlow(
		next,
		glowKeys.featureGlow,
		settings.featureGlow,
		defaultBackground.featureGlow,
	)

	if (settings.megaMenu === defaultBackground.megaMenu) next.delete('mm')
	else next.set('mm', settings.megaMenu ? '1' : '0')

	return next
}
