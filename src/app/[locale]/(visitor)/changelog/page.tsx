import { Fragment, type FC } from "react"
import { getTranslations } from "next-intl/server"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

const ids = <K extends string, I extends string>(release: K, items: readonly I[]) => items.map((item) => `${release}.items.${item}` as const)

/** Each release, oldest first, with the keys of its changes in order (`content.changelog`). */
const RELEASES = [
  { version: "1.1", key: "v1_1", items: ids("v1_1", ["load", "grouping", "precise", "data", "zoom", "search", "ui", "discord"]) },
  { version: "1.2", key: "v1_2", items: ids("v1_2", ["accounts", "reviews", "settings", "sso", "ratings"]) },
] as const

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
