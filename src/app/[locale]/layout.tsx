import "../globals.css"
import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import type { Metadata } from "next"
import { PUBLIC_LOCALES, routing } from "@/i18n/routing"
import { JetBrains_Mono, Noto_Sans } from "next/font/google"
import { ContextProviders } from "@/components/providers/ContextProviders"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { Analytics } from "@/components/Analytics"
import { Toaster } from "@/components/ui/sonner"

const metadata = {
  "viewport": "width=device-width, initial-scale=1",
  "charset": "UTF-8",
  "other": {
    "google-adsense-account": "ca-pub-5624613492216779",
    "impact-site-verification": "34eb1c2e-8a9b-4082-9f19-211558caebd7",
    "terms-of-service": "http://localhost:3000/terms-of-service",
    "privacy-policy": "http://localhost:3000/privacy-policy"
  }
}

/** A language that isn't public yet (docs/i18n.md) isn't indexed. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPublic = (PUBLIC_LOCALES as readonly string[]).includes(locale)
  return { ...metadata, robots: { index: isPublic, follow: isPublic } }
}

// Fonts from the redesign prototype, self-hosted by next/font with size-adjusted
// fallbacks so text doesn't shift when they load (next/font uses display: swap). Exposed as CSS variables for
// Tailwind's font-sans / font-mono. Both are variable fonts, so leaving out
// `weight` serves one file per subset. Mono isn't preloaded: little uses it.
const sans = Noto_Sans({ subsets: ["latin"], variable: "--font-sans" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", preload: false })

/** Each language's pages are built ahead of time, like the single set before. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        {/* Passes this language and its messages to Client Components. */}
        <NextIntlClientProvider>
          <ThemeProvider>
            <ContextProviders>
              <main>{children}</main>
              <Toaster />
              <Analytics />
            </ContextProviders>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
