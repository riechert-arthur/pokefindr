import type { FC } from "react"
import { MapLoader } from "@/components/map/MapLoader"

export const metadata = {
  "title": "Find all Pokemon Vending Machine Locations Near You - Free Map | PokeFindr",
  "description": "See an interactive map with all the Pokemon Vending Machine locations near you. Easily send the directions to Google Maps and see reviews from others.",
  "keywords": [
    "Pokemon vending machines",
    "Pokemon map",
    "vending machine locations",
    "Pokemon merchandise map",
    "PokeFindr",
    "pokemon vending machines near me",
    "pokemon vending machine map",
    "nearest pokemon vending machines"
  ],
  "author": "PokeFindr Developer",
  "openGraph": {
    "title": "Find all Pokemon Vending Machine Locations Near You | PokeFindr",
    "description": "Explore a comprehensive map of Pokemon Vending Machine Locations. Easily find directions to your nearest vending machine!"
  }
}

const MapPage: FC = () => {
  return (
    <MapLoader />
  )
}

export default MapPage
