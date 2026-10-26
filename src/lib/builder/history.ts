/**
 * The builder's undo history. One snapshot holds the site and its look together, so
 * undoing an AI build brings back the old pages and the old theme in one step, and a
 * per-section surface never outlives the block it paints.
 *
 * Pure: every function returns a new history and touches nothing else, so the store
 * can call them outside React's state updaters (StrictMode runs those twice) and the
 * proofs can drive them with plain values.
 */
import { defaultLook, type BuilderLook } from './look'
import { defaultChrome, type Site } from './page-schema'

export type Snapshot = { site: Site; look: BuilderLook }

export type History = {
	past: Snapshot[]
	present: Snapshot
	future: Snapshot[]
	/** The last coalescing change: a burst of edits to one field within COALESCE_MS is one step. */
	group: { key: string; at: number } | null
}

/** Steps kept behind the present. */
export const HISTORY_LIMIT = 50

/** How long after the last change to the same field typing still extends that step. */
export const COALESCE_MS = 1200

/** An empty site with today's default look, before anything has loaded. */
export const initialHistory: History = {
	past: [],
	present: {
		site: { version: 1, chrome: { ...defaultChrome }, pages: [] },
		look: defaultLook(),
	},
	future: [],
	group: null,
}

/**
 * Makes `next` the present. A change with the same `coalesce` key as the last one,
 * within COALESCE_MS of it, replaces the present instead of adding a step.
 */
export function commit(
	h: History,
	next: Snapshot,
	opts: { coalesce?: string; now: number; limit?: number },
): History {
	if (next === h.present) return h
	const merge =
		opts.coalesce !== undefined &&
		h.group?.key === opts.coalesce &&
		opts.now - h.group.at < COALESCE_MS
	const keep = Math.max(0, (opts.limit ?? HISTORY_LIMIT) - 1)
	return {
		past: merge ? h.past : [...(keep > 0 ? h.past.slice(-keep) : []), h.present],
		present: next,
		future: merge ? h.future : [],
		group: opts.coalesce !== undefined ? { key: opts.coalesce, at: opts.now } : null,
	}
}

/** The present moves to the future and the last past step comes back. Nothing to undo: unchanged. */
export function undo(h: History): History {
	if (h.past.length === 0) return h
	return {
		past: h.past.slice(0, -1),
		present: h.past[h.past.length - 1],
		future: [...h.future, h.present],
		group: null,
	}
}

/** The reverse of undo. Nothing to redo: unchanged. */
export function redo(h: History): History {
	if (h.future.length === 0) return h
	return {
		past: [...h.past, h.present],
		present: h.future[h.future.length - 1],
		future: h.future.slice(0, -1),
		group: null,
	}
}
