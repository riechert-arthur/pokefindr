"use client"

import type { FC } from "react"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { Map, FullscreenControl, NavigationControl, MAP_STYLES, type MapRef, type ViewStateChangeEvent } from "./engine"
import { UserLocationPin } from "./UserLocationPin"
import { useUserLocationContext } from "@/components/providers/UserLocationContextProvider"
import { MapSearchBar } from "./MapSearchBar"
import { LOCATION_KINDS, type LocationFeature, type LocationKind } from "@/lib/types/locations"
import { useLocations } from "./useLocations"
import { LocationPopup, type LocationPopupProps } from "./LocationPinPopUps"
import { useSidebar } from "../providers/SidebarContextProvider"
import { LocationInfoPanel } from "./LocationInfoPanel"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { useSessionContext } from "../providers/SessionProvider"
import { useIsDark, useThemeKey } from "@/lib/design/useThemeKey"
import { MapStatus } from "./MapStatus"
import { MAP_FAILURE_MESSAGES } from "./MapErrorBoundary"
import { LAYERS, POINT_ZOOM, readMapColors } from "./layers"
import { LocationLayers } from "./LocationLayers"
import { NO_SELECTION, selectionReducer, type Selection } from "./selection"
import { StateLayers, StateLegend } from "./StateLayers"
import { useStateShading } from "./useStateShading"
import { cn } from "@/lib/utils"
import { INITIAL_LOAD_STATE, nextLoadState, type MapLoadState } from "./mapLoadState"

/** The lower 48, which the map opens on (from the redesign prototype). */
const US_BOUNDS: [[number, number], [number, number]] = [[-125.5, 24.0], [-66.5, 49.6]]

type SelectedLocation = Omit<LocationPopupProps, "onClose" | "onDetails">

const ALL_KINDS: ReadonlySet<LocationKind> = new Set(LOCATION_KINDS)

const toSelected = (feat: LocationFeature): SelectedLocation => {
  const [longitude, latitude] = feat.geometry.coordinates
  const { id, retailer, address, city, state, machineID, kind } = feat.properties
  return { longitude, latitude, id, retailer, address, city, state, machineID, kind }
}

const MapInstance: FC = () => {
  const userLocationContext = useUserLocationContext()
  const { userLocation, userLocationError } = userLocationContext
  const mapRef = useRef<MapRef>(null)
  // The selected location (ring), its popup, and whose details panel is open (see selectionReducer).
  const [{ selected, popup, details }, dispatch] = useReducer(
    selectionReducer<SelectedLocation>,
    NO_SELECTION as Selection<SelectedLocation>,
  )
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session } = useSessionContext()
  // MapInstance is client-only (MapLoader uses ssr: false), so this is right on first render.
  const isDark = useIsDark()
  const themeKey = useThemeKey()
  // Re-read the token colors only when the theme changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(readMapColors, [themeKey])
  const collection = useLocations()
  const { states, max, bounds } = useStateShading(ALL_KINDS)
  const [zoomedOut, setZoomedOut] = useState(true)
  // Loading until MapLibre's load event; failed if the map can't start (see nextLoadState).
  const [loadState, setLoadState] = useState<MapLoadState>(INITIAL_LOAD_STATE)

  useEffect(() => {
    if (userLocation && !userLocationError && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 10,
        essential: true,
      })
    }
  }, [userLocation, userLocationError])

  /** A dot was clicked: popup and ring, without moving the map. */
  const handleDotSelect = useCallback((feat: LocationFeature) => dispatch({ type: "select", location: toSelected(feat) }), [])

  /** A search result was picked: fly to it, then popup and ring. */
  const handleSearchSelect = (feat: LocationFeature) => {
    const [lng, lat] = feat.geometry.coordinates
    const map = mapRef.current
    map?.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 1200 })
    dispatch({ type: "select", location: toSelected(feat) })
  }

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={{ bounds: US_BOUNDS, fitBoundsOptions: { padding: 40 } }}
        minZoom={1.2}
        renderWorldCopies={false}
        attributionControl={{ compact: true, customAttribution: "State outlines: US Census" }}
        style={{
          width: "100%",
          height: "100%",
          zIndex: 1,
          position: "relative",
        }}
        mapStyle={isDark ? MAP_STYLES.dark : MAP_STYLES.light}
        onLoad={(e) => {
          setLoadState((state) => nextLoadState(state, { type: "load" }))
          setZoomedOut(e.target.getZoom() < POINT_ZOOM)
        }}
        onZoom={(e: ViewStateChangeEvent) => setZoomedOut(e.viewState.zoom < POINT_ZOOM)}
        onError={(e) => {
          console.error("[map]", e.error)
          const { sourceId, tile } = e as { sourceId?: string; tile?: unknown }
          setLoadState((state) => nextLoadState(state, { type: "error", error: e.error, sourceId, tile }))
        }}
        onClick={(e) => {
          if (isSidebarOpen) toggleSidebar()
          // A click off the dots closes the popup, as MapLibre popups do by default.
          const hit = e.target.getLayer(LAYERS.placeDots) && e.target.queryRenderedFeatures(e.point, { layers: [LAYERS.placeDots] }).length
          if (!hit) dispatch({ type: "closePopup" })
        }}
      >
        {states && <StateLayers states={states} max={max} bounds={bounds} colors={colors} />}
        <LocationLayers collection={collection} selected={selected} colors={colors} onSelect={handleDotSelect} />
        <FullscreenControl position="bottom-right" />
        <NavigationControl position="bottom-right" showCompass={false} />
        <UserLocationPin />
        <MapSearchBar selectedLocation={selected} collection={collection} onSelect={handleSearchSelect} />
        {selected && popup && (
          <LocationPopup
            {...selected}
            onClose={() => dispatch({ type: "closePopup" })}
            onDetails={() => dispatch({ type: "openDetails" })}
          />
        )}
        <LocationInfoPanel info={details} onClose={() => dispatch({ type: "closeDetails" })} />
        {states && zoomedOut && (
          <StateLegend
            max={max}
            className={cn("absolute right-3 z-[8] hidden md:block", session ? "top-20" : "top-3")}
          />
        )}
        {session && (
          <div className="absolute top-4 right-5 z-50">
            <UserMenu size={45} userName={session.username} />
          </div>
        )}
      </Map>
      {loadState.status !== "loaded" && (
        <MapStatus kind={loadState.status === "failed" ? "error" : "loading"} className="absolute inset-0 z-10">
          {loadState.status === "failed" ? MAP_FAILURE_MESSAGES[loadState.failure] : "Loading the map…"}
        </MapStatus>
      )}
    </>
  )
}

export default MapInstance
