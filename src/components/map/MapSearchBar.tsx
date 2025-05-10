"use client"

import axios, { CancelTokenSource } from "axios"
import { useState, useEffect, useRef, useCallback } from "react"
import type { Feature, Point, FeatureCollection } from "geojson"
import type { MachineProperties } from "@/components/map/PokemonCenterLocationPins"
import { XMarkIcon, MagnifyingGlassIcon, Bars3Icon } from "@heroicons/react/24/outline"
import { useSidebar } from "@/components/providers/SidebarContextProvider"

interface MapSearchBarProps {
  collection: FeatureCollection<Point, MachineProperties>
  onSelect: (feat: Feature<Point, MachineProperties>) => void
  radiusMeters?: number
}

const DEBOUNCE_MS = 300

function getDistance(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number]
) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6_371_000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function MapSearchBar({
  collection,
  onSelect,
  radiusMeters = 50_000,
}: MapSearchBarProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<
    Array<Feature<Point, MachineProperties> & { distance: number }>
  >([])
  const cancelRef = useRef<CancelTokenSource | null>(null)
  const { toggleSidebar } = useSidebar()
  const token = process.env.NEXT_PUBLIC_MAPBOX_GEOCODING_API_KEY

  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 16, y: 16 })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (e.target !== containerRef.current) return
    const rect = containerRef.current!.getBoundingClientRect()
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
    setDragging(true)
    e.preventDefault()
  }

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return
      setPos({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      })
      e.preventDefault()
    },
    [dragging]
  )

  const onMouseUp = useCallback(() => {
    if (dragging) setDragging(false)
  }, [dragging])

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const performSearch = async () => {
    cancelRef.current?.cancel()
      const source = axios.CancelToken.source()
      cancelRef.current = source

      try {
        const resp = await axios.get(
          "https://api.mapbox.com/search/geocode/v6/forward",
          {
            params: {
              q: query,
              access_token: token,
              autocomplete: true,
              limit: 5,
            },
            cancelToken: source.token,
          }
        )

        const geos = resp.data.features
        if (!Array.isArray(geos) || geos.length === 0) {
          setResults([])
          return
        }

        const [lng, lat] = geos[0].geometry?.coordinates as [number, number]

        const nearby = collection.features
          .filter(
            (feat): feat is Feature<Point, MachineProperties> =>
              !!feat.geometry &&
              feat.geometry.type === "Point" &&
              Array.isArray(feat.geometry.coordinates)
          )
          .map((feat) => ({
            ...feat,
            distance: getDistance([lng, lat], feat.geometry.coordinates),
          }))
          .filter((f) => f.distance <= radiusMeters)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5)

        setResults(nearby)
      } catch (err) {
        if (!axios.isCancel(err)) {
          console.error("Geocode error", err)
        }
      }
  }

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const handler = setTimeout(async () => {
      await performSearch()
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(handler)
    }
  }, [query, collection, radiusMeters, token])

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: 320,
        zIndex: 1000,
      }}
      className={`bg-white shadow-lg cursor-move md:translate-x-16 ${results.length > 0 ? "rounded-xl" : "rounded-full"}`}
    >
      <div className={`flex flex-row items-center pl-4 pr-3 border-b ${results.length > 0 ? "rounded-t-xl" : "rounded-full"}`}>
        <button onClick={toggleSidebar} className="md:hidden mr-2 p-1 rounded" aria-label="Toggle menu">
          <Bars3Icon className="w-6 h-6 text-gray-600 hover:text-blue-600" />
        </button>

        <input
          type="text"
          placeholder="Search address…"
          className={`flex flex-row rounded-full w-full pr-4 py-3 text-base text-gray-450 font-medium focus:outline-none`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
        />
        {results.length > 0 ? (
          <button onClick={() => { setResults([]); setQuery("") }} className="size-7 z-100 hover:cursor-pointer hover:scale-105 hover:text-blue-600">
            <XMarkIcon className="hover:text-red-600" />
          </button>
        ) : (
          <button onClick={performSearch} className="size-7 z-100 hover:cursor-pointer hover:scale-105 hover:text-blue-600">
            <MagnifyingGlassIcon className="hover:text-blue-600" />
          </button>
        )}
        {results.length > 0 &&
          <button onClick={() => onSelect(results[0])} className="ml-2 size-7 z-100 hover:cursor-pointer hover:scale-105 hover:text-blue-600">
            <MagnifyingGlassIcon className="hover:text-blue-600" />
          </button>
        }
      </div>
      {results.length > 0 && (
        <ul
          className="max-h-64 overflow-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {results.map((feat) => {
            const { retailer, address, city } = feat.properties
            const distMi = (feat.distance / 1609.34).toFixed(1)
            return (
              <li
                key={feat.properties.machineID}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                onClick={() => {
                  onSelect(feat)
                }}
              >
                <div>
                  <strong>{retailer}</strong>
                  <br />
                  <span className="text-sm">
                    {address}, {city}
                  </span>
                </div>
                <span className="text-xs text-gray-500">{distMi} mi</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}