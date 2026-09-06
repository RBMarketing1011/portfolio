import type { Metadata } from 'next'
import { site } from '@/lib/site'
import { faqs, insights, projects, services } from '@/lib/site-content'

export const baseUrl = `https://${site.domain.toLowerCase()}`

export function absoluteUrl(path = '/') {
	return new URL(path, baseUrl).toString()
}

export function buildMetadata({
	title,
	description,
	path = '/',
	type = 'website',
	publishedTime,
}: {
	title: string
	description: string
	path?: string
	type?: 'website' | 'article'
	publishedTime?: string
}): Metadata {
	const url = absoluteUrl(path)

	return {
		title,
		description,
		alternates: { canonical: url },
		openGraph: {
			title,
			description,
			url,
			siteName: site.name,
			type,
			locale: 'en_US',
			...(publishedTime ? { publishedTime } : {}),
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description,
		},
	}
}

export const organizationSchema = {
	'@type': 'ProfessionalService',
	'@id': `${baseUrl}/#organization`,
	name: site.name,
	url: baseUrl,
	email: site.email,
	description: site.description,
	slogan: site.tagline,
	logo: {
		'@type': 'ImageObject',
		url: absoluteUrl(site.logo),
	},
	areaServed: { '@type': 'Country', name: 'United States' },
	knowsAbout: [
		'Artificial intelligence consulting',
		'Business process automation',
		'Workflow automation',
		'Custom software development',
		'Systems integration',
	],
	hasOfferCatalog: {
		'@type': 'OfferCatalog',
		name: 'Consulting and engineering services',
		itemListElement: services.map((service) => ({
			'@type': 'Offer',
			itemOffered: {
				'@type': 'Service',
				name: service.name,
				description: service.summary,
				url: absoluteUrl(`/services#${service.slug}`),
			},
		})),
	},
}

export const websiteSchema = {
	'@type': 'WebSite',
	'@id': `${baseUrl}/#website`,
	url: baseUrl,
	name: site.name,
	description: site.description,
	publisher: { '@id': `${baseUrl}/#organization` },
	inLanguage: 'en-US',
}

export const faqSchema = {
	'@type': 'FAQPage',
	'@id': `${baseUrl}/#faq`,
	mainEntity: faqs.map((faq) => ({
		'@type': 'Question',
		name: faq.question,
		acceptedAnswer: { '@type': 'Answer', text: faq.answer },
	})),
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
	return {
		'@type': 'BreadcrumbList',
		itemListElement: trail.map((crumb, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: crumb.name,
			item: absoluteUrl(crumb.path),
		})),
	}
}

export function articleSchema(insight: (typeof insights)[number]) {
	return {
		'@type': 'BlogPosting',
		'@id': absoluteUrl(`/insights/${insight.slug}#article`),
		headline: insight.title,
		description: insight.excerpt,
		datePublished: insight.date,
		dateModified: insight.date,
		articleSection: insight.category,
		url: absoluteUrl(`/insights/${insight.slug}`),
		author: { '@id': `${baseUrl}/#organization` },
		publisher: { '@id': `${baseUrl}/#organization` },
		mainEntityOfPage: absoluteUrl(`/insights/${insight.slug}`),
	}
}

export function caseStudySchema(project: (typeof projects)[number]) {
	return {
		'@type': 'Article',
		'@id': absoluteUrl(`/work/${project.slug}#case-study`),
		headline: `${project.name} case study`,
		description: project.summary,
		image: absoluteUrl(project.image),
		url: absoluteUrl(`/work/${project.slug}`),
		author: { '@id': `${baseUrl}/#organization` },
		publisher: { '@id': `${baseUrl}/#organization` },
		about: project.capabilities.join(', '),
	}
}

export function JsonLd({ schema }: { schema: object | object[] }) {
	const graph = Array.isArray(schema) ? schema : [schema]

	return (
		<script
			type='application/ld+json'
			dangerouslySetInnerHTML={{
				__html: JSON.stringify({
					'@context': 'https://schema.org',
					'@graph': graph,
				}).replace(/</g, '\\u003c'),
			}}
		/>
	)
}
