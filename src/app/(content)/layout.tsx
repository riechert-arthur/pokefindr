import type { FC, ReactNode } from "react"
import { ContentPageHeader } from "@/components/ContentPageHeader"
import type { NavigationLink } from "@/components/ContentPageHeader"

const navigation: NavigationLink[] = [
  { name: "Map", href: "/map" },
  { name: "Blog", href: "/blog" },
  { name: "Support", href: "https://discord.gg/f2uUR5bAZU" },
  { name: "Changelog", href: "/changelog" },
]

interface ContentPageLayoutProps {
  children: ReactNode
}

const ContentPageLayout: FC<ContentPageLayoutProps> = ({ children }) => {
  return (
    <div className="bg-white relative">
      <ContentPageHeader navigation={navigation} />
      {children}
    </div>
  )
}

export default ContentPageLayout
