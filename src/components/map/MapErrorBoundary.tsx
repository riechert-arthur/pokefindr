"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { MapStatus } from "./MapStatus"

/** Why the map couldn't start. Each reason has its own message. */
export type MapFailure = "library" | "webgl" | "crash"

/** Wording from the redesign prototype. */
export const MAP_FAILURE_MESSAGES: Record<MapFailure, string> = {
  library: "The map library didn't load. Check your connection and reload.",
  webgl: "This browser couldn't start the map (WebGL is off or unavailable).",
  crash: "The map stopped working. Reload to try again.",
}

/**
 * Sorts an error thrown while loading or running the map: a chunk that
 * didn't download, no WebGL, or anything else.
 */
export function classifyMapError(error: unknown): MapFailure {
  const name = error instanceof Error ? error.name : ""
  const message = error instanceof Error ? error.message : String(error)
  if (name === "ChunkLoadError" || /loading (css )?chunk|dynamically imported module|failed to fetch/i.test(message)) {
    return "library"
  }
  if (/webgl/i.test(message)) return "webgl"
  return "crash"
}

interface Props {
  children: ReactNode
}

interface State {
  failure: MapFailure | null
}

/**
 * Catches errors from the map and everything drawn on it, and shows a
 * message with a reload button instead of a blank page.
 */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { failure: null }

  static getDerivedStateFromError(error: unknown): State {
    return { failure: classifyMapError(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[map] crashed", error, info.componentStack)
  }

  render() {
    if (this.state.failure) {
      return <MapStatus kind="error">{MAP_FAILURE_MESSAGES[this.state.failure]}</MapStatus>
    }
    return this.props.children
  }
}
