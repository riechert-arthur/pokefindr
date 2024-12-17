import type { FC } from "react"
import { SidebarLayout } from "@/components/SidebarLayout"
import { UserLocationContextProvider } from "@/components/providers/UserLocationContextProvider"
import mapPageMetadata from "./metadata.json"
import { MapLoader } from "@/components/map/MapLoader"

export const metadata = mapPageMetadata

const MapPage: FC = () => {
  return (
    <UserLocationContextProvider>
      <SidebarLayout>
        <MapLoader />
      </SidebarLayout>
    </UserLocationContextProvider>
  )
}

export default MapPage