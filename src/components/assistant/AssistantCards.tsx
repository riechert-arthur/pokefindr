import { Link } from "@/i18n/navigation"
import type { ReactNode } from "react"
import { ExternalLinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KindDot } from "@/components/pokefindr/KindDot"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { KINDS, KIND_ORDER, formatCount } from "@/components/pokefindr/kinds"
import { formatEventWhen } from "@/lib/highlights/format"
import { DEFAULT_RADIUS, RADII, mapUrl, roundPlace } from "@/lib/map/url-state"
import { safeHref } from "@/lib/assistant/safe-link"
import { track } from "@/lib/analytics"
import type { AssistantCard, AssistantPlace } from "@/lib/types/assistant"

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
const miles = (n: number) => `${n.toFixed(1)} mi`

/** The map's radius closest to (and at least) a search radius. */
const mapRadius = (r: number) => RADII.find((x) => x >= r) ?? RADII[RADII.length - 1]

function PlaceRow({ p }: { p: AssistantPlace }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border px-3 py-2 text-body last:border-b-0">
      <KindDot kind={p.kind} label={KINDS[p.kind].one} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <b className="truncate font-semibold text-foreground">{p.name}</b>
          {p.sample && <StatusBadge status="sample" />}
        </span>
        <span className={sub}>{[p.address, p.city].filter(Boolean).join(", ")}</span>
      </span>
      {p.miles !== undefined && <span className={dist}>{miles(p.miles)}</span>}
      <Button asChild variant="ghost" size="sm">
        <Link href={mapUrl("/map", { location: p.id })} aria-label={`${p.name} on the map`} onClick={() => track("details_open", { kind: p.kind, from: "assistant" })}>
          Map
        </Link>
      </Button>
    </div>
  )
}

/** One tool result as the composer shows it: places, a route, counts or events. */
export function AssistantCardView({ card }: { card: AssistantCard }) {
  if (card.type === "places") {
    return (
      <Card
        title={card.title}
        footer={
          card.near && (
            <Button asChild variant="outline" size="sm">
              <Link href={mapUrl("/map", { q: card.near.label === "you" ? null : card.near.label, near: card.near.label === "you" ? "me" : null, lng: card.near.label === "you" ? null : roundPlace(card.near.lng), lat: card.near.label === "you" ? null : roundPlace(card.near.lat), r: mapRadius(card.near.radiusMiles) })}>
                Open this area on the map
              </Link>
            </Button>
          )
        }
      >
        {card.places.length ? card.places.map((p) => <PlaceRow key={p.id} p={p} />) : <p className="px-3 py-2.5 text-body text-muted-foreground">Nothing matched.</p>}
      </Card>
    )
  }

  if (card.type === "route") {
    const directions = safeHref(card.mapsUrl)
    return (
      <Card
        title={`Route · ${card.stops.length} stops · ${miles(card.totalMiles)} straight-line`}
        footer={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={mapUrl("/map", { route: card.stops.map((s) => s.id) })}>Show on map</Link>
            </Button>
            {directions && (
              <Button asChild size="sm">
                <a href={directions} target="_blank" rel="noopener noreferrer">
                  Open in Google Maps
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                </a>
              </Button>
            )}
          </>
        }
      >
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
              <span className={dist}>{i === 0 && !card.start ? "Start" : `+${miles(card.legs[i] ?? 0)}`}</span>
            </li>
          ))}
        </ol>
      </Card>
    )
  }

  if (card.type === "stats") {
    const max = Math.max(1, ...card.topRetailers.map((r) => r.count))
    return (
      <Card title={card.title}>
        <div className="flex flex-wrap gap-[18px] px-3 py-2.5 text-caption text-muted-foreground">
          {KIND_ORDER.map((k) => (
            <span key={k}>
              <b className="block text-heading tabular-nums text-foreground">{formatCount(card.byKind[k] ?? 0)}</b>
              {KINDS[k].many}
            </span>
          ))}
        </div>
        {card.topRetailers.length > 0 && (
          <div className="grid gap-1.5 px-3 pb-3" aria-label="Top retailers">
            {card.topRetailers.map((r) => (
              <div key={r.retailer} className="grid grid-cols-[110px_minmax(0,1fr)_36px] items-center gap-2 text-caption">
                <span className="truncate">{r.retailer}</span>
                <span className="h-2 overflow-hidden rounded bg-muted">
                  <i className="block h-full rounded bg-kind-vending" style={{ width: `${(r.count / max) * 100}%` }} />
                </span>
                <b className="text-right tabular-nums">{formatCount(r.count)}</b>
              </div>
            ))}
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card title={card.title}>
      {card.events.length ? (
        card.events.map((e) => (
          <div key={e.id} className="flex items-center gap-2.5 border-b border-border px-3 py-2 text-body last:border-b-0">
            <KindDot kind="event" label="Event" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <b className="truncate font-semibold text-foreground">{e.title}</b>
                {e.sample && <StatusBadge status="sample" />}
              </span>
              <span className={sub}>{[formatEventWhen(e.startsAt, e.endsAt), [e.city, e.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
            </span>
            {e.miles !== undefined && <span className={dist}>{miles(e.miles)}</span>}
            <Button asChild variant="ghost" size="sm">
              <Link href={mapUrl("/map", { q: [e.city, e.state].filter(Boolean).join(", ") || e.title, lng: roundPlace(e.lng), lat: roundPlace(e.lat), r: DEFAULT_RADIUS, types: ["event"] })} aria-label={`${e.title} on the map`}>
                Map
              </Link>
            </Button>
          </div>
        ))
      ) : (
        <p className="px-3 py-2.5 text-body text-muted-foreground">No upcoming events.</p>
      )}
    </Card>
  )
}
