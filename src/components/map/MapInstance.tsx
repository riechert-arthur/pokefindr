"use client"

import type { FC } from "react"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
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
import { UserLocationPin } from "./UserLocationPin"
import { useUserLocationContext } from "@/components/providers/UserLocationContextProvider"
import { MapSearchBar } from "./MapSearchBar"
import { type LocationFeature, type LocationFeatureProperties, type LocationKind } from "@/lib/types/locations"
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
import { NO_SELECTION, selectionReducer, type Selection } from "./selection"
import { StateLayers, StateLegend } from "./StateLayers"
import { useStateShading } from "./useStateShading"
import { cn } from "@/lib/utils"
import { milesBetween, radiusCircle } from "@/lib/map/geo"
import { DEFAULT_RADIUS, loadMapSearchParams, mapSearchParams, roundCamera, roundZoom, type MapSearchParams } from "@/lib/map/url-state"
import { initialMapView, shownKinds, viewKey, type InitialMapView } from "@/lib/map/initial-view"
import { INITIAL_LOAD_STATE, nextLoadState, type MapLoadState } from "./mapLoadState"

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
  const userLocationContext = useUserLocationContext()
  const { userLocation, userLocationError } = userLocationContext
  const mapRef = useRef<MapRef>(null)
  const [params, setParams] = useQueryStates(mapSearchParams)
  // The selected location (ring), its popup, and whose details panel is open (see selectionReducer).
  // A shared location= link opens with its details.
  const [{ selected, popup, details }, dispatch] = useReducer(
    selectionReducer<SelectedLocation>,
    location ? toSelected(location) : null,
    (initial): Selection<SelectedLocation> => (initial ? { selected: initial, popup: false, details: initial } : NO_SELECTION),
  )
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
    () => shownKinds(params.types),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typesKey],
  )
  const kindSet = useMemo(() => new Set(kinds), [kinds])
  const retailers = params.retailer

  // The searched place and the state from the URL, checked the same way as on
  // the server (coordinates in range, known state codes).
  const currentViewKey = viewKey(params)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const urlView = useMemo(() => initialMapView(params), [currentViewKey])
  const placeLng = urlView.place?.lng ?? null
  const placeLat = urlView.place?.lat ?? null
  const placeRadius = urlView.place?.radius ?? DEFAULT_RADIUS
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
  // Loading until MapLibre's load event; failed if the map can't start (see nextLoadState).
  const [loadState, setLoadState] = useState<MapLoadState>(INITIAL_LOAD_STATE)
  // Set when the viewer starts moving the map (not when the app flies it).
  const userMoving = useRef(false)

  useEffect(() => {
    if (userLocation && !userLocationError && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 10,
        essential: true,
      })
    }
  }, [userLocation, userLocationError])

  // The details panel follows `location=` (a shared link, Back or Forward).
  // globalThis: `Map` here is the map component from ./engine.
  const knownLocations = useMemo(() => new globalThis.Map(collection.features.map((f) => [f.properties.id, f])), [collection])
  useEffect(() => {
    if (!params.location) {
      dispatch({ type: "closeDetails" })
      pushedDetails.current = null
      return
    }
    const feature = knownLocations.get(params.location)
    if (feature) dispatch({ type: "showDetails", location: toSelected(feature) })
  }, [params.location, knownLocations])

  // Back and Forward: when the URL's view (place, state, camera) changes, move
  // the map to it. The key of the view the map shows changes only on load, on
  // our own URL writes (writeView) and here, never from React's copy of the
  // URL, which can lag behind history navigation.
  const lastViewKey = useRef(currentViewKey)
  const writeView = useCallback(
    (update: Partial<MapSearchParams>, options: Parameters<typeof setParams>[1]) => {
      lastViewKey.current = viewKey({ ...loadMapSearchParams(new URLSearchParams(window.location.search)), ...update })
      void setParams(update, options)
    },
    [setParams],
  )
  useEffect(() => {
    const onPopState = () => {
      const next = loadMapSearchParams(new URLSearchParams(window.location.search))
      const key = viewKey(next)
      if (key === lastViewKey.current) return
      // Remember it now: React's copy of the URL may not have caught up yet.
      lastViewKey.current = key
      const { camera } = initialMapView(next)
      const map = mapRef.current
      if (!map) return
      if ("bounds" in camera) {
        // An explicit `maxZoom: undefined` breaks the fit (NaN center); leave it out instead.
        map.fitBounds(camera.bounds, camera.maxZoom === undefined ? { padding: 40, duration: 1000 } : { padding: 40, maxZoom: camera.maxZoom, duration: 1000 })
      }
      else map.flyTo({ center: [camera.longitude, camera.latitude], zoom: camera.zoom, duration: 1000 })
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  // The open details, readable from callbacks without re-creating them.
  const detailsRef = useRef(details)
  detailsRef.current = details

  /**
   * The URL entry View details pushed, as its query string: closing steps
   * back only while the URL is still exactly that entry. After a pan (the
   * camera is written into it) or any other change, closing just drops
   * `location`, so it never undoes what the viewer did meanwhile.
   */
  const pushedDetails = useRef<string | null>(null)

  /** Selecting another place closes the open details; the URL drops them too. */
  const select = useCallback(
    (feat: LocationFeature) => {
      const open = detailsRef.current
      dispatch({ type: "select", location: toSelected(feat) })
      if (open && open.id !== feat.properties.id) void setParams({ location: null })
    },
    [setParams],
  )

  /** A dot was clicked: popup and ring, without moving the map. */
  const handleDotSelect = select

  /** A search result was picked: fly to it, then popup and ring. */
  const handleSearchSelect = (feat: LocationFeature) => {
    const [lng, lat] = feat.geometry.coordinates
    const map = mapRef.current
    map?.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 1200 })
    select(feat)
  }

  /** Details are a new view: a new history entry, so Back closes them. */
  const openDetails = () => {
    if (!selected) return
    dispatch({ type: "openDetails" })
    void setParams({ location: selected.id }, { history: "push" }).then((search) => {
      pushedDetails.current = search.toString()
    })
  }

  const closeDetails = () => {
    dispatch({ type: "closeDetails" })
    const current = new URLSearchParams(window.location.search).toString()
    if (pushedDetails.current !== null && pushedDetails.current === current) {
      pushedDetails.current = null
      window.history.back()
    } else {
      pushedDetails.current = null
      void setParams({ location: null })
    }
  }

  /** A state was clicked (StateLayers zooms to it): a new view, so a new history entry. */
  const handleStateSelect = useCallback(
    (code: string) => {
      // A new view: the details close with it.
      dispatch({ type: "closeDetails" })
      writeView({ state: code, q: null, lat: null, lng: null, r: null, z: null, near: null, location: null }, { history: "push" })
    },
    [writeView],
  )

  /**
   * The viewer moved the map: keep its camera in the URL (replacing, so the
   * history doesn't fill with pans), unless a place or state names the view.
   */
  const handleMoveEnd = (e: ViewStateChangeEvent) => {
    if (!userMoving.current) return
    userMoving.current = false
    // A place's radius (or near=me) still frames the results, so it stays.
    if (place || params.near) return
    // Panning away from a state makes the camera the view, so a copied link
    // opens where the viewer is looking.
    const { longitude, latitude, zoom } = e.viewState
    writeView(
      { state: null, lat: roundCamera(latitude), lng: roundCamera(longitude), z: roundZoom(zoom) },
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
        // Flat and north-up, as in the prototype (no compass). A tilted view
        // reaches toward the horizon and asks the API for far too big a box.
        maxPitch={0}
        dragRotate={false}
        touchPitch={false}
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
          const { sourceId, tile } = e as { sourceId?: string; tile?: unknown }
          // react-maplibre's own startup failures come with no map (target null).
          let styleLoaded = false
          try {
            styleLoaded = Boolean(e.target?.getStyle())
          } catch {
            // No style yet.
          }
          setLoadState((state) => nextLoadState(state, { type: "error", error: e.error, sourceId, tile, styleLoaded }))
        }}
        onClick={(e) => {
          if (isSidebarOpen) toggleSidebar()
          // A click off the dots closes the popup, as MapLibre popups do by default.
          const hit = e.target.getLayer(LAYERS.placeDots) && e.target.queryRenderedFeatures(e.point, { layers: [LAYERS.placeDots] }).length
          if (!hit) dispatch({ type: "closePopup" })
        }}
      >
        {states && (
          <StateLayers states={states} max={max} bounds={bounds} colors={colors} onSelect={handleStateSelect} />
        )}
        <Source id={SOURCES.radius} type="geojson" data={area}>
          <Layer {...radius.fill} />
          <Layer {...radius.line} />
        </Source>
        <LocationLayers collection={inView} selected={selected} colors={colors} onSelect={handleDotSelect} />
        <FullscreenControl position="bottom-right" />
        <NavigationControl position="bottom-right" showCompass={false} />
        <UserLocationPin />
        <MapSearchBar selectedLocation={selected} collection={collection} onSelect={handleSearchSelect} />
        {selected && popup && (
          <LocationPopup
            {...selected}
            onClose={() => dispatch({ type: "closePopup" })}
            onDetails={openDetails}
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
      {loadState.status !== "loaded" && (
        <MapStatus kind={loadState.status === "failed" ? "error" : "loading"} className="absolute inset-0 z-10">
          {loadState.status === "failed" ? MAP_FAILURE_MESSAGES[loadState.failure] : "Loading the map…"}
        </MapStatus>
      )}
    </>
  )
}

export default MapInstance
