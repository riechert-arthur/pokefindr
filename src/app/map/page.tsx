import type { FC } from "react"
import { MapInstance } from "@/components/map/MapInstance"
import { TopNavBar } from "@/components/TopNavBar"
import { UserLocationContextProvider } from "@/components/providers/UserLocationContextProvider"

const HomePage: FC = () => {
  return (
    <UserLocationContextProvider>
      <TopNavBar />
      <MapInstance />
    </UserLocationContextProvider>
  )
}

export default HomePage
