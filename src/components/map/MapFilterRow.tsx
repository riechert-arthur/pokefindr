"use client"

import { useState } from "react"
import { ChevronDownIcon, RadiusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useDistance } from "@/i18n/useDistance"
import { RADII, type Radius } from "@/lib/map/url-state"
import { cn } from "@/lib/utils"
import { filterChip } from "./filterChip"
import { RetailerFilter } from "./RetailerFilter"

interface MapFilterRowProps {
  /** The searched place's radius, first in the row; null without a place. */
  radius: Radius | null
  onRadiusChange: (radius: Radius) => void
  /** Vending machines are shown, so their retailer filter applies. */
  vendingShown: boolean
  /** The URL's `retailer=`; empty means every retailer. */
  retailers: readonly string[]
  onRetailersChange: (retailers: string[]) => void
  className?: string
}

/**
 * The filters across the top of the map, as in Google Maps (#361): the search
 * radius once a place is searched, then the filters of the kinds that are on
 * (today, vending machines by retailer). The type chips stay in the panel.
 * Renders nothing when no filter applies.
 */
export function MapFilterRow({ radius, onRadiusChange, vendingShown, retailers, onRetailersChange, className }: MapFilterRowProps) {
  const t = useTranslations("map.filters")
  const { radius: radiusText } = useDistance()
  const [radiusOpen, setRadiusOpen] = useState(false)
  // The place went away (back button, a new URL) with the menu open: don't reopen it with the next search.
  if (radius === null && radiusOpen) setRadiusOpen(false)
  if (radius === null && !vendingShown) return null

  return (
    <div role="group" aria-label={t("row")} className={cn("pointer-events-none flex items-center gap-2 overflow-x-auto px-1 pb-3 pt-1 [scrollbar-width:none] [&>*]:pointer-events-auto", className)}>
      {radius !== null && (
        <Popover open={radiusOpen} onOpenChange={setRadiusOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className={filterChip}>
              <RadiusIcon className="size-4 text-muted-foreground" aria-hidden data-filter-icon />
              {t("within", { radius: radiusText(radius) })}
              <ChevronDownIcon className="size-4 opacity-60" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} collisionPadding={8} aria-label={t("radiusTitle")} className="w-auto rounded-xl p-3">
            <h3 className="mb-2 text-body font-semibold">{t("radiusTitle")}</h3>
            <ToggleGroup
              type="single"
              required
              value={String(radius)}
              onValueChange={(v) => {
                onRadiusChange(Number(v) as Radius)
                setRadiusOpen(false)
              }}
              aria-label={t("radiusTitle")}
              className="gap-0 overflow-hidden rounded-md border border-border"
            >
              {RADII.map((r) => (
                <ToggleGroupItem
                  key={r}
                  value={String(r)}
                  className="h-8 rounded-none border-r border-border bg-background px-3 text-body font-normal tabular-nums text-foreground last:border-r-0 hover:bg-muted hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                >
                  {radiusText(r)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </PopoverContent>
        </Popover>
      )}
      {vendingShown && <RetailerFilter selected={retailers} onChange={onRetailersChange} />}
      {vendingShown && retailers.length > 0 && (
        <Button type="button" variant="ghost" className="h-9 shrink-0 rounded-full px-3 text-body font-medium text-primary hover:bg-card" onClick={() => onRetailersChange([])}>
          <XIcon className="size-4" aria-hidden data-filter-icon />
          {t("clearAll")}
        </Button>
      )}
    </div>
  )
}
