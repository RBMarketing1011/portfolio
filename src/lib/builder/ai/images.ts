/**
 * Photos for the planner and for the pages (section 6.9). `mediaDigest` describes the
 * build's photo pool to the planner in text, `visionBlocks` attaches the photos it may
 * look at, and `assignImages` places photos across the whole site at once: the home
 * opener first, every photo once where the pool allows, never twice on a page, and only
 * where its shape fits the slot.
 *
 * Pure: no network, no database. The pool itself comes from `pool.ts` (server).
 */
import type Anthropic from '@anthropic-ai/sdk'
import { imageSlotsFor } from '../catalog/compose'
import { SECTION_META } from '../catalog/meta'
import type { Aspect, ImageRole } from '../catalog/types'
import { OPENER_LAYOUTS } from '../design/vocab'
import { AI_LIMITS } from './contract'
import type { AssignedImage, ImagePlan, NormalizedPage, NormalizedSection, PhotoCandidate, PhotoNote } from './types'

/** Kinds a photo slot may use. A screenshot the owner picked may still fill a panel or a gallery. */
const PHOTO_KINDS = new Set<PhotoCandidate['kind']>(['photo', 'illustration', 'graphic', 'unknown'])
const SCREENSHOT_ROLES = new Set<ImageRole>(['panel', 'gallery'])

/** Hero and feature photos are shown large; smaller files look soft (section 7.7). */
const LARGE_MIN = 1200
const SIZE_BONUS_MIN = 1600

// ---------------------------------------------------------------- what the planner is shown

export type DigestEntry = {
	ref: string
	source: PhotoCandidate['source']
	kind: PhotoCandidate['kind']
	orientation: PhotoCandidate['orientation']
	size: string
	light: PhotoCandidate['light']
	caption: string
	tags: string[]
	colors: string[]
}

/** One line per photo in the pool, for the planner's brief (at most 60). */
export function mediaDigest(pool: PhotoCandidate[]): DigestEntry[] {
	return pool.slice(0, AI_LIMITS.digestMax).map((photo) => ({
		ref: photo.ref,
		source: photo.source,
		kind: photo.kind,
		orientation: photo.orientation,
		size: photo.width && photo.height ? `${photo.width}x${photo.height}` : 'unknown',
		light: photo.light,
		caption: String(photo.caption ?? '').slice(0, 120),
		tags: (photo.tags ?? []).slice(0, 8),
		colors: (photo.colors ?? []).slice(0, 3),
	}))
}

const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]*)$/

type ImageSource = Anthropic.Beta.BetaImageBlockParam['source']

function imageSource(url: string): ImageSource | null {
	if (url.startsWith('data:')) {
		const match = DATA_URL.exec(url)
		if (!match) return null
		return {
			type: 'base64',
			media_type: match[1] as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
			data: match[2].replace(/\s/g, ''),
		}
	}
	return /^https:\/\//i.test(url) ? { type: 'url', url } : null
}

/**
 * The photos the planner looks at: those the pool marked `vision` (picked for this build,
 * a type the API reads, within its size limits), at most 12, each after a text label
 * such as `img3:` so the planner can name it.
 */
export function visionBlocks(pool: PhotoCandidate[]): Anthropic.Beta.BetaContentBlockParam[] {
	const blocks: Anthropic.Beta.BetaContentBlockParam[] = []
	let count = 0
	for (const photo of pool) {
		if (!photo.vision || count >= AI_LIMITS.visionPhotosMax) continue
		const source = imageSource(photo.url)
		if (!source) continue
		blocks.push({ type: 'text', text: `${photo.ref}:` }, { type: 'image', source })
		count++
	}
	return blocks
}

// ---------------------------------------------------------------- slots

export type PlannedImageSlot = {
	pageKey: string
	sectionKey: string
	/** Where the image goes, as the composer writes it: 'mediaSrc', 'backdrop.2', 'rows.1.image', 'before.src', 'c0.src'. */
	path: string
	role: ImageRole
	aspect: Aspect
	required: boolean
	/** The planner's ref for this slot, if it named one. */
	pick: string | null
	/** Lower is placed first (section 6.9 step 1). */
	priority: number
	/** The section's job, the page's purpose and keyword: what the photo should be about. */
	context: string
}

const OPENERS = new Set<string>(OPENER_LAYOUTS)

