import { JetBrains_Mono, Noto_Sans } from "next/font/google"

// Fonts from the redesign prototype, self-hosted by next/font with size-adjusted
// fallbacks so text doesn't shift when they load (next/font uses display: swap). Exposed as CSS variables for
// Tailwind's font-sans / font-mono. Both are variable fonts, so leaving out
// `weight` serves one file per subset. Mono isn't preloaded: little uses it.
const sans = Noto_Sans({ subsets: ["latin"], variable: "--font-sans" })
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", preload: false })

/** The font variables, for each <html> the app renders (a language's pages and the root 404). */
export const fontVariables = `${sans.variable} ${mono.variable}`
