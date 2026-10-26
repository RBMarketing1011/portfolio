/**
 * Validation of composed and written blocks (section 6.12): the checks of the template
 * proof (types, variants, field keys and types, select options, number ranges,
 * container accepts, no top-level display items, three pricing tiers, ROI formulas),
 * plus what an AI-built page must never ship: an unfilled slot that would fall back to
 * placeholder copy, an off count that leaves a hole, an unknown icon, a photo that is not
 * the owner's, a link that goes nowhere, a review that is not word for word.
 *
 * An empty list is valid: `[]` is the only way to hide a list default (page-hero
 * `actions`, split-hero `backdrop`, spotlight `details`), so list sizes are checked
 * against the catalog's item rules instead.
 *
 * Pure: no client modules (icons through `isCanonicalIcon`, not the client `resolveIcon`).
 */
import { evaluateFormula } from '../formula'
import { anchorId, formulaName } from '../ids'
import { isProseHtml, sanitizeProseHtml } from '../prose-html'
import { getSchema } from '../schema'
import type { Block, Field } from '../types'
import { CHILD_META } from './children'
import { isCanonicalIcon } from './lexicon'
import { countFor, SECTION_META } from './meta'
import { ARCHETYPE_RULES } from './recipes'
import { getAt, isScalarList, proseHeadings, slotsFor } from './slots'
import type { ValidateCtx } from './types'

export type { ValidateCtx }

/** The kit's own product screenshots and demo video, never a customer's photo. */
const KIT_MEDIA = /^\/(scheduler|hub|portal|reports|mmc|omni-u)(\/|$)/

// ---------------------------------------------------------------- the template checks, ported

