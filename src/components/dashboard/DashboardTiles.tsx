"use client"

import { Link } from "@/i18n/navigation"
import { useEffect, useRef, type ReactNode } from "react"
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
      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold text-foreground">
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
  const openLink = useRef<HTMLAnchorElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const asked = useRef(false)
  // The button gives way to the count and a link (or comes back after a refusal):
  // keep keyboard focus on what replaced it.
  useEffect(() => {
    if (!asked.current) return
    // Only when focus was lost with the button (it's disabled while locating):
    // never pull it away from somewhere the viewer has moved on to, like the composer.
    const lost = !document.activeElement || document.activeElement === document.body || document.activeElement === button.current
    if (!lost) return
    if (near.status === "ready") openLink.current?.focus()
    if (near.status === "denied") button.current?.focus()
  }, [near.status])
  const locate = () => {
    asked.current = true
    onLocate()
  }
  return (
    <Tile title="Near you">
      {/* Announces the count or the refusal when it arrives. */}
      <div aria-live="polite" className="grid content-start gap-1.5">
      {near.status === "ready" ? (
        <>
          <p className="text-heading tabular-nums text-foreground">{near.count === null ? "–" : formatCount(near.count)}</p>
          <p className={muted}>places within {DEFAULT_RADIUS} mi</p>
          <Button asChild variant="outline" size="sm" className="justify-self-start">
            <Link ref={openLink} href={mapUrl("/map", { near: "me", r: DEFAULT_RADIUS })}>Open on map</Link>
          </Button>
        </>
      ) : (
        <>
          <p className={muted}>
            {near.status === "denied" ? "Location is off. Search a city on the map instead." : "Share your location to see what's close and ask the assistant about it."}
          </p>
          <Button ref={button} type="button" variant="outline" size="sm" className="justify-self-start" onClick={locate} disabled={near.status === "locating"}>
            <NavigationIcon className="size-3.5" aria-hidden />
            {near.status === "locating" ? "Locating…" : "Use my location"}
          </Button>
        </>
      )}
      </div>
    </Tile>
  )
}

export interface MyReview {
  id: string
  rating: number
  comment: string | null
  location: { id: string; name: string | null; city: string | null; state: string | null }
}

const manageLink = (
  <Link href="/home/reviews" className="text-caption font-medium text-foreground underline-offset-4 hover:underline">
    Manage your reviews
  </Link>
)

export function ReviewsTile({ reviews }: { reviews: MyReview[] | "error" | null }) {
  return (
    <Tile title="Your reviews">
      {reviews === null ? (
        <p className={muted}>Loading…</p>
      ) : reviews === "error" ? (
        <>
          <p className={muted}>Couldn&apos;t load your reviews. Check your connection and refresh.</p>
          {manageLink}
        </>
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
          {manageLink}
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

export function EventsTile({ events }: { events: UpcomingEvent[] | "error" | null }) {
  return (
    <Tile title="Upcoming events" badge={Array.isArray(events) && events.some((e) => e.isSample) && <StatusBadge status="sample" />}>
      {events === null ? (
        <p className={muted}>Loading…</p>
      ) : events === "error" ? (
        <p className={muted}>Couldn&apos;t load events. Check your connection and refresh.</p>
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
