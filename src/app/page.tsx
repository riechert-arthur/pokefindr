import type { FC } from "react"
import { MapInstance } from "@/components/map/MapInstance"

interface HomePageProps {}

const HomePage: FC<HomePageProps> = () => {
  return (
    <MapInstance />
  )
}

export default HomePage