/**
 * Slots: the strings the writer fills, addressed by id ('s4.faqs.2.answer'), and the
 * rules that clean each value before it reaches a page (section 10.5).
 *
 * The writer never adds, drops or reorders rows: composing sizes every list first, so a
 * slot id is also the exact place its value is written. A missing or failing value is
 * reported, never merged by index and never left to a component default.
 *
 * Pure: no client modules.
 */
import { anchorId } from '../ids'
import { isProseHtml, sanitizeProseHtml } from '../prose-html'
import { getSchema, sectionSchemas } from '../schema'
import type { Block, Field, FieldType } from '../types'
import { CHILD_META } from './children'
import { canonicalIcon, isCanonicalIcon, matchIcon, nextIcon } from './lexicon'
import { clampWords, PROSE_LENGTH, SECTION_META } from './meta'
import type { Archetype, ResolvedSlot, SlotKind, SlotProblem, SlotSpec, Tweak } from './types'

export type { ResolvedSlot, SlotProblem }

// ---------------------------------------------------------------- paths

export type PathSegment = { key: string; list: boolean }
export type ResolvedPath = { segments: PathSegment[]; field: Field; scalar: boolean }

export const isScalarList = (field: Field) =>
	field.type === 'list' && field.of?.length === 1 && field.of[0].key === 'value'

/** The field types a slot kind may be written into (section 6.3, step 4). */
export const KIND_FIELDS: Record<SlotKind, FieldType[]> = {
	eyebrow: ['text', 'textarea', 'richtext'],
	heading: ['text', 'textarea', 'richtext'],
	richtext: ['richtext'],
	subhead: ['text', 'textarea', 'richtext'],
	paragraph: ['text', 'textarea', 'richtext'],
	short: ['text', 'textarea', 'richtext'],
	label: ['text', 'textarea', 'richtext'],
	button: ['text', 'textarea', 'richtext'],
	question: ['text', 'textarea', 'richtext'],
	answer: ['text', 'textarea', 'richtext'],
	item: ['text', 'textarea', 'richtext'],
	prose: ['prose'],
	icon: ['icon'],
	alt: ['text', 'textarea', 'richtext'],
	caption: ['text', 'textarea', 'richtext'],
	meta: ['text', 'textarea', 'richtext'],
}

/**
 * A catalog path ('faqs[].answer', 'items[]', 'action.label', 'before.alt') against a
 * section's fields. Flat dotted keys ('before.alt' is one field) win over groups, and a
 * path that ends on `[]` names the values of a scalar list. Null when it does not resolve.
 */
export function resolvePath(fields: Field[], path: string): ResolvedPath | null {
	const parts = String(path).split('.')
	const segments: PathSegment[] = []
	let scope: Field[] | undefined = fields
	let field: Field | null = null
	let at = 0
	while (at < parts.length) {
		let found: { field: Field; list: boolean; key: string; next: number } | null = null
		for (let end = parts.length; end > at && !found; end--) {
			const raw = parts.slice(at, end).join('.')
			const list = raw.endsWith('[]')
			const key = list ? raw.slice(0, -2) : raw
			const match = scope?.find((item) => item.key === key)
			if (match) found = { field: match, list, key, next: end }
		}
		if (!found) return null
		field = found.field
		segments.push({ key: found.key, list: found.list })
		at = found.next
		if (found.list) {
			if (field.type !== 'list' || !field.of) return null
			if (at === parts.length) return isScalarList(field) ? { segments, field: field.of[0], scalar: true } : null
			scope = field.of
		} else if (at < parts.length) {
			if (field.type !== 'group' || !field.of) return null
			scope = field.of
		}
	}
	return field ? { segments, field, scalar: false } : null
}

/** Every concrete path a resolved path names in these props, one per existing row. */
export function expandPath(props: unknown, resolved: ResolvedPath): (string | number)[][] {
	const walk = (node: unknown, at: number, prefix: (string | number)[]): (string | number)[][] => {
		const segment = resolved.segments[at]
		const last = at === resolved.segments.length - 1
		if (segment.list) {
			const rows = node && typeof node === 'object' ? (node as Record<string, unknown>)[segment.key] : undefined
			if (!Array.isArray(rows)) return []
			if (last) return rows.map((_, index) => [...prefix, segment.key, index])
			return rows.flatMap((row, index) => walk(row, at + 1, [...prefix, segment.key, index]))
		}
		if (last) return [[...prefix, segment.key]]
		const next = node && typeof node === 'object' ? (node as Record<string, unknown>)[segment.key] : undefined
		return walk(next, at + 1, [...prefix, segment.key])
	}
	return walk(props, 0, [])
}

