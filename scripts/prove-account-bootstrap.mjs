/**
 * Proves account creation survives concurrency. A page renders its layout and
 * its body at the same time, so a brand new user fires several first-touch
 * account creations at once. When one of them returned a workspace whose member
 * row had not landed yet, /account bounced to /sign-in and the two redirected at
 * each other forever. Every request below must see a usable account.
 */
import {
	cleanup,
	connect,
	rand,
	signUpAndIn as seedAndSignIn,
} from './lib/auth-harness.mjs'

const { client, db } = await connect()
const created = []

// Registration is by invitation only, so the login is seeded the way the app
// creates one; the account rows are what this proof is about, so none are.
const signUpAndIn = async (email, password) => {
	created.push(email)
	return seedAndSignIn(db, email, password)
}

const results = []
const record = (name, pass, detail = '') => results.push({ name, pass, detail })

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
			await db
				.collection('workspaces')
				.findOne({ ownerId: user._id.toString() })
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

await cleanup(db, created)
await client.close()

for (const { name, pass, detail } of results)
	console.log(
		`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
	)

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
