import "./globals.css"
import { ContextProviders } from "@/components/providers/ContextProviders"
import siteMetadata from "./metadata.json"
import { Footer } from "@/components/Footer"
import { Analytics } from "@vercel/analytics/next"
import AffiliateBannerWrapper from "@/components/AffiliateBannerWrapper"

export const metadata = siteMetadata

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ContextProviders>
          <main>{children}</main>
          <AffiliateBannerWrapper />
          <Footer />
          <Analytics />
        </ContextProviders>
      </body>
    </html>
  )
}
