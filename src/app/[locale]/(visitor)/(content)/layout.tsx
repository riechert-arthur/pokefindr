import type { FC, ReactNode } from "react"
import { ContentPageHeader } from "@/components/ContentPageHeader"
import { type NavigationLink } from "@/components/ContentPageHeader"
import { getTranslations } from "next-intl/server"
import { SUPPORT_URL } from "@/components/ErrorPage"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

interface ContentPageLayoutProps extends LocaleParams {
  children: ReactNode
}

const ContentPageLayout: FC<ContentPageLayoutProps> = async ({ children, params }) => {
  const locale = await setPageLocale(params)
  const t = await getTranslations({ locale, namespace: "content.nav" })
  const navigation: NavigationLink[] = [
    { name: t("map"), href: "/map" },
    { name: t("blog"), href: "/blog" },
    { name: t("support"), href: SUPPORT_URL },
    { name: t("changelog"), href: "/changelog" },
    { name: t("dashboard"), href: "/home" },
  ]
  return (
    <div className="bg-background relative">
      <ContentPageHeader navigation={navigation} />
      {children}
    </div>
  )
}

export default ContentPageLayout
