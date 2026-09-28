import type { MetadataRoute } from 'next'
import { baseUrl } from '@/lib/seo'

// The section library, the builder, and both preview surfaces are internal tools.
const internal = [
	'/api/',
	'/builder/',
	'/section-preview/',
	'/page-preview/',
	'/preview/',
]

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{ userAgent: '*', allow: '/', disallow: internal },
			{ userAgent: 'GPTBot', allow: '/', disallow: internal },
			{ userAgent: 'ClaudeBot', allow: '/', disallow: internal },
			{ userAgent: 'PerplexityBot', allow: '/', disallow: internal },
			{ userAgent: 'Google-Extended', allow: '/', disallow: internal },
		],
		sitemap: `${baseUrl}/sitemap.xml`,
		host: baseUrl,
	}
}
