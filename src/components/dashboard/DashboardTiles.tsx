"use client"

import { Link } from "@/i18n/navigation"
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react"
import { NavigationIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StarRating } from "@/components/pokefindr/StarRating"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { DEFAULT_RADIUS, mapUrl } from "@/lib/map/url-state"
import type { UpcomingEvent } from "@/lib/types/highlights"
import { useFormat } from "@/i18n/format"
import { useDistance } from "@/i18n/useDistance"
import { useTranslations } from "next-intl"

/** How many reviews or events a tile lists, so the tiles stay the same height. */
export const TILE_ROWS = 3

/**
 * A dashboard tile, as the prototype's `.tiles .dcard`: a title (with an
 * optional badge, always at the top right), a body, and a footer pinned to the
 * bottom so the tiles' actions line up across the row. The body's
 * `grid-cols-1` (a `minmax(0, 1fr)` track) is what stops its rows from
 * widening the tile, so a long name truncates instead of overflowing (#302).
 * `min-w-0` does nothing in the dashboard's own grid, whose tracks are
 * `minmax(0, 1fr)` too; it keeps the tile from growing if it's ever put in a
 * flex row or an `auto` track.
 * `live` makes the body a polite live region (Near you announces its count).
 */
function Tile({ title, badge, footer, live, children }: { title: string; badge?: ReactNode; footer?: ReactNode; live?: boolean; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <h2 id={id} className="min-w-0 text-subheading text-foreground">{title}</h2>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
      <div aria-live={live ? "polite" : undefined} className="grid min-w-0 flex-1 grid-cols-1 content-start gap-1.5">
        {children}
      </div>
      {footer && <div className="pt-1.5">{footer}</div>}
    </section>
  )
}

const muted = "text-caption text-muted-foreground"

/**
 * One review or event: a title line and a caption line, linking to the map.
 * The hover highlight has its own padding, so it doesn't touch the text.
 */
function TileRow({ href, title, caption }: { href: ComponentProps<typeof Link>["href"]; title: ReactNode; caption: ReactNode }) {
  return (
    <Link
      href={href}
      className="-mx-1.5 grid min-w-0 grid-cols-1 rounded-md px-1.5 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* The whole title shows on hover once it's cut short. */}
      <span className="block truncate text-body font-medium text-foreground" title={typeof title === "string" ? title : undefined}>{title}</span>
      <span className={`flex min-w-0 items-center gap-1.5 ${muted}`}>{caption}</span>
    </Link>
  )
}

/**
 * The one action style every tile's footer uses. A long label (in Spanish at
 * 4 columns) wraps inside the tile instead of running past it.
 */
const action = { variant: "outline", size: "sm", className: "h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left" } as const

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
    <Tile
      title={t("title")}
      // Announces the count or the refusal when it arrives.
      live
      footer={
        near.status === "ready" ? (
          <Button asChild {...action}>
            <Link ref={openLink} href={mapUrl("/map", { near: "me", r: DEFAULT_RADIUS })}>{t("openOnMap")}</Link>
          </Button>
        ) : (
          <Button ref={button} type="button" {...action} onClick={locate} disabled={near.status === "locating"}>
            <NavigationIcon aria-hidden />
            {near.status === "locating" ? t("locating") : t("locate")}
          </Button>
        )
      }
    >
      {near.status === "ready" ? (
        <>
          <p className="text-heading tabular-nums text-foreground">{near.count === null ? "–" : f.count(near.count)}</p>
          <p className={muted}>{t("count", { radius: radiusText(DEFAULT_RADIUS) })}</p>
        </>
      ) : (
        <p className={muted}>{near.status === "denied" ? t("denied") : t("prompt")}</p>
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

export function ReviewsTile({ reviews }: { reviews: MyReview[] | "error" | null }) {
  const t = useTranslations("dashboard.tiles")
  return (
    <Tile
      title={t("reviews.title")}
      footer={
        reviews !== null && (
          <Button asChild {...action}>
            <Link href="/home/reviews">{t("reviews.manage")}</Link>
          </Button>
        )
      }
    >
      {reviews === null ? (
        <p className={muted}>{t("loading")}</p>
      ) : reviews === "error" ? (
        <p className={muted}>{t("reviews.error")}</p>
      ) : reviews.length === 0 ? (
        <p className={muted}>{t("reviews.empty")}</p>
      ) : (
        reviews.slice(0, TILE_ROWS).map((r) => (
          <TileRow
            key={r.id}
            href={mapUrl("/map", { location: r.location.id })}
            title={r.location.name ?? t("reviews.unnamed")}
            caption={
              <>
                {/* The stars keep their room; the text beside them ends in an ellipsis (#302). */}
                <StarRating rating={r.rating} starSize={11} className="shrink-0" />
                <span className="min-w-0 truncate">{r.comment || [r.location.city, r.location.state].filter(Boolean).join(", ")}</span>
              </>
            }
          />
        ))
      )}
    </Tile>
  )
}

export function SubmissionsTile() {
  const t = useTranslations("dashboard.tiles.submissions")
  return (
    <Tile
      title={t("title")}
      badge={<StatusBadge status="coming-soon" className="whitespace-nowrap" />}
      footer={
        <Button type="button" {...action} disabled>
          <PlusIcon aria-hidden />
          {t("add")}
        </Button>
      }
    >
      <p className={muted}>{t("body")}</p>
    </Tile>
  )
}

export function EventsTile({ events }: { events: UpcomingEvent[] | "error" | null }) {
  const f = useFormat()
  const t = useTranslations("dashboard.tiles")
  return (
    <Tile
      title={t("events.title")}
      badge={Array.isArray(events) && events.some((e) => e.isSample) && <StatusBadge status="sample" className="whitespace-nowrap" />}
      footer={
        <Button asChild {...action}>
          <Link href={mapUrl("/map", { types: ["event"] })}>{t("events.seeOnMap")}</Link>
        </Button>
      }
    >
      {events === null ? (
        <p className={muted}>{t("loading")}</p>
      ) : events === "error" ? (
        <p className={muted}>{t("events.error")}</p>
      ) : events.length === 0 ? (
        <p className={muted}>{t("events.empty")}</p>
      ) : (
        events.slice(0, TILE_ROWS).map((e) => (
          <TileRow
            key={e.id}
            href={mapUrl("/map", { q: [e.city, e.state].filter(Boolean).join(", ") || e.title, lng: e.lng, lat: e.lat, r: DEFAULT_RADIUS, types: ["event"] })}
            title={e.title}
            caption={<span className="min-w-0 truncate">{[f.eventWhen(e.startsAt, e.endsAt), e.city].filter(Boolean).join(" · ")}</span>}
          />
        ))
      )}
    </Tile>
  )
}
