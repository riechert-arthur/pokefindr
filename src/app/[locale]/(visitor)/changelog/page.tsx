import { Fragment, type FC } from "react"
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
      {RELEASES.map((release) => (
        <Fragment key={release.version}>
          <h1 className="text-3xl font-bold mb-4">{t("title", { version: release.version })}</h1>
          <p className="mb-4">{t(`${release.key}.released`)}</p>

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
        </Fragment>
      ))}
    </div>
  )
}

export default ChangelogPage
