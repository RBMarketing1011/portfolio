/**
 * Proves account creation survives concurrency. A page renders its layout and
 * its body at the same time, so a brand new user fires several first-touch
 * account creations at once. When one of them returned a workspace whose member
 * row had not landed yet, /account bounced to /sign-in and the two redirected at
 * each other forever. Every request below must see a usable account.
 */
import { MongoClient } from 'mongodb'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
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
		set: (name, value) => cookies.set(name, value),
	}
}

async function signUpAndIn(email, password) {
	const session = jar()
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
	return session
}

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db()

// The real shape of the bug: the very first authenticated page load, hit by
// several concurrent requests before any account exists.
for (let attempt = 1; attempt <= 5; attempt += 1) {
	const email = `e2e_race${attempt}_${rand()}@example.com`
	const session = await signUpAndIn(email, 'password-race-0000')

	const responses = await Promise.all([
		session.call('/account'),
		session.call('/account'),
		session.call('/account/projects'),
		session.call('/api/sites'),
	])

	const redirected = responses.filter((r) => r.status >= 300 && r.status < 400)
	record(
		`first load #${attempt} never bounces to sign-in`,
		redirected.length === 0,
		redirected.length
			? redirected.map((r) => r.headers.get('location')).join(', ')
			: responses.map((r) => r.status).join('/'),
	)

	const user = await db.collection('users').findOne({ email })
	const workspaces = await db
		.collection('workspaces')
		.countDocuments({ ownerId: user._id.toString() })
	const members = await db
		.collection('workspaceMembers')
		.countDocuments({ userId: user._id.toString() })
	const roles = await db.collection('workspaceRoles').countDocuments({
		workspaceId: (
			await db.collection('workspaces').findOne({ ownerId: user._id.toString() })
		)._id,
	})
	record(
		`first load #${attempt} creates exactly one account, role and membership`,
		workspaces === 1 && members === 1 && roles === 1,
		`w${workspaces} m${members} r${roles}`,
	)
}

// A selection pointing at an account that no longer exists is a preference, not
// a demand: it must fall back rather than make the backend unreachable.
const strayEmail = `e2e_stray_${rand()}@example.com`
const stray = await signUpAndIn(strayEmail, 'password-stray-0000')
await stray.call('/account')
stray.set('rb.workspace', '000000000000000000000000')

const withStale = await stray.call('/account')
record(
	'a stale account cookie falls back instead of looping',
	withStale.status === 200,
	`got ${withStale.status} ${withStale.headers.get('location') ?? ''}`,
)

const signIn = await stray.call('/sign-in')
record(
	'sign-in still redirects a healthy session away',
	signIn.status === 307 && signIn.headers.get('location') === '/account',
	`got ${signIn.status}`,
)

await client.close()

for (const { name, pass, detail } of results)
	console.log(
		`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
	)

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
