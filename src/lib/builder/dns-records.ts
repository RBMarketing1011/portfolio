export type DnsRecord = {
	type: 'A' | 'CNAME' | 'TXT'
	name: string
	value: string
}

/** The shape of Vercel's `/v6/domains/{domain}/config` response we rely on. */
export type DomainConfig = {
	misconfigured: boolean
	recommendedIPv4?: { rank: number; value: string[] }[]
	recommendedCNAME?: { rank: number; value: string }[]
}

/** Only used when Vercel's own recommendation cannot be read. Both are rank 2
 *  with Vercel now: still routed, but not what they tell people to use. */
export const LEGACY_APEX_A = '76.76.21.21'
export const LEGACY_CNAME = 'cname.vercel-dns.com'

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

/** DNS values come back fully qualified; registrars want them without the dot. */
const trimDot = (value: string) => value.replace(/\.$/, '')

/** Vercel ranks its suggestions, 1 being the one its own dashboard shows. */
function bestRanked<T extends { rank: number }>(options?: T[]) {
	return options?.length
		? [...options].sort((a, b) => a.rank - b.rank)[0]
		: undefined
}

/**
 * What the customer has to add at their registrar, taken from Vercel rather
 * than hardcoded: they are expanding their IP range, and the old constants are
 * already ranked below what the dashboard shows.
 */
export function requiredRecords(
	domain: string,
	config?: DomainConfig | null,
): DnsRecord[] {
	if (isApex(domain)) {
		const recommended = bestRanked(config?.recommendedIPv4)?.value
		const values = recommended?.length ? recommended : [LEGACY_APEX_A]
		return values.map((value) => ({
			type: 'A' as const,
			name: '@',
			value: trimDot(value),
		}))
	}

	const recommended = bestRanked(config?.recommendedCNAME)?.value
	return [
		{
			type: 'CNAME',
			name: domain.split('.')[0],
			value: trimDot(recommended || LEGACY_CNAME),
		},
	]
}
