'use client'

import * as Icons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Curated rather than the full lucide set: this is what the icon picker offers,
// and it keeps the bundle honest.
export const ICON_NAMES = [
	'Activity',
	'AlarmClock',
	'Award',
	'BarChart3',
	'Bell',
	'Bot',
	'Boxes',
	'Briefcase',
	'Building2',
	'CalendarClock',
	'Camera',
	'Check',
	'CheckCircle2',
	'ClipboardCheck',
	'Clock',
	'Cloud',
	'Code2',
	'Compass',
	'Cpu',
	'CreditCard',
	'Database',
	'FileSearch',
	'FileStack',
	'FileText',
	'Filter',
	'Flag',
	'Gauge',
	'GitBranch',
	'Globe',
	'GraduationCap',
	'Hammer',
	'HeartHandshake',
	'Layers',
	'LayoutDashboard',
	'Leaf',
	'Lightbulb',
	'LifeBuoy',
	'LineChart',
	'Link2',
	'Lock',
	'Mail',
	'Map',
	'MapPin',
	'Megaphone',
	'MessageSquare',
	'Monitor',
	'Package',
	'Phone',
	'PieChart',
	'Plug',
	'Rocket',
	'Scale',
	'Search',
	'ShieldCheck',
	'ShoppingCart',
	'Sparkles',
	'Star',
	'Store',
	'Target',
	'Timer',
	'TrendingUp',
	'Truck',
	'Users',
	'Wallet',
	'Workflow',
	'Wrench',
	'Zap',
] as const

export type IconName = (typeof ICON_NAMES)[number]

const iconMap = Icons as unknown as Record<string, LucideIcon>

export function resolveIcon(name: unknown): LucideIcon | undefined {
	if (typeof name !== 'string') return undefined
	const icon = iconMap[name]
	return typeof icon === 'function' || typeof icon === 'object'
		? icon
		: undefined
}
