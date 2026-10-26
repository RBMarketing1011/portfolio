/** Prose HTML helpers. Pure and environment neutral: no React, no browser APIs. */

/** The editor stores HTML; older blocks stored `##`-prefixed plain text. */
export function isProseHtml(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/<(p|h[1-6]|ul|ol|blockquote|hr|pre)\b/i.test(value)
	)
}

/** Long enough for any article; a cut tag is repaired like any other broken markup. */
const MAX_LENGTH = 20000

// Deep enough for lists inside quotes inside lists; nobody authors more, so deeper tags are dropped.
const MAX_DEPTH = 64

/** Removed together with everything inside them: code, embedded documents, foreign markup, form controls. */
const DROP_WITH_CONTENT = new Set([
	'script',
	'style',
	'iframe',
	'object',
	'embed',
	'template',
	'noscript',
	'textarea',
	'title',
	'svg',
	'math',
	'select',
	'xmp',
	'noembed',
	'noframes',
	'plaintext',
])

// Foreign markup honours `/>`; an HTML element ignores it and keeps going to its closing tag.
const FOREIGN = new Set(['svg', 'math'])

// h5 and h6 stay: the editor offers them and the prose block styles them.
const ALLOWED = new Set([
	'p',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'strong',
	'b',
	'em',
	'i',
	'u',
	's',
	'code',
	'pre',
	'blockquote',
	'ul',
	'ol',
	'li',
	'br',
	'hr',
	'a',
])

const VOID = new Set(['br', 'hr'])

