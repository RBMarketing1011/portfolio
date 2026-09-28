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

const nextConfig: NextConfig = {
	// Uploads live on Vercel Blob, whose subdomain is per store.
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
		],
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
