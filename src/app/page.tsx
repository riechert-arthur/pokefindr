import type { FC } from "react"
import { MapInstance } from "@/components/map/MapInstance"
import { TopNavBar } from "@/components/TopNavBar"
import homePageMetadata  from "./metadata.json"
import { Footer } from "@/components/Footer"

export const metadata = homePageMetadata

const HomePage: FC = () => {
  return (
    <>
      <TopNavBar />
      <MapInstance />
      <Footer />
    </>
  )
}

export default HomePage
