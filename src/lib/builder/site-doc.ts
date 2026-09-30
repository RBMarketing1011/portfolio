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

export const SITE_STATUSES = ['draft', 'live'] as const
export type SiteStatus = (typeof SITE_STATUSES)[number]

/** Labels the app itself answers on, or intends to. */
export const RESERVED_SUBDOMAINS = new Set([
	'www',
	'app',
	'api',
	'admin',
	'account',
	'builder',
	'preview',
	'assets',
	'cdn',
	'static',
	'mail',
	'smtp',
	'ftp',
	'ns1',
	'ns2',
	'blog',
	'docs',
	'status',
	'support',
])

/** Becomes a hostname label, so the DNS rules apply: no leading or trailing dash. */
export const subdomainSchema = z
	.string()
	.min(3)
	.max(63)
	.regex(
		/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
		'Use lowercase letters, numbers and dashes.',
	)
	.refine((value) => !RESERVED_SUBDOMAINS.has(value), 'That name is reserved.')

/** A bare hostname. No scheme, no path, no port. */
export const customDomainSchema = z
	.string()
	.min(4)
	.max(253)
	.regex(
		/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
		'Enter a domain like example.com.',
	)

export const slugifySite = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 63)

/** What the client may send. `workspaceId`, `status` and `rev` are the server's to set. */
export const sitePayloadSchema = z.object({
	name: z.string().min(1).max(120),
	site: siteSchema,
	look: lookSchema.optional(),
})

export type SitePayload = z.infer<typeof sitePayloadSchema>

export const sitePatchSchema = sitePayloadSchema.partial().extend({
	rev: z.number().int().nonnegative(),
})

/** Project settings, which move on their own rather than riding the canvas save. */
export const siteSettingsSchema = z.object({
	name: z.string().min(1).max(120).optional(),
	subdomain: subdomainSchema.optional(),
	customDomain: customDomainSchema.nullable().optional(),
	status: z.enum(SITE_STATUSES).optional(),
})

export type DnsRecord = { type: 'A' | 'CNAME' | 'TXT'; name: string; value: string }

export type SiteDoc = {
	_id: import('mongodb').ObjectId
	workspaceId: import('mongodb').ObjectId
	/** The user who created it. Kept for attribution; access comes from the workspace. */
	ownerId: string
	name: string
	/** The hostname label under the app's own domain. Unique across every account. */
	subdomain: string
	customDomain: string | null
	customDomainVerifiedAt: Date | null
	/** What Vercel says the customer must add at their registrar. */
	customDomainRecords: DnsRecord[]
	/** Vercel can see the domain but DNS does not point here yet. */
	customDomainMisconfigured: boolean
	customDomainCheckedAt: Date | null
	/** Secret. Anyone holding it can view the project whether or not it is live. */
	previewToken: string
	status: SiteStatus
	publishedAt: Date | null
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
	subdomain: string
	customDomain: string | null
	customDomainVerified: boolean
	customDomainRecords: DnsRecord[]
	customDomainMisconfigured: boolean
	customDomainCheckedAt: string | null
	previewToken: string
	status: SiteStatus
	publishedAt: string | null
	site: z.infer<typeof siteSchema>
	look: Record<string, unknown>
	media: MediaEntry[]
	rev: number
	updatedAt: string
}

export const toSiteResponse = (doc: SiteDoc): SiteResponse => ({
	id: doc._id.toString(),
	name: doc.name,
	subdomain: doc.subdomain,
	customDomain: doc.customDomain ?? null,
	customDomainVerified: Boolean(doc.customDomainVerifiedAt),
	customDomainRecords: doc.customDomainRecords ?? [],
	customDomainMisconfigured: doc.customDomainMisconfigured ?? true,
	customDomainCheckedAt: doc.customDomainCheckedAt?.toISOString() ?? null,
	previewToken: doc.previewToken,
	status: doc.status ?? 'draft',
	publishedAt: doc.publishedAt?.toISOString() ?? null,
	site: doc.site,
	look: doc.look ?? {},
	media: doc.media ?? [],
	rev: doc.rev,
	updatedAt: doc.updatedAt.toISOString(),
})
