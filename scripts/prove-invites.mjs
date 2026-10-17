/**
 * Proves the team invitation: the link cannot be used by the wrong person,
 * cannot be replayed, cannot outlive its expiry, lands the invitee in the
 * account they were invited to, and lets someone with no login create one on
 * the spot. Run against the dev server with a local database and the mail
 * sink (see lib/auth-harness.mjs).
 */
import {
	BASE,
	cleanup,
	connect,
	jar,
	linkIn,
	newToken,
	rand,
	recorder,
	sessionUser,
	sha256,
	signIn,
	signUpAndIn,
	waitForMail,
} from './lib/auth-harness.mjs'

const { client, db } = await connect()
const { record, finish } = recorder()

const run = rand()
const ownerEmail = `e2e_owner_${run}@example.test`
const guestEmail = `e2e_guest_${run}@example.test`
const otherEmail = `e2e_other_${run}@example.test`
const newcomerEmail = `e2e_newcomer_${run}@example.test`
const all = [ownerEmail, guestEmail, otherEmail, newcomerEmail]

const owner = await signUpAndIn(db, ownerEmail, 'password-owner-1111', { name: 'Olive Owner' })
const guest = await signUpAndIn(db, guestEmail, 'password-guest-2222')
const other = await signUpAndIn(db, otherEmail, 'password-other-3333')

// Touch the backend so each person's own account exists.
await owner.call('/api/sites')
await guest.call('/api/sites')
await other.call('/api/sites')

const workspace = await db.collection('workspaces').findOne({ ownerId: owner.user.id })
const role = await db.collection('workspaceRoles').findOne({ workspaceId: workspace._id, system: true })
const invites = db.collection('workspaceInvites')

const send = (session, body) =>
	session.call('/api/account/invites', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})

// --- sending ----------------------------------------------------------------

const since = Date.now()
const sent = await send(owner, { email: guestEmail.toUpperCase(), roleId: role._id.toString() })
const sentBody = await sent.json().catch(() => ({}))
record('the owner can invite someone', sent.status === 201, `${sent.status}`)
record('the response says the person already has a login', sentBody.hasLogin === true)

const stored = await invites.findOne({ email: guestEmail })
const mail = await waitForMail(guestEmail, since)
const token = linkIn(mail, /\/invite\/([A-Za-z0-9_-]+)/)
record('the invitee receives the email', Boolean(mail), mail?.subject ?? 'no mail')
record('the raw token is not stored, only its hash', Boolean(token) && stored?.tokenHash === sha256(token) && stored.tokenHash !== token)
// The text part is checked for names: the HTML part escapes apostrophes.
record(
	'the email is branded and names the inviter and account',
	Boolean(mail?.html.includes('reynolds-built-mark.png')) &&
		Boolean(mail?.text.includes('Olive Owner')) &&
		Boolean(mail?.text.includes(workspace.name)) &&
		Boolean(mail?.text.includes(`${BASE}/invite/${token}`)),
)
record('a bad role is refused', (await send(owner, { email: newcomerEmail, roleId: '000000000000000000000000' })).status === 400)
record('a current member cannot be invited again', (await send(owner, { email: ownerEmail, roleId: role._id.toString() })).status === 409)
record("a role from another account is refused", (await send(other, { email: newcomerEmail, roleId: role._id.toString() })).status === 400)
const foreign = await other.call(`/api/account/invites?workspace=${workspace._id}`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ email: newcomerEmail, roleId: role._id.toString() }),
})
record('a non-member cannot invite into the account', foreign.status === 404, `${foreign.status}`)

// --- reading the link -------------------------------------------------------

const anon = jar()
const describe = (t) => anon.call(`/api/account/invites/${t}`)
record('an unknown token is refused', (await describe(newToken())).status === 404)
const described = await (await describe(token)).json()
record(
	'the link describes the account before sign-in',
	described.invite?.accountName === workspace.name && described.invite?.email === guestEmail && described.invite?.hasLogin === true,
)

// --- accepting ----------------------------------------------------------------

const accept = (session, t, body) =>
	session.call(`/api/account/invites/${t}`, {
		method: 'POST',
		...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
	})

const wrongPerson = await accept(other, token)
record('a different signed-in user cannot accept it', wrongPerson.status === 403 && (await wrongPerson.json()).sentTo === guestEmail, `${wrongPerson.status}`)
record('a signed-out visitor cannot accept it', (await accept(anon, token)).status === 401)

