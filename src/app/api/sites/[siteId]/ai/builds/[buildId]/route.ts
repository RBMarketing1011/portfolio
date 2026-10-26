import { toBuildView } from '@/lib/builder/ai/builds'
import { aiErrorResponse } from '@/lib/builder/ai/errors'
import { buildAccess } from '@/lib/builder/ai/route-kit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Params = { params: Promise<{ siteId: string; buildId: string }> }

/** The build as its owner sees it (section 4.3). */
export async function GET(_request: Request, { params }: Params) {
	try {
		const { siteId, buildId } = await params
		const { build } = await buildAccess(siteId, buildId)
		return Response.json({ build: toBuildView(build) }, { headers: { 'Cache-Control': 'no-store' } })
	} catch (error) {
		return aiErrorResponse(error)
	}
}
