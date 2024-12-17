import type { FC } from "react"
import { TopNavBar } from "@/components/TopNavBar"
import { UserLocationContextProvider } from "@/components/providers/UserLocationContextProvider"
import mapPageMetadata from "./metadata.json"
import { MapLoader } from "@/components/map/MapLoader"

export const metadata = mapPageMetadata

const MapPage: FC = () => {
  return (
    <UserLocationContextProvider>
      <TopNavBar />
      <MapLoader />
    </UserLocationContextProvider>
  )
}

export default MapPage