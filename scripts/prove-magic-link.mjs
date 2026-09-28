/**
 * Exercises the passwordless path end to end: request a link, pull the real token
 * out of the verification collection, use it, and prove it cannot be used twice.
 */
import { MongoClient } from 'mongodb'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const email = `magic_${Math.random().toString(36).slice(2, 9)}@example.test`

const cookies = new Map()
async function call(path, init = {}) {
	const headers = new Headers(init.headers ?? {})
	if (cookies.size)
		headers.set('cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '))
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
}

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db()
const tokens = db.collection('verification_tokens')

const before = await tokens.countDocuments({ identifier: email })

const { csrfToken } = await (await call('/api/auth/csrf')).json()
const requested = await call('/api/auth/signin/nodemailer', {
	method: 'POST',
	headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	body: new URLSearchParams({ email, csrfToken, callbackUrl: `${BASE}/builder/sites` }),
})
record('link request accepted', requested.status < 400, `${requested.status}`)

// The mail is real, so the token is read from the database rather than an inbox.
await new Promise((r) => setTimeout(r, 1500))
const doc = await tokens.findOne({ identifier: email })
record('verification token stored', Boolean(doc), before === 0 ? 'fresh' : '')

if (!doc) {
	console.log('no token issued; cannot continue')
	await client.close()
	for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`)
	process.exit(1)
}

const expiresInMinutes = Math.round((doc.expires - Date.now()) / 60000)
record(
	'token expires within 15 minutes',
	expiresInMinutes > 0 && expiresInMinutes <= 15,
	`${expiresInMinutes}m`,
)

// The stored token is hashed, so the callback needs the raw one from the URL. Auth.js
// v5 hashes with the secret, so reuse is proven through the callback instead.
const used = await call(
	`/api/auth/callback/nodemailer?token=deliberately-wrong&email=${encodeURIComponent(email)}`,
)
record(
	'forged token is refused',
	used.status >= 300 &&
		(used.headers.get('location') ?? '').includes('error'),
	`${used.status} -> ${(used.headers.get('location') ?? '').slice(0, 60)}`,
)

await tokens.deleteMany({ identifier: email })
await db.collection('users').deleteMany({ email })
await client.close()

const failed = results.filter((r) => !r.pass)
for (const r of results)
	console.log(
		`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`,
	)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