/** Opening one of these inside an open paragraph or heading closes it, as a browser would. */
const BLOCK = new Set(['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'ul', 'ol', 'li', 'hr'])

const HEADING = /^h[1-6]$/

/** What `rel` may say. The editor's links carry `noopener noreferrer nofollow`. */
const REL_TOKENS = new Set(['nofollow', 'noopener', 'noreferrer', 'ugc', 'sponsored'])

// HTML's own whitespace: a vertical tab or a no-break space is part of a name, not a gap.
const SPACE = /[\t\n\f\r ]/
const NAME_START = /[A-Za-z]/
const NAME_END = /[\t\n\f\r />]/

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const SAFE_SCHEME = /^(?:https?|mailto|tel):/i

// The named references worth reading in a link; any other is re-escaped, so it stays inert text.
const NAMED: Record<string, string> = {
	amp: '&',
	AMP: '&',
	lt: '<',
	LT: '<',
	gt: '>',
	GT: '>',
	quot: '"',
	QUOT: '"',
	apos: "'",
	nbsp: ' ',
	colon: ':',
	Tab: '\t',
	NewLine: '\n',
}

const codePoint = (value: number) =>
	value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
		? String.fromCodePoint(value)
		: '�'

/** One pass, as a browser decodes an attribute: numeric references with or without `;`. */
const decode = (value: string) =>
	value.replace(
		/&(?:#(\d+);?|#[xX]([0-9a-fA-F]+);?|([A-Za-z][A-Za-z0-9]*);)/g,
		(match, decimal?: string, hex?: string, name?: string) => {
			if (decimal !== undefined) return codePoint(Number(decimal))
			if (hex !== undefined) return codePoint(parseInt(hex, 16))
			return name !== undefined && Object.hasOwn(NAMED, name) ? NAMED[name] : match
		},
	)

const escapeAttribute = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')

/** `<` and `>` always; `&` unless it already begins a well-formed reference. */
const escapeText = (text: string) =>
	text.replace(
		/[<>]|&(?:[A-Za-z][A-Za-z0-9]*|#\d+|#[xX][0-9A-Fa-f]+);|&/g,
		(match) =>
			match === '<' ? '&lt;' : match === '>' ? '&gt;' : match === '&' ? '&amp;' : match,
	)

/**
 * The href exactly as a browser would follow it, or null. Spaces and control characters
 * are what hide a scheme (`java\tscript:`), so none survive; only web, mail and phone
 * links or scheme-less paths pass.
 */
function cleanHref(value: string) {
	const href = decode(value).replace(/[\u0000- \u007f-\u009f\s]+/g, '')
	if (SCHEME.test(href) && !SAFE_SCHEME.test(href)) return null
	return href
}

type Attribute = [name: string, value: string]

/** The attributes an allowed tag keeps, in the order they were written. */
function attributesOf(tag: string, attrs: Attribute[]) {
	// A browser uses the first of any repeated attribute.
	const first = new Map<string, string>()
	for (const [name, value] of attrs) if (!first.has(name)) first.set(name, value)

	if (tag === 'ol') {
		const start = first.has('start') ? decode(first.get('start')!).trim() : ''
		return /^\d{1,6}$/.test(start) ? ` start="${start}"` : ''
	}
	if (tag !== 'a') return ''

	const kept: Attribute[] = []
	let blank = false
	for (const [name, raw] of first) {
		if (name === 'href') {
			const href = cleanHref(raw)
			if (href !== null) kept.push(['href', href])
		} else if (name === 'target') {
			if (decode(raw).trim().toLowerCase() === '_blank') {
				kept.push(['target', '_blank'])
				blank = true
			}
		} else if (name === 'rel') kept.push(['rel', decode(raw)])
	}

	// A new tab must never hand the opener to the page it opens.
	const rel = kept.find(([name]) => name === 'rel')
	const tokens = rel
		? [...new Set(rel[1].toLowerCase().split(/[\t\n\f\r ]+/).filter((token) => REL_TOKENS.has(token)))]
		: []
	if (blank) for (const token of ['noopener', 'noreferrer']) if (!tokens.includes(token)) tokens.push(token)
	if (rel) rel[1] = tokens.join(' ')
	else if (tokens.length) kept.push(['rel', tokens.join(' ')])

	return kept
		.filter(([name, value]) => name !== 'rel' || value)
		.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
		.join('')
}

type Tag = {
	kind: 'open' | 'close'
	name: string
	attrs: Attribute[]
	selfClosing: boolean
	end: number
}

/**
 * Reads attributes the way a browser's tokenizer does, from just after the tag name to
 * the `>` that ends the tag. Null when the input ends first: the tag never closes.
 */
function readAttributes(input: string, from: number) {
	const attrs: Attribute[] = []
	let selfClosing = false
	let at = from
	while (at < input.length) {
		const char = input[at]
		if (char === '>') return { attrs, selfClosing, end: at + 1 }
		if (SPACE.test(char) || char === '/') {
			selfClosing = char === '/' && input[at + 1] === '>'
			at++
			continue
		}
		selfClosing = false
		// A name runs to whitespace, `/`, `>` or `=`; an `=` in first place is part of it.
		let stop = at + 1
		while (stop < input.length && !/[\t\n\f\r />=]/.test(input[stop])) stop++
		const name = input.slice(at, stop).toLowerCase()
		at = stop
		let next = at
		while (next < input.length && SPACE.test(input[next])) next++
		if (input[next] !== '=') {
			attrs.push([name, ''])
			continue
		}
		next++
		while (next < input.length && SPACE.test(input[next])) next++
		const quote = input[next]
		if (quote === '"' || quote === "'") {
			const close = input.indexOf(quote, next + 1)
			if (close === -1) return null
			attrs.push([name, input.slice(next + 1, close)])
			at = close + 1
		} else {
			let stopValue = next
			while (stopValue < input.length && !/[\t\n\f\r >]/.test(input[stopValue])) stopValue++
			attrs.push([name, input.slice(next, stopValue)])
			at = stopValue
		}
	}
	return null
}

/**
 * An opening or closing tag starting at `<`; null when this `<` is only text. The name
 * starts with a letter and, as in a browser, runs to whitespace, `/` or `>`, so `<p_x>`
 * is an unknown element rather than a paragraph.
 */
function readTag(input: string, at: number): Tag | 'unterminated' | null {
	const closing = input[at + 1] === '/'
	let stop = at + (closing ? 2 : 1)
	if (!NAME_START.test(input[stop] ?? '')) return null
	const start = stop
	while (stop < input.length && !NAME_END.test(input[stop])) stop++
	const rest = readAttributes(input, stop)
	if (!rest) return 'unterminated'
	return {
		kind: closing ? 'close' : 'open',
		name: input.slice(start, stop).toLowerCase(),
		attrs: rest.attrs,
		selfClosing: rest.selfClosing,
		end: rest.end,
	}
}

/** Where the content of a dropped element ends: after its closing tag, or the end of the input. */
function skipContent(input: string, lower: string, name: string, from: number) {
	if (name === 'plaintext') return input.length
	let at = from
	while (true) {
		const found = lower.indexOf(`</${name}`, at)
		if (found === -1) return input.length
		const after = lower[found + name.length + 2]
		if (after === undefined) return input.length
		if (/[\t\n\f\r />]/.test(after)) {
			const end = input.indexOf('>', found)
			return end === -1 ? input.length : end + 1
		}
		at = found + 1
	}
}

/** The end of a comment, `<!…>` or `<?…>` at `<`, or -1 when it never closes. */
function skipMarkup(input: string, at: number) {
	if (input.startsWith('<!--', at)) {
		// `<!-->` and `<!--->` are complete, empty comments.
		if (input.startsWith('<!-->', at)) return at + 5
		if (input.startsWith('<!--->', at)) return at + 6
		const ends = [input.indexOf('-->', at + 4), input.indexOf('--!>', at + 4)].filter((end) => end !== -1)
		if (!ends.length) return input.length
		const end = Math.min(...ends)
		return end + (input.startsWith('-->', end) ? 3 : 4)
	}
	const end = input.indexOf('>', at + 2)
	return end === -1 ? -1 : end + 1
}

/**
 * Authored HTML is untrusted input: it arrives from site imports, the API and the AI writer.
 * This is an allowlist, not a filter. The input is tokenized as a browser would read it, and
 * only known-safe tags and attributes are written back, re-escaped and balanced, so the
 * result parses exactly as it reads (no mutation XSS). Same result on the server and in the
 * browser, and running it twice changes nothing.
 */
export function sanitizeProseHtml(html: string, opts?: { maxLength?: number }): string {
	const max =
		typeof opts?.maxLength === 'number' && opts.maxLength >= 0 ? opts.maxLength : MAX_LENGTH
	const input = String(html ?? '')
		.slice(0, max)
		.replace(/\u0000/g, '')
	const lower = input.toLowerCase()
	const out: string[] = []
	// `from` is the tag as written, so `</li>` still closes a stray item that became a paragraph.
	const stack: { tag: string; from: string }[] = []

	const closeTo = (index: number) => {
		while (stack.length > index) out.push(`</${stack.pop()!.tag}>`)
	}
	const lastIndex = (test: (tag: string) => boolean) => {
		for (let index = stack.length - 1; index >= 0; index--) if (test(stack[index].tag)) return index
		return -1
	}

	const open = (from: string, attrs: Attribute[]) => {
		let tag = from === 'h1' ? 'h2' : from
		if (BLOCK.has(tag)) {
			const inline = lastIndex((name) => name === 'p' || HEADING.test(name))
			if (inline !== -1) closeTo(inline)
		}
		if (tag === 'li') {
			const list = lastIndex((name) => name === 'li' || name === 'ul' || name === 'ol')
			if (list !== -1 && stack[list].tag === 'li') closeTo(list)
			const parent = stack[stack.length - 1]?.tag
			if (parent !== 'ul' && parent !== 'ol') tag = 'p'
		}
		if (tag === 'a') {
			const link = lastIndex((name) => name === 'a')
			if (link !== -1) closeTo(link)
		}
		if (VOID.has(tag)) {
			out.push(`<${tag}>`)
			return
		}
		if (stack.length >= MAX_DEPTH) return
		out.push(`<${tag}${attributesOf(tag, attrs)}>`)
		stack.push({ tag, from })
	}

	const close = (from: string) => {
		// Any heading's end tag closes the open heading, as it does in a browser.
		const heading = HEADING.test(from)
		for (let index = stack.length - 1; index >= 0; index--) {
			const entry = stack[index]
			if (heading ? HEADING.test(entry.tag) : entry.from === from) {
				closeTo(index)
				return
			}
		}
	}

	let at = 0
	while (at < input.length) {
		const lt = input.indexOf('<', at)
		if (lt === -1) {
			out.push(escapeText(input.slice(at)))
			break
		}
		if (lt > at) out.push(escapeText(input.slice(at, lt)))

		const next = input[lt + 1]
		if (next === '!' || next === '?') {
			const end = skipMarkup(input, lt)
			if (end === -1) {
				// Never closed: the rest is the inside of a tag, kept only as inert text.
				out.push(escapeText(input.slice(lt)))
				break
			}
			at = end
			continue
		}

		const tag = readTag(input, lt)
		if (tag === null) {
			out.push('&lt;')
			at = lt + 1
			continue
		}
		if (tag === 'unterminated') {
			out.push(escapeText(input.slice(lt)))
			break
		}
		at = tag.end

		if (tag.kind === 'close') {
			if (ALLOWED.has(tag.name) || tag.name === 'h1') close(tag.name)
			continue
		}
		if (DROP_WITH_CONTENT.has(tag.name)) {
			const empty = tag.name === 'embed' || (FOREIGN.has(tag.name) && tag.selfClosing)
			if (!empty) at = skipContent(input, lower, tag.name, tag.end)
			continue
		}
		if (ALLOWED.has(tag.name) || tag.name === 'h1') open(tag.name, tag.attrs)
	}

	closeTo(0)
	return out.join('')
}
