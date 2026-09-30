import 'server-only'

/**
 * Vercel only answers for hostnames attached to a project, so a customer's
 * domain has to be registered here as well as pointed at us in DNS. The token is
 * project-scoped but still grants everything on that project, so it is read only
 * from the server and never returned to a client.
 */
const API = 'https://api.vercel.com'

const token = process.env.VERCEL_TOKEN
const projectId = process.env.VERCEL_PROJECT_ID
const teamId = process.env.VERCEL_TEAM_ID

export const domainsConfigured = () => Boolean(token && projectId)

export class VercelDomainError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code?: string,
	) {
		super(message)
	}
}

export type DnsRecord = {
	type: 'A' | 'CNAME' | 'TXT'
	name: string
	value: string
}

export type DomainStatus = {
	domain: string
	/** Vercel has confirmed ownership. Separate from whether DNS points here. */
	verified: boolean
	/** DNS does not yet resolve to Vercel. */
	misconfigured: boolean
	records: DnsRecord[]
}

/** Vercel's documented targets. */
const APEX_A_RECORD = '76.76.21.21'
const SUBDOMAIN_CNAME = 'cname.vercel-dns.com'

/**
 * Multi-label public suffixes we are likely to meet. A full public suffix list
 * is the only exact answer; being wrong here costs a misleading hint, not a
 * broken domain, because Vercel's own `misconfigured` flag is the real check.
 */
const TWO_PART_TLDS = new Set([
	'co.uk',
	'org.uk',
	'me.uk',
	'ac.uk',
	'gov.uk',
	'co.nz',
	'co.za',
	'com.au',
	'net.au',
	'org.au',
	'com.br',
	'com.mx',
	'co.jp',
	'co.in',
	'co.kr',
])

export function isApex(domain: string) {
	const parts = domain.split('.')
	if (parts.length <= 2) return true
	return parts.length === 3 && TWO_PART_TLDS.has(parts.slice(-2).join('.'))
}

/** What the customer has to add at their registrar. */
export function requiredRecords(domain: string): DnsRecord[] {
	return isApex(domain)
		? [{ type: 'A', name: '@', value: APEX_A_RECORD }]
		: [
				{
					type: 'CNAME',
					name: domain.split('.')[0],
					value: SUBDOMAIN_CNAME,
				},
			]
}

async function call<T>(
	path: string,
	init: RequestInit = {},
): Promise<T | null> {
	if (!domainsConfigured())
		throw new VercelDomainError(
			503,
			'Custom domains are not configured on this deployment.',
		)

	const url = new URL(`${API}${path}`)
	if (teamId) url.searchParams.set('teamId', teamId)

	const response = await fetch(url, {
		...init,
		headers: {
			...init.headers,
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		cache: 'no-store',
		signal: AbortSignal.timeout(10_000),
	})

	if (response.status === 204) return null

	const body = await response.json().catch(() => null)
	if (!response.ok) {
		const error = body?.error
		throw new VercelDomainError(
			response.status,
			error?.message ?? 'Vercel rejected that domain.',
			error?.code,
		)
	}
	return body as T
}

type ProjectDomain = {
	name: string
	verified: boolean
	verification?: { type: string; domain: string; value: string }[]
}

type DomainConfig = { misconfigured: boolean }

/** Ownership challenges Vercel wants when the domain is already in use elsewhere. */
const challengeRecords = (domain: ProjectDomain | null): DnsRecord[] =>
	(domain?.verification ?? [])
		.filter((item) => item.type.toUpperCase() === 'TXT')
		.map((item) => ({
			type: 'TXT' as const,
			name: item.domain,
			value: item.value,
		}))

export async function attachDomain(domain: string): Promise<DomainStatus> {
	let added: ProjectDomain | null = null
	try {
		added = await call<ProjectDomain>(`/v10/projects/${projectId}/domains`, {
			method: 'POST',
			body: JSON.stringify({ name: domain }),
		})
	} catch (error) {
		// Already on this project is success; already on someone else's is not.
		if (
			error instanceof VercelDomainError &&
			error.code === 'domain_already_in_use'
		)
			added = await call<ProjectDomain>(
				`/v9/projects/${projectId}/domains/${domain}`,
			)
		else throw error
	}

	return statusFrom(domain, added, null)
}

export async function detachDomain(domain: string) {
	try {
		await call(`/v9/projects/${projectId}/domains/${domain}`, {
			method: 'DELETE',
		})
	} catch (error) {
		// A domain that is already gone is the state we wanted.
		if (!(error instanceof VercelDomainError && error.status === 404))
			throw error
	}
}

/** Asks Vercel to re-check ownership, then reads where DNS actually points. */
export async function checkDomain(domain: string): Promise<DomainStatus> {
	let project: ProjectDomain | null = null

	try {
		project = await call<ProjectDomain>(
			`/v9/projects/${projectId}/domains/${domain}/verify`,
			{ method: 'POST' },
		)
	} catch {
		// Verification can fail while the domain is still attached and fine; the
		// record below is what decides.
		project = await call<ProjectDomain>(
			`/v9/projects/${projectId}/domains/${domain}`,
		).catch(() => null)
	}

	const config = await call<DomainConfig>(`/v6/domains/${domain}/config`).catch(
		() => null,
	)

	return statusFrom(domain, project, config)
}

function statusFrom(
	domain: string,
	project: ProjectDomain | null,
	config: DomainConfig | null,
): DomainStatus {
	const challenges = challengeRecords(project)
	return {
		domain,
		verified: Boolean(project?.verified),
		// Unknown config is treated as not yet pointing here, so a project is
		// never served on a domain we have not seen resolve.
		misconfigured: config ? config.misconfigured : true,
		records: [...requiredRecords(domain), ...challenges],
	}
}
