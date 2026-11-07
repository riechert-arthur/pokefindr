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
import { LocateControl } from "./LocateControl"
import { MenuIcon } from "lucide-react"
import { PlaceSearch, type PlacePick } from "@/components/search/PlaceSearch"
import { APP_NAV_ID } from "@/components/pokefindr/AppRail"
import { Button } from "@/components/ui/button"
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
import { NO_SELECTION, selectionReducer, type Selection } from "./selection"
import { StateLegend } from "./StateLayers"
import { MapShading } from "./MapShading"
import { useStateShading } from "./useStateShading"
import { cameraPadding } from "./camera"
import { MapPanel } from "./MapPanel"
import { ResultsSheet } from "./ResultsSheet"
import { useNearbyLocations } from "./useNearbyLocations"
import { cn } from "@/lib/utils"
import { boundsOfRadius, milesBetween, radiusCircle, US_BOUNDS } from "@/lib/map/geo"
import { STATES } from "@/lib/map/states"
import { DEFAULT_RADIUS, RADII, loadMapSearchParams, mapSearchParams, nearMeParams, roundCamera, roundPlace, roundZoom, type MapSearchParams } from "@/lib/map/url-state"
import { initialMapView, shownKinds, viewKey, type InitialMapView } from "@/lib/map/initial-view"
import { INITIAL_LOAD_STATE, nextLoadState, type MapLoadState } from "./mapLoadState"

type SelectedLocation = Omit<LocationPopupProps, "onClose" | "onDetails">

const toSelected = (feat: LocationFeature): SelectedLocation => {
  const [longitude, latitude] = feat.geometry.coordinates
  const { id, retailer, address, city, state, machineID, kind } = feat.properties
  return { longitude, latitude, id, retailer, address, city, state, machineID, kind }
}

