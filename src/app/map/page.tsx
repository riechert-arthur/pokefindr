import type { FC } from "react"
import dynamic from "next/dynamic"
import { TopNavBar } from "@/components/TopNavBar"
import { UserLocationContextProvider } from "@/components/providers/UserLocationContextProvider"
import mapPageMetadata from "./metadata.json"

const MapInstance = dynamic(() => import("@/components/map/MapInstance"), {
  loading: () => <div>Loading map...</div>,
  ssr: false,
})

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
