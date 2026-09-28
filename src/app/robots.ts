import type { MetadataRoute } from 'next'
import { baseUrl } from '@/lib/seo'

// The section library and both preview surfaces are internal tools. The builder is
// linked from the public header, so it stays crawlable.
const internal = ['/api/', '/section-preview/', '/page-preview/', '/preview/']

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
