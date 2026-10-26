import type { NextConfig } from 'next'

// Both preview surfaces. A header cannot be dropped by a child route overriding its
// own metadata, so this backs up the per-route noindex rather than relying on it
// alone. The builder is left out: it is a public product linked from the header.
const internal = [
	'/section-preview',
	'/section-preview/:path*',
	'/page-preview',
	'/page-preview/:path*',
	'/preview',
	'/preview/:path*',
]

// The production apex, as in src/lib/site.ts (kept literal here: this file is
// loaded before the app's own modules are). Auth cookies are host-only and the
// emailed links always use the apex, so a visitor on www. would sign in on one
// host and look signed out on the other unless www. is folded into the apex.
const PRODUCTION_HOST = 'reynoldsbuilt.dev'

const nextConfig: NextConfig = {
	// A second dev server (a local end-to-end run) builds into its own folder, so it
	// cannot overwrite the output of the one already running.
	distDir: process.env.NEXT_DIST_DIR || '.next',
	// Uploads live on Vercel Blob, whose subdomain is per store.
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
		],
	},
	async redirects() {
		return [
			{
				source: '/:path*',
				has: [{ type: 'host', value: `www.${PRODUCTION_HOST}` }],
				destination: `https://${PRODUCTION_HOST}/:path*`,
				permanent: true,
			},
		]
	},
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
