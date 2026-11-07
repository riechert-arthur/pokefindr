"use client"

import type { ReactNode } from "react"
import { CalendarDaysIcon, FlameIcon, MapIcon } from "lucide-react"
import { KindDot } from "@/components/pokefindr/KindDot"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import { countLabel, placesLabel } from "@/components/pokefindr/kinds"
import { formatEventWhen } from "@/lib/highlights/format"
import type { Highlights, Hotspot, UpcomingEvent } from "@/lib/types/highlights"
import type { LocationKind } from "@/lib/types/locations"
import { HOTSPOT_RADIUS_MILES } from "@/lib/highlights/constants"

/** A state and its count for the shown kinds. */
export interface StateTotal {
  code: string
  name: string
  count: number
}

interface UsSheetProps {
  highlights: Highlights | null
  /** States by count for the shown kinds, most first. */
  states: readonly StateTotal[]
  kinds: readonly LocationKind[]
  onHotspot: (hotspot: Hotspot) => void
  onEvent: (event: UpcomingEvent) => void
  onState: (code: string) => void
}

function Section({ icon, label, badge, children }: { icon: ReactNode; label: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <h3 className="flex items-center gap-1.5 px-2.5 pb-1 pt-2.5 text-overline uppercase text-muted-foreground">
        {icon}
        {label}
        {badge}
      </h3>
      <ul>{children}</ul>
    </section>
  )
}

function Row({ lead, title, sub, onClick, badge }: { lead: ReactNode; title: string; sub: string; onClick: () => void; badge?: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {lead}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-foreground">
            {title}
            {badge}
          </span>
          <span className="block truncate text-body text-muted-foreground">{sub}</span>
        </span>
      </button>
    </li>
  )
}

const iconBox = "grid size-8 shrink-0 place-items-center rounded-lg bg-muted group-hover:bg-background"

/**
 * The panel before any search, as in the prototype's "Across the US": vending
 * hotspots, upcoming events and the states with the most locations, each a
 * way in.
 */
export function UsSheet({ highlights, states, kinds, onHotspot, onEvent, onState }: UsSheetProps) {
  const hotspots = kinds.includes("vending") ? (highlights?.hotspots ?? []) : []
  const events = kinds.includes("event") ? (highlights?.events ?? []) : []
  const top = states.filter((s) => s.count > 0).slice(0, 5)

  return (
    <>
      <div className="border-b border-border px-4 pb-2.5 pt-3.5">
        <h2 className="text-subheading text-foreground">Across the US</h2>
        <p className="text-body text-muted-foreground">Search a city, or start from a highlight.</p>
      </div>
      <div className="min-h-0 overflow-y-auto p-1.5">
        {hotspots.length > 0 && (
          <Section icon={<FlameIcon className="size-3.5" aria-hidden />} label="Vending hotspots">
            {hotspots.map((h) => (
              <Row
                key={`${h.city}-${h.state}`}
                lead={
                  <span className={iconBox}>
                    <FlameIcon className="size-4 text-kind-vending" aria-hidden />
                  </span>
                }
                title={`${h.city}, ${h.state}`}
                sub={`${countLabel("vending", h.count)} within ${HOTSPOT_RADIUS_MILES} mi`}
                onClick={() => onHotspot(h)}
              />
            ))}
          </Section>
        )}
        {events.length > 0 && (
          <Section
            icon={<CalendarDaysIcon className="size-3.5" aria-hidden />}
            label="Upcoming events"
            badge={events.some((e) => e.isSample) && <StatusBadge status="sample">Sample data</StatusBadge>}
          >
            {events.map((e) => (
              <Row
                key={e.id}
                lead={<KindDot kind="event" className="mt-px" />}
                title={e.title}
                badge={e.isSample && <StatusBadge status="sample" />}
                sub={[formatEventWhen(e.startsAt, e.endsAt), e.city].filter(Boolean).join(" · ")}
                onClick={() => onEvent(e)}
              />
            ))}
          </Section>
        )}
        {top.length > 0 && (
          <Section icon={<MapIcon className="size-3.5" aria-hidden />} label="Most locations">
            {top.map((s) => (
              <Row
                key={s.code}
                lead={
                  <span className={iconBox}>
                    <MapIcon className="size-4 text-foreground" aria-hidden />
                  </span>
                }
                title={s.name}
                sub={placesLabel(s.count, kinds)}
                onClick={() => onState(s.code)}
              />
            ))}
          </Section>
        )}
      </div>
    </>
  )
}
