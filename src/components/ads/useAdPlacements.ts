"use client"

import { useEffect, useState } from "react"
import type { SponsorPlacement } from "@/config/banners"

type Flags = Partial<Record<SponsorPlacement, boolean>>

let flags: Promise<Flags> | null = null

/** One request per page load, shared by every slot on the page. Unreadable flags mean every placement is off. */
function loadFlags(): Promise<Flags> {
  flags ??= fetch("/api/ads/placements", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ placements: Flags }>) : { placements: {} }))
    .then((b) => b.placements)
    .catch(() => ({}))
  return flags
}

/**
 * Whether an admin has `placement` switched on (#159): null until known,
 * so a slot that's switched off never flashes on. `initial` is what the
 * server read when it rendered the page, if it did, until this page load's
 * answer arrives.
 */
export function usePlacementOn(placement: SponsorPlacement, initial?: boolean): boolean | null {
  const [on, setOn] = useState<boolean | null>(initial ?? null)
  useEffect(() => {
    let live = true
    void loadFlags().then((f) => live && setOn(f[placement] === true))
    return () => {
      live = false
    }
  }, [placement])
  return on
}

/** Test helper: read the flags again. */
export function resetAdPlacementsForTests() {
  flags = null
}
