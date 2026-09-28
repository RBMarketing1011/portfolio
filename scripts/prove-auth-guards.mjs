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

const a = await signUpAndIn(`a_${rand()}@example.test`, 'password-aaaa-1111')
const b = await signUpAndIn(`b_${rand()}@example.test`, 'password-bbbb-2222')
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

await a.call(`/api/sites/${site.id}`, { method: 'DELETE' })

const failed = results.filter((r) => !r.pass)
for (const r of results)
	console.log(
		`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`,
	)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
