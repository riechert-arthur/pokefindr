"use client"

import { Link } from "@/i18n/navigation"
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react"
import { NavigationIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StarRating } from "@/components/pokefindr/StarRating"
import { SubmissionBadge, SubmissionNote } from "@/components/pokefindr/SubmissionBadge"
import type { MyReview } from "@/lib/reviews/my-review"
import type { MySubmission } from "@/lib/submissions/schemas"
import { DEFAULT_RADIUS, mapUrl, roundPlace } from "@/lib/map/url-state"
import type { UpcomingEvent } from "@/lib/types/highlights"
import { useFormat } from "@/i18n/format"
import { useDistance } from "@/i18n/useDistance"
import { useTranslations } from "next-intl"

/** How many rows a tile lists (reviews, submissions, events), so the tiles stay the same height. */
export const TILE_ROWS = 3

/**
 * A dashboard tile, as the prototype's `.tiles .dcard`: a title, a body, and
 * a footer pinned to the bottom so the tiles' actions line up across the row. The body's
 * `grid-cols-1` (a `minmax(0, 1fr)` track) is what stops its rows from
 * widening the tile, so a long name truncates instead of overflowing (#302).
 * `min-w-0` does nothing in the dashboard's own grid, whose tracks are
 * `minmax(0, 1fr)` too; it keeps the tile from growing if it's ever put in a
 * flex row or an `auto` track.
 * `live` makes the tile a polite live region, footer included: Near you
 * announces "Locating…" on its button, then the count or the refusal.
 */
function Tile({ title, footer, live, children }: { title: string; footer?: ReactNode; live?: boolean; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} aria-live={live ? "polite" : undefined} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
      <h2 id={id} className="text-subheading text-foreground">{title}</h2>
      <div className="grid min-w-0 flex-1 grid-cols-1 content-start gap-1.5">
        {children}
      </div>
      {footer && <div className="pt-1.5">{footer}</div>}
    </section>
  )
}

const muted = "text-caption text-muted-foreground"

/** A tile's rows: `null` while they load, `"error"` if they couldn't. */
export type TileData<T> = T[] | "error" | null

/** A tile's body: "Loading…", its error or empty message, or its first rows. */
function TileRows<T>({ data, error, empty, children }: { data: TileData<T>; error: string; empty: string; children: (row: T) => ReactNode }) {
  const t = useTranslations("dashboard.tiles")
  if (data === null) return <p className={muted}>{t("loading")}</p>
  if (data === "error") return <p className={muted}>{error}</p>
  if (data.length === 0) return <p className={muted}>{empty}</p>
  return <>{data.slice(0, TILE_ROWS).map(children)}</>
}

/**
 * One review or event: a title line and a caption line, linking to the map.
 * The hover highlight has its own padding, so it doesn't touch the text.
 */
function TileRow({ href, title, caption }: { href: ComponentProps<typeof Link>["href"]; title: string; caption: ReactNode }) {
  return (
    <Link
      href={href}
      className="-mx-1.5 grid min-w-0 grid-cols-1 rounded-md px-1.5 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* The whole title shows on hover once it's cut short. */}
      <span className="block truncate text-body font-medium text-foreground" title={title}>{title}</span>
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

export function ReviewsTile({ reviews }: { reviews: TileData<MyReview> }) {
  const t = useTranslations("dashboard.tiles")
  return (
    <Tile
      title={t("reviews.title")}
      // Always there, so the footers line up while the reviews load too.
      footer={
        <Button asChild {...action}>
          <Link href="/home/reviews">{t("reviews.manage")}</Link>
        </Button>
      }
    >
      <TileRows data={reviews} error={t("reviews.error")} empty={t("reviews.empty")}>
        {(r) => (
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
        )}
      </TileRows>
    </Tile>
  )
}

const submissionPlace = (s: MySubmission) => [s.city, s.state].filter(Boolean).join(", ")
/** Live and still on the map: the place itself. */
const isLive = (s: MySubmission) => s.status === "approved" && Boolean(s.locationId) && s.locationActive !== false

/**
 * A live submission opens its place; a pending one, the map around it, where
 * its pending pin shows. Anything else (not approved, ended, gone) has no pin,
 * so it opens the map's US view, whose "Your submissions" list says why.
 */
function submissionHref(s: MySubmission) {
  if (isLive(s) && s.locationId) return mapUrl("/map", { location: s.locationId })
  if (s.status === "pending") return mapUrl("/map", { q: submissionPlace(s) || s.name, lng: roundPlace(s.lng), lat: roundPlace(s.lat), r: DEFAULT_RADIUS })
  return "/map"
}

export function SubmissionsTile({ submissions }: { submissions: TileData<MySubmission> }) {
  const t = useTranslations("dashboard.tiles")
  return (
    <Tile
      title={t("submissions.title")}
      footer={
        <Button asChild {...action}>
          <Link href="/map?add=1">
            <PlusIcon aria-hidden />
            {t("submissions.add")}
          </Link>
        </Button>
      }
    >
      <TileRows data={submissions} error={t("submissions.error")} empty={t("submissions.body")}>
        {(s) => (
          <TileRow
            key={s.id}
            href={submissionHref(s)}
            title={s.name}
            caption={
              <>
                <span className="shrink-0">
                  <SubmissionBadge submission={s} />
                </span>
                <span className="min-w-0 truncate">{s.status === "pending" || isLive(s) ? submissionPlace(s) : <SubmissionNote submission={s} />}</span>
              </>
            }
          />
        )}
      </TileRows>
    </Tile>
  )
}

export function EventsTile({ events }: { events: TileData<UpcomingEvent> }) {
  const f = useFormat()
  const t = useTranslations("dashboard.tiles")
  return (
    <Tile
      title={t("events.title")}
      footer={
        <Button asChild {...action}>
          <Link href={mapUrl("/map", { types: ["event"] })}>{t("events.seeOnMap")}</Link>
        </Button>
      }
    >
      <TileRows data={events} error={t("events.error")} empty={t("events.empty")}>
        {(e) => (
          <TileRow
            key={e.id}
            href={mapUrl("/map", { q: [e.city, e.state].filter(Boolean).join(", ") || e.title, lng: e.lng, lat: e.lat, r: DEFAULT_RADIUS, types: ["event"] })}
            title={e.title}
            caption={<span className="min-w-0 truncate">{[f.eventWhen(e.startsAt, e.endsAt), e.city].filter(Boolean).join(" · ")}</span>}
          />
        )}
      </TileRows>
    </Tile>
  )
}
