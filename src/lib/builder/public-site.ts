import 'server-only'
import { ObjectId } from 'mongodb'
import { getDb } from '@/lib/mongo'
import { siteSchema } from '@/lib/builder/page-schema'
import type { SiteDoc } from '@/lib/builder/site-doc'

export type PublicSite = {
	id: string
	name: string
	site: ReturnType<typeof siteSchema.parse>
	look: Record<string, unknown>
	media: SiteDoc['media']
}

/** Strips everything a visitor has no business seeing: owner, token, revision. */
function toPublic(doc: SiteDoc): PublicSite | null {
	const parsed = siteSchema.safeParse(doc.site)
	if (!parsed.success || parsed.data.pages.length === 0) return null
	return {
		id: doc._id.toString(),
		name: doc.name,
		site: parsed.data,
		look: doc.look ?? {},
		media: doc.media ?? [],
	}
}

/** A share link works whether or not the project is live. That is its purpose. */
export async function siteByPreviewToken(token: string) {
	if (!token || token.length > 128) return null
	const db = await getDb()
	const doc = await db
		.collection<SiteDoc>('sites')
		.findOne({ previewToken: token })
	return doc ? toPublic(doc) : null
}

/**
 * Three outcomes, because they mean different things to a visitor. A hostname
 * nobody has claimed is a genuine 404. A hostname that belongs to a project
 * which is not serving yet is somebody's site that is simply switched off, and
 * telling them that is more use than a 404.
 */
export type HostLookup =
	| { state: 'live'; site: PublicSite }
	| { state: 'inactive' }
	| { state: 'unknown' }

export async function resolveHost(input: {
	subdomain?: string
	customDomain?: string
}): Promise<HostLookup> {
	const db = await getDb()

	// Deliberately not filtered by status: "off" and "does not exist" have to be
	// told apart before either is answered.
	const doc = await db
		.collection<SiteDoc>('sites')
		.findOne(
			input.subdomain
				? { subdomain: input.subdomain }
				: { customDomain: input.customDomain },
		)

	if (!doc) return { state: 'unknown' }

	// An unverified custom domain must never serve a project: the DNS pointing
	// here is not proof that whoever typed the name owns it.
	if (input.customDomain && !doc.customDomainVerifiedAt)
		return { state: 'inactive' }

	if (doc.status !== 'live') return { state: 'inactive' }

	const site = toPublic(doc)
	return site ? { state: 'live', site } : { state: 'inactive' }
}

export async function siteById(id: string) {
	if (!ObjectId.isValid(id)) return null
	const db = await getDb()
	const doc = await db
		.collection<SiteDoc>('sites')
		.findOne({ _id: new ObjectId(id) })
	return doc ? toPublic(doc) : null
}
