"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson"
import { Layer, Popup, Source, useMap, type MapLayerMouseEvent } from "./engine"
import { LAYERS, OVERLAY_PREFIX, SOURCES, worldLayers, type MapColors } from "./layers"
import { COUNTRIES_URL, SUPPORTED_COUNTRIES, UNSUPPORTED } from "@/lib/map/countries"
import { worldWithHoles } from "@/lib/map/geo"

type Outline = Feature<Polygon | MultiPolygon, { name: string; iso: string }>
type CountryCollection = FeatureCollection<Polygon | MultiPolygon, { name: string; iso: string }>

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`)
  return (await res.json()) as T
}

interface Geo {
  /** 110m outlines of every country: which one is under the pointer. */
  countries: CountryCollection
  /** Detailed outlines of the supported countries. */
  supported: CountryCollection
  /** The world minus the supported countries: the grey. */
  unsupported: Feature<Polygon>
}

/**
 * Every country PokeFindr doesn't cover yet, in grey. Hovering one shows
 * "Not on PokeFindr yet"; clicking one explains in a toast. They can't be
 * selected.
 */
export function CountryLayers({ colors, beforeId }: { colors: MapColors; beforeId?: string }) {
  const { current: map } = useMap()
  const [geo, setGeo] = useState<Geo | null>(null)
  const [tip, setTip] = useState<{ lng: number; lat: number; name: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getJson<CountryCollection>(COUNTRIES_URL, controller.signal),
      ...SUPPORTED_COUNTRIES.map((c) => getJson<CountryCollection>(c.outline, controller.signal)),
    ])
      .then(([countries, ...outlines]) => {
        const features: Outline[] = outlines.flatMap((o) => o.features)
        setGeo({
          countries,
          supported: { type: "FeatureCollection", features },
          unsupported: worldWithHoles(features.map((f) => f.geometry)),
        })
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
    // The 110m outlines are rough: they overlap the US a little at its
    // borders and spill into the sea. The US and the basemap's water win.
    const overSupportedOrWater = (e: MapLayerMouseEvent) => {
      const layers = [
        LAYERS.supportedHit,
        ...(map.getStyle()?.layers ?? []).filter((l) => l.id.startsWith(OVERLAY_PREFIX) && l.type === "fill").map((l) => l.id),
      ].filter((id) => map.getLayer(id) !== undefined)
      return layers.length > 0 && map.queryRenderedFeatures(e.point, { layers }).length > 0
    }
    const onMove = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0]
      if (!f || overSupportedOrWater(e)) {
        setHover(undefined)
        setTip(null)
        return
      }
      setHover(f.id)
      setTip({ lng: e.lngLat.lng, lat: e.lngLat.lat, name: f.properties.name })
    }
    const onLeave = () => {
      setHover(undefined)
      setTip(null)
    }
    const onClick = (e: MapLayerMouseEvent) => {
      const name = e.features?.[0]?.properties.name
      if (name && !overSupportedOrWater(e)) toast(UNSUPPORTED.toastTitle(name), { description: UNSUPPORTED.toastBody })
    }
    map.on("mousemove", LAYERS.worldHit, onMove)
    map.on("mouseleave", LAYERS.worldHit, onLeave)
    map.on("click", LAYERS.worldHit, onClick)
    return () => {
      map.off("mousemove", LAYERS.worldHit, onMove)
      map.off("mouseleave", LAYERS.worldHit, onLeave)
      map.off("click", LAYERS.worldHit, onClick)
    }
  }, [map])

  const layers = useMemo(() => worldLayers(colors), [colors])

  if (!geo) return null
  return (
    <>
      <Source id={SOURCES.unsupported} type="geojson" data={geo.unsupported}>
        <Layer {...layers.fill} beforeId={beforeId} />
      </Source>
      <Source id={SOURCES.world} type="geojson" data={geo.countries} generateId>
        <Layer {...layers.hover} beforeId={beforeId} />
        <Layer {...layers.hit} beforeId={beforeId} />
      </Source>
      <Source id={SOURCES.supported} type="geojson" data={geo.supported}>
        <Layer {...layers.supportedHit} beforeId={beforeId} />
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
