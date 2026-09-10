import { absoluteUrl } from '@/lib/seo'
import { sitemapLinks } from '@/lib/sitemap'

// A route handler rather than Next's sitemap.ts convention, so the xml-stylesheet
// instruction can be emitted. Browsers render it through /sitemap.xsl; crawlers
// ignore the instruction and read this exact XML.
export const dynamic = 'force-static'

const escape = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function GET() {
	const urls = sitemapLinks
		.map((link) => {
			// lastmod is omitted unless the date is real. Stamping every URL with the
			// build time makes Google distrust and drop lastmod for the whole site.
			const lastmod = link.lastModified
				? [
						`\t\t<lastmod>${new Date(link.lastModified).toISOString().slice(0, 10)}</lastmod>`,
					]
				: []

			return [
				'\t<url>',
				`\t\t<loc>${escape(absoluteUrl(link.path))}</loc>`,
				...lastmod,
				`\t\t<changefreq>${link.changeFrequency}</changefreq>`,
				`\t\t<priority>${link.priority.toFixed(1)}</priority>`,
				'\t</url>',
			].join('\n')
		})
		.join('\n')

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	})
}
