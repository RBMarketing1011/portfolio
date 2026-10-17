import type { Collection } from 'mongodb'
import { getDb } from '@/lib/mongo'

const WINDOW_MS = 15 * 60 * 1000

/** Per-email is the credential-stuffing guard; the looser per-IP cap catches a
 *  spray across many addresses from one source. */
const LIMITS = { email: 8, ip: 30 } as const

type Attempt = { _id: string; count: number; expiresAt: Date }

const limitFor = (key: string) =>
	key.startsWith('email:') ? LIMITS.email : LIMITS.ip

const attempts = async (): Promise<Collection<Attempt>> =>
	(await getDb()).collection<Attempt>('authAttempts')

/**
 * The caller's address, as the platform saw it. Vercel writes `x-real-ip` and
 * `x-forwarded-for` from the connection itself and discards anything the client
 * sent, so they cannot be forged. Cloudflare's header is only honest behind
 * Cloudflare's proxy, so it is trusted only when the deployment says it is
 * there; otherwise anyone could pick a fresh "IP" per request and never trip
 * the per-source cap.
 */
export function clientIp(request: Request | undefined) {
	const headers = request?.headers
	if (!headers) return null
	const cloudflare =
		process.env.TRUST_CF_HEADERS === 'true'
			? headers.get('cf-connecting-ip')
			: null
	return (
		cloudflare ??
		headers.get('x-real-ip') ??
		headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
		null
	)
}

export function attemptKeys(email: string, ip: string | null) {
	return [`email:${email}`, ...(ip ? [`ip:${ip}`] : [])]
}

/**
 * Counts live in Mongo rather than a module-level Map: every serverless instance
 * has its own memory, so an in-process counter hands an attacker a fresh budget
 * on every cold start. Expiry is enforced in the query, so the collection's TTL
 * index is only housekeeping and a missing one cannot extend a lockout.
 */
export async function isLockedOut(keys: string[]) {
	const docs = await (await attempts())
		.find({ _id: { $in: keys }, expiresAt: { $gt: new Date() } })
		.toArray()

	return docs.some((doc) => doc.count >= limitFor(doc._id))
}

export async function recordFailure(keys: string[]) {
	const collection = await attempts()
	const now = new Date()
	const expiresAt = new Date(now.getTime() + WINDOW_MS)

	await collection.deleteMany({ _id: { $in: keys }, expiresAt: { $lte: now } })
	await Promise.all(
		keys.map((key) =>
			collection.updateOne(
				{ _id: key },
				{ $inc: { count: 1 }, $setOnInsert: { expiresAt } },
				{ upsert: true },
			),
		),
	)
}

export async function clearFailures(keys: string[]) {
	await (await attempts()).deleteMany({ _id: { $in: keys } })
}

/**
 * General throttle for the flows that send email: whether `key` may fire again
 * within the window, counting this call. Shares the collection and the
 * query-time expiry, so a missing TTL index cannot extend a window either.
 */
export async function throttle(key: string, max: number) {
	const collection = await attempts()
	const now = new Date()

	await collection.deleteOne({ _id: key, expiresAt: { $lte: now } })
	const doc = await collection.findOneAndUpdate(
		{ _id: key },
		{
			$inc: { count: 1 },
			$setOnInsert: { expiresAt: new Date(now.getTime() + WINDOW_MS) },
		},
		{ upsert: true, returnDocument: 'after' },
	)

	return (doc?.count ?? 1) <= max
}
