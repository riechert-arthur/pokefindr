/**
 * Map layer styles, from the redesign prototype. Colors come from the design
 * tokens (readTokens), so call these again when the theme changes.
 */
import type { ExpressionSpecification, LayerProps } from "./engine"
import { mixColors, readTokens } from "@/lib/design/tokens"
import { LOCATION_KINDS } from "@/lib/types/locations"
import { SUPPORTED_COUNTRY_NUMERIC } from "@/lib/map/countries"

/**
 * Below this zoom the map shades states by count; at and above it, it draws
 * individual locations. One number per state costs the same at 1,500 or
 * 150,000 locations.
 */
export const POINT_ZOOM = 6

export const SOURCES = {
  world: "world",
  radius: "radius",
  places: "places",
  selected: "selected",
  states: "states",
} as const

export const LAYERS = {
  worldFill: "world-fill",
  worldHover: "world-hover",
  worldLine: "world-line",
  radiusFill: "radius-fill",
  radiusLine: "radius-line",
  placeDots: "place-dots",
  selectedRing: "selected-ring",
  statesFill: "states-fill",
  statesHover: "states-hover",
  statesLine: "states-line",
} as const

const TOKENS = [
  "kind-vending", "kind-shop", "kind-event", "map-dot-ring", "foreground",
  "map-land", "map-line", "map-choro-hi", "map-radius", "map-unsupported", "map-unsupported-line",
] as const

export type MapColors = Record<(typeof TOKENS)[number], string>

/** The token colors the layers use, read once per theme. */
export const readMapColors = (): MapColors => readTokens(TOKENS)

/** One circle per location, colored by kind, from POINT_ZOOM up. */
export function placeDotsLayer(c: MapColors): LayerProps {
  return {
    id: LAYERS.placeDots,
    type: "circle",
    source: SOURCES.places,
    minzoom: POINT_ZOOM,
    paint: {
      "circle-color": [
        "match", ["get", "kind"], ...LOCATION_KINDS.flatMap((k) => [k, c[`kind-${k}`]]), c["kind-vending"],
      ] as unknown as ExpressionSpecification,
      // Vending machines are the most numerous, so they start smaller.
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, ["case", ["==", ["get", "kind"], "vending"], 3.5, 5], 12, 7, 16, 10],
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 6, 1.5, 14, 2.5],
      "circle-stroke-color": c["map-dot-ring"],
      // Locations outside the search radius fade back.
      "circle-opacity": ["case", ["boolean", ["get", "dim"], false], 0.3, 1],
      "circle-stroke-opacity": ["case", ["boolean", ["get", "dim"], false], 0.3, 1],
    },
  }
}

/** The search radius: a faint fill and a dashed edge. */
export function radiusLayers(c: MapColors): { fill: LayerProps; line: LayerProps } {
  return {
    fill: {
      id: LAYERS.radiusFill,
      type: "fill",
      source: SOURCES.radius,
      paint: { "fill-color": c["map-radius"], "fill-opacity": 0.07 },
    },
    line: {
      id: LAYERS.radiusLine,
      type: "line",
      source: SOURCES.radius,
      paint: { "line-color": c["map-radius"], "line-width": 1.5, "line-dasharray": [3, 2] },
    },
  }
}

/** A ring around the selected location. */
export function selectedRingLayer(c: MapColors): LayerProps {
  return {
    id: LAYERS.selectedRing,
    type: "circle",
    source: SOURCES.selected,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 9, 12, 13, 16, 16],
      "circle-color": c.foreground,
      // Only the stroke shows.
      "circle-opacity": 0,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": c.foreground,
    },
  }
}

/**
 * State fill: shaded by `count` (a feature property) below POINT_ZOOM, from a
 * light tint for one location to `--map-choro-hi` for the busiest state, on
 * a square-root scale so small states still show. States with none stay
 * land-colored. At POINT_ZOOM and above it's hidden, leaving the basemap.
 */
export function statesFillLayer(c: MapColors, maxCount: number): LayerProps {
  const shade: ExpressionSpecification = [
    "case",
    ["==", ["get", "count"], 0],
    c["map-land"],
    [
      "interpolate", ["linear"], ["sqrt", ["get", "count"]],
      1, mixColors(c["map-land"], c["map-choro-hi"], 0.18),
      Math.max(1.01, Math.sqrt(maxCount)), c["map-choro-hi"],
    ],
  ] as unknown as ExpressionSpecification
  return {
    id: LAYERS.statesFill,
    type: "fill",
    source: SOURCES.states,
    maxzoom: POINT_ZOOM,
    paint: { "fill-color": shade },
  }
}

/** Outline of the state under the pointer. */
export function statesHoverLayer(c: MapColors): LayerProps {
  return {
    id: LAYERS.statesHover,
    type: "line",
    source: SOURCES.states,
    maxzoom: POINT_ZOOM,
    paint: {
      "line-color": c.foreground,
      "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 1.6, 0],
    },
  }
}

/** State borders. */
export function statesLineLayer(c: MapColors): LayerProps {
  return {
    id: LAYERS.statesLine,
    type: "line",
    source: SOURCES.states,
    paint: {
      "line-color": c["map-line"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.4],
    },
  }
}

/** Countries PokeFindr doesn't cover yet: every outline except the supported ones. */
const UNSUPPORTED_FILTER = [
  "!",
  ["in", ["get", "iso"], ["literal", SUPPORTED_COUNTRY_NUMERIC]],
] as unknown as ExpressionSpecification

/**
 * Countries PokeFindr doesn't cover, drawn grey at every zoom, with a darker
 * fill on the one under the pointer. The supported countries aren't drawn,
 * so the basemap and state shading show through.
 */
export function worldLayers(c: MapColors): { fill: LayerProps; hover: LayerProps; line: LayerProps } {
  return {
    fill: {
      id: LAYERS.worldFill,
      type: "fill",
      source: SOURCES.world,
      filter: UNSUPPORTED_FILTER,
      paint: { "fill-color": c["map-unsupported"] },
    },
    hover: {
      id: LAYERS.worldHover,
      type: "fill",
      source: SOURCES.world,
      filter: UNSUPPORTED_FILTER,
      paint: {
        "fill-color": c["map-unsupported-line"],
        "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.9, 0],
      },
    },
    line: {
      id: LAYERS.worldLine,
      type: "line",
      source: SOURCES.world,
      filter: UNSUPPORTED_FILTER,
      paint: { "line-color": c["map-unsupported-line"], "line-width": 0.8 },
    },
  }
}
