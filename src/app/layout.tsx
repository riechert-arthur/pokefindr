import "./globals.css"
import { JetBrains_Mono, Noto_Sans } from "next/font/google"
import { ContextProviders } from "@/components/providers/ContextProviders"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
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

// Fonts from the redesign prototype, self-hosted by next/font with size-adjusted
// fallbacks so text doesn't shift when they load (next/font uses display: swap). Exposed as CSS variables for
// Tailwind's font-sans / font-mono. Both are variable fonts, so leaving out
// `weight` serves one file per subset. Mono isn't preloaded: little uses it.
const sans = Noto_Sans({ subsets: ["latin"], variable: "--font-sans" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", preload: false })

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <ContextProviders>
            <main>{children}</main>
            <Toaster />
            <AffiliateBannerWrapper />
            <Analytics />
          </ContextProviders>
        </ThemeProvider>
      </body>
    </html>
  )
}
