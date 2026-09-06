import type { Metadata } from 'next'
import { DM_Sans, Space_Grotesk } from 'next/font/google'
import '@/styles/globals.css'
import { AppShell } from '@/components/app-shell'
import SiteFooter from '@/components/site-footer'
import SiteHeader from '@/components/site-header'
import { site } from '@/lib/site'
import { baseUrl, JsonLd, organizationSchema, websiteSchema } from '@/lib/seo'

const bodyFont = DM_Sans({
	subsets: ['latin'],
	variable: '--font-dm-sans',
})

const displayFont = Space_Grotesk({
	subsets: ['latin'],
	variable: '--font-space-grotesk',
})

export const metadata: Metadata = {
	metadataBase: new URL(baseUrl),
	title: {
		default: `${site.name} | AI, Automation & Custom Software Consultancy`,
		template: `%s | ${site.name}`,
	},
	description: site.description,
	applicationName: site.name,
	keywords: [
		'AI consultant',
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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang='en' className='overflow-x-hidden'>
			<body
				className={`${bodyFont.variable} ${displayFont.variable} antialiased`}>
				<JsonLd schema={[organizationSchema, websiteSchema]} />
				<AppShell header={<SiteHeader />} footer={<SiteFooter />}>
					{children}
				</AppShell>
			</body>
		</html>
	)
}
