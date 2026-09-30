import type { Metadata } from 'next'
import { DM_Sans, Space_Grotesk } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import '@/styles/globals.css'
import { baseUrl } from '@/lib/seo'

const bodyFont = DM_Sans({
	subsets: ['latin'],
	variable: '--font-dm-sans',
})

const displayFont = Space_Grotesk({
	subsets: ['latin'],
	variable: '--font-space-grotesk',
})

// Deliberately unbranded. Customer sites render under this layout too, and a
// title template here would stamp our name onto every one of their pages.
export const metadata: Metadata = {
	metadataBase: new URL(baseUrl),
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
				<SessionProvider>{children}</SessionProvider>
			</body>
		</html>
	)
}
