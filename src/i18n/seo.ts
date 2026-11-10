import type { Metadata } from "next"
import { createTranslator } from "next-intl"
import { loadMessages, type Messages } from "./messages"
import { getPathname } from "./navigation"
import { DEFAULT_LOCALE, PUBLIC_LOCALES, type Locale } from "./routing"

/** og:locale for each language. The site is for the US, so Spanish is es_US. */
const OG_LOCALE: Record<Locale, string> = { en: "en_US", es: "es_US" }

export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 }

/** A page's path in a language: "/map", "/es/map". */
export const localizedPath = (path: string, locale: Locale) => getPathname({ href: path, locale })

const ogTranslators = new Map<Locale, Promise<OgTranslator>>()
type OgTranslator = ReturnType<typeof createTranslator<Messages, "og">>

/**
 * The "og" messages in a language, made once per server: every page's
 * metadata and the social card read them. (Route handlers and metadata can't
 * use getTranslations, so this reads the catalog.)
 */
export function ogTranslator(locale: Locale): Promise<OgTranslator> {
  let t = ogTranslators.get(locale)
  if (!t) ogTranslators.set(locale, (t = loadMessages(locale).then((messages) => createTranslator({ locale, messages, namespace: "og" }))))
  return t
}

/** The link-preview image in a language (src/app/[locale]/social-card), with its alt text. */
export async function socialCard(locale: Locale) {
  const t = await ogTranslator(locale)
  return { url: localizedPath("/social-card", locale), ...SOCIAL_CARD_SIZE, alt: t("alt"), type: "image/png" }
}

/** A page in each public language, and English as x-default: for hreflang in its metadata and in the sitemap. */
export function languageAlternates(path: string, address: (path: string) => string = (p) => p): Record<string, string> {
  const languages: Record<string, string> = Object.fromEntries(PUBLIC_LOCALES.map((l) => [l, address(localizedPath(path, l))]))
  languages["x-default"] = address(localizedPath(path, DEFAULT_LOCALE))
  return languages
}

/**
 * The language parts of a page's metadata (#183). Next replaces a layout's
 * openGraph and twitter whole when a page sets its own, so every page's
 * metadata goes through here: `metadata` is the page's own.
 */
async function withLanguage(locale: Locale, url: string, alternates: Metadata["alternates"], metadata: Metadata): Promise<Metadata> {
  const image = await socialCard(locale)
  return {
    ...metadata,
    alternates: { ...alternates, ...metadata.alternates },
    openGraph: {
      url,
      locale: OG_LOCALE[locale],
      alternateLocale: PUBLIC_LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      images: [image],
      ...metadata.openGraph,
    } as Metadata["openGraph"],
    twitter: { card: "summary_large_image", images: [image], ...metadata.twitter } as Metadata["twitter"],
  }
}

/**
 * An indexable page's metadata: its canonical address, the same page in each
 * public language (hreflang) with English as x-default, og:locale and the
 * link preview in the page's language.
 */
export function pageMetadata(path: string, locale: Locale, metadata: Metadata = {}): Promise<Metadata> {
  const url = localizedPath(path, locale)
  return withLanguage(locale, url, { canonical: url, languages: languageAlternates(path) }, metadata)
}

/**
 * For a page whose content is English in every language (blog posts, the
 * privacy policy and terms): the English page is the canonical one, so search
 * engines don't index copies that differ only in the navigation.
 */
export function englishOnlyMetadata(path: string, metadata: Metadata = {}): Promise<Metadata> {
  const url = localizedPath(path, DEFAULT_LOCALE)
  return withLanguage(DEFAULT_LOCALE, url, { canonical: url }, metadata)
}

/** For pages that aren't indexed (the layout's default): og:locale and the link preview. */
export function languageMetadata(locale: Locale, metadata: Metadata = {}): Promise<Metadata> {
  return withLanguage(locale, localizedPath("/", locale), undefined, { ...metadata, openGraph: { url: undefined, ...metadata.openGraph } })
}
