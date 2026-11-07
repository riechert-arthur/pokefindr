"use client"

import { useSyncExternalStore, type FC } from "react"
import dynamic from "next/dynamic"
import { MapErrorBoundary, MAP_FAILURE_MESSAGES } from "./MapErrorBoundary"
import { MapStatus } from "./MapStatus"
import type { MapInstanceProps } from "./MapInstance"
import { initialMapView, type InitialMapView } from "@/lib/map/initial-view"
import type { LocationFeature } from "@/lib/types/locations"

const MapInstance = dynamic<MapInstanceProps>(() => import("./MapInstance"), {
  loading: () => <MapStatus kind="loading">Loading the map…</MapStatus>,
  ssr: false,
})

let webglSupported: boolean | undefined

/** Whether the browser can create a WebGL context. Checked once per page load. */
export function hasWebGL(): boolean {
  if (webglSupported === undefined) {
    try {
      const canvas = document.createElement("canvas")
      webglSupported = Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
    } catch {
      webglSupported = false
    }
  }
  return webglSupported
}

const noSubscribe = () => () => {}

interface MapLoaderProps {
  /** Where the map starts, from the URL (see initialMapView). */
  view?: InitialMapView
  /** The location a shared link opens, looked up on the server. */
  location?: LocationFeature | null
}

const DEFAULT_VIEW = initialMapView({
  q: null, lat: null, lng: null, r: null, z: null, state: null, types: null, retailer: null, location: null, near: null,
})

export const MapLoader: FC<MapLoaderProps> = ({ view = DEFAULT_VIEW, location = null }) => {
  // Unknown (null) during server rendering and hydration, then the real answer.
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, () => null)

  return (
    <div className="relative h-screen">
      {webgl === false ? (
        <MapStatus kind="error">{MAP_FAILURE_MESSAGES.webgl}</MapStatus>
      ) : (
        <MapErrorBoundary>
          {webgl ? <MapInstance view={view} location={location} /> : <MapStatus kind="loading">Loading the map…</MapStatus>}
        </MapErrorBoundary>
      )}
    </div>
  )
}
