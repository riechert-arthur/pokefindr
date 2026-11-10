"use client"

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { Layer, useMap, type LayerProps, type LayerSpecification } from "./engine"
import { basemapOverlays, localizedTextField, nameLabelIds, shadingBeforeId } from "./layers"

export interface BasemapStack {
  /** The basemap label our overlays go under (see shadingBeforeId). */
  labelId?: string
  /** Copies of the basemap's water and borders (see basemapOverlays). */
  overlays: LayerSpecification[]
  /** Where the grey countries and state shading go: under the overlays. */
  shadingBeforeId?: string
}

const EMPTY: BasemapStack = { overlays: [] }

/**
 * Reads the loaded basemap's layers whenever the style changes (the theme
 * swaps it) and works out the stacking for our shading. Reads right away
 * too: waiting for `style.load` misses it when the style loaded first.
 */
export function useBasemapStack(): BasemapStack {
  const { current: map } = useMap()
  const [stack, setStack] = useState<BasemapStack>(EMPTY)

  useEffect(() => {
    if (!map) return
    let key = ""
    const read = () => {
      const layers = map.getStyle()?.layers
      if (!layers?.length) return
      const labelId = shadingBeforeId(layers)
      const overlays = basemapOverlays(layers)
      const next = JSON.stringify([labelId, overlays])
      if (next === key) return
      key = next
      setStack({ labelId, overlays, shadingBeforeId: overlays[0]?.id ?? labelId })
    }
    read()
    map.on("styledata", read)
    return () => {
      map.off("styledata", read)
    }
  }, [map])

  return stack
}

/**
 * Puts the basemap's place names in the page's language (#184): "Estados
 * Unidos" and "México" in Spanish, "Russia" rather than "Россия" in English.
 * Again after every style change, since switching the theme loads a new
 * style with the tiles' default labels.
 */
export function useLocalizedLabels() {
  const { current: map } = useMap()
  const locale = useLocale()

  useEffect(() => {
    if (!map) return
    const field = localizedTextField(locale)
    const apply = () => {
      const m = map.getMap()
      if (!m.style) return
      // The layers' ids, types and labels, without serializing the whole style.
      // Only symbol layers have a text-field; MapLibre throws for the others.
      const layers = m.getLayersOrder().flatMap((id) => (m.getLayer(id)?.type === "symbol" ? [{ id, type: "symbol", layout: { "text-field": m.getLayoutProperty(id, "text-field") } }] : []))
      // MapLibre skips a value that's already set, so this settles after one pass.
      for (const id of nameLabelIds(layers)) m.setLayoutProperty(id, "text-field", field)
    }
    apply()
    map.on("styledata", apply)
    return () => {
      map.off("styledata", apply)
    }
  }, [map, locale])
}

/**
 * The basemap's water and borders, drawn again above our shading. Render
 * this before the shading layers, so these exist when the shading is
 * inserted under them.
 */
export function BasemapOverlays({ stack }: { stack: BasemapStack }) {
  return (
    <>
      {stack.overlays.map((spec) => (
        <Layer key={spec.id} {...(spec as LayerProps)} beforeId={stack.labelId} />
      ))}
    </>
  )
}
