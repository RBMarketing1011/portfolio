/**
 * Search box text -> AST. Pure and client safe: the search bar uses it too, to
 * draw chips as you type. See `./types.ts` for the language.
 *
 * Never throws and never refuses. Anything it cannot understand becomes a
 * warning and is dropped, or is read as plain text, so a half-typed query still
 * searches.
 *
 * It is one hand-rolled scanner over character offsets (no big regex over the
 * whole input) feeding an explicit stack of group frames, so nothing recurses on
 * user input and 10,000 parentheses cost the same as 10,000 words.
 */
import { resolveColorName } from '../colors'
import { normalizeText, slugify, STOPWORDS } from '../text'
import {
	MEDIA_FORMATS,
	MEDIA_KINDS,
	MEDIA_LIMITS,
	MEDIA_ORIENTATIONS,
	MEDIA_SORTS,
} from '../types'
import type { MediaSort, QueryChip } from '../types'
import { IS_FLAGS, QUERY_FIELDS } from './types'
import type { Comparison, ParsedQuery, QueryNode } from './types'

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/** Values in one comma list. More only inflate an `$in`; the rest are ignored. */
const MAX_VALUES = 50
/** A word longer than this cannot be an index token (see RUN_MAX in text.ts) and only costs time. */
const MAX_WORD = 100
/** Parts of one hyphenated word or quoted phrase. */
const MAX_PARTS = 32
/** Hostile input must not turn into an unbounded warning list. */
const MAX_WARNINGS = 20

const MAX_DEPTH = MEDIA_LIMITS.queryMaxDepth

const TOO_COMPLEX = 'Query too complex, extra grouping ignored.'

type FieldName = Exclude<(typeof QUERY_FIELDS)[number], 'sort'>

const FIELD_SET: ReadonlySet<string> = new Set(QUERY_FIELDS)
/** One value per image, so two ANDed clauses would match nothing: merge them. */
const MERGE_FIELDS: ReadonlySet<string> = new Set(['type', 'orientation', 'kind'])
/** Fields whose values may carry a trailing `*`. */
const PREFIX_FIELDS: ReadonlySet<string> = new Set(['tag', 'name', 'caption', 'text'])
const TEXT_FIELDS: ReadonlySet<string> = new Set(['name', 'caption', 'text'])
const NUMERIC_FIELDS: ReadonlySet<string> = new Set(['width', 'height', 'size', 'added'])

/* -------------------------------------------------------------------------- */
/* Characters                                                                 */
/* -------------------------------------------------------------------------- */

const QUOTE = 34
const STAR = 42
const COMMA = 44
const OPEN = 40
const CLOSE = 41
const DASH = 45
const HASH = 35

/**
 * Whitespace for tokenising: ASCII controls too, so a stray NUL or bell separates
 * words instead of gluing two of them together.
 */
function isSpace(code: number): boolean {
	if (code <= 32) return true
	if (code < 127) return false
	return (
		code <= 160 ||
		code === 0x1680 ||
		(code >= 0x2000 && code <= 0x200a) ||
		code === 0x2028 ||
		code === 0x2029 ||
		code === 0x202f ||
		code === 0x205f ||
		code === 0x3000 ||
		code === 0xfeff
	)
}

/** What a warning may echo of the person's text: short, no control characters. */
function echo(text: string): string {
	const clean = text.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim()
	return clean.length > 40 ? `${clean.slice(0, 40)}...` : clean
}

/* -------------------------------------------------------------------------- */
/* Enumerated values                                                          */
/* -------------------------------------------------------------------------- */

type EnumDef = {
	noun: string
	values: readonly string[]
	aliases: ReadonlyMap<string, string>
	/** `kind:photos` -> `photo`. */
	plural: boolean
}

const ENUMS: Record<string, EnumDef> = {
	type: {
		noun: 'type',
		values: MEDIA_FORMATS,
		aliases: new Map([
			['jpeg', 'jpg'],
			['jpe', 'jpg'],
			['jfif', 'jpg'],
		]),
		plural: true,
	},
	orientation: {
		noun: 'orientation',
		values: MEDIA_ORIENTATIONS,
		aliases: new Map([
			['wide', 'landscape'],
			['horizontal', 'landscape'],
			['tall', 'portrait'],
			['vertical', 'portrait'],
			['squared', 'square'],
			['panoramic', 'panorama'],
			['pano', 'panorama'],
		]),
		plural: true,
	},
	kind: {
		noun: 'kind',
		values: MEDIA_KINDS,
		aliases: new Map([
			['photograph', 'photo'],
			['picture', 'photo'],
			['pic', 'photo'],
			['drawing', 'illustration'],
			['art', 'illustration'],
			['artwork', 'illustration'],
		]),
		plural: true,
	},
	is: {
		noun: 'flag',
		values: IS_FLAGS,
		aliases: new Map([
			['alpha', 'transparent'],
			['bright', 'light'],
			['vibrant', 'vivid'],
			['colorful', 'vivid'],
			['grayscale', 'monochrome'],
			['greyscale', 'monochrome'],
			['bw', 'monochrome'],
			['needsreview', 'unreviewed'],
			['processing', 'pending'],
		]),
		plural: false,
	},
	sort: {
		noun: 'sort order',
		values: MEDIA_SORTS,
		aliases: new Map([
			['recent', 'newest'],
			['latest', 'newest'],
			['new', 'newest'],
			['old', 'oldest'],
			['az', 'name'],
			['a-z', 'name'],
			['alpha', 'name'],
			['alphabetical', 'name'],
			['za', 'name-desc'],
			['z-a', 'name-desc'],
			['biggest', 'largest'],
			['big', 'largest'],
			['large', 'largest'],
			['small', 'smallest'],
			['pixels', 'dimensions'],
			['resolution', 'dimensions'],
			['dimension', 'dimensions'],
			['best', 'relevance'],
			['match', 'relevance'],
		]),
		plural: false,
	},
}

/** A canonical value, the candidates when a prefix is ambiguous, or null when unknown. */
function resolveEnum(def: EnumDef, input: string): string | string[] | null {
	const text = input.trim().toLowerCase()
	if (!text) return null
	const direct = (word: string): string | null => {
		if (def.values.includes(word)) return word
		return def.aliases.get(word) ?? null
	}
	const found = direct(text)
	if (found) return found
	if (def.plural && text.length > 2 && text.endsWith('s')) {
		const single = direct(text.slice(0, -1))
		if (single) return single
	}
	// Unique-prefix completion. Aliases count, but only the canonical value they
	// stand for, so `jp` is one candidate (jpg), not two.
	const candidates = new Set<string>()
	for (const value of def.values) if (value.startsWith(text)) candidates.add(value)
	for (const [alias, value] of def.aliases) if (alias.startsWith(text)) candidates.add(value)
	if (candidates.size === 1) return [...candidates][0]
	if (candidates.size > 1) {
		const list = [...candidates]
		// `sort:na` is `name` even though `name-desc` also starts with it.
		const shortest = list.find((one) => list.every((other) => other.startsWith(one)))
		return shortest ?? list
	}
	return null
}

/* -------------------------------------------------------------------------- */
/* Items                                                                      */
/* -------------------------------------------------------------------------- */

