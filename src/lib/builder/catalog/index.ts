/**
 * The section catalog: the curated metadata (`meta.ts`, `children.ts`) joined at runtime
 * with `schema.ts`, so labels, field types and variant ids can never drift, and the
 * planner's view of the kit (`catalogText`).
 *
 * The join asserts that every reference resolves: each curated variant exists in the
 * schema, every schema variant of an AI type is curated (or excluded with a reason),
 * every slot and image path names a field of a compatible type, every child kind is one
 * its container accepts, and the layouts and child layouts equal the closed vocabularies
 * in `design/vocab.ts`. A variant added to `schema.ts` fails here until it is curated.
 *
 * Pure: loaded by the planner, the page route and the proofs.
 */
import { FONT_PAIRS } from '../design/fonts'
import { PALETTES } from '../design/palettes'
import { PERSONALITIES } from '../design/personalities'
import {
	ARCHETYPES, BACKDROP_IDS, CHILD_LAYOUT_IDS, LAYOUT_IDS, PERSONALITY_IDS, SURFACE_TONES, TWEAKS,
	type BackdropId, type Layout, type PersonalityId, type Tweak,
} from '../design/vocab'
import { getSchema, GROUP_ORDER, sectionSchemas } from '../schema'
import { CHILD_META } from './children'
import { ITEM_NOTES, NEED_NOTES, SECTION_META } from './meta'
import { ARCHETYPE_RULES, ARCHETYPE_TEXT, RECIPES, type RecipeStep } from './recipes'
import { KIND_FIELDS, resolvePath } from './slots'
import type { CatalogEntry, ChildMeta, Count, ItemRule, SectionMeta } from './types'

export * from './types'
export { SECTION_META, CHILD_META, RECIPES, ARCHETYPE_RULES }
export type { RecipeStep }
export { ICON_LEXICON, iconFor, iconGroupFor, isCanonicalIcon, matchIcon } from './lexicon'
export { composePage, composeSection, imageSlotsFor, newBlockId, slotImages } from './compose'
export { applySlots, slotPath, slotsFor } from './slots'
export { validateBlock, validatePage } from './validate'

// ---------------------------------------------------------------- the join

/** Section types in the planner's reading order: the schema's groups, then schema order. */
function orderedTypes(meta: Record<string, SectionMeta>) {
	const rank = (group: string) => {
		const at = GROUP_ORDER.indexOf(group)
		return at === -1 ? GROUP_ORDER.length : at
	}
	const known = sectionSchemas
		.map((schema, index) => ({ schema, index }))
		.filter(({ schema }) => Object.hasOwn(meta, schema.type))
		.sort((a, b) => rank(a.schema.group) - rank(b.schema.group) || a.index - b.index)
		.map(({ schema }) => schema.type)
	// Curated types the schema lacks still reach the join, so it can name them.
	const strays = Object.keys(meta).filter((type) => !known.includes(type)).sort()
	return [...known, ...strays]
}

function checkCount(where: string, count: Count, problems: string[]) {
	if (!(count.min <= count.ideal && count.ideal <= count.max)) problems.push(`${where}: ideal ${count.ideal} outside ${count.min}-${count.max}`)
	if (count.allowed?.some((value) => value < count.min || value > count.max)) problems.push(`${where}: allowed counts outside ${count.min}-${count.max}`)
	if (count.allowed && !count.allowed.includes(count.ideal)) problems.push(`${where}: ideal ${count.ideal} is not an allowed count`)
}

function checkItems(type: string, rule: ItemRule, entryVariants: string[], problems: string[]) {
	const schema = getSchema(type)!
	if (rule.list === 'children') {
		if (!schema.container) problems.push(`${type}: items count children but it is not a container`)
	} else {
		const field = schema.fields.find((item) => item.key === rule.list)
		if (!field || field.type !== 'list') problems.push(`${type}: items list "${rule.list}" is not a list field`)
		else if (field.fixed !== undefined && (rule.count.min !== field.fixed || rule.count.max !== field.fixed))
			problems.push(`${type}: ${rule.list} is fixed at ${field.fixed} rows`)
	}
	checkCount(`${type} items`, rule.count, problems)
	for (const [variant, count] of Object.entries(rule.byVariant ?? {})) {
		if (!entryVariants.includes(variant)) problems.push(`${type}: item rule for unknown variant "${variant}"`)
		if (count) checkCount(`${type} items (${variant})`, count, problems)
	}
}

