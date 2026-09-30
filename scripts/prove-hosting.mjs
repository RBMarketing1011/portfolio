/**
 * Proves what each address does and does not expose. A share link is meant to
 * work for anyone holding it; a live hostname must only resolve while the
 * project is actually live, and must never be another project's.
 */
import { request as httpRequest } from 'node:http'
import { MongoClient } from 'mongodb'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
// The same value the app derives, so this suite follows the environment it runs
// against instead of assuming localhost.
const APP_HOST = (process.env.NEXT_PUBLIC_APP_HOST ?? 'localhost:3000')
	.toLowerCase()
	.replace(/^https?:\/\//, '')
const APP_HOSTNAME = APP_HOST.split(':')[0]
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

/**
 * Anonymous, and pretending to arrive on a given hostname. Uses node:http
 * because undici treats `Host` as a forbidden header and silently drops it,
 * which makes every one of these look like a pass against the marketing site.
 */
function asHost(path, host) {
	const url = new URL(BASE)
	return new Promise((resolve, reject) => {
		const request = httpRequest(
			{
				hostname: url.hostname,
				port: url.port || 80,
				path,
				method: 'GET',
				headers: { host },
			},
			(response) => {
				let body = ''
				response.on('data', (chunk) => {
					body += chunk
				})
				response.on('end', () => resolve({ status: response.statusCode, body }))
			},
		)
		request.on('error', reject)
		request.end()
	})
}

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

const email = `e2e_host_${rand()}@example.com`
const owner = await signUpAndIn(email, 'password-host-0000')

const created = await owner.call('/api/sites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		name: `Host test ${rand()}`,
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
record('project created', created.status === 201, `${created.status}`)
record(
	'it gets a subdomain and a preview token',
	Boolean(site.subdomain) && Boolean(site.previewToken),
	`${site.subdomain}`,
)

// The share link is the whole point: no account, works while still a draft.
const share = await fetch(`${BASE}/p/${site.previewToken}`, {
	redirect: 'manual',
})
record(
	'the share link works signed out while still a draft',
	share.status === 200,
	`got ${share.status}`,
)

const badToken = await fetch(`${BASE}/p/not-a-real-token`, {
	redirect: 'manual',
})
record(
	'an unknown share token is refused',
	badToken.status === 404,
	`got ${badToken.status}`,
)

// A draft must not serve its pages, but its address does belong to a project,
// so it parks rather than pretending the hostname does not exist.
const draftHost = await asHost('/', `${site.subdomain}.${APP_HOSTNAME}`)
record(
	'a draft does not serve its pages on its address',
	!draftHost.body.includes('data-block-id') &&
		/isn.{0,8}t live yet/i.test(draftHost.body),
	`got ${draftHost.status}`,
)

const published = await owner.call(`/api/sites/${site.id}/settings`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ status: 'live' }),
})
const publishedBody = await published.json().catch(() => ({}))
record(
	'the project can be set live',
	published.status === 200 && publishedBody.site?.status === 'live',
	`${published.status} ${publishedBody.error ?? publishedBody.site?.status ?? ''}`,
)

const liveHost = await asHost('/', `${site.subdomain}.${APP_HOSTNAME}`)
// The title is the oracle, not the chrome: a built site's default header uses
// our brand as a placeholder, so looking for it there proves nothing.
record(
	'a live project answers on its address',
	liveHost.status === 200 &&
		/<title>[^<]*Host test/.test(liveHost.body) &&
		!liveHost.body.includes('AI, Automation'),
	`got ${liveHost.status}`,
)

record(
	"a customer's page is not titled with our name",
	!/<title>[^<]*\| ReynoldsBuilt</.test(liveHost.body),
	liveHost.body.match(/<title>([^<]*)</)?.[1] ?? 'no title',
)

const unknownHost = await asHost('/', `nothing-${rand()}.${APP_HOSTNAME}`)
record(
	'an unclaimed address is refused',
	unknownHost.status === 404,
	`got ${unknownHost.status}`,
)

