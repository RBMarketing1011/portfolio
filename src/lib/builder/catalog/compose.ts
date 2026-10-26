/**
 * Composing a section (section 6.11): a planned layout becomes a real block with every
 * structural prop, list row, child card, image, href and owner fact set by code, plus
 * the slot list the writer fills. Nothing is left for a component default to fill in.
 *
 * Pure: the page route composes before it calls the writer, and the marker proof
 * composes every layout offline. The block helpers in `block-ops.ts` are client-only,
 * so the little this needs is here.
 */
import type { AssignedImage, NormalizedPage } from '../ai/types'
import { getSchema } from '../schema'
import type { Block } from '../types'
import { CHILD_META } from './children'
import { archetypeOf, clampCount, countFor, SECTION_META } from './meta'
import { expandPath, getAt, isScalarList, resolvePath, setAt, slotPath, slotsFor } from './slots'
import type { ComposeCtx, ComposedSection, ComposeSpec, ImageSlot, Layout, SectionMeta, Tweak } from './types'

export type { ComposeCtx, ComposedSection, ComposeSpec, ImageSlot }

/** 'blk_' + 10 hex, which `BLOCK_KEY` accepts, so per-block surfaces can key on it. */
export function newBlockId(): string {
	return `blk_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
}

const range = (length: number) => Array.from({ length: Math.max(0, length) }, (_, index) => index)

/** The planned variant when the type offers it to the AI, else its first usable one (null for media-mosaic). */
function usableVariant(meta: SectionMeta, wanted: string | null): string | null {
	const usable = meta.variants.filter((item) => !item.excluded)
	if (usable.length === 1 && usable[0].id === 'default') return null
	return usable.find((item) => item.id === wanted)?.id ?? usable[0]?.id ?? null
}

/** The images a composed block holds, at concrete paths, in the order they are assigned. */
function imageSlotsOf(block: Block, tweaks: Tweak[]): ImageSlot[] {
	const meta = SECTION_META[block.type]
	const schema = getSchema(block.type)
	if (!meta || !schema) return []
	const variant = block.variant ?? 'default'
	const slots: ImageSlot[] = []
	for (const need of meta.images ?? []) {
		if (need.variants && !need.variants.includes(variant)) continue
		if (need.tweak && !tweaks.includes(need.tweak)) continue
		const resolved = resolvePath(schema.fields, need.path)
		if (!resolved) continue
		const list = schema.fields.find((field) => field.key === resolved.segments[0].key)
		// A fixed scalar list (the split hero's five fan tiles) is written whole.
		let paths = resolved.scalar && list?.fixed
			? range(list.fixed).map((index) => [resolved.segments[0].key, index])
			: expandPath(block.props ?? {}, resolved)
		// Bento photos sit on the wide tiles only, where the tile splits into copy and photo.
		if (block.type === 'bento-grid') paths = paths.filter((path) => String(getAt(block.props, [path[0], path[1], 'span'])) === '2')
		for (const path of paths) slots.push({ path: path.join('.'), role: need.role, aspect: need.aspect, required: need.required })
	}
	block.children?.forEach((child, index) => {
		if (CHILD_META[child.type]?.data !== 'photo') return
		// Masonry keeps each photo's own shape; grids and carousels crop to 16:9.
		const natural = block.type === 'masonry'
		slots.push({ path: `c${index}.src`, role: natural ? 'gallery' : 'panel', aspect: natural ? 'any' : '16:9', required: true })
	})
	return slots
}

function writeImage(block: Block, path: string, value: string) {
	const child = path.match(/^c(\d+)\.(.+)$/)
	if (child) {
		const target = block.children?.[Number(child[1])]
		if (target) setAt((target.props ??= {}), slotPath(`x.${child[2]}`), value)
		return
	}
	setAt((block.props ??= {}), slotPath(`x.${path}`), value)
}

/** Writes the assigned images: by matching path first, then in slot order. */
function placeImages(block: Block, spec: ComposeSpec): AssignedImage[] {
	const slots = imageSlotsOf(block, spec.tweaks)
	const named = new Set(slots.map((slot) => slot.path))
	const used = new Set<number>()
	const placed: AssignedImage[] = []
	for (const slot of slots) {
		let at = spec.images.findIndex((image, index) => !used.has(index) && image.path === slot.path)
		if (at === -1) at = spec.images.findIndex((image, index) => !used.has(index) && !named.has(image.path))
		if (at === -1 || !spec.images[at].value) continue
		used.add(at)
		writeImage(block, slot.path, spec.images[at].value)
		placed.push({ ...spec.images[at], path: slot.path })
	}

	if (block.type === 'split-hero') {
		// The fan is all five photos or none: an explicit empty list draws no tiles.
		const backdrop = Array.isArray(block.props?.backdrop) ? (block.props.backdrop as unknown[]) : []
		if (backdrop.length !== 5 || backdrop.some((value) => !value)) {
			block.props = { ...block.props, backdrop: [] }
			return placed.filter((image) => !image.path.startsWith('backdrop.'))
		}
	}
	if (block.type === 'bento-grid' && Array.isArray(block.props?.tiles)) {
		// Photo tiles alternate sides; the text panel (`html`) is never used.
		let side = 0
		for (const tile of block.props.tiles as Record<string, unknown>[]) {
			if (tile.image) tile.mediaSide = side++ % 2 === 0 ? 'right' : 'left'
		}
	}
	return placed
}

/** A stand-in context for working out a section's shape before anything is assigned. */
const SHAPE_CTX: ComposeCtx = {
	personality: 'friendly', polarity: 'light',
	primary: { label: '', href: '/' }, secondaryFor: () => null,
	phone: null, email: null, pages: [], facts: [], contactFacts: [], ticker: [], announcement: null,
	images: () => [], reviews: () => [],
}

function build(spec: ComposeSpec, ctx: ComposeCtx) {
	const meta = SECTION_META[spec.type]
	const schema = getSchema(spec.type)
	if (!meta || meta.ai === 'never' || !schema) throw new Error(`compose: "${spec.type}" is not a section the AI composes`)

	const variant = usableVariant(meta, spec.variant)
	const working: ComposeSpec = { ...spec, variant, tweaks: spec.tweaks.filter((tweak) => meta.tweaks.includes(tweak)) }
	const out = meta.design(working, ctx)

	const props: Record<string, unknown> = { ...out.props, ...(out.rows ?? {}) }
	// A main list the design left to the composer is sized to the planned count.
	if (meta.items && meta.items.list !== 'children' && !(meta.items.list in props)) {
		const field = schema.fields.find((item) => item.key === meta.items!.list)
		const count = clampCount(countFor(meta.items, variant)!, working.items)
		props[meta.items.list] = range(count).map(() => (field && isScalarList(field) ? '' : {}))
	}

	const block: Block = { id: newBlockId(), type: spec.type, ...(variant ? { variant } : {}), props }
	if (schema.container) {
		const children = out.children ?? []
		block.children = children.map((child, index) => {
			const [type, childVariant] = child.kind.split(':')
			const defaults = CHILD_META[type]?.design(index, children.length, ctx) ?? {}
			return { id: newBlockId(), type, ...(childVariant ? { variant: childVariant } : {}), props: { ...defaults, ...child.props } }
		})
	}
	return { block, working, out }
}

/** One planned section as a block, its slots, its button targets and its placed images. */
export function composeSection(spec: ComposeSpec, ctx: ComposeCtx): ComposedSection {
	const { block, working, out } = build(spec, ctx)
	const images = placeImages(block, working)
	return {
		key: spec.key,
		block,
		slots: slotsFor(spec.key, block, { archetype: archetypeOf(ctx) }),
		links: out.links.map((link) => ({ ...link, slot: `${spec.key}.${link.slot}` })),
		images,
	}
}

/**
 * The image slots a planned section will have, at the concrete paths `composeSection`
 * writes ('mediaSrc', 'backdrop.0'…'backdrop.4', 'rows.1.image', 'c2.src'), in priority
 * order. Image assignment fills `AssignedImage.path` from these.
 */
export function imageSlotsFor(
	section: Pick<ComposeSpec, 'type' | 'variant' | 'items' | 'child' | 'tweaks'> & Partial<Pick<ComposeSpec, 'layout' | 'key'>>,
	ctx: ComposeCtx = SHAPE_CTX,
): ImageSlot[] {
	const meta = SECTION_META[section.type]
	if (!meta || meta.ai === 'never') return []
	const spec: ComposeSpec = {
		key: section.key ?? 's0',
		layout: section.layout ?? (`${section.type}:${section.variant ?? 'default'}` as Layout),
		type: section.type,
		variant: section.variant,
		items: section.items,
		child: section.child,
		surface: 'plain',
		tweaks: section.tweaks,
		job: '',
		images: [],
		reviews: [],
	}
	const { block, working } = build(spec, ctx)
	return imageSlotsOf(block, working.tweaks)
}

/**
 * The photo each alt-text or caption slot describes, for the writer's manifest
 * (`images: { slot, shows }`): a slot and an image pair up when they sit in the same row
 * or card ('s5.items.2.caption' ↔ 'items.2.src', 's4.c1.alt' ↔ 'c1.src',
 * 's3.before.alt' ↔ 'before.src'); a top-level one describes the section's main photo.
 */
export function slotImages(section: ComposedSection): { slot: string; shows: string }[] {
	const out: { slot: string; shows: string }[] = []
	for (const slot of section.slots) {
		if (slot.kind !== 'alt' && slot.kind !== 'caption') continue
		const relative = slot.id.slice(section.key.length + 1)
		const cut = relative.lastIndexOf('.')
		// 'before.alt' is one flat key, and its photo is 'before.src'.
		const prefix = slot.path.length === 1 && String(slot.path[0]).includes('.') ? `${String(slot.path[0]).split('.')[0]}.` : cut === -1 ? '' : relative.slice(0, cut + 1)
		const image = section.images.find((item) =>
			prefix ? item.path.startsWith(prefix) && !item.path.slice(prefix.length).includes('.') : !item.path.includes('.'),
		)
		if (image?.shows) out.push({ slot: slot.id, shows: image.shows })
	}
	return out
}

// Sections whose heading or content is centred; a chips strip under one centres too.
const CENTRED: string[] = [
	'page-hero:centered', 'stat-hero:centered', 'cta-band:centered', 'faq-accordion:stacked', 'faq-accordion:boxed',
	'grid:centered', 'masonry:centered', 'marquee:centered', 'spotlight:stacked', 'stat-band:divided', 'announcement-bar:strip',
]

/** A planned page as blocks, with each section's slots (the writer's manifest is built from them). */
export function composePage(page: NormalizedPage, ctx: ComposeCtx): { blocks: Block[]; sections: ComposedSection[] } {
	const pageCtx: ComposeCtx = { ...ctx, page: { key: page.key, path: page.path, archetype: page.archetype } }
	const sections = page.sections.map((section) =>
		composeSection(
			{
				key: section.key,
				layout: section.layout,
				type: section.type,
				variant: section.variant,
				items: section.items,
				child: section.child,
				surface: section.surface,
				tweaks: section.tweaks,
				job: section.job,
				images: ctx.images(section.key),
				reviews: ctx.reviews(section.key),
			},
			pageCtx,
		),
	)
	sections.forEach((section, index) => {
		const above = sections[index - 1]?.block
		if (section.block.type === 'chips' && above && CENTRED.includes(`${above.type}:${above.variant ?? 'default'}`))
			section.block.props = { ...section.block.props, align: 'center' }
	})
	return { blocks: sections.map((section) => section.block), sections }
}
