import type { FC } from "react"
import { MapInstance } from "@/components/map/MapInstance"
import { TopNavBar } from "@/components/TopNavBar"
import { UserLocationContextProvider } from "@/components/providers/UserLocationContextProvider"
import mapPageMetadata from "./metadata.json"

export const metadata = mapPageMetadata

const MapPage: FC = () => {
  return (
    <UserLocationContextProvider>
      <TopNavBar />
      <MapInstance />
    </UserLocationContextProvider>
  )
}

export default MapPage
