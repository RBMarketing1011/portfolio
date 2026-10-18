import type { Metadata } from 'next'
import Script from 'next/script'
import SiteFooter from '@/components/site-footer'
import { isProductionHost } from '@/lib/app-url'
import { getBlogNav } from '@/lib/blog/posts'
import SiteHeader from '@/components/site-header'
import { site } from '@/lib/site'
import { baseUrl, JsonLd, organizationSchema, websiteSchema } from '@/lib/seo'

export const metadata: Metadata = {
	title: {
		default: `${site.name} | AI, Automation & Custom Software Consultancy`,
		template: `%s | ${site.name}`,
	},
	description: site.description,
	applicationName: site.name,
	keywords: [
		'AI consulting',
		'business automation',
		'workflow automation',
		'custom software development',
		'AI integration',
		'systems integration',
		'internal tools',
	],
	authors: [{ name: site.name, url: baseUrl }],
	creator: site.name,
	publisher: site.name,
	alternates: { canonical: baseUrl },
	openGraph: {
		type: 'website',
		locale: 'en_US',
		url: baseUrl,
		siteName: site.name,
		title: `${site.name} | AI, Automation & Custom Software Consultancy`,
		description: site.description,
	},
	twitter: {
		card: 'summary_large_image',
		title: `${site.name} | AI, Automation & Custom Software`,
		description: site.description,
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			'max-image-preview': 'large',
			'max-snippet': -1,
			'max-video-preview': -1,
		},
	},
	category: 'technology',
}

const GA_ID = 'G-NV73ES0S0L'

/**
 * Google Analytics, on the public site only: this layout is not used by the
 * account, admin, builder or customer sites. Only the production deployment
 * reports, so local and staging traffic never lands in the numbers. Page
 * changes inside the app are picked up by GA4's history-based page views.
 */
function GoogleAnalytics() {
	if (!isProductionHost) return null
	return (
		<>
			<Script
				src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
				strategy='afterInteractive'
			/>
			<Script id='google-analytics' strategy='afterInteractive'>
				{`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
			</Script>
		</>
	)
}

// The header's blog menu lists the newest posts, so every public page is
// refreshed at least once a minute (and at once when the blog API writes).
export const revalidate = 60

/**
 * The public marketing site. The backend, the builder, the previews and any
 * customer's own hosted site all live outside this group, so none of them can
 * end up wearing ReynoldsBuilt's header or its organisation schema.
 */
export default async function SiteLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<>
			<GoogleAnalytics />
			<JsonLd schema={[organizationSchema, websiteSchema]} />
			<div aria-hidden className='site-backdrop' />
			<a
				href='#main'
				className='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-60 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:font-bold focus:text-ink'>
				Skip to main content
			</a>
			<SiteHeader blog={await getBlogNav()} />
			<main id='main'>{children}</main>
			<SiteFooter />
		</>
	)
}
