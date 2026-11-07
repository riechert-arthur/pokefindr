"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson"
import { Layer, Popup, Source, useMap, type MapMouseEvent } from "./engine"
import { countryAtPoint, LAYERS, SOURCES, worldLayers, type CountryHit, type MapColors } from "./layers"
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
interface CountryLayersProps {
  colors: MapColors
  /** The layer to draw under (useBasemapStack's shadingBeforeId). */
  beforeId?: string
  /** Ids of the basemap water copies: no tooltip over water. */
  waterIds: readonly string[]
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] }

export function CountryLayers({ colors, beforeId, waterIds }: CountryLayersProps) {
  const { current: map } = useMap()
  const [geo, setGeo] = useState<Geo | null>(null)
  const [tip, setTip] = useState<{ lng: number; lat: number; name: string | null } | null>(null)

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

  // One map-wide listener and one query per animation frame. Over the US or
  // water there's no tooltip (the 110m outlines spill into both).
  const waterKey = waterIds.join(",")
  useEffect(() => {
    if (!map) return
    const water = new Set(waterKey ? waterKey.split(",") : [])
    const queried = [LAYERS.supportedHit, ...water, LAYERS.worldHit, LAYERS.worldFill]
    const hitAt = (point: { x: number; y: number }): CountryHit => {
      const layers = queried.filter((id) => map.getLayer(id) !== undefined)
      if (!layers.length) return { kind: "none" }
      return countryAtPoint(map.queryRenderedFeatures([point.x, point.y], { layers }), water)
    }

    let hovered: string | number | undefined
    const setHover = (id: string | number | undefined) => {
      if (hovered === id) return
      if (hovered !== undefined) map.setFeatureState({ source: SOURCES.world, id: hovered }, { hover: false })
      hovered = id
      if (id !== undefined) map.setFeatureState({ source: SOURCES.world, id }, { hover: true })
    }
    const clear = () => {
      setHover(undefined)
      setTip(null)
    }

    let frame = 0
    let last: MapMouseEvent | undefined
    const update = () => {
      frame = 0
      if (!last) return
      const hit = hitAt(last.point)
      if (hit.kind === "none") return clear()
      setHover(hit.kind === "country" ? hit.id : undefined)
      setTip({ lng: last.lngLat.lng, lat: last.lngLat.lat, name: hit.kind === "country" ? hit.name : null })
    }
    const onMove = (e: MapMouseEvent) => {
      last = e
      if (!frame) frame = requestAnimationFrame(update)
    }
    const onOut = () => {
      last = undefined
      clear()
    }
    const onClick = (e: MapMouseEvent) => {
      const hit = hitAt(e.point)
      if (hit.kind !== "none") {
        toast(UNSUPPORTED.toastTitle(hit.kind === "country" ? hit.name : null), { description: UNSUPPORTED.toastBody })
      }
    }
    map.on("mousemove", onMove)
    map.on("mouseout", onOut)
    map.on("click", onClick)
    return () => {
      cancelAnimationFrame(frame)
      map.off("mousemove", onMove)
      map.off("mouseout", onOut)
      map.off("click", onClick)
    }
  }, [map, waterKey])

  const layers = useMemo(() => worldLayers(colors), [colors])

  // The sources mount at once, empty until the outlines load, so these layers
  // are always added before the state shading (MapShading renders them first)
  // and the state shading stays on top.
  return (
    <>
      <Source id={SOURCES.unsupported} type="geojson" data={geo?.unsupported ?? EMPTY}>
        <Layer {...layers.fill} beforeId={beforeId} />
      </Source>
      <Source id={SOURCES.world} type="geojson" data={geo?.countries ?? EMPTY} generateId>
        <Layer {...layers.hover} beforeId={beforeId} />
        <Layer {...layers.hit} beforeId={beforeId} />
      </Source>
      <Source id={SOURCES.supported} type="geojson" data={geo?.supported ?? EMPTY}>
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
          {tip.name && <b className="block text-[13px] font-semibold">{tip.name}</b>}
          <span className="text-muted-foreground">{UNSUPPORTED.tooltip}</span>
        </Popup>
      )}
    </>
  )
}
