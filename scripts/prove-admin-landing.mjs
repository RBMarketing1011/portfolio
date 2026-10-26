/**
 * Proves an admin is never put inside someone else's account without asking.
 * Admins have no account of their own; opening a customer's account from the
 * admin area selects it with the `rb.workspace` cookie. That selection used to
 * outlive sign-out, so the next sign-in landed straight in the last customer's
 * account. Signing in must start an admin in /admin with nothing selected, and
 * /account must only show an account after an explicit "Open".
 */
import {
	cleanup,
	connect,
	csrf,
	rand,
	recorder,
	seedUser,
	signIn,
	signUpAndIn,
	jar,
} from './lib/auth-harness.mjs'

const { client, db } = await connect()
const { record, finish } = recorder()

const adminEmail = `e2e_admin_${rand()}@example.com`
const memberEmail = `e2e_member_${rand()}@example.com`
const emails = [adminEmail, memberEmail]

const location = (response) =>
	new URL(response.headers.get('location') ?? '/', 'http://x').pathname

try {
	// A customer with an account of their own.
	const member = await signUpAndIn(db, memberEmail, 'password-member-0000')
	await member.call('/account')
	const memberUser = await db.collection('users').findOne({ email: memberEmail })
	const workspace = await db
		.collection('workspaces')
		.findOne({ ownerId: memberUser._id.toString() })

	await seedUser(db, {
		email: adminEmail,
		password: 'password-admin-0000',
		role: 'admin',
	})
	const admin = jar()
	await signIn(admin, adminEmail, 'password-admin-0000')

	const landing = await admin.call('/sign-in/landing')
	record('a signed-in admin lands in /admin', location(landing) === '/admin', location(landing))

	const memberLanding = await member.call('/sign-in/landing')
	record(
		'a signed-in member lands in /account',
		location(memberLanding) === '/account',
		location(memberLanding),
	)

	const before = await admin.call('/account')
	record(
		'/account sends an admin with nothing open to /admin',
		location(before) === '/admin',
		`${before.status} ${location(before)}`,
	)

	// What was actually reported: an admin already signed in, with a member
	// cookie left in the browser from before. No sign-in in between.
	admin.set('rb.workspace', workspace._id.toString())
	for (const path of ['/account', '/account/projects', '/account/settings']) {
		const response = await admin.call(path)
		record(
			`a leftover member cookie does not open ${path} for a signed-in admin`,
			location(response) === '/admin',
			`${response.status} ${location(response)}`,
		)
	}
	const sites = await admin.call('/api/sites')
	record(
		'nor does it reach the account through the API',
		sites.status === 404,
		String(sites.status),
	)
	admin.cookies.delete('rb.workspace')

	// The explicit choice: "View account" in the admin area.
	const open = await admin.call('/api/account/workspace', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ workspaceId: workspace._id.toString() }),
	})
	const viewCookie = open.headers
		.getSetCookie()
		.find((c) => c.startsWith('rb.admin-view='))
	record(
		'View account sets a browser-session cookie, not the year-long member one',
		Boolean(viewCookie) &&
			!/max-age|expires/i.test(viewCookie) &&
			!admin.cookies.has('rb.workspace'),
		viewCookie ?? 'none',
	)
	const opened = await admin.call('/account')
	record(
		'after View account, /account shows the chosen account',
		open.ok && opened.status === 200,
		`${open.status} then ${opened.status}`,
	)

	// "Back to admin" ends the visit.
	await admin.call('/api/account/workspace', { method: 'DELETE' })
	const left = await admin.call('/account')
	record(
		'leaving the account closes it',
		!admin.cookies.has('rb.admin-view') && location(left) === '/admin',
		`${left.status} ${location(left)}`,
	)

	// Open it again, then sign out: the selection must go with the session.
	await admin.call('/api/account/workspace', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ workspaceId: workspace._id.toString() }),
	})
	await admin.call('/api/auth/signout', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ csrfToken: await csrf(admin) }),
	})
	record('signing out clears the open account', !admin.cookies.has('rb.admin-view'))

	// A view cookie still in the browser at sign-in must not be resumed.
	admin.set('rb.admin-view', workspace._id.toString())
	await signIn(admin, adminEmail, 'password-admin-0000')
	const fresh = await admin.call('/account')
	record(
		'signing in as an admin does not resume a customer account',
		!admin.cookies.has('rb.admin-view') && location(fresh) === '/admin',
		`${fresh.status} ${location(fresh)}`,
	)
} finally {
	await cleanup(db, emails)
	await client.close()
}

finish()
