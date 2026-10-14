'use client'

import { Fragment } from 'react'
import { Highlight } from '@/components/ui/highlight'
import { anchorId } from './ids'

const HIGHLIGHT = /\[\[(.+?)\]\]/g

/** Turns `Copy with [[emphasis]] in it` into a node tree. */
export function renderRichText(value: unknown) {
	if (typeof value !== 'string') return value as React.ReactNode
	if (!value.includes('[[')) return value

	const parts: React.ReactNode[] = []
	let cursor = 0
	let match: RegExpExecArray | null
	HIGHLIGHT.lastIndex = 0

	while ((match = HIGHLIGHT.exec(value)) !== null) {
		if (match.index > cursor) parts.push(value.slice(cursor, match.index))
		parts.push(<Highlight key={match.index}>{match[1]}</Highlight>)
		cursor = match.index + match[0].length
	}
	if (cursor < value.length) parts.push(value.slice(cursor))

	return <>{parts}</>
}

// Pure, so server code (the AI writer) can share them; re-exported for existing imports.
export { isProseHtml, sanitizeProseHtml } from './prose-html'
import { isProseHtml } from './prose-html'

/**
 * Gives editor-authored headings the same slug ids the article pages use, so a table
 * of contents can link to them without anyone hand-writing an anchor.
 */
export function withHeadingIds(html: string) {
	return html.replace(
		/<h([2-6])([^>]*)>([\s\S]*?)<\/h\1>/gi,
		(match, level, attrs, inner) => {
			if (/\sid\s*=/i.test(attrs)) return match
			// Entities become a space before slugging, or `&amp;` would spell "amp".
			const text = inner
				.replace(/<[^>]*>/g, '')
				.replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi, ' ')
			const id = anchorId(text)
			return id ? `<h${level}${attrs} id="${id}">${inner}</h${level}>` : match
		},
	)
}

/**
 * Body copy. The editor stores HTML; older blocks stored plain text where a blank
 * line separated paragraphs and a leading `##` marked a heading. Both still render.
 */
export function renderProse(value: unknown) {
	if (typeof value !== 'string' || !value.trim()) return undefined
	if (isProseHtml(value)) return undefined

	const plain: string = value

	return plain
		.split(/\n{2,}/)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk, index) => {
			const heading = chunk.match(/^(#{2,3})\s+([\s\S]*)$/)
			if (heading) {
				const id = anchorId(heading[2])
				return heading[1] === '##' ? (
					<h2 key={index} id={id}>
						{heading[2]}
					</h2>
				) : (
					<h3 key={index} id={id}>
						{heading[2]}
					</h3>
				)
			}
			return <Fragment key={index}>{<p>{chunk}</p>}</Fragment>
		})
}
