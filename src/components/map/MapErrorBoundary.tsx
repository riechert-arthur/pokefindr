"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { MapFailed } from "./MapStatus"

/** Why the map couldn't start. Each reason has its own message. */
export type MapFailure = "library" | "webgl" | "crash"

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
 * message with a reload button instead of a blank page (the messages are
 * map.failure in the catalog).
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
      return <MapFailed failure={this.state.failure} />
    }
    return this.props.children
  }
}
