/**
 * Proves forgot-password end to end: the request answers the same for every
 * address, the email carries a working single-use link, the link sets a new
 * password that signs in, the old one stops working, and a lockout does not
 * survive the reset. Run against the dev server with a local database and the
 * mail sink (see lib/auth-harness.mjs).
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
	readSink,
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
const person = `e2e_reset_${run}@example.test`
const lockedPerson = `e2e_resetlock_${run}@example.test`
const stranger = `e2e_nobody_${run}@example.test`
const all = [person, lockedPerson, stranger]

const resets = db.collection('passwordResets')
const anon = jar()

// Counters from an earlier run inside the window would trip the per-source cap
// on this one; the dev server reports local requests as ::1 or 127.0.0.1.
const clearCounters = () =>
	db.collection('authAttempts').deleteMany({
		_id: { $regex: /^reset:(ip:(::1|127\.0\.0\.1|203\.0\.113\.77)$|email:e2e_)/ },
	})
await clearCounters()

const request = (email, headers = {}) =>
	anon.call('/api/auth/request-reset', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify({ email }),
	})

const { id: personId } = await seedUser(db, { email: person, password: 'old-password-0000' })

// A session opened before the reset, which the reset must end.
const early = jar()
record('the old password signs in before the reset', (await signIn(early, person, 'old-password-0000')).error === null)

// --- requesting -------------------------------------------------------------

record('an invalid address is refused', (await request('not-an-email')).status === 400)

const since = Date.now()
const asked = await request(person.toUpperCase())
record('a request for a real login is accepted', asked.status === 200, `${asked.status}`)

// The lookup and the email happen after the response, so the mail is the
// signal that the work is done.
const mail = await waitForMail(person, since)
const rawToken = linkIn(mail, /\/reset-password\/([A-Za-z0-9_-]+)/)
const row = await resets.findOne({ email: person })
record('a reset is stored with a hashed token and a short life', Boolean(row?.tokenHash) && row.expiresAt - Date.now() <= 30 * 60 * 1000 && row.expiresAt > new Date())
record('the email arrives with the reset link', Boolean(rawToken), mail?.subject ?? 'no mail')
record('the link carries the token whose hash is stored', Boolean(rawToken) && row?.tokenHash === sha256(rawToken))
record('the email is branded', Boolean(mail?.html.includes('reynolds-built-mark.png')) && Boolean(mail?.text.includes(`${BASE}/reset-password/${rawToken}`)))

const strangerSince = Date.now()
const strangerAsked = await request(stranger)
record(
	'an unknown address gets the same answer and no email',
	strangerAsked.status === 200 &&
		(await resets.countDocuments({ email: stranger })) === 0 &&
		(await waitForMail(stranger, strangerSince, 1500)) === null,
	`${strangerAsked.status}`,
)

// --- the link ---------------------------------------------------------------

const describe = (token) => anon.call(`/api/auth/reset/${token}`)
record('the link says whose password it resets', (await (await describe(rawToken)).json()).email === person)
record('an unknown link is refused', (await describe(newToken())).status === 404)

const expiredToken = newToken()
await resets.insertOne({
	userId: personId,
	email: person,
	tokenHash: sha256(expiredToken),
	expiresAt: new Date(Date.now() - 1000),
	createdAt: new Date(),
})
record('an expired link is refused', (await describe(expiredToken)).status === 404)

const reset = (token, password) =>
	anon.call(`/api/auth/reset/${token}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ password }),
	})

record(
	'a short password is refused and the link survives',
	(await reset(rawToken, 'short')).status === 400 && Boolean(await resets.findOne({ tokenHash: sha256(rawToken) })),
)

const changedSince = Date.now()
const done = await reset(rawToken, 'new-password-1234')
record('the password is reset', done.status === 200 && (await done.json()).email === person, `${done.status}`)

const user = await db.collection('users').findOne({ email: person })
record(
	'the new password is stored and the old one is gone',
	(await verify(user.passwordHash, 'new-password-1234')) && !(await verify(user.passwordHash, 'old-password-0000')),
)
record('the link is single use', (await reset(rawToken, 'another-password-1')).status === 404)
record('no reset is left behind', (await resets.countDocuments({ userId: personId })) === 0)
record('the inbox is told the password changed', Boolean((await waitForMail(person, changedSince))?.subject.includes('password was changed')))

// --- signing in -------------------------------------------------------------

record('the session opened before the reset is signed out by it', (await sessionUser(early)) === null)

const session = jar()
record('the new password signs in', (await signIn(session, person, 'new-password-1234')).error === null)
record('the session is theirs', (await sessionUser(session))?.id === personId)
record('the old password no longer works', (await signIn(jar(), person, 'old-password-0000')).error === 'CredentialsSignin')
record('the forgot-password page is open to someone signed in', (await session.call('/forgot-password')).status === 200)

// --- changing it from the profile -------------------------------------------

const change = (body) =>
	session.call('/api/account/password', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
record('changing the password needs the current one', (await change({ current: 'wrong-current-000', next: 'changed-password-91' })).status === 400)
record('a missing current password is refused with plain words', /current password/i.test((await (await change({ next: 'changed-password-91' })).json()).error ?? ''))
const changed = await change({ current: 'new-password-1234', next: 'changed-password-91' })
record('the password can be changed with the current one', changed.status === 200 && (await changed.json()).email === person, `${changed.status}`)
record('the change signs that session out', (await sessionUser(session)) === null)
record('the changed password signs in', (await signIn(jar(), person, 'changed-password-91')).error === null)

// --- a locked-out person ----------------------------------------------------

await seedUser(db, { email: lockedPerson, password: 'locked-password-0000' })
const guesser = jar()
for (let i = 0; i < 9; i += 1) await signIn(guesser, lockedPerson, 'wrong-guess-0000')
record('the person is locked out', (await signIn(guesser, lockedPerson, 'locked-password-0000')).code === 'too_many_attempts')
const lockedSince = Date.now()
await request(lockedPerson)
const lockedToken = linkIn(await waitForMail(lockedPerson, lockedSince), /\/reset-password\/([A-Za-z0-9_-]+)/)
await reset(lockedToken, 'fresh-password-5678')
record('resetting the password clears the lockout', (await signIn(jar(), lockedPerson, 'fresh-password-5678')).error === null)

// --- limits -----------------------------------------------------------------

const quiet = jar()
const quietRequest = (email) =>
	quiet.call('/api/auth/request-reset', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.77' },
		body: JSON.stringify({ email }),
	})
// From a clean window, so the requests above do not count against it.
await db.collection('authAttempts').deleteOne({ _id: `reset:email:${person}` })
const sent = []
for (let i = 0; i < 3; i += 1) {
	const sentAt = Date.now()
	const status = (await quietRequest(person)).status
	sent.push(status === 200 && Boolean(await waitForMail(person, sentAt)))
}
const before = await resets.findOne({ email: person })
const fourthAt = Date.now()
const fourth = await quietRequest(person)
const fourthMail = await waitForMail(person, fourthAt, 1500)
const after = await resets.findOne({ email: person })
record(
	'three requests in a window are sent and a fourth is silently ignored',
	sent.every(Boolean) &&
		fourth.status === 200 &&
		fourthMail === null &&
		before?.tokenHash === after?.tokenHash,
	`${sent.filter(Boolean).length} sent, 4th ${fourth.status}${fourthMail ? ' sent' : ' ignored'}`,
)
let ipStatus = 200
for (let i = 0; i < 12 && ipStatus === 200; i += 1)
	ipStatus = (await quietRequest(`e2e_spray${i}_${run}@example.test`)).status
record('a source hammering the form is told to stop', ipStatus === 429, `${ipStatus}`)

// --- pages ------------------------------------------------------------------

record('the forgot-password page renders', (await anon.call('/forgot-password')).status === 200)
record('the reset page renders', (await anon.call(`/reset-password/${newToken()}`)).status === 200)

// Long after the request: the stranger's work ran after the response, and
// there must still be nothing to show for it.
record(
	'the unknown address never got anything',
	readSink(stranger, strangerSince) === null && (await resets.countDocuments({ email: stranger })) === 0,
)

await clearCounters()
await db.collection('authAttempts').deleteMany({ _id: /^email:e2e_(reset|resetlock|spray)/ })
await resets.deleteMany({ email: /^e2e_/ })
await cleanup(db, all)
await client.close()
finish()