export function getAt(target: unknown, path: (string | number)[]): unknown {
	let node = target
	for (const key of path) {
		if (!node || typeof node !== 'object') return undefined
		node = (node as Record<string | number, unknown>)[key]
	}
	return node
}

export function setAt(target: Record<string, unknown>, path: (string | number)[], value: unknown) {
	let node: Record<string | number, unknown> = target
	for (let index = 0; index < path.length - 1; index++) {
		const key = path[index]
		if (!node[key] || typeof node[key] !== 'object') node[key] = typeof path[index + 1] === 'number' ? [] : {}
		node = node[key] as Record<string | number, unknown>
	}
	node[path[path.length - 1]] = value
}

// Field keys that contain a dot ('before.alt'): one key, not a group and a field.
let flatKeys: Set<string> | null = null
function flatKeySet() {
	if (flatKeys) return flatKeys
	const keys = new Set<string>()
	const visit = (fields: Field[] | undefined) => {
		for (const field of fields ?? []) {
			if (field.key.includes('.')) keys.add(field.key)
			visit(field.of)
		}
	}
	for (const schema of sectionSchemas) visit(schema.fields)
	flatKeys = keys
	return keys
}

/**
 * A slot id as the path inside the block its `blockId` names: 's4.faqs.2.answer' →
 * ['faqs', 2, 'answer'], 's5.c2.title' → ['title'] (inside the third child),
 * 's3.before.alt' → ['before.alt'].
 */
export function slotPath(id: string): (string | number)[] {
	const parts = String(id ?? '').split('.').slice(1)
	if (parts[0] && /^c\d+$/.test(parts[0])) parts.shift()
	const keys = flatKeySet()
	const path: (string | number)[] = []
	for (let index = 0; index < parts.length; index++) {
		const pair = index + 1 < parts.length ? `${parts[index]}.${parts[index + 1]}` : ''
		if (pair && keys.has(pair)) {
			path.push(pair)
			index++
		} else path.push(/^\d+$/.test(parts[index]) ? Number(parts[index]) : parts[index])
	}
	return path
}

// ---------------------------------------------------------------- expansion

/** Scalar slots a tweak adds, and the switch that shows them on the block. List slots need none: their rows decide. */
const TWEAK_SWITCHES: Partial<Record<Tweak, string>> = { 'hero-link': 'showLink', 'with-note': 'showNote' }

const variantOf = (block: Block) => {
	const schema = getSchema(block.type)
	return block.variant ?? schema?.variants?.[0]?.id ?? 'default'
}

function applies(spec: SlotSpec, block: Block) {
	if (spec.variants && !spec.variants.includes(variantOf(block))) return false
	const toggle = spec.tweak ? TWEAK_SWITCHES[spec.tweak] : undefined
	return !toggle || block.props?.[toggle] === true
}

function expandSlots(block: Block, specs: SlotSpec[], idPrefix: string, archetype: Archetype | undefined): ResolvedSlot[] {
	const schema = getSchema(block.type)
	if (!schema) return []
	const out: ResolvedSlot[] = []
	for (const spec of specs) {
		if (!applies(spec, block)) continue
		const resolved = resolvePath(schema.fields, spec.path)
		if (!resolved) continue
		const prose = spec.kind === 'prose' && block.type === 'prose-block' && archetype ? PROSE_LENGTH[archetype] : undefined
		const guide = prose?.guide ?? spec.guide
		for (const path of expandPath(block.props ?? {}, resolved)) {
			out.push({
				id: `${idPrefix}.${path.join('.')}`,
				blockId: block.id,
				path,
				kind: spec.kind,
				max: prose?.max ?? spec.max,
				...(guide ? { guide } : {}),
			})
		}
	}
	return out
}

/**
 * The slots a composed block asks the writer to fill: the section's own for its variant
 * and switches, one per existing row, then each child card's as `<key>.c<i>.<path>`.
 */
