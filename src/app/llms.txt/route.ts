import { baseUrl } from '@/lib/seo'
import { site } from '@/lib/site'
import { faqs, insights, projects, services } from '@/lib/site-content'

export const dynamic = 'force-static'

export function GET() {
	const body = `# ${site.name}

> ${site.description}

${site.name} (${site.domain}) is an AI, automation, and custom software consultancy for small and mid-sized businesses. We audit an entire operation end to end, produce a ranked roadmap of what should be automated, augmented with AI, or rebuilt, and then build it.

## Services

${services
	.map(
		(service) =>
			`- [${service.name}](${baseUrl}/services/${service.slug}): ${service.summary}`,
	)
	.join('\n')}

## Case studies

${projects
	.map(
		(project) =>
			`- [${project.name}](${baseUrl}/case-studies/${project.slug}): ${project.summary}`,
	)
	.join('\n')}

## Insights

${insights
	.map(
		(insight) =>
			`- [${insight.title}](${baseUrl}/blog/${insight.slug}): ${insight.excerpt}`,
	)
	.join('\n')}

## Key pages

- [Services](${baseUrl}/services): What we do and what each engagement delivers.
- [Solutions](${baseUrl}/solutions): The named problems we solve and how we build for each.
- [Industries](${baseUrl}/industries): How the work changes by the kind of business you run.
- [Process](${baseUrl}/process): How an engagement runs, from assessment to ongoing support.
- [Portfolio](${baseUrl}/portfolio): Screens from the software we have shipped.
- [Case studies](${baseUrl}/case-studies): Case studies of shipped software.
- [Blog](${baseUrl}/blog): Writing on applied AI, automation, and build strategy.
- [About](${baseUrl}/about): Who we are and how we operate.
- [Contact](${baseUrl}/contact): Book an assessment.
- [Sitemap](${baseUrl}/sitemap.xml): Every page on the site, grouped and described.

## FAQ

${faqs.map((faq) => `### ${faq.question}\n${faq.answer}`).join('\n\n')}

## Contact

- Contact form: ${baseUrl}/contact
- Website: ${baseUrl}
`

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	})
}