function priorityOf(section: NormalizedSection, home: boolean): number {
	if (OPENERS.has(section.layout)) return home ? 0 : 1
	if (section.type === 'feature-rows') return 2
	if (section.type === 'tabs-showcase' || section.type === 'spotlight') return 3
	if (section.type === 'media-mosaic' || section.type === 'media-gallery' || section.type === 'masonry') return 4
	return 5
}

/**
 * Every image slot of one section, at the paths the composer writes, in the order the
 * planner's `images` refs fill them. The composer is the authority on the shape (five fan
 * tiles, only the wide bento tiles, one photo per card), so the slots come from it.
 */
export function sectionImageSlots(page: NormalizedPage, section: NormalizedSection, home: boolean): PlannedImageSlot[] {
	if (!Object.hasOwn(SECTION_META, section.type)) return []
	let slots: { path: string; role: ImageRole; aspect: Aspect; required: boolean }[] = []
	try {
		slots = imageSlotsFor({
			key: section.key,
			layout: section.layout,
			type: section.type,
			variant: section.variant,
			items: section.items,
			child: section.child,
			tweaks: section.tweaks,
		})
	} catch {
		slots = []
	}
	const context = [section.job, page.purpose, page.keyword, page.name].join(' ')
	const priority = priorityOf(section, home)
	return slots.map((slot, index) => ({
		pageKey: page.key,
		sectionKey: section.key,
		path: slot.path,
		role: slot.role,
		aspect: slot.aspect,
		required: slot.required,
		pick: section.images[index] ?? null,
		priority,
		context,
	}))
}

// ---------------------------------------------------------------- fit and score

type Shape = PhotoCandidate['orientation']

const ratioOf = (photo: PhotoCandidate) => (photo.width && photo.height ? photo.width / photo.height : null)

/** Orientation from the stored size, else the stored value, else what the planner saw. */
export function shapeOf(photo: PhotoCandidate, notes: Map<string, PhotoNote>): Shape {
	const ratio = ratioOf(photo)
	if (ratio !== null) return ratio >= 2 ? 'panorama' : ratio >= 1.2 ? 'landscape' : ratio <= 0.83 ? 'portrait' : 'square'
	if (photo.orientation !== 'unknown') return photo.orientation
	return notes.get(photo.ref)?.shape ?? 'unknown'
}

/** 1 for a fit, 0.5 when the shape is not known (the planner has seen it), 0 for a photo that must not go there. */
function fitOf(photo: PhotoCandidate, slot: Pick<PlannedImageSlot, 'role' | 'aspect'>, notes: Map<string, PhotoNote>): number {
	if (!PHOTO_KINDS.has(photo.kind) && !(photo.kind === 'screenshot' && SCREENSHOT_ROLES.has(slot.role))) return 0
	if ((slot.role === 'hero' || slot.role === 'feature') && photo.width && photo.height && Math.max(photo.width, photo.height) < LARGE_MIN)
		return 0
	if (slot.role === 'gallery' || slot.role === 'backdrop' || slot.role === 'pair') return 1
	const shape = shapeOf(photo, notes)
	if (shape === 'unknown') return 0.5
	if (slot.aspect === '21:9') {
		if (shape === 'panorama') return 1
		if (shape !== 'landscape') return 0
		const ratio = ratioOf(photo)
		return ratio === null ? 0.5 : ratio >= 1.6 ? 1 : 0
	}
	if (slot.role === 'panel') return shape === 'portrait' ? 0 : 1
	return shape === 'landscape' || shape === 'panorama' ? 1 : 0
}

const STOP = new Set([
	'the', 'and', 'for', 'with', 'our', 'your', 'you', 'this', 'that', 'from', 'are', 'its', 'their', 'what', 'who', 'how',
	'show', 'shows', 'page', 'section', 'one', 'each', 'into', 'about', 'over', 'more', 'all', 'any', 'can', 'will', 'has',
])
const words = (text: string) =>
	new Set(
		String(text ?? '')
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((word) => word.length >= 3 && !STOP.has(word))
			.map((word) => word.replace(/(ies|es|s)$/, '')),
	)

function relevance(photo: PhotoCandidate, note: PhotoNote | undefined, context: string): number {
	const about = words([photo.caption, ...(photo.tags ?? []), note?.description ?? '', note?.subject ?? ''].join(' '))
	let shared = 0
	for (const word of words(context)) if (about.has(word)) shared++
	return Math.min(3, shared)
}

