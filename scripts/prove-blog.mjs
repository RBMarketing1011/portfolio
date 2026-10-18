/**
 * Proves the blog moved to the database and the publishing API works end to
 * end: the original articles are seeded and still render, the API refuses
 * strangers, a post goes live, a scheduled post stays hidden until its time
 * and then appears on its own, and edits, renames, drafts and deletes all show
 * on the site. Run against the dev server and a local database (see
 * lib/auth-harness.mjs); needs BLOG_API_KEY in the environment.
 */
import { BASE, connect, rand, recorder } from './lib/auth-harness.mjs'

const { client, db } = await connect()
const { record, finish } = recorder()

const key = process.env.BLOG_API_KEY?.trim()
if (!key) {
	console.error('BLOG_API_KEY is not set.')
	process.exit(1)
}

const api = (path, { method = 'GET', body, auth = key, headers = {} } = {}) =>
	fetch(`${BASE}/api/blog/posts${path}`, {
		method,
		headers: {
			...(auth ? { Authorization: `Bearer ${auth}` } : {}),
			...(body ? { 'Content-Type': 'application/json' } : {}),
			...headers,
		},
		body: body ? JSON.stringify(body) : undefined,
	})
const page = async (path) => {
	const response = await fetch(`${BASE}${path}`, { redirect: 'manual' })
	return { status: response.status, html: await response.text() }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const run = rand()
const slugs = []
const posts = db.collection('blogPosts')

// --- the original articles ----------------------------------------------------

const list = await api('?limit=200')
const listed = (await list.json()).posts ?? []
const seeded = listed.filter((post) => post.source === 'seed')
record('the 23 original articles are in the database', seeded.length === 23, `${seeded.length}`)
record('they are all live', seeded.every((post) => post.state === 'live'))
const original = seeded.find((post) => post.slug === 'where-ai-actually-pays-off')
const originalPage = await page('/blog/where-ai-actually-pays-off')
record(
	'an original article still renders from the database',
	originalPage.status === 200 && originalPage.html.includes('Start with the expensive hour'),
	`${originalPage.status}`,
)
record('the blog index lists the originals', (await page('/blog')).html.includes(original?.title ?? '???'))

// --- authentication -------------------------------------------------------------

record('no key is refused', (await api('', { auth: null })).status === 401)
record('a wrong key is refused', (await api('', { auth: 'not-the-key' })).status === 401)
record('the key also works as x-api-key', (await api('?limit=1', { auth: null, headers: { 'x-api-key': key } })).status === 200)

// --- publishing now -------------------------------------------------------------

const liveSlug = `e2e-live-${run}`
slugs.push(liveSlug)
const markdown = `# Ignored title line

An opening paragraph with **bold** and a [link](https://example.com) in it.

## Why it matters

The first point, spread
across two lines.

- A list item
- Another item

### A smaller heading

1. Numbered one
2. Numbered two`

const created = await api('', {
	method: 'POST',
	body: { title: `Proof post ${run}`, slug: liveSlug, category: 'Proof Topic', markdown },
})
const createdBody = await created.json()
record('a post can be published', created.status === 201 && createdBody.post?.state === 'live', `${created.status}`)
record('the response gives the public URL', createdBody.post?.url === `${BASE}/blog/${liveSlug}`, createdBody.post?.url)
record(
	'markdown becomes sections with clean text',
	JSON.stringify(createdBody.post?.body) ===
		JSON.stringify([
			{ heading: '', paragraphs: ['An opening paragraph with bold and a link in it.'] },
			{ heading: 'Why it matters', paragraphs: ['The first point, spread across two lines.', 'A list item', 'Another item'] },
			{ heading: 'A smaller heading', paragraphs: ['Numbered one', 'Numbered two'] },
		]),
	JSON.stringify(createdBody.post?.body),
)
record('an excerpt and read time are filled in', createdBody.post?.excerpt?.startsWith('An opening paragraph') && /min$/.test(createdBody.post?.readTime ?? ''))

const livePage = await page(`/blog/${liveSlug}`)
record('the new post is on the site straight away', livePage.status === 200 && livePage.html.includes('Why it matters'), `${livePage.status}`)
record('it heads the blog index', (await page('/blog')).html.includes(`Proof post ${run}`))
record('its new topic page exists', (await page('/blog/topics/proof-topic')).status === 200)
record('it is in the sitemap', (await (await fetch(`${BASE}/sitemap.xml`)).text()).includes(`/blog/${liveSlug}`))

const duplicate = await api('', { method: 'POST', body: { title: 'Again', slug: liveSlug, category: 'Proof Topic', markdown: 'Body.' } })
record('posting the same slug twice is refused', duplicate.status === 409 && (await duplicate.json()).post?.slug === liveSlug)
record('a post with no body is refused', (await api('', { method: 'POST', body: { title: 'Empty', category: 'X' } })).status === 400)
const bad = await api('', { method: 'POST', body: { category: 'X', markdown: 'x' } })
record('a missing title is named in the error', bad.status === 400 && (await bad.json()).issues?.some((issue) => issue.field === 'title'))
record('a bad date is refused', (await api('', { method: 'POST', body: { title: 'T', category: 'X', markdown: 'x', publishAt: 'next tuesday' } })).status === 400)

// --- scheduling -------------------------------------------------------------------

const laterSlug = `e2e-scheduled-${run}`
slugs.push(laterSlug)
const inSeconds = 8
const scheduled = await api('', {
	method: 'POST',
	body: {
		title: `Scheduled proof ${run}`,
		slug: laterSlug,
		category: 'Proof Topic',
		sections: [{ heading: 'Later', paragraphs: ['This appears on its own.'] }],
		publishAt: new Date(Date.now() + inSeconds * 1000).toISOString(),
	},
})
record('a post can be scheduled', scheduled.status === 201 && (await scheduled.json()).post?.state === 'scheduled')
record('a scheduled post is not on the site yet', (await page(`/blog/${laterSlug}`)).status === 404)
record('nor in the index', !(await page('/blog')).html.includes(`Scheduled proof ${run}`))
record('the API lists it as scheduled', ((await (await api('?state=scheduled')).json()).posts ?? []).some((post) => post.slug === laterSlug))

// It goes live by itself: no request to the API, only time passing. The cache
// window is the revalidate period, so allow for it.
await wait(inSeconds * 1000)
let appeared = false
for (let i = 0; i < 40 && !appeared; i += 1) {
	appeared = (await page(`/blog/${laterSlug}`)).status === 200
	if (!appeared) await wait(2000)
}
record('a scheduled post goes live on its own at its time', appeared)

// --- editing ----------------------------------------------------------------------

const patched = await api(`/${liveSlug}`, { method: 'PATCH', body: { title: `Edited proof ${run}` } })
record('a post can be edited', patched.status === 200 && (await patched.json()).post?.title === `Edited proof ${run}`)
record('the edit shows on the site', (await page(`/blog/${liveSlug}`)).html.includes(`Edited proof ${run}`))

const draft = await api(`/${liveSlug}`, { method: 'PATCH', body: { status: 'draft' } })
record('a post can be taken down as a draft', draft.status === 200 && (await draft.json()).post?.state === 'draft')
record('a draft is not on the site', (await page(`/blog/${liveSlug}`)).status === 404)
await api(`/${liveSlug}`, { method: 'PATCH', body: { status: 'published' } })
record('and can be put back', (await page(`/blog/${liveSlug}`)).status === 200)

const renamedSlug = `e2e-renamed-${run}`
slugs.push(renamedSlug)
const renamed = await api(`/${liveSlug}`, { method: 'PATCH', body: { slug: renamedSlug } })
record('a post can be moved to a new URL', renamed.status === 200 && (await page(`/blog/${renamedSlug}`)).status === 200 && (await page(`/blog/${liveSlug}`)).status === 404)

// --- idempotent create-or-replace ---------------------------------------------------

const putSlug = `e2e-put-${run}`
slugs.push(putSlug)
const putBody = { title: `Put proof ${run}`, category: 'Proof Topic', content: 'First version.' }
const firstPut = await api(`/${putSlug}`, { method: 'PUT', body: putBody })
const secondPut = await api(`/${putSlug}`, { method: 'PUT', body: { ...putBody, content: 'Second version.' } })
record('PUT creates, then replaces', firstPut.status === 201 && secondPut.status === 200)
record('PUT never duplicates', (await posts.countDocuments({ slug: putSlug })) === 1)
record('the replacement is what shows', (await page(`/blog/${putSlug}`)).html.includes('Second version.'))

// --- deleting -----------------------------------------------------------------------

const removed = await api(`/${putSlug}`, { method: 'DELETE' })
record('a post can be deleted', removed.status === 200 && (await page(`/blog/${putSlug}`)).status === 404)
record('deleting twice says it is gone', (await api(`/${putSlug}`, { method: 'DELETE' })).status === 404)

// A deleted original must stay deleted: the seed must not bring it back.
const originalDoc = await posts.findOne({ slug: 'where-ai-actually-pays-off' })
await api('/where-ai-actually-pays-off', { method: 'DELETE' })
await api('?limit=1')
record('a deleted original article is not re-seeded', (await posts.countDocuments({ slug: 'where-ai-actually-pays-off' })) === 0)
if (originalDoc) await posts.insertOne(originalDoc)

await posts.deleteMany({ slug: { $in: slugs } })
await client.close()
finish()
