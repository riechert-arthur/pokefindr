"use client"

import { useSyncExternalStore, type FC } from "react"
import dynamic from "next/dynamic"
import { MapErrorBoundary } from "./MapErrorBoundary"
import { hasWebGL } from "@/lib/map/webgl"
import { MapFailed, MapLoading } from "./MapStatus"
import type { MapInstanceProps } from "./MapInstance"
import { initialMapView, type InitialMapView } from "@/lib/map/initial-view"
import type { LocationFeature } from "@/lib/types/locations"

const MapInstance = dynamic<MapInstanceProps>(() => import("./MapInstance"), {
  loading: () => <MapLoading />,
  ssr: false,
})


const noSubscribe = () => () => {}

interface MapLoaderProps {
  /** Where the map starts, from the URL (see initialMapView). */
  view?: InitialMapView
  /** The location a shared link opens, looked up on the server. */
  location?: LocationFeature | null
}

const DEFAULT_VIEW = initialMapView({
  q: null, lat: null, lng: null, r: null, z: null, state: null, types: null, retailer: null, location: null, near: null, route: null, add: null,
})

export const MapLoader: FC<MapLoaderProps> = ({ view = DEFAULT_VIEW, location = null }) => {
  // Unknown (null) during server rendering and hydration, then the real answer.
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, () => null)

  return (
    <div className="relative h-full">
      {webgl === false ? (
        <MapFailed failure="webgl" />
      ) : (
        <MapErrorBoundary>
          {webgl ? <MapInstance view={view} location={location} /> : <MapLoading />}
        </MapErrorBoundary>
      )}
    </div>
  )
}
