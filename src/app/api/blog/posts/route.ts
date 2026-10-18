import { NextResponse } from 'next/server'
import { MongoServerError } from 'mongodb'
import {
	blogApiAuth,
	bodyOf,
	displayDate,
	excerptOf,
	invalid,
	normalizeSlug,
	postFields,
	present,
	readTimeOf,
	refreshBlog,
} from '@/lib/blog/api'
import { ensureSeeded, posts, type BlogPostDoc } from '@/lib/blog/posts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/blog/posts?state=live|scheduled|draft|all&limit=50
 * Every post, newest publish time first, including scheduled and draft ones.
 */
export async function GET(request: Request) {
	const denied = blogApiAuth(request)
	if (denied) return denied

	const params = new URL(request.url).searchParams
	const state = params.get('state') ?? 'all'
	const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 200)
	const now = new Date()

	const filter =
		state === 'live'
			? { status: 'published' as const, publishAt: { $lte: now } }
			: state === 'scheduled'
				? { status: 'published' as const, publishAt: { $gt: now } }
				: state === 'draft'
					? { status: 'draft' as const }
					: {}

	await ensureSeeded()
	const docs = await (await posts())
		.find(filter)
		.sort({ publishAt: -1, _id: -1 })
		.limit(limit)
		.toArray()
	return NextResponse.json({ posts: docs.map(present) })
}

/**
 * POST /api/blog/posts
 * Creates a post. Send `publishAt` in the future to schedule it; it goes live
 * on its own at that time. A slug that already exists is refused with 409, so
 * an automation that retries cannot publish the same article twice. Use
 * PUT /api/blog/posts/{slug} to create-or-replace instead.
 */
export async function POST(request: Request) {
	const denied = blogApiAuth(request)
	if (denied) return denied

	const parsed = postFields.safeParse(await request.json().catch(() => null))
	if (!parsed.success) return invalid(parsed.error)
	const input = parsed.data

	const body = bodyOf(input)
	if (!body || body.length === 0)
		return NextResponse.json(
			{
				error:
					'The post has no body. Send `markdown` (or `content`) as text, or `sections` as [{ heading, paragraphs }].',
			},
			{ status: 400 },
		)

	const slug = normalizeSlug(input.slug || input.title)
	if (!slug)
		return NextResponse.json(
			{ error: 'Could not make a URL slug from that title. Send `slug`.' },
			{ status: 400 },
		)

	const now = new Date()
	const publishAt = input.publishAt ? new Date(input.publishAt) : now
	const doc = {
		slug,
		title: input.title,
		category: input.category,
		excerpt: input.excerpt || excerptOf(body),
		readTime: input.readTime || readTimeOf(body),
		date: displayDate(publishAt),
		body,
		status: input.status ?? 'published',
		publishAt,
		source: 'api',
		createdAt: now,
		updatedAt: now,
	} as Omit<BlogPostDoc, '_id'>

	await ensureSeeded()
	const collection = await posts()
	try {
		const result = await collection.insertOne(doc as BlogPostDoc)
		refreshBlog(slug)
		return NextResponse.json(
			{ post: present({ ...doc, _id: result.insertedId } as BlogPostDoc) },
			{ status: 201 },
		)
	} catch (error) {
		if (error instanceof MongoServerError && error.code === 11000) {
			const existing = await collection.findOne({ slug })
			return NextResponse.json(
				{
					error: `A post with the slug "${slug}" already exists.`,
					post: existing ? present(existing) : null,
				},
				{ status: 409 },
			)
		}
		throw error
	}
}