type Kind = 'term' | 'phrase' | 'filter'

/**
 * One parsed clause, or a whole group, with everything a chip needs. `node` is
 * null only for `sort:`, which has a chip and no AST node.
 */
type Item = {
	node: QueryNode | null
	/** Binding strength, for parenthesising the canonical text: or 1, and 2, atom 3. */
	prec: 1 | 2 | 3
	/** Canonical text without grouping parentheses of its own. */
	canon: string
	neg: boolean
	/** The un-negated item, so a second negation can hand it back. */
	inner?: Item
	start: number
	end: number
	kind: Kind
	label: string
	field?: string
	values?: string[]
	/** Free text, a phrase or a name/caption/text clause is inside. */
	text: boolean
}

const canonAt = (item: Item, prec: 1 | 2 | 3): string =>
	item.prec < prec ? `(${item.canon})` : item.canon

/** `NOT x`, with `NOT NOT x` becoming `x`. `start`/`end` cover the markers too. */
function negate(item: Item, start: number, end: number): Item {
	if (item.neg && item.inner) return { ...item.inner, start, end }
	const node: QueryNode = {
		type: 'not',
		node: item.node as QueryNode,
		start,
		end,
	}
	return {
		node,
		prec: 3,
		canon: `-${canonAt(item, 3)}`,
		neg: true,
		inner: item,
		start,
		end,
		kind: item.kind,
		label: `${item.kind === 'filter' ? 'not ' : 'not: '}${item.label}`,
		field: item.field,
		values: item.values,
		text: item.text,
	}
}

function spanOf(items: Item[]): { start: number; end: number } {
	let start = Number.POSITIVE_INFINITY
	let end = 0
	for (const item of items) {
		if (item.start < start) start = item.start
		if (item.end > end) end = item.end
	}
	return { start, end }
}

/** Items ANDed together; nested `and` children are flattened into one node. */
function andItem(items: Item[]): Item {
	const nodes: QueryNode[] = []
	let text = false
	for (const item of items) {
		const node = item.node as QueryNode
		if (node.type === 'and') for (const child of node.nodes) nodes.push(child)
		else nodes.push(node)
		if (item.text) text = true
	}
	const canon = items.map((item) => canonAt(item, 2)).join(' ')
	const { start, end } = spanOf(items)
	return {
		node: { type: 'and', nodes },
		prec: 2,
		canon,
		neg: false,
		start,
		end,
		kind: text ? 'term' : 'filter',
		label: `(${canon})`,
		text,
	}
}

/** Items ORed together; nested `or` children are flattened into one node. */
function orItem(items: Item[]): Item {
	const nodes: QueryNode[] = []
	let text = false
	for (const item of items) {
		const node = item.node as QueryNode
		if (node.type === 'or') for (const child of node.nodes) nodes.push(child)
		else nodes.push(node)
		if (item.text) text = true
	}
	const canon = items.map((item) => canonAt(item, 1)).join(' OR ')
	const { start, end } = spanOf(items)
	return {
		node: { type: 'or', nodes },
		prec: 1,
		canon,
		neg: false,
		start,
		end,
		kind: text ? 'term' : 'filter',
		label: `(${canon})`,
		text,
	}
}

/** `a b OR c` is two alternatives; each alternative is the AND of its items. */
function combine(alternatives: Item[][]): Item | null {
	const parts: Item[] = []
	for (const items of alternatives) {
		if (items.length === 0) continue
		parts.push(items.length === 1 ? items[0] : andItem(items))
	}
	if (parts.length === 0) return null
	return parts.length === 1 ? parts[0] : orItem(parts)
}

function chipOf(item: Item, label?: string): QueryChip {
	const clause = canonAt(item, 3)
	const chip: QueryChip = {
		key: clause,
		kind: item.kind,
		label: label ?? item.label,
		clause,
		negated: item.neg,
		start: item.start,
		end: item.end,
	}
	if (item.kind === 'filter' && item.field) {
		chip.field = item.field
		chip.values = item.values ?? []
	}
	return chip
}

/* -------------------------------------------------------------------------- */
/* Value scanning                                                             */
/* -------------------------------------------------------------------------- */

type ValueItem = {
	text: string
	quoted: boolean
	/** A trailing `*`. */
	star: boolean
	/** Raw offsets of the item, quotes and star included. */
	start: number
	end: number
}

type ScannedValue = {
	items: ValueItem[]
	/** Just past the last character the value consumed. */
	end: number
	unclosed: boolean
	overflow: boolean
}

/**
 * The comma list after `field:` or `#`. An item is a bare run (up to whitespace,
 * a comma, a parenthesis or a quote) or a "quoted string" that may hold spaces,
 * commas and colons. An unclosed quote runs to the end of the input.
 */
function scanValue(raw: string, from: number): ScannedValue {
	const n = raw.length
	const items: ValueItem[] = []
	let overflow = false
	let unclosed = false
	let j = from
	let end = from
	const push = (item: ValueItem) => {
		if (!item.text.trim()) return
		if (items.length >= MAX_VALUES) overflow = true
		else items.push(item)
	}
	while (j < n) {
		const code = raw.charCodeAt(j)
		if (code === COMMA) {
			j++
			end = j
			continue
		}
		if (isSpace(code) || code === OPEN || code === CLOSE) break
		if (code === QUOTE) {
			const close = raw.indexOf('"', j + 1)
			let text: string
			let stop: number
			let star = false
			if (close < 0) {
				text = raw.slice(j + 1)
				stop = n
				unclosed = true
			} else {
				text = raw.slice(j + 1, close)
				stop = close + 1
				if (raw.charCodeAt(stop) === STAR) {
					star = true
					stop++
				}
			}
			push({ text, quoted: true, star, start: j, end: stop })
			j = stop
			end = stop
		} else {
			let k = j
			while (k < n) {
				const c = raw.charCodeAt(k)
				if (isSpace(c) || c === COMMA || c === OPEN || c === CLOSE || c === QUOTE) break
				k++
			}
			let text = raw.slice(j, k)
			let star = false
			while (text.endsWith('*')) {
				text = text.slice(0, -1)
				star = true
			}
			push({ text, quoted: false, star, start: j, end: k })
			j = k
			end = k
		}
		if (j < n && raw.charCodeAt(j) === COMMA) {
			j++
			end = j
			continue
		}
		break
	}
	return { items, end, unclosed, overflow }
}

/* -------------------------------------------------------------------------- */
/* Value normalisation                                                        */
/* -------------------------------------------------------------------------- */

type Normalised = { value: string } | { error: 'unknown' | 'ambiguous' | 'empty'; options?: string[] }

/** Words of a normalised string, bounded so hostile input stays cheap. */
function boundedWords(text: string): string[] {
	const words = normalizeText(text).split(' ').filter(Boolean)
	return words.slice(0, MAX_PARTS).map((word) => (word.length > MAX_WORD ? word.slice(0, MAX_WORD) : word))
}

