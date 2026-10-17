/**
 * Shared plumbing for the auth proofs. Every script runs against the dev
 * server and a LOCAL throwaway MongoDB; the preflight refuses anything else,
 * because the proofs create and delete people.
 *
 * Logins are created the way the app creates them (the same document shape as
 * scripts/make-admin.mjs and the welcome route), never through a registration
 * endpoint: registration is by invitation only, and only prove-welcome.mjs goes
 * through the real invitation flow.
 *
 * Emails are read from the sink (`MAIL_SINK_DIR`): the dev server writes every
 * message it would send as a JSON file, so a proof can follow the exact link a
 * person would have clicked.
 */
import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { MongoClient } from 'mongodb'
import { hash } from '@node-rs/argon2'

export const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

export const rand = () => Math.random().toString(36).slice(2, 10)

/** Hashes a raw invitation or reset token the way the app stores it. */
export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export const newToken = () => randomBytes(32).toString('base64url')

export function preflight() {
	const uri = process.env.MONGODB_URI ?? ''
	const host = uri
		.replace(/^mongodb(\+srv)?:\/\//, '')
		.replace(/^[^@]*@/, '')
		.split(/[/?]/)[0]
	if (
		!/^mongodb:\/\//.test(uri) ||
		!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)
	) {
		console.error(
			`Refusing to run proofs against "${host || '(no MONGODB_URI)'}". They need a local throwaway MongoDB, e.g. MONGODB_URI=mongodb://127.0.0.1:27017/reynoldsbuilt_proof.`,
		)
		process.exit(1)
	}
}

const isLocalHost = (value) =>
	/^(127\.0\.0\.1|localhost|\[::1\]|::1)(:\d+)?$/.test(String(value))

/** Connects, and checks the dev server is looking at the same LOCAL database. */
export async function connect() {
	preflight()
	const client = new MongoClient(process.env.MONGODB_URI)
	await client.connect()
	const db = client.db()
	const health = await fetch(`${BASE}/api/health/db`)
		.then((response) => response.json())
		.catch(() => null)
	const hosts = Array.isArray(health?.hosts) ? health.hosts : []
	if (
		!health?.ok ||
		health.database !== db.databaseName ||
		hosts.length === 0 ||
		!hosts.every(isLocalHost)
	) {
		console.error(
			`The dev server at ${BASE} is not using local database "${db.databaseName}" (it reports ${JSON.stringify(health)}). Start it with the same MONGODB_URI.`,
		)
		await client.close()
		process.exit(1)
	}
	return { client, db }
}

function sinkDir() {
	const dir = process.env.MAIL_SINK_DIR
	if (!dir)
		throw new Error(
			'MAIL_SINK_DIR is not set. This proof reads emailed links from the sink the dev server writes to; start both with the same MAIL_SINK_DIR.',
		)
	return dir
}

export function jar() {
	const cookies = new Map()
	return {
		cookies,
		set: (name, value) => cookies.set(name, value),
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
				const [pair, ...attributes] = raw.split(';')
				const index = pair.indexOf('=')
				const name = pair.slice(0, index)
				const value = pair.slice(index + 1)
				// A cleared cookie (Max-Age=0 or an empty value) is gone, not kept.
				const cleared =
					!value ||
					attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))
				if (cleared) cookies.delete(name)
				else cookies.set(name, value)
			}
			return response
		},
	}
}

export async function csrf(session) {
	return (await (await session.call('/api/auth/csrf')).json()).csrfToken
}

/** The user document exactly as the app writes it. */
export async function seedUser(
	db,
	{ email, password, role = 'member', name = null },
) {
	const now = new Date()
	const address = email.toLowerCase().trim()
	const result = await db.collection('users').insertOne({
		email: address,
		name,
		emailVerified: now,
		passwordHash: await hash(password),
		role,
		createdAt: now,
		updatedAt: now,
	})
	return { id: result.insertedId.toString(), email: address }
}

/**
 * A credentials sign-in, the way the browser does it. With the return-redirect
 * header every outcome is a JSON `{ url }`, and the outcome is in its query.
 */
