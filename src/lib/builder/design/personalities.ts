/**
 * The defaults behind "AI decides" (section 8.4). The shortlists are guidance in the
 * planner prompt, not limits; code uses a personality to fill a missing or invalid
 * choice and for the small design rules that follow from it (FAQ markers, step
 * numbers, check icons, the pattern of the `pattern` tone, the button style).
 */
import type { PatternId } from '@/app/builder/background-settings'
import type { Shape } from '@/app/builder/theme-settings'
import type { HeaderVariant } from '../page-schema'
import type { BusinessType } from '../site-profile'
import type { BackdropId, FontPairId, PaletteId, PersonalityId } from './vocab'

export type Personality = {
	id: PersonalityId; palettes: PaletteId[]; fonts: FontPairId[]; shape: Shape; backdrop: BackdropId; header: HeaderVariant
	faqMarker: 'plus' | 'chevron' | 'check' | 'arrow'; stepNumbers: 'solid' | 'outline' | 'muted'; checkIcon: string
	bands: number; buttons: 'solid' | 'gradient'; pattern: PatternId | 'none'
}

export const PERSONALITIES: Record<PersonalityId, Personality> = {
	technical: {
		id: 'technical', palettes: ['D1', 'D13', 'D5', 'L11', 'L8'], fonts: ['grotesk-dm', 'sora-inter', 'plex', 'archivo', 'instrument'],
		shape: 'soft', backdrop: 'grid', header: 'floating', faqMarker: 'chevron', stepNumbers: 'outline', checkIcon: 'Check',
		bands: 2, buttons: 'gradient', pattern: 'grid',
	},
	bold: {
		id: 'bold', palettes: ['D3', 'D7', 'D11', 'D6', 'L5'], fonts: ['bricolage-inter', 'oswald-barlow', 'archivo', 'epilogue-inter'],
		shape: 'sharp', backdrop: 'glow', header: 'bar', faqMarker: 'plus', stepNumbers: 'solid', checkIcon: 'BadgeCheck',
		bands: 3, buttons: 'gradient', pattern: 'grid',
	},
	friendly: {
		id: 'friendly', palettes: ['L3', 'L10', 'L8', 'L14', 'D4'], fonts: ['jakarta', 'outfit-figtree', 'manrope', 'redhat', 'figtree'],
		shape: 'round', backdrop: 'paper', header: 'bar', faqMarker: 'plus', stepNumbers: 'solid', checkIcon: 'CircleCheck',
		bands: 2, buttons: 'solid', pattern: 'dots',
	},
	refined: {
		id: 'refined', palettes: ['L1', 'L6', 'L7', 'D8', 'D2'], fonts: ['caslon-franklin', 'playfair-source', 'schibsted-inter', 'newsreader-intertight', 'redhat'],
		shape: 'soft', backdrop: 'clean', header: 'stacked', faqMarker: 'chevron', stepNumbers: 'outline', checkIcon: 'CircleCheckBig',
		bands: 1, buttons: 'solid', pattern: 'lines',
	},
	warm: {
		id: 'warm', palettes: ['L2', 'L9', 'L12', 'D9', 'L13'], fonts: ['fraunces-inter', 'lora-nunito', 'zilla-work', 'merriweather-source'],
		shape: 'round', backdrop: 'paper', header: 'bar', faqMarker: 'check', stepNumbers: 'muted', checkIcon: 'CircleCheck',
		bands: 2, buttons: 'solid', pattern: 'dots',
	},
	rugged: {
		id: 'rugged', palettes: ['D3', 'D7', 'L5', 'L2', 'D9'], fonts: ['oswald-barlow', 'archivo', 'zilla-work'],
		shape: 'sharp', backdrop: 'blueprint', header: 'bar', faqMarker: 'plus', stepNumbers: 'solid', checkIcon: 'BadgeCheck',
		bands: 2, buttons: 'solid', pattern: 'crosshatch',
	},
	clinical: {
		id: 'clinical', palettes: ['L3', 'L8', 'L11', 'L10', 'D5'], fonts: ['manrope', 'sora-inter', 'figtree', 'lora-nunito'],
		shape: 'round', backdrop: 'clean', header: 'bar', faqMarker: 'check', stepNumbers: 'outline', checkIcon: 'Check',
		bands: 1, buttons: 'solid', pattern: 'dots',
	},
	editorial: {
		id: 'editorial', palettes: ['L1', 'L12', 'L5', 'D2', 'L7'], fonts: ['newsreader-intertight', 'epilogue-inter', 'schibsted-inter', 'fraunces-inter', 'instrument'],
		shape: 'sharp', backdrop: 'lines', header: 'stacked', faqMarker: 'arrow', stepNumbers: 'muted', checkIcon: 'Check',
		bands: 2, buttons: 'solid', pattern: 'lines',
	},
	luxe: {
		id: 'luxe', palettes: ['D2', 'D8', 'L7', 'L6', 'D12'], fonts: ['cormorant-manrope', 'bodoni-jost', 'playfair-source', 'cinzel-raleway'],
		shape: 'sharp', backdrop: 'clean', header: 'floating', faqMarker: 'arrow', stepNumbers: 'muted', checkIcon: 'CircleCheckBig',
		bands: 1, buttons: 'solid', pattern: 'none',
	},
	playful: {
		id: 'playful', palettes: ['D10', 'D12', 'L13', 'L14', 'D6'], fonts: ['outfit-figtree', 'bricolage-inter', 'jakarta'],
		shape: 'round', backdrop: 'paper', header: 'floating', faqMarker: 'plus', stepNumbers: 'solid', checkIcon: 'CircleCheck',
		bands: 3, buttons: 'gradient', pattern: 'dots',
	},
}

const BY_TYPE: Record<BusinessType, PersonalityId> = {
	RoofingContractor: 'rugged', GeneralContractor: 'rugged', HomeAndConstructionBusiness: 'rugged',
	AutoRepair: 'rugged', MovingCompany: 'rugged', Locksmith: 'rugged',
	Plumber: 'friendly', Electrician: 'friendly', HVACBusiness: 'friendly', HousePainter: 'friendly',
	LocalBusiness: 'friendly', Store: 'friendly',
	Dentist: 'clinical', MedicalClinic: 'clinical', Physician: 'clinical', VeterinaryCare: 'clinical',
	LegalService: 'refined', Attorney: 'refined', AccountingService: 'refined', FinancialService: 'refined',
	InsuranceAgency: 'refined', RealEstateAgent: 'refined', ProfessionalService: 'refined', Organization: 'refined',
	Restaurant: 'warm', CafeOrCoffeeShop: 'warm',
	BeautySalon: 'luxe', HairSalon: 'luxe', DaySpa: 'luxe',
	HealthClub: 'bold',
	PetStore: 'playful', ChildCare: 'playful',
}

/** The personality a business type gets when the planner's is missing or invalid. */
export function personalityFor(type: BusinessType): PersonalityId {
	return Object.hasOwn(BY_TYPE, type) ? BY_TYPE[type] : 'friendly'
}
