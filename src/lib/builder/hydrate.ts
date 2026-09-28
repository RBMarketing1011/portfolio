'use client'

import { getSchema } from './schema'
import { resolveIcon } from './icons'
import { resolveMediaSrc } from './media-store'
import {
	isProseHtml,
	renderProse,
	renderRichText,
	sanitizeProseHtml,
} from './rich-text'
import type { Field } from './types'

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

function hydrateRow(row: unknown, fields: Field[]) {
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
			const src = resolveMediaSrc(source[field.key])
			if (src) out[field.key] = src
			else delete out[field.key]
		} else if (field.type === 'list' && field.of) {
			// A non-array here would make the section map over a string.
			const rows = source[field.key]
			if (!Array.isArray(rows)) delete out[field.key]
			else if (isScalarList(field)) out[field.key] = toScalars(rows)
			else out[field.key] = rows.map((r) => hydrateRow(r, field.of!))
		}
	}
	return out
}

/** Turns stored JSON props into the real props a section component expects. */
export function hydrateProps(
	type: string,
	props: Record<string, unknown> | undefined,
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
				const src = resolveMediaSrc(raw)
				if (src) setPath(out, field.key, src)
				break
			}
			case 'select':
				setPath(out, field.key, isNumericSelect(field) ? Number(raw) : raw)
				break
			case 'group': {
				if (typeof raw !== 'object' || Array.isArray(raw)) break
				setPath(out, field.key, hydrateRow(raw, field.of ?? []))
				break
			}
			case 'list':
				// Fall back to the section's own default rather than render a broken row.
				if (!Array.isArray(raw)) break
				setPath(
					out,
					field.key,
					isScalarList(field)
						? toScalars(raw)
						: !field.of
							? raw
							: raw.map((row) => hydrateRow(row, field.of!)),
				)
				break
			default:
				setPath(out, field.key, raw)
		}
	}

	// Sections whose editable body maps onto `children` rather than a prop.
	if (type === 'prose-block' || type === 'callout') {
		if (isProseHtml(props.body)) out.html = sanitizeProseHtml(props.body)
		else {
			const body = renderProse(props.body)
			if (body) out.children = body
		}
		delete out.body
	}

	return out
}