function checkValue(where: string, field: Field, value: unknown, fail: (message: string) => void) {
	switch (field.type) {
		case 'text':
		case 'textarea':
		case 'richtext':
			if (typeof value !== 'string') fail(`${where}: expected text, got ${typeof value}`)
			else if (!value.trim()) fail(`${where}: empty text`)
			break
		case 'prose':
			if (!isProseHtml(value)) fail(`${where}: prose must be editor HTML`)
			break
		case 'number':
		case 'range':
			if (typeof value !== 'number' || Number.isNaN(value)) fail(`${where}: expected a number`)
			else if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max))
				fail(`${where}: ${value} outside ${field.min}..${field.max}`)
			break
		case 'boolean':
			if (typeof value !== 'boolean') fail(`${where}: expected true/false`)
			break
		case 'select':
			if (!field.options?.some((option) => option.value === value))
				fail(`${where}: "${String(value)}" is not one of ${(field.options ?? []).map((option) => option.value).join('|')}`)
			break
		case 'icon':
			if (typeof value !== 'string' || !isCanonicalIcon(value)) fail(`${where}: icon "${String(value)}" is not a canonical Lucide name`)
			break
		case 'image':
			if (typeof value !== 'string') fail(`${where}: expected an image reference`)
			break
		case 'group':
			if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${where}: expected an object`)
			else checkProps(where, field.of ?? [], value as Record<string, unknown>, fail)
			break
		case 'list':
			if (!Array.isArray(value)) return fail(`${where}: expected a list`)
			if (isScalarList(field)) value.forEach((item, index) => checkValue(`${where}.${index}`, field.of![0], item, fail))
			else
				value.forEach((row, index) => {
					if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`${where}.${index}: expected a row`)
					else checkProps(`${where}.${index}`, field.of ?? [], row as Record<string, unknown>, fail)
				})
			break
		default:
			fail(`${where}: unhandled field type ${field.type}`)
	}
}

function checkProps(where: string, fields: Field[], props: Record<string, unknown>, fail: (message: string) => void) {
	for (const [key, value] of Object.entries(props)) {
		const field = fields.find((item) => item.key === key)
		if (!field) {
			fail(`${where}${where ? '.' : ''}${key}: not a field (has: ${fields.map((item) => item.key).join(', ')})`)
			continue
		}
		checkValue(`${where}${where ? '.' : ''}${key}`, field, value, fail)
	}
}

// ---------------------------------------------------------------- walking values by field

type Visit = (path: string, field: Field, value: unknown) => void

/** Every stored value with its field, through groups, rows and scalar lists. */
function walkValues(fields: Field[], props: Record<string, unknown> | undefined, visit: Visit, prefix = '') {
	for (const field of fields) {
		const value = props?.[field.key]
		if (value === undefined) continue
		const path = `${prefix}${field.key}`
		if (field.type === 'group' && value && typeof value === 'object') walkValues(field.of ?? [], value as Record<string, unknown>, visit, `${path}.`)
		else if (field.type === 'list' && Array.isArray(value)) {
			if (isScalarList(field)) value.forEach((item, index) => visit(`${path}.${index}`, field.of![0], item))
			else
				value.forEach((row, index) => {
					if (row && typeof row === 'object') walkValues(field.of ?? [], row as Record<string, unknown>, visit, `${path}.${index}.`)
				})
		} else visit(path, field, value)
	}
}

const isLinkField = (field: Field) => field.type === 'text' && (field.key === 'href' || field.key.endsWith('Href'))

function linkProblem(href: unknown, ctx: ValidateCtx): string | null {
	if (typeof href !== 'string' || !href) return 'goes nowhere'
	if (href.startsWith('/')) {
		const path = href.length > 1 ? href.replace(/\/+$/, '') : href
		return ctx.pagePaths.includes(path) ? null : `"${href}" is not a page of this site`
	}
	if (href.startsWith('tel:')) {
		const digits = href.slice(4).replace(/\D/g, '')
		return /^tel:\+?[\d\s().-]+$/.test(href) && digits.length >= 7 && digits.length <= 15 ? null : `"${href}" is not a phone number`
	}
	if (href.startsWith('mailto:')) {
		const email = (ctx.email ?? '').replace(/^mailto:/i, '').toLowerCase()
		return email && href.slice(7).toLowerCase() === email ? null : `"${href}" is not the business email`
	}
	return `"${href}" is not a page path, tel: or mailto:`
}

function imageProblem(value: unknown, ctx: ValidateCtx): string | null {
	if (typeof value !== 'string' || !value) return 'no image'
	if (KIT_MEDIA.test(value)) return `"${value}" is the kit's own sample media`
	if (value.startsWith('media:')) return ctx.mediaIds.has(value.slice('media:'.length)) ? null : `"${value}" is not in the site's media`
	return ctx.imageValues.has(value) ? null : `"${value}" is not one of this build's photos`
}

/** Rows fill without a hole: a tile that does not fit what is left of a row would start the next one. */
function spansFill(spans: number[], columns: number) {
	let used = 0
	for (const raw of spans) {
		const span = Math.min(Math.max(Number(raw) || 1, 1), columns)
		if (used + span > columns) return false
		used = (used + span) % columns
	}
	return used === 0
}

const listOf = (block: Block, key: string): unknown[] =>
	key === 'children' ? (block.children ?? []) : Array.isArray(block.props?.[key]) ? (block.props![key] as unknown[]) : []

// ---------------------------------------------------------------- the AI checks

