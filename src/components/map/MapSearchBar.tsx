"use client"

import { MenuIcon, SearchIcon, XIcon } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import type { Point } from "geojson"
import type { LocationFeature, LocationFeatureCollection } from "@/lib/types/locations"
import { useSidebar } from "@/components/providers/SidebarContextProvider"
import { APP_NAV_ID } from "@/components/pokefindr/AppRail"
import { KindDot } from "@/components/pokefindr/KindDot"
import { toKind } from "@/components/pokefindr/kinds"
import { searchPlaces } from "@/lib/geocode/client"
import { MIN_QUERY_LENGTH } from "@/lib/geocode/query"

interface MapSearchBarProps {
  collection: LocationFeatureCollection
  onSelect: (feat: LocationFeature) => void
  radiusMeters?: number
  selectedLocation?: { address: string; city: string; state: string } | null;
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
  selectedLocation = null,
}: MapSearchBarProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<
    Array<LocationFeature & { distance: number }>
  >([])
  const abortRef = useRef<AbortController | null>(null)
  const { isSidebarOpen, toggleSidebar } = useSidebar()
  const [isFocused, setIsFocused] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 16, y: 16 })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (e.target !== containerRef.current) return
    // `left`/`top` are relative to the map, which starts right of the app
    // rail, so measure the grab point from the map's corner.
    const rect = containerRef.current!.getBoundingClientRect()
    const parent = containerRef.current!.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 }
    dragOffset.current = {
      x: e.clientX - rect.left + parent.left,
      y: e.clientY - rect.top + parent.top,
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
    if (selectedLocation) {
      setQuery(
        `${selectedLocation.address}, ${selectedLocation.city}, ${selectedLocation.state}`
      );
    }
  }, [selectedLocation]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const performSearch = async () => {
    abortRef.current?.abort()
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([])
      return
    }
    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Geocoded on the server (/api/geocode), so no provider key reaches the browser.
      const [place] = await searchPlaces(query, { limit: 1, signal: controller.signal })
      if (!place) {
        setResults([])
        return
      }
      const { lng, lat } = place

      const nearby = collection.features
        .filter(
          (feat): feat is LocationFeature & { geometry: Point } =>
            !!feat.geometry &&
            feat.geometry.type === "Point" &&
            Array.isArray(feat.geometry.coordinates)
        )
        .map((feat) => ({
          ...feat,
          distance: getDistance([lng, lat], feat.geometry.coordinates as [number, number]),
        }))
        .filter((f) => f.distance <= radiusMeters)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5)

      setResults(nearby)
    } catch (err) {
      if (!controller.signal.aborted) console.error("Geocode error", err)
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
  }, [query, collection, radiusMeters])

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        zIndex: 1000,
      }}
      className={`w-64 md:w-80 bg-card shadow-lg cursor-move ${results.length > 0 ? "rounded-xl" : "rounded-full"}`}
    >
      <div className={`flex flex-row items-center pl-4 pr-3 border-b ${results.length > 0 ? "rounded-t-xl" : "rounded-full"}`}>
        <button onClick={toggleSidebar} className="sm:hidden mr-2 p-1 rounded" aria-label="Open navigation" aria-controls={APP_NAV_ID} aria-expanded={isSidebarOpen}>
          <MenuIcon className="size-6 text-muted-foreground hover:text-primary/80" />
        </button>

        <input
          type="text"
          placeholder="Search address…"
          className={`flex flex-row rounded-full w-full pr-4 py-3 text-base text-foreground placeholder:text-muted-foreground font-medium focus:outline-none`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {results.length > 0 ? (
          <button onClick={() => { setResults([]); setQuery("") }} aria-label="Clear search" onMouseDown={(e) => e.stopPropagation()} className="size-7 hover:cursor-pointer hover:scale-105 hover:text-primary/80">
            <XIcon className="size-full hover:text-destructive" />
          </button>
        ) : (
          <button onClick={performSearch} aria-label="Search" onMouseDown={(e) => e.stopPropagation()} className="size-7 hover:cursor-pointer hover:scale-105 hover:text-primary/80">
            <SearchIcon className="size-full hover:text-primary/80" />
          </button>
        )}
        {results.length > 0 &&
          <button onClick={() => onSelect(results[0])} aria-label="Go to first result" onMouseDown={(e) => e.stopPropagation()} className="ml-2 size-7 hover:cursor-pointer hover:scale-105 hover:text-primary/80">
            <SearchIcon className="size-full hover:text-primary/80" />
          </button>
        }
      </div>
      {isFocused && results.length > 0 && (
        <ul
          className="max-h-64 overflow-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {results.map((feat) => {
            const { retailer, address, city } = feat.properties
            const distMi = (feat.distance / 1609.34).toFixed(1)
            return (
              <li
                key={feat.properties.id}
                className="px-3 py-2 hover:bg-muted cursor-pointer flex justify-between items-center"
                onClick={() => {
                  onSelect(feat)
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="flex items-start gap-2.5">
                  <KindDot kind={toKind(feat.properties.kind)} className="mt-0.5" />
                  <div>
                    <strong>{retailer}</strong>
                    <br />
                    <span className="text-sm text-muted-foreground">
                      {address}, {city}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{distMi} mi</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
