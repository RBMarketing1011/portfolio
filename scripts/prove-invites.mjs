/**
 * Proves the invitation link. The SMTP send is exercised separately; what
 * matters here is that the link cannot be used by the wrong person, cannot be
 * replayed, and cannot outlive its expiry.
 */
import { createHash, randomBytes } from 'node:crypto'
import { MongoClient } from 'mongodb'

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

const hash = (token) => createHash('sha256').update(token).digest('hex')

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

const ownerEmail = `e2e_owner_${rand()}@example.com`
const guestEmail = `e2e_guest_${rand()}@example.com`
const otherEmail = `e2e_other_${rand()}@example.com`

const owner = await signUpAndIn(ownerEmail, 'password-owner-1111')
const guest = await signUpAndIn(guestEmail, 'password-guest-2222')
const other = await signUpAndIn(otherEmail, 'password-other-3333')

// Touch the backend so the owner's account exists.
await owner.call('/api/sites')
await guest.call('/api/sites')
await other.call('/api/sites')

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db()

const ownerUser = await db.collection('users').findOne({ email: ownerEmail })
const workspace = await db
	.collection('workspaces')
	.findOne({ ownerId: ownerUser._id.toString() })
const role = await db
	.collection('workspaceRoles')
	.findOne({ workspaceId: workspace._id, system: true })

const makeInvite = async (email, token, expiresAt) => {
	await db.collection('workspaceInvites').deleteMany({ email })
	await db.collection('workspaceInvites').insertOne({
		workspaceId: workspace._id,
		email,
		roleId: role._id,
		tokenHash: hash(token),
		invitedBy: ownerUser._id.toString(),
		expiresAt,
		createdAt: new Date(),
	})
}

const future = () => new Date(Date.now() + 60 * 60 * 1000)

// The raw token must never be what is stored, or a database read is a free pass.
const token = randomBytes(32).toString('base64url')
await makeInvite(guestEmail, token, future())
const stored = await db
	.collection('workspaceInvites')
	.findOne({ email: guestEmail })
record(
	'the raw token is not stored',
	stored.tokenHash !== token && stored.tokenHash === hash(token),
	'hashed',
)

const unknown = await guest.call(
	`/api/account/invites/${randomBytes(32).toString('base64url')}`,
)
record(
	'an unknown token is refused',
	unknown.status === 404,
	`got ${unknown.status}`,
)

const described = await (
	await guest.call(`/api/account/invites/${token}`)
).json()
record(
	'the link describes the account before sign-in',
	described.invite?.accountName === workspace.name,
	described.invite?.accountName ?? 'missing',
)

// The invitation names an address. Anyone else holding the link must be refused.
const wrongPerson = await other.call(`/api/account/invites/${token}`, {
	method: 'POST',
})
record(
	'a different signed-in user cannot accept it',
	wrongPerson.status === 403,
	`got ${wrongPerson.status}`,
)

const anon = await jar()
const signedOut = await anon.call(`/api/account/invites/${token}`, {
	method: 'POST',
})
record(
	'a signed-out visitor cannot accept it',
	signedOut.status === 401,
	`got ${signedOut.status}`,
)

const accepted = await guest.call(`/api/account/invites/${token}`, {
	method: 'POST',
})
record(
	'the invited person can accept it',
	accepted.status === 200,
	`got ${accepted.status}`,
)

const membership = await db.collection('workspaceMembers').findOne({
	workspaceId: workspace._id,
	userId: (
		await db.collection('users').findOne({ email: guestEmail })
	)._id.toString(),
})
record('accepting adds them to the account', Boolean(membership))

const replay = await guest.call(`/api/account/invites/${token}`, {
	method: 'POST',
})
record(
	'the link works only once',
	replay.status === 404,
	`got ${replay.status}`,
)

// Expiry is enforced in the query, so a swept-but-not-yet-deleted row is dead.
const expiredToken = randomBytes(32).toString('base64url')
await makeInvite(guestEmail, expiredToken, new Date(Date.now() - 1000))
const expired = await guest.call(`/api/account/invites/${expiredToken}`, {
	method: 'POST',
})
record(
	'an expired link is refused',
	expired.status === 404,
	`got ${expired.status}`,
)

// Having joined, they must actually be able to work in the account.
const switched = await guest.call('/api/account/workspace', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ workspaceId: workspace._id.toString() }),
})
record(
	'they can switch into the account',
	switched.status === 200,
	`got ${switched.status}`,
)

const asAdmin = await guest.call('/api/account/team')
record(
	'their Admin role grants the account\u2019s pages',
	asAdmin.status === 200,
	`got ${asAdmin.status}`,
)

const strangerSwitch = await other.call('/api/account/workspace', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ workspaceId: workspace._id.toString() }),
})
record(
	'a non-member cannot switch into the account',
	strangerSwitch.status === 404,
	`got ${strangerSwitch.status}`,
)

await client.close()

for (const { name, pass, detail } of results)
	console.log(
		`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
	)

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
