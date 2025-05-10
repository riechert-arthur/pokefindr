"use client"

import type { FC } from "react"
import { useEffect, useRef } from "react"
import Map, { FullscreenControl, NavigationControl } from "react-map-gl"
import type { MapRef } from "react-map-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { getPokemonCenterLocations } from "@/lib/map/locations"
import type { PokemonCenterLocation } from "@/lib/types/locations"
import { useMapContext } from "@/components/providers/MapContextProvider"
import { PokemonCenterLocationPins } from "./PokemonCenterLocationPins"
import type { MapPin } from "@/lib/types/map"
import { UserLocationPin } from "./UserLocationPin"
import { useUserLocationContext } from "@/components/providers/UserLocationContextProvider"

interface ViewState {
  longitude: number
  latitude: number
  zoom: number
}

const initialViewState: ViewState = {
  longitude: -100.0,
  latitude: 40,
  zoom: 4,
}

const MapInstance: FC = () => {
  const mapContext = useMapContext()
  const { setPins } = mapContext
  const userLocationContext = useUserLocationContext()
  const { userLocation, userLocationError } = userLocationContext
  const mapRef = useRef<MapRef>(null)

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

  useEffect(() => {
    if (userLocation && !userLocationError && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 10,
        essential: true,
      })
    }
  }, [userLocation, userLocationError])

  return (
    <Map
      ref={mapRef}
      initialViewState={initialViewState}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOXGL_API_KEY}
      style={{
        width: "100%",
        height: "100%",
        zIndex: 1,
        position: "relative",
      }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
    >
      <PokemonCenterLocationPins />
      <FullscreenControl position="bottom-right" />
      <NavigationControl position="bottom-right" />
      <UserLocationPin />
    </Map>
  )
}

export default MapInstance