function checkAi(block: Block, ctx: ValidateCtx, fail: (message: string) => void) {
	const meta = SECTION_META[block.type]
	const schema = getSchema(block.type)!
	const props = block.props ?? {}
	const variant = block.variant ?? 'default'
	const usable = meta.variants.filter((item) => !item.excluded).map((item) => item.id)
	if (!usable.includes(variant)) fail(`variant "${block.variant ?? '(none)'}" is not one the AI may use (${usable.join('|')})`)

	// Nothing falls back to a component default: every list, group and default-on switch is explicit.
	for (const field of schema.fields) {
		if (field.type === 'list' && !Array.isArray(props[field.key])) fail(`${field.key}: must be set explicitly ([] hides it)`)
		if (field.type === 'group' && (!props[field.key] || typeof props[field.key] !== 'object')) fail(`${field.key}: must be set explicitly`)
		if (field.type === 'boolean' && field.defaultValue === true && typeof props[field.key] !== 'boolean') fail(`${field.key}: must be set explicitly`)
	}

	// Every slot the variant renders holds a non-empty string.
	for (const slot of slotsFor('x', block)) {
		const target = slot.blockId === block.id ? block : block.children?.find((child) => child.id === slot.blockId)
		const value = getAt(target?.props, slot.path)
		if (typeof value !== 'string' || !value.trim()) fail(`${slot.id.slice(2)}: slot is empty`)
	}

	// Counts (section 6.12).
	const rule = countFor(meta.items, block.variant ?? null)
	if (meta.items && rule) {
		const count = listOf(block, meta.items.list).length
		// A list of page links has one row per real page, so any count in range reads fine.
		const links = block.children?.[0]?.type === 'related-card' && block.children[0].variant === 'list'
		const allowed = links ? undefined : rule.allowed
		if (count < rule.min || count > rule.max || (allowed && !allowed.includes(count)))
			fail(`${meta.items.list}: ${count} items, wants ${allowed ? allowed.join(' or ') : `${rule.min}-${rule.max}`}`)
	}
	const length = (key: string) => listOf(block, key).length
	switch (block.type) {
		case 'page-hero':
			if (length('actions') > 2) fail('actions: at most 2 render')
			break
		case 'split-hero':
			if (length('actions') > 2) fail('actions: at most 2 render')
			if (![0, 5].includes(length('backdrop'))) fail('backdrop: the fan is all five photos or none')
			break
		case 'spotlight':
			if (length('actions') !== 1) fail('actions: wants exactly 1')
			if (length('details') > 4 || (variant === 'overlap' && length('details') > 0)) fail('details: at most 4, none in overlap')
			break
		case 'before-after':
			if (length('before') !== length('after')) fail('before and after must be the same length')
			break
		case 'feature-rows':
		case 'tabs-showcase':
			for (const row of listOf(block, block.type === 'feature-rows' ? 'rows' : 'items') as Record<string, unknown>[])
				if (Array.isArray(row?.points) && row.points.length > 3) fail('points: at most 3 per row')
			break
		case 'process-steps':
			for (const step of listOf(block, 'steps') as Record<string, unknown>[])
				if (Array.isArray(step?.detail) && step.detail.length > 3) fail('detail: at most 3 per step')
			break
		case 'cta-band':
			if (length('actions') < 1 || length('actions') > 2) fail('actions: wants 1 or 2')
			break
		case 'bento-grid': {
			const columns = Number(props.columns ?? 3)
			const tiles = listOf(block, 'tiles') as Record<string, unknown>[]
			if (!(columns === 4 ? [4, 6, 8] : [4, 6]).includes(tiles.length)) fail(`tiles: ${tiles.length} in ${columns} columns`)
			if (!spansFill(tiles.map((tile) => Number(tile?.span ?? 1)), columns)) fail('tiles: the spans leave a hole in a row')
			break
		}
		case 'grid': {
			const columns = variant === 'beside' ? 2 : Number(props.columns ?? 3)
			const first = block.children?.[0]
			const list = first?.type === 'related-card' && first.variant === 'list'
			if (!list && length('children') % columns !== 0) fail(`children: ${length('children')} cards leave a hole in ${columns} columns`)
			break
		}
		case 'masonry':
		case 'carousel': {
			const photos = block.children?.some((child) => child.type === 'media-card')
			const [min, max] = block.type === 'masonry' ? (photos ? [6, 12] : [3, 9]) : photos ? [4, 10] : [1, 12]
			if (length('children') < min || length('children') > max) fail(`children: ${length('children')}, wants ${min}-${max}`)
			break
		}
		case 'table-of-contents':
			if (length('items') < 3) fail('items: a table of contents needs at least 3 headings')
			break
	}

	// Photos are the owner's, and required ones are there.
	walkValues(schema.fields, props, (path, field, value) => {
		if (field.type === 'image') {
			const problem = imageProblem(value, ctx)
			if (problem) fail(`${path}: ${problem}`)
		}
		if (isLinkField(field)) {
			const problem = linkProblem(value, ctx)
			if (problem) fail(`${path}: ${problem}`)
		}
		if (field.type === 'prose' && typeof value === 'string' && sanitizeProseHtml(value) !== value) fail(`${path}: prose is not sanitized`)
	})
	for (const need of meta.images ?? []) {
		if (!need.required || (need.variants && !need.variants.includes(variant)) || need.tweak) continue
		const [list, key] = need.path.split('[].')
		if (key) {
			listOf(block, list).forEach((row, index) => {
				if (!getAt(row, [key])) fail(`${list}.${index}.${key}: photo missing`)
			})
		} else if (!props[need.path]) fail(`${need.path}: photo missing`)
	}

	// Numbered cards carry their own number (the default always reads 01).
	block.children?.forEach((child, index) => {
		if (child.type === 'feature-card' && child.variant === 'numbered' && child.props?.index !== index + 1)
			fail(`children.${index}: numbered card wants index ${index + 1}`)
	})
}

