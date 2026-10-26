/**
 * The icon lexicon (section 9.9): canonical Lucide names grouped by trade, and the
 * keyword map that picks one for a service, a menu link or a card when the model's
 * choice is missing or not a real icon.
 *
 * Every name was checked against lucide-react 0.476's `icons` (1556 canonical names);
 * the catalog proof checks them again. `Tooth`, `SolarPanel` and `BrushCleaning` do not
 * exist in that version and are never used.
 *
 * Pure: `icons` is lucide's plain name-to-component map, not a client module.
 */
import { icons } from 'lucide-react'
import type { BusinessType } from '../site-profile'

export const ICON_LEXICON: Record<string, string[]> = {
	building: ['House', 'Hammer', 'HardHat', 'Construction', 'CloudHail', 'CloudRain', 'Umbrella', 'Ruler', 'Drill', 'PaintRoller', 'Paintbrush', 'Building2', 'Warehouse', 'Fence', 'DoorOpen'],
	trades: ['Wrench', 'Droplets', 'ShowerHead', 'Bath', 'Waves', 'Flame', 'Snowflake', 'AirVent', 'Fan', 'Wind', 'Heater', 'Thermometer', 'Zap', 'Plug', 'Lightbulb', 'BatteryCharging', 'Sun', 'Cable'],
	outdoor: ['Leaf', 'TreePine', 'Trees', 'Sprout', 'Flower2', 'Shovel', 'Tractor', 'Bug', 'Mountain', 'Tent'],
	cleaning: ['Sparkles', 'SprayCan', 'Brush', 'Trash2', 'Recycle', 'WashingMachine'],
	auto: ['Car', 'CarFront', 'Gauge', 'Cog', 'Truck', 'Route', 'Navigation'],
	health: ['Stethoscope', 'HeartPulse', 'Pill', 'Syringe', 'Activity', 'Smile', 'Baby', 'Brain', 'Eye', 'Ear', 'Bone', 'Accessibility', 'HandHeart', 'Microscope'],
	beauty: ['Dumbbell', 'Bike', 'Footprints', 'Scissors', 'Gem', 'Crown', 'Shirt', 'Glasses', 'Watch'],
	food: ['Utensils', 'UtensilsCrossed', 'ChefHat', 'Coffee', 'Croissant', 'Cake', 'CakeSlice', 'Wine', 'Beer', 'Pizza', 'Sandwich', 'Soup', 'IceCreamCone', 'Salad', 'Cookie', 'Wheat', 'Apple', 'Carrot', 'Hotel', 'BedDouble'],
	professional: ['Scale', 'Gavel', 'Landmark', 'Briefcase', 'FileText', 'FileCheck', 'ScrollText', 'Handshake', 'Calculator', 'Receipt', 'CreditCard', 'PiggyBank', 'Banknote', 'DollarSign', 'ChartColumn', 'ChartLine', 'TrendingUp'],
	tech: ['Laptop', 'Monitor', 'Code', 'Cloud', 'Database', 'Server', 'ShieldCheck', 'ShieldHalf', 'Lock', 'KeyRound', 'Wifi', 'Router', 'Smartphone', 'Camera', 'Film', 'Music', 'Mic', 'Palette', 'PenTool', 'Megaphone', 'Rocket', 'Target', 'Puzzle', 'Layers', 'LayoutGrid', 'Workflow'],
	people: ['GraduationCap', 'BookOpen', 'School', 'Users', 'UserCheck', 'HeartHandshake', 'Church', 'Gift', 'PartyPopper', 'Dog', 'Cat', 'PawPrint', 'Fish'],
	generic: ['CalendarCheck', 'Calendar', 'Clock', 'Timer', 'Phone', 'PhoneCall', 'Mail', 'MapPin', 'Map', 'Globe', 'Star', 'BadgeCheck', 'Award', 'Medal', 'Trophy', 'Heart', 'ThumbsUp', 'MessageCircle', 'MessagesSquare', 'Headset', 'CircleHelp', 'ClipboardCheck', 'ClipboardList', 'ListChecks', 'Search', 'Package', 'Boxes', 'Siren', 'Ambulance', 'FireExtinguisher', 'Shield', 'Hourglass', 'Compass'],
}

/** The words a caller may use for a group ('roofing', 'hvac'), mapped to its key. */
const GROUP_ALIASES: Record<string, string> = {
	roofing: 'building', construction: 'building', home: 'building',
	plumbing: 'trades', hvac: 'trades', electrical: 'trades',
	fitness: 'beauty', salon: 'beauty',
	hospitality: 'food', restaurant: 'food',
	legal: 'professional', finance: 'professional',
	creative: 'tech', software: 'tech',
	community: 'people', pets: 'people',
}

const groupKey = (group: string | undefined) => {
	const key = String(group ?? '').trim().toLowerCase()
	if (Object.hasOwn(ICON_LEXICON, key)) return key
	return Object.hasOwn(GROUP_ALIASES, key) ? GROUP_ALIASES[key] : null
}

/** Canonical Lucide names only: `Object.hasOwn`, so `icons`, `toString` and other inherited keys never pass. */
export function isCanonicalIcon(name: string): boolean {
	return typeof name === 'string' && /^[A-Z][A-Za-z0-9]*$/.test(name) && Object.hasOwn(icons, name)
}

