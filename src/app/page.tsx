import type { FC } from "react"
import { MapInstance } from "@/components/map/MapInstance"
import { TopNavBar } from "@/components/TopNavBar"
import homePageMetadata  from "./metadata.json"

export const metadata = homePageMetadata

const HomePage: FC = () => {
  return (
    <>
      <TopNavBar />
      <MapInstance />
    </>
  )
}

export default HomePage