const accepted = await accept(guest, token)
record('the invited person can accept it', accepted.status === 200, `${accepted.status}`)
record(
	'accepting adds them to the account',
	Boolean(await db.collection('workspaceMembers').findOne({ workspaceId: workspace._id, userId: guest.user.id })),
)
record('accepting selects the account they joined', guest.cookies.get('rb.workspace') === workspace._id.toString())
const team = await guest.call('/api/account/team')
record('they land in that account without switching', team.status === 200 && (await team.json()).members.some((m) => m.email === guestEmail), `${team.status}`)
record('the link works only once', (await accept(guest, token)).status === 404)

const expiredToken = newToken()
await invites.insertOne({
	workspaceId: workspace._id,
	email: guestEmail,
	roleId: role._id,
	tokenHash: sha256(expiredToken),
	invitedBy: owner.user.id,
	expiresAt: new Date(Date.now() - 1000),
	createdAt: new Date(),
})
record('an expired link is refused', (await accept(guest, expiredToken)).status === 404)

const switched = await guest.call('/api/account/workspace', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ workspaceId: workspace._id.toString() }),
})
record('they can switch into the account', switched.status === 200)
const accounts = await (await guest.call('/api/account/workspace')).json()
record('both accounts are listed for the switcher', accounts.workspaces?.length === 2 && accounts.workspaces[0].isOwner === true)
const strangerSwitch = await other.call('/api/account/workspace', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ workspaceId: workspace._id.toString() }),
})
record('a non-member cannot switch into the account', strangerSwitch.status === 404)

// --- someone with no login yet -----------------------------------------------

const newSince = Date.now()
const newSent = await send(owner, { email: newcomerEmail, roleId: role._id.toString() })
record('a person with no login can be invited', newSent.status === 201 && (await newSent.json()).hasLogin === false)
const newMail = await waitForMail(newcomerEmail, newSince)
const newToken_ = linkIn(newMail, /\/invite\/([A-Za-z0-9_-]+)/)
record('their email says the link creates a login', Boolean(newMail?.text.includes("don't have a login yet")))
record('the link says they have no login', (await (await describe(newToken_)).json()).invite?.hasLogin === false)
record('a short password is refused and the link survives', (await accept(anon, newToken_, { password: 'short' })).status === 400 && Boolean(await invites.findOne({ email: newcomerEmail })))

const newcomer = jar()
const created = await accept(newcomer, newToken_, { password: 'password-newcomer-4444', name: 'New Comer' })
record('they can create a login and accept in one step', created.status === 200 && (await created.json()).created === true, `${created.status}`)
const newUser = await db.collection('users').findOne({ email: newcomerEmail })
record('the login exists with their name', newUser?.name === 'New Comer' && newUser.role === 'member')
record('they are a member of the account', Boolean(newUser) && Boolean(await db.collection('workspaceMembers').findOne({ workspaceId: workspace._id, userId: newUser._id.toString() })))
record('the account they joined is selected', newcomer.cookies.get('rb.workspace') === workspace._id.toString())
record('the link is consumed', (await describe(newToken_)).status === 404)
record('their password signs them in', (await signIn(newcomer, newcomerEmail, 'password-newcomer-4444')).error === null)
record('the session is theirs', (await sessionUser(newcomer))?.id === newUser?._id.toString())
const landing = await newcomer.call('/account')
record('they land in the account they were invited to', landing.status === 200 && (await landing.text()).includes(workspace.name))
// A fresh invitation for an address that now has a login: the signed-out
// create path must refuse to make a second one, and keep the link for the
// signed-in path.
const againToken = newToken()
await invites.insertOne({
	workspaceId: workspace._id,
	email: newcomerEmail,
	roleId: role._id,
	tokenHash: sha256(againToken),
	invitedBy: owner.user.id,
	expiresAt: new Date(Date.now() + 60_000),
	createdAt: new Date(),
})
const duplicate = await accept(jar(), againToken, { password: 'password-newcomer-4444' })
record(
	'creating a login twice is refused and the link survives',
	duplicate.status === 409 &&
		(await duplicate.json()).hasLogin === true &&
		Boolean(await invites.findOne({ tokenHash: sha256(againToken) })),
	`${duplicate.status}`,
)

await cleanup(db, all)
await client.close()
finish()
