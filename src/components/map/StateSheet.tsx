"use client"

import { ChevronLeftIcon, MapPinIcon } from "lucide-react"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { LocationKind } from "@/lib/types/locations"
import { cn } from "@/lib/utils"
import { breakdown } from "./ResultsSheet"
import type { StateCitiesState } from "./useStateCities"
import { useFormat } from "@/i18n/format"
import { useTranslations } from "next-intl"

interface StateSheetProps {
  /** Two-letter code, e.g. "WA". */
  code: string
  /** The state's name, e.g. "Washington". */
  name: string
  kinds: readonly LocationKind[]
  data: StateCitiesState
  onBack: () => void
  onCity: (city: { city: string; lng: number; lat: number }) => void
}

/** A state's view, as in the prototype: back to the US, the state's counts, and its busiest cities. */
export function StateSheet({ code, name, kinds, data, onBack, onCity }: StateSheetProps) {
  const f = useFormat()
  const t = useTranslations("map.state")
  const tm = useTranslations("map")
  const { status } = data
  // Another state's cities would be wrong under this name: placeholders until this one's arrive.
  const current = data.state === code ? data.cities : null

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-4 pb-2.5 pt-3.5">
        <Button type="button" variant="ghost" size="icon" className="-ml-2 size-8 shrink-0" onClick={onBack} aria-label={t("backToUs")}>
          <ChevronLeftIcon className="size-4" aria-hidden />
        </Button>
        <div className="min-w-0 flex-1" aria-live="polite" aria-atomic>
          <h2 className="text-subheading text-foreground">{name}</h2>
          <p className="text-body text-muted-foreground">
            {current ? (current.total ? breakdown(current.counts, kinds, f) : t("nothingForTypes")) : " "}
          </p>
        </div>
      </div>
      <div className={cn("min-h-0 overflow-y-auto p-1.5", status === "loading" && current && "opacity-60 transition-opacity")}>
        {status === "error" ? (
          <EmptyState title={t("failed")} className="m-1.5" action={<Button size="sm" variant="outline" onClick={data.reload}>{tm("results.tryAgain")}</Button>}>
            {tm("connection")}
          </EmptyState>
        ) : !current ? (
          <div aria-label={t("loading")} className="flex flex-col gap-1 p-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 p-2.5">
                <Skeleton className="size-8 rounded-lg" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : current.cities.length === 0 ? (
          <EmptyState title={t("empty", { name })} className="m-1.5">
            {t("emptyHint")}
          </EmptyState>
        ) : (
          <ul aria-label={t("listLabel", { name })}>
            {current.cities.map((c) => (
              <li key={c.city}>
                <button
                  type="button"
                  onClick={() => onCity(c)}
                  className="group flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground group-hover:bg-background">
                    <MapPinIcon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-foreground">{c.city}</span>
                    <span className="block text-body text-muted-foreground">{f.places(c.count, kinds)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
