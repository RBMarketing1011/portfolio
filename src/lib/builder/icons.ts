'use client'

import * as Icons from 'lucide-react'
import { icons } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const canonical = icons as unknown as Record<string, LucideIcon>

/** Every icon lucide ships today. The picker searches this whole set. */
export const ICON_NAMES = Object.keys(canonical).sort()

export type IconName = string

// Resolution also reads the full namespace, not only `icons`, so deprecated aliases
// already saved in a page (CheckCircle2, BarChart3, ...) keep rendering.
const iconMap = Icons as unknown as Record<string, unknown>

// An alias is the very component a canonical name holds. That is what tells it apart from
// the namespace's other exports (`Icon`, `createLucideIcon`, `icons`), which crash as icons.
const components = new Set<unknown>(Object.values(canonical))

/** A saved name is a component name; `toString` or `__proto__` never get as far as a lookup. */
const ICON_NAME = /^[A-Z][A-Za-z0-9]*$/

const isComponent = (value: unknown): value is LucideIcon =>
	typeof value === 'object' &&
	value !== null &&
	'$$typeof' in value &&
	components.has(value)

export function resolveIcon(name: unknown): LucideIcon | undefined {
	if (typeof name !== 'string' || !ICON_NAME.test(name)) return undefined
	const icon = Object.hasOwn(canonical, name)
		? canonical[name]
		: Object.hasOwn(iconMap, name)
			? iconMap[name]
			: undefined
	return isComponent(icon) ? icon : undefined
}

/** "CircleCheckBig" -> "Circle Check Big", so a search for "check" matches. */
export function iconLabel(name: string) {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}
