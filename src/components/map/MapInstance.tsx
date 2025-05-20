"use client"

import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import Map, { FullscreenControl, NavigationControl } from "react-map-gl"
import type { MapRef } from "react-map-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { PokemonCenterLocationPins, type MachineProperties } from "./PokemonCenterLocationPins"
import { UserLocationPin } from "./UserLocationPin"
import { useUserLocationContext } from "@/components/providers/UserLocationContextProvider"
import { MapSearchBar } from "./MapSearchBar"
import machineData from "@/data/vending_machines_mod.json"
import type { Feature, FeatureCollection, Point } from "geojson"
import { LocationPopupProps } from "./LocationPinPopUps"
import { useSidebar } from "../providers/SidebarContextProvider"
import { LocationInfoPanel } from "./LocationInfoPanel"
import Avatar from "@/components/ui/Avatar"
import { useSessionContext } from "../providers/SessionProvider"

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
  const userLocationContext = useUserLocationContext()
  const { userLocation, userLocationError } = userLocationContext
  const mapRef = useRef<MapRef>(null)
  const [clickedInfo, setClickedInfo] = useState<Omit<
    LocationPopupProps,
    "onClose"
  > | null>(null)
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session } = useSessionContext()

  useEffect(() => {
    if (userLocation && !userLocationError && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 10,
        essential: true,
      })
    }
  }, [userLocation, userLocationError])

  const handleSelect = (feat: Feature<Point, MachineProperties>) => {
    const [lng, lat] = feat.geometry.coordinates
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 14, duration: 1000 })
    setClickedInfo({
      longitude: lng,
      latitude: lat,
      retailer: feat.properties.retailer,
      address: feat.properties.address,
      city: feat.properties.city,
      state: feat.properties.state,
      machineID: feat.properties.machineID,
      feature_index: feat.properties.feature_index,
    })
  }

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
      onClick={() => {
        if(isSidebarOpen) {
          toggleSidebar()
        }
      }}
    >
      <PokemonCenterLocationPins 
        collection={machineData as FeatureCollection<Point, MachineProperties>}
        clickedInfo={clickedInfo}
        setClickedInfo={setClickedInfo}
      />
      <FullscreenControl position="bottom-right" />
      <NavigationControl position="bottom-right" />
      <UserLocationPin />
      <MapSearchBar selectedLocation={clickedInfo} collection={machineData as FeatureCollection<Point, MachineProperties>} onSelect={handleSelect} />
      <LocationInfoPanel info={clickedInfo} onClose={() => setClickedInfo(null)} />
      {session && (
        <div className="absolute top-4 right-5 z-50">
          <Avatar size={45} userName={session.username} />
        </div>
      )}
    </Map>
  )
}

export default MapInstance
