import type { MetadataRoute } from 'next'
import { baseUrl } from '@/lib/seo'
import { insights, industries, projects, solutions } from '@/lib/site-content'

export default function sitemap(): MetadataRoute.Sitemap {
	const now = new Date()

	const staticRoutes: MetadataRoute.Sitemap = [
		{ url: baseUrl, lastModified: now, changeFrequency: 'weekly', priority: 1 },
		{
			url: `${baseUrl}/services`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.9,
		},
		{
			url: `${baseUrl}/solutions`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.9,
		},
		{
			url: `${baseUrl}/industries`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.8,
		},
		{
			url: `${baseUrl}/process`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.8,
		},
		{
			url: `${baseUrl}/portfolio`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.8,
		},
		{
			url: `${baseUrl}/case-studies`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.8,
		},
		{
			url: `${baseUrl}/blog`,
			lastModified: now,
			changeFrequency: 'weekly',
			priority: 0.7,
		},
		{
			url: `${baseUrl}/about`,
			lastModified: now,
			changeFrequency: 'monthly',
			priority: 0.6,
		},
		{
			url: `${baseUrl}/contact`,
			lastModified: now,
			changeFrequency: 'yearly',
			priority: 0.9,
		},
	]

	const industryRoutes: MetadataRoute.Sitemap = industries.map((industry) => ({
		url: `${baseUrl}/industries/${industry.slug}`,
		lastModified: now,
		changeFrequency: 'monthly',
		priority: 0.7,
	}))

	const solutionRoutes: MetadataRoute.Sitemap = solutions.map((solution) => ({
		url: `${baseUrl}/solutions/${solution.slug}`,
		lastModified: now,
		changeFrequency: 'monthly',
		priority: 0.7,
	}))

	const workRoutes: MetadataRoute.Sitemap = projects.map((project) => ({
		url: `${baseUrl}/case-studies/${project.slug}`,
		lastModified: now,
		changeFrequency: 'monthly',
		priority: 0.7,
	}))

	const insightRoutes: MetadataRoute.Sitemap = insights.map((insight) => ({
		url: `${baseUrl}/blog/${insight.slug}`,
		lastModified: new Date(insight.date),
		changeFrequency: 'yearly',
		priority: 0.6,
	}))

	return [
		...staticRoutes,
		...industryRoutes,
		...solutionRoutes,
		...workRoutes,
		...insightRoutes,
	]
}