/**
 * A Lucide name written another way ("book-open", "book_open", "bookOpen", "cake") as its
 * canonical PascalCase form, or null when no such icon exists. Models often write the
 * kebab-case names of Lucide's own docs.
 */
export function canonicalIcon(name: unknown): string | null {
	const value = String(name ?? '').trim()
	if (!value || value.length > 60) return null
	if (isCanonicalIcon(value)) return value
	const pascal = value
		.split(/[-_\s]+|(?<=[a-z0-9])(?=[A-Z])/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join('')
	return isCanonicalIcon(pascal) ? pascal : null
}

// Checked in order (section 9.9). Stems match at the start of a word, so "air" never
// matches "repair" and "AC" never matches "contact".
const KEYWORDS: { re: RegExp; icon: string; building?: string }[] = [
	{ re: /\broof/i, icon: 'House' },
	{ re: /\b(repair|fix)/i, icon: 'Wrench', building: 'Hammer' },
	{ re: /\b(storm|hail)/i, icon: 'CloudHail' },
	{ re: /\b(gutter|drain|leak|water)/i, icon: 'Droplets' },
	{ re: /\binspect/i, icon: 'Search' },
	{ re: /\b(emergenc|urgent)/i, icon: 'Siren' },
	{ re: /\bclean/i, icon: 'Sparkles' },
	{ re: /\b(heat|furnace)/i, icon: 'Flame' },
	{ re: /\b(cool|ac\b|a\/c\b|hvac|air)/i, icon: 'Snowflake' },
	{ re: /\b(electric|wiring)/i, icon: 'Zap' },
	{ re: /\bsolar/i, icon: 'Sun' },
	{ re: /\b(lawn|garden|landscap)/i, icon: 'Leaf' },
	{ re: /\btree/i, icon: 'TreePine' },
	{ re: /\bpaint/i, icon: 'PaintRoller' },
	{ re: /\b(dental|dentist|smile|whiten|teeth)/i, icon: 'Smile' },
	{ re: /\b(implant|surgery|surgical)/i, icon: 'Stethoscope' },
	{ re: /\b(bake|baker|pastr|bread)/i, icon: 'Croissant' },
	{ re: /\b(coffee|cafe|café)/i, icon: 'Coffee' },
	{ re: /\bcater/i, icon: 'ChefHat' },
	{ re: /\b(law|legal|estate|probate)/i, icon: 'Scale' },
	{ re: /\b(tax|account)/i, icon: 'Calculator' },
	{ re: /\binsur/i, icon: 'ShieldCheck' },
	{ re: /\b(contact|call)/i, icon: 'PhoneCall' },
	{ re: /\b(about|team)/i, icon: 'Users' },
	{ re: /\breview/i, icon: 'Star' },
	{ re: /\b(faq|question)/i, icon: 'CircleHelp' },
	{ re: /\b(work|project|gallery|portfolio)/i, icon: 'LayoutGrid' },
	{ re: /\b(price|pricing|cost)/i, icon: 'Receipt' },
	{ re: /\b(book|appointment)/i, icon: 'CalendarCheck' },
]

/** The keyword map alone: the icon the words name, or null when none applies. */
export function matchIcon(text: string, group?: string): string | null {
	const value = String(text ?? '')
	const key = groupKey(group)
	for (const rule of KEYWORDS) {
		if (rule.re.test(value)) return key === 'building' && rule.building ? rule.building : rule.icon
	}
	return null
}

/** An icon for a service, page or card from its words; otherwise the group's first icon. */
export function iconFor(text: string, group?: string): string {
	return matchIcon(text, group) ?? ICON_LEXICON[groupKey(group) ?? 'generic'][0]
}

/** The lexicon group a business type's icons come from first. */
export function iconGroupFor(type: BusinessType | '' | null | undefined): string {
	switch (type) {
		case 'RoofingContractor': case 'GeneralContractor': case 'HomeAndConstructionBusiness': case 'HousePainter': case 'Locksmith':
			return 'building'
		case 'Plumber': case 'Electrician': case 'HVACBusiness':
			return 'trades'
		case 'AutoRepair': case 'MovingCompany':
			return 'auto'
		case 'Dentist': case 'MedicalClinic': case 'Physician': case 'VeterinaryCare':
			return 'health'
		case 'BeautySalon': case 'HairSalon': case 'DaySpa': case 'HealthClub':
			return 'beauty'
		case 'Restaurant': case 'CafeOrCoffeeShop':
			return 'food'
		case 'LegalService': case 'Attorney': case 'AccountingService': case 'FinancialService': case 'InsuranceAgency': case 'RealEstateAgent': case 'ProfessionalService':
			return 'professional'
		case 'PetStore': case 'ChildCare': case 'Organization':
			return 'people'
		default:
			return 'generic'
	}
}

/**
 * The next lexicon icon not in `taken`: from the group of `near` (the icon being
 * replaced) first, then the generic group. Used to re-pick duplicates within a section.
 */
export function nextIcon(taken: Set<string>, near?: string): string {
	const home = Object.keys(ICON_LEXICON).find((key) => near && ICON_LEXICON[key].includes(near))
	const order = [...(home ? [home] : []), 'generic', ...Object.keys(ICON_LEXICON)]
	for (const key of order) {
		const free = ICON_LEXICON[key].find((name) => !taken.has(name))
		if (free) return free
	}
	return 'Sparkles'
}