function checkSlots(type: string, slots: SectionMeta['slots'], variants: string[], problems: string[]) {
	const schema = getSchema(type)!
	for (const slot of slots) {
		const resolved = resolvePath(schema.fields, slot.path)
		if (!resolved) problems.push(`${type}: slot path "${slot.path}" is not a field`)
		else if (!KIND_FIELDS[slot.kind].includes(resolved.field.type))
			problems.push(`${type}: slot "${slot.path}" is a ${resolved.field.type} field, not ${slot.kind}`)
		if (slot.variants?.some((id) => !variants.includes(id))) problems.push(`${type}: slot "${slot.path}" names an unknown variant`)
		if (slot.tweak && !TWEAKS.includes(slot.tweak)) problems.push(`${type}: slot "${slot.path}" names an unknown tweak`)
		if (!(slot.max > 0)) problems.push(`${type}: slot "${slot.path}" has no length cap`)
	}
}

/** The catalog joined from these tables (the proofs pass shuffled copies); throws on any unresolved reference. */
export function buildCatalog(
	meta: Record<string, SectionMeta> = SECTION_META,
	children: Record<string, ChildMeta> = CHILD_META,
): Map<string, CatalogEntry> {
	const problems: string[] = []
	const entries = new Map<string, CatalogEntry>()

	for (const type of orderedTypes(meta)) {
		const item = meta[type]
		const schema = getSchema(type)
		if (!schema) {
			problems.push(`${type}: no such section in schema.ts`)
			continue
		}
		if (item.type !== type) problems.push(`${type}: meta says type "${item.type}"`)
		const schemaVariants = (schema.variants ?? []).map((variant) => variant.id)
		const pseudo = !schema.variants?.length
		for (const variant of item.variants) {
			const exists = pseudo ? variant.id === 'default' : schemaVariants.includes(variant.id)
			if (!exists) problems.push(`${type}: variant "${variant.id}" is not in schema.ts`)
			if (variant.openAlternative && !item.variants.some((other) => other.id === variant.openAlternative && !other.excluded))
				problems.push(`${type}: openAlternative "${variant.openAlternative}" is not a usable variant`)
		}

		if (item.ai !== 'never') {
			for (const id of pseudo ? ['default'] : schemaVariants)
				if (!item.variants.some((variant) => variant.id === id)) problems.push(`${type}: schema variant "${id}" has no curated metadata`)
			const ids = item.variants.map((variant) => variant.id)
			checkSlots(type, item.slots, ids, problems)
			for (const need of item.images ?? []) {
				const resolved = resolvePath(schema.fields, need.path)
				if (!resolved || resolved.field.type !== 'image') problems.push(`${type}: image path "${need.path}" is not an image field`)
				if (need.variants?.some((id) => !ids.includes(id))) problems.push(`${type}: image "${need.path}" names an unknown variant`)
			}
			if (item.items) checkItems(type, item.items, ids, problems)
			if (item.children) {
				if (!schema.container) problems.push(`${type}: has child kinds but is not a container`)
				for (const kind of [...item.children.kinds, item.children.default]) {
					const [childType, childVariant] = kind.split(':')
					if (!schema.container?.accepts.includes(childType)) problems.push(`${type}: does not accept ${childType}`)
					if (!children[childType]?.variants.some((variant) => variant.id === childVariant && variant.ai))
						problems.push(`${type}: child kind "${kind}" is not an AI card`)
				}
				if (!item.children.kinds.includes(item.children.default)) problems.push(`${type}: default child is not one of its kinds`)
			} else if (schema.container) problems.push(`${type}: a container needs its child kinds`)
			for (const tweak of item.tweaks) if (!TWEAKS.includes(tweak)) problems.push(`${type}: unknown tweak "${tweak}"`)
			for (const tone of item.surfaces) if (!SURFACE_TONES.includes(tone)) problems.push(`${type}: unknown surface "${tone}"`)
			if (!item.surfaces.length) problems.push(`${type}: no surfaces`)
			if (item.fallback && !(LAYOUT_IDS as readonly string[]).includes(item.fallback)) problems.push(`${type}: fallback "${item.fallback}" is not a layout`)
			if (item.h1 !== item.roles.includes('opener')) problems.push(`${type}: only openers render the H1`)
		}

		const layouts = item.ai === 'never' ? [] : item.variants.filter((variant) => !variant.excluded).map((variant) => `${type}:${variant.id}` as Layout)
		entries.set(type, {
			type,
			label: schema.label,
			description: schema.description,
			...(schema.variantProp ? { variantProp: schema.variantProp } : {}),
			fields: schema.fields,
			meta: item,
			variants: item.variants.map((variant) => ({
				...variant,
				label: schema.variants?.find((option) => option.id === variant.id)?.label ?? schema.label,
			})),
			layouts,
		})
	}

	// The closed vocabularies stay honest: layouts and child layouts equal vocab.ts as sets.
	const layouts = [...entries.values()].flatMap((entry) => entry.layouts)
	const expected = new Set<string>(LAYOUT_IDS)
	for (const layout of layouts) if (!expected.has(layout)) problems.push(`layout ${layout} is not in LAYOUT_IDS`)
	for (const layout of LAYOUT_IDS) if (!layouts.includes(layout)) problems.push(`LAYOUT_IDS has ${layout}, which the catalog does not offer`)
	if (new Set(layouts).size !== layouts.length) problems.push('a layout is offered twice')

	const kinds: string[] = []
	for (const type of Object.keys(children).sort()) {
		const item = children[type]
		const schema = getSchema(type)
		if (!schema) {
			problems.push(`card ${type}: no such section in schema.ts`)
			continue
		}
		const schemaVariants = (schema.variants ?? []).map((variant) => variant.id)
		for (const variant of item.variants) {
			if (!schemaVariants.includes(variant.id)) problems.push(`card ${type}: variant "${variant.id}" is not in schema.ts`)
			if (!variant.ai && !variant.excluded) problems.push(`card ${type}: variant "${variant.id}" is off without a reason`)
			if (variant.ai) kinds.push(`${type}:${variant.id}`)
		}
		for (const id of schemaVariants) if (!item.variants.some((variant) => variant.id === id)) problems.push(`card ${type}: schema variant "${id}" has no curated metadata`)
		checkSlots(type, item.slots, item.variants.map((variant) => variant.id), problems)
	}
	const childExpected = new Set<string>(CHILD_LAYOUT_IDS)
	for (const kind of kinds) if (!childExpected.has(kind)) problems.push(`card ${kind} is not in CHILD_LAYOUT_IDS`)
	for (const kind of CHILD_LAYOUT_IDS) if (!kinds.includes(kind)) problems.push(`CHILD_LAYOUT_IDS has ${kind}, which no card offers`)

	if (problems.length) throw new Error(`catalog: ${problems.join('; ')}`)
	return entries
}

