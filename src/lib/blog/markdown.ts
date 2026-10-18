import type { BlogPost } from './types'

type Section = BlogPost['body'][number]

/** Inline markdown the article page would otherwise show as literal symbols. */
const inline = (text: string) =>
	text
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/(\*\*|__)(.+?)\1/g, '$2')
		.replace(/(^|[^\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?=[^\w*]|$)/g, '$1$2')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim()

/**
 * Turns the markdown an automation (or a language model) usually produces
 * into the article's sections. `##` and `###` start a section; a single `#`
 * is treated as the title and skipped; blank lines separate paragraphs; each
 * list item becomes its own paragraph. Text before the first heading becomes a
 * section with no heading, which the page renders as an introduction.
 */
export function markdownToSections(markdown: string): Section[] {
	const sections: Section[] = []
	let current: Section = { heading: '', paragraphs: [] }
	let buffer: string[] = []

	const flush = () => {
		const text = inline(buffer.join(' '))
		if (text) current.paragraphs.push(text)
		buffer = []
	}
	const close = () => {
		flush()
		if (current.paragraphs.length || current.heading) sections.push(current)
	}

	for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
		const line = raw.trim()
		const heading = line.match(/^(#{1,6})\s+(.*)$/)
		if (heading) {
			if (heading[1].length === 1) {
				flush()
				continue
			}
			close()
			current = { heading: inline(heading[2]), paragraphs: [] }
			continue
		}
		if (!line || /^([-*_])\1{2,}$/.test(line)) {
			flush()
			continue
		}
		const item = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/)
		if (item) {
			flush()
			buffer.push(item[1])
			flush()
			continue
		}
		buffer.push(line.replace(/^>\s?/, ''))
	}
	close()

	return sections.filter((section) => section.paragraphs.length > 0)
}

/** Roughly how long the article takes to read, at 220 words a minute. */
export function readTimeOf(body: Section[]) {
	const words = body
		.flatMap((section) => [section.heading, ...section.paragraphs])
		.join(' ')
		.split(/\s+/)
		.filter(Boolean).length
	return `${Math.max(1, Math.round(words / 220))} min`
}

export function slugify(value: string) {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 120)
		.replace(/-$/, '')
}