function checkChild(child: Block, ctx: ValidateCtx, fail: (message: string) => void) {
	const meta = CHILD_META[child.type]
	const props = child.props ?? {}
	if (!meta) return fail(`${child.type} is not a card the AI places`)
	if (!meta.variants.some((item) => item.ai && item.id === (child.variant ?? ''))) fail(`variant "${child.variant ?? '(none)'}" is not one the AI may use`)
	const schema = getSchema(child.type)!
	walkValues(schema.fields, props, (path, field, value) => {
		if (field.type === 'image') {
			const problem = imageProblem(value, ctx)
			if (problem) fail(`${path}: ${problem}`)
		}
		if (isLinkField(field)) {
			const problem = linkProblem(value, ctx)
			if (problem) fail(`${path}: ${problem}`)
		}
	})
	if (child.type === 'media-card' && !props.src) fail('src: photo missing')
	if (child.type === 'related-card' && (!props.title || !props.href)) fail('a related card links to a real page by name')
	if (child.type === 'client-logo' && (props.src || !props.name)) fail('a ticker name only, never a logo file')
	if (child.type === 'testimonial-card') {
		const same = ctx.reviews.some(
			(review) =>
				review.quote === props.quote &&
				review.name === props.name &&
				(review.role || '') === ((props.role as string | undefined) ?? '') &&
				(review.source || '') === ((props.company as string | undefined) ?? ''),
		)
		if (!same) fail("testimonial is not one of the owner's reviews, word for word")
	}
}

