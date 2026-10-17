import { site } from '@/lib/site'

/**
 * Where this deployment actually lives. One variable drives canonical URLs,
 * emailed links, the project subdomains, and the middleware's idea of which
 * hostnames belong to the app, so production, staging and development can never
 * disagree with each other.
 *
 * Set `NEXT_PUBLIC_APP_HOST` per environment, with the port if there is one:
 *   production   reynoldsbuilt.dev
 *   staging      staging.reynoldsbuilt.dev
 *   development  localhost:3000   (the default, so local needs no config)
 */
const PRODUCTION_HOST = site.domain.toLowerCase()

const configured = process.env.NEXT_PUBLIC_APP_HOST?.trim()
	.toLowerCase()
	.replace(/^https?:\/\//, '')
	.replace(/\/+$/, '')

export const appHost =
	configured ||
	(process.env.NODE_ENV === 'production' ? PRODUCTION_HOST : 'localhost:3000')

/** No port. What a `Host` header is compared against. */
export const appHostname = appHost.split(':')[0]

export const appProtocol =
	appHostname === 'localhost' || appHostname === '127.0.0.1' ? 'http' : 'https'

export const baseUrl = `${appProtocol}://${appHost}`

/** Only the real production deployment may be indexed or claim canonicals. */
export const isProductionHost = appHostname === PRODUCTION_HOST

/**
 * The origin for links the server puts in emails. `baseUrl` is frozen into the
 * bundle at build time, while Auth.js builds its sign-in links from `AUTH_URL`
 * at runtime; reading the same variable here means an invitation, a reset link
 * and a magic link can never point at different hosts. Server only: on the
 * client the variable is absent and this is simply `baseUrl`.
 */
export function linkOrigin() {
	const configured = process.env.AUTH_URL?.trim()
	if (configured) {
		try {
			return new URL(configured).origin
		} catch {
			// Fall through to the build-time value.
		}
	}
	return baseUrl
}
