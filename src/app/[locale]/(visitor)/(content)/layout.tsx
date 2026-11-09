import type { FC, ReactNode } from "react"
import { ContentPageHeader } from "@/components/ContentPageHeader"
import { type NavigationLink } from "@/components/ContentPageHeader"
import { setPageLocale, type LocaleParams } from "@/i18n/static"

const navigation: NavigationLink[] = [
  { name: "Map", href: "/map" },
  { name: "Blog", href: "/blog" },
  { name: "Support", href: "https://discord.gg/f2uUR5bAZU" },
  { name: "Changelog", href: "/changelog" },
  { name: "Dashboard", href: "/home",  },
]

interface ContentPageLayoutProps extends LocaleParams {
  children: ReactNode
}

const ContentPageLayout: FC<ContentPageLayoutProps> = async ({ children, params }) => {
  await setPageLocale(params)
  return (
    <div className="bg-background relative">
      <ContentPageHeader navigation={navigation} />
      {children}
    </div>
  )
}

export default ContentPageLayout