/** Problems with one block (empty means valid). `parent` is the container a card sits in. */
export function validateBlock(block: Block, ctx: ValidateCtx, parent?: Block): string[] {
	const problems: string[] = []
	const fail = (message: string) => problems.push(message)
	const schema = getSchema(block.type)
	if (!schema) return [`unknown section "${block.type}"`]
	if (block.variant && !schema.variants?.some((item) => item.id === block.variant))
		fail(`variant "${block.variant}" is not one of ${(schema.variants ?? []).map((item) => item.id).join('|')}`)

	if (parent) {
		const parentSchema = getSchema(parent.type)
		if (!parentSchema?.container?.accepts.includes(block.type)) fail(`${parent.type} does not accept ${block.type}`)
	} else if (schema.displayItem && !schema.bare) {
		fail('is an item, not a section; it belongs inside a container')
	}
	if (block.props) checkProps('', schema.fields, block.props, fail)

	if (block.type === 'pricing-tiers' && listOf(block, 'tiers').length !== 3) fail(`has ${listOf(block, 'tiers').length} tiers, wants exactly 3`)
	if (block.type === 'roi-calculator' && Array.isArray(block.props?.outputs)) {
		const inputs = listOf(block, 'inputs') as { label?: string; value?: number }[]
		const scope = Object.fromEntries(inputs.map((input, index) => [formulaName(input?.label, index), Number(input?.value ?? 0)]))
		for (const output of block.props.outputs as { formula?: string }[]) {
			const value = evaluateFormula(String(output?.formula ?? ''), scope)
			if (typeof value !== 'number' || !Number.isFinite(value)) fail(`formula "${output?.formula}" does not evaluate`)
		}
	}

	const meta = SECTION_META[block.type]
	if (!parent && meta && meta.ai !== 'never') checkAi(block, ctx, fail)
	if (parent && SECTION_META[parent.type]?.ai !== 'never' && SECTION_META[parent.type]) checkChild(block, ctx, fail)

	if (block.children) {
		if (!schema.container) fail('has children but is not a container')
		else
			block.children.forEach((child, index) => {
				for (const problem of validateBlock(child, ctx, block)) fail(`children.${index}: ${problem}`)
			})
	}
	return problems
}

/**
 * Every block's problems plus the page's own: one opener, first (after an optional
 * announcement bar); a closer last on marketing pages (when `ctx.archetype` is given);
 * no layout twice; a table of contents that matches its prose. Page-level problems
 * carry `blockId: ''`, because no single block is at fault.
 */
export function validatePage(blocks: Block[], ctx: ValidateCtx): { blockId: string; problems: string[] }[] {
	const found = new Map<string, string[]>()
	const add = (blockId: string, problem: string) => found.set(blockId, [...(found.get(blockId) ?? []), problem])
	for (const block of blocks) for (const problem of validateBlock(block, ctx)) add(block.id, problem)

	const roles = (block: Block) => SECTION_META[block.type]?.roles ?? []
	const openers = blocks.filter((block) => roles(block).includes('opener'))
	if (!openers.length) add('', 'the page has no opener (and so no H1)')
	for (const extra of openers.slice(1)) add(extra.id, 'a second opener: a page has one H1')
	const expected = blocks[0]?.type === 'announcement-bar' ? 1 : 0
	if (openers[0] && blocks.indexOf(openers[0]) !== expected) add('', 'the opener is not the first section')
	blocks.forEach((block, index) => {
		if (block.type === 'announcement-bar' && index !== 0) add(block.id, 'an announcement bar only sits at the very top')
	})
	if (ctx.archetype && ARCHETYPE_RULES[ctx.archetype]?.closer) {
		const last = blocks[blocks.length - 1]
		if (!last || !roles(last).includes('closer')) add('', 'a marketing page ends on a closer')
	}

	const seen = new Set<string>()
	for (const block of blocks) {
		if (block.type === 'faq-accordion' && ctx.archetype === 'faq') continue
		const layout = `${block.type}:${block.variant ?? 'default'}`
		const first = block.children?.[0]
		const key = block.type === 'grid' && first ? `${layout}+${first.type}:${first.variant ?? ''}` : layout
		if (seen.has(key)) add(block.id, `repeats ${layout} on this page`)
		seen.add(key)
	}

	blocks.forEach((block, index) => {
		if (block.type !== 'table-of-contents') return
		const prose = blocks.slice(index + 1).find((item) => item.type === 'prose-block')
		const headings = proseHeadings(prose?.props?.body).map(anchorId)
		const entries = (listOf(block, 'items') as { label?: string }[]).map((item) => anchorId(item?.label))
		if (!prose) add(block.id, 'a table of contents needs a prose block after it')
		else if (entries.join('|') !== headings.join('|')) add(block.id, 'its entries do not match the prose headings')
	})

	return [...found].map(([blockId, problems]) => ({ blockId, problems }))
}
