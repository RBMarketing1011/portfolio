/**
 * End to end, over HTTP, against a running dev server (`pnpm dev`):
 *
 *   node --env-file=.env scripts/prove-media.mjs
 *
 * Real users, real sessions, real routes, the real dev database and the real
 * Blob store (a handful of tiny generated images, all removed at the end). It does
 * NOT call Claude: with no ANTHROPIC_API_KEY the library says so, and that is the
 * behaviour proved here. The AI path is proved with injected stubs in
 * prove-media-tagger / prove-media-process.
 *
 * The attacks a design review reproduced are in here on purpose: forging the url
 * of someone else's blob, naming someone else's account, a stale "delete all N".
 */
import { MongoClient, ObjectId } from 'mongodb'
import { del, head, put } from '@vercel/blob'
import sharp from 'sharp'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const rand = () => Math.random().toString(36).slice(2, 10)

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })
const expectStatus = (name, response, status) =>
	record(name, response.status === status, `got ${response.status}, want ${status}`)

async function jar() {
	const cookies = new Map()
	return {
		async call(path, init = {}) {
			const headers = new Headers(init.headers ?? {})
			if (cookies.size)
				headers.set(
					'cookie',
					[...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
				)
			const response = await fetch(`${BASE}${path}`, {
				...init,
				headers,
				redirect: 'manual',
			})
			for (const raw of response.headers.getSetCookie?.() ?? []) {
				const [pair] = raw.split(';')
				const index = pair.indexOf('=')
				cookies.set(pair.slice(0, index), pair.slice(index + 1))
			}
			return response
		},
	}
}

async function signUpAndIn(email, password) {
	const session = await jar()
	const registered = await session.call('/api/auth/register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	})
	if (!registered.ok) throw new Error(`register failed: ${registered.status}`)
	const { csrfToken } = await (await session.call('/api/auth/csrf')).json()
	await session.call('/api/auth/callback/credentials', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ email, password, csrfToken }),
	})
	const check = await (await session.call('/api/auth/session')).json()
	if (!check?.user?.id) throw new Error('no session established')
	return session
}

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db()
const blobUrls = []
const workspaces = []
const emails = []

// A throwaway image whose colour, size and name are known.
const png = (color, width = 320, height = 200) =>
	sharp({ create: { width, height, channels: 3, background: color } })
		.png()
		.toBuffer()

async function putBlob(workspaceId, name, buffer) {
	const blob = await put(`workspaces/${workspaceId}/media/${name}`, buffer, {
		access: 'public',
		addRandomSuffix: true,
		contentType: 'image/png',
	})
	blobUrls.push(blob.url)
	return blob
}

const exists = (url) =>
	head(url).then(
		() => true,
		() => false,
	)

