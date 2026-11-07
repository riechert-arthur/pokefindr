"use client"

import { useSyncExternalStore, type FC } from "react"
import dynamic from "next/dynamic"
import { MapErrorBoundary, MAP_FAILURE_MESSAGES } from "./MapErrorBoundary"
import { MapStatus } from "./MapStatus"

const MapInstance = dynamic(() => import("./MapInstance"), {
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

export const MapLoader: FC = () => {
  // Unknown (null) during server rendering and hydration, then the real answer.
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, () => null)

  return (
    <div className="relative h-screen">
      {webgl === false ? (
        <MapStatus kind="error">{MAP_FAILURE_MESSAGES.webgl}</MapStatus>
      ) : (
        <MapErrorBoundary>
          {webgl ? <MapInstance /> : <MapStatus kind="loading">Loading the map…</MapStatus>}
        </MapErrorBoundary>
      )}
    </div>
  )
}
