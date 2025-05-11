import type { FC } from "react"
import { SidebarLayout } from "@/components/SidebarLayout"
import { UserLocationContextProvider } from "@/components/providers/UserLocationContextProvider"
import mapPageMetadata from "./metadata.json"
import { MapLoader } from "@/components/map/MapLoader"
import ChangelogModal from "@/components/ChangelogModal"
import { SidebarProvider } from "@/components/providers/SidebarContextProvider"

export const metadata = mapPageMetadata

const MapPage: FC = () => {
  return (
    <UserLocationContextProvider>
      <ChangelogModal />
      <SidebarProvider>
        <SidebarLayout>
          <MapLoader />
        </SidebarLayout>
      </SidebarProvider>
    </UserLocationContextProvider>
  )
}

export default MapPage
