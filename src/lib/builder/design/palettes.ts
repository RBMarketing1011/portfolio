/**
 * The 27 curated palettes the AI chooses from (section 8.2). Each one was measured with
 * the renderer's own colour math and keeps every text role readable on every surface
 * tone it offers; the design proof re-measures all of them.
 *
 * The light palettes deliberately use a body colour close to the heading: theme.ts fades
 * body 66% toward the background for small text, and only a near-heading body keeps
 * that fade at 4.5:1 or more on a light background.
 */
import { parseHex, type ThemeColors } from './contrast'
import { toOklch } from './oklch'
import type { PaletteId } from './vocab'

export type Palette = { id: PaletteId; name: string; polarity: 'light' | 'dark'; colors: ThemeColors; mood: string; fits: string }

const palette = (
	id: PaletteId,
	name: string,
	polarity: 'light' | 'dark',
	[background, accent, heading, body]: [string, string, string, string],
	mood: string,
	fits: string,
): Palette => ({ id, name, polarity, colors: { background, accent, heading, body }, mood, fits })

export const PALETTES: readonly Palette[] = [
	palette('D1', 'Midnight Electric', 'dark', ['#03080f', '#0197f6', '#ffffff', '#cbd5e1'], 'electric, technical', 'software, IT, security, agencies'),
	palette('D2', 'Obsidian Gold', 'dark', ['#0b0b0c', '#d4a64a', '#f6f1e7', '#cdc5b6'], 'gilded, discreet', 'law, wealth, luxury trades, barbers'),
	palette('D3', 'Ember Works', 'dark', ['#0f0a07', '#f97316', '#fff7ed', '#d9cbbf'], 'hot, energetic', 'roofing, construction, fitness, barbecue'),
	palette('D4', 'Forest Night', 'dark', ['#06130d', '#4fbf7a', '#eef7f1', '#b7cbbe'], 'deep, natural', 'landscaping, outdoor, eco'),
	palette('D5', 'Deep Teal', 'dark', ['#04161a', '#2dd4bf', '#effcfa', '#a9c9c5'], 'clinical, cool', 'medtech, clean energy, pools'),
	palette('D6', 'Royal Violet', 'dark', ['#0b0716', '#a78bfa', '#f5f3ff', '#c7c1e0'], 'expressive, nocturnal', 'creative studios, events, nightlife'),
	palette('D7', 'Crimson Steel', 'dark', ['#0c0d10', '#f04a4a', '#f8fafc', '#c5cad3'], 'urgent, mechanical', 'auto repair, towing, security, sport'),
	palette('D8', 'Navy Brass', 'dark', ['#0a1020', '#e0b15a', '#f7f4ec', '#c9cbd6'], 'assured, classic', 'finance, insurance, hospitality, marine'),
	palette('D9', 'Espresso Copper', 'dark', ['#140e0b', '#e08a5b', '#fbf3ec', '#d6c6b9'], 'crafted, warm', 'cafés, woodwork, interiors'),
	palette('D10', 'Ink Coral', 'dark', ['#0e0d14', '#ff7a66', '#fdf7f5', '#cdc6cf'], 'lively, social', 'restaurants, lifestyle, education'),
	palette('D11', 'Graphite Lime', 'dark', ['#0d0f0c', '#c4f04d', '#f7fbef', '#c8cfbf'], 'charged, bold', 'electricians, solar, bold startups'),
	palette('D12', 'Midnight Rose', 'dark', ['#120a10', '#f472b6', '#fdf2f8', '#e2cdd9'], 'glamorous', 'beauty, florists, fashion'),
	palette('D13', 'Arctic Night', 'dark', ['#061217', '#7dd3fc', '#f0f9ff', '#c3d8e2'], 'crisp, airy-dark', 'HVAC, water, cleaning, aviation'),
	palette('L1', 'Paper Navy', 'light', ['#fbfaf7', '#1e3a8a', '#0b1220', '#1e293b'], 'editorial, trustworthy', 'law, consulting, accounting, B2B'),
	palette('L2', 'Sandstone Rust', 'light', ['#f7f3ec', '#7c2d12', '#1c1917', '#292524'], 'earthy, homely', 'home services, remodeling, builders'),
	palette('L3', 'Clinic Teal', 'light', ['#ffffff', '#115e59', '#0b1f24', '#1a2b30'], 'clean, calm', 'dental, medical, therapy, clinics'),
	palette('L4', 'Sage Moss', 'light', ['#f4f6f1', '#365314', '#141c12', '#1f2a1c'], 'soft, natural', 'spa, wellness, organic food'),
	palette('L5', 'Nordic Ember', 'light', ['#f5f5f4', '#9a3412', '#0c0a09', '#1c1917'], 'stark, confident', 'architecture, furniture, trades, roofing'),
	palette('L6', 'Plum Linen', 'light', ['#faf7f5', '#6b21a8', '#1a1022', '#2a2233'], 'elegant, personal', 'salons, boutiques, weddings, coaching'),
	palette('L7', 'Bordeaux', 'light', ['#fbf8f6', '#881337', '#1c0f13', '#2b2023'], 'rich, hospitable', 'wineries, restaurants, real estate'),
	palette('L8', 'Coastal Cyan', 'light', ['#f7fafb', '#0e7490', '#0a1a22', '#162a33'], 'fresh, watery', 'pools, cleaning, plumbing, marine'),
	palette('L9', 'Terracotta', 'light', ['#fbf7f2', '#9c3d1c', '#1b130e', '#2a1f18'], 'sun-baked, artisan', 'bakeries, pottery, Mediterranean food'),
	palette('L10', 'Evergreen', 'light', ['#f6f8f5', '#166534', '#0e1a12', '#1b2a20'], 'grounded, green', 'lawn care, pest control, nonprofits'),
	palette('L11', 'Slate Indigo', 'light', ['#f8fafc', '#4338ca', '#0f172a', '#1e293b'], 'modern, dependable', 'SaaS, education, IT services'),
	palette('L12', 'Ochre Ink', 'light', ['#fbf9f3', '#8a5a0b', '#16120a', '#272116'], 'literary, heritage', 'publishing, craft, coffee roasters'),
	palette('L13', 'Rose Clay', 'light', ['#fcf7f6', '#9f1d3f', '#1d1013', '#2c1e22'], 'tender, creative', 'florists, beauty, kids, photography'),
	palette('L14', 'Charcoal Citrus', 'light', ['#fafaf7', '#3f6212', '#121410', '#20241c'], 'lively, outdoorsy', 'gardeners, food producers, fitness'),
]

