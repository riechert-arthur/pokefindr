import type { FC } from "react"
import { MapInstance } from "@/components/map/MapInstance"
import { TopNavBar } from "@/components/TopNavBar"

const HomePage: FC = () => {
  return (
    <>
      <TopNavBar />
      <MapInstance />
    </>
  )
}

export default HomePage