export async function signIn(session, email, password, extraHeaders = {}) {
	const csrfToken = await csrf(session)
	const response = await session.call('/api/auth/callback/credentials', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'X-Auth-Return-Redirect': '1',
			...extraHeaders,
		},
		body: new URLSearchParams({
			email,
			password,
			csrfToken,
			callbackUrl: `${BASE}/account`,
		}),
	})
	const body = await response.json().catch(() => ({}))
	const url = new URL(body.url ?? `${BASE}/`)
	return {
		status: response.status,
		error: url.searchParams.get('error'),
		code: url.searchParams.get('code'),
		url: body.url ?? null,
	}
}

export async function sessionUser(session) {
	const body = await (await session.call('/api/auth/session')).json()
	return body?.user ?? null
}

/** Seeds a login and signs it in; the returned jar carries the session. */
export async function signUpAndIn(db, email, password, options = {}) {
	const user = await seedUser(db, { email, password, ...options })
	const session = jar()
	const result = await signIn(session, email, password)
	if (result.error) throw new Error(`sign-in failed for ${email}: ${result.error}`)
	const me = await sessionUser(session)
	if (me?.id !== user.id) throw new Error(`no session established for ${email}`)
	session.user = user
	return session
}

/** The newest message in the sink addressed to `to`, written after `since`. */
export function readSink(to, since = 0) {
	const dir = sinkDir()
	const address = to.toLowerCase()
	const messages = readdirSync(dir)
		.filter((name) => name.endsWith('.json'))
		.map((name) => {
			try {
				return JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
			} catch {
				return null
			}
		})
		.filter(
			(mail) =>
				mail &&
				mail.to?.toLowerCase() === address &&
				new Date(mail.at).getTime() > since,
		)
		.sort((a, b) => new Date(b.at) - new Date(a.at))
	return messages[0] ?? null
}

/** Waits for a sink message, since the server writes it after responding. */
export async function waitForMail(to, since = 0, timeoutMs = 8000) {
	const started = Date.now()
	while (Date.now() - started < timeoutMs) {
		const mail = readSink(to, since)
		if (mail) return mail
		await new Promise((resolve) => setTimeout(resolve, 150))
	}
	return null
}

/** The first link in a message matching `pattern` (which must capture the path). */
export function linkIn(mail, pattern) {
	if (!mail) return null
	const text = `${mail.html}\n${mail.text}`.replace(/&amp;/g, '&')
	return text.match(pattern)?.[1] ?? null
}

/** Removes everything the proofs created for these addresses. */
export async function cleanup(db, emails) {
	const addresses = emails.map((e) => e.toLowerCase())
	const users = await db
		.collection('users')
		.find({ email: { $in: addresses } }, { projection: { _id: 1 } })
		.toArray()
	const ids = users.map((u) => u._id.toString())
	const workspaces = await db
		.collection('workspaces')
		.find({ ownerId: { $in: ids } }, { projection: { _id: 1 } })
		.toArray()
	const workspaceIds = workspaces.map((w) => w._id)
	await Promise.all([
		db.collection('users').deleteMany({ email: { $in: addresses } }),
		db.collection('workspaces').deleteMany({ _id: { $in: workspaceIds } }),
		db.collection('workspaceRoles').deleteMany({ workspaceId: { $in: workspaceIds } }),
		db.collection('workspaceMembers').deleteMany({
			$or: [{ workspaceId: { $in: workspaceIds } }, { userId: { $in: ids } }],
		}),
		db.collection('workspaceInvites').deleteMany({
			$or: [{ workspaceId: { $in: workspaceIds } }, { email: { $in: addresses } }],
		}),
		db.collection('platformInvites').deleteMany({ email: { $in: addresses } }),
		db.collection('passwordResets').deleteMany({ email: { $in: addresses } }),
		db.collection('verification_tokens').deleteMany({ identifier: { $in: addresses } }),
		db.collection('sites').deleteMany({ workspaceId: { $in: workspaceIds } }),
		db.collection('authAttempts').deleteMany({
			_id: { $in: addresses.map((a) => `email:${a}`) },
		}),
	])
}

/** Collects assertions and prints them the way every proof always has. */
export function recorder() {
	const results = []
	return {
		record: (name, pass, detail = '') => results.push({ name, pass, detail }),
		finish() {
			for (const { name, pass, detail } of results)
				console.log(
					`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
				)
			const passed = results.filter((r) => r.pass).length
			console.log(`\n${passed}/${results.length} passed`)
			process.exit(passed === results.length ? 0 : 1)
		},
	}
}
