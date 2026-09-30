/**
 * Proves the authorization boundary rather than assuming it: user B must never be
 * able to read or change user A's site. Run against the dev server.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

const rand = () => Math.random().toString(36).slice(2, 10)

async function jar(fetchImpl = fetch) {
	const cookies = new Map()
	return {
		cookies,
		async call(path, init = {}) {
			const headers = new Headers(init.headers ?? {})
			if (cookies.size)
				headers.set(
					'cookie',
					[...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
				)
			const response = await fetchImpl(`${BASE}${path}`, {
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

	const csrfResponse = await session.call('/api/auth/csrf')
	const { csrfToken } = await csrfResponse.json()

	const signedIn = await session.call('/api/auth/callback/credentials', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ email, password, csrfToken }),
	})
	if (signedIn.status >= 400)
		throw new Error(`signin failed: ${signedIn.status}`)

	const check = await session.call('/api/auth/session')
	const body = await check.json()
	if (!body?.user?.id) throw new Error('no session established')
	return session
}

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

const aEmail = `a_${rand()}@example.test`
const bEmail = `b_${rand()}@example.test`
const a = await signUpAndIn(aEmail, 'password-aaaa-1111')
const b = await signUpAndIn(bEmail, 'password-bbbb-2222')
record('two accounts created and signed in', true)

const created = await a.call('/api/sites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		name: 'A private site',
		site: { version: 1, pages: [] },
	}),
})
const { site } = await created.json()
record('owner can create a site', created.status === 201, `${created.status}`)

const ownRead = await a.call(`/api/sites/${site.id}`)
record('owner can read own site', ownRead.status === 200, `${ownRead.status}`)

// The whole point of the exercise.
for (const [method, init] of [
	['GET', {}],
	[
		'PATCH',
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'pwned', rev: site.rev }),
		},
	],
	['DELETE', { method: 'DELETE' }],
]) {
	const response = await b.call(`/api/sites/${site.id}`, init)
	record(
		`stranger ${method} is refused`,
		response.status === 404 || response.status === 403,
		`got ${response.status}`,
	)
}

for (const [label, init] of [
	[
		'media register',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: 'x',
				url: 'https://example.com/x.webp',
				pathname: `sites/${site.id}/x.webp`,
				bytes: 1,
				contentType: 'image/webp',
			}),
		},
	],
	['media delete', { method: 'DELETE' }],
]) {
	const response = await b.call(`/api/sites/${site.id}/media?id=any`, init)
	record(
		`stranger ${label} is refused`,
		response.status === 404 || response.status === 403,
		`got ${response.status}`,
	)
}

const anon = await jar()
for (const [label, path, init] of [
	['list sites', '/api/sites', {}],
	['read site', `/api/sites/${site.id}`, {}],
]) {
	const response = await anon.call(path, init)
	record(
		`signed-out ${label} is refused`,
		response.status === 401 || response.status === 404,
		`got ${response.status}`,
	)
}

// A blob path belonging to another site must not attach here.
const crossPath = await a.call(`/api/sites/${site.id}/media`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		name: 'x',
		url: 'https://example.com/x.webp',
		pathname: 'sites/someone-else/x.webp',
		bytes: 1,
		contentType: 'image/webp',
	}),
})
record(
	'media path outside the site is refused',
	crossPath.status === 400,
	`got ${crossPath.status}`,
)

const stale = await a.call(`/api/sites/${site.id}`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ name: 'stale write', rev: 999 }),
})
record(
	'stale revision is rejected',
	stale.status === 409,
	`got ${stale.status}`,
)

// The project list must be scoped to the account, not to "every site".
const bSite = await b.call('/api/sites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ name: 'B private', site: { version: 1, pages: [] } }),
})
await bSite.json()
const aList = await (await a.call('/api/sites')).json()
record(
	"another account's project is not in this list",
	aList.sites.every((row) => row.name !== 'B private'),
	`${aList.sites.length} rows`,
)

// A member of the account with a narrow role: they can look, not touch. The
// membership is written directly because the invitation email is a separate
// concern from the authorization being proved here.
const { MongoClient, ObjectId } = await import('mongodb')
const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const mongo = client.db()

const aUser = await mongo.collection('users').findOne({ email: aEmail })
const bUser = await mongo.collection('users').findOne({ email: bEmail })
const aWorkspace = await mongo
	.collection('workspaces')
	.findOne({ ownerId: aUser._id.toString() })

const viewerRole = await mongo.collection('workspaceRoles').insertOne({
	workspaceId: aWorkspace._id,
	name: `Viewer ${rand()}`,
	// Deliberately includes a permission that does not exist, to prove the
	// sanitiser drops it rather than granting something unknown.
	permissions: ['projects.view', 'projects.everything'],
	system: false,
	createdAt: new Date(),
})
await mongo.collection('workspaceMembers').insertOne({
	workspaceId: aWorkspace._id,
	userId: bUser._id.toString(),
	roleId: viewerRole.insertedId,
	createdAt: new Date(),
})

// Being a member is not the same as working in it: B has to select the account,
// and that selection is itself membership-checked.
const switched = await b.call('/api/account/workspace', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ workspaceId: aWorkspace._id.toString() }),
})
record(
	'a member can switch into the account',
	switched.status === 200,
	`got ${switched.status}`,
)

const strangerSwitch = await anon.call('/api/account/workspace', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ workspaceId: aWorkspace._id.toString() }),
})
record(
	'signed-out switch is refused',
	strangerSwitch.status === 401,
	`got ${strangerSwitch.status}`,
)

const shared = await a.call('/api/sites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ name: 'Shared', site: { version: 1, pages: [] } }),
})
const { site: sharedSite } = await shared.json()

const viewerRead = await b.call(`/api/sites/${sharedSite.id}`)
record(
	'a viewer on the account can read the project',
	viewerRead.status === 200,
	`got ${viewerRead.status}`,
)

const viewerWrite = await b.call(`/api/sites/${sharedSite.id}`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ name: 'viewer edit', rev: sharedSite.rev }),
})
record(
	'a viewer cannot edit the project',
	viewerWrite.status === 403,
	`got ${viewerWrite.status}`,
)

const viewerDelete = await b.call(`/api/sites/${sharedSite.id}`, {
	method: 'DELETE',
})
record(
	'a viewer cannot delete the project',
	viewerDelete.status === 403,
	`got ${viewerDelete.status}`,
)

const viewerPublish = await b.call(`/api/sites/${sharedSite.id}/settings`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ status: 'live' }),
})
record(
	'a viewer cannot set the project live',
	viewerPublish.status === 403,
	`got ${viewerPublish.status}`,
)

const viewerTeam = await b.call('/api/account/team')
record(
	'a viewer cannot read the team',
	viewerTeam.status === 403,
	`got ${viewerTeam.status}`,
)

const viewerInvite = await b.call('/api/account/invites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		email: `x_${rand()}@example.test`,
		roleId: viewerRole.insertedId.toString(),
	}),
})
record(
	'a viewer cannot invite anyone',
	viewerInvite.status === 403,
	`got ${viewerInvite.status}`,
)

// The owner is not gated by a role, so the same calls must work for them.
const ownerPublish = await a.call(`/api/sites/${sharedSite.id}/settings`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ status: 'live' }),
})
record(
	'a project with no pages cannot go live',
	ownerPublish.status === 400,
	`got ${ownerPublish.status}`,
)

const adminRole = await mongo
	.collection('workspaceRoles')
	.findOne({ workspaceId: aWorkspace._id, system: true })
const lockAdmin = await a.call(`/api/account/roles/${adminRole._id}`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ permissions: [] }),
})
record(
	'the Admin role cannot be narrowed',
	lockAdmin.status === 400,
	`got ${lockAdmin.status}`,
)

const roleList = await (await a.call('/api/account/roles')).json()
const viewer = roleList.roles.find(
	(role) => role.id === viewerRole.insertedId.toString(),
)
record(
	'an unknown permission is not granted',
	Boolean(viewer) && !viewer.permissions.includes('projects.everything'),
	viewer ? viewer.permissions.join(',') : 'role missing',
)

const anonInvite = await anon.call('/api/account/invites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ email: 'x@example.test', roleId: '1' }),
})
record(
	'signed-out invite is refused',
	anonInvite.status === 401,
	`got ${anonInvite.status}`,
)

await client.close()

await a.call(`/api/sites/${site.id}`, { method: 'DELETE' })
await a.call(`/api/sites/${sharedSite.id}`, { method: 'DELETE' })

const failed = results.filter((r) => !r.pass)
for (const r of results)
	console.log(
		`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`,
	)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
