'use client'

import { siteSchema, type Site } from './page-schema'
import { LOCAL_SITE_ID, LOOK_KEY, SITE_KEY } from './site-ids'
import type { MediaEntry } from './site-doc'

export { LOCAL_SITE_ID, LOOK_KEY, SITE_KEY }

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export type LoadedSite = {
	name: string
	site: Site | null
	look: Record<string, unknown> | null
	media: MediaEntry[]
	rev: number
}

export type Driver = {
	readonly remote: boolean
	load(): Promise<LoadedSite>
	/** Resolves to the next revision, or throws. Local always returns 0. */
	save(input: {
		site: Site
		look?: Record<string, unknown>
		rev: number
	}): Promise<number>
}

function readLocal<T>(key: string): T | null {
	try {
		const raw = window.localStorage.getItem(key)
		return raw ? (JSON.parse(raw) as T) : null
	} catch {
		return null
	}
}

export const localDriver: Driver = {
	remote: false,
	async load() {
		const raw = readLocal<unknown>(SITE_KEY)
		const parsed = raw ? siteSchema.safeParse(raw) : null
		return {
			name: 'My site',
			site: parsed?.success ? parsed.data : null,
			look: readLocal<Record<string, unknown>>(LOOK_KEY),
			media: [],
			rev: 0,
		}
	},
	async save({ site, look }) {
		window.localStorage.setItem(SITE_KEY, JSON.stringify(site))
		if (look) window.localStorage.setItem(LOOK_KEY, JSON.stringify(look))
		return 0
	},
}

export class StaleRevisionError extends Error {
	constructor(readonly serverRev: number) {
		super('This site was changed somewhere else.')
	}
}

export function remoteDriver(siteId: string): Driver {
	return {
		remote: true,
		async load() {
			const response = await fetch(`/api/sites/${siteId}`, {
				cache: 'no-store',
			})
			if (!response.ok) throw new Error('Could not load this site.')
			const { site } = await response.json()
			const parsed = siteSchema.safeParse(site.site)
			return {
				name: site.name,
				site: parsed.success ? parsed.data : null,
				look: site.look ?? null,
				media: site.media ?? [],
				rev: site.rev,
			}
		},
		async save({ site, look, rev }) {
			const response = await fetch(`/api/sites/${siteId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ site, look, rev }),
			})
			if (response.status === 409) {
				const body = await response.json().catch(() => ({}))
				throw new StaleRevisionError(body.rev ?? rev)
			}
			if (!response.ok) throw new Error('Could not save your changes.')
			const body = await response.json()
			return body.site.rev as number
		},
	}
}

export const driverFor = (siteId: string) =>
	siteId === LOCAL_SITE_ID ? localDriver : remoteDriver(siteId)
