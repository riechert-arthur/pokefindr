import type { PaddingOptions } from "./engine"

/** Matches Tailwind's `sm`: below it, the map panel sits at the bottom. */
const DESKTOP = "(min-width: 640px)"
/** The phone panel's max height, as a share of the map's (MapPanel's max-h-[55%]). */
export const PANEL_MAX_SHARE = 0.55
/** The phone panel with only the search box and chips, before it's measured. */
const PANEL_MIN_H = 110

/**
 * Padding for fitting the map to a place, state or radius, so it lands
 * beside the panel (MapPanel) rather than under it, as the prototype's
 * panelPadding: right of the 360px column on desktop, above the bottom
 * panel on phones.
 */
export function cameraPadding(container?: HTMLElement | null, { sheet = false }: { sheet?: boolean } = {}): Required<PaddingOptions> {
  if (typeof window === "undefined" || window.matchMedia(DESKTOP).matches) return { top: 40, bottom: 60, left: 400, right: 60 }
  const panel = parseFloat(container?.style.getPropertyValue("--map-panel-h") ?? "") || 0
  const height = container?.clientHeight ?? window.innerHeight
  // `sheet`: a list (results, details) opens in the panel right after this
  // fit and grows it to its 55% cap, so reserve the cap, not its height now.
  // Otherwise the panel is about as tall as it is (search and chips).
  const bottom = sheet ? Math.max(panel, Math.round(height * PANEL_MAX_SHARE)) : Math.max(panel, PANEL_MIN_H)
  return { top: 60, bottom: bottom + 16, left: 30, right: 30 }
}
