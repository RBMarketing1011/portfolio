import type { Metadata } from "next"
import { DM_Sans, Space_Grotesk } from "next/font/google"
import "@/styles/globals.css"
import SiteFooter from "@/components/site-footer"
import SiteHeader from "@/components/site-header"

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
})

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})
export const metadata: Metadata = {
  title: "ReynoldsBuild.dev | Software That Moves Your Business Forward",
  description: "Custom software, portals, and practical AI automation for growing businesses.",
}

export default function RootLayout ({
  children,
}: Readonly<{
  children: React.ReactNode
}>)
{
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className={ `${bodyFont.variable} ${displayFont.variable} antialiased` }>
        <SiteHeader />
        <main>{ children }</main>
        <SiteFooter />
      </body>
    </html>
  )
}
