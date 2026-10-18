import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { linkOrigin } from '@/lib/app-url'
import { markdownToSections, readTimeOf, slugify } from './markdown'
import { stateOf, type BlogPostDoc } from './posts'

/**
 * The blog API is for automations, not people, so it authenticates with one
 * shared secret (`BLOG_API_KEY`) sent as `Authorization: Bearer <key>` or
 * `x-api-key: <key>`. With no key configured the API is off.
 */
export function blogApiAuth(request: Request): Response | null {
	const expected = process.env.BLOG_API_KEY?.trim()
	if (!expected)
		return Response.json(
			{ error: 'The blog API is not configured. Set BLOG_API_KEY.' },
			{ status: 503 },
		)
	const header = request.headers.get('authorization') ?? ''
	const given = (
		header.match(/^Bearer\s+(.+)$/i)?.[1] ??
		request.headers.get('x-api-key') ??
		''
	).trim()
	const digest = (value: string) => createHash('sha256').update(value).digest()
	if (!given || !timingSafeEqual(digest(given), digest(expected)))
		return Response.json({ error: 'Invalid or missing API key.' }, { status: 401 })
	return null
}

const sectionSchema = z.object({
	heading: z.string().trim().max(200).default(''),
	paragraphs: z.array(z.string().trim().min(1).max(10_000)).min(1).max(100),
})

/** Everything a post can carry. Create requires title, category and a body. */
export const postFields = z.object({
	title: z.string().trim().min(1).max(200),
	slug: z.string().trim().max(120).optional(),
	category: z.string().trim().min(1).max(60),
	excerpt: z.string().trim().max(600).optional(),
	/** The body as markdown (also accepted as `content`). */
	markdown: z.string().max(200_000).optional(),
	content: z.string().max(200_000).optional(),
	/** Or the body already split into sections. */
	sections: z.array(sectionSchema).min(1).max(60).optional(),
	/** ISO 8601. In the future schedules the post; omitted means now. */
	publishAt: z.string().datetime({ offset: true }).optional(),
	status: z.enum(['published', 'draft']).optional(),
	readTime: z.string().trim().max(20).optional(),
})

export type PostInput = z.infer<typeof postFields>

/** Turns whichever body field was sent into sections, or null if none was. */
export function bodyOf(input: PostInput) {
	if (input.sections) return input.sections
	const markdown = input.markdown ?? input.content
	if (markdown === undefined) return null
	return markdownToSections(markdown)
}

export const excerptOf = (body: BlogPostDoc['body']) => {
	const first = body[0]?.paragraphs[0] ?? ''
	if (first.length <= 220) return first
	const cut = first.slice(0, 220)
	return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '')}…`
}

export const normalizeSlug = (value: string) => slugify(value)

export const displayDate = (date: Date) => date.toISOString().slice(0, 10)

/** What the API returns for a post. */
export function present(doc: BlogPostDoc) {
	return {
		id: doc._id.toString(),
		slug: doc.slug,
		title: doc.title,
		category: doc.category,
		excerpt: doc.excerpt,
		readTime: doc.readTime,
		date: doc.date,
		body: doc.body,
		status: doc.status,
		state: stateOf(doc),
		publishAt: doc.publishAt.toISOString(),
		url: `${linkOrigin()}/blog/${doc.slug}`,
		source: doc.source,
		createdAt: doc.createdAt.toISOString(),
		updatedAt: doc.updatedAt.toISOString(),
	}
}

/** Purges every public page (they all show the blog menu) so a write shows
 *  up on the next request rather than at the next timed refresh. */
export function refreshBlog(slug?: string) {
	revalidatePath('/', 'layout')
	if (slug) revalidatePath(`/blog/${slug}`)
}

export { readTimeOf }

export const invalid = (error: z.ZodError) =>
	Response.json(
		{
			error: 'Invalid post.',
			issues: error.issues.map((issue) => ({
				field: issue.path.join('.') || '(body)',
				message: issue.message,
			})),
		},
		{ status: 400 },
	)
