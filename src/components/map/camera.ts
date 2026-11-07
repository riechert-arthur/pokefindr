import type { PaddingOptions } from "./engine"

/** Matches Tailwind's `sm`: below it, the map panel sits at the bottom. */
const DESKTOP = "(min-width: 640px)"

/**
 * Padding for fitting the map to a place, state or radius, so it lands
 * beside the panel (MapPanel) rather than under it, as the prototype's
 * panelPadding: right of the 360px column on desktop, above the bottom
 * panel on phones.
 */
export function cameraPadding(container?: HTMLElement | null): PaddingOptions {
  if (typeof window === "undefined" || window.matchMedia(DESKTOP).matches) return { top: 40, bottom: 60, left: 400, right: 60 }
  const panel = parseFloat(container?.style.getPropertyValue("--map-panel-h") ?? "") || 0
  const height = container?.clientHeight ?? window.innerHeight
  return { top: 60, bottom: Math.max(panel + 16, Math.round(height * 0.4)), left: 30, right: 30 }
}
