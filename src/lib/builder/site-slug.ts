import 'server-only'
import { randomBytes } from 'node:crypto'
import type { Collection, ObjectId } from 'mongodb'
import type { SiteDoc } from './site-doc'

export const newPreviewToken = () => randomBytes(24).toString('base64url')

/**
 * Subdomains are global, not per account: two projects cannot answer on the
 * same hostname no matter who owns them.
 */
export async function uniqueSubdomain(
	collection: Collection<SiteDoc>,
	base: string,
	ignore?: ObjectId,
) {
	const root = (base || 'site').slice(0, 55)
	const padded = root.length >= 3 ? root : `${root}-site`.slice(0, 55)

	for (let attempt = 0; attempt < 50; attempt += 1) {
		const candidate = attempt === 0 ? padded : `${padded}-${attempt + 1}`
		const clash = await collection.findOne({ subdomain: candidate })
		if (!clash || (ignore && clash._id.equals(ignore))) return candidate
	}
	return `${padded}-${Date.now().toString(36)}`
}
