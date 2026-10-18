import { NextResponse } from 'next/server'
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

type Params = { params: Promise<{ slug: string }> }

const notFound = (slug: string) =>
	NextResponse.json({ error: `No post with the slug "${slug}".` }, { status: 404 })

/** GET /api/blog/posts/{slug}: one post, whatever its state. */
export async function GET(request: Request, { params }: Params) {
	const denied = blogApiAuth(request)
	if (denied) return denied
	const { slug } = await params
	await ensureSeeded()
	const doc = await (await posts()).findOne({ slug })
	return doc ? NextResponse.json({ post: present(doc) }) : notFound(slug)
}

/**
 * PATCH /api/blog/posts/{slug}: change only the fields sent. Use it to
 * reschedule (`publishAt`), unpublish (`status: "draft"`), or edit. Sending
 * `slug` renames the post's URL.
 */
export async function PATCH(request: Request, { params }: Params) {
	const denied = blogApiAuth(request)
	if (denied) return denied
	const { slug } = await params

	const parsed = postFields.partial().safeParse(await request.json().catch(() => null))
	if (!parsed.success) return invalid(parsed.error)
	const input = parsed.data

	await ensureSeeded()
	const collection = await posts()
	const existing = await collection.findOne({ slug })
	if (!existing) return notFound(slug)

	const set: Partial<BlogPostDoc> = { updatedAt: new Date() }
	if (input.title !== undefined) set.title = input.title
	if (input.category !== undefined) set.category = input.category
	if (input.status !== undefined) set.status = input.status
	if (input.publishAt !== undefined) {
		set.publishAt = new Date(input.publishAt)
		set.date = displayDate(set.publishAt)
	}
	const hasBody =
		input.sections !== undefined ||
		input.markdown !== undefined ||
		input.content !== undefined
	if (hasBody) {
		const body = bodyOf(input as Parameters<typeof bodyOf>[0])
		if (!body || body.length === 0)
			return NextResponse.json({ error: 'The new body is empty.' }, { status: 400 })
		set.body = body
		if (input.readTime === undefined) set.readTime = readTimeOf(body)
		if (input.excerpt === undefined && existing.source === 'api')
			set.excerpt = excerptOf(body)
	}
	if (input.excerpt !== undefined) set.excerpt = input.excerpt
	if (input.readTime !== undefined) set.readTime = input.readTime
	if (input.slug !== undefined) {
		const next = normalizeSlug(input.slug)
		if (!next)
			return NextResponse.json({ error: 'That slug is empty.' }, { status: 400 })
		if (next !== slug && (await collection.findOne({ slug: next })))
			return NextResponse.json(
				{ error: `A post with the slug "${next}" already exists.` },
				{ status: 409 },
			)
		set.slug = next
	}

	const updated = await collection.findOneAndUpdate(
		{ _id: existing._id },
		{ $set: set },
		{ returnDocument: 'after' },
	)
	if (!updated) return notFound(slug)
	refreshBlog(slug)
	if (updated.slug !== slug) refreshBlog(updated.slug)
	return NextResponse.json({ post: present(updated) })
}

/**
 * PUT /api/blog/posts/{slug}: create the post at this slug, or replace it
 * entirely. Idempotent, so it is the safe call for an automation that may
 * run twice.
 */
export async function PUT(request: Request, { params }: Params) {
	const denied = blogApiAuth(request)
	if (denied) return denied
	const { slug: raw } = await params
	const slug = normalizeSlug(raw)
	if (!slug) return NextResponse.json({ error: 'That slug is empty.' }, { status: 400 })

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

	const now = new Date()
	const publishAt = input.publishAt ? new Date(input.publishAt) : now
	await ensureSeeded()
	const collection = await posts()
	const result = await collection.findOneAndUpdate(
		{ slug },
		{
			$set: {
				title: input.title,
				category: input.category,
				excerpt: input.excerpt || excerptOf(body),
				readTime: input.readTime || readTimeOf(body),
				date: displayDate(publishAt),
				body,
				status: input.status ?? 'published',
				publishAt,
				updatedAt: now,
			},
			$setOnInsert: { slug, source: 'api', createdAt: now },
		},
		{ upsert: true, returnDocument: 'after', includeResultMetadata: true },
	)
	if (!result.value)
		return NextResponse.json({ error: 'The post could not be saved.' }, { status: 500 })
	refreshBlog(slug)
	const created = !result.lastErrorObject?.updatedExisting
	return NextResponse.json({ post: present(result.value) }, { status: created ? 201 : 200 })
}

/** DELETE /api/blog/posts/{slug}: removes the post for good. */
export async function DELETE(request: Request, { params }: Params) {
	const denied = blogApiAuth(request)
	if (denied) return denied
	const { slug } = await params
	await ensureSeeded()
	const removed = await (await posts()).findOneAndDelete({ slug })
	if (!removed) return notFound(slug)
	refreshBlog(slug)
	return NextResponse.json({ ok: true, deleted: present(removed) })
}
