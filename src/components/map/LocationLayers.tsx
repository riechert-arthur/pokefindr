"use client"

import { useEffect, useMemo } from "react"
import type { FeatureCollection, Point } from "geojson"
import { Layer, Source, useMap, type MapLayerMouseEvent } from "./engine"
import { LAYERS, SOURCES, placeDotsLayer, selectedRingLayer, type MapColors } from "./layers"
import type { LocationFeature, LocationFeatureCollection, LocationFeatureProperties } from "@/lib/types/locations"

const EMPTY: FeatureCollection<Point> = { type: "FeatureCollection", features: [] }

interface LocationLayersProps {
  collection: LocationFeatureCollection
  /** The selected location's position, for the ring. */
  selected: { longitude: number; latitude: number } | null
  colors: MapColors
  onSelect: (feature: LocationFeature) => void
}

/**
 * Every location as one circle layer colored by kind (drawn on the GPU, so
 * thousands stay smooth), plus a ring around the selected one.
 */
export function LocationLayers({ collection, selected, colors, onSelect }: LocationLayersProps) {
  const { current: map } = useMap()

  useEffect(() => {
    if (!map) return
    const onClick = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f || f.geometry.type !== "Point") return
      onSelect({
        type: "Feature",
        geometry: { type: "Point", coordinates: f.geometry.coordinates },
        properties: f.properties as LocationFeatureProperties,
      })
    }
    const pointer = () => (map.getCanvas().style.cursor = "pointer")
    const reset = () => (map.getCanvas().style.cursor = "")
    map.on("click", LAYERS.placeDots, onClick)
    map.on("mouseenter", LAYERS.placeDots, pointer)
    map.on("mouseleave", LAYERS.placeDots, reset)
    return () => {
      map.off("click", LAYERS.placeDots, onClick)
      map.off("mouseenter", LAYERS.placeDots, pointer)
      map.off("mouseleave", LAYERS.placeDots, reset)
    }
  }, [map, onSelect])

  const dots = useMemo(() => placeDotsLayer(colors), [colors])
  const ring = useMemo(() => selectedRingLayer(colors), [colors])
  const selectedData = useMemo<FeatureCollection<Point>>(
    () =>
      selected
        ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [selected.longitude, selected.latitude] } }] }
        : EMPTY,
    [selected],
  )

  return (
    <>
      <Source id={SOURCES.places} type="geojson" data={collection} promoteId="id">
        <Layer {...dots} />
      </Source>
      <Source id={SOURCES.selected} type="geojson" data={selectedData}>
        <Layer {...ring} />
      </Source>
    </>
  )
}
