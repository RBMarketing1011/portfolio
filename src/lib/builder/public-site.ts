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

/** A hostname only resolves while the project is actually live. */
export async function liveSiteByHost(input: {
	subdomain?: string
	customDomain?: string
}) {
	const db = await getDb()
	const query = input.subdomain
		? { subdomain: input.subdomain, status: 'live' as const }
		: {
				customDomain: input.customDomain,
				customDomainVerifiedAt: { $ne: null },
				status: 'live' as const,
			}

	const doc = await db.collection<SiteDoc>('sites').findOne(query)
	return doc ? toPublic(doc) : null
}

export async function siteById(id: string) {
	if (!ObjectId.isValid(id)) return null
	const db = await getDb()
	const doc = await db
		.collection<SiteDoc>('sites')
		.findOne({ _id: new ObjectId(id) })
	return doc ? toPublic(doc) : null
}
