import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "@/styles/globals.css"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import prismaDB from '@/db/prismaDB'
import { ThemeProvider } from '@/components/theme-provider'

const geistSans = Geist({
  subsets: [ "latin" ],
})
export const metadata: Metadata = {
  title: "Anthony Reynolds Portfolio",
  description:
    "Anthony Reynolds Portfolio - A showcase of my work and skills.",
}

export default async function RootLayout ({
  children,
}: Readonly<{
  children: React.ReactNode
}>)
{
  const profile = await prismaDB.profile.findFirst({
    where: {
      email: 'rbmarketingandanalytics@gmail.com'
    }
  })

  return (
    profile &&
    <html lang="en" className='overflow-x-hidden' suppressHydrationWarning>
      <body className={ `${ geistSans.className } antialiased` }>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Navbar
            profile={ profile }
          />
          <main>{ children }</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  )
}
