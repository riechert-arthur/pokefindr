"use client"

import type { FC } from "react"
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { debounce, useQueryStates } from "nuqs"
import { toast } from "sonner"
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
import { MenuIcon, PlusIcon } from "lucide-react"
import { useRouter } from "@/i18n/navigation"
import { PlaceSearch, type PlacePick } from "@/components/search/PlaceSearch"
import { APP_NAV_ID } from "@/components/pokefindr/AppRail"
import { Button } from "@/components/ui/button"
import { LOCATION_KINDS, type LocationFeature, type LocationFeatureProperties, type LocationKind } from "@/lib/types/locations"
import { LocationPopup, type LocationPopupProps } from "./LocationPinPopUps"
import { useSidebar } from "../providers/SidebarContextProvider"
import { UserMenu } from "@/components/pokefindr/UserMenu"
import { useSessionContext } from "../providers/SessionProvider"
import { useIsDark, useThemeKey } from "@/lib/design/useThemeKey"
import { MapFailed, MapLoading } from "./MapStatus"
import { LAYERS, POINT_ZOOM, SOURCES, radiusLayers, readMapColors } from "./layers"
import { LocationLayers } from "./LocationLayers"
import { NO_SELECTION, selectionReducer, type Selection } from "./selection"
import { StateLegend } from "./StateLayers"
import { MapShading } from "./MapShading"
import { useStateShading } from "./useStateShading"
import { cameraPadding } from "./camera"
import { MapPanel } from "./MapPanel"
import { LocationDetails } from "./LocationDetails"
import { RetailerFilter } from "./RetailerFilter"
import { ResultsSheet } from "./ResultsSheet"
import { useNearbyLocations } from "./useNearbyLocations"
import { StateSheet } from "./StateSheet"
import { useStateCities } from "./useStateCities"
import { useHighlights } from "./useHighlights"
import { HighlightMarkers } from "./HighlightMarkers"
import { RouteOverlay } from "./RouteOverlay"
import { UsSheet, type StateTotal } from "./UsSheet"
import { AddPlaceSheet, type Pin } from "./AddPlaceSheet"
import { AddPin, PendingMarkers, useMySubmissions } from "./MySubmissions"
import type { MySubmission } from "@/lib/submissions/schemas"
import type { Hotspot, UpcomingEvent } from "@/lib/types/highlights"
import { cn } from "@/lib/utils"
import { boundsOfRadius, milesBetween, radiusCircle, US_BOUNDS } from "@/lib/map/geo"
import { STATES } from "@/lib/map/states"
import { DEFAULT_RADIUS, RADII, loadMapSearchParams, mapSearchParams, nearMeParams, roundCamera, roundPlace, roundZoom, type MapSearchParams } from "@/lib/map/url-state"
import { initialMapView, shownKinds, viewKey, type InitialMapView } from "@/lib/map/initial-view"
import { INITIAL_LOAD_STATE, nextLoadState, type MapLoadState } from "./mapLoadState"
import { track } from "@/lib/analytics"
import { useTranslations } from "next-intl"
import { useStateName } from "./useStateName"

type SelectedLocation = Omit<LocationPopupProps, "onClose" | "onDetails">

const toSelected = (feat: LocationFeature): SelectedLocation => {
  const [longitude, latitude] = feat.geometry.coordinates
  const { id, retailer, address, city, state, machineID, kind } = feat.properties
  return { longitude, latitude, id, retailer, address, city, state, machineID, kind }
}

/** What the search box shows for the URL's view: the place, the state, or "Your location" (`yourLocation`). */
const searchLabel = (params: MapSearchParams, yourLocation: string, stateName: (code: string) => string): string =>
  params.near === "me" ? yourLocation : params.q ? params.q : params.state && Object.hasOwn(STATES, params.state) ? stateName(params.state) : ""

