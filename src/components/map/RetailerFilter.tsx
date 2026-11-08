"use client"

import { useEffect, useState } from "react"
import { SlidersHorizontalIcon } from "lucide-react"
import { formatCount } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface RetailerOption {
  retailer: string
  count: number
}

/** The retailers to offer (GET /api/locations/retailers), loaded once per page. */
let options: Promise<RetailerOption[]> | null = null
function loadRetailers(): Promise<RetailerOption[]> {
  options ??= fetch("/api/locations/retailers")
    .then(async (res) => {
      if (!res.ok) throw new Error(`GET /api/locations/retailers failed (${res.status})`)
      return ((await res.json()) as { retailers: RetailerOption[] }).retailers
    })
    .catch((err) => {
      options = null
      throw err
    })
  return options
}

/** Test helper: forget the loaded retailers. */
export function resetRetailersForTests() {
  options = null
}

interface RetailerFilterProps {
  /** The URL's `retailer=`; empty means every retailer. */
  selected: readonly string[]
  onChange: (retailers: string[]) => void
  /** Vending machines are shown; the filter only applies to them. */
  vendingShown: boolean
}

/**
 * The map's Filters button and popover, as in the prototype: vending
 * machines by retailer (the 12 biggest, with their machine counts), with a
 * badge counting the picked ones. Shops and events say their filters come
 * with real data.
 */
export function RetailerFilter({ selected, onChange, vendingShown }: RetailerFilterProps) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<RetailerOption[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open || list) return
    let live = true
    // Reopening after a failure tries again, with "Loading" meanwhile.
    setFailed(false)
    loadRetailers().then(
      (r) => live && setList(r),
      (err: unknown) => {
        console.error("[map] couldn't load retailers", err)
        if (live) setFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [open, list])

  // A retailer from a shared link that isn't among the top ones still shows, checked.
  const shown = list ? [...list, ...selected.filter((r) => !list.some((o) => o.retailer === r)).map((retailer) => ({ retailer, count: -1 }))] : []
  const toggle = (retailer: string, on: boolean) => onChange(on ? [...selected, retailer] : selected.filter((r) => r !== retailer))
  const n = selected.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={n ? `Filters, ${n} retailer${n === 1 ? "" : "s"}` : "Filters"}
          className="relative size-[42px] shrink-0 rounded-xl bg-card shadow-md"
        >
          <SlidersHorizontalIcon aria-hidden />
          {n > 0 && (
            <span aria-hidden className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-overline font-bold tracking-normal text-primary-foreground">
              {n}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} aria-label="Filters" className="w-[280px] rounded-xl p-3">
        <div>
          <h3 className="mb-2 text-body font-semibold">Vending machines · retailer</h3>
          {!vendingShown ? (
            <p className="px-1 py-0.5 text-caption text-muted-foreground">Turn on vending machines to filter by retailer.</p>
          ) : failed ? (
            <p className="px-1 py-0.5 text-caption text-muted-foreground">Couldn&apos;t load retailers. Try again in a moment.</p>
          ) : !list ? (
            <p className="px-1 py-0.5 text-caption text-muted-foreground">Loading retailers…</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {shown.map(({ retailer, count }) => {
                const id = `retailer-${retailer.replace(/\W+/g, "-")}`
                return (
                  <label key={retailer} htmlFor={id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-body hover:bg-muted">
                    <Checkbox id={id} checked={selected.includes(retailer)} onCheckedChange={(on) => toggle(retailer, on === true)} />
                    <span className="min-w-0 flex-1 truncate">{retailer}</span>
                    {count >= 0 && <span className="text-caption tabular-nums text-muted-foreground">{formatCount(count)}</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <h3 className="mb-1 text-body font-semibold">Card shops</h3>
          <p className="px-1 py-0.5 text-caption text-muted-foreground">Open now, sells singles, hosts events. These filters arrive with real shop data.</p>
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <h3 className="mb-1 text-body font-semibold">Events</h3>
          <p className="px-1 py-0.5 text-caption text-muted-foreground">This week, this month, event type. Coming once events are real.</p>
        </div>
        <div className={cn("mt-2 flex justify-between border-t border-border pt-2.5")}>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])} disabled={!n}>
            Clear
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
