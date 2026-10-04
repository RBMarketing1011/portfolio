import { requireMedia } from '@/lib/media/access'
import { json, mediaError } from '@/lib/media/http'
import { suggest } from '@/lib/media/suggest'
import { MEDIA_LIMITS } from '@/lib/media/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
	try {
		const { db, workspace, userId } = await requireMedia('view', request)
		const q = (new URL(request.url).searchParams.get('q') ?? '').slice(
			0,
			MEDIA_LIMITS.queryMax,
		)
		// Nothing typed, nothing to complete: no reason to load tags and folders.
		if (!q.trim()) return json({ suggestions: [] })
		return json({
			suggestions: await suggest(db, { workspaceId: workspace._id, userId }, q),
		})
	} catch (error) {
		return mediaError(error)
	}
}
