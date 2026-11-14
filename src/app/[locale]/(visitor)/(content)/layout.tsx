import type { FC, ReactNode } from "react"
import { ContentPageHeader } from "@/components/ContentPageHeader"
import { type NavigationLink } from "@/components/ContentPageHeader"
import { getTranslations } from "next-intl/server"
import { SITE_LINKS, type SiteLink } from "@/lib/links"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

const LINKS: SiteLink[] = ["map", "blog", "support", "changelog", "dashboard"]

interface ContentPageLayoutProps extends LocaleParams {
  children: ReactNode
}

const ContentPageLayout: FC<ContentPageLayoutProps> = async ({ children, params }) => {
  const locale = await setPageLocale(params)
  const t = await getTranslations({ locale, namespace: "content.nav" })
  const navigation: NavigationLink[] = LINKS.map((name) => ({ name: t(name), href: SITE_LINKS[name] }))
  return (
    <div className="bg-background relative">
      <ContentPageHeader navigation={navigation} />
      {children}
    </div>
  )
}

export default ContentPageLayout
