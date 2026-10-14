'use client'

import { useEffect, useState } from 'react'
import type { Block } from '@/lib/builder/types'

/** What the AI may change. Colours, layout and spacing are never among them. */
export type AiOptions = {
	/** Rewrite headings, copy, buttons, lists and icons. */
	text: boolean
	/** Swap images that are already set. */
	replaceImages: boolean
	/** Fill image spots that are empty. */
	fillImages: boolean
}

export type AiRequest = {
	page: { name: string; slug: string }
	blocks: Block[]
	instructions?: string
	scope: 'page' | 'section'
	options: AiOptions
}

// One answer per project for the life of the tab: the key does not come and go.
const known = new Map<string, Promise<boolean>>()

/**
 * Whether AI writing is on for this project. Only a saved, signed-in project has the
 * business details and media library the AI writes from, so a browser-only site is
 * always off.
 */
export function useBuilderAi(siteId: string, remote: boolean) {
	const [enabled, setEnabled] = useState(false)
	useEffect(() => {
		if (!remote) return
		let live = true
		let answer = known.get(siteId)
		if (!answer) {
			answer = fetch(`/api/sites/${siteId}/ai/write`, { cache: 'no-store' })
				.then((response) => (response.ok ? response.json() : { enabled: false }))
				.then((body) => Boolean(body.enabled))
				.catch(() => false)
			known.set(siteId, answer)
		}
		void answer.then((value) => {
			if (live) setEnabled(value)
		})
		return () => {
			live = false
		}
	}, [siteId, remote])
	return remote && enabled
}

/** Sends sections to the AI and returns them rewritten. Throws with a message to show. */
export async function writeWithAi(
	siteId: string,
	request: AiRequest,
	signal?: AbortSignal,
): Promise<Block[]> {
	const response = await fetch(`/api/sites/${siteId}/ai/write`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(request),
		signal,
	})
	const body = await response.json().catch(() => ({}))
	if (!response.ok || !Array.isArray(body.blocks))
		throw new Error(body.error ?? 'The AI could not write this right now.')
	return body.blocks as Block[]
}
