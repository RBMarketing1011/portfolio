'use client'

import { Fragment } from 'react'
import { Highlight } from '@/components/ui/highlight'

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

/**
 * Body copy authored as plain text. Blank lines separate paragraphs and a leading
 * `##` marks a heading, which keeps ProseBlock's direct-child selectors working.
 */
export function renderProse(value: unknown) {
	if (typeof value !== 'string' || !value.trim()) return undefined

	return value
		.split(/\n{2,}/)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk, index) => {
			const heading = chunk.match(/^(#{2,3})\s+([\s\S]*)$/)
			if (heading) {
				const id = heading[2]
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, '')
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
