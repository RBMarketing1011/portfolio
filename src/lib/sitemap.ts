import {
	Building2,
	Compass,
	FileText,
	FolderGit2,
	Layers,
	Wrench,
	type LucideIcon,
} from 'lucide-react'
import {
	industries,
	insightTopics,
	insights,
	projects,
	services,
	solutions,
} from '@/lib/site-content'

export type SitemapLink = {
	path: string
	title: string
	description: string
	changeFrequency: 'weekly' | 'monthly' | 'yearly'
	priority: number
	/** ISO date. Omitted when the page has no meaningful publish date of its own. */
	lastModified?: string
}

export type SitemapSection = {
	id: string
	title: string
	description: string
	icon: LucideIcon
	links: SitemapLink[]
}

/**
 * The single source of truth for /sitemap.xml, its /sitemap.xsl presentation
 * layer, and llms.txt. Adding a route here publishes it everywhere at once.
 */
export const sitemapSections: SitemapSection[] = [
	{
		id: 'main',
		title: 'Main Pages',
		description: 'The core of the site: who we are and how to reach us.',
		icon: Compass,
		links: [
			{
				path: '/',
				title: 'Home',
				description:
					'AI, automation, and custom software for the way your business actually runs.',
				changeFrequency: 'weekly',
				priority: 1,
			},
			{
				path: '/about',
				title: 'About Us',
				description:
					'A consultancy that audits an entire operation before building anything.',
				changeFrequency: 'monthly',
				priority: 0.6,
			},
			{
				path: '/process',
				title: 'Our Process',
				description:
					'Assessment, ranked blueprint, incremental build, and support that keeps it working.',
				changeFrequency: 'monthly',
				priority: 0.8,
			},
			{
				path: '/contact',
				title: 'Contact',
				description: 'Book an AI and automation assessment for your operation.',
				changeFrequency: 'yearly',
				priority: 0.9,
			},
		],
	},
	{
		id: 'services',
		title: 'Services',
		description: 'The engagements we run and what each one delivers.',
		icon: Wrench,
		links: [
			{
				path: '/services',
				title: 'Services',
				description:
					'Assessments, workflow automation, applied AI systems, and custom software.',
				changeFrequency: 'monthly',
				priority: 0.9,
			},
			...services.map(
				(service): SitemapLink => ({
					path: `/services/${service.slug}`,
					title: service.name,
					description: service.summary,
					changeFrequency: 'monthly',
					priority: 0.8,
				}),
			),
		],
	},
	{
		id: 'solutions',
		title: 'Solutions',
		description: 'Named problems we solve, each with its own build pattern.',
		icon: Layers,
		links: [
			{
				path: '/solutions',
				title: 'All Solutions',
				description:
					'Document automation, intake and scheduling, portals, dashboards, and integration.',
				changeFrequency: 'monthly',
				priority: 0.9,
			},
			...solutions.map(
				(solution): SitemapLink => ({
					path: `/solutions/${solution.slug}`,
					title: solution.name,
					description: solution.blurb,
					changeFrequency: 'monthly',
					priority: 0.7,
				}),
			),
		],
	},
	{
		id: 'industries',
		title: 'Industries',
		description: 'How the work changes depending on the business you run.',
		icon: Building2,
		links: [
			{
				path: '/industries',
				title: 'All Industries',
				description:
					'Home services, auto repair, logistics, agencies, professional services, and retail.',
				changeFrequency: 'monthly',
				priority: 0.8,
			},
			...industries.map(
				(industry): SitemapLink => ({
					path: `/industries/${industry.slug}`,
					title: industry.name,
					description: industry.blurb,
					changeFrequency: 'monthly',
					priority: 0.7,
				}),
			),
		],
	},
	{
		id: 'work',
		title: 'Work',
		description: 'Software we have shipped, and the story behind each build.',
		icon: FolderGit2,
		links: [
			{
				path: '/portfolio',
				title: 'Portfolio',
				description:
					'SaaS platforms, scheduling products, client portals, and reporting systems.',
				changeFrequency: 'monthly',
				priority: 0.8,
			},
			{
				path: '/case-studies',
				title: 'All Case Studies',
				description:
					'The problem, the approach, what shipped, and the systems behind them.',
				changeFrequency: 'monthly',
				priority: 0.8,
			},
			...projects.map(
				(project): SitemapLink => ({
					path: `/case-studies/${project.slug}`,
					title: project.name,
					description: project.summary,
					changeFrequency: 'monthly',
					priority: 0.7,
				}),
			),
		],
	},
	{
		id: 'blog',
		title: 'Blog',
		description: 'Writing on applied AI, automation, and build strategy.',
		icon: FileText,
		links: [
			{
				path: '/blog',
				title: 'All Articles',
				description:
					'Practical writing on applied AI, business automation, and build strategy.',
				changeFrequency: 'weekly',
				priority: 0.7,
			},
			{
				path: '/blog/topics',
				title: 'All Topics',
				description:
					'Every subject we write about, each collecting the articles filed under it.',
				changeFrequency: 'monthly',
				priority: 0.6,
			},
			...insightTopics.map(
				(topic): SitemapLink => ({
					path: `/blog/topics/${topic.slug}`,
					title: `${topic.category} articles`,
					description: `Everything we have written under ${topic.category}.`,
					changeFrequency: 'monthly',
					priority: 0.5,
				}),
			),
			...insights.map(
				(insight): SitemapLink => ({
					path: `/blog/${insight.slug}`,
					title: insight.title,
					description: insight.excerpt,
					changeFrequency: 'yearly',
					priority: 0.6,
					lastModified: insight.date,
				}),
			),
		],
	},
]

export const sitemapLinks: SitemapLink[] = sitemapSections.flatMap(
	(section) => section.links,
)
