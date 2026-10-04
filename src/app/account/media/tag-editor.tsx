'use client'

/**
 * The tag editor, and the pieces the other detail components share with it.
 *
 * Everything that decides something is a plain function or reducer exported next to
 * the component, so the proof can drive it without a DOM:
 *  - `parseTagInput`: what a typed or pasted string means (comma lists, duplicates,
 *    the 40 character limit, the 20 per call cap, the per image room).
 *  - `rankTagSuggestions`: the autocomplete order, including the stem-aware
 *    'Use "Kitchen" (214)' row that stops "Kitchens" from forking "Kitchen".
 *  - `decideTagKey`: what each key does in the box.
 *  - `tagOpsReducer` / `projectTags` / `createSerialQueue`: optimistic adds, removes
 *    and keeps, rolled back with an inline error, one call in flight at a time.
 *  - `createTagSuggestionController`: debounced, and unable to show an answer to an
 *    old question.
 */
import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	type ChangeEvent,
	type ClipboardEvent,
	type CompositionEvent,
	type KeyboardEvent,
	type Ref,
} from 'react'
import { Check, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { clampText, slugify, stem } from '@/lib/media/text'
import {
	MEDIA_LIMITS,
	type MediaTag,
	type MediaTagStat,
} from '@/lib/media/types'
import type { TagEditorProps } from './contracts'
import { formatCount } from './format'

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Beyond this many chips the rest hide behind "Show all N". */
export const TAG_COLLAPSE_AT = 12
/** Trailing-edge debounce: long enough to skip a burst of keystrokes, short enough to feel live. */
export const TAG_SUGGEST_DELAY_MS = 120
/** `assetPatchSchema.addTags` and the bulk `tags` list both stop at 20. */
export const TAG_LABELS_PER_CALL = 20
/** Suggestions never show more rows than this, whatever the server sends. */
export const TAG_OPTIONS_MAX = 8
/** A pasted wall of text is not a tag list. Past these it is cut, and the person is told. */
export const TAG_INPUT_CHARS_MAX = 10_000
export const TAG_SEGMENTS_MAX = 200

/* -------------------------------------------------------------------------- */
/* Small shared helpers (the other detail components import these)            */
/* -------------------------------------------------------------------------- */

/** What to show for a rejected promise. Callbacks reject with a sentence fit for a person. */
export function messageOf(
	error: unknown,
	fallback = 'Something went wrong. Try again.',
): string {
	let text = ''
	if (typeof error === 'string') text = error
	else if (
		error &&
		typeof error === 'object' &&
		typeof (error as { message?: unknown }).message === 'string'
	)
		text = (error as { message: string }).message
	text = text.trim()
	return text ? text.slice(0, 300) : fallback
}

const TYPING_ROLES = new Set([
	'combobox',
	'textbox',
	'searchbox',
	'listbox',
	'option',
	'spinbutton',
	'slider',
])
const EDITABLE_SELECTOR =
	'[contenteditable=""],[contenteditable="true"],[role="combobox"],[role="textbox"],[role="searchbox"],[role="listbox"]'

type ElementLike = {
	tagName?: unknown
	isContentEditable?: unknown
	getAttribute?: (name: string) => string | null
	closest?: (selector: string) => unknown
}

/**
 * Keys that mean something to the page (arrows between images, Esc) must leave a
 * person who is typing alone. Duck typed so the proof can pass plain objects.
 */
export function isTypingTarget(target: unknown): boolean {
	if (!target || typeof target !== 'object') return false
	const el = target as ElementLike
	const tag = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : ''
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
	if (el.isContentEditable === true) return true
	const role =
		typeof el.getAttribute === 'function' ? el.getAttribute('role') : null
	if (role && TYPING_ROLES.has(role.trim().split(/\s+/)[0]?.toLowerCase() ?? ''))
		return true
	if (typeof el.closest === 'function') {
		try {
			return Boolean(el.closest(EDITABLE_SELECTOR))
		} catch {
			return false
		}
	}
	return false
}

const useIsoLayoutEffect =
	typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Radix only returns focus to a Trigger, and these dialogs and the sheet have none
 * (the page opens them). Layout effects run before Radix moves focus inside, so this
 * still sees the element the person came from. Pass the result to `onCloseAutoFocus`.
 */
export function useReturnFocus(open: boolean) {
	const opener = useRef<HTMLElement | null>(null)
	useIsoLayoutEffect(() => {
		if (!open) return
		const active = document.activeElement
		opener.current =
			active instanceof HTMLElement && active !== document.body ? active : null
	}, [open])
	return useCallback((event: Event) => {
		const target = opener.current
		if (target?.isConnected) {
			event.preventDefault()
			target.focus()
		}
	}, [])
}

const codePoints = (text: string) => Array.from(text).length

const clip = (text: string, max = 40) => {
	const chars = Array.from(text)
	return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

/* -------------------------------------------------------------------------- */
/* Parsing what was typed                                                     */
/* -------------------------------------------------------------------------- */

/** Commas (ASCII, fullwidth, ideographic), tabs and line breaks all end a tag. */
const SEPARATOR = /[,，、\t\r\n]/
const SEPARATOR_EACH = /[,，、\t\r\n]/g

export const hasTagSeparator = (text: string) => SEPARATOR.test(text)

/** The raw pieces of a typed list, empty ones included (the caller decides what is blank). */
export const splitTagList = (text: string) => text.split(SEPARATOR_EACH)

/**
 * Esc closes an open suggestion list before it closes the sheet or dialog around it. The
 * layer listens on the document, before the input's own handler runs, so it asks the DOM:
 * a combobox that is expanded owns the key.
 */
export function escapeBelongsToList(target: unknown): boolean {
	const el = target as { getAttribute?: (name: string) => string | null } | null
	return (
		typeof el?.getAttribute === 'function' &&
		el.getAttribute('role') === 'combobox' &&
		el.getAttribute('aria-expanded') === 'true'
	)
}

/** The label as it will be stored: whitespace collapsed, control and bidi characters gone. Not yet cut to length. */
export const cleanTagLabel = (raw: string) =>
	clampText(typeof raw === 'string' ? raw : '', TAG_INPUT_CHARS_MAX)

/** Slug -> where the tag already is. A manual tag is a duplicate; an automatic one is promoted by adding it. */
export type ExistingTags = ReadonlyMap<string, 'manual' | 'auto'>

export type ParseTagOptions = {
	existing?: ExistingTags
	/** At most this many labels in one call; never above the schema's 20. */
	perCall?: number
	/** How many NEW tags may still be added (an image holds 40). Promoting an automatic tag adds none. */
	room?: number
}

export type ParsedTagInput = {
	/** Labels to send, in the order typed. */
	labels: string[]
	/** Entries dropped because that tag is already there. */
	duplicates: string[]
	/** Entries that cannot be a tag. They stay in the box so they can be fixed. */
	rejected: { text: string; reason: 'too-long' | 'no-letters' }[]
	/** Valid entries that did not fit this time. They stay in the box for the next Enter. */
	deferred: { text: string; reason: 'per-call' | 'room' }[]
	/** `rejected` and `deferred` texts, in the order typed: what the box keeps. */
	leftover: string[]
	/** The input was longer than anything sensible and was cut. */
	truncated: boolean
}

const NO_TAGS: ExistingTags = new Map()

export function parseTagInput(
	text: string,
	options: ParseTagOptions = {},
): ParsedTagInput {
	const existing = options.existing ?? NO_TAGS
	const rawCap = Number(options.perCall ?? TAG_LABELS_PER_CALL)
	const perCall = Math.min(
		TAG_LABELS_PER_CALL,
		Math.max(1, Number.isFinite(rawCap) ? Math.floor(rawCap) : TAG_LABELS_PER_CALL),
	)
	const rawRoom = Number(options.room ?? Infinity)
	let room = Number.isNaN(rawRoom) ? 0 : Math.max(0, rawRoom)

	const source = typeof text === 'string' ? text : ''
	let truncated = source.length > TAG_INPUT_CHARS_MAX
	const segments = splitTagList(truncated ? source.slice(0, TAG_INPUT_CHARS_MAX) : source)

	const out: ParsedTagInput = {
		labels: [],
		duplicates: [],
		rejected: [],
		deferred: [],
		leftover: [],
		truncated: false,
	}
	const seen = new Set<string>()
	let read = 0
	for (const raw of segments) {
		const label = cleanTagLabel(raw)
		if (!label) continue
		if (read >= TAG_SEGMENTS_MAX) {
			truncated = true
			break
		}
		read++
		const slug = slugify(label)
		if (!slug) {
			out.rejected.push({ text: label, reason: 'no-letters' })
			out.leftover.push(label)
			continue
		}
		if (codePoints(label) > MEDIA_LIMITS.tagLabelMax) {
			out.rejected.push({ text: label, reason: 'too-long' })
			out.leftover.push(label)
			continue
		}
		// The same tag typed twice in one go is noise, not worth a message.
		if (seen.has(slug)) continue
		seen.add(slug)
		const current = existing.get(slug)
		if (current === 'manual') {
			out.duplicates.push(label)
			continue
		}
		const isNew = current === undefined
		if (out.labels.length >= perCall) {
			out.deferred.push({ text: label, reason: 'per-call' })
			out.leftover.push(label)
			continue
		}
		if (isNew && room < 1) {
			out.deferred.push({ text: label, reason: 'room' })
			out.leftover.push(label)
			continue
		}
		out.labels.push(label)
		if (isNew) room--
	}
	out.truncated = truncated
	return out
}

export type TagNotice = { tone: 'info' | 'error'; text: string }

/** Why nothing (or not everything) happened, in a sentence. Null when all went through. */
export function describeParse(
	parsed: ParsedTagInput,
	kind: 'asset' | 'batch' = 'asset',
): TagNotice | null {
	const max = MEDIA_LIMITS.tagLabelMax
	const problems: string[] = []
	const tooLong = parsed.rejected.filter((r) => r.reason === 'too-long')
	const noLetters = parsed.rejected.filter((r) => r.reason === 'no-letters')
	if (tooLong.length === 1)
		problems.push(
			`"${clip(tooLong[0].text)}" is longer than ${max} characters. Shorten it to add it.`,
		)
	else if (tooLong.length > 1)
		problems.push(
			`${tooLong.length} tags are longer than ${max} characters. Shorten them to add them.`,
		)
	if (noLetters.length === 1)
		problems.push(
			`"${clip(noLetters[0].text)}" needs at least one letter or number.`,
		)
	else if (noLetters.length > 1)
		problems.push(`${noLetters.length} entries need at least one letter or number.`)

	const perCall = parsed.deferred.filter((d) => d.reason === 'per-call').length
	const room = parsed.deferred.filter((d) => d.reason === 'room').length
	if (perCall > 0)
		problems.push(
			`You can add up to ${TAG_LABELS_PER_CALL} tags at a time. ${
				perCall === 1 ? 'One is' : `${perCall} are`
			} still in the box.`,
		)
	if (room > 0)
		problems.push(
			kind === 'asset'
				? `An image holds up to ${MEDIA_LIMITS.maxTagsPerAsset} tags. ${
						room === 1 ? 'One is' : `${room} are`
					} still in the box.`
				: `You can add up to ${TAG_LABELS_PER_CALL} tags at a time. ${
						room === 1 ? 'One is' : `${room} are`
					} still in the box.`,
		)
	if (parsed.truncated)
		problems.push(`Only the first ${TAG_SEGMENTS_MAX} entries were read.`)
	if (problems.length > 0) return { tone: 'error', text: problems.join(' ') }

	const where = kind === 'asset' ? 'on this image' : 'in the list'
	if (parsed.duplicates.length === 1)
		return {
			tone: 'info',
			text: `"${clip(parsed.duplicates[0])}" is already ${where}.`,
		}
	if (parsed.duplicates.length > 1)
		return {
			tone: 'info',
			text: `${parsed.duplicates.length} of those are already ${where}.`,
		}
	return null
}

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The key two spellings of one idea share: every hyphen-separated word stemmed
 * (`kitchens` and `kitchen` both read `kitchen`). The same rule the server applies
 * when it folds an automatic tag onto an existing one.
 */
export const stemKey = (slug: string) =>
	slug
		.split('-')
		.map((word) => stem(word))
		.join('-')

const STATS_MAX = 50

/**
 * A reply from the network is data, not a promise of good shape: keep rows that can
 * be shown and applied, drop repeats, bound the length (a suggestion list is short; the
 * tag manager passes its own, larger bound).
 */
export function sanitizeTagStats(raw: unknown, max = STATS_MAX): MediaTagStat[] {
	if (!Array.isArray(raw)) return []
	const seen = new Set<string>()
	const out: MediaTagStat[] = []
	const num = (value: unknown) =>
		typeof value === 'number' && Number.isFinite(value) && value >= 0
			? Math.floor(value)
			: 0
	for (const item of raw) {
		if (out.length >= max) break
		if (!item || typeof item !== 'object') continue
		const row = item as Record<string, unknown>
		const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
		if (!slug || seen.has(slug)) continue
		seen.add(slug)
		const label =
			typeof row.label === 'string' && row.label.trim() ? row.label.trim() : slug
		out.push({
			slug,
			label,
			count: num(row.count),
			manual: num(row.manual),
			auto: num(row.auto),
		})
	}
	return out
}

/**
 * While the answer to the latest text is on its way, the answer to the one before it
 * is still mostly right (typing "kitche" after "kitch"): keep what the new text could
 * still match so the list does not collapse and refill on every keystroke.
 */
export function filterStaleStats(
	stats: readonly MediaTagStat[],
	typed: string,
): MediaTagStat[] {
	const slug = slugify(cleanTagLabel(typed))
	if (!slug) return []
	const key = stemKey(slug)
	return stats.filter((s) => s.slug.includes(slug) || stemKey(s.slug) === key)
}

export type TagOption =
	| {
			key: string
			kind: 'use' | 'tag'
			slug: string
			label: string
			count: number
			/** Already on the image (or being added): choosing it adds nothing. */
			present: boolean
	  }
	| { key: string; kind: 'create'; label: string }

export type RankedTagOptions = {
	options: TagOption[]
	/** Highlighted before the person touches the arrow keys; -1 for none. */
	defaultIndex: number
}

/**
 * The autocomplete list, in order.
 *
 *  - The tag whose slug is exactly what was typed comes first, under its own
 *    spelling (so typing `KITCHEN` adds `Kitchen`, not a third label for it).
 *  - Otherwise, when ONE existing tag has the same stem but a different slug
 *    (`Kitchens` against `Kitchen`), that tag comes first as `Use "Kitchen" (214)`
 *    and is highlighted by default; `Create "Kitchens"` is the next option so the
 *    person can keep the new spelling. This is what stops the library fragmenting.
 *  - When SEVERAL different tags share that stem, none is guessed: nothing is
 *    highlighted and each is offered as an ordinary match.
 *  - `Create "..."` follows, unless an exact tag already exists, then the other matches
 *    in the order the server ranked them.
 */
export function rankTagSuggestions(
	typed: string,
	stats: readonly MediaTagStat[],
	existing: ExistingTags = NO_TAGS,
): RankedTagOptions {
	const none: RankedTagOptions = { options: [], defaultIndex: -1 }
	const label = cleanTagLabel(typed)
	if (!label || codePoints(label) > MEDIA_LIMITS.tagLabelMax) return none
	const slug = slugify(label)
	if (!slug) return none

	const list = sanitizeTagStats(stats)
	const key = stemKey(slug)
	const exact = list.find((s) => s.slug === slug)
	const stemmed = exact
		? []
		: list.filter((s) => s.slug !== slug && stemKey(s.slug) === key)
	const use = stemmed.length === 1 ? stemmed[0] : null

	const present = (s: MediaTagStat) => existing.get(s.slug) === 'manual'
	const row = (s: MediaTagStat, kind: 'use' | 'tag'): TagOption => ({
		key: `${kind}:${s.slug}`,
		kind,
		slug: s.slug,
		label: s.label,
		count: s.count,
		present: present(s),
	})

	const options: TagOption[] = []
	if (exact) options.push(row(exact, 'tag'))
	else if (use) options.push(row(use, 'use'))
	if (!exact) options.push({ key: 'create', kind: 'create', label })
	for (const s of list) {
		if (s === exact || s === use) continue
		options.push(row(s, 'tag'))
	}
	return {
		options: options.slice(0, TAG_OPTIONS_MAX),
		defaultIndex: exact || use ? 0 : -1,
	}
}

export type TagTimers = {
	set(callback: () => void, ms: number): unknown
	clear(handle: unknown): void
}

const realTimers: TagTimers = {
	set: (callback, ms) => setTimeout(callback, ms),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export type TagSuggestionResult = { query: string; stats: MediaTagStat[] }

/**
 * Every `request` supersedes the one before: its timer is cleared and its fetch
 * aborted at once, and a reply is delivered only if it still belongs to the latest
 * request, so a slow answer to "kit" can never overwrite the answer to "kitch", with
 * or without the fetch honouring its signal. A blank query is answered with [] and no
 * fetch. A failing fetch is an empty list, never an unhandled rejection: suggestions
 * are a convenience, adding a tag does not depend on them.
 */
export function createTagSuggestionController(options: {
	fetch(query: string, signal: AbortSignal): Promise<MediaTagStat[]>
	onResult(result: TagSuggestionResult): void
	onPending?(pending: boolean): void
	delay?: number
	timers?: TagTimers
}) {
	const delay = options.delay ?? TAG_SUGGEST_DELAY_MS
	const timers = options.timers ?? realTimers
	let generation = 0
	let timer: unknown = null
	let inflight: AbortController | null = null
	let pending = false

	const setPending = (next: boolean) => {
		if (pending === next) return
		pending = next
		options.onPending?.(next)
	}

	const supersede = () => {
		generation++
		if (timer !== null) {
			timers.clear(timer)
			timer = null
		}
		if (inflight) {
			inflight.abort()
			inflight = null
		}
	}

	return {
		request(query: string) {
			supersede()
			if (query.trim() === '') {
				setPending(false)
				options.onResult({ query, stats: [] })
				return
			}
			const mine = generation
			setPending(true)
			timer = timers.set(() => {
				timer = null
				if (mine !== generation) return
				const controller = new AbortController()
				inflight = controller
				const settle = (raw: unknown) => {
					if (mine !== generation || controller.signal.aborted) return
					inflight = null
					setPending(false)
					options.onResult({ query, stats: sanitizeTagStats(raw) })
				}
				try {
					Promise.resolve(options.fetch(query, controller.signal)).then(
						settle,
						() => settle([]),
					)
				} catch {
					settle([])
				}
			}, delay)
		},
		/** Leave the box or unmount: nothing in flight may touch state afterwards. */
		cancel() {
			supersede()
			setPending(false)
		},
	}
}

/* -------------------------------------------------------------------------- */
/* Keys                                                                       */
/* -------------------------------------------------------------------------- */

export type TagKeyInput = {
	key: string
	shiftKey?: boolean
	ctrlKey?: boolean
	altKey?: boolean
	metaKey?: boolean
	/** An input method (Japanese, Chinese, ...) is mid-composition: its keys are not ours. */
	isComposing?: boolean
}

export type TagKeyContext = {
	/** The box holds something other than blank space. */
	typed: boolean
	/** The box holds nothing at all. */
	empty: boolean
	/** The suggestion list is showing. */
	open: boolean
	count: number
	/** The highlighted row, or -1. */
	active: number
	/** The person moved the highlight with the arrow keys (the default highlight is only a nudge). */
	explicit: boolean
	/** There is a chip to move to. */
	hasChips: boolean
}

export type TagKeyDecision =
	| { type: 'none' }
	| { type: 'open' }
	| { type: 'move'; active: number }
	| { type: 'accept'; index: number }
	/** Add the text as typed, ignoring any highlight. */
	| { type: 'commit' }
	/** Enter with nothing typed: do nothing, and keep a surrounding form from submitting. */
	| { type: 'swallow' }
	| { type: 'close' }
	/** Backspace in an empty box: move to the last chip. */
	| { type: 'chips' }

/**
 * Up and Down walk the rows with one extra stop, "nothing highlighted", so the person
 * can always get back to a state where Enter adds what they typed.
 */
export function nextTagActive(
	current: number,
	direction: 1 | -1,
	count: number,
): number {
	if (count <= 0) return -1
	const at = current >= 0 && current < count ? current : -1
	if (direction === 1) return at === count - 1 ? -1 : at + 1
	return at === -1 ? count - 1 : at === 0 ? -1 : at - 1
}

/**
 * Enter adds the highlighted row, or the typed text when nothing is highlighted. With
 * nothing typed it is swallowed: a second Enter (a double tap, a held key) must not
 * submit the bulk dialog that happens to surround the box. Tab adds the typed text,
 * but only while something is typed (an empty box lets focus move on) and only takes
 * a row the person actually walked to with the arrows. A comma is not decided here:
 * it is just a character, and the change handler splits on it.
 */
export function decideTagKey(key: TagKeyInput, ctx: TagKeyContext): TagKeyDecision {
	if (key.isComposing || key.key === 'Process') return { type: 'none' }
	const chord = Boolean(key.ctrlKey || key.altKey || key.metaKey)
	switch (key.key) {
		case 'ArrowDown':
		case 'ArrowUp':
			if (chord || key.shiftKey || !ctx.typed) return { type: 'none' }
			if (!ctx.open) return { type: 'open' }
			if (ctx.count === 0) return { type: 'none' }
			return {
				type: 'move',
				active: nextTagActive(ctx.active, key.key === 'ArrowDown' ? 1 : -1, ctx.count),
			}
		case 'Enter':
			if (chord) return { type: 'none' }
			if (!ctx.typed) return { type: 'swallow' }
			if (ctx.open && ctx.active >= 0 && ctx.active < ctx.count)
				return { type: 'accept', index: ctx.active }
			return { type: 'commit' }
		case 'Tab':
			if (chord || key.shiftKey || !ctx.typed) return { type: 'none' }
			if (ctx.open && ctx.explicit && ctx.active >= 0 && ctx.active < ctx.count)
				return { type: 'accept', index: ctx.active }
			return { type: 'commit' }
		case 'Escape':
			if (chord) return { type: 'none' }
			return ctx.open ? { type: 'close' } : { type: 'none' }
		case 'Backspace':
			if (chord || key.shiftKey || !ctx.empty || !ctx.hasChips) return { type: 'none' }
			return { type: 'chips' }
		default:
			return { type: 'none' }
	}
}

/* -------------------------------------------------------------------------- */
/* Chips and optimistic changes                                               */
/* -------------------------------------------------------------------------- */

export type DisplayTag = MediaTag & {
	/** A change to this chip has been asked for and not yet confirmed. */
	pending?: 'add' | 'promote'
}

/**
 * Rows from the network are data: keep what can be shown, one per slug, and only the
 * fields the chip uses (a stray `pending` must not make a chip look unsaved forever).
 */
export function sanitizeTags(raw: unknown): MediaTag[] {
	if (!Array.isArray(raw)) return []
	const seen = new Set<string>()
	const out: MediaTag[] = []
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue
		const tag = item as Partial<MediaTag>
		const slug = typeof tag.slug === 'string' ? tag.slug.trim() : ''
		if (!slug || seen.has(slug)) continue
		seen.add(slug)
		out.push({
			slug,
			label:
				typeof tag.label === 'string' && tag.label.trim() ? tag.label.trim() : slug,
			source: tag.source === 'manual' ? 'manual' : 'auto',
			...(tag.via === 'vision' || tag.via === 'filename' ? { via: tag.via } : {}),
			...(typeof tag.confidence === 'number' ? { confidence: tag.confidence } : {}),
		})
	}
	return out
}

/** Manual first, then automatic; the order within each is the order given. */
export function orderTags<T extends { source: 'manual' | 'auto' }>(tags: readonly T[]): T[] {
	return [
		...tags.filter((tag) => tag.source === 'manual'),
		...tags.filter((tag) => tag.source !== 'manual'),
	]
}

/** `92` for `0.92`; null when there is no honest figure to show. */
export function confidencePercent(tag: Pick<MediaTag, 'confidence'>): number | null {
	const c = tag.confidence
	return typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1
		? Math.round(c * 100)
		: null
}

/** The tooltip on a chip. Only automatic tags have one: how they came to be. */
export function chipTitle(tag: MediaTag): string | undefined {
	if (tag.source !== 'auto') return undefined
	const pct = confidencePercent(tag)
	if (pct !== null) return `${pct}% sure`
	return tag.via === 'filename' ? 'From the file name' : 'Added automatically'
}

export type TagOp =
	| { id: number; kind: 'add'; labels: string[] }
	| { id: number; kind: 'remove'; slug: string }
	| { id: number; kind: 'promote'; slug: string }

export type TagOpsState = {
	/** Asked for and not yet answered. */
	ops: TagOp[]
	/** The last failure, in words. */
	error: string | null
}

export type TagOpsAction =
	| { type: 'start'; op: TagOp }
	| { type: 'settle'; id: number }
	| { type: 'fail'; id: number; message: string }
	| { type: 'dismiss' }

export const initialTagOps = (): TagOpsState => ({ ops: [], error: null })

export function tagOpsReducer(state: TagOpsState, action: TagOpsAction): TagOpsState {
	switch (action.type) {
		case 'start':
			// A new request is a fresh start: the old failure has been seen.
			return { ops: [...state.ops, action.op], error: null }
		case 'settle':
			return { ...state, ops: state.ops.filter((op) => op.id !== action.id) }
		case 'fail':
			return {
				ops: state.ops.filter((op) => op.id !== action.id),
				error: action.message,
			}
		case 'dismiss':
			return state.error === null ? state : { ...state, error: null }
		default:
			return state
	}
}

/**
 * What the chips show: the tags we were given with every pending change laid over
 * them, in the order the changes were asked for. An add of a tag that is there as
 * automatic shows it as a kept one (adding the same label IS keeping it). Rolling a
 * change back is just dropping its op: the base shows through again.
 */
export function projectTags(base: readonly MediaTag[], ops: readonly TagOp[]): DisplayTag[] {
	let tags: DisplayTag[] = base.map((tag) => ({ ...tag }))
	for (const op of ops) {
		if (op.kind === 'add') {
			for (const label of op.labels) {
				const slug = slugify(label)
				if (!slug) continue
				const at = tags.findIndex((tag) => tag.slug === slug)
				if (at < 0) {
					tags.push({ slug, label, source: 'manual', pending: 'add' })
				} else if (tags[at].source === 'auto') {
					tags[at] = {
						slug: tags[at].slug,
						label: tags[at].label,
						source: 'manual',
						pending: 'add',
					}
				}
			}
		} else if (op.kind === 'remove') {
			tags = tags.filter((tag) => tag.slug !== op.slug)
		} else {
			const at = tags.findIndex((tag) => tag.slug === op.slug)
			if (at >= 0 && tags[at].source === 'auto')
				tags[at] = {
					slug: tags[at].slug,
					label: tags[at].label,
					source: 'manual',
					pending: 'promote',
				}
		}
	}
	return tags
}

/** Slug -> source for everything shown, so a duplicate is caught before it is sent. */
export function existingOf(tags: readonly { slug: string; source: 'manual' | 'auto' }[]) {
	const map = new Map<string, 'manual' | 'auto'>()
	for (const tag of tags) map.set(tag.slug, tag.source)
	return map
}

/**
 * Runs one task at a time, in the order given, whatever happens to each. Two calls in
 * flight against one image can answer out of order and leave the page holding the
 * older tags; one at a time cannot.
 */
export function createSerialQueue() {
	let tail: Promise<void> = Promise.resolve()
	return {
		run(task: () => Promise<void> | void): Promise<void> {
			const next = tail.then(() => task())
			// A failing task must not wedge the ones behind it.
			tail = next.catch(() => undefined)
			return next.catch(() => undefined)
		},
	}
}

/* -------------------------------------------------------------------------- */
/* The input                                                                  */
/* -------------------------------------------------------------------------- */

export type UseTagInputOptions = {
	existing: ExistingTags
	/** How many NEW tags may still be added. */
	room?: number
	perCall?: number
	roomKind?: 'asset' | 'batch'
	/** `signal` is optional so a page that can cancel a request may, and one that cannot is still right. */
	fetchSuggestions(query: string, signal?: AbortSignal): Promise<MediaTagStat[]>
	onCommit(labels: string[]): void
	onDraftChange?(text: string): void
	/** Backspace in an empty box. Returns false when there is no chip to go to. */
	focusLastChip?(): boolean
	disabled?: boolean
}

export function useTagInput(options: UseTagInputOptions) {
	const latest = useRef(options)
	useEffect(() => {
		latest.current = options
	})

	const [text, setTextState] = useState('')
	const [open, setOpen] = useState(false)
	// undefined: the default highlight. null: the person chose "nothing". A string: a row they chose.
	const [activeKey, setActiveKey] = useState<string | null | undefined>(undefined)
	const [snapshot, setSnapshot] = useState<TagSuggestionResult | null>(null)
	const [notice, setNotice] = useState<TagNotice | null>(null)
	const [suggesting, setSuggesting] = useState(false)
	const textRef = useRef('')
	const composing = useRef(false)

	const controllerRef = useRef<ReturnType<typeof createTagSuggestionController> | null>(
		null,
	)
	if (controllerRef.current === null)
		controllerRef.current = createTagSuggestionController({
			fetch: (query, signal) => latest.current.fetchSuggestions(query, signal),
			onResult: setSnapshot,
			onPending: setSuggesting,
		})
	const controller = controllerRef.current
	useEffect(() => () => controller.cancel(), [controller])

	const query = cleanTagLabel(text)
	const stats = snapshot
		? snapshot.query === query
			? snapshot.stats
			: filterStaleStats(snapshot.stats, text)
		: []
	const ranked = useMemo(
		() => rankTagSuggestions(text, stats, options.existing),
		// `stats` is derived from `snapshot` and `text`.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[text, snapshot, options.existing],
	)
	const rows = ranked.options
	const keyIndex =
		typeof activeKey === 'string' ? rows.findIndex((row) => row.key === activeKey) : -1
	const explicit = keyIndex >= 0
	const activeIndex =
		activeKey === null ? -1 : explicit ? keyIndex : ranked.defaultIndex
	const expanded = open && !options.disabled && rows.length > 0 && text.trim() !== ''

	const setText = (value: string) => {
		textRef.current = value
		setTextState(value)
		latest.current.onDraftChange?.(value)
	}

	const request = (value: string) => {
		const q = cleanTagLabel(value)
		// Over the limit it cannot be a tag, so there is nothing to look up.
		controller.request(codePoints(q) > MEDIA_LIMITS.tagLabelMax ? '' : q)
	}

	const apply = (parsed: ParsedTagInput, nextText: string) => {
		const o = latest.current
		setText(nextText)
		setNotice(describeParse(parsed, o.roomKind ?? 'asset'))
		setActiveKey(undefined)
		controller.cancel()
		if (nextText.trim() !== '') {
			setOpen(true)
			request(nextText)
		} else {
			setOpen(false)
		}
		if (parsed.labels.length > 0) o.onCommit(parsed.labels)
	}

	/** `raw` is what to read as tags; `rest` is text after the last comma that stays in the box. */
	const commit = (raw: string, rest = '') => {
		const o = latest.current
		const parsed = parseTagInput(raw, {
			existing: o.existing,
			room: o.room,
			perCall: o.perCall,
		})
		const keep = [...parsed.leftover]
		if (rest.trim() !== '') keep.push(rest)
		apply(parsed, keep.join(', '))
	}

	const edit = (value: string) => {
		setText(value)
		setNotice(null)
		setOpen(true)
		setActiveKey(undefined)
		request(value)
	}

	const handleValue = (value: string) => {
		if (hasTagSeparator(value)) {
			const parts = splitTagList(value)
			const rest = parts.pop() ?? ''
			commit(parts.join(','), rest)
			return
		}
		edit(value)
	}

	const pick = (row: TagOption) => {
		if (row.kind === 'create') {
			commit(textRef.current)
			return
		}
		const o = latest.current
		const parsed = parseTagInput(row.label, {
			existing: o.existing,
			room: o.room,
			perCall: o.perCall,
		})
		if (parsed.labels.length === 0) {
			// Nothing to add: say why, and keep what was typed unless it was the tag itself.
			setNotice(describeParse(parsed, o.roomKind ?? 'asset'))
			if (parsed.duplicates.length > 0) {
				setText('')
				setOpen(false)
				setActiveKey(undefined)
				controller.cancel()
			}
			return
		}
		apply(parsed, '')
	}

	const handlers = {
		onChange(event: ChangeEvent<HTMLInputElement>) {
			const value = event.target.value
			const native = event.nativeEvent as InputEvent | undefined
			if (native?.isComposing || composing.current) {
				// Mid-composition the characters are not final: leave them to the input method.
				setText(value)
				return
			}
			handleValue(value)
		},
		onCompositionStart() {
			composing.current = true
		},
		onCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
			composing.current = false
			handleValue(event.currentTarget.value)
		},
		onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
			const value = textRef.current
			const decision = decideTagKey(
				{
					key: event.key,
					shiftKey: event.shiftKey,
					ctrlKey: event.ctrlKey,
					altKey: event.altKey,
					metaKey: event.metaKey,
					isComposing: event.nativeEvent?.isComposing || composing.current,
				},
				{
					typed: value.trim() !== '',
					empty: value === '',
					open: expanded,
					count: rows.length,
					active: activeIndex,
					explicit,
					hasChips: Boolean(latest.current.focusLastChip),
				},
			)
			switch (decision.type) {
				case 'none':
					return
				case 'open':
					event.preventDefault()
					setOpen(true)
					if (!snapshot || snapshot.query !== query) request(value)
					return
				case 'move':
					event.preventDefault()
					setOpen(true)
					setActiveKey(
						decision.active >= 0 ? (rows[decision.active]?.key ?? null) : null,
					)
					return
				case 'accept': {
					event.preventDefault()
					const row = rows[decision.index]
					if (row) pick(row)
					return
				}
				case 'commit':
					event.preventDefault()
					commit(value)
					return
				case 'swallow':
					event.preventDefault()
					return
				case 'close':
					event.preventDefault()
					setOpen(false)
					setActiveKey(undefined)
					return
				case 'chips':
					if (latest.current.focusLastChip?.()) event.preventDefault()
					return
			}
		},
		onPaste(event: ClipboardEvent<HTMLInputElement>) {
			const pasted = event.clipboardData?.getData('text') ?? ''
			// One word pastes like any text; a list is read as tags, all of it, now.
			if (!hasTagSeparator(pasted)) return
			event.preventDefault()
			const el = event.currentTarget
			const value = textRef.current
			const start = el?.selectionStart ?? value.length
			const end = el?.selectionEnd ?? start
			commit(value.slice(0, start) + pasted + value.slice(end))
		},
		onFocus() {
			setOpen(true)
			const value = textRef.current
			if (value.trim() !== '' && (!snapshot || snapshot.query !== cleanTagLabel(value)))
				request(value)
		},
		onBlur() {
			setOpen(false)
			controller.cancel()
		},
	}

	return {
		text,
		rows,
		activeIndex,
		expanded,
		notice,
		suggesting,
		handlers,
		pick,
		dismissNotice: () => setNotice(null),
		/** The text the box holds right now, read synchronously. */
		read: () => textRef.current,
	}
}

