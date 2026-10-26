import 'server-only'
import { createHash } from 'node:crypto'
import type { Db } from 'mongodb'
import type { ResolvedDesign } from '../design/generate'
import type { Chrome } from '../page-schema'
import type { SiteDoc } from '../site-doc'
import { recordUsage } from './budget'
import type { CallUsage, Issue } from './contract'
import { AiError } from './errors'
import type { RunContext } from './ndjson'
import type { PlanContext } from './plan-normalize'
import { guessArchetype } from './planner'
import type { AiBuildDoc } from './types'

/**
 * What the three runners (plan, outline, page) share: the per-call abort signal, the
 * anonymous user key the API sees, the site's existing pages in the forms the pipeline
 * reads them, and the plan context rebuilt from a stored build.
 */

export const ZERO_USAGE: CallUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, calls: 0, ms: 0 }

export function addUsage(a: CallUsage, b: CallUsage | null | undefined): CallUsage {
	if (!b) return a
	return {
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
		cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
		calls: a.calls + b.calls,
		ms: a.ms + b.ms,
	}
}

/** sha256 of the workspace id, first 32 hex: lets the API spot abuse without naming the account. */
export const userKeyOf = (site: Pick<SiteDoc, 'workspaceId'>) =>
	createHash('sha256').update(site.workspaceId.toHexString()).digest('hex').slice(0, 32)

/** The route's signal plus this call's own deadline (section 15.5). */
export const callSignal = (ctx: RunContext, stageMs: number) =>
	AbortSignal.any([ctx.signal, AbortSignal.timeout(Math.max(1, ctx.deadline(stageMs)))])

/** The tokens a failed call still spent, when the model answered before it failed. */
export const usageOfError = (error: unknown): CallUsage | null => (error instanceof AiError ? error.usage : null)

/** Adds a call's tokens to the day counters; never fails the work it measures. */
export async function recordDay(db: Db, build: Pick<AiBuildDoc, 'workspaceId' | 'budget'>, usage: CallUsage | null) {
	if (!usage) return
	await recordUsage(db, build.workspaceId, build.budget.day, usage).catch((error) =>
		console.error('[ai-build]', JSON.stringify({ usage: 'record failed', name: error instanceof Error ? error.name : 'unknown' })),
	)
}

/** The site's pages as the plan context names them, or null for an empty site. */
export function existingOf(pages: { id: string; name: string; slug: string }[], chrome: Chrome): PlanContext['existing'] {
	if (!pages.length) return null
	return {
		pages: pages.map((page) => ({ id: page.id, name: page.name, slug: page.slug, archetype: guessArchetype(page) })),
		chrome,
	}
}

/** The plan context of a stored build, so outline and page requests see exactly what the plan saw. */
export function planContextOf(build: AiBuildDoc, projectName: string): PlanContext {
	if (!build.context || !build.plan || !build.images) throw new AiError('conflict', 'This build has no plan yet.')
	return {
		request: build.input,
		corpus: build.context.corpus,
		business: build.context.business,
		pool: build.images.pool,
		availability: build.context.availability,
		existing: existingOf(build.snapshot.pages, build.snapshot.chrome),
		now: new Date().toISOString(),
		projectName,
	}
}

/** The footer tone a resolved design paints, for composition rules that look at the footer. */
export function footerToneOf(design: ResolvedDesign | null): 'match' | 'soft' | 'inverse' {
	const footer = design?.look?.footer
	if (!footer) return 'match'
	if (footer.scheme === 'inverse') return 'inverse'
	return footer.page.fill === 'global' ? 'match' : 'soft'
}

/** Issues without repeats, in order. */
export function dedupeIssues(issues: Issue[]): Issue[] {
	const seen = new Set<string>()
	return issues.filter((issue) => {
		const key = `${issue.code}|${issue.message}|${issue.pageKey ?? ''}|${issue.blockId ?? ''}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}
