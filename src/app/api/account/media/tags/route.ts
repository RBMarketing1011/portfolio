import { requireMedia } from '@/lib/media/access'
import { json, mediaError } from '@/lib/media/http'
import { listTagStats } from '@/lib/media/tags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMIT_MAX = 2000

export async function GET(request: Request) {
	try {
		const { db, workspace } = await requireMedia('view', request)
		const params = new URL(request.url).searchParams

		const q = (params.get('q') ?? '').trim().slice(0, 100)
		const rawLimit = params.get('limit')
		const parsed = rawLimit === null ? NaN : Number.parseInt(rawLimit, 10)
		// Junk falls back to the library's default; a number is clamped, never refused.
		const limit = Number.isFinite(parsed)
			? Math.min(LIMIT_MAX, Math.max(1, parsed))
			: undefined

		const tags = await listTagStats(db, workspace._id, {
			...(q ? { q } : {}),
			...(limit !== undefined ? { limit } : {}),
		})
		return json({ tags })
	} catch (error) {
		return mediaError(error)
	}
}
