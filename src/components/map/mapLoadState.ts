import { classifyMapError, type MapFailure } from "./MapErrorBoundary"

/** Whether the map has started: loading until MapLibre's `load`, or failed (and why). */
export type MapLoadState = { status: "loading" } | { status: "loaded" } | { status: "failed"; failure: MapFailure }

export const INITIAL_LOAD_STATE: MapLoadState = { status: "loading" }

/** What MapLibre (or react-maplibre, while starting the map) reports. */
export type MapLoadEvent =
  | { type: "load" }
  | { type: "error"; error: unknown; sourceId?: string; tile?: unknown }

/**
 * The next load state for an event.
 *
 * - `load` wins, whenever it comes.
 * - A tile, sprite or glyph error (it names a source or tile) doesn't stop
 *   the map: MapLibre still counts that tile as loaded and fires `load`.
 * - Any other error before `load` means the map couldn't start: the style
 *   didn't arrive, or react-maplibre couldn't load MapLibre or create the
 *   map (it reports those through `onError`, not by throwing to the error
 *   boundary). It gets the message for its cause (classifyMapError).
 * - Errors after `load` are only logged.
 */
export function nextLoadState(state: MapLoadState, event: MapLoadEvent): MapLoadState {
  if (event.type === "load") return { status: "loaded" }
  if (state.status !== "loading") return state
  if (event.sourceId !== undefined || event.tile !== undefined) return state
  return { status: "failed", failure: classifyMapError(event.error) }
}
