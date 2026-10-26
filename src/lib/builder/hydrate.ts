'use client'

import { getSchema } from './schema'
import { resolveIcon } from './icons'
import { sectionHref } from './links'
import { resolveMediaSrc } from './media-store'
import {
	isProseHtml,
	renderProse,
	renderRichText,
	sanitizeProseHtml,
} from './rich-text'
import type { Field } from './types'

export type HydrateOptions = {
	/**
	 * Where page links point: '' on a hosted site, '/preview/<id>' or '/p/<token>'
	 * elsewhere. Left out (the section library), every href renders as it is stored.
	 */
	linkBase?: string
}

/** A list whose rows are a single `value` field is stored as a plain array. */
export function isScalarList(field: Field) {
	return (
		field.type === 'list' &&
		field.of?.length === 1 &&
		field.of[0].key === 'value'
	)
}

/** Rows saved before a list became scalar are objects; unwrap them. */
function toScalars(rows: unknown[]) {
	return rows.map((row) => {
		if (row === null || typeof row !== 'object') return row
		const first = Object.values(row as Record<string, unknown>).find(
			(v) => typeof v === 'string' || typeof v === 'number',
		)
		return first ?? ''
	})
}

/** A stored image as something `next/image` can load, or nothing. */
function imageSrc(value: unknown) {
	const src = resolveMediaSrc(value)
	return typeof src === 'string' && src ? src : undefined
}

/**
 * A scalar list by the type of its value. Images resolve like any image field; one that
 * does not resolve leaves its slot empty rather than shifting the rest, because the list is
 * positional (the split hero's fan draws slot n at position n).
 */
function hydrateScalars(rows: unknown[], field: Field) {
	const values = toScalars(rows)
	if (field.of?.[0]?.type !== 'image') return values
	return values.map((value) => imageSrc(value) ?? '')
}

/** `href` itself or any `…Href`: the fields that hold a link. */
const isHrefField = (field: Field) => {
	const leaf = field.key.slice(field.key.lastIndexOf('.') + 1)
	return field.type === 'text' && (leaf === 'href' || leaf.endsWith('Href'))
}

const escapeHtml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Authored HTML through the allowlist sanitizer. Plain text (rows written before the field
 * took HTML) becomes escaped paragraphs, split on blank lines as prose always has been.
 */
function proseHtml(value: unknown) {
	if (typeof value !== 'string' || !value.trim()) return undefined
	// A copy the guard below does not narrow: past it, `value` itself would read as never.
	const text: string = value
	if (isProseHtml(value)) return sanitizeProseHtml(text) || undefined
	return text
		.split(/\n{2,}/)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => `<p>${escapeHtml(chunk)}</p>`)
		.join('')
}

/** Sections whose `body` is prose rendered as `html`, or as `children` when it is plain text. */
const BODY_SECTIONS = new Set(['prose-block', 'callout'])

function isNumericSelect(field: Field) {
	return (
		field.type === 'select' &&
		Boolean(field.options?.length) &&
		field.options!.every((o) => /^\d+$/.test(o.value))
	)
}

function setPath(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
) {
	const parts = path.split('.')
	let node = target
	for (let i = 0; i < parts.length - 1; i++) {
		const key = parts[i]
		if (typeof node[key] !== 'object' || node[key] === null) node[key] = {}
		node = node[key] as Record<string, unknown>
	}
	node[parts[parts.length - 1]] = value
}

function hydrateRow(row: unknown, fields: Field[], opts: HydrateOptions) {
	if (typeof row !== 'object' || row === null) return row
	const source = row as Record<string, unknown>
	const out: Record<string, unknown> = { ...source }
	for (const field of fields) {
		if (!(field.key in source)) continue
		if (field.type === 'icon') {
			const icon = resolveIcon(source[field.key])
			if (icon) out[field.key] = icon
			else delete out[field.key]
		} else if (field.type === 'image') {
			const src = imageSrc(source[field.key])
			if (src) out[field.key] = src
			else delete out[field.key]
		} else if (field.type === 'prose') {
			// Rendered as raw HTML by the section (a bento tile's panel), so it is cleaned here.
			const html = proseHtml(source[field.key])
			if (html) out[field.key] = html
			else delete out[field.key]
		} else if (field.type === 'list' && field.of) {
			// A non-array here would make the section map over a string.
			const rows = source[field.key]
			if (!Array.isArray(rows)) delete out[field.key]
			else if (isScalarList(field)) out[field.key] = hydrateScalars(rows, field)
			else out[field.key] = rows.map((r) => hydrateRow(r, field.of!, opts))
		} else if (
			opts.linkBase !== undefined &&
			isHrefField(field) &&
			typeof source[field.key] === 'string'
		) {
			out[field.key] = sectionHref(opts.linkBase, source[field.key] as string)
		}
	}
	return out
}

/** Turns stored JSON props into the real props a section component expects. */
export function hydrateProps(
	type: string,
	props: Record<string, unknown> | undefined,
	opts: HydrateOptions = {},
): Record<string, unknown> {
	const schema = getSchema(type)
	if (!schema || !props) return {}

	const out: Record<string, unknown> = {}

	for (const field of schema.fields) {
		const raw = props[field.key]
		if (raw === undefined || raw === null || raw === '') continue

		switch (field.type) {
			case 'richtext':
				setPath(out, field.key, renderRichText(raw))
				break
			case 'icon': {
				const icon = resolveIcon(raw)
				if (icon) setPath(out, field.key, icon)
				break
			}
			case 'image': {
				// A missing reference renders the component's own empty slot.
				const src = imageSrc(raw)
				if (src) setPath(out, field.key, src)
				break
			}
			case 'prose': {
				// A body becomes `html` or `children` below; any other prose field is HTML here.
				if (BODY_SECTIONS.has(type)) break
				const html = proseHtml(raw)
				if (html) setPath(out, field.key, html)
				break
			}
			case 'select':
				setPath(out, field.key, isNumericSelect(field) ? Number(raw) : raw)
				break
			case 'group': {
				if (typeof raw !== 'object' || Array.isArray(raw)) break
				setPath(out, field.key, hydrateRow(raw, field.of ?? [], opts))
				break
			}
			case 'list':
				// Fall back to the section's own default rather than render a broken row.
				if (!Array.isArray(raw)) break
				setPath(
					out,
					field.key,
					isScalarList(field)
						? hydrateScalars(raw, field)
						: !field.of
							? raw
							: raw.map((row) => hydrateRow(row, field.of!, opts)),
				)
				break
			default:
				setPath(
					out,
					field.key,
					opts.linkBase !== undefined && isHrefField(field) && typeof raw === 'string'
						? sectionHref(opts.linkBase, raw)
						: raw,
				)
		}
	}

	// Sections whose editable body maps onto `children` rather than a prop.
	if (BODY_SECTIONS.has(type)) {
		if (isProseHtml(props.body)) out.html = sanitizeProseHtml(props.body)
		else {
			const body = renderProse(props.body)
			if (body) out.children = body
		}
		delete out.body
	}

	return out
}
