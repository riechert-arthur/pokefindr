import "../globals.css"
import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import type { Metadata } from "next"
import { PUBLIC_LOCALES, routing } from "@/i18n/routing"
import { fontVariables } from "@/app/fonts"
import { ContextProviders } from "@/components/providers/ContextProviders"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { Analytics } from "@/components/Analytics"
import { Toaster } from "@/components/ui/sonner"
import { getSiteUrl, PRODUCTION_URL } from "@/server/site-url"

const site = getSiteUrl() ?? new URL(PRODUCTION_URL)

const metadata = {
  "viewport": "width=device-width, initial-scale=1",
  "charset": "UTF-8",
  "other": {
    "google-adsense-account": "ca-pub-5624613492216779",
    "impact-site-verification": "34eb1c2e-8a9b-4082-9f19-211558caebd7",
    "terms-of-service": new URL("/terms-of-service", site).toString(),
    "privacy-policy": new URL("/privacy-policy", site).toString(),
  }
}

/** A language that isn't public yet (docs/i18n.md) isn't indexed. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const isPublic = (PUBLIC_LOCALES as readonly string[]).includes(locale)
  return { ...metadata, robots: { index: isPublic, follow: isPublic } }
}

/** Each language's pages are built ahead of time, like the single set before. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  return (
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
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
