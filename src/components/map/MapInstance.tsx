"use client"

import type { FC } from "react"
import { useEffect } from "react"
import Map, { FullscreenControl, NavigationControl } from "react-map-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { getPokemonCenterLocations } from "@/lib/map/locations"
import type { PokemonCenterLocation } from "@/lib/types/locations"
import { useMapContext } from "@/components/providers/MapContextProvider"
import { PokemonCenterLocationPins } from "./PokemonCenterLocationPins"
import { LocationPinPopUps } from "./LocationPinPopUps"
import type { MapPin } from "@/lib/types/map"

export const MapInstance: FC = () => {
  const mapContext = useMapContext()
  const { setPins } = mapContext

  useEffect(() => {
    const fetchCoordinates = async () => {
      try {
        const locations: PokemonCenterLocation[] =
          await getPokemonCenterLocations()
        setPins(locations as MapPin[])
      } catch (error) {
        throw error
      }
    }

    fetchCoordinates()
  }, [])

  return (
    <Map
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOXGL_API_KEY}
      initialViewState={{
        longitude: -84.39,
        latitude: 33.76,
        zoom: 8,
      }}
      style={{ width: "100vw", height: "100vh" }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
    >
      <PokemonCenterLocationPins />
      <LocationPinPopUps />
      <FullscreenControl position="bottom-right" />
      <NavigationControl position="bottom-right" />
    </Map>
  )
}
