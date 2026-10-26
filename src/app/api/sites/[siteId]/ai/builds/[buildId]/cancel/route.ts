import { cancelBuild, toBuildView } from '@/lib/builder/ai/builds'
import { aiErrorResponse } from '@/lib/builder/ai/errors'
import { buildAccess, readBody } from '@/lib/builder/ai/route-kit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Params = { params: Promise<{ siteId: string; buildId: string }> }

/** The person's Stop (section 4.6). Idempotent. */
export async function POST(request: Request, { params }: Params) {
	try {
		const { siteId, buildId } = await params
		const { db, build } = await buildAccess(siteId, buildId)
		await readBody(request)
		const stopped = await cancelBuild(db, build, new Date())
		return Response.json({ build: toBuildView(stopped) }, { headers: { 'Cache-Control': 'no-store' } })
	} catch (error) {
		return aiErrorResponse(error)
	}
}
