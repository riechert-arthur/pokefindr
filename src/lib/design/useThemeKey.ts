import { useSyncExternalStore } from "react"

/**
 * A string that changes whenever the theme on <html> changes (its class or
 * data-theme). Inline styles aren't watched: scroll locks and other libraries
 * set them often, and theme libraries switch themes with the class. Use it as a memo dependency for anything built from
 * `readTokens`, so colors are re-read after the new theme is applied.
 *
 * This watches the DOM rather than a theme library's state on purpose: a
 * library like next-themes updates its state before it swaps the class, so
 * reading tokens on that render would still get the old theme's colors.
 */
export function useThemeKey(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  })
  return () => observer.disconnect()
}

function getSnapshot(): string {
  const html = document.documentElement
  return `${html.className}|${html.dataset.theme ?? ""}`
}

function getServerSnapshot(): string {
  return ""
}

/**
 * Whether the dark theme is applied to <html>. Reads the same class as
 * useThemeKey, so it changes in the same render as the token colors.
 */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, isDarkSnapshot, () => false)
}

function isDarkSnapshot(): boolean {
  return document.documentElement.classList.contains("dark")
}
