/**
 * Proves the platform invitation end to end: an admin invites someone, the
 * email carries a working link, the link creates exactly one login, the login
 * signs in, and nothing along the way can strand the person. Run against the
 * dev server with a local database and the mail sink (see lib/auth-harness.mjs).
 */
import { verify } from '@node-rs/argon2'
import {
	BASE,
	cleanup,
	connect,
	jar,
	linkIn,
	newToken,
	rand,
	recorder,
	seedUser,
	sessionUser,
	sha256,
	signIn,
	signUpAndIn,
	waitForMail,
} from './lib/auth-harness.mjs'

const { client, db } = await connect()
const { record, finish } = recorder()

const run = rand()
const adminEmail = `e2e_admin_${run}@example.test`
const guest = `e2e_guest_${run}@example.test`
const second = `e2e_second_${run}@example.test`
const existing = `e2e_existing_${run}@example.test`
const racer = `e2e_racer_${run}@example.test`
const locked = `e2e_locked_${run}@example.test`
const replaced = `e2e_replaced_${run}@example.test`
const restore = `e2e_restore_${run}@example.test`
const all = [adminEmail, guest, second, existing, racer, locked, replaced, restore]

const invites = db.collection('platformInvites')
const users = db.collection('users')

const admin = await signUpAndIn(db, adminEmail, 'password-admin-0000', {
	role: 'admin',
	name: 'Proof Admin',
})

const invite = (session, body, headers = {}) =>
	session.call('/api/admin/invites', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(body),
	})

// --- sending ---------------------------------------------------------------

const anon = jar()
record(
	'a visitor cannot send platform invitations',
	(await invite(anon, { email: guest })).status === 401,
)
const crossSite = await invite(admin, { email: guest }, { Origin: 'https://someone-else.example' })
record(
	'an admin page on another origin cannot send one either',
	crossSite.status === 403 && (await invites.countDocuments({ email: guest })) === 0,
	`${crossSite.status}`,
)

const since = Date.now()
const sent = await invite(admin, {
	email: guest.toUpperCase(),
	role: 'member',
	accountName: 'Proof Co',
})
const sentBody = await sent.json().catch(() => ({}))
record('an admin can invite an account holder', sent.status === 201, `${sent.status}`)
record('the address is stored lowercased', sentBody.email === guest, sentBody.email)

const row = await invites.findOne({ email: guest })
record('the invitation is stored with a hashed token', Boolean(row?.tokenHash))

const mail = await waitForMail(guest, since)
const rawToken = linkIn(mail, /\/welcome\/([A-Za-z0-9_-]+)/)
record('the invitee receives the email', Boolean(mail), mail?.subject ?? 'no mail')
record(
	'the emailed link carries the raw token whose hash is stored',
	Boolean(rawToken) && row?.tokenHash === sha256(rawToken),
)
record(
	'the email is branded',
	Boolean(mail?.html.includes('reynolds-built-mark.png')) &&
		Boolean(mail?.html.includes('Proof Admin')) &&
		Boolean(mail?.html.includes('Proof Co')) &&
		Boolean(mail?.text.includes(`${BASE}/welcome/${rawToken}`)),
)

// --- reading the link ------------------------------------------------------

const describe = (token) => anon.call(`/api/welcome/${token}`)
const described = await (await describe(rawToken)).json()
record(
	'the link describes the invitation before asking for a password',
	described.invite?.email === guest && described.invite?.accountName === 'Proof Co',
)
record('an unknown token is refused', (await describe(newToken())).status === 404)

const expiredToken = newToken()
await invites.insertOne({
	email: second,
	accountName: null,
	role: 'member',
	tokenHash: sha256(expiredToken),
	invitedBy: admin.user.id,
	expiresAt: new Date(Date.now() - 1000),
	createdAt: new Date(),
})
record('an expired link is refused', (await describe(expiredToken)).status === 404)

// --- creating the login ----------------------------------------------------

