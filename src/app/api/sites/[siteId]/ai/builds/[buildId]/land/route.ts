import type { Filter } from 'mongodb'
import { buildsOf, markLanded, toBuildView } from '@/lib/builder/ai/builds'
import type { LandResponse } from '@/lib/builder/ai/contract'
import { AiError, aiErrorResponse } from '@/lib/builder/ai/errors'
import { landingPayload } from '@/lib/builder/ai/landing'
import { buildAccess, readBody } from '@/lib/builder/ai/route-kit'
import type { AiBuildDoc } from '@/lib/builder/ai/types'
import type { SiteDoc } from '@/lib/builder/site-doc'
import { readSiteProfile, siteProfileDefaults } from '@/lib/builder/site-profile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Params = { params: Promise<{ siteId: string; buildId: string }> }

const inFlight = (build: AiBuildDoc) =>
	build.pages.some((page) => page.status === 'pending' || (page.status === 'writing' && page.leaseUntil != null && page.leaseUntil.getTime() > Date.now()))

/**
 * What a finished build lands as (section 4.7): assembled from the build document, applied
 * by the builder as one undo step. Business details are filled only where still empty.
 * A build the person stopped can still land the pages it finished.
 */
export async function POST(request: Request, { params }: Params) {
	try {
		const { siteId, buildId } = await params
		const { db, site, build } = await buildAccess(siteId, buildId)
		const body = await readBody(request)
		const saveProfile = Boolean(body && typeof body === 'object' && (body as { saveProfile?: unknown }).saveProfile === true)

		const landable =
			build.status === 'ready' ||
			build.status === 'landed' ||
			((build.status === 'writing' || build.status === 'cancelled') && !inFlight(build))
		if (!landable) throw new AiError('conflict', 'Some pages are still being written.')
		const written = build.pages.filter((page) => page.status === 'written' && page.written)
		const home = build.pages.find((page) => page.key === 'p1')
		if (build.placement === 'replace-site' && home?.status !== 'written') throw new AiError('home-failed')
		if (!written.length) throw new AiError('conflict', 'None of the pages could be written.')

		const landing = landingPayload(build)
		const sites = db.collection<SiteDoc>('sites')
		if (saveProfile && build.status !== 'landed' && build.profilePatch.length) {
			await sites.updateOne({ _id: site._id, profile: { $exists: false } }, { $set: { profile: siteProfileDefaults() } })
			for (const entry of build.profilePatch) {
				const path = `profile.${entry.field}`
				const empty: Filter<SiteDoc> =
					entry.field === 'business.serviceArea'
						? { $or: [{ [path]: { $exists: false } }, { [path]: { $size: 0 } }] }
						: entry.field === 'business.type'
							? { $or: [{ [path]: 'LocalBusiness' }, { [path]: { $exists: false } }] }
							: { [path]: { $in: ['', null] } }
				await sites.updateOne({ _id: site._id, ...empty }, { $set: { [path]: entry.value } })
			}
		}
		await markLanded(db, buildId, new Date())

		const after = await sites.findOne({ _id: site._id }, { projection: { profile: 1 } })
		const doc = (await buildsOf(db).findOne({ _id: buildId })) ?? build
		const response: LandResponse = { landing, profile: readSiteProfile(after?.profile), build: toBuildView(doc) }
		return Response.json(response, { headers: { 'Cache-Control': 'no-store' } })
	} catch (error) {
		return aiErrorResponse(error)
	}
}
