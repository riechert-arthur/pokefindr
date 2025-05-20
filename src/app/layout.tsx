import "./globals.css"
import { ContextProviders } from "@/components/providers/ContextProviders"
import { Analytics } from "@vercel/analytics/next"
import AffiliateBannerWrapper from "@/components/wrappers/AffiliateBannerWrapper"
import { Toaster } from "sonner"

export const metadata = {
  "robots": {
    "index": true,
    "follow": true
  },
  "viewport": "width=device-width, initial-scale=1",
  "charset": "UTF-8",
  "other": {
    "google-adsense-account": "ca-pub-5624613492216779",
    "impact-site-verification": "34eb1c2e-8a9b-4082-9f19-211558caebd7",
    "terms-of-service": "http://localhost:3000/terms-of-service",
    "privacy-policy": "http://localhost:3000/privacy-policy"
  }
}

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
          <Toaster />
          <AffiliateBannerWrapper />
          <Analytics />
        </ContextProviders>
      </body>
    </html>
  )
}
