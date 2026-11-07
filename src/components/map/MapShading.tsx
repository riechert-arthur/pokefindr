"use client"

import { useMemo } from "react"
import { BasemapOverlays, useBasemapStack } from "./BasemapOverlays"
import { CountryLayers } from "./CountryLayers"
import { StateLayers } from "./StateLayers"
import type { MapColors } from "./layers"
import type { LngLatBounds, StateCollection } from "./useStateShading"

const NO_STATES: StateCollection = { type: "FeatureCollection", features: [] }

interface MapShadingProps {
  colors: MapColors
  /** Shaded states, or null until they load. */
  states: StateCollection | null
  max: number
  bounds: ReadonlyMap<string, LngLatBounds>
  onStateSelect: (code: string) => void
}

/**
 * Everything drawn into the basemap, bottom to top: the grey countries and
 * the state shading, then the basemap's own water and borders again (exact
 * coasts and borders over our simplified outlines), then the basemap's
 * labels. The overlays render first so the shading has them to go under.
 */
export function MapShading({ colors, states, max, bounds, onStateSelect }: MapShadingProps) {
  const stack = useBasemapStack()
  const waterIds = useMemo(
    () => stack.overlays.filter((l) => l.type === "fill").map((l) => l.id),
    [stack.overlays],
  )
  if (!stack.labelId) return null
  // Rendered in this order, together, so the layers are added (and re-added
  // after a theme switch) in this order: grey countries, state shading on
  // top of them, then the overlays above both. Both shading groups mount
  // with empty data and fill in as their data loads.
  return (
    <>
      <BasemapOverlays stack={stack} />
      <CountryLayers colors={colors} beforeId={stack.shadingBeforeId} waterIds={waterIds} />
      <StateLayers
        states={states ?? NO_STATES}
        max={max}
        bounds={bounds}
        colors={colors}
        beforeId={stack.shadingBeforeId}
        onSelect={onStateSelect}
      />
    </>
  )
}
