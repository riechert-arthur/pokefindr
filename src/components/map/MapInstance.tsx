"use client"

import type { FC } from "react"
import { useEffect, useRef, useState } from "react"
import { Map, FullscreenControl, NavigationControl, MAP_STYLES, type MapRef } from "./engine"
import { PokemonCenterLocationPins } from "./PokemonCenterLocationPins"
import { UserLocationPin } from "./UserLocationPin"
import { useUserLocationContext } from "@/components/providers/UserLocationContextProvider"
import { MapSearchBar } from "./MapSearchBar"
import type { LocationFeature } from "@/lib/types/locations"
import { useLocations } from "./useLocations"
import { LocationPopupProps } from "./LocationPinPopUps"
import { useSidebar } from "../providers/SidebarContextProvider"
import { LocationInfoPanel } from "./LocationInfoPanel"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { useSessionContext } from "../providers/SessionProvider"
import { useIsDark } from "@/lib/design/useThemeKey"

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
  // MapInstance is client-only (MapLoader uses ssr: false), so this is right on first render.
  const isDark = useIsDark()
  const collection = useLocations()

  useEffect(() => {
    if (userLocation && !userLocationError && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 10,
        essential: true,
      })
    }
  }, [userLocation, userLocationError])

  const handleSelect = (feat: LocationFeature) => {
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
      id: feat.properties.id,
    })
  }

  return (
    <Map
      ref={mapRef}
      initialViewState={initialViewState}
      style={{
        width: "100%",
        height: "100%",
        zIndex: 1,
        position: "relative",
      }}
      mapStyle={isDark ? MAP_STYLES.dark : MAP_STYLES.light}
      onClick={() => {
        if(isSidebarOpen) {
          toggleSidebar()
        }
      }}
    >
      <PokemonCenterLocationPins 
        collection={collection}
        clickedInfo={clickedInfo}
        setClickedInfo={setClickedInfo}
      />
      <FullscreenControl position="bottom-right" />
      <NavigationControl position="bottom-right" />
      <UserLocationPin />
      <MapSearchBar selectedLocation={clickedInfo} collection={collection} onSelect={handleSelect} />
      <LocationInfoPanel info={clickedInfo} onClose={() => setClickedInfo(null)} />
      {session && (
        <div className="absolute top-4 right-5 z-50">
          <UserMenu size={45} userName={session.username} />
        </div>
      )}
    </Map>
  )
}

export default MapInstance
