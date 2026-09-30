/**
 * Proves the credentials endpoint throttles. A rate limiter that has never been
 * seen to trip is not evidence of anything. Run against the dev server.
 */
const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

const rand = () => Math.random().toString(36).slice(2, 10)

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

/** The callback answers 302 either way; the outcome is in the `code` query param. */
async function attempt(session, email, password) {
	const { csrfToken } = await (await session.call('/api/auth/csrf')).json()
	const response = await session.call('/api/auth/callback/credentials', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'X-Auth-Return-Redirect': '1',
		},
		body: new URLSearchParams({ email, password, csrfToken }),
	})
	const body = await response.json().catch(() => ({}))
	const url = new URL(body.url ?? `${BASE}/`)
	return {
		error: url.searchParams.get('error'),
		code: url.searchParams.get('code'),
	}
}

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

const email = `rl_${rand()}@example.test`
const password = 'password-rate-limit-1'

const session = await jar()
const registered = await session.call('/api/auth/register', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ email, password }),
})
record('account created', registered.ok, `${registered.status}`)

const first = await attempt(session, email, password)
record('correct password is accepted', first.error === null, `${first.code}`)

let lockedAt = null
for (let i = 1; i <= 12 && lockedAt === null; i += 1) {
	const result = await attempt(session, email, 'definitely-not-the-password')
	if (result.code === 'too_many_attempts') lockedAt = i
}
record(
	'wrong passwords eventually lock the account out',
	lockedAt !== null,
	lockedAt === null
		? 'never locked in 12 tries'
		: `locked on attempt ${lockedAt}`,
)

// The real test: once locked, the RIGHT password must be refused too, or the
// limiter is only an inconvenience and stuffing still succeeds.
const whileLocked = await attempt(session, email, password)
record(
	'the correct password is refused while locked out',
	whileLocked.code === 'too_many_attempts',
	`${whileLocked.code}`,
)

// A successful sign-in must reset the counter, or one typo streak a fortnight
// ago would keep locking a legitimate user out.
const { MongoClient } = await import('mongodb')
const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
await client
	.db()
	.collection('authAttempts')
	.deleteMany({ _id: `email:${email}` })

const afterClear = await attempt(session, email, password)
record(
	'signing in again works once the window is gone',
	afterClear.error === null,
	`${afterClear.code}`,
)

const counters = await client
	.db()
	.collection('authAttempts')
	.countDocuments({ _id: `email:${email}` })
record('a successful sign-in clears the counter', counters === 0, `${counters}`)

await client.db().collection('users').deleteOne({ email })
await client.close()

for (const { name, pass, detail } of results)
	console.log(
		`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
	)

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
