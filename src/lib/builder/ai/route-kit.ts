import 'server-only'
import { requireSitePermission } from '@/lib/auth/guards'
import { loadBuild } from './builds'
import { AI_LIMITS } from './contract'
import { AiError } from './errors'
import { builderAiConfigured } from './model'

/**
 * The checks every build route starts with (section 4.0): who may edit the site, whether
 * AI building is configured, the body's size and shape, and that a build belongs to the
 * person asking. Anything else about a build is a 404, so nobody can probe for others'.
 */

const BUILD_ID = /^bld_[0-9a-f]{24}$/
const PAGE_KEY = /^p([1-9]|1[0-2])$/

export async function siteAccess(siteId: string) {
	const access = await requireSitePermission(siteId, 'projects.edit')
	if (!builderAiConfigured()) throw new AiError('not-configured')
	return access
}

/** The JSON body, after the size check: `{}` for routes that take none. */
export async function readBody(request: Request): Promise<unknown> {
	const length = Number(request.headers.get('content-length') ?? '0')
	if (Number.isFinite(length) && length > AI_LIMITS.requestMaxBytes) throw new AiError('too-large')
	const text = await request.text()
	if (text.length > AI_LIMITS.requestMaxBytes) throw new AiError('too-large')
	if (!text.trim()) return {}
	try {
		return JSON.parse(text)
	} catch {
		throw new AiError('bad-request', 'Invalid request.')
	}
}

export function checkIds(buildId: string, pageKey?: string) {
	if (!BUILD_ID.test(buildId)) throw new AiError('not-found')
	if (pageKey !== undefined && !PAGE_KEY.test(pageKey)) throw new AiError('not-found')
}

/** The site, its database and this person's build, or a 404. */
export async function buildAccess(siteId: string, buildId: string, opts?: { includeExpired?: boolean; pageKey?: string }) {
	checkIds(buildId, opts?.pageKey)
	const access = await siteAccess(siteId)
	const build = await loadBuild(
		access.db,
		buildId,
		{ siteId: access.site._id, workspaceId: access.site.workspaceId, userId: access.membership.userId },
		{ includeExpired: opts?.includeExpired },
	)
	if (!build) throw new AiError('not-found')
	return { ...access, build }
}
