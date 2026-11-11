import type { FC } from "react"
import { getTranslations } from "next-intl/server"
import { setPageLocale, type LocaleParams } from "@/i18n/static"
import { pageMetadata } from "@/i18n/seo"
import type { Locale } from "@/i18n/routing"
import type { Metadata } from "next"
import { CHANGELOG_RELEASES as RELEASES } from "@/lib/changelog"

/** Its title, description and address in each language, for search engines (#183, #255). */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = (await params).locale as Locale
  const t = await getTranslations({ locale, namespace: "content.changelog.meta" })
  return pageMetadata("/changelog", locale, { title: t("title"), description: t("description") })
}

const ChangelogPage: FC<LocaleParams> = async ({ params }) => {
  const locale = await setPageLocale(params)
  const t = await getTranslations({ locale, namespace: "content.changelog" })
  return (
    <div className="max-w-3xl mx-auto p-6 text-foreground">
      <h1 className="text-3xl font-bold mb-6">{t("heading")}</h1>
      {/* Newest first. */}
      {[...RELEASES].reverse().map((release) => (
        <section key={release.version} className="mb-8">
          <h2 className="text-2xl font-bold mb-2">{t("title", { version: release.version })}</h2>
          <p className="mb-4 text-muted-foreground">{t(`${release.key}.released`)}</p>

          <p className="mb-4">{t(`${release.key}.intro`)}</p>

          <ul className="list-disc list-inside mb-4 space-y-2">
            {release.items.map((item) => (
              <li key={item}>
                {t.rich(item, {
                  b: (chunks) => <strong>{chunks}</strong>,
                  i: (chunks) => <i>{chunks}</i>,
                })}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default ChangelogPage
