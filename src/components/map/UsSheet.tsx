"use client"

import type { ReactNode } from "react"
import { CalendarDaysIcon, FlameIcon, MapIcon, SendIcon } from "lucide-react"
import { KindDot } from "@/components/pokefindr/KindDot"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"
import type { Highlights, Hotspot, UpcomingEvent } from "@/lib/types/highlights"
import type { LocationKind } from "@/lib/types/locations"
import { HOTSPOT_RADIUS_MILES } from "@/lib/highlights/constants"
import type { MySubmission } from "@/lib/submissions/schemas"
import { SubmissionRows } from "./MySubmissions"
import { useFormat } from "@/i18n/format"
import { useDistance } from "@/i18n/useDistance"
import { useTranslations } from "next-intl"

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
  /** The signed-in person's submissions (#125), newest first; none when signed out. */
  submissions?: readonly MySubmission[] | null
  onSubmission?: (s: MySubmission) => void
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
export function UsSheet({ highlights, states, kinds, onHotspot, onEvent, onState, submissions, onSubmission }: UsSheetProps) {
  const f = useFormat()
  const { radius: radiusText } = useDistance()
  const t = useTranslations("map.us")
  const hotspots = kinds.includes("vending") ? (highlights?.hotspots ?? []) : []
  const events = kinds.includes("event") ? (highlights?.events ?? []) : []
  const top = states.filter((s) => s.count > 0).slice(0, 5)

  return (
    <>
      <div className="border-b border-border px-4 pb-2.5 pt-3.5">
        <h2 className="text-subheading text-foreground">{t("title")}</h2>
        <p className="text-body text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="min-h-0 overflow-y-auto p-1.5">
        {submissions && submissions.length > 0 && onSubmission && (
          <Section icon={<SendIcon className="size-3.5" aria-hidden />} label={t("submissions")}>
            <SubmissionRows submissions={submissions} onOpen={onSubmission} />
          </Section>
        )}
        {hotspots.length > 0 && (
          <Section icon={<FlameIcon className="size-3.5" aria-hidden />} label={t("hotspots")}>
            {hotspots.map((h) => (
              <Row
                key={`${h.city}-${h.state}`}
                lead={
                  <span className={iconBox}>
                    <FlameIcon className="size-4 text-kind-vending" aria-hidden />
                  </span>
                }
                title={`${h.city}, ${h.state}`}
                sub={t("hotspotSub", { count: f.kindCount("vending", h.count), radius: radiusText(HOTSPOT_RADIUS_MILES) })}
                onClick={() => onHotspot(h)}
              />
            ))}
          </Section>
        )}
        {events.length > 0 && (
          <Section
            icon={<CalendarDaysIcon className="size-3.5" aria-hidden />}
            label={t("events")}
            badge={events.some((e) => e.isSample) && <StatusBadge status="sample">{t("sample")}</StatusBadge>}
          >
            {events.map((e) => (
              <Row
                key={e.id}
                lead={<KindDot kind="event" className="mt-px" />}
                title={e.title}
                badge={e.isSample && <StatusBadge status="sample" />}
                sub={[f.eventWhen(e.startsAt, e.endsAt), e.city].filter(Boolean).join(" · ")}
                onClick={() => onEvent(e)}
              />
            ))}
          </Section>
        )}
        {top.length > 0 && (
          <Section icon={<MapIcon className="size-3.5" aria-hidden />} label={t("mostLocations")}>
            {top.map((s) => (
              <Row
                key={s.code}
                lead={
                  <span className={iconBox}>
                    <MapIcon className="size-4 text-foreground" aria-hidden />
                  </span>
                }
                title={s.name}
                sub={f.places(s.count, kinds)}
                onClick={() => onState(s.code)}
              />
            ))}
          </Section>
        )}
      </div>
    </>
  )
}