// The rewrite target must not be reachable by typing it.
const direct = await asHost(`/hosted/sub/${site.subdomain}`, APP_HOST)
record(
	'the hosted segment is not reachable on the app host',
	direct.status === 404,
	`got ${direct.status}`,
)
const forged = await asHost(
	`/hosted/sub/${site.subdomain}`,
	`${site.subdomain}.${APP_HOSTNAME}`,
)
record(
	'a request cannot name its own hosted target',
	forged.status === 404,
	`got ${forged.status}`,
)

// The app's own routes must keep working on the app's own host.
const appStillWorks = await asHost('/sign-in', APP_HOST)
record(
	'the app itself still answers on its own host',
	appStillWorks.status === 200 && appStillWorks.body.includes('Sign in'),
	`got ${appStillWorks.status}`,
)

// Regenerating has to actually revoke the link that was already sent.
const oldToken = site.previewToken
const rotated = await owner.call(`/api/sites/${site.id}/settings`, {
	method: 'POST',
})
const { site: rotatedSite } = await rotated.json()
record(
	'a new share link is different',
	rotatedSite.previewToken !== oldToken,
	'rotated',
)
const revoked = await fetch(`${BASE}/p/${oldToken}`, { redirect: 'manual' })
record(
	'the old share link stops working',
	revoked.status === 404,
	`got ${revoked.status}`,
)

// Hostnames are global. Nobody may take one that is in use, or point a project
// at the app's own domain.
const other = await signUpAndIn(
	`e2e_host2_${rand()}@example.com`,
	'password-host-1111',
)
const theirs = await other.call('/api/sites', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ name: 'Theirs', site: { version: 1, pages: [] } }),
})
const { site: theirSite } = await theirs.json()

const steal = await other.call(`/api/sites/${theirSite.id}/settings`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ subdomain: rotatedSite.subdomain }),
})
const { site: afterSteal } = await steal.json()
record(
	'another account cannot take a subdomain already in use',
	afterSteal.subdomain !== rotatedSite.subdomain,
	afterSteal.subdomain,
)

// A name under the app's own host must go through the subdomain field, or a
// project could answer on the marketing site or the backend.
const appDomain = await other.call(`/api/sites/${theirSite.id}/settings`, {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ customDomain: `sneaky.${APP_HOSTNAME}` }),
})
const appDomainBody = await appDomain.json().catch(() => ({}))
record(
	"a project cannot claim a name under the app's own host",
	appDomain.status === 400 &&
		String(appDomainBody.error).includes('subdomain field'),
	`${appDomain.status} ${appDomainBody.error ?? ''}`,
)

// Everything above depends on the deployment knowing where it lives.
const robots = await asHost('/robots.txt', APP_HOST)
const onProduction = APP_HOSTNAME === 'reynoldsbuilt.dev'
record(
	onProduction
		? 'production robots.txt allows crawling'
		: 'a non-production host is not crawlable',
	onProduction
		? robots.body.includes('Allow: /')
		: /Disallow:\s*\/\s*$/m.test(robots.body),
	APP_HOST,
)

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const { ObjectId } = await import('mongodb')

// An unverified custom domain must not serve anything, or anyone could point a
// name at us and claim a project by typing it in. Written straight to the
// database so this holds whether or not the Vercel API is configured here —
// `prove-custom-domains.mjs` covers the API path.
const claimedDomain = `claimed-${rand()}.example`
await client
	.db()
	.collection('sites')
	.updateOne(
		{ _id: new ObjectId(theirSite.id) },
		{
			$set: {
				customDomain: claimedDomain,
				customDomainVerifiedAt: null,
				status: 'live',
			},
		},
	)

const unverified = await asHost('/', claimedDomain)
record(
	'an unverified custom domain serves no project content',
	!unverified.body.includes('data-block-id') &&
		/isn.{0,8}t live yet/i.test(unverified.body),
	`got ${unverified.status}`,
)

await client.close()

for (const { name, pass, detail } of results)
	console.log(
		`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
	)

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
