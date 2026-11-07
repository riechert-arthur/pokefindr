"use client"

import type { FC } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { debounce, useQueryStates } from "nuqs"
import type { FeatureCollection, Point } from "geojson"
import {
  Map,
  FullscreenControl,
  Layer,
  NavigationControl,
  Source,
  MAP_STYLES,
  type MapRef,
  type ViewStateChangeEvent,
} from "./engine"
import { useViewportLocations, type ViewportMap } from "./useViewportLocations"
import { MapStatusPill } from "./MapStatusPill"
import { LocateControl } from "./LocateControl"
import { MapSearchBar } from "./MapSearchBar"
import { LOCATION_KINDS, type LocationFeature, type LocationFeatureProperties, type LocationKind } from "@/lib/types/locations"
import { useLocations } from "./useLocations"
import { LocationPopup, type LocationPopupProps } from "./LocationPinPopUps"
import { useSidebar } from "../providers/SidebarContextProvider"
import { LocationInfoPanel } from "./LocationInfoPanel"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { useSessionContext } from "../providers/SessionProvider"
import { useIsDark, useThemeKey } from "@/lib/design/useThemeKey"
import { MapStatus } from "./MapStatus"
import { MAP_FAILURE_MESSAGES } from "./MapErrorBoundary"
import { LAYERS, POINT_ZOOM, SOURCES, radiusLayers, readMapColors } from "./layers"
import { LocationLayers } from "./LocationLayers"
import { StateLayers, StateLegend } from "./StateLayers"
import { CountryLayers } from "./CountryLayers"
import { useStateShading } from "./useStateShading"
import { cn } from "@/lib/utils"
import { boundsOfRadius, milesBetween, radiusCircle } from "@/lib/map/geo"
import { DEFAULT_RADIUS, mapSearchParams, roundCamera, roundZoom } from "@/lib/map/url-state"
import type { InitialMapView } from "@/lib/map/initial-view"

type SelectedLocation = Omit<LocationPopupProps, "onClose" | "onDetails">

const toSelected = (feat: LocationFeature): SelectedLocation => {
  const [longitude, latitude] = feat.geometry.coordinates
  const { id, retailer, address, city, state, machineID, kind } = feat.properties
  return { longitude, latitude, id, retailer, address, city, state, machineID, kind }
}

/** How long the map must be still before its camera goes into the URL. */
const CAMERA_URL_DEBOUNCE_MS = 500

const EMPTY_AREA: FeatureCollection = { type: "FeatureCollection", features: [] }

export interface MapInstanceProps {
  view: InitialMapView
  /** The location named by `location=`, looked up on the server. */
  location: LocationFeature | null
}

