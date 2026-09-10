import type { NextConfig } from 'next'

// The builder, the section library, and both preview surfaces. A header cannot be
// dropped by a child route overriding its own metadata, so this backs up the
// per-route noindex rather than relying on it alone.
const internal = [
	'/sections',
	'/sections/:path*',
	'/section-preview',
	'/section-preview/:path*',
	'/page-preview',
	'/page-preview/:path*',
	'/preview',
	'/preview/:path*',
]

const nextConfig: NextConfig = {
	async headers() {
		return internal.map((source) => ({
			source,
			headers: [
				{
					key: 'X-Robots-Tag',
					value: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
				},
			],
		}))
	},
}

export default nextConfig
