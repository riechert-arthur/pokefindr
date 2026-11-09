"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRightIcon, NavigationIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { PlaceSearch, type PlacePick } from "@/components/search/PlaceSearch"
import { DEFAULT_RADIUS, mapUrl, roundPlace } from "@/lib/map/url-state"
import { track } from "@/lib/analytics"

/** The map URL a pick opens: a place with the default radius, a state, or a location's details. */
export function pickUrl(pick: PlacePick): string {
  if (pick.type === "location") return mapUrl("/map", { location: pick.feature.properties.id })
  const { area } = pick
  if (area.kind === "state" && area.state) return mapUrl("/map", { state: area.state })
  return mapUrl("/map", { q: area.label, lat: roundPlace(area.lat), lng: roundPlace(area.lng), r: DEFAULT_RADIUS })
}

/** Quick picks under the search box, as in the prototype; centered on each city's machines. */
export const QUICK_PICKS = [
  { label: "Seattle, WA", lng: -122.3285, lat: 47.6196 },
  { label: "Phoenix, AZ", lng: -112.0536, lat: 33.5193 },
  { label: "Denver, CO", lng: -104.9651, lat: 39.7117 },
] as const

const chip =
  "inline-flex items-center gap-1 rounded-full border border-border bg-card px-[11px] py-1 text-body text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * The landing hero's search (Flow 1): pick an area and the map opens on it
 * with a 10 mi radius, in one step; or a quick pick, or the viewer's own
 * location (near=me, so their position never goes in the URL).
 */
export function HeroSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  return (
    <>
      <div className="mx-auto mt-8 max-w-[620px] text-left">
        <PlaceSearch
          variant="hero"
          placement="below"
          query={query}
          onQueryChange={setQuery}
          onPick={(pick) => {
            track("open_map_from_landing", { via: "search" })
            router.push(pickUrl(pick))
          }}
          placeholder="City or address, like Denver, CO"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-body text-muted-foreground">
        <span>Try</span>
        {QUICK_PICKS.map((p) => (
          <Link key={p.label} href={mapUrl("/map", { q: p.label, lat: p.lat, lng: p.lng, r: DEFAULT_RADIUS })} className={chip} onClick={() => track("open_map_from_landing", { via: "quick_pick" })}>
            {p.label}
          </Link>
        ))}
        <Link href={mapUrl("/map", { near: "me", r: DEFAULT_RADIUS })} className={chip} onClick={() => track("open_map_from_landing", { via: "my_location" })}>
          <NavigationIcon className="size-3.5" aria-hidden />
          Use my location
        </Link>
      </div>
    </>
  )
}

/** "View full map" under the search, counted as leaving the landing page for the map. */
export function ViewMapLink() {
  return (
    <Link href="/map" className={buttonVariants({ variant: "outline" })} onClick={() => track("open_map_from_landing", { via: "button" })}>
      View full map <ArrowRightIcon className="size-4" aria-hidden />
    </Link>
  )
}