/** What the search box shows for the URL's view: the place, the state, or "Your location". */
const searchLabel = (params: MapSearchParams): string =>
  params.near === "me" ? "Your location" : params.q ? params.q : params.state && Object.hasOwn(STATES, params.state) ? STATES[params.state].name : ""

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
  /** Camera padding that keeps fitted views clear of the panel. */
  const pad = () => cameraPadding(mapRef.current?.getContainer())
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

  // The viewer's position, once they share it. It never goes into the URL.
  const [me, setMe] = useState<{ lng: number; lat: number } | null>(null)
  // Readable from the popstate handler, which is set up once.
  const meRef = useRef(me)
  meRef.current = me

  // The search center and radius: the viewer (near=me), or the searched place
  // from the URL, checked the same way as on the server (coordinates in
  // range, known state codes).
  const nearMe = params.near === "me"
  const currentViewKey = viewKey(params)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const urlView = useMemo(() => initialMapView(params), [currentViewKey])
  const placeLng = nearMe ? (me?.lng ?? null) : (urlView.place?.lng ?? null)
  const placeLat = nearMe ? (me?.lat ?? null) : (urlView.place?.lat ?? null)
  const placeRadius = params.r ?? DEFAULT_RADIUS
  const place = useMemo(
    () => (placeLng !== null && placeLat !== null ? { lng: placeLng, lat: placeLat, radius: placeRadius } : null),
    [placeLng, placeLat, placeRadius],
  )
  const area = useMemo(() => (place ? radiusCircle(place.lng, place.lat, place.radius) : EMPTY_AREA), [place])
  const radius = useMemo(() => radiusLayers(colors), [colors])

  // Every location, for the search box only; the map draws what's in view.
  const collection = useLocations()
  const { states, max, total, bounds, kindTotals } = useStateShading(kindSet)
  // The results list for the place (or the viewer), closest first.
  const nearby = useNearbyLocations(place, kinds, retailers)
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

  // The search box's text: the view's label, until the viewer types.
  const [query, setQuery] = useState(() => searchLabel(params))
  // Where search ranks nearby results first: the map's center once zoomed in, to ~10 km.
  const [searchNear, setSearchNear] = useState<[number, number] | undefined>()

  const [zoomedOut, setZoomedOut] = useState(true)
  // Loading until MapLibre's load event; failed if the map can't start (see nextLoadState).
  const [loadState, setLoadState] = useState<MapLoadState>(INITIAL_LOAD_STATE)
  // Set when the viewer starts moving the map (not when the app flies it).
  const userMoving = useRef(false)

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

  // A new view (a pick, Back or Forward) puts its label in the search box.
  // Keyed on the label, so a pan (a camera-only URL write) keeps what the
  // viewer typed.
  const viewLabel = searchLabel(params)
  useEffect(() => setQuery(viewLabel), [viewLabel])

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
      const map = mapRef.current
      if (!map) return
      // near=me carries no coordinates; go back to the radius around the viewer we already found.
      const found = meRef.current
      if (next.near === "me" && found) {
        map.fitBounds(boundsOfRadius(found.lng, found.lat, next.r ?? DEFAULT_RADIUS), { padding: pad(), maxZoom: 13, duration: 1000 })
        return
      }
      const { camera } = initialMapView(next)
      if ("bounds" in camera) {
        // An explicit `maxZoom: undefined` breaks the fit (NaN center); leave it out instead.
        map.fitBounds(camera.bounds, camera.maxZoom === undefined ? { padding: pad(), duration: 1000 } : { padding: pad(), maxZoom: camera.maxZoom, duration: 1000 })
      }
      else map.flyTo({ center: [camera.longitude, camera.latitude], zoom: camera.zoom, duration: 1000 })
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  /**
   * The viewer shared their position: show the radius around them and put
   * near=me (never coordinates) in the URL.
   */
  const handleLocate = useCallback(
    (position: { lng: number; lat: number }) => {
      setMe(position)
      const r = params.r ?? DEFAULT_RADIUS
      mapRef.current?.fitBounds(boundsOfRadius(position.lng, position.lat, r), { padding: pad(), maxZoom: 13, duration: 1400 })
      if (params.near !== "me") writeView(nearMeParams(r), { history: "push" })
    },
    [params.r, params.near, writeView],
  )

  /**
   * Locating failed. A near=me link without a position is no view at all,
   * so drop it; but a failed re-tap keeps the radius the viewer already has.
   */
  const handleLocateError = useCallback(() => {
    if (params.near === "me" && !me) writeView({ near: null, r: null }, { history: "replace" })
  }, [params.near, me, writeView])

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

  /**
   * Opens a location's details from a list (search or results), as a new
   * history entry, and brings it into view.
   */
  const showLocation = (feat: LocationFeature) => {
    const map = mapRef.current
    const [lng, lat] = feat.geometry.coordinates
    if (map && !map.getBounds().contains([lng, lat])) {
      // `offset`, not `padding`: flyTo keeps padding on the map, and every
      // later fitBounds would add it to its own.
      const p = pad()
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), offset: [(p.left - p.right) / 2, (p.top - p.bottom) / 2], duration: 1200 })
    }
    dispatch({ type: "showDetails", location: toSelected(feat) })
    void setParams({ location: feat.properties.id }, { history: "push" }).then((search) => {
      pushedDetails.current = search.toString()
    })
  }

  /** The results' radius toggle: the same place, a wider or narrower circle. */
  const handleRadiusChange = (r: (typeof RADII)[number]) => {
    if (!place) return
    writeView({ r }, { history: "replace" })
    mapRef.current?.fitBounds(boundsOfRadius(place.lng, place.lat, r), { padding: pad(), maxZoom: 13, duration: 1000 })
  }

  /** The type chips: which kinds the map and lists show, all of them when every chip is on. */
  const handleKindsChange = (next: LocationKind[]) => {
    void setParams({ types: next.length === LOCATION_KINDS.length ? null : next }, { history: "replace" })
  }

  /**
   * A search result was picked, as in the prototype's choosePlace: an area
   * becomes the place (radius) or the state in the URL, a new history entry,
   * and the map flies there; a location opens its details.
   */
  const handleSearchPick = (pick: PlacePick) => {
    const map = mapRef.current
    if (pick.type === "location") {
      showLocation(pick.feature)
      return
    }
    const { area } = pick
    if (area.kind === "state" && area.state && Object.hasOwn(STATES, area.state)) {
      handleStateSelect(area.state)
      map?.fitBounds(STATES[area.state].bounds, { padding: pad(), maxZoom: 7.5, duration: 1400 })
      return
    }
    dispatch({ type: "closeDetails" })
    const r = params.r ?? DEFAULT_RADIUS
    writeView(
      { q: area.label, lng: roundPlace(area.lng), lat: roundPlace(area.lat), r, state: null, z: null, near: null, location: null },
      { history: "push" },
    )
    map?.fitBounds(boundsOfRadius(area.lng, area.lat, r), { padding: pad(), maxZoom: 13, duration: 1400 })
  }

  /** The search box's ✕: back to the whole US, as a new view. */
  const handleSearchClear = () => {
    setQuery("")
    if (!params.q && !params.state && !params.near) return
    dispatch({ type: "closeDetails" })
    writeView({ q: null, lat: null, lng: null, r: null, z: null, state: null, near: null, location: null }, { history: "push" })
    mapRef.current?.fitBounds(US_BOUNDS, { padding: pad(), duration: 1400 })
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
    const { longitude: lng, latitude: lat, zoom: z } = e.viewState
    const near: [number, number] | undefined = z >= POINT_ZOOM ? [Math.round(lng * 10) / 10, Math.round(lat * 10) / 10] : undefined
    setSearchNear((prev) => (prev?.[0] === near?.[0] && prev?.[1] === near?.[1] ? prev : near))
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
          fitBoundsOptions: camera.maxZoom === undefined ? { padding: cameraPadding() } : { padding: cameraPadding(), maxZoom: camera.maxZoom },
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
        attributionControl={{ compact: true, customAttribution: "Outlines: Natural Earth, US Census" }}
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
        <MapShading colors={colors} states={states} max={max} bounds={bounds} onStateSelect={handleStateSelect} />
        <Source id={SOURCES.radius} type="geojson" data={area}>
          <Layer {...radius.fill} />
          <Layer {...radius.line} />
        </Source>
        <LocationLayers collection={inView} selected={selected} colors={colors} onSelect={handleDotSelect} />
        <FullscreenControl position="bottom-right" />
        <LocateControl onLocate={handleLocate} onError={handleLocateError} autoLocate={view.nearMe} />
        <NavigationControl position="bottom-right" showCompass={false} />
        {/* The left panel, as in the prototype: search, type chips, then the list for the view. */}
        <MapPanel
          search={
            <PlaceSearch
              query={query}
              onQueryChange={setQuery}
              onPick={handleSearchPick}
              onClear={handleSearchClear}
              placeholder="Search city or address"
              kinds={kinds}
              retailers={retailers ?? undefined}
              radius={placeRadius}
              near={searchNear}
              locations
              leading={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  className="-ml-1.5 size-8 shrink-0 sm:hidden"
                  aria-label="Open navigation"
                  aria-controls={APP_NAV_ID}
                  aria-expanded={isSidebarOpen}
                >
                  <MenuIcon className="size-5" aria-hidden />
                </Button>
              }
            />
          }
          kinds={kinds}
          kindTotals={kindTotals}
          onKindsChange={handleKindsChange}
          sheetLabel="Results"
          sheet={
            place && (
              <ResultsSheet
                label={nearMe ? null : (urlView.place?.label ?? null)}
                radius={place.radius as (typeof RADII)[number]}
                onRadiusChange={handleRadiusChange}
                kinds={kinds}
                nearby={nearby}
                selectedId={selected?.id}
                onOpen={showLocation}
              />
            )
          }
        />
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
          // Centered on the map right of the panel; below the legend while they'd overlap.
          className={cn("sm:left-[calc(50%+186px)]", states && zoomedOut && (session ? "md:max-xl:top-[156px]" : "md:max-xl:top-[92px]"))}
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
