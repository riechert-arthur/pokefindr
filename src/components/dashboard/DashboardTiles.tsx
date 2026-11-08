"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { NavigationIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KindDot } from "@/components/pokefindr/KindDot"
import { StarRating } from "@/components/pokefindr/StarRating"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { formatCount } from "@/components/pokefindr/kinds"
import { formatEventWhen } from "@/lib/highlights/format"
import { DEFAULT_RADIUS, mapUrl } from "@/lib/map/url-state"
import type { UpcomingEvent } from "@/lib/types/highlights"

/** A dashboard tile, as the prototype's `.tiles .dcard`. */
function Tile({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid content-start gap-1.5 rounded-xl border border-border bg-card p-3">
      <h3 className="flex items-center gap-2 text-body font-semibold text-foreground">
        {title}
        {badge}
      </h3>
      {children}
    </section>
  )
}

const muted = "text-caption text-muted-foreground"
const itemClass = "flex w-full items-start gap-2.5 rounded-md py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export type NearState = { status: "idle" } | { status: "locating" } | { status: "denied" } | { status: "ready"; count: number | null }

export function NearYouTile({ near, onLocate }: { near: NearState; onLocate: () => void }) {
  return (
    <Tile title="Near you">
      {near.status === "ready" ? (
        <>
          <p className="text-heading tabular-nums text-foreground">{near.count === null ? "–" : formatCount(near.count)}</p>
          <p className={muted}>places within {DEFAULT_RADIUS} mi</p>
          <Button asChild variant="outline" size="sm" className="justify-self-start">
            <Link href={mapUrl("/map", { near: "me", r: DEFAULT_RADIUS })}>Open on map</Link>
          </Button>
        </>
      ) : (
        <>
          <p className={muted}>
            {near.status === "denied" ? "Location is off. Search a city on the map instead." : "Share your location to see what's close and ask the assistant about it."}
          </p>
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={onLocate} disabled={near.status === "locating"}>
            <NavigationIcon className="size-3.5" aria-hidden />
            {near.status === "locating" ? "Locating…" : "Use my location"}
          </Button>
        </>
      )}
    </Tile>
  )
}

export interface MyReview {
  id: string
  rating: number
  comment: string | null
  location: { id: string; name: string | null; city: string | null; state: string | null }
}

export function ReviewsTile({ reviews }: { reviews: MyReview[] | null }) {
  return (
    <Tile title="Your reviews">
      {reviews === null ? (
        <p className={muted}>Loading…</p>
      ) : reviews.length === 0 ? (
        <p className={muted}>Reviews you write on a location show up here, so you can find them again.</p>
      ) : (
        <>
          {reviews.slice(0, 4).map((r) => (
            <Link key={r.id} href={mapUrl("/map", { location: r.location.id })} className={itemClass}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-body font-medium text-foreground">
                  <span className="truncate">{r.location.name ?? "A place"}</span>
                  <StarRating rating={r.rating} starSize={11} />
                </span>
                <span className={`block truncate ${muted}`}>{r.comment || [r.location.city, r.location.state].filter(Boolean).join(", ")}</span>
              </span>
            </Link>
          ))}
          <Link href="/home/reviews" className="text-caption font-medium text-foreground underline-offset-4 hover:underline">
            Manage your reviews
          </Link>
        </>
      )}
    </Tile>
  )
}

export function SubmissionsTile() {
  return (
    <Tile title="Your submissions" badge={<StatusBadge status="coming-soon" className="whitespace-nowrap" />}>
      <p className={muted}>Card shops and events you add appear here while they wait for review.</p>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled>
        <PlusIcon className="size-3.5" aria-hidden />
        Add a place
      </Button>
    </Tile>
  )
}

export function EventsTile({ events }: { events: UpcomingEvent[] | null }) {
  return (
    <Tile title="Upcoming events" badge={events?.some((e) => e.isSample) && <StatusBadge status="sample" />}>
      {events === null ? (
        <p className={muted}>Loading…</p>
      ) : events.length === 0 ? (
        <p className={muted}>Card shows and league nights show up here once they&apos;re added.</p>
      ) : (
        events.slice(0, 2).map((e) => (
          <Link key={e.id} href={mapUrl("/map", { q: [e.city, e.state].filter(Boolean).join(", ") || e.title, lng: e.lng, lat: e.lat, r: DEFAULT_RADIUS, types: ["event"] })} className={itemClass}>
            <KindDot kind="event" className="mt-1" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-foreground">{e.title}</span>
              <span className={`block truncate ${muted}`}>{[formatEventWhen(e.startsAt, e.endsAt), e.city].filter(Boolean).join(" · ")}</span>
            </span>
          </Link>
        ))
      )}
    </Tile>
  )
}
