import { absoluteUrl } from '@/lib/seo'
import { site } from '@/lib/site'
import { sitemapSections } from '@/lib/sitemap'

// Browsers render /sitemap.xml through this stylesheet; crawlers ignore the
// xml-stylesheet instruction and read the raw XML. One URL, both audiences.
export const dynamic = 'force-static'

const xml = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')

const cell = (loc: string, field: string) =>
	`/s:urlset/s:url[s:loc='${loc}']/s:${field}`

const rows = (links: (typeof sitemapSections)[number]['links']) =>
	links
		.map((link) => {
			const loc = absoluteUrl(link.path)
			// Most pages have no honest lastmod, so the XML omits it entirely.
			const date = link.lastModified
				? `<xsl:value-of select="substring(${cell(loc, 'lastmod')},1,10)"/>`
				: '<span class="none">&#8212;</span>'

			return `						<tr>
							<td>
								<a href="${xml(loc)}">${xml(link.title)}</a>
								<span class="desc">${xml(link.description)}</span>
								<span class="loc">${xml(loc)}</span>
							</td>
							<td class="num"><xsl:value-of select="${cell(loc, 'priority')}"/></td>
							<td class="freq"><xsl:value-of select="${cell(loc, 'changefreq')}"/></td>
							<td class="date">${date}</td>
						</tr>`
		})
		.join('\n')

const dated = sitemapSections
	.flatMap((section) => section.links)
	.map((link) => link.lastModified)
	.filter((value): value is string => Boolean(value))
	.sort()

const newest = dated.at(-1)?.slice(0, 10) ?? '\u2014'

const groups = sitemapSections
	.map(
		(section) => `				<section class="group" id="${section.id}">
					<h2>${xml(section.title)}</h2>
					<p class="group-lede">${xml(section.description)}</p>
					<table>
						<thead>
							<tr>
								<th>Page</th>
								<th class="num">Priority</th>
								<th>Changes</th>
								<th>Modified</th>
							</tr>
						</thead>
						<tbody>
${rows(section.links)}
						</tbody>
					</table>
				</section>`,
	)
	.join('\n')

const chips = sitemapSections
	.map(
		(section) =>
			`					<a href="#${section.id}">${xml(section.title)} <span>${section.links.length}</span></a>`,
	)
	.join('\n')