export type TagSuggestionListProps = {
	id: string
	expanded: boolean
	rows: readonly TagOption[]
	activeIndex: number
	optionId(index: number): string
	onPick(row: TagOption): void
	busy?: boolean
}

/**
 * Always in the DOM (hidden when closed) so the input's `aria-controls` never points
 * at nothing. Focus stays in the input, and the highlight is `aria-activedescendant`;
 * pressing on a row is swallowed so choosing one never blurs the box first.
 */
export function TagSuggestionList({
	id,
	expanded,
	rows,
	activeIndex,
	optionId,
	onPick,
	busy,
}: TagSuggestionListProps) {
	return (
		<ul
			id={id}
			role='listbox'
			aria-label='Tag suggestions'
			aria-busy={busy || undefined}
			hidden={!expanded}
			onMouseDown={(event) => event.preventDefault()}
			className='absolute inset-x-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-popover p-1 shadow-xl'>
			{expanded &&
				rows.map((row, index) => {
					const active = index === activeIndex
					return (
						<li
							key={row.key}
							id={optionId(index)}
							role='option'
							aria-selected={active}
							data-kind={row.kind}
							onClick={() => onPick(row)}
							className={cn(
								'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm',
								active ? 'bg-white/10 text-white' : 'text-slate-200 hover:bg-white/5',
							)}>
							{row.kind === 'create' ? (
								<>
									<Plus aria-hidden className='size-4 shrink-0 text-slate-500' />
									<span dir='auto' className='min-w-0 truncate'>{`Create "${clip(row.label)}"`}</span>
								</>
							) : (
								<>
									{row.present ? (
										<Check aria-hidden className='size-4 shrink-0 text-brand' />
									) : (
										<span aria-hidden className='size-4 shrink-0' />
									)}
									<span dir='auto' className='min-w-0 truncate'>
										{row.kind === 'use' ? `Use "${clip(row.label)}"` : clip(row.label)}
									</span>
									{/* A real space, so the row reads "Use "Kitchen" (214)" to a screen reader too. */}
									{' '}
									<span className='shrink-0 text-xs tabular-nums text-slate-500'>
										{`(${formatCount(row.count)})`}
									</span>
									{row.present && (
										<>
											{' '}
											<span className='ml-auto shrink-0 text-xs text-slate-400'>Added</span>
										</>
									)}
								</>
							)}
						</li>
					)
				})}
		</ul>
	)
}