let joined: Map<string, CatalogEntry> | null = null

/** Every AI-relevant section type joined with its schema; built once, on first use. */
export function catalog(): Map<string, CatalogEntry> {
	joined ??= buildCatalog()
	return joined
}

// ---------------------------------------------------------------- layout ids

/**
 * A layout id read tolerantly: case, spaces, `/` for `:`. An unknown or excluded variant
 * of a known type becomes its first usable variant; 'media-mosaic:default' has no
 * variant. Null for anything that is not an AI section.
 */
export function layoutOf(value: string): { type: string; variant: string | null } | null {
	const text = String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/\s*[:/]\s*/g, ':')
		.replace(/[\s_]+/g, '-')
	const [type, variant = ''] = text.split(':')
	if (!Object.hasOwn(SECTION_META, type)) return null
	const meta = SECTION_META[type]
	if (meta.ai === 'never') return null
	const usable = meta.variants.filter((item) => !item.excluded)
	if (!usable.length) return null
	if (usable.length === 1 && usable[0].id === 'default') return { type, variant: null }
	return { type, variant: (usable.find((item) => item.id === variant) ?? usable[0]).id }
}

/** The layout id `layoutOf` reads a value as ('media-mosaic:default' for the type without variants). */
export function layoutIdOf(value: string): Layout | null {
	const found = layoutOf(value)
	return found ? (`${found.type}:${found.variant ?? 'default'}` as Layout) : null
}

/** 'Page Hero (Centered)': the schema's labels, as the plan card and the manifest show them. */
export function layoutLabel(value: string): string {
	const found = layoutOf(value)
	if (!found) return String(value ?? '')
	const schema = getSchema(found.type)
	const variant = schema?.variants?.find((item) => item.id === found.variant)
	return variant ? `${schema!.label} (${variant.label})` : (schema?.label ?? found.type)
}

