/**
 * Proves the passwordless path end to end: a request answers the same for every
 * address, only a real login gets the email, the emailed link lands on the
 * click-through page, the click signs the person in exactly once, and strangers
 * can never be signed in or created. Run against the dev server with a local
 * database and the mail sink (see lib/auth-harness.mjs).
 */
import { createHash } from 'node:crypto'
import {
	BASE,
	cleanup,
	connect,
	csrf,
	jar,
	linkIn,
	rand,
	readSink,
	recorder,
	seedUser,
	sessionUser,
	waitForMail,
} from './lib/auth-harness.mjs'

const { client, db } = await connect()
const { record, finish } = recorder()

const secret = process.env.AUTH_SECRET
if (!secret) {
	console.error('AUTH_SECRET is not set; the stored token hash cannot be checked.')
	process.exit(1)
}
// Auth.js stores sha256(token + secret); with one secret that is this.
const stored = (raw) => createHash('sha256').update(`${raw}${secret}`).digest('hex')

const run = rand()
const person = `e2e_magic_${run}@example.test`
const stranger = `e2e_ghost_${run}@example.test`
const tokens = db.collection('verification_tokens')

const { id: personId } = await seedUser(db, { email: person, password: 'password-magic-0000' })
// Counters from an earlier run inside the window must not trip the per-source cap.
await db.collection('authAttempts').deleteMany({ _id: { $in: ['link:ip:::1', 'link:ip:127.0.0.1'] } })

const ask = async (session, email) => {
	const csrfToken = await csrf(session)
	const response = await session.call('/api/auth/signin/nodemailer', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'X-Auth-Return-Redirect': '1',
		},
		body: new URLSearchParams({ email, csrfToken, callbackUrl: `${BASE}/account` }),
	})
	const body = await response.json().catch(() => ({}))
	return { status: response.status, url: body.url ?? '' }
}

// --- requesting -------------------------------------------------------------

const since = Date.now()
const asked = await ask(jar(), person)
record('a request for a real login is accepted', asked.status === 200 && asked.url.includes('verify-request'), asked.url.slice(0, 80))

const row = await tokens.findOne({ identifier: person })
record('one token is stored, expiring within 15 minutes', Boolean(row) && row.expires - Date.now() <= 15 * 60 * 1000 && row.expires > new Date())

const mail = await waitForMail(person, since)
const link = linkIn(mail, /(\/sign-in\/verify\?[^"'\s<]+)/)
record('the email arrives', Boolean(mail), mail?.subject ?? 'no mail')
record('the link goes to the click-through page, not straight to the callback', Boolean(link))
const params = new URLSearchParams(link?.split('?')[1] ?? '')
const rawToken = params.get('token')
record('the link carries the token whose hash is stored', Boolean(rawToken) && row?.token === stored(rawToken))
record('the email is branded', Boolean(mail?.html.includes('reynolds-built-mark.png')))

const strangerSince = Date.now()
const strangerAsked = await ask(jar(), stranger)
record(
	'an unknown address gets the same answer and no email',
	strangerAsked.url.includes('verify-request') && (await waitForMail(stranger, strangerSince, 1500)) === null,
	strangerAsked.url.slice(0, 80),
)
record('no login is created for the unknown address', (await db.collection('users').countDocuments({ email: stranger })) === 0)

// --- redeeming --------------------------------------------------------------

const visitor = jar()
const page = await visitor.call(link)
const html = await page.text()
record('the click-through page renders with a continue button', page.status === 200 && html.includes('Continue'))
const callback = html.match(/href="(\/api\/auth\/callback\/nodemailer\?[^"]+)"/)?.[1]?.replace(/&amp;/g, '&')
record('the page links to the real callback', Boolean(callback) && callback.includes(`token=${rawToken}`))

record('rendering the page did not spend the token', Boolean(await tokens.findOne({ identifier: person })))

const redeemed = await visitor.call(callback)
record(
	'continuing signs the person in and lands on their account',
	redeemed.status === 302 && redeemed.headers.get('location') === `${BASE}/account`,
	`${redeemed.status} ${redeemed.headers.get('location')}`,
)
record('the session is theirs', (await sessionUser(visitor))?.id === personId)
record('the token is gone', (await tokens.countDocuments({ identifier: person })) === 0)

const replay = await jar().call(callback)
record(
	'the link works only once',
	replay.status === 302 && (replay.headers.get('location') ?? '').includes('error=Verification'),
	replay.headers.get('location') ?? '',
)
const forged = await jar().call(`/api/auth/callback/nodemailer?token=forged&email=${encodeURIComponent(person)}`)
record('a forged token is refused', (forged.headers.get('location') ?? '').includes('error=Verification'))

const errorPage = await jar().call('/sign-in?error=Verification')
record('the sign-in page explains an expired link', (await errorPage.text()).includes('expired'))

// --- a stranger holding a valid token ---------------------------------------

const ghostRaw = `ghost${run}`
await tokens.insertOne({
	identifier: stranger,
	token: stored(ghostRaw),
	expires: new Date(Date.now() + 60_000),
})
const ghost = await jar().call(
	`/api/auth/callback/nodemailer?token=${ghostRaw}&email=${encodeURIComponent(stranger)}&callbackUrl=${encodeURIComponent(`${BASE}/account`)}`,
)
record(
	'a valid token for an address with no login is refused',
	(ghost.headers.get('location') ?? '').includes('error=AccessDenied'),
	ghost.headers.get('location') ?? '',
)
record('and still creates no login', (await db.collection('users').countDocuments({ email: stranger })) === 0)

// --- limits -----------------------------------------------------------------

// From a clean window, so the requests above do not count against it.
await db.collection('authAttempts').deleteMany({ _id: `link:${person}` })
const eager = jar()
let sentCount = 0
let lastUrl = ''
for (let i = 0; i < 6; i += 1) {
	const before = Date.now()
	lastUrl = (await ask(eager, person)).url
	if (await waitForMail(person, before, 2500)) sentCount += 1
}
record(
	'a sixth link request in the window is answered the same and sends nothing',
	sentCount === 5 && lastUrl.includes('verify-request'),
	`${sentCount} sent, last ${lastUrl.slice(0, 60)}`,
)

// Long after the request: the stranger's work ran after the response, and
// there must still be nothing to show for it.
record('the unknown address never got anything', readSink(stranger, strangerSince) === null)

await db.collection('authAttempts').deleteMany({
	_id: { $in: [`link:${person}`, `link:${stranger}`, 'link:ip:::1', 'link:ip:127.0.0.1'] },
})
await cleanup(db, [person, stranger])
await client.close()
finish()