const MapInstance: FC<MapInstanceProps> = ({ view, location }) => {
  const mapRef = useRef<MapRef>(null)
  const [params, setParams] = useQueryStates(mapSearchParams)
  // The location with the popup and ring, and the one whose details panel is open.
  const [selected, setSelected] = useState<SelectedLocation | null>(() => (location ? toSelected(location) : null))
  const [details, setDetails] = useState<SelectedLocation | null>(() => (location ? toSelected(location) : null))
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session } = useSessionContext()
  // MapInstance is client-only (MapLoader uses ssr: false), so this is right on first render.
  const isDark = useIsDark()
  const themeKey = useThemeKey()
  // Re-read the token colors only when the theme changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(readMapColors, [themeKey])

  // What to show, from the URL: every kind and retailer unless it names some.
  const typesKey = params.types?.join(",")
  const kinds = useMemo<readonly LocationKind[]>(
    () => params.types ?? LOCATION_KINDS,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typesKey],
  )
  const kindSet = useMemo(() => new Set(kinds), [kinds])
  const retailers = params.retailer

  // The viewer's position, once they share it. It never goes into the URL.
  const [me, setMe] = useState<{ lng: number; lat: number } | null>(null)

  // The search center and radius: the viewer (near=me) or a searched place from the URL.
  const nearMe = params.near === "me"
  const placeLng = nearMe ? (me?.lng ?? null) : params.q ? params.lng : null
  const placeLat = nearMe ? (me?.lat ?? null) : params.q ? params.lat : null
  const placeRadius = params.r ?? DEFAULT_RADIUS
  const place = useMemo(
    () => (placeLng !== null && placeLat !== null ? { lng: placeLng, lat: placeLat, radius: placeRadius } : null),
    [placeLng, placeLat, placeRadius],
  )
  const area = useMemo(() => (place ? radiusCircle(place.lng, place.lat, place.radius) : EMPTY_AREA), [place])
  const radius = useMemo(() => radiusLayers(colors), [colors])

  // Every location, for the search box only; the map draws what's in view.
  const collection = useLocations()
  const { states, max, total, bounds } = useStateShading(kindSet)
  const [map, setMap] = useState<ViewportMap>()
  const viewport = useViewportLocations(map, { types: kinds })
  const inView = useMemo<FeatureCollection<Point, LocationFeatureProperties & { dim?: boolean }>>(() => {
    const features = retailers?.length
      ? viewport.features.filter((f) => f.properties.kind !== "vending" || retailers.includes(f.properties.retailer))
      : viewport.features
    if (!place) return { type: "FeatureCollection", features }
    return {
      type: "FeatureCollection",
      features: features.map((f) => {
        const [lng, lat] = f.geometry.coordinates
        return { ...f, properties: { ...f.properties, dim: milesBetween(place.lng, place.lat, lng, lat) > place.radius } }
      }),
    }
  }, [viewport.features, retailers, place])

  const [zoomedOut, setZoomedOut] = useState(true)
  // "loading" until the style and first tiles are in; "failed" if that never happens.
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "failed">("loading")
  // Set when the viewer starts moving the map (not when the app flies it).
  const userMoving = useRef(false)

  // Back and forward: the details panel follows `location=`.
  useEffect(() => {
    if (!params.location) setDetails(null)
    else if (selected?.id === params.location) setDetails(selected)
    // Only when the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.location])

  /**
   * The viewer shared their position: show the radius around them and put
   * near=me (never coordinates) in the URL.
   */
  const handleLocate = useCallback(
    (position: { lng: number; lat: number }) => {
      setMe(position)
      const r = params.r ?? DEFAULT_RADIUS
      mapRef.current?.fitBounds(boundsOfRadius(position.lng, position.lat, r), { padding: 40, maxZoom: 13, duration: 1400 })
      if (params.near !== "me") {
        void setParams(
          { near: "me", r, q: null, lat: null, lng: null, z: null, state: null },
          { history: "push" },
        )
      }
    },
    [params.r, params.near, setParams],
  )

  /** A dot was clicked: popup and ring, without moving the map. */
  const handleDotSelect = useCallback((feat: LocationFeature) => setSelected(toSelected(feat)), [])

  /** A search result was picked: fly to it, then popup and ring. */
  const handleSearchSelect = (feat: LocationFeature) => {
    const [lng, lat] = feat.geometry.coordinates
    const map = mapRef.current
    map?.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 1200 })
    setSelected(toSelected(feat))
  }

  /** Details are a new view: a new history entry, so Back closes them. */
  const openDetails = (info: SelectedLocation) => {
    setDetails(info)
    void setParams({ location: info.id }, { history: "push" })
  }

  const closeDetails = () => {
    setDetails(null)
    void setParams({ location: null })
  }

  /** A state was clicked (StateLayers zooms to it): a new view, so a new history entry. */
  const handleStateSelect = useCallback(
    (code: string) => {
      void setParams(
        { state: code, q: null, lat: null, lng: null, r: null, z: null, near: null },
        { history: "push" },
      )
    },
    [setParams],
  )

  /**
   * The viewer moved the map: keep its camera in the URL (replacing, so the
   * history doesn't fill with pans), unless a place or state names the view.
   */
  const handleMoveEnd = (e: ViewStateChangeEvent) => {
    if (!userMoving.current) return
    userMoving.current = false
    if (place || params.state || params.near) return
    const { longitude, latitude, zoom } = e.viewState
    void setParams(
      { lat: roundCamera(latitude), lng: roundCamera(longitude), z: roundZoom(zoom) },
      { limitUrlUpdates: debounce(CAMERA_URL_DEBOUNCE_MS) },
    )
  }

  const { camera } = view
  const initialViewState =
    "bounds" in camera
      ? {
          bounds: camera.bounds,
          // An explicit `maxZoom: undefined` overrides MapLibre's default and breaks the fit.
          fitBoundsOptions: camera.maxZoom === undefined ? { padding: 40 } : { padding: 40, maxZoom: camera.maxZoom },
        }
      : camera

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        minZoom={1.2}
        renderWorldCopies={false}
        attributionControl={{ compact: true, customAttribution: "Outlines: Natural Earth, US Census" }}
        style={{
          width: "100%",
          height: "100%",
          zIndex: 1,
          position: "relative",
        }}
        mapStyle={isDark ? MAP_STYLES.dark : MAP_STYLES.light}
        onLoad={(e) => {
          setLoadState("loaded")
          setMap(e.target)
          setZoomedOut(e.target.getZoom() < POINT_ZOOM)
        }}
        onZoom={(e: ViewStateChangeEvent) => setZoomedOut(e.viewState.zoom < POINT_ZOOM)}
        onMoveStart={(e: ViewStateChangeEvent) => {
          // Gestures carry the browser event; flyTo and fitBounds don't.
          if (e.originalEvent) userMoving.current = true
        }}
        onMoveEnd={handleMoveEnd}
        onError={(e) => {
          console.error("[map]", e.error)
          // Errors after load (a missing tile, say) don't stop the map; one before
          // load means the style or its sources didn't arrive.
          setLoadState((current) => (current === "loading" ? "failed" : current))
        }}
        onClick={(e) => {
          if (isSidebarOpen) toggleSidebar()
          // A click off the dots closes the popup, as MapLibre popups do by default.
          const hit = e.target.getLayer(LAYERS.placeDots) && e.target.queryRenderedFeatures(e.point, { layers: [LAYERS.placeDots] }).length
          if (!hit) setSelected(null)
        }}
      >
        <CountryLayers colors={colors} />
        {states && (
          <StateLayers states={states} max={max} bounds={bounds} colors={colors} onSelect={handleStateSelect} />
        )}
        <Source id={SOURCES.radius} type="geojson" data={area}>
          <Layer {...radius.fill} />
          <Layer {...radius.line} />
        </Source>
        <LocationLayers collection={inView} selected={selected} colors={colors} onSelect={handleDotSelect} />
        <FullscreenControl position="bottom-right" />
        <LocateControl onLocate={handleLocate} autoLocate={view.nearMe} />
        <NavigationControl position="bottom-right" showCompass={false} />
        <MapSearchBar selectedLocation={selected} collection={collection} onSelect={handleSearchSelect} />
        {selected && (
          <LocationPopup
            {...selected}
            onClose={() => setSelected(null)}
            onDetails={() => openDetails(selected)}
          />
        )}
        <LocationInfoPanel info={details} onClose={closeDetails} />
        {states && zoomedOut && (
          <StateLegend
            max={max}
            className={cn("absolute right-3 z-[8] hidden md:block", session ? "top-20" : "top-3")}
          />
        )}
        <MapStatusPill
          zoomedOut={zoomedOut}
          total={total}
          inView={inView.features.length}
          status={viewport.status}
          truncated={viewport.truncated}
          kinds={kinds}
        />
        {session && (
          <div className="absolute top-4 right-5 z-50">
            <UserMenu size={45} userName={session.username} />
          </div>
        )}
      </Map>
      {loadState !== "loaded" && (
        <MapStatus kind={loadState === "failed" ? "error" : "loading"} className="absolute inset-0 z-10">
          {loadState === "failed" ? MAP_FAILURE_MESSAGES.library : "Loading the map…"}
        </MapStatus>
      )}
    </>
  )
}

export default MapInstance