try {
	const ownerEmail = `e2e_media_owner_${rand()}@example.com`
	const otherEmail = `e2e_media_other_${rand()}@example.com`
	emails.push(ownerEmail, otherEmail)
	const owner = await signUpAndIn(ownerEmail, 'password-owner-1111')
	const other = await signUpAndIn(otherEmail, 'password-other-2222')
	// Touching the account area creates each person's own account.
	await owner.call('/api/account/team')
	await other.call('/api/account/team')

	const workspaceOf = async (email) => {
		const user = await db.collection('users').findOne({ email })
		return db
			.collection('workspaces')
			.findOne({ ownerId: user._id.toString() })
	}
	const ownerWs = await workspaceOf(ownerEmail)
	const otherWs = await workspaceOf(otherEmail)
	workspaces.push(ownerWs._id, otherWs._id)
	const OWNER = ownerWs._id.toString()
	const OTHER = otherWs._id.toString()

	const api = (session, ws) => (path, init = {}) =>
		session.call(`/api/account/media${path}`, {
			...init,
			headers: {
				'Content-Type': 'application/json',
				...(ws ? { 'x-media-workspace': ws } : {}),
				...(init.headers ?? {}),
			},
		})
	const ownerApi = api(owner, OWNER)
	const otherApi = api(other, OTHER)
	const json = (response) => response.json().catch(() => ({}))

	/* ---------------------------------------------------------------- access */
	const anon = await jar()
	expectStatus(
		'a signed-out caller is refused',
		await anon.call('/api/account/media', {
			headers: { 'x-media-workspace': OWNER },
		}),
		401,
	)
	expectStatus(
		'a request with no x-media-workspace header is refused, not guessed',
		await api(owner, null)(''),
		400,
	)
	expectStatus(
		'a malformed workspace header is refused',
		await api(owner, 'not-an-id')(''),
		400,
	)
	expectStatus(
		'naming an account you are not in is a 404, not a 403',
		await api(other, OWNER)(''),
		404,
	)
	expectStatus('the owner can list their library', await ownerApi(''), 200)

	/* --------------------------------------------------------------- folders */
	const folderRes = await ownerApi('/folders', {
		method: 'POST',
		body: JSON.stringify({ name: 'Clients', parentId: null }),
	})
	expectStatus('a folder can be created', folderRes, 201)
	const clients = (await json(folderRes)).folder
	const acme = (
		await json(
			await ownerApi('/folders', {
				method: 'POST',
				body: JSON.stringify({ name: 'Acme Plumbing', parentId: clients?.id }),
			}),
		)
	).folder
	expectStatus(
		'a sibling with the same name is refused case-insensitively',
		await ownerApi('/folders', {
			method: 'POST',
			body: JSON.stringify({ name: 'CLIENTS', parentId: null }),
		}),
		409,
	)
	expectStatus(
		'non-Latin sibling names do not collide with each other',
		await ownerApi('/folders', {
			method: 'POST',
			body: JSON.stringify({ name: '日本', parentId: null }),
		}),
		201,
	)
	expectStatus(
		'a second non-Latin name is its own folder',
		await ownerApi('/folders', {
			method: 'POST',
			body: JSON.stringify({ name: '東京', parentId: null }),
		}),
		201,
	)
	expectStatus(
		'a folder cannot move into its own subtree',
		await ownerApi(`/folders/${clients?.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ parentId: acme?.id }),
		}),
		400,
	)

	/* ------------------------------------------------------------- registering */
	const blue = await putBlob(OWNER, 'kitchen-remodel-after.png', await png('#0197f6'))
	const registered = await ownerApi('', {
		method: 'POST',
		body: JSON.stringify({
			url: blue.url,
			pathname: blue.pathname,
			filename: 'kitchen-remodel-after.png',
			folderId: acme?.id ?? null,
		}),
	})
	expectStatus('registering an uploaded blob creates the asset', registered, 201)
	const created = await json(registered)
	const asset = created.asset
	record(
		'the analysis is stored: size, format and the colour name',
		asset?.width === 320 &&
			asset?.height === 200 &&
			asset?.format === 'png' &&
			asset?.colors?.[0]?.name === 'blue',
		JSON.stringify({ w: asset?.width, h: asset?.height, c: asset?.colors?.[0] }),
	)
	record(
		'file-name tags are derived without any AI',
		['kitchen', 'remodel'].every((word) =>
			asset?.tags?.some((tag) => tag.slug === word && tag.via === 'filename'),
		),
		JSON.stringify(asset?.tags?.map((tag) => tag.slug)),
	)
	record(
		'the folder path is resolved for the browser',
		asset?.folderPath === 'Clients/Acme Plumbing',
		asset?.folderPath,
	)
	record(
		'nothing internal leaks into the DTO',
		!('terms' in asset) &&
			!('workspaceId' in asset) &&
			!('uploadedBy' in asset) &&
			!('rev' in asset),
	)
	const again = await json(
		await ownerApi('', {
			method: 'POST',
			body: JSON.stringify({
				url: blue.url,
				pathname: blue.pathname,
				filename: 'kitchen-remodel-after.png',
				folderId: null,
			}),
		}),
	)
	record(
		'registering the same blob twice is idempotent',
		again.asset?.id === asset?.id,
	)
	const count = await db
		.collection('mediaAssets')
		.countDocuments({ workspaceId: ownerWs._id, pathname: blue.pathname })
	record('still exactly one document for that pathname', count === 1, `${count}`)

	const status = await json(await ownerApi('/process'))
	const aiOn = Boolean(process.env.ANTHROPIC_API_KEY)
	record(
		'the AI status reports whether auto-tagging is configured',
		status.configured === aiOn,
		JSON.stringify(status),
	)
	if (!aiOn)
		record(
			'with no key the new image is skipped for want of one, not stuck pending',
			asset?.tagging?.status === 'skipped' &&
				asset?.tagging?.reason === 'not_configured',
			JSON.stringify(asset?.tagging),
		)

	/* ---------------------------------------------- the attacks, by design */
	const victim = await putBlob(OTHER, 'private-logo.png', await png('#cc2200'))
	const forged = await otherApi('', {
		method: 'POST',
		body: JSON.stringify({
			// The pathname is inside the attacker's own account; the url is the
			// OWNER's blob. A naive "delete on rejection" would destroy it.
			url: blue.url,
			pathname: victim.pathname,
			filename: 'x.png',
			folderId: null,
		}),
	})
	expectStatus('registering with a forged url is refused', forged, 400)
	record(
		'THE FORGED URL DID NOT DELETE THE OWNER\'S BLOB',
		await exists(blue.url),
	)
	const foreign = await otherApi('', {
		method: 'POST',
		body: JSON.stringify({
			url: blue.url,
			pathname: blue.pathname,
			filename: 'x.png',
			folderId: null,
		}),
	})
	expectStatus(
		'registering a pathname in someone else\'s account is refused',
		foreign,
		400,
	)
	record('and the blob is still there', await exists(blue.url))
	const attackerDocs = await db
		.collection('mediaAssets')
		.countDocuments({ workspaceId: otherWs._id })
	record('the attacker\'s library gained nothing', attackerDocs === 0, `${attackerDocs}`)

	const token = await ownerApi('/upload', {
		method: 'POST',
		body: JSON.stringify({
			type: 'blob.generate-client-token',
			payload: {
				pathname: `workspaces/${OWNER}/media/token-check.png`,
				clientPayload: JSON.stringify({ workspaceId: OWNER }),
				multipart: false,
			},
		}),
	})
	record(
		'an upload token is issued for your own prefix',
		token.status === 200,
		`got ${token.status}`,
	)
	const badToken = await ownerApi('/upload', {
		method: 'POST',
		body: JSON.stringify({
			type: 'blob.generate-client-token',
			payload: {
				pathname: `workspaces/${OTHER}/media/token-check.png`,
				clientPayload: JSON.stringify({ workspaceId: OWNER }),
				multipart: false,
			},
		}),
	})
	record(
		'an upload token for someone else\'s prefix is refused',
		badToken.status >= 400 && badToken.status < 500,
		`got ${badToken.status}`,
	)
	const wrongAccountToken = await ownerApi('/upload', {
		method: 'POST',
		body: JSON.stringify({
			type: 'blob.generate-client-token',
			payload: {
				pathname: `workspaces/${OTHER}/media/token-check.png`,
				clientPayload: JSON.stringify({ workspaceId: OTHER }),
				multipart: false,
			},
		}),
	})
	record(
		'naming an account you are not in inside the upload payload is refused',
		wrongAccountToken.status === 404,
		`got ${wrongAccountToken.status}`,
	)

	/* ---------------------------------------------------------- duplicates */
	const twin = await putBlob(OWNER, 'same-picture.png', await png('#0197f6'))
	const dup = await ownerApi('', {
		method: 'POST',
		body: JSON.stringify({
			url: twin.url,
			pathname: twin.pathname,
			filename: 'same-picture.png',
			folderId: null,
		}),
	})
	const dupBody = await json(dup)
	record(
		'a byte-identical upload is reported as a duplicate of the original',
		dup.status === 200 &&
			dupBody.status === 'duplicate' &&
			dupBody.asset?.id === asset?.id,
		`${dup.status} ${dupBody.status}`,
	)
	record(
		'the duplicate\'s blob was discarded and the original kept',
		!(await exists(twin.url)) && (await exists(blue.url)),
	)

	/* -------------------------------------------------------------- more data */
	const red = await putBlob(OWNER, 'red-van-front.png', await png('#cc0000', 400, 300))
	const redAsset = (
		await json(
			await ownerApi('', {
				method: 'POST',
				body: JSON.stringify({
					url: red.url,
					pathname: red.pathname,
					filename: 'red-van-front.png',
					folderId: null,
				}),
			}),
		)
	).asset
	const green = await putBlob(OWNER, 'garden-wide.png', await png('#2e8b3d', 1200, 400))
	const greenAsset = (
		await json(
			await ownerApi('', {
				method: 'POST',
				body: JSON.stringify({
					url: green.url,
					pathname: green.pathname,
					filename: 'garden-wide.png',
					folderId: null,
				}),
			}),
		)
	).asset

	/* ------------------------------------------------------------- tagging */
	const tagged = await ownerApi(`/${redAsset?.id}`, {
		method: 'PATCH',
		body: JSON.stringify({ addTags: ['Work Van', 'Fleet'] }),
	})
	expectStatus('tags can be added to an image', tagged, 200)
	const taggedBody = await json(tagged)
	record(
		'manual tags are stored as manual with a slug',
		taggedBody.asset?.tags?.some(
			(tag) => tag.slug === 'work-van' && tag.source === 'manual',
		),
		JSON.stringify(taggedBody.asset?.tags),
	)
	record(
		'caption edits mark the caption as the person\'s',
		(
			await json(
				await ownerApi(`/${redAsset?.id}`, {
					method: 'PATCH',
					body: JSON.stringify({ caption: 'A red work van, front view' }),
				}),
			)
		).asset?.caption === 'A red work van, front view',
	)

	/* -------------------------------------------------------------- search */
	const search = async (q, extra = '') => {
		const response = await ownerApi(
			`?q=${encodeURIComponent(q)}&facets=1${extra}`,
		)
		return { response, body: await json(response) }
	}
	const ids = (result) => result.body.assets?.map((a) => a.id) ?? []

	let r = await search('')
	record(
		'browsing returns everything, newest first',
		r.body.total === 3 && ids(r)[0] === greenAsset?.id,
		`total ${r.body.total}`,
	)
	r = await search('van')
	record(
		'free text finds a manual tag',
		ids(r).length === 1 && ids(r)[0] === redAsset?.id,
		JSON.stringify(ids(r)),
	)
	record(
		'and says why it matched',
		r.body.assets?.[0]?.match?.fields?.includes('tag'),
		JSON.stringify(r.body.assets?.[0]?.match),
	)
	r = await search('vans')
	record(
		'stemming: a plural finds the singular',
		ids(r)[0] === redAsset?.id,
		JSON.stringify(ids(r)),
	)
	r = await search('kitche')
	record(
		'prefix: a half-typed word finds the image',
		ids(r)[0] === asset?.id,
		JSON.stringify(ids(r)),
	)
	r = await search('kithcen')
	record(
		'typo tolerance: a transposed word is corrected and says so',
		ids(r)[0] === asset?.id && r.body.corrections?.some((c) => c.to === 'kitchen'),
		JSON.stringify({ ids: ids(r), c: r.body.corrections }),
	)
	r = await search('color:blue')
	record('color:blue finds the blue image', ids(r).join() === asset?.id)
	r = await search('type:png width:>1000')
	record('numeric operators combine', ids(r).join() === greenAsset?.id)
	r = await search('orientation:landscape -color:blue')
	record(
		'negation excludes',
		ids(r).includes(redAsset?.id) && !ids(r).includes(asset?.id),
	)
	r = await search('kitchen OR van')
	record(
		'OR unions',
		ids(r).length === 2 && ids(r).includes(asset?.id) && ids(r).includes(redAsset?.id),
	)
	r = await search('"red work van"')
	record(
		'a quoted phrase is matched in order',
		ids(r).join() === redAsset?.id,
		JSON.stringify(ids(r)),
	)
	r = await search('van zzzunknownword')
	record(
		'relaxation: an absent word is dropped, said, and the rest still finds the image',
		ids(r)[0] === redAsset?.id && r.body.dropped?.includes('zzzunknownword'),
		JSON.stringify({ ids: ids(r), d: r.body.dropped }),
	)
	r = await search('', `&folder=${acme?.id}`)
	record('a folder scopes the view', ids(r).join() === asset?.id)
	r = await search('', '&folder=unfiled')
	record(
		'Unfiled shows only images with no folder',
		ids(r).length === 2 && !ids(r).includes(asset?.id),
	)
	r = await search('kitchen', `&folder=${clients?.id}`)
	record(
		'searching inside a folder includes its subfolders',
		ids(r).join() === asset?.id,
	)
	r = await search('is:untagged')
	record(
		'is:untagged is the images with no tags at all',
		ids(r).join() === '' || ids(r).every((id) => id !== redAsset?.id),
	)
	r = await search('is:unreviewed')
	record(
		'is:unreviewed finds images carrying an automatic tag nobody has kept',
		ids(r).includes(asset?.id),
	)
	r = await search('', '&sort=largest')
	record(
		'sorting by size works',
		ids(r)[0] === greenAsset?.id,
		JSON.stringify(ids(r)),
	)
	const page1 = await search('', '&limit=2')
	const page2 = await search('', '&limit=2&offset=2')
	const seen = new Set([...ids(page1), ...ids(page2)])
	record(
		'paging covers every image exactly once',
		page1.body.hasMore === true && seen.size === 3,
		`${seen.size}`,
	)
	record(
		'facets carry tags, colours and folders',
		Array.isArray(page1.body.facets?.tags) &&
			Array.isArray(page1.body.facets?.colors) &&
			Array.isArray(page1.body.facets?.folders),
	)
	r = await search('a'.repeat(5000))
	record('an enormous query is handled, not a 500', r.response.status < 500)
	r = await search('((((((((((((((((((((((((((((((((a))))))))))))))))))))))))))))))))')
	record('deeply nested parentheses do not break the planner', r.response.status === 200)
	r = await search('tag:$ne')
	record('operator-looking input is inert', r.response.status === 200)
	const suggest = await json(await ownerApi('/suggest?q=colo'))
	record(
		'suggestions offer the colour operator',
		suggest.suggestions?.some((s) => s.insert?.startsWith('color:')),
		JSON.stringify(suggest.suggestions?.slice(0, 3)),
	)

	/* ---------------------------------------------------------------- tags */
	const tags = await json(await ownerApi('/tags'))
	record(
		'the tag list counts usage',
		tags.tags?.some((tag) => tag.slug === 'work-van' && tag.manual === 1),
		JSON.stringify(tags.tags?.slice(0, 4)),
	)
	const renamed = await ownerApi('/tags/work-van', {
		method: 'PATCH',
		body: JSON.stringify({ label: 'Service Van' }),
	})
	const renamedBody = await json(renamed)
	record(
		'renaming a tag reports its new slug',
		renamed.status === 200 && renamedBody.slug === 'service-van',
		JSON.stringify(renamedBody),
	)
	r = await search('tag:work-van')
	record(
		'a saved search or bookmark with the OLD tag still works, and says so',
		ids(r).join() === redAsset?.id &&
			r.body.corrections?.some((c) => c.from === 'tag:work-van'),
		JSON.stringify({ ids: ids(r), c: r.body.corrections }),
	)
	const saved = await ownerApi('/saved', {
		method: 'POST',
		body: JSON.stringify({ name: 'Vans', query: 'tag:service-van' }),
	})
	expectStatus('a search can be saved', saved, 201)
	expectStatus(
		'saved-search names are unique',
		await ownerApi('/saved', {
			method: 'POST',
			body: JSON.stringify({ name: 'vans', query: 'x' }),
		}),
		409,
	)
	expectStatus(
		'another account cannot read your saved searches',
		await otherApi('/saved'),
		200,
	)
	record(
		'and sees none of them',
		((await json(await otherApi('/saved'))).saved ?? []).length === 0,
	)

	/* ----------------------------------------------------------- bulk + delete */
	const move = await ownerApi('/bulk', {
		method: 'POST',
		body: JSON.stringify({
			action: 'move',
			target: { ids: [redAsset?.id, greenAsset?.id] },
			folderId: clients?.id,
		}),
	})
	expectStatus('images can be moved in bulk', move, 200)
	r = await search('', `&folder=${clients?.id}&deep=0`)
	record('and land in that folder', ids(r).length === 2, JSON.stringify(ids(r)))
	const stale = await ownerApi('/bulk', {
		method: 'POST',
		body: JSON.stringify({
			action: 'delete',
			target: { search: { q: 'type:png', expect: 99 } },
		}),
	})
	expectStatus('a stale "delete all N" is refused', stale, 409)
	record(
		'and nothing was deleted by it',
		(await db.collection('mediaAssets').countDocuments({ workspaceId: ownerWs._id })) === 3,
	)
	expectStatus(
		'another account cannot bulk-delete your images by id',
		await otherApi('/bulk', {
			method: 'POST',
			body: JSON.stringify({
				action: 'delete',
				target: { ids: [asset?.id] },
			}),
		}),
		200,
	)
	record(
		'it affects nothing',
		(await db.collection('mediaAssets').countDocuments({ workspaceId: ownerWs._id })) === 3 &&
			(await exists(blue.url)),
	)
	expectStatus(
		'another account gets a 404 for your image by id',
		await otherApi(`/${asset?.id}`),
		404,
	)
	const retag = await ownerApi('/bulk', {
		method: 'POST',
		body: JSON.stringify({ action: 'retag', target: { ids: [asset?.id] } }),
	})
	record(
		'retag without a key is a clear 409',
		aiOn ? retag.status === 200 : retag.status === 409,
		`got ${retag.status}`,
	)

	const del1 = await ownerApi(`/${greenAsset?.id}`, { method: 'DELETE' })
	expectStatus('an image can be deleted', del1, 200)
	record(
		'deleting removes the document and the blob',
		!(await exists(green.url)) &&
			(await db.collection('mediaAssets').countDocuments({ _id: new ObjectId(greenAsset?.id) })) === 0,
	)

	/* ------------------------------------------------- account deletion hook */
	const gone = await other.call('/api/account/settings', {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ confirm: otherWs.name }),
	})
	record('an account can be deleted', gone.status === 200, `got ${gone.status}`)
	record(
		'deleting it removed that account\'s library blobs',
		!(await exists(victim.url)),
	)
	record(
		'and left the other account\'s library alone',
		(await exists(blue.url)) &&
			(await db.collection('mediaAssets').countDocuments({ workspaceId: ownerWs._id })) === 2,
	)
} finally {
	// Everything this run made, whether or not it passed.
	for (const url of blobUrls) await del(url).catch(() => {})
	for (const id of workspaces)
		for (const name of [
			'mediaAssets',
			'mediaFolders',
			'mediaTagRules',
			'mediaSavedSearches',
		])
			await db.collection(name).deleteMany({ workspaceId: id })
	await db
		.collection('mediaAiUsage')
		.deleteMany({ _id: { $in: workspaces.map((id) => new RegExp(`^${id}:`)) } })
	const users = await db
		.collection('users')
		.find({ email: { $in: emails } })
		.toArray()
	await db.collection('users').deleteMany({ _id: { $in: users.map((u) => u._id) } })
	await db.collection('workspaces').deleteMany({ _id: { $in: workspaces } })
	for (const name of ['workspaceRoles', 'workspaceMembers', 'workspaceInvites'])
		await db.collection(name).deleteMany({ workspaceId: { $in: workspaces } })
	await client.close()
}

for (const { name, pass, detail } of results)
	console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${!pass && detail ? `  (${detail})` : ''}`)
const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
