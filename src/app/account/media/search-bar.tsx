'use client'

/**
 * The search box and everything under it: suggestions, chips, scope, notes, save, tips.
 *
 * Every decision that is not drawing (where a suggestion lands, what a key does, whether an
 * answer may be shown, what the lines under the box say) is a plain exported function, so
 * `scripts/prove-media-ui-search.mjs` can call it without a DOM. The component
 * only wires them to events. Live parsing here is a hint (warnings); the results never
 * depend on it, they come from the server for the committed query.
 */
import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
	type FormEvent,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	type Ref,
	type RefCallback,
} from 'react'
import {
	BookmarkPlus,
	CalendarDays,
	ChevronDown,
	CornerDownLeft,
	FileImage,
	Folder,
	History,
	Lightbulb,
	ListFilter,
	Loader2,
	Palette,
	Search,
	Sparkles,
	Tag,
	TriangleAlert,
	X,
	type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { parseQuery } from '@/lib/media/query/parse'
import { normalizeText } from '@/lib/media/text'
import {
	MEDIA_LIMITS,
	type MediaSuggestion,
	type QueryChip,
} from '@/lib/media/types'
import { cn } from '@/lib/utils'
import type { SearchBarProps } from './contracts'
import { formatCount } from './format'
import { SearchTips, appendExample } from './search-tips'

/** Trailing-edge debounce for suggestions: long enough to skip keystrokes in a burst, short enough to feel live. */
export const SUGGEST_DEBOUNCE_MS = 120
/** Recent searches offered when the box is focused and empty. */
export const RECENT_SHOWN = 5
/** More than the server ever sends (10); a bound so a hostile reply cannot build a huge list. */
const SUGGESTIONS_MAX = 12
/** Warnings listed before "and N more". */
const WARNINGS_SHOWN = 4
/** A row's text is for one line: anything longer is clipped, so a hostile reply cannot build a megabyte list. */
const SUGGESTION_TEXT_MAX = 200
/** A query is at most MEDIA_LIMITS.queryMax characters, so it holds nowhere near this many words to correct or drop. */
const WORDS_MAX = 100

const WHITESPACE = /\s/
const SWATCH = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const list = <T,>(value: readonly T[] | null | undefined): readonly T[] =>
	Array.isArray(value) ? value : []

const clip = (text: string, max: number) => {
	const chars = Array.from(text)
	return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text
}

const safeSwatch = (value: unknown) =>
	typeof value === 'string' && SWATCH.test(value) ? value : undefined

const messageOf = (error: unknown, fallback: string) =>
	error instanceof Error && error.message.trim() ? error.message : fallback

/**
 * The word a token stands for, folded exactly the way the parser folds a word
 * (`normalizeText`: case, accents and punctuation gone), so `Kithcen,` and the
 * `kithcen` the server reports in `corrections` are the same word.
 */
const normalizeWord = (text: string) => normalizeText(text)

/* -------------------------------------------------------------------------- */
/* Tokens. The box is split like the server splits it: on whitespace, except  */
/* inside quotes.                                                             */
/* -------------------------------------------------------------------------- */

export type Token = { text: string; start: number; end: number }

export function tokenize(value: string): Token[] {
	const tokens: Token[] = []
	let start = -1
	let quoted = false
	for (let i = 0; i < value.length; i++) {
		const char = value[i]
		if (char === '"') {
			quoted = !quoted
			if (start < 0) start = i
		} else if (!quoted && WHITESPACE.test(char)) {
			if (start >= 0) {
				tokens.push({ text: value.slice(start, i), start, end: i })
				start = -1
			}
		} else if (start < 0) {
			start = i
		}
	}
	if (start >= 0)
		tokens.push({ text: value.slice(start), start, end: value.length })
	return tokens
}

/**
 * A token minus the sign and brackets that belong to the query's structure, not to the
 * word being completed: `-kit` is a negated word, `(kit` opens a group, `bath)` closes one.
 * Replacing the whole token would silently drop them. A token with a quote in it is
 * left whole: a `)` inside an unclosed quote is text, not a bracket.
 */
export function splitToken(text: string) {
	const lead = /^[(-]+/.exec(text)?.[0] ?? ''
	const rest = text.slice(lead.length)
	const trail = text.includes('"') ? '' : (/\)+$/.exec(rest)?.[0] ?? '')
	return { lead, body: rest.slice(0, rest.length - trail.length), trail }
}

const clampCaret = (value: string, caret: number) =>
	Math.min(
		Math.max(Number.isFinite(caret) ? Math.trunc(caret) : value.length, 0),
		value.length,
	)

/** The token the caret is in or touching, or null when it sits in blank space. */
export function tokenAt(value: string, caret: number): Token | null {
	const at = clampCaret(value, caret)
	for (const token of tokenize(value))
		if (token.start <= at && at <= token.end) return token
	return null
}

/** True when there is a word to complete: the text does not end in blank space outside a quote. */
export function hasCompletableToken(input: string) {
	const last = tokenize(input).at(-1)
	return last !== undefined && last.end === input.length
}

/** The text without the word being typed at its end (a half-written `tag:` is not a mistake yet). */
export function withoutLastToken(value: string) {
	const last = tokenize(value).at(-1)
	return last !== undefined && last.end === value.length
		? value.slice(0, last.start)
		: value
}

/** An operator (`color:`) is a step toward a clause, not a clause: the person keeps typing. */
export const keepsEditing = (
	suggestion: Pick<MediaSuggestion, 'insert'> & { kind: string },
) => suggestion.kind === 'operator' || /:$/.test(suggestion.insert.trim())

export type Applied = {
	value: string
	caret: number
	/** An operator was inserted: the list stays open for the value. */
	keepEditing: boolean
	/** False when the insert was empty or would not fit: the text came back as it was. */
	applied: boolean
}

/**
 * Puts `suggestion.insert` where the token under the caret was, and the caret right
 * after it. Only that token changes. With the caret in blank space (an empty box, or
 * after a space) the insert goes at the caret. A change that would push the text past
 * the search length limit is refused and the text comes back as it was.
 */
export function applySuggestion(
	value: string,
	caret: number,
	suggestion: Pick<MediaSuggestion, 'insert'> & { kind: string },
): Applied {
	const insertText =
		typeof suggestion.insert === 'string' ? suggestion.insert : ''
	const keepEditing = keepsEditing({ kind: suggestion.kind, insert: insertText })
	const at = clampCaret(value, caret)
	const refused: Applied = { value, caret: at, keepEditing, applied: false }
	const insert = insertText.replace(/[\r\n]+/g, ' ')
	if (insert.trim() === '') return refused

	const token = tokenAt(value, at)
	let from = at
	let to = at
	if (token) {
		const { lead, trail } = splitToken(token.text)
		// A server that already writes the sign or bracket must not get it twice.
		const kept = lead !== '' && insert.startsWith(lead) ? 0 : lead.length
		from = token.start + kept
		to = token.end - trail.length
	}
	const next = value.slice(0, from) + insert + value.slice(to)
	if (next.length > MEDIA_LIMITS.queryMax) return refused
	return { value: next, caret: from + insert.length, keepEditing, applied: true }
}

/* -------------------------------------------------------------------------- */
/* Options. What the listbox shows, flattened in the order the keyboard walks */
/* it.                                                                        */
/* -------------------------------------------------------------------------- */

export type OptionIcon =
	| 'tag'
	| 'palette'
	| 'type'
	| 'folder'
	| 'added'
	| 'review'

export type SearchOptionKind = MediaSuggestion['kind'] | 'recent'

export type SearchOption = {
	id: string
	kind: SearchOptionKind
	/** Heading it sits under; null for the closing "Search for" row. */
	group: string | null
	label: string
	/** What replaces the token (or, for `recent` and `search`, the whole box). */
	insert: string
	hint?: string
	count?: number
	swatch?: string
	/** A row of the static "Narrow by" list. */
	narrow?: true
	icon?: OptionIcon
}

/** The static list for a focused, empty box. Needs no server, so the language is discoverable. */
export const NARROW_BY: readonly {
	label: string
	insert: string
	hint: string
	icon: OptionIcon
}[] = [
	{
		label: 'Tag',
		insert: 'tag:',
		hint: 'Images with a tag, like tag:kitchen',
		icon: 'tag',
	},
	{
		label: 'Color',
		insert: 'color:',
		hint: 'Dominant color, like color:blue',
		icon: 'palette',
	},
	{
		label: 'Type',
		insert: 'type:',
		hint: 'File type: png, jpg, webp, avif or gif',
		icon: 'type',
	},
	{
		label: 'Folder',
		insert: 'folder:',
		hint: 'A folder and everything inside it',
		icon: 'folder',
	},
	{
		label: 'Added',
		insert: 'added:',
		hint: 'When it was added: 7d, today, 2026-03-01',
		icon: 'added',
	},
	{
		label: 'Needs review',
		insert: 'is:',
		hint: 'Auto tags nobody has kept: is:unreviewed',
		icon: 'review',
	},
]

const GROUP_BY_KIND = {
	tag: 'Tags',
	folder: 'Folders',
	operator: 'Filters',
	value: 'Values',
} as const

const withIds = (options: Omit<SearchOption, 'id'>[], idPrefix: string) =>
	options.map((option, index) => ({ ...option, id: `${idPrefix}${index}` }))

/**
 * A reply from the network is data, not a promise of good shape: keep only rows that
 * can be shown and applied, drop the server's own "search" row (the list always ends
 * with one built from the box), drop repeats, and bound the length.
 */
export function sanitizeSuggestions(raw: unknown): MediaSuggestion[] {
	if (!Array.isArray(raw)) return []
	const seen = new Set<string>()
	const out: MediaSuggestion[] = []
	for (const item of raw) {
		if (out.length >= SUGGESTIONS_MAX) break
		if (!item || typeof item !== 'object') continue
		const { kind, label, insert, hint, count, swatch } = item as Record<
			string,
			unknown
		>
		// Own keys only: a hostile kind of "constructor" is not a kind.
		if (typeof kind !== 'string' || !Object.hasOwn(GROUP_BY_KIND, kind)) continue
		if (typeof label !== 'string' || label.trim() === '') continue
		// Longer than a query can be: it could never be applied.
		if (
			typeof insert !== 'string' ||
			insert.trim() === '' ||
			insert.length > MEDIA_LIMITS.queryMax
		)
			continue
		const key = `${kind}\u0000${insert}`
		if (seen.has(key)) continue
		seen.add(key)
		const color = safeSwatch(swatch)
		out.push({
			kind: kind as MediaSuggestion['kind'],
			label: clip(label, SUGGESTION_TEXT_MAX),
			insert,
			...(typeof hint === 'string' && hint.trim() !== ''
				? { hint: clip(hint, SUGGESTION_TEXT_MAX) }
				: {}),
			...(typeof count === 'number' && Number.isFinite(count) && count >= 0
				? { count }
				: {}),
			...(color ? { swatch: color } : {}),
		})
	}
	return out
}

/**
 * Groups appear in the order the server ranked them (a bare `col` puts the `color:`
 * filter above the tags), each group keeps its own order, and the last row is always
 * "Search for ..." built from the box. Nothing here is ever highlighted.
 */
export function typedOptions(
	suggestions: readonly MediaSuggestion[],
	value: string,
	idPrefix: string,
): SearchOption[] {
	const order: string[] = []
	const buckets = new Map<string, Omit<SearchOption, 'id'>[]>()
	for (const s of sanitizeSuggestions(suggestions)) {
		const group = GROUP_BY_KIND[s.kind as keyof typeof GROUP_BY_KIND]
		if (!buckets.has(group)) {
			buckets.set(group, [])
			order.push(group)
		}
		buckets.get(group)!.push({
			kind: s.kind,
			group,
			label: s.label,
			insert: s.insert,
			hint: s.hint,
			count: s.count,
			swatch: s.swatch,
		})
	}
	const rows = order.flatMap((group) => buckets.get(group)!)
	rows.push({
		kind: 'search',
		group: null,
		label: `Search for "${clip(value.trim(), 60)}"`,
		insert: value,
	})
	return withIds(rows, idPrefix)
}

/** Up to five recent searches, then the "Narrow by" operators. */
export function emptyOptions(
	recent: readonly string[],
	idPrefix: string,
): SearchOption[] {
	const seen = new Set<string>()
	const rows: Omit<SearchOption, 'id'>[] = []
	for (const entry of list(recent)) {
		if (rows.length >= RECENT_SHOWN) break
		// A single-line box cannot hold a line break, and a search is never longer than a query.
		const text =
			typeof entry === 'string' ? entry.replace(/[\r\n]+/g, ' ') : ''
		if (
			text.trim() === '' ||
			text.length > MEDIA_LIMITS.queryMax ||
			seen.has(text)
		)
			continue
		seen.add(text)
		rows.push({
			kind: 'recent',
			group: 'Recent searches',
			label: text,
			insert: text,
		})
	}
	for (const row of NARROW_BY)
		rows.push({
			kind: 'operator',
			group: 'Narrow by',
			label: row.label,
			insert: row.insert,
			hint: row.hint,
			icon: row.icon,
			narrow: true,
		})
	return withIds(rows, idPrefix)
}

/* -------------------------------------------------------------------------- */
/* Keyboard. One table decides what a key does, so the rules can be read and  */
/* tested without a DOM.                                                      */
/* -------------------------------------------------------------------------- */

export type KeyInput = {
	key: string
	shiftKey?: boolean
	ctrlKey?: boolean
	altKey?: boolean
	metaKey?: boolean
	/** An input method (Japanese, Chinese, ...) is mid-composition: Enter belongs to it. */
	isComposing?: boolean
}

export type KeyState = {
	/** The listbox is showing. */
	open: boolean
	/** The highlighted option, or -1. Only Up/Down ever set it. */
	active: number
	options: readonly Pick<SearchOption, 'kind'>[]
	hasText: boolean
}

export type KeyDecision =
	| { type: 'none' }
	| { type: 'open' }
	| { type: 'move'; active: number }
	| { type: 'accept'; index: number }
	| { type: 'submit' }
	| { type: 'close' }
	| { type: 'clear' }
	| { type: 'blur' }

/**
 * Up/Down walk the options with one extra stop, "nothing highlighted", so the person
 * can always get back to a state where Enter submits what they typed and Tab moves on.
 */
export function nextActive(
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
 * Tab completes only an option the person moved to with Up/Down. Otherwise it is
 * Tab: a keyboard user must be able to leave the box. The "Search for" row has
 * nothing to complete, so Tab passes over it too. Shift+Tab and any held modifier
 * never complete: they are navigation.
 */
export function shouldTabAccept(
	state: Pick<KeyState, 'open' | 'active' | 'options'>,
	key: Omit<KeyInput, 'key'> = {},
): boolean {
	if (key.shiftKey || key.ctrlKey || key.altKey || key.metaKey || key.isComposing)
		return false
	if (!state.open) return false
	const option = state.options[state.active]
	return option !== undefined && option.kind !== 'search'
}

export function decideKey(key: KeyInput, state: KeyState): KeyDecision {
	if (key.isComposing || key.key === 'Process') return { type: 'none' }
	const count = state.options.length
	const chord = key.ctrlKey || key.altKey || key.metaKey
	switch (key.key) {
		case 'ArrowDown':
		case 'ArrowUp':
			if (chord || key.shiftKey) return { type: 'none' }
			if (!state.open) return { type: 'open' }
			if (count === 0) return { type: 'none' }
			return {
				type: 'move',
				active: nextActive(state.active, key.key === 'ArrowDown' ? 1 : -1, count),
			}
		case 'Enter':
			if (chord) return { type: 'none' }
			if (state.open && state.active >= 0 && state.active < count)
				return { type: 'accept', index: state.active }
			return { type: 'submit' }
		case 'Tab':
			return shouldTabAccept(state, key)
				? { type: 'accept', index: state.active }
				: { type: 'none' }
		case 'Escape':
			if (chord) return { type: 'none' }
			// List first, then the text, then the box itself, so Esc never feels stuck.
			if (state.open) return { type: 'close' }
			return state.hasText ? { type: 'clear' } : { type: 'blur' }
		default:
			return { type: 'none' }
	}
}

/* -------------------------------------------------------------------------- */
/* Suggestions. Debounced, abortable, and unable to show an answer to an old  */
/* question.                                                                  */
/* -------------------------------------------------------------------------- */

export type SuggestionTimers = {
	set(callback: () => void, ms: number): unknown
	clear(handle: unknown): void
}

const realTimers: SuggestionTimers = {
	set: (callback, ms) => setTimeout(callback, ms),
	clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export type SuggestionResult<M> = {
	input: string
	meta: M
	suggestions: MediaSuggestion[]
}

/**
 * Every `request` supersedes the one before: its timer is cleared and its fetch aborted
 * at once. A response is delivered only if it belongs to the latest request, so a slow
 * answer to "kit" can never overwrite the answer to "kitch", whether or not the fetch
 * honours its signal. Input with nothing to complete is answered with [] and no fetch.
 * A failing fetch is an empty list, never an unhandled rejection.
 */
export function createSuggestionController<M>(options: {
	fetch(input: string, signal: AbortSignal): Promise<MediaSuggestion[]>
	onResult(result: SuggestionResult<M>): void
	onPending?(pending: boolean): void
	delay?: number
	timers?: SuggestionTimers
}) {
	const delay = options.delay ?? SUGGEST_DEBOUNCE_MS
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
		request(input: string, meta: M) {
			supersede()
			if (!hasCompletableToken(input)) {
				setPending(false)
				options.onResult({ input, meta, suggestions: [] })
				return
			}
			const mine = generation
			setPending(true)
			timer = timers.set(() => {
				timer = null
				if (mine !== generation) return
				const controller = new AbortController()
				inflight = controller
				const settle = (suggestions: MediaSuggestion[]) => {
					if (mine !== generation || controller.signal.aborted) return
					inflight = null
					setPending(false)
					options.onResult({
						input,
						meta,
						suggestions: sanitizeSuggestions(suggestions),
					})
				}
				try {
					Promise.resolve(options.fetch(input, controller.signal)).then(
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
/* What sits under the box: warnings, corrections, dropped words.             */
/* -------------------------------------------------------------------------- */

type Correction = { from: string; to: string }

/**
 * `showing` is what is really being searched; `originals` are typos the person can
 * insist on. A `from` that is a clause (`tag:van`, `#van`) is a rename the library
 * followed: quoting it cannot bring the old tag back, so it is stated, not offered.
 */
export function describeCorrections(corrections: readonly Correction[]) {
	const showing: string[] = []
	const originals: string[] = []
	for (const item of list(corrections).slice(0, WORDS_MAX)) {
		if (!item || typeof item.from !== 'string' || typeof item.to !== 'string')
			continue
		const from = item.from.trim()
		const to = item.to.trim()
		if (!to || from.toLowerCase() === to.toLowerCase()) continue
		if (!showing.includes(to)) showing.push(to)
		if (from && !/[:#]/.test(from) && !originals.includes(from))
			originals.push(from)
	}
	return { showing, originals }
}

/**
 * A word of free text, as opposed to a clause (`tag:x`, `#x`), a phrase, a wildcard or an
 * operator: the only kind of token the library ever corrects, drops or quotes. A bracket
 * at its edge (`(kit`, `bath)`) is the query's structure and is dealt with by `splitToken`.
 */
const isBare = (text: string) =>
	!/["*:]/.test(text) && !/^[(-]*#/.test(text) && text !== 'OR' && text !== 'NOT'

/** Punctuation hugging a word (`kithcen,`) is not part of it: it stays outside the quotes. */
const WORD_EDGES = /^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u

/**
 * The text with each listed bare word wrapped in double quotes, everything else
 * untouched. A quoted word is a phrase, and the library never corrects, drops or
 * relaxes a phrase, so this is how a person says "I meant exactly this". Null when none
 * of the words is in the text (the box has moved on from what the library saw).
 */
export function quoteWords(
	value: string,
	words: readonly string[],
): string | null {
	const wanted = new Set(
		list(words)
			.map((word) => normalizeWord(String(word)))
			.filter(Boolean),
	)
	if (wanted.size === 0) return null
	let out = ''
	let cursor = 0
	let hit = false
	for (const token of tokenize(value)) {
		if (!isBare(token.text)) continue
		const { lead, body, trail } = splitToken(token.text)
		if (body === '' || !wanted.has(normalizeWord(body))) continue
		const [, before, core, after] = WORD_EDGES.exec(body) as RegExpExecArray
		out += `${value.slice(cursor, token.start)}${lead}${before}"${core}"${after}${trail}`
		cursor = token.end
		hit = true
	}
	return hit ? out + value.slice(cursor) : null
}

/**
 * The query that says "I meant it", for "Search instead for kithcen": each corrected word,
 * as typed, in double quotes so it is not corrected again. For a single word that is the
 * whole text in quotes; in a longer query the other words and every clause stay as they
 * are (wrapping `tag:kitchen kithcen` as one phrase would turn the filter into text).
 * Null when there is no typo to insist on or it is no longer in the box.
 */
export function searchInsteadQuery(
	value: string,
	corrections: readonly Correction[],
): string | null {
	const { originals } = describeCorrections(corrections)
	return originals.length === 0 ? null : quoteWords(value, originals)
}

/** `missing` is what no image mentions; `remaining` is what the results are actually for. */
export function describeDropped(value: string, dropped: readonly string[]) {
	const missing: string[] = []
	for (const word of list(dropped).slice(0, WORDS_MAX)) {
		const text = typeof word === 'string' ? word.trim() : ''
		if (text && !missing.includes(text)) missing.push(text)
	}
	const gone = new Set(missing.map(normalizeWord))
	const remaining: string[] = []
	for (const token of tokenize(value)) {
		if (!isBare(token.text)) continue
		const word = normalizeWord(token.text)
		if (word === '' || gone.has(word)) continue
		remaining.push(token.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
	}
	return { missing, remaining }
}

/**
 * The text without the listed bare words, so the box says what the results are for. The
 * seam is tidied to one space. A word in a bracket or after a minus is left alone: dropped
 * words only come from a plain run of words, and taking the structure with them would
 * change what the query means.
 */
export function removeWords(value: string, words: readonly string[]): string {
	const gone = new Set(
		list(words)
			.slice(0, WORDS_MAX)
			.map((word) => normalizeWord(String(word))),
	)
	const removed = tokenize(value).filter(
		(token) =>
			isBare(token.text) &&
			!/[()]|^-/.test(token.text) &&
			gone.has(normalizeWord(token.text)),
	)
	if (removed.length === 0) return value
	// What is left between the removed words, joined by single spaces.
	const parts: string[] = []
	let cursor = 0
	for (const [index, token] of removed.entries()) {
		const between = value.slice(cursor, token.start)
		const piece = index === 0 ? between.trimEnd() : between.trim()
		if (piece) parts.push(piece)
		cursor = token.end
	}
	const tail = value.slice(cursor).trimStart()
	if (tail) parts.push(tail)
	return parts.join(' ').trim()
}

/** "a", "a and b", "a, b and c", "a, b, c and 2 more". */
export function naturalList(
	items: readonly string[],
	conjunction: 'and' | 'or',
	max = 4,
) {
	if (items.length <= 1) return items[0] ?? ''
	if (items.length > max)
		return `${items.slice(0, max).join(', ')} and ${items.length - max} more`
	return `${items.slice(0, -1).join(', ')} ${conjunction} ${items.at(-1)}`
}

const cleanWarnings = (warnings: readonly string[] | null | undefined) =>
	list(warnings).filter(
		(warning, index, all) =>
			typeof warning === 'string' &&
			warning.trim() !== '' &&
			all.indexOf(warning) === index,
	)

/**
 * Warnings for the text as typed. While the person is still typing the last word it is
 * left out: `tag:` or `color:bl` is a clause on its way, not a mistake, and parsing it
 * would flash an amber note on every operator. Null when the parser is unavailable.
 */
export function liveWarnings(
	value: string,
	typing: boolean,
	parse: (raw: string) => { warnings: string[] } = parseQuery,
): string[] | null {
	try {
		const parsed = parse(typing ? withoutLastToken(value) : value)
		return Array.isArray(parsed?.warnings) ? cleanWarnings(parsed.warnings) : null
	} catch {
		// A hint must never take the box down with it.
		return null
	}
}

/**
 * Live parsing is a hint, never the answer: while the box holds text the parser's own
 * words win, since they describe what is typed right now; the server's describe the
 * last search and are what is left when the box is empty or the parser is unavailable.
 */
export function pickWarnings(
	value: string,
	live: readonly string[] | null | undefined,
	fromServer: readonly string[],
): string[] {
	return cleanWarnings(
		value.trim() !== '' && Array.isArray(live) ? live : fromServer,
	)
}

export type Notes = {
	warnings: string[]
	correction: {
		showing: string[]
		originals: string[]
		/** The literal query, words quoted so they are not corrected again. */
		escape: string | null
	} | null
	dropped: {
		missing: string[]
		remaining: string[]
		/** The box without the missing words, or null when that would change nothing. */
		remove: string | null
		/** The box with the missing words quoted: they are required, so nothing is relaxed. */
		require: string | null
	} | null
}

/** Everything the lines under the box say, decided in one place so it can be tested without markup. */
export function buildNotes(input: {
	value: string
	warnings: readonly string[]
	corrections: readonly Correction[]
	dropped: readonly string[]
}): Notes {
	const warnings = cleanWarnings(input.warnings)
	// Corrections and dropped words describe the last search; with nothing typed they are old news.
	if (input.value.trim() === '')
		return { warnings, correction: null, dropped: null }

	const { showing, originals } = describeCorrections(input.corrections)
	const correction =
		showing.length > 0
			? {
					showing,
					originals,
					escape: searchInsteadQuery(input.value, input.corrections),
				}
			: null

	const { missing, remaining } = describeDropped(input.value, input.dropped)
	let dropped: Notes['dropped'] = null
	if (missing.length > 0) {
		const removed = removeWords(input.value, missing)
		dropped = {
			missing,
			remaining,
			remove: removed !== input.value && removed !== '' ? removed : null,
			require: quoteWords(input.value, missing),
		}
	}
	return { warnings, correction, dropped }
}

export const hasNotes = (notes: Notes) =>
	notes.warnings.length > 0 || notes.correction !== null || notes.dropped !== null

export const scopeText = (scope: { label: string; deep: boolean }) =>
	`in ${(typeof scope.label === 'string' && scope.label.trim()) || 'this folder'} ${scope.deep ? 'and subfolders' : 'only'}`

/**
 * The label as the chip should read. The parser writes a negated chip as `not tag: people`
 * or `not: kitchen`; the chip draws its own "not", so the words are taken off here and
 * never doubled (a leading `-` goes too).
 */
export const chipLabel = (chip: Pick<QueryChip, 'label' | 'negated'>) => {
	const label = typeof chip.label === 'string' ? chip.label : ''
	return chip.negated ? label.replace(/^(?:-|not:?\s+)/i, '') : label
}

/* -------------------------------------------------------------------------- */
/* Views                                                                      */
/* -------------------------------------------------------------------------- */

const ICONS: Record<OptionIcon, LucideIcon> = {
	tag: Tag,
	palette: Palette,
	type: FileImage,
	folder: Folder,
	added: CalendarDays,
	review: Sparkles,
}

const KIND_ICONS: Record<SearchOptionKind, LucideIcon> = {
	tag: Tag,
	folder: Folder,
	operator: ListFilter,
	value: Palette,
	search: Search,
	recent: History,
}

const focusRing =
	'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none'

function OptionRow({ option, active }: { option: SearchOption; active: boolean }) {
	const Icon = option.icon ? ICONS[option.icon] : KIND_ICONS[option.kind]
	const swatch = safeSwatch(option.swatch)
	const count =
		typeof option.count === 'number' &&
		Number.isFinite(option.count) &&
		option.count >= 0
			? option.count
			: null
	return (
		<>
			{swatch ? (
				<span
					aria-hidden
					className='size-3.5 shrink-0 rounded-full ring-1 ring-white/25'
					style={{ backgroundColor: swatch }}
				/>
			) : (
				<Icon
					aria-hidden
					className={cn(
						'size-4 shrink-0',
						active ? 'text-white' : 'text-slate-500',
					)}
				/>
			)}
			<span
				title={option.label}
				className={cn(
					'min-w-0 truncate',
					option.kind === 'operator' && !option.narrow
						? 'font-mono text-xs text-brand'
						: 'text-slate-200',
				)}>
				{option.kind === 'recent' ? clip(option.label, 80) : option.label}
			</span>
			{/* Flex items draw no space between them; the row's text needs one to read as words. */}
			{option.hint && (
				<>
					{' '}
					<span className='min-w-0 flex-1 truncate text-xs text-slate-400'>
						{option.hint}
					</span>
				</>
			)}
			{count !== null && (
				<>
					{' '}
					<span className='ml-auto shrink-0 text-xs tabular-nums text-slate-400'>
						{formatCount(count)}
					</span>
				</>
			)}
			{option.kind === 'search' && (
				<CornerDownLeft
					aria-hidden
					className='ml-auto size-3.5 shrink-0 text-slate-500'
				/>
			)}
		</>
	)
}

/** Consecutive options under one heading, so the markup groups what the flat list orders. */
function groupRuns(options: readonly SearchOption[]) {
	const runs: { group: string | null; items: { option: SearchOption; index: number }[] }[] = []
	options.forEach((option, index) => {
		const last = runs.at(-1)
		if (last && last.group === option.group && option.group !== null)
			last.items.push({ option, index })
		else runs.push({ group: option.group, items: [{ option, index }] })
	})
	return runs
}

/**
 * The listbox. Always in the DOM (hidden when closed) so the input's `aria-controls`
 * never points at nothing. Focus stays in the input; the highlight is
 * `aria-activedescendant`, and the mouse press is swallowed so clicking a row never
 * blurs the box (which would close the list before the click lands).
 */
export function SuggestionList({
	id,
	open,
	options,
	activeIndex,
	busy,
	onPick,
}: {
	id: string
	open: boolean
	options: readonly SearchOption[]
	activeIndex: number
	busy?: boolean
	onPick(index: number): void
}) {
	return (
		<div
			id={id}
			role='listbox'
			aria-label='Search suggestions'
			aria-busy={busy || undefined}
			hidden={!open}
			onMouseDown={(event) => event.preventDefault()}
			className='absolute inset-x-0 top-full z-30 mt-1.5 max-h-[min(24rem,60vh)] overflow-y-auto rounded-xl border border-white/10 bg-popover p-1.5 shadow-2xl'>
			{open &&
				groupRuns(options).map((run) => {
					const rows = run.items.map(({ option, index }) => (
						<div
							key={option.id}
							id={option.id}
							role='option'
							aria-selected={index === activeIndex}
							data-kind={option.kind}
							onClick={() => onPick(index)}
							className={cn(
								'relative flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm',
								// A bar as well as a tint: the highlight must not rest on color alone.
								index === activeIndex
									? 'bg-white/10 text-white before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand'
									: 'hover:bg-white/5',
							)}>
							<OptionRow option={option} active={index === activeIndex} />
						</div>
					))
					if (run.group === null)
						return (
							<div
								key={run.items[0].option.id}
								className={cn(
									options.length > 1 && 'mt-1 border-t border-white/10 pt-1',
								)}>
								{rows}
							</div>
						)
					return (
						<div key={run.group} role='group' aria-label={run.group}>
							<div
								aria-hidden
								className='px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500'>
								{run.group}
							</div>
							{rows}
						</div>
					)
				})}
		</div>
	)
}

export function ChipPill({
	chip,
	onRemove,
}: {
	chip: QueryChip
	onRemove(chip: QueryChip, event: MouseEvent<HTMLButtonElement>): void
}) {
	const label = chipLabel(chip)
	return (
		<li
			data-slot='search-chip'
			data-kind={chip.kind}
			data-negated={chip.negated || undefined}
			className={cn(
				'inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-0.5 text-xs',
				chip.negated
					? 'border-dashed border-rose-400/40 bg-rose-400/10 text-rose-200'
					: chip.kind === 'filter'
						? 'border-brand/30 bg-brand/10 text-brand'
						: 'border-white/10 bg-white/5 text-slate-200',
			)}>
			{chip.negated && (
				<>
					<span className='text-[10px] font-semibold uppercase tracking-wider opacity-80'>
						not
					</span>
					{/* Flex items draw no space between them; assistive tech and copy-paste need one. */}
					{' '}
				</>
			)}
			<span title={label} className='min-w-0 max-w-[16rem] truncate'>
				{label}
			</span>
			<button
				type='button'
				aria-label={`Remove ${chip.negated ? 'not ' : ''}${label}`}
				onClick={(event) => onRemove(chip, event)}
				className={cn(
					'grid size-6 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/15 motion-reduce:transition-none',
					focusRing,
				)}>
				<X aria-hidden className='size-3' />
			</button>
		</li>
	)
}

export function ScopePill({
	scope,
	onToggleDeep,
	onClear,
}: {
	scope: { label: string; deep: boolean }
	onToggleDeep(): void
	onClear(event: MouseEvent<HTMLButtonElement>): void
}) {
	return (
		<li
			data-slot='search-scope'
			className='inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 text-xs text-slate-200'>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label={`Search scope: ${scopeText(scope)}`}
					className={cn(
						'inline-flex min-h-6 min-w-0 cursor-pointer items-center gap-1 rounded-l-full py-1 pl-2.5 pr-1.5 transition-colors hover:bg-white/5 motion-reduce:transition-none',
						focusRing,
					)}>
					<span className='min-w-0 max-w-[18rem] truncate'>
						{scopeText(scope)}
					</span>
					<ChevronDown aria-hidden className='size-3 shrink-0 text-slate-500' />
				</DropdownMenuTrigger>
				<DropdownMenuContent align='start' className='w-60'>
					<DropdownMenuRadioGroup
						value={scope.deep ? 'deep' : 'only'}
						onValueChange={(next) => {
							if ((next === 'deep') !== scope.deep) onToggleDeep()
						}}>
						<DropdownMenuRadioItem value='deep'>
							This folder and its subfolders
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value='only'>
							This folder only
						</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<button
				type='button'
				aria-label='Search everywhere'
				onClick={onClear}
				className={cn(
					'mr-0.5 grid size-6 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/15 motion-reduce:transition-none',
					focusRing,
				)}>
				<X aria-hidden className='size-3' />
			</button>
		</li>
	)
}

const noteLink = cn(
	'cursor-pointer rounded text-brand underline-offset-2 hover:underline',
	focusRing,
)

const Em = ({ children }: { children: ReactNode }) => (
	<span className='font-medium text-slate-200'>{children}</span>
)

/** The lines under the box that say what the results are not, in plain words. */
export function SearchNotes({
	id,
	notes,
	onRun,
}: {
	id?: string
	notes: Notes
	/** A whole new text for the box, to commit at once. */
	onRun(query: string): void
}) {
	if (!hasNotes(notes)) return null
	const { warnings, correction, dropped } = notes
	const shown = warnings.slice(0, WARNINGS_SHOWN)
	return (
		<div id={id} data-slot='search-notes'>
			{shown.length > 0 && (
				<div
					data-slot='search-warnings'
					className='mt-2 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-xs leading-5 text-amber-200'>
					<TriangleAlert aria-hidden className='mt-0.5 size-3.5 shrink-0' />
					<ul className='min-w-0 space-y-0.5 wrap-break-word'>
						{shown.map((warning, index) => (
							<li key={`${index}:${warning}`}>{warning}</li>
						))}
						{warnings.length > shown.length && (
							<li>{`and ${warnings.length - shown.length} more`}</li>
						)}
					</ul>
				</div>
			)}
			{correction && (
				<p
					data-slot='search-corrections'
					className='mt-2 text-xs leading-5 text-slate-400'>
					<span>
						Showing results for <Em>{naturalList(correction.showing, 'and')}</Em>.
					</span>
					{correction.escape !== null && (
						<>
							{' '}
							<button
								type='button'
								onClick={() => onRun(correction.escape as string)}
								className={noteLink}>
								{`Search instead for ${naturalList(correction.originals, 'and')}`}
							</button>
						</>
					)}
				</p>
			)}
			{dropped && (
				<p
					data-slot='search-dropped'
					className='mt-2 text-xs leading-5 text-slate-400'>
					<span>
						No images mention <Em>{naturalList(dropped.missing, 'or')}</Em>.
						{dropped.remaining.length > 0 &&
							` Showing results for ${dropped.remaining.join(' ')}.`}
					</span>
					{dropped.require !== null && (
						<>
							{' '}
							<button
								type='button'
								onClick={() => onRun(dropped.require as string)}
								className={noteLink}>
								{dropped.missing.length === 1
									? `Must include ${dropped.missing[0]}`
									: 'Must include these words'}
							</button>
						</>
					)}
					{dropped.remove !== null && (
						<>
							{' '}
							<button
								type='button'
								onClick={() => onRun(dropped.remove as string)}
								className={noteLink}>
								{dropped.missing.length === 1
									? `Remove ${dropped.missing[0]}`
									: 'Remove these words'}
							</button>
						</>
					)}
				</p>
			)}
		</div>
	)
}

export function SaveSearch({ onSave }: { onSave(name: string): Promise<void> }) {
	const [open, setOpen] = useState(false)
	const [name, setName] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	// State updates are async; a double Enter must not send two saves.
	const inFlight = useRef(false)
	const fieldId = useId()

	const submit = async (event: FormEvent) => {
		event.preventDefault()
		if (inFlight.current) return
		const trimmed = name.trim()
		if (!trimmed) {
			setError('Give this search a name.')
			return
		}
		inFlight.current = true
		setBusy(true)
		setError(null)
		try {
			await onSave(trimmed)
			setOpen(false)
			setName('')
		} catch (caught) {
			setError(messageOf(caught, 'Could not save that search.'))
		} finally {
			inFlight.current = false
			setBusy(false)
		}
	}

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (busy && !next) return
				if (next) setError(null)
				setOpen(next)
			}}>
			<PopoverTrigger asChild>
				<Button
					type='button'
					variant='outline'
					size='sm'
					className='border-white/15 bg-transparent text-white hover:bg-white/5'>
					<BookmarkPlus aria-hidden /> Save search
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align='end'
				className='w-80 border-white/10 bg-popover p-3'>
				<form onSubmit={submit} className='space-y-3'>
					<div className='space-y-2'>
						<Label htmlFor={fieldId}>Name this search</Label>
						<Input
							id={fieldId}
							value={name}
							maxLength={MEDIA_LIMITS.savedSearchNameMax}
							placeholder='Kitchen photos'
							autoComplete='off'
							disabled={busy}
							aria-invalid={error ? true : undefined}
							aria-describedby={error ? `${fieldId}-error` : undefined}
							onChange={(event) => {
								setName(event.target.value)
								setError(null)
							}}
						/>
						<p className='text-xs text-slate-400'>
							Saves what you are searching for and the folder you are in.
						</p>
						{error && (
							<p
								id={`${fieldId}-error`}
								role='alert'
								className='text-xs text-destructive'>
								{error}
							</p>
						)}
					</div>
					<div className='flex justify-end gap-2'>
						<Button
							type='button'
							variant='ghost'
							size='sm'
							disabled={busy}
							onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							type='submit'
							size='sm'
							disabled={busy || name.trim() === ''}
							className='bg-brand font-bold text-ink hover:bg-brand-strong'>
							{busy && <Loader2 aria-hidden className='animate-spin' />} Save
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	)
}

const useIsoLayoutEffect =
	typeof window === 'undefined' ? useEffect : useLayoutEffect

function useMergedRef<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
	// The page's ref and ours must both see the element, and neither may change identity per render.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	return useCallback((node: T | null) => {
		for (const ref of refs) {
			if (typeof ref === 'function') ref(node)
			else if (ref) ref.current = node
		}
	}, refs)
}

type Anchor = { value: string; caret: number }

export function SearchBar(props: SearchBarProps) {
	const {
		loading,
		scope,
		canSave,
		onChange,
		onSubmit,
		onRemoveChip,
		onClearScope,
		onToggleScopeDeep,
		onClearAll,
		fetchSuggestions,
		onSave,
		inputRef,
	} = props
	const value = typeof props.value === 'string' ? props.value : ''
	// Chips come from the server's parse; one with nothing to read cannot be drawn or removed.
	const chips = list(props.chips).filter(
		(chip) =>
			chip !== null &&
			typeof chip === 'object' &&
			typeof chip.label === 'string' &&
			chip.label.trim() !== '',
	)
	const corrections = list(props.corrections)
	const dropped = list(props.dropped)
	const recent = list(props.recent)

	const baseId = useId()
	const listId = `${baseId}-list`
	const tipsId = `${baseId}-tips`
	const notesId = `${baseId}-notes`
	const optionPrefix = `${baseId}-opt-`

	const inputEl = useRef<HTMLInputElement | null>(null)
	const setInputRef = useMergedRef(inputEl, inputRef)
	const pendingCaret = useRef<number | null>(null)
	const quietFocus = useRef(false)
	const fetchRef = useRef(fetchSuggestions)

	const [open, setOpen] = useState(false)
	const [active, setActive] = useState(-1)
	const [focused, setFocused] = useState(false)
	const [snapshot, setSnapshot] = useState<SuggestionResult<Anchor> | null>(null)
	const [suggesting, setSuggesting] = useState(false)
	const [tipsOpen, setTipsOpen] = useState(false)
	/** The text last sent with Enter or an accepted suggestion: finished, so its warnings are worth showing. */
	const [committed, setCommitted] = useState<string | null>(null)

	const controllerRef = useRef<ReturnType<
		typeof createSuggestionController<Anchor>
	> | null>(null)
	if (controllerRef.current === null)
		controllerRef.current = createSuggestionController<Anchor>({
			fetch: (input, signal) => fetchRef.current(input, signal),
			onResult: (result) => {
				setSnapshot(result)
				setActive(-1)
			},
			onPending: setSuggesting,
		})
	const controller = controllerRef.current

	useEffect(() => {
		fetchRef.current = fetchSuggestions
	})
	useEffect(() => () => controller.cancel(), [controller])

	// The text after the caret is replaced programmatically; put the caret back where the edit left it.
	useIsoLayoutEffect(() => {
		const caret = pendingCaret.current
		const input = inputEl.current
		if (caret === null || !input) return
		pendingCaret.current = null
		if (document.activeElement === input) input.setSelectionRange(caret, caret)
	}, [value])

	const trimmed = value.trim()
	// An answer is only ever shown next to the exact text it was asked about.
	const answered = snapshot !== null && snapshot.meta.value === value
	const options = useMemo(
		() =>
			trimmed === ''
				? emptyOptions(recent, optionPrefix)
				: typedOptions(answered ? snapshot.suggestions : [], value, optionPrefix),
		[trimmed, recent, answered, snapshot, value, optionPrefix],
	)
	const expanded = open && options.length > 0
	const activeIndex = active >= 0 && active < options.length ? active : -1

	useEffect(() => {
		if (!expanded || activeIndex < 0) return
		document
			.getElementById(options[activeIndex].id)
			?.scrollIntoView?.({ block: 'nearest' })
	}, [expanded, activeIndex, options])

	const typing = focused && committed !== value && hasCompletableToken(value)
	const live = useMemo(() => liveWarnings(value, typing), [value, typing])
	const notes = useMemo(
		() =>
			buildNotes({
				value,
				warnings: pickWarnings(value, live, list(props.warnings)),
				corrections,
				dropped,
			}),
		[value, live, props.warnings, corrections, dropped],
	)
	const anyActive = chips.length > 0 || scope !== null || trimmed !== ''

	const requestSuggestions = (text: string, caret: number) =>
		controller.request(text.slice(0, clampCaret(text, caret)), {
			value: text,
			caret: clampCaret(text, caret),
		})

	const edit = (next: string, caret: number) => {
		pendingCaret.current = null
		setOpen(true)
		setActive(-1)
		onChange(next)
		requestSuggestions(next, caret)
	}

	const close = () => {
		setOpen(false)
		setActive(-1)
	}

	/** Say what the box holds and run it now. */
	const submitText = (text: string) => {
		controller.cancel()
		close()
		setCommitted(text)
		onSubmit(text)
	}

	/** A text that is a whole search by itself: show it, close the list and run it now. */
	const commit = (next: string) => {
		pendingCaret.current = next.length
		onChange(next)
		submitText(next)
	}

	const focusQuietly = () => {
		const input = inputEl.current
		if (!input || document.activeElement === input) return
		quietFocus.current = true
		input.focus()
		quietFocus.current = false
	}

	const accept = (option: SearchOption) => {
		if (option.kind === 'search') {
			submitText(value)
			return
		}
		if (option.kind === 'recent') {
			commit(option.insert)
			inputEl.current?.focus()
			return
		}
		const anchor: Anchor =
			trimmed === ''
				? { value: '', caret: 0 }
				: answered
					? snapshot.meta
					: { value, caret: inputEl.current?.selectionStart ?? value.length }
		const applied = applySuggestion(anchor.value, anchor.caret, option)
		// Nothing fits (the box is nearly full): leave everything as it is.
		if (!applied.applied) return
		pendingCaret.current = applied.caret
		onChange(applied.value)
		if (applied.keepEditing) {
			setOpen(true)
			setActive(-1)
			requestSuggestions(applied.value, applied.caret)
		} else {
			controller.cancel()
			close()
			setCommitted(applied.value)
			onSubmit(applied.value)
		}
		const input = inputEl.current
		input?.focus()
		// A text that did not change never re-runs the caret effect.
		if (input && applied.value === value) {
			pendingCaret.current = null
			input.setSelectionRange(applied.caret, applied.caret)
		}
	}

	const clearText = () => {
		pendingCaret.current = null
		controller.cancel()
		setActive(-1)
		onChange('')
	}

	const insertExample = (example: string) => {
		const next = appendExample(value, example)
		if (next === null) return
		controller.cancel()
		close()
		pendingCaret.current = next.length
		onChange(next)
		focusQuietly()
	}

	const afterKeyboardRemoval = (event: MouseEvent<HTMLButtonElement>) => {
		// detail is 0 for a keyboard click: that person just lost the button they were on. A tap must not raise the on-screen keyboard.
		if (event.detail === 0) focusQuietly()
	}

	const handleChange = (event: ChangeEvent<HTMLInputElement>) =>
		edit(
			event.target.value,
			event.target.selectionStart ?? event.target.value.length,
		)

	const handleFocus = () => {
		setFocused(true)
		if (quietFocus.current) return
		setOpen(true)
		if (trimmed !== '' && !answered) requestSuggestions(value, value.length)
	}

	const handleBlur = () => {
		setFocused(false)
		close()
		controller.cancel()
		pendingCaret.current = null
	}

	const handleClick = () => {
		if (open) return
		setOpen(true)
		if (trimmed !== '' && !answered)
			requestSuggestions(value, inputEl.current?.selectionStart ?? value.length)
	}

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		const decision = decideKey(
			{
				key: event.key,
				shiftKey: event.shiftKey,
				ctrlKey: event.ctrlKey,
				altKey: event.altKey,
				metaKey: event.metaKey,
				// Safari reports the Enter that ends a composition as keyCode 229 with isComposing already false.
				isComposing: event.nativeEvent.isComposing || event.keyCode === 229,
			},
			{ open: expanded, active: activeIndex, options, hasText: value !== '' },
		)
		if (decision.type === 'none') return
		event.preventDefault()
		switch (decision.type) {
			case 'open':
				setOpen(true)
				if (trimmed !== '' && !answered)
					requestSuggestions(value, inputEl.current?.selectionStart ?? value.length)
				break
			case 'move':
				setActive(decision.active)
				break
			case 'accept': {
				const option = options[decision.index]
				if (option) accept(option)
				break
			}
			case 'submit':
				submitText(value)
				break
			case 'close':
				close()
				break
			case 'clear':
				clearText()
				break
			case 'blur':
				inputEl.current?.blur()
				break
		}
	}

	return (
		<div
			data-slot='search-bar'
			role='search'
			aria-label='Media library'
			className='w-full'>
			<div className='relative'>
				<Search
					aria-hidden
					className='pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-500'
				/>
				<Input
					ref={setInputRef}
					type='text'
					role='combobox'
					aria-label='Search your media library'
					aria-autocomplete='list'
					aria-haspopup='listbox'
					aria-expanded={expanded}
					aria-controls={listId}
					aria-activedescendant={
						expanded && activeIndex >= 0 ? options[activeIndex].id : undefined
					}
					aria-describedby={hasNotes(notes) ? notesId : undefined}
					aria-busy={loading || undefined}
					autoComplete='off'
					autoCorrect='off'
					autoCapitalize='off'
					spellCheck={false}
					enterKeyHint='search'
					maxLength={MEDIA_LIMITS.queryMax}
					placeholder='Search your library: try tag:kitchen color:blue type:png added:7d'
					value={value}
					onChange={handleChange}
					onFocus={handleFocus}
					onBlur={handleBlur}
					onClick={handleClick}
					onKeyDown={handleKeyDown}
					className='h-12 rounded-xl border-white/10 bg-white/3 pr-24 pl-12 text-base text-white placeholder:text-slate-500 focus-visible:border-brand/60 focus-visible:ring-brand/20 md:text-base'
				/>
				<div className='absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1'>
					{loading && (
						<Loader2
							aria-hidden
							className='size-4 animate-spin text-slate-500 motion-reduce:animate-none'
						/>
					)}
					{value !== '' && (
						<button
							type='button'
							aria-label='Clear search'
							// Keep focus (and the on-screen keyboard) in the box.
							onMouseDown={(event) => event.preventDefault()}
							onClick={clearText}
							className={cn(
								'grid size-7 cursor-pointer place-items-center rounded-md text-slate-500 transition-colors hover:bg-white/10 hover:text-white motion-reduce:transition-none',
								focusRing,
							)}>
							<X aria-hidden className='size-4' />
						</button>
					)}
					{value === '' && !focused && (
						<kbd
							aria-hidden
							className='rounded border border-white/15 px-1.5 text-[11px] leading-5 text-slate-500 [@media(hover:none)]:hidden'>
							/
						</kbd>
					)}
				</div>
				<SuggestionList
					id={listId}
					open={expanded}
					options={options}
					activeIndex={activeIndex}
					busy={suggesting}
					onPick={(index) => {
						const option = options[index]
						if (option) accept(option)
					}}
				/>
			</div>

			<div className='mt-2 flex min-h-8 flex-wrap items-center gap-x-2 gap-y-2'>
				{anyActive && (
					<ul
						aria-label='Active filters'
						data-slot='search-chips'
						className='flex min-w-0 flex-wrap items-center gap-1.5'>
						{chips.map((chip) => (
							<ChipPill
								key={`${chip.key}:${chip.start}`}
								chip={chip}
								onRemove={(target, event) => {
									onRemoveChip(target)
									afterKeyboardRemoval(event)
								}}
							/>
						))}
						{scope && (
							<ScopePill
								scope={scope}
								onToggleDeep={onToggleScopeDeep}
								onClear={(event) => {
									onClearScope()
									afterKeyboardRemoval(event)
								}}
							/>
						)}
						<li>
							<Button
								type='button'
								variant='ghost'
								size='xs'
								onClick={(event) => {
									onClearAll()
									afterKeyboardRemoval(event)
								}}
								className='text-slate-400 hover:bg-transparent hover:text-white'>
								Clear all
							</Button>
						</li>
					</ul>
				)}
				<div className='ml-auto flex items-center gap-1'>
					{canSave && <SaveSearch onSave={onSave} />}
					<Button
						type='button'
						variant='ghost'
						size='sm'
						aria-expanded={tipsOpen}
						aria-controls={tipsOpen ? tipsId : undefined}
						onClick={() => setTipsOpen((current) => !current)}
						className='text-slate-400 hover:bg-white/5 hover:text-white'>
						<Lightbulb aria-hidden /> Search tips
					</Button>
				</div>
			</div>

			<SearchNotes id={notesId} notes={notes} onRun={commit} />

			{tipsOpen && (
				<SearchTips id={tipsId} onPick={insertExample} className='mt-3' />
			)}
		</div>
	)
}
