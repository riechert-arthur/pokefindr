import type { ReactNode } from "react"
import { getSiteUrl } from "@/server/site-url"

// Absolute base for og:image, twitter:image and other metadata URLs, on every
// page including the 404s.
export const metadata = { metadataBase: getSiteUrl() }

/**
 * Pages are under [locale]/, whose layout renders <html> in the page's language.
 * This one is only here because Next needs a root layout for not-found.tsx.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children
}
