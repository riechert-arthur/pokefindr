"use client"

import { useCallback, useEffect, useState } from "react"
import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { KINDS, KIND_ORDER } from "@/components/pokefindr/kinds"
import type { Coverage } from "@/lib/admin/coverage"
import { cn } from "@/lib/utils"
import { useFormat } from "@/i18n/format"

const card = "rounded-xl border border-border bg-card p-4 sm:p-5"

/** Horizontal bars, as in the prototype: label, bar scaled to the largest, count. The list is the data; the bars are decoration. */
function Bars({ rows, barClass, label }: { rows: { name: string; value: number; display?: string }[]; barClass: string; label: string }) {
  const f = useFormat()
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul aria-label={label} className="mt-3 flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-body">
          <span className="truncate text-foreground">{r.name}</span>
          <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
            <span className={cn("block h-full rounded-full", barClass)} style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-foreground">{r.display ?? f.count(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Locations → Coverage (#156), as in the prototype: vending machines by
 * state and by retailer, totals by kind, and countries. The same counts as
 * the map's (/api/locations/aggregates).
 */
export function CoverageView() {
  const f = useFormat()
  const [data, setData] = useState<Coverage | null | "error">(null)
  const load = useCallback(() => {
    fetch("/api/admin/coverage", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Coverage>) : Promise.reject(new Error(`coverage answered ${r.status}`))))
      .then(setData)
      .catch((err) => {
        console.error("[admin] couldn't load coverage", err)
        setData("error")
      })
  }, [])
  useEffect(load, [load])

  if (data === null) return <p className="text-body text-muted-foreground">Loading coverage…</p>
  if (data === "error")
    return (
      <EmptyState icon={TriangleAlertIcon} title="Couldn't load coverage" action={<Button onClick={load}>Try again</Button>}>
        Check your connection, then try again.
      </EmptyState>
    )

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className={card} aria-labelledby="cov-states">
        <h2 id="cov-states" className="text-subheading text-foreground">
          Vending machines by state
        </h2>
        <p className="text-caption text-muted-foreground">
          Top {Math.min(12, data.states)} of {data.states} {data.states === 1 ? "state" : "states"}.
        </p>
        <Bars label="Vending machines by state" barClass="bg-kind-vending" rows={data.vendingByState.map((s) => ({ name: s.state, value: s.count }))} />
      </section>

      <div className="flex flex-col gap-4">
        <section className={card} aria-labelledby="cov-totals">
          <h2 id="cov-totals" className="text-subheading text-foreground">
            Totals
          </h2>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {KIND_ORDER.map((k) => (
              // The term comes first in the markup; the number shows on top.
              <div key={k} className="flex flex-col-reverse rounded-lg bg-muted p-3">
                <dt className="text-caption text-muted-foreground">{KINDS[k].many}</dt>
                <dd className="text-heading tabular-nums text-foreground">{f.count(data.totals[k] ?? 0)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={card} aria-labelledby="cov-retailers">
          <h2 id="cov-retailers" className="text-subheading text-foreground">
            By retailer
          </h2>
          <p className="text-caption text-muted-foreground">
            Top {Math.min(8, data.retailers)} of {data.retailers}
          </p>
          <Bars label="Vending machines by retailer" barClass="bg-primary" rows={data.byRetailer.map((r) => ({ name: r.retailer, value: r.count }))} />
        </section>

        <section className={card} aria-labelledby="cov-countries">
          <h2 id="cov-countries" className="text-subheading text-foreground">
            Countries
          </h2>
          <Bars
            label="Countries"
            barClass="bg-success"
            rows={data.countries.map((c) => ({ name: c.name, value: c.status === "live" ? 1 : 0, display: c.status === "live" ? "Live" : "Next" }))}
          />
        </section>
      </div>
    </div>
  )
}
