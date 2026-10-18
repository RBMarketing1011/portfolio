import 'server-only'
import { cache } from 'react'
import type { Collection, ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongo'
import { seedPosts } from './seed-posts'
import { navOf, topicsOf, type BlogPost } from './types'

export const BLOG_POSTS = 'blogPosts'
const BLOG_META = 'blogMeta'

export type PostStatus = 'published' | 'draft'

export type BlogPostDoc = BlogPost & {
	_id: ObjectId
	status: PostStatus
	/** When the post goes live. In the future means scheduled. */
	publishAt: Date
	source: 'seed' | 'api'
	createdAt: Date
	updatedAt: Date
}

export const posts = async (): Promise<Collection<BlogPostDoc>> =>
	(await getDb()).collection<BlogPostDoc>(BLOG_POSTS)

/** Where a post stands right now, as the API reports it. */
export const stateOf = (doc: Pick<BlogPostDoc, 'status' | 'publishAt'>) =>
	doc.status === 'draft'
		? 'draft'
		: doc.publishAt.getTime() > Date.now()
			? 'scheduled'
			: 'live'

const toPost = (doc: BlogPostDoc): BlogPost => ({
	slug: doc.slug,
	category: doc.category,
	title: doc.title,
	excerpt: doc.excerpt,
	readTime: doc.readTime,
	date: doc.date,
	body: doc.body,
})

const SEED_VERSION = 1
let seeding: Promise<void> | null = null

/**
 * Copies the articles that used to live in code into the database, once per
 * database. Upserts on slug with insert-only fields, so it never overwrites a
 * post the API has changed, and the marker means a seed post deleted through
 * the API stays deleted. Safe to race: every step is idempotent.
 */
export function ensureSeeded() {
	seeding ??= (async () => {
		const db = await getDb()
		// Created here rather than only by the index script, because the API's
		// "slug already exists" answer depends on the unique index existing.
		const collection = db.collection<BlogPostDoc>(BLOG_POSTS)
		await Promise.all([
			collection.createIndex({ slug: 1 }, { unique: true }),
			collection.createIndex({ status: 1, publishAt: -1 }),
		])
		const meta = db.collection<{ _id: string; version: number }>(BLOG_META)
		if ((await meta.findOne({ _id: 'seed' }))?.version === SEED_VERSION) return

		const now = new Date()
		await db.collection<BlogPostDoc>(BLOG_POSTS).bulkWrite(
			seedPosts.map((post) => ({
				updateOne: {
					filter: { slug: post.slug },
					update: {
						$setOnInsert: {
							...post,
							status: 'published' as const,
							publishAt: new Date(`${post.date}T00:00:00.000Z`),
							source: 'seed' as const,
							createdAt: now,
							updatedAt: now,
						},
					},
					upsert: true,
				},
			})),
			{ ordered: false },
		)
		await meta.updateOne(
			{ _id: 'seed' },
			{ $set: { version: SEED_VERSION } },
			{ upsert: true },
		)
	})().catch((error) => {
		seeding = null
		throw error
	})
	return seeding
}

const fallback = () =>
	[...seedPosts].sort((a, b) => b.date.localeCompare(a.date))

/**
 * Every live post, newest first, read once per render. The pages that show
 * posts are regenerated at most once a minute (their `revalidate`), which is
 * also the most a scheduled post can lag behind its publish time, and the
 * blog API purges them the moment it writes. If the database cannot be
 * reached the site shows the original articles rather than an empty blog.
 */
export const getPublishedPosts = cache(
	async (): Promise<BlogPost[]> => {
		try {
			await ensureSeeded()
			const docs = await (await posts())
				.find({ status: 'published', publishAt: { $lte: new Date() } })
				.sort({ publishAt: -1, _id: -1 })
				.toArray()
			return docs.map(toPost)
		} catch (error) {
			console.error('[blog] database unavailable, serving the seed posts', error)
			return fallback()
		}
	},
)

export async function getPost(slug: string) {
	return (await getPublishedPosts()).find((post) => post.slug === slug) ?? null
}

export async function getTopics() {
	return topicsOf(await getPublishedPosts())
}

export async function getBlogNav() {
	return navOf(await getPublishedPosts())
}
