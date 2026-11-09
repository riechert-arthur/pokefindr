"use client"

import { useState, useSyncExternalStore } from "react"
import { SponsoredSlot } from "@/components/pokefindr/SponsoredSlot"
import { pickBanner, type SponsorPlacement } from "@/config/banners"
import { cn } from "@/lib/utils"
import { track } from "@/lib/analytics"

/**
 * Sponsored slots (#136): one labeled, dismissible card per view, in the
 * results list, a place's details, or the landing page. Never on the map,
 * in a popup or in a form; the callers keep it out of those. Dismissing
 * hides every slot for the rest of the visit (this tab's session).
 */

const HIDDEN_KEY = "pf:ads-hidden"
const HIDDEN_EVENT = "pf:ads-hidden"

function readHidden(): boolean {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === "1"
  } catch {
    return false
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(HIDDEN_EVENT, onChange)
  return () => window.removeEventListener(HIDDEN_EVENT, onChange)
}

/** Hides every slot for this visit. Without storage (private mode) it still hides them until the page reloads. */
export function hideAds() {
  try {
    sessionStorage.setItem(HIDDEN_KEY, "1")
  } catch {
    // Storage blocked: remember it in memory below.
  }
  memoryHidden = true
  window.dispatchEvent(new Event(HIDDEN_EVENT))
}

let memoryHidden = false

/** Whether ads are hidden. True on the server, so slots render only in the browser (the pick is random). */
function useAdsHidden(): boolean {
  return useSyncExternalStore(subscribe, () => memoryHidden || readHidden(), () => true)
}

export function SponsoredPlacement({ placement, className }: { placement: SponsorPlacement; className?: string }) {
  const hidden = useAdsHidden()
  // Picked once per view, in the browser.
  const [banner] = useState(() => (typeof window === "undefined" ? null : pickBanner(placement)))
  if (hidden || !banner || !banner.href) return null
  const strip = placement === "landing"
  const slot = (
    <>
      {/* The sponsor's impression pixel, in production only. */}
      {banner.pixel && process.env.NODE_ENV === "production" && <img src={banner.pixel} width={0} height={0} alt="" className="absolute invisible" />}
      <SponsoredSlot
        sponsor={banner.sponsor}
        title={banner.title}
        body={banner.body}
        cta={banner.cta}
        href={banner.href}
        variant={strip ? "strip" : "compact"}
        onDismiss={() => {
          track("sponsored_dismiss", { placement, banner: banner.id })
          hideAds()
        }}
        onFollow={() => track("sponsored_click", { placement, banner: banner.id })}
        className={strip ? undefined : className}
      />
    </>
  )
  // The landing strip is a band between sections, like the prototype's.
  if (strip)
    return (
      <div data-placement={placement} className={cn("border-t border-border px-6 py-8", className)}>
        <div className="mx-auto max-w-[1040px]">{slot}</div>
      </div>
    )
  return <div data-placement={placement}>{slot}</div>
}

/** Test helper: forget a dismissal made in memory. */
export function resetAdsForTests() {
  memoryHidden = false
}