const SOURCE_BONUS: Record<PhotoCandidate['source'], number> = { upload: 2, project: 1, library: 0 }

// ---------------------------------------------------------------- assignment

export type AssignResult = { images: ImagePlan; unsatisfied: { pageKey: string; sectionKey: string }[] }

const showsOf = (photo: PhotoCandidate, note: PhotoNote | undefined) => note?.description?.trim() || photo.caption?.trim() || ''

/**
 * Places photos on the given pages (section 6.9), replacing whatever they were given
 * before and keeping every other page's photos. Slots are filled in priority order across
 * all the pages: the planner's pick when it is free and fits, otherwise the best-scoring
 * photo (`3 × fit + 2 × relevance + source + size − 4 × uses`) with a positive score. A
 * required slot nothing fits marks its section unsatisfied, so it can fall back.
 */
export function assignImages(input: { pages: NormalizedPage[]; images: ImagePlan; homeKey?: string }): AssignResult {
	const pool = input.images.pool
	const notes = new Map(input.images.notes.map((note) => [note.ref, note]))
	const byRef = new Map(pool.map((photo) => [photo.ref, photo]))
	const keys = new Set(input.pages.map((page) => page.key))
	const homeKey = input.homeKey ?? input.pages.find((page) => page.slug === '/')?.key ?? null

	// Release what these pages held before, so a re-run can move photos.
	const uses: Record<string, number> = { ...input.images.uses }
	const byPage: ImagePlan['byPage'] = {}
	for (const [pageKey, sections] of Object.entries(input.images.byPage)) {
		if (!keys.has(pageKey)) {
			byPage[pageKey] = sections
			continue
		}
		for (const list of Object.values(sections))
			for (const image of list) uses[image.ref] = Math.max(0, (uses[image.ref] ?? 0) - 1)
	}

	const slots = input.pages
		.flatMap((page) => page.sections.map((section) => sectionImageSlots(page, section, page.key === homeKey)).flat())
		.map((slot, order) => ({ slot, order }))
		.sort((a, b) => a.slot.priority - b.slot.priority || a.order - b.order)
		.map(({ slot }) => slot)
	const required = slots.filter((slot) => slot.required).length
	const scarce = pool.length < required

	const onPage = new Map<string, Set<string>>()
	const placed = new Map<string, AssignedImage[]>()
	const unsatisfied = new Map<string, { pageKey: string; sectionKey: string }>()
	const take = (slot: PlannedImageSlot, photo: PhotoCandidate) => {
		uses[photo.ref] = (uses[photo.ref] ?? 0) + 1
		const seen = onPage.get(slot.pageKey) ?? new Set<string>()
		seen.add(photo.ref)
		onPage.set(slot.pageKey, seen)
		const id = `${slot.pageKey}/${slot.sectionKey}`
		const list = placed.get(id) ?? []
		list.push({ path: slot.path, ref: photo.ref, value: photo.value, shows: showsOf(photo, notes.get(photo.ref)) })
		placed.set(id, list)
	}
	const usedHere = (slot: PlannedImageSlot, ref: string) => onPage.get(slot.pageKey)?.has(ref) ?? false
	const miss = (slot: PlannedImageSlot) => {
		if (slot.required) unsatisfied.set(`${slot.pageKey}/${slot.sectionKey}`, { pageKey: slot.pageKey, sectionKey: slot.sectionKey })
	}

	/** The planner's pair when both halves are one free pair, else the least used free pair. */
	const choosePair = (slot: PlannedImageSlot, beforeRef: string | null, afterRef: string | null): [PhotoCandidate, PhotoCandidate] | null => {
		const halfOf = (ref: string | null, side: 'before' | 'after') => {
			const photo = ref ? byRef.get(ref) : undefined
			const note = ref ? notes.get(ref) : undefined
			return photo && note?.pair === side && note.pairKey ? { photo, key: note.pairKey } : null
		}
		const free = (photo: PhotoCandidate) => !usedHere(slot, photo.ref) && fitOf(photo, slot, notes) > 0
		const planned = [halfOf(beforeRef, 'before'), halfOf(afterRef, 'after')]
		if (planned[0] && planned[1] && planned[0].key === planned[1].key && free(planned[0].photo) && free(planned[1].photo))
			return [planned[0].photo, planned[1].photo]
		const groups = new Map<string, { before?: PhotoCandidate; after?: PhotoCandidate }>()
		for (const note of notes.values()) {
			const photo = byRef.get(note.ref)
			if (!photo || note.pair === 'none' || !note.pairKey || !free(photo)) continue
			const group = groups.get(note.pairKey) ?? {}
			group[note.pair] = group[note.pair] ?? photo
			groups.set(note.pairKey, group)
		}
		const complete = [...groups.values()]
			.filter((group): group is { before: PhotoCandidate; after: PhotoCandidate } => Boolean(group.before && group.after))
			.sort((a, b) => (uses[a.before.ref] ?? 0) + (uses[a.after.ref] ?? 0) - ((uses[b.before.ref] ?? 0) + (uses[b.after.ref] ?? 0)))
		return complete[0] ? [complete[0].before, complete[0].after] : null
	}

	// The two halves of a before/after pair go in together.
	const pairSections = new Set<string>()
	for (const slot of slots) {
		const id = `${slot.pageKey}/${slot.sectionKey}`
		if (slot.role !== 'pair' || pairSections.has(id)) continue
		pairSections.add(id)
		const halves = slots.filter((other) => other.role === 'pair' && `${other.pageKey}/${other.sectionKey}` === id)
		const before = halves.find((other) => other.path.startsWith('before')) ?? halves[0]
		const after = halves.find((other) => other !== before) ?? null
		const pair = choosePair(slot, before?.pick ?? null, after?.pick ?? null)
		if (!pair || !before || !after) {
			for (const half of halves) miss(half)
			continue
		}
		take(before, pair[0])
		take(after, pair[1])
	}

	for (const slot of slots) {
		if (slot.role === 'pair') continue
		const picked = slot.pick ? byRef.get(slot.pick) : undefined
		if (
			picked &&
			!usedHere(slot, picked.ref) &&
			((uses[picked.ref] ?? 0) === 0 || scarce) &&
			fitOf(picked, slot, notes) > 0
		) {
			take(slot, picked)
			continue
		}
		let best: { photo: PhotoCandidate; score: number } | null = null
		for (const photo of pool) {
			if (usedHere(slot, photo.ref)) continue
			const fit = fitOf(photo, slot, notes)
			if (fit <= 0) continue
			const score =
				3 * fit +
				2 * relevance(photo, notes.get(photo.ref), slot.context) +
				SOURCE_BONUS[photo.source] +
				((photo.width ?? 0) >= SIZE_BONUS_MIN ? 1 : 0) -
				4 * (uses[photo.ref] ?? 0)
			if (score > 0 && (!best || score > best.score)) best = { photo, score }
		}
		if (best) take(slot, best.photo)
		else miss(slot)
	}

	for (const page of input.pages) {
		const sections: Record<string, AssignedImage[]> = {}
		for (const section of page.sections) {
			const list = placed.get(`${page.key}/${section.key}`)
			if (list?.length && !unsatisfied.has(`${page.key}/${section.key}`)) sections[section.key] = list
		}
		byPage[page.key] = sections
	}
	// Images placed in a section that is going to fall back are given back to the pool.
	for (const id of unsatisfied.keys())
		for (const image of placed.get(id) ?? []) uses[image.ref] = Math.max(0, (uses[image.ref] ?? 0) - 1)

	return {
		images: { pool, notes: input.images.notes, uses, byPage },
		unsatisfied: [...unsatisfied.values()],
	}
}

/**
 * The promo card's photo for a mega panel (section 9.3): a landscape photo nobody uses,
 * else one that is not a page opener, else none. Each call takes the next one.
 */
export function promoImagePicker(images: ImagePlan, pages: NormalizedPage[]): () => string | null {
	const notes = new Map(images.notes.map((note) => [note.ref, note]))
	const openerRefs = new Set<string>()
	for (const page of pages) {
		const opener = page.sections.find((section) => OPENERS.has(section.layout))
		for (const image of (opener && images.byPage[page.key]?.[opener.key]) || []) openerRefs.add(image.ref)
	}
	const wide = images.pool.filter((photo) => {
		const shape = shapeOf(photo, notes)
		return PHOTO_KINDS.has(photo.kind) && (shape === 'landscape' || shape === 'panorama')
	})
	const order = [
		...wide.filter((photo) => !images.uses[photo.ref]),
		...wide.filter((photo) => images.uses[photo.ref] && !openerRefs.has(photo.ref)),
	]
	let next = 0
	return () => order[next++]?.value ?? null
}
