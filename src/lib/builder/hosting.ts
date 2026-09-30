import { appHost, appHostname, appProtocol } from '@/lib/app-url'

export { appHost, appHostname, appProtocol }

const stripPort = (host: string) => host.split(':')[0].toLowerCase()

/**
 * Whether a `Host` header belongs to the app itself rather than to a project.
 * Ports are ignored: the deployment answers on whatever port it was given.
 */
export const isAppHost = (host: string) => {
	const bare = stripPort(host)
	return bare === appHostname || bare === `www.${appHostname}`
}

/** The project label in `<label>.<appHostname>`, or null when this is not one. */
export function subdomainOf(host: string) {
	const bare = stripPort(host)
	if (bare === appHostname || !bare.endsWith(`.${appHostname}`)) return null

	const label = bare.slice(0, -(appHostname.length + 1))
	// Only the first level is a project; deeper names are not ours to serve.
	return label && !label.includes('.') && label !== 'www' ? label : null
}

/** Where a live project is reachable, for display and for links. */
export function liveUrl(input: {
	subdomain: string
	customDomain?: string | null
	customDomainVerified?: boolean
}) {
	if (input.customDomain && input.customDomainVerified)
		return `https://${input.customDomain}`
	return `${appProtocol}://${input.subdomain}.${appHost}`
}

export const previewPath = (token: string) => `/p/${token}`
