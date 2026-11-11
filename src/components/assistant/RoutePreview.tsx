"use client"

import { Component, useState, useSyncExternalStore, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { MapIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { hasWebGL } from "@/lib/map/webgl"
import { useStreetRoute } from "@/components/map/useStreetRoute"
import { useDistance } from "@/i18n/useDistance"

const Placeholder = () => <div aria-hidden className="h-[180px] w-full animate-pulse bg-muted motion-reduce:animate-none" />

const RoutePreviewMap = dynamic(() => import("./RoutePreviewMap"), { ssr: false, loading: Placeholder })

const noSubscribe = () => () => {}

/** A preview that can't load its code or whose map crashes just goes away: the card keeps its stop list, and the chat keeps working. */
class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error("[assistant] the route preview failed", error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

interface RoutePreviewProps {
  ids: readonly string[]
  /**
   * Open without asking: the conversation's newest route. Older route cards
   * show a button instead, so a long (or restored) chat doesn't load a map
   * and a route request for every card, which would use up the `route` rate
   * limit and the browser's WebGL contexts.
   */
  autoOpen: boolean
}

/**
 * A small map of an assistant route inside its card (#349), so the viewer
 * sees it without leaving the chat: the line along the streets with the
 * numbered stops, and the drive's time and distance under it. Without
 * WebGL, or when the route can't be loaded, nothing shows and the card keeps
 * its list of stops.
 */
export function RoutePreview({ ids, autoOpen }: RoutePreviewProps) {
  const t = useTranslations("assistant.cards")
  // False on the server and in the first render, so hydration matches.
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, () => false)
  const [asked, setAsked] = useState(false)
  if (!webgl) return null
  if (!autoOpen && !asked)
    return (
      <div className="border-b border-border px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsked(true)}>
          <MapIcon className="size-3.5" aria-hidden />
          {t("showPreview")}
        </Button>
      </div>
    )
  return (
    <PreviewBoundary>
      <OpenPreview ids={ids} />
    </PreviewBoundary>
  )
}

function OpenPreview({ ids }: { ids: readonly string[] }) {
  const t = useTranslations("assistant.cards")
  const { distance } = useDistance()
  const state = useStreetRoute(ids)
  if (state.status === "gone" || state.status === "failed") return null
  const route = state.status === "ready" ? state.route : null
  return (
    <figure aria-label={t("preview")} className="m-0 border-b border-border">
      {route ? (
        <div className="h-[180px] w-full">
          <RoutePreviewMap route={route} />
        </div>
      ) : (
        <Placeholder />
      )}
      {route && (
        <figcaption className="px-3 py-1.5 text-caption text-muted-foreground">
          {route.routed && route.minutes !== null ? t("drive", { minutes: route.minutes, distance: distance(route.miles) }) : t("straightPreview")}
          {/* The map numbers the stops it found; the list below numbers them all. */}
          {state.status === "ready" && state.skipped && <span className="block">{t("previewSkipped")}</span>}
        </figcaption>
      )}
    </figure>
  )
}
