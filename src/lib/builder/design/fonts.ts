/**
 * The 24 curated font pairings (section 8.3). Every family is in the Google Fonts
 * allow-list as Sans Serif or Serif, so none falls back to `cursive`, and every heading
 * face has a real weight of 600 or more for the kit's `font-semibold` headings, so none
 * is faux-bolded. `category` is the heading face's.
 */
import type { FontPairId, PersonalityId } from './vocab'

export type FontPair = {
	id: FontPairId; heading: string; body: string; category: 'Sans' | 'Serif'; character: string; fits: string; personalities: PersonalityId[]
}

const pair = (
	id: FontPairId,
	[heading, body]: [string, string],
	category: 'Sans' | 'Serif',
	character: string,
	fits: string,
	personalities: PersonalityId[],
): FontPair => ({ id, heading, body, category, character, fits, personalities })

export const FONT_PAIRS: readonly FontPair[] = [
	pair('grotesk-dm', ['Space Grotesk', 'DM Sans'], 'Sans', 'technical, the current default', 'tech, agencies, IT', ['technical']),
	pair('sora-inter', ['Sora', 'Inter'], 'Sans', 'precise, geometric', 'SaaS, fintech, clinics', ['technical', 'clinical']),
	pair('bricolage-inter', ['Bricolage Grotesque', 'Inter'], 'Sans', 'bold, contemporary', 'startups, creative, events', ['bold', 'playful']),
	pair('instrument', ['Instrument Sans', 'Instrument Sans'], 'Sans', 'crisp, neutral', 'studios, B2B, architecture', ['editorial', 'technical']),
	pair('manrope', ['Manrope', 'Manrope'], 'Sans', 'calm, clean', 'dental, medical, wellness', ['clinical', 'friendly']),
	pair('jakarta', ['Plus Jakarta Sans', 'Plus Jakarta Sans'], 'Sans', 'friendly, professional', 'home services, local business', ['friendly']),
	pair('redhat', ['Red Hat Display', 'Red Hat Text'], 'Sans', 'corporate, warm', 'IT services, insurance, B2B', ['friendly', 'refined']),
	pair('figtree', ['Figtree', 'Figtree'], 'Sans', 'clear, approachable', 'clinics, apps, education', ['friendly', 'clinical']),
	pair('outfit-figtree', ['Outfit', 'Figtree'], 'Sans', 'rounded, upbeat', 'fitness, kids, events', ['playful', 'friendly']),
	pair('oswald-barlow', ['Oswald', 'Barlow'], 'Sans', 'condensed, industrial', 'roofing, construction, auto', ['rugged', 'bold']),
	pair('archivo', ['Archivo', 'Archivo'], 'Sans', 'sturdy grotesk', 'trades, logistics, manufacturing', ['rugged', 'technical']),
	pair('epilogue-inter', ['Epilogue', 'Inter'], 'Sans', 'design studio', 'architecture, studios, agencies', ['editorial', 'bold']),
	pair('schibsted-inter', ['Schibsted Grotesk', 'Inter'], 'Sans', 'editorial grotesk', 'media, consulting', ['editorial', 'refined']),
	pair('plex', ['IBM Plex Serif', 'IBM Plex Sans'], 'Serif', 'engineered', 'engineering, legal tech, research', ['technical', 'refined']),
	pair('fraunces-inter', ['Fraunces', 'Inter'], 'Serif', 'warm editorial serif', 'bakeries, cafés, boutiques', ['warm', 'editorial']),
	pair('lora-nunito', ['Lora', 'Nunito Sans'], 'Serif', 'soft serif', 'wellness, organic food, therapy', ['warm', 'clinical']),
	pair('merriweather-source', ['Merriweather', 'Source Sans 3'], 'Serif', 'trustworthy', 'finance, insurance, healthcare', ['refined', 'warm']),
	pair('caslon-franklin', ['Libre Caslon Text', 'Libre Franklin'], 'Serif', 'heritage', 'law, banks, universities', ['refined']),
	pair('playfair-source', ['Playfair Display', 'Source Sans 3'], 'Serif', 'classic luxury', 'law, fine dining, real estate', ['luxe', 'refined']),
	pair('cormorant-manrope', ['Cormorant Garamond', 'Manrope'], 'Serif', 'refined, airy', 'weddings, spa, jewellery', ['luxe']),
	pair('bodoni-jost', ['Bodoni Moda', 'Jost'], 'Serif', 'fashion', 'beauty, fashion, salons', ['luxe', 'bold']),
	pair('newsreader-intertight', ['Newsreader', 'Inter Tight'], 'Serif', 'literary', 'publishing, nonprofits, consulting', ['editorial', 'refined']),
	pair('zilla-work', ['Zilla Slab', 'Work Sans'], 'Serif', 'rugged slab', 'landscaping, craft, outdoors', ['rugged', 'warm']),
	pair('cinzel-raleway', ['Cinzel', 'Raleway'], 'Serif', 'classical capitals', 'wineries, hotels, memorials', ['luxe']),
]

const byId = new Map<string, FontPair>(FONT_PAIRS.map((item) => [item.id, item]))

export function fontPairById(id: string): FontPair | null {
	return byId.get(id) ?? null
}