export type TagInputProps = Omit<UseTagInputOptions, 'disabled'> & {
	id?: string
	/** The accessible name. Null when a visible <label> names it instead. */
	label?: string | null
	placeholder?: string
	disabled?: boolean
	inputRef?: Ref<HTMLInputElement>
	className?: string
}

/** The box, its suggestions and its notices. Owns no tags: it reports what to add. */
export function TagInput({
	id,
	label = 'Add a tag',
	placeholder = 'Add a tag, then press Enter',
	inputRef,
	className,
	disabled,
	...options
}: TagInputProps) {
	const baseId = useId()
	const listId = `${baseId}-list`
	const hintId = `${baseId}-hint`
	const noticeId = `${baseId}-notice`
	const optionId = (index: number) => `${baseId}-option-${index}`

	const input = useTagInput({ ...options, disabled })
	const { rows, activeIndex, expanded, notice, handlers } = input

	const announcement = expanded
		? `${rows.length} ${rows.length === 1 ? 'option' : 'options'}.${
				rows[activeIndex]?.kind === 'use'
					? ` Suggested: use the existing tag "${rows[activeIndex].label}".`
					: ''
			}`
		: ''

	return (
		<div data-slot='tag-input' className={cn('relative', className)}>
			<Input
				ref={inputRef}
				id={id}
				type='text'
				role='combobox'
				aria-label={label ?? undefined}
				aria-autocomplete='list'
				aria-haspopup='listbox'
				aria-expanded={expanded}
				aria-controls={listId}
				aria-activedescendant={
					expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined
				}
				aria-describedby={notice ? `${hintId} ${noticeId}` : hintId}
				aria-invalid={notice?.tone === 'error' ? true : undefined}
				autoComplete='off'
				autoCorrect='off'
				autoCapitalize='off'
				spellCheck={false}
				enterKeyHint='done'
				placeholder={placeholder}
				disabled={disabled}
				value={input.text}
				{...handlers}
				className='h-9 border-white/10 bg-white/3 text-white placeholder:text-slate-500 focus-visible:border-brand/60 focus-visible:ring-brand/20'
			/>
			<TagSuggestionList
				id={listId}
				expanded={expanded}
				rows={rows}
				activeIndex={activeIndex}
				optionId={optionId}
				onPick={input.pick}
				busy={input.suggesting}
			/>
			<p id={hintId} className='sr-only'>
				Press Enter or type a comma to add a tag. Paste a comma separated list to add
				several at once.
			</p>
			<div role='status' aria-live='polite' className='sr-only'>
				{announcement}
			</div>
			{notice && (
				<p
					id={noticeId}
					role={notice.tone === 'error' ? 'alert' : 'status'}
					className={cn(
						'mt-1.5 text-xs',
						notice.tone === 'error' ? 'text-destructive' : 'text-slate-400',
					)}>
					{notice.text}
				</p>
			)}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Chips                                                                      */
/* -------------------------------------------------------------------------- */

export type TagChipProps = {
	tag: DisplayTag
	canEdit: boolean
	/** Offer the Keep check on an automatic tag. */
	canKeep: boolean
	onClick?(slug: string): void
	onRemove(slug: string, viaKeyboard: boolean): void
	onKeep(slug: string): void
}

const chipButton =
	'cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none'

export function TagChip({ tag, canEdit, canKeep, onClick, onRemove, onKeep }: TagChipProps) {
	const auto = tag.source === 'auto'
	const pct = confidencePercent(tag)
	const pending = tag.pending !== undefined
	const body = (
		<>
			{auto && <Sparkles aria-hidden className='size-3 shrink-0 text-slate-400' />}
			<span dir='auto' className='min-w-0 truncate'>
				{tag.label}
			</span>
			{auto && (
				<span className='sr-only'>
					{`, automatic${pct !== null ? `, ${pct}% sure` : ''}`}
				</span>
			)}
			{auto && pct !== null && (
				// The tooltip needs a pointer; on a phone the figure is shown instead.
				<span
					aria-hidden
					className='hidden text-[10px] text-slate-400 tabular-nums [@media(hover:none)]:inline'>
					{`${pct}%`}
				</span>
			)}
			{pending && <span className='sr-only'>, saving</span>}
		</>
	)
	return (
		<li
			data-slot='tag-chip'
			data-slug={tag.slug}
			data-source={tag.source}
			data-pending={tag.pending}
			className={cn(
				'inline-flex min-h-7 max-w-full min-w-0 items-center rounded-full border text-xs',
				auto
					? 'border-white/10 bg-white/5 text-slate-300'
					: 'border-brand/30 bg-brand/10 text-brand',
				pending && 'border-dashed opacity-70',
			)}>
			{onClick ? (
				<button
					type='button'
					title={chipTitle(tag)}
					onClick={() => onClick(tag.slug)}
					onKeyDown={(event) => {
						if (!canEdit) return
						if (event.key !== 'Backspace' && event.key !== 'Delete') return
						event.preventDefault()
						// Delete is also the page's "delete the selected images" shortcut: this one is ours.
						event.stopPropagation()
						onRemove(tag.slug, true)
					}}
					className={cn(
						chipButton,
						'inline-flex min-w-0 items-center gap-1 rounded-full py-1 pr-1.5 pl-2.5 hover:bg-white/5',
					)}>
					{body}
				</button>
			) : (
				<span
					title={chipTitle(tag)}
					className='inline-flex min-w-0 items-center gap-1 py-1 pr-1.5 pl-2.5'>
					{body}
				</span>
			)}
			{canEdit && canKeep && auto && (
				<button
					type='button'
					aria-label={`Keep tag ${tag.label}`}
					title='Keep this tag'
					onClick={() => onKeep(tag.slug)}
					className={cn(
						chipButton,
						'grid size-6 shrink-0 place-items-center rounded-full hover:bg-white/15',
					)}>
					<Check aria-hidden className='size-3' />
				</button>
			)}
			{canEdit && (
				<button
					type='button'
					aria-label={`Remove tag ${tag.label}`}
					title={auto ? 'Remove. The auto-tagger will not add it back.' : 'Remove'}
					onClick={(event) => onRemove(tag.slug, event.detail === 0)}
					className={cn(
						chipButton,
						'mr-0.5 grid size-6 shrink-0 place-items-center rounded-full hover:bg-white/15',
					)}>
					<X aria-hidden className='size-3' />
				</button>
			)}
		</li>
	)
}

/* -------------------------------------------------------------------------- */
/* The editor                                                                 */
/* -------------------------------------------------------------------------- */

const CHANGE_FAILED = 'Could not save that change. Try again.'

export function TagEditor({
	tags,
	canEdit,
	onAdd,
	onRemove,
	onPromote,
	onTagClick,
	fetchSuggestions,
}: TagEditorProps) {
	const baseId = useId()
	const listId = `${baseId}-tags`
	const [state, dispatch] = useReducer(tagOpsReducer, undefined, initialTagOps)
	const [expanded, setExpanded] = useState(false)
	const nextId = useRef(1)
	const queue = useRef<ReturnType<typeof createSerialQueue> | null>(null)
	if (queue.current === null) queue.current = createSerialQueue()
	const latest = useRef({ onAdd, onRemove, onPromote })
	useEffect(() => {
		latest.current = { onAdd, onRemove, onPromote }
	})
	const listRef = useRef<HTMLUListElement>(null)
	const inputRef = useRef<HTMLInputElement>(null)
	// Where focus goes once a removed chip is gone: the chip before it, or the box.
	const focusAfter = useRef<{ slug: string | null } | null>(null)

	const base = useMemo(() => sanitizeTags(tags), [tags])
	const display = useMemo(
		() => orderTags(projectTags(base, state.ops)),
		[base, state.ops],
	)
	const existing = useMemo(() => existingOf(display), [display])
	const collapsible = display.length > TAG_COLLAPSE_AT
	const shown = collapsible && !expanded ? display.slice(0, TAG_COLLAPSE_AT) : display
	const room = Math.max(0, MEDIA_LIMITS.maxTagsPerAsset - display.length)

	const run = (op: TagOp, call: () => Promise<void> | void) => {
		dispatch({ type: 'start', op })
		void queue.current!.run(async () => {
			try {
				await call()
				dispatch({ type: 'settle', id: op.id })
			} catch (error) {
				dispatch({ type: 'fail', id: op.id, message: messageOf(error, CHANGE_FAILED) })
			}
		})
	}

	const add = (labels: string[]) => {
		if (!canEdit || labels.length === 0) return
		// Bound now, not when the queue gets to it: it must reach the image the person was on.
		const { onAdd: send } = latest.current
		setExpanded(true)
		run({ id: nextId.current++, kind: 'add', labels }, () => send(labels))
	}

	const remove = (slug: string, viaKeyboard: boolean) => {
		if (!canEdit) return
		if (viaKeyboard) {
			const at = shown.findIndex((tag) => tag.slug === slug)
			focusAfter.current = { slug: at > 0 ? shown[at - 1].slug : null }
		}
		const { onRemove: send } = latest.current
		run({ id: nextId.current++, kind: 'remove', slug }, () => send(slug))
	}

	const keep = (slug: string) => {
		const { onPromote: send } = latest.current
		if (!canEdit || !send) return
		run({ id: nextId.current++, kind: 'promote', slug }, () => send(slug))
	}

	useEffect(() => {
		const target = focusAfter.current
		if (!target) return
		focusAfter.current = null
		const chip = target.slug
			? Array.from(
					listRef.current?.querySelectorAll<HTMLElement>('[data-slot="tag-chip"]') ?? [],
				).find((el) => el.dataset.slug === target.slug)
			: null
		const control = chip?.querySelector<HTMLElement>('button')
		if (control) control.focus()
		else inputRef.current?.focus()
	}, [display])

	const focusLastChip = () => {
		const chips = listRef.current?.querySelectorAll<HTMLElement>('[data-slot="tag-chip"]')
		const last = chips && chips.length > 0 ? chips[chips.length - 1] : null
		const control = last?.querySelector<HTMLElement>('button')
		if (!control) return false
		control.focus()
		return true
	}

	const pending = state.ops.length > 0

	return (
		<div data-slot='tag-editor' className='space-y-2'>
			{display.length > 0 ? (
				<ul
					ref={listRef}
					id={listId}
					aria-label='Tags'
					className='flex flex-wrap items-center gap-1.5'>
					{shown.map((tag) => (
						<TagChip
							key={tag.slug}
							tag={tag}
							canEdit={canEdit}
							canKeep={Boolean(onPromote)}
							onClick={onTagClick}
							onRemove={remove}
							onKeep={keep}
						/>
					))}
					{collapsible && (
						<li>
							<button
								type='button'
								aria-expanded={expanded}
								aria-controls={listId}
								onClick={() => setExpanded((current) => !current)}
								className={cn(
									chipButton,
									'rounded-full px-2 py-1 text-xs text-brand underline-offset-2 hover:underline',
								)}>
								{expanded ? 'Show fewer' : `Show all ${display.length}`}
							</button>
						</li>
					)}
				</ul>
			) : (
				<p className='text-sm text-slate-500'>
					{canEdit ? 'No tags yet.' : 'No tags.'}
				</p>
			)}
			{canEdit && display.some((tag) => tag.source === 'auto') && (
				<p className='text-xs text-slate-500'>
					Tags with a sparkle were added automatically. Keep the ones that are right: a tag
					you remove is not suggested again.
				</p>
			)}

			{canEdit && (
				<TagInput
					inputRef={inputRef}
					existing={existing}
					room={room}
					roomKind='asset'
					fetchSuggestions={fetchSuggestions}
					onCommit={add}
					focusLastChip={display.length > 0 ? focusLastChip : undefined}
				/>
			)}

			{pending && (
				<p
					role='status'
					className='flex items-center gap-1.5 text-xs text-slate-500'>
					<Loader2 aria-hidden className='size-3 animate-spin motion-reduce:animate-none' />
					Saving…
				</p>
			)}
			{state.error && (
				<p role='alert' className='flex items-start gap-2 text-xs text-destructive'>
					<span className='min-w-0 flex-1'>{state.error}</span>
					<button
						type='button'
						onClick={() => dispatch({ type: 'dismiss' })}
						className={cn(chipButton, 'shrink-0 rounded text-slate-400 hover:text-white')}>
						Dismiss
					</button>
				</p>
			)}
		</div>
	)
}
