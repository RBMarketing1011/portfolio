/**
 * Proves the credentials endpoint throttles. A rate limiter that has never been
 * seen to trip is not evidence of anything. Run against the dev server with a
 * local database (see lib/auth-harness.mjs).
 */
import {
	cleanup,
	connect,
	jar,
	rand,
	recorder,
	seedUser,
	signIn,
} from './lib/auth-harness.mjs'

const { client, db } = await connect()
const { record, finish } = recorder()

const email = `rl_${rand()}@example.test`
const password = 'password-rate-limit-1'
await seedUser(db, { email, password })

const session = jar()
const first = await signIn(session, email, password)
record('correct password is accepted', first.error === null, `${first.code}`)

let lockedAt = null
for (let i = 1; i <= 12 && lockedAt === null; i += 1) {
	const result = await signIn(session, email, 'definitely-not-the-password')
	if (result.code === 'too_many_attempts') lockedAt = i
}
record(
	'wrong passwords eventually lock the account out',
	lockedAt !== null,
	lockedAt === null ? 'never locked in 12 tries' : `locked on attempt ${lockedAt}`,
)

// The real test: once locked, the RIGHT password must be refused too, or the
// limiter is only an inconvenience and stuffing still succeeds.
const whileLocked = await signIn(session, email, password)
record(
	'the correct password is refused while locked out',
	whileLocked.code === 'too_many_attempts',
	`${whileLocked.code}`,
)

// A successful sign-in must reset the counter, or one typo streak a fortnight
// ago would keep locking a legitimate user out.
await db.collection('authAttempts').deleteMany({ _id: `email:${email}` })
const afterClear = await signIn(session, email, password)
record('signing in again works once the window is gone', afterClear.error === null, `${afterClear.code}`)
// Two fresh failures, then a success: the counter must be gone afterwards.
await signIn(session, email, 'wrong-again-1')
await signIn(session, email, 'wrong-again-2')
const counted = (await db.collection('authAttempts').findOne({ _id: `email:${email}` }))?.count ?? 0
await signIn(session, email, password)
const counters = await db.collection('authAttempts').countDocuments({ _id: `email:${email}` })
record('a successful sign-in clears the counter', counted === 2 && counters === 0, `${counted} then ${counters}`)

// One source spraying a password across many addresses trips the per-IP cap,
// which the dev server reads from the forwarded header the proxy would set.
const sprayIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
let sprayed = null
for (let i = 1; i <= 40 && sprayed === null; i += 1) {
	const result = await signIn(jar(), `spray${i}_${rand()}@example.test`, 'nope-nope-nope', {
		'X-Forwarded-For': sprayIp,
	})
	if (result.code === 'too_many_attempts') sprayed = i
}
record(
	'spraying from one address is cut off',
	sprayed !== null && sprayed > 8,
	sprayed === null ? 'never locked in 40 tries' : `locked on attempt ${sprayed}`,
)
const otherIp = await signIn(jar(), `elsewhere_${rand()}@example.test`, 'nope-nope-nope', {
	'X-Forwarded-For': '203.0.113.250',
})
record('a different source is unaffected', otherIp.code === 'credentials', `${otherIp.code}`)

await db.collection('authAttempts').deleteMany({ _id: { $in: [`ip:${sprayIp}`, 'ip:203.0.113.250'] } })
await db.collection('authAttempts').deleteMany({ _id: /^email:(spray|elsewhere)/ })
await cleanup(db, [email])
await client.close()
finish()
