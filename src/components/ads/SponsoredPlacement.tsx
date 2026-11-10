"use client"

import { useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { SponsoredSlot } from "@/components/pokefindr/SponsoredSlot"
import { pickBanner, type SponsorPlacement } from "@/config/banners"
import { cn } from "@/lib/utils"
import { track } from "@/lib/analytics"
import { usePlacementOn } from "./useAdPlacements"

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

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** The first focusable element after `el` in the page, else the last one before it: where focus goes when `el` goes away. */
function focusAfter(el: HTMLElement): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !el.contains(x) && !x.closest("[hidden], [inert]"))
  const after = all.find((x) => el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)
  return after ?? all.filter((x) => el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING).at(-1) ?? null
}

/**
 * `listItem`: render as an <li>, so a list gets an item only when a card
 * shows (an empty one would be read as a blank place).
 */
export function SponsoredPlacement({ placement, className, listItem = false }: { placement: SponsorPlacement; className?: string; listItem?: boolean }) {
  const t = useTranslations("ads")
  const hidden = useAdsHidden()
  // An admin can switch a placement off (#159).
  const on = usePlacementOn(placement)
  const ref = useRef<HTMLElement>(null)
  // Picked once per view, in the browser.
  const [banner] = useState(() => (typeof window === "undefined" ? null : pickBanner(placement)))
  if (hidden || on !== true || !banner || !banner.href) return null
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
          // The dismiss button goes away with the card: move focus on instead of losing it to the page.
          const next = ref.current ? focusAfter(ref.current) : null
          hideAds()
          next?.focus()
          toast(t("hidden"), { description: t("hiddenBody") })
        }}
        onFollow={() => track("sponsored_click", { placement, banner: banner.id })}
        className={strip ? undefined : className}
      />
    </>
  )
  // The landing strip is a band between sections, like the prototype's.
  if (strip)
    return (
      <div ref={ref as React.RefObject<HTMLDivElement>} data-placement={placement} className={cn("border-t border-border px-6 py-8", className)}>
        <div className="mx-auto max-w-[1040px]">{slot}</div>
      </div>
    )
  if (listItem)
    return (
      <li ref={ref as React.RefObject<HTMLLIElement>} data-placement={placement}>
        {slot}
      </li>
    )
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} data-placement={placement}>
      {slot}
    </div>
  )
}

/** Test helper: forget a dismissal made in memory. */
export function resetAdsForTests() {
  memoryHidden = false
}
