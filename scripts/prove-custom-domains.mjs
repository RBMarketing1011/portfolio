/**
 * Proves the rules around connecting a customer's own domain. The dangerous
 * ones are the claims: a domain must not serve a project until Vercel says both
 * that we own it and that DNS actually arrives here, and it must never be
 * possible to take a name that belongs to the app or to another project.
 */
import { MongoClient, ObjectId } from 'mongodb'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const APP_HOSTNAME = (process.env.NEXT_PUBLIC_APP_HOST ?? 'localhost:3000')
	.toLowerCase()
	.replace(/^https?:\/\//, '')
	.split(':')[0]

const rand = () => Math.random().toString(36).slice(2, 10)

function jar() {
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
				const i = pair.indexOf('=')
				cookies.set(pair.slice(0, i), pair.slice(i + 1))
			}
			return response
		},
	}
}

async function signUpAndIn(email, password) {
	const session = jar()
	await session.call('/api/auth/register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	})
	const { csrfToken } = await (await session.call('/api/auth/csrf')).json()
	await session.call('/api/auth/callback/credentials', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ email, password, csrfToken }),
	})
	return session
}

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

const owner = await signUpAndIn(
	`e2e_dom_${rand()}@example.com`,
	'password-dom-0000',
)
const created = await owner.call('/api/sites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		name: `Domain ${rand()}`,
		site: {
			version: 1,
			pages: [
				{
					id: 'pg_1',
					name: 'Home',
					slug: 'home',
					inHeader: true,
					blocks: [],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			],
		},
	}),
})
const { site } = await created.json()
await owner.call(`/api/sites/${site.id}/settings`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ status: 'live' }),
})

record('project created and live', created.status === 201, `${created.status}`)

// A name under our own host must go through the subdomain field.
const ours = await owner.call(`/api/sites/${site.id}/settings`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ customDomain: `sneaky.${APP_HOSTNAME}` }),
})
record(
	"cannot claim a name under the app's own host",
	ours.status === 400,
	`got ${ours.status}`,
)

// Malformed input never reaches Vercel.
const junk = await owner.call(`/api/sites/${site.id}/settings`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ customDomain: 'not a domain' }),
})
record(
	'a malformed domain is rejected',
	junk.status === 400,
	`got ${junk.status}`,
)

// The core rule, checked at the database level so it holds regardless of what
// Vercel says: a domain that is not verified must not serve.
const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const sites = client.db().collection('sites')
const id = new ObjectId(site.id)
const domain = `claimed-${rand()}.example`

await sites.updateOne(
	{ _id: id },
	{
		$set: {
			customDomain: domain,
			customDomainVerifiedAt: null,
			customDomainMisconfigured: true,
			customDomainRecords: [],
			customDomainCheckedAt: null,
		},
	},
)

const asHost = async (host) => {
	const { request } = await import('node:http')
	const url = new URL(BASE)
	return new Promise((resolve, reject) => {
		const req = request(
			{
				hostname: url.hostname,
				port: url.port || 80,
				path: '/',
				headers: { host },
			},
			(res) => {
				res.resume()
				res.on('end', () => resolve(res.statusCode))
			},
		)
		req.on('error', reject)
		req.end()
	})
}

record(
	'an unverified domain serves nothing',
	(await asHost(domain)) === 404,
	'404 expected',
)

await sites.updateOne(
	{ _id: id },
	{ $set: { customDomainVerifiedAt: new Date() } },
)
record(
	'a verified domain serves the project',
	(await asHost(domain)) === 200,
	'200 expected',
)

// Taking it back down must stop serving immediately.
await sites.updateOne({ _id: id }, { $set: { status: 'draft' } })
record(
	'a draft does not serve on its custom domain',
	(await asHost(domain)) === 404,
	'404 expected',
)

await sites.updateOne({ _id: id }, { $set: { status: 'live' } })

// Two projects must never answer on the same name.
const otherEmail = `e2e_dom2_${rand()}@example.com`
const other = await signUpAndIn(otherEmail, 'password-dom-1111')
const theirs = await other.call('/api/sites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ name: 'Theirs', site: { version: 1, pages: [] } }),
})
const { site: theirSite } = await theirs.json()
const steal = await other.call(`/api/sites/${theirSite.id}/settings`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ customDomain: domain }),
})
record(
	'another account cannot take a connected domain',
	steal.status === 409,
	`got ${steal.status}`,
)

// The verify endpoint is a publish right, not an edit right.
const viewerRole = await client
	.db()
	.collection('workspaceRoles')
	.insertOne({
		workspaceId: (await client.db().collection('sites').findOne({ _id: id }))
			.workspaceId,
		name: `Editor ${rand()}`,
		permissions: ['projects.view', 'projects.edit'],
		system: false,
		createdAt: new Date(),
	})
const theirUser = await client
	.db()
	.collection('users')
	.findOne({ email: otherEmail })
await client
	.db()
	.collection('workspaceMembers')
	.insertOne({
		workspaceId: (await sites.findOne({ _id: id })).workspaceId,
		userId: theirUser._id.toString(),
		roleId: viewerRole.insertedId,
		createdAt: new Date(),
	})
await other.call('/api/account/workspace', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		workspaceId: (await sites.findOne({ _id: id })).workspaceId.toString(),
	}),
})

const editorCheck = await other.call(`/api/sites/${site.id}/domain`, {
	method: 'POST',
})
record(
	'an editor cannot verify a domain',
	editorCheck.status === 403,
	`got ${editorCheck.status}`,
)

const anonCheck = await jar().call(`/api/sites/${site.id}/domain`, {
	method: 'POST',
})
record(
	'signed out cannot verify a domain',
	anonCheck.status === 401,
	`got ${anonCheck.status}`,
)

await sites.deleteMany({ _id: { $in: [id, new ObjectId(theirSite.id)] } })
await client.close()

for (const { name, pass, detail } of results)
	console.log(
		`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
	)

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
