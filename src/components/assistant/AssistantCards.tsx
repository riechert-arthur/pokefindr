import { Link } from "@/i18n/navigation"
import type { ReactNode } from "react"
import { ExternalLinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KindDot } from "@/components/pokefindr/KindDot"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { KIND_ORDER } from "@/components/pokefindr/kinds"
import { DEFAULT_RADIUS, RADII, mapUrl, roundPlace } from "@/lib/map/url-state"
import { safeHref } from "@/lib/assistant/safe-link"
import { RoutePreview } from "./RoutePreview"
import { track } from "@/lib/analytics"
import type { AssistantCard, AssistantPlace } from "@/lib/types/assistant"
import { useFormat } from "@/i18n/format"
import { useDistance } from "@/i18n/useDistance"
import { useTranslations } from "next-intl"

/** The prototype's `.acard`: a bordered card with a muted header and an optional footer of actions. */
function Card({ title, children, footer }: { title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[calc(var(--radius)+2px)] border border-border bg-card">
      <h4 className="border-b border-border bg-muted px-3 py-[9px] text-caption font-semibold text-muted-foreground">{title}</h4>
      {children}
      {footer && <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2.5">{footer}</div>}
    </section>
  )
}

const sub = "block truncate text-caption text-muted-foreground"
const dist = "whitespace-nowrap text-caption tabular-nums text-muted-foreground"

/** The map's radius closest to (and at least) a search radius. */
const mapRadius = (r: number) => RADII.find((x) => x >= r) ?? RADII[RADII.length - 1]

function PlaceRow({ p }: { p: AssistantPlace }) {
  const { distance } = useDistance()
  const t = useTranslations("assistant.cards")
  const tk = useTranslations("kinds")
  return (
    <div className="flex items-center gap-2.5 border-b border-border px-3 py-2 text-body last:border-b-0">
      <KindDot kind={p.kind} label={tk(`${p.kind}.name`)} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <b className="truncate font-semibold text-foreground">{p.name}</b>
          {p.sample && <StatusBadge status="sample" />}
        </span>
        <span className={sub}>{[p.address, p.city].filter(Boolean).join(", ")}</span>
      </span>
      {p.miles !== undefined && <span className={dist}>{distance(p.miles)}</span>}
      <Button asChild variant="ghost" size="sm">
        <Link href={mapUrl("/map", { location: p.id })} aria-label={t("onMap", { name: p.name })} onClick={() => track("details_open", { kind: p.kind, from: "assistant" })}>
          {t("map")}
        </Link>
      </Button>
    </div>
  )
}

type CardMessages = ReturnType<typeof useTranslations<"assistant.cards">>

/** A card's heading in the page's language and units, or its English title for a card saved without its area. */
function cardTitle(card: Extract<AssistantCard, { title: string }>, t: CardMessages, radius: (miles: number) => string): string {
  const area = card.area
  if (area === undefined) return card.title
  if (card.type === "events") {
    if (area === null) return t("titles.events")
    return area.kind === "state" ? t("titles.eventsInState", { area: area.label }) : t("titles.eventsNear", { area: area.label, radius: radius(area.radiusMiles) })
  }
  if (area === null) return card.title
  if (card.type === "stats") return area.kind === "state" ? area.label : t("titles.statsNear", { area: area.label, radius: radius(area.radiusMiles) })
  return area.kind === "state"
    ? t("titles.placesInState", { count: card.total, area: area.label })
    : t("titles.placesNear", { count: card.total, area: area.label, radius: radius(area.radiusMiles) })
}

/** One tool result as the composer shows it: places, a route, counts or events. */
/** `newestRoute`: this is the conversation's newest route card, whose map preview opens by itself (#349). */
export function AssistantCardView({ card, newestRoute = false }: { card: AssistantCard; newestRoute?: boolean }) {
  const f = useFormat()
  const { distance, radius } = useDistance()
  const t = useTranslations("assistant.cards")
  const tk = useTranslations("kinds")
  if (card.type === "places") {
    return (
      <Card
        title={cardTitle(card, t, radius)}
        footer={
          card.near && (
            <Button asChild variant="outline" size="sm">
              <Link href={mapUrl("/map", { q: card.near.label === "you" ? null : card.near.label, near: card.near.label === "you" ? "me" : null, lng: card.near.label === "you" ? null : roundPlace(card.near.lng), lat: card.near.label === "you" ? null : roundPlace(card.near.lat), r: mapRadius(card.near.radiusMiles) })}>
                {t("openArea")}
              </Link>
            </Button>
          )
        }
      >
        {card.places.length ? card.places.map((p) => <PlaceRow key={p.id} p={p} />) : <p className="px-3 py-2.5 text-body text-muted-foreground">{t("nothingMatched")}</p>}
      </Card>
    )
  }

  if (card.type === "route") {
    const directions = safeHref(card.mapsUrl)
    return (
      <Card
        title={t("route", { count: card.stops.length, distance: distance(card.totalMiles) })}
        footer={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={mapUrl("/map", { route: card.stops.map((s) => s.id) })}>{t("showOnMap")}</Link>
            </Button>
            {directions && (
              <Button asChild size="sm">
                <a href={directions} target="_blank" rel="noopener noreferrer">
                  {t("googleMaps")}
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                </a>
              </Button>
            )}
          </>
        }
      >
        <RoutePreview ids={card.stops.map((s) => s.id)} autoOpen={newestRoute} />
        <ol className="py-1">
          {card.stops.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2.5 px-3 py-[7px] text-body">
              <span aria-hidden className="grid size-[22px] flex-none place-items-center rounded-full bg-primary text-caption font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate font-semibold text-foreground">{s.name}</b>
                <span className={sub}>{[s.address, s.city].filter(Boolean).join(", ")}</span>
              </span>
              <span className={dist}>{i === 0 && !card.start ? t("start") : t("leg", { distance: distance(card.legs[i] ?? 0) })}</span>
            </li>
          ))}
        </ol>
      </Card>
    )
  }

  if (card.type === "stats") {
    const max = Math.max(1, ...card.topRetailers.map((r) => r.count))
    return (
      <Card title={cardTitle(card, t, radius)}>
        <div className="flex flex-wrap gap-[18px] px-3 py-2.5 text-caption text-muted-foreground">
          {KIND_ORDER.map((k) => (
            <span key={k}>
              <b className="block text-heading tabular-nums text-foreground">{f.count(card.byKind[k] ?? 0)}</b>
              {tk(`${k}.many`)}
            </span>
          ))}
        </div>
        {card.topRetailers.length > 0 && (
          <div className="grid gap-1.5 px-3 pb-3" aria-label={t("topRetailers")}>
            {card.topRetailers.map((r) => (
              <div key={r.retailer} className="grid grid-cols-[110px_minmax(0,1fr)_36px] items-center gap-2 text-caption">
                <span className="truncate">{r.retailer}</span>
                <span className="h-2 overflow-hidden rounded bg-muted">
                  <i className="block h-full rounded bg-kind-vending" style={{ width: `${(r.count / max) * 100}%` }} />
                </span>
                <b className="text-right tabular-nums">{f.count(r.count)}</b>
              </div>
            ))}
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card title={cardTitle(card, t, radius)}>
      {card.events.length ? (
        card.events.map((e) => (
          <div key={e.id} className="flex items-center gap-2.5 border-b border-border px-3 py-2 text-body last:border-b-0">
            <KindDot kind="event" label={t("event")} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <b className="truncate font-semibold text-foreground">{e.title}</b>
                {e.sample && <StatusBadge status="sample" />}
              </span>
              <span className={sub}>{[f.eventWhen(e.startsAt, e.endsAt), [e.city, e.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
            </span>
            {e.miles !== undefined && <span className={dist}>{distance(e.miles)}</span>}
            <Button asChild variant="ghost" size="sm">
              <Link href={mapUrl("/map", { q: [e.city, e.state].filter(Boolean).join(", ") || e.title, lng: roundPlace(e.lng), lat: roundPlace(e.lat), r: DEFAULT_RADIUS, types: ["event"] })} aria-label={t("onMap", { name: e.title })}>
                {t("map")}
              </Link>
            </Button>
          </div>
        ))
      ) : (
        <p className="px-3 py-2.5 text-body text-muted-foreground">{t("noEvents")}</p>
      )}
    </Card>
  )
}
