"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson"
import { Layer, Popup, Source, useMap, type MapLayerMouseEvent } from "./engine"
import { LAYERS, SOURCES, worldLayers, type MapColors } from "./layers"
import { useFirstLabelLayer } from "./StateLayers"
import { COUNTRIES_URL, UNSUPPORTED } from "@/lib/map/countries"

type CountryCollection = FeatureCollection<Polygon | MultiPolygon, { name: string; iso: string }>

/**
 * Every country PokeFindr doesn't cover yet, in grey. Hovering one shows
 * "Not on PokeFindr yet"; clicking one explains in a toast. They can't be
 * selected.
 */
export function CountryLayers({ colors }: { colors: MapColors }) {
  const { current: map } = useMap()
  const beforeId = useFirstLabelLayer()
  const [countries, setCountries] = useState<CountryCollection | null>(null)
  const [tip, setTip] = useState<{ lng: number; lat: number; name: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(COUNTRIES_URL, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET ${COUNTRIES_URL} failed (${res.status})`)
        setCountries((await res.json()) as CountryCollection)
      })
      .catch((err: unknown) => {
        // Without outlines the map just shows the basemap everywhere.
        if (!controller.signal.aborted) console.error("[map] couldn't load country outlines", err)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!map) return
    let hovered: string | number | undefined
    const setHover = (id: string | number | undefined) => {
      if (hovered === id) return
      if (hovered !== undefined) map.setFeatureState({ source: SOURCES.world, id: hovered }, { hover: false })
      hovered = id
      if (id !== undefined) map.setFeatureState({ source: SOURCES.world, id }, { hover: true })
    }
    const onMove = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f) return
      setHover(f.id)
      setTip({ lng: e.lngLat.lng, lat: e.lngLat.lat, name: f.properties.name })
    }
    const onLeave = () => {
      setHover(undefined)
      setTip(null)
    }
    const onClick = (e: MapLayerMouseEvent) => {
      const name = e.features?.[0]?.properties.name
      if (name) toast(UNSUPPORTED.toastTitle(name), { description: UNSUPPORTED.toastBody })
    }
    map.on("mousemove", LAYERS.worldFill, onMove)
    map.on("mouseleave", LAYERS.worldFill, onLeave)
    map.on("click", LAYERS.worldFill, onClick)
    return () => {
      map.off("mousemove", LAYERS.worldFill, onMove)
      map.off("mouseleave", LAYERS.worldFill, onLeave)
      map.off("click", LAYERS.worldFill, onClick)
    }
  }, [map])

  const layers = useMemo(() => worldLayers(colors), [colors])

  if (!countries) return null
  return (
    <>
      <Source id={SOURCES.world} type="geojson" data={countries} generateId>
        <Layer {...layers.fill} beforeId={beforeId} />
        <Layer {...layers.hover} beforeId={beforeId} />
        <Layer {...layers.line} beforeId={beforeId} />
      </Source>
      {tip && (
        <Popup
          longitude={tip.lng}
          latitude={tip.lat}
          offset={12}
          closeButton={false}
          closeOnClick={false}
          className="country-tip"
        >
          <b className="block text-[13px] font-semibold">{tip.name}</b>
          <span className="text-muted-foreground">{UNSUPPORTED.tooltip}</span>
        </Popup>
      )}
    </>
  )
}
