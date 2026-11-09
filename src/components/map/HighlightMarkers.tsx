"use client"

import { CalendarDaysIcon, FlameIcon, type LucideIcon } from "lucide-react"
import { Marker } from "./engine"
import type { Highlights, Hotspot, UpcomingEvent } from "@/lib/types/highlights"
import type { LocationKind } from "@/lib/types/locations"
import { cn } from "@/lib/utils"
import { useFormat } from "@/i18n/format"

interface HighlightMarkersProps {
  highlights: Highlights
  kinds: readonly LocationKind[]
  onHotspot: (hotspot: Hotspot) => void
  onEvent: (event: UpcomingEvent) => void
}

function Pill({ icon: Icon, tone, label, onClick }: { icon: LucideIcon; tone: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card py-1 pl-[5px] pr-[9px] text-caption font-semibold text-foreground shadow-md hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span aria-hidden className={cn("grid size-5 place-items-center rounded-full text-primary-foreground", tone)}>
        <Icon className="size-3" strokeWidth={2.5} />
      </span>
      {label}
    </button>
  )
}

/**
 * The zoomed-out map's starting points, as in the prototype: a pill per
 * vending hotspot ("Portland · 102") and per upcoming event ("Card show ·
 * Fri, Nov 13"), each hidden when its kind is. Clicking one opens that area.
 */
export function HighlightMarkers({ highlights, kinds, onHotspot, onEvent }: HighlightMarkersProps) {
  const f = useFormat()
  return (
    <>
      {kinds.includes("vending") &&
        highlights.hotspots.map((h) => (
          <Marker key={`hot-${h.city}-${h.state}`} longitude={h.lng} latitude={h.lat} anchor="left">
            <Pill icon={FlameIcon} tone="bg-kind-vending" label={`${h.city} · ${h.count}`} onClick={() => onHotspot(h)} />
          </Marker>
        ))}
      {kinds.includes("event") &&
        highlights.events.map((e) => (
          <Marker key={`evt-${e.id}`} longitude={e.lng} latitude={e.lat} anchor="left">
            <Pill icon={CalendarDaysIcon} tone="bg-kind-event" label={`${e.title} · ${f.eventWhen(e.startsAt, e.endsAt)}`} onClick={() => onEvent(e)} />
          </Marker>
        ))}
    </>
  )
}