function normalizeValue(field: string, text: string): Normalised {
	switch (field) {
		case 'tag': {
			const slug = slugify(text.length > 400 ? text.slice(0, 400) : text)
			return slug ? { value: slug } : { error: 'empty' }
		}
		case 'name':
		case 'caption':
		case 'text': {
			const words = boundedWords(text)
			return words.length ? { value: words.join(' ') } : { error: 'empty' }
		}
		case 'folder': {
			const path = text
				.replace(/[\p{Cc}"]/gu, ' ')
				.split(/[\\/]/)
				.map((part) => part.trim().replace(/\s+/g, ' '))
				.filter(Boolean)
				.join('/')
				.slice(0, 400)
			if (!path) return { error: 'empty' }
			const lower = path.toLowerCase()
			return { value: lower === 'none' || lower === 'unfiled' ? 'unfiled' : path }
		}
		case 'color': {
			const name = resolveColorName(text)
			return name ? { value: name } : { error: 'unknown' }
		}
		default: {
			const def = ENUMS[field]
			if (!def) return { error: 'unknown' }
			// `type:.png` is a natural way to write it.
			const result = resolveEnum(def, field === 'type' ? text.replace(/^\./, '') : text)
			return typeof result === 'string'
				? { value: result }
				: result
					? { error: 'ambiguous', options: result }
					: { error: 'unknown' }
		}
	}
}

const BARE_VALUE = /^[^\s,()"*]+$/

/** A value as it is written back: quoted only when it has to be. */
function writeValue(value: string, star: boolean): string {
	const body = BARE_VALUE.test(value) ? value : `"${value}"`
	return star ? `${body}*` : body
}

/* -------------------------------------------------------------------------- */
/* Numbers and dates                                                          */
/* -------------------------------------------------------------------------- */

type Resolved = { canon: string; label: string; cmp: Comparison }

const SIZE_UNITS: Record<string, number> = {
	'': 1,
	b: 1,
	kb: 1024,
	mb: 1024 ** 2,
	gb: 1024 ** 3,
}
const PIXEL_UNITS: Record<string, number> = { '': 1, px: 1 }
const MAX_NUMBER = 1e15

const OPERATOR = /^(>=|<=|>|<|=)?([\s\S]*)$/
const OP_NAME: Record<string, 'gt' | 'gte' | 'lt' | 'lte' | 'eq'> = {
	'>': 'gt',
	'>=': 'gte',
	'<': 'lt',
	'<=': 'lte',
	'=': 'eq',
}
const OP_SYMBOL = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=' } as const

type Quantity = { value: number; text: string; unit: string }

/** `2`, `1.5mb`, `1200px` as a number in base units, or null. */
function readQuantity(text: string, units: Record<string, number>, fallbackUnit = ''): Quantity | null {
	const match = /^(\d+(?:\.\d+)?)([a-z]*)$/.exec(text)
	if (!match) return null
	const unit = match[2] || fallbackUnit
	if (!Object.prototype.hasOwnProperty.call(units, unit)) return null
	const value = Number(match[1]) * units[unit]
	if (!Number.isFinite(value) || value > MAX_NUMBER) return null
	return { value, text: match[1] + unit, unit: match[2] }
}

function trimNumber(value: number): string {
	return String(Math.round(value * 100) / 100)
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 ** 3) return `${trimNumber(bytes / 1024 ** 3)} GB`
	if (bytes >= 1024 ** 2) return `${trimNumber(bytes / 1024 ** 2)} MB`
	if (bytes >= 1024) return `${trimNumber(bytes / 1024)} KB`
	return `${trimNumber(bytes)} B`
}

/** `width:>1200`, `size:500kb..2mb`, `height:<=600`. Dimensions are pixels, sizes bytes. */
function resolveNumeric(field: 'width' | 'height' | 'size', input: string): Resolved | null {
	const text = input.trim().toLowerCase()
	const units = field === 'size' ? SIZE_UNITS : PIXEL_UNITS
	const show = (value: number) => (field === 'size' ? formatBytes(value) : trimNumber(value))
	const parsed = OPERATOR.exec(text)
	if (!parsed) return null
	const op = parsed[1]
	const rest = parsed[2]

	if (!op) {
		const dots = rest.indexOf('..')
		if (dots >= 0) {
			const leftText = rest.slice(0, dots)
			const rightText = rest.slice(dots + 2)
			if (!leftText && !rightText) return null
			const right = rightText ? readQuantity(rightText, units) : null
			if (rightText && !right) return null
			// `1..2mb` reads as 1mb to 2mb: nobody means one byte.
			const left = leftText ? readQuantity(leftText, units, right?.unit ?? '') : null
			if (leftText && !left) return null
			if (left && right) {
				const [low, high] = left.value <= right.value ? [left, right] : [right, left]
				// A bare number in a size range is written `b`, so the swap cannot change its unit.
				const written = (one: Quantity) =>
					field === 'size' && !/[a-z]$/.test(one.text) ? `${one.text}b` : one.text
				return {
					canon: `${field}:${written(low)}..${written(high)}`,
					label: `${field} ${show(low.value)} to ${show(high.value)}`,
					cmp: { op: 'range', from: low.value, to: high.value },
				}
			}
			if (left) {
				return {
					canon: `${field}:${left.text}..`,
					label: `${field} >= ${show(left.value)}`,
					cmp: { op: 'gte', value: left.value },
				}
			}
			const only = right as Quantity
			return {
				canon: `${field}:..${only.text}`,
				label: `${field} <= ${show(only.value)}`,
				cmp: { op: 'lte', value: only.value },
			}
		}
	}

	const quantity = readQuantity(rest, units)
	if (!quantity) return null
	const name = op ? OP_NAME[op] : 'eq'
	return {
		canon: `${field}:${op && name !== 'eq' ? op : ''}${quantity.text}`,
		label: `${field} ${OP_SYMBOL[name]} ${show(quantity.value)}`,
		cmp: { op: name, value: quantity.value },
	}
}

const DAY = 86_400_000

type DatePoint = {
	from: number
	to: number
	/** Its own words in a label: `2026-03-01`, `today`, `7 days ago`. */
	desc: string
	/** A single point in the past rather than a calendar period. */
	relative: boolean
	/** The whole clause's label when it stands alone. */
	label: string
}

function shiftMonths(now: number, months: number): number {
	const date = new Date(now)
	const total = date.getUTCFullYear() * 12 + date.getUTCMonth() - months
	const year = Math.floor(total / 12)
	const month = total - year * 12
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
	return Date.UTC(
		year,
		month,
		Math.min(date.getUTCDate(), lastDay),
		date.getUTCHours(),
		date.getUTCMinutes(),
		date.getUTCSeconds(),
		date.getUTCMilliseconds(),
	)
}

const period = (from: number, to: number, desc: string, label: string): DatePoint => ({
	from,
	to,
	desc,
	relative: false,
	label,
})

/** One date word: a calendar period (inclusive ms bounds, UTC) or a relative point. */
function readDate(text: string, now: number): DatePoint | null {
	const today = Math.floor(now / DAY) * DAY
	const clock = new Date(now)
	switch (text) {
		case 'today':
			return period(today, today + DAY - 1, 'today', 'today')
		case 'yesterday':
			return period(today - DAY, today - 1, 'yesterday', 'yesterday')
		case 'week': {
			// Calendar week, Monday first.
			const start = today - ((clock.getUTCDay() + 6) % 7) * DAY
			return period(start, start + 7 * DAY - 1, 'this week', 'this week')
		}
		case 'month': {
			const year = clock.getUTCFullYear()
			const month = clock.getUTCMonth()
			return period(Date.UTC(year, month, 1), Date.UTC(year, month + 1, 1) - 1, 'this month', 'this month')
		}
		case 'year': {
			const year = clock.getUTCFullYear()
			return period(Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1) - 1, 'this year', 'this year')
		}
	}

	let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
	if (match) {
		const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
		const start = Date.UTC(year, month - 1, day)
		const check = new Date(start)
		if (year < 1000 || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
		return period(start, start + DAY - 1, text, `on ${text}`)
	}
	match = /^(\d{4})-(\d{2})$/.exec(text)
	if (match) {
		const [year, month] = [Number(match[1]), Number(match[2])]
		if (year < 1000 || month < 1 || month > 12) return null
		return period(Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1) - 1, text, `in ${text}`)
	}
	match = /^(\d{4})$/.exec(text)
	if (match) {
		const year = Number(match[1])
		if (year < 1000) return null
		return period(Date.UTC(year, 0, 1), Date.UTC(year + 1, 0, 1) - 1, text, `in ${text}`)
	}
	match = /^(\d{1,4})([dwmy])$/.exec(text)
	if (match) {
		const count = Number(match[1])
		const unit = match[2]
		let point: number
		let word: string
		if (unit === 'd') {
			point = now - count * DAY
			word = 'day'
		} else if (unit === 'w') {
			point = now - count * 7 * DAY
			word = 'week'
		} else if (unit === 'm') {
			if (count > 1200) return null
			point = shiftMonths(now, count)
			word = 'month'
		} else {
			if (count > 200) return null
			point = shiftMonths(now, count * 12)
			word = 'year'
		}
		if (!Number.isFinite(point)) return null
		const desc = `${count} ${word}${count === 1 ? '' : 's'} ago`
		return { from: point, to: point, desc, relative: true, label: `since ${desc}` }
	}
	return null
}

/**
 * `added:2026-03-01`, `added:>2026-01-01`, `added:7d`, `added:a..b`. A calendar
 * period is a range over its whole UTC day/month/year; `>` is after the period
 * ends, `<` before it starts. A relative `7d` is a point in the past and a bare
 * one means "since": `added:7d` is the last seven days.
 */
function resolveDate(input: string, now: number): Resolved | null {
	const text = input.trim().toLowerCase()
	const parsed = OPERATOR.exec(text)
	if (!parsed) return null
	const op = parsed[1]
	const rest = parsed[2]

	if (!op) {
		const dots = rest.indexOf('..')
		if (dots >= 0) {
			const leftText = rest.slice(0, dots)
			const rightText = rest.slice(dots + 2)
			if (!leftText && !rightText) return null
			const left = leftText ? readDate(leftText, now) : null
			const right = rightText ? readDate(rightText, now) : null
			if ((leftText && !left) || (rightText && !right)) return null
			if (left && right) {
				const swap = left.from > right.to
				const low = swap ? right : left
				const high = swap ? left : right
				return {
					canon: `added:${swap ? `${rightText}..${leftText}` : `${leftText}..${rightText}`}`,
					label: `added ${low.desc} to ${high.desc}`,
					cmp: { op: 'range', from: low.from, to: high.to },
				}
			}
			if (left) {
				return {
					canon: `added:${leftText}..`,
					label: `added from ${left.desc}`,
					cmp: { op: 'gte', value: left.from },
				}
			}
			const only = right as DatePoint
			return {
				canon: `added:..${rightText}`,
				label: `added up to ${only.desc}`,
				cmp: { op: 'lte', value: only.to },
			}
		}
	}

	const date = readDate(rest, now)
	if (!date) return null
	const name = op ? OP_NAME[op] : 'eq'
	const canon = `added:${op && name !== 'eq' ? op : ''}${rest}`
	switch (name) {
		case 'gt':
			return { canon, label: `added after ${date.desc}`, cmp: { op: 'gt', value: date.relative ? date.from : date.to } }
		case 'gte':
			return {
				canon,
				label: date.relative ? `added since ${date.desc}` : `added on or after ${date.desc}`,
				cmp: { op: 'gte', value: date.from },
			}
		case 'lt':
			return { canon, label: `added before ${date.desc}`, cmp: { op: 'lt', value: date.from } }
		case 'lte':
			return {
				canon,
				label: `added on or before ${date.desc}`,
				cmp: { op: 'lte', value: date.relative ? date.from : date.to },
			}
		default:
			return date.relative
				? { canon, label: `added ${date.label}`, cmp: { op: 'gte', value: date.from } }
				: { canon, label: `added ${date.label}`, cmp: { op: 'range', from: date.from, to: date.to } }
	}
}

/* -------------------------------------------------------------------------- */
/* Field suggestions                                                          */
/* -------------------------------------------------------------------------- */

function distance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
	for (let i = 1; i <= a.length; i++) {
		const row = [i]
		for (let j = 1; j <= b.length; j++) {
			row[j] = Math.min(
				previous[j] + 1,
				row[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			)
		}
		previous = row
	}
	return previous[b.length]
}

/** The known field a mistyped one most likely meant: within edit distance 2 (1 for a two-letter guess, none for one letter). */
function closestField(word: string): string | null {
	const lower = word.toLowerCase()
	if (lower.length < 2 || lower.length > 20) return null
	let best: string | null = null
	let bestDistance = lower.length === 2 ? 2 : 3
	for (const field of QUERY_FIELDS) {
		const gap = distance(lower, field)
		if (gap < bestDistance) {
			best = field
			bestDistance = gap
		}
	}
	return best
}

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

type Frame = {
	/** Finished OR alternatives of this group. */
	alts: Item[][]
	/** The alternative being filled. */
	cur: Item[]
	/** Where the group (and any negation marker before it) began. */
	start: number
	neg: boolean
}

type Run = {
	root: Item | null
	chips: QueryChip[]
	warnings: string[]
	sort: MediaSort | null
	hasText: boolean
	/** Stopword terms dropped (so the caller can retry keeping them). */
	droppedStop: number
	flattened: boolean
	/** Start of a trailing dangling operator (`OR`, `NOT`, a lone `-`), or -1. */
	cut: number
	/** What closes whatever is still open: a quote, then parentheses. */
	closers: string
	/** The span of a top-level OR expression, which is one chip, or null. */
	orSpan: { start: number; end: number } | null
}

function run(raw: string, now: number, keepStop: boolean, cap: number): Run {
	const n = raw.length
	const messages: string[] = []
	const seen = new Set<string>()
	const warn = (message: string) => {
		if (messages.length >= MAX_WARNINGS || seen.has(message)) return
		seen.add(message)
		messages.push(message)
	}

	let sort: MediaSort | null = null
	let droppedStop = 0
	let flattened = false
	let unclosedQuote = false
	let dangling = -1
	let negOdd = false
	let negAny = false
	let negStart = -1
	/** Flattened (non-negated) group opens still waiting for their `)`. */
	let flat = 0
	/** Depth inside a flattened NEGATED group, whose contents are discarded. */
	let skip = 0

	const frames: Frame[] = [{ alts: [], cur: [], start: 0, neg: false }]
	/** Every top-level clause in order, `sort:` included: the chips. */
	const topItems: Item[] = []

	let trimmedEnd = n
	while (trimmedEnd > 0 && isSpace(raw.charCodeAt(trimmedEnd - 1))) trimmedEnd--

	const takeNeg = () => {
		const state = { odd: negOdd, any: negAny, start: negStart }
		negOdd = false
		negAny = false
		negStart = -1
		return state
	}
	const markNeg = (at: number) => {
		if (!negAny) negStart = at
		negAny = true
		negOdd = !negOdd
		if (dangling < 0) dangling = at
	}

	/** Puts a finished clause (or null for a dropped one) into the current group. */
	const place = (item: Item | null, neg: { odd: boolean; any: boolean; start: number }, start: number, end: number) => {
		dangling = -1
		if (!item || skip > 0) return
		const from = neg.any ? neg.start : start
		const placed = neg.odd ? negate(item, from, end) : { ...item, start: from, end }
		if (placed.node) frames[frames.length - 1].cur.push(placed)
		if (frames.length === 1) topItems.push(placed)
	}

	const finishGroup = (frame: Frame, closeEnd: number) => {
		dangling = -1
		const body = combine([...frame.alts, frame.cur])
		if (!body) return
		const placed = frame.neg
			? negate(body, frame.start, closeEnd)
			: { ...body, start: frame.start, end: closeEnd }
		frames[frames.length - 1].cur.push(placed)
		if (frames.length === 1) topItems.push(placed)
	}

	/* ---- clause builders ------------------------------------------------ */

	const wordItem = (text: string, start: number, end: number): Item | null => {
		let body = text
		let prefix = false
		while (body.endsWith('*')) {
			body = body.slice(0, -1)
			prefix = true
		}
		const parts = boundedWords(body)
		if (parts.length === 0) return null
		if (parts.length === 1) {
			const word = parts[0]
			if (!prefix && !keepStop && STOPWORDS.has(word)) {
				droppedStop++
				return null
			}
			return {
				node: { type: 'term', text: word, prefix, start, end },
				prec: 3,
				canon: prefix ? `${word}*` : word,
				neg: false,
				start,
				end,
				kind: 'term',
				label: prefix ? `${word}*` : word,
				text: true,
			}
		}
		// A star on a hyphenated word has nothing to attach to; the phrase stands.
		const phrase = parts.join(' ')
		return {
			node: { type: 'phrase', text: phrase, implicit: true, start, end },
			prec: 3,
			canon: parts.join('-'),
			neg: false,
			start,
			end,
			kind: 'phrase',
			label: `"${phrase}"`,
			text: true,
		}
	}

	const phraseItem = (text: string, start: number, end: number): Item | null => {
		const parts = boundedWords(text)
		if (parts.length === 0) return null
		const phrase = parts.join(' ')
		return {
			node: { type: 'phrase', text: phrase, start, end },
			prec: 3,
			canon: `"${phrase}"`,
			neg: false,
			start,
			end,
			kind: 'phrase',
			label: `"${phrase}"`,
			text: true,
		}
	}

	/** `tag:`, `type:`, `is:` ... with a list of values. Null when nothing usable is left. */
	const listItem = (field: FieldName, items: ValueItem[], start: number, end: number): Item | null => {
		const prefixOk = PREFIX_FIELDS.has(field)
		const values: string[] = []
		const stars = new Map<string, boolean>()
		for (const item of items) {
			const result = normalizeValue(field, item.text)
			if ('error' in result) {
				const shown = echo(item.text)
				if (result.error === 'empty') warn(`Nothing to search for in "${shown}", so it was ignored.`)
				else if (result.error === 'ambiguous')
					warn(`"${shown}" is ambiguous for ${ENUMS[field]?.noun ?? field} (${(result.options ?? []).join(', ')}) and was ignored.`)
				else warn(`Unknown ${ENUMS[field]?.noun ?? field} "${shown}" was ignored.`)
				continue
			}
			if (!stars.has(result.value)) values.push(result.value)
			stars.set(result.value, (stars.get(result.value) ?? false) || (prefixOk && item.star))
		}
		if (values.length === 0) return null

		const make = (list: string[], prefix: boolean): QueryNode => ({
			type: 'field',
			field,
			values: list,
			...(prefix ? { prefix: true } : {}),
			start,
			end,
		})
		const starred = values.filter((value) => stars.get(value))
		const plain = values.filter((value) => !stars.get(value))
		let node: QueryNode
		if (starred.length === 0) node = make(values, false)
		else if (plain.length === 0) node = make(values, true)
		// `tag:kit*,bath` is a prefix AND an exact tag: an OR of the two shapes.
		else node = { type: 'or', nodes: [make(starred, true), make(plain, false)] }

		const canon = `${field}:${values.map((value) => writeValue(value, stars.get(value) === true)).join(',')}`
		const shown = values.map((value) => (stars.get(value) ? `${value}*` : value)).join(', ')
		return {
			node,
			prec: 3,
			canon,
			neg: false,
			start,
			end,
			kind: 'filter',
			label: `${field}: ${shown}`,
			field,
			values,
			text: TEXT_FIELDS.has(field),
		}
	}

	const numericItem = (field: 'width' | 'height' | 'size' | 'added', items: ValueItem[], start: number, end: number): Item | null => {
		if (items.length > 1) {
			warn(`${field}: takes one value or a range, so "${echo(items.map((item) => item.text).join(','))}" was ignored.`)
			return null
		}
		const text = items[0].text
		const resolved = field === 'added' ? resolveDate(text, now) : resolveNumeric(field, text)
		if (!resolved) {
			warn(`Could not read ${field} value "${echo(text)}", so it was ignored.`)
			return null
		}
		return {
			node: { type: 'field', field, values: [], cmp: resolved.cmp, start, end },
			prec: 3,
			canon: resolved.canon,
			neg: false,
			start,
			end,
			kind: 'filter',
			label: resolved.label,
			field,
			values: [],
			text: false,
		}
	}

	/** A `field:value` clause starting at `start`, whose value begins at `valueStart`. Returns where scanning resumes. */
	const fieldClause = (field: string, start: number, valueStart: number): number => {
		const scanned = scanValue(raw, valueStart)
		if (scanned.unclosed) unclosedQuote = true
		const neg = takeNeg()
		const end = scanned.end
		if (skip > 0) {
			dangling = -1
			return end
		}
		if (scanned.items.length === 0) {
			warn(`"${field}:" has no value, so it was ignored.`)
			place(null, neg, start, end)
			return end
		}
		if (scanned.overflow) warn(`Only the first ${MAX_VALUES} values were used.`)

		if (field === 'sort') {
			let chosen: string | null = null
			for (const item of scanned.items) {
				const result = resolveEnum(ENUMS.sort, item.text)
				if (typeof result === 'string') chosen = result
				else warn(`Unknown sort order "${echo(item.text)}" was ignored.`)
			}
			if (chosen && neg.odd) {
				warn('A sort order cannot be negated, so it was ignored.')
				chosen = null
			}
			if (!chosen) {
				place(null, neg, start, end)
				return end
			}
			sort = chosen as MediaSort
			dangling = -1
			if (frames.length === 1) {
				topItems.push({
					node: null,
					prec: 3,
					canon: `sort:${chosen}`,
					neg: false,
					start: neg.any ? neg.start : start,
					end,
					kind: 'filter',
					label: `sort: ${chosen}`,
					field: 'sort',
					values: [chosen],
					text: false,
				})
			}
			return end
		}

		const name = field as FieldName
		const item = NUMERIC_FIELDS.has(name)
			? numericItem(name as 'width' | 'height' | 'size' | 'added', scanned.items, start, end)
			: listItem(name, scanned.items, start, end)
		place(item, neg, start, end)
		return end
	}

	/* ---- the scan ------------------------------------------------------- */

	let i = 0
	while (i < n) {
		const code = raw.charCodeAt(i)
		if (isSpace(code)) {
			i++
			continue
		}

		if (code === OPEN) {
			const neg = takeNeg()
			dangling = -1
			if (skip > 0) skip++
			else if (frames.length - 1 >= cap) {
				flattened = true
				if (neg.odd) skip = 1
				else flat++
			} else {
				frames.push({ alts: [], cur: [], start: neg.any ? neg.start : i, neg: neg.odd })
			}
			i++
			continue
		}

		if (code === CLOSE) {
			takeNeg()
			dangling = -1
			if (skip > 0) skip--
			else if (flat > 0) flat--
			else if (frames.length > 1) {
				const frame = frames.pop() as Frame
				finishGroup(frame, i + 1)
			}
			i++
			continue
		}

		if (code === QUOTE) {
			const close = raw.indexOf('"', i + 1)
			let text: string
			let end: number
			if (close < 0) {
				text = raw.slice(i + 1)
				end = n
				unclosedQuote = true
			} else {
				text = raw.slice(i + 1, close)
				end = close + 1
			}
			const neg = takeNeg()
			place(skip > 0 ? null : phraseItem(text, i, end), neg, i, end)
			i = end
			continue
		}

		if (code === DASH) {
			const next = i + 1 < n ? raw.charCodeAt(i + 1) : 32
			// A `-` followed by whitespace or the end is nothing; attached, it negates.
			if (isSpace(next)) {
				if (dangling < 0) dangling = i
			} else markNeg(i)
			i++
			continue
		}

		if (code === HASH) {
			const next = i + 1 < n ? raw.charCodeAt(i + 1) : 32
			if (isSpace(next) || next === OPEN || next === CLOSE) {
				i++
				continue
			}
			i = fieldClause('tag', i, i + 1)
			continue
		}

		// A bare word: up to whitespace, a parenthesis or a quote.
		let j = i
		while (j < n) {
			const c = raw.charCodeAt(j)
			if (isSpace(c) || c === OPEN || c === CLOSE || c === QUOTE) break
			j++
		}
		const word = raw.slice(i, j)

		if (word === 'OR') {
			takeNeg()
			if (dangling < 0) dangling = i
			const frame = frames[frames.length - 1]
			// A leading, doubled or trailing OR has nothing on one side: skip it.
			if (skip === 0 && frame.cur.length > 0) {
				frame.alts.push(frame.cur)
				frame.cur = []
			}
			i = j
			continue
		}
		if (word === 'NOT') {
			markNeg(i)
			i = j
			continue
		}

		const colon = word.indexOf(':')
		if (colon > 0) {
			const prefix = word.slice(0, colon)
			const lower = prefix.toLowerCase()
			if (/^[A-Za-z]+$/.test(prefix) && FIELD_SET.has(lower)) {
				i = fieldClause(lower, i, i + colon + 1)
				continue
			}
			// Not a field. Warn only when it looks like a mistyped one: letters, then
			// a value that starts like a word (`colour:red`, not `10:30` or `http://x`).
			const after = colon + 1 < word.length ? word[colon + 1] : raw[j] === '"' ? '"' : ''
			if (skip === 0 && /^\p{L}+$/u.test(prefix) && /^[\p{L}\p{N}"]/u.test(after)) {
				const guess = closestField(prefix)
				warn(
					`Unknown filter "${echo(prefix)}:" was read as plain text.${guess ? ` Did you mean "${guess}:"?` : ''}`,
				)
			}
		}

		const neg = takeNeg()
		place(skip > 0 ? null : wordItem(word, i, j), neg, i, j)
		i = j
	}

	// Whatever is still open ends at the end of the input.
	const open = frames.length - 1 + flat + (skip > 0 ? 1 : 0)
	const cut = dangling
	while (frames.length > 1) {
		const frame = frames.pop() as Frame
		finishGroup(frame, Math.max(trimmedEnd, frame.start + 1))
	}
	const top = frames[0]
	const alternatives = [...top.alts, top.cur].filter((items) => items.length > 0)
	const root = combine(alternatives)

	let chips: QueryChip[]
	let orSpan: { start: number; end: number } | null = null
	if (alternatives.length >= 2 && root) {
		// A top-level OR is one clause: its pieces are not independent filters.
		const span = spanOf(alternatives.flat())
		orSpan = span
		const only: Item = { ...root, start: span.start, end: span.end }
		const chip = chipOf(only, root.canon)
		chip.clause = root.canon
		chip.key = root.canon
		chips = [chip]
		for (const item of topItems) {
			if (item.node === null && (item.end <= span.start || item.start >= span.end)) chips.push(chipOf(item))
		}
		chips.sort((a, b) => a.start - b.start)
	} else {
		chips = topItems.map((item) => chipOf(item))
	}

	return {
		root,
		chips,
		warnings: messages,
		sort,
		hasText: root?.text ?? false,
		droppedStop,
		flattened,
		cut,
		closers: (unclosedQuote ? '"' : '') + ')'.repeat(open),
		orSpan,
	}
}

/** How many and/or/not levels deep a tree is. Bounded by the group cap, so recursion is shallow. */
function depthOf(node: QueryNode | null): number {
	if (!node) return 0
	if (node.type === 'and' || node.type === 'or') {
		let deepest = 0
		for (const child of node.nodes) deepest = Math.max(deepest, depthOf(child))
		return deepest + 1
	}
	if (node.type === 'not') return depthOf(node.node) + 1
	return 0
}

type Analysis = {
	parsed: ParsedQuery
	cut: number
	closers: string
	orSpan: { start: number; end: number } | null
}

function analyse(input: unknown, opts?: { now?: Date }): Analysis {
	const raw = typeof input === 'string' ? input : ''
	const given = opts?.now
	const now = given instanceof Date && Number.isFinite(given.getTime()) ? given.getTime() : Date.now()

	let result: Run | null = null
	let cap = MAX_DEPTH
	for (; cap >= 0; cap--) {
		let attempt = run(raw, now, false, cap)
		// Dropping stopwords must not leave a query with nothing to search for.
		if (!attempt.hasText && attempt.droppedStop > 0) attempt = run(raw, now, true, cap)
		result = attempt
		if (depthOf(attempt.root?.node ?? null) <= MAX_DEPTH) break
	}
	const final = result as Run
	if ((final.flattened || cap < MAX_DEPTH) && !final.warnings.includes(TOO_COMPLEX)) {
		final.warnings.push(TOO_COMPLEX)
	}
	return {
		parsed: {
			raw,
			ast: final.root?.node ?? null,
			chips: final.chips,
			warnings: final.warnings,
			sort: final.sort,
			hasText: final.hasText,
		},
		cut: final.cut,
		closers: final.closers,
		orSpan: final.orSpan,
	}
}

/**
 * Tokenises (words, "quoted phrases", `field:value`, `#tag`, `-negation`, `NOT`,
 * `OR`, parentheses) and parses with the precedence NOT > AND (adjacency) > OR.
 *
 * Rules:
 *  - Operators are case-insensitive (`TAG:Kitchen`); `OR` and `NOT` are only
 *    operators in capitals, so a lowercase "or" is an ordinary (stop) word.
 *  - `field:value` takes a bare word, a "quoted value", or a comma list
 *    (`type:png,jpg`). A trailing `*` makes a tag or word a prefix.
 *  - Enumerated values are matched case-insensitively with aliases (`jpeg` ->
 *    `jpg`, `grey` -> `gray`) and unique-prefix completion (`color:pur`). An
 *    unknown value is a warning (`Unknown type "xyz" was ignored.`) and the
 *    clause is dropped.
 *  - Numeric fields accept `>`, `>=`, `<`, `<=`, `=` (or bare), and `a..b`; sizes
 *    take b/kb/mb/gb (1024-based, decimals allowed). Dates take `YYYY-MM-DD`,
 *    `YYYY-MM`, `YYYY`, `today`, `yesterday`, `week`, `month`, `year`, and relative
 *    `7d`/`2w`/`3m`/`1y`; resolved against `opts.now` into the inclusive ms
 *    boundaries described on `Comparison`. Days are UTC.
 *  - A `-` is negation ONLY when it begins a token and is directly followed by a
 *    non-space. A `-`, `_` or `.` INSIDE a word (`kitchen-remodel`, `t-shirt`) is a
 *    separator: the token becomes an implicit PHRASE of its parts
 *    (`{ type: 'phrase', implicit: true }`), one chip covering the whole token. A
 *    single part (`4k`, `h2o`) stays a `term`.
 *  - An unknown `field:` is read as plain text and warned about, naming the closest
 *    known field when one is within edit distance 2; a colon in a word that is not
 *    an operator (`10:30`, `http://x`) is plain text without a warning. An empty
 *    value (`tag:`) is dropped with a warning.
 *  - A dangling operator (`kitchen OR`, an unclosed `(` or quote) is repaired, not
 *    rejected.
 *  - `sort:` sets `ParsedQuery.sort` and produces no node; `chips` still shows it.
 *  - Complexity bound: group nesting deeper than MEDIA_LIMITS.queryMaxDepth (8) is
 *    FLATTENED into the enclosing group with one warning ("Query too complex, extra
 *    grouping ignored."). Single-child `and`/`or` collapse to the child, `NOT NOT x`
 *    becomes `x`, and nested `and`-in-`and` / `or`-in-`or` flatten, so the plan can
 *    never be deeper than the cap. Linear time on any input, including 10,000
 *    characters of `(`.
 *  - `chips` holds one chip per TOP-LEVEL clause (a group like `(a OR b)` is one
 *    chip) with exact `start`/`end` offsets into `raw` such that removing
 *    `raw.slice(start, end)` removes that clause cleanly. `filter` chips carry
 *    `field` and `values` (the comma list, normalised).
 *  - Free-text words that are stopwords are dropped from the AST (not from
 *    phrases), unless doing so would leave a query with no text at all, in which
 *    case they are kept.
 *  - `hasText` is true when any term, phrase, or name/caption/text clause exists,
 *    anywhere in the tree.
 *
 * Decisions the language table leaves open:
 *  - A top-level `OR` makes the whole expression ONE chip (`kitchen OR bath blue`
 *    is `kitchen OR (bath AND blue)`; its pieces are not independent filters).
 *  - A dropped clause (unknown value, empty value, stopword) has no chip: it has
 *    no effect, so there is nothing to remove. Its warning says what happened.
 *  - `added:week|month|year` are the current UTC calendar periods; `7d`/`2w`/`3m`/
 *    `1y` are points in the past and a bare one means "since" (`added:7d` is the
 *    last seven days). `>` and `<` compare with that point, like a date.
 *  - A mixed prefix list (`tag:kit*,bath`) is an OR of two field nodes under one chip.
 */
export function parseQuery(raw: string, opts?: { now?: Date }): ParsedQuery {
	return analyse(raw, opts).parsed
}

/* -------------------------------------------------------------------------- */
/* Editing                                                                    */
/* -------------------------------------------------------------------------- */

const offset = (value: unknown, length: number): number | null => {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null
	return Math.min(length, Math.max(0, Math.floor(value)))
}

/**
 * The query with one chip's clause removed, whitespace tidied. Used by the chip's
 * close button. Pure string surgery on `raw` by the chip's offsets.
 */
export function removeClause(
	raw: string,
	chip: { start: number; end: number },
): string {
	const text = typeof raw === 'string' ? raw : ''
	const start = offset(chip?.start, text.length)
	const end = offset(chip?.end, text.length)
	if (start === null || end === null || end < start) return text
	const left = text.slice(0, start).trimEnd()
	const right = text.slice(end).trimStart()
	return left && right ? `${left} ${right}` : left || right
}

/**
 * Takes ONE value out of a comma-list chip (`type:png,jpg` minus `jpg` becomes
 * `type:png`), removing the whole chip when it was the last value. For a chip
 * without a comma list this is `removeClause`. Used when a facet toggle is
 * switched off.
 */
export function removeClauseValue(
	raw: string,
	chip: Pick<QueryChip, 'start' | 'end' | 'field' | 'values' | 'negated'>,
	value: string,
): string {
	const text = typeof raw === 'string' ? raw : ''
	const values = chip?.values ?? []
	if (!chip?.field || values.length < 2 || typeof value !== 'string') return removeClause(text, chip)
	const start = offset(chip.start, text.length)
	const end = offset(chip.end, text.length)
	if (start === null || end === null || end < start) return text

	// Work on the chip's own text so quoting and stars on the other values survive.
	const slice = text.slice(start, end)
	let from = 0
	for (;;) {
		if (slice.charCodeAt(from) === DASH) from++
		else if (/^NOT\s/.test(slice.slice(from))) from += 3
		else if (from < slice.length && isSpace(slice.charCodeAt(from))) from++
		else break
	}
	let valueStart: number
	if (slice.charCodeAt(from) === HASH) valueStart = from + 1
	else {
		const head = /^[A-Za-z]+:/.exec(slice.slice(from))
		if (!head) return removeClause(text, chip)
		valueStart = from + head[0].length
	}

	const scanned = scanValue(slice, valueStart)
	const field = chip.field
	const target = normalizeValue(field, value)
	const wanted = 'value' in target ? target.value : value.trim().toLowerCase()
	const kept: string[] = []
	let removed = false
	for (const item of scanned.items) {
		const result = normalizeValue(field, item.text)
		const same = 'value' in result ? result.value === wanted : item.text.trim().toLowerCase() === wanted
		if (same) removed = true
		else kept.push(slice.slice(item.start, item.end))
	}
	if (!removed) return text
	if (kept.length === 0) return removeClause(text, chip)
	const rebuilt = slice.slice(0, valueStart) + kept.join(',') + slice.slice(scanned.end)
	return text.slice(0, start) + rebuilt + text.slice(end)
}

/** `folder:Clients/Acme Co` -> `folder:"Clients/Acme Co"`: a value with spaces needs its quotes. */
function quoteClause(clause: string): string {
	const match = /^(-?[A-Za-z]+:)([\s\S]+)$/.exec(clause)
	if (!match) return clause
	const value = match[2].trim()
	if (!/\s/.test(value) || value.startsWith('"')) return clause
	return `${match[1]}"${value.replace(/"/g, '')}"`
}

/**
 * Appends `clause` (e.g. `tag:kitchen`) to a query, unless an identical clause is
 * already there; quotes the value when it contains spaces. Used by facets.
 *
 * For the SINGLE-VALUED fields `type`, `orientation` and `kind` ONLY: if the query
 * already has a (non-negated) clause for that field, the new value is merged into
 * its comma list (`type:png` + `type:jpg` -> `type:png,jpg`; no duplicate values).
 * Two such clauses ANDed would match nothing (an image has one format). Every other
 * field appends and stays an AND: `color:blue color:green` means both are dominant.
 *
 * A clause that says nothing (an unknown value, a stopword) adds nothing. Appending
 * first repairs the end of the query (a dangling `OR`, an unclosed quote or group),
 * so the new clause is never swallowed by, or joined to, something half-typed.
 */
export function addClause(raw: string, clause: string): string {
	const text = typeof raw === 'string' ? raw : ''
	const wanted = typeof clause === 'string' ? quoteClause(clause.trim()) : ''
	if (!wanted) return text

	const current = analyse(text)
	const added = parseQuery(wanted)
	if (added.chips.length === 0) return text
	const single = added.chips.length === 1 ? added.chips[0] : null

	if (single && current.parsed.chips.some((chip) => chip.clause === single.clause)) return text

	if (single && single.kind === 'filter' && !single.negated && single.field && MERGE_FIELDS.has(single.field) && single.values?.length) {
		const target = current.parsed.chips.find(
			(chip) => chip.kind === 'filter' && !chip.negated && chip.field === single.field && (chip.values?.length ?? 0) > 0,
		)
		if (target) {
			const existing = target.values ?? []
			const merged = [...existing]
			for (const one of single.values) if (!merged.includes(one)) merged.push(one)
			if (merged.length === existing.length) return text
			return `${text.slice(0, target.start)}${single.field}:${merged.join(',')}${text.slice(target.end)}`
		}
	}

	let base = (current.cut >= 0 ? text.slice(0, current.cut) : text).trimEnd() + current.closers
	if (current.orSpan) {
		// `a OR b` + `x` would read as `a OR (b x)`: group the OR so the new clause ANDs the whole.
		const from = current.orSpan.start
		const to = current.closers ? base.length : Math.min(current.orSpan.end, base.length)
		base = `${base.slice(0, from)}(${base.slice(from, to)})${base.slice(to)}`
	}
	return base ? `${base} ${wanted}` : wanted
}

/* -------------------------------------------------------------------------- */
/* Relaxation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The free-text words of a query that is nothing but 2 or more bare free-text
 * terms ANDed together (no OR, NOT, phrase, group or field clause); null for any
 * other shape. Only such a query may be relaxed (see `searchAssets`).
 */
export function relaxableTerms(parsed: ParsedQuery): string[] | null {
	const ast = parsed?.ast
	if (!ast || ast.type !== 'and' || ast.nodes.length < 2) return null
	const chips = parsed.chips
	if (chips.length !== ast.nodes.length) return null
	const words: string[] = []
	for (let index = 0; index < ast.nodes.length; index++) {
		const node = ast.nodes[index]
		const chip = chips[index]
		if (node.type !== 'term' || node.prefix) return null
		// A group's terms are flattened into the AND but its chip starts with `(`.
		if (chip.kind !== 'term' || chip.negated || chip.clause !== node.text) return null
		words.push(node.text)
	}
	return words
}

/** The same query without the term nodes whose words are listed. Chips and offsets are rebuilt for what remains. */
export function dropTerms(parsed: ParsedQuery, words: string[]): ParsedQuery {
	const wanted = new Set((Array.isArray(words) ? words : []).map((word) => String(word).toLowerCase()))
	const removed = parsed.chips.filter(
		(chip) =>
			chip.kind === 'term' &&
			!chip.negated &&
			/^[^\s()"-][^\s()"]*$/.test(chip.clause) &&
			wanted.has(chip.clause.replace(/\*+$/, '').toLowerCase()),
	)
	if (removed.length === 0) return parsed

	// The new raw keeps what lies between the removed spans, tidied to single spaces
	// at each seam; `shift` maps an old offset to its place in it.
	const pieces: { from: number; to: number; at: number }[] = []
	let cursor = 0
	let text = ''
	const take = (from: number, to: number) => {
		let a = from
		let b = to
		while (a < b && isSpace(parsed.raw.charCodeAt(a))) a++
		while (b > a && isSpace(parsed.raw.charCodeAt(b - 1))) b--
		if (a >= b) return
		if (text) text += ' '
		pieces.push({ from: a, to: b, at: text.length })
		text += parsed.raw.slice(a, b)
	}
	for (const chip of removed) {
		take(cursor, chip.start)
		cursor = chip.end
	}
	take(cursor, parsed.raw.length)
	const shift = (position: number): number => {
		for (const piece of pieces) {
			if (position >= piece.from && position <= piece.to) return piece.at + position - piece.from
		}
		return 0
	}

	const inside = (node: { start: number; end: number }) =>
		removed.some((chip) => node.start >= chip.start && node.end <= chip.end)

	const rebuild = (node: QueryNode): QueryNode | null => {
		switch (node.type) {
			case 'term':
				return inside(node) ? null : { ...node, start: shift(node.start), end: shift(node.end) }
			case 'phrase':
				return { ...node, start: shift(node.start), end: shift(node.end) }
			case 'field':
				return { ...node, start: shift(node.start), end: shift(node.end) }
			case 'not': {
				const child = rebuild(node.node)
				return child ? { ...node, node: child, start: shift(node.start), end: shift(node.end) } : null
			}
			case 'and':
			case 'or': {
				const nodes: QueryNode[] = []
				for (const child of node.nodes) {
					const kept = rebuild(child)
					if (kept) nodes.push(kept)
				}
				if (nodes.length === 0) return null
				return nodes.length === 1 ? nodes[0] : { ...node, nodes }
			}
		}
	}

	const ast = parsed.ast ? rebuild(parsed.ast) : null
	const chips = parsed.chips
		.filter((chip) => !removed.includes(chip))
		.map((chip) => ({ ...chip, start: shift(chip.start), end: shift(chip.end) }))
	return {
		raw: text,
		ast,
		chips,
		warnings: parsed.warnings,
		sort: parsed.sort,
		hasText: hasTextIn(ast),
	}
}

function hasTextIn(node: QueryNode | null): boolean {
	if (!node) return false
	switch (node.type) {
		case 'term':
		case 'phrase':
			return true
		case 'field':
			return TEXT_FIELDS.has(node.field)
		case 'not':
			return hasTextIn(node.node)
		default:
			return node.nodes.some(hasTextIn)
	}
}
