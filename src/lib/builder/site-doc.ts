import { z } from 'zod'
import { siteSchema } from './page-schema'

/** The saved theme/background settings. Shape-checked loosely: the builder's own
 *  merge fills in anything an older save is missing. */
const lookSchema = z.object({
	theme: z.record(z.string(), z.unknown()).optional(),
	page: z.record(z.string(), z.unknown()).optional(),
	header: z.record(z.string(), z.unknown()).optional(),
	footer: z.record(z.string(), z.unknown()).optional(),
	blocks: z.record(z.string(), z.unknown()).optional(),
})

export const mediaEntrySchema = z.object({
	id: z.string().min(1),
	name: z.string().max(200),
	url: z.string().url(),
	pathname: z.string(),
	bytes: z.number().int().nonnegative(),
	contentType: z.string().max(100),
	addedAt: z.string(),
})

export type MediaEntry = z.infer<typeof mediaEntrySchema>

/** What the client may send. `ownerId` and `rev` are the server's to set. */
export const sitePayloadSchema = z.object({
	name: z.string().min(1).max(120),
	site: siteSchema,
	look: lookSchema.optional(),
})

export type SitePayload = z.infer<typeof sitePayloadSchema>

export const sitePatchSchema = sitePayloadSchema.partial().extend({
	rev: z.number().int().nonnegative(),
})

export type SiteDoc = {
	_id: import('mongodb').ObjectId
	ownerId: string
	name: string
	site: z.infer<typeof siteSchema>
	look: Record<string, unknown>
	media: MediaEntry[]
	rev: number
	createdAt: Date
	updatedAt: Date
}

/** The shape the builder receives. `_id` becomes a string; nothing else leaks. */
export type SiteResponse = {
	id: string
	name: string
	site: z.infer<typeof siteSchema>
	look: Record<string, unknown>
	media: MediaEntry[]
	rev: number
	updatedAt: string
}

export const toSiteResponse = (doc: SiteDoc): SiteResponse => ({
	id: doc._id.toString(),
	name: doc.name,
	site: doc.site,
	look: doc.look ?? {},
	media: doc.media ?? [],
	rev: doc.rev,
	updatedAt: doc.updatedAt.toISOString(),
})
