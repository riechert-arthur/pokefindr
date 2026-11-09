"use client"

import { useEffect, useState } from "react"
import { SlidersHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useFormat } from "@/i18n/format"
import { useTranslations } from "next-intl"

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
  const f = useFormat()
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
  const t = useTranslations("map.filters")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={n ? t("buttonCount", { count: n }) : t("button")}
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
      {/* Fits the screen (phones): the sections scroll, Clear and Done stay. */}
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={8}
        aria-label={t("button")}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[280px] flex-col rounded-xl p-3"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div>
            <h3 className="mb-2 text-body font-semibold">{t("vendingTitle")}</h3>
            {!vendingShown ? (
              <p className="px-1 py-0.5 text-caption text-muted-foreground">{t("vendingOff")}</p>
            ) : failed ? (
              <p className="px-1 py-0.5 text-caption text-muted-foreground">{t("failed")}</p>
            ) : !list ? (
              <p className="px-1 py-0.5 text-caption text-muted-foreground">{t("loading")}</p>
            ) : (
              <div>
                {shown.map(({ retailer, count }) => {
                  const id = `retailer-${retailer.replace(/\W+/g, "-")}`
                  return (
                    <label key={retailer} htmlFor={id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-body hover:bg-muted">
                      <Checkbox id={id} checked={selected.includes(retailer)} onCheckedChange={(on) => toggle(retailer, on === true)} />
                      <span className="min-w-0 flex-1 truncate">{retailer}</span>
                      {count >= 0 && <span className="text-caption tabular-nums text-muted-foreground">{f.count(count)}</span>}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <h3 className="mb-1 text-body font-semibold">{t("shopsTitle")}</h3>
            <p className="px-1 py-0.5 text-caption text-muted-foreground">{t("shopsSoon")}</p>
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <h3 className="mb-1 text-body font-semibold">{t("eventsTitle")}</h3>
            <p className="px-1 py-0.5 text-caption text-muted-foreground">{t("eventsSoon")}</p>
          </div>
        </div>
        <div className={cn("mt-2 flex justify-between border-t border-border pt-2.5")}>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])} disabled={!n}>
            {t("clear")}
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            {t("done")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
