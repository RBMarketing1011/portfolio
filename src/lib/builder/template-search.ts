/**
 * How the Add Page dialog searches and groups the template catalog. Pure and
 * client safe, so the proof can check it without rendering the dialog.
 */
import type { Template } from './page-schema'
import {
	TEMPLATE_CATEGORIES,
	TEMPLATE_CATEGORY_LABELS,
} from './template-categories'

export const ALL_TEMPLATES = 'all'

/** Everything a search can match on: name, description, category, keywords. */
const haystack = (template: Template) =>
	[
		template.name,
		template.description,
		TEMPLATE_CATEGORY_LABELS[template.category] ?? '',
		...template.keywords,
	]
		.join(' ')
		.toLowerCase()

/** Every word must match somewhere, so "contact form" finds the contact form. */
export function searchTemplates(templates: Template[], query: string) {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
	if (!words.length) return templates
	return templates.filter((template) => {
		const text = haystack(template)
		return words.every((word) => text.includes(word))
	})
}

export function countInCategory(matches: Template[], id: string) {
	return id === ALL_TEMPLATES
		? matches.length
		: matches.filter((template) => template.category === id).length
}

/**
 * The matches for one tab, under their category headings in catalog order.
 * Templates whose category is unknown (an old document) land under "Other".
 */
export function groupTemplates(matches: Template[], tab: string) {
	const inTab =
		tab === ALL_TEMPLATES
			? matches
			: matches.filter((template) => template.category === tab)
	const known = TEMPLATE_CATEGORIES.map((category) => ({
		id: category.id as string,
		label: category.label as string,
		items: inTab.filter((template) => template.category === category.id),
	}))
	const other = inTab.filter(
		(template) => !TEMPLATE_CATEGORY_LABELS[template.category],
	)
	return [...known, { id: 'other', label: 'Other', items: other }].filter(
		(group) => group.items.length > 0,
	)
}

/** The sidebar: "All", then each category that has at least one template. */
export function templateTabs(templates: Template[]) {
	const present = new Set(templates.map((template) => template.category))
	return [
		{ id: ALL_TEMPLATES, label: 'All' },
		...TEMPLATE_CATEGORIES.filter((category) => present.has(category.id)).map(
			(category) => ({ id: category.id as string, label: category.label as string }),
		),
	]
}

/** "Blank page" stays listed unless the search clearly is not for it. */
export function blankMatches(query: string) {
	const needle = query.trim().toLowerCase()
	return !needle || needle.split(/\s+/).every((word) => 'blank empty page scratch'.includes(word))
}