// ---------------------------------------------------------------- what the planner sees (section 6.4)

const PERSONALITY_TEXT: Record<PersonalityId, string> = {
	technical: 'precise and systems-minded: software, IT, engineering, security',
	bold: 'loud, high-contrast and confident: fitness, events, bold startups',
	friendly: 'warm, plain-spoken and approachable: home services, local shops, family businesses',
	refined: 'calm, serious and trustworthy: law, finance, insurance, consulting',
	warm: 'homely and crafted: cafés, bakeries, restaurants, makers',
	rugged: 'sturdy and no-nonsense: roofing, construction, auto, trades',
	clinical: 'clean, calm and reassuring: dental, medical, therapy, veterinary',
	editorial: 'literary and considered: studios, publishers, consultancies',
	luxe: 'quiet luxury: salons, spas, jewellers, fine dining',
	playful: 'bright and upbeat: kids, pets, parties, playful brands',
}

const BACKDROP_TEXT: Record<BackdropId, string> = {
	clean: 'the plain background colour, no pattern',
	paper: 'the background colour with a fine dot pattern',
	glow: 'a soft accent glow fading into the background',
	grid: 'the accent glow with a fine grid',
	lines: 'the background colour with fine ruled lines',
	blueprint: 'an accent gradient with a crosshatch, like a technical drawing',
}

const TWEAK_TEXT: Record<Tweak, string> = {
	'one-button': 'only the primary button',
	'no-buttons': 'no buttons at all',
	'hero-stats': 'show up to three facts under the hero',
	'hero-link': 'a text link under the figures to the secondary page',
	fan: 'five more photos fanned behind the main photo',
	'cols-2': 'two columns when the count fits',
	'cols-3': 'three columns when the count fits',
	'cols-4': 'four columns when the count fits',
	points: 'three bullet points per row or beside the comparison',
	details: 'detail lines under each step (timeline, cards), or contact facts beside the spotlight',
	'tile-images': 'photos on the wide tiles',
	'with-note': 'a reassurance line under the button',
	'full-width': 'run full width instead of the reading measure',
	'marker-plus': 'plus and minus markers',
	'marker-chevron': 'chevron markers',
	'marker-check': 'circle and check markers',
	'marker-arrow': 'arrow markers',
	'numbers-solid': 'solid step numbers on the timeline',
	'numbers-outline': 'outlined step numbers on the timeline',
	'numbers-muted': 'muted step numbers on the timeline',
	'size-md': 'medium cards in the track',
	'size-lg': 'large cards in the track',
	'size-full': 'one full-width card at a time',
}

const SURFACES_LINE =
	'plain: the page backdrop · soft: a barely lighter or darker band · tinted: a faint accent-tinted band · wash: a gentle accent gradient band · pattern: a soft band with a fine pattern · inverse: the palette flipped (dark on light sites) · inverse-glow: flipped with an accent glow (openers and cta-band:centered) · brand: a solid accent band (closers only, one per page)'

