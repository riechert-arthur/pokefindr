"use client"

import { BasemapOverlays, useBasemapStack } from "./BasemapOverlays"
import { CountryLayers } from "./CountryLayers"
import { StateLayers } from "./StateLayers"
import type { MapColors } from "./layers"
import type { LngLatBounds, StateCollection } from "./useStateShading"

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
  if (!stack.labelId) return null
  return (
    <>
      <BasemapOverlays stack={stack} />
      <CountryLayers colors={colors} beforeId={stack.shadingBeforeId} />
      {states && (
        <StateLayers
          states={states}
          max={max}
          bounds={bounds}
          colors={colors}
          beforeId={stack.shadingBeforeId}
          onSelect={onStateSelect}
        />
      )}
    </>
  )
}
