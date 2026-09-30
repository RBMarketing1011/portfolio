import { NextResponse, type NextRequest } from 'next/server'
import { isAppHost, subdomainOf } from '@/lib/builder/hosting'

const HOSTED_PREFIX = '/hosted/'

/**
 * Edge only, so no database here: this decides nothing about who may see what,
 * it just routes a hostname into the hosted-site segment. That segment does the
 * lookup and refuses anything that is not live.
 */
export function middleware(request: NextRequest) {
	const host = request.headers.get('host') ?? ''
	const url = request.nextUrl.clone()

	if (!host || isAppHost(host)) {
		// The segment exists only as a rewrite target. Reaching it directly would
		// serve customer sites a second time under the app's own domain.
		if (url.pathname.startsWith(HOSTED_PREFIX))
			return new NextResponse(null, { status: 404 })
		return NextResponse.next()
	}

	// A rewritten request must not be able to name its own target.
	if (url.pathname.startsWith(HOSTED_PREFIX))
		return new NextResponse(null, { status: 404 })

	const label = subdomainOf(host)

	url.pathname = label
		? `/hosted/sub/${label}${url.pathname}`
		: `/hosted/domain/${host.split(':')[0].toLowerCase()}${url.pathname}`

	return NextResponse.rewrite(url)
}

export const config = {
	// Static assets and the auth/API surface always belong to the app itself.
	matcher: ['/((?!_next/|api/|favicon|logo/|.*\\.[\\w]+$).*)'],
}