const countText = (count: Count) => {
	if (count.allowed?.length) {
		const values = count.allowed.map(String)
		return values.length === 1 ? values[0] : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`
	}
	return count.min === count.max ? String(count.min) : `${count.min}-${count.max} (${count.ideal} typical)`
}

function itemsText(type: string, meta: SectionMeta, variants: string[]) {
	if (ITEM_NOTES[type]) return ITEM_NOTES[type]
	const rule = meta.items
	if (!rule) return '0'
	const overrides = variants.filter((id) => rule.byVariant?.[id])
	const parts = overrides.length === variants.length ? [] : [countText(rule.count)]
	for (const id of overrides) parts.push(`${id} ${countText(rule.byVariant![id]!)}`)
	return parts.join(', ')
}

const alternativeText = (item: RecipeStep['alternatives'][number]) => {
	const extras = [...(item.tweaks ?? []), ...(item.surface ? [`on ${item.surface}`] : [])]
	return `${item.layout}${item.child ? `+${item.child}` : ''}${extras.length ? ` (${extras.join(', ')})` : ''}`
}

const stepText = (step: RecipeStep) => {
	const body = `${step.role} ${step.alternatives.map(alternativeText).join(' | ')}`
	return step.optional ? `[${body}]` : body
}

/** The planner's view of the kit, rendered from these tables in a fixed order. */
export function renderCatalogText(
	meta: Record<string, SectionMeta> = SECTION_META,
	children: Record<string, ChildMeta> = CHILD_META,
): string {
	const entries = buildCatalog(meta, children)
	const lines: string[] = [
		'SECTION KIT',
		'Each layout line: layout id · role · density · what it looks like · when to use it.',
		"Roles: opener (holds the page's only H1), top-bar, proof, explain, showcase, convert, closer, content, state.",
		'Density: open = no card surface · card = glass cards · panel = one ruled panel · media = photo-led.',
		'"needs" must be satisfied by the inputs; put the count shown under "items" in the section\'s "items". Containers take a "child" layout; the rest use "none".',
	]
	for (const entry of entries.values()) {
		if (!entry.layouts.length) continue
		const item = entry.meta
		const usable = item.variants.filter((variant) => !variant.excluded)
		lines.push('', `${entry.type} — ${item.purpose}`)
		for (const variant of usable)
			lines.push(`  ${entry.type}:${variant.id} · ${item.roles.join('/')} · ${variant.density} · ${variant.look}${variant.headingBeside ? ' (side heading)' : ''} · ${variant.use}`)
		const summary = [
			...(NEED_NOTES[entry.type] ? [`needs ${NEED_NOTES[entry.type]}`] : item.needs.length ? [`needs ${item.needs.join(', ')}`] : []),
			`items ${itemsText(entry.type, item, usable.map((variant) => variant.id))}`,
			...(item.children ? [`children ${item.children.kinds.join(' ')} (default ${item.children.default})`] : []),
			`pages ${item.pages === 'all' ? 'all' : item.pages.join(' ')}`,
			`surfaces ${item.surfaces.join(' ')}`,
			...(item.tweaks.length ? [`tweaks ${item.tweaks.join(' ')}`] : []),
			...(item.placement ? [`place ${item.placement}`] : []),
		]
		lines.push(`  ${summary.join(' · ')}`)
	}

	lines.push('', 'PAGE RECIPES (patterns that work; adapt them)')
	for (const archetype of ARCHETYPES) {
		const rule = ARCHETYPE_RULES[archetype]
		lines.push(`${archetype} ${rule.min}-${rule.max}: ${RECIPES[archetype].map(stepText).join(' · ')}`)
	}

	lines.push('', 'PALETTES (id · name · light/dark · mood · fits)')
	for (const palette of PALETTES) lines.push(`${palette.id} · ${palette.name} · ${palette.polarity} · ${palette.mood} · ${palette.fits}`)

	lines.push('', 'FONT PAIRS (id · heading / body · character · fits)')
	for (const pair of FONT_PAIRS) lines.push(`${pair.id} · ${pair.heading} / ${pair.body} · ${pair.character} · ${pair.fits}`)

	lines.push('', 'PERSONALITIES (id · character · palettes · fonts · shape · backdrop · header · buttons)')
	for (const id of PERSONALITY_IDS) {
		const item = PERSONALITIES[id]
		lines.push(
			`${id} · ${PERSONALITY_TEXT[id]} · palettes ${item.palettes.join(' ')} · fonts ${item.fonts.join(' ')} · shape ${item.shape} · backdrop ${item.backdrop} · header ${item.header} · buttons ${item.buttons}`,
		)
	}

	lines.push('', 'BACKDROPS (id · look)')
	for (const id of BACKDROP_IDS) lines.push(`${id} · ${BACKDROP_TEXT[id]}`)

	lines.push('', 'SURFACES', SURFACES_LINE)

	lines.push('', 'TWEAKS (token · effect · layouts)')
	for (const tweak of TWEAKS) {
		const users = [...entries.values()].filter((entry) => entry.layouts.length && entry.meta.tweaks.includes(tweak)).map((entry) => entry.type)
		lines.push(`${tweak} · ${TWEAK_TEXT[tweak]} · ${users.join(' ')}`)
	}

	lines.push('', 'ARCHETYPES (id · sections · what the page is for)')
	for (const archetype of ARCHETYPES) {
		const rule = ARCHETYPE_RULES[archetype]
		lines.push(`${archetype} · ${rule.min}-${rule.max} sections${rule.closer ? '' : ', no closer'} · ${ARCHETYPE_TEXT[archetype]}`)
	}

	return lines.join('\n')
}

let text: string | null = null

/** The catalog block of the planner's system prompt: deterministic, so the prompt cache holds. */
export function catalogText(): string {
	text ??= renderCatalogText()
	return text
}