type Box = readonly [readonly [number, number], readonly [number, number]]
const overlaps = ([[w1, s1], [e1, n1]]: Box, [[w2, s2], [e2, n2]]: Box) => w1 <= e2 && w2 <= e1 && s1 <= n2 && s2 <= n1

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
  /** `sheet`: the fit opens a list in the panel (a place's results, a location's details). */
  const pad = (sheet = false) => cameraPadding(mapRef.current?.getContainer(), { sheet })
  const [params, setParams] = useQueryStates(mapSearchParams)
  // The selected location (ring), its popup, and whose details panel is open (see selectionReducer).
  // A shared location= link opens with its details.
  const [{ selected, popup, details }, dispatch] = useReducer(
    selectionReducer<SelectedLocation>,
    location ? toSelected(location) : null,
    (initial): Selection<SelectedLocation> => (initial ? { selected: initial, popup: false, details: initial } : NO_SELECTION),
  )
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const { session, isLoading: sessionLoading } = useSessionContext()
  const router = useRouter()
  const t = useTranslations("map")
  const stateName = useStateName()
  // For error toasts in effects, so a new translator doesn't refetch.
  const tRef = useRef(t)
  tRef.current = t
  // MapInstance is client-only (MapLoader uses ssr: false), so this is right on first render.
  const isDark = useIsDark()
  // MapLibre's own controls in the page's language. It reads these when the map
  // is created; switching language loads a new page.
  const mapLocale = useMemo(
    () => ({
      "NavigationControl.ZoomIn": t("controls.zoomIn"),
      "NavigationControl.ZoomOut": t("controls.zoomOut"),
      "NavigationControl.ResetBearing": t("controls.resetNorth"),
      "GeolocateControl.FindMyLocation": t("controls.findMyLocation"),
      "GeolocateControl.LocationNotAvailable": t("controls.locationNotAvailable"),
      "FullscreenControl.Enter": t("controls.enterFullscreen"),
      "FullscreenControl.Exit": t("controls.exitFullscreen"),
      "AttributionControl.ToggleAttribution": t("controls.toggleAttribution"),
      "AttributionControl.MapFeedback": t("controls.mapFeedback"),
      "Popup.Close": t("controls.closePopup"),
      "Map.Title": t("controls.map"),
      "Marker.Title": t("controls.marker"),
    }),
    [t],
  )
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

  const { states, max, total, bounds, kindTotals } = useStateShading(kindSet, retailers)
  // The results list for the place (or the viewer), closest first.
  const nearby = useNearbyLocations(place, kinds, retailers)
  // A state's busiest cities, while the view is a state.
  const stateFocus = !place && !nearMe ? urlView.state : null
  const stateCities = useStateCities(stateFocus, kinds, retailers)
  // Hotspots and events for the US view.
  const highlights = useHighlights()
  const stateTotals = useMemo<StateTotal[]>(
    () =>
      (states?.features ?? [])
        .filter((f) => f.properties.region)
        .map((f) => ({ code: f.properties.region, count: f.properties.count }))
        .sort((a, b) => b.count - a.count),
    [states],
  )
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
  const [query, setQuery] = useState(() => searchLabel(params, t("search.yourLocation"), stateName))
  // Where search ranks nearby results first: the map's center once zoomed in, to ~10 km.
  const [searchNear, setSearchNear] = useState<[number, number] | undefined>()

  const [zoomedOut, setZoomedOut] = useState(true)
  // Loading until MapLibre's load event; failed if the map can't start (see nextLoadState).
  const [loadState, setLoadState] = useState<MapLoadState>(INITIAL_LOAD_STATE)
  // Set when the viewer starts moving the map (not when the app flies it).
  const userMoving = useRef(false)

  // The details panel follows `location=` (a shared link, Back or Forward).
  // A location in view opens at once; any other comes from /api/locations/<id>
  // (the map no longer loads every location, #201).
  // globalThis: `Map` here is the map component from ./engine.
  const knownLocations = useMemo(() => new globalThis.Map(viewport.features.map((f) => [f.properties.id, f])), [viewport.features])
  useEffect(() => {
    const id = params.location
    if (!id) {
      dispatch({ type: "closeDetails" })
      pushedDetails.current = null
      return
    }
    const feature = knownLocations.get(id)
    if (feature) {
      dispatch({ type: "showDetails", location: toSelected(feature) })
      return
    }
    if (detailsRef.current?.id === id) return
    // Don't leave another location's details and ring up while this one loads.
    if (detailsRef.current) {
      dispatch({ type: "closeDetails" })
      dispatch({ type: "closePopup" })
    }
    const controller = new AbortController()
    fetch(`/api/locations/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404 || res.status === 400) return null
        if (!res.ok) throw new Error(`GET /api/locations/${id} failed (${res.status})`)
        return (await res.json()) as LocationFeature
      })
      .then((found) => {
        if (controller.signal.aborted) return
        if (found) dispatch({ type: "showDetails", location: toSelected(found) })
        // Gone or never there: a link to nothing shouldn't stay in the URL.
        else void setParams({ location: null }, { history: "replace" })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        console.error("[map] couldn't load the location", err)
        toast.error(tRef.current("loadPlaceFailed"), { description: tRef.current("connection") })
        void setParams({ location: null }, { history: "replace" })
      })
    return () => controller.abort()
  }, [params.location, knownLocations, setParams])

  // A new view (a pick, Back or Forward) puts its label in the search box.
  // Keyed on the label, so a pan (a camera-only URL write) keeps what the
  // viewer typed.
  // A pan that drops `state=` changes the label too, but the viewer may be
  // typing: then keep their text.
  const viewLabel = searchLabel(params, t("search.yourLocation"), stateName)
  const shownLabel = useRef(viewLabel)
  const leftStateByPan = useRef(false)
  useEffect(() => {
    const keepTyped = leftStateByPan.current
    // Read now: the updater runs later, after the ref has moved on.
    const previous = shownLabel.current
    leftStateByPan.current = false
    shownLabel.current = viewLabel
    setQuery((q) => (keepTyped && q !== previous ? q : viewLabel))
  }, [viewLabel])

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
        map.fitBounds(boundsOfRadius(found.lng, found.lat, next.r ?? DEFAULT_RADIUS), { padding: pad(true), maxZoom: 13, duration: 1000 })
        return
      }
      const { camera } = initialMapView(next)
      if ("bounds" in camera) {
        // An explicit `maxZoom: undefined` breaks the fit (NaN center); leave it out instead.
        // Every view has a list in the panel: a place's results, a state's cities, the US highlights.
        const padding = pad(true)
        map.fitBounds(camera.bounds, camera.maxZoom === undefined ? { padding, duration: 1000 } : { padding, maxZoom: camera.maxZoom, duration: 1000 })
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
      mapRef.current?.fitBounds(boundsOfRadius(position.lng, position.lat, r), { padding: pad(true), maxZoom: 13, duration: 1400 })
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
      dispatch({ type: "select", location: toSelected(feat) })
      // Another location's details are in the URL (open, or still loading):
      // drop them, which also cancels a load that would replace this pick.
      const named = new URLSearchParams(window.location.search).get("location")
      if (named && named !== feat.properties.id) void setParams({ location: null })
    },
    [setParams],
  )

  /** A dot was clicked: popup and ring, without moving the map. */
  const handleDotSelect = select
  const ignoreSelect = useCallback(() => {}, [])

  /**
   * Opens a location's details from a list (search or results), as a new
   * history entry, and brings it into view. `replace` (Also nearby) swaps the
   * open details in place, so Back still returns to the list they came from.
   */
  const showLocation = (feat: LocationFeature, { replace = false, from = "list" as "list" | "search" | "nearby" } = {}) => {
    track("details_open", { kind: feat.properties.kind ?? "vending", from })
    const map = mapRef.current
    const [lng, lat] = feat.geometry.coordinates
    if (map) {
      // Into view beside the panel, with its dot showing: zoomed out past
      // the dots (a pick from the US view) or hidden behind the panel, it flies.
      const p = pad(true)
      const { x, y } = map.project([lng, lat])
      const { clientWidth: w, clientHeight: h } = map.getContainer()
      const visible = x >= p.left && x <= w - p.right && y >= p.top && y <= h - p.bottom
      if (!visible || map.getZoom() < POINT_ZOOM) {
        // `offset`, not `padding`: flyTo keeps padding on the map, and every
        // later fitBounds would add it to its own.
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), offset: [(p.left - p.right) / 2, (p.top - p.bottom) / 2], duration: 1200 })
      }
    }
    const swap = replace && detailsRef.current !== null
    // Closing steps back only if the entry being replaced was one we pushed.
    const wasPushed = pushedDetails.current !== null && pushedDetails.current === new URLSearchParams(window.location.search).toString()
    dispatch({ type: "showDetails", location: toSelected(feat) })
    void setParams({ location: feat.properties.id }, { history: swap ? "replace" : "push" }).then((search) => {
      if (!swap || wasPushed) pushedDetails.current = search.toString()
    })
  }

  /** The results' radius toggle: the same place, a wider or narrower circle. */
  const handleRadiusChange = (r: (typeof RADII)[number]) => {
    if (!place) return
    track("filter_change", { filter: "radius", value: String(r) })
    writeView({ r }, { history: "replace" })
    mapRef.current?.fitBounds(boundsOfRadius(place.lng, place.lat, r), { padding: pad(true), maxZoom: 13, duration: 1000 })
  }

  /** The Filters popover: which vending retailers to show, all of them when none are picked. */
  const handleRetailersChange = (next: string[]) => {
    track("filter_change", { filter: "retailers", value: next.length ? [...next].sort().join(",") : "all" })
    void setParams({ retailer: next.length ? next : null }, { history: "replace" })
  }

  /** The type chips: which kinds the map and lists show, all of them when every chip is on. */
  const handleKindsChange = (next: LocationKind[]) => {
    track("filter_change", { filter: "kinds", value: next.length === LOCATION_KINDS.length ? "all" : [...next].sort().join(",") })
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
      showLocation(pick.feature, { from: "search" })
      return
    }
    const { area } = pick
    if (area.kind === "state" && area.state && Object.hasOwn(STATES, area.state)) {
      handleStateSelect(area.state)
      map?.fitBounds(STATES[area.state].bounds, { padding: pad(true), maxZoom: 7.5, duration: 1400 })
      return
    }
    dispatch({ type: "closeDetails" })
    const r = params.r ?? DEFAULT_RADIUS
    writeView(
      // A new search replaces an assistant route, as the prototype's choosePlace does.
      { q: area.label, lng: roundPlace(area.lng), lat: roundPlace(area.lat), r, state: null, z: null, near: null, location: null, route: null },
      { history: "push" },
    )
    map?.fitBounds(boundsOfRadius(area.lng, area.lat, r), { padding: pad(true), maxZoom: 13, duration: 1400 })
  }

  /** A hotspot or event (marker or list row): open its city, as the prototype does. */
  const openHotspot = (h: Hotspot) =>
    handleSearchPick({ type: "area", area: { label: `${h.city}, ${h.state}`, lng: h.lng, lat: h.lat, kind: "city", state: h.state } })
  const openEvent = (e: UpcomingEvent) =>
    handleSearchPick({ type: "area", area: { label: [e.city, e.state].filter(Boolean).join(", ") || e.title, lng: e.lng, lat: e.lat, kind: "city", state: e.state } })
  const openState = (code: string) =>
    handleSearchPick({ type: "area", area: { label: stateName(code), lng: 0, lat: 0, kind: "state", state: code } })

  /** The search box's ✕: back to the whole US, as a new view. */
  const handleSearchClear = () => {
    setQuery("")
    if (!params.q && !params.state && !params.near && !params.route) return
    dispatch({ type: "closeDetails" })
    writeView({ q: null, lat: null, lng: null, r: null, z: null, state: null, near: null, location: null, route: null }, { history: "push" })
    mapRef.current?.fitBounds(US_BOUNDS, { padding: pad(true), duration: 1400 })
  }

  // Add a place (#125): open while `add=` is in the URL (the tab bar links to
  // /map?add=1). The pin stays out of the URL.
  const adding = params.add !== null
  const addKind = params.add === "shop" || params.add === "event" ? params.add : null
  const [addPin, setAddPin] = useState<Pin | null>(null)
  const [addStep, setAddStep] = useState(0)
  /**
   * The entry startAdding pushed (its URL and the history length then), so
   * closing goes Back to before it, but only while it's still the current
   * entry: a search or Locate while adding pushes past it.
   */
  const pushedAdd = useRef<{ search: string; length: number } | null>(null)
  // Leaving by any route (Back, a link): start over next time.
  useEffect(() => {
    if (adding) return
    setAddPin(null)
    setAddStep(0)
  }, [adding])
  const { submissions, refresh: refreshSubmissions } = useMySubmissions(Boolean(session))
  const startAdding = () => {
    if (!session) {
      toast(t("addSignedOut.title"), {
        description: t("addSignedOut.body"),
        action: { label: t("addSignedOut.login"), onClick: () => router.push("/login") },
      })
      return
    }
    dispatch({ type: "closeDetails" })
    void setParams({ add: "1", location: null }, { history: "push" }).then((search) => {
      pushedAdd.current = { search: search.toString(), length: window.history.length }
    })
  }
  /**
   * Closes Add a place. Cancel goes Back to before + (when that entry is still
   * current); after sending (`stay`), it stays where the person put the pin,
   * so their new pending marker is in view.
   */
  const stopAdding = ({ stay = false }: { stay?: boolean } = {}) => {
    setAddPin(null)
    const pushed = pushedAdd.current
    pushedAdd.current = null
    // Camera moves and the kind replace the entry's URL without making a new one.
    const view = (search: string) => {
      const p = new URLSearchParams(search)
      for (const k of ["add", "lat", "lng", "z"]) if (!(k === "lat" || k === "lng") || !p.has("q")) p.delete(k)
      p.sort()
      return p.toString()
    }
    const stillOnIt = pushed !== null && window.history.length === pushed.length && view(window.location.search) === view(pushed.search)
    // Opened here with +, and still on that entry: go back to the one before it. Otherwise just drop add=.
    if (stillOnIt && !stay) window.history.back()
    else void setParams({ add: null }, { history: "replace" })
  }
  const moveAddPin = (pin: Pin, fly = false) => {
    setAddPin(pin)
    const map = mapRef.current
    if (fly && map) map.flyTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 15), padding: pad(true), duration: 1200 })
  }
  const openSubmission = (s: MySubmission) =>
    mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: Math.max(mapRef.current.getZoom(), 14), padding: pad(true), duration: 1200 })

  /** Details are a new view: a new history entry, so Back closes them. */
  const openDetails = () => {
    if (!selected) return
    track("details_open", { kind: selected.kind ?? "vending", from: "map" })
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
      writeView({ state: code, q: null, lat: null, lng: null, r: null, z: null, near: null, location: null, route: null }, { history: "push" })
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
    // A place's radius (or near=me) still frames the results, so they stay.
    if (place || params.near) return
    // A state stays while the viewer looks around in it: while the part of
    // the map beside the panel still overlaps it. (Right after a padded fit
    // the map's own center can be outside a small state.)
    if (stateFocus && Object.hasOwn(STATES, stateFocus)) {
      const map = e.target
      const p = pad(true)
      const { clientWidth: w, clientHeight: h } = map.getContainer()
      const nw = map.unproject([p.left, p.top])
      const se = map.unproject([w - p.right, h - p.bottom])
      const seen: Box = [[nw.lng, se.lat], [se.lng, nw.lat]]
      if (overlaps(seen, STATES[stateFocus].bounds)) return
    }
    // Otherwise the camera is the view, so a copied link opens where the viewer is looking.
    if (stateFocus) leftStateByPan.current = true
    writeView(
      { ...(stateFocus ? { state: null } : {}), lat: roundCamera(lat), lng: roundCamera(lng), z: roundZoom(z) },
      { limitUrlUpdates: debounce(CAMERA_URL_DEBOUNCE_MS) },
    )
  }

  const { camera } = view
  const initialViewState =
    "bounds" in camera
      ? {
          bounds: camera.bounds,
          // An explicit `maxZoom: undefined` overrides MapLibre's default and breaks the fit.
          fitBoundsOptions:
            camera.maxZoom === undefined
              ? { padding: cameraPadding(undefined, { sheet: true }) }
              : { padding: cameraPadding(undefined, { sheet: true }), maxZoom: camera.maxZoom },
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
        attributionControl={{ compact: true, customAttribution: t("attribution") }}
        locale={mapLocale}
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
          // Adding a place: on the location step, a click on the map (not on a marker) drops the pin there.
          if (adding) {
            const onMarker = (e.originalEvent.target as Element | null)?.closest?.(".maplibregl-marker")
            if (session && addStep === 1 && !onMarker) setAddPin({ lng: e.lngLat.lng, lat: e.lngLat.lat })
            return
          }
          // A click off the dots closes the popup, as MapLibre popups do by default.
          const hit = e.target.getLayer(LAYERS.placeDots) && e.target.queryRenderedFeatures(e.point, { layers: [LAYERS.placeDots] }).length
          if (!hit) dispatch({ type: "closePopup" })
        }}
      >
        {/* While adding a place, clicks place the pin: states and dots don't open. */}
        <MapShading colors={colors} states={states} max={max} bounds={bounds} onStateSelect={adding ? undefined : handleStateSelect} />
        <Source id={SOURCES.radius} type="geojson" data={area}>
          <Layer {...radius.fill} />
          <Layer {...radius.line} />
        </Source>
        {highlights && zoomedOut && <HighlightMarkers highlights={highlights} kinds={kinds} onHotspot={openHotspot} onEvent={openEvent} />}
        <LocationLayers collection={inView} selected={selected} colors={colors} onSelect={adding ? ignoreSelect : handleDotSelect} />
        {submissions && <PendingMarkers submissions={submissions} onOpen={openSubmission} />}
        {adding && addPin && <AddPin pin={addPin} kind={addKind} onMove={moveAddPin} />}
        {params.route && params.route.length >= 2 && <RouteOverlay ids={params.route} colors={colors} onClear={() => void setParams({ route: null })} />}
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
              placeholder={t("search.placeholder")}
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
                  aria-label={t("search.openNavigation")}
                  aria-controls={APP_NAV_ID}
                  aria-expanded={isSidebarOpen}
                >
                  <MenuIcon className="size-5" aria-hidden />
                </Button>
              }
            />
          }
          filter={
            <>
              <RetailerFilter selected={retailers ?? []} onChange={handleRetailersChange} vendingShown={kindSet.has("vending")} />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={adding ? () => stopAdding() : startAdding}
                aria-pressed={adding}
                aria-label={t("add")}
                title={t("add")}
                className="size-[42px] shrink-0 rounded-xl bg-card shadow-md aria-pressed:bg-muted"
              >
                <PlusIcon className="size-5" aria-hidden />
              </Button>
            </>
          }
          kinds={kinds}
          kindTotals={kindTotals}
          onKindsChange={handleKindsChange}
          sheetLabel={adding ? t("panel.add") : details ? details.retailer : place ? t("panel.results") : stateFocus ? stateName(stateFocus) : t("panel.us")}
          sheet={
            adding ? (
              session ? (
                <AddPlaceSheet
                  initialKind={addKind}
                  pin={addPin}
                  onPinChange={(pin) => moveAddPin(pin, true)}
                  onKindChange={(kind) => void setParams({ add: kind }, { history: "replace" }).then((search) => {
                    if (pushedAdd.current !== null) pushedAdd.current = { ...pushedAdd.current, search: search.toString() }
                  })}
                  onStepChange={setAddStep}
                  onCancel={() => stopAdding()}
                  onSubmitted={({ name }) => {
                    toast.success(t("sent.title"), { description: t("sent.body", { name }) })
                    stopAdding({ stay: true })
                    refreshSubmissions()
                  }}
                />
              ) : (
                !sessionLoading && (
                  <div className="flex flex-col gap-3 p-4">
                    <h2 className="text-heading text-foreground">{t("panel.add")}</h2>
                    <p className="text-body text-muted-foreground">{t("addSignedOut.panelBody")}</p>
                    <div className="flex gap-2">
                      <Button type="button" onClick={() => router.push("/login")}>{t("addSignedOut.login")}</Button>
                      <Button type="button" variant="ghost" onClick={() => stopAdding()}>{t("addSignedOut.cancel")}</Button>
                    </div>
                  </div>
                )
              )
            ) : details ? (
              <LocationDetails
                key={details.id}
                location={details}
                backLabel={
                  place
                    ? nearMe
                      ? t("back.nearYou")
                      : urlView.place
                        ? t("back.to", { place: urlView.place.label })
                        : t("back.results")
                    : stateFocus
                      ? t("back.to", { place: stateName(stateFocus) })
                      : t("back.plain")
                }
                onBack={closeDetails}
                me={me}
                from={place && !nearMe && urlView.place ? { label: urlView.place.label, lng: place.lng, lat: place.lat } : null}
                kinds={kinds}
                retailers={retailers}
                onOpen={(f) => showLocation(f, { replace: true, from: "nearby" })}
              />
            ) : !place && !stateFocus ? (
              <UsSheet
                highlights={highlights}
                states={stateTotals}
                kinds={kinds}
                onHotspot={openHotspot}
                onEvent={openEvent}
                onState={openState}
                submissions={submissions}
                onSubmission={openSubmission}
              />
            ) : stateFocus ? (
              <StateSheet
                code={stateFocus}
                name={stateName(stateFocus)}
                kinds={kinds}
                data={stateCities}
                onBack={handleSearchClear}
                onCity={(c) => handleSearchPick({ type: "area", area: { label: `${c.city}, ${stateFocus}`, lng: c.lng, lat: c.lat, kind: "city", state: stateFocus } })}
              />
            ) : (
              place && (
              <ResultsSheet
                label={nearMe ? null : (urlView.place?.label ?? null)}
                radius={place.radius as (typeof RADII)[number]}
                onRadiusChange={handleRadiusChange}
                kinds={kinds}
                nearby={nearby}
                selectedId={selected?.id}
                onOpen={(f) => showLocation(f)}
              />
              )
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
      {loadState.status === "loading" && <MapLoading className="absolute inset-0 z-10" />}
      {loadState.status === "failed" && <MapFailed failure={loadState.failure} className="absolute inset-0 z-10" />}
    </>
  )
}

export default MapInstance
