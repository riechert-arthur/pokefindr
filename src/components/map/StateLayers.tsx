"use client"

import { useEffect, useMemo } from "react"
import { Layer, Source, useMap, type MapLayerMouseEvent } from "./engine"
import {
  LAYERS,
  POINT_ZOOM,
  SOURCES,
  statesFillLayer,
  statesHoverLayer,
  statesLineLayer,
  type MapColors,
} from "./layers"
import type { LngLatBounds, StateCollection } from "./useStateShading"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { cameraPadding } from "./camera"
import { useFormat } from "@/i18n/format"
import { useTranslations } from "next-intl"

interface StateLayersProps {
  states: StateCollection
  max: number
  bounds: ReadonlyMap<string, LngLatBounds>
  colors: MapColors
  /** The layer to draw under (useBasemapStack's shadingBeforeId). */
  beforeId?: string
  /** Called with a state's code after clicking it zooms there. Without it, clicking a state does nothing (e.g. while placing a pin). */
  onSelect?: (code: string) => void
}

/**
 * The zoomed-out map: states shaded by how many locations they have, with a
 * hover outline. Clicking a state with locations zooms to it.
 */
export function StateLayers({ states, max, bounds, colors, beforeId, onSelect }: StateLayersProps) {
  const { current: map } = useMap()

  useEffect(() => {
    if (!map) return
    let hovered: string | number | undefined
    const setHover = (id: string | number | undefined) => {
      if (hovered !== undefined) map.setFeatureState({ source: SOURCES.states, id: hovered }, { hover: false })
      hovered = id
      if (id !== undefined) map.setFeatureState({ source: SOURCES.states, id }, { hover: true })
    }
    const onMove = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f || map.getZoom() >= POINT_ZOOM) return setHover(undefined)
      setHover(f.id)
      map.getCanvas().style.cursor = f.properties.count ? "pointer" : ""
    }
    const onLeave = () => {
      setHover(undefined)
      map.getCanvas().style.cursor = ""
    }
    const onClick = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!onSelect || !f || map.getZoom() >= POINT_ZOOM || !f.properties.count) return
      const box = bounds.get(f.properties.region)
      if (!box) return
      map.fitBounds(box, { padding: cameraPadding(map.getContainer(), { sheet: true }), maxZoom: 7.5, duration: 1400 })
      onSelect(f.properties.region)
    }
    map.on("mousemove", LAYERS.statesFill, onMove)
    map.on("mouseleave", LAYERS.statesFill, onLeave)
    map.on("click", LAYERS.statesFill, onClick)
    return () => {
      map.off("mousemove", LAYERS.statesFill, onMove)
      map.off("mouseleave", LAYERS.statesFill, onLeave)
      map.off("click", LAYERS.statesFill, onClick)
    }
  }, [map, bounds, onSelect])

  const fill = useMemo(() => statesFillLayer(colors, max), [colors, max])
  const hover = useMemo(() => statesHoverLayer(colors), [colors])
  const line = useMemo(() => statesLineLayer(colors), [colors])

  return (
    <Source id={SOURCES.states} type="geojson" data={states} generateId>
      <Layer {...fill} beforeId={beforeId} />
      <Layer {...line} beforeId={beforeId} />
      <Layer {...hover} beforeId={beforeId} />
    </Source>
  )
}

/** The state shading's scale, shown while the map is zoomed out. */
export function StateLegend({ max, className }: { max: number; className?: string }) {
  const f = useFormat()
  const t = useTranslations("map")
  return (
    <Card className={cn("w-[180px] px-3 py-2.5 text-caption shadow-md", className)}>
      <strong className="font-semibold">{t("legend")}</strong>
      <div className="mb-1 mt-1.5 h-2 rounded border border-border bg-gradient-to-r from-map-land to-map-choro-hi" />
      <div className="flex justify-between tabular-nums text-muted-foreground">
        <span>0</span>
        <span>{f.count(max)}</span>
      </div>
    </Card>
  )
}
