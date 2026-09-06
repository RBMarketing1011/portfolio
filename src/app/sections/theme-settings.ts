import { isGoogleFont } from './google-fonts'

export type ThemeSettings = {
	background: string
	accent: string
	heading: string
	body: string
	headingFont: string
	bodyFont: string
}

export const defaultSettings: ThemeSettings = {
	background: '#03080f',
	accent: '#0197f6',
	heading: '#ffffff',
	body: '#cbd5e1',
	headingFont: 'Space Grotesk',
	bodyFont: 'DM Sans',
}

// Hex travels through the URL without the hash so the query stays readable.
const colorKeys = ['background', 'accent', 'heading', 'body'] as const
const shortKeys: Record<keyof ThemeSettings, string> = {
	background: 'bg',
	accent: 'ac',
	heading: 'hd',
	body: 'bd',
	headingFont: 'hf',
	bodyFont: 'bf',
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

	return next
}

export function writeSettings(
	params: URLSearchParams,
	settings: ThemeSettings,
): URLSearchParams {
	const next = new URLSearchParams(params.toString())

	for (const key of Object.keys(shortKeys) as (keyof ThemeSettings)[]) {
		const value = settings[key]
		if (value === defaultSettings[key]) {
			next.delete(shortKeys[key])
			continue
		}
		next.set(
			shortKeys[key],
			colorKeys.includes(key as (typeof colorKeys)[number])
				? value.replace('#', '')
				: value,
		)
	}

	return next
}
