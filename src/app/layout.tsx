import "./globals.css"
import { ContextProviders } from "@/components/providers/ContextProviders"
import siteMetadata from "./metadata.json"
import { Footer } from "@/components/Footer"
import { Analytics } from "@vercel/analytics/next"

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
          <Footer />
          <Analytics />
        </ContextProviders>
      </body>
    </html>
  )
}
