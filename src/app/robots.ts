import type { MetadataRoute } from 'next'
import { baseUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{ userAgent: '*', allow: '/', disallow: ['/api/'] },
			{ userAgent: 'GPTBot', allow: '/' },
			{ userAgent: 'ClaudeBot', allow: '/' },
			{ userAgent: 'PerplexityBot', allow: '/' },
			{ userAgent: 'Google-Extended', allow: '/' },
		],
		sitemap: `${baseUrl}/sitemap.xml`,
		host: baseUrl,
	}
}
