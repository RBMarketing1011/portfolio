import { isGoogleFont } from './google-fonts'

// The four colors the theme is built from. Everything else picks one of these.
export const paletteTokens = [
	{ id: 'background', label: 'Background' },
	{ id: 'accent', label: 'Accent' },
	{ id: 'heading', label: 'Heading' },
	{ id: 'body', label: 'Body' },
] as const

export type PaletteToken = (typeof paletteTokens)[number]['id']

export const paletteVar: Record<PaletteToken, string> = {
	background: 'var(--color-ink)',
	accent: 'var(--color-brand)',
	heading: 'var(--foreground)',
	body: 'var(--muted-foreground)',
}

/** A palette color plus a lightness offset, from -100 (black) to 100 (white). */
export type Tint = {
	token: PaletteToken
	lightness: number
}

export const clampLightness = (value: number) =>
	Number.isFinite(value) ? Math.min(100, Math.max(-100, Math.round(value))) : 0

const mixWith = (color: string, lightness: number) => {
	const amount = clampLightness(lightness)
	if (amount === 0) return color
	return `color-mix(in srgb, ${color}, ${amount > 0 ? 'white' : 'black'} ${Math.abs(amount)}%)`
}

/** The CSS color a tint resolves to inside the preview, tracking the live theme. */
export const tintVar = (tint: Tint) =>
	mixWith(paletteVar[tint.token] ?? paletteVar.accent, tint.lightness)

/** The same tint as a literal color, for swatches in the editors. */
export const tintHex = (settings: ThemeSettings, tint: Tint) =>
	mixWith(settings[tint.token] ?? settings.accent, tint.lightness)

export type ThemeSettings = {
	background: string
	accent: string
	heading: string
	body: string
	headingFont: string
	bodyFont: string
	buttonFill: 'solid' | 'gradient'
	buttonFrom: Tint
	buttonTo: Tint
	buttonAngle: number
}

export const defaultSettings: ThemeSettings = {
	background: '#03080f',
	accent: '#0197f6',
	heading: '#ffffff',
	body: '#cbd5e1',
	headingFont: 'Space Grotesk',
	bodyFont: 'DM Sans',
	buttonFill: 'solid',
	buttonFrom: { token: 'accent', lightness: 0 },
	buttonTo: { token: 'accent', lightness: 40 },
	buttonAngle: 90,
}

// Hex travels through the URL without the hash so the query stays readable.
const colorKeys = ['background', 'accent', 'heading', 'body'] as const
const shortKeys = {
	background: 'bg',
	accent: 'ac',
	heading: 'hd',
	body: 'bd',
	headingFont: 'hf',
	bodyFont: 'bf',
	buttonFill: 'btf',
} as const

const tintKeys = {
	buttonFrom: { token: 'bt1', lightness: 'bt1l' },
	buttonTo: { token: 'bt2', lightness: 'bt2l' },
} as const

export const isPaletteToken = (value: string | null): value is PaletteToken =>
	paletteTokens.some((item) => item.id === value)

export function readTint(
	params: URLSearchParams,
	keys: { token: string; lightness: string },
	fallback: Tint,
): Tint {
	const token = params.get(keys.token)
	const raw = params.get(keys.lightness)
	const lightness = raw === null || raw.trim() === '' ? null : Number(raw)

	return {
		token: isPaletteToken(token) ? token : fallback.token,
		lightness:
			lightness !== null && Number.isFinite(lightness)
				? clampLightness(lightness)
				: fallback.lightness,
	}
}

export function writeTint(
	params: URLSearchParams,
	keys: { token: string; lightness: string },
	value: Tint,
	fallback: Tint,
) {
	if (value.token === fallback.token) params.delete(keys.token)
	else params.set(keys.token, value.token)

	if (value.lightness === fallback.lightness) params.delete(keys.lightness)
	else params.set(keys.lightness, String(value.lightness))
}

function normalizeHex(value: string | null) {
	if (!value) return null
	const hex = value.startsWith('#') ? value.slice(1) : value
	return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : null
}

export function readSettings(params: URLSearchParams): ThemeSettings {
	const next = { ...defaultSettings }

	for (const key of colorKeys) {
		const value = normalizeHex(params.get(shortKeys[key]))
		if (value) next[key] = value
	}

	const headingFont = params.get(shortKeys.headingFont)
	if (headingFont && isGoogleFont(headingFont)) next.headingFont = headingFont

	const bodyFont = params.get(shortKeys.bodyFont)
	if (bodyFont && isGoogleFont(bodyFont)) next.bodyFont = bodyFont

	const buttonFill = params.get(shortKeys.buttonFill)
	if (buttonFill === 'solid' || buttonFill === 'gradient')
		next.buttonFill = buttonFill

	next.buttonFrom = readTint(
		params,
		tintKeys.buttonFrom,
		defaultSettings.buttonFrom,
	)
	next.buttonTo = readTint(params, tintKeys.buttonTo, defaultSettings.buttonTo)

	const angle = params.get('bta')
	if (angle !== null && angle.trim() !== '') {
		const parsed = Number(angle)
		if (Number.isFinite(parsed))
			next.buttonAngle = ((Math.round(parsed) % 360) + 360) % 360
	}

	return next
}

export function writeSettings(
	params: URLSearchParams,
	settings: ThemeSettings,
): URLSearchParams {
	const next = new URLSearchParams(params.toString())

	for (const key of Object.keys(shortKeys) as (keyof typeof shortKeys)[]) {
		const value = settings[key]
		if (value === defaultSettings[key]) {
			next.delete(shortKeys[key])
			continue
		}
		next.set(
			shortKeys[key],
			colorKeys.includes(key as (typeof colorKeys)[number])
				? String(value).replace('#', '')
				: String(value),
		)
	}

	writeTint(
		next,
		tintKeys.buttonFrom,
		settings.buttonFrom,
		defaultSettings.buttonFrom,
	)
	writeTint(
		next,
		tintKeys.buttonTo,
		settings.buttonTo,
		defaultSettings.buttonTo,
	)

	if (settings.buttonAngle === defaultSettings.buttonAngle) next.delete('bta')
	else next.set('bta', String(settings.buttonAngle))

	return next
}
