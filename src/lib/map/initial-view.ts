import { boundsOfRadius, US_BOUNDS, type LngLatBounds } from "./geo"
import { STATES } from "./states"
import { DEFAULT_RADIUS, type MapSearchParams } from "./url-state"
import { LOCATION_KINDS, type LocationKind } from "@/lib/types/locations"

/** Where the map starts, as MapLibre's initialViewState takes it. */
export type InitialCamera =
  | { bounds: LngLatBounds; maxZoom?: number }
  | { longitude: number; latitude: number; zoom: number }

/** A searched place with a radius around it. */
export interface MapPlace {
  label: string
  lng: number
  lat: number
  radius: number
}

/** Coordinates of the location named by `location=`, looked up on the server. */
export interface InitialLocation {
  longitude: number
  latitude: number
}

export interface InitialMapView {
  camera: InitialCamera
  place: MapPlace | null
  /** Two-letter code of the state the map opened on. */
  state: string | null
}

const valid = (lng: number | null, lat: number | null): [number, number] | null =>
  lng !== null && lat !== null && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [lng, lat] : null

/** The zoom a shared location opens at. */
export const LOCATION_ZOOM = 14

/**
 * Turns the URL's parameters into the map's starting camera, so a shared
 * link opens on the same place with no flash of the US view. In order: a
 * location's details, a place and radius, a state, a camera, then the US.
 * `near=me` starts on the US; the viewer's position arrives after they allow it.
 */
export function initialMapView(params: MapSearchParams, location: InitialLocation | null = null): InitialMapView {
  const point = valid(params.lng, params.lat)
  const radius = params.r ?? DEFAULT_RADIUS
  const place: MapPlace | null =
    point && params.q && params.near === null ? { label: params.q, lng: point[0], lat: point[1], radius } : null
  const state = params.state && Object.hasOwn(STATES, params.state) ? params.state : null

  let camera: InitialCamera
  if (location) camera = { longitude: location.longitude, latitude: location.latitude, zoom: LOCATION_ZOOM }
  else if (place) camera = { bounds: boundsOfRadius(place.lng, place.lat, place.radius), maxZoom: 13 }
  else if (state) camera = { bounds: STATES[state].bounds, maxZoom: 7.5 }
  else if (point && params.z !== null && params.near === null)
    camera = { longitude: point[0], latitude: point[1], zoom: Math.min(Math.max(params.z, 1.2), 20) }
  else camera = { bounds: US_BOUNDS }

  return { camera, place, state }
}

/**
 * The kinds to show. A missing, empty or all-unknown `types` (the parser
 * drops kinds it doesn't know) means every kind, so a bad link never shows
 * an empty map.
 */
export function shownKinds(types: readonly LocationKind[] | null): readonly LocationKind[] {
  return types?.length ? types : LOCATION_KINDS
}

/**
 * The parameters that place the camera (place, state, near=me, a moved
 * camera), as one string. When Back or Forward changes it, the map moves to
 * the URL's view; when only `location`, `types` or `retailer` change, it stays.
 */
export function viewKey(params: MapSearchParams): string {
  const { q, lat, lng, r, z, state, near } = params
  return JSON.stringify([q, lat, lng, r, z, state, near])
}
