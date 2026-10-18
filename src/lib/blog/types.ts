/**
 * A blog article as the site renders it. Safe for client components: no
 * database code lives here, so the header can import these types and helpers.
 */
export type BlogPost = {
	slug: string
	category: string
	title: string
	excerpt: string
	readTime: string
	/** The publish date shown on the page, `YYYY-MM-DD`. */
	date: string
	/** Sections in order. An empty heading renders as a run of paragraphs with no title. */
	body: { heading: string; paragraphs: string[] }[]
}

/** The subset the header's blog menu needs. */
export type BlogNav = {
	topics: { category: string; slug: string; count: number }[]
	latest: Pick<BlogPost, 'slug' | 'title' | 'excerpt' | 'category' | 'readTime'>[]
}

export const topicSlug = (category: string) =>
	category
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')

/** Categories in the order they first appear in a newest-first list. */
export const categoriesOf = (posts: BlogPost[]) => [
	...new Set(posts.map((post) => post.category)),
]

export const topicsOf = (posts: BlogPost[]) =>
	categoriesOf(posts).map((category) => ({
		category,
		slug: topicSlug(category),
		posts: posts.filter((post) => post.category === category),
	}))

export const navOf = (posts: BlogPost[]): BlogNav => ({
	topics: topicsOf(posts).map((topic) => ({
		category: topic.category,
		slug: topic.slug,
		count: topic.posts.length,
	})),
	latest: posts.slice(0, 5).map(({ slug, title, excerpt, category, readTime }) => ({
		slug,
		title,
		excerpt,
		category,
		readTime,
	})),
})