const create = (token, body) =>
	anon.call(`/api/welcome/${token}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})

const short = await create(rawToken, { password: 'short' })
record(
	'a short password is refused and the invitation survives',
	short.status === 400 && Boolean(await invites.findOne({ email: guest })),
	`${short.status}`,
)
const longName = await (
	await create(rawToken, { password: 'long-enough-password', name: 'x'.repeat(121) })
).json()
record(
	'a too-long name gets its own message',
	/name/i.test(longName.error ?? ''),
	longName.error,
)

const made = await create(rawToken, { password: 'password-guest-1111', name: 'Guest' })
const madeBody = await made.json().catch(() => ({}))
record('the login is created', made.status === 200 && madeBody.email === guest, `${made.status}`)

const user = await users.findOne({ email: guest })
record(
	'the user document is complete',
	Boolean(user) &&
		user.name === 'Guest' &&
		user.role === 'member' &&
		user.emailVerified instanceof Date &&
		(await verify(user.passwordHash, 'password-guest-1111')),
)
record('the invitation is single use', (await create(rawToken, { password: 'password-guest-1111' })).status === 404)

const workspace = user && (await db.collection('workspaces').findOne({ ownerId: user._id.toString() }))
record('their account is created and named after the invitation', workspace?.name === 'Proof Co')
record(
	'their account has its Admin role and membership',
	Boolean(workspace) &&
		(await db.collection('workspaceRoles').countDocuments({ workspaceId: workspace._id, system: true })) === 1 &&
		(await db.collection('workspaceMembers').countDocuments({ workspaceId: workspace._id, userId: user._id.toString() })) === 1,
)

// --- signing in ------------------------------------------------------------

const guestSession = jar()
const signedIn = await signIn(guestSession, guest, 'password-guest-1111')
record('the new login signs in with its password', signedIn.error === null, `${signedIn.error}`)
record('the session is theirs', (await sessionUser(guestSession))?.id === user?._id.toString())
record('their account page opens', (await guestSession.call('/account')).status === 200)
const bounce = await guestSession.call('/sign-in')
record(
	'the sign-in page sends them to their account',
	bounce.status === 307 && bounce.headers.get('location') === '/account',
	`${bounce.status} ${bounce.headers.get('location')}`,
)

// --- an admin invitation ---------------------------------------------------

const adminSince = Date.now()
await invite(admin, { email: second, role: 'admin' })
const adminMail = await waitForMail(second, adminSince)
const adminToken = linkIn(adminMail, /\/welcome\/([A-Za-z0-9_-]+)/)
record('an admin invitation email explains the admin area', Boolean(adminMail?.html.includes('admin area')))
record(
	'an admin invitation creates an admin login',
	(await create(adminToken, { password: 'password-second-2222' })).status === 200 &&
		(await users.findOne({ email: second }))?.role === 'admin',
)
const adminUser = await users.findOne({ email: second })
record(
	'an admin gets no account of their own',
	(await db.collection('workspaces').countDocuments({ ownerId: adminUser._id.toString() })) === 0,
)
const adminSession = jar()
await signIn(adminSession, second, 'password-second-2222')
const adminLanding = await adminSession.call('/account')
record(
	'an admin is sent to the admin area',
	adminLanding.status === 307 && adminLanding.headers.get('location') === '/admin',
	`${adminLanding.status} ${adminLanding.headers.get('location')}`,
)

// --- an address that already has a login -----------------------------------

await seedUser(db, { email: existing, password: 'password-existing-3333' })
const existingToken = newToken()
await invites.insertOne({
	email: existing,
	accountName: null,
	role: 'member',
	tokenHash: sha256(existingToken),
	invitedBy: admin.user.id,
	expiresAt: new Date(Date.now() + 60_000),
	createdAt: new Date(),
})
const existingGet = await describe(existingToken)
const existingPost = await create(existingToken, { password: 'password-existing-4444' })
record(
	'a link for an address with a login says so instead of failing',
	existingGet.status === 409 && (await existingGet.json()).hasLogin === true,
	`${existingGet.status}`,
)
record(
	'it cannot overwrite that login, and the link is not consumed',
	existingPost.status === 409 && Boolean(await invites.findOne({ email: existing })),
	`${existingPost.status}`,
)
record(
	'the admin is told the person already has a login',
	(await invite(admin, { email: existing })).status === 409,
)

// --- two submissions of one link -------------------------------------------

const raceToken = newToken()
await invites.insertOne({
	email: racer,
	accountName: null,
	role: 'member',
	tokenHash: sha256(raceToken),
	invitedBy: admin.user.id,
	expiresAt: new Date(Date.now() + 60_000),
	createdAt: new Date(),
})
const raceResults = await Promise.all([
	create(raceToken, { password: 'password-racer-5555' }),
	create(raceToken, { password: 'password-racer-6666' }),
])
const statuses = raceResults.map((r) => r.status).sort()
record(
	'two parallel submissions create exactly one login',
	statuses[0] === 200 && statuses[1] !== 200 && (await users.countDocuments({ email: racer })) === 1,
	statuses.join('/'),
)

// --- a lockout earned before the link was opened ----------------------------

const lockedToken = newToken()
await invites.insertOne({
	email: locked,
	accountName: null,
	role: 'member',
	tokenHash: sha256(lockedToken),
	invitedBy: admin.user.id,
	expiresAt: new Date(Date.now() + 60_000),
	createdAt: new Date(),
})
const guesser = jar()
for (let i = 0; i < 9; i += 1) await signIn(guesser, locked, 'wrong-guess-0000')
record(
	'the address is locked out before the link is used',
	(await signIn(guesser, locked, 'wrong-guess-0000')).code === 'too_many_attempts',
)
await create(lockedToken, { password: 'password-locked-7777' })
record(
	'creating the login clears the lockout',
	(await signIn(jar(), locked, 'password-locked-7777')).error === null,
)

// --- a failure after the claim puts the invitation back ---------------------

const restoreToken = newToken()
await invites.insertOne({
	email: restore,
	accountName: null,
	role: 'member',
	tokenHash: sha256(restoreToken),
	invitedBy: admin.user.id,
	expiresAt: new Date(Date.now() + 60_000),
	createdAt: new Date(),
})
// A validator nothing satisfies makes the users insert fail the way a database
// fault would, after the password is hashed and the invitation is claimed.
await db.command({
	collMod: 'users',
	validator: { $jsonSchema: { required: ['proofBlocker'] } },
	validationLevel: 'strict',
})
let blocked
try {
	blocked = await create(restoreToken, { password: 'password-restore-8888' })
} finally {
	await db.command({ collMod: 'users', validator: {}, validationLevel: 'off' })
}
const blockedBody = await blocked.json().catch(() => ({}))
record(
	'a failed insert answers honestly and puts the invitation back',
	blocked.status === 503 &&
		/still valid/.test(blockedBody.error ?? '') &&
		Boolean(await invites.findOne({ tokenHash: sha256(restoreToken) })) &&
		(await users.countDocuments({ email: restore })) === 0,
	`${blocked.status} ${blockedBody.error ?? ''}`,
)
record('the restored invitation still works', (await create(restoreToken, { password: 'password-restore-8888' })).status === 200)

// --- re-inviting ------------------------------------------------------------

const firstSince = Date.now()
await invite(admin, { email: replaced })
const firstToken = linkIn(await waitForMail(replaced, firstSince), /\/welcome\/([A-Za-z0-9_-]+)/)
const secondSince = Date.now()
const again = await (await invite(admin, { email: replaced })).json()
const secondToken = linkIn(await waitForMail(replaced, secondSince), /\/welcome\/([A-Za-z0-9_-]+)/)
record('re-inviting reports that it replaced the earlier link', again.replaced === true)
record(
	'only the newest link works',
	(await describe(firstToken)).status === 404 && (await describe(secondToken)).status === 200,
)

await cleanup(db, all)
await client.close()
finish()