const styles = `
			:root {
				--ink: #03080f;
				--brand: #0197f6;
				--brand-strong: #3fb2fa;
				--text: #e8f1fb;
				--muted: #9cb0c6;
				--dim: #64788f;
				--line: rgba(255, 255, 255, 0.1);
			}
			* { box-sizing: border-box; }
			html { background-color: var(--ink); }
			body {
				margin: 0;
				color: var(--text);
				font-family: "DM Sans", system-ui, sans-serif;
				line-height: 1.6;
				-webkit-font-smoothing: antialiased;
			}
			/* Pinned to the viewport so the page scrolls over a fixed backdrop. */
			.backdrop {
				position: fixed;
				inset: 0;
				z-index: -10;
				pointer-events: none;
				background-color: var(--ink);
				background-image:
					repeating-linear-gradient(45deg, rgba(1,151,246,0.07) 0 1px, transparent 1px 22px),
					repeating-linear-gradient(-45deg, rgba(1,151,246,0.07) 0 1px, transparent 1px 22px),
					linear-gradient(135deg, rgba(63,178,250,0.28) 0%, rgba(1,151,246,0.14) 28%, rgba(4,22,40,0.6) 62%, rgba(3,8,15,0.95) 100%);
			}
			.wrap { max-width: 1120px; margin: 0 auto; padding: 0 28px; }
			.head { padding: 84px 0 40px; }
			.eyebrow {
				margin: 0;
				color: var(--brand);
				font-size: 12px;
				font-weight: 700;
				letter-spacing: 0.14em;
				text-transform: uppercase;
			}
			h1 {
				margin: 18px 0 0;
				font-family: "Space Grotesk", system-ui, sans-serif;
				font-size: 46px;
				font-weight: 600;
				line-height: 1.08;
				color: #fff;
			}
			.lede { margin: 18px 0 0; max-width: 62ch; color: var(--muted); font-size: 18px; }
			.stats {
				display: flex;
				flex-wrap: wrap;
				gap: 44px;
				margin: 36px 0 0;
				padding: 26px 0 0;
				border-top: 1px solid var(--line);
			}
			.stats div { margin: 0; }
			.stats dt {
				color: var(--dim);
				font-size: 11px;
				font-weight: 600;
				letter-spacing: 0.12em;
				text-transform: uppercase;
			}
			.stats dd {
				margin: 6px 0 0;
				font-family: "Space Grotesk", system-ui, sans-serif;
				font-size: 30px;
				font-weight: 600;
				color: #fff;
			}
			.jump { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 48px; }
			.jump a {
				display: inline-flex;
				align-items: center;
				gap: 8px;
				border: 1px solid rgba(255, 255, 255, 0.15);
				border-radius: 999px;
				padding: 8px 16px;
				color: var(--muted);
				font-size: 14px;
				font-weight: 500;
				text-decoration: none;
			}
			.jump a span { color: var(--dim); font-size: 12px; }
			.jump a:hover { border-color: rgba(1, 151, 246, 0.5); color: #fff; }
			.group { margin-bottom: 60px; scroll-margin-top: 24px; }
			.group h2 {
				margin: 0;
				font-family: "Space Grotesk", system-ui, sans-serif;
				font-size: 27px;
				font-weight: 600;
				color: #fff;
			}
			.group-lede { margin: 8px 0 0; color: var(--muted); }
			table { width: 100%; border-collapse: collapse; margin-top: 22px; }
			thead th {
				padding: 0 18px 12px 0;
				border-bottom: 1px solid var(--line);
				color: var(--dim);
				font-size: 11px;
				font-weight: 600;
				letter-spacing: 0.12em;
				text-transform: uppercase;
				text-align: left;
			}
			tbody td {
				padding: 20px 18px 20px 0;
				border-bottom: 1px solid rgba(255, 255, 255, 0.06);
				vertical-align: top;
			}
			tbody tr:hover { background: rgba(255, 255, 255, 0.02); }
			td a {
				font-family: "Space Grotesk", system-ui, sans-serif;
				font-size: 17px;
				font-weight: 600;
				color: #fff;
				text-decoration: none;
			}
			td a:hover { color: var(--brand-strong); }
			.desc { display: block; margin-top: 5px; max-width: 62ch; color: var(--muted); font-size: 14px; }
			.loc {
				display: block;
				margin-top: 9px;
				color: var(--dim);
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				font-size: 12px;
				word-break: break-all;
			}
			th.num, td.num {
				text-align: right;
				color: var(--brand);
				font-weight: 600;
				font-variant-numeric: tabular-nums;
				white-space: nowrap;
			}
			td.freq { color: var(--muted); text-transform: capitalize; white-space: nowrap; }
			td.date { color: var(--dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
			.none { color: #3d4d60; }
			.foot {
				margin-top: 20px;
				padding: 30px 0 90px;
				border-top: 1px solid var(--line);
				color: var(--dim);
				font-size: 14px;
			}
			.foot a { color: var(--brand); text-decoration: none; }
			.foot a:hover { text-decoration: underline; }
			@media (max-width: 760px) {
				h1 { font-size: 34px; }
				.head { padding-top: 56px; }
				.stats { gap: 28px; }
				thead { display: none; }
				tbody tr { display: block; padding: 20px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
				tbody td { display: block; padding: 0; border: none; }
				td.num, td.freq, td.date { display: inline-block; margin: 12px 14px 0 0; font-size: 13px; text-align: left; }
			}
`

const stylesheet = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
	xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
	xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
	exclude-result-prefixes="s">
	<xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>

	<xsl:template match="/">
		<html lang="en">
			<head>
				<meta charset="UTF-8"/>
				<meta name="viewport" content="width=device-width, initial-scale=1"/>
				<meta name="robots" content="noindex, follow"/>
				<title>Sitemap | ${xml(site.name)}</title>
				<link rel="preconnect" href="https://fonts.googleapis.com"/>
				<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous"/>
				<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap"/>
				<style>${styles}				</style>
			</head>
			<body>
				<div class="backdrop"></div>

				<header class="head">
					<div class="wrap">
						<p class="eyebrow">XML Sitemap</p>
						<h1>${xml(site.domain)}</h1>
						<p class="lede">Every page search engines are invited to index. This file is the sitemap itself, submitted to Google and Bing; the layout is here so it reads as well to a person as it does to a crawler.</p>
						<dl class="stats">
							<div>
								<dt>Pages</dt>
								<dd><xsl:value-of select="count(/s:urlset/s:url)"/></dd>
							</div>
							<div>
								<dt>Sections</dt>
								<dd>${sitemapSections.length}</dd>
							</div>
							<div>
								<dt>Latest post</dt>
								<dd>${newest}</dd>
							</div>
						</dl>
					</div>
				</header>

				<main class="wrap">
					<nav class="jump">
${chips}
					</nav>

${groups}
				</main>

				<div class="wrap">
					<div class="foot">
						<p>
							<a href="${xml(absoluteUrl('/'))}">Back to ${xml(site.domain)}</a>
							 · <a href="${xml(absoluteUrl('/robots.txt'))}">robots.txt</a>
							 · <a href="${xml(absoluteUrl('/llms.txt'))}">llms.txt</a>
						</p>
						<p>Raw XML is what crawlers receive. View source to see it.</p>
					</div>
				</div>
			</body>
		</html>
	</xsl:template>
</xsl:stylesheet>
`

export function GET() {
	return new Response(stylesheet, {
		headers: {
			'Content-Type': 'text/xsl; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	})
}
