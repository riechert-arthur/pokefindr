/**
 * Map layer styles, from the redesign prototype. Colors come from the design
 * tokens (readTokens), so call these again when the theme changes.
 */
import type { ExpressionSpecification, LayerProps, LayerSpecification } from "./engine"
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
  unsupported: "unsupported",
  supported: "supported",
  radius: "radius",
  places: "places",
  selected: "selected",
  states: "states",
} as const

export const LAYERS = {
  worldFill: "world-fill",
  worldHit: "world-hit",
  worldHover: "world-hover",
  supportedHit: "supported-hit",
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

/** Above this zoom the hovered country isn't darkened (its 110m outline is too rough). */
export const HOVER_MAX_ZOOM = 4.5

/**
 * Countries PokeFindr doesn't cover, grey at every zoom.
 *
 * - `fill`: the grey, from one polygon covering the world with the supported
 *   countries cut out of it in their detailed outlines (worldWithHoles), so
 *   it meets the US exactly. Coasts come from the basemap's water, drawn on
 *   top (basemapOverlays).
 * - `hit`: the 110m outlines, invisible, to tell which country the pointer
 *   is over; `hover` darkens that one while zoomed out.
 * - `supportedHit`: the supported countries' outlines, invisible, so the
 *   pointer over the US near a border never shows "Not on PokeFindr yet".
 */
export function worldLayers(c: MapColors): Record<"fill" | "hit" | "hover" | "supportedHit", LayerProps> {
  return {
    fill: {
      id: LAYERS.worldFill,
      type: "fill",
      source: SOURCES.unsupported,
      paint: { "fill-color": c["map-unsupported"] },
    },
    hit: {
      id: LAYERS.worldHit,
      type: "fill",
      source: SOURCES.world,
      filter: UNSUPPORTED_FILTER,
      paint: { "fill-color": c["map-unsupported"], "fill-opacity": 0 },
    },
    hover: {
      id: LAYERS.worldHover,
      type: "fill",
      source: SOURCES.world,
      filter: UNSUPPORTED_FILTER,
      // The 110m outlines are off by up to ~10 km: a pixel or two while
      // zoomed out, visibly wrong once zoomed in, where the tooltip is enough.
      maxzoom: HOVER_MAX_ZOOM,
      paint: {
        "fill-color": c["map-unsupported-line"],
        "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.9, 0],
      },
    },
    supportedHit: {
      id: LAYERS.supportedHit,
      type: "fill",
      source: SOURCES.supported,
      paint: { "fill-color": c["map-unsupported"], "fill-opacity": 0 },
    },
  }
}

/**
 * The basemap layer our shading goes under: its first label after its last
 * fill or line. Everything drawn as shapes (roads and interstates included)
 * ends up below the shading, and the place labels that follow stay on top.
 * Basemaps interleave labels with roads (OpenFreeMap Dark puts water names
 * before every road), so "the first label" isn't enough. Our own layers
 * (`own`) are skipped. Undefined when there's no such label: then the
 * shading goes on top of everything.
 */
export function shadingBeforeId(
  layers: readonly { id: string; type: string }[],
  own: ReadonlySet<string> = new Set(Object.values(LAYERS)),
): string | undefined {
  const basemap = layers.filter((l) => !own.has(l.id) && !l.id.startsWith(OVERLAY_PREFIX))
  let lastShape = -1
  basemap.forEach((l, i) => {
    if (l.type !== "symbol") lastShape = i
  })
  return basemap.slice(lastShape + 1).find((l) => l.type === "symbol")?.id
}

/** Ids of our copies of basemap layers start with this. */
export const OVERLAY_PREFIX = "pf-overlay-"

/** The basemap's own layers we redraw above the shading: water and borders. */
const OVERLAY_SOURCE_LAYERS = new Set(["water", "boundary"])

/**
 * Copies of the basemap's water and border layers, to draw above the grey
 * countries and the state shading (and under the labels). Our outlines are
 * simplified; redrawing the basemap's own water and borders over them makes
 * every coastline, lake, island and border exact, in whatever basemap and
 * theme is loaded.
 */
export function basemapOverlays(layers: readonly LayerSpecification[]): LayerSpecification[] {
  return layers
    .filter(
      (l): l is LayerSpecification & { "source-layer": string } =>
        "source-layer" in l && OVERLAY_SOURCE_LAYERS.has(String(l["source-layer"])) && !l.id.startsWith(OVERLAY_PREFIX),
    )
    .map((l) => ({ ...l, id: `${OVERLAY_PREFIX}${l.id}` }))
}
