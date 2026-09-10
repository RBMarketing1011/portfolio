import type { Metadata } from 'next'
import { site } from '@/lib/site'
import { faqs, insights, projects, services } from '@/lib/site-content'

export const baseUrl = `https://${site.domain.toLowerCase()}`

/** Trailing slashes are stripped so canonicals, JSON-LD ids, and the sitemap agree. */
export function absoluteUrl(path = '/') {
	return new URL(path, baseUrl).toString().replace(/\/$/, '')
}

export function buildMetadata({
	title,
	description,
	path = '/',
	type = 'website',
	publishedTime,
	image,
}: {
	title: string
	description: string
	path?: string
	type?: 'website' | 'article'
	publishedTime?: string
	image?: string
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
			...(image ? { images: [{ url: absoluteUrl(image) }] } : {}),
			...(publishedTime ? { publishedTime } : {}),
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description,
			...(image ? { images: [absoluteUrl(image)] } : {}),
		},
	}
}

export const organizationSchema = {
	'@type': ['Organization', 'ProfessionalService'],
	'@id': `${baseUrl}/#organization`,
	name: site.name,
	legalName: site.name,
	url: baseUrl,
	description: site.description,
	slogan: site.tagline,
	logo: {
		'@type': 'ImageObject',
		'@id': `${baseUrl}/#logo`,
		url: absoluteUrl(site.logo),
		contentUrl: absoluteUrl(site.logo),
		caption: site.name,
	},
	image: { '@id': `${baseUrl}/#logo` },
	// No email here on purpose: the contact form is the only published route in.
	contactPoint: {
		'@type': 'ContactPoint',
		contactType: 'sales',
		url: absoluteUrl('/contact'),
		availableLanguage: ['English'],
		areaServed: 'US',
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
				url: absoluteUrl(`/services/${service.slug}`),
				provider: { '@id': `${baseUrl}/#organization` },
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

export function faqPageSchema(
	path: string,
	entries: { question: string; answer: string }[],
) {
	return {
		'@type': 'FAQPage',
		'@id': `${absoluteUrl(path)}#faq`,
		mainEntity: entries.map((faq) => ({
			'@type': 'Question',
			name: faq.question,
			acceptedAnswer: { '@type': 'Answer', text: faq.answer },
		})),
	}
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
	const last = trail.at(-1)?.path ?? '/'

	return {
		'@type': 'BreadcrumbList',
		'@id': `${absoluteUrl(last)}#breadcrumb`,
		itemListElement: trail.map((crumb, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: crumb.name,
			item: absoluteUrl(crumb.path),
		})),
	}
}

/** A named list of pages, used by the sitemap and the index pages. */
export function collectionSchema({
	path,
	name,
	description,
	items,
}: {
	path: string
	name: string
	description: string
	items: { name: string; path: string }[]
}) {
	const url = absoluteUrl(path)

	return {
		'@type': 'CollectionPage',
		'@id': `${url}#collection`,
		url,
		name,
		description,
		isPartOf: { '@id': `${baseUrl}/#website` },
		inLanguage: 'en-US',
		mainEntity: {
			'@type': 'ItemList',
			numberOfItems: items.length,
			itemListElement: items.map((item, index) => ({
				'@type': 'ListItem',
				position: index + 1,
				name: item.name,
				url: absoluteUrl(item.path),
			})),
		},
	}
}

/** A single page node for the pages that are not a collection or an article. */
export function pageSchema({
	path,
	name,
	description,
	type = 'WebPage',
}: {
	path: string
	name: string
	description: string
	type?: 'WebPage' | 'AboutPage' | 'ContactPage'
}) {
	const url = absoluteUrl(path)

	return {
		'@type': type,
		'@id': `${url}#webpage`,
		url,
		name,
		description,
		isPartOf: { '@id': `${baseUrl}/#website` },
		about: { '@id': `${baseUrl}/#organization` },
		inLanguage: 'en-US',
	}
}

/** Positions a service or industry page as a Service the organization provides. */
export function serviceSchema({
	path,
	name,
	description,
	serviceType,
}: {
	path: string
	name: string
	description: string
	serviceType?: string
}) {
	const url = absoluteUrl(path)

	return {
		'@type': 'Service',
		'@id': `${url}#service`,
		url,
		name,
		description,
		...(serviceType ? { serviceType } : {}),
		provider: { '@id': `${baseUrl}/#organization` },
		areaServed: { '@type': 'Country', name: 'United States' },
	}
}

export function articleSchema(insight: (typeof insights)[number]) {
	const url = absoluteUrl(`/blog/${insight.slug}`)

	return {
		'@type': 'BlogPosting',
		'@id': `${url}#article`,
		headline: insight.title,
		description: insight.excerpt,
		datePublished: insight.date,
		dateModified: insight.date,
		articleSection: insight.category,
		url,
		wordCount: insight.body.reduce(
			(total, block) =>
				total + block.paragraphs.join(' ').split(/\s+/).filter(Boolean).length,
			0,
		),
		inLanguage: 'en-US',
		isAccessibleForFree: true,
		author: { '@id': `${baseUrl}/#organization` },
		publisher: { '@id': `${baseUrl}/#organization` },
		isPartOf: { '@id': `${baseUrl}/#website` },
		mainEntityOfPage: url,
	}
}

export function caseStudySchema(project: (typeof projects)[number]) {
	const url = absoluteUrl(`/case-studies/${project.slug}`)

	return {
		'@type': 'Article',
		'@id': `${url}#case-study`,
		headline: `${project.name} case study`,
		description: project.summary,
		...(project.image ? { image: absoluteUrl(project.image) } : {}),
		url,
		inLanguage: 'en-US',
		author: { '@id': `${baseUrl}/#organization` },
		publisher: { '@id': `${baseUrl}/#organization` },
		isPartOf: { '@id': `${baseUrl}/#website` },
		mainEntityOfPage: url,
		about: project.capabilities.join(', '),
		keywords: [...project.capabilities, ...project.stack].join(', '),
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
