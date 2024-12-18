import type { FC, ReactNode } from "react"
import { ContentPageHeader } from "@/components/ContentPageHeader"
import type { NavigationLink } from "@/components/ContentPageHeader"

const navigation: NavigationLink[] = [
  { name: "Map", href: "/map" },
  { name: "Blog", href: "/blog" },
  { name: "Contact", href: "#" },
  { name: "Contribute", href: "#" },
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
