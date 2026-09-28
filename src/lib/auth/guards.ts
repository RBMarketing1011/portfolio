import { ObjectId } from 'mongodb'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/mongo'
import type { SiteDoc } from '@/lib/builder/site-doc'

export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message)
	}
}

export async function requireUserId() {
	const session = await auth()
	if (!session?.user?.id) throw new HttpError(401, 'Sign in to continue.')
	return session.user.id
}

/**
 * The only way a route may reach a site. A siteId from the client is an attacker's
 * parameter until this has matched it against the signed-in owner, and "not yours"
 * answers 404 so the endpoint cannot be used to probe which ids exist.
 */
export async function requireSiteOwner(siteId: string) {
	const ownerId = await requireUserId()
	if (!ObjectId.isValid(siteId)) throw new HttpError(404, 'Site not found.')

	const db = await getDb()
	const site = await db
		.collection<SiteDoc>('sites')
		.findOne({ _id: new ObjectId(siteId) })

	if (!site || site.ownerId !== ownerId)
		throw new HttpError(404, 'Site not found.')

	return { ownerId, site, db }
}

/** Turns a thrown HttpError into its response; anything else stays a 500. */
export function errorResponse(error: unknown) {
	if (error instanceof HttpError)
		return Response.json({ error: error.message }, { status: error.status })
	return Response.json({ error: 'Something went wrong.' }, { status: 500 })
}
