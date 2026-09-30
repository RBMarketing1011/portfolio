import { NextResponse } from 'next/server'
import { errorResponse, requireSitePermission } from '@/lib/auth/guards'
import { toSiteResponse, type SiteDoc } from '@/lib/builder/site-doc'
import {
	checkDomain,
	domainsConfigured,
	VercelDomainError,
} from '@/lib/builder/vercel-domains'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ siteId: string }> }

/**
 * Re-reads the domain's real state from Vercel and records it. Verification is
 * only ever stamped from what Vercel reports, never from the customer saying
 * they added the record, or anyone could claim any domain by typing it in.
 */
export async function POST(_request: Request, { params }: Params) {
	try {
		const { siteId } = await params
		const { site, db } = await requireSitePermission(siteId, 'projects.publish')

		if (!site.customDomain)
			return NextResponse.json(
				{ error: 'This project has no custom domain.' },
				{ status: 400 },
			)

		if (!domainsConfigured())
			return NextResponse.json(
				{ error: 'Custom domains are not configured on this deployment yet.' },
				{ status: 503 },
			)

		let status
		try {
			status = await checkDomain(site.customDomain)
		} catch (cause) {
			if (cause instanceof VercelDomainError)
				return NextResponse.json({ error: cause.message }, { status: 502 })
			throw cause
		}

		// Both have to be true: Vercel owns the name, and DNS actually arrives here.
		const live = status.verified && !status.misconfigured

		const updated = await db.collection<SiteDoc>('sites').findOneAndUpdate(
			{ _id: site._id },
			{
				$set: {
					customDomainRecords: status.records,
					customDomainMisconfigured: status.misconfigured,
					customDomainCheckedAt: new Date(),
					customDomainVerifiedAt: live
						? (site.customDomainVerifiedAt ?? new Date())
						: null,
					updatedAt: new Date(),
				},
			},
			{ returnDocument: 'after' },
		)
		if (!updated)
			return NextResponse.json({ error: 'Site not found.' }, { status: 404 })

		return NextResponse.json({
			site: toSiteResponse(updated),
			pending: status.verified
				? status.misconfigured
					? 'dns'
					: null
				: 'ownership',
		})
	} catch (error) {
		return errorResponse(error)
	}
}