const byId = new Map<string, Palette>(PALETTES.map((item) => [item.id, item]))

export function paletteById(id: string): Palette | null {
	return byId.get(id) ?? null
}

// Below this chroma a colour is a grey and its hue angle is noise, so hue cannot rank it.
const GREY_CHROMA = 0.02

/**
 * The curated palette of that polarity whose accent is closest in hue to a brand colour
 * (OKLCH hue distance, ties broken by chroma distance), so a pinned brand colour lands
 * among surroundings designed for a colour like it.
 */
export function nearestPalette(accent: string, polarity: 'light' | 'dark'): Palette {
	const matching = PALETTES.filter((item) => item.polarity === polarity)
	const candidates = matching.length ? matching : PALETTES
	const pinned = parseHex(accent)
	if (!pinned) return candidates[0]
	const want = toOklch(pinned)

	const distance = (item: Palette) => {
		const have = toOklch(parseHex(item.colors.accent)!)
		const around = Math.abs(want.h - have.h) % 360
		const hue = want.c < GREY_CHROMA ? 0 : Math.min(around, 360 - around)
		return { hue, chroma: Math.abs(want.c - have.c) }
	}

	let best = candidates[0]
	let bestDistance = distance(best)
	for (const item of candidates.slice(1)) {
		const next = distance(item)
		if (next.hue < bestDistance.hue || (next.hue === bestDistance.hue && next.chroma < bestDistance.chroma)) {
			best = item
			bestDistance = next
		}
	}
	return best
}
