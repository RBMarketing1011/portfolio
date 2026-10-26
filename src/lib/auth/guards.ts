import { ObjectId } from 'mongodb'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/mongo'
import type { SiteDoc } from '@/lib/builder/site-doc'
import { resolveMembership, type Membership } from '@/lib/workspace'
import { selectedWorkspaceId } from '@/lib/workspace/current'
import type { Permission } from '@/lib/workspace/permissions'

export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message)
	}
}

/**
 * Authenticated API calls must come from the app's own pages. Customer sites
 * are served on subdomains of the app, which makes them same-site: the session
 * cookie (SameSite=Lax) still rides along on a request one of them sends to
 * the API, so a page on a customer site could otherwise act as whoever is
 * signed in. A browser names the page behind a request in `Origin`; anything
 * other than this host is refused. A request with no `Origin` at all did not
 * come from a browser page (scripts, curl) and the session alone decides.
 */
export async function requireTrustedOrigin() {
	const incoming = await headers()
	const origin = incoming.get('origin')
	if (origin === null) return
	const host = (incoming.get('host') ?? '').trim().toLowerCase()
	let originHost: string | null = null
	try {
		originHost = new URL(origin).host.toLowerCase()
	} catch {
		// "null" or garbage: not a page of ours.
	}
	if (!host || originHost !== host)
		throw new HttpError(403, 'This request did not come from the app.')
}

export async function requireUserId() {
	await requireTrustedOrigin()
	const session = await auth()
	if (!session?.user?.id) throw new HttpError(401, 'Sign in to continue.')
	return session.user.id
}

/**
 * Resolves which account the caller is acting in and whether their role allows
 * it. A permission their role lacks is 403; an account they are not a member of
 * is 404, so this cannot be used to discover which accounts exist.
 */
export async function requirePermission(
	permission: Permission,
	workspaceId?: string | null,
): Promise<Membership> {
	const userId = await requireUserId()
	// An explicit id is a demand and must match; the cookie is only a preference.
	const membership = workspaceId
		? await resolveMembership(userId, workspaceId)
		: await resolveMembership(userId, await selectedWorkspaceId(userId), {
				preferred: true,
			})
	if (!membership) throw new HttpError(404, 'Account not found.')
	if (!membership.permissions.has(permission))
		throw new HttpError(403, 'Your role does not allow that.')
	return membership
}

/**
 * The only way a route may reach a site. A siteId from the client is an attacker's
 * parameter until this has matched it against an account the caller belongs to,
 * and "not a member" answers 404 so the endpoint cannot be used to probe which
 * ids exist.
 */
export async function requireSitePermission(
	siteId: string,
	permission: Permission,
) {
	const userId = await requireUserId()
	if (!ObjectId.isValid(siteId)) throw new HttpError(404, 'Site not found.')

	const db = await getDb()
	const site = await db
		.collection<SiteDoc>('sites')
		.findOne({ _id: new ObjectId(siteId) })
	if (!site) throw new HttpError(404, 'Site not found.')

	const membership = await resolveMembership(userId, site.workspaceId)
	if (!membership) throw new HttpError(404, 'Site not found.')
	if (!membership.permissions.has(permission))
		throw new HttpError(403, 'Your role does not allow that.')

	return { membership, site, db }
}

/** Turns a thrown HttpError into its response; anything else stays a 500. */
export function errorResponse(error: unknown) {
	if (error instanceof HttpError)
		return Response.json({ error: error.message }, { status: error.status })
	return Response.json({ error: 'Something went wrong.' }, { status: 500 })
}
