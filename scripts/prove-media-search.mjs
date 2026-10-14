/**
 * Proves the media library's search engine (search.ts) and suggestions
 * (suggest.ts) against the real database:
 *
 *   node --env-file=.env scripts/prove-media-search.mjs
 *
 * Every run uses a fresh workspace id and only touches documents carrying it;
 * all of it is deleted in a `finally`. Expectations come from the contract
 * written on `searchAssets`, not from whatever the engine printed.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { loadTs, rootRequire } = require('./lib/load-ts.cjs')
const { MongoClient, ObjectId } = rootRequire('mongodb')

const uri = process.env.MONGODB_URI
if (!uri) {
	console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/prove-media-search.mjs')
	process.exit(1)
}

const S = loadTs('src/lib/media/search.ts')
const G = loadTs('src/lib/media/suggest.ts')
const V = loadTs('src/lib/media/vocabulary.ts')
const { derivedFields } = loadTs('src/lib/media/terms.ts')
const { buildFolderIndex, folderKey } = loadTs('src/lib/media/folder-index.ts')
const { MEDIA_LIMITS } = loadTs('src/lib/media/types.ts')

let passed = 0
let failed = 0
async function check(name, fn) {
	try {
		await fn()
		passed++
		console.log(`PASS  ${name}`)
	} catch (error) {
		failed++
		const detail = (error && error.message ? error.message : String(error)).split('\n').slice(0, 6).join(' | ')
		console.log(`FAIL  ${name} (${detail})`)
	}
}
const section = (title) => console.log(`\n== ${title}`)

const client = new MongoClient(uri)
const ws = new ObjectId()
const other = new ObjectId()
const ctx = { workspaceId: ws, userId: 'proof' }

let db
let assets
let folders

const tag = (label, source = 'manual') => ({
	slug: label.toLowerCase().replace(/\s+/g, '-'),
	label,
	source,
})

let clock = Date.UTC(2026, 0, 1)
const mk = (workspaceId, name, extra = {}) => {
	const base = {
		_id: new ObjectId(),
		workspaceId,
		folderId: null,
		name,
		filename: `${name}.jpg`,
		url: 'https://example.invalid/x.jpg',
		pathname: `proof/${new ObjectId()}`,
		contentType: 'image/jpeg',
		bytes: 1000,
		width: 1600,
		height: 900,
		pixels: 1600 * 900,
		orientation: 'landscape',
		hasAlpha: false,
		animated: false,
		colors: [],
		brightness: 'mid',
		saturation: 'vivid',
		sha256: `${new ObjectId()}`,
		blur: null,
		tags: [],
		rejectedTags: [],
		caption: '',
		altText: '',
		captionEdited: false,
		textInImage: '',
		keywords: [],
		kind: 'photo',
		notes: '',
		rev: 0,
		tagging: { status: 'done', attempts: 0 },
		uploadedBy: 'proof',
		createdAt: new Date((clock += 60_000)),
		updatedAt: new Date(clock),
		...extra,
	}
	return { ...base, ...derivedFields(base) }
}

const ids = (res) => res.assets.map((a) => a.name)
const search = (params) => S.searchAssets(db, ctx, { q: '', ...params })

try {
	await client.connect()
	db = client.db()
	assets = db.collection('mediaAssets')
	folders = db.collection('mediaFolders')

	/* ---------------------------------------------------------------------- */
	/* Fixtures                                                               */
	/* ---------------------------------------------------------------------- */

	const fClients = { _id: new ObjectId(), workspaceId: ws, parentId: null, name: 'Clients', nameKey: folderKey('Clients'), createdBy: 'p', createdAt: new Date(), updatedAt: new Date() }
	const fAcme = { _id: new ObjectId(), workspaceId: ws, parentId: fClients._id, name: 'Acme', nameKey: folderKey('Acme'), createdBy: 'p', createdAt: new Date(), updatedAt: new Date() }
	await folders.insertMany([fClients, fAcme])

	const docs = [
		mk(ws, 'kitchen-hero', { tags: [tag('Kitchen'), tag('Remodel')], colors: [{ hex: '#2f6fed', name: 'blue', share: 0.6 }], bytes: 5000, folderId: fAcme._id }),
		mk(ws, 'bathroom-tile', { tags: [tag('Bathroom')], colors: [{ hex: '#ffffff', name: 'white', share: 0.7 }], bytes: 3000, folderId: fClients._id }),
		mk(ws, 'truck-wrap', { tags: [tag('Truck'), tag('Fleet', 'auto')], caption: 'A white work truck at a job site', bytes: 9000 }),
		mk(ws, 'logo-mark', { kind: 'logo', width: 400, height: 400, pixels: 160000, orientation: 'square', tags: [], bytes: 200 }),
		mk(ws, 'night-skyline', { brightness: 'dark', tags: [tag('Skyline', 'auto')], bytes: 7000, tagging: { status: 'pending', attempts: 0 } }),
	]
	await assets.insertMany(docs)
	// Another workspace's asset that must never appear.
	await assets.insertOne(mk(other, 'kitchen-foreign', { tags: [tag('Kitchen')] }))
	V.invalidateVocabulary(ws)

	/* ---------------------------------------------------------------------- */
	section('no text: Mongo does everything')

	await check('browsing returns this workspace only, newest first', async () => {
		const res = await search({})
		assert.equal(res.total, 5)
		assert.deepEqual(ids(res), ['night-skyline', 'logo-mark', 'truck-wrap', 'bathroom-tile', 'kitchen-hero'])
		assert.equal(res.sort, 'newest')
		assert.equal(res.truncated, false)
		assert.equal(res.hasMore, false)
		assert.ok(!res.assets.some((a) => a.name === 'kitchen-foreign'))
	})

	await check('DTOs carry no match info, terms or workspace id', async () => {
		const [a] = (await search({})).assets
		assert.equal(a.match, undefined)
		for (const key of ['terms', 'workspaceId', 'uploadedBy', 'sha256']) assert.ok(!(key in a), key)
	})

	await check('every sort key orders as documented', async () => {
		assert.deepEqual(ids(await search({ sort: 'oldest' })), ['kitchen-hero', 'bathroom-tile', 'truck-wrap', 'logo-mark', 'night-skyline'])
		assert.deepEqual(ids(await search({ sort: 'largest' }))[0], 'truck-wrap')
		assert.deepEqual(ids(await search({ sort: 'smallest' }))[0], 'logo-mark')
		assert.deepEqual(ids(await search({ sort: 'name' })), ['bathroom-tile', 'kitchen-hero', 'logo-mark', 'night-skyline', 'truck-wrap'])
		assert.deepEqual(ids(await search({ sort: 'name-desc' }))[0], 'truck-wrap')
		assert.equal(ids(await search({ sort: 'dimensions' })).at(-1), 'logo-mark')
	})

	await check('relevance without text becomes newest', async () => {
		const res = await search({ sort: 'relevance' })
		assert.equal(res.sort, 'newest')
	})

	await check('paging: offset, limit, total, hasMore', async () => {
		const page = await search({ limit: 2, offset: 1 })
		assert.equal(page.total, 5)
		assert.equal(page.assets.length, 2)
		assert.equal(page.hasMore, true)
		assert.equal((await search({ limit: 2, offset: 4 })).hasMore, false)
	})

	await check('limit and offset are clamped', async () => {
		assert.equal((await search({ limit: 0 })).limit, 1)
		assert.equal((await search({ limit: 99999 })).limit, MEDIA_LIMITS.maxPageSize)
		assert.equal((await search({ offset: -5 })).offset, 0)
	})

	await check('structured filters are exact (tag, is, type, orientation, size)', async () => {
		assert.deepEqual(ids(await search({ q: 'tag:kitchen' })), ['kitchen-hero'])
		assert.deepEqual(ids(await search({ q: 'is:untagged' })), ['logo-mark'])
		assert.deepEqual(ids(await search({ q: 'orientation:square' })), ['logo-mark'])
		assert.deepEqual(ids(await search({ q: 'size:>6000' })).sort(), ['night-skyline', 'truck-wrap'])
		assert.deepEqual(ids(await search({ q: 'color:blue' })), ['kitchen-hero'])
		assert.equal((await search({ q: '-tag:kitchen' })).total, 4)
	})

	/* ---------------------------------------------------------------------- */
	section('folder scope')

	await check('a folder id with deep off is that folder only', async () => {
		assert.deepEqual(ids(await search({ folder: fClients._id.toString(), deep: false })), ['bathroom-tile'])
	})

	await check('deep includes subfolders', async () => {
		assert.deepEqual(ids(await search({ folder: fClients._id.toString(), deep: true })).sort(), ['bathroom-tile', 'kitchen-hero'])
	})

	await check('plain browsing defaults to shallow, a query defaults to deep', async () => {
		assert.deepEqual(ids(await search({ folder: fClients._id.toString() })), ['bathroom-tile'])
		assert.deepEqual(ids(await search({ q: 'is:tagged', folder: fClients._id.toString() })).sort(), ['bathroom-tile', 'kitchen-hero'])
	})

	await check('unfiled', async () => {
		assert.equal((await search({ folder: 'unfiled' })).total, 3)
	})

	await check('a folder that does not exist matches nothing, never everything', async () => {
		assert.equal((await search({ folder: new ObjectId().toString() })).total, 0)
		assert.equal((await search({ folder: 'not-an-id' })).total, 0)
	})

	await check('a top-level folder: clause supersedes the folder param', async () => {
		const res = await search({ q: 'folder:Clients/Acme', folder: 'unfiled' })
		assert.deepEqual(ids(res), ['kitchen-hero'])
	})

	/* ---------------------------------------------------------------------- */
	section('text queries: evaluated, ranked, paged')

	await check('a word matches and carries match info', async () => {
		const res = await search({ q: 'kitchen' })
		assert.deepEqual(ids(res), ['kitchen-hero'])
		assert.equal(res.assets[0].match.score > 0, true)
		assert.ok(res.assets[0].match.fields.length > 0)
		assert.equal(res.sort, 'relevance')
	})

	await check('text never leaks another workspace', async () => {
		assert.ok(!ids(await search({ q: 'kitchen' })).includes('kitchen-foreign'))
	})

	await check('AND of words, OR, and negation', async () => {
		assert.deepEqual(ids(await search({ q: 'kitchen remodel' })), ['kitchen-hero'])
		assert.deepEqual(ids(await search({ q: 'kitchen OR bathroom' })).sort(), ['bathroom-tile', 'kitchen-hero'])
		assert.ok(!ids(await search({ q: 'kitchen OR bathroom -bathroom' })).includes('bathroom-tile'))
	})

	await check('caption text is searchable and phrases work', async () => {
		assert.deepEqual(ids(await search({ q: '"work truck"' })), ['truck-wrap'])
	})

	await check('prefix as you type', async () => {
		assert.deepEqual(ids(await search({ q: 'kitch' })), ['kitchen-hero'])
	})

	await check('text plus a filter', async () => {
		assert.deepEqual(ids(await search({ q: 'kitchen color:blue' })), ['kitchen-hero'])
		assert.deepEqual(ids(await search({ q: 'kitchen color:red' })), [])
	})

	await check('a non-relevance sort applies to text results', async () => {
		const res = await search({ q: 'kitchen OR bathroom', sort: 'name' })
		assert.deepEqual(ids(res), ['bathroom-tile', 'kitchen-hero'])
		assert.equal(res.sort, 'name')
	})

	await check('the text page is the right slice', async () => {
		const res = await search({ q: 'kitchen OR bathroom', sort: 'oldest', limit: 1, offset: 1 })
		assert.deepEqual(ids(res), ['bathroom-tile'])
		assert.equal(res.total, 2)
		assert.equal(res.hasMore, false)
	})

	/* ---------------------------------------------------------------------- */
	section('typos, redirects, relaxation')

	await check('a typo is corrected only when nothing matched, and reported', async () => {
		const res = await search({ q: 'kithcen' })
		assert.deepEqual(ids(res), ['kitchen-hero'])
		assert.ok(res.corrections.some((c) => c.to.includes('kitchen')), JSON.stringify(res.corrections))
	})

	await check('a query whose words all exist and match nothing stays empty, uncorrected', async () => {
		const res = await search({ q: 'kitchen bathroom' })
		assert.equal(res.total, 0)
		assert.deepEqual(res.corrections, [])
		assert.deepEqual(res.dropped, [])
	})

	await check('relaxation drops words that exist nowhere', async () => {
		const res = await search({ q: 'kitchen zzzzqqqq' })
		assert.deepEqual(ids(res), ['kitchen-hero'])
		assert.deepEqual(res.dropped, ['zzzzqqqq'])
	})

	await check('relaxation never applies to OR, NOT or phrases', async () => {
		assert.equal((await search({ q: 'kitchen OR zzzzqqqq' })).dropped.length, 0)
		assert.equal((await search({ q: '"kitchen zzzzqqqq"' })).total, 0)
	})

	await check('a tag redirect rewrites tag:old to the new tag', async () => {
		await db.collection('mediaTagRules').insertOne({
			workspaceId: ws,
			from: 'van',
			to: { slug: 'truck', label: 'Truck' },
			createdAt: new Date(),
		})
		const res = await search({ q: 'tag:van' })
		assert.deepEqual(ids(res), ['truck-wrap'])
		assert.deepEqual(res.corrections, [{ from: 'tag:van', to: 'tag:truck' }])
	})

	/* ---------------------------------------------------------------------- */
	section('facets and the tagging backlog')

	await check('facets only when asked', async () => {
		assert.equal((await search({})).facets, null)
		assert.ok((await search({ facets: true })).facets)
	})

	await check('Mongo and in-memory facets agree for identical data', async () => {
		const viaMongo = (await search({ facets: true })).facets
		const folderIndex = buildFolderIndex([fClients, fAcme])
		const viaMemory = S.computeFacets(docs, folderIndex)
		assert.deepEqual(viaMongo, viaMemory)
	})

	await check('facet rules: counts of documents, ordering, folder labels are paths', async () => {
		const { tags, colors, folders: fs } = (await search({ facets: true })).facets
		assert.ok(tags.every((t, i) => i === 0 || tags[i - 1].count > t.count || (tags[i - 1].count === t.count && tags[i - 1].value < t.value)))
		assert.equal(tags.find((t) => t.value === 'kitchen').count, 1)
		assert.deepEqual(colors.map((c) => c.value).sort(), ['blue', 'white'])
		assert.equal(colors.find((c) => c.value === 'blue').hex, '#2f6fed')
		assert.deepEqual(fs.map((f) => f.label).sort(), ['Clients', 'Clients/Acme'])
	})

	await check('text facets cover the matched set only', async () => {
		const { tags } = (await search({ q: 'kitchen OR bathroom', facets: true })).facets
		assert.deepEqual(tags.map((t) => t.value).sort(), ['bathroom', 'kitchen', 'remodel'])
	})

	await check('a tag label is the most frequent label, ties to the smaller', async () => {
		const f = S.computeFacets(
			[
				{ tags: [{ slug: 'x', label: 'Beta', source: 'manual' }], colorNames: [], folderId: null },
				{ tags: [{ slug: 'x', label: 'Alpha', source: 'manual' }], colorNames: [], folderId: null },
				{ tags: [{ slug: 'x', label: 'Beta', source: 'manual' }], colorNames: [], folderId: null },
			],
			buildFolderIndex([]),
		)
		assert.equal(f.tags[0].label, 'Beta')
		const tie = S.computeFacets(
			[
				{ tags: [{ slug: 'x', label: 'Beta', source: 'manual' }], colorNames: [], folderId: null },
				{ tags: [{ slug: 'x', label: 'Alpha', source: 'manual' }], colorNames: [], folderId: null },
			],
			buildFolderIndex([]),
		)
		assert.equal(tie.tags[0].label, 'Alpha')
	})

	await check('pending counts the backlog, whatever the query', async () => {
		assert.equal((await search({})).pending, 1)
		assert.equal((await search({ q: 'kitchen' })).pending, 1)
	})

	/* ---------------------------------------------------------------------- */
	section('resolveSearchIds')

	await check('returns the ids and the same total the search showed', async () => {
		const res = await S.resolveSearchIds(db, ctx, { q: 'kitchen OR bathroom' }, 100)
		const shown = await search({ q: 'kitchen OR bathroom' })
		assert.equal(res.total, shown.total)
		assert.equal(res.overflow, false)
		assert.deepEqual(res.ids.map(String).sort(), docs.filter((d) => ['kitchen-hero', 'bathroom-tile'].includes(d.name)).map((d) => String(d._id)).sort())
	})

	await check('no-text ids honour the folder scope and the workspace', async () => {
		const res = await S.resolveSearchIds(db, ctx, { q: '', folder: 'unfiled' }, 100)
		assert.equal(res.total, 3)
		assert.equal(res.ids.length, 3)
	})

	await check('past the cap it reports overflow and returns no ids', async () => {
		const res = await S.resolveSearchIds(db, ctx, { q: '' }, 2)
		assert.equal(res.overflow, true)
		assert.equal(res.total, 5)
		assert.deepEqual(res.ids, [])
		const text = await S.resolveSearchIds(db, ctx, { q: 'kitchen OR bathroom' }, 1)
		assert.equal(text.overflow, true)
	})

	await check('it never relaxes', async () => {
		const res = await S.resolveSearchIds(db, ctx, { q: 'kitchen zzzzqqqq' }, 100)
		assert.equal(res.total, 0)
	})

	/* ---------------------------------------------------------------------- */
	section('suggestions (pure)')

	const tagStats = [
		{ slug: 'kitchen', label: 'Kitchen', count: 12, manual: 12, auto: 0 },
		{ slug: 'kitchen-remodel', label: 'Kitchen remodel', count: 4, manual: 4, auto: 0 },
		{ slug: 'bathroom', label: 'Bathroom', count: 7, manual: 7, auto: 0 },
		{ slug: 'truck', label: 'Truck', count: 3, manual: 3, auto: 0 },
	]
	const fi = buildFolderIndex([fClients, fAcme])
	const sug = (input) => G.suggestFromData(input, { tags: tagStats, folders: fi })

	await check('empty or whitespace-ending input suggests nothing', async () => {
		assert.deepEqual(sug(''), [])
		assert.deepEqual(sug('kitchen '), [])
	})

	await check('#fo and tag:fo complete tags, exact then prefix, by count', async () => {
		const a = sug('#kitchen')
		assert.deepEqual(a.map((s) => s.insert), ['tag:kitchen', 'tag:kitchen-remodel'])
		assert.deepEqual(sug('tag:kit').map((s) => s.insert), ['tag:kitchen', 'tag:kitchen-remodel'])
		assert.equal(a[0].count, 12)
	})

	await check('tag completion is typo tolerant', async () => {
		assert.ok(sug('#bathrom').some((s) => s.insert === 'tag:bathroom'))
	})

	await check('negation and earlier clauses are preserved in the insert', async () => {
		assert.equal(sug('-tag:tru')[0].insert, '-tag:truck')
		assert.equal(sug('kitchen #bath')[0].insert, 'tag:bathroom')
	})

	await check('folder: completes paths and quotes when needed', async () => {
		const out = sug('folder:ac')
		assert.deepEqual(out.map((s) => s.insert), ['folder:Clients/Acme'])
		const spaced = G.suggestFromData('folder:big', {
			tags: [],
			folders: buildFolderIndex([{ _id: new ObjectId(), parentId: null, name: 'Big Co' }]),
		})
		assert.equal(spaced[0].insert, 'folder:"Big Co"')
		assert.ok(sug('folder:no').some((s) => s.insert === 'folder:none'))
	})

	await check('operator values: colours carry swatches, is: has unreviewed, added: has presets', async () => {
		const colours = sug('color:bl')
		assert.deepEqual(colours.map((s) => s.insert), ['color:blue', 'color:black'])
		assert.ok(colours.every((s) => /^#/.test(s.swatch)))
		assert.ok(sug('is:un').some((s) => s.insert === 'is:unreviewed'))
		assert.ok(sug('is:un').some((s) => s.insert === 'is:untagged'))
		assert.deepEqual(sug('added:').map((s) => s.label), ['today', 'yesterday', '7d', '30d', 'month', 'year'])
		assert.deepEqual(sug('type:png,j').map((s) => s.insert), ['type:png,jpg'])
	})

	await check('a bare word: operators, then tags, then folders, then search last', async () => {
		const out = sug('col')
		assert.equal(out[0].kind, 'operator')
		assert.equal(out[0].insert, 'color:')
		assert.equal(out.at(-1).kind, 'search')
		assert.equal(out.at(-1).label, 'Search for "col"')
		const kinds = out.map((s) => s.kind)
		assert.deepEqual(kinds, [...kinds].sort((a, b) => ['operator', 'tag', 'folder', 'search'].indexOf(a) - ['operator', 'tag', 'folder', 'search'].indexOf(b)))
	})

	await check('the search row is never first and the total is capped at 10', async () => {
		assert.deepEqual(sug('zzzzzz'), [])
		const many = Array.from({ length: 40 }, (_, i) => ({ slug: `tag-${i}`, label: `Tag ${i}`, count: i, manual: i, auto: 0 }))
		const out = G.suggestFromData('t', { tags: many, folders: fi })
		assert.ok(out.length <= 10)
		assert.notEqual(out[0].kind, 'search')
		assert.equal(out.at(-1).kind, 'search')
	})

	await check('a quoted token is one token', async () => {
		assert.deepEqual(sug('name:"grand op'), [])
	})

	await check('suggest() reads this workspace\'s tags and folders from the database', async () => {
		const out = await G.suggest(db, ctx, '#kitch')
		assert.deepEqual(out.map((s) => s.insert), ['tag:kitchen'])
		const f = await G.suggest(db, ctx, 'folder:acm')
		assert.deepEqual(f.map((s) => s.insert), ['folder:Clients/Acme'])
		assert.deepEqual(await G.suggest(db, ctx, ''), [])
	})
} finally {
	try {
		for (const id of [ws, other]) {
			await assets?.deleteMany({ workspaceId: id })
			await folders?.deleteMany({ workspaceId: id })
			await db?.collection('mediaTagRules').deleteMany({ workspaceId: id })
			V.invalidateVocabulary(id)
		}
	} catch (error) {
		console.error('cleanup failed', error)
	}
	await client.close()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
