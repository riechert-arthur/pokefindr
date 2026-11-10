"use client"

import { Link } from "@/i18n/navigation"
import { useEffect, useRef, type ReactNode } from "react"
import { NavigationIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KindDot } from "@/components/pokefindr/KindDot"
import { StarRating } from "@/components/pokefindr/StarRating"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { DEFAULT_RADIUS, mapUrl } from "@/lib/map/url-state"
import type { UpcomingEvent } from "@/lib/types/highlights"
import { useFormat } from "@/i18n/format"
import { useDistance } from "@/i18n/useDistance"
import { useTranslations } from "next-intl"

/**
 * A dashboard tile, as the prototype's `.tiles .dcard`. `grid-cols-1` (a
 * `minmax(0, 1fr)` track) is what stops its rows from widening it, so a long
 * name truncates instead of overflowing (#302). `min-w-0` does nothing in the
 * dashboard's own grid, whose tracks are `minmax(0, 1fr)` too; it keeps the
 * tile from growing if it's ever put in a flex row or an `auto` track.
 */
function Tile({ title, badge, children }: { title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid min-w-0 grid-cols-1 content-start gap-1.5 rounded-xl border border-border bg-card p-3">
      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold text-foreground">
        {title}
        {badge}
      </h3>
      {children}
    </section>
  )
}

const muted = "text-caption text-muted-foreground"
/** A tile's button: a long label (in Spanish at 4 columns) wraps inside the tile instead of running past it. */
const tileButton = "h-auto min-h-8 max-w-full justify-self-start whitespace-normal py-1.5 text-left"
const itemClass = "flex w-full min-w-0 items-start gap-2.5 rounded-md py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

export type NearState = { status: "idle" } | { status: "locating" } | { status: "denied" } | { status: "ready"; count: number | null }

export function NearYouTile({ near, onLocate }: { near: NearState; onLocate: () => void }) {
  const f = useFormat()
  const { radius: radiusText } = useDistance()
  const t = useTranslations("dashboard.tiles.near")
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
    <Tile title={t("title")}>
      {/* Announces the count or the refusal when it arrives. */}
      <div aria-live="polite" className="grid content-start gap-1.5">
      {near.status === "ready" ? (
        <>
          <p className="text-heading tabular-nums text-foreground">{near.count === null ? "–" : f.count(near.count)}</p>
          <p className={muted}>{t("count", { radius: radiusText(DEFAULT_RADIUS) })}</p>
          <Button asChild variant="outline" size="sm" className={tileButton}>
            <Link ref={openLink} href={mapUrl("/map", { near: "me", r: DEFAULT_RADIUS })}>{t("openOnMap")}</Link>
          </Button>
        </>
      ) : (
        <>
          <p className={muted}>
            {near.status === "denied" ? t("denied") : t("prompt")}
          </p>
          <Button ref={button} type="button" variant="outline" size="sm" className={tileButton} onClick={locate} disabled={near.status === "locating"}>
            <NavigationIcon className="size-3.5" aria-hidden />
            {near.status === "locating" ? t("locating") : t("locate")}
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

function ManageLink() {
  const t = useTranslations("dashboard.tiles.reviews")
  return (
    <Link href="/home/reviews" className="text-caption font-medium text-foreground underline-offset-4 hover:underline">
      {t("manage")}
    </Link>
  )
}

export function ReviewsTile({ reviews }: { reviews: MyReview[] | "error" | null }) {
  const t = useTranslations("dashboard.tiles")
  const manageLink = <ManageLink />
  return (
    <Tile title={t("reviews.title")}>
      {reviews === null ? (
        <p className={muted}>{t("loading")}</p>
      ) : reviews === "error" ? (
        <>
          <p className={muted}>{t("reviews.error")}</p>
          {manageLink}
        </>
      ) : reviews.length === 0 ? (
        <p className={muted}>{t("reviews.empty")}</p>
      ) : (
        <>
          {reviews.slice(0, 4).map((r) => (
            <Link key={r.id} href={mapUrl("/map", { location: r.location.id })} className={itemClass}>
              <span className="min-w-0 flex-1">
                {/* The name shrinks and ends in an ellipsis; the stars keep their room (#302). */}
                <span className="flex items-center gap-1.5 text-body font-medium text-foreground">
                  <span className="min-w-0 truncate" title={r.location.name ?? undefined}>{r.location.name ?? t("reviews.unnamed")}</span>
                  <StarRating rating={r.rating} starSize={11} className="shrink-0" />
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
  const t = useTranslations("dashboard.tiles.submissions")
  return (
    <Tile title={t("title")} badge={<StatusBadge status="coming-soon" className="whitespace-nowrap" />}>
      <p className={muted}>{t("body")}</p>
      <Button type="button" variant="outline" size="sm" className={tileButton} disabled>
        <PlusIcon className="size-3.5" aria-hidden />
        {t("add")}
      </Button>
    </Tile>
  )
}

export function EventsTile({ events }: { events: UpcomingEvent[] | "error" | null }) {
  const f = useFormat()
  const t = useTranslations("dashboard.tiles")
  return (
    <Tile title={t("events.title")} badge={Array.isArray(events) && events.some((e) => e.isSample) && <StatusBadge status="sample" />}>
      {events === null ? (
        <p className={muted}>{t("loading")}</p>
      ) : events === "error" ? (
        <p className={muted}>{t("events.error")}</p>
      ) : events.length === 0 ? (
        <p className={muted}>{t("events.empty")}</p>
      ) : (
        events.slice(0, 2).map((e) => (
          <Link key={e.id} href={mapUrl("/map", { q: [e.city, e.state].filter(Boolean).join(", ") || e.title, lng: e.lng, lat: e.lat, r: DEFAULT_RADIUS, types: ["event"] })} className={itemClass}>
            <KindDot kind="event" className="mt-1" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-medium text-foreground" title={e.title}>{e.title}</span>
              <span className={`block truncate ${muted}`}>{[f.eventWhen(e.startsAt, e.endsAt), e.city].filter(Boolean).join(" · ")}</span>
            </span>
          </Link>
        ))
      )}
    </Tile>
  )
}
