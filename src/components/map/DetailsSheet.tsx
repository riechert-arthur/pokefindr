"use client"

import type { ReactNode } from "react"
import { ArrowLeftIcon, ExternalLinkIcon, LinkIcon } from "lucide-react"
import { toast } from "sonner"
import { KindDot } from "@/components/pokefindr/KindDot"
import { KINDS, toKind } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { milesBetween } from "@/lib/map/geo"
import { track } from "@/lib/analytics"
import { useDistance } from "@/i18n/useDistance"
import { useTranslations } from "next-intl"

/** The location the panel is about: a map feature's properties and point. */
export interface DetailsLocation {
  id: string
  longitude: number
  latitude: number
  retailer: string
  address: string
  city: string
  state: string
  machineID: string
  kind?: string
}

interface DetailsSheetProps {
  location: DetailsLocation
  /** "Back to Seattle, WA", "Back to Washington", or "Back". */
  backLabel: string
  onBack: () => void
  /** The viewer's position, once shared: "From you". */
  me?: { lng: number; lat: number } | null
  /** The searched place, when the details opened from its results: "Distance". */
  from?: { label: string; lng: number; lat: number } | null
  /** Under the title: the review summary (#119). */
  summary?: ReactNode
  /** After Directions and Copy link (Report a problem, #120). */
  actions?: ReactNode
  /** Above the facts (the report form, #120). */
  top?: ReactNode
  /** After the facts: reviews, nearby places. */
  children?: ReactNode
}

/** Google Maps search for the place, which finds the store rather than a bare point. */
export function directionsUrl({ retailer, address, city, state }: DetailsLocation): string {
  const query = [retailer, address, city, state].filter(Boolean).join(" ")
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** The line under the title: the street address, or the city for places without one. */
const subtitle = ({ address, city, state }: DetailsLocation) => [address, city, state].filter(Boolean).join(", ")


/**
 * A location's details in the map's left panel, as in the prototype: back to
 * the list it came from, the kind, name and address, Directions and Copy
 * link, then its facts (per kind) and distances.
 */
export function DetailsSheet({ location, backLabel, onBack, me, from, summary, actions, top, children }: DetailsSheetProps) {
  const { distance } = useDistance()
  const t = useTranslations("details")
  const tk = useTranslations("kinds")
  const kind = toKind(location.kind)
  const { longitude: lng, latitude: lat } = location

  const facts: [string, ReactNode][] =
    kind === "vending"
      ? [
          [t("facts.retailer"), location.retailer],
          [
            t("facts.address"),
            <>
              {location.address}
              <br />
              {[location.city, location.state].filter(Boolean).join(", ")}
            </>,
          ],
          [t("facts.machineId"), location.machineID ? <span className="font-mono">{location.machineID}</span> : <span className="text-muted-foreground">{t("facts.notListed")}</span>],
          [t("facts.source"), t("facts.sourceValue")],
        ]
      : [
          ...(location.address ? ([[t("facts.address"), location.address]] as [string, ReactNode][]) : []),
          [kind === "event" ? t("facts.where") : t("facts.location"), [location.city, location.state].filter(Boolean).join(", ")],
        ]
  if (me) facts.push([t("facts.fromYou"), distance(milesBetween(me.lng, me.lat, lng, lat))])
  if (from) facts.push([t("facts.distance"), t("facts.distanceFrom", { distance: distance(milesBetween(from.lng, from.lat, lng, lat)), place: from.label })])

  const copyLink = () => {
    const link = window.location.href
    navigator.clipboard.writeText(link).then(
      () => toast.success(t("linkCopied"), { description: link }),
      () => toast(t("copyThis"), { description: link }),
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border px-4 pb-3 pt-2.5">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="-ml-2 self-start text-muted-foreground">
          <ArrowLeftIcon aria-hidden />
          {backLabel}
        </Button>
        <div className={`inline-flex items-center gap-2 text-caption font-semibold ${KINDS[kind].text}`}>
          <KindDot kind={kind} />
          {tk(`${kind}.name`)}
        </div>
        <h2 className="text-heading text-foreground">{location.retailer}</h2>
        <p className="text-body text-muted-foreground">{subtitle(location)}</p>
        {summary}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button asChild size="sm">
            <a href={directionsUrl(location)} target="_blank" rel="noopener noreferrer" onClick={() => track("directions_click", { kind })}>
              {t("directions")}
              <ExternalLinkIcon aria-hidden />
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={copyLink}>
            <LinkIcon aria-hidden />
            {t("copyLink")}
          </Button>
          {actions}
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-1">
        {top}
        <dl className="mt-2 grid">
          {facts.map(([term, value]) => (
            <div key={term} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b border-border py-2.5">
              <dt className="text-body text-muted-foreground">{term}</dt>
              <dd className="m-0 min-w-0 break-words text-body text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        {children}
      </div>
    </>
  )
}
