import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { DEFAULT_LOCALE } from "@/i18n/routing"

/**
 * The privacy policy and terms are in English only (docs/i18n.md). In another
 * language, their page says so at the top and links to the English page; the
 * text below stays English (the page marks it lang="en", and this notice its own language).
 */
export function EnglishOnlyNotice({ href }: { href: "/privacy-policy" | "/terms-of-service" }) {
  const locale = useLocale()
  const t = useTranslations("legal")
  if (locale === DEFAULT_LOCALE) return null
  return (
    <p role="note" lang={locale} className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-body text-muted-foreground">
      {t.rich("englishOnly", {
        link: (chunks) => (
          <Link href={href} locale={DEFAULT_LOCALE} className="text-primary hover:underline">
            {chunks}
          </Link>
        ),
      })}
    </p>
  )
}
