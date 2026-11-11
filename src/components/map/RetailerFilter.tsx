"use client"

import { useEffect, useState } from "react"
import { ChevronDownIcon, ShoppingBasketIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useFormat } from "@/i18n/format"
import { useTranslations } from "next-intl"
import { filterChip, filterChipSet } from "./filterChip"

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
}

/**
 * The Retailer chip in the map's filter row (#361) and its list: vending
 * machines by retailer (the 12 biggest, with their machine counts). The chip
 * names the pick ("Safeway", "2 retailers") and turns solid while one is set.
 */
export function RetailerFilter({ selected, onChange }: RetailerFilterProps) {
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
  // What the chip says once retailers are picked.
  const picked = n === 0 ? null : n === 1 ? selected[0] : t("retailerCount", { count: n })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" aria-label={n === 1 ? t("retailerPicked", { value: selected[0] }) : undefined} className={cn(filterChip, n > 0 && filterChipSet)}>
          {/* Its own color while set: the chip is solid foreground then, so muted would vanish. */}
          <ShoppingBasketIcon className={cn("size-4", n === 0 && "text-muted-foreground")} aria-hidden data-filter-icon />
          <span className="max-w-[16ch] truncate">{picked ?? t("retailer")}</span>
          <ChevronDownIcon className="size-4 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      {/* Fits the screen (phones): the sections scroll, Clear and Done stay. */}
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={8}
        aria-label={t("retailer")}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[280px] flex-col rounded-xl p-3"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div>
            <h3 className="mb-2 text-body font-semibold">{t("vendingTitle")}</h3>
            {failed ? (
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
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2.5">
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