export function slotsFor(key: string, block: Block, opts: { archetype?: Archetype } = {}): ResolvedSlot[] {
	const meta = SECTION_META[block.type]
	if (!meta || meta.ai === 'never') return []
	const slots = expandSlots(block, meta.slots, key, opts.archetype)
	block.children?.forEach((child, index) => {
		const childMeta = CHILD_META[child.type]
		if (childMeta) slots.push(...expandSlots(child, childMeta.slots, `${key}.c${index}`, opts.archetype))
	})
	return slots
}

// ---------------------------------------------------------------- cleaning (section 10.5)

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" }
const decodeEntities = (value: string) =>
	value.replace(/&(amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi, (_, name: string) => ENTITIES[name.toLowerCase()] ?? '')

const NO_FULL_STOP: SlotKind[] = ['eyebrow', 'label', 'button', 'item', 'meta']
const MUST_FIT: SlotKind[] = ['heading', 'richtext', 'subhead', 'button', 'question']
const SENTENCES: SlotKind[] = ['paragraph', 'short', 'answer', 'caption']
const WORDS: SlotKind[] = ['eyebrow', 'label', 'item', 'meta', 'alt']

/** Keeps the first [[highlight]] of one to three words and unwraps every other bracket. */
function keepOneHighlight(value: string) {
	let kept = false
	const marked = value.replace(/\[\[([^\[\]]*?)\]\]/g, (_, inner: string) => {
		const words = inner.trim().split(/\s+/).filter(Boolean)
		if (!kept && words.length >= 1 && words.length <= 3) {
			kept = true
			return `\u0001${inner.trim()}\u0002`
		}
		return inner
	})
	return marked.replace(/\[\[|\]\]/g, '').replace(/\u0001/g, '[[').replace(/\u0002/g, ']]')
}

const QUOTE_PAIRS = ['""', '“”', "''", '‘’', '«»', '„“']

/** Quotation marks around the whole value come off; a quote that is part of the copy stays. */
function unquote(value: string) {
	if (value.length < 3) return value
	const open = value[0]
	const close = value[value.length - 1]
	if (!QUOTE_PAIRS.includes(open + close)) return value
	const inner = value.slice(1, -1)
	return inner.includes(open) || inner.includes(close) ? value : inner.trim()
}

const visibleLength = (value: string, kind: SlotKind) =>
	kind === 'richtext' ? value.replace(/\[\[|\]\]/g, '').length : value.length

/** Plain text the model sent as prose, as paragraphs (and `##` headings). */
function proseFromText(text: string) {
	const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	return text
		.split(/\n{2,}/)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => {
			const heading = chunk.match(/^(#{2,3})\s+([\s\S]*)$/)
			if (heading) return heading[1] === '##' ? `<h2>${escape(heading[2])}</h2>` : `<h3>${escape(heading[2])}</h3>`
			return `<p>${escape(chunk.replace(/\s+/g, ' '))}</p>`
		})
		.join('')
}

function cleanProse(raw: string) {
	let html = String(raw ?? '').trim()
	if (!/<(p|h[1-6]|ul|ol|blockquote)\b/i.test(html)) html = proseFromText(html)
	html = html
		.replace(/<h1(\s[^>]*)?>/gi, '<h2>')
		.replace(/<\/h1\s*>/gi, '</h2>')
		// Links become their text: code sets every href, never the writer.
		.replace(/<a\b[^>]*>/gi, '')
		.replace(/<\/a\s*>/gi, '')
	return sanitizeProseHtml(html).trim()
}

/** Steps 1 and 2 of section 10.5: the value as text of its kind, before any length rule. */
export function cleanSlotValue(raw: string, kind: SlotKind): string {
	if (kind === 'prose') return cleanProse(raw)
	let value = decodeEntities(String(raw ?? '').replace(/<[^>]*>/g, ' '))
	value = value
		.replace(/\s+/g, ' ')
		.trim()
		// Markdown emphasis and code marks, which would print literally.
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/__([^_]+)__/g, '$1')
		.replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
		.replace(/`([^`]*)`/g, '$1')
	value = unquote(value)
	value = kind === 'richtext' ? keepOneHighlight(value) : value.replace(/\[\[|\]\]/g, '')
	value = value.replace(/\s+/g, ' ').trim()
	if (NO_FULL_STOP.includes(kind)) value = value.replace(/([^.])\.$/, '$1')
	if (kind === 'question' && value && !value.endsWith('?')) value = `${value.replace(/[.!:;,\s]+$/, '')}?`
	return value
}

/** The text up to the last complete sentence that fits, or null when none does. */
export function cutAtSentence(value: string, max: number): string | null {
	if (value.length <= max) return value
	let end = -1
	for (let index = 0; index < Math.min(value.length, max); index++) {
		if (/[.!?…]/.test(value[index]) && (index + 1 === value.length || /\s/.test(value[index + 1]))) end = index + 1
	}
	return end > 0 ? value.slice(0, end).trim() : null
}

/** Prose up to the last complete block element that fits, or null when none does. */
export function cutProse(html: string, max: number): string | null {
	if (html.length <= max) return html
	let end = -1
	const closer = /<\/(p|h2|h3|h4|ul|ol|blockquote|pre)\s*>/gi
	let match: RegExpExecArray | null
	while ((match = closer.exec(html)) && match.index + match[0].length <= max) end = match.index + match[0].length
	return end > 0 ? html.slice(0, end) : null
}

/** Step 3: the length rule for the slot's kind. */
function fitLength(value: string, kind: SlotKind, max: number): { value: string; problem?: string; trimmed?: boolean } {
	const length = visibleLength(value, kind)
	if (kind === 'icon' || length <= max) return { value }
	if (MUST_FIT.includes(kind)) return { value, problem: `too long: ${length} characters` }
	if (SENTENCES.includes(kind)) {
		const cut = cutAtSentence(value, max)
		return cut ? { value: cut, trimmed: true } : { value, problem: `too long: ${length} characters` }
	}
	if (kind === 'prose') {
		const cut = cutProse(value, max)
		return cut ? { value: cut, trimmed: true } : { value, problem: `too long: ${length} characters` }
	}
	if (WORDS.includes(kind)) return { value: clampWords(value, max), trimmed: true }
	return { value: clampWords(value, max), trimmed: true }
}

/** Bracketed placeholders such as "[License number]" (never a [[highlight]]). */
export function placeholdersIn(value: string): string[] {
	const plain = String(value ?? '').replace(/\[\[[\s\S]*?\]\]/g, ' ')
	return plain.match(/\[[^\[\]\n]{1,60}\]/g) ?? []
}

/** The icon a component falls back to, used when the writer's choice is not a real icon. */
const TYPE_ICON: Record<string, string> = {
	'feature-card': 'Workflow', 'bento-grid': 'Workflow', 'stat-band': 'Gauge', callout: 'Info',
}

/** The words an icon should depict: its row's title or label, else the section's heading. */
function iconContext(block: Block, path: (string | number)[]) {
	const row = path.length > 1 ? getAt(block.props, path.slice(0, -1)) : block.props
	const read = (node: unknown) => {
		if (!node || typeof node !== 'object') return ''
		const record = node as Record<string, unknown>
		return ['title', 'label', 'name', 'value', 'text', 'blurb', 'body']
			.map((key) => (typeof record[key] === 'string' ? (record[key] as string) : ''))
			.join(' ')
	}
	return `${read(row)} ${path.length > 1 ? '' : read(block.props)}`.trim()
}

export type SlotAdjustment = { slot: ResolvedSlot; code: 'icon-replaced' | 'text-trimmed'; from: string; to: string }

/**
 * Writes the writer's values into composed blocks (section 10.5). Returns new blocks;
 * the input is never changed. A value with a problem is not written, so the block keeps
 * no half-checked copy: the caller repairs it, applies a fallback, or drops the section.
 *
 * `check` is the writer's facts and banned-phrase gate, run on every text value.
 */
export function applySlots(
	blocks: Block[],
	slots: ResolvedSlot[],
	values: Map<string, string>,
	check: (value: string, slot: ResolvedSlot) => string[],
): {
	blocks: Block[]
	problems: SlotProblem[]
	placeholders: { blockId: string; path: string; text: string }[]
	adjustments: SlotAdjustment[]
} {
	const next: Block[] = structuredClone(blocks)
	const byId = new Map<string, Block>()
	const index = (list: Block[]) =>
		list.forEach((block) => {
			byId.set(block.id, block)
			if (block.children) index(block.children)
		})
	index(next)

	const problems: SlotProblem[] = []
	const placeholders: { blockId: string; path: string; text: string }[] = []
	const adjustments: SlotAdjustment[] = []
	const iconsBySection = new Map<string, Set<string>>()

	for (const slot of slots) {
		const block = byId.get(slot.blockId)
		if (!block) {
			problems.push({ slot, problems: ['missing'], value: '' })
			continue
		}
		block.props ??= {}
		const raw = values.get(slot.id)

		if (slot.kind === 'icon') {
			// Icons are repaired in code, never sent back to the writer.
			const section = slot.id.split('.')[0]
			const taken = iconsBySection.get(section) ?? new Set<string>()
			iconsBySection.set(section, taken)
			const wanted = canonicalIcon(raw) ?? ''
			const context = iconContext(block, slot.path)
			let icon = isCanonicalIcon(wanted) ? wanted : (matchIcon(context) ?? TYPE_ICON[block.type] ?? nextIcon(taken))
			if (taken.has(icon)) {
				const match = matchIcon(context)
				icon = match && !taken.has(match) ? match : nextIcon(taken, icon)
			}
			taken.add(icon)
			if (icon !== wanted) adjustments.push({ slot, code: 'icon-replaced', from: wanted, to: icon })
			setAt(block.props, slot.path, icon)
			continue
		}

		if (raw === undefined || raw === null || !String(raw).trim()) {
			problems.push({ slot, problems: ['missing'], value: '' })
			continue
		}
		const cleaned = cleanSlotValue(String(raw), slot.kind)
		if (!cleaned) {
			problems.push({ slot, problems: ['missing'], value: '' })
			continue
		}
		const fitted = fitLength(cleaned, slot.kind, slot.max)
		const found: string[] = []
		if (fitted.problem) found.push(fitted.problem)
		if (slot.kind === 'prose' && !isProseHtml(fitted.value)) found.push('not prose: use <p> paragraphs and <h2>/<h3> headings')
		found.push(...check(fitted.value, slot))

		const brackets = found.length ? [] : placeholdersIn(fitted.value)
		if (brackets.length && placeholders.length + brackets.length > 2) found.push('placeholder limit: at most two bracketed placeholders per page')
		if (found.length) {
			problems.push({ slot, problems: found, value: fitted.value })
			continue
		}
		for (const text of brackets) placeholders.push({ blockId: block.id, path: slot.path.join('.'), text })
		if (fitted.trimmed) adjustments.push({ slot, code: 'text-trimmed', from: cleaned, to: fitted.value })
		setAt(block.props, slot.path, fitted.value)
	}

	deriveAfterWriting(next)
	return { blocks: next, problems, placeholders, adjustments }
}

// ---------------------------------------------------------------- props that follow the written copy

/** The `<h2>` texts of prose HTML, as a table of contents lists them. */
export function proseHeadings(html: unknown): string[] {
	if (typeof html !== 'string') return []
	return [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/gi)]
		.map((match) => decodeEntities(match[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim())
		.filter((label) => Boolean(anchorId(label)))
}

/**
 * Props computed from what was written: a carousel's accessible name is its title, and
 * a table of contents lists the `<h2>`s of the prose block after it, so its anchors
 * always match the ids the prose renders (navigation.tsx:258, rich-text.tsx:37-50).
 */
export function deriveAfterWriting(blocks: Block[]) {
	blocks.forEach((block, index) => {
		if (block.type === 'carousel' && block.props) {
			const title = typeof block.props.title === 'string' ? block.props.title.replace(/\[\[|\]\]/g, '').trim() : ''
			const eyebrow = typeof block.props.eyebrow === 'string' ? block.props.eyebrow.trim() : ''
			if (title || eyebrow) block.props.label = title || eyebrow
		}
		if (block.type === 'table-of-contents') {
			const prose = blocks.slice(index + 1).find((item) => item.type === 'prose-block')
			const headings = proseHeadings(prose?.props?.body)
			block.props = { ...(block.props ?? {}), items: headings.map((label) => ({ label })) }
		}
	})
	return blocks
}
