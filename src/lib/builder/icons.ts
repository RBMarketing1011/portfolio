'use client'

import * as Icons from 'lucide-react'
import { icons } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const canonical = icons as unknown as Record<string, LucideIcon>

/** Every icon lucide ships today. The picker searches this whole set. */
export const ICON_NAMES = Object.keys(canonical).sort()

export type IconName = string

// Resolution stays on the full namespace, not `icons`, so deprecated aliases
// already saved in a page (CheckCircle2, BarChart3, ...) keep rendering.
const iconMap = Icons as unknown as Record<string, LucideIcon>

export function resolveIcon(name: unknown): LucideIcon | undefined {
	if (typeof name !== 'string') return undefined
	const icon = iconMap[name]
	return typeof icon === 'function' || typeof icon === 'object'
		? icon
		: undefined
}

/** "CircleCheckBig" -> "Circle Check Big", so a search for "check" matches. */
export function iconLabel(name: string) {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}
